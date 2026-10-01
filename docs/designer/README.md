# CP Designer — décisions d'architecture (ADR)

La spécification produit de référence (*CP Constructions Designer — Master
Product Specification V3*) et le rapport d'audit de la Phase 0 sont conservés
**hors dépôt** (Drive de CP Constructions) : le dépôt est public et publié en
entier sur GitHub Pages. Seules les décisions techniques sont versionnées ici.

| ADR | Décision | Statut |
|---|---|---|
| [0001](ADR-0001-module-separe.md) | Le Designer est un module séparé du CRM, en TypeScript compilé au déploiement | Acceptée — 2026-10-01 |
| [0002](ADR-0002-geometrie.md) | Unités réelles (mm), tolérances nommées, booléens en entiers, rendu Canvas 2D | Acceptée — 2026-10-01 |
| [0003](ADR-0003-persistance.md) | Tables Supabase dédiées, ChangeSets et révisions, concurrence optimiste | Acceptée — 2026-10-01 |
| [0004](ADR-0004-atelier.md) | L'atelier Python est gardé, devient importeur, puis converge vers le Designer | Acceptée — 2026-10-01 |
| [0005](ADR-0005-commandes.md) | Toute modification est une commande qui produit un ChangeSet, dès la Phase 1 | Acceptée — 2026-10-01 |

Une nouvelle décision, ou une demande qui contredirait l'une d'elles ou les
7 règles de la spécification, fait l'objet d'un nouvel ADR — jamais d'une
logique isolée dans le code.
