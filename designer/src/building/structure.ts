/* Poteaux et poutres : leur emprise en plan, la même pour le dessin, la
   sélection et la 3D. Un poteau va du sol du niveau à son plafond ; une
   poutre passe sous le plafond, sa retombée en dessous. */
import type { Beam, Column, Point } from '../model/types';

/** la section d'un poteau, en plan (quatre coins, tournés) */
export function sectionPoteau(o: Pick<Column, 'position' | 'width' | 'depth' | 'rotation'>): Point[] {
  const c = Math.cos(o.rotation), s = Math.sin(o.rotation), l = o.width / 2, p = o.depth / 2;
  return [[-l, -p], [l, -p], [l, p], [-l, p]].map(([x, y]) => ({ x: o.position.x + x! * c - y! * s, y: o.position.y + x! * s + y! * c }));
}

/** l'emprise d'une poutre, en plan (un rectangle autour de son axe) */
export function empriseDePoutre(o: Pick<Beam, 'a' | 'b' | 'width'>): Point[] {
  const L = Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y) || 1, nx = (-(o.b.y - o.a.y) / L) * o.width / 2, ny = ((o.b.x - o.a.x) / L) * o.width / 2;
  return [{ x: o.a.x + nx, y: o.a.y + ny }, { x: o.b.x + nx, y: o.b.y + ny }, { x: o.b.x - nx, y: o.b.y - ny }, { x: o.a.x - nx, y: o.a.y - ny }];
}

export const MATIERES_STRUCTURE: Record<Column['material'], string> = { concrete: 'Béton armé', steel: 'Acier', wood: 'Bois' };
