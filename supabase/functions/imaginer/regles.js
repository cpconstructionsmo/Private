// « Imaginer » : les règles de la fonction, sans réseau ni base, pour être
// testées telles quelles (tests/t_releve_imaginer.js) et lues par index.ts.
//
// La consigne du métreur est un texte libre : elle est bornée, nettoyée, et
// toujours encadrée par la demande de CP Constructions (même pièce, même
// point de vue, rendu réaliste, ni texte ni personne) — une consigne ne peut
// pas la remplacer.

export const CONSIGNE_MAX = 1000;
export const IMAGE_MAX = 6_000_000;           // base64 d'une photo réduite (photo.js) : largement assez
export const MODES_IMAGE = ['piece', 'terrain', 'facade', 'retouche', 'planRendu'];
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
  // « terrain » : la maison neuve sur la photo du terrain ; « facade » : l'agrandissement sur la photo de la maison ;
  // « retouche » : une image déjà imaginée, à corriger sur un point ; « planRendu » : le plan coté mis en couleur
  const mode = MODES_IMAGE.includes(corps?.mode) ? corps.mode : 'piece';
  return { image: image.replace(/\s+/g, ''), mime, consigne, piece: nettoyer(corps?.piece, 80), mode };
}

export function invite({ consigne, piece, mode }) {
  if (mode === 'terrain') return [
    'Tu es architecte pour une entreprise de construction de maisons.',
    'Voici la photo d’un terrain à bâtir. Montre-le avec la maison neuve construite selon ces souhaits :',
    '« ' + consigne + ' »',
    'Garde exactement le même point de vue, le même cadrage, la rue, les voisins, la végétation et le relief. Implante la maison de façon plausible, à une échelle réaliste par rapport au terrain et aux maisons voisines.',
    'Rendu photoréaliste, lumière naturelle. N’ajoute ni texte, ni logo, ni marque, ni personne.',
  ].join('\n');
  if (mode === 'facade') return [
    'Tu es architecte pour une entreprise de rénovation et d’agrandissement.',
    'Voici la photo d’une maison existante. Montre-la avec l’agrandissement réalisé selon ces souhaits :',
    '« ' + consigne + ' »',
    'Garde la maison existante, le même point de vue, le même cadrage et l’environnement ; l’agrandissement doit s’accorder à la maison (volumes, matériaux, toiture), à une échelle réaliste.',
    'Rendu photoréaliste, lumière naturelle. N’ajoute ni texte, ni logo, ni marque, ni personne.',
  ].join('\n');
  if (mode === 'retouche') return [
    'Tu es architecte d’intérieur pour une entreprise de rénovation.',
    'Voici une image de projet déjà proposée au client' + (piece ? ' (« ' + piece + ' »)' : '') + '. Applique SEULEMENT cette modification :',
    '« ' + consigne + ' »',
    'Tout le reste doit rester identique : même cadrage, même point de vue, mêmes murs, ouvertures, meubles, matériaux et lumière, sauf ce que la modification demande.',
    'Rendu photoréaliste de même qualité. N’ajoute ni texte, ni logo, ni marque, ni personne.',
  ].join('\n');
  if (mode === 'planRendu') return [
    'Tu es dessinateur pour une agence d’architecture. Voici un plan coté en noir et blanc, vu de dessus.',
    'Redessine-le en plan de présentation en couleur pour un client, vu de dessus, avec EXACTEMENT la même géométrie : mêmes murs, même épaisseur, mêmes pièces, portes et fenêtres à la même place, mêmes proportions, même orientation et même cadrage.',
    'Murs pleins gris foncé ; sols texturés selon la pièce (parquet bois clair pour séjour et chambres, carrelage clair pour cuisine, salle de bains, WC, entrée) ; mobilier simple vu de dessus, à l’échelle, adapté au nom de chaque pièce ; ombres douces ; style plan d’agence haut de gamme, net et lisible.',
    'Garde les noms de pièces et les cotes existants s’ils restent lisibles ; n’invente aucun nouveau texte, aucune cote, aucun logo.',
    consigne && consigne !== 'plan' ? 'Précision du métreur : « ' + consigne + ' »' : '',
  ].filter(Boolean).join('\n');
  return [
    'Tu es architecte d’intérieur pour une entreprise de rénovation.',
    'Voici la photo d’une pièce existante' + (piece ? ' (« ' + piece + ' »)' : '') + '. Montre-la après rénovation, selon ces souhaits :',
    '« ' + consigne + ' »',
    'Garde la même pièce, le même point de vue et le même cadrage, les mêmes dimensions et la même hauteur sous plafond, les fenêtres et les portes à leur place, sauf si les souhaits demandent de les changer.',
    'Qualité d’une photo d’intérieur professionnelle (magazine de décoration) : perspective et verticales droites, aucune déformation des murs, matériaux réalistes et cohérents (bois, pierre, carrelage, peinture mate), mobilier à l’échelle de la pièce, lumière du jour douce par les fenêtres existantes, ombres naturelles, haute définition.',
    'Rendu photoréaliste. N’ajoute ni texte, ni logo, ni marque, ni personne.',
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
// lire un plan ou une esquisse demande plus de raisonnement : le modèle « pro » d'abord (IMAGINER_MODELE_PLAN
// pour en imposer un autre), puis les modèles habituels si celui-là n'est pas disponible
export const MODELES_PLAN = ['gemini-2.5-pro', 'gemini-pro-latest'];
export const modelesPlan = (choisi, texte) => [...new Set([String(choisi || '').trim(), ...MODELES_PLAN, ...modelesTexte(texte)].filter(Boolean))];
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
  voir(d?.garde); voir(d?.planImage); voir(d?.vue3d); voir(d?.planRendu); voir(d?.planAnnote);
  (d?.plansCote || []).forEach(voir); (d?.plansAnnotes || []).forEach(voir);   // les plans côte à côte et leurs copies annotées
  (d?.pieces || []).forEach(p => (p.photos || []).forEach(ph => { voir(ph); (ph.imagines || []).forEach(voir); }));
  return [...s].slice(0, 200);
}
export const limiteTexte = v => { const n = parseInt(String(v ?? ''), 10); return n > 0 && n <= 5000 ? n : LIMITE_TEXTE_DEFAUT; };

/* ==========================================================================
   « Décrire » : Gemini regarde une photo et répond en texte.
   - mode « photo » : la photo d'une pièce → une légende courte et quelques
     constats utiles au chiffrage (état, matériaux, points de vigilance) ;
   - mode « note »  : la photo d'une note manuscrite ou d'un document →
     sa transcription, que l'assistant de visite range ensuite dans la fiche ;
   - mode « plan »  : un plan 2D (photo, image ou PDF : magicplan, plan
     d'architecte, croquis) → ses pièces rectangulaires, partie par partie,
     dont le relevé tire un dessin rapide à vérifier (releve/dessin.js).
   Ce n'est qu'une proposition : le relevé n'écrase jamais ce qui est tapé.
   Compté avec les dictées (IMAGINER_LIMITE_TEXTE).
   ========================================================================== */
export const LEGENDE_MAX = 140, CONSTAT_MAX = 200, CONSTATS_MAX = 6, NOTE_MAX = 8000, PARTIES_MAX = 8, PIECES_PLAN_MAX = 40;
// la lecture enrichie d'un plan ou d'une esquisse : ouvertures, équipements, notes et projet par pièce
export const COTES_PLAN = ['haut', 'droite', 'bas', 'gauche'], TYPES_OUV_PLAN = ['porte', 'fenetre', 'portefenetre', 'passage'],
  TYPES_EQ_PLAN = ['radiateur', 'chaudiere', 'cumulus', 'poele', 'wc', 'lavabo', 'douche', 'baignoire', 'evier', 'tableau'],
  OUVERTURES_PIECE_MAX = 12, EQUIPEMENTS_PIECE_MAX = 12, NOTE_PIECE_MAX = 300;

export function lireDescription(corps) {
  const image = String(corps?.image ?? '').replace(/^data:image\/[a-z+]+;base64,/i, '');
  if (!image || !/^[A-Za-z0-9+/=\s]+$/.test(image.slice(0, 2000))) return { erreur: 'image_absente' };
  if (image.length > IMAGE_MAX) return { erreur: 'image_trop_lourde' };
  const mode = ['note', 'plan', 'terrain'].includes(corps?.mode) ? corps.mode : 'photo';
  // un plan peut arriver en PDF (export magicplan, plan de géomètre) : Gemini le lit tel quel
  const mime = /^image\/(jpeg|png|webp)$/.test(String(corps?.mime)) || ((mode === 'plan' || mode === 'terrain') && corps?.mime === 'application/pdf') ? String(corps.mime) : 'image/jpeg';
  return { image: image.replace(/\s+/g, ''), mime, mode, piece: nettoyer(corps?.piece, 80) };
}

export function inviteDescription({ mode, piece }) {
  if (mode === 'terrain') return [
    'Voici le plan d’un terrain à bâtir : plan de géomètre, plan de bornage, extrait de lotissement, ou simple esquisse à la main avec des cotes.',
    'Relève ce qui est écrit, sans rien inventer, et réponds en JSON :',
    '{"esquisse":true,"echelle":null,"surface":null,"facade":null,"profondeur":null,"forme":null,"cotes":[{"cote":"…","longueur":0}],"nord":null,"acces":null,"constructions":null,"remarques":[]}',
    'esquisse : true si c’est un dessin à main levée (pas à l’échelle), false si c’est un plan à l’échelle (géomètre, cadastre, lotissement).',
    'echelle : l’échelle écrite (ex. « 1/200 ») ou null. surface : la surface écrite du terrain en m², sinon null (ne la calcule pas).',
    'facade : longueur du côté sur la voie (rue) en mètres si on la reconnaît ; profondeur : la longueur perpendiculaire à la rue si elle est écrite.',
    'forme : « Rectangulaire », « En longueur », « Irrégulier » ou « En drapeau ». cotes : chaque côté coté du terrain, dans l’ordre du tour, avec ce qui le désigne (rue, voisin, nord…).',
    'nord : où est le nord sur le plan (« en haut », « à droite »…) s’il est indiqué, sinon null. acces : l’accès indiqué (portail, servitude de passage…). constructions : bâtiments existants dessinés.',
    'remarques : au plus 6 remarques courtes utiles (servitude, réseau, talus, arbre, zone non constructible, numéro de lot…).',
  ].join('\n');
  if (mode === 'plan') return [
    'Voici un plan 2D de logement (export d’application comme magicplan, plan d’architecte, croquis, ou photo d’un plan papier).',
    'Relève les pièces dessinées, partie par partie (un étage, ou « état actuel » et « projet » dessinés séparément sont des parties différentes).',
    'Réponds en JSON : {"parties":[{"nom":"…","pieces":[{"nom":"…","longueur":0,"largeur":0,"surface":0,"x":0,"y":0}]}]}',
    'longueur = dimension intérieure HORIZONTALE de la pièce telle que dessinée (de gauche à droite), largeur = dimension VERTICALE, en mètres.',
    'Prends-les dans les cotes écrites (ex. « 4.30 × 5.49 », cotes le long des murs) et vérifie avec ces cotes laquelle est horizontale.',
    'Une pièce se mesure entre les FACES INTÉRIEURES de ses murs. Ne prends JAMAIS une cote extérieure ou totale du bâtiment (celle d’une façade entière, murs compris, souvent écrite en bordure du plan) comme longueur ou largeur d’une pièce : un couloir qui longe tout le bâtiment mesure moins que la façade, de l’épaisseur des murs ; prends la cote écrite le long de SON mur intérieur.',
    '"surface" : la surface de la pièce SI elle est écrite sur le plan (ex. « SH : 15,28 m² », « 15.28 m² »), en m², sinon omets le champ. Ne la calcule jamais. Si longueur × largeur s’écarte de plus de 3 % de la surface écrite pour une pièce rectangulaire, revérifie tes cotes avant de répondre ; si l’écart reste, garde les cotes lues et écris-le dans "doutes".',
    'x, y = coin haut-gauche intérieur de la pièce, en mètres depuis le coin haut-gauche de la partie, en suivant les cotes (murs compris).',
    'Une pièce non rectangulaire (pan coupé, mur biais) : son rectangle englobant, avec "forme":"autre". N’invente aucune pièce ; ignore le mobilier.',
    'nom de partie : son titre sur le plan (ex. « Rez-de-chaussée — état actuel »), sinon « Plan ». Deux logements dessinés côte à côte au même niveau (« A », « B ») restent dans la même partie : préfixe le nom de leurs pièces (« A – Séjour », « B – SDB »). Un petit plan à part (étage, mezzanine, combles) est une autre partie.',
    'Pour chaque pièce, relève aussi, seulement si c’est écrit ou dessiné (sinon omets le champ) :',
    '- "hauteur" : hauteur sous plafond en mètres (« HSP 2,30 » → 2.3 ; s’il y en a deux, la plus courante) ;',
    '- "ouvertures" : [{"type":"porte|fenetre|portefenetre|passage","cote":"haut|droite|bas|gauche","position":0,"largeur":0,"hauteur":0}] — cote = mur de la pièce tel que dessiné ; position = distance en mètres du début du mur (gauche pour haut/bas, haut pour gauche/droite) au bord de l’ouverture, si on peut l’estimer ; une cote « 120/195 » ou « 90/215 » près d’une ouverture = largeur/hauteur en centimètres (→ 1.2 et 1.95) ; un arc de cercle = une porte ; deux traits parallèles dans un mur = une fenêtre (porte-fenêtre si elle descend au sol, hauteur ≥ 2 m) ;',
    '- "equipements" : [{"type":"radiateur|chaudiere|cumulus|poele|wc|lavabo|douche|baignoire|evier|tableau","cote":"haut|droite|bas|gauche","position":0}] — « Rad. » = radiateur, « tableau élec » = tableau ; seulement l’existant (pas le projet) ;',
    '- "notes" : les autres annotations de l’existant, recopiées brièvement (ex. « Mur à refaire », « arrivée gaz », « HSP sous mezzanine 2,16 ») ;',
    '- "projet" : ce qui est dessiné ou écrit en ROUGE (ou marqué « futur », « projet ») pour cette pièce, recopié brièvement (ex. « futur SDE et WC », « futur cuisine ») : c’est le projet, pas l’existant ;',
    '- "forme" : "autre" si la pièce n’est pas rectangulaire.',
    'Méthode : repère d’abord toutes les cotes écrites et le mur de quelle pièce chacune mesure (une cote écrite le long d’un mur = la longueur de ce mur ; une cote au milieu d’une pièce entre deux flèches = la distance entre ces murs), puis construis chaque pièce à partir de ces cotes ; contrôle que les pièces voisines s’emboîtent.',
    'Un chiffre raturé ou illisible : ne le devine pas, omets-le. Ce qui est douteux (rature, cote contradictoire, pièce dont une dimension manque), dis-le dans "doutes" de la partie : ["…"], phrases courtes (ex. « Cuisine : largeur raturée (3,93 ou 3,13 ?) »).',
    'Réponds uniquement par le JSON : {"parties":[{"nom":"…","doutes":["…"],"pieces":[…]}]}.',
  ].join('\n');
  if (mode === 'note') return [
    'Voici la photo d’une note manuscrite (ou d’un document) prise pendant la visite d’un chantier de rénovation.',
    'Recopie fidèlement tout le texte lisible, en français, ligne par ligne, avec les nombres et les unités tels qu’écrits.',
    'N’ajoute rien, ne corrige pas le sens, ne résume pas. Un mot illisible s’écrit […].',
    'Réponds en JSON : {"texte":"…"}',
  ].join('\n');
  return [
    'Tu aides le métreur d’une entreprise de rénovation pendant une visite. Voici une photo' + (piece ? ' prise dans la pièce « ' + piece + ' »' : '') + '.',
    'Réponds en JSON, en français, sans rien inventer de ce qui ne se voit pas :',
    '{"legende":"…","constats":["…"]}',
    'legende : ce que montre la photo, en quelques mots (ex. « Tableau électrique ancien à fusibles », « Fissure au-dessus de la porte »), ' + LEGENDE_MAX + ' caractères au plus.',
    'constats : au plus ' + CONSTATS_MAX + ' remarques courtes utiles pour chiffrer les travaux : état, matériaux visibles, équipements, points de vigilance (humidité, amiante possible, plomb, normes…). Liste vide si rien d’utile.',
    'Pas de prix, pas de marque devinée, pas de personne décrite.',
  ].join('\n');
}

export function requeteDescription(d) {
  return {
    contents: [{ role: 'user', parts: [{ text: inviteDescription(d) }, { inline_data: { mime_type: d.mime, data: d.image } }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  };
}

/* la réponse vérifiée : seulement des textes, bornés */
export function descriptionReponse(json, mode) {
  const r = jsonReponse(json);
  if ('erreur' in r) return r;
  const o = r.fiche, txt = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').trim().slice(0, max) : '';
  if (mode === 'note') {
    const texte = txt(o.texte, NOTE_MAX);
    return texte ? { texte } : { erreur: 'rien_lu' };
  }
  if (mode === 'terrain') {
    const n = (v, min, max) => { const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) && x >= min && x <= max ? Math.round(x * 100) / 100 : null; };
    const formes = ['Rectangulaire', 'En longueur', 'Irrégulier', 'En drapeau'];
    const cotes = (Array.isArray(o.cotes) ? o.cotes : []).slice(0, 16).map(c => ({ cote: txt(c?.cote, 40).replace(/\s+/g, ' '), longueur: n(c?.longueur, 0.5, 2000) })).filter(c => c.longueur != null);
    const r = { esquisse: o.esquisse === true ? true : o.esquisse === false ? false : null, echelle: txt(o.echelle, 20) || null,
      surface: n(o.surface, 10, 1000000), facade: n(o.facade, 1, 2000), profondeur: n(o.profondeur, 1, 2000), forme: formes.includes(o.forme) ? o.forme : null,
      cotes, nord: txt(o.nord, 40) || null, acces: txt(o.acces, 160) || null, constructions: txt(o.constructions, 200) || null,
      remarques: (Array.isArray(o.remarques) ? o.remarques : []).map(x => txt(x, 200).replace(/\s+/g, ' ')).filter(Boolean).slice(0, 6) };
    return r.surface || r.facade || cotes.length ? r : { erreur: 'rien_lu' };
  }
  if (mode === 'plan') {
    const n = (v, min, max) => { const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) && x >= min && x <= max ? Math.round(x * 100) / 100 : null; };
    const parties = (Array.isArray(o.parties) ? o.parties : []).slice(0, PARTIES_MAX).map((p, i) => ({
      nom: txt(p?.nom, 80).replace(/\s+/g, ' ') || 'Plan ' + (i + 1),
      pieces: (Array.isArray(p?.pieces) ? p.pieces : []).slice(0, PIECES_PLAN_MAX)
        .map(q => {
          const base = { nom: txt(q?.nom, 40).replace(/\s+/g, ' ') || 'Pièce', longueur: n(q?.longueur, 0.3, 50), largeur: n(q?.largeur, 0.3, 50), x: n(q?.x, -10, 300) ?? 0, y: n(q?.y, -10, 300) ?? 0,
            // la surface ÉCRITE sur le plan, quand il y en a une : le relevé la compare aux cotes lues (jamais calculée ici)
            ...(n(q?.surface, 0.5, 2000) != null ? { surface: n(q?.surface, 0.5, 2000) } : {}) };
          // la lecture enrichie : seulement ce qui a la bonne forme (rien d'inventé, rien d'exécutable)
          const cote = c => COTES_PLAN.includes(c) ? c : null, h = n(q?.hauteur, 1.5, 8);
          const ouv = (Array.isArray(q?.ouvertures) ? q.ouvertures : []).slice(0, OUVERTURES_PIECE_MAX).map(o => ({ type: TYPES_OUV_PLAN.includes(o?.type) ? o.type : null, cote: cote(o?.cote),
            ...(n(o?.position, 0, 50) != null ? { position: n(o?.position, 0, 50) } : {}), largeur: n(o?.largeur, 0.3, 6), ...(n(o?.hauteur, 0.3, 3.5) != null ? { hauteur: n(o?.hauteur, 0.3, 3.5) } : {}) }))
            .filter(o => o.type && o.cote && o.largeur != null);
          const eq = (Array.isArray(q?.equipements) ? q.equipements : []).slice(0, EQUIPEMENTS_PIECE_MAX).map(o => ({ type: TYPES_EQ_PLAN.includes(o?.type) ? o.type : null,
            ...(cote(o?.cote) ? { cote: cote(o.cote) } : {}), ...(n(o?.position, 0, 50) != null ? { position: n(o?.position, 0, 50) } : {}) })).filter(o => o.type);
          const notes = txt(q?.notes, NOTE_PIECE_MAX).replace(/\s+/g, ' '), projet = txt(q?.projet, NOTE_PIECE_MAX).replace(/\s+/g, ' ');
          return { ...base, ...(h != null ? { hauteur: h } : {}), ...(ouv.length ? { ouvertures: ouv } : {}), ...(eq.length ? { equipements: eq } : {}),
            ...(notes ? { notes } : {}), ...(projet ? { projet } : {}), ...(q?.forme === 'autre' ? { forme: 'autre' } : {}) };
        })
        .filter(q => q.longueur != null && q.largeur != null),
    })).map((p, i) => { const dt = (Array.isArray(o.parties[i]?.doutes) ? o.parties[i].doutes : []).map(t => txt(t, 160).replace(/\s+/g, ' ')).filter(Boolean).slice(0, 8);
      return dt.length ? { ...p, doutes: dt } : p; }).filter(p => p.pieces.length);
    return parties.length ? { parties } : { erreur: 'rien_lu' };
  }
  const legende = txt(o.legende, LEGENDE_MAX).replace(/\s+/g, ' ');
  const constats = (Array.isArray(o.constats) ? o.constats : []).map(c => txt(c, CONSTAT_MAX).replace(/\s+/g, ' ')).filter(Boolean).slice(0, CONSTATS_MAX);
  return legende || constats.length ? { legende, constats } : { erreur: 'rien_lu' };
}

/* ==========================================================================
   « Lire le règlement » : le règlement du document d'urbanisme (PDF publié
   sur la Géoplateforme, lien rendu par le Géoportail de l'urbanisme) est lu
   par Gemini pour la zone du terrain. La fonction télécharge elle-même le
   PDF, et seulement depuis la Géoplateforme (jamais une adresse quelconque).
   La réponse cite les règles telles qu'écrites, ou null : rien d'inventé ;
   le relevé l'affiche comme une lecture automatique, à vérifier.
   Compté avec les dictées.
   ========================================================================== */
export const REGLEMENT_HOTE = 'https://data.geopf.fr/annexes/gpu/documents/';
export const REGLEMENT_MAX = 14_000_000;      // octets du PDF : en base64 (×4/3), la requête reste sous les 20 Mo acceptés par Gemini
export const REGLES = [['destination', 'Constructions autorisées'], ['emprise', 'Emprise au sol'], ['hauteur', 'Hauteur'],
  ['implantationVoies', 'Recul par rapport aux voies'], ['implantationLimites', 'Recul par rapport aux limites séparatives'],
  ['aspect', 'Aspect extérieur, façades'], ['toitures', 'Toitures'], ['clotures', 'Clôtures'], ['stationnement', 'Stationnement'], ['espacesVerts', 'Espaces verts, pleine terre']];
export function lireReglement(corps) {
  const url = String(corps?.url ?? '').split('#')[0].trim();
  if (!url.startsWith(REGLEMENT_HOTE) || !/\.pdf$/i.test(url) || /\.\.|[\s<>"]/.test(url) || url.length > 400) return { erreur: 'lien_reglement' };
  const zone = nettoyer(corps?.zone, 20);
  if (!zone) return { erreur: 'zone_absente' };
  return { url, zone, libelle: nettoyer(corps?.libelle, 160) };
}
export function inviteReglement({ zone, libelle }) {
  return [
    'Voici le règlement écrit d’un document d’urbanisme (PLU ou PLUi). Lis les règles qui s’appliquent à la zone « ' + zone + ' »' + (libelle ? ' (' + libelle + ')' : '') + ',',
    'y compris les dispositions communes à toutes les zones si le règlement en a, pour la construction d’une maison individuelle.',
    'Réponds en JSON, en français, en citant les règles telles qu’écrites (chiffres, unités, conditions), en quelques phrases courtes au plus par rubrique :',
    '{"zoneTrouvee":true,"pages":null,' + REGLES.map(([k]) => '"' + k + '":null').join(',') + ',"autres":[]}',
    'Une rubrique que le règlement ne traite pas pour cette zone reste null. N’invente rien, ne complète pas avec des règles générales.',
    'zoneTrouvee : false si la zone « ' + zone + ' » n’est pas dans ce règlement. pages : les pages lues (ex. « 32 à 41 »). autres : au plus 5 règles importantes de plus (risques, servitudes, divisions…).',
  ].join('\n');
}
export function requeteReglement(d, pdfBase64) {
  return {
    contents: [{ role: 'user', parts: [{ text: inviteReglement(d) }, { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
  };
}
export function reglementReponse(json) {
  const r = jsonReponse(json);
  if ('erreur' in r) return r;
  const o = r.fiche, t = v => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600) : null;
  if (o.zoneTrouvee === false) return { erreur: 'zone_introuvable' };
  const regles = {};
  REGLES.forEach(([k]) => { const v = t(o[k]); if (v) regles[k] = v; });
  const autres = (Array.isArray(o.autres) ? o.autres : []).map(t).filter(Boolean).slice(0, 5);
  if (!Object.keys(regles).length && !autres.length) return { erreur: 'rien_lu' };
  return { regles, autres, pages: t(o.pages) };
}
/* le PDF en base64, par morceaux (un fichier de plusieurs Mo) */
export function enBase64(octets) {
  let bin = '';
  for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
  return btoa(bin);
}
