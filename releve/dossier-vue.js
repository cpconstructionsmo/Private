/* Relevé de visite — la mise en page du dossier client (feuilles A4 à
   l'écran, une feuille par page à l'impression). Partagée par l'écran du
   relevé (app.js, « 📄 Dossier client ») et la page du dossier envoyé au
   client (partage.html) : le client voit exactement ce que l'équipe a vu.
   Elle ne fait que dessiner les données de dossier.js ; `photo(ph, cls)`
   rend une image (depuis l'appareil, ou un lien temporaire). */
import { h } from './dom.js';
import { dateLongue as dateJour } from './aide-vente.js';

export const dateLongue = iso => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const euros = n => Math.round(n).toLocaleString('fr-FR') + ' €';
const formatEuros = n => n == null ? '' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';

export function vueDossier(d, { photo, logo }) {
  const ligne = (t, val) => val ? h('div', { class: 'dl' }, h('span', {}, t), h('b', {}, val)) : null;
  const page = (cls, ...enfants) => h('section', { class: 'feuille ' + (cls || '') }, ...enfants,
    h('footer', {}, 'CP Constructions · ' + d.client + ' · visite du ' + dateLongue(d.date)));
  return (
  h('div', { class: 'dossier' },
    page('garde',
      h('img', { class: 'logoDossier', src: logo, alt: 'CP Constructions' }),
      h('h1', {}, d.titre),
      h('div', { class: 'gardeClient' }, d.client),
      d.adresse ? h('div', { class: 'gardeAdresse' }, d.adresse) : null,
      d.garde ? photo(d.garde, 'gardeDossier') : null,
      h('div', { class: 'gardeDate' }, 'Visite du ' + dateLongue(d.date))),
    page('',
      h('h2', {}, 'Vous'),
      d.personnes.map(p => ligne(p.role, [p.nom, p.detail].filter(Boolean).join(' — '))),
      h('h2', {}, 'Le bien'),
      ligne(d.nature === 'construction' ? 'Adresse' : 'Adresse des travaux', d.bien.adresse), ligne('Usage', d.bien.usage),
      ligne('Surface relevée', d.bien.surface ? String(d.bien.surface).replace('.', ',') + ' m²' + (d.bien.nbPieces ? ' (' + d.bien.nbPieces + ' pièce' + (d.bien.nbPieces > 1 ? 's' : '') + ')' : '') : ''),
      h('h2', {}, 'Votre projet'),
      (d.lignesNeuf || []).map(([t, x]) => ligne(t, x)),
      ligne('Ampleur', d.projet.categories.join(', ')), ligne('Travaux', d.projet.types.join(', ')), ligne('Délai souhaité', d.projet.delai),
      d.projet.enveloppe != null ? ligne('Budget envisagé', formatEuros(d.projet.enveloppe) + ' TTC') : null,
      d.projet.situation ? [h('h3', {}, 'La situation aujourd’hui'), h('p', { class: 'texte' }, d.projet.situation)] : null,
      d.projet.souhaits ? [h('h3', {}, 'Vos souhaits'), h('p', { class: 'texte' }, d.projet.souhaits)] : null),
    d.pieces.length ? page('pieces',
      h('h2', {}, 'Vos pièces'),
      d.pieces.map(p => h('div', { class: 'pieceDossier' },
        h('h3', {}, p.nom),
        p.note ? h('p', { class: 'texte' }, p.note) : null,
        p.photos.map(ph => h('div', { class: 'duo' + (ph.imagines.length ? ' avecImagine' : '') },
          h('figure', {}, photo(ph), h('figcaption', {}, ph.imagines.length ? 'Aujourd’hui' + (ph.legende ? ' — ' + ph.legende : '') : ph.legende)),
          ph.imagines.map(im => h('figure', {}, photo(im), h('figcaption', {}, '✨ Demain (image d’intention) — ' + im.consigne))))))),
      d.pieces.some(p => p.photos.some(ph => ph.imagines.length)) ? h('p', { class: 'mention' }, 'Les images d’intention sont générées pour aider à se projeter : elles ne sont ni un plan ni un engagement sur le rendu final.') : null) : null,
    d.plan.length || d.planImage || d.vue3d || d.planRendu ? page('',
      h('h2', {}, 'Le relevé'),
      d.planImage ? photo(d.planImage, 'planDossier') : null,
      d.vue3d ? h('figure', { class: 'vue3dDossier' }, photo(d.vue3d, 'planDossier'), h('figcaption', {}, 'Vue en volume du relevé')) : null,
      d.planRendu ? h('figure', { class: 'planRenduDossier' }, photo(d.planRendu, 'planDossier'), h('figcaption', {}, '✨ Plan en couleur — image d’intention générée pour aider à se projeter, ni plan ni engagement')) : null,
      h('table', { class: 'tableDossier' }, h('thead', {}, h('tr', {}, h('th', {}, 'Pièce'), h('th', {}, 'Niveau'), h('th', {}, 'Surface'), h('th', {}, 'Hauteur'))),
        h('tbody', {}, d.plan.map(p => h('tr', {}, h('td', {}, p.nom), h('td', {}, p.etage ? 'Étage ' + p.etage : 'RDC'),
          h('td', {}, p.surface != null ? String(p.surface).replace('.', ',') + ' m²' : '—'), h('td', {}, p.hauteur ? String(p.hauteur).replace('.', ',') + ' m' : '—'))))),
      h('p', { class: 'mention' }, 'Surfaces intérieures relevées au scanner lors de la visite, à confirmer par un relevé contradictoire.')) : null,
    d.plansCote && d.plansCote.length ? page('plansCoteDossier',
      h('h2', {}, 'Les plans'),
      h('div', { class: 'plansCoteDossier' }, d.plansCote.map(pl => h('figure', {}, photo(pl, 'planDossier'), h('figcaption', {}, pl.legende)))),
      h('p', { class: 'mention' }, 'Plans à titre indicatif, relevés ou reportés lors de la visite : à confirmer par un relevé contradictoire.')) : null,
    d.terrain ? page('terrainDossier',
      h('h2', {}, 'Le terrain'),
      ligne('Adresse', d.terrain.adresse), ligne('Parcelle cadastrale', d.terrain.parcelle), ligne('Surface', d.terrain.surface), ligne('Configuration', d.terrain.configuration),
      d.terrain.urbanisme ? [h('h3', {}, 'Urbanisme'), h('p', { class: 'texte' }, d.terrain.urbanisme),
        d.terrain.reglement ? h('p', {}, h('a', { href: d.terrain.reglement, target: '_blank', rel: 'noopener' }, 'Règlement de la zone (Géoportail de l’urbanisme)')) : null] : null,
      d.terrain.regles && d.terrain.regles.lignes.length ? [h('h3', {}, 'Règles de la zone ' + d.terrain.regles.zone + ' (extrait du règlement, à vérifier)'), d.terrain.regles.lignes.map(([t, x]) => ligne(t, x))] : null,
      d.terrain.servitudes.length ? [h('h3', {}, 'Servitudes'), h('ul', {}, d.terrain.servitudes.map(x => h('li', {}, x)))] : null,
      d.terrain.risques.length ? [h('h3', {}, 'Risques connus à l’adresse'), h('ul', {}, d.terrain.risques.map(x => h('li', {}, x))),
        d.terrain.rapport ? h('p', {}, h('a', { href: d.terrain.rapport, target: '_blank', rel: 'noopener' }, 'Rapport officiel Géorisques')) : null] : null,
      d.terrain.points.length ? [h('h3', {}, 'Points à vérifier'), h('ul', { class: 'pointsDossier' }, d.terrain.points.map(x => h('li', {}, h('b', {}, x.titre), ' — ', x.texte)))] : null,
      h('p', { class: 'mention' }, 'Informations issues des services publics (cadastre, Géoportail de l’urbanisme, Géorisques)' + (d.terrain.le ? ' consultés le ' + dateLongue(d.terrain.le) : '') + '. Elles sont indicatives : le certificat d’urbanisme, le règlement en mairie et l’étude de sol font foi.')) : null,
    d.planAnnote ? page('',
      h('h2', {}, 'Les travaux envisagés sur le plan'),
      photo(d.planAnnote, 'planDossier'),
      h('p', { class: 'mention' }, 'Annotations faites lors de la visite, indicatives : les travaux seront précisés et chiffrés dans le projet.')) : null,
    (d.plansAnnotes || []).map(pl => page('',
      h('h2', {}, 'Les travaux envisagés · ' + pl.legende),
      photo(pl, 'planDossier'),
      h('p', { class: 'mention' }, 'Annotations faites lors de la visite, indicatives : les travaux seront précisés et chiffrés dans le projet.'))),
    d.estimation ? page('',
      h('h2', {}, 'Estimation budgétaire indicative'),
      h('table', { class: 'tableDossier' }, h('thead', {}, h('tr', {}, h('th', {}, 'Travaux'), h('th', {}, 'Quantité'), h('th', {}, 'Gamme'), h('th', {}, 'Fourchette TTC'))),
        h('tbody', {}, d.estimation.lignes.map(l => h('tr', {}, h('td', {}, l.libelle), h('td', {}, l.quantite), h('td', {}, l.gamme), h('td', { class: 'nombre' }, euros(l.min) + ' à ' + euros(l.max))))),
        h('tfoot', {}, h('tr', {}, h('td', { colspan: 3 }, 'Total' + (d.estimation.majoration ? ' (ajustements compris : +' + Math.round(d.estimation.majoration * 100) + ' %)' : '')), h('td', { class: 'nombre' }, euros(d.estimation.total.min) + ' à ' + euros(d.estimation.total.max))))),
      h('p', { class: 'mention' }, 'Estimation indicative, non contractuelle, établie lors de la première visite à partir de surfaces globales et de prix moyens. Elle ne constitue ni un devis ni une offre. Le chiffrage détaillé vous sera remis après étude du projet.' + (d.estimation.incomplet ? ' Certains postes restent à chiffrer.' : ''))) : null,
    d.calendrier ? page('calendrierDossier',
      h('h2', {}, 'Calendrier indicatif'),
      h('table', { class: 'tableDossier' }, h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Étape'), h('th', {}, 'Durée'))),
        h('tbody', {}, d.calendrier.lignes.map(l => h('tr', {}, h('td', {}, dateJour(l.date)), h('td', {}, l.libelle), h('td', {}, l.semaines ? Math.round(l.semaines) + ' sem.' : ''))))),
      h('p', { class: 'mention' }, 'Calendrier indicatif, établi à partir de délais moyens et de la date de début de chantier souhaitée. Les durées réelles dépendent des autorisations, des entreprises et des fabrications : il sera confirmé à la signature.')) : null,
    page('fin',
      h('h2', {}, 'La suite'),
      h('ol', { class: 'suite' }, h('li', {}, 'Nous étudions votre projet à partir de ce relevé.'), h('li', {}, 'Nous vous remettons un chiffrage détaillé.'), h('li', {}, 'Nous en parlons ensemble et ajustons le projet si besoin.')),
      h('img', { class: 'logoDossier', src: logo, alt: 'CP Constructions' })))
  );
}
