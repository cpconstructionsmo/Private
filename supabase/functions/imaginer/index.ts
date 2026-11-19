// « Imaginer » (relevé de visite) : la photo d'une pièce, transformée en
// pièce rénovée par Gemini (Google), d'après la consigne du métreur.
//
// La clé de Google n'est que dans les secrets de Supabase (GEMINI_API_KEY) :
// jamais dans le dépôt ni dans le navigateur. Il faut être connecté (le même
// compte que le suivi) et le nombre d'images par personne et par jour est
// limité (IMAGINER_LIMITE_JOUR, 30 par défaut), pour tenir le coût.
// La fonction ne garde rien : l'image revient au relevé, qui la range avec
// la visite (espace privé « releves »), comme les autres photos.
//
// Déploiement : voir README.md (même dossier) — « Verify JWT » désactivé :
// la fonction vérifie elle-même l'utilisateur connecté (auth.getUser).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { lireDemande, requeteGemini, imageReponse, modeles, limiteJour } from './regles.js';

const URL_SUPABASE = Deno.env.get('SUPABASE_URL');
const CLE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CLE_GEMINI = Deno.env.get('GEMINI_API_KEY');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reponse({ erreur: 'methode' }, 405);
  // le nom (jamais la valeur) de ce qui manque, pour que l'écran le dise
  const manque = [!URL_SUPABASE && 'SUPABASE_URL', !CLE_SERVICE && 'SUPABASE_SERVICE_ROLE_KEY', !CLE_GEMINI && 'GEMINI_API_KEY'].filter(Boolean);
  if (manque.length) return reponse({ erreur: 'non_configure', manque }, 500);

  // un utilisateur connecté, et lui seul
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const db = createClient(URL_SUPABASE, CLE_SERVICE, { auth: { persistSession: false } });
  const { data: u, error: eu } = await db.auth.getUser(jwt);
  if (eu || !u?.user) return reponse({ erreur: 'non_connecte' }, 401);

  const brut = await req.text();
  if (brut.length > 6_500_000) return reponse({ erreur: 'image_trop_lourde' }, 413);
  let corps: Record<string, unknown>;
  try { corps = JSON.parse(brut); } catch { return reponse({ erreur: 'json' }, 400); }
  const d = lireDemande(corps);
  if ('erreur' in d) return reponse(d, 400);

  // le compteur du jour (heure de Paris)
  const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const limite = limiteJour(Deno.env.get('IMAGINER_LIMITE_JOUR'));
  const { data: compte } = await db.from('releve_ia_usage').select('nb').eq('jour', jour).eq('user_id', u.user.id).maybeSingle();
  const deja = compte?.nb || 0;
  if (deja >= limite) return reponse({ erreur: 'quota', limite }, 429);

  let derniere = '';
  for (const modele of modeles(Deno.env.get('IMAGINER_MODELE'))) {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + modele + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': CLE_GEMINI }, body: JSON.stringify(requeteGemini(d)),
    });
    if (r.status === 404) { derniere = 'modele_inconnu'; continue; }        // modèle renommé ou retiré : le suivant
    const json = await r.json().catch(() => ({}));
    if (!r.ok) return reponse({ erreur: r.status === 429 ? 'google_occupe' : 'google', statut: r.status, message: String(json?.error?.message || '').slice(0, 300) }, 502);
    const img = imageReponse(json);
    if ('erreur' in img) return reponse(img, 422);
    await db.from('releve_ia_usage').upsert({ jour, user_id: u.user.id, nb: deja + 1 }, { onConflict: 'jour,user_id' });
    return reponse({ image: img.image, mime: img.mime, modele, restant: limite - deja - 1 });
  }
  return reponse({ erreur: derniere || 'google' }, 502);
});
