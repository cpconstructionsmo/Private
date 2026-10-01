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
  qu'une implémentation maison en flottants. Portage retenu : `clipper2-ts`
  (licence Boost, sans dépendance, maintenu ; version figée dans
  `package-lock.json`), utilisé seulement dans `src/geometry/booleen.ts`.
  Le résultat est relu dans l'arbre de Clipper : contour trigonométrique,
  trous horaires, île dans un trou = polygone à part.
- **Murs** : le contour d'un mur se calcule sommet par sommet ; les murs
  qui s'y rejoignent (L, Y, croix) ou qui aboutissent sur le corps d'un
  autre (T) sont triés par angle, et la face gauche de l'un coupe la face
  droite du suivant : onglet exact, murs disjoints (somme des murs =
  maçonnerie). Angle trop aigu : coupe d'équerre.
- **Pièces** (précisé à l'étape 3) : ce sont les **vides fermés** de
  l'union des contours de murs (ses trous), calculés en entiers. Les
  ouvertures ne coupent pas les murs pour ce calcul : une porte ne réunit
  pas deux pièces. Un vide est rattaché à la pièce nommée dont le point
  intérieur (`seed`) y tombe, ce qui conserve son nom et son usage après
  modification. Vide sans pièce : « à nommer » ; pièce dont le point n'est
  dans aucun vide : « non fermée » ; deux pièces dans un vide : signalé.
  Rien n'est deviné. (Les faces du graphe planaire restent disponibles pour
  lire un tracé importé.)
- **Rendu Canvas 2D** avec index spatial (R-tree) pour la sélection et
  l'accrochage : plusieurs milliers d'objets restent fluides, ce qu'un SVG
  par objet ne permet pas.
- **Tests numériques** obligatoires : valeurs exactes (rectangle 10 × 8 m →
  80,00 m²), cas dégénérés, et tests de propriétés (invariance par rotation
  et translation, annuler(appliquer(x)) = x).

## Complément (Phase 1 bis) : la maçonnerie est une union « soudée »

Sur un mur oblique, une cloison en T touche la face de son mur en des points
que la grille des entiers (0,01 mm) peut écarter d'un centième : l'union
exacte laisserait un jour invisible, et deux pièces communiqueraient. La
maçonnerie d'un niveau est donc une **fermeture** : chaque mur dilaté de
`JEU_SOUDURE` (0,05 mm, `src/geometry/tolerance.ts`), union, puis
rétractation du même jeu, angles en onglet. Les jours de moins de 0,1 mm
disparaissent ; aucun vrai jour de mur n'est si fin. Les surfaces des tests
exacts (76,44 m², 7,20 m², propriétés sur 1 000 tours de murs) sont
inchangées.
