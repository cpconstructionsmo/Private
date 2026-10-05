/* La triangulation de Delaunay d'un semis de points (Bowyer–Watson) : de
   quoi interpoler un terrain entre des points cotés, triangle par triangle.
   Quelques dizaines de points (un relevé de géomètre) : l'algorithme simple,
   en n², suffit largement. Calcul pur, en mm. */
import type { Point } from '../model/types';

/** un triangle : les indices de ses trois sommets dans le semis, dans le sens trigonométrique */
export type Triangle = [number, number, number];

const orient = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

export function delaunay(P: readonly Point[]): Triangle[] {
  const n = P.length;
  if (n < 3) return [];
  /* un grand triangle qui contient tout le semis : ses sommets sont les indices n, n+1, n+2 */
  const xs = P.map(p => p.x), ys = P.map(p => p.y);
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  const d = Math.max(xmax - xmin, ymax - ymin, 1) * 1_000, cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
  const S: Point[] = [...P, { x: cx - d, y: cy - d }, { x: cx + d, y: cy - d }, { x: cx, y: cy + d }];
  let T: Triangle[] = [[n, n + 1, n + 2]];
  /* le cercle circonscrit d'un triangle contient-il p ? (déterminant, triangle dans le sens trigonométrique) */
  const dansCercle = ([i, j, k]: Triangle, p: Point): boolean => {
    const a = S[i]!, b = S[j]!, c = S[k]!;
    const ax = a.x - p.x, ay = a.y - p.y, bx = b.x - p.x, by = b.y - p.y, cx2 = c.x - p.x, cy2 = c.y - p.y;
    return (ax * ax + ay * ay) * (bx * cy2 - cx2 * by) - (bx * bx + by * by) * (ax * cy2 - cx2 * ay) + (cx2 * cx2 + cy2 * cy2) * (ax * by - bx * ay) > 0;
  };
  for (let i = 0; i < n; i++) {
    const p = S[i]!, mauvais = T.filter(t => dansCercle(t, p));
    /* le bord de la cavité : les côtés qui n'appartiennent qu'à un seul triangle retiré */
    const cote = (a: number, b: number) => (a < b ? a + ',' + b : b + ',' + a), compte = new Map<string, number>();
    for (const [a, b, c] of mauvais) for (const k of [cote(a, b), cote(b, c), cote(c, a)]) compte.set(k, (compte.get(k) ?? 0) + 1);
    const bords: [number, number][] = [];
    for (const [a, b, c] of mauvais) for (const [u, v] of [[a, b], [b, c], [c, a]] as [number, number][]) if (compte.get(cote(u, v)) === 1) bords.push([u, v]);
    T = T.filter(t => !mauvais.includes(t));
    for (const [u, v] of bords) T.push(orient(S[u]!, S[v]!, p) > 0 ? [u, v, i] : [v, u, i]);
  }
  /* sans le grand triangle, ni les triangles plats (points alignés) */
  return T.filter(t => t.every(k => k < n) && Math.abs(orient(P[t[0]]!, P[t[1]]!, P[t[2]]!)) > 1e-6);
}

/** les coordonnées barycentriques de p dans le triangle (a, b, c) */
export function barycentre(p: Point, a: Point, b: Point, c: Point): [number, number, number] {
  const d = orient(a, b, c);
  return [orient(p, b, c) / d, orient(a, p, c) / d, orient(a, b, p) / d];
}
