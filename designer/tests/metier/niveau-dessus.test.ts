/* Ajouter un niveau en reprenant les murs du niveau du dessous : les murs de
   façade (ou tous) remontent à l'aplomb, avec leur épaisseur, leur tracé,
   leur composition, leur parement et leur qualification « porteur » ; ni
   ouvertures, ni pièces, ni décors, ni état existant ; les murs à démolir ne
   montent pas. L'étage repris forme un espace clos ; un seul Ctrl+Z retire
   le niveau et ses murs. Maison fictive de 10 × 8 m. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Project, type Wall } from '../../src/model';
import { annuler, commandesNiveauDessus, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { planDuNiveau } from '../../src/building';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 12) + (t += 1000)).toISOString(), id: generateurSequentiel('e') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
type MurD = Wall & { axis: { a: { x: number; y: number }; b: { x: number; y: number } } };
const murs = (p: Project, nom: string) => Object.values(p.buildings[0]!.floors.find(f => f.name === nom)!.objects).filter((o): o is MurD => o.type === 'wall');
const axes = (W: MurD[]) => W.map(w => [w.axis.a.x, w.axis.a.y, w.axis.b.x, w.axis.b.y].join(',')).sort();

function maison() {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') }), n = p.buildings[0]!.floors[0]!.id;
  const M = (x1: number, y1: number, x2: number, y2: number, role: Wall['role'] = 'exterior', id?: string): Commande =>
    ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: role === 'exterior' ? 200 : 70, role, justification: role === 'exterior' ? 'left' : 'center', ...(id ? { id } : {}) });
  const h = ok(executer(nouvelHistorique(p), 'RDC', [M(0, 0, 10_000, 0, 'exterior', 'sud'), M(10_000, 0, 10_000, 8_000), M(10_000, 8_000, 0, 8_000), M(0, 8_000, 0, 0),
    M(4_000, 0, 4_000, 8_000, 'partition'), M(10_000, 2_000, 12_000, 2_000, 'exterior', 'appentis'),
    { type: 'modifierMur', id: 'sud', finition: 'enduit-ton-pierre', decors: [{ from: 1_000, to: 3_000, finish: 'pierre-parement' }] },
    { type: 'modifierMur', id: 'appentis', phase: 'demolished' },
    { type: 'creerOuverture', mur: 'sud', position: 2_000, largeur: 1_200, hauteur: 1_250, allege: 950, genre: 'window' },
    { type: 'creerPiece', niveau: n, point: { x: 2_000, y: 4_000 }, nom: 'Séjour', usage: 'living' }], a));
  return { h, a };
}
const etage = (p: Project, murs: 'aucun' | 'exterieurs' | 'tous') =>
  commandesNiveauDessus(p, { batiment: p.buildings[0]!.id, nom: 'Étage', altitude: 2_750, hauteur: 2_500, murs }, 'etage', generateurSequentiel('w'));

describe('ajouter un niveau en reprenant les murs du dessous', () => {
  it('les murs extérieurs remontent à l’aplomb, avec leur épaisseur, leur tracé, leur parement et « porteur » ; rien d’autre', () => {
    const { h, a } = maison();
    const k = etage(h.projet, 'exterieurs');
    expect([k.repris, k.courbes, k.dessous?.name]).toEqual([4, 0, 'RDC']);
    const r = ok(executer(h, 'Ajouter un niveau', k.commandes, a));
    const E = murs(r.projet, 'Étage'), R = murs(r.projet, 'RDC').filter(w => w.role === 'exterior' && w.phase !== 'demolished');
    expect(axes(E)).toEqual(axes(R));
    expect(E.every(w => w.role === 'exterior' && w.thickness === 200 && w.justification === 'left' && w.loadBearing.value === true)).toBe(true);
    /* la hauteur : celle d'un mur de façade tracé sur ce niveau (hauteur sous plafond + arase) */
    expect(E.every(w => w.height === 2_700)).toBe(true);
    /* le parement suit, pas le décor de l'entrée ni l'état */
    const sud = E.find(w => w.axis.a.y === 0 && w.axis.b.y === 0)!;
    expect([sud.finish, sud.finishZones, sud.phase]).toEqual(['enduit-ton-pierre', undefined, undefined]);
    /* ni ouvertures ni pièces à l'étage ; mais un espace clos, prêt à nommer */
    const f = r.projet.buildings[0]!.floors.find(x => x.name === 'Étage')!;
    expect(Object.values(f.objects).filter(o => o.type === 'opening' || o.type === 'room')).toEqual([]);
    expect(planDuNiveau(f).zones).toHaveLength(1);
    /* un seul Ctrl+Z retire le niveau et ses murs */
    expect(annuler(r).projet).toEqual(h.projet);
  });

  it('« tous » reprend aussi les cloisons ; « aucun » pose un niveau vide ; un mur à démolir ne monte jamais', () => {
    const { h, a } = maison();
    const t = ok(executer(h, 'Niveau', etage(h.projet, 'tous').commandes, a));
    expect(murs(t.projet, 'Étage').map(w => w.role).sort()).toEqual(['exterior', 'exterior', 'exterior', 'exterior', 'partition']);
    expect(planDuNiveau(t.projet.buildings[0]!.floors.find(x => x.name === 'Étage')!).zones).toHaveLength(2);
    const v = ok(executer(h, 'Niveau', etage(h.projet, 'aucun').commandes, a));
    expect(murs(v.projet, 'Étage')).toEqual([]);
  });
});
