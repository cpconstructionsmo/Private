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
import * as A from './assistant.js';
import { h } from './dom.js';
import { vueDossier, dateLongue } from './dossier-vue.js';

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
      h('div', { class: 'rang', style: 'justify-content:space-between;align-items:center' },
        h('div', { class: 'etapeNom' }, 'Étape ' + (S.etape + 1) + ' sur ' + M.ETAPES.length + ' · ' + et.titre),
        h('button', { class: 'puce assistantBouton', type: 'button', id: 'ouvrirAssistant', onclick: () => { S.ecran = 'assistant'; S.propAssistant = null; S.message = null; dessiner(); window.scrollTo(0, 0); } }, '🎙 Assistant')),
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

/* le code postal remplit la commune : la liste officielle des communes
   (geo.api.gouv.fr, service public, seul le code postal y part). Une seule
   commune : elle se met d'office si la ville est vide ; plusieurs : on la
   choisit d'un toucher. Sans réseau, rien ne change : la ville se tape. */
const communesCache = new Map();
async function communesDuCodePostal(cp) {
  if (communesCache.has(cp)) return communesCache.get(cp);
  const r = await fetch('https://geo.api.gouv.fr/communes?codePostal=' + cp + '&fields=nom&format=json');
  if (!r.ok) throw new Error('geo ' + r.status);
  const L = [...new Set((await r.json()).map(c => String(c.nom || '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  communesCache.set(cp, L); return L;
}
function champCodePostal(v) {
  const el = champ(v, 'client.codePostal', 'CODE POSTAL', { inputmode: 'numeric', autocomplete: 'postal-code', placeholder: 'ex. 61000' });
  const inp = el.querySelector('input');
  inp.maxLength = 5;
  const poserVille = async nom => {
    await poser('client.ville', nom);
    const vi = document.querySelector('input[name="client.ville"]'); if (vi) vi.value = nom;
    const box = document.getElementById('communesProposees'); if (box) box.replaceChildren();
    vibrer();
  };
  inp.addEventListener('input', async () => {
    const cp = inp.value.replace(/\D/g, '');
    const box = document.getElementById('communesProposees');
    if (box) box.replaceChildren();
    if (cp.length !== 5 || navigator.onLine === false) return;
    let L;
    try { L = await communesDuCodePostal(cp); } catch (e) { return; }     // pas de réseau : la ville se tape
    if (inp.value.replace(/\D/g, '') !== cp || !L.length) return;
    const ville = (M.valeur(visite(), 'client.ville') || '').trim();
    if (L.length === 1) { if (!ville || ville.toLowerCase() !== L[0].toLowerCase()) await poserVille(L[0]); return; }
    if (box && !L.some(n => n.toLowerCase() === ville.toLowerCase()))
      box.replaceChildren(h('span', { class: 'mut petit', style: 'width:100%' }, 'Quelle commune ?'),
        ...L.slice(0, 12).map(n => h('button', { class: 'puce', type: 'button', onclick: () => poserVille(n) }, n)));
  });
  return el;
}

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
      champCodePostal(v),
      champ(v, 'client.ville', 'VILLE', { autocomplete: 'address-level2', autocapitalize: 'words' })),
    h('div', { class: 'puces', id: 'communesProposees' }),
  ];
  const domicile = (prefixe, libelle, defautLibelle) => [
    caseACocher(v, prefixe + '.domicileIdem', defautLibelle, { defaut: true, apres: redessiner }),
    M.valeur(v, prefixe + '.domicileIdem') === false
      ? champ(v, prefixe + '.domicile', libelle, { multiligne: true, lignes: 2, autocapitalize: 'sentences', placeholder: 'N°, rue, code postal, ville' }) : null,
  ];
  return [
    h('h1', {}, 'Le client'),
    // le résumé de départ : on raconte, l'assistant remplit la fiche (relue avant d'y entrer)
    h('button', { class: 'carte resumeDepart', type: 'button', id: 'resumeDepart', onclick: () => { S.ecran = 'assistant'; S.propAssistant = null; S.message = null; dessiner(); window.scrollTo(0, 0); } },
      h('b', {}, '🎙 Commencer par un résumé'), h('span', { class: 'mut petit' }, 'Racontez ou écrivez la visite en quelques phrases : la fiche se remplit toute seule, vous relisez avant.')),
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
  /* l'image du plan dessiné (dossier client) : gardée seulement si elle a changé */
  let image = null;
  if (typeof m.imagePlan === 'string' && /^data:image\/jpeg;base64,/.test(m.imagePlan) && m.imagePlan.length < 4000000) {
    const empreinte = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(m.imagePlan)))).slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
    const avant = M.valeur(visite(), 'planImage');
    if (!avant || avant.empreinte !== empreinte) {
      image = { id: M.nouvelId(), empreinte };
      await stock.garderPhoto(image.id, S.courante, await (await fetch(m.imagePlan)).blob());
    }
  }
  await changer(w => {
    let x = w;
    if (image) {
      const avant = M.valeur(x, 'planImage');
      if (avant && x.photos[avant.id]) x = M.supprimer(x, 'photos', avant.id);
      x = M.modifier(M.ajouterPhoto(x, { id: image.id, role: 'dessinPlan' }), 'planImage', image);
    }
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

/* ---------- l'assistant de visite (releve/assistant.js) ----------
   On raconte la visite d'un trait, au micro ou au clavier ; « Remplir la
   fiche » la confie à la fonction du serveur (action « structurer »), puis
   chaque champ proposé se relit et se coche avant d'entrer dans la visite.
   La dictée est gardée avec la visite (hors ligne compris) jusqu'à ce
   qu'elle soit rangée : rien ne se perd si le réseau manque. */
async function lancerAssistant(btn, info) {
  const v = visite(), texte = (M.valeur(v, 'assistant.texte') || '').trim();
  const dire = (t, type) => { info.textContent = t; info.className = 'message ' + (type || 'err'); };
  if (texte.length < 10) return dire('Racontez d’abord la visite (au moins une phrase).', 'att');
  if (navigator.onLine === false) return dire('L’assistant a besoin du réseau. Votre dictée est gardée avec la visite : touchez « Remplir la fiche » quand le réseau revient.', 'att');
  if (!S.session) return dire('Connectez-vous (même compte que le suivi) pour utiliser l’assistant. Votre dictée est gardée.', 'att');
  if (!supa.functions || !supa.functions.invoke) return dire(MESSAGES_IMAGINER.non_configure, 'att');
  const lib = btn.textContent; btn.disabled = true; btn.textContent = '✨ Lecture de la dictée…';
  try {
    const { data, error } = await supa.functions.invoke('imaginer', { body: { action: 'structurer', texte, listes: A.listesPourIA() } });
    if (error) {
      let j = {}; try { j = await error.context.json(); } catch (e) { /* pas de corps lisible */ }
      const st = error.context && error.context.status;
      throw { code: j.erreur || (st === 404 ? 'non_configure' : st ? 'erreur_' + st : 'reseau'), limite: j.limite, manque: j.manque, message: j.message };
    }
    if (!data || !data.fiche) throw { code: 'illisible' };
    const prop = A.propositions(data.fiche, visite());
    S.propAssistant = prop;
    if (!prop.champs.length && !prop.pieces.length) dire('Rien de nouveau à ranger : la fiche contient déjà ce que dit la dictée.', 'ok');
    redessiner();
  } catch (e) {
    btn.disabled = false; btn.textContent = lib;
    const code = (e && e.code) || 'reseau';
    dire(code === 'quota' ? 'Limite du jour atteinte (' + (e.limite || '') + ' dictées par personne) : réessayez demain.'
      : code === 'illisible' ? 'La dictée n’a pas pu être lue : réessayez, ou reformulez quelques phrases.'
      : code === 'texte_absent' ? 'La dictée est trop courte.'
      : code === 'non_configure' && e.manque && e.manque.length ? 'Assistant : réglage à ajouter dans les secrets Supabase : ' + e.manque.join(', ') + '.'
      : code === 'reseau' ? 'Pas de réponse du serveur : réseau coupé, ou la fonction du serveur n’est pas à jour (voir supabase/functions/imaginer/README.md).'
      : MESSAGES_IMAGINER[code] || 'La lecture a échoué (' + code + (e && e.message ? ' : ' + e.message : '') + ').');
  }
}

function ecranAssistant() {
  const v = visite();
  if (!v) { S.ecran = 'accueil'; return ecranAccueil(); }
  const retour = () => { S.ecran = 'visite'; S.propAssistant = null; dessiner(); window.scrollTo(0, 0); };
  const P = S.propAssistant;
  let info;
  const affiche = x => Array.isArray(x) ? x.join(', ') : x == null || x === '' ? '—' : String(x);
  const appliquer = async e => {
    const n = P.champs.filter(c => c.coche).length + P.pieces.filter(p => p.coche).length;
    if (!n) return;
    await changer(w => A.appliquer(w, P));
    feter(e.currentTarget);
    S.propAssistant = null; S.ecran = 'visite';
    S.message = { type: 'ok', texte: '✨ Fiche complétée par l’assistant : ' + n + ' élément' + (n > 1 ? 's' : '') + ' rangé' + (n > 1 ? 's' : '') + '. Relisez les étapes Client, Projet et Pièces.' };
    dessiner(); window.scrollTo(0, 0);
  };
  return [
    h('header', { class: 'haut' }, h('button', { class: 'lienRetour', onclick: retour }, '‹ Visite'), h('span', { class: 'titre' }, 'Assistant de visite'), pastilleEtat()),
    h('main', {},
      h('h1', {}, '🎙 Racontez la visite'),
      h('p', { class: 'mut' }, 'Parlez librement : qui est le client, comment le joindre, l’adresse, la maison, ce qui ne va pas, ce qu’il veut, son budget, son délai, les pièces à transformer. L’assistant range tout dans la fiche ; vous relisez avant que rien n’y entre.'),
      champ(v, 'assistant.texte', 'VOTRE DICTÉE', { multiligne: true, lignes: 9, autocapitalize: 'sentences', micro: true,
        placeholder: 'Ex. : Monsieur et Madame Martin, 06 12 34 56 78, 3 rue des Lilas à Alençon. Maison de 1975, chauffage fioul, simple vitrage. Ils veulent ouvrir la cuisine sur le séjour et refaire la salle de bains, budget autour de 40 000 €, travaux d’ici six mois…' }),
      info = h('div', { role: 'status', id: 'infoAssistant', style: 'margin-top:10px' }),
      !P ? h('button', { class: 'gros', id: 'remplirFiche', style: 'margin-top:10px', onclick: e => lancerAssistant(e.currentTarget, info) }, '✨ Remplir la fiche') : null,
      P ? h('div', { class: 'carte propositions', style: 'margin-top:12px' },
        h('h2', {}, 'Ce que l’assistant propose'),
        h('p', { class: 'mut petit' }, 'Cochez ce qui est juste. Une case décochée remplacerait une saisie déjà faite.'),
        P.champs.map(c => h('label', { class: 'case proposition', 'data-cle': c.cle },
          h('input', { type: 'checkbox', checked: c.coche, onchange: e => { c.coche = e.target.checked; } }),
          h('span', {}, h('b', {}, A.libelleChamp(c.cle) + ' : '), affiche(c.cle === 'projet.enveloppe' ? M.formatEuros(c.valeur) + ' TTC' : c.valeur),
            c.mode === 'remplace' ? h('span', { class: 'mut petit' }, ' (remplace « ' + affiche(c.actuel) + ' »)') : c.mode === 'complete' ? h('span', { class: 'mut petit' }, ' (complète)') : null))),
        P.pieces.map(p => h('label', { class: 'case proposition', 'data-piece-proposee': p.nom },
          h('input', { type: 'checkbox', checked: p.coche, onchange: e => { p.coche = e.target.checked; } }),
          h('span', {}, h('b', {}, (p.pieceId ? 'Pièce « ' + p.nom + ' » : note' : 'Nouvelle pièce : ' + p.nom) + (p.note ? ' — ' : '')), p.note || ''))),
        h('div', { class: 'rang', style: 'margin-top:12px' },
          h('button', { class: 'gros sec', type: 'button', onclick: () => { S.propAssistant = null; redessiner(); } }, 'Recommencer'),
          h('button', { class: 'gros', id: 'appliquerAssistant', type: 'button', onclick: appliquer }, '✓ Ranger dans la fiche'))) : null),
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
const photoDossier = (ph, cls) => imagePhoto({ id: ph.id, chemin: ph.chemin, legende: ph.legende || ph.consigne || 'Photo' }, cls);

/* ---------- envoyer le dossier au client : un lien personnel, 30 jours ----------
   Le dossier (tel qu'à l'écran, options comprises) est gardé dans la table
   releve_partages avec l'empreinte d'un jeton aléatoire ; le client ouvre
   partage.html#t=<jeton>, sans compte. Le lien est gardé avec la visite pour
   être renvoyé ; « Mettre à jour » remplace le dossier gardé (même lien),
   « Retirer le lien » le rend inutilisable. Le relevé voit si le client l'a
   ouvert (vues, vu_le). */
const JOURS_PARTAGE = 30;
const jetonAleatoire = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const empreinteJeton = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join('');
const tableAbsente = err => /42P01|PGRST205|does not exist|schema cache/.test(((err && err.code) || '') + ' ' + ((err && err.message) || ''));
/* les photos du dossier pas encore envoyées sur le serveur (le client ne les verrait pas) */
const photosNonEnvoyees = d => [d.garde, d.planImage, ...d.pieces.flatMap(p => p.photos.flatMap(ph => [ph, ...ph.imagines]))].filter(ph => ph && !ph.chemin).length;

async function dossierAPartager() {
  const o = optionsDossier();
  let d = dossierClient(visite(), { ...o, table: tableOuv(), fourchettes: fourchettes() });
  if (photosNonEnvoyees(d)) { await sync.synchroniser(); d = dossierClient(visite(), { ...o, table: tableOuv(), fourchettes: fourchettes() }); }
  return d;
}
async function partagerDossier(action, btn, info) {
  const dire = (t, type) => { info.textContent = t; info.className = 'message ' + (type || 'err'); };
  if (navigator.onLine === false) return dire('Il faut du réseau pour envoyer le dossier au client.', 'att');
  if (!S.session) return dire('Connectez-vous (même compte que le suivi) pour envoyer le dossier.', 'att');
  const lib = btn.textContent; btn.disabled = true; btn.textContent = 'Préparation…';
  try {
    const actuel = M.valeur(visite(), 'partageDossier');
    if (action === 'retirer') {
      if (!confirm('Retirer le lien ? Le client ne pourra plus ouvrir son dossier avec ce lien.')) { btn.disabled = false; btn.textContent = lib; return; }
      const { error } = await supa.from('releve_partages').update({ revoque: true }).eq('id', actuel.id);
      if (error) throw error;
      await poser('partageDossier', null);
      S.message = { type: 'ok', texte: 'Lien retiré : le client ne peut plus ouvrir ce dossier.' }; redessiner(); return;
    }
    const d = await dossierAPartager(), manquent = photosNonEnvoyees(d);
    if (action === 'maj') {
      const { error } = await supa.from('releve_partages').update({ donnees: d }).eq('id', actuel.id);
      if (error) throw error;
      S.message = { type: 'ok', texte: 'Dossier envoyé mis à jour : le client voit la nouvelle version avec le même lien.' + (manquent ? ' ' + manquent + ' photo(s) pas encore envoyée(s) n’y figurent pas.' : '') };
      redessiner(); return;
    }
    const jeton = jetonAleatoire(), expire = new Date(Date.now() + JOURS_PARTAGE * 86400000).toISOString();
    const { data, error } = await supa.from('releve_partages').insert({ visite_id: S.courante, jeton_hash: await empreinteJeton(jeton), donnees: d, expire_le: expire }).select('id');
    if (error) throw error;
    const lien = new URL('partage.html#t=' + jeton, location.href).href;
    await poser('partageDossier', { id: (data && data[0] && data[0].id) || null, lien, expireLe: expire, creeLe: new Date().toISOString() });
    S.message = { type: 'ok', texte: '🔗 Lien du dossier créé, valable ' + JOURS_PARTAGE + ' jours. Envoyez-le au client ci-dessous.' + (manquent ? ' ' + manquent + ' photo(s) pas encore envoyée(s) n’y figurent pas : « Mettre à jour » une fois le réseau revenu.' : '') };
    redessiner();
  } catch (e) {
    btn.disabled = false; btn.textContent = lib;
    dire(tableAbsente(e) ? 'Le partage n’est pas encore installé sur le serveur (table releve_partages : voir supabase/functions/imaginer/schema.sql).'
      : 'L’envoi a échoué (' + ((e && e.message) || 'erreur') + '). Réessayez.');
  }
}
function carteEnvoiClient(v) {
  const pa = M.valeur(v, 'partageDossier'), c = k => M.valeur(v, 'client.' + k);
  let info;
  const etat = h('div', { class: 'mut petit', id: 'etatPartage' });
  if (pa && pa.id && S.session) supa.from('releve_partages').select('vues, vu_le, revoque, expire_le').eq('id', pa.id).maybeSingle().then(({ data }) => {
    if (!data) return;
    etat.textContent = data.revoque ? 'Lien retiré.' : new Date(data.expire_le) < new Date() ? 'Lien expiré le ' + dateLongue(data.expire_le) + ' : créez-en un nouveau.'
      : data.vues ? '👁 Ouvert par le client ' + data.vues + ' fois, la dernière le ' + new Date(data.vu_le).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + '.'
      : 'Pas encore ouvert par le client.';
  }).catch(() => {});
  const corpsMail = pa ? 'Bonjour,\n\nSuite à notre visite, voici votre dossier : votre projet, les photos de vos pièces et les premières idées, le relevé et une estimation indicative.\n\n'
    + pa.lien + '\n\nCe lien personnel est valable jusqu’au ' + dateLongue(pa.expireLe) + '.\n\nBien cordialement,\nCP Constructions' : '';
  const copier = async e => { try { await navigator.clipboard.writeText(pa.lien); e.currentTarget.textContent = '✓ Copié'; } catch (x) { prompt('Copiez le lien :', pa.lien); } };
  return h('div', { class: 'carte sansImpression envoiClient' },
    h('b', {}, '🔗 Envoyer au client'),
    !pa ? [h('p', { class: 'mut petit' }, 'Le client reçoit un lien personnel, valable ' + JOURS_PARTAGE + ' jours, pour voir ce dossier sur son téléphone ou son ordinateur, sans compte.'),
        h('button', { class: 'gros', id: 'creerLien', type: 'button', onclick: e => partagerDossier('creer', e.currentTarget, info) }, '🔗 Créer le lien du dossier')]
      : [h('input', { class: 'in', readOnly: true, value: pa.lien, id: 'lienDossier', 'aria-label': 'Lien du dossier', onclick: e => e.target.select() }),
        h('div', { class: 'mut petit' }, 'Valable jusqu’au ' + dateLongue(pa.expireLe) + '.'), etat,
        h('div', { class: 'puces' },
          h('button', { class: 'puce', type: 'button', onclick: copier }, '📋 Copier'),
          navigator.share ? h('button', { class: 'puce', type: 'button', onclick: () => navigator.share({ title: 'Votre projet — CP Constructions', text: 'Votre dossier de projet :', url: pa.lien }).catch(() => {}) }, '📤 Partager…') : null,
          h('a', { class: 'puce', href: 'mailto:' + encodeURIComponent(c('email') || '') + '?subject=' + encodeURIComponent('Votre projet de rénovation — CP Constructions') + '&body=' + encodeURIComponent(corpsMail) }, '✉ E-mail'),
          c('telephone') ? h('a', { class: 'puce', href: 'sms:' + String(c('telephone')).replace(/[^\d+]/g, '') + '?&body=' + encodeURIComponent('Bonjour, voici votre dossier CP Constructions : ' + pa.lien) }, '💬 SMS') : null),
        h('div', { class: 'rang', style: 'margin-top:8px;flex-wrap:wrap' },
          h('button', { class: 'gros sec', id: 'majLien', type: 'button', onclick: e => partagerDossier('maj', e.currentTarget, info) }, '↻ Mettre à jour'),
          h('button', { class: 'gros sec', id: 'retirerLien', type: 'button', onclick: e => partagerDossier('retirer', e.currentTarget, info) }, 'Retirer le lien'))],
    info = h('div', { role: 'status', id: 'infoPartage', style: 'margin-top:8px' }));
}

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
      carteEnvoiClient(v),
      S.message && h('div', { class: 'message sansImpression ' + S.message.type }, S.message.texte),
      vueDossier(d, { photo: photoDossier, logo: '../assets/logo_fiche.jpg' })),
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
/* « 📊 Calculer depuis mes chantiers » : les prospects de rénovation du
   suivi, lus (jamais écrits), donnent les prix de CP par travail
   (budget.js, ratiosDepuisProspects) ; chaque ligne se reprend d'un toucher
   dans le brouillon, puis « Enregistrer » comme une saisie. */
async function calculerRatiosCP() {
  S.ratiosCP = { etat: 'calcul' }; redessiner();
  try {
    if (!S.session || navigator.onLine === false) throw { message: 'il faut du réseau et être connecté' };
    const { data, error } = await supa.from('app_data').select('data').eq('id', 'main').single();
    if (error || !data || !data.data) throw error || { message: 'données du suivi introuvables' };
    const prospects = data.data.prospects || [];
    // la surface du plan d'une visite rattachée, quand le prospect n'a pas de surface saisie
    const surfaceDeVisite = new Map(S.visites.map(r => [r.id, r.visite]).map(([id, v]) => [id, (M.valeur(v, 'plan') || {}).resume]).filter(([, r]) => r && r.surface > 0).map(([id, r]) => [id, r.surface]));
    const surfacesPlan = {};
    S.visites.forEach(r => { const pid = M.valeur(r.visite, 'prospectId'); if (pid && surfaceDeVisite.has(r.id)) surfacesPlan[pid] = surfaceDeVisite.get(r.id); });
    prospects.forEach(p => (p.visites || []).forEach(x => { if (!surfacesPlan[p.id] && surfaceDeVisite.has(x.id)) surfacesPlan[p.id] = surfaceDeVisite.get(x.id); }));
    const liste = B.ratiosDepuisProspects(prospects, { majorations: data.data.majorationsCorps || [], surfacesPlan });
    S.ratiosCP = { etat: 'ok', liste, nb: prospects.filter(p => p.categorie === 'renovation').length };
  } catch (e) { S.ratiosCP = { etat: 'erreur', msg: (e && e.message) || 'erreur' }; }
  redessiner();
}
function carteRatiosCP(L, quand) {
  const R = S.ratiosCP;
  const reprendre = r => { const l = L.find(x => x.id === r.id); if (l) { l.prix = { ...r.prix }; l.perso = true; l.maj = quand(); } };
  if (!R) return h('div', { class: 'carte' }, h('b', {}, '📊 Vos prix, appris de vos chantiers'),
    h('p', { class: 'mut petit' }, 'Calcule vos prix au m² à partir des projets de rénovation déjà chiffrés dans le suivi (coût TTC des entreprises, hors honoraires, rapporté à la surface habitable). Rien n’est changé sans votre accord.'),
    h('button', { class: 'gros sec', id: 'calculerRatios', type: 'button', onclick: calculerRatiosCP }, '📊 Calculer depuis mes chantiers'));
  if (R.etat === 'calcul') return h('div', { class: 'carte mut' }, 'Lecture des chantiers du suivi…');
  if (R.etat === 'erreur') return h('div', { class: 'message err' }, 'Calcul impossible (' + R.msg + ').');
  return h('div', { class: 'carte', id: 'ratiosCP' },
    h('b', {}, '📊 Vos prix, appris de vos chantiers'),
    !R.liste.length ? h('p', { class: 'mut' }, 'Pas assez de données : il faut des projets de rénovation chiffrés par poste, avec leur surface habitable (ou le plan d’une visite). ' + R.nb + ' projet(s) de rénovation trouvé(s).')
      : [h('p', { class: 'mut petit' }, 'Coût TTC des entreprises, hors honoraires, au m² habitable. Peu de projets = repère fragile : vérifiez avant de reprendre.'),
        R.liste.map(r => { const o = B.OUVRAGES.find(x => x.id === r.id);
          return h('div', { class: 'rang ratio', 'data-ratio': r.id, style: 'justify-content:space-between;border-top:1px solid var(--rule);padding:8px 0' },
            h('div', {}, h('b', {}, o.icone + ' ' + o.nom), h('div', { class: 'mut petit', title: r.projets.join(', ') },
              r.n + ' projet' + (r.n > 1 ? 's' : '') + ' · ' + r.prix.min + ' / ' + r.prix.med + ' / ' + r.prix.max + ' €/m²')),
            h('button', { class: 'puce', type: 'button', onclick: () => { reprendre(r); redessiner(); } }, 'Reprendre')); }),
        h('button', { class: 'gros sec', id: 'reprendreRatios', type: 'button', style: 'margin-top:8px', onclick: () => { R.liste.forEach(reprendre); redessiner(); } }, 'Tout reprendre')]);
}

function ecranOuvrages() {
  // brouillon : une ligne par ouvrage, prix de CP s'ils existent, sinon ceux du modèle
  if (!S.brouillonO) S.brouillonO = B.OUVRAGES.map(o => { const e = (PO.lignes || []).find(x => x.id === o.id && !x.supprime); return { id: o.id, prix: { ...(e ? e.prix : o.prix) }, perso: !!e, maj: e ? e.maj : null }; });
  const L = S.brouillonO, quand = () => new Date().toISOString();
  const retour = () => { S.ecran = S.retour || 'accueil'; S.brouillonO = null; S.ratiosCP = null; dessiner(); window.scrollTo(0, 0); };
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
      carteRatiosCP(L, quand),
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
/* ---------- le bouton « retour » du navigateur et du téléphone ----------
   Chaque écran plus profond (accueil → visite → dossier, assistant, plan,
   prix) ajoute une entrée à l'historique : « retour » ramène à l'écran
   d'avant au lieu de quitter le relevé. Les boutons « ‹ » de l'écran font
   le même chemin (history.go), pour que l'historique reste juste. Changer
   d'étape dans une visite ne fait que réécrire l'entrée en cours. Le plan
   se ferme toujours par fermerPlan (sa dernière retouche part d'abord). */
const PROFONDEUR = { connexion: 0, accueil: 0, visite: 1 };
const profondeur = e => PROFONDEUR[e] ?? 2;
const ECRANS_SANS_VISITE = new Set(['connexion', 'accueil', 'ouvrages', 'fourchettes']);
let vueAffichee = null, sautHistorique = false, retourInterne = false, rangHistorique = 0, aReecrire = null;
function suivreHistorique() {
  const vue = { ecran: S.ecran, courante: S.courante, etape: S.etape };
  const avant = vueAffichee; vueAffichee = vue;
  try {
    if (sautHistorique) { sautHistorique = false; history.replaceState({ releve: vue, rang: rangHistorique }, ''); return; }
    if (!avant) { history.replaceState({ releve: vue, rang: rangHistorique }, ''); return; }
    const pa = profondeur(avant.ecran), pn = profondeur(vue.ecran);
    const autreEcran = avant.ecran !== vue.ecran || avant.courante !== vue.courante;
    if (pn > pa || (pn === pa && pn > 0 && autreEcran)) { rangHistorique++; history.pushState({ releve: vue, rang: rangHistorique }, ''); }
    else if (pn < pa && rangHistorique > 0) {
      // remonter par un bouton de l'écran : on recule d'autant dans l'historique (l'écran est déjà dessiné)
      const n = Math.min(rangHistorique, pa - pn); rangHistorique -= n; retourInterne = true; aReecrire = vue; history.go(-n);
    } else history.replaceState({ releve: vue, rang: rangHistorique }, '');
  } catch (e) { /* historique indisponible (aperçu, cadre) : sans conséquence */ }
}
window.addEventListener('popstate', async e => {
  const st = e.state || {};
  if (retourInterne) {                              // fin d'un retour demandé par un bouton de l'écran
    retourInterne = false; rangHistorique = st.rang || 0;
    if (aReecrire) { try { history.replaceState({ releve: aReecrire, rang: rangHistorique }, ''); } catch (x) { /* rien */ } aReecrire = null; }
    return;
  }
  const vue = st.releve; rangHistorique = st.rang || 0;
  if (!vue) return;
  if (S.ecran === 'plan' && vue.ecran !== 'plan') { sautHistorique = true; await fermerPlan(); }
  const ecran = !ECRANS_SANS_VISITE.has(vue.ecran) && !S.visites.some(r => r.id === vue.courante) ? 'accueil' : vue.ecran;
  S.ecran = ecran; if (vue.courante) S.courante = vue.courante; if (vue.etape != null) S.etape = vue.etape;
  S.message = null; S.propAssistant = null; S.imaginer = null;
  sautHistorique = true; dessiner(); window.scrollTo(0, 0);
});

function dessiner() {
  arreterDictee(); // le champ dicté va être remplacé
  const app = document.getElementById('app');
  const ecran = S.ecran === 'connexion' ? ecranConnexion() : S.ecran === 'visite' ? ecranVisite() : S.ecran === 'plan' ? ecranPlan() : S.ecran === 'fourchettes' ? ecranFourchettes() : S.ecran === 'ouvrages' ? ecranOuvrages() : S.ecran === 'dossier' ? ecranDossier() : S.ecran === 'assistant' ? ecranAssistant() : ecranAccueil();
  app.replaceChildren(...ecran.flat(Infinity).filter(Boolean));
  suivreHistorique();
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
