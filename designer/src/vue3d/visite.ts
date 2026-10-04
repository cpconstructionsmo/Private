/* La visite à hauteur d'homme : un marcheur dans la maquette (vue3d/maquette.ts).
   Ce module ne dessine rien ; il dit où le marcheur a les pieds et s'il peut
   avancer. La vue 3D (ui/vue3d.ts) en fait une caméra à hauteur des yeux.

   - Le sol sous ses pieds : la surface la plus haute (sol fini, plancher,
     marche, ou le terrain à ±0,00) qu'il peut atteindre d'un pas — ainsi il
     monte et descend un escalier, et ne grimpe pas sur une allège.
   - Ce qui l'arrête : tout volume plein (murs, cloisons, vitrages, meubles,
     marches trop hautes, plancher trop bas au-dessus de la tête) qui coupe la
     tranche de son corps, au-dessus d'un pas et jusqu'au haut de la tête,
     dans un rayon d'épaule. Les vantaux de portes et les portes de garage le
     laissent passer (on les suppose ouverts) ; une baie vitrée l'arrête.

   Tout se déduit de la maquette : rien n'est enregistré dans le projet. */
import type { Mm, Point } from '../model/types';
import type { Anneau } from '../geometry/polygon';
import { aireSignee, centroide } from '../geometry/polygon';
import { positionDansAnneau } from '../geometry/predicats';
import { distancePointSegment } from '../geometry/segment';
import type { Maquette, Matiere } from './maquette';

/** hauteur des yeux au-dessus du sol (mm) */
export const HAUTEUR_OEIL = 1_600;
/** haut de la tête (mm) : un plancher plus bas arrête le marcheur (une trémie l'en dispense) */
export const HAUTEUR_TETE = 1_700;
/** la plus haute marche qu'il franchit d'un pas (mm) : au-dessus de la hauteur de marche maximale (19 cm) */
export const PAS_MONTANT = 250;
/** demi-largeur d'épaules (mm) : une porte de 0,73 m se passe, un couloir de 0,50 m non */
export const RAYON_MARCHEUR = 250;
/** déplacement unitaire (mm) : un pas plus long est découpé, pour ne jamais traverser une cloison */
const PAS_DE_CALCUL = 100;

export interface Marcheur {
  /** position en plan (mm) */
  x: Mm; y: Mm;
  /** altitude des pieds (mm) */
  pied: Mm;
  /** direction du regard en plan (radians, 0 = vers +x, π/2 = vers +y, le haut du plan) */
  cap: number;
  /** regard vers le haut (+) ou le bas (−), radians */
  tangage: number;
}

interface Surface { anneaux: Anneau[]; z: Mm; boite: Boite; piece: boolean }
interface Obstacle { anneaux: Anneau[]; z0: Mm; z1: Mm; boite: Boite }
interface Boite { xmin: Mm; ymin: Mm; xmax: Mm; ymax: Mm }
export interface Terrain { sols: Surface[]; obstacles: Obstacle[]; boite: Maquette['boite'] }

/** ce sur quoi on marche */
const SOLS: ReadonlySet<Matiere> = new Set(['sol', 'plancher', 'escalier']);
/** ce qui ne gêne pas : le sol fini (5 mm), les vantaux de portes et les portes de garage (supposés ouverts) */
const TRAVERSABLES: ReadonlySet<Matiere> = new Set(['sol', 'porte', 'garage', 'peinture']);

const boiteDe = (A: Anneau[]): Boite => {
  const P = A.flat();
  return { xmin: Math.min(...P.map(p => p.x)), ymin: Math.min(...P.map(p => p.y)), xmax: Math.max(...P.map(p => p.x)), ymax: Math.max(...P.map(p => p.y)) };
};
const pres = (b: Boite, p: Point, r: number) => p.x >= b.xmin - r && p.x <= b.xmax + r && p.y >= b.ymin - r && p.y <= b.ymax + r;

/** p dans la matière d'un polygone à trous (le bord compte comme dedans) */
function dans(p: Point, A: Anneau[]): boolean {
  if (positionDansAnneau(p, A[0]!) === 'dehors') return false;
  return !A.slice(1).some(t => positionDansAnneau(p, t) === 'dedans');
}

/** distance de p à la matière d'un polygone à trous (0 dedans) */
function distanceA(p: Point, A: Anneau[]): number {
  if (dans(p, A)) return 0;
  let d = Infinity;
  for (const r of A) r.forEach((a, i) => { d = Math.min(d, distancePointSegment(p, { a, b: r[(i + 1) % r.length]! })) });
  return d;
}

/** le terrain de la visite : surfaces où marcher et volumes qui arrêtent, avec leurs boîtes (pour aller vite) */
export function preparerVisite(m: Maquette): Terrain {
  const sols: Surface[] = [], obstacles: Obstacle[] = [];
  for (const p of m.prismes) {
    const anneaux = [p.contour, ...(p.trous ?? [])], boite = boiteDe(anneaux);
    if (SOLS.has(p.matiere)) sols.push({ anneaux, z: p.z1, boite, piece: p.matiere === 'sol' });
    if (!TRAVERSABLES.has(p.matiere)) obstacles.push({ anneaux, z0: p.z0, z1: p.z1, boite });
  }
  return { sols, obstacles, boite: m.boite };
}

/** l'altitude du sol sous un point, pour des pieds à « pied » : la plus haute surface atteignable d'un pas (le terrain, au pire) */
export function solSous(T: Terrain, p: Point, pied: Mm): Mm {
  let z = 0;
  for (const s of T.sols) if (s.z > z && s.z <= pied + PAS_MONTANT && pres(s.boite, p, 0) && dans(p, s.anneaux)) z = s.z;
  return z;
}

/** le marcheur tient-il là, les pieds à « pied » ? */
export function libre(T: Terrain, p: Point, pied: Mm): boolean {
  const bas = pied + PAS_MONTANT, haut = pied + HAUTEUR_TETE;
  for (const o of T.obstacles) {
    if (o.z1 <= bas || o.z0 >= haut || !pres(o.boite, p, RAYON_MARCHEUR)) continue;
    if (distanceA(p, o.anneaux) < RAYON_MARCHEUR) return false;
  }
  return true;
}

/** un pas élémentaire : là où il va, s'il le peut ; sinon en glissant le long de l'obstacle (selon x, puis selon y) */
function pas(T: Terrain, w: Marcheur, dx: Mm, dy: Mm): Marcheur {
  for (const [ex, ey] of [[dx, dy], [dx, 0], [0, dy]] as const) {
    if (!ex && !ey) continue;
    const p = { x: w.x + ex, y: w.y + ey }, pied = solSous(T, p, w.pied);
    if (libre(T, p, pied)) return { ...w, ...p, pied };
  }
  return w;
}

/** avancer de (dx, dy) en plan (mm), découpé en pas courts */
export function avancer(T: Terrain, w: Marcheur, dx: Mm, dy: Mm): Marcheur {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / PAS_DE_CALCUL));
  let r = w;
  for (let i = 0; i < n; i++) r = pas(T, r, dx / n, dy / n);
  return r;
}

/** le point de départ : au milieu de la plus grande pièce du niveau le plus bas (une place libre),
    sinon devant la maison ; le regard vers le haut du plan */
export function depart(T: Terrain): Marcheur {
  const P = T.sols.filter(s => s.piece), bas = Math.min(...P.map(x => x.z));
  const pieces = P.filter(s => s.z <= bas + 10).sort((a, b) => Math.abs(aireSignee(b.anneaux[0]!)) - Math.abs(aireSignee(a.anneaux[0]!)));
  for (const s of pieces.slice(0, 3)) {
    const c = centroide(s.anneaux[0]!), b = s.boite;
    /* le centre, puis une grille de plus en plus large autour, jusqu'à une place libre */
    for (let k = 0; k < 12; k++) for (let i = -k; i <= k; i++) for (const j of k ? [-k, k] : [0]) for (const [u, v] of [[i, j], [j, i]] as const) {
      const p = { x: c.x + u * 300, y: c.y + v * 300 };
      if (p.x < b.xmin || p.x > b.xmax || p.y < b.ymin || p.y > b.ymax || !dans(p, s.anneaux)) continue;
      const pied = solSous(T, p, s.z);
      if (libre(T, p, pied)) return { ...p, pied, cap: Math.PI / 2, tangage: 0 };
    }
  }
  const B = T.boite;
  if (!B) return { x: 0, y: 0, pied: 0, cap: Math.PI / 2, tangage: 0 };
  return { x: (B.xmin + B.xmax) / 2, y: B.ymin - 4_000, pied: 0, cap: Math.PI / 2, tangage: 0 };
}

/** le point visé par le regard (pour la caméra) */
export function regard(w: Marcheur): { oeil: { x: Mm; y: Mm; z: Mm }; vise: { x: Mm; y: Mm; z: Mm } } {
  const c = Math.cos(w.tangage), oeil = { x: w.x, y: w.y, z: w.pied + HAUTEUR_OEIL };
  return { oeil, vise: { x: oeil.x + 1_000 * c * Math.cos(w.cap), y: oeil.y + 1_000 * c * Math.sin(w.cap), z: oeil.z + 1_000 * Math.sin(w.tangage) } };
}
