/* Le terrain : la parcelle (objet « plot ») et la maison qui s'y implante —
   le plan de masse (PCMI 2). Tout se MESURE, rien n'est recopié :

   - l'emprise au sol : la projection de la maçonnerie de tous les niveaux
     (contours extérieurs réunis) ; les débords de toit n'y sont pas comptés ;
   - les reculs : la plus courte distance de cette emprise à chaque côté de
     la limite, avec les deux points qui la donnent (pour la coter) ;
   - la surface du terrain : celle de la limite tracée.

   La maison ne bouge pas : implanter, c'est placer la PARCELLE autour d'elle
   (à une distance donnée de deux côtés), ou la tourner pour qu'un côté soit
   parallèle à la maison. Une seule commande modifie alors un seul objet. */
import type { Floor, Landscape, Mm, Plot, Point, Project, Viewpoint } from '../model/types';
import { planDuNiveau } from './plan';
import { difference, union } from '../geometry/booleen';
import { aire, aireSignee, centroide, type Polygone } from '../geometry/polygon';
import { distancePointSegment, projeterSurSegment } from '../geometry/segment';
import { distance, tourner } from '../geometry/vecteur';
import { positionDansAnneau } from '../geometry/predicats';
import { segmentsDans } from '../geometry/hachures';
import { barycentre, delaunay, type Triangle } from '../geometry/triangulation';

/** la parcelle du projet, et le niveau qui la porte (null : pas de parcelle) */
export function parcelleDuProjet(p: Project): { plot: Plot; niveau: Floor } | null {
  for (const b of p.buildings) for (const f of b.floors) for (const o of Object.values(f.objects)) if (o.type === 'plot') return { plot: o, niveau: f };
  return null;
}

/** l'emprise au sol : la maçonnerie de tous les niveaux, vue de dessus, réunie (sans les vides intérieurs) */
export function empriseAuSol(p: Project): Polygone[] {
  const P: Polygone[] = [];
  for (const b of p.buildings) for (const f of b.floors) for (const m of planDuNiveau(f).maconnerie) P.push({ contour: m.contour });
  return P.length ? union(P).map(q => ({ contour: q.contour })) : [];
}

export const aireEmprise = (E: Polygone[]): number => E.reduce((s, q) => s + Math.abs(aireSignee(q.contour)), 0);
export const surfaceTerrain = (t: Plot): number => Math.abs(aireSignee(t.contour));

/** côté i de la limite : du sommet i au suivant */
export const coteParcelle = (t: Plot, i: number): { a: Point; b: Point } => ({ a: t.contour[i]!, b: t.contour[(i + 1) % t.contour.length]! });

export interface Recul { cote: number; longueur: Mm; distance: Mm; /** le point de la maison et celui de la limite qui donnent la distance */ de: Point; vers: Point; voie: boolean }

/** la distance de l'emprise à chaque côté de la limite (mesurée, au point le plus proche) */
export function reculs(t: Plot, E: Polygone[]): Recul[] {
  if (!E.length) return [];
  return t.contour.map((_, i) => {
    const s = coteParcelle(t, i);
    let best = { d: Infinity, de: s.a, vers: s.a };
    for (const q of E) q.contour.forEach((a, k) => {
      const b = q.contour[(k + 1) % q.contour.length]!;
      /* d'un sommet de la maison au côté, et d'une extrémité du côté à un mur de la maison */
      const d1 = distancePointSegment(a, s);
      if (d1 < best.d) best = { d: d1, de: a, vers: projeterSurSegment(a, s).point };
      for (const e of [s.a, s.b]) {
        const d2 = distancePointSegment(e, { a, b });
        if (d2 < best.d) best = { d: d2, de: projeterSurSegment(e, { a, b }).point, vers: e };
      }
    });
    return { cote: i, longueur: distance(s.a, s.b), distance: best.d, de: best.de, vers: best.vers, voie: t.street.includes(i) };
  });
}

/** la maison tient-elle dans la parcelle ? Aucun sommet de l'emprise dehors, ni le milieu d'aucun de ses côtés
    (un mur qui enjambe l'angle rentrant d'une parcelle en L) */
export function maisonDansParcelle(t: Plot, E: Polygone[]): boolean {
  for (const q of E) for (let k = 0; k < q.contour.length; k++) {
    const a = q.contour[k]!, b = q.contour[(k + 1) % q.contour.length]!;
    if (positionDansAnneau(a, t.contour) === 'dehors' || positionDansAnneau({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, t.contour) === 'dehors') return false;
  }
  return true;
}

/** la normale intérieure du côté i (vers le terrain), et sa constante : n·p = c sur le côté */
function droite(t: Plot, i: number): { n: Point; c: number } {
  const s = coteParcelle(t, i), L = distance(s.a, s.b) || 1, u = { x: (s.b.x - s.a.x) / L, y: (s.b.y - s.a.y) / L };
  const k = aireSignee(t.contour) > 0 ? 1 : -1;
  const n = { x: -u.y * k, y: u.x * k };
  return { n, c: n.x * s.a.x + n.y * s.a.y };
}

/** la limite déplacée pour que la maison soit à « da » du côté « a » et à « db » du côté « b »
    (distances perpendiculaires au côté, depuis le point de la maison le plus proche) ; null : côtés parallèles */
export function placerParcelle(t: Plot, E: Polygone[], a: number, da: Mm, b: number, db: Mm): Point[] | null {
  const P = E.flatMap(q => q.contour);
  if (!P.length) return null;
  const A = droite(t, a), B = droite(t, b);
  const det = A.n.x * B.n.y - A.n.y * B.n.x;
  if (Math.abs(det) < 1e-6) return null;
  /* après une translation T de la limite : min(n·p) − (c + n·T) = d  →  n·T = min(n·p) − c − d */
  const m = (n: Point) => Math.min(...P.map(p => n.x * p.x + n.y * p.y));
  const ra = m(A.n) - A.c - da, rb = m(B.n) - B.c - db;
  const T = { x: (ra * B.n.y - rb * A.n.y) / det, y: (A.n.x * rb - B.n.x * ra) / det };
  return t.contour.map(q => ({ x: Math.round((q.x + T.x) * 1000) / 1000, y: Math.round((q.y + T.y) * 1000) / 1000 }));
}

/** la limite tournée autour de la maison pour que le côté i soit parallèle à ses murs (au quart de tour le plus proche) ;
    le nord tourne avec elle (il appartient au terrain) */
export function orienterParcelle(t: Plot, i: number, E: Polygone[]): { contour: Point[]; nord: number } {
  const s = coteParcelle(t, i), th = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
  const rot = Math.round(th / (Math.PI / 2)) * (Math.PI / 2) - th;
  const P = E.flatMap(q => q.contour), c = P.length ? centroide(P.length >= 3 ? E[0]!.contour : P) : centroide(t.contour);
  return { contour: t.contour.map(q => { const r = tourner(q, rot, c); return { x: Math.round(r.x * 1000) / 1000, y: Math.round(r.y * 1000) / 1000 } }), nord: t.north + rot };
}

/* ---------- les aménagements extérieurs ---------- */

export interface BilanAmenagement { id: string; genre: Landscape['kind']; finition: string; /** surface (mm²) ou longueur (mm) */ mesure: number }

/** chaque aménagement du projet et sa mesure : surface (terrasse, allée, stationnement, espace vert) ou longueur (clôture).
 *  Une surface ne compte pas ce que la maison couvre : une allée tracée tout autour de la maison (bande de gravier
 *  en pied de façade) ne mesure que la bande, sans quoi l'emprise serait comptée deux fois au bilan du terrain */
export function bilanAmenagements(p: Project): BilanAmenagement[] {
  const out: BilanAmenagement[] = [];
  let E: Polygone[] | null = null;
  for (const b of p.buildings) for (const f of b.floors) for (const o of Object.values(f.objects)) {
    if (o.type !== 'landscape') continue;
    const n = o.closed ? o.points.length : o.points.length - 1;
    let L = 0; for (let i = 0; i < n; i++) L += distance(o.points[i]!, o.points[(i + 1) % o.points.length]!);
    let S = 0;
    if (o.kind !== 'fence' && o.points.length >= 3) {
      E ??= empriseAuSol(p);
      S = E.length ? difference([{ contour: o.points }], E).reduce((s, q) => s + aire(q), 0) : Math.abs(aireSignee(o.points));
    }
    out.push({ id: o.id, genre: o.kind, finition: o.finish, mesure: o.kind === 'fence' ? L : S });
  }
  return out;
}

/** un accès depuis la voie : le morceau d'un côté sur voie que touche une allée ou un stationnement (au moins 2 m) */
export interface Acces { cote: number; a: Point; b: Point; largeur: Mm }

/** les accès du terrain : là où une allée ou un stationnement tracés arrivent sur la limite le long de la voie (à 30 cm près) ;
 *  ils se mesurent, rien n'est supposé de leur statut (existant, à créer) */
export function accesDepuisLaVoie(p: Project): Acces[] {
  const t = parcelleDuProjet(p);
  if (!t) return [];
  const C = t.plot.contour, s = Math.sign(C.reduce((x, q, i) => { const r = C[(i + 1) % C.length]!; return x + q.x * r.y - r.x * q.y }, 0)) || 1;
  const surfaces = p.buildings.flatMap(b => b.floors).flatMap(f => Object.values(f.objects)).filter((o): o is Landscape => o.type === 'landscape' && (o.kind === 'path' || o.kind === 'parking') && o.points.length >= 3);
  if (!surfaces.length) return [];
  const zone = union(surfaces.map(o => ({ contour: o.points })));
  const out: Acces[] = [];
  for (const i of t.plot.street) {
    const a = C[i]!, b = C[(i + 1) % C.length]!, L = distance(a, b);
    if (L < 1) continue;
    /* le côté, glissé vers l'intérieur du terrain : au ras de la limite d'abord (la largeur vraie d'une allée tracée jusqu'à
       elle, même si elle s'évase), puis jusqu'à 30 cm (une allée arrêtée un peu avant la limite) */
    const morceaux = (d: number): [number, number][] => {
      const n = { x: -s * (b.y - a.y) / L * d, y: s * (b.x - a.x) / L * d }, a2 = { x: a.x + n.x, y: a.y + n.y }, b2 = { x: b.x + n.x, y: b.y + n.y };
      const I = zone.flatMap(q => segmentsDans(a2, b2, q)).map(([u, v]) => [distance(a2, u), distance(a2, v)].sort((x, y) => x - y) as [number, number]).sort((x, y) => x[0] - y[0]);
      const R: [number, number][] = [];
      for (const [u, v] of I) { const e = R[R.length - 1]; if (e && u <= e[1] + 50) e[1] = Math.max(e[1], v); else R.push([u, v]) }
      return R.filter(([u, v]) => v - u >= 2_000);
    };
    const R = [20, 100, 300].map(morceaux).find(x => x.length) ?? [];
    for (const [u, v] of R) {
      const at = (k: number) => ({ x: a.x + (b.x - a.x) * k / L, y: a.y + (b.y - a.y) * k / L });
      out.push({ cote: i, a: at(u), b: at(v), largeur: v - u });
    }
  }
  return out;
}

/* ---------- les points de prise de vue ---------- */

/** demi-angle du champ dessiné d'un point de vue (un appareil courant voit environ 50° en largeur) */
export const DEMI_CHAMP = (25 * Math.PI) / 180;

/** les points de vue du projet, dans l'ordre des pièces (PCMI 6, 7, 8) */
export function pointsDeVue(p: Project): Viewpoint[] {
  const V: Viewpoint[] = [];
  for (const b of p.buildings) for (const f of b.floors) for (const o of Object.values(f.objects)) if (o.type === 'viewpoint') V.push(o);
  return V.sort((x, y) => x.piece.localeCompare(y.piece));
}

/** le champ dessiné d'un point de vue : les deux bords du cône, à la distance du point visé */
export function champDeVue(v: Viewpoint): { gauche: Point; droite: Point } {
  const t = Math.atan2(v.b.y - v.a.y, v.b.x - v.a.x), L = distance(v.a, v.b);
  const bord = (s: number) => ({ x: v.a.x + L * Math.cos(t + s * DEMI_CHAMP), y: v.a.y + L * Math.sin(t + s * DEMI_CHAMP) });
  return { gauche: bord(1), droite: bord(-1) };
}

/* ---------- le terrain naturel : ses points cotés, interpolés ---------- */

/** l'interpolation d'un relevé : les triangles de Delaunay des points cotés (gardés tant que le relevé ne change pas) */
const tins = new WeakMap<readonly { point: Point; ngf: number }[], Triangle[]>();
function tin(A: readonly { point: Point; ngf: number }[]): Triangle[] {
  let T = tins.get(A);
  if (!T) { T = delaunay(A.map(x => x.point)); tins.set(A, T) }
  return T;
}

/** l'altitude NGF (m) du terrain naturel en un point du plan, déduite des points cotés de la parcelle (null : aucun point) :
 *  dans un triangle du relevé, linéaire entre ses trois sommets ; au-dehors, la pente du triangle le plus proche prolongée ;
 *  avec un seul point, le terrain est plat ; avec des points alignés, il varie le long de leur ligne seulement */
export function altitudeTerrain(t: Plot, p: Point): number | null {
  const A = t.spotHeights ?? [];
  if (!A.length) return null;
  if (A.length === 1) return A[0]!.ngf;
  const T = tin(A);
  if (!T.length) {
    /* des points alignés : la droite qui passe par les deux plus éloignés */
    let i0 = 0, i1 = 1, dmax = -1;
    for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) { const d = distance(A[i]!.point, A[j]!.point); if (d > dmax) { dmax = d; i0 = i; i1 = j } }
    const a = A[i0]!, b = A[i1]!, L2 = dmax * dmax;
    const s = ((p.x - a.point.x) * (b.point.x - a.point.x) + (p.y - a.point.y) * (b.point.y - a.point.y)) / L2;
    return a.ngf + s * (b.ngf - a.ngf);
  }
  const plan = ([i, j, k]: Triangle) => { const w = barycentre(p, A[i]!.point, A[j]!.point, A[k]!.point); return w[0] * A[i]!.ngf + w[1] * A[j]!.ngf + w[2] * A[k]!.ngf };
  for (const tr of T) if (barycentre(p, A[tr[0]]!.point, A[tr[1]]!.point, A[tr[2]]!.point).every(w => w >= -1e-9)) return plan(tr);
  /* au-dehors du relevé : le triangle dont le centre est le plus proche, son plan prolongé */
  const centre = ([i, j, k]: Triangle) => ({ x: (A[i]!.point.x + A[j]!.point.x + A[k]!.point.x) / 3, y: (A[i]!.point.y + A[j]!.point.y + A[k]!.point.y) / 3 });
  return plan(T.reduce((m, tr) => (distance(centre(tr), p) < distance(centre(m), p) ? tr : m)));
}

/** le profil du terrain naturel le long d'un segment : (s le long du segment en mm, z par rapport au ±0,00 en mm),
 *  un point tous les « pas » ; null sans point coté ou sans altitude NGF du ±0,00 (on ne peut rien placer) */
export function profilTerrain(t: Plot, a: Point, b: Point, pas: Mm = 250): { s: Mm; z: Mm }[] | null {
  if (!t.spotHeights?.length || t.groundFloorNgf === undefined) return null;
  const L = distance(a, b), n = Math.max(2, Math.ceil(L / pas) + 1), out: { s: Mm; z: Mm }[] = [];
  for (let i = 0; i < n; i++) {
    const s = (L * i) / (n - 1), q = { x: a.x + ((b.x - a.x) * s) / (L || 1), y: a.y + ((b.y - a.y) * s) / (L || 1) };
    out.push({ s, z: Math.round((altitudeTerrain(t, q)! - t.groundFloorNgf) * 1000) || 0 });
  }
  return out;
}
