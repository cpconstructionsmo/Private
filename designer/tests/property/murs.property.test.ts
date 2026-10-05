/* Propriétés des murs : pour un tour de murs quelconque (polygone convexe
   de 3 à 8 côtés, tourné, épaisseur de 10 à 50 cm), les contours dérivés
   - ne se recouvrent pas : la somme des murs = la maçonnerie ;
   - ferment un espace dont la surface est celle du polygone d'axe décalé
     d'une demi-épaisseur vers l'intérieur.
   Et pour une étoile de 3 à 6 murs qui partent d'un même point (angles et
   épaisseurs quelconques, avec ou sans mur traversant ou bouts alignés) :
   aucun vide au milieu de la jonction — à angles quelconques quand les
   murs ont la même épaisseur (et alors aucun recouvrement), à des
   multiples de 45° quand elles diffèrent (façade et cloisons). Des murs
   minces qui se rejoignent dans l'épaisseur d'un mur épais le chevauchent
   un peu : c'est un recouvrement, pas un vide, et il ne fait pas de
   fausse pièce. Des épaisseurs très différentes à des angles quelconques
   donnent des onglets très longs : cas à part, que ce test ne couvre pas. */
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

  it('jonction de 3 à 6 murs en un point : ni vide au centre, ni recouvrement', () => {
    const etoile = fc.record({
      /* des écarts d'au moins 25° entre murs voisins, normalisés au tour complet */
      ecarts: fc.array(fc.integer({ min: 25, max: 200 }), { minLength: 3, maxLength: 6 }),
      rot: fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
      e: fc.array(fc.integer({ min: 70, max: 300 }), { minLength: 6, maxLength: 6 }),
      /* 0 : tous des bouts ; 1 : le premier mur traverse le point ; 2 : le premier et son opposé, alignés et de même épaisseur */
      genre: fc.integer({ min: 0, max: 2 }),
      meme: fc.boolean(),
      /* des multiples de 45° : un tour de 8 cases, dont on garde 3 à 6 */
      cases: fc.uniqueArray(fc.integer({ min: 0, max: 7 }), { minLength: 3, maxLength: 6 }),
    });
    fc.assert(fc.property(etoile, ({ ecarts, rot, e: E, genre, meme, cases }) => {
      const e = meme ? E.map(() => E[0]!) : E;
      const tot = ecarts.reduce((s, x) => s + x, 0);
      let cumul = 0;
      const angles = meme ? ecarts.map(x => { const a = rot + (cumul / tot) * 2 * Math.PI; cumul += x; return a })
        : [...cases].sort((x, y) => x - y).map(k => rot + k * Math.PI / 4);
      /* au-dessous de 20° entre deux murs (le traversant compris), l'onglet est coupé d'équerre : cas à part */
      const tous = [...angles, ...(genre ? [angles[0]! + Math.PI] : [])].map(a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((x, y) => x - y);
      if (tous.some((a, i) => ((tous[(i + 1) % tous.length]! - a + 2 * Math.PI) % (2 * Math.PI)) * 180 / Math.PI < 20)) return true;
      const pt = (a: number, r = 3_000) => ({ x: Math.round(r * Math.cos(a)), y: Math.round(r * Math.sin(a)) });
      const p = creerProjet({ nom: 'P', id: generateurSequentiel('p') });
      const niv = p.buildings[0]!.floors[0]!.id;
      const O = { x: 0, y: 0 };
      const cmds: Commande[] = angles.map((a, i) => ({ type: 'creerMur', niveau: niv, a: O, b: pt(a), epaisseur: e[i]! }));
      if (genre === 1) cmds[0] = { type: 'creerMur', niveau: niv, a: pt(angles[0]! + Math.PI), b: pt(angles[0]!), epaisseur: e[0]! };
      if (genre === 2) cmds.push({ type: 'creerMur', niveau: niv, a: O, b: pt(angles[0]! + Math.PI), epaisseur: e[0]! });
      let t = 0;
      const r1 = executer(nouvelHistorique(p), 'Étoile', cmds, { par: 'CP', maintenant: () => String(t++), id: generateurSequentiel('o') });
      if (!r1.ok) return true;
      const f = r1.historique.projet.buildings[0]!.floors[0]!;
      const C = contoursMurs(mursDroits(f));
      const plan = planDuNiveau(f);
      const somme = C.reduce((s, c) => s + aire({ contour: c.contour }), 0);
      const mac = plan.maconnerie.reduce((s, x) => s + aire(x), 0);
      const perim = C.reduce((s, c) => s + c.contour.reduce((u, q, i) => { const w = c.contour[(i + 1) % c.contour.length]!; return u + Math.hypot(w.x - q.x, w.y - q.y) }, 0), 0);
      expect(plan.maconnerie.flatMap(x => x.trous ?? [])).toHaveLength(0);
      if (meme) expect(Math.abs(mac - somme)).toBeLessThan(perim * 0.01);
      return true;
    }), { numRuns: 2_000 });
  });
});
