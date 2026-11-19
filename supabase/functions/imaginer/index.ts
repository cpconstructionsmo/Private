// La fonction du relevé de visite (nom historique : « imaginer »). Quatre actions :
// - imaginer   : la photo d'une pièce, transformée en pièce rénovée par Gemini ;
// - structurer : l'assistant de visite — la dictée libre du métreur, rangée
//                en champs de fiche (une proposition, vérifiée par le relevé) ;
// - decrire    : une photo lue par Gemini — légende et constats d'une photo
//                de pièce, ou transcription d'une note manuscrite ;
// - partage    : le dossier client ouvert par le lien personnel (#t=<jeton>)
//                envoyé au client : seule action sans compte, le jeton suffit.
//
// La clé de Google n'est que dans les secrets de Supabase (GEMINI_API_KEY) :
// jamais dans le dépôt ni dans le navigateur. « imaginer », « structurer » et
// « decrire » exigent un utilisateur connecté (le même compte que le suivi) et sont
// limitées par personne et par jour (IMAGINER_LIMITE_JOUR, 30 images ;
// IMAGINER_LIMITE_TEXTE, 100 dictées ou photos décrites), pour tenir le coût.
//
// Déploiement : voir README.md (même dossier) — « Verify JWT » désactivé :
// la fonction vérifie elle-même l'utilisateur connecté (auth.getUser).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { lireDemande, requeteGemini, imageReponse, modeles, limiteJour,
  lireStructuration, requeteStructuration, jsonReponse, modelesTexte, limiteTexte,
  jetonValide, empreinte, cheminsDossier, lireDescription, requeteDescription, descriptionReponse } from './regles.js';

const URL_SUPABASE = Deno.env.get('SUPABASE_URL');
const CLE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CLE_GEMINI = Deno.env.get('GEMINI_API_KEY');
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } });
const jourParis = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

/* appel à Gemini, modèle après modèle : un modèle inconnu (404, renommé ou retiré) passe au suivant */
async function gemini(liste: string[], corps: unknown) {
  let derniere = 'google';
  for (const modele of liste) {
    const r = await fetch(GEMINI + modele + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': CLE_GEMINI as string }, body: JSON.stringify(corps),
    });
    if (r.status === 404) { derniere = 'modele_inconnu'; continue; }
    const json = await r.json().catch(() => ({}));
    if (!r.ok) return { erreur: r.status === 429 ? 'google_occupe' : 'google', statut: r.status, message: String(json?.error?.message || '').slice(0, 300) };
    return { json, modele };
  }
  return { erreur: derniere };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reponse({ erreur: 'methode' }, 405);
  // le nom (jamais la valeur) de ce qui manque, pour que l'écran le dise
  const manque = [!URL_SUPABASE && 'SUPABASE_URL', !CLE_SERVICE && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean);
  if (manque.length) return reponse({ erreur: 'non_configure', manque }, 500);

  const brut = await req.text();
  if (brut.length > 6_500_000) return reponse({ erreur: 'image_trop_lourde' }, 413);
  let corps: Record<string, unknown>;
  try { corps = JSON.parse(brut); } catch { return reponse({ erreur: 'json' }, 400); }
  const db = createClient(URL_SUPABASE as string, CLE_SERVICE as string, { auth: { persistSession: false } });
  const action = String(corps.action || 'imaginer');

  /* ---------- le dossier partagé : le jeton du lien, rien d'autre ---------- */
  if (action === 'partage') {
    // lien inconnu, expiré ou retiré : la même réponse, pour ne rien laisser deviner
    if (!jetonValide(corps.t)) return reponse({ erreur: 'lien_invalide' }, 404);
    const { data: pa, error } = await db.from('releve_partages')
      .select('id, donnees, expire_le, revoque, vues').eq('jeton_hash', await empreinte(String(corps.t))).maybeSingle();
    if (error) return reponse({ erreur: 'base' }, 500);
    if (!pa || pa.revoque || new Date(pa.expire_le) < new Date()) return reponse({ erreur: 'lien_invalide' }, 404);
    const chemins = cheminsDossier(pa.donnees);
    const urls: Record<string, string> = {};
    if (chemins.length) {
      const { data: s } = await db.storage.from('releves').createSignedUrls(chemins, 3600);
      (s || []).forEach((x: { path: string | null; signedUrl: string }) => { if (x.path && x.signedUrl) urls[x.path] = x.signedUrl; });
    }
    // l'équipe voit dans le relevé que le client a ouvert son dossier
    await db.from('releve_partages').update({ vues: (pa.vues || 0) + 1, vu_le: new Date().toISOString() }).eq('id', pa.id);
    return reponse({ dossier: pa.donnees, urls, expire_le: pa.expire_le });
  }

  /* ---------- les actions de l'équipe : un utilisateur connecté, et lui seul ---------- */
  if (!CLE_GEMINI) return reponse({ erreur: 'non_configure', manque: ['GEMINI_API_KEY'] }, 500);
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u, error: eu } = await db.auth.getUser(jwt);
  if (eu || !u?.user) return reponse({ erreur: 'non_connecte' }, 401);
  const jour = jourParis();

  if (action === 'structurer' || action === 'decrire') {
    const d = action === 'decrire' ? lireDescription(corps) : lireStructuration(corps);
    if ('erreur' in d) return reponse(d, 400);
    const limite = limiteTexte(Deno.env.get('IMAGINER_LIMITE_TEXTE'));
    // compteur à part des images (colonne nb_texte) ; une table sans cette colonne ne bloque pas l'assistant
    const { data: c, error: ec } = await db.from('releve_ia_usage').select('nb_texte').eq('jour', jour).eq('user_id', u.user.id).maybeSingle();
    const deja = ec ? 0 : (c?.nb_texte || 0);
    if (deja >= limite) return reponse({ erreur: 'quota', limite }, 429);
    const g = await gemini(modelesTexte(Deno.env.get('IMAGINER_MODELE_TEXTE')),
      action === 'decrire' ? requeteDescription(d as { image: string; mime: string; mode: string; piece: string }) : requeteStructuration(d));
    if ('erreur' in g) return reponse(g, 502);
    const f = action === 'decrire' ? descriptionReponse(g.json, (d as { mode: string }).mode) : jsonReponse(g.json);
    if ('erreur' in f) return reponse(f, 422);
    if (!ec) await db.from('releve_ia_usage').upsert({ jour, user_id: u.user.id, nb_texte: deja + 1 }, { onConflict: 'jour,user_id' });
    return reponse(action === 'decrire' ? { ...f, modele: g.modele, restant: limite - deja - 1 } : { fiche: (f as { fiche: unknown }).fiche, modele: g.modele });
  }

  /* ---------- imaginer : la pièce rénovée ---------- */
  const d = lireDemande(corps);
  if ('erreur' in d) return reponse(d, 400);
  const limite = limiteJour(Deno.env.get('IMAGINER_LIMITE_JOUR'));
  const { data: compte } = await db.from('releve_ia_usage').select('nb').eq('jour', jour).eq('user_id', u.user.id).maybeSingle();
  const deja = compte?.nb || 0;
  if (deja >= limite) return reponse({ erreur: 'quota', limite }, 429);
  const g = await gemini(modeles(Deno.env.get('IMAGINER_MODELE')), requeteGemini(d));
  if ('erreur' in g) return reponse(g, 502);
  const img = imageReponse(g.json);
  if ('erreur' in img) return reponse(img, 422);
  await db.from('releve_ia_usage').upsert({ jour, user_id: u.user.id, nb: deja + 1 }, { onConflict: 'jour,user_id' });
  return reponse({ image: img.image, mime: img.mime, modele: g.modele, restant: limite - deja - 1 });
});
