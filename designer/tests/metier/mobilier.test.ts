/* Le mobilier : pose plaquée contre un mur et calée dans un angle, formes
   en plan et en volume, commandes (créer, déplacer, tourner, annuler). */
import { describe, expect, it } from 'vitest';
import { canonique, creerProjet, generateurSequentiel, type Floor, type Furniture, type Project } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { blocs, dansMeuble, emprise, poserMeuble, traits } from '../../src/building';
import { MODELES_MEUBLES, FAMILLES_MEUBLES, modeleMeuble } from '../../src/catalogue/mobilier';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const rdc = (p: Project): Floor => p.buildings[0]!.floors[0]!;
const M = (n: string, x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, role: 'exterior' });

/** une pièce fictive de 4 × 3 m (axes), murs de 20 cm : faces intérieures de 0,10 à 3,90 et de 0,10 à 2,90 */
function chambre() {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = rdc(p).id;
  const h = ok(executer(nouvelHistorique(p), 'Murs', [M(n, 0, 0, 4_000, 0), M(n, 4_000, 0, 4_000, 3_000), M(n, 4_000, 3_000, 0, 3_000), M(n, 0, 3_000, 0, 0)], a));
  return { h, a, n, f: rdc(h.projet) };
}
const boite = (P: { x: number; y: number }[]) => ({ xmin: Math.min(...P.map(q => q.x)), xmax: Math.max(...P.map(q => q.x)), ymin: Math.min(...P.map(q => q.y)), ymax: Math.max(...P.map(q => q.y)) });

describe('catalogue de mobilier', () => {
  it('identifiants uniques, familles servies, dimensions plausibles, chaque forme dessinée', () => {
    expect(new Set(MODELES_MEUBLES.map(m => m.id)).size).toBe(MODELES_MEUBLES.length);
    for (const f of Object.keys(FAMILLES_MEUBLES)) expect(MODELES_MEUBLES.some(m => m.famille === f)).toBe(true);
    for (const m of MODELES_MEUBLES) {
      expect(m.largeur).toBeGreaterThan(0); expect(m.profondeur).toBeGreaterThan(0); expect(m.hauteur).toBeGreaterThanOrEqual(0);
      expect(traits(m.forme, m.largeur, m.profondeur).length).toBeGreaterThan(0);
      /* les volumes restent dans l'encombrement (à 2 cm près pour un plan de travail qui déborde) */
      for (const b of blocs(m.forme, m.largeur, m.profondeur, m.hauteur)) {
        expect(b.x0).toBeGreaterThanOrEqual(-m.largeur / 2 - 1e-9); expect(b.x1).toBeLessThanOrEqual(m.largeur / 2 + 1e-9);
        expect(b.y0).toBeGreaterThanOrEqual(-m.profondeur / 2 - 1e-9); expect(b.y1).toBeLessThanOrEqual(m.profondeur / 2 + 20 + 1e-9);
        expect(b.z1).toBeGreaterThan(b.z0);
      }
    }
    expect(modeleMeuble('lit-160')).toMatchObject({ forme: 'lit', largeur: 1_600, profondeur: 2_000 });
  });
});

describe('pose du mobilier', () => {
  it('près d’un mur : dos contre la face, tourné vers la pièce', () => {
    const { f } = chambre();
    const P = poserMeuble(f, { x: 2_000, y: 600 }, 1_400, 1_900, 0, 300);
    expect(P.plaque).toBe(true);
    expect(P.position).toEqual({ x: 2_000, y: 100 + 950 });
    expect(P.rotation).toBeCloseTo(0, 9);
    /* contre le mur du haut : tourné d'un demi-tour, le devant vers le bas */
    const H = poserMeuble(f, { x: 2_000, y: 2_600 }, 1_400, 1_900, 0, 300);
    expect(H.position.y).toBeCloseTo(2_900 - 950, 6);
    expect(Math.abs(Math.cos(H.rotation) + 1)).toBeLessThan(1e-9);
  });

  it('près d’un angle : glissé jusqu’au mur voisin (un meuble bas de cuisine dans le coin)', () => {
    const { f } = chambre();
    const P = poserMeuble(f, { x: 330, y: 520 }, 600, 600, 0, 300);
    const b = boite(emprise({ ...P, width: 600, depth: 600 }));
    expect(b.xmin).toBeCloseTo(100, 6); expect(b.ymin).toBeCloseTo(100, 6);
  });

  it('loin des murs : posé tel quel, avec la rotation donnée', () => {
    const { f } = chambre();
    expect(poserMeuble(f, { x: 2_000, y: 1_500 }, 450, 500, 1, 100)).toEqual({ position: { x: 2_000, y: 1_500 }, rotation: 1, plaque: false });
  });

  it('dedans / dehors d’un meuble tourné', () => {
    const o = { position: { x: 1_000, y: 1_000 }, rotation: Math.PI / 2, width: 2_000, depth: 400 };
    expect(dansMeuble(o, { x: 1_100, y: 1_900 })).toBe(true);           // le long de sa largeur, devenue verticale
    expect(dansMeuble(o, { x: 1_900, y: 1_100 })).toBe(false);
  });
});

describe('commandes du mobilier', () => {
  it('créer, déplacer, tourner, retailler ; annuler rend le modèle ; dimensions contrôlées', () => {
    const { h: h0, a, n } = chambre();
    const lit = modeleMeuble('lit-140')!;
    const h1 = ok(executer(h0, 'Lit', [{ type: 'creerMeuble', niveau: n, modele: { id: lit.id, label: lit.libelle }, position: { x: 2_000, y: 1_050 }, rotation: 0, largeur: lit.largeur, profondeur: lit.profondeur, hauteur: lit.hauteur }], a));
    const o = Object.values(rdc(h1.projet).objects).find((x): x is Furniture => x.type === 'furniture')!;
    expect(o).toMatchObject({ width: 1_400, depth: 1_900, height: 500, catalogRef: { id: 'lit-140' } });
    const avant = canonique(h1.projet);
    const h2 = ok(executer(h1, 'Tourner', [{ type: 'modifierMeuble', id: o.id, position: { x: 2_100, y: 1_000 }, rotation: Math.PI / 2, largeur: 1_600 }], a));
    expect(rdc(h2.projet).objects[o.id]).toMatchObject({ position: { x: 2_100, y: 1_000 }, rotation: Math.PI / 2, width: 1_600 });
    expect(canonique(annuler(h2).projet)).toBe(avant);
    expect(executer(h1, 'x', [{ type: 'modifierMeuble', id: o.id, largeur: 0 }], a).ok).toBe(false);
    expect(executer(h1, 'x', [{ type: 'modifierMeuble', id: o.id, hauteur: -1 }], a).ok).toBe(false);
    expect(executer(h1, 'x', [{ type: 'supprimer', id: o.id }], a).ok).toBe(true);
  });
});
