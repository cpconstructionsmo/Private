/* Opérations booléennes sur des polygones avec trous : union, différence,
   intersection. Elles passent par Clipper2 en ENTIERS (1 unité = 0,01 mm,
   ADR-0002) : pas de flottants dans les intersections, donc pas de
   polygones « presque fermés » ni de micro-trous selon l'ordre des calculs.

   Le résultat est une liste de polygones (contour dans le sens
   trigonométrique, trous dans le sens horaire), reconstruite depuis
   l'arbre de Clipper (un trou appartient à son contour, une île dans un
   trou est un nouveau polygone). */
import { booleanOp, booleanOpWithPolyTree, ClipType, EndType, FillRule, inflatePaths, JoinType, PolyTree64, type Path64, type Paths64, type PolyPath64 } from 'clipper2-ts';
import type { Point } from '../model/types';
import { ECHELLE_ENTIERS, JEU_SOUDURE } from './tolerance';
import { aireSignee, type Anneau, type Polygone } from './polygon';

const versEntiers = (a: Anneau): Path64 => a.map(p => ({ x: Math.round(p.x * ECHELLE_ENTIERS), y: Math.round(p.y * ECHELLE_ENTIERS) }));
const versMm = (a: Path64): Point[] => a.map(p => ({ x: Number(p.x) / ECHELLE_ENTIERS, y: Number(p.y) / ECHELLE_ENTIERS }));

/** sens normalisé : contour trigonométrique, trou horaire */
const sens = (a: Point[], trigo: boolean): Point[] => ((aireSignee(a) > 0) === trigo ? a : a.reverse());

function depuisArbre(arbre: PolyTree64): Polygone[] {
  const out: Polygone[] = [];
  const visiter = (n: PolyPath64): void => {
    for (let i = 0; i < n.count; i++) {
      const c = n.child(i);
      if (!c.polygon) continue;
      const trous: Point[][] = [];
      for (let k = 0; k < c.count; k++) {
        const h = c.child(k);
        if (h.polygon) trous.push(sens(versMm(h.polygon), false));
        visiter(h);                                    // une île dans le trou : un nouveau polygone
      }
      out.push(trous.length ? { contour: sens(versMm(c.polygon), true), trous } : { contour: sens(versMm(c.polygon), true) });
    }
  };
  visiter(arbre);
  return out;
}

function operation(type: ClipType, sujet: readonly Polygone[], outil: readonly Polygone[]): Polygone[] {
  const arbre = new PolyTree64();
  const s = unionInterne(sujet), o = outil.length ? unionInterne(outil) : null;
  booleanOpWithPolyTree(type, s, o, arbre, FillRule.NonZero);
  return depuisArbre(arbre);
}

/* un groupe de polygones avec trous → chemins orientés sans ambiguïté
   (contours positifs, trous négatifs), que la règle NonZero lit justement */
function unionInterne(polys: readonly Polygone[]): Paths64 {
  return polys.flatMap(p => [sens(p.contour.map(q => ({ ...q })), true), ...(p.trous ?? []).map(h => sens(h.map(q => ({ ...q })), false))].map(versEntiers));
}

export const union = (polys: readonly Polygone[], autres: readonly Polygone[] = []): Polygone[] => operation(ClipType.Union, [...polys, ...autres], []);
export const difference = (a: readonly Polygone[], b: readonly Polygone[]): Polygone[] => operation(ClipType.Difference, a, b);
export const intersection = (a: readonly Polygone[], b: readonly Polygone[]): Polygone[] => operation(ClipType.Intersection, a, b);

/** l'union « soudée » : chaque polygone est dilaté du jeu, l'ensemble uni,
    puis rétracté du même jeu (fermeture). Les jours plus fins que deux fois
    le jeu disparaissent ; les angles restent vifs (jonctions en onglet), et
    une surface ne bouge que de l'arrondi à la grille. Sert à la maçonnerie,
    où des murs qui se touchent doivent faire un seul massif. */
export function unionSoudee(polys: readonly Polygone[], jeu: number = JEU_SOUDURE): Polygone[] {
  if (!polys.length) return [];
  const d = jeu * ECHELLE_ENTIERS;
  const dilates = inflatePaths(unionInterne(polys), d, JoinType.Miter, EndType.Polygon, 4);
  const unis = booleanOp(ClipType.Union, dilates, null, FillRule.NonZero);
  const retractes = inflatePaths(unis, -d, JoinType.Miter, EndType.Polygon, 4);
  const arbre = new PolyTree64();
  booleanOpWithPolyTree(ClipType.Union, retractes, null, arbre, FillRule.NonZero);
  return depuisArbre(arbre);
}
