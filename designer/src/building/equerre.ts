/* L'équerre : des murs à angle droit, sans y passer des heures.

   Un plan repris à la souris (par-dessus un fond calé, par exemple) dévie
   toujours de quelques dixièmes de degré : les murs « presque d'équerre »
   ne le sont pas, les cotes tombent à 1 cm près, la toiture se complique.
   Deux remèdes, tous deux calculés ici :

   - pendant le tracé, la direction d'un mur s'aimante à l'équerre
     (directionDEquerre) dès qu'elle en est à moins de ANGLE_EQUERRE ;
   - après coup, « Mettre d'équerre » (equerrer) redresse les murs déjà
     tracés : chaque mur presque horizontal (dans le repère du plan) impose
     la même ordonnée à ses deux bouts, chaque mur presque vertical la même
     abscisse ; un bout posé sur le corps d'un mur (cloison en T) garde sa
     distance à l'axe de ce mur (sur sa face, il y reste). Ces égalités
     forment des classes ; chaque classe prend la moyenne de ses membres
     (au millimètre) : les angles restent fermés, rien ne tourne en bloc,
     et le plan bouge le moins possible.

   Le repère du plan : l'orientation dominante des murs (pondérée par leur
   longueur), ramenée à celle des axes du plan, ou à celle du fond calé,
   quand elle en est proche — un plan tracé de travers par-dessus un fond
   droit se redresse sur le fond. Les murs biais (pans coupés, plus de
   ANGLE_EQUERRE d'écart) ne sont pas redressés : ils suivent leurs bouts. */
import type { Floor, Point } from '../model/types';
import { ANGLE_EQUERRE, EPS_COINCIDENCE, PRISE_FACE_EQUERRE } from '../geometry/tolerance';
import { distance, tourner } from '../geometry/vecteur';
import { decalagesFaces, mursDroits, type MurDroit } from './murs';

const QUART = Math.PI / 2;

/** un angle ramené dans [−45°, 45°[ (modulo 90°) */
export function plierEquerre(a: number): number {
  let r = a % QUART;
  if (r >= QUART / 2) r -= QUART;
  if (r < -QUART / 2) r += QUART;
  return r;
}

const angleMur = (w: MurDroit) => Math.atan2(w.axis.b.y - w.axis.a.y, w.axis.b.x - w.axis.a.x);

/** l'orientation (dans [−45°, 45°[) des murs : la moyenne de leurs angles modulo 90°, pondérée par la longueur ;
    une référence proche (axes du plan, fond calé) la remplace */
export function orientationDesMurs(murs: readonly MurDroit[], references: readonly number[] = [0]): number {
  const refs = references.length ? references.map(plierEquerre) : [0];
  /* moyenne de 4α : 0°, 90°, 180° et 270° donnent la même direction */
  const moyenne = (M: readonly MurDroit[]) => {
    let sx = 0, sy = 0;
    for (const w of M) { const L = distance(w.axis.a, w.axis.b), a = 4 * angleMur(w); sx += L * Math.cos(a); sy += L * Math.sin(a) }
    return Math.hypot(sx, sy) > EPS_COINCIDENCE ? plierEquerre(Math.atan2(sy, sx) / 4) : null;
  };
  let t = moyenne(murs);
  if (t === null) return refs[0]!;
  /* une seconde fois, sans les murs biais (un pan coupé ne doit pas tirer le repère) */
  const t2 = moyenne(murs.filter(w => Math.abs(plierEquerre(angleMur(w) - t!)) <= ANGLE_EQUERRE));
  if (t2 !== null) t = t2;
  let meilleure: number | null = null;
  for (const r of refs) {
    const e = Math.abs(plierEquerre(t - r));
    if (e <= ANGLE_EQUERRE && (meilleure === null || e < Math.abs(plierEquerre(t - meilleure)))) meilleure = r;
  }
  return meilleure ?? t;
}

/** les orientations de référence d'un niveau : les axes du plan, puis chaque fond calé */
export function referencesDuNiveau(f: Floor): number[] {
  return [0, ...Object.values(f.objects).flatMap(o => (o.type === 'underlay' ? [plierEquerre(o.transform.rotation)] : []))];
}

const cache = new WeakMap<Floor, number>();
/** le repère du plan d'un niveau (gardé tant que le niveau n'a pas changé) */
export function orientationDuPlan(f: Floor): number {
  let t = cache.get(f);
  if (t === undefined) { t = orientationDesMurs(mursDroits(f), referencesDuNiveau(f)); cache.set(f, t) }
  return t;
}

/** la direction d'équerre (unitaire) la plus proche de depuis → p, si elle en est à moins de ANGLE_EQUERRE ; sinon null */
export function directionDEquerre(depuis: Point, p: Point, orientation = 0): Point | null {
  const dx = p.x - depuis.x, dy = p.y - depuis.y;
  if (Math.hypot(dx, dy) <= EPS_COINCIDENCE) return null;
  const a = Math.atan2(dy, dx) - orientation, k = Math.round(a / QUART);
  if (Math.abs(a - k * QUART) > ANGLE_EQUERRE) return null;
  /* dans les axes du plan, la direction est exacte (pas de 6e-17 qui traîne) */
  if (orientation === 0) return ([{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }] as const)[((k % 4) + 4) % 4]!;
  const b = orientation + k * QUART;
  return { x: Math.cos(b), y: Math.sin(b) };
}

export interface Equerrage {
  /** le repère retenu (radians, dans [−45°, 45°[) */
  orientation: number;
  /** les murs presque d'équerre qui bougent */
  redresses: string[];
  /** les murs presque d'équerre (redressés ou déjà droits) */
  equerres: string[];
  /** les sommets qui bougent : de leur place à la nouvelle */
  epingles: { de: Point; vers: Point }[];
  /** les nouveaux axes des murs qui bougent (les murs raccordés compris) */
  axes: Record<string, { a: Point; b: Point }>;
}

/** des égalités « c[j] − c[i] = d » sur une coordonnée : des classes, chaque membre à un écart fixe de sa classe */
class Classes {
  readonly cls: number[];
  readonly off: number[];
  constructor(n: number) { this.cls = Array.from({ length: n }, (_, k) => k); this.off = new Array<number>(n).fill(0) }
  /** relier i et j ; refusé (false) si c'est contradictoire, ou si un mur « interdit » s'écrase */
  relier(i: number, j: number, d: number, interdits: readonly [number, number, number][]): boolean {
    const { cls, off } = this, ri = cls[i]!, rj = cls[j]!;
    if (ri === rj) return Math.abs(off[j]! - off[i]! - d) <= EPS_COINCIDENCE;
    const decale = off[i]! + d - off[j]!;
    const apres = (k: number) => (cls[k] === rj ? off[k]! + decale : off[k]!);
    /* un mur qui n'est pas de cette direction ne doit ni s'écraser ni se retourner sur cette coordonnée */
    for (const [p, q, avant] of interdits) {
      const cp = cls[p]!, cq = cls[q]!;
      if (!((cp === ri && cq === rj) || (cp === rj && cq === ri))) continue;
      const ecart = apres(q) - apres(p);
      if (Math.abs(ecart) <= EPS_COINCIDENCE || Math.sign(ecart) !== Math.sign(avant)) return false;
    }
    for (let k = 0; k < cls.length; k++) if (cls[k] === rj) { cls[k] = ri; off[k] = off[k]! + decale }
    return true;
  }
}

/** mettre d'équerre les murs choisis (tous ceux du niveau par défaut) */
export function equerrer(f: Floor, ids?: readonly string[]): Equerrage {
  const M = mursDroits(f);
  const choisis = ids ? M.filter(w => ids.includes(w.id)) : M;
  /* quelques murs choisis : le repère du niveau d'abord (un mur seul n'en donne pas), le leur s'ils sont nettement tournés (une annexe biaise) */
  const refs = referencesDuNiveau(f), orientation = orientationDesMurs(choisis, ids ? [orientationDesMurs(M, refs), ...refs] : refs);
  const local = (p: Point): Point => (orientation === 0 ? { x: p.x, y: p.y } : tourner(p, -orientation));
  const monde = (p: Point): Point => (orientation === 0 ? p : tourner(p, orientation));

  /* les sommets du réseau (extrémités confondues), comme le solveur des contraintes */
  const noeuds: Point[] = [];
  const indice = (p: Point): number => {
    const k = noeuds.findIndex(s => distance(s, p) <= EPS_COINCIDENCE);
    if (k >= 0) return k;
    noeuds.push({ ...p });
    return noeuds.length - 1;
  };
  const ext = new Map(M.map(w => [w.id, { a: indice(w.axis.a), b: indice(w.axis.b) }]));
  const L = noeuds.map(local);

  /* chaque mur choisi : presque horizontal (h), presque vertical (v) dans le repère, ou biais */
  const genre = new Map<string, 'h' | 'v'>();
  for (const w of choisis) {
    const e = ext.get(w.id)!, a = Math.atan2(L[e.b]!.y - L[e.a]!.y, L[e.b]!.x - L[e.a]!.x);
    if (Math.abs(plierEquerre(a)) > ANGLE_EQUERRE) continue;
    genre.set(w.id, Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? 'h' : 'v');
  }
  const X = new Classes(noeuds.length), Y = new Classes(noeuds.length);
  /* les murs qui ne règlent pas une coordonnée ne doivent pas s'y écraser */
  const interdits = (g: 'h' | 'v') => M.filter(w => genre.get(w.id) !== g).map(w => {
    const e = ext.get(w.id)!;
    return [e.a, e.b, g === 'h' ? L[e.b]!.y - L[e.a]!.y : L[e.b]!.x - L[e.a]!.x] as [number, number, number];
  });
  const sansH = interdits('h'), sansV = interdits('v');
  const parLongueur = [...choisis].filter(w => genre.has(w.id)).sort((p, q) => distance(q.axis.a, q.axis.b) - distance(p.axis.a, p.axis.b) || (p.id < q.id ? -1 : 1));
  for (const w of parLongueur) {
    const e = ext.get(w.id)!;
    if (genre.get(w.id) === 'h') Y.relier(e.a, e.b, 0, sansH); else X.relier(e.a, e.b, 0, sansV);
  }
  /* les cloisons en T : un bout sur le corps (ou une face) d'un mur redressé garde sa distance à l'axe */
  for (const w of parLongueur) {
    const e = ext.get(w.id)!, h = genre.get(w.id) === 'h';
    const A = L[e.a]!, B = L[e.b]!;
    const le = h ? (p: Point) => p.x : (p: Point) => p.y, tr = h ? (p: Point) => p.y : (p: Point) => p.x;
    const lo = Math.min(le(A), le(B)), hi = Math.max(le(A), le(B));
    /* les faces, dans le repère : la gauche de a → b est +y (horizontal vers +x) ou −x (vertical vers +y) */
    const f = decalagesFaces(w), s = h ? Math.sign(le(B) - le(A)) : -Math.sign(le(B) - le(A));
    const faces = [0, s * f.gauche, s * f.droite], large = Math.max(...faces.map(Math.abs));
    for (let k = 0; k < noeuds.length; k++) {
      if (k === e.a || k === e.b) continue;
      const P = L[k]!, u = le(P);
      if (u <= lo + EPS_COINCIDENCE || u >= hi - EPS_COINCIDENCE) continue;
      const t = (u - le(A)) / (le(B) - le(A)), d = tr(P) - (tr(A) + t * (tr(B) - tr(A)));
      if (Math.abs(d) > large + PRISE_FACE_EQUERRE) continue;
      const face = faces.find(x => Math.abs(d - x) <= PRISE_FACE_EQUERRE);
      if (h) Y.relier(e.a, k, face ?? d, sansH); else X.relier(e.a, k, face ?? d, sansV);
    }
  }

  /* la valeur de chaque classe : la moyenne de ses membres, au millimètre dans les axes du plan */
  const valeurs = (C: Classes, c: (p: Point) => number): number[] => {
    const somme = new Map<number, { s: number; n: number }>();
    L.forEach((p, k) => { const r = C.cls[k]!, v = somme.get(r) ?? { s: 0, n: 0 }; v.s += c(p) - C.off[k]!; v.n++; somme.set(r, v) });
    return L.map((p, k) => {
      const v = somme.get(C.cls[k]!)!;
      if (v.n === 1) return c(p);
      const m = v.s / v.n;
      return (orientation === 0 ? Math.round(m) : m) + C.off[k]!;
    });
  };
  const vx = valeurs(X, p => p.x), vy = valeurs(Y, p => p.y);
  const arrondi = (v: number) => Math.round(v * 1e4) / 1e4;
  const nouveaux = noeuds.map((p, k) => {
    const q = monde({ x: vx[k]!, y: vy[k]! });
    return orientation === 0 ? q : { x: arrondi(q.x), y: arrondi(q.y) };
  });
  const bouge = noeuds.map((p, k) => distance(p, nouveaux[k]!) > EPS_COINCIDENCE);
  const axes: Equerrage['axes'] = {};
  for (const w of M) {
    const e = ext.get(w.id)!;
    if (bouge[e.a] || bouge[e.b]) axes[w.id] = { a: nouveaux[e.a]!, b: nouveaux[e.b]! };
  }
  return {
    orientation,
    equerres: [...genre.keys()],
    redresses: [...genre.keys()].filter(id => axes[id]),
    epingles: noeuds.flatMap((p, k) => (bouge[k] ? [{ de: p, vers: nouveaux[k]! }] : [])),
    axes,
  };
}
