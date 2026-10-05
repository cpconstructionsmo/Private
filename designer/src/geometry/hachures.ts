/* Des traits coupés au contour d'un polygone (trous compris) : de quoi
   dessiner en plan le motif d'un sol (carreaux, lames) sans déborder de la
   pièce. Calcul pur, en mm : le dessin (écran ou PDF) ne fait que tracer
   les segments rendus, sans découpe (clip) côté toile. */
import type { Point } from '../model/types';
import type { Polygone } from './polygon';

export type Segment2 = [Point, Point];

/** le point est-il dans le polygone ? règle pair-impair sur le contour et les trous */
function dedans(p: Point, anneaux: readonly (readonly Point[])[]): boolean {
  let n = false;
  for (const A of anneaux) for (let i = 0, j = A.length - 1; i < A.length; j = i++) {
    const a = A[i]!, b = A[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) n = !n;
  }
  return n;
}

/** les morceaux du segment [a, b] à l'intérieur du polygone, dans l'ordre de a vers b */
export function segmentsDans(a: Point, b: Point, p: Polygone): Segment2[] {
  const anneaux = [p.contour, ...(p.trous ?? [])];
  const dx = b.x - a.x, dy = b.y - a.y;
  const ts = [0, 1];
  for (const A of anneaux) for (let i = 0; i < A.length; i++) {
    const p1 = A[i]!, p2 = A[(i + 1) % A.length]!;
    const ex = p2.x - p1.x, ey = p2.y - p1.y, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;                      // côté parallèle : ses extrémités coupent par les côtés voisins
    const wx = p1.x - a.x, wy = p1.y - a.y;
    const t = (wx * ey - wy * ex) / den, u = (wx * dy - wy * dx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const pt = (t: number): Point => ({ x: a.x + dx * t, y: a.y + dy * t });
  const out: Segment2[] = [];
  for (let k = 0; k + 1 < ts.length; k++) {
    const t0 = ts[k]!, t1 = ts[k + 1]!;
    if (t1 - t0 < 1e-9 || !dedans(pt((t0 + t1) / 2), anneaux)) continue;
    /* deux morceaux qui se touchent (un sommet sur le trait) n'en font qu'un */
    const d = out[out.length - 1];
    if (d && Math.hypot(d[1].x - pt(t0).x, d[1].y - pt(t0).y) < 1e-6) d[1] = pt(t1); else out.push([pt(t0), pt(t1)]);
  }
  return out;
}

/** un motif de sol en plan, calé sur l'origine du plan (les carreaux se suivent d'une pièce à l'autre) :
 *  « grille » de pas × pas, ou « rangs » horizontaux de hauteur pas, aux joints décalés d'une demi-longueur */
export type MotifPlan = { genre: 'grille'; pas: number } | { genre: 'rangs'; pas: number; longueur?: number } | { genre: 'colonnes'; pas: number };

/** au-delà, le motif n'est plus lisible (et coûterait cher à dessiner) : le sol reste uni */
export const MAX_TRAITS = 4_000;

export function traitsDeMotif(m: MotifPlan, p: Polygone): Segment2[] {
  if (!(m.pas > 0) || !p.contour.length) return [];
  const xs = p.contour.map(q => q.x), ys = p.contour.map(q => q.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pas = m.pas, i0 = Math.floor(y0 / pas), i1 = Math.ceil(y1 / pas), j0 = Math.floor(x0 / pas), j1 = Math.ceil(x1 / pas);
  if ((i1 - i0) + (j1 - j0) > MAX_TRAITS) return [];
  const out: Segment2[] = [];
  const h = (y: number) => out.push(...segmentsDans({ x: x0 - 1, y }, { x: x1 + 1, y }, p));
  const v = (x: number, ya = y0 - 1, yb = y1 + 1) => out.push(...segmentsDans({ x, y: ya }, { x, y: yb }, p));
  if (m.genre === 'grille') { for (let i = i0; i <= i1; i++) h(i * pas); for (let j = j0; j <= j1; j++) v(j * pas) }
  if (m.genre === 'colonnes') for (let j = j0; j <= j1; j++) v(j * pas);
  if (m.genre === 'rangs') {
    for (let i = i0; i <= i1; i++) h(i * pas);
    const L = m.longueur;
    if (L && L > 0 && (i1 - i0) * Math.ceil((x1 - x0) / L + 1) <= MAX_TRAITS) {
      /* les joints d'about : décalés d'une demi-longueur d'un rang à l'autre */
      for (let i = i0; i < i1; i++) {
        const dec = (((i % 2) + 2) % 2) * L / 2;
        for (let x = Math.floor((x0 - dec) / L) * L + dec; x <= x1; x += L) v(x, i * pas, (i + 1) * pas);
      }
    }
  }
  return out;
}
