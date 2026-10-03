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

export interface FaceProjetee { points: { u: Mm; z: Mm }[]; profondeur: Mm; matiere: Matiere }
export interface Facade { cote: CoteFacade; faces: FaceProjetee[]; boite: { umin: Mm; umax: Mm; zmin: Mm; zmax: Mm } | null }

/** ce qu'on voit d'une façade : ni les cloisons, ni le mobilier, ni les sols (derrière les murs) */
const CACHES: ReadonlySet<Matiere> = new Set(['cloison', 'sol', 'meuble', 'tissu', 'linge', 'plan_travail', 'sanitaire', 'electromenager', 'inox', 'escalier']);

/** la vue : u (horizontale vue de face), profondeur (croît en s'éloignant), et la direction du regard */
function vue(c: CoteFacade): { u: (p: Point) => number; prof: (p: Point) => number; regard: Point } {
  switch (c) {
    case 'sud': return { u: p => p.x, prof: p => p.y, regard: { x: 0, y: 1 } };
    case 'nord': return { u: p => -p.x, prof: p => -p.y, regard: { x: 0, y: -1 } };
    case 'est': return { u: p => p.y, prof: p => -p.x, regard: { x: -1, y: 0 } };
    case 'ouest': return { u: p => -p.y, prof: p => p.x, regard: { x: 1, y: 0 } };
  }
}

const aireSigneeUZ = (P: { u: number; z: number }[]) => P.reduce((s, a, i) => { const b = P[(i + 1) % P.length]!; return s + a.u * b.z - b.u * a.z }, 0) / 2;

export function facade(m: Maquette, cote: CoteFacade): Facade {
  const v = vue(cote), faces: FaceProjetee[] = [];
  const ajouter = (points: { u: number; z: number }[], profondeur: number, matiere: Matiere) => {
    if (Math.abs(aireSigneeUZ(points)) > 1) faces.push({ points, profondeur, matiere });          // vue de chant : rien à dessiner
  };
  for (const p of m.prismes) {
    if (CACHES.has(p.matiere)) continue;
    for (const anneau of [p.contour, ...(p.trous ?? [])]) anneau.forEach((a, i) => {
      const b = anneau[(i + 1) % anneau.length]!;
      /* un côté vertical : on ne garde que ceux tournés vers l'observateur (ou indécis : le peintre tranchera) */
      ajouter([{ u: v.u(a), z: p.z0 }, { u: v.u(b), z: p.z0 }, { u: v.u(b), z: p.z1 }, { u: v.u(a), z: p.z1 }], (v.prof(a) + v.prof(b)) / 2, p.matiere);
    });
  }
  for (const p of m.plaques) {
    if (CACHES.has(p.matiere)) continue;
    const H = p.dessus, B = H.map(q => ({ x: q.x + p.decalage.x, y: q.y + p.decalage.y, z: q.z + p.decalage.z }));
    const proche = (P: { x: number; y: number }[]) => Math.min(...P.map(q => v.prof(q)));
    ajouter(B.map(q => ({ u: v.u(q), z: q.z })), proche(B) + 1, p.matiere);
    H.forEach((a, i) => {
      const b = H[(i + 1) % H.length]!, a2 = B[i]!, b2 = B[(i + 1) % H.length]!;
      ajouter([{ u: v.u(a), z: a.z }, { u: v.u(b), z: b.z }, { u: v.u(b2), z: b2.z }, { u: v.u(a2), z: a2.z }], Math.min(v.prof(a), v.prof(b)), p.matiere);
    });
    ajouter(H.map(q => ({ u: v.u(q), z: q.z })), proche(H), p.matiere);
  }
  /* du plus loin au plus près ; à profondeur égale, la toiture après les murs */
  faces.sort((a, b) => b.profondeur - a.profondeur);
  let boite: Facade['boite'] = null;
  for (const f of faces) for (const q of f.points) {
    boite = boite ? { umin: Math.min(boite.umin, q.u), umax: Math.max(boite.umax, q.u), zmin: Math.min(boite.zmin, q.z), zmax: Math.max(boite.zmax, q.z) }
      : { umin: q.u, umax: q.u, zmin: q.z, zmax: q.z };
  }
  return { cote, faces, boite };
}
