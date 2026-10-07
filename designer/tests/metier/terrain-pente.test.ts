/* Un terrain en pente : des points cotés relevés (NGF), l'altitude du ±0,00 ;
   la coupe (PCMI 3) en tire le profil du terrain naturel et ses altitudes,
   le plan de masse et la notice les reportent. Sans altitude du ±0,00, rien
   n'est placé, et c'est écrit. Modèle fictif de plain-pied (13 × 9 m). */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Plot, type Project } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Historique } from '../../src/engine';
import { MODELES_MAISONS } from '../../src/catalogue/modeles-maisons';
import { planchesPdf } from '../../src/export/planche';
import { notice } from '../../src/export/notice';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');

/* un terrain qui monte de 6 % vers le nord (y croissant) : 100,00 NGF en y = −8 m */
const z = (y: number) => Math.round((100 + 0.06 * (y + 8_000) / 1_000) * 100) / 100;
export function maisonEnPente(ngfRdc?: number): Project {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const b = p.buildings[0]!, n = b.floors[0]!.id, md = MODELES_MAISONS.find(m => m.id === 'plain-pied-t4')!;
  let h = ok(executer(nouvelHistorique(p), 'Modèle', [...md.commandes({ batiment: b.id, niveau: n, id: generateurSequentiel('m') }),
    { type: 'creerParcelle', niveau: n, contour: [{ x: -6_000, y: -8_000 }, { x: 19_000, y: -8_000 }, { x: 19_000, y: 17_000 }, { x: -6_000, y: 17_000 }], voies: [0], ...(ngfRdc !== undefined ? { altitudeRdc: ngfRdc } : {}) }], a));
  const id = Object.values(h.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'plot')!.id;
  const pts = [[-6_000, -8_000], [19_000, -8_000], [19_000, 17_000], [-6_000, 17_000], [6_500, 4_500]].map(([x, y]) => ({ point: { x: x!, y: y! }, ngf: z(y!) }));
  h = ok(executer(h, 'Points cotés', [{ type: 'modifierParcelle', id, altitudesTerrain: pts }], a));
  return h.projet;
}

/** les textes d'un PDF, mis bout à bout (une phrase coupée en lignes se retrouve entière) */
const textes = (s: string) => [...s.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(m => m[1]!.replace(/\\(.)/g, '$1')).join(' ');

describe('terrain en pente', () => {
  it('la coupe (PCMI 3) : le terrain naturel interpolé, ses altitudes NGF au droit des façades, le ±0,00 en NGF, la note du terrain fini', () => {
    const P = maisonEnPente(101.0), f = P.buildings[0]!.floors[0]!;
    const s = texte(planchesPdf(P, { niveaux: [f.id], cotation: false, mobilier: false, indice: 'A', date: '05/10/2026', coupe: true }));
    expect(s).toContain('(\xB10,00  \\(101,00 NGF\\))');
    /* la coupe placée d'elle-même traverse la maison du sud au nord : façades à y = −100 et 9 100 (nu extérieur) */
    for (const t of ['100,47', '101,03']) expect(s).toMatch(new RegExp('\\(TN [^)]*' + t));
    const txt = textes(s);
    expect(txt).toContain('trac\xE9 \xE0 partir des 5 points cot\xE9s relev\xE9s');
    expect(txt).toContain('remblais [\xE0 pr\xE9ciser].');
    expect(txt).not.toContain('n\x92est pas relev\xE9');
  });

  it('sans altitude NGF du ±0,00 : le terrain n’est pas placé, et la coupe le dit', () => {
    const P = maisonEnPente(), f = P.buildings[0]!.floors[0]!;
    const s = texte(planchesPdf(P, { niveaux: [f.id], cotation: false, mobilier: false, indice: 'A', date: '05/10/2026', coupe: true }));
    expect(textes(s)).toContain('Points cot\xE9s relev\xE9s, mais l\x92altitude NGF du \xB10,00');
    expect(s).not.toContain('(TN ');
  });

  it('le plan de masse (PCMI 2) et la notice : l’étendue du terrain naturel, le ±0,00 par rapport à lui', () => {
    const P = maisonEnPente(101.0), f = P.buildings[0]!.floors[0]!;
    const s = texte(planchesPdf(P, { niveaux: [f.id], cotation: false, mobilier: false, indice: 'A', date: '05/10/2026', masse: true }));
    expect(s).toContain('(100,00 \xE0 101,50 NGF \\(5 pts\\))');
    /* au centre de la maison (y = 4 500) : TN 100,75 ; le ±0,00 à 101,00 est 0,25 m au-dessus */
    expect(s).toContain('(+0,25 m)');
    expect(s).toContain('(TN 100,75)');                                         // le point coté du milieu, dessiné
    const n = notice(P).flatMap(r => r.paragraphes).join(' ');
    expect(n).toMatch(/Relief : le terrain naturel va de 100,00 à 101,50 NGF \(5 points cotés relevés, soit 1,50 m de dénivelé\)/);
    expect((Object.values(f.objects).find(o => o.type === 'plot') as Plot).spotHeights).toHaveLength(5);
  });
});
