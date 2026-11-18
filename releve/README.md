# Relevé de visite (`releve/`)

Page à part du suivi de chantiers, faite pour l'iPhone chez le client et
reprise sur PC. Adresse : `https://cpconstructionsmo.github.io/Private/releve/`.

## Ce qu'elle fait (Phase 1, étape 1)

1. **Nouvelle visite** : l'appareil photo s'ouvre aussitôt pour la photo de garde.
2. **Client** : civilité, nom, prénom, téléphone, e-mail, adresse (dictée par le micro du clavier).
3. **Projet** : types de travaux, explicatif, délai, enveloppe (curseur ou saisie).
4. **Pièces et photos** : pièces à transformer, photos de chacune.
5. **Scan et plan** : le fichier d'OpenPlan 3D (accepté même sans extension)
   s'ouvre aussitôt dans le **moteur de relevé** (`moteur/`) : plan coté,
   mesures au mètre et écarts, murs (épaisseur, démolition, cloisons),
   ouvertures, étages, toitures, avant/après, vue 3D, export PDF.
6. **Fin de visite** : récapitulatif, ce qui manque, notes.

## Le lien avec le suivi de chantiers (Phase 1 étape 3)

- PROSPECTS › **« Visites à rattacher »** : chaque visite qui n'appartient à
  aucun dossier est proposée avec les prospects qui lui ressemblent (même
  téléphone ou e-mail : sûr ; même nom dans la même commune : probable ;
  même nom seulement : à vérifier). « Rattacher » dit d'abord ce qui sera
  complété — **les cases vides seulement**, rien n'est remplacé ; « Créer le
  prospect » le remplit depuis la visite ; « Ne pas rattacher » l'écarte.
  Le suivi ne garde que le lien (`p.visites`), jamais la visite elle-même.
- Fiche prospect › **« Visites »** : photo de garde, travaux, enveloppe, plan,
  « Ouvrir » (la visite, sur n'importe quel appareil) et « Nouvelle visite »
  (le relevé s'ouvre avec la fiche client reprise du suivi, la visite est
  rattachée d'office au dossier).
- Le relevé **lit** les données du suivi pour remplir la fiche client ; il n'y
  écrit jamais.

## La fourchette de prix pendant la visite (Phase 2, mode A)

- Étape **« Budget »** de la visite, après le plan : postes proposés d'après
  les travaux choisis, gamme (éco / standard / premium), quantité tirée du
  plan (toute la maison ou pièces choisies : sol, murs ouvertures déduites,
  périmètre, portes, fenêtres) ou saisie ; ajustements (état, accès,
  imprévus, tous à 0 % par défaut) ; « de X à Y € TTC » et voyant face à
  l'enveloppe du client. Indicatif, non contractuel.
- **« ⚙ Fourchettes de prix »** : la table partagée par l'équipe (prix TTC
  par unité, mini et maxi, par gamme), table `releve_reglages`, gardée aussi
  sur l'appareil pour servir sans réseau. **Livrée sans aucun prix** : les
  postes et leurs unités seulement, à compléter par CP Constructions. Un
  poste sans prix est signalé, jamais compté au hasard.
- Le calcul (`budget.js`) est indépendant de l'écran et testé seul. Le
  moteur de relevé envoie les quantités de chaque pièce (`resume.detail`).
- L'estimation part avec la visite : le suivi l'affiche dans le bloc
  « Visites » de la fiche prospect et la reprend dans la demande d'un
  prospect créé depuis la visite.

## Le chiffrage précis depuis le plan (Phase 2, mode B, 1re livraison)

- Dans le suivi, fiche prospect › « 3. Votre chiffrage » › un poste détaillé
  depuis un bordereau (onglet PRIX) : le plan de la visite du prospect est
  annoncé au-dessus du quantitatif. Dans une ligne (« + »), « Quantité
  depuis le plan de la visite » : surface de sol, surface de murs
  (ouvertures déduites), périmètre, portes, fenêtres ou pièces, pour toute
  la maison ou les pièces choisies. Le montant du poste suit.
- La règle reste sur la ligne : si le plan change (mesures reprises au
  mètre), « Mettre à jour depuis le plan » remet ces lignes à jour, et elles
  seules. Une quantité tapée à la main n'est jamais remplacée.
- Les lots des marchés (onglet MARCHÉS) ne changent pas.

À venir : devis client en PDF (sans marge) et Excel interne, TVA par poste,
« Imaginer », lecture des notes manuscrites par une fonction du serveur.

## Le moteur de relevé (`moteur/`, Phase 1 étape 2)

- C'est l'outil de relevé déjà validé sur des scans réels, repris tel quel et
  découpé en fichiers : `convertisseur.js` (export RoomPlan → pièces,
  ouvertures), `moteur.js` (plan, mesures, 3D, PDF), `three.min.js` et
  `OrbitControls.js` (three.js r128, licence MIT).
- Ce qui dépendait de la plateforme Claude est remplacé : sauvegarde → dans
  la visite (messages entre les deux pages, même site seulement) ; fichiers →
  feuille de partage de l'iPhone, sinon un vrai lien de téléchargement ;
  dictée → micro du clavier ; lecture des notes manuscrites → à venir, par une
  fonction du serveur (aucune clé dans le navigateur).
- **Porte vue deux fois dans un coin** (`doublonsPortesCoin`) : deux portes de
  la même pièce, sur deux murs qui se touchent, chacune à moins de 30 cm du
  coin, sont montrées au métreur qui choisit (garder l'une ou l'autre, ou les
  deux). Rien n'est retiré sans son accord.
- Le plan est enregistré dans la visite (`plan` : le relevé et son résumé),
  ses photos dans l'espace privé comme les autres. S'il a été modifié sur deux
  appareils à la fois, le plus récent s'ouvre et l'autre est **gardé de
  côté** (« Ouvrir cette version » / « L'oublier ») : rien ne se perd.
- Les versions nommées et leur comparaison (sauvegarde « compte » de la page
  publiée dans Claude) ne sont pas encore reprises.

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

1. Supabase › SQL Editor : exécuter `supabase/releve/schema.sql` (à relancer
   quand il évolue : sans danger, il ne recrée que ce qui manque).
2. Supabase › Authentication › Sign In / Providers : vérifier que
   « Allow new users to sign up » est **décoché**.

Tant que la table n'existe pas, la page fonctionne quand même : tout reste
sur l'appareil et l'état indique « En attente ».

## Installer sur l'iPhone

Safari › ouvrir l'adresse ci-dessus › bouton Partager › « Sur l'écran
d'accueil ». L'icône « Relevé CP » ouvre la page en plein écran.

## Tests

`tests/t_releve_modele.js`, `tests/t_releve_synchro.js`,
`tests/t_releve_convertisseur.js`, `tests/t_releve_rattachement.js`,
`tests/t_releve_budget.js`, `tests/t_releve_chiffrage.js` (Node) et
`tests/releve_navigateur.js`, `tests/releve_plan_navigateur.js`,
`tests/releve_rattachement_navigateur.js`, `tests/releve_budget_navigateur.js`, `tests/releve_chiffrage_navigateur.js` (Chromium, faux Supabase, format iPhone,
scan fictif `tests/releve_scan_fictif.js`).
Aucune donnée réelle dans les tests.
