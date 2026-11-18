'use strict';
/* ==========================================================================
   Assemblage de plusieurs scans — pièce par pièce

   OpenPlan 3D scanne souvent une pièce (ou quelques pièces) à la fois : chaque
   scan a son propre repère. On les rassemble en deux gestes :
   1. « Ajouter un scan » : le scan converti est posé à droite du plan, ses
      pièces marquées de leur numéro de scan (p.scan) ;
   2. « Relier deux murs » : on touche un mur d'une pièce, puis le mur de
      l'autre scan qui lui fait face (la cloison commune). Tout le second
      scan tourne (par quarts de tour, les scans étant déjà d'équerre) et
      glisse pour que les deux murs se superposent, pièces de part et d'autre.
      Un décalage le long du mur règle la position ; les murs sont coupés aux
      bouts de l'autre pour devenir un seul mur commun.

   Tout se calcule sur les points du scan (pointsScan) : ce sont eux que le
   moteur reprend à chaque recalcul des mesures (moteur.js, resoudreMesures).
   Un déplacement d'ensemble ne change aucune longueur : les mesures saisies
   restent valables, sauf sur un mur coupé (signalé).

   Fonctions pures : elles travaillent sur une copie et la rendent. Aucune
   dépendance au navigateur (tests : tests/t_releve_assemblage.js).
   ========================================================================== */
(function (racine) {
  const arr3 = v => Math.round(v * 1000) / 1000;
  const copie = o => JSON.parse(JSON.stringify(o));
  const ptsDe = p => (Array.isArray(p.pointsScan) && p.pointsScan.length === (p.points || []).length ? p.pointsScan : p.points);
  const groupe = p => (Number.isInteger(p.scan) && p.scan > 0 ? p.scan : 1);
  const aireSignee = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const cleId = p => String(p.id !== undefined ? p.id : p.nom);
  const trouver = (d, id) => (d.pieces || []).find(p => cleId(p) === String(id) || String(p.nom) === String(id));

  /* les scans du relevé : numéro, nom, pièces */
  function scans(d) {
    const m = new Map();
    (d.pieces || []).forEach(p => { const g = groupe(p); if (!m.has(g)) m.set(g, { n: g, pieces: [] }); m.get(g).pieces.push(p); });
    const noms = (d.scans || []).reduce((o, s) => (o[s.n] = s.nom, o), {});
    return [...m.values()].sort((a, b) => a.n - b.n).map(s => Object.assign(s, { nom: noms[s.n] || (s.n === 1 ? 'Scan 1' : 'Scan ' + s.n) }));
  }

  /* ---------- 1. ajouter un scan converti, posé à droite du plan ---------- */
  function ajouterScan(d0, nouveau, opt) {
    const o = Object.assign({ etage: 0, nom: '', ecart: 1 }, opt || {});
    if (!nouveau || !Array.isArray(nouveau.pieces) || !nouveau.pieces.length) throw new Error('Ce scan ne contient aucune pièce.');
    const d = copie(d0), nv = copie(nouveau);
    d.pieces = d.pieces || []; d.ouvertures = d.ouvertures || [];
    const n = Math.max(1, ...d.pieces.map(groupe)) + 1;
    if (!d.scans) d.scans = [{ n: 1, nom: d.projet || 'Scan 1' }];
    d.scans.push({ n, nom: o.nom || 'Scan ' + n });
    /* comme le moteur (preparerDonnees) : chaque pièce garde ses points du scan */
    d.pieces.forEach(p => { if (!Number.isInteger(p.scan)) p.scan = groupe(p); if (!Array.isArray(p.pointsScan) && Array.isArray(p.points)) p.pointsScan = p.points.map(q => [q[0], q[1]]); });

    /* identifiants préfixés (les deux scans numérotent leurs pièces pareil) ;
       un nom déjà pris reçoit un numéro (« Chambre 2 »), pour s'y retrouver */
    const ids = new Set(d.pieces.map(cleId)), noms = new Set(d.pieces.map(p => String(p.nom)));
    const nouveauxIds = new Map();
    nv.pieces.forEach(p => {
      let id = 's' + n + '-' + cleId(p); while (ids.has(id)) id += '_';
      ids.add(id); nouveauxIds.set(cleId(p), id); nouveauxIds.set(String(p.nom), id);
      /* « Pièce 1 » déjà pris : « Pièce 2 » (pas « Pièce 1 2 ») ; « Séjour » : « Séjour 2 » */
      let nom = String(p.nom || 'Pièce');
      const num = nom.match(/^(.*\S)\s+(\d+)$/), base = num ? num[1] : nom; let k = num ? +num[2] + 1 : 2;
      while (noms.has(nom)) nom = base + ' ' + (k++);
      noms.add(nom); p.id = id; p.nom = nom; p.scan = n; p.etage = o.etage;
      if (!Array.isArray(p.pointsScan)) p.pointsScan = p.points.map(q => [q[0], q[1]]);
    });

    /* posé à droite des pièces du même étage, aligné en haut */
    const bb = pts => pts.reduce((b, q) => ({ x0: Math.min(b.x0, q[0]), x1: Math.max(b.x1, q[0]), y0: Math.min(b.y0, q[1]), y1: Math.max(b.y1, q[1]) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
    const ici = d.pieces.filter(p => (p.etage || 0) === o.etage);
    const bA = ici.length ? bb([].concat(...ici.map(ptsDe))) : { x1: -o.ecart, y0: 0 };
    const bN = bb([].concat(...nv.pieces.map(ptsDe)));
    const dx = bA.x1 + o.ecart - bN.x0, dy = bA.y0 - bN.y0;
    nv.pieces.forEach(p => {
      p.pointsScan = p.pointsScan.map(q => [arr3(q[0] + dx), arr3(q[1] + dy)]);
      p.points = p.points.map(q => [arr3(q[0] + dx), arr3(q[1] + dy)]);
      d.pieces.push(p);
    });
    (nv.ouvertures || []).forEach(ov => { const id = nouveauxIds.get(String(ov.piece)); if (id) d.ouvertures.push(Object.assign({}, ov, { piece: id })); });
    return { donnees: d, scan: n, pieces: nv.pieces.length };
  }

  /* ---------- couper un mur en morceaux ----------
     Même règle que le moteur (moteur.js, decouperArete, qui l'appelle) : les
     ouvertures passent sur le bon morceau, épaisseur et démolition valent
     pour tous les morceaux, une mesure du mur coupé est retirée (« perdu »). */
  function decouperArete(d, p, ei, coupes, L, insScan) {
    if (!coupes.length) return false;
    const n = p.points.length, a = p.points[ei], b = p.points[(ei + 1) % n], ps = p.pointsScan || p.points, sa = ps[ei], sb = ps[(ei + 1) % n];
    const ordre = coupes.map((c, i) => [c, insScan ? insScan[i] : null]).sort((x, y) => x[0] - y[0]);
    coupes = ordre.map(x => x[0]); const k = coupes.length;
    const ins = coupes.map(c => [arr3(a[0] + (b[0] - a[0]) * c / L), arr3(a[1] + (b[1] - a[1]) * c / L)]);
    const insS = ordre.map(([c, exact]) => exact ? [exact[0], exact[1]] : [arr3(sa[0] + (sb[0] - sa[0]) * c / L), arr3(sa[1] + (sb[1] - sa[1]) * c / L)]);
    const bornes = [0, ...coupes, L], cle = cleId(p);
    (d.ouvertures || []).forEach(o => {
      if (String(o.piece) !== cle && String(o.piece) !== String(p.nom)) return;
      if (o.mur === ei) { let sg = 0; while (sg < k && o.position >= bornes[sg + 1] - 1e-9) sg++; o.mur = ei + sg; o.position = arr3(Math.max(0, o.position - bornes[sg])); }
      else if (o.mur > ei) o.mur += k;
    });
    p.points.splice(ei + 1, 0, ...ins); if (p.pointsScan) p.pointsScan.splice(ei + 1, 0, ...insS);
    let perdu = false;
    const remap = obj => { if (!obj) return obj; const out = {}; Object.keys(obj).forEach(key => { const i = +key; if (i < ei) out[i] = obj[key]; else if (i > ei) out[i + k] = obj[key]; else perdu = true; }); return Object.keys(out).length ? out : undefined; };
    ['epaisseurs', 'demolis', 'reperesMasques'].forEach(c => { if (!p[c]) return; const nn = {}; Object.keys(p[c]).forEach(key => { const i = +key; if (i < ei) nn[i] = p[c][key]; else if (i > ei) nn[i + k] = p[c][key]; else for (let sg = 0; sg <= k; sg++) nn[ei + sg] = p[c][key]; }); p[c] = nn; });
    if (p.notesMurs) { const nn = {}; Object.keys(p.notesMurs).forEach(key => { const i = +key; nn[i < ei ? i : i > ei ? i + k : i] = p.notesMurs[key]; }); p.notesMurs = nn; }
    ['mesuresMurs', 'fixeMur', 'reglagesCotes'].forEach(c => { if (p[c]) { const r = remap(p[c]); if (r) p[c] = r; else delete p[c]; } });
    if (Array.isArray(p.cotesEstimees)) { const ne = []; p.cotesEstimees.forEach(i => { if (i < ei) ne.push(i); else if (i > ei) ne.push(i + k); else for (let sg = 0; sg <= k; sg++) ne.push(ei + sg); }); p.cotesEstimees = ne; }
    return perdu;
  }

  /* ---------- 2. relier deux murs de deux scans ----------
     a, b : { piece, mur } (identifiant de pièce, numéro du mur). Le scan de b
     bouge, celui de a reste en place. `decalage` (m) fait glisser b le long
     du mur de a, depuis la position milieu contre milieu. */
  function relierMurs(d0, a, b, decalage) {
    const d = copie(d0), dec = Number(decalage) || 0;
    const pa = trouver(d, a.piece), pb = trouver(d, b.piece);
    if (!pa || !pb) throw new Error('Pièce introuvable.');
    const ga = groupe(pa), gb = groupe(pb);
    if (ga === gb) throw new Error('Ces deux murs sont du même scan : ses pièces sont déjà placées l\'une par rapport à l\'autre. Touchez un mur d\'un autre scan.');
    const sA = ptsDe(pa), sB = ptsDe(pb), nA = sA.length, nB = sB.length;
    if (!(a.mur >= 0 && a.mur < nA) || !(b.mur >= 0 && b.mur < nB)) throw new Error('Mur introuvable.');
    const A0 = sA[a.mur], A1 = sA[(a.mur + 1) % nA], B0 = sB[b.mur], B1 = sB[(b.mur + 1) % nB];
    const LA = Math.hypot(A1[0] - A0[0], A1[1] - A0[1]), LB = Math.hypot(B1[0] - B0[0], B1[1] - B0[1]);
    if (LA < 0.05 || LB < 0.05) throw new Error('Mur trop court pour relier.');

    /* les pièces doivent finir de part et d'autre du mur : avec deux contours
       tournant dans le même sens, les deux murs se parcourent en sens inverse */
    const memeSens = Math.sign(aireSignee(sA)) === Math.sign(aireSignee(sB));
    const angA = Math.atan2(A1[1] - A0[1], A1[0] - A0[0]);
    const angB = Math.atan2(B1[1] - B0[1], B1[0] - B0[0]) + (memeSens ? Math.PI : 0);
    let th = angA - angB;
    const quart = Math.round(th / (Math.PI / 2)) * Math.PI / 2;
    if (Math.abs(th - quart) < 3 * Math.PI / 180) th = quart;            /* scans d'équerre : quarts de tour exacts */
    const c = Math.cos(th), s = Math.sin(th);
    const rot = q => [q[0] * c - q[1] * s, q[0] * s + q[1] * c];
    const mB = rot([(B0[0] + B1[0]) / 2, (B0[1] + B1[1]) / 2]);
    const ux = (A1[0] - A0[0]) / LA, uy = (A1[1] - A0[1]) / LA;
    const cible = [(A0[0] + A1[0]) / 2 + ux * dec, (A0[1] + A1[1]) / 2 + uy * dec];
    const tx = cible[0] - mB[0], ty = cible[1] - mB[1];
    const bouger = q => { const r = rot(q); return [arr3(r[0] + tx), arr3(r[1] + ty)]; };
    d.pieces.filter(p => groupe(p) === gb).forEach(p => {
      if (Array.isArray(p.pointsScan)) p.pointsScan = p.pointsScan.map(bouger);
      p.points = p.points.map(bouger);
      p.etage = pa.etage || 0;
    });
    (d.cloisons || []).filter(cl => cl.scan === gb).forEach(cl => { cl.a = bouger(cl.a); cl.b = bouger(cl.b); });

    /* un seul mur commun : chaque mur est coupé aux bouts de l'autre */
    const sB2 = ptsDe(pb), C0 = sB2[b.mur], C1 = sB2[(b.mur + 1) % nB];
    const le = (q, P0, ux_, uy_) => (q[0] - P0[0]) * ux_ + (q[1] - P0[1]) * uy_;
    const marge = 0.01;
    const coupesA = [C0, C1].map(q => [le(q, A0, ux, uy), q]).filter(([t]) => t > marge && t < LA - marge);
    const vx = (C1[0] - C0[0]) / LB, vy = (C1[1] - C0[1]) / LB;
    const coupesB = [A0, A1].map(q => [le(q, C0, vx, vy), q]).filter(([t]) => t > marge && t < LB - marge);
    /* recouvrement des deux murs : sinon ils ne se touchent pas (décalage trop grand) */
    const t0 = le(C0, A0, ux, uy), t1 = le(C1, A0, ux, uy), recouvre = Math.min(LA, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1));
    const avert = [];
    if (recouvre < 0.05) avert.push('Les deux murs ne se recouvrent plus : réduisez le décalage.');
    const LAp = Math.hypot(pa.points[(a.mur + 1) % nA][0] - pa.points[a.mur][0], pa.points[(a.mur + 1) % nA][1] - pa.points[a.mur][1]) || LA;
    const LBp = Math.hypot(pb.points[(b.mur + 1) % nB][0] - pb.points[b.mur][0], pb.points[(b.mur + 1) % nB][1] - pb.points[b.mur][1]) || LB;
    if (recouvre >= 0.05) {
      /* les coupes se font sur les points du scan (exacts, repris de l'autre
         mur) ; les points affichés suivent à la même proportion */
      if (decouperArete(d, pa, a.mur, coupesA.map(([t]) => t * LAp / LA), LAp, coupesA.map(([, q]) => q))) avert.push('La mesure saisie sur le mur de « ' + pa.nom + ' » a été retirée : le mur est maintenant coupé en morceaux.');
      if (decouperArete(d, pb, b.mur, coupesB.map(([t]) => t * LBp / LB), LBp, coupesB.map(([, q]) => q))) avert.push('La mesure saisie sur le mur de « ' + pb.nom + ' » a été retirée : le mur est maintenant coupé en morceaux.');
    }
    if (!d.liaisons) d.liaisons = [];
    d.liaisons.push({ a: { piece: cleId(pa), mur: a.mur }, b: { piece: cleId(pb), mur: b.mur }, decalage: dec, scan: gb });
    return { donnees: d, rotationDeg: Math.round(((th * 180 / Math.PI) % 360 + 360) % 360), recouvrement: arr3(Math.max(0, recouvre)), avertissements: avert, longueurA: arr3(LA), longueurB: arr3(LB) };
  }

  /* le mur le plus proche d'un point (pour le toucher sur le plan) */
  function murProche(pieces, q, seuil) {
    let best = null;
    pieces.forEach(p => { const pts = p.pts || p.points, n = pts.length; for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)), dd = Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dy * t);
      if (dd <= seuil && (!best || dd < best.d)) best = { piece: p, mur: i, d: dd };
    } });
    return best;
  }

  const api = { scans, ajouterScan, relierMurs, decouperArete, murProche, groupeScan: groupe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else racine.Assemblage = api;
})(typeof window !== 'undefined' ? window : this);
