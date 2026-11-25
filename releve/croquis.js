/* Relevé de visite — le croquis au doigt (« ✏️ Croquis » du dessin rapide).

   Au doigt, sur iPhone, on trace grossièrement le contour d'une pièce ; ce module le transforme en pièce
   aux murs droits. Fonctions pures, en mètres (x vers la droite, y vers le bas), sans navigateur :
   - simplifier : le tracé devient quelques segments (Ramer-Douglas-Peucker) ;
   - redresser : les murs presque horizontaux ou verticaux (15°) le deviennent ; un mur nettement
     diagonal reste diagonal ;
   - fermer, nettoyer : la forme se referme, sans mur minuscule ni sommet inutile ;
   - aimanter : les murs d'une pièce tracée près d'une autre s'alignent sur les siens (plan cohérent) ;
   - chevauche : une pièce ne se superpose jamais à une autre ;
   - mettreAEchelle, changerLongueurMur, deplacerSommet : régler les cotes sans casser les angles droits ;
   - ouvertureSurTrait, gommer : un trait court sur un mur crée une porte ou une fenêtre, la gomme efface.
   Le dessin rapide (dessin.js) en tire le relevé du moteur, comme pour une pièce rectangulaire.
   Tests : tests/t_releve_croquis.js. */

const EPS = 1e-6;
const r3 = v => Math.round(v * 1000) / 1000;
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nb = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; };

/* ---------- le tracé ---------- */

export function longueurTrace(pts) { let t = 0; for (let i = 1; i < pts.length; i++) t += dist(pts[i - 1], pts[i]); return t; }

/* les points identiques ou quasi confondus qui se suivent n'en font qu'un (un doigt qui s'attarde) */
export function epurer(pts, mini = 1e-4) {
  const o = [];
  for (const p of pts) if (!o.length || dist(o[o.length - 1], p) > mini) o.push([p[0], p[1]]);
  return o;
}

function distSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/* Ramer-Douglas-Peucker sur une ligne ouverte (itératif : un tracé de milliers de points ne fait pas déborder la pile) */
export function simplifier(pts, tol) {
  if (pts.length < 3) return pts.map(p => [p[0], p[1]]);
  const garde = new Array(pts.length).fill(false); garde[0] = garde[pts.length - 1] = true;
  const pile = [[0, pts.length - 1]];
  while (pile.length) {
    const [i, j] = pile.pop(); let dm = 0, k = -1;
    for (let m = i + 1; m < j; m++) { const d = distSegment(pts[m], pts[i], pts[j]); if (d > dm) { dm = d; k = m; } }
    if (k >= 0 && dm > tol) { garde[k] = true; pile.push([i, k], [k, j]); }
  }
  return pts.filter((_, i) => garde[i]).map(p => [p[0], p[1]]);
}

/* le tracé se referme-t-il ? (l'arrivée est près du départ, et le tracé n'est pas qu'un point) */
export function seFerme(pts, seuil) {
  if (pts.length < 4) return false;
  const L = longueurTrace(pts);
  return dist(pts[0], pts[pts.length - 1]) <= seuil && L > 4 * seuil;
}

/* ---------- le polygone ---------- */

export const aire = poly => Math.abs(poly.reduce((t, q, i) => { const n = poly[(i + 1) % poly.length]; return t + q[0] * n[1] - n[0] * q[1]; }, 0)) / 2;
export const perimetre = poly => poly.reduce((t, q, i) => t + dist(q, poly[(i + 1) % poly.length]), 0);
export function boite(poly) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/* H = horizontal, V = vertical (à `tolDeg` près), O = oblique */
function classe(a, b, tolDeg) {
  const ang = Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI);
  if (ang <= tolDeg || ang >= 180 - tolDeg) return 'H';
  if (Math.abs(ang - 90) <= tolDeg) return 'V';
  return 'O';
}

/* les murs : { i, a, b, longueur, classe } (le mur i va du sommet i au sommet i + 1) */
export function murs(poly, tolDeg = 3) {
  return poly.map((a, i) => { const b = poly[(i + 1) % poly.length]; return { i, a, b, longueur: dist(a, b), classe: classe(a, b, tolDeg) }; });
}

/* un sommet inutile (alignement parfait) ou un mur minuscule disparaît ; null si la forme s'écroule */
export function nettoyer(poly, minMur = 0.1, tolColin = 0) {
  let P = poly.map(p => [p[0], p[1]]), change = true, garde = 0;
  while (change && P.length >= 3 && garde++ < 200) {
    change = false;
    for (let i = 0; i < P.length; i++) {
      const a = P[(i + P.length - 1) % P.length], b = P[i], c = P[(i + 1) % P.length];
      const colineaire = Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) < 1e-4 * Math.max(1, dist(a, b) * dist(b, c));
      // un sommet à peine écarté de la droite entre ses voisins n'est qu'un tremblement du doigt (mur diagonal tracé en deux morceaux)
      const tremble = tolColin > 0 && distSegment(b, a, c) < tolColin;
      if (dist(a, b) < minMur || colineaire || tremble) { P.splice(i, 1); change = true; break; }
    }
  }
  return P.length >= 3 ? P : null;
}

/* Les murs presque horizontaux ou verticaux le deviennent. Deux murs de même sens qui se suivent n'en
   font qu'un ; chaque mur redressé prend la position moyenne de ses points ; chaque sommet est le
   croisement de ses deux murs (un mur oblique garde son sommet d'origine sur l'autre axe). */
export function redresser(poly, tolDeg = 15, coupe = 0) {
  const n = poly.length; if (n < 3) return poly.map(p => [p[0], p[1]]);
  const cl = poly.map((p, i) => classe(p, poly[(i + 1) % n], tolDeg));
  // on part d'un mur dont la classe diffère de la précédente, pour fusionner sans rupture au bouclage
  let debut = cl.findIndex((c, i) => c !== cl[(i + n - 1) % n]);
  if (debut < 0) return poly.map(p => [p[0], p[1]]);                  // tout du même sens : rien à redresser
  const E = [];   // { c, pts: [sommets le long du mur fusionné] }
  for (let k = 0; k < n; k++) {
    const i = (debut + k) % n, c = cl[i], a = poly[i], b = poly[(i + 1) % n], dernier = E[E.length - 1];
    if (dernier && dernier.c === c && c !== 'O') dernier.pts.push(b);
    else E.push({ c, pts: [a, b] });
  }
  const pos = e => {   // position du mur redressé : moyenne pondérée par la longueur
    let s = 0, w = 0;
    for (let i = 1; i < e.pts.length; i++) { const l = dist(e.pts[i - 1], e.pts[i]) || 1e-9, a = e.pts[i - 1], b = e.pts[i]; s += l * (e.c === 'H' ? (a[1] + b[1]) / 2 : (a[0] + b[0]) / 2); w += l; }
    return s / w;
  };
  E.forEach(e => { e.p = e.c === 'O' ? null : pos(e); e.deb = e.pts[0]; e.fin = e.pts[e.pts.length - 1]; });
  // un petit mur oblique entre un mur horizontal et un mur vertical est un coin coupé par le doigt (le tracé
  // démarre ou finit près d'un coin) : il redevient un angle droit. Un vrai mur en biais, plus long, reste.
  if (coupe > 0) for (let k = E.length - 1; k >= 0 && E.length > 3; k--) {
    const e = E[k], av = E[(k + E.length - 1) % E.length], ap = E[(k + 1) % E.length];
    if (e.c === 'O' && dist(e.deb, e.fin) < coupe && av.c !== 'O' && ap.c !== 'O' && av.c !== ap.c) E.splice(k, 1);
  }
  const m = E.length, S = [];
  for (let k = 0; k < m; k++) {
    const e0 = E[(k + m - 1) % m], e1 = E[k], orig = e1.deb;          // le sommet entre e0 et e1
    let x = orig[0], y = orig[1];
    if (e0.c === 'H') y = e0.p; if (e0.c === 'V') x = e0.p;
    if (e1.c === 'H') y = e1.p; if (e1.c === 'V') x = e1.p;
    S.push([r3(x), r3(y)]);
  }
  return S;
}

/* ---------- la validité ---------- */

function croisement(a, b, c, d) {   // les segments [ab] et [cd] se croisent franchement (pas un simple contact)
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}
/* aucun mur n'en coupe un autre (un « 8 » n'est pas une pièce) */
export function estSimple(poly) {
  const n = poly.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (croisement(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
  }
  return true;
}

function surLeBord(p, poly, eps = 1e-6) {
  for (let i = 0; i < poly.length; i++) if (distSegment(p, poly[i], poly[(i + 1) % poly.length]) < eps) return true;
  return false;
}
/* le point est franchement à l'intérieur (pas sur un mur) */
export function dedans(p, poly) {
  if (surLeBord(p, poly)) return false;
  let in_ = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) in_ = !in_;
  }
  return in_;
}

/* deux pièces se superposent-elles (un simple mur commun n'est pas une superposition) ?
   Murs qui se croisent, ou des points de part et d'autre franchement dans les deux pièces. */
export function chevauche(A, B) {
  const a = boite(A), b = boite(B);
  const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1), y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1);
  if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return false;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++)
    if (croisement(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
  const N = 24;
  for (let u = 0; u <= N; u++) for (let v = 0; v <= N; v++) {
    const p = [x0 + (x1 - x0) * (u + 0.5) / (N + 1), y0 + (y1 - y0) * (v + 0.5) / (N + 1)];
    if (dedans(p, A) && dedans(p, B)) return true;
  }
  return false;
}

/* ---------- l'aimantation ---------- */

/* Les murs verticaux (ou horizontaux) d'une pièce tracée près d'un mur de même sens d'une autre pièce
   s'y alignent : tout le mur se décale, les angles droits restent droits. Un sommet près d'un sommet
   voisin vient s'y poser (murs obliques). `seuil` en mètres. */
export function aimanter(poly, autres, seuil) {
  const P = poly.map(p => [p[0], p[1]]), n = P.length;
  const lignesX = [], lignesY = [], sommets = [];
  autres.forEach(q => { murs(q, 3).forEach(m => { if (m.classe === 'V') lignesX.push(m.a[0]); else if (m.classe === 'H') lignesY.push(m.a[1]); }); q.forEach(p => sommets.push(p)); });
  const plusProche = (v, L) => { let b = null, d = seuil; L.forEach(l => { const e = Math.abs(l - v); if (e <= d) { d = e; b = l; } }); return b; };
  // chaque mur vertical / horizontal : toutes les extrémités qui partagent sa coordonnée suivent
  const E = murs(P, 3);
  E.forEach(m => {
    if (m.classe === 'V') { const c = plusProche(m.a[0], lignesX); if (c != null) { P[m.i][0] = c; P[(m.i + 1) % n][0] = c; } }
    else if (m.classe === 'H') { const c = plusProche(m.a[1], lignesY); if (c != null) { P[m.i][1] = c; P[(m.i + 1) % n][1] = c; } }
  });
  // sommets des murs obliques : posés sur le sommet voisin le plus proche
  E.forEach(m => {
    if (m.classe !== 'O') return;
    [m.i, (m.i + 1) % n].forEach(k => { let b = null, d = seuil; sommets.forEach(s => { const e = dist(s, P[k]); if (e <= d) { d = e; b = s; } }); if (b) P[k] = [b[0], b[1]]; });
  });
  return P.map(p => [r3(p[0]), r3(p[1])]);
}

/* ---------- les cotes ---------- */

export function mettreAEchelle(poly, facteur, centre = [0, 0]) {
  return poly.map(p => [r3(centre[0] + (p[0] - centre[0]) * facteur), r3(centre[1] + (p[1] - centre[1]) * facteur)]);
}

/* le mur i prend une nouvelle longueur : le côté opposé (tous les sommets sur la même ligne) se décale,
   les angles droits sont gardés ; un mur oblique ne déplace que son extrémité */
export function changerLongueurMur(poly, i, nouvelle) {
  const n = poly.length, P = poly.map(p => [p[0], p[1]]), m = murs(P, 3)[i];
  if (!(nouvelle >= 0.3) || !m || !(m.longueur > 0)) return null;
  const k = (i + 1) % n, ux = (m.b[0] - m.a[0]) / m.longueur, uy = (m.b[1] - m.a[1]) / m.longueur, delta = nouvelle - m.longueur;
  if (m.classe === 'H') { const x = m.b[0]; P.forEach(p => { if (Math.abs(p[0] - x) < 1e-4) p[0] = r3(p[0] + ux * delta); }); }
  else if (m.classe === 'V') { const y = m.b[1]; P.forEach(p => { if (Math.abs(p[1] - y) < 1e-4) p[1] = r3(p[1] + uy * delta); }); }
  else { P[k] = [r3(m.a[0] + ux * nouvelle), r3(m.a[1] + uy * nouvelle)]; }
  return estSimple(P) && aire(P) > 0.05 ? P : null;
}

/* un sommet glissé : les murs verticaux / horizontaux qui s'y croisent le suivent (angles droits gardés) ;
   null si la forme devient impossible (murs qui se croisent, mur trop court) */
export function deplacerSommet(poly, i, p, { autres = [], seuil = 0, minMur = 0.1 } = {}) {
  const n = poly.length, P = poly.map(q => [q[0], q[1]]);
  const E = murs(poly, 3), avant = E[(i + n - 1) % n], apres = E[i];
  let nx = p[0], ny = p[1];
  if (seuil > 0) {   // aimant : sur la ligne d'un mur voisin, ou sur un sommet voisin
    const xs = [], ys = [];
    autres.forEach(q => { murs(q, 3).forEach(m => { if (m.classe === 'V') xs.push(m.a[0]); else if (m.classe === 'H') ys.push(m.a[1]); }); });
    const pp = (v, L) => { let b = null, d = seuil; L.forEach(l => { const e = Math.abs(l - v); if (e <= d) { d = e; b = l; } }); return b; };
    const ax = pp(nx, xs), ay = pp(ny, ys); if (ax != null) nx = ax; if (ay != null) ny = ay;
  }
  P[i] = [r3(nx), r3(ny)];
  [avant, apres].forEach(m => {
    const autre = m.i === i ? (i + 1) % n : m.i;                      // l'autre extrémité du mur
    if (m.classe === 'V') P[autre][0] = r3(nx); else if (m.classe === 'H') P[autre][1] = r3(ny);
  });
  if (!estSimple(P) || aire(P) < 0.05) return null;
  if (murs(P, 3).some(m => m.longueur < minMur)) return null;
  return P;
}

/* ---------- portes, fenêtres, gomme : un geste sur un mur ---------- */

/* le mur le plus proche d'un point, parmi toutes les pièces : { piece, i, point, t, distance } */
export function murProche(p, pieces, tol) {
  let best = null;
  pieces.forEach(pc => {
    const P = pc.poly; if (!P) return;
    P.forEach((a, i) => {
      const b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; if (!l2) return;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
      const q = [a[0] + t * dx, a[1] + t * dy], d = dist(p, q);
      if (d <= tol && (!best || d < best.distance)) best = { piece: pc.id, i, point: [r3(q[0]), r3(q[1])], t, distance: d, longueur: Math.sqrt(l2) };
    });
  });
  return best;
}

/* un trait court posé le long d'un mur : une ouverture (son milieu sur le mur) ; null sinon.
   Le trait doit rester près d'un seul mur, dans son sens, et ne pas se refermer sur lui-même. */
export function ouvertureSurTrait(trace, pieces, { tol, longueurMax }) {
  if (trace.length < 2) return null;
  const L = longueurTrace(trace); if (L > longueurMax || L < tol * 0.5) return null;
  const a = trace[0], b = trace[trace.length - 1], ma = murProche(a, pieces, tol), mb = murProche(b, pieces, tol);
  if (!ma || !mb || ma.piece !== mb.piece || ma.i !== mb.i) return null;
  if (trace.some(q => { const m = murProche(q, pieces, tol * 1.4); return !m || m.piece !== ma.piece || m.i !== ma.i; })) return null;
  const milieu = murProche([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], pieces.filter(p => p.id === ma.piece), tol * 2);
  return { piece: ma.piece, i: ma.i, au: (milieu || ma).point, trait: r3(dist(a, b)) };
}

/* la gomme touche une ouverture, sinon un mur de pièce : { type: 'ouverture', id } | { type: 'piece', id } | null */
export function gommer(p, pieces, ouvertures, tol) {
  const O = (ouvertures || []).filter(o => Array.isArray(o.au));
  let best = null;
  O.forEach(o => {
    const pc = pieces.find(x => x.id === o.piece), m = pc && pc.poly && murProche(o.au, [pc], tol * 2); if (!m) return;
    const a = pc.poly[m.i], b = pc.poly[(m.i + 1) % pc.poly.length], l = dist(a, b) || 1, ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l, w = (nb(o.largeur) || 0.9) / 2;
    const d = distSegment(p, [o.au[0] - ux * w, o.au[1] - uy * w], [o.au[0] + ux * w, o.au[1] + uy * w]);
    if (d <= tol && (!best || d < best.d)) best = { d, type: 'ouverture', id: o.id };
  });
  if (best) return { type: best.type, id: best.id };
  const m = murProche(p, pieces, tol);
  return m ? { type: 'piece', id: m.piece } : null;
}

/* une ouverture suit son mur quand la pièce change de forme : elle se recale sur le mur le plus proche
   de son ancienne place (ou disparaît, si aucun n'est assez proche) */
export function recalerOuvertures(ouvertures, pieces, tol) {
  return (ouvertures || []).map(o => {
    if (!Array.isArray(o.au)) return o;
    const pc = pieces.find(x => x.id === o.piece); if (!pc || !pc.poly) return o;
    const m = murProche(o.au, [pc], tol); return m ? { ...o, au: m.point } : null;
  }).filter(Boolean);
}

/* ---------- du tracé à la pièce ---------- */

const diagonale = pts => { const b = boite(pts); return Math.hypot(b.x1 - b.x0, b.y1 - b.y0); };

/* tolérances adaptées à la taille de l'écran : `vue` est la largeur visible, en mètres */
export function tolerances(vue) {
  return { simplif: 0.012 * vue, fermeture: 0.07 * vue, aimant: 0.025 * vue, murMini: 0.02 * vue, ouverture: 0.022 * vue, ouvertureMax: 0.16 * vue, tap: 0.012 * vue };
}

/* Un tracé à main levée → une pièce aux murs droits.
   `autres` : les polygones des pièces déjà posées (même étage) : la nouvelle s'y aimante et ne les chevauche pas.
   Retourne { poly } ou { erreur, raison } (raison : 'ouvert' | 'petit' | 'forme' | 'chevauche', et `avec` = polygone gêné) */
export function pieceDepuisTrace(trace, { vue, autres = [], aimant = true }) {
  const T = tolerances(vue), t = epurer(trace);
  if (t.length < 4) return { erreur: 'Tracé trop court.', raison: 'petit' };
  const tol = Math.max(T.simplif, 0.03 * diagonale(t));
  if (!seFerme(t, Math.max(T.fermeture, 0.1 * diagonale(t)))) return { erreur: 'La forme n’est pas fermée : revenez à votre point de départ.', raison: 'ouvert' };
  // forme fermée : le tracé est un anneau, refermé exactement sur son départ. Le dernier point du doigt, décalé du
  // départ, ne doit pas servir d'ancre (il raccourcirait le coin voisin) ; l'anneau se simplifie en deux moitiés.
  const anneau = t.slice(0, -1);
  let loin = 1; anneau.forEach((q, i) => { if (dist(q, anneau[0]) > dist(anneau[loin], anneau[0])) loin = i; });
  const moitie1 = simplifier(anneau.slice(0, loin + 1), tol), moitie2 = simplifier(anneau.slice(loin).concat([anneau[0]]), tol);
  let P = moitie1.concat(moitie2.slice(1, -1));
  if (P.length < 3) return { erreur: 'Forme trop simple : tracez les murs de la pièce.', raison: 'forme' };
  const bx = boite(P), coupe = Math.min(0.06 * vue, 0.3 * Math.min(bx.x1 - bx.x0, bx.y1 - bx.y0));
  P = redresser(P, 15, coupe);
  P = nettoyer(P, T.murMini, T.murMini * 0.5);
  if (!P) return { erreur: 'Forme trop petite.', raison: 'petit' };
  if (autres.length && aimant) P = nettoyer(aimanter(P, autres, T.aimant), T.murMini, T.murMini * 0.5);
  if (!P || P.length < 3) return { erreur: 'Forme trop petite.', raison: 'petit' };
  if (!estSimple(P)) return { erreur: 'Les murs se croisent : retracez la pièce sans repasser sur vos traits.', raison: 'forme' };
  if (aire(P) < 4 * T.murMini * T.murMini) return { erreur: 'Forme trop petite.', raison: 'petit' };
  const gene = autres.find(q => chevauche(P, q));
  if (gene) return { erreur: 'Cette pièce chevauche une pièce voisine : tracez-la à côté.', raison: 'chevauche', avec: gene };
  return { poly: P };
}

/* le point le plus dégagé de la pièce (le plus loin de tous les murs) : le nom d'une pièce en L ou en U se pose
   dans son bras le plus large, jamais contre un mur ni dans le vide ; pour un rectangle, c'est son centre */
export function pointInterieur(poly) {
  const b = boite(poly), N = 28, pts = [];
  for (let u = 0; u <= N; u++) for (let v = 0; v <= N; v++) {
    const p = [b.x0 + (b.x1 - b.x0) * (u + 0.5) / (N + 1), b.y0 + (b.y1 - b.y0) * (v + 0.5) / (N + 1)];
    if (!dedans(p, poly)) continue;
    let d = Infinity; for (let i = 0; i < poly.length; i++) d = Math.min(d, distSegment(p, poly[i], poly[(i + 1) % poly.length]));
    pts.push([p, d]);
  }
  if (!pts.length) return poly[0];
  // le plus dégagé ; à peu près à égalité (un long rectangle), celui qui est le plus près du centre de la boîte
  const dmax = Math.max(...pts.map(q => q[1])), c = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  return pts.filter(q => q[1] >= dmax - 0.06 * Math.max(dmax, 0.01)).sort((u, v) => dist(u[0], c) - dist(v[0], c))[0][0];
}

/* le polygone d'un rectangle { x0, y0, x1, y1 } */
export const polyDeRect = r => [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
