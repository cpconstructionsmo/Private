# ADR-0001 — Un module séparé, en TypeScript compilé

**Statut** : acceptée le 2026-10-01.

## Contexte

Le suivi de chantiers (`index.html`) tient en un seul script JSX de plus de
25 000 lignes (1,75 Mo), sans modules, et toutes ses données dans une ligne
JSON (`app_data/main`). Le Designer (CAO 2D, Building Model, moteurs de
géométrie, de quantités et de coûts) est d'une autre taille : l'y greffer
serait le premier risque de régression du CRM.

## Décision

- Le Designer vit dans `designer/`, page publiée sous `/designer/`, en
  **TypeScript strict**, compilé par **Vite** au déploiement
  (`.github/workflows/pages.yml`). Si la compilation échoue, la préversion
  affiche « non disponible » et le CRM est publié comme avant.
- Les moteurs (`src/model`, `src/geometry`, `src/building`, `src/engine`)
  ne dépendent d'aucune interface ; l'interface (`src/ui`) ne contient pas de
  logique métier.
- Le CRM n'est pas réécrit. Il partage avec le Designer la session Supabase
  et l'identifiant du chantier ; le seul ajout côté CRM sera un lien vers le
  projet de conception.
- Les tests du CRM (`tests/`), de l'atelier et du Designer tournent à chaque
  pull request (`.github/workflows/tests.yml`) : barrière de non-régression.

## Conséquences

- Une étape de compilation existe désormais, mais limitée au Designer ; le
  CRM garde son fonctionnement (un fichier, JSX précompilé au déploiement).
- Les sessions de travail installent les dépendances du Designer
  (`cd designer && npm install`).
