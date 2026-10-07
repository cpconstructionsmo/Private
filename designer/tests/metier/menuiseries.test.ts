/* La teinte et le matériau des menuiseries, de la porte d'entrée et de la
   porte de garage : choisis aux informations du dossier, ils colorent la
   maquette (3D et façades), et la légende des façades comme la notice les
   disent ; tant qu'ils manquent, « [à préciser] ». */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { mursDroits } from '../../src/building';
import { maquette } from '../../src/vue3d/maquette';
import { notice } from '../../src/export/notice';
import { planchesPdf } from '../../src/export/planche';
import { choixOuvrage, couleurOuvrage, TEINTES_MENUISERIES } from '../../src/catalogue/menuiseries';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, hauteur: 2_500, role: 'exterior' });
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');
const notices = (h: Historique) => notice(h.projet).flatMap(r => r.paragraphes).join('\n');

/** 10 × 8 m, une fenêtre et une porte au sud, une porte de garage au nord, un toit à deux pans */
function maison() {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p.buildings[0]!.floors[0]!.id;
  let h = ok(executer(nouvelHistorique(p), 'Murs', [M(n, 0, 0, 10_000, 0), M(n, 10_000, 0, 10_000, 8_000), M(n, 10_000, 8_000, 0, 8_000), M(n, 0, 8_000, 0, 0)], a));
  const W = mursDroits(h.projet.buildings[0]!.floors[0]!), sud = W.find(w => w.axis.a.y === 0 && w.axis.b.y === 0)!, nord = W.find(w => w.axis.a.y === 8_000 && w.axis.b.y === 8_000)!;
  h = ok(executer(h, 'Baies', [
    { type: 'creerOuverture', mur: sud.id, position: 2_500, largeur: 1_200, hauteur: 1_250, allege: 900, genre: 'window' },
    { type: 'creerOuverture', mur: sud.id, position: 6_000, largeur: 900, hauteur: 2_150, genre: 'door' },
    { type: 'creerOuverture', mur: nord.id, position: 5_000, largeur: 2_400, hauteur: 2_000, genre: 'garage_door' },
    { type: 'creerToiture', niveau: n, genre: 'gable', pente: 35, debord: 300, couverture: 'slate' }], a));
  return { h, n, a };
}

describe('menuiseries : matériau et teinte', () => {
  it('la commande les garde, refuse une teinte inconnue, les retire ; les portes prennent ceux des menuiseries à défaut', () => {
    const { h, a } = maison();
    expect(executer(h, 'x', [{ type: 'modifierDossier', champs: { menuiseries: { teinte: 'ral-0000' } } }], a).ok).toBe(false);
    const h1 = ok(executer(h, 'Menuiseries', [{ type: 'modifierDossier', champs: { menuiseries: { materiau: ' PVC ', teinte: 'ral-9016' }, porteEntree: { materiau: 'Aluminium' } } }], a));
    expect(h1.projet.dossier?.menuiseries).toEqual({ materiau: 'PVC', teinte: 'ral-9016' });
    expect(choixOuvrage(h1.projet.dossier, 'porteEntree')).toEqual({ materiau: 'Aluminium', teinte: 'ral-9016' });
    expect(choixOuvrage(h1.projet.dossier, 'porteGarage')).toEqual({ materiau: 'PVC', teinte: 'ral-9016' });
    expect(couleurOuvrage(h1.projet.dossier, 'porteGarage')).toBe(TEINTES_MENUISERIES.find(t => t.id === 'ral-9016')!.couleur);
    /* null, ou un choix vide, le retire */
    const h2 = ok(executer(h1, 'Retirer', [{ type: 'modifierDossier', champs: { menuiseries: null, porteEntree: {} } }], a));
    expect(h2.projet.dossier?.menuiseries).toBeUndefined();
    expect(h2.projet.dossier?.porteEntree).toBeUndefined();
  });

  it('la maquette prend la teinte choisie : dormants et ouvrants des baies, porte, porte de garage ; rien de choisi, rien de changé', () => {
    const { h, a } = maison();
    const avant = maquette(h.projet).prismes.filter(p => ['menuiserie', 'porte', 'garage'].includes(p.matiere));
    expect(avant.every(p => !p.finition)).toBe(true);
    const h1 = ok(executer(h, 'Menuiseries', [{ type: 'modifierDossier', champs: { menuiseries: { teinte: 'ral-9016' }, porteEntree: { teinte: 'ral-5003' }, porteGarage: { teinte: 'ral-7035' } } }], a));
    const P = maquette(h1.projet).prismes;
    expect(P.filter(p => p.matiere === 'porte').every(p => p.finition === 'ral-5003')).toBe(true);
    expect(P.filter(p => p.matiere === 'garage').every(p => p.finition === 'ral-7035')).toBe(true);
    const fins = new Set(P.filter(p => p.matiere === 'menuiserie').map(p => p.finition));
    expect([...fins].sort()).toEqual(['ral-5003', 'ral-7035', 'ral-9016']);       // chaque dormant à la teinte de son ouvrage
    expect(P.filter(p => p.matiere === 'vitrage').every(p => !p.finition)).toBe(true);
  });

  it('les façades et la notice les disent ; tant qu’ils manquent, « [à préciser] »', () => {
    const { h, n, a } = maison();
    const opts = { niveaux: [n], cotation: true, mobilier: false, indice: 'A', date: '07/10/2026', facades: true };
    const s0 = texte(planchesPdf(h.projet, opts));
    expect(s0).toContain('(mat\xE9riau [\xE0 pr\xE9ciser] \x96 dessin\xE9es gris anthracite \x96 teinte [\xE0 pr\xE9ciser]');
    expect(notices(h)).toContain('matériau [à compléter], teinte [à compléter]');
    const h1 = ok(executer(h, 'Menuiseries', [{ type: 'modifierDossier', champs: { menuiseries: { materiau: 'PVC', teinte: 'ral-9016' }, porteEntree: { materiau: 'Acier', teinte: 'ral-7016' } } }], a));
    const s1 = texte(planchesPdf(h1.projet, opts));
    for (const t of ['(PVC \x96 RAL 9016 blanc)', '(Acier \x96 RAL 7016 gris anthracite)']) expect(s1, t).toContain(t);
    expect(s1).not.toContain('teinte [\xE0 pr\xE9ciser]');
    const N = notices(h1);
    expect(N).toContain('PVC, RAL 9016 blanc');
    expect(N).toContain('porte d’entrée : Acier, RAL 7016 gris anthracite');
    expect(N).not.toContain('porte de garage :');             // comme les menuiseries : on ne le répète pas
  });
});
