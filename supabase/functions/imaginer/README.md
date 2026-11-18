# « Imaginer » : la pièce rénovée, d'après sa photo

Dans le relevé de visite (étape **Pièces et photos**), le bouton
**✨ Imaginer** sous une photo envoie cette photo et la consigne du métreur
(tapée ou dictée) à Gemini, de Google. L'image de la pièce rénovée revient
et se range avec la visite, à côté de la photo d'origine.

Ce qui protège :

- **La clé de Google n'est jamais dans le dépôt ni dans le navigateur.**
  Elle est rangée dans les secrets de Supabase. Seule la fonction `imaginer`
  la lit.
- **Il faut être connecté** (le même compte que le suivi).
- **Le nombre d'images est limité** : 30 par personne et par jour (réglable).
  Le compteur est dans la table `releve_ia_usage`, que seule la fonction lit
  et écrit.
- La fonction ne garde rien. L'image part dans l'espace privé `releves`,
  comme les autres photos de la visite.

Coût indicatif : quelques centimes par image, facturés par Google sur le
compte de la clé (à vérifier sur la page des tarifs de Google AI Studio).

Tant que les trois étapes ci-dessous ne sont pas faites, le bouton répond
« Imaginer n'est pas encore installé ». Rien d'autre ne change.

## 1. Créer la table (une fois)

Supabase › **SQL Editor** : collez [`schema.sql`](schema.sql), puis **Run**.

## 2. La clé de Google

1. Ouvrez **aistudio.google.com**, connectez-vous avec le compte Google de
   l'entreprise.
2. **Get API key** › **Create API key**. Copiez la clé.
3. La facturation doit être activée sur ce projet Google (les images ne sont
   pas comprises dans l'offre gratuite) : AI Studio le propose à côté de la
   clé.
4. Supabase › **Edge Functions** › **Secrets** (ou *Project Settings ›
   Edge Functions*) : ajoutez `GEMINI_API_KEY` avec la clé copiée.

Ne collez la clé nulle part ailleurs (ni dans un message, ni dans un fichier).

Réglages facultatifs, dans les mêmes secrets :

- `IMAGINER_LIMITE_JOUR` : images par personne et par jour (30 par défaut).
- `IMAGINER_MODELE` : un modèle d'image de Gemini à essayer en premier
  (sinon la liste de `regles.js`, du plus récent au plus ancien ; un modèle
  retiré par Google passe au suivant tout seul).

## 3. Déployer la fonction

```sh
npx supabase functions deploy imaginer --project-ref gxfrughmwkvdepvkhufv
```

Sans `--no-verify-jwt` : seul un utilisateur connecté peut l'appeler.

## Vérifier

1. Dans le relevé, ouvrez une visite, étape **Pièces et photos**.
2. Sous une photo, **✨ Imaginer**, tapez « murs blancs, parquet chêne
   clair », puis **Créer l'image**.
3. L'image apparaît sous la photo, marquée « ✨ Imaginé ».

En cas de souci :

```sh
npx supabase functions logs imaginer --project-ref gxfrughmwkvdepvkhufv
```
