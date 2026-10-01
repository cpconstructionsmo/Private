# CP Designer

Module de conception de CP Constructions, **séparé du suivi de chantiers**
(`index.html`) : voir les décisions d'architecture dans
[`docs/designer/`](../docs/designer/README.md).

État : **Phase 1, étape 1 faite — Geometry Engine** (`src/geometry/`) :
vecteurs, prédicats tolérants, segments (projection, distance,
intersection : croisement, contact, chevauchement), décalage de polylignes
(faces d'un mur, onglet et biseau), opérations booléennes en entiers
(Clipper2), faces d'un graphe planaire (pièces lues dans un tracé, îles,
murs pendants ignorés), aire, périmètre, centre de gravité. Tests exacts et
tests de propriétés (1 000 cas par propriété).

**Étape 2 faite — modèle et commandes** (`src/model/`, `src/engine/`) :
identifiants stables (ULID), création d'un projet, sérialisation canonique
(clés triées : annuler se vérifie octet pour octet), migrations de schéma
testées sur un instantané figé (`tests/fixtures/projet_v1.json`),
opérations inversibles, commandes validées (murs, ouvertures, pièces,
niveaux, suppression en cascade), historique annuler / rétablir et
transactions (une action composée = un seul « annuler »), ChangeSets
datés et signés. Étape suivante : murs (jonctions), pièces détectées,
ouvertures et métré des baies.

## Travailler

```
cd designer
npm install
npm test            # tests Vitest (tests/**/*.test.ts)
npm run typecheck   # TypeScript strict
npm run dev         # page locale (Vite)
npm run build       # compilation dans build/ (faite aussi au déploiement)
```

## Organisation

| Dossier | Rôle |
|---|---|
| `src/model/` | CP Building Model : types, identifiants, schéma, migrations, sérialisation |
| `src/geometry/` | Geometry Engine : tolérances, primitives, prédicats, booléens, aires, accrochage, contraintes |
| `src/building/` | Murs (jonctions), pièces (détection), ouvertures, cotes, niveaux — Phase 1 |
| `src/engine/` | Commandes, historique, ChangeSets, dépendances — Phase 1 |
| `src/persistence/` | Supabase (tables dédiées), copie locale, export — Phase 1 |
| `src/ui/` | Canvas, outils, inspecteur — Phase 1 |
| `tests/` | `unit/`, `property/`, `metier/`, `e2e/` |

## Ce que la Phase 1 doit prouver (tests automatisés)

1. Rectangle 10 × 8 m → 80,00 m² ; murs de 20 cm à l'axe → pièce de 76,44 m².
2. Une cloison coupe une pièce en deux, surfaces exactes (± 0,01 m²) ;
   la déplacer recalcule les deux pièces, nom et usage conservés.
3. Une ouverture suit son mur et ne peut pas le dépasser ; 2,40 → 3,50 m
   mis à jour dans le plan et le métré.
4. Une cote motrice modifiée déplace réellement le mur.
5. Accrochage (extrémité, milieu, intersection, axe, face, perpendiculaire,
   grille ; Alt le désactive) en moins de 5 ms pour 2 000 objets.
6. Contraintes (horizontal, vertical, parallèle, perpendiculaire, longueur et
   angle fixes) respectées après déplacement.
7. Plusieurs niveaux (altitude, hauteur) ; fond PDF ou image calé, verrouillé.
8. Annuler / rétablir sur 100 pas, modèle identique octet pour octet ; une
   action composée s'annule en une fois.
9. Enregistrer puis recharger : identique ; écriture concurrente refusée,
   jamais écrasée ; reprise après plantage ; migration de schéma testée.
10. Statut et provenance sur chaque objet ; « porteur » jamais confirmé sans
    document.
11. Non-régression : toutes les suites du CRM passent, et le CRM fonctionne
    si le Designer est absent ; aucune donnée du Designer dans `app_data`.
