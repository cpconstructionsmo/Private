/* La copie locale dans le navigateur (IndexedDB) : à chaque modification,
   l'état du projet et les ChangeSets pas encore enregistrés sur le serveur.
   Après une fermeture de page, une coupure réseau ou un plantage, on
   reprend où l'on en était (ADR-0003). Une base à part de celle du suivi
   de chantiers (« cp-designer »), pour ne jamais s'y mêler.

   La même base garde les fichiers des fonds calés (PDF, images), sous leur
   clé : ils restent sur l'appareil où ils ont été importés. */
import type { CopieLocale, EtatLocal } from './synchro';

const BASE = 'cp-designer', VERSION = 2, COPIES = 'copies', FICHIERS = 'fichiers';

const bases = new WeakMap<IDBFactory, Promise<IDBDatabase>>();
function ouvrir(fabrique: IDBFactory): Promise<IDBDatabase> {
  let b = bases.get(fabrique);
  if (!b) {
    b = new Promise((res, rej) => {
      const r = fabrique.open(BASE, VERSION);
      r.onupgradeneeded = () => {
        for (const t of [COPIES, FICHIERS]) if (!r.result.objectStoreNames.contains(t)) r.result.createObjectStore(t);
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    bases.set(fabrique, b);
  }
  return b;
}

async function faire<T>(fabrique: IDBFactory, table: string, mode: IDBTransactionMode, f: (t: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await ouvrir(fabrique);
  return new Promise((res, rej) => {
    const tx = db.transaction(table, mode);
    const r = f(tx.objectStore(table));
    tx.oncomplete = () => res(r.result as T);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

export class CopieIndexedDB implements CopieLocale {
  constructor(private readonly fabrique: IDBFactory = globalThis.indexedDB) {}
  async lire(id: string): Promise<EtatLocal | null> { return (await faire<EtatLocal | undefined>(this.fabrique, COPIES, 'readonly', t => t.get(id))) ?? null }
  async ecrire(id: string, e: EtatLocal): Promise<void> { await faire(this.fabrique, COPIES, 'readwrite', t => t.put(e, id)) }
  async effacer(id: string): Promise<void> { await faire(this.fabrique, COPIES, 'readwrite', t => t.delete(id)) }
}

export interface FichierLocal { nom: string; type: string; donnees: Blob }

export class FichiersIndexedDB {
  constructor(private readonly fabrique: IDBFactory = globalThis.indexedDB) {}
  async lire(cle: string): Promise<FichierLocal | null> { return (await faire<FichierLocal | undefined>(this.fabrique, FICHIERS, 'readonly', t => t.get(cle))) ?? null }
  async ecrire(cle: string, f: FichierLocal): Promise<void> { await faire(this.fabrique, FICHIERS, 'readwrite', t => t.put(f, cle)) }
}
