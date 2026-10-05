/* L'équerre : un plan repris à la souris (ou par-dessus un fond) dévie de
   quelques dixièmes de degré. Au tracé, la direction d'un mur s'aimante à
   90° ; après coup, « Mettre d'équerre » redresse les murs presque d'équerre
   (angles fermés, cloisons en T sur leur face, pans coupés laissés biais,
   ouvertures gardées) et s'annule d'un Ctrl+Z. Plans fictifs uniquement. */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { creerProjet, generateurSequentiel, type Floor, type Point, type Project, type Wall } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { directionDEquerre, equerrer, orientationDesMurs, planDuNiveau, mursDroits, type MurDroit } from '../../src/building';
import { Outils, type Effet } from '../../src/ui/outils';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 5) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
type MurD = Wall & { axis: { a: Point; b: Point } };
const murs = (p: Project): MurD[] => Object.values(p.buildings[0]!.floors[0]!.objects).filter((o): o is MurD => o.type === 'wall' && 'a' in o.axis);
const droit = (w: MurD) => w.axis.a.x === w.axis.b.x || w.axis.a.y === w.axis.b.y;
const deg = (d: number) => (d * Math.PI) / 180;

/** un projet fait de murs (contour fermé, cloisons…) tracés aux points donnés */
function projet(contour: Point[], autres: { a: Point; b: Point; epaisseur?: number }[] = []): { h: Historique; a: Acteur; niveau: string } {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') }), niveau = p.buildings[0]!.floors[0]!.id;
  const cmds: Commande[] = contour.map((q, i) => ({ type: 'creerMur', niveau, a: q, b: contour[(i + 1) % contour.length]!, epaisseur: 200, role: 'exterior' }));
  for (const m of autres) cmds.push({ type: 'creerMur', niveau, a: m.a, b: m.b, epaisseur: m.epaisseur ?? 70, role: 'partition' });
  const r = executer(nouvelHistorique(p), 'Plan', cmds, a);
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  return { h: r.historique, a, niveau };
}
/** le point du mur a → b à la fraction t, décalé de d vers sa gauche */
const surMur = (a: Point, b: Point, t: number, d: number): Point => {
  const L = Math.hypot(b.x - a.x, b.y - a.y), n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
  return { x: a.x + t * (b.x - a.x) + d * n.x, y: a.y + t * (b.y - a.y) + d * n.y };
};

describe('la direction d’équerre (tracé)', () => {
  it('à moins de 8° d’un angle droit : la direction exacte ; au-delà, libre ; dans un repère tourné, celui du repère', () => {
    expect(directionDEquerre({ x: 0, y: 0 }, { x: 4_000, y: 120 })).toEqual({ x: 1, y: 0 });
    expect(directionDEquerre({ x: 0, y: 0 }, { x: -90, y: -3_000 })).toEqual({ x: 0, y: -1 });
    expect(directionDEquerre({ x: 0, y: 0 }, { x: 4_000, y: 800 })).toBeNull();          // 11° : un mur biais voulu
    const u = directionDEquerre({ x: 0, y: 0 }, { x: Math.cos(deg(23)), y: Math.sin(deg(23)) }, deg(20))!;
    expect(Math.atan2(u.y, u.x)).toBeCloseTo(deg(20), 12);
  });

  it('le repère : la moyenne des murs (pans coupés écartés), ramenée aux axes du plan ou au fond calé s’ils sont proches', () => {
    const mur = (a: Point, b: Point) => ({ id: String(a.x) + b.y, axis: { a, b } }) as MurDroit;
    const rect = (t: number) => [[0, 0], [10_000, 0], [10_000, 8_000], [0, 8_000]].map(([x, y]) => ({ x: x! * Math.cos(t) - y! * Math.sin(t), y: x! * Math.sin(t) + y! * Math.cos(t) }));
    const M = (t: number) => rect(t).map((q, i, R) => mur(q, R[(i + 1) % 4]!));
    expect(orientationDesMurs(M(deg(0.4)))).toBe(0);
    expect(orientationDesMurs(M(deg(1.8)), [0, deg(2)])).toBe(deg(2));              // le fond calé, tourné de 2°
    expect(orientationDesMurs([...M(deg(25)), mur({ x: 0, y: 0 }, { x: 3_000, y: 3_000 })])).toBeCloseTo(deg(25), 9);
  });
});

describe('mettre d’équerre un plan repris à la main', () => {
  /* un contour de 12 × 8 m dont les angles ont glissé de quelques centimètres, une cloison en T posée sur les faces intérieures */
  const C = [{ x: 0, y: 0 }, { x: 12_003, y: -21 }, { x: 12_040, y: 8_010 }, { x: -15, y: 7_985 }];
  const cloison = { a: surMur(C[0]!, C[1]!, 0.4, 100), b: surMur(C[2]!, C[3]!, 0.6, 100) };

  it('les murs deviennent exactement horizontaux ou verticaux, angles fermés, la cloison suit sur ses faces', () => {
    const { h, a, niveau } = projet(C, [cloison]);
    const sud = murs(h.projet)[0]!;
    const op = executer(h, 'Fenêtre', [{ type: 'creerOuverture', mur: sud.id, position: 3_000, largeur: 1_200, hauteur: 1_250, allege: 900, genre: 'window' }], a);
    if (!op.ok) throw new Error(op.erreurs.join());
    const avant = op.historique.projet;
    const r = executer(op.historique, 'Équerre', [{ type: 'equerrerMurs', niveau }], a);
    if (!r.ok) throw new Error(r.erreurs.join(' ; '));
    const W = murs(r.historique.projet);
    expect(W.every(droit)).toBe(true);
    /* le contour reste fermé : chaque mur part où finit le précédent */
    for (let i = 0; i < 4; i++) expect(W[i]!.axis.b).toEqual(W[(i + 1) % 4]!.axis.a);
    /* chaque coordonnée prend la moyenne (au mm) : 12 003 et 12 040 → 12 022 ; −21 et 0 → −10 (sud, −10,5 arrondi) */
    expect(W[1]!.axis.a.x).toBe(12_022);
    expect(W[0]!.axis.a.y).toBe(-10);
    /* la cloison : verticale, ses bouts sur les faces intérieures (à 10 cm des axes) */
    const k = W[4]!;
    expect(k.axis.a.x).toBe(k.axis.b.x);
    expect(k.axis.a.y).toBe(W[0]!.axis.a.y + 100);
    expect(k.axis.b.y).toBe(W[2]!.axis.a.y - 100);
    /* rien n'a beaucoup bougé ; la fenêtre est toujours là, deux pièces toujours */
    const avantM = murs(avant);
    W.forEach((w, i) => { for (const e of ['a', 'b'] as const) expect(Math.hypot(w.axis[e].x - avantM[i]!.axis[e].x, w.axis[e].y - avantM[i]!.axis[e].y)).toBeLessThan(40) });
    expect(Object.values(r.historique.projet.buildings[0]!.floors[0]!.objects).filter(o => o.type === 'opening')).toHaveLength(1);
    expect(planDuNiveau(r.historique.projet.buildings[0]!.floors[0]!).zones).toHaveLength(2);
    expect(planDuNiveau(avant.buildings[0]!.floors[0]!).zones).toHaveLength(2);
    /* une seconde fois : rien à faire ; Ctrl+Z : le plan d'origine, à l'identique */
    const encore = executer(r.historique, 'Équerre', [{ type: 'equerrerMurs', niveau }], a);
    expect(encore.ok ? '' : encore.erreurs.join()).toMatch(/déjà d’équerre/);
    expect(murs(annuler(r.historique).projet).map(w => w.axis)).toEqual(avantM.map(w => w.axis));
  });

  it('un pan coupé (45°) reste biais : il suit ses deux bouts ; les autres murs sont redressés', () => {
    const { h, niveau, a } = projet([{ x: 0, y: 0 }, { x: 10_010, y: 15 }, { x: 10_000, y: 6_000 }, { x: 8_000, y: 8_004 }, { x: -12, y: 7_990 }]);
    const r = executer(h, 'Équerre', [{ type: 'equerrerMurs', niveau }], a);
    if (!r.ok) throw new Error(r.erreurs.join(' ; '));
    const W = murs(r.historique.projet);
    expect(W.filter(droit)).toHaveLength(4);
    const pan = W[2]!, ang = Math.atan2(pan.axis.b.y - pan.axis.a.y, pan.axis.b.x - pan.axis.a.x) * 180 / Math.PI;
    expect(ang).toBeGreaterThan(130); expect(ang).toBeLessThan(140);
    expect(pan.axis.a).toEqual(W[1]!.axis.b); expect(pan.axis.b).toEqual(W[3]!.axis.a);
  });

  it('une maison tournée de 25° sur le plan : redressée dans son propre repère', () => {
    const t = deg(25), R = (x: number, y: number) => ({ x: Math.round(x * Math.cos(t) - y * Math.sin(t)), y: Math.round(x * Math.sin(t) + y * Math.cos(t)) });
    const { h, niveau } = projet([R(0, 0), R(11_000, 60), R(10_950, 9_000), R(-40, 8_960)]);
    const e = equerrer(h.projet.buildings[0]!.floors[0]!);
    expect(e.orientation).toBeCloseTo(t, 2);
    expect(e.redresses).toHaveLength(4);
    const W = mursDroits(h.projet.buildings[0]!.floors[0]!).map(w => e.axes[w.id]!);
    for (let i = 0; i < 4; i++) {
      const u = W[i]!, v = W[(i + 1) % 4]!;
      const du = { x: u.b.x - u.a.x, y: u.b.y - u.a.y }, dv = { x: v.b.x - v.a.x, y: v.b.y - v.a.y };
      expect(Math.abs(du.x * dv.x + du.y * dv.y) / (Math.hypot(du.x, du.y) * Math.hypot(dv.x, dv.y))).toBeLessThan(1e-6);
      expect(u.b).toEqual(v.a);
    }
    expect(niveau).toBeTruthy();
  });

  it('un seul mur choisi : lui seul est redressé, dans le repère du niveau', () => {
    const { h, niveau, a } = projet([{ x: 0, y: 0 }, { x: 10_000, y: 0 }, { x: 10_000, y: 8_000 }, { x: 0, y: 8_000 }], [{ a: { x: 4_000, y: 100 }, b: { x: 4_090, y: 7_900 } }]);
    const k = murs(h.projet)[4]!;
    const r = executer(h, 'Équerre', [{ type: 'equerrerMurs', niveau, murs: [k.id] }], a);
    if (!r.ok) throw new Error(r.erreurs.join(' ; '));
    const W = murs(r.historique.projet);
    expect(W[4]!.axis).toEqual({ a: { x: 4_045, y: 100 }, b: { x: 4_045, y: 7_900 } });
    expect(W.slice(0, 4).map(w => w.axis)).toEqual(murs(h.projet).slice(0, 4).map(w => w.axis));
  });

  it('propriété : un plan orthogonal dont chaque angle a glissé (± 3 cm) redevient d’équerre, fermé, sans s’écarter de plus de 6 cm', () => {
    fc.assert(fc.property(
      fc.array(fc.integer({ min: 2, max: 9 }), { minLength: 4, maxLength: 4 }), fc.boolean(),
      fc.array(fc.tuple(fc.integer({ min: -30, max: 30 }), fc.integer({ min: -30, max: 30 })), { minLength: 6, maxLength: 6 }),
      ([l1, l2, l3, l4], encoche, bruit) => {
        /* un rectangle, ou un L (une encoche au coin nord-est) */
        const X = (l1! + l3!) * 1_000, Y = (l2! + l4!) * 1_000;
        const ideal = encoche ? [{ x: 0, y: 0 }, { x: X, y: 0 }, { x: X, y: l2! * 1_000 }, { x: l1! * 1_000, y: l2! * 1_000 }, { x: l1! * 1_000, y: Y }, { x: 0, y: Y }]
          : [{ x: 0, y: 0 }, { x: X, y: 0 }, { x: X, y: Y }, { x: 0, y: Y }];
        const C = ideal.map((q, i) => ({ x: q.x + bruit[i]![0], y: q.y + bruit[i]![1] }));
        const { h } = projet(C);
        const f: Floor = h.projet.buildings[0]!.floors[0]!;
        const e = equerrer(f);
        const W = mursDroits(f).map(w => e.axes[w.id] ?? w.axis);
        expect(W.every(w => w.a.x === w.b.x || w.a.y === w.b.y)).toBe(true);
        for (let i = 0; i < W.length; i++) {
          expect(W[i]!.b).toEqual(W[(i + 1) % W.length]!.a);
          expect(Math.hypot(W[i]!.a.x - C[i]!.x, W[i]!.a.y - C[i]!.y)).toBeLessThanOrEqual(60);
        }
      }), { numRuns: 200 });
  });
});

describe('le tracé à l’équerre (outil Mur)', () => {
  function banc() {
    const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
    let h: Historique = nouvelHistorique(p);
    const niveau = p.buildings[0]!.floors[0]!.id;
    const outils = new Outils(() => ({ projet: h.projet, niveau, selection: null }));
    const appliquer = (e: Effet) => { if (e.commandes) { const r = executer(h, e.commandes.titre, e.commandes.liste, a); if (r.ok) h = r.historique } return e };
    const g = (x: number, y: number, o: { alt?: boolean } = {}) => ({ point: { x, y }, rayon: 150, ...o });
    return {
      outils, get h() { return h },
      clic: (x: number, y: number, o?: { alt?: boolean }) => { const e = appliquer(outils.bouger(g(x, y, o))); appliquer(outils.appuyer(g(x, y, o))); return e },
    };
  }
  type BancMur = ReturnType<typeof banc>;
  const axes = (b: BancMur) => murs(b.h.projet).map(w => w.axis);

  it('à main levée, chaque mur tombe à 90° (au millimètre) ; Alt : libre ; Q coupe l’équerre', () => {
    const b = banc();
    b.outils.choisir('mur');
    b.clic(0, 0);
    const e = b.clic(5_000, 180);                                  // 2° de travers
    expect(e.accroche?.genre).toBe('equerre');
    b.clic(5_110, 4_000);
    b.clic(-60, 4_150);
    expect(axes(b)).toEqual([{ a: { x: 0, y: 0 }, b: { x: 5_000, y: 0 } }, { a: { x: 5_000, y: 0 }, b: { x: 5_000, y: 4_000 } }, { a: { x: 5_000, y: 4_000 }, b: { x: -60, y: 4_000 } }]);
    b.clic(-500, 6_000, { alt: true });
    expect(axes(b)[3]!.b).toEqual({ x: -500, y: 6_000 });
    b.outils.basculerEquerre(false);
    b.clic(1_000, 6_400);
    expect(axes(b)[4]!.b).toEqual({ x: 1_000, y: 6_400 });
  });

  it('vers un mur : la cloison s’arrête d’équerre sur sa face ; une extrémité visée l’emporte', () => {
    const b = banc();
    b.outils.choisir('mur');
    b.clic(0, 0); b.clic(10_000, 0);
    b.outils.choisir('cloison');
    b.clic(3_000, 5_000);
    const e = b.clic(3_200, 130);                                   // sur la face nord du mur (y = 100), 2° de travers
    expect(e.accroche?.genre).toBe('face');
    expect(axes(b)[1]).toEqual({ a: { x: 3_000, y: 5_000 }, b: { x: 3_000, y: 100 } });
    /* arrivée sur un mur, la cloison est finie ; la suivante part de (9 800, 5 000) */
    b.clic(9_800, 5_000);
    b.clic(9_990, 10);                                              // l'extrémité du mur est visée : elle compte plus que l'équerre
    expect(axes(b)[2]!.b).toEqual({ x: 10_000, y: 0 });
  });
});
