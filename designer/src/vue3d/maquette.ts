/* La maquette 3D : des prismes droits (un contour en plan, une altitude de
   bas et de haut), dérivés du modèle comme le plan (ADR-0002, ADR-0006).
   Rien n'est enregistré : la 3D est une autre lecture du même Building
   Model, elle suit chaque modification.

   - Un mur est son contour en plan (onglets compris), extrudé de sa base à
     sa hauteur ; une ouverture le découpe : la bande du mur qui la contient
     ne garde que l'allège (sous l'appui) et le linteau (au-dessus).
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
import { decalagesFaces, mursDroits, type MurDroit } from '../building/murs';
import { difference, intersection } from '../geometry/booleen';
import type { Anneau, Polygone } from '../geometry/polygon';
import { ajouter, multiplier, normaleGauche, normaliser, soustraire } from '../geometry/vecteur';

export type Matiere = 'mur' | 'cloison' | 'plancher' | 'sol' | 'vitrage' | 'porte' | 'garage'
  | 'tuile' | 'ardoise' | 'zinc' | 'bac_acier' | 'vegetalise' | 'gravillons';

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

function murs(f: Floor, prismes: Prisme[]): void {
  const plan = planDuNiveau(f), contours = new Map(plan.murs.map(m => [m.id, m.contour]));
  const ouvertures = Object.values(f.objects).filter((o): o is Opening => o.type === 'opening');
  for (const w of mursDroits(f)) {
    const C = contours.get(w.id);
    if (!C) continue;
    const z0 = f.elevation + w.baseOffset, z1 = z0 + w.height, matiere: Matiere = w.role === 'partition' ? 'cloison' : 'mur';
    const O = ouvertures.filter(o => o.hostWallId === w.id);
    const mur: Polygone[] = [{ contour: C }];
    const bandes = O.map(o => bande(w, o.offset - o.width / 2, o.offset + o.width / 2));
    /* le mur plein, hors des bandes des ouvertures */
    for (const p of bandes.length ? difference(mur, bandes) : mur) prismes.push({ contour: p.contour, ...(p.trous?.length ? { trous: p.trous } : {}), z0, z1, matiere, objet: w.id, niveau: f.id });
    O.forEach((o, i) => {
      const morceaux = intersection(mur, [bandes[i]!]);
      const bas = z0 + o.sill, haut = Math.min(z1, bas + o.height);
      for (const p of morceaux) {
        if (bas > z0) prismes.push({ contour: p.contour, z0, z1: bas, matiere, objet: w.id, niveau: f.id });              // allège
        if (haut < z1) prismes.push({ contour: p.contour, z0: haut, z1, matiere, objet: w.id, niveau: f.id });            // linteau
      }
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

function planchers(f: Floor, prismes: Prisme[]): void {
  const plan = planDuNiveau(f);
  for (const p of plan.maconnerie) prismes.push({ contour: p.contour, z0: f.elevation - EPAISSEUR_PLANCHER, z1: f.elevation, matiere: 'plancher', niveau: f.id });
  /* le sol fini des pièces, à peine au-dessus du plancher (lisible, sans scintillement) */
  for (const z of plan.zones) prismes.push({ contour: z.polygone.contour, z0: f.elevation, z1: f.elevation + 5, matiere: 'sol', ...(z.piece ? { objet: z.piece.id } : {}), niveau: f.id });
}

function toiture(f: Floor, prismes: Prisme[], plaques: Plaque[]): void {
  const r = toitureDuNiveau(f), roof = Object.values(f.objects).find((o): o is Roof => o.type === 'roof');
  if (!r?.ok || !roof) return;
  const m = COUVERTURES[roof.covering];
  for (const t of r.toitures) {
    for (const p of t.pans) plaques.push({ dessus: p.contour.map(q => ({ ...q, z: p.plan.a * q.x + p.plan.b * q.y + p.plan.c })), decalage: { x: 0, y: 0, z: -EPAISSEUR_COUVERTURE }, matiere: m, objet: roof.id, niveau: f.id });
    for (const g of t.pignons) plaques.push({ dessus: g.points, decalage: { ...g.vers, z: 0 }, matiere: 'mur', objet: roof.id, niveau: f.id });
    if (t.terrasse) {
      prismes.push({ contour: t.terrasse.dalle, z0: t.terrasse.z0, z1: t.terrasse.z1, matiere: m, objet: roof.id, niveau: f.id });
      for (const a of t.terrasse.acrotere) prismes.push({ contour: a.contour, ...(a.trous?.length ? { trous: a.trous } : {}), z0: t.terrasse.z1, z1: t.terrasse.zAcrotere, matiere: 'mur', objet: roof.id, niveau: f.id });
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
      planchers(f, prismes); murs(f, prismes);
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
