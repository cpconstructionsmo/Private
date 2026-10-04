/* L'export DXF (R12, mm) : un calque par famille, les murs ouverts au droit
   des baies, les repères des baies, les pièces, les cotes ; Windows-1252. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Project } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { mursDroits } from '../../src/building';
import { dxfNiveau, dxfOctets, CALQUES } from '../../src/export/dxf';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number, role: 'exterior' | 'partition' = 'exterior'): Commande =>
  ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: role === 'exterior' ? 200 : 70, role });

export function maison(): Project {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p.buildings[0]!.floors[0]!.id;
  let h = ok(executer(nouvelHistorique(p), 'Murs', [M(n, 0, 0, 10_000, 0), M(n, 10_000, 0, 10_000, 8_000), M(n, 10_000, 8_000, 0, 8_000), M(n, 0, 8_000, 0, 0), M(n, 4_000, 0, 4_000, 8_000, 'partition'),
    { type: 'creerPiece', niveau: n, point: { x: 2_000, y: 4_000 }, nom: 'Chambre', usage: 'bedroom' }, { type: 'creerPiece', niveau: n, point: { x: 7_000, y: 4_000 }, nom: 'Séjour', usage: 'living' }], a));
  const W = mursDroits(h.projet.buildings[0]!.floors[0]!);
  const sud = W.find(w => w.axis.a.y === 0 && w.axis.b.y === 0)!, cl = W.find(w => w.role === 'partition')!;
  h = ok(executer(h, 'Baies', [{ type: 'creerOuverture', mur: sud.id, position: 7_000, largeur: 1_200, hauteur: 1_250, allege: 900, genre: 'window' },
    { type: 'creerOuverture', mur: cl.id, position: 4_000, largeur: 900, hauteur: 2_150, allege: 0, genre: 'door' }], a));
  return h.projet;
}

/** le DXF lu en paires (code, valeur), et ses entités avec leur calque */
function lire(t: string) {
  const L = t.split('\r\n'); if (L[L.length - 1] === '') L.pop();
  const P: [number, string][] = [];
  for (let i = 0; i < L.length; i += 2) P.push([Number(L[i]), L[i + 1]!]);
  const E: { type: string; calque: string; textes: string[] }[] = [];
  let dans = false;
  for (const [c, v] of P) {
    if (c === 2 && v === 'ENTITIES') dans = true;
    if (!dans) continue;
    if (c === 0) E.push({ type: v, calque: '', textes: [] });
    else if (c === 8 && E.length) E[E.length - 1]!.calque = v;
    else if (c === 1 && E.length) E[E.length - 1]!.textes.push(v);
  }
  return { L, P, E };
}

describe('export DXF', () => {
  it('R12 bien formé : paires code/valeur, en-tête, calques, fin de fichier', () => {
    const p = maison(), t = dxfNiveau(p, p.buildings[0]!.floors[0]!), { L, P } = lire(t);
    expect(L.length % 2).toBe(0);
    expect(P.every(([c]) => Number.isInteger(c))).toBe(true);
    expect(t).toContain('$ACADVER\r\n  1'.replace('  ', '')); expect(t).toContain('AC1009');
    for (const c of Object.keys(CALQUES)) expect(P.some(([k, v]) => k === 2 && v === c)).toBe(true);
    expect(P[P.length - 1]).toEqual([0, 'EOF']);
  });

  it('murs ouverts au droit des baies : le mur sud en deux morceaux, la cloison aussi ; baies, pièces et cotes', () => {
    const p = maison(), { E } = lire(dxfNiveau(p, p.buildings[0]!.floors[0]!));
    const poly = (c: string) => E.filter(e => e.type === 'POLYLINE' && e.calque === c).length;
    expect(poly('MURS')).toBe(5);                 // 4 murs, le sud coupé en deux par la fenêtre
    expect(poly('CLOISONS')).toBe(2);             // la cloison coupée par la porte
    expect(poly('OUVERTURES')).toBe(2);
    const textes = E.filter(e => e.type === 'TEXT').flatMap(e => e.textes);
    for (const t of ['F 120×125 all. 90', 'P 90×215', 'Chambre', 'Séjour', '10,20']) expect(textes).toContain(t);
    expect(E.filter(e => e.type === 'VERTEX').every(e => e.calque !== '')).toBe(true);
  });

  it('octets en Windows-1252 : « é » sur un octet, « × » aussi, « € » à 0x80', () => {
    const o = dxfOctets('Séjour × €');
    expect(Array.from(o)).toEqual([0x53, 0xE9, 0x6A, 0x6F, 0x75, 0x72, 0x20, 0xD7, 0x20, 0x80]);
  });
});
