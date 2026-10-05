/* Le terrain naturel : la triangulation de Delaunay des points cotés, et
   l'altitude qui s'en déduit partout (dans le relevé, au-dehors, avec un ou
   deux points) ; les points suivent la parcelle quand on l'implante. */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { delaunay } from '../../src/geometry/triangulation';
import { altitudeTerrain, profilTerrain } from '../../src/building/terrain';
import { creerProjet, generateurSequentiel, type Plot } from '../../src/model';
import { executer, nouvelHistorique, annuler, type Acteur } from '../../src/engine';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const plot = (spotHeights: Plot['spotHeights'], groundFloorNgf?: number) => ({ contour: [], street: [], north: 0, spotHeights, ...(groundFloorNgf !== undefined ? { groundFloorNgf } : {}) }) as unknown as Plot;

describe('triangulation de Delaunay', () => {
  it('un carré : deux triangles ; une grille 3 × 3 : huit ; des points alignés : aucun', () => {
    expect(delaunay([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toHaveLength(2);
    const G = [0, 1, 2].flatMap(i => [0, 1, 2].map(j => ({ x: i * 1_000, y: j * 1_000 + (i === 1 && j === 1 ? 3 : 0) })));
    expect(delaunay(G)).toHaveLength(8);
    expect(delaunay([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])).toHaveLength(0);
  });

  it('propriété : la somme des aires des triangles est l’aire de l’enveloppe convexe (aucun trou, aucun recouvrement)', () => {
    fc.assert(fc.property(fc.uniqueArray(fc.record({ x: fc.integer({ min: 0, max: 50 }), y: fc.integer({ min: 0, max: 50 }) }), { minLength: 3, maxLength: 25, selector: p => p.x + ',' + p.y }), P0 => {
      const P = P0.map(p => ({ x: p.x * 1_000, y: p.y * 1_000 }));
      const aire = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
      const T = delaunay(P);
      /* enveloppe convexe (Andrew) */
      const S = [...P].sort((a, b) => a.x - b.x || a.y - b.y), h: typeof P = [];
      for (const k of [0, 1]) { const base = h.length; for (const p of k ? [...S].reverse() : S) { while (h.length >= base + 2 && aire(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop(); h.push(p) } h.pop() }
      const env = h.reduce((s, p, i) => s + (p.x * h[(i + 1) % h.length]!.y - h[(i + 1) % h.length]!.x * p.y) / 2, 0);
      const somme = T.reduce((s, [i, j, k]) => s + aire(P[i]!, P[j]!, P[k]!), 0);
      expect(T.every(([i, j, k]) => aire(P[i]!, P[j]!, P[k]!) > 0)).toBe(true);
      expect(Math.abs(somme - env)).toBeLessThan(1e-3 * Math.max(1, env));
    }), { numRuns: 300 });
  });
});

describe('altitude du terrain naturel', () => {
  /* un terrain plan qui monte de 5 % vers le nord : z = 100 + 0,05 × y/1000 (m) */
  const plan = (x: number, y: number) => 100 + 0.05 * y / 1_000 + 0.01 * x / 1_000;
  const releve = [[0, 0], [20_000, 0], [20_000, 15_000], [0, 15_000], [9_000, 7_000]].map(([x, y]) => ({ point: { x: x!, y: y! }, ngf: plan(x!, y!) }));

  it('sur un relevé plan, l’altitude est exacte partout, dans le relevé comme au-dehors', () => {
    const t = plot(releve);
    for (const [x, y] of [[5_000, 5_000], [12_345, 9_876], [-3_000, 4_000], [25_000, 20_000]]) expect(altitudeTerrain(t, { x: x!, y: y! })).toBeCloseTo(plan(x!, y!), 9);
  });

  it('un seul point : plat ; deux points : la pente le long de leur ligne, plate en travers ; aucun point : null', () => {
    expect(altitudeTerrain(plot([{ point: { x: 0, y: 0 }, ngf: 52.3 }]), { x: 9_999, y: -4 })).toBe(52.3);
    const deux = plot([{ point: { x: 0, y: 0 }, ngf: 50 }, { point: { x: 0, y: 10_000 }, ngf: 51 }]);
    expect(altitudeTerrain(deux, { x: 0, y: 5_000 })).toBeCloseTo(50.5, 9);
    expect(altitudeTerrain(deux, { x: 7_000, y: 5_000 })).toBeCloseTo(50.5, 9);
    expect(altitudeTerrain(deux, { x: 0, y: 20_000 })).toBeCloseTo(52, 9);
    expect(altitudeTerrain(plot([]), { x: 0, y: 0 })).toBeNull();
  });

  it('le profil le long d’une coupe, en mm par rapport au ±0,00 ; sans altitude du ±0,00, pas de profil', () => {
    const P = profilTerrain(plot(releve, 100.5), { x: 0, y: 0 }, { x: 0, y: 10_000 }, 2_500)!;
    expect(P.map(q => q.s)).toEqual([0, 2_500, 5_000, 7_500, 10_000]);
    expect(P.map(q => q.z)).toEqual([-500, -375, -250, -125, 0]);
    expect(profilTerrain(plot(releve), { x: 0, y: 0 }, { x: 0, y: 10_000 })).toBeNull();
  });
});

describe('points cotés et parcelle', () => {
  it('saisis, refusés s’ils sont confondus ; la parcelle implantée (déplacée) les emporte, et l’annulation les ramène', () => {
    const a = acteur(), p = creerProjet({ nom: 'Terrain', id: generateurSequentiel('p') }), n = p.buildings[0]!.floors[0]!.id;
    const C = [{ x: 0, y: 0 }, { x: 20_000, y: 0 }, { x: 20_000, y: 15_000 }, { x: 0, y: 15_000 }];
    const r1 = executer(nouvelHistorique(p), 'x', [{ type: 'creerParcelle', niveau: n, contour: C, voies: [0] }], a);
    if (!r1.ok) throw new Error(r1.erreurs.join());
    const id = Object.values(r1.historique.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'plot')!.id;
    const conf = executer(r1.historique, 'x', [{ type: 'modifierParcelle', id, altitudesTerrain: [{ point: { x: 0, y: 0 }, ngf: 50 }, { point: { x: 50, y: 0 }, ngf: 51 }] }], a);
    expect(conf.ok ? '' : conf.erreurs.join()).toMatch(/10 cm/);
    const r2 = executer(r1.historique, 'x', [{ type: 'modifierParcelle', id, altitudesTerrain: [{ point: { x: 1_000, y: 1_000 }, ngf: 50 }, { point: { x: 19_000, y: 14_000 }, ngf: 52.4 }] }], a);
    if (!r2.ok) throw new Error(r2.erreurs.join());
    /* implanter : la limite glisse de 3 m vers l'est et 2 m vers le nord */
    const r3 = executer(r2.historique, 'x', [{ type: 'modifierParcelle', id, contour: C.map(q => ({ x: q.x + 3_000, y: q.y + 2_000 })) }], a);
    if (!r3.ok) throw new Error(r3.erreurs.join());
    const lire = (h: typeof r3.historique) => (Object.values(h.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'plot') as Plot).spotHeights;
    expect(lire(r3.historique)!.map(x => [x.point.x, x.point.y, x.ngf])).toEqual([[4_000, 3_000, 50], [22_000, 16_000, 52.4]]);
    expect(lire(annuler(r3.historique))!.map(x => [x.point.x, x.point.y])).toEqual([[1_000, 1_000], [19_000, 14_000]]);
  });
});
