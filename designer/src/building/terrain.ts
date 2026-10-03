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
import type { Floor, Mm, Plot, Point, Project } from '../model/types';
import { planDuNiveau } from './plan';
import { union } from '../geometry/booleen';
import { aireSignee, centroide, type Polygone } from '../geometry/polygon';
import { distancePointSegment, projeterSurSegment } from '../geometry/segment';
import { distance, tourner } from '../geometry/vecteur';
import { positionDansAnneau } from '../geometry/predicats';

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
