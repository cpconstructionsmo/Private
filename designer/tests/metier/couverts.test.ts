/* Les couverts (porche, auvent, préau) : accolés à la maison, la toiture les
   couvre comme les murs ; soutenus, ils comptent dans l'emprise au sol. Ils
   se dessinent en tirets au plan, viennent de l'atelier à l'import.
   Maison fictive en L. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Canopy } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { aireEmprise, empriseAuSol, toitureDuNiveau } from '../../src/building';
import { positionDansAnneau } from '../../src/geometry/predicats';
import { planchesPdf } from '../../src/export/planche';
import { commandesImport, type ModeleAtelier } from '../../src/import/atelier';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number): Commande => ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: 200, role: 'exterior' });
const texte = (u: Uint8Array) => Array.from(u, c => String.fromCharCode(c)).join('');

/** une maison en L (12 × 10 m moins un creux de 4 × 3 m en bas à droite), une toiture à croupes ; le porche remplit le creux */
function maisonEnL(): { h: Historique; n: string; a: Acteur } {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p.buildings[0]!.floors[0]!.id;
  const h = ok(executer(nouvelHistorique(p), 'Maison', [M(n, 0, 0, 8_000, 0), M(n, 8_000, 0, 8_000, 3_000), M(n, 8_000, 3_000, 12_000, 3_000), M(n, 12_000, 3_000, 12_000, 10_000),
    M(n, 12_000, 10_000, 0, 10_000), M(n, 0, 10_000, 0, 0), { type: 'creerToiture', niveau: n, genre: 'hip', pente: 35, debord: 300, couverture: 'tile' }], a));
  return { h, n, a };
}
const porche = (n: string): Commande => ({ type: 'creerCouvert', niveau: n, contour: [{ x: 8_100, y: -100 }, { x: 12_100, y: -100 }, { x: 12_100, y: 2_900 }, { x: 8_100, y: 2_900 }], nom: 'Porche couvert' });

describe('couverts (porche, auvent)', () => {
  it('la commande les pose, les modifie, refuse ce qui ne se lit pas ; annuler les retire', () => {
    const { h, n, a } = maisonEnL();
    expect(executer(h, 'x', [{ type: 'creerCouvert', niveau: n, contour: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }] }], a).ok).toBe(false);   // moins de 0,25 m²
    expect(executer(h, 'x', [{ ...porche(n), nom: 'x'.repeat(61) } as Commande], a).ok).toBe(false);
    const h1 = ok(executer(h, 'Porche', [porche(n)], a));
    const c = Object.values(h1.projet.buildings[0]!.floors[0]!.objects).find((o): o is Canopy => o.type === 'canopy')!;
    expect(c).toMatchObject({ name: 'Porche couvert', supported: true });
    const h2 = ok(executer(h1, 'x', [{ type: 'modifierCouvert', id: c.id, nom: 'Auvent', soutenu: false }], a));
    expect(h2.projet.buildings[0]!.floors[0]!.objects[c.id]).toMatchObject({ name: 'Auvent', supported: false });
    expect(executer(h2, 'x', [{ type: 'modifierCouvert', id: 'inconnu', nom: 'x' }], a).ok).toBe(false);
  });

  it('la toiture le couvre comme les murs ; soutenu, il compte dans l’emprise au sol (12 m² ici), sinon non', () => {
    const { h, n, a } = maisonEnL();
    const f0 = h.projet.buildings[0]!.floors[0]!, r0 = toitureDuNiveau(f0);
    if (!r0?.ok) throw new Error('toiture');
    expect(positionDansAnneau({ x: 10_000, y: 1_500 }, r0.toitures[0]!.egout)).toBe('dehors');
    const e0 = aireEmprise(empriseAuSol(h.projet));
    const h1 = ok(executer(h, 'Porche', [porche(n)], a)), f1 = h1.projet.buildings[0]!.floors[0]!, r1 = toitureDuNiveau(f1);
    if (!r1?.ok) throw new Error('toiture');
    expect(r1.toitures).toHaveLength(1);
    expect(positionDansAnneau({ x: 10_000, y: 1_500 }, r1.toitures[0]!.egout)).toBe('dedans');
    expect((aireEmprise(empriseAuSol(h1.projet)) - e0) / 1e6).toBeCloseTo(12, 1);
    const id = Object.values(f1.objects).find(o => o.type === 'canopy')!.id;
    const h2 = ok(executer(h1, 'x', [{ type: 'modifierCouvert', id, soutenu: false }], a));
    expect(aireEmprise(empriseAuSol(h2.projet))).toBeCloseTo(e0, 0);
  });

  it('au plan du niveau : en tirets, son nom, la légende', () => {
    const { h, n, a } = maisonEnL();
    const s = texte(planchesPdf(ok(executer(h, 'Porche', [porche(n)], a)).projet, { niveaux: [n], cotation: true, mobilier: false, indice: 'A', date: '07/10/2026', dossier: true }));
    expect(s).toContain('(Porche couvert)');
    expect(s).toContain('(Couvert \\(porche, auvent : sous la toiture\\))');
  });

  it('l’atelier passe ses couverts (contour fermé, soutien supposé : à vérifier)', () => {
    const m: ModeleAtelier = { batiment: { niveaux: [{ murs: [], ouvertures: [], pieces: [], couverts: [
      { nom: 'Porche couvert', polygone: [[8.1, -0.1], [12.1, -0.1], [12.1, 2.9], [8.1, 2.9], [8.1, -0.1]], compte_emprise: { valeur: true, statut: 'hypothese' } }] }] } };
    const c = commandesImport(m, 'n', generateurSequentiel('m')).commandes.find(x => x.type === 'creerCouvert');
    if (c?.type !== 'creerCouvert') throw new Error('pas de couvert');
    expect(c.contour).toHaveLength(4);
    expect(c.contour[1]).toEqual({ x: 12_100, y: -100 });
    expect([c.nom, c.soutenu, c.origine?.statut]).toEqual(['Porche couvert', true, 'to_check']);
  });
});
