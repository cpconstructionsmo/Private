/* Les coupes tracées à la main : le trait (A-A, B-B…) est un objet du plan,
   la coupe se calcule ; outil K, déplacement, regard inversé, une planche
   par trait dans le PDF. */
import { describe, expect, it } from 'vitest';
import { canonique, creerProjet, generateurSequentiel, type Project, type SectionLine } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { maquette } from '../../src/vue3d/maquette';
import { coupe, ligneDe, lignesDeCoupe, traitsDeCoupe } from '../../src/vue3d/coupe';
import { planchesPdf } from '../../src/export/planche';
import { Outils, type Effet } from '../../src/ui/outils';
import { viser } from '../../src/ui/selection';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, role: 'exterior' });

/** 10 × 8 m, toit à deux pans */
function maison(): { h: Historique; a: Acteur; n: string } {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p.buildings[0]!.floors[0]!.id;
  const h = ok(executer(nouvelHistorique(p), 'Murs', [M(n, 0, 0, 10_000, 0), M(n, 10_000, 0, 10_000, 8_000), M(n, 10_000, 8_000, 0, 8_000), M(n, 0, 8_000, 0, 0),
    { type: 'creerToiture', niveau: n, genre: 'gable', pente: 40, debord: 400, couverture: 'tile' }], a));
  return { h, a, n };
}
const traits = (p: Project) => Object.values(p.buildings[0]!.floors[0]!.objects).filter((o): o is SectionLine => o.type === 'section');

describe('trait de coupe : commandes', () => {
  it('créé avec la première lettre libre (A, puis B), regard à gauche ; annulable ; même projet relu', () => {
    const { h, a, n } = maison();
    const h1 = ok(executer(h, 'Coupe', [{ type: 'creerCoupe', niveau: n, a: { x: 5_000, y: -1_000 }, b: { x: 5_000, y: 9_000 } }], a));
    const h2 = ok(executer(h1, 'Coupe', [{ type: 'creerCoupe', niveau: n, a: { x: -1_000, y: 3_000 }, b: { x: 11_000, y: 3_000 } }], a));
    expect(traits(h2.projet).map(s => [s.name, s.look])).toEqual([['A', 'left'], ['B', 'left']]);
    expect(JSON.parse(canonique(h2.projet)).buildings[0].floors[0].objects).toBeTruthy();
    expect(traits(annuler(h2).projet)).toHaveLength(1);
  });

  it('refus : trait de moins de 50 cm, nom pris ou illisible', () => {
    const { h, a, n } = maison();
    const h1 = ok(executer(h, 'Coupe', [{ type: 'creerCoupe', niveau: n, a: { x: 0, y: 0 }, b: { x: 5_000, y: 0 } }], a));
    const r1 = executer(h1, 'x', [{ type: 'creerCoupe', niveau: n, a: { x: 0, y: 0 }, b: { x: 400, y: 0 } }], a);
    const r2 = executer(h1, 'x', [{ type: 'creerCoupe', niveau: n, a: { x: 0, y: 0 }, b: { x: 4_000, y: 0 }, nom: 'a' }], a);
    const s = traits(h1.projet)[0]!;
    const r3 = executer(h1, 'x', [{ type: 'modifierCoupe', id: s.id, nom: 'A-A' }], a);
    expect([r1.ok, r2.ok, r3.ok]).toEqual([false, false, false]);
    if (!r2.ok) expect(r2.erreurs[0]).toMatch(/A-A existe déjà/);
    const h2 = ok(executer(h1, 'x', [{ type: 'modifierCoupe', id: s.id, nom: 'c', regard: 'right' }], a));
    expect([traits(h2.projet)[0]!.name, traits(h2.projet)[0]!.look]).toEqual(['C', 'right']);
  });
});

describe('trait de coupe : la coupe', () => {
  it('le regard : à gauche du trait (de a vers b), ou à droite', () => {
    const s = { a: { x: 0, y: 0 }, b: { x: 0, y: 10 }, look: 'left', name: 'A' } as SectionLine;
    expect(ligneDe(s).regard).toEqual({ x: -1, y: 0 });
    expect(ligneDe({ ...s, look: 'right' }).regard).toEqual({ x: 1, y: -0 });
  });

  it('un trait tracé remplace la coupe automatique ; trait le long du faîtage : la coupe longitudinale', () => {
    const { h, a, n } = maison();
    expect(lignesDeCoupe(h.projet).map(l => l.nom)).toEqual(['A']);                        // automatique
    const h1 = ok(executer(h, 'Coupe', [{ type: 'creerCoupe', niveau: n, a: { x: -1_000, y: 4_000 }, b: { x: 11_000, y: 4_000 }, nom: 'B' }], a));
    const L = lignesDeCoupe(h1.projet);
    expect(L.map(l => l.nom)).toEqual(['B']);
    expect(L[0]!.regard).toEqual({ x: -0, y: 1 });
    /* par le faîtage (deux pans, faîtage le long des 10 m) : les deux murs pignons coupés, le toit vu par-dessous */
    const c = coupe(maquette(h1.projet), L[0]!);
    expect(c.coupees.filter(x => x.matiere === 'mur').length).toBeGreaterThanOrEqual(2);
    expect(c.boite!.umax - c.boite!.umin).toBeGreaterThan(10_000);
    expect(traitsDeCoupe(h1.projet)[0]!.niveau).toBe(n);
  });

  it('PDF : une planche par trait (A-A, B-B), les traits sur le plan', () => {
    const { h, a, n } = maison();
    const h1 = ok(executer(h, 'Coupes', [{ type: 'creerCoupe', niveau: n, a: { x: 5_000, y: -1_000 }, b: { x: 5_000, y: 9_000 } },
      { type: 'creerCoupe', niveau: n, a: { x: -1_000, y: 3_000 }, b: { x: 11_000, y: 3_000 } }], a));
    const s = Array.from(planchesPdf(h1.projet, { niveaux: [n], cotation: true, mobilier: true, indice: 'A', date: '03/10/2026', coupe: true }), c => String.fromCharCode(c)).join('');
    expect(s).toContain('/Count 3');
    expect(s).toContain('(Coupe A-A)'); expect(s).toContain('(Coupe B-B)');
    expect(s).toContain('(Trait de coupe trac\xE9 sur le plan ; le plan de coupe)');
    /* les coupes seules */
    expect(Array.from(planchesPdf(h1.projet, { niveaux: [], cotation: true, mobilier: false, indice: 'A', date: '03/10/2026', coupe: true }), c => String.fromCharCode(c)).join('')).toContain('/Count 2');
  });
});

describe('trait de coupe : outil et sélection', () => {
  function banc() {
    const { h: h0, a, n } = maison();
    let h = h0, selection: string | null = null;
    const outils = new Outils(() => ({ projet: h.projet, niveau: n, selection }));
    const appliquer = (e: Effet) => { if (e.selection !== undefined) selection = e.selection; if (e.commandes) h = ok(executer(h, e.commandes.titre, e.commandes.liste, a)); return e };
    const g = (x: number, y: number, o: { maj?: boolean } = {}) => ({ point: { x, y }, rayon: 150, ...o });
    return {
      outils, n, get h() { return h }, get selection() { return selection },
      clic: (x: number, y: number, o?: { maj?: boolean }) => { appliquer(outils.bouger(g(x, y, o))); return appliquer(outils.appuyer(g(x, y, o))) },
      bouger: (x: number, y: number, o?: { maj?: boolean }) => appliquer(outils.bouger(g(x, y, o))),
      tirer: (de: [number, number], vers: [number, number]) => { appliquer(outils.appuyer(g(...de))); appliquer(outils.bouger(g(de[0] + 1, de[1]))); appliquer(outils.bouger(g(...vers))); appliquer(outils.relacher(g(...vers))) },
    };
  }

  it('K : deux clics (Maj : à 45° près), aperçu pendant le tracé, retour à la sélection', () => {
    const b = banc();
    b.outils.choisir('coupe');
    b.clic(5_003, -1_500);
    const e = b.bouger(5_400, 9_500, { maj: true });
    expect(e.apercu?.[0]?.type).toBe('creerCoupe');
    const fin = b.clic(5_400, 9_500, { maj: true });
    expect(fin.fini).toBe(true);
    expect(b.outils.outil).toBe('selection');
    const s = traits(b.h.projet)[0]!;
    expect(s.name).toBe('A'); expect(s.b.x).toBeCloseTo(s.a.x, 6);                      // vertical : Maj a bloqué l'angle
  });

  it('choisi en cliquant près du trait ; tiré, il se déplace d’un bloc ; annulable', () => {
    const b = banc();
    b.outils.choisir('coupe');
    b.clic(3_000, -1_000); b.clic(3_000, 9_000);
    const s = traits(b.h.projet)[0]!;
    const cible = viser(b.h.projet.buildings[0]!.floors[0]!, { x: 3_040, y: 4_000 }, 150);
    expect(cible?.genre === 'objet' && cible.id).toBe(s.id);
    b.tirer([3_040, 4_000], [4_040, 4_500]);
    const t = traits(b.h.projet)[0]!;
    expect(b.selection).toBe(s.id);
    expect([t.a.x - s.a.x, t.a.y - s.a.y, t.b.x - s.b.x, t.b.y - s.b.y]).toEqual([1_000, 500, 1_000, 500]);
    expect(traits(annuler(b.h).projet)[0]!.a).toEqual(s.a);
  });
});
