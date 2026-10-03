/* Viser : qu'y a-t-il sous le curseur ? Dans l'ordre : une extrémité de
   mur (pour la tirer), un trait de coupe, une ouverture, une cote, un mur,
   un meuble, une pièce. */
import type { Floor, Mm, Point } from '../model/types';
import { planDuNiveau, geometrieOuverture } from '../building/plan';
import { mursDroits } from '../building/murs';
import { positionDansAnneau } from '../geometry/predicats';
import { distancePointSegment } from '../geometry/segment';
import { distance } from '../geometry/vecteur';
import { dessinCote } from './cotes';
import { dansMeuble, emprise } from '../building/mobilier';

export type Cible =
  | { genre: 'sommet'; point: Point; murs: string[] }
  | { genre: 'objet'; id: string; type: 'wall' | 'opening' | 'dimension' | 'room' | 'furniture' | 'stair' | 'section' };

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
  /* un meuble (le plus petit d'abord : une chaise sous une table se choisit) */
  const meubles = Object.values(f.objects).filter(o => o.type === 'furniture' && dansMeuble(o, p)).sort((a, b) =>
    (a.type === 'furniture' ? a.width * a.depth : 0) - (b.type === 'furniture' ? b.width * b.depth : 0));
  if (meubles[0]) return { genre: 'objet', id: meubles[0].id, type: 'furniture' };
  for (const e of escaliers) if (positionDansAnneau(p, e.emprise) !== 'dehors') return { genre: 'objet', id: e.id, type: 'stair' };
  for (const w of M) if (distancePointSegment(p, w.axis) <= rayon) return { genre: 'objet', id: w.id, type: 'wall' };
  for (const z of plan.zones) if (z.piece && positionDansAnneau(p, z.polygone.contour) === 'dedans') return { genre: 'objet', id: z.piece.id, type: 'room' };
  return null;
}

/** les objets entièrement dans un cadre (deux coins opposés) : murs (deux extrémités),
    ouvertures (leur milieu), pièces (leur point), meubles (leur encombrement), cotes (leurs deux murs) */
export function dansCadre(f: Floor, p: Point, q: Point): string[] {
  const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x), y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y);
  const dedans = (a: Point) => a.x >= x0 && a.x <= x1 && a.y >= y0 && a.y <= y1;
  const murs = new Set(mursDroits(f).filter(w => dedans(w.axis.a) && dedans(w.axis.b)).map(w => w.id));
  const parId = new Map(mursDroits(f).map(w => [w.id, w]));
  const out: string[] = [...murs];
  for (const o of Object.values(f.objects)) {
    if (o.type === 'opening') { const w = parId.get(o.hostWallId); if (w && dedans(geometrieOuverture(w, o).centre)) out.push(o.id) }
    else if (o.type === 'room' && dedans(o.seed)) out.push(o.id);
    else if (o.type === 'furniture' && emprise(o).every(dedans)) out.push(o.id);
    else if (o.type === 'dimension' && o.refs.every(r => murs.has(r.objectId))) out.push(o.id);
  }
  return out;
}
