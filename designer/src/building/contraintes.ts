/* Contraintes et cotes motrices : le solveur.

   Les murs droits d'un niveau forment un réseau de SOMMETS (extrémités
   confondues à la tolérance près) : déplacer un sommet déplace tous les
   murs qui y aboutissent, les angles restent fermés. Sur ce réseau
   s'appliquent :
   - les contraintes saisies (horizontal, vertical, parallèle,
     perpendiculaire, longueur, angle) ;
   - les cotes motrices (distance imposée) ;
   - les jonctions en T : un sommet posé sur le corps d'un mur y reste
     (la cloison suit le mur qu'on déplace), sauf si c'est lui qu'on déplace.

   Une modification ÉPINGLE des sommets (ceux que l'utilisateur déplace, ou
   qu'une cote tient fixes) ; le solveur cherche le plus petit ajustement des
   autres sommets qui rend toutes les équations vraies (Gauss-Newton, pas de
   norme minimale pondérée). Le poids d'un sommet croît avec sa distance, en
   nombre de murs, à ce qu'on modifie : on ajuste d'abord les murs voisins,
   le reste du plan ne bouge qu'en dernier recours (tirer un mur parallèle à
   un autre déplace son autre bout, pas tout le plan). S'il n'y arrive pas
   à la tolérance de coïncidence près,
   la modification est REFUSÉE avec la raison : une contrainte n'est jamais
   violée en silence, et rien n'est deviné (règle 2 : calcul déterministe).

   Chaque équation est exprimée en millimètres (une erreur d'angle est
   ramenée à un écart de position), pour qu'une même tolérance s'applique. */
import type { Constraint, Dimension, Floor, Mm, ObjectAnchor, Point } from '../model/types';
import { EPS_COINCIDENCE } from '../geometry/tolerance';
import { projeterSurDroite } from '../geometry/segment';
import { distance, multiplier, normaleGauche, normaliser, scalaire, soustraire, vectoriel, ajouter, milieu } from '../geometry/vecteur';
import { decalagesFaces, mursDroits, type MurDroit } from './murs';

export interface Epingle { de: Point; vers: Point }
export type Axes = Record<string, { a: Point; b: Point }>;
export type Resolution = { ok: true; axes: Axes } | { ok: false; erreurs: string[] };

/** une équation : sa valeur (0 quand elle est satisfaite), les sommets dont elle dépend, et ce qu'on en dit */
interface Equation { f: (X: Point[]) => number; noeuds: number[]; libelle: string }

const ITERATIONS = 60;
const PRECISION = 1e-7;          // mm : on vise bien plus fin que la tolérance, pour la marge
const ARRONDI = 1e4;             // coordonnées rendues au 1/10 000 de mm

interface Reseau {
  murs: MurDroit[];
  noeuds: Point[];
  ext: Map<string, { a: number; b: number }>;
}

function reseau(f: Floor): Reseau {
  const murs = mursDroits(f);
  const noeuds: Point[] = [];
  const indice = (p: Point): number => {
    const k = noeuds.findIndex(s => distance(s, p) <= EPS_COINCIDENCE);
    if (k >= 0) return k;
    noeuds.push({ ...p });
    return noeuds.length - 1;
  };
  const ext = new Map(murs.map(w => [w.id, { a: indice(w.axis.a), b: indice(w.axis.b) }]));
  return { murs, noeuds, ext };
}

/** la ligne d'un ancrage (axe ou face) d'un mur, sous forme d'un point et d'un décalage le long de la normale */
function ligneDe(w: MurDroit, feature: ObjectAnchor['feature']): number | null {
  const f = decalagesFaces(w);
  return feature === 'axis' ? 0 : feature === 'face_left' ? f.gauche : feature === 'face_right' ? f.droite : null;
}

type Ancrage = { genre: 'point'; P: (X: Point[]) => Point; noeuds: number[] } | { genre: 'ligne'; a: number; b: number; decalage: Mm };

function ancrage(R: Reseau, x: ObjectAnchor): Ancrage | null {
  const w = R.murs.find(m => m.id === x.objectId), e = R.ext.get(x.objectId);
  if (!w || !e) return null;
  if (x.feature === 'start') return { genre: 'point', P: X => X[e.a]!, noeuds: [e.a] };
  if (x.feature === 'end') return { genre: 'point', P: X => X[e.b]!, noeuds: [e.b] };
  if (x.feature === 'center') return { genre: 'point', P: X => milieu(X[e.a]!, X[e.b]!), noeuds: [e.a, e.b] };
  const d = ligneDe(w, x.feature);
  return d === null ? null : { genre: 'ligne', a: e.a, b: e.b, decalage: d };
}

/** distance signée d'un point à la ligne d'un ancrage (positive à gauche du mur) */
function distanceLigne(X: Point[], l: Extract<Ancrage, { genre: 'ligne' }>, P: Point): number {
  const A = X[l.a]!, u = normaliser(soustraire(X[l.b]!, A));
  return vectoriel(u, soustraire(P, A)) - l.decalage;
}

/** le point d'une ligne d'ancrage, au droit d'un sommet de son mur */
function pointDeLigne(X: Point[], l: Extract<Ancrage, { genre: 'ligne' }>, k: number): Point {
  const u = normaliser(soustraire(X[l.b]!, X[l.a]!));
  return ajouter(X[k]!, multiplier(normaleGauche(u), l.decalage));
}

/** ce que mesure une cote, dans l'état présent du niveau (null : ancrages introuvables ou non mesurables) */
export function mesurerCote(f: Floor, d: Pick<Dimension, 'refs'>): Mm | null {
  const R = reseau(f), X = R.noeuds;
  const p = ancrage(R, d.refs[0]), q = ancrage(R, d.refs[1]);
  if (!p || !q) return null;
  if (p.genre === 'point' && q.genre === 'point') return distance(p.P(X), q.P(X));
  if (p.genre === 'ligne' && q.genre === 'point') return Math.abs(distanceLigne(X, p, q.P(X)));
  if (p.genre === 'point' && q.genre === 'ligne') return Math.abs(distanceLigne(X, q, p.P(X)));
  if (p.genre === 'ligne' && q.genre === 'ligne') {
    if (!paralleles(X, p, q)) return null;
    return Math.abs(distanceLigne(X, p, pointDeLigne(X, q, q.a)));
  }
  return null;
}

function paralleles(X: Point[], p: { a: number; b: number }, q: { a: number; b: number }): boolean {
  const u = normaliser(soustraire(X[p.b]!, X[p.a]!)), v = soustraire(X[q.b]!, X[q.a]!);
  return Math.abs(vectoriel(u, v)) <= EPS_COINCIDENCE;
}

/** les équations d'une cote motrice (signe fixé sur l'état de départ) */
function equationsCote(R: Reseau, d: Dimension): Equation[] | string {
  const X0 = R.noeuds, v = d.value;
  if (v === undefined) return [];
  const p = ancrage(R, d.refs[0]), q = ancrage(R, d.refs[1]);
  if (!p || !q) return 'cote motrice : un mur coté est introuvable';
  const lib = 'cote motrice de ' + Math.round(v) + ' mm';
  if (p.genre === 'point' && q.genre === 'point')
    return [{ f: X => distance(p.P(X), q.P(X)) - v, noeuds: [...p.noeuds, ...q.noeuds], libelle: lib }];
  if (p.genre === 'ligne' && q.genre === 'ligne') {
    if (!paralleles(X0, p, q)) return 'cote motrice entre deux murs qui ne sont pas parallèles';
    const s = Math.sign(distanceLigne(X0, p, pointDeLigne(X0, q, q.a))) || 1;
    /* deux équations, une par extrémité : le mur coté se déplace parallèlement */
    return [q.a, q.b].map(k => ({ f: (X: Point[]) => s * distanceLigne(X, p, pointDeLigne(X, q, k)) - v, noeuds: [p.a, p.b, q.a, q.b], libelle: lib }));
  }
  const [l, pt] = p.genre === 'ligne' ? [p, q as Extract<Ancrage, { genre: 'point' }>] : [q as Extract<Ancrage, { genre: 'ligne' }>, p];
  const s = Math.sign(distanceLigne(X0, l, pt.P(X0))) || 1;
  return [{ f: X => s * distanceLigne(X, l, pt.P(X)) - v, noeuds: [l.a, l.b, ...pt.noeuds], libelle: lib }];
}

function equationsContrainte(R: Reseau, c: Constraint): Equation[] | string {
  const e = c.walls.map(id => R.ext.get(id));
  if (e.some(x => !x)) return 'contrainte sur un mur introuvable (ou courbe)';
  const [m1, m2] = e as { a: number; b: number }[];
  const d = (X: Point[], m: { a: number; b: number }) => soustraire(X[m.b]!, X[m.a]!);
  const n1 = [m1!.a, m1!.b];
  switch (c.kind) {
    case 'horizontal': return [{ f: X => d(X, m1!).y, noeuds: n1, libelle: 'mur horizontal' }];
    case 'vertical': return [{ f: X => d(X, m1!).x, noeuds: n1, libelle: 'mur vertical' }];
    case 'length': {
      const L = c.value;
      if (L === undefined || !(L > 0)) return 'longueur imposée invalide';
      return [{ f: X => Math.hypot(d(X, m1!).x, d(X, m1!).y) - L, noeuds: n1, libelle: 'longueur de ' + Math.round(L) + ' mm' }];
    }
    case 'angle': {
      const t = c.value;
      if (t === undefined || !Number.isFinite(t)) return 'angle imposé invalide';
      const u = { x: Math.cos(t), y: Math.sin(t) };
      return [{ f: X => vectoriel(u, d(X, m1!)), noeuds: n1, libelle: 'angle de ' + Math.round(t * 180 / Math.PI * 10) / 10 + '°' }];
    }
    case 'parallel':
    case 'perpendicular': {
      if (!m2) return 'il faut deux murs';
      const g = c.kind === 'parallel' ? vectoriel : scalaire;
      return [{ f: X => g(normaliser(d(X, m1!)), d(X, m2)), noeuds: [...n1, m2.a, m2.b], libelle: c.kind === 'parallel' ? 'murs parallèles' : 'murs perpendiculaires' }];
    }
  }
}

/* résoudre (A + λI) y = r par élimination de Gauss avec pivot partiel */
function systeme(A: number[][], r: number[]): number[] {
  const n = r.length, M = A.map((l, i) => [...l, r[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i]![c]!) > Math.abs(M[p]![c]!)) p = i;
    [M[c], M[p]] = [M[p]!, M[c]!];
    const piv = M[c]![c]!;
    if (Math.abs(piv) < 1e-300) continue;
    for (let i = c + 1; i < n; i++) {
      const k = M[i]![c]! / piv;
      if (k) for (let j = c; j <= n; j++) M[i]![j]! -= k * M[c]![j]!;
    }
  }
  const y = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i]![n]!;
    for (let j = i + 1; j < n; j++) s -= M[i]![j]! * y[j]!;
    y[i] = Math.abs(M[i]![i]!) < 1e-300 ? 0 : s / M[i]![i]!;
  }
  return y;
}

/**
 * Les nouveaux axes des murs d'un niveau après avoir épinglé des sommets.
 * Rend seulement les murs qui bougent.
 */
export function resoudre(f: Floor, epingles: readonly Epingle[]): Resolution {
  const R = reseau(f);
  const X0 = R.noeuds, n = X0.length;
  const fixe = new Array<boolean>(n).fill(false);
  const X = X0.map(p => ({ ...p }));
  for (const e of epingles) {
    const k = X0.findIndex(s => distance(s, e.de) <= EPS_COINCIDENCE);
    if (k < 0) return { ok: false, erreurs: ['aucune extrémité de mur à cet endroit'] };
    if (!Number.isFinite(e.vers.x) || !Number.isFinite(e.vers.y)) return { ok: false, erreurs: ['coordonnées invalides'] };
    fixe[k] = true; X[k] = { ...e.vers };
  }

  /* les équations */
  const eqs: Equation[] = [];
  const erreurs: string[] = [];
  for (const o of Object.values(f.objects)) {
    const r = o.type === 'constraint' ? equationsContrainte(R, o) : o.type === 'dimension' && o.driving ? equationsCote(R, o) : [];
    if (typeof r === 'string') erreurs.push(r); else eqs.push(...r);
  }
  if (erreurs.length) return { ok: false, erreurs };
  /* jonctions en T : un sommet (non épinglé) posé sur le corps d'un mur y reste */
  for (let k = 0; k < n; k++) {
    if (fixe[k]) continue;
    for (const w of R.murs) {
      const e = R.ext.get(w.id)!;
      if (e.a === k || e.b === k) continue;
      const { point, t } = projeterSurDroite(X0[k]!, w.axis), L = distance(w.axis.a, w.axis.b);
      if (distance(point, X0[k]!) <= EPS_COINCIDENCE && t * L > EPS_COINCIDENCE && (1 - t) * L > EPS_COINCIDENCE)
        eqs.push({ f: Y => vectoriel(normaliser(soustraire(Y[e.b]!, Y[e.a]!)), soustraire(Y[k]!, Y[e.a]!)), noeuds: [e.a, e.b, k], libelle: 'jonction en T' });
    }
  }

  /* ne garder que ce que la modification touche : les équations reliées,
     par des sommets libres, à un sommet épinglé ou à une équation fausse */
  const actives = new Set<number>();
  const vus = new Set<number>();
  const pile: number[] = [];
  const parNoeud = new Map<number, number[]>();
  eqs.forEach((q, i) => q.noeuds.forEach(k => (parNoeud.get(k) ?? parNoeud.set(k, []).get(k)!).push(i)));
  const activer = (i: number) => { if (!actives.has(i)) { actives.add(i); pile.push(i) } };
  eqs.forEach((q, i) => { if (Math.abs(q.f(X)) > PRECISION || q.noeuds.some(k => fixe[k])) activer(i) });
  while (pile.length) {
    const i = pile.pop()!;
    for (const k of eqs[i]!.noeuds) {
      if (fixe[k] || vus.has(k)) continue;
      vus.add(k);
      for (const j of parNoeud.get(k) ?? []) activer(j);
    }
  }
  const E = [...actives].map(i => eqs[i]!);
  const libres = [...vus];
  const col = new Map(libres.map((k, i) => [k, i]));

  /* poids : 10^(distance en murs depuis ce qu'on modifie) — les sommets
     épinglés, ou ceux d'une équation fausse au départ (contrainte nouvelle) */
  const voisins = new Map<number, Set<number>>();
  const lier = (i: number, j: number) => { (voisins.get(i) ?? voisins.set(i, new Set()).get(i)!).add(j); (voisins.get(j) ?? voisins.set(j, new Set()).get(j)!).add(i) };
  for (const e of R.ext.values()) lier(e.a, e.b);
  for (const q of eqs) if (q.libelle === 'jonction en T') { const [a, b, k] = q.noeuds as [number, number, number]; lier(k, a); lier(k, b) }
  const dist = new Array<number>(n).fill(Infinity);
  const file: number[] = [];
  for (let k = 0; k < n; k++) if (fixe[k]) { dist[k] = 0; file.push(k) }
  for (const q of eqs) if (Math.abs(q.f(X)) > PRECISION) for (const k of q.noeuds) if (dist[k] !== 0) { dist[k] = 0; file.push(k) }
  for (let i = 0; i < file.length; i++) {
    const k = file[i]!;
    for (const j of voisins.get(k) ?? []) if (dist[j] === Infinity) { dist[j] = dist[k]! + 1; file.push(j) }
  }
  const poids = libres.map(k => 10 ** Math.min(dist[k]!, 6));

  const residus = (Y: Point[]) => E.map(q => q.f(Y));
  const pire = (r: number[]) => r.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  let r = residus(X);
  for (let it = 0; it < ITERATIONS && pire(r) > PRECISION && libres.length; it++) {
    /* jacobienne (différences centrées, sur les seuls sommets de chaque équation) */
    const h = 1e-4;
    const J: Map<number, number>[] = E.map(q => {
      const ligne = new Map<number, number>();
      for (const k of new Set(q.noeuds)) {
        const c = col.get(k);
        if (c === undefined) continue;
        for (const [ax, j] of [['x', 2 * c], ['y', 2 * c + 1]] as const) {
          const v0 = X[k]![ax];
          X[k]![ax] = v0 + h; const fp = q.f(X);
          X[k]![ax] = v0 - h; const fm = q.f(X);
          X[k]![ax] = v0;
          const g = (fp - fm) / (2 * h);
          if (g) ligne.set(j, g);
        }
      }
      return ligne;
    });
    /* pas de norme minimale : Δ = −Jᵀ (J Jᵀ + λI)⁻¹ r */
    const m = E.length;
    const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
    for (let i = 0; i < m; i++) for (let j = i; j < m; j++) {
      let s = 0;
      for (const [c, v] of J[i]!) { const w = J[j]!.get(c); if (w) s += v * w / poids[c >> 1]! }
      A[i]![j] = s; A[j]![i] = s;
    }
    const lambda = 1e-12 * (1 + A.reduce((t, l, i) => t + l[i]!, 0) / Math.max(1, m));
    for (let i = 0; i < m; i++) A[i]![i]! += lambda;
    const y = systeme(A, r);
    const delta = new Array<number>(2 * libres.length).fill(0);
    J.forEach((ligne, i) => { for (const [c, v] of ligne) delta[c]! -= v * y[i]! / poids[c >> 1]! });
    /* recherche linéaire : on n'accepte un pas que s'il améliore */
    let pas = 1, mieux = false;
    const avant = pire(r);
    for (let essai = 0; essai < 12; essai++, pas /= 2) {
      const Y = X.map(p => ({ ...p }));
      libres.forEach((k, i) => { Y[k] = { x: X[k]!.x + pas * delta[2 * i]!, y: X[k]!.y + pas * delta[2 * i + 1]! } });
      const r2 = residus(Y);
      if (r2.every(Number.isFinite) && pire(r2) < avant) { libres.forEach(k => { X[k] = Y[k]! }); r = r2; mieux = true; break }
    }
    if (!mieux) break;
  }

  /* arrondi, puis vérification sur TOUTES les équations du niveau */
  for (const k of libres) X[k] = { x: Math.round(X[k]!.x * ARRONDI) / ARRONDI, y: Math.round(X[k]!.y * ARRONDI) / ARRONDI };
  const fausses = eqs.filter(q => !(Math.abs(q.f(X)) <= EPS_COINCIDENCE));
  if (fausses.length)
    return { ok: false, erreurs: ['impossible de respecter : ' + [...new Set(fausses.map(q => q.libelle))].join(', ') + ' — modification refusée, rien n’a changé'] };
  /* un angle imposé ne doit pas s'être retourné (même droite, sens opposé) */
  for (const o of Object.values(f.objects)) {
    if (o.type !== 'constraint' || o.kind !== 'angle' || o.value === undefined) continue;
    const e = R.ext.get(o.walls[0]!)!;
    if (scalaire({ x: Math.cos(o.value), y: Math.sin(o.value) }, soustraire(X[e.b]!, X[e.a]!)) <= 0)
      return { ok: false, erreurs: ['impossible de respecter l’angle imposé : le mur se retournerait'] };
  }

  const axes: Axes = {};
  for (const w of R.murs) {
    const e = R.ext.get(w.id)!;
    const a = X[e.a]!, b = X[e.b]!;
    if (distance(a, b) <= EPS_COINCIDENCE) return { ok: false, erreurs: ['un mur serait réduit à rien — modification refusée'] };
    /* un sommet regroupé à la tolérance près garde sa position exacte s'il n'a pas bougé */
    const bouge = (k: number) => X[k]!.x !== X0[k]!.x || X[k]!.y !== X0[k]!.y;
    if (bouge(e.a) || bouge(e.b)) axes[w.id] = { a: bouge(e.a) ? { ...a } : { ...w.axis.a }, b: bouge(e.b) ? { ...b } : { ...w.axis.b } };
  }
  return { ok: true, axes };
}
