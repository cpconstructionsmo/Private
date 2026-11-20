/* Relevé de visite — le terrain (construction neuve et agrandissement).

   Une fois le terrain localisé (adresse, ou GPS de l'iPhone sur place), les
   services publics gratuits disent l'essentiel, sans clé :
   - Géoplateforme (IGN) : géocodage de l'adresse (data.geopf.fr/geocodage) ;
   - API Carto (IGN) : la parcelle cadastrale (contenance) et le Géoportail
     de l'urbanisme (document PLU / PLUi / carte communale / RNU, zone,
     règlement en PDF, servitudes comme les abords de monument historique,
     informations comme l'aléa argile ou le radon) ;
   - Géorisques : le rapport des risques à l'adresse (naturels et
     technologiques, avec le lien du rapport officiel), l'exposition au
     retrait-gonflement des argiles et la zone de sismicité.
   Les réponses sont lues ici (formats vérifiés sur les services le
   20/11/2026), gardées avec la visite (consultables hors ligne ensuite), et
   traduites en points d'attention. Ces points sont INDICATIFS : ils disent
   quoi vérifier, jamais une règle appliquée d'office (rien n'est inventé ;
   chaque seuil cité renvoie à sa vérification).
   Fonctions pures. Tests : tests/t_releve_terrain.js. */

export const GEOCODAGE = 'https://data.geopf.fr/geocodage/search';
export const API_CARTO = 'https://apicarto.ign.fr/api';
export const GEORISQUES = 'https://www.georisques.gouv.fr/api/v1';

export const FORMES = ['Rectangulaire', 'En longueur', 'Irrégulier', 'En drapeau'];
export const PENTES = ['Plat', 'Légère pente', 'Forte pente'];
export const ORIENTATIONS = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest'];
export const ACCES = ['Facile', 'Étroit', 'Difficile (engins)'];
export const OUI_NON = ['Oui', 'Non', 'Ne sait pas'];
export const RESEAUX = [['eau', 'Eau potable'], ['electricite', 'Électricité'], ['assainissement', 'Assainissement'], ['gaz', 'Gaz'], ['fibre', 'Fibre / téléphone']];
export const ETATS_RESEAU = ['Raccordé', 'En limite', 'Absent', 'Ne sait pas'];
export const ASSAINISSEMENTS = ['Tout-à-l’égout', 'Individuel (fosse, micro-station)', 'À étudier'];

const point = (lon, lat) => encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [lon, lat] }));
const ll = (lon, lat) => (+lon).toFixed(6) + ',' + (+lat).toFixed(6);

/* les adresses à interroger pour un point (et sa commune, pour le RNU) */
export function urls(lon, lat) {
  return {
    parcelle: API_CARTO + '/cadastre/parcelle?geom=' + point(lon, lat),
    zone: API_CARTO + '/gpu/zone-urba?geom=' + point(lon, lat),
    document: API_CARTO + '/gpu/document?geom=' + point(lon, lat),
    servitudes: API_CARTO + '/gpu/assiette-sup-s?geom=' + point(lon, lat),
    informations: API_CARTO + '/gpu/info-surf?geom=' + point(lon, lat),
    prescriptions: API_CARTO + '/gpu/prescription-surf?geom=' + point(lon, lat),
    rapport: GEORISQUES + '/resultats_rapport_risque?latlon=' + ll(lon, lat),
    argile: GEORISQUES + '/rga?latlon=' + ll(lon, lat),
    seisme: GEORISQUES + '/zonage_sismique?latlon=' + ll(lon, lat),
  };
}
/* les règles du règlement PLU lues par l'IA (fonction « imaginer », action reglement) */
export const REGLES_PLU = [['destination', 'Constructions autorisées'], ['emprise', 'Emprise au sol'], ['hauteur', 'Hauteur'],
  ['implantationVoies', 'Recul / voies'], ['implantationLimites', 'Recul / limites séparatives'], ['aspect', 'Aspect extérieur'],
  ['toitures', 'Toitures'], ['clotures', 'Clôtures'], ['stationnement', 'Stationnement'], ['espacesVerts', 'Espaces verts']];
export const urlCommune = insee => API_CARTO + '/gpu/municipality?insee=' + encodeURIComponent(insee);
export const urlGeocodage = q => GEOCODAGE + '?limit=1&q=' + encodeURIComponent(q);
export const carteUrbanisme = (lon, lat) => 'https://www.geoportail-urbanisme.gouv.fr/map/#tile=1&lon=' + (+lon).toFixed(6) + '&lat=' + (+lat).toFixed(6) + '&zoom=18';

const txt = (v, max = 200) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const props = j => (j && Array.isArray(j.features) ? j.features : []).map(f => (f && f.properties) || {});

/* l'adresse géocodée : { lon, lat, label, insee } ou null */
export function lireGeocodage(j) {
  const f = j && Array.isArray(j.features) && j.features[0];
  const c = f && f.geometry && f.geometry.coordinates;
  if (!c || !isFinite(c[0]) || !isFinite(c[1])) return null;
  const p = f.properties || {};
  return { lon: +c[0], lat: +c[1], label: txt(p.label), insee: txt(p.citycode, 5), score: typeof p.score === 'number' ? Math.round(p.score * 100) / 100 : null };
}

/* la parcelle sous le point */
export function lireParcelle(j) {
  const p = props(j)[0];
  if (!p || !p.section) return null;
  return { idu: txt(p.idu, 20), section: txt(p.section, 4), numero: txt(String(p.numero ?? ''), 6), commune: txt(p.nom_com, 80), insee: txt(p.code_insee, 5),
    contenance: typeof p.contenance === 'number' && p.contenance > 0 ? p.contenance : null };
}

/* le règlement de la zone : le fichier du document d'urbanisme (Géoplateforme) */
export function urlReglement(z) {
  if (!z) return null;
  if (/^https?:\/\//.test(z.urlfic || '')) return z.urlfic;
  if (!z.nomfic || !z.partition || !z.gpu_doc_id) return null;
  return 'https://data.geopf.fr/annexes/gpu/documents/' + encodeURIComponent(z.partition) + '/' + encodeURIComponent(z.gpu_doc_id) + '/' + String(z.nomfic).split('#').map((x, i) => i ? x : encodeURIComponent(x)).join('#');
}
const TYPES_ZONE = { U: 'zone urbaine', AUc: 'zone à urbaniser (constructible)', AUs: 'zone à urbaniser (fermée)', AU: 'zone à urbaniser', A: 'zone agricole', N: 'zone naturelle' };
/* servitudes d'utilité publique les plus courantes en construction (codes nationaux) */
export const SERVITUDES = {
  ac1: 'Abords d’un monument historique (avis de l’Architecte des Bâtiments de France)',
  ac2: 'Site inscrit ou classé',
  ac4: 'Site patrimonial remarquable',
  pm1: 'Plan de prévention des risques naturels (PPRN)',
  pm3: 'Plan de prévention des risques technologiques (PPRT)',
  el7: 'Alignement (voirie)',
  i4: 'Ligne électrique',
  int1: 'Voisinage d’un cimetière',
  t1: 'Voie ferrée',
  pt2: 'Faisceau hertzien',
  as1: 'Captage d’eau potable',
};
export function lireUrbanisme({ zone, document, commune, servitudes, informations, prescriptions } = {}) {
  const z = props(zone)[0] || null, d = props(document)[0] || null, c = props(commune)[0] || null;
  const vus = new Set(), sup = [];
  props(servitudes).forEach(s => { const code = txt(s.suptype, 8).toLowerCase(); const cle = code + '|' + (s.idgen || s.idass || ''); if (!code || vus.has(cle)) return; vus.add(cle);
    sup.push({ code, libelle: SERVITUDES[code] || ('Servitude ' + code.toUpperCase()), detail: txt(s.typeass || s.nomass, 160) }); });
  const lib = x => txt(x.libelle, 200);
  const info = [...new Set(props(informations).map(lib).filter(Boolean))].slice(0, 12);
  const presc = [...new Set(props(prescriptions).map(lib).filter(Boolean))].slice(0, 12);
  return {
    document: d ? { type: txt(d.du_type, 12) || null, titre: txt(d.grid_title, 120) || null } : null,
    rnu: c ? c.is_rnu === true : null,
    zone: z ? { libelle: txt(z.libelle, 20), libelong: txt(z.libelong, 160), type: txt(z.typezone, 6), typeLibelle: TYPES_ZONE[txt(z.typezone, 6)] || null, reglement: urlReglement(z) } : null,
    servitudes: sup.slice(0, 12), informations: info, prescriptions: presc,
  };
}

/* les risques : rapport Géorisques à l'adresse, argiles, sismicité */
const statut = r => txt(r.libelleStatutAdresse, 80) || txt(r.libelleStatutCommune, 80);
export function lireRisques({ rapport, argile, seisme } = {}) {
  const liste = o => Object.entries((o && typeof o === 'object') ? o : {}).filter(([, r]) => r && r.present).map(([cle, r]) => ({ cle, libelle: txt(r.libelle, 80), statut: statut(r) }));
  const sz = seisme && Array.isArray(seisme.data) && seisme.data[0];
  const code = argile && /^[0-3]$/.test(String(argile.codeExposition ?? '')) ? +argile.codeExposition : null;
  return {
    url: rapport && /^https:\/\/(www\.)?georisques\.gouv\.fr\//.test(rapport.url || '') ? rapport.url : null,
    commune: rapport && rapport.commune ? txt(rapport.commune.libelle, 80) : null,
    naturels: liste(rapport && rapport.risquesNaturels),
    technologiques: liste(rapport && rapport.risquesTechnologiques),
    argile: code != null ? { code, libelle: txt(argile.exposition, 60) } : null,
    seisme: sz && /^[1-5]$/.test(String(sz.code_zone)) ? { zone: +sz.code_zone, libelle: txt(sz.zone_sismicite, 40) } : null,
  };
}

/* « Risque Existant », « Risque Concerne »… : présent à l'adresse ? (les statuts « inconnu », « non connu », « non concerné » ne comptent pas) */
const avere = s => /existant|concern/i.test(s || '') && !/non concern|inconnu|non connu/i.test(s || '');

/* les points d'attention, du plus important au moins important. Indicatifs :
   chacun dit quoi vérifier ; aucun n'est une règle appliquée d'office. */
export function pointsAttention(infos, { nature, surfaceProjet, surfaceExistante } = {}) {
  const res = [], ajoute = (niveau, titre, texte) => res.push({ niveau, titre, texte });
  const u = (infos && infos.urbanisme) || {}, r = (infos && infos.risques) || {};
  const z = u.zone;
  if (u.rnu) ajoute('important', 'Commune au RNU', 'Pas de PLU : le règlement national d’urbanisme s’applique (constructibilité limitée aux parties déjà urbanisées). Se renseigner en mairie.');
  if (z && z.type === 'A') ajoute('bloquant', 'Zone agricole (' + z.libelle + ')', 'Construction d’une maison très limitée en zone A : vérifier le règlement de la zone avant tout.');
  else if (z && z.type === 'N') ajoute('bloquant', 'Zone naturelle (' + z.libelle + ')', 'Construction très limitée en zone N : vérifier le règlement de la zone avant tout.');
  else if (z && /^AU/.test(z.type)) ajoute('important', 'Zone à urbaniser (' + z.libelle + ')', 'Constructible seulement selon les conditions du règlement (opération d’ensemble, équipements) : à vérifier.');
  (u.servitudes || []).forEach(s => {
    if (s.code === 'ac1' || s.code === 'ac2' || s.code === 'ac4') ajoute('important', s.libelle, 'L’Architecte des Bâtiments de France donne son avis : délais d’instruction plus longs, aspect extérieur encadré (matériaux, couleurs, menuiseries).');
    else if (s.code === 'pm1' || s.code === 'pm3') ajoute('important', s.libelle, 'Le règlement du plan de prévention s’impose au projet : à lire avant d’esquisser.');
  });
  if (r.argile && r.argile.code >= 2) ajoute('important', 'Argiles : exposition ' + (r.argile.code === 3 ? 'forte' : 'moyenne'), 'Étude géotechnique à prévoir (G1 à la vente du terrain, puis G2 pour la conception) et fondations adaptées : coût à intégrer au budget. À vérifier selon la loi ELAN.');
  else if (r.argile && r.argile.code === 1) ajoute('info', 'Argiles : exposition faible', 'Pas d’étude imposée à ce titre ; une étude de sol reste conseillée.');
  if (r.seisme && r.seisme.zone >= 3) ajoute('important', 'Sismicité zone ' + r.seisme.zone, 'Règles parasismiques applicables à une maison individuelle à partir de la zone 3 : à vérifier avec le bureau d’études.');
  else if (r.seisme) ajoute('info', 'Sismicité zone ' + r.seisme.zone + ' (' + (r.seisme.zone === 1 ? 'très faible' : 'faible') + ')', 'Pas de règle parasismique pour une maison individuelle dans cette zone (à vérifier).');
  const nat = k => (r.naturels || []).find(x => x.cle === k);
  const inond = nat('inondation');
  if (inond && avere(inond.statut)) ajoute('important', 'Inondation : ' + inond.statut.toLowerCase(), 'Vérifier le zonage du plan de prévention (PPRI) ou l’atlas des zones inondables : constructibilité, cote du plancher.');
  const nappe = nat('remonteeNappe');
  if (nappe && avere(nappe.statut)) ajoute('info', 'Remontée de nappe', 'Sous-sol déconseillé ; vérifier le niveau de la nappe.');
  const mvt = nat('mouvementTerrain');
  if (mvt && avere(mvt.statut)) ajoute('important', 'Mouvements de terrain', 'Cavités ou glissements connus à l’adresse : étude de sol indispensable.');
  const radon = nat('radon');
  if (radon && /important/i.test(radon.statut)) ajoute('info', 'Radon : potentiel significatif', 'Soigner l’étanchéité à l’air du plancher bas et la ventilation (à vérifier).');
  (r.technologiques || []).filter(x => avere(x.statut)).forEach(x => ajoute('info', x.libelle, 'Signalé à l’adresse par Géorisques : à regarder dans le rapport officiel.'));
  /* les seuils d'autorisation et d'architecte : rappel indicatif, à vérifier (Code de l'urbanisme) */
  const sp = +surfaceProjet || 0, se = +surfaceExistante || 0;
  if (nature === 'construction' && sp > 150) ajoute('important', 'Plus de 150 m²', 'Au-delà de 150 m² de surface de plancher, le recours à un architecte est obligatoire pour le permis de construire (à vérifier).');
  if (nature === 'agrandissement' && sp) {
    const enU = z && z.type === 'U' && !u.rnu;
    ajoute('info', 'Autorisation pour ' + sp + ' m² d’extension', (sp <= (enU ? 40 : 20) ? 'Déclaration préalable en principe' : 'Permis de construire en principe')
      + ' (seuil de ' + (enU ? '40 m² en zone urbaine d’un PLU' : '20 m²') + ', à vérifier en mairie).');
    if (se && se + sp > 150) ajoute('important', 'Plus de 150 m² après travaux', se + ' + ' + sp + ' m² dépasse 150 m² : architecte obligatoire si un permis est nécessaire (à vérifier).');
  }
  const ordre = { bloquant: 0, important: 1, info: 2 };
  return res.sort((a, b) => ordre[a.niveau] - ordre[b.niveau]);
}

/* ==========================================================================
   Le plan du terrain (plan de géomètre, de lotissement, ou esquisse cotée à
   la main), lu par l'IA (fonction « imaginer », action decrire, mode
   terrain) : ce qui est écrit dessus. Ici, l'analyse de cohérence, faite
   par le relevé lui-même : surface tirée des côtés (terrain à 4 côtés)
   comparée à la surface écrite et à la contenance du cadastre, façade
   comparée à celle relevée sur place. Rien n'est corrigé : les écarts sont
   dits, avec ce qu'il faut vérifier (bornage, géomètre).
   ========================================================================== */
const ecart = (a, b) => a && b ? Math.abs(a - b) / Math.max(a, b) : null;
const m2 = n => Math.round(n).toLocaleString('fr-FR') + ' m²';
export function analyserPlanTerrain(lu, { contenance, surfaceSaisie, facadeSaisie } = {}) {
  const res = [], dit = (niveau, texte) => res.push({ niveau, texte });
  if (!lu) return res;
  if (lu.esquisse === true) dit('info', 'Esquisse à main levée : elle n’est pas à l’échelle, seules les cotes écrites comptent. À confirmer par le plan de bornage ou un géomètre.');
  else if (lu.esquisse === false) dit('info', 'Plan à l’échelle' + (lu.echelle ? ' (' + lu.echelle + ')' : '') + ' : ses cotes sont fiables, sous réserve du bornage.');
  const L = (lu.cotes || []).map(c => c.longueur).filter(x => x > 0);
  let calcul = null;
  if (L.length === 4) {
    // quadrilatère : moyenne des côtés opposés (exacte pour un rectangle, approchée sinon)
    calcul = ((L[0] + L[2]) / 2) * ((L[1] + L[3]) / 2);
    const irregulier = ecart(L[0], L[2]) > 0.08 || ecart(L[1], L[3]) > 0.08;
    dit('info', 'Surface tirée des 4 côtés : environ ' + m2(calcul) + (irregulier ? ' (côtés opposés inégaux : approximation, les angles ne sont pas connus)' : '') + '.');
  } else if (L.length && L.length !== 4) dit('info', L.length + ' côtés cotés : la surface ne se déduit pas des seules longueurs (angles inconnus).');
  const ref = [['écrite sur le plan', lu.surface], ['du cadastre', contenance], ['saisie', surfaceSaisie]].filter(x => x[1] > 0);
  if (calcul) ref.forEach(([nom, val]) => { const e = ecart(calcul, val); if (e > 0.1) dit('important', 'Écart de ' + Math.round(e * 100) + ' % entre la surface tirée des côtés (' + m2(calcul) + ') et la surface ' + nom + ' (' + m2(val) + ') : une cote est peut-être fausse ou mal lue.'); });
  if (lu.surface && contenance) {
    const e = ecart(lu.surface, contenance);
    dit(e > 0.05 ? 'important' : 'ok', e > 0.05 ? 'La surface du plan (' + m2(lu.surface) + ') diffère de ' + Math.round(e * 100) + ' % de la contenance cadastrale (' + m2(contenance) + ') : le cadastre n’a pas valeur de bornage, vérifier le plan de bornage.'
      : 'Surface du plan cohérente avec le cadastre (' + m2(contenance) + ').');
  }
  if (lu.facade && facadeSaisie && ecart(lu.facade, facadeSaisie) > 0.1) dit('important', 'Façade sur le plan ' + String(lu.facade).replace('.', ',') + ' m, relevée ' + String(facadeSaisie).replace('.', ',') + ' m : à vérifier.');
  if (!lu.nord) dit('info', 'Le nord n’est pas indiqué sur le plan : orientation à confirmer sur place.');
  return res;
}
