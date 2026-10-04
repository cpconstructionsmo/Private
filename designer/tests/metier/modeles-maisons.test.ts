/* Les modèles de maisons de départ : chacun se pose en une transaction sur un
   projet vide, ses pièces sont fermées et nommées, sa toiture se calcule, il
   reste sous le seuil de 150 m², et un « annuler » le retire. */
import { describe, expect, it } from 'vitest';
import { creerProjet, generateurSequentiel } from '../../src/model';
import { annuler, executer, nouvelHistorique, type Acteur } from '../../src/engine';
import { planDuNiveau, surfacesReglementaires, toitureDuNiveau, tremiesDuNiveau } from '../../src/building';
import { MODELES_MAISONS } from '../../src/catalogue/modeles-maisons';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };

describe('modèles de maisons', () => {
  for (const m of MODELES_MAISONS) it(m.libelle + ' : posé d’un coup, pièces fermées et nommées, toiture, sous 150 m², annulable', () => {
    const a = acteur(), p = creerProjet({ nom: 'Essai', id: generateurSequentiel('p') });
    const b = p.buildings[0]!, ids = generateurSequentiel('m');
    const cmds = m.commandes({ batiment: b.id, niveau: b.floors[0]!.id, id: ids });
    const r = executer(nouvelHistorique(p), m.libelle, cmds, a);
    if (!r.ok) throw new Error(r.erreurs.join(' ; '));
    const P = r.historique.projet;
    const pieces = cmds.filter(c => c.type === 'creerPiece').length;
    let fermees = 0, roofs = 0;
    for (const f of P.buildings[0]!.floors) {
      const plan = planDuNiveau(f);
      fermees += plan.zones.filter(z => z.piece).length;
      expect(plan.zones.every(z => z.piece), f.name + ' : chaque espace clos est nommé').toBe(true);
      const t = toitureDuNiveau(f);
      if (t) { expect(t.ok, f.name + ' : toiture calculée').toBe(true); roofs++ }
    }
    expect(fermees).toBe(pieces);
    expect(roofs).toBe(1);
    const s = surfacesReglementaires(P);
    expect(s.surfacePlancher / 1e6).toBeGreaterThan(70);
    expect(s.seuil.etat).toBe('ok');
    expect(annuler(r.historique).projet.buildings[0]!.floors).toHaveLength(1);
    expect(Object.keys(annuler(r.historique).projet.buildings[0]!.floors[0]!.objects)).toHaveLength(0);
  });

  it('la maison à étage : l’escalier arrive à l’étage, sa trémie s’ouvre dans le palier', () => {
    const a = acteur(), p = creerProjet({ nom: 'Essai', id: generateurSequentiel('p') });
    const b = p.buildings[0]!, m = MODELES_MAISONS.find(x => x.id === 'etage-r1')!;
    const r = executer(nouvelHistorique(p), 'x', m.commandes({ batiment: b.id, niveau: b.floors[0]!.id, id: generateurSequentiel('m') }), a);
    if (!r.ok) throw new Error(r.erreurs.join(' ; '));
    const etage = r.historique.projet.buildings[0]!.floors.find(f => f.name === 'Étage')!;
    expect(tremiesDuNiveau(r.historique.projet, etage)).toHaveLength(1);
  });
});
