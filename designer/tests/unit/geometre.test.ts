/* Le plan du géomètre en DXF : limites fermées (la limite de propriété
   proposée d'abord), points cotés (points 3D, sommets 3D, ou textes),
   mètres passés en millimètres et ramenés près de l'origine. DXF fictifs,
   écrits ici. */
import { describe, expect, it } from 'vitest';
import { lirePlanGeometre } from '../../src/import/geometre';

/** un DXF minimal : une section ENTITIES faite des groupes donnés */
const dxf = (entites: (string | number)[][], unites?: number) => [
  ...(unites ? ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', String(unites), '0', 'ENDSEC'] : []),
  '0', 'SECTION', '2', 'ENTITIES', ...entites.flat().map(String), '0', 'ENDSEC', '0', 'EOF'].join('\n');
const lw = (calque: string, P: number[][], ferme = true) => ['0', 'LWPOLYLINE', '8', calque, '90', P.length, '70', ferme ? 1 : 0, ...P.flatMap(([x, y]) => ['10', x!, '20', y!])];
const pt = (x: number, y: number, z: number) => ['0', 'POINT', '8', 'TOPO', '10', x, '20', y, '30', z];
const tx = (x: number, y: number, t: string) => ['0', 'TEXT', '8', 'ALTI', '10', x, '20', y, '1', t];

describe('plan du géomètre (DXF)', () => {
  /* une parcelle de 20 × 30 m en Lambert 93, un bâti voisin plus grand sur un autre calque, cinq points cotés */
  const X = 652_340, Y = 6_862_110;
  const L = [[X, Y], [X + 20, Y], [X + 20, Y + 30], [X, Y + 30]];
  const texte = dxf([lw('BATI', [[X - 50, Y - 50], [X + 100, Y - 50], [X + 100, Y + 100], [X - 50, Y + 100]]), lw('LIMITE_PROPRIETE', L),
    pt(X, Y, 81.37), pt(X + 20, Y, 81.2), pt(X + 20, Y + 30, 80.29), pt(X, Y + 30, 80.77), pt(X + 10, Y + 15, 80.9), pt(X + 10.05, Y + 15, 80.9)]);

  it('la limite sur un calque « LIMITE » passe devant un contour plus grand ; tout est en mm, ramené près de l’origine', () => {
    const g = lirePlanGeometre(texte);
    expect(g.unite).toBe('m');
    expect(g.calques).toEqual(['BATI', 'LIMITE_PROPRIETE', 'TOPO']);
    expect(g.limites.map(l => l.calque)).toEqual(['LIMITE_PROPRIETE', 'BATI']);
    expect(g.limites[0]!.surface).toBeCloseTo(600, 6);
    expect(g.decalage).toEqual({ x: (X + 10) * 1_000, y: (Y + 15) * 1_000 });
    expect(g.limites[0]!.points).toEqual([{ x: -10_000, y: -15_000 }, { x: 10_000, y: -15_000 }, { x: 10_000, y: 15_000 }, { x: -10_000, y: 15_000 }]);
  });

  it('les points cotés : les points 3D, deux points à 5 cm n’en font qu’un', () => {
    const g = lirePlanGeometre(texte);
    expect(g.sourceAltitudes).toBe('points');
    expect(g.points).toHaveLength(5);
    expect(g.points[0]).toEqual({ point: { x: -10_000, y: -15_000 }, ngf: 81.37 });
  });

  it('un plan sans 3D : les textes qui sont une altitude valent points cotés ; les autres textes non', () => {
    const g = lirePlanGeometre(dxf([lw('0', L), tx(X, Y, '81.37'), tx(X + 20, Y, '81,20'), tx(X + 5, Y + 5, 'Lot n°34'), tx(X + 6, Y + 6, '384.29 m²')]));
    expect(g.sourceAltitudes).toBe('textes');
    expect(g.points.map(p => p.ngf)).toEqual([81.37, 81.2]);
  });

  it('les unités du fichier (millimètres) ; sans limite ni altitude : rien d’inventé', () => {
    const g = lirePlanGeometre(dxf([lw('0', [[0, 0], [10_000, 0], [10_000, 5_000], [0, 5_000]])], 4));
    expect(g.unite).toBe('mm');
    expect(g.limites[0]!.surface).toBeCloseTo(50, 6);
    const vide = lirePlanGeometre(dxf([lw('0', [[0, 0], [5, 5]], false)]));
    expect(vide.limites).toEqual([]); expect(vide.points).toEqual([]); expect(vide.sourceAltitudes).toBe('aucune');
  });
});
