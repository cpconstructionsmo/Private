/* Le dessin du terrain, le même à l'écran et sur le plan de masse (PCMI 2) :
   courbes de niveau, plateformes et leurs talus (les « peignes » du
   dessinateur : un trait long, un trait court, du haut vers le pied),
   réseaux (couleur et trait conventionnels, avec leur code), équipements,
   arbres (existant, à planter, à abattre). Il ne calcule rien de métier :
   building/terrassement.ts le fait. */
import type { Floor, Network, NetworkItem, Platform, Plot, Point, Tree } from '../model/types';
import { courbesDeNiveau, NOMS_RESEAUX, talusDe, altitudePlateforme } from '../building/terrassement';
import { versEcran, type Camera } from './camera';

export const NOMS_EQUIPEMENTS: Record<NetworkItem['kind'], { libelle: string; code: string }> = {
  regard: { libelle: 'Regard', code: 'R' }, branchement: { libelle: 'Boîte de branchement', code: 'BB' }, compteur_eau: { libelle: 'Compteur d’eau', code: 'CE' },
  coffret_elec: { libelle: 'Coffret électrique', code: 'CF' }, chambre_telecom: { libelle: 'Chambre télécom', code: 'CT' }, coffret_gaz: { libelle: 'Coffret gaz', code: 'CG' },
  infiltration: { libelle: 'Puits d’infiltration', code: 'PI' }, cuve_ep: { libelle: 'Cuve de récupération EP', code: 'CEP' }, assainissement: { libelle: 'Assainissement autonome', code: 'ANC' },
};
export const ETATS_ARBRES: Record<Tree['state'], string> = { existing: 'Arbre existant (conservé)', planted: 'Arbre à planter', felled: 'Arbre à abattre' };

export interface OptionsTerrain { courbes?: number | null; choisis?: ReadonlySet<string> }

const ligne = (ctx: CanvasRenderingContext2D, cam: Camera, P: readonly Point[], ferme = false) => {
  ctx.beginPath();
  P.forEach((q, i) => { const e = versEcran(cam, q); if (i) ctx.lineTo(e.x, e.y); else ctx.moveTo(e.x, e.y) });
  if (ferme) ctx.closePath();
};

/** les courbes de niveau, sous tout le reste */
export function dessinerCourbes(ctx: CanvasRenderingContext2D, cam: Camera, t: Plot, pas: number): void {
  const C = courbesDeNiveau(t, pas);
  /* peu de courbes (terrain presque plat) : chacune porte sa cote, sinon les maîtresses seules */
  const toutes = C.length <= 8;
  for (const c of C) {
    ctx.strokeStyle = c.maitresse ? '#9A6A3E' : '#C9A27C'; ctx.lineWidth = c.maitresse ? 1.1 : 0.6; ctx.setLineDash([]);
    ctx.beginPath();
    for (const [a, b] of c.segments) { const p = versEcran(cam, a), q = versEcran(cam, b); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y) }
    ctx.stroke();
    if ((c.maitresse || toutes) && c.segments.length) {
      /* sa cote, sur le segment le plus long */
      const [a, b] = c.segments.reduce((m, s) => (Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y) > Math.hypot(m[1].x - m[0].x, m[1].y - m[0].y) ? s : m));
      const p = versEcran(cam, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      ctx.fillStyle = '#9A6A3E'; ctx.font = '600 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.z.toFixed(2).replace('.', ','), p.x, p.y - 5);
    }
  }
}

export function dessinerPlateforme(ctx: CanvasRenderingContext2D, cam: Camera, t: Plot | null, o: Platform, sel = false): void {
  /* le talus d'abord : ses peignes, puis son pied en tirets */
  const ta = t ? talusDe(t, o) : null;
  if (ta) {
    ctx.lineWidth = 0.6; ctx.setLineDash([]);
    ta.rayons.forEach((r, i) => {
      if (r.genre === 'aucun') return;
      ctx.strokeStyle = r.genre === 'deblai' ? '#8C6A4A' : '#5E7B4A';
      const fin = i % 2 ? { x: r.haut.x + (r.pied.x - r.haut.x) * 0.5, y: r.haut.y + (r.pied.y - r.haut.y) * 0.5 } : r.pied;
      ligne(ctx, cam, [r.haut, fin]); ctx.stroke();
    });
    ctx.strokeStyle = '#7A6A5A'; ctx.setLineDash([4, 3]); ligne(ctx, cam, ta.pied, true); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.fillStyle = 'rgba(176,170,160,.28)'; ctx.strokeStyle = sel ? '#E8743B' : '#5A5348'; ctx.lineWidth = sel ? 2.2 : 1.2;
  ligne(ctx, cam, o.contour, true); ctx.fill(); ctx.stroke();
  /* son niveau, sous son contour (le milieu est souvent sous la maison) */
  const E = o.contour.map(q => versEcran(cam, q)), e = { x: E.reduce((s, q) => s + q.x, 0) / E.length, y: Math.max(...E.map(q => q.y)) - 2 };
  const ngf = t ? altitudePlateforme(t, o) : null;
  ctx.fillStyle = '#4A443B'; ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText((o.label ? o.label + ' : ' : 'Plateforme ') + (o.level >= 0 ? '+' : '') + (o.level / 1000).toFixed(2).replace('.', ',') + (ngf !== null ? ' (' + ngf.toFixed(2).replace('.', ',') + ' NGF)' : ''), e.x, e.y + 14);
}

export function dessinerReseau(ctx: CanvasRenderingContext2D, cam: Camera, r: Network, sel = false): void {
  const N = NOMS_RESEAUX[r.kind];
  ctx.strokeStyle = sel ? '#E8743B' : N.couleur; ctx.lineWidth = sel ? 2.6 : 1.8; ctx.setLineDash(N.tirets);
  ligne(ctx, cam, r.points); ctx.stroke(); ctx.setLineDash([]);
  /* le code au milieu du plus long tronçon */
  let k = 0, L = -1;
  for (let i = 1; i < r.points.length; i++) { const d = Math.hypot(r.points[i]!.x - r.points[i - 1]!.x, r.points[i]!.y - r.points[i - 1]!.y); if (d > L) { L = d; k = i } }
  const a = versEcran(cam, r.points[k - 1]!), b = versEcran(cam, r.points[k]!);
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, txt = N.code + (r.spec ? ' ' + r.spec : '');
  ctx.font = '700 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(txt).width + 6;
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(m.x - w / 2, m.y - 6, w, 12);
  ctx.fillStyle = N.couleur; ctx.fillText(txt, m.x, m.y);
}

export function dessinerEquipement(ctx: CanvasRenderingContext2D, cam: Camera, o: NetworkItem, sel = false): void {
  const e = versEcran(cam, o.position), s = 7;
  ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = sel ? '#E8743B' : '#1A2B36'; ctx.lineWidth = sel ? 2 : 1.1;
  ctx.beginPath();
  if (o.kind === 'regard' || o.kind === 'branchement') ctx.rect(e.x - s, e.y - s, 2 * s, 2 * s); else ctx.arc(e.x, e.y, s, 0, 2 * Math.PI);
  ctx.fill(); ctx.stroke();
  if (o.kind === 'regard') { ctx.beginPath(); ctx.moveTo(e.x - s, e.y - s); ctx.lineTo(e.x + s, e.y + s); ctx.moveTo(e.x + s, e.y - s); ctx.lineTo(e.x - s, e.y + s); ctx.stroke() }
  ctx.fillStyle = '#1A2B36'; ctx.font = '700 8px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(o.label ?? NOMS_EQUIPEMENTS[o.kind].code, e.x + s + 3, e.y);
}

export function dessinerArbre(ctx: CanvasRenderingContext2D, cam: Camera, o: Tree, sel = false): void {
  const e = versEcran(cam, o.position), r = Math.max(4, (o.diameter / 2) * cam.echelle);
  ctx.lineWidth = sel ? 2 : 1;
  ctx.strokeStyle = sel ? '#E8743B' : o.state === 'felled' ? '#B23A2E' : '#3F7A3A';
  ctx.fillStyle = o.state === 'planted' ? 'rgba(120,180,90,.35)' : o.state === 'existing' ? 'rgba(90,140,70,.25)' : 'rgba(255,255,255,0)';
  /* la couronne, festonnée */
  ctx.beginPath();
  const n = 24;
  for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI, rr = r * (i % 2 ? 0.88 : 1); const x = e.x + rr * Math.cos(a), y = e.y + rr * Math.sin(a); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y) }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(e.x, e.y, 1.6, 0, 2 * Math.PI); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
  if (o.state === 'felled') { ctx.beginPath(); ctx.moveTo(e.x - r, e.y - r); ctx.lineTo(e.x + r, e.y + r); ctx.moveTo(e.x + r, e.y - r); ctx.lineTo(e.x - r, e.y + r); ctx.stroke() }
}

/** le fond cadastral calé : le bâti existant grisé, les limites des parcelles au trait fin, sous tout le reste */
function dessinerCadastre(ctx: CanvasRenderingContext2D, cam: Camera, t: Plot): void {
  const c = t.cadastre;
  if (!c) return;
  ctx.save();
  ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(150,150,150,0.25)'; ctx.strokeStyle = 'rgba(110,110,110,0.7)';
  for (const A of c.batiments) { ligne(ctx, cam, A, true); ctx.fill(); ctx.stroke() }
  ctx.strokeStyle = 'rgba(120,120,120,0.55)';
  for (const p of c.parcelles) if (!p.terrain) { ligne(ctx, cam, p.contour, true); ctx.stroke() }
  /* la parcelle du projet selon le cadastre, en tirets : l'écart avec la limite tracée se voit */
  ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(90,90,90,0.8)';
  for (const p of c.parcelles) if (p.terrain) { ligne(ctx, cam, p.contour, true); ctx.stroke() }
  ctx.restore();
}

/** tout le terrain d'un niveau (celui qui porte la parcelle) : courbes, plateformes et talus, réseaux, équipements, arbres */
export function dessinerTerrain(ctx: CanvasRenderingContext2D, cam: Camera, f: Floor, t: Plot | null, o: OptionsTerrain = {}): void {
  const ch = (id: string) => !!o.choisis?.has(id);
  if (t) dessinerCadastre(ctx, cam, t);
  if (t && o.courbes) dessinerCourbes(ctx, cam, t, o.courbes);
  for (const x of Object.values(f.objects)) if (x.type === 'platform') dessinerPlateforme(ctx, cam, t, x, ch(x.id));
  for (const x of Object.values(f.objects)) if (x.type === 'tree') dessinerArbre(ctx, cam, x, ch(x.id));
  for (const x of Object.values(f.objects)) if (x.type === 'network') dessinerReseau(ctx, cam, x, ch(x.id));
  for (const x of Object.values(f.objects)) if (x.type === 'network_item') dessinerEquipement(ctx, cam, x, ch(x.id));
}
