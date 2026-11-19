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

1. Ouvrez **aistudio.google.com/apikey**, avec le compte Google de
   l'entreprise.
2. Prenez une clé d'un projet **dont la facturation est active** (colonne
   « Niveau de facturation » : « Niveau 1 », pas « Niveau sans frais ») :
   les images ne sont pas comprises dans l'offre gratuite. Sinon, « Créer
   une clé API » sur ce projet.
3. Copiez-la avec l'icône « copier » de sa ligne.
4. Supabase › **Edge Functions › Secrets**
   (`…/project/<projet>/functions/secrets`) : Name `GEMINI_API_KEY`,
   Value : la clé, **Save**. Elle doit apparaître sous « Custom secrets ».

Ne collez la clé nulle part ailleurs, et ne faites jamais de capture d'écran
où elle est affichée en clair (l'œil du champ « Value » la montre). Une clé
qui a circulé se remplace : nouvelle clé, même nom de secret, Save, puis
suppression de l'ancienne dans AI Studio.

Réglages facultatifs, dans les mêmes secrets :

- `IMAGINER_LIMITE_JOUR` : images par personne et par jour (30 par défaut).
- `IMAGINER_MODELE` : un modèle d'image de Gemini à essayer en premier
  (sinon la liste de `regles.js`, du plus récent au plus ancien ; un modèle
  retiré par Google passe au suivant tout seul).

## 3. Déployer la fonction

**Sans terminal (tableau de bord Supabase)** : Edge Functions › **Deploy a
new function** › **Via Editor**. Collez **un seul fichier** : `regles.js`
puis `index.ts` mis bout à bout (sans les `export` de `regles.js` ni la
ligne `import … from './regles.js'` d'`index.ts`). Dans **Function name**,
en bas, remplacez le nom proposé au hasard (`super-function`…) par
**`imaginer`** : sinon l'application reçoit une erreur 404. Puis **Deploy
function**.

**Avec le terminal** :

```sh
npx supabase functions deploy imaginer --no-verify-jwt --project-ref gxfrughmwkvdepvkhufv
```

**« Verify JWT » doit être désactivé** (`--no-verify-jwt`, ou la case dans
les réglages de la fonction) : avec les nouvelles clés du projet
(`sb_publishable_…`), le contrôle de Supabase refuse l'appel avant la
fonction, sans réponse lisible par le navigateur (« pas de réponse du
serveur »). La fonction vérifie elle-même que l'appelant est connecté
(`auth.getUser`) : elle reste réservée aux comptes de CP Constructions.

## En cas de souci

Dans le navigateur (F12 › Network), la ligne `imaginer` donne le code :

- **404** : aucune fonction de ce nom (vérifier la liste des Edge Functions) ;
- **401** sur la ligne « preflight » : « Verify JWT » encore actif ;
- **500, « pas encore installé »** : un secret manque ; le message de
  l'application nomme lequel (`GEMINI_API_KEY`, en général).

## Vérifier

1. Dans le relevé, ouvrez une visite, étape **Pièces et photos**.
2. Sous une photo, **✨ Imaginer**, tapez « murs blancs, parquet chêne
   clair », puis **Créer l'image**.
3. L'image apparaît sous la photo, marquée « ✨ Imaginé ».

En cas de souci :

```sh
npx supabase functions logs imaginer --project-ref gxfrughmwkvdepvkhufv
```
