/* Le fond cadastral du plan de masse : la projection Lambert 93, la lecture
   d'un GeoJSON du cadastre (fictif), le calage sur la limite de propriété
   (rotation retrouvée, écart dit), la commande (validée, retirée, déplacée
   avec la parcelle), la planche PCMI 2 (parcelles voisines, bâti,
   légende, note « non garanties ») et le plan cadastral du PCMI 1. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Plot, type Point, type Project } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { fondCadastral, lireCadastreGeoJSON, parcelleDuProjet, parcellesDeReference, referenceParcelle, versLambert93 } from '../../src/building';
import { planchesPdf, dossierPc } from '../../src/export/planche';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, role: 'exterior' });
const plot = (p: Project): Plot => parcelleDuProjet(p)!.plot;
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');

/** la limite tracée dans le Designer (mm) : un pentagone, sans symétrie qui tromperait le calage */
const LIMITE: Point[] = [{ x: -5_000, y: -3_000 }, { x: 25_000, y: -3_000 }, { x: 25_000, y: 17_000 }, { x: 8_000, y: 22_000 }, { x: -5_000, y: 17_000 }];
const THETA = 0.5236;                  // le plan est tourné de 30° par rapport au nord du cadastre
const ORIGINE = { x: 500_000, y: 6_600_000 };

/** du plan (mm) au Lambert 93 fictif (m) : l'inverse du calage attendu */
const versL93 = (p: Point): [number, number] => {
  const x = p.x / 1000, y = p.y / 1000, c = Math.cos(-THETA), s = Math.sin(-THETA);
  return [ORIGINE.x + x * c - y * s, ORIGINE.y + x * s + y * c];
};
const polygone = (P: Point[]) => ({ type: 'Polygon', coordinates: [[...P, P[0]!].map(versL93)] });
const R = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

/** le cadastre fictif d'une commune : le terrain (ZZ 12), une voisine bâtie (ZZ 13), une parcelle lointaine (ZZ 99) */
const PARCELLES = { type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { section: '0ZZ', numero: '0012' }, geometry: polygone(LIMITE) },
  { type: 'Feature', properties: { section: '0ZZ', numero: '0013' }, geometry: { type: 'MultiPolygon', coordinates: [polygone(R(25_000, -3_000, 45_000, 17_000)).coordinates] } },
  { type: 'Feature', properties: { section: '0ZZ', numero: '0099' }, geometry: polygone(R(900_000, 0, 920_000, 20_000)) },
] };
const BATIMENTS = { type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { type: '01' }, geometry: polygone(R(30_000, 0, 40_000, 9_000)) },
] };

function lu() {
  const P = lireCadastreGeoJSON(PARCELLES, 'parcelles'), B = lireCadastreGeoJSON(BATIMENTS, 'batiments');
  return { parcelles: P.parcelles, batiments: B.batiments, lambert: true };
}

function maison(): { h: Historique; a: Acteur; n: string } {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p.buildings[0]!.floors[0]!.id;
  const c: Commande[] = [M(n, 0, 0, 10_000, 0), M(n, 10_000, 0, 10_000, 8_000), M(n, 10_000, 8_000, 0, 8_000), M(n, 0, 8_000, 0, 0),
    { type: 'creerParcelle', niveau: n, contour: LIMITE, voies: [0], nomVoie: 'rue des Essais' }];
  const h = ok(executer(nouvelHistorique(p), 'Maison', c, a));
  return { h: ok(executer(h, 'Référence', [{ type: 'modifierParcelle', id: plot(h.projet).id, reference: 'ZZ n° 12' }], a)), a, n };
}

describe('fond cadastral : projection et lecture', () => {
  it('Lambert 93 : l’origine de la projection, et des distances justes à quelques millièmes près', () => {
    const o = versLambert93(3, 46.5);
    expect(o.x).toBeCloseTo(700_000, 3);
    expect(o.y).toBeCloseTo(6_600_000, 3);
    /* un centième de degré de latitude vers 46,5° : 1 111,6 m sur l'ellipsoïde ; le facteur d'échelle y est de 0,9995 environ */
    const a = versLambert93(3, 46.5), b = versLambert93(3, 46.51);
    expect(Math.hypot(b.x - a.x, b.y - a.y) / 1111.6).toBeGreaterThan(0.998);
    expect(Math.hypot(b.x - a.x, b.y - a.y) / 1111.6).toBeLessThan(1.001);
  });

  it('lit parcelles et bâtiments (Polygon, MultiPolygon), en degrés comme en Lambert 93 ; refuse ce qui n’en est pas', () => {
    const L = lu();
    expect(L.parcelles.map(p => p.reference)).toEqual(['ZZ n° 12', 'ZZ n° 13', 'ZZ n° 99']);
    expect(L.parcelles[0]!.anneaux[0]!.length).toBe(5);               // l'anneau GeoJSON fermé, refermé une seule fois
    expect(L.batiments.length).toBe(1);
    expect(referenceParcelle('0AB', '0007')).toBe('AB n° 7');
    /* en degrés : projeté */
    const D = lireCadastreGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { section: 'A', numero: '1' }, geometry: { type: 'Polygon', coordinates: [[[3, 46.5], [3.001, 46.5], [3.001, 46.501], [3, 46.5]]] } }] });
    expect(D.parcelles[0]!.anneaux[0]![0]!.x).toBeCloseTo(700_000, 3);
    expect(() => lireCadastreGeoJSON({ type: 'Point' })).toThrow();
    expect(() => lireCadastreGeoJSON({ type: 'FeatureCollection', features: [] })).toThrow();
    /* la référence de la parcelle, écrite à la main */
    expect(parcellesDeReference('ZZ n°12 et 13', L.parcelles).map(p => p.numero)).toEqual(['0012', '0013']);
    expect(parcellesDeReference('zz 0012', L.parcelles).length).toBe(1);
    expect(parcellesDeReference('AB 12', L.parcelles).length).toBe(0);
  });
});

describe('fond cadastral : calage', () => {
  it('retrouve la rotation (le nord du plan), pose la voisine et son bâti, écarte le lointain', () => {
    const L = lu();
    const f = fondCadastral(LIMITE, L, parcellesDeReference('ZZ 12', L.parcelles), 'cadastre fictif', '07/10/2026');
    expect(f.rotation).toBeCloseTo(THETA, 3);
    expect(f.cadastre.ecart!).toBeLessThan(20);
    expect(f.cadastre.parcelles.map(p => [p.reference, p.terrain])).toEqual([['ZZ n° 12', true], ['ZZ n° 13', false]]);
    const v = f.cadastre.parcelles[1]!.contour;
    expect(v.some(q => Math.hypot(q.x - 45_000, q.y - 17_000) < 30)).toBe(true);
    expect(f.cadastre.batiments[0]!.some(q => Math.hypot(q.x - 30_000, q.y) < 30)).toBe(true);
    expect(() => fondCadastral(LIMITE, L, [], 's', 'd')).toThrow(/référence/);
  });
});

describe('fond cadastral : commande et planche', () => {
  it('se pose (avec le nord), se refuse s’il est mal formé, suit la parcelle déplacée, se retire ; annulable', () => {
    const { h, a } = maison(), id = plot(h.projet).id, L = lu();
    const f = fondCadastral(LIMITE, L, parcellesDeReference('ZZ 12', L.parcelles), 'cadastre fictif', '07/10/2026');
    const h1 = ok(executer(h, 'Fond', [{ type: 'modifierParcelle', id, cadastre: f.cadastre, nord: f.rotation }], a));
    expect(plot(h1.projet).cadastre?.parcelles.length).toBe(2);
    expect(plot(h1.projet).north).toBeCloseTo(THETA, 3);
    expect(executer(h1, 'x', [{ type: 'modifierParcelle', id, cadastre: { parcelles: [{ reference: 'X', contour: [] }], batiments: [], source: 's', date: 'd' } }], a).ok).toBe(false);
    /* la parcelle déplacée de 2 m vers l'est : le fond la suit */
    const h2 = ok(executer(h1, 'Déplacer', [{ type: 'modifierParcelle', id, contour: LIMITE.map(q => ({ x: q.x + 2_000, y: q.y })) }], a));
    const avant = plot(h1.projet).cadastre!.batiments[0]![0]!, apres = plot(h2.projet).cadastre!.batiments[0]![0]!;
    expect(apres.x - avant.x).toBeCloseTo(2_000, 0);
    expect(apres.y - avant.y).toBeCloseTo(0, 0);
    const h3 = ok(executer(h2, 'Retirer', [{ type: 'modifierParcelle', id, cadastre: null }], a));
    expect(plot(h3.projet).cadastre).toBeUndefined();
    expect(plot(annuler(h3).projet).cadastre).toBeDefined();
  });

  it('au plan de masse : la référence des voisines, le bâti existant, la légende et la note du fond', () => {
    const { h, a, n } = maison(), id = plot(h.projet).id, L = lu();
    const sans = texte(planchesPdf(h.projet, { niveaux: [n], cotation: true, mobilier: false, indice: 'A', date: '07/10/2026', masse: true }));
    expect(sans).toContain('fond cadastral [\xE0 pr\xE9ciser]');
    const f = fondCadastral(LIMITE, L, parcellesDeReference('ZZ 12', L.parcelles), 'cadastre fictif', '07/10/2026');
    const h1 = ok(executer(h, 'Fond', [{ type: 'modifierParcelle', id, cadastre: f.cadastre }], a));
    const s = texte(planchesPdf(h1.projet, { niveaux: [n], cotation: true, mobilier: false, indice: 'A', date: '07/10/2026', masse: true }));
    for (const t of ['(ZZ n\xB0 13)', '(Limite cadastrale \\(non garantie\\))', '(B\xE2ti existant \\(cadastre\\))', 'plan cadastral \\(cadastre fictif, 07/10/2026\\)', 'non garanties'])
      expect(s, t).toContain(t);
  });
});

describe('PCMI 1 : plan de situation', () => {
  /* un JPEG fictif de 8 × 8 px (un aplat gris) */
  const JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAAIAAgBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z'), c => c.charCodeAt(0));
  const img = (legende: string) => ({ jpeg: JPEG, largeur: 8, hauteur: 8, legende });
  const avecFond = () => {
    const { h, a } = maison(), id = plot(h.projet).id, L = lu();
    const f = fondCadastral(LIMITE, L, parcellesDeReference('ZZ 12', L.parcelles), 'cadastre fictif', '07/10/2026');
    return ok(executer(h, 'Fond', [{ type: 'modifierParcelle', id, cadastre: f.cadastre, nord: f.rotation }], a)).projet;
  };

  it('avec le cadastre importé : le plan cadastral du terrain (numéros, source, réserve), les extraits fournis à gauche', () => {
    const p = avecFond();
    const { octets, pieces } = dossierPc(p, { indice: 'A', date: '09/10/2026', situation: img('Géoportail, 1/5 000'), situationAerienne: img('Géoportail, photographies aériennes') });
    const s = texte(octets);
    for (const t of ['(PLAN CADASTRAL)', '(12)', '(13)', '(VUE A\xC9RIENNE)', '(G\xE9oportail, 1/5 000)', '(G\xE9oportail, photographies a\xE9riennes)', 'cadastre fictif, du 07/10/2026', 'licence ouverte Etalab', 'non garanties'])
      expect(s, t).toContain(t);
    expect(pieces.find(x => x.code === 'PCMI 1')).toMatchObject({ page: 2, note: 'extrait de carte fourni et plan cadastral (cadastre importé) : à vérifier' });
  });

  it('le cadastre seul : la page se compose, l’extrait de carte y est réclamé ; rien du tout : pas de page', () => {
    const { pieces, octets } = dossierPc(avecFond(), { indice: 'A', date: '09/10/2026' });
    expect(pieces.find(x => x.code === 'PCMI 1')).toMatchObject({ page: 2, note: 'plan cadastral du cadastre importé ; extrait de carte (1/5 000 à 1/25 000) à joindre' });
    expect(texte(octets)).toContain('(EXTRAIT DE CARTE \xC0 JOINDRE)');
    const vide = dossierPc(maison().h.projet, { indice: 'A', date: '09/10/2026' }).pieces.find(x => x.code === 'PCMI 1');
    expect(vide).toMatchObject({ page: null, note: 'à joindre (extrait de carte, échelle et nord)' });
    /* l'extrait seul, sans cadastre : la page d'image d'avant */
    const seul = dossierPc(maison().h.projet, { indice: 'A', date: '09/10/2026', situation: img('Géoportail, 1/5 000') });
    expect(seul.pieces.find(x => x.code === 'PCMI 1')).toMatchObject({ page: 2, note: 'extrait de carte fourni : échelle et nord à vérifier' });
    expect(texte(seul.octets)).not.toContain('(PLAN CADASTRAL)');
  });
});
