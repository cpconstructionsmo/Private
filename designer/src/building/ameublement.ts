/* Meubler les pièces : pour chaque pièce encore vide, une proposition de
   mobilier selon son usage — le lit et ses chevets dans une chambre ; la
   cuisine, le canapé face au meuble TV et la table entourée de ses chaises
   dans la pièce de vie ; baignoire ou douche, vasque (et WC dans une salle
   d'eau) ; le WC dans les toilettes ; lave-linge et sèche-linge au cellier ;
   la place de la voiture au garage. C'est ce que montrent les plans des
   dossiers du cabinet.

   Règles, dans l'ordre où elles s'appliquent :
   - rien de ce qui est posé ne bouge : une pièce qui a déjà un meuble (hors
     placards) n'est pas touchée, et un placard existant reste un obstacle ;
   - les meubles se posent dans la pièce, dos au mur (la table et le canapé
     d'une pièce de vie peuvent être au milieu), sans se chevaucher ;
   - le passage devant une porte ou une baie reste libre : la largeur du
     battant (80 cm au moins) pour une porte qui ouvre dans la pièce, 70 cm
     sinon (porte qui ouvre de l'autre côté, porte-fenêtre, baie) ;
     un meuble plus haut que l'allège (armoire, réfrigérateur, douche) ne se
     pose pas devant une fenêtre ;
   - chaque meuble garde son dégagement d'usage (autour d'un lit double,
     devant une cuisine, une douche, un WC…), libre de tout autre meuble ;
   - ce qui ne trouve pas sa place est dit (« manques »), jamais forcé.
   C'est une proposition : elle passe par les commandes (une seule
   transaction, un seul « Annuler »), puis chaque meuble se règle à la main.
   Les dimensions de dégagement sont des usages de plan, pas des règles. */
import type { Floor, Mm, Point, Room } from '../model/types';
import { modeleMeuble, type ModeleMeuble } from '../catalogue/mobilier';
import { manoeuvreDe } from '../catalogue/ouvertures';
import { planDuNiveau, geometrieOuverture } from './plan';
import { decalagesFaces, mursDroits } from './murs';
import { emprise, formeDe, versPlan } from './mobilier';
import { aireSignee, centroide, type Anneau } from '../geometry/polygon';
import { positionDansAnneau } from '../geometry/predicats';

export interface MeublePropose { modele: ModeleMeuble; position: Point; rotation: number; piece: string }
export interface PieceMeublee { piece: string; nom: string; meubles: string[]; manques: string[]; dejaMeublee?: boolean }
export interface Ameublement { meubles: MeublePropose[]; pieces: PieceMeublee[] }

/** le passage gardé libre devant une porte qui ouvre dans la pièce (mm, depuis la face du mur ; plus si le battant est plus large) */
export const PASSAGE_PORTE: Mm = 800;
/** devant une porte qui ouvre de l'autre côté, ou une baie coulissante : le passage seul */
export const PASSAGE_SEUL: Mm = 700;

type Rect = Point[];
interface Bord {
  a: Point; u: Point; n: Point; L: number;
  fenetres: { t0: number; t1: number; allege: Mm }[];
  passages: { t0: number; t1: number }[];
}
interface Pose { corps: Rect; degagement: Rect | null; groupe: string }
interface Ctx {
  piece: Room; contour: Anneau; trous: Anneau[]; bords: Bord[]; interdits: Rect[]; poses: Pose[]; aire: number; centre: Point;
  /** devant chaque fenêtre, 30 cm où rien de plus haut que son allège ne se pose (même adossé au mur voisin) */
  fenetres: { R: Rect; allege: Mm }[];
  sortie: MeublePropose[]; noms: string[]; manques: string[];
}
interface Essai { bord: Bord; t: number; position: Point; rotation: number }
/** un dégagement, dans le repère du meuble : [x0, y0, x1, y1] (le dos est en −y) */
type Zone4 = [number, number, number, number];

/** les meubles qui ne meublent pas : un placard intégré, une aire de rotation dessinée */
const neMeublePas = (forme: string) => forme === 'placard' || forme === 'aire_rotation';

/**
 * La proposition de mobilier du niveau : les pièces nommées encore vides, meublées selon leur usage.
 * « seulement » : les identifiants des pièces à meubler (toutes les pièces vides sinon).
 */
export function meublerNiveau(f: Floor, seulement?: readonly string[]): Ameublement {
  const plan = planDuNiveau(f);
  const meubles = Object.values(f.objects).filter(o => o.type === 'furniture');
  const aCuisine = plan.zones.some(z => z.piece?.usage === 'kitchen');
  const out: Ameublement = { meubles: [], pieces: [] };
  for (const z of plan.zones) {
    const r = z.piece;
    if (!r || (seulement && !seulement.includes(r.id))) continue;
    let contour = [...z.polygone.contour];
    if (aireSignee(contour) < 0) contour.reverse();
    contour = sansDoublons(contour);
    const dedans = meubles.filter(m => m.type === 'furniture' && positionDansAnneau(m.position, contour) === 'dedans');
    if (dedans.some(m => m.type === 'furniture' && !neMeublePas(formeDe(m)))) {
      out.pieces.push({ piece: r.id, nom: r.name, meubles: [], manques: [], dejaMeublee: true });
      continue;
    }
    const ctx: Ctx = {
      piece: r, contour, trous: (z.polygone.trous ?? []).map(t => [...t]), bords: [], interdits: [], fenetres: [], aire: z.aire, centre: centroide(contour),
      poses: dedans.flatMap(m => (m.type === 'furniture' ? [{ corps: emprise(m), degagement: null, groupe: 'existant' }] : [])),
      sortie: [], noms: [], manques: [],
    };
    preparerBords(ctx, f);
    const nom = r.name.toLowerCase();
    switch (r.usage) {
      case 'bedroom': chambre(ctx, dedans.some(m => m.type === 'furniture' && formeDe(m) === 'placard')); break;
      case 'living': sejour(ctx, /cuisine/.test(nom) || (!aCuisine && (/vie/.test(nom) || z.aire >= 30e6))); break;
      case 'kitchen': cuisineSeule(ctx); break;
      case 'bathroom': salleDEau(ctx, nom); break;
      case 'wc': toilettes(ctx); break;
      case 'garage': garage(ctx); break;
      case 'storage': case 'technical': if (/cellier|buanderie|lingerie|technique|chaufferie/.test(nom)) lingerie(ctx); break;
      default: break;
    }
    if (!ctx.sortie.length && !ctx.manques.length) continue;
    out.meubles.push(...ctx.sortie);
    out.pieces.push({ piece: r.id, nom: r.name, meubles: ctx.noms, manques: ctx.manques });
  }
  return out;
}

/* ------------------------------------------------------------------ géométrie de la pièce */

function sansDoublons(c: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of c) if (!out.length || Math.hypot(p.x - out[out.length - 1]!.x, p.y - out[out.length - 1]!.y) > 0.5) out.push(p);
  if (out.length > 1 && Math.hypot(out[0]!.x - out[out.length - 1]!.x, out[0]!.y - out[out.length - 1]!.y) <= 0.5) out.pop();
  return out;
}

/** les bords de la pièce (contour dans le sens direct : la normale gauche regarde la pièce), avec leurs baies */
function preparerBords(ctx: Ctx, f: Floor): void {
  const M = mursDroits(f), parId = new Map(M.map(w => [w.id, w]));
  const C = ctx.contour;
  for (let i = 0; i < C.length; i++) {
    const a = C[i]!, b = C[(i + 1) % C.length]!, L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1) continue;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    ctx.bords.push({ a, u, n: { x: -u.y, y: u.x }, L, fenetres: [], passages: [] });
  }
  for (const o of Object.values(f.objects)) {
    if (o.type !== 'opening') continue;
    const w = parId.get(o.hostWallId);
    if (!w) continue;
    const g = geometrieOuverture(w, o), F = decalagesFaces(w);
    const La = Math.hypot(w.axis.b.x - w.axis.a.x, w.axis.b.y - w.axis.a.y), uw = { x: (w.axis.b.x - w.axis.a.x) / La, y: (w.axis.b.y - w.axis.a.y) / La };
    const nw = { x: -uw.y, y: uw.x };
    for (const bd of ctx.bords) {
      if (Math.abs(bd.u.x * uw.x + bd.u.y * uw.y) < 0.999) continue;
      /* le bord est-il sur l'une des faces du mur ? */
      const d = (bd.a.x - g.centre.x) * nw.x + (bd.a.y - g.centre.y) * nw.y;
      if (Math.abs(d - F.gauche) > 2 && Math.abs(d - F.droite) > 2) continue;
      const t = (g.centre.x - bd.a.x) * bd.u.x + (g.centre.y - bd.a.y) * bd.u.y;
      const t0 = t - o.width / 2, t1 = t + o.width / 2;
      if (t1 < 0 || t0 > bd.L) continue;
      if (o.kind === 'window') { bd.fenetres.push({ t0, t1, allege: o.sill }); ctx.fenetres.push({ R: rectBord(bd, t0 - 50, t1 + 50, 0, 300), allege: o.sill }); continue }
      /* la porte du garage : c'est par là qu'entre la voiture, sa place s'y aligne */
      if (o.kind === 'garage_door' && ctx.piece.usage === 'garage') { bd.passages.push({ t0, t1 }); continue }
      bd.passages.push({ t0, t1 });
      /* une porte qui ouvre dans la pièce y balaie son battant ; sinon (elle ouvre de l'autre côté, elle
         coulisse) seul le passage compte. Sans sens dit, on la suppose ouvrant dans la pièce. Devant une
         porte-fenêtre ou une baie, le passage seul, comme aux plans : ses vantaux battent au-dessus du
         dégagement des meubles voisins. */
      const { manoeuvre, vantaux } = manoeuvreDe(o);
      const pieceAGauche = Math.abs(d - F.gauche) <= 2;
      const dansLaPiece = o.kind === 'door' && manoeuvre === 'hinged' && (!o.swing || o.swing.inward === pieceAGauche);
      const prof = dansLaPiece ? Math.max(PASSAGE_PORTE, Math.min(o.width / vantaux, 1_000)) : PASSAGE_SEUL;
      ctx.interdits.push(rectBord(bd, t0 - 100, t1 + 100, 0, prof));
    }
  }
}

/** un rectangle posé sur un bord : de t0 à t1 le long du bord, de s0 à s1 vers la pièce */
const rectBord = (b: Bord, t0: number, t1: number, s0: number, s1: number): Rect =>
  [[t0, s0], [t1, s0], [t1, s1], [t0, s1]].map(([t, s]) => ({ x: b.a.x + b.u.x * t! + b.n.x * s!, y: b.a.y + b.u.y * t! + b.n.y * s! }));

/** un rectangle dans le repère d'un meuble */
const zone = (position: Point, rotation: number, [x0, y0, x1, y1]: Zone4): Rect =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => versPlan({ position, rotation }, { x: x!, y: y! }));

const corpsDe = (position: Point, rotation: number, w: Mm, d: Mm): Rect => emprise({ position, rotation, width: w, depth: d });

/** deux polygones convexes se chevauchent-ils de plus de « jeu » (mm) ? (axes séparateurs) */
function seChevauchent(A: Rect, B: Rect, jeu = 1): boolean {
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const p = P[i]!, q = P[(i + 1) % P.length]!, ax = { x: p.y - q.y, y: q.x - p.x }, n = Math.hypot(ax.x, ax.y);
    if (!n) continue;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const s of A) { const k = (s.x * ax.x + s.y * ax.y) / n; a0 = Math.min(a0, k); a1 = Math.max(a1, k) }
    for (const s of B) { const k = (s.x * ax.x + s.y * ax.y) / n; b0 = Math.min(b0, k); b1 = Math.max(b1, k) }
    if (Math.min(a1, b1) - Math.max(a0, b0) <= jeu) return false;
  }
  return true;
}

/** un point strictement dans un rectangle (à 1 mm des bords) */
function dansRect(p: Point, R: Rect): boolean {
  for (let i = 0; i < R.length; i++) {
    const a = R[i]!, b = R[(i + 1) % R.length]!, L = Math.hypot(b.x - a.x, b.y - a.y);
    if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) <= L * 1) return false;
  }
  return true;
}
/** le rectangle dans le sens direct */
const direct = (R: Rect): Rect => (aireSignee(R) < 0 ? [...R].reverse() : R);

/** tout le rectangle est-il dans la pièce (à 1 mm près : un meuble plaqué touche la face) ? */
function dansLaPiece(ctx: Ctx, R0: Rect): boolean {
  const R = direct(R0), c = { x: R.reduce((s, p) => s + p.x, 0) / R.length, y: R.reduce((s, p) => s + p.y, 0) / R.length };
  const I = R.map(p => { const d = Math.hypot(c.x - p.x, c.y - p.y) || 1; return { x: p.x + (c.x - p.x) / d * 1.5, y: p.y + (c.y - p.y) / d * 1.5 } });
  if (I.some(p => positionDansAnneau(p, ctx.contour) === 'dehors')) return false;
  if (ctx.contour.some(v => dansRect(v, R))) return false;
  for (const t of ctx.trous) if (t.some(v => dansRect(v, R)) || I.some(p => positionDansAnneau(p, t) === 'dedans')) return false;
  return true;
}

function libre(ctx: Ctx, corps: Rect, degagement: Rect | null, groupe: string, hauteur: Mm = 0): boolean {
  if (!dansLaPiece(ctx, corps) || (degagement && !dansLaPiece(ctx, degagement))) return false;
  if (ctx.interdits.some(z => seChevauchent(corps, z))) return false;
  if (ctx.fenetres.some(w => w.allege < hauteur && seChevauchent(corps, w.R))) return false;
  for (const p of ctx.poses) {
    if (seChevauchent(corps, p.corps)) return false;
    if (p.groupe !== groupe && p.degagement && seChevauchent(corps, p.degagement)) return false;
    if (p.groupe !== groupe && degagement && seChevauchent(degagement, p.corps)) return false;
  }
  return true;
}

/** devant une fenêtre plus basse que le meuble ? (sur le bord, de t0 à t1) */
const devantFenetre = (b: Bord, t0: number, t1: number, hauteur: Mm): boolean =>
  b.fenetres.some(w => w.allege < hauteur && Math.min(w.t1 + 50, t1) - Math.max(w.t0 - 50, t0) > 0);
const sousFenetre = (b: Bord, t0: number, t1: number): boolean => b.fenetres.some(w => Math.min(w.t1, t1) - Math.max(w.t0, t0) > 0);

/** dos au mur : le meuble sur le bord, à t le long du bord */
const contreMur = (b: Bord, t: number, d: Mm): { position: Point; rotation: number } =>
  ({ position: { x: b.a.x + b.u.x * t + b.n.x * d / 2, y: b.a.y + b.u.y * t + b.n.y * d / 2 }, rotation: Math.atan2(b.n.y, b.n.x) - Math.PI / 2 });

/** la distance d'un point au plus proche passage (porte, baie) de la pièce */
function distPassage(ctx: Ctx, p: Point): number {
  let d = 5_000;
  for (const b of ctx.bords) for (const q of b.passages) {
    const t = (q.t0 + q.t1) / 2, c = { x: b.a.x + b.u.x * t, y: b.a.y + b.u.y * t };
    d = Math.min(d, Math.hypot(p.x - c.x, p.y - c.y));
  }
  return d;
}

/** le meilleur emplacement dos au mur pour un meuble, ou rien */
function meilleurContreMur(ctx: Ctx, m: ModeleMeuble, groupe: string, degagement: Zone4 | null, score: (e: Essai) => number, pas = 100): Essai | null {
  let best: { e: Essai; s: number } | null = null;
  for (const b of ctx.bords) {
    if (b.L < m.largeur) continue;
    const T = new Set<number>([m.largeur / 2, b.L - m.largeur / 2, b.L / 2]);
    for (let t = m.largeur / 2 + pas; t < b.L - m.largeur / 2; t += pas) T.add(t);
    for (const t of T) {
      if (devantFenetre(b, t - m.largeur / 2, t + m.largeur / 2, m.hauteur)) continue;
      const { position, rotation } = contreMur(b, t, m.profondeur);
      const corps = corpsDe(position, rotation, m.largeur, m.profondeur);
      if (!libre(ctx, corps, degagement ? zone(position, rotation, degagement) : null, groupe, m.hauteur)) continue;
      const e = { bord: b, t, position, rotation }, s = score(e);
      if (!best || s > best.s + 1e-9) best = { e, s };
    }
  }
  return best?.e ?? null;
}

function poser(ctx: Ctx, m: ModeleMeuble, position: Point, rotation: number, groupe: string, degagement: Zone4 | null): void {
  const p = { x: Math.round(position.x * 10) / 10, y: Math.round(position.y * 10) / 10 };
  ctx.poses.push({ corps: corpsDe(p, rotation, m.largeur, m.profondeur), degagement: degagement ? zone(p, rotation, degagement) : null, groupe });
  ctx.sortie.push({ modele: m, position: p, rotation, piece: ctx.piece.id });
  ctx.noms.push(m.libelle);
}

/** essaie de poser un meuble à une place donnée (même repère), sans rien chercher d'autre */
function essayer(ctx: Ctx, m: ModeleMeuble, position: Point, rotation: number, groupe: string, degagement: Zone4 | null): boolean {
  if (!libre(ctx, corpsDe(position, rotation, m.largeur, m.profondeur), degagement ? zone(position, rotation, degagement) : null, groupe, m.hauteur)) return false;
  poser(ctx, m, position, rotation, groupe, degagement);
  return true;
}

const M = (id: string): ModeleMeuble => modeleMeuble(id)!;
/** à t le long du bord, le meuble est-il calé dans un angle ? */
const enCoin = (e: Essai, w: Mm) => Math.abs(e.t - w / 2) < 1 || Math.abs(e.t - (e.bord.L - w / 2)) < 1;
const devant = (d: Mm, c: Mm, w: Mm, cotes = 0): Zone4 => [-w / 2 - cotes, -d / 2, w / 2 + cotes, d / 2 + c];

/* ------------------------------------------------------------------ les pièces */

/** une chambre : le lit, tête contre un mur plein, loin de la porte ; ses chevets ; une armoire s'il n'y a pas de placard */
function chambre(ctx: Ctx, aDesPlacards: boolean): void {
  const lits = ctx.aire >= 9e6 ? ['lit-160', 'lit-140', 'lit-90'] : ctx.aire >= 7e6 ? ['lit-140', 'lit-90'] : ['lit-90'];
  let pose: { m: ModeleMeuble; e: Essai; z: Zone4 } | null = null;
  for (const id of lits) {
    const m = M(id), w = m.largeur, d = m.profondeur, double = w >= 1_200;
    /* un lit double se dégage de 50 cm de chaque côté et 60 cm au pied ; un lit simple d'un seul côté */
    const zones: Zone4[] = double ? [[-w / 2 - 500, -d / 2, w / 2 + 500, d / 2 + 600]]
      : [[-w / 2 - 600, -d / 2, w / 2, d / 2 + 600], [-w / 2, -d / 2, w / 2 + 600, d / 2 + 600]];
    /* la tête de lit contre un mur plein, loin de la porte ; un lit double au milieu de son mur */
    const score = (x: Essai) => (sousFenetre(x.bord, x.t - w / 2, x.t + w / 2) ? -3_000 : 0)
      + Math.min(distPassage(ctx, x.position), 4_000) * 0.5 - Math.abs(x.t - x.bord.L / 2) * (double ? 0.8 : 0.1);
    let best: { e: Essai; z: Zone4; s: number } | null = null;
    for (const z of zones) {
      const e = meilleurContreMur(ctx, m, 'lit', z, score);
      if (e && (!best || score(e) > best.s)) best = { e, z, s: score(e) };
    }
    if (best) { pose = { m, e: best.e, z: best.z }; break }
  }
  if (!pose) { ctx.manques.push('Lit : la place manque (90 × 190 cm et son passage)'); return }
  const { m, e, z } = pose;
  poser(ctx, m, e.position, e.rotation, 'lit', z);
  /* les chevets, de part et d'autre de la tête de lit */
  const ch = M('chevet');
  for (const s of [-1, 1]) {
    const t = e.t + s * (m.largeur / 2 + ch.largeur / 2 + 30);
    if (t - ch.largeur / 2 < 0 || t + ch.largeur / 2 > e.bord.L) continue;
    const q = contreMur(e.bord, t, ch.profondeur);
    essayer(ctx, ch, q.position, q.rotation, 'lit', null);
  }
  if (!aDesPlacards) {
    const a = M('armoire-2p');
    const ea = meilleurContreMur(ctx, a, 'armoire', devant(a.profondeur, 700, a.largeur), x => Math.hypot(x.position.x - e.position.x, x.position.y - e.position.y) * 0.2 + Math.min(distPassage(ctx, x.position), 2_000) * 0.1);
    if (ea) poser(ctx, a, ea.position, ea.rotation, 'armoire', devant(a.profondeur, 700, a.largeur));
  }
}

/** une cuisine en ligne contre un mur, sans porte devant : l'évier sous une fenêtre si possible, le réfrigérateur en bout */
function cuisineEnLigne(ctx: Ctx): { centre: Point; e: Essai; longueur: number } | null {
  const COMPOS = [
    ['refrigerateur', 'meuble-bas-60', 'plaque', 'meuble-bas-120', 'evier', 'lave-vaisselle'],
    ['refrigerateur', 'meuble-bas-60', 'plaque', 'meuble-bas-60', 'evier', 'lave-vaisselle'],
    ['refrigerateur', 'plaque', 'meuble-bas-60', 'evier', 'lave-vaisselle'],
    ['refrigerateur', 'plaque', 'evier', 'lave-vaisselle'],
    ['refrigerateur', 'plaque', 'evier'],
  ];
  const DEG = 1_000;
  for (const compo of COMPOS) {
    const L = compo.reduce((s, id) => s + M(id).largeur, 0);
    let best: { s: number; items: { m: ModeleMeuble; position: Point; rotation: number }[]; e: Essai } | null = null;
    for (const b of ctx.bords) {
      if (b.L < L) continue;
      const T0 = new Set<number>([0, b.L - L]);
      for (let t = 100; t < b.L - L; t += 100) T0.add(t);
      for (const ordre of [compo, [...compo].reverse()]) for (const t0 of T0) {
        let t = t0, ok = true, s = 0;
        const items: { m: ModeleMeuble; position: Point; rotation: number }[] = [];
        const essai: Pose[] = [];
        for (const id of ordre) {
          const m = M(id), tc = t + m.largeur / 2;
          if (devantFenetre(b, t, t + m.largeur, m.hauteur)) { ok = false; break }
          const q = contreMur(b, tc, m.profondeur), corps = corpsDe(q.position, q.rotation, m.largeur, m.profondeur);
          const dg = zone(q.position, q.rotation, devant(m.profondeur, DEG, m.largeur));
          if (!libre(ctx, corps, dg, 'cuisine', m.hauteur) || essai.some(p => seChevauchent(corps, p.corps))) { ok = false; break }
          essai.push({ corps, degagement: dg, groupe: 'cuisine' });
          if (id === 'evier' && sousFenetre(b, t, t + m.largeur)) s += 1_500;
          items.push({ m, ...q });
          t += m.largeur;
        }
        if (!ok) continue;
        if (Math.abs(t0) < 1 || Math.abs(t0 - (b.L - L)) < 1) s += 800;
        s += Math.min(distPassage(ctx, contreMur(b, t0 + L / 2, 600).position), 3_000) * 0.2;
        if (!best || s > best.s) best = { s, items, e: { bord: b, t: t0 + L / 2, ...contreMur(b, t0 + L / 2, 600) } };
      }
    }
    if (best) {
      for (const it of best.items) poser(ctx, it.m, it.position, it.rotation, 'cuisine', devant(it.m.profondeur, DEG, it.m.largeur));
      return { centre: best.e.position, e: best.e, longueur: L };
    }
  }
  ctx.manques.push('Cuisine : aucun mur libre de 2,40 m (sans porte devant)');
  return null;
}

/** une table posée au milieu, entourée de ses chaises : au plus près de « cible » */
function tableEtChaises(ctx: Ctx, id: 'table-6' | 'table-4', cible: Point): boolean {
  const t = M(id), ch = M('chaise'), w = t.largeur, d = t.profondeur;
  const DEG: Zone4 = [-w / 2 - 300, -d / 2 - 700, w / 2 + 300, d / 2 + 700];
  /* deux orientations : le long du plus grand mur, ou en travers */
  const grand = ctx.bords.reduce((a, b) => (b.L > a.L ? b : a));
  const r0 = Math.atan2(grand.u.y, grand.u.x);
  const xs = ctx.contour.map(p => p.x), ys = ctx.contour.map(p => p.y);
  let best: { p: Point; r: number; s: number } | null = null;
  for (const r of [r0, r0 + Math.PI / 2]) for (let x = Math.min(...xs); x <= Math.max(...xs); x += 100) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 100) {
    const p = { x, y }, Z = zone(p, r, DEG);
    /* la place des chaises est occupée : ni dans un passage de porte, ni dans le dégagement d'un autre meuble */
    if (!libre(ctx, corpsDe(p, r, w, d), Z, 'table', t.hauteur) || ctx.interdits.some(q => seChevauchent(Z, q))
      || ctx.poses.some(q => q.degagement && seChevauchent(Z, q.degagement))) continue;
    const s = -Math.hypot(x - cible.x, y - cible.y) + (r === r0 ? 50 : 0);
    if (!best || s > best.s) best = { p, r, s };
  }
  if (!best) return false;
  poser(ctx, t, best.p, best.r, 'table', DEG);
  const n = id === 'table-6' ? 3 : 2, ecart = w / n;
  for (const cote of [-1, 1]) for (let i = 0; i < n; i++) {
    const x = -w / 2 + ecart * (i + 0.5), y = cote * (d / 2 + ch.profondeur / 2);
    /* la chaise regarde la table : son devant (+y) vers le centre */
    essayer(ctx, ch, versPlan({ position: best.p, rotation: best.r }, { x, y }), best.r + (cote > 0 ? Math.PI : 0), 'table', null);
  }
  return true;
}

/** la pièce de vie : la cuisine (si elle y est), le coin salon (meuble TV, canapé en face, table basse), la table et ses chaises */
function sejour(ctx: Ctx, avecCuisine: boolean): void {
  let cuisine: { centre: Point; e: Essai; longueur: number } | null = null;
  if (avecCuisine) {
    cuisine = cuisineEnLigne(ctx);
    /* l'îlot, dans une grande pièce : parallèle à la cuisine, à 1,10 m de son plan de travail */
    if (cuisine && ctx.aire >= 40e6) {
      const il = M('ilot'), b = cuisine.e.bord, s = 600 + 1_100 + il.profondeur / 2;
      const p = { x: b.a.x + b.u.x * cuisine.e.t + b.n.x * s, y: b.a.y + b.u.y * cuisine.e.t + b.n.y * s };
      essayer(ctx, il, p, cuisine.e.rotation, 'cuisine', [-il.largeur / 2, -il.profondeur / 2, il.largeur / 2, il.profondeur / 2 + 900]);
    }
  }
  /* le coin salon : le meuble TV contre un mur, le canapé face à lui à 2,40 – 3 m */
  const tv = M('meuble-tv');
  let salon = false;
  for (const cid of ['canape-3p', 'canape-2p']) {
    const c = M(cid);
    let best: { e: Essai; D: number; s: number } | null = null;
    for (const D of [2_600, 2_900, 2_300]) {
      const W = Math.max(tv.largeur, c.largeur);
      const DEG: Zone4 = [-W / 2, -tv.profondeur / 2, W / 2, tv.profondeur / 2 + D];
      const e = meilleurContreMur(ctx, tv, 'salon', DEG, x => {
        const sofa = versPlan(x, { x: 0, y: tv.profondeur / 2 + D + c.profondeur / 2 });
        if (!libre(ctx, corpsDe(sofa, x.rotation + Math.PI, c.largeur, c.profondeur), null, 'salon', c.hauteur)) return -1e9;
        return (sousFenetre(x.bord, x.t - tv.largeur / 2, x.t + tv.largeur / 2) ? -1_500 : 0) + Math.min(distPassage(ctx, x.position), 3_000) * 0.3
          + (cuisine ? Math.min(Math.hypot(x.position.x - cuisine.centre.x, x.position.y - cuisine.centre.y), 6_000) * 0.3 : 0);
      });
      if (!e) continue;
      const sofa = versPlan(e, { x: 0, y: tv.profondeur / 2 + D + c.profondeur / 2 });
      if (!libre(ctx, corpsDe(sofa, e.rotation + Math.PI, c.largeur, c.profondeur), null, 'salon', c.hauteur)) continue;
      const s = (sousFenetre(e.bord, e.t - tv.largeur / 2, e.t + tv.largeur / 2) ? -1_500 : 0) + Math.min(distPassage(ctx, e.position), 3_000) * 0.3
        + (cuisine ? Math.min(Math.hypot(e.position.x - cuisine.centre.x, e.position.y - cuisine.centre.y), 6_000) * 0.3 : 0) - Math.abs(D - 2_600) * 0.1;
      if (!best || s > best.s) best = { e, D, s };
    }
    if (!best) continue;
    const { e, D } = best, W = Math.max(tv.largeur, c.largeur);
    poser(ctx, tv, e.position, e.rotation, 'salon', [-W / 2, -tv.profondeur / 2, W / 2, tv.profondeur / 2 + D]);
    poser(ctx, c, versPlan(e, { x: 0, y: tv.profondeur / 2 + D + c.profondeur / 2 }), e.rotation + Math.PI, 'salon', null);
    const tb = M('table-basse');
    essayer(ctx, tb, versPlan(e, { x: 0, y: tv.profondeur / 2 + D - 450 - tb.profondeur / 2 }), e.rotation, 'salon', null);
    salon = true;
    break;
  }
  if (!salon) {
    const c = M('canape-2p'), e = meilleurContreMur(ctx, c, 'salon', devant(c.profondeur, 900, c.largeur), x => Math.min(distPassage(ctx, x.position), 3_000));
    if (e) poser(ctx, c, e.position, e.rotation, 'salon', devant(c.profondeur, 900, c.largeur));
    else ctx.manques.push('Canapé : la place manque');
  }
  const cible = cuisine ? cuisine.centre : ctx.centre;
  if (!tableEtChaises(ctx, ctx.aire >= 20e6 ? 'table-6' : 'table-4', cible) && !(ctx.aire >= 20e6 && tableEtChaises(ctx, 'table-4', cible))) ctx.manques.push('Table : la place manque (avec le passage autour des chaises)');
}

/** une cuisine fermée : la cuisine en ligne, une table de quatre si la pièce le permet */
function cuisineSeule(ctx: Ctx): void {
  const c = cuisineEnLigne(ctx);
  if (c && ctx.aire >= 12e6) tableEtChaises(ctx, 'table-4', ctx.centre);
}

/** une salle de bains ou d'eau : baignoire (salle de bains) ou douche (salle d'eau) dans un angle, la vasque, le WC d'une salle d'eau */
function salleDEau(ctx: Ctx, nom: string): void {
  const bain = /bain/.test(nom) && !/eau/.test(nom);
  const essais = bain ? ['baignoire-170', 'douche-90'] : ctx.aire >= 6e6 ? ['douche-120', 'douche-90'] : ['douche-90'];
  let ok = false;
  for (const id of essais) {
    const m = M(id), dg = devant(m.profondeur, m.forme === 'douche' ? 700 : 600, m.largeur);
    const e = meilleurContreMur(ctx, m, 'bain', dg, x => (enCoin(x, m.largeur) ? 1_000 : 0) + Math.min(distPassage(ctx, x.position), 3_000) * 0.5, 50);
    if (e) { poser(ctx, m, e.position, e.rotation, 'bain', dg); ok = true; break }
  }
  if (!ok) ctx.manques.push(bain ? 'Baignoire ou douche : la place manque' : 'Douche : la place manque');
  let vasque = false;
  for (const id of ['vasque-double', 'lavabo']) {
    const m = M(id), dg = devant(m.profondeur, 700, m.largeur);
    const e = meilleurContreMur(ctx, m, 'vasque', dg, x => -Math.abs(x.t - x.bord.L / 2) * 0.3 + Math.min(distPassage(ctx, x.position), 2_000) * 0.1, 50);
    if (e) { poser(ctx, m, e.position, e.rotation, 'vasque', dg); vasque = true; break }
  }
  if (!vasque) ctx.manques.push('Vasque : la place manque');
  if (/w\.?c|toilette/.test(nom) || (/eau/.test(nom) && ctx.aire >= 4.5e6)) {
    const m = M('wc-suspendu'), dg = devant(m.profondeur, 600, m.largeur, 150);
    const e = meilleurContreMur(ctx, m, 'wc', dg, x => Math.min(distPassage(ctx, x.position), 3_000), 50);
    if (e) poser(ctx, m, e.position, e.rotation, 'wc', dg);
  }
}

/** les toilettes : le WC face à la porte, au fond ; un lave-mains s'il reste un mur */
function toilettes(ctx: Ctx): void {
  const m = M('wc'), dg = devant(m.profondeur, 600, m.largeur, 150);
  const e = meilleurContreMur(ctx, m, 'wc', dg, x => Math.min(distPassage(ctx, x.position), 3_000) - Math.abs(x.t - x.bord.L / 2) * 0.5, 50);
  if (!e) { ctx.manques.push('WC : la place manque'); return }
  poser(ctx, m, e.position, e.rotation, 'wc', dg);
  const l = M('lave-mains'), dl = devant(l.profondeur, 400, l.largeur);
  const el = meilleurContreMur(ctx, l, 'lave-mains', dl, x => -Math.hypot(x.position.x - e.position.x, x.position.y - e.position.y) * 0.01, 50);
  if (el) poser(ctx, l, el.position, el.rotation, 'lave-mains', dl);
}

/** le cellier, la buanderie : lave-linge et sèche-linge côte à côte, dans un angle si possible */
function lingerie(ctx: Ctx): void {
  const ll = M('lave-linge'), sl = M('seche-linge'), dg = devant(ll.profondeur, 700, ll.largeur);
  const e = meilleurContreMur(ctx, ll, 'linge', dg, x => {
    const voisin = [x.t + ll.largeur, x.t - ll.largeur].some(t => t - sl.largeur / 2 >= 0 && t + sl.largeur / 2 <= x.bord.L
      && libre(ctx, corpsDe(contreMur(x.bord, t, sl.profondeur).position, x.rotation, sl.largeur, sl.profondeur), null, 'linge', sl.hauteur));
    return (voisin ? 2_000 : 0) + (enCoin(x, ll.largeur) ? 800 : 0) + Math.min(distPassage(ctx, x.position), 3_000) * 0.2;
  }, 50);
  if (!e) { ctx.manques.push('Lave-linge : la place manque'); return }
  poser(ctx, ll, e.position, e.rotation, 'linge', dg);
  for (const t of [e.t + ll.largeur, e.t - ll.largeur]) {
    if (t - sl.largeur / 2 < 0 || t + sl.largeur / 2 > e.bord.L) continue;
    const q = contreMur(e.bord, t, sl.profondeur);
    if (essayer(ctx, sl, q.position, q.rotation, 'linge', dg)) return;
  }
}

/** le garage : la place de stationnement, dans l'axe de la porte de garage */
function garage(ctx: Ctx): void {
  const m = M('place-voiture');
  for (const b of ctx.bords) for (const q of b.passages) {
    const tc = (q.t0 + q.t1) / 2;
    if (q.t1 - q.t0 < 2_000) continue;
    for (const dt of [0, 100, -100, 200, -200, 300, -300]) {
      const p = contreMur(b, tc + dt, m.profondeur);
      if (essayer(ctx, m, p.position, p.rotation, 'garage', null)) return;
    }
  }
  const e = meilleurContreMur(ctx, m, 'garage', null, x => -Math.abs(x.t - x.bord.L / 2));
  if (e) { poser(ctx, m, e.position, e.rotation, 'garage', null); return }
  ctx.manques.push('Place de stationnement (2,50 × 5,00 m) : le garage est trop petit');
}
