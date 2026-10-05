/* Le contour d'un mur, dérivé de son axe, de son épaisseur et de ses
   voisins (ADR-0002 : ce qui se calcule n'est jamais stocké).

   Les jonctions se calculent sommet par sommet. En un point P où se
   rejoignent plusieurs murs (extrémités confondues : angle en L, en Y, en
   croix), ou où un mur aboutit sur le corps d'un autre (jonction en T), on
   regarde les murs comme des « rayons » qui partent de P, triés par angle.
   Entre deux rayons voisins, la face gauche de l'un rencontre la face
   droite de l'autre : ce point d'intersection est un angle exact des deux
   contours (onglet). Les murs ne se recouvrent donc pas : la somme de leurs
   surfaces est la surface de maçonnerie.

   Une extrémité libre est coupée d'équerre. Un angle trop aigu (l'onglet
   partirait au loin) est coupé d'équerre lui aussi, plutôt que d'inventer
   une pointe.

   À trois rayons ou plus, les onglets dessinent autour de P un petit
   polygone que le bout de chaque mur, tiré d'un angle à l'autre, ne
   couvrirait pas : il resterait un vide (0,02 m² pour trois murs de 20 cm
   dont deux alignés), compté comme une « pièce à nommer ». On le couvre :
   - un mur qui traverse P (jonction en T), ou deux bouts alignés de mêmes
     faces (un mur coupé en deux à l'angle d'un garage), forment le mur
     traversant : ces deux bouts sont coupés d'équerre en P, et les autres
     murs viennent buter sur sa face, leur bout passant par le pied de P
     sur cette face ;
   - sans mur traversant (Y, croix de quatre bouts), le bout de chaque mur
     passe par P, le centre de la jonction.
   Un bout qui, par ce point, se croiserait lui-même (des murs minces qui se
   rejoignent dans l'épaisseur d'un mur épais : ils le chevauchent déjà, il
   n'y a pas de vide) garde son simple trait. */
import type { Floor, Mm, Point, Wall } from '../model/types';
import { EPS_COINCIDENCE } from '../geometry/tolerance';
import { distancePointSegment, intersectionDroites, intersectionSegments, projeterSurDroite } from '../geometry/segment';
import { ajouter, distance, multiplier, normaleGauche, normaliser, scalaire, soustraire, vectoriel } from '../geometry/vecteur';
import { centroide, type Anneau } from '../geometry/polygon';
import { positionDansAnneau } from '../geometry/predicats';

export const LIMITE_ONGLET_MUR = 4;          // en multiples de la plus forte épaisseur au sommet

export type MurDroit = Wall & { axis: { a: Point; b: Point } };
export const estDroit = (w: Wall): w is MurDroit => 'a' in w.axis;

/** les décalages des deux faces par rapport à l'axe, vers la gauche du sens a → b */
export function decalagesFaces(w: Wall): { gauche: Mm; droite: Mm } {
  const e = w.thickness;
  return w.justification === 'left' ? { gauche: 0, droite: -e }          // l'axe est la face gauche
    : w.justification === 'right' ? { gauche: e, droite: 0 }             // l'axe est la face droite
      : { gauche: e / 2, droite: -e / 2 };
}

/** un mur vu depuis l'un de ses sommets, ou depuis un point de son corps (T) */
interface Rayon {
  mur: MurDroit;
  /** depuis l'origine a (true), l'extrémité b (false), ou le corps (null : moitié d'un mur traversant) */
  depuis: 'a' | 'b' | 'corps';
  dir: Point;                 // unitaire, partant de P
  angle: number;
  /** faces du rayon, vues dans SON sens : un point et la direction */
  gauche: { p: Point; d: Point };
  droite: { p: Point; d: Point };
}

function rayon(mur: MurDroit, P: Point, depuis: Rayon['depuis'], sens: 1 | -1): Rayon {
  const u = normaliser(soustraire(mur.axis.b, mur.axis.a));
  const dir = multiplier(u, sens), n = normaleGauche(u);
  const f = decalagesFaces(mur);
  /* dans le sens a → b, la face gauche est à +f.gauche sur n ; à rebours,
     gauche et droite s'échangent */
  const pg = sens === 1 ? ajouter(P, multiplier(n, f.gauche)) : ajouter(P, multiplier(n, f.droite));
  const pd = sens === 1 ? ajouter(P, multiplier(n, f.droite)) : ajouter(P, multiplier(n, f.gauche));
  return { mur, depuis, dir, angle: Math.atan2(dir.y, dir.x), gauche: { p: pg, d: dir }, droite: { p: pd, d: dir } };
}

const ligne = (f: { p: Point; d: Point }) => ({ a: f.p, b: ajouter(f.p, f.d) });

export interface ContourMur { id: string; contour: Anneau }

/** les contours de tous les murs droits d'un niveau, jonctions comprises */
export function contoursMurs(murs: readonly MurDroit[], eps: number = EPS_COINCIDENCE): ContourMur[] {
  /* les sommets : extrémités des murs, regroupées à la tolérance près */
  const sommets: Point[] = [];
  const indice = (p: Point): number => {
    const k = sommets.findIndex(s => distance(s, p) <= eps);
    if (k >= 0) return k;
    sommets.push(p);
    return sommets.length - 1;
  };
  const extremites = murs.map(w => ({ a: indice(w.axis.a), b: indice(w.axis.b) }));
  /* les rayons de chaque sommet : les murs qui y finissent, plus ceux qui y passent (T) */
  const rayons: Rayon[][] = sommets.map(() => []);
  murs.forEach((w, i) => {
    const e = extremites[i]!;
    rayons[e.a]!.push(rayon(w, sommets[e.a]!, 'a', 1));
    rayons[e.b]!.push(rayon(w, sommets[e.b]!, 'b', -1));
  });
  sommets.forEach((P, k) => {
    murs.forEach((w, i) => {
      const e = extremites[i]!;
      if (e.a === k || e.b === k) return;
      const { point, t } = projeterSurDroite(P, w.axis);
      const L = distance(w.axis.a, w.axis.b);
      if (distance(point, P) <= eps && t * L > eps && (1 - t) * L > eps) {
        /* P est sur le corps de w : deux demi-rayons, sans modifier w */
        rayons[k]!.push(rayon(w, P, 'corps', 1), rayon(w, P, 'corps', -1));
      }
    });
  });
  for (const R of rayons) R.sort((x, y) => x.angle - y.angle);

  /* le bout de chaque rayon à chaque sommet : ses deux angles, et le point
     intermédiaire qui ferme la jonction (null : le bout est un simple trait) */
  type Bout = { gauche: Point; droite: Point; centre: Point | null };
  const bouts: Map<Rayon, Bout>[] = sommets.map((P, k) => {
    const R = rayons[k]!, out = new Map<Rayon, Bout>();
    const emax = Math.max(0, ...R.map(x => x.mur.thickness));
    const onglet = (x: Point | null, defaut: Point): Point => (x && distance(x, P) <= LIMITE_ONGLET_MUR * emax ? x : defaut);
    /* le mur traversant : un mur qui passe par P, sinon deux bouts alignés de mêmes faces (le plus épais) */
    let traversant: Rayon | null = R.find(r => r.depuis === 'corps') ?? null;
    const paire = new Set<Rayon>();
    if (!traversant && R.length >= 3) {
      let best: [Rayon, Rayon] | null = null;
      for (const r of R) for (const q of R) {
        if (r === q || scalaire(r.dir, q.dir) > -1 + 1e-9) continue;
        if (distance(r.gauche.p, q.droite.p) > eps || distance(r.droite.p, q.gauche.p) > eps) continue;
        if (!best || r.mur.thickness > best[0].mur.thickness) best = [r, q];
      }
      if (best) { paire.add(best[0]).add(best[1]); traversant = best[0] }
    }
    R.forEach((r, i) => {
      const equerre = { gauche: r.gauche.p, droite: r.droite.p };
      if (r.depuis === 'corps') return;
      if (R.length < 2 || paire.has(r)) { out.set(r, { ...equerre, centre: null }); return }
      const suivant = R[(i + 1) % R.length]!, precedent = R[(i - 1 + R.length) % R.length]!;
      const b: Bout = {
        gauche: onglet(intersectionDroites(ligne(r.gauche), ligne(suivant.droite)), equerre.gauche),
        droite: onglet(intersectionDroites(ligne(r.droite), ligne(precedent.gauche)), equerre.droite),
        centre: null,
      };
      if (R.length >= 3) b.centre = P;
      out.set(r, b);
    });
    /* contre un mur traversant : de chaque côté, un même point sur sa face, le pied de P ramené entre
       les angles extrêmes des murs qui y butent (sinon le bout d'un mur déborderait au-dehors) */
    if (traversant) for (const cote of [1, -1]) {
      const T = traversant, face = cote > 0 ? T.gauche : T.droite;
      /* les murs de ce côté, dans l'ordre des angles comptés depuis le traversant */
      const relatif = (r: Rayon) => Math.atan2(vectoriel(T.dir, r.dir), scalaire(T.dir, r.dir));
      const ici = [...out].filter(([r]) => !paire.has(r) && Math.sign(vectoriel(T.dir, r.dir)) === cote)
        .sort(([x], [y]) => relatif(x) - relatif(y)).map(([, b]) => b);
      const s = ici.flatMap(b => [b.droite, b.gauche])
        .filter(q => Math.abs(vectoriel(T.dir, soustraire(q, face.p))) <= eps)
        .map(q => scalaire(soustraire(q, face.p), T.dir));
      const t = s.length ? Math.min(Math.max(0, Math.min(...s)), Math.max(...s)) : 0;
      /* si les angles sont déjà dans le traversant (murs qui se chevauchent), ce point recoupe le bout à sa face */
      for (const b of ici) b.centre = ajouter(face.p, multiplier(T.dir, t));
    }
    /* sans mur traversant : P doit être dans le polygone des angles (murs justifiés d'un côté), sinon on prend son centre */
    if (!traversant && R.length >= 3) {
      const poly = R.flatMap(r => { const b = out.get(r); return b ? [b.droite, b.gauche] : [] });
      if (positionDansAnneau(P, poly) === 'dehors') { const c = centroide(poly); for (const b of out.values()) b.centre = c }
    }
    /* un point intermédiaire déjà sur le trait du bout n'apporte rien : le contour reste un quadrilatère */
    for (const b of out.values()) if (b.centre && distancePointSegment(b.centre, { a: b.droite, b: b.gauche }) <= eps) b.centre = null;
    return out;
  });
  const bout = (k: number, depuis: 'a' | 'b', mur: MurDroit): Bout => bouts[k]!.get(rayons[k]!.find(r => r.mur === mur && r.depuis === depuis)!)!;

  return murs.map((w, i) => {
    const e = extremites[i]!;
    const A = bout(e.a, 'a', w), B = bout(e.b, 'b', w);
    /* depuis a, la gauche du rayon est la gauche du mur ; depuis b, c'est sa droite */
    const contour = (a: Point | null, b: Point | null): Point[] => [A.droite, B.gauche, ...(b ? [b] : []), B.droite, A.gauche, ...(a ? [a] : [])];
    /* un bout qui se croiserait lui-même (le point est derrière un angle) garde son simple trait */
    const a = A.centre && simple(contour(A.centre, null)) ? A.centre : null, b = B.centre && simple(contour(null, B.centre)) ? B.centre : null;
    return { id: w.id, contour: simple(contour(a, b)) ? contour(a, b) : contour(null, null) };
  });
}

/** un anneau simple : deux côtés non voisins ne se touchent pas */
function simple(A: readonly Point[]): boolean {
  const n = A.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (intersectionSegments({ a: A[i]!, b: A[(i + 1) % n]! }, { a: A[j]!, b: A[(j + 1) % n]! }).type !== 'aucune') return false;
  }
  return true;
}

export const mursDroits = (f: Floor): MurDroit[] =>
  Object.values(f.objects).filter((o): o is MurDroit => o.type === 'wall' && estDroit(o));
