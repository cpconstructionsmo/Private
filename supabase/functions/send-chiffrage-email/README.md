# Envoi automatique de l'avis de chiffrage

Cette fonction envoie directement l'e-mail « Chiffrage validé » à
`contact@cpconstructions.fr`, sans passer par l'application de messagerie de
l'appareil. Elle tourne sur Supabase (Edge Functions) et expédie via
[Resend](https://resend.com).

Trois choses à faire une seule fois, avant qu'elle ne fonctionne :

## 1. Compte Resend et domaine vérifié

1. Créez un compte sur [resend.com](https://resend.com) (l'offre gratuite —
   3 000 e-mails/mois — suffit largement pour cet usage).
2. Dans **Domains**, ajoutez `cpconstructions.fr` et suivez les instructions :
   Resend donne 3 à 4 enregistrements DNS (TXT/CNAME, pour SPF et DKIM) à
   ajouter chez votre hébergeur de nom de domaine (celui où sont gérés vos
   DNS — souvent le même endroit que le site cpconstructions.fr). Sans ce
   domaine vérifié, l'envoi échouera : Resend refuse d'expédier au nom d'un
   domaine qu'il ne peut pas prouver que vous contrôlez.
3. Une fois le domaine marqué « Verified » (peut prendre de quelques minutes
   à quelques heures selon votre hébergeur DNS), créez une clé API dans
   **API Keys** — droits d'envoi seuls suffisent. Copiez-la : elle ne sera
   plus jamais affichée en entier ensuite.

## 2. Installer et lier le CLI Supabase

Depuis un ordinateur, avec [Node.js](https://nodejs.org) installé :

```sh
npm install -g supabase
supabase login
```

(`supabase login` ouvre une page dans le navigateur pour vous connecter à
votre compte Supabase — celui qui gère déjà `gxfrughmwkvdepvkhufv`.)

Puis, dans un dossier local contenant ce fichier (donc un clone du dépôt
`Private`) :

```sh
supabase link --project-ref gxfrughmwkvdepvkhufv
```

## 3. Enregistrer la clé et déployer

```sh
supabase secrets set RESEND_API_KEY=re_votre_cle_ici --project-ref gxfrughmwkvdepvkhufv
supabase functions deploy send-chiffrage-email --project-ref gxfrughmwkvdepvkhufv
```

La clé ne transite jamais par l'application ni par ce dépôt : elle reste
côté serveur, dans les secrets du projet Supabase.

## Vérifier que ça fonctionne

Depuis l'application, ouvrez un prospect déjà chiffré et cliquez
« Renvoyer l'avis ». En cas de souci, `supabase functions logs
send-chiffrage-email --project-ref gxfrughmwkvdepvkhufv` montre les erreurs
récentes (domaine non vérifié, clé absente, etc.).

## Après une modification de `index.ts`

Toute modification de ce fichier (par exemple l'ajout récent de la pièce
jointe PDF) doit être republiée pour prendre effet :

```sh
npx supabase functions deploy send-chiffrage-email --project-ref gxfrughmwkvdepvkhufv
```

Sans ce redéploiement, la fonction en ligne continue de tourner avec
l'ancienne version — l'application, elle, se met à jour automatiquement dès
que la page est rechargée.

## Pour changer l'adresse d'expédition ou de réception

`FROM` et `DEST` sont en dur dans `index.ts`, volontairement : les modifier
demande de republier la fonction (`supabase functions deploy …`), ce qui
évite qu'un appel depuis l'app puisse un jour rediriger le courrier ailleurs.
