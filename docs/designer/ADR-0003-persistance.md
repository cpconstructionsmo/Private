# ADR-0003 — Persistance : tables dédiées, ChangeSets, révisions

**Statut** : acceptée le 2026-10-01.

## Contexte

`app_data` est une seule ligne JSON réécrite à chaque sauvegarde, avec une
fusion à trois branches entre appareils : adaptée à des listes, pas à des
milliers d'objets géométriques modifiés par plusieurs personnes.

## Décision

- **Rien du Designer dans `app_data`.** Trois tables
  (`supabase/designer/schema.sql`, à exécuter une fois au début de la
  Phase 1) :
  - `designer_projects` : le projet, son chantier CRM, sa révision courante,
    l'indication « en cours d'édition par… » ;
  - `designer_changesets` : le journal des modifications (qui, quand,
    opérations inversibles, impacts), en ajout seul ;
  - `designer_revisions` : instantanés complets du modèle, à intervalles et
    à chaque jalon (APS V1, PC, EXE…).
- **Concurrence optimiste** : `designer_enregistrer()` n'accepte un
  ChangeSet que si le projet est encore à la révision sur laquelle il a été
  préparé ; sinon l'écriture est refusée et l'écart est montré à
  l'utilisateur. Rien n'est écrasé en silence.
- **Hors ligne et plantage** : copie locale (IndexedDB) à chaque commande,
  reprise proposée au rechargement.
- **Migrations** : `schemaVersion` dans le modèle ; chaque migration est
  testée sur un instantané figé, avec copie avant migration.
- **Export complet** d'un projet en un fichier JSON (modèle, journal,
  références de fichiers).
- Droits : utilisateurs connectés, comme `app_data` ; aucun accès anonyme.
