/* Le plan de fondations, dérivé des murs et des poteaux du niveau le plus bas
   (ADR-0002 : rien n'est recopié, les semelles suivent chaque mur).

   - Une SEMELLE FILANTE court sous chaque mur porteur : mur extérieur, mur
     intérieur (refend), ou cloison déclarée porteuse. Elle est centrée sous
     le corps du mur (justification comprise) et prolongée d'une
     demi-largeur à chaque bout : les semelles se recouvrent aux angles et
     aux T, leur union est continue. Une cloison non porteuse n'en a pas (elle
     se pose sur le dallage ou le plancher).
     Leur longueur se mesure par la surface de l'union divisée par la
     largeur : autour de la maison, c'est la longueur à l'axe (le carré
     commun d'un angle n'est compté qu'une fois) ; un refend compte de face à
     face des semelles qu'il rejoint (son bout n'est pas coulé deux fois).
   - Une SEMELLE ISOLÉE, carrée, sous chaque poteau.
   - La profondeur d'ASSISE (fond de fouille sous le terrain) est la plus
     grande de la profondeur hors gel et de celle du bon sol (étude G2).
   - Un VIDE SANITAIRE se visite : il faut une trappe, dans une pièce, hors
     des semelles.

   Tout cela relève de l'étude de sol et du bureau d'études : on le dit
   (alertes, statut « be_validation »), on ne l'invente pas. */
import type { Floor, Foundation, Mm, Network, Point, Project } from '../model/types';
import { aire, type Polygone } from '../geometry/polygon';
import { union, intersection } from '../geometry/booleen';
import { ajouter, distance, multiplier, normaleGauche, normaliser, soustraire } from '../geometry/vecteur';
import { positionDansAnneau } from '../geometry/predicats';
import { decalagesFaces, mursDroits, type MurDroit } from './murs';
import { planDuNiveau } from './plan';
import { sectionPoteau } from './structure';
import { segmentsDans } from '../geometry/hachures';

/** une trappe de visite : 60 × 60 cm */
export const COTE_TRAPPE: Mm = 600;

export const SOUBASSEMENTS: Record<Foundation['kind'], string> = { crawl_space: 'Vide sanitaire', slab_on_grade: 'Terre-plein' };

export interface SemelleFilante { mur: string; a: Point; b: Point; contour: Point[] }
export interface SemelleIsolee { poteau: string; centre: Point; contour: Point[] }
export interface Trappe { centre: Point; contour: Point[]; /** dans une pièce et hors des semelles */ ok: boolean }

export interface PlanFondations {
  fondation: Foundation;
  niveau: Floor;
  filantes: SemelleFilante[];
  /** l'union des semelles filantes, telle qu'on la coule */
  emprise: Polygone[];
  /** longueur des semelles filantes (surface de l'union / largeur) */
  longueur: Mm;
  isolees: SemelleIsolee[];
  /** profondeur d'assise : fond de fouille sous le terrain fini */
  assise: Mm;
  /** ce qui fixe l'assise */
  raisonAssise: string;
  trappes: Trappe[];
  alertes: string[];
}

/** un mur porte-t-il une semelle filante ? */
/** un mur à fonder : porteur, et à construire (un mur existant a déjà ses fondations : ADR-0007) */
export const murSurSemelle = (w: MurDroit): boolean => w.phase !== 'existing' && (w.role === 'exterior' || w.role === 'bearing_interior' || (w.role === 'partition' && w.loadBearing.value));

/** la semelle d'un mur : un rectangle centré sous le corps du mur, prolongé d'une demi-largeur à chaque bout */
function semelleSous(w: MurDroit, largeur: Mm): SemelleFilante {
  const u = normaliser(soustraire(w.axis.b, w.axis.a)), n = normaleGauche(u), f = decalagesFaces(w);
  const milieu = multiplier(n, (f.gauche + f.droite) / 2);
  const a = ajouter(w.axis.a, milieu), b = ajouter(w.axis.b, milieu);
  const A = ajouter(a, multiplier(u, -largeur / 2)), B = ajouter(b, multiplier(u, largeur / 2)), d = multiplier(n, largeur / 2);
  return { mur: w.id, a, b, contour: [soustraire(A, d), soustraire(B, d), ajouter(B, d), ajouter(A, d)] };
}

const carre = (c: Point, cote: Mm): Point[] => [{ x: c.x - cote / 2, y: c.y - cote / 2 }, { x: c.x + cote / 2, y: c.y - cote / 2 }, { x: c.x + cote / 2, y: c.y + cote / 2 }, { x: c.x - cote / 2, y: c.y + cote / 2 }];

const enM = (v: Mm) => (v / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m';

/** les fondations du projet et le niveau qui les porte */
export function fondationsDuProjet(p: Project): { fondation: Foundation; niveau: Floor } | null {
  for (const b of p.buildings) for (const f of b.floors) for (const o of Object.values(f.objects)) if (o.type === 'foundation') return { fondation: o, niveau: f };
  return null;
}

/** le corps des murs portés par une semelle (en plan) : le soubassement, sous le plancher, en a l'épaisseur */
export function corpsSurSemelles(f: Floor): Point[][] {
  return mursDroits(f).filter(murSurSemelle).map(w => {
    const n = normaleGauche(normaliser(soustraire(w.axis.b, w.axis.a))), d = decalagesFaces(w);
    const face = (o: Mm, p: Point) => ajouter(p, multiplier(n, o));
    return [face(d.droite, w.axis.a), face(d.droite, w.axis.b), face(d.gauche, w.axis.b), face(d.gauche, w.axis.a)];
  });
}

/** le plan de fondations d'un niveau (null : il n'a pas de fondations) */
export function planFondations(f: Floor): PlanFondations | null {
  const fd = Object.values(f.objects).find((o): o is Foundation => o.type === 'foundation');
  if (!fd) return null;
  const alertes: string[] = [];
  const murs = mursDroits(f).filter(murSurSemelle);
  const filantes = murs.map(w => semelleSous(w, fd.footingWidth));
  const emprise = filantes.length ? union(filantes.map(s => ({ contour: s.contour }))) : [];
  const longueur = emprise.reduce((s, q) => s + aire(q), 0) / fd.footingWidth;
  const etroits = murs.filter(w => w.thickness > fd.footingWidth);
  if (etroits.length) alertes.push('Semelle plus étroite que ' + (etroits.length > 1 ? etroits.length + ' murs' : 'un mur') + ' (' + Math.round(Math.max(...etroits.map(w => w.thickness)) / 10) + ' cm) : à élargir');
  if (!murs.length) alertes.push('Aucun mur porteur sur ce niveau : rien à fonder');

  const isolees: SemelleIsolee[] = Object.values(f.objects).flatMap(o => (o.type === 'column' ? [{ poteau: o.id, centre: { ...o.position }, contour: carre(o.position, fd.padSize) }] : []));
  for (const o of Object.values(f.objects)) if (o.type === 'column' && sectionPoteau(o).some(q => positionDansAnneau(q, carre(o.position, fd.padSize)) === 'dehors'))
    { alertes.push('Une semelle isolée est plus petite que son poteau : à agrandir'); break }

  const bon = fd.bearingDepth;
  const assise = Math.max(fd.frostDepth, bon ?? 0);
  const raisonAssise = bon === undefined ? 'hors gel (' + enM(fd.frostDepth) + ') ; bon sol à lire dans l’étude de sol'
    : bon > fd.frostDepth ? 'bon sol (' + enM(bon) + ', étude de sol) plus bas que le hors gel (' + enM(fd.frostDepth) + ')'
      : 'hors gel (' + enM(fd.frostDepth) + ') ; bon sol à ' + enM(bon);
  if (bon === undefined) alertes.push('Profondeur du bon sol inconnue : la lire dans l’étude de sol (G2) ; assise au hors gel en attendant');

  /* les trappes : dans une pièce (on y accède de l'intérieur), hors des semelles */
  const zones = planDuNiveau(f).zones;
  const trappes: Trappe[] = fd.hatches.map(c => {
    const contour = carre(c, COTE_TRAPPE);
    const dansPiece = zones.some(z => contour.every(q => positionDansAnneau(q, z.polygone.contour) !== 'dehors'));
    const surSemelle = intersection([{ contour }], [...emprise, ...isolees.map(s => ({ contour: s.contour }))]).some(q => aire(q) > 1);
    return { centre: { ...c }, contour, ok: dansPiece && !surSemelle };
  });
  if (fd.kind === 'crawl_space' && !trappes.length) alertes.push('Vide sanitaire sans trappe de visite : en poser une (placard, cellier, dégagement)');
  if (trappes.some(t => !t.ok)) alertes.push('Une trappe de visite est hors des pièces ou sur une semelle : à déplacer');
  if (fd.kind === 'slab_on_grade' && trappes.length) alertes.push('Trappes de visite sans objet sur terre-plein');
  /* sous les semelles isolées : un poteau posé sur une semelle filante n'en a pas besoin, on le signale */
  if (isolees.some(s => intersection([{ contour: s.contour }], emprise).some(q => aire(q) > aire({ contour: s.contour }) / 2)))
    alertes.push('Une semelle isolée recouvre une semelle filante : à vérifier (élargissement local ?)');
  return { fondation: fd, niveau: f, filantes, emprise, longueur, isolees, assise, raisonAssise, trappes, alertes };
}

/** la trappe la plus proche d'un point (pour la retirer), dans un rayon donné */
export function trappeProche(fd: Foundation, q: Point, rayon: Mm): number {
  let k = -1, d = rayon;
  fd.hatches.forEach((c, i) => { const e = distance(c, q); if (e <= d) { d = e; k = i } });
  return k;
}

/** une réservation à prévoir dans les fondations : là où un réseau traverse une semelle (fourreau, passage de gaine) */
export interface Reservation {
  /** « R1 », « R2 »… dans l'ordre du plan */
  repere: string;
  reseau: Network['kind'];
  /** matériau et diamètre du réseau, s'ils sont saisis */
  spec?: string;
  /** le milieu de la traversée, et sa longueur (l'épaisseur traversée, mm) */
  point: Point;
  longueur: Mm;
}

/**
 * Les réservations des fondations : chaque traversée d'une semelle par un réseau tracé (eaux usées, pluviales, eau,
 * électricité, télécom, gaz) — sous un vide sanitaire comme sous un dallage, le réseau passe la semelle dans un
 * fourreau à prévoir au coulage. Le diamètre est celui saisi au réseau ; sinon, à préciser au plan.
 */
export function reservationsFondations(projet: Project, P: PlanFondations): Reservation[] {
  const R: Omit<Reservation, 'repere'>[] = [];
  const reseaux = projet.buildings.flatMap(b => b.floors).flatMap(f => Object.values(f.objects)).filter((o): o is Network => o.type === 'network');
  for (const n of reseaux) for (let i = 0; i + 1 < n.points.length; i++) {
    const a = n.points[i]!, b = n.points[i + 1]!;
    for (const q of P.emprise) for (const [s, t] of segmentsDans(a, b, q)) {
      const longueur = distance(s, t);
      if (longueur < 20) continue;
      R.push({ reseau: n.kind, ...(n.spec?.trim() ? { spec: n.spec.trim() } : {}), point: { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 }, longueur });
    }
  }
  /* numérotées dans l'ordre de lecture du plan : de haut en bas, puis de gauche à droite */
  return R.sort((u, v) => v.point.y - u.point.y || u.point.x - v.point.x).map((r, i) => ({ repere: 'R' + (i + 1), ...r }));
}
