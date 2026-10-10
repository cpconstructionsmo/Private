# ADR-0007 — États existant et projeté (rénovation, extension)

Statut : acceptée — 2026-10-10

## Contexte

CP Constructions rénove et agrandit des maisons existantes. Un dossier
d'extension montre ce qui existe, ce qui est démoli et ce qui est construit ;
la surface créée décide de la formalité (déclaration préalable ou permis) et
le chiffrage ne porte que sur les travaux. Jusqu'ici, tout mur du Designer
était à construire.

## Décision

- **L'état est une donnée saisie de l'ouvrage**, facultative : `Wall.phase`
  et `Opening.phase` valent `existing` (existant conservé) ou `demolished`
  (existant à démolir ; une baie : bouchée ou déposée). Sans état, l'ouvrage
  est à construire. Un projet de construction neuve n'en porte aucun et reste
  valable tel quel (pas de migration).
- **Le modèle est l'état projeté.** Un mur à démolir n'est pas un mur bâti
  (`mursDroits` l'exclut, `mursDemolis` le donne, comme `mursFictifs` pour les
  cloisons fictives) : il n'entre ni dans les pièces, ni dans la 3D, les
  façades, les coupes, la toiture, le métré ou les fondations. Une baie
  supprimée ne perce plus son mur (`ouvertureBatie`). Le plan les dessine à
  part, en tirets ; l'existant conservé y est gris plein.
- **L'état existant se dérive** (`building/etats.ts`, `niveauExistant`,
  `projetExistant`) : le même niveau réduit aux murs et baies existants
  (les démolis redevenus existants), aux pièces, à la parcelle et ses abords.
  Rien n'est enregistré ; il suit chaque modification, comme le plan (cache
  par objet immuable).
- **Ce qui s'en déduit** : surfaces existantes, créées (projet − existant)
  et formalité indicative (`surfacesReglementaires(...).travaux`), métré des
  seuls travaux (démolition, bouchements, percements), fondations sous les
  seuls murs neufs. Les seuils cités restent « à vérifier » (règle de
  l'atelier : articles non lus sur Légifrance).
- **Cohérence imposée par les commandes** : une baie existante est dans un
  mur existant ; un mur ne repasse pas au projet tant qu'il porte des baies
  existantes ; un mur à démolir ne reçoit pas de nouvelle baie ; une cloison
  fictive n'a pas d'état.

## Conséquences

- Les calculs du projet n'ont rien à changer pour une construction neuve :
  sans état, `mursDroits` et les baies restent les mêmes.
- Les planches « état existant » (façades, coupes) se composent depuis
  l'état dérivé (étape suivante), sans second modèle à tenir à jour.
- Toute nouvelle vue qui parcourt les ouvertures doit passer par
  `ouvertureBatie` (ou par les baies du plan, qui le font déjà).
