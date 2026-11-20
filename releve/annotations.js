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
export const OUTILS = [['trait', '✏️ Stylo'], ['fleche', '➡️ Flèche'], ['texte', '🔤 Texte']];
const EP_TRAIT = 0.005, EP_FLECHE = 0.005, TAILLE_TEXTE = 0.034;   // relatifs à la largeur du fond
const MAX_ELEMENTS = 500, MAX_POINTS = 2000, TEXTE_MAX = 200;

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
      return t && x != null && y != null ? { type: 'texte', c, x, y, t } : null;
    }
    return null;
  }).filter(Boolean);
  return { fondId: typeof o.fondId === 'string' ? o.fondId : null, source: o.source === 'planPapier' ? 'planPapier' : 'plan',
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
    } else if (e.type === 'texte') {
      const fs = Math.max(14, TAILLE_TEXTE * W);
      ctx.font = '600 ' + fs + 'px Helvetica, Arial, sans-serif'; ctx.textBaseline = 'middle';
      // un fond blanc léger sous le texte : lisible même sur un mur noir
      const lignes = e.t.split(/\s*\/\s*|\n/).slice(0, 4), w = Math.max(...lignes.map(l => ctx.measureText(l).width));
      ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.fillRect(e.x * W - 3, e.y * H - fs * 0.7, w + 6, fs * 1.25 * lignes.length + fs * 0.15);
      ctx.fillStyle = e.c; lignes.forEach((l, i) => ctx.fillText(l, e.x * W, e.y * H + i * fs * 1.25));
    }
  });
  ctx.restore();
}

/* le résumé de l'écran Scan : « 3 traits, 2 flèches, 4 textes » */
export function resume(elements) {
  const n = t => (elements || []).filter(e => e.type === t).length, mot = (k, s, p) => k ? k + ' ' + (k > 1 ? p : s) : null;
  return [mot(n('trait'), 'trait', 'traits'), mot(n('fleche'), 'flèche', 'flèches'), mot(n('texte'), 'texte', 'textes')].filter(Boolean).join(', ') || 'aucune annotation';
}
