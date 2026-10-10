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
    case 'placard': case 'stationnement': return [R(-x, -y, x, y, true), L(-x, -y, x, y, true), L(-x, y, x, -y, true)];
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

/** le volume d'une forme, en blocs, dans le repère du meuble (z depuis le sol). Des blocs seulement (le plan, la 3D et
    la coupe les lisent tous), mais assez pour qu'un meuble se reconnaisse en 3D : sommier, matelas, couette et oreillers
    d'un lit, coussins d'un canapé, baignoire creuse, robinetterie, poignées, portes et tiroirs séparés d'un joint. */
export function blocs(forme: Forme, w: Mm, d: Mm, h: Mm): Bloc[] {
  const x = w / 2, y = d / 2;
  const B = (x0: Mm, y0: Mm, x1: Mm, y1: Mm, z0: Mm, z1: Mm, matiere: MatiereMeuble, rond?: boolean): Bloc => ({ x0, y0, x1, y1, z0, z1, matiere, ...(rond ? { rond } : {}) });
  /* quatre pieds carrés (c mm de côté), dans les angles du rectangle donné */
  const piedsDans = (x0: Mm, y0: Mm, x1: Mm, y1: Mm, z: Mm, c = 50, matiere: MatiereMeuble = 'meuble'): Bloc[] => [[x0, y0], [x1 - c, y0], [x1 - c, y1 - c], [x0, y1 - c]].map(([a, b]) => B(a!, b!, a! + c, b! + c, 0, z, matiere));
  const pieds = (z: Mm) => piedsDans(-x, -y, x, y, z);
  /* une façade en vantaux (portes ou tiroirs) : n parts séparées d'un joint de 4 mm, posées 18 mm devant le corps */
  const vantaux = (n: number, z0: Mm, z1: Mm, matiere: MatiereMeuble = 'meuble'): Bloc[] => Array.from({ length: n }, (_, i) => {
    const l = (w - 4 * (n + 1)) / n, a = -x + 4 + i * (l + 4);
    return B(a, y - 18, a + l, y, z0, z1, matiere);
  });
  const tiroirs = (n: number, z0: Mm, z1: Mm): Bloc[] => Array.from({ length: n }, (_, i) => {
    const hh = (z1 - z0 - 4 * (n + 1)) / n, b = z0 + 4 + i * (hh + 4);
    return B(-x + 4, y - 18, x - 4, y, b, b + hh, 'meuble');
  });
  /* une poignée (inox) devant une façade, centrée en x0..x1, à la hauteur z */
  const poignee = (cx: Mm, z: Mm, l = 120): Bloc => B(Math.max(-x, cx - l / 2), y - 1, Math.min(x, cx + l / 2), y, z - 8, z + 8, 'inox');
  /* le caisson de cuisine : socle en retrait, corps, portes et plan de travail débordant de 2 cm */
  const caisson = (dessus: MatiereMeuble = 'plan_travail'): Bloc[] => [B(-x, -y, x, y - 60, 0, 100, 'plan_travail'), B(-x, -y, x, y - 18, 100, h - 40, 'meuble'),
    ...vantaux(Math.max(1, Math.round(w / 600)), 104, h - 44), B(-x, -y, x, y + 20, h - 40, h, dessus)];
  /* un robinet : un fût et un bec, au dos, au milieu (ou décalé) */
  const robinet = (z: Mm, cx: Mm = 0): Bloc[] => [B(cx - 20, -y + 30, cx + 20, -y + 70, z, z + 220, 'inox', true), B(cx - 12, -y + 50, cx + 12, -y + 200, z + 190, z + 220, 'inox')];
  switch (forme) {
    case 'lit': {
      /* sommier sur pieds, matelas, couette sur les deux tiers, un oreiller par place, tête de lit */
      const n = w >= 1_200 ? 2 : 1, m = 80, l = (w - m * (n + 1)) / n, zs = Math.min(320, h * 0.6);
      return [...piedsDans(-x + 20, -y + 70, x - 20, y - 20, 120, 60), B(-x + 10, -y + 60, x - 10, y - 10, 120, zs, 'meuble'), B(-x + 20, -y + 70, x - 20, y - 20, zs, h, 'linge'),
        B(-x, -y + 480, x, y, h - 60, h + 40, 'tissu'), ...Array.from({ length: n }, (_, i) => B(-x + m + i * (l + m), -y + 90, -x + m + i * (l + m) + l, -y + 400, h, h + 130, 'linge')),
        B(-x, -y, x, -y + 60, 0, Math.max(h, 900), 'meuble')];
    }
    case 'canape': case 'fauteuil': {
      /* socle sur pieds, assises (une par place), dossiers et accoudoirs */
      const places = forme === 'fauteuil' ? 1 : Math.max(2, Math.round((w - 300) / 650)), s = (w - 300) / places;
      return [...piedsDans(-x + 30, -y + 30, x - 30, y - 30, 80, 40), B(-x, -y, x, y, 80, 260, 'tissu'),
        ...Array.from({ length: places }, (_, i) => B(-x + 150 + i * s + 5, -y + 200, -x + 150 + (i + 1) * s - 5, y - 10, 260, 440, 'tissu')),
        ...Array.from({ length: places }, (_, i) => B(-x + 150 + i * s + 5, -y, -x + 150 + (i + 1) * s - 5, -y + 200, 260, h, 'tissu')),
        B(-x, -y, -x + 150, y, 80, 620, 'tissu'), B(x - 150, -y, x, y, 80, 620, 'tissu')];
    }
    case 'table': case 'bureau': return [B(-x, -y, x, y, h - 40, h, 'meuble'), ...pieds(h - 40)];
    case 'table_ronde': return [B(-x, -y, x, y, h - 40, h, 'meuble', true), B(-60, -60, 60, 60, 0, h - 40, 'meuble', true), B(-x * 0.45, -y * 0.45, x * 0.45, y * 0.45, 0, 30, 'meuble', true)];
    case 'chaise': return [B(-x, -y + 60, x, y, 420, 460, 'meuble'), B(-x, -y, x, -y + 40, 0, h, 'meuble'), ...pieds(420)];
    case 'meuble_bas': { const n = Math.max(1, Math.round(w / 600)); return [...caisson(), ...Array.from({ length: n }, (_, i) => poignee(-x + w * (i + 0.5) / n, h - 120))] }
    case 'evier': return [...caisson(), B(-x + 60, -y + 90, -30, y - 80, h - 200, h + 2, 'inox'), B(30, -y + 90, x - 60, y - 80, h - 200, h + 2, 'inox'), ...robinet(h)];
    case 'plaque': return [...caisson(), B(-x + 30, -y + 30, x - 30, y - 30, h, h + 8, 'electromenager')];
    case 'ilot': return caisson();
    case 'refrigerateur': {
      /* porte du haut et porte du bas (congélateur) séparées d'un joint, une poignée chacune */
      const zc = Math.round(h * 0.38);
      return [B(-x, -y, x, y - 20, 0, h, 'electromenager'), B(-x + 4, y - 20, x - 4, y, 20, zc - 4, 'electromenager'), B(-x + 4, y - 20, x - 4, y, zc, h - 10, 'electromenager'),
        B(x - 60, y - 1, x - 40, y, zc - 260, zc - 60, 'inox'), B(x - 60, y - 1, x - 40, y, zc + 60, zc + 360, 'inox')];
    }
    case 'colonne': {
      /* la colonne four : le four vitré à hauteur des yeux, des portes dessus et dessous */
      const zf0 = 850, zf1 = Math.min(h - 400, 1_450);
      return [B(-x, -y, x, y - 18, 0, h, 'meuble'), B(-x + 4, y - 18, x - 4, y, 104, zf0 - 4, 'meuble'), B(-x + 30, y - 18, x - 30, y, zf0, zf1, 'vitrage'),
        B(-x + 4, y - 18, x - 4, y, zf1 + 4, h - 4, 'meuble'), poignee(0, zf1 - 40, 400)];
    }
    case 'lave_vaisselle': return [B(-x, -y, x, y - 20, 0, h, 'electromenager'), B(-x + 4, y - 20, x - 4, y, 100, h - 10, 'electromenager'), poignee(0, h - 80, 300)];
    case 'lave_linge': {
      /* le hublot, rond et vitré, au milieu de la façade ; le bandeau des commandes en haut */
      const r = Math.min(w, h) * 0.3;
      return [B(-x, -y, x, y - 10, 0, h, 'electromenager'), B(-r, y - 10, r, y, h * 0.42 - r, h * 0.42 + r, 'vitrage'), B(-x + 20, y - 10, x - 20, y, h - 110, h - 20, 'inox')];
    }
    case 'wc': {
      /* réservoir (ou bâti) contre le mur, cuvette arrondie, abattant */
      const c = Math.min(180, d * 0.35), zc = Math.min(h, 400);
      return [B(-x, -y, x, -y + c, h > 500 ? 0 : 300, h, 'sanitaire'), B(-x * 0.6, -y + c, x * 0.6, y - 120, h > 500 ? 0 : 200, zc - 40, 'sanitaire'),
        B(-x * 0.85, -y + c, x * 0.85, y, zc - 40, zc, 'sanitaire', true)];
    }
    case 'lavabo': return [B(-x, -y, x, y, h - 160, h, 'sanitaire'), B(-x * 0.6, -y + 80, x * 0.6, y - 40, h - 20, h + 1, 'inox', true), ...robinet(h)];
    case 'vasque_double': return [B(-x, -y, x, y - 18, 300, h - 40, 'meuble'), ...vantaux(2, 304, h - 44), B(-x, -y, x, y, h - 40, h, 'sanitaire'), ...robinet(h, -x / 2), ...robinet(h, x / 2)];
    case 'douche': {
      /* le receveur extra-plat, la paroi vitrée sur la moitié du devant, la colonne de douche au mur */
      return [B(-x, -y, x, y, 0, 40, 'sanitaire'), B(-x, y - 10, 0, y, 40, h, 'vitrage'), B(-25, -y, 25, -y + 40, 900, Math.min(h, 2_100), 'inox'), B(-110, -y + 40, 110, -y + 260, Math.min(h, 2_100) - 40, Math.min(h, 2_100), 'inox', true)];
    }
    case 'baignoire': {
      /* une baignoire creuse : quatre rebords de 7 cm, le fond relevé ; la robinetterie au bord, côté mur */
      const e = 70;
      return [B(-x, -y, x, y, 0, 150, 'sanitaire'), B(-x, -y, x, -y + e, 150, h, 'sanitaire'), B(-x, y - e, x, y, 150, h, 'sanitaire'), B(-x, -y + e, -x + e, y - e, 150, h, 'sanitaire'),
        B(x - e, -y + e, x, y - e, 150, h, 'sanitaire'), B(-x + 150, -y + 10, -x + 190, -y + 50, h, h + 160, 'inox', true)];
    }
    case 'chauffe_eau': return [B(-x, -y, x, y, 0, h, 'electromenager', true)];
    case 'aire_rotation': case 'stationnement': return [];
    case 'armoire': {
      /* les portes par paires : leurs poignées se font face, de part et d'autre du joint du milieu de chaque paire */
      const n = Math.max(2, Math.round(w / 500));
      return [B(-x, -y, x, y - 18, 0, h, 'meuble'), ...vantaux(n, 4, h - 4), ...Array.from({ length: n }, (_, i) => poignee(-x + w * (i + 0.5) / n + (i % 2 ? -1 : 1) * w / n * 0.35, h * 0.5, 20))];
    }
    case 'commode': return [B(-x, -y, x, y - 18, 0, h, 'meuble'), ...tiroirs(Math.max(2, Math.round(h / 280)), 60, h - 20)];
    case 'meuble_tv': return [B(-x, -y, x, y - 18, 120, h, 'meuble'), ...vantaux(Math.max(2, Math.round(w / 600)), 124, h - 4), ...piedsDans(-x + 30, -y + 30, x - 30, y - 30, 120, 40)];
    case 'placard': case 'boite': return [B(-x, -y, x, y, 0, h, 'meuble')];
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
