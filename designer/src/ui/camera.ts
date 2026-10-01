/* La caméra du plan : du monde (mm, y vers le haut) à l'écran (pixels CSS,
   y vers le bas), et retour. Seul l'affichage connaît les pixels ; le
   modèle ne voit que des millimètres. */
import type { Mm, Point } from '../model/types';
import type { Boite } from '../geometry/index-spatial';

export interface Camera {
  /** le point du monde au centre de l'écran */
  centre: Point;
  /** pixels par millimètre */
  echelle: number;
  largeur: number;
  hauteur: number;
}

export const ECHELLE_MIN = 0.002, ECHELLE_MAX = 5;

export const versEcran = (c: Camera, p: Point): Point =>
  ({ x: (p.x - c.centre.x) * c.echelle + c.largeur / 2, y: c.hauteur / 2 - (p.y - c.centre.y) * c.echelle });

export const versMonde = (c: Camera, e: Point): Point =>
  ({ x: c.centre.x + (e.x - c.largeur / 2) / c.echelle, y: c.centre.y - (e.y - c.hauteur / 2) / c.echelle });

/** une distance à l'écran, en mm (le rayon d'accrochage, par exemple) */
export const pixelsEnMm = (c: Camera, px: number): Mm => px / c.echelle;

/** zoomer d'un facteur en gardant fixe le point sous le curseur */
export function zoomer(c: Camera, facteur: number, ecran: Point): Camera {
  const echelle = Math.min(ECHELLE_MAX, Math.max(ECHELLE_MIN, c.echelle * facteur));
  const avant = versMonde(c, ecran);
  const c2 = { ...c, echelle };
  const apres = versMonde(c2, ecran);
  return { ...c2, centre: { x: c.centre.x + avant.x - apres.x, y: c.centre.y + avant.y - apres.y } };
}

/** déplacer la vue d'un glissement à l'écran */
export const glisser = (c: Camera, dx: number, dy: number): Camera =>
  ({ ...c, centre: { x: c.centre.x - dx / c.echelle, y: c.centre.y + dy / c.echelle } });

/** cadrer une boîte du monde, avec une marge en pixels */
export function cadrer(c: Camera, b: Boite, marge = 60): Camera {
  const l = Math.max(b.xmax - b.xmin, 1_000), h = Math.max(b.ymax - b.ymin, 1_000);
  const echelle = Math.min(ECHELLE_MAX, Math.max(ECHELLE_MIN, Math.min((c.largeur - 2 * marge) / l, (c.hauteur - 2 * marge) / h)));
  return { ...c, echelle, centre: { x: (b.xmin + b.xmax) / 2, y: (b.ymin + b.ymax) / 2 } };
}

/** la partie du monde visible à l'écran */
export function boiteVisible(c: Camera): Boite {
  const a = versMonde(c, { x: 0, y: c.hauteur }), b = versMonde(c, { x: c.largeur, y: 0 });
  return { xmin: a.x, ymin: a.y, xmax: b.x, ymax: b.y };
}

/** un pas de grille lisible à ce zoom (≥ 12 px) : 10 mm, 50, 100, 500, 1 m, 5 m… */
export function pasDeGrille(c: Camera): Mm {
  for (const p of [10, 50, 100, 500, 1_000, 5_000, 10_000, 50_000]) if (p * c.echelle >= 12) return p;
  return 100_000;
}
