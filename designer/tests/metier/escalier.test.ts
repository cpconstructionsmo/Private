/* L'escalier calculé depuis la hauteur à franchir : marches (Blondel),
   formes droit et quart tournant, trémie (échappée de 2 m), commandes. */
import { describe, expect, it } from 'vitest';
import { canonique, creerProjet, generateurSequentiel, type Floor, type Project, type Stair } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Historique } from '../../src/engine';
import { geometrieEscalier, hauteurAFranchir, niveauDArrivee, tremiesDuNiveau } from '../../src/building';
import { aire } from '../../src/geometry';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const esc = (o: Partial<Stair> = {}): Stair => ({ id: 's', type: 'stair', status: 'confirmed', sourceRefs: [], revision: 0, position: { x: 0, y: 0 }, rotation: 0, width: 900, kind: 'straight', ...o });

/** RDC (sol ±0) et étage dont le sol est à +2,70 */
function deuxNiveaux(): { h: Historique; a: Acteur; rdc: Floor; etage: Floor; p: Project } {
  const a = acteur(), p0 = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const h = ok(executer(nouvelHistorique(p0), 'Étage', [{ type: 'ajouterNiveau', batiment: p0.buildings[0]!.id, nom: 'Étage', altitude: 2_700, hauteur: 2_500 }], a));
  const F = [...h.projet.buildings[0]!.floors].sort((x, y) => x.elevation - y.elevation);
  return { h, a, rdc: F[0]!, etage: F[1]!, p: h.projet };
}

describe('géométrie de l’escalier', () => {
  it('2,70 m à franchir : 15 hauteurs de 18 cm, giron 27 cm (Blondel 63), 14 marches, 3,78 m de reculement', () => {
    const g = geometrieEscalier(esc(), 2_700);
    expect([g.contremarches, g.hauteurMarche, g.giron, g.blondel]).toEqual([15, 180, 270, 630]);
    expect(g.marches).toHaveLength(14);
    expect(g.marches[13]!.z).toBe(14 * 180);
    expect(Math.max(...g.emprise.map(p => p.y))).toBe(14 * 270);
    expect(g.alertes).toEqual([]);
  });

  it('trémie : au-dessus des marches sans 2 m d’échappée sous le plancher (dessous à +2,50)', () => {
    const g = geometrieEscalier(esc(), 2_700);
    /* une marche à z demande le dessous du plancher au-dessus de z + 2,00 : à partir de la 3e (z = 0,54) */
    expect(Math.min(...g.tremie!.map(p => p.y))).toBe(2 * 270);
    expect(Math.max(...g.tremie!.map(p => p.y))).toBe(14 * 270);
    expect(aire({ contour: g.tremie! })).toBe(900 * 12 * 270);
  });

  it('quart tournant à gauche : une volée, un palier carré, une volée tournée vers la gauche', () => {
    const g = geometrieEscalier(esc({ kind: 'quarter_left' }), 2_700);
    expect(g.marches).toHaveLength(14);
    expect(g.marches.filter(m => m.palier)).toHaveLength(1);
    const pal = g.marches.findIndex(m => m.palier);
    expect(pal).toBe(6);
    expect(Math.min(...g.emprise.map(p => p.x))).toBe(-450 - 7 * 270);
    expect(g.emprise).toHaveLength(6);
    expect(Math.max(...geometrieEscalier(esc({ kind: 'quarter_right' }), 2_700).emprise.map(p => p.x))).toBe(450 + 7 * 270);
  });

  it('tourné d’un quart : on monte vers −x ; un giron imposé trop court déclenche l’alerte Blondel', () => {
    const g = geometrieEscalier(esc({ rotation: Math.PI / 2 }), 2_700);
    expect(Math.min(...g.emprise.map(p => p.x))).toBeCloseTo(-14 * 270, 6);
    expect(geometrieEscalier(esc({ going: 200 }), 2_700).alertes[0]).toMatch(/Blondel/);
    expect(geometrieEscalier(esc({ width: 700 }), 2_700).alertes[0]).toMatch(/80 cm/);
  });
});

describe('escalier dans le projet', () => {
  it('hauteur à franchir jusqu’au niveau du dessus ; trémie ouverte dans ce niveau ; commandes annulables', () => {
    const { h, a, rdc, etage } = deuxNiveaux();
    expect(hauteurAFranchir(h.projet, rdc)).toBe(2_700);
    expect(niveauDArrivee(h.projet, rdc)?.id).toBe(etage.id);
    expect(hauteurAFranchir(h.projet, etage)).toBe(2_500 + 200);              // dernier niveau : sa hauteur et un plancher
    const h2 = ok(executer(h, 'Escalier', [{ type: 'creerEscalier', niveau: rdc.id, genre: 'straight', position: { x: 1_000, y: 1_000 }, rotation: 0, largeur: 900 }], a));
    const p2 = h2.projet, et2 = p2.buildings[0]!.floors.find(f => f.id === etage.id)!;
    expect(tremiesDuNiveau(p2, et2)).toHaveLength(1);
    const s = Object.values(p2.buildings[0]!.floors.find(f => f.id === rdc.id)!.objects).find((o): o is Stair => o.type === 'stair')!;
    const h3 = ok(executer(h2, 'Giron', [{ type: 'modifierEscalier', id: s.id, giron: 250, genre: 'quarter_right' }], a));
    expect(Object.values(h3.projet.buildings[0]!.floors.find(f => f.id === rdc.id)!.objects).find(o => o.type === 'stair')).toMatchObject({ going: 250, kind: 'quarter_right' });
    expect(canonique(annuler(h3).projet)).toBe(canonique(p2));
    const h4 = ok(executer(h3, 'Giron calculé', [{ type: 'modifierEscalier', id: s.id, giron: null }], a));
    expect(Object.values(h4.projet.buildings[0]!.floors.find(f => f.id === rdc.id)!.objects).find(o => o.type === 'stair')).not.toHaveProperty('going');
    expect(executer(h2, 'x', [{ type: 'modifierEscalier', id: s.id, largeur: 500 }], a).ok).toBe(false);
    expect(executer(h2, 'x', [{ type: 'modifierEscalier', id: s.id, giron: 100 }], a).ok).toBe(false);
  });
});
