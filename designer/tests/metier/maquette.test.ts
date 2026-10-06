/* La maquette 3D, dérivée du plan : volumes exacts des murs découpés par
   les ouvertures, remplissages, planchers et sols, niveaux superposés. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Floor, type Project, type Wall } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { mursDroits } from '../../src/building';
import { maquette, volume, EPAISSEUR_PLANCHER } from '../../src/vue3d/maquette';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const rdc = (p: Project): Floor => p.buildings[0]!.floors[0]!;
const M = (n: string, x1: number, y1: number, x2: number, y2: number, e = 200, role: Wall['role'] = 'exterior'): Commande =>
  ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: e, hauteur: 2_500, role });
const boite = (n: string): Commande[] => [M(n, 0, 0, 10_000, 0), M(n, 10_000, 0, 10_000, 8_000), M(n, 10_000, 8_000, 0, 8_000), M(n, 0, 8_000, 0, 0)];
const m3 = (v: number) => Math.round(v / 1e9 * 1e6) / 1e6;

function maison(avecOuvertures = true) {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = rdc(p).id;
  let h = ok(executer(nouvelHistorique(p), 'Murs', [...boite(n), M(n, 4_000, 0, 4_000, 8_000, 70, 'partition')], a));
  if (avecOuvertures) {
    const W = mursDroits(rdc(h.projet)), bas = W.find(w => w.axis.a.y === 0 && w.axis.b.y === 0)!, cl = W.find(w => w.role === 'partition')!;
    h = ok(executer(h, 'Baies', [
      { type: 'creerOuverture', mur: bas.id, position: 2_000, largeur: 1_200, hauteur: 1_250, allege: 900, genre: 'window' },
      { type: 'creerOuverture', mur: cl.id, position: 4_000, largeur: 830, hauteur: 2_040, genre: 'door' },
      { type: 'creerOuverture', mur: bas.id, position: 7_000, largeur: 900, hauteur: 2_040, genre: 'void' }], a));
  }
  return { h, a, n };
}

describe('maquette 3D', () => {
  it('murs sans ouverture : maçonnerie × hauteur (10,2 × 8,2 − 9,8 × 7,8 = 7,2 m², sur 2,50 m)', () => {
    const { h } = maison(false);
    const P = maquette(h.projet).prismes;
    const murs = P.filter(p => p.matiere === 'mur');
    expect(m3(murs.reduce((s, p) => s + volume(p), 0))).toBeCloseTo(18, 6);
    const cloison = P.filter(p => p.matiere === 'cloison');
    expect(m3(cloison.reduce((s, p) => s + volume(p), 0))).toBeCloseTo(7.8 * 0.07 * 2.5, 6);
    expect(P.every(p => p.z1 > p.z0)).toBe(true);
  });

  it('ouvertures : le vide est retiré du mur, allège et linteau restent ; vitrage, porte, rien pour un passage', () => {
    const { h } = maison();
    const P = maquette(h.projet).prismes;
    const V = (m: string) => m3(P.filter(p => p.matiere === m).reduce((s, p) => s + volume(p), 0));
    /* fenêtre 1,20 × 1,25 et passage 0,90 × 2,04 dans 20 cm ; porte 0,83 × 2,04 dans 7 cm */
    expect(V('mur')).toBeCloseTo(18 - 1.2 * 1.25 * 0.2 - 0.9 * 2.04 * 0.2, 6);
    expect(V('cloison')).toBeCloseTo(7.8 * 0.07 * 2.5 - 0.83 * 2.04 * 0.07, 6);
    const vitre = P.find(p => p.matiere === 'vitrage')!;
    expect([vitre.z0, vitre.z1]).toEqual([900, 2_150]);
    expect(P.filter(p => p.matiere === 'porte')).toHaveLength(1);
    expect(P.filter(p => p.matiere === 'garage')).toHaveLength(0);
    /* le vitrage est au milieu du mur (y = 0, mur à l'axe), dans le tableau */
    const ys = vitre.contour.map(q => q.y), xs = vitre.contour.map(q => q.x);
    expect(Math.min(...ys)).toBeCloseTo(-12, 6); expect(Math.max(...ys)).toBeCloseTo(12, 6);
    expect(Math.min(...xs)).toBeCloseTo(1_400, 6); expect(Math.max(...xs)).toBeCloseTo(2_600, 6);
  });

  it('menuiseries : dormant et ouvrants autour du vitrage, dormant d’une porte, appui de fenêtre dehors ; rien pour un passage', () => {
    const { h } = maison();
    const P = maquette(h.projet).prismes, W = rdc(h.projet).objects;
    const de = (genre: string, m: string) => P.filter(p => p.matiere === m && (W[p.objet!] as { kind?: string })?.kind === genre);
    /* fenêtre de 1,20 m : deux vantaux ; dormant (montants, traverses haute et basse) + 4 profils par vantail */
    expect(de('window', 'menuiserie')).toHaveLength(4 + 2 * 4);
    /* les profils restent dans le tableau (x de 1,40 à 2,60), au milieu du mur (7 cm d'épaisseur) */
    for (const q of de('window', 'menuiserie').flatMap(p => p.contour)) { expect(q.x).toBeGreaterThanOrEqual(1_400 - 1e-6); expect(q.x).toBeLessThanOrEqual(2_600 + 1e-6); expect(Math.abs(q.y)).toBeLessThanOrEqual(35 + 1e-6) }
    /* la porte : deux montants et une traverse haute (pas de seuil) ; le passage : rien */
    expect(de('door', 'menuiserie')).toHaveLength(3);
    expect(de('void', 'menuiserie')).toHaveLength(0);
    /* l'appui : sous l'allège (85 → 90 cm), dehors (y < 0), 4 cm au-delà du nu, 3 cm de chaque côté du tableau */
    const appuis = P.filter(p => p.matiere === 'appui');
    expect(appuis).toHaveLength(1);
    const ap = appuis[0]!, ys = ap.contour.map(q => q.y), xs = ap.contour.map(q => q.x);
    expect([ap.z0, ap.z1]).toEqual([850, 900]);
    expect(Math.min(...ys)).toBeCloseTo(-140, 6); expect(Math.max(...ys)).toBeCloseTo(0, 6);
    expect(Math.min(...xs)).toBeCloseTo(1_370, 6); expect(Math.max(...xs)).toBeCloseTo(2_630, 6);
  });

  it('planchers et sols : un plancher sous la maçonnerie, le sol de chaque pièce fermée', () => {
    const { h } = maison();
    const P = maquette(h.projet).prismes;
    const pl = P.filter(p => p.matiere === 'plancher');
    expect(pl).toHaveLength(1);
    expect([pl[0]!.z0, pl[0]!.z1]).toEqual([-EPAISSEUR_PLANCHER, 0]);
    expect(P.filter(p => p.matiere === 'sol')).toHaveLength(2);
  });

  it('un étage se pose à son altitude ; « jusqu’au RDC » le cache', () => {
    let { h, a, n } = maison(false);
    h = ok(executer(h, 'Étage', [{ type: 'ajouterNiveau', batiment: h.projet.buildings[0]!.id, nom: 'Étage', altitude: 2_750, hauteur: 2_500 }], a));
    const etage = h.projet.buildings[0]!.floors.find(f => f.id !== n)!;
    h = ok(executer(h, 'Murs étage', boite(etage.id), a));
    const tout = maquette(h.projet);
    expect(tout.boite!.zmax).toBe(2_750 + 2_500);
    expect(tout.prismes.filter(p => p.niveau === etage.id && p.matiere === 'mur').every(p => p.z0 === 2_750)).toBe(true);
    const rdcSeul = maquette(h.projet, n);
    expect(rdcSeul.prismes.some(p => p.niveau === etage.id)).toBe(false);
    expect(rdcSeul.boite!.zmax).toBe(2_500);
  });

  it('projet vide : maquette vide', () => {
    const p = creerProjet({ nom: 'Vide', id: generateurSequentiel('p') });
    expect(maquette(p)).toEqual({ prismes: [], plaques: [], boite: null });
  });
});

describe('maquette 3D : la toiture', () => {
  it('croupes : 4 plaques de tuiles sous le faîtage ; deux pans : 2 pans et 2 pignons ; « sans toiture » : rien', () => {
    let { h, a, n } = maison(false);
    h = ok(executer(h, 'Toiture', [{ type: 'creerToiture', niveau: n, genre: 'hip', pente: 45, debord: 500, couverture: 'tile' }], a));
    const M = maquette(h.projet);
    expect(M.plaques).toHaveLength(4);
    expect(M.plaques.every(p => p.matiere === 'tuile' && p.decalage.z === -200)).toBe(true);
    /* murs à l'axe de 20 cm : nu extérieur 10,2 × 8,2 ; faîtage = 2,50 + 4,10 − 0 (débord compté sous le haut des murs) */
    expect(M.boite!.zmax).toBeCloseTo(2_500 + 4_100, 3);
    expect(maquette(h.projet, undefined, { toiture: false }).plaques).toHaveLength(0);
    const r = Object.values(h.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'roof')!;
    h = ok(executer(h, 'Deux pans', [{ type: 'modifierToiture', id: r.id, genre: 'gable' }], a));
    const G = maquette(h.projet).plaques;
    expect(G.filter(p => p.matiere === 'tuile')).toHaveLength(2);
    expect(G.filter(p => p.matiere === 'mur')).toHaveLength(2);
  });
});
