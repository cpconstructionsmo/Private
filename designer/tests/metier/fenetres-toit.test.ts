/* Les fenêtres de toit : posées sur un pan de la toiture du niveau qui la
   porte (outil H), dans la pente ; refusées hors toiture, hors pan ou à
   cheval sur un bord ; en 3D (dormant et vitrage sur la couverture), au plan
   de toiture (PCMI 5), dans la notice et le DXF. Sur le modèle fictif de
   plain-pied (13 × 9 m, toiture à croupes à 35°). */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Project } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Historique } from '../../src/engine';
import { MODELES_MAISONS } from '../../src/catalogue/modeles-maisons';
import { geometrieFenetreToit, fenetresDeToit } from '../../src/building';
import { maquette, CHASSIS_TOIT } from '../../src/vue3d/maquette';
import { notice } from '../../src/export/notice';
import { planchesPdf } from '../../src/export/planche';
import { dxfNiveau } from '../../src/export/dxf';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const refus = (r: ReturnType<typeof executer>): string => (r.ok ? '' : r.erreurs.join(' ; '));
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');

function maison() {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const b = p.buildings[0]!, n = b.floors[0]!.id, md = MODELES_MAISONS.find(m => m.id === 'plain-pied-t4')!;
  const h = ok(executer(nouvelHistorique(p), 'Modèle', md.commandes({ batiment: b.id, niveau: n, id: generateurSequentiel('m') }), a));
  return { h, a, n };
}
const rdc = (P: Project) => P.buildings[0]!.floors[0]!;
/* au-dessus de la chambre 1, sur le pan nord (la maison va de y = 0 à 9 000) */
const CENTRE = { x: 8_000, y: 7_200 };

describe('fenêtres de toit', () => {
  it('posée sur le pan nord à 35° : châssis de 78 × 98 par défaut, raccourci en plan par la pente, coins dans le plan du pan', () => {
    const { h, a, n } = maison();
    const P = ok(executer(h, 'x', [{ type: 'creerFenetreToit', niveau: n, centre: CENTRE }], a)).projet;
    const [w] = fenetresDeToit(rdc(P));
    expect([w!.o.width, w!.o.height]).toEqual([780, 980]);
    const g = w!.geo;
    expect(g.pente).toBeCloseTo(35, 6);
    /* sur le pan nord, la pente monte vers le sud (vers le faîtage) */
    expect(g.montee.x).toBeCloseTo(0, 9); expect(g.montee.y).toBeCloseTo(-1, 9);
    const L = (i: number, j: number) => Math.hypot(g.coins[j]!.x - g.coins[i]!.x, g.coins[j]!.y - g.coins[i]!.y, g.coins[j]!.z - g.coins[i]!.z);
    expect(L(0, 1)).toBeCloseTo(780, 6);                          // la largeur, horizontale
    expect(L(0, 3)).toBeCloseTo(980, 6);                          // la hauteur, dans la pente
    expect(Math.hypot(g.plan[3]!.x - g.plan[0]!.x, g.plan[3]!.y - g.plan[0]!.y)).toBeCloseTo(980 * Math.cos(35 * Math.PI / 180), 6);
    for (const c of g.coins) expect(c.z).toBeCloseTo(g.pan.plan.a * c.x + g.pan.plan.b * c.y + g.pan.plan.c, 6);
    /* le haut de la fenêtre est plus haut que son bas */
    expect(g.coins[3]!.z).toBeGreaterThan(g.coins[0]!.z + 500);
  });

  it('refusée : sans toiture sur le niveau, hors toiture, à cheval sur un bord, trop petite ; modifiée et annulée', () => {
    const { h, a, n } = maison();
    const P0 = creerProjet({ nom: 'Vide', id: generateurSequentiel('p') });
    expect(refus(executer(nouvelHistorique(P0), 'x', [{ type: 'creerFenetreToit', niveau: P0.buildings[0]!.floors[0]!.id, centre: { x: 0, y: 0 } }], a))).toMatch(/ne porte pas de toiture/);
    expect(refus(executer(h, 'x', [{ type: 'creerFenetreToit', niveau: n, centre: { x: 30_000, y: 30_000 } }], a))).toMatch(/aucun pan/);
    expect(refus(executer(h, 'x', [{ type: 'creerFenetreToit', niveau: n, centre: { x: 8_000, y: 9_350 } }], a))).toMatch(/déborde du pan/);
    expect(refus(executer(h, 'x', [{ type: 'creerFenetreToit', niveau: n, centre: CENTRE, largeur: 300 }], a))).toMatch(/40 cm à 2 m/);
    const h2 = ok(executer(h, 'x', [{ type: 'creerFenetreToit', niveau: n, centre: CENTRE }], a));
    const id = fenetresDeToit(rdc(h2.projet))[0]!.o.id;
    const h3 = ok(executer(h2, 'x', [{ type: 'modifierFenetreToit', id, largeur: 1_140, hauteur: 1_180, centre: { x: 6_000, y: 7_000 } }], a));
    expect(fenetresDeToit(rdc(h3.projet)).map(x => [x.o.width, x.o.height, x.o.center])).toEqual([[1_140, 1_180, { x: 6_000, y: 7_000 }]]);
    expect(fenetresDeToit(rdc(annuler(h3).projet)).map(x => [x.o.width, x.o.center])).toEqual([[780, CENTRE]]);
    expect(geometrieFenetreToit(rdc(h3.projet), { center: CENTRE, width: 780, height: 980 }).ok).toBe(true);
  });

  it('en 3D : un dormant et un vitrage posés au-dessus de la couverture, dans la pente', () => {
    const { h, a, n } = maison();
    const P = ok(executer(h, 'x', [{ type: 'creerFenetreToit', niveau: n, centre: CENTRE }], a)).projet;
    const { o, geo } = fenetresDeToit(rdc(P))[0]!;
    const Q = maquette(P).plaques.filter(q => q.objet === o.id);
    expect(Q.map(q => q.matiere).sort()).toEqual(['ardoise', 'vitrage']);
    const vitrage = Q.find(q => q.matiere === 'vitrage')!, z = (x: number, y: number) => geo.pan.plan.a * x + geo.pan.plan.b * y + geo.pan.plan.c;
    /* au-dessus du pan, de la saillie du châssis (mesurée le long de la normale) */
    for (const c of vitrage.dessus) expect(c.z - z(c.x, c.y)).toBeGreaterThan(CHASSIS_TOIT.saillie);
  });

  it('au plan de toiture (PCMI 5), dans la notice et le DXF', () => {
    const { h, a, n } = maison();
    const P = ok(executer(h, 'x', [{ type: 'creerFenetreToit', niveau: n, centre: CENTRE }, { type: 'creerFenetreToit', niveau: n, centre: { x: 4_000, y: 7_200 } }], a)).projet;
    const pdf = texte(planchesPdf(P, { niveaux: [rdc(P).id], cotation: false, mobilier: false, indice: 'A', date: '05/10/2026', toiture: true }));
    expect(pdf).toContain('(Fen\xEAtres de toit)');
    expect(pdf).toContain('(2 \\(78 \xD7 98 cm\\))');
    expect(notice(P).flatMap(r => r.paragraphes).join(' ')).toMatch(/2 fenêtres de toit/);
    const sans = (dxfNiveau(h.projet, rdc(h.projet)).match(/\r\nTOITURE\r\n/g) ?? []).length;
    const avec = (dxfNiveau(P, rdc(P)).match(/\r\nTOITURE\r\n/g) ?? []).length;
    expect(avec).toBeGreaterThan(sans);
  });
});
