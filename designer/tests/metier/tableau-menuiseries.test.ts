/* Le tableau des menuiseries (pour le menuisier) : les baies semblables
   regroupées sous un repère (F1, PF1, PE1, P1…), leur quantité, leurs
   emplacements (niveau, pièce, façade), le sens d'ouverture (« poussant
   gauche »), le volet, la teinte des Informations du dossier ([à préciser]
   sinon) ; ni baie existante, ni passage. En CSV et en planche A3 (une page
   de plus si le tableau ne tient pas). Maison fictive de 10 × 8 m. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Project } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { menuiseriesCsv, tableauMenuiseries } from '../../src/building';
import { menuiseriesPdf, planchesPdf } from '../../src/export/planche';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 12) + (t += 1000)).toISOString(), id: generateurSequentiel('m') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');
const textes = (s: string) => [...s.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(m => m[1]!.replace(/\\(.)/g, '$1')).join(' ');
const pages = (s: string) => (s.match(/\/Type \/Page /g) ?? []).length;

function maison(dossier = true) {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') }), n = p.buildings[0]!.floors[0]!.id;
  const M = (id: string, x1: number, y1: number, x2: number, y2: number, role: 'exterior' | 'partition' = 'exterior'): Commande =>
    ({ type: 'creerMur', niveau: n, id, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: role === 'exterior' ? 200 : 70, role });
  const fen = (mur: string, position: number): Commande[] => [{ type: 'creerOuverture', mur, position, largeur: 1_200, hauteur: 1_250, allege: 900, genre: 'window', modele: { id: 'fen-2v-120x125', label: 'Fenêtre 2 vantaux 120 × 125' } }];
  const cmds: Commande[] = [M('sud', 0, 0, 10_000, 0), M('est', 10_000, 0, 10_000, 8_000), M('nord', 10_000, 8_000, 0, 8_000), M('ouest', 0, 8_000, 0, 0), M('refend', 4_000, 0, 4_000, 8_000, 'partition'),
    { type: 'creerPiece', niveau: n, point: { x: 2_000, y: 4_000 }, nom: 'Séjour', usage: 'living' },
    { type: 'creerPiece', niveau: n, point: { x: 7_000, y: 4_000 }, nom: 'Chambre', usage: 'bedroom' },
    /* une fenêtre au nord (lue la première : le plan se lit de haut en bas), deux semblables au sud (un repère, quantité 2) */
    ...fen('sud', 2_000), ...fen('sud', 7_000),
    { type: 'creerOuverture', mur: 'nord', position: 3_000, largeur: 1_000, hauteur: 1_250, allege: 900, genre: 'window' },
    { type: 'creerOuverture', mur: 'ouest', position: 4_000, largeur: 900, hauteur: 2_150, allege: 0, genre: 'door', vantaux: 1 },
    /* la porte de la chambre : sur le refend (de bas en haut), charnière côté départ, ouvrant côté séjour */
    { type: 'creerOuverture', mur: 'refend', position: 6_000, largeur: 830, hauteur: 2_040, allege: 0, genre: 'door', sens: { side: 'left', inward: true } },
    { type: 'creerOuverture', mur: 'est', position: 2_000, largeur: 900, hauteur: 2_000, allege: 0, genre: 'void' }];
  let h = ok(executer(nouvelHistorique(p), 'Maison', cmds, a));
  const nordF = Object.values(h.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'opening' && o.hostWallId === 'nord')!;
  h = ok(executer(h, 'Volet', [{ type: 'modifierOuverture', id: nordF.id, volet: 'roller_motorized' }], a));
  /* une fenêtre existante conservée : rien à fournir */
  h = ok(executer(h, 'Existant', [{ type: 'modifierMur', id: 'est', phase: 'existing' }, { type: 'creerOuverture', mur: 'est', position: 6_000, largeur: 600, hauteur: 750, allege: 1_200, genre: 'window' }], a));
  const ex = Object.values(h.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'opening' && o.width === 600)!;
  h = ok(executer(h, 'Existant', [{ type: 'modifierOuverture', id: ex.id, phase: 'existing' }], a));
  if (dossier) h = ok(executer(h, 'Teintes', [{ type: 'modifierDossier', champs: { menuiseries: { materiau: 'PVC', teinte: 'ral-7016' } } }], a));
  return h.projet;
}

describe('le tableau des menuiseries', () => {
  it('regroupe les baies semblables sous un repère, avec quantité, emplacements (pièce, façade), sens, volet et teinte', () => {
    const L = tableauMenuiseries(maison());
    expect(L.map(l => [l.repere, l.quantite, l.designation])).toEqual([
      ['F1', 1, 'Fenêtre'], ['F2', 2, 'Fenêtre 2 vantaux 120 × 125'], ['PE1', 1, 'Porte'], ['P1', 1, 'Porte']]);
    const [F1, F2, PE1, P1] = L as [typeof L[0], typeof L[0], typeof L[0], typeof L[0]];
    expect([F1.emplacements, F1.volet, F1.largeur]).toEqual([['RDC — Chambre, façade nord'], 'Volet roulant motorisé', 1_000]);
    expect(F2.emplacements).toEqual(['RDC — Séjour, façade sud', 'RDC — Chambre, façade sud']);
    expect([F2.teinte, F2.manoeuvre, F2.vantaux, F2.ouverture, F2.volet]).toEqual(['PVC · RAL 7016 gris anthracite', 'Battant', 2, 'vers l’intérieur', '—']);
    /* la porte d'entrée prend la teinte des menuiseries ; un vantail : son sens. Mur ouest tracé du nord au sud, paumelles
       au départ (nord) : en la poussant du dehors vers l'est, elles sont à gauche */
    expect([PE1.emplacements, PE1.teinte, PE1.ouverture]).toEqual([['RDC — Séjour, façade ouest'], 'PVC · RAL 7016 gris anthracite', 'Poussant gauche, vers l’intérieur']);
    /* la porte de la chambre : on la pousse depuis la chambre vers le séjour, paumelles au sud, donc à gauche */
    expect([P1.exterieure, P1.emplacements, P1.ouverture, P1.teinte]).toEqual([false, ['RDC — Séjour / Chambre'], 'Poussant gauche', '—']);
  });

  it('sans teinte choisie : « [à préciser] » ; en CSV, une ligne par repère', () => {
    const L = tableauMenuiseries(maison(false));
    expect(L.filter(l => l.exterieure).every(l => l.teinte === '[à préciser]')).toBe(true);
    const C = menuiseriesCsv(L).split('\r\n');
    expect(C[0]).toBe('"Repère";"Extérieure";"Désignation";"Quantité";"Largeur (cm)";"Hauteur (cm)";"Allège (cm)";"Vantaux";"Manœuvre";"Ouverture";"Volet";"Teinte";"Emplacements"');
    expect(C[2]).toBe('"F2";"oui";"Fenêtre 2 vantaux 120 × 125";"2";"120";"125";"90";"2";"Battant";"vers l’intérieur";"—";"[à préciser]";"RDC — Séjour, façade sud ; RDC — Chambre, façade sud"');
  });

  it('la planche A3 : extérieures puis intérieures, avec leurs totaux ; une page de plus quand le tableau ne tient pas', () => {
    const p = maison();
    const T = textes(texte(menuiseriesPdf(p, { indice: 'A', date: '12/10/2026' })));
    for (const t of ['TABLEAU DES MENUISERIES', 'MENUISERIES EXT\xC9RIEURES', 'MENUISERIES INT\xC9RIEURES', 'F1', 'PE1', 'P1', '120 \xD7 125', 'Poussant gauche', 'Volet roulant motoris\xE9', 'RDC \x97 S\xE9jour, fa\xE7ade sud'])
      expect(T, t).toContain(t);
    /* avec les plans : la planche s'ajoute aux plans des niveaux */
    const P = texte(planchesPdf(p, { niveaux: [p.buildings[0]!.floors[0]!.id], cotation: true, mobilier: false, menuiseries: true, indice: 'A', date: '12/10/2026' }));
    expect([pages(P), textes(P).includes('TABLEAU DES MENUISERIES')]).toEqual([2, true]);
    /* 60 fenêtres toutes différentes : deux pages */
    const a = acteur(), q = creerProjet({ nom: 'Long mur fictif', id: generateurSequentiel('q') }), n = q.buildings[0]!.floors[0]!.id;
    const cmds: Commande[] = [{ type: 'creerMur', niveau: n, id: 'long', a: { x: 0, y: 0 }, b: { x: 120_000, y: 0 }, epaisseur: 200, role: 'exterior' },
      ...Array.from({ length: 60 }, (_, i): Commande => ({ type: 'creerOuverture', mur: 'long', position: 1_000 + i * 1_900, largeur: 600 + i * 10, hauteur: 1_000, allege: 1_000, genre: 'window' }))];
    const r = ok(executer(nouvelHistorique(q), 'Long', cmds, a));
    const D = texte(menuiseriesPdf(r.projet, { indice: 'A', date: '12/10/2026' }));
    expect(pages(D)).toBe(2);
    expect(textes(D)).toContain('TABLEAU DES MENUISERIES (suite)');
    expect(textes(D)).toContain('F60');
  });
});
