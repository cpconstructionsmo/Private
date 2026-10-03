/* Copier, coller, couper : un groupe recollé à l'identique, déplacé, tourné
   d'un quart de tour ou retourné ; un seul « annuler » ; la suppression d'un
   groupe ne bute pas sur ce qu'un mur emporte déjà. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Floor, type Furniture, type Opening, type Project, type Wall } from '../../src/model';
import { annuler, commandesColler, commandesSupprimer, copier, executer, nouvelHistorique, resumePressePapiers, type Acteur, type Commande, type Historique } from '../../src/engine';
import { mursDroits, planDuNiveau } from '../../src/building';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const rdc = (p: Project): Floor => p.buildings[0]!.floors[0]!;
const M = (n: string, x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, role: 'exterior' });

/** une cellule fictive de 4 × 3 m : 4 murs, une porte (charnière à gauche), une pièce, un lit, une cote, une contrainte */
function cellule() {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = rdc(p).id;
  let h = ok(executer(nouvelHistorique(p), 'Murs', [M(n, 0, 0, 4_000, 0), M(n, 4_000, 0, 4_000, 3_000), M(n, 4_000, 3_000, 0, 3_000), M(n, 0, 3_000, 0, 0)], a));
  const W = mursDroits(rdc(h.projet)), bas = W.find(w => w.axis.a.y === 0 && w.axis.b.y === 0)!, est = W.find(w => w.axis.a.x === 4_000 && w.axis.b.x === 4_000)!;
  h = ok(executer(h, 'Garnir', [
    { type: 'creerOuverture', mur: bas.id, position: 1_000, largeur: 900, hauteur: 2_150, genre: 'door', sens: { side: 'left', inward: true } },
    { type: 'creerPiece', niveau: n, point: { x: 2_000, y: 1_500 }, nom: 'Chambre', usage: 'bedroom' },
    { type: 'creerMeuble', niveau: n, modele: { id: 'lit-140', label: 'Lit 140 × 190' }, position: { x: 2_000, y: 1_050 }, rotation: 0, largeur: 1_400, profondeur: 1_900, hauteur: 500 },
    { type: 'creerCote', niveau: n, refs: [{ objectId: bas.id, feature: 'axis' }, { objectId: W.find(w => w.axis.a.y === 3_000 && w.axis.b.y === 3_000)!.id, feature: 'axis' }] },
    { type: 'ajouterContrainte', niveau: n, genre: 'vertical', murs: [est.id] }], a));
  return { h, a, n, f: rdc(h.projet) };
}
const ids = (f: Floor) => Object.keys(f.objects);
let k = 0;
const nouvelId = () => 'colle' + String(++k).padStart(4, '0');

describe('presse-papiers', () => {
  it('copier un mur emporte ses ouvertures ; cotes et contraintes seulement si tous leurs murs viennent', () => {
    const { f } = cellule();
    const bas = mursDroits(f).find(w => w.axis.a.y === 0 && w.axis.b.y === 0)!;
    const pp = copier(f, [bas.id])!;
    expect(pp.objets.map(o => o.type).sort()).toEqual(['opening', 'wall']);
    const tout = copier(f, ids(f))!;
    expect(tout.objets.filter(o => o.type === 'dimension')).toHaveLength(1);
    expect(tout.objets.filter(o => o.type === 'constraint')).toHaveLength(1);
    expect(tout.ancre).toEqual({ x: 0, y: 0 });
    expect(resumePressePapiers(tout)).toBe('4 murs, 1 ouverture, 1 pièce, 1 meuble');
    expect(copier(f, [])).toBeNull();
  });

  it('coller à 6 m : une seconde cellule identique, un seul « annuler » la retire', () => {
    const { h, a, n, f } = cellule();
    const cmds = commandesColler(copier(f, ids(f))!, n, { origine: { x: 6_000, y: 0 } }, nouvelId);
    const h2 = ok(executer(h, 'Coller', cmds, a));
    const f2 = rdc(h2.projet), P = planDuNiveau(f2);
    expect(P.zones.map(z => Math.round(z.aire / 1e4) / 100)).toEqual([10.64, 10.64]);
    expect(P.zones.every(z => z.piece?.name === 'Chambre')).toBe(true);
    const lits = Object.values(f2.objects).filter((o): o is Furniture => o.type === 'furniture');
    expect(lits.map(l => l.position.x).sort((x, y) => x - y)).toEqual([2_000, 8_000]);
    expect(Object.values(f2.objects).filter(o => o.type === 'dimension')).toHaveLength(2);
    expect(annuler(h2).projet).toEqual(h.projet);
  });

  it('miroir gauche-droite : la porte change de charnière, le lit reste face à la pièce', () => {
    const { h, a, n, f } = cellule();
    const h2 = ok(executer(h, 'Coller', commandesColler(copier(f, ids(f))!, n, { origine: { x: 10_000, y: 0 }, miroirX: true }, nouvelId), a));
    const f2 = rdc(h2.projet);
    const portes = Object.values(f2.objects).filter((o): o is Opening => o.type === 'opening');
    expect(portes.map(p => p.swing!.side).sort()).toEqual(['left', 'right']);
    const colle = Object.values(f2.objects).filter((o): o is Furniture => o.type === 'furniture').find(l => l.position.x > 4_000)!;
    expect(colle.position).toEqual({ x: 8_000, y: 1_050 });
    expect(Math.cos(colle.rotation)).toBeCloseTo(1, 9);                  // toujours dos au mur du bas
    expect(planDuNiveau(f2).zones).toHaveLength(2);
  });

  it('quart de tour : un mur « vertical » devient « horizontal », le lit se tourne avec la cellule', () => {
    const { h, a, n, f } = cellule();
    const h2 = ok(executer(h, 'Coller', commandesColler(copier(f, ids(f))!, n, { origine: { x: 0, y: 6_000 }, quarts: 1 }, nouvelId), a));
    const f2 = rdc(h2.projet);
    const K = Object.values(f2.objects).filter(o => o.type === 'constraint');
    expect(K.map(c => c.type === 'constraint' && c.kind).sort()).toEqual(['horizontal', 'vertical']);
    const colle = Object.values(f2.objects).filter((o): o is Furniture => o.type === 'furniture').find(l => l.position.y > 3_000)!;
    expect(colle.position.x).toBeCloseTo(-1_050, 6); expect(colle.position.y).toBeCloseTo(8_000, 6);
    expect(Math.sin(colle.rotation)).toBeCloseTo(1, 9);
    const murs = mursDroits(f2).filter(w => Math.min(w.axis.a.y, w.axis.b.y) >= 6_000);
    expect(murs).toHaveLength(4);
    expect(planDuNiveau(f2).zones).toHaveLength(2);
  });

  it('supprimer un groupe : murs, ouvertures et cotes ensemble, sans double suppression', () => {
    const { h, a, f } = cellule();
    const h2 = ok(executer(h, 'Supprimer', commandesSupprimer(f, ids(f)), a));
    expect(Object.keys(rdc(h2.projet).objects)).toHaveLength(0);
    expect((rdc(h.projet).objects[ids(f)[0]!] as Wall)).toBeTruthy();
  });
});
