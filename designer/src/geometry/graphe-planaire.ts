/* Les faces d'un graphe planaire : à partir de segments qui se croisent, se
   touchent ou se chevauchent, retrouver les régions fermées qu'ils
   délimitent — c'est ainsi qu'on lit des pièces dans un tracé.

   1. Nœuds : chaque segment est coupé à ses intersections avec les autres ;
      deux points à moins de EPS_COINCIDENCE sont le même sommet.
   2. Les arêtes pendantes (un mur qui ne rejoint rien) ne ferment aucune
      région : elles sont retirées, jusqu'à ce qu'il n'en reste plus.
   3. Demi-arêtes : autour de chaque sommet, les départs sont triés par
      angle ; on parcourt chaque face en tournant au plus près à droite, ce
      qui laisse la face à gauche.
   4. Les cycles d'aire positive sont les faces ; ceux d'aire négative sont
      les bords extérieurs des composantes : chacun devient le trou de la plus
      petite face qui le contient (une île), ou le dehors s'il n'y en a pas.

   Rien n'est deviné : un tracé qui ne ferme pas ne donne pas de face. */
import type { Point } from '../model/types';
import { EPS_COINCIDENCE } from './tolerance';
import { aireSignee } from './polygon';
import { positionDansAnneau } from './predicats';
import { intersectionSegments, type Segment } from './segment';
import { distance } from './vecteur';

export interface Face { contour: Point[]; trous?: Point[][]; aire: number }

/** les sommets, à la tolérance près : une grille de cases de la taille de la tolérance */
class Sommets {
  readonly points: Point[] = [];
  private readonly grille = new Map<string, number[]>();
  constructor(private readonly eps: number) {}
  private cle(i: number, j: number): string { return i + ',' + j }
  indice(p: Point): number {
    const i = Math.floor(p.x / this.eps), j = Math.floor(p.y / this.eps);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      for (const k of this.grille.get(this.cle(i + di, j + dj)) ?? []) if (distance(this.points[k]!, p) <= this.eps) return k;
    }
    const k = this.points.length;
    this.points.push({ x: p.x, y: p.y });
    const c = this.cle(i, j);
    (this.grille.get(c) ?? this.grille.set(c, []).get(c)!).push(k);
    return k;
  }
}

export function facesPlanaires(segments: readonly Segment[], eps: number = EPS_COINCIDENCE): Face[] {
  const S = segments.filter(s => distance(s.a, s.b) > eps);
  /* 1. points de coupe sur chaque segment (paramètre t le long du segment) */
  const coupes: number[][] = S.map(() => [0, 1]);
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
    const x = intersectionSegments(S[i]!, S[j]!, eps);
    if (x.type === 'point') { coupes[i]!.push(x.t); coupes[j]!.push(x.u) }
    else if (x.type === 'chevauchement') {
      for (const p of [x.debut, x.fin]) {
        coupes[i]!.push(parametre(S[i]!, p));
        coupes[j]!.push(parametre(S[j]!, p));
      }
    }
  }
  const V = new Sommets(eps);
  const aretes = new Set<string>();
  const voisins = new Map<number, Set<number>>();
  const lier = (a: number, b: number): void => {
    if (a === b) return;
    const k = a < b ? a + '|' + b : b + '|' + a;
    if (aretes.has(k)) return;
    aretes.add(k);
    (voisins.get(a) ?? voisins.set(a, new Set()).get(a)!).add(b);
    (voisins.get(b) ?? voisins.set(b, new Set()).get(b)!).add(a);
  };
  S.forEach((s, i) => {
    const ts = [...new Set(coupes[i]!.map(t => Math.max(0, Math.min(1, t))))].sort((a, b) => a - b);
    const ids = ts.map(t => V.indice({ x: s.a.x + t * (s.b.x - s.a.x), y: s.a.y + t * (s.b.y - s.a.y) }));
    for (let k = 1; k < ids.length; k++) lier(ids[k - 1]!, ids[k]!);
  });

  /* 2. arêtes pendantes retirées */
  let pendants = [...voisins.keys()].filter(v => voisins.get(v)!.size < 2);
  while (pendants.length) {
    const suivants: number[] = [];
    for (const v of pendants) {
      for (const w of voisins.get(v) ?? []) {
        const n = voisins.get(w)!;
        n.delete(v);
        if (n.size === 1) suivants.push(w);
      }
      voisins.delete(v);
    }
    pendants = suivants.filter(v => voisins.has(v) && voisins.get(v)!.size < 2);
  }

  /* 3. demi-arêtes, triées par angle autour de chaque sommet */
  const P = V.points;
  const depart = new Map<number, number[]>();
  for (const [v, n] of voisins) {
    depart.set(v, [...n].sort((a, b) => angle(P[v]!, P[a]!) - angle(P[v]!, P[b]!)));
  }
  const vu = new Set<string>();
  const positifs: Point[][] = [], negatifs: Point[][] = [];
  for (const [u, sorties] of depart) for (const v0 of sorties) {
    if (vu.has(u + '>' + v0)) continue;
    const cycle: number[] = [];
    let a = u, b = v0, garde = 0;
    while (!vu.has(a + '>' + b) && garde++ < 1e6) {
      vu.add(a + '>' + b);
      cycle.push(a);
      /* au sommet b : le départ juste avant le retour vers a, dans l'ordre
         trigonométrique (on tourne au plus près à droite) */
      const L = depart.get(b)!, k = L.indexOf(a);
      const c = L[(k - 1 + L.length) % L.length]!;
      a = b; b = c;
    }
    const anneau = cycle.map(i => ({ ...P[i]! }));
    const s = aireSignee(anneau);
    if (s > 0) positifs.push(anneau); else if (s < 0) negatifs.push(anneau);
  }

  /* 4. les bords extérieurs deviennent les trous des faces qui les contiennent */
  const faces: { contour: Point[]; trous: Point[][]; aire: number }[] = positifs.map(c => ({ contour: c, trous: [], aire: aireSignee(c) }));
  for (const bord of negatifs) {
    const p = bord[0]!;
    let hote: (typeof faces)[number] | null = null;
    for (const f of faces) {
      if (positionDansAnneau(p, f.contour, eps) !== 'dedans') continue;
      /* une face issue du même bord (le bord lui-même parcouru à l'envers) ne compte pas */
      if (memeCycle(f.contour, bord)) continue;
      if (!hote || f.aire < hote.aire) hote = f;
    }
    if (hote) { hote.trous.push(bord); hote.aire += aireSignee(bord) }
  }
  return faces.map(f => (f.trous.length ? f : { contour: f.contour, aire: f.aire }));
}

const angle = (o: Point, p: Point): number => Math.atan2(p.y - o.y, p.x - o.x);

function parametre(s: Segment, p: Point): number {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
  return ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / (dx * dx + dy * dy);
}

/** deux anneaux qui passent par les mêmes sommets */
function memeCycle(a: readonly Point[], b: readonly Point[]): boolean {
  if (a.length !== b.length) return false;
  const cle = (p: Point): string => p.x + ',' + p.y;
  const A = new Set(a.map(cle));
  return b.every(p => A.has(cle(p)));
}
