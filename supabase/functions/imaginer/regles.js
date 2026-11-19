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

/* ==========================================================================
   L'assistant de visite : le métreur raconte la visite (dictée libre), Gemini
   en tire les champs de la fiche. La réponse n'est qu'une proposition : le
   relevé la vérifie champ par champ (releve/assistant.js : clés et valeurs
   permises seulement) et le métreur coche ce qu'il reprend. Les listes de
   choix (civilités, travaux…) viennent du relevé, bornées ici.
   ========================================================================== */
export const TEXTE_MAX = 8000;
export const LIMITE_TEXTE_DEFAUT = 100;       // demandes par personne et par jour (IMAGINER_LIMITE_TEXTE)
export const MODELES_TEXTE = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3-flash-preview'];
export const modelesTexte = choisi => [...new Set([String(choisi || '').trim(), ...MODELES_TEXTE].filter(Boolean))];
const LISTES = ['civilites', 'types', 'categories', 'usages', 'delais', 'formes'];

export function lireStructuration(corps) {
  const texte = String(corps?.texte ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').trim().slice(0, TEXTE_MAX);
  if (texte.length < 10) return { erreur: 'texte_absent' };
  const listes = {};
  for (const k of LISTES) {
    const v = corps?.listes?.[k];
    listes[k] = Array.isArray(v) ? v.slice(0, 40).map(x => nettoyer(x, 60)).filter(Boolean) : [];
  }
  return { texte, listes };
}

export function inviteStructuration({ texte, listes }) {
  const choix = (k, lib) => lib + ' : ' + (listes[k].length ? listes[k].map(x => '« ' + x + ' »').join(', ') : '(aucun)');
  return [
    'Tu aides un métreur d’une entreprise de rénovation. Voici ce qu’il a dicté pendant une visite chez un client.',
    'Remplis la fiche en JSON, en français, avec UNIQUEMENT ce qui est dit. N’invente rien : une information absente reste null (ou liste vide).',
    'Pour les champs à choix, reprends exactement une des valeurs proposées, sinon null.',
    choix('civilites', 'civilite'), choix('usages', 'usage'), choix('delais', 'delai'), choix('formes', 'forme de société'),
    choix('categories', 'categories (plusieurs possibles)'), choix('types', 'types de travaux (plusieurs possibles ; « Autre » avec typeAutre)'),
    'Format attendu (toutes les clés, valeurs null si inconnues) :',
    '{"client":{"civilite":null,"nom":null,"prenom":null,"telephone":null,"email":null,"adresse":null,"codePostal":null,"ville":null},',
    '"societe":{"raisonSociale":null,"forme":null},"acheteur2":{"civilite":null,"nom":null,"prenom":null,"telephone":null,"email":null},',
    '"bien":{"usage":null},"projet":{"categories":[],"types":[],"typeAutre":null,"situation":null,"souhaits":null,"delai":null,"enveloppe":null},',
    '"pieces":[{"nom":"","note":""}]}',
    'Règles : nom de famille en MAJUSCULES ; enveloppe = budget du client en euros (nombre entier, TTC) ; situation = l’existant (état, chauffage, isolation…) ;',
    'souhaits = ce que veut le client ; pieces = les pièces à transformer citées, avec une note courte de ce qui est dit pour chacune.',
    'Dictée :', '« ' + texte + ' »',
  ].join('\n');
}

export function requeteStructuration(d) {
  return {
    contents: [{ role: 'user', parts: [{ text: inviteStructuration(d) }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
  };
}

/* le JSON de la réponse (parfois entouré de ```json … ```) */
export function jsonReponse(json) {
  const t = (json?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  const nu = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { const o = JSON.parse(nu); return o && typeof o === 'object' && !Array.isArray(o) ? { fiche: o } : { erreur: 'illisible' }; }
  catch { return { erreur: 'illisible', raison: String(json?.candidates?.[0]?.finishReason || json?.promptFeedback?.blockReason || '') }; }
}

/* ==========================================================================
   Le dossier partagé au client : un lien personnel (#t=<jeton>), à durée
   limitée. Seule l'empreinte du jeton est en base (releve_partages) ; la
   fonction rend le dossier gardé et des liens temporaires (une heure) vers
   ses photos, rien d'autre.
   ========================================================================== */
export const jetonValide = t => /^[A-Za-z0-9_-]{40,64}$/.test(String(t || ''));
export async function empreinte(jeton) {
  const h = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(jeton));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/* les chemins des photos d'un dossier gardé, pour leur lien temporaire */
export function cheminsDossier(d) {
  const s = new Set();
  const voir = ph => { if (ph && typeof ph.chemin === 'string' && /^[\w-]+\/[\w.-]+$/.test(ph.chemin)) s.add(ph.chemin); };
  voir(d?.garde); voir(d?.planImage);
  (d?.pieces || []).forEach(p => (p.photos || []).forEach(ph => { voir(ph); (ph.imagines || []).forEach(voir); }));
  return [...s].slice(0, 200);
}
export const limiteTexte = v => { const n = parseInt(String(v ?? ''), 10); return n > 0 && n <= 5000 ? n : LIMITE_TEXTE_DEFAUT; };
