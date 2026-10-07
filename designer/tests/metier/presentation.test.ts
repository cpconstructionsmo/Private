/* Le plan de présentation (pour le client) : les pièces à la couleur de leur
   sol, avec leur motif ; la colonne dit le sol de chaque pièce ; ni chaîne de
   cotes ni « Plan : » technique. Sur le modèle fictif de plain-pied. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { MODELES_MAISONS } from '../../src/catalogue/modeles-maisons';
import { planchesPdf } from '../../src/export/planche';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');

/** le plain-pied de trois chambres, parquet dans les chambres, carrelage au séjour ; salle de bains et WC sans sol choisi */
export function maisonMeublee() {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const b = p.buildings[0]!, n = b.floors[0]!.id, md = MODELES_MAISONS.find(m => m.id === 'plain-pied-t4')!;
  const h = ok(executer(nouvelHistorique(p), 'Modèle', md.commandes({ batiment: b.id, niveau: n, id: generateurSequentiel('m') }), a));
  const pieces = Object.values(h.projet.buildings[0]!.floors[0]!.objects).filter(o => o.type === 'room');
  const sols: Commande[] = pieces.flatMap(r => (r.usage === 'bedroom' ? [{ type: 'modifierPiece', id: r.id, sol: 'parquet-chene' } as Commande]
    : r.usage === 'living' ? [{ type: 'modifierPiece', id: r.id, sol: 'carrelage-clair' } as Commande] : []));
  return ok(executer(h, 'Sols', sols, a)).projet;
}

describe('plan de présentation', () => {
  it('sols en couleur et leurs motifs, la colonne « sols et surfaces », sans cotes', () => {
    const P = maisonMeublee(), f = P.buildings[0]!.floors[0]!;
    const pres = texte(planchesPdf(P, { niveaux: [f.id], cotation: false, mobilier: true, indice: 'A', date: '05/10/2026', presentation: true }));
    const tech = texte(planchesPdf(P, { niveaux: [f.id], cotation: true, mobilier: true, indice: 'A', date: '05/10/2026' }));
    for (const t of ['(PLAN DE PR\xC9SENTATION \x96 REZ-DE-CHAUSS\xC9E)', '(SOLS ET SURFACES \x96 RDC)', '(Parquet ch\xEAne)', '(Carrelage clair 60 \xD7 60)', '(\xE0 choisir)']) expect(pres, t).toContain(t);
    expect(tech).not.toContain('(SOLS ET SURFACES');
    expect(tech).toContain('(PLAN DU REZ-DE-CHAUSS\xC9E)');
    /* le parquet (#C69C6E) et le carrelage clair (#E7E2D8) remplissent leurs pièces ; le plan technique ne les connaît pas */
    const rvb = (c: string) => [1, 3, 5].map(i => (Math.round(parseInt(c.slice(i, i + 2), 16) / 255 * 100) / 100).toString()).join(' ') + ' rg';
    expect(pres).toContain(rvb('#C69C6E'));
    expect(pres).toContain(rvb('#E7E2D8'));
    expect(tech).not.toContain(rvb('#C69C6E'));
    /* les motifs des sols : des centaines de traits (le plan technique a les siens : hachures de la maçonnerie, cotes) */
    const traits = (s: string) => (s.match(/ l\b/g) ?? []).length;
    expect(traits(pres)).toBeGreaterThan(1_000);
  });
});
