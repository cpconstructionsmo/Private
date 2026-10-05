/* Les murs composés : une composition du catalogue (enduit, parpaing,
   laine de verre, plâtre…) fait l'épaisseur du mur ; ses couches se
   dessinent à leur place, l'enduit côté extérieur quel que soit le sens du
   tracé ; une cloison fictive sépare deux pièces sans matière. Plans fictifs. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Point, type Project, type Wall } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { couchesDuNiveau, mursDroits, mursFictifs, planDuNiveau } from '../../src/building';
import { COMPOSITIONS_MURS, compositionMur, epaisseurComposition } from '../../src/catalogue/murs';
import { aire, centroide } from '../../src/geometry/polygon';
import { positionDansAnneau } from '../../src/geometry/predicats';
import { maquette } from '../../src/vue3d/maquette';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 5) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
type MurD = Wall & { axis: { a: Point; b: Point } };
const murs = (p: Project): MurD[] => Object.values(p.buildings[0]!.floors[0]!.objects).filter((o): o is MurD => o.type === 'wall');

function projet(cmds: (niveau: string) => Commande[]): { h: Historique; a: Acteur; niveau: string } {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') }), niveau = p.buildings[0]!.floors[0]!.id;
  const r = executer(nouvelHistorique(p), 'Plan', cmds(niveau), a);
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  return { h: r.historique, a, niveau };
}
/** un rectangle de 10 × 8 m en murs composés, tracé dans un sens ou dans l'autre */
const rectangle = (niveau: string, composition: string, inverse = false): Commande[] => {
  const P = [{ x: 0, y: 0 }, { x: 10_000, y: 0 }, { x: 10_000, y: 8_000 }, { x: 0, y: 8_000 }];
  const Q = inverse ? [...P].reverse() : P;
  return Q.map((q, i) => ({ type: 'creerMur', niveau, a: q, b: Q[(i + 1) % 4]!, epaisseur: 1, composition }) as Commande);
};

describe('le catalogue des compositions', () => {
  it('chaque composition a des couches positives et une épaisseur d’usage ; les identifiants sont uniques', () => {
    expect(new Set(COMPOSITIONS_MURS.map(k => k.id)).size).toBe(COMPOSITIONS_MURS.length);
    for (const k of COMPOSITIONS_MURS) expect(k.couches.every(c => c.epaisseur > 0)).toBe(true);
    expect(epaisseurComposition(compositionMur('ext-isole-36')!)).toBe(360);
    expect(epaisseurComposition(compositionMur('ext-isole-40')!)).toBe(400);
    expect(epaisseurComposition(compositionMur('cloison-72')!)).toBe(72);
  });
});

describe('murs composés', () => {
  it('la composition fait l’épaisseur et le rôle ; un genre qui ne convient pas, ou inconnu, est refusé', () => {
    const { h, a, niveau } = projet(n => rectangle(n, 'ext-isole-36'));
    expect(murs(h.projet).every(w => w.thickness === 360 && w.role === 'exterior' && w.compositionRef === 'ext-isole-36')).toBe(true);
    const r1 = executer(h, 'x', [{ type: 'creerMur', niveau, a: { x: 0, y: 0 }, b: { x: 0, y: 3_000 }, epaisseur: 70, role: 'partition', composition: 'ext-isole-36' }], a);
    expect(r1.ok ? '' : r1.erreurs.join()).toMatch(/ne convient pas/);
    const r2 = executer(h, 'x', [{ type: 'creerMur', niveau, a: { x: 0, y: 0 }, b: { x: 0, y: 3_000 }, epaisseur: 70, composition: 'inconnue' }], a);
    expect(r2.ok ? '' : r2.erreurs.join()).toMatch(/inconnue/);
  });

  it('changer de composition change l’épaisseur (annulable) ; une épaisseur saisie rend le mur « sur mesure »', () => {
    const { h, a } = projet(n => rectangle(n, 'ext-isole-36'));
    const w = murs(h.projet)[0]!;
    const r = executer(h, 'x', [{ type: 'modifierMur', id: w.id, composition: 'ext-isole-40' }], a);
    if (!r.ok) throw new Error(r.erreurs.join());
    expect(murs(r.historique.projet)[0]!).toMatchObject({ thickness: 400, compositionRef: 'ext-isole-40' });
    expect(murs(annuler(r.historique).projet)[0]!).toMatchObject({ thickness: 360, compositionRef: 'ext-isole-36' });
    const s = executer(r.historique, 'x', [{ type: 'modifierMur', id: w.id, epaisseur: 250 }], a);
    if (!s.ok) throw new Error(s.erreurs.join());
    expect(murs(s.historique.projet)[0]!.thickness).toBe(250);
    expect(murs(s.historique.projet)[0]!.compositionRef ?? null).toBeNull();
    /* une composition d'un autre genre fait changer le rôle : une cloison devient mur intérieur */
    const t = executer(h, 'x', [{ type: 'modifierMur', id: w.id, composition: 'int-parpaing-22' }], a);
    if (!t.ok) throw new Error(t.erreurs.join());
    expect(murs(t.historique.projet)[0]!).toMatchObject({ role: 'bearing_interior', thickness: 220 });
  });

  it('les couches : l’enduit dehors et le plâtre dedans, dans les deux sens de tracé ; elles remplissent la maçonnerie', () => {
    for (const inverse of [false, true]) {
      const { h } = projet(n => rectangle(n, 'ext-isole-36', inverse));
      const f = h.projet.buildings[0]!.floors[0]!, plan = planDuNiveau(f), C = couchesDuNiveau(f);
      expect(C).toHaveLength(16);                          // 4 murs × 4 couches
      const salle = plan.zones[0]!.polygone.contour;
      for (const b of C) {
        const c = centroide(b.polygones[0]!.contour), dedans = positionDansAnneau(c, salle) === 'dedans';
        expect(dedans).toBe(false);                         // une couche est dans le mur, jamais dans la pièce
      }
      /* le centre d'une bande d'enduit est plus loin du centre de la maison que celui d'une bande de plâtre du même mur */
      const centre = { x: 5_000, y: 4_000 }, d = (p: Point) => Math.hypot(p.x - centre.x, p.y - centre.y);
      for (const w of mursDroits(f)) {
        const en = C.find(b => b.mur === w.id && b.matiere === 'enduit')!, pl = C.find(b => b.mur === w.id && b.matiere === 'platre')!;
        const ce = centroide(en.polygones[0]!.contour), cp = centroide(pl.polygones[0]!.contour);
        /* comparer sur l'axe perpendiculaire au mur */
        const horiz = w.axis.a.y === w.axis.b.y;
        expect(horiz ? Math.abs(ce.y - centre.y) > Math.abs(cp.y - centre.y) : Math.abs(ce.x - centre.x) > Math.abs(cp.x - centre.x)).toBe(true);
        expect(d(ce)).toBeGreaterThan(0);
      }
      const somme = C.reduce((s, b) => s + b.polygones.reduce((t, p) => t + aire(p), 0), 0);
      const mac = plan.maconnerieOuverte.reduce((s, p) => s + aire(p), 0);
      expect(Math.abs(somme - mac) / mac).toBeLessThan(1e-3);
    }
  });
});

describe('cloison fictive', () => {
  it('elle coupe un espace en deux pièces sans rien ajouter à la maçonnerie, ni à la 3D ; elle refuse les ouvertures', () => {
    const base = projet(n => rectangle(n, 'ext-isole-36'));
    const { h, a, niveau } = projet(n => [...rectangle(n, 'ext-isole-36'), { type: 'creerMur', niveau: n, a: { x: 4_000, y: 0 }, b: { x: 4_000, y: 8_000 }, epaisseur: 70, role: 'virtual' }]);
    const f = h.projet.buildings[0]!.floors[0]!, f0 = base.h.projet.buildings[0]!.floors[0]!;
    expect(mursFictifs(f)).toHaveLength(1);
    expect(mursDroits(f)).toHaveLength(4);
    const Z = planDuNiveau(f).zones, Z0 = planDuNiveau(f0).zones;
    expect(Z).toHaveLength(2);
    expect(Z0).toHaveLength(1);
    const total = Z.reduce((s, z) => s + z.aire, 0);
    expect(Z0[0]!.aire - total).toBeGreaterThan(0);
    expect(Z0[0]!.aire - total).toBeLessThan(0.01e6);              // moins d'un centième de m² pour le trait
    expect(planDuNiveau(f).maconnerie.reduce((s, p) => s + aire(p), 0)).toBeCloseTo(planDuNiveau(f0).maconnerie.reduce((s, p) => s + aire(p), 0), 3);
    /* en 3D, aucun mur de plus : seul le sol se partage en deux pièces (chacune son revêtement) */
    const murs3d = (p: Project) => maquette(p).prismes.filter(x => x.matiere !== 'sol').length;
    expect(murs3d(h.projet)).toBe(murs3d(base.h.projet));
    expect(maquette(h.projet).prismes.filter(x => x.matiere === 'sol')).toHaveLength(2);
    const v = mursFictifs(f)[0]!;
    const o = executer(h, 'x', [{ type: 'creerOuverture', mur: v.id, position: 2_000, largeur: 900, hauteur: 2_150, genre: 'door' }], a);
    expect(o.ok ? '' : o.erreurs.join()).toMatch(/fictive/);
    expect(niveau).toBeTruthy();
  });

  it('un angle déplacé emporte le bout de la cloison fictive qui y est posé ; son propre bout se déplace seul', () => {
    const { h, a, niveau } = projet(n => [...rectangle(n, 'ext-isole-36'), { type: 'creerMur', niveau: n, a: { x: 0, y: 0 }, b: { x: 4_000, y: 4_000 }, epaisseur: 70, role: 'virtual' }]);
    const r = executer(h, 'x', [{ type: 'deplacerSommet', niveau, de: { x: 0, y: 0 }, vers: { x: -500, y: 0 } }], a);
    if (!r.ok) throw new Error(r.erreurs.join());
    expect(mursFictifs(r.historique.projet.buildings[0]!.floors[0]!)[0]!.axis.a).toEqual({ x: -500, y: 0 });
    const s = executer(r.historique, 'x', [{ type: 'deplacerSommet', niveau, de: { x: 4_000, y: 4_000 }, vers: { x: 5_000, y: 4_000 } }], a);
    if (!s.ok) throw new Error(s.erreurs.join());
    expect(mursFictifs(s.historique.projet.buildings[0]!.floors[0]!)[0]!.axis.b).toEqual({ x: 5_000, y: 4_000 });
  });
});
