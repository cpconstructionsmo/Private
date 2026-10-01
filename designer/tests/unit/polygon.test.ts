/* Premiers tests métier du Geometry Engine (spécification, section 26 :
   « rectangle 10 x 8 m -> 80 m2, tolérances connues »). */
import { describe, expect, it } from 'vitest';
import { aire, aireSignee, mm2EnM2, perimetre, rectangle } from '../../src/geometry/polygon';
import { EPS_COINCIDENCE, egal } from '../../src/geometry/tolerance';

describe('aire et périmètre', () => {
  it('rectangle 10 × 8 m → 80,00 m²', () => {
    const s = mm2EnM2(aire({ contour: rectangle(0, 0, 10_000, 8_000) }));
    expect(Math.abs(s - 80)).toBeLessThan(1e-9);
  });

  it('la surface ne dépend ni du sens de saisie ni de la position', () => {
    const r = rectangle(123_456.7, -98_765.4, 10_000, 8_000);
    expect(aireSignee([...r].reverse())).toBeCloseTo(-aireSignee(r), 6);
    expect(mm2EnM2(aire({ contour: [...r].reverse() }))).toBeCloseTo(80, 9);
  });

  it('pièce intérieure de murs de 20 cm dessinés à l’axe : 9,80 × 7,80 = 76,44 m²', () => {
    const e = 200;
    const s = mm2EnM2(aire({ contour: rectangle(e / 2, e / 2, 10_000 - e, 8_000 - e) }));
    expect(s).toBeCloseTo(76.44, 9);
  });

  it('un trou se déduit (trémie de 2 × 1 m)', () => {
    const s = mm2EnM2(aire({ contour: rectangle(0, 0, 10_000, 8_000), trous: [rectangle(1_000, 1_000, 2_000, 1_000)] }));
    expect(s).toBeCloseTo(78, 9);
  });

  it('périmètre du rectangle 10 × 8 m : 36 m', () => {
    expect(perimetre(rectangle(0, 0, 10_000, 8_000))).toBe(36_000);
  });

  it('tolérance de coïncidence : 0,01 mm', () => {
    expect(egal(1000, 1000 + EPS_COINCIDENCE)).toBe(true);
    expect(egal(1000, 1000 + 2 * EPS_COINCIDENCE)).toBe(false);
  });
});
