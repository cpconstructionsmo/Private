/* Enregistrement : dépôt (mémoire et Supabase simulé), synchronisation,
   hors ligne, reprise après plantage, conflit entre deux personnes,
   instantanés et jalons, copie locale IndexedDB. */
import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { canonique, creerProjet, generateurSequentiel, type Project } from '../../src/model';
import { executer, nouvelHistorique, type Acteur, type ChangeSet, type Historique } from '../../src/engine';
import { CopieIndexedDB, CopieMemoire, DepotMemoire, DepotSupabase, INSTANTANE_TOUS, Synchro, type ClientSupabase } from '../../src/persistence';

const acteur = (prefixe = 'o', par = 'CP'): Acteur => { let t = 0; return { par, maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel(prefixe) } };
const projet = (): Project => creerProjet({ nom: 'Maison fictive', crmChantierId: 'c1', id: generateurSequentiel('p') });
/** n murs, un ChangeSet chacun */
function murs(h0: Historique, n: number, a: Acteur, x0 = 0): { h: Historique; cs: ChangeSet[] } {
  let h = h0; const cs: ChangeSet[] = [];
  const niv = h.projet.buildings[0]!.floors[0]!.id;
  for (let i = 0; i < n; i++) {
    const r = executer(h, 'Mur ' + i, [{ type: 'creerMur', niveau: niv, a: { x: x0 + i * 500, y: 0 }, b: { x: x0 + i * 500, y: 3_000 }, epaisseur: 100 }], a);
    if (!r.ok) throw new Error(r.erreurs.join());
    h = r.historique; cs.push(r.changeSet);
  }
  return { h, cs };
}

describe('dépôt en mémoire (même règle que le serveur)', () => {
  it('créer, envoyer dans l’ordre, recharger : identique', async () => {
    const d = new DepotMemoire(), p = projet(), a = acteur();
    await d.creer(p, 'CP');
    const { h, cs } = murs(nouvelHistorique(p), 5, a);
    for (const c of cs) expect((await d.envoyer(p.id, c)).ok).toBe(true);
    expect(canonique(await d.charger(p.id))).toBe(canonique(h.projet));
    expect(await d.lister('c1')).toMatchObject([{ id: p.id, revision: 5 }]);
  });

  it('un envoi préparé sur une révision dépassée : conflit, rien d’écrasé', async () => {
    const d = new DepotMemoire(), p = projet();
    await d.creer(p, 'CP');
    const A = murs(nouvelHistorique(p), 1, acteur('a', 'Alice'));
    const B = murs(nouvelHistorique(p), 1, acteur('b', 'Bruno'), 9_000);
    expect((await d.envoyer(p.id, A.cs[0]!)).ok).toBe(true);
    const r = await d.envoyer(p.id, B.cs[0]!);
    expect(r).toMatchObject({ ok: false, conflit: true, revisionServeur: 1 });
    expect(canonique(await d.charger(p.id))).toBe(canonique(A.h.projet));
  });
});

describe('synchronisation', () => {
  it('120 modifications : instantanés tous les 50, rechargement identique', async () => {
    const d = new DepotMemoire(), copie = new CopieMemoire(), p = projet(), a = acteur();
    await d.creer(p, 'CP');
    const s = new Synchro(d, copie, p.id);
    let h = nouvelHistorique(p);
    for (let i = 0; i < 120; i++) {
      const r = murs(h, 1, a, i * 10);
      h = r.h;
      await s.ajouter(r.cs[0]!, h.projet);
      await s.envoyer();
    }
    expect(s.etat).toBe('a_jour');
    expect(INSTANTANE_TOUS).toBe(50);
    expect(canonique(await d.charger(p.id))).toBe(canonique(h.projet));
    expect(copie.donnees.size).toBe(0);
  });

  it('hors ligne : rien n’est perdu ; le réseau revient : tout part, dans l’ordre', async () => {
    const d = new DepotMemoire(), copie = new CopieMemoire(), p = projet(), a = acteur();
    await d.creer(p, 'CP');
    const s = new Synchro(d, copie, p.id);
    const { h, cs } = murs(nouvelHistorique(p), 3, a);
    d.enPanne = true;
    for (const c of cs) await s.ajouter(c, h.projet);
    await s.envoyer();
    expect(s.etat).toBe('hors_ligne');
    expect(s.enAttente).toBe(3);
    expect((await copie.lire(p.id))!.enAttente).toHaveLength(3);
    d.enPanne = false;
    await s.envoyer();
    expect(s.etat).toBe('a_jour');
    expect(canonique(await d.charger(p.id))).toBe(canonique(h.projet));
  });

  it('page fermée avant l’envoi : reprise depuis la copie locale', async () => {
    const d = new DepotMemoire(), copie = new CopieMemoire(), p = projet(), a = acteur();
    await d.creer(p, 'CP');
    const { h, cs } = murs(nouvelHistorique(p), 4, a);
    const s1 = new Synchro(d, copie, p.id);
    for (const c of cs) await s1.ajouter(c, h.projet);       // … et la page se ferme sans envoyer
    const s2 = new Synchro(d, copie, p.id);
    const e = await s2.reprendre();
    expect(canonique(e!.projet)).toBe(canonique(h.projet));
    await s2.envoyer();
    expect(s2.etat).toBe('a_jour');
    expect(canonique(await d.charger(p.id))).toBe(canonique(h.projet));
  });

  it('deux personnes sur le même projet : la seconde est arrêtée, ses modifications restent sur son appareil', async () => {
    const d = new DepotMemoire(), p = projet();
    await d.creer(p, 'CP');
    const cA = new CopieMemoire(), cB = new CopieMemoire();
    const sA = new Synchro(d, cA, p.id), sB = new Synchro(d, cB, p.id);
    const A = murs(nouvelHistorique(p), 2, acteur('a', 'Alice'));
    const B = murs(nouvelHistorique(p), 1, acteur('b', 'Bruno'), 9_000);
    for (const c of A.cs) await sA.ajouter(c, A.h.projet);
    await sA.envoyer();
    await sB.ajouter(B.cs[0]!, B.h.projet);
    await sB.envoyer();
    expect(sB.etat).toBe('conflit');
    expect(sB.message).toMatch(/rien n’a été écrasé/);
    expect((await cB.lire(p.id))!.enAttente).toHaveLength(1);
    expect(canonique(await d.charger(p.id))).toBe(canonique(A.h.projet));
  });

  it('jalon « APS V1 » : un instantané nommé part avec le prochain envoi', async () => {
    const instantanes: (string | undefined)[] = [];
    const d = new DepotMemoire();
    const envoyer = d.envoyer.bind(d);
    d.envoyer = async (id, cs, inst) => { instantanes.push(inst?.jalon); return envoyer(id, cs, inst) };
    const p = projet(); await d.creer(p, 'CP');
    const s = new Synchro(d, new CopieMemoire(), p.id);
    const { h, cs } = murs(nouvelHistorique(p), 2, acteur());
    await s.ajouter(cs[0]!, h.projet); await s.envoyer();
    await s.marquerJalon('APS V1');
    await s.ajouter(cs[1]!, h.projet); await s.envoyer();
    expect(instantanes).toEqual([undefined, 'APS V1']);
  });
});

describe('dépôt Supabase (client simulé)', () => {
  /** un faux client qui note les appels et rend ce qu'on lui dit */
  function faux(reponses: { rpc?: { data: unknown; error: { message: string; code?: string } | null }; select?: Record<string, unknown[]> } = {}) {
    const appels: { table?: string; op: string; args: unknown[] }[] = [];
    const requete = (table: string) => {
      const q: Record<string, unknown> = {};
      for (const op of ['select', 'eq', 'gte', 'order', 'limit', 'delete']) q[op] = (...args: unknown[]) => { appels.push({ table, op, args }); return q };
      q['insert'] = (...args: unknown[]) => { appels.push({ table, op: 'insert', args }); return Promise.resolve({ data: null, error: null }) };
      q['then'] = (res: (v: unknown) => void) => res({ data: reponses.select?.[table] ?? [], error: null });
      return q;
    };
    const client: ClientSupabase = {
      from: (t: string) => requete(t),
      rpc: (f: string, args: Record<string, unknown>) => { appels.push({ op: 'rpc:' + f, args: [args] }); return Promise.resolve(reponses.rpc ?? { data: 1, error: null }) },
    };
    return { client, appels };
  }

  it('créer : le projet puis son instantané de départ, jamais app_data', async () => {
    const { client, appels } = faux(), p = projet();
    await new DepotSupabase(client).creer(p, 'CP');
    expect(appels.filter(x => x.op === 'insert').map(x => x.table)).toEqual(['designer_projects', 'designer_revisions']);
    expect(appels.some(x => x.table === 'app_data')).toBe(false);
  });

  it('envoyer : la fonction designer_enregistrer, avec la révision d’avant', async () => {
    const { client, appels } = faux({ rpc: { data: 1, error: null } }), p = projet();
    const { cs } = murs(nouvelHistorique(p), 1, acteur());
    expect(await new DepotSupabase(client).envoyer(p.id, cs[0]!)).toEqual({ ok: true, revision: 1 });
    expect(appels[0]).toMatchObject({ op: 'rpc:designer_enregistrer' });
    expect(appels[0]!.args[0]).toMatchObject({ p_project: p.id, p_revision_avant: 0, p_demande_par: 'user', p_par: 'CP', p_instantane: null });
  });

  it('conflit renvoyé par le serveur (code 40001) : reconnu comme tel', async () => {
    const { client } = faux({ rpc: { data: null, error: { code: '40001', message: 'conflit de révision : le projet est à la révision 7, pas 6' } } });
    const p = projet(); const { cs } = murs(nouvelHistorique(p), 1, acteur());
    expect(await new DepotSupabase(client).envoyer(p.id, cs[0]!)).toMatchObject({ ok: false, conflit: true, revisionServeur: 7 });
  });

  it('charger : dernier instantané + ChangeSets suivants, rejoués', async () => {
    const p = projet(); const { h, cs } = murs(nouvelHistorique(p), 3, acteur());
    const lignes = cs.map(c => ({ id: c.id, titre: c.titre, demande_par: c.demandePar, par: c.par, cree_le: c.creeLe, revision_avant: c.revisionAvant, revision_apres: c.revisionApres, operations: c.operations }));
    const { client } = faux({ select: { designer_revisions: [{ revision: 0, modele: p }], designer_changesets: lignes } });
    expect(canonique(await new DepotSupabase(client).charger(p.id))).toBe(canonique(h.projet));
  });
});

describe('copie locale IndexedDB', () => {
  it('écrire, relire, effacer', async () => {
    const c = new CopieIndexedDB(new IDBFactory());
    const p = projet(); const { h, cs } = murs(nouvelHistorique(p), 2, acteur());
    await c.ecrire(p.id, { projet: h.projet, enAttente: cs, jalon: 'PC' });
    const e = await c.lire(p.id);
    expect(canonique(e)).toBe(canonique({ projet: h.projet, enAttente: cs, jalon: 'PC' }));
    await c.effacer(p.id);
    expect(await c.lire(p.id)).toBeNull();
  });
});
