/* Vecteurs et points du plan, en millimètres. Fonctions pures : aucune ne
   modifie ses arguments, toutes rendent un nouveau point. */
import type { Point, Radian } from '../model/types';
import { EPS_COINCIDENCE } from './tolerance';

export const pt = (x: number, y: number): Point => ({ x, y });
export const ajouter = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const soustraire = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const multiplier = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
export const scalaire = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
/** produit vectoriel (composante z) : > 0 si b est à gauche de a */
export const vectoriel = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
export const norme = (a: Point): number => Math.hypot(a.x, a.y);
export const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);
export const milieu = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** le vecteur de longueur 1 ; un vecteur nul reste nul (pas de division par zéro) */
export function normaliser(a: Point): Point {
  const n = norme(a);
  return n > 0 ? { x: a.x / n, y: a.y / n } : { x: 0, y: 0 };
}

/** la normale à gauche (rotation de +90°) */
export const normaleGauche = (a: Point): Point => ({ x: -a.y, y: a.x });

/** rotation d'un point autour d'un centre (sens trigonométrique) */
export function tourner(p: Point, angle: Radian, centre: Point = { x: 0, y: 0 }): Point {
  const c = Math.cos(angle), s = Math.sin(angle), dx = p.x - centre.x, dy = p.y - centre.y;
  return { x: centre.x + dx * c - dy * s, y: centre.y + dx * s + dy * c };
}

/** même point, à la tolérance de coïncidence près */
export const memePoint = (a: Point, b: Point, eps: number = EPS_COINCIDENCE): boolean => distance(a, b) <= eps;

/** l'angle d'un vecteur, dans ]-π, π] */
export const angleDe = (a: Point): Radian => Math.atan2(a.y, a.x);
