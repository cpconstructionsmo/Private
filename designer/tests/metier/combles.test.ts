/* Une maison à combles aménagés (fictive) : RDC de 10 × 8 m, combles à
   +2,70 sur des murs de 1,00 m, toit à deux pans de 45°, deux chambres et
   l'escalier. Les parties de moins de 1,80 m sous la toiture ne comptent
   pas : ni dans les surfaces réglementaires, ni dans les tableaux et les
   étiquettes des pièces ; le plan d'étage les hache, la coupe marque les
   1,80 m ; les façades repèrent le sol fini des combles ; une coupe le long
   du faîtage montre le dessous du pan d'au-delà, pas ses tuiles. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Project } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { surfacesReglementaires, surfacesDesPieces, partiesBasses } from '../../src/building';
import { maquette } from '../../src/vue3d/maquette';
import { coupe } from '../../src/vue3d/coupe';
import { projeter } from '../../src/vue3d/facades';
import { planchesPdf, surfacesParPiece } from '../../src/export/planche';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number, role: 'exterior' | 'partition' = 'exterior', hauteur?: number): Commande =>
  ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: role === 'exterior' ? 200 : 70, role, ...(hauteur ? { hauteur } : {}) });
const quatre = (n: string, h: number) => [M(n, 0, 0, 10_000, 0, 'exterior', h), M(n, 10_000, 0, 10_000, 8_000, 'exterior', h), M(n, 10_000, 8_000, 0, 8_000, 'exterior', h), M(n, 0, 8_000, 0, 0, 'exterior', h)];
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');
const textes = (s: string) => [...s.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(m => m[1]!.replace(/\\(.)/g, '$1')).join(' ');

function maisonACombles(): { p: Project; rdc: string; combles: string } {
  const a = acteur(), p0 = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p0.buildings[0]!.floors[0]!.id;
  let h = ok(executer(nouvelHistorique(p0), 'RDC', [...quatre(n, 2_500), M(n, 5_000, 0, 5_000, 8_000, 'partition')], a));
  h = ok(executer(h, 'Combles', [{ type: 'ajouterNiveau', batiment: h.projet.buildings[0]!.id, nom: 'Combles', altitude: 2_700, hauteur: 2_500 }], a));
  const c = h.projet.buildings[0]!.floors.find(f => f.name === 'Combles')!.id;
  h = ok(executer(h, 'x', [...quatre(c, 1_000), M(c, 5_000, 0, 5_000, 8_000, 'partition', 2_400),
    { type: 'creerEscalier', niveau: n, genre: 'straight', position: { x: 1_000, y: 1_000 }, rotation: 0, largeur: 900 },
    { type: 'creerToiture', niveau: c, genre: 'gable', pente: 45, debord: 400, couverture: 'tile', talon: 0 },
    { type: 'creerPiece', niveau: c, point: { x: 2_500, y: 5_000 }, nom: 'Chambre 1', usage: 'bedroom' },
    { type: 'creerPiece', niveau: c, point: { x: 7_500, y: 4_000 }, nom: 'Chambre 2', usage: 'bedroom' },
    { type: 'creerPiece', niveau: n, point: { x: 2_500, y: 5_000 }, nom: 'Séjour', usage: 'living' },
    { type: 'creerPiece', niveau: n, point: { x: 7_500, y: 4_000 }, nom: 'Cuisine', usage: 'kitchen' }], a));
  return { p: h.projet, rdc: n, combles: c };
}

describe('maison à combles aménagés', () => {
  const { p, rdc, combles } = maisonACombles();
  const niveau = (id: string) => p.buildings[0]!.floors.find(f => f.id === id)!;

  it('les pièces des combles ne comptent que ce qui a 1,80 m : tableaux et surface habitable tombent juste', () => {
    const S = surfacesReglementaires(p), SC = S.niveaux.find(x => x.niveau === combles)!;
    const A = surfacesDesPieces(p, niveau(combles));
    expect(A.size).toBe(2);
    const somme = [...A.values()].reduce((s, a) => s + a, 0);
    expect(somme).toBeCloseTo(SC.habitable, -2);
    /* bien moins que la surface au sol (37,95 m² chacune) : les rives basses et la trémie sont déduites */
    for (const a of A.values()) expect(a / 1e6).toBeLessThan(31);
    const G = surfacesParPiece(p).find(g => g.niveau === 'Combles')!;
    expect(G.pieces.reduce((s, x) => s + x.sh, 0)).toBeCloseTo(SC.habitable, -2);
    /* au RDC, rien n'est sous la toiture : la surface au sol */
    expect(partiesBasses(p, niveau(rdc))).toHaveLength(0);
    expect(surfacesReglementaires(p).niveaux.find(x => x.niveau === rdc)!.basses).toBe(0);
  });

  it('les parties basses : deux bandes le long des égouts (sud et nord), là où la toiture descend sous 1,80 m', () => {
    const B = partiesBasses(p, niveau(combles));
    expect(B).toHaveLength(2);
    for (const b of B) {
      const ys = b.contour.map(q => q.y), largeur = Math.max(...ys) - Math.min(...ys);
      /* le pan part de +3,70 au nu extérieur (murs de 1,00 m), à 45° : 1,80 m sous ses 20 cm de couverture (+4,70)
         à 1,00 m du nu extérieur, soit 0,80 m du nu intérieur */
      expect(largeur).toBeCloseTo(800, -1);
    }
  });

  it('les planches : le plan des combles hache les parties basses et dit la surface comptée ; la coupe marque les 1,80 m ; les façades repèrent les combles', () => {
    const s = textes(texte(planchesPdf(p, { niveaux: [combles], cotation: true, mobilier: false, indice: 'A', date: '10/10/2026', facades: true, coupe: true })));
    expect(s).toContain('Hauteur inf\xE9rieure \xE0 1,80 m sous la toiture (non compt\xE9e)');
    const A = surfacesDesPieces(p, niveau(combles));
    for (const a of A.values()) expect(s).toContain('SH : ' + (a / 1e6).toFixed(2).replace('.', ',') + ' m\xB2');
    expect(s).toContain('Hauteur de 1,80 m sous la toiture');
    expect(s).toMatch(/1,80/);
    expect(s).toContain('Combles fini +2,70');
  });

  it('une coupe le long du faîtage : le pan d’au-delà se voit par-dessous, sans couverture ; une façade voit toujours le dessus', () => {
    const C = coupe(maquette(p), { a: { x: -2_000, y: 4_000 }, b: { x: 12_000, y: 4_000 }, regard: { x: 0, y: 1 }, nom: 'B' });
    const tuiles = C.vues.filter(f => f.matiere === 'tuile');
    expect(tuiles.some(f => f.dessous)).toBe(true);
    /* en façade nord (regard vers le sud), le pan nord se voit de dessus */
    const F = projeter(maquette(p), { u: q => -q.x, prof: q => -q.y }, new Set());
    expect(F.faces.filter(f => f.matiere === 'tuile').some(f => f.dessous)).toBe(false);
  });
});
