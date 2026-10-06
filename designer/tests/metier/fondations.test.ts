/* Les fondations : semelles filantes sous les murs porteurs (pas sous les
   cloisons), semelles isolées sous les poteaux, assise au plus bas du hors
   gel et du bon sol, trappes de visite du vide sanitaire, métré. Maison
   fictive de 10 × 8 m, un refend à 6 m, résultats à la main. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Foundation } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { metreProjet, planFondations, type LigneMetre } from '../../src/building';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 6) + (t += 1000)).toISOString(), id: generateurSequentiel('f') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join()); return r.historique };

function maison(genre: Foundation['kind'] = 'crawl_space') {
  const a = acteur(), p = creerProjet({ nom: 'Fictif', id: generateurSequentiel('p') }), n = p.buildings[0]!.floors[0]!.id;
  const mur = (ax: number, ay: number, bx: number, by: number, role: 'exterior' | 'bearing_interior' | 'partition', e = 200): Commande =>
    ({ type: 'creerMur', niveau: n, a: { x: ax, y: ay }, b: { x: bx, y: by }, epaisseur: e, hauteur: 2_500, role });
  const h = ok(executer(nouvelHistorique(p), 'Maison', [
    mur(0, 0, 10_000, 0, 'exterior'), mur(10_000, 0, 10_000, 8_000, 'exterior'), mur(10_000, 8_000, 0, 8_000, 'exterior'), mur(0, 8_000, 0, 0, 'exterior'),
    mur(6_000, 0, 6_000, 8_000, 'bearing_interior'), mur(6_000, 4_000, 10_000, 4_000, 'partition', 72),
    { type: 'creerPiece', niveau: n, point: { x: 3_000, y: 4_000 }, nom: 'Séjour', usage: 'living' },
    { type: 'creerPoteau', niveau: n, position: { x: 3_000, y: 2_000 }, largeur: 200, profondeur: 200, matiere: 'concrete' },
    { type: 'creerFondations', niveau: n, genre },
  ], a));
  const F = () => Object.values(h.projet.buildings[0]!.floors[0]!.objects).find((o): o is Foundation => o.type === 'foundation')!;
  return { h, a, n, F: F() };
}
const plan = (h: Historique) => planFondations(h.projet.buildings[0]!.floors[0]!)!;
const ligne = (L: LigneMetre[], debut: string) => L.find(l => l.libelle.startsWith(debut));

describe('fondations', () => {
  it('une seule par projet, valeurs proposées, toujours à valider par le bureau d’études ; refusées si elles sont fausses', () => {
    const { h, a, n, F } = maison();
    expect(F).toMatchObject({ kind: 'crawl_space', footingWidth: 500, footingHeight: 250, frostDepth: 800, crawlHeight: 600, padSize: 800, padHeight: 300, hatches: [], status: 'be_validation' });
    expect(F.bearingDepth).toBeUndefined();
    const deux = executer(h, 'x', [{ type: 'creerFondations', niveau: n, genre: 'slab_on_grade' }], a);
    expect(deux.ok ? '' : deux.erreurs.join()).toMatch(/déjà/);
    for (const [c, motif] of [[{ largeur: 100 }, /largeur/], [{ horsGel: 5_000 }, /hors gel/], [{ bonSol: -1 }, /bon sol/], [{ trappes: [{ x: NaN, y: 0 }] }, /trappes/]] as const) {
      const r = executer(h, 'x', [{ type: 'modifierFondations', id: F.id, ...c } as Commande], a);
      expect(r.ok ? '' : r.erreurs.join()).toMatch(motif);
    }
  });

  it('semelles filantes sous les murs porteurs (pas sous la cloison), longueur sans double compte, semelle isolée sous le poteau', () => {
    const P = plan(maison().h);
    /* 4 murs extérieurs + le refend ; la cloison n'a pas de semelle */
    expect(P.filantes).toHaveLength(5);
    /* autour : 36 m à l'axe ; le refend, de face à face des semelles qu'il rejoint : 8 − 2 × 0,25 */
    expect(P.longueur / 1000).toBeCloseTo(36 + 7.5, 6);
    expect(P.emprise).toHaveLength(1);
    expect(P.emprise[0]!.trous).toHaveLength(2);
    expect(P.isolees).toHaveLength(1);
    expect(P.isolees[0]!.contour[0]).toEqual({ x: 2_600, y: 1_600 });
    expect(P.assise).toBe(800);
    expect(P.alertes.join()).toMatch(/bon sol inconnue/);
    expect(P.alertes.join()).toMatch(/sans trappe/);
  });

  it('assise au bon sol s’il est plus bas que le hors gel ; une semelle plus étroite qu’un mur se signale ; annulable', () => {
    const { h, a, F } = maison();
    const h1 = ok(executer(h, 'x', [{ type: 'modifierFondations', id: F.id, bonSol: 1_200, largeur: 400 }], a));
    expect(plan(h1)).toMatchObject({ assise: 1_200 });
    expect(plan(h1).raisonAssise).toMatch(/bon sol/);
    expect(plan(h1).alertes.join()).not.toMatch(/bon sol inconnue/);
    const h2 = ok(executer(h1, 'x', [{ type: 'modifierFondations', id: F.id, largeur: 300 }], a));
    const mur = Object.values(h2.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'wall')!;
    const h3 = ok(executer(h2, 'x', [{ type: 'modifierMur', id: mur.id, epaisseur: 350 }], a));
    expect(plan(h3).alertes.join()).toMatch(/plus étroite/);
    /* le bon sol redevient inconnu */
    const h4 = ok(executer(h1, 'x', [{ type: 'modifierFondations', id: F.id, bonSol: null }], a));
    expect(plan(h4).fondation.bearingDepth).toBeUndefined();
    expect(annuler(h1).projet.buildings[0]!.floors[0]!.objects[F.id]).toMatchObject({ footingWidth: 500 });
  });

  it('trappes de visite : dans une pièce et hors des semelles', () => {
    const { h, a, F } = maison();
    const h1 = ok(executer(h, 'x', [{ type: 'modifierFondations', id: F.id, trappes: [{ x: 3_000, y: 5_500 }, { x: 6_000, y: 6_000 }, { x: -2_000, y: 4_000 }] }], a));
    expect(plan(h1).trappes.map(t => t.ok)).toEqual([true, false, false]);
    expect(plan(h1).alertes.join()).toMatch(/hors des pièces ou sur une semelle/);
    expect(plan(h1).alertes.join()).not.toMatch(/sans trappe/);
  });

  it('métré : fouilles, semelles, béton, soubassement, trappes ; le plancher bas dit son soubassement', () => {
    const { h, a, F } = maison();
    const L = metreProjet(ok(executer(h, 'x', [{ type: 'modifierFondations', id: F.id, trappes: [{ x: 3_000, y: 5_500 }] }], a)).projet);
    const S = 43.5 * 0.5;                       // m² de semelles filantes
    expect(ligne(L, 'Semelles filantes 50 × 25 cm')!.quantite).toBeCloseTo(43.5, 6);
    expect(ligne(L, 'Béton des semelles filantes')!.quantite).toBeCloseTo(S * 0.25, 6);
    expect(ligne(L, 'Fouilles en rigole')).toMatchObject({ lot: 'Terrassement et VRD', quantite: expect.closeTo(S * 0.8, 6), aPreciser: true });
    /* du dessus des semelles (0,80 − 0,25 sous le terrain) au plancher (0,60 de vide) */
    expect(ligne(L, 'Murs de soubassement (vide sanitaire, hauteur 115 cm)')!.quantite).toBeCloseTo(43.5 * 1.15, 6);
    expect(ligne(L, 'Semelles isolées 80 × 80 × 30 cm')!.quantite).toBe(1);
    expect(ligne(L, 'Béton des semelles isolées')!.quantite).toBeCloseTo(0.8 * 0.8 * 0.3, 9);
    expect(ligne(L, 'Trappes de visite')!.quantite).toBe(1);
    expect(ligne(L, 'Ventilation du vide sanitaire')!.aPreciser).toBe(true);
    expect(ligne(L, 'Plancher bas sur vide sanitaire')).toBeDefined();
    expect(ligne(L, 'Dallage / plancher bas')).toBeUndefined();
    /* sur terre-plein : dallage, soubassement jusqu'au terrain, ni trappe ni ventilation */
    const T = metreProjet(maison('slab_on_grade').h.projet);
    expect(ligne(T, 'Dallage sur terre-plein')).toBeDefined();
    expect(ligne(T, 'Murs de soubassement (terre-plein, hauteur 55 cm)')!.quantite).toBeCloseTo(43.5 * 0.55, 6);
    expect(ligne(T, 'Trappes de visite')).toBeUndefined();
  });
});
