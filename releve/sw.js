/* Le service worker de la page « Relevé de visite » : il garde l'application
   sur l'iPhone pour qu'elle s'ouvre sans réseau, chez le client.

   Sa portée est le seul dossier releve/ : le suivi de chantiers (index.html)
   n'est jamais servi par lui, il ne peut donc pas rester bloqué sur une
   ancienne version. Les appels à Supabase (données, photos, connexion) ne
   passent jamais par le cache : les données vivent dans IndexedDB.

   Stratégie : réseau d'abord pour les fichiers de l'application (on a
   toujours la dernière version quand le réseau est là), cache sinon. Monter
   VERSION à chaque livraison de releve/ fait le ménage des anciens caches. */
const VERSION = 'releve-2026-11-19-6';
const COQUILLE = ['./', 'index.html', 'app.js', 'modele.js', 'stockage.js', 'synchro.js', 'photo.js', 'budget.js', 'dossier.js', 'dossier-vue.js', 'dom.js', 'assistant.js', 'dessin.js',
  'manifest.webmanifest', 'icone-180.png', 'icone-192.png', 'icone-512.png', '../assets/logo_fiche.jpg',
  // le moteur de relevé (plan, 3D, PDF) : lui aussi doit s'ouvrir sans réseau chez le client
  'moteur/index.html', 'moteur/moteur.js', 'moteur/convertisseur.js', 'moteur/assemblage.js', 'moteur/OrbitControls.js', 'moteur/three.min.js'];
const BIBLIO = 'https://unpkg.com/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(COQUILLE);
    try { await c.add(new Request(BIBLIO, { mode: 'cors' })); } catch (err) { /* reprise au prochain passage */ }
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n.startsWith('releve-') && n !== VERSION).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const memeSite = url.origin === self.location.origin;
  // seulement l'application elle-même et sa bibliothèque ; jamais Supabase
  if (!(memeSite && url.pathname.startsWith(new URL('./', self.location).pathname)) && req.url !== BIBLIO
      && !(memeSite && url.pathname.endsWith('/assets/logo_fiche.jpg'))) return;
  e.respondWith(fetch(req).then(rep => {
    if (rep && rep.ok) { const copie = rep.clone(); caches.open(VERSION).then(c => c.put(req, copie)); }
    return rep;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
