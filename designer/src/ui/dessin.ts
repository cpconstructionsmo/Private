/* Le dessin du plan sur un canvas 2D. Il ne calcule rien de métier : il
   lit le plan dérivé (planDuNiveau), les cotes (dessinCote) et la caméra.
   Ordre : grille, fond calé, niveau du dessous en fantôme, pièces,
   maçonnerie, ouvertures, cotes, contraintes, sélection, accrochage. */
import type { Floor, Furniture, Opening, Point, Underlay } from '../model/types';
import { planDuNiveau, geometrieOuverture } from '../building/plan';
import { decalagesFaces, mursDroits, mursFictifs, type MurDroit } from '../building/murs';
import { couchesDuNiveau, type BandeCouche } from '../building/couches';
import { MATIERES_COUCHES } from '../catalogue/murs';
import type { Accroche } from '../building/accrochage';
import { dimensionsPiece, type ChaineCotes, type PlaceOuverture } from '../building/cotation';
import { manoeuvreDe } from '../catalogue/ouvertures';
import type { Toiture } from '../building/toiture';
import { fenetresDeToit } from '../building/fenetres-toit';
import { formeDe, traits, versPlan } from '../building/mobilier';
import type { GeometrieEscalier, Marche } from '../building/escalier';
import type { LigneDeCoupe } from '../vue3d/coupe';
import type { Landscape, Plot, Viewpoint } from '../model/types';
import { finitionAmenagement } from '../catalogue/amenagements';
import { materiau, motifEnPlan, type Materiau } from '../catalogue/materiaux';
import { traitsDeMotif, type Segment2 } from '../geometry/hachures';
import { champDeVue, type Recul } from '../building/terrain';
import { centroide, mm2EnM2, type Anneau, type Polygone } from '../geometry/polygon';
import { positionDansAnneau } from '../geometry/predicats';
import { ajouter, distance, milieu, multiplier, normaleGauche, normaliser, soustraire } from '../geometry/vecteur';
import { boiteVisible, pasDeGrille, versEcran, type Camera } from './camera';
import { dessinCote, texteCote } from './cotes';

export const COULEURS = {
  fond: '#FFFFFF', grille: '#ECECEC', grilleForte: '#D6D6D6', encre: '#1A1A1A', mur: '#FFFFFF', cloison: '#5E6E79',
  piece: '#FBE4DA', aNommer: '#FDF1EC', texte: '#1A2B36', gris: '#6E7B84', accent: '#C5563A', vert: '#3F7A5A', bleu: '#2C4A5E', fantome: '#B9C2C8',
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
  /** la cotation automatique (chaînes extérieures), si elle est affichée */
  cotation?: ChaineCotes[];
  /** la place des ouvertures choisies ou en cours de pose, entre leurs murs voisins */
  places?: PlaceOuverture[];
  /** la toiture du niveau : son égout (débord) en tirets */
  toitures?: Toiture[];
  /** les escaliers qui partent de ce niveau (géométrie calculée), et les trémies de ceux qui y arrivent */
  escaliers?: { id: string; geo: GeometrieEscalier }[];
  tremies?: { contour: Point[]; marches: Marche[] }[];
  /** pour l'impression (export PDF) : fond blanc, sans grille */
  impression?: boolean;
  /** plusieurs objets choisis ensemble, et le cadre de sélection en cours */
  groupe?: ReadonlySet<string>;
  cadre?: [Point, Point] | null;
  /** les traits de coupe (vue3d/coupe.ts), avec leurs flèches de regard ; « id » : celui qu'on peut choisir */
  coupes?: (LigneDeCoupe & { id?: string })[];
  /** la parcelle (sur le niveau qui la porte) et ses reculs mesurés ; la limite en cours de tracé */
  parcelle?: { plot: Plot; reculs: Recul[] } | null;
  parcelleEnCours?: Point[];
  /** le plan de présentation : chaque pièce à la couleur de son sol, avec son motif (carreaux, lames) */
  presentation?: boolean;
}

/** une teinte assombrie (k < 1), opaque : les joints se voient pareil à l'écran et sur le papier */
function assombrir(c: string, k: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return c;
  const v = parseInt(m[1]!, 16), f = (x: number) => Math.round(x * k).toString(16).padStart(2, '0');
  return '#' + f(v >> 16 & 255) + f(v >> 8 & 255) + f(v & 255);
}

/* les traits du motif de sol d'une pièce : calculés une fois par zone (le plan d'un niveau est gardé en cache) */
const motifsDeSol = new WeakMap<Polygone, Map<string, Segment2[]>>();
function traitsDeSol(z: Polygone, m: Materiau): Segment2[] {
  let c = motifsDeSol.get(z);
  if (!c) { c = new Map(); motifsDeSol.set(z, c) }
  let t = c.get(m.id);
  if (!t) { const mp = motifEnPlan(m); t = mp ? traitsDeMotif(mp, z) : []; c.set(m.id, t) }
  return t;
}

const m2 = (v: number) => mm2EnM2(v).toFixed(2).replace('.', ',') + ' m²';

export function dessiner(ctx: CanvasRenderingContext2D, cam: Camera, s: Scene, dpr = 1): void {
  const E = (p: Point) => versEcran(cam, p);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = s.impression ? '#FFFFFF' : COULEURS.fond;
  ctx.fillRect(0, 0, cam.largeur, cam.hauteur);
  if (!s.impression) grille(ctx, cam);

  /* fonds calés du niveau */
  for (const o of Object.values(s.niveau.objects)) if (o.type === 'underlay') fond(ctx, cam, o, s, dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  /* les aménagements extérieurs, sous tout le reste */
  for (const o of Object.values(s.niveau.objects)) if (o.type === 'landscape') dessinerAmenagement(ctx, cam, o, o.id === s.selection || !!s.groupe?.has(o.id));
  for (const o of Object.values(s.niveau.objects)) if (o.type === 'viewpoint') dessinerPointDeVue(ctx, cam, o, o.id === s.selection || !!s.groupe?.has(o.id));

  /* le niveau du dessous, en fantôme */
  if (s.dessous) {
    ctx.strokeStyle = COULEURS.fantome; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    for (const p of planDuNiveau(s.dessous).maconnerie) { chemin(ctx, cam, p); ctx.stroke() }
    ctx.setLineDash([]);
  }

  const plan = planDuNiveau(s.niveau);
  /* pièces ; en présentation, à la couleur de leur sol, avec son motif */
  for (const z of plan.zones) {
    const sol = s.presentation && z.piece ? materiau(z.piece.floorFinish) : undefined;
    ctx.fillStyle = sol ? sol.couleur : z.piece ? COULEURS.piece : COULEURS.aNommer;
    chemin(ctx, cam, z.polygone); ctx.fill();
    if (sol) {
      const T = traitsDeSol(z.polygone, sol);
      if (T.length) {
        ctx.strokeStyle = assombrir(sol.couleur, 0.78); ctx.lineWidth = 0.6; ctx.beginPath();
        for (const [a, b] of T) { const p = E(a), q = E(b); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y) }
        ctx.stroke();
      }
    }
  }
  /* mobilier, sous les murs */
  const estChoisi = (id: string) => id === s.selection || !!s.groupe?.has(id);
  for (const o of Object.values(s.niveau.objects)) if (o.type === 'furniture') meuble(ctx, cam, o, estChoisi(o.id));
  /* escaliers et trémies, sous les murs */
  for (const t of s.tremies ?? []) tremie(ctx, cam, t);
  for (const e of s.escaliers ?? []) escalier(ctx, cam, e.geo, estChoisi(e.id));
  /* maçonnerie (ouvertures découpées) */
  /* la maçonnerie : blanche, hachurée à 45°, cernée de noir (les murs composés se dessinent ensuite couche à couche) */
  ctx.fillStyle = COULEURS.mur; ctx.strokeStyle = COULEURS.encre; ctx.lineWidth = 1;
  for (const p of plan.maconnerieOuverte) { chemin(ctx, cam, p); ctx.fill('evenodd') }
  if (plan.maconnerieOuverte.length) {
    ctx.save();
    ctx.beginPath();
    for (const p of plan.maconnerieOuverte) for (const a of [p.contour, ...(p.trous ?? [])] as Anneau[]) { a.forEach((pt, i) => { const e = E(pt); if (i) ctx.lineTo(e.x, e.y); else ctx.moveTo(e.x, e.y) }); ctx.closePath() }
    ctx.clip('evenodd');
    const pas = Math.max(4, 70 * cam.echelle);
    ctx.strokeStyle = '#3A3A3A'; ctx.lineWidth = 0.6; ctx.beginPath();
    const l = cam.largeur, h = cam.hauteur;
    for (let x = -h; x <= l; x += pas) { ctx.moveTo(x, h); ctx.lineTo(x + h, 0) }
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 1.2; ctx.strokeStyle = COULEURS.encre;
    for (const p of plan.maconnerieOuverte) { chemin(ctx, cam, p); ctx.stroke() }
  }
  /* les murs composés : chaque couche à sa place (enduit dehors, isolant, plâtre), cernée d'un trait fin */
  const C = couchesDuNiveau(s.niveau);
  if (C.length) {
    for (const b of C) couche(ctx, cam, b);
    ctx.strokeStyle = COULEURS.encre; ctx.lineWidth = 1.1;
    for (const p of plan.maconnerieOuverte) { chemin(ctx, cam, p); ctx.stroke() }
  }
  /* les cloisons fictives : un trait mixte, sans matière */
  for (const v of mursFictifs(s.niveau)) {
    const a = E(v.axis.a), b = E(v.axis.b), sel = estChoisi(v.id);
    ctx.strokeStyle = sel ? COULEURS.accent : COULEURS.gris; ctx.lineWidth = sel ? 2 : 1.2; ctx.setLineDash([10, 4, 2, 4]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
  }
  /* l'axe (la ligne de tracé) du seul mur choisi : le plan reste net */
  const choisi = s.selection ? s.niveau.objects[s.selection] : undefined;
  if (choisi?.type === 'wall' && 'a' in choisi.axis) {
    const a = E(choisi.axis.a), b = E(choisi.axis.b);
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
  }
  /* ouvertures */
  const murs = new Map(mursDroits(s.niveau).map(w => [w.id, w]));
  for (const o of Object.values(s.niveau.objects)) {
    if (o.type !== 'opening') continue;
    const w = murs.get(o.hostWallId);
    /* sens inconnu (plan importé) : la porte s'ouvre côté pièce, jamais vers l'extérieur */
    const b = plan.baies.find(x => x.id === o.id);
    if (w) ouverture(ctx, cam, w, o, estChoisi(o.id), b ? b.cotes[0] !== 'extérieur' : true);
  }
  /* noms et surfaces */
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const z of plan.zones) {
    const c = z.piece && positionDansAnneau(z.piece.seed, z.polygone.contour) === 'dedans' ? z.piece.seed : centroide(z.polygone.contour);
    const e = E(c);
    /* en présentation, une étiquette claire sous le nom : il reste lisible sur un parquet ou un carrelage sombre */
    if (s.presentation && z.piece?.floorFinish) {
      ctx.font = '600 12px system-ui, sans-serif';
      const l = Math.max(ctx.measureText(z.piece.name).width, 60) + 12;
      const d = dimensionsPiece(z.polygone.contour), trois = !!d && d.profondeur * cam.echelle > 60;      // la ligne des dimensions, si elle s'écrit
      ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.fillRect(e.x - l / 2, e.y - 18, l, trois ? 48 : 34);
    }
    ctx.fillStyle = z.piece ? COULEURS.texte : COULEURS.accent;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(z.piece ? z.piece.name : 'À nommer', e.x, e.y - 8);
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = COULEURS.gris;
    ctx.fillText('S : ' + m2(z.aire), e.x, e.y + 8);
    const d = dimensionsPiece(z.polygone.contour);
    if (d && d.profondeur * cam.echelle > 60) ctx.fillText(texteCote(d.largeur) + ' × ' + texteCote(d.profondeur), e.x, e.y + 22);
  }
  /* la toiture au-dessus : son égout (le débord) en tirets, comme sur un plan d'étage ; ses arêtiers
     traverseraient les pièces, ils restent pour la 3D et le plan de toiture */
  for (const t of s.toitures ?? []) {
    ctx.strokeStyle = COULEURS.gris; ctx.lineWidth = 1;
    ctx.setLineDash([8, 4]); chemin(ctx, cam, { contour: t.egout }); ctx.stroke(); ctx.setLineDash([]);
  }
  /* les fenêtres de toit, au-dessus du plan : en tirets, le vitrage marqué par sa diagonale vers le haut de la pente */
  for (const { o, geo } of fenetresDeToit(s.niveau)) {
    const sel = estChoisi(o.id), P = geo.plan.map(E);
    ctx.strokeStyle = sel ? COULEURS.accent : COULEURS.bleu; ctx.lineWidth = sel ? 1.8 : 1.1; ctx.setLineDash([6, 3]);
    ctx.fillStyle = sel ? 'rgba(197,86,58,.10)' : 'rgba(141,183,207,.18)';
    ctx.beginPath(); P.forEach((e, i) => (i ? ctx.lineTo(e.x, e.y) : ctx.moveTo(e.x, e.y))); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(P[0]!.x, P[0]!.y); ctx.lineTo(P[2]!.x, P[2]!.y); ctx.moveTo(P[1]!.x, P[1]!.y); ctx.lineTo(P[3]!.x, P[3]!.y); ctx.stroke(); ctx.setLineDash([]);
  }
  /* cotation automatique, puis la place des ouvertures choisies */
  if (s.cotation) for (const c of s.cotation) chaine(ctx, cam, c);
  if (s.parcelle) dessinerParcelle(ctx, cam, s.parcelle.plot, s.parcelle.reculs, { sel: s.selection === s.parcelle.plot.id });
  if (s.parcelleEnCours && s.parcelleEnCours.length > 1) {
    const P = s.parcelleEnCours.map(p => versEcran(cam, p));
    ctx.strokeStyle = COULEURS.vert; ctx.lineWidth = 1.6; ctx.setLineDash([12, 4, 2, 4]);
    ctx.beginPath(); P.forEach((e, i) => (i ? ctx.lineTo(e.x, e.y) : ctx.moveTo(e.x, e.y))); ctx.stroke(); ctx.setLineDash([]);
    const a = s.parcelleEnCours[s.parcelleEnCours.length - 2]!, b = s.parcelleEnCours[s.parcelleEnCours.length - 1]!, m = versEcran(cam, milieu(a, b));
    ctx.fillStyle = COULEURS.vert; ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(texteCote(distance(a, b)), m.x, m.y - 4);
  }
  for (const l of s.coupes ?? []) traitDeCoupe(ctx, cam, l, !!l.id && (l.id === s.selection || !!s.groupe?.has(l.id)));
  for (const p of s.places ?? []) place(ctx, cam, p);
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
  /* le groupe choisi : chaque mur et chaque pièce soulignés */
  if (s.groupe?.size) {
    ctx.strokeStyle = COULEURS.accent; ctx.lineWidth = 2;
    for (const c of plan.murs) if (s.groupe.has(c.id)) { chemin(ctx, cam, { contour: c.contour }); ctx.stroke() }
    for (const z of plan.zones) if (z.piece && s.groupe.has(z.piece.id)) { ctx.setLineDash([6, 4]); chemin(ctx, cam, z.polygone); ctx.stroke(); ctx.setLineDash([]) }
  }
  /* le cadre de sélection */
  if (s.cadre) {
    const a = E(s.cadre[0]), b = E(s.cadre[1]);
    ctx.fillStyle = 'rgba(197,86,58,.08)'; ctx.strokeStyle = COULEURS.accent; ctx.lineWidth = 1; ctx.setLineDash([5, 3]);
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); ctx.setLineDash([]);
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

/** une ligne de cote d'un point à un autre, ses traits obliques et ses valeurs */
function ligneCotee(ctx: CanvasRenderingContext2D, cam: Camera, reperes: Point[], coul: string, gras = false): void {
  const E = reperes.map(p => versEcran(cam, p));
  if (E.length < 2) return;
  ctx.strokeStyle = coul; ctx.fillStyle = coul; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(E[0]!.x, E[0]!.y); ctx.lineTo(E[E.length - 1]!.x, E[E.length - 1]!.y);
  for (const t of E) { ctx.moveTo(t.x - 4, t.y + 4); ctx.lineTo(t.x + 4, t.y - 4) }
  ctx.stroke();
  ctx.font = (gras ? '600 ' : '') + '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (let i = 0; i + 1 < E.length; i++) {
    const a = E[i]!, b = E[i + 1]!, texte = texteCote(distance(reperes[i]!, reperes[i + 1]!));
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < ctx.measureText(texte).width + 6) continue;          // trop serré pour être lu : on ne l'écrit pas
    let ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (ang > Math.PI / 2 || ang <= -Math.PI / 2) ang += Math.PI;
    ctx.save(); ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2); ctx.rotate(ang); ctx.fillText(texte, 0, -2); ctx.restore();
  }
  ctx.textBaseline = 'middle';
}

function chaine(ctx: CanvasRenderingContext2D, cam: Camera, c: ChaineCotes): void {
  const h = c.cote === 'bas' || c.cote === 'haut';
  const P = c.reperes.map(v => (h ? { x: v, y: c.ligne } : { x: c.ligne, y: v }));
  ligneCotee(ctx, cam, P, COULEURS.bleu, c.genre === 'hors_tout');
}

function place(ctx: CanvasRenderingContext2D, cam: Camera, p: PlaceOuverture): void {
  /* à 30 px du mur, côté pièce : les deux distances (en rouge, ce sont elles qu'on règle) et la largeur */
  const d = multiplier(p.versPiece, 30 / cam.echelle);
  const [a, b, c, e] = p.points.map(x => ajouter(x, d)) as [Point, Point, Point, Point];
  if (p.avant > 0.5) ligneCotee(ctx, cam, [a, b], COULEURS.accent, true);
  ligneCotee(ctx, cam, [b, c], COULEURS.gris);
  if (p.apres > 0.5) ligneCotee(ctx, cam, [c, e], COULEURS.accent, true);
}

/** un meuble en plan : son symbole (building/mobilier.ts), tourné à sa place ; le premier trait est son contour, rempli */
function meuble(ctx: CanvasRenderingContext2D, cam: Camera, o: Furniture, sel: boolean): void {
  const T = traits(formeDe(o), o.width, o.depth);
  ctx.lineWidth = sel ? 1.6 : 0.9; ctx.strokeStyle = sel ? COULEURS.accent : COULEURS.gris;
  T.forEach((t, i) => {
    const P = t.genre === 'rect' ? [{ x: t.x0, y: t.y0 }, { x: t.x1, y: t.y0 }, { x: t.x1, y: t.y1 }, { x: t.x0, y: t.y1 }]
      : t.genre === 'ellipse' ? Array.from({ length: 32 }, (_, k) => ({ x: t.cx + t.rx * Math.cos(k * Math.PI / 16), y: t.cy + t.ry * Math.sin(k * Math.PI / 16) }))
        : [{ x: t.x0, y: t.y0 }, { x: t.x1, y: t.y1 }];
    const E = P.map(p => versEcran(cam, versPlan(o, p)));
    ctx.beginPath(); E.forEach((e, k) => (k ? ctx.lineTo(e.x, e.y) : ctx.moveTo(e.x, e.y)));
    if (t.genre !== 'ligne') ctx.closePath();
    if (i === 0 && t.genre !== 'ligne' && !t.tirets) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill() }
    ctx.setLineDash(t.tirets ? [5, 4] : []); ctx.stroke(); ctx.setLineDash([]);
  });
}

/** la parcelle : la limite (trait mixte vert), la longueur de chaque côté à l'extérieur, les côtés sur voie
    doublés et nommés, les reculs mesurés (de la maison à chaque côté) et la flèche du nord */
export function dessinerParcelle(ctx: CanvasRenderingContext2D, cam: Camera, t: Plot, R: Recul[], o: { sel?: boolean; nord?: boolean } = {}): void {
  const E = (p: Point) => versEcran(cam, p), C = t.contour.map(E), n = C.length;
  /* sens du contour à l'écran (y inversé) : l'extérieur d'un côté est à droite si le contour tourne dans le sens horaire */
  let a2 = 0; C.forEach((p, i) => { const q = C[(i + 1) % n]!; a2 += p.x * q.y - q.x * p.y });
  const ext = (u: Point) => (a2 > 0 ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x });
  ctx.strokeStyle = o.sel ? COULEURS.accent : COULEURS.vert; ctx.lineWidth = o.sel ? 2.4 : 1.8; ctx.setLineDash([16, 4, 3, 4]);
  ctx.beginPath(); C.forEach((e, i) => (i ? ctx.lineTo(e.x, e.y) : ctx.moveTo(e.x, e.y))); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  C.forEach((a, i) => {
    const b = C[(i + 1) % n]!, L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 30) return;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, v = ext(u), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const voie = t.street.includes(i);
    if (voie) {                                   // le côté sur voie : doublé à l'extérieur, et la voie nommée
      ctx.strokeStyle = COULEURS.gris; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(a.x + v.x * 6, a.y + v.y * 6); ctx.lineTo(b.x + v.x * 6, b.y + v.y * 6); ctx.stroke();
    }
    const ang = Math.atan2(u.y, u.x), lisible = ang > Math.PI / 2 || ang < -Math.PI / 2 ? ang + Math.PI : ang;
    ctx.save(); ctx.translate(m.x + v.x * 14, m.y + v.y * 14); ctx.rotate(lisible);
    ctx.fillStyle = COULEURS.vert; ctx.fillText(texteCote(distance(t.contour[i]!, t.contour[(i + 1) % n]!)), 0, 0);
    if (voie) { ctx.fillStyle = COULEURS.gris; ctx.font = 'italic 11px system-ui, sans-serif'; ctx.fillText('Voie' + (t.streetName ? ' : ' + t.streetName : ' (alignement)'), 0, (v.y * Math.cos(lisible) - v.x * Math.sin(lisible)) > 0 ? 16 : -16); ctx.font = '600 11px system-ui, sans-serif' }
    ctx.restore();
  });
  /* les reculs : de la maison au côté, tiretés, la distance au milieu */
  ctx.strokeStyle = COULEURS.accent; ctx.fillStyle = COULEURS.accent; ctx.lineWidth = 0.9;
  for (const r of R) {
    if (r.distance < 1) continue;
    const a = E(r.de), b = E(r.vers);
    ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    for (const q of [a, b]) { ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, 2 * Math.PI); ctx.fill() }
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    ctx.font = '700 11px system-ui, sans-serif';
    const tx = texteCote(r.distance), w = ctx.measureText(tx).width;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(m.x - w / 2 - 2, m.y - 7, w + 4, 14);
    ctx.fillStyle = COULEURS.accent; ctx.fillText(tx, m.x, m.y);
  }
  /* les points cotés du terrain naturel : une croix et son altitude NGF */
  for (const x of t.spotHeights ?? []) {
    const e = E(x.point);
    ctx.strokeStyle = COULEURS.vert; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(e.x - 4, e.y); ctx.lineTo(e.x + 4, e.y); ctx.moveTo(e.x, e.y - 4); ctx.lineTo(e.x, e.y + 4); ctx.stroke();
    ctx.fillStyle = COULEURS.vert; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(x.ngf.toFixed(2).replace('.', ','), e.x + 3, e.y - 2);
  }
  /* le nord, en haut à droite de la parcelle */
  if (o.nord !== false) {
    const xs = C.map(p => p.x), ys = C.map(p => p.y), c = { x: Math.max(...xs) + 34, y: Math.min(...ys) + 4 };
    nord(ctx, c, t.north, 18);
  }
}

/** un aménagement en plan : une surface teintée de son aspect, ou une clôture (trait fort et petites croix,
    une haie en trait large et vert) */
export function dessinerAmenagement(ctx: CanvasRenderingContext2D, cam: Camera, o: Landscape, sel = false): void {
  const P = o.points.map(p => versEcran(cam, p)), f = finitionAmenagement(o.finish), coul = f?.couleur ?? COULEURS.gris;
  ctx.beginPath(); P.forEach((e, i) => (i ? ctx.lineTo(e.x, e.y) : ctx.moveTo(e.x, e.y)));
  if (o.kind !== 'fence') {
    ctx.closePath();
    ctx.globalAlpha = 0.55; ctx.fillStyle = coul; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = sel ? COULEURS.accent : COULEURS.gris; ctx.lineWidth = sel ? 2 : 0.8; ctx.stroke();
    return;
  }
  if (o.closed) ctx.closePath();
  const haie = o.finish === 'haie-vive';
  ctx.strokeStyle = sel ? COULEURS.accent : haie ? coul : COULEURS.encre; ctx.lineWidth = haie ? Math.max(3, (f?.epaisseur ?? 600) * cam.echelle) : sel ? 2.4 : 1.4;
  ctx.globalAlpha = haie ? 0.7 : 1; ctx.stroke(); ctx.globalAlpha = 1;
  if (haie) return;
  /* une petite croix tous les mètres, le signe d'une clôture */
  const n = o.closed ? P.length : P.length - 1, pas = Math.max(14, 1_000 * cam.echelle);
  ctx.lineWidth = 0.9;
  for (let i = 0; i < n; i++) {
    const a = P[i]!, b = P[(i + 1) % P.length]!, L = Math.hypot(b.x - a.x, b.y - a.y);
    for (let t = pas / 2; t < L; t += pas) {
      const x = a.x + (b.x - a.x) * t / L, y = a.y + (b.y - a.y) * t / L;
      ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x - 3, y + 3); ctx.lineTo(x + 3, y - 3); ctx.stroke();
    }
  }
}

/** une flèche du nord centrée en c (écran), de rayon r ; « angle » : le nord sur le plan, depuis le haut, sens trigonométrique */
export function nord(ctx: CanvasRenderingContext2D, c: Point, angle: number, r: number): void {
  const d = { x: -Math.sin(angle), y: -Math.cos(angle) }, g = { x: -d.y, y: d.x };
  ctx.strokeStyle = COULEURS.encre; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, 2 * Math.PI); ctx.stroke();
  ctx.fillStyle = COULEURS.encre;
  ctx.beginPath(); ctx.moveTo(c.x + d.x * r, c.y + d.y * r); ctx.lineTo(c.x + g.x * r * 0.35, c.y + g.y * r * 0.35); ctx.lineTo(c.x - d.x * r * 0.6, c.y - d.y * r * 0.6); ctx.closePath(); ctx.fill();
  ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('N', c.x + d.x * (r + 9), c.y + d.y * (r + 9));
}

/** le trait de coupe : mixte (trait-point), épais aux deux bouts, une flèche vers ce qu'on regarde et la lettre */
function traitDeCoupe(ctx: CanvasRenderingContext2D, cam: Camera, l: LigneDeCoupe, sel = false): void {
  const a = versEcran(cam, l.a), b = versEcran(cam, l.b), r = normaliser({ x: l.regard.x, y: -l.regard.y });       // le regard, à l'écran (y vers le bas)
  const u = normaliser(soustraire(b, a));
  ctx.strokeStyle = sel ? COULEURS.accent : COULEURS.encre; ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = sel ? 1.6 : 0.8; ctx.setLineDash([14, 3, 2, 3]);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 15px system-ui, sans-serif';
  for (const [p, s] of [[a, 1], [b, -1]] as const) {
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + u.x * s * 16, p.y + u.y * s * 16); ctx.stroke();
    /* la flèche, perpendiculaire au trait, vers ce que montre la coupe */
    const q = ajouter(p, multiplier(r, 18));
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    const g = normaleGauche(r);
    ctx.beginPath(); ctx.moveTo(q.x + r.x * 6, q.y + r.y * 6); ctx.lineTo(q.x + g.x * 4, q.y + g.y * 4); ctx.lineTo(q.x - g.x * 4, q.y - g.y * 4); ctx.closePath(); ctx.fill();
    ctx.fillText(l.nom, p.x - u.x * s * 12 + r.x * 14, p.y - u.y * s * 12 + r.y * 14);
  }
}

/** un point de prise de vue : l'appareil (un disque), le champ (un cône léger), la direction fléchée et la pièce (PCMI 7…) */
export function dessinerPointDeVue(ctx: CanvasRenderingContext2D, cam: Camera, v: Viewpoint, sel = false): void {
  const c = champDeVue(v), A = versEcran(cam, v.a), B = versEcran(cam, v.b), G = versEcran(cam, c.gauche), D = versEcran(cam, c.droite);
  const coul = sel ? COULEURS.accent : COULEURS.bleu, u = normaliser(soustraire(B, A));
  ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(G.x, G.y); ctx.lineTo(D.x, D.y); ctx.closePath();
  ctx.fillStyle = sel ? 'rgba(197,86,58,.12)' : 'rgba(44,74,94,.08)'; ctx.fill();
  ctx.strokeStyle = coul; ctx.lineWidth = 0.8; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(G.x, G.y); ctx.lineTo(A.x, A.y); ctx.lineTo(D.x, D.y); ctx.stroke(); ctx.setLineDash([]);
  ctx.lineWidth = sel ? 2 : 1.4;
  ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
  const g = normaleGauche(u);
  ctx.fillStyle = coul;
  ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(B.x - u.x * 10 + g.x * 4, B.y - u.y * 10 + g.y * 4); ctx.lineTo(B.x - u.x * 10 - g.x * 4, B.y - u.y * 10 - g.y * 4); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(A.x, A.y, 5, 0, 2 * Math.PI); ctx.fill();
  /* la pièce, derrière l'appareil */
  ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(v.piece, A.x - u.x * 26, A.y - u.y * 18);
}

/** le plan de coupe d'un plan d'étage (mm au-dessus du sol) : les marches plus hautes se dessinent en tirets */
const PLAN_DE_COUPE = 1_100;

/** un escalier en plan : ses marches, la ligne de coupe, la ligne de foulée fléchée vers la montée */
function escalier(ctx: CanvasRenderingContext2D, cam: Camera, g: GeometrieEscalier, sel: boolean): void {
  const E = (p: Point) => versEcran(cam, p);
  ctx.lineWidth = sel ? 1.6 : 0.9;
  for (const m of g.marches) {
    const P = m.contour.map(E);
    ctx.beginPath(); P.forEach((e, i) => (i ? ctx.lineTo(e.x, e.y) : ctx.moveTo(e.x, e.y))); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fill();
    ctx.strokeStyle = sel ? COULEURS.accent : COULEURS.encre;
    ctx.setLineDash(m.z > PLAN_DE_COUPE ? [4, 3] : []); ctx.stroke(); ctx.setLineDash([]);
  }
  /* la ligne de coupe : une brisure en travers de la première marche coupée */
  const k = g.marches.findIndex(m => m.z > PLAN_DE_COUPE);
  if (k > 0) {
    const c = g.marches[k]!.contour.map(E), a = c[0]!, b = c[1]!, d = c[3]!;
    const P = (t: number, u: number) => ({ x: a.x + (b.x - a.x) * t + (d.x - a.x) * u, y: a.y + (b.y - a.y) * t + (d.y - a.y) * u });
    ctx.strokeStyle = COULEURS.encre; ctx.lineWidth = 1;
    ctx.beginPath(); [P(-0.05, 0.9), P(0.45, 0.2), P(0.55, 0.8), P(1.05, 0.1)].forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
  }
  /* la ligne de foulée : un rond au départ, une flèche à l'arrivée */
  const F = g.foulee.map(E);
  if (F.length > 1) {
    ctx.strokeStyle = sel ? COULEURS.accent : COULEURS.encre; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 0.9;
    ctx.beginPath(); F.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    ctx.beginPath(); ctx.arc(F[0]!.x, F[0]!.y, 3, 0, 2 * Math.PI); ctx.fill();
    const z = F[F.length - 1]!, y = F[F.length - 2]!, ang = Math.atan2(z.y - y.y, z.x - y.x);
    ctx.beginPath(); ctx.moveTo(z.x, z.y);
    ctx.lineTo(z.x - 9 * Math.cos(ang - 0.4), z.y - 9 * Math.sin(ang - 0.4)); ctx.lineTo(z.x - 9 * Math.cos(ang + 0.4), z.y - 9 * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fill();
  }
}

/** une trémie vue de l'étage : son contour, barré (le vide), et les marches qu'on y voit */
function tremie(ctx: CanvasRenderingContext2D, cam: Camera, t: { contour: Point[]; marches: Marche[] }): void {
  const C = t.contour.map(p => versEcran(cam, p));
  ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); C.forEach((e, i) => (i ? ctx.lineTo(e.x, e.y) : ctx.moveTo(e.x, e.y))); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = COULEURS.gris; ctx.lineWidth = 0.7;
  for (const m of t.marches) { const P = m.contour.map(p => versEcran(cam, p)); ctx.beginPath(); P.forEach((e, i) => (i ? ctx.lineTo(e.x, e.y) : ctx.moveTo(e.x, e.y))); ctx.closePath(); ctx.stroke() }
  ctx.strokeStyle = COULEURS.encre; ctx.lineWidth = 1.2; ctx.setLineDash([6, 3]);
  ctx.beginPath(); C.forEach((e, i) => (i ? ctx.lineTo(e.x, e.y) : ctx.moveTo(e.x, e.y))); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  if (C.length === 4) { ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(C[0]!.x, C[0]!.y); ctx.lineTo(C[2]!.x, C[2]!.y); ctx.moveTo(C[1]!.x, C[1]!.y); ctx.lineTo(C[3]!.x, C[3]!.y); ctx.stroke() }
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

/** une couche de mur composé : sa teinte, puis son motif (hachures de maçonnerie, ondulation d'isolant), dans sa bande */
function couche(ctx: CanvasRenderingContext2D, cam: Camera, b: BandeCouche): void {
  const M = MATIERES_COUCHES[b.matiere];
  ctx.save();
  ctx.beginPath();
  for (const p of b.polygones) for (const a of [p.contour, ...(p.trous ?? [])] as Anneau[]) {
    a.forEach((pt, i) => { const e = versEcran(cam, pt); if (i) ctx.lineTo(e.x, e.y); else ctx.moveTo(e.x, e.y) });
    ctx.closePath();
  }
  ctx.fillStyle = M.couleur; ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(26,43,54,.55)'; ctx.lineWidth = 0.5; ctx.stroke();
  const large = (b.a - b.de) * cam.echelle;                     // la largeur de la bande à l'écran (px)
  if (large >= 2.5 && M.motif !== 'plein') {
    ctx.clip('evenodd');
    ctx.strokeStyle = 'rgba(26,43,54,.5)'; ctx.lineWidth = 0.6; ctx.beginPath();
    const u = normaliser(soustraire(b.axe.b, b.axe.a)), n = normaleGauche(u), L = distance(b.axe.a, b.axe.b);
    const P = (t: number, d: number) => versEcran(cam, ajouter(ajouter(b.axe.a, multiplier(u, t)), multiplier(n, d)));
    const ext = (b.a - b.de) * 4 + 600;
    if (M.motif === 'isolant') {
      /* l'ondulation de l'isolant : un zigzag d'un bord à l'autre, au pas de sa largeur */
      const pas = Math.max(b.a - b.de, 6 / cam.echelle);
      for (let t = -ext, k = 0; t <= L + ext; t += pas / 2, k++) { const e = P(t, k % 2 ? b.a : b.de); if (k) ctx.lineTo(e.x, e.y); else ctx.moveTo(e.x, e.y) }
    } else {
      /* des hachures à 45° (croix : dans les deux sens), au pas de 5 px à l'écran */
      const pas = 5 / cam.echelle, h = b.a - b.de;
      for (let t = -ext; t <= L + ext; t += pas) {
        const a = P(t, b.de), c = P(t + h, b.a); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y);
        if (M.motif === 'croix') { const a2 = P(t + h, b.de), c2 = P(t, b.a); ctx.moveTo(a2.x, a2.y); ctx.lineTo(c2.x, c2.y) }
      }
    }
    ctx.stroke();
  }
  ctx.restore();
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
  const { manoeuvre, vantaux } = manoeuvreDe(o);
  /* le milieu de l'épaisseur : l'axe n'y est pas quand le mur est tracé par une face (rectangle hors tout) */
  const F = decalagesFaces(w), c0 = ajouter(g.centre, multiplier(n, (F.gauche + F.droite) / 2));
  const vitre = o.kind === 'window' || o.kind === 'french_window' || o.kind === 'bay';
  const trait = (p: Point, q: Point) => { const a = E(p), b = E(q); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke() };
  /* un point de la baie : t le long du mur (0 au milieu), k à travers (en part de l'épaisseur, depuis l'axe du tableau) */
  const P = (t: number, k: number) => ajouter(ajouter(c0, multiplier(u, t)), multiplier(n, k * w.thickness));
  if (o.kind === 'garage_door' || o.kind === 'void') {
    const a = E(r[0]!), b = E(r[2]!), c = E(r[1]!), d = E(r[3]!);
    ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke(); ctx.setLineDash([]);
    return;
  }
  if (manoeuvre === 'sliding') {
    /* coulissant : un panneau par vantail, en quinconce dans l'épaisseur, qui se chevauchent un peu */
    const lv = o.width / vantaux, recouvre = Math.min(60, lv / 10);
    for (let i = 0; i < vantaux; i++) {
      const k = (i % 2 ? 0.1 : -0.1), t0 = -o.width / 2 + i * lv - (i ? recouvre : 0), t1 = -o.width / 2 + (i + 1) * lv + (i < vantaux - 1 ? recouvre : 0);
      trait(P(t0, k), P(t1, k));
      if (vitre) trait(P(t0, k + 0.06), P(t1, k + 0.06));
    }
    return;
  }
  if (vitre) for (const k of [-0.12, 0.12]) trait(P(-o.width / 2, k), P(o.width / 2, k));     // vitrage : deux traits fins
  if (manoeuvre === 'fixed') return;
  /* battants : un débattement par vantail, côté et sens d'ouverture ; deux vantaux s'ouvrent depuis les tableaux */
  const sw = o.swing ?? { side: 'left', inward: gaucheInterieur };
  const cote = sw.inward ? 1 : -1;
  const lv = o.width / vantaux;
  /* une fenêtre bat dans la pièce, sur une petite épaisseur de trait : on la dessine plus discrète */
  if (o.kind === 'window') { ctx.lineWidth = sel ? 1.4 : 0.8 }
  for (let i = 0; i < vantaux; i++) {
    const gauche = vantaux === 1 ? sw.side === 'left' : i % 2 === 0;
    const t0 = -o.width / 2 + i * lv, t1 = t0 + lv;
    const charniere = ajouter(c0, multiplier(u, gauche ? t0 : t1));
    const pivot = ajouter(charniere, multiplier(n, cote * w.thickness / 2));
    const bout = ajouter(pivot, multiplier(n, cote * lv));
    const ferme = ajouter(pivot, multiplier(u, (gauche ? 1 : -1) * lv));
    const Pp = E(pivot), B = E(bout), F = E(ferme);
    ctx.beginPath(); ctx.moveTo(Pp.x, Pp.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    const r0 = Math.atan2(B.y - Pp.y, B.x - Pp.x), r1 = Math.atan2(F.y - Pp.y, F.x - Pp.x);
    let d = r1 - r0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(Pp.x, Pp.y, Math.hypot(B.x - Pp.x, B.y - Pp.y), r0, r1, d < 0); ctx.stroke(); ctx.setLineDash([]);
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
    case 'equerre': ctx.moveTo(e.x - 6, e.y - 7); ctx.lineTo(e.x - 6, e.y + 6); ctx.lineTo(e.x + 7, e.y + 6); ctx.rect(e.x - 6, e.y + 1, 5, 5); break;
    default: ctx.arc(e.x, e.y, 5, 0, 2 * Math.PI);
  }
  ctx.stroke();
}

/** les libellés des accroches, pour la barre d'état */
export const NOMS_ACCROCHE: Record<Accroche['genre'], string> = {
  extremite: 'extrémité', intersection: 'intersection', milieu: 'milieu', perpendiculaire: 'perpendiculaire', face: 'face du mur',
  axe: 'axe du mur', alignement: 'alignement', grille: 'grille', equerre: 'équerre', libre: '',
};
