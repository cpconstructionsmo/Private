/* Propriété du solveur : sur une maison contrainte (rectangle horizontal /
   vertical, cloison en T, cote motrice, longueur fixe), des déplacements de
   sommets et de murs tirés au hasard sont acceptés ou refusés — mais après
   chaque déplacement accepté, TOUTES les contraintes et cotes motrices sont
   vraies à 0,01 mm, les angles restent fermés (aucun sommet ne se dédouble)
   et annuler rend exactement le plan d'avant. */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canonique, creerProjet, generateurSequentiel, type Floor, type Point, type Wall } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { mesurerCote } from '../../src/building';

type MurD = Wall & { axis: { a: Point; b: Point } };
const murs = (f: Floor) => Object.values(f.objects).filter((o): o is MurD => o.type === 'wall');
const d = (w: MurD) => ({ x: w.axis.b.x - w.axis.a.x, y: w.axis.b.y - w.axis.a.y });

function sommets(f: Floor): Point[] {
  const S: Point[] = [];
  for (const w of murs(f)) for (const p of [w.axis.a, w.axis.b]) if (!S.some(s => Math.hypot(s.x - p.x, s.y - p.y) <= 0.01)) S.push(p);
  return S;
}

/** l'écart de chaque contrainte du niveau (mm) */
function ecarts(f: Floor): number[] {
  const W = new Map(murs(f).map(w => [w.id, w]));
  const out: number[] = [];
  for (const o of Object.values(f.objects)) {
    if (o.type === 'constraint') {
      const [a, b] = o.walls.map(id => W.get(id)!);
      const u = d(a!), n = Math.hypot(u.x, u.y);
      if (o.kind === 'horizontal') out.push(u.y);
      if (o.kind === 'vertical') out.push(u.x);
      if (o.kind === 'length') out.push(n - o.value!);
      if (o.kind === 'parallel') { const v = d(b!); out.push((u.x * v.y - u.y * v.x) / n) }
      if (o.kind === 'perpendicular') { const v = d(b!); out.push((u.x * v.x + u.y * v.y) / n) }
    }
    if (o.type === 'dimension' && o.driving) out.push(mesurerCote(f, o)! - o.value!);
  }
  return out;
}

describe('propriété du solveur de contraintes', () => {
  it('300 suites de déplacements : contraintes vraies, angles fermés, annuler exact', () => {
    let t = 0;
    const a: Acteur = { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') };
    const p = creerProjet({ nom: 'P', id: generateurSequentiel('p') });
    const n = p.buildings[0]!.floors[0]!.id;
    const M = (x1: number, y1: number, x2: number, y2: number, e = 200): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: e });
    let r = executer(nouvelHistorique(p), 'Plan', [M(0, 0, 10_000, 0), M(10_000, 0, 10_000, 8_000), M(10_000, 8_000, 0, 8_000), M(0, 8_000, 0, 0), M(4_000, 0, 4_000, 8_000, 100)], a);
    if (!r.ok) throw new Error(r.erreurs.join());
    const [S, E, N, O, C] = murs(r.historique.projet.buildings[0]!.floors[0]!).map(w => w.id) as [string, string, string, string, string];
    r = executer(r.historique, 'Contraintes', [
      { type: 'ajouterContrainte', niveau: n, genre: 'horizontal', murs: [S] },
      { type: 'ajouterContrainte', niveau: n, genre: 'vertical', murs: [E] },
      { type: 'ajouterContrainte', niveau: n, genre: 'parallel', murs: [S, N] },
      { type: 'ajouterContrainte', niveau: n, genre: 'perpendicular', murs: [S, O] },
      { type: 'ajouterContrainte', niveau: n, genre: 'vertical', murs: [C] },
      { type: 'creerCote', niveau: n, refs: [{ objectId: S, feature: 'axis' }, { objectId: N, feature: 'axis' }], motrice: true },
    ], a);
    if (!r.ok) throw new Error(r.erreurs.join());
    const base = r.historique;
    const nSommets = sommets(base.projet.buildings[0]!.floors[0]!).length;

    const geste = fc.oneof(
      fc.record({ k: fc.constant('sommet' as const), i: fc.nat(20), dx: fc.integer({ min: -3_000, max: 3_000 }), dy: fc.integer({ min: -3_000, max: 3_000 }) }),
      fc.record({ k: fc.constant('mur' as const), i: fc.nat(20), dx: fc.integer({ min: -2_000, max: 2_000 }), dy: fc.integer({ min: -2_000, max: 2_000 }) }),
    );
    fc.assert(fc.property(fc.array(geste, { minLength: 1, maxLength: 8 }), gestes => {
      let h: Historique = base;
      for (const g of gestes) {
        const f = h.projet.buildings[0]!.floors[0]!;
        let cmd: Commande;
        if (g.k === 'sommet') {
          const L = sommets(f), s = L[g.i % L.length]!;
          cmd = { type: 'deplacerSommet', niveau: n, de: s, vers: { x: s.x + g.dx, y: s.y + g.dy } };
        } else {
          const w = murs(f)[g.i % 5]!;
          cmd = { type: 'deplacerMur', id: w.id, a: { x: w.axis.a.x + g.dx, y: w.axis.a.y + g.dy }, b: { x: w.axis.b.x + g.dx, y: w.axis.b.y + g.dy } };
        }
        const x = executer(h, g.k, [cmd], a);
        if (!x.ok) { expect(x.erreurs.length).toBeGreaterThan(0); continue }
        const avant = canonique(h.projet);
        h = x.historique;
        const f2 = h.projet.buildings[0]!.floors[0]!;
        for (const e of ecarts(f2)) expect(Math.abs(e)).toBeLessThanOrEqual(0.01);
        /* un angle ne s'ouvre jamais (un sommet lâché sur un autre peut, lui, s'y fondre) */
        expect(sommets(f2).length).toBeLessThanOrEqual(nSommets);
        expect(canonique(annuler(h).projet)).toBe(avant);
      }
    }), { numRuns: 300 });
  });
});
