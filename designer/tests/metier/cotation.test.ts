/* La cotation automatique, dérivée du plan : chaînes extérieures
   (ouvertures, décrochés, hors tout), dimensions des pièces, place d'une
   ouverture entre ses murs voisins. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Floor, type Project, type Wall } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { cotationExterieure, cotesInterieures, dimensionsPiece, mursDroits, placeEtiquette, placeOuverture, planDuNiveau, positionPour } from '../../src/building';

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

describe('cotes intérieures et étiquettes des pièces', () => {
  it('chaque pièce rectangulaire : sa largeur et sa profondeur entre faces, en retrait des murs, depuis le coin bas-gauche', () => {
    const { f } = maison();
    const C = cotesInterieures(f, 450);
    expect(C).toHaveLength(4);
    /* à gauche de la cloison : faces x = 100 et 3 965, y = 100 et 7 900 */
    const L = C.map(c => ({ l: Math.round(Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y)), a: { x: Math.round(c.a.x), y: Math.round(c.a.y) } }));
    expect(L).toContainEqual({ l: 3_865, a: { x: 100, y: 550 } });
    expect(L).toContainEqual({ l: 7_800, a: { x: 550, y: 100 } });
    /* à droite : faces x = 4 035 et 9 900 */
    expect(L).toContainEqual({ l: 5_865, a: { x: 4_035, y: 550 } });
    /* trop étroite pour le retrait : pas de cote */
    expect(cotesInterieures(f, 2_000)).toHaveLength(2);
    /* une pièce de moins de 2 m de large (un WC) : pas de cote, son étiquette dit ses dimensions */
    const p = creerProjet({ nom: 'Fictif', id: generateurSequentiel('p') }), n = rdc(p).id;
    const g = rdc(ok(executer(nouvelHistorique(p), 'Murs', [...contour(n, [[0, 0], [5_800, 0], [5_800, 8_000], [0, 8_000]]), M(n, 4_000, 0, 4_000, 8_000, 70, 'partition')], acteur())).projet);
    expect(cotesInterieures(g, 450).length).toBe(2);
  });

  it('l’étiquette reste à sa place si elle est libre ; sinon elle va au plus près, hors des meubles, dans la pièce', () => {
    const piece = [{ x: 0, y: 0 }, { x: 6_000, y: 0 }, { x: 6_000, y: 4_000 }, { x: 0, y: 4_000 }];
    const demi = { l: 600, h: 300 }, voulue = { x: 3_000, y: 2_000 };
    expect(placeEtiquette(piece, [], voulue, demi)).toEqual(voulue);
    const table = [{ x: 2_200, y: 1_400 }, { x: 3_800, y: 1_400 }, { x: 3_800, y: 2_600 }, { x: 2_200, y: 2_600 }];
    const p = placeEtiquette(piece, [table], voulue, demi);
    expect(p).not.toEqual(voulue);
    const dehors = p.x + demi.l <= 2_200 || p.x - demi.l >= 3_800 || p.y + demi.h <= 1_400 || p.y - demi.h >= 2_600;
    expect(dehors).toBe(true);
    expect(p.x - demi.l).toBeGreaterThanOrEqual(0); expect(p.y + demi.h).toBeLessThanOrEqual(4_000);
    /* une pièce entièrement meublée : la place voulue */
    expect(placeEtiquette(piece, [piece], voulue, demi)).toEqual(voulue);
    /* une pièce sans place libre : là où l'étiquette couvre le moins (ici, sur le petit meuble plutôt que sur le lit) */
    const lit = [{ x: 0, y: 0 }, { x: 6_000, y: 0 }, { x: 6_000, y: 2_600 }, { x: 0, y: 2_600 }];
    const chevet = [{ x: 0, y: 2_600 }, { x: 2_000, y: 2_600 }, { x: 2_000, y: 4_000 }, { x: 0, y: 4_000 }];
    const q = placeEtiquette(piece, [lit, chevet], { x: 1_000, y: 1_000 }, demi);
    expect(q.y - demi.h).toBeGreaterThanOrEqual(2_600 - 1);
    expect(q.x - demi.l).toBeGreaterThanOrEqual(2_000 - 1);
  });
});
