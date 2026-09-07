// Envoie l'avis de chiffrage à CP Constructions par e-mail, via Resend.
//
// Appelée depuis l'app (supabase.functions.invoke), avec la clé publique —
// donc jamais protégée par une authentification utilisateur. Deux règles de
// sécurité en découlent :
//   1. Le destinataire est fixé ici, en dur : jamais transmis par l'appelant.
//      Sans ça, n'importe qui pourrait se servir de cette fonction comme
//      relais pour expédier du courrier vers l'adresse de son choix.
//   2. Les champs texte sont bornés en longueur avant tout envoi, pour ne
//      pas laisser un appel malformé (ou malveillant) gonfler la facture
//      Resend ou passer un contenu disproportionné.
//
// Déploiement : voir supabase/functions/send-chiffrage-email/README.md.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const DEST = 'contact@cpconstructions.fr';
const FROM = 'CP Constructions <chiffrage@cpconstructions.fr>';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonReponse = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

// un contrôle grossier, pas une validation RFC complète : il suffit à écarter
// un Reply-To manifestement invalide avant de le transmettre à Resend
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonReponse({ error: 'method_not_allowed' }, 405);
  if (!RESEND_API_KEY) return jsonReponse({ error: 'not_configured' }, 500);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonReponse({ error: 'bad_json' }, 400);
  }

  const subject = String(payload?.subject ?? '').trim().slice(0, 300);
  const text = String(payload?.text ?? '').trim().slice(0, 20000);
  if (!subject || !text) return jsonReponse({ error: 'missing_fields' }, 400);

  const replyToRaw = String(payload?.replyTo ?? '').trim().slice(0, 200);
  const replyTo = EMAIL_RE.test(replyToRaw) ? replyToRaw : undefined;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [DEST],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      text,
    }),
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    return jsonReponse({ error: 'resend_failed', detail: detail.slice(0, 500) }, 502);
  }

  return jsonReponse({ ok: true });
});
