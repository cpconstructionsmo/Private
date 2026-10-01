# Validation du plan électrique en ligne

Depuis le plan électrique, **Envoyer pour validation** publie le plan (indice
en cours) et crée un lien personnel. Le client, avec ce lien, peut :

- voir le plan, zoomer ;
- cliquer un équipement pour en lire la fiche ;
- laisser une remarque, sur un équipement ou un point du plan ;
- valider l'indice publié, en indiquant son nom.

Il ne peut pas modifier le plan. Ses remarques reviennent dans
l'application, où vous les traitez. Toute modification passe par vous et
donne un nouvel indice, à republier.

Ce qui protège le dossier :

- **Le client n'a jamais accès à la base.** Il ne connaît qu'un jeton
  aléatoire. Seule la fonction `plan-validation` sait le vérifier, et elle ne
  renvoie que la publication de **son** dossier.
- **Le fond du plan** est servi par une adresse temporaire (une heure). Le
  stockage n'est jamais ouvert.
- **Aucune règle** n'est prévue pour le rôle anonyme. **Aucun secret** n'est
  dans le dépôt.

Tant que les deux étapes ci-dessous ne sont pas faites, l'application
affiche « validation en ligne non installée ». Rien n'est présenté comme
publié.

## 1. Créer les tables (une fois)

Supabase › **SQL Editor** : collez [`schema.sql`](schema.sql), puis **Run**.

## 2. Déployer la fonction

```sh
npx supabase functions deploy plan-validation --no-verify-jwt --project-ref gxfrughmwkvdepvkhufv
```

Comme pour le configurateur, c'est le jeton du lien qui ouvre l'accès : le
client n'a pas de compte.

**Plan à plusieurs niveaux (RDC, étage…)** : redéployez la fonction (même
commande) après la mise à jour du 2026-10-01. Sans cela, le client voit le
plan du RDC, mais les autres niveaux s'affichent « Fond du plan
indisponible ». Les tables ne changent pas.

## Vérifier

1. Sur un dossier fictif, ouvrez le plan électrique.
2. Cliquez **Envoyer pour validation**.
3. Ouvrez le lien dans une fenêtre privée.
4. Laissez une remarque, puis validez.
5. Revenez dans l'application : **Relever les remarques**.

En cas de souci :

```sh
npx supabase functions logs plan-validation --project-ref gxfrughmwkvdepvkhufv
```
