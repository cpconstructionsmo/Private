/* Le dépôt Supabase : tables designer_projects, designer_revisions,
   designer_changesets et la fonction designer_enregistrer()
   (supabase/designer/schema.sql). Jamais app_data (ADR-0003).

   Le client est passé en paramètre : en production, celui de la session de
   l'utilisateur (la même que le suivi de chantiers) ; dans les tests, un
   faux client qui note les appels. */
import type { Project } from '../model/types';
import type { ChangeSet } from '../engine/historique';
import { reconstruire, type Depot, type Envoi, type ResumeProjet } from './depot';

/** le sous-ensemble du client supabase-js dont le dépôt a besoin */
export interface ClientSupabase {
  from(table: string): any;   // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc(fonction: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

const verifier = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

export class DepotSupabase implements Depot {
  constructor(private readonly sb: ClientSupabase) {}

  async creer(projet: Project, par: string): Promise<void> {
    verifier(await this.sb.from('designer_projects').insert({
      id: projet.id, crm_chantier_id: projet.crmChantierId ?? null, nom: projet.name, schema_version: projet.schemaVersion, revision: projet.revision,
    }));
    const r = await this.sb.from('designer_revisions').insert({ project_id: projet.id, revision: projet.revision, modele: projet, message: 'Création', jalon: 'Création', par });
    if (r.error) {
      /* sans instantané de départ, le projet ne pourrait pas se charger : on le retire */
      await this.sb.from('designer_projects').delete().eq('id', projet.id);
      throw new Error(r.error.message);
    }
  }

  async lister(crmChantierId?: string): Promise<ResumeProjet[]> {
    let q = this.sb.from('designer_projects').select('id, nom, crm_chantier_id, revision, maj_le').order('maj_le', { ascending: false });
    if (crmChantierId) q = q.eq('crm_chantier_id', crmChantierId);
    const L = verifier(await q) as { id: string; nom: string; crm_chantier_id: string | null; revision: number; maj_le: string }[];
    return L.map(x => ({ id: x.id, nom: x.nom, revision: x.revision, majLe: x.maj_le, ...(x.crm_chantier_id ? { crmChantierId: x.crm_chantier_id } : {}) }));
  }

  async charger(id: string): Promise<Project> {
    const I = verifier(await this.sb.from('designer_revisions').select('revision, modele').eq('project_id', id).order('revision', { ascending: false }).limit(1)) as { revision: number; modele: Project }[];
    const base = I[0];
    if (!base) throw new Error('projet introuvable, ou sans instantané');
    const J = verifier(await this.sb.from('designer_changesets').select('id, titre, demande_par, par, cree_le, revision_avant, revision_apres, operations')
      .eq('project_id', id).gte('revision_avant', base.revision).order('revision_avant', { ascending: true })) as {
      id: string; titre: string; demande_par: 'user' | 'ai'; par: string | null; cree_le: string; revision_avant: number; revision_apres: number; operations: ChangeSet['operations'];
    }[];
    const journal: ChangeSet[] = J.map(x => ({ id: x.id, titre: x.titre, demandePar: x.demande_par, par: x.par ?? '', creeLe: x.cree_le,
      revisionAvant: x.revision_avant, revisionApres: x.revision_apres, operations: x.operations }));
    return reconstruire(base.modele, journal);
  }

  async envoyer(projetId: string, cs: ChangeSet, instantane?: { projet: Project; jalon?: string }): Promise<Envoi> {
    const r = await this.sb.rpc('designer_enregistrer', {
      p_project: projetId, p_revision_avant: cs.revisionAvant, p_titre: cs.titre, p_demande_par: cs.demandePar,
      p_operations: cs.operations, p_par: cs.par, p_instantane: instantane ? instantane.projet : null, p_jalon: instantane?.jalon ?? null,
    });
    if (!r.error) return { ok: true, revision: Number(r.data) };
    if (r.error.code === '40001' || /conflit de révision/.test(r.error.message)) {
      const m = /est à la révision (\d+)/.exec(r.error.message);
      return { ok: false, conflit: true, ...(m ? { revisionServeur: Number(m[1]) } : {}), message: r.error.message };
    }
    return { ok: false, conflit: false, message: r.error.message };
  }
}
