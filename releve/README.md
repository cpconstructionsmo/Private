# Relevé de visite (`releve/`)

Page à part du suivi de chantiers, faite pour l'iPhone chez le client et
reprise sur PC. Adresse : `https://cpconstructionsmo.github.io/Private/releve/`.

## Ce qu'elle fait (Phase 1, étape 1)

1. **Nouvelle visite** : l'appareil photo s'ouvre aussitôt pour la photo de garde.
2. **Client** : civilité, nom, prénom, téléphone, e-mail, adresse (dictée par le micro du clavier).
3. **Projet** : types de travaux, explicatif, délai, enveloppe (curseur ou saisie).
4. **Pièces et photos** : pièces à transformer, photos de chacune.
5. **Scan** : le fichier d'OpenPlan 3D est gardé avec la visite (son ouverture
   en plan est l'étape 2).
6. **Fin de visite** : récapitulatif, ce qui manque, notes.

À venir : moteur de relevé et plan (étape 2), rattachement aux prospects du
suivi (étape 3), « Imaginer » (étape 4).

## Comment c'est fait

- Modules ES chargés tels quels (pas de compilation) : `modele.js` (la visite,
  la fusion entre appareils), `stockage.js` (IndexedDB), `synchro.js`
  (Supabase), `photo.js` (réduction à 1600 px), `app.js` (les écrans).
- **Tout s'écrit d'abord sur l'appareil**, puis part quand le réseau le
  permet. Chaque champ garde l'heure de sa dernière modification : deux
  appareils qui ont travaillé chacun de leur côté se fusionnent champ par
  champ, sans rien écraser.
- Les **photos** sont réduites sur l'appareil (JPEG ≤ 1600 px) et rangées
  dans l'espace privé `releves` de Supabase Storage, jamais dans le JSON.
- **Application installable** (manifest + service worker limité au dossier
  `releve/`) : elle s'ouvre sans réseau. Le suivi de chantiers n'est pas
  touché par ce service worker.
- **Connexion** : le même compte que le suivi (même site, même session).
- Données : table `releve_visites`, jamais `app_data`.

## Installation (une fois)

1. Supabase › SQL Editor : exécuter `supabase/releve/schema.sql`.
2. Supabase › Authentication › Sign In / Providers : vérifier que
   « Allow new users to sign up » est **décoché**.

Tant que la table n'existe pas, la page fonctionne quand même : tout reste
sur l'appareil et l'état indique « En attente ».

## Installer sur l'iPhone

Safari › ouvrir l'adresse ci-dessus › bouton Partager › « Sur l'écran
d'accueil ». L'icône « Relevé CP » ouvre la page en plein écran.

## Tests

`tests/t_releve_modele.js`, `tests/t_releve_synchro.js` (Node) et
`tests/releve_navigateur.js` (Chromium, faux Supabase, format iPhone).
Aucune donnée réelle dans les tests.
