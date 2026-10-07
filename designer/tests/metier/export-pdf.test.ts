/* L'export PDF : une planche A3 par niveau, à une échelle normalisée, avec
   cartouche ; un fichier PDF valide (table des renvois exacte), texte en
   WinAnsi (accents), dessin vectoriel. Plan fictif (atelier). */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Project } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Historique } from '../../src/engine';
import { commandesImport, lireModeleAtelier } from '../../src/import/atelier';
import { planchesPdf, echelleNormalisee, boiteDessin } from '../../src/export/planche';
import { chainePdf, largeurTexte } from '../../src/export/pdf';
import fixture from '../fixtures/atelier_fictif.json?raw';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };

function maisonFictive(): Project {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p.buildings[0]!.floors[0]!.id;
  let k = 0;
  const { commandes } = commandesImport(lireModeleAtelier(JSON.parse(fixture)), n, () => 'imp' + (++k));
  let h = ok(executer(nouvelHistorique(p), 'Import', commandes, a));
  h = ok(executer(h, 'Toiture', [{ type: 'creerToiture', niveau: n, genre: 'hip', pente: 35, debord: 500, couverture: 'tile' }], a));
  return h.projet;
}
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');

describe('export PDF', () => {
  it('échelle normalisée : la plus grande qui tient, cotes comprises', () => {
    /* la zone du dessin va du cadre à la colonne CP (les encadrés se posent dans les vides) : 12 × 9 m cotés passent au 1/50 */
    expect(echelleNormalisee(12_000, 9_000)).toBe(50);
    expect(echelleNormalisee(20_000, 12_000)).toBe(75);
    expect(echelleNormalisee(20_000, 12_000, false)).toBe(75);
    expect(echelleNormalisee(400_000, 1_000)).toBe(1_000);
  });

  it('texte : accents en WinAnsi, parenthèses échappées, largeurs Helvetica', () => {
    expect(chainePdf('Échelle (A3)')).toBe('(\xC9chelle \\(A3\\))');
    expect(chainePdf('m² · 3 × 4 — œuvre')).toBe('(m\xB2 \xB7 3 \xD7 4 \x97 \x9Cuvre)');
    expect(chainePdf('🔒 cote')).toBe('( cote)');
    expect(largeurTexte('AV')).toBe(667 + 667);
  });

  it('une planche A3 du plan de l’atelier : PDF valide, renvois exacts, cartouche et surfaces', () => {
    const p = maisonFictive(), f = p.buildings[0]!.floors[0]!;
    const B = boiteDessin(f)!;
    expect(B.xmax - B.xmin).toBeGreaterThanOrEqual(12_000);           // la maçonnerie (le débord du toit n'est pas au plan du niveau)
    const u = planchesPdf(p, { niveaux: [f.id], cotation: true, mobilier: true, indice: 'B', date: '03/10/2026' });
    const s = texte(u);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(s).toContain('/MediaBox [0 0 1190.55 841.89]');
    /* chaque renvoi de la table pointe sur le bon objet */
    const xref = Number(/startxref\n(\d+)/.exec(s)![1]);
    const lignes = s.slice(xref).split('\n').slice(3).filter(l => / 00000 n $/.test(l));
    lignes.forEach((l, i) => expect(s.slice(Number(l.slice(0, 10)), Number(l.slice(0, 10)) + 10)).toMatch(new RegExp('^' + (i + 1) + ' 0 obj')));
    /* cartouche, échelle, surfaces, cotes (texte tourné), pièces */
    const e = echelleNormalisee(B.xmax - B.xmin, B.ymax - B.ymin);
    expect(e).toBe(50);                                                  // 12 × 9 m : le 1/50 tient, cotes comprises
    /* la colonne CP : société (sans logo), titre, feuille, indice et date, format, échelle ; le titre de la planche en bas à gauche */
    for (const t of ['(CP CONSTRUCTIONS)', '(PLAN DU REZ-DE-CHAUSS\xC9E)', '(PLAN DU)', '(rez-de-chauss\xE9e)', '(Plan RDC)', '(indice B du 03/10/2026)', '(Format :)', '(A3)', '(\xC9chelle :)', '(S\xE9jour - cuisine)', '(SH : 37,00 m\xB2)', '(TABLEAU DES SURFACES \x96 RDC)', '(L\xC9GENDE)'])
      expect(s, t).toContain(t);
    /* l'échelle de la planche : la plus grande où le plan, ses cotes et ses encadrés tiennent */
    expect(s).toMatch(/\(1\/(50|75)\) Tj/);
    expect((s.match(/ re S/g) ?? []).length).toBeGreaterThan(0);
    /* le dessin est vectoriel : des chemins remplis (maçonnerie) et tracés */
    expect((s.match(/ f\*?\n?/g) ?? []).length).toBeGreaterThan(10);
  });

  it('plusieurs niveaux : une page chacun, dans l’ordre des altitudes ; sans mobilier ni cotes sur demande', () => {
    const a = acteur();
    let p = maisonFictive();
    p = ok(executer(nouvelHistorique(p), 'Étage', [{ type: 'ajouterNiveau', batiment: p.buildings[0]!.id, nom: 'Étage', altitude: 2_800, hauteur: 2_500 }], a)).projet;
    const ids = p.buildings[0]!.floors.map(f => f.id);
    const s = texte(planchesPdf(p, { niveaux: ids, cotation: false, mobilier: false, indice: 'A', date: '03/10/2026' }));
    expect(s).toContain('/Count 2');
    expect(s.indexOf('(PLAN DU REZ-DE-CHAUSS\xC9E)')).toBeGreaterThan(0);
    expect(s.indexOf('(PLAN DU REZ-DE-CHAUSS\xC9E)')).toBeLessThan(s.indexOf('(PLAN DE L\x92\xC9TAGE)'));
    expect(s).toContain('(Niveau vide : aucun mur \xE0 dessiner.)');
  });
});
