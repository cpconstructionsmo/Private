/* La copie locale dans le navigateur (IndexedDB) : à chaque modification,
   l'état du projet et les ChangeSets pas encore enregistrés sur le serveur.
   Après une fermeture de page, une coupure réseau ou un plantage, on
   reprend où l'on en était (ADR-0003). Une base à part de celle du suivi
   de chantiers (« cp-designer »), pour ne jamais s'y mêler. */
import type { CopieLocale, EtatLocal } from './synchro';

const BASE = 'cp-designer', TABLE = 'copies';

export class CopieIndexedDB implements CopieLocale {
  private base: Promise<IDBDatabase> | null = null;
  constructor(private readonly fabrique: IDBFactory = globalThis.indexedDB) {}

  private ouvrir(): Promise<IDBDatabase> {
    if (!this.base) this.base = new Promise((res, rej) => {
      const r = this.fabrique.open(BASE, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(TABLE) };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this.base;
  }

  private async faire<T>(mode: IDBTransactionMode, f: (t: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.ouvrir();
    return new Promise((res, rej) => {
      const tx = db.transaction(TABLE, mode);
      const r = f(tx.objectStore(TABLE));
      tx.oncomplete = () => res(r.result as T);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  }

  async lire(id: string): Promise<EtatLocal | null> { return (await this.faire<EtatLocal | undefined>('readonly', t => t.get(id))) ?? null }
  async ecrire(id: string, e: EtatLocal): Promise<void> { await this.faire('readwrite', t => t.put(e, id)) }
  async effacer(id: string): Promise<void> { await this.faire('readwrite', t => t.delete(id)) }
}
