/* Le métré du projet, par lot : murs (longueur, surface nette, volume),
   linteaux et appuis, menuiseries, plancher et plafond, pièces (sol,
   plinthes, murs, plafond), pièces humides signalées, toiture, poteaux et
   poutres ; export CSV. Maison fictive de 10 × 8 m, résultats à la main. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Wall } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { metreCsv, metreProjet, type LigneMetre } from '../../src/building';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 6) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join()); return r.historique };

function maison() {
  const a = acteur(), p = creerProjet({ nom: 'Fictif', id: generateurSequentiel('p') }), n = p.buildings[0]!.floors[0]!.id;
  const murs: Commande[] = [[0, 0, 10_000, 0], [10_000, 0, 10_000, 8_000], [10_000, 8_000, 0, 8_000], [0, 8_000, 0, 0]].map(([ax, ay, bx, by]) =>
    ({ type: 'creerMur', niveau: n, a: { x: ax!, y: ay! }, b: { x: bx!, y: by! }, epaisseur: 200, hauteur: 2_500, role: 'exterior' }) as Commande);
  let h = ok(executer(nouvelHistorique(p), 'Murs', murs, a));
  const sud = Object.values(h.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'wall' && 'b' in (o as Wall).axis && (o as { axis: { a: { y: number }; b: { x: number } } }).axis.b.x === 10_000 && (o as { axis: { a: { y: number } } }).axis.a.y === 0)!;
  h = ok(executer(h, 'Garnir', [
    { type: 'creerOuverture', mur: sud.id, position: 3_000, largeur: 1_200, hauteur: 1_250, allege: 900, genre: 'window' },
    { type: 'creerOuverture', mur: sud.id, position: 7_000, largeur: 900, hauteur: 2_150, genre: 'door' },
    { type: 'creerPiece', niveau: n, point: { x: 5_000, y: 4_000 }, nom: 'Séjour', usage: 'living' },
    { type: 'creerPoteau', niveau: n, position: { x: 5_000, y: 4_000 }, largeur: 200, profondeur: 200, matiere: 'concrete' },
    { type: 'creerPoutre', niveau: n, a: { x: 100, y: 4_000 }, b: { x: 9_900, y: 4_000 }, largeur: 200, retombee: 300, matiere: 'concrete' },
  ], a));
  return { h, a, n };
}
const ligne = (L: LigneMetre[], lot: string, debut: string) => L.filter(l => l.lot === lot && l.libelle.startsWith(debut));

describe('métré du projet', () => {
  it('murs, baies, linteaux, appuis, menuiseries', () => {
    const L = metreProjet(maison().h.projet);
    const [lg] = ligne(L, 'Gros œuvre', 'Murs extérieurs — sur mesure 20 cm (longueur');
    expect(lg!.quantite).toBeCloseTo(36, 9);
    /* 36 × 2,50 = 90 m², moins la fenêtre (1,20 × 1,25) et la porte (0,90 × 2,15) */
    expect(ligne(L, 'Gros œuvre', 'Murs extérieurs — sur mesure 20 cm (surface nette')[0]!.quantite).toBeCloseTo(90 - 1.5 - 1.935, 9);
    expect(ligne(L, 'Gros œuvre', 'Murs extérieurs — sur mesure 20 cm (volume')[0]!.quantite).toBeCloseTo((90 - 1.5 - 1.935) * 0.2, 9);
    expect(ligne(L, 'Gros œuvre', 'Linteaux')[0]!.quantite).toBeCloseTo(1.6 + 1.3, 9);
    expect(ligne(L, 'Gros œuvre', 'Appuis de fenêtre')[0]!.quantite).toBeCloseTo(1.2, 9);
    expect(ligne(L, 'Menuiseries extérieures', 'Fenêtre 120 × 125 cm')[0]!.quantite).toBe(1);
    expect(ligne(L, 'Menuiseries extérieures', 'Porte 90 × 215 cm')[0]!.quantite).toBe(1);
  });

  it('pièces : sol, plinthes (portes déduites), murs (baies déduites), plafonds ; compositions à choisir signalées', () => {
    const L = metreProjet(maison().h.projet);
    /* entre les faces : 9,80 × 7,80 ; le poteau ne retire rien (il est compté à part) */
    expect(ligne(L, 'Revêtements de sol', 'Sol — à choisir')[0]).toMatchObject({ quantite: expect.closeTo(76.44, 6), aPreciser: true, detail: 'Séjour' });
    expect(ligne(L, 'Revêtements de sol', 'Plinthes')[0]!.quantite).toBeCloseTo(35.2 - 0.9, 6);
    expect(ligne(L, 'Peinture', 'Murs — finition à choisir')[0]!.quantite).toBeCloseTo(35.2 * 2.5 - 1.5 - 1.935, 6);
    expect(ligne(L, 'Peinture', 'Plafonds')[0]!.quantite).toBeCloseTo(76.44, 6);
    expect(ligne(L, 'Gros œuvre', 'Dallage / plancher bas — composition à choisir')[0]).toMatchObject({ quantite: expect.closeTo(10.2 * 8.2, 6), aPreciser: true });
    expect(ligne(L, 'Plâtrerie et isolation', 'Plafonds — composition à choisir')[0]!.quantite).toBeCloseTo(76.44, 6);
  });

  it('poteaux et poutres : nombre, longueur, béton ; refusés s’ils sont faux ; annulables', () => {
    const { h, a, n } = maison(), L = metreProjet(h.projet);
    expect(ligne(L, 'Gros œuvre', 'Poteaux béton 20 × 20 cm')[0]!.quantite).toBe(1);
    expect(ligne(L, 'Gros œuvre', 'Béton des poteaux')[0]!.quantite).toBeCloseTo(0.2 * 0.2 * 2.5, 9);
    expect(ligne(L, 'Gros œuvre', 'Poutres béton 20 × 30 cm')[0]!.quantite).toBeCloseTo(9.8, 9);
    expect(ligne(L, 'Gros œuvre', 'Béton des poutres')[0]!.quantite).toBeCloseTo(0.2 * 0.3 * 9.8, 9);
    for (const [cmd, motif] of [
      [{ type: 'creerPoteau', niveau: n, position: { x: 0, y: 0 }, largeur: 20, profondeur: 200, matiere: 'concrete' }, /section/],
      [{ type: 'creerPoutre', niveau: n, a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, largeur: 200, retombee: 300, matiere: 'wood' }, /30 cm/],
    ] as [Commande, RegExp][]) { const k = executer(h, 'x', [cmd], a); expect(k.ok ? '' : k.erreurs.join()).toMatch(motif) }
    const poteau = Object.values(h.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'column')!;
    const m = ok(executer(h, 'x', [{ type: 'modifierPoteau', id: poteau.id, largeur: 300, matiere: 'steel' }], a));
    expect(m.projet.buildings[0]!.floors[0]!.objects[poteau.id]).toMatchObject({ width: 300, material: 'steel' });
    expect(annuler(m).projet.buildings[0]!.floors[0]!.objects[poteau.id]).toMatchObject({ width: 200, material: 'concrete' });
  });

  it('pièce humide, toiture, CSV', () => {
    const { h: h0, a, n } = maison();
    const sejour = Object.values(h0.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'room')!;
    const h = ok(executer(h0, 'x', [{ type: 'modifierPiece', id: sejour.id, nom: 'Salle d’eau', usage: 'bathroom', humide: true },
      { type: 'creerToiture', niveau: n, genre: 'hip', pente: 35, debord: 500, couverture: 'tile' }], a));
    const L = metreProjet(h.projet);
    expect(ligne(L, 'Faïence', 'Faïence et étanchéité des pièces humides (Salle d’eau)')[0]).toMatchObject({ aPreciser: true });
    const couv = ligne(L, 'Charpente et couverture', 'Couverture — tuiles')[0]!;
    /* à croupes : l'égout (10,2 + 1) × (8,2 + 1) en plan, rapporté à la pente de 35° */
    expect(couv.quantite).toBeCloseTo((11.2 * 9.2) / Math.cos((35 * Math.PI) / 180), 1);
    expect(ligne(L, 'Charpente et couverture', 'Gouttières')[0]!.quantite).toBeCloseTo(2 * (11.2 + 9.2), 6);
    /* les lots dans l'ordre ; le CSV s'ouvre dans un tableur français */
    const lots = [...new Set(L.map(l => l.lot))];
    expect(lots.indexOf('Gros œuvre')).toBeLessThan(lots.indexOf('Charpente et couverture'));
    const csv = metreCsv(L).split('\r\n');
    expect(csv[0]).toBe('Lot;Ouvrage;Quantité;Unité;Détail;À préciser');
    expect(csv.find(x => x.includes('"Appuis de fenêtre"'))).toBe('"Gros œuvre";"Appuis de fenêtre";1,2;ml;"";');
  });

  it('libellés : un modèle garde ses dimensions sans les répéter ; une ligne cumulée liste ses pièces ; la faïence murale va à la faïence', () => {
    const { h: h0, a, n } = maison();
    const F = h0.projet.buildings[0]!.floors[0]!, O = Object.values(F.objects);
    const est = O.find(o => o.type === 'wall' && (o as { axis: { a: { x: number }; b: { x: number } } }).axis.a.x === 10_000 && (o as { axis: { b: { x: number } } }).axis.b.x === 10_000)!;
    const sejour = O.find(o => o.type === 'room')!;
    const h = ok(executer(h0, 'x', [
      { type: 'creerOuverture', mur: est.id, position: 2_000, largeur: 1_200, hauteur: 1_250, allege: 900, genre: 'window', modele: { id: 'fen-2v-120x125', label: 'Fenêtre 2 vantaux 120 × 125' } },
      { type: 'creerMur', niveau: n, a: { x: 6_000, y: 0 }, b: { x: 6_000, y: 8_000 }, epaisseur: 72, role: 'partition' },
      { type: 'modifierPiece', id: sejour.id, sol: 'parquet-chene', murs: 'faience-blanche' },
      { type: 'creerPiece', niveau: n, point: { x: 7_500, y: 4_000 }, nom: 'Chambre', usage: 'bedroom' },
    ], a));
    const ch = Object.values(h.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'room' && o.name === 'Chambre')!;
    const L = metreProjet(ok(executer(h, 'x', [{ type: 'modifierPiece', id: ch.id, sol: 'parquet-chene' }], a)).projet);
    expect(ligne(L, 'Menuiseries extérieures', 'Fenêtre 2 vantaux')[0]!.libelle).toBe('Fenêtre 2 vantaux 120 × 125');
    expect(ligne(L, 'Revêtements de sol', 'Sol — Parquet chêne')[0]!.detail).toBe('Séjour, Chambre');
    expect(ligne(L, 'Faïence', 'Murs — Faïence blanche')[0]!.detail).toBe('Séjour');
    expect(ligne(L, 'Peinture', 'Murs — Faïence')).toHaveLength(0);
  });
});
