/* Polygones : aire et périmètre exacts, en millimètres.
   Un polygone est une suite de sommets, sans répéter le premier ; un trou
   (une trémie, la cour d'un mur de façade qui fait le tour) se soustrait. */
import type { Mm, Point } from '../model/types';

export type Anneau = readonly Point[];
export interface Polygone { contour: Anneau; trous?: readonly Anneau[] }

/** aire signée (formule du lacet) : positive dans le sens trigonométrique */
export function aireSignee(anneau: Anneau): number {
  let s = 0;
  for (let i = 0, n = anneau.length; i < n; i++) {
    const a = anneau[i]!, b = anneau[(i + 1) % n]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** aire en mm², trous déduits, quel que soit le sens de saisie */
export function aire(p: Polygone): number {
  return Math.abs(aireSignee(p.contour)) - (p.trous ?? []).reduce((t, h) => t + Math.abs(aireSignee(h)), 0);
}

export function perimetre(anneau: Anneau): Mm {
  let s = 0;
  for (let i = 0, n = anneau.length; i < n; i++) {
    const a = anneau[i]!, b = anneau[(i + 1) % n]!;
    s += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return s;
}

export const mm2EnM2 = (v: number): number => v / 1e6;

export const rectangle = (x: Mm, y: Mm, l: Mm, h: Mm): Anneau =>
  [{ x, y }, { x: x + l, y }, { x: x + l, y: y + h }, { x, y: y + h }];
