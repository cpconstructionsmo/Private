/* Geometry Engine — cas exacts : prédicats, segments, décalage, booléens,
   faces d'un graphe planaire. Les surfaces sont vérifiées au mm² près. */
import { describe, expect, it } from 'vitest';
import {
  aire, alignes, centroide, decalerPolyligne, decalerSegment, difference, distancePointSegment, EPS_COINCIDENCE,
  facesPlanaires, intersection, intersectionDroites, intersectionSegments, mm2EnM2, orientation, positionDansAnneau,
  projeterSurSegment, rectangle, union, type Segment,
} from '../../src/geometry';

const seg = (x1: number, y1: number, x2: number, y2: number): Segment => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });
const m2 = (polys: { contour: readonly { x: number; y: number }[]; trous?: readonly (readonly { x: number; y: number }[])[] }[]): number =>
  mm2EnM2(polys.reduce((t, p) => t + aire(p), 0));

describe('prédicats', () => {
  it('orientation : gauche, droite, aligné (à 0,01 mm près)', () => {
    const a = { x: 0, y: 0 }, b = { x: 10_000, y: 0 };
    expect(orientation(a, b, { x: 5_000, y: 1 })).toBe(1);
    expect(orientation(a, b, { x: 5_000, y: -1 })).toBe(-1);
    expect(orientation(a, b, { x: 5_000, y: EPS_COINCIDENCE / 2 })).toBe(0);
    expect(alignes(a, b, { x: 20_000, y: 0.005 })).toBe(true);
  });

  it('un point dans, hors, sur le bord d’une pièce', () => {
    const r = rectangle(0, 0, 4_000, 3_000);
    expect(positionDansAnneau({ x: 2_000, y: 1_500 }, r)).toBe('dedans');
    expect(positionDansAnneau({ x: 5_000, y: 1_500 }, r)).toBe('dehors');
    expect(positionDansAnneau({ x: 4_000, y: 1_000 }, r)).toBe('bord');
    expect(positionDansAnneau({ x: 0, y: 0 }, r)).toBe('bord');
  });
});

describe('segments', () => {
  it('projection et distance', () => {
    const s = seg(0, 0, 10_000, 0);
    expect(projeterSurSegment({ x: 3_000, y: 500 }, s).point).toEqual({ x: 3_000, y: 0 });
    expect(projeterSurSegment({ x: -2_000, y: 500 }, s).t).toBe(0);
    expect(distancePointSegment({ x: 12_000, y: 0 }, s)).toBe(2_000);
  });

  it('croisement', () => {
    const x = intersectionSegments(seg(0, 0, 10_000, 10_000), seg(0, 10_000, 10_000, 0));
    expect(x.type).toBe('point');
    if (x.type === 'point') expect(x.point).toEqual({ x: 5_000, y: 5_000 });
  });

  it('jonction en T : contact par une extrémité', () => {
    const x = intersectionSegments(seg(0, 0, 10_000, 0), seg(4_000, 0, 4_000, 3_000));
    expect(x.type).toBe('point');
    if (x.type === 'point') { expect(x.point).toEqual({ x: 4_000, y: 0 }); expect(x.u).toBe(0) }
  });

  it('presque en contact : 0,005 mm d’écart = contact ; 1 mm = rien', () => {
    expect(intersectionSegments(seg(0, 0, 10_000, 0), seg(4_000, 0.005, 4_000, 3_000)).type).toBe('point');
    expect(intersectionSegments(seg(0, 0, 10_000, 0), seg(4_000, 1, 4_000, 3_000)).type).toBe('aucune');
  });

  it('parallèles non alignés : aucune ; alignés qui se recouvrent : chevauchement', () => {
    expect(intersectionSegments(seg(0, 0, 10_000, 0), seg(0, 200, 10_000, 200)).type).toBe('aucune');
    const x = intersectionSegments(seg(0, 0, 10_000, 0), seg(6_000, 0, 14_000, 0));
    expect(x).toEqual({ type: 'chevauchement', debut: { x: 6_000, y: 0 }, fin: { x: 10_000, y: 0 } });
  });

  it('alignés bout à bout : un seul point de contact', () => {
    const x = intersectionSegments(seg(0, 0, 5_000, 0), seg(5_000, 0, 9_000, 0));
    expect(x.type).toBe('point');
    if (x.type === 'point') expect(x.point).toEqual({ x: 5_000, y: 0 });
  });

  it('droites presque parallèles (0,001°) : intersection loin, mais calculée sans erreur', () => {
    const a = 0.001 * Math.PI / 180;
    const p = intersectionDroites(seg(0, 0, 10_000, 0), seg(0, 100, 10_000, 100 - 10_000 * Math.tan(a)));
    expect(p).not.toBeNull();
    expect(p!.y).toBeCloseTo(0, 6);
  });
});

describe('décalage (faces d’un mur)', () => {
  it('un mur de 5 m, épaisseur 20 cm : faces à ±100 mm de l’axe', () => {
    const g = decalerSegment(seg(0, 0, 5_000, 0), 100), d = decalerSegment(seg(0, 0, 5_000, 0), -100);
    expect(g).toEqual({ a: { x: 0, y: 100 }, b: { x: 5_000, y: 100 } });
    expect(d).toEqual({ a: { x: 0, y: -100 }, b: { x: 5_000, y: -100 } });
  });

  it('angle droit : l’onglet tombe exactement à l’angle intérieur', () => {
    const p = decalerPolyligne([{ x: 0, y: 0 }, { x: 5_000, y: 0 }, { x: 5_000, y: 4_000 }], 100);
    expect(p).toEqual([{ x: 0, y: 100 }, { x: 4_900, y: 100 }, { x: 4_900, y: 4_000 }]);
  });

  it('contour fermé 10 × 8 m décalé de 100 mm vers l’intérieur : 9,80 × 7,80 m', () => {
    const p = decalerPolyligne(rectangle(0, 0, 10_000, 8_000), 100, true);
    expect(mm2EnM2(aire({ contour: p }))).toBeCloseTo(76.44, 9);
  });

  it('angle très aigu : biseau au lieu d’une pointe démesurée', () => {
    const p = decalerPolyligne([{ x: 0, y: 0 }, { x: 10_000, y: 0 }, { x: 0, y: 200 }], 100);
    expect(p.length).toBe(4);
  });
});

describe('opérations booléennes (entiers, 0,01 mm)', () => {
  const r = (x: number, y: number, l: number, h: number) => ({ contour: rectangle(x, y, l, h) });

  it('union de deux rectangles qui se recouvrent : 6 + 6 − 2 = 10 m²', () => {
    const u = union([r(0, 0, 3_000, 2_000), r(2_000, 0, 3_000, 2_000)]);
    expect(u.length).toBe(1);
    expect(m2(u)).toBeCloseTo(10, 9);
  });

  it('quatre murs de 20 cm autour d’un 10 × 8 m d’axe : un contour, un trou de 76,44 m²', () => {
    const e = 200, murs = [r(-100, -100, 10_200, e), r(-100, 7_900, 10_200, e), r(-100, -100, e, 8_200), r(9_900, -100, e, 8_200)];
    const u = union(murs);
    expect(u.length).toBe(1);
    expect(u[0]!.trous?.length).toBe(1);
    expect(mm2EnM2(aire({ contour: u[0]!.trous![0]! }))).toBeCloseTo(76.44, 9);
    expect(m2(u)).toBeCloseTo(10.2 * 8.2 - 76.44, 9);
  });

  it('différence : une trémie de 2 × 1 m dans une dalle de 10 × 8 m', () => {
    const d = difference([r(0, 0, 10_000, 8_000)], [r(1_000, 1_000, 2_000, 1_000)]);
    expect(d.length).toBe(1);
    expect(d[0]!.trous?.length).toBe(1);
    expect(m2(d)).toBeCloseTo(78, 9);
  });

  it('intersection : la partie commune', () => {
    expect(m2(intersection([r(0, 0, 3_000, 2_000)], [r(2_000, 1_000, 3_000, 2_000)]))).toBeCloseTo(1, 9);
    expect(intersection([r(0, 0, 1_000, 1_000)], [r(5_000, 0, 1_000, 1_000)])).toEqual([]);
  });

  it('une île dans un trou reste un polygone à part', () => {
    const cadre = { contour: rectangle(0, 0, 10_000, 10_000), trous: [rectangle(2_000, 2_000, 6_000, 6_000)] };
    const u = union([cadre, r(4_000, 4_000, 2_000, 2_000)]);
    expect(u.length).toBe(2);
    expect(m2(u)).toBeCloseTo(100 - 36 + 4, 9);
  });

  it('sens normalisé : contours trigonométriques, trous horaires', () => {
    const d = difference([r(0, 0, 10_000, 8_000)], [r(1_000, 1_000, 2_000, 1_000)]);
    const s = (a: readonly { x: number; y: number }[]) => a.reduce((t, p, i) => { const q = a[(i + 1) % a.length]!; return t + p.x * q.y - q.x * p.y }, 0);
    expect(s(d[0]!.contour)).toBeGreaterThan(0);
    expect(s(d[0]!.trous![0]!)).toBeLessThan(0);
  });
});

describe('faces d’un graphe planaire (pièces lues dans un tracé)', () => {
  it('un rectangle 10 × 8 m : une face de 80 m²', () => {
    const f = facesPlanaires([seg(0, 0, 10_000, 0), seg(10_000, 0, 10_000, 8_000), seg(10_000, 8_000, 0, 8_000), seg(0, 8_000, 0, 0)]);
    expect(f.length).toBe(1);
    expect(mm2EnM2(f[0]!.aire)).toBeCloseTo(80, 9);
  });

  it('une cloison en T coupe la pièce en deux : 32 + 48 m²', () => {
    const f = facesPlanaires([seg(0, 0, 10_000, 0), seg(10_000, 0, 10_000, 8_000), seg(10_000, 8_000, 0, 8_000), seg(0, 8_000, 0, 0),
      seg(4_000, 0, 4_000, 8_000)]);
    expect(f.map(x => mm2EnM2(x.aire)).sort((a, b) => a - b)).toEqual([32, 48]);
  });

  it('des segments qui débordent et se croisent : seules les régions fermées', () => {
    /* un « # » : 4 traits qui se croisent, une seule case fermée au milieu */
    const f = facesPlanaires([seg(-1_000, 0, 4_000, 0), seg(-1_000, 3_000, 4_000, 3_000), seg(0, -1_000, 0, 4_000), seg(3_000, -1_000, 3_000, 4_000)]);
    expect(f.length).toBe(1);
    expect(mm2EnM2(f[0]!.aire)).toBeCloseTo(9, 9);
  });

  it('un mur qui ne rejoint rien ne ferme rien', () => {
    const f = facesPlanaires([seg(0, 0, 10_000, 0), seg(10_000, 0, 10_000, 8_000), seg(10_000, 8_000, 0, 8_000), seg(0, 8_000, 0, 0),
      seg(4_000, 0, 4_000, 5_000)]);
    expect(f.length).toBe(1);
    expect(mm2EnM2(f[0]!.aire)).toBeCloseTo(80, 9);
  });

  it('un tracé ouvert : aucune face (rien n’est deviné)', () => {
    expect(facesPlanaires([seg(0, 0, 10_000, 0), seg(10_000, 0, 10_000, 8_000), seg(10_000, 8_000, 0, 8_000)])).toEqual([]);
  });

  it('une île (un poteau creux) dans une pièce : un trou dans la face', () => {
    const carre = (x: number, y: number, c: number) => { const r = rectangle(x, y, c, c); return r.map((p, i) => ({ a: p, b: r[(i + 1) % 4]! })) };
    const f = facesPlanaires([...carre(0, 0, 10_000), ...carre(4_000, 4_000, 1_000)]);
    const grande = f.find(x => x.trous?.length);
    expect(f.length).toBe(2);
    expect(mm2EnM2(grande!.aire)).toBeCloseTo(99, 9);
  });

  it('extrémités à 0,005 mm l’une de l’autre : un seul sommet', () => {
    const f = facesPlanaires([seg(0, 0, 10_000, 0), seg(10_000.004, 0, 10_000, 8_000), seg(10_000, 8_000, 0, 8_000.003), seg(0, 8_000, 0, 0)]);
    expect(f.length).toBe(1);
  });

  it('deux murs posés l’un sur l’autre (chevauchement) : pas de face fantôme', () => {
    const f = facesPlanaires([seg(0, 0, 10_000, 0), seg(3_000, 0, 7_000, 0), seg(10_000, 0, 10_000, 8_000), seg(10_000, 8_000, 0, 8_000), seg(0, 8_000, 0, 0)]);
    expect(f.length).toBe(1);
    expect(mm2EnM2(f[0]!.aire)).toBeCloseTo(80, 9);
  });

  it('centre de gravité d’une pièce en L : exact, et HORS de la pièce', () => {
    /* (4 × 1 × 2 + 3 × 1 × 0,5) / 7 = 1,357 m : le centre de gravité d'un L
       tombe dehors. C'est pourquoi une pièce est retrouvée par un point
       intérieur choisi (seed), jamais par son centre de gravité. */
    const L = [{ x: 0, y: 0 }, { x: 4_000, y: 0 }, { x: 4_000, y: 1_000 }, { x: 1_000, y: 1_000 }, { x: 1_000, y: 4_000 }, { x: 0, y: 4_000 }];
    const c = centroide(L);
    expect(c.x).toBeCloseTo(9_500 / 7, 6);
    expect(c.y).toBeCloseTo(9_500 / 7, 6);
    expect(positionDansAnneau(c, L)).toBe('dehors');
  });
});
