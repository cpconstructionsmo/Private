/* Le fond cadastral du plan de masse : les parcelles voisines et le bâti
   existant du plan cadastral (PCI, publié par la DGFiP et Etalab), calés
   sur la limite de propriété du projet.

   1. Lecture : un GeoJSON du cadastre (cadastre.data.gouv.fr, fichiers
      « parcelles » et « batiments » d'une commune ; ou l'API Carto de
      l'IGN), en longitude / latitude (WGS 84) ou déjà en Lambert 93.
   2. Projection : Lambert 93 (EPSG:2154), conique conforme sur l'ellipsoïde
      GRS 80 ; des mètres, le nord en haut.
   3. Calage : le terrain du projet (les parcelles de sa référence
      cadastrale, « ZB n°237 et 238 ») est posé sur la limite tracée dans
      le Designer : on cherche la rotation (et la translation) qui les
      superpose au mieux, sans changer l'échelle ; l'écart moyen restant est
      dit. La rotation donne le nord du plan.
   Seules les parcelles et le bâti à moins de 150 m du terrain sont gardés.
   Le cadastre n'est pas un plan de géomètre : ses limites ne sont pas
   garanties, et la planche le dit. */
import type { Mm, Plot, Point } from '../model/types';

export type Cadastre = NonNullable<Plot['cadastre']>;

/** une parcelle lue (coordonnées du fichier, en mètres une fois projetées) */
export interface ParcelleLue { reference: string; section: string; numero: string; anneaux: Point[][] }
export interface CadastreLu { parcelles: ParcelleLue[]; batiments: Point[][]; lambert: boolean }

/* ---------- Lambert 93 ---------- */

const GRS80 = { a: 6_378_137, e: 0.0818191910428158 } as const;
const L93 = { lon0: 3, lat0: 46.5, lat1: 44, lat2: 49, x0: 700_000, y0: 6_600_000 } as const;
const rad = (d: number) => (d * Math.PI) / 180;
const m = (lat: number) => Math.cos(lat) / Math.sqrt(1 - GRS80.e ** 2 * Math.sin(lat) ** 2);
const t = (lat: number) => Math.tan(Math.PI / 4 - lat / 2) / ((1 - GRS80.e * Math.sin(lat)) / (1 + GRS80.e * Math.sin(lat))) ** (GRS80.e / 2);
const N_L93 = (Math.log(m(rad(L93.lat1))) - Math.log(m(rad(L93.lat2)))) / (Math.log(t(rad(L93.lat1))) - Math.log(t(rad(L93.lat2))));
const F_L93 = m(rad(L93.lat1)) / (N_L93 * t(rad(L93.lat1)) ** N_L93);
const R0_L93 = GRS80.a * F_L93 * t(rad(L93.lat0)) ** N_L93;

/** de la longitude / latitude (degrés, WGS 84 ≈ RGF 93) au Lambert 93 (mètres) */
export function versLambert93(lon: number, lat: number): Point {
  const r = GRS80.a * F_L93 * t(rad(lat)) ** N_L93, th = N_L93 * (rad(lon) - rad(L93.lon0));
  return { x: L93.x0 + r * Math.sin(th), y: L93.y0 + R0_L93 - r * Math.cos(th) };
}

/* ---------- lecture ---------- */

/** « ZB n° 237 » : section et numéro d'une parcelle (les zéros de tête ôtés) */
export const referenceParcelle = (section: string, numero: string) => section.replace(/^0+(?=.)/, '') + ' n° ' + numero.replace(/^0+(?=.)/, '');

/** un GeoJSON du cadastre : ses parcelles (Polygon, MultiPolygon) et son bâti. Les coordonnées en degrés sont
    projetées en Lambert 93 ; un fichier déjà en mètres (Lambert 93) est gardé tel quel. */
export function lireCadastreGeoJSON(brut: unknown, genre?: 'parcelles' | 'batiments'): CadastreLu {
  const g = brut as { type?: string; features?: unknown[] } | null;
  const F = g?.type === 'FeatureCollection' && Array.isArray(g.features) ? g.features : g?.type === 'Feature' ? [g] : null;
  if (!F) throw new Error('ce fichier n’est pas un GeoJSON du cadastre (FeatureCollection attendue)');
  const out: CadastreLu = { parcelles: [], batiments: [], lambert: false };
  /* les coordonnées : des degrés (|x| ≤ 180) ou des mètres (Lambert 93 : x autour de 700 000) */
  let degres: boolean | null = null;
  const point = (c: unknown): Point | null => {
    if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number' || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
    if (degres === null) degres = Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
    return degres ? versLambert93(c[0], c[1]) : { x: c[0], y: c[1] };
  };
  const anneau = (A: unknown): Point[] | null => {
    if (!Array.isArray(A)) return null;
    const P = A.map(point).filter((q): q is Point => !!q);
    if (P.length > 3 && Math.hypot(P[0]!.x - P[P.length - 1]!.x, P[0]!.y - P[P.length - 1]!.y) < 1e-6) P.pop();      // le GeoJSON ferme ses anneaux
    return P.length >= 3 ? P : null;
  };
  for (const f of F) {
    const x = f as { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> };
    const geo = x.geometry, pr = x.properties ?? {};
    if (!geo) continue;
    const polys = geo.type === 'Polygon' ? [geo.coordinates] : geo.type === 'MultiPolygon' && Array.isArray(geo.coordinates) ? geo.coordinates : [];
    /* l'anneau extérieur de chaque polygone (les trous d'une parcelle ne se dessinent pas au plan de masse) */
    const A = (polys as unknown[]).map(p => (Array.isArray(p) ? anneau(p[0]) : null)).filter((a): a is Point[] => !!a);
    if (!A.length) continue;
    const section = String(pr['section'] ?? '').trim(), numero = String(pr['numero'] ?? '').trim();
    const estParcelle = genre ? genre === 'parcelles' : !!(section && numero);
    if (estParcelle) out.parcelles.push({ reference: referenceParcelle(section || '?', numero || '?'), section, numero, anneaux: A });
    else out.batiments.push(...A);
  }
  out.lambert = true;
  if (!out.parcelles.length && !out.batiments.length) throw new Error('aucune parcelle ni aucun bâtiment dans ce fichier');
  return out;
}

/** les parcelles d'une référence écrite « ZB n°237 et 238 », « AB 12, 13 », « ZB 0237 » */
export function parcellesDeReference(reference: string, P: readonly ParcelleLue[]): ParcelleLue[] {
  const r = reference.toUpperCase();
  const sec = /\b([A-Z]{1,2}|0[A-Z])\b/.exec(r.replace(/N°|N\s/g, ' '))?.[1]?.replace(/^0/, '');
  const nums = [...r.matchAll(/\d+/g)].map(x => String(Number(x[0])));
  return P.filter(p => nums.includes(String(Number(p.numero))) && (!sec || p.section.replace(/^0+/, '') === sec));
}

/* ---------- calage ---------- */

/* le centre de gravité, calculé depuis le premier sommet : en Lambert 93 et en mm, les coordonnées
   dépassent le milliard et leurs produits perdraient la précision du double */
function centre(anneaux: readonly (readonly Point[])[]): Point {
  const o = anneaux[0]![0]!;
  let s = 0, cx = 0, cy = 0;
  for (const A of anneaux) A.forEach((p, i) => {
    const q = A[(i + 1) % A.length]!, a = { x: p.x - o.x, y: p.y - o.y }, b = { x: q.x - o.x, y: q.y - o.y }, k = a.x * b.y - b.x * a.y;
    s += k; cx += (a.x + b.x) * k; cy += (a.y + b.y) * k;
  });
  return Math.abs(s) < 1e-9 ? o : { x: o.x + cx / (3 * s), y: o.y + cy / (3 * s) };
}
function distanceAuBord(p: Point, anneaux: readonly (readonly Point[])[]): number {
  let d = Infinity;
  for (const A of anneaux) for (let i = 0; i < A.length; i++) {
    const a = A[i]!, b = A[(i + 1) % A.length]!, dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const k = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    d = Math.min(d, Math.hypot(p.x - a.x - k * dx, p.y - a.y - k * dy));
  }
  return d;
}
/** les points d'un anneau, et un point tous les « pas » le long de ses côtés (pour comparer deux contours) */
function echantillons(A: readonly Point[], pas: number): Point[] {
  const out: Point[] = [];
  A.forEach((a, i) => { const b = A[(i + 1) % A.length]!, L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / pas)); for (let k = 0; k < n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }) });
  return out;
}

export interface Calage {
  /** l'angle (radians) dont le cadastre tourne pour se poser sur le plan : c'est aussi la direction du nord du plan */
  rotation: number;
  /** du Lambert 93 (mètres) au plan (mm) */
  versPlan: (p: Point) => Point;
  /** l'écart moyen entre la limite tracée et celle du cadastre (mm) */
  ecart: Mm;
}

/** poser le terrain du cadastre (ses parcelles, en mètres Lambert 93) sur la limite de propriété du plan (mm) :
    la rotation qui les superpose le mieux (essais au degré, puis au centième), la translation des centres */
export function caler(limite: readonly Point[], terrain: readonly (readonly Point[])[]): Calage {
  const T = terrain.map(A => A.map(p => ({ x: p.x * 1000, y: p.y * 1000 })));           // en mm, comme le plan
  const cT = centre(T), cP = centre([limite]);
  const pts = echantillons(limite, 1_000), ptsT = T.flatMap(A => echantillons(A, 1_000));
  const tourner = (q: Point, a: number) => ({ x: cP.x + (q.x - cT.x) * Math.cos(a) - (q.y - cT.y) * Math.sin(a), y: cP.y + (q.x - cT.x) * Math.sin(a) + (q.y - cT.y) * Math.cos(a) });
  /* l'écart (symétrique) entre la limite et le terrain tourné de « a » */
  const ecart = (a: number) => {
    const R = T.map(A => A.map(q => tourner(q, a)));
    const d1 = pts.reduce((s, p) => s + distanceAuBord(p, R), 0) / pts.length;
    const d2 = ptsT.reduce((s, q) => s + distanceAuBord(tourner(q, a), [limite]), 0) / ptsT.length;
    return (d1 + d2) / 2;
  };
  let best = 0, e = Infinity;
  for (let k = 0; k < 360; k++) { const a = rad(k), v = ecart(a); if (v < e) { e = v; best = a } }
  for (const pas of [rad(0.25), rad(0.05), rad(0.01)]) for (let k = -4; k <= 4; k++) { const a = best + k * pas, v = ecart(a); if (v < e) { e = v; best = a } }
  const a = ((best % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return { rotation: a, ecart: e, versPlan: (p: Point) => tourner({ x: p.x * 1000, y: p.y * 1000 }, a) };
}

/** le fond cadastral calé, prêt à garder dans la parcelle : les parcelles et le bâti à moins de « rayon » (mm) du terrain */
export function fondCadastral(limite: readonly Point[], lu: CadastreLu, terrain: readonly ParcelleLue[], source: string, date: string, rayon: Mm = 150_000): { cadastre: Cadastre; rotation: number } {
  if (!terrain.length) throw new Error('le terrain n’est pas dans ce fichier : vérifiez la référence cadastrale de la parcelle');
  const c = caler(limite, terrain.flatMap(p => p.anneaux));
  const cP = centre([limite]);
  const pres = (A: readonly Point[]) => A.some(q => Math.hypot(q.x - cP.x, q.y - cP.y) <= rayon);
  const arrondi = (q: Point): Point => ({ x: Math.round(q.x), y: Math.round(q.y) });
  const refsTerrain = new Set(terrain.map(p => p.reference));
  const parcelles = lu.parcelles.flatMap(p => p.anneaux.map(A => ({ reference: p.reference, contour: A.map(c.versPlan).map(arrondi), terrain: refsTerrain.has(p.reference) })))
    .filter(p => pres(p.contour));
  const batiments = lu.batiments.map(A => A.map(c.versPlan).map(arrondi)).filter(pres);
  return { cadastre: { parcelles, batiments, source, date, ecart: Math.round(c.ecart) }, rotation: c.rotation };
}

/** le fond cadastral suit la parcelle quand on l'implante : f, le déplacement rigide de la limite */
export function deplacerCadastre(c: Cadastre, f: (p: Point) => Point): Cadastre {
  return { ...c, parcelles: c.parcelles.map(p => ({ ...p, contour: p.contour.map(f) })), batiments: c.batiments.map(A => A.map(f)) };
}

/** un fond cadastral bien formé (ce que la commande accepte) ; null s'il l'est, sinon la raison */
export function cadastreInvalide(c: unknown): string | null {
  const x = c as Cadastre | null;
  if (!x || typeof x !== 'object' || !Array.isArray(x.parcelles) || !Array.isArray(x.batiments)) return 'fond cadastral invalide';
  if (x.parcelles.length > 3_000 || x.batiments.length > 6_000) return 'fond cadastral trop étendu (3 000 parcelles et 6 000 bâtiments au plus)';
  const ok = (A: unknown) => Array.isArray(A) && A.length >= 3 && A.length <= 2_000 && A.every((q: Point) => q && Number.isFinite(q.x) && Number.isFinite(q.y));
  if (!x.parcelles.every(p => typeof p.reference === 'string' && ok(p.contour)) || !x.batiments.every(ok)) return 'fond cadastral invalide (contours)';
  if (typeof x.source !== 'string' || typeof x.date !== 'string' || x.source.length > 300) return 'fond cadastral invalide (source)';
  return null;
}
