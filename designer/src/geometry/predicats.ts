/* Prédicats géométriques, tolérants : un point à moins de EPS_COINCIDENCE
   d'une droite est SUR la droite. La tolérance est une distance (mm), et
   non un seuil sur un produit vectoriel, qui dépendrait de la longueur des
   segments. */
import type { Point } from '../model/types';
import { EPS_COINCIDENCE } from './tolerance';
import { distance, soustraire, vectoriel } from './vecteur';

/** +1 : c est à gauche de (a→b) ; -1 : à droite ; 0 : sur la droite (ou a = b) */
export function orientation(a: Point, b: Point, c: Point, eps: number = EPS_COINCIDENCE): -1 | 0 | 1 {
  const l = distance(a, b);
  if (l <= eps) return 0;
  const d = vectoriel(soustraire(b, a), soustraire(c, a)) / l;   // distance signée de c à la droite
  return d > eps ? 1 : d < -eps ? -1 : 0;
}

export const alignes = (a: Point, b: Point, c: Point, eps: number = EPS_COINCIDENCE): boolean => orientation(a, b, c, eps) === 0;

export type Position = 'dedans' | 'dehors' | 'bord';

/** un point par rapport à un anneau (polygone simple, sens quelconque) */
export function positionDansAnneau(p: Point, anneau: readonly Point[], eps: number = EPS_COINCIDENCE): Position {
  const n = anneau.length;
  for (let i = 0; i < n; i++) {
    const a = anneau[i]!, b = anneau[(i + 1) % n]!;
    if (surSegment(p, a, b, eps)) return 'bord';
  }
  /* lancer de rayon horizontal vers +x */
  let dedans = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = anneau[i]!, b = anneau[j]!;
    if ((a.y > p.y) !== (b.y > p.y)) {
      const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (x > p.x) dedans = !dedans;
    }
  }
  return dedans ? 'dedans' : 'dehors';
}

/** p est sur le segment [a, b], extrémités comprises */
export function surSegment(p: Point, a: Point, b: Point, eps: number = EPS_COINCIDENCE): boolean {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return distance(p, a) <= eps;
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  const tc = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + tc * (b.x - a.x), y: a.y + tc * (b.y - a.y) }) <= eps;
}
