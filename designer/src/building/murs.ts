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
   une pointe. */
import type { Floor, Mm, Point, Wall } from '../model/types';
import { EPS_COINCIDENCE } from '../geometry/tolerance';
import { intersectionDroites, projeterSurDroite } from '../geometry/segment';
import { ajouter, distance, multiplier, normaleGauche, normaliser, soustraire } from '../geometry/vecteur';
import type { Anneau } from '../geometry/polygon';

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

  /* les deux angles du contour d'un mur à l'un de ses sommets */
  const coins = (k: number, depuis: 'a' | 'b', mur: MurDroit): { gauche: Point; droite: Point } => {
    const R = rayons[k]!;
    const i = R.findIndex(r => r.mur === mur && r.depuis === depuis);
    const r = R[i]!;
    const equerre = { gauche: r.gauche.p, droite: r.droite.p };
    if (R.length < 2) return equerre;
    const suivant = R[(i + 1) % R.length]!, precedent = R[(i - 1 + R.length) % R.length]!;
    const emax = Math.max(...R.map(x => x.mur.thickness));
    const P = sommets[k]!;
    const onglet = (x: Point | null, defaut: Point): Point => (x && distance(x, P) <= LIMITE_ONGLET_MUR * emax ? x : defaut);
    return {
      gauche: onglet(intersectionDroites(ligne(r.gauche), ligne(suivant.droite)), equerre.gauche),
      droite: onglet(intersectionDroites(ligne(r.droite), ligne(precedent.gauche)), equerre.droite),
    };
  };

  return murs.map((w, i) => {
    const e = extremites[i]!;
    const A = coins(e.a, 'a', w), B = coins(e.b, 'b', w);
    /* depuis a, la gauche du rayon est la gauche du mur ; depuis b, c'est sa droite */
    return { id: w.id, contour: [A.droite, B.gauche, B.droite, A.gauche] };
  });
}

export const mursDroits = (f: Floor): MurDroit[] =>
  Object.values(f.objects).filter((o): o is MurDroit => o.type === 'wall' && estDroit(o));
