/* Les façades déduites de la maquette : projection de face, faces
   rangées du plus loin au plus près, baies et toiture à leurs hauteurs. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Project } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { mursDroits } from '../../src/building';
import { maquette } from '../../src/vue3d/maquette';
import { facade } from '../../src/vue3d/facades';
import { planchesPdf } from '../../src/export/planche';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, hauteur: 2_500, role: 'exterior' });

/** 10 × 8 m (axes), une fenêtre 1,20 × 1,25 au sud (allège 0,90), croupes à 45°, débord 0,50 */
function maison(): Project {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p.buildings[0]!.floors[0]!.id;
  let h = ok(executer(nouvelHistorique(p), 'Murs', [M(n, 0, 0, 10_000, 0), M(n, 10_000, 0, 10_000, 8_000), M(n, 10_000, 8_000, 0, 8_000), M(n, 0, 8_000, 0, 0)], a));
  const sud = mursDroits(h.projet.buildings[0]!.floors[0]!).find(w => w.axis.a.y === 0 && w.axis.b.y === 0)!;
  h = ok(executer(h, 'Garnir', [{ type: 'creerOuverture', mur: sud.id, position: 3_000, largeur: 1_200, hauteur: 1_250, allege: 900, genre: 'window' },
    { type: 'creerToiture', niveau: n, genre: 'hip', pente: 45, debord: 500, couverture: 'tile' }], a));
  return h.projet;
}

describe('façades', () => {
  it('sud : de −0,10 à 10,10 m de large (débord compris : −0,60 à 10,60), du plancher au faîtage', () => {
    const f = facade(maquette(maison()), 'sud');
    expect(f.boite!.umin).toBeCloseTo(-600, 6); expect(f.boite!.umax).toBeCloseTo(10_600, 6);
    expect(f.boite!.zmin).toBe(-200);
    expect(f.boite!.zmax).toBeCloseTo(2_500 + 4_100, 6);
  });

  it('la fenêtre se voit à sa place (1,20 × 1,25, allège 0,90), et rien ne la recouvre ensuite', () => {
    const f = facade(maquette(maison()), 'sud');
    const k = f.faces.findIndex(x => x.matiere === 'vitrage' && Math.min(...x.points.map(q => q.u)) > 2_000);
    const v = f.faces[k]!;
    expect(Math.min(...v.points.map(q => q.u))).toBeCloseTo(2_400, 6); expect(Math.max(...v.points.map(q => q.u))).toBeCloseTo(3_600, 6);
    expect(Math.min(...v.points.map(q => q.z))).toBe(900); expect(Math.max(...v.points.map(q => q.z))).toBe(2_150);
    /* les murs peints après elle ne passent pas devant (ils sont autour : allège, linteau, trumeaux) */
    const devant = f.faces.slice(k + 1).filter(x => x.matiere === 'mur' && Math.min(...x.points.map(q => q.u)) < 3_500 && Math.max(...x.points.map(q => q.u)) > 2_500
      && Math.min(...x.points.map(q => q.z)) < 2_000 && Math.max(...x.points.map(q => q.z)) > 1_000);
    expect(devant).toHaveLength(0);
  });

  it('du plus loin au plus près ; vue du nord, la fenêtre sud est peinte avant le mur nord qui la cache', () => {
    const f = facade(maquette(maison()), 'sud');
    expect(f.faces.map(x => x.profondeur)).toEqual([...f.faces.map(x => x.profondeur)].sort((a, b) => b - a));
    const n = facade(maquette(maison()), 'nord');
    const vitre = n.faces.findIndex(x => x.matiere === 'vitrage'), murNord = n.faces.findIndex(x => x.matiere === 'mur' && x.profondeur < -7_000);
    expect(vitre).toBeGreaterThanOrEqual(0);
    expect(vitre).toBeLessThan(murNord);
  });

  it('export : une planche « Façades » en plus, avec les hauteurs repères', () => {
    const p = maison();
    const u = planchesPdf(p, { niveaux: [p.buildings[0]!.floors[0]!.id], cotation: true, mobilier: true, indice: 'A', date: '03/10/2026', facades: true });
    const s = Array.from(u, c => String.fromCharCode(c)).join('');
    expect(s).toContain('/Count 2');
    for (const t of ['(Fa\xE7ade sud \\(bas du plan\\))', '(Fa\xE7ade ouest \\(gauche du plan\\))', '(HAUTEURS)', '(+6,60 fa\xEEtage)', '(+2,00 \xE9gout)', '(Fa\xE7ades)']) expect(s).toContain(t);
  });
});
