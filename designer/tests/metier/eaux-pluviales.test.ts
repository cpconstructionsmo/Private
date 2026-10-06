/* Les lignes de la toiture (égout, rives, faîtage, arêtiers, noues) et ses eaux pluviales (gouttières, descentes) :
   maison fictive de 10 × 8 m (murs de 20 cm à l'axe, nu extérieur 10,2 × 8,2), débord 50 cm, pente 35°. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Roof } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { eauxPluviales, metreProjet, pointDEgout, type LigneMetre } from '../../src/building';
import { maquette, EAUX_3D, EPAISSEUR_COUVERTURE } from '../../src/vue3d/maquette';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 6) + (t += 1000)).toISOString(), id: generateurSequentiel('e') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join()); return r.historique };
const T = Math.tan((35 * Math.PI) / 180);

function maison(genre: Roof['kind'], contour: [number, number][] = [[0, 0], [10_000, 0], [10_000, 8_000], [0, 8_000]]) {
  const a = acteur(), p = creerProjet({ nom: 'Fictif', id: generateurSequentiel('p') }), n = p.buildings[0]!.floors[0]!.id;
  const murs: Commande[] = contour.map(([x, y], i) => { const [u, v] = contour[(i + 1) % contour.length]!; return { type: 'creerMur', niveau: n, a: { x, y }, b: { x: u, y: v }, epaisseur: 200, hauteur: 2_500, role: 'exterior' } });
  const h = ok(executer(nouvelHistorique(p), 'Maison', [...murs, { type: 'creerToiture', niveau: n, genre, pente: 35, debord: 500, couverture: 'tile' }], a));
  const f = () => h.projet.buildings[0]!.floors[0]!;
  const roof = Object.values(f().objects).find(o => o.type === 'roof')!;
  return { h, a, roof };
}
const E = (h: Historique) => eauxPluviales(h.projet.buildings[0]!.floors[0]!)!;
const ligne = (L: LigneMetre[], debut: string) => L.find(l => l.libelle.startsWith(debut));

describe('lignes de toiture', () => {
  it('à croupes : égout tout autour, un faîtage, quatre arêtiers, ni rive ni noue', () => {
    const X = E(maison('hip').h);
    expect(X.longueurs.egout / 1000).toBeCloseTo(2 * (11.2 + 9.2), 6);
    expect(X.longueurs.faitage / 1000).toBeCloseTo(11.2 - 9.2, 6);
    /* un arêtier : 4,60 en plan sur chaque axe (diagonale), monté de 4,60 × tan 35° */
    expect(X.longueurs.aretier / 1000).toBeCloseTo(4 * Math.hypot(4.6 * Math.SQRT2, 4.6 * T), 4);
    expect(X.longueurs.rive).toBe(0);
    expect(X.longueurs.noue).toBe(0);
    expect(X.surfacePlan / 1e6).toBeCloseTo(11.2 * 9.2, 4);
  });

  it('deux pans : égouts sur les longs côtés, rives sur les pignons, faîtage', () => {
    const X = E(maison('gable').h);
    expect(X.longueurs.egout / 1000).toBeCloseTo(2 * 11.2, 6);
    expect(X.longueurs.rive / 1000).toBeCloseTo(4 * Math.hypot(4.6, 4.6 * T), 4);
    expect(X.longueurs.faitage / 1000).toBeCloseTo(11.2, 6);
    expect(X.longueurs.aretier + X.longueurs.noue).toBe(0);
  });

  it('en L à croupes : une noue dans l’angle rentrant', () => {
    const X = E(maison('hip', [[0, 0], [10_000, 0], [10_000, 6_000], [5_000, 6_000], [5_000, 10_000], [0, 10_000]]).h);
    expect(X.lignes.filter(l => l.genre === 'noue').length).toBeGreaterThanOrEqual(1);
    expect(X.longueurs.noue).toBeGreaterThan(0);
    expect(X.longueurs.rive).toBe(0);
  });
});

describe('eaux pluviales', () => {
  it('descentes posées sur l’égout (refusées ailleurs), retirées, annulées ; alerte sans descente', () => {
    const { h, a, roof } = maison('gable');
    expect(E(h).alertes.join()).toMatch(/Aucune descente/);
    /* l'égout sud est à y = −0,60 (nu −0,10, débord 0,50) */
    const p = pointDEgout(E(h), { x: 3_000, y: -300 }, 500)!;
    expect(p).toEqual({ x: 3_000, y: -600 });
    expect(pointDEgout(E(h), { x: 3_000, y: 4_000 }, 500)).toBeNull();
    const h1 = ok(executer(h, 'x', [{ type: 'modifierToiture', id: roof.id, descentes: [p, { x: 8_000, y: 8_600 }] }], a));
    expect(E(h1).descentes.map(d => d.ok)).toEqual([true, true]);
    expect(E(h1).alertes).toEqual([]);
    const loin = executer(h1, 'x', [{ type: 'modifierToiture', id: roof.id, descentes: [{ x: 5_000, y: 4_000 }] }], a);
    expect(loin.ok ? '' : loin.erreurs.join()).toMatch(/sur l’égout/);
    /* sur le pignon : acceptée (c'est le contour), mais signalée */
    const h2 = ok(executer(h1, 'x', [{ type: 'modifierToiture', id: roof.id, descentes: [{ x: -600, y: 4_000 }] }], a));
    expect(E(h2).alertes.join()).toMatch(/pas sur un égout/);
    expect(annuler(h2).projet.buildings[0]!.floors[0]!.objects[roof.id]).toMatchObject({ downpipes: [p, { x: 8_000, y: 8_600 }] });
    /* le débord change (50 → 20 cm) : les descentes suivent l'égout */
    const h4 = ok(executer(h1, 'x', [{ type: 'modifierToiture', id: roof.id, debord: 200 }], a));
    expect((h4.projet.buildings[0]!.floors[0]!.objects[roof.id] as Roof).downpipes).toEqual([{ x: 3_000, y: -300 }, { x: 8_000, y: 8_300 }]);
    expect(E(h4).alertes).toEqual([]);
    expect((annuler(h4).projet.buildings[0]!.floors[0]!.objects[roof.id] as Roof).downpipes).toEqual([p, { x: 8_000, y: 8_600 }]);
    const h3 = ok(executer(h1, 'x', [{ type: 'modifierToiture', id: roof.id, descentes: [] }], a));
    expect((h3.projet.buildings[0]!.floors[0]!.objects[roof.id] as Roof).downpipes).toBeUndefined();
  });

  it('métré : lignes, génoise, gouttières choisies, descentes avec la surface desservie', () => {
    const { h, a, roof } = maison('gable');
    const L0 = metreProjet(h.projet);
    expect(ligne(L0, 'Gouttières — modèle à choisir')).toMatchObject({ quantite: expect.closeTo(22.4, 6), aPreciser: true });
    expect(ligne(L0, 'Descentes')).toMatchObject({ quantite: 0, aPreciser: true });
    const h1 = ok(executer(h, 'x', [{ type: 'modifierToiture', id: roof.id, egout: 'genoise_2', gouttiere: 'half_round', matiereGouttiere: 'zinc', descentes: [{ x: 3_000, y: -600 }, { x: 8_000, y: 8_600 }] }], a));
    const L = metreProjet(h1.projet);
    expect(ligne(L, 'Faîtage')!.quantite).toBeCloseTo(11.2, 6);
    expect(ligne(L, 'Rives')!.quantite).toBeCloseTo(4 * Math.hypot(4.6, 4.6 * T), 4);
    expect(ligne(L, 'Génoise 2 rangs')!.quantite).toBeCloseTo(22.4, 6);
    expect(ligne(L, 'Gouttières — demi-ronde pendante zinc')).toMatchObject({ quantite: expect.closeTo(22.4, 6) });
    expect(ligne(L, 'Gouttières')!.aPreciser).toBeUndefined();
    expect(ligne(L, 'Descentes')!.quantite).toBe(2);
    expect(ligne(L, 'Descentes')!.detail).toMatch(/51,5 m² de toiture en plan par descente/);
    /* sans gouttière : ni gouttière ni descente au métré */
    const h2 = ok(executer(h1, 'x', [{ type: 'modifierToiture', id: roof.id, gouttiere: 'none' }], a));
    expect(ligne(metreProjet(h2.projet), 'Gouttières')).toBeUndefined();
    expect(ligne(metreProjet(h2.projet), 'Descentes')).toBeUndefined();
    const refus = executer(h, 'x', [{ type: 'modifierToiture', id: roof.id, egout: 'paille' as never }], a);
    expect(refus.ok).toBe(false);
  });

  it('3D : la gouttière une fois choisie, la génoise en gradins, la descente de l’égout au sol', () => {
    const { h, a, roof } = maison('gable');
    const zinc = (hh: Historique) => maquette(hh.projet).prismes.filter(p => p.objet === roof.id && p.matiere === 'zinc');
    /* rien de choisi : la vue d'avant */
    expect(zinc(h)).toHaveLength(0);
    const h1 = ok(executer(h, 'x', [{ type: 'modifierToiture', id: roof.id, gouttiere: 'half_round', egout: 'genoise_2', descentes: [{ x: 3_000, y: -600 }] }], a));
    const Z = zinc(h1), egoutZ = 2_500 - 500 * T;
    /* deux gouttières (les deux égouts), puis la descente : départ, coude, chute */
    expect(Z.filter(p => Math.abs(p.z1 - (egoutZ - 20)) < 1e-6)).toHaveLength(2);
    expect(Z.filter(p => p.z0 === 0)).toHaveLength(1);
    const chute = Z.find(p => p.z0 === 0)!;
    /* la chute longe le nu du mur sud (y = −0,10), à 2 cm (colliers) */
    expect(Math.max(...chute.contour.map(q => q.y))).toBeCloseTo(-120, 6);
    expect(Math.min(...chute.contour.map(q => q.y))).toBeCloseTo(-120 - EAUX_3D.descente, 6);
    const genoise = maquette(h1.projet).prismes.filter(p => p.objet === roof.id && p.matiere === 'tuile');
    expect(genoise).toHaveLength(2 * 2);
    /* sous la sous-face du toit au droit du rang le plus saillant */
    expect(Math.max(...genoise.map(p => p.z1))).toBeCloseTo(2_500 - 2 * EAUX_3D.rangSaillie * T - EPAISSEUR_COUVERTURE, 6);
  });
});
