/* Viser : qu'y a-t-il sous le curseur ? Dans l'ordre : une extrémité de
   mur (pour la tirer), un trait de coupe, la limite de parcelle, une ouverture, une cote, un mur,
   un meuble, une pièce ; puis ce qui est au terrain (équipements, réseaux,
   plateformes, arbres). */
import { fenetresDeToit } from '../building/fenetres-toit';
import type { Floor, Mm, Point } from '../model/types';
import { planDuNiveau, geometrieOuverture } from '../building/plan';
import { mursDroits, mursFictifs } from '../building/murs';
import { positionDansAnneau } from '../geometry/predicats';
import { aireSignee } from '../geometry/polygon';
import { distancePointSegment } from '../geometry/segment';
import { distance } from '../geometry/vecteur';
import { dessinCote } from './cotes';
import { dansMeuble, emprise } from '../building/mobilier';

export type Cible =
  | { genre: 'sommet'; point: Point; murs: string[] }
  | { genre: 'objet'; id: string; type: 'wall' | 'opening' | 'dimension' | 'room' | 'furniture' | 'stair' | 'section' | 'plot' | 'landscape' | 'viewpoint' | 'roof_window' | 'platform' | 'network' | 'network_item' | 'tree' };

/** viser : « escaliers » donne l'emprise des escaliers du niveau (calculée par l'appelant, qui connaît la hauteur à franchir) */
export function viser(f: Floor, p: Point, rayon: Mm, sommets = true, escaliers: { id: string; emprise: Point[] }[] = []): Cible | null {
  const M = mursDroits(f);
  if (sommets) {
    let meilleur: { point: Point; d: number } | null = null;
    for (const w of M) for (const s of [w.axis.a, w.axis.b]) {
      const d = distance(s, p);
      if (d <= rayon && (!meilleur || d < meilleur.d)) meilleur = { point: s, d };
    }
    if (meilleur) {
      const s = meilleur.point;
      return { genre: 'sommet', point: { ...s }, murs: M.filter(w => distance(w.axis.a, s) <= 0.01 || distance(w.axis.b, s) <= 0.01).map(w => w.id) };
    }
  }
  /* un trait de coupe (ceux de ce niveau : il y a été tracé) : à quelques pixels du trait */
  for (const o of Object.values(f.objects)) if (o.type === 'section' && distancePointSegment(p, { a: o.a, b: o.b }) <= rayon / 2) return { genre: 'objet', id: o.id, type: 'section' };
  for (const o of Object.values(f.objects)) if (o.type === 'viewpoint' && distancePointSegment(p, { a: o.a, b: o.b }) <= rayon / 2) return { genre: 'objet', id: o.id, type: 'viewpoint' };
  for (const { o, geo } of fenetresDeToit(f)) if (positionDansAnneau(p, geo.plan) !== 'dehors') return { genre: 'objet', id: o.id, type: 'roof_window' };
  /* la limite de la parcelle : à quelques pixels d'un de ses côtés */
  for (const o of Object.values(f.objects)) if (o.type === 'plot' && o.contour.some((a, i) => distancePointSegment(p, { a, b: o.contour[(i + 1) % o.contour.length]! }) <= rayon / 2)) return { genre: 'objet', id: o.id, type: 'plot' };
  const parId = new Map(M.map(w => [w.id, w]));
  for (const o of Object.values(f.objects)) {
    if (o.type !== 'opening') continue;
    const w = parId.get(o.hostWallId);
    if (w && positionDansAnneau(p, geometrieOuverture(w, o).rectangle) !== 'dehors') return { genre: 'objet', id: o.id, type: 'opening' };
  }
  for (const o of Object.values(f.objects)) {
    if (o.type !== 'dimension') continue;
    const d = dessinCote(f, o);
    if (d && distancePointSegment(p, { a: d.ligne[0], b: d.ligne[1] }) <= rayon) return { genre: 'objet', id: o.id, type: 'dimension' };
  }
  const plan = planDuNiveau(f);
  for (const c of plan.murs) if (positionDansAnneau(p, c.contour) !== 'dehors') return { genre: 'objet', id: c.id, type: 'wall' };
  /* une cloison fictive : près de son trait */
  for (const v of mursFictifs(f)) if (distancePointSegment(p, v.axis) <= rayon / 2) return { genre: 'objet', id: v.id, type: 'wall' };
  /* un meuble (le plus petit d'abord : une chaise sous une table se choisit) */
  const meubles = Object.values(f.objects).filter(o => o.type === 'furniture' && dansMeuble(o, p)).sort((a, b) =>
    (a.type === 'furniture' ? a.width * a.depth : 0) - (b.type === 'furniture' ? b.width * b.depth : 0));
  if (meubles[0]) return { genre: 'objet', id: meubles[0].id, type: 'furniture' };
  for (const e of escaliers) if (positionDansAnneau(p, e.emprise) !== 'dehors') return { genre: 'objet', id: e.id, type: 'stair' };
  /* un aménagement extérieur : près d'une clôture, ou dans une surface (la plus petite d'abord) */
  const L = Object.values(f.objects).flatMap(o => (o.type === 'landscape' ? [o] : []));
  for (const o of L) if (o.kind === 'fence' && o.points.some((a, i) => (i < o.points.length - 1 || o.closed) && distancePointSegment(p, { a, b: o.points[(i + 1) % o.points.length]! }) <= rayon / 2)) return { genre: 'objet', id: o.id, type: 'landscape' };
  const S = L.filter(o => o.kind !== 'fence' && positionDansAnneau(p, o.points) !== 'dehors').sort((a, b) => Math.abs(aireSignee(a.points)) - Math.abs(aireSignee(b.points)));
  if (S[0]) return { genre: 'objet', id: S[0].id, type: 'landscape' };
  /* le terrain : un équipement (son symbole), un réseau (près de son trait), une plateforme (près de son bord), un arbre (sa couronne) */
  const T = Object.values(f.objects);
  for (const o of T) if (o.type === 'network_item' && distance(o.position, p) <= rayon) return { genre: 'objet', id: o.id, type: 'network_item' };
  for (const o of T) if (o.type === 'network' && o.points.some((a, i) => i > 0 && distancePointSegment(p, { a: o.points[i - 1]!, b: a }) <= rayon / 2)) return { genre: 'objet', id: o.id, type: 'network' };
  for (const o of T) if (o.type === 'platform' && o.contour.some((a, i) => distancePointSegment(p, { a, b: o.contour[(i + 1) % o.contour.length]! }) <= rayon / 2)) return { genre: 'objet', id: o.id, type: 'platform' };
  const arbres = T.filter(o => o.type === 'tree' && distance(o.position, p) <= Math.max(rayon, o.diameter / 2)).sort((a, b) => (a.type === 'tree' ? a.diameter : 0) - (b.type === 'tree' ? b.diameter : 0));
  if (arbres[0]) return { genre: 'objet', id: arbres[0].id, type: 'tree' };
  for (const w of M) if (distancePointSegment(p, w.axis) <= rayon) return { genre: 'objet', id: w.id, type: 'wall' };
  for (const z of plan.zones) if (z.piece && positionDansAnneau(p, z.polygone.contour) === 'dedans') return { genre: 'objet', id: z.piece.id, type: 'room' };
  /* enfin, l'intérieur d'une plateforme (la plus petite d'abord) : la maison et ses pièces passent avant */
  const PF = T.flatMap(o => (o.type === 'platform' && positionDansAnneau(p, o.contour) !== 'dehors' ? [o] : [])).sort((a, b) => Math.abs(aireSignee(a.contour)) - Math.abs(aireSignee(b.contour)));
  if (PF[0]) return { genre: 'objet', id: PF[0].id, type: 'platform' };
  return null;
}

/** les objets entièrement dans un cadre (deux coins opposés) : murs (deux extrémités),
    ouvertures (leur milieu), pièces (leur point), meubles (leur encombrement), cotes (leurs deux murs) */
export function dansCadre(f: Floor, p: Point, q: Point): string[] {
  const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x), y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y);
  const dedans = (a: Point) => a.x >= x0 && a.x <= x1 && a.y >= y0 && a.y <= y1;
  const murs = new Set([...mursDroits(f), ...mursFictifs(f)].filter(w => dedans(w.axis.a) && dedans(w.axis.b)).map(w => w.id));
  const parId = new Map(mursDroits(f).map(w => [w.id, w]));
  const out: string[] = [...murs];
  for (const o of Object.values(f.objects)) {
    if (o.type === 'opening') { const w = parId.get(o.hostWallId); if (w && dedans(geometrieOuverture(w, o).centre)) out.push(o.id) }
    else if (o.type === 'room' && dedans(o.seed)) out.push(o.id);
    else if (o.type === 'furniture' && emprise(o).every(dedans)) out.push(o.id);
    else if (o.type === 'dimension' && o.refs.every(r => murs.has(r.objectId))) out.push(o.id);
    else if ((o.type === 'network_item' || o.type === 'tree') && dedans(o.position)) out.push(o.id);
    else if (o.type === 'network' && o.points.every(dedans)) out.push(o.id);
    else if (o.type === 'platform' && o.contour.every(dedans)) out.push(o.id);
  }
  return out;
}
