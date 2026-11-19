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
    if (!c) {
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
export function chevauchements(pieces, rect) {
  const L = (pieces || []).filter(p => rect.has(p.id)), res = [];
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = rect.get(L[i].id), b = rect.get(L[j].id);
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (ox > 0.01 && oy > 0.01) res.push([L[i].nom, L[j].nom]);
  }
  return res;
}

/* le contour d'une pièce, avec les coins des voisines posés sur ses murs
   (sens horaire à l'écran : haut, droite, bas, gauche) */
function contour(r, autres) {
  const surSegment = (fixe, axe, debut, fin) => {
    const pts = new Set();
    autres.forEach(o => {
      const coins = [[o.x0, o.y0], [o.x1, o.y0], [o.x1, o.y1], [o.x0, o.y1]];
      coins.forEach(([x, y]) => {
        const sur = axe === 'x' ? Math.abs(y - fixe) < 0.0005 && x > Math.min(debut, fin) + 0.0005 && x < Math.max(debut, fin) - 0.0005
          : Math.abs(x - fixe) < 0.0005 && y > Math.min(debut, fin) + 0.0005 && y < Math.max(debut, fin) - 0.0005;
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

/* le relevé au format du moteur, et son résumé */
export function releveDepuisDessin(pieces, { projet = 'Dessin rapide', hauteur = 2.5 } = {}) {
  const { rect, erreurs } = placer(pieces);
  const ch = chevauchements(pieces, rect);
  ch.forEach(([a, b]) => erreurs.push('« ' + a + ' » et « ' + b + ' » se chevauchent : changez le côté ou le décalage.'));
  const H = nb(hauteur) >= 1.8 && nb(hauteur) <= 6 ? nb(hauteur) : 2.5;
  const posees = (pieces || []).filter(p => rect.has(p.id));
  const donnees = {
    projet, client: '', adresse: '', date: new Date().toISOString().slice(0, 10), hauteurSousPlafond: H, epaisseurMur: 0.1,
    pieces: posees.map(p => { const pts = contour(rect.get(p.id), posees.filter(o => o !== p).map(o => rect.get(o.id)));
      return { id: 'd-' + p.id, nom: String(p.nom || 'Pièce'), points: pts, pointsScan: pts.map(q => [q[0], q[1]]), hauteur: H, dessinRapide: true }; }),
    ouvertures: [], dessinRapide: true,
  };
  const detail = posees.map(p => { const r = rect.get(p.id), L = r.x1 - r.x0, W = r.y1 - r.y0;
    return { id: 'd-' + p.id, nom: String(p.nom || 'Pièce'), etage: 0, sol: Math.round(L * W * 100) / 100, perimetre: Math.round(2 * (L + W) * 100) / 100,
      hauteur: H, murs: Math.round(2 * (L + W) * H * 100) / 100, portes: 0, fenetres: 0 }; });
  const surface = Math.round(detail.reduce((t, d) => t + d.sol, 0) * 100) / 100;
  return { donnees, resume: { projet, pieces: detail.length, surface, ouvertures: 0, detail }, erreurs, rect };
}
