/* Les traits d'un motif de sol coupés au contour d'une pièce (plan de
   présentation) : rien ne déborde, une pièce en L ou avec un trou coupe le
   trait en morceaux, les joints du parquet sont décalés d'un rang à l'autre. */
import { describe, expect, it } from 'vitest';
import { segmentsDans, traitsDeMotif, MAX_TRAITS } from '../../src/geometry/hachures';
import { motifEnPlan, SOLS } from '../../src/catalogue/materiaux';
import type { Polygone } from '../../src/geometry/polygon';

const R = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const long = (S: [{ x: number; y: number }, { x: number; y: number }][]) => S.reduce((t, [a, b]) => t + Math.hypot(b.x - a.x, b.y - a.y), 0);

describe('traits coupés au contour', () => {
  it('un trait à travers un rectangle : le seul morceau intérieur', () => {
    const S = segmentsDans({ x: -500, y: 300 }, { x: 2_000, y: 300 }, { contour: R(0, 0, 1_000, 600) });
    expect(S).toEqual([[{ x: 0, y: 300 }, { x: 1_000, y: 300 }]]);
  });

  it('une pièce en L : le trait qui passe devant l’angle rentrant est coupé en deux ; un trou aussi', () => {
    const L: Polygone = { contour: [{ x: 0, y: 0 }, { x: 3_000, y: 0 }, { x: 3_000, y: 1_000 }, { x: 1_000, y: 1_000 }, { x: 1_000, y: 3_000 }, { x: 0, y: 3_000 }] };
    expect(segmentsDans({ x: 500, y: -10 }, { x: 500, y: 4_000 }, L)).toEqual([[{ x: 500, y: 0 }, { x: 500, y: 3_000 }]]);
    expect(segmentsDans({ x: 2_000, y: -10 }, { x: 2_000, y: 4_000 }, L).map(([a, b]) => [Math.round(a.y), Math.round(b.y)])).toEqual([[0, 1_000]]);
    const troue: Polygone = { contour: R(0, 0, 3_000, 3_000), trous: [R(1_000, 1_000, 2_000, 2_000).reverse()] };
    expect(segmentsDans({ x: -1, y: 1_500 }, { x: 3_001, y: 1_500 }, troue).map(([a, b]) => [Math.round(a.x), Math.round(b.x)])).toEqual([[0, 1_000], [2_000, 3_000]]);
  });

  it('carreaux de 60 × 60 dans une pièce de 3 × 2 m calée hors de la grille : toutes les lignes intérieures, rien au-dehors', () => {
    const P: Polygone = { contour: R(100, 100, 3_100, 2_100) };
    const S = traitsDeMotif({ genre: 'grille', pas: 600 }, P);
    /* verticales en 600, 1 200 … 3 000 (5 de 2 m) ; horizontales en 600, 1 200, 1 800 (3 de 3 m) */
    expect(long(S)).toBeCloseTo(5 * 2_000 + 3 * 3_000, 6);
    expect(S.every(([a, b]) => [a, b].every(p => p.x >= 100 - 1e-9 && p.x <= 3_100 + 1e-9 && p.y >= 100 - 1e-9 && p.y <= 2_100 + 1e-9))).toBe(true);
  });

  it('parquet : des rangs de 18 cm, et des joints d’about décalés d’une demi-lame d’un rang à l’autre', () => {
    const m = motifEnPlan(SOLS.find(x => x.id === 'parquet-chene')!)!;
    expect(m).toEqual({ genre: 'rangs', pas: 180, longueur: 1_080 });
    const S = traitsDeMotif(m, { contour: R(0, 0, 3_240, 360) });
    const joints = S.filter(([a, b]) => a.x === b.x);
    /* (un joint qui tombe sur la face du mur ne se voit pas : on compare ceux de l'intérieur) */
    const rang = (y: number) => joints.filter(([a]) => a.y === y && a.x > 0 && a.x < 3_240).map(([a]) => a.x).sort((p, q) => p - q);
    expect(rang(0)).toEqual([1_080, 2_160]);
    expect(rang(180)).toEqual([540, 1_620, 2_700]);
  });

  it('un sol uni n’a pas de motif ; un motif trop fin pour la pièce n’est pas dessiné', () => {
    expect(motifEnPlan(SOLS.find(x => x.id === 'beton-cire')!)).toBeNull();
    expect(traitsDeMotif({ genre: 'grille', pas: 1 }, { contour: R(0, 0, MAX_TRAITS, MAX_TRAITS) })).toEqual([]);
  });
});
