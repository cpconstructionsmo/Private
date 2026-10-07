/* La coupe : la maquette (vue3d/maquette.ts) tranchée par un plan vertical,
   vue en projection orthogonale — la coupe d'un permis de construire
   (PCMI 3) et des plans d'exécution.

   - Ce que le plan tranche (murs, planchers, marches, couverture) est
     « coupé » : son intersection avec le plan, dessinée pleine (poché).
   - Ce qui est au-delà du plan se voit en élévation, comme une façade
     (vue3d/facades.ts : même projection, même algorithme du peintre),
     limité à ce qui est devant l'observateur ; le mobilier n'y figure pas.

   Le trait est celui tracé à la main (objet « section » : A-A, B-B…) ou,
   s'il n'y en a aucun, placé de lui-même (coupeAutomatique). Le plan de
   coupe prolonge le trait de part en part du bâtiment. La coupe elle-même
   n'est jamais stockée : elle se recalcule à chaque modification. */
import type { Mm, Point, Project, SectionLine } from '../model/types';
import { planDuNiveau } from '../building/plan';
import { mursDroits } from '../building/murs';
import { geometrieEscalier, hauteurAFranchir } from '../building/escalier';
import type { Point3 } from '../building/toiture';
import type { Maquette, Matiere } from './maquette';
import { boiteUZ, projeter, type Facade, type FaceProjetee, type Vue } from './facades';

/** une ligne de coupe en plan : de a à b, regard vers la gauche ou la droite du trait (vecteur unitaire, perpendiculaire) */
export interface LigneDeCoupe { a: Point; b: Point; regard: Point; nom: string }

/** une partie coupée : un polygone dans le plan de coupe (u, z) */
export interface PartieCoupee { points: { u: Mm; z: Mm }[]; matiere: Matiere }

export interface Coupe {
  ligne: LigneDeCoupe;
  /** ce qu'on voit au-delà, du plus loin au plus près */
  vues: FaceProjetee[];
  /** ce que le plan tranche, à dessiner par-dessus */
  coupees: PartieCoupee[];
  boite: Facade['boite'];
}

/** ce qui ne figure pas dans une coupe : le mobilier, et le sol fini (5 mm, confondu avec le plancher) */
const CACHES: ReadonlySet<Matiere> = new Set(['sol', 'meuble', 'tissu', 'linge', 'plan_travail', 'sanitaire', 'electromenager', 'inox', 'peinture', 'amenagement', 'cloture', 'tronc', 'feuillage', 'terrain']);

/** u le long du trait, vers la droite de l'observateur ; profondeur dans le sens du regard */
export function vueDeCoupe(l: LigneDeCoupe): Vue {
  const d = { x: l.regard.y, y: -l.regard.x };
  return { u: p => (p.x - l.a.x) * d.x + (p.y - l.a.y) * d.y, prof: p => (p.x - l.a.x) * l.regard.x + (p.y - l.a.y) * l.regard.y };
}

/** les traversées d'un anneau par le plan (profondeur 0), en u ; un sommet sur le plan compte du côté positif */
function traversees(anneau: readonly Point[], v: Vue): number[] {
  const U: number[] = [];
  anneau.forEach((a, i) => {
    const b = anneau[(i + 1) % anneau.length]!, pa = v.prof(a), pb = v.prof(b);
    if ((pa >= 0) !== (pb >= 0)) { const t = pa / (pa - pb); U.push(v.u(a) + t * (v.u(b) - v.u(a))) }
  });
  return U;
}

/** les traversées d'un polygone plan de l'espace, rangées le long de la droite d'intersection (le dessous suit le même ordre) */
function traversees3(P: readonly Point3[], v: Vue, dir: Point3): { u: number; z: number; t: number }[] {
  const R: { u: number; z: number; t: number }[] = [];
  P.forEach((a, i) => {
    const b = P[(i + 1) % P.length]!, pa = v.prof(a), pb = v.prof(b);
    if ((pa >= 0) === (pb >= 0)) return;
    const k = pa / (pa - pb), q = { x: a.x + k * (b.x - a.x), y: a.y + k * (b.y - a.y), z: a.z + k * (b.z - a.z) };
    R.push({ u: v.u(q), z: q.z, t: q.x * dir.x + q.y * dir.y + q.z * dir.z });
  });
  return R.sort((a, b) => a.t - b.t);
}

/** la normale d'un polygone de l'espace (Newell) */
function normale(P: readonly Point3[]): Point3 {
  const n = { x: 0, y: 0, z: 0 };
  P.forEach((a, i) => {
    const b = P[(i + 1) % P.length]!;
    n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y);
  });
  return n;
}

export function coupe(m: Maquette, ligne: LigneDeCoupe): Coupe {
  const v = vueDeCoupe(ligne), coupees: PartieCoupee[] = [];
  for (const p of m.prismes) {
    if (CACHES.has(p.matiere)) continue;
    /* règle pair-impair : les traversées rangées, prises deux à deux, bordent la matière (trous compris) */
    const U = [p.contour, ...(p.trous ?? [])].flatMap(r => traversees(r, v)).sort((a, b) => a - b);
    for (let i = 0; i + 1 < U.length; i += 2) {
      const u0 = U[i]!, u1 = U[i + 1]!;
      if (u1 - u0 > 0.5) coupees.push({ points: [{ u: u0, z: p.z0 }, { u: u1, z: p.z0 }, { u: u1, z: p.z1 }, { u: u0, z: p.z1 }], matiere: p.matiere });
    }
  }
  for (const p of m.plaques) {
    if (CACHES.has(p.matiere)) continue;
    /* la droite où le plan de la plaque rencontre le plan de coupe : dessus et dessous s'y rangent dans le même ordre */
    const n = normale(p.dessus), c = { x: ligne.regard.x, y: ligne.regard.y, z: 0 };
    const dir = { x: n.y * c.z - n.z * c.y, y: n.z * c.x - n.x * c.z, z: n.x * c.y - n.y * c.x };
    if (Math.hypot(dir.x, dir.y, dir.z) < 1e-9 * Math.hypot(n.x, n.y, n.z)) continue;        // plaque parallèle au plan de coupe
    const H = traversees3(p.dessus, v, dir), B = traversees3(p.dessus.map(q => ({ x: q.x + p.decalage.x, y: q.y + p.decalage.y, z: q.z + p.decalage.z })), v, dir);
    if (H.length !== B.length) continue;
    for (let i = 0; i + 1 < H.length; i += 2) {
      const pts = [H[i]!, H[i + 1]!, B[i + 1]!, B[i]!].map(q => ({ u: q.u, z: q.z }));
      coupees.push({ points: pts, matiere: p.matiere });
    }
  }
  const { faces } = projeter(m, v, CACHES, true);
  return { ligne, vues: faces, coupees, boite: boiteUZ([...faces.flatMap(f => f.points), ...coupees.flatMap(c => c.points)]) };
}

/** la ligne d'un trait tracé à la main : regard à gauche (ou à droite) du trait, de a vers b */
export function ligneDe(s: SectionLine): LigneDeCoupe {
  const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) || 1, u = { x: (s.b.x - s.a.x) / L, y: (s.b.y - s.a.y) / L };
  const k = s.look === 'right' ? -1 : 1;
  return { a: { ...s.a }, b: { ...s.b }, regard: { x: -u.y * k, y: u.x * k }, nom: s.name };
}

/** les traits tracés à la main dans le projet, par nom (A, B…), avec leur identifiant */
export function traitsDeCoupe(projet: Project): (LigneDeCoupe & { id: string; niveau: string })[] {
  return projet.buildings.flatMap(b => b.floors).flatMap(f => Object.values(f.objects).flatMap(o => (o.type === 'section' ? [{ ...ligneDe(o), id: o.id, niveau: f.id }] : [])))
    .sort((x, y) => x.nom.localeCompare(y.nom, 'fr', { numeric: true }));
}

/** les coupes à tirer : les traits tracés, sinon la coupe automatique */
export function lignesDeCoupe(projet: Project): LigneDeCoupe[] {
  const T = traitsDeCoupe(projet);
  if (T.length) return T.map(({ a, b, regard, nom }) => ({ a, b, regard, nom }));
  /* sans trait tracé : la coupe en travers (A), puis celle en long (B), comme les dossiers du cabinet */
  const a = coupeAutomatique(projet), b = coupeAutomatique(projet, true);
  return a ? (b ? [a, b] : [a]) : [];
}

/** marge du trait de coupe au-delà de la maçonnerie, de chaque côté (mm) */
const DEPASSEMENT = 1_500;
/** pas des essais pour écarter le trait d'un mur qu'il longerait (mm) */
const PAS_ESSAI = 300;

/** la ligne de coupe placée d'elle-même : en travers de la plus petite dimension de la maison (elle montre ainsi
    la pente du toit d'une maison en longueur), par l'escalier s'il y en a un, sinon par le milieu ; jamais le long
    d'un mur (elle le trancherait sur toute sa longueur). « enLong » : la seconde coupe (B), dans la longueur.
    null : rien à couper. */
export function coupeAutomatique(projet: Project, enLong = false): LigneDeCoupe | null {
  const P: Point[] = [], niveaux = projet.buildings.flatMap(b => b.floors);
  for (const f of niveaux) for (const p of planDuNiveau(f).maconnerie) P.push(...p.contour);
  if (!P.length) return null;
  const xmin = Math.min(...P.map(p => p.x)), xmax = Math.max(...P.map(p => p.x)), ymin = Math.min(...P.map(p => p.y)), ymax = Math.max(...P.map(p => p.y));
  /* en travers de la plus petite dimension : le trait est parallèle à y si la maison est plus large que profonde */
  const enX = (xmax - xmin >= ymax - ymin) !== enLong;
  const coord = (p: Point) => (enX ? p.x : p.y), lo = enX ? xmin : ymin, hi = enX ? xmax : ymax;
  let c = (lo + hi) / 2;
  for (const f of niveaux) for (const o of Object.values(f.objects)) {
    if (o.type !== 'stair') continue;
    const E = geometrieEscalier(o, hauteurAFranchir(projet, f)).emprise.map(coord);
    c = (Math.min(...E) + Math.max(...E)) / 2;
    break;
  }
  /* les murs parallèles au trait : leur bande (épaisseur + 10 cm) est à éviter */
  const interdits: [number, number][] = [];
  for (const f of niveaux) for (const w of mursDroits(f)) {
    const a = coord(w.axis.a), b = coord(w.axis.b);
    if (Math.abs(a - b) < 1) interdits.push([a - w.thickness / 2 - 100, a + w.thickness / 2 + 100]);
  }
  const libre = (x: number) => x > lo && x < hi && !interdits.some(([i, j]) => x > i && x < j);
  for (let k = 0; k < 40; k++) {
    const x = c + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * PAS_ESSAI;
    if (libre(x)) { c = x; break }
  }
  const nom = enLong ? 'B' : 'A';
  return enX
    ? { a: { x: c, y: ymin - DEPASSEMENT }, b: { x: c, y: ymax + DEPASSEMENT }, regard: { x: 1, y: 0 }, nom }
    : { a: { x: xmin - DEPASSEMENT, y: c }, b: { x: xmax + DEPASSEMENT, y: c }, regard: { x: 0, y: 1 }, nom };
}
