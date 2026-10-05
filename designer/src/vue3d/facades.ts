/* Les façades : la maquette (vue3d/maquette.ts) vue de face, de chacun des
   quatre côtés du plan, en projection orthogonale — le dessin des façades
   d'un permis de construire (PCMI 5).

   Méthode : chaque face (côté d'un prisme, pan de toit, chant d'une
   plaque) est projetée sur le plan de la façade (u : horizontale vue de
   face, z : altitude) ; les faces sont ensuite peintes de la plus lointaine
   à la plus proche, remplies, si bien que la plus proche cache les autres
   (algorithme du peintre). Un côté de mur se range par son milieu (l'onglet
   d'un angle passe ainsi derrière la façade) ; un pan de toit par son point
   le plus proche (son débord passe devant le mur qu'il couvre). Rien n'est stocké : comme la 3D, les
   façades se déduisent du plan à chaque fois.

   Orientation : on suppose le haut du plan au nord (à vérifier sur le plan
   de masse) ; « sud » est la façade vue depuis le bas du plan. */
import type { Mm, Point } from '../model/types';
import type { Maquette, Matiere } from './maquette';

export type CoteFacade = 'sud' | 'est' | 'nord' | 'ouest';
export const FACADES: Record<CoteFacade, string> = { sud: 'Façade sud (bas du plan)', est: 'Façade est (droite du plan)', nord: 'Façade nord (haut du plan)', ouest: 'Façade ouest (gauche du plan)' };

export interface FaceProjetee { points: { u: Mm; z: Mm }[]; profondeur: Mm; matiere: Matiere; finition?: string }
export interface Facade { cote: CoteFacade; faces: FaceProjetee[]; boite: { umin: Mm; umax: Mm; zmin: Mm; zmax: Mm } | null }

/** ce qu'on voit d'une façade : ni les cloisons, ni le mobilier, ni les sols (derrière les murs) */
const CACHES: ReadonlySet<Matiere> = new Set(['cloison', 'sol', 'meuble', 'tissu', 'linge', 'plan_travail', 'sanitaire', 'electromenager', 'inox', 'escalier', 'peinture', 'amenagement', 'cloture', 'tronc', 'feuillage']);

/** une vue orthogonale horizontale : u (horizontale vue de face), profondeur (croît en s'éloignant) */
export interface Vue { u: (p: Point) => number; prof: (p: Point) => number }

/** la vue d'un côté du plan */
function vue(c: CoteFacade): Vue {
  switch (c) {
    case 'sud': return { u: p => p.x, prof: p => p.y };
    case 'nord': return { u: p => -p.x, prof: p => -p.y };
    case 'est': return { u: p => p.y, prof: p => -p.x };
    case 'ouest': return { u: p => -p.y, prof: p => p.x };
  }
}

const aireSigneeUZ = (P: { u: number; z: number }[]) => P.reduce((s, a, i) => { const b = P[(i + 1) % P.length]!; return s + a.u * b.z - b.u * a.z }, 0) / 2;

/** un point vu : u, profondeur, altitude */
interface PointVu { u: number; p: number; z: number }

/** la partie d'un polygone au-delà du plan de coupe (profondeur ≥ 0), Sutherland–Hodgman */
function audela(P: PointVu[]): PointVu[] {
  const R: PointVu[] = [];
  P.forEach((a, i) => {
    const b = P[(i + 1) % P.length]!;
    if (a.p >= 0) R.push(a);
    if ((a.p >= 0) !== (b.p >= 0)) { const t = a.p / (a.p - b.p); R.push({ u: a.u + t * (b.u - a.u), p: 0, z: a.z + t * (b.z - a.z) }) }
  });
  return R;
}

/** les faces de la maquette vues selon « v », rangées du plus loin au plus près ; avec « coupe »,
    seulement ce qui est au-delà du plan de profondeur 0 (le reste est derrière l'observateur) */
export function projeter(m: Maquette, v: Vue, caches: ReadonlySet<Matiere>, coupe = false): Pick<Facade, 'faces' | 'boite'> {
  const faces: FaceProjetee[] = [];
  /* rang : un côté de mur par son milieu (l'onglet d'un angle passe ainsi derrière la façade), un pan par son point le plus proche */
  const ajouter = (points: PointVu[], rang: 'milieu' | 'proche' | number, matiere: Matiere, ecart = 0, finition?: string) => {
    const P = coupe ? audela(points) : points;
    if (P.length < 3) return;
    /* un rang chiffré : la profondeur imposée (une plaque posée sur une autre se range juste devant elle) */
    const prof = P.map(q => q.p), profondeur = (typeof rang === 'number' ? rang : rang === 'milieu' ? (Math.min(...prof) + Math.max(...prof)) / 2 : Math.min(...prof)) + ecart;
    const Q = P.map(q => ({ u: q.u, z: q.z }));
    if (Math.abs(aireSigneeUZ(Q)) > 1) faces.push({ points: Q, profondeur, matiere, ...(finition ? { finition } : {}) });          // vue de chant : rien à dessiner
  };
  const vu = (q: Point, z: number): PointVu => ({ u: v.u(q), p: v.prof(q), z });
  for (const p of m.prismes) {
    if (caches.has(p.matiere)) continue;
    for (const anneau of [p.contour, ...(p.trous ?? [])]) anneau.forEach((a, i) => {
      const b = anneau[(i + 1) % anneau.length]!;
      /* un côté vertical : le peintre tranchera entre ceux tournés vers l'observateur et les autres */
      ajouter([vu(a, p.z0), vu(b, p.z0), vu(b, p.z1), vu(a, p.z1)], 'milieu', p.matiere, 0, p.finition);
    });
  }
  for (const p of m.plaques) {
    if (caches.has(p.matiere)) continue;
    const H = p.dessus, B = H.map(q => ({ x: q.x + p.decalage.x, y: q.y + p.decalage.y, z: q.z + p.decalage.z }));
    const rang: 'proche' | number = p.support ? Math.min(...p.support.map(q => v.prof(q))) - 1 : 'proche';
    ajouter(B.map(q => vu(q, q.z)), rang, p.matiere, 1);
    H.forEach((a, i) => {
      const b = H[(i + 1) % H.length]!, a2 = B[i]!, b2 = B[(i + 1) % H.length]!;
      ajouter([vu(a, a.z), vu(b, b.z), vu(b2, b2.z), vu(a2, a2.z)], rang, p.matiere);
    });
    ajouter(H.map(q => vu(q, q.z)), typeof rang === 'number' ? rang - 0.5 : rang, p.matiere);
  }
  /* du plus loin au plus près ; à profondeur égale, la toiture après les murs */
  faces.sort((a, b) => b.profondeur - a.profondeur);
  return { faces, boite: boiteUZ(faces.flatMap(f => f.points)) };
}

/** la boîte (u, z) de points vus */
export function boiteUZ(P: { u: number; z: number }[]): Facade['boite'] {
  let boite: Facade['boite'] = null;
  for (const q of P) {
    boite = boite ? { umin: Math.min(boite.umin, q.u), umax: Math.max(boite.umax, q.u), zmin: Math.min(boite.zmin, q.z), zmax: Math.max(boite.zmax, q.z) }
      : { umin: q.u, umax: q.u, zmin: q.z, zmax: q.z };
  }
  return boite;
}

export function facade(m: Maquette, cote: CoteFacade): Facade {
  return { cote, ...projeter(m, vue(cote), CACHES) };
}
