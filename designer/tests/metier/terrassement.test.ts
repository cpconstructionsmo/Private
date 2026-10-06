/* Le terrain et son terrassement : courbes de niveau tirées du relevé,
   plateformes, talus jusqu'au terrain naturel, cubatures, réseaux (VRD),
   équipements et arbres, et leur métré. Terrains fictifs (plans inclinés
   et plats), dont les résultats se calculent à la main. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Platform, type Plot, type Project } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande } from '../../src/engine';
import { altitudeFinie, courbesDeNiveau, cubature, longueurReseau, metreTerrain, profilEnLong, reliefTerrain, talusDe } from '../../src/building';
import { viser, dansCadre } from '../../src/ui/selection';
import { planchesPdf } from '../../src/export/planche';
import { maquette } from '../../src/vue3d/maquette';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 6) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
/** une parcelle de 40 × 40 m relevée à ses coins et en son centre, selon z(x, y) en NGF */
const plot = (z: (x: number, y: number) => number, ngfRdc = 100): Plot => {
  const P = [[-20_000, -20_000], [20_000, -20_000], [20_000, 20_000], [-20_000, 20_000], [0, 0]];
  return { id: 't', type: 'plot', status: 'confirmed', sourceRefs: [], revision: 1, contour: P.slice(0, 4).map(([x, y]) => ({ x: x!, y: y! })), street: [0], north: 0,
    groundFloorNgf: ngfRdc, spotHeights: P.map(([x, y]) => ({ point: { x: x!, y: y! }, ngf: z(x!, y!) })) } as Plot;
};
const plateforme = (level: number, cote = 10_000, slope = 1.5): Platform => ({ id: 'pf', type: 'platform', status: 'confirmed', sourceRefs: [], revision: 1, level, slope,
  contour: [{ x: -cote / 2, y: -cote / 2 }, { x: cote / 2, y: -cote / 2 }, { x: cote / 2, y: cote / 2 }, { x: -cote / 2, y: cote / 2 }] } as Platform);

describe('courbes de niveau', () => {
  it('un terrain qui monte de 5 % vers le nord : des courbes horizontales, tous les 0,50 m ; une maîtresse toutes les cinq', () => {
    const t = plot((_, y) => 100 + 0.05 * (y + 20_000) / 1_000);         // 100 au sud, 102 au nord
    const C = courbesDeNiveau(t, 0.5);
    expect(C.map(c => c.z)).toEqual([100.5, 101, 101.5, 102]);             // 102 longe le bord nord (deux sommets) ; 100, le bord sud, n'est pas coupé
    for (const c of C) for (const [a, b] of c.segments) for (const q of [a, b]) expect(q.y).toBeCloseTo((c.z - 100) / 0.05 * 1_000 - 20_000, 6);
    expect(C.find(c => c.z === 101)!.maitresse).toBe(false);
    const fines = courbesDeNiveau(t, 0.2);
    expect(fines.find(c => c.z === 101)!.maitresse).toBe(true);           // 101,0 = 505 × 0,20 : une maîtresse (tous les 1,00 m)
    expect(fines.find(c => c.z === 100.2)!.maitresse).toBe(false);
    expect(courbesDeNiveau({ ...t, spotHeights: t.spotHeights!.slice(0, 2) })).toEqual([]);
  });
});

describe('plateformes, talus et cubatures', () => {
  it('sur un terrain plat : une plateforme décaissée de 1 m sort 100 m³ de déblai et un talus de 1,50 m de large', () => {
    const t = plot(() => 100);
    const c = cubature(t, plateforme(-1_000))!;
    expect(c.surface).toBeCloseTo(100, 6);
    expect(c.deblai).toBeCloseTo(100, 6); expect(c.remblai).toBe(0);
    const ta = talusDe(t, plateforme(-1_000))!;
    for (const r of ta.rayons) {
      expect(r.genre).toBe('deblai');
      /* au milieu des côtés, le pied est à 1,50 m (pente 3 pour 2) ; aux angles, sur la bissectrice */
      expect(Math.hypot(r.pied.x - r.haut.x, r.pied.y - r.haut.y)).toBeCloseTo(1_500, 0);
    }
    /* le prisme du talus : ½ × 1,5 × 1 × 40 m de bord = 30 m³ (les angles en plus ou en moins, à 10 % près) */
    expect(ta.deblai).toBeGreaterThan(27); expect(ta.deblai).toBeLessThan(33);
    expect(ta.remblai).toBe(0);
  });

  it('au niveau du terrain : rien à terrasser ; au-dessus : du remblai', () => {
    const t = plot(() => 100);
    const z = cubature(t, plateforme(0))!;
    expect(z.deblai + z.remblai + z.talusDeblai + z.talusRemblai).toBe(0);
    const r = cubature(t, plateforme(500))!;
    expect(r.remblai).toBeCloseTo(50, 6); expect(r.deblai).toBe(0);
    expect(r.talusRemblai).toBeGreaterThan(0); expect(r.talusDeblai).toBe(0);
  });

  it('sur un terrain en pente, une plateforme calée à mi-hauteur équilibre déblai et remblai', () => {
    const t = plot((_, y) => 100 + 0.05 * (y + 20_000) / 1_000, 101);      // TN 100,75 à 101,25 sous la plateforme
    const c = cubature(t, plateforme(0))!;                                   // niveau 101,00 NGF
    /* au nord, le terrain dépasse de 0 à 0,25 m sur 5 m : 10 × ½ × 5 × 0,25 = 6,25 m³ ; au sud, autant de remblai */
    expect(c.deblai).toBeCloseTo(6.25, 1); expect(c.remblai).toBeCloseTo(6.25, 1);
    expect(c.tnMin).toBeCloseTo(100.75, 1); expect(c.tnMax).toBeCloseTo(101.25, 1);            // mesurés au centre des mailles de 25 cm
    const ta = talusDe(t, plateforme(0))!;
    expect(ta.rayons.some(r => r.genre === 'deblai') && ta.rayons.some(r => r.genre === 'remblai')).toBe(true);
    /* sans altitude NGF du ±0,00, rien ne se place */
    const { groundFloorNgf: _, ...sans } = t;
    expect(cubature(sans as Plot, plateforme(0))).toBeNull();
  });
});

describe('commandes et métré du terrain', () => {
  it('plateforme, réseaux, équipements et arbres : créés, refusés s’ils sont faux, annulables ; le métré les compte', () => {
    const a = acteur(), p0 = creerProjet({ nom: 'Fictif', id: generateurSequentiel('p') }), n = p0.buildings[0]!.floors[0]!.id;
    const cmds: Commande[] = [
      { type: 'creerParcelle', niveau: n, contour: [{ x: -20_000, y: -20_000 }, { x: 20_000, y: -20_000 }, { x: 20_000, y: 20_000 }, { x: -20_000, y: 20_000 }], voies: [0], altitudeRdc: 100 },
      { type: 'creerPlateforme', niveau: n, contour: plateforme(-1_000).contour, niveauFini: -1_000, talus: 1.5, nom: 'Assise de la maison' },
      { type: 'creerReseau', niveau: n, genre: 'eu', points: [{ x: 0, y: 0 }, { x: 0, y: -20_000 }], spec: 'PVC Ø 100' },
      { type: 'creerReseau', niveau: n, genre: 'elec', points: [{ x: 3_000, y: 0 }, { x: 3_000, y: -10_000 }, { x: 8_000, y: -10_000 }] },
      { type: 'creerEquipement', niveau: n, genre: 'regard', position: { x: 0, y: -19_000 } },
      { type: 'creerArbre', niveau: n, position: { x: 10_000, y: 10_000 }, diametre: 4_000, etat: 'existing' },
      { type: 'creerArbre', niveau: n, position: { x: -10_000, y: 10_000 }, diametre: 2_000, etat: 'felled' },
    ];
    const r = executer(nouvelHistorique(p0), 'Terrain', cmds, a);
    if (!r.ok) throw new Error(r.erreurs.join());
    const plotId = Object.values(r.historique.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'plot')!.id;
    const r2 = executer(r.historique, 'Points', [{ type: 'modifierParcelle', id: plotId, altitudesTerrain: [{ point: { x: -20_000, y: -20_000 }, ngf: 100 }, { point: { x: 20_000, y: -20_000 }, ngf: 100 }, { point: { x: 0, y: 20_000 }, ngf: 100 }] }], a);
    if (!r2.ok) throw new Error(r2.erreurs.join());
    const P: Project = r2.historique.projet, M = metreTerrain(P);
    expect(M.plateformes).toHaveLength(1);
    expect(M.plateformes[0]!.deblai).toBeCloseTo(100, 6);
    expect(M.deblai).toBeGreaterThan(125);
    expect(M.reseaux.find(x => x.genre === 'eu')!.longueur).toBeCloseTo(20, 9);
    expect(M.reseaux.find(x => x.genre === 'elec')!.longueur).toBeCloseTo(15, 9);
    expect(M.equipements).toEqual([{ genre: 'regard', nombre: 1 }]);
    expect(M.arbres).toEqual({ existants: 1, aPlanter: 0, aAbattre: 1 });
    expect(longueurReseau({ points: [{ x: 0, y: 0 }, { x: 3_000, y: 4_000 }] })).toBe(5_000);
    /* refus : talus trop raide, réseau d'un seul point, couronne trop petite */
    for (const [cmd, motif] of [
      [{ type: 'creerPlateforme', niveau: n, contour: plateforme(0).contour, niveauFini: 0, talus: 0.1 }, /pente de talus/],
      [{ type: 'creerReseau', niveau: n, genre: 'eu', points: [{ x: 0, y: 0 }] }, /deux points/],
      [{ type: 'creerArbre', niveau: n, position: { x: 0, y: 0 }, diametre: 100, etat: 'planted' }, /couronne/],
    ] as [Commande, RegExp][]) { const k = executer(r2.historique, 'x', [cmd], a); expect(k.ok ? '' : k.erreurs.join()).toMatch(motif) }
    /* modifier puis annuler */
    const pf = Object.values(P.buildings[0]!.floors[0]!.objects).find(o => o.type === 'platform')!;
    const m = executer(r2.historique, 'x', [{ type: 'modifierPlateforme', id: pf.id, niveauFini: -500, talus: 2 }], a);
    if (!m.ok) throw new Error(m.erreurs.join());
    expect(Object.values(m.historique.projet.buildings[0]!.floors[0]!.objects).find(o => o.id === pf.id)).toMatchObject({ level: -500, slope: 2 });
    expect(Object.values(annuler(m.historique).projet.buildings[0]!.floors[0]!.objects).find(o => o.id === pf.id)).toMatchObject({ level: -1_000, slope: 1.5 });
  });

  it('la parcelle se crée avec son relevé (plan du géomètre) en une opération ; les objets du terrain se visent', () => {
    const a = acteur(), p0 = creerProjet({ nom: 'Fictif', id: generateurSequentiel('p') }), n = p0.buildings[0]!.floors[0]!.id;
    const contour = [{ x: -20_000, y: -20_000 }, { x: 20_000, y: -20_000 }, { x: 20_000, y: 20_000 }, { x: -20_000, y: 20_000 }];
    const pts = [{ point: { x: -20_000, y: -20_000 }, ngf: 100 }, { point: { x: 20_000, y: -20_000 }, ngf: 100.5 }, { point: { x: 0, y: 20_000 }, ngf: 101 }];
    const r = executer(nouvelHistorique(p0), 'Géomètre', [{ type: 'creerParcelle', niveau: n, contour, voies: [0], altitudeRdc: 100.5, altitudesTerrain: pts }], a);
    if (!r.ok) throw new Error(r.erreurs.join());
    const t = Object.values(r.historique.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'plot') as Plot;
    expect(t.spotHeights).toEqual(pts);
    expect(annuler(r.historique).projet.buildings[0]!.floors[0]!.objects).toEqual({});
    const k = executer(nouvelHistorique(p0), 'x', [{ type: 'creerParcelle', niveau: n, contour, altitudesTerrain: [pts[0]!, { ...pts[0]!, ngf: 101 }] }], a);
    expect(k.ok ? '' : k.erreurs.join()).toMatch(/10 cm/);
    /* viser et encadrer : un regard, un réseau, une plateforme (bord puis dedans), un arbre */
    const r2 = executer(r.historique, 'Terrain', [
      { type: 'creerPlateforme', niveau: n, contour: plateforme(0).contour, niveauFini: 0, talus: 1.5 },
      { type: 'creerReseau', niveau: n, genre: 'ep', points: [{ x: 10_000, y: 0 }, { x: 10_000, y: 15_000 }] },
      { type: 'creerEquipement', niveau: n, genre: 'regard', position: { x: 10_000, y: 15_000 } },
      { type: 'creerArbre', niveau: n, position: { x: -12_000, y: 12_000 }, diametre: 6_000, etat: 'existing' },
    ], a);
    if (!r2.ok) throw new Error(r2.erreurs.join());
    const f = r2.historique.projet.buildings[0]!.floors[0]!, type = (q: { x: number; y: number }) => { const c = viser(f, q, 200, false); return c?.genre === 'objet' ? c.type : null };
    expect(type({ x: 10_000, y: 15_050 })).toBe('network_item');
    expect(type({ x: 10_050, y: 7_000 })).toBe('network');
    expect(type({ x: 5_000, y: 0 })).toBe('platform');
    expect(type({ x: 1_000, y: 1_000 })).toBe('platform');
    expect(type({ x: -10_000, y: 12_000 })).toBe('tree');
    expect(dansCadre(f, { x: -16_000, y: 8_000 }, { x: -8_000, y: 16_000 }).map(id => f.objects[id]!.type)).toEqual(['tree']);
  });

  it('le plan de masse (PCMI 2) porte le terrassement, les réseaux et les plantations', () => {
    const a = acteur(), p0 = creerProjet({ nom: 'Fictif', id: generateurSequentiel('p') }), n = p0.buildings[0]!.floors[0]!.id;
    const murs: Commande[] = [[0, 0, 10_000, 0], [10_000, 0, 10_000, 8_000], [10_000, 8_000, 0, 8_000], [0, 8_000, 0, 0]].map(([ax, ay, bx, by]) => ({ type: 'creerMur', niveau: n, a: { x: ax!, y: ay! }, b: { x: bx!, y: by! }, epaisseur: 200, hauteur: 2_500, role: 'exterior' }) as Commande);
    const r = executer(nouvelHistorique(p0), 'Terrain', [...murs,
      { type: 'creerParcelle', niveau: n, contour: [{ x: -10_000, y: -12_000 }, { x: 22_000, y: -12_000 }, { x: 22_000, y: 18_000 }, { x: -10_000, y: 18_000 }], voies: [0], altitudeRdc: 101,
        altitudesTerrain: [{ point: { x: -10_000, y: -12_000 }, ngf: 99.6 }, { point: { x: 22_000, y: -12_000 }, ngf: 100.1 }, { point: { x: 22_000, y: 18_000 }, ngf: 102.2 }, { point: { x: -10_000, y: 18_000 }, ngf: 101.8 }] },
      { type: 'creerPlateforme', niveau: n, contour: [{ x: -1_000, y: -1_000 }, { x: 11_000, y: -1_000 }, { x: 11_000, y: 9_000 }, { x: -1_000, y: 9_000 }], niveauFini: -300, talus: 1.5, nom: 'Plateforme de la maison' },
      { type: 'creerReseau', niveau: n, genre: 'eu', points: [{ x: 5_000, y: 0 }, { x: 5_000, y: -12_000 }], spec: 'PVC Ø 100' },
      { type: 'creerReseau', niveau: n, genre: 'elec', points: [{ x: 9_000, y: 0 }, { x: 15_000, y: -12_000 }] },
      { type: 'creerEquipement', niveau: n, genre: 'branchement', position: { x: 5_000, y: -11_500 } },
      { type: 'creerArbre', niveau: n, position: { x: 16_000, y: 12_000 }, diametre: 5_000, etat: 'existing' },
      { type: 'creerArbre', niveau: n, position: { x: -5_000, y: 12_000 }, diametre: 3_000, etat: 'planted' },
    ], a);
    if (!r.ok) throw new Error(r.erreurs.join());
    const pdf = planchesPdf(r.historique.projet, { niveaux: [], cotation: true, mobilier: true, indice: 'A', date: '06/10/2026', masse: true });
    const s = Array.from(pdf, c => String.fromCharCode(c)).join('');
    /* la 3D : le relief du terrain fini, la plateforme à son niveau (−0,30) ; 4 nœuds par maille, deux triangles */
    const R = maquette(r.historique.projet).relief!;
    expect(R.triangles.length % 9).toBe(0); expect(R.triangles.length).toBeGreaterThan(9 * 1_000);
    expect(R.zmin).toBeLessThan(-1_000); expect(R.zmax).toBeGreaterThan(1_000);
    const auCentre = (() => { const T = R.triangles; for (let i = 0; i < T.length; i += 3) if (Math.abs(T[i]! - 5_000) < 300 && Math.abs(T[i + 1]! - 4_000) < 300) return T[i + 2]!; return null })();
    expect(auCentre).toBe(-300);
    for (const t of ['(TERRASSEMENT', '(R\xC9SEAUX', '(PLANTATIONS', '(EU \x97 Eaux us\xE9es', '(EU PVC \xD8 100)']) expect(s).toContain(t);
    /* le plan du niveau montre le bâtiment : ni réseaux, ni plateforme (ils sont au plan de masse) */
    const rdc = Array.from(planchesPdf(r.historique.projet, { niveaux: [n], cotation: true, mobilier: true, indice: 'A', date: '06/10/2026' }), c => String.fromCharCode(c)).join('');
    expect(rdc).not.toContain('(EU PVC'); expect(rdc).not.toContain('Plateforme de la maison');
  });

  it('le terrain fini : plateforme, puis talus jusqu’au terrain naturel ; relief en grille ; profil en long', () => {
    const t = plot(() => 100, 101);                                       // terrain plat à 100 ; ±0,00 à 101
    const pf = plateforme(-500);                                           // plateforme à 100,50 : 0,50 m de remblai
    expect(altitudeFinie(t, [pf], { x: 0, y: 0 })).toBe(100.5);
    expect(altitudeFinie(t, [pf], { x: 5_000 + 300, y: 0 })).toBeCloseTo(100.5 - 0.2, 9);   // 30 cm du bord, pente 3/2 : 20 cm plus bas
    expect(altitudeFinie(t, [pf], { x: 5_000 + 1_000, y: 0 })).toBeCloseTo(100, 9);                   // au-delà du pied (75 cm) : le terrain naturel
    const { groundFloorNgf: _, ...sans } = t;
    expect(altitudeFinie(sans as Plot, [pf], { x: 0, y: 0 })).toBeCloseTo(100, 9);                     // sans ±0,00 : rien ne se place
    const R = reliefTerrain(t, [pf])!;
    expect(R.nx).toBeLessThanOrEqual(120); expect(R.z).toHaveLength((R.nx + 1) * (R.ny + 1));
    expect(R.zmin).toBeCloseTo(100, 9); expect(R.zmax).toBe(100.5);
    expect(R.dedans.every(Boolean)).toBe(true);                             // la parcelle est le rectangle de la grille
    const P = profilEnLong(t, [pf], { x: -10_000, y: 0 }, { x: 10_000, y: 0 }, 500);
    expect(P).toHaveLength(41); expect(P[0]!.d).toBe(0); expect(P[40]!.d).toBe(20_000);
    expect(P.every(q => Math.abs(q.tn - 100) < 1e-9)).toBe(true);
    expect(P[20]!.fini).toBe(100.5); expect(P[0]!.fini).toBeCloseTo(100, 9);
    expect(reliefTerrain({ ...t, spotHeights: t.spotHeights!.slice(0, 2) }, [])).toBeNull();
  });
});
