/* Les couches d'un mur composé, en plan : chaque couche de sa composition
   (enduit, parpaing, isolant, plâtre…) est une bande parallèle à l'axe,
   découpée par le contour du mur (jonctions comprises : à un angle, deux
   murs de même composition se rejoignent couche à couche, en onglet) puis
   par les ouvertures. Rien n'est gardé : tout se déduit du mur et de sa
   composition.

   Le côté extérieur d'un mur de façade est celui qui ne donne sur aucune
   pièce (aucun vide fermé) : la première couche de la composition (l'enduit)
   s'y place, quel que soit le sens dans lequel le mur a été tracé. */
import type { Floor, Mm, Point } from '../model/types';
import { compositionMur, type MatiereCouche } from '../catalogue/murs';
import { intersection } from '../geometry/booleen';
import type { Polygone } from '../geometry/polygon';
import { positionDansAnneau } from '../geometry/predicats';
import { ajouter, distance, multiplier, normaleGauche, normaliser, soustraire, milieu } from '../geometry/vecteur';
import { EPS_COINCIDENCE } from '../geometry/tolerance';
import { decalagesFaces, mursDroits, type MurDroit } from './murs';
import { planDuNiveau } from './plan';

export interface BandeCouche {
  mur: string;
  matiere: MatiereCouche;
  /** la bande, découpée par le contour du mur et les ouvertures */
  polygones: Polygone[];
  /** de quoi dessiner son motif : l'axe du mur, et la bande entre deux décalages (vers la gauche de a → b) */
  axe: { a: Point; b: Point };
  de: Mm;
  a: Mm;
}

/** le côté extérieur d'un mur de façade : à gauche (true) si une pièce est à sa droite, ou s'il ne borde aucune pièce */
export function exterieurAGauche(f: Floor, w: MurDroit): boolean {
  const u = normaliser(soustraire(w.axis.b, w.axis.a)), n = normaleGauche(u), F = decalagesFaces(w), m = milieu(w.axis.a, w.axis.b);
  const Z = planDuNiveau(f).zones;
  const dans = (d: Mm) => Z.some(z => positionDansAnneau(ajouter(m, multiplier(n, d)), z.polygone.contour) === 'dedans');
  return !dans(F.gauche + 50) || dans(F.droite - 50);
}

const cache = new WeakMap<Floor, BandeCouche[]>();
/** les couches de tous les murs composés d'un niveau */
export function couchesDuNiveau(f: Floor): BandeCouche[] {
  const c = cache.get(f);
  if (c) return c;
  const plan = planDuNiveau(f), contours = new Map(plan.murs.map(x => [x.id, x.contour]));
  const out: BandeCouche[] = [];
  for (const w of mursDroits(f)) {
    const k = compositionMur(w.compositionRef), contour = contours.get(w.id);
    if (!k || !contour) continue;
    const total = k.couches.reduce((s, x) => s + x.epaisseur, 0);
    if (Math.abs(total - w.thickness) > EPS_COINCIDENCE) continue;        // une composition qui ne tombe pas juste n'est pas dessinée
    const u = normaliser(soustraire(w.axis.b, w.axis.a)), n = normaleGauche(u), F = decalagesFaces(w);
    /* une bande déborde largement les bouts : c'est le contour (onglets, T) qui la coupe */
    const L = distance(w.axis.a, w.axis.b), ext = 2 * w.thickness + 1_000;
    const a0 = ajouter(w.axis.a, multiplier(u, -ext)), b0 = ajouter(w.axis.a, multiplier(u, L + ext));
    /* de la face extérieure (ou gauche) vers l'autre */
    const gauche = w.role !== 'exterior' || exterieurAGauche(f, w);
    let d = gauche ? F.gauche : F.droite;
    for (const x of k.couches) {
      const d2 = gauche ? d - x.epaisseur : d + x.epaisseur, lo = Math.min(d, d2), hi = Math.max(d, d2);
      const bande: Polygone = { contour: [ajouter(a0, multiplier(n, lo)), ajouter(b0, multiplier(n, lo)), ajouter(b0, multiplier(n, hi)), ajouter(a0, multiplier(n, hi))] };
      const P = intersection(intersection([{ contour }], [bande]), plan.maconnerieOuverte);
      if (P.length) out.push({ mur: w.id, matiere: x.matiere, polygones: P, axe: { a: w.axis.a, b: w.axis.b }, de: lo, a: hi });
      d = d2;
    }
  }
  cache.set(f, out);
  return out;
}
