/* Le mobilier : sa forme en plan (traits), son volume (blocs) et sa pose.

   - Formes : chaque forme de la bibliothèque (catalogue/mobilier.ts) se
     décrit dans le repère du meuble (centre, x en largeur, y en
     profondeur, dos vers −y) ; le plan et la 3D lisent la même description.
   - Pose : approché d'un mur, un meuble s'y plaque, dos contre la face, et
     se tourne vers la pièce ; près d'un angle, il glisse jusqu'au mur voisin
     (cuisine, lit, douche dans un coin). Alt pose librement. */
import type { Floor, Furniture, Mm, Point } from '../model/types';
import { modeleMeuble, type Forme } from '../catalogue/mobilier';
import { planDuNiveau } from './plan';
import { decalagesFaces, mursDroits } from './murs';
import { EPS_SUR_FACE } from '../geometry/tolerance';

export type Trait =
  | { genre: 'rect'; x0: Mm; y0: Mm; x1: Mm; y1: Mm; tirets?: boolean }
  | { genre: 'ellipse'; cx: Mm; cy: Mm; rx: Mm; ry: Mm; tirets?: boolean }
  | { genre: 'ligne'; x0: Mm; y0: Mm; x1: Mm; y1: Mm; tirets?: boolean };

export type MatiereMeuble = 'meuble' | 'tissu' | 'linge' | 'plan_travail' | 'sanitaire' | 'electromenager' | 'inox' | 'vitrage';

/** un volume de meuble : un rectangle (ou une ellipse, « rond ») du repère du meuble, de z0 à z1 au-dessus du sol */
export interface Bloc { x0: Mm; y0: Mm; x1: Mm; y1: Mm; z0: Mm; z1: Mm; matiere: MatiereMeuble; rond?: boolean }

/** la forme d'un meuble (« boîte » si son modèle n'est plus dans la bibliothèque) */
export const formeDe = (o: Pick<Furniture, 'catalogRef'>): Forme => modeleMeuble(o.catalogRef.id)?.forme ?? 'boite';

const R = (x0: Mm, y0: Mm, x1: Mm, y1: Mm, tirets?: boolean): Trait => ({ genre: 'rect', x0, y0, x1, y1, ...(tirets ? { tirets } : {}) });
const E = (cx: Mm, cy: Mm, rx: Mm, ry: Mm, tirets?: boolean): Trait => ({ genre: 'ellipse', cx, cy, rx, ry, ...(tirets ? { tirets } : {}) });
const L = (x0: Mm, y0: Mm, x1: Mm, y1: Mm, tirets?: boolean): Trait => ({ genre: 'ligne', x0, y0, x1, y1, ...(tirets ? { tirets } : {}) });

/** le symbole en plan d'une forme, dans le repère du meuble */
export function traits(forme: Forme, w: Mm, d: Mm): Trait[] {
  const x = w / 2, y = d / 2, tout = R(-x, -y, x, y);
  switch (forme) {
    case 'lit': {
      const n = w >= 1_200 ? 2 : 1, m = 80, l = (w - m * (n + 1)) / n;
      return [tout, ...Array.from({ length: n }, (_, i) => R(-x + m + i * (l + m), -y + 80, -x + m + i * (l + m) + l, -y + 330)), L(-x, -y + 480, x, -y + 480)];
    }
    case 'canape': case 'fauteuil': {
      const places = forme === 'fauteuil' ? 1 : Math.max(2, Math.round((w - 300) / 650)), s = (w - 300) / places;
      return [tout, R(-x, -y, x, -y + 200), R(-x, -y + 200, -x + 150, y), R(x - 150, -y + 200, x, y),
        ...Array.from({ length: places - 1 }, (_, i) => L(-x + 150 + (i + 1) * s, -y + 200, -x + 150 + (i + 1) * s, y))];
    }
    case 'table_ronde': return [E(0, 0, x, y)];
    case 'chaise': return [R(-x, -y + 60, x, y), L(-x, -y + 30, x, -y + 30)];
    case 'armoire': return [tout, L(-x, y - 60, x, y - 60), L(-x + 60, 0, x - 60, 0, true)];
    /* le placard des plans : son emprise et ses diagonales en tirets (le « PL » s'écrit au milieu, voir ui/dessin.ts) */
    case 'placard': return [R(-x, -y, x, y, true), L(-x, -y, x, y, true), L(-x, y, x, -y, true)];
    case 'commode': case 'meuble_tv': return [tout, L(-x, y - 40, x, y - 40)];
    case 'meuble_bas': return [tout, L(-x, y - 30, x, y - 30)];
    case 'evier': return [tout, R(-x + 60, -y + 90, -60, y - 80), R(60, -y + 90, x - 60, y - 80), E(0, -y + 50, 25, 25)];
    case 'plaque': return [tout, E(-x / 2, -y / 2, 90, 90), E(x / 2, -y / 2, 70, 70), E(-x / 2, y / 2, 70, 70), E(x / 2, y / 2, 90, 90)];
    case 'refrigerateur': case 'colonne': return [tout, L(-x, -y, x, y), L(-x, y, x, -y)];
    case 'lave_vaisselle': return [tout, R(-x + 50, -y + 50, x - 50, y - 50)];
    case 'ilot': return [tout, R(-x + 40, -y + 40, x - 40, y - 40)];
    case 'wc': { const c = Math.min(180, d * 0.35); return [R(-x, -y, x, -y + c), E(0, -y + c + (d - c) / 2, x * 0.85, (d - c) / 2)] }
    case 'lavabo': return [tout, E(0, 30, x * 0.7, y * 0.6)];
    case 'vasque_double': return [tout, E(-x / 2, 30, x * 0.32, y * 0.55), E(x / 2, 30, x * 0.32, y * 0.55)];
    case 'douche': return [tout, L(-x, -y, x, y), L(-x, y, x, -y), E(0, 0, 40, 40)];
    case 'baignoire': return [tout, R(-x + 70, -y + 70, x - 70, y - 70), E(-x + 200, 0, 30, 30)];
    case 'lave_linge': return [tout, E(0, 40, Math.min(x, y) * 0.65, Math.min(x, y) * 0.65)];
    case 'chauffe_eau': return [E(0, 0, x, y), E(0, 0, x * 0.25, y * 0.25)];
    case 'aire_rotation': return [E(0, 0, x, y, true)];
    case 'table': case 'bureau': case 'boite': return [tout];
  }
}

/** le volume d'une forme, en blocs, dans le repère du meuble (z depuis le sol) */
export function blocs(forme: Forme, w: Mm, d: Mm, h: Mm): Bloc[] {
  const x = w / 2, y = d / 2;
  const B = (x0: Mm, y0: Mm, x1: Mm, y1: Mm, z0: Mm, z1: Mm, matiere: MatiereMeuble, rond?: boolean): Bloc => ({ x0, y0, x1, y1, z0, z1, matiere, ...(rond ? { rond } : {}) });
  /* quatre pieds de 5 × 5 cm, dans les angles */
  const pieds = (z: Mm): Bloc[] => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
    B(sx! < 0 ? -x : x - 50, sy! < 0 ? -y : y - 50, sx! < 0 ? -x + 50 : x, sy! < 0 ? -y + 50 : y, 0, z, 'meuble'));
  const caisson = (dessus: MatiereMeuble = 'plan_travail'): Bloc[] => [B(-x, -y, x, y - 60, 0, 100, 'plan_travail'), B(-x, -y, x, y, 100, h - 40, 'meuble'), B(-x, -y, x, y + 20, h - 40, h, dessus)];
  switch (forme) {
    case 'lit': return [B(-x, -y + 60, x, y, 0, h, 'linge'), B(-x, -y, x, -y + 60, 0, Math.max(h, 900), 'meuble'), B(-x + 80, -y + 80, x - 80, -y + 330, h, h + 120, 'linge')];
    case 'canape': case 'fauteuil': return [B(-x + 150, -y + 200, x - 150, y, 0, 430, 'tissu'), B(-x, -y, x, -y + 200, 0, h, 'tissu'), B(-x, -y + 200, -x + 150, y, 0, 620, 'tissu'), B(x - 150, -y + 200, x, y, 0, 620, 'tissu')];
    case 'table': case 'bureau': return [B(-x, -y, x, y, h - 40, h, 'meuble'), ...pieds(h - 40)];
    case 'table_ronde': return [B(-x, -y, x, y, h - 40, h, 'meuble', true), B(-60, -60, 60, 60, 0, h - 40, 'meuble', true)];
    case 'chaise': return [B(-x, -y + 60, x, y, 420, 460, 'meuble'), B(-x, -y, x, -y + 60, 0, h, 'meuble'), ...pieds(420)];
    case 'meuble_bas': return caisson();
    case 'evier': return [...caisson(), B(-x + 60, -y + 90, x - 60, y - 80, h - 2, h + 2, 'inox')];
    case 'plaque': return [...caisson(), B(-x + 30, -y + 30, x - 30, y - 30, h, h + 8, 'electromenager')];
    case 'ilot': return caisson();
    case 'refrigerateur': case 'colonne': case 'lave_vaisselle': case 'lave_linge': return [B(-x, -y, x, y, 0, h, 'electromenager')];
    case 'wc': { const c = Math.min(180, d * 0.35); return [B(-x, -y, x, -y + c, 0, h, 'sanitaire'), B(-x * 0.85, -y + c, x * 0.85, y, 0, Math.min(h, 420), 'sanitaire', true)] }
    case 'lavabo': return [B(-x, -y, x, y, h - 160, h, 'sanitaire')];
    case 'vasque_double': return [B(-x, -y, x, y, 300, h - 40, 'meuble'), B(-x, -y, x, y, h - 40, h, 'sanitaire')];
    case 'douche': return [B(-x, -y, x, y, 0, 40, 'sanitaire'), B(-x, y - 10, 0, y, 40, h, 'vitrage')];
    case 'baignoire': return [B(-x, -y, x, y, 0, h, 'sanitaire')];
    case 'chauffe_eau': return [B(-x, -y, x, y, 0, h, 'electromenager', true)];
    case 'aire_rotation': return [];
    case 'armoire': case 'placard': case 'commode': case 'meuble_tv': case 'boite': return [B(-x, -y, x, y, 0, h, 'meuble')];
  }
}

/** du repère d'un meuble au plan */
export function versPlan(o: Pick<Furniture, 'position' | 'rotation'>, p: Point): Point {
  const c = Math.cos(o.rotation), s = Math.sin(o.rotation);
  return { x: o.position.x + p.x * c - p.y * s, y: o.position.y + p.x * s + p.y * c };
}

/** du plan au repère d'un meuble */
export function versMeuble(o: Pick<Furniture, 'position' | 'rotation'>, p: Point): Point {
  const c = Math.cos(o.rotation), s = Math.sin(o.rotation), dx = p.x - o.position.x, dy = p.y - o.position.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

/** le rectangle d'encombrement d'un meuble, en plan */
export const emprise = (o: Pick<Furniture, 'position' | 'rotation' | 'width' | 'depth'>): Point[] =>
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => versPlan(o, { x: sx! * o.width / 2, y: sy! * o.depth / 2 }));

export const dansMeuble = (o: Pick<Furniture, 'position' | 'rotation' | 'width' | 'depth'>, p: Point): boolean => {
  const q = versMeuble(o, p);
  return Math.abs(q.x) <= o.width / 2 && Math.abs(q.y) <= o.depth / 2;
};

/** une face de mur : son segment (tel que le contour du mur le borne) et sa normale, vers l'extérieur du mur */
interface Face { a: Point; b: Point; u: Point; n: Point }

function faces(f: Floor): Face[] {
  const plan = planDuNiveau(f), contours = new Map(plan.murs.map(m => [m.id, m.contour]));
  const out: Face[] = [];
  for (const w of mursDroits(f)) {
    const L = Math.hypot(w.axis.b.x - w.axis.a.x, w.axis.b.y - w.axis.a.y);
    if (!(L > 0)) continue;
    const u = { x: (w.axis.b.x - w.axis.a.x) / L, y: (w.axis.b.y - w.axis.a.y) / L }, n = { x: -u.y, y: u.x }, F = decalagesFaces(w);
    for (const [off, sens] of [[F.gauche, 1], [F.droite, -1]] as const) {
      /* le segment de la face : ses sommets sur le contour du mur (onglets compris) */
      const T = (contours.get(w.id) ?? []).filter(p => Math.abs((p.x - w.axis.a.x) * n.x + (p.y - w.axis.a.y) * n.y - off) <= EPS_SUR_FACE)
        .map(p => (p.x - w.axis.a.x) * u.x + (p.y - w.axis.a.y) * u.y);
      const t0 = T.length ? Math.min(...T) : 0, t1 = T.length ? Math.max(...T) : L;
      const P = (t: number) => ({ x: w.axis.a.x + u.x * t + n.x * off, y: w.axis.a.y + u.y * t + n.y * off });
      out.push({ a: P(t0), b: P(t1), u, n: { x: n.x * sens, y: n.y * sens } });
    }
  }
  return out;
}

export interface Pose { position: Point; rotation: number; plaque: boolean }

/** où poser un meuble visé en p : plaqué contre la face de mur la plus proche
    (à « portee » près, en plus de sa demi-profondeur), tourné vers la pièce,
    glissé jusqu'au mur voisin s'il en est tout près ; sinon tel quel */
export function poserMeuble(f: Floor, p: Point, largeur: Mm, profondeur: Mm, rotation: number, portee: Mm): Pose {
  const F = faces(f);
  let best: { face: Face; d: number; t: number } | null = null;
  for (const face of F) {
    const d = (p.x - face.a.x) * face.n.x + (p.y - face.a.y) * face.n.y;              // du côté de la pièce, à cette distance
    const t = (p.x - face.a.x) * face.u.x + (p.y - face.a.y) * face.u.y;
    const len = Math.hypot(face.b.x - face.a.x, face.b.y - face.a.y);
    if (d < -EPS_SUR_FACE || d > profondeur / 2 + portee || t < -largeur / 2 || t > len + largeur / 2) continue;
    if (!best || d < best.d) best = { face, d, t };
  }
  if (!best) return { position: p, rotation, plaque: false };
  const { face, t } = best, n = face.n, u = face.u;
  /* dos contre la face : le devant (+y du meuble) regarde la pièce */
  const rot = Math.atan2(n.y, n.x) - Math.PI / 2;
  let c = { x: face.a.x + u.x * t + n.x * profondeur / 2, y: face.a.y + u.y * t + n.y * profondeur / 2 };
  /* un mur voisin, perpendiculaire, qui touche presque un côté : on l'y amène */
  let meilleur: { decal: number } | null = null;
  for (const g of F) {
    if (g === face || Math.abs(g.n.x * u.x + g.n.y * u.y) < 0.999) continue;
    /* la face voisine doit couvrir la profondeur du meuble */
    const s0 = (g.a.x - face.a.x) * n.x + (g.a.y - face.a.y) * n.y, s1 = (g.b.x - face.a.x) * n.x + (g.b.y - face.a.y) * n.y;
    if (Math.max(s0, s1) < profondeur * 0.5 || Math.min(s0, s1) > EPS_SUR_FACE + profondeur * 0.5) continue;
    const pos = (g.a.x - c.x) * u.x + (g.a.y - c.y) * u.y;                           // la face voisine, le long du mur
    const sens = g.n.x * u.x + g.n.y * u.y;                                            // +1 : elle regarde vers +u (mur du côté −u)
    const bord = sens > 0 ? pos + largeur / 2 : pos - largeur / 2;                     // décalage qui amène le côté contre elle
    const ecart = sens > 0 ? bord : -bord;                                             // > 0 : le meuble mord dans le mur ; < 0 : un jour
    if (ecart > -portee && ecart < largeur / 2 && (!meilleur || Math.abs(bord) < Math.abs(meilleur.decal))) meilleur = { decal: bord };
  }
  if (meilleur) c = { x: c.x + u.x * meilleur.decal, y: c.y + u.y * meilleur.decal };
  return { position: { x: Math.round(c.x * 1e3) / 1e3, y: Math.round(c.y * 1e3) / 1e3 }, rotation: rot, plaque: true };
}
