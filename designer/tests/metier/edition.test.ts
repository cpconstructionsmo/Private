/* Phase 1, étape 5 — les moteurs d'édition : accrochage, contraintes, cotes
   motrices, niveaux, fond calé. Tout passe par des commandes, comme le fera
   l'interface. */
import { describe, expect, it } from 'vitest';
import { canonique, creerProjet, generateurSequentiel, type Constraint, type Floor, type Project, type Wall } from '../../src/model';
import { annuler, appliquerTout, executer, inverser, nouvelHistorique, type Acteur, type ChangeSet, type Commande, type Historique } from '../../src/engine';
import { Accrochage, accrochageDuNiveau, imageVersPlan, mesurerCote, planDuNiveau, planVersImage, calage } from '../../src/building';
import { mm2EnM2 } from '../../src/geometry';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const rdc = (p: Project): Floor => p.buildings[0]!.floors[0]!;
const M = (n: string, x1: number, y1: number, x2: number, y2: number, e = 200, role: Wall['role'] = 'exterior'): Commande =>
  ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: e, role });
const boite = (n: string, L = 10_000, H = 8_000, e = 200): Commande[] =>
  [M(n, 0, 0, L, 0, e), M(n, L, 0, L, H, e), M(n, L, H, 0, H, e), M(n, 0, H, 0, 0, e)];

function maison(cmds: (n: string) => Commande[]) {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = rdc(p).id;
  let h = nouvelHistorique(p);
  const r = executer(h, 'Plan', cmds(n), a);
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  h = r.historique;
  const run = (titre: string, c: Commande[]) => executer(h, titre, c, a);
  const faire = (titre: string, c: Commande[]): Historique => {
    const x = run(titre, c);
    if (!x.ok) throw new Error(titre + ' : ' + x.erreurs.join(' ; '));
    h = x.historique;
    return h;
  };
  const murs = () => Object.values(rdc(h.projet).objects).filter((o): o is Wall & { axis: { a: { x: number; y: number }; b: { x: number; y: number } } } => o.type === 'wall');
  return { get h() { return h }, set h(v: Historique) { h = v }, n, a, run, faire, murs, mur: (i: number) => murs()[i]! };
}
const m2 = (v: number) => Math.round(mm2EnM2(v) * 100) / 100;
const pres = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

describe('accrochage', () => {
  const m = maison(n => [...boite(n), M(n, 4_000, 0, 4_000, 8_000, 100, 'partition'), M(n, -1_000, 3_000, 11_000, 3_000, 100, 'partition')]);
  const A = new Accrochage(rdc(m.h.projet));

  it('extrémité avant milieu, face ou axe', () => {
    expect(A.chercher({ x: 10_030, y: 40 }, { rayon: 150 })).toMatchObject({ genre: 'extremite', point: { x: 10_000, y: 0 } });
  });
  it('intersection de deux axes, milieu d’un axe', () => {
    expect(A.chercher({ x: 4_020, y: 2_970 }, { rayon: 100 })).toMatchObject({ genre: 'intersection', point: { x: 4_000, y: 3_000 } });
    expect(A.chercher({ x: 5_010, y: 8_030 }, { rayon: 100 })).toMatchObject({ genre: 'milieu', point: { x: 5_000, y: 8_000 } });
  });
  it('face : le point sur le parement du mur', () => {
    const r = A.chercher({ x: 2_000, y: 120 }, { rayon: 50 });
    expect(r.genre).toBe('face');
    expect(r.point.y).toBeCloseTo(100, 6);
  });
  it('perpendiculaire et alignement depuis le point de départ', () => {
    const perp = A.chercher({ x: 9_960, y: 6_010 }, { rayon: 80, depuis: { x: 2_000, y: 6_000 }, sans: ['face'] });
    expect(perp).toMatchObject({ genre: 'perpendiculaire', point: { x: 10_000, y: 6_000 } });
    const al = A.chercher({ x: 6_000, y: 5_040 }, { rayon: 80, depuis: { x: 2_000, y: 5_000 } });
    expect(al).toMatchObject({ genre: 'alignement', point: { x: 6_000, y: 5_000 } });
  });
  it('grille ; Alt désactive tout ; un genre coupé est ignoré', () => {
    expect(A.chercher({ x: 6_130, y: 5_480 }, { rayon: 300, grille: 250 })).toMatchObject({ genre: 'grille', point: { x: 6_250, y: 5_500 } });
    expect(A.chercher({ x: 10_030, y: 40 }, { rayon: 150, desactive: true })).toEqual({ genre: 'libre', point: { x: 10_030, y: 40 } });
    expect(A.chercher({ x: 10_030, y: 40 }, { rayon: 150, sans: ['extremite'] }).genre).not.toBe('extremite');
  });

  it('2 000 murs : une recherche en moins de 5 ms', () => {
    /* une grille de 40 × 25 cellules : 1 000 murs horizontaux, 1 000 verticaux */
    const g = maison(n => {
      const L: Commande[] = [];
      for (let i = 0; i < 40; i++) for (let j = 0; j < 25; j++) {
        L.push(M(n, i * 3_000, j * 3_000, (i + 1) * 3_000, j * 3_000, 100, 'partition'));
        L.push(M(n, i * 3_000, j * 3_000, i * 3_000, (j + 1) * 3_000, 100, 'partition'));
      }
      return L;
    });
    const f = rdc(g.h.projet);
    expect(Object.keys(f.objects)).toHaveLength(2_000);
    const t0 = performance.now();
    const acc = accrochageDuNiveau(f);
    const construction = performance.now() - t0;
    expect(accrochageDuNiveau(f)).toBe(acc);                  // gardé en cache
    let pire = 0, total = 0;
    for (let k = 0; k < 2_000; k++) {
      const c = { x: (k * 7_919) % 120_000, y: (k * 104_729) % 75_000 };
      const t = performance.now();
      acc.chercher(c, { rayon: 200, depuis: { x: 1_000, y: 1_000 }, grille: 100 });
      const d = performance.now() - t;
      total += d; pire = Math.max(pire, d);
    }
    expect(total / 2_000).toBeLessThan(5);
    expect(pire).toBeLessThan(50);           // même le pire cas (ramasse-miettes compris) reste invisible
    expect(construction).toBeLessThan(5_000);
  });
});

describe('contraintes', () => {
  const contraintes = (m: ReturnType<typeof maison>, ids: string[][], genres: Constraint['kind'][]) =>
    m.faire('Contraintes', genres.map((g, i) => ({ type: 'ajouterContrainte', niveau: m.n, genre: g, murs: ids[i]! })));

  it('rectangle contraint (horizontal / vertical) : tirer un angle garde un rectangle, angles fermés', () => {
    const m = maison(n => boite(n));
    const [S, E, N, O] = [0, 1, 2, 3].map(i => m.mur(i).id);
    contraintes(m, [[S!], [E!], [N!], [O!]], ['horizontal', 'vertical', 'horizontal', 'vertical']);
    m.faire('Tirer', [{ type: 'deplacerSommet', niveau: m.n, de: { x: 10_000, y: 0 }, vers: { x: 12_000, y: 500 } }]);
    const W = m.murs();
    expect(W.map(w => [w.axis.a, w.axis.b])).toEqual([
      [{ x: 0, y: 500 }, { x: 12_000, y: 500 }], [{ x: 12_000, y: 500 }, { x: 12_000, y: 8_000 }],
      [{ x: 12_000, y: 8_000 }, { x: 0, y: 8_000 }], [{ x: 0, y: 8_000 }, { x: 0, y: 500 }]]);
    /* les murs ajustés par le solveur portent leur provenance */
    expect(W[2]!.sourceRefs.at(-1)!.label).toMatch(/Ajusté/);
    expect(m2(planDuNiveau(rdc(m.h.projet)).zones[0]!.aire)).toBe(m2(11_800 * 7_300));
  });

  it('parallèle, perpendiculaire, longueur fixe : vraies après déplacement', () => {
    const m = maison(n => [M(n, 0, 0, 5_000, 0), M(n, 0, 2_000, 5_000, 2_000), M(n, 7_000, 0, 7_000, 4_000)]);
    const [A, B, C] = m.murs().map(w => w.id);
    contraintes(m, [[A!, B!], [A!, C!], [C!]], ['parallel', 'perpendicular', 'length']);
    m.faire('Déplacer B', [{ type: 'deplacerSommet', niveau: m.n, de: { x: 5_000, y: 2_000 }, vers: { x: 5_000, y: 3_000 } }]);
    const [a, b] = [m.mur(0), m.mur(1)];
    expect(pres(b.axis.a.y, 3_000) && pres(b.axis.b.y, 3_000)).toBe(true);
    m.faire('Tourner A', [{ type: 'deplacerSommet', niveau: m.n, de: { x: 5_000, y: 0 }, vers: { x: 5_000, y: 1_000 } }]);
    const W = m.murs();
    const d = (w: typeof a) => ({ x: w.axis.b.x - w.axis.a.x, y: w.axis.b.y - w.axis.a.y });
    const [dA, dB, dC] = W.map(d) as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
    const nA = Math.hypot(dA.x, dA.y);
    expect(Math.abs((dA.x * dB.y - dA.y * dB.x) / nA)).toBeLessThan(0.01);       // parallèles
    expect(Math.abs((dA.x * dC.x + dA.y * dC.y) / nA)).toBeLessThan(0.01);       // perpendiculaires
    expect(pres(Math.hypot(dC.x, dC.y), 4_000)).toBe(true);                       // longueur gardée
  });

  it('angle fixe : tourner le mur est refusé, avec la raison ; rien ne change', () => {
    const m = maison(n => [M(n, 0, 0, 5_000, 0)]);
    const id = m.mur(0).id;
    m.faire('Angle', [{ type: 'ajouterContrainte', niveau: m.n, genre: 'angle', murs: [id] }]);
    const avant = canonique(m.h.projet);
    const r = m.run('Tourner', [{ type: 'deplacerMur', id, b: { x: 5_000, y: 1_000 } }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs.join()).toMatch(/impossible de respecter : angle de 0°/);
    expect(canonique(m.h.projet)).toBe(avant);
  });

  it('contraintes incompatibles (horizontal + vertical) : refusé', () => {
    const m = maison(n => [M(n, 0, 0, 5_000, 1)]);
    const id = m.mur(0).id;
    m.faire('H', [{ type: 'ajouterContrainte', niveau: m.n, genre: 'horizontal', murs: [id] }]);
    expect(m.mur(0).axis.a.y).toBeCloseTo(m.mur(0).axis.b.y, 6);       // le mur à peine penché est redressé
    expect(m.run('V', [{ type: 'ajouterContrainte', niveau: m.n, genre: 'vertical', murs: [id] }]).ok).toBe(false);
    expect(m.run('H encore', [{ type: 'ajouterContrainte', niveau: m.n, genre: 'horizontal', murs: [id] }]).ok).toBe(false);
  });

  it('jonction en T : la cloison suit le mur qu’on déplace, et garde ses pièces', () => {
    const m = maison(n => [...boite(n), M(n, 4_000, 0, 4_000, 8_000, 100, 'partition'),
      { type: 'creerPiece', niveau: n, point: { x: 2_000, y: 4_000 }, nom: 'Séjour', usage: 'living' },
      { type: 'creerPiece', niveau: n, point: { x: 7_000, y: 4_000 }, nom: 'Chambre', usage: 'bedroom' }]);
    const nord = m.murs().find(w => w.axis.a.y === 8_000 && w.axis.b.y === 8_000)!;
    m.faire('Pousser le mur nord', [{ type: 'deplacerMur', id: nord.id, a: { x: 10_000, y: 9_000 }, b: { x: 0, y: 9_000 } }]);
    const cloison = m.murs().find(w => w.role === 'partition')!;
    expect(cloison.axis.b).toEqual({ x: 4_000, y: 9_000 });
    const P = planDuNiveau(rdc(m.h.projet));
    expect(P.zones.map(z => [z.piece?.name, m2(z.aire)]).sort()).toEqual([['Chambre', m2(5_850 * 8_800)], ['Séjour', m2(3_850 * 8_800)]]);
    expect(P.alertes).toEqual([]);
  });

  it('supprimer un mur emporte ses contraintes et ses cotes', () => {
    const m = maison(n => boite(n));
    const S = m.mur(0).id, N = m.mur(2).id;
    m.faire('Contraintes', [{ type: 'ajouterContrainte', niveau: m.n, genre: 'parallel', murs: [S, N] },
      { type: 'creerCote', niveau: m.n, refs: [{ objectId: S, feature: 'axis' }, { objectId: N, feature: 'axis' }], motrice: true }]);
    m.faire('Supprimer', [{ type: 'supprimer', id: N }]);
    expect(Object.values(rdc(m.h.projet).objects).filter(o => o.type === 'constraint' || o.type === 'dimension')).toEqual([]);
  });
});

describe('cotes motrices', () => {
  it('10 → 12 m entre les murs ouest et est : le mur est se déplace vraiment, les pièces suivent', () => {
    const m = maison(n => boite(n));
    const [S, E, , O] = m.murs();
    m.faire('Cote', [{ type: 'creerCote', niveau: m.n, refs: [{ objectId: O!.id, feature: 'axis' }, { objectId: E!.id, feature: 'axis' }], motrice: true }]);
    const cote = Object.values(rdc(m.h.projet).objects).find(o => o.type === 'dimension')!;
    expect(cote).toMatchObject({ driving: true, value: 10_000 });
    const avant = canonique(m.h.projet);
    m.faire('12 m', [{ type: 'modifierCote', id: cote.id, valeur: 12_000 }]);
    const e = m.mur(1);
    expect([e.axis.a, e.axis.b]).toEqual([{ x: 12_000, y: 0 }, { x: 12_000, y: 8_000 }]);
    expect(m.mur(0).axis.b).toEqual({ x: 12_000, y: 0 });
    expect(m2(planDuNiveau(rdc(m.h.projet)).zones[0]!.aire)).toBe(92.04);         // 11,80 × 7,80
    expect(mesurerCote(rdc(m.h.projet), cote.type === 'dimension' ? cote : null!)).toBeCloseTo(12_000, 6);
    /* une cote motrice reste vraie : déplacer le mur ouest entraîne le mur est */
    m.faire('Ouest', [{ type: 'deplacerMur', id: O!.id, a: { x: -1_000, y: 8_000 }, b: { x: -1_000, y: 0 } }]);
    expect(m.mur(1).axis.a.x).toBeCloseTo(11_000, 3);
    expect(S).toBeDefined();
    /* et tout s'annule exactement */
    m.h = annuler(annuler(m.h));
    expect(canonique(m.h.projet)).toBe(avant);
  });

  it('cote d’une extrémité à l’autre d’un mur : la longueur change, l’origine reste', () => {
    const m = maison(n => [M(n, 0, 0, 3_000, 0)]);
    const id = m.mur(0).id;
    m.faire('Cote', [{ type: 'creerCote', niveau: m.n, refs: [{ objectId: id, feature: 'start' }, { objectId: id, feature: 'end' }], motrice: true }]);
    const cote = Object.values(rdc(m.h.projet).objects).find(o => o.type === 'dimension')!;
    m.faire('4,50 m', [{ type: 'modifierCote', id: cote.id, valeur: 4_500 }]);
    expect([m.mur(0).axis.a, m.mur(0).axis.b]).toEqual([{ x: 0, y: 0 }, { x: 4_500, y: 0 }]);
  });

  it('cote de face à face : la valeur se lit entre parements', () => {
    const m = maison(n => boite(n));
    const [, E, , O] = m.murs();
    m.faire('Cote', [{ type: 'creerCote', niveau: m.n, refs: [{ objectId: O!.id, feature: 'face_left' }, { objectId: E!.id, feature: 'face_left' }] },
      { type: 'creerCote', niveau: m.n, refs: [{ objectId: O!.id, feature: 'face_right' }, { objectId: E!.id, feature: 'face_right' }] }]);
    const [int, ext] = Object.values(rdc(m.h.projet).objects).filter(o => o.type === 'dimension');
    /* murs tracés dans le sens trigonométrique : la face gauche est
       l'intérieur (10 m − 2 × 10 cm), la face droite l'extérieur */
    expect(mesurerCote(rdc(m.h.projet), int as never)).toBeCloseTo(9_800, 6);
    expect(mesurerCote(rdc(m.h.projet), ext as never)).toBeCloseTo(10_200, 6);
  });

  it('une cote non motrice ne pilote rien ; une cote entre murs non parallèles est refusée', () => {
    const m = maison(n => [...boite(n), M(n, 2_000, 2_000, 4_000, 5_000, 100, 'partition')]);
    const [S, , , O, X] = m.murs();
    m.faire('Cote', [{ type: 'creerCote', niveau: m.n, refs: [{ objectId: O!.id, feature: 'axis' }, { objectId: S!.id, feature: 'start' }] }]);
    const cote = Object.values(rdc(m.h.projet).objects).find(o => o.type === 'dimension')!;
    expect(m.run('Valeur', [{ type: 'modifierCote', id: cote.id, valeur: 5_000 }]).ok).toBe(false);
    expect(m.run('Biais', [{ type: 'creerCote', niveau: m.n, refs: [{ objectId: S!.id, feature: 'axis' }, { objectId: X!.id, feature: 'axis' }] }]).ok).toBe(false);
  });
});

describe('niveaux', () => {
  it('ajouter, modifier (altitude, hauteur, nom), supprimer ; jamais le dernier ; annuler rend le niveau intact', () => {
    const m = maison(n => boite(n));
    const b = m.h.projet.buildings[0]!.id;
    m.faire('Étage', [{ type: 'ajouterNiveau', batiment: b, nom: 'Étage', altitude: 2_800, hauteur: 2_500 }]);
    const etage = m.h.projet.buildings[0]!.floors[1]!;
    m.faire('Murs étage', boite(etage.id));
    m.faire('Modifier', [{ type: 'modifierNiveau', id: etage.id, nom: 'R+1', altitude: 2_900, hauteur: 2_450 }]);
    expect(m.h.projet.buildings[0]!.floors[1]).toMatchObject({ name: 'R+1', elevation: 2_900, height: 2_450 });
    expect(m.run('Hauteur nulle', [{ type: 'modifierNiveau', id: etage.id, hauteur: 0 }]).ok).toBe(false);
    const avant = canonique(m.h.projet);
    m.faire('Supprimer', [{ type: 'supprimerNiveau', id: etage.id }]);
    expect(m.h.projet.buildings[0]!.floors).toHaveLength(1);
    expect(m.run('Le dernier', [{ type: 'supprimerNiveau', id: m.n }]).ok).toBe(false);
    m.h = annuler(m.h);
    expect(canonique(m.h.projet)).toBe(avant);
  });
});

describe('fond calé', () => {
  it('caler par deux points, puis par une distance ; verrouillé, il ne bouge plus', () => {
    const m = maison(n => boite(n));
    m.faire('Fond', [{ type: 'ajouterFond', niveau: m.n, fichier: 'fond-fictif', nom: 'plan-fictif.pdf', page: 1 }]);
    const u = () => Object.values(rdc(m.h.projet).objects).find(o => o.type === 'underlay')!;
    /* 1 000 px de l'image = les 10 m du mur sud ; l'image a son v vers le bas */
    m.faire('Caler', [{ type: 'calerFond', id: u().id, image: [{ x: 100, y: 900 }, { x: 1_100, y: 900 }], plan: [{ x: 0, y: 0 }, { x: 10_000, y: 0 }] }]);
    const t = u().type === 'underlay' ? (u() as { transform: Parameters<typeof imageVersPlan>[0] }).transform : null!;
    expect(t.scale).toBeCloseTo(10, 9);
    const haut = imageVersPlan(t, { x: 100, y: 100 });            // 800 px plus HAUT sur l'image
    expect(haut.x).toBeCloseTo(0, 6); expect(haut.y).toBeCloseTo(8_000, 6);
    m.faire('Distance', [{ type: 'calerFond', id: u().id, image: [{ x: 100, y: 900 }, { x: 1_100, y: 900 }], distance: 12_000 }]);
    expect((u() as { transform: { scale: number } }).transform.scale).toBeCloseTo(12, 9);
    m.faire('Verrouiller', [{ type: 'modifierFond', id: u().id, verrouille: true, opacite: 0.3 }]);
    expect(m.run('Recaler', [{ type: 'calerFond', id: u().id, image: [{ x: 0, y: 0 }, { x: 1, y: 0 }], distance: 1 }]).ok).toBe(false);
    expect(m.run('Retirer', [{ type: 'supprimer', id: u().id }]).ok).toBe(false);
    expect(m.run('Opacité', [{ type: 'modifierFond', id: u().id, opacite: 2 }]).ok).toBe(false);
  });

  it('calage tourné : image → plan → image revient au même point', () => {
    const t = calage([{ x: 10, y: 20 }, { x: 410, y: 320 }], [{ x: 1_000, y: 2_000 }, { x: 1_000, y: 7_000 }]);
    if (typeof t === 'string') throw new Error(t);
    for (const p of [{ x: 0, y: 0 }, { x: 333, y: -50 }, { x: 1_234, y: 987 }]) {
      const q = planVersImage(t, imageVersPlan(t, p));
      expect(q.x).toBeCloseTo(p.x, 6); expect(q.y).toBeCloseTo(p.y, 6);
    }
    expect(calage([{ x: 1, y: 1 }, { x: 1, y: 1 }], [{ x: 0, y: 0 }, { x: 1, y: 0 }])).toMatch(/confondus/);
  });
});

describe('journal : un ChangeSet relu du JSON s’annule exactement', () => {
  it('cote rendue motrice puis non motrice, sens d’une porte ajouté : la valeur absente reste absente', () => {
    const m = maison(n => boite(n));
    const [S, , N] = m.murs();
    const depart = m.h.projet;
    m.faire('Cote', [{ type: 'creerCote', niveau: m.n, refs: [{ objectId: S!.id, feature: 'axis' }, { objectId: N!.id, feature: 'axis' }] }]);
    const cote = Object.values(rdc(m.h.projet).objects).find(o => o.type === 'dimension')!;
    m.faire('Motrice', [{ type: 'modifierCote', id: cote.id, motrice: true }]);
    m.faire('Libre', [{ type: 'modifierCote', id: cote.id, motrice: false }]);
    m.faire('Porte', [{ type: 'creerOuverture', mur: S!.id, position: 2_000, largeur: 900, hauteur: 2_150, genre: 'door' }]);
    const porte = Object.values(rdc(m.h.projet).objects).find(o => o.type === 'opening')!;
    m.faire('Sens', [{ type: 'modifierOuverture', id: porte.id, sens: { side: 'left', inward: true } }]);
    const journal = JSON.parse(JSON.stringify(m.h.passe.slice(1))) as ChangeSet[];
    const fin = journal.reduce((p, cs) => appliquerTout(p, cs.operations), depart);
    expect(canonique(fin)).toBe(canonique(m.h.projet));
    const retour = [...journal].reverse().reduce((p, cs) => appliquerTout(p, inverser(cs.operations)), fin);
    expect(canonique(retour)).toBe(canonique(depart));
  });
});
