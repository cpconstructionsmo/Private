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
