/* Le dossier client ouvert par le lien personnel envoyé au client
   (partage.html#t=<jeton>). Il ne lit que ce que la fonction du serveur
   rend pour ce jeton : un lien inconnu, expiré ou retiré ne montre rien.
   Le jeton reste dans le fragment (#) : il n'est jamais envoyé aux sites
   des photos. Mise en page : dossier-vue.js, la même que dans le relevé. */
import { h } from './dom.js';
import { vueDossier, dateLongue } from './dossier-vue.js';

// même projet Supabase et même clé publique que le relevé (app.js)
const SUPABASE_URL = 'https://gxfrughmwkvdepvkhufv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JCBSnZhTaKlpSIZeXAeMkw_2OvI6YIr';
const MAIL_CP = 'contact@cpconstructions.fr';

const app = document.getElementById('app');
const montrer = (...n) => app.replaceChildren(...n.flat(Infinity).filter(Boolean));
const message = texte => montrer(h('main', {}, h('div', { class: 'message' },
  h('img', { src: '../assets/logo_fiche.jpg', alt: 'CP Constructions', style: 'height:36px;display:block;margin-bottom:10px' }),
  texte, h('p', { class: 'mut' }, 'Pour tout renseignement : ', h('a', { href: 'mailto:' + MAIL_CP }, MAIL_CP)))));

async function ouvrir() {
  const t = new URLSearchParams(location.hash.slice(1)).get('t') || '';
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(t)) return message('Ce lien est incomplet. Ouvrez-le directement depuis le message reçu.');
  let r, j = {};
  try {
    r = await fetch(SUPABASE_URL + '/functions/v1/imaginer', { method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
      body: JSON.stringify({ action: 'partage', t }) });
    j = await r.json().catch(() => ({}));
  } catch (e) { return message('Votre dossier n’a pas pu être chargé (connexion internet ?). Réessayez dans un instant.'); }
  if (!r.ok || !j.dossier) return message(j.erreur === 'lien_invalide'
    ? 'Ce lien n’est plus valable (il a expiré ou a été remplacé). Demandez-nous un nouveau lien.'
    : 'Votre dossier n’a pas pu être chargé. Réessayez dans un instant.');
  const urls = j.urls || {};
  // une photo sans lien (pas encore envoyée) est simplement absente
  const photo = (ph, cls) => ph && urls[ph.chemin] ? h('img', { class: cls || '', src: urls[ph.chemin], alt: ph.legende || ph.consigne || 'Photo', loading: 'lazy' }) : null;
  const imprimer = async e => {
    const b = e.currentTarget; b.disabled = true;
    await Promise.all([...document.querySelectorAll('.dossier img')].map(img => img.complete ? null : new Promise(ok => { img.onload = img.onerror = ok; setTimeout(ok, 6000); })));
    b.disabled = false; window.print();
  };
  document.title = (j.dossier.titre || 'Votre projet') + ' — CP Constructions';
  montrer(
    h('div', { class: 'barre' }, h('img', { src: '../assets/logo_fiche.jpg', alt: 'CP Constructions' }),
      h('span', { class: 'titre' }, j.dossier.client || 'Votre projet'),
      h('button', { type: 'button', id: 'imprimer', onclick: imprimer }, '🖨 Imprimer / PDF')),
    h('main', {},
      h('p', { class: 'info' }, 'Dossier préparé par CP Constructions après notre visite. Lien personnel, valable jusqu’au ' + dateLongue(j.expire_le) + '.'),
      vueDossier(j.dossier, { photo, logo: '../assets/logo_fiche.jpg' })));
}
ouvrir();
