/* Propriétés des murs : pour un tour de murs quelconque (polygone convexe
   de 3 à 8 côtés, tourné, épaisseur de 10 à 50 cm), les contours dérivés
   - ne se recouvrent pas : la somme des murs = la maçonnerie ;
   - ferment un espace dont la surface est celle du polygone d'axe décalé
     d'une demi-épaisseur vers l'intérieur. */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { creerProjet, generateurSequentiel } from '../../src/model';
import { executer, nouvelHistorique, type Commande } from '../../src/engine';
import { contoursMurs, mursDroits, planDuNiveau } from '../../src/building';
import { aire, decalerPolyligne } from '../../src/geometry';

const tour = fc.record({
  n: fc.integer({ min: 3, max: 8 }),
  r: fc.integer({ min: 3_000, max: 15_000 }),
  rot: fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
  e: fc.integer({ min: 100, max: 500 }),
  cx: fc.integer({ min: -50_000, max: 50_000 }), cy: fc.integer({ min: -50_000, max: 50_000 }),
});

describe('propriétés des murs', () => {
  it('pas de recouvrement, et l’espace clos a la surface attendue', () => {
    fc.assert(fc.property(tour, ({ n, r, rot, e, cx, cy }) => {
      const P = Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos(rot + (2 * Math.PI * i) / n), y: cy + r * Math.sin(rot + (2 * Math.PI * i) / n) }));
      const p = creerProjet({ nom: 'P', id: generateurSequentiel('p') });
      const niv = p.buildings[0]!.floors[0]!.id;
      const cmds: Commande[] = P.map((a, i) => ({ type: 'creerMur', niveau: niv, a, b: P[(i + 1) % n]!, epaisseur: e }));
      let t = 0;
      const r1 = executer(nouvelHistorique(p), 'Tour', cmds, { par: 'CP', maintenant: () => String(t++), id: generateurSequentiel('o') });
      if (!r1.ok) return false;
      const f = r1.historique.projet.buildings[0]!.floors[0]!;
      const C = contoursMurs(mursDroits(f));
      const plan = planDuNiveau(f);
      const somme = C.reduce((s, c) => s + aire({ contour: c.contour }), 0);
      const mac = plan.maconnerie.reduce((s, x) => s + aire(x), 0);
      const perim = C.reduce((s, c) => s + c.contour.reduce((u, q, i) => { const w = c.contour[(i + 1) % c.contour.length]!; return u + Math.hypot(w.x - q.x, w.y - q.y) }, 0), 0);
      const attendu = aire({ contour: decalerPolyligne(P, e / 2, true) });
      expect(plan.zones).toHaveLength(1);
      expect(Math.abs(mac - somme)).toBeLessThan(perim * 0.01);
      expect(Math.abs(plan.zones[0]!.aire - attendu)).toBeLessThan(perim * 0.01);
      return true;
    }), { numRuns: 1_000 });
  });
});
