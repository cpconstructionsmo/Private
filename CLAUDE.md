# CP Constructions — guide pour les sessions Claude

Ce fichier est lu au démarrage de chaque session Claude Code sur ce dépôt.
Il résume les règles établies avec CP Constructions : respectez-les sans
qu'on ait à les redire.

## L'application

- **Suivi de chantiers de CP Constructions** (maîtrise d'œuvre) : prospects,
  chantiers, marchés, facturation, MAP, programme technique, etc.
- **Un seul fichier** : `index.html` (React 18 + Babel standalone, sans étape
  de compilation). Photos et fiches produits dans `assets/`.
- **Données** : Supabase, table `app_data`, ligne `main`, en jsonb, lue et
  écrite par `save(data)`. Les documents vont sur Google Drive.
- **Choix du client en ligne** : `client.html` (page du client, lien
  personnel `#t=<jeton>`) et la fonction `supabase/functions/configurateur`
  (tables séparées `config_espaces` / `config_paniers`, jamais `app_data`).
  Le calcul du panier est dans `calcul.js`, copié à l'identique dans
  `index.html` (`configCalculer`) : `t_configurateur.js` le vérifie.
  Installation : `supabase/functions/configurateur/README.md`.
- **Validation du plan électrique en ligne** : `plan.html` (lien
  `#t=<jeton>` : voir, commenter, valider l'indice ; jamais modifier) et la
  fonction `supabase/functions/plan-validation` (tables `plan_publications`,
  `plan_remarques`, `plan_validations`). Installation : son `README.md`.
- **Plan électrique** : le DQE (quantitatif du marché « Électricité », ou un
  fichier) est la jauge du plan — `elecLireDQE`, `elecControle`. Aucune
  règle réglementaire n'est inscrite dans le code : elles se saisissent
  (norme, version, source, date de vérification) dans la bibliothèque CP.
  « ✨ Générer automatiquement » (`elecGenererPlan`) pose tout le programme
  sur les pièces tracées ; il ne retire jamais un équipement posé à la main,
  retouché (`userModified`) ou verrouillé. Tests : `t_elec_generateur.js`.
  Niveaux : `plan_elec.plan` est le niveau principal (RDC), les autres sont
  dans `plan_elec.niveaux` (chacun son fond et son repère, jamais mêlés) ;
  `elecPlanMaison` rassemble la maison pour le quantitatif et le contrôle.
  Modèles de disposition CP : `elecBiblio.dispositions`, repère « porte en
  bas ». Tests : `t_elec_niveaux.js`.
- **Budget et avenants** (fiche chantier, `BudgetAvenants`) : `budgetClientTTC`
  est le contrat initial, la référence ; il ne bouge plus. Les avenants
  client (`ch.avenantsClient`, AV-001…) l'actualisent une fois validés
  (`budgetActualise`, `bilanBudget`, calculs en centimes). Le total engagé
  ne suit que marchés, commandes et honoraires : une prestation n'y entre
  qu'une fois reportée dans son marché (`reporterAvenantMarches`). La
  ventilation du contrat se reprend des marchés, commandes et honoraires
  (`contratDepuisEngagements`, avenants reportés retirés), sauf saisie à
  la main (`contratInitial.mode==='manuel'`). L'avenant à faire signer au
  client est un Word (`avenantClientDonnees`, `genererAvenantClientDocx`),
  déposé dans le dossier « Avenants » du Drive. Honoraires d'un nouvel
  avenant : 10 % du HT des artisans, TVA 20 % (`AV_HONO_PCT`,
  `AV_HONO_TVA`). La maîtrise d'œuvre facture toujours à 20 % de TVA
  (`HONO_TVA_DEFAUT`), même quand les travaux sont à 10 % : sans taux saisi,
  honoraires, factures d'honoraires et avenants prennent 20 % ; un autre
  taux saisi est gardé mais signalé, avec un bouton pour repasser à 20 %. Un avenant, même validé, se supprime
  (`supprimerAvenantClient` défait ses reports ; son numéro ne resert
  pas). Tests :
  `t_budget_avenants.js`, `budget_avenants_navigateur.js`.
- **Marché de travaux** (Marchés › lot › « Rédiger le marché ») : il sort
  en trois exemplaires Word (`MARCHE_EXEMPLAIRES` : client, entreprise,
  CP Constructions), marqués en tête de page. Celui du client annexe
  l'attestation décennale de l'entreprise, reprise du Drive
  (`attestationPourMarche` ; un PDF est rendu page à page par pdf.js, 4 pages
  au plus). Sans attestation lisible, les trois sortent quand même et
  l'écran dit pourquoi. Le lien du lot (`contratLien`) est l'exemplaire
  CP Constructions ; `exemplaires` garde les trois. Tests :
  `t_marche_exemplaires.js`. Le marché revenu signé se dépose dans la
  section « Marché signé par l'entreprise » de la fiche du lot (aussi
  depuis la liste des lots et le tableau de bord) : chaque fichier part
  sur le Drive › Marché travaux signé, renommé d'après le lot
  (`nomMarcheSigne`), et s'ajoute à `m.signes` (`ajouterMarcheSigne`) ;
  le lot passe « signé », `contratLien` devient le dernier signé et le
  contrat remplacé se garde (`contratRedige`). Tests : `t_marche_signe.js`.
  Il se renvoie à l'artisan par mail (« Envoyer le marché signé ») : les
  fichiers signés repris du Drive tels quels, avec les plans d'exécution
  cochés d'office (`PIECES_MAIL_SIGNE`) ; la date est gardée
  (`mailSigneLe`). Tests : `t_marche_signe_mail.js`.
- **Factures d'achat de matériaux** (Marchés › Achats de matériaux) : une
  facture déposée se transmet au client depuis son volet (« Envoyer au
  client », `EnvoyerFactureAchat`) : aperçu à relire, facture reprise du
  Drive avec sa vraie extension ; la date se garde sur la facture
  (`envoyeeClientLe`). Les factures des marchés, elles, se visent
  (`ViserFacture`). Tests : `t_facture_achat_client.js`.
- **Facture répartie sur plusieurs lots** (une entreprise qui facture
  charpente et couverture ensemble) : rangée sur un lot pour son total,
  puis « Répartir sur plusieurs lots » depuis son volet
  (`RepartitionFacture`, `repartirFacture`, `defaireRepartition`). Une
  seule facture (même numéro, date, fichier), une part par lot, reconnue
  par `repartition.id` ; total HT et TTC lu gardés avec les parts. La
  visa et l'envoi au client disent le total et les lots
  (`repartitionPourMail`). La même facture saisie à part sur deux lots
  (même numéro, même date : `facturesJumelles`) se relie en un clic
  (`relierFactures`) ; le fichier déposé sur une part vaut pour toutes
  (`poserLienFacture`). Sans fichier, le volet dit que la visa l'attend.
  Tests : `t_facture_repartie.js`.
- **Déploiement** : GitHub Pages, à chaque push sur `main`
  (`.github/workflows/pages.yml`, tout le dépôt est publié). Les tests du
  CRM, de l'atelier et du Designer tournent à chaque PR
  (`.github/workflows/tests.yml`).

## CP Designer (`designer/`, TypeScript)

- Module de **conception** (Building Model, Geometry Engine, éditeur 2D…),
  **séparé du CRM** : on n'ajoute rien de ce module dans `index.html`, et
  rien de ses données dans `app_data` (tables `designer_*`,
  `supabase/designer/schema.sql`). Le CRM ne fait que l'ouvrir, par des
  liens (`designerLien`, `designerLienProspect`) : onglet « CP DESIGNER » du
  menu (chantiers, prospects en cours, projet libre) et pièce « Plans
  d'exécution » de la fiche chantier. Un chantier issu d'un prospect passe
  aussi `prospect=` : le Designer rouvre l'avant-projet du prospect.
- Décisions d'architecture : `docs/designer/` (ADR). Toute demande qui
  contredit un ADR ou les 7 règles de la spécification se signale, au lieu
  d'être appliquée en silence.
- La spécification produit (*Master Product Specification V3*) et les
  rapports restent **hors dépôt** (dépôt public).
- Roadmap unique : Phase 0 faite (socle) ; Phase 1 faite = 2D Core
  (géométrie, murs, accrochage, contraintes, pièces, ouvertures, cotes,
  annulation, sauvegarde, éditeur) ; Phase 1 bis faite = import du RDC lu
  par l'atelier (`designer/src/import/atelier.ts`) ; ensuite, tracé rapide,
  cotation automatique, bibliothèque d'ouvertures et vue 3D dérivée
  (`designer/src/vue3d/`, ADR-0006). Moteurs et leurs tests
  d'abord, interface ensuite. Les essais sur de vrais plans de clients se
  font hors dépôt ; les tests n'utilisent que le plan fictif de l'atelier
  (`designer/tests/fixtures/atelier_fictif.json`).
- Unités réelles (mm) ; tolérances seulement dans
  `src/geometry/tolerance.ts`.
- Tests : `cd designer && npm install && npm test && npm run typecheck` ; parcours
  dans Chromium : `npm run test:navigateur`.

## Règles

- **Tout en français** : interface, commentaires, messages de commit,
  descriptions de PR et réponses à l'utilisateur. Les commentaires du code
  expliquent le *pourquoi*, dans le style de ceux qui existent.
- **Ne jamais casser une fonction existante.** Ne jamais écraser en silence
  ce que l'utilisateur a saisi ou retouché. Les anciennes saisies restent
  lisibles.
- **Ne jamais écrire dans la base de production.** Pour un contenu propre
  à un dossier (le dossier Moualid par exemple), donnez un texte prêt à
  coller.
- **Le dépôt est public.** Il ne doit contenir ni données client, ni secret,
  ni document confidentiel reçu en pièce jointe (comptes, actes, etc. : voir
  `.gitignore`). Les photos publiées ne montrent ni étiquette de prix ni
  élément personnel.
- **À chaque livraison du CRM**, mettez à jour
  `const VERSION='AAAA-MM-JJ · résumé'` en haut du script de `index.html`
  (une livraison qui ne touche que `designer/` ne le change pas).
- **Plusieurs personnes travaillent sur le dépôt.** Une session = une
  branche. On ne pousse jamais directement sur `main`.

## Google (Drive, Gmail, Agenda)

- Connexion OAuth « implicite » depuis le navigateur (`GOOGLE_CLIENT_ID`,
  jeton d'une heure, aucun secret dans le dépôt). Le paramètre `state`
  distingue le retour de Google Agenda (`state=agenda`) de celui de Drive.
- **Agenda** : Google Agenda est la référence. Réglages, compte connecté
  et copie locale des événements sont propres à chaque utilisateur, sur
  son appareil (`localStorage`, clés `cpAgenda:*:<e-mail>`). Seuls les
  liens avec les dossiers (`data.agendaLiens` : agenda, événement ou série,
  dossier) sont partagés — jamais le titre ni le contenu d'un événement.
  Toute écriture passe `sendUpdates=none` (aucune invitation) et `If-Match`
  (etag) ; les heures sont envoyées en `Europe/Paris`.
- Les anciens rendez-vous (`data.rendezvous`) restent lisibles ; un
  rendez-vous transféré porte `google:{calId,eventId}`.
- **Envoi sur le Drive** : `uploadToDrive` envoie en une requête jusqu'à
  5 Mo, au-delà par session reprenable ; tout refus de Google passe par
  `driveErreur` (reconnexion, Drive plein, accès non coché, dossier
  introuvable…). Relire un fichier (`driveFichierBytes`) : l'accès
  `drive.file` ne voit que les fichiers déposés par l'application avec ce
  compte ; une pièce illisible est nommée (facture visée : envoi possible
  sans elle). ARTISANS › « Vérifier les pièces sur le Drive »
  (`verifierPiecesArtisans`, `VerifPiecesDrive`) liste d'un coup les
  attestations et RIB illisibles, à redéposer sur place. Tests :
  `t_drive_envoi.js`, `t_viser_illisible.js`, `t_verif_pieces.js`.

## Livrer une modification

1. Travailler sur la branche de la session.
2. Lancer les tests (voir plus bas). Tout doit passer.
3. Faire un commit avec un message clair en français.
4. Ouvrir une PR vers `main`, puis la fusionner en *squash*.
5. Vérifier que le déploiement GitHub Pages (« Deploy static app to GitHub
   Pages ») se termine en succès.
6. Dire à l'utilisateur de recharger la page.

## Tests

```
cd tests
npm install
npm test                  # tous les tests t_*.js
npm run test:navigateur   # + vérifications dans Chromium (*_navigateur.js)
```

- `harness.js` charge le script de `index.html` dans Node et sert les vrais
  fichiers `assets/`.
- Les tests `*_navigateur.js` ouvrent l'application dans Chromium avec un
  faux Supabase (Playwright ; Chromium est dans `/opt/pw-browsers/chromium`
  sur les sessions cloud).
- Pour une nouvelle fonction, ajoutez un `t_<sujet>.js` sur le modèle des
  autres (`verif()`, `chk(condition, 'message')`, `fin()`).

## Atelier de conception (`atelier/`, Python)

- Application **locale, sur le Mac** (FastAPI sur 127.0.0.1) qui produit
  le dossier PCMI (page de garde, PCMI 1 à 8, plan du RDC) à partir du plan
  du RDC et du plan du terrain (DXF ou PDF vectoriel). Mode d'emploi et
  règles R1–R10 : `atelier/README.md`.
- **Plain-pied par défaut** : un étage (module B) ne s'étudie que sur
  demande.
- Les projets (plans, données clients) restent dans
  `~/CP Constructions/Atelier/projets/`. **Jamais dans le dépôt.** Les
  tests n'utilisent que le plan fictif de `atelier/tests/cas_fictif.py`.
- Ne rien inventer (R2) : aucun document tiers fabriqué, statut ✅ / ⚠️ / ❓
  sur toute valeur discutable. Articles de loi « à vérifier » tant qu'ils
  n'ont pas été lus sur Légifrance. Seuil de 150 m² bloquant.
- Tests : `cd atelier && python3 -m venv .venv &&
  .venv/bin/pip install -r requirements.txt && .venv/bin/python -m pytest -q tests`.

## Programme technique (PTR) : la bibliothèque et ses révisions

- **La bibliothèque**
  - Modèle livré : `PTR_CATALOGUE`, lu par `ptrBiblioInitiale()`.
  - Chaque prestation (`pr_<id>`) a des propositions `var_<id>_a/b/c` ;
    la proposition A est la proposition par défaut.
  - Les lignes d'un programme sont des copies des propositions.
- **Les révisions**
  - Le modèle évolue par *révisions* numérotées : `PTR_SEED_REV`, avec une
    date `PTR_SEED_DATE_<n>` enregistrée dans `PTR_SEED_DATES[n]`.
  - `ptrMigrerBiblio()` apporte chaque révision aux bibliothèques déjà
    enregistrées :
    - un texte n'est remplacé que s'il n'a pas été retouché (empreintes
      `PTR_TEXTES_ANCIENS`) ;
    - les nouvelles propositions sont ajoutées sans devenir la proposition
      par défaut.
- **Où écrire quoi**
  - Compléter la proposition A (marque, fiche, photo) : `PTR_COMPLEMENTS_A`.
  - Réécrire un texte de A :
    - ajouter l'empreinte (`ptrEmpreinte`) de l'ancien texte dans
      `PTR_TEXTES_ANCIENS` ;
    - ajouter l'identifiant de la proposition dans `PTR_TEXTES_REVISIONS[n]`.
  - Ajouter une proposition B : `PTR_PROPOSITIONS_2` ; une proposition C :
    `PTR_PROPOSITIONS_3`. Dans les deux cas, ajouter l'identifiant dans
    `PTR_SEED_NOUVELLES[n]`.
  - Ajouter une prestation : `PTR_PRESTATIONS_AJOUTEES` (`apres`,
    `optionnelle`).
  - Changer la proposition par défaut d'une prestation :
    `PTR_DEFAUTS_REVISIONS[n]` (une bibliothèque enregistrée ne la prend
    que si son défaut est resté la A ; jamais une proposition archivée).
    Révision 28 : volets à coffre monobloc (C), vitrerie (B), TaHoma (B).
  - Ajouter des photos à une proposition déjà livrée :
    `PTR_PHOTOS_AJOUTEES[n]` (ajoutées à la suite, rien n'est retiré).
- **Règles de rédaction**
  - **Aucun prix** dans la bibliothèque. Dimensions « selon plans ».
    Surfaces et quantités propres à un projet : `[à préciser]` (une alerte
    le rappelle dans le programme).
  - Un nouveau produit devient une **proposition B (ou C)**, sauf demande
    explicite de remplacer le standard. On écrit « ou équivalent ».
  - Fiche produit (PDF) dans `assets/ptr/docs/`, photos dans `assets/ptr/`
    (recadrées). Les constantes qui les utilisent doivent être déclarées
    *après* `ptrPhotoAsset` et `ptrPieceAsset`.

- **Rapprochement avec la vente** (éditeur du programme › « Rapprocher avec
  la vente », `PtrVente`) : le chiffrage remis au client (PDF ou Word,
  `lireChiffrageVente`) est lu puce par puce dans sa notice
  (`venteLignes`, « (envisagé) » retiré) et gardé avec le programme
  (`prog.vente`). Chaque puce est rattachée à ses prestations par des mots
  (`PTR_VENTE_THEMES`, fragment par ouvrage : `venteFragments`) ;
  `ptrRapprochement` donne les écarts (mesures, teintes, marques, fiche
  jointe d'un autre fabricant : `venteEcarts`), les postes vendus absents,
  ceux que la vente ne cite pas (hors `PTR_VENTE_GENERIQUES`) et la mission
  du maître d'œuvre à part. Les actions (`ptrAppliquerVente` : autre
  proposition, inclure, ajouter avec le texte vendu, exclure) ne
  s'appliquent qu'au clic ; « Ignorer » se garde (`prog.venteIgnores`).
  « Appliquer toutes les propositions » (`ptrAppliquerToutVente`) les
  enchaîne après avoir dit ce qui change : jamais d'exclusion d'office, ni
  de texte retouché remplacé (il est nommé). Un programme se crée aussi
  « Depuis le chiffrage vendu » : le modèle, la vente gardée, le type
  d'ouvrage repris (ERP), le rapprochement ouvert aussitôt ; un document
  sans ouvrage reconnu ne crée rien. Tests : `t_ptr_vente.js`,
  `t_ptr_depuis_vente.js` (chiffrages fictifs).
- **Type d'ouvrage** (`prog.typeOuvrage` : `maison` ou `erp5`) : en ERP,
  page de garde et synthèse parlent de « bâtiment » (`ptrMentionsPour`,
  `ptrTexteSelonOuvrage`), les lignes qui parlent encore de garage, de
  chambres ou de maison sont signalées (`ptrAlertesUsage`, aussi dans le
  contrôle avant export), et les prestations ERP (`PTR_PRESTATIONS_ERP`,
  optionnelles) s'ajoutent d'un clic (`ptrInclurePrestations`) : alarme,
  éclairage de sécurité, grilles de transfert, dossier (révision 23) ;
  dispositions électriques, extincteurs et consignes, portes et repères
  accessibles, sanitaire accessible, réaction au feu, stationnement et
  cheminement accessibles, contrôles avant ouverture (révision 27). Aucun
  article ni seuil réglementaire chiffré : tout renvoie aux notices de
  sécurité et d'accessibilité et au contrôleur technique. Le nom du
  dossier (« Maison Philippe… ») ne change pas ; les documents d'un ERP
  portent « Bâtiment Philippe… » (`ptrIntituleDefaut`), ou l'intitulé
  saisi sur le programme (`prog.intitule`, « Intitulé sur les
  documents »). Tests : `t_ptr_rev23.js`, `t_ptr_rev27.js`,
  `t_ptr_intitule.js`.
- **Word du programme** : Word refuse ce que LibreOffice et Google Drive
  tolèrent ; l'ordre des éléments suit le schéma OOXML (marges et
  bordures de cellule : haut, gauche, bas, droite). Safari (et tout
  navigateur d'iPhone) refuse un téléchargement lancé à la fin d'une
  composition : il ouvre un onglet « WebKitBlobResource erreur 1 ». Sous
  Safari (`telechargementDifere`), l'export dit « prêt » et le fichier se
  télécharge d'un bouton (« ⬇ Télécharger le Word ») ; ailleurs il part
  tout seul, avec « Télécharger à nouveau ». Tests :
  `t_ptr_export_safari.js`, `t_ptr_intitule.js`.
- **Importer un programme préparé** (création ou éditeur du programme,
  fichier `.json` au format `cp-ptr`, `ptrLireImport`,
  `ptrImporterProgramme`) : un programme complet préparé hors de
  l'application (par exemple d'après le chiffrage vendu) se charge d'un
  clic, rattaché au dossier ouvert (jamais à celui du fichier). Le contenu
  en place passe dans l'historique des versions ; un programme validé ne
  se remplace pas ; un fichier incomplet ne touche à rien. C'est ainsi
  qu'un programme se remplit pour un dossier sans écrire en base : le
  fichier, préparé hors dépôt, est remis à l'utilisateur. Tests :
  `t_ptr_import.js`.
- **Photos d'une proposition** (ligne du programme) : reprend les photos
  d'une proposition de la bibliothèque sans toucher au texte écrit pour le
  projet. Des photos ajoutées après coup à une proposition livrée
  (`PTR_PHOTOS_AJOUTEES`) arrivent à la suite, sans rien retirer. Tests :
  `t_ptr_photos_ligne.js`.

### Ajouter une révision N (N = révision actuelle + 1)

1. Vérifiez que `tests/fixtures/biblio_rev<N-1>.json.gz` existe. Sinon,
   **avant toute modification**, créez-le :
   ```
   cd tests && node -e "const {charger}=require('./harness');const M=charger(['ptrBiblioInitiale']);process.stdout.write(JSON.stringify(M.ptrBiblioInitiale()))" | gzip -9 > fixtures/biblio_rev<N-1>.json.gz
   ```
2. Passez `PTR_SEED_REV` à N et ajoutez `PTR_SEED_DATE_N` (heure
   postérieure à la précédente) dans `PTR_SEED_DATES`.
3. Faites la modification (voir plus haut), puis mettez à jour `VERSION`.
4. Dans les tests :
   - remplacez `seedRev===N-1` par `seedRev===N` et « 3 → N-1 » par
     « 3 → N » dans les `t_ptr_rev*.js` ;
   - ajoutez `t_ptr_revN.js`, qui migre `biblioRev('rev<N-1>')` et vérifie
     le résultat ;
   - ajustez les compteurs de `t_ptr_biblio.js` et `t_ptr_editeur.js` si le
     nombre de prestations change.
5. Si possible, générez le Word du programme et regardez la page
   concernée (LibreOffice et `pdftoppm`).
6. Après la fusion, créez `fixtures/biblio_revN.json.gz` (commande du
   point 1) pour la révision suivante.
