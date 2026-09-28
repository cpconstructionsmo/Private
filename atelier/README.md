# Atelier de conception — CP Constructions

Application locale, sur le Mac. À partir du plan du rez-de-chaussée et de
l'emplacement de la maison sur la parcelle, elle prépare le dossier de permis
de construire d'une maison individuelle (PCMI) : analyse réglementaire,
pièces graphiques, notices. Un étage n'est étudié que si on le demande : par
défaut, la maison est de plain-pied.

> **État actuel : jalons J0 et J1.** Création des projets, import du plan
> du RDC (DXF ou PDF vectoriel), interprétation (murs, pièces, ouvertures),
> écarts avec le plan source, surfaces réglementaires, seuil de 150 m²,
> point d'arrêt n° 1, journal des décisions. Les jalons suivants
> (implantation, règles du PLU, pièces PCMI…) viendront ensuite.

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
- `atelier/projet.py` : dossier du projet, versions, points d'arrêt.
- `atelier/serveur.py` et `atelier/statiques/` : l'interface locale.
- `tests/cas_fictif.py` : maison fictive de 12 × 9 m, surfaces calculées à
  la main, avec des pièges volontaires (surface écrite fausse, cote forcée,
  meuble sur le calque MOBILIER).
