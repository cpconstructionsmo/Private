/* Couper un mur en deux, fusionner deux murs alignés : les ouvertures, les
   zones de parement et les cotes suivent la bonne partie ; ce qui ne peut
   pas suivre (coupure dans une baie, contrainte de longueur, cote au milieu)
   refuse avec sa raison ; les pièces et leurs surfaces ne bougent pas ;
   couper puis fusionner rend le mur d'origine ; un Ctrl+Z annule. Maison
   fictive de 10 × 8 m. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Floor, type Opening, type Project, type Wall } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { planDuNiveau, voisinsFusionnables } from '../../src/building';
import { mm2EnM2 } from '../../src/geometry/polygon';
import { Outils } from '../../src/ui/outils';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 11) + (t += 1000)).toISOString(), id: generateurSequentiel('c') } };
type MurD = Wall & { axis: { a: { x: number; y: number }; b: { x: number; y: number } } };
const niveau = (p: Project): Floor => p.buildings[0]!.floors[0]!;
const murs = (p: Project) => Object.values(niveau(p).objects).filter((o): o is MurD => o.type === 'wall');
const ouvertures = (p: Project) => Object.values(niveau(p).objects).filter((o): o is Opening => o.type === 'opening');
const surfaces = (p: Project) => planDuNiveau(niveau(p)).zones.map(z => [z.piece?.name, mm2EnM2(z.aire).toFixed(2)]).sort();

/** la maison : le mur du bas porte une fenêtre (à 2 m), une porte (à 7 m) et un parement de pierre de 6 à 8 m */
function maison() {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') }), n = niveau(p).id;
  const M = (x1: number, y1: number, x2: number, y2: number, role: 'exterior' | 'partition' = 'exterior'): Commande =>
    ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: role === 'exterior' ? 200 : 70, hauteur: 2_500, role });
  let h = ok(executer(nouvelHistorique(p), 'Maison', [M(0, 0, 10_000, 0), M(10_000, 0, 10_000, 8_000), M(10_000, 8_000, 0, 8_000), M(0, 8_000, 0, 0), M(4_000, 0, 4_000, 8_000, 'partition'),
    { type: 'creerPiece', niveau: n, point: { x: 2_000, y: 4_000 }, nom: 'Séjour', usage: 'living' },
    { type: 'creerPiece', niveau: n, point: { x: 7_000, y: 4_000 }, nom: 'Chambre', usage: 'bedroom' }], a));
  const bas = murs(h.projet).find(w => w.axis.a.y === 0 && w.axis.b.y === 0)!.id;
  h = ok(executer(h, 'Baies et décor', [
    { type: 'creerOuverture', mur: bas, position: 2_000, largeur: 1_200, hauteur: 1_250, allege: 950, genre: 'window' },
    { type: 'creerOuverture', mur: bas, position: 7_000, largeur: 900, hauteur: 2_150, allege: 0, genre: 'door', sens: { side: 'left', inward: true } },
    { type: 'modifierMur', id: bas, decors: [{ from: 6_000, to: 8_000, finish: 'pierre-parement', label: 'Entrée' }] },
    { type: 'creerCote', niveau: n, refs: [{ objectId: bas, feature: 'start' }, { objectId: bas, feature: 'end' }] },
  ], a));
  return { h, a, bas, n };
}
function ok(r: ReturnType<typeof executer>): Historique { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique }
const refus = (r: ReturnType<typeof executer>) => (r.ok ? '' : r.erreurs.join(' ; '));

describe('couper un mur', () => {
  it('à 5 m : la fenêtre reste sur la première partie, la porte passe à la seconde (à 2 m), le parement est partagé, la cote suit le bout', () => {
    const { h, a, bas } = maison();
    const avant = surfaces(h.projet);
    expect(avant).toEqual([['Chambre', '45.75'], ['Séjour', '30.15']]);
    const r = ok(executer(h, 'Couper', [{ type: 'couperMur', id: bas, position: 5_000 }], a));
    const W = murs(r.projet), A = W.find(w => w.id === bas)!, B = W.find(w => w.axis.a.x === 5_000 && w.axis.a.y === 0)!;
    expect([A.axis, B.axis]).toEqual([{ a: { x: 0, y: 0 }, b: { x: 5_000, y: 0 } }, { a: { x: 5_000, y: 0 }, b: { x: 10_000, y: 0 } }]);
    /* la seconde partie reprend tout du mur */
    expect([B.role, B.thickness, B.height, B.justification, B.loadBearing]).toEqual([A.role, A.thickness, A.height, A.justification, A.loadBearing]);
    const O = ouvertures(r.projet);
    expect(O.map(o => [o.kind, o.hostWallId === bas ? 'A' : o.hostWallId === B.id ? 'B' : '?', o.offset]).sort()).toEqual([['door', 'B', 2_000], ['window', 'A', 2_000]]);
    expect(A.finishZones).toBeUndefined();
    expect(B.finishZones).toEqual([{ from: 1_000, to: 3_000, finish: 'pierre-parement', label: 'Entrée' }]);
    const cote = Object.values(niveau(r.projet).objects).find(o => o.type === 'dimension')!;
    expect(cote.type === 'dimension' && cote.refs).toEqual([{ objectId: bas, feature: 'start' }, { objectId: B.id, feature: 'end' }]);
    /* les pièces et leurs surfaces ne bougent pas */
    expect(surfaces(r.projet)).toEqual(avant);
    /* un seul Ctrl+Z rend le mur d'un seul tenant */
    expect(annuler(r).projet).toEqual(h.projet);
  });

  it('à 7 m : la décoration tombe à cheval — partagée en deux ; dans la porte : refus ; un bout trop près : refus', () => {
    const { h, a, bas } = maison();
    expect(refus(executer(h, 'Couper', [{ type: 'couperMur', id: bas, position: 7_200 }], a))).toBe('la coupure tombe dans une ouverture (porte) : coupez à côté');
    expect(refus(executer(h, 'Couper', [{ type: 'couperMur', id: bas, position: 0 }], a))).toBe('la coupure doit tomber entre les deux bouts du mur');
    const r = ok(executer(h, 'Couper', [{ type: 'couperMur', id: bas, position: 6_500 }], a));
    const A = murs(r.projet).find(w => w.id === bas)!, B = murs(r.projet).find(w => w.axis.a.x === 6_500)!;
    expect([A.finishZones, B.finishZones]).toEqual([[{ from: 6_000, to: 6_500, finish: 'pierre-parement', label: 'Entrée' }], [{ from: 0, to: 1_500, finish: 'pierre-parement', label: 'Entrée' }]]);
  });

  it('une contrainte de longueur ou une cote au milieu du mur : refus, avec la raison', () => {
    const { h, a, bas, n } = maison();
    const L = ok(executer(h, 'Contrainte', [{ type: 'ajouterContrainte', niveau: n, genre: 'length', murs: [bas] }], a));
    expect(refus(executer(L, 'Couper', [{ type: 'couperMur', id: bas, position: 5_000 }], a))).toBe('le mur a une contrainte de longueur : retirez-la avant de le couper');
    const C = ok(executer(h, 'Cote', [{ type: 'creerCote', niveau: n, refs: [{ objectId: bas, feature: 'center' }, { objectId: murs(h.projet).find(w => w.axis.a.y === 8_000)!.id, feature: 'center' }] }], a));
    expect(refus(executer(C, 'Couper', [{ type: 'couperMur', id: bas, position: 5_000 }], a))).toBe('une cote s’accroche au milieu de ce mur : retirez-la avant de le couper');
  });
});

describe('fusionner deux murs alignés', () => {
  it('couper puis fusionner rend le mur d’origine (ouvertures, parement, cote) ; la fusion se propose', () => {
    const { h, a, bas } = maison();
    const r = ok(executer(h, 'Couper', [{ type: 'couperMur', id: bas, position: 6_500 }], a));
    const B = murs(r.projet).find(w => w.axis.a.x === 6_500)!;
    expect(voisinsFusionnables(niveau(r.projet), bas)).toEqual([B.id]);
    const f = ok(executer(r, 'Fusionner', [{ type: 'fusionnerMurs', ids: [bas, B.id] }], a));
    const g = (p: Project) => ({ murs: murs(p).map(w => [w.id, w.axis, w.finishZones ?? null]).sort(), baies: ouvertures(p).map(o => [o.hostWallId, o.offset, o.swing ?? null]).sort(),
      cotes: Object.values(niveau(p).objects).flatMap(o => (o.type === 'dimension' ? [o.refs] : [])) });
    expect(g(f.projet)).toEqual(g(h.projet));
    expect(surfaces(f.projet)).toEqual(surfaces(h.projet));
  });

  it('un second mur tracé à rebours : ses ouvertures se replacent et gardent leur battant (charnière et côté inversés)', () => {
    const a = acteur(), p = creerProjet({ nom: 'Mur fictif', id: generateurSequentiel('p') }), n = niveau(p).id;
    const M = (x1: number, x2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: 0 }, b: { x: x2, y: 0 }, epaisseur: 200, hauteur: 2_500, role: 'exterior', justification: x2 > x1 ? 'left' : 'right' });
    let h = ok(executer(nouvelHistorique(p), 'Murs', [M(0, 4_000), M(9_000, 4_000)], a));
    const [A, B] = [murs(h.projet).find(w => w.axis.a.x === 0)!, murs(h.projet).find(w => w.axis.a.x === 9_000)!];
    h = ok(executer(h, 'Porte', [{ type: 'creerOuverture', mur: B.id, position: 1_000, largeur: 900, hauteur: 2_150, allege: 0, genre: 'door', sens: { side: 'left', inward: true } }], a));
    const f = ok(executer(h, 'Fusionner', [{ type: 'fusionnerMurs', ids: [A.id, B.id] }], a));
    expect(murs(f.projet).map(w => [w.id, w.axis, w.justification])).toEqual([[A.id, { a: { x: 0, y: 0 }, b: { x: 9_000, y: 0 } }, 'left']]);
    /* la porte était à 1 m du bout x = 9 m : elle est à 8 m du départ, battant retourné */
    expect(ouvertures(f.projet).map(o => [o.hostWallId, o.offset, o.swing])).toEqual([[A.id, 8_000, { side: 'right', inward: false }]]);
  });

  it('refus, avec la raison : pas alignés, pas bout à bout, pas la même épaisseur, l’un existant', () => {
    const a = acteur(), p = creerProjet({ nom: 'Murs fictifs', id: generateurSequentiel('p') }), n = niveau(p).id;
    const M = (x1: number, y1: number, x2: number, y2: number, e = 200): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: e, hauteur: 2_500, role: 'exterior' });
    const h = ok(executer(nouvelHistorique(p), 'Murs', [M(0, 0, 4_000, 0), M(4_000, 0, 4_000, 3_000), M(4_000, 0, 8_000, 0, 150), M(9_000, 0, 12_000, 0), M(12_000, 0, 15_000, 0)], a));
    const id = (x1: number, y2: number, x2: number) => murs(h.projet).find(w => w.axis.a.x === x1 && w.axis.b.y === y2 && w.axis.b.x === x2)!.id;
    const F = (i: string, j: string, hh = h) => refus(executer(hh, 'Fusionner', [{ type: 'fusionnerMurs', ids: [i, j] }], a));
    expect(F(id(0, 0, 4_000), id(4_000, 3_000, 4_000))).toBe('les deux murs ne sont pas dans le prolongement l’un de l’autre');
    expect(F(id(0, 0, 4_000), id(9_000, 0, 12_000))).toBe('les deux murs ne se touchent pas bout à bout');
    expect(F(id(0, 0, 4_000), id(4_000, 0, 8_000))).toBe('les deux murs n’ont pas la même épaisseur (20 et 15 cm)');
    const e = ok(executer(h, 'Existant', [{ type: 'modifierMur', id: id(9_000, 0, 12_000), phase: 'existing' }], a));
    expect(F(id(9_000, 0, 12_000), id(12_000, 0, 15_000), e)).toBe('l’un des murs est existant (ou à démolir), l’autre non : ils restent distincts');
    expect(voisinsFusionnables(niveau(h.projet), id(0, 0, 4_000))).toEqual([]);
    expect(voisinsFusionnables(niveau(h.projet), id(9_000, 0, 12_000))).toEqual([id(12_000, 0, 15_000)]);
  });
});

describe('l’outil Couper', () => {
  it('le survol dit les deux longueurs (ou la raison d’un refus) ; le clic coupe à l’endroit accroché', () => {
    const { h, a, bas } = maison();
    const o = new Outils(() => ({ projet: h.projet, niveau: niveau(h.projet).id, selection: null }));
    o.choisir('couper');
    /* sur la porte (centrée à 7 m) : refus annoncé, pas de trait de coupure */
    expect(o.bouger({ point: { x: 7_100, y: 40 }, rayon: 150, alt: true }).aide).toBe('⛔ la coupure tombe dans une ouverture (porte) : coupez à côté');
    expect(o.coupure).toBeNull();
    /* à 4 m, la cloison aboutit au mur : la coupure s'y accroche (le survol est à 4,08 m) */
    expect(o.bouger({ point: { x: 4_080, y: 60 }, rayon: 150 }).aide).toBe('Couper ici : 4,00 m | 6,00 m');
    expect(o.coupure).not.toBeNull();
    const e = o.appuyer({ point: { x: 4_080, y: 60 }, rayon: 150 });
    expect(e.commandes?.liste).toEqual([{ type: 'couperMur', id: bas, position: 4_000 }]);
    const r = ok(executer(h, e.commandes!.titre, e.commandes!.liste, a));
    expect(murs(r.projet).filter(w => w.axis.a.y === 0 && w.axis.b.y === 0).map(w => [w.axis.a.x, w.axis.b.x]).sort((x, y) => x[0]! - y[0]!)).toEqual([[0, 4_000], [4_000, 10_000]]);
    expect(surfaces(r.projet)).toEqual(surfaces(h.projet));
  });
});
