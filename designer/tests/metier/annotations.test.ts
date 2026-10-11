/* Les annotations du plan : un texte libre (une à quatre lignes) avec une
   flèche de rappel facultative. On les pose à l'outil (le texte, puis la
   pointe), on les vise et les tire (la pointe reste sur ce qu'elle
   désigne), elles s'impriment avec le plan du niveau, passent au DXF et se
   copient avec le groupe. Maison fictive de 10 × 8 m. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Floor, type Note, type Project } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { commandesColler, copier } from '../../src/engine/presse-papiers';
import { Outils } from '../../src/ui/outils';
import { viser } from '../../src/ui/selection';
import { planchesPdf } from '../../src/export/planche';
import { dxfNiveau } from '../../src/export/dxf';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 11) + (t += 1000)).toISOString(), id: generateurSequentiel('n') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const refus = (r: ReturnType<typeof executer>) => (r.ok ? '' : r.erreurs.join(' ; '));
const niveau = (p: Project): Floor => p.buildings[0]!.floors[0]!;
const notes = (p: Project) => Object.values(niveau(p).objects).filter((o): o is Note => o.type === 'note');
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');
const textes = (s: string) => [...s.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(m => m[1]!.replace(/\\(.)/g, '$1')).join(' ');

function maison() {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') }), n = niveau(p).id;
  const M = (x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, hauteur: 2_500, role: 'exterior' });
  const h = ok(executer(nouvelHistorique(p), 'Maison', [M(0, 0, 10_000, 0), M(10_000, 0, 10_000, 8_000), M(10_000, 8_000, 0, 8_000), M(0, 8_000, 0, 0),
    { type: 'creerPiece', niveau: n, point: { x: 5_000, y: 4_000 }, nom: 'Séjour', usage: 'living' }], a));
  return { h, a, n };
}

describe('les annotations (modèle et commandes)', () => {
  it('un texte d’une à quatre lignes, nettoyé ; une flèche facultative ; modifier, retirer la flèche, annuler', () => {
    const { h, a, n } = maison();
    expect(refus(executer(h, 'Note', [{ type: 'creerNote', niveau: n, position: { x: 0, y: 0 }, texte: '  \n ' }], a))).toBe('une annotation a un texte');
    expect(refus(executer(h, 'Note', [{ type: 'creerNote', niveau: n, position: { x: 0, y: 0 }, texte: '1\n2\n3\n4\n5' }], a))).toBe('une annotation tient en quatre lignes au plus');
    const r = ok(executer(h, 'Note', [{ type: 'creerNote', niveau: n, position: { x: 12_000, y: 2_000 }, texte: ' Regard EP \r\n\n à créer ', cible: { x: 10_500, y: 1_000 }, taille: 'large' }], a));
    const [N] = notes(r.projet);
    expect([N!.text, N!.position, N!.target, N!.size]).toEqual(['Regard EP\nà créer', { x: 12_000, y: 2_000 }, { x: 10_500, y: 1_000 }, 'large']);
    const m = ok(executer(r, 'Note', [{ type: 'modifierNote', id: N!.id, texte: 'Regard EP existant', cible: null, taille: null }], a));
    const [M2] = notes(m.projet);
    expect([M2!.text, M2!.target, M2!.size]).toEqual(['Regard EP existant', undefined, undefined]);
    expect(annuler(m).projet).toEqual(r.projet);
  });
});

describe('l’outil Annotation', () => {
  it('un clic demande le texte ; avec une flèche, le clic suivant pose sa pointe ; Échap : la note sans flèche', () => {
    const { h, n } = maison();
    const o = new Outils(() => ({ projet: h.projet, niveau: n, selection: null }));
    o.choisir('note');
    expect(o.appuyer({ point: { x: 12_000, y: 2_000 }, rayon: 150, alt: true }).demande).toEqual({ genre: 'texteNote', niveau: n, point: { x: 12_000, y: 2_000 } });
    o.attendreFleche(n, { x: 12_000, y: 2_000 }, 'Regard EP');
    /* l'aperçu montre la flèche jusqu'au curseur */
    expect(o.bouger({ point: { x: 10_500, y: 1_000 }, rayon: 150, alt: true }).apercu).toEqual([{ type: 'creerNote', niveau: n, position: { x: 12_000, y: 2_000 }, texte: 'Regard EP', cible: { x: 10_500, y: 1_000 } }]);
    expect(o.appuyer({ point: { x: 10_500, y: 1_000 }, rayon: 150, alt: true }).commandes?.liste).toEqual([{ type: 'creerNote', niveau: n, position: { x: 12_000, y: 2_000 }, texte: 'Regard EP', cible: { x: 10_500, y: 1_000 } }]);
    /* Échap pendant l'attente : le texte écrit n'est pas perdu */
    o.attendreFleche(n, { x: 3_000, y: 9_000 }, 'Accès chantier', 'small');
    expect(o.touche('Escape').commandes?.liste).toEqual([{ type: 'creerNote', niveau: n, position: { x: 3_000, y: 9_000 }, texte: 'Accès chantier', taille: 'small' }]);
  });

  it('visée par son texte ou la pointe de sa flèche ; tirée, le texte bouge et la pointe reste ; placer une flèche après coup', () => {
    const { h, a, n } = maison();
    let r = ok(executer(h, 'Note', [{ type: 'creerNote', niveau: n, position: { x: 12_000, y: 2_000 }, texte: 'Regard EP', cible: { x: 10_500, y: 1_000 } }], a));
    const id = notes(r.projet)[0]!.id;
    /* rayon de 150 mm pour 10 pixels : 15 mm par pixel ; « Regard EP » fait environ 9 × 11 × 0,56 px de large */
    expect(viser(niveau(r.projet), { x: 12_300, y: 2_050 }, 150)).toEqual({ genre: 'objet', id, type: 'note' });
    expect(viser(niveau(r.projet), { x: 10_560, y: 1_040 }, 150)).toEqual({ genre: 'objet', id, type: 'note' });
    const o = new Outils(() => ({ projet: r.projet, niveau: n, selection: null }));
    o.appuyer({ point: { x: 12_000, y: 2_000 }, rayon: 150 });
    o.bouger({ point: { x: 13_000, y: 3_000 }, rayon: 150 });
    const e = o.relacher({ point: { x: 13_000, y: 3_000 }, rayon: 150 });
    expect(e.commandes?.liste).toEqual([{ type: 'modifierNote', id, position: { x: 13_000, y: 3_000 } }]);
    r = ok(executer(r, e.commandes!.titre, e.commandes!.liste, a));
    expect([notes(r.projet)[0]!.position, notes(r.projet)[0]!.target]).toEqual([{ x: 13_000, y: 3_000 }, { x: 10_500, y: 1_000 }]);
    /* la pointe, déplacée depuis l'inspecteur : un clic, puis retour à la sélection, la note choisie */
    o.placerFleche(id);
    const f = o.appuyer({ point: { x: 9_000, y: 500 }, rayon: 150, alt: true });
    expect([f.commandes?.liste, f.selection, o.outil]).toEqual([[{ type: 'modifierNote', id, cible: { x: 9_000, y: 500 } }], id, 'selection']);
  });
});

describe('les annotations aux plans', () => {
  it('s’impriment avec le plan du niveau, passent au DXF (calque ANNOTATIONS) et se copient avec leur flèche', () => {
    const { h, a, n } = maison();
    const r = ok(executer(h, 'Notes', [
      { type: 'creerNote', niveau: n, position: { x: 12_000, y: 2_000 }, texte: 'Regard EP\nà créer', cible: { x: 10_500, y: 1_000 } },
      { type: 'creerNote', niveau: n, position: { x: 5_000, y: 2_000 }, texte: 'Mur conservé' }], a));
    const T = textes(texte(planchesPdf(r.projet, { niveaux: [n], cotation: true, mobilier: false, indice: 'A', date: '11/10/2026' })));
    for (const t of ['Regard EP', '\xE0 cr\xE9er', 'Mur conserv\xE9']) expect(T, t).toContain(t);
    const D = dxfNiveau(r.projet, niveau(r.projet));
    expect(D).toMatch(/\r\nLAYER\r\n2\r\nANNOTATIONS\r\n/);
    expect(D).toContain('\r\nANNOTATIONS\r\n10\r\n12000\r\n20\r\n2105\r\n');          // la première ligne, au-dessus du milieu
    const pp = copier(niveau(r.projet), notes(r.projet).map(x => x.id))!;
    const C = commandesColler(pp, n, { origine: { x: 20_000, y: 0 } }, () => 'x');
    /* l'ancre du groupe est son coin bas-gauche (5 m ; 1 m) : elle va à l'origine du collage */
    expect(C).toContainEqual({ type: 'creerNote', niveau: n, position: { x: 27_000, y: 1_000 }, texte: 'Regard EP\nà créer', cible: { x: 25_500, y: 0 } });
  });
});
