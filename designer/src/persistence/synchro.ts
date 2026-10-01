/* La synchronisation : chaque ChangeSet accepté par l'historique est mis en
   file, copié sur l'appareil, puis envoyé au dépôt, dans l'ordre.

   - Hors ligne (réseau, panne) : la file attend, rien n'est perdu ; la
     copie locale permet de reprendre même après la fermeture de la page.
   - Conflit (quelqu'un a enregistré avant nous) : on s'arrête net, on
     n'écrase rien, et on le dit ; l'utilisateur recharge et voit l'écart.
   - Un instantané accompagne le ChangeSet tous les INSTANTANE_TOUS
     changements, et à chaque jalon demandé. */
import type { Project } from '../model/types';
import type { ChangeSet } from '../engine/historique';
import { INSTANTANE_TOUS, type Depot } from './depot';

/** la copie locale (IndexedDB en production, mémoire dans les tests) */
export interface CopieLocale {
  lire(projetId: string): Promise<EtatLocal | null>;
  ecrire(projetId: string, etat: EtatLocal): Promise<void>;
  effacer(projetId: string): Promise<void>;
}

export interface EtatLocal {
  /** le projet tel qu'il est sur l'appareil (dernière révision locale) */
  projet: Project;
  /** les ChangeSets pas encore acceptés par le serveur, dans l'ordre */
  enAttente: ChangeSet[];
  /** jalon demandé pour le prochain envoi */
  jalon?: string;
}

export type EtatSynchro = 'a_jour' | 'en_attente' | 'hors_ligne' | 'conflit';

export class Synchro {
  private file: ChangeSet[] = [];
  private projet: Project | null = null;
  private jalon: string | undefined;
  private enCours: Promise<void> | null = null;
  etat: EtatSynchro = 'a_jour';
  message = '';

  constructor(private readonly depot: Depot, private readonly copie: CopieLocale, private readonly projetId: string,
    private readonly signaler: (etat: EtatSynchro, message: string) => void = () => {}) {}

  /** reprendre ce qui restait sur l'appareil (après une fermeture ou une panne) */
  async reprendre(): Promise<EtatLocal | null> {
    const e = await this.copie.lire(this.projetId);
    if (e) { this.file = [...e.enAttente]; this.projet = e.projet; this.jalon = e.jalon }
    return e;
  }

  /** un ChangeSet de plus (le projet est celui d'APRÈS ce ChangeSet) */
  async ajouter(cs: ChangeSet, projetApres: Project): Promise<void> {
    this.file.push(cs);
    this.projet = projetApres;
    await this.copie.ecrire(this.projetId, { projet: projetApres, enAttente: [...this.file], ...(this.jalon ? { jalon: this.jalon } : {}) });
    this.changer('en_attente', this.file.length + ' modification(s) à enregistrer');
  }

  /** demander un instantané nommé (APS V1, PC…) au prochain envoi */
  async marquerJalon(nom: string): Promise<void> {
    this.jalon = nom;
    if (this.projet) await this.copie.ecrire(this.projetId, { projet: this.projet, enAttente: [...this.file], jalon: nom });
  }

  /** envoyer la file ; un seul envoi à la fois */
  envoyer(): Promise<void> {
    if (!this.enCours) this.enCours = this.vider().finally(() => { this.enCours = null });
    return this.enCours;
  }

  private async vider(): Promise<void> {
    while (this.file.length && this.etat !== 'conflit') {
      const cs = this.file[0]!;
      const dernier = this.file.length === 1;
      const instantane = this.projet && dernier && (this.jalon || cs.revisionApres % INSTANTANE_TOUS === 0)
        ? { projet: this.projet, ...(this.jalon ? { jalon: this.jalon } : {}) } : undefined;
      let r;
      try { r = await this.depot.envoyer(this.projetId, cs, instantane) }
      catch (e) { r = { ok: false as const, conflit: false as const, message: String((e as Error)?.message ?? e) } }
      if (r.ok) {
        this.file.shift();
        if (instantane) this.jalon = undefined;
        if (this.file.length) await this.copie.ecrire(this.projetId, { projet: this.projet!, enAttente: [...this.file], ...(this.jalon ? { jalon: this.jalon } : {}) });
        else await this.copie.effacer(this.projetId);
        continue;
      }
      if (r.conflit) { this.changer('conflit', 'Quelqu’un a enregistré ce projet avant vous : rien n’a été écrasé. Rechargez pour voir ses modifications ; les vôtres restent sur cet appareil.'); return }
      this.changer('hors_ligne', 'Enregistrement impossible pour le moment (' + r.message + ') : vos modifications sont gardées sur cet appareil.');
      return;
    }
    if (!this.file.length) this.changer('a_jour', 'Enregistré');
  }

  get enAttente(): number { return this.file.length }

  private changer(etat: EtatSynchro, message: string): void { this.etat = etat; this.message = message; this.signaler(etat, message) }
}

/** copie locale en mémoire (tests) */
export class CopieMemoire implements CopieLocale {
  readonly donnees = new Map<string, EtatLocal>();
  async lire(id: string): Promise<EtatLocal | null> { const e = this.donnees.get(id); return e ? structuredClone(e) : null }
  async ecrire(id: string, e: EtatLocal): Promise<void> { this.donnees.set(id, structuredClone(e)) }
  async effacer(id: string): Promise<void> { this.donnees.delete(id) }
}
