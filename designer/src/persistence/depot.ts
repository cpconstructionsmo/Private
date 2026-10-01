/* Le dépôt des projets (ADR-0003) : ce qui est enregistré, et comment.

   Un projet = une suite de ChangeSets (le journal) et, de loin en loin, un
   instantané complet du modèle. Charger : le dernier instantané, puis les
   ChangeSets qui le suivent, rejoués. Enregistrer : un ChangeSet, accepté
   SEULEMENT si le projet est encore à la révision sur laquelle il a été
   préparé — sinon « conflit », et rien n'est écrasé.

   Deux réalisations : Supabase (tables designer_*) et la mémoire (tests,
   et la même règle de concurrence, pour qu'on la vérifie). */
import type { Project } from '../model/types';
import type { ChangeSet } from '../engine/historique';
import { appliquerTout } from '../engine/operations';

export interface ResumeProjet { id: string; nom: string; crmChantierId?: string; revision: number; majLe: string }

export type Envoi = { ok: true; revision: number } | { ok: false; conflit: true; revisionServeur?: number; message: string } | { ok: false; conflit: false; message: string };

export interface Depot {
  /** créer un projet (instantané de départ, révision 0) */
  creer(projet: Project, par: string): Promise<void>;
  lister(crmChantierId?: string): Promise<ResumeProjet[]>;
  /** le projet à sa dernière révision */
  charger(id: string): Promise<Project>;
  /** un ChangeSet ; instantané facultatif (jalon, ou toutes les N révisions) */
  envoyer(projetId: string, cs: ChangeSet, instantane?: { projet: Project; jalon?: string }): Promise<Envoi>;
}

/** tous les N changements, un instantané : charger reste rapide */
export const INSTANTANE_TOUS = 50;

/** rejouer un journal sur un instantané */
export function reconstruire(instantane: Project, journal: readonly ChangeSet[]): Project {
  const tries = [...journal].filter(cs => cs.revisionAvant >= instantane.revision).sort((a, b) => a.revisionAvant - b.revisionAvant);
  let p = instantane;
  for (const cs of tries) {
    if (cs.revisionAvant !== p.revision) throw new Error('journal incomplet : révision ' + p.revision + ' attendue, ' + cs.revisionAvant + ' trouvée');
    p = appliquerTout(p, cs.operations);
  }
  return p;
}

/* ---------- en mémoire : pour les tests, avec la même règle que le serveur ---------- */
export class DepotMemoire implements Depot {
  private readonly projets = new Map<string, { nom: string; crmChantierId?: string; revision: number; majLe: string; instantanes: Project[]; journal: ChangeSet[] }>();
  /** pour simuler une panne réseau dans les tests */
  enPanne = false;

  async creer(projet: Project, _par?: string): Promise<void> {
    if (this.enPanne) throw new Error('réseau indisponible');
    if (this.projets.has(projet.id)) throw new Error('projet déjà enregistré');
    this.projets.set(projet.id, { nom: projet.name, ...(projet.crmChantierId ? { crmChantierId: projet.crmChantierId } : {}), revision: projet.revision, majLe: new Date().toISOString(), instantanes: [structuredClone(projet)], journal: [] });
  }

  async lister(crmChantierId?: string): Promise<ResumeProjet[]> {
    return [...this.projets.entries()].filter(([, p]) => !crmChantierId || p.crmChantierId === crmChantierId)
      .map(([id, p]) => ({ id, nom: p.nom, revision: p.revision, majLe: p.majLe, ...(p.crmChantierId ? { crmChantierId: p.crmChantierId } : {}) }));
  }

  async charger(id: string): Promise<Project> {
    if (this.enPanne) throw new Error('réseau indisponible');
    const p = this.projets.get(id);
    if (!p) throw new Error('projet introuvable');
    const base = p.instantanes.reduce((m, x) => (x.revision > m.revision ? x : m));
    return reconstruire(structuredClone(base), structuredClone(p.journal));
  }

  async envoyer(projetId: string, cs: ChangeSet, instantane?: { projet: Project; jalon?: string }): Promise<Envoi> {
    if (this.enPanne) return { ok: false, conflit: false, message: 'réseau indisponible' };
    const p = this.projets.get(projetId);
    if (!p) return { ok: false, conflit: false, message: 'projet introuvable' };
    if (p.revision !== cs.revisionAvant)
      return { ok: false, conflit: true, revisionServeur: p.revision, message: 'conflit de révision : le projet est à la révision ' + p.revision + ', pas ' + cs.revisionAvant };
    p.journal.push(structuredClone(cs));
    p.revision = cs.revisionApres;
    p.majLe = new Date().toISOString();
    if (instantane) p.instantanes.push(structuredClone(instantane.projet));
    return { ok: true, revision: p.revision };
  }
}
