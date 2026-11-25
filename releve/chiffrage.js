/* Chiffrage précis depuis le relevé — sans navigateur ni réseau : ce module se
   teste seul (tests/t_releve_chiffrage_precis.js).

   Le budget de premier rendez-vous (budget.js) donne une fourchette par type
   de travaux, à partir de prix au m² moyens. Ici, on va plus loin : un
   détail estimatif par lots, avec les articles et les prix de CP
   Constructions, dont les quantités viennent des surfaces du plan scanné.

   Le dépôt est public : AUCUN prix ni article de CP ne vit dans ce fichier.
   Le catalogue (articles, prix, gabarits) est une ligne de la table
   `releve_reglages` (id « chiffrage »), lue par l'application comme les prix
   au m² ; sans cette ligne, le bloc ne s'affiche pas.

   Principe des quantités : un gabarit est un dossier de référence (ses
   lignes et ses surfaces). Chaque article de ce dossier est remis à
   l'échelle du nouveau relevé par la grandeur qui le pilote — surface
   habitable `S`, garage et annexes `Sg`, périmètre extérieur `P`, ou aucune
   (`CONST` : forfaits, équipements). C'est une estimation d'avant-projet,
   toujours corrigeable ligne à ligne ; jamais un métré. */

/* les grandeurs du relevé qui pilotent les quantités */
export const PILOTES = [
  ['S', 'Surface habitable (m²)'],
  ['Sg', 'Garage et annexes (m²)'],
  ['P', 'Périmètre extérieur (m)'],
];

/* une pièce de garage n'est pas de la surface habitable : ses plafonds, son
   enduit et sa dalle ne se chiffrent pas comme le reste de la maison */
const EST_ANNEXE = /garage|carport|abri\b|remise|atelier|bûcher|bucher/i;

/* le périmètre n'est pas lu sur le plan (la somme des périmètres de pièces
   compterait deux fois les murs communs) : estimé d'après la surface, à
   corriger. Le rapport vient des maisons plain-pied déjà chiffrées par CP. */
export const RAPPORT_PERIMETRE = 0.667;
export const perimetreEstime = S => Math.round((+S || 0) * RAPPORT_PERIMETRE * 10) / 10;

const arr1 = x => Math.round(x * 10) / 10, arr2 = x => Math.round(x * 100) / 100;

/* les pilotes lus dans les pièces du plan (budget.js, piecesDuPlan) ; null
   sans plan : on ne fabrique jamais de surface */
export function pilotesDepuisPlan(pieces) {
  const L = (pieces || []).filter(p => p && p.sol > 0);
  if (!L.length) return null;
  let S = 0, Sg = 0;
  for (const p of L) { if (EST_ANNEXE.test(p.nom || '')) Sg += p.sol; else S += p.sol; }
  return { S: arr2(S), Sg: arr2(Sg), P: perimetreEstime(S), source: 'plan' };
}

/* les questions d'affinage (vide sanitaire, chauffage, couverture…) : une
   ligne du catalogue, jamais dans le dépôt. Chaque question a des choix ; le
   premier est la référence (« comme le dossier ») et ne change rien. Un autre
   choix retire les articles listés dans `retire` puis ajoute ses propres
   lignes [code, pilote, rapport] : quantité = rapport × le pilote du relevé
   (CONST : la quantité elle-même). */
export const questionsDe = d => (d && Array.isArray(d.questions) ? d.questions : [])
  .filter(q => q && q.id && Array.isArray(q.choix) && q.choix.length > 1 && q.choix[0] && q.choix.every(c => c && c.id));
export const choixDe = (q, options) => q.choix.find(c => c.id === (options || {})[q.id]) || q.choix[0];
export const nbReponses = (d, options) => questionsDe(d).filter(q => choixDe(q, options) !== q.choix[0]).length;

const pilotesDe = p => { const S = +p.S || 0, Sg = +p.Sg || 0; return { S, Sg, P: +p.P || perimetreEstime(S), T: S + Sg, CONST: 1 }; };

/* le gabarit le plus proche en surface totale ; un gabarit avec garage ne
   sert pas un projet sans garage, et inversement (les lignes de garage ne
   suivraient pas) */
export function gabaritProche(donnees, pilotes) {
  const G = (donnees && donnees.gabarits) || [];
  if (!G.length) return null;
  const cible = (+pilotes.S || 0) + (+pilotes.Sg || 0), garage = (+pilotes.Sg || 0) > 0;
  let meilleur = null, mieux = Infinity;
  for (const g of G) {
    const d = Math.abs((g.S + (g.Sg || 0)) - cible) + ((g.Sg || 0) > 0 !== garage ? 15 : 0);
    if (d < mieux) { mieux = d; meilleur = g; }
  }
  return meilleur;
}

/* l'écart de taille entre le projet et son gabarit : au-delà de 25 %, la
   mise à l'échelle devient hasardeuse et l'écran le dit */
export function ecartGabarit(g, pilotes) {
  const a = g.S + (g.Sg || 0), b = (+pilotes.S || 0) + (+pilotes.Sg || 0);
  return a > 0 ? Math.abs(b - a) / a : 1;
}

/* les lignes d'un gabarit, remises à l'échelle des pilotes. `nouvelId` est
   fourni par l'appelant (identifiants stables, modele.js) */
export function genererLignes(donnees, gabaritId, pilotes, nouvelId, options) {
  const g = ((donnees && donnees.gabarits) || []).find(x => x.id === gabaritId);
  if (!g) return [];
  const cible = pilotesDe(pilotes), ref = pilotesDe(g), sortie = [];
  for (const [code, qte] of g.lignes) {
    const a = donnees.articles[code];
    if (!a) continue;                                   // article retiré du catalogue depuis
    const d = a.d || 'CONST';
    let q = qte;
    if (d !== 'CONST') q = ref[d] > 0 ? qte * cible[d] / ref[d] : 0;   // gabarit sans garage : pas de ligne de garage
    // des pièces entières pour les articles comptés à l'unité (une porte, un regard)
    q = a.u === 'U' && d !== 'CONST' && qte >= 1 ? Math.max(1, Math.round(q)) : arr2(q);
    if (q > 0) sortie.push({ id: nouvelId(), code, qte: q, qte0: q });
  }
  // les réponses aux questions, dans l'ordre du catalogue
  for (const qu of questionsDe(donnees)) {
    const ch = choixDe(qu, options);
    if (ch === qu.choix[0]) continue;
    const retire = new Set(qu.retire || []);
    for (let i = sortie.length - 1; i >= 0; i--) if (retire.has(sortie[i].code)) sortie.splice(i, 1);
    for (const [code, drv, rapport] of ch.lignes || []) {
      const a = donnees.articles[code];
      if (!a || sortie.some(l => l.code === code)) continue;
      let q = drv === 'CONST' || !cible[drv] ? +rapport : rapport * cible[drv];
      q = a.u === 'U' ? Math.max(1, Math.round(q)) : arr2(q);
      if (q > 0) sortie.push({ id: nouvelId(), code, qte: q, qte0: q });
    }
  }
  return sortie;
}

/* le prix d'une ligne : celui qu'on a tapé, sinon le prix du catalogue, avec
   la majoration de marge arrière des lots concernés si elle est active */
export const retroDuLot = (donnees, lot) => !!(donnees.retro && (donnees.retro.lots || []).includes(lot));
export function prixLigne(donnees, ligne, retroActive) {
  const a = donnees.articles[ligne.code];
  if (!a) return { pu: ligne.pu != null ? +ligne.pu : 0, retro: 0, lot: null, inconnu: true };
  if (ligne.pu != null) return { pu: +ligne.pu, retro: 0, lot: a.lot, saisi: true };
  // article sans prix au catalogue : jamais de prix inventé, compté à 0 et signalé
  if (a.pu == null) return { pu: 0, retro: 0, lot: a.lot, aChiffrer: true };
  const taux = retroActive && retroDuLot(donnees, a.lot) ? (donnees.retro.pct || 0) : 0;
  const pu = Math.round(a.pu * (1 + taux) * 100) / 100;
  return { pu, retro: Math.round((pu - a.pu) * 100) / 100, lot: a.lot };
}

/* le détail par lots et le bilan interne. La marge ne sort jamais vers le
   client : ce calcul ne sert qu'à l'écran de visite (le dossier client ne lit
   que l'estimation de budget.js). */
export function chiffrer(donnees, lignes, { coef, tva, retro } = {}) {
  const c = +coef || donnees.coef || 1, t = (tva != null ? +tva : donnees.tva != null ? donnees.tva : 20) / 100;
  const parLot = new Map(); let artisan = 0, retroHT = 0, aChiffrer = 0;
  for (const l of lignes || []) {
    const a = donnees.articles[l.code], p = prixLigne(donnees, l, retro !== false);
    const lot = (a && a.lot) || 'divers', total = Math.round((+l.qte || 0) * p.pu * 100) / 100;
    if (!parLot.has(lot)) parLot.set(lot, { lot, nom: (donnees.lots || {})[lot] || lot, total: 0, lignes: [] });
    const L = parLot.get(lot); L.total = Math.round((L.total + total) * 100) / 100;
    L.lignes.push({ ...l, libelle: a ? a.l : 'Article retiré du catalogue (' + l.code + ')', unite: a ? a.u : '', pu: p.pu, total, saisi: !!p.saisi, inconnu: !!p.inconnu, aChiffrer: !!p.aChiffrer });
    artisan += total; if (p.aChiffrer) aChiffrer++; retroHT += (+l.qte || 0) * p.retro;
  }
  artisan = Math.round(artisan * 100) / 100;
  const venteHT = Math.round(artisan * c * 100) / 100, venteTTC = Math.round(venteHT * (1 + t) * 100) / 100;
  const artisanTTC = Math.round(artisan * (1 + t) * 100) / 100;
  const margeAnnoncee = Math.round((venteTTC - artisanTTC) * 100) / 100, retroTTC = Math.round(retroHT * (1 + t) * 100) / 100;
  return {
    lots: [...parLot.values()].sort((a, b) => a.lot.localeCompare(b.lot)),
    aChiffrer, artisanHT: artisan, venteHT, venteTTC, coef: c, tva: t * 100,
    margeAnnoncee, retroTTC, margeTotale: Math.round((margeAnnoncee + retroTTC) * 100) / 100,
    pourcentMarge: venteTTC > 0 ? arr1((margeAnnoncee + retroTTC) / venteTTC * 100) : 0,
  };
}

/* un article ajouté à la main depuis le catalogue (quantité 1 à défaut) */
export const nouvelleLigne = (donnees, code, qte, nouvelId) =>
  donnees.articles[code] ? { id: nouvelId(), code, qte: +qte > 0 ? arr2(+qte) : 1, qte0: null } : null;

/* recalculer les quantités après un changement de surface ou de gabarit,
   sans jamais écraser ce que l'utilisateur a touché : une ligne dont la
   quantité a été retapée (qte ≠ qte0), un prix saisi ou un article ajouté à
   la main (qte0 nul) sont gardés tels quels ; seules les lignes encore
   « telles que générées » suivent les nouvelles surfaces */
export function rebaser(donnees, lignes, gabaritId, pilotes, nouvelId, options) {
  const neuves = genererLignes(donnees, gabaritId, pilotes, nouvelId, options), parCode = new Map(neuves.map(l => [l.code, l]));
  const sortie = [], vus = new Set();
  for (const l of lignes || []) {
    const n = parCode.get(l.code);
    const retouchee = l.qte0 == null || Math.abs((+l.qte) - (+l.qte0)) > 1e-9 || l.pu != null;
    if (retouchee) { sortie.push(l); if (n) vus.add(l.code); continue; }
    if (n && !vus.has(l.code)) { sortie.push({ ...l, qte: n.qte, qte0: n.qte }); vus.add(l.code); }
    // sinon : l'article n'est plus dans ce gabarit et n'a pas été retouché → il s'en va
  }
  for (const n of neuves) if (!vus.has(n.code)) sortie.push(n);
  return sortie;
}

/* le catalogue lu dans la table est-il utilisable ? (ligne absente, vide ou
   d'une autre version : le bloc reste caché, rien ne casse) */
export const catalogueValide = d => !!(d && d.v === 1 && d.articles && typeof d.articles === 'object' && Array.isArray(d.gabarits) && d.gabarits.length);
