/* Segments et droites : projection, distance, intersection.

   L'intersection distingue les cas qui comptent pour des murs : croisement,
   contact par une extrémité (jonction en T ou en L), chevauchement de deux
   segments alignés (deux murs posés l'un sur l'autre), aucun contact. */
import type { Point } from '../model/types';
import { EPS_ANGLE, EPS_COINCIDENCE } from './tolerance';
import { distance, norme, scalaire, soustraire, vectoriel } from './vecteur';

export interface Segment { a: Point; b: Point }

export const longueur = (s: Segment): number => distance(s.a, s.b);

/** le point de la DROITE (a, b) le plus proche de p, et son paramètre t (a : 0, b : 1) */
export function projeterSurDroite(p: Point, s: Segment): { point: Point; t: number } {
  const d = soustraire(s.b, s.a), l2 = scalaire(d, d);
  if (l2 === 0) return { point: { ...s.a }, t: 0 };
  const t = scalaire(soustraire(p, s.a), d) / l2;
  return { point: { x: s.a.x + t * d.x, y: s.a.y + t * d.y }, t };
}

/** le point du SEGMENT le plus proche de p */
export function projeterSurSegment(p: Point, s: Segment): { point: Point; t: number } {
  const { t } = projeterSurDroite(p, s);
  const tc = Math.max(0, Math.min(1, t));
  return { point: { x: s.a.x + tc * (s.b.x - s.a.x), y: s.a.y + tc * (s.b.y - s.a.y) }, t: tc };
}

export const distancePointSegment = (p: Point, s: Segment): number => distance(p, projeterSurSegment(p, s).point);

export type Intersection =
  | { type: 'aucune' }
  | { type: 'point'; point: Point; t: number; u: number }          // t sur s1, u sur s2
  | { type: 'chevauchement'; debut: Point; fin: Point };           // partie commune de deux segments alignés

/** l'intersection de deux segments, à la tolérance de coïncidence près */
export function intersectionSegments(s1: Segment, s2: Segment, eps: number = EPS_COINCIDENCE): Intersection {
  const r = soustraire(s1.b, s1.a), q = soustraire(s2.b, s2.a);
  const l1 = norme(r), l2 = norme(q);
  if (l1 <= eps || l2 <= eps) {
    /* un segment réduit à un point : contact si ce point est sur l'autre */
    const [pt, autre] = l1 <= eps ? [s1.a, s2] : [s2.a, s1];
    if (distancePointSegment(pt, autre) > eps) return { type: 'aucune' };
    const t = l1 <= eps ? 0 : projeterSurSegment(pt, s1).t, u = l2 <= eps ? 0 : projeterSurSegment(pt, s2).t;
    return { type: 'point', point: { ...pt }, t, u };
  }
  const denom = vectoriel(r, q);
  if (Math.abs(denom) <= EPS_ANGLE * l1 * l2) {
    /* parallèles : alignés si s2 est sur la droite de s1 */
    if (distance(projeterSurDroite(s2.a, s1).point, s2.a) > eps) return { type: 'aucune' };
    const t0 = projeterSurDroite(s2.a, s1).t, t1 = projeterSurDroite(s2.b, s1).t;
    const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(1, Math.max(t0, t1));
    const tol = eps / l1;
    if (lo > hi + tol) return { type: 'aucune' };
    const p = (t: number): Point => ({ x: s1.a.x + t * r.x, y: s1.a.y + t * r.y });
    if (hi - lo <= tol) {
      const t = (lo + hi) / 2, point = p(t);
      return { type: 'point', point, t, u: projeterSurSegment(point, s2).t };
    }
    return { type: 'chevauchement', debut: p(lo), fin: p(hi) };
  }
  const w = soustraire(s2.a, s1.a);
  const t = vectoriel(w, q) / denom, u = vectoriel(w, r) / denom;
  const tt = eps / l1, tu = eps / l2;
  if (t < -tt || t > 1 + tt || u < -tu || u > 1 + tu) return { type: 'aucune' };
  const tc = Math.max(0, Math.min(1, t)), uc = Math.max(0, Math.min(1, u));
  return { type: 'point', point: { x: s1.a.x + tc * r.x, y: s1.a.y + tc * r.y }, t: tc, u: uc };
}

/** l'intersection de deux DROITES (null si parallèles) */
export function intersectionDroites(s1: Segment, s2: Segment): Point | null {
  const r = soustraire(s1.b, s1.a), q = soustraire(s2.b, s2.a);
  const denom = vectoriel(r, q);
  if (Math.abs(denom) <= EPS_ANGLE * norme(r) * norme(q)) return null;
  const t = vectoriel(soustraire(s2.a, s1.a), q) / denom;
  return { x: s1.a.x + t * r.x, y: s1.a.y + t * r.y };
}
