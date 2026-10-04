/* Les aménagements extérieurs du plan de masse : clôtures (lignes),
   terrasses, allées, stationnement, espaces verts (surfaces) ; tracés à
   l'outil A, mesurés, en 3D et sur la planche PCMI 2. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Landscape, type Project } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { bilanAmenagements } from '../../src/building';
import { maquette } from '../../src/vue3d/maquette';
import { facade } from '../../src/vue3d/facades';
import { avancer, preparerVisite, type Marcheur } from '../../src/vue3d/visite';
import { planchesPdf } from '../../src/export/planche';
import { FINITIONS_AMENAGEMENT, GENRES_AMENAGEMENT } from '../../src/catalogue/amenagements';
import { Outils, type Effet } from '../../src/ui/outils';
import { viser } from '../../src/ui/selection';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, role: 'exterior' });
const R = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

/** la maison 10 × 8 m sur sa parcelle 30 × 20 ; une terrasse 6 × 4 au nord, une allée, une pelouse, une clôture sur trois côtés */
function maison(): { h: Historique; a: Acteur; n: string } {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p.buildings[0]!.floors[0]!.id;
  const h = ok(executer(nouvelHistorique(p), 'Maison', [M(n, 0, 0, 10_000, 0), M(n, 10_000, 0, 10_000, 8_000), M(n, 10_000, 8_000, 0, 8_000), M(n, 0, 8_000, 0, 0),
    { type: 'creerParcelle', niveau: n, contour: R(-5_000, -3_000, 25_000, 17_000), voies: [0] },
    { type: 'creerAmenagement', niveau: n, genre: 'terrace', points: R(2_000, 8_100, 8_000, 12_100), finition: 'terrasse-bois', hauteur: 20 },
    { type: 'creerAmenagement', niveau: n, genre: 'path', points: R(4_000, -3_000, 5_500, -100), finition: 'allee-gravillons', hauteur: 0 },
    { type: 'creerAmenagement', niveau: n, genre: 'green', points: R(12_000, 0, 24_000, 16_000), finition: 'pelouse', hauteur: 0 },
    { type: 'creerAmenagement', niveau: n, genre: 'fence', points: [{ x: 25_000, y: -3_000 }, { x: 25_000, y: 17_000 }, { x: -5_000, y: 17_000 }, { x: -5_000, y: -3_000 }], finition: 'grillage-rigide-vert', hauteur: 1_500 }], a));
  return { h, a, n };
}
const objets = (p: Project) => Object.values(p.buildings[0]!.floors[0]!.objects).filter((o): o is Landscape => o.type === 'landscape');

describe('aménagements : catalogue et commandes', () => {
  it('chaque genre a ses aspects ; identifiants uniques', () => {
    for (const g of Object.keys(GENRES_AMENAGEMENT)) expect(FINITIONS_AMENAGEMENT.some(f => f.genre === g)).toBe(true);
    expect(new Set(FINITIONS_AMENAGEMENT.map(f => f.id)).size).toBe(FINITIONS_AMENAGEMENT.length);
  });

  it('créés, mesurés (surfaces et longueur), modifiés, annulables ; refus d’une surface à deux points', () => {
    const { h, a, n } = maison();
    const B = bilanAmenagements(h.projet);
    expect(B.map(b => [b.genre, Math.round(b.mesure / (b.genre === 'fence' ? 1 : 1e6))])).toEqual([['terrace', 24], ['path', 4], ['green', 192], ['fence', 70_000]]);
    expect(executer(h, 'x', [{ type: 'creerAmenagement', niveau: n, genre: 'terrace', points: R(0, 0, 1, 1).slice(0, 2), finition: 'terrasse-bois', hauteur: 0 }], a).ok).toBe(false);
    const c = objets(h.projet).find(o => o.kind === 'fence')!;
    const h2 = ok(executer(h, 'x', [{ type: 'modifierAmenagement', id: c.id, hauteur: 1_800, finition: 'palissade-bois', ferme: true }], a));
    const c2 = objets(h2.projet).find(o => o.id === c.id)!;
    expect([c2.height, c2.finish, c2.closed]).toEqual([1_800, 'palissade-bois', true]);
    expect(objets(annuler(h2).projet).find(o => o.id === c.id)!.height).toBe(1_500);
  });
});

describe('aménagements : 3D, visite, plan de masse', () => {
  it('3D : la terrasse en dalle à −2 cm, la clôture en relief (3 tronçons, 1,50 m), rien en façade', () => {
    const { h } = maison(), m = maquette(h.projet);
    const t = m.prismes.find(p => p.matiere === 'amenagement' && p.finition === 'terrasse-bois')!;
    expect([t.z0, t.z1]).toEqual([-170, -20]);
    const c = m.prismes.filter(p => p.matiere === 'cloture');
    expect(c).toHaveLength(3);
    expect(c.every(p => p.z1 === 1_500)).toBe(true);
    expect(facade(m, 'sud').faces.some(f => f.matiere === 'cloture' || f.matiere === 'amenagement')).toBe(false);
  });

  it('visite : la clôture arrête le promeneur, la pelouse non', () => {
    const { h } = maison(), T = preparerVisite(maquette(h.projet, undefined, { toiture: false }));
    let w: Marcheur = { x: 18_000, y: 8_000, pied: 0, cap: 0, tangage: 0 };
    for (let i = 0; i < 100; i++) w = avancer(T, w, 100, 0);
    expect(w.x).toBeGreaterThan(20_000); expect(w.x).toBeLessThan(25_000 - 250 + 1);
  });

  it('plan de masse : la planche liste les aménagements et la part d’espaces verts', () => {
    const { h } = maison();
    const s = Array.from(planchesPdf(h.projet, { niveaux: [], cotation: true, mobilier: true, indice: 'A', date: '04/10/2026', masse: true }), c => String.fromCharCode(c)).join('');
    for (const t of ['(AM\xC9NAGEMENTS)', '(Terrasse : terrasse en lames bois)', '(24,00 m\xB2)', '(Cl\xF4ture : grillage rigide vert)', '(70,00 m)', '(192,00 m\xB2 \\(32,0 %\\))']) expect(s).toContain(t);
  });
});

describe('aménagements : outil et choix', () => {
  it('A : une clôture de trois points finie par Entrée, puis une terrasse fermée au premier point ; choisies d’un clic', () => {
    const { h: h0, a, n } = maison();
    let h = h0, selection: string | null = null;
    const outils = new Outils(() => ({ projet: h.projet, niveau: n, selection }));
    const app = (e: Effet) => { if (e.commandes) h = ok(executer(h, e.commandes.titre, e.commandes.liste, a)); return e };
    const clic = (x: number, y: number) => { app(outils.bouger({ point: { x, y }, rayon: 150, alt: true })); return app(outils.appuyer({ point: { x, y }, rayon: 150, alt: true })) };
    const avant = objets(h.projet).length;
    outils.choisir('amenagement');
    clic(-4_000, 0); clic(-4_000, 5_000); clic(-2_000, 5_000); app(outils.touche('Enter'));
    outils.reglages.genreAmenagement = 'terrace';
    clic(10_200, 2_000); clic(13_000, 2_000); clic(13_000, 6_000); clic(10_200, 6_000); clic(10_200, 2_000);
    const N = objets(h.projet);
    expect(N).toHaveLength(avant + 2);
    const [cl, te] = N.slice(-2);
    expect([cl!.kind, cl!.closed, cl!.points.length, cl!.finish]).toEqual(['fence', false, 3, 'grillage-rigide-vert']);
    expect([te!.kind, te!.closed, te!.finish]).toEqual(['terrace', true, 'terrasse-bois']);
    const f = h.projet.buildings[0]!.floors[0]!;
    const v = viser(f, { x: 11_500, y: 4_000 }, 150);
    expect(v?.genre === 'objet' && v.id).toBe(te!.id);
    const v2 = viser(f, { x: -4_030, y: 2_500 }, 150);
    expect(v2?.genre === 'objet' && v2.id).toBe(cl!.id);
  });
});
