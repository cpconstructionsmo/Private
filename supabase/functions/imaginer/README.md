# La fonction du relevé de visite (`imaginer`)

Une seule fonction Supabase pour quatre services du relevé de visite :

- **✨ Imaginer** (étape Pièces et photos) : la photo d'une pièce et la
  consigne du métreur partent à Gemini ; la pièce rénovée revient et se
  range avec la visite, à côté de la photo d'origine.
- **🎙 Assistant de visite** (action `structurer`) : le métreur raconte la
  visite d'un trait ; Gemini en tire les champs de la fiche (client, projet,
  pièces…). C'est une proposition : le relevé la vérifie champ par champ
  (`releve/assistant.js`) et le métreur coche ce qu'il reprend.
- **🔍 Décrire** (action `decrire`) : sous une photo de pièce, Gemini propose
  une légende courte (posée seulement si la légende est vide) et des
  constats utiles au chiffrage (état, matériaux, vigilance), qui s'ajoutent
  aux notes de la pièce d'un geste ; dans l'assistant, **« 📷 Lire une note
  manuscrite »** recopie une note photographiée à la suite de la dictée.
  **« 🖼 Plan 2D »** (mode `plan`, image ou PDF) relève les pièces d'un plan
  déjà fait (magicplan, architecte) pour le dessin rapide.
  **« 🗺 Plan du terrain »** (mode `terrain`) relève les cotes d'un plan de
  géomètre ou d'une esquisse ; **Imaginer** accepte aussi la photo d'un
  terrain (la maison neuve dessus, `mode:'terrain'`) ou d'une façade
  (l'agrandissement, `mode:'facade'`).
- **🤖 Règlement PLU** (action `reglement`) : la fonction télécharge le
  règlement de la zone (PDF publié sur la Géoplateforme, et seulement là) et
  Gemini en extrait les règles d'une maison (hauteur, emprise, reculs…).
  Compté avec les dictées.
  Compté avec les dictées.
- **🔗 Dossier envoyé au client** (action `partage`) : le client ouvre son
  dossier par un lien personnel (`releve/partage.html#t=<jeton>`, 30 jours),
  sans compte. La fonction rend le dossier gardé (table `releve_partages`)
  et des liens d'une heure vers ses photos.

Ce qui protège :

- **La clé de Google n'est jamais dans le dépôt ni dans le navigateur.**
  Elle est rangée dans les secrets de Supabase. Seule la fonction `imaginer`
  la lit.
- **Il faut être connecté** (le même compte que le suivi) pour Imaginer et
  l'assistant. Seul le dossier partagé s'ouvre sans compte, avec le jeton
  du lien : seule son empreinte est en base, le lien expire et se retire.
- **Le nombre d'appels est limité** : 30 images et 100 dictées ou photos décrites par personne
  et par jour (réglables). Les compteurs sont dans la table
  `releve_ia_usage`, que seule la fonction lit et écrit.
- La fonction ne garde rien. L'image part dans l'espace privé `releves`,
  comme les autres photos de la visite.

Coût indicatif : quelques centimes par image, facturés par Google sur le
compte de la clé (à vérifier sur la page des tarifs de Google AI Studio).

Tant que les trois étapes ci-dessous ne sont pas faites, le bouton répond
« Imaginer n'est pas encore installé ». Rien d'autre ne change.

## 1. Créer les tables (une fois, puis à chaque mise à jour)

Supabase › **SQL Editor** : collez [`schema.sql`](schema.sql), puis **Run**.
Il se relance sans risque (rien n'est effacé) : compteurs (`releve_ia_usage`,
colonne `nb_texte` pour l'assistant) et dossiers partagés
(`releve_partages`).

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
- `IMAGINER_LIMITE_TEXTE` : dictées de l'assistant par personne et par jour
  (100 par défaut).
- `IMAGINER_MODELE_TEXTE` : un modèle texte de Gemini à essayer en premier
  pour l'assistant.
- `IMAGINER_MODELE` : un modèle d'image de Gemini à essayer en premier
  (sinon la liste de `regles.js`, du plus récent au plus ancien ; un modèle
  retiré par Google passe au suivant tout seul).

## 3. Déployer la fonction

**Mettre à jour une fonction déjà installée** : Edge Functions › `imaginer`
› onglet **Code** : remplacez tout le code par le nouveau fichier unique,
puis **Deploy**. Le nom et les secrets ne changent pas.

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
