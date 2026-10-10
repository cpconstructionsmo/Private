/* La maquette 3D : des prismes droits (un contour en plan, une altitude de
   bas et de haut), dérivés du modèle comme le plan (ADR-0002, ADR-0006).
   Rien n'est enregistré : la 3D est une autre lecture du même Building
   Model, elle suit chaque modification.

   - Un mur est son contour en plan (onglets compris), extrudé de sa base à
     sa hauteur ; une ouverture le découpe : la bande du mur qui la contient
     ne garde que l'allège (sous l'appui) et le linteau (au-dessus).
   - Un mur de façade qui a un parement (enduit, bardage…) porte, sur sa
     face extérieure, une peau de cette matière (EPAISSEUR_PAREMENT) prise
     dans son épaisseur ; un décor (finishZones) en habille une partie d'un
     autre parement. Le sol d'une pièce prend son revêtement.
   - Une pièce peinte porte, contre ses murs, une fine peau de sa teinte
     (EPAISSEUR_PEINTURE), du sol au haut des murs, ouverte aux portes et
     fenêtres (allège et linteau restent peints).
   - L'ouverture est remplie : vitrage (fenêtres, baies), vantail plein
     (portes), tablier (garage) ; rien pour un passage.
   - Chaque niveau a son plancher (le contour extérieur de sa maçonnerie)
     et le sol de chaque pièce fermée.
   - Le relief (building/terrassement.ts) : le terrain fini de la parcelle
     (terrain naturel, plateformes à leur niveau, talus) en une nappe de
     triangles, quand le relevé et l'altitude du ±0,00 le permettent.
   - La toiture (building/toiture.ts) : chaque pan est une plaque inclinée
     de l'épaisseur d'une couverture, les pignons montent jusqu'au toit, un
     toit-terrasse est une dalle et son acrotère ; les lucarnes
     (building/lucarnes.ts) posent sur leur pan façade, jouées et toiture. */
import type { Floor, Mm, Opening, Point, Project, Roof } from '../model/types';
import { planDuNiveau } from '../building/plan';
import { toitureDuNiveau, type Point3 } from '../building/toiture';
import { fenetresDeToit } from '../building/fenetres-toit';
import { eauxPluviales } from '../building/eaux-pluviales';
import { lucarnesDuNiveau } from '../building/lucarnes';
import { blocs, formeDe, versPlan } from '../building/mobilier';
import { finitionAmenagement } from '../catalogue/amenagements';
import { choixOuvrage, type OuvrageMenuiserie } from '../catalogue/menuiseries';
import { geometrieEscalier, hauteurAFranchir, tremiesDuNiveau } from '../building/escalier';
import { decalagesFaces, mursDroits, ouvertureBatie, type MurDroit } from '../building/murs';
import { parcelleDuProjet } from '../building/terrain';
import { sectionPoteau, empriseDePoutre } from '../building/structure';
import { plateformesDuProjet, reliefTerrain } from '../building/terrassement';
import { difference, intersection } from '../geometry/booleen';
import { aireSignee, type Anneau, type Polygone } from '../geometry/polygon';
import { decalerPolyligne } from '../geometry/decalage';
import { positionDansAnneau } from '../geometry/predicats';
import { ajouter, multiplier, normaleGauche, normaliser, soustraire } from '../geometry/vecteur';

export type Matiere = 'mur' | 'cloison' | 'plancher' | 'sol' | 'vitrage' | 'porte' | 'garage' | 'menuiserie' | 'appui'
  | 'tuile' | 'ardoise' | 'zinc' | 'bac_acier' | 'vegetalise' | 'gravillons'
  | 'meuble' | 'tissu' | 'linge' | 'plan_travail' | 'sanitaire' | 'electromenager' | 'inox' | 'escalier' | 'parement' | 'peinture' | 'amenagement' | 'cloture' | 'tronc' | 'feuillage' | 'terrain';

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
  /** le matériau du catalogue qui l'habille (le parement des façades, pour un pignon ou une lucarne) */
  finition?: string;
  /** posée sur une autre plaque (une fenêtre de toit sur son pan) : le dessus de ce support, pour que les vues
      la dessinent juste après lui, et non derrière (le peintre rangerait sinon le grand pan devant elle) */
  support?: Point3[];
}

export interface Maquette {
  prismes: Prisme[];
  plaques: Plaque[];
  boite: { xmin: Mm; ymin: Mm; zmin: Mm; xmax: Mm; ymax: Mm; zmax: Mm } | null;
  /** le relief du terrain fini : des triangles (x, y, z en mm, à la suite), et son point le plus bas ; absent sans relevé */
  relief?: { triangles: number[]; zmin: Mm; zmax: Mm };
}

const reliefs = new WeakMap<object, { P: readonly object[]; R: ReturnType<typeof reliefTerrain> }>();
/* le relief : la grille du terrain fini (NGF) ramenée au zéro du projet (le ±0,00 du niveau qui porte la parcelle) */
function relief(projet: Project): Maquette['relief'] {
  const T = parcelleDuProjet(projet);
  if (!T || T.plot.groundFloorNgf === undefined) return undefined;
  /* la maquette se refait à chaque modification : le relief, lui, attend que la parcelle ou une plateforme change */
  const P = plateformesDuProjet(projet), k = reliefs.get(T.plot);
  const R = k && k.P.length === P.length && k.P.every((o, i) => o === P[i]) ? k.R : reliefTerrain(T.plot, P);
  reliefs.set(T.plot, { P, R });
  if (!R) return undefined;
  const ngf0 = T.plot.groundFloorNgf, e0 = T.niveau.elevation, w = R.nx + 1;
  const Z = (i: number, j: number) => Math.round((R.z[j * w + i]! - ngf0) * 1000) + e0;
  const out: number[] = [];
  const s = (i: number, j: number) => out.push(R.x0 + i * R.px, R.y0 + j * R.py, Z(i, j));
  for (let j = 0; j < R.ny; j++) for (let i = 0; i < R.nx; i++) {
    if (!R.dedans[j * R.nx + i]) continue;
    s(i, j); s(i + 1, j); s(i + 1, j + 1);
    s(i, j); s(i + 1, j + 1); s(i, j + 1);
  }
  return { triangles: out, zmin: Math.round((R.zmin - ngf0) * 1000) + e0, zmax: Math.round((R.zmax - ngf0) * 1000) + e0 };
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

/** les menuiseries dessinées (mm) : profil du dormant et des ouvrants, leur épaisseur ; l'appui (saillie, hauteur, débord latéral) */
export const MENUISERIE_3D = { dormant: 60, ouvrant: 50, profondeur: 70, appuiSaillie: 40, appuiHauteur: 50, appuiDebord: 30 } as const;

/** le nombre de vantaux dessinés : celui de l'ouverture, sinon l'usage (fenêtre de 1 m et plus, porte-fenêtre, baie : deux) */
export const vantauxDessines = (o: Opening): number => o.leaves ?? (o.kind === 'window' ? (o.width >= 1_000 ? 2 : 1) : o.kind === 'french_window' || o.kind === 'bay' ? 2 : 1);

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

/** les teintes choisies des menuiseries (identifiants de catalogue/menuiseries.ts), par remplissage ; absentes : couleurs par défaut */
type Teintes = Partial<Record<'vitrage' | 'porte' | 'garage', string>>;
function teintesDuProjet(projet: Project): Teintes {
  const t = (q: OuvrageMenuiserie) => choixOuvrage(projet.dossier, q).teinte;
  const v = t('menuiseries'), po = t('porteEntree'), g = t('porteGarage');
  return { ...(v ? { vitrage: v } : {}), ...(po ? { porte: po } : {}), ...(g ? { garage: g } : {}) };
}

function murs(f: Floor, prismes: Prisme[], teintes: Teintes = {}): void {
  const plan = planDuNiveau(f), contours = new Map(plan.murs.map(m => [m.id, m.contour]));
  /* le dehors du niveau : hors des contours extérieurs de sa maçonnerie */
  const exterieurs = plan.maconnerie.map(m => m.contour);
  const ouvertures = Object.values(f.objects).filter((o): o is Opening => o.type === 'opening' && ouvertureBatie(o));
  for (const w of mursDroits(f)) {
    const C = contours.get(w.id);
    if (!C) continue;
    const z0 = f.elevation + w.baseOffset, z1 = z0 + w.height, matiere: Matiere = w.role === 'partition' ? 'cloison' : 'mur';
    const O = ouvertures.filter(o => o.hostWallId === w.id);
    const mur: Polygone[] = [{ contour: C }];
    const bandes = O.map(o => bande(w, o.offset - o.width / 2, o.offset + o.width / 2));
    /* un parement : la peau du côté extérieur ; le reste du mur garde sa matière. Un décor (un autre
       parement sur une partie de la façade) prend sa part de la peau ; un décor qui touche un bout du
       mur va jusqu'à l'onglet de l'angle */
    const decors = w.role === 'exterior' ? (w.finishZones ?? []) : [];
    const peau = (w.finish || decors.length) && w.role === 'exterior' ? peauExterieure(w, exterieurs) : null;
    const habits: { P: Polygone[]; fin: string }[] = [];
    if (peau) {
      const Lw = Math.hypot(w.axis.b.x - w.axis.a.x, w.axis.b.y - w.axis.a.y), M = 4 * w.thickness + 1_000;
      const B = decors.map(z => bande(w, z.from <= 1 ? -M : z.from, z.to >= Lw - 1 ? Lw + M : z.to));
      decors.forEach((z, i) => habits.push({ P: intersection([peau], [B[i]!]), fin: z.finish }));
      if (w.finish) habits.push({ P: B.length ? difference([peau], B) : [peau], fin: w.finish });
    }
    const habille = habits.flatMap(x => x.P);
    const poser = (P: Polygone[], a: number, b: number) => {
      const parts = habille.length ? [...difference(P, habille).map(q => ({ q, m: matiere, fin: undefined as string | undefined })),
        ...habits.flatMap(x => intersection(P, x.P).map(q => ({ q, m: 'parement' as Matiere, fin: x.fin as string | undefined })))]
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
      /* la teinte choisie : le dormant et les ouvrants d'une baie, le panneau d'une porte pleine */
      const teinte = teintes[m === 'vitrage' ? 'vitrage' : m], fin = teinte ? { finition: teinte } : {};
      prismes.push({ contour: [P(t0, -e), P(t1, -e), P(t1, e), P(t0, e)], z0: bas, z1: haut, matiere: m, objet: o.id, niveau: f.id, ...(m !== 'vitrage' ? fin : {}) });
      /* la menuiserie autour du remplissage : le dormant, et pour un vitrage les ouvrants de chaque vantail
         (le vitrage reste entier derrière : ce sont des profils posés devant ses bords) */
      const M = MENUISERIE_3D, d = M.profondeur / 2;
      const barre = (a: Mm, b: Mm, z0: Mm, z1: Mm) => { if (b - a > 1 && z1 - z0 > 1) prismes.push({ contour: [P(a, -d), P(b, -d), P(b, d), P(a, d)], z0, z1, matiere: 'menuiserie', objet: o.id, niveau: f.id, ...fin }) };
      const c = M.dormant, seuil = o.kind === 'window';                    // une porte, une porte-fenêtre n'ont pas de traverse basse
      barre(t0, t0 + c, bas, haut); barre(t1 - c, t1, bas, haut); barre(t0 + c, t1 - c, haut - c, haut);
      if (seuil) barre(t0 + c, t1 - c, bas, bas + c);
      if (m === 'vitrage') {
        const n = vantauxDessines(o), l = (t1 - t0 - 2 * c) / n, r = M.ouvrant, zb = seuil ? bas + c : bas, zh = haut - c;
        for (let k = 0; k < n; k++) {
          const a = t0 + c + k * l, b = a + l;
          barre(a, a + r, zb, zh); barre(b - r, b, zb, zh); barre(a + r, b - r, zh - r, zh); barre(a + r, b - r, zb, zb + r);
        }
      }
      /* l'appui d'une fenêtre de façade : une pierre sous l'ouverture, qui déborde dehors et un peu de chaque côté */
      if (o.kind === 'window' && w.role === 'exterior') {
        const dehors = (k: number) => !exterieurs.some(r => positionDansAnneau(P(o.offset, k - milieu), r) !== 'dehors');
        const cote = dehors(F.gauche + 30) ? 1 : dehors(F.droite - 30) ? -1 : 0;
        if (cote) {
          const face = (cote > 0 ? F.gauche : F.droite) - milieu, A = M.appuiDebord;
          const k0 = face - cote * (F.gauche - F.droite) / 2, k1 = face + cote * M.appuiSaillie;
          prismes.push({ contour: [P(t0 - A, Math.min(k0, k1)), P(t1 + A, Math.min(k0, k1)), P(t1 + A, Math.max(k0, k1)), P(t0 - A, Math.max(k0, k1))],
            z0: bas - M.appuiHauteur, z1: bas, matiere: 'appui', objet: o.id, niveau: f.id });
        }
      }
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
  const ouv = Object.values(f.objects).filter((o): o is Opening => o.type === 'opening' && ouvertureBatie(o) && parId.has(o.hostWallId)).map(o => {
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
  /* pignons et lucarnes prennent le parement des façades du niveau (celui du premier mur extérieur qui en a un) */
  const parement = mursDroits(f).find(w => w.role === 'exterior' && w.finish)?.finish;
  const habille = parement ? { finition: parement } : {};
  for (const t of r.toitures) {
    /* l'épaisseur de la toiture (charpente et couverture) : au moins le talon, pour qu'elle repose sur l'arase */
    const ep = Math.max(EPAISSEUR_COUVERTURE, t.talon);
    for (const p of t.pans) plaques.push({ dessus: p.contour.map(q => ({ ...q, z: p.plan.a * q.x + p.plan.b * q.y + p.plan.c })), decalage: { x: 0, y: 0, z: -ep }, matiere: m, objet: roof.id, niveau: f.id });
    /* un pignon s'arrête sous la couverture (sinon son chant et le dessus du toit se disputent le même plan) */
    for (const g of t.pignons) {
      const z0 = Math.min(...g.points.map(q => q.z));
      const dessus = g.points.map(q => (q.z > z0 + 1 ? { ...q, z: Math.max(z0, q.z - ep) } : q));
      plaques.push({ dessus, decalage: { ...g.vers, z: 0 }, matiere: 'mur', objet: roof.id, niveau: f.id, ...habille });
    }
    if (t.terrasse) {
      prismes.push({ contour: t.terrasse.dalle, z0: t.terrasse.z0, z1: t.terrasse.z1, matiere: m, objet: roof.id, niveau: f.id });
      for (const a of t.terrasse.acrotere) prismes.push({ contour: a.contour, ...(a.trous?.length ? { trous: a.trous } : {}), z0: t.terrasse.z1, z1: t.terrasse.zAcrotere, matiere: 'mur', objet: roof.id, niveau: f.id });
    }
  }
  /* les lucarnes : leur toiture (couverture du toit, plus mince), leur façade et leurs jouées (épaissies vers
     l'intérieur), la fenêtre posée devant la façade */
  for (const { o, geo } of lucarnesDuNiveau(f)) {
    /* posée sur son pan : les vues (façades, coupes) la rangent juste devant lui, comme une fenêtre de toit */
    const E = 150, mt = geo.montee, tr = geo.travers, support = geo.pan.contour.map(q => ({ ...q, z: geo.pan.plan.a * q.x + geo.pan.plan.b * q.y + geo.pan.plan.c }));
    const base = { objet: o.id, niveau: f.id, support };
    for (const T of geo.toits) plaques.push({ dessus: T, decalage: { x: 0, y: 0, z: -EPAISSEUR_COUVERTURE / 2 }, matiere: m, ...base });
    plaques.push({ dessus: geo.facade, decalage: { x: mt.x * E, y: mt.y * E, z: 0 }, matiere: 'mur', ...base, ...habille });
    geo.joues.forEach((J, i) => { const s = i === 0 ? 1 : -1; plaques.push({ dessus: J, decalage: { x: tr.x * E * s, y: tr.y * E * s, z: 0 }, matiere: 'mur', ...base, ...habille }) });
    plaques.push({ dessus: geo.fenetre.map(q => ({ x: q.x - mt.x * 30, y: q.y - mt.y * 30, z: q.z })), decalage: { x: mt.x * 25, y: mt.y * 25, z: 0 }, matiere: 'vitrage', ...base });
  }
  /* les fenêtres de toit : un dormant sombre posé sur la couverture, son vitrage en retrait des bords */
  for (const { o, geo } of fenetresDeToit(f)) {
    const support = geo.pan.contour.map(q => ({ ...q, z: geo.pan.plan.a * q.x + geo.pan.plan.b * q.y + geo.pan.plan.c }));
    const n = geo.normale, k = (q: Point3, d: number): Point3 => ({ x: q.x + n.x * d, y: q.y + n.y * d, z: q.z + n.z * d });
    plaques.push({ dessus: geo.coins.map(q => k(q, CHASSIS_TOIT.saillie)), decalage: { x: -n.x * CHASSIS_TOIT.saillie, y: -n.y * CHASSIS_TOIT.saillie, z: -n.z * CHASSIS_TOIT.saillie }, matiere: 'ardoise', objet: o.id, niveau: f.id, support });
    const [c0, c1, , c3] = geo.coins as [Point3, Point3, Point3, Point3];
    const unit = (a: Point3, b: Point3) => { const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1; return { x: (b.x - a.x) / L, y: (b.y - a.y) / L, z: (b.z - a.z) / L } };
    const e1 = unit(c0, c1), e2 = unit(c0, c3), r = CHASSIS_TOIT.dormant;
    const dedans = geo.coins.map((q, i) => { const s1 = i === 0 || i === 3 ? 1 : -1, s2 = i < 2 ? 1 : -1; return { x: q.x + (e1.x * s1 + e2.x * s2) * r, y: q.y + (e1.y * s1 + e2.y * s2) * r, z: q.z + (e1.z * s1 + e2.z * s2) * r } });
    plaques.push({ dessus: dedans.map(q => k(q, CHASSIS_TOIT.saillie + 5)), decalage: { x: -n.x * 10, y: -n.y * 10, z: -n.z * 10 }, matiere: 'vitrage', objet: o.id, niveau: f.id, support });
  }
}

/** dessinés (ordres de grandeur pour la vue) : gouttière, descente, rang de génoise (saillie et hauteur) */
export const EAUX_3D = { gouttiere: 120, descente: 80, rangSaillie: 70, rangHauteur: 90 } as const;

/* l'égout et les eaux pluviales : la gouttière le long de chaque égout (une fois choisie : un projet qui n'en dit
   rien garde sa vue d'avant), chaque descente
   ramenée de l'égout contre le mur par un coude puis jusqu'au sol, la génoise en gradins sous l'égout */
function egoutEtEaux(projet: Project, f: Floor, prismes: Prisme[]): void {
  const E = eauxPluviales(f), T = toitureDuNiveau(f);
  if (!E || !T?.ok) return;
  const r = E.roof, G = EAUX_3D, zE = T.toitures[0]!.egoutZ, zMur = T.toitures[0]!.hautMurs + T.toitures[0]!.talon;
  const sol = Math.min(...projet.buildings.flatMap(b => b.floors).map(x => x.elevation));
  const egout = T.toitures.flatMap(t => t.egout.map((a, i) => ({ a, b: t.egout[(i + 1) % t.egout.length]!, anneau: t.egout })));
  /* la normale d'un égout vers le dehors */
  const dehors = (l: { a: Point; b: Point }, A: Anneau) => {
    const n = normaleGauche(normaliser(soustraire(l.b, l.a))), m = { x: (l.a.x + l.b.x) / 2 + n.x * 10, y: (l.a.y + l.b.y) / 2 + n.y * 10 };
    return positionDansAnneau(m, A) === 'dedans' ? multiplier(n, -1) : n;
  };
  const bande = (a: Point, b: Point, n: Point, d0: Mm, d1: Mm): Anneau => [ajouter(a, multiplier(n, d0)), ajouter(b, multiplier(n, d0)), ajouter(b, multiplier(n, d1)), ajouter(a, multiplier(n, d1))];
  for (const l of E.lignes) {
    if (l.genre !== 'egout') continue;
    const A = egout.find(e => positionDansAnneau({ x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 }, e.anneau) !== 'dehors')?.anneau ?? egout[0]!.anneau;
    const n = dehors(l, A);
    if (r.gutter && r.gutter !== 'none') prismes.push({ contour: bande(l.a, l.b, n, 0, G.gouttiere), z0: zE - G.gouttiere, z1: zE - 20, matiere: 'zinc', objet: r.id, niveau: f.id });
    /* la génoise : sous l'égout, contre le mur (le nu est à « débord » en retrait de l'égout), un gradin par rang */
    const rangs = r.eavesFinish?.startsWith('genoise') ? Number(r.eavesFinish.slice(-1)) : 0;
    /* le rang du haut passe sous la sous-face du toit, là où il s'avance le plus (sinon il percerait la couverture) */
    const zG = zMur - rangs * G.rangSaillie * Math.tan((r.pitch * Math.PI) / 180) - Math.max(EPAISSEUR_COUVERTURE, T.toitures[0]!.talon);
    /* l'égout déborde aussi aux bouts : chaque gradin est raccourci jusqu'au nu des murs d'angle, plus sa saillie */
    const u = normaliser(soustraire(l.b, l.a));
    for (let k = 0; k < rangs; k++) {
      const c = Math.max(0, r.overhang - (k + 1) * G.rangSaillie), a = ajouter(l.a, multiplier(u, c)), b = ajouter(l.b, multiplier(u, -c));
      prismes.push({ contour: bande(a, b, n, -r.overhang, -r.overhang + (k + 1) * G.rangSaillie), z0: zG - (rangs - k) * G.rangHauteur, z1: zG - (rangs - k - 1) * G.rangHauteur, matiere: 'tuile', objet: r.id, niveau: f.id });
    }
  }
  if (r.gutter === 'none') return;
  /* les descentes : du point de l'égout, un coude jusqu'au nu du mur le plus proche, puis droit au sol */
  const nus = planDuNiveau(f).maconnerie.map(m => m.contour);
  const carre = (c: Point, d: Mm): Anneau => [{ x: c.x - d / 2, y: c.y - d / 2 }, { x: c.x + d / 2, y: c.y - d / 2 }, { x: c.x + d / 2, y: c.y + d / 2 }, { x: c.x - d / 2, y: c.y + d / 2 }];
  for (const d of E.descentes) {
    let w = d.point, best = Infinity;
    for (const A of nus) A.forEach((a, i) => {
      const b = A[(i + 1) % A.length]!, ab = soustraire(b, a), L2 = ab.x * ab.x + ab.y * ab.y || 1;
      const t = Math.max(0, Math.min(1, ((d.point.x - a.x) * ab.x + (d.point.y - a.y) * ab.y) / L2)), q = { x: a.x + t * ab.x, y: a.y + t * ab.y };
      const e = Math.hypot(q.x - d.point.x, q.y - d.point.y);
      if (e < best) { best = e; w = q }
    });
    const u = best > 1 ? normaliser(soustraire(d.point, w)) : { x: 0, y: 0 }, pied = ajouter(w, multiplier(u, G.descente / 2 + 20));          // à 2 cm du mur (colliers)
    const zc = zE - G.gouttiere - 250;
    prismes.push({ contour: carre(d.point, G.descente), z0: zc, z1: zE - G.gouttiere, matiere: 'zinc', objet: r.id, niveau: f.id });
    if (best > G.descente / 2 + 20) prismes.push({ contour: bande(d.point, pied, normaleGauche(u), -G.descente / 2, G.descente / 2), z0: zc - G.descente, z1: zc, matiere: 'zinc', objet: r.id, niveau: f.id });
    prismes.push({ contour: carre(pied, G.descente), z0: sol, z1: zc, matiere: 'zinc', objet: r.id, niveau: f.id });
  }
}

/** un châssis de toit dessiné : il dépasse de la couverture de « saillie », son dormant fait « dormant » de large (mm) */
export const CHASSIS_TOIT = { saillie: 80, dormant: 60 } as const;

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

/* les arbres conservés ou à planter : un tronc, puis une couronne (un octaèdre aplati en tranches) ; l'arbre
   à abattre n'est pas dans la vue du projet. Silhouette d'usage, pour l'insertion : pas une essence. */
function arbres(f: Floor, prismes: Prisme[]): void {
  const rond = (c: Point, r: number, n = 16): Anneau => Array.from({ length: n }, (_, i) => ({ x: c.x + r * Math.cos((2 * Math.PI * i) / n), y: c.y + r * Math.sin((2 * Math.PI * i) / n) }));
  for (const o of Object.values(f.objects)) {
    if (o.type !== 'tree' || o.state === 'felled') continue;
    const R = o.diameter / 2, fut = Math.max(1_200, R * 0.9), haut = fut + R * 1.6;
    prismes.push({ contour: rond(o.position, Math.max(60, R * 0.08), 12), z0: f.elevation - 30, z1: f.elevation + fut + R * 0.3, matiere: 'tronc', objet: o.id, niveau: f.id });
    /* la couronne : un ellipsoïde en tranches fines, au rayon un peu irrégulier (un hasard fixe, tiré de la position) :
       une silhouette ronde d'arbre feuillu plutôt qu'une pile de disques */
    const N = 14, graine = Math.abs(Math.sin(o.position.x * 12.9898 + o.position.y * 78.233)) * 43758.5453;
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N, t = (t0 + t1) / 2, k = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
      const bruit = 0.92 + 0.12 * ((graine * (i + 1)) % 1);
      prismes.push({ contour: rond(o.position, Math.max(R * 0.18, R * k * bruit), 28), z0: f.elevation + fut + (haut - fut) * t0, z1: f.elevation + fut + (haut - fut) * t1, matiere: 'feuillage', objet: o.id, niveau: f.id });
    }
  }
}

/* la structure : un poteau du sol au plafond du niveau, une poutre sous le plafond (sa retombée) */
function structure(f: Floor, prismes: Prisme[]): void {
  const M: Record<string, Matiere> = { concrete: 'plancher', steel: 'inox', wood: 'escalier' };
  for (const o of Object.values(f.objects)) {
    if (o.type === 'column') prismes.push({ contour: sectionPoteau(o), z0: f.elevation, z1: f.elevation + f.height, matiere: M[o.material]!, objet: o.id, niveau: f.id });
    else if (o.type === 'beam') prismes.push({ contour: empriseDePoutre(o), z0: f.elevation + f.height - o.depth, z1: f.elevation + f.height, matiere: M[o.material]!, objet: o.id, niveau: f.id });
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
  const prismes: Prisme[] = [], plaques: Plaque[] = [], teintes = teintesDuProjet(projet);
  for (const b of projet.buildings) {
    const F = [...b.floors].sort((a, c) => a.elevation - c.elevation);
    const k = jusqua ? F.findIndex(f => f.id === jusqua) : -1;
    for (const f of k >= 0 ? F.slice(0, k + 1) : F) {
      planchers(projet, f, prismes); murs(f, prismes, teintes); peintures(f, prismes); amenagements(f, prismes); arbres(f, prismes); structure(f, prismes); meubles(f, prismes); escaliers(projet, f, prismes);
      if (options.toiture !== false) { toiture(f, prismes, plaques); egoutEtEaux(projet, f, prismes) }
    }
  }
  let boite: Maquette['boite'] = null;
  const etendre = (x: number, y: number, z0: number, z1: number) => {
    boite = boite ? { xmin: Math.min(boite.xmin, x), ymin: Math.min(boite.ymin, y), zmin: Math.min(boite.zmin, z0), xmax: Math.max(boite.xmax, x), ymax: Math.max(boite.ymax, y), zmax: Math.max(boite.zmax, z1) }
      : { xmin: x, ymin: y, zmin: z0, xmax: x, ymax: y, zmax: z1 };
  };
  for (const p of prismes) for (const q of p.contour) etendre(q.x, q.y, p.z0, p.z1);
  for (const p of plaques) for (const q of p.dessus) etendre(q.x, q.y, Math.min(q.z, q.z + p.decalage.z), Math.max(q.z, q.z + p.decalage.z));
  const r = relief(projet);
  return { prismes, plaques, boite, ...(r ? { relief: r } : {}) };
}

/** le volume d'un prisme (mm³) : pour les contrôles */
export function volume(p: Prisme): number {
  const a = (r: Anneau) => { let s = 0; for (let i = 0; i < r.length; i++) { const u = r[i]!, v = r[(i + 1) % r.length]!; s += u.x * v.y - v.x * u.y } return Math.abs(s) / 2 };
  return (a(p.contour) - (p.trous ?? []).reduce((s, t) => s + a(t), 0)) * (p.z1 - p.z0);
}
