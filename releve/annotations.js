/* Relevé de visite — le plan annoté : une copie du plan (plan dessiné ou
   plan 2D importé) sur laquelle le métreur note les travaux au doigt :
   traits de couleur, flèches, textes.

   Les annotations sont gardées en vecteurs, en coordonnées relatives à
   l'image de fond (0 à 1), pour se redessiner nettes à toute taille :
   à l'écran, en vignette, et dans l'image exportée (photo « planAnnote »).
   Le fond est une copie à part (photo « fondAnnote ») : quand le plan change,
   les annotations ne perdent pas leur fond ; l'écran propose de repartir du
   plan à jour.
   Fonctions pures (sauf rendre, qui dessine sur un contexte 2D donné).
   Tests : tests/t_releve_annotations.js. */

export const COULEURS = [['#D62828', 'Rouge'], ['#1F6FEB', 'Bleu'], ['#2B9348', 'Vert'], ['#111111', 'Noir']];
export const OUTILS = [['trait', '✏️ Stylo'], ['fleche', '➡️ Flèche'], ['texte', '🔤 Texte'], ['symbole', '🪟 Fenêtre, porte…'], ['deplacer', '✋ Déplacer']];
/* les symboles posés sur une copie de plan (une fenêtre à ajouter, une porte, une démolition…) : dessinés en vecteurs,
   à l'échelle relative du plan, pivotés par quarts de tour, de taille réglable (k : millièmes de la largeur du plan) */
export const SYMBOLES = [['fenetre', 'Fenêtre'], ['porte', 'Porte'], ['baie', 'Baie vitrée'], ['passage', 'Ouverture (passage)'], ['demolition', 'Démolition']];
const K_SYMBOLE = { fenetre: 36, porte: 34, baie: 60, passage: 40, demolition: 44 };
export const TEXTE_PT = [3, 120];   // taille réglable d'un texte : millièmes de la largeur du plan
/* le texte : taille (relative à la largeur du plan) et style, choisis à chaque texte */
export const TAILLES = [['xs', 'Mini', 0.013], ['s', 'Petit', 0.022], ['m', 'Moyen', 0.034], ['l', 'Grand', 0.05], ['xl', 'Très grand', 0.072]];
export const POLICES = [['normal', 'Normal'], ['gras', 'Gras'], ['manuscrit', 'Manuscrit'], ['capitales', 'CAPITALES']];
const POLICE_CSS = { normal: '500 {t}px Helvetica, Arial, sans-serif', gras: '800 {t}px Helvetica, Arial, sans-serif',
  manuscrit: 'italic 500 {t}px "Bradley Hand", "Segoe Print", "Comic Sans MS", "Chalkboard SE", cursive', capitales: '700 {t}px Helvetica, Arial, sans-serif' };
const EP_TRAIT = 0.005, EP_FLECHE = 0.005;   // relatifs à la largeur du fond
const MAX_ELEMENTS = 500, MAX_POINTS = 2000, TEXTE_MAX = 400;

const n01 = v => typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0, Math.round(v * 10000) / 10000)) : null;
const couleurOK = c => COULEURS.some(([k]) => k === c) ? c : COULEURS[0][0];

/* une annotation relue (venue du stockage ou d'un autre appareil) : ce qui
   n'a pas la bonne forme est écarté, rien n'est inventé */
export function nettoyer(a) {
  const o = a && typeof a === 'object' ? a : {};
  const elements = (Array.isArray(o.elements) ? o.elements : []).slice(0, MAX_ELEMENTS).map(e => {
    if (!e || typeof e !== 'object') return null;
    const c = couleurOK(e.c);
    if (e.type === 'trait') {
      const p = (Array.isArray(e.p) ? e.p : []).slice(0, MAX_POINTS).map(q => Array.isArray(q) ? [n01(q[0]), n01(q[1])] : null).filter(q => q && q[0] != null && q[1] != null);
      return p.length >= 2 ? { type: 'trait', c, p } : null;
    }
    if (e.type === 'fleche') {
      const a0 = [n01(e.a && e.a[0]), n01(e.a && e.a[1])], b0 = [n01(e.b && e.b[0]), n01(e.b && e.b[1])];
      return [...a0, ...b0].every(v => v != null) && Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) > 0.005 ? { type: 'fleche', c, a: a0, b: b0 } : null;
    }
    if (e.type === 'texte') {
      const t = String(e.t ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, TEXTE_MAX);
      const x = n01(e.x), y = n01(e.y);
      const taille = TAILLES.some(([k]) => k === e.taille) ? e.taille : 'm', police = POLICES.some(([k]) => k === e.police) ? e.police : 'normal';
      const pt = typeof e.pt === 'number' && isFinite(e.pt) ? Math.min(TEXTE_PT[1], Math.max(TEXTE_PT[0], Math.round(e.pt * 10) / 10)) : null;
      return t && x != null && y != null ? { type: 'texte', c, x, y, t, taille, police, ...(pt ? { pt } : {}) } : null;
    }
    if (e.type === 'symbole') {
      const x = n01(e.x), y = n01(e.y), sy = SYMBOLES.some(([k]) => k === e.s) ? e.s : null;
      const rot = typeof e.rot === 'number' && isFinite(e.rot) ? ((Math.round(e.rot / 90) * 90) % 360 + 360) % 360 : 0;
      const k = typeof e.k === 'number' && isFinite(e.k) ? Math.min(160, Math.max(10, Math.round(e.k))) : K_SYMBOLE[sy];
      return sy && x != null && y != null ? { type: 'symbole', c, s: sy, x, y, rot, k } : null;
    }
    return null;
  }).filter(Boolean);
  return { fondId: typeof o.fondId === 'string' ? o.fondId : null, source: o.source === 'planPapier' || o.source === 'dessin' ? o.source : 'plan',
    empreinte: typeof o.empreinte === 'string' ? o.empreinte : null, imageId: typeof o.imageId === 'string' ? o.imageId : null, elements };
}

/* un trait saisi au doigt : on n'en garde que les points utiles (un point
   tous les ~2 pixels d'écran suffit), pour rester léger dans la visite */
export function simplifier(points, pas = 0.002) {
  const res = [];
  (points || []).forEach(p => { const d = res[res.length - 1]; if (!d || Math.hypot(p[0] - d[0], p[1] - d[1]) >= pas) res.push(p); });
  const der = points && points[points.length - 1];
  if (der && res[res.length - 1] !== der) res.push(der);
  return res;
}

/* dessine les annotations sur un contexte 2D de W × H pixels (le fond est déjà posé) */
export function rendre(ctx, W, H, elements) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  (elements || []).forEach(e => {
    ctx.strokeStyle = ctx.fillStyle = e.c;
    if (e.type === 'trait') {
      ctx.lineWidth = Math.max(2, EP_TRAIT * W);
      ctx.beginPath(); e.p.forEach(([x, y], i) => i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)); ctx.stroke();
    } else if (e.type === 'fleche') {
      const ax = e.a[0] * W, ay = e.a[1] * H, bx = e.b[0] * W, by = e.b[1] * H, L = Math.hypot(bx - ax, by - ay) || 1;
      const ux = (bx - ax) / L, uy = (by - ay) / L, t = Math.max(10, W * 0.018);
      ctx.lineWidth = Math.max(2, EP_FLECHE * W);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx - ux * t * 0.6, by - uy * t * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - ux * t - uy * t * 0.5, by - uy * t + ux * t * 0.5); ctx.lineTo(bx - ux * t + uy * t * 0.5, by - uy * t - ux * t * 0.5); ctx.closePath(); ctx.fill();
    } else if (e.type === 'symbole') {
      dessinerSymbole(ctx, W, H, e);
    } else if (e.type === 'texte') {
      const b = boiteTexte(ctx, W, H, e);
      // un fond blanc léger sous le texte : lisible même sur un mur noir
      ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = e.c; b.lignes.forEach((l, i) => ctx.fillText(l, e.x * W, e.y * H + i * b.fs * 1.25));
    }
  });
  ctx.restore();
}

/* la boîte d'un texte, en pixels (fond, et toucher pour le reprendre) ; règle la police du contexte */
export function boiteTexte(ctx, W, H, e) {
  const k = e.pt ? e.pt / 1000 : (TAILLES.find(([x]) => x === e.taille) || TAILLES[2])[2];
  const fs = Math.max(e.pt ? 5 : e.taille === 'xs' ? 8 : e.taille === 's' ? 11 : 14, k * W);
  ctx.font = (POLICE_CSS[e.police] || POLICE_CSS.normal).replace('{t}', fs); ctx.textBaseline = 'middle';
  const lignes = (e.police === 'capitales' ? e.t.toUpperCase() : e.t).split(/\s*\/\s*|\n/).slice(0, 6);
  const w = Math.max(...lignes.map(l => ctx.measureText(l).width));
  return { x: e.x * W - 3, y: e.y * H - fs * 0.7, w: w + 6, h: fs * 1.25 * lignes.length + fs * 0.15, fs, lignes };
}
/* le texte sous le doigt (le plus récent d'abord), ou -1 */
export function texteSous(ctx, W, H, elements, px, py) {
  for (let i = (elements || []).length - 1; i >= 0; i--) {
    const e = elements[i]; if (e.type !== 'texte') continue;
    const b = boiteTexte(ctx, W, H, e);
    if (px >= b.x - 6 && px <= b.x + b.w + 6 && py >= b.y - 6 && py <= b.y + b.h + 6) return i;
  }
  return -1;
}

/* le résumé de l'écran Scan : « 3 traits, 2 flèches, 4 textes » */
export function resume(elements) {
  const n = t => (elements || []).filter(e => e.type === t).length, mot = (k, s, p) => k ? k + ' ' + (k > 1 ? p : s) : null;
  return [mot(n('trait'), 'trait', 'traits'), mot(n('fleche'), 'flèche', 'flèches'), mot(n('texte'), 'texte', 'textes'), mot(n('symbole'), 'symbole', 'symboles')].filter(Boolean).join(', ') || 'aucune annotation';
}

/* ---------- symboles ---------- */
/* dessine un symbole centré sur son point, pivoté, de longueur L = k ‰ de la largeur du plan */
function dessinerSymbole(ctx, W, H, e) {
  const L = Math.max(10, (e.k || K_SYMBOLE[e.s]) / 1000 * W), ep = Math.max(1.5, L * 0.07);
  ctx.save(); ctx.translate(e.x * W, e.y * H); ctx.rotate((e.rot || 0) * Math.PI / 180);
  ctx.strokeStyle = ctx.fillStyle = e.c; ctx.lineWidth = ep; ctx.lineCap = 'butt'; ctx.setLineDash([]);
  const blanc = (x, y, w, h) => { ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h); ctx.restore(); };
  if (e.s === 'fenetre') {
    // un cadre étroit avec le trait du vitrage au milieu
    blanc(-L / 2, -L * 0.14, L, L * 0.28); ctx.strokeRect(-L / 2, -L * 0.14, L, L * 0.28);
    ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke();
  } else if (e.s === 'baie') {
    // une baie coulissante : deux vantaux qui se chevauchent
    blanc(-L / 2, -L * 0.1, L, L * 0.2); ctx.strokeRect(-L / 2, -L * 0.1, L, L * 0.2);
    ctx.beginPath(); ctx.moveTo(-L / 2, -L * 0.035); ctx.lineTo(L * 0.1, -L * 0.035); ctx.moveTo(-L * 0.1, L * 0.035); ctx.lineTo(L / 2, L * 0.035); ctx.stroke();
  } else if (e.s === 'porte') {
    // le vantail ouvert à 90° et son arc de débattement
    blanc(-L / 2, -L * 0.06, L, L * 0.12);
    ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(-L / 2, -L); ctx.stroke();
    ctx.lineWidth = Math.max(1, ep * 0.6); ctx.beginPath(); ctx.arc(-L / 2, 0, L, -Math.PI / 2, 0); ctx.stroke();
  } else if (e.s === 'passage') {
    // une ouverture à percer dans un mur : pointillés entre deux repères
    ctx.setLineDash([L * 0.12, L * 0.09]); ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(-L / 2, -L * 0.16); ctx.lineTo(-L / 2, L * 0.16); ctx.moveTo(L / 2, -L * 0.16); ctx.lineTo(L / 2, L * 0.16); ctx.stroke();
  } else if (e.s === 'demolition') {
    // un cadre hachuré en croix : à démolir
    ctx.setLineDash([L * 0.1, L * 0.07]); ctx.strokeRect(-L / 2, -L * 0.2, L, L * 0.4); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(-L / 2, -L * 0.2); ctx.lineTo(L / 2, L * 0.2); ctx.moveTo(-L / 2, L * 0.2); ctx.lineTo(L / 2, -L * 0.2); ctx.stroke();
  }
  ctx.restore();
}

/* l'élément sous le doigt (le plus récent d'abord), ou -1 : texte (sa boîte), symbole (son disque), flèche et trait (leur ligne) */
export function elementSous(ctx, W, H, elements, px, py) {
  const dseg = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); };
  const tol = Math.max(12, W * 0.012);
  for (let i = (elements || []).length - 1; i >= 0; i--) {
    const e = elements[i];
    if (e.type === 'texte') { const b = boiteTexte(ctx, W, H, e); if (px >= b.x - 6 && px <= b.x + b.w + 6 && py >= b.y - 6 && py <= b.y + b.h + 6) return i; }
    else if (e.type === 'symbole') { const L = Math.max(10, (e.k || 36) / 1000 * W); if (Math.hypot(px - e.x * W, py - e.y * H) <= Math.max(L * 0.6, tol)) return i; }
    else if (e.type === 'fleche') { if (dseg(e.a[0] * W, e.a[1] * H, e.b[0] * W, e.b[1] * H) <= tol) return i; }
    else if (e.type === 'trait') { for (let j = 1; j < e.p.length; j++) if (dseg(e.p[j - 1][0] * W, e.p[j - 1][1] * H, e.p[j][0] * W, e.p[j][1] * H) <= tol) return i; }
  }
  return -1;
}
/* l'élément déplacé de (dx, dy) relatifs au plan */
export function decaler(e, dx, dy) {
  if (e.type === 'texte' || e.type === 'symbole') return { ...e, x: e.x + dx, y: e.y + dy };
  if (e.type === 'fleche') return { ...e, a: [e.a[0] + dx, e.a[1] + dy], b: [e.b[0] + dx, e.b[1] + dy] };
  if (e.type === 'trait') return { ...e, p: e.p.map(([x, y]) => [x + dx, y + dy]) };
  return e;
}
/* le cadre de sélection d'un élément, en pixels */
export function cadreElement(ctx, W, H, e) {
  if (e.type === 'texte') { const b = boiteTexte(ctx, W, H, e); return { x: b.x - 3, y: b.y - 3, w: b.w + 6, h: b.h + 6 }; }
  if (e.type === 'symbole') { const L = Math.max(10, (e.k || 36) / 1000 * W), r = L * 0.65; return { x: e.x * W - r, y: e.y * H - r, w: 2 * r, h: 2 * r }; }
  const pts = e.type === 'fleche' ? [e.a, e.b] : e.p, xs = pts.map(q => q[0] * W), ys = pts.map(q => q[1] * H);
  const x0 = Math.min(...xs) - 6, y0 = Math.min(...ys) - 6; return { x: x0, y: y0, w: Math.max(...xs) + 6 - x0, h: Math.max(...ys) + 6 - y0 };
}
