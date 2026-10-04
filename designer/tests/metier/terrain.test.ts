/* Le plan de masse (PCMI 2) : la parcelle, l'emprise au sol, les reculs
   mesurés, l'implantation (la parcelle se place autour de la maison), le
   tracé de la limite, la planche PDF, et le terrain lu par l'atelier. */
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/atelier_fictif.json?raw';
import { creerProjet, generateurSequentiel, type Plot, type Project } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { aireEmprise, empriseAuSol, maisonDansParcelle, orienterParcelle, parcelleDuProjet, placerParcelle, reculs, surfaceTerrain } from '../../src/building';
import { planchesPdf } from '../../src/export/planche';
import { commandesImport, lireModeleAtelier } from '../../src/import';
import { Outils, type Effet } from '../../src/ui/outils';
import { viser } from '../../src/ui/selection';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, role: 'exterior' });
const R = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

/** 10 × 8 m (axes ; maçonnerie de −0,10 à 10,10 × −0,10 à 8,10), sur une parcelle de 30 × 20 m */
function maison(parcelle = true): { h: Historique; a: Acteur; n: string } {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p.buildings[0]!.floors[0]!.id;
  const c: Commande[] = [M(n, 0, 0, 10_000, 0), M(n, 10_000, 0, 10_000, 8_000), M(n, 10_000, 8_000, 0, 8_000), M(n, 0, 8_000, 0, 0)];
  if (parcelle) c.push({ type: 'creerParcelle', niveau: n, contour: R(-5_000, -3_000, 25_000, 17_000), voies: [0], nomVoie: 'rue des Essais' });
  return { h: ok(executer(nouvelHistorique(p), 'Maison', c, a)), a, n };
}
const plot = (p: Project): Plot => parcelleDuProjet(p)!.plot;

describe('parcelle : commandes', () => {
  it('une seule par projet ; 10 m² au moins ; côtés sur voie existants ; annulable', () => {
    const { h, a, n } = maison();
    expect(plot(h.projet).street).toEqual([0]);
    expect(executer(h, 'x', [{ type: 'creerParcelle', niveau: n, contour: R(0, 0, 20_000, 20_000) }], a).ok).toBe(false);
    const { h: h2 } = maison(false);
    expect(executer(h2, 'x', [{ type: 'creerParcelle', niveau: n, contour: R(0, 0, 2_000, 2_000) }], a).ok).toBe(false);
    expect(executer(h2, 'x', [{ type: 'creerParcelle', niveau: n, contour: R(0, 0, 20_000, 20_000), voies: [4] }], a).ok).toBe(false);
    const h3 = ok(executer(h, 'x', [{ type: 'modifierParcelle', id: plot(h.projet).id, voies: [0, 1], reference: 'AB 123', nomVoie: '', altitudeRdc: 112.35 }], a));
    const t = plot(h3.projet);
    expect([t.street, t.reference, t.streetName, t.groundFloorNgf]).toEqual([[0, 1], 'AB 123', undefined, 112.35]);
    expect(plot(annuler(h3).projet).streetName).toBe('rue des Essais');
  });
});

describe('parcelle : mesures', () => {
  it('surface du terrain 600 m², emprise au sol 83,64 m² (maçonnerie de tous les niveaux réunie)', () => {
    const { h } = maison();
    expect(surfaceTerrain(plot(h.projet)) / 1e6).toBeCloseTo(600, 9);
    expect(aireEmprise(empriseAuSol(h.projet)) / 1e6).toBeCloseTo(10.2 * 8.2, 6);
  });

  it('reculs mesurés de la maçonnerie à chaque côté : 2,90 (voie), 14,90, 8,90, 4,90', () => {
    const { h } = maison(), r = reculs(plot(h.projet), empriseAuSol(h.projet));
    expect(r.map(x => Math.round(x.distance))).toEqual([2_900, 14_900, 8_900, 4_900]);
    expect(r.map(x => x.voie)).toEqual([true, false, false, false]);
    expect(r[0]!.vers.y).toBeCloseTo(-3_000, 6); expect(r[0]!.de.y).toBeCloseTo(-100, 6);
  });

  it('implanter : la parcelle se place à 5 m de la voie et 3 m du côté gauche ; côtés parallèles refusés', () => {
    const { h } = maison(), t = plot(h.projet), E = empriseAuSol(h.projet);
    const c = placerParcelle(t, E, 0, 5_000, 3, 3_000)!;
    const r = reculs({ ...t, contour: c }, E);
    expect(r[0]!.distance).toBeCloseTo(5_000, 3); expect(r[3]!.distance).toBeCloseTo(3_000, 3);
    expect(placerParcelle(t, E, 0, 5_000, 2, 3_000)).toBeNull();
  });

  it('la maison dans la parcelle ; trop petite, ou en L dont l’angle rentrant mord sur la maison : dehors', () => {
    const { h } = maison(), t = plot(h.projet), E = empriseAuSol(h.projet);
    expect(maisonDansParcelle(t, E)).toBe(true);
    expect(maisonDansParcelle({ ...t, contour: R(-1_000, -1_000, 8_000, 9_000) }, E)).toBe(false);
    const L = [{ x: -1_000, y: -1_000 }, { x: 11_000, y: -1_000 }, { x: 11_000, y: 4_000 }, { x: 5_000, y: 4_000 }, { x: 5_000, y: 9_000 }, { x: -1_000, y: 9_000 }];
    expect(maisonDansParcelle({ ...t, contour: L }, E)).toBe(false);
  });

  it('orienter : une parcelle tournée de 10° redevient parallèle à la maison, et son nord tourne avec elle', () => {
    const { h } = maison(), t = plot(h.projet), E = empriseAuSol(h.projet);
    const a = 10 * Math.PI / 180, c = { x: 5_000, y: 4_000 };
    const tourne: Plot = { ...t, contour: t.contour.map(q => ({ x: c.x + (q.x - c.x) * Math.cos(a) - (q.y - c.y) * Math.sin(a), y: c.y + (q.x - c.x) * Math.sin(a) + (q.y - c.y) * Math.cos(a) })), north: a };
    const o = orienterParcelle(tourne, 0, E);
    expect(o.contour[1]!.y - o.contour[0]!.y).toBeCloseTo(0, 2);
    expect(o.nord).toBeCloseTo(0, 9);
  });
});

describe('parcelle : tracé et choix', () => {
  function banc() {
    const { h: h0, a, n } = maison(false);
    let h = h0, selection: string | null = null;
    const outils = new Outils(() => ({ projet: h.projet, niveau: n, selection }));
    const appliquer = (e: Effet) => { if (e.selection !== undefined) selection = e.selection; if (e.commandes) h = ok(executer(h, e.commandes.titre, e.commandes.liste, a)); return e };
    const g = (x: number, y: number) => ({ point: { x, y }, rayon: 150, alt: true });
    return { outils, get h() { return h }, clic: (x: number, y: number) => { appliquer(outils.bouger(g(x, y))); return appliquer(outils.appuyer(g(x, y))) }, appliquer };
  }

  it('L : quatre sommets cliqués puis retour au premier : la parcelle, sur le niveau le plus bas', () => {
    const b = banc();
    b.outils.choisir('parcelle');
    for (const [x, y] of [[-5_000, -3_000], [25_000, -3_000], [25_000, 17_000], [-5_000, 17_000]] as const) b.clic(x, y);
    expect(b.outils.parcelleEnCours.length).toBeGreaterThanOrEqual(4);
    const e = b.clic(-5_000, -3_000);
    expect(e.fini).toBe(true);
    expect(surfaceTerrain(plot(b.h.projet)) / 1e6).toBeCloseTo(600, 6);
    /* une seconde parcelle : refusée dès le premier clic */
    b.outils.choisir('parcelle');
    expect(b.clic(0, 0).aide).toMatch(/déjà une parcelle/);
  });

  it('longueurs tapées (relevé du géomètre) : 30, puis 20<90, puis 30<180, Entrée', () => {
    const b = banc();
    b.outils.choisir('parcelle');
    b.clic(-5_000, -3_000);
    b.appliquer(b.outils.saisir('30<0')); b.appliquer(b.outils.saisir('20<90')); b.appliquer(b.outils.saisir('30<180'));
    b.appliquer(b.outils.touche('Enter'));
    expect(plot(b.h.projet).contour).toEqual(R(-5_000, -3_000, 25_000, 17_000));
  });

  it('choisie en cliquant près de sa limite', () => {
    const { h } = maison(), f = h.projet.buildings[0]!.floors[0]!;
    const c = viser(f, { x: 10_000, y: -3_040 }, 150);
    expect(c?.genre === 'objet' && c.type).toBe('plot');
  });
});

describe('plan de masse : PDF et import', () => {
  it('planche « Plan de masse (PCMI 2) » : terrain, emprise, reculs mesurés', () => {
    const { h, n } = maison();
    const s = Array.from(planchesPdf(h.projet, { niveaux: [n], cotation: true, mobilier: true, indice: 'A', date: '03/10/2026', masse: true }), c => String.fromCharCode(c)).join('');
    expect(s).toContain('/Count 2');
    for (const t of ['(Plan de masse \\(PCMI 2\\))', '(TERRAIN)', '(RECULS \\(mesur\xE9s\\))', '(600,00 m\xB2)', '(83,64 m\xB2)', '(2,90 m)', '(rue des Essais)', '([NGF \xE0 compl\xE9ter])']) expect(s).toContain(t);
  });

  it('le terrain lu par l’atelier revient dans le repère du RDC (implantation inversée)', () => {
    const m = lireModeleAtelier(JSON.parse(fixture));
    m.terrain = { limites: [[0, 0], [30, 0], [30, 20], [0, 20], [0, 0]], alignement: [0], nom_voie: 'rue fictive', source: 'terrain_fictif.dxf', implantation: { angle: 90, dx: 12, dy: 4 } };
    const { commandes } = commandesImport(m, 'n', generateurSequentiel('m'));
    const c = commandes.find(x => x.type === 'creerParcelle');
    if (c?.type !== 'creerParcelle') throw new Error('pas de parcelle');
    /* RDC → terrain : tourner de 90° puis (12, 4) ; donc terrain (0, 0) → RDC R(−90°)·(−12, −4) = (−4, 12) m */
    expect(c.contour[0]!.x).toBeCloseTo(-4_000, 6); expect(c.contour[0]!.y).toBeCloseTo(12_000, 6);
    expect(c.contour).toHaveLength(4);
    expect([c.voies, c.nomVoie]).toEqual([[0], 'rue fictive']);
    /* sans implantation : la limite telle quelle, et un avertissement */
    m.terrain.implantation = null;
    const r = commandesImport(m, 'n', generateurSequentiel('m'));
    expect(r.rapport.avertissements.some(a => /pas implantée/.test(a))).toBe(true);
  });
});
