/* Les fenêtres de toit : un châssis posé dans la pente d'un pan. Tout se
   déduit du pan qui contient le centre de la fenêtre (toiture du niveau) :
   la pente, le sens de la montée, les quatre coins dans l'espace et leur
   projection en plan. Rien n'est gardé de la toiture elle-même : si les
   murs bougent, la fenêtre suit le pan, ou se signale hors toiture.

   En plan, la hauteur d'une fenêtre (mesurée dans la pente) se raccourcit
   du cosinus de la pente ; sa largeur, horizontale, se lit telle quelle. */
import type { Floor, Mm, Point, RoofWindow } from '../model/types';
import { toitureDuNiveau, type PanToiture, type Point3 } from './toiture';
import { positionDansAnneau } from '../geometry/predicats';

/** les tailles courantes de châssis de toit (largeur × hauteur dans la pente, mm), sans marque : « ou équivalent » */
export const TAILLES_FENETRE_TOIT: readonly [Mm, Mm][] = [[550, 780], [660, 1_180], [780, 980], [780, 1_180], [780, 1_400], [940, 1_180], [1_140, 1_180], [1_340, 980]];

export interface GeometrieFenetreToit {
  pan: PanToiture;
  /** pente du pan, en degrés */
  pente: number;
  /** le sens de la montée, en plan (unitaire), et la largeur (horizontale, unitaire) */
  montee: Point; travers: Point;
  /** les quatre coins, dans le plan du pan (bas gauche, bas droit, haut droit, haut gauche), et leur projection en plan */
  coins: Point3[];
  plan: Point[];
  /** la normale au pan, vers le ciel (unitaire) */
  normale: Point3;
}

export type ResultatFenetreToit = { ok: true; geo: GeometrieFenetreToit } | { ok: false; raison: string };

/** la géométrie d'une fenêtre de toit sur la toiture du niveau, ou la raison pour laquelle elle ne s'y pose pas */
export function geometrieFenetreToit(f: Floor, o: Pick<RoofWindow, 'center' | 'width' | 'height'>): ResultatFenetreToit {
  const r = toitureDuNiveau(f);
  if (!r) return { ok: false, raison: 'ce niveau ne porte pas de toiture' };
  if (!r.ok) return { ok: false, raison: 'la toiture de ce niveau ne se calcule pas' };
  const pan = r.toitures.flatMap(t => t.pans).find(p => positionDansAnneau(o.center, p.contour) === 'dedans');
  if (!pan) return { ok: false, raison: 'le centre de la fenêtre n’est sur aucun pan de la toiture' };
  const { a, b, c } = pan.plan, g = Math.hypot(a, b);
  if (g < 1e-6) return { ok: false, raison: 'un toit plat ne reçoit pas de fenêtre de toit' };
  const montee = { x: a / g, y: b / g }, travers = { x: -montee.y, y: montee.x };
  const cos = 1 / Math.sqrt(1 + g * g), hp = (o.height / 2) * cos, l = o.width / 2;
  const P = (s: number, t: number): Point => ({ x: o.center.x + travers.x * l * s + montee.x * hp * t, y: o.center.y + travers.y * l * s + montee.y * hp * t });
  const plan = [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)];
  if (plan.some(q => positionDansAnneau(q, pan.contour) === 'dehors')) return { ok: false, raison: 'la fenêtre déborde du pan (rapprochez-la du milieu, ou réduisez-la)' };
  const z = (q: Point) => a * q.x + b * q.y + c;
  const n = Math.hypot(a, b, 1);
  return {
    ok: true,
    geo: { pan, pente: Math.atan(g) * 180 / Math.PI, montee, travers, coins: plan.map(q => ({ ...q, z: z(q) })), plan, normale: { x: -a / n, y: -b / n, z: 1 / n } },
  };
}

/** les fenêtres de toit d'un niveau, avec leur géométrie (celles qui ne se posent plus sont écartées) */
export function fenetresDeToit(f: Floor): { o: RoofWindow; geo: GeometrieFenetreToit }[] {
  return Object.values(f.objects).flatMap(o => {
    if (o.type !== 'roof_window') return [];
    const r = geometrieFenetreToit(f, o);
    return r.ok ? [{ o, geo: r.geo }] : [];
  });
}
