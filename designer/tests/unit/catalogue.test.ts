/* La bibliothèque d'ouvertures : des gabarits cohérents, posés et changés
   par les commandes ; une ouverture d'avant la bibliothèque reste lisible. */
import { describe, expect, it } from 'vitest';
import { canonique, creerProjet, generateurSequentiel, type Opening } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur } from '../../src/engine';
import { MODELES_OUVERTURES, FAMILLES, manoeuvreDe, modeleOuverture } from '../../src/catalogue/ouvertures';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };

describe('catalogue d’ouvertures', () => {
  it('identifiants uniques, toutes les familles servies, cotes plausibles, rien au-dessus de 2,15 m', () => {
    expect(new Set(MODELES_OUVERTURES.map(m => m.id)).size).toBe(MODELES_OUVERTURES.length);
    for (const f of Object.keys(FAMILLES)) expect(MODELES_OUVERTURES.some(m => m.famille === f)).toBe(true);
    for (const m of MODELES_OUVERTURES) {
      expect(m.largeur).toBeGreaterThan(0); expect(m.hauteur).toBeGreaterThan(0); expect(m.allege).toBeGreaterThanOrEqual(0);
      expect(m.allege + m.hauteur).toBeLessThanOrEqual(2_150);
      expect(m.vantaux).toBeGreaterThanOrEqual(1); expect(m.vantaux).toBeLessThanOrEqual(4);
      expect(m.libelle).not.toMatch(/€|prix/i);
    }
    expect(modeleOuverture('fen-2v-120x125')).toMatchObject({ genre: 'window', largeur: 1_200, hauteur: 1_250, allege: 900 });
    expect(modeleOuverture('inconnu')).toBeUndefined();
  });

  it('une ouverture sans vantaux ni manœuvre (d’avant la bibliothèque) prend les valeurs du genre', () => {
    expect(manoeuvreDe({ kind: 'door' })).toEqual({ manoeuvre: 'hinged', vantaux: 1 });
    expect(manoeuvreDe({ kind: 'bay' })).toEqual({ manoeuvre: 'sliding', vantaux: 2 });
    expect(manoeuvreDe({ kind: 'window', leaves: 1, operation: 'tilt_turn' })).toEqual({ manoeuvre: 'tilt_turn', vantaux: 1 });
  });

  it('poser un modèle, en changer, annuler : l’ouverture revient exactement (champs absents compris)', () => {
    const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
    const n = p.buildings[0]!.floors[0]!.id;
    let h = nouvelHistorique(p);
    const r1 = executer(h, 'Mur', [{ type: 'creerMur', niveau: n, a: { x: 0, y: 0 }, b: { x: 6_000, y: 0 }, epaisseur: 200, role: 'exterior' }], a);
    if (!r1.ok) throw new Error(); h = r1.historique;
    const mur = Object.values(h.projet.buildings[0]!.floors[0]!.objects)[0]!.id;
    const r2 = executer(h, 'Fenêtre', [{ type: 'creerOuverture', mur, position: 2_000, largeur: 1_000, hauteur: 1_250, allege: 900, genre: 'window' }], a);
    if (!r2.ok) throw new Error(); h = r2.historique;
    const o = Object.values(h.projet.buildings[0]!.floors[0]!.objects).find(x => x.type === 'opening') as Opening;
    expect(o.leaves).toBeUndefined();
    const avant = canonique(h.projet);
    const m = modeleOuverture('baie-2v-240x215')!;
    const r3 = executer(h, 'Modèle', [{ type: 'modifierOuverture', id: o.id, genre: m.genre, largeur: m.largeur, hauteur: m.hauteur, allege: m.allege, vantaux: m.vantaux, manoeuvre: m.manoeuvre, modele: { id: m.id, label: m.libelle } }], a);
    if (!r3.ok) throw new Error(r3.erreurs.join()); h = r3.historique;
    expect(h.projet.buildings[0]!.floors[0]!.objects[o.id]).toMatchObject({ kind: 'bay', width: 2_400, sill: 0, leaves: 2, operation: 'sliding', catalogRef: { id: 'baie-2v-240x215' } });
    expect(canonique(annuler(h).projet)).toBe(avant);
    expect(executer(h, 'x', [{ type: 'modifierOuverture', id: o.id, vantaux: 5 }], a)).toMatchObject({ ok: false, erreurs: ['de 1 à 4 vantaux'] });
    expect(executer(h, 'x', [{ type: 'creerOuverture', mur, position: 5_000, largeur: 600, hauteur: 600, genre: 'window', vantaux: 1.5 }], a).ok).toBe(false);
  });
});
