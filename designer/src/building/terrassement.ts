/* Le terrain et son terrassement, calculés depuis le relevé du géomètre
   (les points cotés de la parcelle) : rien n'est gardé, tout se déduit.

   - Les COURBES DE NIVEAU : les triangles du relevé (Delaunay) coupés à
     chaque altitude ronde ; seulement dans le relevé (pas d'extrapolation).
   - Le TALUS d'une plateforme : de chaque point de son bord, une pente
     (horizontal pour 1 vertical) qui descend (remblai) ou monte (déblai)
     jusqu'à rencontrer le terrain naturel ; son pied est la ligne où elle
     le touche.
   - Les CUBATURES : sous la plateforme, le terrain naturel au-dessus de son
     niveau est du déblai, en dessous du remblai (une grille de 25 cm) ; le
     talus ajoute son prisme. Ce sont des ESTIMATIONS de géomètre-métreur
     sur un relevé interpolé, à confirmer par l'entreprise de terrassement
     (foisonnement, décapage, purges non comptés).

   Toutes les altitudes du terrain sont en NGF (m) ; celles des plateformes
   se donnent par rapport au ±0,00 (mm), placé grâce à l'altitude NGF du
   RDC portée par la parcelle. */
import type { Mm, Network, Platform, Plot, Point, Project } from '../model/types';
import { delaunay } from '../geometry/triangulation';
import { aireSignee } from '../geometry/polygon';
import { positionDansAnneau } from '../geometry/predicats';
import { distance } from '../geometry/vecteur';
import { altitudeTerrain, parcelleDuProjet } from './terrain';

export interface CourbeDeNiveau {
  /** son altitude NGF (m) */
  z: number;
  /** une courbe maîtresse (tous les cinq intervalles, quatre à 25 cm) : plus épaisse, cotée */
  maitresse: boolean;
  segments: [Point, Point][];
}

/** les courbes de niveau du relevé, tous les « pas » mètres (0,25, 0,5, 1…) ; vides sans trois points cotés */
export function courbesDeNiveau(t: Plot, pas = 0.5): CourbeDeNiveau[] {
  const A = t.spotHeights ?? [];
  if (A.length < 3 || !(pas > 0)) return [];
  const T = delaunay(A.map(x => x.point));
  if (!T.length) return [];
  const zs = A.map(x => x.ngf), zmin = Math.min(...zs), zmax = Math.max(...zs);
  const out: CourbeDeNiveau[] = [];
  /* au plus 400 courbes : un pas trop fin sur un grand dénivelé ne bloque pas le plan */
  const premier = Math.ceil(zmin / pas - 1e-9), dernier = Math.floor(zmax / pas + 1e-9);
  if (dernier - premier > 400) return [];
  for (let k = premier; k <= dernier; k++) {
    const z = Math.round(k * pas * 1000) / 1000, S: [Point, Point][] = [];
    for (const [i, j, l] of T) {
      const P = [A[i]!, A[j]!, A[l]!], X: Point[] = [];
      for (let e = 0; e < 3; e++) {
        const a = P[e]!, b = P[(e + 1) % 3]!;
        /* une arête coupée strictement d'un côté à l'autre (un sommet pile à z compte d'un seul côté) */
        if ((a.ngf < z) !== (b.ngf < z)) { const s = (z - a.ngf) / (b.ngf - a.ngf); X.push({ x: a.point.x + s * (b.point.x - a.point.x), y: a.point.y + s * (b.point.y - a.point.y) }) }
      }
      if (X.length === 2) S.push([X[0]!, X[1]!]);
    }
    /* une maîtresse toutes les cinq courbes ; toutes les quatre pour une équidistance de 25 cm (tous les mètres) */
    if (S.length) out.push({ z, maitresse: Math.abs(k % (Math.abs(pas - 0.25) < 1e-9 ? 4 : 5)) === 0, segments: S });
  }
  return out;
}

/** l'altitude NGF (m) du niveau fini d'une plateforme ; null sans l'altitude NGF du ±0,00 */
export const altitudePlateforme = (t: Plot, o: Platform): number | null => (t.groundFloorNgf === undefined ? null : t.groundFloorNgf + o.level / 1000);

/** le contour d'une plateforme dans le sens trigonométrique */
const trigo = (P: readonly Point[]): Point[] => (aireSignee(P) >= 0 ? [...P] : [...P].reverse());

/** la plus grande largeur de talus cherchée (mm) */
export const TALUS_MAX = 40_000;

export interface Talus {
  /** de chaque point du bord (en haut du talus) au pied, avec le sens : déblai (le talus monte) ou remblai */
  rayons: { haut: Point; pied: Point; genre: 'deblai' | 'remblai' | 'aucun'; hauteur: Mm }[];
  /** la ligne de pied, fermée */
  pied: Point[];
  /** volumes du talus (m³), estimés */
  deblai: number; remblai: number;
}

/** le talus d'une plateforme jusqu'au terrain naturel ; null sans relevé ou sans altitude du ±0,00 */
/* le plan se repeint à chaque mouvement de souris : le talus d'une plateforme et d'une parcelle (objets
   immuables, remplacés à chaque modification) ne se recalcule pas tant qu'elles ne changent pas */
const talusEnCache = new WeakMap<Platform, { t: Plot; pas: Mm; r: Talus | null }>();
export function talusDe(t: Plot, o: Platform, pas: Mm = 500): Talus | null {
  const k = talusEnCache.get(o);
  if (k && k.t === t && k.pas === pas) return k.r;
  const r = calculerTalus(t, o, pas);
  talusEnCache.set(o, { t, pas, r });
  return r;
}
function calculerTalus(t: Plot, o: Platform, pas: Mm): Talus | null {
  const zp = altitudePlateforme(t, o);
  if (zp === null || !t.spotHeights?.length) return null;
  const C = trigo(o.contour), n = C.length;
  /* les points du bord : les sommets, et un point tous les « pas » le long des côtés ; leur normale extérieure */
  const B: { p: Point; n: Point }[] = [];
  const norm = (a: Point, b: Point) => { const L = distance(a, b) || 1; return { x: (b.y - a.y) / L, y: -(b.x - a.x) / L } };
  for (let i = 0; i < n; i++) {
    const a = C[i]!, b = C[(i + 1) % n]!, avant = C[(i + n - 1) % n]!;
    const n0 = norm(avant, a), n1 = norm(a, b), m = { x: n0.x + n1.x, y: n0.y + n1.y }, lm = Math.hypot(m.x, m.y) || 1;
    B.push({ p: a, n: { x: m.x / lm, y: m.y / lm } });
    const L = distance(a, b), k = Math.max(1, Math.round(L / pas));
    for (let j = 1; j < k; j++) B.push({ p: { x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k }, n: n1 });
  }
  const rayons: Talus['rayons'] = [];
  for (const { p, n: v } of B) {
    const tn = altitudeTerrain(t, p)!, dz = tn - zp;
    if (Math.abs(dz) < 0.005) { rayons.push({ haut: p, pied: p, genre: 'aucun', hauteur: 0 }); continue }
    const s = dz > 0 ? 1 : -1;                                   // déblai : le talus monte vers le terrain
    /* f(d) = TN(p + d·v) − (zp + s·d/pente) : du signe de dz en d = 0 ; on cherche où il s'annule (au plus 40 m) */
    const f = (d: number) => altitudeTerrain(t, { x: p.x + v.x * d, y: p.y + v.y * d })! - (zp + (s * d) / 1000 / o.slope);
    let lo = 0, hi = TALUS_MAX;
    /* le terrain ne rejoint pas la pente avant TALUS_MAX : le talus s'y arrête (il est signalé par sa longueur) */
    if (Math.sign(f(hi)) === Math.sign(dz)) lo = hi;
    else for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (Math.sign(f(mid)) === Math.sign(dz)) lo = mid; else hi = mid }
    const d = (lo + hi) / 2;
    rayons.push({ haut: p, pied: { x: p.x + v.x * d, y: p.y + v.y * d }, genre: dz > 0 ? 'deblai' : 'remblai', hauteur: Math.round((d / o.slope)) });
  }
  /* le prisme du talus : entre deux rayons voisins, la moitié du rectangle base × hauteur, sur leur écartement */
  let deblai = 0, remblai = 0;
  for (let i = 0; i < rayons.length; i++) {
    const r = rayons[i]!, q = rayons[(i + 1) % rayons.length]!;
    const e = distance(r.haut, q.haut) / 1000;
    const s1 = (distance(r.haut, r.pied) / 1000) * (r.hauteur / 1000) / 2, s2 = (distance(q.haut, q.pied) / 1000) * (q.hauteur / 1000) / 2;
    const v = ((s1 + s2) / 2) * e;
    if (r.genre === 'deblai' || q.genre === 'deblai') deblai += r.genre === q.genre ? v : v / 2;
    if (r.genre === 'remblai' || q.genre === 'remblai') remblai += r.genre === q.genre ? v : v / 2;
  }
  return { rayons, pied: rayons.map(r => r.pied), deblai, remblai };
}

export interface Cubature {
  id: string; nom: string;
  /** surface de la plateforme (m²) */
  surface: number;
  /** sous la plateforme (m³) */
  deblai: number; remblai: number;
  /** le talus (m³) */
  talusDeblai: number; talusRemblai: number;
  /** le terrain naturel sous la plateforme : plus bas, plus haut (NGF, m) */
  tnMin: number; tnMax: number;
  niveau: number;
}

/** les cubatures d'une plateforme ; null sans relevé ou sans altitude du ±0,00 */
export function cubature(t: Plot, o: Platform, pas: Mm = 250): Cubature | null {
  const zp = altitudePlateforme(t, o);
  if (zp === null || !t.spotHeights?.length) return null;
  const C = o.contour, xs = C.map(q => q.x), ys = C.map(q => q.y);
  let deblai = 0, remblai = 0, tnMin = Infinity, tnMax = -Infinity;
  const aire = (pas / 1000) ** 2;
  for (let x = Math.min(...xs) + pas / 2; x < Math.max(...xs); x += pas) for (let y = Math.min(...ys) + pas / 2; y < Math.max(...ys); y += pas) {
    const q = { x, y };
    if (positionDansAnneau(q, C) !== 'dedans') continue;
    const tn = altitudeTerrain(t, q)!;
    tnMin = Math.min(tnMin, tn); tnMax = Math.max(tnMax, tn);
    if (tn > zp) deblai += (tn - zp) * aire; else remblai += (zp - tn) * aire;
  }
  const ta = talusDe(t, o);
  return { id: o.id, nom: o.label ?? 'Plateforme', surface: Math.abs(aireSignee(C)) / 1e6, deblai, remblai, talusDeblai: ta?.deblai ?? 0, talusRemblai: ta?.remblai ?? 0,
    tnMin: Number.isFinite(tnMin) ? tnMin : zp, tnMax: Number.isFinite(tnMax) ? tnMax : zp, niveau: zp };
}

/** la longueur d'un réseau (mm) */
export const longueurReseau = (r: Pick<Network, 'points'>): Mm => r.points.reduce((s, q, i) => (i ? s + distance(r.points[i - 1]!, q) : 0), 0);

export const NOMS_RESEAUX: Record<Network['kind'], { libelle: string; code: string; couleur: string; tirets: number[] }> = {
  eu: { libelle: 'Eaux usées', code: 'EU', couleur: '#8B5A2B', tirets: [] },
  ep: { libelle: 'Eaux pluviales', code: 'EP', couleur: '#2E7DBA', tirets: [10, 5] },
  aep: { libelle: 'Eau potable', code: 'AEP', couleur: '#1F5FA8', tirets: [2, 3] },
  elec: { libelle: 'Électricité', code: 'ÉLEC', couleur: '#D23B2E', tirets: [12, 4, 2, 4] },
  telecom: { libelle: 'Télécom', code: 'TEL', couleur: '#2E8B57', tirets: [6, 4] },
  gaz: { libelle: 'Gaz', code: 'GAZ', couleur: '#D9A400', tirets: [14, 4] },
};

export interface MetreTerrain {
  plateformes: Cubature[];
  /** totaux (m³) */
  deblai: number; remblai: number;
  /** longueurs de réseaux (m) par genre */
  reseaux: { genre: Network['kind']; longueur: number }[];
  equipements: { genre: string; nombre: number }[];
  arbres: { existants: number; aPlanter: number; aAbattre: number };
}

/** le métré du terrain : cubatures, longueurs de réseaux, équipements, arbres */
export function metreTerrain(p: Project): MetreTerrain {
  const t = parcelleDuProjet(p)?.plot ?? null;
  const objets = p.buildings.flatMap(b => b.floors).flatMap(f => Object.values(f.objects));
  const plateformes = t ? objets.flatMap(o => (o.type === 'platform' ? [cubature(t, o)].filter((x): x is Cubature => !!x) : [])) : [];
  const R = new Map<Network['kind'], number>(), E = new Map<string, number>();
  for (const o of objets) {
    if (o.type === 'network') R.set(o.kind, (R.get(o.kind) ?? 0) + longueurReseau(o) / 1000);
    if (o.type === 'network_item') E.set(o.kind, (E.get(o.kind) ?? 0) + 1);
  }
  const A = objets.filter(o => o.type === 'tree');
  return {
    plateformes,
    deblai: plateformes.reduce((s, c) => s + c.deblai + c.talusDeblai, 0), remblai: plateformes.reduce((s, c) => s + c.remblai + c.talusRemblai, 0),
    reseaux: [...R].map(([genre, longueur]) => ({ genre, longueur })), equipements: [...E].map(([genre, nombre]) => ({ genre, nombre })),
    arbres: { existants: A.filter(a => a.type === 'tree' && a.state === 'existing').length, aPlanter: A.filter(a => a.type === 'tree' && a.state === 'planted').length, aAbattre: A.filter(a => a.type === 'tree' && a.state === 'felled').length },
  };
}
