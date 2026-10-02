/* La cotation automatique, dérivée du plan : chaînes extérieures
   (ouvertures, décrochés, hors tout), dimensions des pièces, place d'une
   ouverture entre ses murs voisins. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Floor, type Project, type Wall } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { cotationExterieure, dimensionsPiece, mursDroits, placeOuverture, planDuNiveau, positionPour } from '../../src/building';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const rdc = (p: Project): Floor => p.buildings[0]!.floors[0]!;
const M = (n: string, x1: number, y1: number, x2: number, y2: number, e = 200, role: Wall['role'] = 'exterior'): Commande =>
  ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: e, role });
const contour = (n: string, P: [number, number][]): Commande[] => P.map((p, i) => M(n, ...p, ...P[(i + 1) % P.length]!));

/** une maison fictive de 10 × 8 m (axes), une cloison à x = 4 m, une fenêtre en bas, une porte à droite */
function maison(P: [number, number][] = [[0, 0], [10_000, 0], [10_000, 8_000], [0, 8_000]]) {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = rdc(p).id;
  let h = ok(executer(nouvelHistorique(p), 'Murs', [...contour(n, P), M(n, 4_000, 0, 4_000, P[3]![1], 70, 'partition')], a));
  const W = mursDroits(rdc(h.projet));
  const bas = W.find(w => w.axis.a.y === 0 && w.axis.b.y === 0)!, droite = W.find(w => w.axis.a.x === 10_000 && w.axis.b.x === 10_000)!;
  h = ok(executer(h, 'Baies', [
    { type: 'creerOuverture', mur: bas.id, position: 2_000, largeur: 1_200, hauteur: 1_250, allege: 900, genre: 'window' },
    { type: 'creerOuverture', mur: droite.id, position: 2_500, largeur: 900, hauteur: 2_150, genre: 'door' }], a));
  return { f: rdc(h.projet), bas, droite };
}

describe('cotation extérieure', () => {
  it('rectangle : en bas, les ouvertures puis le hors tout ; en haut, le hors tout seul', () => {
    const { f } = maison();
    const C = cotationExterieure(f, 700);
    const bas = C.filter(c => c.cote === 'bas');
    expect(bas.map(c => c.genre)).toEqual(['ouvertures', 'hors_tout']);
    expect(bas[0]!.reperes).toEqual([-100, 1_400, 2_600, 10_100]);
    expect(bas[0]!.ligne).toBe(-800); expect(bas[1]!.ligne).toBe(-1_500);
    expect(bas[1]!.reperes).toEqual([-100, 10_100]);
    expect(C.filter(c => c.cote === 'haut').map(c => c.genre)).toEqual(['hors_tout']);
    /* la porte du mur de droite se cote à droite, en y */
    expect(C.find(c => c.cote === 'droite' && c.genre === 'ouvertures')!.reperes).toEqual([-100, 2_050, 2_950, 8_100]);
  });

  it('plan en L : les décrochés apparaissent entre ouvertures et hors tout', () => {
    const { f } = maison([[0, 0], [10_000, 0], [10_000, 5_000], [6_000, 5_000], [6_000, 8_000], [0, 8_000]]);
    const haut = cotationExterieure(f).filter(c => c.cote === 'haut');
    expect(haut.map(c => c.genre)).toEqual(['decroches', 'hors_tout']);
    expect(haut[0]!.reperes).toEqual([-100, 6_100, 10_100]);        // le contour extérieur, pas l'angle rentrant intérieur
    const gauche = cotationExterieure(f).filter(c => c.cote === 'gauche');
    expect(gauche[0]!.reperes).toEqual([-100, 5_100, 8_100]);
  });

  it('niveau vide : aucune cote', () => {
    const p = creerProjet({ nom: 'Vide', id: generateurSequentiel('p') });
    expect(cotationExterieure(rdc(p))).toEqual([]);
  });
});

describe('dimensions des pièces', () => {
  it('pièces rectangulaires : largeur × profondeur entre murs ; le sommet d’une cloison en T ne compte pas', () => {
    const { f } = maison();
    const D = planDuNiveau(f).zones.map(z => dimensionsPiece(z.polygone.contour)).sort((a, b) => a!.profondeur - b!.profondeur);
    expect(D[0]).toEqual({ largeur: 7_800, profondeur: 3_865 });
    expect(D[1]).toEqual({ largeur: 7_800, profondeur: 5_865 });
    expect(dimensionsPiece([{ x: 0, y: 0 }, { x: 2_000, y: 0 }, { x: 3_000, y: 0 }, { x: 3_000, y: 2_000 }, { x: 0, y: 2_000 }])).toEqual({ largeur: 3_000, profondeur: 2_000 });
  });
  it('pièce en L ou trapèze : pas de dimensions', () => {
    expect(dimensionsPiece([{ x: 0, y: 0 }, { x: 4_000, y: 0 }, { x: 4_000, y: 2_000 }, { x: 2_000, y: 2_000 }, { x: 2_000, y: 4_000 }, { x: 0, y: 4_000 }])).toBeNull();
    expect(dimensionsPiece([{ x: 0, y: 0 }, { x: 4_000, y: 0 }, { x: 3_000, y: 2_000 }, { x: 1_000, y: 2_000 }])).toBeNull();
  });
});

describe('place d’une ouverture', () => {
  it('fenêtre : distances côté pièce, jusqu’à l’angle et jusqu’à la cloison', () => {
    const { f } = maison();
    const o = Object.values(f.objects).find(x => x.type === 'opening' && x.kind === 'window')!;
    const P = placeOuverture(f, o.id)!;
    expect(P.libelles).toEqual(['à gauche', 'à droite']);
    expect(P.avant).toBeCloseTo(1_300, 6);
    expect(P.apres).toBeCloseTo(1_365, 6);
    expect(P.points[0]).toEqual({ x: 100, y: 100 });
    /* « 1,00 m à droite » : la fenêtre se place à 1 m de la cloison */
    expect(positionPour(P, 'apres', 1_000)).toBeCloseTo(2_365, 6);
    expect(positionPour(P, 'avant', 1_300)).toBeCloseTo(2_000, 6);
  });
  it('porte du mur de droite (vertical) : en bas / en haut, mesurée côté pièce', () => {
    const { f, droite } = maison();
    const o = Object.values(f.objects).find(x => x.type === 'opening' && x.kind === 'door')!;
    const P = placeOuverture(f, o.id)!;
    expect(P.libelles).toEqual(['en bas', 'en haut']);
    expect(P.avant).toBeCloseTo(2_050 - 100, 6); expect(P.apres).toBeCloseTo(7_900 - 2_950, 6);
    expect(P.points[1]).toEqual({ x: droite.axis.a.x - 100, y: 2_050 });
  });
  it('objet qui n’est pas une ouverture : null', () => {
    const { f, bas } = maison();
    expect(placeOuverture(f, bas.id)).toBeNull();
    expect(placeOuverture(f, 'inconnu')).toBeNull();
  });
});
