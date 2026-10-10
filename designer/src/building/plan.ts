/* Le plan d'un niveau, tel qu'il se calcule depuis le modèle : contours des
   murs, maçonnerie (union des murs), pièces, ouvertures et métré des baies.

   Les pièces sont les VIDES fermés entre les murs : les trous de l'union
   des contours. Une porte ne réunit pas deux pièces (les ouvertures ne
   coupent pas les murs pour ce calcul). Chaque vide est rattaché à la pièce
   nommée dont le point intérieur (seed) y tombe ; rien n'est deviné :
   - un vide sans pièce nommée est « à nommer » ;
   - une pièce nommée dont le point n'est dans aucun vide est « non fermée » ;
   - deux pièces nommées dans le même vide sont signalées.
   Une cloison fictive (sans matière) coupe un vide en deux pièces — une
   cuisine ouverte sur le séjour — sans rien ajouter à la maçonnerie.

   Le modèle étant immuable, le plan d'un niveau se garde en cache tant que
   ce niveau n'a pas changé (même objet). */
import type { Floor, Mm, Opening, Point, Room } from '../model/types';
import { aire, perimetre, type Anneau, type Polygone } from '../geometry/polygon';
import { unionSoudee, difference } from '../geometry/booleen';
import { positionDansAnneau } from '../geometry/predicats';
import { ajouter, distance, multiplier, normaleGauche, normaliser, soustraire } from '../geometry/vecteur';
import { contoursMurs, decalagesFaces, mursDroits, mursFictifs, ouvertureBatie, type ContourMur, type MurDroit } from './murs';
import { EPAISSEUR_FICTIVE } from '../geometry/tolerance';

export interface Zone {
  /** le vide fermé (intérieur des murs) */
  polygone: Polygone;
  /** surface intérieure, en mm² (entre les faces des murs ; ce n'est pas encore
      une surface réglementaire : voir la Phase 7) */
  aire: number;
  perimetre: Mm;
  /** la pièce nommée qui l'occupe, s'il y en a une */
  piece?: Room;
}

export type Alerte =
  | { genre: 'a_nommer'; zone: number; message: string }
  | { genre: 'non_fermee'; piece: string; message: string }
  | { genre: 'doublon'; zone: number; pieces: string[]; message: string }
  | { genre: 'ouverture_orpheline'; ouverture: string; message: string };

export interface BaieMetree {
  id: string;
  genre: Opening['kind'];
  largeur: Mm; hauteur: Mm; allege: Mm;
  /** surface du tableau (largeur × hauteur), mm² */
  surface: number;
  mur: string;
  /** milieu de l'ouverture, sur l'axe du mur */
  centre: Point;
  /** les pièces de part et d'autre (nom), ou « extérieur » */
  cotes: [string, string];
  exterieure: boolean;
}

export interface PlanNiveau {
  murs: ContourMur[];
  /** la maçonnerie : union des murs (contours et trous) */
  maconnerie: Polygone[];
  /** la maçonnerie avec les ouvertures découpées (pour le dessin) */
  maconnerieOuverte: Polygone[];
  zones: Zone[];
  baies: BaieMetree[];
  alertes: Alerte[];
}

const cache = new WeakMap<Floor, PlanNiveau>();

export function planDuNiveau(f: Floor): PlanNiveau {
  const c = cache.get(f);
  if (c) return c;
  const p = calculer(f);
  cache.set(f, p);
  return p;
}

function calculer(f: Floor): PlanNiveau {
  const M = mursDroits(f);
  const murs = contoursMurs(M);
  /* union soudée : des murs qui se touchent (T sur un mur oblique) font un seul massif */
  const maconnerie = unionSoudee(murs.map(m => ({ contour: m.contour })));
  const alertes: Alerte[] = [];

  /* les vides fermés : les trous de la maçonnerie */
  const vides: Polygone[] = maconnerie.flatMap(p => (p.trous ?? []).map(h => ({ contour: [...h].reverse() })));       // le vide, vu comme une surface
  /* les cloisons fictives : un trait d'épaisseur de calcul, prolongé d'autant à chaque bout pour franchir le vide jusqu'au mur */
  const traits = mursFictifs(f).map(v => {
    const u = normaliser(soustraire(v.axis.b, v.axis.a)), n = normaleGauche(u), e = EPAISSEUR_FICTIVE / 2;
    const a = ajouter(v.axis.a, multiplier(u, -EPAISSEUR_FICTIVE)), b = ajouter(v.axis.b, multiplier(u, EPAISSEUR_FICTIVE));
    return { contour: [ajouter(a, multiplier(n, -e)), ajouter(b, multiplier(n, -e)), ajouter(b, multiplier(n, e)), ajouter(a, multiplier(n, e))] } as Polygone;
  });
  const zones: Zone[] = (traits.length ? difference(vides, traits) : vides).map(polygone => ({ polygone, aire: aire(polygone), perimetre: perimetre(polygone.contour) }));
  const pieces = Object.values(f.objects).filter((o): o is Room => o.type === 'room');
  const dans = new Map<number, Room[]>();
  for (const r of pieces) {
    const k = zones.findIndex(z => positionDansAnneau(r.seed, z.polygone.contour) === 'dedans');
    if (k < 0) { alertes.push({ genre: 'non_fermee', piece: r.id, message: '« ' + r.name + ' » n’est pas une pièce fermée : son point n’est dans aucun espace clos par des murs' }); continue }
    (dans.get(k) ?? dans.set(k, []).get(k)!).push(r);
  }
  zones.forEach((z, k) => {
    const R = dans.get(k) ?? [];
    if (!R.length) alertes.push({ genre: 'a_nommer', zone: k, message: 'Espace clos de ' + (z.aire / 1e6).toFixed(2).replace('.', ',') + ' m² sans nom : pièce à nommer' });
    else {
      z.piece = R[0]!;
      if (R.length > 1) alertes.push({ genre: 'doublon', zone: k, pieces: R.map(r => r.id), message: R.map(r => '« ' + r.name + ' »').join(' et ') + ' sont dans le même espace : une cloison manque, ou une pièce est en trop' });
    }
  });

  /* les ouvertures : leur rectangle dans le mur, et ce qu'elles séparent */
  const parId = new Map<string, MurDroit>(M.map(w => [w.id, w]));
  const nomEn = (p: Point): string | null => {
    const k = zones.findIndex(z => positionDansAnneau(p, z.polygone.contour) === 'dedans');
    return k < 0 ? null : zones[k]!.piece ? zones[k]!.piece!.name : 'espace à nommer';
  };
  const baies: BaieMetree[] = [];
  const decoupes: Anneau[] = [];
  for (const o of Object.values(f.objects)) {
    if (o.type !== 'opening' || !ouvertureBatie(o)) continue;
    /* une baie d'un mur à démolir part avec lui : ce n'est pas une orpheline */
    if (!parId.has(o.hostWallId) && f.objects[o.hostWallId]?.type === 'wall') continue;
    const w = parId.get(o.hostWallId);
    if (!w) { alertes.push({ genre: 'ouverture_orpheline', ouverture: o.id, message: 'Ouverture sans mur porteur sur ce niveau' }); continue }
    const g = geometrieOuverture(w, o);
    decoupes.push(g.rectangle);
    const ga = nomEn(g.cotes[0]), dr = nomEn(g.cotes[1]);
    baies.push({
      id: o.id, genre: o.kind, largeur: o.width, hauteur: o.height, allege: o.sill, surface: o.width * o.height, mur: w.id,
      centre: g.centre, cotes: [ga ?? 'extérieur', dr ?? 'extérieur'], exterieure: !ga || !dr,
    });
  }
  const maconnerieOuverte = decoupes.length ? difference(maconnerie, decoupes.map(r => ({ contour: r }))) : maconnerie;
  return { murs, maconnerie, maconnerieOuverte, zones, baies, alertes };
}

/** le rectangle d'une ouverture dans l'épaisseur de son mur, et deux points
    de part et d'autre (pour savoir ce qu'elle sépare) */
export function geometrieOuverture(w: MurDroit, o: Opening): { centre: Point; rectangle: Anneau; cotes: [Point, Point] } {
  const u = normaliser(soustraire(w.axis.b, w.axis.a)), n = normaleGauche(u);
  const centre = ajouter(w.axis.a, multiplier(u, o.offset));
  const f = decalagesFaces(w);
  /* un peu plus large que le mur, pour que la découpe traverse franchement */
  const marge = 1;
  const a = ajouter(centre, multiplier(u, -o.width / 2)), b = ajouter(centre, multiplier(u, o.width / 2));
  const rectangle = [ajouter(a, multiplier(n, f.droite - marge)), ajouter(b, multiplier(n, f.droite - marge)),
    ajouter(b, multiplier(n, f.gauche + marge)), ajouter(a, multiplier(n, f.gauche + marge))];
  const ecart = 50;          // 5 cm au-delà de chaque face
  return { centre, rectangle, cotes: [ajouter(centre, multiplier(n, f.gauche + ecart)), ajouter(centre, multiplier(n, f.droite - ecart))] };
}

/** la longueur d'un mur droit, d'extrémité à extrémité de son axe */
export const longueurAxe = (w: MurDroit): Mm => distance(w.axis.a, w.axis.b);
