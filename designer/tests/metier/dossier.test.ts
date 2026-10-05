/* Le dossier de permis de construire en un PDF : page de garde et sommaire,
   PCMI 2, 3, 5 et plans des niveaux, pages numérotées ; ce que le Designer
   ne produit pas est « à joindre », ce qui n'est pas connu « à compléter ». */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { dossierPc } from '../../src/export/planche';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, role: 'exterior' });
const R = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
/** un JPEG fictif de 8 × 8 pixels (deux bandes de couleur), pour la page de perspective */
export const JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDx74Tf8xX/ALZf+z0UUV8Pn/8AyMqvy/8ASUftPB//ACI8P/29/wClyP/Z'), c => c.charCodeAt(0));
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');

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
    for (const t of ['(PCMI 5 \x97 Plan de toiture)', '(TOITURE)', '(\xE0 croupes)', '(35\xB0 \\(70 %\\))', '(35\xB0 \xB7 70 %)', '(1 / 7)', '(PCMI 4 \x97 Notice \\(brouillon\\))']) expect(s).toContain(t);
    expect(pieces.filter(p => p.page === null).map(p => p.code)).toEqual(['PCMI 1', 'PCMI 6', 'PCMI 7', 'PCMI 8']);
    for (const t of ['(DEMANDE DE PERMIS DE CONSTRUIRE)', '(PI\xC8CES DU DOSSIER)', '(M. et Mme Fictifs)', '(AB 123)', '(PCMI 2 \x97 Plan de masse)', '(PCMI 3 \x97 Coupe A-A)', '(PCMI 5 \x97 Fa\xE7ades)', '(Plan : RDC)', '(7 / 7)', '(page 2)', '([\xE0 compl\xE9ter])', '(76,44 m\xB2)'])
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
    expect(s).toContain('(Vue 3D \\(compl\xE9ment au PCMI 6\\))');
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
    for (const t of ['(PCMI 1 \x97 Plan de situation)', '(G\xE9oportail, 1/5 000)', '(PCMI 6 \x97 Insertion)', '(PCMI 7 \x97 Environnement proche)', '(PCMI 8 \x97 Environnement lointain)',
      '(depuis la rue, vers le nord)', '(L\x92insertion dans le site \\(PCMI 6\\) est page 8.)'])
      expect(s).toContain(t);
    /* ce que l'utilisateur n'a pas dit (point de vue de l'insertion et de la photo lointaine) reste à compléter, en rouge */
    expect(s.match(/\[\xE0 compl\xE9ter\]/g)!.length).toBeGreaterThanOrEqual(2);
  });
});
