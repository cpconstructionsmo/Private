/* Les traits d'un fond, pour l'aimant : où sont les lignes du plan qu'on
   reprend ? Deux sources, chacune sans rien inventer :

   - un PDF VECTORIEL : ses tracés tels que le dessinateur les a faits. On
     lit la liste des opérations de la page (pdf.js) : chaque segment droit
     d'un tracé peint (trait ou aplat), avec la matrice courante (CTM) et la
     page tournée vers le repère de l'image (points, v vers le bas). Les
     courbes (débattements de portes, arcs) ne donnent que leurs extrémités ;
     les tracés de découpe (non peints) ne comptent pas ;
   - une IMAGE (scan, photo, PDF sans tracés) : ses lignes horizontales et
     verticales, assez longues et assez sombres. Une ligne fine donne son
     axe ; un aplat épais (un mur poché) donne ses deux bords, qui sont les
     faces du mur. Les lignes obliques d'un scan ne sont pas cherchées.

   Les traits sont rendus dans le repère de l'image du fond (building/fond.ts
   les cale ensuite sur le plan). */
import type { Point } from '../model/types';

export type Trait = [Point, Point];

/* ---------- PDF vectoriel ---------- */

/** les codes des opérations pdf.js dont on a besoin (pdfjs.OPS) */
export interface CodesPdf { save: number; restore: number; transform: number; constructPath: number; endPath: number; paintFormXObjectBegin: number; paintFormXObjectEnd: number }
/** les codes de tracé de pdf.js (DrawOPS) : moveTo 0, lineTo 1, curveTo 2, quadraticCurveTo 3, closePath 4 */
const MOVE = 0, LINE = 1, CURVE = 2, QUAD = 3, CLOSE = 4;

/** au plus ce nombre de traits par page (un plan hachuré en a des dizaines de milliers) */
export const MAX_TRAITS = 30_000;
/** un trait plus court (en points PDF, 1/72 de pouce) ne compte pas : bruit de hachures et de textes dessinés */
const TRAIT_MIN_PDF = 1.5;

type Matrice = [number, number, number, number, number, number];
const fois = (m: Matrice, n: Matrice): Matrice => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const appliquer = (m: Matrice, x: number, y: number): Point => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

/** les traits d'une page PDF, dans le repère de l'image (« vue » : la matrice de la page à l'échelle 1, viewport.transform) */
export function traitsDuPdf(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, OPS: CodesPdf, vue: readonly number[]): Trait[] {
  const out: Trait[] = [];
  const pile: Matrice[] = [];
  let ctm: Matrice = [1, 0, 0, 1, 0, 0];
  const V = vue.slice(0, 6) as Matrice;
  for (let i = 0; i < fnArray.length && out.length < MAX_TRAITS; i++) {
    const fn = fnArray[i]!, args = argsArray[i] as unknown[] | null;
    if (fn === OPS.save) pile.push(ctm);
    else if (fn === OPS.restore) ctm = pile.pop() ?? ctm;
    else if (fn === OPS.transform && args) ctm = fois(ctm, args.slice(0, 6) as Matrice);
    else if (fn === OPS.paintFormXObjectBegin && args) { pile.push(ctm); if (Array.isArray(args[0]) && args[0].length === 6) ctm = fois(ctm, args[0] as Matrice) }
    else if (fn === OPS.paintFormXObjectEnd) ctm = pile.pop() ?? ctm;
    else if (fn === OPS.constructPath && args) {
      /* [opération de peinture, [tracé], boîte] : un tracé de découpe seule (endPath) ne se voit pas */
      if (args[0] === OPS.endPath) continue;
      const d = (args[1] as ArrayLike<number>[] | undefined)?.[0];
      if (!d || typeof d.length !== 'number') continue;
      const M = fois(V, ctm);
      let cx = 0, cy = 0, sx = 0, sy = 0;
      const seg = (x0: number, y0: number, x1: number, y1: number) => {
        const a = appliquer(M, x0, y0), b = appliquer(M, x1, y1);
        if (Math.hypot(b.x - a.x, b.y - a.y) >= TRAIT_MIN_PDF) out.push([a, b]);
      };
      for (let k = 0; k < d.length;) {
        const op = d[k++]!;
        if (op === MOVE) { cx = sx = d[k++]!; cy = sy = d[k++]! }
        else if (op === LINE) { const x = d[k++]!, y = d[k++]!; seg(cx, cy, x, y); cx = x; cy = y }
        else if (op === CURVE) { k += 4; cx = d[k++]!; cy = d[k++]! }
        else if (op === QUAD) { k += 2; cx = d[k++]!; cy = d[k++]! }
        else if (op === CLOSE) { seg(cx, cy, sx, sy); cx = sx; cy = sy }
        else break;                                     // un code inconnu : on ne devine pas la suite
      }
    }
  }
  return out;
}

/* ---------- image (scan) ---------- */

export interface OptionsLignes {
  /** sous ce gris (0 noir, 255 blanc), le pixel est un trait */
  seuil?: number;
  /** longueur minimale d'une ligne, en pixels */
  longueurMin?: number;
  /** au-delà de cette épaisseur (pixels), un aplat donne ses deux bords (les faces d'un mur poché) */
  epaisseurAplat?: number;
}

interface Bande { a: number; b: number; d0: number; d1: number }

/** les lignes d'une rangée de pixels (lignes horizontales), ou d'une colonne si l'image est lue transposée */
function lignesDans(l: number, h: number, lire: (x: number, y: number) => number, o: Required<OptionsLignes>): { a: number; b: number; d: number }[] {
  const out: { a: number; b: number; d: number }[] = [];
  let ouvertes: Bande[] = [];
  const fermer = (B: Bande) => {
    const ep = B.d1 - B.d0 + 1;
    if (ep > o.epaisseurAplat) { out.push({ a: B.a, b: B.b, d: B.d0 }, { a: B.a, b: B.b, d: B.d1 + 1 }) }
    else out.push({ a: B.a, b: B.b, d: (B.d0 + B.d1 + 1) / 2 });
  };
  for (let y = 0; y < h; y++) {
    /* les plages sombres assez longues de la rangée */
    const plages: [number, number][] = [];
    let x0 = -1;
    for (let x = 0; x <= l; x++) {
      const sombre = x < l && lire(x, y) < o.seuil;
      if (sombre && x0 < 0) x0 = x;
      else if (!sombre && x0 >= 0) { if (x - x0 >= o.longueurMin) plages.push([x0, x - 1]); x0 = -1 }
    }
    /* chaque plage prolonge une bande de la rangée précédente (mêmes bouts à 3 pixels près), ou en ouvre une */
    const suivantes: Bande[] = [];
    for (const [a, b] of plages) {
      const k = ouvertes.findIndex(B => Math.abs(B.a - a) <= 3 && Math.abs(B.b - b) <= 3);
      if (k >= 0) { const B = ouvertes[k]!; ouvertes.splice(k, 1); suivantes.push({ a: Math.min(B.a, a), b: Math.max(B.b, b), d0: B.d0, d1: y }) }
      else suivantes.push({ a, b, d0: y, d1: y });
    }
    for (const B of ouvertes) fermer(B);
    ouvertes = suivantes;
  }
  for (const B of ouvertes) fermer(B);
  return out;
}

/** les lignes horizontales et verticales d'une image en niveaux de gris (une valeur par pixel, rangée par lignes) */
export function lignesDeLImage(gris: ArrayLike<number>, l: number, h: number, options: OptionsLignes = {}): Trait[] {
  const o: Required<OptionsLignes> = { seuil: options.seuil ?? 140, longueurMin: options.longueurMin ?? Math.max(20, Math.round(Math.max(l, h) / 80)), epaisseurAplat: options.epaisseurAplat ?? 6 };
  const H = lignesDans(l, h, (x, y) => gris[y * l + x]!, o).map(({ a, b, d }): Trait => [{ x: a, y: d }, { x: b + 1, y: d }]);
  const V = lignesDans(h, l, (y, x) => gris[y * l + x]!, o).map(({ a, b, d }): Trait => [{ x: d, y: a }, { x: d, y: b + 1 }]);
  return [...H, ...V].slice(0, MAX_TRAITS);
}
