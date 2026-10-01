/* Le calage d'un fond (plan PDF ou image) : une similitude, du point de
   l'image au point du plan.

   L'image se lit en pixels (ou points PDF) : u vers la droite, v vers le
   BAS. Le plan se lit en millimètres, y vers le HAUT. On retourne donc v,
   puis on applique échelle, rotation et translation :
       plan = (tx, ty) + échelle × rotation(θ) × (u, −v)
   Caler = désigner deux points de l'image et dire où ils sont sur le plan
   (ou la distance réelle qui les sépare) : la similitude est alors unique.
   Rien n'est deviné : sans deux points distincts, pas de calage. */
import type { Mm, Point, Underlay } from '../model/types';
import { EPS_COINCIDENCE } from '../geometry/tolerance';
import { angleDe, distance, soustraire, tourner } from '../geometry/vecteur';

export type Transformation = Underlay['transform'];

export const TRANSFORMATION_NEUTRE: Transformation = { scale: 1, rotation: 0, tx: 0, ty: 0 };

/** l'image retournée : v vers le haut */
const retourner = (p: Point): Point => ({ x: p.x, y: -p.y });

export function imageVersPlan(t: Transformation, p: Point): Point {
  const q = tourner(retourner(p), t.rotation);
  return { x: t.tx + t.scale * q.x, y: t.ty + t.scale * q.y };
}

export function planVersImage(t: Transformation, p: Point): Point {
  const q = tourner({ x: (p.x - t.tx) / t.scale, y: (p.y - t.ty) / t.scale }, -t.rotation);
  return retourner(q);
}

/** la similitude qui envoie deux points de l'image sur deux points du plan */
export function calage(image: readonly [Point, Point], plan: readonly [Point, Point]): Transformation | string {
  const [i1, i2] = image.map(retourner) as [Point, Point], [p1, p2] = plan;
  const di = distance(i1, i2), dp = distance(p1, p2);
  if (!(di > 0)) return 'les deux points de l’image sont confondus';
  if (!(dp > EPS_COINCIDENCE)) return 'les deux points du plan sont confondus';
  const scale = dp / di;
  const rotation = angleDe(soustraire(p2, p1)) - angleDe(soustraire(i2, i1));
  const q = tourner(i1, rotation);
  const t = { scale, rotation, tx: p1.x - scale * q.x, ty: p1.y - scale * q.y };
  return [t.scale, t.rotation, t.tx, t.ty].every(Number.isFinite) ? t : 'calage impossible';
}

/** caler par une distance connue : le premier point garde sa place sur le
    plan, l'orientation de l'image est conservée, seule l'échelle change */
export function calageParDistance(t: Transformation, image: readonly [Point, Point], reelle: Mm): Transformation | string {
  if (!(reelle > 0)) return 'la distance réelle doit être positive';
  const p1 = imageVersPlan(t, image[0]), p2 = imageVersPlan(t, image[1]);
  const d = distance(p1, p2);
  if (!(d > 0)) return 'les deux points de l’image sont confondus';
  const k = reelle / d;
  return calage(image, [p1, { x: p1.x + (p2.x - p1.x) * k, y: p1.y + (p2.y - p1.y) * k }]);
}
