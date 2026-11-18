/* Un faux Supabase en mémoire pour la page « Relevé de visite » : la table
   releve_visites (avec sa version) et l'espace de fichiers « releves ».
   Utilisé tel quel dans Node (t_releve_synchro.js) et injecté par son texte
   dans Chromium (releve_navigateur.js) : il ne dépend de rien.

   etat.appData : les données du suivi (app_data), lues par « Nouvelle visite »
   depuis une fiche prospect ; toute écriture y est refusée et notée.
   etat.panne : 'reseau' | 'tables' | null — simule une coupure ou des
   tables pas encore installées. etat.avantEcriture(table, ligne) : appelé
   juste avant une écriture, pour glisser l'écriture d'un « autre appareil ». */
function fauxSupabase(etat) {
  etat.lignes = etat.lignes || {};
  etat.fichiers = etat.fichiers || {};
  etat.ecritures = etat.ecritures || 0;
  const copie = x => JSON.parse(JSON.stringify(x));
  const panne = () => etat.panne === 'reseau' ? { message: 'Failed to fetch' }
    : etat.panne === 'tables' ? { code: '42P01', message: 'relation "public.releve_visites" does not exist' } : null;
  function from(table) {
    const st = { op: 'select', filtres: [], valeurs: null };
    const q = {
      select() { return q; }, order() { return q; }, limit() { return q; },
      eq(c, v) { st.filtres.push([c, v]); return q; },
      maybeSingle() { st.unique = true; return q; },
      single() { st.unique = true; return q; },
      insert(v) { st.op = 'insert'; st.valeurs = v; return q; },
      update(v) { st.op = 'update'; st.valeurs = v; return q; },
      then(ok, ko) { return Promise.resolve().then(executer).then(ok, ko); },
    };
    function executer() {
      const e = panne(); if (e) return { data: null, error: e };
      /* les données du suivi (lecture seule ici) : etat.appData, ou absentes */
      if (table === 'app_data') {
        if (st.op !== 'select') { etat.ecritureAppData = true; return { data: null, error: { message: 'écriture interdite depuis le relevé' } }; }
        return etat.appData ? { data: { data: copie(etat.appData) }, error: null } : { data: null, error: { code: 'PGRST116', message: 'aucune ligne' } };
      }
      if (table === 'releve_reglages' && etat.sansReglages) return { data: null, error: { code: '42P01', message: 'relation "public.releve_reglages" does not exist' } };
      const magasins = { releve_visites: etat.lignes, releve_reglages: (etat.reglages = etat.reglages || {}) };
      const magasin = magasins[table];
      if (!magasin) return { data: null, error: { code: '42P01', message: 'table inconnue' } };
      const garde = l => st.filtres.every(([c, v]) => l[c] === v);
      if (st.op === 'select') {
        const L = Object.values(magasin).filter(garde).map(copie)
          .sort((a, b) => (b.maj_le || '').localeCompare(a.maj_le || ''));
        return { data: st.unique ? (L[0] || null) : L, error: null };
      }
      if (etat.avantEcriture) { const f = etat.avantEcriture; etat.avantEcriture = null; f(); }
      if (st.op === 'insert') {
        if (magasin[st.valeurs.id]) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        magasin[st.valeurs.id] = copie(st.valeurs); etat.ecritures++;
        return { data: [{ id: st.valeurs.id }], error: null };
      }
      const touchees = Object.values(magasin).filter(garde);
      touchees.forEach(l => Object.assign(l, copie(st.valeurs)));
      if (touchees.length) etat.ecritures++;
      return { data: touchees.map(l => ({ id: l.id })), error: null };
    }
    return q;
  }
  return {
    from,
    storage: { from: espace => ({
      upload: async (chemin, blob) => {
        const e = panne(); if (e && e.message === 'Failed to fetch') return { data: null, error: e };
        etat.fichiers[espace + '/' + chemin] = blob && blob.size !== undefined ? blob.size : true;
        return { data: { path: chemin }, error: null };
      },
      createSignedUrl: async chemin => ({ data: { signedUrl: 'https://stockage.local/' + espace + '/' + chemin }, error: null }),
    }) },
    auth: {
      getSession: async () => ({ data: { session: etat.session === undefined ? { user: { id: 'u1', email: 'metreur@exemple.fr' } } : etat.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async ({ email, password }) => {
        if (password !== 'bon') return { error: { message: 'Invalid login credentials' } };
        etat.session = { user: { id: 'u1', email } }; return { data: etat.session, error: null };
      },
      signOut: async () => { etat.session = null; return {}; },
    },
  };
}
module.exports = { fauxSupabase };
