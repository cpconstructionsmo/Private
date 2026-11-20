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
import * as DR from './dessin.js';
import * as AN from './annotations.js';
import * as T from './terrain.js';
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
async function changer(f) { return changerVisite(S.courante, f); }
async function changerVisite(id, f) {
  const v = await stock.modifier(id, f);
  const rec = S.visites.find(r => r.id === id);
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
  return h('div', { class: 'carte visite', 'data-visite': r.id, onclick: () => { S.courante = r.id; S.etape = Math.max(0, M.etapesDe(v).findIndex(e => e.id === M.valeur(v, 'etape'))); S.ecran = 'visite'; S.message = null; dessiner(); } },
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
  S.etape = Math.max(0, Math.min(M.etapesDe(visite()).length - 1, i));
  S.message = null;
  poser('etape', M.etapesDe(visite())[S.etape].id);
  dessiner(); window.scrollTo(0, 0);
}

function ecranVisite() {
  const v = visite();
  if (!v) { S.ecran = 'accueil'; return ecranAccueil(); }
  const ETP = M.etapesDe(v); if (S.etape >= ETP.length) S.etape = ETP.length - 1;
  const et = ETP[S.etape], dernier = S.etape === ETP.length - 1;
  const corps = { garde: etapeGarde, client: etapeClient, projet: etapeProjet, terrain: etapeTerrain, pieces: etapePieces, scan: etapeScan, budget: etapeBudget, fin: etapeFin }[et.id](v);
  return [
    h('header', { class: 'haut' },
      h('button', { class: 'lienRetour', onclick: () => { S.ecran = 'accueil'; S.message = null; dessiner(); } }, '‹ Visites'),
      h('span', { class: 'titre' }, M.intitule(v)), pastilleEtat()),
    h('main', {},
      // la barre de progression est aussi un sommaire : toucher une étape y va directement
      h('nav', { class: 'progres', 'aria-label': 'Étapes de la visite' }, ETP.map((e, i) => h('button', { type: 'button', class: i < S.etape ? 'fait' : i === S.etape ? 'ici' : '',
        title: e.titre, 'aria-label': 'Étape ' + (i + 1) + ' : ' + e.titre, 'aria-current': i === S.etape ? 'step' : null, onclick: () => { if (i !== S.etape) allerEtape(i); } }, h('i')))),
      h('div', { class: 'rang', style: 'justify-content:space-between;align-items:center' },
        h('div', { class: 'etapeNom' }, 'Étape ' + (S.etape + 1) + ' sur ' + ETP.length + ' · ' + et.titre),
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
  const neuf = M.natureDe(v) === 'construction';
  return [
    // la nature du projet décide du parcours (étapes) : choisie avant tout
    h('div', { class: 'champ' }, 'LE PROJET'),
    puces(v, 'projet.nature', M.NATURES, { cls: 'puces natures', apres: () => { S.etape = 0; redessiner(); } }),
    h('h1', {}, neuf ? 'Le terrain en photo' : 'La maison'),
    garde && !garde.supprime
      ? [imagePhoto(garde, 'garde'), h('div', { class: 'rang', style: 'margin-top:10px' }, h('button', { class: 'gros sec', onclick: prendre }, '📷 Reprendre'), h('button', { class: 'gros sec', onclick: galerie }, '🖼 Galerie'))]
      : [h('p', { class: 'mut' }, neuf ? 'Une photo du terrain : elle servira de page de garde au dossier du client.' : 'Une photo de la façade : elle servira de page de garde au dossier du client.'),
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
    // une fois dicté, le résumé s'affiche ici (toucher pour le modifier ou le compléter)
    (() => { const resume = String(M.valeur(v, 'assistant.texte') || '').trim();
      return h('button', { class: 'carte resumeDepart' + (resume ? ' rempli' : ''), type: 'button', id: 'resumeDepart', onclick: () => { S.ecran = 'assistant'; S.propAssistant = null; S.message = null; dessiner(); window.scrollTo(0, 0); } },
        resume ? [h('b', {}, '🎙 Votre résumé de visite'), h('span', { class: 'resumeTexte', id: 'resumeTexte' }, resume), h('span', { class: 'mut petit' }, '✏️ Modifier ou compléter ›')]
          : [h('b', {}, '🎙 Commencer par un résumé'), h('span', { class: 'mut petit' }, 'Racontez ou écrivez la visite en quelques phrases : la fiche se remplit toute seule, vous relisez avant.')]); })(),
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
  const nature = M.natureDe(v);
  const blocEnveloppe = (libelle, max) => [h('div', { class: 'champ' }, libelle),
    h('div', { class: 'carte', style: 'margin-top:6px' },
      affichage = h('div', { class: 'montant', id: 'montantEnveloppe' }, M.formatEuros(env)),
      curseur = h('input', { type: 'range', class: 'curseur', min: 0, max, step: 1000, value: Math.min(env || 0, max), 'aria-label': 'Enveloppe financière', oninput: e => majEnv(e.target.value, 'curseur') }),
      h('label', { class: 'champ', style: 'margin-top:4px' }, 'OU TAPER LE MONTANT',
        saisie = h('input', { class: 'in', inputMode: 'numeric', name: 'projet.enveloppe', value: env ?? '', placeholder: 'ex. 45 000', oninput: e => majEnv(e.target.value, 'saisie') })))];
  const nombre = (cle, libelle, ph) => champ(v, cle, libelle, { inputmode: 'numeric', placeholder: ph });
  if (nature === 'construction') {
    const st = M.valeur(v, 'construction.terrainStatut');
    return [
      h('h1', {}, 'Le projet de construction'),
      h('div', { class: 'champ' }, 'PRESTATION'), puces(v, 'construction.prestation', M.PRESTATIONS_NEUF),
      nombre('construction.surface', 'SURFACE HABITABLE SOUHAITÉE (m²)', 'ex. 110'),
      h('div', { class: 'champ' }, 'NIVEAUX'), puces(v, 'construction.niveaux', M.NIVEAUX_NEUF, { multiple: true }),
      h('div', { class: 'champ' }, 'CHAMBRES'), puces(v, 'construction.chambres', M.CHAMBRES),
      h('div', { class: 'champ' }, 'GARAGE'), puces(v, 'construction.garage', M.GARAGES),
      h('div', { class: 'champ' }, 'CHAUFFAGE SOUHAITÉ'), puces(v, 'construction.chauffage', M.CHAUFFAGES_NEUF),
      champ(v, 'projet.souhaits', 'LE PROJET DU CLIENT', { multiligne: true, autocapitalize: 'sentences', micro: true, placeholder: 'Style, pièces de vie, suite parentale, terrasse, matériaux, contraintes…' }),
      h('div', { class: 'champ' }, 'LE TERRAIN'), puces(v, 'construction.terrainStatut', M.STATUTS_TERRAIN, { apres: redessiner }),
      st === 'Acquis' || st === 'Compromis signé' ? nombre('construction.prixTerrain', 'PRIX DU TERRAIN (€)', 'ex. 60 000') : null,
      h('div', { class: 'champ' }, 'FINANCEMENT'), puces(v, 'construction.financement', M.FINANCEMENTS),
      h('div', { class: 'champ' }, 'DÉLAI SOUHAITÉ'), puces(v, 'projet.delai', M.DELAIS),
      blocEnveloppe('ENVELOPPE DE LA CONSTRUCTION (TTC, HORS TERRAIN)', 600000),
    ];
  }
  if (nature === 'agrandissement') return [
    h('h1', {}, 'Le projet d’agrandissement'),
    h('div', { class: 'champ' }, 'TYPE D’AGRANDISSEMENT'), puces(v, 'agrandissement.types', M.TYPES_AGRANDISSEMENT, { multiple: true }),
    h('div', { class: 'deuxCol' },
      nombre('agrandissement.surface', 'SURFACE DE L’AGRANDISSEMENT (m²)', 'ex. 30'),
      nombre('agrandissement.surfaceExistante', 'SURFACE ACTUELLE DE LA MAISON (m²)', 'ex. 95')),
    h('p', { class: 'mut petit' }, 'Les deux surfaces servent aux rappels de l’étape Terrain (déclaration ou permis, seuil des 150 m²).'),
    h('div', { class: 'champ' }, 'TRAVAUX DANS L’EXISTANT (FACULTATIF)'),
    puces(v, 'projet.types', M.TYPES_TRAVAUX, { multiple: true, cls: 'grille', apres: redessiner }),
    types.includes('Autre') ? champ(v, 'projet.typeAutre', 'AUTRES TRAVAUX : PRÉCISEZ', { autocapitalize: 'sentences', micro: true }) : null,
    champ(v, 'projet.situation', 'LA MAISON AUJOURD’HUI', { multiligne: true, autocapitalize: 'sentences', micro: true, placeholder: 'L’existant : année, structure, chauffage, isolation, contraintes…' }),
    champ(v, 'projet.souhaits', 'SOUHAITS DU CLIENT', { multiligne: true, autocapitalize: 'sentences', micro: true, placeholder: 'Pièces à créer, usage, lumière, liaison avec l’existant…' }),
    h('div', { class: 'champ' }, 'DÉLAI SOUHAITÉ'), puces(v, 'projet.delai', M.DELAIS),
    blocEnveloppe('ENVELOPPE FINANCIÈRE (TTC)', 400000),
  ];
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

/* ---------- étape Terrain (construction, agrandissement) : terrain.js ----------
   Localisé par l'adresse ou par le GPS sur place, le terrain est interrogé
   aux services publics (cadastre, urbanisme, risques) ; les réponses sont
   gardées avec la visite et relues hors ligne. Les points d'attention sont
   indicatifs : ils disent quoi vérifier. */
const lireJson = async (url, ms = 20000) => {
  const c = typeof AbortController === 'function' ? new AbortController() : null, t = c && setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, c ? { signal: c.signal } : {}); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { if (t) clearTimeout(t); }
};
const adresseTerrain = v => M.valeur(v, 'terrain.adresseIdem') !== false && M.natureDe(v) === 'agrandissement' || M.valeur(v, 'terrain.adresseIdem') === true
  ? [M.valeur(v, 'client.adresse'), M.valeur(v, 'client.codePostal'), M.valeur(v, 'client.ville')]
  : [M.valeur(v, 'terrain.adresse'), M.valeur(v, 'terrain.codePostal'), M.valeur(v, 'terrain.ville')];
function positionGps() {
  return new Promise((ok, ko) => {
    if (!navigator.geolocation) return ko(new Error('gps_absent'));
    navigator.geolocation.getCurrentPosition(p => ok(p.coords), e => ko(e), { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  });
}
async function localiserTerrain(mode) {
  const dire = (t, type) => { S.terrainEtat = { message: t, type: type || 'err' }; redessiner(); };
  if (navigator.onLine === false) return dire('Pas de réseau : la localisation et les informations du terrain se chercheront au retour du réseau. Les cases ci-dessous se remplissent sans réseau.', 'att');
  S.terrainEtat = { encours: true }; redessiner();
  let pos;
  try {
    if (mode === 'gps') {
      const c = await positionGps();
      pos = { lon: c.longitude, lat: c.latitude, label: 'Position GPS sur le terrain' + (c.accuracy ? ' (± ' + Math.round(c.accuracy) + ' m)' : ''), source: 'gps' };
    } else {
      const q = adresseTerrain(visite()).filter(Boolean).join(' ').trim();
      if (q.length < 5) return dire('Tapez d’abord l’adresse du terrain (ou cochez « même adresse que les travaux »).', 'att');
      const g = T.lireGeocodage(await lireJson(T.urlGeocodage(q)));
      if (!g) return dire('Adresse introuvable : vérifiez-la, ou utilisez le GPS une fois sur le terrain.');
      pos = { lon: g.lon, lat: g.lat, label: g.label, insee: g.insee, source: 'adresse' };
    }
  } catch (e) {
    return dire(mode === 'gps' ? 'Position GPS indisponible (autorisez la localisation pour le relevé dans les réglages de l’iPhone), ou localisez par l’adresse.' : 'Le service d’adresses ne répond pas : réessayez dans un instant.');
  }
  await poser('terrain.position', { ...pos, le: new Date().toISOString() });
  await chercherInfosTerrain(pos);
}
async function chercherInfosTerrain(pos) {
  const U = T.urls(pos.lon, pos.lat), cles = Object.keys(U);
  const res = await Promise.allSettled(cles.map(k => lireJson(U[k])));
  const R = {}, erreurs = [];
  cles.forEach((k, i) => { if (res[i].status === 'fulfilled') R[k] = res[i].value; else erreurs.push(k); });
  const parcelle = T.lireParcelle(R.parcelle);
  const insee = (parcelle && parcelle.insee) || pos.insee || (R.rapport && R.rapport.commune && R.rapport.commune.codeInsee);
  let commune = null;
  if (insee) { try { commune = await lireJson(T.urlCommune(insee)); } catch (e) { erreurs.push('commune'); } }
  const infos = { le: new Date().toISOString(), parcelle, urbanisme: T.lireUrbanisme({ ...R, commune }), risques: T.lireRisques(R), erreurs };
  await changer(w => {
    let x = M.modifier(w, 'terrain.infos', infos);
    // la contenance cadastrale ne remplit la surface que si elle est vide (jamais d'écrasement)
    if (parcelle && parcelle.contenance && !M.valeur(x, 'terrain.surface')) x = M.modifier(x, 'terrain.surface', parcelle.contenance);
    return x;
  });
  S.terrainEtat = erreurs.length === cles.length ? { message: 'Les services publics ne répondent pas pour le moment : réessayez avec « ↻ Actualiser ».', type: 'err' }
    : erreurs.length ? { message: 'Certaines informations n’ont pas pu être lues (' + erreurs.length + ') : « ↻ Actualiser » pour réessayer.', type: 'att' } : null;
  vibrer(); redessiner();
}
function blocInfosTerrain(v) {
  const pos = M.valeur(v, 'terrain.position'), inf = M.valeur(v, 'terrain.infos');
  if (!pos) return null;
  const u = (inf && inf.urbanisme) || {}, r = (inf && inf.risques) || {}, p = inf && inf.parcelle;
  const nature = M.natureDe(v);
  const pts = inf ? T.pointsAttention(inf, { nature, surfaceProjet: nature === 'construction' ? M.valeur(v, 'construction.surface') : M.valeur(v, 'agrandissement.surface'), surfaceExistante: M.valeur(v, 'agrandissement.surfaceExistante') }) : [];
  const lien = (href, texte) => h('a', { href, target: '_blank', rel: 'noopener', class: 'lienRetour' }, texte);
  const z = u.zone;
  return h('div', { class: 'carte infosTerrain', id: 'infosTerrain' },
    h('div', { class: 'rang', style: 'justify-content:space-between' }, h('b', {}, '📍 ' + (pos.label || 'Terrain localisé')),
      h('button', { class: 'puce', type: 'button', id: 'actualiserTerrain', onclick: () => chercherInfosTerrain(pos) }, '↻ Actualiser')),
    inf ? h('div', { class: 'mut petit' }, 'Lu le ' + dateCourte(inf.le) + ' auprès du cadastre, du Géoportail de l’urbanisme et de Géorisques.') : null,
    p ? h('div', { class: 'ligneTerrain', id: 'parcelle' }, h('b', {}, 'Parcelle '), 'section ' + p.section + ' n° ' + p.numero + (p.commune ? ' (' + p.commune + ')' : '') + (p.contenance ? ' · ' + p.contenance.toLocaleString('fr-FR') + ' m² au cadastre' : '')) : null,
    h('div', { class: 'ligneTerrain', id: 'urbanisme' }, h('b', {}, 'Urbanisme '),
      u.rnu ? 'Règlement national d’urbanisme (pas de PLU)' : [u.document ? (u.document.titre || u.document.type) : null, z ? 'zone ' + z.libelle + (z.libelong ? ' : ' + z.libelong.toLowerCase() : '') + (z.typeLibelle ? ' (' + z.typeLibelle + ')' : '') : null].filter(Boolean).join(' — ') || 'non trouvé',
      z && z.reglement ? [' · ', lien(z.reglement, '📄 Règlement de la zone')] : null, ' · ', lien(T.carteUrbanisme(pos.lon, pos.lat), '🗺 Carte')),
    (u.servitudes || []).length ? h('ul', { class: 'listeTerrain', id: 'servitudes' }, u.servitudes.map(x => h('li', {}, x.libelle + (x.detail ? ' — ' + x.detail : '')))) : null,
    (u.informations || []).length ? h('div', { class: 'mut petit' }, 'Informations du document d’urbanisme : ' + u.informations.join(' · ')) : null,
    h('div', { class: 'ligneTerrain', id: 'risques' }, h('b', {}, 'Risques '),
      [r.argile ? 'argiles : ' + r.argile.libelle.toLowerCase() : null, r.seisme ? 'sismicité ' + r.seisme.libelle.toLowerCase() : null].filter(Boolean).join(' · ') || '—',
      r.url ? [' · ', lien(r.url, '📄 Rapport officiel Géorisques')] : null),
    (r.naturels || []).length || (r.technologiques || []).length ? h('div', { class: 'puces risques' },
      [...(r.naturels || []), ...(r.technologiques || [])].map(x => h('span', { class: 'puce risque' + (/existant|concerne/i.test(x.statut || '') && !/non /i.test(x.statut || '') ? ' avere' : '') }, x.libelle + (x.statut ? ' · ' + x.statut.replace(/^Risque /, '').toLowerCase() : '')))) : null,
    pts.length ? h('div', { class: 'pointsAttention', id: 'pointsAttention' }, h('b', {}, 'À retenir (indicatif, à vérifier)'),
      pts.map(x => h('div', { class: 'point ' + x.niveau }, h('b', {}, x.titre), ' — ', x.texte))) : null);
}
/* ---------- le plan du terrain coté (géomètre, lotissement, esquisse) ----------
   Lu par l'IA (decrire, mode terrain), puis analysé ici (terrain.js :
   analyserPlanTerrain) : esquisse ou plan à l'échelle, surface tirée des
   côtés, écarts avec la surface écrite, le cadastre, la façade relevée. Les
   valeurs lues ne remplissent que les cases vides ; les autres se reprennent
   d'un toucher. */
async function lirePlanTerrain(f) {
  const dire = (t, type) => { S.planTerrain = { message: t, type: type || 'err' }; redessiner(); };
  if (!pretPourIA(dire, 'La lecture du plan du terrain')) return;
  const pdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
  S.planTerrain = { encours: true }; redessiner();
  try {
    let blob = f, photoId = null;
    if (pdf) { if (f.size > PDF_MAX) throw { code: 'pdf_lourd' }; }
    else {
      blob = await reduirePhoto(f, 2400);
      photoId = M.nouvelId();
      await stock.garderPhoto(photoId, S.courante, blob);
      await changer(w => M.majElement(M.ajouterPhoto(w, { id: photoId, role: 'planTerrain', legende: f.name || 'Plan du terrain' }), 'photos', photoId, { importeLe: new Date().toISOString() }));
    }
    const r = await appelerFonction({ action: 'decrire', mode: 'terrain', image: await enBase64(blob), mime: pdf ? 'application/pdf' : 'image/jpeg' }) || {};
    if (!Array.isArray(r.cotes)) throw { code: r.legende !== undefined || r.constats ? 'consigne_absente' : 'rien_lu' };
    const lu = { esquisse: r.esquisse ?? null, echelle: r.echelle || null, surface: r.surface || null, facade: r.facade || null, profondeur: r.profondeur || null, forme: r.forme || null,
      cotes: r.cotes, nord: r.nord || null, acces: r.acces || null, constructions: r.constructions || null, remarques: r.remarques || [], fichier: String(f.name || '').slice(0, 120), photoId, le: new Date().toISOString() };
    await changer(w => {
      let x = M.modifier(w, 'terrain.plan', lu);
      // jamais d'écrasement : les valeurs lues ne remplissent que les cases vides
      if (lu.surface && !M.valeur(x, 'terrain.surface')) x = M.modifier(x, 'terrain.surface', lu.surface);
      if (lu.facade && !M.valeur(x, 'terrain.facade')) x = M.modifier(x, 'terrain.facade', lu.facade);
      if (lu.forme && !M.valeur(x, 'terrain.forme')) x = M.modifier(x, 'terrain.forme', lu.forme);
      return x;
    });
    S.planTerrain = null; vibrer(); redessiner();
  } catch (e) {
    const code = (e && e.code) || 'reseau';
    dire(code === 'pdf_lourd' ? 'Ce PDF est trop lourd (plus de 4 Mo) : photographiez le plan, ou exportez-le en image.'
      : code === 'rien_lu' ? 'Aucune cote ni surface lisible : reprenez la photo bien à plat, nette, cotes lisibles.' : messageDecrire(e, 'plan'));
  }
}
function blocPlanTerrain(v) {
  const lu = M.valeur(v, 'terrain.plan'), st = S.planTerrain || {}, inf = M.valeur(v, 'terrain.infos') || {};
  const ph = lu && lu.photoId && v.photos[lu.photoId] && !v.photos[lu.photoId].supprime ? v.photos[lu.photoId] : null;
  const analyse = lu ? T.analyserPlanTerrain(lu, { contenance: inf.parcelle && inf.parcelle.contenance, surfaceSaisie: M.valeur(v, 'terrain.surface'), facadeSaisie: M.valeur(v, 'terrain.facade') }) : [];
  const reprendre = (cle, val, lib) => val != null && M.valeur(v, cle) !== val ? h('button', { class: 'puce', type: 'button', 'data-reprendre': cle, onclick: async () => { await poser(cle, val); redessiner(); } }, 'Utiliser ' + lib) : null;
  return h('div', { class: 'carte', id: 'planTerrain', style: 'margin-top:12px' },
    h('b', {}, '🗺 Plan du terrain'),
    h('p', { class: 'mut petit', style: 'margin:4px 0 8px' }, 'Plan de géomètre, de bornage, de lotissement, ou esquisse cotée à la main : l’IA relève les cotes, le relevé vérifie leur cohérence.'),
    h('button', { class: 'gros sec', type: 'button', id: 'importerPlanTerrain', disabled: !!st.encours, onclick: () => choisirFichier({ accept: 'image/*,application/pdf' }, ([f]) => lirePlanTerrain(f)) },
      st.encours ? '🗺 Lecture du plan… (jusqu’à une minute)' : lu ? '🗺 Lire un autre plan du terrain' : '🗺 Plan du terrain (photo, PDF, esquisse cotée)'),
    st.message ? h('div', { class: 'message ' + st.type, id: 'infoPlanTerrain' }, st.message) : null,
    lu ? h('div', { id: 'planTerrainLu', style: 'margin-top:10px' },
      ph ? h('details', {}, h('summary', {}, 'Voir le plan'), imagePhoto(ph, 'imagePlanOrigine')) : null,
      h('div', { class: 'ligneTerrain' }, h('b', {}, lu.esquisse ? 'Esquisse cotée' : lu.esquisse === false ? 'Plan à l’échelle' : 'Plan'), lu.echelle ? ' · ' + lu.echelle : '',
        lu.surface ? ' · surface écrite ' + lu.surface.toLocaleString('fr-FR') + ' m²' : '', lu.facade ? ' · façade ' + String(lu.facade).replace('.', ',') + ' m' : '', lu.forme ? ' · ' + lu.forme.toLowerCase() : ''),
      lu.cotes.length ? h('div', { class: 'ligneTerrain' }, h('b', {}, 'Cotes '), lu.cotes.map(c => (c.cote ? c.cote + ' ' : '') + String(c.longueur).replace('.', ',') + ' m').join(' · ')) : null,
      lu.nord || lu.acces || lu.constructions ? h('div', { class: 'mut petit' }, [lu.nord ? 'Nord ' + lu.nord : '', lu.acces ? 'Accès : ' + lu.acces : '', lu.constructions ? 'Existant : ' + lu.constructions : ''].filter(Boolean).join(' · ')) : null,
      lu.remarques.length ? h('ul', { class: 'listeTerrain' }, lu.remarques.map(x => h('li', {}, x))) : null,
      analyse.length ? h('div', { class: 'pointsAttention', id: 'analysePlanTerrain' }, h('b', {}, 'Analyse du plan'),
        analyse.map(x => h('div', { class: 'point ' + (x.niveau === 'important' ? 'important' : x.niveau) }, x.texte))) : null,
      h('div', { class: 'puces', style: 'margin-top:8px' },
        reprendre('terrain.surface', lu.surface, 'la surface du plan (' + (lu.surface || '') + ' m²)'),
        reprendre('terrain.facade', lu.facade, 'la façade du plan (' + String(lu.facade || '').replace('.', ',') + ' m)'),
        reprendre('terrain.forme', lu.forme, 'la forme (' + (lu.forme || '').toLowerCase() + ')'))) : null);
}
function etapeTerrain(v) {
  const nature = M.natureDe(v), idem = M.valeur(v, 'terrain.adresseIdem') ?? nature === 'agrandissement';
  const st = S.terrainEtat || {};
  const toutes = M.actifs(v.photos), photos = toutes.filter(x => x.role === 'terrain');
  const imagines = src => toutes.filter(x => x.role === 'imagine' && x.source === src);
  const sujet = { id: null, nom: 'Terrain', mode: 'terrain' };
  const prendre = () => choisirFichier({ accept: 'image/*', capture: true }, f => ajouterPhotos(f, { role: 'terrain' }));
  return [
    h('h1', {}, 'Le terrain'),
    caseACocher(v, 'terrain.adresseIdem', 'Même adresse que les travaux (fiche client)', { defaut: nature === 'agrandissement', apres: redessiner }),
    idem ? h('div', { class: 'mut petit' }, [M.valeur(v, 'client.adresse'), M.valeur(v, 'client.codePostal'), M.valeur(v, 'client.ville')].filter(Boolean).join(' ') || 'Adresse non saisie à l’étape Client.')
      : [champ(v, 'terrain.adresse', 'ADRESSE DU TERRAIN (OU LIEU-DIT)', { autocapitalize: 'sentences' }),
        h('div', { class: 'deuxCol' }, champ(v, 'terrain.codePostal', 'CODE POSTAL', { inputmode: 'numeric' }), champ(v, 'terrain.ville', 'COMMUNE', { autocapitalize: 'words' }))],
    h('div', { class: 'rang', style: 'margin-top:10px' },
      h('button', { class: 'gros', type: 'button', id: 'localiserAdresse', disabled: !!st.encours, onclick: () => localiserTerrain('adresse') }, st.encours ? '⏳ Recherche…' : '📍 Localiser par l’adresse'),
      h('button', { class: 'gros sec', type: 'button', id: 'localiserGps', disabled: !!st.encours, onclick: () => localiserTerrain('gps') }, '🛰 Je suis sur le terrain')),
    st.message ? h('div', { class: 'message ' + st.type, id: 'infoTerrain' }, st.message) : null,
    blocInfosTerrain(v),
    blocPlanTerrain(v),
    h('h2', { style: 'margin-top:16px' }, 'Sur place'),
    h('div', { class: 'deuxCol' },
      champ(v, 'terrain.surface', 'SURFACE DU TERRAIN (m²)', { inputmode: 'numeric' }),
      champ(v, 'terrain.facade', 'FAÇADE SUR RUE (m)', { inputmode: 'numeric' })),
    h('div', { class: 'champ' }, 'FORME'), puces(v, 'terrain.forme', T.FORMES),
    h('div', { class: 'champ' }, 'PENTE'), puces(v, 'terrain.pente', T.PENTES),
    h('div', { class: 'champ' }, 'ORIENTATION DU JARDIN'), puces(v, 'terrain.orientation', T.ORIENTATIONS),
    h('div', { class: 'champ' }, 'ACCÈS'), puces(v, 'terrain.acces', T.ACCES),
    h('div', { class: 'champ' }, 'EN LOTISSEMENT'), puces(v, 'terrain.lotissement', T.OUI_NON, { apres: redessiner }),
    M.valeur(v, 'terrain.lotissement') === 'Oui' ? h('div', { class: 'message att petit' }, 'Demander le règlement et le cahier des charges du lotissement : ils s’ajoutent au PLU.') : null,
    h('h2', { style: 'margin-top:16px' }, 'Viabilisation'),
    T.RESEAUX.map(([k, lib]) => [h('div', { class: 'champ' }, lib.toUpperCase()), puces(v, 'terrain.reseau.' + k, T.ETATS_RESEAU)]),
    h('div', { class: 'champ' }, 'TYPE D’ASSAINISSEMENT'), puces(v, 'terrain.assainissement', T.ASSAINISSEMENTS),
    h('h2', { style: 'margin-top:16px' }, 'À savoir'),
    h('div', { class: 'champ' }, 'BORNAGE FAIT'), puces(v, 'terrain.bornage', T.OUI_NON),
    h('div', { class: 'champ' }, 'ÉTUDE DE SOL FAITE'), puces(v, 'terrain.etudeSol', T.OUI_NON),
    h('div', { class: 'champ' }, 'DÉMOLITION OU ABATTAGE À PRÉVOIR'), puces(v, 'terrain.demolition', T.OUI_NON),
    champ(v, 'terrain.notes', 'NOTES SUR LE TERRAIN', { multiligne: true, autocapitalize: 'sentences', micro: true, placeholder: 'Voisinage, vues, arbres, haies, servitudes de passage, accès chantier…' }),
    h('h2', { style: 'margin-top:16px' }, 'Photos du terrain'),
    photos.length ? h('div', { class: 'photosTerrain' }, photos.map(ph => h('figure', {}, imagePhoto(ph),
      h('button', { class: 'x', type: 'button', 'aria-label': 'Supprimer la photo', onclick: async () => { const lies = imagines(ph.id); if (!confirm(lies.length ? 'Supprimer cette photo et ses ' + lies.length + ' image(s) imaginée(s) ?' : 'Supprimer cette photo ?')) return;
        await changer(x => lies.reduce((w, im) => M.supprimer(w, 'photos', im.id), M.supprimer(x, 'photos', ph.id))); dessiner(); } }, '×'),
      ph.imaginerEnAttente ? h('div', { class: 'enAttenteImaginer petit' }, '⏳ En attente du réseau') : null,
      S.imaginer && S.imaginer.photoId === ph.id ? null : h('button', { class: 'puce imaginer imaginerTerrain', type: 'button', 'data-photo-terrain': ph.id, onclick: () => { S.imaginer = { photoId: ph.id, consigne: '' }; redessiner(); } }, '✨ Imaginer la maison')))) : null,
    photos.map(ph => [
      imagines(ph.id).map(im => h('div', { class: 'imagine', 'data-imagine': im.id },
        h('figure', {}, imagePhoto(im, 'imagineImg'), h('span', { class: 'badgeImagine' }, '✨ Imaginé'),
          h('button', { class: 'x', type: 'button', 'aria-label': 'Supprimer l’image imaginée', onclick: async () => { if (!confirm('Supprimer cette image imaginée ?')) return; await changer(x => M.supprimer(x, 'photos', im.id)); dessiner(); } }, '×')),
        h('div', { class: 'mut petit' }, '« ' + (im.consigne || im.legende || '') + ' »'))),
      S.imaginer && S.imaginer.photoId === ph.id ? panneauImaginer(sujet, ph) : null]),
    h('div', { class: 'rang', style: 'margin-top:8px' },
      h('button', { class: 'gros sec', type: 'button', id: 'photoTerrain', onclick: prendre }, '📷 Photo'),
      h('button', { class: 'gros sec', type: 'button', onclick: () => choisirFichier({ accept: 'image/*', multiple: true }, f => ajouterPhotos(f, { role: 'terrain' })) }, '🖼 Galerie')),
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
/* la création d'une image, pour n'importe quelle visite de l'appareil
   (appel direct ou file d'attente) : rend { nom de pièce, restant } ou
   lance { code } */
/* l'appel à la fonction du serveur : sa réponse, ou lance { code, limite, manque, message } */
async function appelerFonction(body) {
  const { data, error } = await supa.functions.invoke('imaginer', { body });
  if (error) {
    let j = {}; try { j = await error.context.json(); } catch (e) { /* pas de corps lisible */ }
    const st = error.context && error.context.status;
    throw { code: j.erreur || (st === 404 ? 'non_configure' : st ? 'erreur_' + st : 'reseau'), limite: j.limite, message: j.message, manque: j.manque };
  }
  return data;
}
/* la photo elle-même : sur l'appareil, sinon depuis l'espace privé */
async function blobPhoto(ph) {
  let blob = await stock.lirePhoto(ph.id);
  if (!blob && ph.chemin) { const u = await urlPhoto(ph.id, ph.chemin); if (u) blob = await (await fetch(u)).blob(); }
  if (!blob) throw { code: 'photo' };
  return blob;
}
async function creerImageImaginee(visiteId, pieceId, photoId, consigne) {
  const rec = S.visites.find(r => r.id === visiteId), v = rec && rec.visite;
  const ph = v && v.photos[photoId], p = (v && v.pieces[pieceId]) || (ph && sujetImaginer(ph));
  if (!ph || ph.supprime || !p) throw { code: 'photo' };
  const blob = await blobPhoto(ph);
  const data = await appelerFonction({ image: await enBase64(blob), mime: blob.type || 'image/jpeg', consigne, piece: p.nom, mode: p.mode || 'piece' });
  if (!data || !data.image) throw { code: 'aucune_image' };
  const id = M.nouvelId();
  await stock.garderPhoto(id, visiteId, versBlob(data.image, data.mime));
  await changerVisite(visiteId, w => { let x = M.majElement(M.ajouterPhoto(w, { id, role: 'imagine', pieceId, legende: consigne }), 'photos', id,
    { source: photoId, consigne, modele: data.modele || '', creeLe: new Date().toISOString() });
    return x.photos[photoId] && x.photos[photoId].imaginerEnAttente ? M.majElement(x, 'photos', photoId, { imaginerEnAttente: null }) : x; });
  return { piece: p.nom, restant: data.restant };
}
const messageErreurImaginer = e => { const code = (e && e.code) || 'reseau';
  return code === 'quota' ? 'Limite du jour atteinte (' + (e.limite || '') + ' images par personne) : réessayez demain.'
    : code === 'photo' ? 'La photo d’origine n’est pas lisible sur cet appareil (pas encore téléchargée ?).'
    : code === 'reseau' ? 'Pas de réponse du serveur : réseau coupé, fonction « imaginer » absente, ou « Verify JWT » encore actif (voir supabase/functions/imaginer/README.md).'
    : code === 'non_configure' && e.manque && e.manque.length ? 'Imaginer : réglage à ajouter dans les secrets Supabase : ' + e.manque.join(', ') + '.'
    : MESSAGES_IMAGINER[code] || 'La création a échoué (' + code + (e && e.message ? ' : ' + e.message : '') + ').'; };

/* ---------- « Imaginer » sans réseau : la file d'attente ----------
   Sans réseau (ou sans réponse), la demande est gardée sur la photo
   (imaginerEnAttente : consigne, date, appareil) ; elle part toute seule au
   retour du réseau, après chaque synchronisation. Seul l'appareil qui l'a
   faite la traite (pas de double image si la visite est ouverte ailleurs). */
const APPAREIL = (() => { try { let a = localStorage.getItem('cp-releve-appareil'); if (!a) { a = M.nouvelId(); localStorage.setItem('cp-releve-appareil', a); } return a; } catch (e) { return 'appareil'; } })();
/* une photo hors pièce : le terrain (la maison neuve dessus) ou la façade (l'agrandissement) */
function sujetImaginer(ph) {
  if (ph.role === 'terrain') return { id: null, nom: 'Terrain', mode: 'terrain' };
  if (ph.role === 'garde') return { id: null, nom: 'Façade', mode: 'facade' };
  return null;
}
async function mettreEnAttenteImaginer(pieceId, photoId, consigne) {
  await changer(w => M.majElement(w, 'photos', photoId, { imaginerEnAttente: { consigne, pieceId, demandeLe: new Date().toISOString(), appareil: APPAREIL } }));
}
let fileImaginerEnCours = false;
async function traiterFileImaginer() {
  if (fileImaginerEnCours || navigator.onLine === false || !S.session || !supa.functions || !supa.functions.invoke) return;
  fileImaginerEnCours = true; let faites = 0;
  try {
    for (const rec of [...S.visites]) for (const ph of M.actifs(rec.visite.photos)) {
      const a = ph.imaginerEnAttente;
      if (!a || a.appareil !== APPAREIL) continue;
      try { await creerImageImaginee(rec.id, a.pieceId || ph.pieceId, ph.id, a.consigne); faites++; }
      catch (e) {
        if (e && (e.code === 'reseau' || e.code === 'google_occupe')) return;            // encore sans réseau : on réessaiera
        await changerVisite(rec.id, w => M.majElement(w, 'photos', ph.id, { imaginerEnAttente: null, imaginerErreur: messageErreurImaginer(e) }));
      }
    }
  } finally {
    fileImaginerEnCours = false;
    if (faites) { if (S.ecran === 'visite' || S.ecran === 'accueil') { S.message = { type: 'ok', texte: '✨ ' + faites + ' image' + (faites > 1 ? 's' : '') + ' imaginée' + (faites > 1 ? 's' : '') + ' au retour du réseau.' }; redessiner(); } }
  }
}
window.addEventListener('online', () => setTimeout(traiterFileImaginer, 1500));

async function lancerImaginer(p, ph, consigne, btn, info) {
  consigne = consigne.trim();
  const dire = (t, type) => { info.textContent = t; info.className = 'message ' + (type || 'err'); };
  if (consigne.length < 3) return dire(MESSAGES_IMAGINER.consigne_absente, 'att');
  const enAttente = async () => {
    await mettreEnAttenteImaginer(p.id, ph.id, consigne);
    if (S.imaginer && S.imaginer.photoId === ph.id) S.imaginer = null;
    S.message = { type: 'att', texte: '⏳ Pas de réseau : la demande « ' + consigne + ' » est gardée. L’image sera créée toute seule au retour du réseau.' };
    vibrer(); redessiner();
  };
  if (navigator.onLine === false) return enAttente();
  if (!S.session) return dire('Connectez-vous (même compte que le suivi) pour utiliser Imaginer.', 'att');
  if (!supa.functions || !supa.functions.invoke) return dire(MESSAGES_IMAGINER.non_configure, 'att');
  const texte = btn.textContent; btn.disabled = true; btn.textContent = '✨ Création en cours… (jusqu’à une minute)';
  dire('L’image est en cours de création. Vous pouvez continuer la visite : elle arrivera ici.', 'att');
  try {
    const r = await creerImageImaginee(S.courante, p.id, ph.id, consigne);
    if (S.imaginer && S.imaginer.photoId === ph.id) S.imaginer = null;
    S.message = { type: 'ok', texte: '✨ Image créée pour « ' + r.piece + ' »' + (r.restant != null ? ' (encore ' + r.restant + ' aujourd’hui).' : '.') };
    vibrer(); dessiner();
  } catch (e) {
    btn.disabled = false; btn.textContent = texte;
    if (e && e.code === 'reseau' && navigator.onLine === false) return enAttente();
    dire(messageErreurImaginer(e));
  }
}

/* ---------- « 🔍 Décrire » : Gemini regarde la photo ----------
   Une légende courte (posée seulement si la légende est vide : jamais
   d'écrasement) et quelques constats utiles au chiffrage, gardés sur la photo
   (champ « description », interne : jamais dans le dossier client). Les
   constats s'ajoutent aux notes de la pièce d'un geste. */
const messageDecrire = (e, quoi) => { const code = (e && e.code) || 'reseau';
  return code === 'quota' ? 'Limite du jour atteinte (' + (e.limite || '') + ' lectures par personne) : réessayez demain.'
    : code === 'rien_lu' ? (quoi === 'note' ? 'Aucun texte lisible sur cette photo : reprenez-la de plus près, bien éclairée.' : 'Rien d’utile n’a été vu sur cette photo.')
    : code === 'consigne_absente' ? 'La fonction « imaginer » du serveur n’est pas à jour : redéployez-la (voir supabase/functions/imaginer/README.md).'
    : code === 'illisible' ? 'La réponse n’a pas pu être lue : réessayez.'
    : messageErreurImaginer(e); };
function pretPourIA(dire, quoi) {
  if (navigator.onLine === false) { dire(quoi + ' a besoin du réseau : réessayez une fois connecté.', 'att'); return false; }
  if (!S.session) { dire('Connectez-vous (même compte que le suivi) pour utiliser ' + quoi + '.', 'att'); return false; }
  if (!supa.functions || !supa.functions.invoke) { dire(MESSAGES_IMAGINER.non_configure, 'att'); return false; }
  return true;
}
async function decrirePhoto(p, ph, btn, info) {
  const dire = (t, type) => { info.textContent = t; info.className = 'infoDecrire message petit ' + (type || 'err'); };
  if (!pretPourIA(dire, 'Décrire')) return;
  const lib = btn.textContent; btn.disabled = true; btn.textContent = '🔍 Lecture de la photo…';
  try {
    const blob = await blobPhoto(ph);
    const r = await appelerFonction({ action: 'decrire', mode: 'photo', image: await enBase64(blob), mime: blob.type || 'image/jpeg', piece: p.nom }) || {};
    const constats = Array.isArray(r.constats) ? r.constats.filter(c => typeof c === 'string' && c.trim()).slice(0, 6) : [];
    const legende = typeof r.legende === 'string' ? r.legende.trim().slice(0, 140) : '';
    if (!legende && !constats.length) throw { code: 'rien_lu' };
    const vide = !String(ph.legende || '').trim();
    await changer(w => M.majElement(w, 'photos', ph.id, { ...(vide && legende ? { legende } : {}), description: { legende, constats, creeLe: new Date().toISOString() } }));
    redessiner();
  } catch (e) { btn.disabled = false; btn.textContent = lib; dire(messageDecrire(e, 'photo')); }
}
function blocDescription(p, ph) {
  const d = ph.description;
  if (!d || typeof d !== 'object') return null;
  const constats = Array.isArray(d.constats) ? d.constats : [];
  const autreLegende = d.legende && d.legende !== String(ph.legende || '').trim();
  return h('div', { class: 'descriptionIA petit', 'data-description': ph.id },
    h('b', {}, '🔍 Vu sur la photo'),
    autreLegende ? h('div', {}, 'Légende proposée : « ' + d.legende + ' » ',
      h('button', { class: 'lienRetour', type: 'button', onclick: async () => { await changer(w => M.majElement(w, 'photos', ph.id, { legende: d.legende })); redessiner(); } }, 'Utiliser')) : null,
    constats.length ? h('ul', {}, constats.map(c => h('li', {}, String(c)))) : null,
    h('div', { class: 'rang', style: 'margin-top:4px' },
      constats.length ? h('button', { class: 'puce', type: 'button', onclick: async () => {
        await changer(w => { const note = String((w.pieces[p.id] || {}).note || '').trimEnd();
          return M.majElement(M.majElement(w, 'pieces', p.id, { note: (note ? note + '\n' : '') + constats.map(c => '• ' + c).join('\n') }), 'photos', ph.id, { description: null }); });
        redessiner();
      } }, '+ Ajouter aux notes') : null,
      h('button', { class: 'puce', type: 'button', 'aria-label': 'Masquer ce qui a été vu sur la photo', onclick: async () => { await changer(w => M.majElement(w, 'photos', ph.id, { description: null })); redessiner(); } }, '✕')));
}

/* le panneau sous la photo : consigne (avec dictée), puis « Créer l'image » */
/* la consigne de la maison, tirée de l'étape Projet (construction) */
function consigneProjet(v) {
  const niv = M.valeur(v, 'construction.niveaux') || [], g = M.valeur(v, 'construction.garage');
  return ['Maison ' + (niv.length ? niv.join(' et ').toLowerCase() : 'individuelle') + (M.valeur(v, 'construction.surface') ? ' d’environ ' + M.valeur(v, 'construction.surface') + ' m²' : ''),
    g && g !== 'Aucun' ? 'garage ' + g.toLowerCase() : null, M.valeur(v, 'projet.souhaits')].filter(Boolean).join(', ');
}
function panneauImaginer(p, ph) {
  const st = S.imaginer;
  let info;
  const terrain = p.mode === 'terrain', facade = p.mode === 'facade';
  const ta = h('textarea', { class: 'in', rows: 3, value: st.consigne || '', 'aria-label': terrain ? 'Consigne pour imaginer la maison' : 'Consigne pour imaginer la pièce', autocapitalize: 'sentences',
    placeholder: terrain ? 'Ex. : maison plain-pied contemporaine, enduit blanc, toit deux pans ardoise, garage accolé à gauche'
      : facade ? 'Ex. : extension plain-pied à droite, toit plat, bardage bois, grande baie vitrée' : 'Ex. : cuisine blanche, plan de travail bois, carrelage gris clair, suspensions noires',
    oninput: e => { st.consigne = e.target.value; } });
  const aide = h('div', { class: 'aide info' });
  const btn = h('button', { class: 'gros', type: 'button', onclick: () => lancerImaginer(p, ph, ta.value, btn, info) }, '✨ Créer l’image');
  return h('div', { class: 'carte panneauImaginer', 'data-imaginer': ph.id },
    h('b', {}, terrain ? '✨ Imaginer la maison sur ce terrain' : facade ? '✨ Imaginer l’agrandissement' : '✨ Imaginer cette pièce rénovée'),
    h('div', { class: 'champMicro' }, ta, boutonMicro(ta, aide), aide),
    terrain && !st.consigne ? h('button', { class: 'puce', type: 'button', style: 'margin-top:8px', id: 'reprendreProjet', onclick: () => { ta.value = st.consigne = consigneProjet(visite()); } }, 'Reprendre le projet') : null,
    M.valeur(visite(), 'projet.souhaits') && !st.consigne && !terrain ? h('button', { class: 'puce', type: 'button', style: 'margin-top:8px', onclick: () => { ta.value = st.consigne = M.valeur(visite(), 'projet.souhaits'); } }, 'Reprendre les souhaits du client') : null,
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
          ph.imaginerEnAttente ? h('div', { class: 'enAttenteImaginer petit', 'data-attente': ph.id }, '⏳ Imaginer en attente du réseau : « ' + ph.imaginerEnAttente.consigne + ' » ',
            h('button', { class: 'lienRetour', type: 'button', onclick: async () => { await changer(w => M.majElement(w, 'photos', ph.id, { imaginerEnAttente: null })); redessiner(); } }, '✕ annuler')) : null,
          ph.imaginerErreur ? h('div', { class: 'message err petit' }, ph.imaginerErreur, ' ',
            h('button', { class: 'lienRetour', type: 'button', onclick: async () => { await changer(w => M.majElement(w, 'photos', ph.id, { imaginerErreur: null })); redessiner(); } }, '✕')) : null,
          blocDescription(p, ph),
          (() => { const info = h('div', { role: 'status', class: 'infoDecrire' });
            const bd = h('button', { class: 'puce decrire', type: 'button', 'aria-label': 'Décrire la photo ' + (i + 1), onclick: () => decrirePhoto(p, ph, bd, info) }, '🔍 Décrire');
            return [h('div', { class: 'puces', style: 'margin-top:6px' }, ph.description ? null : bd,
              S.imaginer && S.imaginer.photoId === ph.id ? null
                : h('button', { class: 'puce imaginer', type: 'button', 'aria-label': 'Imaginer la photo ' + (i + 1) + ' rénovée',
                    onclick: () => { S.imaginer = { photoId: ph.id, consigne: '' }; dessiner(); } }, '✨ Imaginer')), info]; })())),
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

/* le plan et sa copie annotée, côte à côte (l'un sous l'autre sur iPhone) */
function blocAnnotations(v) {
  const fonds = fondsAnnotation(v), a = annotationsDe(v), annote = a.fondId && v.photos[a.fondId];
  if (!fonds.length && !annote) return null;
  const pi = M.valeur(v, 'planImage'), imgPlan = pi && v.photos[pi.id] ? v.photos[pi.id] : fonds[0] && fonds[0].photo;
  const imgAnnote = a.imageId && v.photos[a.imageId] ? v.photos[a.imageId] : annote ? v.photos[a.fondId] : null;
  return h('div', { class: 'carte', id: 'blocAnnotations' },
    h('b', {}, '🖍 Plan annoté (travaux)'),
    h('div', { class: 'duoPlans' },
      imgPlan ? h('figure', {}, imagePhoto(imgPlan, 'vignettePlan'), h('figcaption', { class: 'mut petit' }, 'Plan')) : null,
      imgAnnote ? h('figure', {}, imagePhoto(imgAnnote, 'vignettePlan'), h('figcaption', { class: 'mut petit', id: 'resumeAnnot' }, 'Copie annotée · ' + AN.resume(a.elements))) : null),
    annote ? h('button', { class: 'gros sec', type: 'button', id: 'annoterPlan', style: 'margin-top:8px', onclick: () => { S.ecran = 'annoter'; S.message = null; dessiner(); window.scrollTo(0, 0); } }, '🖍 Continuer les annotations')
      : fonds.map(f => h('button', { class: 'gros sec', type: 'button', style: 'margin-top:8px', 'data-fond': f.source, id: f === fonds[0] ? 'annoterPlan' : null, onclick: () => commencerAnnotations(f) }, '🖍 Annoter une copie ' + f.libelle)),
    h('p', { class: 'mut petit', style: 'margin:6px 0 0' }, 'Notez les travaux sur une copie : démolition, ouvertures, isolation… Le plan lui-même ne change pas.'));
}

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
  const neuf = M.natureDe(v) === 'construction';
  return [
    h('h1', {}, neuf ? 'Le plan de la maison' : 'Le scan et le plan'),
    neuf ? h('p', { class: 'mut' }, 'Le plan de la future maison : esquisse du client, plan de constructeur ou d’architecte, en photo ou en PDF. L’IA relève les pièces, vous les vérifiez dans le dessin rapide, puis « ✓ Créer le plan » donne le plan coté et la vue 3D. Vous pouvez aussi dessiner les pièces directement.')
      : h('p', { class: 'mut' }, 'Dans OpenPlan 3D : « Export Editable Plan (JSON) », puis importez le fichier ici. Le plan s’ouvre aussitôt : mesures, murs, ouvertures, avant/après, 3D, PDF.'),
    scan ? h('div', { class: 'carte' }, h('b', {}, '📄 ' + scan.nom), h('div', { class: 'mut petit' }, Math.round((scan.taille || 0) / 1024) + ' Ko · importé le ' + dateCourte(scan.importeLe))) : null,
    plan ? h('div', { class: 'carte', id: 'resumePlan' }, h('b', {}, '📐 Plan'), h('div', { class: 'mut petit' }, resumePlan(plan.resume))) : null,
    blocAnnotations(v),
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
    // en construction, pas de maison à scanner : le bouton du scan ne vient que s'il y en a déjà un
    neuf && !scan ? null : h('div', { style: 'margin-top:10px' }, h('button', { class: scan || plan ? 'gros sec' : 'gros', id: 'importerScan', onclick: importer }, scan ? 'Remplacer le scan' : '📐 Importer le scan')),
    // sans scan LiDAR : des pièces rectangulaires posées au doigt (dessin.js), puis le même moteur de plan
    h('div', { style: 'margin-top:10px' }, h('button', { class: 'gros sec', id: 'dessinRapide', onclick: () => { S.ecran = 'dessin'; S.dessinSel = null; S.message = null; dessiner(); window.scrollTo(0, 0); } },
      M.valeur(v, 'dessin') ? '✏️ Reprendre le dessin rapide' : '✏️ Dessin rapide (sans scan)')),
    h('p', { class: 'mut petit' }, 'Pas de scan ? Posez les pièces une à une (longueur × largeur, à côté de la précédente). Ensuite, dans le plan, touchez une cote pour taper la vraie longueur.'),
    // un plan 2D existant (magicplan, architecte, photo d'un plan papier) : l'IA en relève les pièces
    h('div', { style: 'margin-top:10px' }, h('button', { class: 'gros sec', id: 'importerPlan2D', disabled: !!(S.lecturePlan && S.lecturePlan.encours),
      onclick: () => choisirFichier({ accept: 'image/*,application/pdf', multiple: true }, fs => lirePlan2D(fs)) },
      S.lecturePlan && S.lecturePlan.encours ? '🖼 Lecture du plan' + (S.lecturePlan.rang ? ' ' + S.lecturePlan.rang : '') + '… (jusqu’à une minute)' : '🖼 Plan 2D ou esquisses (photo, image, PDF)')),
    S.lecturePlan && S.lecturePlan.message ? h('div', { class: 'message ' + S.lecturePlan.type, id: 'infoPlan2D' }, S.lecturePlan.message) : null,
    S.lecturePlan && S.lecturePlan.parties ? h('div', { class: 'carte', id: 'partiesPlan' },
      h('b', {}, '🖼 Plusieurs plans sur « ' + S.lecturePlan.nom + ' » : lequel dessiner ?'),
      S.lecturePlan.parties.map(p => h('button', { class: 'gros sec', type: 'button', style: 'margin-top:8px', 'data-partie': p.nom, onclick: () => appliquerPartiePlan(p, S.lecturePlan.nom) },
        p.nom + ' — ' + p.pieces.length + ' pièce' + (p.pieces.length > 1 ? 's' : '') + ', ' + String(Math.round(p.pieces.reduce((t, q) => t + q.longueur * q.largeur, 0))) + ' m²')),
      h('button', { class: 'lienRetour', type: 'button', style: 'margin-top:8px', onclick: () => { S.lecturePlan = null; redessiner(); } }, 'Annuler')) : null,
    S.lecturePlan && S.lecturePlan.choix ? h('div', { class: 'carte', id: 'choixPlacement' },
      h('b', {}, '🖼 ' + S.lecturePlan.choix.reduce((t, g) => t + g.partie.pieces.length, 0) + ' pièce(s) lue(s). Un dessin rapide existe déjà (' + ((M.valeur(v, 'dessin') || {}).pieces || []).length + ' pièces) :'),
      h('button', { class: 'gros', type: 'button', id: 'ajouterAuDessin', style: 'margin-top:8px', onclick: () => appliquerGroupes(S.lecturePlan.choix, 'ajouter', S.lecturePlan.echecs) }, '＋ Ajouter au dessin'),
      h('button', { class: 'gros sec', type: 'button', id: 'remplacerDessin', style: 'margin-top:8px', onclick: () => { if (confirm('Remplacer tout le dessin rapide par les pièces lues ?')) appliquerGroupes(S.lecturePlan.choix, 'remplacer', S.lecturePlan.echecs); } }, 'Remplacer le dessin'),
      h('button', { class: 'lienRetour', type: 'button', style: 'margin-top:8px', onclick: () => { S.lecturePlan = null; redessiner(); } }, 'Annuler')) : null,
    h('p', { class: 'mut petit' }, 'Un plan déjà fait (export magicplan, plan d’architecte) ou des esquisses à la main — une par pièce si vous voulez, plusieurs d’un coup : l’IA relève les pièces et leurs dimensions, elles s’ajoutent au dessin rapide, vous vérifiez et les placez. Un plan se glisse aussi dans le plan.'),
  ];
}

/* ---------- un plan 2D (photo, image ou PDF) lu par l'IA ----------
   magicplan, plan d'architecte, croquis, photo d'un plan papier : la
   fonction « imaginer » (action decrire, mode plan) en relève les pièces,
   partie par partie ; le relevé en tire un dessin rapide (dessin.js) que le
   métreur vérifie avant « ✓ Créer le plan ». L'image du plan est gardée
   avec la visite (photo « planPapier »). Un dessin existant n'est remplacé
   qu'après accord. */
const PDF_MAX = 4_400_000;                       // un PDF de plan, envoyé tel quel (≈ 6 Mo en base64)
const estPlan2D = f => !!f && (/^image\//.test(f.type || '') || f.type === 'application/pdf' || /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(f.name || ''));
/* lit un ou plusieurs plans (une esquisse par pièce, par exemple) ; les
   pièces lues s'ajoutent au dessin ou le remplacent, au choix */
async function lirePlan2D(fichiers) {
  const liste = (Array.isArray(fichiers) ? fichiers : [fichiers]).filter(Boolean).slice(0, 12);
  const v = visite(); if (!v || !liste.length) return;
  const dire = (t, type) => { S.lecturePlan = { message: t, type: type || 'err' }; redessiner(); };
  if (!pretPourIA(dire, 'La lecture du plan')) return;
  const lus = [], echecs = [];
  for (let k = 0; k < liste.length; k++) {
    const f = liste[k], pdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
    S.lecturePlan = { encours: true, nom: f.name || 'plan', rang: liste.length > 1 ? (k + 1) + ' / ' + liste.length : '' }; redessiner();
    try {
      let blob = f;
      if (pdf) { if (f.size > PDF_MAX) throw { code: 'pdf_lourd' }; }
      else {
        blob = await reduirePhoto(f, 2400);          // assez fin pour lire les cotes d'un plan
        const id = M.nouvelId();
        await stock.garderPhoto(id, S.courante, blob);
        await changer(w => M.majElement(M.ajouterPhoto(w, { id, role: 'planPapier', legende: f.name || 'Plan 2D' }), 'photos', id, { importeLe: new Date().toISOString() }));
      }
      const r = await appelerFonction({ action: 'decrire', mode: 'plan', image: await enBase64(blob), mime: pdf ? 'application/pdf' : 'image/jpeg' }) || {};
      if (!Array.isArray(r.parties)) throw { code: r.legende !== undefined || r.constats ? 'consigne_absente' : 'rien_lu' };
      const parties = r.parties.filter(p => p && Array.isArray(p.pieces) && p.pieces.length);
      if (!parties.length) throw { code: 'rien_lu' };
      lus.push({ nom: f.name || 'plan', parties });
    } catch (e) {
      const code = (e && e.code) || 'reseau';
      const texte = code === 'pdf_lourd' ? 'ce PDF est trop lourd (plus de 4 Mo) : exportez la page du plan en image (JPG), ou photographiez-la.'
        : code === 'rien_lu' ? 'aucune pièce lisible. Essayez une image plus nette, bien cadrée.'
        : messageDecrire(e, 'plan');
      if (code === 'consigne_absente' || code === 'quota' || code === 'non_configure') return dire(texte);   // inutile d'essayer les suivants
      echecs.push((f.name || 'plan') + ' : ' + texte);
    }
  }
  if (!lus.length) return dire(echecs.join(' ') || 'Aucune pièce lisible.');
  // un seul plan, plusieurs parties (étages, état actuel / projet) : on choisit laquelle
  if (lus.length === 1 && lus[0].parties.length > 1) { S.lecturePlan = { parties: lus[0].parties, nom: lus[0].nom, echecs }; return redessiner(); }
  // plusieurs esquisses : la partie la plus fournie de chacune
  const groupes = lus.map(l => ({ nom: l.nom, partie: [...l.parties].sort((a, b) => b.pieces.length - a.pieces.length)[0] }));
  proposerPlacement(groupes, echecs);
}
/* un dessin existe déjà : ajouter les pièces lues, ou le remplacer (au choix) */
function proposerPlacement(groupes, echecs) {
  const avant = M.valeur(visite(), 'dessin');
  if (avant && Array.isArray(avant.pieces) && avant.pieces.length) { S.lecturePlan = { choix: groupes, echecs: echecs || [] }; return redessiner(); }
  appliquerGroupes(groupes, 'remplacer', echecs);
}
async function appliquerGroupes(groupes, mode, echecs) {
  // chaque esquisse donne son groupe de pièces ; un groupe ajouté se pose à droite du dessin
  // (sa première pièce sans voisine) : on la place ensuite contre la bonne pièce, au doigt
  const nouvelles = groupes.flatMap(g => DR.dessinDepuisRectangles(g.partie.pieces, () => M.nouvelId().slice(0, 8)));
  if (!nouvelles.length) { S.lecturePlan = { message: 'Aucune pièce exploitable sur ce plan.', type: 'err' }; return redessiner(); }
  const avant = M.valeur(visite(), 'dessin'), garde = mode === 'ajouter' && avant && Array.isArray(avant.pieces) ? avant.pieces : [];
  const sources = [...(mode === 'ajouter' && avant && Array.isArray(avant.sources) ? avant.sources : mode === 'ajouter' && avant && avant.source ? [avant.source] : []),
    ...groupes.map(g => ({ fichier: String(g.nom || '').slice(0, 120), partie: g.partie.nom, luLe: new Date().toISOString() }))].slice(-30);
  await poser('dessin', { pieces: [...garde, ...nouvelles].slice(0, 60), hauteur: (avant && avant.hauteur) || 2.5, source: sources[sources.length - 1], sources });
  const n = nouvelles.length, pl = n > 1 ? 's' : '';
  S.lecturePlan = null; S.dessinSel = null; S.ecran = 'dessin';
  S.message = { type: 'att', texte: '🖼 ' + n + ' pièce' + pl + ' lue' + pl + (groupes.length > 1 ? ' sur ' + groupes.length + ' esquisses' : ' sur le plan (« ' + groupes[0].partie.nom + ' »)') + (garde.length ? ', ajoutée' + pl + ' au dessin' : '') + '. '
    + (groupes.length > 1 || garde.length ? 'Touchez chaque pièce ajoutée pour la poser contre sa voisine (à droite, en dessous…). ' : '')
    + 'Vérifiez les dimensions (l’IA peut se tromper), puis « ✓ Créer le plan ».' + ((echecs || []).length ? ' Non lu : ' + echecs.join(' ') : '') };
  vibrer(); dessiner(); window.scrollTo(0, 0);
}
async function appliquerPartiePlan(partie, nomFichier) { proposerPlacement([{ nom: nomFichier, partie }], (S.lecturePlan && S.lecturePlan.echecs) || []); }

/* ---------- le plan annoté (travaux) : releve/annotations.js ----------
   Une copie du plan (plan dessiné, ou plan 2D importé), annotée au doigt :
   stylo de couleur, flèches, textes. Les annotations sont gardées en
   vecteurs avec la visite (« annotations ») ; l'image annotée (photo
   « planAnnote ») est refaite en quittant l'écran. */
function fondsAnnotation(v) {
  const res = [], pi = M.valeur(v, 'planImage');
  if (pi && v.photos[pi.id] && !v.photos[pi.id].supprime) res.push({ source: 'plan', photo: v.photos[pi.id], empreinte: pi.empreinte || null, libelle: 'du plan dessiné' });
  const pp = M.actifs(v.photos).filter(x => x.role === 'planPapier').sort((a, b) => String(b.importeLe || '').localeCompare(String(a.importeLe || '')))[0];
  if (pp) res.push({ source: 'planPapier', photo: pp, empreinte: pp.id, libelle: 'du plan importé' });
  return res;
}
const annotationsDe = v => AN.nettoyer(M.valeur(v, 'annotations'));
/* une copie du fond, à part : le plan peut changer, l'annotation garde le sien */
async function commencerAnnotations(fond) {
  const blob = await blobPhoto(fond.photo).catch(() => null);
  if (!blob) return montrerMessage('err', 'L’image du plan n’est pas lisible sur cet appareil (pas encore téléchargée ?). Réessayez avec le réseau.');
  const id = M.nouvelId(), avant = annotationsDe(visite());
  await stock.garderPhoto(id, S.courante, blob);
  await changer(w => {
    let x = M.ajouterPhoto(w, { id, role: 'fondAnnote' });
    if (avant.fondId && x.photos[avant.fondId]) x = M.supprimer(x, 'photos', avant.fondId);
    // repartir d'un plan à jour garde les annotations déjà faites (à vérifier)
    return M.modifier(x, 'annotations', { ...avant, fondId: id, source: fond.source, empreinte: fond.empreinte });
  });
  S.ecran = 'annoter'; S.message = null; dessiner(); window.scrollTo(0, 0);
}
async function exporterAnnotations(visiteId) {
  const rec = S.visites.find(r => r.id === visiteId); if (!rec) return;
  const a = AN.nettoyer(M.valeur(rec.visite, 'annotations')), sig = JSON.stringify([a.fondId, a.elements]);
  if (!a.fondId || sig === S.signatureAnnot) return;
  try {
    const fond = rec.visite.photos[a.fondId]; if (!fond) return;
    let id = null;
    if (a.elements.length) {
      const img = await imageDepuisBlob(await blobPhoto(fond));
      const W = Math.min(2000, img.naturalWidth), H = Math.round(img.naturalHeight * W / img.naturalWidth);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.drawImage(img, 0, 0, W, H); AN.rendre(c, W, H, a.elements);
      const blob = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.88)); if (!blob) return;
      id = M.nouvelId(); await stock.garderPhoto(id, visiteId, blob);
    }
    await changerVisite(visiteId, w => {
      const cur = AN.nettoyer(M.valeur(w, 'annotations'));
      let x = w;
      if (cur.imageId && x.photos[cur.imageId]) x = M.supprimer(x, 'photos', cur.imageId);
      if (id) x = M.ajouterPhoto(x, { id, role: 'planAnnote', legende: 'Plan annoté (travaux)' });
      return M.modifier(x, 'annotations', { ...cur, imageId: id });
    });
    S.signatureAnnot = sig;
    if (S.ecran === 'visite') redessiner();
  } catch (e) { /* l'image se refera à la prochaine sortie de l'écran */ }
}
const imageDepuisBlob = blob => new Promise((ok, ko) => { const u = URL.createObjectURL(blob), i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = u; });

function ecranAnnoter() {
  const v = visite();
  if (!v) { S.ecran = 'accueil'; return ecranAccueil(); }
  const a = annotationsDe(v);
  if (!a.fondId || !v.photos[a.fondId]) { S.ecran = 'visite'; return ecranVisite(); }
  const st = S.annot || (S.annot = { outil: 'trait', couleur: AN.COULEURS[0][0] });
  let elements = a.elements.slice(), img = null, enCours = null;
  const cv = h('canvas', { class: 'toileAnnot', id: 'toileAnnot', 'aria-label': 'Plan à annoter' });
  const peindre = () => { if (!img) return; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(img, 0, 0, cv.width, cv.height); AN.rendre(c, cv.width, cv.height, enCours ? [...elements, enCours] : elements); };
  const garder = () => changer(w => M.modifier(w, 'annotations', { ...AN.nettoyer(M.valeur(w, 'annotations')), elements }));
  const pos = e => { const r = cv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
  blobPhoto(v.photos[a.fondId]).then(imageDepuisBlob).then(i => { img = i; cv.width = Math.min(2000, i.naturalWidth); cv.height = Math.round(i.naturalHeight * cv.width / i.naturalWidth); peindre(); })
    .catch(() => montrerMessage('err', 'L’image du plan n’est pas lisible sur cet appareil.'));
  let depart = null;
  cv.addEventListener('pointerdown', e => { if (!img) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); depart = pos(e);
    enCours = st.outil === 'trait' ? { type: 'trait', c: st.couleur, p: [depart] } : st.outil === 'fleche' ? { type: 'fleche', c: st.couleur, a: depart, b: depart } : null; });
  cv.addEventListener('pointermove', e => { if (!enCours) return; e.preventDefault(); const q = pos(e);
    if (enCours.type === 'trait') enCours.p.push(q); else enCours.b = q; peindre(); });
  cv.addEventListener('pointerup', async e => {
    if (!depart) return; const q = pos(e), d = depart; depart = null;
    if (st.outil === 'texte') {
      const t = (window.prompt('Annotation (travaux, cote, remarque) — « / » pour aller à la ligne :') || '').trim();
      if (t) { elements.push({ type: 'texte', c: st.couleur, x: d[0], y: d[1], t }); }
    } else if (enCours) {
      const el = enCours.type === 'trait' ? { ...enCours, p: AN.simplifier(enCours.p) } : enCours;
      enCours = null;
      const propre = AN.nettoyer({ elements: [el] }).elements[0];
      if (propre) elements.push(propre);
    }
    enCours = null; peindre(); await garder(); majCompte();
  });
  cv.addEventListener('pointercancel', () => { enCours = null; depart = null; peindre(); });
  const compte = h('span', { class: 'mut petit', id: 'compteAnnot' });
  const majCompte = () => { compte.textContent = AN.resume(elements); };
  majCompte();
  // changer d'outil ou de couleur ne redessine pas l'écran (le plan resterait à recharger)
  const aideOutil = h('span', { class: 'mut petit', id: 'aideOutil' });
  const marquer = () => {
    document.querySelectorAll('[data-outil]').forEach(x => { const on = x.dataset.outil === st.outil; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    document.querySelectorAll('[data-couleur]').forEach(x => { const on = x.dataset.couleur === st.couleur; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    aideOutil.textContent = st.outil === 'texte' ? 'Touchez le plan à l’endroit du texte.' : st.outil === 'fleche' ? 'Tirez du départ vers la pointe.' : 'Dessinez au doigt sur le plan.';
  };
  marquer();
  const fonds = fondsAnnotation(v), aJour = fonds.find(f => f.source === a.source);
  const perime = aJour && a.empreinte && aJour.empreinte !== a.empreinte;
  const retour = () => { S.ecran = 'visite'; S.etape = Math.max(0, M.etapesDe(visite()).findIndex(x => x.id === 'scan')); dessiner(); window.scrollTo(0, 0); };
  return [
    h('header', { class: 'haut' }, h('button', { class: 'lienRetour', onclick: retour }, '‹ Visite'), h('span', { class: 'titre' }, 'Plan annoté'), pastilleEtat()),
    h('main', { class: 'ecranAnnot' },
      S.message && h('div', { class: 'message ' + S.message.type }, S.message.texte),
      perime ? h('div', { class: 'message att', id: 'planChange' }, 'Le plan a changé depuis le début des annotations. ',
        h('button', { class: 'lienRetour', type: 'button', onclick: () => commencerAnnotations(aJour) }, 'Repartir du plan à jour (les annotations sont gardées, à vérifier)')) : null,
      h('div', { class: 'puces barreAnnot', role: 'toolbar' },
        AN.OUTILS.map(([k, lib]) => h('button', { class: 'puce' + (st.outil === k ? ' on' : ''), type: 'button', 'data-outil': k, 'aria-pressed': String(st.outil === k), onclick: () => { st.outil = k; marquer(); } }, lib)),
        AN.COULEURS.map(([c, lib]) => h('button', { class: 'puce pastilleCouleur' + (st.couleur === c ? ' on' : ''), type: 'button', 'data-couleur': c, 'aria-label': 'Couleur ' + lib, 'aria-pressed': String(st.couleur === c), style: '--c:' + c, onclick: () => { st.couleur = c; marquer(); } }, '●')),
        h('button', { class: 'puce', type: 'button', id: 'annulerAnnot', onclick: async () => { elements.pop(); peindre(); await garder(); majCompte(); } }, '↶ Annuler'),
        h('button', { class: 'puce', type: 'button', id: 'effacerAnnot', onclick: async () => { if (!elements.length || !confirm('Effacer toutes les annotations de ce plan ?')) return; elements = []; peindre(); await garder(); majCompte(); } }, '🗑 Tout effacer')),
      h('div', { class: 'carte cadreAnnot' }, cv),
      h('div', { class: 'rang', style: 'justify-content:space-between;margin-top:6px' }, compte, aideOutil),
      h('button', { class: 'gros', type: 'button', id: 'terminerAnnot', style: 'margin-top:12px', onclick: retour }, '✓ Terminer')),
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
    else if (m.type === 'releve:plan2d' && m.fichier && estPlan2D(m.fichier)) {
      // une image ou un PDF glissé sur le plan : lu comme un plan 2D, depuis l'étape Scan
      // (hors de la file : fermerPlan attend un message du moteur qui passera par elle)
      const f = m.fichiers && m.fichiers.length ? m.fichiers.filter(estPlan2D) : [m.fichier];
      setTimeout(async () => { await fermerPlan(); S.etape = Math.max(0, M.etapesDe(visite()).findIndex(x => x.id === 'scan')); S.ecran = 'visite'; dessiner(); lirePlan2D(f); }, 0);
    }
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
      dd('Projet', (M.NATURES.find(n => n[0] === M.natureDe(v)) || [])[1]),
      dd(M.natureDe(v) === 'construction' ? 'Adresse' : 'Adresse des travaux', travaux),
      M.natureDe(v) === 'construction' ? [
        dd('Construction', [M.valeur(v, 'construction.prestation'), M.valeur(v, 'construction.surface') ? M.valeur(v, 'construction.surface') + ' m² habitables' : null,
          (M.valeur(v, 'construction.niveaux') || []).join(', ') || null, M.valeur(v, 'construction.chambres') ? M.valeur(v, 'construction.chambres') + ' chambre(s)' : null,
          M.valeur(v, 'construction.garage') && M.valeur(v, 'construction.garage') !== 'Aucun' ? 'garage ' + M.valeur(v, 'construction.garage').toLowerCase() : null,
          M.valeur(v, 'construction.chauffage')].filter(Boolean).join(' · ') || null),
        dd('Terrain', [M.valeur(v, 'construction.terrainStatut'), M.valeur(v, 'construction.prixTerrain') != null ? M.formatEuros(M.valeur(v, 'construction.prixTerrain')) : null].filter(Boolean).join(' · ') || null),
        dd('Financement', M.valeur(v, 'construction.financement'))] : null,
      M.natureDe(v) === 'agrandissement' ? dd('Agrandissement', [(M.valeur(v, 'agrandissement.types') || []).join(', ') || null,
        M.valeur(v, 'agrandissement.surface') ? M.valeur(v, 'agrandissement.surface') + ' m²' : null,
        M.valeur(v, 'agrandissement.surfaceExistante') ? 'maison actuelle ' + M.valeur(v, 'agrandissement.surfaceExistante') + ' m²' : null].filter(Boolean).join(' · ') || null) : null,
      M.natureDe(v) !== 'renovation' ? (() => { const inf = M.valeur(v, 'terrain.infos') || {}, z = inf.urbanisme && inf.urbanisme.zone, pa = inf.parcelle;
        return dd('Parcelle et urbanisme', [pa ? 'section ' + pa.section + ' n° ' + pa.numero : null, M.valeur(v, 'terrain.surface') ? M.valeur(v, 'terrain.surface').toLocaleString('fr-FR') + ' m²' : null,
          inf.urbanisme && inf.urbanisme.rnu ? 'RNU' : z ? 'zone ' + z.libelle : null].filter(Boolean).join(' · ') || null); })() : null,
      dd('Usage du bien', usage),
      dd('Ampleur', (M.valeur(v, 'projet.categories') || []).join(', ')),
      dd('Travaux', listeTypes.join(', ')),
      dd('Situation actuelle', M.valeur(v, 'projet.situation')),
      dd('Souhaits', M.valeur(v, 'projet.souhaits')),
      M.valeur(v, 'projet.explicatif') ? dd('En quelques mots', M.valeur(v, 'projet.explicatif')) : null,
      M.valeur(v, 'assistant.texte') ? dd('Résumé de visite', M.valeur(v, 'assistant.texte')) : null,
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

/* ---------- le dessin rapide (releve/dessin.js) ----------
   Des pièces rectangulaires, posées l'une contre l'autre au doigt, avec de
   gros − / + ; l'aperçu se redessine à chaque geste. Le dessin est gardé
   avec la visite (« dessin »). « Créer le plan » en tire le relevé du moteur
   et l'ouvre : on y tape les vraies longueurs (toucher une cote), on ajoute
   portes et fenêtres. Un plan retouché ensuite n'est jamais écrasé en
   silence : le recréer depuis le dessin met l'ancien de côté. */
const PIECE_DEFAUT = () => ({ id: M.nouvelId().slice(0, 8), nom: 'Pièce', longueur: 3, largeur: 3 });
function dessinCourant() {
  const d = M.valeur(visite(), 'dessin');
  return d && Array.isArray(d.pieces) ? JSON.parse(JSON.stringify(d)) : { pieces: [], hauteur: 2.5 };
}
const majDessin = async f => { const d = dessinCourant(); f(d); await poser('dessin', d); redessiner(); };

function apercuDessin(d, R) {
  const NS = 'http://www.w3.org/2000/svg', el = (t, a, txt) => { const e = document.createElementNS(NS, t); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); if (txt != null) e.textContent = txt; return e; };
  const rs = d.pieces.filter(p => R.rect.has(p.id)).map(p => ({ p, r: R.rect.get(p.id) }));
  const svg = el('svg', { class: 'apercuDessin', role: 'img', 'aria-label': 'Aperçu du dessin' });
  if (!rs.length) { svg.setAttribute('viewBox', '0 0 10 4'); svg.append(el('text', { x: 5, y: 2.2, 'text-anchor': 'middle', 'font-size': 0.5, fill: '#5E6B74' }, 'Ajoutez une pièce')); return svg; }
  const x0 = Math.min(...rs.map(o => o.r.x0)) - 1, y0 = Math.min(...rs.map(o => o.r.y0)) - 1, x1 = Math.max(...rs.map(o => o.r.x1)) + 1, y1 = Math.max(...rs.map(o => o.r.y1)) + 1;
  svg.setAttribute('viewBox', [x0, y0, x1 - x0, y1 - y0].join(' '));
  const t = Math.max(0.25, Math.min(0.45, (x1 - x0) / 22));
  rs.forEach(({ p, r }) => {
    const sel = S.dessinSel === p.id, g = el('g', { 'data-piece-dessin': p.id, style: 'cursor:pointer' });
    g.append(el('rect', { x: r.x0, y: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0, fill: sel ? '#FCE9E3' : '#E7EEF2', stroke: sel ? '#C5563A' : '#2C4A5E', 'stroke-width': sel ? 0.12 : 0.08 }));
    g.append(el('text', { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, 'text-anchor': 'middle', 'font-size': t, 'font-weight': 700, fill: '#1A2B36' }, p.nom));
    g.append(el('text', { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 + t * 1.2, 'text-anchor': 'middle', 'font-size': t * 0.8, fill: '#5E6B74' }, String(Math.round((r.x1 - r.x0) * (r.y1 - r.y0) * 100) / 100).replace('.', ',') + ' m²'));
    g.append(el('text', { x: (r.x0 + r.x1) / 2, y: r.y0 + t * 0.9, 'text-anchor': 'middle', 'font-size': t * 0.75, fill: '#2C4A5E' }, String(r3l(r.x1 - r.x0)).replace('.', ',')));
    g.append(el('text', { x: r.x0 + t * 0.35, y: (r.y0 + r.y1) / 2, 'text-anchor': 'start', 'font-size': t * 0.75, fill: '#2C4A5E' }, String(r3l(r.y1 - r.y0)).replace('.', ',')));
    g.addEventListener('click', () => { S.dessinSel = sel ? null : p.id; redessiner(); });
    svg.append(g);
  });
  return svg;
}
const r3l = v => Math.round(v * 100) / 100;

function reglageMetres(valeur, libelle, nom, pas, poserValeur, min = 0.3) {
  const n = DRnb(valeur);
  return h('label', { class: 'champ reglageDessin' }, libelle,
    h('div', { class: 'reglage' },
      h('button', { class: 'pm', type: 'button', 'aria-label': libelle + ' moins', onclick: e => { e.preventDefault(); poserValeur(Math.max(min, Math.round(((n || 0) - pas) * 100) / 100)); } }, '−'),
      h('span', { class: 'valeur' }, h('input', { inputMode: 'decimal', name: nom, value: n == null ? '' : String(n).replace('.', ','), 'aria-label': libelle,
        onchange: e => { const x = DRnb(e.target.value); if (x != null) poserValeur(Math.round(x * 100) / 100); } }), h('span', {}, ' m')),
      h('button', { class: 'pm', type: 'button', 'aria-label': libelle + ' plus', onclick: e => { e.preventDefault(); poserValeur(Math.round(((n || 0) + pas) * 100) / 100); } }, '+')));
}
const DRnb = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; };

function ecranDessin() {
  const v = visite();
  if (!v) { S.ecran = 'accueil'; return ecranAccueil(); }
  const d = dessinCourant(), R = DR.releveDepuisDessin(d.pieces, { hauteur: d.hauteur });
  const retour = () => { S.ecran = 'visite'; S.message = null; dessiner(); window.scrollTo(0, 0); };
  const ajouter = () => majDessin(x => {
    const n = PIECE_DEFAUT(), der = x.pieces[x.pieces.length - 1];
    if (der) n.contre = { id: der.id, cote: 'droite', decalage: 0 };
    n.nom = x.pieces.length ? 'Pièce ' + (x.pieces.length + 1) : 'Séjour';
    x.pieces.push(n); S.dessinSel = n.id;
  });
  const creer = async () => {
    if (!d.pieces.length) return montrerMessage('att', 'Ajoutez au moins une pièce.');
    if (R.erreurs.length) return montrerMessage('err', 'À corriger avant de créer le plan : ' + R.erreurs.join(' '));
    const actuel = M.valeur(visite(), 'plan');
    if (actuel && !confirm('Un plan existe déjà pour cette visite. Le remplacer par ce dessin ?\n(L’ancien plan, avec ses retouches, reste gardé de côté.)')) return;
    const projet = 'Plan de ' + M.intitule(visite());
    const nv = DR.releveDepuisDessin(d.pieces, { projet, hauteur: d.hauteur });
    await changer(w => { let x = w; if (actuel) x = M.modifier(x, 'plan.ecarte', actuel); return M.modifier(x, 'plan', { releve: nv.donnees, resume: nv.resume }); });
    S.message = null; vibrer(); ouvrirPlan();
  };
  return [
    h('header', { class: 'haut' }, h('button', { class: 'lienRetour', onclick: retour }, '‹ Visite'), h('span', { class: 'titre' }, 'Dessin rapide'), pastilleEtat()),
    h('main', {},
      S.message && h('div', { class: 'message ' + S.message.type }, S.message.texte),
      h('h1', {}, '✏️ Dessin rapide'),
      h('p', { class: 'mut petit' }, 'Posez les pièces une à une, à côté de la précédente. Touchez une pièce pour la régler. Les cotes exactes se tapent ensuite dans le plan.'),
      h('div', { class: 'carte', style: 'padding:6px' }, apercuDessin(d, R)),
      // lu sur un plan 2D : le plan d'origine sous la main, pour comparer
      (() => { const n = Array.isArray(d.sources) ? d.sources.length : d.source ? 1 : 0;
        const pps = n ? M.actifs(v.photos).filter(x => x.role === 'planPapier').sort((a, b) => String(b.importeLe || '').localeCompare(String(a.importeLe || ''))).slice(0, Math.min(n, 12)) : [];
        return n ? h('details', { class: 'carte planOrigine', id: 'planOrigine' }, h('summary', {}, n > 1 ? '🖼 Plans et esquisses d’origine (' + n + ')' : '🖼 Plan d’origine' + (d.source && d.source.partie ? ' · ' + d.source.partie : '')),
          pps.length ? pps.map(pp => imagePhoto(pp, 'imagePlanOrigine')) : h('div', { class: 'mut petit' }, (d.source && d.source.fichier) || '')) : null; })(),
      R.erreurs.length ? h('div', { class: 'message err' }, R.erreurs.join(' ')) : d.pieces.length ? h('div', { class: 'mut petit' }, R.resume.pieces + ' pièce' + (R.resume.pieces > 1 ? 's' : '') + ' · ' + String(R.resume.surface).replace('.', ',') + ' m²') : null,
      d.pieces.map((p, i) => {
        const sel = S.dessinSel === p.id;
        const maj = f => majDessin(x => { const q = x.pieces.find(y => y.id === p.id); if (q) f(q, x); });
        const autres = d.pieces.slice(0, i);
        return h('div', { class: 'carte pieceDessin' + (sel ? ' sel' : ''), 'data-dessin': p.id },
          h('div', { class: 'rang', style: 'justify-content:space-between', onclick: () => { if (!sel) { S.dessinSel = p.id; redessiner(); } } },
            h('b', {}, p.nom + ' · ' + String(p.longueur).replace('.', ',') + ' × ' + String(p.largeur).replace('.', ',') + ' m'),
            h('button', { class: 'puce', type: 'button', 'aria-label': 'Supprimer ' + p.nom, onclick: e => { e.stopPropagation(); if (!confirm('Supprimer « ' + p.nom + ' » ?')) return;
              majDessin(x => { x.pieces = x.pieces.filter(y => y.id !== p.id); x.pieces.forEach(y => { if (y.contre && y.contre.id === p.id) delete y.contre; }); }); } }, '🗑')),
          sel ? [
            h('label', { class: 'champ' }, 'NOM', h('input', { class: 'in', name: 'dessin-nom', value: p.nom, autocapitalize: 'sentences', onchange: e => maj(q => { q.nom = e.target.value.trim() || 'Pièce'; }) })),
            h('div', { class: 'puces' }, M.PIECES_COURANTES.slice(0, 10).map(n => h('button', { class: 'puce' + (p.nom === n ? ' on' : ''), type: 'button', onclick: () => maj(q => { q.nom = n; }) }, n))),
            reglageMetres(p.longueur, 'LONGUEUR (gauche ↔ droite)', 'dessin-longueur', 0.1, x => maj(q => { q.longueur = x; })),
            reglageMetres(p.largeur, 'LARGEUR (haut ↕ bas)', 'dessin-largeur', 0.1, x => maj(q => { q.largeur = x; })),
            autres.length ? [
              h('div', { class: 'champ' }, 'POSÉE'),
              h('div', { class: 'puces' }, DR.COTES.map(([c, lib]) => h('button', { class: 'puce' + (p.contre && p.contre.cote === c ? ' on' : ''), type: 'button',
                onclick: () => maj(q => { q.contre = { id: (q.contre && q.contre.id) || autres[autres.length - 1].id, cote: c, decalage: 0 }; }) }, lib))),
              h('label', { class: 'champ' }, 'CONTRE LA PIÈCE', h('select', { class: 'in', name: 'dessin-contre', onchange: e => maj(q => { q.contre = e.target.value ? { id: e.target.value, cote: (q.contre && q.contre.cote) || 'droite', decalage: 0 } : undefined; }) },
                h('option', { value: '' }, 'Aucune (posée à part)'), autres.map(o => h('option', { value: o.id, selected: p.contre && p.contre.id === o.id }, o.nom)))),
              p.contre ? reglageMetres(p.contre.decalage || 0, 'DÉCALAGE LE LONG DU MUR', 'dessin-decalage', 0.1, x => maj(q => { q.contre.decalage = x; }), -50) : null] : null] : null);
      }),
      h('button', { class: 'gros sec', id: 'ajouterPieceDessin', type: 'button', onclick: ajouter, style: 'margin-top:4px' }, '＋ Ajouter une pièce'),
      reglageMetres(d.hauteur || 2.5, 'HAUTEUR SOUS PLAFOND', 'dessin-hauteur', 0.05, x => majDessin(y => { y.hauteur = x; }), 1.8)),
    h('div', { class: 'barreBas' }, h('div', { class: 'in' },
      h('button', { class: 'gros sec', onclick: retour }, '‹ Visite'),
      h('button', { class: 'gros', id: 'creerPlanDessin', onclick: creer }, '✓ Créer le plan'))),
  ];
}

/* ---------- l'assistant de visite (releve/assistant.js) ----------
   On raconte la visite d'un trait, au micro ou au clavier ; « Remplir la
   fiche » la confie à la fonction du serveur (action « structurer »), puis
   chaque champ proposé se relit et se coche avant d'entrer dans la visite.
   La dictée est gardée avec la visite (hors ligne compris) jusqu'à ce
   qu'elle soit rangée : rien ne se perd si le réseau manque. */
/* « 📷 Lire une note manuscrite » : la photo d'une note (ou d'un document)
   est recopiée par Gemini et AJOUTÉE à la dictée (jamais à sa place) ;
   « Remplir la fiche » la range ensuite comme une dictée. */
function lireNote(btn, info) {
  const dire = (t, type) => { info.textContent = t; info.className = 'message ' + (type || 'err'); };
  if (!pretPourIA(dire, 'La lecture de note')) return;
  choisirFichier({ accept: 'image/*', capture: true }, async f => {
    const lib = btn.textContent; btn.disabled = true; btn.textContent = '📷 Lecture de la note…';
    dire('La note est en cours de lecture…', 'att');
    try {
      const blob = await reduirePhoto(f[0]);
      const r = await appelerFonction({ action: 'decrire', mode: 'note', image: await enBase64(blob), mime: 'image/jpeg' }) || {};
      const texte = typeof r.texte === 'string' ? r.texte.trim() : '';
      if (!texte) throw { code: 'rien_lu' };
      const avant = String(M.valeur(visite(), 'assistant.texte') || '').trim();
      await changer(w => M.modifier(w, 'assistant.texte', (avant ? avant + '\n\n' : '') + texte));
      const ta = document.querySelector('textarea[name="assistant.texte"]');
      if (ta) ta.value = (avant ? avant + '\n\n' : '') + texte;
      S.propAssistant = null;
      dire('📷 Note recopiée à la suite de la dictée : relisez-la, puis touchez « ✨ Remplir la fiche ».', 'ok');
    } catch (e) { dire(messageDecrire(e, 'note')); }
    btn.disabled = false; btn.textContent = lib;
  });
}

async function lancerAssistant(btn, info) {
  const v = visite(), texte = (M.valeur(v, 'assistant.texte') || '').trim();
  const dire = (t, type) => { info.textContent = t; info.className = 'message ' + (type || 'err'); };
  if (texte.length < 10) return dire('Racontez d’abord la visite (au moins une phrase).', 'att');
  if (navigator.onLine === false) return dire('L’assistant a besoin du réseau. Votre dictée est gardée avec la visite : touchez « Remplir la fiche » quand le réseau revient.', 'att');
  if (!S.session) return dire('Connectez-vous (même compte que le suivi) pour utiliser l’assistant. Votre dictée est gardée.', 'att');
  if (!supa.functions || !supa.functions.invoke) return dire(MESSAGES_IMAGINER.non_configure, 'att');
  const lib = btn.textContent; btn.disabled = true; btn.textContent = '✨ Lecture de la dictée…';
  try {
    const data = await appelerFonction({ action: 'structurer', texte, listes: A.listesPourIA() });
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
      !P ? h('button', { class: 'gros sec', id: 'lireNote', type: 'button', style: 'margin-top:10px', onclick: e => lireNote(e.currentTarget, info) }, '📷 Lire une note manuscrite') : null,
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
const photosNonEnvoyees = d => [d.garde, d.planImage, d.planAnnote, ...d.pieces.flatMap(p => p.photos.flatMap(ph => [ph, ...ph.imagines]))].filter(ph => ph && !ph.chemin).length;

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
        M.natureDe(v) !== 'renovation' ? option('terrain', 'Terrain, urbanisme et risques') : null,
        option('planAnnote', 'Plan annoté (travaux)' + (AN.nettoyer(M.valeur(v, 'annotations')).imageId ? '' : ' — aucun plan annoté pour l’instant (étape Scan)')),
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
  const nature = M.natureDe(v), SP = M.surfacesProjet(v);
  const pieces = B.piecesDuPlan(M.valeur(v, 'plan')), T = tableOuv(), F_ = fourchettes();
  const calc = B.calculerEstimation(budget, T, pieces, F_, SP);
  const env = M.valeur(v, 'projet.enveloppe'), verdict = B.verdictEnveloppe(calc.total, env);
  const majBudget = async f => {
    const b = f(JSON.parse(JSON.stringify({ lignes: [], ouvrages: [], ajust: {}, ...budget, ouvrages: budget.ouvrages || [] })));
    const c = B.calculerEstimation(b, tableOuv(), pieces, fourchettes(), SP);
    b.estimation = { min: c.total.min, max: c.total.max, complet: !c.vide && !c.manques, le: new Date().toISOString() };
    S.totalAvant = calc.total;
    await poser('budget', b); vibrer(); redessiner();
  };
  const types = M.valeur(v, 'projet.types') || [], cats = M.valeur(v, 'projet.categories') || [];
  // construction et agrandissement : le projet et le terrain proposent aussi leurs travaux (fondations, assainissement…)
  const inf = M.valeur(v, 'terrain.infos') || {}, rq = inf.risques || {};
  const neuf = nature === 'renovation' ? [] : B.ouvragesSuggeresNeuf({ nature, prestation: M.valeur(v, 'construction.prestation'), garage: M.valeur(v, 'construction.garage'),
    typesAgrandissement: M.valeur(v, 'agrandissement.types') || [], assainissement: M.valeur(v, 'terrain.assainissement'), reseauAssainissement: M.valeur(v, 'terrain.reseau.assainissement'),
    etudeSol: M.valeur(v, 'terrain.etudeSol'), pente: M.valeur(v, 'terrain.pente'), acces: M.valeur(v, 'terrain.acces'), demolition: M.valeur(v, 'terrain.demolition'),
    argile: rq.argile ? rq.argile.code : 0, mouvementTerrain: (rq.naturels || []).some(x => x.cle === 'mouvementTerrain' && /existant/i.test(x.statut || '') && !/inconnu|non connu/i.test(x.statut || '')) }, T, budget.ouvrages);
  const sugg = nature === 'construction' ? neuf : [...neuf, ...B.ouvragesSuggeres(types, cats, T, budget.ouvrages).filter(o => !neuf.some(x => x.id === o.id))];
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
    h('div', { class: 'tuiles' }, B.ouvragesDe(T, nature).map(o => h('button', { class: 'tuile' + (pris.has(o.id) ? ' on' : '') + (proposes.has(o.id) ? ' propose' : ''), type: 'button',
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
      h('div', { class: 'mut petit' }, r.source === 'projet' ? '🏗 D’après le projet : ' + r.detail : r.source === 'plan' ? '📐 D’après le plan : ' + r.detail
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
  const ecran = S.ecran === 'connexion' ? ecranConnexion() : S.ecran === 'visite' ? ecranVisite() : S.ecran === 'plan' ? ecranPlan() : S.ecran === 'fourchettes' ? ecranFourchettes() : S.ecran === 'ouvrages' ? ecranOuvrages() : S.ecran === 'dossier' ? ecranDossier() : S.ecran === 'assistant' ? ecranAssistant() : S.ecran === 'dessin' ? ecranDessin() : S.ecran === 'annoter' ? ecranAnnoter() : ecranAccueil();
  app.replaceChildren(...ecran.flat(Infinity).filter(Boolean));
  // en quittant le plan annoté (bouton, retour du navigateur…), son image est refaite
  if (S.dernierEcran === 'annoter' && S.ecran !== 'annoter' && S.courante) exporterAnnotations(S.courante);
  S.dernierEcran = S.ecran;
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
    if (rec) { S.courante = id; S.etape = Math.max(0, M.etapesDe(rec.visite).findIndex(e => e.id === M.valeur(rec.visite, 'etape'))); S.ecran = lien.vue === 'dossier' ? 'dossier' : 'visite'; S.message = null; }
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
  /* après chaque synchronisation, l'accueil se redessine dès qu'une visite a changé (nouvelle visite, nom
     tapé sur un autre appareil, statut, photo de garde…), pas seulement quand leur nombre change ; jamais
     pendant une recherche en cours (le clavier resterait ouvert sur un champ remplacé) */
  const signature = () => S.visites.map(r => r.id + ':' + M.derniereMaj(r.visite) + ':' + (r.enAttente ? 1 : 0)).sort().join('|');
  sync.synchroniser = async () => {
    await avant(); const avantSync = signature(); await recharger();
    if (S.ecran === 'accueil' && signature() !== avantSync && (document.activeElement || {}).id !== 'chercherVisite') dessiner();
    traiterFileImaginer();
  };
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
