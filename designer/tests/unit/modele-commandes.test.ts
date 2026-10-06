/* Modèle et commandes : création, validation, provenance, suppression en
   cascade, transactions, annuler / rétablir, sérialisation, migrations. */
import { describe, expect, it } from 'vitest';
import fixtureV1 from '../fixtures/projet_v1.json?raw';
import {
  canonique, creerProjet, empreinte, enregistrer, generateurSequentiel, migrer, relire, trouverObjet, ulid,
  type Project, type Wall,
} from '../../src/model';
import { annuler, executer, nouvelHistorique, peutAnnuler, peutRetablir, retablir, type Acteur, type Commande, type Historique } from '../../src/engine';

const acteur = (): Acteur => {
  let t = Date.UTC(2026, 9, 1, 8, 0, 0);
  return { par: 'CP', maintenant: () => new Date(t += 1000).toISOString(), id: generateurSequentiel('o') };
};
const depart = (): { h: Historique; a: Acteur; rdc: string } => {
  const a = acteur();
  const p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  return { h: nouvelHistorique(p), a, rdc: p.buildings[0]!.floors[0]!.id };
};
const ok = (r: ReturnType<typeof executer>): Historique => { if (!r.ok) throw new Error(r.erreurs.join(' ; ')); return r.historique };
const mur = (niveau: string, x1: number, y1: number, x2: number, y2: number, epaisseur = 200, role: Wall['role'] = 'exterior'): Commande =>
  ({ type: 'creerMur', niveau, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, epaisseur, role });
/** les quatre murs d'un rectangle 10 × 8 m d'axe */
const quatreMurs = (n: string): Commande[] => [mur(n, 0, 0, 10_000, 0), mur(n, 10_000, 0, 10_000, 8_000), mur(n, 10_000, 8_000, 0, 8_000), mur(n, 0, 8_000, 0, 0)];

describe('identifiants', () => {
  it('ULID : 26 caractères, triés par date', () => {
    const a = ulid(Date.UTC(2026, 0, 1)), b = ulid(Date.UTC(2026, 0, 2));
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(a < b).toBe(true);
  });
});

describe('projet', () => {
  it('un projet neuf : un bâtiment, un RDC à ±0,00, révision 0, schéma courant', () => {
    const p = creerProjet({ nom: 'X', crmChantierId: 'c1' });
    expect(p.buildings).toHaveLength(1);
    expect(p.buildings[0]!.floors[0]).toMatchObject({ name: 'RDC', elevation: 0, height: 2_500 });
    expect(p).toMatchObject({ revision: 0, schemaVersion: 1, units: 'mm', crmChantierId: 'c1' });
  });
});

describe('commandes', () => {
  it('hauteur par défaut : un mur extérieur monte à l’arase (2,85 m), une cloison au plafond (2,50 m), sous un étage jusqu’à son plancher', async () => {
    const { h, a, rdc } = depart();
    const h1 = ok(executer(h, 'x', [...quatreMurs(rdc), mur(rdc, 5_000, 0, 5_000, 8_000, 70, 'partition'), { type: 'creerToiture', niveau: rdc, genre: 'hip', pente: 35, debord: 200, couverture: 'tile' }], a));
    const W = Object.values(h1.projet.buildings[0]!.floors[0]!.objects).filter((o): o is Wall => o.type === 'wall');
    expect(W.filter(w => w.role === 'exterior').map(w => w.height)).toEqual([2_850, 2_850, 2_850, 2_850]);
    expect(W.find(w => w.role === 'partition')!.height).toBe(2_500);
    /* l'égout : 2,85 m au nu du mur, moins 20 cm de débord à 35° */
    const { toitureDuNiveau } = await import('../../src/building');
    const t = toitureDuNiveau(h1.projet.buildings[0]!.floors[0]!)!;
    expect(t.ok && t.toitures[0]!.egoutZ).toBeCloseTo(2_850 - 200 * Math.tan(35 * Math.PI / 180), 6);
    /* un étage à 2,70 m : les murs extérieurs du RDC tracés ensuite s'arrêtent à son plancher */
    const h2 = ok(executer(h, 'x', [{ type: 'ajouterNiveau', batiment: h.projet.buildings[0]!.id, nom: 'Étage', altitude: 2_700, hauteur: 2_500 }, mur(rdc, 0, 0, 4_000, 0)], a));
    expect(Object.values(h2.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'wall')).toMatchObject({ height: 2_700 });
  });

  it('un mur : créé, daté, signé ; « porteur » à contrôler, jamais confirmé', () => {
    const { h, a, rdc } = depart();
    const h1 = ok(executer(h, 'Mur', [mur(rdc, 0, 0, 5_000, 0)], a));
    const w = Object.values(h1.projet.buildings[0]!.floors[0]!.objects)[0] as Wall;
    /* un mur extérieur tracé sans hauteur monte à l'arase : 2,50 m sous plafond + 35 cm */
    expect(w).toMatchObject({ type: 'wall', thickness: 200, height: 2_850, revision: 1, status: 'confirmed' });
    expect(w.loadBearing.status).toBe('to_check');
    expect(w.sourceRefs[0]).toMatchObject({ kind: 'user', by: 'CP' });
    expect(h1.projet.revision).toBe(1);
  });

  it('refusées, et rien ne change : longueur nulle, épaisseur négative, niveau inconnu', () => {
    const { h, a, rdc } = depart();
    for (const c of [mur(rdc, 0, 0, 0, 0), mur(rdc, 0, 0, 1_000, 0, -5), mur('inconnu', 0, 0, 1_000, 0)]) {
      const r = executer(h, 'X', [c], a);
      expect(r.ok).toBe(false);
    }
  });

  it('une ouverture tient dans son mur ; sinon refus explicite', () => {
    const { h, a, rdc } = depart();
    const h1 = ok(executer(h, 'Mur', [mur(rdc, 0, 0, 5_000, 0)], a));
    const m = Object.keys(h1.projet.buildings[0]!.floors[0]!.objects)[0]!;
    const r = executer(h1, 'Baie', [{ type: 'creerOuverture', mur: m, position: 4_500, largeur: 2_400, hauteur: 2_150, genre: 'bay' }], a);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreurs[0]).toMatch(/dépasse du mur/);
    const h2 = ok(executer(h1, 'Baie', [{ type: 'creerOuverture', mur: m, position: 2_500, largeur: 2_400, hauteur: 2_150, genre: 'bay' }], a));
    const baie = Object.values(h2.projet.buildings[0]!.floors[0]!.objects).find(o => o.type === 'opening')!;
    /* 2,40 → 3,50 m : accepté (centrée à 2,50 m d'un mur de 5 m) */
    const h3 = ok(executer(h2, 'Élargir', [{ type: 'modifierOuverture', id: baie.id, largeur: 3_500 }], a));
    expect(trouverObjet(h3.projet, baie.id)!.objet).toMatchObject({ width: 3_500, revision: 3 });
  });

  it('raccourcir un mur sous son ouverture : refusé', () => {
    const { h, a, rdc } = depart();
    const h1 = ok(executer(h, 'Mur', [mur(rdc, 0, 0, 5_000, 0)], a));
    const m = Object.keys(h1.projet.buildings[0]!.floors[0]!.objects)[0]!;
    const h2 = ok(executer(h1, 'Porte', [{ type: 'creerOuverture', mur: m, position: 4_000, largeur: 900, hauteur: 2_150, genre: 'door' }], a));
    expect(executer(h2, 'Raccourcir', [{ type: 'deplacerMur', id: m, b: { x: 3_000, y: 0 } }], a).ok).toBe(false);
    expect(executer(h2, 'Allonger', [{ type: 'deplacerMur', id: m, b: { x: 6_000, y: 0 } }], a).ok).toBe(true);
  });

  it('supprimer un mur emporte ses ouvertures ; annuler rend les deux', () => {
    const { h, a, rdc } = depart();
    const h1 = ok(executer(h, 'Mur', [mur(rdc, 0, 0, 5_000, 0)], a));
    const m = Object.keys(h1.projet.buildings[0]!.floors[0]!.objects)[0]!;
    const h2 = ok(executer(h1, 'Porte', [{ type: 'creerOuverture', mur: m, position: 1_000, largeur: 900, hauteur: 2_150, genre: 'door', sens: { side: 'left', inward: true } }], a));
    const h3 = ok(executer(h2, 'Supprimer', [{ type: 'supprimer', id: m }], a));
    expect(Object.keys(h3.projet.buildings[0]!.floors[0]!.objects)).toHaveLength(0);
    expect(canonique(annuler(h3).projet)).toBe(canonique(h2.projet));
  });

  it('une pièce de quatre murs + son nom : UNE action, UN « annuler »', () => {
    const { h, a, rdc } = depart();
    const h1 = ok(executer(h, 'Séjour', [...quatreMurs(rdc), { type: 'creerPiece', niveau: rdc, point: { x: 5_000, y: 4_000 }, nom: 'Séjour', usage: 'living' }], a));
    expect(Object.keys(h1.projet.buildings[0]!.floors[0]!.objects)).toHaveLength(5);
    expect(h1.passe).toHaveLength(1);
    expect(canonique(annuler(h1).projet)).toBe(canonique(h.projet));
  });

  it('une transaction dont une commande est refusée ne change rien', () => {
    const { h, a, rdc } = depart();
    const r = executer(h, 'X', [mur(rdc, 0, 0, 5_000, 0), mur(rdc, 0, 0, 0, 0)], a);
    expect(r.ok).toBe(false);
  });

  it('pièce : humide par défaut pour cuisine, salle de bains, WC', () => {
    const { h, a, rdc } = depart();
    const h1 = ok(executer(h, 'Pièces', [
      { type: 'creerPiece', niveau: rdc, point: { x: 1, y: 1 }, nom: 'Cuisine', usage: 'kitchen' },
      { type: 'creerPiece', niveau: rdc, point: { x: 2, y: 2 }, nom: 'Chambre 1', usage: 'bedroom' }], a));
    const R = Object.values(h1.projet.buildings[0]!.floors[0]!.objects);
    expect(R.find(r => r.type === 'room' && r.name === 'Cuisine')).toMatchObject({ wet: true });
    expect(R.find(r => r.type === 'room' && r.name === 'Chambre 1')).toMatchObject({ wet: false });
  });

  it('niveaux et nom du projet', () => {
    const { h, a } = depart();
    const b = h.projet.buildings[0]!.id;
    const h1 = ok(executer(h, 'Étage', [{ type: 'ajouterNiveau', batiment: b, nom: 'R+1', altitude: 2_800, hauteur: 2_500 }, { type: 'renommerProjet', nom: 'Maison Exemple' }], a));
    expect(h1.projet.buildings[0]!.floors.map(f => f.name)).toEqual(['RDC', 'R+1']);
    expect(h1.projet.name).toBe('Maison Exemple');
    expect(canonique(annuler(h1).projet)).toBe(canonique(h.projet));
  });
});

describe('annuler / rétablir', () => {
  it('100 actions, 100 « annuler » : retour exact, puis 100 « rétablir » : retour exact', () => {
    const { h, a, rdc } = depart();
    let x = h;
    const etats = [canonique(x.projet)];
    for (let i = 0; i < 100; i++) {
      x = ok(executer(x, 'Mur ' + i, [mur(rdc, i * 100, 0, i * 100, 3_000, 100, 'partition')], a));
      etats.push(canonique(x.projet));
    }
    for (let i = 99; i >= 0; i--) { x = annuler(x); expect(canonique(x.projet)).toBe(etats[i]) }
    expect(peutAnnuler(x)).toBe(false);
    for (let i = 1; i <= 100; i++) { x = retablir(x); expect(canonique(x.projet)).toBe(etats[i]) }
    expect(peutRetablir(x)).toBe(false);
  });

  it('une nouvelle action efface ce qui pouvait être rétabli', () => {
    const { h, a, rdc } = depart();
    const h2 = annuler(ok(executer(h, 'A', [mur(rdc, 0, 0, 1_000, 0)], a)));
    expect(peutRetablir(h2)).toBe(true);
    expect(peutRetablir(ok(executer(h2, 'B', [mur(rdc, 0, 0, 2_000, 0)], a)))).toBe(false);
  });
});

describe('sérialisation et migrations', () => {
  it('canonique : clés triées, valeurs absentes ignorées', () => {
    expect(canonique({ b: 1, a: { d: undefined, c: [2, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[2,{"y":2,"z":1}]},"b":1}');
    expect(empreinte({ a: 1, b: 2 })).toBe(empreinte({ b: 2, a: 1 }));
  });

  it('enregistrer puis relire : identique', () => {
    const { h, a, rdc } = depart();
    const p = ok(executer(h, 'Séjour', quatreMurs(rdc), a)).projet;
    expect(canonique(relire(enregistrer(p)))).toBe(canonique(p));
  });

  it('un projet d’une version plus récente est refusé, pas abîmé', () => {
    expect(() => relire(JSON.stringify({ schemaVersion: 99 }))).toThrow(/plus récente/);
    expect(() => relire('{"a":1}')).toThrow(/pas un projet/);
  });

  it('migration n → n+1 : appliquée dans l’ordre, données d’origine non modifiées', () => {
    const ancien = { schemaVersion: 1, name: 'X', buildings: [] };
    const m = migrer(ancien, 3, { 1: p => ({ ...p, phase: 'ESQ' }), 2: p => ({ ...p, units: 'mm' }) }) as unknown as Record<string, unknown>;
    expect(m).toMatchObject({ schemaVersion: 3, phase: 'ESQ', units: 'mm' });
    expect(ancien.schemaVersion).toBe(1);
    expect(() => migrer(ancien, 3, { 1: p => p })).toThrow(/introuvable/);
  });

  it('instantané figé du schéma 1 (tests/fixtures/projet_v1.json) : relu à l’identique', () => {
    const texte = fixtureV1;
    const p: Project = relire(texte);
    expect(p.schemaVersion).toBe(1);
    expect(Object.keys(p.buildings[0]!.floors[0]!.objects)).toHaveLength(6);
    expect(canonique(p)).toBe(canonique(JSON.parse(texte)));
  });
});
