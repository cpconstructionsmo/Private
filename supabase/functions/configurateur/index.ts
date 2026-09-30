// L'espace « choix client » : la seule porte entre le client et la base.
//
// Le client ouvre un lien personnel (client.html#t=<jeton>). La page appelle
// cette fonction avec ce jeton ; la fonction en calcule l'empreinte, retrouve
// l'espace de son dossier, et ne renvoie que ce qui y a été publié — jamais
// app_data, jamais un autre dossier.
//
// Les prix ne viennent jamais du navigateur : la fonction recalcule chaque
// panier à partir du catalogue publié (calcul.js, la même règle que
// l'application), et l'enregistre comme une nouvelle version, avec la
// version de prix sur laquelle il a été calculé. Un marché signé n'est
// jamais touché : les choix remontent dans l'application, où ils sont
// vérifiés avant d'être repris dans la MAP.
//
// Déploiement : voir README.md (même dossier).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { configCalculer } from './calcul.js';

const URL_SUPABASE = Deno.env.get('SUPABASE_URL');
const CLE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } });

const empreinte = async (jeton: string) => {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jeton));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reponse({ erreur: 'methode' }, 405);
  if (!URL_SUPABASE || !CLE_SERVICE) return reponse({ erreur: 'non_configure' }, 500);

  const brut = await req.text();
  if (brut.length > 50000) return reponse({ erreur: 'trop_long' }, 413);
  let corps: Record<string, unknown>;
  try { corps = JSON.parse(brut); } catch { return reponse({ erreur: 'json' }, 400); }

  // un jeton de 32 octets en base64url : 43 caractères
  const jeton = String(corps?.t ?? '');
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(jeton)) return reponse({ erreur: 'lien_invalide' }, 404);

  const db = createClient(URL_SUPABASE, CLE_SERVICE, { auth: { persistSession: false } });
  const { data: espace, error } = await db.from('config_espaces')
    .select('id, publie, prix_version, statut, rouvert_le, expire_le')
    .eq('jeton_hash', await empreinte(jeton)).maybeSingle();
  if (error) return reponse({ erreur: 'base' }, 500);
  // lien inconnu ou expiré : la même réponse, pour ne rien laisser deviner
  if (!espace || (espace.expire_le && new Date(espace.expire_le) < new Date())) return reponse({ erreur: 'lien_invalide' }, 404);

  const { data: derniers } = await db.from('config_paniers')
    .select('version, prix_version, lignes, calcul, statut, cree_le')
    .eq('espace_id', espace.id).order('version', { ascending: false }).limit(1);
  const dernier = (derniers && derniers[0]) || null;
  const verrouille = !!dernier && dernier.statut === 'envoye'
    && !(espace.rouvert_le && new Date(espace.rouvert_le) > new Date(dernier.cree_le));
  const publie = { ...(espace.publie || {}), prixVersion: espace.prix_version };

  if (corps.action === 'lire') {
    return reponse({ publie, statut: espace.statut, verrouille, panier: dernier });
  }

  if (corps.action === 'enregistrer') {
    if (espace.statut !== 'ouvert') return reponse({ erreur: 'clos' }, 403);
    if (verrouille) return reponse({ erreur: 'deja_envoye' }, 409);
    const calcul = configCalculer(publie, corps.lignes);
    if (calcul.erreurs.length) return reponse({ erreur: 'panier_invalide', details: calcul.erreurs }, 400);
    const version = ((dernier && dernier.version) || 0) + 1;
    const lignes = calcul.lignes.map((l: { optionId: string; quantite: number }) => ({ optionId: l.optionId, quantite: l.quantite }));
    const statut = corps.envoyer === true ? 'envoye' : 'brouillon';
    const { error: e2 } = await db.from('config_paniers').insert({
      espace_id: espace.id, version, prix_version: espace.prix_version, lignes, calcul, statut,
    });
    // deux enregistrements simultanés : le second échoue sur (espace, version)
    if (e2) return reponse({ erreur: 'conflit' }, 409);
    return reponse({ ok: true, version, statut, calcul });
  }

  return reponse({ erreur: 'action' }, 400);
});
