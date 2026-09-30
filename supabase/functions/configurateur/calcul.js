// Le calcul d'un panier de choix client, à partir du catalogue publié pour
// son dossier. C'est la seule règle de prix : la fonction « configurateur »
// l'applique côté serveur (elle seule fait foi) ; l'application en garde une
// copie identique (configCalculer dans index.html) pour vérifier, au relevé,
// que le total enregistré est bien celui du catalogue publié — un test
// (tests/t_configurateur.js) s'assure que les deux ne divergent pas.
//
// Catalogue publié : { prixVersion, budgetTTC|null, questions:[{ id, titre,
//   type:'unique'|'multiple', options:[{ id, libelle, nature, prixTTC, max }] }] }
//   nature : 'inclus' (compris, 0 €), 'sans' (sans incidence, 0 € — « non,
//   je ne le retiens pas »), 'plus' (plus-value), 'moins' (moins-value, prix
//   positif déduit), 'chiffrer' (prix inconnu).
// Panier : [{ optionId, quantite }].
//
// Un prix absent n'est jamais zéro : une plus-value ou une moins-value sans
// prix compte « à chiffrer ». Les montants sont en euros TTC, arrondis au
// centime ligne par ligne, puis sommés.

export function configCalculer(publie, lignes) {
  const erreurs = [];
  const parOption = {};
  ((publie && publie.questions) || []).forEach((q) =>
    (q.options || []).forEach((o) => { parOption[o.id] = { q, o }; }));
  const vues = {};
  const parQuestion = {};
  const out = [];
  (Array.isArray(lignes) ? lignes : []).slice(0, 200).forEach((l) => {
    const id = String((l && l.optionId) || '');
    const x = parOption[id];
    if (!x) { erreurs.push('option_inconnue:' + id.slice(0, 40)); return; }
    if (vues[id]) { erreurs.push('option_en_double:' + id); return; }
    vues[id] = 1;
    const max = Math.max(1, Math.min(99, Math.floor(+x.o.max || 1)));
    const qte = Math.floor(+((l && l.quantite) === undefined ? 1 : l.quantite));
    if (!(qte >= 1 && qte <= max)) { erreurs.push('quantite:' + id); return; }
    parQuestion[x.q.id] = (parQuestion[x.q.id] || 0) + 1;
    if (x.q.type !== 'multiple' && parQuestion[x.q.id] > 1) { erreurs.push('choix_unique:' + x.q.id); return; }
    const prix = x.o.prixTTC === null || x.o.prixTTC === undefined || x.o.prixTTC === '' ? null : +x.o.prixTTC;
    let nature = x.o.nature;
    // attention : null >= 0 est vrai en JavaScript — un prix doit être un nombre
    if ((nature === 'plus' || nature === 'moins') && !(typeof prix === 'number' && isFinite(prix) && prix >= 0)) nature = 'chiffrer';
    if (['inclus', 'sans', 'plus', 'moins', 'chiffrer'].indexOf(nature) < 0) nature = 'chiffrer';
    const montant = nature === 'inclus' || nature === 'sans' ? 0
      : nature === 'plus' ? Math.round(prix * qte * 100) / 100
      : nature === 'moins' ? -Math.round(prix * qte * 100) / 100
      : null;
    out.push({ optionId: id, questionId: x.q.id, question: x.q.titre || '', libelle: x.o.libelle || '',
      nature, quantite: qte, prixTTC: nature === 'chiffrer' ? null : (nature === 'inclus' || nature === 'sans' ? 0 : prix), montantTTC: montant });
  });
  const somme = (f) => Math.round(out.filter(f).reduce((s, l) => s + l.montantTTC, 0) * 100) / 100;
  const plusTTC = somme((l) => l.nature === 'plus');
  const moinsTTC = somme((l) => l.nature === 'moins');
  const netTTC = Math.round((plusTTC + moinsTTC) * 100) / 100;
  const budget = publie && publie.budgetTTC !== null && publie.budgetTTC !== undefined && publie.budgetTTC !== '' ? +publie.budgetTTC : null;
  return {
    prixVersion: (publie && publie.prixVersion) || 1,
    lignes: out, erreurs, plusTTC, moinsTTC, netTTC,
    aChiffrer: out.filter((l) => l.nature === 'chiffrer').length,
    resteBudgetTTC: budget === null || !isFinite(budget) ? null : Math.round((budget - netTTC) * 100) / 100,
  };
}
