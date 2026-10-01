/* Annuler / rétablir et journal des ChangeSets, sur des suites d'actions
   tirées au hasard (acceptées ou refusées) :
   - annuler tout ramène le projet de départ, octet pour octet, et chaque
     état intermédiaire est retrouvé exactement ;
   - rétablir tout redonne l'état final ;
   - rejouer le journal des ChangeSets (ce qui sera enregistré) sur le
     projet de départ redonne le même projet. */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canonique, creerProjet, generateurSequentiel, type Project } from '../../src/model';
import { annuler, appliquerTout, executer, nouvelHistorique, retablir, type Acteur, type Commande, type Historique } from '../../src/engine';

type Action =
  | { k: 'mur'; x1: number; y1: number; x2: number; y2: number; e: number }
  | { k: 'deplacer'; i: number; dx: number; dy: number }
  | { k: 'epaisseur'; i: number; e: number }
  | { k: 'ouverture'; i: number; pos: number; l: number }
  | { k: 'piece'; x: number; y: number; nom: string }
  | { k: 'renommerPiece'; i: number; nom: string }
  | { k: 'supprimer'; i: number }
  | { k: 'niveau'; alt: number }
  | { k: 'transaction'; n: number };

const c = fc.integer({ min: -20_000, max: 20_000 });
const action: fc.Arbitrary<Action> = fc.oneof(
  fc.record({ k: fc.constant('mur' as const), x1: c, y1: c, x2: c, y2: c, e: fc.integer({ min: -50, max: 400 }) }),
  fc.record({ k: fc.constant('deplacer' as const), i: fc.nat(30), dx: fc.integer({ min: -3_000, max: 3_000 }), dy: fc.integer({ min: -3_000, max: 3_000 }) }),
  fc.record({ k: fc.constant('epaisseur' as const), i: fc.nat(30), e: fc.integer({ min: -50, max: 400 }) }),
  fc.record({ k: fc.constant('ouverture' as const), i: fc.nat(30), pos: fc.integer({ min: 0, max: 20_000 }), l: fc.integer({ min: -100, max: 4_000 }) }),
  fc.record({ k: fc.constant('piece' as const), x: c, y: c, nom: fc.constantFrom('Séjour', 'Chambre', '', 'Cuisine') }),
  fc.record({ k: fc.constant('renommerPiece' as const), i: fc.nat(30), nom: fc.constantFrom('Bureau', '', 'Cellier') }),
  fc.record({ k: fc.constant('supprimer' as const), i: fc.nat(30) }),
  fc.record({ k: fc.constant('niveau' as const), alt: fc.integer({ min: -3_000, max: 6_000 }) }),
  fc.record({ k: fc.constant('transaction' as const), n: fc.integer({ min: 2, max: 5 }) }),
);

function commandesDe(p: Project, a: Action): Commande[] {
  const f = p.buildings[0]!.floors[0]!;
  const O = Object.values(f.objects);
  const murs = O.filter(o => o.type === 'wall'), pieces = O.filter(o => o.type === 'room');
  const pris = <T>(L: T[], i: number): T | undefined => (L.length ? L[i % L.length] : undefined);
  switch (a.k) {
    case 'mur': return [{ type: 'creerMur', niveau: f.id, a: { x: a.x1, y: a.y1 }, b: { x: a.x2, y: a.y2 }, epaisseur: a.e }];
    case 'deplacer': { const w = pris(murs, a.i); if (!w || w.type !== 'wall' || !('a' in w.axis)) return [];
      return [{ type: 'deplacerMur', id: w.id, b: { x: w.axis.b.x + a.dx, y: w.axis.b.y + a.dy } }] }
    case 'epaisseur': { const w = pris(murs, a.i); return w ? [{ type: 'modifierMur', id: w.id, epaisseur: a.e }] : [] }
    case 'ouverture': { const w = pris(murs, a.i); return w ? [{ type: 'creerOuverture', mur: w.id, position: a.pos, largeur: a.l, hauteur: 2_150, genre: 'window' }] : [] }
    case 'piece': return [{ type: 'creerPiece', niveau: f.id, point: { x: a.x, y: a.y }, nom: a.nom, usage: 'other' }];
    case 'renommerPiece': { const r = pris(pieces, a.i); return r ? [{ type: 'modifierPiece', id: r.id, nom: a.nom }] : [] }
    case 'supprimer': { const o = pris(O, a.i); return o ? [{ type: 'supprimer', id: o.id }] : [] }
    case 'niveau': return [{ type: 'ajouterNiveau', batiment: p.buildings[0]!.id, nom: 'N' + a.alt, altitude: a.alt, hauteur: 2_500 }];
    case 'transaction': {
      const L: Commande[] = [];
      for (let k = 0; k < a.n; k++) L.push({ type: 'creerMur', niveau: f.id, a: { x: k * 1_000, y: 0 }, b: { x: k * 1_000, y: 2_000 }, epaisseur: 100 });
      return L;
    }
  }
}

describe('propriétés de l’historique', () => {
  it('annuler tout = départ ; chaque état intermédiaire retrouvé ; rétablir tout = arrivée ; journal rejoué = arrivée', () => {
    fc.assert(fc.property(fc.array(action, { minLength: 1, maxLength: 40 }), actions => {
      let t = 0;
      const a: Acteur = { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') };
      const depart = creerProjet({ nom: 'P', id: generateurSequentiel('p') });
      let h: Historique = nouvelHistorique(depart);
      const etats = [canonique(depart)];
      for (const ac of actions) {
        const cmds = commandesDe(h.projet, ac);
        if (!cmds.length) continue;
        const r = executer(h, ac.k, cmds, a);
        if (r.ok) { h = r.historique; etats.push(canonique(h.projet)) }
      }
      const arrivee = canonique(h.projet);
      /* le journal : rejoué sur le départ, il redonne l'arrivée */
      expect(canonique(h.passe.reduce((p, cs) => appliquerTout(p, cs.operations), depart))).toBe(arrivee);
      expect(canonique(JSON.parse(JSON.stringify(h.passe)))).toBe(canonique(h.passe));     // ChangeSets sérialisables tels quels
      for (let i = etats.length - 2; i >= 0; i--) { h = annuler(h); expect(canonique(h.projet)).toBe(etats[i]) }
      for (let i = 1; i < etats.length; i++) { h = retablir(h); expect(canonique(h.projet)).toBe(etats[i]) }
      expect(canonique(h.projet)).toBe(arrivee);
    }), { numRuns: 500 });
  });
});
