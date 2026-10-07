/* La coupe déduite de la maquette : trait placé de lui-même (en travers,
   par l'escalier, jamais le long d'un mur), parties tranchées pleines,
   élévation de ce qui est au-delà, planche PDF. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Project } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { mursDroits } from '../../src/building';
import { maquette } from '../../src/vue3d/maquette';
import { coupe, coupeAutomatique } from '../../src/vue3d/coupe';
import { planchesPdf } from '../../src/export/planche';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number, role: 'exterior' | 'partition' = 'exterior'): Commande =>
  ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: role === 'exterior' ? 200 : 100, hauteur: 2_500, role });
const quatre = (n: string) => [M(n, 0, 0, 10_000, 0), M(n, 10_000, 0, 10_000, 8_000), M(n, 10_000, 8_000, 0, 8_000), M(n, 0, 8_000, 0, 0)];

/** 10 × 8 m (axes), une fenêtre 1,20 × 1,25 au sud (allège 0,90) centrée à x = 3 m, croupes à 45°, débord 0,50 */
function maison(extra: (n: string) => Commande[] = () => []): { h: Historique; a: Acteur; n: string } {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p.buildings[0]!.floors[0]!.id;
  let h = ok(executer(nouvelHistorique(p), 'Murs', [...quatre(n), ...extra(n)], a));
  const sud = mursDroits(h.projet.buildings[0]!.floors[0]!).find(w => w.axis.a.y === 0 && w.axis.b.y === 0)!;
  h = ok(executer(h, 'Garnir', [{ type: 'creerOuverture', mur: sud.id, position: 3_000, largeur: 1_200, hauteur: 1_250, allege: 900, genre: 'window' },
    { type: 'creerToiture', niveau: n, genre: 'hip', pente: 45, debord: 500, couverture: 'tile' }], a));
  return { h, a, n };
}
const largeur = (P: { u: number }[]) => Math.max(...P.map(q => q.u)) - Math.min(...P.map(q => q.u));
const zs = (P: { z: number }[]) => [Math.min(...P.map(q => q.z)), Math.max(...P.map(q => q.z))];

describe('coupe', () => {
  it('placée d’elle-même en travers de la maison (10 m de long : trait parallèle au petit côté, par le milieu)', () => {
    const l = coupeAutomatique(maison().h.projet)!;
    expect(l.a.x).toBe(5_000); expect(l.b.x).toBe(5_000);
    expect(l.a.y).toBeLessThan(-100); expect(l.b.y).toBeGreaterThan(8_100);
    expect(l.regard).toEqual({ x: 1, y: 0 });
  });

  it('jamais le long d’un mur : une cloison sur l’axe du milieu l’écarte', () => {
    const l = coupeAutomatique(maison(n => [M(n, 5_000, 0, 5_000, 8_000, 'partition')]).h.projet)!;
    expect(Math.abs(l.a.x - 5_000)).toBeGreaterThan(150);
  });

  it('tranche les deux murs (20 cm, du sol au haut des murs), le plancher et les deux pans jusqu’au faîtage', () => {
    const p = maison().h.projet, c = coupe(maquette(p), coupeAutomatique(p)!);
    const murs = c.coupees.filter(x => x.matiere === 'mur');
    expect(murs).toHaveLength(2);
    for (const w of murs) { expect(largeur(w.points)).toBeCloseTo(200, 6); expect(zs(w.points)).toEqual([0, 2_500]) }
    const pl = c.coupees.filter(x => x.matiere === 'plancher');
    expect(pl).toHaveLength(1); expect(largeur(pl[0]!.points)).toBeCloseTo(8_200, 6);
    const pans = c.coupees.filter(x => x.matiere === 'tuile');
    expect(pans).toHaveLength(2);
    expect(Math.max(...pans.flatMap(x => x.points.map(q => q.z)))).toBeCloseTo(6_600, 6);
    expect(c.boite!.zmax).toBeCloseTo(6_600, 6);
  });

  it('par la fenêtre : allège, vitrage, linteau ; au-delà, le mur du fond vu de face, rien de ce qui est derrière', () => {
    const p = maison().h.projet, c = coupe(maquette(p), { a: { x: 3_000, y: -2_000 }, b: { x: 3_000, y: 10_000 }, regard: { x: 1, y: 0 }, nom: 'B' });
    const vitre = c.coupees.find(x => x.matiere === 'vitrage')!;
    expect(zs(vitre.points)).toEqual([900, 2_150]);
    expect(c.coupees.filter(x => x.matiere === 'mur').map(x => zs(x.points)).sort((a, b) => a[0]! - b[0]!)).toEqual([[0, 900], [0, 2_500], [2_150, 2_500]]);
    /* le mur est (x = 10 m) se voit de face ; le mur ouest, derrière l'observateur, n'apparaît pas */
    expect(c.vues.some(f => f.matiere === 'mur' && f.profondeur > 6_000)).toBe(true);
    expect(c.vues.every(f => f.profondeur >= 0)).toBe(true);
    expect(c.vues.map(f => f.profondeur)).toEqual([...c.vues.map(f => f.profondeur)].sort((a, b) => b - a));
  });

  it('avec un étage et un escalier : la coupe passe par l’escalier, tranche ses marches et montre la trémie', () => {
    const { h, a, n } = maison();
    let h2 = ok(executer(h, 'Étage', [{ type: 'ajouterNiveau', batiment: h.projet.buildings[0]!.id, nom: 'Étage', altitude: 2_700, hauteur: 2_500 }], a));
    const et = h2.projet.buildings[0]!.floors.find(f => f.name === 'Étage')!.id;
    h2 = ok(executer(h2, 'Étage', [...quatre(et), { type: 'creerEscalier', niveau: n, genre: 'straight', position: { x: 1_500, y: 1_000 }, rotation: 0, largeur: 900 }], a));
    const l = coupeAutomatique(h2.projet)!;
    expect(l.a.x).toBe(1_500);
    const c = coupe(maquette(h2.projet), l);
    expect(c.coupees.filter(x => x.matiere === 'escalier').length).toBe(14);
    /* le plancher de l'étage, interrompu par la trémie */
    expect(c.coupees.filter(x => x.matiere === 'plancher' && zs(x.points)[1] === 2_700).length).toBe(2);
  });

  it('export : une planche « Coupe A-A » (hauteurs, plan de repérage) ; le trait sur le plan', () => {
    const p = maison().h.projet;
    const u = planchesPdf(p, { niveaux: [p.buildings[0]!.floors[0]!.id], cotation: true, mobilier: true, indice: 'A', date: '03/10/2026', coupe: true });
    const s = Array.from(u, c => String.fromCharCode(c)).join('');
    expect(s).toContain('/Count 2');
    /* les deux coupes placées d'elles-mêmes (en travers, en long) sur une feuille ; niveaux, repérage, légende */
    for (const t of ['(COUPE A\x96A)', '(COUPE B\x96B)', '(Rep\xE9rage des coupes)', '(Fa\xEEtage)', '(+6,60)', '(Niveau fini RDC)', '(\xB10,00)', '(L\xC9GENDE)', '(NOTES)']) expect(s, t).toContain(t);
  });
});
