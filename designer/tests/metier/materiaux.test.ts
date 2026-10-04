/* Les matériaux : parement extérieur des murs de façade (une peau sur la
   face qui donne dehors), sol des pièces, en 3D, en façade et en coupe. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Project, type Wall } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { maquette, volume, EPAISSEUR_PAREMENT, EPAISSEUR_PEINTURE } from '../../src/vue3d/maquette';
import { aireSignee } from '../../src/geometry/polygon';
import { facade } from '../../src/vue3d/facades';
import { coupe } from '../../src/vue3d/coupe';
import { planchesPdf } from '../../src/export/planche';
import { PAREMENTS, PEINTURES, SOLS, materiau } from '../../src/catalogue/materiaux';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number, role: 'exterior' | 'partition' = 'exterior'): Commande =>
  ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: role === 'exterior' ? 200 : 70, role });

/** 10 × 8 m, une cloison à x = 4 m, deux pièces, une toiture en tuiles ; parement sur les quatre façades */
function maison(parement = 'enduit-ton-pierre'): { h: Historique; a: Acteur; n: string } {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p.buildings[0]!.floors[0]!.id;
  let h = ok(executer(nouvelHistorique(p), 'Murs', [M(n, 0, 0, 10_000, 0), M(n, 10_000, 0, 10_000, 8_000), M(n, 10_000, 8_000, 0, 8_000), M(n, 0, 8_000, 0, 0), M(n, 4_000, 0, 4_000, 8_000, 'partition'),
    { type: 'creerPiece', niveau: n, point: { x: 2_000, y: 4_000 }, nom: 'Chambre', usage: 'bedroom' }, { type: 'creerPiece', niveau: n, point: { x: 7_000, y: 4_000 }, nom: 'Séjour', usage: 'living' },
    { type: 'creerToiture', niveau: n, genre: 'hip', pente: 35, debord: 500, couverture: 'tile' }], a));
  const W = murs(h.projet);
  h = ok(executer(h, 'Parement', W.map(w => ({ type: 'modifierMur', id: w.id, finition: w.role === 'exterior' ? parement : 'bardage-bois-grise' }) as Commande), a));
  return { h, a, n };
}
/** la même maison, sans aucun parement */
function maisonSans(): Project {
  const { h, a } = maison();
  return ok(executer(h, 'Sans parement', murs(h.projet).map(w => ({ type: 'modifierMur', id: w.id, finition: null }) as Commande), a)).projet;
}
const murs = (p: Project) => Object.values(p.buildings[0]!.floors[0]!.objects).filter((o): o is Wall => o.type === 'wall');

describe('catalogue des matériaux', () => {
  it('identifiants uniques et lisibles, teintes #RRGGBB, ni prix ni marque', () => {
    const T = [...PAREMENTS, ...SOLS, ...PEINTURES];
    expect(new Set(T.map(m => m.id)).size).toBe(T.length);
    for (const m of T) { expect(m.id).toMatch(/^[a-z0-9-]+$/); expect(m.couleur).toMatch(/^#[0-9A-F]{6}$/i); expect(m.libelle).not.toMatch(/€|prix/i) }
    expect(materiau('inconnu')).toBeUndefined();
  });
});

describe('parement et sol : commandes', () => {
  it('parement posé puis retiré, annulable ; sol d’une pièce ; identifiant illisible refusé', () => {
    const { h, a } = maison();
    const w = murs(h.projet).find(x => x.role === 'exterior')!;
    expect(w.finish).toBe('enduit-ton-pierre');
    expect(murs(annuler(h).projet).find(x => x.id === w.id)!.finish).toBeUndefined();
    const h2 = ok(executer(h, 'x', [{ type: 'modifierMur', id: w.id, finition: null }], a));
    expect(murs(h2.projet).find(x => x.id === w.id)!.finish).toBeUndefined();
    expect(executer(h, 'x', [{ type: 'modifierMur', id: w.id, finition: 'Pas Un Id !' }], a).ok).toBe(false);
    const piece = Object.values(h.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'room')!;
    const h3 = ok(executer(h, 'x', [{ type: 'modifierPiece', id: piece.id, sol: 'parquet-chene' }], a));
    expect(maquette(h3.projet).prismes.some(p => p.matiere === 'sol' && p.finition === 'parquet-chene')).toBe(true);
    expect(annuler(h3).projet.buildings[0]!.floors[0]!.objects[piece.id]!).not.toHaveProperty('floorFinish');
  });
});

describe('parement en 3D, en façade, en coupe', () => {
  it('une peau de 2 cm sur la face extérieure seulement ; la cloison n’en a pas ; le volume des murs ne change pas', () => {
    const { h } = maison(), m = maquette(h.projet, undefined, { toiture: false });
    const peaux = m.prismes.filter(p => p.matiere === 'parement');
    expect(peaux.length).toBeGreaterThanOrEqual(4);
    expect(peaux.every(p => p.finition === 'enduit-ton-pierre')).toBe(true);
    /* au sud, la peau est entre −0,10 et −0,08 m (dehors), pas côté pièce */
    const sud = peaux.filter(p => Math.max(...p.contour.map(q => q.y)) <= 0);
    expect(sud.length).toBeGreaterThan(0);
    for (const p of sud) { expect(Math.min(...p.contour.map(q => q.y))).toBeCloseTo(-100, 3); expect(Math.max(...p.contour.map(q => q.y))).toBeCloseTo(-100 + EPAISSEUR_PAREMENT, 3) }
    const sans = maquette(maisonSans(), undefined, { toiture: false });
    const vol = (x: typeof m) => x.prismes.filter(p => p.matiere === 'mur' || p.matiere === 'parement' || p.matiere === 'cloison').reduce((s, p) => s + volume(p), 0);
    expect(vol(m) / 1e9).toBeCloseTo(vol(sans) / 1e9, 3);
  });

  it('la façade sud est peinte du parement ; la planche des façades liste les matériaux', () => {
    const { h, n } = maison();
    const f = facade(maquette(h.projet), 'sud');
    expect(f.faces.some(x => x.finition === 'enduit-ton-pierre')).toBe(true);
    const s = Array.from(planchesPdf(h.projet, { niveaux: [n], cotation: true, mobilier: true, indice: 'A', date: '04/10/2026', facades: true }), c => String.fromCharCode(c)).join('');
    for (const t of ['(MAT\xC9RIAUX)', '(Enduit ton pierre)', '(Couverture : tuiles)']) expect(s).toContain(t);
  });

  it('en coupe, la peau est tranchée avec le mur', () => {
    const { h } = maison();
    const c = coupe(maquette(h.projet), { a: { x: 7_000, y: -2_000 }, b: { x: 7_000, y: 10_000 }, regard: { x: 1, y: 0 }, nom: 'A' });
    expect(c.coupees.filter(x => x.matiere === 'parement')).toHaveLength(2);
  });
});

describe('peinture des murs intérieurs', () => {
  /** la maison, une porte de 0,90 × 2,15 dans la cloison (à y = 4 m), la chambre peinte en vert sauge */
  function peinte() {
    const { h, a, n } = maison();
    const cl = murs(h.projet).find(w => w.role === 'partition')!;
    const chambre = Object.values(h.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'room' && o.name === 'Chambre')!;
    return { a, n, h: ok(executer(h, 'Peinture', [{ type: 'creerOuverture', mur: cl.id, position: 4_000, largeur: 900, hauteur: 2_150, allege: 0, genre: 'door' },
      { type: 'modifierPiece', id: chambre.id, murs: 'peinture-vert-sauge' }], a)), chambre: chambre.id };
  }
  const aire = (P: { contour: readonly { x: number; y: number }[]; trous?: readonly (readonly { x: number; y: number }[])[] }) => Math.abs(aireSignee(P.contour)) - (P.trous ?? []).reduce((t, r) => t + Math.abs(aireSignee(r)), 0);

  it('une peau de 3 mm contre les murs de la pièce, du sol au haut des murs, ouverte à la porte (linteau peint)', () => {
    const { h, chambre } = peinte(), m = maquette(h.projet, undefined, { toiture: false });
    const P = m.prismes.filter(p => p.matiere === 'peinture');
    expect(P.every(p => p.objet === chambre && p.finition === 'peinture-vert-sauge')).toBe(true);
    const plein = P.filter(p => p.z0 === 0 && p.z1 === 2_500), linteau = P.filter(p => p.z0 === 2_150 && p.z1 === 2_500);
    expect(linteau.length).toBeGreaterThan(0);
    /* la chambre fait 3,865 × 7,80 m entre faces (de 0,10 à 3,965 m) : un anneau de 3 mm, moins la largeur de la porte */
    const per = 2 * (3_865 + 7_800), attendu = per * EPAISSEUR_PEINTURE - 900 * EPAISSEUR_PEINTURE;
    expect(plein.reduce((t, p) => t + aire(p), 0) / attendu).toBeCloseTo(1, 1);
    /* rien dans le séjour, ni en façade */
    expect(P.every(p => p.contour.every(q => q.x < 4_000))).toBe(true);
  });

  it('commande annulable ; « non précisé » retire la peinture', () => {
    const { h, a, chambre } = peinte();
    expect(h.projet.buildings[0]!.floors[0]!.objects[chambre]).toHaveProperty('wallFinish', 'peinture-vert-sauge');
    const h2 = ok(executer(h, 'x', [{ type: 'modifierPiece', id: chambre, murs: null }], a));
    expect(maquette(h2.projet).prismes.some(p => p.matiere === 'peinture')).toBe(false);
    expect(executer(h, 'x', [{ type: 'modifierPiece', id: chambre, murs: 'Rouge !' }], a).ok).toBe(false);
  });
});
