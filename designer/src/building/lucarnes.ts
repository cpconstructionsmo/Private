/* Les lucarnes : une petite construction posée sur un pan, avec sa façade
   verticale, ses jouées et sa propre toiture. Tout se déduit du pan qui
   contient le milieu de sa façade (toiture du niveau, comme une fenêtre de
   toit) : rien n'est gardé de la toiture, la lucarne suit les murs.

   Dans le repère du pan : u le long de l'égout (horizontal), v vers le haut
   de la pente (en plan) ; le toit monte de g par millimètre de v
   (g = tangente de sa pente). La façade est en v = 0, de u = −l/2 à +l/2 ;
   elle part du toit (z0) et monte de « hauteur » jusqu'à l'égout de la
   lucarne (zf).
   - JACOBINE (deux pans) : faîtage en u = 0 à zr = zf + l/2 · tan p ; ses
     égouts courent jusqu'à ce que le toit les rejoigne (v = (zf − z0)/g),
     son faîtage jusqu'à v = (zr − z0)/g ; les noues relient ces deux points
     et sont sur le pan (tout y est linéaire). Fronton en façade.
   - CAPUCINE (trois pans) : comme la jacobine, avec une croupe en façade à
     la même pente : le faîtage commence à v = l/2. Façade rectangulaire.
   - RAMPANTE (un pan) : un pan qui monte de zf moins vite que le toit et le
     rejoint en v = (zf − z0)/(g − tan p). Façade rectangulaire.
   Les jouées sont les triangles verticaux sous les égouts latéraux. */
import type { Dormer, Floor, Mm, Point } from '../model/types';
import { toitureDuNiveau, type PanToiture, type Point3 } from './toiture';
import { positionDansAnneau } from '../geometry/predicats';

export const LUCARNES: Record<Dormer['kind'], string> = { gable: 'Jacobine (deux pans)', hip: 'Capucine (trois pans)', shed: 'Rampante (un pan)' };

/** les valeurs proposées d'une lucarne neuve (ordres de grandeur, à ajuster au projet) */
export const LUCARNE_PAR_DEFAUT = { largeur: 1_400, hauteur: 1_400, fenetreLargeur: 800, fenetreHauteur: 950, penteRampante: 20 } as const;

export interface GeometrieLucarne {
  pan: PanToiture;
  /** repère du pan, en plan : le long de l'égout, vers le haut de la pente */
  travers: Point; montee: Point;
  /** les pans de sa toiture, les murs (façade, jouées), la fenêtre : des polygones dans l'espace */
  toits: Point3[][];
  facade: Point3[];
  joues: Point3[][];
  fenetre: Point3[];
  /** l'emprise en plan (ce qu'elle couvre du pan) */
  plan: Point[];
  /** altitudes : pied de façade, égout et faîtage de la lucarne */
  z0: Mm; zf: Mm; zr: Mm;
  /** la surface de sa couverture (rampante, mm²) */
  surfaceCouverture: number;
}

export type ResultatLucarne = { ok: true; geo: GeometrieLucarne } | { ok: false; raison: string };

const aire3 = (P: Point3[]): number => {
  /* la moitié de la norme de la somme des produits vectoriels (polygone plan) */
  let x = 0, y = 0, z = 0;
  P.forEach((a, i) => { const b = P[(i + 1) % P.length]!; x += a.y * b.z - a.z * b.y; y += a.z * b.x - a.x * b.z; z += a.x * b.y - a.y * b.x });
  return Math.hypot(x, y, z) / 2;
};

/** la géométrie d'une lucarne sur la toiture du niveau, ou la raison pour laquelle elle ne s'y pose pas */
export function geometrieLucarne(f: Floor, o: Pick<Dormer, 'kind' | 'center' | 'width' | 'height' | 'pitch' | 'windowWidth' | 'windowHeight'>): ResultatLucarne {
  const r = toitureDuNiveau(f);
  if (!r) return { ok: false, raison: 'ce niveau ne porte pas de toiture' };
  if (!r.ok) return { ok: false, raison: 'la toiture de ce niveau ne se calcule pas' };
  const pan = r.toitures.flatMap(t => t.pans).find(p => positionDansAnneau(o.center, p.contour) === 'dedans');
  if (!pan) return { ok: false, raison: 'la façade de la lucarne n’est sur aucun pan de la toiture' };
  const { a, b, c } = pan.plan, g = Math.hypot(a, b);
  if (g < 1e-6) return { ok: false, raison: 'un toit plat ne reçoit pas de lucarne' };
  const montee = { x: a / g, y: b / g }, travers = { x: -montee.y, y: montee.x };
  const t = Math.tan((o.pitch * Math.PI) / 180), l = o.width / 2;
  const z0 = a * o.center.x + b * o.center.y + c, zf = z0 + o.height;
  const P = (u: number, v: number, z: number): Point3 => ({ x: o.center.x + travers.x * u + montee.x * v, y: o.center.y + travers.y * u + montee.y * v, z });
  const vE = o.height / g;                                        // le toit rejoint l'égout de la lucarne
  let toits: Point3[][], facade: Point3[], joues: Point3[][], zr: Mm, fond: Mm;
  if (o.kind === 'shed') {
    if (t >= g - 0.05) return { ok: false, raison: 'une lucarne rampante est moins pentue que le toit (au moins 3° de moins)' };
    fond = o.height / (g - t); zr = zf + fond * t;
    toits = [[P(-l, 0, zf), P(l, 0, zf), P(l, fond, zr), P(-l, fond, zr)]];
    facade = [P(-l, 0, z0), P(l, 0, z0), P(l, 0, zf), P(-l, 0, zf)];
    joues = [[P(-l, 0, z0), P(-l, 0, zf), P(-l, fond, zr)], [P(l, 0, z0), P(l, fond, zr), P(l, 0, zf)]];
  } else {
    zr = zf + l * t; fond = (zr - z0) / g;
    const debut = o.kind === 'hip' ? l : 0;                       // la croupe en façade : le faîtage commence plus loin
    if (o.kind === 'hip' && fond <= debut + 50) return { ok: false, raison: 'capucine trop large pour sa pente : le toit la rejoint avant le faîtage' };
    toits = [
      [P(0, debut, zr), P(0, fond, zr), P(-l, vE, zf), P(-l, 0, zf)],
      [P(0, debut, zr), P(l, 0, zf), P(l, vE, zf), P(0, fond, zr)],
      ...(o.kind === 'hip' ? [[P(-l, 0, zf), P(l, 0, zf), P(0, l, zr)]] : []),
    ].map(T => T.filter((q, i) => i === 0 || Math.hypot(q.x - T[i - 1]!.x, q.y - T[i - 1]!.y, q.z - T[i - 1]!.z) > 1));
    facade = o.kind === 'gable' ? [P(-l, 0, z0), P(l, 0, z0), P(l, 0, zf), P(0, 0, zr), P(-l, 0, zf)] : [P(-l, 0, z0), P(l, 0, z0), P(l, 0, zf), P(-l, 0, zf)];
    joues = [[P(-l, 0, z0), P(-l, 0, zf), P(-l, vE, zf)], [P(l, 0, z0), P(l, vE, zf), P(l, 0, zf)]];
  }
  /* la fenêtre : centrée, son linteau 15 cm sous l'égout de la lucarne */
  const fl = o.windowWidth / 2, haut = zf - 150, bas = haut - o.windowHeight;
  if (fl > l - 100) return { ok: false, raison: 'fenêtre trop large pour la lucarne (10 cm de trumeau au moins de chaque côté)' };
  if (bas < z0 + 100) return { ok: false, raison: 'fenêtre trop haute pour la façade de la lucarne' };
  const fenetre = [P(-fl, 0, bas), P(fl, 0, bas), P(fl, 0, haut), P(-fl, 0, haut)];
  const plan = (o.kind === 'shed' ? [P(-l, 0, 0), P(l, 0, 0), P(l, fond, 0), P(-l, fond, 0)] : [P(-l, 0, 0), P(l, 0, 0), P(l, vE, 0), P(0, fond, 0), P(-l, vE, 0)]).map(q => ({ x: q.x, y: q.y }));
  if (plan.some(q => positionDansAnneau(q, pan.contour) === 'dehors')) return { ok: false, raison: 'la lucarne déborde du pan (rapprochez-la du milieu ou de l’égout, ou réduisez-la)' };
  return { ok: true, geo: { pan, travers, montee, toits, facade, joues, fenetre, plan, z0, zf, zr, surfaceCouverture: toits.reduce((s, T) => s + aire3(T), 0) } };
}

/** les lucarnes d'un niveau, avec leur géométrie (celles qui ne se posent plus sont écartées) */
export function lucarnesDuNiveau(f: Floor): { o: Dormer; geo: GeometrieLucarne }[] {
  return Object.values(f.objects).flatMap(o => {
    if (o.type !== 'dormer') return [];
    const r = geometrieLucarne(f, o);
    return r.ok ? [{ o, geo: r.geo }] : [];
  });
}
