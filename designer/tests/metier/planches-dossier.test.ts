/* Les planches au modèle des dossiers du cabinet : le volet roulant (« VR »
   au plan, dans la légende), le placard (« PL »), les baies cotées
   « 1,20 × 1,25 » et « all. 0,90 », les deux coupes placées d'elles-mêmes
   sur une feuille, le titre de la page de garde en Times, la colonne CP. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Project } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { mursDroits } from '../../src/building';
import { lignesDeCoupe } from '../../src/vue3d/coupe';
import { dossierPc, planchesPdf } from '../../src/export/planche';
import { largeurTexte } from '../../src/export/pdf';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 360, hauteur: 2_500, role: 'exterior', composition: 'ext-isole-36' });
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');

/** 12 × 9 m en murs isolés de 36, une fenêtre 1,20 × 1,25 au sud (allège 0,90), un placard, croupes à 35° */
function maison(): { h: Historique; n: string; fenetre: string; a: Acteur } {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p.buildings[0]!.floors[0]!.id;
  let h = ok(executer(nouvelHistorique(p), 'Murs', [M(n, 0, 0, 12_000, 0), M(n, 12_000, 0, 12_000, 9_000), M(n, 12_000, 9_000, 0, 9_000), M(n, 0, 9_000, 0, 0)], a));
  const sud = mursDroits(h.projet.buildings[0]!.floors[0]!).find(w => w.axis.a.y === 0 && w.axis.b.y === 0)!;
  h = ok(executer(h, 'Garnir', [{ type: 'creerOuverture', mur: sud.id, position: 3_000, largeur: 1_200, hauteur: 1_250, allege: 900, genre: 'window' },
    { type: 'creerMeuble', niveau: n, modele: { id: 'placard-150', label: 'Placard 150' }, position: { x: 9_000, y: 8_400 }, rotation: 0, largeur: 1_500, profondeur: 600, hauteur: 2_500 },
    { type: 'creerPiece', niveau: n, point: { x: 6_000, y: 4_500 }, nom: 'Séjour', usage: 'living' },
    { type: 'creerToiture', niveau: n, genre: 'hip', pente: 35, debord: 200, couverture: 'slate' }], a));
  const fenetre = Object.values(h.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'opening')!.id;
  return { h, n, fenetre, a };
}

describe('planches au modèle des dossiers du cabinet', () => {
  it('le volet d’une baie : la commande le pose, l’efface, refuse l’inconnu ; « VR » au plan et à la légende', () => {
    const { h, n, fenetre, a } = maison();
    const h1 = ok(executer(h, 'Volet', [{ type: 'modifierOuverture', id: fenetre, volet: 'roller_motorized' }], a));
    const o = h1.projet.buildings[0]!.floors[0]!.objects[fenetre]!;
    expect(o.type === 'opening' && o.shutter).toBe('roller_motorized');
    expect(executer(h1, 'Volet', [{ type: 'modifierOuverture', id: fenetre, volet: 'store' as never }], a).ok).toBe(false);
    const s = texte(planchesPdf(h1.projet, { niveaux: [n], cotation: true, mobilier: true, indice: 'A', date: '07/10/2026' }));
    for (const t of ['(VR)', '(VR : volet roulant motoris\xE9)', '(PL)', '(Placard)', '(Doublage isolant)', '(Ma\xE7onnerie \\(murs ext\xE9rieurs, \xE9p. totale 36 cm\\))', '(1,20 \xD7 1,25)', '(all. 0,90)', '(SH : '])
      expect(s, t).toContain(t);
    /* effacé : plus de « VR » */
    const h2 = ok(executer(h1, 'Sans volet', [{ type: 'modifierOuverture', id: fenetre, volet: null }], a));
    const o2 = h2.projet.buildings[0]!.floors[0]!.objects[fenetre]!;
    expect(o2.type === 'opening' && o2.shutter).toBeFalsy();
    expect(texte(planchesPdf(h2.projet, { niveaux: [n], cotation: true, mobilier: true, indice: 'A', date: '07/10/2026' }))).not.toContain('(VR)');
  });

  it('les coupes placées d’elles-mêmes : en travers (A) et en long (B), sur une même feuille', () => {
    const { h } = maison();
    const L = lignesDeCoupe(h.projet);
    expect(L.map(l => l.nom)).toEqual(['A', 'B']);
    /* A en travers de la plus petite dimension (parallèle à y pour une maison plus large que profonde), B en long */
    expect(Math.abs(L[0]!.a.x - L[0]!.b.x)).toBeLessThan(1);
    expect(Math.abs(L[1]!.a.y - L[1]!.b.y)).toBeLessThan(1);
    const s = texte(planchesPdf(h.projet, { niveaux: [], cotation: true, mobilier: false, indice: 'A', date: '07/10/2026', coupe: true }));
    expect(s).toContain('/Count 1');
    for (const t of ['(COUPE A\x96A)', '(COUPE B\x96B)', '(Rep\xE9rage des coupes)', '(Niveau fini RDC)']) expect(s, t).toContain(t);
  });

  it('le comble à la coupe : blanc, « Comble perdu », le plafond et son isolant si la composition est choisie', () => {
    const { h, n, a } = maison();
    const o = { niveaux: [], cotation: true, mobilier: false, indice: 'A', date: '07/10/2026', coupe: true };
    const s0 = texte(planchesPdf(h.projet, o));
    expect(s0).toContain('(Comble perdu)');
    expect(s0).not.toContain('Isolant des combles');
    const h1 = ok(executer(h, 'Plafond', [{ type: 'modifierNiveau', id: n, plafond: 'plafond-combles-soufflee' }], a));
    expect(texte(planchesPdf(h1.projet, o))).toContain('(Isolant des combles : laine souffl\xE9e 32 cm \\(plafond sous combles, laine souffl\xE9e\\))');
  });

  it('la page de garde : le titre en Times, souligné ; chaque planche porte la colonne CP en Times et en italique', () => {
    const { h } = maison();
    const s = texte(dossierPc(h.projet, { indice: 'A', date: '07/10/2026', maitreOuvrage: 'M. et Mme Fictifs' }).octets);
    expect(s).toMatch(/\/F6 19 Tf [^\n]* \(PLAN DE PERMIS DE CONSTRUIRE\) Tj/);
    for (const nom of ['Times-Bold', 'Times-Roman', 'Helvetica-Oblique']) expect(s).toContain('/BaseFont /' + nom);
    expect(s).toMatch(/\/F3 8\.5 Tf [^\n]* \(Num\xE9ro de feuille :\) Tj/);
    /* le Times gras a ses propres largeurs (plus étroites que l'Helvetica gras) */
    expect(largeurTexte('Permis', true, 'serif')).toBeLessThan(largeurTexte('Permis', true));
  });
});
