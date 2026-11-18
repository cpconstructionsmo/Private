/* La fourchette de prix pendant la visite (Phase 2, mode A), sans navigateur
   ni réseau : ce module se teste seul (tests/t_releve_budget.js).

   Principe : chaque poste de la visite renvoie à une ligne de la table des
   fourchettes de CP Constructions (prix TTC par unité, mini et maxi, par
   gamme), et sa quantité vient du plan (pièces choisies, ou toute la
   maison) ou est saisie. Le total « de X à Y € TTC » se compare à
   l'enveloppe du client. Aucun prix n'est écrit dans le code : la table
   livrée ne contient que les postes et leurs unités, les prix sont à
   saisir par CP Constructions (« Fourchettes de prix »). */

export const GAMMES = [
  { id: 'eco', nom: 'Éco' },
  { id: 'standard', nom: 'Standard' },
  { id: 'premium', nom: 'Premium' },
];

/* l'unité dit d'où vient la quantité : du plan (champ des pièces envoyées
   par le moteur de relevé), d'un forfait, ou d'une saisie */
export const UNITES = {
  m2_sol: { nom: 'm² de sol', court: 'm²', plan: 'sol' },
  m2_murs: { nom: 'm² de murs (ouvertures déduites)', court: 'm² de murs', plan: 'murs' },
  ml_perimetre: { nom: 'mètre linéaire de murs (périmètre)', court: 'ml', plan: 'perimetre' },
  u_porte: { nom: 'porte', court: 'porte(s)', plan: 'portes' },
  u_fenetre: { nom: 'fenêtre', court: 'fenêtre(s)', plan: 'fenetres' },
  u_piece: { nom: 'pièce', court: 'pièce(s)', plan: 'nombre' },
  forfait: { nom: 'forfait', court: 'forfait' },
  m2_saisi: { nom: 'm² (à saisir)', court: 'm²' },
  ml_saisi: { nom: 'mètre linéaire (à saisir)', court: 'ml' },
  u_saisi: { nom: 'unité (à saisir)', court: 'u' },
};

/* les ajustements : état et accès en quelques choix, imprévus au curseur.
   Rien n'est imposé : tout part de 0 %. Ils s'additionnent (+10 % et
   +5 % = +15 %), plus simple à expliquer au client qu'un produit. */
export const ETATS = [['Bon état', 0], ['État moyen', 0.10], ['Dégradé', 0.20]];
export const ACCES = [['Accès facile', 0], ['Accès difficile', 0.10]];
export const IMPREVUS_MAX = 0.20;

/* la table livrée : les postes courants et leurs unités, SANS PRIX. Le type
   renvoie aux types de travaux de la visite (modele.js, TYPES_TRAVAUX) pour
   proposer les bons postes. */
const L = (id, type, libelle, unite) => ({ id, type, libelle, unite, prix: {} });
export const FOURCHETTES_MODELE = [
  L('cuisine', 'Cuisine', 'Cuisine : rénovation complète (hors mobilier)', 'forfait'),
  L('cuisine-meubles', 'Cuisine', 'Mobilier de cuisine fourni-posé', 'ml_saisi'),
  L('sdb', 'Salle de bains', 'Salle de bains : rénovation complète', 'forfait'),
  L('sdb-douche', 'Salle de bains', 'Remplacement de baignoire par une douche', 'forfait'),
  L('peinture-murs', 'Peinture', 'Peinture des murs', 'm2_murs'),
  L('peinture-plafonds', 'Peinture', 'Peinture des plafonds', 'm2_sol'),
  L('sol-carrelage', 'Sols', 'Carrelage au sol', 'm2_sol'),
  L('sol-souple', 'Sols', 'Parquet ou sol souple', 'm2_sol'),
  L('iso-combles', 'Isolation', 'Isolation des combles', 'm2_sol'),
  L('iso-murs', 'Isolation', 'Isolation des murs par l’intérieur', 'm2_murs'),
  L('elec', 'Électricité', 'Électricité : remise aux normes', 'm2_sol'),
  L('plomberie', 'Plomberie', 'Plomberie : reprise des réseaux', 'forfait'),
  L('fenetre', 'Menuiseries', 'Remplacement de fenêtre', 'u_fenetre'),
  L('porte-int', 'Menuiseries', 'Remplacement de porte intérieure', 'u_porte'),
  L('facade', 'Façade', 'Ravalement de façade', 'm2_saisi'),
  L('toiture', 'Toiture', 'Réfection de couverture', 'm2_saisi'),
  L('extension', 'Extension', 'Extension (surface créée)', 'm2_saisi'),
  L('chauffage', 'Chauffage', 'Chauffage : remplacement du générateur (PAC, chaudière…)', 'forfait'),
  L('exterieur', 'Extérieur', 'Aménagement extérieur (terrasse, allée…)', 'm2_saisi'),
  // « Rénovation complète » n'est plus un type de travaux : ces postes suivent la catégorie
  L('reno-complete', 'Rénovation importante', 'Rénovation lourde (tous corps d’état)', 'm2_sol'),
  L('demolition', 'Rénovation importante', 'Démolition de cloison', 'ml_saisi'),
];

const nb = v => (typeof v === 'number' && isFinite(v) ? v : (v === '' || v == null ? null : (isFinite(+String(v).replace(',', '.')) ? +String(v).replace(',', '.') : null)));

/* un prix mini/maxi utilisable (les deux saisis, positifs, mini ≤ maxi) */
export function prixValide(p) {
  const min = nb(p && p.min), max = nb(p && p.max);
  return min != null && max != null && min >= 0 && max >= min ? { min, max } : null;
}

/* la quantité qu'apporte le plan pour une unité, sur les pièces choisies
   (aucune choisie = toute la maison) ; null si l'unité ne vient pas du plan
   ou s'il n'y a pas de plan */
export function quantitePlan(unite, piecesPlan, selection) {
  const u = UNITES[unite];
  if (unite === 'forfait') return 1;
  if (!u || !u.plan || !Array.isArray(piecesPlan) || !piecesPlan.length) return null;
  const P = piecesPlan.filter(p => !selection || !selection.length || selection.includes(p.id));
  if (!P.length) return 0;
  if (u.plan === 'nombre') return P.length;
  const s = P.reduce((t, p) => t + (nb(p[u.plan]) || 0), 0);
  return Math.round(s * 100) / 100;
}

export function calculerLigne(ligne, fourchettes, piecesPlan) {
  const f = (fourchettes || []).find(x => x.id === ligne.fourchetteId) || null;
  const unite = (f && f.unite) || ligne.unite;
  const auto = quantitePlan(unite, piecesPlan, ligne.pieces);
  const saisie = nb(ligne.quantite);
  const quantite = saisie != null ? saisie : auto;
  const source = saisie != null ? 'saisie' : unite === 'forfait' ? 'forfait' : auto != null ? 'plan' : null;
  const prix = f ? prixValide(f.prix && f.prix[ligne.gamme || 'standard']) : null;
  const manque = !f ? 'poste' : !prix ? 'prix' : quantite == null ? 'quantite' : null;
  return { id: ligne.id, libelle: (f && f.libelle) || ligne.libelle || 'Poste', unite, gamme: ligne.gamme || 'standard',
    quantite, quantitePlan: auto, source, prix, manque,
    min: manque ? 0 : prix.min * quantite, max: manque ? 0 : prix.max * quantite };
}

/* le total, arrondi à la centaine (c'est une fourchette, pas un devis) */
const cent = v => Math.round(v / 100) * 100;
export function calculerBudget(budget, fourchettes, piecesPlan) {
  const b = budget || {}, a = b.ajust || {};
  const lignes = (b.lignes || []).map(l => calculerLigne(l, fourchettes, piecesPlan));
  const sousTotal = lignes.reduce((t, l) => ({ min: t.min + l.min, max: t.max + l.max }), { min: 0, max: 0 });
  const majoration = (nb(a.etat) || 0) + (nb(a.acces) || 0) + Math.min(IMPREVUS_MAX, Math.max(0, nb(a.imprevus) || 0));
  const total = { min: cent(sousTotal.min * (1 + majoration)), max: cent(sousTotal.max * (1 + majoration)) };
  return { lignes, sousTotal, majoration: Math.round(majoration * 100) / 100, total,
    manques: lignes.filter(l => l.manque).length, complet: lignes.length > 0 && lignes.every(l => !l.manque) };
}

/* la fourchette face à l'enveloppe du client */
export function verdictEnveloppe(total, enveloppe) {
  const e = nb(enveloppe);
  if (e == null || e <= 0 || !total || !(total.max > 0)) return null;
  if (total.max <= e) return { niveau: 'dans', texte: 'Dans le budget' };
  if (total.min > e) return { niveau: 'hors', texte: 'Hors budget' };
  return { niveau: 'limite', texte: 'À la limite du budget' };
}

/* les postes de la table qui correspondent aux travaux choisis à la visite.
   `types` peut mêler types de travaux et catégories de rénovation ; une table
   enregistrée avant le retrait de « Rénovation complète » garde ce type sur
   ses lignes : il répond à « Rénovation importante ». */
export function postesSuggeres(types, fourchettes, dejaPris) {
  const pris = new Set((dejaPris || []).map(l => l.fourchetteId));
  const t = new Set(types || []);
  if (t.has('Rénovation importante')) t.add('Rénovation complète');
  return (fourchettes || []).filter(f => t.has(f.type) && !pris.has(f.id));
}

/* les pièces du plan, telles que le moteur de relevé les envoie (resume) */
export const piecesDuPlan = plan => (plan && plan.resume && Array.isArray(plan.resume.detail)) ? plan.resume.detail : [];

/* fusion de deux versions de la table (deux personnes qui la retouchent) :
   ligne par ligne, la plus récente ; une ligne supprimée ne revient pas */
export function fusionnerFourchettes(a, b) {
  const parId = new Map();
  for (const l of [...(a || []), ...(b || [])]) {
    const x = parId.get(l.id);
    if (!x || (l.supprime && !x.supprime) || (!!l.supprime === !!x.supprime && (l.maj || '') > (x.maj || ''))) parId.set(l.id, l);
  }
  const ordre = [...(a || []), ...(b || [])].map(l => l.id);
  return [...new Set(ordre)].map(id => parId.get(id));
}

export const formatPlage = t => {
  const f = v => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v);
  return t && t.max > 0 ? 'de ' + f(t.min) + ' à ' + f(t.max) + ' € TTC' : '—';
};

/* ==========================================================================
   L'estimation de premier rendez-vous (R1) : par surfaces globales.

   Chez le client, pas de poste par poste : on choisit les travaux (tuiles),
   la surface vient du plan quand il existe (la cuisine du scan, la surface
   habitable…), sinon d'une valeur courante que l'on règle d'un geste, et la
   gamme (éco, standard, haut de gamme) situe le prix entre le mini et le
   maxi du marché. Le résultat est une fourchette TTC, indicative.

   Prix de départ : repères publics 2026 (guides de prix en ligne, voir
   releve/README.md), médianes retenues par CP Constructions et à remplacer
   au bureau par ses propres ratios (écran « Prix au m² », table partagée
   releve_reglages, ligne « ouvrages »). `repere` dit d'où vient le prix :
   'marche' (plusieurs guides concordants) ou 'estimation' (à confirmer).
   Le chiffrage précis se fait au bureau, dans la fiche prospect du suivi.
   ========================================================================== */
const O = (id, nom, icone, o) => Object.assign({ id, nom, icone, unite: 'm2', base: 'saisie', defaut: 20, types: [], categories: [], repere: 'marche' }, o);
export const OUVRAGES = [
  O('reno-complete', 'Rénovation complète (tous corps d’état)', '🏚️', { base: 'habitable', defaut: 100, categories: ['Rénovation importante'], prix: { min: 1100, med: 1450, max: 1800 },
    note: 'Comprend cuisine, salle de bains, sols, électricité, plomberie, peinture : ne les ajoutez pas en plus.' }),
  O('rafraichissement', 'Rafraîchissement (peinture, sols, finitions)', '🖌️', { base: 'habitable', defaut: 100, categories: ['Rénovation partielle'], prix: { min: 250, med: 450, max: 750 } }),
  O('cuisine', 'Cuisine', '🍳', { base: 'piece', motif: 'cuisine', defaut: 10, types: ['Cuisine'], prix: { min: 500, med: 900, max: 1500 } }),
  O('sdb', 'Salle de bains', '🛁', { base: 'piece', motif: 'bain|douche|sdb', defaut: 5, types: ['Salle de bains'], prix: { min: 700, med: 1200, max: 2000 } }),
  O('peinture', 'Peinture murs et plafonds', '🎨', { base: 'habitable', defaut: 100, types: ['Peinture'], prix: { min: 60, med: 95, max: 150 },
    note: 'Au m² habitable (environ 3 m² peints par m² de sol).' }),
  O('sols', 'Sols (carrelage, parquet posé)', '🪵', { base: 'habitable', defaut: 60, types: ['Sols'], prix: { min: 50, med: 80, max: 130 } }),
  O('electricite', 'Électricité (remise aux normes)', '⚡', { base: 'habitable', defaut: 100, types: ['Électricité'], prix: { min: 60, med: 90, max: 130 } }),
  O('plomberie', 'Plomberie (reprise des réseaux)', '🚰', { base: 'habitable', defaut: 100, types: ['Plomberie'], prix: { min: 30, med: 50, max: 80 }, repere: 'estimation' }),
  O('combles', 'Isolation des combles', '🧱', { base: 'habitable', defaut: 80, types: ['Isolation'], categories: ['Rénovation énergétique'], prix: { min: 25, med: 40, max: 70 } }),
  O('iti', 'Isolation des murs par l’intérieur', '🧱', { base: 'saisie', defaut: 80, types: ['Isolation'], prix: { min: 40, med: 65, max: 90 }, note: 'm² de murs à isoler.' }),
  O('ite', 'Isolation par l’extérieur', '🏠', { base: 'saisie', defaut: 100, types: ['Façade'], categories: ['Rénovation énergétique'], prix: { min: 120, med: 180, max: 270 }, note: 'm² de façade.' }),
  O('facade', 'Ravalement de façade', '🏠', { base: 'saisie', defaut: 100, types: ['Façade'], prix: { min: 40, med: 70, max: 120 }, note: 'm² de façade.' }),
  O('toiture', 'Réfection de couverture', '🏗️', { base: 'toiture', defaut: 120, types: ['Toiture'], prix: { min: 120, med: 200, max: 300 }, note: 'm² de toiture (environ 1,3 × l’emprise).' }),
  O('fenetres', 'Fenêtres (remplacement, posées)', '🪟', { unite: 'u', base: 'fenetres', defaut: 6, types: ['Menuiseries'], categories: ['Rénovation énergétique'], prix: { min: 500, med: 800, max: 1200 } }),
  O('pac', 'Pompe à chaleur air-eau (posée)', '🔥', { unite: 'forfait', base: 'forfait', defaut: 1, types: ['Chauffage'], categories: ['Rénovation énergétique'], prix: { min: 9000, med: 13000, max: 18000 } }),
  O('extension', 'Extension (surface créée)', '➕', { base: 'saisie', defaut: 20, types: ['Extension'], prix: { min: 1500, med: 2000, max: 2800 }, repere: 'estimation' }),
  O('exterieur', 'Terrasse, aménagement extérieur', '🌳', { base: 'saisie', defaut: 20, types: ['Extérieur'], prix: { min: 80, med: 150, max: 250 }, repere: 'estimation' }),
];

/* les trois gammes : où se place le prix entre le mini et le maxi du marché */
export const NIVEAUX = [
  { id: 'eco', nom: 'Éco', signe: '€' },
  { id: 'standard', nom: 'Standard', signe: '€€' },
  { id: 'haut', nom: 'Haut de gamme', signe: '€€€' },
];
export function prixNiveau(p, niveau) {
  const min = nb(p && p.min), med = nb(p && p.med), max = nb(p && p.max);
  if (min == null || med == null || max == null || !(min <= med && med <= max)) return null;
  if (niveau === 'eco') return { min, max: med };
  if (niveau === 'haut') return { min: med, max };
  return { min: Math.min(med, Math.max(min, med * 0.85)), max: Math.max(med, Math.min(max, med * 1.15)) };   // standard : autour de la médiane
}

/* la table utilisée : celle du modèle, prix remplacés par ceux de CP s'ils
   ont été saisis (une ligne enregistrée = { id, prix:{min,med,max}, maj }) */
export function tableOuvrages(enregistres) {
  const m = new Map((enregistres || []).filter(x => x && !x.supprime).map(x => [x.id, x]));
  return OUVRAGES.map(o => { const e = m.get(o.id); return e && prixNiveau(e.prix, 'standard') ? { ...o, prix: { ...e.prix }, repere: 'cp' } : o; });
}

const UNITES_O = { m2: 'm²', u: 'u', forfait: 'forfait' };
export const uniteOuvrage = o => UNITES_O[o.unite] || '';

/* la surface (ou le nombre) proposée par le plan, ou la valeur courante */
export function surfaceAuto(o, piecesPlan) {
  const P = Array.isArray(piecesPlan) ? piecesPlan : [];
  const somme = k => Math.round(P.reduce((t, p) => t + (nb(p[k]) || 0), 0) * 10) / 10;
  if (o.base === 'forfait') return { valeur: 1, source: 'forfait' };
  if (P.length) {
    if (o.base === 'piece') {
      const re = new RegExp(o.motif, 'i'), q = P.filter(p => re.test(p.nom || ''));
      if (q.length) return { valeur: Math.round(q.reduce((t, p) => t + (nb(p.sol) || 0), 0) * 10) / 10, source: 'plan', detail: q.map(p => p.nom).join(', ') };
    }
    if (o.base === 'habitable') return { valeur: somme('sol'), source: 'plan', detail: 'surface habitable' };
    if (o.base === 'fenetres' && somme('fenetres') > 0) return { valeur: somme('fenetres'), source: 'plan', detail: 'fenêtres du plan' };
    if (o.base === 'toiture') {
      const rdc = P.filter(p => !p.etage); const emprise = Math.round(rdc.reduce((t, p) => t + (nb(p.sol) || 0), 0) * 1.3);
      if (emprise > 0) return { valeur: emprise, source: 'plan', detail: '1,3 × l’emprise du plan' };
    }
  }
  return { valeur: o.defaut, source: 'defaut' };
}

/* un ouvrage choisi : { id, ouvrageId, surface (null = automatique), niveau } */
export function calculerOuvrage(choix, table, piecesPlan) {
  const o = (table || OUVRAGES).find(x => x.id === choix.ouvrageId);
  if (!o) return { id: choix.id, manque: 'ouvrage', min: 0, max: 0, med: 0 };
  const auto = surfaceAuto(o, piecesPlan), saisie = nb(choix.surface);
  const surface = o.unite === 'forfait' ? 1 : saisie != null && saisie >= 0 ? saisie : auto.valeur;
  const niveau = choix.niveau || 'standard', p = prixNiveau(o.prix, niveau);
  if (!p) return { id: choix.id, ouvrage: o, surface, niveau, manque: 'prix', min: 0, max: 0, med: 0 };
  return { id: choix.id, ouvrage: o, surface, niveau, source: saisie != null && o.unite !== 'forfait' ? 'saisie' : auto.source, detail: auto.detail || '',
    auto: auto.valeur, min: p.min * surface, max: p.max * surface, med: (p.min + p.max) / 2 * surface };
}

/* les ouvrages proposés d'après l'étape Projet. Une rénovation importante
   propose la rénovation complète, qui comprend déjà les postes intérieurs. */
export function ouvragesSuggeres(types, categories, table, dejaPris) {
  const T = new Set(types || []), C = new Set(categories || []), pris = new Set((dejaPris || []).map(c => c.ouvrageId));
  const complete = C.has('Rénovation importante');
  const interieurs = new Set(['cuisine', 'sdb', 'peinture', 'sols', 'electricite', 'plomberie', 'rafraichissement']);
  return (table || OUVRAGES).filter(o => !pris.has(o.id) && (o.types.some(t => T.has(t)) || o.categories.some(c => C.has(c)))
    && !(complete && interieurs.has(o.id))
    // l'isolation par l'extérieur n'est proposée que si la façade est cochée (la case « énergétique » seule ne suffit pas)
    && !(o.id === 'ite' && !T.has('Façade')));
}

/* l'estimation complète : ouvrages (R1) + postes détaillés éventuels, mêmes ajustements */
export function calculerEstimation(budget, table, piecesPlan, fourchettes) {
  const b = budget || {}, a = b.ajust || {};
  const ouvrages = (b.ouvrages || []).map(c => calculerOuvrage(c, table, piecesPlan));
  const detail = calculerBudget({ lignes: b.lignes || [], ajust: {} }, fourchettes || [], piecesPlan);
  const s = ouvrages.reduce((t, o) => ({ min: t.min + o.min, max: t.max + o.max }), { min: detail.sousTotal.min, max: detail.sousTotal.max });
  const majoration = (nb(a.etat) || 0) + (nb(a.acces) || 0) + Math.min(IMPREVUS_MAX, Math.max(0, nb(a.imprevus) || 0));
  const total = { min: cent(s.min * (1 + majoration)), max: cent(s.max * (1 + majoration)) };
  return { ouvrages, detail, majoration: Math.round(majoration * 100) / 100, total,
    manques: ouvrages.filter(o => o.manque).length + detail.manques, vide: !ouvrages.length && !detail.lignes.length };
}
