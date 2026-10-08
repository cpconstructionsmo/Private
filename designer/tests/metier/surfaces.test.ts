/* Les surfaces réglementaires (mêmes règles que l'atelier) : surface de
   plancher au nu intérieur des façades, moins garage, trémie et parties
   basses sous toiture ; surface habitable ; seuil de 150 m². */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel, type Project } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type Commande, type Historique } from '../../src/engine';
import { surfacesReglementaires } from '../../src/building';
import { dossierPc } from '../../src/export/planche';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const M = (n: string, x1: number, y1: number, x2: number, y2: number, role: 'exterior' | 'partition' = 'exterior', hauteur?: number): Commande =>
  ({ type: 'creerMur', niveau: n, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur: role === 'exterior' ? 200 : 70, role, ...(hauteur ? { hauteur } : {}) });
const quatre = (n: string, L = 10_000, P = 8_000, h?: number) => [M(n, 0, 0, L, 0, 'exterior', h), M(n, L, 0, L, P, 'exterior', h), M(n, L, P, 0, P, 'exterior', h), M(n, 0, P, 0, 0, 'exterior', h)];
const m2 = (v: number) => Math.round(v / 1e4) / 100;

function projet(c: (n: string) => Commande[]): { p: Project; a: Acteur; h: Historique; n: string } {
  const a = acteur(), p0 = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  const n = p0.buildings[0]!.floors[0]!.id;
  const h = ok(executer(nouvelHistorique(p0), 'x', c(n), a));
  return { p: h.projet, a, h, n };
}

describe('surfaces réglementaires', () => {
  it('10 × 8 m (axes) : 9,80 × 7,80 au nu intérieur = 76,44 m² de surface de plancher ; une cloison y reste comptée', () => {
    const { p } = projet(n => [...quatre(n), M(n, 4_000, 0, 4_000, 8_000, 'partition')]);
    const s = surfacesReglementaires(p);
    expect(m2(s.surfacePlancher)).toBe(76.44);
    expect(m2(s.habitable)).toBeCloseTo(76.44 - 0.07 * 7.8, 2);         // la cloison déduite de l'habitable
    expect(s.seuil.etat).toBe('ok');
  });

  it('un garage est déduit de la surface de plancher et de l’habitable', () => {
    const { p } = projet(n => [...quatre(n), M(n, 7_000, 0, 7_000, 8_000, 'partition'), { type: 'creerPiece', niveau: n, point: { x: 8_500, y: 4_000 }, nom: 'Garage', usage: 'garage' }]);
    const s = surfacesReglementaires(p);
    const g = (9_900 - 7_035) * 7_800;
    expect(m2(s.niveaux[0]!.garages[0]!.aire)).toBe(m2(g));
    expect(m2(s.surfacePlancher)).toBe(m2(76.44e6 - g));
  });

  it('étage : la trémie de l’escalier est déduite ; sous une toiture basse, ce qui a moins de 1,80 m aussi', () => {
    const { h, a, n } = projet(n => quatre(n));
    let h2 = ok(executer(h, 'Étage', [{ type: 'ajouterNiveau', batiment: h.projet.buildings[0]!.id, nom: 'Combles', altitude: 2_700, hauteur: 2_500 }], a));
    const et = h2.projet.buildings[0]!.floors.find(f => f.name === 'Combles')!.id;
    /* combles : murs de 1,00 m, deux pans à 40° */
    h2 = ok(executer(h2, 'x', [...quatre(et, 10_000, 8_000, 1_000), { type: 'creerEscalier', niveau: n, genre: 'straight', position: { x: 1_000, y: 1_000 }, rotation: 0, largeur: 900 },
      { type: 'creerToiture', niveau: et, genre: 'gable', pente: 40, debord: 400, couverture: 'tile', talon: 0 }], a));
    const s = surfacesReglementaires(h2.projet), c = s.niveaux[1]!;
    expect(c.tremies).toBeGreaterThan(0.9e6);
    expect(c.basses).toBeGreaterThan(10e6);
    expect(m2(c.surfacePlancher)).toBe(m2(c.interieur - c.tremies - c.basses));
    expect(c.surfacePlancher).toBeLessThan(c.interieur * 0.75);
  });

  it('seuil de 150 m² : alerte à l’approche ; au-delà, le dossier de permis ne se produit pas', () => {
    const proche = projet(n => quatre(n, 15_000, 10_000)).p;                     // 14,80 × 9,80 = 145,04 m²
    expect(surfacesReglementaires(proche).seuil.etat).toBe('alerte');
    expect(() => dossierPc(proche, { indice: 'A', date: '04/10/2026' })).not.toThrow();
    const grande = projet(n => quatre(n, 16_000, 10_000)).p;                     // 15,80 × 9,80 = 154,84 m²
    const s = surfacesReglementaires(grande);
    expect([s.seuil.etat, m2(s.surfacePlancher)]).toEqual(['bloquant', 154.84]);
    expect(s.seuil.message).toMatch(/architecte est obligatoire/);
    expect(() => dossierPc(grande, { indice: 'A', date: '04/10/2026' })).toThrow(/architecte/);
  });

  it('le dossier de permis porte la surface de plancher et la surface habitable', () => {
    const { p } = projet(n => quatre(n));
    const s = Array.from(dossierPc(p, { indice: 'A', date: '04/10/2026' }).octets, c => String.fromCharCode(c)).join('');
    expect(s).toContain('(76,44)');                                     // surface habitable, au résumé de la page de garde
    expect(s).not.toContain('([\xE0 calculer])');
  });
});
