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
