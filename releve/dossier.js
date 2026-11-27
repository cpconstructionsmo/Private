/* Relevé de visite — le dossier client (Phase 3).

   Ce que l'on remet ou envoie au client après le premier rendez-vous : son
   projet tel qu'il a été compris, les photos de ses pièces (et les images
   d'intention « ✨ Imaginé »), le plan relevé, et, si on le souhaite, la
   fourchette de budget indicative. Il se construit depuis la visite, sur
   l'appareil, sans réseau ; l'écran le met en page et l'imprime (ou
   l'enregistre en PDF, ce que propose l'iPhone dans « Imprimer »).

   Le calendrier indicatif (étape Budget) n'y va que si on le coche ; les
   mensualités n'y vont jamais.

   Ce qui n'y figure jamais : les notes de visite (internes), ce qui manque
   à la fiche, la marge (il n'y en a pas dans une fourchette de premier
   rendez-vous, et le chiffrage détaillé se remet après étude). Les notes
   des pièces n'y vont que si on les coche.

   Fonction pure : elle rend des données, l'écran (app.js) les dessine.
   Tests : tests/t_releve_dossier.js. */
import * as M from './modele.js';
import * as B from './budget.js';
import * as T from './terrain.js';
import * as AV from './aide-vente.js';
import * as AN from './annotations.js';

export const OPTIONS_DEFAUT = { estimation: true, imagines: true, notesPieces: false, enveloppe: false, planAnnote: false, terrain: true, vue3d: true, planRendu: true, calendrier: false, plansCote: false };

const txt = v => (typeof v === 'string' ? v.trim() : '');
const nom = (v, p) => [M.valeur(v, p + '.civilite'), M.valeur(v, p + '.prenom'), M.valeur(v, p + '.nom')].filter(Boolean).join(' ');

/* les plans ajoutés à côté du plan principal (photos « planAjoute »), dans l'ordre où ils ont été ajoutés */
const plansAjoutesDe = v => M.actifs(v.photos).filter(x => x.role === 'planAjoute').sort((a, b) => String(a.importeLe || '').localeCompare(String(b.importeLe || '')) || a.id.localeCompare(b.id));

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
    const c = B.calculerEstimation(val('budget') || {}, o.table, B.piecesDuPlan(plan), o.fourchettes || [], M.surfacesProjet(v));
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

  /* construction neuve et agrandissement : le projet, et le terrain tel que
     le disent les services publics (indicatif, daté, à confirmer) */
  const nature = M.natureDe(v);
  const lignesNeuf = nature === 'construction' ? [
    ['Prestation', txt(val('construction.prestation'))],
    ['Surface habitable souhaitée', val('construction.surface') ? val('construction.surface') + ' m²' : ''],
    ['Niveaux', (val('construction.niveaux') || []).join(', ')],
    ['Chambres', txt(val('construction.chambres'))],
    ['Garage', val('construction.garage') && val('construction.garage') !== 'Aucun' ? txt(val('construction.garage')) : ''],
    ['Chauffage souhaité', txt(val('construction.chauffage'))],
  ].filter(x => x[1]) : nature === 'agrandissement' ? [
    ['Agrandissement', (val('agrandissement.types') || []).join(', ')],
    ['Surface créée', val('agrandissement.surface') ? val('agrandissement.surface') + ' m²' : ''],
    ['Maison actuelle', val('agrandissement.surfaceExistante') ? val('agrandissement.surfaceExistante') + ' m²' : ''],
  ].filter(x => x[1]) : [];
  const inf = val('terrain.infos'), pos = val('terrain.position');
  const terrain = o.terrain && nature !== 'renovation' && (inf || val('terrain.surface')) ? (() => {
    const u = (inf && inf.urbanisme) || {}, r = (inf && inf.risques) || {}, p = inf && inf.parcelle;
    const avere = x => /existant|concern/i.test(x.statut || '') && !/non concern|inconnu|non connu/i.test(x.statut || '');
    return {
      adresse: val('terrain.adresseIdem') === false ? [txt(val('terrain.adresse')), [txt(val('terrain.codePostal')), txt(val('terrain.ville'))].filter(Boolean).join(' ')].filter(Boolean).join(', ') : adresse,
      parcelle: p && p.section ? 'Section ' + p.section + ' n° ' + p.numero + (p.commune ? ' (' + p.commune + ')' : '') : '',
      surface: val('terrain.surface') ? Number(val('terrain.surface')).toLocaleString('fr-FR') + ' m²' : '',
      configuration: [txt(val('terrain.forme')), txt(val('terrain.pente')), val('terrain.orientation') ? 'jardin orienté ' + txt(val('terrain.orientation')) : ''].filter(Boolean).join(' · '),
      urbanisme: u.rnu ? 'Règlement national d’urbanisme (pas de PLU)' : u.zone ? [u.document && (u.document.titre || u.document.type), 'zone ' + u.zone.libelle + (u.zone.libelong ? ' : ' + String(u.zone.libelong).toLowerCase() : '')].filter(Boolean).join(' — ') : '',
      reglement: u.zone && u.zone.reglement || null,
      servitudes: (u.servitudes || []).map(x => x.libelle),
      risques: [r.argile ? 'Argiles : ' + String(r.argile.libelle || '').toLowerCase() : '', r.seisme ? 'Sismicité : zone ' + r.seisme.libelle.toLowerCase() : '',
        ...[...(r.naturels || []), ...(r.technologiques || [])].filter(x => avere(x) && x.cle !== 'seisme' && x.cle !== 'retraitGonflementArgile').map(x => x.libelle)].filter(Boolean),
      rapport: r.url || null,
      // les règles lues dans le règlement PLU, si elles concernent bien la zone actuelle du terrain
      regles: (() => { const rg = val('terrain.reglement'); return rg && rg.regles && u.zone && rg.zone === u.zone.libelle ? { zone: rg.zone, pages: rg.pages || null, lignes: T.REGLES_PLU.filter(([k]) => rg.regles[k]).map(([k, lib]) => [lib, rg.regles[k]]) } : null; })(),
      points: inf ? T.pointsAttention(inf, { nature, surfaceProjet: nature === 'construction' ? val('construction.surface') : val('agrandissement.surface'), surfaceExistante: val('agrandissement.surfaceExistante') }) : [],
      le: (inf && inf.le) || (pos && pos.le) || '',
    };
  })() : null;

  return {
    titre: nature === 'construction' ? 'Votre projet de construction' : nature === 'agrandissement' ? 'Votre projet d’agrandissement' : 'Votre projet de rénovation',
    nature, lignesNeuf, terrain,
    client: M.intitule(v), adresse, date: v.creeLe || '',
    garde: (() => { const g = v.photos[val('photoGarde')]; return g && !g.supprime ? { id: g.id, chemin: g.chemin || null } : null; })(),
    // l'image du plan dessiné, envoyée par le moteur à la fermeture du plan
    planImage: (() => { const pi = val('planImage'), ph = pi && v.photos[pi.id]; return ph && !ph.supprime ? { id: ph.id, chemin: ph.chemin || null } : null; })(),
    // le plan en couleur (IA, image d'intention), option « Plan en couleur » cochée d'office
    planRendu: (() => { const pr = o.planRendu !== false && val('planRendu'), ph = pr && v.photos[pr.id]; return ph && !ph.supprime ? { id: ph.id, chemin: ph.chemin || null } : null; })(),
    // la vue 3D du plan, envoyée par le moteur avec l'image du plan (option « Vue 3D », cochée d'office)
    vue3d: (() => { const pi = o.vue3d !== false && val('plan3dImage'), ph = pi && v.photos[pi.id]; return ph && !ph.supprime ? { id: ph.id, chemin: ph.chemin || null } : null; })(),
    // le plan annoté des travaux (annotations.js), seulement si l'option est cochée
    planAnnote: (() => { const a = val('annotations'), ph = o.planAnnote && a && typeof a.imageId === 'string' ? v.photos[a.imageId] : null; return ph && !ph.supprime ? { id: ph.id, chemin: ph.chemin || null } : null; })(),
    personnes,
    bien: { adresse, usage, surface: resume && resume.surface ? resume.surface : null, nbPieces: resume ? resume.pieces : null },
    projet: { categories: val('projet.categories') || [], types, situation: txt(val('projet.situation')), souhaits: txt(val('projet.souhaits')) || txt(val('projet.explicatif')),
      delai: txt(val('projet.delai')), enveloppe: o.enveloppe && val('projet.enveloppe') != null ? val('projet.enveloppe') : null },
    pieces,
    plan: resume && Array.isArray(resume.detail) && resume.detail.length
      ? resume.detail.map(p => ({ nom: p.nom, etage: p.etage || 0, surface: p.sol, hauteur: p.hauteur })) : [],
    estimation,
    // les plans ajoutés à côté (RDC, étages…) : l'option « Les plans côte à côte », décochée d'office
    plansCote: (() => {
      const aj = plansAjoutesDe(v); if (!o.plansCote || !aj.length) return null;
      const pi = val('planImage'), pp = (pi && v.photos[pi.id] && !v.photos[pi.id].supprime ? v.photos[pi.id] : null)
        || M.actifs(v.photos).filter(x => x.role === 'planPapier').sort((a, b) => String(b.importeLe || '').localeCompare(String(a.importeLe || '')))[0];
      return [...aj.map(ph => ({ id: ph.id, chemin: ph.chemin || null, legende: txt(ph.legende) || 'Plan' })), ...(pp ? [{ id: pp.id, chemin: pp.chemin || null, legende: pi && v.photos[pi.id] === pp ? 'Plan dessiné' : 'Plan importé' }] : [])];
    })(),
    // la copie annotée de chaque plan ajouté, avec l'option « Plan annoté (travaux) »
    plansAnnotes: o.planAnnote ? plansAjoutesDe(v).map(ph => {
      const a = AN.nettoyer((val('annotationsPlus') || {})[ph.id]), im = a.imageId && v.photos[a.imageId];
      return im && !im.supprime ? { id: im.id, chemin: im.chemin || null, legende: txt(ph.legende) || 'Plan' } : null;
    }).concat([(() => {   // la vue 3D annotée (clé « vue3d »)
      const a = AN.nettoyer((val('annotationsPlus') || {}).vue3d), im = a.imageId && v.photos[a.imageId];
      return im && !im.supprime ? { id: im.id, chemin: im.chemin || null, legende: 'Vue 3D · travaux' } : null;
    })()]).filter(Boolean) : [],
    // le calendrier indicatif (option, décochée d'office) : seulement si une date de début de chantier a été choisie à l'étape Budget
    calendrier: (() => {
      const bg = val('budget') || {}, c = bg.calendrier;
      if (!o.calendrier || !c || !c.debut) return null;
      const k = AV.calendrier({ debut: c.debut, ouvrageIds: (bg.ouvrages || []).map(x => x.ouvrageId), urbanisme: c.urbanisme, abf: c.abf });
      return k.lignes.length ? { lignes: k.lignes.map(l => ({ libelle: l.libelle, date: l.date, semaines: l.semaines || 0 })), court: k.court } : null;
    })(),
  };
}
