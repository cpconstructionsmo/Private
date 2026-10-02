/* La cotation automatique : ce qu'un dessinateur trace autour d'un plan
   (chaînes de cotes extérieures : ouvertures, décrochés, hors tout), les
   dimensions des pièces rectangulaires, et la place d'une ouverture dans
   son mur (distances aux murs voisins). Tout se dérive du modèle
   (ADR-0002) : rien n'est enregistré, la cotation suit chaque modification
   et ne peut jamais être fausse. */
import type { Floor, Mm, Opening, Point } from '../model/types';
import { planDuNiveau } from './plan';
import { decalagesFaces, mursDroits, type MurDroit } from './murs';
import type { Anneau } from '../geometry/polygon';
import { ajouter, distance, multiplier, normaleGauche, normaliser, scalaire, soustraire } from '../geometry/vecteur';
import { distancePointSegment } from '../geometry/segment';
import { EPS_COINCIDENCE, EPS_SUR_FACE, FUSION_COTES } from '../geometry/tolerance';

export type Cote4 = 'bas' | 'haut' | 'gauche' | 'droite';

/** une chaîne de cotes le long d'un côté du plan */
export interface ChaineCotes {
  cote: Cote4;
  /** 0 : la plus proche du bâtiment */
  rang: number;
  genre: 'ouvertures' | 'decroches' | 'hors_tout';
  /** les repères, triés : x pour bas et haut, y pour gauche et droite */
  reperes: Mm[];
  /** la coordonnée de la ligne de cote : y pour bas et haut, x pour gauche et droite */
  ligne: Mm;
}

const horizontal = (c: Cote4) => c === 'bas' || c === 'haut';

/** des valeurs triées, les repères trop proches réunis */
function reunir(v: number[]): number[] {
  const s = [...v].sort((a, b) => a - b), r: number[] = [];
  for (const x of s) if (!r.length || x - r[r.length - 1]! > FUSION_COTES) r.push(x);
  return r;
}

/** le côté du plan vers lequel regarde une direction */
function coteDe(d: Point): Cote4 {
  return Math.abs(d.x) >= Math.abs(d.y) ? (d.x > 0 ? 'droite' : 'gauche') : (d.y > 0 ? 'haut' : 'bas');
}

/** la face extérieure d'une baie : la normale qui sort du bâtiment, ou null (mur intérieur, mur isolé) */
function sortie(w: MurDroit, cotes: [string, string]): Point | null {
  const n = normaleGauche(normaliser(soustraire(w.axis.b, w.axis.a)));
  if (cotes[0] === 'extérieur' && cotes[1] !== 'extérieur') return n;
  if (cotes[1] === 'extérieur' && cotes[0] !== 'extérieur') return multiplier(n, -1);
  return null;
}

/** les chaînes de cotes extérieures d'un niveau ; « ecart » : entre deux lignes de cote (mm) */
export function cotationExterieure(f: Floor, ecart: Mm = 700): ChaineCotes[] {
  const plan = planDuNiveau(f);
  const S = plan.maconnerie.flatMap(p => p.contour);
  if (S.length < 3) return [];
  const B = { xmin: Math.min(...S.map(p => p.x)), xmax: Math.max(...S.map(p => p.x)), ymin: Math.min(...S.map(p => p.y)), ymax: Math.max(...S.map(p => p.y)) };
  const murs = new Map(mursDroits(f).map(w => [w.id, w]));
  const parCote: Record<Cote4, number[]> = { bas: [], haut: [], gauche: [], droite: [] };
  for (const b of plan.baies) {
    const w = murs.get(b.mur), o = f.objects[b.id] as Opening | undefined;
    if (!b.exterieure || !w || !o) continue;
    const s = sortie(w, b.cotes);
    if (!s) continue;
    const c = coteDe(s), u = normaliser(soustraire(w.axis.b, w.axis.a));
    for (const k of [-1, 1]) { const p = ajouter(b.centre, multiplier(u, k * o.width / 2)); parCote[c].push(horizontal(c) ? p.x : p.y) }
  }
  const chaines: ChaineCotes[] = [];
  for (const c of ['bas', 'haut', 'gauche', 'droite'] as const) {
    const h = horizontal(c), min = h ? B.xmin : B.ymin, max = h ? B.xmax : B.ymax;
    const bord = c === 'bas' ? B.ymin : c === 'haut' ? B.ymax : c === 'gauche' ? B.xmin : B.xmax;
    const signe = c === 'bas' || c === 'gauche' ? -1 : 1;
    const L: Omit<ChaineCotes, 'rang' | 'ligne'>[] = [];
    if (parCote[c].length) L.push({ cote: c, genre: 'ouvertures', reperes: reunir([min, max, ...parCote[c]]) });
    /* les décrochés : chaque sommet du contour, vu de ce côté */
    const d = reunir(S.map(p => (h ? p.x : p.y)));
    if (d.length > 2) L.push({ cote: c, genre: 'decroches', reperes: d });
    L.push({ cote: c, genre: 'hors_tout', reperes: reunir([min, max]) });
    L.forEach((x, rang) => chaines.push({ ...x, rang, ligne: bord + signe * ecart * (rang + 1) }));
  }
  return chaines;
}

/** largeur et profondeur d'une pièce rectangulaire (null sinon) ; les sommets
    alignés (là où une cloison arrive sur un mur) ne comptent pas */
export function dimensionsPiece(contour: Anneau): { largeur: Mm; profondeur: Mm } | null {
  let P = [...contour];
  for (let change = true; change && P.length > 3;) {
    change = false;
    for (let i = 0; i < P.length; i++) {
      const a = P[(i + P.length - 1) % P.length]!, b = P[i]!, c = P[(i + 1) % P.length]!;
      if (distance(a, c) > EPS_COINCIDENCE && distancePointSegment(b, { a, b: c }) <= EPS_SUR_FACE) { P.splice(i, 1); change = true; break }
    }
  }
  if (P.length !== 4) return null;
  const [a, b, c, d] = P as [Point, Point, Point, Point];
  const egal = (x: number, y: number) => Math.abs(x - y) <= EPS_SUR_FACE;
  /* un parallélogramme aux diagonales égales est un rectangle */
  if (!egal(distance(a, b), distance(c, d)) || !egal(distance(b, c), distance(d, a)) || !egal(distance(a, c), distance(b, d))) return null;
  const l1 = distance(a, b), l2 = distance(b, c);
  return { largeur: Math.max(l1, l2), profondeur: Math.min(l1, l2) };
}

/** la place d'une ouverture dans son mur, mesurée le long d'une face (côté
    pièce) : jusqu'au mur ou à l'ouverture voisins, de chaque côté */
export interface PlaceOuverture {
  ouverture: string;
  /** la face mesurée : décalage depuis l'axe, vers la gauche du mur (mm) */
  face: Mm;
  /** abscisses le long de l'axe (depuis l'origine du mur) : arrêt avant, début, fin, arrêt après */
  arretAvant: Mm; debut: Mm; fin: Mm; arretApres: Mm;
  avant: Mm; apres: Mm;
  /** comment dire « avant » et « après » à l'écran : à gauche / à droite, en bas / en haut */
  libelles: [string, string];
  /** les quatre points sur la face, pour le dessin */
  points: [Point, Point, Point, Point];
  /** vers la pièce (unitaire) : où tracer ces cotes */
  versPiece: Point;
}

export function placeOuverture(f: Floor, id: string): PlaceOuverture | null {
  const o = f.objects[id];
  if (!o || o.type !== 'opening') return null;
  const w = f.objects[o.hostWallId];
  if (!w || w.type !== 'wall' || !('a' in w.axis)) return null;
  const mur = w as MurDroit, plan = planDuNiveau(f);
  const u = normaliser(soustraire(mur.axis.b, mur.axis.a)), n = normaleGauche(u), F = decalagesFaces(mur);
  /* côté pièce : la face qui ne donne pas sur l'extérieur */
  const b = plan.baies.find(x => x.id === id);
  const droite = !!b && b.cotes[0] === 'extérieur' && b.cotes[1] !== 'extérieur';
  const face = droite ? F.droite : F.gauche;
  const surFace = (p: Point) => Math.abs(scalaire(soustraire(p, mur.axis.a), n) - face) <= EPS_SUR_FACE;
  const t = (p: Point) => scalaire(soustraire(p, mur.axis.a), u);
  const propre = plan.murs.find(m => m.id === mur.id)?.contour.filter(surFace).map(t) ?? [];
  const tmin = propre.length ? Math.min(...propre) : 0, tmax = propre.length ? Math.max(...propre) : distance(mur.axis.a, mur.axis.b);
  /* les arrêts : les murs qui aboutissent sur cette face, et les autres ouvertures du mur */
  const arrets = [tmin, tmax];
  for (const m of plan.murs) if (m.id !== mur.id) for (const p of m.contour) if (surFace(p)) { const x = t(p); if (x > tmin && x < tmax) arrets.push(x) }
  for (const x of Object.values(f.objects)) if (x.type === 'opening' && x.id !== id && x.hostWallId === mur.id) arrets.push(x.offset - x.width / 2, x.offset + x.width / 2);
  const debut = o.offset - o.width / 2, fin = o.offset + o.width / 2;
  const arretAvant = Math.max(...arrets.filter(x => x <= debut + EPS_SUR_FACE), tmin);
  const arretApres = Math.min(...arrets.filter(x => x >= fin - EPS_SUR_FACE), tmax);
  const libelles: [string, string] = Math.abs(u.x) >= Math.abs(u.y) ? (u.x > 0 ? ['à gauche', 'à droite'] : ['à droite', 'à gauche']) : (u.y > 0 ? ['en bas', 'en haut'] : ['en haut', 'en bas']);
  const P = (x: Mm) => ajouter(ajouter(mur.axis.a, multiplier(u, x)), multiplier(n, face));
  return { ouverture: id, face, arretAvant, debut, fin, arretApres, avant: debut - arretAvant, apres: arretApres - fin, libelles, points: [P(arretAvant), P(debut), P(fin), P(arretApres)], versPiece: droite ? multiplier(n, -1) : n };
}

/** la position (axe de l'ouverture) qui donne cette distance d'un côté */
export const positionPour = (p: PlaceOuverture, cote: 'avant' | 'apres', valeur: Mm): Mm => {
  const largeur = p.fin - p.debut;
  return cote === 'avant' ? p.arretAvant + valeur + largeur / 2 : p.arretApres - valeur - largeur / 2;
};
