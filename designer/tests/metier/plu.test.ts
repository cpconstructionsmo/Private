/* Les règles du PLU : saisies sur la parcelle, confrontées aux mesures du
   projet (emprise, pleine terre, surfaces non imperméabilisées, biotope,
   stationnement, reculs) ; ce qui manque reste « à vérifier », rien n'est
   inventé. Le plan de masse les met en regard, en rouge si elles ne sont
   pas tenues. Maison et parcelle fictives. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Project, type ReglesPlu } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { controlePlu, parcelleDuProjet, surfacesDuTerrain } from '../../src/building';
import { planchesPdf } from '../../src/export/planche';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, role: 'exterior' });
const R = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');
/** les textes d'un PDF, mis bout à bout (une phrase coupée en lignes se retrouve entière) */
const textes = (s: string) => [...s.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(m => m[1]!.replace(/\\(.)/g, '$1')).join(' ');

/** 10 × 8 m (maçonnerie 10,2 × 8,2 m) sur 30 × 20 m (600 m²) ; une allée en gravillons de 20 m², un stationnement en enrobé de 25 m² */
function maison(): { h: Historique; a: Acteur; n: string; id: string } {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p.buildings[0]!.floors[0]!.id;
  const h = ok(executer(nouvelHistorique(p), 'Maison', [M(n, 0, 0, 10_000, 0), M(n, 10_000, 0, 10_000, 8_000), M(n, 10_000, 8_000, 0, 8_000), M(n, 0, 8_000, 0, 0),
    { type: 'creerParcelle', niveau: n, contour: R(-5_000, -3_000, 25_000, 17_000), voies: [0], nomVoie: 'rue des Essais' },
    { type: 'creerAmenagement', niveau: n, genre: 'path', points: R(12_000, -3_000, 14_000, 7_000), finition: 'allee-gravillons', hauteur: 0 },
    { type: 'creerAmenagement', niveau: n, genre: 'parking', points: R(15_000, -3_000, 20_000, 2_000), finition: 'stationnement-enrobe', hauteur: 0 }], a));
  return { h, a, n, id: parcelleDuProjet(h.projet)!.plot.id };
}
const regles = (h: Historique, plu: ReglesPlu, a: Acteur, id: string) => ok(executer(h, 'PLU', [{ type: 'modifierParcelle', id, plu }], a)).projet;
const etat = (p: Project, cle: keyof ReglesPlu) => controlePlu(p)!.regles.find(r => r.cle === cle);

describe('règles du PLU', () => {
  it('les surfaces du terrain : pleine terre, revêtements perméables et imperméables', () => {
    const { h } = maison();
    const S = surfacesDuTerrain(h.projet)!;
    expect(S.terrain / 1e6).toBeCloseTo(600, 3);
    expect(S.emprise / 1e6).toBeCloseTo(83.64, 2);
    expect(S.permeables / 1e6).toBeCloseTo(20, 3);
    expect(S.pleineTerre / 1e6).toBeCloseTo(600 - 83.64 - 45, 2);
    expect(S.nonImpermeabilisees / 1e6).toBeCloseTo(600 - 83.64 - 25, 2);
  });

  it('chaque règle saisie, confrontée au projet ; ce qui manque reste à vérifier ; rien de saisi, rien de contrôlé', () => {
    const { h, a, id } = maison();
    expect(controlePlu(h.projet)!.regles).toEqual([]);
    const p = regles(h, { zone: 'UGc', empriseMax: 10, pleineTerreMin: 50, permeableMin: 30, biotopeMin: 0.3, stationnementMin: 2, reculVoieMin: 5_000, reculLimitesMin: 3_000 }, a, id);
    expect(etat(p, 'empriseMax')).toMatchObject({ valeur: '14 %', limite: 'max. 10 %', etat: 'non_conforme' });
    expect(etat(p, 'pleineTerreMin')!.etat).toBe('conforme');
    expect(etat(p, 'permeableMin')!.etat).toBe('conforme');
    expect(etat(p, 'biotopeMin')).toMatchObject({ etat: 'a_verifier', valeur: '[coefficients à préciser]' });
    expect(etat(p, 'stationnementMin')!.etat).toBe('a_verifier');
    /* la maison est à 2,90 m de la voie (côté 1) et à 4,90 m au plus près des autres limites */
    expect(etat(p, 'reculVoieMin')).toMatchObject({ valeur: '2,90 m', etat: 'non_conforme' });
    expect(etat(p, 'reculLimitesMin')).toMatchObject({ valeur: '4,90 m', etat: 'conforme' });
    /* le coefficient des revêtements perméables et les places prévues : la règle se tranche */
    const q = regles(h, { biotopeMin: 0.3, biotopePermeable: 0.5, stationnementMin: 2, stationnementPrevu: 2 }, a, id);
    expect(etat(q, 'biotopeMin')).toMatchObject({ valeur: ((600 - 83.64 - 45 + 10) / 600).toFixed(2).replace('.', ','), etat: 'conforme' });
    expect(etat(q, 'stationnementMin')!.etat).toBe('conforme');
  });

  it('la commande refuse ce qui ne se lit pas (pourcentage, coefficient), null retire les règles', () => {
    const { h, a, id } = maison();
    expect(executer(h, 'x', [{ type: 'modifierParcelle', id, plu: { empriseMax: 140 } }], a).ok).toBe(false);
    expect(executer(h, 'x', [{ type: 'modifierParcelle', id, plu: { biotopeMin: 3 } }], a).ok).toBe(false);
    const p = regles(h, { zone: ' UGc ', empriseMax: 35 }, a, id);
    expect(parcelleDuProjet(p)!.plot.plu).toEqual({ zone: 'UGc', empriseMax: 35 });
    const h2 = ok(executer(nouvelHistorique(p), 'x', [{ type: 'modifierParcelle', id, plu: null }], a));
    expect(parcelleDuProjet(h2.projet)!.plot.plu).toBeUndefined();
  });

  it('au plan de masse : la zone, « 14 % (max. 10 %) », ce qui n’est pas tenu ; sans règles, la note le demande', () => {
    const { h, a, n, id } = maison();
    const o = { niveaux: [n], cotation: true, mobilier: false, indice: 'A', date: '07/10/2026', masse: true };
    expect(textes(texte(planchesPdf(h.projet, o)))).toContain('saisir dans le panneau de la parcelle');
    const s = texte(planchesPdf(regles(h, { zone: 'UGc', source: 'PLU fictif', empriseMax: 10, reculVoieMin: 5_000 }, a, id), o));
    for (const t of ['(SURFACES ET R\xC8GLES \\(zone UGc\\))', '(14 % \\(max. 10 %\\))', '(Recul sur voie \\(le plus petit\\))', 'Non tenu : emprise au sol 14 % \\(max. 10 %\\)', 'R\xE8gles : PLU fictif'])
      expect(s, t).toContain(t);
  });
});
