/* L'historique : exécuter des commandes, annuler, rétablir.

   Chaque exécution (une commande, ou une transaction de plusieurs) donne UN
   ChangeSet : ses opérations, plus le passage de révision du projet. Annuler
   applique les opérations inverses ; le projet redevient identique, octet
   pour octet, à ce qu'il était (vérifié par les tests). Une action composée
   — une pièce de quatre murs, plus tard une proposition de l'IA — s'annule
   donc en une seule fois.

   Une commande refusée n'entre pas dans l'historique, et une transaction
   dont une commande est refusée ne change rien du tout. */
import type { Project } from '../model/types';
import type { GenerateurId } from '../model/ids';
import { appliquerTout, inverser, type Operation } from './operations';
import { traduire, type Commande } from './commandes';

export interface ChangeSet {
  id: string;
  titre: string;
  demandePar: 'user' | 'ai';
  par: string;
  creeLe: string;
  revisionAvant: number;
  revisionApres: number;
  operations: Operation[];
}

export interface Historique {
  projet: Project;
  passe: ChangeSet[];
  futur: ChangeSet[];
}

export interface Acteur { par: string; maintenant: () => string; id: GenerateurId; demandePar?: 'user' | 'ai' }

export const LIMITE_HISTORIQUE = 200;

export const nouvelHistorique = (projet: Project): Historique => ({ projet, passe: [], futur: [] });

export type Execution = { ok: true; historique: Historique; changeSet: ChangeSet } | { ok: false; erreurs: string[] };

/** exécuter une ou plusieurs commandes comme une seule action */
export function executer(h: Historique, titre: string, commandes: readonly Commande[], a: Acteur): Execution {
  const revision = h.projet.revision + 1;
  let p = h.projet;
  const ops: Operation[] = [];
  const erreurs: string[] = [];
  for (const cmd of commandes) {
    const r = traduire(p, cmd, { par: a.par, maintenant: a.maintenant, id: a.id, revision });
    if (!r.ok) { erreurs.push(...r.erreurs); break }
    p = appliquerTout(p, r.operations);      // la commande suivante voit l'effet des précédentes
    ops.push(...r.operations);
  }
  if (erreurs.length) return { ok: false, erreurs };
  if (!ops.length) return { ok: false, erreurs: ['rien à faire'] };
  ops.push({ type: 'projet.modifier', avant: { revision: h.projet.revision }, apres: { revision } });
  const projet = appliquerTout(h.projet, ops);
  const changeSet: ChangeSet = {
    id: a.id(), titre, demandePar: a.demandePar ?? 'user', par: a.par, creeLe: a.maintenant(),
    revisionAvant: h.projet.revision, revisionApres: revision, operations: ops,
  };
  return { ok: true, changeSet, historique: { projet, passe: [...h.passe, changeSet].slice(-LIMITE_HISTORIQUE), futur: [] } };
}

export function annuler(h: Historique): Historique {
  const cs = h.passe[h.passe.length - 1];
  if (!cs) return h;
  return { projet: appliquerTout(h.projet, inverser(cs.operations)), passe: h.passe.slice(0, -1), futur: [cs, ...h.futur] };
}

export function retablir(h: Historique): Historique {
  const cs = h.futur[0];
  if (!cs) return h;
  return { projet: appliquerTout(h.projet, cs.operations), passe: [...h.passe, cs], futur: h.futur.slice(1) };
}

export const peutAnnuler = (h: Historique): boolean => h.passe.length > 0;
export const peutRetablir = (h: Historique): boolean => h.futur.length > 0;

/* ---------- annuler / rétablir dans un projet enregistré ----------

   Sur le serveur, la révision ne recule jamais : annuler y est une
   modification comme une autre (« Annuler : … »). Ces deux fonctions font
   le même retour en arrière que annuler / retablir, mais la révision du
   projet AVANCE, et elles rendent le ChangeSet à envoyer. Le plan obtenu
   est identique à celui d'avant, objets compris ; seul le numéro de
   révision du projet diffère. */

const estRevision = (op: Operation): boolean =>
  op.type === 'projet.modifier' && Object.keys(op.apres).length === 1 && 'revision' in op.apres;

function emettre(h: Historique, titre: string, ops: Operation[], a: Acteur, passe: ChangeSet[], futur: ChangeSet[]): Execution {
  const revision = h.projet.revision + 1;
  const tout = [...ops, { type: 'projet.modifier' as const, avant: { revision: h.projet.revision }, apres: { revision } }];
  const changeSet: ChangeSet = {
    id: a.id(), titre, demandePar: a.demandePar ?? 'user', par: a.par, creeLe: a.maintenant(),
    revisionAvant: h.projet.revision, revisionApres: revision, operations: tout,
  };
  return { ok: true, changeSet, historique: { projet: appliquerTout(h.projet, tout), passe, futur } };
}

export function annulerEnregistre(h: Historique, a: Acteur): Execution {
  const cs = h.passe[h.passe.length - 1];
  if (!cs) return { ok: false, erreurs: ['rien à annuler'] };
  return emettre(h, 'Annuler : ' + cs.titre, inverser(cs.operations.filter(op => !estRevision(op))), a, h.passe.slice(0, -1), [cs, ...h.futur]);
}

export function retablirEnregistre(h: Historique, a: Acteur): Execution {
  const cs = h.futur[0];
  if (!cs) return { ok: false, erreurs: ['rien à rétablir'] };
  return emettre(h, 'Rétablir : ' + cs.titre, cs.operations.filter(op => !estRevision(op)), a, [...h.passe, cs], h.futur.slice(1));
}
