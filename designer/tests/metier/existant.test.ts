/* Rénovation et extension (ADR-0007) : une maison existante (10 × 8 m,
   une cloison, une fenêtre et une porte), passée en existant ; la cloison
   est à démolir, la fenêtre de l'est à boucher, une porte est percée dans le
   mur est, et une extension de 4 × 6 m s'y accole. Les commandes posent et
   refusent les états ; le projet ignore ce qui est démoli (pièces, 3D,
   métré, fondations) ; les surfaces disent l'existant, le créé et la
   formalité ; les planches légendent l'existant et le démoli ; le dossier de
   déclaration préalable reprend les planches sous les codes DP. Maison fictive. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Floor, type Project } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { mursDroits, mursDemolis, planDuNiveau, niveauExistant, aDesExistants, surfacesReglementaires, metreProjet, murSurSemelle, toitureDuNiveau, projetExistant, type MurDroit } from '../../src/building';
import { maquette } from '../../src/vue3d/maquette';
import { notice } from '../../src/export/notice';
import { dossierPc, dossierDp } from '../../src/export/planche';
import { JPEG } from './dossier.test';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const rdc = (p: Project): Floor => p.buildings[0]!.floors[0]!;
const M = (n: string, x1: number, y1: number, x2: number, y2: number, role: 'exterior' | 'partition' = 'exterior'): Commande =>
  ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: role === 'exterior' ? 200 : 70, hauteur: 2_500, role });
const R = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');
const textes = (s: string) => [...s.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(m => m[1]!.replace(/\\(.)/g, '$1')).join(' ');
const murEst = (f: Floor): MurDroit => [...mursDroits(f), ...mursDemolis(f)].find(w => w.axis.a.x === 10_000 && w.axis.b.x === 10_000)!;

/** la maison existante relevée : 4 murs, une cloison à x = 5 m, une fenêtre à l'est, une porte au sud ; la parcelle (zone donnée ou non) */
function existante(zone?: string): { h: Historique; n: string; a: Acteur } {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = rdc(p).id;
  let h = ok(executer(nouvelHistorique(p), 'Relevé', [M(n, 0, 0, 10_000, 0), M(n, 10_000, 0, 10_000, 8_000), M(n, 10_000, 8_000, 0, 8_000), M(n, 0, 8_000, 0, 0),
    M(n, 5_000, 0, 5_000, 8_000, 'partition'),
    { type: 'creerParcelle', niveau: n, contour: R(-6_000, -6_000, 24_000, 14_000), voies: [0], ...(zone ? { plu: { zone } } : {}) }], a));
  const f = rdc(h.projet), est = murEst(f), sud = mursDroits(f).find(w => w.axis.a.y === 0 && w.axis.b.y === 0 && w.role === 'exterior')!;
  h = ok(executer(h, 'Baies', [{ type: 'creerOuverture', mur: est.id, position: 2_000, largeur: 1_200, hauteur: 1_250, allege: 900, genre: 'window' },
    { type: 'creerOuverture', mur: sud.id, position: 2_500, largeur: 900, hauteur: 2_150, allege: 0, genre: 'door' }], a));
  /* tout le niveau existant : les murs d'abord, puis leurs baies */
  const g = rdc(h.projet);
  h = ok(executer(h, 'Niveau existant', [...mursDroits(g).map((w): Commande => ({ type: 'modifierMur', id: w.id, phase: 'existing' })),
    ...Object.values(g.objects).filter(o => o.type === 'opening').map((o): Commande => ({ type: 'modifierOuverture', id: o.id, phase: 'existing' }))], a));
  return { h, n, a };
}

/** puis les travaux : la cloison démolie, la fenêtre est bouchée, une porte percée à l'est, l'extension de 4 × 6 m */
function travaux(zone?: string): { h: Historique; n: string; a: Acteur } {
  const { h: h0, n, a } = existante(zone);
  const f = rdc(h0.projet), est = murEst(f), cloison = mursDroits(f).find(w => w.role === 'partition')!;
  const fenetre = Object.values(f.objects).find(o => o.type === 'opening' && o.kind === 'window')!;
  let h = ok(executer(h0, 'Démolitions', [{ type: 'modifierMur', id: cloison.id, phase: 'demolished' }, { type: 'modifierOuverture', id: fenetre.id, phase: 'demolished' }], a));
  h = ok(executer(h, 'Extension', [M(n, 10_000, 1_000, 14_000, 1_000), M(n, 14_000, 1_000, 14_000, 7_000), M(n, 14_000, 7_000, 10_000, 7_000),
    { type: 'creerOuverture', mur: est.id, position: 5_000, largeur: 900, hauteur: 2_150, allege: 0, genre: 'door' },
    { type: 'creerPiece', niveau: n, point: { x: 12_000, y: 4_000 }, nom: 'Extension', usage: 'living' }], a));
  return { h, n, a };
}

describe('rénovation et extension : existant, démoli, projeté', () => {
  it('les commandes posent les états, s’annulent, et refusent ce qui n’a pas de sens', () => {
    const { h, a } = existante();
    const f = rdc(h.projet);
    expect(mursDroits(f).every(w => w.phase === 'existing')).toBe(true);
    expect(Object.values(f.objects).filter(o => o.type === 'opening').every(o => o.type === 'opening' && o.phase === 'existing')).toBe(true);
    expect(aDesExistants(h.projet)).toBe(true);
    const est = murEst(f), refus = (c: Commande) => { const r = executer(h, 'x', [c], a); return r.ok ? '' : r.erreurs.join(' ; ') };
    /* un mur ne repasse pas au projet avec ses baies existantes ; une baie existante est dans un mur existant */
    expect(refus({ type: 'modifierMur', id: est.id, phase: null })).toMatch(/baies existantes/);
    const h2 = ok(executer(h, 'Mur neuf', [M(rdc(h.projet).id, 0, 8_000, -3_000, 8_000)], a));
    const neuf = mursDroits(rdc(h2.projet)).find(w => !w.phase)!;
    const h3 = ok(executer(h2, 'Baie', [{ type: 'creerOuverture', mur: neuf.id, position: 1_500, largeur: 900, hauteur: 1_000, allege: 1_000, genre: 'window' }], a));
    const b3 = Object.values(rdc(h3.projet).objects).find(o => o.type === 'opening' && o.hostWallId === neuf.id)!;
    expect(executer(h3, 'x', [{ type: 'modifierOuverture', id: b3.id, phase: 'existing' }], a).ok).toBe(false);
    expect(refus({ type: 'modifierMur', id: est.id, phase: 'n_importe' as never })).toMatch(/état inconnu/);
    /* un mur à démolir ne reçoit pas de nouvelle baie */
    const hd = ok(executer(h, 'Démolir', [{ type: 'modifierMur', id: est.id, phase: 'demolished' }], a));
    expect(executer(hd, 'x', [{ type: 'creerOuverture', mur: est.id, position: 6_000, largeur: 900, hauteur: 2_150, allege: 0, genre: 'door' }], a).ok).toBe(false);
    expect(murEst(rdc(annuler(hd).projet)).phase).toBe('existing');
  });

  it('le projet ignore le démoli : une seule pièce sans la cloison, pas de 3D ni de baie pour ce qui part', () => {
    const { h: h0 } = existante();
    expect(planDuNiveau(rdc(h0.projet)).zones).toHaveLength(2);
    const { h } = travaux();
    const f = rdc(h.projet), cloison = mursDemolis(f)[0]!;
    expect(mursDemolis(f)).toHaveLength(1);
    expect(mursDroits(f).some(w => w.id === cloison.id)).toBe(false);
    const plan = planDuNiveau(f);
    /* la maison sans sa cloison (une pièce) et l'extension : deux espaces ; aucune alerte d'ouverture orpheline */
    expect(plan.zones).toHaveLength(2);
    expect(plan.alertes.some(x => x.genre === 'ouverture_orpheline')).toBe(false);
    /* la fenêtre bouchée n'est plus une baie ; la porte percée en est une */
    const fenetre = Object.values(f.objects).find(o => o.type === 'opening' && o.kind === 'window')!;
    expect(plan.baies.some(b => b.id === fenetre.id)).toBe(false);
    expect(plan.baies.filter(b => b.mur === murEst(f).id)).toHaveLength(1);
    const P = maquette(h.projet).prismes;
    expect(P.some(p => p.objet === cloison.id)).toBe(false);
    expect(P.some(p => p.objet === fenetre.id)).toBe(false);
  });

  it('l’état existant se dérive : les murs d’avant (le démoli compris), sans l’extension', () => {
    const { h } = travaux();
    const E = niveauExistant(rdc(h.projet));
    expect(mursDroits(E)).toHaveLength(5);
    expect(mursDroits(E).every(w => w.phase === 'existing')).toBe(true);
    expect(planDuNiveau(E).zones).toHaveLength(2);
    /* la fenêtre est encore là, la porte percée pas encore */
    const baies = planDuNiveau(E).baies;
    expect(baies.map(b => b.genre).sort()).toEqual(['door', 'window']);
    expect(niveauExistant(rdc(h.projet))).toBe(E);
  });

  it('les surfaces : existant, créé, formalité indicative (zone urbaine ou non)', () => {
    const { h } = travaux();
    const S = surfacesReglementaires(h.projet), T = S.travaux!;
    /* l'existant : 9,8 × 7,8 m au nu intérieur ; l'extension : 3,8 × 5,8 m entre ses murs et le mur est (mitoyen, déduit) */
    expect(T.existant.surfacePlancher / 1e6).toBeCloseTo(9.8 * 7.8, 1);
    expect(T.creee.surfacePlancher / 1e6).toBeCloseTo(3.8 * 5.8, 1);
    /* l'emprise créée : de la face est de la maison (10,1 m) au nu extérieur de l'extension (14,1 m), sur 6,2 m */
    expect(T.creee.emprise / 1e6).toBeCloseTo(4.0 * 6.2, 1);
    expect(S.surfacePlancher / 1e6).toBeCloseTo(9.8 * 7.8 + 3.8 * 5.8, 1);
    /* plus de 20 m² créés, zone inconnue : permis ; en zone UB, jusqu'à 40 m² : déclaration préalable */
    expect(T.formalite.genre).toBe('PC');
    expect(T.formalite.message).toMatch(/zone du PLU à préciser/);
    const U = surfacesReglementaires(travaux('UB').h.projet).travaux!;
    expect(U.formalite.genre).toBe('DP');
    expect(U.formalite.message).toMatch(/jusqu’à 40 m², zone UB \(urbaine\)/);
    expect(U.formalite.message).toMatch(/à vérifier/);
    /* une construction neuve n'a pas de rubrique travaux */
    const { h: n0 } = existante();
    const neuve = rdc(n0.projet);
    expect(surfacesReglementaires({ ...n0.projet, buildings: [{ ...n0.projet.buildings[0]!, floors: [{ ...neuve, objects: Object.fromEntries(Object.entries(neuve.objects).map(([k, o]) => [k, o.type === 'wall' || o.type === 'opening' ? { ...o, phase: undefined } : o])) as Floor['objects'] }] }] }).travaux).toBeUndefined();
  });

  it('le métré ne compte que les travaux ; les fondations ne vont que sous les murs neufs', () => {
    const { h } = travaux();
    const L = metreProjet(h.projet), q = (re: RegExp) => L.filter(l => re.test(l.libelle)).reduce((s, l) => s + l.quantite, 0);
    expect(q(/^Cloisons existants à démolir \(surface\)/)).toBeCloseTo(8 * 2.5, 3);
    expect(L.find(l => /Cloisons existants à démolir/.test(l.libelle))!.lot).toBe('Démolition');
    /* les murs extérieurs comptés : ceux de l'extension seulement (4 + 6 + 4 m à l'axe) */
    expect(q(/^Murs extérieurs .*\(longueur à l’axe\)/)).toBeCloseTo(14, 3);
    expect(q(/^Bouchement de baies existantes/)).toBeCloseTo(1.2 * 1.25, 3);
    expect(q(/^Percements de baies dans des murs existants/)).toBe(1);
    /* menuiseries : la porte percée seulement (ni la fenêtre bouchée, ni la porte existante) */
    expect(L.filter(l => l.lot === 'Menuiseries extérieures').reduce((s, l) => s + l.quantite, 0)).toBe(1);
    /* les fondations : sous les seuls murs neufs (l'existant a les siennes) */
    const W = mursDroits(rdc(h.projet));
    expect(W.filter(murSurSemelle)).toHaveLength(3);
    expect(W.filter(murSurSemelle).every(w => !w.phase)).toBe(true);
  });

  it('les planches : la légende dit l’existant, le démoli, les baies à boucher ; page de garde et notice disent les travaux', () => {
    const { h } = travaux('UB');
    const s = texte(dossierPc(h.projet, { indice: 'A', date: '10/10/2026', maitreOuvrage: 'M. et Mme Fictifs' }).octets), T = textes(s);
    for (const t of ['Existant conserv\xE9', 'Existant \xE0 d\xE9molir', 'Baie existante \xE0 boucher', 'Ma\xE7onnerie \xE0 construire', 'S.P existante / cr\xE9\xE9e (m\xB2)', 'Emprise existante / cr\xE9\xE9e (m\xB2)'])
      expect(T, t).toContain(t);
    const N = notice(h.projet).flatMap(r => r.paragraphes).join(' ');
    expect(N).toMatch(/Le projet transforme une construction existante \(surface de plancher existante 76,44 m², emprise au sol [\d,]+ m²\), avec la démolition de 1 mur ; il crée 22,04 m² de surface de plancher/);
    expect(N).toMatch(/Formalité indicative : .*déclaration préalable/);
  });

  it('la toiture : l’existant garde la sienne, l’extension a la sienne (ses réglages, ou les mêmes)', () => {
    const { h: h0, n, a } = travaux();
    let h = ok(executer(h0, 'Toit', [{ type: 'creerToiture', niveau: n, genre: 'hip', pente: 35, debord: 300, couverture: 'slate' }], a));
    const T = toitureDuNiveau(rdc(h.projet))!;
    expect(T.ok).toBe(true);
    if (!T.ok) return;
    /* deux toitures : la maison (10,2 × 8,2 m au nu extérieur) et l'extension, chacune à croupes */
    expect(T.toitures).toHaveLength(2);
    expect(T.toitures.filter(t => t.extension)).toHaveLength(1);
    expect(T.toitures.every(t => t.genre === 'hip')).toBe(true);
    /* l'extension en appentis de 15°, en zinc, contre la maison */
    const roof = Object.values(rdc(h.projet).objects).find(o => o.type === 'roof')!;
    h = ok(executer(h, 'Extension', [{ type: 'modifierToiture', id: roof.id, extension: { kind: 'shed', pitch: 15, covering: 'zinc' } }], a));
    const T2 = toitureDuNiveau(rdc(h.projet))!;
    if (!T2.ok) throw new Error(T2.raison);
    const ext = T2.toitures.find(t => t.extension)!, maison = T2.toitures.find(t => !t.extension)!;
    expect([ext.genre, ext.couverture, maison.genre, maison.couverture ?? null]).toEqual(['shed', 'zinc', 'hip', null]);
    expect(maquette(h.projet).plaques.some(p => p.matiere === 'zinc') && maquette(h.projet).plaques.some(p => p.matiere === 'ardoise')).toBe(true);
    /* refus : une pente hors limites, une couverture inconnue ; null rend les mêmes réglages */
    expect(executer(h, 'x', [{ type: 'modifierToiture', id: roof.id, extension: { kind: 'shed', pitch: 90 } }], a).ok).toBe(false);
    expect(executer(h, 'x', [{ type: 'modifierToiture', id: roof.id, extension: { kind: 'shed', pitch: 15, covering: 'paille' as never } }], a).ok).toBe(false);
    const h3 = ok(executer(h, 'Mêmes', [{ type: 'modifierToiture', id: roof.id, extension: null }], a));
    const T3 = toitureDuNiveau(rdc(h3.projet))!;
    expect(T3.ok && T3.toitures.find(t => t.extension)!.genre).toBe('hip');
    /* l'état existant : une seule toiture, sur la maison d'avant */
    const TE = toitureDuNiveau(rdc(projetExistant(h.projet)))!;
    expect(TE.ok && TE.toitures.length === 1 && !TE.toitures[0]!.extension).toBe(true);
  });

  it('le dossier : coupes et façades de l’état existant, puis de l’état projeté ; le sommaire renvoie aux deux', () => {
    const { h: h0, n, a } = travaux('UB');
    const h = ok(executer(h0, 'Toit', [{ type: 'creerToiture', niveau: n, genre: 'hip', pente: 35, debord: 300, couverture: 'slate' }], a));
    const { octets, pieces } = dossierPc(h.projet, { indice: 'A', date: '10/10/2026' });
    const T = textes(texte(octets));
    expect(T).toMatch(/FA\xC7ADE [A-Z\-]+ \x96 \xC9TAT EXISTANT/);
    expect(T).toMatch(/FA\xC7ADE [A-Z\-]+ \x96 \xC9TAT PROJET\xC9/);
    expect(T).toContain('FA\xC7ADES \xE9tat existant');
    /* les coupes aussi : l'existant (aux mêmes traits), puis le projet ; le PCMI 3 renvoie aux deux */
    expect(T).toMatch(/COUPE [A-Z]\x96[A-Z] \x96 \xC9TAT EXISTANT/);
    expect(T).toMatch(/COUPE [A-Z]\x96[A-Z] \x96 \xC9TAT PROJET\xC9/);
    const p3 = pieces.find(p => p.code === 'PCMI 3')!;
    expect(p3.note).toMatch(/^état existant : page (\d+), état projeté : page (\d+)$/);
    expect(p3.page).toBe(Number(/page (\d+),/.exec(p3.note!)![1]));
    const p5 = pieces.find(p => p.code === 'PCMI 5')!;
    expect(p5.note).toMatch(/^état existant : page (\d+), état projeté : page (\d+) ; plan de toiture : page \d+$/);
    const [, e, pj] = /page (\d+), état projeté : page (\d+)/.exec(p5.note!)!;
    expect(Number(pj)).toBe(Number(e) + 1);
    expect(p5.page).toBe(Number(e));
  });
  it('la déclaration préalable : les mêmes planches sous les codes DP1 à DP8, la notice et les plans en complément', () => {
    const { h: h0, n, a } = travaux('UB');
    const h = ok(executer(h0, 'Toit', [{ type: 'creerToiture', niveau: n, genre: 'hip', pente: 35, debord: 300, couverture: 'slate' }], a));
    const vue = { jpeg: JPEG, largeur: 8, hauteur: 8 };
    const { octets, pieces } = dossierDp(h.projet, { indice: 'A', date: '10/10/2026', perspective: vue });
    const T = textes(texte(octets));
    /* le bordereau de la déclaration, dans son ordre ; les compléments à la fin */
    expect(pieces.map(p => p.code)).toEqual(['DP1', 'DP2', 'DP3', 'DP4', 'DP5', 'DP6', 'DP7', 'DP8', '\u2014', '\u2014']);
    expect(pieces.slice(-2).map(p => p.intitule)).toEqual(['Notice descriptive (complément)', 'Plans des niveaux (complément)']);
    const p = (code: string) => pieces.find(x => x.code === code)!;
    /* la DP4 : façades existantes puis projetées, puis la toiture ; la DP5 : la vue 3D, juste après */
    expect(p('DP4').note).toMatch(/^état existant : page (\d+), état projeté : page (\d+) ; plan de toiture : page (\d+)$/);
    const toit = Number(/plan de toiture : page (\d+)/.exec(p('DP4').note!)![1]);
    expect(p('DP5').page).toBe(toit + 1);
    expect(p('DP6').page).toBeNull();
    expect(p('DP3').note).toMatch(/profil du terrain/);
    /* la notice suit les pièces du bordereau, avant les plans des niveaux */
    expect(pieces.at(-2)!.page).toBe(p('DP5').page! + 1);
    /* les planches portent leur code de déclaration ; aucun code du permis ne reste */
    expect(T).toContain('PLAN DE D\xC9CLARATION PR\xC9ALABLE');
    expect(T).toContain('D\xC9CLARATION PR\xC9ALABLE \x97 INDICE A');
    expect(T).toContain('DP5 \x97 ASPECT EXT\xC9RIEUR DU PROJET');
    expect(T).toContain('(compl\xE9ment au dossier de d\xE9claration pr\xE9alable, facultatif)');
    expect(T).toContain('TRAVAUX SUR UNE MAISON INDIVIDUELLE EXISTANTE');
    for (const c of ['DP2', 'DP3', 'DP4']) expect(T, c).toContain(c);
    /* le plan de masse (DP2) distingue la maison existante de l'extension */
    expect(T).toContain('Construction existante conserv\xE9e (toiture)');
    expect(T).toContain('Extension projet\xE9e (toiture)');
    expect(T).not.toMatch(/PCMI/);
    /* le dossier de permis du même projet garde ses codes et son ordre */
    const pc = dossierPc(h.projet, { indice: 'A', date: '10/10/2026', perspective: vue }).pieces;
    expect(pc.map(x => x.code)).toEqual(['PCMI 1', 'PCMI 2', 'PCMI 3', 'PCMI 4', 'PCMI 5', 'PCMI 6', 'PCMI 7', 'PCMI 8', '\u2014']);
  });

  it('la déclaration préalable prévient quand la surface créée appelle un permis', () => {
    const { h } = travaux();
    const T = textes(texte(dossierDp(h.projet, { indice: 'A', date: '10/10/2026' }).octets));
    expect(T).toContain('la formalit\xE9 indicative est le permis de construire');
    expect(textes(texte(dossierDp(travaux('UB').h.projet, { indice: 'A', date: '10/10/2026' }).octets))).toContain('bordereau de la d\xE9claration pr\xE9alable');
  });
});
