/* Meubler les pièces : chaque pièce vide reçoit le mobilier de son usage,
   dans la pièce, sans chevauchement, le passage des portes libre, aucun
   meuble haut devant une fenêtre ; une pièce déjà meublée n'est pas
   touchée ; ce qui ne tient pas est dit. Plan fictif de l'atelier, et
   pièces fictives tracées ici. */
import { describe, expect, it } from 'vitest';
import { canonique, creerProjet, generateurSequentiel, type Floor, type Project } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { meublerNiveau, planDuNiveau, mursDroits, geometrieOuverture, emprise, blocs, traits, PASSAGE_SEUL, type MeublePropose } from '../../src/building';
import { modeleMeuble } from '../../src/catalogue/mobilier';
import { commandesImport, lireModeleAtelier } from '../../src/import/atelier';
import { aire } from '../../src/geometry/polygon';
import { intersection } from '../../src/geometry/booleen';
import { positionDansAnneau } from '../../src/geometry/predicats';
import { dossierPc } from '../../src/export/planche';
import fixture from '../fixtures/atelier_fictif.json?raw';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const rdc = (p: Project): Floor => p.buildings[0]!.floors[0]!;
const commandes = (n: string, L: MeublePropose[]): Commande[] => L.map(m => ({ type: 'creerMeuble', niveau: n, modele: { id: m.modele.id, label: m.modele.libelle },
  position: m.position, rotation: m.rotation, largeur: m.modele.largeur, profondeur: m.modele.profondeur, hauteur: m.modele.hauteur }));
const corps = (m: MeublePropose) => emprise({ position: m.position, rotation: m.rotation, width: m.modele.largeur, depth: m.modele.profondeur });
const chevauchement = (A: { x: number; y: number }[], B: { x: number; y: number }[]) => intersection([{ contour: A }], [{ contour: B }]).reduce((s, p) => s + aire(p), 0);

function maisonFictive() {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = rdc(p).id;
  let k = 0;
  const h = ok(executer(nouvelHistorique(p), 'Import', commandesImport(lireModeleAtelier(JSON.parse(fixture)), n, () => 'imp' + (++k)).commandes, a));
  return { h, a, n, f: rdc(h.projet) };
}

describe('meubler les pièces', () => {
  it('chaque pièce reçoit le mobilier de son usage', () => {
    const { f } = maisonFictive();
    const A = meublerNiveau(f), par = new Map(A.pieces.map(p => [p.nom, p]));
    const ids = (nom: string) => A.meubles.filter(m => m.piece === par.get(nom)?.piece).map(m => m.modele.id);
    expect(ids('Séjour - cuisine')).toEqual(expect.arrayContaining(['refrigerateur', 'plaque', 'evier', 'meuble-tv', 'table-basse', 'chaise']));
    expect(ids('Séjour - cuisine').some(id => /^canape/.test(id)) && ids('Séjour - cuisine').some(id => /^table-[46]$/.test(id))).toBe(true);
    for (const c of ['Chambre 1', 'Chambre 2']) {
      expect(ids(c).filter(id => id === 'lit-160' || id === 'lit-140')).toHaveLength(1);
      expect(ids(c).filter(id => id === 'chevet').length).toBeGreaterThanOrEqual(1);
    }
    expect(ids('Salle d\'eau')).toEqual(expect.arrayContaining(['vasque-double', 'wc-suspendu']));
    expect(ids('Salle d\'eau').some(id => /^douche/.test(id))).toBe(true);
    expect(ids('Garage')).toEqual(['place-voiture']);
    expect(A.pieces.every(p => !p.manques.length)).toBe(true);
  });

  it('dans la pièce, sans chevauchement, passage des portes libre, rien de haut devant une fenêtre', () => {
    const { f } = maisonFictive();
    const A = meublerNiveau(f), plan = planDuNiveau(f);
    const zoneDe = new Map(plan.zones.filter(z => z.piece).map(z => [z.piece!.id, z.polygone]));
    for (const m of A.meubles) {
      const P = zoneDe.get(m.piece)!, R = corps(m);
      /* à 2 mm près (le meuble plaqué touche la face du mur) */
      expect(aire({ contour: R }) - intersection([P], [{ contour: R }]).reduce((s, p) => s + aire(p), 0)).toBeLessThan(2 * (m.modele.largeur + m.modele.profondeur) * 2);
    }
    for (let i = 0; i < A.meubles.length; i++) for (let j = i + 1; j < A.meubles.length; j++)
      expect(chevauchement(corps(A.meubles[i]!), corps(A.meubles[j]!))).toBeLessThan(5_000);       // moins de 50 cm² : des meubles qui se touchent
    /* devant chaque porte, des deux côtés, le passage seul (70 cm) reste libre */
    const murs = new Map(mursDroits(f).map(w => [w.id, w]));
    for (const o of Object.values(f.objects)) {
      if (o.type !== 'opening' || o.kind === 'window' || o.kind === 'garage_door') continue;
      const w = murs.get(o.hostWallId)!, g = geometrieOuverture(w, o);
      const u = { x: (w.axis.b.x - w.axis.a.x), y: (w.axis.b.y - w.axis.a.y) }, L = Math.hypot(u.x, u.y), e = w.thickness / 2;
      const ux = u.x / L, uy = u.y / L, nx = -uy, ny = ux;
      for (const s of [1, -1]) {
        const Z = [[-o.width / 2, e], [o.width / 2, e], [o.width / 2, e + PASSAGE_SEUL], [-o.width / 2, e + PASSAGE_SEUL]]
          .map(([t, d]) => ({ x: g.centre.x + ux * t! + nx * s * d!, y: g.centre.y + uy * t! + ny * s * d! }));
        for (const m of A.meubles) expect(chevauchement(corps(m), Z)).toBeLessThan(5_000);
      }
    }
    /* un meuble plus haut que l'allège ne se pose pas devant une fenêtre (dos au mur, sur la largeur de la fenêtre) */
    for (const o of Object.values(f.objects)) {
      if (o.type !== 'opening' || o.kind !== 'window') continue;
      const w = murs.get(o.hostWallId)!, g = geometrieOuverture(w, o);
      const L = Math.hypot(w.axis.b.x - w.axis.a.x, w.axis.b.y - w.axis.a.y), ux = (w.axis.b.x - w.axis.a.x) / L, uy = (w.axis.b.y - w.axis.a.y) / L;
      for (const s of [1, -1]) {
        const Z = [[-o.width / 2, 0], [o.width / 2, 0], [o.width / 2, w.thickness / 2 + 300], [-o.width / 2, w.thickness / 2 + 300]]
          .map(([t, d]) => ({ x: g.centre.x + ux * t! - uy * s * d!, y: g.centre.y + uy * t! + ux * s * d! }));
        for (const m of A.meubles.filter(m => m.modele.hauteur > o.sill)) expect(chevauchement(corps(m), Z)).toBeLessThan(5_000);
      }
    }
  });

  it('une seule action : posée par les commandes, annulée d’un coup ; une pièce meublée n’est plus touchée', () => {
    const { h, a, n } = maisonFictive();
    const A = meublerNiveau(rdc(h.projet));
    const h1 = ok(executer(h, 'Meubler les pièces', commandes(n, A.meubles), a));
    expect(Object.values(rdc(h1.projet).objects).filter(o => o.type === 'furniture')).toHaveLength(A.meubles.length);
    expect(canonique(annuler(h1).projet)).toBe(canonique(h.projet));
    const B = meublerNiveau(rdc(h1.projet));
    expect(B.meubles).toHaveLength(0);
    expect(B.pieces.filter(p => p.dejaMeublee).length).toBe(new Set(A.meubles.map(m => m.piece)).size);
    /* « seulement » : une pièce à la fois */
    const ch = A.pieces.find(p => p.nom === 'Chambre 2')!;
    expect(new Set(meublerNiveau(rdc(h.projet), [ch.piece]).meubles.map(m => m.piece))).toEqual(new Set([ch.piece]));
  });

  it('un placard déjà posé reste : la chambre se meuble autour ; ce qui ne tient pas est dit', () => {
    const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
    const n = rdc(p).id;
    const M = (x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, role: 'exterior' });
    /* une chambre de 3,80 × 3,30 m entre faces, un placard de 2 m contre le mur du bas ; un réduit de 1,80 × 1,80 m nommé chambre */
    let h = ok(executer(nouvelHistorique(p), 'Murs', [M(0, 0, 4_000, 0), M(4_000, 0, 4_000, 3_500), M(4_000, 3_500, 0, 3_500), M(0, 3_500, 0, 0),
      M(5_000, 0, 7_000, 0), M(7_000, 0, 7_000, 2_000), M(7_000, 2_000, 5_000, 2_000), M(5_000, 2_000, 5_000, 0),
      { type: 'creerPiece', niveau: n, point: { x: 2_000, y: 1_800 }, nom: 'Chambre', usage: 'bedroom', humide: false },
      { type: 'creerPiece', niveau: n, point: { x: 6_000, y: 1_000 }, nom: 'Chambre d’appoint', usage: 'bedroom', humide: false }], a));
    const pl = modeleMeuble('placard-200')!;
    h = ok(executer(h, 'Placard', [{ type: 'creerMeuble', niveau: n, modele: { id: pl.id, label: pl.libelle }, position: { x: 2_000, y: 400 }, rotation: 0, largeur: pl.largeur, profondeur: pl.profondeur, hauteur: pl.hauteur }], a));
    const A = meublerNiveau(rdc(h.projet));
    const chambre = A.pieces.find(q => q.nom === 'Chambre')!, appoint = A.pieces.find(q => q.nom === 'Chambre d’appoint')!;
    expect(chambre.dejaMeublee).toBeFalsy();
    expect(chambre.meubles.some(x => /^Lit/.test(x))).toBe(true);
    expect(chambre.meubles).not.toContain('Armoire 2 portes');                 // le placard en tient lieu
    const placard = emprise({ position: { x: 2_000, y: 400 }, rotation: 0, width: pl.largeur, depth: pl.profondeur });
    for (const m of A.meubles) expect(chevauchement(corps(m), placard)).toBeLessThan(5_000);
    expect(appoint.meubles).toHaveLength(0);
    expect(appoint.manques).toEqual(['Lit : la place manque (90 × 190 cm et son passage)']);
  });

  it('la place de stationnement : un rectangle en tirets et ses diagonales, sans volume ; au dossier, avec le mobilier', () => {
    const v = modeleMeuble('place-voiture')!;
    expect(v).toMatchObject({ forme: 'stationnement', largeur: 2_500, profondeur: 5_000, famille: 'garage' });
    expect(traits(v.forme, v.largeur, v.profondeur).every(t => t.tirets)).toBe(true);
    expect(blocs(v.forme, v.largeur, v.profondeur, v.hauteur)).toHaveLength(0);
    /* dans le garage fictif : dans l'axe de la porte de garage */
    const { h, a, n, f } = maisonFictive();
    const A = meublerNiveau(f), pv = A.meubles.find(m => m.modele.id === 'place-voiture')!;
    const pg = Object.values(f.objects).find(o => o.type === 'opening' && o.kind === 'garage_door');
    if (pg?.type !== 'opening') throw new Error('pas de porte de garage');
    const g = geometrieOuverture(mursDroits(f).find(w => w.id === pg.hostWallId)!, pg);
    const L = Math.hypot(pv.position.x - g.centre.x, pv.position.y - g.centre.y);
    expect(L).toBeLessThan(5_000 / 2 + 400);
    expect(positionDansAnneau(pv.position, planDuNiveau(f).zones.find(z => z.piece?.usage === 'garage')!.polygone.contour)).toBe('dedans');
    /* le dossier de permis dessine le mobilier quand on le demande */
    const h1 = ok(executer(h, 'Meubler', commandes(n, A.meubles), a));
    const avec = dossierPc(h1.projet, { indice: 'A', date: '08/10/2026', mobilier: true }).octets.length;
    const sans = dossierPc(h1.projet, { indice: 'A', date: '08/10/2026' }).octets.length;
    expect(avec).toBeGreaterThan(sans + 1_000);
  });
});
