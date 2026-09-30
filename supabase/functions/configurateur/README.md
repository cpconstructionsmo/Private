# Espace « choix client » (configurateur)

Le client reçoit un **lien personnel**. Il y voit les choix que vous avez
publiés pour son dossier, compose son panier (inclus, plus-values,
moins-values, à chiffrer) face à son budget, et vous l'envoie. Vous relevez
ses choix dans l'onglet MAP, vous les vérifiez, puis vous les reprenez.

Ce qui protège le dossier :

- **Le client n'a jamais accès à la base.** Il ne connaît qu'un jeton
  aléatoire. Seule la fonction `configurateur` sait le vérifier, et elle ne
  renvoie que le catalogue publié pour **son** dossier. `app_data` n'est
  jamais lu ni exposé.
- **Les prix sont recalculés côté serveur**, à partir du catalogue publié
  (`calcul.js`). Un prix envoyé par le navigateur est ignoré.
- **Chaque version des prix est numérotée.** Un panier garde la version sur
  laquelle il a été calculé. Il n'est jamais réécrit : chaque
  enregistrement est une nouvelle version.
- **Aucun marché signé n'est modifié.** Les choix repris vont dans la MAP et
  dans le suivi (« à chiffrer », « décision »), après votre vérification.
- **Aucun secret dans le dépôt.** La clé de service reste dans les secrets
  du projet Supabase, que la fonction lit à l'exécution.

Tant que les trois étapes ci-dessous ne sont pas faites, l'application le
dit (« espace client non installé »). Elle ne présente jamais une
publication comme réussie si elle a échoué.

## 1. Créer les tables (une fois)

1. Ouvrez Supabase, projet `gxfrughmwkvdepvkhufv`, menu **SQL Editor**.
2. Collez le contenu de [`schema.sql`](schema.sql), puis cliquez **Run**.

Deux tables sont créées :

- `config_espaces` : un espace par dossier, avec le catalogue publié.
- `config_paniers` : les versions successives du panier du client.

Aucune règle n'est prévue pour le rôle anonyme. Si `app_data` est limitée à
certaines adresses e-mail, reprenez la même condition dans les règles
`authenticated` du script.

## 2. Déployer la fonction

Depuis un clone du dépôt, avec le CLI Supabase déjà lié (voir
`../send-chiffrage-email/README.md`, étape 2) :

```sh
npx supabase functions deploy configurateur --no-verify-jwt --project-ref gxfrughmwkvdepvkhufv
```

`--no-verify-jwt` est voulu : le client n'a pas de compte. C'est le jeton
du lien, vérifié par la fonction, qui ouvre l'accès. Les variables
`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournies automatiquement
par Supabase à la fonction : il n'y a rien à saisir.

## 3. Vérifier

Dans l'application, ouvrez un dossier fictif, onglet **MAP**, carte
**Choix du client en ligne** :

1. Préparez un catalogue de deux ou trois choix.
2. Publiez-le, puis ouvrez le lien dans une fenêtre privée.
3. Composez un panier et envoyez-le.
4. Revenez dans l'application et cliquez **Relever les choix**.

En cas de souci :

```sh
npx supabase functions logs configurateur --project-ref gxfrughmwkvdepvkhufv
```

## Après une modification de `index.ts` ou de `calcul.js`

Redéployez la fonction (commande de l'étape 2). `calcul.js` a une copie
dans `index.html` (`configCalculer`). Le test `tests/t_configurateur.js`
vérifie que les deux calculent la même chose : modifiez-les ensemble.
