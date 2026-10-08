/* Le dossier de permis de construire en un PDF : page de garde et sommaire,
   PCMI 2, 3, 5 et plans des niveaux, pages numérotées ; ce que le Designer
   ne produit pas est « à joindre », ce qui n'est pas connu « à compléter ». */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { dossierPc, CABINET_PAR_DEFAUT } from '../../src/export/planche';
import { mentionCabinet } from '../../src/export/feuille';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, role: 'exterior' });
const R = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
/** un JPEG fictif de 8 × 8 pixels (deux bandes de couleur), pour la page de perspective */
export const JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDx74Tf8xX/ALZf+z0UUV8Pn/8AyMqvy/8ASUftPB//ACI8P/29/wClyP/Z'), c => c.charCodeAt(0));
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');
/** les textes d'un PDF, mis bout à bout (une phrase coupée en lignes se retrouve entière) */
const textes = (s: string) => [...s.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(m => m[1]!.replace(/\\(.)/g, '$1')).join(' ');

function maison(parcelle: boolean) {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p.buildings[0]!.floors[0]!.id;
  const c: Commande[] = [M(n, 0, 0, 10_000, 0), M(n, 10_000, 0, 10_000, 8_000), M(n, 10_000, 8_000, 0, 8_000), M(n, 0, 8_000, 0, 0),
    { type: 'creerToiture', niveau: n, genre: 'hip', pente: 35, debord: 500, couverture: 'tile' }];
  if (parcelle) c.push({ type: 'creerParcelle', niveau: n, contour: R(-5_000, -3_000, 25_000, 17_000), voies: [0], reference: 'AB 123' });
  return ok(executer(nouvelHistorique(p), 'Maison', c, a)).projet;
}

describe('dossier de permis de construire', () => {
  it('garde, PCMI 2, PCMI 3, PCMI 5 (façades et toiture), plan du RDC : sept pages numérotées (notice comprise), le sommaire renvoie aux bonnes pages', () => {
    const { octets, pieces } = dossierPc(maison(true), { indice: 'B', date: '04/10/2026', maitreOuvrage: 'M. et Mme Fictifs' });
    const s = texte(octets);
    expect(s).toContain('/Count 7');
    expect(pieces.filter(p => p.page !== null).map(p => [p.code, p.page])).toEqual([['PCMI 2', 2], ['PCMI 3', 3], ['PCMI 4', 4], ['PCMI 5', 5], ['—', 7]]);
    expect(pieces.find(p => p.code === 'PCMI 5')!.note).toBe('plan de toiture : page 6');
    for (const t of ['(PLAN DE TOITURE)', '(COUVERTURE)', '(Toiture \xE0 croupes, pente 35\xB0 \\(70 %\\) sur tous les pans)', '(35\xB0)', '(1 / 7)', '(Notice d\xE9crivant le terrain et pr\xE9sentant le projet)']) expect(s, t).toContain(t);
    expect(pieces.filter(p => p.page === null).map(p => p.code)).toEqual(['PCMI 1', 'PCMI 6', 'PCMI 7', 'PCMI 8']);
    for (const t of ['(PLAN DE PERMIS DE CONSTRUIRE)', '(PI\xC8CES DU DOSSIER)', '(M. et Mme Fictifs)', '(AB 123)', '(PLAN DE MASSE)', '(PCMI 2)', '(COUPE A\x96A)', '(PCMI 3)', '(FA\xC7ADES)', '(PCMI 5)', '(PLAN DU REZ-DE-CHAUSS\xC9E)', '(7 / 7)', '(page 2)', '([\xE0 compl\xE9ter])', '(76,44)'])
      expect(s).toContain(t);
  });

  it('sans parcelle : pas de plan de masse, la pièce PCMI 2 est signalée à tracer ; l’adresse reste à compléter', () => {
    const { octets, pieces } = dossierPc(maison(false), { indice: 'A', date: '04/10/2026' });
    const s = texte(octets);
    expect(s).toContain('/Count 6');
    const p2 = pieces.find(p => p.code === 'PCMI 2')!;
    expect([p2.page, p2.note]).toEqual([null, 'parcelle à tracer (outil L)']);
    expect(s).toContain('([parcelle \xE0 tracer])');
  });

  it('avec une vue 3D gardée : une page « Vue 3D » (image JPEG intégrée), renvoyée depuis le PCMI 6', () => {
    const { octets, pieces } = dossierPc(maison(true), { indice: 'A', date: '04/10/2026', perspective: { jpeg: JPEG, largeur: 8, hauteur: 8 } });
    const s = texte(octets);
    expect(s).toContain('/Count 8');
    expect(s).toContain('/Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode');
    expect(s).toContain('/XObject << /Im1 ');
    expect(s).toContain('(VUE 3D DU PROJET)');
    expect(pieces.find(p => p.code === 'PCMI 6')!.note).toBe('à joindre (photomontage) ; vue 3D du projet : page 7');
    expect(() => dossierPc(maison(true), { indice: 'A', date: '04/10/2026', perspective: { jpeg: new Uint8Array([1, 2, 3]), largeur: 1, hauteur: 1 } })).toThrow(/JPEG/);
  });

  it('avec la situation, l’insertion et les deux photographies : PCMI 1 à 8 dans l’ordre du formulaire, plus rien « à joindre »', () => {
    const img = (legende?: string) => ({ jpeg: JPEG, largeur: 8, hauteur: 8, ...(legende ? { legende } : {}) });
    const { octets, pieces } = dossierPc(maison(true), { indice: 'A', date: '05/10/2026',
      situation: img('Géoportail, 1/5 000'), insertion: img(), perspective: img(), photoProche: img('depuis la rue, vers le nord'), photoLointaine: img() });
    const s = texte(octets);
    /* garde, situation, masse, coupe, notice, façades, toiture, insertion, vue 3D, proche, lointaine, RDC */
    expect(s).toContain('/Count 12');
    expect(pieces.map(p => [p.code, p.page])).toEqual([['PCMI 1', 2], ['PCMI 2', 3], ['PCMI 3', 4], ['PCMI 4', 5], ['PCMI 5', 6], ['PCMI 6', 8], ['PCMI 7', 10], ['PCMI 8', 11], ['—', 12]]);
    expect(pieces.find(p => p.code === 'PCMI 6')!.note).toBe('photomontage composé dans le Designer ; vue 3D du projet : page 9');
    expect(s.match(/\/Subtype \/Image /g)).toHaveLength(5);
    for (const t of ['(PCMI 1 \x97 PLAN DE SITUATION DU TERRAIN)', '(G\xE9oportail, 1/5 000)', '(PCMI 6 \x97 INSERTION DU PROJET DANS SON ENVIRONNEMENT)', '(PCMI 7 \x97 PHOTOGRAPHIE DE L\x92ENVIRONNEMENT PROCHE)', '(PCMI 8 \x97 PHOTOGRAPHIE DE L\x92ENVIRONNEMENT LOINTAIN)',
      '(depuis la rue, vers le nord)', '(L\x92insertion dans le site \\(PCMI 6\\) est page 8.)'])
      expect(s).toContain(t);
    /* ce que l'utilisateur n'a pas dit (point de vue de l'insertion et de la photo lointaine) reste à compléter, en rouge */
    expect(s.match(/\[\xE0 compl\xE9ter\]/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it('les informations du dossier (commande modifierDossier) vont à la page de garde et à la colonne CP ; le cabinet et son logo signent chaque planche', () => {
    const p0 = maison(true), a = acteur();
    let h = ok(executer(nouvelHistorique(p0), 'Infos', [{ type: 'modifierDossier', champs: { maitreOuvrage: 'M. et Mme Fictifs', lieuConstruction: 'Lieu-dit Le Fictif\n00000 Villefictive',
      referencesCadastrales: 'ZZ 1 et 2', surfaceTerrain: 812, chauffage: 'Pompe à chaleur', zoneSismique: '2 (faible)', modifications: [{ date: '01/10/2026', objet: 'Permis de construire' }, { date: ' ', objet: ' ' }] } }], a));
    expect(h.projet.dossier).toEqual({ maitreOuvrage: 'M. et Mme Fictifs', lieuConstruction: 'Lieu-dit Le Fictif\n00000 Villefictive', referencesCadastrales: 'ZZ 1 et 2', surfaceTerrain: 812,
      chauffage: 'Pompe à chaleur', zoneSismique: '2 (faible)', modifications: [{ date: '01/10/2026', objet: 'Permis de construire' }] });
    /* refusés : un champ inconnu, une surface absurde, un texte trop long ; rien n'est écrit */
    for (const champs of [{ inconnu: 'x' }, { surfaceTerrain: -3 }, { divers: 'x'.repeat(501) }] as never[])
      expect(executer(h, 'Refus', [{ type: 'modifierDossier', champs }], a).ok).toBe(false);
    const { octets } = dossierPc(h.projet, { indice: 'B', date: '04/10/2026', cabinet: { societe: 'Cabinet Fictif', dessinateur: 'C. Fictif', siren: '000 000 000' }, logo: { jpeg: JPEG, largeur: 8, hauteur: 8 } });
    const s = texte(octets);
    for (const t of ['(Lieu-dit Le Fictif)', '(00000 Villefictive)', '(ZZ 1 et 2)', '(812 m\xB2)', '(Pompe \xE0 chaleur)', '(2 \\(faible\\))', '(01/10/2026)', '(PERMIS DE CONSTRUIRE)',
      '(Soci\xE9t\xE9 CABINET FICTIF)', '(SIREN : 000 000 000)', '(C. Fictif)', '(Dessin\xE9 par :)'])
      expect(s, t).toContain(t);
    /* le logo : une seule image dans le document, posée sur chaque page (garde et planches) */
    expect(s.match(/\/Subtype \/Image /g)).toHaveLength(1);
    expect(s.match(/\/Im1 Do/g)!.length).toBeGreaterThanOrEqual(7);
    /* la mention de propriété, au nom de la société, sans texte de loi non vérifié */
    const garde = textes(texte(dossierPc(h.projet, { indice: 'B', date: '04/10/2026', cabinet: { ...CABINET_PAR_DEFAUT, societe: 'Cabinet Fictif' } }).octets));
    expect(garde).toContain('propri\xE9t\xE9 exclusive de la soci\xE9t\xE9 Cabinet Fictif. Il est interdit');
    expect(garde).not.toMatch(/1992|\{soci/);
    expect(mentionCabinet({ societe: 'Fictif', mention: 'Plans de la société {Société} .' })).toBe('Plans de la société Fictif.');
    /* effacer un champ (chaîne vide) ; annuler rend les informations d'avant */
    h = ok(executer(h, 'Effacer', [{ type: 'modifierDossier', champs: { chauffage: '', surfaceTerrain: null } }], a));
    expect(h.projet.dossier?.chauffage).toBeUndefined();
    expect(h.projet.dossier?.surfaceTerrain).toBeUndefined();
    expect(h.projet.dossier?.maitreOuvrage).toBe('M. et Mme Fictifs');
  });
});
