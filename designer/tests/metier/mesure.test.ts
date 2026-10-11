/* L'outil Mesurer : deux clics, et la distance se lit (avec ses écarts en x
   et en y quand le trait est de biais) ; les points s'accrochent aux murs
   comme au tracé (Alt : libres ; Maj : à 45°). Rien n'est ajouté au plan :
   aucune commande, l'historique ne bouge pas. Maison fictive de 10 × 8 m. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { Outils, texteMesure, type Effet, type Geste } from '../../src/ui/outils';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 11) + (t += 1000)).toISOString(), id: generateurSequentiel('m') } };

function banc() {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') }), niveau = p.buildings[0]!.floors[0]!.id;
  const M = (x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, hauteur: 2_500, role: 'exterior' });
  const r = executer(nouvelHistorique(p), 'Maison', [M(0, 0, 10_000, 0), M(10_000, 0, 10_000, 8_000), M(10_000, 8_000, 0, 8_000), M(0, 8_000, 0, 0)], a);
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  const h: Historique = r.historique;
  const outils = new Outils(() => ({ projet: h.projet, niveau, selection: null }));
  const effets: Effet[] = [];
  const g = (x: number, y: number, o: Partial<Geste> = {}): Geste => ({ point: { x, y }, rayon: 150, ...o });
  return {
    outils, h, effets,
    survol: (x: number, y: number, o?: Partial<Geste>) => { const e = outils.bouger(g(x, y, o)); effets.push(e); return e },
    clic: (x: number, y: number, o?: Partial<Geste>) => { effets.push(outils.bouger(g(x, y, o))); const e = outils.appuyer(g(x, y, o)); effets.push(e); return e },
  };
}

describe('l’outil Mesurer', () => {
  it('deux clics libres (Alt) : la longueur, ses écarts en x et en y ; la mesure reste affichée, sans rien ajouter au plan', () => {
    const b = banc();
    b.outils.choisir('mesure');
    expect(b.clic(1_000, 1_000, { alt: true }).aide).toBe('Second point de la mesure');
    /* en suivant le curseur : la mesure provisoire, et son texte dans l'aide */
    expect(b.survol(4_000, 1_000, { alt: true }).aide).toBe('Longueur 3,00 m');
    const e = b.clic(4_000, 5_000, { alt: true });
    expect(e.aide).toBe('Longueur 5,00 m · en x 3,00 m · en y 4,00 m — cliquer pour une autre mesure');
    expect(b.outils.mesure).toMatchObject({ a: { x: 1_000, y: 1_000 }, b: { x: 4_000, y: 5_000 }, longueur: 5_000, dx: 3_000, dy: 4_000, figee: true });
    /* figée : le curseur ne la change plus */
    b.survol(7_000, 2_000, { alt: true });
    expect(b.outils.mesure?.b).toEqual({ x: 4_000, y: 5_000 });
    /* aucune commande : le projet n'a pas bougé */
    expect(b.effets.every(x => !x.commandes)).toBe(true);
    /* un troisième clic en commence une autre */
    b.clic(2_000, 2_000, { alt: true });
    expect(b.outils.mesure).toMatchObject({ a: { x: 2_000, y: 2_000 }, figee: false });
  });

  it('accrochée aux murs : d’une face intérieure à l’autre, la largeur dans œuvre (9,80 m)', () => {
    const b = banc();
    b.outils.choisir('mesure');
    /* à 3 m du coin (hors du milieu du mur, qui l'emporterait sur la face) */
    b.clic(140, 3_000);
    b.clic(9_860, 3_000);
    const m = b.outils.mesure!;
    expect([m.a.x, m.b.x, m.longueur, m.dy]).toEqual([100, 9_900, 9_800, 0]);
    expect(texteMesure(m)).toBe('Longueur 9,80 m');
  });

  it('Maj : le second point redressé à 45° près (sa distance gardée) ; Échap efface la mesure, un second Échap rend la sélection', () => {
    const b = banc();
    b.outils.choisir('mesure');
    b.clic(2_000, 2_000, { alt: true });
    b.clic(5_000, 2_400, { maj: true, alt: true });
    const m = b.outils.mesure!;
    expect(m.b.y).toBeCloseTo(2_000, 6);
    expect(Math.abs(m.longueur - Math.hypot(3_000, 400))).toBeLessThan(1);          // un point libre est gardé au millimètre
    b.outils.touche('Escape');
    expect([b.outils.mesure, b.outils.outil]).toEqual([null, 'mesure']);
    b.outils.touche('Escape');
    expect(b.outils.outil).toBe('selection');
  });
});
