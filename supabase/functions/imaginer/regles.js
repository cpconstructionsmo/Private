// « Imaginer » : les règles de la fonction, sans réseau ni base, pour être
// testées telles quelles (tests/t_releve_imaginer.js) et lues par index.ts.
//
// La consigne du métreur est un texte libre : elle est bornée, nettoyée, et
// toujours encadrée par la demande de CP Constructions (même pièce, même
// point de vue, rendu réaliste, ni texte ni personne) — une consigne ne peut
// pas la remplacer.

export const CONSIGNE_MAX = 1000;
export const IMAGE_MAX = 6_000_000;           // base64 d'une photo réduite (photo.js) : largement assez
export const LIMITE_JOUR_DEFAUT = 30;          // images par utilisateur et par jour (réglable : IMAGINER_LIMITE_JOUR)

// les modèles d'image de Gemini, du préféré au secours. Google renomme ses
// modèles (préversion, puis stable, puis retrait) : un modèle inconnu (404)
// passe au suivant, et IMAGINER_MODELE impose le sien en tête.
export const MODELES = ['gemini-3.1-flash-image-preview', 'gemini-3.1-flash-image', 'gemini-2.5-flash-image', 'gemini-3-pro-image-preview'];
export const modeles = choisi => [...new Set([String(choisi || '').trim(), ...MODELES].filter(Boolean))];

const nettoyer = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/* la demande vérifiée : erreur nommée, ou les valeurs utilisables */
export function lireDemande(corps) {
  const image = String(corps?.image ?? '').replace(/^data:image\/[a-z+]+;base64,/i, '');
  if (!image || !/^[A-Za-z0-9+/=\s]+$/.test(image.slice(0, 2000))) return { erreur: 'image_absente' };
  if (image.length > IMAGE_MAX) return { erreur: 'image_trop_lourde' };
  const consigne = nettoyer(corps?.consigne, CONSIGNE_MAX);
  if (consigne.length < 3) return { erreur: 'consigne_absente' };
  const mime = /^image\/(jpeg|png|webp)$/.test(String(corps?.mime)) ? String(corps.mime) : 'image/jpeg';
  return { image: image.replace(/\s+/g, ''), mime, consigne, piece: nettoyer(corps?.piece, 80) };
}

export function invite({ consigne, piece }) {
  return [
    'Tu es architecte d’intérieur pour une entreprise de rénovation.',
    'Voici la photo d’une pièce existante' + (piece ? ' (« ' + piece + ' »)' : '') + '. Montre-la après rénovation, selon ces souhaits :',
    '« ' + consigne + ' »',
    'Garde la même pièce, le même point de vue et le même cadrage, les mêmes dimensions, les fenêtres et les portes à leur place, sauf si les souhaits demandent de les changer.',
    'Rendu photoréaliste, lumière naturelle. N’ajoute ni texte, ni logo, ni marque, ni personne.',
  ].join('\n');
}

/* le corps de la requête Gemini (generateContent) */
export function requeteGemini(d) {
  return {
    contents: [{ role: 'user', parts: [{ text: invite(d) }, { inline_data: { mime_type: d.mime, data: d.image } }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  };
}

/* l'image de la réponse (inlineData ou inline_data, selon la version de l'API) */
export function imageReponse(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    const d = p.inlineData || p.inline_data;
    if (d && d.data && /^image\//.test(d.mimeType || d.mime_type || '')) return { image: d.data, mime: d.mimeType || d.mime_type };
  }
  const texte = parts.map(p => p.text).filter(Boolean).join(' ').slice(0, 300);
  const raison = json?.promptFeedback?.blockReason || json?.candidates?.[0]?.finishReason || '';
  return { erreur: 'aucune_image', raison: String(raison), texte };
}

export const limiteJour = v => { const n = parseInt(String(v ?? ''), 10); return n > 0 && n <= 1000 ? n : LIMITE_JOUR_DEFAUT; };
