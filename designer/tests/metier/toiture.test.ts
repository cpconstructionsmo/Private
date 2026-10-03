/* La toiture calculée depuis les murs : croupes (recoupées avec l'atelier,
   atelier/toiture.py, sur les mêmes plans fictifs), deux pans à pignons, un
   pan, toit-terrasse ; refus motivés ; la toiture suit les murs. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Floor, type Project, type Roof } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { mursDroits, toitureDuNiveau, type Toiture } from '../../src/building';
import * as toitureExports from '../../src/building/toiture';
import { aire } from '../../src/geometry';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const rdc = (p: Project): Floor => p.buildings[0]!.floors[0]!;
/* murs tracés par leur nu extérieur (contour dans le sens trigonométrique, épaisseur vers l'intérieur), 3 m de haut */
const contour = (n: string, P: [number, number][]): Commande[] => P.map((p, i) => {
  const q = P[(i + 1) % P.length]!;
  return { type: 'creerMur', niveau: n, a: { x: p[0], y: p[1] }, b: { x: q[0], y: q[1] }, epaisseur: 200, role: 'exterior', justification: 'right', hauteur: 3_000 };
});
const RECT: [number, number][] = [[0, 0], [10_000, 0], [10_000, 8_000], [0, 8_000]];
const EN_L: [number, number][] = [[0, 0], [10_000, 0], [10_000, 5_000], [6_000, 5_000], [6_000, 8_000], [0, 8_000]];

function maison(P: [number, number][], toit: Partial<Extract<Commande, { type: 'creerToiture' }>> = {}) {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = rdc(p).id;
  let h = ok(executer(nouvelHistorique(p), 'Murs', contour(n, P), a));
  h = ok(executer(h, 'Toiture', [{ type: 'creerToiture', niveau: n, genre: 'hip', pente: 45, debord: 500, couverture: 'tile', ...toit }], a));
  return { h, a, n };
}
const toiture = (h: Historique): Toiture => { const r = toitureDuNiveau(rdc(h.projet)); if (!r?.ok) throw new Error(r ? r.raison : 'pas de toiture'); return r.toitures[0]! };
const m2 = (v: number) => Math.round(v / 1e6 * 1e4) / 1e4;
const z = (p: Toiture['pans'][number], x: number, y: number) => p.plan.a * x + p.plan.b * y + p.plan.c;

describe('toiture à croupes', () => {
  it('rectangle 10 × 8, débord 0,50, 45° : 4 pans, faîtage de 2 m à 7,00 (comme l’atelier)', () => {
    const t = toiture(maison(RECT).h);
    expect(t.pans).toHaveLength(4);
    expect(t.pans.map(p => m2(aire({ contour: p.contour }))).sort((a, b) => a - b)).toEqual([20.25, 20.25, 29.25, 29.25]);
    expect(t.hautMurs).toBe(3_000);
    expect(t.egoutZ).toBeCloseTo(2_500, 6);
    expect(t.faitage).toBeCloseTo(7_000, 6);
    expect(m2(t.surfaceCouverture)).toBeCloseTo(99 * Math.SQRT2, 3);
    /* chaque pan passe par le haut des murs au nu extérieur, et par l'égout au bord du débord */
    const sud = t.pans.find(p => p.contour.every(q => q.y <= 4_000 + 1e-6))!;
    expect(z(sud, 5_000, 0)).toBeCloseTo(3_000, 6);
    expect(z(sud, 5_000, -500)).toBeCloseTo(2_500, 6);
    expect(t.pignons).toHaveLength(0);
  });

  it('plan en L : 6 pans, faîtages à 6,00 et 5,50 — les mêmes surfaces que l’atelier', () => {
    const t = toiture(maison(EN_L).h);
    expect(t.pans.map(p => m2(aire({ contour: p.contour }))).sort((a, b) => a - b)).toEqual([9, 10.25, 12, 12.25, 19.25, 24.25]);
    expect(t.faitage).toBeCloseTo(6_000, 6);
    /* égout à 2,50 partout ; les deux faîtages (6,00 sur le corps, 5,50 sur l'aile) */
    const hauteurs = new Set(t.pans.flatMap(p => p.contour.map(q => Math.round(z(p, q.x, q.y)))));
    expect(Math.min(...hauteurs)).toBe(2_500);
    expect(Math.max(...hauteurs)).toBe(6_000);
    expect(hauteurs.has(5_500)).toBe(true);
  });

  it('plan tourné de 30° : mêmes pans, même faîtage (la toiture suit le repère du plan)', () => {
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
    const t = toiture(maison(EN_L.map(([x, y]) => [x * c - y * s, x * s + y * c] as [number, number])).h);
    const S = t.pans.map(p => m2(aire({ contour: p.contour }))).sort((a, b) => a - b);
    [9, 10.25, 12, 12.25, 19.25, 24.25].forEach((v, i) => expect(S[i]).toBeCloseTo(v, 2));     // au centième de m² (grille des entiers)
    expect(t.faitage).toBeCloseTo(6_000, 1);                                                // au dixième de mm
  });

  it('plan non orthogonal : refusé, avec sa raison', () => {
    const { h } = maison([[0, 0], [10_000, 0], [8_000, 6_000], [0, 6_000]]);
    const r = toitureDuNiveau(rdc(h.projet));
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.raison).toMatch(/non orthogonal/);
  });
});

describe('deux pans, un pan, toit-terrasse', () => {
  it('deux pans : faîtage le long du grand côté, deux pignons triangulaires', () => {
    const t = toiture(maison(RECT, { genre: 'gable' }).h);
    expect(t.pans).toHaveLength(2);
    expect(t.faitage).toBeCloseTo(3_000 + 4_000, 6);
    expect(t.pignons).toHaveLength(2);
    const sommets = t.pignons[0]!.points.map(q => q.z).sort((a, b) => a - b);
    expect(sommets).toEqual([3_000, 3_000, 7_000]);
    /* faîtage le long du petit côté : la ligne de faîte à x = 5 m, plus haute */
    const t2 = toiture(maison(RECT, { genre: 'gable', faitage: 'short' }).h);
    expect(t2.faitage).toBeCloseTo(3_000 + 5_000, 6);
  });

  it('un pan : bas d’un côté, haut de l’autre ; « inversé » échange les côtés ; trois pignons', () => {
    const t = toiture(maison(RECT, { genre: 'shed', pente: 10 }).h);
    expect(t.pans).toHaveLength(1);
    const p = t.pans[0]!, tg = Math.tan(10 * Math.PI / 180);
    expect(z(p, 5_000, 0)).toBeCloseTo(3_000, 6);
    expect(z(p, 5_000, 8_000)).toBeCloseTo(3_000 + 8_000 * tg, 6);
    expect(t.pignons).toHaveLength(3);
    const ti = toiture(maison(RECT, { genre: 'shed', pente: 10, inverse: true }).h);
    expect(z(ti.pans[0]!, 5_000, 8_000)).toBeCloseTo(3_000, 6);
  });

  it('deux pans sur un plan en L : un pignon au bout de chaque aile, faîtages à la mi-largeur, noue dans l’angle', () => {
    /* aile basse 10 × 5 (pignon à l'est), aile gauche 6 × 8 (pignon au nord) ; débord 0,50, 45° */
    const t = toiture(maison(EN_L, { genre: 'gable' }).h);
    expect(t.pignons).toHaveLength(2);
    const sommet = (g: Toiture['pignons'][number]) => g.points.reduce((m, q) => (q.z > m.z ? q : m));
    const est = t.pignons.find(g => g.points.every(q => Math.abs(q.x - 10_000) < 1e-6))!, nord = t.pignons.find(g => g.points.every(q => Math.abs(q.y - 8_000) < 1e-6))!;
    expect(sommet(est)).toMatchObject({ y: 2_500 }); expect(sommet(est).z).toBeCloseTo(3_000 + 2_500, 6);
    expect(sommet(nord)).toMatchObject({ x: 3_000 }); expect(sommet(nord).z).toBeCloseTo(3_000 + 3_000, 6);
    expect(t.faitage).toBeCloseTo(6_000, 6);
    /* pas de pan sur les pignons : les pans s'appuient sur les quatre autres égouts */
    expect(t.pans.length).toBeGreaterThanOrEqual(4);
    for (const p of t.pans) for (const q of p.contour) expect(z(p, q.x, q.y)).toBeGreaterThanOrEqual(2_500 - 1e-6);
    /* la surface couverte : tout l'égout, rampants compris */
    expect(m2(t.pans.reduce((s, p) => s + aire({ contour: p.contour }), 0))).toBeCloseTo(11 * 6 + 7 * 3, 3);                // égout 11 × 6 + 7 × 3 : tout est couvert
  });

  it('bouts d’aile : un rectangle a ses deux petits côtés ; un carré n’en a aucun (refus, croupes proposées)', () => {
    const { boutsDAile } = toitureExports;
    expect(boutsDAile([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }])).toEqual([false, true, false, true]);
    expect(boutsDAile([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }])).toEqual([false, false, false, false]);
    const r = toitureDuNiveau(rdc(maison([[0, 0], [8_000, 0], [8_000, 5_000], [5_000, 5_000], [5_000, 8_000], [0, 8_000]], { genre: 'gable', debord: 0 }).h.projet));
    expect(r?.ok).toBe(true);
  });

  it('toit-terrasse : dalle sur le haut des murs, acrotère tout autour', () => {
    const t = toiture(maison(EN_L, { genre: 'flat', pente: 0, debord: 0 }).h);
    expect(t.terrasse!.z0).toBe(3_000);
    expect(m2(aire({ contour: t.terrasse!.dalle }))).toBe(68);
    expect(t.terrasse!.acrotere).toHaveLength(1);
    expect(t.faitage).toBe(3_000 + 250 + 400);
  });
});

describe('commandes de toiture', () => {
  it('une seule toiture par niveau ; pente et débord contrôlés ; annuler rend le modèle', () => {
    const { h, a, n } = maison(RECT);
    expect(executer(h, 'x', [{ type: 'creerToiture', niveau: n, genre: 'hip', pente: 30, debord: 0, couverture: 'tile' }], a).ok).toBe(false);
    const r = Object.values(rdc(h.projet).objects).find(o => o.type === 'roof') as Roof;
    expect(executer(h, 'x', [{ type: 'modifierToiture', id: r.id, pente: 80 }], a)).toMatchObject({ ok: false, erreurs: ['pente de 5 à 75°'] });
    expect(executer(h, 'x', [{ type: 'modifierToiture', id: r.id, debord: 3_000 }], a).ok).toBe(false);
    const h2 = ok(executer(h, 'Deux pans', [{ type: 'modifierToiture', id: r.id, genre: 'gable', faitage: 'short' }], a));
    expect(rdc(h2.projet).objects[r.id]).toMatchObject({ kind: 'gable', ridge: 'short' });
    expect(annuler(h2).projet).toEqual(h.projet);
  });

  it('la toiture suit les murs : agrandir la maison agrandit le toit', () => {
    const { h, a, n } = maison(RECT);
    const est = mursDroits(rdc(h.projet)).find(w => w.axis.a.x === 10_000 && w.axis.b.x === 10_000)!;
    const h2 = ok(executer(h, 'Pousser le mur est', [{ type: 'deplacerMur', id: est.id, a: { x: 12_000, y: 0 }, b: { x: 12_000, y: 8_000 } }], a));
    expect(toiture(h2).egout.map(q => q.x).reduce((m, x) => Math.max(m, x), -Infinity)).toBeCloseTo(12_500, 3);
    void n;
  });
});
