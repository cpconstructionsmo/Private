/* Le stockage sur l'appareil : chaque visite et chaque photo est écrite ici
   AVANT tout envoi. Rien ne dépend du réseau pour être gardé.

   La logique (en attente, numéro de révision, fusion à la réception) est
   écrite une fois, au-dessus d'un petit « magasin » clé → valeur : IndexedDB
   dans le navigateur, un objet en mémoire dans les tests. */
import { fusionner, empreinte } from './modele.js';

export function creerStockage(magasin) {
  // les écritures passent l'une après l'autre : deux saisies rapprochées ne
  // relisent jamais la même version pour s'écraser ensuite
  let file = Promise.resolve();
  const enSerie = f => { const p = file.then(f, f); file = p.catch(() => {}); return p; };

  const lire = id => magasin.lire('visites', id);

  return {
    lire,
    liste: () => magasin.tout('visites'),

    creer: visite => enSerie(() => magasin.ecrire('visites', { id: visite.id, visite, enAttente: true, rev: 1 })),

    /* applique une modification (fonction pure de modele.js) et marque la
       visite en attente d'envoi ; renvoie la visite modifiée */
    modifier: (id, f) => enSerie(async () => {
      const rec = await lire(id);
      if (!rec) throw new Error('Visite introuvable sur l’appareil : ' + id);
      const v = f(rec.visite);
      if (v === rec.visite) return v;
      await magasin.ecrire('visites', { id, visite: v, enAttente: true, rev: rec.rev + 1 });
      return v;
    }),

    /* le serveur a accepté `fusion`, préparée à partir de la révision `rev` :
       si rien n'a changé ici entre-temps, la visite n'est plus en attente ;
       sinon la saisie faite pendant l'envoi est gardée et repartira */
    confirmer: (id, fusion, rev) => enSerie(async () => {
      const rec = await lire(id);
      if (!rec || rec.rev === rev) return magasin.ecrire('visites', { id, visite: fusion, enAttente: false, rev });
      return magasin.ecrire('visites', { id, visite: fusionner(rec.visite, fusion), enAttente: true, rev: rec.rev + 1 });
    }),

    /* une visite lue sur le serveur */
    recevoir: distant => enSerie(async () => {
      if (!distant || !distant.id) return;
      const rec = await lire(distant.id);
      if (!rec) return magasin.ecrire('visites', { id: distant.id, visite: distant, enAttente: false, rev: 0 });
      const fus = fusionner(rec.visite, distant);
      if (empreinte(fus) === empreinte(rec.visite)) return;
      // ce qui reste plus récent ici que sur le serveur devra repartir
      const enAttente = rec.enAttente || empreinte(fus) !== empreinte(distant);
      return magasin.ecrire('visites', { id: distant.id, visite: fus, enAttente, rev: rec.rev + 1 });
    }),

    idsEnAttente: async () => (await magasin.tout('visites')).filter(r => r.enAttente).map(r => r.id),
    nombreEnAttente: async () => {
      const v = (await magasin.tout('visites')).filter(r => r.enAttente).length;
      const p = (await magasin.tout('photos')).filter(r => !r.envoyee && !r.refusee).length;
      return v + p;
    },

    /* photos : le fichier (déjà réduit) reste sur l'appareil, même envoyé,
       pour s'afficher sans réseau */
    garderPhoto: (id, visiteId, blob) => enSerie(() => magasin.ecrire('photos', { id, visiteId, blob, envoyee: false })),
    /* un autre fichier (le scan) : même file d'envoi, avec son chemin et son type */
    garderFichier: (id, visiteId, blob, { chemin, type }) =>
      enSerie(() => magasin.ecrire('photos', { id, visiteId, blob, envoyee: false, chemin, type })),
    lirePhoto: async id => { const r = await magasin.lire('photos', id); return r ? r.blob : null; },
    // un fichier refusé par le serveur (trop gros) reste sur l'appareil et n'est plus retenté à chaque passe
    photosAEnvoyer: async () => (await magasin.tout('photos')).filter(r => !r.envoyee && !r.refusee),
    photosRefusees: async () => (await magasin.tout('photos')).filter(r => !r.envoyee && r.refusee),
    marquerPhotoRefusee: (id, motif) => enSerie(async () => {
      const r = await magasin.lire('photos', id); if (r) await magasin.ecrire('photos', { ...r, refusee: motif });
    }),
    // à la demande de l'utilisateur (limite du serveur relevée, fichier réduit…) : on réessaie les fichiers refusés
    reessayerRefusees: () => enSerie(async () => {
      for (const r of await magasin.tout('photos')) if (r.refusee) { const { refusee, ...reste } = r; await magasin.ecrire('photos', reste); }
    }),
    // le fichier refusé est retiré de la visite par l'utilisateur : on garde la trace (plus de pastille) mais plus le contenu
    abandonnerPhotoRefusee: id => enSerie(async () => {
      const r = await magasin.lire('photos', id); if (r) await magasin.ecrire('photos', { id: r.id, visiteId: r.visiteId, envoyee: true, abandonnee: true });
    }),
    marquerPhotoEnvoyee: id => enSerie(async () => {
      const r = await magasin.lire('photos', id); if (r) await magasin.ecrire('photos', { ...r, envoyee: true });
    }),
  };
}

/* le magasin du navigateur */
export function magasinIndexedDB(nom = 'cp-releve') {
  const ouvrir = new Promise((ok, ko) => {
    if (typeof indexedDB === 'undefined') return ko(new Error('Stockage de l’appareil indisponible'));
    const r = indexedDB.open(nom, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('visites')) db.createObjectStore('visites', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
  const op = (store, mode, f) => ouvrir.then(db => new Promise((ok, ko) => {
    const t = db.transaction(store, mode), req = f(t.objectStore(store));
    t.oncomplete = () => ok(req && req.result);
    t.onerror = () => ko(t.error); t.onabort = () => ko(t.error || new Error('Écriture annulée (appareil plein ?)'));
  }));
  return {
    lire: (store, id) => op(store, 'readonly', s => s.get(id)),
    ecrire: (store, val) => op(store, 'readwrite', s => s.put(val)),
    tout: (store) => op(store, 'readonly', s => s.getAll()),
  };
}

/* le magasin des tests */
export function magasinMemoire() {
  const m = { visites: new Map(), photos: new Map() };
  const copie = x => x === undefined ? undefined : (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));
  return {
    lire: async (s, id) => copie(m[s].get(id)),
    ecrire: async (s, v) => { m[s].set(v.id, copie(v)); },
    tout: async s => [...m[s].values()].map(copie),
  };
}
