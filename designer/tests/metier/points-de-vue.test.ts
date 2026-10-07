/* Les points de prise de vue (outil I) : d'où chaque photographie du dossier
   a été prise (PCMI 6, 7, 8), reportés au plan de masse comme le demande le
   formulaire du permis. Une commande les pose, une autre les modifie ; le
   dossier les dessine au PCMI 2 et le dit sur les pages des photographies. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Viewpoint } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { champDeVue, pointsDeVue, DEMI_CHAMP } from '../../src/building';
import { dossierPc } from '../../src/export/planche';
import { JPEG } from './dossier.test';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, role: 'exterior' });
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');
const PV = (n: string, x: number, y: number, piece?: Viewpoint['piece']): Commande => ({ type: 'creerPointDeVue', niveau: n, a: { x, y }, b: { x: 5_000, y: 4_000 }, ...(piece ? { piece } : {}) });

function maison() {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p.buildings[0]!.floors[0]!.id;
  const h = ok(executer(nouvelHistorique(p), 'Maison', [M(n, 0, 0, 10_000, 0), M(n, 10_000, 0, 10_000, 8_000), M(n, 10_000, 8_000, 0, 8_000), M(n, 0, 8_000, 0, 0),
    { type: 'creerParcelle', niveau: n, contour: [{ x: -5_000, y: -8_000 }, { x: 25_000, y: -8_000 }, { x: 25_000, y: 17_000 }, { x: -5_000, y: 17_000 }], voies: [0] }], a));
  return { h, a, n };
}

describe('points de prise de vue', () => {
  it('posés sans pièce dite : PCMI 7, puis 8, puis 6 ; ensuite PCMI 7 de nouveau (plusieurs photographies proches)', () => {
    const { h, a, n } = maison();
    const h2 = ok(executer(h, 'Points de vue', [PV(n, 5_000, -6_000), PV(n, 20_000, -6_000), PV(n, -3_000, -6_000), PV(n, 0, -7_000)], a));
    expect(pointsDeVue(h2.projet).map(v => v.piece)).toEqual(['PCMI 6', 'PCMI 7', 'PCMI 7', 'PCMI 8']);
    /* annuler retire les quatre d'un coup */
    expect(pointsDeVue(annuler(h2).projet)).toHaveLength(0);
  });

  it('refusés : direction de moins de 50 cm, pièce inconnue ; modifiés : pièce et position, annulables', () => {
    const { h, a, n } = maison();
    const court = executer(h, 'x', [{ type: 'creerPointDeVue', niveau: n, a: { x: 0, y: -6_000 }, b: { x: 300, y: -6_000 } }], a);
    expect(court.ok ? '' : court.erreurs.join()).toMatch(/50 cm/);
    const inconnue = executer(h, 'x', [{ type: 'creerPointDeVue', niveau: n, a: { x: 0, y: -6_000 }, b: { x: 5_000, y: 0 }, piece: 'PCMI 9' as Viewpoint['piece'] }], a);
    expect(inconnue.ok ? '' : inconnue.erreurs.join()).toMatch(/PCMI 6, 7 ou 8/);
    const h2 = ok(executer(h, 'x', [PV(n, 5_000, -6_000)], a));
    const v = pointsDeVue(h2.projet)[0]!;
    const h3 = ok(executer(h2, 'x', [{ type: 'modifierPointDeVue', id: v.id, piece: 'PCMI 6', a: { x: 4_000, y: -7_000 } }], a));
    expect([pointsDeVue(h3.projet)[0]!.piece, pointsDeVue(h3.projet)[0]!.a]).toEqual(['PCMI 6', { x: 4_000, y: -7_000 }]);
    expect([pointsDeVue(annuler(h3).projet)[0]!.piece, pointsDeVue(annuler(h3).projet)[0]!.a]).toEqual(['PCMI 7', { x: 5_000, y: -6_000 }]);
  });

  it('le champ dessiné : 50° autour de la direction, jusqu’à la distance du point visé', () => {
    const v = { a: { x: 0, y: 0 }, b: { x: 0, y: 10_000 } } as Viewpoint;
    const c = champDeVue(v);
    expect(DEMI_CHAMP * 180 / Math.PI).toBeCloseTo(25, 9);
    expect(Math.hypot(c.gauche.x, c.gauche.y)).toBeCloseTo(10_000, 6);
    expect(c.gauche.x).toBeCloseTo(-10_000 * Math.sin(DEMI_CHAMP), 6);         // la gauche de qui regarde vers le haut du plan
    expect(c.droite.x).toBeCloseTo(10_000 * Math.sin(DEMI_CHAMP), 6);
  });

  it('au dossier : dessinés et listés au PCMI 2 ; la page d’une photographie dit son point de vue « reporté », les autres restent « à reporter »', () => {
    const { h, a, n } = maison();
    const P = ok(executer(h, 'x', [PV(n, 5_000, -6_000, 'PCMI 7')], a)).projet;
    const img = { jpeg: JPEG, largeur: 8, hauteur: 8 };
    const { octets, pieces } = dossierPc(P, { indice: 'A', date: '05/10/2026', photoProche: img, photoLointaine: img });
    const s = texte(octets);
    for (const t of ['(PRISES DE VUE)', '(PCMI 7 \x97 environnement proche)', '(PCMI 7)']) expect(s).toContain(t);
    expect(pieces.find(p => p.code === 'PCMI 7')!.note).toBe('point de vue reporté au PCMI 2');
    expect(pieces.find(p => p.code === 'PCMI 8')!.note).toBe('point de vue à reporter au PCMI 2');
    /* (la note est coupée en lignes dans la colonne) */
    /* la note coupée à la largeur des encadrés : son début suffit */
    expect(s).toContain('(Point et angle de prise de vue report\xE9s sur le plan de masse');
    /* la photographie lointaine n'a ni point de vue tracé ni légende : à reporter, à compléter */
    expect(s).toContain('(Point et angle de prise de vue \xE0 reporter sur le plan de masse');
  });
});
