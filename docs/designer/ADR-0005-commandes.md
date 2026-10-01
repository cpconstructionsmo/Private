# ADR-0005 — Commandes, historique et ChangeSets dès la Phase 1

**Statut** : acceptée le 2026-10-01.

## Décision

- Toute modification du modèle passe par une **commande** typée et validée
  (`createWall`, `moveWall`, `addOpening`, `setDimension`…), qui produit des
  **opérations inversibles**.
- Une action composée (une pièce de quatre murs ; plus tard une action de
  l'IA) est **une transaction** : un seul « Annuler ».
- Après « Annuler », le modèle est identique, octet pour octet (JSON aux
  clés triées), à l'état d'avant — vérifié par les tests.
- Les opérations d'une transaction forment le **ChangeSet** enregistré
  (ADR-0003). C'est la même interface qu'utilisera l'IA (Phase 4) :
  bac à sable, Impact Analyzer, validation par l'utilisateur, puis
  enregistrement (règle 6). L'IA n'écrit jamais directement dans le modèle.

## Complément (Phase 1, étape 5) : contraintes et cotes motrices

- Une commande qui déplace de la géométrie (déplacer un mur ou un sommet,
  modifier une cote motrice, ajouter une contrainte) passe par un
  **solveur déterministe** (`designer/src/building/contraintes.ts`) : les
  sommets touchés sont épinglés, les autres s'ajustent par le plus petit
  déplacement pondéré (les murs voisins avant le reste du plan).
- Le résultat entre dans **le même ChangeSet** que la commande : un seul
  « Annuler » rend le plan d'avant, murs ajustés compris.
- Une contrainte ou une cote motrice qui ne peut plus être respectée fait
  **refuser** la commande, avec sa raison ; elle n'est jamais violée en
  silence.
- Un champ effacé par une modification s'écrit `null` dans le ChangeSet,
  pour que l'annulation d'un ChangeSet relu du journal (JSON) soit exacte.
