/* Relevé de visite — l'aide à la vente du premier rendez-vous.

   Repris de l'ancienne « App rénovation » (artefact Claude) pour que tout
   se passe dans le relevé : mensualités indicatives, pistes pour rentrer dans
   le budget du client, calendrier indicatif d'une mission de maîtrise
   d'œuvre, mémo du vendeur (questions, à proposer, points de vigilance) et
   message de suivi (e-mail, SMS, relance).

   Fonctions pures : l'écran (app.js) les dessine, les tests (tests/
   t_releve_aide_vente.js) les vérifient. Rien n'est écrit dans la visite
   sans un geste de l'utilisateur ; aucun prix n'est inventé ici (les
   montants viennent de l'estimation de l'étape Budget).

   Prudence : la simulation de mensualités reste désactivée tant qu'on ne
   l'a pas activée (« à n'activer qu'après avoir vérifié les règles
   applicables à la présentation d'un crédit à un client »), et elle n'est
   jamais dans le dossier client. */
import * as B from './budget.js';

const nb = v => { if (v === '' || v == null) return null; const n = +String(v).replace(/\s/g, '').replace(',', '.'); return isFinite(n) ? n : null; };
const arrondi100 = v => Math.round(v / 100) * 100;
/* un montant lisible dans un texte (e-mail, SMS) : espaces ordinaires, pas d'espace fine insécable */
export const eur = n => Math.round(n).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ') + ' €';
export const plageTexte = t => 'entre ' + eur(arrondi100(t.min)) + ' et ' + eur(arrondi100(t.max)) + ' TTC';

/* ==========================================================================
   Mensualités indicatives (désactivées par défaut)
   ========================================================================== */
export const DUREES_CREDIT = [36, 60, 84, 120];
export const TAUX_DEFAUT = 5;            // % par an, le taux indicatif de l'ancienne application ; modifiable
export const DUREE_DEFAUT = 60;

/* mensualité d'un capital emprunté sur `mois` mois à `taux` % par an (annuités constantes) */
export function mensualite(capital, taux, mois) {
  const C = Math.max(0, nb(capital) || 0), n = Math.max(1, Math.round(nb(mois) || DUREE_DEFAUT)), r = (nb(taux) || 0) / 1200;
  if (!(C > 0)) return 0;
  return r > 0 ? C * r / (1 - Math.pow(1 + r, -n)) : C / n;
}

/* la simulation sur la fourchette de l'estimation : le capital est le total moins l'apport */
export function simulerCredit(total, fin) {
  const f = fin || {};
  const taux = nb(f.taux) != null ? nb(f.taux) : TAUX_DEFAUT, duree = DUREES_CREDIT.includes(f.duree) ? f.duree : DUREE_DEFAUT, apport = Math.max(0, nb(f.apport) || 0);
  if (!f.actif || !total || !(total.max > 0)) return null;
  const cap = { min: Math.max(0, total.min - apport), max: Math.max(0, total.max - apport) };
  return { taux, duree, apport, capital: cap, mensualite: { min: Math.round(mensualite(cap.min, taux, duree)), max: Math.round(mensualite(cap.max, taux, duree)) } };
}

/* ==========================================================================
   Pour rentrer dans le budget du client
   Chaque piste est recalculée sur l'estimation complète ; rien ne change
   tant qu'on ne touche pas « Appliquer » (c'est l'écran qui applique).
   ========================================================================== */
const milieu = t => (t.min + t.max) / 2;
export function pistesBudget(budget, enveloppe, table, pieces, fourchettes, projet) {
  const env = nb(enveloppe), b0 = budget || {};
  const base = B.calculerEstimation(b0, table, pieces, fourchettes, projet);
  if (env == null || env <= 0 || base.vide || base.total.max <= env) return [];
  const m0 = milieu(base.total), choix = b0.ouvrages || [], out = [];
  const essai = f => { const b = JSON.parse(JSON.stringify({ ...b0, ouvrages: choix })); f(b); return B.calculerEstimation(b, table, pieces, fourchettes, projet); };
  const garder = (texte, action, e) => { const eco = Math.round((m0 - milieu(e.total)) / 100) * 100; if (eco >= 100) out.push({ texte, economie: eco, rentre: e.total.max <= env, nouveau: e.total, action }); };
  if (choix.some(c => c.niveau !== 'eco')) garder('Passer tous les travaux en gamme Éco', { type: 'tousEco' }, essai(b => b.ouvrages.forEach(c => { c.niveau = 'eco'; })));
  base.ouvrages.forEach(r => {
    if (!r.ouvrage || r.manque) return;
    if (r.niveau !== 'eco') garder('« ' + r.ouvrage.nom + ' » en gamme Éco', { type: 'eco', id: r.id }, essai(b => { const c = b.ouvrages.find(x => x.id === r.id); if (c) c.niveau = 'eco'; }));
    garder('Reporter « ' + r.ouvrage.nom + ' » à plus tard (le retirer de ce budget)', { type: 'retirer', id: r.id }, essai(b => { b.ouvrages = b.ouvrages.filter(x => x.id !== r.id); }));
  });
  // d'abord celles qui font rentrer dans le budget en sacrifiant le moins, puis les plus économes
  const entre = out.filter(x => x.rentre).sort((a, b) => a.economie - b.economie), reste = out.filter(x => !x.rentre).sort((a, b) => b.economie - a.economie);
  return entre.concat(reste).slice(0, 3);
}

/* ==========================================================================
   Calendrier indicatif d'une mission de maîtrise d'œuvre
   Les délais (en semaines) sont ceux de l'ancienne application : indicatifs,
   à confirmer. Dates en AAAA-MM-JJ (jamais d'heure : pas de décalage de fuseau).
   ========================================================================== */
export const SEMAINES = { ap: 3, dp: 4, abf: 4, consult: 4, fab: 6, travaux: 10, recep: 2 };
export const OUVRAGES_FABRICATION = ['fenetres', 'cuisine', 'garage-neuf'];   // ce qui se commande et se fabrique avant le chantier

const D = iso => new Date(iso + 'T12:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
export const ajouterJours = (s, j) => { const d = D(s); d.setUTCDate(d.getUTCDate() + j); return iso(d); };
export const dateLongue = s => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? D(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');

export function calendrier({ debut, ouvrageIds, urbanisme, abf, aujourdhui, semaines } = {}) {
  const W = { ...SEMAINES, ...(semaines || {}) }, w = k => Math.max(0, nb(W[k]) || 0);
  const urba = urbanisme !== false, fab = (ouvrageIds || []).some(id => OUVRAGES_FABRICATION.includes(id));
  const dp = urba ? w('dp') + (abf ? w('abf') : 0) : 0, fabS = fab ? w('fab') : 0;
  const pre = w('ap') + dp + w('consult') + fabS;
  const auj = aujourdhui || iso(new Date());
  const auPlusTot = ajouterJours(auj, pre * 7);
  const base = { pre, auPlusTot, fabrication: fab, urbanisme: urba, debut: null, lignes: [], court: false, signerAvant: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(debut || '')) return base;
  const jours = k => Math.round(k * 7);
  const fabDeb = ajouterJours(debut, -jours(fabS)), consultDeb = ajouterJours(fabDeb, -jours(w('consult'))),
        dpDeb = ajouterJours(consultDeb, -jours(dp)), apDeb = ajouterJours(dpDeb, -jours(w('ap'))), fin = ajouterJours(debut, jours(w('travaux')));
  const lignes = [
    { cle: 'signature', libelle: 'Signature de la mission de maîtrise d’œuvre (au plus tard)', date: apDeb },
    { cle: 'ap', libelle: 'Faisabilité et avant-projet', date: apDeb, semaines: w('ap') },
    urba ? { cle: 'dp', libelle: 'Dossier d’urbanisme (déclaration préalable ou permis)', date: dpDeb, semaines: dp } : null,
    { cle: 'consult', libelle: 'Consultation des entreprises et signature des devis', date: consultDeb, semaines: w('consult') },
    fab ? { cle: 'fab', libelle: 'Commande et fabrication (menuiseries, cuisine…)', date: fabDeb, semaines: fabS } : null,
    { cle: 'travaux', libelle: 'Début des travaux', date: debut, semaines: w('travaux') },
    { cle: 'reception', libelle: 'Réception du chantier', date: fin, semaines: w('recep') },
  ].filter(Boolean);
  return { ...base, debut, lignes, court: apDeb < auj, signerAvant: apDeb };
}

/* ==========================================================================
   Le mémo du vendeur : questions à poser, à proposer, points de vigilance.
   Texte repris tel quel de l'ancienne application (interne : jamais dans le
   dossier client). Aucune règle chiffrée : tout renvoie à vérifier.
   ========================================================================== */
export const MEMOS = {
  garage: { titre: 'Garage, extension, nouvelle pièce',
    q: ['Quel usage pour la nouvelle pièce : chambre d’amis, bureau, suite parentale ?', 'Le garage est-il isolé, chauffé, relié à l’eau ?', 'Faut-il garder un rangement ou un accès véhicule ?'],
    up: ['Salle d’eau attenante', 'Pompe à chaleur pour le chauffage et l’eau chaude', 'Rangements sur mesure'],
    vig: ['Création de surface : déclaration préalable ou permis à vérifier', 'Règles du PLU, du lotissement ou de la copropriété', 'Isolation, ventilation et électricité à prévoir dès le départ'] },
  sdb: { titre: 'Salle de bains',
    q: ['Douche, baignoire ou les deux ? Qui l’utilise (enfants, mobilité réduite) ?', 'Quels sont les points qui gênent aujourd’hui ?', 'Peut-on déplacer les arrivées et évacuations d’eau ?'],
    up: ['Paroi de douche en verre, colonne thermostatique', 'WC suspendu, sèche-serviettes', 'Meuble double vasque avec rangements'],
    vig: ['Étanchéité sous carrelage et autour du receveur', 'Ventilation de la pièce', 'Respect des volumes de sécurité électrique'] },
  cuisine: { titre: 'Cuisine',
    q: ['Cuisine ouverte ou fermée ? Combien de personnes cuisinent ?', 'Linéaire, en L, en U ou avec îlot ?', 'Quel électroménager garde-t-on ?'],
    up: ['Îlot central ou table intégrée', 'Électroménager encastrable', 'Plan de travail et crédence assortis'],
    vig: ['Arrivées d’eau, évacuations et hotte à repositionner ?', 'Alimentations électriques dédiées (plaque, four, lave-vaisselle)', 'Si un mur est ouvert : le mur est-il porteur ?'] },
  mur: { titre: 'Ouverture d’un mur',
    q: ['Quel est l’objectif : plus de lumière, plus d’espace, une pièce de vie ?', 'Sait-on si le mur est porteur ? Que passe-t-il dedans (gaines, électricité) ?', 'Maison individuelle ou copropriété ?'],
    up: ['Reprise des sols et de la peinture dans les deux pièces', 'Cuisine ouverte sur le séjour', 'Éclairage à repenser'],
    vig: ['Mur porteur : étude de structure par un professionnel et étaiement', 'Copropriété : accord de l’assemblée générale à vérifier', 'Réseaux encastrés à dévoyer'] },
  carrelage: { titre: 'Sols',
    q: ['Quelles pièces, et quel rendu : grand format, imitation bois, béton ?', 'Sol actuel : à déposer ? Chauffage au sol ?', 'Seuils et hauteurs de portes : y a-t-il des contraintes ?'],
    up: ['Plinthes assorties', 'Dépose de l’ancien sol et chape neuve', 'Sol uniforme pour agrandir visuellement l’espace'],
    vig: ['Planéité et humidité du support', 'Hauteur finie par rapport aux portes', 'Joints de fractionnement sur les grandes surfaces'] },
  peinture: { titre: 'Peinture',
    q: ['Quelles pièces, quelles couleurs, quelle finition ?', 'État des murs : fissures, humidité, anciens papiers peints ?', 'Meubles à déplacer ou à protéger ?'],
    up: ['Peinture lessivable dans les pièces d’usage', 'Boiseries et radiateurs', 'Plafonds'],
    vig: ['Traces d’humidité à traiter avant de peindre', 'Préparation des supports : c’est elle qui fait la durée du résultat', 'Présence éventuelle d’anciens enduits ou peintures à contrôler selon l’âge du bâtiment'] },
  fenetres: { titre: 'Fenêtres',
    q: ['Pourquoi changer : froid, bruit, esthétique, sécurité ?', 'Matériau et couleur souhaités ? Volets existants ?', 'Combien d’ouvertures et de quelles dimensions ?'],
    up: ['Volets roulants électriques', 'Porte d’entrée assortie', 'Fenêtres de toit motorisées'],
    vig: ['Relevé de cotes précis et type de pose', 'Modification de l’aspect extérieur : déclaration préalable à vérifier', 'Copropriété ou secteur protégé : règles particulières'] },
  chauffage: { titre: 'Chauffage',
    q: ['Quel système aujourd’hui et quelle consommation annuelle ?', 'Quelle surface chauffer, quelle isolation ?', 'Besoin de rafraîchissement l’été ?'],
    up: ['Ballon thermodynamique pour l’eau chaude', 'Isolation des combles pour réduire les besoins', 'Programmation connectée'],
    vig: ['Dimensionnement par un professionnel qualifié', 'Emplacement et bruit de l’unité extérieure, distance avec le voisinage', 'Conditions éventuelles pour bénéficier d’aides : à vérifier avant de les annoncer'] },
  isolation: { titre: 'Isolation',
    q: ['Où ressent-on le froid ou l’humidité ?', 'Combles accessibles ? Murs en pierre, brique, parpaing ?', 'Quels travaux sont prévus par ailleurs (peinture, électricité) ?'],
    up: ['Isolation des combles : souvent le geste le plus rentable', 'Ventilation adaptée', 'Fenêtres performantes pour un ensemble cohérent'],
    vig: ['Humidité et ventilation avant d’isoler', 'Perte de surface habitable avec un doublage intérieur', 'Ponts thermiques aux liaisons'] },
  elec: { titre: 'Électricité',
    q: ['Âge de l’installation ? Tableau électrique d’origine ?', 'Quels besoins nouveaux : prises, éclairage, domotique, borne de recharge ?', 'Quelles pièces sont concernées ?'],
    up: ['Tableau neuf', 'Prises et éclairages supplémentaires', 'Préparation d’une borne de recharge ou de volets connectés'],
    vig: ['Conformité à la norme en vigueur et contrôle avant mise en service', 'Intervention par un électricien qualifié', 'Puissance du compteur à vérifier'] },
};
/* quel mémo pour quels travaux de l'estimation (identifiants de OUVRAGES) */
export const MEMO_DE_OUVRAGE = {
  cuisine: 'cuisine', sdb: 'sdb', peinture: 'peinture', rafraichissement: 'peinture', sols: 'carrelage', electricite: 'elec',
  combles: 'isolation', iti: 'isolation', ite: 'isolation', fenetres: 'fenetres', pac: 'chauffage', extension: 'garage', 'garage-neuf': 'garage',
};
/* les mémos des travaux choisis, sans doublon, dans l'ordre ; le mémo « mur » s'ajoute si les souhaits parlent d'ouvrir un mur */
export function memosPour(ouvrageIds, souhaits) {
  const cles = [];
  (ouvrageIds || []).forEach(id => { const k = MEMO_DE_OUVRAGE[id]; if (k && !cles.includes(k)) cles.push(k); });
  if (/\b(mur|murs|cloison|cloisons)\b|ouvrir|ouverture/i.test(souhaits || '') && !cles.includes('mur')) cles.push('mur');
  return cles.map(k => ({ cle: k, ...MEMOS[k] }));
}

/* ==========================================================================
   Le message de suivi : e-mail après le rendez-vous, SMS, relance.
   Écrit à la première personne, modifiable à l'écran avant tout envoi.
   ========================================================================== */
export const TYPES_MESSAGE = [['mail', 'E-mail'], ['relance', 'Relance'], ['sms', 'SMS']];
export const civiliteLongue = c => (/^mme|madame/i.test(c || '') ? 'Madame' : /^m\.?$|monsieur/i.test((c || '').trim()) ? 'Monsieur' : /^m\. et mme/i.test(c || '') ? 'Monsieur et Madame' : '');

export function messageSuivi(type, d) {
  const x = d || {}, f = x.fourchette;
  const bonjour = x.nom ? 'Bonjour ' + [civiliteLongue(x.civilite), x.nom].filter(Boolean).join(' ') + ',' : 'Bonjour,';
  const signature = x.signature || 'CP Constructions';
  const quand = x.dateVisite ? ' du ' + dateLongue(x.dateVisite) : '';
  const plage = f && f.max > 0 ? plageTexte(f) : null;
  const cal = x.debut && x.signerAvant ? 'Pour un démarrage des travaux le ' + dateLongue(x.debut) + ', la signature de la mission serait à prévoir avant le ' + dateLongue(x.signerAvant) + '.' : '';
  if (type === 'sms') {
    return bonjour + ' c’est ' + (x.expediteur || 'CP Constructions') + '. Merci pour notre échange' + quand + '.' +
      (plage ? ' D’après notre estimation, votre projet se situe ' + plage + ' (indicatif).' : '') +
      ' Je vous envoie le récapitulatif par e-mail. Je reste disponible pour la suite : relevé sur place et devis détaillé, sans engagement.';
  }
  if (type === 'relance') {
    return bonjour + '\n\nJe me permets de revenir vers vous au sujet de votre projet' + (plage ? ', dont l’estimation indicative se situe ' + plage : '') + '.\n\n' +
      'Avez-vous pu y réfléchir ? Je peux répondre à vos questions, ajuster le périmètre ou le budget, ou fixer un relevé sur place pour affiner le chiffrage.' +
      (cal ? '\n\n' + cal : '') + '\n\nBien cordialement,\n' + signature;
  }
  const lignes = (x.lignes || []).filter(l => l && l.libelle && l.max > 0).map(l => '• ' + l.libelle + ' : ' + (l.min === l.max ? 'environ ' + eur(l.max) : 'de ' + eur(arrondi100(l.min)) + ' à ' + eur(arrondi100(l.max))) + ' TTC').join('\n');
  return bonjour + '\n\nMerci pour notre échange' + quand + '.' + (lignes ? ' Comme convenu, voici le récapitulatif de votre projet :\n\n' + lignes : '') +
    (plage ? '\n\nEstimation globale : ' + plage + '. Cette estimation est indicative et non contractuelle ; elle sera précisée après relevé sur place.' : '') +
    (cal ? '\n\n' + cal : '') +
    '\n\nProchaine étape : un relevé sur place et un devis détaillé, sans engagement de votre part. Le récapitulatif est joint à ce message.\n\nBien cordialement,\n' + signature;
}
