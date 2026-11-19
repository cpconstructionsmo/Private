# Relevé de visite (`releve/`)

Page à part du suivi de chantiers, faite pour l'iPhone chez le client et
reprise sur PC. Adresse : `https://cpconstructionsmo.github.io/Private/releve/`.

## Ce qu'elle fait (Phase 1, étape 1)

1. **Nouvelle visite** : l'appareil photo s'ouvre aussitôt pour la photo de garde.
2. **Client** : particulier (1 à 3 acheteurs) ou société (raison sociale,
   forme, SIRET, siège, représentant) ; civilité, nom, prénom, téléphone,
   e-mail ; adresse des travaux ; adresse principale de chacun si elle
   diffère (« Habite à l'adresse des travaux », « Même adresse que
   l'acheteur 1 ») ; usage du bien (résidence principale, locatif,
   secondaire, autre).
3. **Projet** : ampleur (rénovation partielle, importante, énergétique,
   cumulables), types de travaux (« Autre » avec sa précision), situation
   actuelle et souhaits du client, délai, enveloppe (curseur ou saisie).
   Le bouton 🎤 d'un champ dicte en français (reconnaissance vocale du
   navigateur) ; là où elle manque, il ouvre le clavier et son micro.
   L'ancien champ « en quelques mots » ne s'affiche que s'il a été rempli.
4. **Pièces et photos** : pièces à transformer, photos de chacune (plusieurs
   d'un coup depuis la galerie, « Photo suivante » à l'appareil), une
   légende par photo et des notes par pièce, avec dictée.
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
- Ce que reprend le prospect : l'acheteur 2 devient son 2e acheteur (avec
  son adresse), le domicile va en adresse du client et l'adresse des travaux
  en adresse du projet (découverte) ; une société devient civilité SCI/SAS
  (sinon « Autre ») et client = raison sociale. Ce qui n'a pas de case
  (3e acheteur, représentant, SIRET, ampleur, usage, situation, souhaits)
  est écrit dans la demande.

## Le budget de premier rendez-vous (R1)

- Étape **« Budget »** de la visite, après le plan. Pas de poste par poste
  chez le client : on **touche les travaux** (tuiles : rénovation complète,
  rafraîchissement, cuisine, salle de bains, peinture, sols, électricité,
  plomberie, isolation, façade, toiture, fenêtres, pompe à chaleur,
  extension, extérieur). « ✨ Estimer les travaux choisis » reprend d'un
  toucher ceux de l'étape Projet (une rénovation importante propose la
  rénovation complète, qui comprend déjà les postes intérieurs).
- Chaque travail a sa **surface globale** : celle du plan quand il existe
  (la cuisine du scan, la surface habitable, les fenêtres comptées, 1,3 ×
  l'emprise pour la toiture), sinon une valeur courante. Elle se règle par
  **− / +** (ou se tape) et revient au plan d'un toucher. La **gamme** (€ éco,
  €€ standard, €€€ haut de gamme) place le prix entre le mini et le maxi.
- Le total TTC s'affiche aussitôt (il « roule » jusqu'à sa valeur), avec une
  jauge et le voyant face à l'enveloppe du client. Indicatif, non
  contractuel ; arrondi à la centaine.
- **« Approfondir »** (replié) : ajustements (état, accès, imprévus) et
  postes détaillés avec quantités (l'ancien mode, qui s'ajoute au total).
- **« ⚙ Prix au m² »** : mini, médian, maxi de chaque travail (TTC posé).
  Livrés avec des **repères publics 2026** (guides de prix en ligne : par
  exemple cuisine 400–1 500 €/m², salle de bains 500–2 000 €/m², peinture
  25–45 €/m² de mur, carrelage ou parquet 40–130 €/m², électricité
  60–130 €/m² habitable, combles 20–70 €/m², ITE 120–270 €/m², ravalement
  30–120 €/m², couverture 120–300 €/m², fenêtre 500–1 200 €, PAC air-eau
  9 000–18 000 €, rénovation complète 1 100–1 800 €/m²). Plomberie,
  extension et extérieur sont des estimations à confirmer (« À confirmer »).
  Ces repères divergent d'un site à l'autre : CP Constructions les remplace
  par ses ratios de chantiers. Seuls les prix retouchés sont gardés (table
  partagée `releve_reglages`, ligne « ouvrages », copie sur l'appareil pour
  servir sans réseau), un prix se ramène au repère d'un toucher.
- Le calcul (`budget.js` : `OUVRAGES`, `surfaceAuto`, `prixNiveau`,
  `calculerEstimation`) est indépendant de l'écran et testé seul.
- L'estimation part avec la visite (`budget.estimation`) : le suivi
  l'affiche dans le bloc « Visites » de la fiche prospect et la reprend
  dans la demande d'un prospect créé depuis la visite. Le chiffrage précis
  se fait au bureau, dans la fiche prospect.

## Le dossier client (Phase 3)

- Récapitulatif › **« 📄 Dossier client »** (et, dans le suivi, fiche
  prospect › Visites › **« 📄 Dossier »**, lien `?visite=…&vue=dossier`) :
  le document à remettre au client après le rendez-vous, construit depuis
  la visite, sans réseau (`dossier.js`, fonction pure ; mise en page dans
  `app.js`, `ecranDossier`).
- Contenu : couverture (logo, client, adresse des travaux, photo de garde,
  date), « Vous » (acheteurs ou société et représentant), le bien, le projet
  (ampleur, travaux, délai, situation, souhaits), les pièces avec photos et
  légendes, les images d'intention « ✨ Imaginé » à côté de leur photo
  (« Aujourd'hui » / « Demain », avec une mention de non-engagement), le
  relevé (pièces, surfaces), l'estimation indicative (travaux, quantité,
  gamme, fourchette, total, mention « ni un devis ni une offre »), la suite.
- Options (gardées sur l'appareil) : estimation, budget envisagé par le
  client, images d'intention, notes des pièces (non cochées par défaut).
  **Jamais** : les notes de visite (internes), la marge.
- « 🖨 Imprimer / PDF » attend que les photos soient chargées puis ouvre
  l'impression : A4, couverture seule sur sa page, puis les parties
  s'enchaînent sans couper une pièce ni un tableau. Sur iPhone : Imprimer,
  puis Partager pour l'enregistrer en PDF ou l'envoyer.
- La liste des visites a une recherche dès 5 visites (client, ville,
  travaux, sans tenir compte des accents).

## Confort de saisie et navigation

- **Code postal → commune** : dès 5 chiffres, la liste officielle des
  communes (geo.api.gouv.fr, seul le code postal y part) remplit la ville
  s'il n'y en a qu'une, sinon propose les communes à toucher. Sans réseau,
  la ville se tape.
- **« 🎙 Commencer par un résumé »** en tête de la fiche client : ouvre
  l'assistant de visite (écrit ou dicté).
- **Bouton « retour » du navigateur et du téléphone** : il ramène à l'écran
  d'avant (dossier, assistant, plan, prix → visite → accueil) au lieu de
  quitter le relevé ; les boutons « ‹ » de l'écran gardent l'historique
  juste ; le plan s'enregistre avant de se fermer (`suivreHistorique`).

## L'assistant de visite

- Bouton **« 🎙 Assistant »** à chaque étape de la visite : on raconte la
  visite d'un trait (micro ou clavier). La dictée est gardée avec la visite
  (`assistant.texte`), même sans réseau.
- **« ✨ Remplir la fiche »** : la fonction du serveur (action
  `structurer`, Gemini) rend une fiche ; `assistant.js` n'en garde que les
  champs connus et les valeurs des listes du relevé (civilités, travaux,
  ampleur, usage, délai…), téléphone et e-mail valides, enveloppe en
  nombre.
- **Relecture** : chaque élément proposé est une case. Un champ vide se
  remplit (coché) ; un champ déjà saisi n'est proposé qu'en remplacement,
  **décoché** ; listes et textes (situation, souhaits) se complètent sans
  doublon ; les pièces citées s'ajoutent, ou complètent la note d'une pièce
  du même nom. « Ranger dans la fiche » n'applique que le coché.

## Le dossier envoyé au client

- Le dossier client montre aussi **l'image du plan dessiné** : le moteur la
  dessine à la fermeture du plan (`imagePlan`, chaque étage) et la visite
  ne la garde que si elle a changé (`planImage`, photo `dessinPlan`).
- **« 🔗 Créer le lien du dossier »** (écran Dossier client) : le dossier, tel
  qu'à l'écran, est gardé dans `releve_partages` avec l'empreinte d'un
  jeton aléatoire ; le client ouvre `partage.html#t=<jeton>` (30 jours, sans
  compte, même mise en page : `dossier-vue.js`). Copier, Partager, e-mail
  et SMS préparés ; « 👁 Ouvert par le client … fois » ; « ↻ Mettre à jour »
  (même lien) ; « Retirer le lien ». Les photos pas encore envoyées
  n'apparaissent pas (le relevé le dit).

## Vos prix, appris de vos chantiers

- « ⚙ Prix au m² » › **« 📊 Calculer depuis mes chantiers »** : les prospects
  de **rénovation** du suivi (lus seulement), chiffrés par poste, avec leur
  surface habitable (ou celle du plan d'une visite rattachée), donnent le
  coût TTC des entreprises au m² par travail — hors honoraires, majoration
  du corps et TVA de chaque poste comprises (`ratiosDepuisProspects`) :
  peinture, électricité, plomberie, sols, et le coût global pour un projet
  tous corps d'état (rénovation complète). Mini, médian, maxi et nombre de
  projets ; « Reprendre » les met dans le brouillon, « Enregistrer » les
  partage avec l'équipe.

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
  ouvertures), `assemblage.js` (plusieurs scans reliés), `moteur.js` (plan, mesures, 3D, PDF), `three.min.js` et
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
- **Plusieurs scans, pièce par pièce** (`assemblage.js`) : « ＋ Scan » ajoute
  le scan d'une autre pièce, posé à droite du plan (pièces marquées de leur
  numéro de scan, `p.scan`, noms numérotés s'ils sont déjà pris) ; la liaison
  démarre aussitôt — « 🔗 Relier » la relance : on touche un mur, puis le mur
  de l'autre scan qui le touche. Tout le second scan tourne (par quarts de
  tour) et glisse pour que les deux murs n'en fassent qu'un, pièces de part
  et d'autre ; la fenêtre en bas règle le décalage le long du mur en direct
  (aligner les débuts, centrer, aligner les fins, au centimètre) et dit la
  longueur de mur commun. Les murs sont coupés aux bouts de l'autre (un seul
  mur commun) ; une mesure saisie sur un mur coupé est retirée et signalée.
  « Relier » valide (annulable par ↶), « Annuler » ne change rien.
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
