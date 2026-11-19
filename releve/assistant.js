/* Relevé de visite — l'assistant de visite.

   Le métreur raconte la visite d'un trait (dictée libre) ; la fonction du
   serveur (supabase/functions/imaginer, action « structurer ») la confie à
   Gemini, qui rend une fiche en JSON. Ce module ne lui fait pas confiance :
   - seuls les champs connus passent, et les choix doivent être dans les
     listes du relevé (civilités, travaux, délais…) ; le reste est écarté ;
   - un champ vide se remplit (coché d'office) ; un champ déjà rempli d'une
     autre valeur est proposé décoché (« remplace … ») — rien de saisi n'est
     écrasé sans que le métreur le choisisse ;
   - listes (travaux, ampleur) et textes (situation, souhaits) se complètent,
     sans doublon ; les pièces citées s'ajoutent, ou complètent la note
     d'une pièce du même nom.
   Fonctions pures. Tests : tests/t_releve_assistant.js. */
import * as M from './modele.js';

export const listesPourIA = () => ({ civilites: M.CIVILITES, types: M.TYPES_TRAVAUX, categories: M.CATEGORIES_RENO,
  usages: M.USAGES_BIEN, delais: M.DELAIS, formes: M.FORMES_SOCIETE });

const txt = (v, max = 200) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const long = (v, max = 2000) => typeof v === 'string' ? v.replace(/[ \t]+/g, ' ').trim().slice(0, max) : '';
const sansAccents = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
/* un choix de liste : la valeur exacte, sans compter majuscules, accents ni apostrophes */
const cleChoix = s => sansAccents(s).replace(/[’'`]/g, ' ').replace(/\s+/g, ' ');
const dans = (liste, v) => { const t = cleChoix(txt(v)); return t ? liste.find(x => cleChoix(x) === t) || '' : ''; };
/* le délai dit librement (« dans 6 mois », « d'ici 2 mois », « au plus vite »…) ramené à la liste */
export function delaiSouple(v) {
  const exact = dans(M.DELAIS, v); if (exact) return exact;
  const t = cleChoix(txt(v)); if (!t) return '';
  const D = i => M.DELAIS[i];
  if (/pas press|pas urgent|plus tard|aucune urgence|pas de date/.test(t)) return D(4);
  if (/urgent|au plus vite|vite|rapidement|tout de suite|des que possible|asap|immediat|semaine/.test(t)) return D(0);
  const n = t.match(/(\d+)\s*mois/);
  if (n) { const m = +n[1]; return m <= 3 ? D(1) : m <= 6 ? D(2) : m <= 12 ? D(3) : D(4); }
  if (/\b(un|1)\s*an\b|annee|fin d an|cette annee/.test(t)) return D(3);
  if (/\b([2-9]|deux|trois)\s*ans\b/.test(t)) return D(4);
  return '';
}

/* ce que dit la fiche de l'IA, champ par champ, une fois vérifié */
function lire(f) {
  const o = f && typeof f === 'object' ? f : {};
  const c = o.client || {}, s = o.societe || {}, a = o.acheteur2 || {}, b = o.bien || {}, p = o.projet || {};
  const tel = t => { const x = txt(t, 30); return x && M.telephoneValide(x) ? x : ''; };
  const mail = t => { const x = txt(t, 120).toLowerCase(); return x && M.emailValide(x) ? x : ''; };
  const env = Number(String(p.enveloppe ?? '').replace(/[^\d.,]/g, '').replace(',', '.'));
  return {
    'client.civilite': dans(M.CIVILITES, c.civilite), 'client.nom': txt(c.nom, 80).toUpperCase(), 'client.prenom': txt(c.prenom, 80),
    'client.telephone': tel(c.telephone), 'client.email': mail(c.email), 'client.adresse': txt(c.adresse, 160),
    'client.codePostal': /^\d{5}$/.test(txt(c.codePostal)) ? txt(c.codePostal) : '', 'client.ville': txt(c.ville, 80),
    'societe.raisonSociale': txt(s.raisonSociale, 120), 'societe.forme': dans(M.FORMES_SOCIETE, s.forme),
    'acheteur2.civilite': dans(['M.', 'Mme'], a.civilite), 'acheteur2.nom': txt(a.nom, 80).toUpperCase(), 'acheteur2.prenom': txt(a.prenom, 80),
    'acheteur2.telephone': tel(a.telephone), 'acheteur2.email': mail(a.email),
    'bien.usage': dans(M.USAGES_BIEN, b.usage),
    'projet.categories': (Array.isArray(p.categories) ? p.categories : []).map(x => dans(M.CATEGORIES_RENO, x)).filter(Boolean),
    'projet.types': (Array.isArray(p.types) ? p.types : []).map(x => dans(M.TYPES_TRAVAUX, x)).filter(Boolean),
    'projet.typeAutre': txt(p.typeAutre, 120), 'projet.situation': long(p.situation), 'projet.souhaits': long(p.souhaits),
    'projet.delai': delaiSouple(p.delai),
    'projet.enveloppe': isFinite(env) && env >= 1000 && env <= 5000000 ? Math.round(env) : null,
    pieces: (Array.isArray(o.pieces) ? o.pieces : []).map(x => ({ nom: txt(x && x.nom, 40), note: long(x && x.note, 500) })).filter(x => x.nom).slice(0, 20),
  };
}

const LIBELLES = {
  'client.civilite': 'Civilité', 'client.nom': 'Nom', 'client.prenom': 'Prénom', 'client.telephone': 'Téléphone', 'client.email': 'E-mail',
  'client.adresse': 'Adresse des travaux', 'client.codePostal': 'Code postal', 'client.ville': 'Ville',
  'client.type': 'Client', 'societe.raisonSociale': 'Raison sociale', 'societe.forme': 'Forme de la société',
  'client.nbAcheteurs': 'Nombre d’acheteurs', 'acheteur2.civilite': 'Acheteur 2 : civilité', 'acheteur2.nom': 'Acheteur 2 : nom',
  'acheteur2.prenom': 'Acheteur 2 : prénom', 'acheteur2.telephone': 'Acheteur 2 : téléphone', 'acheteur2.email': 'Acheteur 2 : e-mail',
  'bien.usage': 'Usage du bien', 'projet.categories': 'Ampleur', 'projet.types': 'Travaux', 'projet.typeAutre': 'Autres travaux',
  'projet.situation': 'Situation actuelle', 'projet.souhaits': 'Souhaits du client', 'projet.delai': 'Délai', 'projet.enveloppe': 'Enveloppe (TTC)',
};
export const libelleChamp = cle => LIBELLES[cle] || cle;

/* les propositions à relire : { champs:[{cle, valeur, actuel, coche, mode}], pieces:[{nom, note, pieceId?}] } */
export function propositions(fiche, v) {
  const L = lire(fiche), champs = [];
  const actuel = cle => M.valeur(v, cle);
  const vide = x => x == null || x === '' || (Array.isArray(x) && !x.length);
  const proposer = (cle, valeur) => {
    if (vide(valeur)) return;
    const a = actuel(cle);
    if (Array.isArray(valeur)) {                                       // une liste se complète
      const union = [...new Set([...(a || []), ...valeur])];
      if (union.length !== (a || []).length) champs.push({ cle, valeur: union, actuel: a, coche: true, mode: 'complete' });
      return;
    }
    if (cle === 'projet.situation' || cle === 'projet.souhaits') {     // un texte se complète, sans répéter
      if (vide(a)) champs.push({ cle, valeur, actuel: a, coche: true, mode: 'remplit' });
      else if (!sansAccents(a).includes(sansAccents(valeur))) champs.push({ cle, valeur: a + '\n' + valeur, actuel: a, coche: true, mode: 'complete' });
      return;
    }
    if (vide(a)) champs.push({ cle, valeur, actuel: a, coche: true, mode: 'remplit' });
    else if (sansAccents(a) !== sansAccents(valeur)) champs.push({ cle, valeur, actuel: a, coche: false, mode: 'remplace' });
  };
  ['client.civilite', 'client.nom', 'client.prenom', 'client.telephone', 'client.email', 'client.adresse', 'client.codePostal', 'client.ville']
    .forEach(k => proposer(k, L[k]));
  if (L['societe.raisonSociale']) {
    if (!M.estSociete(v)) champs.push({ cle: 'client.type', valeur: 'societe', actuel: M.valeur(v, 'client.type'), coche: true, mode: 'remplit' });
    proposer('societe.raisonSociale', L['societe.raisonSociale']); proposer('societe.forme', L['societe.forme']);
  }
  if (L['acheteur2.nom'] || L['acheteur2.prenom']) {
    if (!M.estSociete(v) && M.nbAcheteurs(v) < 2) champs.push({ cle: 'client.nbAcheteurs', valeur: 2, actuel: M.nbAcheteurs(v), coche: true, mode: 'remplit' });
    ['acheteur2.civilite', 'acheteur2.nom', 'acheteur2.prenom', 'acheteur2.telephone', 'acheteur2.email'].forEach(k => proposer(k, L[k]));
  }
  ['bien.usage', 'projet.categories', 'projet.types', 'projet.typeAutre', 'projet.situation', 'projet.souhaits', 'projet.delai', 'projet.enveloppe']
    .forEach(k => proposer(k, L[k]));
  if (L['projet.typeAutre'] && !(M.valeur(v, 'projet.types') || []).includes('Autre') && !L['projet.types'].includes('Autre')) {
    const t = champs.find(c => c.cle === 'projet.types');
    if (t) t.valeur = [...t.valeur, 'Autre']; else champs.push({ cle: 'projet.types', valeur: [...(M.valeur(v, 'projet.types') || []), 'Autre'], actuel: M.valeur(v, 'projet.types'), coche: true, mode: 'complete' });
  }
  /* les pièces : une pièce du même nom reçoit la note, sinon elle s'ajoute */
  const existantes = M.actifs(v.pieces);
  const pieces = [];
  L.pieces.forEach(x => {
    const p = existantes.find(e => sansAccents(e.nom) === sansAccents(x.nom));
    if (!p) { if (!pieces.some(y => sansAccents(y.nom) === sansAccents(x.nom))) pieces.push({ nom: x.nom, note: x.note, coche: true }); }
    else if (x.note && !sansAccents(p.note || '').includes(sansAccents(x.note))) pieces.push({ nom: p.nom, note: x.note, pieceId: p.id, coche: true });
  });
  return { champs, pieces };
}

/* applique les propositions cochées à la visite (modifications datées, fusionnables) */
export function appliquer(v, prop, quand = new Date().toISOString()) {
  let w = v;
  (prop.champs || []).filter(c => c.coche).forEach(c => { w = M.modifier(w, c.cle, c.valeur, quand); });
  (prop.pieces || []).filter(p => p.coche).forEach(p => {
    if (p.pieceId && w.pieces[p.pieceId]) {
      const avant = w.pieces[p.pieceId].note || '';
      w = M.majElement(w, 'pieces', p.pieceId, { note: avant ? avant + '\n' + p.note : p.note }, quand);
    } else {
      const id = M.nouvelId();
      w = M.ajouterPiece(w, p.nom, quand, id);
      if (p.note) w = M.majElement(w, 'pieces', id, { note: p.note }, quand);
    }
  });
  return w;
}
