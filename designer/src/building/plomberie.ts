/* Les attentes sanitaires (plan du plombier) : pour chaque appareil posé au
   plan — WC, lavabo, douche, baignoire, évier, lave-linge, lave-vaisselle,
   chauffe-eau —, les arrivées d'eau (froide, chaude) et l'évacuation qu'il
   lui faut, au dos de l'appareil (côté mur, où arrivent les alimentations).
   Tout se déduit du mobilier : déplacer un appareil déplace son attente.
   Les diamètres d'évacuation sont les diamètres usuels, à confirmer par le
   plombier selon les fiches des appareils ; les hauteurs d'attente aussi. */
import type { Floor, Furniture, Point } from '../model/types';
import { modeleMeuble, type Forme } from '../catalogue/mobilier';
import { planDuNiveau } from './plan';
import { positionDansAnneau } from '../geometry/predicats';

/** EF : eau froide ; EC : eau chaude ; EU : eaux usées ; EV : eaux vannes (WC) */
export type ReseauSanitaire = 'EF' | 'EC' | 'EU' | 'EV';

export const NOMS_RESEAUX_SANITAIRES: Record<ReseauSanitaire, { libelle: string; couleur: string }> = {
  EF: { libelle: 'Eau froide', couleur: '#1F5FA8' },
  EC: { libelle: 'Eau chaude', couleur: '#C0392B' },
  EU: { libelle: 'Eaux usées (évacuation)', couleur: '#8B5A2B' },
  EV: { libelle: 'Eaux vannes (WC)', couleur: '#5A3A1A' },
};

/** ce que demande chaque forme d'appareil : ses réseaux et le diamètre usuel de son évacuation */
const BESOINS: Partial<Record<Forme, { reseaux: ReseauSanitaire[]; evacuation: string }>> = {
  wc: { reseaux: ['EF', 'EV'], evacuation: 'Ø 100' },
  lavabo: { reseaux: ['EF', 'EC', 'EU'], evacuation: 'Ø 32 à 40' },
  vasque_double: { reseaux: ['EF', 'EC', 'EU'], evacuation: 'Ø 40' },
  douche: { reseaux: ['EF', 'EC', 'EU'], evacuation: 'Ø 40' },
  baignoire: { reseaux: ['EF', 'EC', 'EU'], evacuation: 'Ø 40' },
  evier: { reseaux: ['EF', 'EC', 'EU'], evacuation: 'Ø 40' },
  lave_vaisselle: { reseaux: ['EF', 'EU'], evacuation: 'Ø 40' },
  lave_linge: { reseaux: ['EF', 'EU'], evacuation: 'Ø 40' },
  chauffe_eau: { reseaux: ['EF', 'EC', 'EU'], evacuation: 'Ø 32 (groupe de sécurité)' },
};
/* un sèche-linge a la forme d'un lave-linge, sans eau à amener */
const SANS_EAU: ReadonlySet<string> = new Set(['seche-linge']);

export interface AttenteSanitaire {
  /** « S1 », « S2 »… dans l'ordre de lecture du plan */
  repere: string;
  meuble: string;
  appareil: string;
  /** la pièce où il est posé (null : hors d'une pièce nommée) */
  piece: string | null;
  /** le dos de l'appareil, au milieu : là où arrivent les attentes */
  point: Point;
  reseaux: ReseauSanitaire[];
  /** le diamètre usuel de l'évacuation (à confirmer) */
  evacuation: string;
}

/** l'appareil sanitaire qu'est un meuble, s'il en est un */
export function besoinSanitaire(m: Furniture): { reseaux: ReseauSanitaire[]; evacuation: string } | null {
  if (SANS_EAU.has(m.catalogRef.id)) return null;
  const forme = modeleMeuble(m.catalogRef.id)?.forme;
  return (forme && BESOINS[forme]) ?? null;
}

/** les attentes sanitaires d'un niveau, repérées S1, S2… de haut en bas, puis de gauche à droite */
export function attentesSanitaires(f: Floor): AttenteSanitaire[] {
  const zones = planDuNiveau(f).zones;
  const A: Omit<AttenteSanitaire, 'repere'>[] = [];
  for (const o of Object.values(f.objects)) {
    if (o.type !== 'furniture') continue;
    const b = besoinSanitaire(o);
    if (!b) continue;
    /* le dos de l'appareil (côté −y de son repère), tourné avec lui */
    const c = Math.cos(o.rotation), s = Math.sin(o.rotation), d = -o.depth / 2;
    const point = { x: o.position.x - s * d, y: o.position.y + c * d };
    const z = zones.find(z => positionDansAnneau(o.position, z.polygone.contour) === 'dedans');
    A.push({ meuble: o.id, appareil: o.catalogRef.label, piece: z?.piece?.name ?? null, point, ...b });
  }
  return A.sort((u, v) => v.point.y - u.point.y || u.point.x - v.point.x).map((a, i) => ({ repere: 'S' + (i + 1), ...a }));
}
