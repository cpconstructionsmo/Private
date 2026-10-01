# ADR-0004 — L'atelier Python : garder, importer, puis converger

**Statut** : acceptée le 2026-10-01.

## Contexte

`atelier/` (local, sur le Mac) interprète un RDC en DXF ou PDF vectoriel,
calcule surfaces réglementaires, toiture à croupes, terrain et implantation,
et produit le dossier PCMI. Il a son propre modèle versionné (pydantic)
avec statut et source sur chaque valeur. Deux moteurs géométriques (Python
et TypeScript) violeraient à terme la règle 1.

## Décision

1. L'atelier reste en service pour les permis en cours.
2. Il devient l'**importeur** DXF / PDF du Designer (Phase 1 bis) : son
   interprétation est convertie en Building Model, avec la correspondance
   des statuts (`confirme → confirmed`, `hypothese → to_check` ou
   `proposed`, `impossible → to_check` avec la donnée manquante).
3. Ses calculs (surfaces, toiture, terrain, contrôles PLU) sont portés dans
   les moteurs TypeScript aux Phases 5 à 7, **comparés sur les mêmes cas
   de test**, puis retirés de l'atelier.
4. Le Geometry Engine du Designer est alors la seule vérité dimensionnelle.
