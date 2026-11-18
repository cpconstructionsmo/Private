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
