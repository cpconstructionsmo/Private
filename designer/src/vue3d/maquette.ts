/* La maquette 3D : des prismes droits (un contour en plan, une altitude de
   bas et de haut), dérivés du modèle comme le plan (ADR-0002, ADR-0006).
   Rien n'est enregistré : la 3D est une autre lecture du même Building
   Model, elle suit chaque modification.

   - Un mur est son contour en plan (onglets compris), extrudé de sa base à
     sa hauteur ; une ouverture le découpe : la bande du mur qui la contient
     ne garde que l'allège (sous l'appui) et le linteau (au-dessus).
   - Un mur de façade qui a un parement (enduit, bardage…) porte, sur sa
     face extérieure, une peau de cette matière (EPAISSEUR_PAREMENT) prise
     dans son épaisseur ; le sol d'une pièce prend son revêtement.
   - Une pièce peinte porte, contre ses murs, une fine peau de sa teinte
     (EPAISSEUR_PEINTURE), du sol au haut des murs, ouverte aux portes et
     fenêtres (allège et linteau restent peints).
   - L'ouverture est remplie : vitrage (fenêtres, baies), vantail plein
     (portes), tablier (garage) ; rien pour un passage.
   - Chaque niveau a son plancher (le contour extérieur de sa maçonnerie)
     et le sol de chaque pièce fermée.
   - La toiture (building/toiture.ts) : chaque pan est une plaque inclinée
     de l'épaisseur d'une couverture, les pignons montent jusqu'au toit, un
     toit-terrasse est une dalle et son acrotère. */
import type { Floor, Mm, Opening, Point, Project, Roof } from '../model/types';
import { planDuNiveau } from '../building/plan';
import { toitureDuNiveau, type Point3 } from '../building/toiture';
import { blocs, formeDe, versPlan } from '../building/mobilier';
import { finitionAmenagement } from '../catalogue/amenagements';
import { geometrieEscalier, hauteurAFranchir, tremiesDuNiveau } from '../building/escalier';
import { decalagesFaces, mursDroits, type MurDroit } from '../building/murs';
import { difference, intersection } from '../geometry/booleen';
import { aireSignee, type Anneau, type Polygone } from '../geometry/polygon';
import { decalerPolyligne } from '../geometry/decalage';
import { positionDansAnneau } from '../geometry/predicats';
import { ajouter, multiplier, normaleGauche, normaliser, soustraire } from '../geometry/vecteur';

export type Matiere = 'mur' | 'cloison' | 'plancher' | 'sol' | 'vitrage' | 'porte' | 'garage'
  | 'tuile' | 'ardoise' | 'zinc' | 'bac_acier' | 'vegetalise' | 'gravillons'
  | 'meuble' | 'tissu' | 'linge' | 'plan_travail' | 'sanitaire' | 'electromenager' | 'inox' | 'escalier' | 'parement' | 'peinture' | 'amenagement' | 'cloture';

/** la matière dessinée d'une couverture */
export const COUVERTURES: Record<Roof['covering'], Matiere> = { tile: 'tuile', slate: 'ardoise', zinc: 'zinc', steel: 'bac_acier', green: 'vegetalise', gravel: 'gravillons' };

export interface Prisme {
  contour: Anneau;
  trous?: readonly Anneau[];
  /** altitudes du bas et du haut (mm), depuis le zéro du projet */
  z0: Mm; z1: Mm;
  matiere: Matiere;
  /** l'objet du modèle d'où vient le prisme (pour le choisir dans la vue) */
  objet?: string;
  niveau: string;
  /** le matériau du catalogue (parement, sol) qui l'habille, s'il y en a un */
  finition?: string;
}

/** une plaque : un polygone plan quelconque dans l'espace (pan de toit, pignon),
    épaissi de « decalage » (le dessous = le dessus + decalage) */
export interface Plaque {
  dessus: Point3[];
  decalage: Point3;
  matiere: Matiere;
  objet?: string;
  niveau: string;
}

export interface Maquette {
  prismes: Prisme[];
  plaques: Plaque[];
  boite: { xmin: Mm; ymin: Mm; zmin: Mm; xmax: Mm; ymax: Mm; zmax: Mm } | null;
}

/** épaisseur dessinée d'un plancher (mm) : un ordre de grandeur pour la vue, pas une donnée de structure */
export const EPAISSEUR_PLANCHER = 200;
/** épaisseur dessinée d'une couverture (mm), comptée verticalement sous le pan */
export const EPAISSEUR_COUVERTURE = 200;
/** épaisseur dessinée d'un parement (enduit, bardage), prise dans celle du mur (mm) */
export const EPAISSEUR_PAREMENT = 20;
/** épaisseur dessinée d'une peinture murale (mm) : juste assez pour passer devant la face du mur */
export const EPAISSEUR_PEINTURE = 3;
/** épaisseur d'un vitrage, d'un vantail, d'un tablier dans la vue (mm) */
const EPAISSEUR_REMPLISSAGE: Record<'vitrage' | 'porte' | 'garage', Mm> = { vitrage: 24, porte: 40, garage: 50 };

/** la bande du plan qui couvre l'axe du mur de t0 à t1 (perpendiculairement, bien au-delà des faces) */
function bande(w: MurDroit, t0: Mm, t1: Mm): Polygone {
  const u = normaliser(soustraire(w.axis.b, w.axis.a)), n = normaleGauche(u), L = 4 * w.thickness + 1_000;
  const P = (t: Mm, k: Mm) => ajouter(ajouter(w.axis.a, multiplier(u, t)), multiplier(n, k));
  return { contour: [P(t0, -L), P(t1, -L), P(t1, L), P(t0, L)] };
}

const remplissage = (o: Opening): 'vitrage' | 'porte' | 'garage' | null =>
  o.kind === 'void' ? null : o.kind === 'door' ? 'porte' : o.kind === 'garage_door' ? 'garage' : 'vitrage';

/** la peau extérieure d'un mur de façade : la bande de EPAISSEUR_PAREMENT le long de la face qui donne
    dehors (celle dont un point, juste au-delà, sort de la maçonnerie du niveau), prolongée au-delà des bouts
    (l'onglet d'un angle la coupe) ; null si aucune face ne donne dehors */
function peauExterieure(w: MurDroit, exterieurs: readonly Anneau[]): Polygone | null {
  const u = normaliser(soustraire(w.axis.b, w.axis.a)), n = normaleGauche(u), F = decalagesFaces(w);
  const L = Math.hypot(w.axis.b.x - w.axis.a.x, w.axis.b.y - w.axis.a.y), m = ajouter(w.axis.a, multiplier(u, L / 2));
  const dehors = (k: number) => !exterieurs.some(r => positionDansAnneau(ajouter(m, multiplier(n, k)), r) !== 'dehors');
  const cote = dehors(F.gauche + 30) ? 1 : dehors(F.droite - 30) ? -1 : 0;
  if (!cote) return null;
  const face = cote > 0 ? F.gauche : F.droite, k0 = face - cote * EPAISSEUR_PAREMENT, k1 = face + cote * 1_000;
  const P = (t: Mm, k: Mm) => ajouter(ajouter(w.axis.a, multiplier(u, t)), multiplier(n, k));
  const M = 4 * w.thickness + 1_000;
  return { contour: [P(-M, k0), P(L + M, k0), P(L + M, k1), P(-M, k1)] };
}

function murs(f: Floor, prismes: Prisme[]): void {
  const plan = planDuNiveau(f), contours = new Map(plan.murs.map(m => [m.id, m.contour]));
  /* le dehors du niveau : hors des contours extérieurs de sa maçonnerie */
  const exterieurs = plan.maconnerie.map(m => m.contour);
  const ouvertures = Object.values(f.objects).filter((o): o is Opening => o.type === 'opening');
  for (const w of mursDroits(f)) {
    const C = contours.get(w.id);
    if (!C) continue;
    const z0 = f.elevation + w.baseOffset, z1 = z0 + w.height, matiere: Matiere = w.role === 'partition' ? 'cloison' : 'mur';
    const O = ouvertures.filter(o => o.hostWallId === w.id);
    const mur: Polygone[] = [{ contour: C }];
    const bandes = O.map(o => bande(w, o.offset - o.width / 2, o.offset + o.width / 2));
    /* un parement : la peau du côté extérieur ; le reste du mur garde sa matière */
    const peau = w.finish && w.role === 'exterior' ? peauExterieure(w, exterieurs) : null;
    const poser = (P: Polygone[], a: number, b: number) => {
      const parts = peau ? [...difference(P, [peau]).map(q => ({ q, m: matiere, fin: undefined })), ...intersection(P, [peau]).map(q => ({ q, m: 'parement' as Matiere, fin: w.finish }))]
        : P.map(q => ({ q, m: matiere, fin: undefined }));
      for (const { q, m, fin } of parts) prismes.push({ contour: q.contour, ...(q.trous?.length ? { trous: q.trous } : {}), z0: a, z1: b, matiere: m, objet: w.id, niveau: f.id, ...(fin ? { finition: fin } : {}) });
    };
    /* le mur plein, hors des bandes des ouvertures */
    poser(bandes.length ? difference(mur, bandes) : mur, z0, z1);
    O.forEach((o, i) => {
      const morceaux = intersection(mur, [bandes[i]!]);
      const bas = z0 + o.sill, haut = Math.min(z1, bas + o.height);
      if (bas > z0) poser(morceaux, z0, bas);              // allège
      if (haut < z1) poser(morceaux, haut, z1);            // linteau
      /* le remplissage, au milieu de l'épaisseur */
      const m = remplissage(o);
      if (!m) return;
      const u = normaliser(soustraire(w.axis.b, w.axis.a)), n = normaleGauche(u), F = decalagesFaces(w);
      const milieu = (F.gauche + F.droite) / 2, e = EPAISSEUR_REMPLISSAGE[m] / 2;
      const P = (t: Mm, k: Mm): Point => ajouter(ajouter(w.axis.a, multiplier(u, t)), multiplier(n, milieu + k));
      const t0 = o.offset - o.width / 2, t1 = o.offset + o.width / 2;
      prismes.push({ contour: [P(t0, -e), P(t1, -e), P(t1, e), P(t0, e)], z0: bas, z1: haut, matiere: m, objet: o.id, niveau: f.id });
    });
  }
}

/* la peinture des pièces : un anneau de EPAISSEUR_PEINTURE contre les faces des murs, ouvert au droit des
   ouvertures (la bande d'une ouverture ne dépasse son mur que de 5 cm : la face d'en face n'est pas touchée) */
function peintures(f: Floor, prismes: Prisme[]): void {
  const plan = planDuNiveau(f), W = mursDroits(f);
  const haut = Math.max(0, ...W.map(w => w.baseOffset + w.height));
  if (!haut) return;
  const parId = new Map(W.map(w => [w.id, w]));
  const ouv = Object.values(f.objects).filter((o): o is Opening => o.type === 'opening' && parId.has(o.hostWallId)).map(o => {
    const w = parId.get(o.hostWallId)!, u = normaliser(soustraire(w.axis.b, w.axis.a)), n = normaleGauche(u), F = decalagesFaces(w);
    const P = (t: Mm, k: Mm) => ajouter(ajouter(w.axis.a, multiplier(u, t)), multiplier(n, k));
    const t0 = o.offset - o.width / 2, t1 = o.offset + o.width / 2, k0 = F.droite - 50, k1 = F.gauche + 50;
    return { o, bande: { contour: [P(t0, k0), P(t1, k0), P(t1, k1), P(t0, k1)] } as Polygone };
  });
  for (const z of plan.zones) {
    const id = z.piece?.wallFinish;
    if (!id) continue;
    const C = z.polygone.contour, A = Math.abs(aireSignee(C));
    /* le décalage vers l'intérieur : des deux sens, celui qui rétrécit la pièce */
    const d = [EPAISSEUR_PEINTURE, -EPAISSEUR_PEINTURE].map(e => decalerPolyligne(C, e, true)).find(D => Math.abs(aireSignee(D)) < A);
    if (!d) continue;
    const anneau = difference([{ contour: C }], [{ contour: d }]);
    const poser = (P: Polygone[], z0: Mm, z1: Mm) => {
      for (const q of P) prismes.push({ contour: q.contour, ...(q.trous?.length ? { trous: q.trous } : {}), z0: f.elevation + z0, z1: f.elevation + z1, matiere: 'peinture', objet: z.piece!.id, niveau: f.id, finition: id });
    };
    poser(ouv.length ? difference(anneau, ouv.map(x => x.bande)) : anneau, 0, haut);
    for (const { o, bande } of ouv) {
      const B = intersection(anneau, [bande]);
      if (!B.length) continue;
      if (o.sill > 0) poser(B, 0, o.sill);                                  // allège
      if (o.sill + o.height < haut) poser(B, o.sill + o.height, haut);      // linteau
    }
  }
}

function planchers(projet: Project, f: Floor, prismes: Prisme[]): void {
  const plan = planDuNiveau(f);
  /* les trémies des escaliers qui arrivent ici sont ouvertes dans le plancher et le sol */
  const T = tremiesDuNiveau(projet, f).map(t => ({ contour: t.contour }));
  const ouvrir = (P: Polygone[]) => (T.length ? difference(P, T) : P);
  for (const p of ouvrir(plan.maconnerie.map(m => ({ contour: m.contour }))))
    prismes.push({ contour: p.contour, ...(p.trous?.length ? { trous: p.trous } : {}), z0: f.elevation - EPAISSEUR_PLANCHER, z1: f.elevation, matiere: 'plancher', niveau: f.id });
  /* le sol fini des pièces, à peine au-dessus du plancher (lisible, sans scintillement) */
  for (const z of plan.zones) for (const p of ouvrir([{ contour: z.polygone.contour }]))
    prismes.push({ contour: p.contour, ...(p.trous?.length ? { trous: p.trous } : {}), z0: f.elevation, z1: f.elevation + 5, matiere: 'sol', ...(z.piece ? { objet: z.piece.id } : {}), niveau: f.id, ...(z.piece?.floorFinish ? { finition: z.piece.floorFinish } : {}) });
}

/* les escaliers : chaque marche, pleine depuis le sol du départ (un escalier maçonné ou un limon caché) */
function escaliers(projet: Project, f: Floor, prismes: Prisme[]): void {
  for (const o of Object.values(f.objects)) {
    if (o.type !== 'stair') continue;
    for (const m of geometrieEscalier(o, hauteurAFranchir(projet, f)).marches)
      prismes.push({ contour: m.contour, z0: f.elevation, z1: f.elevation + m.z, matiere: 'escalier', objet: o.id, niveau: f.id });
  }
}

function toiture(f: Floor, prismes: Prisme[], plaques: Plaque[]): void {
  const r = toitureDuNiveau(f), roof = Object.values(f.objects).find((o): o is Roof => o.type === 'roof');
  if (!r?.ok || !roof) return;
  const m = COUVERTURES[roof.covering];
  for (const t of r.toitures) {
    for (const p of t.pans) plaques.push({ dessus: p.contour.map(q => ({ ...q, z: p.plan.a * q.x + p.plan.b * q.y + p.plan.c })), decalage: { x: 0, y: 0, z: -EPAISSEUR_COUVERTURE }, matiere: m, objet: roof.id, niveau: f.id });
    /* un pignon s'arrête sous la couverture (sinon son chant et le dessus du toit se disputent le même plan) */
    for (const g of t.pignons) {
      const z0 = Math.min(...g.points.map(q => q.z));
      const dessus = g.points.map(q => (q.z > z0 + 1 ? { ...q, z: Math.max(z0, q.z - EPAISSEUR_COUVERTURE) } : q));
      plaques.push({ dessus, decalage: { ...g.vers, z: 0 }, matiere: 'mur', objet: roof.id, niveau: f.id });
    }
    if (t.terrasse) {
      prismes.push({ contour: t.terrasse.dalle, z0: t.terrasse.z0, z1: t.terrasse.z1, matiere: m, objet: roof.id, niveau: f.id });
      for (const a of t.terrasse.acrotere) prismes.push({ contour: a.contour, ...(a.trous?.length ? { trous: a.trous } : {}), z0: t.terrasse.z1, z1: t.terrasse.zAcrotere, matiere: 'mur', objet: roof.id, niveau: f.id });
    }
  }
}

/* les aménagements extérieurs : surfaces posées sur le terrain (la terrasse à son niveau fini, en dalle), clôtures
   en relief le long de leur ligne. Le terrain de la vue est à −3 cm : les surfaces passent juste au-dessus. */
function amenagements(f: Floor, prismes: Prisme[]): void {
  for (const o of Object.values(f.objects)) {
    if (o.type !== 'landscape') continue;
    if (o.kind === 'fence') {
      const e = (finitionAmenagement(o.finish)?.epaisseur ?? 40) / 2;
      const n = o.closed ? o.points.length : o.points.length - 1;
      for (let i = 0; i < n; i++) {
        const a = o.points[i]!, b = o.points[(i + 1) % o.points.length]!, u = normaliser(soustraire(b, a)), v = multiplier(normaleGauche(u), e), w = multiplier(u, e);
        /* chaque tronçon déborde d'une demi-épaisseur : les angles se referment */
        const A = soustraire(a, w), B = ajouter(b, w);
        prismes.push({ contour: [soustraire(A, v), soustraire(B, v), ajouter(B, v), ajouter(A, v)], z0: f.elevation - 30, z1: f.elevation + o.height, matiere: 'cloture', objet: o.id, niveau: f.id, finition: o.finish });
      }
      continue;
    }
    const haut = o.kind === 'terrace' ? -o.height : o.kind === 'green' ? -22 : -12;
    const bas = o.kind === 'terrace' ? haut - 150 : -30;
    prismes.push({ contour: o.points.map(q => ({ ...q })), z0: f.elevation + bas, z1: f.elevation + haut, matiere: 'amenagement', objet: o.id, niveau: f.id, finition: o.finish });
  }
}

/* le mobilier : ses blocs (building/mobilier.ts), tournés et posés sur le sol du niveau */
function meubles(f: Floor, prismes: Prisme[]): void {
  for (const o of Object.values(f.objects)) {
    if (o.type !== 'furniture') continue;
    for (const b of blocs(formeDe(o), o.width, o.depth, o.height)) {
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, rx = (b.x1 - b.x0) / 2, ry = (b.y1 - b.y0) / 2;
      const local = b.rond ? Array.from({ length: 24 }, (_, i) => ({ x: cx + rx * Math.cos(i * Math.PI / 12), y: cy + ry * Math.sin(i * Math.PI / 12) }))
        : [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];
      prismes.push({ contour: local.map(q => versPlan(o, q)), z0: f.elevation + b.z0, z1: f.elevation + b.z1, matiere: b.matiere, objet: o.id, niveau: f.id });
    }
  }
}

/** la maquette d'un projet ; « jusqu'à » : ne montrer que les niveaux jusqu'à celui-ci (inclus) ;
    « toiture » : la montrer ou non (par défaut, oui) */
export function maquette(projet: Project, jusqua?: string, options: { toiture?: boolean } = {}): Maquette {
  const prismes: Prisme[] = [], plaques: Plaque[] = [];
  for (const b of projet.buildings) {
    const F = [...b.floors].sort((a, c) => a.elevation - c.elevation);
    const k = jusqua ? F.findIndex(f => f.id === jusqua) : -1;
    for (const f of k >= 0 ? F.slice(0, k + 1) : F) {
      planchers(projet, f, prismes); murs(f, prismes); peintures(f, prismes); amenagements(f, prismes); meubles(f, prismes); escaliers(projet, f, prismes);
      if (options.toiture !== false) toiture(f, prismes, plaques);
    }
  }
  let boite: Maquette['boite'] = null;
  const etendre = (x: number, y: number, z0: number, z1: number) => {
    boite = boite ? { xmin: Math.min(boite.xmin, x), ymin: Math.min(boite.ymin, y), zmin: Math.min(boite.zmin, z0), xmax: Math.max(boite.xmax, x), ymax: Math.max(boite.ymax, y), zmax: Math.max(boite.zmax, z1) }
      : { xmin: x, ymin: y, zmin: z0, xmax: x, ymax: y, zmax: z1 };
  };
  for (const p of prismes) for (const q of p.contour) etendre(q.x, q.y, p.z0, p.z1);
  for (const p of plaques) for (const q of p.dessus) etendre(q.x, q.y, Math.min(q.z, q.z + p.decalage.z), Math.max(q.z, q.z + p.decalage.z));
  return { prismes, plaques, boite };
}

/** le volume d'un prisme (mm³) : pour les contrôles */
export function volume(p: Prisme): number {
  const a = (r: Anneau) => { let s = 0; for (let i = 0; i < r.length; i++) { const u = r[i]!, v = r[(i + 1) % r.length]!; s += u.x * v.y - v.x * u.y } return Math.abs(s) / 2 };
  return (a(p.contour) - (p.trous ?? []).reduce((s, t) => s + a(t), 0)) * (p.z1 - p.z0);
}
