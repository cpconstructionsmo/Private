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
import * as AV from './aide-vente.js';
import * as CH from './chiffrage.js';
import { dossierClient, OPTIONS_DEFAUT } from './dossier.js';
import * as A from './assistant.js';
import * as DR from './dessin.js';
import * as AN from './annotations.js';
import * as T from './terrain.js';
import * as PM from './permis.js';
import * as CQ from './croquis.js';
import { ouvrirVisionneuse, zoomer as zoomerToile, cadrer as cadrerZoom } from './zoom.js';
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
  // toute image s'ouvre en grand d'un toucher (zoom.js), sauf la vignette d'une carte de l'accueil (elle ouvre la visite)
  const img = h('img', { class: cls, alt: photo.legende || 'Photo', 'data-zoom': cls === 'vignette' ? null : '' });
  urlPhoto(photo.id, photo.chemin).then(u => { if (u) img.src = u; });
  return img;
}

/* avant / après : une seule image, un curseur à glisser (l'« après » se dévoile de droite à gauche) */
function curseurAvantApres(avant, apres) {
  const mk = (p, cls) => p.src ? h('img', { class: cls, src: p.src, alt: '' }) : imagePhoto(p, cls);
  const cadre = h('div', { class: 'cmpAvApres' }), ia = mk(avant, 'cmpImg'), ib = mk(apres, 'cmpImg cmpApres');
  ia.removeAttribute('data-zoom'); ib.removeAttribute('data-zoom');
  const poignee = h('span', { class: 'cmpPoignee' }, '⇆');
  const poser = pc => { cadre.style.setProperty('--pos', pc + '%'); };
  const curseur = h('input', { type: 'range', min: 0, max: 100, value: 50, class: 'cmpRange', 'aria-label': 'Comparer avant et après', oninput: e => poser(e.target.value) });
  poser(50);
  cadre.append(ia, ib, h('span', { class: 'cmpEtiq cmpAvant' }, 'Avant'), h('span', { class: 'cmpEtiq cmpAp' }, 'Après'), poignee, curseur);
  return cadre;
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

/* ---------- mode « Présentation client » : masque tout ce qui est interne (prix au m², réglages, chiffrage) ---------- */
const lireP = () => { try { return localStorage.getItem('releve:presentation') === '1'; } catch (e) { return false; } };
S.presentation = lireP();
const appliquerPresentation = () => { document.body.classList.toggle('presentation', !!S.presentation); };
appliquerPresentation();
function boutonPresentation() {
  return h('button', { class: 'bascPresentation' + (S.presentation ? ' on' : ''), type: 'button', id: 'bascPresentation',
    title: S.presentation ? 'Quitter le mode présentation' : 'Mode présentation client (masque les réglages internes)',
    'aria-pressed': S.presentation ? 'true' : 'false',
    onclick: () => { S.presentation = !S.presentation; try { localStorage.setItem('releve:presentation', S.presentation ? '1' : '0'); } catch (e) { /* sans stockage : valable pour cette séance */ } appliquerPresentation(); dessiner(); } },
    '👁');
}
// vocabulaire de l'artisan → mots du client, seulement en présentation (les titres du modèle ne changent pas)
const titreEtape = t => S.presentation ? ({ 'Scan': 'Mesures de la maison', 'Budget': 'Votre budget', 'Fin de visite': 'Récapitulatif' }[t] || t) : t;

/* ---------- confirmation élégante (remplace la boîte du navigateur, peu rassurante devant un client) ----------
   Sous automate de test (navigator.webdriver), la boîte native est gardée : les parcours de test l'acceptent d'office. */
function confirmer(texte, { ok = 'Confirmer', non = 'Annuler' } = {}) {
  if (navigator.webdriver) return Promise.resolve(confirm(texte));
  return new Promise(fin => {
    const [titre, ...reste] = String(texte).split('\n').filter(Boolean);
    const fermer = v => { voile.remove(); document.removeEventListener('keydown', clavier); fin(v); };
    const clavier = e => { if (e.key === 'Escape') fermer(false); };
    const voile = h('div', { class: 'voileConfirm', role: 'dialog', 'aria-modal': 'true', onclick: e => { if (e.target === voile) fermer(false); } },
      h('div', { class: 'boiteConfirm' },
        h('div', { class: 'titreConfirm' }, titre),
        reste.length ? h('div', { class: 'mut petit' }, reste.join(' ')) : null,
        h('div', { class: 'rang', style: 'margin-top:16px' },
          h('button', { class: 'gros sec', type: 'button', onclick: () => fermer(false) }, non),
          h('button', { class: 'gros', type: 'button', id: 'confirmerOui', onclick: () => fermer(true) }, ok))));
    document.body.appendChild(voile); document.addEventListener('keydown', clavier);
    const b = voile.querySelector('#confirmerOui'); if (b) b.focus();
  });
}

function montrerMessage(type, texte) { S.message = { type, texte }; dessiner(); }

/* ---------- l'état de la synchronisation, toujours visible ---------- */
function texteEtat() {
  const e = S.etatSync;
  if (e.etat === 'synchro') return '↻ Envoi…';
  if (e.etat === 'ok' && !e.enAttente) return '✓ Synchronisé';
  if (e.etat === 'horsligne') return '⏸ Sur l’appareil' + (e.enAttente ? ' · ' + e.enAttente : '');
  if (e.etat === 'partiel') return '⚠ ' + ((e.refuses || []).length > 1 ? e.refuses.length + ' fichiers trop gros' : 'Fichier trop gros') + ' · touchez';
  // rien n'est perdu : tout est gardé sur l'appareil. Devant un client : message rassurant ; sinon, la vraie cause en deux mots
  if (e.etat === 'erreur') return S.presentation ? '✓ Gardé sur l’appareil · envoi dès que possible'
    : e.type === 'installation' ? '⚠ Serveur à installer · touchez' : e.type === 'connexion' ? '⚠ Reconnexion nécessaire' : '⚠ Envoi impossible · touchez';
  return '⏳ Envoi en cours' + (e.enAttente ? ' · ' + e.enAttente : '');
}
function pastilleEtat() {
  const e = S.etatSync;
  return h('span', { class: 'etat ' + e.etat, id: 'etatSync', role: 'status', 'aria-live': 'polite', title: e.message || '',
    onclick: () => { if (e.message) montrerMessage(e.etat === 'erreur' ? 'err' : 'att', e.message); sync.synchroniser(true); } }, texteEtat());
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
/* annuler une visite : elle quitte la liste, sans rien perdre (statut « annulee », filtre « Annulées », rétablie d'un toucher) */
async function annulerVisite(id) {
  const r = S.visites.find(x => x.id === id); if (!r) return;
  if (!(await confirmer('Annuler la visite « ' + M.intitule(r.visite) + ' » ?\n\nElle quitte la liste mais reste récupérable dans « Annulées » : photos et plan sont gardés.'))) return;
  await changerVisite(id, w => M.modifier(M.modifier(w, 'annulation', { le: new Date().toISOString(), statutAvant: M.valeur(w, 'statut') || 'en_cours' }), 'statut', 'annulee'));
  vibrer(); dessiner();
}
async function retablirVisite(id) {
  const r = S.visites.find(x => x.id === id); if (!r) return;
  const a = M.valeur(r.visite, 'annulation') || {};
  await changerVisite(id, w => M.modifier(M.modifier(w, 'statut', a.statutAvant && a.statutAvant !== 'annulee' ? a.statutAvant : 'en_cours'), 'annulation', null));
  if (!S.visites.some(x => M.valeur(x.visite, 'statut') === 'annulee')) S.filtreVisites = null;
  vibrer(); dessiner();
}
function ecranAccueil() {
  const annulees = S.visites.filter(r => M.valeur(r.visite, 'statut') === 'annulee');
  if (S.filtreVisites === 'annulees' && !annulees.length) S.filtreVisites = null;
  const voirAnnulees = S.filtreVisites === 'annulees';
  const toutes = S.visites.filter(r => (M.valeur(r.visite, 'statut') === 'annulee') === voirAnnulees).sort((a, b) => M.derniereMaj(b.visite).localeCompare(M.derniereMaj(a.visite)));
  const mots = sansAccents(S.recherche || '').split(/\s+/).filter(Boolean);
  const liste = mots.length ? toutes.filter(r => { const t = texteVisite(r.visite); return mots.every(m => t.includes(m)); }) : toutes;
  // la liste se refiltre à chaque lettre, sans redessiner le champ (le clavier reste ouvert)
  const filtrer = e => { S.recherche = e.target.value; const box = document.getElementById('listeVisites'); if (!box) return;
    const m = sansAccents(S.recherche).split(/\s+/).filter(Boolean);
    box.querySelectorAll('[data-visite]').forEach(c => { const r = S.visites.find(x => x.id === c.dataset.visite); c.hidden = !!(r && m.length && !m.every(w => texteVisite(r.visite).includes(w))); });
    const n = box.querySelectorAll('[data-visite]:not([hidden])').length, vide = document.getElementById('aucuneVisiteTrouvee'); if (vide) vide.hidden = n > 0; };
  return [
    h('header', { class: 'haut' }, h('img', { src: '../assets/logo_fiche.jpg', alt: 'CP Constructions' }), h('span', { class: 'titre' }, 'Relevés'), boutonPresentation(), pastilleEtat()),
    h('main', {},
      S.message && h('div', { class: 'message ' + S.message.type }, S.message.texte),
      !S.session && h('div', { class: 'message att' }, 'Non connecté : les visites restent sur cet appareil. ',
        h('button', { class: 'lienRetour', onclick: () => { S.ecran = 'connexion'; dessiner(); } }, 'Se connecter')),
      annulees.length ? h('div', { class: 'puces', role: 'tablist', style: 'margin-bottom:10px' },
        h('button', { class: 'puce' + (voirAnnulees ? '' : ' on'), type: 'button', id: 'voirEnCours', onclick: () => { S.filtreVisites = null; dessiner(); } }, 'Visites (' + (S.visites.length - annulees.length) + ')'),
        h('button', { class: 'puce' + (voirAnnulees ? ' on' : ''), type: 'button', id: 'voirAnnulees', onclick: () => { S.filtreVisites = 'annulees'; dessiner(); } }, 'Annulées (' + annulees.length + ')')) : null,
      toutes.length > 4 ? h('input', { class: 'in', type: 'search', id: 'chercherVisite', placeholder: '🔎 Chercher : client, ville, travaux…', value: S.recherche || '', autocomplete: 'off', oninput: filtrer, style: 'margin:0 0 12px' }) : null,
      toutes.length ? h('div', { id: 'listeVisites' }, toutes.map(r => { const c = carteVisite(r); if (!liste.includes(r)) c.hidden = true; return c; }),
        h('div', { class: 'vide', id: 'aucuneVisiteTrouvee', hidden: liste.length > 0 }, 'Aucune visite ne correspond.'))
        : voirAnnulees ? h('div', { class: 'vide' }, 'Aucune visite annulée.')
        : h('div', { class: 'vide' }, h('div', { style: 'font-size:46px' }, '🏠'), 'Aucune visite pour l’instant.', h('br'), 'Touchez « Nouvelle visite » chez le client.'),
      h('div', { class: 'interne', style: 'text-align:center;margin-top:8px' }, h('button', { class: 'lienRetour', id: 'reglerOuvrages', onclick: () => { S.retour = 'accueil'; S.ecran = 'ouvrages'; S.brouillonO = null; S.message = null; dessiner(); } }, '⚙ Prix au m²'), ' · ',
        h('button', { class: 'lienRetour', id: 'reglerFourchettes', onclick: () => { S.retour = 'accueil'; S.ecran = 'fourchettes'; S.brouillonF = null; S.message = null; dessiner(); } }, '⚙ Postes détaillés'))),
    h('div', { class: 'barreBas' }, h('div', { class: 'in' },
      h('button', { class: 'gros sec', id: 'lancerDemo', onclick: () => { S.ecran = 'demo'; S.demoEtape = 0; S.message = null; dessiner(); window.scrollTo(0, 0); } }, '▶ Démo'),
      h('button', { class: 'gros', id: 'nouvelleVisite', onclick: nouvelleVisite }, '📷 Nouvelle visite'))),
  ];
}

function carteVisite(r) {
  const v = r.visite, garde = v.photos[M.valeur(v, 'photoGarde')];
  const ville = M.valeur(v, 'client.ville'), types = M.valeur(v, 'projet.types') || [];
  // avancement : étape atteinte sur le parcours de la nature du projet (rempli quand la visite est terminée)
  const ETP = M.etapesDe(v), terminee = M.valeur(v, 'statut') === 'terminee';
  const atteinte = terminee ? ETP.length : Math.min(ETP.length, Math.max(1, ETP.findIndex(e => e.id === M.valeur(v, 'etape')) + 1));
  return h('div', { class: 'carte visite', 'data-visite': r.id, onclick: () => { S.courante = r.id; S.etape = Math.max(0, M.etapesDe(v).findIndex(e => e.id === M.valeur(v, 'etape'))); S.ecran = 'visite'; S.message = null; dessiner(); } },
    garde && !garde.supprime ? imagePhoto(garde, 'vignette') : h('div', { class: 'vignette' }, '🏠'),
    h('div', { class: 'corps' },
      h('b', {}, M.intitule(v)),
      h('div', { class: 'mut petit' }, [ville, types.slice(0, 2).join(', ')].filter(Boolean).join(' · ') || 'Projet à préciser'),
      (M.valeur(v, 'budget') || {}).estimation && M.valeur(v, 'budget').estimation.max > 0 ? h('div', { class: 'petit montantCarte', style: 'color:var(--navy);font-weight:600' }, '💶 ' + B.formatPlage(M.valeur(v, 'budget').estimation)) : null,
      h('div', { class: 'avancement', title: 'Étape ' + atteinte + ' sur ' + ETP.length }, h('i', { style: 'width:' + Math.round(100 * atteinte / ETP.length) + '%' + (terminee ? ';background:var(--green)' : '') }), h('span', {}, atteinte + '/' + ETP.length)),
      h('div', { class: 'mut petit' }, dateCourte(v.creeLe),
        M.valeur(v, 'statut') === 'terminee' ? h('span', { class: 'pastille ok' }, 'Terminée') : null,
        M.valeur(v, 'statut') === 'annulee' ? h('span', { class: 'pastille annulee' }, 'Annulée le ' + dateCourte((M.valeur(v, 'annulation') || {}).le)) : null,
        r.enAttente ? h('span', { class: 'pastille' }, 'À envoyer') : null)),
    // annuler (ou rétablir) sans ouvrir la visite : le toucher ne va pas jusqu'à la carte
    M.valeur(v, 'statut') === 'annulee'
      ? h('button', { class: 'puce actionVisite', type: 'button', 'aria-label': 'Rétablir la visite ' + M.intitule(v), onclick: e => { e.stopPropagation(); retablirVisite(r.id); } }, '↺ Rétablir')
      : h('button', { class: 'puce actionVisite', type: 'button', 'aria-label': 'Annuler la visite ' + M.intitule(v), onclick: e => { e.stopPropagation(); annulerVisite(r.id); } }, '✕'));
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
      h('span', { class: 'titre' }, M.intitule(v)), boutonPresentation(), pastilleEtat()),
    h('main', {},
      // la barre de progression est aussi un sommaire : toucher une étape y va directement
      h('nav', { class: 'progres', 'aria-label': 'Étapes de la visite' }, ETP.map((e, i) => h('button', { type: 'button', class: i < S.etape ? 'fait' : i === S.etape ? 'ici' : '',
        title: e.titre, 'aria-label': 'Étape ' + (i + 1) + ' : ' + e.titre, 'aria-current': i === S.etape ? 'step' : null, onclick: () => { if (i !== S.etape) allerEtape(i); } }, h('i')))),
      h('div', { class: 'rang', style: 'justify-content:space-between;align-items:center' },
        h('div', { class: 'etapeNom' }, 'Étape ' + (S.etape + 1) + ' sur ' + ETP.length + ' · ' + titreEtape(et.titre)),
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

/* ---------- « 🏛 Dossier permis » : le fichier que l'Atelier (Mac) transforme en projet et en PDF brouillon ----------
   Le DXF du plan est calculé par un moteur caché, hors écran : ses messages ne passent jamais par le gestionnaire
   du plan ouvert (autre fenêtre), donc rien n'est écrit dans la visite. */
function dxfDuPlan(plan) {
  return new Promise((ok, ko) => {
    const cadre = h('iframe', { src: 'moteur/index.html', title: 'Moteur du plan (caché)', tabindex: '-1', 'aria-hidden': 'true',
      style: 'position:fixed;left:-9999px;top:0;width:1024px;height:768px;border:0' });
    let fini = false;
    const fin = (valeur, erreur) => { if (fini) return; fini = true; clearTimeout(delai); window.removeEventListener('message', ecouter); cadre.remove(); erreur ? ko(erreur) : ok(valeur); };
    const delai = setTimeout(() => fin(null, new Error('Le plan met trop de temps à se préparer : réessayez.')), 30000);
    const ecouter = e => {
      if (e.source !== cadre.contentWindow || e.origin !== location.origin) return;
      const m = e.data || {};
      if (m.type === 'releve:pret') cadre.contentWindow.postMessage({ type: 'releve:dxf', texte: JSON.stringify(plan.releve) }, location.origin);
      else if (m.type === 'releve:dxfPret') m.dxf_base64 ? fin(m.dxf_base64) : fin(null, new Error('Le plan n’a pas pu être converti en DXF (' + (m.erreur || 'erreur') + ').'));
    };
    window.addEventListener('message', ecouter);
    document.body.appendChild(cadre);
  });
}

function blocDossierPermis(v) {
  if (!PM.aUnPlan(v)) return null;
  const info = h('div', { class: 'mut petit', role: 'status', style: 'margin-top:8px' });
  const bouton = h('button', { class: 'gros sec', type: 'button', id: 'preparerPermis', style: 'margin-top:10px', onclick: async () => {
    const lib = bouton.textContent; bouton.disabled = true; bouton.textContent = '⏳ Préparation du plan…'; info.replaceChildren();
    try {
      const fichier = PM.dossierPermis(visite(), await dxfDuPlan(M.valeur(visite(), 'plan')));
      const url = URL.createObjectURL(new Blob([JSON.stringify(fichier)], { type: 'application/json' }));
      // un vrai lien « télécharger » : Safari refuse un téléchargement lancé à la fin d'un calcul
      info.replaceChildren(h('a', { class: 'gros', id: 'telechargerPermis', href: url, download: PM.nomFichier(visite()), style: 'text-decoration:none' }, '⬇ Télécharger le dossier permis'),
        h('p', { class: 'mut petit' }, 'Ouvrez-le dans l’Atelier (sur le Mac) : « Depuis le relevé de visite ». Le brouillon n’est validé par personne : les points d’arrêt restent à signer.'));
    } catch (e) { info.textContent = (e && e.message) || 'Le dossier permis n’a pas pu être préparé.'; info.className = 'message err petit'; }
    bouton.disabled = false; bouton.textContent = lib;
  } }, '🏛 Dossier permis');
  return h('div', { class: 'carte interne', id: 'blocPermis', style: 'margin-top:14px' },
    h('b', {}, '🏛 Dossier permis (interne)'),
    h('p', { class: 'mut petit' }, 'Prépare le fichier que l’Atelier de conception (sur le Mac) transforme en projet et en brouillon du dossier de permis : le plan, le client, l’adresse, la parcelle.'),
    bouton, info);
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
/* « 🤖 Lire le règlement » : la fonction télécharge le PDF du règlement (Géoplateforme) et Gemini en tire les règles de la zone */
async function lireReglementZone(z) {
  const dire = (t, type) => { S.reglement = { message: t, type: type || 'err' }; redessiner(); };
  if (!pretPourIA(dire, 'La lecture du règlement')) return;
  S.reglement = { encours: true }; redessiner();
  try {
    const r = await appelerFonction({ action: 'reglement', url: z.reglement, zone: z.libelle, libelle: z.libelong }) || {};
    if (!r.regles) throw { code: r.legende !== undefined || r.cotes || r.fiche ? 'consigne_absente' : 'rien_lu' };
    await poser('terrain.reglement', { zone: z.libelle, url: z.reglement, regles: r.regles, autres: r.autres || [], pages: r.pages || null, le: new Date().toISOString() });
    S.reglement = null; vibrer(); redessiner();
  } catch (e) {
    const code = (e && e.code) || 'reseau';
    dire(code === 'zone_introuvable' ? 'La zone ' + z.libelle + ' n’a pas été trouvée dans ce règlement : ouvrez-le (lien ci-dessus).'
      : code === 'reglement_trop_lourd' ? 'Ce règlement est trop volumineux pour être lu d’un coup : ouvrez-le (lien ci-dessus).'
      : code === 'reglement_absent' ? 'Le règlement n’a pas pu être téléchargé depuis le Géoportail : réessayez plus tard.'
      : code === 'rien_lu' ? 'Aucune règle n’a pu être lue : ouvrez le règlement (lien ci-dessus).'
      : code === 'lien_reglement' || code === 'consigne_absente' ? 'La fonction « imaginer » du serveur n’est pas à jour : redéployez-la (voir supabase/functions/imaginer/README.md).'
      : messageDecrire(e, 'plan'));
  }
}
function blocReglement(v, z) {
  if (!z || !z.reglement) return null;
  const rg = M.valeur(v, 'terrain.reglement'), st = S.reglement || {};
  const autreZone = rg && rg.zone !== z.libelle;
  return h('div', { class: 'reglementZone', id: 'reglementZone' },
    h('button', { class: 'puce' + (st.encours ? ' chargement' : ''), type: 'button', id: 'lireReglement', disabled: !!st.encours, onclick: () => lireReglementZone(z) },
      st.encours ? '🤖 Lecture du règlement… (jusqu’à 1 min)' : rg && !autreZone ? '🤖 Relire le règlement' : '🤖 Lire le règlement de la zone ' + z.libelle),
    st.message ? h('div', { class: 'message petit ' + st.type, id: 'infoReglement' }, st.message) : null,
    rg && !autreZone ? h('div', { class: 'reglesZone', id: 'reglesZone' },
      h('b', {}, 'Règles de la zone ' + rg.zone + ' (lecture automatique' + (rg.pages ? ', pages ' + rg.pages : '') + ', à vérifier dans le règlement)'),
      h('dl', {}, T.REGLES_PLU.filter(([k]) => rg.regles[k]).map(([k, lib]) => [h('dt', {}, lib), h('dd', {}, rg.regles[k])])),
      (rg.autres || []).length ? h('ul', { class: 'listeTerrain' }, rg.autres.map(x => h('li', {}, x))) : null) : null,
    rg && autreZone ? h('div', { class: 'mut petit' }, 'Règles lues pour la zone ' + rg.zone + ' : le terrain est maintenant en zone ' + z.libelle + ', relisez le règlement.') : null);
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
    blocReglement(v, z),
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
    h('button', { class: 'gros sec' + (st.encours ? ' chargement' : ''), type: 'button', id: 'importerPlanTerrain', disabled: !!st.encours, onclick: () => choisirFichier({ accept: 'image/*,application/pdf' }, ([f]) => lirePlanTerrain(f)) },
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
      h('button', { class: 'gros' + (st.encours ? ' chargement' : ''), type: 'button', id: 'localiserAdresse', disabled: !!st.encours, onclick: () => localiserTerrain('adresse') }, st.encours ? '⏳ Recherche…' : '📍 Localiser par l’adresse'),
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
      h('button', { class: 'x', type: 'button', 'aria-label': 'Supprimer la photo', onclick: async () => { const lies = imagines(ph.id); if (!(await confirmer(lies.length ? 'Supprimer cette photo et ses ' + lies.length + ' image(s) imaginée(s) ?' : 'Supprimer cette photo ?'))) return;
        await changer(x => lies.reduce((w, im) => M.supprimer(w, 'photos', im.id), M.supprimer(x, 'photos', ph.id))); dessiner(); } }, '×'),
      ph.imaginerEnAttente ? h('div', { class: 'enAttenteImaginer petit' }, '⏳ En attente du réseau') : null,
      S.imaginer && S.imaginer.photoId === ph.id ? null : h('button', { class: 'puce imaginer imaginerTerrain', type: 'button', 'data-photo-terrain': ph.id, onclick: () => { S.imaginer = { photoId: ph.id, consigne: '' }; redessiner(); } }, '✨ Imaginer la maison')))) : null,
    photos.map(ph => [
      imagines(ph.id).map(im => h('div', { class: 'imagine', 'data-imagine': im.id },
        h('figure', {}, imagePhoto(im, 'imagineImg'), h('span', { class: 'badgeImagine' }, '✨ Imaginé'),
          h('button', { class: 'x', type: 'button', 'aria-label': 'Supprimer l’image imaginée', onclick: async () => { if (!(await confirmer('Supprimer cette image imaginée ?'))) return; await changer(x => M.supprimer(x, 'photos', im.id)); dessiner(); } }, '×')),
        h('div', { class: 'mut petit' }, (im.depuis ? '✏️ ' : '') + '« ' + (im.consigne || im.legende || '') + ' » ',
          h('button', { class: 'lienRetour', type: 'button', 'data-retoucher': im.id, onclick: () => { S.imaginer = { photoId: ph.id, depuis: im.id, consigne: '' }; dessiner(); } }, '✏️ Retoucher')))),
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
    // raccourcis : une note ou un plan à la main se lisent d'ici, sans chercher l'assistant ou l'étape Scan
    (() => { let info;
      const iScan = M.etapesDe(v).findIndex(e => e.id === 'scan');
      return h('div', { class: 'carte raccourcisIA', id: 'raccourcisIA' },
        h('b', {}, '⚡ Gagner du temps'),
        h('div', { class: 'rang', style: 'margin-top:8px;gap:8px;flex-wrap:wrap' },
          h('button', { class: 'gros sec', type: 'button', id: 'raccourciNote', style: 'flex:1 1 150px;margin:0', onclick: e => lireNote(e.currentTarget, info) }, '📷 Lire une note'),
          iScan >= 0 ? h('button', { class: 'gros sec', type: 'button', id: 'raccourciPlan', style: 'flex:1 1 150px;margin:0',
            onclick: () => choisirFichier({ accept: 'image/*,application/pdf', multiple: true }, fs => { allerEtape(iScan); lirePlan2D(fs); }) }, '🖼 Plan ou esquisse') : null),
        h('p', { class: 'mut petit', style: 'margin:6px 0 0' }, 'Note manuscrite : recopiée dans l’assistant, qui remplit la fiche. Plan ou esquisse à la main : l’IA en tire le dessin des pièces (étape Scan).'),
        info = h('div', { role: 'status', style: 'margin-top:6px' }),
        h('button', { class: 'lienRetour', type: 'button', id: 'raccourciAssistant', style: 'margin-top:4px', onclick: () => { S.ecran = 'assistant'; S.propAssistant = null; S.message = null; dessiner(); window.scrollTo(0, 0); } }, '🎙 Ouvrir l’assistant'));
    })(),
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
async function creerImageImaginee(visiteId, pieceId, photoId, consigne, depuis) {
  const rec = S.visites.find(r => r.id === visiteId), v = rec && rec.visite;
  const ph = v && v.photos[photoId], p = (v && v.pieces[pieceId]) || (ph && sujetImaginer(ph));
  if (!ph || ph.supprime || !p) throw { code: 'photo' };
  // retouche : on part de l'image déjà imaginée (seule la modification demandée change) ; elle reste rangée sous la photo d'origine
  const base = depuis && v.photos[depuis] && !v.photos[depuis].supprime ? v.photos[depuis] : null;
  const blob = await blobPhoto(base || ph);
  const data = await appelerFonction({ image: await enBase64(blob), mime: blob.type || 'image/jpeg', consigne, piece: p.nom, mode: base ? 'retouche' : (p.mode || 'piece') });
  if (!data || !data.image) throw { code: 'aucune_image' };
  const id = M.nouvelId();
  await stock.garderPhoto(id, visiteId, versBlob(data.image, data.mime));
  await changerVisite(visiteId, w => { let x = M.majElement(M.ajouterPhoto(w, { id, role: 'imagine', pieceId, legende: consigne }), 'photos', id,
    { source: photoId, consigne, modele: data.modele || '', creeLe: new Date().toISOString(), ...(base ? { depuis: base.id } : {}) });
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

/* attente qui rassure : étapes qui défilent et barre qui balaie, au lieu d'une phrase figée (l'IA peut prendre jusqu'à une minute) */
function attenteAnimee(el, etapes) {
  el.className = 'message att attenteIA'; el.textContent = '';
  const txt = h('span', { class: 'attenteTexte' }); let i = 0;
  const maj = () => { txt.textContent = etapes[Math.min(i++, etapes.length - 1)]; };
  maj(); el.append(h('span', { class: 'etincelle' }, '✨'), txt, h('div', { class: 'barreAttente' }, h('i')));
  const t = setInterval(maj, 5000); return () => clearInterval(t);
}

async function lancerImaginer(p, ph, consigne, btn, info, depuis) {
  consigne = consigne.trim();
  const dire = (t, type) => { info.textContent = t; info.className = 'message ' + (type || 'err'); };
  if (consigne.length < 3) return dire(MESSAGES_IMAGINER.consigne_absente, 'att');
  const enAttente = async () => {
    await mettreEnAttenteImaginer(p.id, ph.id, consigne);
    if (S.imaginer && S.imaginer.photoId === ph.id) S.imaginer = null;
    S.message = { type: 'att', texte: '⏳ Pas de réseau : la demande « ' + consigne + ' » est gardée. L’image sera créée toute seule au retour du réseau.' };
    vibrer(); redessiner();
  };
  if (navigator.onLine === false) return depuis ? dire('La retouche a besoin du réseau : réessayez une fois connecté.', 'att') : enAttente();
  if (!S.session) return dire('Connectez-vous (même compte que le suivi) pour utiliser Imaginer.', 'att');
  if (!supa.functions || !supa.functions.invoke) return dire(MESSAGES_IMAGINER.non_configure, 'att');
  const texte = btn.textContent; btn.disabled = true; btn.textContent = '✨ Création en cours… (jusqu’à une minute)';
  const arreter = attenteAnimee(info, ['Je regarde la pièce…', 'Je choisis les matériaux et la lumière…', 'Je dessine la pièce rénovée…', 'Dernières retouches…', 'Encore un instant, vous pouvez continuer la visite.']);
  try {
    const r = await creerImageImaginee(S.courante, p.id, ph.id, consigne, depuis);
    arreter();
    if (S.imaginer && S.imaginer.photoId === ph.id) S.imaginer = null;
    S.message = { type: 'ok', texte: '✨ Image créée pour « ' + r.piece + ' »' + (r.restant != null ? ' (encore ' + r.restant + ' aujourd’hui).' : '.') };
    vibrer(); dessiner();
  } catch (e) {
    arreter(); btn.disabled = false; btn.textContent = texte;
    if (e && e.code === 'reseau' && navigator.onLine === false && !depuis) return enAttente();
    dire(messageErreurImaginer(e));
  }
}

/* ---------- « ✨ Plan en couleur » : le plan coté redessiné par l'IA pour le client ----------
   Part de l'image du plan coté (planImage, envoyée par le moteur à la fermeture du plan) ;
   le résultat est une image d'intention (photo « planRendu »), en option dans le dossier client. */
function blocPlanRendu(v) {
  const pi = M.valeur(v, 'planImage'), src = pi && v.photos[pi.id], pr = M.valeur(v, 'planRendu'), img = pr && v.photos[pr.id] && !v.photos[pr.id].supprime ? v.photos[pr.id] : null;
  if (!src || src.supprime) return h('div', { class: 'mut petit', style: 'margin-top:6px' }, '✨ Plan en couleur : ouvrez puis fermez le plan pour en préparer l’image.');
  let info;
  const btn = h('button', { class: 'puce imaginer', type: 'button', id: 'planEnCouleur', style: 'margin-top:8px', onclick: async () => {
    const dire = (t, type) => { info.textContent = t; info.className = 'message petit ' + (type || 'err'); };
    if (!pretPourIA(dire, 'Le plan en couleur')) return;
    const lib = btn.textContent; btn.disabled = true; btn.textContent = '✨ Mise en couleur… (jusqu’à une minute)';
    try {
      const blob = await blobPhoto(src);
      const data = await appelerFonction({ image: await enBase64(blob), mime: blob.type || 'image/jpeg', consigne: 'plan', piece: 'Plan', mode: 'planRendu' });
      if (!data || !data.image) throw { code: 'aucune_image' };
      const id = M.nouvelId();
      await stock.garderPhoto(id, S.courante, versBlob(data.image, data.mime));
      await changer(w => { let x = w; const avant = M.valeur(x, 'planRendu'); if (avant && x.photos[avant.id]) x = M.supprimer(x, 'photos', avant.id);
        return M.modifier(M.ajouterPhoto(x, { id, role: 'planRendu', legende: 'Plan en couleur (image d’intention)' }), 'planRendu', { id, source: pi.id, modele: data.modele || '', creeLe: new Date().toISOString() }); });
      S.message = { type: 'ok', texte: '✨ Plan en couleur créé' + (data.restant != null ? ' (encore ' + data.restant + ' images aujourd’hui).' : '.') + ' Il est proposé dans le dossier client (option « Plan en couleur »).' };
      vibrer(); dessiner();
    } catch (e) { btn.disabled = false; btn.textContent = lib; dire(messageErreurImaginer(e)); }
  } }, img ? '✨ Refaire le plan en couleur' : '✨ Plan en couleur (IA)');
  return h('div', { id: 'blocPlanRendu' },
    img ? h('figure', { style: 'margin:8px 0 0' }, imagePhoto(img, 'planRenduImg'), h('figcaption', { class: 'mut petit' }, 'Plan en couleur, image d’intention générée par IA : vérifiez-le avant de le montrer (l’IA peut déformer une pièce).')) : null,
    btn, info = h('div', { role: 'status' }));
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
/* des styles en un toucher : la phrase s'ajoute à la consigne, que l'on peut encore retoucher */
const STYLES_IMAGINER = [['Moderne', 'style moderne épuré, blanc et gris, lignes droites, éclairage intégré'],
  ['Scandinave', 'style scandinave, bois clair, blanc, textiles naturels, très lumineux'],
  ['Industriel', 'style industriel, métal noir, brique ou béton, bois brut'],
  ['Contemporain chic', 'style contemporain haut de gamme, marbre ou pierre, laiton, tons chauds'],
  ['Classique', 'style classique, moulures, parquet en chevrons, tons doux'],
  ['Campagne', 'style campagne chic, bois patiné, pierre, couleurs naturelles']];
function panneauImaginer(p, ph) {
  const st = S.imaginer;
  let info;
  const terrain = p.mode === 'terrain', facade = p.mode === 'facade', retouche = !!st.depuis;
  const ta = h('textarea', { class: 'in', rows: 3, value: st.consigne || '', 'aria-label': terrain ? 'Consigne pour imaginer la maison' : 'Consigne pour imaginer la pièce', autocapitalize: 'sentences',
    placeholder: terrain ? 'Ex. : maison plain-pied contemporaine, enduit blanc, toit deux pans ardoise, garage accolé à gauche'
      : facade ? 'Ex. : extension plain-pied à droite, toit plat, bardage bois, grande baie vitrée' : 'Ex. : cuisine blanche, plan de travail bois, carrelage gris clair, suspensions noires',
    oninput: e => { st.consigne = e.target.value; } });
  const aide = h('div', { class: 'aide info' });
  if (retouche) ta.placeholder = 'Seulement ce qui change. Ex. : carrelage plus foncé, retirer la suspension, mur du fond vert sauge';
  const btn = h('button', { class: 'gros', type: 'button', onclick: () => lancerImaginer(p, ph, ta.value, btn, info, st.depuis) }, retouche ? '✏️ Retoucher l’image' : '✨ Créer l’image');
  return h('div', { class: 'carte panneauImaginer', 'data-imaginer': ph.id },
    h('b', {}, retouche ? '✏️ Retoucher l’image imaginée (le reste ne change pas)' : terrain ? '✨ Imaginer la maison sur ce terrain' : facade ? '✨ Imaginer l’agrandissement' : '✨ Imaginer cette pièce rénovée'),
    h('div', { class: 'champMicro' }, ta, boutonMicro(ta, aide), aide),
    !terrain && !retouche ? h('div', { class: 'puces stylesImaginer', style: 'margin-top:6px' }, STYLES_IMAGINER.map(([nom, phrase]) => h('button', { class: 'puce', type: 'button', 'data-style': nom,
      onclick: () => { const t = ta.value.trim(); ta.value = st.consigne = (t ? t.replace(/[.,;]\s*$/, '') + ', ' : '') + phrase; } }, nom))) : null,
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
        if (!(await confirmer('Supprimer la pièce « ' + p.nom + ' » et ses photos ?'))) return;
        await changer(x => toutes.reduce((w, ph) => M.supprimer(w, 'photos', ph.id), M.supprimer(x, 'pieces', p.id)));
        dessiner();
      } }, '🗑')),
    photos.map((ph, i) => [
      h('div', { class: 'photoLegende', 'data-photo': ph.id },
        h('figure', {}, imagePhoto(ph),
          h('button', { class: 'x', type: 'button', 'aria-label': 'Supprimer la photo', onclick: async () => {
            const lies = imagines(ph.id);
            if (!(await confirmer(lies.length ? 'Supprimer cette photo et ses ' + lies.length + ' image(s) imaginée(s) ?' : 'Supprimer cette photo ?'))) return;
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
            if (!(await confirmer('Supprimer cette image imaginée ?'))) return;
            await changer(x => M.supprimer(x, 'photos', im.id)); dessiner();
          } }, '×')),
        h('div', { class: 'mut petit' }, (im.depuis ? '✏️ ' : '') + '« ' + (im.consigne || im.legende || '') + ' » ',
          h('button', { class: 'lienRetour', type: 'button', 'data-retoucher': im.id, onclick: () => { S.imaginer = { photoId: ph.id, depuis: im.id, consigne: '' }; dessiner(); } }, '✏️ Retoucher')))),
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
  const importer = async () => {
    // un plan déjà retouché n'est jamais remplacé en silence : il est mis de côté
    if (plan && !(await confirmer('Un plan existe déjà pour cette visite. Le remplacer par un nouveau scan ?\n(L’ancien plan reste gardé de côté.)'))) return;
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
      : h('p', { class: 'mut' }, 'Trois façons de faire le plan : le scan de l’iPhone, la photo d’un plan ou d’une esquisse, ou les pièces dessinées au doigt.'),
    scan ? h('div', { class: 'carte' }, h('b', {}, '📄 ' + scan.nom), h('div', { class: 'mut petit' }, Math.round((scan.taille || 0) / 1024) + ' Ko · importé le ' + dateCourte(scan.importeLe))) : null,
    plan ? h('div', { class: 'carte', id: 'resumePlan' }, h('b', {}, '📐 Plan'), h('div', { class: 'mut petit' }, resumePlan(plan.resume)), blocPlanRendu(v)) : null,
    blocAnnotations(v),
    ecarte ? h('div', { class: 'message att' }, 'Une autre version du plan, modifiée sur un autre appareil, a été gardée de côté' + (ecarte.resume ? ' (' + resumePlan(ecarte.resume) + ')' : '') + '. ',
      h('div', { class: 'rang', style: 'margin-top:8px' },
        h('button', { class: 'puce', type: 'button', onclick: async () => {
          await changer(w => M.modifier(M.modifier(w, 'plan', M.valeur(w, 'plan.ecarte')), 'plan.ecarte', M.valeur(w, 'plan')));
          dessiner();
        } }, 'Ouvrir cette version'),
        h('button', { class: 'puce', type: 'button', onclick: async () => {
          if (!(await confirmer('Oublier définitivement cette autre version du plan ?'))) return;
          await poser('plan.ecarte', null); dessiner();
        } }, 'L’oublier'))) : null,
    // une pièce scannée à part : elle s'ajoute dans le plan, pas en remplaçant le scan
    plan ? h('p', { class: 'mut petit' }, 'Pièces scannées séparément ? Ouvrez le plan, puis « ＋ Scan » pour chaque autre scan et « 🔗 Relier » : touchez un mur, puis le mur de l’autre scan qui le touche.') : null,
    scan || plan ? h('button', { class: 'gros', id: 'ouvrirPlan', onclick: ouvrirPlan }, '📐 Ouvrir le plan') : null,
    // en construction, pas de maison à scanner : le bouton du scan ne vient que s'il y en a déjà un
    neuf && !scan ? null : h('div', { style: 'margin-top:10px' }, h('button', { class: scan || plan ? 'gros sec' : 'gros', id: 'importerScan', onclick: importer }, scan ? 'Remplacer le scan' : '📐 Importer le scan'),
      scan ? null : h('p', { class: 'mut petit', style: 'margin:4px 0 0' }, 'OpenPlan 3D › « Export Editable Plan (JSON) », puis choisissez le fichier.')),
    // sans scan LiDAR : des pièces rectangulaires posées au doigt (dessin.js), puis le même moteur de plan
    h('div', { style: 'margin-top:10px' }, h('button', { class: 'gros sec', id: 'dessinRapide', onclick: () => { S.ecran = 'dessin'; S.dessinSel = null; S.message = null; dessiner(); window.scrollTo(0, 0); } },
      M.valeur(v, 'dessin') ? '✏️ Reprendre le dessin rapide' : '✏️ Dessin rapide (sans scan)'),
      h('p', { class: 'mut petit', style: 'margin:4px 0 0' }, 'Les pièces au doigt : longueur × largeur, puis glissées à leur place.')),
    // un plan 2D existant (magicplan, architecte, photo d'un plan papier) : l'IA en relève les pièces
    h('div', { style: 'margin-top:10px' }, h('button', { class: 'gros sec' + (S.lecturePlan && S.lecturePlan.encours ? ' chargement' : ''), id: 'importerPlan2D', disabled: !!(S.lecturePlan && S.lecturePlan.encours),
      onclick: () => choisirFichier({ accept: 'image/*,application/pdf', multiple: true }, fs => lirePlan2D(fs)) },
      S.lecturePlan && S.lecturePlan.encours ? '🖼 Lecture du plan' + (S.lecturePlan.rang ? ' ' + S.lecturePlan.rang : '') + '… (jusqu’à une minute)' : '🖼 Plan 2D ou esquisses (photo, image, PDF)'),
      h('p', { class: 'mut petit', style: 'margin:4px 0 0' }, 'Photo d’un plan ou d’esquisses à la main (plusieurs d’un coup) : l’IA relève pièces, cotes, portes et radiateurs ; vous vérifiez.')),
    S.lecturePlan && S.lecturePlan.message ? h('div', { class: 'message ' + S.lecturePlan.type, id: 'infoPlan2D' }, S.lecturePlan.message) : null,
    S.lecturePlan && S.lecturePlan.parties ? h('div', { class: 'carte', id: 'partiesPlan' },
      h('b', {}, '🖼 Plusieurs plans sur « ' + S.lecturePlan.nom + ' » : lequel dessiner ?'),
      S.lecturePlan.parties.map(p => h('button', { class: 'gros sec', type: 'button', style: 'margin-top:8px', 'data-partie': p.nom, onclick: () => appliquerPartiePlan(p, S.lecturePlan.nom) },
        p.nom + ' — ' + p.pieces.length + ' pièce' + (p.pieces.length > 1 ? 's' : '') + ', ' + String(Math.round(p.pieces.reduce((t, q) => t + q.longueur * q.largeur, 0))) + ' m²')),
      // tout importer : chaque plan devient un groupe de pièces, posé à droite du précédent (à replacer au doigt)
      h('button', { class: 'gros', type: 'button', id: 'toutesPartiesPlan', style: 'margin-top:8px', onclick: () => proposerPlacement(S.lecturePlan.parties.map(p => ({ nom: S.lecturePlan.nom, partie: p })), S.lecturePlan.echecs || []) }, '＋ Tout importer (' + S.lecturePlan.parties.length + ' plans)'),
      h('button', { class: 'lienRetour', type: 'button', style: 'margin-top:8px', onclick: () => { S.lecturePlan = null; redessiner(); } }, 'Annuler')) : null,
    S.lecturePlan && S.lecturePlan.choix ? h('div', { class: 'carte', id: 'choixPlacement' },
      h('b', {}, '🖼 ' + S.lecturePlan.choix.reduce((t, g) => t + g.partie.pieces.length, 0) + ' pièce(s) lue(s). Un dessin rapide existe déjà (' + ((M.valeur(v, 'dessin') || {}).pieces || []).length + ' pièces) :'),
      h('button', { class: 'gros', type: 'button', id: 'ajouterAuDessin', style: 'margin-top:8px', onclick: () => appliquerGroupes(S.lecturePlan.choix, 'ajouter', S.lecturePlan.echecs) }, '＋ Ajouter au dessin'),
      h('button', { class: 'gros sec', type: 'button', id: 'remplacerDessin', style: 'margin-top:8px', onclick: async () => { if ((await confirmer('Remplacer tout le dessin rapide par les pièces lues ?'))) appliquerGroupes(S.lecturePlan.choix, 'remplacer', S.lecturePlan.echecs); } }, 'Remplacer le dessin'),
      h('button', { class: 'lienRetour', type: 'button', style: 'margin-top:8px', onclick: () => { S.lecturePlan = null; redessiner(); } }, 'Annuler')) : null,
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
  // lecture enrichie : portes et fenêtres, équipements, hauteur et notes de chaque pièce (dessin.js)
  const lus = groupes.map(g => DR.dessinDepuisLecture(g.partie.pieces, () => M.nouvelId().slice(0, 8)));
  // un plan d'étage, de mezzanine ou de combles importé avec le rez-de-chaussée va sur son propre étage
  // (nommé comme sur l'esquisse), posé en haut à gauche : on le glisse ensuite au-dessus de sa pièce
  const avantD = M.valeur(visite(), 'dessin'), garde0 = mode === 'ajouter' && avantD && Array.isArray(avantD.pieces) ? avantD.pieces : [];
  const etages = DR.nomsEtages(mode === 'ajouter' && avantD ? avantD.etages : null, garde0);
  const HAUT = /mezzanine|étage|etage|combles|r\s*\+\s*[1-9]|niveau\s*[1-9]|1er/i;
  if (groupes.length > 1 || garde0.length) groupes.forEach((g, i) => {
    if (!HAUT.test(g.partie.nom || '') || !lus[i].pieces.length) return;
    const nom = String(g.partie.nom).slice(0, 40); let k = etages.indexOf(nom); if (k < 0) { etages.push(nom); k = etages.length - 1; }
    lus[i].pieces.forEach(p => { p.etage = k; }); const p0 = lus[i].pieces.find(p => !p.contre); if (p0) p0.libre = { x: 0, y: 0 };
    lus[i].etageNom = nom;
  });
  const nouvelles = lus.flatMap(l => l.pieces);
  if (!nouvelles.length) { S.lecturePlan = { message: 'Aucune pièce exploitable sur ce plan.', type: 'err' }; return redessiner(); }
  const avant = M.valeur(visite(), 'dessin'), ajout = mode === 'ajouter' && avant && Array.isArray(avant.pieces), garde = ajout ? avant.pieces : [];
  const sources = [...(ajout && Array.isArray(avant.sources) ? avant.sources : ajout && avant.source ? [avant.source] : []),
    ...groupes.map(g => ({ fichier: String(g.nom || '').slice(0, 120), partie: g.partie.nom, luLe: new Date().toISOString() }))].slice(-30);
  const pieces = [...garde, ...nouvelles].slice(0, 60), ouvLues = lus.flatMap(l => l.ouvertures).filter(o => pieces.some(p => p.id === o.piece));
  const symLus = DR.symbolesDepuisEquipements(lus.flatMap(l => l.equipements), pieces, DR.placer(pieces).rect, () => M.nouvelId().slice(0, 8));
  // ajouter : ce qui était déjà dessiné (étages, ouvertures, symboles, toiture) est gardé tel quel
  await poser('dessin', { ...(ajout ? avant : {}), pieces, hauteur: (avant && avant.hauteur) || 2.5, source: sources[sources.length - 1], sources, ...(etages.length > 1 ? { etages } : {}),
    ouvertures: [...(ajout && Array.isArray(avant.ouvertures) ? avant.ouvertures : []), ...ouvLues].slice(0, 300),
    symboles: [...(ajout && Array.isArray(avant.symboles) ? avant.symboles : []), ...symLus].slice(0, 200) });
  const n = nouvelles.length, pl = n > 1 ? 's' : '';
  // ce que l'IA a jugé douteux (rature, cote contradictoire) : dit au métreur, à vérifier en priorité
  const doutes = groupes.flatMap(g => Array.isArray(g.partie.doutes) ? g.partie.doutes : []).map(t => String(t).slice(0, 160)).slice(0, 8);
  const nNotes = nouvelles.filter(p => p.note).length, nH = nouvelles.filter(p => p.hauteur).length;
  const lu = [ouvLues.length ? ouvLues.length + ' porte' + (ouvLues.length > 1 ? 's et fenêtres' : ' ou fenêtre') : '', symLus.length ? symLus.length + ' équipement' + (symLus.length > 1 ? 's' : '') : '',
    nH ? nH + ' hauteur' + (nH > 1 ? 's' : '') + ' sous plafond' : '', nNotes ? nNotes + ' note' + (nNotes > 1 ? 's' : '') + ' (annotations, projet en rouge)' : ''].filter(Boolean).join(', ');
  S.lecturePlan = null; S.dessinSel = null; S.ecran = 'dessin';
  S.message = { type: 'att', texte: '🖼 ' + n + ' pièce' + pl + ' lue' + pl + (groupes.length > 1 ? ' sur ' + groupes.length + ' esquisses' : ' sur le plan (« ' + groupes[0].partie.nom + ' »)') + (garde.length ? ', ajoutée' + pl + ' au dessin' : '') + '. '
    + (groupes.length > 1 || garde.length ? 'Touchez chaque pièce ajoutée pour la poser contre sa voisine (à droite, en dessous…). ' : '')
    + (lus.some(l => l.etageNom) ? '« ' + lus.filter(l => l.etageNom).map(l => l.etageNom).join(' », « ') + ' » est posé sur son propre étage (onglet au-dessus du dessin) : glissez-le au-dessus de sa pièce, le rez-de-chaussée s’affiche en filigrane. ' : '')
    + (lu ? 'Lu aussi : ' + lu + '. ' : '')
    + (doutes.length ? '⚠️ À vérifier : ' + doutes.join(' · ') + '. ' : '')
    + 'Vérifiez les dimensions, les portes, fenêtres et équipements (l’IA peut se tromper, surtout sur une esquisse raturée), puis « ✓ Créer le plan ».' + ((echecs || []).length ? ' Non lu : ' + echecs.join(' ') : '') };
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
  const blob = fond.blob || await blobPhoto(fond.photo).catch(() => null);
  if (!blob) return montrerMessage('err', 'L’image du plan n’est pas lisible sur cet appareil (pas encore téléchargée ?). Réessayez avec le réseau.');
  const id = M.nouvelId(), avant = annotationsDe(visite());
  await stock.garderPhoto(id, S.courante, blob);
  await changer(w => {
    let x = M.ajouterPhoto(w, { id, role: 'fondAnnote' });
    if (avant.fondId && x.photos[avant.fondId]) x = M.supprimer(x, 'photos', avant.fondId);
    // repartir d'un plan à jour garde les annotations déjà faites (à vérifier)
    return M.modifier(x, 'annotations', { ...avant, fondId: id, source: fond.source, empreinte: fond.empreinte });
  });
  S.retourAnnot = fond.retour || null; S.annotVue = 'apres';
  S.ecran = 'annoter'; S.message = null; dessiner(); window.scrollTo(0, 0);
}
const empreinteTexte = async t => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))).slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
const blobDepuisDataUrl = async u => (await fetch(u)).blob();
/* avant / après depuis le dessin rapide : l'aperçu du dessin (étage affiché) devient le fond */
async function avantApresDessin() {
  const d = dessinCourant(); if (!d.pieces.length) return montrerMessage('att', 'Ajoutez d’abord une pièce.');
  const R = DR.releveDepuisDessin(d.pieces, { hauteur: d.hauteur, etages: d.etages, ouvertures: d.ouvertures, symboles: d.symboles, toiture: d.toiture });
  const svg = apercuDessin(d, R, { exporter: true });
  const vb = svg.getAttribute('viewBox').split(' ').map(Number), L = 1600, H = Math.round(L * vb[3] / vb[2]);
  svg.setAttribute('width', L); svg.setAttribute('height', H); svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg)); });
  const cv = document.createElement('canvas'); cv.width = L; cv.height = H;
  const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, L, H); c.drawImage(img, 0, 0, L, H);
  const blob = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.9));
  await commencerAnnotations({ blob, source: 'dessin', empreinte: await empreinteTexte(JSON.stringify([d.pieces, d.ouvertures, d.symboles, etageDessin()])), retour: 'dessin' });
}
/* avant / après depuis le plan coté : le moteur rend l'image du plan du moment */
let attenteImagePlan = null;
async function avantApresPlan() {
  const cadre = document.getElementById('cadrePlan'); if (!cadre || !cadre.contentWindow) return;
  const image = await new Promise(ok => { attenteImagePlan = ok; cadre.contentWindow.postMessage({ type: 'releve:image' }, location.origin); setTimeout(() => ok(null), 8000); });
  attenteImagePlan = null;
  if (!image) return erreurPlan('L’image du plan n’a pas pu être préparée : réessayez.');
  await fermerPlan();
  await commencerAnnotations({ blob: await blobDepuisDataUrl(image), source: 'plan', empreinte: await empreinteTexte(image), retour: 'plan' });
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
  if (!st.taille) st.taille = 'm'; if (!st.police) st.police = 'normal';
  let elements = a.elements.slice(), img = null, enCours = null;
  const cv = h('canvas', { class: 'toileAnnot', id: 'toileAnnot', 'aria-label': 'Plan à annoter' });
  /* le zoom de la toile : deux doigts pour pincer et se déplacer, ou les boutons ; un doigt dessine */
  const cadre = h('div', { class: 'cadreZoomAnnot' }, cv);
  let zoom = { s: 1, x: 0, y: 0 };
  const appliquerZoom = () => { const r = cadre.getBoundingClientRect(); zoom = cadrerZoom(zoom, r.width || 1, r.height || 1); cv.style.transform = 'translate(' + zoom.x + 'px,' + zoom.y + 'px) scale(' + zoom.s + ')'; cadre.dataset.zoom = zoom.s.toFixed(2); };
  const centreCadre = e => { const r = cadre.getBoundingClientRect(); return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2]; };
  const doigts = new Map(); let pince = null, ignorer = false;
  const peindre = () => { if (!img) return; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(img, 0, 0, cv.width, cv.height); AN.rendre(c, cv.width, cv.height, enCours ? [...elements, enCours] : elements); };
  const garder = () => changer(w => M.modifier(w, 'annotations', { ...AN.nettoyer(M.valeur(w, 'annotations')), elements }));
  const pos = e => { const r = cv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
  blobPhoto(v.photos[a.fondId]).then(imageDepuisBlob).then(i => { img = i; cv.width = Math.min(2000, i.naturalWidth); cv.height = Math.round(i.naturalHeight * cv.width / i.naturalWidth); peindre(); })
    .catch(() => montrerMessage('err', 'L’image du plan n’est pas lisible sur cet appareil.'));
  let depart = null;
  cv.addEventListener('pointerdown', e => { if (!img) return; e.preventDefault(); cv.setPointerCapture(e.pointerId);
    doigts.set(e.pointerId, centreCadre(e));
    if (doigts.size === 2) {
      // un second doigt : on pince (le trait commencé est abandonné)
      enCours = null; depart = null; ignorer = true; peindre();
      const P = [...doigts.values()];
      pince = { zoom: { ...zoom }, d: Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]) || 1, m: [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2] };
      return;
    }
    if (ignorer || doigts.size > 2) return;
    depart = pos(e);
    enCours = st.outil === 'trait' ? { type: 'trait', c: st.couleur, p: [depart] } : st.outil === 'fleche' ? { type: 'fleche', c: st.couleur, a: depart, b: depart } : null; });
  cv.addEventListener('pointermove', e => {
    if (doigts.has(e.pointerId)) doigts.set(e.pointerId, centreCadre(e));
    if (pince && doigts.size >= 2) {
      const P = [...doigts.values()], d = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), m = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
      const z = zoomerToile(pince.zoom, d / pince.d, pince.m[0], pince.m[1]);
      zoom = { s: z.s, x: z.x + m[0] - pince.m[0], y: z.y + m[1] - pince.m[1] }; appliquerZoom(); return;
    }
    if (!enCours) return; e.preventDefault(); const q = pos(e);
    if (enCours.type === 'trait') enCours.p.push(q); else enCours.b = q; peindre(); });
  const lacher = () => { if (doigts.size < 2) pince = null; if (!doigts.size) ignorer = false; };
  cv.addEventListener('pointerup', async e => {
    doigts.delete(e.pointerId); lacher();
    if (!depart) return; const q = pos(e), d = depart; depart = null;
    if (st.outil === 'texte') {
      // toucher un texte le reprend (modifier, supprimer) ; ailleurs, un nouveau texte à cet endroit
      const c = cv.getContext('2d'), i = AN.texteSous(c, cv.width, cv.height, elements, d[0] * cv.width, d[1] * cv.height);
      ouvrirPanneauTexte(i >= 0 ? { index: i } : { x: d[0], y: d[1] });
      enCours = null; return;
    } else if (enCours) {
      const el = enCours.type === 'trait' ? { ...enCours, p: AN.simplifier(enCours.p) } : enCours;
      enCours = null;
      const propre = AN.nettoyer({ elements: [el] }).elements[0];
      if (propre) elements.push(propre);
    }
    enCours = null; peindre(); await garder(); majCompte();
  });
  cv.addEventListener('pointercancel', e => { doigts.delete(e.pointerId); lacher(); enCours = null; depart = null; peindre(); });
  cadre.addEventListener('wheel', e => { e.preventDefault(); const c = centreCadre(e); zoom = zoomerToile(zoom, e.deltaY < 0 ? 1.2 : 1 / 1.2, c[0], c[1]); appliquerZoom(); }, { passive: false });
  /* le panneau du texte : tapé ou dicté (🎤), taille et style ; reprend un texte touché */
  let edition = null;
  const zoneTexte = h('textarea', { class: 'in', rows: 2, name: 'texteAnnot', 'aria-label': 'Texte de l’annotation', autocapitalize: 'sentences', placeholder: 'Ex. : démolir la cloison / ouverture 2,40 m (« / » pour aller à la ligne)' });
  const aideTexte = h('div', { class: 'aide info' });
  const choix = (liste, cle, attr) => h('div', { class: 'puces' }, liste.map(([k, lib]) => h('button', { class: 'puce' + (st[cle] === k ? ' on' : ''), type: 'button', [attr]: k,
    onclick: e => { st[cle] = k; e.currentTarget.parentNode.querySelectorAll('.puce').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, lib)));
  const supprimerTexte = h('button', { class: 'gros sec', type: 'button', id: 'supprimerTexte', onclick: async () => {
    if (edition && edition.index != null) { elements.splice(edition.index, 1); peindre(); await garder(); majCompte(); } fermerPanneauTexte(); } }, '🗑 Supprimer');
  const panneauTexte = h('div', { class: 'carte panneauTexte', id: 'panneauTexte', hidden: true },
    h('b', { id: 'titreTexte' }, 'Texte'),
    h('div', { class: 'champMicro' }, zoneTexte, boutonMicro(zoneTexte, aideTexte), aideTexte),
    h('div', { class: 'champ' }, 'TAILLE'), choix(AN.TAILLES, 'taille', 'data-taille'),
    h('div', { class: 'champ' }, 'STYLE'), choix(AN.POLICES, 'police', 'data-police'),
    h('div', { class: 'rang', style: 'margin-top:8px' },
      h('button', { class: 'gros sec', type: 'button', onclick: () => fermerPanneauTexte() }, 'Annuler'), supprimerTexte,
      h('button', { class: 'gros', type: 'button', id: 'placerTexte', onclick: async () => {
        const t = zoneTexte.value.trim(); if (!t) return fermerPanneauTexte();
        const el = AN.nettoyer({ elements: [{ type: 'texte', c: st.couleur, t, taille: st.taille, police: st.police,
          x: edition.index != null ? elements[edition.index].x : edition.x, y: edition.index != null ? elements[edition.index].y : edition.y }] }).elements[0];
        if (el) { if (edition.index != null) elements[edition.index] = el; else elements.push(el); }
        peindre(); await garder(); majCompte(); fermerPanneauTexte(); } }, '✓ Placer')));
  const ouvrirPanneauTexte = ed => {
    edition = ed; const e = ed.index != null ? elements[ed.index] : null;
    if (e) { st.taille = e.taille || 'm'; st.police = e.police || 'normal'; st.couleur = e.c; marquer(); }
    zoneTexte.value = e ? e.t : '';
    panneauTexte.querySelectorAll('[data-taille]').forEach(b => b.classList.toggle('on', b.dataset.taille === st.taille));
    panneauTexte.querySelectorAll('[data-police]').forEach(b => b.classList.toggle('on', b.dataset.police === st.police));
    panneauTexte.querySelector('#titreTexte').textContent = e ? 'Modifier le texte' : 'Nouveau texte';
    supprimerTexte.hidden = !e; panneauTexte.hidden = false; zoneTexte.focus();
  };
  const fermerPanneauTexte = () => { edition = null; panneauTexte.hidden = true; arreterDictee(); };
  const compte = h('span', { class: 'mut petit', id: 'compteAnnot' });
  const majCompte = () => { compte.textContent = AN.resume(elements); };
  majCompte();
  // changer d'outil ou de couleur ne redessine pas l'écran (le plan resterait à recharger)
  const aideOutil = h('span', { class: 'mut petit', id: 'aideOutil' });
  const marquer = () => {
    document.querySelectorAll('[data-outil]').forEach(x => { const on = x.dataset.outil === st.outil; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    document.querySelectorAll('[data-couleur]').forEach(x => { const on = x.dataset.couleur === st.couleur; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    aideOutil.textContent = st.outil === 'texte' ? 'Touchez le plan à l’endroit du texte (ou un texte pour le modifier).' : st.outil === 'fleche' ? 'Tirez du départ vers la pointe.' : 'Dessinez au doigt sur le plan.';
  };
  marquer();
  const fonds = fondsAnnotation(v), aJour = fonds.find(f => f.source === a.source);
  const perime = aJour && a.empreinte && aJour.empreinte !== a.empreinte;
  // retour là d'où l'on vient : dessin rapide, plan coté, ou étape Scan
  const retour = () => { const r = S.retourAnnot; S.retourAnnot = null;
    if (r === 'dessin') { S.ecran = 'dessin'; } else if (r === 'plan') { ouvrirPlan(); return; } else { S.ecran = 'visite'; S.etape = Math.max(0, M.etapesDe(visite()).findIndex(x => x.id === 'scan')); }
    dessiner(); window.scrollTo(0, 0); };
  /* avant / après : à gauche le plan tel qu'il est, à droite la copie annotée (les travaux) ;
     sur iPhone, deux onglets basculent de l'un à l'autre */
  const vue = S.annotVue === 'avant' ? 'avant' : 'apres';
  const basculer = q => { S.annotVue = q; document.querySelectorAll('[data-vue-annot]').forEach(b => b.classList.toggle('on', b.dataset.vueAnnot === q));
    const duo = document.getElementById('duoAvantApres'); if (duo) duo.dataset.vue = q; };
  const avant = h('section', { class: 'carte coteAvant', id: 'planAvant' },
    h('b', {}, 'Avant · plan actuel'), h('p', { class: 'mut petit', style: 'margin:2px 0 8px' }, 'Touchez-le pour l’agrandir.'),
    imagePhoto(v.photos[a.fondId], 'imageAvant'));
  return [
    h('header', { class: 'haut' }, h('button', { class: 'lienRetour', onclick: retour }, S.retourAnnot === 'dessin' ? '‹ Dessin' : S.retourAnnot === 'plan' ? '‹ Plan' : '‹ Visite'), h('span', { class: 'titre' }, 'Avant / après'), pastilleEtat()),
    h('main', { class: 'ecranAnnot' },
      h('div', { class: 'puces ongletsAvantApres', role: 'tablist' },
        h('button', { class: 'puce' + (vue === 'avant' ? ' on' : ''), type: 'button', 'data-vue-annot': 'avant', onclick: () => basculer('avant') }, 'Avant'),
        h('button', { class: 'puce' + (vue === 'apres' ? ' on' : ''), type: 'button', 'data-vue-annot': 'apres', onclick: () => basculer('apres') }, 'Après travaux (annoté)')),
      S.message && h('div', { class: 'message ' + S.message.type }, S.message.texte),
      perime ? h('div', { class: 'message att', id: 'planChange' }, 'Le plan a changé depuis le début des annotations. ',
        h('button', { class: 'lienRetour', type: 'button', onclick: () => commencerAnnotations(aJour) }, 'Repartir du plan à jour (les annotations sont gardées, à vérifier)')) : null,
      h('div', { class: 'duoAvantApres', id: 'duoAvantApres', 'data-vue': vue }, avant,
      h('section', { class: 'coteApres', id: 'planApres' },
      h('b', { class: 'titreApres' }, 'Après travaux · annotez les travaux à faire'),
      h('div', { class: 'puces barreAnnot', role: 'toolbar' },
        AN.OUTILS.map(([k, lib]) => h('button', { class: 'puce' + (st.outil === k ? ' on' : ''), type: 'button', 'data-outil': k, 'aria-pressed': String(st.outil === k), onclick: () => { st.outil = k; marquer(); } }, lib)),
        AN.COULEURS.map(([c, lib]) => h('button', { class: 'puce pastilleCouleur' + (st.couleur === c ? ' on' : ''), type: 'button', 'data-couleur': c, 'aria-label': 'Couleur ' + lib, 'aria-pressed': String(st.couleur === c), style: '--c:' + c, onclick: () => { st.couleur = c; marquer(); } }, '●')),
        h('button', { class: 'puce', type: 'button', id: 'annulerAnnot', onclick: async () => { elements.pop(); peindre(); await garder(); majCompte(); } }, '↶ Annuler'),
        h('button', { class: 'puce', type: 'button', id: 'effacerAnnot', onclick: async () => { if (!elements.length || !(await confirmer('Effacer toutes les annotations de ce plan ?'))) return; elements = []; peindre(); await garder(); majCompte(); } }, '🗑 Tout effacer')),
      panneauTexte,
      h('div', { class: 'carte cadreAnnot' }, cadre),
      h('div', { class: 'puces zoomAnnot' },
        h('button', { class: 'puce', type: 'button', id: 'zoomPlus', onclick: () => { zoom = zoomerToile(zoom, 1.5); appliquerZoom(); } }, '🔍 ＋'),
        h('button', { class: 'puce', type: 'button', id: 'zoomMoins', onclick: () => { zoom = zoomerToile(zoom, 1 / 1.5); appliquerZoom(); } }, '🔍 −'),
        h('button', { class: 'puce', type: 'button', id: 'zoomRaz', onclick: () => { zoom = { s: 1, x: 0, y: 0 }; appliquerZoom(); } }, '⟲ 100 %'),
        h('span', { class: 'mut petit' }, 'Deux doigts pour zoomer et se déplacer.')),
      h('div', { class: 'rang', style: 'justify-content:space-between;margin-top:6px' }, compte, aideOutil))),
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
      h('span', { class: 'titre' }, 'Plan · ' + M.intitule(v)),
      h('button', { class: 'puce', type: 'button', id: 'avantApresPlan', onclick: e => { e.currentTarget.disabled = true; avantApresPlan().finally(() => { const b = document.getElementById('avantApresPlan'); if (b) b.disabled = false; }); } }, '🖍 Avant / après'), pastilleEtat()),
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
  /* les images du plan dessiné et de la vue 3D (dossier client) : gardées seulement si elles ont changé */
  const nouvelleImage = async (url, champ) => {
    if (typeof url !== 'string' || !/^data:image\/jpeg;base64,/.test(url) || url.length >= 4000000) return null;
    const empreinte = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url)))).slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
    const avant = M.valeur(visite(), champ);
    if (avant && avant.empreinte === empreinte) return null;
    const im = { id: M.nouvelId(), empreinte };
    await stock.garderPhoto(im.id, S.courante, await (await fetch(url)).blob());
    return im;
  };
  const images = [[await nouvelleImage(m.imagePlan, 'planImage'), 'planImage', 'dessinPlan'], [await nouvelleImage(m.image3d, 'plan3dImage'), 'plan3dImage', 'dessin3d']];
  await changer(w => {
    let x = w;
    for (const [image, champ, role] of images) {
      if (!image) continue;
      const avant = M.valeur(x, champ);
      if (avant && x.photos[avant.id]) x = M.supprimer(x, 'photos', avant.id);
      x = M.modifier(M.ajouterPhoto(x, { id: image.id, role }), champ, image);
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
    else if (m.type === 'releve:imagePlan' && attenteImagePlan) attenteImagePlan(typeof m.image === 'string' && /^data:image\/jpeg;base64,/.test(m.image) ? m.image : null);
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
  // l'écran « Waouh » : l'essentiel d'un coup d'œil, avant le détail (photo, projet, avant/après, budget face à l'enveloppe)
  const heros = (() => {
    const est = (M.valeur(v, 'budget') || {}).estimation, env = M.valeur(v, 'projet.enveloppe');
    const phs = M.actifs(v.photos), im = phs.find(x => x.role === 'imagine' && phs.find(y => y.id === x.source && !y.supprime));
    const src = im && phs.find(y => y.id === im.source);
    const stats = [['🛋', M.actifs(v.pieces).length, 'pièce(s)'], ['📷', phs.filter(x => x.role !== 'imagine').length, 'photo(s)'], ['✨', phs.filter(x => x.role === 'imagine').length, 'imagée(s)'],
      ['📐', M.valeur(v, 'plan') ? '✓' : '—', 'plan']].filter(x => x[1] !== 0 && x[1] !== '—');
    const sous = [[c('ville')].filter(Boolean).join(''), listeTypes.slice(0, 3).join(' · ')].filter(Boolean).join(' · ');
    return h('section', { class: 'heros', id: 'herosFin' },
      im && src ? curseurAvantApres(src, im) : garde && !garde.supprime ? imagePhoto(garde, 'garde') : null,
      h('div', { class: 'herosTitre' }, M.intitule(v)),
      sous ? h('div', { class: 'mut' }, sous) : null,
      stats.length ? h('div', { class: 'herosStats' }, stats.map(([i, n, l]) => h('span', { class: 'herosStat' }, h('b', {}, i + ' ' + n), ' ' + l))) : null,
      est && est.max > 0 ? h('div', { class: 'herosBudget' }, h('div', { class: 'mut petit' }, 'Budget estimé (indicatif)'), h('div', { class: 'herosMontant' }, B.formatPlage(est)),
        env != null && env > 0 ? h('div', { class: 'petit', style: 'font-weight:600;color:' + (est.max <= env ? 'var(--green)' : est.min > env ? 'var(--terra)' : 'var(--amber)') },
          est.max <= env ? '✓ Dans votre enveloppe de ' + M.formatEuros(env) : est.min > env ? 'Au-dessus de votre enveloppe de ' + M.formatEuros(env) : 'À cheval sur votre enveloppe de ' + M.formatEuros(env)) : null) : null);
  })();
  return [
    heros,
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
    h('div', { class: 'interne' }, champ(v, 'notes', 'NOTES DE VISITE (internes, jamais dans le dossier client)', { multiligne: true, autocapitalize: 'sentences' })),
    blocMessageSuivi(v),
    blocDossierPermis(v),
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
  const x = d && Array.isArray(d.pieces) ? JSON.parse(JSON.stringify(d)) : { pieces: [], hauteur: 2.5 };
  if (!Array.isArray(x.ouvertures)) x.ouvertures = [];
  if (!Array.isArray(x.symboles)) x.symboles = [];
  return x;
}
/* l'historique du dessin (↶ / ↷) : chaque modification garde l'état d'avant ; propre à la visite ouverte */
const histoDessin = () => (S.dessinHisto && S.dessinHisto.visite === S.courante ? S.dessinHisto : (S.dessinHisto = { visite: S.courante, pile: [], refaire: [] }));
const majDessin = async f => {
  const d = dessinCourant(), H = histoDessin();
  H.pile.push(JSON.stringify(d)); if (H.pile.length > 60) H.pile.shift(); H.refaire.length = 0;
  f(d); await poser('dessin', d); redessiner();
};
async function annulerDessin() {
  const H = histoDessin(); if (!H.pile.length) return;
  H.refaire.push(JSON.stringify(dessinCourant()));
  await poser('dessin', JSON.parse(H.pile.pop())); S.croquisInfo = null; redessiner();
}
async function retablirDessin() {
  const H = histoDessin(); if (!H.refaire.length) return;
  H.pile.push(JSON.stringify(dessinCourant()));
  await poser('dessin', JSON.parse(H.refaire.pop())); S.croquisInfo = null; redessiner();
}
const etageDessin = () => S.dessinEtage || 0;
const rectsEtage = (d, R, k) => d.pieces.filter(p => (p.etage || 0) === k && R.rect.has(p.id)).map(p => ({ p, r: R.rect.get(p.id) }));

/* l'aperçu : pièces de l'étage affiché (celles de l'étage du dessous en filigrane),
   portes et fenêtres, symboles. Une pièce ou un symbole se glisse au doigt
   (la pièce s'aimante aux murs voisins) ; un toucher le sélectionne. */
const COUL_OUV = { porte: '#C0392B', fenetre: '#1F6FEB', portefenetre: '#1F6FEB', passage: '#6B7280' };
function apercuDessin(d, R, opts = {}) {
  const NS = 'http://www.w3.org/2000/svg', el = (t, a, txt) => { const e = document.createElementNS(NS, t); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); if (txt != null) e.textContent = txt; return e; };
  const k = etageDessin(), rs = rectsEtage(d, R, k), dessous = k > 0 ? rectsEtage(d, R, k - 1) : [];
  const svg = el('svg', { class: 'apercuDessin', role: 'img', 'aria-label': 'Aperçu du dessin' });
  const tous = d.pieces.filter(p => R.rect.has(p.id)).map(p => R.rect.get(p.id));
  const croquis = !!S.croquis && !opts.exporter;   // le mode « ✏️ Croquis » : on trace au doigt sur tout le cadre
  if (!tous.length && !croquis) { svg.setAttribute('viewBox', '0 0 10 4'); svg.append(el('text', { x: 5, y: 2.2, 'text-anchor': 'middle', 'font-size': 0.5, fill: '#5E6B74' }, 'Ajoutez une pièce')); return svg; }
  // cadrage commun à tous les étages : l'aperçu ne saute pas d'un étage à l'autre. En croquis, de la place autour pour tracer
  const marge = croquis ? 4 : 1.5;
  let x0 = tous.length ? Math.min(...tous.map(r => r.x0)) - marge : -1, y0 = tous.length ? Math.min(...tous.map(r => r.y0)) - marge : -1;
  let x1 = tous.length ? Math.max(...tous.map(r => r.x1)) + marge : 15, y1 = tous.length ? Math.max(...tous.map(r => r.y1)) + marge : 11;
  if (croquis && x1 - x0 < 14) { const c = (x0 + x1) / 2; x0 = c - 7; x1 = c + 7; }
  svg.setAttribute('viewBox', [x0, y0, x1 - x0, y1 - y0].join(' '));
  // cadrage de base gardé sur le SVG : le dézoom (« recul ») l'agrandit autour de son centre, sans redessiner
  svg.dataset.base = [x0, y0, x1 - x0, y1 - y0].join(' ');
  if (!opts.exporter) appliquerRecul(svg, S.dessinRecul || 1);
  const t = Math.max(0.25, Math.min(0.45, (x1 - x0) / 22));
  dessous.forEach(({ r }) => svg.append(el('rect', { x: r.x0, y: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0, fill: 'none', stroke: '#9AA4B2', 'stroke-width': 0.05, 'stroke-dasharray': '0.2 0.15' })));
  rs.forEach(({ p, r }) => {
    const sel = !opts.exporter && S.dessinSel === p.id, g = el('g', { 'data-piece-dessin': p.id, style: 'cursor:grab' });
    // la forme réelle (une pièce découpée autour d'un WC posé dedans n'est plus un rectangle)
    const mp = R.donnees && R.donnees.pieces.find(x => x.id === 'd-' + p.id), forme = mp && mp.points && mp.points.length >= 4 ? mp.points : null;
    const st = { fill: sel ? '#FCE9E3' : '#E7EEF2', stroke: sel ? '#C5563A' : '#2C4A5E', 'stroke-width': sel ? 0.12 : 0.08 };
    g.append(forme ? el('polygon', { points: forme.map(q => q.join(',')).join(' '), 'data-piece-forme': p.id, ...st }) : el('rect', { x: r.x0, y: r.y0, width: r.x1 - r.x0, height: r.y1 - r.y0, ...st }));
    // le nom (et la surface) peut être décalé s'il cache une cote ; un toucher sur une cote (ou le nom de la pièce sélectionnée) la modifie
    const centre = p.poly ? CQ.pointInterieur(p.poly) : [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
    const et = DR.etiquetteDe(p), nx = centre[0] + et.dx, ny = centre[1] + et.dy;
    const nom = el('g', { 'data-edit': 'nom' });
    nom.append(el('text', { x: nx, y: ny, 'text-anchor': 'middle', 'font-size': t, 'font-weight': 700, fill: '#1A2B36' }, p.nom));
    nom.append(el('text', { x: nx, y: ny + t * 1.2, 'text-anchor': 'middle', 'font-size': t * 0.8, fill: '#5E6B74' }, String((R.resume && (R.resume.detail.find(x => x.id === 'd-' + p.id) || {}).sol) ?? Math.round((r.x1 - r.x0) * (r.y1 - r.y0) * 100) / 100).replace('.', ',') + ' m²'));
    g.append(nom);
    if (p.poly) {   // pièce tracée au doigt : la longueur de chaque mur, un peu à l'intérieur ; un toucher la modifie
      CQ.murs(p.poly).forEach(m => {
        if (m.longueur < t * 1.2) return;
        const ux = (m.b[0] - m.a[0]) / m.longueur, uy = (m.b[1] - m.a[1]) / m.longueur, mx = (m.a[0] + m.b[0]) / 2, my = (m.a[1] + m.b[1]) / 2;
        // la cote se pose à l'intérieur de la pièce, décalée de la moitié de son texte : jamais coupée par le mur
        const sg = CQ.dedans([mx - uy * 0.2, my + ux * 0.2], p.poly) ? 1 : -1, nx = -uy * sg, ny = ux * sg;
        const fs = t * 0.7, txt = String(r3l(m.longueur)).replace('.', ','), hw = 0.29 * fs * txt.length, hh = 0.36 * fs, off = Math.abs(nx) * hw + Math.abs(ny) * hh + 0.07;
        g.append(el('text', { x: mx + nx * off, y: my + ny * off + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs, fill: '#2C4A5E', stroke: st.fill, 'stroke-width': fs * 0.28, 'paint-order': 'stroke', 'stroke-linejoin': 'round', 'data-edit': 'mur:' + m.i, style: 'cursor:text' }, txt));
      });
    } else {
      g.append(el('text', { x: (r.x0 + r.x1) / 2, y: r.y0 + t * 0.9, 'text-anchor': 'middle', 'font-size': t * 0.75, fill: '#2C4A5E', 'data-edit': 'longueur', style: 'cursor:text' }, String(r3l(r.x1 - r.x0)).replace('.', ',')));
      g.append(el('text', { x: r.x0 + t * 0.35, y: (r.y0 + r.y1) / 2, 'text-anchor': 'start', 'font-size': t * 0.75, fill: '#2C4A5E', 'data-edit': 'largeur', style: 'cursor:text' }, String(r3l(r.y1 - r.y0)).replace('.', ',')));
    }
    // portes et fenêtres de la pièce : un trait de couleur sur le côté
    d.ouvertures.filter(o => o.piece === p.id).forEach(o => {
      const w = DRnb(o.largeur) || 0.9, pos = DRnb(o.position) || 0;
      let seg = null;
      if (Array.isArray(o.au) && p.poly) {   // ouverture posée par un point du mur (croquis) : un trait le long de ce mur
        const m = CQ.murProche(o.au, [{ id: p.id, poly: p.poly }], 0.3);
        if (m) { const A = p.poly[m.i], B = p.poly[(m.i + 1) % p.poly.length], l = m.longueur || 1, ux = (B[0] - A[0]) / l, uy = (B[1] - A[1]) / l; seg = [o.au[0] - ux * w / 2, o.au[1] - uy * w / 2, o.au[0] + ux * w / 2, o.au[1] + uy * w / 2]; }
      }
      const [ax, ay, bx, by] = seg ? seg : o.cote === 'haut' ? [r.x0 + pos, r.y0, r.x0 + pos + w, r.y0] : o.cote === 'bas' ? [r.x0 + pos, r.y1, r.x0 + pos + w, r.y1]
        : o.cote === 'gauche' ? [r.x0, r.y0 + pos, r.x0, r.y0 + pos + w] : [r.x1, r.y0 + pos, r.x1, r.y0 + pos + w];
      g.append(el('line', { x1: ax, y1: ay, x2: bx, y2: by, stroke: '#FFFFFF', 'stroke-width': 0.22 }));
      g.append(el('line', { x1: ax, y1: ay, x2: bx, y2: by, stroke: COUL_OUV[o.type] || '#C0392B', 'stroke-width': o.type === 'portefenetre' ? 0.16 : 0.1, 'stroke-dasharray': o.type === 'passage' ? '0.12 0.08' : '', 'data-ouverture': o.id }));
    });
    svg.append(g);
  });
  d.symboles.filter(x => (x.etage || 0) === k).forEach(x => {
    const ty = DR.TYPES_SYMBOLE.find(z => z[0] === x.type); if (!ty) return;
    const l = DRnb(x.l) || ty[3], w = DRnb(x.w) || ty[4], sel = !opts.exporter && S.dessinSym === x.id;
    const g = el('g', { 'data-symbole': x.id, transform: 'translate(' + x.x + ' ' + x.y + ') rotate(' + (x.rot || 0) + ')', style: 'cursor:grab' });
    g.append(el('rect', { x: -l / 2, y: -w / 2, width: l, height: w, fill: x.type === 'escalier' ? '#FFFFFF' : '#FFF8E7', stroke: sel ? '#C5563A' : '#4B5563', 'stroke-width': sel ? 0.08 : 0.04 }));
    if (x.type === 'escalier') for (let n = 1; n < Math.round(l / 0.25); n++) g.append(el('line', { x1: -l / 2 + n * 0.25, y1: -w / 2, x2: -l / 2 + n * 0.25, y2: w / 2, stroke: '#4B5563', 'stroke-width': 0.02 }));
    g.append(el('text', { x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': Math.max(0.28, Math.min(0.55, Math.max(l, w) * 0.45)), transform: 'rotate(' + (-(x.rot || 0)) + ')' }, ty[2]));
    svg.append(g);
  });
  if (croquis) {
    const vbw = x1 - x0, hr = Math.max(0.14, vbw * 0.016);
    // le mur dont on demande la longueur (échelle) : en rouge, bien épais
    const E = S.echelleMur && d.pieces.find(z => z.id === S.echelleMur.piece && z.poly);
    if (E) { const m = CQ.murs(E.poly)[S.echelleMur.i]; if (m) svg.append(el('line', { x1: m.a[0], y1: m.a[1], x2: m.b[0], y2: m.b[1], stroke: '#C5563A', 'stroke-width': Math.max(0.14, vbw * 0.012), 'stroke-linecap': 'round', 'data-mur-echelle': '1' })); }
    // la couche qui reçoit le doigt : tout le cadre ; le tracé en cours se dessine dessus
    svg.append(el('rect', { class: 'croquisFond', x: -1000, y: -1000, width: 2000, height: 2000, fill: 'rgba(0,0,0,0)', style: 'pointer-events:all;touch-action:none' }));
    svg.append(el('polyline', { id: 'traitCroquis', fill: 'none', stroke: S.croquisOutil === 'gomme' ? '#8A949B' : '#C5563A', 'stroke-width': Math.max(0.05, vbw * 0.0045), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none', points: '' }));
    // poignées : les sommets de la pièce sélectionnée se glissent (zone tactile large, point visible plus petit)
    const sel = d.pieces.find(z => z.id === S.dessinSel && z.poly && (z.etage || 0) === k);
    if (sel && S.croquisOutil === 'modifier') sel.poly.forEach((q, i) => {
      svg.append(el('circle', { cx: q[0], cy: q[1], r: hr * 2.2, fill: 'rgba(0,0,0,0)', 'data-sommet': i, 'data-piece-sommet': sel.id, style: 'pointer-events:all;touch-action:none;cursor:move' }));
      svg.append(el('circle', { cx: q[0], cy: q[1], r: hr, fill: '#FFFFFF', stroke: '#C5563A', 'stroke-width': hr * 0.4, 'pointer-events': 'none', 'data-poignee': i }));
    });
    brancherCroquis(svg, d, R);
  } else if (!opts.exporter) brancherGlisser(svg, d, R);
  return svg;
}
/* glisser au doigt dans l'aperçu (un doigt) ; le pincement (deux doigts) est géré par le cadre du zoom */
/* « ＋ Symbole » : on choisit le symbole, puis on touche le dessin à l'endroit voulu. Près d'un mur
   (moins de 50 cm), il s'y adosse, tourné dos au mur ; sinon il se pose là où l'on a touché */
function poserSymboleIci(q, d, R) {
  const ty = DR.TYPES_SYMBOLE.find(t => t[0] === S.poseSymbole); S.poseSymbole = null; if (!ty) return redessiner();
  const k = etageDessin(), L = ty[3], W = ty[4];
  const dans = rectsEtage(d, R, k).find(({ r }) => q[0] >= r.x0 && q[0] <= r.x1 && q[1] >= r.y0 && q[1] <= r.y1);
  let x = q[0], y = q[1], rot = 0;
  if (dans && ty[0] !== 'escalier') {
    const r = dans.r, cotes = [['haut', q[1] - r.y0], ['bas', r.y1 - q[1]], ['gauche', q[0] - r.x0], ['droite', r.x1 - q[0]]].sort((a, b) => a[1] - b[1]);
    if (cotes[0][1] < 0.5) {
      const c = cotes[0][0], bornX = v => Math.max(r.x0 + L / 2, Math.min(r.x1 - L / 2, v)), bornY = v => Math.max(r.y0 + L / 2, Math.min(r.y1 - L / 2, v));
      if (c === 'haut') { y = r.y0 + W / 2 + 0.02; x = bornX(x); rot = 0; } else if (c === 'bas') { y = r.y1 - W / 2 - 0.02; x = bornX(x); rot = 180; }
      else if (c === 'gauche') { x = r.x0 + W / 2 + 0.02; y = bornY(y); rot = 270; } else { x = r.x1 - W / 2 - 0.02; y = bornY(y); rot = 90; }
    }
  }
  const id = M.nouvelId().slice(0, 8);
  return majDessin(z => { z.symboles.push({ id, type: ty[0], etage: k, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, rot, ...(ty[0] === 'escalier' ? { l: L, w: W } : {}) }); S.dessinSym = id; S.dessinSel = null; S.message = null; });
}
/* un toucher sur le nom d'une pièce ou sur une cote de l'aperçu : la saisie se fait sur place */
async function modifierSurDessin(id, champ) {
  const d = dessinCourant(), p = d.pieces.find(x => x.id === id); if (!p) return;
  if (champ === 'nom') {
    const n = prompt('Nom de la pièce', p.nom); if (n == null) return;
    return majDessin(x => { const q = x.pieces.find(z => z.id === id); if (q) q.nom = n.trim().slice(0, 40) || q.nom; S.dessinSel = id; });
  }
  if (champ.startsWith('mur:') && p.poly) {   // la cote d'un mur d'une pièce tracée au doigt
    const i = +champ.slice(4), m = CQ.murs(p.poly)[i]; if (!m) return;
    const v = prompt('Longueur du mur ' + (i + 1) + ', en mètres', String(Math.round(m.longueur * 100) / 100).replace('.', ',')); if (v == null) return;
    const n = DRnb(v), np = n >= 0.3 && n <= 50 ? CQ.changerLongueurMur(p.poly, i, n) : null;
    if (!np) { infoCroquis('err', 'Cote non prise : entre 0,30 et 50 m, sans que les murs se croisent.'); return redessiner(); }
    return majDessin(x => { const q = x.pieces.find(z => z.id === id); if (q) { q.poly = np; synchroBoite(q); x.ouvertures = CQ.recalerOuvertures(x.ouvertures, x.pieces, 0.4); } S.dessinSel = id; infoCroquis(); });
  }
  const lib = champ === 'longueur' ? 'Longueur (gauche ↔ droite), en mètres' : 'Largeur (haut ↕ bas), en mètres';
  const v = prompt(lib, String(p[champ]).replace('.', ',')); if (v == null) return;
  const n = DRnb(v);
  if (!(n >= 0.3 && n <= 50)) { S.message = { type: 'err', texte: 'Cote non prise : entre 0,30 et 50 m.' }; return redessiner(); }
  return majDessin(x => { const q = x.pieces.find(z => z.id === id); if (q) q[champ] = Math.round(n * 100) / 100; S.dessinSel = id; });
}
/* ---------- « ✏️ Croquis » : on trace une pièce au doigt, elle devient une pièce aux murs droits (releve/croquis.js) ----------
   Pointer Events sur la couche du cadre (touch-action: none : pas de défilement ni de zoom du navigateur pendant le tracé) ;
   un deuxième doigt interrompt le tracé et laisse le pincement zoomer. Un tracé fermé = une pièce ; un petit trait le long d'un
   mur = une porte ou une fenêtre ; un simple toucher sélectionne ; la gomme efface une pièce ou une ouverture ; une poignée
   déplace un sommet (les angles droits sont gardés). Chaque action est annulable (↶). */
const polysEtage = (d, R, k) => d.pieces.filter(p => (p.etage || 0) === k && R.rect.has(p.id)).map(p => ({ id: p.id, poly: p.poly && p.poly.length >= 3 ? p.poly : CQ.polyDeRect(R.rect.get(p.id)) }));
const synchroBoite = p => { if (!p.poly) return; const b = CQ.boite(p.poly); p.longueur = Math.round((b.x1 - b.x0) * 100) / 100; p.largeur = Math.round((b.y1 - b.y0) * 100) / 100; };
const aMesuresScan = () => !!M.valeur(visite(), 'scan.fichier');
const infoCroquis = (type, texte) => { S.croquisInfo = texte ? { type, texte } : null; };

function basculerCroquis() {
  S.croquis = !S.croquis; S.croquisOutil = 'tracer'; S.croquisInfo = null; S.ouvNouvelle = null;
  if (S.croquis) { S.dessinSym = null; S.poseSymbole = null; S.choixSymbole = false; }
  redessiner();
}

/* un mur de la pièce translaté / changé : les ouvertures qui y sont posées suivent, ou disparaissent avec lui */
function deplacerPieceCroquis(q, d, depl) {
  const [dx, dy] = depl, a = v => Math.round(v * 100) / 100;
  q.poly = q.poly.map(([x, y]) => [a(x + dx), a(y + dy)]);
  d.ouvertures.forEach(o => { if (o.piece === q.id && Array.isArray(o.au)) o.au = [a(o.au[0] + dx), a(o.au[1] + dy)]; });
  synchroBoite(q);
}

async function appliquerEchelle() {
  const E = S.echelleMur, d = dessinCourant(), p = E && d.pieces.find(x => x.id === E.piece && x.poly);
  if (!p) { S.echelleMur = null; return redessiner(); }
  const m = CQ.murs(p.poly)[E.i], val = DRnb(S.echelleVal) ?? m.longueur, f = val / m.longueur;
  if (!(f > 0.05 && f < 20) || !(val >= 0.3)) { infoCroquis('err', 'Longueur impossible : entre 0,30 m et ' + String(Math.round(m.longueur * 20 * 100) / 100).replace('.', ',') + ' m.'); return redessiner(); }
  await majDessin(x => {
    const a = v => Math.round(v * 100) / 100;
    x.pieces.forEach(q => { if (q.poly) { q.poly = CQ.mettreAEchelle(q.poly, f); synchroBoite(q); } });
    x.ouvertures.forEach(o => { if (Array.isArray(o.au)) o.au = [a(o.au[0] * f), a(o.au[1] * f)]; });
    x.symboles.forEach(sy => { sy.x = a(sy.x * f); sy.y = a(sy.y * f); });
    x.croquisEchelle = true;
  });
  S.echelleMur = null; S.dessinPan = null;
  infoCroquis('ok', 'Échelle réglée : ce mur mesure ' + String(Math.round(val * 100) / 100).replace('.', ',') + ' m, tout le plan suit.'); redessiner();
}

/* le trait est fini : une pièce, une ouverture ou un simple toucher */
async function finTraceCroquis(pts, d, R, vue) {
  const T = CQ.tolerances(vue), k = etageDessin(), polys = polysEtage(d, R, k), L = CQ.longueurTrace(pts);
  if (L < T.tap) {   // un toucher : sélectionne la pièce sous le doigt, ou rien
    const sous = polys.find(q => CQ.dedans(pts[0], q.poly));
    S.dessinSel = sous ? sous.id : null; S.dessinSym = null; infoCroquis(); return redessiner();
  }
  const ouv = L <= T.ouvertureMax ? CQ.ouvertureSurTrait(pts, polys, { tol: T.ouverture, longueurMax: T.ouvertureMax }) : null;
  if (ouv) { S.ouvNouvelle = ouv; infoCroquis(); return redessiner(); }
  const r = CQ.pieceDepuisTrace(pts, { vue, autres: polys.map(q => q.poly), aimant: aimantDessin() });
  if (r.erreur) { infoCroquis(r.raison === 'ouvert' ? 'att' : 'err', r.erreur); return redessiner(); }
  const id = M.nouvelId().slice(0, 8), premiere = !d.pieces.length, longest = CQ.murs(r.poly).reduce((b, m) => m.longueur > b.longueur ? m : b);
  await majDessin(x => {
    const n = { id, nom: x.pieces.length ? 'Pièce ' + (x.pieces.length + 1) : 'Séjour', etage: k, poly: r.poly, longueur: 0, largeur: 0, croquis: true };
    synchroBoite(n); x.pieces.push(n);
    // le premier croquis n'a pas d'échelle : on la demande tout de suite (les mesures d'un scan, elles, priment)
    if (premiere && !aMesuresScan()) x.croquisEchelle = false;
  });
  S.dessinSel = id; S.ouvNouvelle = null;
  if (premiere && !aMesuresScan()) { S.echelleMur = { piece: id, i: longest.i }; S.echelleVal = Math.round(longest.longueur * 100) / 100; infoCroquis(); }
  else infoCroquis('ok', 'Pièce tracée : ' + r.poly.length + ' murs. Touchez une cote pour la corriger.');
  redessiner();
}

/* un type choisi : l'ouverture est créée sur le mur touché (point du mur pour une pièce tracée, côté et position pour un rectangle) */
async function creerOuvertureCroquis(type) {
  const N = S.ouvNouvelle; S.ouvNouvelle = null; if (!N) return redessiner();
  const ty = DR.TYPES_OUVERTURE.find(z => z[0] === type), w = ty[2], id = M.nouvelId().slice(0, 8), d = dessinCourant(), p = d.pieces.find(z => z.id === N.piece);
  if (!p) return redessiner();
  await majDessin(x => {
    if (p.poly) x.ouvertures.push({ id, piece: p.id, type, largeur: w, au: [N.au[0], N.au[1]] });
    else {   // rectangle : le côté le plus proche du point, et la position le long de ce côté
      const r = DR.placer(d.pieces).rect.get(p.id), c = [['haut', Math.abs(N.au[1] - r.y0)], ['bas', Math.abs(N.au[1] - r.y1)], ['gauche', Math.abs(N.au[0] - r.x0)], ['droite', Math.abs(N.au[0] - r.x1)]].sort((u, v) => u[1] - v[1])[0][0];
      const lat = c === 'gauche' || c === 'droite', lon = lat ? r.y1 - r.y0 : r.x1 - r.x0, along = lat ? N.au[1] - r.y0 : N.au[0] - r.x0;
      x.ouvertures.push({ id, piece: p.id, type, cote: c, position: Math.max(0, Math.min(lon - w, Math.round((along - w / 2) * 100) / 100)), largeur: w });
    }
  });
  S.ouvEdit = id; redessiner();
}

function brancherCroquis(svg, d, R) {
  const pt = e => { const m = svg.getScreenCTM(); if (!m) return [0, 0]; const q = svg.createSVGPoint(); q.x = e.clientX; q.y = e.clientY; const r = q.matrixTransform(m.inverse()); return [r.x, r.y]; };
  const vue = () => (svg.viewBox.baseVal.width || 14) / ((S.dessinZoom && S.dessinZoom.s) || 1);   // largeur visible, en mètres
  const trait = svg.querySelector('#traitCroquis'), k = etageDessin();
  let g = null;    // tracé, gomme ou sommet en cours
  const dessinerTrait = pts => trait && trait.setAttribute('points', pts.map(q => q.join(',')).join(' '));
  const annuler = () => { g = null; dessinerTrait([]); };
  svg.addEventListener('pointerdown', e => {
    // souris : seul le bouton gauche trace (le droit et la molette déplacent le plan, voir cadreZoomDessin)
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // un deuxième doigt : le pincement (zoom) prend la main, le tracé commencé est abandonné
    if (!e.isPrimary || S.pinceDessin) { annuler(); return; }
    e.preventDefault();
    const som = e.target.closest && e.target.closest('[data-sommet]');
    svg.setPointerCapture(e.pointerId);
    if (som && S.croquisOutil === 'modifier') {
      const piece = som.dataset.pieceSommet, i = +som.dataset.sommet, p = d.pieces.find(z => z.id === piece);
      g = { type: 'sommet', id: e.pointerId, piece, i, poly: p.poly, courant: p.poly, ok: true, bouge: false, ecran: [e.clientX, e.clientY] };
      return;
    }
    g = { type: S.croquisOutil === 'gomme' ? 'gomme' : S.croquisOutil === 'modifier' ? 'toucher' : 'tracer', id: e.pointerId, pts: [pt(e)], hit: null };
    if (g.type !== 'toucher') dessinerTrait(g.pts);
  });
  svg.addEventListener('pointermove', e => {
    if (!g || e.pointerId !== g.id) return;
    if (S.pinceDessin) { annuler(); return; }
    e.preventDefault();
    if (g.type === 'sommet') {
      if (!g.bouge && Math.hypot(e.clientX - g.ecran[0], e.clientY - g.ecran[1]) < 4) return;
      g.bouge = true;
      const T = CQ.tolerances(vue()), autres = polysEtage(d, R, k).filter(q => q.id !== g.piece).map(q => q.poly);
      const np = CQ.deplacerSommet(g.poly, g.i, pt(e), { autres: aimantDessin() ? autres : [], seuil: aimantDessin() ? T.aimant : 0, minMur: T.murMini });
      g.ok = !!np && !autres.some(q => CQ.chevauche(np, q));
      if (g.ok) g.courant = np;
      const forme = svg.querySelector('[data-piece-forme="' + g.piece + '"]');
      if (forme) { forme.setAttribute('points', g.courant.map(q => q.join(',')).join(' ')); forme.setAttribute('stroke', g.ok ? '#C5563A' : '#B42318'); }
      const pg = svg.querySelector('[data-poignee="' + g.i + '"]'); if (pg) { pg.setAttribute('cx', g.courant[g.i][0]); pg.setAttribute('cy', g.courant[g.i][1]); }
      return;
    }
    // les points intermédiaires que le navigateur a regroupés comptent aussi (tracé plus fidèle sur iPhone)
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (evs.length ? evs : [e]).forEach(ev => { const q = pt(ev), der = g.pts[g.pts.length - 1]; if (Math.hypot(q[0] - der[0], q[1] - der[1]) > 1e-3) g.pts.push(q); });
    if (g.type !== 'toucher') dessinerTrait(g.pts);
    if (g.type === 'gomme' && !g.hit) {   // la gomme repère ce qu'elle touche ; l'effacement a lieu au relâchement
      const T = CQ.tolerances(vue()), polys = polysEtage(d, R, k);
      g.hit = CQ.gommer(g.pts[g.pts.length - 1], polys, d.ouvertures, T.ouverture * 1.3);
    }
  });
  const fin = async e => {
    const x = g; if (!x || e.pointerId !== x.id) return; g = null; dessinerTrait([]);
    if (x.type === 'sommet') {
      if (!x.bouge) return;
      if (!x.ok && x.courant === x.poly) { infoCroquis('err', 'Forme impossible : les murs se croiseraient ou la pièce chevaucherait une voisine.'); return redessiner(); }
      if (!x.ok) infoCroquis('att', 'Dernière position valable gardée : la forme demandée n’était pas possible.'); else infoCroquis();
      return majDessin(y => { const q = y.pieces.find(z => z.id === x.piece); if (q) { q.poly = x.courant; synchroBoite(q); y.ouvertures = CQ.recalerOuvertures(y.ouvertures, y.pieces, 0.4); } });
    }
    if (x.type === 'gomme') {
      if (!x.hit) return redessiner();
      return majDessin(y => {
        if (x.hit.type === 'ouverture') y.ouvertures = y.ouvertures.filter(o => o.id !== x.hit.id);
        else { y.pieces = y.pieces.filter(q => q.id !== x.hit.id); y.ouvertures = y.ouvertures.filter(o => o.piece !== x.hit.id); y.pieces.forEach(q => { if (q.contre && q.contre.id === x.hit.id) delete q.contre; }); S.dessinSel = null; }
        infoCroquis('ok', (x.hit.type === 'ouverture' ? 'Ouverture effacée' : 'Pièce effacée') + ' — ↶ pour annuler.');
      });
    }
    if (x.type === 'toucher') {   // outil « Modifier » : un toucher sélectionne la pièce sous le doigt (ses poignées apparaissent) ; un glissé hors poignée ne fait rien
      if (CQ.longueurTrace(x.pts) >= CQ.tolerances(vue()).tap * 2) return;
      const sous = polysEtage(d, R, k).find(q => CQ.dedans(x.pts[0], q.poly)); S.dessinSel = sous ? sous.id : null; infoCroquis(); return redessiner();
    }
    await finTraceCroquis(x.pts, d, R, vue());
  };
  svg.addEventListener('pointerup', fin);
  svg.addEventListener('pointercancel', annuler);
  svg.addEventListener('lostpointercapture', e => { if (g && e.pointerId === g.id && g.type !== 'sommet') { /* le doigt a quitté l'écran sans pointerup : on abandonne */ annuler(); } });
}

function brancherGlisser(svg, d, R) {
  const pt = e => { const m = svg.getScreenCTM(); if (!m) return [0, 0]; const q = svg.createSVGPoint(); q.x = e.clientX; q.y = e.clientY; const r = q.matrixTransform(m.inverse()); return [r.x, r.y]; };
  let g = null;
  svg.addEventListener('pointerdown', e => {
    if (S.poseSymbole && !S.pinceDessin) { e.preventDefault(); poserSymboleIci(pt(e), d, R); return; }
    const cible = e.target.closest('[data-piece-dessin],[data-symbole]'); if (!cible || S.pinceDessin) return;
    e.preventDefault(); svg.setPointerCapture(e.pointerId);
    const piece = cible.dataset.pieceDessin, sym = cible.dataset.symbole, p0 = pt(e);
    // un toucher sur une cote la change ; sur le nom de la pièce déjà sélectionnée, le renomme.
    // Glisser déplace toujours la pièce, même saisie par son nom (le nom se déplace par les flèches de la fiche)
    const edit0 = piece && e.target.closest('[data-edit]'), edit = edit0 && (edit0.dataset.edit !== 'nom' || S.dessinSel === piece) ? edit0 : null;
    g = { el: cible, piece, sym, p0, ecran: [e.clientX, e.clientY], depl: [0, 0], bouge: false, edit: edit ? edit.dataset.edit : null, elEdit: edit,
      r: piece ? R.rect.get(piece) : null, s: sym ? d.symboles.find(x => x.id === sym) : null };
  });
  svg.addEventListener('pointermove', e => {
    if (!g || S.pinceDessin) return;
    if (!g.bouge && Math.hypot(e.clientX - g.ecran[0], e.clientY - g.ecran[1]) < 6) return;
    g.bouge = true; const q = pt(e), dx = q[0] - g.p0[0], dy = q[1] - g.p0[1];
    if (g.r) {
      const autres = rectsEtage(d, R, etageDessin()).filter(o => o.p.id !== g.piece).map(o => o.r);
      // aimant coupé (« 🧲 Aimant : non ») : la pièce reste où on la lâche, au pas de 5 cm
      const m = aimantDessin() ? DR.aimanter({ x0: g.r.x0 + dx, y0: g.r.y0 + dy, x1: g.r.x1 + dx, y1: g.r.y1 + dy }, autres)
        : { x: Math.round((g.r.x0 + dx) * 20) / 20, y: Math.round((g.r.y0 + dy) * 20) / 20 };
      g.depl = [m.x - g.r.x0, m.y - g.r.y0];
      g.el.setAttribute('transform', 'translate(' + g.depl[0] + ' ' + g.depl[1] + ')');
    } else if (g.s) {
      const nx = Math.round((g.s.x + dx) * 20) / 20, ny = Math.round((g.s.y + dy) * 20) / 20;
      g.depl = [nx, ny];
      g.el.setAttribute('transform', 'translate(' + nx + ' ' + ny + ') rotate(' + (g.s.rot || 0) + ')');
    }
  });
  const fin = async () => {
    const x = g; g = null; if (!x) return;
    if (!x.bouge && x.edit) return modifierSurDessin(x.piece, x.edit);   // un toucher sur le nom ou une cote : la changer
    if (!x.bouge) {   // un toucher : sélectionner (ou désélectionner)
      if (x.piece) { S.dessinSel = S.dessinSel === x.piece ? null : x.piece; S.dessinSym = null; }
      else { S.dessinSym = S.dessinSym === x.sym ? null : x.sym; S.dessinSel = null; }
      return redessiner();
    }
    if (x.piece) await majDessin(y => { const q = y.pieces.find(z => z.id === x.piece); if (q) { if (q.poly) deplacerPieceCroquis(q, y, x.depl); else { q.libre = { x: Math.round((x.r.x0 + x.depl[0]) * 100) / 100, y: Math.round((x.r.y0 + x.depl[1]) * 100) / 100 }; delete q.contre; }
      // les symboles posés dans la pièce la suivent (radiateurs, WC… d'une esquisse que l'on replace)
      const et = q.etage || 0, dans = sy => (sy.etage || 0) === et && sy.x > x.r.x0 && sy.x < x.r.x1 && sy.y > x.r.y0 && sy.y < x.r.y1;
      y.symboles.filter(dans).forEach(sy => { sy.x = Math.round((sy.x + x.depl[0]) * 100) / 100; sy.y = Math.round((sy.y + x.depl[1]) * 100) / 100; }); } S.dessinSel = x.piece; });
    else await majDessin(y => { const q = y.symboles.find(z => z.id === x.sym); if (q) { q.x = x.depl[0]; q.y = x.depl[1]; } S.dessinSym = x.sym; });
  };
  svg.addEventListener('pointerup', fin);
  svg.addEventListener('pointercancel', () => { g = null; redessiner(); });
}
/* le cadre de l'aperçu : zoom par pincement (deux doigts) ou par boutons */
/* dézoomer au-delà de 100 % : le cadre ne rapetisse pas le dessin, il montre plus de place autour
   (le viewBox s'agrandit d'un facteur « recul », jusqu'à 8 fois) ; on peut ainsi poser et glisser
   d'autres pièces loin des premières. Le niveau affiché = zoom / recul. */
const RECUL_MAX = 8;
/* l'aimant des pièces : un réglage de l'appareil (pas de la visite), activé d'office */
const CLE_AIMANT = 'cp-releve-aimant';
function aimantDessin() {
  if (S.aimant == null) { try { S.aimant = localStorage.getItem(CLE_AIMANT) !== 'non'; } catch (e) { S.aimant = true; } }
  return S.aimant;
}
function boutonAimant() {
  const b = h('button', { class: 'puce', type: 'button', id: 'aimantDessin' });
  const maj = () => { b.textContent = '🧲 Aimant : ' + (aimantDessin() ? 'oui' : 'non'); b.classList.toggle('on', aimantDessin()); b.setAttribute('aria-pressed', String(aimantDessin()));
    b.title = aimantDessin() ? 'Une pièce lâchée près du mur d’une autre vient s’y coller' : 'Les pièces restent exactement où on les lâche'; };
  b.onclick = () => { S.aimant = !aimantDessin(); try { localStorage.setItem(CLE_AIMANT, S.aimant ? 'oui' : 'non'); } catch (e) { /* réglage gardé pour la session seulement */ } maj(); };
  maj(); return b;
}
function appliquerRecul(svg, r) {
  const b = (svg.dataset.base || '').split(' ').map(Number); if (b.length !== 4 || b.some(x => !isFinite(x))) return;
  // le cadrage peut aussi être déplacé au doigt (glisser le fond du dessin) : décalage en mètres
  const w = b[2] * r, hh = b[3] * r, pan = S.dessinPan || { x: 0, y: 0 };
  svg.setAttribute('viewBox', [b[0] + b[2] / 2 - w / 2 + pan.x, b[1] + b[3] / 2 - hh / 2 + pan.y, w, hh].join(' '));
}
// PC : Ctrl+Z annule, Ctrl+Maj+Z (ou Ctrl+Y) rétablit, comme dans un logiciel de dessin (seulement en croquis, hors champ de saisie)
document.addEventListener('keydown', e => {
  if (S.ecran !== 'dessin' || !S.croquis) return;
  const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  const mod = e.ctrlKey || e.metaKey, k = String(e.key).toLowerCase();
  if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); annulerDessin(); }
  else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); retablirDessin(); }
});
// Échap quitte le plein écran du dessin
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.dessinPlein) { S.dessinPlein = false; redessiner(); } });
function cadreZoomDessin(svg) {
  const cadre = h('div', { class: 'cadreZoomDessin' + (S.croquis ? ' modeCroquis' : ''), id: 'cadreZoomDessin' }, svg);
  let z = S.dessinZoom || { s: 1, x: 0, y: 0 }, recul = S.dessinRecul || 1;
  const niveau = h('span', { class: 'mut petit', id: 'niveauZoomDessin' });
  const appliquer = () => { const r = cadre.getBoundingClientRect(); z = cadrerZoom(z, r.width || 1, r.height || 1); S.dessinZoom = z; S.dessinRecul = recul;
    svg.style.transform = 'translate(' + z.x + 'px,' + z.y + 'px) scale(' + z.s + ')'; appliquerRecul(svg, recul);
    cadre.dataset.zoom = (z.s / recul).toFixed(2); niveau.textContent = Math.round(z.s / recul * 100) + ' %'; };
  /* un facteur de zoom : d'abord le recul (si on a dézoomé au-delà de 100 %), puis le zoom habituel */
  const facteur = (f, px = 0, py = 0) => {
    if (f < 1 && z.s <= 1.0001) { recul = Math.min(RECUL_MAX, recul / f); z = { s: 1, x: 0, y: 0 }; return; }
    if (f > 1 && recul > 1) { recul = Math.max(1, recul / f); return; }
    z = zoomerToile(z, f, px, py);
  };
  const centre = e => { const r = cadre.getBoundingClientRect(); return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2]; };
  const doigts = new Map(); let pince = null, glisse = null;
  // un doigt sur le fond (ni pièce ni symbole) : tout le plan se déplace dans le cadre
  cadre.addEventListener('pointerdown', e => {
    const sourisAutre = e.pointerType === 'mouse' && e.button !== 0;   // en croquis, le bouton droit ou du milieu de la souris déplace le plan
    if (S.croquis && sourisAutre) e.preventDefault();
    if (doigts.size === 0 && !S.poseSymbole && (!S.croquis || sourisAutre) && !e.target.closest('[data-piece-dessin],[data-symbole],button')) {
      const vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect();
      glisse = { x: e.clientX, y: e.clientY, pan: { ...(S.dessinPan || { x: 0, y: 0 }) }, k: vb && r.width ? vb.width / r.width : 0 };
    }
  }, true);
  cadre.addEventListener('pointermove', e => {
    if (!glisse || doigts.size > 1 || !glisse.k) return;
    const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y; if (!glisse.bouge && Math.hypot(dx, dy) < 6) return;
    glisse.bouge = true; S.dessinPan = { x: glisse.pan.x - dx * glisse.k, y: glisse.pan.y - dy * glisse.k }; appliquerRecul(svg, recul);
  }, true);
  const finGlisse = () => { glisse = null; };
  cadre.addEventListener('pointerup', finGlisse, true); cadre.addEventListener('pointercancel', finGlisse, true);
  cadre.addEventListener('contextmenu', e => { if (S.croquis) e.preventDefault(); });   // pas de menu du navigateur pendant le croquis
  cadre.addEventListener('pointerdown', e => { doigts.set(e.pointerId, centre(e)); if (doigts.size === 2) glisse = null;
    if (doigts.size === 2) { const P = [...doigts.values()]; pince = { z: { ...z }, recul, d: Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]) || 1, m: [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2] }; S.pinceDessin = true; } }, true);
  cadre.addEventListener('pointermove', e => { if (!doigts.has(e.pointerId)) return; doigts.set(e.pointerId, centre(e));
    if (pince && doigts.size >= 2) { const P = [...doigts.values()], dd = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), m = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
      // le pincement agit sur le niveau (zoom / recul) : sous 100 %, il recule ; au-dessus, il zoome
      const L = Math.max(1 / RECUL_MAX, pince.z.s / pince.recul * dd / pince.d);
      if (L < 1) { recul = 1 / L; z = { s: 1, x: 0, y: 0 }; }
      else { recul = 1; const n = zoomerToile(pince.recul > 1 ? { s: 1, x: 0, y: 0 } : pince.z, L / (pince.recul > 1 ? 1 : pince.z.s), pince.m[0], pince.m[1]); z = { s: n.s, x: n.x + m[0] - pince.m[0], y: n.y + m[1] - pince.m[1] }; }
      appliquer(); } }, true);
  const lacher = e => { doigts.delete(e.pointerId); if (doigts.size < 2) pince = null; if (!doigts.size) setTimeout(() => { S.pinceDessin = false; }, 0); };
  cadre.addEventListener('pointerup', lacher, true); cadre.addEventListener('pointercancel', lacher, true);
  cadre.addEventListener('wheel', e => { e.preventDefault(); const c = centre(e); facteur(e.deltaY < 0 ? 1.2 : 1 / 1.2, c[0], c[1]); appliquer(); }, { passive: false });
  requestAnimationFrame(appliquer);
  const bouton = (id, texte, f) => h('button', { class: 'puce', type: 'button', id, onclick: () => { f(); appliquer(); } }, texte);
  return [cadre, h('div', { class: 'puces zoomDessin' },
    bouton('zoomDessinPlus', '🔍 ＋', () => facteur(1.5)), bouton('zoomDessinMoins', '🔍 −', () => facteur(1 / 1.5)),
    bouton('zoomDessinRaz', '⟲ 100 %', () => { z = { s: 1, x: 0, y: 0 }; recul = 1; S.dessinPan = null; }), niveau,
    // plein écran : plus de place pour placer les pièces (✕ pour revenir)
    h('button', { class: 'puce' + (S.dessinPlein ? ' on' : ''), type: 'button', id: 'pleinEcranDessin', onclick: () => { S.dessinPlein = !S.dessinPlein; redessiner(); } }, S.dessinPlein ? '✕ Réduire' : '⛶ Plein écran'),
    h('span', { class: 'mut petit' }, 'Glissez le fond pour déplacer le plan.'))];
}
const r3l = v => Math.round(v * 100) / 100;

function reglageMetres(valeur, libelle, nom, pas, poserValeur, min = 0.3, unite = ' m', max = Infinity) {
  const n = DRnb(valeur);
  return h('label', { class: 'champ reglageDessin' }, libelle,
    h('div', { class: 'reglage' },
      h('button', { class: 'pm', type: 'button', 'aria-label': libelle + ' moins', onclick: e => { e.preventDefault(); poserValeur(Math.min(max, Math.max(min, Math.round(((n || 0) - pas) * 100) / 100))); } }, '−'),
      h('span', { class: 'valeur' }, h('input', { inputMode: 'decimal', name: nom, value: n == null ? '' : String(n).replace('.', ','), 'aria-label': libelle,
        onchange: e => { const x = DRnb(e.target.value); if (x != null) poserValeur(Math.min(max, Math.max(min, Math.round(x * 100) / 100))); } }), h('span', {}, unite)),
      h('button', { class: 'pm', type: 'button', 'aria-label': libelle + ' plus', onclick: e => { e.preventDefault(); poserValeur(Math.min(max, Math.max(min, Math.round(((n || 0) + pas) * 100) / 100))); } }, '+')));
}
const DRnb = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; };
const COTES_OUV = [['haut', 'Haut'], ['droite', 'Droite'], ['bas', 'Bas'], ['gauche', 'Gauche']];

/* la barre du mode « ✏️ Croquis », sous l'aperçu : outils, annuler / rétablir, échelle, fin */
function barreCroquis(d) {
  const H = histoDessin(), outil = (id, lib) => h('button', { class: 'puce grand' + (S.croquisOutil === id ? ' on' : ''), type: 'button', id: 'outilCroquis-' + id, 'aria-pressed': String(S.croquisOutil === id),
    onclick: () => { S.croquisOutil = id; infoCroquis(); redessiner(); } }, lib);
  return h('div', { class: 'barreCroquis', id: 'barreCroquis' },
    h('p', { class: 'mut petit', style: 'margin:6px 0', id: 'aideCroquis' }, S.croquisOutil === 'gomme'
      ? 'Glissez sur une pièce (son mur) ou sur une porte ou une fenêtre pour l’effacer.'
      : S.croquisOutil === 'modifier'
        ? 'Touchez une pièce : ses sommets apparaissent. Glissez un sommet pour changer la forme (les angles droits sont gardés). Touchez une cote pour la corriger.'
        : 'Tracez une pièce au doigt, en revenant à votre point de départ. Un petit trait le long d’un mur : porte ou fenêtre. Un toucher sélectionne une pièce.'),
    h('div', { class: 'puces' }, outil('tracer', '✏️ Tracer'), outil('modifier', '✋ Modifier'), outil('gomme', '🧽 Gomme'),
      h('button', { class: 'puce grand', type: 'button', id: 'annulerDessin', title: 'Annuler (Ctrl+Z)', disabled: !H.pile.length, onclick: annulerDessin }, '↶ Annuler'),
      h('button', { class: 'puce grand', type: 'button', id: 'retablirDessin', title: 'Rétablir (Ctrl+Maj+Z)', disabled: !H.refaire.length, onclick: retablirDessin }, '↷ Rétablir'),
      d.croquisEchelle === false && !S.echelleMur ? h('button', { class: 'puce grand', type: 'button', id: 'fixerEchelle', onclick: () => {
        const p = d.pieces.find(z => z.poly); if (!p) return; const m = CQ.murs(p.poly).reduce((b, x) => x.longueur > b.longueur ? x : b);
        S.echelleMur = { piece: p.id, i: m.i }; S.echelleVal = Math.round(m.longueur * 100) / 100; redessiner(); } }, '📏 Échelle') : null,
      h('button', { class: 'puce grand', type: 'button', id: 'finCroquis', onclick: basculerCroquis }, '✓ Terminé')),
    S.croquisInfo ? h('div', { class: 'message ' + S.croquisInfo.type, id: 'infoCroquis', role: 'status', style: 'margin:8px 0 0' }, S.croquisInfo.texte) : null);
}

/* les murs d'une pièce tracée : une cote chacun, modifiable ; les angles droits sont gardés */
function mursPiece(p, maj) {
  return [h('div', { class: 'champ' }, 'MURS DE LA PIÈCE (' + p.poly.length + ')'),
    CQ.murs(p.poly).map(m => reglageMetres(Math.round(m.longueur * 100) / 100, 'MUR ' + (m.i + 1) + (m.classe === 'O' ? ' (en biais)' : ''), 'mur-' + m.i, 0.05, x => {
      const np = CQ.changerLongueurMur(p.poly, m.i, x);
      if (!np) { infoCroquis('err', 'Cette longueur est impossible pour le mur ' + (m.i + 1) + ' (les murs se croiseraient).'); return redessiner(); }
      maj((q, y) => { q.poly = np; synchroBoite(q); y.ouvertures = CQ.recalerOuvertures(y.ouvertures, y.pieces, 0.4); });
    }, 0.3, ' m', 50))];
}

/* les cartes du mode : l'échelle (« Quelle est la longueur de ce mur ? »), le menu d'une ouverture, sa largeur */
function cartesCroquis(d, R) {
  if (!S.croquis) return null;
  const cartes = [];
  if (S.echelleMur) {
    const p = d.pieces.find(z => z.id === S.echelleMur.piece && z.poly), m = p && CQ.murs(p.poly)[S.echelleMur.i];
    if (m) cartes.push(h('div', { class: 'carte echelleMur', id: 'echelleMur' },
      h('b', {}, '📏 Quelle est la longueur de ce mur ?'),
      h('p', { class: 'mut petit' }, 'C’est le mur en rouge sur le dessin. Cette mesure règle l’échelle de tout le plan ; chaque mur reste modifiable ensuite.'),
      reglageMetres(S.echelleVal ?? Math.round(m.longueur * 100) / 100, 'LONGUEUR DU MUR', 'echelle-mur', 0.1, x => { S.echelleVal = x; redessiner(); }, 0.3, ' m', 200),
      h('div', { class: 'rang', style: 'margin-top:10px' },
        h('button', { class: 'gros sec', type: 'button', id: 'echellePlusTard', onclick: () => { S.echelleMur = null; redessiner(); } }, 'Plus tard'),
        h('button', { class: 'gros', type: 'button', id: 'echelleValider', onclick: appliquerEchelle }, 'Fixer l’échelle'))));
  }
  if (S.ouvNouvelle) cartes.push(h('div', { class: 'carte menuOuverture', id: 'menuOuverture' },
    h('b', {}, 'Que mettre sur ce mur ?'),
    h('div', { class: 'rang', style: 'margin-top:8px;flex-wrap:wrap' },
      [['porte', '🚪 Porte'], ['fenetre', '🪟 Fenêtre'], ['portefenetre', '▭ Baie']].map(([t, lib]) => h('button', { class: 'gros sec', type: 'button', 'data-type-ouverture': t, style: 'flex:1 1 30%', onclick: () => creerOuvertureCroquis(t) }, lib)),
      h('button', { class: 'lienRetour', type: 'button', id: 'annulerOuverture', onclick: () => { S.ouvNouvelle = null; redessiner(); } }, 'Annuler'))));
  const o = S.ouvEdit && d.ouvertures.find(z => z.id === S.ouvEdit);
  if (o) { const ty = DR.TYPES_OUVERTURE.find(z => z[0] === o.type) || DR.TYPES_OUVERTURE[0];
    cartes.push(h('div', { class: 'carte ouvEdition', id: 'ouvEdition' },
      h('div', { class: 'rang', style: 'justify-content:space-between' }, h('b', { style: 'color:' + COUL_OUV[o.type] }, ty[1] + ' posée'),
        h('button', { class: 'puce', type: 'button', id: 'retirerOuvertureCroquis', onclick: () => { majDessin(x => { x.ouvertures = x.ouvertures.filter(z => z.id !== o.id); }); S.ouvEdit = null; } }, '🗑 Retirer')),
      reglageMetres(o.largeur || ty[2], 'LARGEUR', 'ouv-largeur-croquis', 0.05, x => majDessin(y => { const q = y.ouvertures.find(z => z.id === o.id); if (q) q.largeur = x; }), 0.3, ' m', 6),
      h('button', { class: 'gros', type: 'button', id: 'ouvOk', style: 'margin-top:8px', onclick: () => { S.ouvEdit = null; redessiner(); } }, 'OK'))); }
  return cartes;
}

function ecranDessin() {
  const v = visite();
  if (!v) { S.ecran = 'accueil'; return ecranAccueil(); }
  // en arrivant sur l'écran (et non à chaque redessin), le croquis repart de zéro : jamais un mode resté actif d'une visite à l'autre
  if (S.dernierEcran !== 'dessin') { S.croquis = false; S.croquisOutil = 'tracer'; S.croquisInfo = null; S.ouvNouvelle = null; S.ouvEdit = null; S.echelleMur = null; }
  const d = dessinCourant(), R = DR.releveDepuisDessin(d.pieces, { hauteur: d.hauteur, etages: d.etages, ouvertures: d.ouvertures, symboles: d.symboles, toiture: d.toiture });
  const noms = DR.nomsEtages(d.etages, d.pieces), k = Math.min(etageDessin(), noms.length - 1); S.dessinEtage = k;
  const retour = () => { S.ecran = 'visite'; S.message = null; S.dessinPlein = false; S.croquis = false; S.ouvNouvelle = null; S.echelleMur = null; dessiner(); window.scrollTo(0, 0); };
  const ici = rectsEtage(d, R, k);
  // une nouvelle pièce se pose à droite de l'étage affiché : on la glisse ensuite où l'on veut
  const ajouter = () => majDessin(x => {
    const n = PIECE_DEFAUT(), rr = ici.map(o => o.r);
    n.etage = k; n.nom = x.pieces.length ? 'Pièce ' + (x.pieces.length + 1) : 'Séjour';
    n.libre = rr.length ? { x: Math.round((Math.max(...rr.map(r => r.x1)) + 0.5) * 100) / 100, y: Math.min(...rr.map(r => r.y0)) } : { x: 0, y: 0 };
    x.pieces.push(n); S.dessinSel = n.id; S.dessinSym = null;
    if (rr.length) S.message = { type: 'att', texte: 'Glissez « ' + n.nom + ' » à sa place sur l’aperçu : elle s’aimante aux murs voisins.' };
  });
  const creer = async () => {
    if (!d.pieces.length) return montrerMessage('att', 'Ajoutez au moins une pièce.');
    if (R.erreurs.length) return montrerMessage('err', 'À corriger avant de créer le plan : ' + R.erreurs.join(' '));
    const actuel = M.valeur(visite(), 'plan');
    if (actuel && !(await confirmer('Un plan existe déjà pour cette visite. Le remplacer par ce dessin ?\n(L’ancien plan, avec ses retouches, reste gardé de côté.)'))) return;
    const projet = 'Plan de ' + M.intitule(visite());
    const nv = DR.releveDepuisDessin(d.pieces, { projet, hauteur: d.hauteur, etages: d.etages, ouvertures: d.ouvertures, symboles: d.symboles, toiture: d.toiture });
    await changer(w => { let x = w; if (actuel) x = M.modifier(x, 'plan.ecarte', actuel); return M.modifier(x, 'plan', { releve: nv.donnees, resume: nv.resume }); });
    S.message = null; S.dessinPlein = false; S.croquis = false; vibrer(); ouvrirPlan();
  };
  const symSel = d.symboles.find(x => x.id === S.dessinSym && (x.etage || 0) === k);
  const tySel = symSel && DR.TYPES_SYMBOLE.find(z => z[0] === symSel.type);
  const toit = d.toiture || { type: 'aucune' };
  return [
    h('header', { class: 'haut' }, h('button', { class: 'lienRetour', onclick: retour }, '‹ Visite'), h('span', { class: 'titre' }, 'Dessin rapide'), pastilleEtat()),
    h('main', {},
      S.message && h('div', { class: 'message ' + S.message.type }, S.message.texte),
      h('h1', {}, '✏️ Dessin rapide'),
      h('p', { class: 'mut petit', id: 'aideDessin' }, '① Ajoutez et glissez vos pièces  ② posez portes, fenêtres et symboles  ③ « Créer le plan ». Touchez une pièce, une cote ou un symbole pour le régler.'),
      // l'étape suivante, visible tout de suite : le dessin devient le plan coté 2D et la 3D
      d.pieces.length ? h('div', { class: 'carte', id: 'etapePlan', style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' },
        h('button', { class: 'gros', type: 'button', id: 'creerPlanDessinHaut', style: 'flex:1 1 220px', onclick: creer }, '✓ Créer le plan 2D coté et la 3D'),
        R.erreurs.length ? h('div', { class: 'message err', style: 'flex:1 1 100%;margin:0', id: 'erreursDessin' }, 'À corriger d’abord : ' + R.erreurs.join(' ')) : null) : null,
      // les étages
      h('div', { class: 'puces etagesDessin' }, noms.map((nom, i) => h('button', { class: 'puce' + (i === k ? ' on' : ''), type: 'button', 'data-etage': i, onclick: () => { S.dessinEtage = i; S.dessinSel = null; S.dessinSym = null; redessiner(); } }, nom)),
        noms.length < 6 ? h('button', { class: 'puce', type: 'button', id: 'ajouterEtage', onclick: () => majDessin(x => { x.etages = [...noms, 'Étage ' + noms.length]; S.dessinEtage = noms.length; S.dessinSel = null; }) }, '＋ Étage') : null),
      h('div', { class: 'carte' + (S.dessinPlein ? ' dessinPlein' : ''), id: 'carteDessin', style: S.dessinPlein ? '' : 'padding:6px' }, cadreZoomDessin(apercuDessin(d, R)),
        // « ＋ Symbole » tout près du dessin : choisir, puis toucher l'endroit voulu
        S.poseSymbole ? h('div', { class: 'message att', id: 'invitePoseSymbole', style: 'margin:6px 0 0' }, '👆 Touchez le dessin à l’endroit du ' + ((DR.TYPES_SYMBOLE.find(t => t[0] === S.poseSymbole) || [])[1] || 'symbole').toLowerCase() + ' (près d’un mur, il s’y adosse). ',
            h('button', { class: 'lienRetour', type: 'button', onclick: () => { S.poseSymbole = null; redessiner(); } }, 'Annuler'))
          // les trois gestes de base, juste sous le dessin
          : h('div', { class: 'actionsDessin' },
            h('button', { class: 'gros sec', type: 'button', id: 'ajouterPieceDessin', onclick: ajouter }, '＋ Pièce'),
            h('button', { class: 'gros sec' + (S.croquis ? ' on' : ''), type: 'button', id: 'croquisDessin', 'aria-pressed': String(!!S.croquis), onclick: basculerCroquis }, '✏️ Croquis'),
            h('button', { class: 'gros sec' + (S.choixSymbole ? ' on' : ''), type: 'button', id: 'ajoutSymboleIci', onclick: () => { S.choixSymbole = !S.choixSymbole; if (S.choixSymbole) S.croquis = false; redessiner(); } }, '＋ Symbole'),
            d.pieces.length ? h('button', { class: 'gros sec', type: 'button', id: 'avantApresDessin', onclick: () => avantApresDessin().catch(() => montrerMessage('err', 'L’image du dessin n’a pas pu être préparée.')) }, '🖍 Annoter') : null),
        S.croquis ? barreCroquis(d) : null,
        S.choixSymbole && !S.poseSymbole ? h('div', { id: 'choixSymboleIci', style: 'margin-top:4px' }, DR.FAMILLES_SYMBOLE.map(([f, nomF]) => h('div', {},
          h('div', { class: 'mut petit', style: 'margin:6px 0 2px;font-weight:600' }, nomF),
          h('div', { class: 'puces' }, DR.TYPES_SYMBOLE.filter(t => t[5] === f).map(t => h('button', { class: 'puce', type: 'button', 'data-poser-symbole': t[0],
            onclick: () => { S.poseSymbole = t[0]; S.choixSymbole = false; redessiner(); } }, t[2] + ' ' + t[1])))))) : null),
      cartesCroquis(d, R),
      // lu sur un plan 2D : le plan d'origine sous la main, pour comparer
      (() => { const n = Array.isArray(d.sources) ? d.sources.length : d.source ? 1 : 0;
        const pps = n ? M.actifs(v.photos).filter(x => x.role === 'planPapier').sort((a, b) => String(b.importeLe || '').localeCompare(String(a.importeLe || ''))).slice(0, Math.min(n, 12)) : [];
        return n ? h('details', { class: 'carte planOrigine', id: 'planOrigine' }, h('summary', {}, n > 1 ? '🖼 Plans et esquisses d’origine (' + n + ')' : '🖼 Plan d’origine' + (d.source && d.source.partie ? ' · ' + d.source.partie : '')),
          pps.length ? pps.map(pp => imagePhoto(pp, 'imagePlanOrigine')) : h('div', { class: 'mut petit' }, (d.source && d.source.fichier) || '')) : null; })(),
      R.erreurs.length ? h('div', { class: 'message err' }, R.erreurs.join(' ')) : d.pieces.length ? h('div', { class: 'mut petit' }, R.resume.pieces + ' pièce' + (R.resume.pieces > 1 ? 's' : '') + ' · ' + String(R.resume.surface).replace('.', ',') + ' m²' + (R.resume.ouvertures ? ' · ' + R.resume.ouvertures + ' ouverture' + (R.resume.ouvertures > 1 ? 's' : '') : '')) : null,
      // le symbole sélectionné
      symSel && tySel ? h('div', { class: 'carte symboleDessin sel', 'data-symbole-sel': symSel.id },
        h('div', { class: 'rang', style: 'justify-content:space-between' }, h('b', {}, tySel[2] + ' ' + tySel[1]),
          h('button', { class: 'puce', type: 'button', id: 'retirerSymbole', onclick: () => majDessin(x => { x.symboles = x.symboles.filter(z => z.id !== symSel.id); S.dessinSym = null; }) }, '🗑 Retirer')),
        h('div', { class: 'puces' }, h('button', { class: 'puce', type: 'button', id: 'tournerSymbole', onclick: () => majDessin(x => { const q = x.symboles.find(z => z.id === symSel.id); if (q) q.rot = ((q.rot || 0) + 90) % 360; }) }, '⟳ Tourner d’un quart')),
        symSel.type === 'escalier' ? [reglageMetres(symSel.l || tySel[3], 'LONGUEUR DE LA TRÉMIE', 'symbole-l', 0.1, x => majDessin(y => { const q = y.symboles.find(z => z.id === symSel.id); if (q) q.l = x; }), 0.5),
          reglageMetres(symSel.w || tySel[4], 'LARGEUR DE LA TRÉMIE', 'symbole-w', 0.05, x => majDessin(y => { const q = y.symboles.find(z => z.id === symSel.id); if (q) q.w = x; }), 0.5)] : null,
        h('p', { class: 'mut petit', style: 'margin:6px 0 0' }, 'Glissez-le sur l’aperçu pour le placer.')) : null,
      ici.map(({ p }) => {
        const sel = S.dessinSel === p.id, i = d.pieces.indexOf(p);
        const maj = f => majDessin(x => { const q = x.pieces.find(y => y.id === p.id); if (q) f(q, x); });
        const autres = d.pieces.slice(0, i).filter(o => (o.etage || 0) === k);
        const r = R.rect.get(p.id);
        const ouvs = d.ouvertures.filter(o => o.piece === p.id);
        return h('div', { class: 'carte pieceDessin' + (sel ? ' sel' : ''), 'data-dessin': p.id },
          h('div', { class: 'rang', style: 'justify-content:space-between', onclick: () => { if (!sel) { S.dessinSel = p.id; S.dessinSym = null; redessiner(); } } },
            h('b', {}, p.nom + ' · ' + (p.poly ? String(Math.round(CQ.aire(p.poly) * 100) / 100).replace('.', ',') + ' m² · ' + p.poly.length + ' murs' : String(p.longueur).replace('.', ',') + ' × ' + String(p.largeur).replace('.', ',') + ' m') + (ouvs.length ? ' · ' + ouvs.length + ' ouv.' : '') + (p.note ? ' · 📝' : '')),
            h('button', { class: 'puce', type: 'button', 'aria-label': 'Supprimer ' + p.nom, onclick: async e => { e.stopPropagation(); if (!(await confirmer('Supprimer « ' + p.nom + ' » ?'))) return;
              majDessin(x => { x.pieces = x.pieces.filter(y => y.id !== p.id); x.ouvertures = x.ouvertures.filter(o => o.piece !== p.id); x.pieces.forEach(y => { if (y.contre && y.contre.id === p.id) delete y.contre; }); }); } }, '🗑')),
          sel ? [
            h('label', { class: 'champ' }, 'NOM', h('input', { class: 'in', name: 'dessin-nom', value: p.nom, autocapitalize: 'sentences', onchange: e => maj(q => { q.nom = e.target.value.trim() || 'Pièce'; }) })),
            // les noms les plus courants en un toucher (les autres se tapent)
            h('div', { class: 'puces' }, M.PIECES_COURANTES.slice(0, 6).map(n => h('button', { class: 'puce' + (p.nom === n ? ' on' : ''), type: 'button', onclick: () => maj(q => { q.nom = n; }) }, n))),
            p.poly ? mursPiece(p, maj) : [reglageMetres(p.longueur, 'LONGUEUR (gauche ↔ droite)', 'dessin-longueur', 0.1, x => maj(q => { q.longueur = x; })),
            reglageMetres(p.largeur, 'LARGEUR (haut ↕ bas)', 'dessin-largeur', 0.1, x => maj(q => { q.largeur = x; }))],

            // portes, fenêtres, passages : sur un côté de la pièce
            h('div', { class: 'champ' }, 'PORTES ET FENÊTRES'),
            ouvs.map(o => {
              const ty = DR.TYPES_OUVERTURE.find(z => z[0] === o.type) || DR.TYPES_OUVERTURE[0], lat = o.cote === 'gauche' || o.cote === 'droite';
              const majO = f => majDessin(x => { const q = x.ouvertures.find(z => z.id === o.id); if (q) f(q); });
              const longCote = r ? (lat ? r.y1 - r.y0 : r.x1 - r.x0) : 10;
              return h('div', { class: 'ouvDessin', 'data-ouv': o.id },
                h('div', { class: 'rang', style: 'justify-content:space-between' }, h('b', { style: 'color:' + COUL_OUV[o.type] }, ty[1]),
                  h('button', { class: 'puce', type: 'button', 'aria-label': 'Retirer ' + ty[1], onclick: () => majDessin(x => { x.ouvertures = x.ouvertures.filter(z => z.id !== o.id); }) }, '🗑')),
                h('div', { class: 'puces' }, COTES_OUV.map(([c, lib]) => h('button', { class: 'puce' + (o.cote === c ? ' on' : ''), type: 'button', 'data-cote': c, onclick: () => majO(q => { q.cote = c; q.position = 0.3; }) }, lib))),
                reglageMetres(o.position || 0, lat ? 'DEPUIS LE HAUT' : 'DEPUIS LA GAUCHE', 'ouv-position', 0.1, x => majO(q => { q.position = x; }), 0, ' m', Math.max(0, longCote - (DRnb(o.largeur) || 0.9))),
                reglageMetres(o.largeur || ty[2], 'LARGEUR', 'ouv-largeur', 0.05, x => majO(q => { q.largeur = x; }), 0.3, ' m', 6),
                o.hauteur ? reglageMetres(o.hauteur, 'HAUTEUR', 'ouv-hauteur', 0.05, x => majO(q => { q.hauteur = x; }), 0.3, ' m', 3.5) : null);
            }),
            h('div', { class: 'puces' }, DR.TYPES_OUVERTURE.map(ty => h('button', { class: 'puce', type: 'button', 'data-ajout-ouverture': ty[0],
              onclick: () => maj((q, x) => { const w = ty[2], L = DRnb(q.longueur) || 3; x.ouvertures.push({ id: M.nouvelId().slice(0, 8), piece: q.id, type: ty[0], cote: 'bas', position: Math.max(0, Math.round((L - w) / 2 * 100) / 100), largeur: w }); }) }, '＋ ' + ty[1]))),
            // le moins utilisé, replié : hauteur, note, position du nom, étage, pose précise
            h('details', { class: 'reglagesPiece', open: S.reglagesPiece === p.id, ontoggle: e => { S.reglagesPiece = e.target.open ? p.id : (S.reglagesPiece === p.id ? null : S.reglagesPiece); } },
              h('summary', {}, '⚙️ Plus de réglages : hauteur, note, nom, étage'),
              reglageMetres(p.hauteur || d.hauteur || 2.5, 'HAUTEUR SOUS PLAFOND' + (p.hauteur ? '' : ' (celle du dessin)'), 'piece-hauteur', 0.05, x => maj(q => { q.hauteur = x; }), 1.5, ' m', 8),
            h('label', { class: 'champ' }, 'NOTE DE LA PIÈCE (reprise dans le plan et le PDF)',
              h('textarea', { class: 'in', name: 'dessin-note', rows: 2, value: p.note || '', autocapitalize: 'sentences', placeholder: 'Ex. : mur à refaire, futur WC…', onchange: e => maj(q => { const t = e.target.value.trim(); if (t) q.note = t.slice(0, 600); else delete q.note; }) })),
            // le nom cache une cote : on le décale par pas de 25 cm (repris dans le plan coté, où il se glisse aussi au doigt)
            (() => { const et = DR.etiquetteDe(p), dec = (ddx, ddy) => maj(q => { const e = DR.etiquetteDe(q), nx = Math.round((e.dx + ddx) * 100) / 100, ny = Math.round((e.dy + ddy) * 100) / 100;
                const bx = (DRnb(q.longueur) || 3) / 2, by = (DRnb(q.largeur) || 3) / 2, cx = Math.max(-bx, Math.min(bx, nx)), cy = Math.max(-by, Math.min(by, ny));
                if (Math.abs(cx) < 0.01 && Math.abs(cy) < 0.01) delete q.etiquette; else q.etiquette = { dx: cx, dy: cy }; });
              return h('div', { class: 'champ' }, 'POSITION DU NOM' + (et.dx || et.dy ? ' (décalé)' : ' (au centre)'),
                h('div', { class: 'puces', id: 'positionNom' }, [['◀', -0.25, 0, 'gauche'], ['▲', 0, -0.25, 'haut'], ['▼', 0, 0.25, 'bas'], ['▶', 0.25, 0, 'droite']].map(([t, a, b, n]) =>
                  h('button', { class: 'puce', type: 'button', 'data-nom-vers': n, 'aria-label': 'Décaler le nom vers la ' + n.replace('haut', 'haut').replace('bas', 'bas'), onclick: () => dec(a, b) }, t)),
                  et.dx || et.dy ? h('button', { class: 'puce', type: 'button', 'data-nom-vers': 'centre', onclick: () => maj(q => { delete q.etiquette; }) }, 'Au centre') : null)); })(),
            noms.length > 1 ? [h('div', { class: 'champ' }, 'À L’ÉTAGE'), h('div', { class: 'puces' }, noms.map((nom, j) => h('button', { class: 'puce' + ((p.etage || 0) === j ? ' on' : ''), type: 'button',
              onclick: () => maj(q => { q.etage = j; if (r) q.libre = { x: r.x0, y: r.y0 }; delete q.contre; S.dessinEtage = j; }) }, nom)))] : null,
            autres.length && !p.poly ? [
              h('div', { class: 'champ' }, 'OU POSÉE PRÉCISÉMENT'),
              h('div', { class: 'puces' }, DR.COTES.map(([c, lib]) => h('button', { class: 'puce' + (p.contre && p.contre.cote === c ? ' on' : ''), type: 'button',
                onclick: () => maj(q => { delete q.libre; q.contre = { id: (q.contre && q.contre.id) || autres[autres.length - 1].id, cote: c, decalage: 0 }; }) }, lib))),
              h('label', { class: 'champ' }, 'CONTRE LA PIÈCE', h('select', { class: 'in', name: 'dessin-contre', onchange: e => maj(q => { delete q.libre; q.contre = e.target.value ? { id: e.target.value, cote: (q.contre && q.contre.cote) || 'droite', decalage: 0 } : undefined; }) },
                h('option', { value: '' }, p.libre ? 'Posée au doigt' : 'Aucune (posée à part)'), autres.map(o => h('option', { value: o.id, selected: !p.libre && p.contre && p.contre.id === o.id }, o.nom)))),
              p.contre && !p.libre ? reglageMetres(p.contre.decalage || 0, 'DÉCALAGE LE LONG DU MUR', 'dessin-decalage', 0.1, x => maj(q => { q.contre.decalage = x; }), -50) : null] : null)] : null);
      }),
      // le moins utilisé, replié : réglages de tout le dessin
      h('details', { class: 'carte optionsDessin', id: 'optionsDessin', open: !!S.optionsDessin, ontoggle: e => { S.optionsDessin = e.target.open; } },
        h('summary', {}, '⚙️ Plus d’options : hauteur, étage, toiture, aimant'),
        reglageMetres(d.hauteur || 2.5, 'HAUTEUR SOUS PLAFOND (toutes les pièces)', 'dessin-hauteur', 0.05, x => majDessin(y => { y.hauteur = x; }), 1.8),
        h('label', { class: 'champ' }, 'NOM DE L’ÉTAGE AFFICHÉ', h('input', { class: 'in', name: 'dessin-etage-nom', value: noms[k], onchange: e => majDessin(x => { const n = [...noms]; n[k] = e.target.value.trim() || n[k]; x.etages = n; }) })),
          h('div', { class: 'champ' }, 'TOITURE'),
        h('div', { class: 'puces' }, DR.TYPES_TOITURE.map(([c, lib]) => h('button', { class: 'puce' + (toit.type === c ? ' on' : ''), type: 'button', 'data-toiture': c,
          onclick: () => majDessin(x => { x.toiture = c === 'aucune' ? { type: 'aucune' } : { ...(x.toiture || {}), type: c, angle: (x.toiture && x.toiture.angle) || (c === 'plat' ? 2 : c === '1pente' ? 15 : 35) }; }) }, lib))),
        toit.type && toit.type !== 'aucune' && toit.type !== 'plat' ? reglageMetres(toit.angle || 35, 'PENTE', 'toiture-angle', 5, x => majDessin(y => { y.toiture = { ...(y.toiture || {}), angle: x }; }), 5, ' °', 70) : null,
        toit.type && toit.type !== 'aucune' ? h('p', { class: 'mut petit' }, 'Sur les pièces de l’étage le plus haut ; visible en 3D dans le plan.') : null,
        h('div', { class: 'champ' }, 'AIMANT DES PIÈCES'), h('div', { class: 'puces' }, boutonAimant()))),
    h('div', { class: 'barreBas' }, h('div', { class: 'in' },
      h('button', { class: 'gros sec', onclick: retour }, '‹ Visite'),
      h('button', { class: 'gros', id: 'creerPlanDessin', onclick: creer }, '✓ Créer le plan 2D coté et la 3D'))),
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
      dire(document.querySelector('textarea[name="assistant.texte"]') ? '📷 Note recopiée à la suite de la dictée : relisez-la, puis touchez « ✨ Remplir la fiche ».'
        : '📷 Note recopiée dans l’assistant : touchez « 🎙 Ouvrir l’assistant » pour la relire et remplir la fiche.', 'ok');
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
const photosNonEnvoyees = d => [d.garde, d.planImage, d.vue3d, d.planRendu, d.planAnnote, ...d.pieces.flatMap(p => p.photos.flatMap(ph => [ph, ...ph.imagines]))].filter(ph => ph && !ph.chemin).length;

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
      if (!(await confirmer('Retirer le lien ? Le client ne pourra plus ouvrir son dossier avec ce lien.'))) { btn.disabled = false; btn.textContent = lib; return; }
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
        (M.valeur(v, 'budget') || {}).calendrier && M.valeur(v, 'budget').calendrier.debut ? option('calendrier', 'Calendrier indicatif (étape Budget)') : null,
        option('imagines', 'Images d’intention (✨ Imaginé)'),
        option('notesPieces', 'Notes des pièces'),
        M.natureDe(v) !== 'renovation' ? option('terrain', 'Terrain, urbanisme et risques') : null,
        option('planRendu', 'Plan en couleur (IA)' + (M.valeur(v, 'planRendu') ? '' : ' — pas encore créé (étape Scan, « ✨ Plan en couleur »)')),
        option('vue3d', 'Vue 3D du relevé' + (M.valeur(v, 'plan3dImage') ? '' : ' — pas encore d’image (ouvrez puis fermez le plan)')),
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
  // un réglage d'aide à la vente (calendrier, financement) : l'estimation gardée ne bouge pas
  const majBudgetChamp = async f => {
    const b = f(JSON.parse(JSON.stringify({ lignes: [], ouvrages: [], ajust: {}, ...budget, ouvrages: budget.ouvrages || [] })));
    await poser('budget', b); redessiner();
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
    blocPistes(budget, env, T, pieces, F_, SP, majBudget),
    blocCalendrier(budget, (budget.ouvrages || []).map(c => c.ouvrageId), majBudgetChamp),
    blocMensualites(budget, calc.total, majBudgetChamp),
    blocMemo((budget.ouvrages || []).map(c => c.ouvrageId), M.valeur(v, 'projet.souhaits')),
    blocApprofondir(v, budget, calc, pieces, F_, majBudget),
    blocChiffragePrecis(v, budget, pieces, SP, majBudget),
  ];
  compteur(montant, S.totalAvant, calc.total); S.totalAvant = null;
  return vue;
}

/* ---------- l'aide à la vente du premier rendez-vous (releve/aide-vente.js) ----------
   Repris de l'ancienne « App rénovation » : pistes pour rentrer dans le
   budget du client, calendrier indicatif, mensualités indicatives (désactivées
   d'office) et mémo du vendeur (interne). Rien ne s'applique sans un toucher. */
function blocPistes(budget, env, T, pieces, F_, SP, majBudget) {
  const pistes = AV.pistesBudget(budget, env, T, pieces, F_, SP);
  if (!pistes.length) return null;
  const appliquer = a => majBudget(b => {
    if (a.type === 'tousEco') b.ouvrages.forEach(c => { c.niveau = 'eco'; });
    else if (a.type === 'eco') { const c = b.ouvrages.find(x => x.id === a.id); if (c) c.niveau = 'eco'; }
    else if (a.type === 'retirer') b.ouvrages = b.ouvrages.filter(x => x.id !== a.id);
    return b;
  });
  return h('div', { class: 'carte pistes', id: 'pistesBudget' },
    h('b', {}, 'Pour rentrer dans le budget :'),
    pistes.map(p => h('div', { class: 'piste', 'data-piste': p.action.type },
      h('span', {}, p.texte, h('small', { class: 'mut petit' }, '− ' + AV.eur(p.economie) + (p.rentre ? ' : rentre dans le budget' : ''))),
      h('button', { class: 'puce', type: 'button', onclick: () => appliquer(p.action) }, 'Appliquer'))));
}

function blocCalendrier(budget, ouvrageIds, majChamp) {
  const c = budget.calendrier || {};
  const k = AV.calendrier({ debut: c.debut, ouvrageIds, urbanisme: c.urbanisme, abf: c.abf });
  const poserCal = patch => majChamp(b => { b.calendrier = { ...(b.calendrier || {}), ...patch }; return b; });
  const case_ = (cle, lib, val) => h('label', { class: 'case' }, h('input', { type: 'checkbox', checked: !!val, name: 'cal-' + cle, onchange: e => poserCal({ [cle]: e.target.checked }) }), h('span', {}, lib));
  return h('details', { class: 'approfondir calendrierBudget', id: 'calendrierBudget', open: !!c.debut || !!S.calendrierOuvert, ontoggle: e => { S.calendrierOuvert = e.target.open; } },
    h('summary', {}, '📅 Calendrier indicatif'),
    h('label', { class: 'champ' }, 'DÉBUT DE CHANTIER SOUHAITÉ',
      h('input', { class: 'in', type: 'date', name: 'cal-debut', value: c.debut || '', onchange: e => poserCal({ debut: e.target.value || null }) })),
    case_('urbanisme', 'Dossier d’urbanisme (déclaration préalable ou permis)', c.urbanisme !== false),
    case_('abf', 'Secteur protégé (avis supplémentaire)', c.abf),
    !k.debut
      ? h('p', { class: 'mut petit', id: 'calendrierSans' }, 'Sans date précise : comptez au moins ' + Math.round(k.pre) + ' semaines entre la signature de la mission et le début des travaux (début possible vers le ' + AV.dateLongue(k.auPlusTot) + ').')
      : [k.court ? h('div', { class: 'message att', id: 'calendrierCourt' }, h('b', {}, 'Délai court pour cette date. '), 'Pour démarrer au plus tôt : à partir du ' + AV.dateLongue(k.auPlusTot) + ', ou accélérer certaines étapes.') : null,
         h('div', { class: 'calendrier' }, k.lignes.map(l => h('div', { class: 'ligneCal' + (l.cle === 'signature' || l.cle === 'travaux' ? ' cle' : ''), 'data-cal': l.cle },
           h('span', { class: 'dateCal' }, AV.dateLongue(l.date)), h('span', {}, l.libelle, l.semaines ? h('small', { class: 'mut petit' }, ' ' + Math.round(l.semaines) + ' sem.') : null)))),
         h('p', { class: 'mut petit' }, 'Délais moyens, à confirmer. Le calendrier peut figurer dans le dossier client (option).')]);
}

function blocMensualites(budget, total, majChamp) {
  const f = budget.financement || {}, sim = AV.simulerCredit(total, f);
  const poserFin = patch => majChamp(b => { b.financement = { ...(b.financement || {}), ...patch }; return b; });
  return h('details', { class: 'approfondir mensualitesBudget' + (f.actif ? '' : ' interne'), id: 'mensualitesBudget', open: !!f.actif, ontoggle: e => { S.mensualitesOuvert = e.target.open; } },
    h('summary', {}, '💶 Mensualités indicatives'),
    h('label', { class: 'case' }, h('input', { type: 'checkbox', checked: !!f.actif, name: 'fin-actif', onchange: e => poserFin({ actif: e.target.checked }) }), h('span', {}, 'Afficher une simulation de mensualités')),
    h('p', { class: 'mut petit' }, 'À n’activer qu’après avoir vérifié les règles applicables à la présentation d’un crédit à un client. Simulation indicative : ce n’est pas une offre de crédit, et elle ne figure jamais dans le dossier client.'),
    f.actif ? [
      h('div', { class: 'puces' }, AV.DUREES_CREDIT.map(m => h('button', { class: 'puce' + ((sim ? sim.duree : AV.DUREE_DEFAUT) === m ? ' on' : ''), type: 'button', 'data-duree': m, onclick: () => poserFin({ duree: m }) }, m + ' mois'))),
      h('label', { class: 'champ' }, 'APPORT (€)', h('input', { class: 'in', inputMode: 'numeric', name: 'fin-apport', value: f.apport ?? '', placeholder: 'ex. 10 000', onchange: e => poserFin({ apport: e.target.value.trim() === '' ? null : e.target.value }) })),
      h('label', { class: 'champ' }, 'TAUX INDICATIF (% PAR AN)', h('input', { class: 'in', inputMode: 'decimal', name: 'fin-taux', value: f.taux ?? AV.TAUX_DEFAUT, onchange: e => poserFin({ taux: e.target.value.trim() === '' ? null : e.target.value }) })),
      sim ? h('div', { class: 'carte', id: 'resultatMensualites' },
        h('div', { class: 'plage' }, 'de ' + AV.eur(sim.mensualite.min) + ' à ' + AV.eur(sim.mensualite.max) + ' par mois'),
        h('div', { class: 'mut petit' }, 'Sur ' + sim.duree + ' mois à ' + String(sim.taux).replace('.', ',') + ' % · capital de ' + AV.eur(sim.capital.min) + ' à ' + AV.eur(sim.capital.max) + (sim.apport ? ' après un apport de ' + AV.eur(sim.apport) : ''))) : h('p', { class: 'mut petit' }, 'Choisissez d’abord des travaux : la simulation part de l’estimation.')] : null);
}

function blocMemo(ouvrageIds, souhaits) {
  const memos = AV.memosPour(ouvrageIds, souhaits);
  return h('details', { class: 'approfondir interne memoVendeur', id: 'memoVendeur', open: !!S.memoOuvert, ontoggle: e => { S.memoOuvert = e.target.open; } },
    h('summary', {}, '🎯 Mémo de rendez-vous (interne)'),
    memos.length ? memos.map(m => h('div', { class: 'memo', 'data-memo': m.cle },
      h('h3', {}, m.titre),
      h('div', { class: 'champ' }, 'QUESTIONS À POSER'), h('ul', {}, m.q.map(x => h('li', {}, x))),
      h('div', { class: 'champ' }, 'À PROPOSER'), h('ul', {}, m.up.map(x => h('li', {}, x))),
      h('div', { class: 'champ' }, 'POINTS DE VIGILANCE'), h('ul', {}, m.vig.map(x => h('li', {}, x)))))
      : h('p', { class: 'mut petit' }, 'Touchez des travaux (cuisine, salle de bains, isolation…) : leurs questions et points de vigilance apparaissent ici.'));
}

/* le message de suivi (étape Fin) : e-mail après le rendez-vous, SMS ou relance ; modifiable, jamais envoyé tout seul */
function blocMessageSuivi(v) {
  const budget = M.valeur(v, 'budget') || {}, pieces = B.piecesDuPlan(M.valeur(v, 'plan'));
  const calc = B.calculerEstimation(budget, tableOuv(), pieces, fourchettes(), M.surfacesProjet(v));
  const cal = AV.calendrier({ debut: (budget.calendrier || {}).debut, ouvrageIds: (budget.ouvrages || []).map(c => c.ouvrageId), urbanisme: (budget.calendrier || {}).urbanisme, abf: (budget.calendrier || {}).abf });
  const type = S.messageType || 'mail';
  const propose = AV.messageSuivi(type, {
    civilite: M.valeur(v, 'client.civilite'), nom: M.valeur(v, 'client.nom'), dateVisite: (v.creeLe || '').slice(0, 10),
    fourchette: calc.vide ? null : calc.total,
    lignes: calc.ouvrages.filter(r => r.ouvrage && !r.manque).map(r => ({ libelle: r.ouvrage.nom, min: r.min, max: r.max })),
    debut: cal.debut, signerAvant: cal.signerAvant });
  S.messageEdit = S.messageEdit || {};
  const texte = S.messageEdit[type] != null ? S.messageEdit[type] : propose;
  const email = M.valeur(v, 'client.email'), tel = M.valeur(v, 'client.telephone');
  const objet = type === 'relance' ? 'Votre projet : où en êtes-vous ?' : 'Votre projet : récapitulatif de notre rendez-vous';
  let zone, info;
  const copier = async () => {
    try { await navigator.clipboard.writeText(zone.value); info.textContent = 'Texte copié.'; }
    catch (e) { zone.select(); info.textContent = 'Sélectionné : copiez-le à la main.'; }
  };
  return h('div', { class: 'carte interne messageSuivi', id: 'messageSuivi' },
    h('h2', {}, '✉️ Message de suivi'),
    h('p', { class: 'mut petit' }, 'Préparé d’après la visite ; relisez et modifiez-le. Rien ne part sans votre geste.'),
    h('div', { class: 'puces' }, AV.TYPES_MESSAGE.map(([k, lib]) => h('button', { class: 'puce' + (type === k ? ' on' : ''), type: 'button', 'data-message': k, onclick: () => { S.messageType = k; redessiner(); } }, lib))),
    zone = h('textarea', { class: 'in', id: 'texteMessage', rows: type === 'sms' ? 6 : 14, style: 'width:100%;margin-top:8px', 'aria-label': 'Texte du message',
      oninput: e => { S.messageEdit[type] = e.target.value; } }, texte),
    h('div', { class: 'rang', style: 'flex-wrap:wrap;margin-top:8px' },
      h('button', { class: 'gros sec', type: 'button', id: 'copierMessage', onclick: copier }, '📋 Copier'),
      type === 'sms' ? (tel ? h('a', { class: 'gros sec', id: 'ouvrirSms', href: 'sms:' + String(tel).replace(/\s/g, '') + '?&body=' + encodeURIComponent(zone.value), onclick: e => { e.currentTarget.href = 'sms:' + String(tel).replace(/\s/g, '') + '?&body=' + encodeURIComponent(zone.value); } }, '💬 Ouvrir les messages') : null)
        : (email ? h('a', { class: 'gros sec', id: 'ouvrirMail', href: 'mailto:' + email + '?subject=' + encodeURIComponent(objet) + '&body=' + encodeURIComponent(zone.value), onclick: e => { e.currentTarget.href = 'mailto:' + email + '?subject=' + encodeURIComponent(objet) + '&body=' + encodeURIComponent(zone.value); } }, '✉️ Ouvrir dans la messagerie') : null),
      S.messageEdit[type] != null ? h('button', { class: 'lienRetour', type: 'button', id: 'reprendreMessage', onclick: () => { delete S.messageEdit[type]; redessiner(); } }, '↺ Reprendre le texte proposé') : null),
    (type === 'sms' ? !tel : !email) ? h('div', { class: 'mut petit' }, (type === 'sms' ? 'Téléphone' : 'E-mail') + ' du client non renseigné : copiez le texte.') : null,
    info = h('div', { class: 'mut petit', role: 'status' }));
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
  const d = h('details', { class: 'approfondir interne', open: !!S.budgetDetail || (budget.lignes || []).length > 0, ontoggle: e => { S.budgetDetail = e.target.open; } },
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

/* ---------- le chiffrage précis (catalogue de CP, partagé par l'équipe) ----------
   Table releve_reglages, ligne « chiffrage » : articles, prix et gabarits de
   CP Constructions (releve/chiffrage.js). Le dépôt est public, donc rien de
   tout cela n'est livré avec le code : la ligne s'installe à part (voir
   releve/README.md). Lecture seule ici, copie sur l'appareil pour servir
   sans réseau ; sans ligne valide, le bloc ne s'affiche pas. */
const CLE_CHIFFRAGE = 'cp-releve-chiffrage';
const PC = { donnees: null, etat: 'local' };
async function chargerChiffrage() {
  try { const c = JSON.parse(localStorage.getItem(CLE_CHIFFRAGE) || 'null'); if (CH.catalogueValide(c)) PC.donnees = c; } catch (e) { /* pas de copie */ }
  try {
    const { data, error } = await supa.from('releve_reglages').select('donnees').eq('id', 'chiffrage').maybeSingle();
    if (error) { PC.etat = 'local'; return; }
    PC.etat = 'serveur';
    if (data && CH.catalogueValide(data.donnees)) {
      PC.donnees = data.donnees;
      try { localStorage.setItem(CLE_CHIFFRAGE, JSON.stringify(data.donnees)); } catch (e) { /* stockage plein */ }
    }
  } catch (e) { PC.etat = 'local'; }
}

/* Détail estimatif par lots, avec les prix de CP et les quantités tirées du
   plan. INTERNE : la marge et les prix d'artisans ne partent jamais dans le
   dossier client (dossier.js ne lit que l'estimation de budget.js). Gardé
   dans la visite, sous budget.chiffrage. */
const nombre = t => { const n = parseFloat(String(t).replace(/\s/g, '').replace(',', '.')); return isNaN(n) ? null : n; };
const virgule = n => n == null ? '' : String(n).replace('.', ',');
const euros2 = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
function blocChiffragePrecis(v, budget, pieces, SP, majBudget) {
  if (!CH.catalogueValide(PC.donnees)) return null;
  const D = PC.donnees, c = budget.chiffrage || null;
  const dePlan = CH.pilotesDepuisPlan(pieces);
  // sans plan, la surface dite à l'étape Projet (construction, agrandissement) sert de point de départ
  const dite = SP && (SP.construction || SP.agrandissement) ? { S: +(SP.construction || SP.agrandissement) || 0, Sg: 0 } : null;
  const depart = dePlan || (dite && dite.S > 0 ? { ...dite, P: CH.perimetreEstime(dite.S), source: 'projet' } : { S: 0, Sg: 0, P: 0, source: null });
  // saisies pas encore validées par « Générer » : rattachées à CETTE visite (S.chiffrageBr.v), jamais reprises sur une autre
  const br = S.chiffrageBr && S.chiffrageBr.v === v.id ? S.chiffrageBr : null;
  const pil = c ? c.pilotes : { ...depart, ...((br && br.pilotes) || {}) };
  const gab = c ? c.gabarit : ((br && br.gabarit) || (pil.S > 0 ? (CH.gabaritProche(D, pil) || {}).id : D.gabarits[0].id));
  const maj = f => majBudget(b => { if (b.chiffrage) f(b.chiffrage, b); return b; });
  const ouvert = S.chiffrageOuvert != null ? S.chiffrageOuvert : !!c;
  const det = h('details', { class: 'approfondir interne', id: 'chiffragePrecis', open: ouvert, ontoggle: e => { S.chiffrageOuvert = e.target.open; } },
    h('summary', {}, 'Chiffrage précis (catalogue CP) — interne'));
  det.appendChild(h('p', { class: 'mut petit' }, 'Détail par lots avec vos prix, d’après les surfaces du plan. Interne : ni la marge ni les prix d’artisans ne figurent dans le dossier client. Estimation d’avant-projet à vérifier avant tout devis.'));

  // les grandeurs qui pilotent les quantités
  const champsPilotes = h('div', { class: 'rang', style: 'gap:8px;flex-wrap:wrap' }, CH.PILOTES.map(([k, nom]) =>
    h('label', { class: 'champ', style: 'flex:1;min-width:110px' }, nom,
      h('input', { class: 'in', inputMode: 'decimal', name: 'chiffrage-' + k, value: virgule(pil[k]),
        onchange: e => { const n = nombre(e.target.value); const nv = { ...pil, [k]: n == null ? 0 : n };
          if (k === 'S' && !c) nv.P = CH.perimetreEstime(nv.S);
          if (c) maj(x => { x.pilotes = nv; }); else { S.chiffrageBr = { ...(br || {}), v: v.id, pilotes: nv }; S.chiffrageOuvert = true; redessiner(); } } }))));
  det.appendChild(champsPilotes);
  det.appendChild(h('div', { class: 'mut petit', style: 'margin:4px 0 8px' }, !c && depart.source === 'plan' ? 'Surfaces lues dans le plan (garage et annexes à part) ; le périmètre est estimé : à corriger.'
    : !c && depart.source === 'projet' ? 'Pas de plan : surface dite à l’étape Projet, à vérifier.' : !c ? 'Pas de plan : saisissez les surfaces.' : 'Surfaces du chiffrage : modifiez-les puis « Recalculer les quantités ».'));
  det.appendChild(h('label', { class: 'champ' }, 'GABARIT (DOSSIER DE RÉFÉRENCE)',
    h('select', { class: 'in', id: 'gabaritChiffrage', onchange: e => { if (c) maj(x => { x.gabarit = e.target.value; }); else { S.chiffrageBr = { ...(br || {}), v: v.id, gabarit: e.target.value }; redessiner(); } } },
      D.gabarits.map(g => h('option', { value: g.id, selected: g.id === gab }, g.nom)))));
  const g0 = D.gabarits.find(x => x.id === gab);
  if (g0 && pil.S > 0 && CH.ecartGabarit(g0, pil) > 0.25)
    det.appendChild(h('div', { class: 'manque', style: 'margin:6px 0' }, 'Votre surface s’écarte de plus de 25 % de celle du gabarit : l’estimation sera moins fiable, choisissez-en un plus proche si possible.'));

  const nid = () => M.nouvelId();

  // les questions d'affinage : vide sanitaire, chauffage, couverture…
  const questions = CH.questionsDe(D);
  const opts = c ? (c.options || {}) : ((br && br.options) || {});
  if (questions.length) {
    const nRep = CH.nbReponses(D, opts);
    const bq = h('details', { class: 'questionsChiffrage', id: 'questionsChiffrage', open: S.chiffrageQuestions != null ? S.chiffrageQuestions : !c, ontoggle: e => { S.chiffrageQuestions = e.target.open; } },
      h('summary', {}, 'Précisions sur le projet' + (nRep ? ' · ' + nRep + ' réponse' + (nRep > 1 ? 's' : '') + ' modifiée' + (nRep > 1 ? 's' : '') : '')));
    bq.appendChild(h('p', { class: 'mut petit' }, 'Le gabarit reprend les choix d’un ancien dossier. Si votre projet diffère (vide sanitaire, chauffage, couverture…), dites-le : les articles et les quantités suivent.'));
    for (const q of questions) {
      const ch = CH.choixDe(q, opts);
      bq.appendChild(h('label', { class: 'champ', style: 'margin-top:8px' }, q.nom.toUpperCase(),
        h('select', { class: 'in', name: 'question-' + q.id,
          onchange: e => { const val = e.target.value;
            if (c) maj(x => { x.options = { ...(x.options || {}), [q.id]: val }; x.lignes = CH.rebaser(D, x.lignes, x.gabarit, x.pilotes, nid, x.options); });
            else { S.chiffrageBr = { ...(br || {}), v: v.id, options: { ...opts, [q.id]: val } }; S.chiffrageQuestions = true; redessiner(); } } },
          q.choix.map(o => h('option', { value: o.id, selected: o.id === ch.id }, o.nom)))));
      if (q.aide && ch !== q.choix[0]) bq.appendChild(h('div', { class: 'mut petit' }, q.aide));
    }
    det.appendChild(bq);
  }
  if (!c) {
    det.appendChild(h('button', { class: 'gros', id: 'genererChiffrage', style: 'margin-top:10px', disabled: !(pil.S > 0),
      onclick: () => { const gid = gab; S.chiffrageBr = null; S.chiffrageOuvert = true;
        majBudget(b => { b.chiffrage = { gabarit: gid, pilotes: { S: pil.S, Sg: pil.Sg || 0, P: pil.P || CH.perimetreEstime(pil.S) }, coef: D.coef || 1, tva: D.tva != null ? D.tva : 20, retro: true,
          options: { ...opts }, lignes: CH.genererLignes(D, gid, pil, nid, opts) }; return b; }); } },
      '✨ Générer le chiffrage'));
    return det;
  }

  // paramètres et bilan
  const R = CH.chiffrer(D, c.lignes, { coef: c.coef, tva: c.tva, retro: c.retro });
  det.appendChild(h('div', { class: 'rang', style: 'gap:8px;flex-wrap:wrap;margin-top:6px' },
    h('label', { class: 'champ', style: 'flex:1;min-width:110px' }, 'COEFFICIENT DE VENTE',
      h('input', { class: 'in', inputMode: 'decimal', name: 'chiffrage-coef', value: virgule(c.coef), onchange: e => { const n = nombre(e.target.value); if (n > 0) maj(x => { x.coef = n; }); } })),
    h('label', { class: 'champ', style: 'flex:1;min-width:90px' }, 'TVA (%)',
      h('input', { class: 'in', inputMode: 'decimal', name: 'chiffrage-tva', value: virgule(c.tva), onchange: e => { const n = nombre(e.target.value); if (n != null && n >= 0) maj(x => { x.tva = n; }); } }))));
  if (D.retro && D.retro.pct) det.appendChild(h('label', { class: 'case', style: 'display:flex;gap:8px;align-items:flex-start;margin:8px 0' },
    h('input', { type: 'checkbox', id: 'retroChiffrage', checked: !!c.retro, onchange: e => maj(x => { x.retro = e.target.checked; }) }),
    h('span', { class: 'petit' }, 'Prix artisan avec majoration de ' + Math.round(D.retro.pct * 100) + ' % (marge arrière) sur les lots concernés')));
  det.appendChild(h('div', { class: 'carte', id: 'bilanChiffrage' },
    h('div', { class: 'montant', id: 'ventechiffrage' }, euros(R.venteTTC) + ' TTC'),
    h('div', { class: 'mut petit' }, 'Prix de vente (' + euros(R.venteHT) + ' HT, coefficient ' + virgule(R.coef) + ')'),
    h('div', { class: 'rang', style: 'justify-content:space-between;margin-top:8px' }, h('span', {}, 'Prix artisan HT'), h('b', { id: 'artisanchiffrage' }, euros2(R.artisanHT))),
    h('div', { class: 'rang', style: 'justify-content:space-between' }, h('span', {}, 'Marge annoncée TTC'), h('b', {}, euros2(R.margeAnnoncee))),
    h('div', { class: 'rang', style: 'justify-content:space-between' }, h('span', {}, 'Marge arrière TTC'), h('b', {}, euros2(R.retroTTC))),
    h('div', { class: 'rang', style: 'justify-content:space-between' }, h('span', {}, 'Marge totale TTC'), h('b', { id: 'margechiffrage' }, euros2(R.margeTotale) + ' · ' + virgule(R.pourcentMarge) + ' %'))));

  if (R.aChiffrer) det.appendChild(h('div', { class: 'manque', id: 'achiffrerChiffrage', style: 'margin:6px 0' },
    R.aChiffrer + ' ligne' + (R.aChiffrer > 1 ? 's' : '') + ' sans prix au catalogue : comptée' + (R.aChiffrer > 1 ? 's' : '') + ' à 0 €. Saisissez le prix unitaire (devis d’artisan) pour un total complet.'));
  // les lots et leurs lignes
  const fermes = S.chiffrageLotsOuverts || (S.chiffrageLotsOuverts = {});
  for (const L of R.lots) {
    det.appendChild(h('details', { class: 'lotChiffrage', 'data-lot': L.lot, open: !!fermes[L.lot], ontoggle: e => { fermes[L.lot] = e.target.open; } },
      h('summary', {}, L.lot + ' — ' + L.nom + ' · ' + euros2(L.total)),
      L.lignes.map(l => h('div', { class: 'carte', 'data-ligne': l.id },
        h('div', { class: 'rang', style: 'justify-content:space-between;align-items:flex-start' },
          h('b', { class: 'petit' }, l.libelle),
          h('button', { class: 'puce', type: 'button', 'aria-label': 'Retirer la ligne', onclick: () => maj(x => { x.lignes = x.lignes.filter(y => y.id !== l.id); }) }, '🗑')),
        h('div', { class: 'rang', style: 'gap:8px;align-items:flex-end' },
          h('label', { class: 'champ', style: 'flex:1' }, 'QTÉ (' + l.unite + ')' + (l.qte0 != null && Math.abs(l.qte - l.qte0) > 1e-9 ? ' · retouchée' : ''),
            h('input', { class: 'in', inputMode: 'decimal', name: 'cq-' + l.id, value: virgule(l.qte), onchange: e => { const n = nombre(e.target.value); if (n != null && n >= 0) maj(x => { const y = x.lignes.find(z => z.id === l.id); if (y) y.qte = n; }); } })),
          h('label', { class: 'champ', style: 'flex:1' }, 'PU HT' + (l.saisi ? ' · saisi' : l.aChiffrer ? ' · à chiffrer' : ''),
            h('input', { class: 'in', inputMode: 'decimal', name: 'cp-' + l.id, value: l.aChiffrer ? '' : virgule(l.pu), placeholder: l.aChiffrer ? 'à saisir' : '', onchange: e => { const n = nombre(e.target.value); maj(x => { const y = x.lignes.find(z => z.id === l.id); if (y) { if (n == null || n === l.pu && !l.saisi) delete y.pu; else y.pu = n; } }); } })),
          h('div', { class: 'petit', style: 'min-width:84px;text-align:right;padding-bottom:10px' }, euros2(l.total)))))));
  }

  // ajouter un article du catalogue, recalculer, retirer
  const liste = h('datalist', { id: 'listeArticlesChiffrage' }, Object.entries(D.articles).sort((a, b) => a[1].lot.localeCompare(b[1].lot)).map(([code, a]) => h('option', { value: code + ' — ' + a.l.slice(0, 70) })));
  det.appendChild(h('div', { class: 'champ', style: 'margin-top:12px' }, 'AJOUTER UN ARTICLE DU CATALOGUE'));
  det.appendChild(liste);
  det.appendChild(h('div', { class: 'rang', style: 'gap:8px' },
    h('input', { class: 'in', id: 'articleChiffrage', list: 'listeArticlesChiffrage', placeholder: 'Rechercher…', style: 'flex:2' }),
    h('input', { class: 'in', id: 'articleQte', inputMode: 'decimal', placeholder: 'Qté', style: 'flex:1' }),
    h('button', { class: 'gros sec', id: 'ajouterArticle', style: 'flex:0', onclick: () => {
      const code = (document.getElementById('articleChiffrage').value.split(' — ')[0] || '').trim();
      const l = CH.nouvelleLigne(D, code, nombre(document.getElementById('articleQte').value), nid);
      if (!l) { S.message = { type: 'att', texte: 'Article introuvable dans le catalogue.' }; redessiner(); return; }
      S.chiffrageLotsOuverts = { ...fermes, [D.articles[code].lot]: true };
      maj(x => { x.lignes.push(l); }); } }, 'Ajouter')));
  det.appendChild(h('div', { class: 'rang', style: 'gap:8px;margin-top:12px;flex-wrap:wrap' },
    h('button', { class: 'gros sec', id: 'recalculerChiffrage', onclick: () => maj(x => { x.lignes = CH.rebaser(D, x.lignes, x.gabarit, x.pilotes, nid, x.options); }) }, '↻ Recalculer les quantités'),
    h('button', { class: 'gros sec', id: 'retirerChiffrage', onclick: async () => { if ((await confirmer('Retirer tout le chiffrage précis de cette visite ?'))) majBudget(b => { delete b.chiffrage; return b; }); } }, '🗑 Retirer le chiffrage')));
  det.appendChild(h('p', { class: 'mut petit' }, '« Recalculer » ne touche ni aux quantités retapées, ni aux prix saisis, ni aux articles ajoutés.'));
  return det;
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
          h('button', { class: 'puce', type: 'button', 'aria-label': 'Supprimer le poste', onclick: async () => { if (!(await confirmer('Supprimer le poste « ' + l.libelle + ' » ?'))) return; poserL(l.id, x => { x.supprime = true; }); dessiner(); } }, '🗑')),
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
const PROFONDEUR = { connexion: 0, accueil: 0, demo: 1, visite: 1 };
const profondeur = e => PROFONDEUR[e] ?? 2;
const ECRANS_SANS_VISITE = new Set(['connexion', 'accueil', 'demo', 'ouvrages', 'fourchettes']);
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
  const ecran = S.ecran === 'connexion' ? ecranConnexion() : S.ecran === 'visite' ? ecranVisite() : S.ecran === 'plan' ? ecranPlan() : S.ecran === 'fourchettes' ? ecranFourchettes() : S.ecran === 'ouvrages' ? ecranOuvrages() : S.ecran === 'dossier' ? ecranDossier() : S.ecran === 'assistant' ? ecranAssistant() : S.ecran === 'dessin' ? ecranDessin() : S.ecran === 'annoter' ? ecranAnnoter() : S.ecran === 'demo' ? ecranDemo() : ecranAccueil();
  app.replaceChildren(...ecran.flat(Infinity).filter(Boolean));
  // en quittant le plan annoté (bouton, retour du navigateur…), son image est refaite
  if (S.dernierEcran === 'annoter' && S.ecran !== 'annoter' && S.courante) exporterAnnotations(S.courante);
  S.dernierEcran = S.ecran;
  suivreHistorique();
}


/* ---------- « ▶ Démo » : le parcours en 5 écrans, sur un exemple fictif ----------
   Rien n'est lu ni écrit : ni visite, ni base, ni photo réelle (images dessinées sur place). Sert à montrer l'outil
   à un client en une minute ; défilement automatique, touchez pour suivre à son rythme. */
const svgUrl = (corps, l = 800, ha = 600) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + l + ' ' + ha + '">' + corps + '</svg>');
const DEMO_AVANT = svgUrl('<rect width="800" height="600" fill="#CFC8BB"/><rect y="430" width="800" height="170" fill="#9C9486"/><rect x="90" y="90" width="190" height="230" fill="#8FA7B5"/><rect x="540" y="200" width="120" height="230" fill="#6E675B"/><circle cx="120" cy="140" r="40" fill="#B7AE9E" opacity=".6"/><path d="M0 430 L800 430" stroke="#857E70" stroke-width="6"/>');
const DEMO_APRES = svgUrl('<rect width="800" height="600" fill="#F6F0E4"/><rect y="430" width="800" height="170" fill="#C9A878"/><rect x="90" y="90" width="190" height="230" fill="#BFE0F0"/><rect x="95" y="95" width="180" height="220" fill="none" stroke="#fff" stroke-width="10"/><rect x="520" y="230" width="190" height="200" rx="14" fill="#2C4A5E"/><rect x="540" y="215" width="150" height="40" rx="12" fill="#3C6079"/><circle cx="640" cy="120" r="42" fill="#FFD98A"/><path d="M0 430 L800 430" stroke="#E5D8BF" stroke-width="6"/>');
const DEMO_PLAN = svgUrl('<rect width="800" height="600" fill="#fff"/><g fill="#F5F1EA" stroke="#2C4A5E" stroke-width="6"><rect x="60" y="60" width="400" height="300"/><rect x="460" y="60" width="280" height="300"/><rect x="60" y="360" width="250" height="180"/><rect x="310" y="360" width="430" height="180"/></g><g font-family="sans-serif" font-size="28" fill="#2C4A5E" text-anchor="middle"><text x="260" y="215">Séjour 28 m²</text><text x="600" y="215">Cuisine 14 m²</text><text x="185" y="460">Chambre 12 m²</text><text x="525" y="460">Suite parentale 18 m²</text></g><g stroke="#C5563A" stroke-width="5"><path d="M60 40 H460"/><path d="M460 40 H740"/></g><g font-family="sans-serif" font-size="20" fill="#C5563A" text-anchor="middle"><text x="260" y="32">6,40 m</text><text x="600" y="32">4,50 m</text></g>', 800, 600);
function ecranDemo() {
  const MAX = 5, i = Math.max(0, Math.min(MAX - 1, S.demoEtape || 0));
  clearInterval(S.demoMinuteur);
  const aller = k => { S.demoEtape = k; dessiner(); window.scrollTo(0, 0); };
  const sortir = () => { clearInterval(S.demoMinuteur); S.ecran = 'accueil'; dessiner(); };
  const montant = h('div', { class: 'herosMontant', id: 'demoMontant' }, '0 €');
  const pages = [
    () => [h('h1', {}, 'Bienvenue chez vous'), h('div', { class: 'carte' }, h('img', { class: 'garde', alt: '', src: svgUrl('<rect width="800" height="600" fill="#E8EEF2"/><rect y="430" width="800" height="170" fill="#9DB89B"/><path d="M150 430 V250 L400 100 L650 250 V430Z" fill="#F5F1EA" stroke="#2C4A5E" stroke-width="8"/><path d="M110 260 L400 70 L690 260" fill="none" stroke="#C5563A" stroke-width="18"/><rect x="350" y="320" width="100" height="110" fill="#2C4A5E"/><rect x="200" y="300" width="90" height="80" fill="#BFE0F0" stroke="#2C4A5E" stroke-width="6"/><rect x="510" y="300" width="90" height="80" fill="#BFE0F0" stroke="#2C4A5E" stroke-width="6"/>') }),
      h('p', {}, 'Une visite, c’est : des photos, vos souhaits, les mesures de la maison et une première estimation — le tout gardé au fur et à mesure.'))],
    () => [h('h1', {}, 'Votre pièce, imaginée'), h('div', { class: 'carte' }, curseurAvantApres({ src: DEMO_AVANT }, { src: DEMO_APRES }), h('p', { class: 'mut' }, 'Glissez le curseur : à gauche la pièce aujourd’hui, à droite la même pièce rénovée.'))],
    () => [h('h1', {}, 'Votre plan'), h('div', { class: 'carte' }, h('img', { class: 'garde', alt: 'Plan', src: DEMO_PLAN }), h('p', { class: 'mut' }, 'Le plan est coté, les surfaces sont calculées pour vous. En 3D, vous vous promenez dans la maison.'))],
    () => [h('h1', {}, 'Votre budget'), h('div', { class: 'heros', style: 'animation:none' }, h('div', { class: 'mut petit' }, 'Estimation indicative, à confirmer par devis'), montant,
      h('div', { class: 'jauge' }, h('div', { class: 'bande', style: 'left:63%;width:12%' }), h('div', { class: 'repere', style: 'left:77%' }, h('span', {}, 'Votre enveloppe'))),
      h('div', { style: 'font-weight:600;color:var(--green);margin-top:22px' }, '✓ Dans votre enveloppe de 170 000 €'))],
    () => [h('h1', {}, 'Votre dossier'), h('div', { class: 'carte' }, ['Photos et légendes de chaque pièce', 'Plan coté et vue 3D', 'Estimation par grands travaux', 'Lien à ouvrir chez vous, valable 30 jours'].map(t => h('div', { class: 'case', style: 'cursor:default' }, '✅ ' + t)),
      h('p', { class: 'mut' }, 'Tout part en PDF ou par lien, en un geste.'))],
  ];
  const enfants = [
    h('header', { class: 'haut' }, h('button', { class: 'lienRetour', onclick: sortir }, '‹ Visites'), h('span', { class: 'titre' }, 'Démonstration'), boutonPresentation()),
    h('main', {},
      h('nav', { class: 'progres', 'aria-label': 'Étapes de la démonstration' }, pages.map((_, k) => h('button', { type: 'button', class: k < i ? 'fait' : k === i ? 'ici' : '', 'aria-label': 'Écran ' + (k + 1), onclick: () => aller(k) }, h('i')))),
      h('div', { class: 'etapeNom' }, 'Exemple fictif · ' + (i + 1) + ' sur ' + MAX),
      h('div', { class: 'anime', id: 'demoPage' }, pages[i]())),
    h('div', { class: 'barreBas' }, h('div', { class: 'in' },
      h('button', { class: 'gros sec', onclick: () => i ? aller(i - 1) : sortir() }, i ? '‹ Retour' : '‹ Visites'),
      i < MAX - 1 ? h('button', { class: 'gros', id: 'demoSuivant', onclick: () => aller(i + 1) }, 'Suivant ›') : h('button', { class: 'gros', id: 'demoFin', onclick: sortir }, '✓ Terminer la démo'))),
  ];
  // l'écran 4 : le montant « roule » jusqu'à sa valeur ; le défilement automatique laisse 9 s par écran
  if (i === 3) { const t0 = performance.now(), cible = 138000; const roule = t => { const k = Math.min(1, (t - t0) / 1200), el = document.getElementById('demoMontant'); if (!el) return; el.textContent = 'de ' + euros(Math.round(cible * (0.88 + 0.12 * k) * k / 100) * 100) + ' à ' + euros(Math.round(164000 * k / 100) * 100); if (k < 1) requestAnimationFrame(roule); }; requestAnimationFrame(roule); }
  if (!S.demoPause && i < MAX - 1 && !navigator.webdriver) S.demoMinuteur = setInterval(() => { if (S.ecran === 'demo') aller(i + 1); else clearInterval(S.demoMinuteur); }, 9000);
  return enfants;
}

/* ---------- arrivée depuis le suivi de chantiers ----------
   « Ouvrir » une visite (?visite=<id>) ou « Nouvelle visite » sur une fiche
   prospect (?prospect=<id>) : la visite s'ouvre, ou se crée rattachée au
   dossier, fiche client reprise du suivi (lecture seule : rien n'est écrit
   dans les données du suivi). L'adresse est nettoyée aussitôt, pour qu'un
   rechargement ne crée pas une seconde visite. */
/* toute image marquée data-zoom (photos, plans, esquisses) s'ouvre en grand d'un toucher */
document.addEventListener('click', e => {
  const img = e.target && e.target.closest ? e.target.closest('img[data-zoom]') : null;
  if (!img || !img.src || img.closest('.visionneuse')) return;
  e.preventDefault(); e.stopPropagation();
  ouvrirVisionneuse(img.src, img.alt);
}, true);

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
  chargerChiffrage().then(() => { if (S.ecran === 'visite') dessiner(); });
  if (S.ecran !== 'connexion') traiterLien();   // sinon, après la connexion
  window.addEventListener('online', () => sync.synchroniser());
  window.addEventListener('offline', () => sync.synchroniser());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync.synchroniser(); });
  setInterval(() => sync.synchroniser(), 60000);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
demarrer();
