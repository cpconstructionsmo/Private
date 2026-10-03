/* La visite à hauteur d'homme : départ dans la plus grande pièce, murs qui
   arrêtent, portes qui laissent passer, escalier qu'on monte jusqu'à l'étage. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Project } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { mursDroits } from '../../src/building';
import { maquette } from '../../src/vue3d/maquette';
import { avancer, depart, HAUTEUR_OEIL, libre, preparerVisite, regard, solSous, type Marcheur } from '../../src/vue3d/visite';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number, role: 'exterior' | 'partition' = 'exterior'): Commande =>
  ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: role === 'exterior' ? 200 : 100, role });
const quatre = (n: string) => [M(n, 0, 0, 10_000, 0), M(n, 10_000, 0, 10_000, 8_000), M(n, 10_000, 8_000, 0, 8_000), M(n, 0, 8_000, 0, 0)];

/** 10 × 8 m ; une cloison à x = 4 m (séjour 6 m à droite, chambre 4 m à gauche) percée d'une porte de 0,90 à y = 4 m */
function maison(etage = false): Project {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p.buildings[0]!.floors[0]!.id;
  let h = ok(executer(nouvelHistorique(p), 'Murs', [...quatre(n), M(n, 4_000, 0, 4_000, 8_000, 'partition')], a));
  const cl = mursDroits(h.projet.buildings[0]!.floors[0]!).find(w => w.role === 'partition')!;
  h = ok(executer(h, 'Porte', [{ type: 'creerOuverture', mur: cl.id, position: 4_000, largeur: 900, hauteur: 2_150, allege: 0, genre: 'door' }], a));
  if (etage) {
    h = ok(executer(h, 'Étage', [{ type: 'ajouterNiveau', batiment: h.projet.buildings[0]!.id, nom: 'Étage', altitude: 2_700, hauteur: 2_500 }], a));
    const et = h.projet.buildings[0]!.floors.find(f => f.name === 'Étage')!.id;
    /* un escalier droit de 0,90 m qui monte vers +y depuis (7, 1) */
    h = ok(executer(h, 'Étage', [...quatre(et), { type: 'creerEscalier', niveau: n, genre: 'straight', position: { x: 7_000, y: 1_000 }, rotation: 0, largeur: 900 }], a));
  }
  return h.projet;
}
const T = (p: Project) => preparerVisite(maquette(p, undefined, { toiture: false }));
const marcher = (t: ReturnType<typeof T>, w: Marcheur, dx: number, dy: number, fois: number) => { for (let i = 0; i < fois; i++) w = avancer(t, w, dx, dy); return w };

describe('visite à hauteur d’homme', () => {
  it('départ au milieu de la plus grande pièce (le séjour), sur le sol fini, regard vers le haut du plan', () => {
    const w = depart(T(maison()));
    expect(w.x).toBeGreaterThan(4_000); expect(w.x).toBeLessThan(10_000);
    expect(w.pied).toBe(5);
    expect(regard(w).oeil.z).toBe(5 + HAUTEUR_OEIL);
    expect(regard(w).vise.y).toBeGreaterThan(w.y);
  });

  it('le mur extérieur arrête ; on glisse le long', () => {
    const t = T(maison()), w = depart(t);
    const r = marcher(t, w, 0, 200, 50);                              // 10 m vers le haut : arrêté au mur nord
    expect(r.y).toBeLessThan(7_900 - 250 + 1); expect(r.y).toBeGreaterThan(7_500);
    const g = marcher(t, r, 200, 200, 20);                            // en biais contre le mur : il glisse selon x
    expect(g.x).toBeGreaterThan(r.x + 1_000);
  });

  it('la cloison arrête, sa porte laisse passer', () => {
    const t = T(maison());
    const w: Marcheur = { x: 6_000, y: 2_000, pied: 5, cap: Math.PI, tangage: 0 };
    expect(marcher(t, w, -200, 0, 20).x).toBeGreaterThan(4_000);      // à y = 2 m : la cloison
    const p = marcher(t, { ...w, y: 4_000 }, -200, 0, 20);              // à y = 4 m : la porte
    expect(p.x).toBeLessThan(3_000);
  });

  it('on monte l’escalier jusqu’au sol de l’étage, et on en redescend', () => {
    const t = T(maison(true));
    let w: Marcheur = { x: 7_000, y: 600, pied: 5, cap: Math.PI / 2, tangage: 0 };
    expect(libre(t, w, w.pied)).toBe(true);
    w = marcher(t, w, 0, 100, 60);                                      // 6 m vers +y : 14 marches, puis l'étage
    expect(w.pied).toBe(2_705);
    expect(w.y).toBeGreaterThan(1_000 + 14 * 270);
    w = marcher(t, w, 0, -100, 60);
    expect(w.pied).toBe(5);
  });

  it('sous l’escalier ou dans une allège : pas de passage ; le terrain dehors est à ±0,00', () => {
    const t = T(maison(true));
    /* venir de côté sur les hautes marches : arrêté */
    const w: Marcheur = { x: 8_500, y: 3_500, pied: 5, cap: Math.PI, tangage: 0 };
    expect(marcher(t, w, -100, 0, 30).x).toBeGreaterThan(7_450 + 250 - 1);
    expect(solSous(t, { x: -3_000, y: -3_000 }, 0)).toBe(0);
  });
});
