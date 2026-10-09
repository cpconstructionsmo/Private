/* Les décors de façade : un autre parement sur une partie d'un mur de
   façade (l'enduit imitation pierre autour de l'entrée des dossiers du
   cabinet). La commande les pose, les règle, les retire et s'annule ; elle
   refuse un décor hors du mur, trop court, sur une cloison ou qui en
   chevauche un autre. La 3D habille cette partie de la peau du mur ; les
   façades du permis la dessinent et la nomment dans leur légende ; la
   notice la cite. Maison fictive tracée ici. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type FinishZone, type Floor, type Project } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { decorParDefaut, partiesLibres, mursDroits, PAREMENT_DECOR, type MurDroit } from '../../src/building';
import { maquette } from '../../src/vue3d/maquette';
import { notice } from '../../src/export/notice';
import { dossierPc } from '../../src/export/planche';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 360, hauteur: 2_500, role: 'exterior', composition: 'ext-isole-36' });
const rdc = (p: Project): Floor => p.buildings[0]!.floors[0]!;
/* le texte d'un PDF, et une chaîne telle que le PDF l'écrit (WinAnsi : é en \xE9, ’ en \x92) */
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');
const enPdf = (s: string) => s.replace(/’/g, '\x92');

/** 12 × 9 m enduite ton pierre, la porte d'entrée au nord (à 6 m du début du mur), une cloison, croupes */
function maison(): { h: Historique; n: string; a: Acteur; nord: MurDroit; cloison: MurDroit } {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = rdc(p).id;
  let h = ok(executer(nouvelHistorique(p), 'Murs', [M(n, 0, 0, 12_000, 0), M(n, 12_000, 0, 12_000, 9_000), M(n, 12_000, 9_000, 0, 9_000), M(n, 0, 9_000, 0, 0),
    { type: 'creerMur', niveau: n, a: { x: 6_000, y: 0 }, b: { x: 6_000, y: 9_000 }, epaisseur: 70, hauteur: 2_500, role: 'partition' }], a));
  const W = mursDroits(rdc(h.projet)), nord = W.find(w => w.axis.a.y === 9_000 && w.axis.b.y === 9_000)!;
  h = ok(executer(h, 'Garnir', [
    ...W.filter(w => w.role === 'exterior').map((w): Commande => ({ type: 'modifierMur', id: w.id, finition: 'enduit-ton-pierre' })),
    { type: 'creerOuverture', mur: nord.id, position: 6_000, largeur: 900, hauteur: 2_150, allege: 0, genre: 'door' },
    { type: 'creerToiture', niveau: n, genre: 'hip', pente: 35, debord: 200, couverture: 'slate' }], a));
  const W2 = mursDroits(rdc(h.projet));
  return { h, n, a, nord: W2.find(w => w.id === nord.id)!, cloison: W2.find(w => w.role === 'partition')! };
}
const mur = (h: Historique, id: string) => mursDroits(rdc(h.projet)).find(w => w.id === id)!;

describe('décors de façade', () => {
  it('le décor proposé entoure la porte d’entrée, d’enduit imitation pierre ; sinon le tiers du milieu ; jamais sur un autre', () => {
    const { h, nord } = maison();
    const z = decorParDefaut(rdc(h.projet), nord)!;
    /* le mur nord va de x = 12 m à x = 0 : la porte est à 6 m de son début, large de 0,90 */
    expect(z).toEqual({ from: 4_550, to: 7_450, finish: PAREMENT_DECOR, label: 'Décoration de l’entrée' });
    const est = mursDroits(rdc(h.projet)).find(w => w.axis.a.x === 12_000 && w.axis.b.x === 12_000)!;
    expect(decorParDefaut(rdc(h.projet), est)).toEqual({ from: 3_000, to: 6_000, finish: PAREMENT_DECOR });
    /* un second décor sur le mur nord : dans une partie libre, sans chevaucher le premier */
    const deja = { ...nord, finishZones: [z] };
    const z2 = decorParDefaut(rdc(h.projet), deja)!;
    expect(z2.to <= z.from || z2.from >= z.to).toBe(true);
    expect(partiesLibres(deja)).toEqual([{ from: 0, to: 4_550 }, { from: 7_450, to: 12_000 }]);
    /* plus de place : rien n'est proposé */
    expect(decorParDefaut(rdc(h.projet), { ...nord, finishZones: [{ from: 0, to: 12_000, finish: PAREMENT_DECOR }] })).toBeNull();
  });

  it('la commande pose, règle et retire les décors ; elle s’annule ; elle refuse ce qui ne va pas', () => {
    const { h, a, nord, cloison } = maison();
    const z: FinishZone = { from: 4_550.4, to: 7_450, finish: PAREMENT_DECOR, label: '  Décoration de l’entrée ' };
    const h1 = ok(executer(h, 'Décor', [{ type: 'modifierMur', id: nord.id, decors: [z] }], a));
    expect(mur(h1, nord.id).finishZones).toEqual([{ from: 4_550, to: 7_450, finish: PAREMENT_DECOR, label: 'Décoration de l’entrée' }]);
    /* le parement du reste du mur ne bouge pas */
    expect(mur(h1, nord.id).finish).toBe('enduit-ton-pierre');
    expect(mur(annuler(h1), nord.id).finishZones ?? null).toBeNull();
    /* rangés le long du mur ; un nom vide n'est pas gardé */
    const h2 = ok(executer(h1, 'Décors', [{ type: 'modifierMur', id: nord.id, decors: [{ from: 9_000, to: 11_000, finish: 'brique-rouge', label: ' ' }, z] }], a));
    expect(mur(h2, nord.id).finishZones!.map(x => [x.from, x.finish, x.label ?? null])).toEqual([[4_550, PAREMENT_DECOR, 'Décoration de l’entrée'], [9_000, 'brique-rouge', null]]);
    const h3 = ok(executer(h2, 'Sans décor', [{ type: 'modifierMur', id: nord.id, decors: [] }], a));
    expect(mur(h3, nord.id).finishZones ?? null).toBeNull();
    const refus = (c: Commande) => { const r = executer(h, 'Décor', [c], a); return r.ok ? '' : r.erreurs.join(' ; ') };
    expect(refus({ type: 'modifierMur', id: nord.id, decors: [{ from: 11_000, to: 13_000, finish: PAREMENT_DECOR }] })).toMatch(/sort du mur/);
    expect(refus({ type: 'modifierMur', id: nord.id, decors: [{ from: 1_000, to: 1_050, finish: PAREMENT_DECOR }] })).toMatch(/au moins 10 cm/);
    expect(refus({ type: 'modifierMur', id: nord.id, decors: [{ from: 1_000, to: 3_000, finish: PAREMENT_DECOR }, { from: 2_500, to: 4_000, finish: 'brique-rouge' }] })).toMatch(/chevauchent/);
    expect(refus({ type: 'modifierMur', id: nord.id, decors: [{ from: 1_000, to: 3_000, finish: 'Pierre !' }] })).toMatch(/parement du décor inconnu/);
    expect(refus({ type: 'modifierMur', id: cloison.id, decors: [{ from: 1_000, to: 3_000, finish: PAREMENT_DECOR }] })).toMatch(/mur de façade/);
  });

  it('la 3D habille la partie du mur de son parement, le reste garde celui du mur', () => {
    const { h, a, nord } = maison();
    const h1 = ok(executer(h, 'Décor', [{ type: 'modifierMur', id: nord.id, decors: [{ from: 4_550, to: 7_450, finish: PAREMENT_DECOR }] }], a));
    const P = maquette(h1.projet).prismes.filter(p => p.objet === nord.id && p.matiere === 'parement');
    const xs = (fin: string) => P.filter(p => p.finition === fin).flatMap(p => p.contour.map(q => q.x));
    /* le décor : de x = 7,45 à 4,55 m (le mur va de 12 à 0), du sol au haut du mur, ouvert à la porte */
    expect(Math.min(...xs(PAREMENT_DECOR))).toBeCloseTo(4_550, 0);
    expect(Math.max(...xs(PAREMENT_DECOR))).toBeCloseTo(7_450, 0);
    expect(Math.max(...P.filter(p => p.finition === PAREMENT_DECOR).map(p => p.z1))).toBe(2_500);
    /* le reste de la façade : l'enduit du mur, de part et d'autre, jusqu'aux angles */
    const E = xs('enduit-ton-pierre');
    expect(Math.min(...E)).toBeLessThan(0);
    expect(Math.max(...E)).toBeGreaterThan(12_000);
    expect(P.filter(p => p.finition === 'enduit-ton-pierre').some(p => p.contour.every(q => q.x > 4_560 && q.x < 7_440))).toBe(false);
    /* un mur sans parement : seul le décor a une peau */
    const h2 = ok(executer(h1, 'Sans parement', [{ type: 'modifierMur', id: nord.id, finition: null }], a));
    const P2 = maquette(h2.projet).prismes.filter(p => p.objet === nord.id && p.matiere === 'parement');
    expect(P2.length).toBeGreaterThan(0);
    expect(P2.every(p => p.finition === PAREMENT_DECOR)).toBe(true);
  });

  it('les façades le dessinent et le nomment dans leur légende ; la notice le cite', () => {
    const { h, a, nord } = maison();
    const s0 = texte(dossierPc(h.projet, { indice: 'A', date: '09/10/2026', maitreOuvrage: 'M. et Mme Fictifs' }).octets);
    expect(s0).not.toContain(enPdf('(D\xE9coration de l’entr\xE9e)'));
    const h1 = ok(executer(h, 'Décor', [{ type: 'modifierMur', id: nord.id, decors: [{ from: 4_550, to: 7_450, finish: PAREMENT_DECOR, label: 'Décoration de l’entrée' }] }], a));
    const s = texte(dossierPc(h1.projet, { indice: 'A', date: '09/10/2026', maitreOuvrage: 'M. et Mme Fictifs' }).octets);
    expect(s).toContain(enPdf('(D\xE9coration de l’entr\xE9e)'));
    expect(s).toContain('(Enduit imitation pierre)');
    /* le parement du reste des façades reste en tête */
    expect(s.indexOf('(Enduit ton pierre)')).toBeGreaterThan(-1);
    expect(s.indexOf('(Enduit ton pierre)')).toBeLessThan(s.indexOf('(Enduit imitation pierre)'));
    const N = notice(h1.projet).flatMap(r => r.paragraphes).join(' ');
    expect(N).toContain('Décors : décoration de l’entrée en enduit imitation pierre.');
    expect(N).toContain('Façades : enduit ton pierre.');
  });
});
