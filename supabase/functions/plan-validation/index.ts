// La validation du plan électrique par le client : la seule porte entre lui
// et la base.
//
// Le client ouvre un lien personnel (plan.html#t=<jeton>). La fonction en
// calcule l'empreinte, retrouve la publication de son dossier et ne renvoie
// qu'elle : le plan publié, une adresse temporaire (une heure) vers son fond,
// ses remarques et ses validations. Jamais app_data, jamais un autre dossier.
//
// Le client peut laisser une remarque (sur un équipement ou un point du
// plan) et valider l'indice publié. Il ne modifie pas le plan : toute
// modification passe par CP Constructions, dans l'application.
//
// Déploiement : voir README.md (même dossier).

import { createClient } from 'npm:@supabase/supabase-js@2';

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
const texte = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reponse({ erreur: 'methode' }, 405);
  if (!URL_SUPABASE || !CLE_SERVICE) return reponse({ erreur: 'non_configure' }, 500);
  const brut = await req.text();
  if (brut.length > 20000) return reponse({ erreur: 'trop_long' }, 413);
  let corps: Record<string, unknown>;
  try { corps = JSON.parse(brut); } catch { return reponse({ erreur: 'json' }, 400); }
  const jeton = String(corps?.t ?? '');
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(jeton)) return reponse({ erreur: 'lien_invalide' }, 404);

  const db = createClient(URL_SUPABASE, CLE_SERVICE, { auth: { persistSession: false } });
  const { data: pub, error } = await db.from('plan_publications')
    .select('id, publication, statut').eq('jeton_hash', await empreinte(jeton)).maybeSingle();
  if (error) return reponse({ erreur: 'base' }, 500);
  if (!pub) return reponse({ erreur: 'lien_invalide' }, 404);
  const P = (pub.publication || {}) as Record<string, unknown>;

  if (corps.action === 'lire') {
    // le fond du plan : une adresse signée d'une heure, jamais le stockage entier
    let fond = '';
    if (typeof P.fond === 'string' && /^[\w-]+$/.test(P.fond)) {
      const { data } = await db.storage.from('photos').createSignedUrl(P.fond + '.jpg', 3600);
      fond = (data && data.signedUrl) || '';
    }
    const { data: remarques } = await db.from('plan_remarques')
      .select('id, indice, symbole_id, x, y, texte, auteur, cree_le, traitee_le, reponse')
      .eq('publication_id', pub.id).order('cree_le', { ascending: true }).limit(300);
    const { data: validations } = await db.from('plan_validations')
      .select('indice, nom, cree_le').eq('publication_id', pub.id).order('cree_le', { ascending: true });
    const { fond: _cle, ...publie } = P;
    return reponse({ publication: publie, fond, statut: pub.statut, remarques: remarques || [], validations: validations || [] });
  }

  if (pub.statut !== 'ouvert') return reponse({ erreur: 'clos' }, 403);

  if (corps.action === 'remarquer') {
    const t = texte(corps.texte, 1000);
    if (!t) return reponse({ erreur: 'vide' }, 400);
    const { count } = await db.from('plan_remarques').select('id', { count: 'exact', head: true }).eq('publication_id', pub.id);
    if ((count || 0) >= 300) return reponse({ erreur: 'trop_de_remarques' }, 429);
    const symboles = Array.isArray(P.symboles) ? P.symboles as Array<{ id: string }> : [];
    const sid = texte(corps.symboleId, 40);
    const x = Number(corps.x), y = Number(corps.y);
    const { error: e2 } = await db.from('plan_remarques').insert({
      publication_id: pub.id, indice: texte(P.indice, 8), texte: t, auteur: texte(corps.auteur, 80),
      symbole_id: sid && symboles.some((s) => s.id === sid) ? sid : null,
      x: isFinite(x) && x >= 0 && x <= 1 ? x : null, y: isFinite(y) && y >= 0 && y <= 1 ? y : null,
    });
    if (e2) return reponse({ erreur: 'base' }, 500);
    return reponse({ ok: true });
  }

  if (corps.action === 'valider') {
    const nom = texte(corps.nom, 80);
    if (!nom) return reponse({ erreur: 'nom' }, 400);
    const { error: e3 } = await db.from('plan_validations').insert({ publication_id: pub.id, indice: texte(P.indice, 8) || '—', nom });
    if (e3) return reponse({ erreur: 'base' }, 500);
    return reponse({ ok: true, indice: P.indice || '' });
  }

  return reponse({ erreur: 'action' }, 400);
});
