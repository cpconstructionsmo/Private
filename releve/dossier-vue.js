/* Relevé de visite — la mise en page du dossier client (feuilles A4 à
   l'écran, une feuille par page à l'impression). Partagée par l'écran du
   relevé (app.js, « 📄 Dossier client ») et la page du dossier envoyé au
   client (partage.html) : le client voit exactement ce que l'équipe a vu.
   Elle ne fait que dessiner les données de dossier.js ; `photo(ph, cls)`
   rend une image (depuis l'appareil, ou un lien temporaire). */
import { h } from './dom.js';

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
      ligne('Adresse des travaux', d.bien.adresse), ligne('Usage', d.bien.usage),
      ligne('Surface relevée', d.bien.surface ? String(d.bien.surface).replace('.', ',') + ' m²' + (d.bien.nbPieces ? ' (' + d.bien.nbPieces + ' pièce' + (d.bien.nbPieces > 1 ? 's' : '') + ')' : '') : ''),
      h('h2', {}, 'Votre projet'),
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
    d.plan.length || d.planImage ? page('',
      h('h2', {}, 'Le relevé'),
      d.planImage ? photo(d.planImage, 'planDossier') : null,
      h('table', { class: 'tableDossier' }, h('thead', {}, h('tr', {}, h('th', {}, 'Pièce'), h('th', {}, 'Niveau'), h('th', {}, 'Surface'), h('th', {}, 'Hauteur'))),
        h('tbody', {}, d.plan.map(p => h('tr', {}, h('td', {}, p.nom), h('td', {}, p.etage ? 'Étage ' + p.etage : 'RDC'),
          h('td', {}, p.surface != null ? String(p.surface).replace('.', ',') + ' m²' : '—'), h('td', {}, p.hauteur ? String(p.hauteur).replace('.', ',') + ' m' : '—'))))),
      h('p', { class: 'mention' }, 'Surfaces intérieures relevées au scanner lors de la visite, à confirmer par un relevé contradictoire.')) : null,
    d.estimation ? page('',
      h('h2', {}, 'Estimation budgétaire indicative'),
      h('table', { class: 'tableDossier' }, h('thead', {}, h('tr', {}, h('th', {}, 'Travaux'), h('th', {}, 'Quantité'), h('th', {}, 'Gamme'), h('th', {}, 'Fourchette TTC'))),
        h('tbody', {}, d.estimation.lignes.map(l => h('tr', {}, h('td', {}, l.libelle), h('td', {}, l.quantite), h('td', {}, l.gamme), h('td', { class: 'nombre' }, euros(l.min) + ' à ' + euros(l.max))))),
        h('tfoot', {}, h('tr', {}, h('td', { colspan: 3 }, 'Total' + (d.estimation.majoration ? ' (ajustements compris : +' + Math.round(d.estimation.majoration * 100) + ' %)' : '')), h('td', { class: 'nombre' }, euros(d.estimation.total.min) + ' à ' + euros(d.estimation.total.max))))),
      h('p', { class: 'mention' }, 'Estimation indicative, non contractuelle, établie lors de la première visite à partir de surfaces globales et de prix moyens. Elle ne constitue ni un devis ni une offre. Le chiffrage détaillé vous sera remis après étude du projet.' + (d.estimation.incomplet ? ' Certains postes restent à chiffrer.' : ''))) : null,
    page('fin',
      h('h2', {}, 'La suite'),
      h('ol', { class: 'suite' }, h('li', {}, 'Nous étudions votre projet à partir de ce relevé.'), h('li', {}, 'Nous vous remettons un chiffrage détaillé.'), h('li', {}, 'Nous en parlons ensemble et ajustons le projet si besoin.')),
      h('img', { class: 'logoDossier', src: logo, alt: 'CP Constructions' })))
  );
}
