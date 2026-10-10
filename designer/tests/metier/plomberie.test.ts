/* Le plan du plombier (building/plomberie.ts) : les attentes sanitaires se
   déduisent des appareils posés au plan — WC, douche, lavabo, évier,
   lave-linge — au dos de chacun, avec ses réseaux et son évacuation ; un
   sèche-linge ou un canapé n'en ont pas. Maison fictive de 10 × 8 m. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { attentesSanitaires } from '../../src/building';
import { modeleMeuble } from '../../src/catalogue/mobilier';
import { planchesPdf } from '../../src/export/planche';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 10) + (t += 1000)).toISOString(), id: generateurSequentiel('s') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');
const textes = (s: string) => [...s.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(m => m[1]!.replace(/\\(.)/g, '$1')).join(' ');

function maison() {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') }), n = p.buildings[0]!.floors[0]!.id;
  const M = (x1: number, y1: number, x2: number, y2: number, role: 'exterior' | 'partition' = 'exterior'): Commande =>
    ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: role === 'exterior' ? 200 : 70, hauteur: 2_500, role });
  const meuble = (id: string, x: number, y: number, rotation = 0): Commande => {
    const m = modeleMeuble(id)!;
    return { type: 'creerMeuble', niveau: n, modele: { id: m.id, label: m.libelle }, position: { x, y }, rotation, largeur: m.largeur, profondeur: m.profondeur, hauteur: m.hauteur };
  };
  const h = ok(executer(nouvelHistorique(p), 'Maison', [
    M(0, 0, 10_000, 0), M(10_000, 0, 10_000, 8_000), M(10_000, 8_000, 0, 8_000), M(0, 8_000, 0, 0), M(6_000, 0, 6_000, 8_000, 'partition'),
    { type: 'creerPiece', niveau: n, point: { x: 3_000, y: 4_000 }, nom: 'Séjour - cuisine', usage: 'living' },
    { type: 'creerPiece', niveau: n, point: { x: 8_000, y: 4_000 }, nom: 'Salle d’eau', usage: 'bathroom' },
    /* contre le mur du haut (dos vers +y : tournés d'un demi-tour) : la douche et le lavabo */
    meuble('douche-90', 7_000, 7_450, Math.PI), meuble('lavabo', 8_500, 7_675, Math.PI),
    /* contre le mur de droite (dos vers +x : un quart de tour) : le WC */
    meuble('wc', 9_575, 2_000, Math.PI / 2),
    /* à la cuisine, contre le mur du bas (dos vers −y) : l'évier, le lave-linge, le sèche-linge ; et un canapé */
    meuble('evier', 2_000, 400), meuble('lave-linge', 3_500, 400), meuble('seche-linge', 4_200, 400), meuble('canape-3p', 3_000, 4_000),
  ], a));
  return h.projet;
}

describe('attentes sanitaires (plan du plombier)', () => {
  const p = maison(), f = p.buildings[0]!.floors[0]!;

  it('une attente par appareil sanitaire, au dos de l’appareil, avec ses réseaux et son évacuation', () => {
    const A = attentesSanitaires(f);
    expect(A.map(a => [a.repere, a.appareil, a.piece, a.reseaux.join('+'), a.evacuation])).toEqual([
      ['S1', 'Douche 90 × 90', 'Salle d’eau', 'EF+EC+EU', 'Ø 40'],
      ['S2', 'Lavabo 60', 'Salle d’eau', 'EF+EC+EU', 'Ø 32 à 40'],
      ['S3', 'WC à poser', 'Salle d’eau', 'EF+EV', 'Ø 100'],
      ['S4', 'Évier 2 bacs 120', 'Séjour - cuisine', 'EF+EC+EU', 'Ø 40'],
      ['S5', 'Lave-linge', 'Séjour - cuisine', 'EF+EU', 'Ø 40'],
    ]);
    const pt = (r: string) => { const q = A.find(a => a.repere === r)!.point; return [Math.round(q.x), Math.round(q.y)] };
    /* le dos : la douche (90 cm de profondeur) contre le nu du mur haut (7,90 m), le WC contre le nu du mur droit (9,90 m) */
    expect(pt('S1')).toEqual([7_000, 7_900]);
    expect(pt('S3')).toEqual([9_900, 2_000]);
    expect(pt('S4')).toEqual([2_000, 100]);
  });

  it('la planche : le plan des appareils seuls, leurs repères, le tableau et la légende des réseaux', () => {
    const pdf = planchesPdf(p, { niveaux: [f.id], cotation: true, mobilier: false, indice: 'A', date: '10/10/2026', attentes: true }), T = textes(texte(pdf));
    for (const t of ['PLAN DES ATTENTES SANITAIRES \x96 REZ-DE-CHAUSS\xC9E', 'ATTENTES SANITAIRES \x96 REZ-DE-CHAUSS\xC9E', 'S1', 'S5', 'EF + EC + EU', 'EF + EV', '\xD8 100',
      'Douche 90 \xD7 90 (Salle d\x92eau)', 'EF : Eau froide', 'EC : Eau chaude', 'EU : Eaux us\xE9es (\xE9vacuation)', 'EV : Eaux vannes (WC)'])
      expect(T, t).toContain(t);
    expect(T).toContain('\xE0 confirmer par le plombier');
  });
});
