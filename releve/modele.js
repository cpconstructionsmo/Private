/* Le modèle d'une visite, sans navigateur ni réseau : ce module se teste
   seul (tests/t_releve_modele.js).

   Une visite se saisit sur l'iPhone, souvent sans réseau, et se reprend sur
   le PC. Pour qu'aucune saisie ne se perde quand les deux appareils ont
   travaillé chacun de leur côté, chaque champ garde l'heure de sa dernière
   modification (`maj[cle]`) : à la fusion, le plus récent l'emporte, champ
   par champ. Les pièces et les photos sont des listes rangées par
   identifiant, chacune avec son heure ; une suppression est notée
   (`supprime`) au lieu d'effacer, sinon l'autre appareil la ferait revenir. */

export const SCHEMA = 1;

export const ETAPES = [
  { id: 'garde', titre: 'Photo de garde' },
  { id: 'client', titre: 'Client' },
  { id: 'projet', titre: 'Projet' },
  { id: 'pieces', titre: 'Pièces et photos' },
  { id: 'scan', titre: 'Scan' },
  { id: 'budget', titre: 'Budget' },
  { id: 'fin', titre: 'Fin de visite' },
];

export const CIVILITES = ['M.', 'Mme', 'M. et Mme'];

/* « Rénovation complète » a été retirée de la liste (retour du terrain) au
   profit des catégories de rénovation ; une ancienne visite qui la porte
   l'affiche encore (voir app.js, puces) */
export const TYPES_TRAVAUX = [
  'Cuisine', 'Salle de bains', 'Extension', 'Isolation', 'Chauffage', 'Peinture', 'Façade',
  'Toiture', 'Menuiseries', 'Électricité', 'Plomberie', 'Sols', 'Extérieur', 'Autre',
];

/* l'ampleur du projet : cumulable (une rénovation importante peut aussi être énergétique) */
export const CATEGORIES_RENO = ['Rénovation partielle', 'Rénovation importante', 'Rénovation énergétique'];

/* l'usage du bien des travaux (il compte, entre autres, pour la TVA et les aides) */
export const USAGES_BIEN = ['Résidence principale', 'Locatif', 'Résidence secondaire', 'Autre'];

export const FORMES_SOCIETE = ['SCI', 'SAS', 'SARL', 'EURL', 'Autre'];

export const DELAIS = ['Dès que possible', 'Sous 3 mois', 'Sous 6 mois', 'Dans l’année', 'Pas pressé'];

export const PIECES_COURANTES = [
  'Cuisine', 'Séjour', 'Salle de bains', 'Chambre', 'WC', 'Entrée', 'Cellier', 'Garage', 'Combles', 'Extérieur',
];

/* les champs simples de la visite, avec leur type : ce qui n'est pas dans
   cette liste n'est pas accepté par `modifier` (une faute de frappe dans
   l'interface se voit au test, au lieu de créer un champ fantôme) */
export const CHAMPS = {
  'client.civilite': 'texte', 'client.nom': 'texte', 'client.prenom': 'texte',
  'client.telephone': 'texte', 'client.email': 'texte', 'client.adresse': 'texte',
  'client.codePostal': 'texte', 'client.ville': 'texte',
  /* le client : un à trois acheteurs (particuliers), ou une société. Les
     champs client.* restent ceux de l'acheteur 1 (les anciennes visites se
     lisent telles quelles) ; client.adresse est l'adresse des TRAVAUX, le
     domicile de chacun se saisit à part s'il est différent. */
  'client.type': 'texte', // 'particulier' (défaut) | 'societe'
  'client.nbAcheteurs': 'nombre', // 1 (défaut) à 3
  'client.domicileIdem': 'booleen', // le domicile de l'acheteur 1 est l'adresse des travaux (défaut : oui)
  'client.domicile': 'texte',
  'acheteur2.civilite': 'texte', 'acheteur2.nom': 'texte', 'acheteur2.prenom': 'texte',
  'acheteur2.telephone': 'texte', 'acheteur2.email': 'texte', 'acheteur2.domicileIdem': 'booleen', 'acheteur2.domicile': 'texte',
  'acheteur3.civilite': 'texte', 'acheteur3.nom': 'texte', 'acheteur3.prenom': 'texte',
  'acheteur3.telephone': 'texte', 'acheteur3.email': 'texte', 'acheteur3.domicileIdem': 'booleen', 'acheteur3.domicile': 'texte',
  'societe.raisonSociale': 'texte', 'societe.forme': 'texte', 'societe.siret': 'texte', 'societe.siege': 'texte',
  'bien.usage': 'texte', 'bien.usageAutre': 'texte',
  'projet.types': 'liste', 'projet.explicatif': 'texte', 'projet.delai': 'texte',
  'projet.categories': 'liste', 'projet.typeAutre': 'texte',
  // « en quelques mots » devient deux champs (situation actuelle, souhaits) ; explicatif reste lisible
  'projet.situation': 'texte', 'projet.souhaits': 'texte',
  'projet.enveloppe': 'nombre',
  'photoGarde': 'texte', // identifiant de la photo de garde
  'scan.fichier': 'objet', // { nom, taille, chemin } du fichier importé
  'plan': 'objet', // { releve, resume } : le relevé ouvert dans le moteur (releve/moteur/)
  'plan.ecarte': 'objet', // l'autre version du plan, gardée de côté après une modification sur deux appareils
  'notes': 'texte',
  'budget': 'objet', // { lignes, ajust, estimation } : la fourchette de prix (releve/budget.js)
  'prospectId': 'texte', // le dossier du suivi pour lequel la visite a été lancée (lien « Nouvelle visite » d'une fiche prospect)
  'statut': 'texte', // 'en_cours' | 'terminee'
  'etape': 'texte',
};

const ENVELOPPE_MAX = 2000000;

export function nouvelId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  // repli (vieux navigateurs) : même forme qu'un UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}

export function nouvelleVisite(quand = new Date().toISOString(), id = nouvelId()) {
  return {
    id, schema: SCHEMA, creeLe: quand,
    valeurs: { statut: 'en_cours', etape: 'garde' },
    maj: { statut: quand, etape: quand },
    pieces: {}, photos: {},
  };
}

function normaliser(cle, v) {
  const type = CHAMPS[cle];
  if (!type) throw new Error('Champ inconnu : ' + cle);
  if (v === undefined || v === null || v === '') return null;
  if (type === 'texte') return String(v);
  if (type === 'nombre') {
    const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
    if (!isFinite(n) || n < 0) return null;
    return Math.min(Math.round(n), ENVELOPPE_MAX);
  }
  if (type === 'liste') return Array.isArray(v) ? [...new Set(v.map(String))] : null;
  if (type === 'booleen') return v === true || v === 'true' ? true : v === false || v === 'false' ? false : null;
  return v;
}

/* Une modification : renvoie une nouvelle visite (jamais l'ancienne
   modifiée), avec l'heure du champ. Une valeur identique ne change rien,
   pas même l'heure : sinon un simple passage dans un champ écraserait la
   saisie de l'autre appareil à la fusion. */
export function modifier(visite, cle, valeur, quand = new Date().toISOString()) {
  const v = normaliser(cle, valeur);
  if (JSON.stringify(visite.valeurs[cle] ?? null) === JSON.stringify(v)) return visite;
  return { ...visite, valeurs: { ...visite.valeurs, [cle]: v }, maj: { ...visite.maj, [cle]: quand } };
}

export function valeur(visite, cle) { return visite.valeurs[cle] ?? null; }

/* pièces et photos : ajout, modification et suppression notée */
export function ajouterPiece(visite, nom, quand = new Date().toISOString(), id = nouvelId()) {
  const piece = { id, nom: String(nom || 'Pièce'), maj: quand };
  return { ...visite, pieces: { ...visite.pieces, [id]: piece } };
}

export function majElement(visite, liste, id, champs, quand = new Date().toISOString()) {
  const el = visite[liste][id];
  if (!el) return visite;
  return { ...visite, [liste]: { ...visite[liste], [id]: { ...el, ...champs, maj: quand } } };
}

export function ajouterPhoto(visite, { id = nouvelId(), pieceId = null, role = 'piece', legende = '' } = {}, quand = new Date().toISOString()) {
  const photo = { id, pieceId, role, legende, chemin: null, maj: quand };
  return { ...visite, photos: { ...visite.photos, [id]: photo } };
}

export function supprimer(visite, liste, id, quand = new Date().toISOString()) {
  return majElement(visite, liste, id, { supprime: true }, quand);
}

export const actifs = obj => Object.values(obj || {}).filter(x => !x.supprime);

/* La fusion de deux versions de la même visite (celle de cet appareil et
   celle du serveur). Elle est symétrique, et fusionner(a, a) = a. */
export function fusionner(a, b) {
  if (!a) return b; if (!b) return a;
  if (a.id !== b.id) throw new Error('Fusion de deux visites différentes');
  const valeurs = {}, maj = {};
  for (const cle of new Set([...Object.keys(a.valeurs), ...Object.keys(b.valeurs)])) {
    const ta = a.maj[cle] || '', tb = b.maj[cle] || '';
    // à égalité d'heure, l'ordre des valeurs décide : la fusion reste symétrique
    const prendB = tb > ta || (tb === ta && empreinte(b.valeurs[cle] ?? null) > empreinte(a.valeurs[cle] ?? null));
    const src = prendB ? b : a;
    valeurs[cle] = src.valeurs[cle] ?? null; maj[cle] = src.maj[cle] || ta || tb;
  }
  /* Le plan est un seul bloc (le relevé entier) : s'il a été modifié des deux
     côtés, la version la plus récente est gardée et l'autre est mise de côté
     (« plan.ecarte »), pour que le métreur puisse la rouvrir : aucune
     modification de plan ne disparaît en silence. */
  const pa = a.valeurs.plan ?? null, pb = b.valeurs.plan ?? null;
  if (pa && pb && empreinte(pa) !== empreinte(pb)) {
    const perdant = valeurs.plan === pa ? b : a, ecarteActuel = valeurs['plan.ecarte'] ?? null;
    if (!ecarteActuel || (perdant.maj.plan || '') >= (maj['plan.ecarte'] || '')) {
      valeurs['plan.ecarte'] = perdant.valeurs.plan; maj['plan.ecarte'] = perdant.maj.plan || '';
    }
  }
  const liste = nom => {
    const out = {};
    for (const id of new Set([...Object.keys(a[nom] || {}), ...Object.keys(b[nom] || {})])) {
      const x = (a[nom] || {})[id], y = (b[nom] || {})[id];
      if (!x || !y) { out[id] = x || y; continue; }
      // une suppression l'emporte toujours : la photo supprimée sur un appareil ne revient pas
      if (x.supprime !== y.supprime) { out[id] = x.supprime ? { ...y, ...x } : { ...x, ...y }; continue; }
      const prendY = y.maj > x.maj || (y.maj === x.maj && empreinte(y) > empreinte(x));
      // le chemin du fichier envoyé ne se perd pas si l'autre version a été retouchée avant l'envoi
      const gagnant = prendY ? y : x, autre = prendY ? x : y;
      out[id] = { ...gagnant, chemin: gagnant.chemin || autre.chemin || null };
    }
    return out;
  };
  return {
    id: a.id, schema: Math.max(a.schema || 1, b.schema || 1),
    creeLe: a.creeLe < b.creeLe ? a.creeLe : b.creeLe,
    valeurs, maj, pieces: liste('pieces'), photos: liste('photos'),
  };
}

/* une écriture canonique (clés triées) : deux visites égales ont la même
   empreinte, quel que soit l'ordre où leurs champs ont été saisis */
export function empreinte(x) {
  const tri = v => Array.isArray(v) ? v.map(tri)
    : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => (o[k] = tri(v[k]), o), {}) : v;
  return JSON.stringify(tri(x));
}

/* l'heure de la dernière modification, tous champs confondus */
export function derniereMaj(v) {
  let t = v.creeLe || '';
  for (const x of Object.values(v.maj)) if (x > t) t = x;
  for (const l of ['pieces', 'photos']) for (const x of Object.values(v[l] || {})) if (x.maj > t) t = x.maj;
  return t;
}

/* le nom affiché d'une visite (liste, récapitulatif) */
export const estSociete = v => valeur(v, 'client.type') === 'societe';
export const nbAcheteurs = v => estSociete(v) ? 1 : Math.min(3, Math.max(1, valeur(v, 'client.nbAcheteurs') || 1));
/* le domicile d'un acheteur (1 à 3) : l'adresse des travaux, celle de
   l'acheteur 1, ou la sienne */
export function domicile(v, n) {
  const travaux = [valeur(v, 'client.adresse'), [valeur(v, 'client.codePostal'), valeur(v, 'client.ville')].filter(Boolean).join(' ')].filter(Boolean).join(' ');
  if (n === 1) return valeur(v, 'client.domicileIdem') === false ? (valeur(v, 'client.domicile') || '') : travaux;
  return valeur(v, 'acheteur' + n + '.domicileIdem') === false ? (valeur(v, 'acheteur' + n + '.domicile') || '') : domicile(v, 1);
}
export function intitule(v) {
  if (estSociete(v)) {
    const rs = valeur(v, 'societe.raisonSociale');
    if (rs) return [valeur(v, 'societe.forme') !== 'Autre' ? valeur(v, 'societe.forme') : '', rs].filter(Boolean).join(' ');
  }
  const c = k => valeur(v, 'client.' + k);
  const nom = [c('civilite'), c('prenom'), c('nom')].filter(Boolean).join(' ');
  return nom || 'Visite sans nom';
}

/* ce qui manque pour une fiche client utilisable : rien n'est bloquant,
   le récapitulatif le signale */
export function manques(v) {
  const m = [];
  if (!valeur(v, 'photoGarde')) m.push('photo de garde');
  if (estSociete(v) ? !valeur(v, 'societe.raisonSociale') : !valeur(v, 'client.nom')) m.push(estSociete(v) ? 'raison sociale' : 'nom du client');
  if (!valeur(v, 'client.telephone') && !valeur(v, 'client.email')) m.push('téléphone ou e-mail');
  if (!valeur(v, 'client.adresse')) m.push('adresse');
  if (!(valeur(v, 'projet.types') || []).length) m.push('type de travaux');
  return m;
}

export function emailValide(s) { return !s || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s).trim()); }
export function telephoneValide(s) {
  if (!s) return true;
  const n = String(s).replace(/[\s.\-()]/g, '');
  return /^(\+33|0033|0)[1-9]\d{8}$/.test(n) || /^\+\d{8,15}$/.test(n);
}

export function formatEuros(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' €';
}
