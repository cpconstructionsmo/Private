/* Les lignes de la toiture et ses eaux pluviales, dérivées des pans calculés
   (building/toiture.ts) : rien n'est recopié, tout suit les murs.

   Chaque bord de pan est classé :
   - sur le contour de l'égout, à l'altitude de l'égout aux deux bouts : un
     ÉGOUT (il porte la gouttière, la génoise) ; sur ce contour mais montant
     (pignon) ou plus haut (haut d'un appentis) : une RIVE ;
   - partagé avec un autre pan et horizontal : un FAÎTAGE ; incliné : un
     ARÊTIER si les deux pans s'écartent vers le bas (le toit y est le plus
     bas des deux plans), une NOUE s'ils se rejoignent en creux.
   Les longueurs se mesurent en vraie grandeur (rampant), sauf l'égout, qui
   est horizontal.

   Les descentes sont posées par l'utilisateur sur l'égout. Leur nombre et
   leur diamètre se dimensionnent selon le DTU 60.11 (surface en plan
   desservie, région) : on donne la surface en plan par descente, on ne la
   juge pas. */
import type { Floor, Mm, Point, Roof } from '../model/types';
import { distancePointSegment, projeterSurDroite } from '../geometry/segment';
import { aire } from '../geometry/polygon';
import { positionDansAnneau } from '../geometry/predicats';
import { distance } from '../geometry/vecteur';
import { toitureDuNiveau, type Point3, type Toiture } from './toiture';

export type GenreLigne = 'egout' | 'rive' | 'faitage' | 'aretier' | 'noue';
export interface LigneToiture { genre: GenreLigne; a: Point3; b: Point3 }

export const NOMS_LIGNES: Record<GenreLigne, string> = { egout: 'Égout', rive: 'Rives', faitage: 'Faîtage', aretier: 'Arêtiers', noue: 'Noues' };
export const FINITIONS_EGOUT: Record<NonNullable<Roof['eavesFinish']>, string> = {
  rafters: 'Chevrons apparents', boxed: 'Caisson (sous-face habillée)', genoise_1: 'Génoise 1 rang', genoise_2: 'Génoise 2 rangs', genoise_3: 'Génoise 3 rangs',
};
export const GOUTTIERES: Record<NonNullable<Roof['gutter']>, string> = { half_round: 'Demi-ronde pendante', ogee: 'Moulurée (havraise)', box: 'Chéneau', none: 'Sans gouttière' };
export const MATIERES_GOUTTIERE: Record<NonNullable<Roof['gutterMaterial']>, string> = { zinc: 'zinc', pvc: 'PVC', aluminium: 'aluminium', copper: 'cuivre' };

const EPS = 2;                                  // mm : un bord « sur » un contour, deux altitudes « égales »

const z = (pl: { a: number; b: number; c: number }, p: Point) => pl.a * p.x + pl.b * p.y + pl.c;
const surAnneau = (p: Point, A: readonly Point[]) => A.some((a, i) => distancePointSegment(p, { a, b: A[(i + 1) % A.length]! }) <= EPS);
const longueur3 = (l: LigneToiture) => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y, l.b.z - l.a.z);

/** les lignes d'une toiture en pente (un toit-terrasse n'en a pas : son acrotère se mesure à part) */
export function lignesDeToiture(t: Toiture): LigneToiture[] {
  const L: LigneToiture[] = [];
  t.pans.forEach((P, i) => P.contour.forEach((a, k) => {
    const b = P.contour[(k + 1) % P.contour.length]!;
    if (distance(a, b) <= EPS) return;
    const A = { ...a, z: z(P.plan, a) }, B = { ...b, z: z(P.plan, b) }, m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (surAnneau(a, t.egout) && surAnneau(b, t.egout) && surAnneau(m, t.egout)) {
      L.push({ genre: Math.abs(A.z - t.egoutZ) <= EPS && Math.abs(B.z - t.egoutZ) <= EPS ? 'egout' : 'rive', a: A, b: B });
      return;
    }
    /* un bord partagé : compté une fois, depuis le pan de plus petit rang */
    const j = t.pans.findIndex((Q, n) => n !== i && surAnneau(m, Q.contour));
    if (j < 0) { L.push({ genre: 'rive', a: A, b: B }); return }
    if (j < i) return;
    if (Math.abs(A.z - B.z) <= EPS) { L.push({ genre: 'faitage', a: A, b: B }); return }
    /* un pas dans le pan i : le toit y est le plan i ; plus bas que le plan voisin : les pans s'écartent (arêtier) */
    const L0 = distance(a, b), n = { x: -(b.y - a.y) / L0 * 50, y: (b.x - a.x) / L0 * 50 };
    const q = positionDansAnneau({ x: m.x + n.x, y: m.y + n.y }, P.contour) === 'dedans' ? { x: m.x + n.x, y: m.y + n.y } : { x: m.x - n.x, y: m.y - n.y };
    L.push({ genre: z(P.plan, q) < z(t.pans[j]!.plan, q) ? 'aretier' : 'noue', a: A, b: B });
  }));
  return L;
}

export interface Descente { point: Point; /** posée sur un égout (pas sur une rive) */ ok: boolean }
export interface EauxPluviales {
  roof: Roof;
  lignes: LigneToiture[];
  /** longueurs par genre (mm) : l'égout en plan, les autres en vraie grandeur */
  longueurs: Record<GenreLigne, Mm>;
  descentes: Descente[];
  /** surface de toiture en plan (mm²) : c'est elle qui se répartit entre les descentes (DTU 60.11) */
  surfacePlan: number;
  alertes: string[];
}

/** les lignes et les eaux pluviales de la toiture d'un niveau (null : pas de toiture en pente calculable) */
export function eauxPluviales(f: Floor): EauxPluviales | null {
  const roof = Object.values(f.objects).find((o): o is Roof => o.type === 'roof');
  const T = toitureDuNiveau(f);
  if (!roof || !T?.ok || roof.kind === 'flat') return null;
  const lignes = T.toitures.flatMap(lignesDeToiture);
  const longueurs = { egout: 0, rive: 0, faitage: 0, aretier: 0, noue: 0 } as Record<GenreLigne, Mm>;
  for (const l of lignes) longueurs[l.genre] += l.genre === 'egout' ? distance(l.a, l.b) : longueur3(l);
  const egouts = lignes.filter(l => l.genre === 'egout');
  const descentes = (roof.downpipes ?? []).map(p => ({ point: { ...p }, ok: egouts.some(l => distancePointSegment(p, l) <= 300) }));
  const surfacePlan = T.toitures.reduce((s, t) => s + t.pans.reduce((u, P) => u + aire({ contour: P.contour }), 0), 0);
  const alertes: string[] = [];
  if (roof.gutter !== 'none') {
    if (!descentes.length) alertes.push('Aucune descente d’eaux pluviales : en placer sur l’égout (nombre et diamètre selon le DTU 60.11)');
    if (descentes.some(d => !d.ok)) alertes.push('Une descente n’est pas sur un égout (rive ou pignon) : à déplacer');
  }
  return { roof, lignes, longueurs, descentes, surfacePlan, alertes };
}

/** le point de l'égout le plus proche (pour poser une descente), dans un rayon donné ; null : trop loin */
export function pointDEgout(E: EauxPluviales, q: Point, rayon: Mm): Point | null {
  let best: Point | null = null, d = rayon;
  for (const l of E.lignes) {
    if (l.genre !== 'egout') continue;
    const { t } = projeterSurDroite(q, l), u = Math.min(1, Math.max(0, t)), p = { x: l.a.x + u * (l.b.x - l.a.x), y: l.a.y + u * (l.b.y - l.a.y) };
    const e = distance(p, q);
    if (e <= d) { d = e; best = { x: Math.round(p.x), y: Math.round(p.y) } }
  }
  return best;
}
