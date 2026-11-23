'use strict';
/* ==========================================================================
   Relevé de chantier – validation
   1) Lecture / vérification du JSON et calculs (surfaces, murs, ouvertures)
   2) Dessin du plan 2D (même code pour l'écran et pour le PDF)
   3) Vue 3D (three.js)
   4) Export PDF (écrit à la main, sans bibliothèque) et DXF (DAO)
   5) Interface
   ========================================================================== */

/* ---------- Petits outils ---------- */
const $ = id => document.getElementById(id);
const isNum = v => typeof v === 'number' && isFinite(v);
const FR = n => { const s = (Math.round(n * 100) / 100).toFixed(2).replace('.', ','); return s === '-0,00' ? '0,00' : s; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sansAccent = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const NOM_TYPE = { porte: 'Porte', fenetre: 'Fenêtre', passage: 'Passage' };
const ABR_TYPE = { porte: 'P', fenetre: 'F', passage: 'Pa' };
const COUL_TYPE = { porte: '#c0392b', fenetre: '#1f6feb', passage: '#6b7280' };
const lettreMur = i => { let t = '', n = i + 1; while (n > 0) { n--; t = String.fromCharCode(65 + n % 26) + t; n = Math.floor(n / 26); } return t; };   /* 0 -> A, 1 -> B, 26 -> AA */
const couleurCouverture = c => { const t = sansAccent(c || ''); return /ardoise/.test(t) ? '#4b5563' : /tuile/.test(t) ? '#c2693d' : /zinc/.test(t) ? '#9aa7b4' : /acier|bac/.test(t) ? '#7d8b99' : /membrane|epdm|etanch|bitume/.test(t) ? '#3a3f47' : /vegetal|vert/.test(t) ? '#5f9e4a' : '#a8a29e'; };
const colOK = c => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) ? c.toLowerCase() : null;
const PASTELS = ['#e3eefb', '#fdeedd', '#e4f4e4', '#f5e5f1', '#fbf4d3', '#e0f2f2'];

/* ==========================================================================
   1) ANALYSE DU RELEVÉ
   ========================================================================== */
function analyser(d) {
  const err = [], warn = [];
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('Le fichier doit contenir un objet JSON (entre accolades { }).');
  if (!Array.isArray(d.pieces) || !d.pieces.length) throw new Error('Le relevé doit contenir au moins une pièce dans « pieces ».');

  const hDef = isNum(d.hauteurSousPlafond) && d.hauteurSousPlafond > 0 ? d.hauteurSousPlafond : 2.5;
  const ep = isNum(d.epaisseurMur) && d.epaisseurMur > 0 ? d.epaisseurMur : 0.1;
  const cle = p => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000);

  const M = {
    documents: Array.isArray(d.documents) ? d.documents.filter(x => x && x.id && isNum(x.w) && isNum(x.h)) : [],
    reperes: !(d.affichage && d.affichage.reperes === false), aReference: !!d.reference, duo: !!(d.reference && d.affichage && d.affichage.duo),
    nomRef: d.reference && d.reference.nom ? String(d.reference.nom) : 'Situation initiale', nomSit: d.nomSituation ? String(d.nomSituation) : 'Après travaux',
    rotation: d.affichage && isNum(d.affichage.rotation) ? d.affichage.rotation : 0,
    legende: Array.isArray(d.legende) ? d.legende.filter(l => l && typeof l === 'object').map(l => ({ couleur: colOK(l.couleur) || '#666666', texte: String(l.texte === undefined ? '' : l.texte) })) : [],
    notes: d.notes ? String(d.notes) : '', projet: String(d.projet || 'Relevé sans titre'), client: d.client ? String(d.client) : '',
    adresse: d.adresse ? String(d.adresse) : '', date: d.date ? String(d.date) : '',
    hDef, ep, rooms: [], walls: [], openings: [],
    etages: (Array.isArray(d.etages) && d.etages.length ? d.etages : [{}]).map((e, i) => ({ nom: String((e && e.nom) || (i === 0 ? 'Rez-de-chaussée' : 'Étage ' + i)) }))
  };
  const wallMap = new Map();
  const roomById = new Map();

  /* --- pièces et murs --- */
  d.pieces.forEach((p, k) => {
    const lib = 'Pièce n°' + (k + 1) + (p && p.nom ? ' (' + p.nom + ')' : '');
    if (!p || !Array.isArray(p.points) || p.points.length < 3) { err.push(lib + ' : il faut au moins 3 points dans « points ».'); return; }
    if (!p.points.every(q => Array.isArray(q) && q.length >= 2 && isNum(q[0]) && isNum(q[1]))) { err.push(lib + ' : chaque point doit être [x, y] en mètres.'); return; }
    const pts = p.points.map(q => [q[0], q[1]]);
    const n = pts.length;
    let A2 = 0, cx = 0, cy = 0;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
      const c = x0 * y1 - x1 * y0; A2 += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    }
    const aireSignee = A2 / 2;
    if (Math.abs(aireSignee) < 1e-6) { err.push(lib + ' : surface nulle (points alignés ?).'); return; }
    const room = {
      etage: Number.isInteger(p.etage) && p.etage >= 0 && p.etage < M.etages.length ? p.etage : 0,
      id: String(p.id || p.nom || ('piece' + (k + 1))), nom: String(p.nom || p.id || ('Pièce ' + (k + 1))),
      note: p.note ? String(p.note) : '', src: p, couleurTexte: colOK(p.style && p.style.texte), couleurCote: colOK(p.style && p.style.cote), hMesuree: !!p.hauteurMesuree, hScan: isNum(p.hauteurScan) ? p.hauteurScan : null, pts, aire: Math.abs(aireSignee), hauteur: isNum(p.hauteur) && p.hauteur > 0 ? p.hauteur : hDef,
      centre: [cx / (6 * aireSignee), cy / (6 * aireSignee)], perim: 0, edges: [],
      color: colOK(p.style && p.style.fond) || PASTELS[k % PASTELS.length]
    };
    for (let i = 0; i < n; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % n];
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      if (len < 0.01) { err.push(lib + ' : le mur n°' + i + ' a une longueur nulle (deux points identiques).'); continue; }
      const dx = (p1[0] - p0[0]) / len, dy = (p1[1] - p0[1]) / len;
      const nIn = aireSignee > 0 ? [-dy, dx] : [dy, -dx];
      const k0 = cle(p0), k1 = cle(p1), rev = k0 > k1;
      const wk = room.etage + '#' + (rev ? k1 + '|' + k0 : k0 + '|' + k1);
      let w = wallMap.get(wk);
      if (!w) {
        const a = rev ? p1 : p0, b = rev ? p0 : p1;
        w = { a, b, len, u: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], rooms: [], openings: [], h: hDef, etage: room.etage };
        wallMap.set(wk, w); M.walls.push(w);
      }
      w.rooms.push(room);
      const ps = Array.isArray(p.pointsScan) && p.pointsScan.length === n ? p.pointsScan : null;
      const lenScan = ps ? Math.hypot(ps[(i + 1) % n][0] - ps[i][0], ps[(i + 1) % n][1] - ps[i][1]) : len;
      const mesure = !!(p.mesuresMurs && p.mesuresMurs[i] !== undefined);
      const estime = !mesure && Array.isArray(p.cotesEstimees) && p.cotesEstimees.includes(i);
      if (mesure) w.mesure = true;
      if (!estime) w.scanne = true;
      const epC = p.epaisseurs && isNum(p.epaisseurs[i]) && p.epaisseurs[i] > 0 ? p.epaisseurs[i] : null, demoli = !!(p.demolis && p.demolis[i]);
      if (epC) w.epCustom = Math.max(w.epCustom || 0, epC); if (demoli) w.demoli = true;
      room.edges.push({ i, p: p0, q: p1, len, wall: w, rev, nIn, lenScan, mesure, estime, reglage: (p.reglagesCotes && p.reglagesCotes[i]) || null,
        epCustom: epC, demoli, reperesOff: !!(p.reperesMasques && p.reperesMasques[i]), lettre: lettreMur(i), nomMur: (p.notesMurs && p.notesMurs[i] && p.notesMurs[i].nom) || '', noteMur: (p.notesMurs && p.notesMurs[i] && p.notesMurs[i].note) || '' });
      room.perim += len;
    }
    M.rooms.push(room);
    roomById.set(room.id, room); roomById.set(room.nom, room);
  });
  if (err.length) throw new Error(err.join('\n'));

  /* --- ouvertures --- */
  (Array.isArray(d.ouvertures) ? d.ouvertures : []).forEach((o, j) => {
    const lib = 'Ouverture n°' + (j + 1);
    if (!o || typeof o !== 'object') { err.push(lib + ' : format incorrect.'); return; }
    const type = sansAccent(o.type || '');
    if (type !== 'porte' && type !== 'fenetre' && type !== 'passage') { err.push(lib + ' : « type » doit être "porte", "fenetre" ou "passage".'); return; }
    const room = roomById.get(String(o.piece));
    if (!room) { err.push(lib + ' : la pièce « ' + o.piece + ' » n\'existe pas.'); return; }
    const edge = room.edges.find(e => e.i === o.mur);
    if (!Number.isInteger(o.mur) || !edge) { err.push(lib + ' (' + room.nom + ') : « mur » doit être un numéro entre 0 et ' + (room.pts.length - 1) + '.'); return; }
    if (!isNum(o.position) || o.position < 0) { err.push(lib + ' (' + room.nom + ') : « position » (en m depuis le début du mur) est manquante.'); return; }
    if (!isNum(o.largeur) || o.largeur <= 0) { err.push(lib + ' (' + room.nom + ') : « largeur » est manquante.'); return; }
    if (o.position + o.largeur > edge.len + 0.005) {
      err.push(lib + ' (' + room.nom + ', mur ' + o.mur + ') : dépasse du mur (position ' + FR(o.position) + ' + largeur ' + FR(o.largeur) + ' > longueur ' + FR(edge.len) + ' m).'); return;
    }
    const sansAllege = type !== 'fenetre';
    const h = isNum(o.hauteur) && o.hauteur > 0 ? o.hauteur : (sansAllege ? 2.04 : 1.2);
    const allege = isNum(o.allege) && o.allege >= 0 ? o.allege : (sansAllege ? 0 : 0.9);
    const debut = sansAccent(o.charniere || 'debut') !== 'fin';
    const w = edge.wall;
    const op = {
      type, room, wall: w, w: o.largeur, h, allege, edge, src: o, mes: o.mesures || {}, mesure: Object.keys(o.mesures || {}).length > 0,
      pos: edge.rev ? edge.len - o.position - o.largeur : o.position,
      hingeA: edge.rev ? !debut : debut, nIn: edge.nIn, nArc: o.sens === 'inverse' ? [-edge.nIn[0], -edge.nIn[1]] : edge.nIn
    };
    w.openings.push(op); M.openings.push(op);
  });
  if (err.length) throw new Error(err.join('\n'));

  M.walls.forEach(w => {
    w.estime = !w.scanne && !w.mesure; w.ep = w.epCustom || ep;
    w.couleur = null; w.rooms.forEach(r => { const c = colOK(r.src.style && r.src.style.mur); if (c) w.couleur = c; });   /* la dernière pièce colorée donne sa couleur au mur */
    w.h = Math.max(...w.rooms.map(r => r.hauteur));
    w.openings.sort((p, q) => p.pos - q.pos);
    for (let i = 1; i < w.openings.length; i++) {
      const pr = w.openings[i - 1], cu = w.openings[i];
      if (cu.pos < pr.pos + pr.w - 0.005) warn.push('Deux ouvertures se chevauchent sur un même mur (' + cu.room.nom + ').');
    }
  });

  /* --- totaux par pièce --- */
  const surfOuv = (op, H) => op.w * Math.max(0, Math.min(op.h, H - op.allege));
  M.rooms.forEach(r => {
    r.volume = r.aire * r.hauteur;
    r.portes = 0; r.fenetres = 0; r.passages = 0;
    let murs = 0;
    r.edges.forEach(e => {
      if (e.wall.demoli) return;                    /* un mur à démolir ne compte plus */
      murs += e.len * r.hauteur;
      e.wall.openings.forEach(op => { murs -= surfOuv(op, r.hauteur); if (op.type === 'porte') r.portes++; else if (op.type === 'passage') r.passages++; else r.fenetres++; });
    });
    r.mursNets = murs;
  });
  M.rooms.forEach((r, i) => { r.idx = i; }); M.openings.forEach((op, i) => { op.idx = i; });
  let zc = 0;                                           /* altitude du sol de chaque étage : on empile les hauteurs + 20 cm de dalle */
  M.etages.forEach((e, k) => { const rs = M.rooms.filter(r => r.etage === k); e.nb = rs.length; e.hauteur = rs.length ? Math.max(...rs.map(r => r.hauteur)) : hDef; e.z = zc; e.aire = rs.reduce((t, r) => t + r.aire, 0); zc += e.hauteur + 0.2; });
  M.hauteurTotale = zc - 0.2;
  M.rooms.forEach(r => { r.z = M.etages[r.etage].z; }); M.walls.forEach(w => { w.z = M.etages[w.etage].z; });
  M.cloisons = [];                                       /* murs ajoutés (cloisons) : segments libres, hors des contours de pièces */
  (Array.isArray(d.cloisons) ? d.cloisons : []).forEach(c => {
    if (!c || !Array.isArray(c.a) || !Array.isArray(c.b) || !c.a.every(isNum) || !c.b.every(isNum)) return;
    const len = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]); if (len < 0.05) return;
    const et = Number.isInteger(c.etage) && c.etage >= 0 && c.etage < M.etages.length ? c.etage : 0;
    M.cloisons.push({ idx: M.cloisons.length, src: c, etage: et, a: [c.a[0], c.a[1]], b: [c.b[0], c.b[1]], len, u: [(c.b[0] - c.a[0]) / len, (c.b[1] - c.a[1]) / len], ep: isNum(c.ep) && c.ep > 0 ? c.ep : ep, z: M.etages[et].z, h: M.etages[et].hauteur });
  });

  /* symboles (dessin rapide) : équipements et trémie d'escalier, centre (x, y) en mètres, quart de tour */
  const TYPES_SYM = Object.keys(TAILLES_SYM);
  M.symboles = (Array.isArray(d.symboles) ? d.symboles : []).filter(x => x && TYPES_SYM.includes(x.type) && isNum(x.x) && isNum(x.y)).slice(0, 200).map((x, i) => ({
    idx: i, type: x.type, etage: Number.isInteger(x.etage) && x.etage >= 0 && x.etage < M.etages.length ? x.etage : 0, x: x.x, y: x.y,
    rot: [0, 90, 180, 270].includes(x.rot) ? x.rot : 0, l: isNum(x.l) && x.l > 0 ? x.l : (TAILLES_SYM[x.type] || [0.6])[0], w: isNum(x.w) && x.w > 0 ? x.w : (TAILLES_SYM[x.type] || [0, 0.6])[1], src: x }));

  /* toitures : l'emprise est le rectangle qui englobe les pièces couvertes, débord compris */
  const TAN = a => Math.tan(a * Math.PI / 180);
  M.toits = [];
  (Array.isArray(d.toitures) ? d.toitures : []).forEach(tt => {
    if (!tt || typeof tt !== 'object') return;
    const rs = (Array.isArray(tt.pieces) ? tt.pieces : []).map(id => roomById.get(String(id))).filter(Boolean);
    if (!rs.length) return;
    const type = ['plat', '1pente', '2pentes', '4pentes'].includes(tt.type) ? tt.type : '2pentes';
    const angle = isNum(tt.angle) ? Math.max(0, Math.min(70, tt.angle)) : ({ plat: 2, '1pente': 15, '2pentes': 35, '4pentes': 30 })[type];
    const deb = isNum(tt.debord) && tt.debord >= 0 ? tt.debord : 0.4;
    const xs = rs.flatMap(r => r.pts.map(q => q[0])), ys = rs.flatMap(r => r.pts.map(q => q[1]));
    const x0 = Math.min(...xs) - deb, x1 = Math.max(...xs) + deb, y0 = Math.min(...ys) - deb, y1 = Math.max(...ys) + deb, W = x1 - x0, Dp = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const sens = tt.sens || (type === '1pente' ? 'bas' : 'longueur'), base = Math.max(...rs.map(r => r.z + r.hauteur));
    let rise = 0, faitage = null; const lignes = [], fleches = [];
    if (type === '2pentes' || type === '4pentes') {
      const axe = (sens === 'largeur') === (W >= Dp) ? 'y' : 'x', span = axe === 'x' ? Dp : W, longAxe = axe === 'x' ? W : Dp, half = span / 2; rise = half * TAN(angle);
      const L = type === '4pentes' ? Math.max(0, longAxe - span) : longAxe;
      const a = axe === 'x' ? [cx - L / 2, cy] : [cx, cy - L / 2], b2 = axe === 'x' ? [cx + L / 2, cy] : [cx, cy + L / 2];
      faitage = [a, b2]; lignes.push([a, b2]);
      if (type === '4pentes') {
        const cs = axe === 'x' ? [[[x0, y0], [x0, y1]], [[x1, y0], [x1, y1]]] : [[[x0, y0], [x1, y0]], [[x0, y1], [x1, y1]]];
        cs[0].forEach(c => lignes.push([a, c])); cs[1].forEach(c => lignes.push([b2, c]));
        const e = half * 0.55; [[a, axe === 'x' ? [a[0] - e, a[1]] : [a[0], a[1] - e]], [b2, axe === 'x' ? [b2[0] + e, b2[1]] : [b2[0], b2[1] + e]]].forEach(f => fleches.push(f));
      }
      const e = half * 0.55, m = [cx, cy];
      if (axe === 'x') { fleches.push([m, [cx, cy - e]], [m, [cx, cy + e]]); } else { fleches.push([m, [cx - e, cy]], [m, [cx + e, cy]]); }
    } else if (type === '1pente') {
      const vert = sens === 'bas' || sens === 'haut', span = vert ? Dp : W; rise = span * TAN(angle);
      const dir = { bas: [0, 1], haut: [0, -1], gauche: [-1, 0], droite: [1, 0] }[sens] || [0, 1];
      for (let k = 1; k <= 3; k++) { const f = k / 4, c = vert ? [x0 + W * f, cy] : [cx, y0 + Dp * f]; fleches.push([[c[0] - dir[0] * span * 0.22, c[1] - dir[1] * span * 0.22], [c[0] + dir[0] * span * 0.22, c[1] + dir[1] * span * 0.22]]); }
    }
    const emprise = W * Dp;
    M.toits.push({ idx: M.toits.length, src: tt, id: String(tt.id || 't' + M.toits.length), nom: String(tt.nom || 'Toiture ' + (M.toits.length + 1)), type, angle, sens, debord: deb, couverture: String(tt.couverture || ''),
      couleur: colOK(tt.couleur) || couleurCouverture(tt.couverture), pieces: rs, rect: { x0, x1, y0, y1 }, poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], faitage, lignes, fleches, centre: [cx, cy],
      emprise, surface: emprise / Math.cos(angle * Math.PI / 180), pente: TAN(angle) * 100, base, rise, etageHaut: Math.max(...rs.map(r => r.etage)) });
  });
  if (M.toits.length) M.hauteurTotale = Math.max(M.hauteurTotale, ...M.toits.map(t => t.base + t.rise));
  M.totalAire = M.rooms.reduce((s, r) => s + r.aire, 0);
  M.totalVolume = M.rooms.reduce((s, r) => s + r.volume, 0);

  /* --- emprise --- */
  const xs = [], ys = [];
  M.rooms.forEach(r => r.pts.forEach(p => { xs.push(p[0]); ys.push(p[1]); })); M.cloisons.forEach(c => { xs.push(c.a[0], c.b[0]); ys.push(c.a[1], c.b[1]); });
  M.bbox = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  M.avertissements = [...new Set(warn)];
  return M;
}

/* ==========================================================================
   2) DESSIN DU PLAN 2D – "pinceaux" : écran (canvas) et PDF
   ========================================================================== */
const _mc = document.createElement('canvas').getContext('2d');
const police = (size, bold) => (bold ? 'bold ' : '') + size + 'px Helvetica, Arial, sans-serif';
function mesure(str, size, bold) { _mc.font = police(size, bold); return _mc.measureText(str).width; }

class PinceauEcran {
  constructor(ctx) { this.c = ctx; }
  mesure(s, size, bold) { return mesure(s, size, bold); }
  line(x1, y1, x2, y2, o) {
    const c = this.c; c.save(); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.lineWidth = o.w || 1; c.strokeStyle = o.color || '#000'; c.lineCap = o.cap || 'butt';
    if (o.dash) c.setLineDash(o.dash); c.stroke(); c.restore();
  }
  poly(pts, o) {
    const c = this.c; c.save(); c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    if (o.close !== false) c.closePath();
    if (o.fill) { c.fillStyle = o.fill; c.fill(); }
    if (o.stroke) { c.lineWidth = o.w || 1; c.strokeStyle = o.stroke; if (o.dash) c.setLineDash(o.dash); c.stroke(); }
    c.restore();
  }
  text(s, x, y, o) {
    const c = this.c, size = o.size || 11; c.save();
    c.font = police(size, o.bold); c.textAlign = o.align || 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = o.color || '#222'; c.fillText(s, x, y + size * 0.35); c.restore();
  }
}

/* Encodage des textes pour le PDF (Windows-1252 : accents français, €, œ, –, …) */
const CP1252 = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C,
  'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F,
  ' ': 0x20, ' ': 0xA0 };
function versCp1252(s) {
  let r = '';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === '→') r += '->'; else if (ch === '−') r += '-'; else if (ch === '≈') r += '~'; else if (ch === '↺') r += '(retour)';
    else if (CP1252[ch] !== undefined) r += String.fromCharCode(CP1252[ch]);
    else if (c < 0x80 || (c >= 0xA0 && c <= 0xFF)) r += ch;
    else r += '?';
  }
  return r;
}
const pdfStr = s => '(' + versCp1252(s).replace(/([\\()])/g, '\\$1') + ')';
const nb = n => String(Math.round(n * 100) / 100);
const rgb = h => { const v = parseInt(h.slice(1), 16); return nb(((v >> 16) & 255) / 255) + ' ' + nb(((v >> 8) & 255) / 255) + ' ' + nb((v & 255) / 255); };

class PagePdf {
  constructor(w, h) { this.w = w; this.h = h; this.ops = []; this.imgs = new Set(); }
  mesure(s, size, bold) { return mesure(s, size, bold); }
  line(x1, y1, x2, y2, o) {
    const H = this.h;
    this.ops.push('q ' + nb(o.w || 1) + ' w ' + (o.cap === 'square' ? '2' : '0') + ' J ' + rgb(o.color || '#000000') + ' RG ' +
      (o.dash ? '[' + o.dash.join(' ') + '] 0 d ' : '') + nb(x1) + ' ' + nb(H - y1) + ' m ' + nb(x2) + ' ' + nb(H - y2) + ' l S Q');
  }
  poly(pts, o) {
    const H = this.h;
    let s = 'q ';
    if (o.fill) s += rgb(o.fill) + ' rg ';
    if (o.stroke) s += rgb(o.stroke) + ' RG ' + nb(o.w || 1) + ' w ' + (o.dash ? '[' + o.dash.join(' ') + '] 0 d ' : '');
    s += pts.map((p, i) => nb(p[0]) + ' ' + nb(H - p[1]) + (i ? ' l' : ' m')).join(' ');
    if (o.close !== false) s += ' h';
    s += o.fill && o.stroke ? ' B' : o.fill ? ' f' : ' S';
    this.ops.push(s + ' Q');
  }
  text(s, x, y, o) {
    const size = o.size || 11, w = mesure(s, size, o.bold);
    const xx = o.align === 'right' ? x - w : o.align === 'left' ? x : x - w / 2;
    this.ops.push('q BT /' + (o.bold ? 'F2' : 'F1') + ' ' + nb(size) + ' Tf ' + rgb(o.color || '#222222') + ' rg ' +
      nb(xx) + ' ' + nb(this.h - (y + size * 0.35)) + ' Td ' + pdfStr(s) + ' Tj ET Q');
  }
  image(k, x, y, w, h) { this.imgs.add(k); this.ops.push('q ' + nb(w) + ' 0 0 ' + nb(h) + ' ' + nb(x) + ' ' + nb(this.h - y - h) + ' cm /Im' + (k + 1) + ' Do Q'); }
}

/* Dessine tout le plan. T = { s: pixels par mètre, ox, oy: décalage } */
/* copie du modèle tournée de 'deg' degrés (sens horaire à l'écran) : sert à dessiner le plan orienté comme on veut */
function tourner(M, deg) {
  if (!deg) return M;
  const a = deg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), R = v => [v[0] * c - v[1] * sn, v[0] * sn + v[1] * c];
  const walls = M.walls.map(w => Object.assign({}, w, { a: R(w.a), b: R(w.b), u: R(w.u) })), wmap = new Map(M.walls.map((w, i) => [w, walls[i]]));
  const rooms = M.rooms.map(r => { const nr = Object.assign({}, r, { pts: r.pts.map(R), centre: R(r.centre) });
    nr.edges = r.edges.map(e => Object.assign({}, e, { p: R(e.p), q: R(e.q), nIn: R(e.nIn), wall: wmap.get(e.wall) })); return nr; });
  const openings = M.openings.map(op => Object.assign({}, op, { nIn: R(op.nIn), nArc: R(op.nArc || op.nIn), wall: wmap.get(op.wall) })), omap = new Map(M.openings.map((op, i) => [op, openings[i]]));
  walls.forEach(w => { w.openings = w.openings.map(o => omap.get(o)); w.rooms = w.rooms.map(r => rooms[M.rooms.indexOf(r)]); });
  openings.forEach(op => { op.room = rooms[M.rooms.indexOf(op.room)]; });
  const cloisons = (M.cloisons || []).map(c => Object.assign({}, c, { a: R(c.a), b: R(c.b), u: R(c.u) }));
  const symboles = (M.symboles || []).map(x => { const q = R([x.x, x.y]); return Object.assign({}, x, { x: q[0], y: q[1], rot: (x.rot + deg + 360) % 360 }); });
  const toits = (M.toits || []).map(t => Object.assign({}, t, { poly: t.poly.map(R), centre: R(t.centre), faitage: t.faitage ? t.faitage.map(R) : null, lignes: t.lignes.map(l => l.map(R)), fleches: t.fleches.map(f => f.map(R)) }));
  const xs = [], ys = []; rooms.forEach(r => r.pts.forEach(q => { xs.push(q[0]); ys.push(q[1]); })); cloisons.forEach(c => { xs.push(c.a[0], c.b[0]); ys.push(c.a[1], c.b[1]); });
  return Object.assign({}, M, { rooms, walls, openings, toits, cloisons, symboles, bbox: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } });
}

const assombrir = (hex, k) => { const v = parseInt(hex.slice(1), 16), m = c => Math.round(c * (1 - k)).toString(16).padStart(2, '0'); return '#' + m((v >> 16) & 255) + m((v >> 8) & 255) + m(v & 255); };
const eclaircir = (hex, k) => { const v = parseInt(hex.slice(1), 16), m = c => Math.round(c + (255 - c) * k).toString(16).padStart(2, '0'); return '#' + m((v >> 16) & 255) + m((v >> 8) & 255) + m(v & 255); };
const NOM_TOIT = { plat: 'Toit plat', '1pente': '1 pente', '2pentes': '2 pentes', '4pentes': '4 pentes (croupe)' };
function dessinerToitures(b, M, T, o) {
  o = o || {}; const P = q => [T.ox + q[0] * T.s, T.oy + q[1] * T.s], fs = o.fs || 11;
  M.rooms.forEach(r => b.poly(r.pts.map(P), { fill: '#f4f5f7', stroke: '#c9ced6', w: 1 }));
  (M.toits || []).forEach(t => {
    b.poly(t.poly.map(P), { fill: eclaircir(t.couleur, 0.55), stroke: t.couleur, w: 2 });
    t.lignes.forEach((l, i) => { const A = P(l[0]), B = P(l[1]); b.line(A[0], A[1], B[0], B[1], { w: i === 0 ? 2.4 : 1.3, color: '#1f2937', dash: i === 0 ? null : [4, 3] }); });
    t.fleches.forEach(f => { const A = P(f[0]), B = P(f[1]), L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, ah = 7, aw = 3.2;
      b.line(A[0], A[1], B[0], B[1], { w: 1.3, color: '#1f2937' }); b.poly([B, [B[0] - ux * ah - uy * aw, B[1] - uy * ah + ux * aw], [B[0] - ux * ah + uy * aw, B[1] - uy * ah - ux * aw]], { fill: '#1f2937' }); });
    const c = P(t.centre), lig = [[t.nom, true], [NOM_TOIT[t.type] + (t.type === 'plat' ? '' : ' · ' + FR(t.angle) + '° (' + Math.round(t.pente) + ' %)'), false], [t.couverture || 'couverture non précisée', false], [FR(t.surface) + ' m² de couverture', false]];
    const w = Math.max(...lig.map(([x, g]) => b.mesure(x, fs, g))) + 12, h = lig.length * (fs + 3) + 6, x0 = c[0] - w / 2, y0 = c[1] - h / 2;
    b.poly([[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]], { fill: '#ffffff', stroke: t.couleur, w: 1 });
    lig.forEach(([x, g], i) => b.text(x, c[0], y0 + 3 + (fs + 3) * i + (fs + 3) / 2, { size: fs, bold: g, color: '#1f2937' }));
    if (o.zones) o.zones.push({ x: c[0], y: c[1], w, h, type: 'toit', ti: t.idx });
  });
  if (o.echelle) { const { x, y } = o.echelle; b.line(x, y, x + T.s, y, { w: 1.5, color: '#222222' }); b.line(x, y - 4, x, y + 4, { w: 1.5, color: '#222222' }); b.line(x + T.s, y - 4, x + T.s, y + 4, { w: 1.5, color: '#222222' }); b.text('1 m', x + T.s / 2, y - 9, { size: fs - 1, color: '#222222' }); }
}

/* ne garde que ce qui appartient à l'étage k (les rangs 'idx' des pièces et ouvertures restent ceux du relevé entier) */
function vueEtage(M, k) {
  return Object.assign({}, M, { symboles: (M.symboles || []).filter(x => x.etage === k), cloisons: (M.cloisons || []).filter(c => c.etage === k), rooms: M.rooms.filter(r => r.etage === k), walls: M.walls.filter(w => w.etage === k), openings: M.openings.filter(op => op.room.etage === k) });
}

/* les symboles : nom, taille par défaut (longueur, profondeur en m), et en 3D
   la hauteur du bas et du haut de l'objet au-dessus du sol (m) */
const TAILLES_SYM = { radiateur: [1.0, 0.12], chaudiere: [0.6, 0.6], cumulus: [0.6, 0.6], poele: [0.6, 0.6], wc: [0.4, 0.65], lavabo: [0.6, 0.45],
  douche: [0.9, 0.9], baignoire: [1.7, 0.75], evier: [1.2, 0.6], tableau: [0.5, 0.15], escalier: [2.6, 0.9] };
const NOMS_SYM = { radiateur: 'Radiateur', chaudiere: 'Chaudière', cumulus: 'Chauffe-eau', poele: 'Poêle', wc: 'WC', lavabo: 'Lavabo', douche: 'Douche',
  baignoire: 'Baignoire', evier: 'Évier', tableau: 'Tableau électrique', escalier: 'Trémie d’escalier' };
const HAUTEURS_SYM = { radiateur: [0.15, 0.75], chaudiere: [1.0, 1.75], cumulus: [0, 1.5], poele: [0, 0.9], wc: [0, 0.42], lavabo: [0.7, 0.86],
  douche: [0, 0.06], baignoire: [0, 0.56], evier: [0, 0.9], tableau: [1.2, 1.8] };
/* les symboles du plan (équipements, trémie d'escalier) : dessinés au trait,
   à leur taille réelle, avec les mêmes pinceaux que le plan (écran, PDF, DXF) */
function dessinerSymboles(b, M, T, fs) {
  (M.symboles || []).forEach(s => {
    const a = s.rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), L = s.l / 2, W = s.w / 2;
    const Q = (u, v) => [T.ox + (s.x + u * c - v * sn) * T.s, T.oy + (s.y + u * sn + v * c) * T.s];      // repère du symbole (u le long, v en travers) → écran
    const rect = (u0, v0, u1, v1, o) => b.poly([Q(u0, v0), Q(u1, v0), Q(u1, v1), Q(u0, v1)], Object.assign({ calque: 'EQUIPEMENTS' }, o));
    const ovale = (cu, cv, ru, rv, o) => { const pts = []; for (let k = 0; k < 20; k++) { const t = k * Math.PI / 10; pts.push(Q(cu + ru * Math.cos(t), cv + rv * Math.sin(t))); } b.poly(pts, Object.assign({ calque: 'EQUIPEMENTS' }, o)); };
    const trait = (u0, v0, u1, v1, o) => { const A = Q(u0, v0), B = Q(u1, v1); b.line(A[0], A[1], B[0], B[1], Object.assign({ w: 1, color: '#4B5563', calque: 'EQUIPEMENTS' }, o)); };
    const texte = (t, taille) => { const C = Q(0, 0); b.text(t, C[0], C[1], { size: taille || Math.max(7, fs - 3), bold: true, color: '#374151', calque: 'EQUIPEMENTS' }); };
    const st = { fill: '#FFFFFF', stroke: '#4B5563', w: 1 };
    switch (s.type) {
      case 'radiateur': rect(-L, -W, L, W, { fill: '#F3F4F6', stroke: '#4B5563', w: 1 }); for (let k = 1; k < 6; k++) trait(-L + k * s.l / 6, -W, -L + k * s.l / 6, W, { w: 0.6 }); break;
      case 'chaudiere': rect(-L, -W, L, W, st); texte('CH'); break;
      case 'cumulus': ovale(0, 0, L, W, st); texte('ECS'); break;
      case 'poele': ovale(0, 0, L, W, st); texte('P'); break;
      case 'tableau': rect(-L, -W, L, W, { fill: '#374151', stroke: '#111827', w: 1 }); { const C = Q(0, -W - 0.18); b.text('TE', C[0], C[1], { size: Math.max(7, fs - 3), bold: true, color: '#111827', calque: 'EQUIPEMENTS' }); } break;
      case 'wc': rect(-L, -W, L, -W + s.w * 0.28, st); ovale(0, W * 0.28, L * 0.85, W * 0.62, st); break;
      case 'lavabo': rect(-L, -W, L, W, st); ovale(0, W * 0.1, L * 0.72, W * 0.6, st); break;
      case 'douche': rect(-L, -W, L, W, st); trait(-L, -W, L, W, { w: 0.6 }); trait(-L, W, L, -W, { w: 0.6 }); ovale(0, 0, Math.min(L, W) * 0.12, Math.min(L, W) * 0.12, st); break;
      case 'baignoire': rect(-L, -W, L, W, st); b.poly([Q(-L * 0.85, -W * 0.7), Q(L * 0.75, -W * 0.7), Q(L * 0.88, 0), Q(L * 0.75, W * 0.7), Q(-L * 0.85, W * 0.7)], { stroke: '#4B5563', w: 0.8, calque: 'EQUIPEMENTS' }); break;
      case 'evier': rect(-L, -W, L, W, st); rect(-L * 0.85, -W * 0.7, -L * 0.1, W * 0.7, st); rect(L * 0.1, -W * 0.7, L * 0.85, W * 0.7, st); break;
      case 'escalier': {
        // trémie : le contour, les marches (environ 25 cm), la flèche de montée
        rect(-L, -W, L, W, { fill: '#FFFFFF', stroke: '#1F2937', w: 1.4 });
        const n = Math.max(3, Math.round(s.l / 0.25));
        for (let k = 1; k < n; k++) trait(-L + k * s.l / n, -W, -L + k * s.l / n, W, { w: 0.7 });
        trait(-L + 0.1, 0, L - 0.15, 0, { w: 1.2, color: '#1F2937' });
        b.poly([Q(L - 0.05, 0), Q(L - 0.3, -0.12), Q(L - 0.3, 0.12)], { fill: '#1F2937', calque: 'EQUIPEMENTS' });
        break;
      }
      default: rect(-L, -W, L, W, st);
    }
  });
}

function dessinerPlan(b, M, T, o) {
  o = o || {};
  const P = (x, y) => [T.ox + x * T.s, T.oy + y * T.s];
  const tpx = Math.max(M.ep * T.s, 3);
  const fs = o.fs || 11;
  const dl = tpx / 2 + 6;              /* distance entre le mur et sa ligne de cote fléchée */
  const COL_P = COUL_TYPE.porte, COL_F = COUL_TYPE.fenetre, COL_Pa = COUL_TYPE.passage;

  if (o.fantome) o.fantome.forEach(pts => b.poly(pts.map(q => P(q[0], q[1])), { stroke: '#b9c0cc', w: 1, dash: [4, 3] }));      /* étage du dessous, en filigrane */
  M.rooms.forEach(r => b.poly(r.pts.map(p => P(p[0], p[1])), { fill: r.color }));
  dessinerSymboles(b, M, T, fs);

  M.walls.forEach(w => {
    const A = P(w.a[0], w.a[1]), B = P(w.b[0], w.b[1]);
    const tw = Math.max((w.ep || M.ep) * T.s, 3);                                  /* épaisseur propre à ce mur */
    if (w.demoli) b.line(A[0], A[1], B[0], B[1], { w: Math.max(tw * 0.6, 2.2), color: '#c0392b', dash: [7, 5] });                   /* mur à démolir : pointillés rouges */
    else if (w.estime) b.line(A[0], A[1], B[0], B[1], { w: Math.max(tw * 0.7, 2), color: w.couleur || '#8b919b', dash: [Math.max(tw * 2, 6), Math.max(tw * 1.2, 4)] });   /* côté estimé : pointillés */
    else b.line(A[0], A[1], B[0], B[1], { w: tw, color: w.couleur || '#30343b', cap: 'square' });
  });

  (M.cloisons || []).forEach(c => {                                            /* murs ajoutés */
    const A = P(c.a[0], c.a[1]), B = P(c.b[0], c.b[1]), tw = Math.max(c.ep * T.s, 3), n = [-c.u[1], c.u[0]], mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
    b.line(A[0], A[1], B[0], B[1], { w: tw, color: '#30343b', cap: 'square' });
    const t = 'M' + (c.idx + 1) + ' · ' + FR(c.len), tw2 = b.mesure(t, fs, true), off = tw / 2 + 4 + Math.abs(n[0]) * tw2 / 2 + Math.abs(n[1]) * fs * 0.6, lx = mx + n[0] * off, ly = my + n[1] * off;
    b.text(t, lx, ly, { size: fs, bold: true, color: '#1d2430' });
    if (o.zones) o.zones.push({ x: lx, y: ly, w: tw2 + 14, h: 30, type: 'cloison', ci: c.idx });
  });

  /* ouvertures : brèche dans le mur + symbole */
  M.openings.forEach(op => {
    const w = op.wall, A = P(w.a[0], w.a[1]), u = w.u, n = [-u[1], u[0]];
    if (w.demoli) return;                                                      /* mur démoli : plus d'ouverture à dessiner */
    const tpx = Math.max((w.ep || M.ep) * T.s, 3);
    const p0 = [A[0] + u[0] * op.pos * T.s, A[1] + u[1] * op.pos * T.s];
    const p1 = [A[0] + u[0] * (op.pos + op.w) * T.s, A[1] + u[1] * (op.pos + op.w) * T.s];
    const h = tpx / 2 + 1;
    b.poly([[p0[0] + n[0] * h, p0[1] + n[1] * h], [p1[0] + n[0] * h, p1[1] + n[1] * h],
            [p1[0] - n[0] * h, p1[1] - n[1] * h], [p0[0] - n[0] * h, p0[1] - n[1] * h]], { fill: '#ffffff' });
    if (o.ouvZones) o.ouvZones.push({ oi: op.idx, p0, p1, ue: op.edge.rev ? [-u[0], -u[1]] : u, hS: op.edge.rev ? p1 : p0, hE: op.edge.rev ? p0 : p1 });      /* zones à saisir : l'ouverture et ses deux bouts */
    if (op.type === 'fenetre') {
      [-1, 0, 1].forEach(k => b.line(p0[0] + n[0] * k * tpx * 0.4, p0[1] + n[1] * k * tpx * 0.4,
                                     p1[0] + n[0] * k * tpx * 0.4, p1[1] + n[1] * k * tpx * 0.4, { w: 1.1, color: COL_F }));
      [p0, p1].forEach(p => b.line(p[0] + n[0] * tpx * 0.4, p[1] + n[1] * tpx * 0.4, p[0] - n[0] * tpx * 0.4, p[1] - n[1] * tpx * 0.4, { w: 1.1, color: COL_F }));
    } else if (op.type === 'passage') {
      [p0, p1].forEach(p => b.line(p[0] + n[0] * tpx * 0.5, p[1] + n[1] * tpx * 0.5, p[0] - n[0] * tpx * 0.5, p[1] - n[1] * tpx * 0.5, { w: 1.4, color: COL_Pa }));
      b.line(p0[0], p0[1], p1[0], p1[1], { w: 0.8, color: COL_Pa, dash: [2, 3] });
    } else {
      const H = op.hingeA ? p0 : p1, F = op.hingeA ? p1 : p0, r = op.w * T.s;
      const na = op.nArc || op.nIn, L = [H[0] + na[0] * r, H[1] + na[1] * r];
      b.line(H[0], H[1], L[0], L[1], { w: 1.6, color: COL_P });
      const a0 = Math.atan2(L[1] - H[1], L[0] - H[0]);
      let d = Math.atan2(F[1] - H[1], F[0] - H[0]) - a0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const arc = [];
      for (let k = 0; k <= 16; k++) { const a = a0 + d * k / 16; arc.push([H[0] + Math.cos(a) * r, H[1] + Math.sin(a) * r]); }
      b.poly(arc, { stroke: COL_P, w: 0.9, dash: [3, 2], close: false });
    }
  });

  /* cotes des murs (à l'intérieur de chaque pièce, dans la plus grande partie libre du mur) */
  M.rooms.forEach(r => r.edges.forEach(e => {
    const ri = r.idx, w = e.wall, A = P(w.a[0], w.a[1]), u = w.u;
    let best = [0, w.len], bestLen = -1, cur = 0;
    const essai = (i0, i1) => { if (i1 - i0 > bestLen) { bestLen = i1 - i0; best = [i0, i1]; } };
    w.openings.forEach(op => { essai(cur, op.pos); cur = op.pos + op.w; });
    essai(cur, w.len);
    const str = (w.estime ? '~' : '') + FR(w.len), tw = b.mesure(str, fs, false);
    if ((e.noteMur || M.reperes) && !e.reperesOff) {                      /* repère du mur : rond avec sa lettre (violet si le mur porte une explication) */
      const pe0 = P(e.p[0], e.p[1]), qe0 = P(e.q[0], e.q[1]), pBadge = best[0] + (best[1] - best[0]) * (e.rev ? 0.8 : 0.2), bx = A[0] + u[0] * pBadge * T.s, by = A[1] + u[1] * pBadge * T.s, rr = Math.max(7, fs * 0.75), cr = [];     /* dans la plus grande partie libre du mur, jamais sur une porte ou une fenêtre */
      for (let k = 0; k < 16; k++) cr.push([bx + rr * Math.cos(k * Math.PI / 8), by + rr * Math.sin(k * Math.PI / 8)]);
      b.poly(cr, { fill: assombrir(r.color, 0.62), stroke: e.noteMur ? '#7c3aed' : '#ffffff', w: e.noteMur ? 2.4 : 1, calque: 'COTES' }); b.text(e.lettre, bx, by, { size: fs - 1, bold: true, color: '#ffffff', calque: 'COTES' });
      if (o.zones) o.zones.push({ x: bx, y: by, w: 2 * rr + 10, h: 2 * rr + 10, type: 'murnote', ri, ei: e.i, pe: pe0, qe: qe0 });
    }
    const rg = e.reglage || {}, perso = rg.pos !== undefined;       /* réglages faits à la souris : écart de la flèche, place du chiffre */
    if (!perso && bestLen * T.s < (Math.abs(w.u[0]) >= Math.abs(w.u[1]) ? tw : fs) + 4) return;   /* la cote ne tient pas : on ne l'écrit pas */
    const mid = perso ? (e.rev ? w.len * (1 - rg.pos) : w.len * rg.pos) : (best[0] + best[1]) / 2;
    const dE = dl + (rg.decal || 0) * T.s;
    const off = (dE >= 0 ? 1 : -1) * (Math.abs(dE) + 3 + Math.abs(e.nIn[0]) * tw / 2 + Math.abs(e.nIn[1]) * fs * 0.55);      /* le chiffre reste du même côté que sa flèche */
    const pe = P(e.p[0], e.p[1]), qe = P(e.q[0], e.q[1]), Le = Math.hypot(qe[0] - pe[0], qe[1] - pe[1]);
    if (Le >= 48) {                                   /* ligne de cote : flèches aux deux bouts, parallèle au mur, côté pièce */
      const ue = [(qe[0] - pe[0]) / Le, (qe[1] - pe[1]) / Le], pn = [-ue[1], ue[0]], ah = Math.max(4, fs * 0.55), aw = ah * 0.38;
      const a1 = [pe[0] + e.nIn[0] * dE + ue[0] * dl * 1.3, pe[1] + e.nIn[1] * dE + ue[1] * dl * 1.3];
      const a2 = [qe[0] + e.nIn[0] * dE - ue[0] * dl * 1.3, qe[1] + e.nIn[1] * dE - ue[1] * dl * 1.3];
      const col = r.couleurCote || (w.mesure ? '#15803d' : w.estime ? '#b45309' : '#6b7280');
      b.line(a1[0], a1[1], a2[0], a2[1], { w: 0.9, color: col, dash: w.estime ? [3, 2] : null, calque: 'COTES' });
      b.poly([a1, [a1[0] + ue[0] * ah + pn[0] * aw, a1[1] + ue[1] * ah + pn[1] * aw], [a1[0] + ue[0] * ah - pn[0] * aw, a1[1] + ue[1] * ah - pn[1] * aw]], { fill: col, calque: 'COTES' });
      b.poly([a2, [a2[0] - ue[0] * ah + pn[0] * aw, a2[1] - ue[1] * ah + pn[1] * aw], [a2[0] - ue[0] * ah - pn[0] * aw, a2[1] - ue[1] * ah - pn[1] * aw]], { fill: col, calque: 'COTES' });
      if (o.poignees) {                               /* zones à saisir : les deux bouts (changer la mesure) et la ligne (la déplacer) */
        o.poignees.push({ type: 'fin', which: 'p', x: a1[0], y: a1[1], ri, ei: e.i, pe, qe });
        o.poignees.push({ type: 'fin', which: 'q', x: a2[0], y: a2[1], ri, ei: e.i, pe, qe });
      }
      if (o.lignes) o.lignes.push({ type: 'ligne', a1, a2, ri, ei: e.i, nIn: e.nIn });
    }
    const lx = A[0] + u[0] * mid * T.s + e.nIn[0] * off, ly = A[1] + u[1] * mid * T.s + e.nIn[1] * off;
    b.text(str, lx, ly, { size: fs, bold: !!w.mesure, calque: 'COTES', color: r.couleurCote || (w.mesure ? '#15803d' : w.estime ? '#b45309' : '#333333') });
    if (o.zones) o.zones.push({ x: lx, y: ly, w: Math.max(tw + 12, 44), h: 34, type: 'mur', ri, ei: e.i, pe, qe });
  }));

  /* largeur des ouvertures */
  M.openings.forEach(op => {
    const oi = op.idx, w = op.wall, A = P(w.a[0], w.a[1]), u = w.u;
    const str = ABR_TYPE[op.type] + ' ' + FR(op.w) + (op.mesure ? '*' : ''), size = fs - 1, tw = b.mesure(str, size, true);
    if (op.w * T.s < (Math.abs(w.u[0]) >= Math.abs(w.u[1]) ? tw : size) * 0.6) return;
    const off = dl + 3 + Math.abs(op.nIn[0]) * tw / 2 + Math.abs(op.nIn[1]) * size * 0.55;
    const m = op.pos + op.w / 2;
    const ox = A[0] + u[0] * m * T.s + op.nIn[0] * off, oy = A[1] + u[1] * m * T.s + op.nIn[1] * off;
    b.text(str, ox, oy, { size, bold: true, color: COUL_TYPE[op.type] });
    if (o.zones) o.zones.push({ x: ox, y: oy, w: Math.max(tw + 12, 44), h: 34, type: 'ouv', oi });
  });

  /* nom et surface de chaque pièce */
  M.rooms.forEach(r => {
    const ri = r.idx, c = P(r.centre[0], r.centre[1]);
    const xs = r.pts.map(q => T.ox + q[0] * T.s), ys = r.pts.map(q => T.oy + q[1] * T.s);
    const larg = (Math.max(...xs) - Math.min(...xs)) * 0.9, haut = Math.max(...ys) - Math.min(...ys);
    const aireTxt = FR(r.aire) + ' m²';
    let sz = fs + 3;                       /* on réduit le texte jusqu'à ce qu'il tienne dans la pièce */
    while (sz > 6 && Math.max(b.mesure(r.nom, sz, true), b.mesure(aireTxt, sz - 1, false)) > larg) sz -= 0.5;
    let nomTxt = r.nom;
    if (b.mesure(nomTxt, sz, true) > larg) { while (nomTxt.length > 2 && b.mesure(nomTxt + '…', sz, true) > larg) nomTxt = nomTxt.slice(0, -1); nomTxt += '…'; }
    const ct = r.couleurTexte || '#1d2430';
    if (haut > sz * 3.2) {
      b.text(nomTxt, c[0], c[1] - sz * 0.6, { size: sz, bold: true, color: ct });
      b.text(aireTxt, c[0], c[1] + sz * 0.8, { size: sz - 1, color: ct });
    } else b.text(nomTxt, c[0], c[1], { size: sz, bold: true, color: ct });
    if (o.zones) o.zones.push({ x: c[0], y: c[1], w: Math.max(b.mesure(nomTxt, sz, true) + 14, 70), h: Math.max(sz * 3, 30), type: 'piece', ri });
  });

  /* les symboles se touchent (régler) et se glissent (déplacer) : zones posées en dernier, au-dessus des noms de pièces */
  if (o.zones) (M.symboles || []).forEach(s => { const t = Math.max(30, Math.max(s.l, s.w) * T.s);
    o.zones.push({ x: T.ox + s.x * T.s, y: T.oy + s.y * T.s, w: t, h: Math.max(30, Math.min(s.l, s.w) * T.s + 10), type: 'symbole', si: s.idx }); });
  if (o.echelle) {   /* barre d'échelle de 1 m */
    const { x, y } = o.echelle;
    b.line(x, y, x + T.s, y, { w: 1.5, color: '#222222' });
    b.line(x, y - 4, x, y + 4, { w: 1.5, color: '#222222' });
    b.line(x + T.s, y - 4, x + T.s, y + 4, { w: 1.5, color: '#222222' });
    b.text('1 m', x + T.s / 2, y - 9, { size: fs - 1, color: '#222222' });
  }

  if (o.legendePos && M.legende && M.legende.length) {        /* légende : un trait de couleur et son explication */
    const L = M.legende, sz = fs, pad = 6, lig = sz + 8;
    const bw = Math.max(...L.map(l => b.mesure(l.texte || ' ', sz, false))) + 2 * pad + 26, bh = L.length * lig + 2 * pad;
    const x0 = o.legendePos.x - bw, y0 = o.legendePos.y - bh;
    b.poly([[x0, y0], [x0 + bw, y0], [x0 + bw, y0 + bh], [x0, y0 + bh]], { fill: '#ffffff', stroke: '#9aa4b2', w: 0.8 });
    L.forEach((l, i) => { const yy = y0 + pad + lig * i + lig / 2; b.line(x0 + pad, yy, x0 + pad + 18, yy, { w: 3.5, color: l.couleur }); b.text(l.texte, x0 + pad + 24, yy, { size: sz, align: 'left', color: '#222222' }); });
  }
}

/* ==========================================================================
   3) VUE 3D
   ========================================================================== */
class Vue3D {
  constructor(conteneur) {
    this.el = conteneur; this.ok = false; this.group = null;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch (e) { return; }
    this.ok = true;
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    conteneur.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeef1f5);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener('change', () => this.rendre());
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const l1 = new THREE.DirectionalLight(0xffffff, 0.65); l1.position.set(6, 12, 8); this.scene.add(l1);
    const l2 = new THREE.DirectionalLight(0xffffff, 0.25); l2.position.set(-8, 6, -6); this.scene.add(l2);
    this.matMur = new THREE.MeshLambertMaterial({ color: 0xf1ede6 });
    this.matEst = new THREE.MeshLambertMaterial({ color: 0xf2d9b8 });      /* murs estimés : teinte orangée */
    new ResizeObserver(() => this.redimensionner()).observe(conteneur);
    this.redimensionner();
  }
  redimensionner() {
    if (!this.ok) return;
    const w = Math.max(this.el.clientWidth, 10), h = Math.max(this.el.clientHeight, 10);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.rendre();
  }
  rendre() { if (this.ok) this.renderer.render(this.scene, this.camera); }

  construire(M, garderVue) {
    if (!this.ok) return;
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== this.matMur && o.material !== this.matEst) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    }
    const g = this.group = new THREE.Group(); this.scene.add(g);
    const mFenetre = new THREE.MeshPhongMaterial({ color: 0x8fc8f5, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
    const mPorte = new THREE.MeshLambertMaterial({ color: 0x9b6b43 });
    const lineMur = new THREE.LineBasicMaterial({ color: 0x8a8f98 });
    const lineF = new THREE.LineBasicMaterial({ color: 0x1f6feb });
    const lineP = new THREE.LineBasicMaterial({ color: 0x5a3a1f });
    const ep = M.ep, emax = (this.etageMax == null) ? 99 : this.etageMax;

    /* sols ; la trémie d'un escalier perce le plancher de l'étage du dessus */
    const coinsSym = s => { const a = s.rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), L = s.l / 2, W = s.w / 2;
      return [[-L, -W], [L, -W], [L, W], [-L, W]].map(([u, v]) => [s.x + u * c - v * sn, s.y + u * sn + v * c]); };
    const dedans = (pt, poly) => { let o = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j];
      if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) o = !o; } return o; };
    M.rooms.forEach(r => {
      if (r.etage > emax) return;
      const trous = (M.symboles || []).filter(s => s.type === 'escalier' && s.etage === r.etage - 1 && dedans([s.x, s.y], r.pts)).map(coinsSym);
      const contour = r.pts.map(p => new THREE.Vector2(p[0], p[1]));
      const tri = THREE.ShapeUtils.triangulateShape(contour, trous.map(t => t.map(p => new THREE.Vector2(p[0], p[1]))));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([...r.pts, ...trous.flat()].flatMap(p => [p[0], r.z || 0, p[1]]), 3));
      geo.setIndex(tri.flat());
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(r.color).multiplyScalar(0.92), side: THREE.DoubleSide })));
      /* étiquette */
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
      const c = cv.getContext('2d'); c.textAlign = 'center'; c.fillStyle = '#1d2430';
      c.font = 'bold 44px Arial, sans-serif'; c.fillText(r.nom, 256, 58);
      c.font = '34px Arial, sans-serif'; c.fillText(FR(r.aire) + ' m²', 256, 104);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
      sp.scale.set(3.2, 0.8, 1); sp.position.set(r.centre[0], 0.05 + (r.z || 0), r.centre[1]); sp.renderOrder = 10; g.add(sp);
    });

    /* les équipements : des volumes simples à leur hauteur réelle ; l'escalier monte jusqu'à l'étage du dessus */
    const mSym = new THREE.MeshLambertMaterial({ color: 0xf8fafc }), mSymF = new THREE.MeshLambertMaterial({ color: 0x374151 }), mMarche = new THREE.MeshLambertMaterial({ color: 0xc8a27a });
    const lSym = new THREE.LineBasicMaterial({ color: 0x6b7280 });
    (M.symboles || []).forEach(s => {
      if (s.etage > emax) return;
      const z0 = (M.etages[s.etage] && M.etages[s.etage].z) || 0, rot = -s.rot * Math.PI / 180;
      if (s.type === 'escalier') {
        const haut = M.etages[s.etage + 1] ? M.etages[s.etage + 1].z - z0 : (M.etages[s.etage] ? M.etages[s.etage].hauteur : 2.5);
        const n = Math.max(3, Math.round(haut / 0.18)), pas = s.l / n, grp = new THREE.Group();
        for (let k = 0; k < n; k++) {
          const hk = haut * (k + 1) / n, m = new THREE.Mesh(new THREE.BoxGeometry(pas, 0.04, s.w), mMarche);
          m.position.set(-s.l / 2 + pas * (k + 0.5), hk - 0.02, 0); grp.add(m);
        }
        grp.position.set(s.x, z0, s.y); grp.rotation.y = rot; g.add(grp); return;
      }
      const hs = HAUTEURS_SYM[s.type] || [0, 0.8], hh = hs[1] - hs[0];
      const geo = s.type === 'cumulus' ? new THREE.CylinderGeometry(Math.min(s.l, s.w) / 2, Math.min(s.l, s.w) / 2, hh, 24) : new THREE.BoxGeometry(s.l, hh, s.w);
      const m = new THREE.Mesh(geo, s.type === 'tableau' ? mSymF : mSym);
      m.position.set(s.x, z0 + hs[0] + hh / 2, s.y); m.rotation.y = rot; g.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), lSym); e.position.copy(m.position); e.rotation.copy(m.rotation); g.add(e);
    });

    /* boîte alignée sur un mur : u0..u1 le long du mur, v0..v1 en hauteur */
    const boite = (w, u0, u1, v0, v1, ecart, mat, lm) => {
      if (u1 - u0 < 1e-4 || v1 - v0 < 1e-4) return;
      const m = (u0 + u1) / 2, geo = new THREE.BoxGeometry(u1 - u0, v1 - v0, ecart);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(w.a[0] + w.u[0] * m, (v0 + v1) / 2 + (w.z || 0), w.a[1] + w.u[1] * m);
      mesh.rotation.y = -Math.atan2(w.u[1], w.u[0]);
      g.add(mesh);
      if (lm) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), lm); e.position.copy(mesh.position); e.rotation.copy(mesh.rotation); g.add(e); }
      return mesh;
    };

    M.walls.forEach(w => {
      if (w.etage > emax || w.demoli) return;
      const ep = w.ep || M.ep, H = w.h; let cur = -ep / 2;
      w.openings.forEach(op => {
        const top = Math.min(op.allege + op.h, H);
        const mm = w.estime ? this.matEst : this.matMur;
        boite(w, cur, op.pos, 0, H, ep, mm, lineMur);          /* mur plein avant l'ouverture */
        boite(w, op.pos, op.pos + op.w, 0, op.allege, ep, mm, lineMur);   /* allège */
        boite(w, op.pos, op.pos + op.w, top, H, ep, mm, lineMur);         /* linteau */
        if (op.allege < H) {
          if (op.type === 'fenetre') boite(w, op.pos, op.pos + op.w, op.allege, top, 0.03, mFenetre, lineF);
          else if (op.type === 'porte') boite(w, op.pos + 0.01, op.pos + op.w - 0.01, op.allege, top, 0.05, mPorte, lineP);
        }
        cur = op.pos + op.w;
      });
      boite(w, cur, w.len + ep / 2, 0, H, ep, w.estime ? this.matEst : this.matMur, lineMur);
    });

    (M.cloisons || []).forEach(c => { if (c.etage <= emax) boite(c, -c.ep / 2, c.len + c.ep / 2, 0, c.h, c.ep, this.matMur, lineMur); });      /* murs ajoutés */

    /* toitures */
    if (this.montrerToits !== false) (M.toits || []).forEach(t => { if (t.etageHaut <= emax) this.construireToit(t, g); });

    /* cadrage de la caméra */
    const bb = M.bbox, cx = (bb.x0 + bb.x1) / 2, cz = (bb.y0 + bb.y1) / 2;
    this.centre = [cx, cz]; this.taille = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0, 2);
    this.hMax = M.hauteurTotale || Math.max(...M.walls.map(w => w.h));
    if (garderVue) this.rendre(); else this.vueIso();
  }
  construireToit(t, g) {
    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(t.couleur), side: THREE.DoubleSide }), ligne = new THREE.LineBasicMaterial({ color: 0x1f2937 });
    const { x0, x1, y0, y1 } = t.rect, W = x1 - x0, D = y1 - y0, cx = (x0 + x1) / 2, cz = (y0 + y1) / 2, y = t.base, R = t.rise, pos = [], idx = [];
    const V = (px, py, pz) => { pos.push(px, py, pz); return pos.length / 3 - 1; };
    const tri = (a, b, c) => idx.push(a, b, c), quad = (a, b, c, d) => idx.push(a, b, c, a, c, d);
    if (t.type === 'plat') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, D), mat); m.position.set(cx, y + 0.1, cz); g.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), ligne); e.position.copy(m.position); g.add(e); return;
    }
    if (t.type === '1pente') {
      const h = { bas: [R, R, 0, 0], haut: [0, 0, R, R], gauche: [0, R, R, 0], droite: [R, 0, 0, R] }[t.sens] || [R, R, 0, 0];     /* hauteurs des coins (x0,y0) (x1,y0) (x1,y1) (x0,y1) au-dessus des murs */
      const a = V(x0, y + h[0], y0), b = V(x1, y + h[1], y0), c = V(x1, y + h[2], y1), d = V(x0, y + h[3], y1), a0 = V(x0, y, y0), b0 = V(x1, y, y0), c0 = V(x1, y, y1), d0 = V(x0, y, y1);
      quad(a, b, c, d); quad(a0, b0, b, a); quad(b0, c0, c, b); quad(c0, d0, d, c); quad(d0, a0, a, d);
    } else {
      const f = t.faitage, axeX = Math.abs(f[1][0] - f[0][0]) >= Math.abs(f[1][1] - f[0][1]);
      const e1 = V(x0, y, y0), e2 = V(x1, y, y0), e3 = V(x1, y, y1), e4 = V(x0, y, y1), r1 = V(f[0][0], y + R, f[0][1]), r2 = V(f[1][0], y + R, f[1][1]);
      if (axeX) { quad(e1, e2, r2, r1); quad(e4, e3, r2, r1); tri(e1, e4, r1); tri(e2, e3, r2); }
      else { quad(e1, e4, r2, r1); quad(e2, e3, r2, r1); tri(e1, e2, r1); tri(e4, e3, r2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, mat)); g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), ligne));
  }
  vueIso() {
    if (!this.ok || !this.group) return;
    const D = this.taille * 1.35 + 2 + this.hMax * 1.3, [cx, cz] = this.centre;
    this.controls.target.set(cx, this.hMax * 0.3, cz);
    this.camera.position.set(cx + D * 0.35, D * 0.85, cz + D * 0.85);
    this.controls.update(); this.rendre();
  }
  vueDessus() {
    if (!this.ok || !this.group) return;
    const D = this.taille * 1.8 + 3, [cx, cz] = this.centre;
    this.controls.target.set(cx, 0, cz);
    this.camera.position.set(cx, D, cz + 0.001);
    this.controls.update(); this.rendre();
  }
  transparence(on) {
    [this.matMur, this.matEst].forEach(m => { m.transparent = on; m.opacity = on ? 0.22 : 1; m.depthWrite = !on; m.needsUpdate = true; });
    this.rendre();
  }
  /* image JPEG haute définition de la vue actuelle (pour le PDF) */
  instantane(w, h) {
    if (!this.ok || !this.group) return null;
    const W = this.el.clientWidth, Hh = this.el.clientHeight;
    this.renderer.setPixelRatio(1); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.rendre();
    const url = this.renderer.domElement.toDataURL('image/jpeg', 0.92);
    this.redimensionner();
    const bin = atob(url.split(',')[1]), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, w, h };
  }
}

/* ==========================================================================
   4) EXPORT PDF
   ========================================================================== */
function assemblerPdf(pages, images, titre) {
  const parts = [];                      /* morceaux binaires */
  const enc = s => { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; };
  let pos = 0; const offsets = [];
  const ecrire = x => { const a = typeof x === 'string' ? enc(x) : x; parts.push(a); pos += a.length; };
  const objet = (id, corps) => { offsets[id] = pos; ecrire(id + ' 0 obj\n'); corps.forEach(ecrire); ecrire('\nendobj\n'); };

  const nImg = images.length, premier = 5 + nImg;
  const idContenu = i => premier + 2 * i, idPage = i => premier + 2 * i + 1, idInfo = premier + 2 * pages.length;

  ecrire('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  objet(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  objet(2, ['<< /Type /Pages /Count ' + pages.length + ' /Kids [' + pages.map((_, i) => idPage(i) + ' 0 R').join(' ') + '] >>']);
  objet(3, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']);
  objet(4, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']);
  images.forEach((image, k) => objet(5 + k, ['<< /Type /XObject /Subtype /Image /Width ' + image.w + ' /Height ' + image.h +
    ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + image.bytes.length + ' >>\nstream\n', image.bytes, '\nendstream']));
  pages.forEach((pg, i) => {
    const flux = enc(pg.ops.join('\n'));
    objet(idContenu(i), ['<< /Length ' + flux.length + ' >>\nstream\n', flux, '\nendstream']);
    objet(idPage(i), ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pg.w + ' ' + pg.h + '] /Contents ' + idContenu(i) + ' 0 R ' +
      '/Resources << /Font << /F1 3 0 R /F2 4 0 R >>' + (pg.imgs.size ? ' /XObject << ' + [...pg.imgs].map(k => '/Im' + (k + 1) + ' ' + (5 + k) + ' 0 R').join(' ') + ' >>' : '') + ' >> >>']);
  });
  objet(idInfo, ['<< /Title ' + pdfStr(titre) + ' /Producer (Releve de chantier - outil de validation) >>']);
  const xref = pos, total = idInfo + 1;
  ecrire('xref\n0 ' + total + '\n0000000000 65535 f \n');
  for (let id = 1; id < total; id++) ecrire(String(offsets[id]).padStart(10, '0') + ' 00000 n \n');
  ecrire('trailer\n<< /Size ' + total + ' /Root 1 0 R /Info ' + idInfo + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(parts, { type: 'application/pdf' });
}

function construirePdf(M, vue3d) {
  const W = 842, H = 595, MG = 30, BAS = 545;      /* A4 paysage en points (1 pt = 1/72 pouce) */
  const pages = [];
  const nouvellePage = (titrePage, w = W, h = H) => {
    const pg = new PagePdf(w, h); pages.push(pg);
    pg.text(M.projet, MG, 32, { size: 15, bold: true, align: 'left', color: '#1d2430' });
    pg.text(titrePage, w - MG, 32, { size: 12, align: 'right', color: '#667085' });
    pg.line(MG, 44, w - MG, 44, { w: 0.8, color: '#9aa4b2' });
    return pg;
  };

  /* --- Pages de plan : une par étage --- */
  const Mp = tourner(M, M.rotation);
  const portrait = (Mp.bbox.y1 - Mp.bbox.y0) > (Mp.bbox.x1 - Mp.bbox.x0) * 1.2;      /* plan en hauteur -> page A4 en portrait */
  const pw = portrait ? H : W, ph = portrait ? W : H;
  const info = [M.client && 'Client : ' + M.client, M.adresse, M.date && 'Date : ' + M.date].filter(Boolean).join('   ·   ');
  const zx0 = MG, zy0 = 72, zx1 = pw - MG, zy1 = ph - 85;
  const bw = Mp.bbox.x1 - Mp.bbox.x0, bh = Mp.bbox.y1 - Mp.bbox.y0;
  const sFit = Math.min((zx1 - zx0 - 30) / bw, (zy1 - zy0 - 30) / bh);
  const echelles = [10, 20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 250, 500, 1000];
  let den = echelles.find(d => 2834.646 / d <= sFit) || 1000;
  const s = 2834.646 / den;                         /* points PDF par mètre réel */
  const T = { s, ox: (zx0 + zx1) / 2 - (Mp.bbox.x0 + bw / 2) * s, oy: (zy0 + zy1) / 2 - (Mp.bbox.y0 + bh / 2) * s };
  let pg;
  M.etages.forEach((et, k) => {
    pg = nouvellePage(M.etages.length > 1 ? 'Plan coté – ' + et.nom : 'Plan coté', pw, ph);
    if (k === 0 && info) pg.text(info, MG, 58, { size: 10, align: 'left', color: '#444c59' });
    const fant = k > 0 ? Mp.rooms.filter(r => r.etage === k - 1).map(r => r.pts) : null;
    dessinerPlan(pg, vueEtage(Mp, k), T, { fs: 9, echelle: { x: zx0 + 4, y: zy1 + 14 }, legendePos: { x: zx1 - 4, y: zy1 - 4 }, fantome: fant });
    pg.text('Échelle 1/' + den + ' (A4 ' + (portrait ? 'portrait' : 'paysage') + ')  ·  Cotes en mètres  ·  ' + (M.etages.length > 1 ? 'Surface de l\'étage : ' + FR(et.aire) + ' m²  ·  ' : '') + 'Surface totale : ' + FR(M.totalAire) + ' m²',
      zx1, zy1 + 14, { size: 9, align: 'right', color: '#444c59' });
    pg.text('P = porte   F = fenêtre   Pa = passage (largeur)   Pointillés et ~ = côté estimé (non scanné)   Vert = mesuré', zx1, zy1 + 28, { size: 9, align: 'right', color: '#444c59' });
    if (M.reperes) pg.text('Ronds A, B, C… = repères des murs de chaque pièce (rond de la couleur de la pièce)', zx1, zy1 + 40, { size: 9, align: 'right', color: '#444c59' });
  });

  if (M.toits.length) {
    pg = nouvellePage('Toitures', pw, ph);
    dessinerToitures(pg, Mp, T, { fs: 9, echelle: { x: zx0 + 4, y: zy1 + 14 } });
    pg.text('Échelle 1/' + den + ' (A4 ' + (portrait ? 'portrait' : 'paysage') + ')  ·  Emprise et surface de couverture : débord compris  ·  Flèches : sens de la pente', zx1, zy1 + 14, { size: 9, align: 'right', color: '#444c59' });
  }

  const MR = M.reference || donneesCourantes && donneesCourantes.reference ? modeleReference() : null;
  if (MR && M.aReference) {
    const MRp = tourner(MR, M.rotation), U = unionBbox(Mp.bbox, MRp.bbox), nbk = Math.max(M.etages.length, MR.etages.length), demi = (W - 2 * MG - 16) / 2, hz = H - 85 - 80;
    const bwU = U.x1 - U.x0, bhU = U.y1 - U.y0, sF = Math.min((demi - 20) / bwU, (hz - 20) / bhU), dn = echelles.find(d => 2834.646 / d <= sF) || 1000, sD = 2834.646 / dn;
    for (let k = 0; k < nbk; k++) {
      const nomEt = (M.etages[k] || MR.etages[k]).nom, pgD = nouvellePage('Avant / après travaux' + (nbk > 1 ? ' – ' + nomEt : ''));
      [[MRp, MR.nomRef], [Mp, M.nomSit]].forEach(([mod, titre], i) => {
        const x0 = MG + i * (demi + 16), T2 = { s: sD, ox: x0 + demi / 2 - (U.x0 + bwU / 2) * sD, oy: 80 + hz / 2 - (U.y0 + bhU / 2) * sD };
        pgD.poly([[x0, 76], [x0 + demi, 76], [x0 + demi, 80 + hz], [x0, 80 + hz]], { stroke: '#c9d0da', w: 0.8 });
        pgD.text(titre, x0 + 6, 66, { size: 11, bold: true, align: 'left', color: i ? '#1f6feb' : '#64748b' });
        if (k < mod.etages.length) dessinerPlan(pgD, vueEtage(mod, k), T2, { fs: 8, fantome: k > 0 ? mod.rooms.filter(r => r.etage === k - 1).map(r => r.pts) : null, legendePos: i ? { x: x0 + demi - 4, y: 80 + hz - 4 } : undefined });
      });
      pgD.text('Échelle 1/' + dn + '  ·  Même échelle et même cadrage pour les deux plans', W - MG, H - 52, { size: 9, align: 'right', color: '#444c59' });
    }
  }

  /* --- Page 2 : vue 3D --- */
  const imgs = [], img = vue3d && vue3d.ok ? vue3d.instantane(1700, 1000) : null; if (img) imgs.push(img);
  if (img) {
    pg = nouvellePage('Vue 3D');
    const zw = W - 2 * MG, zh = 480, r = Math.min(zw / img.w, zh / img.h);
    pg.image(0, MG + (zw - img.w * r) / 2, 60, img.w * r, img.h * r);
    pg.text('Vue 3D du relevé (vue telle qu\'affichée à l\'écran)', W / 2, 60 + img.h * r + 14, { size: 9, color: '#667085' });
  }

  /* --- Page 3 : tableaux --- */
  pg = nouvellePage('Récapitulatif');
  let y = 66;
  let titreSuite = 'Récapitulatif';
  const garantir = h => { if (y + h > BAS) { pg = nouvellePage(titreSuite + ' (suite)'); y = 66; } };
  const tableau = (titre, cols, lignes, total) => {
    garantir(60); pg.text(titre, MG, y + 6, { size: 12, bold: true, align: 'left' }); y += 20;
    const dessinerLigne = (cells, o) => {
      garantir(18);
      if (o.fond) pg.poly([[MG, y], [W - MG, y], [W - MG, y + 17], [MG, y + 17]], { fill: o.fond });
      let x = MG;
      cols.forEach((c, i) => {
        const tx = c.a === 'l' ? x + 5 : x + c.w - 5;
        pg.text(String(cells[i]), tx, y + 9, { size: 9.5, bold: o.gras, align: c.a === 'l' ? 'left' : 'right' });
        x += c.w;
      });
      pg.line(MG, y + 17, W - MG, y + 17, { w: 0.4, color: '#c9d0da' });
      y += 17;
    };
    dessinerLigne(cols.map(c => c.t), { fond: '#e9eef5', gras: true });
    lignes.forEach(l => dessinerLigne(l, {}));
    if (total) dessinerLigne(total, { fond: '#f3f6fa', gras: true });
    y += 18;
  };
  const multi = M.etages.length > 1;
  if (multi) tableau('Étages', [{ t: 'Étage', w: 220, a: 'l' }, { t: 'Pièces', w: 90 }, { t: 'Surface (m²)', w: 130 }, { t: 'Hauteur (m)', w: 130 }, { t: 'Altitude du sol (m)', w: 160 }],
    M.etages.map(e => [e.nom, e.nb, FR(e.aire), FR(e.hauteur), FR(e.z)]), ['Total', M.rooms.length, FR(M.totalAire), '', '']);
  tableau('Pièces',
    multi ? [{ t: 'Pièce', w: 150, a: 'l' }, { t: 'Étage', w: 80, a: 'l' }, { t: 'Surface (m²)', w: 80 }, { t: 'Périmètre (m)', w: 80 }, { t: 'Hauteur (m)', w: 70 }, { t: 'Volume (m³)', w: 75 }, { t: 'Murs nets (m²)', w: 90 }, { t: 'Portes', w: 45 }, { t: 'Fenêtres', w: 55 }, { t: 'Passages', w: 57 }] :
    [{ t: 'Pièce', w: 180, a: 'l' }, { t: 'Surface (m²)', w: 85 }, { t: 'Périmètre (m)', w: 90 }, { t: 'Hauteur (m)', w: 75 },
     { t: 'Volume (m³)', w: 80 }, { t: 'Murs nets (m²)', w: 95 }, { t: 'Portes', w: 50 }, { t: 'Fenêtres', w: 60 }, { t: 'Passages', w: 47 }],
    M.rooms.map(r => [r.nom, ...(multi ? [M.etages[r.etage].nom] : []), FR(r.aire), FR(r.perim), FR(r.hauteur) + (r.hMesuree ? '*' : ''), FR(r.volume), FR(r.mursNets), r.portes, r.fenetres, r.passages]),
    ['Total', ...(multi ? [''] : []), FR(M.totalAire), '', '', FR(M.totalVolume), FR(M.rooms.reduce((a, r) => a + r.mursNets, 0)), '', '', '']);
  if (M.toits.length) tableau('Toitures', [{ t: 'Toiture', w: 130, a: 'l' }, { t: 'Type', w: 100, a: 'l' }, { t: 'Angle', w: 55 }, { t: 'Pente', w: 55 }, { t: 'Couverture', w: 150, a: 'l' }, { t: 'Débord (m)', w: 70 }, { t: 'Emprise (m²)', w: 90 }, { t: 'Surface couv. (m²)', w: 132 }],
    M.toits.map(t => [t.nom, NOM_TOIT[t.type], FR(t.angle) + '°', Math.round(t.pente) + ' %', t.couverture || '—', FR(t.debord), FR(t.emprise), FR(t.surface)]), ['Total', '', '', '', '', '', FR(M.toits.reduce((a, t) => a + t.emprise, 0)), FR(M.toits.reduce((a, t) => a + t.surface, 0))]);
  const demP = M.rooms.flatMap(r => r.edges.filter(e => e.demoli).map(e => [r, e]));
  if (demP.length) tableau('Murs à démolir', [{ t: 'Pièce', w: 220, a: 'l' }, { t: 'Étage', w: 160, a: 'l' }, { t: 'Mur', w: 180, a: 'l' }, { t: 'Longueur (m)', w: 222 }], demP.map(([r, e]) => [r.nom, M.etages[r.etage].nom, e.lettre + ' (n°' + e.i + ')', FR(e.len)]), null);
  if (M.cloisons.length) tableau('Murs ajoutés', [{ t: 'Mur', w: 100, a: 'l' }, { t: 'Étage', w: 220, a: 'l' }, { t: 'Longueur (m)', w: 150 }, { t: 'Épaisseur (m)', w: 150 }, { t: 'Hauteur (m)', w: 162 }], M.cloisons.map(c => ['M' + (c.idx + 1), M.etages[c.etage].nom, FR(c.len), FR3(c.ep), FR(c.h)]), null);
  tableau('Ouvertures',
    [{ t: 'N°', w: 40, a: 'l' }, { t: 'Type', w: 80, a: 'l' }, { t: 'Pièce', w: 170, a: 'l' }, { t: 'Mur', w: 60 },
     { t: 'Largeur (m)', w: 100 }, { t: 'Hauteur (m)', w: 100 }, { t: 'Allège (m)', w: 100 }, { t: 'Surface (m²)', w: 132 }],
    M.openings.map((op, i) => [i + 1, NOM_TYPE[op.type], op.room.nom, op.edge.i, FR(op.w) + (op.mes.largeur ? '*' : ''), FR(op.h) + (op.mes.hauteur ? '*' : ''), FR(op.allege) + (op.mes.allege ? '*' : ''), FR(op.w * op.h)]),
    null);
  const ecarts = listeMesures(M);
  if (ecarts.length) tableau('Écarts entre le scan et les mesures du métreur',
    [{ t: 'Élément', w: 330, a: 'l' }, { t: 'Scan (m)', w: 110 }, { t: 'Mesuré (m)', w: 110 }, { t: 'Écart (cm)', w: 110 }, { t: 'Écart (%)', w: 122 }],
    ecarts.map(([lib, sc, me]) => [lib, FR3(sc), FR3(me), signe((me - sc) * 100), sc ? signe((me - sc) / sc * 100) : '']), null);
  pg.text('Surfaces calculées à partir des points relevés. « Murs nets » = surface des murs moins les ouvertures. * = valeur mesurée sur place par le métreur (en vert sur le plan).', MG, Math.min(y, BAS) + 4, { size: 8.5, align: 'left', color: '#667085' });

  /* --- Page de notes : travaux à prévoir --- */
  const blocsNotes = [];
  if (M.notes.trim()) blocsNotes.push(['Notes générales', M.notes]);
  M.rooms.forEach(r => { if (r.note.trim()) blocsNotes.push([r.nom, r.note]); });
  M.rooms.forEach(r => { const l = r.edges.filter(e => e.noteMur).map(e => '•  Mur ' + e.lettre + (e.nomMur ? ' (' + e.nomMur + ')' : '') + ' : ' + e.noteMur); if (l.length) blocsNotes.push([r.nom + ' – travaux sur les murs', l.join('\n')]); });
  ((typeof donneesCourantes === 'object' && donneesCourantes && donneesCourantes.documents) || []).forEach(d => { if (d.texte && d.texte.trim()) blocsNotes.push(['Transcription : ' + (d.legende || 'document joint'), d.texte]); });
  if (blocsNotes.length) {
    titreSuite = 'Notes et travaux à prévoir';
    pg = nouvellePage(titreSuite); y = 66;
    blocsNotes.forEach(([titre, texte]) => {
      garantir(40); pg.text(titre, MG, y + 6, { size: 12, bold: true, align: 'left', color: '#1d2430' }); y += 22;
      texte.split(/\r?\n/).forEach(par => {
        let ligne = '';
        const vider = () => { garantir(15); pg.text(ligne, MG + 6, y + 6, { size: 10, align: 'left', color: '#222222' }); y += 14; ligne = ''; };
        if (!par.trim()) { y += 7; return; }
        par.split(/\s+/).forEach(mot => {
          const essai = ligne ? ligne + ' ' + mot : mot;
          if (ligne && mesure(essai, 10, false) > pg.w - 2 * MG - 12) { vider(); ligne = mot; } else ligne = essai;
        });
        if (ligne) vider();
      });
      y += 14;
    });
  }

  /* --- Photos par pièce --- */
  const octets = u => { const bin = atob(u.split(',')[1]), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
  const indexImg = new Map();
  const imgPdf = ph => { if (indexImg.has(ph.id)) return indexImg.get(ph.id); imgs.push({ bytes: octets(photosMem.get(ph.id)), w: ph.w, h: ph.h }); indexImg.set(ph.id, imgs.length - 1); return imgs.length - 1; };
  const groupes = M.rooms.map(r => ({ titre: r.nom, items: (r.src.photos || []).filter(ph => photosMem.has(ph.id)) })).filter(g => g.items.length);
  if (groupes.length) {
    const CW = 250, CH = 170, GAP = 16; let pgP = nouvellePage('Photos'), y = 66, col = 0, titreG = '';
    const nouvelle = () => { pgP = nouvellePage('Photos (suite)'); y = 66; col = 0; };
    groupes.forEach(g => {
      if (col > 0) { y += CH + 28; col = 0; }
      if (y + 20 + CH + 24 > BAS) nouvelle();
      pgP.text(g.titre, MG, y + 6, { size: 12, bold: true, align: 'left', color: '#1d2430' }); y += 20; titreG = g.titre;
      g.items.forEach(ph => {
        if (col === 0 && y + CH + 24 > BAS) { nouvelle(); pgP.text(titreG + ' (suite)', MG, y + 6, { size: 12, bold: true, align: 'left', color: '#1d2430' }); y += 20; }
        const k = Math.min(CW / ph.w, CH / ph.h), w = ph.w * k, h = ph.h * k, x = MG + col * (CW + GAP);
        pgP.image(imgPdf(ph), x + (CW - w) / 2, y + (CH - h) / 2, w, h);
        let leg = ph.legende || ''; while (leg.length > 3 && mesure(leg, 8.5, false) > CW) leg = leg.slice(0, -2) + '…';
        if (leg) pgP.text(leg, x, y + CH + 10, { size: 8.5, align: 'left', color: '#444c59' });
        col++; if (col === 3) { col = 0; y += CH + 28; }
      });
      if (col > 0) { y += CH + 28; col = 0; }
      y += 6;
    });
  }
  /* --- Notes manuscrites et documents joints : une page par document, à la taille de la page --- */
  const docs = ((typeof donneesCourantes === 'object' && donneesCourantes && donneesCourantes.documents) || M.documents || []).filter(d => photosMem.has(d.id));
  docs.forEach((d, n) => {
    const portraitD = d.h > d.w * 1.1, pgD = nouvellePage('Document joint ' + (n + 1) + ' / ' + docs.length, portraitD ? H : W, portraitD ? W : H);
    const zw = pgD.w - 2 * MG, zh = pgD.h - 66 - 50, k = Math.min(zw / d.w, zh / d.h), w = d.w * k, h = d.h * k;
    pgD.image(imgPdf(d), (pgD.w - w) / 2, 60, w, h);
    if (d.legende) pgD.text(d.legende, pgD.w / 2, 60 + h + 14, { size: 9, color: '#444c59' });
  });

  /* --- pied de page --- */
  const aujourdhui = new Date().toLocaleDateString('fr-FR');
  pages.forEach((p, i) => {
    p.text('Document généré le ' + aujourdhui + ' – outil de relevé (validation)', MG, p.h - 20, { size: 8, align: 'left', color: '#8a93a1' });
    p.text('Page ' + (i + 1) + ' / ' + pages.length, p.w - MG, p.h - 20, { size: 8, align: 'right', color: '#8a93a1' });
  });
  return assemblerPdf(pages, imgs, M.projet);
}

/* ==========================================================================
   5) INTERFACE
   ========================================================================== */
let modele = null, nomFichier = 'releve', convertiJson = null, rapportConv = null, donneesCourantes = null;
const vue = { k: 1, tx: 0, ty: 0 };
let zonesPlan = [], poigneesPlan = [], lignesPlan = [], ouvZonesPlan = [], apercu = null, apercuOuv = null, survol = null, modeAjuster = false, modeOuv = true, bboxCourant = null, refAff = null;
try { modeOuv = localStorage.getItem('releve-ouv') !== '0'; } catch (e) { /* stockage indisponible : actif par défaut */ }
try { modeAjuster = localStorage.getItem('releve-ajuster') === '1'; } catch (e) { /* stockage indisponible : mode désactivé */ }
const cvPlan = $('plan'), ctxPlan = cvPlan.getContext('2d');
const v3d = new Vue3D($('v3d'));
if (!v3d.ok) $('vide3d').textContent = 'La 3D n\'est pas disponible sur ce navigateur (WebGL désactivé).';

function message(texte, type) { const m = $('msg'); m.className = texte ? type : ''; m.textContent = texte || ''; }

let modeleAff = null, etageCourant = 0;
function transformationEcran() {
  const W = cvPlan.clientWidth, H = cvPlan.clientHeight, bb = bboxCourant || (modeleAff || modele).bbox, marge = 36;
  const bw = bb.x1 - bb.x0, bh = bb.y1 - bb.y0;
  const s0 = Math.min((W - 2 * marge) / bw, (H - 2 * marge) / bh);
  const ox0 = (W - bw * s0) / 2 - bb.x0 * s0, oy0 = (H - bh * s0) / 2 - bb.y0 * s0;
  return { s: s0 * vue.k, ox: ox0 * vue.k + vue.tx, oy: oy0 * vue.k + vue.ty };
}
/* modèle de la situation initiale (figée) : analysé une seule fois tant qu'elle ne change pas */
let refCache = { cle: '', M: null };
function modeleReference() {
  const d = donneesCourantes; if (!d || !d.reference) return null;
  const cle = JSON.stringify(d.reference) + '|' + JSON.stringify(d.affichage || {}) + '|' + d.epaisseurMur + '|' + d.hauteurSousPlafond + '|' + JSON.stringify(d.legende || []);
  if (refCache.cle !== cle) { try { refCache = { cle, M: analyser(Object.assign({}, d, { pieces: d.reference.pieces, ouvertures: d.reference.ouvertures, etages: d.reference.etages, toitures: d.reference.toitures, cloisons: d.reference.cloisons })) }; } catch (e) { refCache = { cle, M: null }; } }
  return refCache.M;
}
const unionBbox = (a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) });
function prepCanvas(cv) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); return { c, W, H };
}
function etiquetteCanvas(c, texte, couleur) { c.save(); c.font = 'bold 13px Helvetica, Arial, sans-serif'; const w = c.measureText(texte).width + 16; c.fillStyle = couleur; c.fillRect(8, 8, w, 22); c.fillStyle = '#ffffff'; c.textBaseline = 'middle'; c.fillText(texte, 16, 19); c.restore(); }
function dessiner2D() {
  const refM = modele && modele.duo ? modeleReference() : null, duo = !!refM;
  $('zonePlan').classList.toggle('duo', duo); $('planRef').hidden = !duo; document.querySelector('main').classList.toggle('duo', duo);
  const { W, H } = prepCanvas(cvPlan);
  if (!modele) return;
  modeleAff = tourner(modele, modele.rotation); refAff = duo ? tourner(refM, modele.rotation) : null;
  bboxCourant = duo ? unionBbox(modeleAff.bbox, refAff.bbox) : modeleAff.bbox;
  const T = transformationEcran();
  zonesPlan = []; poigneesPlan = []; lignesPlan = []; ouvZonesPlan = [];
  const kE = etageCourant === 'toit' ? 0 : Math.min(etageCourant, modele.etages.length - 1);
  if (etageCourant === 'toit') dessinerToitures(new PinceauEcran(ctxPlan), modeleAff, T, { fs: 11, zones: zonesPlan, echelle: { x: 18, y: H - 18 } });
  else {
    const fant = kE > 0 ? modeleAff.rooms.filter(r => r.etage === kE - 1).map(r => r.pts) : null;
    dessinerPlan(new PinceauEcran(ctxPlan), vueEtage(modeleAff, kE), T, { fantome: fant, fs: 11, echelle: { x: 18, y: H - 18 }, zones: zonesPlan, poignees: poigneesPlan, lignes: lignesPlan, ouvZones: ouvZonesPlan, legendePos: { x: W - 12, y: H - 12 } });
  }
  if (duo) {                                                     /* plan de gauche : la situation initiale, même échelle et même cadrage */
    const { c } = prepCanvas($('planRef')), kR = etageCourant === 'toit' ? 0 : Math.min(kE, refM.etages.length - 1);
    if (etageCourant === 'toit') dessinerToitures(new PinceauEcran(c), refAff, T, { fs: 11, echelle: { x: 18, y: H - 18 } });
    else if (kE <= refM.etages.length - 1) dessinerPlan(new PinceauEcran(c), vueEtage(refAff, kR), T, { fs: 11, echelle: { x: 18, y: H - 18 }, legendePos: { x: W - 12, y: H - 12 }, fantome: kR > 0 ? refAff.rooms.filter(r => r.etage === kR - 1).map(r => r.pts) : null });
    etiquetteCanvas(c, refM.nomRef || modele.nomRef, '#64748b'); etiquetteCanvas(ctxPlan, modele.nomSit, '#1f6feb');
  }
  dessinerSurcouche(T);
}
/* le plan de gauche (situation initiale) se déplace et se zoome avec le plan de droite */
const cvRef = $('planRef'); let panRef = null;
cvRef.addEventListener('wheel', e => {
  if (!modele) return; e.preventDefault();
  const r = cvRef.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top, k2 = Math.min(Math.max(vue.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.3), 12), f = k2 / vue.k;
  vue.tx = cx - (cx - vue.tx) * f; vue.ty = cy - (cy - vue.ty) * f; vue.k = k2; dessiner2D();
}, { passive: false });
cvRef.addEventListener('pointerdown', e => { panRef = { x: e.clientX, y: e.clientY, tx: vue.tx, ty: vue.ty }; try { cvRef.setPointerCapture(e.pointerId); } catch (err) { /* sans conséquence */ } cvRef.style.cursor = 'grabbing'; });
cvRef.addEventListener('pointermove', e => { if (!panRef) return; vue.tx = panRef.tx + e.clientX - panRef.x; vue.ty = panRef.ty + e.clientY - panRef.y; dessiner2D(); });
cvRef.addEventListener('pointerup', () => { panRef = null; cvRef.style.cursor = 'grab'; });

const FR3 = n => { const t = (Math.round(n * 1000) / 1000).toFixed(3).replace('.', ','); return t === '-0,000' ? '0,000' : t; };
const signe = n => (n > 0 ? '+' : '') + (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');
const arr3 = v => Math.round(v * 1000) / 1000;
const num = t => { const v = parseFloat(String(t).replace(',', '.').replace(/[^0-9.\-]/g, '')); return isFinite(v) ? v : NaN; };
const LIB_CHAMP = { position: 'position', largeur: 'largeur', hauteur: 'hauteur', allege: 'allège' };

/* liste des valeurs corrigées par le métreur : [libellé, valeur du scan, valeur mesurée] */
function listeMesures(M) {
  const rows = [], vus = new Set();
  M.rooms.forEach(r => r.edges.forEach(e => {
    if (!e.mesure || vus.has(e.wall)) return; vus.add(e.wall);
    rows.push(['Mur n°' + e.i + ' – ' + r.nom, e.lenScan, r.src.mesuresMurs[e.i]]);
  }));
  M.rooms.forEach(r => { if (r.hMesuree && r.hScan != null) rows.push(['Hauteur sous plafond – ' + r.nom, r.hScan, r.hauteur]); });
  M.openings.forEach((op, i) => ['position', 'largeur', 'hauteur', 'allege'].forEach(f => {
    if (!op.mes[f] || !op.src.scan) return;
    const cur = { position: op.src.position, largeur: op.src.largeur, hauteur: op.h, allege: op.allege }[f];
    rows.push([NOM_TYPE[op.type] + ' n°' + (i + 1) + ' (' + op.room.nom + ') – ' + LIB_CHAMP[f], op.src.scan[f], cur]);
  }));
  return rows;
}

const ths = (...t) => '<tr>' + t.map(x => '<th>' + x + '</th>').join('') + '</tr>';
const tds = (...t) => t.map(x => '<td>' + esc(x) + '</td>').join('');
const champ = (valeur, mesure, attrs) => '<input class="mes' + (mesure ? ' mesure' : '') + '" inputmode="decimal" value="' + FR3(valeur) + '" ' + attrs + ' aria-label="Mesure en mètres">';
const bouton = attrs => '<button type="button" class="rev" title="Revenir à la valeur du scan" ' + attrs + '>↺</button>';

function appliquerOuvertureDrag(a) {
  const op = modele.openings[a.oi], avant = JSON.stringify(donneesCourantes), s = op.src; s.position = arr3(a.pos); s.largeur = arr3(a.larg);
  reanalyser(avant, null, NOM_TYPE[op.type] + ' n°' + (a.oi + 1) + ' : position ' + FR3(a.pos) + ' m, largeur ' + FR3(a.larg) + ' m.');
}
function dessinerSurcouche(T) {
  const c = ctxPlan;
  if (survol && !apercuOuv && (survol.type === 'ouvH' || survol.type === 'ouvC')) {
    c.save(); c.strokeStyle = '#1f6feb'; c.fillStyle = 'rgba(31,111,235,.18)'; c.lineWidth = 2;
    [survol.hS, survol.hE].forEach(pt => { c.beginPath(); c.arc(pt[0], pt[1], 6, 0, 6.2832); c.fill(); c.stroke(); });
    if (survol.type === 'ouvC') { c.globalAlpha = 0.45; c.lineWidth = 6; c.beginPath(); c.moveTo(survol.p0[0], survol.p0[1]); c.lineTo(survol.p1[0], survol.p1[1]); c.stroke(); }
    c.restore();
  }
  if (liaison) {                                      /* liaison de deux scans : le mur choisi, et celui sous le doigt */
    const trait = (m, coul, larg) => { if (!m) return; const r = modele.rooms.find(q => q.id === m.piece.id), n = r ? r.pts.length : 0; if (!r) return;
      const A = planVersPx(r.pts[m.mur]), B = planVersPx(r.pts[(m.mur + 1) % n]); c.save(); c.strokeStyle = coul; c.lineWidth = larg; c.lineCap = 'round'; c.globalAlpha = 0.85; c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke(); c.restore(); };
    trait(liaison.survolMur, '#f59e0b', 6); trait(liaison.a, '#d97706', 9);
  }
  if (trace && trace.a && trace.cur) {                /* aperçu du mur en cours de tracé */
    const A = planVersPx(trace.a), B = planVersPx(trace.cur), L = Math.hypot(trace.cur[0] - trace.a[0], trace.cur[1] - trace.a[1]);
    c.save(); c.strokeStyle = '#1f6feb'; c.fillStyle = '#1f6feb'; c.lineWidth = Math.max(trace.ep * T.s, 3); c.globalAlpha = 0.45; c.lineCap = 'square'; c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke(); c.globalAlpha = 1;
    [A, B].forEach(q => { c.beginPath(); c.arc(q[0], q[1], 5, 0, 6.2832); c.fill(); });
    c.font = 'bold 13px Helvetica, Arial, sans-serif'; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = '#fff'; const t = FR(L) + ' m'; c.strokeText(t, (A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - 12); c.fillText(t, (A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - 12); c.restore();
  }
  if (apercuOuv) {                                    /* l'ouverture telle qu'elle serait après le glissement */
    const a = apercuOuv, z = a.z, pt = q => [z.hS[0] + z.ue[0] * (q - a.pos0) * T.s, z.hS[1] + z.ue[1] * (q - a.pos0) * T.s], A = pt(a.pos), B = pt(a.pos + a.larg);
    c.save(); c.strokeStyle = '#1f6feb'; c.lineWidth = 7; c.globalAlpha = 0.75; c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke(); c.globalAlpha = 1;
    c.font = 'bold 13px Helvetica, Arial, sans-serif'; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = '#fff'; c.fillStyle = '#1f6feb';
    const t = FR3(a.larg) + ' m  (à ' + FR3(a.pos) + ' m du début)', mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2 - 14; c.strokeText(t, mx, my); c.fillText(t, mx, my); c.restore();
  }
  if (modeAjuster && !apercu) { c.save(); c.strokeStyle = '#1f6feb'; c.fillStyle = '#ffffff'; c.lineWidth = 1.6; poigneesPlan.forEach(z => { c.beginPath(); c.arc(z.x, z.y, 5, 0, 6.2832); c.fill(); c.stroke(); }); c.restore(); }
  if (survol && !apercu) {
    c.save(); c.strokeStyle = '#1f6feb'; c.fillStyle = 'rgba(31,111,235,.15)'; c.lineWidth = 2;
    if (survol.type === 'fin') { c.beginPath(); c.arc(survol.x, survol.y, 9, 0, 6.2832); c.fill(); c.stroke(); }
    else if (survol.type === 'ligne') { c.beginPath(); c.moveTo(survol.a1[0], survol.a1[1]); c.lineTo(survol.a2[0], survol.a2[1]); c.lineWidth = 3.5; c.globalAlpha = .55; c.stroke(); }
    c.restore();
  }
  if (apercu) {                                       /* le mur tel qu'il serait avec la longueur tirée */
    const { z, len } = apercu, L = Math.hypot(z.qe[0] - z.pe[0], z.qe[1] - z.pe[1]), ue = [(z.qe[0] - z.pe[0]) / L, (z.qe[1] - z.pe[1]) / L];
    const fixe = z.which === 'q' ? z.pe : z.qe, sg = z.which === 'q' ? 1 : -1, mob = [fixe[0] + ue[0] * len * T.s * sg, fixe[1] + ue[1] * len * T.s * sg];
    c.save(); c.strokeStyle = '#1f6feb'; c.fillStyle = '#1f6feb'; c.lineWidth = 3; c.setLineDash([6, 4]);
    c.beginPath(); c.moveTo(fixe[0], fixe[1]); c.lineTo(mob[0], mob[1]); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(mob[0], mob[1], 6, 0, 6.2832); c.fill();
    c.font = 'bold 14px Helvetica, Arial, sans-serif'; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = '#fff';
    const t = FR3(len) + ' m'; c.strokeText(t, mob[0], mob[1] - 14); c.fillText(t, mob[0], mob[1] - 14); c.restore();
  }
}

function remplirTableaux(M) {
  const multi = M.etages.length > 1;
  $('titreEtages').hidden = !multi;
  $('tabEtages').innerHTML = !multi ? '' : ths('Étage', 'Pièces', 'Surface (m²)', 'Hauteur (m)', 'Altitude du sol (m)') + M.etages.map(e => '<tr>' + tds(e.nom, e.nb, FR(e.aire), FR(e.hauteur), FR(e.z)) + '</tr>').join('') +
    '<tr class="total"><td>Total</td><td>' + M.rooms.length + '</td><td>' + FR(M.totalAire) + '</td><td></td><td></td></tr>';
  remplirOnglets(); remplirToits(M);
  $('tabPieces').innerHTML = ths('Pièce', ...(multi ? ['Étage'] : []), 'Surface (m²)', 'Périmètre (m)', 'Hauteur sous plafond (m)', 'Volume (m³)', 'Murs nets (m²)', 'Portes', 'Fenêtres', 'Passages') +
    M.rooms.map((r, i) => '<tr><td><input class="nomPiece" data-i="' + i + '" value="' + esc(r.nom) + '" title="Cliquez pour renommer la pièce" aria-label="Nom de la pièce"></td>' + (multi ? tds(M.etages[r.etage].nom) : '') +
      tds(FR(r.aire), FR(r.perim)) + '<td>' + champ(r.hauteur, r.hMesuree, 'data-t="h" data-i="' + i + '"') + (r.hMesuree ? bouton('data-t="h" data-i="' + i + '"') : '') + '</td>' +
      tds(FR(r.volume), FR(r.mursNets), r.portes, r.fenetres, r.passages) + '</tr>').join('') +
    '<tr class="total"><td>Total</td>' + (multi ? '<td></td>' : '') + '<td>' + FR(M.totalAire) + '</td><td></td><td></td><td>' + FR(M.totalVolume) + '</td><td>' +
    FR(M.rooms.reduce((a, r) => a + r.mursNets, 0)) + '</td><td></td><td></td><td></td></tr>';

  $('epDef').value = FR3(M.ep);
  $('titreClo').hidden = !M.cloisons.length;
  $('tabCloisons').innerHTML = !M.cloisons.length ? '' : ths('Étage', 'Mur ajouté', 'Longueur (m)', 'Épaisseur (m)', '') + M.cloisons.map(c => '<tr>' + tds(M.etages[c.etage].nom, 'M' + (c.idx + 1)) +
    '<td><input class="cloLong" data-ci="' + c.idx + '" inputmode="decimal" value="' + FR3(c.len) + '"></td><td><input class="cloEp" data-ci="' + c.idx + '" inputmode="decimal" value="' + FR3(c.ep) + '"></td><td><button type="button" class="btnPetit supClo" data-ci="' + c.idx + '">Supprimer</button></td></tr>').join('');
  const dem = M.rooms.flatMap(r => r.edges.filter(e => e.demoli).map(e => [r, e]));
  $('titreDemol').hidden = !dem.length;
  $('tabDemol').innerHTML = !dem.length ? '' : ths('Pièce', 'Étage', 'Mur à démolir', 'Longueur (m)') + dem.map(([r, e]) => '<tr>' + tds(r.nom, M.etages[r.etage].nom, e.lettre + ' (n°' + e.i + ')', FR(e.len)) + '</tr>').join('');
  $('tabMurs').innerHTML = ths('Pièce', 'Mur (lettre visible)', 'Origine', 'Longueur du scan (m)', 'Longueur mesurée (m)', '', 'Épaisseur (m)', 'Ajouter', 'Travaux / explicatif') +
    M.rooms.map((r, ri) => r.edges.map(e => '<tr><td>' + esc(r.nom) + '</td>' + '<td><label class="repCase"><input type="checkbox" class="repV" data-i="' + ri + '" data-e="' + e.i + '"' + (e.reperesOff ? '' : ' checked') + '> ' + e.lettre + ' (n°' + e.i + ')</label></td>' + tds(e.wall.demoli ? 'à démolir' : e.mesure || e.wall.mesure ? 'mesuré' : e.estime ? 'estimé (non scanné)' : 'scanné', FR3(e.lenScan)) +
      '<td>' + champ(e.mesure && r.src.mesuresMurs ? r.src.mesuresMurs[e.i] : e.len, e.mesure || e.wall.mesure, 'data-t="mur" data-i="' + ri + '" data-e="' + e.i + '"') + '</td><td>' +
      (e.mesure ? bouton('data-t="mur" data-i="' + ri + '" data-e="' + e.i + '"') : '') + '</td><td><input class="epMur" data-i="' + ri + '" data-e="' + e.i + '" inputmode="decimal" value="' + FR3(e.wall.ep) + '" aria-label="Épaisseur du mur en mètres"></td><td class="tdAj"><button type="button" class="btnPetit ajOuvRap" data-t="fenetre" data-i="' + ri + '" data-e="' + e.i + '">+ Fenêtre</button> <button type="button" class="btnPetit ajOuvRap" data-t="porte" data-i="' + ri + '" data-e="' + e.i + '">+ Porte</button></td><td class="tdNote"><input class="noteMur" data-i="' + ri + '" data-e="' + e.i + '" value="' + esc(e.noteMur) + '" placeholder="Ex. : refaire le placo" aria-label="Explicatif du mur"></td></tr>').join('')).join('');

  remplirOuvertures(M);
  const ec = listeMesures(M);
  $('tabEcarts').innerHTML = ec.length ? ths('Élément', 'Scan (m)', 'Mesuré (m)', 'Écart (cm)', 'Écart (%)') +
    ec.map(([lib, sc, me]) => '<tr><td>' + esc(lib) + '</td>' + tds(FR3(sc), FR3(me), signe((me - sc) * 100), sc ? signe((me - sc) / sc * 100) : '') + '</tr>').join('') : '';
  $('titreEcarts').hidden = !ec.length;
  $('recap').hidden = false;
}
function remplirOuvertures(M) {
  const att = (f, i) => 'data-t="ouv" data-f="' + f + '" data-i="' + i + '"';
  $('tabOuv').innerHTML = ths('N°', 'Type', 'Pièce', 'Mur', 'Position (m)', 'Largeur (m)', 'Hauteur (m)', 'Allège (m)', '') +
    (M.openings.length ? M.openings.map((o, i) => '<tr>' + tds(i + 1, NOM_TYPE[o.type], o.room.nom, o.edge.i) +
      '<td>' + champ(o.src.position, o.mes.position, att('position', i)) + '</td><td>' + champ(o.w, o.mes.largeur, att('largeur', i)) + '</td>' +
      '<td>' + champ(o.h, o.mes.hauteur, att('hauteur', i)) + '</td><td>' + champ(o.allege, o.mes.allege, att('allege', i)) + '</td><td>' +
      (o.mesure ? bouton('data-t="ouv" data-i="' + i + '"') : '') + '</td></tr>').join('')
      : '<tr><td colspan="9">Aucune ouverture dans ce relevé.</td></tr>');
}

/* ---- notes (au clavier ou dictées) : travaux à prévoir ---- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let reco = null, cibleDictee = null, dictCap = null, offDictee = [];
/* hors de Claude : on dicte avec le micro du clavier (iPhone, Mac, Windows) ;
   les boutons « Dicter » propres à la page publiée dans Claude sont retirés */
const dansPagePubliee = false;
const micDispo = () => false;
function majMicros() { document.querySelectorAll('button.micro').forEach(b => { b.hidden = !micDispo(); }); const h = $('astuceMicro'); if (h) h.hidden = micDispo(); }
const photosMem = new Map();                       /* id d'image -> adresse de données JPEG (les images ne sont pas dans le document du relevé) */
const vignettes = liste => '<div class="vignettes">' + (liste || []).map(ph => '<figure class="vig">' + (photosMem.has(ph.id) ? '<img src="' + photosMem.get(ph.id) + '" data-id="' + esc(ph.id) + '" alt="Photo">' : '<div class="vigAttente">chargement…</div>') +
  '<input class="legImg" data-id="' + esc(ph.id) + '" value="' + esc(ph.legende || '') + '" placeholder="Légende" aria-label="Légende de la photo"><button type="button" class="supImg" data-id="' + esc(ph.id) + '" title="Retirer cette photo">✕</button></figure>').join('') + '</div>';
const boutonImages = (txt, attr) => '<label class="btnPhoto">' + txt + '<input type="file" accept="image/*" multiple hidden ' + attr + '></label>';
let sampleCap = null, lectureEnCours = false;
const lecteurIA = () => !!sampleCap;
/* la lecture des notes manuscrites par Claude passera par une fonction du
   serveur (clé jamais dans le navigateur) : en attendant, la note se recopie */
const blobDepuisUrl = u => { const bin = atob(u.split(',')[1]), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: 'image/jpeg' }); };
const docsHTML = docs => (docs || []).map(d => '<div class="docBloc">' + vignettes([d]) + '<div class="docTxt">' +
  (lecteurIA() ? '<button type="button" class="lire btnPetit" data-id="' + esc(d.id) + '">🔍 Lire et analyser avec Claude</button>' : '') +
  '<textarea class="txtDoc" data-id="' + esc(d.id) + '" rows="6" placeholder="' + esc(lecteurIA() ? 'Cliquez sur « Lire et analyser » : la transcription, les travaux à prévoir et les mesures citées apparaîtront ici (modifiable).' : 'Vous pouvez recopier ici le contenu de la note (la lecture automatique n\'est pas disponible dans cette vue).') + '">' + esc(d.texte || '') + '</textarea>' +
  (d.texte ? '<button type="button" class="versNotes btnPetit" data-id="' + esc(d.id) + '">↳ Ajouter aux notes générales</button>' : '') + '</div></div>').join('');
async function lireDocument(id, btn) {
  if (!sampleCap || lectureEnCours) return;
  const m = metaImage(id); if (!m || !photosMem.has(id)) return;
  const ta = document.querySelector('.txtDoc[data-id="' + id + '"]'); lectureEnCours = true; btn.disabled = true; btn.textContent = 'Lecture en cours…';
  try {
    const prompt = 'Tu aides un métreur (relevé de chantier) à exploiter la photo de ses notes manuscrites prises pendant un rendez-vous client. Légende de l\'image : « ' + (m.meta.legende || 'sans légende') + ' ». Pièces du relevé : ' + (modele.rooms.map(r => r.nom).join(', ') || 'aucune') + '.\n\n' +
      'Réponds en français, en texte simple (sans markdown : pas de ** ni de #), avec ces rubriques :\n1) TRANSCRIPTION : recopie fidèlement le texte lisible, en gardant les chiffres et les unités. Écris [illisible] si un mot ne se lit pas ; n\'invente rien.\n' +
      '2) TRAVAUX À PRÉVOIR : liste à puces, par pièce quand les notes le disent.\n3) MESURES ET CHIFFRES CITÉS : liste à puces (valeur, unité, ce à quoi elle se rapporte si c\'est clair).\n4) POINTS À CLARIFIER : seulement s\'il y en a.';
    const rep = await sampleCap(prompt, { images: [blobDepuisUrl(photosMem.get(id))], cache: false, onText: ({ text }) => { if (ta) ta.value = text; } });
    m.meta.texte = rep.text; planifierSauvegarde();
    message('Note lue par Claude. Relisez et corrigez le texte avant de vous y fier (une écriture à la main peut être mal lue).' + (rep.truncated ? ' La réponse a été coupée.' : ''), 'ok');
  } catch (e) {
    const c = e && e.code, t = { not_granted: 'Lecture refusée : autorisez l\'envoi d\'images à Claude pour cette page.', rate_limited: 'Trop de demandes : réessayez dans un instant.', image_rejected: 'L\'image n\'a pas pu être lue (format ou taille).', images_unavailable: 'La lecture d\'images n\'est pas disponible dans cette vue.' }[c];
    message(t || 'Lecture impossible (' + (c || 'erreur') + ').', 'err');
  } finally { lectureEnCours = false; remplirNotes(modele); }
}
$('listeNotes').addEventListener('click', e => {
  const b = e.target.closest('.lire'); if (b) { lireDocument(b.dataset.id, b); return; }
  const v = e.target.closest('.versNotes'); if (!v) return;
  const m = metaImage(v.dataset.id); if (!m || !m.meta.texte) return;
  const nouveau = (donneesCourantes.notes ? donneesCourantes.notes + '\n\n' : '') + 'Notes du rendez-vous (' + (m.meta.legende || 'document joint') + ') :\n' + m.meta.texte;
  donneesCourantes.notes = nouveau; modele.notes = nouveau; remplirNotes(modele); planifierSauvegarde(); message('Texte ajouté aux notes générales.', 'ok');
});
$('listeNotes').addEventListener('input', e => { if (!e.target.classList.contains('txtDoc')) return; const m = metaImage(e.target.dataset.id); if (m) { m.meta.texte = e.target.value; planifierSauvegarde(); } });

function remplirNotes(M) {
  const bloc = (titre, valeur, placeholder, attr, images) => '<div class="noteBloc"><div class="noteTete"><b>' + esc(titre) + '</b>' +
    '<button type="button" class="micro" ' + attr + ' title="Dicter à voix haute (Edge ou Chrome)">🎤 Dicter</button>' + (images ? images.bouton : '') + '</div>' +
    '<textarea class="noteZone" rows="3" ' + attr + ' placeholder="' + esc(placeholder) + '">' + esc(valeur) + '</textarea>' + (images ? images.vignettes : '') + '</div>';
  const docs = (donneesCourantes && donneesCourantes.documents) || [];
  $('listeNotes').innerHTML = bloc('Notes générales', M.notes, 'Ex. : accès au logement, contraintes, remarques du client, planning souhaité…', 'data-n="g"') +
    '<div class="noteBloc"><div class="noteTete"><b>Documents joints au projet</b>' + boutonImages('📎 Ajouter une photo ou un scan', 'data-n="doc"') + '</div>' +
    '<p class="note">Notes manuscrites, plans papier, devis : photographiez-les ou scannez-les (sur iPhone : app Notes, « Numériser des documents », puis partagez l\'image). Elles sont jointes au PDF, une page chacune. Images uniquement (pas de PDF).</p>' + docsHTML(docs) + '</div>' +
    M.rooms.map((r, i) => bloc(r.nom + (M.etages.length > 1 ? ' (' + M.etages[r.etage].nom + ')' : ''), r.note, 'Ex. : travaux à prévoir dans cette pièce (peinture, remplacement de fenêtre, sol…)', 'data-n="p" data-i="' + i + '"', { bouton: boutonImages('📷 Photos', 'data-n="img" data-i="' + i + '"'), vignettes: vignettes(r.src.photos) })).join('');
  $('notes').hidden = false; majMicros();
}
/* réduit une photo pour qu'elle tienne dans un document de la base (256 Ko) : environ 1400 px, JPEG */
async function preparerImage(file) {
  let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { bmp = await new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = URL.createObjectURL(file); }); }
  const W0 = bmp.width || bmp.naturalWidth, H0 = bmp.height || bmp.naturalHeight; let max = 1400, q = 0.78, url = '', w = 0, h = 0;
  for (let t = 0; t < 10; t++) {
    const k = Math.min(1, max / Math.max(W0, H0)); w = Math.max(1, Math.round(W0 * k)); h = Math.max(1, Math.round(H0 * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.drawImage(bmp, 0, 0, w, h);
    url = cv.toDataURL('image/jpeg', q); if (url.length <= 210000) break;
    if (q > 0.5) q -= 0.07; else max = Math.round(max * 0.8);
  }
  if (bmp.close) bmp.close();
  return { url, w, h };
}
const metaImage = id => {
  for (const r of (donneesCourantes.pieces || [])) { const i = (r.photos || []).findIndex(x => x.id === id); if (i >= 0) return { liste: r.photos, i, meta: r.photos[i] }; }
  const j = (donneesCourantes.documents || []).findIndex(x => x.id === id); return j >= 0 ? { liste: donneesCourantes.documents, i: j, meta: donneesCourantes.documents[j] } : null;
};
async function enregistrerImageCompte(id, m) {
  if (!dbCol || !autoSauv || !rid) return;
  try { await dbCol.doc(rid).collection('images').doc(id).set({ jpeg: photosMem.get(id).split(',')[1], w: m.w, h: m.h, maj: Date.now() }); }
  catch (e) { etatSauv('Une photo n\'a pas pu être sauvegardée dans votre compte (' + ((e && e.code) || 'erreur') + ').'); }
}
async function chargerImagesCompte() {
  if (!dbCol || !rid) return;
  try { const snap = await dbCol.doc(rid).collection('images').get(); snap.docs.forEach(d => { const v = d.data(); if (v && v.jpeg) photosMem.set(d.id, 'data:image/jpeg;base64,' + v.jpeg); }); remplirNotes(modele); }
  catch (e) { etatSauv('Photos du compte indisponibles pour le moment.'); }
}
async function ajouterImages(fichiers, cible) {
  if (!modele) return;
  const liste = cible.type === 'piece' ? (modele.rooms[cible.ri].src.photos = modele.rooms[cible.ri].src.photos || []) : (donneesCourantes.documents = donneesCourantes.documents || []);
  let ajoutees = 0;
  for (const f of fichiers) {
    if (liste.length >= 40) { message('Limite de 40 images atteinte pour cet emplacement.', 'warn'); break; }
    try { const im = await preparerImage(f), id = 'i' + nouvelId().slice(1), meta = { id, legende: '', w: im.w, h: im.h }; photosMem.set(id, im.url); liste.push(meta); ajoutees++; enregistrerImageCompte(id, meta); }
    catch (e) { message('Image illisible : ' + f.name + ' (formats acceptés : photo ou scan JPEG, PNG, HEIC).', 'warn'); }
  }
  if (ajoutees) { remplirNotes(modele); planifierSauvegarde(); message(ajoutees + ' image(s) ajoutée(s)' + (dbCol && autoSauv ? ' et sauvegardée(s) dans votre compte.' : ' (conservées dans cette session : utilisez « Enregistrer le relevé » pour les garder).'), 'ok'); }
}
function supprimerImage(id) {
  const m = metaImage(id); if (!m) return;
  m.liste.splice(m.i, 1); photosMem.delete(id);
  if (dbCol && rid) dbCol.doc(rid).collection('images').doc(id).delete().catch(() => {});
  remplirNotes(modele); planifierSauvegarde();
}
function supprimerPhotosPiece(src) { (src.photos || []).forEach(ph => { photosMem.delete(ph.id); if (dbCol && rid) dbCol.doc(rid).collection('images').doc(ph.id).delete().catch(() => {}); }); }
function donneesAvecImages() {
  const c = JSON.parse(JSON.stringify(donneesCourantes)), emb = {};
  [...(c.pieces || []).flatMap(p => p.photos || []), ...(c.documents || [])].forEach(ph => { if (photosMem.has(ph.id)) emb[ph.id] = photosMem.get(ph.id); });
  if (Object.keys(emb).length) c.imagesEmbarquees = emb; return c;
}
$('listeNotes').addEventListener('change', e => {
  const el = e.target; if (el.type !== 'file' || !el.files.length) return;
  const cible = el.dataset.n === 'doc' ? { type: 'doc' } : { type: 'piece', ri: +el.dataset.i }, fichiers = [...el.files]; el.value = '';
  ajouterImages(fichiers, cible);
});
$('listeNotes').addEventListener('input', e => { if (!e.target.classList.contains('legImg')) return; const m = metaImage(e.target.dataset.id); if (m) { m.meta.legende = e.target.value; planifierSauvegarde(); } });
$('listeNotes').addEventListener('click', e => {
  const sup = e.target.closest('.supImg'); if (sup) { supprimerImage(sup.dataset.id); return; }
  const im = e.target.closest('.vig img'); if (im) { $('lightboxImg').src = im.src; $('lightbox').hidden = false; }
});
$('lightbox').addEventListener('click', () => { $('lightbox').hidden = true; $('lightboxImg').removeAttribute('src'); });
function arreterDictee() { if (dictCap && dictCap.active()) dictCap.stop().catch(() => {}); if (reco) { try { reco.stop(); } catch (e) {} } }
function dicter(ta, btn) {
  if (dictCap) {                                       /* page publiée : dictée fournie par la plateforme */
    const memeZone = cibleDictee === ta;
    arreterDictee(); if (memeZone) return;
    const base = ta.value + (ta.value && !/\s$/.test(ta.value) ? ' ' : ''); let fin = '';
    const maj = prov => { ta.value = (base + fin + (prov || '')); ta.dispatchEvent(new Event('input', { bubbles: true })); };
    cibleDictee = ta; btn.classList.add('ecoute'); btn.textContent = '⏹ Arrêter';
    const nettoyer = () => { offDictee.forEach(f => f()); offDictee = []; btn.classList.remove('ecoute'); btn.textContent = '🎤 Dicter'; if (cibleDictee === ta) cibleDictee = null; };
    offDictee = [dictCap.onPartial(({ text }) => maj(text)), dictCap.onFinal(({ text }) => { fin += text; maj(''); }), dictCap.onState(({ state }) => { if (state === 'idle') nettoyer(); })];
    dictCap.start().catch(err => { nettoyer(); if (err && err.code !== 'stopped' && err.code !== 'dismissed') message('Dictée impossible (' + (err.code || 'erreur') + '). Écrivez au clavier ou utilisez le micro du clavier du téléphone.', 'warn'); });
    return;
  }
  if (!SR) { message('La dictée vocale n\'est pas disponible dans ce navigateur : utilisez Microsoft Edge ou Google Chrome, ou écrivez au clavier.', 'warn'); return; }
  const memeZone = cibleDictee === ta;
  arreterDictee();
  if (memeZone) return;
  const r = new SR(); r.lang = 'fr-FR'; r.continuous = true; r.interimResults = true;
  reco = r; cibleDictee = ta; btn.classList.add('ecoute'); btn.textContent = '⏹ Arrêter';
  const base = ta.value + (ta.value && !/\s$/.test(ta.value) ? ' ' : '');
  r.onresult = ev => {
    let texte = '';
    for (let i = 0; i < ev.results.length; i++) texte += ev.results[i][0].transcript;
    ta.value = base + texte; ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  r.onerror = ev => {
    const m = { 'not-allowed': 'Microphone refusé : autorisez-le dans la barre d\'adresse du navigateur.', 'service-not-allowed': 'Microphone refusé : autorisez-le dans la barre d\'adresse du navigateur.',
      network: 'La dictée vocale demande une connexion internet.', 'audio-capture': 'Aucun microphone détecté.' }[ev.error];
    if (m) message(m, 'err');
  };
  r.onend = () => { btn.classList.remove('ecoute'); btn.textContent = '🎤 Dicter'; if (reco === r) { reco = null; cibleDictee = null; } };
  try { r.start(); } catch (e) { btn.classList.remove('ecoute'); btn.textContent = '🎤 Dicter'; reco = null; cibleDictee = null; }
}
$('listeNotes').addEventListener('input', e => {
  if (!e.target.classList.contains('noteZone') || !modele) return;
  if (e.target.dataset.n === 'g') donneesCourantes.notes = e.target.value;
  else { const r = modele.rooms[+e.target.dataset.i]; r.src.note = e.target.value; r.note = e.target.value; }
  modele.notes = donneesCourantes.notes || '';
  planifierSauvegarde();
});
$('listeNotes').addEventListener('click', e => {
  const b = e.target.closest('.micro'); if (!b) return;
  dicter(b.closest('.noteBloc').querySelector('textarea'), b);
});

/* ---- recalage du plan sur les longueurs mesurées ----
   On cherche les positions des coins qui respectent au mieux les longueurs saisies par le métreur,
   en restant le plus près possible du plan scanné (moindres carrés). Les coins communs à plusieurs pièces bougent ensemble. */
function resoudreMesures(data) {
  const pcs = data.pieces, cle = q => Math.round(q[0] * 1000) + ',' + Math.round(q[1] * 1000);
  const idx = new Map(), X0 = [];
  const vid = pcs.map(p => (p.pointsScan || p.points).map(q => { const k = (p.etage || 0) + '#' + cle(q); if (!idx.has(k)) { idx.set(k, X0.length / 2); X0.push(q[0], q[1]); } return idx.get(k); }));
  const cons = [];
  pcs.forEach((p, k) => { if (!p.mesuresMurs) return; Object.entries(p.mesuresMurs).forEach(([i, t]) => { const n = vid[k].length; cons.push([vid[k][+i], vid[k][(+i + 1) % n], t]); }); });
  /* orientation d'origine de chaque mur : un mur garde sa direction (les murs droits restent droits) sauf si les mesures l'imposent */
  const dirs = [];
  pcs.forEach((p, k) => { const n = vid[k].length; for (let i = 0; i < n; i++) { const a = vid[k][i], b = vid[k][(i + 1) % n];
    const dx = X0[2 * b] - X0[2 * a], dy = X0[2 * b + 1] - X0[2 * a + 1], d = Math.hypot(dx, dy); if (d > 1e-6) dirs.push([a, b, dx / d, dy / d, d]); } });
  const mesures = new Set(cons.map(([a, b]) => a < b ? a + '|' + b : b + '|' + a));
  const pins = new Set();                               /* coin immobile pendant un tirage à la souris */
  pcs.forEach((p, k) => { if (!p.fixeMur || !p.mesuresMurs) return; Object.entries(p.fixeMur).forEach(([i, f]) => { if (p.mesuresMurs[i] === undefined) return; const n = vid[k].length; pins.add(f === 'debut' ? vid[k][+i] : vid[k][(+i + 1) % n]); }); });
  const X = X0.slice(), N = X0.length, wl = 100, wa = 1, wd = 10, wp = 4, wf = 40;
  for (let it = 0; it < 40 && cons.length; it++) {
    const A = Array.from({ length: N }, () => new Float64Array(N)), g = new Float64Array(N);
    for (let i = 0; i < N; i++) { A[i][i] = wa * wa; g[i] = -wa * wa * (X[i] - X0[i]); }
    pins.forEach(v => { for (const c of [2 * v, 2 * v + 1]) { A[c][c] += wf * wf; g[c] -= wf * wf * (X[c] - X0[c]); } });
    dirs.forEach(([a, b, ux, uy, d0]) => {        /* r = écart perpendiculaire du mur par rapport à sa direction d'origine */
      const id = [2 * a, 2 * a + 1, 2 * b, 2 * b + 1];
      const r = (X[2 * b] - X[2 * a]) * uy - (X[2 * b + 1] - X[2 * a + 1]) * ux, jv = [-uy, ux, uy, -ux];
      for (let p = 0; p < 4; p++) { g[id[p]] -= wd * wd * jv[p] * r; for (let q = 0; q < 4; q++) A[id[p]][id[q]] += wd * wd * jv[p] * jv[q]; }
      if (d0 < 0.05 || mesures.has(a < b ? a + '|' + b : b + '|' + a)) return;
      /* un mur non mesuré garde sa longueur du scan autant que possible */
      const dx = X[2 * b] - X[2 * a], dy = X[2 * b + 1] - X[2 * a + 1], d = Math.hypot(dx, dy) || 1e-9, rl = d - d0, lx = dx / d, ly = dy / d, jl = [-lx, -ly, lx, ly];
      for (let p = 0; p < 4; p++) { g[id[p]] -= wp * wp * jl[p] * rl; for (let q = 0; q < 4; q++) A[id[p]][id[q]] += wp * wp * jl[p] * jl[q]; }
    });
    cons.forEach(([a, b, t]) => {
      const dx = X[2 * b] - X[2 * a], dy = X[2 * b + 1] - X[2 * a + 1], d = Math.hypot(dx, dy) || 1e-9, r = d - t, jx = dx / d, jy = dy / d;
      const id = [2 * a, 2 * a + 1, 2 * b, 2 * b + 1], jv = [-jx, -jy, jx, jy];
      for (let p = 0; p < 4; p++) { g[id[p]] -= wl * wl * jv[p] * r; for (let q = 0; q < 4; q++) A[id[p]][id[q]] += wl * wl * jv[p] * jv[q]; }
    });
    for (let c = 0; c < N; c++) {                       /* élimination de Gauss */
      let m = c; for (let r = c + 1; r < N; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
      [A[c], A[m]] = [A[m], A[c]]; [g[c], g[m]] = [g[m], g[c]];
      for (let r = c + 1; r < N; r++) { const f = A[r][c] / A[c][c]; if (!f) continue; for (let k = c; k < N; k++) A[r][k] -= f * A[c][k]; g[r] -= f * g[c]; }
    }
    const dX = new Float64Array(N); let mx = 0;
    for (let r = N - 1; r >= 0; r--) { let v = g[r]; for (let k = r + 1; k < N; k++) v -= A[r][k] * dX[k]; dX[r] = v / A[r][r]; mx = Math.max(mx, Math.abs(dX[r])); }
    for (let i = 0; i < N; i++) X[i] += dX[i];
    if (mx < 1e-8) break;
  }
  pcs.forEach((p, k) => { p.points = vid[k].map(v => [arr3(X[2 * v]), arr3(X[2 * v + 1])]); });
  return cons.reduce((m, [a, b, t]) => Math.max(m, Math.abs(Math.hypot(X[2 * b] - X[2 * a], X[2 * b + 1] - X[2 * a + 1]) - t)), 0);
}
/* après un changement de dimensions, une ouverture ne doit pas dépasser de son mur */
function ajusterOuvertures(data) {
  const parId = new Map(); data.pieces.forEach(p => { parId.set(String(p.id || p.nom), p); parId.set(String(p.nom), p); });
  (data.ouvertures || []).forEach(o => {
    const p = parId.get(String(o.piece)); if (!p || !Number.isInteger(o.mur)) return;
    const a = p.points[o.mur], b = p.points[(o.mur + 1) % p.points.length]; if (!a || !b) return;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (o.largeur > L) o.largeur = arr3(L);
    if (o.position + o.largeur > L) o.position = arr3(Math.max(0, L - o.largeur));
  });
}
function preparerDonnees(d) { (d.pieces || []).forEach(p => { if (Array.isArray(p.points) && !p.pointsScan) p.pointsScan = p.points.map(q => [q[0], q[1]]); }); }

/* applique le changement déjà écrit dans donneesCourantes : recalage, calcul, affichage (annule tout si impossible) */
/* Enregistrer un fichier (PDF, relevé) : sur iPhone, la feuille de partage
   (Enregistrer dans Fichiers, Mail, AirDrop…) ; ailleurs, un téléchargement.
   Safari refuse un téléchargement lancé par programme après une composition
   (onglet « WebKitBlobResource erreur 1 ») : il reçoit un vrai lien à toucher. */
const estSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent || '');
function lienFichier(url, nom) {
  let b = $('barreFichier');
  if (!b) { b = document.createElement('div'); b.id = 'barreFichier'; document.body.appendChild(b); }
  b.replaceChildren();
  const a = document.createElement('a'); a.href = url; a.download = nom; a.textContent = '⬇ Télécharger ' + nom; a.className = 'btn';
  const x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.className = 'btn sec'; x.onclick = () => { b.remove(); URL.revokeObjectURL(url); };
  b.append(a, x);
}
async function sauvegarder(blob, nom) {
  const fichier = typeof File === 'function' ? new File([blob], nom, { type: blob.type || 'application/octet-stream' }) : null;
  if (fichier && navigator.share && navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], title: nom }); return true; }
    catch (e) { if (e && e.name === 'AbortError') return false; /* partage impossible ici : lien ci-dessous */ }
  }
  const url = URL.createObjectURL(blob);
  if (estSafari) { lienFichier(url, nom); return true; }
  const a = document.createElement('a'); a.href = url; a.download = nom;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}
let suivantFocus = 0, histo = [], refaire = [], aideAAfermee = false;
function majBoutonsHisto() { $('btnAnnuler').disabled = !histo.length; $('btnRefaire').disabled = !refaire.length; }
function reanalyser(avant, cleFocus, texte) {
  let ecart = 0;
  try { ecart = resoudreMesures(donneesCourantes); ajusterOuvertures(donneesCourantes); modele = analyser(donneesCourantes); }
  catch (e) { donneesCourantes = JSON.parse(avant); modele = analyser(donneesCourantes); remplirTableaux(modele); dessiner2D(); v3d.construire(modele, true); message('Modification annulée : ' + e.message, 'err'); return false; }
  histo.push(avant); if (histo.length > 40) histo.shift(); refaire = []; majBoutonsHisto();
  $('sousTitre').textContent = modele.projet + ' – ' + modele.rooms.length + ' pièce(s), ' + FR(modele.totalAire) + ' m²';
  remplirTableaux(modele); dessiner2D(); v3d.construire(modele, true); $('angleRot').value = modele.rotation || 0;
  if (!document.activeElement || !document.activeElement.classList.contains('noteZone')) { arreterDictee(); remplirNotes(modele); }
  message(texte + ' Surface totale : ' + FR(modele.totalAire) + ' m².' + (ecart > 0.01 ? '\nAttention : ces longueurs ne sont pas toutes compatibles entre elles (écart résiduel ' + FR3(ecart) + ' m).' : ''), ecart > 0.01 ? 'warn' : 'ok');
  planifierSauvegarde();
  if (cleFocus && suivantFocus) {
    const dec = suivantFocus; suivantFocus = 0;
    setTimeout(() => { const l = [...document.querySelectorAll('#recap input.mes')], k = l.findIndex(x => cleChamp(x) === cleFocus);
      if (k >= 0 && l[k + dec]) { l[k + dec].focus(); l[k + dec].select(); } }, 0);
  }
  return true;
}
const cleChamp = el => [el.dataset.t, el.dataset.i, el.dataset.e || '', el.dataset.f || ''].join('|');

function editerMesure(el) {
  const t = el.dataset.t, i = +el.dataset.i, v = num(el.value), avant = JSON.stringify(donneesCourantes);
  const refus = txt => { message(txt, 'err'); remplirTableaux(modele); };
  if (!(v > 0)) return refus('Valeur incorrecte : saisissez un nombre positif en mètres (par exemple 3,41).');
  let texte = 'Mesure prise en compte.';
  if (t === 'h') {
    if (v < 1 || v > 8) return refus('Hauteur sous plafond improbable (entre 1 et 8 m).');
    const r = modele.rooms[i], s = r.src;
    if (s.hauteurScan === undefined) s.hauteurScan = r.hauteur;
    s.hauteur = v; s.hauteurMesuree = true; texte = 'Hauteur de « ' + r.nom + ' » : ' + FR3(v) + ' m.';
  } else if (t === 'mur') {
    if (v < 0.05 || v > 60) return refus('Longueur de mur improbable.');
    const s = modele.rooms[i].src; s.mesuresMurs = s.mesuresMurs || {}; s.mesuresMurs[el.dataset.e] = v;
    s.fixeMur = s.fixeMur || {}; if (el.dataset.fixe) s.fixeMur[el.dataset.e] = el.dataset.fixe; else delete s.fixeMur[el.dataset.e];
    texte = 'Mur n°' + el.dataset.e + ' de « ' + modele.rooms[i].nom + ' » : ' + FR3(v) + ' m' + (el.dataset.fixe ? ' (réglé à la souris : à confirmer au mètre)' : '') + '. Plan recalé.';
  } else {
    const op = modele.openings[i], s = op.src, f = el.dataset.f, len = op.edge.len;
    const pos = f === 'position' ? v : s.position, larg = f === 'largeur' ? v : s.largeur;
    if (f !== 'position' && f !== 'largeur' && v > 8) return refus('Valeur improbable.');
    if (pos + larg > len + 0.005) return refus('Cette ouverture dépasserait de son mur (longueur du mur : ' + FR3(len) + ' m).');
    s.scan = s.scan || { position: s.position, largeur: s.largeur, hauteur: op.h, allege: op.allege };
    s[f] = v; s.mesures = s.mesures || {}; s.mesures[f] = true; texte = NOM_TYPE[op.type] + ' n°' + (i + 1) + ' : ' + LIB_CHAMP[f] + ' ' + FR3(v) + ' m.';
  }
  reanalyser(avant, cleChamp(el), texte);
}
function annulerMesure(b) {
  const t = b.dataset.t, i = +b.dataset.i, avant = JSON.stringify(donneesCourantes);
  if (t === 'h') { const s = modele.rooms[i].src; s.hauteur = s.hauteurScan; delete s.hauteurMesuree; }
  else if (t === 'mur') { const s = modele.rooms[i].src; delete s.mesuresMurs[b.dataset.e]; if (s.fixeMur) delete s.fixeMur[b.dataset.e]; if (!Object.keys(s.mesuresMurs).length) delete s.mesuresMurs; }
  else { const s = modele.openings[i].src; if (s.scan) Object.assign(s, s.scan); delete s.scan; delete s.mesures; }
  reanalyser(avant, null, 'Valeur du scan rétablie.');
}

/* saisie : un tableau commun pour renommer, mesurer, corriger */
$('recap').addEventListener('change', e => {
  const el = e.target; if (!modele || el.tagName !== 'INPUT') return;
  if (el.classList.contains('nomPiece')) {
    const r = modele.rooms[+el.dataset.i], nouveau = el.value.trim() || r.nom, avant = JSON.stringify(donneesCourantes);
    el.value = nouveau; if (nouveau === r.nom) return;
    if (r.src.id === undefined) r.src.id = r.id;       /* les ouvertures retrouvent la pièce par son identifiant, pas par son nom */
    r.src.nom = nouveau;
    reanalyser(avant, null, 'Pièce renommée : « ' + nouveau + ' ». Pensez à « Enregistrer le relevé » pour conserver les noms.');
  } else if (el.classList.contains('mes')) editerMesure(el);
  else if (el.classList.contains('noteMur')) { const ed = modele.rooms[+el.dataset.i].edges.find(q => q.i === +el.dataset.e); if (ed && el.value.trim() !== ed.noteMur) appliquerNoteMur(+el.dataset.i, +el.dataset.e, ed.nomMur, el.value); }
  else if (el.id === 'hGlobal') { /* géré par le bouton */ }
});
$('recap').addEventListener('click', e => { if (e.target.classList.contains('rev') && modele) annulerMesure(e.target); });
$('recap').addEventListener('keydown', e => {
  if (!e.target.classList.contains('mes')) return;
  e.target.dataset.cle = cleChamp(e.target);
  if (e.key === 'Enter') { suivantFocus = e.shiftKey ? -1 : 1; e.target.blur(); }
  else if (e.key === 'Tab') suivantFocus = e.shiftKey ? -1 : 1;
});
$('recap').addEventListener('focusin', e => { if (e.target.classList.contains('mes')) { e.target.dataset.cle = cleChamp(e.target); suivantFocus = 0; } });
$('btnHGlobal').addEventListener('click', () => {
  if (!modele) return;
  const v = num($('hGlobal').value), avant = JSON.stringify(donneesCourantes);
  if (!(v >= 1 && v <= 8)) { message('Saisissez une hauteur sous plafond entre 1 et 8 m (par exemple 2,47).', 'err'); return; }
  modele.rooms.forEach(r => { const s = r.src; if (s.hauteurScan === undefined) s.hauteurScan = r.hauteur; s.hauteur = v; s.hauteurMesuree = true; });
  reanalyser(avant, null, 'Hauteur sous plafond de toutes les pièces : ' + FR3(v) + ' m.');
});

function chargerTexte(texte, nom, opts) {
  opts = opts || {}; photosMem.clear(); let imagesAEnvoyer = null;
  let M;
  try {
    let data;
    try { data = JSON.parse(texte); } catch (e) { throw new Error('Ce fichier n\'est pas un JSON valide : ' + e.message); }
    if (data && data.imagesEmbarquees && typeof data.imagesEmbarquees === 'object') {         /* images contenues dans un fichier enregistré */
      imagesAEnvoyer = data.imagesEmbarquees; Object.entries(imagesAEnvoyer).forEach(([id, u]) => { if (typeof u === 'string' && u.startsWith('data:image/')) photosMem.set(id, u); }); delete data.imagesEmbarquees;
    }
    if (estRoomPlan(data)) {
      const conv = convertirRoomPlan(data);
      conv.donnees.projet = 'Scan ' + nom.replace(/\.json$/i, '').replace(/^openplan-/i, 'OpenPlan3D ');
      convertiJson = conv.donnees; rapportConv = conv.rapport;
      preparerDonnees(conv.donnees); M = analyser(conv.donnees); donneesCourantes = conv.donnees;
    } else { convertiJson = null; rapportConv = null; preparerDonnees(data); M = analyser(data); donneesCourantes = data; }
  } catch (e) { message(e.message, 'err'); return; }
  modele = M; nomFichier = nom.replace(/\.json$/i, ''); etageCourant = 0; v3d.etageMax = 99;
  histo = []; refaire = []; majBoutonsHisto();
  rid = donneesCourantes._rid || nouvelId(); donneesCourantes._rid = rid;
  if (imagesAEnvoyer) Object.keys(imagesAEnvoyer).forEach(id => { const m = metaImage(id); if (m && photosMem.has(id)) enregistrerImageCompte(id, m.meta); }); majConnue = opts.maj || 0; conflit = false; if ($('btnForcer')) $('btnForcer').hidden = true;
  vue.k = 1; vue.tx = 0; vue.ty = 0;
  $('videPlan').style.display = 'none'; $('vide3d').style.display = 'none';
  $('sousTitre').textContent = M.projet + ' – ' + M.rooms.length + ' pièce(s), ' + FR(M.totalAire) + ' m²';
  $('btnPdf').disabled = false; $('btnDxf').disabled = false;
  remplirTableaux(M); remplirNotes(M); remplirLegende(); $('angleRot').value = M.rotation || 0; $('chkReperes').checked = !!M.reperes; $('chkAjuster').checked = modeAjuster; $('chkOuv').checked = modeOuv; dessiner2D(); v3d.construire(M);
  $('btnEnregistrer').hidden = false; $('btnVersion').hidden = !dbCol;
  if (rapportConv) {
    const r = rapportConv;
    const nbEst = r.cotesEstimes ? ' ' + r.cotesEstimes + ' côté(s) estimé(s), non scanné(s) : dessinés en pointillés (~).' : '';
    message('Scan RoomPlan converti : ' + r.nbMurs + ' murs → ' + M.rooms.length + ' pièce(s), ' + r.nbOuvertures + '/' + r.totalOuvertures + ' ouverture(s) placée(s), surface totale ' + FR(M.totalAire) + ' m².\n' +
      'À vérifier : les surfaces sont reconstituées à partir des murs scannés (comparez avec un mètre).' + nbEst +
      (r.avertissements.length ? '\n' + r.avertissements.join('\n') : ''), r.avertissements.length || r.ignorees ? 'warn' : 'ok');
  } else if (M.avertissements.length) message('Relevé chargé avec des avertissements :\n' + M.avertissements.join('\n'), 'warn');
  else message('Relevé « ' + M.projet + ' » chargé : ' + M.rooms.length + ' pièce(s), ' + M.openings.length + ' ouverture(s), surface totale ' + FR(M.totalAire) + ' m².', 'ok');
  if (!opts.reprise) planifierSauvegarde(); else if (typeof afficherListe === 'function') afficherListe();
  if (rapportConv) setTimeout(() => proposerDoublons(new Set()), 0);
}
/* une porte vue deux fois dans un coin (convertisseur.js, doublonsPortesCoin) :
   on montre la paire et le métreur choisit ; rien n'est retiré sans son accord,
   et « Annuler » garde les deux portes */
function proposerDoublons(gardes) {
  if (!donneesCourantes) return;
  const cle = d => d.piece + '|' + d.murA + '|' + d.murB;
  const d = doublonsPortesCoin(donneesCourantes).find(x => !gardes.has(cle(x)));
  if (!d) return;
  const A = lettreMur(d.murA), B = lettreMur(d.murB), lA = FR(d.largeurA), lB = FR(d.largeurB);
  ouvrirModal('Une porte vue deux fois ?',
    '<p>Dans « ' + esc(d.nomPiece) + ' », le scan a trouvé deux portes de part et d\'autre du même coin : <b>' + lA + ' m</b> sur le mur ' + A +
    ' et <b>' + lB + ' m</b> sur le mur ' + B + '. C\'est souvent une seule porte, vue deux fois.</p>' +
    '<label class="radio"><input type="radio" name="dbl" value="a" checked> Une seule porte : garder celle du mur ' + A + ' (' + lA + ' m)</label>' +
    '<label class="radio"><input type="radio" name="dbl" value="b"> Une seule porte : garder celle du mur ' + B + ' (' + lB + ' m)</label>' +
    '<label class="radio"><input type="radio" name="dbl" value="2"> Ce sont bien deux portes</label>' +
    '<p class="note" style="margin-top:12px">Mesurez ensuite la porte au mètre : touchez-la sur le plan pour corriger sa largeur.</p>', 'Valider', corps => {
      const v = (corps.querySelector('input[name=dbl]:checked') || {}).value;
      if (v === 'a' || v === 'b') {
        const avant = JSON.stringify(donneesCourantes), retiree = v === 'a' ? d.b : d.a;
        donneesCourantes.ouvertures.splice(retiree, 1);
        reanalyser(avant, null, 'Porte en double retirée : celle du mur ' + (v === 'a' ? A : B) + ' est gardée. Pensez à mesurer sa largeur.');
      } else gardes.add(cle(d));
      setTimeout(() => proposerDoublons(gardes), 0);
    });
  $('modalAnnuler').onclick = () => { fermerModal(); gardes.add(cle(d)); setTimeout(() => proposerDoublons(gardes), 0); };
}
/* une image ou un PDF (plan 2D : magicplan, architecte, photo) n'est pas un relevé :
   dans la visite, il lui est passé pour être lu par l'IA (étape Scan) */
const estPlan2D = f => /^image\//.test(f.type || '') || f.type === 'application/pdf' || /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(f.name || '');
function chargerFichier(f) {
  if (!f) return;
  if (estPlan2D(f)) {
    if (pont.actif) { versVisite({ type: 'releve:plan2d', fichier: f }); message('Plan 2D reçu : la visite le lit (étape Scan)…', 'ok'); }
    else message('Ce fichier est une image ou un PDF, pas un relevé (.json). Un plan 2D se lit depuis la visite : étape Scan › « Plan 2D ».', 'warn');
    return;
  }
  f.text().then(t => chargerTexte(t, f.name));
}

$('fichier').addEventListener('change', e => { chargerFichier(e.target.files[0]); e.target.value = ''; });
['dragenter', 'dragover'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); $('drop').classList.add('on'); }));
['dragleave', 'drop'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' || e.target === $('drop')) $('drop').classList.remove('on'); }));
window.addEventListener('drop', e => {
  // plusieurs esquisses glissées d'un coup (une par pièce) : toutes passent à la visite
  const fs = [...(e.dataTransfer.files || [])];
  if (fs.length > 1 && pont.actif && fs.every(estPlan2D)) { versVisite({ type: 'releve:plan2d', fichier: fs[0], fichiers: fs }); message(fs.length + ' plans reçus : la visite les lit (étape Scan)…', 'ok'); return; }
  chargerFichier(fs[0]);
});

/* zoom et déplacement du plan 2D */
cvPlan.addEventListener('wheel', e => {
  if (!modele) return; e.preventDefault();
  const r = cvPlan.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
  const k2 = Math.min(Math.max(vue.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.3), 12), f = k2 / vue.k;
  vue.tx = cx - (cx - vue.tx) * f; vue.ty = cy - (cy - vue.ty) * f; vue.k = k2; dessiner2D();
}, { passive: false });
/* gestes sur le plan : un doigt = déplacer, deux doigts = zoomer, un simple toucher sur une cote ou une ouverture = la corriger */
const doigts = new Map(); let geste = null;
const posPlan = e => { const r = cvPlan.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
const zoneEn = (x, y) => { for (let i = zonesPlan.length - 1; i >= 0; i--) { const z = zonesPlan[i]; if (Math.abs(x - z.x) <= z.w / 2 && Math.abs(y - z.y) <= z.h / 2) return z; } return null; };
const distSeg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)); return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t); };
/* ce qu'il y a sous le doigt ou la souris : bout de flèche, chiffre, puis ligne de flèche */
const cibleEn = (x, y, tactile) => {
  if (modeOuv) for (const z of ouvZonesPlan) { const rr = tactile ? 18 : 10; if (Math.hypot(x - z.hS[0], y - z.hS[1]) <= rr) return Object.assign({ type: 'ouvH', which: 's' }, z); if (Math.hypot(x - z.hE[0], y - z.hE[1]) <= rr) return Object.assign({ type: 'ouvH', which: 'e' }, z); }
  if (modeAjuster) for (const z of poigneesPlan) if (Math.hypot(x - z.x, y - z.y) <= (tactile ? 22 : 13)) return z;     /* bouts de flèche : seulement en mode « ajuster les murs » */
  const zl = zoneEn(x, y); if (zl) return zl;
  if (modeOuv) for (const z of ouvZonesPlan) if (distSeg(x, y, z.p0, z.p1) <= (tactile ? 12 : 8)) return Object.assign({ type: 'ouvC' }, z);
  for (const z of lignesPlan) if (distSeg(x, y, z.a1, z.a2) <= (tactile ? 14 : 7)) return z;
  return null;
};
const areteDe = z => modele.rooms[z.ri].edges.find(q => q.i === z.ei);
const alongDe = (z, x, y) => { const L = Math.hypot(z.qe[0] - z.pe[0], z.qe[1] - z.pe[1]); return ((x - z.pe[0]) * (z.qe[0] - z.pe[0]) + (y - z.pe[1]) * (z.qe[1] - z.pe[1])) / L; };
const longueurPx = z => Math.hypot(z.qe[0] - z.pe[0], z.qe[1] - z.pe[1]);
const memoriserReglage = z => { const r = modele.rooms[z.ri], e = areteDe(z); if (!e) return; r.src.reglagesCotes = r.src.reglagesCotes || {}; if (e.reglage) r.src.reglagesCotes[z.ei] = Object.assign({}, e.reglage); else delete r.src.reglagesCotes[z.ei]; planifierSauvegarde(); };

cvPlan.addEventListener('pointerdown', e => {
  doigts.set(e.pointerId, posPlan(e)); try { cvPlan.setPointerCapture(e.pointerId); } catch (err) { /* capture impossible : sans conséquence */ }
  if (doigts.size === 1) {
    const [x, y] = posPlan(e), c = modele && !trace && !liaison ? cibleEn(x, y, e.pointerType === 'touch') : null;
    geste = { mode: 'un', x: e.clientX, y: e.clientY, tx: vue.tx, ty: vue.ty, bouge: 0, cible: c };
    if (c && c.type === 'fin') { geste.mode = 'fin'; geste.decalage = alongDe(c, x, y) - (c.which === 'q' ? longueurPx(c) : 0); }
    else if (c && c.type === 'ligne') { const ed = areteDe(c); geste.mode = 'ligne'; geste.p0 = [x, y]; geste.decal0 = (ed.reglage && ed.reglage.decal) || 0; }
    else if (c && (c.type === 'ouvH' || c.type === 'ouvC')) { const o = modele.openings[c.oi]; geste.mode = 'ouv'; geste.p0 = [x, y]; geste.pos0 = o.src.position; geste.larg0 = o.src.largeur; }
    else if (c && c.type === 'symbole' && modele.symboles[c.si]) { const sy = modele.symboles[c.si]; geste.mode = 'sym'; geste.p0 = [x, y]; geste.s0 = [sy.x, sy.y]; }
  } else if (doigts.size === 2) { const [p, q] = [...doigts.values()]; geste = { mode: 'deux', d0: Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, k0: vue.k, m0: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], tx0: vue.tx, ty0: vue.ty, bouge: 99 }; apercu = null; }
  cvPlan.style.cursor = 'grabbing';
});
cvPlan.addEventListener('pointermove', e => {
  if (!modele) return;
  if (doigts.has(e.pointerId)) doigts.set(e.pointerId, posPlan(e));
  const [x, y] = posPlan(e);
  if (!geste && trace) { const [tx, ty] = [x, y]; if (trace.a) { trace.cur = accrocherPlan(tx, ty); dessiner2D(); } return; }
  if (!geste && liaison) { const m = murSous(x, y); const k = m ? m.piece.id + '|' + m.mur : ''; if (k !== (liaison.survol || '')) { liaison.survol = k; liaison.survolMur = m; dessiner2D(); } return; }
  if (!geste) {
    const cleZ = q => q ? q.type + (q.ri !== undefined ? q.ri : q.oi) + '|' + (q.ei !== undefined ? q.ei : '') + (q.which || '') : '';
    const c = cibleEn(x, y, e.pointerType === 'touch'), cle = cleZ(c);
    cvPlan.style.cursor = !c ? 'grab' : c.type === 'fin' ? 'crosshair' : c.type === 'ouvH' ? 'col-resize' : (c.type === 'ligne' || c.type === 'ouvC') ? 'move' : 'pointer';
    if (cleZ(survol) !== cle) { survol = c && ['fin', 'ligne', 'ouvH', 'ouvC'].includes(c.type) ? c : null; dessiner2D(); }
    return;
  }
  if (geste.mode === 'deux' && doigts.size >= 2) {
    const [p, q] = [...doigts.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const k2 = Math.min(Math.max(geste.k0 * d / geste.d0, 0.3), 14), f = k2 / geste.k0;
    vue.k = k2; vue.tx = m[0] - (geste.m0[0] - geste.tx0) * f; vue.ty = m[1] - (geste.m0[1] - geste.ty0) * f; dessiner2D(); return;
  }
  const dx = e.clientX - geste.x, dy = e.clientY - geste.y; geste.bouge = Math.max(geste.bouge, Math.hypot(dx, dy));
  if (geste.mode === 'fin' && geste.bouge > 3) {                        /* tirer un bout de flèche : nouvelle longueur du mur */
    const z = geste.cible, s = transformationEcran().s, along = alongDe(z, x, y) - geste.decalage;
    const len = Math.max(0.1, Math.round((z.which === 'q' ? along : longueurPx(z) - along) / s * 100) / 100);
    apercu = { z, len }; survol = null; dessiner2D();
  } else if (geste.mode === 'ligne' && geste.bouge > 3) {               /* glisser la ligne : l'éloigner ou la rapprocher du mur */
    const z = geste.cible, ed = areteDe(z), s = transformationEcran().s;
    const dd = ((x - geste.p0[0]) * z.nIn[0] + (y - geste.p0[1]) * z.nIn[1]) / s;
    ed.reglage = Object.assign({}, ed.reglage, { decal: Math.round(Math.max(-3, Math.min(3, geste.decal0 + dd)) * 100) / 100 }); dessiner2D();
  } else if (geste.mode === 'ouv' && geste.bouge > 3) {                  /* déplacer une ouverture le long de son mur, ou tirer l'un de ses bouts pour la redimensionner */
    const z = geste.cible, o = modele.openings[z.oi], len = o.edge.len, s = transformationEcran().s, d = ((x - geste.p0[0]) * z.ue[0] + (y - geste.p0[1]) * z.ue[1]) / s;
    let pos = geste.pos0, larg = geste.larg0;
    if (z.type === 'ouvC') { pos = Math.max(0, Math.min(geste.pos0 + d, len - larg)); }
    else if (z.which === 's') { const fin = geste.pos0 + geste.larg0; pos = Math.max(0, Math.min(geste.pos0 + d, fin - 0.3)); larg = fin - pos; }
    else { larg = Math.max(0.3, Math.min(geste.larg0 + d, len - geste.pos0)); }
    apercuOuv = { oi: z.oi, pos: Math.round(pos * 100) / 100, larg: Math.round(larg * 100) / 100, pos0: geste.pos0, z }; survol = null; dessiner2D();
  } else if (geste.mode === 'sym' && geste.bouge > 6) {                   /* glisser un symbole : l'écart à l'écran, ramené au plan non tourné */
    const s = transformationEcran().s, a = -(modele.rotation || 0) * Math.PI / 180, ex = (x - geste.p0[0]) / s, ey = (y - geste.p0[1]) / s;
    const sy = modele.symboles[geste.cible.si];
    if (sy) { sy.x = Math.round((geste.s0[0] + ex * Math.cos(a) - ey * Math.sin(a)) * 20) / 20; sy.y = Math.round((geste.s0[1] + ex * Math.sin(a) + ey * Math.cos(a)) * 20) / 20; geste.deplace = true; dessiner2D(); }
  } else if (geste.mode === 'un' && geste.cible && geste.cible.type === 'mur' && geste.bouge > 6) geste.mode = 'etiq';
  if (geste.mode === 'etiq') {                                          /* glisser le chiffre le long du mur */
    const z = geste.cible, ed = areteDe(z), t = Math.max(0.05, Math.min(0.95, alongDe(z, x, y) / longueurPx(z)));
    ed.reglage = Object.assign({}, ed.reglage, { pos: Math.round(t * 1000) / 1000 }); dessiner2D();
  } else if (geste.mode === 'un' && !(geste.cible && geste.cible.type === 'mur') && geste.bouge > 6) { vue.tx = geste.tx + dx; vue.ty = geste.ty + dy; dessiner2D(); }
});
const finDoigt = (e, annule) => {
  const g = geste; doigts.delete(e.pointerId);
  if (doigts.size === 0) {
    geste = null; cvPlan.style.cursor = 'grab';
    if (g && modele && !annule) {
      if (g.mode === 'sym') {
        const sy = modele.symboles[g.cible.si];
        if (g.deplace && sy) { const avant = JSON.stringify(donneesCourantes); sy.src.x = sy.x; sy.src.y = sy.y; reanalyser(avant, null, NOMS_SYM[sy.type] + ' déplacé.'); }
        else if (g.bouge <= 6) { const [x, y] = posPlan(e); ouvrirEditeur({ type: 'symbole', si: g.cible.si }, x, y); }
      } else if (g.mode === 'ouv') {
        if (apercuOuv) { const a = apercuOuv; apercuOuv = null; appliquerOuvertureDrag(a); }
        else if (g.bouge <= 6) { const [x, y] = posPlan(e); ouvrirEditeur({ type: 'ouv', oi: g.cible.oi }, x, y); }
      } else if (g.mode === 'fin' && apercu) {
        const { z, len } = apercu; apercu = null; dessiner2D();
        editerMesure({ dataset: { t: 'mur', i: z.ri, e: z.ei, fixe: z.which === 'q' ? 'debut' : 'fin' }, value: FR3(len) });
      } else if ((g.mode === 'ligne' || g.mode === 'etiq') && g.bouge > 3) memoriserReglage(g.cible);
      else if (g.mode === 'un' && g.bouge <= 6) { const [x, y] = posPlan(e); if (trace) pointTrace(x, y); else if (liaison) pointLiaison(x, y); else { const z = zoneEn(x, y); if (z) ouvrirEditeur(z, x, y); else fermerEditeur(); } }
    }
    if (apercu || apercuOuv) { apercu = null; apercuOuv = null; dessiner2D(); }
  } else if (doigts.size === 1) { const [p] = [...doigts.values()]; geste = { mode: 'un', x: p[0] + cvPlan.getBoundingClientRect().left, y: p[1] + cvPlan.getBoundingClientRect().top, tx: vue.tx, ty: vue.ty, bouge: 99, cible: null }; }
};
cvPlan.addEventListener('pointerup', e => finDoigt(e, false));
cvPlan.addEventListener('pointercancel', e => finDoigt(e, true));
cvPlan.addEventListener('pointerleave', () => { if (!geste && survol) { survol = null; dessiner2D(); } });

/* petite fenêtre de saisie sur le plan */
const editeur = $('editeur');
function fermerEditeur() { editeur.hidden = true; editeur.innerHTML = ''; }
function ajouterRapide(ri, ei, type) {
  const r = modele.rooms[ri], e = r.edges.find(q => q.i === ei), w = e.wall;
  if (w.demoli) { message('Ce mur est marqué « à démolir » : annulez d\'abord la démolition pour y poser une ouverture.', 'warn'); return; }
  const DEF = { fenetre: [1.2, 1.25, 0.9], porte: [0.9, 2.04, 0], passage: [0.9, 2.04, 0] }[type];
  const occ = w.openings.slice().sort((a, b) => a.pos - b.pos); let best = null, cur = 0;
  const essai = (i0, i1) => { if (!best || i1 - i0 > best[1] - best[0]) best = [i0, i1]; };
  occ.forEach(o => { essai(cur, o.pos); cur = o.pos + o.w; }); essai(cur, w.len);
  const libre = best[1] - best[0];
  const mini = type === 'fenetre' ? 0.6 : 0.8;
  if (libre < mini) { message('Pas assez de place libre sur ce mur pour ' + (type === 'fenetre' ? 'une fenêtre' : 'une porte') + ' (il reste ' + FR(libre) + ' m ; il faut au moins ' + FR(mini) + ' m). Utilisez « + Autre ouverture… » pour choisir une taille plus petite.', 'warn'); return; }
  const larg = Math.round(Math.min(DEF[0], libre - 0.1) * 100) / 100, posCan = best[0] + (libre - larg) / 2, posSrc = e.rev ? e.len - posCan - larg : posCan;
  const avant = JSON.stringify(donneesCourantes); donneesCourantes.ouvertures = donneesCourantes.ouvertures || [];
  donneesCourantes.ouvertures.push({ type, piece: idPiece(r), mur: ei, position: arr3(Math.max(0, posSrc)), largeur: larg, hauteur: DEF[1], allege: DEF[2] });
  reanalyser(avant, null, NOM_TYPE[type] + ' ajoutée sur le mur ' + e.lettre + ' de « ' + r.nom + ' » (' + FR3(larg) + ' m, au milieu de la partie libre) : glissez-la pour la placer, tirez ses bouts pour changer sa largeur.');
}
$('recap').addEventListener('click', e => { const b = e.target.closest('.ajOuvRap'); if (b && modele) ajouterRapide(+b.dataset.i, +b.dataset.e, b.dataset.t); });
function appliquerRepere(ri, ei, visible) {            /* afficher ou masquer la lettre d'un mur (sans toucher au reste) */
  const r = modele.rooms[ri], s = r.src, ed = r.edges.find(q => q.i === ei);
  s.reperesMasques = s.reperesMasques || {}; if (visible) delete s.reperesMasques[ei]; else s.reperesMasques[ei] = true;
  if (!Object.keys(s.reperesMasques).length) delete s.reperesMasques;
  ed.reperesOff = !visible; dessiner2D(); planifierSauvegarde();
}
function reglerReperes(visible) {                      /* tout afficher / tout masquer */
  modele.rooms.forEach(r => { delete r.src.reperesMasques; if (!visible) r.src.reperesMasques = Object.fromEntries(r.edges.map(e => [e.i, true])); r.edges.forEach(e => { e.reperesOff = !visible; }); });
  donneesCourantes.affichage = Object.assign({}, donneesCourantes.affichage, { reperes: true }); modele.reperes = true; $('chkReperes').checked = true;
  remplirTableaux(modele); dessiner2D(); planifierSauvegarde(); message(visible ? 'Les lettres de tous les murs sont affichées.' : 'Les lettres de tous les murs sont masquées : cochez celles que vous voulez voir dans le tableau des murs.', 'ok');
}
$('btnRepTous').addEventListener('click', () => { if (modele) reglerReperes(true); });
$('btnRepAucun').addEventListener('click', () => { if (modele) reglerReperes(false); });
$('recap').addEventListener('change', e => { const el = e.target; if (modele && el.classList && el.classList.contains('repV')) appliquerRepere(+el.dataset.i, +el.dataset.e, el.checked); });
function toutesAretes(ri, ei, fn) {                    /* applique fn à toutes les arêtes de pièces qui portent le même mur */
  const e = modele.rooms[ri].edges.find(q => q.i === ei);
  e.wall.rooms.forEach(rr => rr.edges.filter(x => x.wall === e.wall).forEach(x => fn(rr.src, x.i)));
}
function appliquerEpaisseurMur(ri, ei, v) {
  const avant = JSON.stringify(donneesCourantes); toutesAretes(ri, ei, (src, i) => { src.epaisseurs = src.epaisseurs || {}; src.epaisseurs[i] = arr3(v); });
  reanalyser(avant, null, 'Épaisseur du mur ' + lettreMur(ei) + ' de « ' + modele.rooms[ri].nom + ' » : ' + FR3(v) + ' m.');
}
function basculerDemolition(ri, ei) {
  const e = modele.rooms[ri].edges.find(q => q.i === ei), nv = !e.wall.demoli, avant = JSON.stringify(donneesCourantes);
  toutesAretes(ri, ei, (src, i) => { src.demolis = src.demolis || {}; if (nv) src.demolis[i] = true; else delete src.demolis[i]; });
  modele.rooms.forEach(r => { if (r.src.demolis && !Object.keys(r.src.demolis).length) delete r.src.demolis; });
  reanalyser(avant, null, nv ? 'Mur ' + lettreMur(ei) + ' de « ' + modele.rooms[ri].nom + ' » marqué « à démolir » (pointillés rouges, absent de la 3D et des surfaces de murs).' : 'Démolition annulée pour le mur ' + lettreMur(ei) + '.');
}
function appliquerNoteMur(ri, ei, nom, note) {
  const r = modele.rooms[ri], s = r.src, avant = JSON.stringify(donneesCourantes), v = { nom: String(nom).trim(), note: String(note).trim() };
  s.notesMurs = s.notesMurs || {};
  if (!v.nom && !v.note) delete s.notesMurs[ei]; else s.notesMurs[ei] = v;
  if (!Object.keys(s.notesMurs).length) delete s.notesMurs;
  reanalyser(avant, null, v.note || v.nom ? 'Explicatif enregistré pour le mur ' + lettreMur(ei) + ' de « ' + r.nom + ' ».' : 'Explicatif du mur retiré.');
}
function placerEditeur(x, y) {
  const W = cvPlan.clientWidth, H = cvPlan.clientHeight, ew = editeur.offsetWidth, eh = editeur.offsetHeight;
  editeur.style.left = (cvPlan.offsetLeft + Math.max(6, Math.min(x - ew / 2, W - ew - 6))) + 'px';
  editeur.style.top = (cvPlan.offsetTop + Math.max(6, Math.min(y + 22, H - eh - 6))) + 'px';
}
function ouvrirFichePiece(z, x, y) {
  const r = modele.rooms[z.ri], s = r.src, st = s.style || {};
  const defs = { fond: PASTELS[z.ri % PASTELS.length], mur: '#30343b', texte: '#1d2430', cote: '#6b7280' };
  const rangs = [['fond', 'Fond de la pièce'], ['mur', 'Murs'], ['texte', 'Textes (nom, surface)'], ['cote', 'Cotes (flèches et chiffres)']];
  editeur.innerHTML = '<b>Fiche de la pièce</b><label>Nom<input id="fpNom" value="' + esc(r.nom) + '"></label>' +
    '<label>Hauteur sous plafond (m)<input id="fpH" inputmode="decimal" value="' + FR3(r.hauteur) + '"></label>' +
    '<div class="coulTitre">Couleurs (pour la légende)</div>' + rangs.map(([k, lib]) => '<div class="coul"><span>' + lib + '</span><input type="color" data-k="' + k + '" data-vide="' + (colOK(st[k]) ? 0 : 1) + '" value="' + (colOK(st[k]) || defs[k]) + '"><button type="button" class="raz" data-k="' + k + '" title="Couleur par défaut">×</button></div>').join('') +
    '<div class="boutons"><button type="button" id="edOk">OK</button><button type="button" id="edAnnuler">Annuler</button></div>' +
    (s.ajoutee ? '<div class="boutons"><button type="button" id="fpSup" class="danger">Supprimer cette pièce</button></div>' : '');
  editeur.hidden = false; placerEditeur(x, y);
  editeur.querySelectorAll('input[type=color]').forEach(c => c.addEventListener('input', () => { c.dataset.vide = '0'; }));
  editeur.querySelectorAll('.raz').forEach(b => b.addEventListener('click', () => { const c = editeur.querySelector('input[data-k="' + b.dataset.k + '"]'); c.value = defs[b.dataset.k]; c.dataset.vide = '1'; }));
  const valider = () => {
    const nom = $('fpNom').value.trim() || r.nom, h = num($('fpH').value), avant = JSON.stringify(donneesCourantes);
    if (nom !== r.nom) { if (s.id === undefined) s.id = r.id; s.nom = nom; }
    if (isFinite(h) && h >= 1 && h <= 8 && Math.abs(h - r.hauteur) > 0.0005) { if (s.hauteurScan === undefined) s.hauteurScan = r.hauteur; s.hauteur = h; s.hauteurMesuree = true; }
    const style = {}; editeur.querySelectorAll('input[type=color]').forEach(c => { if (c.dataset.vide !== '1') style[c.dataset.k] = c.value; });
    if (Object.keys(style).length) s.style = style; else delete s.style;
    fermerEditeur(); reanalyser(avant, null, 'Pièce « ' + nom + ' » mise à jour.');
  };
  $('edOk').onclick = valider; $('edAnnuler').onclick = fermerEditeur;
  if (s.ajoutee) $('fpSup').onclick = () => { fermerEditeur(); supprimerPiece(z.ri); };
  $('fpNom').addEventListener('keydown', ev => { if (ev.key === 'Enter') valider(); else if (ev.key === 'Escape') fermerEditeur(); });
  $('fpNom').focus(); $('fpNom').select();
}
function ouvrirEditeur(z, x, y) {
  if (z.type === 'symbole') return ouvrirSymbole(z, x, y);
  if (z.type === 'cloison') return ouvrirCloison(z, x, y);
  if (z.type === 'toit') return dialogToiture(z.ti);
  if (z.type === 'piece') return ouvrirFichePiece(z, x, y);
  if (z.type === 'murnote') z = Object.assign({}, z, { type: 'mur' });
  let titre, champs, rev = null, extra = '', note0 = '', nom0 = '', demoli0 = false;
  if (z.type === 'mur') {
    const r = modele.rooms[z.ri], e = r.edges.find(q => q.i === z.ei);
    titre = r.nom + ' – mur ' + e.lettre + ' (n°' + z.ei + ')' + (e.estime ? ' – côté estimé' : '');
    note0 = e.noteMur; nom0 = e.nomMur; demoli0 = !!e.wall.demoli;
    extra = '<label>Nom du mur (facultatif)<input id="edNomMur" value="' + esc(e.nomMur) + '" placeholder="Ex. : mur côté jardin"></label><label>Travaux / explicatif<textarea id="edNoteMur" rows="3" placeholder="Ex. : refaire le placo">' + esc(e.noteMur) + '</textarea></label>' +
      '<label>Épaisseur du mur (m)<input id="edEp" inputmode="decimal" value="' + FR3(e.wall.ep) + '"></label>' +
      '<label class="radio"><input type="checkbox" id="edRep"' + (e.reperesOff ? '' : ' checked') + '> Afficher le repère ' + e.lettre + ' sur le plan</label>';
    champs = [{ lib: 'Longueur mesurée (m)', val: e.len, ds: { t: 'mur', i: z.ri, e: z.ei } }];
    if (e.mesure) rev = { t: 'mur', i: z.ri, e: z.ei };
  } else {
    const op = modele.openings[z.oi];
    titre = NOM_TYPE[op.type] + ' n°' + (z.oi + 1) + ' – ' + op.room.nom;
    const f = (lib, val, champ) => ({ lib, val, ds: { t: 'ouv', i: z.oi, f: champ } });
    champs = [f('Largeur (m)', op.w, 'largeur'), f('Hauteur (m)', op.h, 'hauteur'), f('Allège (m)', op.allege, 'allege'), f('Position depuis le début du mur (m)', op.src.position, 'position')];
    if (op.mesure) rev = { t: 'ouv', i: z.oi };
    if (op.type === 'porte') extra = '<label>Charnière<select id="edChar"><option value="debut"' + ((op.src.charniere || 'debut') !== 'fin' ? ' selected' : '') + '>au début du mur</option><option value="fin"' + (op.src.charniere === 'fin' ? ' selected' : '') + '>à la fin du mur</option></select></label>' +
      '<label class="radio"><input type="checkbox" id="edInv"' + (op.src.sens === 'inverse' ? ' checked' : '') + '> S\'ouvre de l\'autre côté du mur</label>';
  }
  editeur.innerHTML = '<b>' + esc(titre) + '</b>' + champs.map((c, k) => '<label>' + esc(c.lib) + '<input class="edIn" inputmode="decimal" data-k="' + k + '" value="' + FR3(c.val) + '"></label>').join('') + extra +
    '<div class="boutons"><button type="button" id="edOk">OK</button><button type="button" id="edAnnuler">Annuler</button>' + (rev ? '<button type="button" id="edRev" title="Revenir à la valeur du scan">↺</button>' : '') + '</div>' +
    (z.type === 'mur' ? '<div class="boutons"><button type="button" id="edAjFen">+ Fenêtre</button><button type="button" id="edAjPorte">+ Porte</button></div><div class="boutons"><button type="button" id="edAjOuv">+ Autre ouverture…</button></div><div class="boutons"><button type="button" id="edDemol" class="danger">' + (demoli0 ? 'Annuler la démolition' : 'Démolir tout le mur') + '</button><button type="button" id="edDemolPart" class="danger">Démolir une partie…</button></div>' : '<div class="boutons"><button type="button" id="edSupOuv" class="danger">Supprimer l\'ouverture</button></div>');
  editeur.hidden = false; placerEditeur(x, y);
  const valider = () => {
    const entrees = [...editeur.querySelectorAll('.edIn')], nn = $('edNoteMur'), nm = $('edNomMur'), noteV = nn ? nn.value : null, nomV = nm ? nm.value : '', epV = $('edEp') ? num($('edEp').value) : null, repV = $('edRep') ? $('edRep').checked : null, selC = $('edChar'), invC = $('edInv'), charV = selC ? selC.value : null, invV = invC ? invC.checked : null, opD = z.type === 'ouv' ? modele.openings[z.oi] : null;
    fermerEditeur();
    if (z.type === 'mur' && epV !== null && epV > 0 && epV <= 2 && Math.abs(epV - modele.rooms[z.ri].edges.find(q => q.i === z.ei).wall.ep) > 0.0005) appliquerEpaisseurMur(z.ri, z.ei, epV);
    if (z.type === 'mur' && repV !== null && repV === !!modele.rooms[z.ri].edges.find(q => q.i === z.ei).reperesOff) appliquerRepere(z.ri, z.ei, repV);
    if (z.type === 'mur' && noteV !== null && (noteV.trim() !== note0 || nomV.trim() !== nom0)) appliquerNoteMur(z.ri, z.ei, nomV, noteV);
    if (opD && charV !== null && (charV !== (opD.src.charniere || 'debut') || invV !== (opD.src.sens === 'inverse'))) { const avant = JSON.stringify(donneesCourantes); opD.src.charniere = charV; if (invV) opD.src.sens = 'inverse'; else delete opD.src.sens; reanalyser(avant, null, 'Porte n°' + (z.oi + 1) + ' : sens d\'ouverture modifié.'); }
    entrees.forEach(inp => { const c = champs[+inp.dataset.k], v = num(inp.value); if (isFinite(v) && Math.abs(v - c.val) > 0.0005) editerMesure({ dataset: Object.assign({}, c.ds), value: inp.value }); });
  };
  $('edOk').onclick = valider; $('edAnnuler').onclick = fermerEditeur;
  if (rev) $('edRev').onclick = () => { fermerEditeur(); annulerMesure({ dataset: Object.assign({}, rev) }); };
  if (z.type === 'mur') { $('edAjOuv').onclick = () => { fermerEditeur(); dialogAjoutOuverture({ ri: z.ri, ei: z.ei }); };
    $('edAjFen').onclick = () => { fermerEditeur(); ajouterRapide(z.ri, z.ei, 'fenetre'); };
    $('edAjPorte').onclick = () => { fermerEditeur(); ajouterRapide(z.ri, z.ei, 'porte'); };
    $('edDemol').onclick = () => { fermerEditeur(); basculerDemolition(z.ri, z.ei); };
    $('edDemolPart').onclick = () => { fermerEditeur(); dialogAjoutOuverture({ ri: z.ri, ei: z.ei, type: 'passage', demol: true }); }; }
  else $('edSupOuv').onclick = () => { fermerEditeur(); supprimerOuverture(z.oi); };
  editeur.querySelectorAll('.edIn').forEach(inp => inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') valider(); else if (ev.key === 'Escape') fermerEditeur(); }));
  const premier = editeur.querySelector('.edIn'); premier.focus(); premier.select();
}
/* ---- boîte de dialogue (les fenêtres du navigateur type confirm() ne s'affichent pas dans une page publiée) ---- */
function fermerModal() { $('modal').hidden = true; $('modal').classList.remove('basEcran'); $('modalCorps').innerHTML = ''; }
function ouvrirModal(titre, corps, texteOk, onOk) {
  $('modalTitre').textContent = titre; $('modalCorps').innerHTML = corps + '<p class="modalErr" id="modalErr" hidden></p>'; $('modalOk').textContent = texteOk; $('modal').hidden = false;
  const ok = () => { const r = onOk($('modalCorps')); if (r === false) return; if (typeof r === 'string') { $('modalErr').textContent = r; $('modalErr').hidden = false; return; } fermerModal(); };
  $('modalOk').onclick = ok; $('modalAnnuler').onclick = fermerModal;
  $('modalCorps').querySelectorAll('input:not([type=color]),select').forEach(i => i.addEventListener('keydown', ev => { if (ev.key === 'Enter') ok(); else if (ev.key === 'Escape') fermerModal(); }));
  const premier = $('modalCorps').querySelector('input,select'); if (premier) { premier.focus(); if (premier.select) premier.select(); }
}
const idPiece = r => { if (r.src.id === undefined) r.src.id = r.id; return r.src.id; };      /* les ouvertures retrouvent leur pièce par l'identifiant */
const champNum = (id, lib, val, pas) => '<label>' + lib + '<input id="' + id + '" inputmode="decimal" value="' + FR3(val) + '"></label>';

/* coupe une arête (côté) d'une pièce en plusieurs morceaux et remet à jour tout ce qui y fait référence (ouvertures, mesures, réglages) :
   la règle est dans assemblage.js, partagée avec la liaison de deux scans */
function decouperArete(p, ei, coupes, L) { return Assemblage.decouperArete(donneesCourantes, p, ei, coupes, L); }

/* crée une pièce rectangulaire : accolée à un mur extérieur d'une pièce existante, ou séparée */
function creerPiece(o) {
  const data = donneesCourantes; let pts, ptsS, avertissement = '';
  if (o.accole) {
    const rA = modele.rooms[o.accole.ri], e = rA.edges.find(q => q.i === o.accole.ei), L = e.len, sA = rA.src.pointsScan || rA.src.points, n = sA.length;
    const ux = (e.q[0] - e.p[0]) / L, uy = (e.q[1] - e.p[1]) / L, nx = -e.nIn[0], ny = -e.nIn[1], d0 = o.decalage, d1 = o.decalage + o.largeur;
    const sa = sA[e.i], sb = sA[(e.i + 1) % n], pt = d => [arr3(e.p[0] + ux * d), arr3(e.p[1] + uy * d)], pts_ = d => [arr3(sa[0] + (sb[0] - sa[0]) * d / L), arr3(sa[1] + (sb[1] - sa[1]) * d / L)];
    const c0 = pt(d0), c1 = pt(d1), s0 = pts_(d0), s1 = pts_(d1), D = o.profondeur;
    pts = [c0, c1, [arr3(c1[0] + nx * D), arr3(c1[1] + ny * D)], [arr3(c0[0] + nx * D), arr3(c0[1] + ny * D)]];
    ptsS = [s0, s1, [arr3(s1[0] + nx * D), arr3(s1[1] + ny * D)], [arr3(s0[0] + nx * D), arr3(s0[1] + ny * D)]];
    const perdu = decouperArete(rA.src, e.i, [d0, d1].filter(d => d > 0.0005 && d < L - 0.0005), L);
    if (perdu) avertissement = ' (la mesure saisie sur le mur n°' + e.i + ' de « ' + rA.nom + ' » a été retirée car ce mur est maintenant coupé en morceaux)';
  } else {
    const bb = modele.bbox, x0 = arr3(bb.x1 + 1), y0 = arr3(bb.y0);
    pts = [[x0, y0], [arr3(x0 + o.largeur), y0], [arr3(x0 + o.largeur), arr3(y0 + o.profondeur)], [x0, arr3(y0 + o.profondeur)]]; ptsS = pts.map(q => q.slice());
  }
  data.pieces.push({ id: 'p' + nouvelId().slice(1), nom: o.nom, points: pts, pointsScan: ptsS, hauteur: o.hauteur, ajoutee: true, etage: etageNum(), style: { mur: o.couleurMur } });
  return avertissement;
}
/* ---- avant / après travaux : situation initiale figée + copie modifiable ---- */
function creerReference(nomRef, nomSit) {
  const d = donneesCourantes, avant = JSON.stringify(d); assurerEtages();
  const cp = x => JSON.parse(JSON.stringify(x === undefined ? [] : x));
  const pieces = cp(d.pieces).map(q => { ['photos', 'note', 'notesMurs', 'mesuresMurs', 'fixeMur', 'reglagesCotes', 'hauteurMesuree', 'hauteurScan', 'ajoutee'].forEach(k => delete q[k]); return q; });
  const ouv = cp(d.ouvertures).map(o => { delete o.mesures; delete o.scan; return o; });
  pieces.forEach(q => delete q.demolis);
  d.reference = { nom: nomRef, pieces, ouvertures: ouv, etages: cp(d.etages), toitures: cp(d.toitures), cloisons: cp(d.cloisons) }; d.nomSituation = nomSit;
  d.affichage = Object.assign({}, d.affichage, { duo: true }); vue.k = 1; vue.tx = 0; vue.ty = 0;
  reanalyser(avant, null, 'Situation initiale « ' + nomRef + ' » figée (à gauche). Le plan de droite « ' + nomSit + ' » est la copie que vous modifiez.');
}
function dialogAvantApres() {
  if (!modele) return; const d = donneesCourantes;
  if (!d.reference) {
    ouvrirModal('Avant / après travaux', '<p>Votre plan actuel devient la <b>situation initiale</b> : il est <b>figé</b> et s\'affiche à gauche.</p><p>Une copie identique s\'affiche à droite : c\'est <b>elle que vous modifiez</b> (déplacer une porte, ajouter une pièce, changer une cote…). Les deux plans restent côte à côte, à la même échelle.</p>' +
      '<label>Nom de la situation initiale<input id="aaRef" value="Situation initiale"></label><label>Nom du plan modifiable<input id="aaCur" value="Après travaux"></label>', 'Créer les deux plans', () => {
        const a = $('aaRef').value.trim(), b = $('aaCur').value.trim(); if (!a || !b) return 'Donnez un nom aux deux plans.'; creerReference(a, b);
      });
  } else {
    ouvrirModal('Avant / après travaux', '<label>Nom de la situation initiale (figée)<input id="aaRef" value="' + esc(modele.nomRef) + '"></label><label>Nom du plan modifiable<input id="aaCur" value="' + esc(modele.nomSit) + '"></label>' +
      '<div class="modalBtns col"><button type="button" class="btn sec" id="aaCmp">Comparer les deux situations (surfaces, pièces, ouvertures)</button><button type="button" class="btn sec" id="aaRemp">Remplacer la situation initiale par le plan actuel</button><button type="button" class="btn sec danger" id="aaSup">Supprimer la situation initiale</button></div>', 'Enregistrer les noms', () => {
        const a = $('aaRef').value.trim(), b = $('aaCur').value.trim(); if (!a || !b) return 'Donnez un nom aux deux plans.';
        if (a === d.reference.nom && b === (d.nomSituation || 'Après travaux')) return; const avant = JSON.stringify(d); d.reference.nom = a; d.nomSituation = b; reanalyser(avant, null, 'Noms enregistrés.');
      });
    $('aaCmp').onclick = () => { fermerModal(); const R = modeleReference(); if (R) montrerComparaison(R, modele, modele.nomRef, modele.nomSit); };
    $('aaRemp').onclick = () => { fermerModal(); ouvrirModal('Remplacer la situation initiale ?', '<p>La situation initiale sera remplacée par le plan actuel : les modifications faites à droite deviendront la nouvelle situation initiale.</p>', 'Remplacer', () => { creerReference(d.reference.nom, d.nomSituation || 'Après travaux'); }); };
    $('aaSup').onclick = () => { fermerModal(); ouvrirModal('Supprimer la situation initiale ?', '<p>La situation initiale figée sera supprimée. Le plan actuel est conservé.</p>', 'Supprimer', () => { const avant = JSON.stringify(d); delete d.reference; delete d.nomSituation; if (d.affichage) delete d.affichage.duo; vue.k = 1; vue.tx = 0; vue.ty = 0; reanalyser(avant, null, 'Situation initiale supprimée.'); }); };
  }
}
$('btnAvantApres').addEventListener('click', dialogAvantApres);
$('btnAideAA').addEventListener('click', dialogAvantApres);
$('btnFermerAideAA').addEventListener('click', () => { aideAAfermee = true; $('aideAvantApres').hidden = true; });
$('chkDuo').addEventListener('change', e => { if (!modele || !donneesCourantes.reference) return; donneesCourantes.affichage = Object.assign({}, donneesCourantes.affichage, { duo: e.target.checked }); modele.duo = e.target.checked; vue.k = 1; vue.tx = 0; vue.ty = 0; dessiner2D(); planifierSauvegarde(); });

/* ---- toitures ---- */
const COUVERTURES = ['Tuiles terre cuite', 'Tuiles béton', 'Ardoise', 'Zinc', 'Bac acier', 'Membrane (toit plat)', 'Toiture végétalisée'];
const DEF_TOIT = { plat: [2, 'Membrane (toit plat)'], '1pente': [15, 'Bac acier'], '2pentes': [35, 'Tuiles terre cuite'], '4pentes': [30, 'Tuiles terre cuite'] };
const SENS_TOIT = { plat: [], '2pentes': [['longueur', 'Faîtage dans le sens de la longueur'], ['largeur', 'Faîtage dans le sens de la largeur']], '4pentes': [['longueur', 'Faîtage dans le sens de la longueur'], ['largeur', 'Faîtage dans le sens de la largeur']],
  '1pente': [['bas', 'Pente vers le bas du plan'], ['haut', 'Pente vers le haut du plan'], ['gauche', 'Pente vers la gauche'], ['droite', 'Pente vers la droite']] };
function remplirToits(M) {
  $('tabToits').innerHTML = M.toits.length ? ths('Toiture', 'Pièces couvertes', 'Type', 'Angle', 'Pente', 'Couverture', 'Emprise (m²)', 'Surface de couverture (m²)', '') +
    M.toits.map(t => '<tr>' + tds(t.nom, t.pieces.slice(0, 3).map(r => r.nom).join(', ') + (t.pieces.length > 3 ? '…' : ''), NOM_TOIT[t.type], FR(t.angle) + '°', Math.round(t.pente) + ' %', t.couverture || '—', FR(t.emprise), FR(t.surface)) +
      '<td><button type="button" class="btnPetit editToit" data-ti="' + t.idx + '">Modifier</button></td></tr>').join('') +
    '<tr class="total"><td>Total</td><td></td><td></td><td></td><td></td><td></td><td>' + FR(M.toits.reduce((a, t) => a + t.emprise, 0)) + '</td><td>' + FR(M.toits.reduce((a, t) => a + t.surface, 0)) + '</td><td></td></tr>' : '<tr><td>Aucune toiture : ajoutez-en une avec le bouton ci-dessous.</td></tr>';
}
function dialogToiture(ti) {
  if (!modele) return;
  const t = ti == null ? null : modele.toits[ti], haut = modele.etages.length - 1;
  const cochees = new Set(t ? t.pieces.map(r => r.idx) : modele.rooms.filter(r => r.etage === haut).map(r => r.idx));
  const type0 = t ? t.type : '2pentes', cou0 = t ? t.couverture : DEF_TOIT[type0][1];
  ouvrirModal(t ? 'Modifier la toiture' : 'Ajouter une toiture', '<label>Nom<input id="toNom" value="' + esc(t ? t.nom : 'Toiture ' + (modele.toits.length + 1)) + '"></label>' +
    '<label>Pièces couvertes</label><div id="toPieces">' + modele.rooms.map(r => '<label class="radio sous0"><input type="checkbox" data-i="' + r.idx + '"' + (cochees.has(r.idx) ? ' checked' : '') + '> ' + esc(r.nom) + (modele.etages.length > 1 ? ' (' + esc(modele.etages[r.etage].nom) + ')' : '') + '</label>').join('') + '</div>' +
    '<label>Type de toiture<select id="toType">' + Object.keys(NOM_TOIT).map(k => '<option value="' + k + '"' + (k === type0 ? ' selected' : '') + '>' + NOM_TOIT[k] + '</option>').join('') + '</select></label>' +
    champNum('toAng', 'Angle de la pente (degrés)', t ? t.angle : DEF_TOIT[type0][0]) +
    '<label>Sens<select id="toSens"></select></label>' +
    '<label>Type de couverture<select id="toCouv">' + COUVERTURES.map(c => '<option' + (c === cou0 ? ' selected' : '') + '>' + c + '</option>').join('') + '<option value="__autre"' + (cou0 && !COUVERTURES.includes(cou0) ? ' selected' : '') + '>Autre (je précise)</option></select></label>' +
    '<label id="toAutreL" hidden>Précisez la couverture<input id="toAutre" value="' + esc(cou0 && !COUVERTURES.includes(cou0) ? cou0 : '') + '"></label>' +
    champNum('toDeb', 'Débord de toit (m)', t ? t.debord : 0.4) +
    '<p class="note">L\'emprise est le rectangle qui englobe les pièces cochées, débord compris. Pour une forme en L, créez une toiture par partie.</p>' +
    (t ? '<button type="button" id="toSup" class="btnPetit danger">Supprimer cette toiture</button>' : ''), t ? 'Enregistrer' : 'Ajouter', () => {
      const nom = $('toNom').value.trim(), ids = [...document.querySelectorAll('#toPieces input:checked')].map(i => modele.rooms[+i.dataset.i]), type = $('toType').value, ang = num($('toAng').value), deb = num($('toDeb').value);
      let couv = $('toCouv').value; if (couv === '__autre') couv = $('toAutre').value.trim();
      if (!nom) return 'Donnez un nom à la toiture.'; if (!ids.length) return 'Cochez au moins une pièce couverte.';
      if (!(ang >= 0 && ang <= 70)) return 'L\'angle doit être compris entre 0 et 70 degrés.'; if (!(deb >= 0 && deb <= 3)) return 'Le débord doit être compris entre 0 et 3 m.';
      if (!couv) return 'Précisez le type de couverture.';
      const avant = JSON.stringify(donneesCourantes), d = donneesCourantes; d.toitures = d.toitures || [];
      const o = { id: t ? t.src.id : 't' + nouvelId().slice(1), nom, pieces: ids.map(r => idPiece(r)), type, angle: ang, couverture: couv, sens: $('toSens').value || undefined, debord: deb };
      if (!o.sens) delete o.sens;
      if (t) Object.assign(t.src, o); else d.toitures.push(o);
      reanalyser(avant, null, 'Toiture « ' + nom + ' » ' + (t ? 'modifiée' : 'ajoutée') + ' : ' + NOM_TOIT[type] + ', ' + FR(ang) + '°, ' + couv + '.');
    });
  const majSens = (garder) => { const ty = $('toType').value, ops = SENS_TOIT[ty]; $('toSens').innerHTML = ops.map(([v, l]) => '<option value="' + v + '">' + l + '</option>').join(''); $('toSens').parentElement.hidden = !ops.length; if (garder && t && ops.some(([v]) => v === t.sens)) $('toSens').value = t.sens; };
  const majCouv = () => { $('toAutreL').hidden = $('toCouv').value !== '__autre'; };
  majSens(true); majCouv();
  $('toType').addEventListener('change', () => { const anc = DEF_TOIT[type0]; majSens(false); const d = DEF_TOIT[$('toType').value]; $('toAng').value = FR3(d[0]); $('toCouv').value = d[1]; majCouv(); });
  $('toCouv').addEventListener('change', majCouv);
  if (t) $('toSup').onclick = () => { fermerModal(); ouvrirModal('Supprimer la toiture ?', '<p>La toiture « ' + esc(t.nom) + ' » sera retirée du relevé.</p>', 'Supprimer', () => { const avant = JSON.stringify(donneesCourantes), arr = donneesCourantes.toitures; arr.splice(arr.indexOf(t.src), 1); reanalyser(avant, null, 'Toiture « ' + t.nom + ' » supprimée.'); }); };
}
$('btnAjToit').addEventListener('click', () => dialogToiture(null));
$('recap').addEventListener('click', e => { const b = e.target.closest('.editToit'); if (b && modele) dialogToiture(+b.dataset.ti); });

/* ---- étages ---- */
const etageNum = () => (typeof etageCourant === 'number' ? etageCourant : 0);
function assurerEtages() { if (!Array.isArray(donneesCourantes.etages) || !donneesCourantes.etages.length) donneesCourantes.etages = modele.etages.map(e => ({ nom: e.nom })); }
function remplirOnglets() {
  if (!modele) return;
  $('aideAvantApres').hidden = !!modele.aReference || aideAAfermee;
  $('lblDuo').hidden = !modele.aReference; $('chkDuo').checked = !!modele.duo;
  const n = modele.etages.length; if (etageCourant >= n) etageCourant = n - 1;
  $('onglets').innerHTML = modele.etages.map((e, k) => '<button type="button" class="onglet' + (etageCourant === k ? ' actif' : '') + '" data-e="' + k + '">' + esc(e.nom) + '</button>').join('') +
    '<button type="button" class="onglet toit' + (etageCourant === 'toit' ? ' actif' : '') + '" data-e="toit">Toitures</button><button type="button" class="onglet add" id="btnAjEtage">＋ Étage</button><button type="button" class="onglet opt" id="btnEtageOpt" title="Renommer ou supprimer cet étage">⚙</button>';
  const sel = $('sel3dEtage'); sel.hidden = n < 2;
  sel.innerHTML = '<option value="99">Tous les étages</option>' + modele.etages.map((e, k) => '<option value="' + k + '">Jusqu\'à : ' + esc(e.nom) + '</option>').join('');
  sel.value = String(v3d.etageMax == null || v3d.etageMax >= n ? 99 : v3d.etageMax);
}
$('onglets').addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t || !modele) return;
  if (t.dataset.e !== undefined) { etageCourant = t.dataset.e === 'toit' ? 'toit' : +t.dataset.e; fermerEditeur(); remplirOnglets(); dessiner2D(); }
  else if (t.id === 'btnAjEtage') dialogAjoutEtage(); else if (t.id === 'btnEtageOpt') dialogEtageOpt();
});
$('chkToits').addEventListener('change', e => { v3d.montrerToits = e.target.checked; if (modele) v3d.construire(modele, true); });
$('sel3dEtage').addEventListener('change', e => { v3d.etageMax = +e.target.value; v3d.construire(modele, true); });
function dialogAjoutEtage() {
  if (!modele) return;
  const n = modele.etages.length, dessous = modele.rooms.filter(r => r.etage === n - 1), h0 = modele.etages[n - 1].hauteur;
  ouvrirModal('Ajouter un étage', '<label>Nom<input id="aeNom" value="Étage ' + n + '"></label>' + champNum('aeH', 'Hauteur sous plafond (m)', h0) +
    '<p class="note" style="margin-top:12px">Contenu de ce nouvel étage :</p>' +
    '<label class="radio"><input type="radio" name="aeMode" value="vide" checked> Vide : je dessine les pièces moi-même (bouton « ＋ Pièce »)</label>' +
    '<label class="radio"><input type="radio" name="aeMode" value="toute"> Toute la maison : copie de toutes les pièces de « ' + esc(modele.etages[n - 1].nom) + ' »</label>' +
    '<label class="radio"><input type="radio" name="aeMode" value="partie"> Une partie : je choisis les pièces à reprendre</label>' +
    '<div id="aeListe" hidden>' + dessous.map((r, k) => '<label class="radio sous"><input type="checkbox" data-k="' + k + '" checked> ' + esc(r.nom) + ' (' + FR(r.aire) + ' m²)</label>').join('') + '</div>' +
    '<label class="radio"><input type="checkbox" id="aeOuv"> Copier aussi les portes et fenêtres de ces pièces</label>', 'Ajouter l\'étage', () => {
      const nom = $('aeNom').value.trim(), H = num($('aeH').value), mode = document.querySelector('input[name=aeMode]:checked').value;
      if (!nom) return 'Donnez un nom à l\'étage.'; if (!(H >= 1 && H <= 8)) return 'La hauteur sous plafond doit être comprise entre 1 et 8 m.';
      let sel = [];
      if (mode === 'toute') sel = dessous; else if (mode === 'partie') { sel = dessous.filter((r, k) => document.querySelector('#aeListe input[data-k="' + k + '"]').checked); if (!sel.length) return 'Cochez au moins une pièce à reprendre.'; }
      const avant = JSON.stringify(donneesCourantes), d = donneesCourantes, copieOuv = $('aeOuv').checked;
      assurerEtages(); d.etages.push({ nom }); const idx = d.etages.length - 1; d.ouvertures = d.ouvertures || [];
      sel.forEach((r, k) => {
        const np = { id: 'p' + nouvelId().slice(1) + k, nom: r.nom, points: r.src.points.map(q => q.slice()), pointsScan: r.src.points.map(q => q.slice()), hauteur: H, etage: idx, ajoutee: true };
        if (r.src.style) np.style = Object.assign({}, r.src.style);
        const cles = [String(r.id), String(r.nom)];
        const ouv = copieOuv ? d.ouvertures.filter(o => cles.includes(String(o.piece))).map(o => Object.assign({}, o, { piece: np.id })) : [];
        d.pieces.push(np); ouv.forEach(o => d.ouvertures.push(o));
      });
      if (mode === 'toute') (d.cloisons || []).filter(c => c.etage === n - 1).forEach((c, k) => { d.cloisons.push(Object.assign({}, c, { id: 'c' + nouvelId().slice(1) + 'x' + k, etage: idx, a: c.a.slice(), b: c.b.slice() })); });
      etageCourant = idx; reanalyser(avant, null, 'Étage « ' + nom + ' » ajouté' + (sel.length ? ' avec ' + sel.length + ' pièce(s) copiée(s)' : ' (vide : ajoutez-y des pièces avec « ＋ Pièce »)') + '.');
    });
  document.querySelectorAll('input[name=aeMode]').forEach(r => r.addEventListener('change', () => { $('aeListe').hidden = document.querySelector('input[name=aeMode]:checked').value !== 'partie'; }));
}
function dialogEtageOpt() {
  if (!modele) return;
  if (typeof etageCourant !== 'number') { message('Choisissez un étage pour le renommer ou le supprimer.', 'warn'); return; } const k = etageNum(), e = modele.etages[k], n = modele.etages.length;
  ouvrirModal('Étage « ' + e.nom + ' »', '<label>Nom de l\'étage<input id="eoNom" value="' + esc(e.nom) + '"></label>' +
    (n > 1 ? '<button type="button" id="eoSup" class="btnPetit danger" style="margin-top:14px">Supprimer cet étage et ses pièces</button>' : ''), 'Enregistrer', () => {
      const nom = $('eoNom').value.trim(); if (!nom) return 'Donnez un nom à l\'étage.'; if (nom === e.nom) return;
      const avant = JSON.stringify(donneesCourantes); assurerEtages(); donneesCourantes.etages[k].nom = nom; reanalyser(avant, null, 'Étage renommé : « ' + nom + ' ».');
    });
  if ($('eoSup')) $('eoSup').onclick = () => { fermerModal(); supprimerEtage(k); };
}
function supprimerEtage(k) {
  const e = modele.etages[k], pcs = modele.rooms.filter(r => r.etage === k);
  ouvrirModal('Supprimer l\'étage ?', '<p>L\'étage « ' + esc(e.nom) + ' » et ses ' + pcs.length + ' pièce(s) seront supprimés du relevé.</p>', 'Supprimer', () => {
    const avant = JSON.stringify(donneesCourantes), d = donneesCourantes, ids = new Set(pcs.map(r => String(r.id)));
    assurerEtages(); pcs.forEach(r => { if (typeof supprimerPhotosPiece === 'function') supprimerPhotosPiece(r.src); });
    d.pieces = d.pieces.filter(q => !pcs.some(r => r.src === q)); d.ouvertures = (d.ouvertures || []).filter(o => !ids.has(String(o.piece)));
    d.pieces.forEach(q => { if ((q.etage || 0) > k) q.etage = q.etage - 1; }); d.etages.splice(k, 1);
    if (Array.isArray(d.cloisons)) { d.cloisons = d.cloisons.filter(c => (c.etage || 0) !== k); d.cloisons.forEach(c => { if ((c.etage || 0) > k) c.etage = c.etage - 1; }); }
    if (Array.isArray(d.toitures)) d.toitures = d.toitures.map(t => Object.assign({}, t, { pieces: (t.pieces || []).filter(id => !ids.has(String(id))) })).filter(t => t.pieces.length);
    etageCourant = Math.max(0, Math.min(etageCourant, d.etages.length - 1)); reanalyser(avant, null, 'Étage « ' + e.nom + ' » supprimé.');
  });
}
/* ---- tracer un nouveau mur : on touche le point de départ puis le point d'arrivée ---- */
let trace = null, liaison = null;          /* tracé d'un mur ; liaison de deux scans (plus bas) */
function majBarreTrace() { $('barreTrace').hidden = !trace; if (trace) $('texteTrace').textContent = trace.a ? 'Touchez le point d\'arrivée du mur.' : 'Touchez le point de départ du mur (il s\'accroche aux coins et aux murs existants).'; cvPlan.style.cursor = trace ? 'crosshair' : 'grab'; dessiner2D(); }
function pxVersPlan(x, y) { const T = transformationEcran(), q = [(x - T.ox) / T.s, (y - T.oy) / T.s], a = -(modele.rotation || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a); return [q[0] * c - q[1] * sn, q[0] * sn + q[1] * c]; }
function planVersPx(q) { const T = transformationEcran(), a = (modele.rotation || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), r = [q[0] * c - q[1] * sn, q[0] * sn + q[1] * c]; return [T.ox + r[0] * T.s, T.oy + r[1] * T.s]; }
function accrocherPlan(x, y) {
  const T = transformationEcran(), seuil = 12 / T.s, k = etageNum(); let q = pxVersPlan(x, y), pris = false;
  const pts = []; modele.rooms.filter(r => r.etage === k).forEach(r => r.pts.forEach(v => pts.push(v))); modele.cloisons.filter(c => c.etage === k).forEach(c => pts.push(c.a, c.b));
  let bd = seuil, best = null; pts.forEach(v => { const dd = Math.hypot(v[0] - q[0], v[1] - q[1]); if (dd < bd) { bd = dd; best = v; } });
  if (best) { q = [best[0], best[1]]; pris = true; }
  else { let bp = null, bdp = seuil; modele.rooms.filter(r => r.etage === k).forEach(r => r.edges.forEach(e => { const dx = e.q[0] - e.p[0], dy = e.q[1] - e.p[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((q[0] - e.p[0]) * dx + (q[1] - e.p[1]) * dy) / l2)), pt = [e.p[0] + dx * t, e.p[1] + dy * t], dd = Math.hypot(q[0] - pt[0], q[1] - pt[1]); if (dd < bdp) { bdp = dd; bp = pt; } })); if (bp) { q = bp; pris = true; } }
  if (trace && trace.a && !pris) { const dx = q[0] - trace.a[0], dy = q[1] - trace.a[1]; if (Math.abs(dx) <= Math.abs(dy) * 0.12) q[0] = trace.a[0]; else if (Math.abs(dy) <= Math.abs(dx) * 0.12) q[1] = trace.a[1]; }
  return [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100];
}
function pointTrace(x, y) {
  const q = accrocherPlan(x, y);
  if (!trace.a) { trace.a = q; trace.cur = q; majBarreTrace(); return; }
  if (Math.hypot(q[0] - trace.a[0], q[1] - trace.a[1]) < 0.05) { message('Les deux points sont trop proches : touchez un point d\'arrivée plus loin.', 'warn'); return; }
  const avant = JSON.stringify(donneesCourantes), d = donneesCourantes, a = trace.a, ep = trace.ep; d.cloisons = d.cloisons || [];
  d.cloisons.push({ id: 'c' + nouvelId().slice(1), etage: etageNum(), a, b: q, ep }); trace = null; majBarreTrace();
  reanalyser(avant, null, 'Mur ajouté (M' + d.cloisons.length + ') : ' + FR(Math.hypot(q[0] - a[0], q[1] - a[1])) + ' m, épaisseur ' + FR3(ep) + ' m. Touchez sa cote pour le modifier ou le supprimer.');
}
function dialogTracerMur() {
  if (!modele) return;
  if (typeof etageCourant !== 'number') { message('Choisissez d\'abord un étage (onglets au-dessus du plan) pour y tracer un mur.', 'warn'); return; }
  ouvrirModal('Ajouter un mur', champNum('tmEp', 'Épaisseur du mur (m)', modele.ep) + '<p class="note">Ensuite, touchez sur le plan le point de départ, puis le point d\'arrivée. Les extrémités s\'accrochent aux coins et aux murs existants, et se mettent d\'équerre quand elles sont presque alignées. Le mur apparaît avec sa longueur : touchez-la pour la corriger.</p>', 'Tracer', () => {
    const v = num($('tmEp').value); if (!(v >= 0.03 && v <= 1)) return 'L\'épaisseur doit être comprise entre 0,03 et 1 m.';
    trace = { ep: v, a: null, cur: null }; majBarreTrace();
  });
}
function ouvrirCloison(z, x, y) {
  const c = modele.cloisons[z.ci]; if (!c) return;
  editeur.innerHTML = '<b>Mur ajouté M' + (z.ci + 1) + '</b><label>Longueur (m)<input id="clLong" inputmode="decimal" value="' + FR3(c.len) + '"></label><label>Épaisseur (m)<input id="clEp" inputmode="decimal" value="' + FR3(c.ep) + '"></label>' +
    '<div class="boutons"><button type="button" id="edOk">OK</button><button type="button" id="edAnnuler">Annuler</button></div><div class="boutons"><button type="button" id="clSup" class="danger">Supprimer ce mur</button></div>';
  editeur.hidden = false; placerEditeur(x, y);
  const valider = () => { const L = num($('clLong').value), E = num($('clEp').value); fermerEditeur(); modifierCloison(z.ci, L, E); };
  $('edOk').onclick = valider; $('edAnnuler').onclick = fermerEditeur; $('clSup').onclick = () => { fermerEditeur(); supprimerCloison(z.ci); };
  editeur.querySelectorAll('input').forEach(i => i.addEventListener('keydown', ev => { if (ev.key === 'Enter') valider(); else if (ev.key === 'Escape') fermerEditeur(); }));
  $('clLong').focus(); $('clLong').select();
}
function modifierCloison(ci, L, E) {
  const c = modele.cloisons[ci]; if (!c) return; const s = c.src, avant = JSON.stringify(donneesCourantes);
  if (!(L >= 0.1 && L <= 60) || !(E >= 0.03 && E <= 1)) { message('Longueur (0,1 à 60 m) ou épaisseur (0,03 à 1 m) incorrecte.', 'err'); remplirTableaux(modele); return; }
  s.b = [arr3(s.a[0] + c.u[0] * L), arr3(s.a[1] + c.u[1] * L)]; s.ep = arr3(E);
  reanalyser(avant, null, 'Mur M' + (ci + 1) + ' : ' + FR3(L) + ' m, épaisseur ' + FR3(E) + ' m.');
}
function supprimerCloison(ci) {
  const c = modele.cloisons[ci]; if (!c) return;
  ouvrirModal('Supprimer ce mur ?', '<p>Le mur ajouté M' + (ci + 1) + ' (' + FR(c.len) + ' m) sera supprimé.</p>', 'Supprimer', () => { const avant = JSON.stringify(donneesCourantes), arr = donneesCourantes.cloisons; arr.splice(arr.indexOf(c.src), 1); reanalyser(avant, null, 'Mur M' + (ci + 1) + ' supprimé.'); });
}
$('btnAjMur').addEventListener('click', dialogTracerMur);
/* ---- les symboles posés directement sur le plan (aussi sur un plan scanné) ---- */
function ouvrirSymbole(z, x, y) {
  const sy = modele.symboles[z.si]; if (!sy) return;
  /* chaque équipement se règle à sa vraie taille (un radiateur de 1,40 m, une douche de 1,20 × 0,80…) ;
     bornes larges mais pas absurdes, la trémie a les siennes */
  const tremie = sy.type === 'escalier', B = tremie ? [0.5, 10, 0.5, 5] : [0.1, 5, 0.05, 5];
  const fr = v => String(v).replace('.', ','), std = TAILLES_SYM[sy.type], standard = Math.abs(sy.l - std[0]) < 0.001 && Math.abs(sy.w - std[1]) < 0.001;
  editeur.innerHTML = '<b>' + esc(NOMS_SYM[sy.type]) + '</b><p class="note">Glissez-le sur le plan pour le déplacer.</p>' +
    '<label>Longueur (m)<input id="syL" inputmode="decimal" value="' + FR3(sy.l) + '"></label><label>' + (tremie ? 'Largeur' : 'Profondeur') + ' (m)<input id="syW" inputmode="decimal" value="' + FR3(sy.w) + '"></label>' +
    (standard ? '' : '<div class="boutons"><button type="button" id="syStd">Taille standard (' + fr(std[0]) + ' × ' + fr(std[1]) + ' m)</button></div>') +
    '<div class="boutons"><button type="button" id="syTourner">⟳ Tourner d’un quart</button></div>' +
    '<div class="boutons"><button type="button" id="edOk">OK</button><button type="button" id="edAnnuler">Fermer</button></div><div class="boutons"><button type="button" id="sySup" class="danger">Retirer</button></div>';
  editeur.hidden = false; placerEditeur(x, y);
  const modifier = (f, texte) => { const avant = JSON.stringify(donneesCourantes); f(sy.src); reanalyser(avant, null, texte); };
  $('syTourner').onclick = () => { fermerEditeur(); modifier(q => { q.rot = ((q.rot || 0) + 90) % 360; }, NOMS_SYM[sy.type] + ' tourné.'); };
  $('edOk').onclick = () => {
    const L = num($('syL').value), W = num($('syW').value);
    if (!(L >= B[0] && L <= B[1]) || !(W >= B[2] && W <= B[3])) { message(NOMS_SYM[sy.type] + ' : longueur ' + fr(B[0]) + ' à ' + fr(B[1]) + ' m, ' + (tremie ? 'largeur' : 'profondeur') + ' ' + fr(B[2]) + ' à ' + fr(B[3]) + ' m.', 'err'); return; }
    fermerEditeur();
    if (Math.abs(L - sy.l) < 0.0005 && Math.abs(W - sy.w) < 0.0005) return;   // rien de changé : pas d'étape d'annulation inutile
    modifier(q => { q.l = arr3(L); q.w = arr3(W); }, NOMS_SYM[sy.type] + ' : ' + FR3(L) + ' × ' + FR3(W) + ' m.');
  };
  if ($('syStd')) $('syStd').onclick = () => { fermerEditeur(); modifier(q => { q.l = std[0]; q.w = std[1]; }, NOMS_SYM[sy.type] + ' : taille standard.'); };
  $('edAnnuler').onclick = fermerEditeur;
  $('sySup').onclick = () => { fermerEditeur(); const avant = JSON.stringify(donneesCourantes), arr = donneesCourantes.symboles; arr.splice(arr.indexOf(sy.src), 1); reanalyser(avant, null, NOMS_SYM[sy.type] + ' retiré.'); };
}
function dialogAjouterSymbole() {
  if (!modele) return;
  if (typeof etageCourant !== 'number') { message('Choisissez d\'abord un étage (onglets au-dessus du plan) pour y poser un symbole.', 'warn'); return; }
  const k = Math.min(etageCourant, modele.etages.length - 1);
  ouvrirModal('Ajouter un symbole', '<label>Symbole<select id="syType">' + Object.keys(NOMS_SYM).map(t => '<option value="' + t + '">' + esc(NOMS_SYM[t]) + '</option>').join('') + '</select></label>' +
    '<p class="note">Il se pose au centre de l’étage ; glissez-le ensuite à sa place, touchez-le pour le tourner, régler sa taille ou le retirer.</p>', 'Ajouter', () => {
    const t = $('syType').value, rs = modele.rooms.filter(r => r.etage === k), pts = rs.flatMap(r => r.src.points || []);
    const cx = pts.length ? (Math.min(...pts.map(q => q[0])) + Math.max(...pts.map(q => q[0]))) / 2 : 0, cy = pts.length ? (Math.min(...pts.map(q => q[1])) + Math.max(...pts.map(q => q[1]))) / 2 : 0;
    const avant = JSON.stringify(donneesCourantes);
    if (!Array.isArray(donneesCourantes.symboles)) donneesCourantes.symboles = [];
    donneesCourantes.symboles.push({ id: 's' + Date.now().toString(36), type: t, etage: k, x: arr3(cx), y: arr3(cy), rot: 0, l: TAILLES_SYM[t][0], w: TAILLES_SYM[t][1] });
    reanalyser(avant, null, NOMS_SYM[t] + ' ajouté : glissez-le à sa place.');
  });
}
$('btnAjSym').addEventListener('click', dialogAjouterSymbole);
/* ---- plusieurs scans, pièce par pièce (assemblage.js) ----
   « ＋ Scan » pose le scan d'une autre pièce à droite du plan ; « 🔗 Relier »
   : on touche un mur, puis le mur de l'autre scan qui le touche. Le second
   scan tourne et glisse pour que les deux murs n'en fassent qu'un ; un
   décalage le long du mur se règle avant de valider. Tout s'annule (↶). */
function majBarreLiaison() {
  $('barreLiaison').hidden = !liaison; $('btnRelier').classList.toggle('actif', !!liaison);
  if (liaison) $('texteLiaison').textContent = liaison.a ? 'Touchez maintenant le mur de l’autre scan qui touche ce mur.' : 'Touchez un mur d’une pièce (le scan déjà en place).';
  cvPlan.style.cursor = liaison ? 'pointer' : 'grab'; dessiner2D();
}
function murSous(x, y) {
  if (!modele || typeof etageCourant !== 'number') return null;
  const rooms = modele.rooms.filter(r => r.etage === etageNum());
  const m = Assemblage.murProche(rooms, pxVersPlan(x, y), 16 / transformationEcran().s);
  return m ? { piece: m.piece, mur: m.mur, id: idPiece(m.piece), scan: Assemblage.groupeScan(m.piece.src) } : null;
}
function demarrerLiaison(texte) {
  if (!modele) return;
  if (typeof etageCourant !== 'number') { message('Choisissez d\'abord un étage (onglets au-dessus du plan) pour relier deux scans.', 'warn'); return; }
  if (Assemblage.scans(donneesCourantes).length < 2) { message('Il n\'y a qu\'un scan dans ce relevé. Ajoutez d\'abord le scan d\'une autre pièce (« ＋ Scan »), puis reliez-les.', 'warn'); return; }
  trace = null; majBarreTrace(); fermerEditeur();
  liaison = { a: null }; majBarreLiaison(); if (texte) message(texte, 'ok');
}
function pointLiaison(x, y) {
  const m = murSous(x, y);
  if (!m) { message('Touchez un mur, au plus près de son trait.', 'warn'); return; }
  if (!liaison.a) { liaison.a = m; majBarreLiaison(); return; }
  if (m.scan === liaison.a.scan) { message('Ce mur est du même scan que le premier : touchez un mur de l\'autre scan (la pièce à rapprocher).', 'warn'); return; }
  const a = liaison.a; liaison = null; majBarreLiaison();
  dialogLiaison({ piece: a.id, mur: a.mur, nom: a.piece.nom }, { piece: m.id, mur: m.mur, nom: m.piece.nom });
}
function dialogLiaison(a, b) {
  const avant = JSON.stringify(donneesCourantes);
  let res = null;
  const calculer = dec => {
    try { res = Assemblage.relierMurs(JSON.parse(avant), a, b, dec); } catch (e) { return e.message; }
    donneesCourantes = res.donnees; resoudreMesures(donneesCourantes); ajusterOuvertures(donneesCourantes); modele = analyser(donneesCourantes); dessiner2D();
    const t = $('lzInfo'); if (t) t.textContent = 'Murs : ' + FR(res.longueurA) + ' m et ' + FR(res.longueurB) + ' m · en commun : ' + FR(res.recouvrement) + ' m' + (res.rotationDeg ? ' · scan tourné de ' + res.rotationDeg + '°' : '') + (res.avertissements.length ? '\n' + res.avertissements.join('\n') : '');
    return null;
  };
  const err = calculer(0);
  if (err) { donneesCourantes = JSON.parse(avant); modele = analyser(donneesCourantes); dessiner2D(); message(err, 'warn'); return; }
  const LA = res.longueurA, LB = res.longueurB;
  ouvrirModal('Relier « ' + b.nom + ' » à « ' + a.nom + ' »',
    '<p class="note">Le second scan est maintenant collé au mur choisi. Réglez sa position le long du mur, au mètre si besoin.</p>' +
    '<div class="rangLz"><button type="button" data-lz="debut">Aligner les débuts</button> <button type="button" data-lz="centre">Centrer</button> <button type="button" data-lz="fin">Aligner les fins</button></div>' +
    '<label>Décalage le long du mur (m)<input id="lzDec" inputmode="decimal" value="0,000"></label>' +
    '<div class="rangLz"><button type="button" data-pas="-0.1">◀ 10 cm</button> <button type="button" data-pas="-0.01">◀ 1 cm</button> <button type="button" data-pas="0.01">1 cm ▶</button> <button type="button" data-pas="0.1">10 cm ▶</button></div>' +
    '<p class="note" id="lzInfo" style="white-space:pre-line"></p>', 'Relier', () => {
      const dec = num($('lzDec').value); if (!isFinite(dec)) return 'Décalage : un nombre en mètres (par exemple 0,25 ou -0,4).';
      const e = calculer(dec); if (e) return e;
      if (res.recouvrement < 0.05) return 'Les deux murs ne se touchent plus : réduisez le décalage.';
      const r = res;
      reanalyser(avant, null, 'Scans reliés : « ' + b.nom + ' » contre « ' + a.nom + ' » (' + FR(r.recouvrement) + ' m de mur commun).' + (r.avertissements.length ? ' ' + r.avertissements.join(' ') : ''));
    });
  $('modal').classList.add('basEcran'); calculer(0);
  const champ = $('lzDec'), appliquer = v => { champ.value = FR3(v); const e = calculer(v); if (e) { $('modalErr').textContent = e; $('modalErr').hidden = false; } else $('modalErr').hidden = true; };
  champ.addEventListener('input', () => { const v = num(champ.value); if (isFinite(v)) appliquer(v); });
  $('modalCorps').querySelectorAll('[data-pas]').forEach(btn => btn.addEventListener('click', () => appliquer(Math.round(((num(champ.value) || 0) + +btn.dataset.pas) * 1000) / 1000)));
  const prereglage = { debut: (LB - LA) / 2, centre: 0, fin: (LA - LB) / 2 };
  $('modalCorps').querySelectorAll('[data-lz]').forEach(btn => btn.addEventListener('click', () => appliquer(Math.round(prereglage[btn.dataset.lz] * 1000) / 1000)));
  /* « Annuler » : le plan revient tel qu'il était, rien n'entre dans l'historique */
  $('modalAnnuler').onclick = () => { fermerModal(); donneesCourantes = JSON.parse(avant); modele = analyser(donneesCourantes); dessiner2D(); message('Liaison annulée : le plan n\'a pas changé.', 'ok'); };
}
function ajouterScanTexte(texte, nom) {
  if (!modele) { chargerTexte(texte, nom); return; }
  if (typeof etageCourant !== 'number') { message('Choisissez d\'abord un étage (onglets au-dessus du plan) pour y ajouter un scan.', 'warn'); return; }
  let conv;
  try {
    let data; try { data = JSON.parse(texte); } catch (e) { throw new Error('Ce fichier n\'est pas un JSON valide : ' + e.message); }
    if (estRoomPlan(data)) conv = convertirRoomPlan(data).donnees;
    else if (data && Array.isArray(data.pieces)) conv = data;
    else throw new Error('Ce fichier n\'est ni un scan OpenPlan 3D ni un relevé.');
  } catch (e) { message(e.message, 'err'); return; }
  const avant = JSON.stringify(donneesCourantes), nomScan = String(nom || 'scan').replace(/\.json$/i, '');
  let r; try { r = Assemblage.ajouterScan(donneesCourantes, conv, { etage: etageNum(), nom: nomScan }); } catch (e) { message(e.message, 'err'); return; }
  donneesCourantes = r.donnees; vue.k = 1; vue.tx = 0; vue.ty = 0;
  if (reanalyser(avant, null, 'Scan « ' + nomScan + ' » ajouté à droite du plan : ' + r.pieces + ' pièce(s).'))
    demarrerLiaison('Scan « ' + nomScan + ' » ajouté à droite du plan (' + r.pieces + ' pièce(s)). Reliez-le : touchez un mur du plan, puis le mur du nouveau scan qui le touche.');
}
$('fichierScan').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) f.text().then(t => ajouterScanTexte(t, f.name)); });
$('btnRelier').addEventListener('click', () => { if (liaison) { liaison = null; majBarreLiaison(); } else demarrerLiaison(); });
$('btnAnnulerLiaison').addEventListener('click', () => { liaison = null; majBarreLiaison(); });

$('btnAnnulerTrace').addEventListener('click', () => { trace = null; majBarreTrace(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape' && trace) { trace = null; majBarreTrace(); } });
$('recap').addEventListener('change', e => {
  const el = e.target; if (!modele || el.tagName !== 'INPUT') return;
  if (el.classList.contains('cloLong')) { const c = modele.cloisons[+el.dataset.ci]; modifierCloison(+el.dataset.ci, num(el.value), c.ep); }
  else if (el.classList.contains('cloEp')) { const c = modele.cloisons[+el.dataset.ci]; modifierCloison(+el.dataset.ci, c.len, num(el.value)); }
  else if (el.classList.contains('epMur')) { const v = num(el.value); if (v > 0 && v <= 2) appliquerEpaisseurMur(+el.dataset.i, +el.dataset.e, v); else { message('Épaisseur incorrecte (0 à 2 m).', 'err'); remplirTableaux(modele); } }
});
$('recap').addEventListener('click', e => { const b = e.target.closest('.supClo'); if (b && modele) supprimerCloison(+b.dataset.ci); });
$('btnEpDef').addEventListener('click', () => {
  if (!modele) return; const v = num($('epDef').value), avant = JSON.stringify(donneesCourantes);
  if (!(v >= 0.03 && v <= 1)) { message('Épaisseur par défaut : entre 0,03 et 1 m (par exemple 0,20).', 'err'); return; }
  donneesCourantes.epaisseurMur = v; reanalyser(avant, null, 'Épaisseur par défaut des murs : ' + FR3(v) + ' m (les murs réglés individuellement gardent la leur).');
});

function dialogAjoutPiece() {
  if (!modele) return;
  if (typeof etageCourant !== 'number') { message('Choisissez d\'abord un étage (onglets au-dessus du plan) pour y ajouter une pièce.', 'warn'); return; }
  const cand = []; modele.rooms.forEach((r, ri) => r.edges.forEach(e => { if (r.etage === etageNum() && e.wall.rooms.length === 1 && e.len >= 0.3) cand.push({ ri, ei: e.i, len: e.len, lib: r.nom + ' – mur n°' + e.i + ' (' + FR(e.len) + ' m)' }); }));
  const h0 = modele.rooms[0].hauteur;
  ouvrirModal('Ajouter une pièce', '<label>Nom<input id="apNom" value="Agrandissement"></label>' +
    '<label>Accolée à<select id="apOu"><option value="">Aucune (pièce séparée, posée à droite du plan)</option>' + cand.map((c, k) => '<option value="' + k + '">' + esc(c.lib) + '</option>').join('') + '</select></label>' +
    champNum('apL', 'Largeur le long du mur (m)', 3) + champNum('apP', 'Profondeur (m)', 3) + champNum('apD', 'Décalage depuis le début du mur (m)', 0) + champNum('apH', 'Hauteur sous plafond (m)', h0) +
    '<label>Couleur des murs de cette pièce <input id="apC" type="color" value="#d93025"></label>' +
    '<p class="note">Seuls les murs extérieurs sont proposés. Les dimensions se corrigent ensuite en touchant les cotes sur le plan.</p>', 'Ajouter',
    () => {
      const g = id => num($(id).value), nom = $('apNom').value.trim(), L = g('apL'), D = g('apP'), dec = g('apD'), H = g('apH'), k = $('apOu').value, c = k === '' ? null : cand[+k];
      if (!nom) return 'Donnez un nom à la pièce.';
      if (!(L >= 0.3 && L <= 50) || !(D >= 0.3 && D <= 50)) return 'La largeur et la profondeur doivent être comprises entre 0,3 et 50 m.';
      if (!(H >= 1 && H <= 8)) return 'La hauteur sous plafond doit être comprise entre 1 et 8 m.';
      if (c && (!(dec >= 0) || dec + L > c.len + 0.005)) return 'La pièce dépasse du mur (longueur du mur : ' + FR3(c.len) + ' m). Réduisez la largeur ou le décalage.';
      const avant = JSON.stringify(donneesCourantes);
      const av = creerPiece({ nom, largeur: L, profondeur: D, accole: c ? { ri: c.ri, ei: c.ei } : null, decalage: c ? dec : 0, hauteur: H, couleurMur: $('apC').value });
      reanalyser(avant, null, 'Pièce « ' + nom + ' » ajoutée' + av + '.');
    });
  const sel = $('apOu'); sel.addEventListener('change', () => { const c = sel.value === '' ? null : cand[+sel.value]; if (c) { $('apL').value = FR3(c.len); $('apD').value = FR3(0); } });
}
function supprimerPiece(ri) {
  const r = modele.rooms[ri]; if (!r || !r.src.ajoutee) return;
  ouvrirModal('Supprimer la pièce ?', '<p>La pièce « ' + esc(r.nom) + ' » et ses ouvertures seront supprimées du relevé.</p>', 'Supprimer', () => {
    const avant = JSON.stringify(donneesCourantes), d = donneesCourantes, id = String(r.id), nom = String(r.nom);
    if (typeof supprimerPhotosPiece === 'function') supprimerPhotosPiece(r.src);
    d.pieces.splice(d.pieces.indexOf(r.src), 1);
    d.ouvertures = (d.ouvertures || []).filter(o => String(o.piece) !== id && String(o.piece) !== nom);
    reanalyser(avant, null, 'Pièce « ' + nom + ' » supprimée.');
  });
}
function dialogAjoutOuverture(pre) {
  if (!modele) return;
  if (typeof etageCourant !== 'number') { message('Choisissez d\'abord un étage (onglets au-dessus du plan) pour y ajouter une ouverture.', 'warn'); return; }
  const eds = []; modele.rooms.forEach((r, ri) => r.edges.forEach(e => { if (r.etage === etageNum() && e.len >= 0.3) eds.push({ ri, ei: e.i, len: e.len, lib: r.nom + ' – mur n°' + e.i + ' (' + FR(e.len) + ' m)' }); }));
  let ks = pre ? eds.findIndex(q => q.ri === pre.ri && q.ei === pre.ei) : 0; if (ks < 0) ks = 0;
  const DEF = { fenetre: [1.2, 1.25, 0.9], porte: [0.9, 2.04, 0], passage: [0.9, 2.04, 0] };
  ouvrirModal(pre && pre.demol ? 'Démolir une partie du mur' : 'Ajouter une ouverture', (pre && pre.demol ? '<p class="note">La partie démolie devient une ouverture sans porte (passage) de la largeur et à la position choisies.</p>' : '') + '<label>Type<select id="aoT"><option value="fenetre">Fenêtre</option><option value="porte">Porte</option><option value="passage">Passage (sans porte)</option></select></label>' +
    '<label>Sur le mur<select id="aoM">' + eds.map((q, k) => '<option value="' + k + '"' + (k === ks ? ' selected' : '') + '>' + esc(q.lib) + '</option>').join('') + '</select></label>' +
    champNum('aoL', 'Largeur (m)', DEF.fenetre[0]) + champNum('aoH', 'Hauteur (m)', DEF.fenetre[1]) + champNum('aoA', 'Allège : hauteur du bas (m)', DEF.fenetre[2]) + champNum('aoP', 'Position depuis le début du mur (m)', 0), 'Ajouter',
    () => {
      const g = id => num($(id).value), q = eds[+$('aoM').value], t = $('aoT').value, L = g('aoL'), H = g('aoH'), A = g('aoA'), P = g('aoP');
      if (!(L > 0.1 && L <= 20) || !(H > 0.1 && H <= 8)) return 'Largeur et hauteur : valeurs incorrectes.';
      if (!(A >= 0 && A <= 8) || !(P >= 0)) return 'Allège ou position incorrecte.';
      if (P + L > q.len + 0.005) return 'L\'ouverture dépasse du mur (longueur : ' + FR3(q.len) + ' m).';
      const avant = JSON.stringify(donneesCourantes), r = modele.rooms[q.ri];
      donneesCourantes.ouvertures = donneesCourantes.ouvertures || [];
      donneesCourantes.ouvertures.push({ type: t, piece: idPiece(r), mur: q.ei, position: arr3(P), largeur: arr3(L), hauteur: arr3(H), allege: arr3(A) });
      reanalyser(avant, null, NOM_TYPE[t] + ' ajoutée sur « ' + r.nom + ' », mur n°' + q.ei + '.');
    });
  const maj = () => { const q = eds[+$('aoM').value], d = DEF[$('aoT').value]; $('aoL').value = FR3(Math.min(d[0], q.len)); $('aoH').value = FR3(d[1]); $('aoA').value = FR3(d[2]); $('aoP').value = FR3(Math.max(0, (q.len - num($('aoL').value)) / 2)); };
  $('aoT').addEventListener('change', maj); $('aoM').addEventListener('change', maj);
  if (pre && pre.type) $('aoT').value = pre.type; maj();
  if (pre && pre.demol) { const q = eds[+$('aoM').value], l = Math.min(2, q.len * 0.6); $('aoL').value = FR3(l); $('aoP').value = FR3(Math.max(0, (q.len - l) / 2)); }
}
function supprimerOuverture(oi) {
  const op = modele.openings[oi]; if (!op) return;
  ouvrirModal('Supprimer l\'ouverture ?', '<p>' + esc(NOM_TYPE[op.type]) + ' n°' + (oi + 1) + ' de « ' + esc(op.room.nom) + ' » sera retirée du relevé.</p>', 'Supprimer', () => {
    const avant = JSON.stringify(donneesCourantes), arr = donneesCourantes.ouvertures, i = arr.indexOf(op.src);
    if (i >= 0) arr.splice(i, 1); reanalyser(avant, null, NOM_TYPE[op.type] + ' supprimée.');
  });
}
function revenir(sens) {
  const pile = sens < 0 ? histo : refaire, autre = sens < 0 ? refaire : histo; if (!pile.length || !modele) return;
  const courant = JSON.stringify(donneesCourantes), cible = pile.pop();
  try { donneesCourantes = JSON.parse(cible); modele = analyser(donneesCourantes); } catch (e) { pile.push(cible); donneesCourantes = JSON.parse(courant); modele = analyser(donneesCourantes); message('Impossible de revenir en arrière : ' + e.message, 'err'); return; }
  autre.push(courant); majBoutonsHisto(); fermerEditeur();
  $('sousTitre').textContent = modele.projet + ' – ' + modele.rooms.length + ' pièce(s), ' + FR(modele.totalAire) + ' m²';
  remplirTableaux(modele); remplirNotes(modele); remplirLegende(); $('angleRot').value = modele.rotation || 0; dessiner2D(); v3d.construire(modele, true);
  message((sens < 0 ? 'Dernière modification annulée.' : 'Modification rétablie.') + ' Surface totale : ' + FR(modele.totalAire) + ' m².', 'ok'); planifierSauvegarde();
}
$('btnAjPiece').addEventListener('click', dialogAjoutPiece);
$('btnAjOuv').addEventListener('click', () => dialogAjoutOuverture(null));
$('btnAnnuler').addEventListener('click', () => revenir(-1));
$('btnRefaire').addEventListener('click', () => revenir(1));
window.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return;
  e.preventDefault(); revenir(e.shiftKey ? 1 : -1);
});

function fixerRotation(a) {
  if (!modele) return;
  a = ((Math.round(a * 10) / 10) % 360 + 360) % 360;
  donneesCourantes.affichage = Object.assign({}, donneesCourantes.affichage, { rotation: a }); modele.rotation = a; $('angleRot').value = a;
  vue.k = 1; vue.tx = 0; vue.ty = 0; fermerEditeur(); dessiner2D(); planifierSauvegarde();
}
$('btnRotG').addEventListener('click', () => fixerRotation((modele ? modele.rotation : 0) - 90));
$('btnRotD').addEventListener('click', () => fixerRotation((modele ? modele.rotation : 0) + 90));
$('chkOuv').addEventListener('change', e => { modeOuv = e.target.checked; survol = null; try { localStorage.setItem('releve-ouv', modeOuv ? '1' : '0'); } catch (err) { /* sans conséquence */ } dessiner2D(); });
$('chkAjuster').addEventListener('change', e => {
  modeAjuster = e.target.checked; survol = null; try { localStorage.setItem('releve-ajuster', modeAjuster ? '1' : '0'); } catch (err) { /* sans conséquence */ }
  message(modeAjuster ? 'Mode « ajuster les murs » activé : tirer le bout d\'une flèche (rond bleu) change la longueur du mur. Glisser la flèche ailleurs la déplace seulement.' : 'Mode « ajuster les murs » désactivé : glisser une flèche la déplace sans toucher au mur.', 'ok'); dessiner2D();
});
$('chkReperes').addEventListener('change', e => { if (!modele) return; donneesCourantes.affichage = Object.assign({}, donneesCourantes.affichage, { reperes: e.target.checked }); modele.reperes = e.target.checked; dessiner2D(); planifierSauvegarde(); });
$('angleRot').addEventListener('change', e => { const v = num(e.target.value); fixerRotation(isFinite(v) ? v : 0); });

function remplirLegende() {
  const L = (donneesCourantes && donneesCourantes.legende) || [];
  $('editLegende').innerHTML = L.map((l, i) => '<div class="ligLeg"><input type="color" data-i="' + i + '" value="' + (colOK(l.couleur) || '#666666') + '" aria-label="Couleur"><input type="text" data-i="' + i + '" value="' + esc(l.texte) + '" placeholder="Ex. : Existant, Agrandissement…" aria-label="Texte de la légende"><button type="button" class="supLeg" data-i="' + i + '" title="Retirer">✕</button></div>').join('');
}
function majLegende() { modele.legende = (donneesCourantes.legende || []).map(l => ({ couleur: colOK(l.couleur) || '#666666', texte: String(l.texte || '') })); dessiner2D(); planifierSauvegarde(); }
$('editLegende').addEventListener('input', e => { const i = +e.target.dataset.i, l = donneesCourantes.legende[i]; if (!l) return; if (e.target.type === 'color') l.couleur = e.target.value; else l.texte = e.target.value; majLegende(); });
$('editLegende').addEventListener('click', e => { const b = e.target.closest('.supLeg'); if (!b) return; donneesCourantes.legende.splice(+b.dataset.i, 1); remplirLegende(); majLegende(); });
$('btnAjLeg').addEventListener('click', () => {
  if (!modele) return; donneesCourantes.legende = donneesCourantes.legende || [];
  if (donneesCourantes.legende.length >= 8) { message('La légende est limitée à 8 lignes.', 'warn'); return; }
  donneesCourantes.legende.push({ couleur: ['#c0392b', '#1f6feb', '#15803d', '#b45309'][donneesCourantes.legende.length % 4], texte: '' }); remplirLegende(); majLegende();
});

const recentrer = () => { vue.k = 1; vue.tx = 0; vue.ty = 0; fermerEditeur(); dessiner2D(); };
cvPlan.addEventListener('dblclick', e => {
  if (modele) {
    const [x, y] = posPlan(e), c = cibleEn(x, y, false);
    if (c && c.type !== 'ouv') { const ed = areteDe(c); if (ed && ed.reglage) { ed.reglage = null; memoriserReglage(c); dessiner2D(); message('Flèche remise à sa place d\'origine.', 'ok'); return; } }
  }
  recentrer();
});
$('btnRecentrer').addEventListener('click', recentrer);
new ResizeObserver(dessiner2D).observe(cvPlan);

$('btnIso').addEventListener('click', () => v3d.vueIso());
$('btnDessus').addEventListener('click', () => v3d.vueDessus());
$('chkTransp').addEventListener('change', e => v3d.transparence(e.target.checked));

$('btnEnregistrer').addEventListener('click', async () => {
  if (!donneesCourantes) return;
  const nom = convertiJson ? 'releve-converti.json' : 'releve-modifie.json';
  try { if (await sauvegarder(new Blob([JSON.stringify(donneesAvecImages(), null, 2)], { type: 'application/json' }), nom)) message('Relevé enregistré : ' + nom, 'ok'); }
  catch (e) {
    if (e.code === 'public') {                          /* repli : copier le relevé dans le presse-papiers pour le coller dans Notes ou Fichiers */
      try { await navigator.clipboard.writeText(JSON.stringify(donneesCourantes, null, 2)); message('Enregistrement de fichier indisponible avec un lien public. Le relevé a été COPIÉ : collez-le dans l\'app Notes pour le garder. Pour enregistrer un vrai fichier, ouvrez la page connecté à votre compte Claude.', 'warn'); return; } catch (e2) { /* copie refusée */ }
    }
    message('Erreur : ' + e.message, 'err');
  }
});

/* ==========================================================================
   4 bis) EXPORT DXF (AutoCAD, SketchUp, ArchiCAD… : DXF R12, en centimètres)
   Le plan est dessiné par le même code que l'écran et le PDF (dessinerPlan),
   avec un « pinceau » qui écrit des entités DXF rangées par calques. Seuls
   les murs sont écrits à part : de vrais rectangles à leur épaisseur, coupés
   aux portes et fenêtres (à l'écran, l'ouverture est « gommée » en blanc, ce
   qui n'existe pas en DAO). Plusieurs étages : l'un sous l'autre.
   ========================================================================== */
const CALQUES_DXF = [['MURS', 7], ['CLOISONS', 7], ['PIECES', 8], ['PORTES', 1], ['FENETRES', 5], ['PASSAGES', 8], ['COTES', 3], ['TEXTES', 7], ['DEMOLITION', 1], ['ESTIME', 30], ['EQUIPEMENTS', 6]];
class PinceauDxf {
  constructor(couleursPieces) { this.e = []; this.pieces = couleursPieces; this.x0 = Infinity; this.y0 = Infinity; this.x1 = -Infinity; this.y1 = -Infinity; }
  calque(col) {
    col = String(col || '').toLowerCase();
    if (col === COUL_TYPE.porte) return 'PORTES'; if (col === COUL_TYPE.fenetre) return 'FENETRES'; if (col === COUL_TYPE.passage) return 'PASSAGES';
    if (/^#(15803d|b45309)$/.test(col)) return 'COTES'; if (col === '#c0392b') return 'DEMOLITION'; if (col === '#8b919b') return 'ESTIME';
    return 'TEXTES';
  }
  pt(x, y) { const X = Math.round(x * 100) / 100, Y = Math.round(-y * 100) / 100; this.x0 = Math.min(this.x0, X); this.x1 = Math.max(this.x1, X); this.y0 = Math.min(this.y0, Y); this.y1 = Math.max(this.y1, Y); return [X, Y]; }
  ligne(cal, a, b) { const A = this.pt(a[0], a[1]), B = this.pt(b[0], b[1]); this.e.push(['LINE', 8, cal, 10, A[0], 20, A[1], 30, 0, 11, B[0], 21, B[1], 31, 0]); }
  plein(cal, q) {                                  /* SOLID : coins dans l'ordre 1, 2, 4, 3 (règle du DXF) */
    const P = q.map(v => this.pt(v[0], v[1])), c = [P[0], P[1], P[3] || P[2], P[2]];
    this.e.push(['SOLID', 8, cal, ...c.flatMap((v, i) => [10 + i, v[0], 20 + i, v[1], 30 + i, 0])]);
  }
  contour(cal, pts, ferme) {
    const L = ['POLYLINE', 8, cal, 66, 1, 10, 0, 20, 0, 30, 0, 70, ferme ? 1 : 0];
    pts.forEach(v => { const P = this.pt(v[0], v[1]); L.push(0, 'VERTEX', 8, cal, 10, P[0], 20, P[1], 30, 0); });
    L.push(0, 'SEQEND', 8, cal); this.e.push(L);
  }
  mesure(s, size) { return String(s).length * size * 0.56; }
  line(x1, y1, x2, y2, o) {
    if (o.cap === 'square') return;                 /* murs et cloisons : écrits à part, à leur épaisseur */
    this.ligne(o.calque || this.calque(o.color), [x1, y1], [x2, y2]);
  }
  poly(pts, o) {
    if (pts.length < 2) return;
    const f = String(o.fill || '').toLowerCase();
    if (o.calque === 'EQUIPEMENTS') return o.fill && !o.stroke ? this.plein('EQUIPEMENTS', pts.length <= 4 ? pts : pts.slice(0, 4)) : this.contour('EQUIPEMENTS', pts, o.close !== false);   /* symboles : leur trait */
    if (f === '#ffffff' && !o.stroke) return;       /* « gomme » d'une ouverture */
    if (o.fill && this.pieces.has(f)) return this.contour('PIECES', pts, true);
    if (o.fill && !o.stroke && pts.length <= 4) return this.plein(o.calque || this.calque(o.fill), pts);   /* pointes de flèches */
    if (o.fill && o.stroke && f === '#ffffff') return;                                      /* cartouches (toitures) */
    this.contour(o.calque || this.calque(o.stroke || o.fill), pts, o.close !== false);
  }
  text(s, x, y, o) {
    const P = this.pt(x, y), h = Math.round((o.size || 11) * 0.7 * 100) / 100;
    this.e.push(['TEXT', 8, o.calque || this.calque(o.color), 10, P[0], 20, P[1], 30, 0, 40, h, 1, versCp1252(s).replace(/[\r\n]/g, ' '), 72, 1, 73, 2, 11, P[0], 21, P[1], 31, 0]);
  }
  image() { /* pas d'image en DXF */ }
  texte() {
    const g = (c, v) => c + '\r\n' + (typeof v === 'number' ? String(v) : v) + '\r\n';
    const ent = this.e.map(L => g(0, L[0]) + L.slice(1).reduce((t, v, i, a) => i % 2 ? t : t + g(v, a[i + 1]), '')).join('');
    const x0 = isFinite(this.x0) ? this.x0 : 0, y0 = isFinite(this.y0) ? this.y0 : 0, x1 = isFinite(this.x1) ? this.x1 : 1, y1 = isFinite(this.y1) ? this.y1 : 1;
    return g(0, 'SECTION') + g(2, 'HEADER') + g(9, '$ACADVER') + g(1, 'AC1009') + g(9, '$DWGCODEPAGE') + g(3, 'ANSI_1252') + g(9, '$INSUNITS') + g(70, 5) +
      g(9, '$EXTMIN') + g(10, x0) + g(20, y0) + g(30, 0) + g(9, '$EXTMAX') + g(10, x1) + g(20, y1) + g(30, 0) + g(0, 'ENDSEC') +
      g(0, 'SECTION') + g(2, 'TABLES') + g(0, 'TABLE') + g(2, 'LTYPE') + g(70, 1) + g(0, 'LTYPE') + g(2, 'CONTINUOUS') + g(70, 0) + g(3, 'Trait continu') + g(72, 65) + g(73, 0) + g(40, '0.0') + g(0, 'ENDTAB') +
      g(0, 'TABLE') + g(2, 'LAYER') + g(70, CALQUES_DXF.length) + CALQUES_DXF.map(([n, c]) => g(0, 'LAYER') + g(2, n) + g(70, 0) + g(62, c) + g(6, 'CONTINUOUS')).join('') + g(0, 'ENDTAB') + g(0, 'ENDSEC') +
      g(0, 'SECTION') + g(2, 'ENTITIES') + ent + g(0, 'ENDSEC') + g(0, 'EOF');
  }
}
/* murs pleins (épaisseur réelle), coupés aux ouvertures ; T en unités DXF par mètre */
function mursDxf(b, M, T) {
  const P = q => [T.ox + q[0] * T.s, T.oy + q[1] * T.s];
  const rect = (a, u, t0, t1, ep, cal) => {
    const n = [-u[1], u[0]], h = ep / 2, A = [a[0] + u[0] * t0, a[1] + u[1] * t0], B = [a[0] + u[0] * t1, a[1] + u[1] * t1];
    const q = [[A[0] + n[0] * h, A[1] + n[1] * h], [B[0] + n[0] * h, B[1] + n[1] * h], [B[0] - n[0] * h, B[1] - n[1] * h], [A[0] - n[0] * h, A[1] - n[1] * h]].map(P);
    b.plein(cal, q); b.contour(cal, q, true);
  };
  M.walls.forEach(w => {
    const ep = w.ep || M.ep;
    if (w.demoli || w.estime) { b.ligne(w.demoli ? 'DEMOLITION' : 'ESTIME', P(w.a), P(w.b)); return; }
    const trous = w.openings.map(op => [Math.max(0, op.pos), Math.min(w.len, op.pos + op.w)]).filter(t => t[1] > t[0]).sort((x, y) => x[0] - y[0]);
    let cur = -ep / 2;                               /* le mur déborde d'une demi-épaisseur à chaque bout (coins fermés) */
    trous.forEach(t => { if (t[0] - cur > 0.005) rect(w.a, w.u, cur, t[0], ep, 'MURS'); cur = Math.max(cur, t[1]); });
    if (w.len + ep / 2 - cur > 0.005) rect(w.a, w.u, cur, w.len + ep / 2, ep, 'MURS');
  });
  (M.cloisons || []).forEach(c => rect(c.a, c.u, 0, c.len, c.ep, 'CLOISONS'));
}
function construireDxf(M) {
  const Mp = tourner(M, M.rotation), s = 100;        /* 1 unité = 1 cm */
  const bh = Mp.bbox.y1 - Mp.bbox.y0 || 1, ecart = Math.ceil(bh * s + 300);
  const b = new PinceauDxf(new Set(M.rooms.map(r => String(r.color || '').toLowerCase())));
  M.etages.forEach((et, k) => {
    const T = { s, ox: -Mp.bbox.x0 * s, oy: k * ecart - Mp.bbox.y0 * s }, V = vueEtage(Mp, k);
    if (M.etages.length > 1) b.text(et.nom, 0, T.oy - 80, { size: 30, bold: true, color: '#1d2430' });
    mursDxf(b, V, T);
    dessinerPlan(b, V, T, { fs: 16 });
  });
  return new Blob([Uint8Array.from(b.texte(), c => c.charCodeAt(0) & 255)], { type: 'application/dxf' });
}
$('btnDxf').addEventListener('click', async () => {
  if (!modele) return;
  try {
    const nom = (sansAccent(nomFichier).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'releve') + '.dxf';
    if (await sauvegarder(construireDxf(modele), nom)) message('Plan DXF généré (centimètres, un calque par type : murs, portes, fenêtres, cotes, pièces) : ' + nom, 'ok');
  } catch (e) { message(e.code === 'public' ? 'Le DXF est prêt mais ne peut pas être enregistré avec un lien public : ' + e.message : 'Erreur pendant la création du DXF : ' + e.message, e.code === 'public' ? 'warn' : 'err'); if (e.code !== 'public') console.error(e); }
});

$('btnPdf').addEventListener('click', async () => {
  if (!modele) return;
  try {
    const blob = construirePdf(modele, v3d);
    const nom = (sansAccent(nomFichier).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'releve') + '.pdf';
    if (await sauvegarder(blob, nom)) message('PDF généré : ' + nom, 'ok');
  } catch (e) { message(e.code === 'public' ? 'Le PDF est prêt mais ne peut pas être enregistré avec un lien public : ' + e.message : 'Erreur pendant la création du PDF : ' + e.message, e.code === 'public' ? 'warn' : 'err'); if (e.code !== 'public') console.error(e); }
});

/* ==========================================================================
   (Héritage de la page publiée dans Claude : sauvegarde « compte » et versions, inactives ici ;
   le relevé est enregistré par la visite, voir le pont plus haut.)
   Chaque relevé est un document dans l'espace privé de l'utilisateur (data/users/<id>/).
   ========================================================================== */
/* ==========================================================================
   Pont avec la page de la visite (releve/app.js), qui ouvre ce moteur dans un
   cadre : elle envoie le scan ou le relevé à ouvrir (« releve:charger ») ; le
   moteur lui renvoie le relevé à chaque modification (« releve:enregistrer »),
   avec les seules photos nouvelles. C'est la visite qui garde tout (appareil
   d'abord, puis serveur) : rien n'est enregistré ailleurs. Messages acceptés
   seulement du même site et de la fenêtre parente.
   ========================================================================== */
const pont = { actif: window.parent !== window, timer: null, envoyees: new Set() };
function versVisite(msg) { if (pont.actif) window.parent.postMessage(msg, location.origin); }
function planifierEnvoiVisite() {
  if (!donneesCourantes || !modele) return;
  clearTimeout(pont.timer); etatSauv('Enregistrement dans la visite…');
  pont.timer = setTimeout(envoyerVisite, 600);
}
const arr2 = v => Math.round((+v || 0) * 100) / 100;
/* l'image du plan coté (chaque étage, l'un sous l'autre), pour le dossier
   client : dessinée hors écran avec le même pinceau que le plan à l'écran.
   Envoyée seulement à la fermeture du plan (« releve:vider »), pas à
   chaque retouche : la visite ne la garde que si elle a changé. */
function imagePlan() {
  try {
    const Mp = tourner(modele, modele.rotation), marge = 60;
    const bw = Mp.bbox.x1 - Mp.bbox.x0 || 1, bh = Mp.bbox.y1 - Mp.bbox.y0 || 1;
    /* cadré sur le plan : au plus 1400 px de large et 1000 px de haut par étage */
    const s = Math.min((1400 - 2 * marge) / bw, 1000 / bh, 110), L = Math.max(700, Math.ceil(bw * s + 2 * marge));
    const hEt = Math.ceil(bh * s + 2 * marge + 30), n = Math.max(1, modele.etages.length);
    const cv = document.createElement('canvas'); cv.width = L; cv.height = Math.min(hEt * n, 6000);
    const c = cv.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, cv.width, cv.height);
    modele.etages.forEach((et, k) => {
      const oy = k * hEt, T = { s, ox: L / 2 - (Mp.bbox.x0 + bw / 2) * s, oy: oy + 30 + marge - Mp.bbox.y0 * s };
      if (n > 1) { c.font = 'bold 22px Helvetica, Arial, sans-serif'; c.fillStyle = '#1d2430'; c.fillText(et.nom, 20, oy + 28); }
      const fant = k > 0 ? Mp.rooms.filter(r => r.etage === k - 1).map(r => r.pts) : null;
      dessinerPlan(new PinceauEcran(c), vueEtage(Mp, k), T, { fs: 14, fantome: fant, echelle: { x: 20, y: oy + hEt - 16 } });
    });
    return cv.toDataURL('image/jpeg', 0.88);
  } catch (e) { return null; }       /* pas d'image : le dossier s'en passe */
}
function envoyerVisite(avecImage) {
  pont.timer = null;
  if (!donneesCourantes || !modele) return;
  const releve = JSON.parse(JSON.stringify(donneesCourantes)), images = {};
  [...(releve.pieces || []).flatMap(q => q.photos || []), ...(releve.documents || [])]
    .forEach(ph => { if (photosMem.has(ph.id) && !pont.envoyees.has(ph.id)) images[ph.id] = photosMem.get(ph.id); });
  versVisite({ type: 'releve:enregistrer', releve, images, imagePlan: avecImage ? imagePlan() : null,
    resume: { projet: modele.projet, pieces: modele.rooms.length, surface: Math.round(modele.totalAire * 100) / 100, ouvertures: modele.openings.length,
      /* les quantités de chaque pièce, pour la fourchette de prix de la visite
         (releve/budget.js) : calculées ici, là où le plan est analysé */
      detail: modele.rooms.map(r => ({ id: r.id, nom: r.nom, etage: r.etage, sol: arr2(r.aire), perimetre: arr2(r.perim),
        hauteur: arr2(r.hauteur), murs: arr2(r.mursNets), portes: r.portes || 0, fenetres: r.fenetres || 0 })) } });
}
window.addEventListener('message', e => {
  if (!pont.actif || e.source !== window.parent || e.origin !== location.origin) return;
  const m = e.data || {};
  if (m.type === 'releve:enregistre') {
    (m.images || []).forEach(id => pont.envoyees.add(id));
    etatSauv('Enregistré dans la visite à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '.');
  } else if (m.type === 'releve:charger' && typeof m.texte === 'string') {
    pont.envoyees = new Set(Object.keys(m.images || {}));
    let texte = m.texte;
    if (m.images && Object.keys(m.images).length) { try { const d = JSON.parse(texte); d.imagesEmbarquees = m.images; texte = JSON.stringify(d); } catch (err) { /* le message d'erreur vient de chargerTexte */ } }
    chargerTexte(texte, m.nom || 'releve', { reprise: !!m.reprise });
  } else if (m.type === 'releve:image') {
    /* la visite demande l'image du plan (avant / après) : le dessin du moment, cotes comprises */
    versVisite({ type: 'releve:imagePlan', image: modele ? imagePlan() : null });
  } else if (m.type === 'releve:vider') {
    /* la visite va fermer le plan : la dernière modification part tout de suite, avec l'image du plan */
    if (pont.timer) { clearTimeout(pont.timer); pont.timer = null; }
    envoyerVisite(true);
    versVisite({ type: 'releve:vide' });
  }
});
/* page fermée d'un coup (application quittée) : ce qui attendait part quand même */
window.addEventListener('pagehide', () => { if (pont.timer) { clearTimeout(pont.timer); pont.timer = null; envoyerVisite(); } });

let dbCol = null, rid = null, majConnue = 0, timerSauv = null, sauvEnCours = false, sale = false, conflit = false, autoSauv = true, listeReleves = [], confirmSup = null;
try { autoSauv = localStorage.getItem('releve-auto') !== '0'; } catch (e) { /* stockage indisponible : sauvegarde automatique par défaut */ }
const nouvelId = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const etatSauv = t => { $('etatSauv').textContent = t; };
const heureFR = ms => new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/* le compte Claude n'existe pas ici : la visite enregistre le relevé (pont ci-dessus) */
async function initCompte() { /* rien à faire */ }
function afficherListe() {
  const L = $('listeReleves');
  if (!listeReleves.length) { L.innerHTML = '<p class="note">Aucun relevé enregistré pour l\'instant. Ouvrez un scan ou un fichier JSON : il sera sauvegardé automatiquement.</p>'; return; }
  const groupes = new Map(); listeReleves.forEach(r => { const f = r.fam || r.id; if (!groupes.has(f)) groupes.set(f, []); groupes.get(f).push(r); });
  const ordre = [...groupes.values()].sort((a, b) => Math.max(...b.map(x => x.maj)) - Math.max(...a.map(x => x.maj)));
  L.innerHTML = ordre.map(g => { g.sort((a, b) => b.maj - a.maj);
    return '<div class="groupe"><div class="groupeTitre">' + esc(g[0].nom || 'Relevé') + (g.length > 1 ? ' <small>' + g.length + ' versions</small> <button type="button" class="cmp btnPetit" data-fam="' + esc(g[0].fam || g[0].id) + '">Comparer deux versions</button>' : '') + '</div>' +
      g.map(r => '<div class="ligneReleve' + (r.id === rid ? ' courant' : '') + '"><div><b>' + esc(r.ver || (g.length > 1 ? 'Version initiale' : 'Version unique')) + '</b>' + (r.id === rid ? ' <span class="badge">ouvert</span>' : '') +
        '<br><small>' + esc(heureFR(r.maj)) + ' · ' + esc(r.nb) + ' pièce(s) · ' + esc(String(r.surface).replace('.', ',')) + ' m²</small></div>' +
        '<div class="actions"><button type="button" class="repr" data-id="' + esc(r.id) + '">Reprendre</button><button type="button" class="supr" data-id="' + esc(r.id) + '">Supprimer</button></div></div>').join('') + '</div>'; }).join('');
}
/* ---- comparaison de deux versions d'un même projet ---- */
const libOuv = (t, n) => ({ porte: ['porte', 'portes'], fenetre: ['fenêtre', 'fenêtres'], passage: ['passage', 'passages'] }[t][n > 1 ? 1 : 0]);
const signe2 = n => (n > 0.005 ? '+' : n < -0.005 ? '−' : '') + FR(Math.abs(n));
const compteOuv = r => { const c = { porte: 0, fenetre: 0, passage: 0 }; r.edges.forEach(e => e.wall.openings.forEach(op => { c[op.type]++; })); return c; };
function comparerVersions(MA, MB) {
  const A = new Map(MA.rooms.map(r => [r.id, r])), B = new Map(MB.rooms.map(r => [r.id, r])), ids = [...new Set([...MB.rooms.map(r => r.id), ...MA.rooms.map(r => r.id)])];
  const statuts = new Map(), lignes = [], diffs = [];
  ids.forEach(id => {
    const a = A.get(id), b = B.get(id); let st;
    if (!a) st = 'ajoutée'; else if (!b) st = 'supprimée';
    else {
      const ca = compteOuv(a), cb = compteOuv(b), geo = a.pts.length !== b.pts.length || a.pts.some((q, i) => Math.hypot(q[0] - b.pts[i][0], q[1] - b.pts[i][1]) > 0.003);
      st = (geo || Math.abs(a.aire - b.aire) > 0.005 || Math.abs(a.hauteur - b.hauteur) > 0.005 || a.nom !== b.nom || ['porte', 'fenetre', 'passage'].some(t => ca[t] !== cb[t])) ? 'modifiée' : 'inchangée';
      ['porte', 'fenetre', 'passage'].forEach(t => { const d = cb[t] - ca[t]; if (d) diffs.push((b.nom) + ' : ' + (d > 0 ? '+' : '−') + Math.abs(d) + ' ' + libOuv(t, Math.abs(d))); });
      if (a.nom !== b.nom) diffs.push('Pièce renommée : « ' + a.nom + ' » devient « ' + b.nom + ' »');
    }
    statuts.set(id, st);
    if (st === 'ajoutée') diffs.push('Pièce ajoutée : ' + b.nom + ' (' + FR(b.aire) + ' m²)');
    if (st === 'supprimée') diffs.push('Pièce supprimée : ' + a.nom + ' (' + FR(a.aire) + ' m²)');
    lignes.push({ id, st, nomA: a ? a.nom : '', nomB: b ? b.nom : '', aireA: a ? a.aire : null, aireB: b ? b.aire : null, hA: a ? a.hauteur : null, hB: b ? b.hauteur : null,
      ouvA: a ? a.portes + a.fenetres + a.passages : null, ouvB: b ? b.portes + b.fenetres + b.passages : null });
  });
  const tot = M => ({ aire: M.totalAire, volume: M.totalVolume, murs: M.rooms.reduce((x, r) => x + r.mursNets, 0), portes: M.openings.filter(o => o.type === 'porte').length, fenetres: M.openings.filter(o => o.type === 'fenetre').length, passages: M.openings.filter(o => o.type === 'passage').length, pieces: M.rooms.length });
  const dem = M => new Map(M.rooms.flatMap(r => r.edges.filter(e => e.demoli).map(e => [r.id + '#' + e.i, r.nom + ' – mur ' + e.lettre + ' (' + FR(e.len) + ' m)'])));
  const dA = dem(MA), dB = dem(MB); dB.forEach((v, k) => { if (!dA.has(k)) diffs.push('Mur à démolir : ' + v); }); dA.forEach((v, k) => { if (!dB.has(k)) diffs.push('Démolition retirée : ' + v); });
  const nA = (MA.cloisons || []).length, nB = (MB.cloisons || []).length;
  if (nB !== nA) diffs.push(nB > nA ? 'Murs ajoutés : ' + (nB - nA) + ' (' + MB.cloisons.slice(nA).map(c => FR(c.len) + ' m').join(', ') + ')' : 'Murs supprimés : ' + (nA - nB));
  return { lignes, statuts, diffs, A: tot(MA), B: tot(MB) };
}
const COUL_STATUT = { 'ajoutée': '#1b8a3c', 'supprimée': '#c0392b', 'modifiée': '#b45309', 'inchangée': '#667085' };
function dessinerComparaison(b, box, MA, MB, statuts) {
  const rot = MB.rotation || 0, TA = tourner(MA, rot), TB = tourner(MB, rot), fs = box.fs || 11, marge = 28, legH = 22;
  const pts = []; TA.rooms.concat(TB.rooms).forEach(r => r.pts.forEach(q => pts.push(q)));
  const x0 = Math.min(...pts.map(q => q[0])), x1 = Math.max(...pts.map(q => q[0])), y0 = Math.min(...pts.map(q => q[1])), y1 = Math.max(...pts.map(q => q[1]));
  const sc = Math.min((box.w - 2 * marge) / Math.max(x1 - x0, 0.1), (box.h - 2 * marge - legH) / Math.max(y1 - y0, 0.1));
  const ox = box.x + (box.w - (x1 - x0) * sc) / 2 - x0 * sc, oy = box.y + marge + ((box.h - 2 * marge - legH) - (y1 - y0) * sc) / 2 - y0 * sc, P = q => [ox + q[0] * sc, oy + q[1] * sc];
  const fond = { 'ajoutée': '#c9efd3', 'modifiée': '#ffe7c2', 'inchangée': '#eef1f5' };
  const Bm = new Map(TB.rooms.map(r => [r.id, r]));
  TB.rooms.forEach(r => b.poly(r.pts.map(P), { fill: fond[statuts.get(r.id)] || '#eef1f5', stroke: '#1f6feb', w: 2 }));
  TA.rooms.forEach(r => { if (!Bm.has(r.id)) b.poly(r.pts.map(P), { fill: '#f6cfcf', stroke: '#c0392b', w: 1.6, dash: [5, 3] }); else b.poly(r.pts.map(P), { stroke: '#7b8190', w: 1.3, dash: [4, 3] }); });
  const Am = new Map(TA.rooms.map(r => [r.id, r]));
  TB.rooms.concat(TA.rooms.filter(r => !Bm.has(r.id))).forEach(r => {
    const c = P(r.centre), a = Am.get(r.id), bb = Bm.get(r.id), aireB = bb ? bb.aire : 0, aireA = a ? a.aire : 0;
    b.text(r.nom, c[0], c[1] - fs * 0.5, { size: fs, bold: true, color: '#1d2430' });
    b.text((bb ? FR(aireB) : FR(aireA)) + ' m²' + (a && bb && Math.abs(aireB - aireA) > 0.005 ? ' (' + signe2(aireB - aireA) + ')' : ''), c[0], c[1] + fs * 0.9, { size: fs - 1, color: COUL_STATUT[statuts.get(r.id)] });
  });
  const ly = box.y + box.h - 8; let lx = box.x + 8;
  [['#c9efd3', '#1f6feb', 'ajoutée'], ['#ffe7c2', '#1f6feb', 'modifiée'], ['#eef1f5', '#1f6feb', 'inchangée'], ['#f6cfcf', '#c0392b', 'supprimée']].forEach(([f, st, lib]) => {
    b.poly([[lx, ly - 9], [lx + 14, ly - 9], [lx + 14, ly + 1], [lx, ly + 1]], { fill: f, stroke: st, w: 1 }); b.text(lib, lx + 19, ly - 4, { size: fs - 1, align: 'left', color: '#444c59' }); lx += b.mesure(lib, fs - 1, false) + 40;
  });
  b.line(lx, ly - 4, lx + 22, ly - 4, { w: 1.3, color: '#7b8190', dash: [4, 3] }); b.text('contour de la version de départ', lx + 28, ly - 4, { size: fs - 1, align: 'left', color: '#444c59' });
}
let comparaisonCourante = null;
function dialogComparer(fam) {
  const items = listeReleves.filter(r => (r.fam || r.id) === fam).sort((a, b) => a.maj - b.maj); if (items.length < 2) return;
  const lib = r => (r.ver || 'Version initiale') + ' (' + heureFR(r.maj) + ')' + (r.id === rid ? ' – ouverte' : '');
  const opts = (sel) => items.map((r, k) => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(lib(r)) + '</option>').join('');
  ouvrirModal('Comparer deux versions', '<label>Version de départ (avant)<select id="cpA">' + opts(items.length - 2) + '</select></label><label>Version à comparer (après)<select id="cpB">' + opts(items.length - 1) + '</select></label>', 'Comparer', () => {
    const a = items[+$('cpA').value], b = items[+$('cpB').value]; if (a.id === b.id) return 'Choisissez deux versions différentes.';
    afficherComparaison(a, b);
  });
}
function afficherComparaison(a, b) {
  const donnees = r => r.id === rid && donneesCourantes ? donneesCourantes : JSON.parse(r.json);
  let MA, MB; try { MA = analyser(donnees(a)); MB = analyser(donnees(b)); } catch (e) { message('Comparaison impossible : ' + e.message, 'err'); return; }
  montrerComparaison(MA, MB, a.ver || 'Version initiale', b.ver || 'Version initiale');
}
function montrerComparaison(MA, MB, nomA, nomB) {
  const c = comparerVersions(MA, MB); comparaisonCourante = { MA, MB, c, nomA, nomB, projet: MB.projet };
  const carte = (t, v, d) => '<div class="carte"><small>' + esc(t) + '</small><b>' + esc(v) + '</b><span>' + esc(d) + '</span></div>';
  const T = c.A, U = c.B, dOuv = (U.portes + U.fenetres + U.passages) - (T.portes + T.fenetres + T.passages);
  $('contenuComp').innerHTML = '<div class="cartes">' + carte('Surface totale', FR(U.aire) + ' m²', signe2(U.aire - T.aire) + ' m² (avant : ' + FR(T.aire) + ' m²)') +
    carte('Pièces', String(U.pieces), (U.pieces - T.pieces >= 0 ? '+' : '−') + Math.abs(U.pieces - T.pieces) + ' (avant : ' + T.pieces + ')') +
    carte('Volume', FR(U.volume) + ' m³', signe2(U.volume - T.volume) + ' m³') + carte('Murs nets', FR(U.murs) + ' m²', signe2(U.murs - T.murs) + ' m²') +
    carte('Ouvertures', String(U.portes + U.fenetres + U.passages), (dOuv >= 0 ? '+' : '−') + Math.abs(dOuv) + ' (' + U.portes + ' portes, ' + U.fenetres + ' fenêtres, ' + U.passages + ' passages)') + '</div>' +
    '<canvas id="cvComp" aria-label="Plan comparatif"></canvas>' +
    '<table>' + ths('Pièce', 'État', 'Surface avant (m²)', 'Surface après (m²)', 'Écart (m²)', 'Hauteur avant → après (m)', 'Ouvertures avant → après') +
    c.lignes.map(l => '<tr><td>' + esc(l.nomB || l.nomA) + '</td><td style="color:' + COUL_STATUT[l.st] + ';font-weight:600">' + l.st + '</td><td>' + (l.aireA == null ? '—' : FR(l.aireA)) + '</td><td>' + (l.aireB == null ? '—' : FR(l.aireB)) + '</td><td>' +
      (l.aireA == null ? '+' + FR(l.aireB) : l.aireB == null ? '−' + FR(l.aireA) : signe2(l.aireB - l.aireA)) + '</td><td>' + (l.hA == null ? '—' : FR(l.hA)) + ' → ' + (l.hB == null ? '—' : FR(l.hB)) + '</td><td>' + (l.ouvA == null ? '—' : l.ouvA) + ' → ' + (l.ouvB == null ? '—' : l.ouvB) + '</td></tr>').join('') + '</table>' +
    (c.diffs.length ? '<h3>Détail des changements</h3><ul class="difs">' + c.diffs.map(d => '<li>' + esc(d) + '</li>').join('') + '</ul>' : '<p class="note">Aucune différence entre ces deux versions.</p>');
  $('titreComp').textContent = 'Comparaison : « ' + comparaisonCourante.nomA + ' » → « ' + comparaisonCourante.nomB + ' »';
  $('comparaison').hidden = false; dessinerCompEcran(); $('comparaison').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function dessinerCompEcran() {
  const cv = $('cvComp'); if (!cv || !comparaisonCourante) return; const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = Math.max(260, Math.min(420, Math.round(W * 0.6)));
  cv.style.height = H + 'px'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  dessinerComparaison(new PinceauEcran(ctx), { x: 0, y: 0, w: W, h: H, fs: 11 }, comparaisonCourante.MA, comparaisonCourante.MB, comparaisonCourante.c.statuts);
}
window.addEventListener('resize', () => { if (!$('comparaison').hidden) dessinerCompEcran(); });
function pdfComparaison(cc) {
  const W = 842, H = 595, MG = 30, pages = [], { MA, MB, c } = cc;
  const nouvelle = t => { const pg = new PagePdf(W, H); pages.push(pg); pg.text(cc.projet, MG, 32, { size: 15, bold: true, align: 'left', color: '#1d2430' }); pg.text(t, W - MG, 32, { size: 12, align: 'right', color: '#667085' }); pg.line(MG, 44, W - MG, 44, { w: 0.8, color: '#9aa4b2' }); return pg; };
  let pg = nouvelle('Comparaison de versions');
  pg.text('Avant : ' + cc.nomA + '     →     Après : ' + cc.nomB, MG, 60, { size: 11, align: 'left', color: '#444c59' });
  const T = c.A, U = c.B, dOuv = (U.portes + U.fenetres + U.passages) - (T.portes + T.fenetres + T.passages);
  pg.text('Surface totale : ' + FR(T.aire) + ' → ' + FR(U.aire) + ' m² (' + signe2(U.aire - T.aire) + ')   ·   Pièces : ' + T.pieces + ' → ' + U.pieces + '   ·   Ouvertures : ' + (T.portes + T.fenetres + T.passages) + ' → ' + (U.portes + U.fenetres + U.passages) + ' (' + (dOuv >= 0 ? '+' : '−') + Math.abs(dOuv) + ')   ·   Volume : ' + signe2(U.volume - T.volume) + ' m³',
    MG, 76, { size: 9.5, align: 'left', color: '#222222' });
  dessinerComparaison(pg, { x: MG, y: 84, w: W - 2 * MG, h: 270, fs: 9 }, MA, MB, c.statuts);
  let y = 370;
  const cols = [{ t: 'Pièce', w: 190, a: 'l' }, { t: 'État', w: 70, a: 'l' }, { t: 'Avant (m²)', w: 80 }, { t: 'Après (m²)', w: 80 }, { t: 'Écart (m²)', w: 80 }, { t: 'Hauteur (m)', w: 120 }, { t: 'Ouvertures', w: 92 }];
  const ligne = (cells, o) => {
    if (y + 17 > H - 40) { pg = nouvelle('Comparaison de versions (suite)'); y = 62; }
    if (o.fond) pg.poly([[MG, y], [W - MG, y], [W - MG, y + 16], [MG, y + 16]], { fill: o.fond });
    let x = MG; cols.forEach((col, i) => { pg.text(String(cells[i]), col.a === 'l' ? x + 5 : x + col.w - 5, y + 8, { size: 9, bold: o.gras, align: col.a === 'l' ? 'left' : 'right', color: o.couleur && i === 1 ? o.couleur : '#222222' }); x += col.w; });
    pg.line(MG, y + 16, W - MG, y + 16, { w: 0.4, color: '#c9d0da' }); y += 16;
  };
  ligne(cols.map(x => x.t), { fond: '#e9eef5', gras: true });
  c.lignes.forEach(l => ligne([l.nomB || l.nomA, l.st, l.aireA == null ? '—' : FR(l.aireA), l.aireB == null ? '—' : FR(l.aireB), l.aireA == null ? '+' + FR(l.aireB) : l.aireB == null ? '−' + FR(l.aireA) : signe2(l.aireB - l.aireA),
    (l.hA == null ? '—' : FR(l.hA)) + ' → ' + (l.hB == null ? '—' : FR(l.hB)), (l.ouvA == null ? '—' : l.ouvA) + ' → ' + (l.ouvB == null ? '—' : l.ouvB)], { couleur: COUL_STATUT[l.st], gras: false }));
  y += 12;
  c.diffs.forEach(d => { if (y + 14 > H - 40) { pg = nouvelle('Comparaison de versions (suite)'); y = 62; } pg.text('•  ' + d, MG + 4, y + 6, { size: 9, align: 'left', color: '#222222' }); y += 13; });
  const dt = new Date().toLocaleDateString('fr-FR'); pages.forEach((q, i) => { q.text('Document généré le ' + dt + ' – outil de relevé (validation)', MG, H - 20, { size: 8, align: 'left', color: '#8a93a1' }); q.text('Page ' + (i + 1) + ' / ' + pages.length, W - MG, H - 20, { size: 8, align: 'right', color: '#8a93a1' }); });
  return assemblerPdf(pages, [], cc.projet + ' - comparaison');
}
$('btnPdfComp').addEventListener('click', async () => {
  if (!comparaisonCourante) return;
  try { const nom = (sansAccent(comparaisonCourante.projet + ' comparaison').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'comparaison') + '.pdf'; if (await sauvegarder(pdfComparaison(comparaisonCourante), nom)) message('PDF de comparaison généré : ' + nom, 'ok'); }
  catch (e) { message(e.code === 'public' ? 'Le PDF est prêt mais ne peut pas être enregistré avec un lien public : ' + e.message : 'Erreur pendant la création du PDF : ' + e.message, e.code === 'public' ? 'warn' : 'err'); }
});
$('btnFermerComp').addEventListener('click', () => { $('comparaison').hidden = true; comparaisonCourante = null; });

/* nouvelle version : une copie du relevé ouvert, rangée avec les autres versions du même projet ; la version actuelle reste intacte */
function dialogVersion() {
  if (!modele || !dbCol) return;
  const fam = donneesCourantes._fam || rid, n = listeReleves.filter(r => (r.fam || r.id) === fam).length;
  ouvrirModal('Nouvelle version du relevé', '<label>Nom de la version<input id="nvNom" value="Version ' + (n + 1) + '"></label>' +
    '<p class="note">Votre relevé actuel est enregistré tel quel, puis une copie s\'ouvre sous ce nom : vos prochaines modifications ne touchent que la copie. Les photos et documents sont copiés. Toutes les versions se retrouvent groupées dans « Mes relevés enregistrés ».</p>', 'Créer la version',
    () => { const nom = $('nvNom').value.trim(); if (!nom) return 'Donnez un nom à la version.'; creerVersion(nom); });
}
async function creerVersion(nomVersion) {
  clearTimeout(timerSauv); etatSauv('Création de la version…');
  await sauvegarderCompte();                                                  /* fige l'état actuel dans la version en cours */
  if (conflit) { etatSauv('Version non créée : résolvez d\'abord le conflit signalé.'); return; }
  const ancien = rid;
  donneesCourantes._fam = donneesCourantes._fam || ancien; donneesCourantes._ver = nomVersion;
  rid = nouvelId(); donneesCourantes._rid = rid; majConnue = 0; conflit = false;
  const ids = [...(donneesCourantes.pieces || []).flatMap(q => q.photos || []), ...(donneesCourantes.documents || [])];
  await Promise.all(ids.filter(x => photosMem.has(x.id)).map(x => enregistrerImageCompte(x.id, x)));
  await sauvegarderCompte(true);
  histo = []; refaire = []; majBoutonsHisto(); afficherListe();
  message('Version « ' + nomVersion + ' » créée. La version précédente reste intacte dans « Mes relevés enregistrés ».', 'ok');
}
function planifierSauvegarde() {
  if (pont.actif) { planifierEnvoiVisite(); return; }
  if (!dbCol || !donneesCourantes || !autoSauv || conflit) return;
  sale = true; clearTimeout(timerSauv); etatSauv('Modifications en attente d\'enregistrement…'); timerSauv = setTimeout(sauvegarderCompte, 1500);
}
async function sauvegarderCompte(force) {
  if (!dbCol || !donneesCourantes || !modele) return;
  if (sauvEnCours) { timerSauv = setTimeout(sauvegarderCompte, 800); return; }
  sauvEnCours = true; sale = false;
  try {
    const doc = dbCol.doc(rid);
    if (force !== true && majConnue) {                                     /* un autre appareil a-t-il enregistré une version plus récente ? */
      const snap = await doc.get();
      if (snap.exists && snap.data().maj > majConnue) {
        conflit = true; $('btnForcer').hidden = false; etatSauv('Sauvegarde suspendue : version plus récente trouvée.');
        message('Ce relevé a été modifié sur un autre appareil depuis que vous l\'avez ouvert. La sauvegarde automatique est suspendue pour ne pas écraser cette version.\nRouvrez-le depuis « Mes relevés enregistrés » pour reprendre la version la plus récente, ou touchez « Écraser quand même » pour garder celle-ci.', 'warn');
        return;
      }
    }
    const json = JSON.stringify(donneesCourantes);
    if (json.length > 240000) { etatSauv('Relevé trop volumineux pour la sauvegarde automatique : utilisez « Enregistrer le relevé ».'); return; }
    const maj = Date.now();
    await doc.set({ nom: modele.projet, fam: donneesCourantes._fam || rid, ver: donneesCourantes._ver || '', maj, surface: Math.round(modele.totalAire * 100) / 100, nb: modele.rooms.length, json });
    majConnue = maj; conflit = false; $('btnForcer').hidden = true; etatSauv('Sauvegardé dans votre compte à ' + new Date(maj).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '.');
  } catch (e) { etatSauv('Sauvegarde impossible (' + ((e && e.code) || 'erreur') + ').'); }
  finally { sauvEnCours = false; if (sale && !conflit) planifierSauvegarde(); }
}
$('btnVersion').addEventListener('click', dialogVersion);
$('btnForcer').addEventListener('click', () => { conflit = false; sauvegarderCompte(true); });
$('chkAuto').addEventListener('change', e => {
  autoSauv = e.target.checked; try { localStorage.setItem('releve-auto', autoSauv ? '1' : '0'); } catch (err) { /* sans conséquence */ }
  etatSauv(autoSauv ? 'Sauvegarde automatique activée.' : 'Sauvegarde automatique désactivée.'); if (autoSauv) planifierSauvegarde();
});
$('listeReleves').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b || !dbCol) return;
  if (b.classList.contains('cmp')) { dialogComparer(b.dataset.fam); return; }
  const item = listeReleves.find(r => r.id === b.dataset.id); if (!item) return;
  if (b.classList.contains('repr')) {
    clearTimeout(timerSauv); sale = false;
    chargerTexte(item.json, item.nom || 'releve', { reprise: true, maj: item.maj });
    rid = item.id; if (donneesCourantes) donneesCourantes._rid = rid; afficherListe(); etatSauv('Relevé repris depuis votre compte.'); chargerImagesCompte();
  } else if (b.classList.contains('supr')) {
    if (confirmSup !== item.id) { confirmSup = item.id; b.textContent = 'Confirmer ?'; b.classList.add('alerte'); setTimeout(() => { if (confirmSup === item.id) { confirmSup = null; b.textContent = 'Supprimer'; b.classList.remove('alerte'); } }, 4000); return; }
    confirmSup = null;
    try { const imgs = await dbCol.doc(item.id).collection('images').get(); await Promise.all(imgs.docs.map(d => dbCol.doc(item.id).collection('images').doc(d.id).delete())); } catch (err) { /* pas d'images ou accès refusé : on continue */ }
    try { await dbCol.doc(item.id).delete(); if (item.id === rid) { rid = nouvelId(); if (donneesCourantes) donneesCourantes._rid = rid; majConnue = 0; etatSauv('Relevé supprimé du compte. Vos prochaines modifications créeront une nouvelle copie.'); } else etatSauv('Relevé supprimé de votre compte.'); }
    catch (err) { etatSauv('Suppression impossible (' + ((err && err.code) || 'erreur') + ').'); }
  }
});
initCompte();

/* pour les tests automatiques */
/* la visite peut envoyer le relevé à ouvrir */
versVisite({ type: 'releve:pret' });

window.__releve = { v3d: () => v3d, pont: () => pont, doublons: () => doublonsPortesCoin(donneesCourantes), planVersPx: q => planVersPx(q), ouvzones: () => ouvZonesPlan, comparaison: () => comparaisonCourante, photos: photosMem, chargerTexte, analyser, zones: () => zonesPlan, poignees: () => poigneesPlan, lignes: () => lignesPlan, vue: () => vue, donnees: () => donneesCourantes };

