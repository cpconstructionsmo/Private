/* Les décors de façade : un autre parement sur une partie d'un mur de
   façade, sur toute sa hauteur — le décor en enduit imitation pierre autour
   de l'entrée des dossiers du cabinet. Le décor est une donnée du mur
   (Wall.finishZones) ; la 3D, les façades et la notice le lisent.

   Ici, le décor proposé quand on en ajoute un : autour de la porte d'entrée
   si le mur en porte une (1 m de part et d'autre), sinon le tiers du milieu ;
   toujours dans une partie libre du mur (deux décors ne se chevauchent pas).
   Ce n'est qu'un point de départ : les bornes se règlent ensuite. */
import type { Floor, FinishZone, Mm, Opening } from '../model/types';
import type { MurDroit } from './murs';

/** le parement d'un décor ajouté : l'enduit imitation pierre des entrées */
export const PAREMENT_DECOR = 'enduit-imitation-pierre';
/** de part et d'autre de la porte d'entrée (mm) */
const MARGE_ENTREE: Mm = 1_000;
/** un décor proposé fait au moins 30 cm */
const DECOR_MIN: Mm = 300;

/** les parties du mur que ses décors laissent libres, dans l'ordre */
export function partiesLibres(w: MurDroit): { from: Mm; to: Mm }[] {
  const L = Math.hypot(w.axis.b.x - w.axis.a.x, w.axis.b.y - w.axis.a.y);
  const Z = [...(w.finishZones ?? [])].sort((a, b) => a.from - b.from);
  const out: { from: Mm; to: Mm }[] = [];
  let t = 0;
  for (const z of Z) { if (z.from > t) out.push({ from: t, to: Math.min(L, z.from) }); t = Math.max(t, z.to) }
  if (t < L) out.push({ from: t, to: L });
  return out.filter(p => p.to - p.from > 0);
}

/** le décor proposé pour ce mur, ou null s'il n'y a plus la place (30 cm libres d'un seul tenant) */
export function decorParDefaut(f: Floor, w: MurDroit): FinishZone | null {
  const L = Math.hypot(w.axis.b.x - w.axis.a.x, w.axis.b.y - w.axis.a.y);
  const porte = Object.values(f.objects).find((o): o is Opening => o.type === 'opening' && o.hostWallId === w.id && o.kind === 'door');
  const voulu = porte ? { from: porte.offset - porte.width / 2 - MARGE_ENTREE, to: porte.offset + porte.width / 2 + MARGE_ENTREE } : { from: L / 3, to: 2 * L / 3 };
  const libres = partiesLibres(w);
  /* la partie libre qui recouvre le plus ce qu'on voulait */
  const recouvre = libres.map(p => ({ from: Math.max(p.from, voulu.from), to: Math.min(p.to, voulu.to) })).sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
  let z = recouvre && recouvre.to - recouvre.from >= DECOR_MIN ? recouvre : null;
  if (!z) {
    /* sinon, le milieu de la plus grande partie libre */
    const p = [...libres].sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
    if (!p || p.to - p.from < DECOR_MIN) return null;
    const l = Math.min(p.to - p.from, Math.max(1_000, L / 3)), m = (p.from + p.to) / 2;
    z = { from: m - l / 2, to: m + l / 2 };
  }
  return { from: Math.round(Math.max(0, z.from)), to: Math.round(Math.min(L, z.to)), finish: PAREMENT_DECOR, ...(porte ? { label: 'Décoration de l’entrée' } : {}) };
}
