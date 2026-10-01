/* Phase 1, étape 3 — murs, pièces, ouvertures, métré : des plans construits
   par des commandes (comme le fera l'interface), puis lus par le moteur. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Floor, type Project, type Wall } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { contoursMurs, mursDroits, planDuNiveau } from '../../src/building';
import { aire, mm2EnM2 } from '../../src/geometry';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const rdc = (p: Project): Floor => p.buildings[0]!.floors[0]!;
const M = (n: string, x1: number, y1: number, x2: number, y2: number, e = 200, role: Wall['role'] = 'exterior'): Commande =>
  ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: e, role });
const boite = (n: string, L = 10_000, H = 8_000, e = 200): Commande[] =>
  [M(n, 0, 0, L, 0, e), M(n, L, 0, L, H, e), M(n, L, H, 0, H, e), M(n, 0, H, 0, 0, e)];

function maison(cmds: (n: string) => Commande[]): { h: Historique; a: Acteur; n: string } {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = rdc(p).id;
  return { h: ok(executer(nouvelHistorique(p), 'Plan', cmds(n), a)), a, n };
}
const m2 = (v: number): number => Math.round(mm2EnM2(v) * 10_000) / 10_000;

describe('murs : contours et jonctions', () => {
  it('angle en L : onglet exact (trapèze), sans recouvrement', () => {
    const { h } = maison(n => boite(n));
    const C = contoursMurs(mursDroits(rdc(h.projet)));
    expect(C[0]!.contour).toEqual([{ x: -100, y: -100 }, { x: 10_100, y: -100 }, { x: 9_900, y: 100 }, { x: 100, y: 100 }]);
    const somme = C.reduce((t, c) => t + aire({ contour: c.contour }), 0);
    const P = planDuNiveau(rdc(h.projet));
    /* murs disjoints : la somme des murs = la maçonnerie = 10,2 × 8,2 − 9,8 × 7,8 */
    expect(m2(somme)).toBe(7.2);
    expect(m2(P.maconnerie.reduce((t, p) => t + aire(p), 0))).toBe(7.2);
  });

  it('angle quelconque (60°) : l’onglet ferme l’angle sans encoche ni chevauchement', () => {
    const { h } = maison(n => [M(n, 0, 0, 6_000, 0), M(n, 6_000, 0, 3_000, 5_196.152), M(n, 3_000, 5_196.152, 0, 0)]);
    const C = contoursMurs(mursDroits(rdc(h.projet)));
    const somme = C.reduce((t, c) => t + aire({ contour: c.contour }), 0);
    const P = planDuNiveau(rdc(h.projet));
    /* sur des murs obliques, l'arrondi des sommets au 0,01 mm déplace les
       arêtes d'au plus 0,005 mm : écart ≤ périmètre × 0,01 mm (ici < 400 mm²).
       Une encoche ou un recouvrement à cet angle ferait des dizaines de
       milliers de mm². */
    const perim = C.reduce((t, c) => t + c.contour.reduce((s, p, i) => { const q = c.contour[(i + 1) % c.contour.length]!; return s + Math.hypot(q.x - p.x, q.y - p.y) }, 0), 0);
    expect(Math.abs(P.maconnerie.reduce((t, p) => t + aire(p), 0) - somme)).toBeLessThan(perim * 0.01);
    expect(P.zones).toHaveLength(1);
  });

  it('jonction en T : la cloison s’arrête à la face du mur, sans le modifier', () => {
    const { h } = maison(n => [...boite(n), M(n, 4_000, 0, 4_000, 8_000, 100, 'partition')]);
    const C = contoursMurs(mursDroits(rdc(h.projet)));
    const cloison = C[4]!.contour;
    expect(cloison).toEqual([{ x: 4_050, y: 100 }, { x: 4_050, y: 7_900 }, { x: 3_950, y: 7_900 }, { x: 3_950, y: 100 }]);
    expect(C[0]!.contour).toEqual([{ x: -100, y: -100 }, { x: 10_100, y: -100 }, { x: 9_900, y: 100 }, { x: 100, y: 100 }]);
  });

  it('justification : un mur dessiné par sa face intérieure', () => {
    const { h } = maison(n => [{ type: 'creerMur', niveau: n, a: { x: 0, y: 0 }, b: { x: 5_000, y: 0 }, epaisseur: 200, justification: 'left' }]);
    expect(contoursMurs(mursDroits(rdc(h.projet)))[0]!.contour).toEqual([{ x: 0, y: -200 }, { x: 5_000, y: -200 }, { x: 5_000, y: 0 }, { x: 0, y: 0 }]);
  });
});

describe('pièces détectées', () => {
  it('une boîte de 10 × 8 m d’axe, murs de 20 cm : un espace clos de 76,44 m², « à nommer »', () => {
    const P = planDuNiveau(rdc(maison(n => boite(n)).h.projet));
    expect(P.zones).toHaveLength(1);
    expect(m2(P.zones[0]!.aire)).toBe(76.44);
    expect(P.zones[0]!.perimetre).toBe(2 * (9_800 + 7_800));
    expect(P.alertes.map(a => a.genre)).toEqual(['a_nommer']);
  });

  it('une cloison de 10 cm à 4 m : 3,85 × 7,80 et 5,85 × 7,80 ; noms gardés quand elle se déplace', () => {
    const { h, a, n } = maison(n => [...boite(n), M(n, 4_000, 0, 4_000, 8_000, 100, 'partition'),
      { type: 'creerPiece', niveau: n, point: { x: 1_000, y: 4_000 }, nom: 'Chambre 1', usage: 'bedroom' },
      { type: 'creerPiece', niveau: n, point: { x: 8_000, y: 4_000 }, nom: 'Séjour', usage: 'living' }]);
    const P = planDuNiveau(rdc(h.projet));
    const S = (P0: typeof P, nom: string) => m2(P0.zones.find(z => z.piece?.name === nom)!.aire);
    expect(S(P, 'Chambre 1')).toBe(30.03);
    expect(S(P, 'Séjour')).toBe(45.63);
    expect(P.alertes).toEqual([]);
    /* la cloison passe à 5 m : surfaces recalculées, noms conservés */
    const cloison = Object.values(rdc(h.projet).objects).find(o => o.type === 'wall' && o.thickness === 100)!;
    const h2 = ok(executer(h, 'Déplacer', [{ type: 'deplacerMur', id: cloison.id, a: { x: 5_000, y: 0 }, b: { x: 5_000, y: 8_000 } }], a));
    const P2 = planDuNiveau(rdc(h2.projet));
    expect(S(P2, 'Chambre 1')).toBe(4.85 * 7.8);
    expect(S(P2, 'Séjour')).toBe(4.85 * 7.8);
    /* surfaces : avant et après, la somme est la même (la cloison a la même emprise) */
    expect(m2(P2.zones.reduce((t, z) => t + z.aire, 0))).toBe(m2(P.zones.reduce((t, z) => t + z.aire, 0)));
    /* annuler : retour aux surfaces d'avant */
    expect(S(planDuNiveau(rdc(annuler(h2).projet)), 'Chambre 1')).toBe(30.03);
  });

  it('deux cloisons en croix : quatre pièces', () => {
    const P = planDuNiveau(rdc(maison(n => [...boite(n), M(n, 5_000, 0, 5_000, 8_000, 100, 'partition'), M(n, 0, 4_000, 10_000, 4_000, 100, 'partition')]).h.projet));
    expect(P.zones).toHaveLength(4);
    expect(m2(P.zones.reduce((t, z) => t + z.aire, 0))).toBe(m2(9_800 * 7_800 - 100 * 7_800 - 100 * 9_700));
  });

  it('une cloison qui ne rejoint pas le mur d’en face : un seul espace (rien n’est deviné)', () => {
    const P = planDuNiveau(rdc(maison(n => [...boite(n), M(n, 4_000, 0, 4_000, 6_000, 100, 'partition')]).h.projet));
    expect(P.zones).toHaveLength(1);
  });

  it('une pièce nommée hors de tout espace clos : signalée « non fermée »', () => {
    const P = planDuNiveau(rdc(maison(n => [...boite(n), { type: 'creerPiece', niveau: n, point: { x: 20_000, y: 0 }, nom: 'Garage', usage: 'garage' }]).h.projet));
    expect(P.alertes.some(a => a.genre === 'non_fermee' && /Garage/.test(a.message))).toBe(true);
  });

  it('deux pièces nommées dans le même espace : signalées', () => {
    const P = planDuNiveau(rdc(maison(n => [...boite(n),
      { type: 'creerPiece', niveau: n, point: { x: 1_000, y: 1_000 }, nom: 'Cuisine', usage: 'kitchen' },
      { type: 'creerPiece', niveau: n, point: { x: 8_000, y: 6_000 }, nom: 'Séjour', usage: 'living' }]).h.projet));
    expect(P.alertes.some(a => a.genre === 'doublon')).toBe(true);
  });
});

describe('ouvertures et métré des baies', () => {
  const avecOuvertures = () => {
    const { h, a, n } = maison(n => [...boite(n), M(n, 4_000, 0, 4_000, 8_000, 100, 'partition'),
      { type: 'creerPiece', niveau: n, point: { x: 1_000, y: 4_000 }, nom: 'Chambre 1', usage: 'bedroom' },
      { type: 'creerPiece', niveau: n, point: { x: 8_000, y: 4_000 }, nom: 'Séjour', usage: 'living' }]);
    const O = Object.values(rdc(h.projet).objects);
    const facade = O.find(o => o.type === 'wall' && 'a' in o.axis && o.axis.a.y === 0 && o.axis.b.y === 0)!;
    const cloison = O.find(o => o.type === 'wall' && o.thickness === 100)!;
    const h2 = ok(executer(h, 'Ouvertures', [
      { type: 'creerOuverture', mur: facade.id, position: 7_000, largeur: 2_400, hauteur: 2_150, genre: 'bay' },
      { type: 'creerOuverture', mur: cloison.id, position: 4_000, largeur: 830, hauteur: 2_040, genre: 'door', sens: { side: 'left', inward: true } }], a));
    return { h: h2, a };
  };

  it('une baie en façade : extérieure, côté séjour ; une porte en cloison : entre deux pièces', () => {
    const P = planDuNiveau(rdc(avecOuvertures().h.projet));
    const baie = P.baies.find(b => b.genre === 'bay')!, porte = P.baies.find(b => b.genre === 'door')!;
    expect(baie).toMatchObject({ exterieure: true, largeur: 2_400, hauteur: 2_150, surface: 2_400 * 2_150 });
    expect(baie.cotes).toContain('Séjour');
    expect(baie.cotes).toContain('extérieur');
    expect(porte.exterieure).toBe(false);
    expect([...porte.cotes].sort()).toEqual(['Chambre 1', 'Séjour']);
  });

  it('une porte ne réunit pas deux pièces : toujours deux espaces', () => {
    expect(planDuNiveau(rdc(avecOuvertures().h.projet)).zones).toHaveLength(2);
  });

  it('les ouvertures sont découpées dans la maçonnerie dessinée, pas dans celle qui sert aux pièces', () => {
    const P = planDuNiveau(rdc(avecOuvertures().h.projet));
    const s = (L: { contour: readonly { x: number; y: number }[]; trous?: readonly (readonly { x: number; y: number }[])[] }[]) => L.reduce((t, p) => t + aire(p), 0);
    expect(m2(s(P.maconnerie) - s(P.maconnerieOuverte))).toBe(m2(2_400 * 200 + 830 * 100));
  });

  it('baie élargie de 2,40 à 3,50 m : métré mis à jour, le reste ne bouge pas', () => {
    const { h, a } = avecOuvertures();
    const P = planDuNiveau(rdc(h.projet));
    const baie = P.baies.find(b => b.genre === 'bay')!;
    const h2 = ok(executer(h, 'Élargir', [{ type: 'modifierOuverture', id: baie.id, largeur: 3_500 }], a));
    const P2 = planDuNiveau(rdc(h2.projet));
    expect(P2.baies.find(b => b.id === baie.id)).toMatchObject({ largeur: 3_500, surface: 3_500 * 2_150 });
    expect(P2.zones.map(z => z.aire)).toEqual(P.zones.map(z => z.aire));
  });
});

describe('cache et performance', () => {
  it('même niveau, même plan (cache) ; niveau modifié, plan recalculé', () => {
    const { h, a, n } = maison(n => boite(n));
    expect(planDuNiveau(rdc(h.projet))).toBe(planDuNiveau(rdc(h.projet)));
    const h2 = ok(executer(h, 'Mur', [M(n, 4_000, 0, 4_000, 8_000, 100, 'partition')], a));
    expect(planDuNiveau(rdc(h2.projet)).zones).toHaveLength(2);
  });

  it('une grille de 12 × 10 pièces (240 murs) : plan calculé en moins de 2 s', () => {
    const { h } = maison(n => {
      const L: Commande[] = [];
      for (let i = 0; i <= 12; i++) L.push(M(n, i * 3_000, 0, i * 3_000, 30_000, 150, 'partition'));
      for (let j = 0; j <= 10; j++) L.push(M(n, 0, j * 3_000, 36_000, j * 3_000, 150, 'partition'));
      return L;
    });
    const t0 = performance.now();
    const P = planDuNiveau(rdc(h.projet));
    expect(performance.now() - t0).toBeLessThan(2_000);
    expect(P.zones).toHaveLength(120);
  });
});
