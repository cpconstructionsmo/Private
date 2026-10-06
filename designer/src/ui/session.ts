/* Ouvrir un projet et l'enregistrer.

   - Connecté au suivi de chantiers (même session Supabase) et tables
     designer_* installées : le projet du chantier (?chantier=…) est chargé
     ou créé sur le serveur ; chaque modification part par la Synchro
     (copie locale d'abord, envoi dans l'ordre, conflits arrêtés).
   - Sinon (pas connecté, hors ligne, tables pas encore créées) : mode
     LOCAL, dit clairement à l'écran — le projet n'est gardé que sur cet
     appareil (IndexedDB), rien n'est perdu, rien n'est envoyé.

   Le dossier : ?chantier=… ou, au stade de l'avant-projet, ?prospect=….
   Un prospect signé devient un chantier qui a son propre identifiant : le
   suivi passe alors les deux (?chantier=…&prospect=…). Tant que le chantier
   n'a pas de projet, c'est celui dessiné pour le prospect qui s'ouvre — on
   ne repart pas d'une page blanche, et rien n'est dupliqué. */
import { creerProjet, type Project } from '../model';
import type { ChangeSet } from '../engine/historique';
import { CopieIndexedDB, Synchro, type CopieLocale, type Depot, type EtatSynchro, type ResumeProjet, type StockFonds } from '../persistence';

export interface Enregistreur {
  mode: 'serveur' | 'local';
  /** ce qu'on dit à l'utilisateur sur l'enregistrement */
  raison: string;
  par: string;
  ajouter(cs: ChangeSet, projet: Project): Promise<void>;
  marquerJalon?(nom: string): Promise<void>;
  projets?: ResumeProjet[];
  /** les fichiers des fonds, partagés sur le serveur (absent en mode local) */
  fonds?: StockFonds;
}

export interface Ouverture { projet: Project; enregistreur: Enregistreur }

export interface Dependances {
  utilisateur: () => Promise<string | null>;
  depot: () => Depot;
  fonds?: () => StockFonds;
  copie?: CopieLocale;
  signaler: (etat: EtatSynchro, message: string) => void;
}

const cleLocale = (chantier: string | null) => 'local:' + (chantier ?? 'brouillon');

export async function ouvrirSession(params: URLSearchParams, d: Dependances): Promise<Ouverture> {
  const voulu = params.get('projet'), prospect = params.get('prospect') || null;
  /* le dossier du projet : le chantier, sinon le prospect */
  const chantier = params.get('chantier') || prospect;
  const copie = d.copie ?? new CopieIndexedDB();
  let par: string | null = null;
  try { par = await d.utilisateur() } catch { par = null }

  if (par) {
    const depot = d.depot();
    try {
      let L = await depot.lister(chantier ?? undefined);
      /* un chantier sans projet, issu d'un prospect qui en a un : on reprend celui du prospect */
      if (!L.length && prospect && chantier !== prospect) L = await depot.lister(prospect);
      let projet: Project;
      const id = voulu ?? L[0]?.id;
      if (id) projet = await depot.charger(id);
      else {
        projet = creerProjet({ nom: chantier ? (chantier === prospect ? 'Avant-projet du prospect' : 'Projet du chantier') : 'Nouveau projet', ...(chantier ? { crmChantierId: chantier } : {}) });
        await depot.creer(projet, par);
      }
      const synchro = new Synchro(depot, copie, projet.id, d.signaler);
      const reste = await synchro.reprendre();
      /* des modifications restées sur l'appareil (page fermée, réseau coupé) : on repart d'elles */
      if (reste && reste.enAttente.length && reste.enAttente[0]!.revisionAvant === projet.revision) { projet = reste.projet; void synchro.envoyer() }
      return {
        projet, enregistreur: {
          mode: 'serveur', raison: 'Enregistré sur le serveur de CP Constructions', par, projets: L, ...(d.fonds ? { fonds: d.fonds() } : {}),
          ajouter: async (cs, p) => { await synchro.ajouter(cs, p); await synchro.envoyer() },
          marquerJalon: n => synchro.marquerJalon(n),
        },
      };
    } catch (e) {
      const m = String((e as Error)?.message ?? e);
      const tables = /designer_|relation|does not exist|schema cache/i.test(m);
      /* une installation antérieure du schéma (identifiants en uuid) refuse les ULID */
      const ancien = /type uuid/i.test(m);
      return local(chantier, prospect, copie, par, ancien
        ? 'Tables du Designer à mettre à jour sur le serveur (relancer supabase/designer/schema.sql) : projet gardé sur cet appareil seulement.'
        : tables
        ? 'Tables du Designer pas encore installées sur le serveur (supabase/designer/schema.sql) : projet gardé sur cet appareil seulement.'
        : 'Serveur injoignable (' + m + ') : projet gardé sur cet appareil seulement.');
    }
  }
  return local(chantier, prospect, copie, 'Moi', 'Non connecté : connectez-vous dans le suivi de chantiers pour enregistrer sur le serveur. Projet gardé sur cet appareil seulement.');
}

async function local(chantier: string | null, prospect: string | null, copie: CopieLocale, par: string, raison: string): Promise<Ouverture> {
  let cle = cleLocale(chantier);
  let projet: Project;
  try {
    let e = await copie.lire(cle);
    /* sur cet appareil aussi : le chantier sans copie reprend celle du prospect (et continue de l'écrire là) */
    if (!e && prospect && chantier !== prospect) { const k = cleLocale(prospect), x = await copie.lire(k); if (x) { e = x; cle = k } }
    projet = e?.projet ?? creerProjet({ nom: 'Brouillon', ...(chantier ? { crmChantierId: chantier } : {}) });
  } catch { projet = creerProjet({ nom: 'Brouillon', ...(chantier ? { crmChantierId: chantier } : {}) }) }
  return { projet, enregistreur: { mode: 'local', raison, par, ajouter: async (_cs, p) => { try { await copie.ecrire(cle, { projet: p, enAttente: [] }) } catch { /* navigation privée : rien à faire */ } } } };
}
