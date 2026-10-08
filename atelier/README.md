# Atelier de conception — CP Constructions

Application locale, sur le Mac. À partir du plan du rez-de-chaussée et de
l'emplacement de la maison sur la parcelle, elle prépare le dossier de permis
de construire d'une maison individuelle (PCMI) : analyse réglementaire,
pièces graphiques, notices. Un étage n'est étudié que si on le demande : par
défaut, la maison est de plain-pied.

> **État actuel.** Création des projets ; import du plan du RDC (DXF ou PDF
> vectoriel, murs en traits ou en aplats) ; interprétation (murs, pièces,
> baies avec leurs dimensions écrites, porche ou auvent) ; écarts avec le
> plan source ; surfaces réglementaires ; seuil de 150 m² ; point d'arrêt
> n° 1 ; toiture à croupes calculée ; terrain et implantation ; contrôle des
> règles du PLU saisies ; **le dossier de permis en PDF** : page de garde,
> plan de situation (PCMI 1), plan de masse (PCMI 2), coupes (PCMI 3),
> notice (PCMI 4), façades et toiture (PCMI 5), insertion (PCMI 6),
> photographies (PCMI 7 et 8), plan du rez-de-chaussée.

## Installer (une fois)

1. Télécharger le dépôt (bouton **Code › Download ZIP** sur GitHub), le
   décompresser, et placer le dossier `atelier` où vous voulez (par exemple
   dans `Documents`).
2. Si Python 3.10 ou plus récent n'est pas installé, l'installer depuis
   <https://www.python.org/downloads/macos/>.
3. Double-cliquer sur **`installer.command`**. Si macOS refuse de l'ouvrir
   (« développeur non identifié ») : clic droit › **Ouvrir**, puis **Ouvrir**.
   L'installation se termine par un essai sur un plan fictif.

Pour une mise à jour : remplacer le dossier `atelier` (sauf `.venv`) et
relancer `installer.command`.

## Utiliser

Double-cliquer sur **`lancer.command`** : l'atelier s'ouvre dans le
navigateur (<http://127.0.0.1:8765/>). Fermer la fenêtre du Terminal pour
l'arrêter.

1. Indiquer votre nom en haut à droite : il signe les validations et le journal.
2. Créer le projet.
3. Importer le plan du RDC :
   - **DXF** (export d'AutoCAD, Archicad, Cedreo). Un DWG s'exporte d'abord
     en DXF. Les calques de cotes, textes, hachures et mobilier sont ignorés
     pour les murs ; les unités sont lues dans le fichier.
   - **PDF vectoriel** (pas un scan) : indiquer l'échelle (100 pour 1/100).
     Les murs sont reconnus à l'épaisseur de leur trait. **Vérifiez l'échelle
     sur une cote connue.**
4. Comparer le plan source et l'interprétation, lire les écarts, corriger
   les pièces (nom, usage, surface habitable, écarter une surface qui n'est
   pas une pièce).
5. Valider le **point d'arrêt n° 1**. Les surfaces passent alors de
   « hypothèse » à « confirmée ». Toute correction ou tout nouvel import
   annule cette validation.
6. Compléter la **volumétrie** (égout, arase, pente, débord, vide sanitaire,
   niveau NGF du RDC, terrain fini, nord, couverture), le **cartouche**
   (maître d'ouvrage, surface du terrain, zone sismique, chauffage,
   modifications) et les **baies** dont la hauteur n'est pas écrite sur le
   plan. Une valeur non saisie reste une hypothèse (⚠️) : cochez « je
   confirme » pour valider une valeur courante telle quelle.
7. **Terrain** : importer le plan du terrain (plan de division, extrait
   cadastral exporté, ancien plan de masse ; PDF vectoriel ou DXF). La
   limite est le contour dont les côtés correspondent aux cotes écrites ;
   l'alignement, les altitudes TN, le nom de la voie, l'altitude du RDC
   fini écrite (« ±0,00 = 50,30 ») et le nord dessiné (flèche ou rose avec
   la lettre « N », à vérifier ⚠️) sont lus. Si la
   maison y est déjà dessinée, l'implantation est lue ; sinon, la placer
   parallèle à un côté, à une distance donnée de deux côtés. Les reculs
   sont **mesurés**.
8. **Règles du PLU** : saisir la valeur et l'article (recul sur voie, recul
   sur limites, emprise, hauteurs) : l'atelier contrôle le projet (✅, ⛔,
   « au minimum exact »). Les hauteurs sont mesurées depuis le terrain
   naturel le plus bas au pied de la maison quand les altitudes sont connues.
9. **Notice** : l'atelier écrit ce qui se mesure ; vous rédigez le reste
   (matériaux, réseaux, clôtures, plantations, accès).
10. **Images** : déposer l'extrait cadastral et la vue aérienne (PCMI 1), le
    photomontage d'insertion réalisé par ailleurs (PCMI 6), les
    photographies (PCMI 7, 8), avec leur légende et leur numéro ; placer
    chaque prise de vue en cliquant sur le plan du terrain (point, puis
    direction). L'atelier ne modifie aucune image.
11. **Générer le PDF** des pièces : chaque génération est un nouveau fichier
   dans `04_pieces/<indice>/`. Tout ce qui reste supposé est rappelé en
   rouge sur les planches, sous « À CONFIRMER AVANT DÉPÔT ».

## Les pièces produites

| Pièce | Contenu |
|---|---|
| Page de garde | société, maître d'ouvrage, couverture, chauffage, dates et modifications, lieu, parcelles ; tableau des surfaces ; résumé (emprise, surface de plancher, surface des baies) |
| PCMI 3 – Coupes | coupes A-A et B-B placées dans les pièces : vide sanitaire, dalle, murs et cloisons coupés, isolant, comble, toiture coupée et toiture au-delà, niveaux, repérage |
| PCMI 5 – Façades | les quatre façades (nommées selon le nord) : murs, baies, toiture ; niveaux (±0,00 NGF, égout, faîtages) ; dimensions des baies |
| PCMI 5 – Plan de toiture | pans, faîtages et leur hauteur, arêtiers, noues, sens et pente, débord, cotes de l'égout |
| Plan du RDC | murs, baies, pièces et surfaces, porche en tirets, trois chaînes de cotes par façade, tableau des surfaces, repères des coupes, nord, échelle |
| PCMI 1 – Situation | les images déposées (extrait cadastral, vue aérienne), légendées |
| PCMI 2 – Plan de masse | limite et longueur des côtés, alignement et voie, maison et toiture, reculs mesurés, altitudes TN, niveau du RDC, tableau des surfaces et des règles contrôlées |
| PCMI 4 – Notice | état initial, projet (implantation, volume, hauteurs, emprise, surface de plancher), adaptation au terrain (remblai, déblai), matériaux, clôtures, plantations, accès ; « [à compléter] » en rouge pour ce qui manque |
| PCMI 6, 7, 8 | insertion et photographies, numérotées, avec le repérage des prises de vue sur le terrain |

La **toiture à croupes** (même pente sur tous les pans) est calculée à
partir du contour de la maison et de ses couverts (porche, auvent) : elle
demande un plan orthogonal (murs à angle droit). Les **réglages du
cabinet** (société, dessinateur, logo RE2020) se font une fois, depuis
l'accueil ; ils restent sur ce Mac.

## Où sont les données

- Les projets sont dans `~/CP Constructions/Atelier/projets/` (ou le dossier
  donné par la variable `CP_ATELIER_PROJETS`, ou `lancer.command --projets
  <dossier>`). Pour en garder une copie sur Google Drive, placer ce dossier
  dans le dossier Google Drive du Mac.
- Chaque projet :

  ```
  <AAAA>-<NOM>/
    00_entrees/         documents déposés, jamais modifiés ni écrasés
    01_modele/          modele.json + versions/ (chaque version est gardée)
    02_reglementation/  03_analyse/  04_pieces/  05_etage/  06_depot/
  ```
- **Rien n'est envoyé ailleurs** : le serveur n'écoute que sur ce Mac. Ce
  dossier de code est public (dépôt GitHub) : aucun plan, aucune donnée
  client n'y est jamais placé.

## Reprendre le plan dans CP Designer

Le RDC lu par l'atelier (plan DXF ou PDF vectoriel) peut être repris dans
CP Designer, sans le redessiner : dans le Designer, panneau du niveau,
**Importer le RDC lu par l'atelier…**, puis choisir
`01_modele/modele.json` du projet. Murs (axe et épaisseur), ouvertures et
pièces arrivent avec leur statut (✅ confirmé, ⚠️ à vérifier), le tracé du
plan source en fond verrouillé, et un rapport qui compare les surfaces de
l'atelier et du Designer pièce par pièce (ADR-0004, `docs/designer/`).

## Les règles de l'atelier

- **R1 — Une seule maquette.** Toutes les pièces seront tirées du même
  modèle. Une modification en amont annule les validations qui en dépendent.
- **R2 — Ne rien inventer.** Un document tiers (attestation RE2020, étude de
  sol, SPANC, géomètre, ABF…) n'est jamais fabriqué. Un mur n'est jamais dit
  porteur sans document.
- **R3/R4 — Tout est sourcé et porte un statut** : ✅ confirmé (source
  identifiée), ⚠️ hypothèse (avec ce qui change si elle est fausse), ❓
  contrôle impossible (avec la donnée qui manque).
- **R5 — Textes de loi vérifiés sur Légifrance** avant d'être cités. Tant
  que ce n'est pas fait, ils portent la mention « rédaction en vigueur à
  vérifier ».
- **R6 — Points d'arrêt** : RDC, implantation, règles, risques, relecture
  finale. Chacun est signé.
- **R7 — Versions** : chaque enregistrement garde la version précédente.
- **R8 — Seuil de 150 m²** de surface de plancher : au-delà, le recours à un
  architecte est obligatoire et la production au nom de CP Constructions
  est bloquée. Alerte dès 140 m².
- CP Constructions n'est pas architecte : les pièces porteront « Dessiné
  par : Claude PORTIER ».

## Surfaces calculées (RDC)

| Surface | Mesure | Déductions |
|---|---|---|
| Surface de plancher | au nu intérieur des murs de façade | stationnement (garage) ; trémies et hauteurs < 1,80 m quand elles seront connues |
| Emprise au sol | contour extérieur des murs | — (débords et auvents sur poteaux : à ajouter avec la toiture) |
| Surface habitable | somme des pièces | murs, cloisons, embrasures ; garage, local technique, extérieurs |
| Surface taxable | comme la surface de plancher, garage compris | à titre indicatif |

## Pour les développeurs

```
cd atelier
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q tests          # plan fictif en DXF et en PDF, API
.venv/bin/python -m atelier.serveur --projets /tmp/projets --sans-navigateur
```

- `atelier/modele.py` : le modèle (pydantic), `Valeur` et ses statuts.
- `atelier/import_dxf.py`, `import_pdf.py` : lecture des plans.
- `atelier/geometrie.py` : reconstitution (fermeture des ouvertures,
  polygonisation, murs de façade par mesure vers l'intérieur, contrôle des cotes).
- `atelier/surfaces.py` : surfaces et seuil de 150 m².
- `atelier/toiture.py` : toiture à croupes (distance « en carré » aux égouts).
- `atelier/planches.py` : planche A3, cartouche, cotes, niveaux, échelle, nord.
- `atelier/pieces_graphiques.py` : les pièces tirées du modèle.
- `atelier/reglages.py` : réglages du cabinet (locaux).
- `atelier/terrain.py` : terrain, implantation, reculs, contrôle des règles.
- `atelier/notice.py` : notice PCMI 4.
- `atelier/planches_images.py` : planches d'images (PCMI 1, 6, 7, 8).
- `atelier/projet.py` : dossier du projet, versions, points d'arrêt.
- `atelier/serveur.py` et `atelier/statiques/` : l'interface locale.
- `tests/cas_fictif.py` : maison fictive de 12 × 9 m, surfaces calculées à
  la main, avec des pièges volontaires (surface écrite fausse, cote forcée,
  meuble sur le calque MOBILIER).
