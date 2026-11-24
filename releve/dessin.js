/* Relevé de visite — le dessin rapide, sans scan.

   Au doigt, sur iPhone, on ne dessine pas de murs : on empile des pièces
   rectangulaires. Chaque pièce a un nom, une longueur et une largeur (en
   mètres, intérieures), et se pose à côté d'une pièce déjà posée : à droite,
   en dessous, à gauche ou au-dessus, avec un décalage le long du mur commun.
   Ce module en tire un relevé au format du moteur (pièces en polygones) :
   - les pièces voisines partagent exactement leurs coins sur le mur commun
     (un mur commun plus court que l'autre est coupé à ses bouts), pour que
     le moteur n'y voie qu'un seul mur ;
   - le résumé (surface, périmètre, murs) est calculé tout de suite, pour la
     fourchette de prix et le dossier, même avant d'ouvrir le plan.
   Ensuite, le plan s'ouvre dans le moteur : toucher une cote pour taper la
   vraie longueur, ajouter portes et fenêtres, 3D, PDF.
   Fonctions pures. Tests : tests/t_releve_dessin.js. */

export const COTES = [['droite', 'à droite de'], ['bas', 'en dessous de'], ['gauche', 'à gauche de'], ['haut', 'au-dessus de']];
const r3 = v => Math.round(v * 1000) / 1000;
const nb = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; };

/* une pièce saisie : { id, nom, longueur, largeur, contre?: { id, cote, decalage } }
   → son rectangle { x0, y0, x1, y1 } (x vers la droite, y vers le bas) */
export function placer(pieces) {
  const rect = new Map(), erreurs = [];
  (pieces || []).forEach((p, i) => {
    const L = nb(p.longueur), W = nb(p.largeur);
    if (!(L >= 0.3 && L <= 50 && W >= 0.3 && W <= 50)) { erreurs.push((p.nom || 'Pièce ' + (i + 1)) + ' : longueur et largeur entre 0,30 et 50 m.'); return; }
    const c = p.contre && rect.get(p.contre.id), d = nb(p.contre && p.contre.decalage) || 0;
    let x0 = 0, y0 = 0;
    // posée au doigt, où l'on veut : sa position (coin haut-gauche) l'emporte
    if (p.libre && nb(p.libre.x) != null && nb(p.libre.y) != null) { x0 = nb(p.libre.x); y0 = nb(p.libre.y); }
    else if (!c) {
      // la première pièce à l'origine ; une pièce sans voisine se pose à droite de tout
      if (rect.size) x0 = Math.max(...[...rect.values()].map(r => r.x1)) + 1;
    } else if (p.contre.cote === 'droite') { x0 = c.x1; y0 = c.y0 + d; }
    else if (p.contre.cote === 'gauche') { x0 = c.x0 - L; y0 = c.y0 + d; }
    else if (p.contre.cote === 'bas') { x0 = c.x0 + d; y0 = c.y1; }
    else { x0 = c.x0 + d; y0 = c.y0 - W; }
    rect.set(p.id, { x0: r3(x0), y0: r3(y0), x1: r3(x0 + L), y1: r3(y0 + W) });
  });
  return { rect, erreurs };
}

/* deux rectangles qui se chevauchent (plus qu'un frôlement) : refusé */
/* une petite pièce posée DANS une grande, contre son bord (WC, placard, gaine dans une pièce de vie
   qui n'est pas rectangulaire) : la grande est découpée autour d'elle, ce n'est pas un chevauchement */
const TOL_INC = 0.03;
export function incluse(b, a) {
  if (!(b.x0 >= a.x0 - TOL_INC && b.x1 <= a.x1 + TOL_INC && b.y0 >= a.y0 - TOL_INC && b.y1 <= a.y1 + TOL_INC)) return false;
  if ((b.x1 - b.x0) * (b.y1 - b.y0) >= (a.x1 - a.x0) * (a.y1 - a.y0) - 0.01) return false;
  return Math.abs(b.x0 - a.x0) < TOL_INC || Math.abs(b.x1 - a.x1) < TOL_INC || Math.abs(b.y0 - a.y0) < TOL_INC || Math.abs(b.y1 - a.y1) < TOL_INC;
}
/* le contour d'un rectangle dont on retire des rectangles collés à son bord (forme en L, encoche) :
   cases d'une grille, puis bord extérieur suivi dans le sens horaire ; null si la forme n'est pas d'un
   seul tenant (découpes qui la coupent en deux) */
export function contourDecoupe(a, trous) {
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const T = trous.map(b => ({ x0: cl(b.x0, a.x0, a.x1), x1: cl(b.x1, a.x0, a.x1), y0: cl(b.y0, a.y0, a.y1), y1: cl(b.y1, a.y0, a.y1) }));
  // un bord à moins de 3 cm de celui de la grande pièce s'y aligne (arrondis des cotes)
  T.forEach(b => { ['x0', 'x1'].forEach(k => { if (Math.abs(b[k] - a.x0) < TOL_INC) b[k] = a.x0; if (Math.abs(b[k] - a.x1) < TOL_INC) b[k] = a.x1; });
    ['y0', 'y1'].forEach(k => { if (Math.abs(b[k] - a.y0) < TOL_INC) b[k] = a.y0; if (Math.abs(b[k] - a.y1) < TOL_INC) b[k] = a.y1; }); });
  const X = [...new Set([a.x0, a.x1, ...T.flatMap(b => [b.x0, b.x1])].map(r3))].sort((u, v) => u - v);
  const Y = [...new Set([a.y0, a.y1, ...T.flatMap(b => [b.y0, b.y1])].map(r3))].sort((u, v) => u - v);
  const plein = (i, j) => i >= 0 && j >= 0 && i < X.length - 1 && j < Y.length - 1 && !T.some(b => (X[i] + X[i + 1]) / 2 > b.x0 && (X[i] + X[i + 1]) / 2 < b.x1 && (Y[j] + Y[j + 1]) / 2 > b.y0 && (Y[j] + Y[j + 1]) / 2 < b.y1);
  // arêtes du bord, orientées pour que l'intérieur soit à droite (sens horaire à l'écran, y vers le bas)
  const suivant = new Map(); let n = 0;
  for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Y.length - 1; j++) {
    if (!plein(i, j)) continue; n++;
    const k = (x, y) => x + ',' + y;
    if (!plein(i, j - 1)) suivant.set(k(i, j), [i + 1, j]);
    if (!plein(i + 1, j)) suivant.set(k(i + 1, j), [i + 1, j + 1]);
    if (!plein(i, j + 1)) suivant.set(k(i + 1, j + 1), [i, j + 1]);
    if (!plein(i - 1, j)) suivant.set(k(i, j + 1), [i, j]);
  }
  if (!n) return null;
  const depart = [...suivant.keys()].sort()[0]; let cur = depart; const P = [];
  for (let g = 0; g < 400; g++) { const [i, j] = cur.split(',').map(Number); P.push([X[i], Y[j]]); const nx = suivant.get(cur); if (!nx) return null; cur = nx.join(','); if (cur === depart) break; }
  if (cur !== depart || P.length !== suivant.size) return null;     // plusieurs morceaux, ou un trou : pas d'un seul tenant
  // points alignés retirés ; départ au coin haut-gauche (comme les autres pièces)
  const Q = P.filter((q, i) => { const a0 = P[(i + P.length - 1) % P.length], b0 = P[(i + 1) % P.length]; return !((a0[0] === q[0] && q[0] === b0[0]) || (a0[1] === q[1] && q[1] === b0[1])); });
  const i0 = Q.reduce((m, q, i) => (q[1] < Q[m][1] || (q[1] === Q[m][1] && q[0] < Q[m][0])) ? i : m, 0);
  return [...Q.slice(i0), ...Q.slice(0, i0)];
}
export function chevauchements(pieces, rect) {
  const L = (pieces || []).filter(p => rect.has(p.id)), res = [];
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    if ((L[i].etage || 0) !== (L[j].etage || 0)) continue;          // deux étages se superposent, normalement
    const a = rect.get(L[i].id), b = rect.get(L[j].id);
    if (incluse(a, b) || incluse(b, a)) continue;                     // découpée autour (voir contourDecoupe)
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (ox > 0.01 && oy > 0.01) res.push([L[i].nom, L[j].nom]);
  }
  return res;
}

/* le contour d'une pièce, avec les coins des voisines posés sur ses murs
   (sens horaire à l'écran : haut, droite, bas, gauche) */
function contour(r, autres) {
  // une pièce qui en contient d'autres contre son bord : son contour est découpé autour d'elles
  const dedans = autres.filter(o => incluse(o, r));
  const poly = dedans.length ? contourDecoupe(r, dedans) : null;
  if (poly) return contourPoly(poly, autres.filter(o => !dedans.includes(o)).concat(dedans));
  const surSegment = (fixe, axe, debut, fin) => {
    const pts = new Set();
    autres.forEach(o => {
      const coins = [[o.x0, o.y0], [o.x1, o.y0], [o.x1, o.y1], [o.x0, o.y1]];
      coins.forEach(([x, y]) => {
        // un bout de mur de moins de 3 cm n'a pas de sens (et le moteur le refuse) : coin voisin ignoré
        const sur = axe === 'x' ? Math.abs(y - fixe) < 0.0005 && x > Math.min(debut, fin) + 0.03 && x < Math.max(debut, fin) - 0.03
          : Math.abs(x - fixe) < 0.0005 && y > Math.min(debut, fin) + 0.03 && y < Math.max(debut, fin) - 0.03;
        if (sur) pts.add(axe === 'x' ? x : y);
      });
    });
    return [...pts].sort((a, b) => debut < fin ? a - b : b - a);
  };
  const P = [[r.x0, r.y0]];
  surSegment(r.y0, 'x', r.x0, r.x1).forEach(x => P.push([x, r.y0])); P.push([r.x1, r.y0]);
  surSegment(r.x1, 'y', r.y0, r.y1).forEach(y => P.push([r.x1, y])); P.push([r.x1, r.y1]);
  surSegment(r.y1, 'x', r.x1, r.x0).forEach(x => P.push([x, r.y1])); P.push([r.x0, r.y1]);
  surSegment(r.x0, 'y', r.y1, r.y0).forEach(y => P.push([r.x0, y]));
  return P.map(([x, y]) => [r3(x), r3(y)]);
}

/* le contour d'un polygone à angles droits, avec les coins des voisines posés sur ses murs */
function contourPoly(poly, autres) {
  const coins = autres.flatMap(o => [[o.x0, o.y0], [o.x1, o.y0], [o.x1, o.y1], [o.x0, o.y1]]), P = [];
  poly.forEach((A, i) => {
    const B = poly[(i + 1) % poly.length]; P.push(A);
    const horiz = Math.abs(A[1] - B[1]) < 1e-9, lo = horiz ? Math.min(A[0], B[0]) : Math.min(A[1], B[1]), hi = horiz ? Math.max(A[0], B[0]) : Math.max(A[1], B[1]);
    const sur = [...new Set(coins.filter(([x, y]) => horiz ? Math.abs(y - A[1]) < 0.0005 && x > lo + 0.03 && x < hi - 0.03 : Math.abs(x - A[0]) < 0.0005 && y > lo + 0.03 && y < hi - 0.03)
      .map(([x, y]) => r3(horiz ? x : y)))].sort((u, v) => (horiz ? B[0] > A[0] : B[1] > A[1]) ? u - v : v - u);
    sur.forEach(t => P.push(horiz ? [t, A[1]] : [A[0], t]));
  });
  return P.map(([x, y]) => [r3(x), r3(y)]);
}
const airePoly = pts => Math.abs(pts.reduce((t, q, i) => { const n = pts[(i + 1) % pts.length]; return t + q[0] * n[1] - n[0] * q[1]; }, 0)) / 2;
const perimPoly = pts => pts.reduce((t, q, i) => { const n = pts[(i + 1) % pts.length]; return t + Math.hypot(n[0] - q[0], n[1] - q[1]); }, 0);

/* le relevé au format du moteur, et son résumé ; `etages` (noms), `ouvertures`,
   `symboles` et `toiture` viennent du dessin (voir plus bas) */
/* le décalage du nom d'une pièce par rapport à son centre (m), glissé quand il cache une cote */
export const etiquetteDe = p => { const e = p && p.etiquette, dx = nb(e && e.dx), dy = nb(e && e.dy); return { dx: dx != null && Math.abs(dx) <= 50 ? dx : 0, dy: dy != null && Math.abs(dy) <= 50 ? dy : 0 }; };
export function releveDepuisDessin(pieces, { projet = 'Dessin rapide', hauteur = 2.5, etages, ouvertures, symboles, toiture } = {}) {
  const { rect, erreurs } = placer(pieces);
  const ch = chevauchements(pieces, rect);
  ch.forEach(([a, b]) => erreurs.push('« ' + a + ' » et « ' + b + ' » se chevauchent : changez le côté ou le décalage.'));
  const H = nb(hauteur) >= 1.8 && nb(hauteur) <= 6 ? nb(hauteur) : 2.5;
  // une pièce peut avoir sa propre hauteur sous plafond (lue sur l'esquisse, ou réglée) : sinon celle du dessin
  const hPiece = p => nb(p.hauteur) >= 1.5 && nb(p.hauteur) <= 8 ? nb(p.hauteur) : H;
  const posees = (pieces || []).filter(p => rect.has(p.id));
  const noms = nomsEtages(etages, posees);
  const et = p => Math.min(noms.length - 1, Math.max(0, Number.isInteger(p.etage) ? p.etage : 0));
  // les coins des voisines ne se posent que sur les murs du même étage
  const contours = new Map(posees.map(p => [p.id, contour(rect.get(p.id), posees.filter(o => o !== p && et(o) === et(p)).map(o => rect.get(o.id)))]));
  const ouv = ouverturesMoteur(ouvertures, posees, rect, contours);
  ouv.erreurs.forEach(e => erreurs.push(e));
  const donnees = {
    projet, client: '', adresse: '', date: new Date().toISOString().slice(0, 10), hauteurSousPlafond: H, epaisseurMur: 0.1,
    etages: noms.map(nom => ({ nom })),
    pieces: posees.map(p => { const pts = contours.get(p.id);
      return { id: 'd-' + p.id, nom: String(p.nom || 'Pièce'), etage: et(p), points: pts, pointsScan: pts.map(q => [q[0], q[1]]), hauteur: hPiece(p), dessinRapide: true,
        ...(p.note ? { note: String(p.note).slice(0, 600) } : {}), ...(p.etiquette ? { etiquette: etiquetteDe(p) } : {}) }; }),
    ouvertures: ouv.liste, symboles: symbolesMoteur(symboles, noms.length), toitures: toituresMoteur(toiture, posees.map(p => ({ id: 'd-' + p.id, etage: et(p) }))), dessinRapide: true,
  };
  const compte = (id, type) => ouv.liste.filter(o => o.piece === id && (type === 'fenetre' ? o.type === 'fenetre' : o.type !== 'fenetre')).length;
  // surfaces et périmètres tirés du contour : une pièce découpée autour d'un WC perd la surface du WC
  const detail = posees.map(p => { const pts = contours.get(p.id), id = 'd-' + p.id, A = airePoly(pts), Pm = perimPoly(pts);
    return { id, nom: String(p.nom || 'Pièce'), etage: et(p), sol: Math.round(A * 100) / 100, perimetre: Math.round(Pm * 100) / 100,
      hauteur: hPiece(p), murs: Math.round(Pm * hPiece(p) * 100) / 100, portes: compte(id, 'porte'), fenetres: compte(id, 'fenetre') }; });
  const surface = Math.round(detail.reduce((t, d) => t + d.sol, 0) * 100) / 100;
  return { donnees, resume: { projet, pieces: detail.length, surface, ouvertures: ouv.liste.length, detail }, erreurs, rect };
}

/* ==========================================================================
   Le dessin rapide complet : étages, pièces posées au doigt (aimantées),
   portes et fenêtres sur un côté de pièce, symboles (chauffage, sanitaires,
   tableau électrique, trémie d'escalier), toiture. Fonctions pures,
   converties au format du moteur de relevé (releve/moteur/moteur.js).
   ========================================================================== */
export const ETAGE_DEFAUT = 'Rez-de-chaussée';
export function nomsEtages(etages, pieces) {
  const n = Math.max(1, Array.isArray(etages) ? etages.length : 0, ...(pieces || []).map(p => (Number.isInteger(p.etage) ? p.etage : 0) + 1));
  return Array.from({ length: Math.min(n, 6) }, (_, i) => String((Array.isArray(etages) && etages[i]) || (i === 0 ? ETAGE_DEFAUT : 'Étage ' + i)).slice(0, 40));
}

/* aimanter : un rectangle déplacé au doigt colle aux bords des autres pièces
   (à moins de `seuil` mètres), en x et en y séparément */
export function aimanter(r, autres, seuil = 0.3) {
  const L = r.x1 - r.x0, W = r.y1 - r.y0;
  const meilleur = (positions, cibles) => {
    let best = null;
    positions.forEach(([val, decal]) => cibles.forEach(c => { const d = Math.abs(val - c); if (d <= seuil && (!best || d < best.d)) best = { d, v: c - decal }; }));
    return best;
  };
  const xs = (autres || []).flatMap(o => [o.x0, o.x1]), ys = (autres || []).flatMap(o => [o.y0, o.y1]);
  const bx = meilleur([[r.x0, 0], [r.x1, L]], xs), by = meilleur([[r.y0, 0], [r.y1, W]], ys);
  return { x: r3(bx ? bx.v : r.x0), y: r3(by ? by.v : r.y0) };
}

/* une porte ou une fenêtre posée sur un côté de pièce : { id, piece, type,
   cote : 'haut'|'droite'|'bas'|'gauche', position (m depuis la gauche ou le
   haut du côté), largeur } → l'ouverture du moteur, sur le bon mur du contour
   (un côté peut être coupé en plusieurs murs par les coins des voisines) */
export const TYPES_OUVERTURE = [['porte', 'Porte', 0.83], ['fenetre', 'Fenêtre', 1.2], ['portefenetre', 'Porte-fenêtre', 1.6], ['passage', 'Passage', 0.9]];
export function ouverturesMoteur(ouvertures, pieces, rect, contours) {
  const liste = [], erreurs = [];
  (Array.isArray(ouvertures) ? ouvertures : []).forEach(o => {
    const p = (pieces || []).find(x => x.id === o.piece), r = p && rect.get(p.id), pts = p && contours.get(p.id);
    if (!r || !pts) return;
    const lib = (TYPES_OUVERTURE.find(t => t[0] === o.type) || TYPES_OUVERTURE[0])[1] + ' de « ' + (p.nom || 'Pièce') + ' »';
    const w = nb(o.largeur), pos = Math.max(0, nb(o.position) || 0), cote = ['haut', 'droite', 'bas', 'gauche'].includes(o.cote) ? o.cote : 'bas';
    const longCote = cote === 'haut' || cote === 'bas' ? r.x1 - r.x0 : r.y1 - r.y0;
    if (!(w >= 0.3 && w <= 6)) { erreurs.push(lib + ' : largeur entre 0,30 et 6 m.'); return; }
    if (pos + w > longCote + 0.005) { erreurs.push(lib + ' : dépasse du mur (' + String(r3(pos + w)).replace('.', ',') + ' m pour ' + String(r3(longCote)).replace('.', ',') + ' m).'); return; }
    // l'intervalle de l'ouverture, en coordonnées du plan, le long du côté
    const a = (cote === 'haut' || cote === 'bas' ? r.x0 : r.y0) + pos, b = a + w;
    const n = pts.length;
    let trouve = null;
    for (let i = 0; i < n; i++) {
      const P = pts[i], Q = pts[(i + 1) % n];
      const surCote = cote === 'haut' ? Math.abs(P[1] - r.y0) < 1e-6 && Math.abs(Q[1] - r.y0) < 1e-6 && Q[0] > P[0]
        : cote === 'bas' ? Math.abs(P[1] - r.y1) < 1e-6 && Math.abs(Q[1] - r.y1) < 1e-6 && Q[0] < P[0]
        : cote === 'droite' ? Math.abs(P[0] - r.x1) < 1e-6 && Math.abs(Q[0] - r.x1) < 1e-6 && Q[1] > P[1]
        : Math.abs(P[0] - r.x0) < 1e-6 && Math.abs(Q[0] - r.x0) < 1e-6 && Q[1] < P[1];
      if (!surCote) continue;
      const lo = cote === 'haut' || cote === 'bas' ? Math.min(P[0], Q[0]) : Math.min(P[1], Q[1]), hi = cote === 'haut' || cote === 'bas' ? Math.max(P[0], Q[0]) : Math.max(P[1], Q[1]);
      if (a >= lo - 1e-6 && a < hi - 1e-6) { trouve = { i, lo, hi }; break; }
    }
    if (!trouve) { erreurs.push(lib + ' : mur introuvable.'); return; }
    // le mur est coupé (coin d'une voisine) : l'ouverture est ramenée dans le mur si elle y tient
    let A = a, B = b;
    if (B > trouve.hi + 0.005) { if (trouve.hi - trouve.lo < w - 0.005) { erreurs.push(lib + ' : à cheval sur deux murs (une pièce voisine coupe ce côté) : déplacez-la.'); return; } A = trouve.hi - w; B = trouve.hi; }
    // position du moteur : depuis le début du mur, dans le sens du contour
    const position = cote === 'haut' || cote === 'droite' ? A - trouve.lo : trouve.hi - B;
    const type = o.type === 'portefenetre' ? 'fenetre' : o.type === 'fenetre' || o.type === 'passage' ? o.type : 'porte';
    liste.push({ type, piece: 'd-' + p.id, mur: trouve.i, position: r3(position), largeur: r3(w),
      ...(o.type === 'portefenetre' ? { hauteur: nb(o.hauteur) >= 1.6 && nb(o.hauteur) <= 3.5 ? r3(nb(o.hauteur)) : 2.15, allege: 0 } : nb(o.hauteur) >= 0.3 && nb(o.hauteur) <= 3.5 ? { hauteur: r3(nb(o.hauteur)) } : {}), ...(o.charniere === 'fin' ? { charniere: 'fin' } : {}), ...(o.sens === 'inverse' ? { sens: 'inverse' } : {}), dessin: o.id });
  });
  return { liste, erreurs };
}

/* les symboles : équipements posés sur le plan (centre x, y en mètres, rotation par quarts de tour) */
/* type, nom, pictogramme, longueur et profondeur par défaut (m), famille (pour ranger la palette) */
export const FAMILLES_SYMBOLE = [['chauffage', 'Chauffage'], ['sanitaire', 'Sanitaire'], ['cuisine', 'Cuisine et buanderie'],
  ['elec', 'Électricité et ventilation'], ['mobilier', 'Mobilier'], ['escalier', 'Escalier']];
export const TYPES_SYMBOLE = [
  ['radiateur', 'Radiateur', '♨️', 1.0, 0.12, 'chauffage'], ['chaudiere', 'Chaudière', '🔥', 0.6, 0.6, 'chauffage'], ['cumulus', 'Chauffe-eau', '💧', 0.6, 0.6, 'chauffage'], ['poele', 'Poêle', '🪵', 0.6, 0.6, 'chauffage'],
  ['wc', 'WC', '🚽', 0.4, 0.65, 'sanitaire'], ['lavabo', 'Lavabo', '🪥', 0.6, 0.45, 'sanitaire'], ['douche', 'Douche', '🚿', 0.9, 0.9, 'sanitaire'], ['baignoire', 'Baignoire', '🛁', 1.7, 0.75, 'sanitaire'],
  ['evier', 'Évier', '🍽️', 1.2, 0.6, 'cuisine'], ['plaque', 'Plaque de cuisson', '🍳', 0.6, 0.6, 'cuisine'], ['frigo', 'Réfrigérateur', '🧊', 0.6, 0.65, 'cuisine'],
  ['lave_vaisselle', 'Lave-vaisselle', '🫧', 0.6, 0.6, 'cuisine'], ['lave_linge', 'Lave-linge', '🧺', 0.6, 0.6, 'cuisine'], ['plan_travail', 'Plan de travail', '🟫', 2.4, 0.6, 'cuisine'],
  ['tableau', 'Tableau électrique', '⚡', 0.5, 0.15, 'elec'], ['prise', 'Prise', '🔌', 0.2, 0.1, 'elec'], ['interrupteur', 'Interrupteur', '🎚️', 0.15, 0.1, 'elec'],
  ['lumiere', 'Point lumineux', '💡', 0.3, 0.3, 'elec'], ['vmc', 'Bouche VMC', '🌀', 0.3, 0.3, 'elec'],
  ['lit', 'Lit', '🛏️', 1.6, 2.0, 'mobilier'], ['canape', 'Canapé', '🛋️', 2.0, 0.9, 'mobilier'], ['table', 'Table', '🪑', 1.6, 0.9, 'mobilier'],
  ['escalier', 'Trémie d’escalier', '🪜', 2.6, 0.9, 'escalier'],
];
export function symbolesMoteur(symboles, nbEtages = 1) {
  return (Array.isArray(symboles) ? symboles : []).map(s => {
    const t = TYPES_SYMBOLE.find(x => x[0] === (s && s.type)); if (!t) return null;
    const x = nb(s.x), y = nb(s.y); if (x == null || y == null) return null;
    const l = nb(s.l), w = nb(s.w);
    return { id: String(s.id || ''), type: t[0], etage: Math.min(nbEtages - 1, Math.max(0, Number.isInteger(s.etage) ? s.etage : 0)), x: r3(x), y: r3(y),
      rot: [0, 90, 180, 270].includes(s.rot) ? s.rot : 0, l: l >= 0.1 && l <= 10 ? r3(l) : t[3], w: w >= 0.05 && w <= 10 ? r3(w) : t[4] };
  }).filter(Boolean).slice(0, 200);
}

/* la toiture : sur les pièces de l'étage le plus haut (le moteur la dessine et la montre en 3D) */
export const TYPES_TOITURE = [['aucune', 'Pas de toiture'], ['plat', 'Toit plat'], ['1pente', '1 pente'], ['2pentes', '2 pentes'], ['4pentes', '4 pentes']];
export function toituresMoteur(toiture, pieces) {
  const t = toiture && TYPES_TOITURE.some(x => x[0] === toiture.type) ? toiture : null;
  if (!t || t.type === 'aucune' || !(pieces || []).length) return [];
  const haut = Math.max(...pieces.map(p => p.etage || 0));
  const a = nb(t.angle);
  return [{ id: 't-dessin', nom: 'Toiture', type: t.type, pieces: pieces.filter(p => (p.etage || 0) === haut).map(p => p.id),
    ...(a != null && a >= 0 && a <= 70 ? { angle: a } : {}), ...(t.couverture ? { couverture: String(t.couverture).slice(0, 60) } : {}) }];
}

/* ==========================================================================
   Un plan 2D lu par l'IA (magicplan, plan d'architecte, photo d'un plan)
   donne des rectangles posés : { nom, longueur (horizontale), largeur
   (verticale), x, y } en mètres, coin haut-gauche. On en tire les pièces du
   dessin rapide, chacune posée contre une voisine déjà posée (le côté où
   elles se touchent le plus, murs d'au plus GAP_MUR entre elles), avec son
   décalage : le dessin reste réglable au doigt comme s'il avait été saisi.
   Une pièce qui ne touche personne se pose contre la plus proche.
   ========================================================================== */
export const GAP_MUR = 0.7;                     // épaisseur de mur la plus forte qu'on enjambe (m)
const cm = v => Math.round(v * 100) / 100;
export function dessinDepuisRectangles(rects, nouvelId = i => 'p' + (i + 1), carte = null) {
  const R = (rects || []).map((r, i) => ({ i, nom: String(r.nom || 'Pièce ' + (i + 1)).slice(0, 40), L: nb(r.longueur), W: nb(r.largeur), x: nb(r.x) || 0, y: nb(r.y) || 0 }))
    .filter(r => r.L >= 0.3 && r.L <= 50 && r.W >= 0.3 && r.W <= 50);
  if (!R.length) return [];
  const recouvre = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
  /* comment b se pose contre a (rectangles d'origine) : côté, recouvrement, écart */
  const contact = (a, b) => {
    const ox = recouvre(a.x, a.x + a.L, b.x, b.x + b.L), oy = recouvre(a.y, a.y + a.W, b.y, b.y + b.W);
    const c = [
      ['droite', b.x - (a.x + a.L), oy], ['gauche', a.x - (b.x + b.L), oy],
      ['bas', b.y - (a.y + a.W), ox], ['haut', a.y - (b.y + b.W), ox]];
    return c.map(([cote, ecart, rec]) => ({ cote, ecart, rec })).filter(k => k.ecart > -0.3).sort((p, q) => (q.rec - p.rec) || (p.ecart - q.ecart))[0];
  };
  // la première : la plus en haut à gauche
  const ordre = [...R].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const poses = [ordre[0]], reste = ordre.slice(1), sortie = [{ id: nouvelId(0), nom: ordre[0].nom, longueur: cm(ordre[0].L), largeur: cm(ordre[0].W) }];
  ordre[0].id = sortie[0].id;
  // les rectangles déjà posés (coordonnées du dessin), pour refuser une pose qui chevauche
  const place = new Map([[ordre[0].id, { x0: 0, y0: 0, x1: ordre[0].L, y1: ordre[0].W }]]);
  const poser = (a, b, cote, d) => { const c = place.get(a.id);
    const x0 = cote === 'droite' ? c.x1 : cote === 'gauche' ? c.x0 - b.L : c.x0 + d, y0 = cote === 'bas' ? c.y1 : cote === 'haut' ? c.y0 - b.W : c.y0 + d;
    return { x0, y0, x1: x0 + b.L, y1: y0 + b.W }; };
  const libre = r => [...place.values()].every(o => recouvre(r.x0, r.x1, o.x0, o.x1) <= 0.01 || recouvre(r.y0, r.y1, o.y0, o.y1) <= 0.01);
  while (reste.length) {
    const cands = [];
    reste.forEach((b, ib) => poses.forEach(a => {
      const k = contact(a, b); if (!k) return;
      // mieux vaut un mur fin qu'un mur épais : à recouvrement égal, l'écart le plus petit gagne
      const touche = k.ecart <= GAP_MUR && k.rec >= 0.3;
      const d = cm(k.cote === 'droite' || k.cote === 'gauche' ? b.y - a.y : b.x - a.x);
      cands.push({ score: touche ? 1000 + k.rec - 3 * Math.max(0, k.ecart) : -Math.max(0, k.ecart) - Math.max(0, -k.rec), a, b, ib, cote: k.cote, d });
    }));
    cands.sort((p, q) => q.score - p.score);
    const ch = cands.find(c => libre(poser(c.a, c.b, c.cote, c.d))) || cands[0];
    reste.splice(reste.indexOf(ch.b), 1);
    // à 3 cm près (arrondis des cotes du plan), deux voisines s'alignent : un seul mur commun net
    if (Math.abs(ch.d) <= 0.03) ch.d = 0;
    const lat = ch.cote === 'droite' || ch.cote === 'gauche', da = lat ? ch.a.W : ch.a.L;
    if (ch.d === 0 && Math.abs((lat ? ch.b.W : ch.b.L) - da) <= 0.03) { if (lat) ch.b.W = da; else ch.b.L = da; }
    ch.b.id = nouvelId(sortie.length);
    place.set(ch.b.id, poser(ch.a, ch.b, ch.cote, ch.d));
    sortie.push({ id: ch.b.id, nom: ch.b.nom, longueur: cm(ch.b.L), largeur: cm(ch.b.W), contre: { id: ch.a.id, cote: ch.cote, decalage: ch.d } });
    poses.push(ch.b);
  }
  // rang de chaque rectangle lu → pièce créée (pour lui rattacher ses ouvertures, équipements, notes)
  if (carte) R.forEach(r => { if (r.id) carte.set(r.i, r.id); });
  return sortie;
}

/* la lecture enrichie d'un plan ou d'une esquisse (fonction imaginer, mode « plan ») : en plus des
   pièces, leurs portes et fenêtres (sur le bon côté, ramenées dans le mur si besoin), leurs
   équipements (radiateurs, tableau… posés contre le mur indiqué, sinon au centre), la hauteur sous
   plafond et une note qui reprend les annotations, le projet (écrit en rouge) et un avertissement
   pour une pièce non rectangulaire. Tout reste une proposition à vérifier dans le dessin. */
export function dessinDepuisLecture(lues, nouvelId = i => 'p' + (i + 1)) {
  const carte = new Map(), pieces = dessinDepuisRectangles(lues, nouvelId, carte), ouvertures = [], equipements = [];
  let n = 0; const id = () => String(nouvelId(1000 + n++));
  (lues || []).forEach((q, i) => {
    const p = pieces.find(x => x.id === carte.get(i)); if (!p) return;
    const h = nb(q.hauteur); if (h >= 1.5 && h <= 8) p.hauteur = r3(h);
    const note = [q.notes, q.projet ? 'Projet : ' + q.projet : '', q.forme === 'autre' ? 'Forme à vérifier : pièce non rectangulaire, lue comme son rectangle.' : '']
      .map(t => String(t || '').trim()).filter(Boolean).join(' · ');
    if (note) p.note = note.slice(0, 600);
    (Array.isArray(q.ouvertures) ? q.ouvertures : []).forEach(o => {
      const ty = TYPES_OUVERTURE.find(t => t[0] === o.type), cote = ['haut', 'droite', 'bas', 'gauche'].includes(o.cote) ? o.cote : null; if (!ty || !cote) return;
      const long = cote === 'haut' || cote === 'bas' ? p.longueur : p.largeur; if (!(long >= 0.6)) return;
      const w = r3(Math.min(Math.max(nb(o.largeur) || ty[2], 0.3), 6, long - 0.1)), pos0 = nb(o.position);
      const ho = nb(o.hauteur);
      ouvertures.push({ id: id(), piece: p.id, type: o.type, cote, position: r3(Math.max(0, Math.min(long - w, pos0 != null ? pos0 : (long - w) / 2))), largeur: w,
        ...(ho >= 0.3 && ho <= 3.5 ? { hauteur: r3(ho) } : {}) });
    });
    (Array.isArray(q.equipements) ? q.equipements : []).forEach(e => {
      if (!TYPES_SYMBOLE.some(t => t[0] === e.type) || e.type === 'escalier') return;
      equipements.push({ piece: p.id, type: e.type, ...(['haut', 'droite', 'bas', 'gauche'].includes(e.cote) ? { cote: e.cote } : {}), ...(nb(e.position) != null ? { position: nb(e.position) } : {}) });
    });
  });
  return { pieces, ouvertures, equipements };
}
/* les équipements lus, posés dans leur pièce (rectangles du dessin) : contre le mur indiqué, dos au
   mur (le quart de tour suit le côté), à la position lue sinon au milieu ; sans mur, au centre */
export function symbolesDepuisEquipements(equipements, pieces, rect, nouvelId = i => 's' + (i + 1)) {
  const ROT = { haut: 0, droite: 90, bas: 180, gauche: 270 };
  return (equipements || []).map((e, i) => {
    const t = TYPES_SYMBOLE.find(x => x[0] === e.type), p = (pieces || []).find(x => x.id === e.piece), r = p && rect.get(p.id); if (!t || !r) return null;
    const L = t[3], W = t[4], lx = r.x1 - r.x0, ly = r.y1 - r.y0, cote = e.cote, pos = nb(e.position);
    const le = (long, taille) => Math.max(taille / 2, Math.min(long - taille / 2, pos != null ? pos + taille / 2 : long / 2));
    let x = (r.x0 + r.x1) / 2, y = (r.y0 + r.y1) / 2;
    if (cote === 'haut') { x = r.x0 + le(lx, L); y = r.y0 + W / 2 + 0.02; }
    else if (cote === 'bas') { x = r.x0 + le(lx, L); y = r.y1 - W / 2 - 0.02; }
    else if (cote === 'gauche') { x = r.x0 + W / 2 + 0.02; y = r.y0 + le(ly, L); }
    else if (cote === 'droite') { x = r.x1 - W / 2 - 0.02; y = r.y0 + le(ly, L); }
    return { id: String(nouvelId(i)), type: t[0], etage: Number.isInteger(p.etage) ? p.etage : 0, x: r3(x), y: r3(y), rot: cote ? ROT[cote] : 0, l: L, w: W };
  }).filter(Boolean);
}
