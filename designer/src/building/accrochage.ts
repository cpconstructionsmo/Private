/* L'accrochage : où tombe vraiment le curseur.

   Autour du curseur (un rayon en mm, qui vient des pixels et du zoom), on
   cherche dans l'ordre :
     1. une extrémité d'axe de mur ;
     2. une intersection de deux axes ;
     3. un milieu d'axe ;
     4. le pied de la perpendiculaire depuis le point de départ du tracé ;
     3 bis. un angle du FOND (bout ou croisement de ses traits) ;
     5. un point sur une face ou sur un axe (le plus proche des deux) ;
     5 bis. un point sur un trait du fond (l'aimant du plan qu'on reprend) ;
     6. l'alignement horizontal ou vertical avec le point de départ ;
     7. la grille.
   Les murs passent avant le fond : on referme sur ce qu'on a déjà tracé.
   Dans une même catégorie, le plus proche gagne. Alt (option « desactive »)
   rend le point tel quel. Les points et segments candidats sont rangés une
   fois pour toutes dans des index spatiaux : une recherche ne lit que le
   voisinage du curseur. */
import type { Floor, Mm, Point } from '../model/types';
import { IndexSpatial, boiteAutour, type Boite } from '../geometry/index-spatial';
import { intersectionSegments, projeterSurDroite, projeterSurSegment, type Segment } from '../geometry/segment';
import { distance, milieu } from '../geometry/vecteur';
import { contoursMurs, mursDroits } from './murs';

/** « equerre » : le tracé d'un mur aimanté à angle droit (posé par l'outil, voir building/equerre.ts) */
export type GenreAccroche = 'extremite' | 'intersection' | 'milieu' | 'perpendiculaire' | 'face' | 'axe' | 'coin_fond' | 'trait_fond' | 'alignement' | 'grille' | 'equerre' | 'libre';

export interface Accroche {
  point: Point;
  genre: GenreAccroche;
  /** le mur concerné, s'il y en a un */
  objet?: string;
  /** pour l'alignement, la perpendiculaire et l'équerre : la ligne de rappel à dessiner */
  guide?: Segment;
  /** pour une face ou un axe : le segment sur lequel le point glisse */
  support?: Segment;
}

export interface OptionsAccrochage {
  /** distance de capture, en mm (pixels ÷ zoom) */
  rayon: Mm;
  /** Alt enfoncée : aucun accrochage */
  desactive?: boolean;
  /** pas de la grille (mm) ; absent : pas de grille */
  grille?: Mm;
  /** le point de départ du tracé en cours (perpendiculaire, alignement) */
  depuis?: Point;
  /** les genres coupés par l'utilisateur */
  sans?: readonly GenreAccroche[];
  /** l'aimant des fonds calés du niveau (leurs traits, en mm sur le plan) */
  fonds?: readonly AimantFond[];
}

const ORDRE: readonly GenreAccroche[] = ['extremite', 'intersection', 'coin_fond', 'milieu', 'perpendiculaire', 'face', 'axe', 'trait_fond', 'alignement', 'grille'];

interface PointCandidat { point: Point; genre: 'extremite' | 'intersection' | 'milieu'; objet: string }
interface SegmentCandidat { seg: Segment; genre: 'face' | 'axe'; objet: string }

const boiteSeg = (s: Segment): Boite => ({ xmin: Math.min(s.a.x, s.b.x), ymin: Math.min(s.a.y, s.b.y), xmax: Math.max(s.a.x, s.b.x), ymax: Math.max(s.a.y, s.b.y) });

export class Accrochage {
  private readonly points: IndexSpatial<PointCandidat>;
  private readonly segments: IndexSpatial<SegmentCandidat>;

  constructor(f: Floor) {
    const M = mursDroits(f);
    const P: PointCandidat[] = [];
    const S: SegmentCandidat[] = [];
    for (const w of M) {
      P.push({ point: w.axis.a, genre: 'extremite', objet: w.id }, { point: w.axis.b, genre: 'extremite', objet: w.id },
        { point: milieu(w.axis.a, w.axis.b), genre: 'milieu', objet: w.id });
      S.push({ seg: w.axis, genre: 'axe', objet: w.id });
    }
    /* faces : les côtés longs du contour (après jonctions) — voir contoursMurs */
    for (const c of contoursMurs(M)) {
      const k = c.contour;
      S.push({ seg: { a: k[0]!, b: k[1]! }, genre: 'face', objet: c.id }, { seg: { a: k[2]!, b: k[3]! }, genre: 'face', objet: c.id });
    }
    /* intersections d'axes (hors extrémités communes, déjà proposées) */
    const axes = new IndexSpatial(M.map(w => ({ boite: boiteSeg(w.axis), valeur: w })));
    for (const w of M) for (const v of axes.chercher(boiteSeg(w.axis))) {
      if (v.id <= w.id) continue;
      const x = intersectionSegments(w.axis, v.axis);
      if (x.type !== 'point') continue;
      const auBout = [w.axis.a, w.axis.b].some(e => distance(e, x.point) < 1) && [v.axis.a, v.axis.b].some(e => distance(e, x.point) < 1);
      if (!auBout) P.push({ point: x.point, genre: 'intersection', objet: w.id });
    }
    this.points = new IndexSpatial(P.map(c => ({ boite: { xmin: c.point.x, ymin: c.point.y, xmax: c.point.x, ymax: c.point.y }, valeur: c })));
    this.segments = new IndexSpatial(S.map(c => ({ boite: boiteSeg(c.seg), valeur: c })));
  }

  get nombre(): number { return this.points.taille + this.segments.taille }

  chercher(curseur: Point, o: OptionsAccrochage): Accroche {
    if (o.desactive) return { point: { ...curseur }, genre: 'libre' };
    const actif = (g: GenreAccroche) => !o.sans?.includes(g);
    const r = o.rayon, zone = boiteAutour(curseur.x, curseur.y, r);
    const trouves: (Accroche & { d: number })[] = [];
    const proposer = (a: Accroche) => {
      const d = distance(a.point, curseur);
      if (d <= r && actif(a.genre)) trouves.push({ ...a, d });
    };

    for (const c of this.points.chercher(zone)) proposer({ point: c.point, genre: c.genre, objet: c.objet });
    const segs = this.segments.chercher(zone);
    for (const c of segs) proposer({ point: projeterSurSegment(curseur, c.seg).point, genre: c.genre, objet: c.objet, support: c.seg });
    if (o.depuis) {
      const D = o.depuis;
      for (const c of segs) {
        const { point, t } = projeterSurDroite(D, c.seg);
        if (t >= 0 && t <= 1 && distance(point, D) > r) proposer({ point, genre: 'perpendiculaire', objet: c.objet, guide: { a: D, b: point } });
      }
      /* alignement horizontal ou vertical avec le départ */
      if (Math.abs(curseur.y - D.y) <= r) proposer({ point: { x: curseur.x, y: D.y }, genre: 'alignement', guide: { a: D, b: { x: curseur.x, y: D.y } } });
      if (Math.abs(curseur.x - D.x) <= r) proposer({ point: { x: D.x, y: curseur.y }, genre: 'alignement', guide: { a: D, b: { x: D.x, y: curseur.y } } });
    }
    /* l'aimant du fond : ses angles, puis ses traits (et la perpendiculaire depuis le départ, sur un trait) */
    for (const F of o.fonds ?? []) {
      for (const q of F.points.chercher(zone)) proposer({ point: q, genre: 'coin_fond' });
      for (const t of F.traits.chercher(zone)) {
        const sur = projeterSurSegment(curseur, t);
        proposer({ point: sur.point, genre: 'trait_fond', support: t });
      }
    }
    if (o.grille && o.grille > 0) {
      const g = o.grille;
      proposer({ point: { x: Math.round(curseur.x / g) * g, y: Math.round(curseur.y / g) * g }, genre: 'grille' });
    }

    if (!trouves.length) return { point: { ...curseur }, genre: 'libre' };
    /* face et axe : une même catégorie (le plus proche) */
    const rang = (g: GenreAccroche) => (g === 'axe' ? ORDRE.indexOf('face') : ORDRE.indexOf(g));
    trouves.sort((a, b) => rang(a.genre) - rang(b.genre) || a.d - b.d);
    const { d: _d, ...meilleur } = trouves[0]!;
    return meilleur;
  }
}

const cache = new WeakMap<Floor, Accrochage>();
/** l'accrochage d'un niveau (gardé tant que le niveau n'a pas changé) */
export function accrochageDuNiveau(f: Floor): Accrochage {
  let a = cache.get(f);
  if (!a) { a = new Accrochage(f); cache.set(f, a) }
  return a;
}

/** l'aimant d'un fond : ses traits ramenés sur le plan (mm), leurs bouts et leurs croisements, rangés pour une
    recherche autour du curseur. Construit une fois par fond calé (il suit le calage : un nouveau calage, un nouvel aimant). */
export class AimantFond {
  readonly traits: IndexSpatial<Segment>;
  readonly points: IndexSpatial<Point>;
  readonly nombre: number;
  constructor(traits: readonly Segment[]) {
    const T = traits.filter(t => distance(t.a, t.b) > 1);
    this.traits = new IndexSpatial(T.map(t => ({ boite: boiteSeg(t), valeur: t })));
    /* les bouts (un même angle dessiné par deux traits n'en fait qu'un, au millimètre) */
    const P: Point[] = [], vus = new Set<string>();
    const garder = (q: Point) => { const k = Math.round(q.x) + ':' + Math.round(q.y); if (!vus.has(k)) { vus.add(k); P.push(q) } };
    for (const t of T) { garder(t.a); garder(t.b) }
    /* les croisements (un T, une croix) hors des bouts communs ; au plus 20 000 pour un plan très chargé */
    for (const t of T) {
      if (P.length > 20_000) break;
      for (const u of this.traits.chercher(boiteSeg(t))) {
        if (u === t) continue;
        const x = intersectionSegments(t, u);
        if (x.type === 'point' && ![t.a, t.b].some(e => distance(e, x.point) < 1)) garder(x.point);
      }
    }
    this.points = new IndexSpatial(P.map(q => ({ boite: { xmin: q.x, ymin: q.y, xmax: q.x, ymax: q.y }, valeur: q })));
    this.nombre = T.length;
  }
}
