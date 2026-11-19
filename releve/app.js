/* Relevé de visite — l'interface (iPhone d'abord, PC ensuite).

   Un écran = un geste ; gros boutons en bas, au pouce. Chaque saisie est
   écrite sur l'appareil tout de suite (stockage.js), puis envoyée quand le
   réseau le permet (synchro.js) : on peut fermer l'application, perdre le
   réseau ou changer d'appareil sans rien perdre.

   Le DOM est construit par `h()` avec textContent : rien de ce que tape
   l'utilisateur n'est jamais interprété comme du HTML. Les champs de saisie
   ne redessinent pas l'écran (le clavier resterait ouvert sur un champ
   remplacé) : ils enregistrent, et seul un changement d'écran redessine. */
import * as M from './modele.js';
import { creerStockage, magasinIndexedDB } from './stockage.js';
import { creerSynchro, ESPACE, cheminScan } from './synchro.js';
import { reduirePhoto } from './photo.js';
import * as B from './budget.js';
import { dossierClient, OPTIONS_DEFAUT } from './dossier.js';

// même projet Supabase et même clé publique que le suivi de chantiers (index.html)
const SUPABASE_URL = 'https://gxfrughmwkvdepvkhufv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JCBSnZhTaKlpSIZeXAeMkw_2OvI6YIr';

/* sans la bibliothèque (première ouverture hors ligne), on travaille quand
   même : tout reste sur l'appareil et l'état dit « hors ligne » */
const horsLigneErr = { message: 'Failed to fetch' };
const supaAbsent = {
  from: () => { const q = new Proxy({}, { get: (t, k) => k === 'then' ? (ok => ok({ data: null, error: horsLigneErr })) : () => q }); return q; },
  storage: { from: () => ({ upload: async () => ({ error: horsLigneErr }), createSignedUrl: async () => ({ error: horsLigneErr }) }) },
  auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({}), signInWithPassword: async () => ({ error: horsLigneErr }), signOut: async () => ({}) },
};
const supa = window.supabase && window.supabase.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : supaAbsent;
const stock = creerStockage(magasinIndexedDB());

const S = { ecran: 'accueil', visites: [], courante: null, etape: 0, etatSync: { etat: 'ok', enAttente: 0 }, session: null, horsConnexion: false, message: null };

const sync = creerSynchro({
  supa, stock,
  enLigne: () => navigator.onLine !== false && (!!S.session),
  surEtat: e => { S.etatSync = S.session ? e : { ...e, etat: 'horsligne', message: 'Non connecté : tout reste sur l’appareil. Connectez-vous pour envoyer.' }; majEtat(); },
});

/* ---------- petits outils ---------- */
function h(tag, props = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const e of enfants.flat(Infinity)) if (e != null && e !== false) el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  return el;
}
const vibrer = () => { try { navigator.vibrate && navigator.vibrate(12); } catch (e) { /* iPhone : pas de vibration web */ } };
const feter = el => { if (!el) return; el.classList.remove('valide'); void el.offsetWidth; el.classList.add('valide'); vibrer(); };
const dateCourte = iso => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

let attenteSync = null;
function planifierSync(delai = 1500) { clearTimeout(attenteSync); attenteSync = setTimeout(() => sync.synchroniser(), delai); }

async function recharger() { S.visites = await stock.liste(); }
const visite = () => (S.visites.find(r => r.id === S.courante) || {}).visite;

/* une modification de la visite ouverte : écrite sur l'appareil, puis envoyée */
async function changer(f) {
  const v = await stock.modifier(S.courante, f);
  const rec = S.visites.find(r => r.id === S.courante);
  if (rec) { rec.visite = v; rec.enAttente = true; }
  majEtat(); planifierSync();
  return v;
}
const poser = async (cle, val) => {
  const v = await changer(w => M.modifier(w, cle, val));
  // le nom du client s'affiche en tête dès qu'il est tapé (texte, jamais HTML)
  if (cle.startsWith('client.')) { const t = document.querySelector('header .titre'); if (t && S.ecran === 'visite') t.textContent = M.intitule(v); }
  return v;
};

/* ---------- photos : affichage depuis l'appareil, sinon lien temporaire ---------- */
const urls = new Map();
async function urlPhoto(id, chemin) {
  if (urls.has(id)) return urls.get(id);
  const blob = await stock.lirePhoto(id);
  let u = null;
  if (blob) u = URL.createObjectURL(blob);
  else if (chemin) { const { data } = await supa.storage.from(ESPACE).createSignedUrl(chemin, 3600); u = data && data.signedUrl; }
  if (u) urls.set(id, u);
  return u;
}
function imagePhoto(photo, cls) {
  const img = h('img', { class: cls, alt: photo.legende || 'Photo' });
  urlPhoto(photo.id, photo.chemin).then(u => { if (u) img.src = u; });
  return img;
}

/* le sélecteur de fichier : `capture` ouvre directement l'appareil photo de
   l'iPhone. Il doit être lancé dans le geste même (le toucher du bouton),
   sinon Safari refuse de l'ouvrir. */
function choisirFichier({ accept, capture, multiple }, surFichiers) {
  const inp = h('input', { type: 'file', style: 'position:fixed;left:-1000px;opacity:0' });
  if (accept) inp.accept = accept;
  if (capture) inp.setAttribute('capture', 'environment');
  if (multiple) inp.multiple = true;
  inp.addEventListener('change', () => { const f = [...inp.files]; inp.remove(); if (f.length) surFichiers(f); });
  document.body.append(inp);
  inp.click();
}

async function ajouterPhotos(fichiers, { role, pieceId }) {
  for (const f of fichiers) {
    let blob;
    try { blob = await reduirePhoto(f); } catch (e) { montrerMessage('err', 'Cette photo n’a pas pu être lue (' + (f.name || 'fichier') + ').'); continue; }
    const id = M.nouvelId();
    await stock.garderPhoto(id, S.courante, blob);
    await changer(v => {
      let w = M.ajouterPhoto(v, { id, role, pieceId });
      if (role === 'garde') w = M.modifier(w, 'photoGarde', id);
      return w;
    });
  }
  vibrer(); dessiner();
}

function montrerMessage(type, texte) { S.message = { type, texte }; dessiner(); }

/* ---------- l'état de la synchronisation, toujours visible ---------- */
function texteEtat() {
  const e = S.etatSync;
  if (e.etat === 'synchro') return '↻ Envoi…';
  if (e.etat === 'ok' && !e.enAttente) return '✓ Synchronisé';
  if (e.etat === 'horsligne') return '⏸ Sur l’appareil' + (e.enAttente ? ' · ' + e.enAttente : '');
  if (e.etat === 'erreur') return '⚠ En attente' + (e.enAttente ? ' · ' + e.enAttente : '');
  return '⏳ En attente' + (e.enAttente ? ' · ' + e.enAttente : '');
}
function pastilleEtat() {
  const e = S.etatSync;
  return h('span', { class: 'etat ' + e.etat, id: 'etatSync', role: 'status', 'aria-live': 'polite', title: e.message || '',
    onclick: () => { if (e.message) montrerMessage(e.etat === 'erreur' ? 'err' : 'att', e.message); sync.synchroniser(); } }, texteEtat());
}
function majEtat() {
  const el = document.getElementById('etatSync');
  if (el) { const n = pastilleEtat(); el.replaceWith(n); }
}

/* ---------- écrans ---------- */
function ecranConnexion() {
  let email, mdp, msg;
  const valider = async ev => {
    ev.preventDefault();
    msg.textContent = 'Connexion…';
    const { error } = await supa.auth.signInWithPassword({ email: email.value.trim(), password: mdp.value });
    if (error) { msg.textContent = /Failed to fetch/.test(error.message) ? 'Pas de réseau : réessayez, ou travaillez sur l’appareil.' : 'Adresse ou mot de passe incorrect.'; return; }
    const { data } = await supa.auth.getSession(); S.session = data.session; S.ecran = 'accueil';
    dessiner(); sync.synchroniser(); traiterLien();
  };
  return [
    h('header', { class: 'haut' }, h('img', { src: '../assets/logo_fiche.jpg', alt: 'CP Constructions' }), h('span', { class: 'titre' }, 'Relevé de visite')),
    h('main', {},
      h('h1', {}, 'Connexion'),
      h('p', { class: 'mut' }, 'Le même compte que le suivi de chantiers.'),
      h('form', { class: 'carte', onsubmit: valider },
        h('label', { class: 'champ' }, 'E-MAIL', email = h('input', { class: 'in', type: 'email', autocomplete: 'username', required: true })),
        h('label', { class: 'champ' }, 'MOT DE PASSE', mdp = h('input', { class: 'in', type: 'password', autocomplete: 'current-password', required: true })),
        h('div', { style: 'margin-top:16px' }, h('button', { class: 'gros', type: 'submit' }, 'Se connecter')),
        msg = h('p', { class: 'aide', role: 'alert' })),
      h('button', { class: 'gros sec', onclick: () => { S.horsConnexion = true; S.ecran = 'accueil'; dessiner(); traiterLien(); } }, 'Travailler sur l’appareil sans connexion'),
      h('p', { class: 'mut petit' }, 'Sans connexion, les visites restent sur cet appareil ; elles partiront dès que vous serez connecté.')),
  ];
}

async function nouvelleVisite() {
  const v = M.nouvelleVisite();
  await stock.creer(v);
  S.visites.unshift({ id: v.id, visite: v, enAttente: true, rev: 1 });
  S.courante = v.id; S.etape = 0; S.ecran = 'visite'; S.message = null;
  // dans le même geste : l'appareil photo s'ouvre pour la photo de garde
  choisirFichier({ accept: 'image/*', capture: true }, f => ajouterPhotos(f, { role: 'garde' }));
  dessiner(); planifierSync(300);
}

/* le texte cherché dans une visite : client, société, ville, travaux */
const sansAccents = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const texteVisite = v => sansAccents([M.intitule(v), M.valeur(v, 'client.nom'), M.valeur(v, 'acheteur2.nom'), M.valeur(v, 'client.ville'), M.valeur(v, 'client.adresse'),
  ...(M.valeur(v, 'projet.types') || [])].filter(Boolean).join(' '));
function ecranAccueil() {
  const toutes = [...S.visites].sort((a, b) => M.derniereMaj(b.visite).localeCompare(M.derniereMaj(a.visite)));
  const mots = sansAccents(S.recherche || '').split(/\s+/).filter(Boolean);
  const liste = mots.length ? toutes.filter(r => { const t = texteVisite(r.visite); return mots.every(m => t.includes(m)); }) : toutes;
  // la liste se refiltre à chaque lettre, sans redessiner le champ (le clavier reste ouvert)
  const filtrer = e => { S.recherche = e.target.value; const box = document.getElementById('listeVisites'); if (!box) return;
    const m = sansAccents(S.recherche).split(/\s+/).filter(Boolean);
    box.querySelectorAll('[data-visite]').forEach(c => { const r = S.visites.find(x => x.id === c.dataset.visite); c.hidden = !!(r && m.length && !m.every(w => texteVisite(r.visite).includes(w))); });
    const n = box.querySelectorAll('[data-visite]:not([hidden])').length, vide = document.getElementById('aucuneVisiteTrouvee'); if (vide) vide.hidden = n > 0; };
  return [
    h('header', { class: 'haut' }, h('img', { src: '../assets/logo_fiche.jpg', alt: 'CP Constructions' }), h('span', { class: 'titre' }, 'Relevés de visite'), pastilleEtat()),
    h('main', {},
      S.message && h('div', { class: 'message ' + S.message.type }, S.message.texte),
      !S.session && h('div', { class: 'message att' }, 'Non connecté : les visites restent sur cet appareil. ',
        h('button', { class: 'lienRetour', onclick: () => { S.ecran = 'connexion'; dessiner(); } }, 'Se connecter')),
      toutes.length > 4 ? h('input', { class: 'in', type: 'search', id: 'chercherVisite', placeholder: '🔎 Chercher : client, ville, travaux…', value: S.recherche || '', autocomplete: 'off', oninput: filtrer, style: 'margin:0 0 12px' }) : null,
      toutes.length ? h('div', { id: 'listeVisites' }, toutes.map(r => { const c = carteVisite(r); if (!liste.includes(r)) c.hidden = true; return c; }),
        h('div', { class: 'vide', id: 'aucuneVisiteTrouvee', hidden: liste.length > 0 }, 'Aucune visite ne correspond.'))
        : h('div', { class: 'vide' }, h('div', { style: 'font-size:46px' }, '🏠'), 'Aucune visite pour l’instant.', h('br'), 'Touchez « Nouvelle visite » chez le client.'),
      h('div', { style: 'text-align:center;margin-top:8px' }, h('button', { class: 'lienRetour', id: 'reglerOuvrages', onclick: () => { S.retour = 'accueil'; S.ecran = 'ouvrages'; S.brouillonO = null; S.message = null; dessiner(); } }, '⚙ Prix au m²'), ' · ',
        h('button', { class: 'lienRetour', id: 'reglerFourchettes', onclick: () => { S.retour = 'accueil'; S.ecran = 'fourchettes'; S.brouillonF = null; S.message = null; dessiner(); } }, '⚙ Postes détaillés'))),
    h('div', { class: 'barreBas' }, h('div', { class: 'in' }, h('button', { class: 'gros', id: 'nouvelleVisite', onclick: nouvelleVisite }, '📷 Nouvelle visite'))),
  ];
}

function carteVisite(r) {
  const v = r.visite, garde = v.photos[M.valeur(v, 'photoGarde')];
  const ville = M.valeur(v, 'client.ville'), types = M.valeur(v, 'projet.types') || [];
  return h('div', { class: 'carte visite', 'data-visite': r.id, onclick: () => { S.courante = r.id; S.etape = Math.max(0, M.ETAPES.findIndex(e => e.id === M.valeur(v, 'etape'))); S.ecran = 'visite'; S.message = null; dessiner(); } },
    garde && !garde.supprime ? imagePhoto(garde, 'vignette') : h('div', { class: 'vignette' }, '🏠'),
    h('div', { class: 'corps' },
      h('b', {}, M.intitule(v)),
      h('div', { class: 'mut petit' }, [ville, types.slice(0, 2).join(', ')].filter(Boolean).join(' · ') || 'Projet à préciser'),
      (M.valeur(v, 'budget') || {}).estimation && M.valeur(v, 'budget').estimation.max > 0 ? h('div', { class: 'petit', style: 'color:var(--navy);font-weight:600' }, '💶 ' + B.formatPlage(M.valeur(v, 'budget').estimation)) : null,
      h('div', { class: 'mut petit' }, dateCourte(v.creeLe),
        M.valeur(v, 'statut') === 'terminee' ? h('span', { class: 'pastille ok' }, 'Terminée') : null,
        r.enAttente ? h('span', { class: 'pastille' }, 'À envoyer') : null)));
}

function allerEtape(i) {
  S.etape = Math.max(0, Math.min(M.ETAPES.length - 1, i));
  S.message = null;
  poser('etape', M.ETAPES[S.etape].id);
  dessiner(); window.scrollTo(0, 0);
}

function ecranVisite() {
  const v = visite();
  if (!v) { S.ecran = 'accueil'; return ecranAccueil(); }
  const et = M.ETAPES[S.etape], dernier = S.etape === M.ETAPES.length - 1;
  const corps = { garde: etapeGarde, client: etapeClient, projet: etapeProjet, pieces: etapePieces, scan: etapeScan, budget: etapeBudget, fin: etapeFin }[et.id](v);
  return [
    h('header', { class: 'haut' },
      h('button', { class: 'lienRetour', onclick: () => { S.ecran = 'accueil'; S.message = null; dessiner(); } }, '‹ Visites'),
      h('span', { class: 'titre' }, M.intitule(v)), pastilleEtat()),
    h('main', {},
      // la barre de progression est aussi un sommaire : toucher une étape y va directement
      h('nav', { class: 'progres', 'aria-label': 'Étapes de la visite' }, M.ETAPES.map((e, i) => h('button', { type: 'button', class: i < S.etape ? 'fait' : i === S.etape ? 'ici' : '',
        title: e.titre, 'aria-label': 'Étape ' + (i + 1) + ' : ' + e.titre, 'aria-current': i === S.etape ? 'step' : null, onclick: () => { if (i !== S.etape) allerEtape(i); } }, h('i')))),
      h('div', { class: 'etapeNom' }, 'Étape ' + (S.etape + 1) + ' sur ' + M.ETAPES.length + ' · ' + et.titre),
      S.message && h('div', { class: 'message ' + S.message.type, style: 'margin-top:10px' }, S.message.texte),
      h('div', { class: 'anime' }, corps)),
    h('div', { class: 'barreBas' }, h('div', { class: 'in' },
      h('button', { class: 'gros sec', onclick: () => S.etape ? allerEtape(S.etape - 1) : (S.ecran = 'accueil', dessiner()) }, S.etape ? '‹ Retour' : '‹ Visites'),
      dernier
        ? h('button', { class: 'gros', id: 'terminer', onclick: terminer }, M.valeur(v, 'statut') === 'terminee' ? '✓ Visite terminée' : '✓ Terminer la visite')
        : h('button', { class: 'gros', id: 'suivant', onclick: e => { feter(e.currentTarget); allerEtape(S.etape + 1); } }, 'Suivant ›'))),
  ];
}

async function terminer(e) {
  await poser('statut', 'terminee');
  feter(e.currentTarget);
  S.message = { type: 'ok', texte: 'Visite terminée et enregistrée. Elle partira sur le serveur dès que le réseau le permet. « 📄 Dossier client » prépare le document à remettre au client.' };
  dessiner(); sync.synchroniser();
}

/* étape 1 : photo de garde */
function etapeGarde(v) {
  const garde = v.photos[M.valeur(v, 'photoGarde')];
  const prendre = () => choisirFichier({ accept: 'image/*', capture: true }, f => ajouterPhotos(f, { role: 'garde' }));
  const galerie = () => choisirFichier({ accept: 'image/*' }, f => ajouterPhotos(f.slice(0, 1), { role: 'garde' }));
  return [
    h('h1', {}, 'La maison'),
    garde && !garde.supprime
      ? [imagePhoto(garde, 'garde'), h('div', { class: 'rang', style: 'margin-top:10px' }, h('button', { class: 'gros sec', onclick: prendre }, '📷 Reprendre'), h('button', { class: 'gros sec', onclick: galerie }, '🖼 Galerie'))]
      : [h('p', { class: 'mut' }, 'Une photo de la façade : elle servira de page de garde au dossier du client.'),
        h('button', { class: 'gros', id: 'photoGarde', onclick: prendre }, '📷 Prendre la photo de garde'),
        h('div', { style: 'margin-top:10px' }, h('button', { class: 'gros sec', onclick: galerie }, '🖼 Choisir dans la galerie'))],
  ];
}

/* ---------- la dictée ----------
   Le bouton 🎤 d'un champ dicte en français avec la reconnaissance vocale du
   navigateur (Safari sur iPhone, Chrome sur PC) : le texte reconnu s'ajoute
   à la suite de ce qui est déjà écrit, et s'enregistre comme une frappe.
   Là où elle n'existe pas (ou est refusée), le bouton ouvre le clavier sur
   le champ : il reste le micro du clavier de l'iPhone. */
const Reconnaissance = window.SpeechRecognition || window.webkitSpeechRecognition;
let dicteeEnCours = null;
function arreterDictee() { if (dicteeEnCours) { try { dicteeEnCours.stop(); } catch (e) { /* déjà arrêtée */ } dicteeEnCours = null; } }

function boutonMicro(cible, aide) {
  const btn = h('button', { class: 'micro', type: 'button', 'aria-label': 'Dicter', title: 'Dicter' }, '🎤');
  const repli = texte => { cible.focus(); if (aide) aide.textContent = texte; };
  btn.addEventListener('click', ev => {
    ev.preventDefault();
    if (btn.classList.contains('ecoute')) { arreterDictee(); return; }
    if (!Reconnaissance) { repli('Touchez 🎤 sur le clavier pour dicter.'); return; }
    arreterDictee();
    const r = new Reconnaissance();
    r.lang = 'fr-FR'; r.continuous = true; r.interimResults = false;
    const ajouter = t => {
      t = t.trim(); if (!t) return;
      const avant = cible.value.replace(/\s+$/, '');
      t = avant && /[.!?]$/.test(avant) ? t.charAt(0).toUpperCase() + t.slice(1) : t;
      cible.value = avant ? avant + ' ' + t : t.charAt(0).toUpperCase() + t.slice(1);
      cible.dispatchEvent(new Event('input', { bubbles: true }));
    };
    r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) ajouter(e.results[i][0].transcript); };
    const fin = () => { btn.classList.remove('ecoute'); btn.textContent = '🎤'; if (dicteeEnCours === r) dicteeEnCours = null; };
    r.onend = fin;
    r.onerror = e => { fin(); if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') repli('Dictée refusée par l’appareil : touchez 🎤 sur le clavier.'); };
    try { r.start(); } catch (e) { repli('Touchez 🎤 sur le clavier pour dicter.'); return; }
    dicteeEnCours = r; btn.classList.add('ecoute'); btn.textContent = '⏹'; if (aide) aide.textContent = 'Je vous écoute… touchez ⏹ pour arrêter.';
    vibrer();
  });
  return btn;
}

/* un champ texte qui enregistre à chaque frappe (sans redessiner) */
function champ(v, cle, label, attrs = {}, verifier) {
  let aide;
  const inp = h(attrs.multiligne ? 'textarea' : 'input', {
    class: 'in', value: M.valeur(v, cle) ?? '', rows: attrs.multiligne ? (attrs.lignes || 4) : null, name: cle,
    type: attrs.type || (attrs.multiligne ? null : 'text'), inputMode: attrs.inputmode || null,
    autocomplete: attrs.autocomplete || 'off', autocapitalize: attrs.autocapitalize || null, placeholder: attrs.placeholder || '',
    oninput: e => poser(cle, e.target.value),
    onblur: e => { if (verifier) { const ok = verifier(e.target.value); e.target.classList.toggle('faux', !ok); aide.textContent = ok ? '' : attrs.messageFaux; } },
  });
  aide = h('div', { class: attrs.micro ? 'aide info' : 'aide' });
  // le micro est hors du <label> : le toucher n'ouvre pas le clavier par-dessus la dictée
  if (attrs.micro) return h('div', { class: 'champMicro' }, h('label', { class: 'champ' }, label, inp), boutonMicro(inp, aide), aide);
  return h('label', { class: 'champ' }, label, inp, aide);
}

/* une case à cocher enregistrée ; `defaut` quand rien n'est encore saisi */
function caseACocher(v, cle, label, { defaut = false, apres } = {}) {
  const val = M.valeur(v, cle);
  return h('label', { class: 'case' },
    h('input', { type: 'checkbox', name: cle, checked: val == null ? defaut : val, onchange: async e => { await poser(cle, e.target.checked); vibrer(); if (apres) apres(); } }),
    h('span', {}, label));
}

/* des puces ; `apres` est appelé après un choix (pour montrer un champ lié),
   et une valeur enregistrée qui n'est plus proposée reste affichée */
function puces(v, cle, options, { multiple = false, cls = 'puces', coche = false, apres } = {}) {
  const box = h('div', { class: cls, role: multiple ? 'group' : 'radiogroup' });
  const dessinerPuces = () => {
    const val = M.valeur(visite(), cle);
    const anciennes = (multiple ? (val || []) : (val != null ? [val] : [])).filter(x => !options.some(o => (Array.isArray(o) ? o[0] : o) === x));
    box.replaceChildren(...[...options, ...anciennes].map(o => {
      const [code, libelle] = Array.isArray(o) ? o : [o, o];
      const on = multiple ? (val || []).includes(code) : val === code;
      return h('button', { class: 'puce' + (on ? ' on' : ''), type: 'button', 'aria-pressed': String(on), onclick: async () => {
        const cur = M.valeur(visite(), cle);
        const nv = multiple ? (on ? (cur || []).filter(x => x !== code) : [...(cur || []), code]) : (on ? null : code);
        await poser(cle, nv); vibrer();
        if (apres) apres(); else dessinerPuces();
      } }, coche ? (on ? '☑ ' : '☐ ') + libelle : libelle);
    }));
  };
  dessinerPuces();
  return box;
}

/* redessiner l'étape en gardant la place à l'écran (choix qui montre ou cache des champs) */
const redessiner = () => { const y = window.scrollY; dessiner(); window.scrollTo(0, y); };

/* étape 2 : le client — un à trois acheteurs, ou une société */
function blocContact(v, prefixe, civilites) {
  return [
    h('div', { class: 'champ' }, 'CIVILITÉ'), puces(v, prefixe + '.civilite', civilites),
    h('div', { class: 'deuxCol' },
      champ(v, prefixe + '.nom', 'NOM', { autocomplete: prefixe === 'client' ? 'family-name' : 'off', autocapitalize: 'characters' }),
      champ(v, prefixe + '.prenom', 'PRÉNOM', { autocomplete: prefixe === 'client' ? 'given-name' : 'off', autocapitalize: 'words' }),
      champ(v, prefixe + '.telephone', 'TÉLÉPHONE', { type: 'tel', inputmode: 'tel', autocomplete: prefixe === 'client' ? 'tel' : 'off', messageFaux: 'Numéro à vérifier (10 chiffres, ou +33…).' }, M.telephoneValide),
      champ(v, prefixe + '.email', 'E-MAIL', { type: 'email', inputmode: 'email', autocomplete: prefixe === 'client' ? 'email' : 'off', autocapitalize: 'off', messageFaux: 'Adresse e-mail à vérifier.' }, M.emailValide)),
  ];
}

function etapeClient(v) {
  const societe = M.estSociete(v), nb = M.nbAcheteurs(v);
  const usage = M.valeur(v, 'bien.usage');
  const adresseTravaux = [
    champ(v, 'client.adresse', 'ADRESSE DES TRAVAUX', { autocomplete: 'street-address', autocapitalize: 'sentences' }),
    h('div', { class: 'deuxCol' },
      champ(v, 'client.codePostal', 'CODE POSTAL', { inputmode: 'numeric', autocomplete: 'postal-code' }),
      champ(v, 'client.ville', 'VILLE', { autocomplete: 'address-level2', autocapitalize: 'words' })),
  ];
  const domicile = (prefixe, libelle, defautLibelle) => [
    caseACocher(v, prefixe + '.domicileIdem', defautLibelle, { defaut: true, apres: redessiner }),
    M.valeur(v, prefixe + '.domicileIdem') === false
      ? champ(v, prefixe + '.domicile', libelle, { multiligne: true, lignes: 2, autocapitalize: 'sentences', placeholder: 'N°, rue, code postal, ville' }) : null,
  ];
  return [
    h('h1', {}, 'Le client'),
    h('div', { class: 'puces', role: 'radiogroup' }, [['particulier', '👤 Particulier'], ['societe', '🏢 Société']].map(([code, lib]) => {
      const on = (code === 'societe') === societe;
      return h('button', { class: 'puce' + (on ? ' on' : ''), type: 'button', name: 'client.type', 'aria-pressed': String(on), onclick: async () => { await poser('client.type', code); vibrer(); redessiner(); } }, lib);
    })),
    societe
      ? [h('div', { class: 'carte', style: 'margin-top:12px' },
          h('h2', {}, 'La société'),
          champ(v, 'societe.raisonSociale', 'RAISON SOCIALE', { autocapitalize: 'characters' }),
          h('div', { class: 'champ' }, 'FORME'), puces(v, 'societe.forme', M.FORMES_SOCIETE),
          h('div', { class: 'deuxCol' },
            champ(v, 'societe.siret', 'SIRET', { inputmode: 'numeric' }),
            champ(v, 'societe.siege', 'SIÈGE SOCIAL', { autocapitalize: 'sentences', placeholder: 'si différent de l’adresse des travaux' }))),
        h('div', { class: 'carte' }, h('h2', {}, 'Représentée par'), blocContact(v, 'client', M.CIVILITES)),
        h('div', { class: 'carte' }, h('h2', {}, 'Le bien'), adresseTravaux)]
      : [h('div', { class: 'champ' }, 'NOMBRE D’ACHETEURS'),
        h('div', { class: 'puces', role: 'radiogroup' }, [1, 2, 3].map(n => h('button', { class: 'puce' + (nb === n ? ' on' : ''), type: 'button', name: 'client.nbAcheteurs', 'aria-pressed': String(nb === n),
          onclick: async () => { await poser('client.nbAcheteurs', n); vibrer(); redessiner(); } }, String(n)))),
        h('div', { class: 'carte', style: 'margin-top:12px' },
          nb > 1 ? h('h2', {}, 'Acheteur 1') : null,
          blocContact(v, 'client', M.CIVILITES), adresseTravaux,
          domicile('client', 'ADRESSE PRINCIPALE (DOMICILE)', 'Habite à l’adresse des travaux')),
        [2, 3].filter(n => n <= nb).map(n => h('div', { class: 'carte', 'data-acheteur': n },
          h('h2', {}, 'Acheteur ' + n),
          blocContact(v, 'acheteur' + n, ['M.', 'Mme']),
          domicile('acheteur' + n, 'ADRESSE PRINCIPALE (si différente de l’acheteur 1)', 'Même adresse que l’acheteur 1')))],
    h('div', { class: 'champ' }, 'USAGE DU BIEN'),
    puces(v, 'bien.usage', M.USAGES_BIEN, { apres: redessiner }),
    usage === 'Autre' ? champ(v, 'bien.usageAutre', 'PRÉCISEZ L’USAGE', { autocapitalize: 'sentences' }) : null,
    h('p', { class: 'mut petit', style: 'margin-top:14px' }, '🎤 Pour dicter : touchez le micro du clavier de l’iPhone.'),
  ];
}

/* étape 3 : le projet */
function etapeProjet(v) {
  const env = M.valeur(v, 'projet.enveloppe');
  const types = M.valeur(v, 'projet.types') || [];
  let affichage, saisie, curseur;
  const majEnv = (n, source) => {
    poser('projet.enveloppe', n);
    const val = M.valeur(M.modifier(visite(), 'projet.enveloppe', n), 'projet.enveloppe');
    affichage.textContent = M.formatEuros(val);
    if (source !== 'saisie') saisie.value = val ?? '';
    if (source !== 'curseur') curseur.value = Math.min(val || 0, 300000);
  };
  return [
    h('h1', {}, 'Le projet'),
    h('div', { class: 'champ' }, 'AMPLEUR DE LA RÉNOVATION'),
    puces(v, 'projet.categories', M.CATEGORIES_RENO, { multiple: true, coche: true }),
    h('div', { class: 'champ' }, 'TYPE DE TRAVAUX'),
    puces(v, 'projet.types', M.TYPES_TRAVAUX, { multiple: true, cls: 'grille', apres: redessiner }),
    types.includes('Autre') ? champ(v, 'projet.typeAutre', 'AUTRES TRAVAUX : PRÉCISEZ', { autocapitalize: 'sentences', micro: true }) : null,
    champ(v, 'projet.situation', 'SITUATION ACTUELLE', { multiligne: true, autocapitalize: 'sentences', micro: true, placeholder: 'L’existant : état, chauffage, isolation, contraintes…' }),
    champ(v, 'projet.souhaits', 'SOUHAITS DU CLIENT', { multiligne: true, autocapitalize: 'sentences', micro: true, placeholder: 'Ce que le client veut obtenir, ses priorités…' }),
    // l'ancien champ unique « en quelques mots » n'est montré que s'il a été rempli
    M.valeur(v, 'projet.explicatif') ? champ(v, 'projet.explicatif', 'EN QUELQUES MOTS (ancienne saisie)', { multiligne: true, autocapitalize: 'sentences', micro: true }) : null,
    h('div', { class: 'champ' }, 'DÉLAI SOUHAITÉ'), puces(v, 'projet.delai', M.DELAIS),
    h('div', { class: 'champ' }, 'ENVELOPPE FINANCIÈRE (TTC)'),
    h('div', { class: 'carte', style: 'margin-top:6px' },
      affichage = h('div', { class: 'montant', id: 'montantEnveloppe' }, M.formatEuros(env)),
      curseur = h('input', { type: 'range', class: 'curseur', min: 0, max: 300000, step: 1000, value: Math.min(env || 0, 300000), 'aria-label': 'Enveloppe financière', oninput: e => majEnv(e.target.value, 'curseur') }),
      h('label', { class: 'champ', style: 'margin-top:4px' }, 'OU TAPER LE MONTANT',
        saisie = h('input', { class: 'in', inputMode: 'numeric', name: 'projet.enveloppe', value: env ?? '', placeholder: 'ex. 45 000', oninput: e => majEnv(e.target.value, 'saisie') }))),
  ];
}

/* étape 4 : pièces et photos */
function etapePieces(v) {
  const pieces = M.actifs(v.pieces).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.id.localeCompare(b.id));
  const nbPhotos = M.actifs(v.photos).filter(p => p.role === 'piece').length;
  const ajouter = async nom => {
    if (!nom) return;
    await changer(x => M.ajouterPiece(x, nom));
    vibrer(); dessiner();
  };
  return [
    h('h1', {}, 'Pièces et photos'),
    h('p', { class: 'mut' }, pieces.length ? pieces.length + ' pièce' + (pieces.length > 1 ? 's' : '') + ' · ' + nbPhotos + ' photo' + (nbPhotos > 1 ? 's' : '') : 'Ajoutez les pièces à transformer, puis leurs photos.'),
    pieces.map(p => cartePiece(v, p)),
    h('div', { class: 'champ' }, 'AJOUTER UNE PIÈCE'),
    h('div', { class: 'puces' }, M.PIECES_COURANTES.map(n => h('button', { class: 'puce', type: 'button', onclick: () => ajouter(n) }, '+ ' + n)),
      h('button', { class: 'puce', type: 'button', onclick: () => ajouter((prompt('Nom de la pièce') || '').trim()) }, '+ Autre…')),
  ];
}

/* un texte attaché à une pièce ou à une photo (note, légende), avec dictée ;
   il s'enregistre sur l'élément, sans redessiner */
function texteElement(liste, el, champTexte, attrs) {
  let aide;
  const inp = h('textarea', { class: 'in', rows: attrs.lignes || 2, value: el[champTexte] || '', placeholder: attrs.placeholder, 'aria-label': attrs.label, autocapitalize: 'sentences',
    oninput: e => changer(x => M.majElement(x, liste, el.id, { [champTexte]: e.target.value })) });
  aide = h('div', { class: 'aide info' });
  return h('div', { class: 'champMicro ' + (attrs.cls || '') }, attrs.titre ? h('label', { class: 'champ' }, attrs.titre, inp) : inp, boutonMicro(inp, aide), aide);
}

/* ---------- « Imaginer » : la pièce rénovée, d'après sa photo ----------
   La photo et la consigne (tapée ou dictée) partent à la fonction du serveur
   « imaginer » (supabase/functions/imaginer : Gemini, clé dans les secrets de
   Supabase, jamais ici). L'image revient et se range avec la visite comme
   une photo (role 'imagine', source = la photo d'origine) : sur l'appareil
   d'abord, puis dans l'espace privé. Il faut le réseau et être connecté. */
const enBase64 = blob => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => ko(r.error); r.readAsDataURL(blob); });
const versBlob = (b64, mime) => { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime || 'image/png' }); };
const MESSAGES_IMAGINER = {
  non_configure: 'Imaginer n’est pas encore installé sur le serveur (clé Google à ranger dans Supabase : voir supabase/functions/imaginer/README.md).',
  non_connecte: 'Reconnectez-vous pour utiliser Imaginer.',
  aucune_image: 'Google n’a pas rendu d’image pour cette consigne : reformulez-la (sans nom de marque ni personne), puis réessayez.',
  google_occupe: 'Google est surchargé pour le moment : réessayez dans une minute.',
  image_trop_lourde: 'Cette photo est trop lourde pour Imaginer.',
  consigne_absente: 'Décrivez d’abord ce que vous voulez voir.',
};
async function lancerImaginer(p, ph, consigne, btn, info) {
  consigne = consigne.trim();
  const dire = (t, type) => { info.textContent = t; info.className = 'message ' + (type || 'err'); };
  if (consigne.length < 3) return dire(MESSAGES_IMAGINER.consigne_absente, 'att');
  if (navigator.onLine === false) return dire('Imaginer a besoin du réseau. La consigne est gardée : réessayez quand le réseau revient.', 'att');
  if (!S.session) return dire('Connectez-vous (même compte que le suivi) pour utiliser Imaginer.', 'att');
  if (!supa.functions || !supa.functions.invoke) return dire(MESSAGES_IMAGINER.non_configure, 'att');
  const texte = btn.textContent; btn.disabled = true; btn.textContent = '✨ Création en cours… (jusqu’à une minute)';
  dire('L’image est en cours de création. Vous pouvez continuer la visite : elle arrivera ici.', 'att');
  try {
    let blob = await stock.lirePhoto(ph.id);
    if (!blob && ph.chemin) { const u = await urlPhoto(ph.id, ph.chemin); if (u) blob = await (await fetch(u)).blob(); }
    if (!blob) throw { code: 'photo' };
    const { data, error } = await supa.functions.invoke('imaginer', { body: { image: await enBase64(blob), mime: blob.type || 'image/jpeg', consigne, piece: p.nom } });
    if (error) {
      let j = {}; try { j = await error.context.json(); } catch (e) { /* pas de corps lisible */ }
      const st = error.context && error.context.status;
      throw { code: j.erreur || (st === 404 ? 'non_configure' : st ? 'erreur_' + st : 'reseau'), limite: j.limite, message: j.message, manque: j.manque };
    }
    if (!data || !data.image) throw { code: 'aucune_image' };
    const id = M.nouvelId();
    await stock.garderPhoto(id, S.courante, versBlob(data.image, data.mime));
    await changer(v => M.majElement(M.ajouterPhoto(v, { id, role: 'imagine', pieceId: p.id, legende: consigne }), 'photos', id,
      { source: ph.id, consigne, modele: data.modele || '', creeLe: new Date().toISOString() }));
    if (S.imaginer && S.imaginer.photoId === ph.id) S.imaginer = null;
    S.message = { type: 'ok', texte: '✨ Image créée pour « ' + p.nom + ' »' + (data.restant != null ? ' (encore ' + data.restant + ' aujourd’hui).' : '.') };
    vibrer(); dessiner();
  } catch (e) {
    const code = (e && e.code) || 'reseau';
    btn.disabled = false; btn.textContent = texte;
    dire(code === 'quota' ? 'Limite du jour atteinte (' + (e.limite || '') + ' images par personne) : réessayez demain.'
      : code === 'photo' ? 'La photo d’origine n’est pas lisible sur cet appareil (pas encore téléchargée ?).'
      : code === 'reseau' ? 'Pas de réponse du serveur : réseau coupé, fonction « imaginer » absente, ou « Verify JWT » encore actif (voir supabase/functions/imaginer/README.md).'
      : code === 'non_configure' && e.manque && e.manque.length ? 'Imaginer : réglage à ajouter dans les secrets Supabase : ' + e.manque.join(', ') + '.'
      : MESSAGES_IMAGINER[code] || 'La création a échoué (' + code + (e && e.message ? ' : ' + e.message : '') + ').');
  }
}

/* le panneau sous la photo : consigne (avec dictée), puis « Créer l'image » */
function panneauImaginer(p, ph) {
  const st = S.imaginer;
  let info;
  const ta = h('textarea', { class: 'in', rows: 3, value: st.consigne || '', 'aria-label': 'Consigne pour imaginer la pièce', autocapitalize: 'sentences',
    placeholder: 'Ex. : cuisine blanche, plan de travail bois, carrelage gris clair, suspensions noires',
    oninput: e => { st.consigne = e.target.value; } });
  const aide = h('div', { class: 'aide info' });
  const btn = h('button', { class: 'gros', type: 'button', onclick: () => lancerImaginer(p, ph, ta.value, btn, info) }, '✨ Créer l’image');
  return h('div', { class: 'carte panneauImaginer', 'data-imaginer': ph.id },
    h('b', {}, '✨ Imaginer cette pièce rénovée'),
    h('div', { class: 'champMicro' }, ta, boutonMicro(ta, aide), aide),
    M.valeur(visite(), 'projet.souhaits') && !st.consigne ? h('button', { class: 'puce', type: 'button', style: 'margin-top:8px', onclick: () => { ta.value = st.consigne = M.valeur(visite(), 'projet.souhaits'); } }, 'Reprendre les souhaits du client') : null,
    info = h('div', { role: 'status', style: 'margin-top:8px' }),
    h('div', { class: 'rang', style: 'margin-top:8px' }, h('button', { class: 'gros sec', type: 'button', onclick: () => { S.imaginer = null; dessiner(); } }, 'Fermer'), btn));
}

function cartePiece(v, p) {
  const toutes = M.actifs(v.photos).filter(x => x.pieceId === p.id);
  const photos = toutes.filter(x => x.role !== 'imagine');
  const imagines = src => toutes.filter(x => x.role === 'imagine' && x.source === src);
  const prendre = () => choisirFichier({ accept: 'image/*', capture: true }, f => ajouterPhotos(f, { role: 'piece', pieceId: p.id }));
  return h('div', { class: 'carte', 'data-piece': p.id },
    h('div', { class: 'rang' },
      h('input', { class: 'in', value: p.nom, 'aria-label': 'Nom de la pièce', style: 'margin:0;font-weight:600',
        oninput: e => changer(x => M.majElement(x, 'pieces', p.id, { nom: e.target.value })) }),
      h('button', { class: 'puce', type: 'button', 'aria-label': 'Supprimer la pièce', onclick: async () => {
        if (!confirm('Supprimer la pièce « ' + p.nom + ' » et ses photos ?')) return;
        await changer(x => toutes.reduce((w, ph) => M.supprimer(w, 'photos', ph.id), M.supprimer(x, 'pieces', p.id)));
        dessiner();
      } }, '🗑')),
    photos.map((ph, i) => [
      h('div', { class: 'photoLegende', 'data-photo': ph.id },
        h('figure', {}, imagePhoto(ph),
          h('button', { class: 'x', type: 'button', 'aria-label': 'Supprimer la photo', onclick: async () => {
            const lies = imagines(ph.id);
            if (!confirm(lies.length ? 'Supprimer cette photo et ses ' + lies.length + ' image(s) imaginée(s) ?' : 'Supprimer cette photo ?')) return;
            await changer(x => lies.reduce((w, im) => M.supprimer(w, 'photos', im.id), M.supprimer(x, 'photos', ph.id))); dessiner();
          } }, '×')),
        h('div', { style: 'flex:1;min-width:0' },
          texteElement('photos', ph, 'legende', { label: 'Légende de la photo ' + (i + 1), placeholder: 'Ce que montre la photo (fissure, tableau électrique…)', lignes: 3 }),
          S.imaginer && S.imaginer.photoId === ph.id ? null
            : h('button', { class: 'puce imaginer', type: 'button', 'aria-label': 'Imaginer la photo ' + (i + 1) + ' rénovée',
                onclick: () => { S.imaginer = { photoId: ph.id, consigne: '' }; dessiner(); } }, '✨ Imaginer'))),
      imagines(ph.id).map(im => h('div', { class: 'imagine', 'data-imagine': im.id },
        h('figure', {}, imagePhoto(im, 'imagineImg'), h('span', { class: 'badgeImagine' }, '✨ Imaginé'),
          h('button', { class: 'x', type: 'button', 'aria-label': 'Supprimer l’image imaginée', onclick: async () => {
            if (!confirm('Supprimer cette image imaginée ?')) return;
            await changer(x => M.supprimer(x, 'photos', im.id)); dessiner();
          } }, '×')),
        h('div', { class: 'mut petit' }, '« ' + (im.consigne || im.legende || '') + ' »'))),
      S.imaginer && S.imaginer.photoId === ph.id ? panneauImaginer(p, ph) : null]),
    h('div', { class: 'rang', style: 'margin-top:10px' },
      h('button', { class: 'gros sec', onclick: prendre }, photos.length ? '📷 Photo suivante' : '📷 Photo'),
      h('button', { class: 'gros sec', onclick: () => choisirFichier({ accept: 'image/*', multiple: true }, f => ajouterPhotos(f, { role: 'piece', pieceId: p.id })) }, '🖼 Galerie')),
    h('p', { class: 'mut petit', style: 'margin:6px 0 0' }, 'Galerie : vous pouvez choisir plusieurs photos d’un coup.'),
    texteElement('pieces', p, 'note', { titre: 'NOTES SUR LA PIÈCE', label: 'Notes sur la pièce ' + p.nom, placeholder: 'État, dimensions particulières, souhaits pour cette pièce…', lignes: 3 }));
}

/* étape 5 : le scan, puis le plan */
const resumePlan = r => r ? r.pieces + ' pièce' + (r.pieces > 1 ? 's' : '') + ' · ' + String(r.surface).replace('.', ',') + ' m²' +
  (r.ouvertures != null ? ' · ' + r.ouvertures + ' ouverture' + (r.ouvertures > 1 ? 's' : '') : '') : '';

function etapeScan(v) {
  const scan = M.valeur(v, 'scan.fichier'), plan = M.valeur(v, 'plan'), ecarte = M.valeur(v, 'plan.ecarte');
  const importer = () => {
    // un plan déjà retouché n'est jamais remplacé en silence : il est mis de côté
    if (plan && !confirm('Un plan existe déjà pour cette visite. Le remplacer par un nouveau scan ?\n(L’ancien plan reste gardé de côté.)')) return;
    choisirFichier({}, async ([f]) => {
      // sur iPhone, l'export d'OpenPlan 3D peut arriver sans extension : aucun
      // filtre de type, sinon il serait grisé dans le sélecteur
      const id = M.nouvelId(), chemin = cheminScan(S.courante, id, f.name);
      await stock.garderFichier(id, S.courante, f, { chemin, type: f.type || 'application/json' });
      await changer(w => {
        let x = M.modifier(w, 'scan.fichier', { id, nom: f.name || 'scan.json', taille: f.size, type: f.type || '', importeLe: new Date().toISOString() });
        const actuel = M.valeur(w, 'plan');
        if (actuel) x = M.modifier(M.modifier(x, 'plan.ecarte', actuel), 'plan', null);
        return x;
      });
      vibrer(); ouvrirPlan();
    });
  };
  return [
    h('h1', {}, 'Le scan et le plan'),
    h('p', { class: 'mut' }, 'Dans OpenPlan 3D : « Export Editable Plan (JSON) », puis importez le fichier ici. Le plan s’ouvre aussitôt : mesures, murs, ouvertures, avant/après, 3D, PDF.'),
    scan ? h('div', { class: 'carte' }, h('b', {}, '📄 ' + scan.nom), h('div', { class: 'mut petit' }, Math.round((scan.taille || 0) / 1024) + ' Ko · importé le ' + dateCourte(scan.importeLe))) : null,
    plan ? h('div', { class: 'carte', id: 'resumePlan' }, h('b', {}, '📐 Plan'), h('div', { class: 'mut petit' }, resumePlan(plan.resume))) : null,
    ecarte ? h('div', { class: 'message att' }, 'Une autre version du plan, modifiée sur un autre appareil, a été gardée de côté' + (ecarte.resume ? ' (' + resumePlan(ecarte.resume) + ')' : '') + '. ',
      h('div', { class: 'rang', style: 'margin-top:8px' },
        h('button', { class: 'puce', type: 'button', onclick: async () => {
          await changer(w => M.modifier(M.modifier(w, 'plan', M.valeur(w, 'plan.ecarte')), 'plan.ecarte', M.valeur(w, 'plan')));
          dessiner();
        } }, 'Ouvrir cette version'),
        h('button', { class: 'puce', type: 'button', onclick: async () => {
          if (!confirm('Oublier définitivement cette autre version du plan ?')) return;
          await poser('plan.ecarte', null); dessiner();
        } }, 'L’oublier'))) : null,
    // une pièce scannée à part : elle s'ajoute dans le plan, pas en remplaçant le scan
    plan ? h('p', { class: 'mut petit' }, 'Pièces scannées séparément ? Ouvrez le plan, puis « ＋ Scan » pour chaque autre scan et « 🔗 Relier » : touchez un mur, puis le mur de l’autre scan qui le touche.') : null,
    scan || plan ? h('button', { class: 'gros', id: 'ouvrirPlan', onclick: ouvrirPlan }, '📐 Ouvrir le plan') : null,
    h('div', { style: 'margin-top:10px' }, h('button', { class: scan || plan ? 'gros sec' : 'gros', id: 'importerScan', onclick: importer }, scan ? 'Remplacer le scan' : '📐 Importer le scan')),
  ];
}

/* ---------- le plan : le moteur de relevé (releve/moteur/) dans un cadre ----------
   Le moteur ne garde rien lui-même : il reçoit le relevé de la visite et lui
   renvoie chaque modification (avec ses seules photos nouvelles). Ses
   messages sont traités l'un après l'autre, et on ne quitte le plan qu'après
   avoir reçu sa dernière modification. */
let fileMoteur = Promise.resolve(), attenteVidage = null;

function ouvrirPlan() { S.ecran = 'plan'; S.message = null; dessiner(); }

function ecranPlan() {
  const v = visite();
  if (!v) { S.ecran = 'accueil'; return ecranAccueil(); }
  return [h('div', { class: 'ecranPlan' },
    h('header', { class: 'haut' },
      h('button', { class: 'lienRetour', id: 'fermerPlan', onclick: fermerPlan }, '‹ Visite'),
      h('span', { class: 'titre' }, 'Plan · ' + M.intitule(v)), pastilleEtat()),
    h('div', { class: 'message err', id: 'erreurPlan', hidden: true }),
    h('iframe', { class: 'cadrePlan', id: 'cadrePlan', src: 'moteur/index.html', title: 'Plan du relevé', allow: 'web-share; fullscreen' }))];
}

async function fermerPlan() {
  const cadre = document.getElementById('cadrePlan');
  if (cadre && cadre.contentWindow) {
    await new Promise(ok => { attenteVidage = ok; cadre.contentWindow.postMessage({ type: 'releve:vider' }, location.origin); setTimeout(ok, 1500); });
    attenteVidage = null;
  }
  S.ecran = 'visite'; dessiner();
}

const lireDataUrl = blob => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(r.error); r.readAsDataURL(blob); });
async function blobFichier(id, chemin) {
  const local = await stock.lirePhoto(id);
  if (local) return local;
  if (!chemin) return null;
  const { data } = await supa.storage.from(ESPACE).createSignedUrl(chemin, 600);
  if (!data || !data.signedUrl) return null;
  const rep = await fetch(data.signedUrl);
  return rep.ok ? rep.blob() : null;
}

function erreurPlan(texte) { const el = document.getElementById('erreurPlan'); if (el) { el.textContent = texte; el.hidden = false; } }

async function envoyerAuMoteur(cadre) {
  const v = visite(), plan = M.valeur(v, 'plan'), scan = M.valeur(v, 'scan.fichier');
  if (plan && plan.releve) {
    const images = {};
    for (const ph of M.actifs(v.photos).filter(p => p.role === 'plan')) {
      try { const b = await blobFichier(ph.id, ph.chemin); if (b) images[ph.id] = await lireDataUrl(b); } catch (e) { /* photo absente ici : le plan s'ouvre sans elle */ }
    }
    cadre.contentWindow.postMessage({ type: 'releve:charger', texte: JSON.stringify(plan.releve), nom: (plan.resume && plan.resume.projet) || 'Relevé', images, reprise: true }, location.origin);
  } else if (scan) {
    const b = await blobFichier(scan.id, scan.chemin).catch(() => null);
    if (!b) { erreurPlan('Le fichier du scan n’est pas sur cet appareil et n’a pas pu être téléchargé (réseau ?). Réessayez avec du réseau.'); return; }
    cadre.contentWindow.postMessage({ type: 'releve:charger', texte: await b.text(), nom: scan.nom, reprise: false }, location.origin);
  }
}

async function enregistrerPlan(m, cadre) {
  if (!m.releve || typeof m.releve !== 'object' || !Array.isArray(m.releve.pieces)) return;
  const recues = [];
  for (const [id, url] of Object.entries(m.images || {})) {
    if (typeof url !== 'string' || !/^data:image\/(jpeg|png);base64,/.test(url) || !/^[\w-]{1,64}$/.test(id)) continue;
    await stock.garderPhoto(id, S.courante, await (await fetch(url)).blob());
    recues.push(id);
  }
  await changer(w => {
    let x = w;
    for (const id of recues) if (!x.photos[id]) x = M.ajouterPhoto(x, { id, role: 'plan' });
    // une photo retirée dans le plan est retirée de la visite (suppression notée, voir modele.js)
    const refs = new Set([...m.releve.pieces.flatMap(p => (p.photos || []).map(ph => ph.id)), ...(m.releve.documents || []).map(d => d.id)]);
    for (const ph of M.actifs(x.photos)) if (ph.role === 'plan' && !refs.has(ph.id)) x = M.supprimer(x, 'photos', ph.id);
    return M.modifier(x, 'plan', { releve: m.releve, resume: m.resume || null });
  });
  cadre.contentWindow.postMessage({ type: 'releve:enregistre', images: recues }, location.origin);
}

window.addEventListener('message', e => {
  const cadre = document.getElementById('cadrePlan');
  if (!cadre || e.source !== cadre.contentWindow || e.origin !== location.origin) return;
  const m = e.data || {};
  fileMoteur = fileMoteur.then(async () => {
    if (m.type === 'releve:pret') await envoyerAuMoteur(cadre);
    else if (m.type === 'releve:enregistrer') await enregistrerPlan(m, cadre);
    else if (m.type === 'releve:vide' && attenteVidage) attenteVidage();
  }).catch(err => erreurPlan('Le plan n’a pas pu être enregistré sur l’appareil (' + ((err && err.message) || 'erreur') + ').'));
});

/* étape 6 : fin de visite */
function etapeFin(v) {
  const m = M.manques(v), types = M.valeur(v, 'projet.types') || [];
  const garde = v.photos[M.valeur(v, 'photoGarde')];
  const c = k => M.valeur(v, 'client.' + k);
  const dd = (t, val) => [h('dt', {}, t), h('dd', {}, val || '—')];
  const nb = M.nbAcheteurs(v), soc = M.estSociete(v);
  const nomDe = p => [M.valeur(v, p + '.civilite'), M.valeur(v, p + '.prenom'), M.valeur(v, p + '.nom')].filter(Boolean).join(' ');
  const contactDe = p => [M.valeur(v, p + '.telephone'), M.valeur(v, p + '.email')].filter(Boolean).join(' · ');
  const travaux = [c('adresse'), [c('codePostal'), c('ville')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const usage = M.valeur(v, 'bien.usage') === 'Autre' ? (M.valeur(v, 'bien.usageAutre') || 'Autre') : M.valeur(v, 'bien.usage');
  const listeTypes = types.map(t => t === 'Autre' && M.valeur(v, 'projet.typeAutre') ? 'Autre (' + M.valeur(v, 'projet.typeAutre') + ')' : t);
  return [
    h('h1', {}, 'Récapitulatif'),
    m.length ? h('div', { class: 'manque' }, 'À compléter si possible : ' + m.join(', ') + '.') : h('div', { class: 'message ok' }, '✓ Fiche complète.'),
    garde && !garde.supprime ? h('div', { style: 'margin-top:12px' }, imagePhoto(garde, 'garde')) : null,
    h('dl', { class: 'carte recap', style: 'margin-top:12px' },
      dd('Client', M.intitule(v)),
      soc ? dd('Société', [M.valeur(v, 'societe.siret') && 'SIRET ' + M.valeur(v, 'societe.siret'), M.valeur(v, 'societe.siege') && 'siège : ' + M.valeur(v, 'societe.siege')].filter(Boolean).join(' · ') || null) : null,
      soc ? dd('Représentée par', nomDe('client')) : null,
      dd(nb > 1 ? 'Contact acheteur 1' : 'Contact', contactDe('client')),
      // le domicile n'est dit que s'il diffère de l'adresse des travaux
      !soc && M.valeur(v, 'client.domicileIdem') === false ? dd(nb > 1 ? 'Domicile acheteur 1' : 'Domicile', M.domicile(v, 1)) : null,
      [2, 3].filter(n => n <= nb).map(n => [
        dd('Acheteur ' + n, [nomDe('acheteur' + n), contactDe('acheteur' + n)].filter(Boolean).join(' · ')),
        M.valeur(v, 'acheteur' + n + '.domicileIdem') === false ? dd('Domicile acheteur ' + n, M.domicile(v, n)) : null]),
      dd('Adresse des travaux', travaux),
      dd('Usage du bien', usage),
      dd('Ampleur', (M.valeur(v, 'projet.categories') || []).join(', ')),
      dd('Travaux', listeTypes.join(', ')),
      dd('Situation actuelle', M.valeur(v, 'projet.situation')),
      dd('Souhaits', M.valeur(v, 'projet.souhaits')),
      M.valeur(v, 'projet.explicatif') ? dd('En quelques mots', M.valeur(v, 'projet.explicatif')) : null,
      dd('Délai', M.valeur(v, 'projet.delai')),
      dd('Enveloppe', M.valeur(v, 'projet.enveloppe') != null ? M.formatEuros(M.valeur(v, 'projet.enveloppe')) + ' TTC' : null),
      dd('Pièces', M.actifs(v.pieces).map(p => { const ph = M.actifs(v.photos).filter(x => x.pieceId === p.id), im = ph.filter(x => x.role === 'imagine').length;
        return p.nom + ' (' + (ph.length - im) + ' ph.' + (im ? ', ' + im + ' imaginée' + (im > 1 ? 's' : '') : '') + ')'; }).join(', ')),
      dd('Scan', (M.valeur(v, 'scan.fichier') || {}).nom),
      dd('Plan', M.valeur(v, 'plan') ? resumePlan(M.valeur(v, 'plan').resume) : null),
      dd('Budget estimé', (M.valeur(v, 'budget') || {}).estimation ? B.formatPlage(M.valeur(v, 'budget').estimation) + ' (indicatif)' : null)),
    champ(v, 'notes', 'NOTES DE VISITE (internes, jamais dans le dossier client)', { multiligne: true, autocapitalize: 'sentences' }),
    h('button', { class: 'gros sec', id: 'ouvrirDossier', style: 'margin-top:14px', onclick: () => { S.ecran = 'dossier'; S.message = null; dessiner(); window.scrollTo(0, 0); } }, '📄 Dossier client'),
  ];
}

/* ---------- le dossier client (Phase 3, releve/dossier.js) ----------
   Mis en page comme des feuilles A4 ; « Imprimer / PDF » l'imprime, ou
   l'enregistre en PDF (sur iPhone : Imprimer, puis Partager). Les options
   choisissent ce qui y figure ; elles sont gardées sur l'appareil. */
const CLE_OPT_DOSSIER = 'cp-releve-dossier-options';
function optionsDossier() {
  if (!S.optDossier) { try { S.optDossier = { ...OPTIONS_DEFAUT, ...JSON.parse(localStorage.getItem(CLE_OPT_DOSSIER) || '{}') }; } catch (e) { S.optDossier = { ...OPTIONS_DEFAUT }; } }
  return S.optDossier;
}
const dateLongue = iso => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const photoDossier = (ph, cls) => imagePhoto({ id: ph.id, chemin: ph.chemin, legende: ph.legende || ph.consigne || 'Photo' }, cls);

function ecranDossier() {
  const v = visite();
  if (!v) { S.ecran = 'accueil'; return ecranAccueil(); }
  const o = optionsDossier();
  const d = dossierClient(v, { ...o, table: tableOuv(), fourchettes: fourchettes() });
  const retour = () => { S.ecran = 'visite'; dessiner(); window.scrollTo(0, 0); };
  const basculer = k => { o[k] = !o[k]; try { localStorage.setItem(CLE_OPT_DOSSIER, JSON.stringify(o)); } catch (e) { /* option non gardée */ } redessiner(); };
  const imprimer = async e => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Préparation des photos…';
    // toutes les photos chargées avant d'imprimer (sinon des cadres vides)
    await Promise.all([...document.querySelectorAll('.dossier img')].map(img => img.complete && img.src ? null : new Promise(ok => { img.onload = img.onerror = ok; setTimeout(ok, 6000); })));
    b.disabled = false; b.textContent = '🖨 Imprimer / PDF';
    window.print();
  };
  const ligne = (t, val) => val ? h('div', { class: 'dl' }, h('span', {}, t), h('b', {}, val)) : null;
  const page = (cls, ...enfants) => h('section', { class: 'feuille ' + (cls || '') }, ...enfants,
    h('footer', {}, 'CP Constructions · ' + d.client + ' · visite du ' + dateLongue(d.date)));
  const option = (k, lib) => h('label', { class: 'case' }, h('input', { type: 'checkbox', checked: !!o[k], name: 'opt-' + k, onchange: () => basculer(k) }), h('span', {}, lib));
  return [
    h('header', { class: 'haut sansImpression' }, h('button', { class: 'lienRetour', onclick: retour }, '‹ Visite'), h('span', { class: 'titre' }, 'Dossier client'), pastilleEtat()),
    h('main', { class: 'mainDossier' },
      h('div', { class: 'carte sansImpression outilsDossier' },
        h('b', {}, 'Ce que le dossier contient'),
        option('estimation', 'Estimation budgétaire indicative'),
        option('enveloppe', 'Budget envisagé par le client'),
        option('imagines', 'Images d’intention (✨ Imaginé)'),
        option('notesPieces', 'Notes des pièces'),
        h('p', { class: 'mut petit' }, 'Jamais dans le dossier : les notes de visite, la marge.'),
        h('button', { class: 'gros', id: 'imprimerDossier', type: 'button', onclick: imprimer }, '🖨 Imprimer / PDF'),
        h('p', { class: 'mut petit' }, 'Sur iPhone : « Imprimer », puis le bouton Partager pour l’enregistrer en PDF ou l’envoyer.')),
      h('div', { class: 'dossier' },
        page('garde',
          h('img', { class: 'logoDossier', src: '../assets/logo_fiche.jpg', alt: 'CP Constructions' }),
          h('h1', {}, d.titre),
          h('div', { class: 'gardeClient' }, d.client),
          d.adresse ? h('div', { class: 'gardeAdresse' }, d.adresse) : null,
          d.garde ? photoDossier(d.garde, 'gardeDossier') : null,
          h('div', { class: 'gardeDate' }, 'Visite du ' + dateLongue(d.date))),
        page('',
          h('h2', {}, 'Vous'),
          d.personnes.map(p => ligne(p.role, [p.nom, p.detail].filter(Boolean).join(' — '))),
          h('h2', {}, 'Le bien'),
          ligne('Adresse des travaux', d.bien.adresse), ligne('Usage', d.bien.usage),
          ligne('Surface relevée', d.bien.surface ? String(d.bien.surface).replace('.', ',') + ' m²' + (d.bien.nbPieces ? ' (' + d.bien.nbPieces + ' pièce' + (d.bien.nbPieces > 1 ? 's' : '') + ')' : '') : ''),
          h('h2', {}, 'Votre projet'),
          ligne('Ampleur', d.projet.categories.join(', ')), ligne('Travaux', d.projet.types.join(', ')), ligne('Délai souhaité', d.projet.delai),
          d.projet.enveloppe != null ? ligne('Budget envisagé', M.formatEuros(d.projet.enveloppe) + ' TTC') : null,
          d.projet.situation ? [h('h3', {}, 'La situation aujourd’hui'), h('p', { class: 'texte' }, d.projet.situation)] : null,
          d.projet.souhaits ? [h('h3', {}, 'Vos souhaits'), h('p', { class: 'texte' }, d.projet.souhaits)] : null),
        d.pieces.length ? page('pieces',
          h('h2', {}, 'Vos pièces'),
          d.pieces.map(p => h('div', { class: 'pieceDossier' },
            h('h3', {}, p.nom),
            p.note ? h('p', { class: 'texte' }, p.note) : null,
            p.photos.map(ph => h('div', { class: 'duo' + (ph.imagines.length ? ' avecImagine' : '') },
              h('figure', {}, photoDossier(ph), h('figcaption', {}, ph.imagines.length ? 'Aujourd’hui' + (ph.legende ? ' — ' + ph.legende : '') : ph.legende)),
              ph.imagines.map(im => h('figure', {}, photoDossier(im), h('figcaption', {}, '✨ Demain (image d’intention) — ' + im.consigne))))))),
          d.pieces.some(p => p.photos.some(ph => ph.imagines.length)) ? h('p', { class: 'mention' }, 'Les images d’intention sont générées pour aider à se projeter : elles ne sont ni un plan ni un engagement sur le rendu final.') : null) : null,
        d.plan.length ? page('',
          h('h2', {}, 'Le relevé'),
          h('table', { class: 'tableDossier' }, h('thead', {}, h('tr', {}, h('th', {}, 'Pièce'), h('th', {}, 'Niveau'), h('th', {}, 'Surface'), h('th', {}, 'Hauteur'))),
            h('tbody', {}, d.plan.map(p => h('tr', {}, h('td', {}, p.nom), h('td', {}, p.etage ? 'Étage ' + p.etage : 'RDC'),
              h('td', {}, p.surface != null ? String(p.surface).replace('.', ',') + ' m²' : '—'), h('td', {}, p.hauteur ? String(p.hauteur).replace('.', ',') + ' m' : '—'))))),
          h('p', { class: 'mention' }, 'Surfaces intérieures relevées au scanner lors de la visite, à confirmer par un relevé contradictoire.')) : null,
        d.estimation ? page('',
          h('h2', {}, 'Estimation budgétaire indicative'),
          h('table', { class: 'tableDossier' }, h('thead', {}, h('tr', {}, h('th', {}, 'Travaux'), h('th', {}, 'Quantité'), h('th', {}, 'Gamme'), h('th', {}, 'Fourchette TTC'))),
            h('tbody', {}, d.estimation.lignes.map(l => h('tr', {}, h('td', {}, l.libelle), h('td', {}, l.quantite), h('td', {}, l.gamme), h('td', { class: 'nombre' }, euros(l.min) + ' à ' + euros(l.max))))),
            h('tfoot', {}, h('tr', {}, h('td', { colspan: 3 }, 'Total' + (d.estimation.majoration ? ' (ajustements compris : +' + Math.round(d.estimation.majoration * 100) + ' %)' : '')), h('td', { class: 'nombre' }, euros(d.estimation.total.min) + ' à ' + euros(d.estimation.total.max))))),
          h('p', { class: 'mention' }, 'Estimation indicative, non contractuelle, établie lors de la première visite à partir de surfaces globales et de prix moyens. Elle ne constitue ni un devis ni une offre. Le chiffrage détaillé vous sera remis après étude du projet.' + (d.estimation.incomplet ? ' Certains postes restent à chiffrer.' : ''))) : null,
        page('fin',
          h('h2', {}, 'La suite'),
          h('ol', { class: 'suite' }, h('li', {}, 'Nous étudions votre projet à partir de ce relevé.'), h('li', {}, 'Nous vous remettons un chiffrage détaillé.'), h('li', {}, 'Nous en parlons ensemble et ajustons le projet si besoin.')),
          h('img', { class: 'logoDossier', src: '../assets/logo_fiche.jpg', alt: 'CP Constructions' })))),
  ];
}

/* ---------- étape « Budget » : l'estimation de premier rendez-vous ----------
   Chez le client, en quelques touchers : on choisit les travaux (tuiles), la
   surface vient du plan (la cuisine du scan, la surface habitable…) ou d'une
   valeur courante réglée par − / +, la gamme place le prix entre le mini et
   le maxi (releve/budget.js, OUVRAGES). La fourchette TTC s'affiche aussitôt,
   face à l'enveloppe du client. Indicatif, non contractuel : le chiffrage
   précis se fait au bureau (fiche prospect du suivi). Le total est gardé
   avec la visite (« estimation ») : le suivi l'affiche sur la fiche du
   prospect. « Approfondir » garde les ajustements et le poste par poste. */
const euros = n => Math.round(n).toLocaleString('fr-FR') + ' €';
function compteur(el, de, a) {
  // le total « roule » jusqu'à sa nouvelle valeur (sauf si l'on préfère moins d'animations)
  if (!el) return;
  const fin = () => { el.textContent = a.min || a.max ? B.formatPlage(a) : 'Touchez les travaux'; };
  if (!de || (de.min === a.min && de.max === a.max) || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return fin();
  const t0 = performance.now(), d = 450;
  const pas = t => { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
    el.textContent = B.formatPlage({ min: Math.round((de.min + (a.min - de.min) * e) / 100) * 100, max: Math.round((de.max + (a.max - de.max) * e) / 100) * 100 });
    if (k < 1) requestAnimationFrame(pas); else fin(); };
  requestAnimationFrame(pas);
}
function jaugeEnveloppe(total, env) {
  if (!(total.max > 0)) return null;
  const echelle = Math.max(total.max, env || 0) * 1.12, pc = x => Math.max(0, Math.min(100, x / echelle * 100)) + '%';
  return h('div', { class: 'jauge', 'aria-hidden': 'true' },
    h('i', { class: 'bande', style: 'left:' + pc(total.min) + ';width:calc(' + pc(total.max) + ' - ' + pc(total.min) + ')' }),
    env ? h('b', { class: 'repere', style: 'left:' + pc(env) }, h('span', {}, 'enveloppe')) : null);
}

function etapeBudget(v) {
  const budget = M.valeur(v, 'budget') || {};
  const pieces = B.piecesDuPlan(M.valeur(v, 'plan')), T = tableOuv(), F_ = fourchettes();
  const calc = B.calculerEstimation(budget, T, pieces, F_);
  const env = M.valeur(v, 'projet.enveloppe'), verdict = B.verdictEnveloppe(calc.total, env);
  const majBudget = async f => {
    const b = f(JSON.parse(JSON.stringify({ lignes: [], ouvrages: [], ajust: {}, ...budget, ouvrages: budget.ouvrages || [] })));
    const c = B.calculerEstimation(b, tableOuv(), pieces, fourchettes());
    b.estimation = { min: c.total.min, max: c.total.max, complet: !c.vide && !c.manques, le: new Date().toISOString() };
    S.totalAvant = calc.total;
    await poser('budget', b); vibrer(); redessiner();
  };
  const types = M.valeur(v, 'projet.types') || [], cats = M.valeur(v, 'projet.categories') || [];
  const sugg = B.ouvragesSuggeres(types, cats, T, budget.ouvrages);
  const proposes = new Set(sugg.map(o => o.id)), pris = new Set((budget.ouvrages || []).map(c => c.ouvrageId));
  const nouveau = o => ({ id: M.nouvelId(), ouvrageId: o.id, surface: null, niveau: 'standard' });
  const basculer = o => majBudget(b => { const i = b.ouvrages.findIndex(c => c.ouvrageId === o.id); if (i >= 0) b.ouvrages.splice(i, 1); else b.ouvrages.push(nouveau(o)); return b; });
  const couleur = { dans: 'ok', limite: 'att', hors: 'err' };
  let montant;
  const vue = [
    h('h1', {}, 'Budget'),
    h('p', { class: 'mut' }, 'Touchez les travaux : la fourchette se calcule tout de suite. Indicatif, non contractuel : le chiffrage précis se fait au bureau.'),
    h('div', { class: 'carte totalBudget', id: 'totalBudget' },
      montant = h('div', { class: 'montant', id: 'montantBudget' }, calc.vide ? 'Touchez les travaux' : B.formatPlage(calc.total)),
      h('div', { class: 'mut petit' }, calc.vide ? 'Estimation TTC, indicative.' : 'Indicatif, non contractuel' + (calc.majoration ? ' · ajustements compris : +' + Math.round(calc.majoration * 100) + ' %' : '')),
      jaugeEnveloppe(calc.total, env),
      env != null ? h('div', { class: 'message ' + (verdict ? couleur[verdict.niveau] : 'att'), style: 'margin:10px 0 0', id: 'verdictBudget' },
        'Enveloppe du client : ' + M.formatEuros(env) + (verdict ? ' · ' + verdict.texte : '')) : h('div', { class: 'mut petit', style: 'margin-top:6px' }, 'Enveloppe du client non renseignée (étape Projet).'),
      calc.manques ? h('div', { class: 'manque', style: 'margin-top:10px' }, calc.manques + ' poste' + (calc.manques > 1 ? 's' : '') + ' sans prix : voir « Approfondir ».') : null),
    calc.vide && sugg.length ? h('button', { class: 'gros', id: 'estimerSuggeres', style: 'margin-bottom:12px',
      onclick: () => majBudget(b => { sugg.forEach(o => b.ouvrages.push(nouveau(o))); return b; }) },
      '✨ Estimer les travaux choisis (' + sugg.length + ')') : null,
    calc.ouvrages.map(r => carteOuvrage(r, majBudget)),
    h('div', { class: 'champ' }, calc.ouvrages.length ? 'AJOUTER DES TRAVAUX' : 'LES TRAVAUX'),
    h('div', { class: 'tuiles' }, T.map(o => h('button', { class: 'tuile' + (pris.has(o.id) ? ' on' : '') + (proposes.has(o.id) ? ' propose' : ''), type: 'button',
      'data-ouvrage': o.id, 'aria-pressed': String(pris.has(o.id)), onclick: () => basculer(o) },
      h('span', { class: 'ico' }, o.icone), h('span', {}, o.nom)))),
    blocApprofondir(v, budget, calc, pieces, F_, majBudget),
  ];
  compteur(montant, S.totalAvant, calc.total); S.totalAvant = null;
  return vue;
}

/* une carte par travaux choisis : surface (− / +), gamme, fourchette */
function carteOuvrage(r, majBudget) {
  const o = r.ouvrage;
  if (!o) return null;
  const changer = f => majBudget(b => { const c = b.ouvrages.find(x => x.id === r.id); if (c) f(c); return b; });
  const u = B.uniteOuvrage(o), forfait = o.unite === 'forfait';
  const pas = o.unite === 'u' ? 1 : r.surface < 20 ? 1 : r.surface < 100 ? 5 : 10;
  const poserSurface = val => changer(c => { const n = Math.max(0, Math.round(val * 10) / 10); c.surface = r.source !== 'saisie' && n === r.auto ? null : n; });
  return h('div', { class: 'carte ouvrage', 'data-choix': r.id, 'data-ouvrage-choisi': o.id },
    h('div', { class: 'rang', style: 'justify-content:space-between;align-items:flex-start' },
      h('b', {}, o.icone + ' ' + o.nom),
      h('button', { class: 'puce', type: 'button', 'aria-label': 'Retirer ' + o.nom, onclick: () => majBudget(b => { b.ouvrages = b.ouvrages.filter(c => c.id !== r.id); return b; }) }, '×')),
    h('div', { class: 'plage' }, r.manque ? 'Prix à saisir (voir « Approfondir »)' : 'de ' + euros(Math.round(r.min / 100) * 100) + ' à ' + euros(Math.round(r.max / 100) * 100)),
    forfait ? h('div', { class: 'mut petit' }, 'Prix posé, au forfait.') : [
      h('div', { class: 'reglage' },
        h('button', { class: 'pm', type: 'button', 'aria-label': 'Moins', onclick: () => poserSurface(r.surface - pas) }, '−'),
        h('label', { class: 'valeur' }, h('input', { inputMode: 'decimal', value: String(r.surface).replace('.', ','), 'aria-label': (o.unite === 'u' ? 'Nombre' : 'Surface') + ' — ' + o.nom,
          onchange: e => { const n = +String(e.target.value).replace(/\s/g, '').replace(',', '.'); if (isFinite(n) && n >= 0) poserSurface(n); } }), h('span', {}, ' ' + u)),
        h('button', { class: 'pm', type: 'button', 'aria-label': 'Plus', onclick: () => poserSurface(r.surface + pas) }, '+')),
      h('div', { class: 'mut petit' }, r.source === 'plan' ? '📐 D’après le plan : ' + r.detail
        : r.source === 'saisie' ? ['Réglé à la main', r.auto != null ? h('button', { class: 'lienRetour', type: 'button', onclick: () => changer(c => { c.surface = null; }) }, ' ↺ revenir à ' + String(r.auto).replace('.', ',') + ' ' + u) : null]
        : 'Valeur courante : réglez-la avec − / +.')],
    h('div', { class: 'puces niveaux' }, B.NIVEAUX.map(n => h('button', { class: 'puce' + (r.niveau === n.id ? ' on' : ''), type: 'button', 'aria-pressed': String(r.niveau === n.id),
      onclick: () => changer(c => { c.niveau = n.id; }) }, n.signe + ' ' + n.nom))),
    o.note ? h('div', { class: 'mut petit', style: 'margin-top:6px' }, o.note) : null,
    o.repere === 'estimation' ? h('div', { class: 'mut petit' }, 'Prix de départ à confirmer (⚙ Prix au m²).') : null);
}

/* « Approfondir » : ajustements, poste par poste, réglage des prix */
function blocApprofondir(v, budget, calc, pieces, F_, majBudget) {
  const a = budget.ajust || {};
  const ajouter = fid => majBudget(b => { b.lignes.push({ id: M.nouvelId(), fourchetteId: fid, gamme: 'standard', pieces: [] }); return b; });
  const d = h('details', { class: 'approfondir', open: !!S.budgetDetail || (budget.lignes || []).length > 0, ontoggle: e => { S.budgetDetail = e.target.open; } },
    h('summary', {}, 'Approfondir : ajustements, poste par poste, prix'),
    h('div', { class: 'champ' }, 'AJUSTEMENTS'),
    h('div', { class: 'puces' }, B.ETATS.map(([n, val]) => h('button', { class: 'puce' + ((a.etat || 0) === val ? ' on' : ''), type: 'button', onclick: () => majBudget(b => { b.ajust = { ...b.ajust, etat: val }; return b; }) }, n + (val ? ' +' + val * 100 + ' %' : '')))),
    h('div', { class: 'puces' }, B.ACCES.map(([n, val]) => h('button', { class: 'puce' + ((a.acces || 0) === val ? ' on' : ''), type: 'button', onclick: () => majBudget(b => { b.ajust = { ...b.ajust, acces: val }; return b; }) }, n + (val ? ' +' + val * 100 + ' %' : '')))),
    h('label', { class: 'champ' }, 'IMPRÉVUS : +' + Math.round((a.imprevus || 0) * 100) + ' %',
      h('input', { type: 'range', class: 'curseur', min: 0, max: B.IMPREVUS_MAX * 100, step: 5, value: Math.round((a.imprevus || 0) * 100), 'aria-label': 'Imprévus',
        onchange: e => majBudget(b => { b.ajust = { ...b.ajust, imprevus: (+e.target.value) / 100 }; return b; }) })),
    h('div', { class: 'champ' }, 'POSTE PAR POSTE (FACULTATIF)'),
    h('p', { class: 'mut petit' }, 'Pour détailler un poste avec ses quantités : il s’ajoute à l’estimation ci-dessus.'),
    calc.detail.lignes.map((l, i) => carteLigneBudget(l, budget.lignes[i], pieces, majBudget)),
    h('label', { class: 'champ' }, 'AJOUTER UN POSTE DÉTAILLÉ',
      h('select', { class: 'in', id: 'ajouterPoste', onchange: e => { if (e.target.value) ajouter(e.target.value); } },
        h('option', { value: '' }, 'Choisir…'), F_.map(f => h('option', { value: f.id }, f.libelle + ' (' + (B.UNITES[f.unite] || {}).court + ')')))),
    h('div', { class: 'rang', style: 'margin-top:14px;flex-wrap:wrap' },
      h('button', { class: 'gros sec', id: 'ouvrirPrixOuvrages', onclick: () => { S.retour = 'visite'; S.ecran = 'ouvrages'; S.brouillonO = null; dessiner(); window.scrollTo(0, 0); } }, '⚙ Prix au m²'),
      h('button', { class: 'gros sec', id: 'ouvrirFourchettes', onclick: () => { S.retour = 'visite'; S.ecran = 'fourchettes'; S.brouillonF = null; dessiner(); window.scrollTo(0, 0); } }, '⚙ Postes détaillés')));
  return d;
}

function carteLigneBudget(l, src, pieces, majBudget) {
  const u = B.UNITES[l.unite] || {}, duPlan = !!u.plan && pieces.length > 0;
  const changer = f => majBudget(b => { const x = b.lignes.find(y => y.id === src.id); if (x) f(x, b); return b; });
  return h('div', { class: 'carte', 'data-ligne': src.id },
    h('div', { class: 'rang', style: 'justify-content:space-between;align-items:flex-start' },
      h('b', {}, l.libelle),
      h('button', { class: 'puce', type: 'button', 'aria-label': 'Retirer le poste', onclick: () => majBudget(b => { b.lignes = b.lignes.filter(y => y.id !== src.id); return b; }) }, '🗑')),
    h('div', { class: 'mut petit', style: 'margin:4px 0 6px' }, l.manque === 'prix' ? 'Prix à saisir dans les fourchettes (gamme ' + (B.GAMMES.find(g => g.id === l.gamme) || {}).nom + ')'
      : l.manque === 'quantite' ? 'Quantité à saisir' : l.manque === 'poste' ? 'Poste retiré des fourchettes' : B.formatPlage({ min: l.min, max: l.max })),
    h('div', { class: 'puces' }, B.GAMMES.map(g => h('button', { class: 'puce' + (l.gamme === g.id ? ' on' : ''), type: 'button', onclick: () => changer(x => { x.gamme = g.id; }) }, g.nom))),
    l.unite === 'forfait' ? null : h('label', { class: 'champ' }, 'QUANTITÉ (' + (u.court || '') + ')' + (l.source === 'plan' ? ' : d’après le plan' : ''),
      h('input', { class: 'in', inputMode: 'decimal', name: 'quantite-' + src.id, value: l.quantite != null ? String(l.quantite).replace('.', ',') : '',
        placeholder: l.quantitePlan != null ? 'plan : ' + String(l.quantitePlan).replace('.', ',') : 'à saisir',
        onchange: e => changer(x => { const t = e.target.value.trim(); x.quantite = t === '' || (l.quantitePlan != null && t.replace(',', '.') == l.quantitePlan && l.source === 'plan') ? null : t; }) })),
    duPlan ? h('div', { class: 'puces', style: 'margin-top:6px' },
      h('button', { class: 'puce' + (!(src.pieces || []).length ? ' on' : ''), type: 'button', onclick: () => changer(x => { x.pieces = []; x.quantite = null; }) }, 'Toute la maison'),
      pieces.map(p => { const on = (src.pieces || []).includes(p.id);
        return h('button', { class: 'puce' + (on ? ' on' : ''), type: 'button', onclick: () => changer(x => { const s = new Set(x.pieces || []); on ? s.delete(p.id) : s.add(p.id); x.pieces = [...s]; x.quantite = null; }) }, p.nom); })) : null);
}

/* ---------- la table des fourchettes de prix (partagée par l'équipe) ----------
   Gardée dans la table releve_reglages (ligne « fourchettes ») et sur
   l'appareil pour servir sans réseau. Sans table installée, ou sans réseau,
   la saisie reste sur cet appareil et l'écran le dit. */
const CLE_FOURCHETTES = 'cp-releve-fourchettes';
const F = { lignes: null, version: 0, etat: 'local' };
const fourchettes = () => (F.lignes || B.FOURCHETTES_MODELE).filter(l => !l.supprime);
function lireCacheFourchettes() { try { const x = JSON.parse(localStorage.getItem(CLE_FOURCHETTES) || 'null'); return x && Array.isArray(x.lignes) ? x : null; } catch (e) { return null; } }
function ecrireCacheFourchettes() { try { localStorage.setItem(CLE_FOURCHETTES, JSON.stringify({ lignes: F.lignes, version: F.version })); } catch (e) { /* stockage plein : la table reste en mémoire */ } }
async function chargerFourchettes() {
  const c = lireCacheFourchettes(); if (c) { F.lignes = c.lignes; F.version = c.version || 0; }
  try {
    const { data, error } = await supa.from('releve_reglages').select('donnees,version').eq('id', 'fourchettes').maybeSingle();
    if (error) { F.etat = /42P01|PGRST205|does not exist|schema cache/.test((error.code || '') + ' ' + (error.message || '')) ? 'absent' : 'local'; return; }
    F.etat = 'serveur';
    if (data && data.donnees && Array.isArray(data.donnees.lignes)) {
      // ce qui a été saisi ici sans réseau et pas encore envoyé n'est pas perdu
      F.lignes = c && c.enAttente ? B.fusionnerFourchettes(data.donnees.lignes, c.lignes) : data.donnees.lignes;
      F.version = data.version; ecrireCacheFourchettes();
    }
  } catch (e) { F.etat = 'local'; }
}
async function enregistrerFourchettes(lignes) {
  for (let essai = 0; essai < 3; essai++) {
    const { data, error } = await supa.from('releve_reglages').select('donnees,version').eq('id', 'fourchettes').maybeSingle();
    if (error) throw error;
    const fus = data && data.donnees ? B.fusionnerFourchettes(data.donnees.lignes, lignes) : lignes;
    const quand = new Date().toISOString();
    const r = data ? await supa.from('releve_reglages').update({ donnees: { lignes: fus }, version: data.version + 1, maj_le: quand }).eq('id', 'fourchettes').eq('version', data.version).select('id')
      : await supa.from('releve_reglages').insert({ id: 'fourchettes', donnees: { lignes: fus }, version: 1, maj_le: quand }).select('id');
    if (r.error && r.error.code === '23505') continue;
    if (r.error) throw r.error;
    if ((r.data || []).length) { F.lignes = fus; F.version = data ? data.version + 1 : 1; F.etat = 'serveur'; ecrireCacheFourchettes(); return; }
  }
  throw { message: 'la table a été modifiée en même temps par un collègue : réessayez' };
}

/* ---------- les prix au m² de l'estimation R1 (partagés par l'équipe) ----------
   Table releve_reglages, ligne « ouvrages » : seuls les prix retouchés par
   CP Constructions y sont ; le reste vient des repères du modèle
   (releve/budget.js, OUVRAGES). Même fonctionnement que les fourchettes :
   copie sur l'appareil pour servir sans réseau, fusion par ligne. */
const CLE_OUVRAGES = 'cp-releve-ouvrages';
const PO = { lignes: [], version: 0, etat: 'local' };
const tableOuv = () => B.tableOuvrages(PO.lignes);
async function chargerOuvrages() {
  try { const c = JSON.parse(localStorage.getItem(CLE_OUVRAGES) || 'null'); if (c && Array.isArray(c.lignes)) { PO.lignes = c.lignes; PO.version = c.version || 0; PO.enAttente = !!c.enAttente; } } catch (e) { /* pas de copie */ }
  try {
    const { data, error } = await supa.from('releve_reglages').select('donnees,version').eq('id', 'ouvrages').maybeSingle();
    if (error) { PO.etat = /42P01|PGRST205|does not exist|schema cache/.test((error.code || '') + ' ' + (error.message || '')) ? 'absent' : 'local'; return; }
    PO.etat = 'serveur';
    if (data && data.donnees && Array.isArray(data.donnees.lignes)) {
      PO.lignes = PO.enAttente ? B.fusionnerFourchettes(data.donnees.lignes, PO.lignes) : data.donnees.lignes;
      PO.version = data.version;
      try { localStorage.setItem(CLE_OUVRAGES, JSON.stringify({ lignes: PO.lignes, version: PO.version, enAttente: PO.enAttente })); } catch (e) { /* stockage plein */ }
    }
  } catch (e) { PO.etat = 'local'; }
}
async function enregistrerOuvrages(lignes) {
  for (let essai = 0; essai < 3; essai++) {
    const { data, error } = await supa.from('releve_reglages').select('donnees,version').eq('id', 'ouvrages').maybeSingle();
    if (error) throw error;
    const fus = data && data.donnees ? B.fusionnerFourchettes(data.donnees.lignes, lignes) : lignes;
    const quand = new Date().toISOString();
    const r = data ? await supa.from('releve_reglages').update({ donnees: { lignes: fus }, version: data.version + 1, maj_le: quand }).eq('id', 'ouvrages').eq('version', data.version).select('id')
      : await supa.from('releve_reglages').insert({ id: 'ouvrages', donnees: { lignes: fus }, version: 1, maj_le: quand }).select('id');
    if (r.error && r.error.code === '23505') continue;
    if (r.error) throw r.error;
    if ((r.data || []).length) { PO.lignes = fus; PO.version = data ? data.version + 1 : 1; PO.etat = 'serveur'; PO.enAttente = false;
      try { localStorage.setItem(CLE_OUVRAGES, JSON.stringify({ lignes: PO.lignes, version: PO.version })); } catch (e) { /* stockage plein */ } return; }
  }
  throw { message: 'la table a été modifiée en même temps par un collègue : réessayez' };
}
function ecranOuvrages() {
  // brouillon : une ligne par ouvrage, prix de CP s'ils existent, sinon ceux du modèle
  if (!S.brouillonO) S.brouillonO = B.OUVRAGES.map(o => { const e = (PO.lignes || []).find(x => x.id === o.id && !x.supprime); return { id: o.id, prix: { ...(e ? e.prix : o.prix) }, perso: !!e, maj: e ? e.maj : null }; });
  const L = S.brouillonO, quand = () => new Date().toISOString();
  const retour = () => { S.ecran = S.retour || 'accueil'; S.brouillonO = null; dessiner(); window.scrollTo(0, 0); };
  const enregistrer = async e => {
    const bouton = e.currentTarget, faux = L.filter(l => l.perso && !B.prixNiveau(l.prix, 'standard'));
    if (faux.length) { S.message = { type: 'err', texte: 'Prix à corriger (mini ≤ médian ≤ maxi) : ' + faux.map(l => B.OUVRAGES.find(o => o.id === l.id).nom).join(', ') + '.' }; dessiner(); return; }
    const lignes = L.filter(l => l.maj).map(l => l.perso ? { id: l.id, prix: l.prix, maj: l.maj } : { id: l.id, supprime: true, maj: l.maj });
    bouton.disabled = true;
    try { await enregistrerOuvrages(lignes); feter(bouton); S.message = { type: 'ok', texte: 'Prix au m² enregistrés pour toute l’équipe.' }; retour(); }
    catch (err) {
      PO.lignes = B.fusionnerFourchettes(PO.lignes || [], lignes); PO.enAttente = true;
      try { localStorage.setItem(CLE_OUVRAGES, JSON.stringify({ lignes: PO.lignes, version: PO.version, enAttente: true })); } catch (x) { /* rien de plus à faire */ }
      S.message = { type: 'att', texte: 'Prix enregistrés sur cet appareil seulement (' + (PO.etat === 'absent' ? 'table « releve_reglages » à installer : relancez supabase/releve/schema.sql' : 'pas de réseau ou serveur indisponible') + '). Ils partiront au prochain enregistrement avec du réseau.' };
      retour();
    }
  };
  const champPrix = (l, o, k) => h('input', { class: 'in', inputMode: 'decimal', style: 'margin:0', name: 'ouv-' + l.id + '-' + k, 'aria-label': o.nom + ' ' + k,
    value: l.prix[k] != null ? String(l.prix[k]).replace('.', ',') : '',
    oninput: e => { const t = e.target.value.trim().replace(/\s/g, '').replace(',', '.'); l.prix[k] = t === '' ? null : +t; l.perso = true; l.maj = quand(); } });
  return [
    h('header', { class: 'haut' }, h('button', { class: 'lienRetour', onclick: retour }, '‹ Retour'), h('span', { class: 'titre' }, 'Prix au m²'), pastilleEtat()),
    h('main', {},
      S.message && h('div', { class: 'message ' + S.message.type }, S.message.texte),
      h('h1', {}, 'Prix au m² (estimation R1)'),
      h('p', { class: 'mut' }, 'Prix TTC posés : mini, médian, maxi. Éco = du mini au médian, Standard = autour du médian, Haut de gamme = du médian au maxi. Partis des repères publics 2026 : remplacez-les par vos ratios de chantiers. Table partagée par toute l’équipe.'),
      PO.etat === 'absent' ? h('div', { class: 'message att' }, 'La table des réglages n’est pas encore installée sur le serveur (relancez supabase/releve/schema.sql). Vos prix resteront sur cet appareil en attendant.') : null,
      L.map(l => { const o = B.OUVRAGES.find(x => x.id === l.id);
        return h('div', { class: 'carte', 'data-prix-ouvrage': l.id },
          h('div', { class: 'rang', style: 'justify-content:space-between' }, h('b', {}, o.icone + ' ' + o.nom),
            h('span', { class: 'pastille' + (l.perso ? ' ok' : '') }, l.perso ? 'Prix CP' : o.repere === 'estimation' ? 'À confirmer' : 'Repère marché')),
          h('div', { class: 'mut petit' }, 'Par ' + (o.unite === 'forfait' ? 'chantier (forfait)' : o.unite === 'u' ? 'unité' : 'm²') + (o.note ? ' · ' + o.note : '')),
          h('div', { class: 'rang', style: 'margin-top:8px' }, champPrix(l, o, 'min'), champPrix(l, o, 'med'), champPrix(l, o, 'max')),
          h('div', { class: 'rang mut petit', style: 'margin-top:2px' }, h('span', { style: 'flex:1' }, 'mini'), h('span', { style: 'flex:1' }, 'médian'), h('span', { style: 'flex:1' }, 'maxi')),
          l.perso ? h('button', { class: 'lienRetour', type: 'button', onclick: () => { l.prix = { ...o.prix }; l.perso = false; l.maj = quand(); dessiner(); } }, '↺ Revenir au repère du marché') : null); })),
    h('div', { class: 'barreBas' }, h('div', { class: 'in' }, h('button', { class: 'gros sec', onclick: retour }, 'Annuler'), h('button', { class: 'gros', id: 'enregistrerOuvrages', onclick: enregistrer }, 'Enregistrer'))),
  ];
}

function ecranFourchettes() {
  if (!S.brouillonF) S.brouillonF = JSON.parse(JSON.stringify(F.lignes || B.FOURCHETTES_MODELE));
  const L = S.brouillonF, quand = () => new Date().toISOString();
  const poserL = (id, f) => { const l = L.find(x => x.id === id); if (l) { f(l); l.maj = quand(); } };
  const retour = () => { S.ecran = S.retour || 'accueil'; S.brouillonF = null; dessiner(); window.scrollTo(0, 0); };
  const enregistrer = async e => {
    const bouton = e.currentTarget; bouton.disabled = true;
    try { await enregistrerFourchettes(L); feter(bouton); S.message = { type: 'ok', texte: 'Fourchettes de prix enregistrées pour toute l’équipe.' }; retour(); }
    catch (err) {
      F.lignes = JSON.parse(JSON.stringify(L));
      try { localStorage.setItem(CLE_FOURCHETTES, JSON.stringify({ lignes: F.lignes, version: F.version, enAttente: true })); } catch (x) { /* rien de plus à faire */ }
      S.message = { type: 'att', texte: 'Fourchettes enregistrées sur cet appareil seulement (' + (F.etat === 'absent' ? 'table « releve_reglages » à installer : relancez supabase/releve/schema.sql' : 'pas de réseau ou serveur indisponible') + '). Elles partiront au prochain enregistrement avec du réseau.' };
      retour();
    }
  };
  const nombre = (l, g, k) => h('input', { class: 'in', inputMode: 'decimal', 'aria-label': l.libelle + ' ' + g + ' ' + k, name: 'prix-' + l.id + '-' + g + '-' + k, style: 'margin:0',
    value: l.prix && l.prix[g] && l.prix[g][k] != null ? String(l.prix[g][k]).replace('.', ',') : '', placeholder: k === 'min' ? 'mini' : 'maxi',
    oninput: e => poserL(l.id, x => { const t = e.target.value.trim().replace(/\s/g, '').replace(',', '.'); x.prix = { ...(x.prix || {}) }; x.prix[g] = { ...(x.prix[g] || {}), [k]: t === '' ? null : +t }; }) });
  return [
    h('header', { class: 'haut' }, h('button', { class: 'lienRetour', onclick: retour }, '‹ Retour'), h('span', { class: 'titre' }, 'Fourchettes de prix'), pastilleEtat()),
    h('main', {},
      h('h1', {}, 'Fourchettes de prix'),
      h('p', { class: 'mut' }, 'Prix TTC par unité, mini et maxi, pour chaque gamme. Ils donnent la fourchette annoncée au client pendant la visite. La table est partagée par toute l’équipe.'),
      F.etat === 'absent' ? h('div', { class: 'message att' }, 'La table des réglages n’est pas encore installée sur le serveur (relancez supabase/releve/schema.sql). Vos prix resteront sur cet appareil en attendant.') : null,
      L.filter(l => !l.supprime).map(l => h('div', { class: 'carte', 'data-fourchette': l.id },
        h('div', { class: 'rang' },
          h('input', { class: 'in', value: l.libelle, 'aria-label': 'Libellé du poste', style: 'margin:0;font-weight:600', oninput: e => poserL(l.id, x => { x.libelle = e.target.value; }) }),
          h('button', { class: 'puce', type: 'button', 'aria-label': 'Supprimer le poste', onclick: () => { if (!confirm('Supprimer le poste « ' + l.libelle + ' » ?')) return; poserL(l.id, x => { x.supprime = true; }); dessiner(); } }, '🗑')),
        h('div', { class: 'deuxCol' },
          h('label', { class: 'champ' }, 'UNITÉ', h('select', { class: 'in', onchange: e => poserL(l.id, x => { x.unite = e.target.value; }) },
            Object.entries(B.UNITES).map(([k, u]) => h('option', { value: k, selected: l.unite === k }, u.nom)))),
          h('label', { class: 'champ' }, 'TRAVAUX', h('select', { class: 'in', onchange: e => poserL(l.id, x => { x.type = e.target.value; }) },
            [...new Set([...M.TYPES_TRAVAUX, ...M.CATEGORIES_RENO, l.type].filter(Boolean))].map(t => h('option', { value: t, selected: l.type === t }, t))))),
        B.GAMMES.map(g => h('div', { class: 'rang', style: 'margin-top:8px' }, h('span', { style: 'flex:0 0 76px;font-weight:600' }, g.nom), nombre(l, g.id, 'min'), nombre(l, g.id, 'max'))))),
      h('button', { class: 'gros sec', id: 'ajouterFourchette', onclick: () => { L.push({ id: M.nouvelId(), type: 'Autre', libelle: 'Nouveau poste', unite: 'm2_sol', prix: {}, maj: quand() }); dessiner(); } }, '＋ Ajouter un poste')),
    h('div', { class: 'barreBas' }, h('div', { class: 'in' }, h('button', { class: 'gros sec', onclick: retour }, 'Annuler'), h('button', { class: 'gros', id: 'enregistrerFourchettes', onclick: enregistrer }, 'Enregistrer'))),
  ];
}

/* ---------- dessin ---------- */
function dessiner() {
  arreterDictee(); // le champ dicté va être remplacé
  const app = document.getElementById('app');
  const ecran = S.ecran === 'connexion' ? ecranConnexion() : S.ecran === 'visite' ? ecranVisite() : S.ecran === 'plan' ? ecranPlan() : S.ecran === 'fourchettes' ? ecranFourchettes() : S.ecran === 'ouvrages' ? ecranOuvrages() : S.ecran === 'dossier' ? ecranDossier() : ecranAccueil();
  app.replaceChildren(...ecran.flat(Infinity).filter(Boolean));
}

/* ---------- arrivée depuis le suivi de chantiers ----------
   « Ouvrir » une visite (?visite=<id>) ou « Nouvelle visite » sur une fiche
   prospect (?prospect=<id>) : la visite s'ouvre, ou se crée rattachée au
   dossier, fiche client reprise du suivi (lecture seule : rien n'est écrit
   dans les données du suivi). L'adresse est nettoyée aussitôt, pour qu'un
   rechargement ne crée pas une seconde visite. */
const lien = (() => { const q = new URLSearchParams(location.search); return { visite: q.get('visite'), prospect: q.get('prospect'), vue: q.get('vue') }; })();
if (lien.visite || lien.prospect) history.replaceState(null, '', location.pathname);

async function traiterLien() {
  if (lien.visite) {
    const id = lien.visite; lien.visite = null;
    let rec = S.visites.find(r => r.id === id);
    if (!rec) { await sync.synchroniser(); rec = S.visites.find(r => r.id === id); }
    // « ?vue=dossier » (depuis la fiche prospect du suivi) ouvre directement le dossier client
    if (rec) { S.courante = id; S.etape = Math.max(0, M.ETAPES.findIndex(e => e.id === M.valeur(rec.visite, 'etape'))); S.ecran = lien.vue === 'dossier' ? 'dossier' : 'visite'; S.message = null; }
    else S.message = { type: 'err', texte: 'Cette visite n’est pas sur cet appareil et n’a pas pu être téléchargée (réseau ?). Réessayez avec du réseau.' };
    dessiner();
  } else if (lien.prospect) {
    const pid = lien.prospect; lien.prospect = null;
    await visitePourProspect(pid);
  }
}

async function visitePourProspect(pid) {
  let v = M.modifier(M.nouvelleVisite(), 'prospectId', pid), p = null;
  try {
    const { data, error } = await supa.from('app_data').select('data').eq('id', 'main').single();
    if (!error && data && data.data) p = (data.data.prospects || []).find(x => x.id === pid) || null;
  } catch (e) { /* hors ligne : la visite reste rattachée au dossier, la fiche se remplit à la main */ }
  if (p) {
    const t = x => typeof x === 'string' ? x.trim() : '';
    // « M. » + « Mme » du même nom : un couple ; sinon le 2e acheteur garde sa fiche
    const couple = p.afficherClient2 && p.civilite === 'M.' && p.civilite2 === 'Mme' && (!t(p.client2) || t(p.client).toLowerCase().endsWith(t(p.client2).toLowerCase()));
    const societe = ['SCI', 'SAS'].includes(p.civilite);
    const civ = couple ? 'M. et Mme' : M.CIVILITES.includes(p.civilite) ? p.civilite : null;
    // l'adresse du projet (découverte) est celle des travaux ; l'adresse du client, son domicile
    const projet = t((p.decouverte || {}).adresseProjet), domicile = t(p.adresseClient);
    const deux = !couple && !societe && p.afficherClient2 && t(p.client2);
    v = [
      ...(societe ? [['client.type', 'societe'], ['societe.forme', p.civilite], ['societe.raisonSociale', p.client]]
        : [['client.civilite', civ], ['client.nom', p.client]]),
      ['client.telephone', p.telClient], ['client.email', p.emailClient],
      ['client.adresse', projet || domicile], ['client.ville', p.commune],
      ...(projet && domicile && projet !== domicile && !societe ? [['client.domicileIdem', false], ['client.domicile', domicile]] : []),
      ...(deux ? [['client.nbAcheteurs', 2], ['acheteur2.civilite', ['M.', 'Mme'].includes(p.civilite2) ? p.civilite2 : null], ['acheteur2.nom', p.client2],
        ['acheteur2.telephone', p.telClient2], ['acheteur2.email', p.emailClient2],
        ...(t(p.adresseClient2) && t(p.adresseClient2) !== domicile ? [['acheteur2.domicileIdem', false], ['acheteur2.domicile', p.adresseClient2]] : [])] : []),
    ].reduce((w, [k, val]) => (typeof val === 'string' ? val.trim() : val != null) ? M.modifier(w, k, typeof val === 'string' ? val.trim() : val) : w, v);
  }
  await stock.creer(v);
  S.visites.unshift({ id: v.id, visite: v, enAttente: true, rev: 1 });
  S.courante = v.id; S.etape = 0; S.ecran = 'visite';
  S.message = p ? { type: 'ok', texte: 'Visite pour « ' + (p.nom || p.client || 'ce dossier') + ' » : fiche client reprise du suivi. Prenez la photo de garde.' }
    : { type: 'att', texte: 'Visite rattachée au dossier du suivi. La fiche client n’a pas pu être reprise (réseau ?) : complétez-la.' };
  dessiner(); planifierSync(300);
}

/* ---------- démarrage ---------- */
async function demarrer() {
  try { await recharger(); } catch (e) {
    document.getElementById('app').replaceChildren(h('main', {}, h('div', { class: 'message err' },
      'Le stockage de l’appareil est indisponible (navigation privée ?). Ouvrez la page dans Safari normal pour ne rien perdre.')));
    return;
  }
  try { const { data } = await supa.auth.getSession(); S.session = data && data.session; } catch (e) { S.session = null; }
  if (supa.auth.onAuthStateChange) supa.auth.onAuthStateChange((ev, session) => { S.session = session; });
  if (!S.session && navigator.onLine !== false && supa !== supaAbsent) S.ecran = 'connexion';
  dessiner();
  // ce qui est arrivé du serveur (autre appareil) apparaît dans la liste
  const avant = sync.synchroniser;
  sync.synchroniser = async () => { await avant(); const n = S.visites.length; await recharger(); if (S.ecran === 'accueil' && S.visites.length !== n) dessiner(); };
  sync.synchroniser();
  chargerFourchettes().then(() => { if (S.ecran === 'visite' || S.ecran === 'fourchettes') dessiner(); });
  chargerOuvrages().then(() => { if (S.ecran === 'visite' || S.ecran === 'ouvrages') dessiner(); });
  if (S.ecran !== 'connexion') traiterLien();   // sinon, après la connexion
  window.addEventListener('online', () => sync.synchroniser());
  window.addEventListener('offline', () => sync.synchroniser());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync.synchroniser(); });
  setInterval(() => sync.synchroniser(), 60000);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
demarrer();
