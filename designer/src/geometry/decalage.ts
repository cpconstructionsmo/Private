/* Décalage (offset) de segments et de polylignes : c'est ainsi qu'un mur
   passe de son axe à ses deux faces. Jonctions en onglet (miter), avec une
   limite au-delà de laquelle l'angle est biseauté plutôt que de produire une
   pointe démesurée sur un angle très aigu. */
import type { Mm, Point } from '../model/types';
import { intersectionDroites, type Segment } from './segment';
import { ajouter, distance, multiplier, normaleGauche, normaliser, soustraire } from './vecteur';
import { EPS_COINCIDENCE } from './tolerance';

/** le segment décalé de d (positif : à gauche du sens a → b) */
export function decalerSegment(s: Segment, d: Mm): Segment {
  const n = multiplier(normaleGauche(normaliser(soustraire(s.b, s.a))), d);
  return { a: ajouter(s.a, n), b: ajouter(s.b, n) };
}

/** limite d'onglet, en multiples du décalage (au-delà : biseau) */
export const LIMITE_ONGLET = 4;

/** une polyligne décalée de d. fermee : les sommets forment un anneau. */
export function decalerPolyligne(points: readonly Point[], d: Mm, fermee = false, limite = LIMITE_ONGLET): Point[] {
  /* on retire les sommets confondus : ils n'ont pas de direction */
  const P = points.filter((p, i) => i === 0 || distance(p, points[i - 1]!) > EPS_COINCIDENCE);
  if (fermee && P.length > 1 && distance(P[0]!, P[P.length - 1]!) <= EPS_COINCIDENCE) P.pop();
  const n = P.length;
  if (n < 2) return P.map(p => ({ ...p }));
  const nbSeg = fermee ? n : n - 1;
  const segs: Segment[] = [];
  for (let i = 0; i < nbSeg; i++) segs.push(decalerSegment({ a: P[i]!, b: P[(i + 1) % n]! }, d));
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const avant = fermee ? segs[(i - 1 + nbSeg) % nbSeg]! : i > 0 ? segs[i - 1]! : null;
    const apres = fermee ? segs[i % nbSeg]! : i < nbSeg ? segs[i]! : null;
    if (!avant) { out.push(apres!.a); continue; }
    if (!apres) { out.push(avant.b); continue; }
    const x = intersectionDroites(avant, apres);
    if (!x) { out.push(avant.b); continue; }                         // alignés : même point décalé
    if (distance(x, P[i]!) > limite * Math.abs(d)) { out.push(avant.b, apres.a); continue; }  // biseau
    out.push(x);
  }
  return out;
}
