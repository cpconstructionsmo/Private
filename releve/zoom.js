/* Relevé de visite — la visionneuse : une image (photo, plan d'origine,
   esquisse, plan annoté…) ouverte en grand, plein écran. Sur iPhone : pincer
   pour zoomer, glisser pour se déplacer, toucher deux fois pour zoomer ou
   revenir ; sur PC : molette et glisser. ✕ ou Échap la ferme.
   Toute image marquée `data-zoom` s'ouvre ainsi d'un toucher (app.js).
   L'état du zoom (bornes, recentrage) est calculé par des fonctions pures,
   testées dans tests/t_releve_zoom.js. */

export const ZOOM_MIN = 1, ZOOM_MAX = 8;
export const borner = s => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s));

/* zoomer d'un facteur autour d'un point (coordonnées par rapport au centre) :
   le point visé reste sous le doigt */
export function zoomer(etat, facteur, px = 0, py = 0) {
  const s = borner(etat.s * facteur), k = s / etat.s;
  if (s === ZOOM_MIN) return { s, x: 0, y: 0 };
  return { s, x: px - (px - etat.x) * k, y: py - (py - etat.y) * k };
}
/* l'image ne sort pas du cadre : le déplacement est borné à ce qui dépasse */
export function cadrer(etat, largeur, hauteur) {
  const mx = Math.max(0, (largeur * etat.s - largeur) / 2), my = Math.max(0, (hauteur * etat.s - hauteur) / 2);
  return { s: etat.s, x: Math.min(mx, Math.max(-mx, etat.x)), y: Math.min(my, Math.max(-my, etat.y)) };
}

export function ouvrirVisionneuse(src, titre) {
  if (!src || typeof document === 'undefined') return null;
  const ancien = document.querySelector('.visionneuse'); if (ancien) ancien.remove();
  let etat = { s: 1, x: 0, y: 0 };
  const fond = document.createElement('div'); fond.className = 'visionneuse'; fond.setAttribute('role', 'dialog'); fond.setAttribute('aria-label', titre || 'Image agrandie');
  const img = document.createElement('img'); img.src = src; img.alt = titre || ''; img.draggable = false;
  const barre = document.createElement('div'); barre.className = 'barreVisionneuse';
  const bouton = (texte, aria, f) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = texte; b.setAttribute('aria-label', aria); b.onclick = e => { e.stopPropagation(); f(); }; barre.append(b); return b; };
  const appliquer = () => { const r = img.getBoundingClientRect(); etat = cadrer(etat, r.width / etat.s || 1, r.height / etat.s || 1); img.style.transform = 'translate(' + etat.x + 'px,' + etat.y + 'px) scale(' + etat.s + ')'; fond.dataset.zoom = etat.s.toFixed(2); };
  const fermer = () => { fond.remove(); document.removeEventListener('keydown', clavier); };
  const clavier = e => { if (e.key === 'Escape') fermer(); else if (e.key === '+') { etat = zoomer(etat, 1.5); appliquer(); } else if (e.key === '-') { etat = zoomer(etat, 1 / 1.5); appliquer(); } };
  bouton('−', 'Dézoomer', () => { etat = zoomer(etat, 1 / 1.5); appliquer(); });
  bouton('＋', 'Zoomer', () => { etat = zoomer(etat, 1.5); appliquer(); });
  bouton('✕', 'Fermer', fermer).className = 'fermerVisionneuse';
  /* les doigts : un pour glisser (si zoomé), deux pour pincer */
  const doigts = new Map(); let depart = null;
  const centre = (e) => { const r = fond.getBoundingClientRect(); return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2]; };
  img.addEventListener('pointerdown', e => { e.preventDefault(); img.setPointerCapture(e.pointerId); doigts.set(e.pointerId, centre(e));
    const P = [...doigts.values()];
    depart = { etat: { ...etat }, P: P.map(p => [...p]), d: P.length === 2 ? Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]) : 0 }; });
  img.addEventListener('pointermove', e => {
    if (!doigts.has(e.pointerId) || !depart) return;
    doigts.set(e.pointerId, centre(e));
    const P = [...doigts.values()];
    if (P.length >= 2 && depart.d) {
      const d = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), m = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
      etat = zoomer(depart.etat, d / depart.d, m[0], m[1]);
    } else if (P.length === 1 && depart.P.length === 1 && depart.etat.s > 1) {
      etat = { ...depart.etat, x: depart.etat.x + P[0][0] - depart.P[0][0], y: depart.etat.y + P[0][1] - depart.P[0][1] };
    }
    appliquer();
  });
  const lacher = e => { doigts.delete(e.pointerId); const P = [...doigts.values()]; depart = P.length ? { etat: { ...etat }, P: P.map(p => [...p]), d: 0 } : null; };
  img.addEventListener('pointerup', lacher); img.addEventListener('pointercancel', lacher);
  let dernierToucher = 0;
  img.addEventListener('click', e => { const t = Date.now(); if (t - dernierToucher < 320) { const c = centre(e); etat = etat.s > 1 ? { s: 1, x: 0, y: 0 } : zoomer(etat, 2.5, c[0], c[1]); appliquer(); } dernierToucher = t; });
  fond.addEventListener('wheel', e => { e.preventDefault(); const c = centre(e); etat = zoomer(etat, e.deltaY < 0 ? 1.2 : 1 / 1.2, c[0], c[1]); appliquer(); }, { passive: false });
  document.addEventListener('keydown', clavier);
  fond.append(img, barre);
  document.body.append(fond);
  return fond;
}
