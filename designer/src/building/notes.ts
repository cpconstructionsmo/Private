/* Les annotations du plan : la place d'un texte libre et de sa flèche de
   rappel. Le texte garde sa taille à l'écran comme sur le papier (en pixels
   de l'écran, en points de la planche : comme le nom des pièces) ; sa boîte,
   en millimètres du plan, dépend donc du zoom : « mmParPx ». Le dessin
   (ui/dessin.ts), le choix à la souris (ui/selection.ts) et le DXF s'en
   servent tous trois. */
import type { Note, Point } from '../model/types';

/** le corps du texte de chaque taille (pixels à l'écran, points avant réduction sur la planche) */
export const CORPS_NOTE: Record<'small' | 'normal' | 'large', number> = { small: 9.5, normal: 11, large: 14 };
export const corpsNote = (n: Pick<Note, 'size'>): number => CORPS_NOTE[n.size ?? 'normal'];
/** l'interligne, en corps */
export const INTERLIGNE_NOTE = 1.3;
/** la marge autour du texte (pixels) : le fond blanc qui le détache des hachures */
export const MARGE_NOTE = 3;

export const lignesNote = (n: Pick<Note, 'text'>): string[] => n.text.split('\n');

/** la boîte du texte (mm du plan), centrée sur sa position ; la largeur est estimée (un peu plus d'un demi-corps par
    lettre, comme une police sans empattement) : de quoi viser la note, pas de quoi la composer */
export function boiteNote(n: Pick<Note, 'text' | 'size' | 'position'>, mmParPx: number): { xmin: number; ymin: number; xmax: number; ymax: number } {
  const c = corpsNote(n), L = lignesNote(n);
  const l = (Math.max(...L.map(x => x.length)) * c * 0.56 + 2 * MARGE_NOTE) * mmParPx, h = (L.length * c * INTERLIGNE_NOTE + 2 * MARGE_NOTE) * mmParPx;
  return { xmin: n.position.x - l / 2, xmax: n.position.x + l / 2, ymin: n.position.y - h / 2, ymax: n.position.y + h / 2 };
}

/** le départ de la flèche de rappel : le point du bord de la boîte face à la cible (au milieu d'un côté) */
export function departFleche(b: { xmin: number; ymin: number; xmax: number; ymax: number }, cible: Point): Point {
  const cx = (b.xmin + b.xmax) / 2, cy = (b.ymin + b.ymax) / 2, dx = cible.x - cx, dy = cible.y - cy;
  /* le côté que traverse la droite du centre à la cible */
  const lx = (b.xmax - b.xmin) / 2, ly = (b.ymax - b.ymin) / 2;
  if (Math.abs(dx) * ly >= Math.abs(dy) * lx) return { x: dx >= 0 ? b.xmax : b.xmin, y: cy };
  return { x: cx, y: dy >= 0 ? b.ymax : b.ymin };
}
