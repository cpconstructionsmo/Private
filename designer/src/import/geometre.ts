/* Le plan du géomètre en DXF : ce qu'il faut pour le terrain, rien de plus.

   On y lit :
   - les LIMITES possibles : les polylignes fermées (LWPOLYLINE, POLYLINE),
     avec leur calque et leur surface, pour que l'utilisateur choisisse la
     limite de propriété (le géomètre la range souvent sur un calque
     « LIMITE », « PARCELLE »… : elle est alors proposée d'abord) ;
   - les POINTS COTÉS : les points et blocs (POINT, INSERT) qui portent une
     altitude, puis les sommets des polylignes 3D (courbes de niveau du
     géomètre) ; sur un plan sans 3D, les textes qui ne sont qu'une altitude
     (« 81.37 ») valent point coté à leur point d'insertion.

   Les coordonnées d'un géomètre sont en mètres, souvent en Lambert (des
   centaines de kilomètres) : tout passe en millimètres, puis se ramène près
   de l'origine (le décalage est rendu, pour mémoire). Rien n'est deviné
   au-delà : une limite qu'on ne trouve pas n'est pas inventée. */
import type { Point } from '../model/types';
import { aireSignee, centroide } from '../geometry/polygon';
import { distance } from '../geometry/vecteur';

export interface LimiteGeometre { calque: string; points: Point[]; /** m² */ surface: number }
export interface PlanGeometre {
  calques: string[];
  limites: LimiteGeometre[];
  points: { point: Point; ngf: number }[];
  /** d'où viennent les altitudes : points 3D, sommets 3D, ou textes */
  sourceAltitudes: 'points' | 'polylignes3d' | 'textes' | 'aucune';
  /** ce qui a été retranché aux coordonnées (mm), pour ramener le plan près de l'origine */
  decalage: Point;
  /** l'unité lue (ou supposée) du fichier */
  unite: 'm' | 'cm' | 'mm';
}

/** au plus ce nombre de points cotés gardés, ce que la parcelle accepte (un relevé dense est éclairci régulièrement) */
const MAX_POINTS = 300;
/** deux points cotés plus proches (mm) n'en font qu'un */
const ECART_MIN = 150;

type Groupe = [number, string];

function groupes(texte: string): Groupe[] {
  const L = texte.split(/\r?\n/), G: Groupe[] = [];
  for (let i = 0; i + 1 < L.length; i += 2) {
    const c = Number(L[i]!.trim());
    if (!Number.isFinite(c)) { i -= 1; continue }                 // une ligne vide égarée : on se recale
    G.push([c, L[i + 1]!.replace(/\s+$/, '')]);
  }
  return G;
}

/** une altitude écrite en texte (« 81.37 », « 81,37 », « +81.37 ») ; null sinon */
const altitudeTexte = (t: string): number | null => {
  const m = /^\s*\+?(-?\d{1,4}[.,]\d{1,3})\s*$/.exec(t.replace(/\\P|\{|\}/g, ''));
  return m ? Number(m[1]!.replace(',', '.')) : null;
};

export function lirePlanGeometre(texte: string): PlanGeometre {
  const G = groupes(texte);
  /* l'unité : $INSUNITS (4 mm, 5 cm, 6 m) ; à défaut, des mètres (l'usage des géomètres) */
  let unite: PlanGeometre['unite'] = 'm';
  const iu = G.findIndex(([c, v]) => c === 9 && v.trim() === '$INSUNITS');
  if (iu >= 0) { const u = Number(G[iu + 1]?.[1]); if (u === 4) unite = 'mm'; else if (u === 5) unite = 'cm' }
  const k = unite === 'm' ? 1_000 : unite === 'cm' ? 10 : 1;
  /* les entités de la section ENTITIES */
  const debut = G.findIndex(([c, v], i) => c === 2 && v.trim() === 'ENTITIES' && G[i - 1]?.[0] === 0);
  const E: { type: string; g: Groupe[] }[] = [];
  for (let i = debut < 0 ? 0 : debut + 1; i < G.length; i++) {
    const [c, v] = G[i]!;
    if (c === 0) { if (v.trim() === 'ENDSEC') break; E.push({ type: v.trim(), g: [] }) } else E[E.length - 1]?.g.push([c, v]);
  }
  const val = (g: Groupe[], c: number) => { const x = g.find(q => q[0] === c); return x ? Number(x[1]) : undefined };
  const txt = (g: Groupe[], c: number) => g.find(q => q[0] === c)?.[1]?.trim() ?? '';
  const calques = new Set<string>(), limites: LimiteGeometre[] = [];
  const pts3d: { point: Point; ngf: number }[] = [], som3d: { point: Point; ngf: number }[] = [], textes: { point: Point; ngf: number }[] = [];
  const P = (x: number, y: number): Point => ({ x: x * k, y: y * k });
  const plausible = (z: number) => Number.isFinite(z) && Math.abs(z) > 0.001 && z > -500 && z < 5_000;
  for (let i = 0; i < E.length; i++) {
    const e = E[i]!, calque = txt(e.g, 8) || '0';
    calques.add(calque);
    if (e.type === 'POINT' || e.type === 'INSERT') {
      const x = val(e.g, 10), y = val(e.g, 20), z = val(e.g, 30);
      if (x !== undefined && y !== undefined && z !== undefined && plausible(z)) pts3d.push({ point: P(x, y), ngf: z });
    } else if (e.type === 'TEXT' || e.type === 'MTEXT') {
      const x = val(e.g, 10), y = val(e.g, 20), a = altitudeTexte(txt(e.g, 1));
      if (x !== undefined && y !== undefined && a !== null && plausible(a)) textes.push({ point: P(x, y), ngf: a });
    } else if (e.type === 'LWPOLYLINE') {
      const X = e.g.filter(q => q[0] === 10).map(q => Number(q[1])), Y = e.g.filter(q => q[0] === 20).map(q => Number(q[1]));
      const ferme = ((val(e.g, 70) ?? 0) & 1) === 1, pts = X.map((x, j) => P(x, Y[j] ?? 0));
      const z = val(e.g, 38);
      if (z !== undefined && plausible(z)) for (const q of pts) som3d.push({ point: q, ngf: z });
      if (ferme && pts.length >= 3) limites.push({ calque, points: pts, surface: Math.abs(aireSignee(pts)) / 1e6 });
    } else if (e.type === 'POLYLINE') {
      const ferme = ((val(e.g, 70) ?? 0) & 1) === 1, pts: Point[] = [];
      for (i = i + 1; i < E.length && E[i]!.type === 'VERTEX'; i++) {
        const v = E[i]!.g, x = val(v, 10), y = val(v, 20), z = val(v, 30);
        if (x === undefined || y === undefined) continue;
        pts.push(P(x, y));
        if (z !== undefined && plausible(z)) som3d.push({ point: P(x, y), ngf: z });
      }
      if (ferme && pts.length >= 3) limites.push({ calque, points: pts, surface: Math.abs(aireSignee(pts)) / 1e6 });
    } else if (e.type === 'LINE') {
      for (const [cx, cy, cz] of [[10, 20, 30], [11, 21, 31]] as const) {
        const x = val(e.g, cx), y = val(e.g, cy), z = val(e.g, cz);
        if (x !== undefined && y !== undefined && z !== undefined && plausible(z)) som3d.push({ point: P(x, y), ngf: z });
      }
    }
  }
  /* les altitudes : les points d'abord, puis les sommets 3D, puis les textes */
  const [brut, sourceAltitudes] = pts3d.length ? [pts3d, 'points' as const] : som3d.length ? [som3d, 'polylignes3d' as const] : textes.length ? [textes, 'textes' as const] : [[], 'aucune' as const];
  const garde: { point: Point; ngf: number }[] = [];
  const pas = Math.max(1, Math.ceil(brut.length / MAX_POINTS));
  for (let j = 0; j < brut.length; j += pas) { const q = brut[j]!; if (!garde.some(g => distance(g.point, q.point) < ECART_MIN)) garde.push(q) }
  /* la limite d'abord : les calques au nom de limite, puis la plus grande */
  const nomLimite = /LIM|PARC|CADAS|PROPRI|PERIM/i;
  limites.sort((a, b) => Number(nomLimite.test(b.calque)) - Number(nomLimite.test(a.calque)) || b.surface - a.surface);
  /* le décalage : le centre de la limite proposée (sinon des points), arrondi au mètre, ramené à l'origine */
  const ref = limites[0]?.points ?? garde.map(g => g.point);
  const c0 = ref.length ? centroide(ref.length >= 3 ? ref : [...ref, ref[0]!, ref[0]!]) : { x: 0, y: 0 };
  const decalage = { x: Math.round(c0.x / 1_000) * 1_000, y: Math.round(c0.y / 1_000) * 1_000 };
  const moins = (q: Point): Point => ({ x: Math.round(q.x - decalage.x), y: Math.round(q.y - decalage.y) });
  /* une limite sans sommets doublés (ni le premier répété à la fin) : un côté de moins de 15 cm n'en est pas un */
  const nette = (L: Point[]): Point[] => L.filter((q, j) => distance(q, L[(j + 1) % L.length]!) >= ECART_MIN);
  return {
    calques: [...calques].sort(),
    limites: limites.map(l => ({ ...l, points: nette(l.points.map(moins)) })).filter(l => l.points.length >= 3),
    points: garde.map(g => ({ point: moins(g.point), ngf: Math.round(g.ngf * 1_000) / 1_000 })),
    sourceAltitudes, decalage, unite,
  };
}
