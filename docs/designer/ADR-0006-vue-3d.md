# ADR-0006 — Vue 3D : une maquette dérivée du plan, montrée par three.js

**Statut** : acceptée le 2026-10-02.

## Contexte

L'équipe compare le Designer aux logiciels de plans de maisons (Cedreo,
MiaO), dont l'atout est la 3D instantanée. Le plan 2D reste l'outil de
saisie (ADR-0002 : rendu Canvas 2D) ; il faut une seconde lecture du même
Building Model, en volume, sans double saisie ni donnée en plus.

## Décision

- La 3D est **dérivée** du modèle, comme le plan (ADR-0002) : rien de 3D
  n'est enregistré, aucune table, aucun champ. Elle suit chaque commande,
  annuler compris.
- Un **moteur pur** (`designer/src/vue3d/maquette.ts`) traduit le modèle
  en prismes droits (contour en plan, altitude de bas et de haut,
  matière) :
  - un mur est son contour en plan (onglets du plan compris), extrudé de sa
    base à sa hauteur ; chaque ouverture retire sa bande du mur, dont il ne
    reste que l'allège et le linteau (booléens en entiers, ADR-0002) ;
  - l'ouverture est remplie au milieu de l'épaisseur : vitrage, vantail,
    tablier ; rien pour un passage ;
  - chaque niveau a son plancher (contour extérieur de sa maçonnerie) et le
    sol de ses pièces fermées ; les niveaux se posent à leur altitude.

  Il est testé sans navigateur (volumes exacts au mm³ près).
- L'affichage (`designer/src/ui/vue3d.ts`) utilise **three.js** (licence
  MIT), **chargé à la demande** : le plan 2D ne le télécharge pas. Il ne
  calcule rien de métier ; mètres et axes y sont une affaire d'affichage.
- WebGL absent ou refusé : la vue le dit et le plan reste utilisable.

## Conséquences

- Toute amélioration du modèle (hauteurs, allèges, vantaux…) se voit en 3D
  sans travail en plus ; une erreur de plan se voit aussi en 3D, ce qui aide
  à la repérer.
- Hors périmètre pour l'instant, à traiter par de nouveaux moteurs testés
  avant leur affichage : textures, visite à hauteur d'homme, rendu
  photoréaliste.

## Complément (2026-10-02) : la toiture

- Un objet `roof` par niveau, qui ne garde que des choix (type, pente,
  débord, couverture) ; la géométrie se calcule (`building/toiture.ts`) et
  suit les murs. Méthode des croupes reprise de l'atelier, recoupée par les
  tests sur les mêmes plans fictifs.
- La maquette gagne une seconde primitive, la **plaque** : un polygone plan
  quelconque dans l'espace, épaissi (pans de toit, pignons).

## Complément (2026-10-02) : le mobilier

- Un objet `furniture` (position, orientation, cotes, modèle de la
  bibliothèque) : c'est une saisie, il est donc enregistré ; sa forme en
  plan et ses volumes en 3D se déduisent de son modèle
  (`building/mobilier.ts`), une seule description pour les deux vues.
