'use strict';
/* ==========================================================================
   Convertisseur  Apple RoomPlan (JSON exporté par OpenPlan3D)  ->  format de l'outil

   Principe :
   1. on lit chaque mur (position + longueur) et on redresse le plan (les murs deviennent horizontaux / verticaux) ;
   2. on "dessine" les murs sur une grille fine (2 cm), en fermant les petits trous entre murs ;
   3. les pièces = zones fermées par les murs (remplissage de la grille) ;
   4. on trace le contour de chaque zone, on le simplifie, on aligne les murs communs ;
   5. on rattache portes, fenêtres et passages à leur mur grâce à l'identifiant du parent.
   ========================================================================== */

function estRoomPlan(d) {
  return !!d && typeof d === 'object' && Array.isArray(d.walls) && d.walls.length > 0 &&
    d.walls[0] && Array.isArray(d.walls[0].transform) && d.walls[0].transform.length === 16 && Array.isArray(d.walls[0].dimensions);
}

const NOMS_ZONES = {
  diningRoom: 'Salle à manger', livingRoom: 'Séjour', kitchen: 'Cuisine', bedroom: 'Chambre', bathroom: 'Salle de bain',
  laundryRoom: 'Buanderie', hallway: 'Couloir', office: 'Bureau', toilet: 'WC', garage: 'Garage', stairs: 'Escalier'
};

function convertirRoomPlan(rp, opt) {
  const o = Object.assign({ res: 0.02, extension: 0.04, ecartMax: 0.2, aireMin: 0.8, fusion: 0.06, simpl: 0.04, angleAxe: 4 }, opt || {});
  const avert = [];
  const med = (arr) => { const s = arr.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const r3 = v => Math.round(v * 1000) / 1000;

  /* ---------- 1. murs, redressement ---------- */
  const murs = rp.walls.map(w => {
    const t = w.transform, n = Math.hypot(t[0], t[2]) || 1;
    return { id: w.identifier, cx: t[12], cz: t[14], ux: t[0] / n, uz: t[2] / n, L: w.dimensions[0], h: w.dimensions[1], y: t[13] };
  }).filter(m => m.L > 0.05);
  if (!murs.length) throw new Error('Le scan ne contient aucun mur exploitable.');

  let c4 = 0, s4 = 0;
  murs.forEach(m => { const f = Math.atan2(m.uz, m.ux); c4 += m.L * Math.cos(4 * f); s4 += m.L * Math.sin(4 * f); });
  const th = Math.atan2(s4, c4) / 4, ct = Math.cos(th), st = Math.sin(th);
  const rot = (x, z) => [x * ct + z * st, -x * st + z * ct];
  const seuilAxe = Math.sin(o.angleAxe * Math.PI / 180);

  murs.forEach(m => {
    const c = rot(m.cx, m.cz); let u = rot(m.ux, m.uz);
    if (Math.abs(u[1]) < seuilAxe) u = [Math.sign(u[0]) || 1, 0];
    else if (Math.abs(u[0]) < seuilAxe) u = [0, Math.sign(u[1]) || 1];
    m.c = c; m.u = u;
    m.a = [c[0] - u[0] * m.L / 2, c[1] - u[1] * m.L / 2];
    m.b = [c[0] + u[0] * m.L / 2, c[1] + u[1] * m.L / 2];
  });

  const projSeg = (px, pz, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    let t = l2 ? ((px - a[0]) * dx + (pz - a[1]) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
    const x = a[0] + dx * t, z = a[1] + dz * t;
    return { d: Math.hypot(px - x, pz - z), x, z, t };
  };

  /* ---------- 2. dessin des murs sur la grille ---------- */
  const trait = [];                         /* segments à dessiner */
  murs.forEach(m => {
    const e = o.extension;
    trait.push([[m.a[0] - m.u[0] * e, m.a[1] - m.u[1] * e], [m.b[0] + m.u[0] * e, m.b[1] + m.u[1] * e]]);
  });
  /* ponts : une extrémité de mur qui ne touche aucun autre mur est reliée au mur le plus proche (s'il est à moins de ecartMax) */
  let ponts = 0;
  murs.forEach((m, i) => [m.a, m.b].forEach(pt => {
    let best = null, touche = false;
    murs.forEach((n, j) => {
      if (i === j) return;
      const ext = projSeg(pt[0], pt[1], [n.a[0] - n.u[0] * o.extension, n.a[1] - n.u[1] * o.extension], [n.b[0] + n.u[0] * o.extension, n.b[1] + n.u[1] * o.extension]);
      if (ext.d < 0.01) touche = true;
      const p = projSeg(pt[0], pt[1], n.a, n.b);
      if (!best || p.d < best.d) best = p;
    });
    if (!touche && best && best.d <= o.ecartMax) { trait.push([[pt[0], pt[1]], [best.x, best.z]]); ponts++; }
  }));

  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  trait.forEach(s => s.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }));
  const gx = x0 - 0.5, gz = z0 - 0.5, res = o.res;
  const W = Math.ceil((x1 - x0 + 1) / res) + 1, H = Math.ceil((z1 - z0 + 1) / res) + 1;
  const lab = new Int32Array(W * H);        /* -1 = mur, 0 = à remplir, >0 = n° de zone */
  const cell = (x, z) => [Math.floor((x - gx) / res), Math.floor((z - gz) / res)];
  trait.forEach(s => {
    const len = Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]), n = Math.max(1, Math.ceil(len / (res / 2)));
    for (let k = 0; k <= n; k++) {
      const [i, j] = cell(s[0][0] + (s[1][0] - s[0][0]) * k / n, s[0][1] + (s[1][1] - s[0][1]) * k / n);
      lab[j * W + i] = -1;
    }
  });

  /* ---------- 3. zones fermées (remplissage 4 voisins) ---------- */
  const aires = [0]; let nz = 0;
  const pile = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (lab[s] !== 0) continue;
    nz++; let sp = 0, cnt = 0; pile[sp++] = s; lab[s] = nz;
    while (sp) {
      const p = pile[--sp]; cnt++; const i = p % W, j = (p - i) / W;
      if (i > 0 && lab[p - 1] === 0) { lab[p - 1] = nz; pile[sp++] = p - 1; }
      if (i < W - 1 && lab[p + 1] === 0) { lab[p + 1] = nz; pile[sp++] = p + 1; }
      if (j > 0 && lab[p - W] === 0) { lab[p - W] = nz; pile[sp++] = p - W; }
      if (j < H - 1 && lab[p + W] === 0) { lab[p + W] = nz; pile[sp++] = p + W; }
    }
    aires.push(cnt * res * res);
  }
  const dehors = lab[0];
  const zones = [];
  for (let k = 1; k <= nz; k++) if (k !== dehors && aires[k] >= o.aireMin) zones.push(k);
  const contoursSol = (rp.floors || []).filter(f => Array.isArray(f.polygonCorners) && f.polygonCorners.length >= 4 && Array.isArray(f.transform) && f.transform.length === 16);
  if (!zones.length && !contoursSol.length) throw new Error('Aucune pièce fermée n\'a pu être reconstituée : les murs du scan ne forment pas de contour fermé, et le scan ne contient pas de contour de sol.');
  const modeSol = !zones.length;     /* repli : les murs ne ferment aucune pièce -> on utilise le contour du sol détecté par l'application */

  /* ---------- 4. contours ---------- */
  const fermeture = (k) => {            /* comble les fentes très fines (bouts de murs isolés) : fermeture morphologique de 2 cellules */
    const M = new Uint8Array(W * H); for (let p = 0; p < W * H; p++) M[p] = lab[p] === k ? 1 : 0;
    const dil = (A) => { const B = new Uint8Array(W * H); for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) { const p = j * W + i;
      if (A[p] || A[p - 1] || A[p + 1] || A[p - W] || A[p + W] || A[p - W - 1] || A[p - W + 1] || A[p + W - 1] || A[p + W + 1]) B[p] = 1; } return B; };
    const ero = (A) => { const B = new Uint8Array(W * H); for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) { const p = j * W + i;
      if (A[p] && A[p - 1] && A[p + 1] && A[p - W] && A[p + W] && A[p - W - 1] && A[p - W + 1] && A[p + W - 1] && A[p + W + 1]) B[p] = 1; } return B; };
    let D = M; D = dil(D); D = dil(D); let E = D; E = ero(E); E = ero(E);
    for (let p = 0; p < W * H; p++) if (E[p] && lab[p] === -1) M[p] = 1;      /* on n'ajoute que des cases de mur */
    return M;
  };

  const aireSignee = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const tracer = (M) => {
    const sortant = new Map(); let nb = 0;
    const V = (i, j) => j * (W + 1) + i;
    const ajoute = (a, b) => { if (!sortant.has(a)) sortant.set(a, []); sortant.get(a).push(b); nb++; };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const p = j * W + i; if (!M[p]) continue;
      if (j === 0 || !M[p - W]) ajoute(V(i, j), V(i + 1, j));
      if (i === W - 1 || !M[p + 1]) ajoute(V(i + 1, j), V(i + 1, j + 1));
      if (j === H - 1 || !M[p + W]) ajoute(V(i + 1, j + 1), V(i, j + 1));
      if (i === 0 || !M[p - 1]) ajoute(V(i, j + 1), V(i, j));
    }
    let meilleure = null, meilleureAire = 0;
    for (const [deb, liste] of sortant) {
      while (liste.length) {
        const boucle = []; let cur = deb;
        for (;;) {
          boucle.push(cur); const l = sortant.get(cur);
          if (!l || !l.length) break;
          const nxt = l.pop(); cur = nxt; if (cur === deb) break;
        }
        const pts = boucle.map(v => { const i = v % (W + 1), j = (v - i) / (W + 1); return [gx + i * res, gz + j * res]; });
        const a = Math.abs(aireSignee(pts));
        if (a > meilleureAire) { meilleureAire = a; meilleure = pts; }
      }
    }
    return meilleure;
  };
  const sansAlignes = pts => pts.filter((p, i) => { const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
    return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-9; });
  const rdp = (pts, tol) => {
    if (pts.length < 3) return pts;
    const a = pts[0], b = pts[pts.length - 1]; let dm = -1, im = 0;
    for (let i = 1; i < pts.length - 1; i++) { const d = projSeg(pts[i][0], pts[i][1], a, b).d; if (d > dm) { dm = d; im = i; } }
    if (dm <= tol) return [a, b];
    return rdp(pts.slice(0, im + 1), tol).slice(0, -1).concat(rdp(pts.slice(im), tol));
  };
  const rdpFerme = (pts, tol) => {
    let ik = 0, dm = -1; pts.forEach((p, i) => { const d = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]); if (d > dm) { dm = d; ik = i; } });
    const A = pts.slice(0, ik + 1), B = pts.slice(ik).concat([pts[0]]);
    return rdp(A, tol).slice(0, -1).concat(rdp(B, tol).slice(0, -1));
  };

  let pieces;
  if (modeSol) {
    pieces = contoursSol.map((f, i) => {
      const t = f.transform;
      const brut = f.polygonCorners.map(c => rot(t[0] * c[0] + t[4] * c[1] + t[12], t[2] * c[0] + t[6] * c[1] + t[14]));
      return { k: -(i + 1), pts: rdpFerme(sansAlignes(brut), 0.02), M: null };
    });
    avert.push('Les murs du scan ne ferment pas la pièce (des murs n\'ont pas été reconnus) : le contour vient du sol détecté par l\'application. Les murs et les ouvertures restent à vérifier.');
  } else pieces = zones.map(k => {
    const M = fermeture(k);
    const brut = tracer(M);
    if (!brut) return null;
    let pts = rdpFerme(sansAlignes(brut), o.simpl);
    return { k, pts, M };
  }).filter(Boolean);

  /* alignement : les coordonnées proches (moins de 'fusion') deviennent identiques -> murs communs parfaitement superposés */
  [0, 1].forEach(ax => {
    const refs = []; pieces.forEach(p => p.pts.forEach(pt => refs.push(pt)));
    refs.sort((a, b) => a[ax] - b[ax]);
    let groupe = [];
    const vider = () => { if (!groupe.length) return; const m = groupe.reduce((s, p) => s + p[ax], 0) / groupe.length; groupe.forEach(p => { p[ax] = m; }); groupe = []; };
    refs.forEach(pt => { if (groupe.length && pt[ax] - groupe[groupe.length - 1][ax] > o.fusion) vider(); groupe.push(pt); });
    vider();
  });
  pieces.forEach(p => {
    const sansDoublons = p.pts.filter((q, i) => { const a = p.pts[(i + 1) % p.pts.length]; return Math.hypot(q[0] - a[0], q[1] - a[1]) > 1e-6; });
    p.pts = sansAlignes(sansDoublons).map(q => [r3(q[0]), r3(q[1])]);
  });
  pieces = pieces.filter(p => p.pts.length >= 3 && Math.abs(aireSignee(p.pts)) >= o.aireMin);

  /* les murs communs doivent avoir exactement les mêmes extrémités : on ajoute les points manquants */
  const tousPoints = []; pieces.forEach(p => p.pts.forEach(q => tousPoints.push(q)));
  pieces.forEach(p => {
    const res2 = [];
    for (let i = 0; i < p.pts.length; i++) {
      const a = p.pts[i], b = p.pts[(i + 1) % p.pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      res2.push(a);
      const ins = [];
      tousPoints.forEach(v => {
        if ((v[0] === a[0] && v[1] === a[1]) || (v[0] === b[0] && v[1] === b[1])) return;
        const pr = projSeg(v[0], v[1], a, b);
        if (pr.d < 0.01 && pr.t * L > 0.01 && (1 - pr.t) * L > 0.01) ins.push([pr.t, [v[0], v[1]]]);
      });
      ins.sort((s, t) => s[0] - t[0]).forEach(s => { const last = res2[res2.length - 1]; if (last[0] !== s[1][0] || last[1] !== s[1][1]) res2.push(s[1]); });
    }
    p.pts = res2;
    p.aire = Math.abs(aireSignee(p.pts));
  });

  /* ---------- côtés "estimés" : ceux qui ne longent aucun mur réellement scanné ---------- */
  let nbEstimes = 0;
  pieces.forEach(p => {
    p.estimes = [];
    p.pts.forEach((a, i) => {
      const b = p.pts[(i + 1) % p.pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(L / 0.05));
      let ok = 0;
      for (let k = 0; k <= n; k++) {
        const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n;
        if (murs.some(m => projSeg(x, z, m.a, m.b).d <= 0.12)) ok++;
      }
      if (ok / (n + 1) < 0.5) { p.estimes.push(i); nbEstimes++; }
    });
  });

  /* ---------- noms (zones détectées par l'appli) et hauteurs ---------- */
  const cellLab = (x, z) => {
    const [i, j] = cell(x, z);
    for (let r = 0; r <= 4; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const v = lab[jj * W + ii]; if (v > 0) return v;
    }
    return 0;
  };
  const parK = new Map(pieces.map(p => [p.k, p]));
  const dansPoly = (x, z, poly) => { let dedans = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if ((poly[i][1] > z) !== (poly[j][1] > z) && x < (poly[j][0] - poly[i][0]) * (z - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) dedans = !dedans; } return dedans; };
  (rp.sections || []).forEach(s => {
    const c = rot(s.center[0], s.center[2]), k = modeSol ? 0 : cellLab(c[0], c[1]), p = modeSol ? pieces.find(q => dansPoly(c[0], c[1], q.pts)) : parK.get(k);
    if (!p) { avert.push('La zone « ' + (NOMS_ZONES[s.label] || s.label) + ' » détectée par l\'application n\'est pas dans une pièce fermée.'); return; }
    (p.noms = p.noms || []);
    const nom = NOMS_ZONES[s.label];
    if (nom && !p.noms.includes(nom)) p.noms.push(nom);
  });
  const hauteursParK = new Map();
  murs.forEach(m => {
    [0.25, 0.5, 0.75].forEach(f => {
      const x = m.a[0] + (m.b[0] - m.a[0]) * f, z = m.a[1] + (m.b[1] - m.a[1]) * f;
      const ks = new Set();
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dz]) => { const k = cellLab(x + dx * 0.08, z + dz * 0.08); if (parK.has(k)) ks.add(k); });
      ks.forEach(k => { if (!hauteursParK.has(k)) hauteursParK.set(k, []); hauteursParK.get(k).push(m.h); });
    });
  });
  const hGlobal = med(murs.map(m => m.h));
  pieces.sort((a, b) => (a.pts.reduce((s, p) => s + p[1], 0) / a.pts.length) - (b.pts.reduce((s, p) => s + p[1], 0) / b.pts.length));
  let numAnonyme = 0;
  pieces.forEach((p, i) => {
    p.id = 'p' + (i + 1);
    p.nom = p.noms && p.noms.length ? p.noms.join(' / ') : 'Pièce ' + (++numAnonyme);
    p.hauteur = r3(med(hauteursParK.get(p.k) || []) || hGlobal);
  });

  /* ---------- 5. portes, fenêtres, passages ---------- */
  const sol = rp.floors && rp.floors[0] ? rp.floors[0].transform[13] : Math.min(...murs.map(m => m.y - m.h / 2));
  const parId = new Map(murs.map(m => [m.id, m]));
  const ouvertures = []; let ignorees = 0, decalees = 0;
  const liste = [['doors', 'porte'], ['windows', 'fenetre'], ['openings', 'passage']];
  liste.forEach(([cle, type]) => (rp[cle] || []).forEach((e, idx) => {
    const t = e.transform, c = rot(t[12], t[14]), larg = e.dimensions[0], haut = e.dimensions[1];
    let cand = null;
    pieces.forEach(p => p.pts.forEach((a, i) => {
      const b = p.pts[(i + 1) % p.pts.length], pr = projSeg(c[0], c[1], a, b);
      if (pr.d > 0.25) return;
      const score = pr.d + (cand && Math.abs(pr.d - cand.d) < 0.04 ? 0 : 0);
      if (!cand || pr.d < cand.d - 0.04 || (Math.abs(pr.d - cand.d) <= 0.04 && p.aire < cand.p.aire)) cand = { p, i, a, b, d: pr.d };
    }));
    const nom = { porte: 'Porte', fenetre: 'Fenêtre', passage: 'Passage' }[type] + ' n°' + (idx + 1);
    if (!cand) { ignorees++; avert.push(nom + ' ignoré(e) : elle n\'est sur aucun mur de pièce reconstituée.'); return; }
    const L = Math.hypot(cand.b[0] - cand.a[0], cand.b[1] - cand.a[1]), u = [(cand.b[0] - cand.a[0]) / L, (cand.b[1] - cand.a[1]) / L];
    let w = Math.min(larg, L), pos = (c[0] - cand.a[0]) * u[0] + (c[1] - cand.a[1]) * u[1] - w / 2;
    const avant = pos; pos = Math.max(0, Math.min(pos, L - w));
    if (Math.abs(pos - avant) > 0.1 || w < larg - 0.02) { decalees++; avert.push(nom + ' (' + cand.p.nom + ') : recalée sur le mur de ' + L.toFixed(2).replace('.', ',') + ' m (déplacée de ' + Math.abs(pos - avant).toFixed(2).replace('.', ',') + ' m).'); }
    ouvertures.push({
      type, piece: cand.p.id, mur: cand.i, position: r3(pos), largeur: r3(w), hauteur: r3(haut),
      allege: type === 'passage' ? 0 : r3(Math.max(0, (t[13] - haut / 2) - sol))
    });
  }));

  const date = new Date().toISOString().slice(0, 10);
  const donnees = {
    projet: 'Scan OpenPlan3D converti', client: '', adresse: '', date,
    hauteurSousPlafond: r3(hGlobal), epaisseurMur: 0.1,
    pieces: pieces.map(p => ({ id: p.id, nom: p.nom, points: p.pts, hauteur: p.hauteur, cotesEstimees: p.estimes })),
    ouvertures
  };
  const rapport = {
    modeSol, cotesEstimes: nbEstimes, nbMurs: murs.length, rotationDeg: r3(th * 180 / Math.PI), ponts,
    pieces: pieces.map(p => ({ nom: p.nom, aire: p.aire })),
    nbOuvertures: ouvertures.length, ignorees, decalees,
    totalOuvertures: (rp.doors || []).length + (rp.windows || []).length + (rp.openings || []).length,
    avertissements: avert
  };
  return { donnees, rapport };
}

/* ---------- porte vue deux fois dans un coin ----------
   Le scan voit parfois une seule porte, ouverte dans un angle, comme deux
   portes : une sur chaque mur de part et d'autre du coin (cas réel : 0,73 m
   sur un mur et 0,63 m sur l'autre, pour une seule porte de 0,77 m mesurée).
   On ne corrige rien tout seul : on repère les paires suspectes — deux portes
   de la même pièce, sur deux murs qui se touchent, chacune à moins de
   `seuil` mètres du coin commun — et l'outil demande au métreur. */
function doublonsPortesCoin(d, seuil) {
  seuil = seuil === undefined ? 0.30 : seuil;
  const res = [], ouv = (d && d.ouvertures) || [];
  const pieces = new Map(((d && d.pieces) || []).map(p => [String(p.id), p]));
  for (let i = 0; i < ouv.length; i++) for (let j = i + 1; j < ouv.length; j++) {
    const a = ouv[i], b = ouv[j];
    if (a.type !== 'porte' || b.type !== 'porte' || String(a.piece) !== String(b.piece) || a.mur === b.mur) continue;
    const p = pieces.get(String(a.piece)); if (!p || !Array.isArray(p.points) || p.points.length < 3) continue;
    const n = p.points.length;
    let coin;                                     /* le sommet commun aux deux murs */
    if ((a.mur + 1) % n === b.mur) coin = b.mur;
    else if ((b.mur + 1) % n === a.mur) coin = a.mur;
    else continue;
    const long = k => { const q = p.points[k], r = p.points[(k + 1) % n]; return Math.hypot(r[0] - q[0], r[1] - q[1]); };
    /* distance de la porte au coin : depuis le bout du mur si le coin est à sa fin, depuis le début sinon */
    const distance = o => coin === (o.mur + 1) % n ? long(o.mur) - (o.position + o.largeur) : o.position;
    const da = distance(a), db = distance(b);
    if (da <= seuil && db <= seuil) res.push({ piece: p.id, nomPiece: p.nom, a: i, b: j, murA: a.mur, murB: b.mur,
      largeurA: a.largeur, largeurB: b.largeur, distA: Math.round(da * 1000) / 1000, distB: Math.round(db * 1000) / 1000 });
  }
  return res;
}

if (typeof module !== 'undefined') module.exports = { convertirRoomPlan, estRoomPlan, doublonsPortesCoin };

