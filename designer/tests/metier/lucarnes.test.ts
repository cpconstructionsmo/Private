/* Les lucarnes : jacobine, capucine, rampante, posées sur le pan sud d'une maison fictive de 10 × 8 m (murs de 20 cm
   à l'axe, 2,50 m), toit à deux pans à 35°, débord 20 cm. Le pan sud monte de tan 35° par mm vers le nord, depuis le
   haut des murs au nu (y = −0,10, z = 2,50). Résultats à la main. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Dormer } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { geometrieLucarne, lucarnesDuNiveau, metreProjet } from '../../src/building';
import { maquette } from '../../src/vue3d/maquette';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 6) + (t += 1000)).toISOString(), id: generateurSequentiel('l') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join()); return r.historique };
const refus = (r: ReturnType<typeof executer>) => (r.ok ? '' : r.erreurs.join());
const T = Math.tan((35 * Math.PI) / 180);
const zToit = (y: number) => 2_500 + (y + 100) * T;

function maison() {
  const a = acteur(), p = creerProjet({ nom: 'Fictif', id: generateurSequentiel('p') }), n = p.buildings[0]!.floors[0]!.id;
  const C: [number, number][] = [[0, 0], [10_000, 0], [10_000, 8_000], [0, 8_000]];
  const murs: Commande[] = C.map(([x, y], i) => { const [u, v] = C[(i + 1) % 4]!; return { type: 'creerMur', niveau: n, a: { x, y }, b: { x: u, y: v }, epaisseur: 200, hauteur: 2_500, role: 'exterior' } });
  const h = ok(executer(nouvelHistorique(p), 'Maison', [...murs, { type: 'creerToiture', niveau: n, genre: 'gable', pente: 35, debord: 200, couverture: 'tile' }], a));
  return { h, a, n, f: () => h.projet.buildings[0]!.floors[0]! };
}
const lucarne = (h: Historique) => lucarnesDuNiveau(h.projet.buildings[0]!.floors[0]!)[0]!;

describe('lucarnes', () => {
  it('jacobine : façade du toit à l’égout de la lucarne, fronton, faîtage ; ses noues sont sur le pan', () => {
    const { h, a, n } = maison();
    const h1 = ok(executer(h, 'x', [{ type: 'creerLucarne', niveau: n, genre: 'gable', centre: { x: 5_000, y: 1_000 } }], a));
    const { o, geo } = lucarne(h1);
    /* valeurs proposées ; la pente est celle du toit */
    expect(o).toMatchObject({ kind: 'gable', width: 1_400, height: 1_400, pitch: 35, windowWidth: 800, windowHeight: 950 });
    expect(geo.z0).toBeCloseTo(zToit(1_000), 6);
    expect(geo.zf).toBeCloseTo(zToit(1_000) + 1_400, 6);
    expect(geo.zr).toBeCloseTo(zToit(1_000) + 1_400 + 700 * T, 6);
    expect(geo.toits).toHaveLength(2);
    expect(geo.facade).toHaveLength(5);
    /* chaque sommet de la lucarne qui touche le toit est sur le plan du pan */
    for (const q of [...geo.toits.flat(), ...geo.joues.flat()].filter(q => Math.abs(q.z - zToit(q.y)) < 1)) expect(q.z).toBeCloseTo(zToit(q.y), 6);
    /* le faîtage rejoint le toit à l'altitude du faîtage de la lucarne */
    const fond = Math.max(...geo.plan.map(q => q.y));
    expect(zToit(fond)).toBeCloseTo(geo.zr, 6);
    /* emprise : 1,40 de large, jusqu'au faîtage de la lucarne */
    expect(Math.max(...geo.plan.map(q => q.x)) - Math.min(...geo.plan.map(q => q.x))).toBeCloseTo(1_400, 6);
  });

  it('capucine : trois pans, façade droite ; rampante : un pan moins pentu, qui rejoint le toit', () => {
    const { h, a, n } = maison();
    const h1 = ok(executer(h, 'x', [{ type: 'creerLucarne', niveau: n, genre: 'hip', centre: { x: 5_000, y: 1_000 } }], a));
    expect(lucarne(h1).geo.toits).toHaveLength(3);
    expect(lucarne(h1).geo.facade).toHaveLength(4);
    const h2 = ok(executer(h, 'x', [{ type: 'creerLucarne', niveau: n, genre: 'shed', centre: { x: 5_000, y: 500 }, hauteur: 1_000, fenetreHauteur: 600 }], a));
    const g = lucarne(h2).geo, t = Math.tan((20 * Math.PI) / 180), fond = 1_000 / (T - t);
    expect(lucarne(h2).o.pitch).toBe(20);
    expect(g.zr).toBeCloseTo(zToit(500) + 1_000 + fond * t, 6);
    expect(zToit(500 + fond)).toBeCloseTo(g.zr, 6);
    expect(g.toits).toHaveLength(1);
  });

  it('refusée : hors toiture, débordant du pan, rampante trop pentue, fenêtre trop large ; modifiée, déplacée, annulée', () => {
    const { h, a, n } = maison();
    expect(refus(executer(h, 'x', [{ type: 'creerLucarne', niveau: n, genre: 'gable', centre: { x: 30_000, y: 0 } }], a))).toMatch(/aucun pan/);
    expect(refus(executer(h, 'x', [{ type: 'creerLucarne', niveau: n, genre: 'gable', centre: { x: 5_000, y: 3_000 } }], a))).toMatch(/déborde du pan/);
    expect(refus(executer(h, 'x', [{ type: 'creerLucarne', niveau: n, genre: 'shed', centre: { x: 5_000, y: 500 }, pente: 34 }], a))).toMatch(/moins pentue/);
    expect(refus(executer(h, 'x', [{ type: 'creerLucarne', niveau: n, genre: 'gable', centre: { x: 5_000, y: 1_000 }, fenetreLargeur: 1_300 }], a))).toMatch(/trop large/);
    const h1 = ok(executer(h, 'x', [{ type: 'creerLucarne', niveau: n, genre: 'gable', centre: { x: 5_000, y: 1_000 } }], a));
    const id = lucarne(h1).o.id;
    const h2 = ok(executer(h1, 'x', [{ type: 'modifierLucarne', id, genre: 'hip', largeur: 1_600, centre: { x: 3_000, y: 800 } }], a));
    expect(lucarne(h2).o).toMatchObject({ kind: 'hip', width: 1_600, center: { x: 3_000, y: 800 } });
    expect(annuler(h2).projet.buildings[0]!.floors[0]!.objects[id]).toMatchObject({ kind: 'gable', width: 1_400 });
    expect(refus(executer(h1, 'x', [{ type: 'modifierLucarne', id, centre: { x: 5_000, y: 3_000 } }], a))).toMatch(/déborde/);
    /* la géométrie se recalcule avec la toiture : sans toiture, la lucarne ne se pose plus (elle reste au modèle) */
    const sans = { ...h1.projet.buildings[0]!.floors[0]!, objects: Object.fromEntries(Object.entries(h1.projet.buildings[0]!.floors[0]!.objects).filter(([, o]) => o.type !== 'roof')) };
    expect(geometrieLucarne(sans, lucarne(h1).o as Dormer).ok).toBe(false);
  });

  it('métré et 3D', () => {
    const { h, a, n } = maison();
    const h1 = ok(executer(h, 'x', [{ type: 'creerLucarne', niveau: n, genre: 'gable', centre: { x: 3_000, y: 1_000 } }, { type: 'creerLucarne', niveau: n, genre: 'gable', centre: { x: 7_000, y: 1_000 } }], a));
    const L = metreProjet(h1.projet), l = (d: string) => L.find(x => x.libelle.startsWith(d))!;
    expect(l('Lucarnes — jacobine').quantite).toBe(2);
    expect(l('Fenêtres de lucarne 80 × 95 cm')).toMatchObject({ lot: 'Menuiseries extérieures', quantite: 2 });
    const g = lucarne(h1).geo;
    /* deux pans de 0,70 × tan 35° de rampant (0,70 / cos 35°) sur leur longueur en plan */
    expect(l('Couverture des lucarnes').quantite).toBeCloseTo(2 * g.surfaceCouverture / 1e6, 9);
    expect(g.surfaceCouverture).toBeGreaterThan(0);
    /* fronton : 1,40 × 1,40 + le triangle (0,70 × tan 35° × 1,40 / 2), jouées : 2 × (1,40 × 1,40 / tan 35°) / 2, fenêtre déduite */
    const attendu = 1.4 * 1.4 + 0.7 * T * 1.4 / 2 + 2 * (1.4 * (1.4 / T)) / 2 - 0.8 * 0.95;
    expect(l('Façades et jouées').quantite).toBeCloseTo(2 * attendu, 6);
    const M = maquette(h1.projet), id = lucarne(h1).o.id;
    /* par lucarne : 2 pans, la façade, 2 jouées, la fenêtre */
    expect(M.plaques.filter(p => p.objet === id).map(p => p.matiere).sort()).toEqual(['mur', 'mur', 'mur', 'tuile', 'tuile', 'vitrage']);
  });
});
