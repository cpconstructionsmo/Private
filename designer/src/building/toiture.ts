/* La toiture, calculée à partir du contour extérieur des murs (ADR-0002 :
   ce qui se calcule n'est jamais stocké ; le modèle ne garde que les choix :
   type, pente, débord, couverture).

   - À croupes (même pente sur tous les pans) : chaque point du toit est à
     la hauteur de l'égout, plus la pente multipliée par sa distance à
     l'égout le plus proche. Pour un plan à angles droits — presque toutes
     les maisons — cette distance se mesure « en carré » (distance de
     Tchebychev aux bords de l'égout) : on en tire exactement les pans,
     faîtages, arêtiers et noues. Méthode reprise de l'atelier
     (atelier/toiture.py) : le contour se découpe par toutes les lignes où
     deux pans peuvent se rencontrer (médianes entre bords parallèles,
     diagonales à 45° par les sommets) ; chaque case, convexe, va au pan du
     bord le plus proche ; les cases d'un pan sont réunies.
   - Deux pans (pignons) : sur un rectangle, le faîtage suit le grand côté
     (ou le petit) ; sur un plan à angles droits (L, T, U…), chaque bout
     d'aile — un bord aux deux angles saillants, plus court que la
     profondeur de l'aile qu'il ferme — devient un pignon, les autres bords
     portent les pans, et les noues naissent d'elles-mêmes dans les angles
     rentrants. Les murs pignons montent jusqu'au toit.
   - Un pan : sur un plan rectangulaire.
   - Toit-terrasse : une dalle et son acrotère.

   Le toit passe par le haut des murs au nu extérieur ; le débord descend
   donc sous ce niveau, jusqu'à l'égout. Un plan non orthogonal (croupes)
   ou non rectangulaire (deux pans, un pan) est refusé avec sa raison :
   rien n'est inventé. */
import type { Floor, Mm, Point, Roof } from '../model/types';
import { planDuNiveau } from './plan';
import { mursDroits } from './murs';
import { difference, intersection, union } from '../geometry/booleen';
import { aire, aireSignee, type Anneau, type Polygone } from '../geometry/polygon';
import { positionDansAnneau } from '../geometry/predicats';
import { decalerPolyligne } from '../geometry/decalage';
import { ANGLE_DROIT_TOITURE, EPS_COINCIDENCE, REDRESSEMENT_TOITURE } from '../geometry/tolerance';

export interface Point3 { x: Mm; y: Mm; z: Mm }

export interface PanToiture {
  contour: Anneau;
  /** le plan du pan : z = a·x + b·y + c (mm) */
  plan: { a: number; b: number; c: number };
}

/** un mur pignon au-dessus du haut des murs : un polygone vertical (nu
    extérieur), épaissi vers l'intérieur de « vers » (longueur = épaisseur) */
export interface Pignon { points: Point3[]; vers: Point }

export interface Toiture {
  genre: Roof['kind'];
  /** le contour de l'égout (murs + débord), en plan */
  egout: Anneau;
  pans: PanToiture[];
  pignons: Pignon[];
  /** toit-terrasse : dalle et acrotère */
  terrasse?: { dalle: Anneau; acrotere: Polygone[]; z0: Mm; z1: Mm; zAcrotere: Mm };
  /** haut des murs au nu extérieur, altitude de l'égout, du faîtage (mm, depuis le ±0,00) */
  hautMurs: Mm; egoutZ: Mm; faitage: Mm;
  /** le talon : de l'arase au-dessus de la couverture, au droit du nu extérieur des murs (toit en pente) */
  talon: Mm;
  /** surface de couverture (rampante), mm² */
  surfaceCouverture: number;
}

export type ResultatToiture = { ok: true; toitures: Toiture[] } | { ok: false; raison: string };

/** le talon d'une toiture en pente quand le projet n'en dit rien : la charpente (fermettes, sablière), les liteaux et
 *  la couverture posés sur l'arase font passer le dessus du toit environ 25 cm au-dessus du mur, au droit de son nu
 *  extérieur (ordre de grandeur des dossiers du cabinet, à confirmer par le charpentier ; réglable par toiture) */
export const TALON_TOITURE: Mm = 250;
export const talonDe = (r: Roof): Mm => (r.kind === 'flat' ? 0 : r.heel ?? TALON_TOITURE);

/** dimensions dessinées d'un toit-terrasse (ordres de grandeur pour la vue, pas une étude) */
export const TERRASSE = { dalle: 250, acrotere: 400, epaisseurAcrotere: 200 } as const;

const cache = new WeakMap<Floor, ResultatToiture | null>();

/** la toiture d'un niveau (null : le niveau n'en porte pas) */
export function toitureDuNiveau(f: Floor): ResultatToiture | null {
  if (cache.has(f)) return cache.get(f)!;
  const r = Object.values(f.objects).find((o): o is Roof => o.type === 'roof');
  const res = r ? calculer(f, r) : null;
  cache.set(f, res);
  return res;
}

const tourner = (p: Point, a: number): Point => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });

function calculer(f: Floor, r: Roof): ResultatToiture {
  const plan = planDuNiveau(f);
  if (!plan.maconnerie.length) return { ok: false, raison: 'aucun mur sur ce niveau : la toiture se pose sur les murs' };
  const ext = mursDroits(f).filter(w => w.role === 'exterior');
  const hautMurs = f.elevation + (ext.length ? Math.max(...ext.map(w => w.baseOffset + w.height)) : f.height);
  const epaisseur = ext.length ? Math.max(...ext.map(w => w.thickness)) : 200;
  const toitures: Toiture[] = [];
  /* les couverts accolés (porche, auvent) : la toiture les couvre comme les murs ; un couvert seul, loin de la maison,
     n'a pas de toit à lui (il n'est réuni qu'aux contours qu'il touche) */
  const couverts = Object.values(f.objects).flatMap(o => (o.type === 'canopy' ? [{ contour: o.contour }] : []));
  const contours = couverts.length
    ? union([...plan.maconnerie.map(m => ({ contour: m.contour })), ...couverts]).filter(q => plan.maconnerie.some(m => intersection([q], [{ contour: m.contour }]).some(x => aire(x) > 1))).map(q => ({ contour: q.contour }))
    : plan.maconnerie;
  for (const m of contours) {
    const t = r.kind === 'flat' ? terrasse(m.contour, r, hautMurs) : enPente(m.contour, r, hautMurs, epaisseur, talonDe(r));
    if (typeof t === 'string') return { ok: false, raison: t };
    toitures.push(t);
  }
  return { ok: true, toitures };
}

/* ---------- redresser un contour presque orthogonal ---------- */

/** l'angle du plus long bord : le repère du toit */
function anglePrincipal(c: Anneau): number {
  let best = 0, a = 0;
  c.forEach((p, i) => { const q = c[(i + 1) % c.length]!, L = Math.hypot(q.x - p.x, q.y - p.y); if (L > best) { best = L; a = Math.atan2(q.y - p.y, q.x - p.x) } });
  /* une direction, pas un sens : ramenée dans ]−90°, 90°], pour que « le bas » d'un toit à un pan
     ne dépende pas du sommet où commence le contour */
  if (a > Math.PI / 2 + 1e-9) a -= Math.PI; else if (a <= -Math.PI / 2 + 1e-9) a += Math.PI;
  return a;
}

function regrouper(v: number[]): Map<number, number> {
  const s = [...v].sort((a, b) => a - b), groupes: number[][] = [];
  for (const x of s) { const g = groupes[groupes.length - 1]; if (g && x - g[g.length - 1]! <= REDRESSEMENT_TOITURE) g.push(x); else groupes.push([x]) }
  const m = new Map<number, number>();
  for (const g of groupes) { const moy = g.reduce((a, b) => a + b, 0) / g.length; for (const x of g) m.set(x, moy) }
  return m;
}

/** dans le repère du toit : chaque bord exactement horizontal ou vertical, sinon la raison */
function redresser(c: Anneau): Point[] | string {
  const n = c.length, P = c.map(p => ({ ...p }));
  for (let i = 0; i < n; i++) {
    const a = P[i]!, b = P[(i + 1) % n]!, dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    if (Math.atan2(Math.min(dx, dy), Math.max(dx, dy)) > ANGLE_DROIT_TOITURE && Math.min(dx, dy) > REDRESSEMENT_TOITURE)
      return 'plan non orthogonal (murs qui ne sont pas à angle droit) : la toiture à croupes automatique ne s’applique pas ; choisissez un toit-terrasse, ou attendez la toiture dessinée à la main';
    if (dy <= dx) { const y = (a.y + b.y) / 2; a.y = y; b.y = y } else { const x = (a.x + b.x) / 2; a.x = x; b.x = x }
  }
  const gx = regrouper(P.map(p => p.x)), gy = regrouper(P.map(p => p.y));
  let Q = P.map(p => ({ x: gx.get(p.x)!, y: gy.get(p.y)! })).filter((p, i, A) => i === 0 || Math.hypot(p.x - A[i - 1]!.x, p.y - A[i - 1]!.y) > EPS_COINCIDENCE);
  if (Q.length > 1 && Math.hypot(Q[0]!.x - Q[Q.length - 1]!.x, Q[0]!.y - Q[Q.length - 1]!.y) <= EPS_COINCIDENCE) Q.pop();
  /* les sommets alignés (et les allers-retours) ne portent pas de bord */
  for (let change = true; change && Q.length > 4;) {
    change = false;
    for (let i = 0; i < Q.length; i++) {
      const a = Q[(i + Q.length - 1) % Q.length]!, b = Q[i]!, d = Q[(i + 1) % Q.length]!;
      if (Math.abs((b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x)) < 1e-6) { Q.splice(i, 1); change = true; break }
    }
  }
  if (aireSignee(Q) < 0) Q = Q.reverse();
  return Q;
}

/* ---------- les pans ---------- */

interface Bord { a: Point; b: Point; horiz: boolean; n: Point }

function bords(c: Anneau): Bord[] {
  return c.map((a, i) => {
    const b = c[(i + 1) % c.length]!, horiz = Math.abs(a.y - b.y) < 1e-9;
    /* contour dans le sens trigonométrique : l'intérieur est à gauche */
    const n = horiz ? { x: 0, y: b.x > a.x ? 1 : -1 } : { x: b.y > a.y ? -1 : 1, y: 0 };
    return { a, b, horiz, n };
  });
}

/** distance « en carré » d'un point à un bord (et sa part perpendiculaire, signée vers l'intérieur) */
function distBord(p: Point, e: Bord): { d: number; plan: number } {
  if (e.horiz) {
    const plan = (p.y - e.a.y) * e.n.y, lo = Math.min(e.a.x, e.b.x), hi = Math.max(e.a.x, e.b.x);
    return { d: Math.max(Math.abs(plan), lo - p.x, 0, p.x - hi), plan };
  }
  const plan = (p.x - e.a.x) * e.n.x, lo = Math.min(e.a.y, e.b.y), hi = Math.max(e.a.y, e.b.y);
  return { d: Math.max(Math.abs(plan), lo - p.y, 0, p.y - hi), plan };
}

/** une droite n·p = c */
interface Droite { nx: number; ny: number; c: number }

/** couper un polygone convexe par une droite : les deux morceaux (ou lui seul) */
function couper(P: Point[], L: Droite): Point[][] {
  const s = P.map(p => L.nx * p.x + L.ny * p.y - L.c), eps = 1e-6;
  if (s.every(v => v >= -eps) || s.every(v => v <= eps)) return [P];
  const A: Point[] = [], B: Point[] = [];
  for (let i = 0; i < P.length; i++) {
    const p = P[i]!, q = P[(i + 1) % P.length]!, sp = s[i]!, sq = s[(i + 1) % P.length]!;
    if (sp >= -eps) A.push(p);
    if (sp <= eps) B.push(p);
    if ((sp > eps && sq < -eps) || (sp < -eps && sq > eps)) {
      const t = sp / (sp - sq), x = { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
      A.push(x); B.push({ ...x });
    }
  }
  return [A, B].filter(x => x.length >= 3 && aire({ contour: x }) > 1e-3);
}

function centre(P: Point[]): Point { return { x: P.reduce((s, p) => s + p.x, 0) / P.length, y: P.reduce((s, p) => s + p.y, 0) / P.length } }

/** les bouts d'aile d'un contour orthogonal : un bord dont les deux angles sont saillants et
    plus court que la profondeur de l'aile derrière lui (le bord d'en face le plus proche) */
export function boutsDAile(E: Point[]): boolean[] {
  const B = bords(E), n = E.length;
  const saillant = (i: number) => {                                  // le sommet i (entre les bords i−1 et i) tourne à gauche
    const a = E[(i + n - 1) % n]!, b = E[i]!, c = E[(i + 1) % n]!;
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > 0;
  };
  return B.map((e, i) => {
    if (!saillant(i) || !saillant((i + 1) % n)) return false;
    const L = e.horiz ? Math.abs(e.b.x - e.a.x) : Math.abs(e.b.y - e.a.y);
    const lo = e.horiz ? Math.min(e.a.x, e.b.x) : Math.min(e.a.y, e.b.y), hi = e.horiz ? Math.max(e.a.x, e.b.x) : Math.max(e.a.y, e.b.y);
    let D = Infinity;
    for (const f of B) {
      if (f === e || f.horiz !== e.horiz || f.n.x * e.n.x + f.n.y * e.n.y > -0.5) continue;      // parallèle et en face
      const flo = f.horiz ? Math.min(f.a.x, f.b.x) : Math.min(f.a.y, f.b.y), fhi = f.horiz ? Math.max(f.a.x, f.b.x) : Math.max(f.a.y, f.b.y);
      if (Math.min(hi, fhi) - Math.max(lo, flo) <= 1e-6) continue;
      const d = e.horiz ? (f.a.y - e.a.y) * e.n.y : (f.a.x - e.a.x) * e.n.x;                  // vers l'intérieur
      if (d > 1e-6) D = Math.min(D, d);
    }
    return L < D - 1e-6;
  });
}

/** la hauteur relative du toit en p : la distance « en carré » à l'égout le plus proche, pignons exclus */
const distanceEgout = (p: Point, B: Bord[], pignon?: readonly boolean[]): number =>
  Math.min(...B.filter((_, i) => !pignon?.[i]).map(e => distBord(p, e).d));

/** les pans d'une toiture à même pente sur un contour d'égout orthogonal (repère du toit) ;
    les bords « pignon » ne portent pas de pan : les pans voisins vont jusqu'à eux */
function croupes(E: Point[], pignon?: readonly boolean[]): { bord: Bord; contour: Anneau }[] {
  const B = bords(E);
  const xs = [...new Set(E.map(p => p.x))].sort((a, b) => a - b), ys = [...new Set(E.map(p => p.y))].sort((a, b) => a - b);
  /* les cases de la grille des sommets qui sont dans le contour (rectangles) */
  let cases: Point[][] = [];
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
    const R = [{ x: xs[i]!, y: ys[j]! }, { x: xs[i + 1]!, y: ys[j]! }, { x: xs[i + 1]!, y: ys[j + 1]! }, { x: xs[i]!, y: ys[j + 1]! }];
    if (positionDansAnneau(centre(R), E) === 'dedans') cases.push(R);
  }
  /* les lignes où deux pans peuvent se rencontrer */
  const D = new Map<string, Droite>();
  const ajouter = (L: Droite) => D.set([L.nx, L.ny, Math.round(L.c * 1e6)].join(':'), L);
  for (const v of [xs, ys]) for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
    const m = (v[i]! + v[j]!) / 2;
    ajouter(v === xs ? { nx: 1, ny: 0, c: m } : { nx: 0, ny: 1, c: m });
  }
  for (const x of xs) for (const y of ys) { ajouter({ nx: -1, ny: 1, c: y - x }); ajouter({ nx: 1, ny: 1, c: y + x }) }
  for (const L of D.values()) cases = cases.flatMap(c => couper(c, L));
  /* chaque case au pan du bord le plus proche */
  const parBord = new Map<number, Polygone[]>();
  for (const c of cases) {
    const p = centre(c), ds = B.map((e, i) => (pignon?.[i] ? { d: Infinity, plan: Infinity } : distBord(p, e))), d = Math.min(...ds.map(x => x.d));
    let k = ds.findIndex(x => Math.abs(x.d - d) < 1e-6 && Math.abs(Math.abs(x.plan) - d) < 1e-6);
    if (k < 0) k = ds.findIndex(x => x.d === d);
    (parBord.get(k) ?? parBord.set(k, []).get(k)!).push({ contour: c });
  }
  const pans: { bord: Bord; contour: Anneau }[] = [];
  for (const [k, polys] of [...parBord.entries()].sort((a, b) => a[0] - b[0])) for (const p of union(polys)) pans.push({ bord: B[k]!, contour: p.contour });
  return pans;
}

function enPente(contour: Anneau, r: Roof, hautMurs: Mm, epaisseur: Mm, talon: Mm): Toiture | string {
  /* le dessus du toit au droit du nu extérieur des murs : l'arase plus le talon de la charpente */
  const zMur = hautMurs + talon;
  const th = anglePrincipal(contour);
  const W = redresser(contour.map(p => tourner(p, -th)));             // nu extérieur des murs, repère du toit
  if (typeof W === 'string') return W;
  const ov = r.overhang, t = Math.tan(r.pitch * Math.PI / 180);
  const E = ov > 0 ? (() => { const e = redresser(decalerPolyligne(W, -ov, true)); return typeof e === 'string' ? W : e })() : W;
  const xs = E.map(p => p.x), ys = E.map(p => p.y);
  const X0 = Math.min(...xs), X1 = Math.max(...xs), Y0 = Math.min(...ys), Y1 = Math.max(...ys);
  /* pans dans le repère du toit : un contour et un plan z = a x + b y + c */
  let pans: { contour: Anneau; a: number; b: number; c: number }[] = [];
  const pignons: { points: Point3[]; vers: Point }[] = [];
  const plans = (P: { bord: Bord; contour: Anneau }[]) => P.map(({ bord: e, contour: c }) => (e.horiz
    ? { contour: c, a: 0, b: t * e.n.y, c: zMur + t * (-e.n.y * e.a.y - ov) }
    : { contour: c, a: t * e.n.x, b: 0, c: zMur + t * (-e.n.x * e.a.x - ov) }));
  if (r.kind === 'hip') pans = plans(croupes(E));
  else if (r.kind === 'gable' && E.length !== 4) {
    /* deux pans sur un plan en L, T, U… : les bouts d'aile sont des pignons */
    const pg = boutsDAile(E);
    if (pg.length !== bords(W).length) return 'deux pans : contour trop irrégulier pour trouver les bouts d’aile ; choisissez une toiture à croupes';
    if (!pg.some(Boolean)) return 'deux pans : aucun bout d’aile sur ce plan (ailes aussi larges que longues) ; choisissez une toiture à croupes';
    pans = plans(croupes(E, pg));
    const BE = bords(E);
    /* chaque mur pignon : du haut des murs jusqu'au toit, profil suivi aux changements de pan */
    bords(W).forEach((w, j) => {
      if (!pg[j]) return;
      const zToit = (p: Point) => zMur + t * (distanceEgout(p, BE, pg) - ov);
      const ts = new Set([0, 1]);
      const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y;
      for (const pan of pans) pan.contour.forEach((q, i) => {
        const q2 = pan.contour[(i + 1) % pan.contour.length]!, ex = q2.x - q.x, ey = q2.y - q.y, den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) return;
        const u = ((q.x - w.a.x) * ey - (q.y - w.a.y) * ex) / den, v = ((q.x - w.a.x) * dy - (q.y - w.a.y) * dx) / den;
        if (u > 1e-9 && u < 1 - 1e-9 && v >= -1e-9 && v <= 1 + 1e-9) ts.add(Math.round(u * 1e9) / 1e9);
      });
      const haut = [...ts].sort((a, b) => b - a).map(u => { const p = { x: w.a.x + u * dx, y: w.a.y + u * dy }; return { x: p.x, y: p.y, z: zToit(p) } });
      /* aux angles, le toit passe par le haut des murs : pas de sommet en double */
      pignons.push({ points: [{ ...w.a, z: hautMurs }, { ...w.b, z: hautMurs }, ...haut.filter(q => q.z > hautMurs + 1e-6)], vers: { x: w.n.x * epaisseur, y: w.n.y * epaisseur } });
    });
  } else {
    if (E.length !== 4 || W.length !== 4) return (r.kind === 'gable' ? 'deux pans' : 'un pan') + ' : seulement sur un plan rectangulaire pour l’instant ; choisissez une toiture à croupes';
    const x0 = Math.min(...W.map(p => p.x)), x1 = Math.max(...W.map(p => p.x)), y0 = Math.min(...W.map(p => p.y)), y1 = Math.max(...W.map(p => p.y));
    /* la direction du faîtage (deux pans) ou de l'égout bas et du haut (un pan) : le long du grand côté, ou du petit */
    const longX = X1 - X0 >= Y1 - Y0, selonX = (r.ridge ?? 'long') === 'long' ? longX : !longX;
    const rect = (a: number, b: number, c: number, d: number): Anneau => [{ x: a, y: c }, { x: b, y: c }, { x: b, y: d }, { x: a, y: d }];
    const P3 = (x: number, y: number, z: number): Point3 => ({ x, y, z });
    /* un angle de pignon au dessous du toit : seulement s'il y a un talon (sinon c'est l'angle du mur) */
    const haussé = (q: Point3): Point3[] => (talon > 0 ? [q] : []);
    if (r.kind === 'gable') {
      if (selonX) {
        const ym = (Y0 + Y1) / 2, h = zMur + t * (ym - y0);
        pans = [{ contour: rect(X0, X1, Y0, ym), a: 0, b: t, c: zMur + t * (-Y0 - ov) }, { contour: rect(X0, X1, ym, Y1), a: 0, b: -t, c: zMur + t * (Y1 - ov) }];
        /* le pignon monte jusqu'au dessous du toit : aux angles, l'arase plus le talon */
        pignons.push({ points: [P3(x0, y0, hautMurs), P3(x0, y1, hautMurs), ...haussé(P3(x0, y1, zMur)), P3(x0, ym, h), ...haussé(P3(x0, y0, zMur))], vers: { x: epaisseur, y: 0 } },
          { points: [P3(x1, y1, hautMurs), P3(x1, y0, hautMurs), ...haussé(P3(x1, y0, zMur)), P3(x1, ym, h), ...haussé(P3(x1, y1, zMur))], vers: { x: -epaisseur, y: 0 } });
      } else {
        const xm = (X0 + X1) / 2, h = zMur + t * (xm - x0);
        pans = [{ contour: rect(X0, xm, Y0, Y1), a: t, b: 0, c: zMur + t * (-X0 - ov) }, { contour: rect(xm, X1, Y0, Y1), a: -t, b: 0, c: zMur + t * (X1 - ov) }];
        pignons.push({ points: [P3(x1, y0, hautMurs), P3(x0, y0, hautMurs), ...haussé(P3(x0, y0, zMur)), P3(xm, y0, h), ...haussé(P3(x1, y0, zMur))], vers: { x: 0, y: epaisseur } },
          { points: [P3(x0, y1, hautMurs), P3(x1, y1, hautMurs), ...haussé(P3(x1, y1, zMur)), P3(xm, y1, h), ...haussé(P3(x0, y1, zMur))], vers: { x: 0, y: -epaisseur } });
      }
    } else {
      /* un pan : l'égout bas d'un côté (ou de l'autre si « inversé »), le haut de l'autre */
      const inv = !!r.flip;
      if (selonX) {
        const b = inv ? -t : t, c = inv ? zMur + t * (Y1 - ov) : zMur + t * (-Y0 - ov);
        pans = [{ contour: rect(X0, X1, Y0, Y1), a: 0, b, c }];
        const z = (y: number) => b * y + c, yh = inv ? y0 : y1, yb = inv ? y1 : y0, sens = inv ? 1 : -1;
        pignons.push({ points: [P3(x0, yb, hautMurs), P3(x0, yh, hautMurs), P3(x0, yh, z(yh)), ...haussé(P3(x0, yb, zMur))], vers: { x: epaisseur, y: 0 } },
          { points: [P3(x1, yh, hautMurs), P3(x1, yb, hautMurs), ...haussé(P3(x1, yb, zMur)), P3(x1, yh, z(yh))], vers: { x: -epaisseur, y: 0 } },
          { points: [P3(x0, yh, hautMurs), P3(x1, yh, hautMurs), P3(x1, yh, z(yh)), P3(x0, yh, z(yh))], vers: { x: 0, y: sens * epaisseur } });
      } else {
        const a = inv ? -t : t, c = inv ? zMur + t * (X1 - ov) : zMur + t * (-X0 - ov);
        pans = [{ contour: rect(X0, X1, Y0, Y1), a, b: 0, c }];
        const z = (x: number) => a * x + c, xh = inv ? x0 : x1, xb = inv ? x1 : x0, sens = inv ? 1 : -1;
        pignons.push({ points: [P3(xb, y0, hautMurs), P3(xh, y0, hautMurs), P3(xh, y0, z(xh)), ...haussé(P3(xb, y0, zMur))], vers: { x: 0, y: epaisseur } },
          { points: [P3(xh, y1, hautMurs), P3(xb, y1, hautMurs), ...haussé(P3(xb, y1, zMur)), P3(xh, y1, z(xh))], vers: { x: 0, y: -epaisseur } },
          { points: [P3(xh, y0, hautMurs), P3(xh, y1, hautMurs), P3(xh, y1, z(xh)), P3(xh, y0, z(xh))], vers: { x: sens * epaisseur, y: 0 } });
      }
    }
  }
  /* retour au repère du plan : z = a x' + b y' + c, avec x' = x cos θ + y sin θ, y' = −x sin θ + y cos θ */
  const co = Math.cos(th), si = Math.sin(th);
  const out = pans.map(p => ({ contour: p.contour.map(q => tourner(q, th)), plan: { a: p.a * co - p.b * si, b: p.a * si + p.b * co, c: p.c } }));
  const zs = pans.flatMap(p => p.contour.map(q => p.a * q.x + p.b * q.y + p.c));
  return {
    genre: r.kind, egout: E.map(q => tourner(q, th)), pans: out,
    pignons: pignons.map(g => ({ points: g.points.map(q => ({ ...tourner(q, th), z: q.z })), vers: tourner(g.vers, th) })),
    hautMurs, egoutZ: zMur - t * ov, faitage: Math.max(...zs), talon,
    surfaceCouverture: pans.reduce((s, p) => s + aire({ contour: p.contour }), 0) / Math.cos(r.pitch * Math.PI / 180),
  };
}

function terrasse(contour: Anneau, r: Roof, hautMurs: Mm): Toiture {
  const E = r.overhang > 0 ? decalerPolyligne(contour, -r.overhang, true) : [...contour];
  const z1 = hautMurs + TERRASSE.dalle;
  const acrotere = difference([{ contour: E }], [{ contour: decalerPolyligne(E, TERRASSE.epaisseurAcrotere, true) }]);
  return {
    genre: 'flat', egout: E, pans: [], pignons: [], terrasse: { dalle: E, acrotere, z0: hautMurs, z1, zAcrotere: z1 + TERRASSE.acrotere },
    hautMurs, egoutZ: z1, faitage: z1 + TERRASSE.acrotere, talon: 0, surfaceCouverture: aire({ contour: E }),
  };
}
