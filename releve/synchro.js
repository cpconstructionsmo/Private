/* La synchronisation des visites avec Supabase.

   Tout s'écrit d'abord sur l'appareil (stockage.js, IndexedDB) : une visite
   modifiée y est marquée « en attente ». Ce module envoie ensuite, quand le
   réseau le permet :
   1. les photos pas encore envoyées, dans l'espace privé « releves »
      (`<visite>/<photo>.jpg`) — jamais dans le JSON de la visite ;
   2. les visites en attente, dans la table `releve_visites`.

   Concurrence : la ligne du serveur porte un numéro de version. On lit la
   version du serveur, on fusionne champ par champ (modele.js : le plus
   récent l'emporte), puis on n'écrit que si la version n'a pas bougé
   entre-temps ; sinon on recommence avec la nouvelle. Deux appareils qui
   envoient en même temps ne s'écrasent donc jamais : le second refait la
   fusion avec ce qu'a écrit le premier.

   Le client Supabase et le stockage sont passés en paramètre : les tests
   (tests/t_releve_synchro.js) les remplacent par des versions en mémoire. */
import { fusionner, majElement, modifier } from './modele.js';

export const TABLE = 'releve_visites';
export const ESPACE = 'releves';
const ESSAIS = 4;

export const cheminPhoto = (visiteId, photoId) => visiteId + '/' + photoId + '.jpg';
/* le fichier du scan garde son extension (json, dxf, pdf…) ; un export
   d'iPhone sans extension est rangé en .json, le format d'OpenPlan 3D */
export function cheminScan(visiteId, id, nom) {
  const m = String(nom || '').toLowerCase().match(/\.([a-z0-9]{1,5})$/);
  return visiteId + '/scan-' + id + '.' + (m ? m[1] : 'json');
}

/* ce que veut dire une erreur, en mots de chantier */
export function lireErreur(e) {
  const code = (e && (e.code || e.status || e.statusCode)) || '';
  const msg = String((e && (e.message || e.error)) || e || '');
  if (code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(msg))
    return { type: 'installation', message: 'Le serveur n’est pas encore prêt (tables du relevé à installer). Tout reste enregistré sur l’appareil.' };
  if (code === 401 || code === 403 || code === '42501' || /JWT|not authorized|row-level security|permission/i.test(msg))
    return { type: 'connexion', message: 'Connexion expirée : reconnectez-vous. Tout reste enregistré sur l’appareil.' };
  if (/Failed to fetch|NetworkError|Load failed|network|fetch/i.test(msg) || code === 'hors_ligne')
    return { type: 'reseau', message: 'Pas de réseau : tout est enregistré sur l’appareil, l’envoi se fera au retour du réseau.' };
  return { type: 'autre', message: 'Envoi impossible pour l’instant (' + (msg || code || 'erreur inconnue').slice(0, 120) + '). Tout reste enregistré sur l’appareil.' };
}

export function creerSynchro({ supa, stock, enLigne = () => true, surEtat = () => {}, maintenant = () => new Date().toISOString() }) {
  let enCours = null, relancer = false;

  async function envoyerPhotos() {
    for (const p of await stock.photosAEnvoyer()) {
      const chemin = p.chemin || cheminPhoto(p.visiteId, p.id);
      const { error } = await supa.storage.from(ESPACE).upload(chemin, p.blob, { contentType: p.type || 'image/jpeg', upsert: true });
      if (error) throw error;
      await stock.marquerPhotoEnvoyee(p.id);
      // le chemin entre dans la visite comme une modification : il partira avec elle
      await stock.modifier(p.visiteId, v => {
        if (v.photos[p.id]) return v.photos[p.id].chemin === chemin ? v : majElement(v, 'photos', p.id, { chemin }, maintenant());
        const scan = v.valeurs['scan.fichier'];
        if (scan && scan.id === p.id && scan.chemin !== chemin) return modifier(v, 'scan.fichier', { ...scan, chemin }, maintenant());
        return v;
      }).catch(() => {}); // visite effacée de l'appareil : le fichier est quand même parti
    }
  }

  async function envoyerVisite(id) {
    for (let essai = 0; essai < ESSAIS; essai++) {
      const rec = await stock.lire(id);
      if (!rec || !rec.enAttente) return;
      const { data, error } = await supa.from(TABLE).select('donnees,version').eq('id', id).maybeSingle();
      if (error) throw error;
      const fus = fusionner(rec.visite, data ? data.donnees : null);
      let ecrit;
      if (!data) {
        const r = await supa.from(TABLE).insert({ id, donnees: fus, version: 1, maj_le: maintenant() }).select('id');
        if (r.error && r.error.code === '23505') continue; // créée entre-temps par l'autre appareil : on refusionne
        if (r.error) throw r.error;
        ecrit = true;
      } else {
        const r = await supa.from(TABLE).update({ donnees: fus, version: data.version + 1, maj_le: maintenant() })
          .eq('id', id).eq('version', data.version).select('id');
        if (r.error) throw r.error;
        ecrit = (r.data || []).length > 0;
      }
      if (ecrit) { await stock.confirmer(id, fus, rec.rev); return; }
    }
    throw { code: 'conflit', message: 'la visite change sans cesse sur un autre appareil ; nouvel essai plus tard' };
  }

  /* reprend les visites du serveur (créées ou retouchées sur un autre appareil) */
  async function tirer() {
    const { data, error } = await supa.from(TABLE).select('id,donnees,version,maj_le').order('maj_le', { ascending: false }).limit(200);
    if (error) throw error;
    for (const ligne of data || []) await stock.recevoir(ligne.donnees);
  }

  async function passe() {
    if (!enLigne()) { surEtat({ etat: 'horsligne', enAttente: await stock.nombreEnAttente(), message: lireErreur({ code: 'hors_ligne' }).message }); return; }
    surEtat({ etat: 'synchro', enAttente: await stock.nombreEnAttente() });
    try {
      await envoyerPhotos();
      for (const id of await stock.idsEnAttente()) await envoyerVisite(id);
      await tirer();
      const n = await stock.nombreEnAttente();
      surEtat({ etat: n ? 'attente' : 'ok', enAttente: n });
    } catch (e) {
      const err = lireErreur(e);
      surEtat({ etat: err.type === 'reseau' ? 'horsligne' : 'erreur', type: err.type, enAttente: await stock.nombreEnAttente(), message: err.message });
    }
  }

  /* une seule passe à la fois ; une demande pendant une passe en relance une
     après, pour que la dernière saisie parte aussi */
  async function synchroniser() {
    if (enCours) { relancer = true; return enCours; }
    enCours = (async () => {
      do { relancer = false; await passe(); } while (relancer);
    })();
    try { await enCours; } finally { enCours = null; }
  }

  return { synchroniser, envoyerVisite, envoyerPhotos, tirer };
}
