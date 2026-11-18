/* Relevé de visite — le dossier client (Phase 3).

   Ce que l'on remet ou envoie au client après le premier rendez-vous : son
   projet tel qu'il a été compris, les photos de ses pièces (et les images
   d'intention « ✨ Imaginé »), le plan relevé, et, si on le souhaite, la
   fourchette de budget indicative. Il se construit depuis la visite, sur
   l'appareil, sans réseau ; l'écran le met en page et l'imprime (ou
   l'enregistre en PDF, ce que propose l'iPhone dans « Imprimer »).

   Ce qui n'y figure jamais : les notes de visite (internes), ce qui manque
   à la fiche, la marge (il n'y en a pas dans une fourchette de premier
   rendez-vous, et le chiffrage détaillé se remet après étude). Les notes
   des pièces n'y vont que si on les coche.

   Fonction pure : elle rend des données, l'écran (app.js) les dessine.
   Tests : tests/t_releve_dossier.js. */
import * as M from './modele.js';
import * as B from './budget.js';

export const OPTIONS_DEFAUT = { estimation: true, imagines: true, notesPieces: false, enveloppe: false };

const txt = v => (typeof v === 'string' ? v.trim() : '');
const nom = (v, p) => [M.valeur(v, p + '.civilite'), M.valeur(v, p + '.prenom'), M.valeur(v, p + '.nom')].filter(Boolean).join(' ');

export function dossierClient(v, opt = {}) {
  const o = { ...OPTIONS_DEFAUT, ...opt };
  const val = k => M.valeur(v, k);
  const soc = M.estSociete(v), nb = M.nbAcheteurs(v);
  const adresse = [txt(val('client.adresse')), [txt(val('client.codePostal')), txt(val('client.ville'))].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  /* les personnes : acheteurs, ou la société et son représentant */
  const personnes = soc
    ? [{ role: 'Société', nom: M.intitule(v), detail: [val('societe.siret') ? 'SIRET ' + val('societe.siret') : '', txt(val('societe.siege'))].filter(Boolean).join(' · ') },
       { role: 'Représentée par', nom: nom(v, 'client'), detail: [val('client.telephone'), val('client.email')].filter(Boolean).join(' · ') }]
    : [1, 2, 3].filter(n => n <= nb).map(n => {
        const p = n === 1 ? 'client' : 'acheteur' + n;
        const dom = M.valeur(v, p + '.domicileIdem') === false ? M.domicile(v, n) : '';
        return { role: nb > 1 ? 'Acheteur ' + n : 'Client', nom: nom(v, p), detail: [val(p + '.telephone'), val(p + '.email'), dom].filter(Boolean).join(' · ') };
      }).filter(x => x.nom || x.detail);

  const types = (val('projet.types') || []).map(t => t === 'Autre' && txt(val('projet.typeAutre')) ? txt(val('projet.typeAutre')) : t);
  const usage = val('bien.usage') === 'Autre' ? txt(val('bien.usageAutre')) || 'Autre' : txt(val('bien.usage'));
  const plan = val('plan'), resume = plan && plan.resume;

  /* les pièces, dans l'ordre de la visite ; chaque photo avec ses images imaginées */
  const photos = M.actifs(v.photos);
  const pieces = M.actifs(v.pieces).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.id.localeCompare(b.id)).map(p => {
    const de = photos.filter(x => x.pieceId === p.id);
    return {
      id: p.id, nom: p.nom || 'Pièce', note: o.notesPieces ? txt(p.note) : '',
      photos: de.filter(x => x.role !== 'imagine').map(ph => ({
        id: ph.id, chemin: ph.chemin || null, legende: txt(ph.legende),
        imagines: o.imagines ? de.filter(x => x.role === 'imagine' && x.source === ph.id).map(im => ({ id: im.id, chemin: im.chemin || null, consigne: txt(im.consigne || im.legende) })) : [],
      })),
    };
  }).filter(p => p.photos.length || p.note);

  /* la fourchette : recalculée depuis la visite (la même que l'étape Budget) */
  let estimation = null;
  if (o.estimation && o.table) {
    const c = B.calculerEstimation(val('budget') || {}, o.table, B.piecesDuPlan(plan), o.fourchettes || []);
    if (!c.vide && c.total.max > 0) {
      estimation = {
        lignes: [
          ...c.ouvrages.filter(r => r.ouvrage && !r.manque).map(r => ({
            libelle: r.ouvrage.nom, quantite: r.ouvrage.unite === 'forfait' ? 'forfait' : String(r.surface).replace('.', ',') + ' ' + B.uniteOuvrage(r.ouvrage),
            gamme: (B.NIVEAUX.find(n => n.id === r.niveau) || {}).nom || '', min: Math.round(r.min / 100) * 100, max: Math.round(r.max / 100) * 100 })),
          ...c.detail.lignes.filter(l => !l.manque).map(l => ({ libelle: l.libelle, quantite: l.unite === 'forfait' ? 'forfait' : String(l.quantite).replace('.', ',') + ' ' + ((B.UNITES[l.unite] || {}).court || ''),
            gamme: (B.GAMMES.find(g => g.id === l.gamme) || {}).nom || '', min: Math.round(l.min / 100) * 100, max: Math.round(l.max / 100) * 100 })),
        ],
        majoration: c.majoration, total: c.total, incomplet: c.manques > 0,
      };
    }
  }

  return {
    titre: 'Votre projet de rénovation',
    client: M.intitule(v), adresse, date: v.creeLe || '',
    garde: (() => { const g = v.photos[val('photoGarde')]; return g && !g.supprime ? { id: g.id, chemin: g.chemin || null } : null; })(),
    personnes,
    bien: { adresse, usage, surface: resume && resume.surface ? resume.surface : null, nbPieces: resume ? resume.pieces : null },
    projet: { categories: val('projet.categories') || [], types, situation: txt(val('projet.situation')), souhaits: txt(val('projet.souhaits')) || txt(val('projet.explicatif')),
      delai: txt(val('projet.delai')), enveloppe: o.enveloppe && val('projet.enveloppe') != null ? val('projet.enveloppe') : null },
    pieces,
    plan: resume && Array.isArray(resume.detail) && resume.detail.length
      ? resume.detail.map(p => ({ nom: p.nom, etage: p.etage || 0, surface: p.sol, hauteur: p.hauteur })) : [],
    estimation,
  };
}
