// Interface locale de l'atelier. Tout passe par l'API du serveur local
// (127.0.0.1) : rien ne part vers un service extérieur (R10).
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (v, d = 2) => (v == null || v === '' || isNaN(v)) ? '—' : Number(v).toFixed(d).replace('.', ',');
const SYMB = { confirme: '✅', hypothese: '⚠️', impossible: '❓' };
const COULEURS = { sejour: '#f3d9a4', chambre: '#bcd7f0', eau: '#a9e0dc', circulation: '#e4e4e4', rangement: '#d9cfe9',
  garage: '#cfcfcf', technique: '#e8c4c4', exterieur: '#d6ecc9', autre: '#f7f0c6' };
const USAGES_LIB = { sejour: 'Séjour / cuisine', chambre: 'Chambre / bureau', eau: "Pièce d'eau / WC", circulation: 'Circulation',
  rangement: 'Rangement / cellier', garage: 'Garage', technique: 'Local technique', exterieur: 'Extérieur', autre: 'Autre' };

// l'utilisateur (signe les validations et le journal) : propre à ce navigateur
const qui = $('#qui');
try { qui.value = localStorage.getItem('atelier:qui') || ''; } catch (e) {}
qui.addEventListener('change', () => { try { localStorage.setItem('atelier:qui', qui.value.trim()); } catch (e) {} });
const par = () => qui.value.trim();

function message(t, erreur) {
  const m = $('#message');
  m.textContent = t; m.className = erreur ? 'erreur' : ''; m.style.display = 'block';
  clearTimeout(message.t); message.t = setTimeout(() => { m.style.display = 'none'; }, erreur ? 7000 : 3000);
}

async function api(chemin, options = {}) {
  const r = await fetch('/api' + chemin, options);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail ? (typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)) : 'Erreur ' + r.status);
  return j;
}
const post = (chemin, corps) => api(chemin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });

// ------------------------------------------------------------ navigation

function route() {
  const m = location.hash.match(/^#\/projet\/([\w-]+)/);
  if (m) ouvrirProjet(m[1]);
  else if (location.hash === '#/reglages') reglages();
  else accueil();
}
window.addEventListener('hashchange', route);

// ------------------------------------------------------------ accueil : les projets

async function accueil() {
  $('#fil').innerHTML = '';
  const [etat, projets] = await Promise.all([api('/etat'), api('/projets')]);
  $('#app').innerHTML = `
    <h1>Projets</h1>
    <div class="deux">
      <div class="carte">
        <h2>Projets enregistrés</h2>
        ${projets.length ? `<table class="liste-projets"><tr><th>Projet</th><th>Adresse</th><th>Indice</th><th>Version</th><th>RDC validé</th></tr>
          ${projets.map(p => p.erreur
            ? `<tr><td colspan="5" class="hypothese">${esc(p.dossier)} : modèle illisible (${esc(p.erreur)})</td></tr>`
            : `<tr><td><a data-p="${esc(p.dossier)}">${esc(p.nom)}</a><div class="petit discret">${esc(p.dossier)}</div></td>
               <td>${esc(p.adresse)}</td><td>${esc(p.indice)}</td><td class="n">${p.version}</td>
               <td>${p.points_arret['1_rdc'] ? '<span class="valide">oui</span>' : 'non'}</td></tr>`).join('')}</table>`
          : '<p class="discret">Aucun projet pour le moment.</p>'}
        <p class="petit discret">Dossier des projets : ${esc(etat.racine)}</p>
        <p><a href="#/reglages">Réglages du cabinet</a> <span class="petit discret">(société, dessinateur, logos du cartouche)</span></p>
      </div>
      <div class="carte">
        <h2>Nouveau projet</h2>
        <form id="nouveau">
          <label><span>Nom du projet (en général le nom du maître d'ouvrage)</span><input name="nom" required></label>
          <label><span>Maître d'ouvrage</span><input name="maitre_ouvrage"></label>
          <label><span>Adresse du terrain</span><input name="adresse"></label>
          <label><span>Parcelles cadastrales (séparées par des virgules)</span><input name="parcelles" placeholder="AB 123, AB 124"></label>
          <label><span>N° de dossier (si déjà attribué)</span><input name="numero_dossier"></label>
          <button>Créer le projet</button>
          <p class="petit discret">Le projet est créé en plain-pied ; un étage ne s'étudie que si vous le demandez.</p>
        </form>
      </div>
    </div>`;
  $('#app').querySelectorAll('a[data-p]').forEach(a => a.onclick = () => { location.hash = '#/projet/' + a.dataset.p; });
  $('#nouveau').onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    try {
      const r = await post('/projets', { nom: f.get('nom'), maitre_ouvrage: f.get('maitre_ouvrage'), adresse: f.get('adresse'),
        parcelles: String(f.get('parcelles') || '').split(','), numero_dossier: f.get('numero_dossier') });
      location.hash = '#/projet/' + r.dossier;
    } catch (e) { message(e.message, true); }
  };
}

// ------------------------------------------------------------ un projet

let E = null;   // état du projet ouvert

async function ouvrirProjet(nom) {
  try { E = await api('/projets/' + nom); } catch (e) { $('#app').innerHTML = `<p class="hypothese">${esc(e.message)}</p>`; return; }
  dessiner();
}

function dessiner() {
  const p = E.projet, s = E.surfaces || {}, n = p.batiment.niveaux[0];
  $('#fil').innerHTML = `<a id="retour">Projets</a> › ${esc(p.nom)}`;
  $('#retour').onclick = () => { location.hash = ''; };
  const seuil = s.seuil_architecte;
  $('#app').innerHTML = `
    <h1>${esc(p.nom)} <span class="petit discret">indice ${esc(p.indice)} · version ${p.version}</span></h1>
    ${seuil ? `<div class="bandeau ${seuil.etat}">${seuil.etat === 'bloquant' ? '⛔ ' : seuil.etat === 'alerte' ? '⚠️ ' : ''}${esc(seuil.message)}</div>` : ''}
    <div class="grille">
      <div class="carte">${blocIdentite(p)}</div>
      <div class="carte">${blocNiveaux(p)}</div>
      <div class="carte">${blocImport(p)}</div>
    </div>
    ${n ? `
    <div class="carte">
      <h2>Plan source et interprétation</h2>
      <div class="deux">
        <div><div class="petit discret">Plan lu : ${esc(p.source_rdc.fichier)}</div>${svgSource(p)}</div>
        <div><div class="petit discret">Interprétation de l'atelier</div>${svgInterpretation(p)}${legende()}</div>
      </div>
      ${(p.source_rdc.notes || []).map(t => `<p class="petit hypothese">${esc(t)}</p>`).join('')}
    </div>
    <div class="deux">
      <div class="carte">${blocEcarts(p)}</div>
      <div class="carte">${blocPieces(p, n)}</div>
    </div>
    <div class="carte">${blocSurfaces(s)}</div>
    <div class="carte">${blocMursOuvertures(n)}</div>
    <div class="deux">
      <div class="carte">${blocVolumetrie(p)}</div>
      <div class="carte">${blocCartouche(p)}</div>
    </div>
    <div class="carte">${blocBaies(n)}</div>
    <div class="carte">${blocPiecesGraphiques(p)}</div>` : ''}
    <div class="deux">
      <div class="carte">${blocPoints(p)}</div>
      <div class="carte">${blocJournal(p)}</div>
    </div>`;
  brancher();
}

function blocIdentite(p) {
  return `<h2>Projet</h2>
    <table>
      <tr><th>Maître d'ouvrage</th><td>${esc(p.maitre_ouvrage) || '<span class="discret">—</span>'}</td></tr>
      <tr><th>Adresse</th><td>${esc(p.adresse) || '<span class="discret">—</span>'}</td></tr>
      <tr><th>Parcelles</th><td>${esc(p.parcelles.join(', ')) || '<span class="discret">—</span>'}</td></tr>
      <tr><th>Dossier</th><td class="petit">${esc(E.chemin)}</td></tr>
    </table>
    <p><a class="petit" href="/api/projets/${esc(E.dossier)}/export.json">Exporter le modèle (JSON)</a></p>`;
}

function blocNiveaux(p) {
  return `<h2>Niveaux</h2>
    <label><span>Type de maison</span>
      <select id="niveaux">${Object.entries(E.types_niveaux).map(([k, v]) =>
        `<option value="${k}" ${k === p.batiment.type_niveaux ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
    <p class="petit discret">${p.batiment.type_niveaux === 'plain-pied'
      ? "Plain-pied : aucun plan d'étage n'est proposé."
      : "Étage demandé : les propositions d'étage viendront avec le module B (jalon J7). Rien n'est encore produit."}</p>`;
}

function blocImport(p) {
  const deja = p.batiment.niveaux.length;
  return `<h2>Plan du rez-de-chaussée</h2>
    <form id="import">
      <label><span>Fichier DXF ou PDF vectoriel (un DWG s'exporte en DXF)</span><input type="file" name="fichier" accept=".dxf,.pdf,.dwg" required></label>
      <div class="ligne">
        <label><span>Échelle du PDF (lue sur la page si elle y est écrite)</span><input name="echelle" inputmode="decimal" placeholder="auto" size="8"></label>
        <label><span>Page du plan (PDF de plusieurs pages)</span><input name="page" inputmode="numeric" placeholder="auto" size="6"></label>
      </div>
      <button>${deja ? 'Remplacer le plan' : 'Importer le plan'}</button>
      ${deja ? '<p class="petit hypothese">Un nouvel import annule la validation du RDC et des étapes suivantes.</p>' : ''}
    </form>`;
}

// ---------- dessins

function cadre(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (!isFinite(x0)) return '0 0 10 10';
  const m = Math.max(x1 - x0, y1 - y0) * 0.06 + 0.3;
  return `${x0 - m} ${-y1 - m} ${x1 - x0 + 2 * m} ${y1 - y0 + 2 * m}`;   // y inversé : le nord du plan en haut
}
const pt = ([x, y]) => `${x},${-y}`;
const chemin = anneau => 'M' + anneau.map(pt).join('L') + 'Z';

function svgSource(p) {
  const S = p.source_rdc, pts = S.segments.flat();
  return `<svg class="plan" viewBox="${cadre(pts)}" preserveAspectRatio="xMidYMid meet">
    ${S.segments.map(([a, b]) => `<line x1="${a[0]}" y1="${-a[1]}" x2="${b[0]}" y2="${-b[1]}" stroke="var(--facade)" stroke-width="0.03"/>`).join('')}
    ${S.textes.map(t => `<text x="${t.x}" y="${-t.y}">${esc(t.texte)}</text>`).join('')}
  </svg>`;
}

function svgInterpretation(p) {
  const n = p.batiment.niveaux[0], S = p.source_rdc;
  const murs = n.murs.map(m => `<path d="${[m.polygone, ...(m.trous || [])].map(chemin).join('')}" fill-rule="evenodd"
      fill="${m.exterieur ? 'var(--facade)' : 'var(--cloison)'}"><title>${m.exterieur ? 'Mur de façade' : 'Mur intérieur'} · ${nb(m.epaisseur)} m · porteur : ${esc(SYMB[m.porteur.statut])} ${m.porteur.valeur ? 'oui' : 'non'}</title></path>`).join('');
  const pieces = n.pieces.map(x => {
    const c = x.polygone.reduce((a, [px, py]) => [a[0] + px / x.polygone.length, a[1] + py / x.polygone.length], [0, 0]);
    return `<path d="${chemin(x.polygone)}" fill="${COULEURS[x.usage] || COULEURS.autre}" stroke="none"><title>${esc(x.nom)} · ${nb(x.surface_calculee)} m²</title></path>
      <text x="${c[0]}" y="${-c[1]}" text-anchor="middle">${esc(x.nom)}</text>
      <text x="${c[0]}" y="${-c[1] + 0.35}" text-anchor="middle">${nb(x.surface_calculee)} m²</text>`;
  }).join('');
  const ferm = (S.fermetures || []).map(([a, b]) => `<line x1="${a[0]}" y1="${-a[1]}" x2="${b[0]}" y2="${-b[1]}" stroke="#d33" stroke-width="0.03" stroke-dasharray="0.08 0.06"/>`).join('');
  const ouv = n.ouvertures.map(o => `<circle cx="${o.position[0]}" cy="${-o.position[1]}" r="0.13" fill="${o.exterieure ? '#1d4e89' : '#6aa0d8'}"><title>${esc(o.id)} · ${esc(o.type)} · ${nb(o.largeur.valeur)} m (${esc(o.origine)})</title></circle>`).join('');
  const couv = (n.couverts || []).map(c => `<path d="${chemin(c.polygone)}" fill="none" stroke="var(--texte)" stroke-width="0.04" stroke-dasharray="0.15 0.1"><title>${esc(c.nom)}</title></path>`).join('');
  return `<svg class="plan" viewBox="${cadre(n.contour_exterieur.concat(...(n.couverts || []).map(c => c.polygone)))}" preserveAspectRatio="xMidYMid meet">${pieces}${murs}${couv}${ferm}${ouv}</svg>`;
}

function legende() {
  return `<div class="legende">
    <span><i style="background:var(--facade)"></i>façade</span><span><i style="background:var(--cloison)"></i>mur intérieur</span>
    <span><i style="background:#1d4e89;border-radius:50%"></i>ouverture extérieure</span><span><i style="background:#6aa0d8;border-radius:50%"></i>intérieure</span>
    <span><i style="border:1px dashed #d33"></i>interruption refermée</span></div>`;
}

// ---------- listes

const LIB_ECARTS = { surface: 'Surface écrite ≠ surface calculée', 'piece-sans-nom': 'Surface fermée sans nom',
  'cote-forcee': 'Cote forcée', 'chaine-de-cotes': 'Chaîne de cotes incohérente' };

function blocEcarts(p) {
  const e = p.ecarts_rdc;
  return `<h2>Écarts relevés (${e.length})</h2>
    ${e.length ? `<table>${e.map(x => `<tr><td>⚠️ <b>${esc(LIB_ECARTS[x.genre] || x.genre)}</b>
      ${x.piece ? ` — ${esc(x.piece)}` : ''}
      ${x.genre === 'surface' ? `<div>écrite ${nb(x.lue)} m², calculée ${nb(x.calculee)} m² (écart ${nb(x.ecart)})</div>` : ''}
      ${x.genre === 'cote-forcee' ? `<div>texte « ${esc(x.texte)} », longueur dessinée ${nb(x.dessinee, 3)} m</div>` : ''}
      ${x.genre === 'chaine-de-cotes' ? `<div>cote totale ${nb(x.total, 3)} m, somme des cotes partielles ${nb(x.somme, 3)} m</div>` : ''}
      <div class="petit discret">${esc(x.explication)}</div></td></tr>`).join('')}</table>`
      : '<p class="confirme">Aucun écart relevé entre le plan et son interprétation.</p>'}
    <p class="petit discret">Les écarts ne sont pas corrigés automatiquement : vérifiez-les sur le plan source avant de valider le RDC.</p>`;
}

function blocPieces(p, n) {
  return `<h2>Pièces (${n.pieces.length})</h2>
    <table><tr><th>Pièce</th><th>Usage</th><th class="n">Calculée</th><th class="n">Écrite</th><th>Habitable</th><th></th></tr>
    ${n.pieces.map(x => `<tr data-piece="${esc(x.id)}">
      <td><input class="p-nom" value="${esc(x.nom)}" size="14"></td>
      <td><select class="p-usage">${E.usages.map(u => `<option value="${u}" ${u === x.usage ? 'selected' : ''}>${esc(USAGES_LIB[u] || u)}</option>`).join('')}</select></td>
      <td class="n">${nb(x.surface_calculee)} m²</td>
      <td class="n">${x.surface_lue ? nb(x.surface_lue.valeur) + ' m²' : '<span class="discret">—</span>'}</td>
      <td><input type="checkbox" class="p-hab" ${x.exclue_habitable ? '' : 'checked'} title="${esc(x.motif_exclusion)}"></td>
      <td><button class="second p-ecarter" title="Ce n'est pas une pièce (meuble, trémie, erreur de lecture)">Écarter</button></td>
    </tr>`).join('')}</table>
    <p class="petit discret">Modifier une pièce annule la validation du RDC ; chaque correction est inscrite au journal.</p>`;
}

function blocSurfaces(s) {
  const L = [['surface_plancher', 'Surface de plancher'], ['emprise_sol', 'Emprise au sol'],
             ['surface_habitable', 'Surface habitable'], ['surface_taxable', 'Surface taxable (information)']];
  return `<h2>Surfaces du rez-de-chaussée</h2>
    <table><tr><th>Surface</th><th class="n">Valeur</th><th>Statut</th><th>Déductions et remarques</th></tr>
    ${L.map(([k, lib]) => { const x = s[k]; if (!x) return ''; const v = x.valeur; return `<tr>
      <td><b>${lib}</b><div class="petit discret">${esc(x.reference)}</div></td>
      <td class="n"><b>${nb(v.valeur)} m²</b></td>
      <td class="${v.statut}">${SYMB[v.statut]} ${v.statut === 'confirme' ? 'confirmée' : v.statut === 'hypothese' ? 'hypothèse' : 'contrôle impossible'}
        ${v.consequence ? `<div class="petit">${esc(v.consequence)}</div>` : ''}</td>
      <td>${x.deductions.map(d => `<div>− ${esc(d.libelle)} : ${nb(d.surface)} m²</div>`).join('')}
        ${x.notes.map(t => `<div class="petit discret">${esc(t)}</div>`).join('')}</td></tr>`; }).join('')}</table>`;
}

function blocMursOuvertures(n) {
  const v = x => `<span class="${x.statut}">${SYMB[x.statut]} ${x.valeur == null ? esc(x.manque) : (typeof x.valeur === 'number' ? nb(x.valeur) + ' ' + esc(x.unite) : x.valeur ? 'oui' : 'non')}</span>`;
  return `<details><summary><b>Murs (${n.murs.length}) et ouvertures (${n.ouvertures.length})</b></summary>
    <div class="deux" style="margin-top:10px">
      <table><tr><th>Mur</th><th>Type</th><th class="n">Épaisseur</th><th>Porteur</th></tr>
        ${n.murs.map(m => `<tr><td>${esc(m.id)}</td><td>${m.exterieur ? 'façade' : 'intérieur'}</td><td class="n">${nb(m.epaisseur)} m</td>
          <td>${v(m.porteur)}<div class="petit discret">${esc(m.porteur.consequence)}</div></td></tr>`).join('')}</table>
      <table><tr><th>Ouverture</th><th>Type</th><th>Largeur</th><th>Hauteur</th><th>Origine</th></tr>
        ${n.ouvertures.map(o => `<tr><td>${esc(o.id)}</td><td>${esc(o.type)}${o.exterieure ? '' : ' (int.)'}</td>
          <td>${v(o.largeur)}</td><td>${v(o.hauteur)}</td><td class="petit">${esc(o.origine)}</td></tr>`).join('')}</table>
    </div></details>`;
}

function blocPoints(p) {
  const cles = Object.keys(E.points_arret_libelles);
  const premier = cles.find(k => !p.points_arret[k].valide);
  return `<h2>Points d'arrêt</h2><ol class="points">
    ${cles.map(k => { const pa = p.points_arret[k]; return `<li>${esc(E.points_arret_libelles[k])}
      ${pa.valide ? `<div class="valide">✅ validé le ${esc(pa.le.replace('T', ' à '))} par ${esc(pa.par)}${pa.remarque ? ` — ${esc(pa.remarque)}` : ''}</div>`
        // jalon J1 : seul le RDC se valide ici ; les points suivants viendront avec leurs étapes
        : k === premier && k === '1_rdc' && p.batiment.niveaux.length
          ? `<div class="ligne"><label><span>Remarque (facultative)</span><input id="pa-remarque" size="28"></label>
             <button id="pa-valider" data-cle="${k}">Je valide</button></div>`
          : `<div class="petit discret">${k === '1_rdc' ? 'importez le plan du RDC' : 'étape à venir'}</div>`}</li>`; }).join('')}
  </ol>`;
}

function blocJournal(p) {
  const j = [...p.journal].reverse();
  return `<h2>Journal des décisions</h2>
    <form id="journal" class="ligne">
      <label><span>Sujet</span><input name="sujet" size="14" required></label>
      <label><span>Décision</span><input name="choix" size="18" required></label>
      <label><span>Motif</span><input name="motif" size="18"></label>
      <button class="second">Noter</button>
    </form>
    <table style="margin-top:8px"><tr><th>Date</th><th>Sujet</th><th>Décision</th></tr>
    ${j.map(d => `<tr><td class="petit">${esc(d.le.replace('T', ' '))}${d.par ? `<div class="discret">${esc(d.par)}</div>` : ''}</td>
      <td>${esc(d.sujet)}${d.genre === 'defaut-prudent' ? ' <span class="petit hypothese">(réglage par défaut)</span>' : ''}</td>
      <td>${esc(d.choix)}${d.motif ? `<div class="petit discret">${esc(d.motif)}</div>` : ''}</td></tr>`).join('')}</table>`;
}

// ---------- volumétrie, cartouche, baies, pièces graphiques

function champValeur(nom, lib, v, unite, aide = '') {
  // une valeur du modèle : son statut (✅ saisie, ⚠️ supposée), modifiable
  const st = v && v.statut ? v.statut : 'impossible';
  const val = v && v.valeur != null ? String(v.valeur).replace('.', ',') : '';
  // seule une valeur modifiée, ou supposée et expressément confirmée, est envoyée :
  // une hypothèse ne devient jamais « confirmée » sans action de l'utilisateur (R4)
  return `<label><span>${lib} <b class="${st}">${SYMB[st]}</b>${aide ? ` <i class="discret">${esc(aide)}</i>` : ''}</span>
    <input name="${nom}" value="${esc(val)}" data-init="${esc(val)}" size="7" inputmode="decimal"> ${esc(unite)}
    ${st === 'hypothese' ? `<span class="petit"><input type="checkbox" data-confirmer="${nom}"> je confirme</span>` : ''}</label>`;
}

function valeursModifiees(form) {
  const out = {};
  form.querySelectorAll('input[data-init]').forEach(i => {
    const conf = form.querySelector(`input[data-confirmer="${i.name}"]`);
    if (i.value.trim() !== i.dataset.init || (conf && conf.checked)) if (i.value.trim() !== '') out[i.name] = i.value.trim();
  });
  return out;
}

function blocVolumetrie(p) {
  const v = p.batiment.volumetrie, n = p.batiment.niveaux[0];
  const T = E.toiture || {};
  return `<h2>Volumétrie et toiture</h2>
    <form id="volumetrie">
      <div class="ligne">
        ${champValeur('hauteur_egout', 'Égout', v.hauteur_egout, 'm')}
        ${champValeur('hauteur_arase', 'Arase des murs', v.hauteur_arase, 'm')}
        ${champValeur('hauteur_sous_plafond', 'Sous plafond', n.hauteur_sous_plafond, 'm')}
      </div>
      <div class="ligne">
        ${champValeur('pente_toiture', 'Pente', v.pente_toiture, '°')}
        ${champValeur('debord_toiture', 'Débord', v.debord_toiture, 'm')}
        ${champValeur('vide_sanitaire', 'Vide sanitaire', v.vide_sanitaire, 'm')}
      </div>
      <div class="ligne">
        ${champValeur('altitude_rdc', 'RDC fini (NGF)', n.altitude_sol_fini, 'm')}
        ${champValeur('terrain_fini', 'Terrain fini', v.terrain_fini, 'm', 'par rapport au RDC')}
        ${champValeur('nord', 'Nord', v.nord, '°', '90 = haut du plan, 270 = bas')}
      </div>
      <label><span>Couverture (matériau, teinte)</span><input name="couverture" value="${esc(v.couverture)}" size="40" placeholder="Ardoise artificielle 40 × 24, teinte ardoise"></label>
      <button>Enregistrer</button>
    </form>
    <p class="petit">${T.erreur ? `<span class="hypothese">${esc(T.erreur)}</span>`
      : `Toiture à croupes calculée : ${T.pans || 0} pans ; faîtages ${(T.faitages || []).map(f => '+' + nb(f)).join(' ; ')}.`}</p>
    <p class="petit discret">⚠️ = valeur courante supposée, rappelée en rouge sur les pièces tant qu'elle n'est pas saisie. Hauteurs par rapport au sol fini du RDC (±0,00).</p>`;
}

function blocCartouche(p) {
  const mods = (p.modifications || []).concat([{ date: '', objet: '' }]);
  return `<h2>Cartouche et page de garde</h2>
    <form id="cartouche">
      <label><span>Maître d'ouvrage (« Construction de »)</span><input name="maitre_ouvrage" value="${esc(p.maitre_ouvrage)}" size="40"></label>
      <label><span>Adresse actuelle du maître d'ouvrage</span><input name="adresse_maitre_ouvrage" value="${esc(p.adresse_maitre_ouvrage)}" size="40"></label>
      <label><span>Adresse du terrain</span><input name="adresse" value="${esc(p.adresse)}" size="40"></label>
      <div class="ligne">
        <label><span>Parcelles</span><input name="parcelles" value="${esc(p.parcelles.join(', '))}" size="18"></label>
        ${champValeur('surface_terrain', 'Surface du terrain', p.surface_terrain, 'm²')}
        <label><span>Zone sismique ${p.zone_sismique.valeur ? '✅' : '❓'}</span><input name="zone_sismique" value="${esc(p.zone_sismique.valeur || '')}" size="6"></label>
      </div>
      <div class="ligne">
        <label><span>Chauffage</span><input name="chauffage" value="${esc(p.chauffage)}" size="24"></label>
        <label><span>Divers</span><input name="divers" value="${esc(p.divers)}" size="16"></label>
      </div>
      <div class="petit discret">Dates et modifications (page de garde)</div>
      ${mods.map((m, i) => `<div class="ligne mod"><input name="mdate" value="${esc(m.date)}" size="10" placeholder="jj/mm/aaaa">
        <input name="mobjet" value="${esc(m.objet)}" size="34" placeholder="objet de la modification"></div>`).join('')}
      <button>Enregistrer</button>
    </form>`;
}

function blocBaies(n) {
  const ext = n.ouvertures.filter(o => o.exterieure);
  const v = x => `<span class="${x.statut}">${SYMB[x.statut]}</span>`;
  return `<h2>Baies extérieures (${ext.length})</h2>
    <p class="petit discret">Largeur × hauteur et allège lues sur le plan quand elles y sont écrites (✅), sinon à saisir : une baie sans hauteur n'est pas dessinée en façade.</p>
    <table><tr><th>Baie</th><th>Type</th><th>Largeur</th><th>Hauteur</th><th>Allège</th><th>Menuiserie</th><th></th></tr>
    ${ext.map(o => `<tr data-baie="${esc(o.id)}">
      <td>${esc(o.id)}</td><td>${esc(o.type)}</td>
      ${[['b-l', o.largeur], ['b-h', o.hauteur], ['b-a', o.allege]].map(([c, x]) => { const val = x.valeur != null ? nb(x.valeur) : '';
        return `<td>${v(x)} <input class="${c}" value="${val}" data-init="${val}" size="5"></td>`; }).join('')}
      <td><select class="b-m">${[['', 'vitrée'], ['pleine', 'pleine'], ['garage', 'porte de garage']].map(([k, l]) =>
        `<option value="${k}" ${(o.menuiserie || (o.type === 'porte de garage' ? 'garage' : '')) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td><button class="second b-ok">Enregistrer</button></td></tr>`).join('')}</table>`;
}

const PIECES_GRAPHIQUES = [['page_de_garde', 'Page de garde (tableau des surfaces, résumé)'], ['coupes', 'PCMI 3 – Coupes'],
  ['facades', 'PCMI 5 – Façades'], ['plan_toiture', 'PCMI 5 – Plan de toiture'], ['plan_rdc', 'Plan du rez-de-chaussée']];

function blocPiecesGraphiques(p) {
  const url = f => `/api/projets/${encodeURIComponent(E.dossier)}/fichiers/${f.split('/').map(encodeURIComponent).join('/')}`;
  return `<h2>Pièces graphiques du permis</h2>
    <form id="generer">
      <div class="ligne">${PIECES_GRAPHIQUES.map(([k, l]) => `<label><input type="checkbox" name="piece" value="${k}" checked> ${esc(l)}</label>`).join('')}</div>
      <button>Générer le PDF</button>
    </form>
    <p class="petit discret">Chaque génération est un nouveau fichier dans 04_pieces/${esc(p.indice)}/ (rien n'est écrasé). Les hypothèses encore supposées sont rappelées en rouge sur les planches.
      Plan de masse, notice et planches photographiques : prochaine étape de l'atelier.</p>
    ${(E.pieces_generees || []).length ? `<div class="petit"><b>Déjà générées :</b><ul>${E.pieces_generees.slice(0, 8).map(f =>
      `<li><a href="${url(f)}" target="_blank">${esc(f)}</a></li>`).join('')}</ul></div>` : ''}`;
}

// ---------- réglages du cabinet

async function reglages() {
  $('#fil').innerHTML = '<a href="#">Projets</a> › Réglages du cabinet';
  const r = await api('/reglages');
  const champ = (k, lib, taille = 40) => `<label><span>${lib}</span><input name="${k}" value="${esc(r[k] || '')}" size="${taille}"></label>`;
  $('#app').innerHTML = `<h1>Réglages du cabinet</h1>
    <div class="deux"><div class="carte">
      <form id="reglages">
        ${champ('societe', 'Société')}
        ${champ('adresse_societe', 'Adresse de la société')}
        <div class="ligne">${champ('telephone', 'Téléphone', 16)}${champ('email', 'E-mail', 24)}</div>
        <div class="ligne">${champ('siren', 'SIREN', 14)}${champ('tva', 'N° de TVA', 18)}</div>
        ${champ('dessinateur', 'Dessiné par (cartouche)')}
        <label><span>Mention de propriété (page de garde)</span><textarea name="mention_propriete" rows="3" cols="50">${esc(r.mention_propriete)}</textarea></label>
        <button>Enregistrer</button>
      </form></div>
      <div class="carte"><h2>Logos du cartouche</h2>
        <p class="petit">Logo de la société : ${r.logo ? esc(r.logo) : 'logo CP Constructions fourni avec l\'atelier'}.</p>
        <form id="logo"><label><span>Logo RE2020 (PNG ou JPEG) — ${r.logo_re2020_present ? '✅ présent' : 'aucun : la case reste vide'}</span>
          <input type="file" name="fichier" accept=".png,.jpg,.jpeg"></label><button class="second">Envoyer</button></form>
        <p class="petit discret">Ces réglages restent sur ce Mac, dans le dossier des projets. Ils ne vont jamais dans le dépôt.</p></div>
    </div>`;
  $('#reglages').onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target), corps = {};
    for (const [k, v] of f.entries()) corps[k] = v;
    try { await post('/reglages', corps); message('Réglages enregistrés.'); } catch (e) { message(e.message, true); }
  };
  $('#logo').onsubmit = async ev => {
    ev.preventDefault();
    try { await api('/reglages/logo_re2020', { method: 'POST', body: new FormData(ev.target) }); reglages(); message('Logo enregistré.'); }
    catch (e) { message(e.message, true); }
  };
}

// ---------- actions

async function agir(promesse, ok) {
  try { E = await promesse; dessiner(); if (ok) message(ok); } catch (e) { message(e.message, true); }
}

function brancher() {
  const base = '/projets/' + E.dossier;
  $('#niveaux').onchange = ev => agir(post(base + '/niveaux', { type_niveaux: ev.target.value, par: par() }), 'Niveaux enregistrés.');
  $('#import').onsubmit = ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const b = ev.target.querySelector('button'); b.disabled = true; b.textContent = 'Lecture du plan…';
    agir(api(base + '/rdc', { method: 'POST', body: f }), 'Plan importé : vérifiez l’interprétation puis validez le RDC.')
      .finally(() => { b.disabled = false; });
  };
  document.querySelectorAll('tr[data-piece]').forEach(tr => {
    const id = tr.dataset.piece, url = `${base}/pieces/${id}`;
    tr.querySelector('.p-nom').onchange = ev => agir(post(url, { nom: ev.target.value, par: par() }), 'Pièce renommée.');
    tr.querySelector('.p-usage').onchange = ev => agir(post(url, { usage: ev.target.value, par: par() }), 'Usage modifié.');
    tr.querySelector('.p-hab').onchange = ev => agir(post(url, { exclue_habitable: !ev.target.checked, par: par() }), 'Surface habitable recalculée.');
    tr.querySelector('.p-ecarter').onclick = () => {
      if (confirm('Écarter cette surface ? Elle ne sera plus comptée comme une pièce.'))
        agir(post(url, { ecarter: true, par: par() }), 'Surface écartée.');
    };
  });
  const v = $('#pa-valider');
  if (v) v.onclick = () => {
    if (!par()) { message('Indiquez votre nom en haut à droite : il signe la validation.', true); qui.focus(); return; }
    const nEcarts = E.projet.ecarts_rdc.length;
    if (nEcarts && !confirm(`${nEcarts} écart(s) restent affichés. Les avez-vous vérifiés sur le plan source ?`)) return;
    agir(post(`${base}/points/${v.dataset.cle}`, { par: par(), remarque: $('#pa-remarque').value }), 'Point d’arrêt validé.');
  };
  const fv = $('#volumetrie');
  if (fv) fv.onsubmit = ev => {
    ev.preventDefault();
    const valeurs = valeursModifiees(ev.target);
    const coul = ev.target.querySelector('input[name=couverture]');
    if (coul.value.trim() !== E.projet.batiment.volumetrie.couverture) valeurs.couverture = coul.value.trim();
    if (!Object.keys(valeurs).length) { message('Rien à enregistrer : aucune valeur modifiée ni confirmée.'); return; }
    agir(post(base + '/volumetrie', { valeurs, par: par() }), 'Volumétrie enregistrée : les pièces en tiendront compte.');
  };
  const fc = $('#cartouche');
  if (fc) fc.onsubmit = ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const dates = f.getAll('mdate'), objets = f.getAll('mobjet');
    const mod = valeursModifiees(ev.target);
    const st = mod.surface_terrain != null ? String(mod.surface_terrain).replace(',', '.') : '';
    agir(post(base + '/infos', {
      maitre_ouvrage: f.get('maitre_ouvrage'), adresse_maitre_ouvrage: f.get('adresse_maitre_ouvrage'), adresse: f.get('adresse'),
      parcelles: String(f.get('parcelles') || '').split(','), surface_terrain: st ? Number(st) : null,
      zone_sismique: f.get('zone_sismique') || null, chauffage: f.get('chauffage'), divers: f.get('divers'),
      modifications: dates.map((d, i) => ({ date: d, objet: objets[i] })), par: par() }), 'Cartouche enregistré.');
  };
  document.querySelectorAll('tr[data-baie]').forEach(tr => {
    tr.querySelector('.b-ok').onclick = () => {
      // seules les valeurs modifiées sont envoyées : une largeur supposée ne devient pas « lue » par mégarde
      const lire = c => { const i = tr.querySelector(c), v = i.value.trim();
        return v === '' || v === i.dataset.init ? null : Number(v.replace(',', '.')); };
      agir(post(`${base}/ouvertures/${tr.dataset.baie}`, { largeur: lire('.b-l'), hauteur: lire('.b-h'), allege: lire('.b-a'),
        menuiserie: tr.querySelector('.b-m').value, par: par() }), 'Baie enregistrée.');
    };
  });
  const fg = $('#generer');
  if (fg) fg.onsubmit = async ev => {
    ev.preventDefault();
    const pieces = new FormData(ev.target).getAll('piece');
    const b = ev.target.querySelector('button'); b.disabled = true; b.textContent = 'Génération…';
    try {
      const r = await post(base + '/pieces-graphiques', { pieces: pieces.length === PIECES_GRAPHIQUES.length ? [] : pieces, par: par() });
      E = r; dessiner();
      window.open(`/api/projets/${encodeURIComponent(E.dossier)}/fichiers/${r.fichier.split('/').map(encodeURIComponent).join('/')}`, '_blank');
      message('PDF généré.');
    } catch (e) { message(e.message, true); b.disabled = false; b.textContent = 'Générer le PDF'; }
  };
  $('#journal').onsubmit = ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    agir(post(base + '/journal', { sujet: f.get('sujet'), choix: f.get('choix'), motif: f.get('motif'), par: par() }), 'Décision notée.');
  };
}

route();
