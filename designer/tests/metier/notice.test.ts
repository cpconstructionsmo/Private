/* Le brouillon de notice (PCMI 4) : écrit à partir de ce qui est mesuré ou
   choisi dans le projet ; le reste est « [à compléter] ». */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { mursDroits } from '../../src/building';
import { notice } from '../../src/export/notice';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, role: 'exterior' });
const R = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

describe('notice (brouillon PCMI 4)', () => {
  it('écrit les mesures et les choix du projet, et laisse « [à compléter] » ce qu’il ne sait pas', () => {
    const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
    const n = p.buildings[0]!.floors[0]!.id;
    let h = ok(executer(nouvelHistorique(p), 'Maison', [M(n, 0, 0, 10_000, 0), M(n, 10_000, 0, 10_000, 8_000), M(n, 10_000, 8_000, 0, 8_000), M(n, 0, 8_000, 0, 0),
      { type: 'creerToiture', niveau: n, genre: 'hip', pente: 35, debord: 500, couverture: 'tile' },
      { type: 'creerParcelle', niveau: n, contour: R(-5_000, -3_000, 25_000, 17_000), voies: [0], nomVoie: 'la rue des Essais', reference: 'AB 123' },
      { type: 'creerAmenagement', niveau: n, genre: 'green', points: R(12_000, 0, 24_000, 16_000), finition: 'pelouse', hauteur: 0 },
      { type: 'creerAmenagement', niveau: n, genre: 'fence', points: [{ x: 25_000, y: -3_000 }, { x: 25_000, y: 17_000 }], finition: 'grillage-rigide-vert', hauteur: 1_500 }], a));
    const W = mursDroits(h.projet.buildings[0]!.floors[0]!);
    h = ok(executer(h, 'x', [...W.map(w => ({ type: 'modifierMur', id: w.id, finition: 'enduit-ton-pierre' }) as Commande),
      { type: 'creerOuverture', mur: W[0]!.id, position: 3_000, largeur: 1_200, hauteur: 1_250, allege: 900, genre: 'window' },
      { type: 'creerOuverture', mur: W[0]!.id, position: 6_000, largeur: 1_200, hauteur: 1_250, allege: 900, genre: 'window' },
      { type: 'creerOuverture', mur: W[2]!.id, position: 5_000, largeur: 900, hauteur: 2_150, allege: 0, genre: 'door' }], a));
    const N = notice(h.projet), texte = N.flatMap(r => r.paragraphes).join('\n');
    expect(N.map(r => r.titre)).toHaveLength(4);
    for (const t of ['parcelle AB 123', '600,00 m²', 'desservi par la rue des Essais', 'à 2,90 m de l’alignement', 'à 4,90 m de la limite séparative la plus proche',
      'Emprise au sol : 83,64 m², soit 13,9 % du terrain', 'surface de plancher 76,44 m²', 'Toiture à croupes, pente 35°, couverture tuiles', 'Façades : enduit ton pierre.',
      'Menuiseries : 2 fenêtres et 1 porte', 'grillage rigide vert (20,00 m)', 'Espaces verts et plantations : 192,00 m², soit 32,0 % du terrain'])
      expect(texte).toContain(t);
    expect(texte).toMatch(/État initial.*\[à compléter\]/);
    expect(texte).toMatch(/Raccordements.*\[à compléter\]/);
  });

  it('sans parcelle ni toiture : tout ce qui manque est à compléter, rien n’est inventé', () => {
    const p = creerProjet({ nom: 'Vide', id: generateurSequentiel('p') });
    const t = notice(p).flatMap(r => r.paragraphes).join('\n');
    expect(t).toContain('Terrain : surface et limites [à compléter]');
    expect(t).toContain('Toiture : [à compléter]');
    expect(t).toContain('Clôtures : [à compléter]');
  });
});
