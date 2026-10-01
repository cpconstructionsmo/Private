/* Le dessin du plan sur un canvas 2D. Il ne calcule rien de métier : il
   lit le plan dérivé (planDuNiveau), les cotes (dessinCote) et la caméra.
   Ordre : grille, fond calé, niveau du dessous en fantôme, pièces,
   maçonnerie, ouvertures, cotes, contraintes, sélection, accrochage. */
import type { Floor, Opening, Point, Underlay } from '../model/types';
import { planDuNiveau, geometrieOuverture } from '../building/plan';
import { mursDroits, type MurDroit } from '../building/murs';
import type { Accroche } from '../building/accrochage';
import { centroide, mm2EnM2, type Anneau, type Polygone } from '../geometry/polygon';
import { positionDansAnneau } from '../geometry/predicats';
import { ajouter, distance, milieu, multiplier, normaleGauche, normaliser, soustraire } from '../geometry/vecteur';
import { boiteVisible, pasDeGrille, versEcran, type Camera } from './camera';
import { dessinCote, texteCote } from './cotes';

export const COULEURS = {
  fond: '#FBFAF7', grille: '#ECE7DE', grilleForte: '#DDD5C8', encre: '#1A2B36', mur: '#26394A', cloison: '#5E6E79',
  piece: '#F5F1EA', aNommer: '#FBE3DA', texte: '#1A2B36', gris: '#6E7B84', accent: '#C5563A', vert: '#3F7A5A', bleu: '#2C4A5E', fantome: '#B9C2C8',
};

export interface Scene {
  niveau: Floor;
  dessous?: Floor | null;
  selection: string | null;
  accroche: Accroche | null;
  /** les images des fonds, par fileKey (chargées par l'application) */
  images: Map<string, { image: CanvasImageSource; largeur: number; hauteur: number }>;
  /** extrémités tirables visibles (outil de sélection) */
  sommets: boolean;
  /** un mot près du curseur (longueur du mur en cours, par exemple) */
  etiquette?: { point: Point; texte: string } | null;
}

const m2 = (v: number) => mm2EnM2(v).toFixed(2).replace('.', ',') + ' m²';

export function dessiner(ctx: CanvasRenderingContext2D, cam: Camera, s: Scene, dpr = 1): void {
  const E = (p: Point) => versEcran(cam, p);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COULEURS.fond;
  ctx.fillRect(0, 0, cam.largeur, cam.hauteur);
  grille(ctx, cam);

  /* fonds calés du niveau */
  for (const o of Object.values(s.niveau.objects)) if (o.type === 'underlay') fond(ctx, cam, o, s, dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  /* le niveau du dessous, en fantôme */
  if (s.dessous) {
    ctx.strokeStyle = COULEURS.fantome; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    for (const p of planDuNiveau(s.dessous).maconnerie) { chemin(ctx, cam, p); ctx.stroke() }
    ctx.setLineDash([]);
  }

  const plan = planDuNiveau(s.niveau);
  /* pièces */
  for (const z of plan.zones) {
    ctx.fillStyle = z.piece ? COULEURS.piece : COULEURS.aNommer;
    chemin(ctx, cam, z.polygone); ctx.fill();
  }
  /* maçonnerie (ouvertures découpées) */
  ctx.fillStyle = COULEURS.mur; ctx.strokeStyle = COULEURS.encre; ctx.lineWidth = 1;
  for (const p of plan.maconnerieOuverte) { chemin(ctx, cam, p); ctx.fill('evenodd') }
  /* axe des murs, très fin, aux forts zooms */
  if (cam.echelle > 0.08) {
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.setLineDash([6, 4]);
    for (const w of mursDroits(s.niveau)) { const a = E(w.axis.a), b = E(w.axis.b); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke() }
    ctx.setLineDash([]);
  }
  /* ouvertures */
  const murs = new Map(mursDroits(s.niveau).map(w => [w.id, w]));
  for (const o of Object.values(s.niveau.objects)) {
    if (o.type !== 'opening') continue;
    const w = murs.get(o.hostWallId);
    /* sens inconnu (plan importé) : la porte s'ouvre côté pièce, jamais vers l'extérieur */
    const b = plan.baies.find(x => x.id === o.id);
    if (w) ouverture(ctx, cam, w, o, o.id === s.selection, b ? b.cotes[0] !== 'extérieur' : true);
  }
  /* noms et surfaces */
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const z of plan.zones) {
    const c = z.piece && positionDansAnneau(z.piece.seed, z.polygone.contour) === 'dedans' ? z.piece.seed : centroide(z.polygone.contour);
    const e = E(c);
    ctx.fillStyle = z.piece ? COULEURS.texte : COULEURS.accent;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(z.piece ? z.piece.name : 'À nommer', e.x, e.y - 8);
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = COULEURS.gris;
    ctx.fillText(m2(z.aire), e.x, e.y + 8);
  }
  /* cotes */
  for (const o of Object.values(s.niveau.objects)) {
    if (o.type !== 'dimension') continue;
    const d = dessinCote(s.niveau, o);
    if (!d) continue;
    const sel = o.id === s.selection, coul = sel ? COULEURS.accent : o.driving ? COULEURS.bleu : COULEURS.gris;
    const a = E(d.ligne[0]), b = E(d.ligne[1]), p = E(d.de), q = E(d.vers);
    ctx.strokeStyle = coul; ctx.fillStyle = coul; ctx.lineWidth = sel ? 1.6 : 1;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(a.x, a.y); ctx.moveTo(q.x, q.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    for (const t of [a, b]) { ctx.beginPath(); ctx.moveTo(t.x - 4, t.y + 4); ctx.lineTo(t.x + 4, t.y - 4); ctx.stroke() }
    const tx = E(d.texte);
    ctx.save(); ctx.translate(tx.x, tx.y); ctx.rotate(-d.angle);
    ctx.font = (o.driving ? '600 ' : '') + '11px system-ui, sans-serif';
    ctx.fillText(texteCote(d.valeur) + (o.driving ? ' 🔒' : ''), 0, -8);
    ctx.restore();
  }
  /* contraintes : un signe au milieu du mur */
  const signes: Record<string, string> = { horizontal: '═', vertical: '‖', parallel: '∥', perpendicular: '⊥', length: '↔', angle: '∠' };
  const parMur = new Map<string, string[]>();
  for (const o of Object.values(s.niveau.objects)) if (o.type === 'constraint') for (const id of o.walls) (parMur.get(id) ?? parMur.set(id, []).get(id)!).push(signes[o.kind] ?? '?');
  ctx.font = '600 11px system-ui, sans-serif';
  for (const [id, L] of parMur) {
    const w = murs.get(id);
    if (!w) continue;
    const n = normaleGauche(normaliser(soustraire(w.axis.b, w.axis.a)));
    const e = E(ajouter(milieu(w.axis.a, w.axis.b), multiplier(n, w.thickness / 2 + 14 / cam.echelle)));
    const t = L.join(' ');
    ctx.fillStyle = 'rgba(255,255,255,.9)'; const l = ctx.measureText(t).width + 6;
    ctx.fillRect(e.x - l / 2, e.y - 8, l, 16);
    ctx.fillStyle = COULEURS.vert; ctx.fillText(t, e.x, e.y);
  }

  /* sélection */
  const sel = s.selection ? s.niveau.objects[s.selection] : undefined;
  ctx.strokeStyle = COULEURS.accent; ctx.lineWidth = 2;
  if (sel?.type === 'wall') {
    const c = plan.murs.find(m => m.id === sel.id);
    if (c) { chemin(ctx, cam, { contour: c.contour }); ctx.stroke() }
  } else if (sel?.type === 'room') {
    const z = plan.zones.find(z => z.piece?.id === sel.id);
    if (z) { chemin(ctx, cam, z.polygone); ctx.stroke() }
  }
  /* extrémités tirables */
  if (s.sommets) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = COULEURS.accent; ctx.lineWidth = 1.2;
    const vus: Point[] = [];
    for (const w of mursDroits(s.niveau)) for (const p of [w.axis.a, w.axis.b]) {
      if (vus.some(v => distance(v, p) < 0.01)) continue;
      vus.push(p);
      if (sel?.type !== 'wall' || !(distance(p, (sel as MurDroit).axis.a) < 0.01 || distance(p, (sel as MurDroit).axis.b) < 0.01)) continue;
      const e = E(p); ctx.fillRect(e.x - 4, e.y - 4, 8, 8); ctx.strokeRect(e.x - 4, e.y - 4, 8, 8);
    }
  }

  /* accrochage */
  if (s.accroche && s.accroche.genre !== 'libre') marque(ctx, cam, s.accroche);
  if (s.etiquette) {
    const e = E(s.etiquette.point);
    ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'left';
    const l = ctx.measureText(s.etiquette.texte).width + 10;
    ctx.fillStyle = COULEURS.encre; ctx.fillRect(e.x + 14, e.y + 10, l, 20);
    ctx.fillStyle = '#fff'; ctx.fillText(s.etiquette.texte, e.x + 19, e.y + 20);
  }
}

function grille(ctx: CanvasRenderingContext2D, cam: Camera): void {
  const p = pasDeGrille(cam), b = boiteVisible(cam);
  ctx.lineWidth = 1;
  for (const [pas, coul] of [[p, COULEURS.grille], [p * 10, COULEURS.grilleForte]] as const) {
    if (pas * cam.echelle < 6) continue;
    ctx.strokeStyle = coul; ctx.beginPath();
    for (let x = Math.ceil(b.xmin / pas) * pas; x <= b.xmax; x += pas) { const e = versEcran(cam, { x, y: 0 }).x; ctx.moveTo(Math.round(e) + .5, 0); ctx.lineTo(Math.round(e) + .5, cam.hauteur) }
    for (let y = Math.ceil(b.ymin / pas) * pas; y <= b.ymax; y += pas) { const e = versEcran(cam, { x: 0, y }).y; ctx.moveTo(0, Math.round(e) + .5); ctx.lineTo(cam.largeur, Math.round(e) + .5) }
    ctx.stroke();
  }
}

function fond(ctx: CanvasRenderingContext2D, cam: Camera, u: Underlay, s: Scene, dpr: number): void {
  const img = s.images.get(u.fileKey);
  if (!img) return;
  /* image (u, v vers le bas) → plan → écran : une seule matrice (voir building/fond.ts) */
  const t = u.transform, k = cam.echelle, c = Math.cos(t.rotation), sn = Math.sin(t.rotation);
  ctx.setTransform(dpr * k * t.scale * c, -dpr * k * t.scale * sn, dpr * k * t.scale * sn, dpr * k * t.scale * c,
    dpr * ((t.tx - cam.centre.x) * k + cam.largeur / 2), dpr * (cam.hauteur / 2 - (t.ty - cam.centre.y) * k));
  ctx.globalAlpha = u.opacity;
  ctx.drawImage(img.image, 0, 0, img.largeur, img.hauteur);
  ctx.globalAlpha = 1;
  if (u.id === s.selection) { ctx.strokeStyle = COULEURS.accent; ctx.lineWidth = 2 / (k * t.scale); ctx.strokeRect(0, 0, img.largeur, img.hauteur) }
}

function chemin(ctx: CanvasRenderingContext2D, cam: Camera, p: Polygone): void {
  ctx.beginPath();
  for (const a of [p.contour, ...(p.trous ?? [])] as Anneau[]) {
    a.forEach((pt, i) => { const e = versEcran(cam, pt); if (i) ctx.lineTo(e.x, e.y); else ctx.moveTo(e.x, e.y) });
    ctx.closePath();
  }
}

function ouverture(ctx: CanvasRenderingContext2D, cam: Camera, w: MurDroit, o: Opening, sel: boolean, gaucheInterieur: boolean): void {
  const g = geometrieOuverture(w, o);
  const E = (p: Point) => versEcran(cam, p);
  const u = normaliser(soustraire(w.axis.b, w.axis.a)), n = normaleGauche(u);
  const r = g.rectangle;           // [a droite, b droite, b gauche, a gauche]
  ctx.strokeStyle = sel ? COULEURS.accent : COULEURS.encre; ctx.lineWidth = sel ? 1.8 : 1;
  /* tableaux */
  ctx.beginPath();
  for (const [p, q] of [[r[0]!, r[3]!], [r[1]!, r[2]!]] as const) { const a = E(p), b = E(q); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y) }
  ctx.stroke();
  if (o.kind === 'window' || o.kind === 'french_window' || o.kind === 'bay') {
    /* vitrage : deux traits fins dans l'épaisseur */
    for (const k of [-0.12, 0.12]) {
      const a = E(ajouter(ajouter(g.centre, multiplier(u, -o.width / 2)), multiplier(n, k * w.thickness)));
      const b = E(ajouter(ajouter(g.centre, multiplier(u, o.width / 2)), multiplier(n, k * w.thickness)));
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  if (o.kind === 'door' || o.kind === 'french_window') {
    /* battant(s) et débattement, côté et sens d'ouverture */
    const sw = o.swing ?? { side: 'left', inward: gaucheInterieur };
    const cote = sw.inward ? 1 : -1;
    const vantaux = o.kind === 'french_window' ? 2 : 1;
    const lv = o.width / vantaux;
    for (let i = 0; i < vantaux; i++) {
      const gauche = vantaux === 2 ? i === 0 : sw.side === 'left';
      const charniere = ajouter(g.centre, multiplier(u, (gauche ? -1 : 1) * o.width / 2));
      const pivot = ajouter(charniere, multiplier(n, cote * w.thickness / 2));
      const bout = ajouter(pivot, multiplier(n, cote * lv));
      const ferme = ajouter(pivot, multiplier(u, (gauche ? 1 : -1) * lv));
      const P = E(pivot), B = E(bout), F = E(ferme);
      ctx.beginPath(); ctx.moveTo(P.x, P.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      const r0 = Math.atan2(B.y - P.y, B.x - P.x), r1 = Math.atan2(F.y - P.y, F.x - P.x);
      let d = r1 - r0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(P.x, P.y, Math.hypot(B.x - P.x, B.y - P.y), r0, r1, d < 0); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  if (o.kind === 'garage_door' || o.kind === 'void') {
    const a = E(r[0]!), b = E(r[2]!), c = E(r[1]!), d = E(r[3]!);
    ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke(); ctx.setLineDash([]);
  }
}

function marque(ctx: CanvasRenderingContext2D, cam: Camera, a: Accroche): void {
  const e = versEcran(cam, a.point);
  ctx.strokeStyle = COULEURS.accent; ctx.fillStyle = COULEURS.accent; ctx.lineWidth = 1.5;
  if (a.guide) {
    const p = versEcran(cam, a.guide.a), q = versEcran(cam, a.guide.b);
    ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.beginPath();
  switch (a.genre) {
    case 'extremite': ctx.rect(e.x - 5, e.y - 5, 10, 10); break;
    case 'intersection': ctx.moveTo(e.x - 6, e.y - 6); ctx.lineTo(e.x + 6, e.y + 6); ctx.moveTo(e.x + 6, e.y - 6); ctx.lineTo(e.x - 6, e.y + 6); break;
    case 'milieu': ctx.moveTo(e.x, e.y - 6); ctx.lineTo(e.x + 6, e.y + 5); ctx.lineTo(e.x - 6, e.y + 5); ctx.closePath(); break;
    case 'perpendiculaire': ctx.moveTo(e.x - 6, e.y + 5); ctx.lineTo(e.x + 6, e.y + 5); ctx.moveTo(e.x, e.y + 5); ctx.lineTo(e.x, e.y - 7); break;
    case 'grille': ctx.moveTo(e.x - 5, e.y); ctx.lineTo(e.x + 5, e.y); ctx.moveTo(e.x, e.y - 5); ctx.lineTo(e.x, e.y + 5); break;
    default: ctx.arc(e.x, e.y, 5, 0, 2 * Math.PI);
  }
  ctx.stroke();
}

/** les libellés des accroches, pour la barre d'état */
export const NOMS_ACCROCHE: Record<Accroche['genre'], string> = {
  extremite: 'extrémité', intersection: 'intersection', milieu: 'milieu', perpendiculaire: 'perpendiculaire', face: 'face du mur',
  axe: 'axe du mur', alignement: 'alignement', grille: 'grille', libre: '',
};
