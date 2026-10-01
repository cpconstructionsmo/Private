/* Les fichiers des fonds de plan sur le serveur : l'espace de stockage
   privé « designer-fonds » (supabase/designer/schema.sql), lu et rempli par
   les utilisateurs connectés. Un fichier est rangé sous l'empreinte de son
   contenu : s'il y est déjà, c'est le même, on ne le renvoie pas. */
import type { FichierLocal } from './copie-idb';

/** ce qui reçoit et rend les fichiers des fonds (Supabase en production, mémoire dans les tests) */
export interface StockFonds {
  envoyer(cle: string, f: FichierLocal): Promise<void>;
  recevoir(cle: string): Promise<FichierLocal | null>;
}

/** le sous-ensemble du client supabase-js utilisé ici */
export interface ClientStockage {
  storage: { from(espace: string): {
    upload(chemin: string, donnees: Blob, options: { contentType: string; upsert: boolean; metadata?: Record<string, string> }): PromiseLike<{ error: { message: string; statusCode?: string | number | undefined } | null }>;
    download(chemin: string): PromiseLike<{ data: Blob | null; error: { message: string } | null }>;
  } };
}

export const ESPACE_FONDS = 'designer-fonds';
const chemin = (cle: string) => 'fonds/' + cle;

export class FondsSupabase implements StockFonds {
  constructor(private readonly sb: ClientStockage) {}

  async envoyer(cle: string, f: FichierLocal): Promise<void> {
    const r = await this.sb.storage.from(ESPACE_FONDS).upload(chemin(cle), f.donnees, { contentType: f.type || 'application/octet-stream', upsert: false, metadata: { nom: f.nom } });
    /* déjà rangé : même empreinte, donc même fichier */
    if (r.error && !/exist|duplicate|409/i.test(r.error.message + ' ' + (r.error.statusCode ?? ''))) throw new Error(r.error.message);
  }

  async recevoir(cle: string): Promise<FichierLocal | null> {
    const r = await this.sb.storage.from(ESPACE_FONDS).download(chemin(cle));
    if (r.error || !r.data) return null;
    return { nom: cle, type: r.data.type, donnees: r.data };
  }
}

/** en mémoire (tests) */
export class FondsMemoire implements StockFonds {
  readonly fichiers = new Map<string, FichierLocal>();
  enPanne = false;
  async envoyer(cle: string, f: FichierLocal): Promise<void> { if (this.enPanne) throw new Error('réseau indisponible'); if (!this.fichiers.has(cle)) this.fichiers.set(cle, f) }
  async recevoir(cle: string): Promise<FichierLocal | null> { if (this.enPanne) return null; return this.fichiers.get(cle) ?? null }
}
