/* Geometry Engine — tests de propriétés : des milliers de cas tirés au
   hasard (fast-check), et des invariants qui doivent toujours tenir.
   Critère d'acceptation de la Phase 1 : au moins 1 000 cas par propriété. */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  aire, decalerPolyligne, difference, distance, distancePointSegment, facesPlanaires, intersection,
  intersectionSegments, projeterSurSegment, rectangle, tourner, union, type Segment,
} from '../../src/geometry';
import type { Point } from '../../src/model/types';

const RUNS = 1_000;
const mm2 = (polys: { contour: readonly Point[]; trous?: readonly (readonly Point[])[] }[]): number => polys.reduce((t, p) => t + aire(p), 0);

/* coordonnées en mm entiers, sur un terrain de ±50 m */
const coord = fc.integer({ min: -50_000, max: 50_000 });
const pointA = fc.record({ x: coord, y: coord });
/* un rectangle d'au moins 10 mm de côté */
const rect = fc.record({ x: coord, y: coord, l: fc.integer({ min: 10, max: 20_000 }), h: fc.integer({ min: 10, max: 20_000 }) })
  .map(r => ({ contour: rectangle(r.x, r.y, r.l, r.h) }));
/* un polygone convexe : des angles triés autour d'un centre */
const convexe = fc.record({
  c: pointA, r: fc.integer({ min: 100, max: 20_000 }),
  angles: fc.uniqueArray(fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }), { minLength: 3, maxLength: 12, comparator: (a, b) => Math.abs(a - b) < 1e-3 }),
}).map(({ c, r, angles }) => [...angles].sort((a, b) => a - b).map(t => ({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) })));

describe('propriétés du Geometry Engine', () => {
  it('l’aire ne dépend ni d’une rotation ni d’une translation', () => {
    fc.assert(fc.property(convexe, fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), pointA, (P, angle, d) => {
      const a0 = aire({ contour: P });
      const Q = P.map(p => tourner(p, angle, d)).map(p => ({ x: p.x + d.x, y: p.y + d.y }));
      /* plancher des flottants : ~1e-16 × (taille de la scène)² par sommet —
         moins de 1e-5 mm² pour une scène de 100 m, négligeable */
      const R = Math.max(...Q.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))), ...P.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))));
      return Math.abs(aire({ contour: Q }) - a0) <= 1e-9 * a0 + 1e-15 * P.length * R * R;
    }), { numRuns: RUNS });
  });

  it('A ∪ B = A + B − A ∩ B (au mm² près)', () => {
    fc.assert(fc.property(rect, rect, (A, B) => {
      const u = mm2(union([A, B])), i = mm2(intersection([A], [B]));
      return Math.abs(u - (aire(A) + aire(B) - i)) <= 1;
    }), { numRuns: RUNS });
  });

  it('(A − B) + (A ∩ B) = A', () => {
    fc.assert(fc.property(rect, rect, (A, B) => Math.abs(mm2(difference([A], [B])) + mm2(intersection([A], [B])) - aire(A)) <= 1), { numRuns: RUNS });
  });

  it('l’union ne dépend pas de l’ordre', () => {
    fc.assert(fc.property(rect, rect, rect, (A, B, C) => Math.abs(mm2(union([A, B, C])) - mm2(union([C, A, B]))) <= 1), { numRuns: RUNS });
  });

  it('projeter deux fois = projeter une fois ; la projection est le point le plus proche', () => {
    fc.assert(fc.property(pointA, pointA, pointA, (a, b, p) => {
      const s: Segment = { a, b };
      const q = projeterSurSegment(p, s).point, q2 = projeterSurSegment(q, s).point;
      const d = distancePointSegment(p, s);
      return distance(q, q2) <= 1e-6 && d <= distance(p, a) + 1e-6 && d <= distance(p, b) + 1e-6;
    }), { numRuns: RUNS });
  });

  it('l’intersection de deux segments ne dépend pas de leur ordre', () => {
    fc.assert(fc.property(pointA, pointA, pointA, pointA, (a, b, c, d) => {
      const x = intersectionSegments({ a, b }, { a: c, b: d }), y = intersectionSegments({ a: c, b: d }, { a, b });
      if (x.type !== y.type) return false;
      if (x.type === 'point' && y.type === 'point') return distance(x.point, y.point) <= 0.02;
      return true;
    }), { numRuns: RUNS });
  });

  it('décaler un rectangle vers l’intérieur puis vers l’extérieur le rend intact', () => {
    fc.assert(fc.property(fc.integer({ min: 1_000, max: 20_000 }), fc.integer({ min: 1_000, max: 20_000 }), fc.integer({ min: 1, max: 400 }), (l, h, d) => {
      const R = rectangle(0, 0, l, h);
      const retour = decalerPolyligne(decalerPolyligne(R, d, true), -d, true);
      return retour.length === 4 && retour.every((p, i) => distance(p, R[i]!) <= 1e-6);
    }), { numRuns: RUNS });
  });

  it('une grille de murs : (n+1)(m+1) pièces, dont la somme fait la surface totale', () => {
    const positions = (max: number) => fc.uniqueArray(fc.integer({ min: 1, max: max - 1 }), { maxLength: 4, comparator: (a, b) => Math.abs(a - b) < 50 })
      .filter(xs => xs.every(x => x >= 50 && x <= max - 50));
    fc.assert(fc.property(fc.integer({ min: 2_000, max: 20_000 }), fc.integer({ min: 2_000, max: 20_000 }), fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
      (L, H, angle) => fc.assert(fc.property(positions(L), positions(H), (xs, ys) => {
        const S: Segment[] = [];
        const R = rectangle(0, 0, L, H);
        R.forEach((p, i) => S.push({ a: p, b: R[(i + 1) % 4]! }));
        xs.forEach(x => S.push({ a: { x, y: 0 }, b: { x, y: H } }));
        ys.forEach(y => S.push({ a: { x: 0, y }, b: { x: L, y } }));
        const T = S.map(s => ({ a: tourner(s.a, angle), b: tourner(s.b, angle) }));
        const f = facesPlanaires(T);
        const total = f.reduce((t, x) => t + x.aire, 0);
        return f.length === (xs.length + 1) * (ys.length + 1) && Math.abs(total - L * H) <= 1e-6 * L * H;
      }), { numRuns: 5 })), { numRuns: 200 });
  });
});

it('les faces ne dépendent pas de l’ordre des segments', () => {
  const S: Segment[] = [];
  const R = rectangle(0, 0, 10_000, 8_000);
  R.forEach((p, i) => S.push({ a: p, b: R[(i + 1) % 4]! }));
  S.push({ a: { x: 4_000, y: 0 }, b: { x: 4_000, y: 8_000 } }, { a: { x: 4_000, y: 3_000 }, b: { x: 10_000, y: 3_000 } });
  const ref = facesPlanaires(S).map(f => Math.round(f.aire)).sort();
  fc.assert(fc.property(fc.shuffledSubarray(S, { minLength: S.length, maxLength: S.length }), P => {
    expect(facesPlanaires(P).map(f => Math.round(f.aire)).sort()).toEqual(ref);
  }), { numRuns: 200 });
});
