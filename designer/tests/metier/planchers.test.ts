/* Plafond et sol d'un niveau : une composition du catalogue (couches, du
   haut vers le bas), choisie au panneau du niveau ; annulable ; une
   composition de l'autre genre ou inconnue est refusée ; les anciens
   projets (sans composition) restent lisibles. Projet fictif. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur } from '../../src/engine';
import { COMPOSITIONS_PLANCHERS, compositionPlancher, epaisseurPlancher } from '../../src/catalogue/planchers';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 5) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };

describe('compositions de plafond et de plancher', () => {
  it('le catalogue : identifiants uniques, couches positives, épaisseurs d’usage', () => {
    expect(new Set(COMPOSITIONS_PLANCHERS.map(k => k.id)).size).toBe(COMPOSITIONS_PLANCHERS.length);
    for (const k of COMPOSITIONS_PLANCHERS) expect(k.couches.every(c => c.epaisseur > 0)).toBe(true);
    expect(epaisseurPlancher(compositionPlancher('plafond-combles-47')!)).toBe(470);
    expect(epaisseurPlancher(compositionPlancher('sol-beton-isole-30')!)).toBe(300);
  });

  it('choisir le plafond et le sol d’un niveau, puis annuler ; refus d’un genre qui ne convient pas', () => {
    const a = acteur(), p = creerProjet({ nom: 'Fictif', id: generateurSequentiel('p') }), f = p.buildings[0]!.floors[0]!;
    expect(f.ceilingRef ?? null).toBeNull();
    const r = executer(nouvelHistorique(p), 'x', [{ type: 'modifierNiveau', id: f.id, plafond: 'plafond-combles-47', plancher: 'sol-beton-isole-30' }], a);
    if (!r.ok) throw new Error(r.erreurs.join());
    expect(r.historique.projet.buildings[0]!.floors[0]!).toMatchObject({ ceilingRef: 'plafond-combles-47', floorRef: 'sol-beton-isole-30' });
    const u = annuler(r.historique).projet.buildings[0]!.floors[0]!;
    expect(u.ceilingRef ?? null).toBeNull(); expect(u.floorRef ?? null).toBeNull();
    const s = executer(r.historique, 'x', [{ type: 'modifierNiveau', id: f.id, plafond: null }], a);
    if (!s.ok) throw new Error(s.erreurs.join());
    expect(s.historique.projet.buildings[0]!.floors[0]!.ceilingRef ?? null).toBeNull();
    const k = executer(r.historique, 'x', [{ type: 'modifierNiveau', id: f.id, plafond: 'sol-beton-isole-30' }], a);
    expect(k.ok ? '' : k.erreurs.join()).toMatch(/plafond inconnue/);
  });
});
