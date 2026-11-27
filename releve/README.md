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

## L'aide à la vente du premier rendez-vous (étape Budget et étape Fin)

Reprise de l'ancienne « App rénovation » (un artefact Claude) pour que le
premier rendez-vous se déroule entièrement dans le relevé. Tout est dans
`aide-vente.js` (fonctions pures ; tests `t_releve_aide_vente.js`,
`releve_aide_vente_navigateur.js`) ; l'écran est dans `app.js`.

- **Pour rentrer dans le budget** : quand l'estimation dépasse l'enveloppe du
  client, jusqu'à 3 pistes recalculées sur l'estimation complète (tout en
  gamme Éco, un travail en Éco, reporter un travail), celles qui font
  rentrer d'abord. Rien ne change avant « Appliquer ».
- **Calendrier indicatif** : date de début de chantier souhaitée → dates de
  la signature de la mission, de l'avant-projet, du dossier d'urbanisme, de
  la consultation, de la fabrication (cuisine, fenêtres, garage), du chantier
  et de la réception ; « Délai court pour cette date » si la signature
  devrait déjà être faite. Délais moyens (`SEMAINES`), à confirmer. Gardé
  dans `budget.calendrier` ; il peut figurer dans le dossier client (option
  « Calendrier indicatif », décochée d'office).
- **Mensualités indicatives** : **désactivées d'office** (la mise en garde
  de l'ancienne application est reprise : à n'activer qu'après avoir vérifié
  les règles applicables à la présentation d'un crédit). Apport, durée,
  taux (5 % par défaut, modifiable), sur la fourchette de l'estimation.
  Gardées dans `budget.financement` ; **jamais dans le dossier client**.
- **Mémo de rendez-vous** (interne, masqué en mode présentation) : questions
  à poser, à proposer, points de vigilance, par travaux choisis ; le mémo
  « Ouverture d'un mur » s'ajoute si les souhaits en parlent. Textes repris
  de l'ancienne application, sans prix.
- **Message de suivi** (étape Fin, interne) : e-mail après le rendez-vous,
  relance ou SMS, préparés d'après la visite (client, fourchette, travaux,
  calendrier). Modifiables à l'écran (le texte retouché est gardé pendant la
  séance, « Reprendre le texte proposé » le remplace sur demande) ;
  « Copier », « Ouvrir dans la messagerie » ou dans « Messages ». Rien ne
  part sans le geste de l'utilisateur.

Non repris de l'ancienne application : la signature du client à l'écran
(l'estimation n'est pas contractuelle) et les coefficients de gamme, déjà
couverts par « ⚙ Prix au m² ».

## Plusieurs plans côte à côte (étape Scan › « 🗂 Plans et annotations »)

Pour montrer le rez-de-chaussée à côté de l'étage (ou l'inverse), tout est dans UNE carte :

- **Les vignettes côte à côte** : les plans ajoutés à gauche (dans l'ordre d'ajout), puis le
  plan dessiné et le plan importé. **Un toucher sur une vignette choisit le plan** : son nom,
  sa copie annotée et ses boutons sont juste en dessous (le plan qu'on vient d'ajouter est
  d'office celui qu'on voit).
- **« ＋ Ajouter un plan »** : une image ou une photo de plan (JPEG, PNG, capture d'écran) se
  range avec la visite (photo `planAjoute`). Elle prend le premier nom libre (Rez-de-chaussée,
  1er étage, 2e étage, Combles, Sous-sol), que l'on change d'un toucher ou à la main. Un **PDF**
  n'est pas affiché : le message dit de l'exporter d'abord en image.
- **Annoter chacun** : chaque plan ajouté a sa propre copie annotée (champ `annotationsPlus`,
  une entrée par plan). Le plan dessiné et le plan importé partagent la copie `annotations`
  (une seule, celle de l'un des deux : l'écran le dit pour l'autre).
- **Retirer au choix un plan ou l'autre** : « 🗑 Retirer ce plan » (confirmation) pour chaque
  vignette, plan dessiné et plan importé compris ; la copie annotée du plan retiré part avec lui.
  Retirer le plan dessiné ne touche pas au plan lui-même : son image se refait quand on rouvre
  le plan. « 🗑 Supprimer la copie annotée » ne retire que la copie.
- **Dossier client** : options « Les plans côte à côte (…) » et, avec « Plan annoté (travaux) »,
  une page par copie annotée ; décochées d'office.
- **Lien envoyé au client** : les photos de ces plans n'y figurent qu'après la mise à jour de la
  fonction `imaginer` sur Supabase (`regles.js`, `cheminsDossier`) ; le dossier imprimé ou
  enregistré en PDF depuis l'application ne dépend pas de la fonction.

Tests : `releve_plans_cote_navigateur.js`, `releve_annoter_navigateur.js`, `t_releve_imaginer.js`.

## Le dessin rapide, repris des logiciels de plan (Cedreo, Houzz, RoomSketcher…)

Ce que ces logiciels font de mieux, et que le dessin rapide reprend :

- **Le nom ne cache plus les cotes** : il rapetisse pour tenir dans sa pièce, puis est raccourci
  par « … » (`nomAjuste`) ; la surface écrite dessous suit (`tailleSurface`). Une zone invisible
  autour du nom le rend facile à attraper.
- **Tableau des surfaces** : « 📐 Tableau des surfaces » sous le dessin (pièce, niveau, surface,
  total), replié d'office.
- **Annulation partout** : Ctrl+Z, Ctrl+Maj+Z (ou Ctrl+Y) et « ↶ Annuler » marchent dans tout le
  dessin, plus seulement en croquis. Échap désélectionne ; Suppr supprime.
- **Un geste ne casse pas l'autre** : glisser une pièce par son milieu la déplace toujours ; le nom
  ne glisse seul qu'avec « ✋ Glisser le nom » (les flèches ◀ ▲ ▼ ▶ restent sous le plan).

- **Dans le plan coté aussi** (`releve/moteur/moteur.js`) : le nom et la surface d'une pièce ne
  touchent plus les cotes des murs. On repère la place de chaque chiffre de cote, puis le nom se décale
  dans la pièce, sinon rapetisse (jusqu'à 7 px), sinon la surface est retirée (le nom seul). Un nom
  placé à la main (`etiquette`) reste exactement où on l'a mis. Cas d'une capture réelle : 8 pièces de
  3 × 3 m côte à côte, noms collés aux « 3,00 ». Si la pièce est trop petite, le texte garde sa place
  (il n'y a pas de solution) : le tableau des surfaces donne alors les chiffres.

Tests : `t_releve_etiquette.js`, `releve_dessin_nom_navigateur.js`, `releve_noms_cotes_navigateur.js`.

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
  l'assistant de visite (écrit ou dicté). Une fois dicté, le résumé s'affiche sur la carte
  (« 🎙 Votre résumé de visite », 6 lignes, toucher pour le modifier ou le
  compléter) et dans le récapitulatif ; il reste interne (jamais dans le
  dossier client).
- **Bouton « retour » du navigateur et du téléphone** : il ramène à l'écran
  d'avant (dossier, assistant, plan, prix → visite → accueil) au lieu de
  quitter le relevé ; les boutons « ‹ » de l'écran gardent l'historique
  juste ; le plan s'enregistre avant de se fermer (`suivreHistorique`).
- **Raccourcis de l'étape Pièces** (« ⚡ Gagner du temps ») : « 📷 Lire une
  note » (la note manuscrite s'ajoute à la dictée de l'assistant, qui remplit
  la fiche) et « 🖼 Plan ou esquisse » (mène à l'étape Scan et lit le plan ou
  l'esquisse à la main) ; « 🎙 Ouvrir l'assistant ».
- **« ✨ Imaginer » mieux rendu** : consigne de photo d'intérieur
  professionnelle (perspective droite, matériaux et lumière réalistes,
  géométrie gardée) ; **styles en un toucher** (moderne, scandinave,
  industriel, contemporain chic, classique, campagne : leur description
  s'ajoute à la consigne) ; **« ✏️ Retoucher »** une image imaginée (mode
  `retouche` : seule la modification demandée change, rangée sous la même
  photo, `depuis`). **« ✨ Plan en couleur (IA) »** (étape Scan, sous le
  résumé du plan) : le plan coté redessiné en plan de présentation (mode
  `planRendu`, photo `planRendu`), option « Plan en couleur » du dossier
  client, présenté comme image d'intention.
- **« ✨ Imaginer » sans réseau** : la demande (consigne) est gardée sur la
  photo, « ⏳ en attente du réseau » (✕ pour l'annuler), et part toute seule
  au retour du réseau ou après une synchronisation (`imaginerEnAttente`).
  Seul l'appareil qui l'a faite la traite : pas d'image en double si la
  visite est ouverte ailleurs. Limite du jour ou réglage absent : la
  demande s'arrête et le message reste sous la photo.

## Accueil et images

- **Annuler une visite** : « ✕ » sur sa carte (confirmation). Elle quitte la
  liste sans rien perdre (`statut` « annulee », `annulation` : date et statut
  d'avant) ; filtre « Annulées (n) », « ↺ Rétablir » d'un toucher. Le suivi
  ne la propose plus dans « Visites à rattacher ».
- **Zoom** (`releve/zoom.js`) : toute photo, plan d'origine, esquisse ou
  vignette de plan s'ouvre en grand d'un toucher (`data-zoom`) ; pincer ou
  « ＋ / − » pour zoomer, glisser pour se déplacer, toucher deux fois pour
  zoomer ou revenir, molette sur PC ; ✕ ou Échap pour fermer.

## Rénovation, construction neuve, agrandissement

- **Dès la 1re page** : « 🏚 Rénovation », « 🏗 Construction neuve » ou
  « ➕ Agrandissement » (`projet.nature`). Le parcours suit (`etapesDe`) :
  rénovation inchangée (7 étapes, une ancienne visite sans nature est une
  rénovation) ; construction : photo du terrain, client, projet, terrain,
  fin ; agrandissement : tout, avec le terrain en plus.
- **Projet de construction** : prestation, surface habitable souhaitée,
  niveaux, chambres, garage, chauffage, projet du client (dicté), terrain
  (acquis, compromis, en recherche) et son prix, financement, délai,
  enveloppe hors terrain. **Agrandissement** : type (extension,
  surélévation, véranda…), surface de l'agrandissement et de la maison
  actuelle, travaux dans l'existant.
- **Étape Terrain** (`releve/terrain.js`) : adresse (celle des travaux ou à
  part), « 📍 Localiser par l'adresse » (géocodage de la Géoplateforme) ou
  « 🛰 Je suis sur le terrain » (GPS). Les services publics, sans clé :
  parcelle et contenance (API Carto cadastre), document d'urbanisme, zone,
  **règlement de la zone en PDF**, commune au RNU, servitudes (abords de
  monument historique, site patrimonial…) et informations (API Carto GPU),
  **rapport Géorisques** à l'adresse (risques naturels et technologiques,
  lien du rapport officiel), argiles et sismicité. Gardé avec la visite
  (`terrain.position`, `terrain.infos`), relu hors ligne ; la contenance ne
  remplit la surface que si elle est vide. **Points d'attention
  indicatifs** (`pointsAttention`, à vérifier) : zone A / N / AU, RNU,
  ABF, plan de prévention, argiles (étude G1 / G2), sismicité, inondation,
  mouvements de terrain, radon, pollution ; plus de 150 m² (architecte) ;
  agrandissement : déclaration préalable ou permis selon le seuil (40 m² en
  zone urbaine d'un PLU, sinon 20 m²), 150 m² après travaux.
- **« 🤖 Lire le règlement de la zone »** (étape Terrain, sous l'urbanisme) :
  la fonction `imaginer` (action `reglement`) télécharge le PDF du règlement
  (Géoplateforme seulement, 14 Mo au plus) et Gemini en tire les règles de
  la zone pour une maison : constructions autorisées, emprise, hauteur,
  reculs (voies, limites), aspect, toitures, clôtures, stationnement,
  espaces verts, autres règles importantes, pages lues. Citées telles
  qu'écrites ou absentes, jamais inventées ; affichées comme une lecture
  automatique à vérifier (`terrain.reglement`), reprises dans le dossier
  client et dans la demande du prospect (seulement pour la zone actuelle).
- **Plan du terrain coté** (étape Terrain, « 🗺 Plan du terrain ») : plan de
  géomètre, de bornage, de lotissement ou esquisse cotée à la main, en photo
  ou en PDF. L'IA (fonction `imaginer`, action `decrire`, mode `terrain`)
  relève ce qui est écrit (esquisse ou échelle, surface, façade, cotes, nord,
  accès, remarques) ; le relevé l'analyse (`analyserPlanTerrain`) : surface
  tirée des 4 côtés, écarts avec la surface écrite, le cadastre et la façade
  relevée. Gardé dans `terrain.plan` (photo `planTerrain`) ; les valeurs ne
  remplissent que les cases vides (« Utiliser … » pour les autres).
- **« ✨ Imaginer la maison sur ce terrain »** sous chaque photo du terrain
  (mode `terrain` de la fonction) : consigne tapée, dictée ou reprise du
  projet (`consigneProjet` : niveaux, surface, garage, souhaits). Même file
  d'attente sans réseau que les pièces.
- **Étape « Plan »** en construction (7 étapes) : le plan de la future
  maison depuis une esquisse ou un plan (lecture IA → dessin rapide → plan
  coté et vue 3D du moteur) ; pas de scan à importer.
- **Budget de la construction et de l'agrandissement** (étape Budget, 6e
  étape en construction) : tuiles propres à la nature (`ouvragesDe`) —
  maison neuve clé en main ou hors d'eau hors d'air (surface du projet),
  garage, raccordements, assainissement individuel, étude de sol G2,
  fondations adaptées, terrassement et VRD, démolition, extension (surface
  de l'agrandissement). Le projet et le terrain les proposent
  (`ouvragesSuggeresNeuf` : argiles moyennes ou fortes, pente forte, accès
  difficile, assainissement individuel…). Prix de départ **à confirmer**
  par CP (« ⚙ Prix au m² »), comme en rénovation.
- **Dans le suivi** : une visite de construction crée un prospect « Maison
  neuve » prérempli (surface habitable, chambres, niveaux, prestation,
  chauffage, prix et surface du terrain, commune du terrain ; une valeur
  hors des listes du suivi reste dans la demande) ; la demande reprend le
  terrain (adresse, parcelle, urbanisme et règlement, servitudes, risques
  et rapport Géorisques). Agrandissement : prospect de rénovation,
  prestation « Extension » ou « Surélévation ». Rattacher ne remplit que
  les cases vides.
- **Dossier client** : titre selon le projet, lignes du projet de
  construction, et page « Le terrain » (option « Terrain, urbanisme et
  risques », cochée d'office) : parcelle, configuration, urbanisme et lien
  du règlement, servitudes, risques et rapport officiel, points à vérifier,
  date de consultation et mention « indicatif ».
- Sur place : surface, façade, forme, pente, orientation, accès,
  lotissement (rappel du règlement et du cahier des charges), viabilisation
  réseau par réseau, assainissement, bornage, étude de sol, démolition,
  notes dictées, photos du terrain.

## Le plan coté, simple d'abord

- Ouvert depuis une visite : titre « Plan de la visite », « 📄 PDF » et
  « 📐 DXF » en haut, « ⋯ Fichiers » replié (ouvrir un autre fichier,
  enregistrer le .json : la visite enregistre seule). Outils visibles :
  ↶ ↷, « ＋ Symbole », « ＋ Mur », « ◫ Avant / après » ; le reste sous
  « ⚙️ Plus d'outils » (pièce, scan, relier, rotations, repères, angle,
  recentrer). Aide d'une ligne, toute l'aide sous « ℹ️ ». Les tableaux
  (mesures, légende, pièces, murs, ouvertures…) sous « 📋 Mesures, légende
  et tableaux ». Sur grand écran (≥ 900 px), outils et tableaux sont
  ouverts d'office ; hors d'une visite, « Fichiers » aussi.

## Le dessin rapide (sans scan)

- **Écran simple d'abord** (passage « simplicité », novembre 2026) : en haut,
  « ✓ Créer le plan 2D coté et la 3D » ; sous le dessin, les trois gestes
  de base (« ＋ Pièce », « ＋ Symbole », « 🖍 Annoter ») ; le reste est
  replié : « ⚙️ Plus de réglages » dans la fiche d'une pièce (hauteur, note,
  étage, pose précise) et « ⚙️ Plus d'options » pour tout
  le dessin (hauteur, nom d'étage, toiture, aimant). L'étape Scan propose
  trois choix, chacun avec une ligne d'explication.

- **Complet** (`releve/dessin.js`, tests `t_releve_dessin_complet.js`,
  `releve_dessin_complet_navigateur.js`) :
  - pièces **posées au doigt** : glissées sur l'aperçu, elles s'aimantent aux
    murs voisins (`aimanter`, `libre` : position gardée) ; « ＋ Ajouter une
    pièce » la pose à côté, on la glisse ensuite ; « posée précisément »
    (contre une pièce, décalage) reste possible ;
  - **étages** (« ＋ Étage », nom modifiable ; l'étage du dessous en
    filigrane ; une pièce change d'étage d'un toucher) ;
  - **portes, fenêtres, portes-fenêtres, passages** sur un côté de pièce
    (position, largeur), converties en ouvertures du moteur sur le bon mur
    (`ouverturesMoteur`, même un côté coupé par une voisine) ;
  - **symboles**, rangés par famille (`FAMILLES_SYMBOLE`) : chauffage
    (radiateur, chaudière, chauffe-eau, poêle), sanitaire (WC, lavabo,
    douche, baignoire), cuisine et buanderie (évier, plaque de cuisson,
    réfrigérateur, lave-vaisselle, lave-linge, plan de travail), électricité
    et ventilation (tableau, prise, interrupteur, point lumineux, bouche
    VMC), mobilier (lit, canapé, table avec ses chaises), **trémie
    d'escalier** (longueur, largeur) ; tournés par quarts, glissés au doigt ; dessinés
    par le moteur à leur taille (écran, PDF, DXF : calque EQUIPEMENTS) ;
    **en 3D** : les équipements en volumes à leur hauteur (radiateur sous
    la fenêtre, chaudière au mur, WC, baignoire…), la trémie perce le
    plancher de l'étage du dessus et l'escalier y monte en marches ;
    **aussi posés directement dans le plan coté** (« ＋ Symbole », donc sur
    un plan venu d'un scan LiDAR) : choisis dans la liste, posés au centre
    de l'étage, glissés au doigt (pas de 5 cm), touchés pour les tourner,
    régler leur taille (longueur, profondeur ; « Taille standard » la
    remet) ou les retirer ;
    **tableau des équipements** (`nomenclatureSymboles`) : sous le plan et
    dans le PDF (« Équipements par pièce », « Équipements : total »), chaque
    symbole compté dans la pièce qui contient son centre (une prise posée sur
    le mur va à la pièce la plus proche, à moins de 60 cm) ; les comptages
    partent avec le résumé du plan (`resume.detail[].equip`,
    `resume.equipements`) et le chiffrage de la fiche prospect peut y prendre
    une quantité (« Nombre de prises (posés sur le plan) »…) ; le résumé
    donne aussi les **plinthes** de chaque pièce (`plinthes` : le tour des
    murs moins les portes, passages et portes-fenêtres), reprises par le
    chiffrage avec la surface de plafond ; gardés avec le relevé (`symboles`) ;
  - **toiture** (plat, 1, 2 ou 4 pentes, pente en degrés) sur l'étage le plus
    haut, vue en 3D dans le plan ;
  - **« ＋ Symbole » sous le dessin** : on choisit (radiateur, prise…), puis
    on touche l'endroit voulu ; près d'un mur (moins de 50 cm), il s'y
    adosse, dos au mur (`poserSymboleIci`) ; **glisser le fond** déplace tout
    le plan dans le cadre (`S.dessinPan`, « ⟲ 100 % » recentre) ;
  - **retouches sur le dessin même** : un toucher sur une cote la change
    (saisie sur place), un toucher sur le nom de la pièce sélectionnée la
    renomme ; « Nom de la pièce » (◀ ▲ ▼ ▶, « Au centre »), juste SOUS le plan dès
    qu'une pièce est sélectionnée, décale le nom s'il cache une cote, et le nom d'une
    pièce DÉJÀ sélectionnée se glisse aussi au doigt ou à la souris (la pièce ne bouge pas ;
    une pièce non sélectionnée glisse par son nom comme avant) (`p.etiquette`, repris dans le plan coté, où le nom
    se glisse aussi au doigt : `centreNom`) ; « ✓ Créer le plan 2D coté et
    la 3D » en haut du dessin, avec ce qui bloque dit d'avance ;
  - **zone de dessin plus haute** (58 % de l'écran, au moins 300 px) et
    **« ⛶ Plein écran »** (toute la fenêtre ; « ✕ Réduire » ou Échap) ;
  - **zoom** de l'aperçu (deux doigts, molette, « 🔍 ＋ / − », « ⟲ 100 % ») ;
    sous 100 % (jusqu'à 13 %), la zone de dessin s'agrandit autour des
    pièces (`appliquerRecul`, `S.dessinRecul`) : de la place pour en poser
    d'autres où l'on veut, disposition libre ; « 🧲 Aimant : oui / non »
    (réglage de l'appareil, `cp-releve-aimant`) : sans aimant, une pièce reste
    exactement où on la lâche (pas de 5 cm).

- Étape Scan › **« ✏️ Dessin rapide (sans scan) »** : on pose des pièces
  rectangulaires au doigt (nom, longueur, largeur avec de gros − / +), chacune
  à droite, en dessous, à gauche ou au-dessus d'une pièce déjà posée, avec un
  décalage le long du mur. L'aperçu suit chaque geste ; touchez une pièce pour
  la régler. Le dessin est gardé avec la visite (`dessin`).
- **« ✓ Créer le plan »** (`dessin.js`, `releveDepuisDessin`) : le relevé du
  moteur (pièces voisines aux coins partagés : un seul mur commun) et son
  résumé (surface, périmètre, murs, pour la fourchette et le dossier). Le
  plan s'ouvre aussitôt : toucher une cote pour taper la vraie longueur,
  « + Ouverture » pour portes et fenêtres, 3D, PDF. Un plan existant n'est
  jamais écrasé en silence : il est gardé de côté (`plan.ecarte`).
- Chevauchements et dimensions hors bornes (0,30 à 50 m) sont signalés
  avant de créer le plan.
- **« 🖼 Plan 2D (photo, image ou PDF) »** (étape Scan, ou fichier glissé sur
  le plan) : un plan déjà fait (export magicplan, plan d'architecte, photo
  d'un plan papier) part à la fonction `imaginer` (action `decrire`, mode
  `plan`, PDF de 4 Mo au plus). Elle relève les pièces de chaque partie
  (étage, état actuel / projet : on choisit laquelle) ; `dessinDepuisRectangles`
  en fait un dessin rapide (chaque pièce contre sa voisine, murs jusqu'à
  70 cm enjambés, voisines alignées à 3 cm près). Le métreur vérifie, avec
  le plan d'origine sous le dessin (photo `planPapier`, gardée avec la
  visite), puis « ✓ Créer le plan ». **Plusieurs esquisses d'un coup**
  (une par pièce, par exemple) : chacune est lue, leurs pièces s'ajoutent au
  dessin, posées à côté, puis placées au doigt contre leur voisine. Un dessin
  existant : « ＋ Ajouter au dessin » ou « Remplacer le dessin », au choix.
  Une petite pièce posée DANS une grande, contre son mur (WC dans une pièce
  de vie qui n'est pas rectangulaire) : la grande est découpée autour
  (`incluse`, `contourDecoupe` : forme en L ou encoche, surface diminuée
  d'autant), ce n'est plus un chevauchement. L'IA lit le plan avec le modèle
  « pro » (`modelesPlan`) et dit ce qui est douteux (cote raturée…) :
  « ⚠️ À vérifier ». « Tout importer » met un plan de mezzanine, d'étage ou
  de combles sur son propre étage.
  **Cotes intérieures et surface écrite** (`ecartsSurface`) : la consigne exige les cotes
  intérieures d'une pièce (jamais la cote totale du bâtiment) et la surface écrite sur le plan
  (« SH : 15,28 m² », jamais calculée, champ `surface`). Si longueur × largeur s'écarte de plus de
  3 % (et de 0,3 m²) de cette surface, le message « ⚠️ À vérifier » le dit, du plus gros écart au
  plus petit, et la note de la pièce aussi ; les cotes lues ne sont PAS corrigées d'office.
  Sans surface écrite sur le plan (ou avec l'ancienne fonction `imaginer`), aucune alerte.
  **La consigne et la surface écrite demandent de redéployer la fonction `imaginer`** sur Supabase.
  Tests : `t_releve_ecart_surface.js`, `t_releve_imaginer.js`, `releve_dessin_nom_navigateur.js`.
  **Lecture enrichie** (esquisse à la main comprise, `dessinDepuisLecture`) :
  en plus des pièces, l'IA relève, seulement si c'est écrit ou dessiné, les
  portes et fenêtres sur leur côté (« 120/195 » = largeur / hauteur en cm),
  les équipements de l'existant (radiateurs, tableau, sanitaires… posés dos
  au mur indiqué : `symbolesDepuisEquipements`), la hauteur sous plafond de
  chaque pièce (`p.hauteur`, sinon celle du dessin), les annotations et le
  projet écrit en rouge (note de la pièce, reprise dans le plan et le PDF),
  une pièce non rectangulaire (« forme à vérifier »), deux logements côte à
  côte (« A – Séjour », « B – SDB »). Un chiffre raturé n'est pas deviné.
  « ＋ Tout importer » prend tous les plans d'une image (étage, mezzanine) ;
  « Ajouter au dessin » garde les ouvertures et symboles déjà posés ; une
  pièce glissée emporte ses symboles. Note et hauteur se retouchent dans la
  fiche de la pièce.
- **« 🖍 Plan annoté (travaux) »** (étape Scan, dès qu'il y a un plan dessiné
  ou un plan importé) : une **copie** du plan, annotée au doigt — stylo de
  couleur, flèches, textes (« / » pour aller à la ligne), « ↶ Annuler »,
  « 🗑 Tout effacer ». Le plan lui-même ne change pas. Annotations en
  vecteurs (`annotations`, `releve/annotations.js`), fond copié à part (photo
  `fondAnnote`) ; en quittant l'écran, l'image annotée est refaite (photo
  `planAnnote`) et s'affiche à côté du plan. Si le plan change, « Repartir
  du plan à jour » garde les annotations (à vérifier).
  **Avant / après** : l'écran d'annotation montre le plan tel qu'il est
  (« Avant », à gauche, touché pour l'agrandir) et sa copie à annoter
  (« Après travaux », à droite) ; sur iPhone, onglets « Avant | Après ». Il
  s'ouvre aussi depuis le **dessin rapide** (« 🖍 Avant / après » : l'aperçu
  du dessin devient le fond, source `dessin`) et depuis le **plan coté**
  (bouton en tête : le moteur rend l'image du plan du moment,
  `releve:image` → `releve:imagePlan`, source `plan`) ; les annotations déjà
  faites sont gardées, « ✓ Terminer » ramène d'où l'on vient.
  **Texte** : touchez le plan, un panneau s'ouvre — texte tapé ou dicté (🎤),
  taille (petit à très grand) et style (normal, gras, manuscrit, capitales) ;
  toucher un texte le reprend (modifier, 🗑 supprimer). **Zoom** de la toile :
  deux doigts (pincer, se déplacer), « 🔍 ＋ / − », « ⟲ 100 % », molette ; un
  doigt dessine toujours au bon endroit.
  Dans le dossier client, en option (« Plan annoté (travaux) », décochée
  d'office) : une page « Les travaux envisagés sur le plan ».

### « ✏️ Croquis » : on trace au doigt, le tracé devient un plan propre

Bouton **« ✏️ Croquis »** à côté de « ＋ Pièce » et « ＋ Symbole » (un second appui le quitte). En croquis, le doigt
trace et ne déplace plus le plan ; le pincement à deux doigts zoome toujours. Le tracé à main levée est analysé
(`releve/croquis.js`, fonctions pures) :

- **Une pièce** : on trace son contour en revenant au point de départ. Le tracé est simplifié (Ramer-Douglas-Peucker, tolérance
  réglée sur la taille de l'écran), les murs presque horizontaux ou verticaux (15°) le deviennent, un mur nettement
  diagonal reste diagonal, un coin coupé par le doigt redevient un angle droit. Un rectangle donne 4 murs, un L en donne 6.
- **Coller** : les murs d'une pièce tracée près de ceux d'une autre s'alignent sur eux (mur commun, un seul pour le moteur).
  L'aimant se coupe avec « 🧲 Aimant » ; une pièce ne chevauche jamais une voisine (elle est refusée, avec le pourquoi).
- **Échelle** : après le premier croquis, « Quelle est la longueur de ce mur ? » (le mur le plus long est surligné) ; la
  valeur règle l'échelle de tout le plan. « 📏 Échelle » la reprend plus tard. Quand un scan fournit déjà des mesures,
  l'échelle n'est pas demandée. Chaque mur reste modifiable : toucher sa cote, ou les réglages de la fiche de la pièce ;
  l'angle droit est gardé (le côté opposé suit).
- **Portes et fenêtres** : un petit trait le long d'un mur ouvre le menu Porte / Fenêtre / Baie, puis la largeur se règle.
- **Outils** : « ✏️ Tracer », « ✋ Modifier » (toucher une pièce : ses sommets deviennent des poignées à glisser, aimantées,
  angles droits gardés), « 🧽 Gomme » (glisser sur une pièce ou une ouverture l'efface), « ↶ Annuler » et « ↷ Rétablir »
  (historique de la visite ouverte, 60 étapes).
- **Sur PC, à la souris** : même principe, bouton gauche pour tracer. Le clic droit (ou le clic molette) glissé déplace le plan,
  la molette zoome, **Ctrl+Z** annule, **Ctrl+Maj+Z** (ou Ctrl+Y) rétablit (sauf dans un champ de texte, où Ctrl+Z reste celui du champ).
- Une pièce tracée est une pièce du dessin comme les autres (`piece.poly`, en mètres) : « ✓ Créer le plan 2D coté et la 3D »,
  le chiffrage, la synchro et le dossier client ne changent pas. Une pièce tracée se glisse en entier hors du mode croquis.
- Tests : `t_releve_croquis.js` (géométrie), `t_releve_dessin_croquis.js` (modèle), `releve_croquis_navigateur.js`
  (vrais événements tactiles dans Chromium au format iPhone).

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

## Décrire une photo, lire une note manuscrite

- **« 🔍 Décrire »** sous chaque photo de pièce : la photo part à la fonction
  `imaginer` (action `decrire`, Gemini). Elle rend une légende courte, posée
  seulement si la légende est vide (sinon « Légende proposée … Utiliser »),
  et jusqu'à 6 constats utiles au chiffrage (état, matériaux, équipements,
  points de vigilance). Ils sont gardés sur la photo (`description`, interne :
  jamais dans le dossier client) ; « + Ajouter aux notes » les copie dans les
  notes de la pièce, « ✕ » les masque.
- **« 📷 Lire une note manuscrite »** (assistant de visite) : la note
  photographiée est recopiée **à la suite** de la dictée, jamais à sa place ;
  « ✨ Remplir la fiche » la range comme une dictée.
- Il faut le réseau et être connecté ; c'est compté avec les dictées (100 par
  jour par défaut). Si la fonction du serveur n'est pas à jour, l'écran dit
  de la redéployer.

## Le dossier envoyé au client

- Le dossier client montre aussi **l'image du plan dessiné** : le moteur la
  dessine à la fermeture du plan (`imagePlan`, chaque étage) et la visite
  ne la garde que si elle a changé (`planImage`, photo `dessinPlan`). La vue
  3D, telle que laissée à l'écran, part de même (`plan3dImage`, photo
  `dessin3d`) : page « Le relevé » du dossier client, option « Vue 3D du
  relevé » cochée d'office (dans le lien partagé, une fois la fonction
  `imaginer` redéployée : `cheminsDossier`).
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

À venir : TVA par poste, lecture des notes manuscrites par une fonction
du serveur.

## Le chiffrage précis par lots (étape Budget › « Chiffrage précis »)

Un détail estimatif avec les articles et les prix de CP, tiré des surfaces
du plan. **Interne** : ni la marge ni les prix d'artisans ne vont dans le
dossier client (qui ne lit que l'estimation du budget).

- Le bloc n'apparaît que si la ligne `chiffrage` existe dans la table
  `releve_reglages`. Le dépôt est public : articles, prix et gabarits n'y
  sont **jamais**. La ligne s'installe à part (éditeur SQL de Supabase,
  `insert into releve_reglages (id, donnees, version) values ('chiffrage',
  '<json>'::jsonb, 1)`), puis se met à jour de la même façon. L'appli la lit
  seulement et en garde une copie sur l'appareil (marche hors ligne).
- Principe : un dossier de référence (« gabarit ») dont les quantités sont
  mises à l'échelle selon la surface habitable (S), le garage et annexes
  (Sg) et le périmètre (P, estimé à 0,667 × S si le plan ne le donne pas).
  Surfaces lues dans le plan, sinon la surface dite à l'étape Projet.
- « Générer » crée les lignes ; quantités et prix unitaires se retapent.
  « Recalculer les quantités » (après changement de surface ou de gabarit)
  ne touche ni aux quantités retapées, ni aux prix saisis, ni aux articles
  ajoutés. Coefficient de vente, TVA et majoration « marge arrière »
  (lots concernés) réglables.
- « Précisions sur le projet » : des questions à choix (plancher bas : vide
  sanitaire ou dalle, chauffage, couverture, forme de toiture, isolation des
  combles, terres, gaz, assainissement). Le premier choix est « comme le
  dossier de référence » et ne change rien ; un autre retire les articles
  concernés et ajoute les siens, avec des quantités tirées de vos dossiers.
  Changer une réponse après « Générer » remplace les lignes concernées en
  gardant les quantités retapées, les prix saisis et les ajouts. Un article
  sans prix au catalogue (bac acier, dallage, assainissement individuel…)
  est compté à 0 € et signalé : jamais de prix inventé, la ligne attend le
  prix du devis d'artisan. Les questions sont dans la ligne `chiffrage`
  (clé `questions`), pas dans le dépôt.
- Fiabilité : environ ±3-5 % sur une maison moyenne, jusqu'à ±15 % sur une
  petite ; un écart de plus de 25 % avec la surface du gabarit est signalé.
  C'est une estimation d'avant-projet, pas un devis.
- Dans la visite : `budget.chiffrage` (code + quantité seulement, jamais le
  libellé ni le prix du catalogue). Code : `chiffrage.js` ; tests :
  `t_releve_chiffrage_precis.js` et `releve_chiffrage_precis_navigateur.js`
  (données fictives dans `tests/fixtures/chiffrage_fictif.json`).

## Le moteur de relevé (`moteur/`, Phase 1 étape 2)

- C'est l'outil de relevé déjà validé sur des scans réels, repris tel quel et
  découpé en fichiers : `convertisseur.js` (export RoomPlan → pièces,
  ouvertures), `assemblage.js` (plusieurs scans reliés), `moteur.js` (plan, mesures, 3D, PDF), `three.min.js` et
  `OrbitControls.js` (three.js r128, licence MIT).
- **« Plan DXF »** (en haut du moteur, à côté du PDF) : le plan pour la
  DAO (AutoCAD, SketchUp, ArchiCAD, DraftSight…), DXF R12 en centimètres,
  un calque par type (MURS, CLOISONS, PIECES, PORTES, FENETRES, PASSAGES,
  COTES, TEXTES, DEMOLITION, ESTIME). Les murs sont de vrais pleins à leur
  épaisseur, coupés aux ouvertures ; le reste est dessiné par le même code
  que l'écran et le PDF (`construireDxf`, `PinceauDxf`). Étages l'un sous
  l'autre, accents en Windows-1252.
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

### Texte des annotations, vue 3D annotable, mur allumé (novembre 2026)

- **Texte** : tailles Mini / Petit / Moyen / Grand / Très grand ; avec l'outil Texte, on **tire** un texte pour le
  placer où l'on veut (sur un mur, une ouverture) ; un simple toucher le reprend (modifier, supprimer).
- **Vue 3D annotable** : la vue 3D du relevé apparaît dans « Plans et annotations » (tuile « Vue 3D ») ; sa copie
  annotée est rangée dans `annotationsPlus.vue3d` et part au dossier client avec « Plan annoté (travaux) ».
- **Plan coté** : toucher une ligne du tableau des murs (ou la fiche d'un mur) allume ce mur sur le plan, avec son
  nom ; un petit plan flottant l'affiche si le plan est hors de l'écran.
- **Télécharger pour analyse** : sous la copie annotée de « Plans et annotations », « ⬇ Image annotée (JPEG) » et
  « ⬇ Liste des annotations (texte) » (textes et positions) sont de vrais liens, prêts dès que l'image est lue.
- L'image annotée téléchargée est **refaite à la demande** depuis le fond et les annotations (jamais l'image gardée,
  qui peut dater) ; une copie annotée sans image (page rechargée avant de quitter l'écran d'annotation) est refaite
  à l'ouverture de la carte.

### Annotations : texte, symboles, déplacer ; fiche d'un mur (novembre 2026)

- **Texte** : dans son panneau, couleur, taille (Mini à Très grand, ou au curseur), style, flèches ← ↑ ↓ → et aperçu en
  direct sur le plan ; on peut aussi le tirer au doigt ou à la souris.
- **Symboles** (outil « 🪟 Fenêtre, porte… ») : fenêtre, porte, baie vitrée, ouverture, démolition posées d'un toucher sur
  une copie de plan (image importée, RDC, étage), puis tirées, tournées d'un quart, agrandies, recolorées, supprimées
  (`annotations.js` : type `symbole`, `elementSous`, `decaler`, `cadreElement`).
- **✋ Déplacer** : choisit un texte, un symbole, une flèche ou un trait et le déplace d'un bloc ; la barre de réglage
  est sous le plan (jamais au-dessus : elle décalerait le plan sous le doigt).
- **Plan coté** : la fiche d'un mur s'ouvre sur un menu « Ajouter sur ce mur » (fenêtre, porte, baie, autre) ; celle d'une
  porte ou fenêtre dit sa pièce et son mur et allume ce mur ; une légende sous le plan explique trait bleu, trait rouge, lettres.
- **Dessin rapide** : le plan reste collé en haut de l'écran large quand une pièce est sélectionnée (on voit chaque
  réglage de porte ou fenêtre s'appliquer) ; les côtés se disent « Mur du haut, de droite… ».

### Dessin rapide : le plan toujours sous les yeux (novembre 2026)

- Sur écran large (≥ 1000 px), le plan est à gauche, collé en haut de l'écran, et les réglages de la pièce choisie
  (portes, fenêtres, murs…) à droite : on voit chaque réglage s'appliquer sans défiler (`dessinDeux`, `colPlanDessin`).
  Sur téléphone, tout reste l'un sous l'autre.
- La molette fait défiler la page ; **Ctrl + molette** (ou le pincement du pavé tactile) zoome le plan. Avant, la molette
  dézoomait le plan sans le vouloir (19 %) et il devenait minuscule. Le zoom repart à 100 % à chaque ouverture de l'écran.
