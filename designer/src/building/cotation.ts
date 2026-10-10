/* La cotation automatique : ce qu'un dessinateur trace autour d'un plan
   (chaînes de cotes extérieures : ouvertures, décrochés, hors tout), les
   dimensions des pièces rectangulaires, et la place d'une ouverture dans
   son mur (distances aux murs voisins). Tout se dérive du modèle
   (ADR-0002) : rien n'est enregistré, la cotation suit chaque modification
   et ne peut jamais être fausse. */
import type { Floor, Mm, Opening, Point } from '../model/types';
import { planDuNiveau } from './plan';
import { decalagesFaces, mursDroits, ouvertureBatie, type MurDroit } from './murs';
import type { Anneau } from '../geometry/polygon';
import { ajouter, distance, multiplier, normaleGauche, normaliser, scalaire, soustraire } from '../geometry/vecteur';
import { distancePointSegment } from '../geometry/segment';
import { positionDansAnneau } from '../geometry/predicats';
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

/** les baies des murs extérieurs, vues de leur côté du plan : leurs bords projetés (x pour bas et haut, y pour gauche et
    droite), et la normale qui sort du bâtiment (pour écrire « VR » dehors, coter « 0,90 × 1,35 all. 0,80 ») */
export function baiesExterieures(f: Floor): { ouverture: Opening; cote: Cote4; de: Mm; a: Mm; sortie: Point; centre: Point; epaisseur: Mm }[] {
  const plan = planDuNiveau(f), murs = new Map(mursDroits(f).map(w => [w.id, w]));
  const out: { ouverture: Opening; cote: Cote4; de: Mm; a: Mm; sortie: Point; centre: Point; epaisseur: Mm }[] = [];
  for (const b of plan.baies) {
    const w = murs.get(b.mur), o = f.objects[b.id] as Opening | undefined;
    if (!b.exterieure || !w || !o) continue;
    const s = sortie(w, b.cotes);
    if (!s) continue;
    const c = coteDe(s), u = normaliser(soustraire(w.axis.b, w.axis.a));
    const v = [-1, 1].map(k => { const p = ajouter(b.centre, multiplier(u, k * o.width / 2)); return horizontal(c) ? p.x : p.y });
    out.push({ ouverture: o, cote: c, de: Math.min(...v), a: Math.max(...v), sortie: s, centre: b.centre, epaisseur: w.thickness });
  }
  return out;
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

/** les quatre coins d'une pièce rectangulaire (null sinon) ; les sommets
    alignés (là où une cloison arrive sur un mur) ne comptent pas */
export function rectangleDe(contour: Anneau): [Point, Point, Point, Point] | null {
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
  return [a, b, c, d];
}

/** largeur et profondeur d'une pièce rectangulaire (null sinon) */
export function dimensionsPiece(contour: Anneau): { largeur: Mm; profondeur: Mm } | null {
  const R = rectangleDe(contour);
  if (!R) return null;
  const l1 = distance(R[0], R[1]), l2 = distance(R[1], R[2]);
  return { largeur: Math.max(l1, l2), profondeur: Math.min(l1, l2) };
}

/** sous cette largeur, une pièce n'a pas de cotes intérieures (son étiquette porte ses dimensions) */
export const LARGEUR_COTEE = 2_000;

/** une cote intérieure : d'une face à l'autre d'une pièce, tracée en retrait du mur */
export interface CoteInterieure { piece: string; a: Point; b: Point }

/** les cotes intérieures d'un niveau : la largeur et la profondeur de chaque pièce rectangulaire, entre faces
    (ce qu'on mesure sur place), tracées à « retrait » des murs, le long des deux murs du coin le plus bas à
    gauche (le même coin d'une pièce à l'autre : le plan se lit d'un coup d'œil). Une pièce trop étroite pour
    son retrait n'en a pas. Une pièce en L (ou à décroché) a aussi ses deux cotes, comme aux dossiers du cabinet :
    la plus grande largeur entre faces le long de son axe principal, puis en travers, chacune tracée en retrait
    d'un mur (voir cotesPieceIrreguliere). */
export function cotesInterieures(f: Floor, retrait: Mm = 450): CoteInterieure[] {
  const out: CoteInterieure[] = [];
  for (const z of planDuNiveau(f).zones) {
    const R = rectangleDe(z.polygone.contour);
    if (!R) { out.push(...cotesPieceIrreguliere(z.polygone.contour, z.piece?.name ?? '', retrait)); continue }
    /* le coin d'où partent les deux cotes : le plus bas à gauche */
    const k = R.reduce((m, q, i) => (q.x + q.y < R[m]!.x + R[m]!.y - EPS_COINCIDENCE ? i : m), 0);
    const C = R[k]!, P = R[(k + 1) % 4]!, Q = R[(k + 3) % 4]!;
    const u = normaliser(soustraire(P, C)), v = normaliser(soustraire(Q, C)), lu = distance(C, P), lv = distance(C, Q);
    /* trop étroite pour son retrait, ou moins de 2 m de large (un WC, un cellier) : l'étiquette dit déjà ses dimensions */
    if (lu < Math.max(2 * retrait, LARGEUR_COTEE) || lv < Math.max(2 * retrait, LARGEUR_COTEE)) continue;
    const nom = z.piece?.name ?? '';
    out.push({ piece: nom, a: ajouter(C, multiplier(v, retrait)), b: ajouter(P, multiplier(v, retrait)) });
    out.push({ piece: nom, a: ajouter(C, multiplier(u, retrait)), b: ajouter(Q, multiplier(u, retrait)) });
  }
  return out;
}

/** les deux cotes d'une pièce qui n'est pas un rectangle : dans le repère de son plus long mur (u, et v en travers),
    on mesure l'intérieur sur une ligne tracée à « retrait » d'une face — en bas ou en haut pour la largeur, à gauche
    ou à droite pour la profondeur —, et on garde la plus longue des portées d'un seul tenant (le côté bas ou gauche
    à égalité, comme pour les pièces rectangulaires). */
function cotesPieceIrreguliere(contour: Anneau, nom: string, retrait: Mm): CoteInterieure[] {
  if (contour.length < 4) return [];
  let u = { x: 1, y: 0 }, lmax = 0;
  contour.forEach((a, i) => { const b = contour[(i + 1) % contour.length]!, l = distance(a, b); if (l > lmax + EPS_COINCIDENCE) { lmax = l; u = normaliser(soustraire(b, a)) } });
  const v = normaleGauche(u), out: CoteInterieure[] = [];
  for (const [axe, travers] of [[u, v], [v, u]] as const) {
    const t = contour.map(q => scalaire(q, travers)), tmin = Math.min(...t), tmax = Math.max(...t);
    const a = contour.map(q => scalaire(q, axe)), amin = Math.min(...a), amax = Math.max(...a);
    if (tmax - tmin < 2 * retrait || amax - amin < LARGEUR_COTEE) continue;
    let meilleure: { a: Point; b: Point; l: number } | null = null;
    for (const niveau of [tmin + retrait, tmax - retrait]) {
      /* les traversées de la ligne par le contour, triées le long de l'axe : l'intérieur va d'une traversée à la suivante */
      const X: number[] = [];
      contour.forEach((p, i) => {
        const q = contour[(i + 1) % contour.length]!, sp = scalaire(p, travers) - niveau, sq = scalaire(q, travers) - niveau;
        if ((sp > 0) !== (sq > 0)) X.push(scalaire(p, axe) + (scalaire(q, axe) - scalaire(p, axe)) * sp / (sp - sq));
      });
      X.sort((x, y) => x - y);
      for (let k = 0; k + 1 < X.length; k += 2) {
        const l = X[k + 1]! - X[k]!;
        if (l >= LARGEUR_COTEE && (!meilleure || l > meilleure.l + EPS_COINCIDENCE)) {
          const point = (s: number): Point => ajouter(multiplier(axe, s), multiplier(travers, niveau));
          meilleure = { a: point(X[k]!), b: point(X[k + 1]!), l };
        }
      }
    }
    if (meilleure) out.push({ piece: nom, a: meilleure.a, b: meilleure.b });
  }
  return out;
}

/** la place d'une étiquette (un rectangle de demi-côtés « demi », en mm) dans une pièce : là où on l'a voulue
    (le point de la pièce) si elle n'y couvre rien, sinon le point le plus proche où elle ne couvre rien, toute
    l'étiquette dans la pièce ; dans une pièce trop meublée pour cela, là où elle couvre le moins (la place
    voulue à égalité). Les obstacles (meubles, cotes) sont comparés par leurs boîtes. */
export function placeEtiquette(contour: Anneau, obstacles: readonly (readonly Point[])[], voulue: Point, demi: { l: Mm; h: Mm }): Point {
  return placeEtiquetteCouverte(contour, obstacles, voulue, demi).point;
}
/** la même place, et ce que l'étiquette y couvre encore (mm² ; Infinity si elle ne tient pas dans la pièce) :
    de quoi comparer une étiquette couchée et une étiquette debout */
export function placeEtiquetteCouverte(contour: Anneau, obstacles: readonly (readonly Point[])[], voulue: Point, demi: { l: Mm; h: Mm }): { point: Point; couvre: number } {
  const boites = obstacles.map(o => ({ x0: Math.min(...o.map(q => q.x)), x1: Math.max(...o.map(q => q.x)), y0: Math.min(...o.map(q => q.y)), y1: Math.max(...o.map(q => q.y)) }));
  /* ce que l'étiquette couvre (mm²) ; Infinity si elle sort de la pièce */
  const couvre = (p: Point) => {
    const r = { x0: p.x - demi.l, x1: p.x + demi.l, y0: p.y - demi.h, y1: p.y + demi.h };
    if ([[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]].some(([x, y]) => positionDansAnneau({ x: x!, y: y! }, contour) !== 'dedans')) return Infinity;
    return boites.reduce((t, b) => t + Math.max(0, Math.min(b.x1, r.x1) - Math.max(b.x0, r.x0)) * Math.max(0, Math.min(b.y1, r.y1) - Math.max(b.y0, r.y0)), 0);
  };
  const c0 = couvre(voulue);
  if (c0 === 0) return { point: voulue, couvre: 0 };
  const xs = contour.map(q => q.x), ys = contour.map(q => q.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), n = 24;
  let meilleur = voulue, c = c0, d = 0;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const p = { x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * j) / n }, k = couvre(p), e = distance(p, voulue);
    /* moins couvert, ou aussi peu mais plus près (une différence de moins de 1 % ne compte pas) */
    if (k < c * 0.99 || (Math.abs(k - c) <= c * 0.01 && e < d)) { meilleur = p; c = k; d = e }
  }
  return { point: meilleur, couvre: c };
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
  for (const x of Object.values(f.objects)) if (x.type === 'opening' && ouvertureBatie(x) && x.id !== id && x.hostWallId === mur.id) arrets.push(x.offset - x.width / 2, x.offset + x.width / 2);
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
