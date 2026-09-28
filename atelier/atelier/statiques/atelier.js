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
  if (m) ouvrirProjet(m[1]); else accueil();
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
    <div class="carte">${blocMursOuvertures(n)}</div>` : ''}
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
      <label><span>Échelle du PDF (ex. 100 pour 1/100) — inutile pour un DXF</span><input name="echelle" inputmode="decimal" placeholder="100"></label>
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
  return `<svg class="plan" viewBox="${cadre(n.contour_exterieur)}" preserveAspectRatio="xMidYMid meet">${pieces}${murs}${ferm}${ouv}</svg>`;
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
  $('#journal').onsubmit = ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    agir(post(base + '/journal', { sujet: f.get('sujet'), choix: f.get('choix'), motif: f.get('motif'), par: par() }), 'Décision notée.');
  };
}

route();
