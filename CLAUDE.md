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
- **Déploiement** : GitHub Pages, à chaque push sur `main`
  (`.github/workflows/pages.yml`, tout le dépôt est publié).

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
- **À chaque livraison**, mettez à jour `const VERSION='AAAA-MM-JJ · résumé'`
  en haut du script.
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
- **Règles de rédaction**
  - **Aucun prix** dans la bibliothèque. Dimensions « selon plans ».
    Surfaces et quantités propres à un projet : `[à préciser]` (une alerte
    le rappelle dans le programme).
  - Un nouveau produit devient une **proposition B (ou C)**, sauf demande
    explicite de remplacer le standard. On écrit « ou équivalent ».
  - Fiche produit (PDF) dans `assets/ptr/docs/`, photos dans `assets/ptr/`
    (recadrées). Les constantes qui les utilisent doivent être déclarées
    *après* `ptrPhotoAsset` et `ptrPieceAsset`.

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
