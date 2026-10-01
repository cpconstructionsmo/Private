# ADR-0002 — Unités, tolérances, géométrie et rendu

**Statut** : acceptée le 2026-10-01.

## Décision

- **Unités réelles** dans tout le modèle : millimètres (nombres), radians,
  altitudes par rapport au ±0,00 du niveau. Les pixels ne servent qu'à
  l'affichage. (Le plan électrique actuel, en coordonnées 0–1 sur une image,
  sera relié au Building Model par un adaptateur en Phase 8.)
- **Tolérances nommées** dans `src/geometry/tolerance.ts` (coïncidence
  0,01 mm, parallélisme 1e-9 rad) ; aucune comparaison de flottants avec un
  seuil écrit ailleurs.
- **Ce qui se saisit est stocké, ce qui se calcule est dérivé** : un mur =
  axe + épaisseur + justification ; son contour après jonctions, le polygone
  et la surface d'une pièce sont calculés et mis en cache, jamais stockés
  comme vérité (règle 1 : pas de divergence silencieuse entre vues).
- **Opérations booléennes** (union, différence, découpe) en entiers
  (1 unité = 0,01 mm) par une bibliothèque éprouvée (Clipper2), plutôt
  qu'une implémentation maison en flottants.
- **Pièces** : faces du graphe planaire bâti sur les faces intérieures des
  murs ; une pièce est retrouvée après modification par son point
  intérieur (`seed`), ce qui conserve son nom et son usage. Une pièce non
  fermée est signalée, jamais devinée.
- **Rendu Canvas 2D** avec index spatial (R-tree) pour la sélection et
  l'accrochage : plusieurs milliers d'objets restent fluides, ce qu'un SVG
  par objet ne permet pas.
- **Tests numériques** obligatoires : valeurs exactes (rectangle 10 × 8 m →
  80,00 m²), cas dégénérés, et tests de propriétés (invariance par rotation
  et translation, annuler(appliquer(x)) = x).
