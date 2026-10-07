/* Phase 1 bis — l'import d'un plan lu par l'atelier (ADR-0004), sur le RDC
   fictif de l'atelier (atelier/tests/cas_fictif.py : aucune donnée client).
   Les surfaces attendues sont celles calculées à la main dans ce fichier. */
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/atelier_fictif.json?raw';
import { canonique, creerProjet, generateurSequentiel, type Floor, type Project, type Wall } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Historique } from '../../src/engine';
import { planDuNiveau } from '../../src/building';
import { axesDesMurs, commandesImport, comparerSurfaces, lireModeleAtelier, traitsSource, type ModeleAtelier } from '../../src/import';

const ATTENDU: Record<string, number> = { 'Séjour - cuisine': 37.00, 'Garage': 24.42, 'Chambre 1': 13.26, "Salle d'eau": 8.58, 'Chambre 2': 10.14 };
const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const rdc = (p: Project): Floor => p.buildings[0]!.floors[0]!;
const modele = (): ModeleAtelier => lireModeleAtelier(JSON.parse(fixture));

function importer(m: ModeleAtelier) {
  const p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = rdc(p).id;
  const { commandes, rapport } = commandesImport(m, n, generateurSequentiel('m'));
  const r = executer(nouvelHistorique(p), 'Import du RDC', commandes, acteur());
  if (!r.ok) throw new Error(r.erreurs.join(' ; '));
  return { depart: p, h: r.historique as Historique, rapport, f: rdc(r.historique.projet) };
}
const surfaces = (f: Floor) => Object.fromEntries(planDuNiveau(f).zones.map(z => [z.piece?.name ?? '?', Math.round(z.aire / 1e4) / 100]));

/** le même modèle, tourné et déplacé (un plan n'est pas toujours d'équerre avec les axes) */
function tourner(m: ModeleAtelier, angle: number, dx: number, dy: number): ModeleAtelier {
  const c = Math.cos(angle), s = Math.sin(angle);
  const r = ([x, y]: [number, number]): [number, number] => [x * c - y * s + dx, x * s + y * c + dy];
  const n = m.batiment.niveaux[0]!;
  return { ...m, batiment: { niveaux: [{ ...n,
    murs: n.murs.map(w => ({ ...w, polygone: w.polygone.map(r), trous: (w.trous ?? []).map(t => t.map(r)) })),
    ouvertures: n.ouvertures.map(o => ({ ...o, position: r(o.position) })),
    pieces: n.pieces.map(p => ({ ...p, polygone: p.polygone.map(r) })) }] } };
}

describe('import du modèle de l’atelier', () => {
  it('murs : axes et épaisseurs tirés des régions dessinées, jonctions exactes', () => {
    const { axes, avertissements } = axesDesMurs(modele().batiment.niveaux[0]!.murs);
    expect(avertissements).toEqual([]);
    const ext = axes.filter(a => a.exterieur), cl = axes.filter(a => !a.exterieur);
    expect(ext).toHaveLength(4);
    expect(ext.every(a => a.epaisseur === 300)).toBe(true);
    expect(cl).toHaveLength(4);
    expect(cl.every(a => a.epaisseur === 100)).toBe(true);
    /* les façades se ferment sur leurs axes (15 cm à l'intérieur du nu extérieur) */
    const sommets = new Set(ext.flatMap(a => [a.a, a.b]).map(p => p.x + ',' + p.y));
    expect([...sommets].sort()).toEqual(['11850,150', '11850,8850', '150,150', '150,8850']);
  });

  it('pièces : les surfaces de l’atelier, au centième de m², noms et usages gardés, aucune alerte', () => {
    const { f, rapport } = importer(modele());
    expect(surfaces(f)).toEqual(ATTENDU);
    expect(planDuNiveau(f).alertes).toEqual([]);
    const P = Object.values(f.objects).filter(o => o.type === 'room');
    expect(P.map(p => p.type === 'room' && [p.name, p.usage]).sort()).toEqual([
      ['Chambre 1', 'bedroom'], ['Chambre 2', 'bedroom'], ['Garage', 'garage'], ["Salle d'eau", 'bathroom'], ['Séjour - cuisine', 'living']]);
    const z = planDuNiveau(f).zones.map(z => ({ nom: z.piece?.name ?? null, m2: z.aire / 1e6 }));
    expect(comparerSurfaces(rapport, z).every(e => e.ecart === 0)).toBe(true);
  });

  it('ouvertures : posées sur leur mur ; hauteur et allège non lues → valeur courante « à vérifier »', () => {
    const { f, rapport } = importer(modele());
    expect(rapport).toMatchObject({ murs: 8, ouvertures: 11, pieces: 5, avertissements: [] });
    const O = Object.values(f.objects).filter(o => o.type === 'opening');
    expect(O).toHaveLength(11);
    const garage = O.find(o => o.type === 'opening' && o.kind === 'garage_door')!;
    expect(garage).toMatchObject({ width: 2_400, status: 'to_check' });
    expect((garage.meta as { aVerifier: string[] }).aVerifier.join(' ')).toMatch(/hauteur : valeur courante 2,00 m — manque/);
    expect(planDuNiveau(f).baies.filter(b => b.exterieure)).toHaveLength(7);
  });

  it('provenance et statuts : source « import » datée, porteur jamais confirmé sans document', () => {
    const { f } = importer(modele());
    const W = Object.values(f.objects).filter((o): o is Wall => o.type === 'wall');
    expect(W.every(w => w.status === 'derived' && w.sourceRefs[0]!.kind === 'import' && w.sourceRefs[0]!.documentId === 'fictif.dxf')).toBe(true);
    expect(W.every(w => w.loadBearing.status === 'to_check')).toBe(true);
    expect(W.find(w => w.role === 'exterior')!.loadBearing).toMatchObject({ value: true, consequence: expect.stringMatching(/permis/) });
  });

  it('un seul « annuler » retire tout l’import', () => {
    const { depart, h } = importer(modele());
    expect(canonique(annuler(h).projet)).toBe(canonique(depart));
  });

  it('plan tourné de 23° et déplacé : mêmes murs, mêmes surfaces', () => {
    const { f } = importer(tourner(modele(), 23 * Math.PI / 180, 1_234.5, -987.6));
    expect(surfaces(f)).toEqual(ATTENDU);
    expect(planDuNiveau(f).alertes).toEqual([]);
  });

  it('les pièces de l’atelier restent fermées : porte au bout d’une cloison, passage ouvert, éclat dans un mur', () => {
    /* 10 × 6 m (murs de 20 cm) ; une cloison verticale qui s'arrête à 1,30 m du mur (passage ouvert vers le séjour) ;
       une cloison horizontale qui s'arrête à 1,80 m du mur, une porte lue dans l'écart ; un éclat de 5 cm dans le mur de droite */
    const val = (v: number) => ({ valeur: v, statut: 'confirme' as const });
    const R = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const piece = (id: string, nom: string, usage: string, P: [number, number][]) => ({ id, nom, usage, polygone: P, surface_calculee: 0 });
    const m: ModeleAtelier = { schema_version: 1, batiment: { niveaux: [{
      murs: [
        { id: 'M1', polygone: R(0, 0, 10, 6), trous: [R(0.2, 0.2, 9.8, 5.8)], epaisseur: 0.2, exterieur: true },
        { id: 'M2', polygone: R(3.965, 0.2, 4.035, 4.5), epaisseur: 0.07, exterieur: false },
        { id: 'M3', polygone: R(4.035, 2.965, 8.0, 3.035), epaisseur: 0.07, exterieur: false },
        { id: 'M4', polygone: R(9.81, 4.0, 9.99, 4.05), epaisseur: 0.05, exterieur: false }],
      ouvertures: [{ id: 'O1', type: 'porte', position: [8.9, 3.0], largeur: val(0.8), hauteur: val(2.04), allege: val(0) }],
      pieces: [piece('P1', 'Séjour', 'sejour', R(0.2, 0.2, 3.965, 5.8)), piece('P2', 'Chambre', 'chambre', R(4.035, 0.2, 9.8, 2.965)), piece('P3', 'Bureau', 'chambre', R(4.035, 3.035, 9.8, 5.8))],
    }] } };
    const { f, rapport } = importer(m);
    const S = surfaces(f);
    expect(Object.keys(S).sort()).toEqual(['Bureau', 'Chambre', 'Séjour']);
    expect(S['Chambre']).toBeCloseTo(5.765 * 2.765, 1);
    expect(S['Bureau']).toBeCloseTo(5.765 * 2.765, 1);
    /* la cloison horizontale traverse l'écart jusqu'au mur, la porte s'y pose ; le passage ouvert : une cloison fictive */
    const W = Object.values(f.objects).filter((o): o is Wall => o.type === 'wall');
    expect(W.filter(w => w.role === 'virtual')).toHaveLength(1);
    expect(Object.values(f.objects).filter(o => o.type === 'opening')).toHaveLength(1);
    expect(rapport.avertissements.some(a => a.includes('cloison fictive'))).toBe(true);
    expect(rapport.avertissements.some(a => a.includes('Éclat'))).toBe(true);
    expect(W.some(w => 'a' in w.axis && Math.hypot(w.axis.b.x - w.axis.a.x, w.axis.b.y - w.axis.a.y) < 300)).toBe(false);
  });

  it('un fichier qui n’est pas un modèle de l’atelier est refusé, avec la raison', () => {
    expect(() => lireModeleAtelier({ name: 'autre' })).toThrow(/pas un modèle de l’atelier/);
    expect(() => lireModeleAtelier({ schema_version: 9, batiment: { niveaux: [{ murs: [{}] }] } })).toThrow(/plus récente/);
    expect(() => lireModeleAtelier({ batiment: { niveaux: [{ murs: [], ouvertures: [], pieces: [] }] } })).toThrow(/aucun mur/);
  });

  it('les traits du plan source, pour un fond de contrôle', () => {
    const t = traitsSource(modele())!;
    expect(t.traits.length).toBeGreaterThan(20);
    expect(t.boite).toMatchObject({ xmin: 0, ymin: 0, xmax: 12_000, ymax: 9_000 });
  });
});
