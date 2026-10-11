/* Couper un mur en deux, fusionner deux murs alignés bout à bout : ce que
   devient chaque ouverture, chaque zone de parement, chaque ancrage de cote
   et chaque contrainte, sans rien modifier. Les commandes couperMur et
   fusionnerMurs (engine) en font des opérations inversibles ; l'éditeur
   s'en sert pour dire d'avance ce qui est possible (le bouton « Fusionner »
   n'apparaît que si la fusion l'est).

   Utile pour une extension (une partie du mur existante, l'autre neuve),
   pour changer le type d'un bout de mur, ou pour remettre d'un seul tenant
   un mur importé en morceaux. Rien ne se perd en silence : ce qui ne peut
   pas suivre (une cote au milieu du mur, une contrainte de longueur, une
   coupure dans une baie) refuse l'opération avec sa raison. */
import type { Constraint, FinishZone, Floor, Mm, ObjectAnchor, Opening, Point, Wall } from '../model/types';
import { ALIGNEMENT_FUSION, EPS_COINCIDENCE, egal } from '../geometry/tolerance';
import { angleDe, distance, normaliser, scalaire, soustraire, vectoriel } from '../geometry/vecteur';

type MurDroit = Wall & { axis: { a: Point; b: Point } };

const NOMS_BAIES: Record<Opening['kind'], string> = { door: 'porte', window: 'fenêtre', french_window: 'porte-fenêtre', garage_door: 'porte de garage', bay: 'baie', void: 'passage' };
const nomBaie = (o: Opening) => o.catalogRef?.label ?? NOMS_BAIES[o.kind];
const murDroit = (f: Floor, id: string): MurDroit | string => {
  const w = f.objects[id];
  if (!w || w.type !== 'wall') return 'mur introuvable sur ce niveau';
  return 'a' in w.axis ? (w as MurDroit) : 'mur courbe : à venir';
};
const pointA = (w: MurDroit, t: Mm): Point => {
  const L = distance(w.axis.a, w.axis.b);
  return { x: w.axis.a.x + (t / L) * (w.axis.b.x - w.axis.a.x), y: w.axis.a.y + (t / L) * (w.axis.b.y - w.axis.a.y) };
};

export interface Coupure {
  /** le point de la coupure, sur l'axe */
  point: Point;
  /** les longueurs des deux parties (de l'origine a à la coupure, puis de la coupure à b) */
  longueurs: [Mm, Mm];
  /** les ouvertures de la seconde partie, à leur position sur elle (celles de la première ne bougent pas) */
  ouvertures: { id: string; offset: Mm }[];
  /** les zones de parement de chaque partie (une zone à cheval est partagée) */
  zones: [FinishZone[], FinishZone[]];
  /** les cotes accrochées au bout b du mur : elles suivent la seconde partie */
  cotes: { id: string; refs: [ObjectAnchor, ObjectAnchor] }[];
}

/** couper le mur « id » à « position » (mm le long de l'axe depuis a) ; « nouveau » : l'identifiant de la seconde
 *  partie. Le mur garde son identifiant (et ce qui s'y rapporte) pour la première ; la raison d'un refus sinon */
export function planCoupure(f: Floor, id: string, position: Mm, nouveau: string): Coupure | string {
  const w = murDroit(f, id);
  if (typeof w === 'string') return w;
  const L = distance(w.axis.a, w.axis.b);
  if (!Number.isFinite(position) || position <= EPS_COINCIDENCE || position >= L - EPS_COINCIDENCE) return 'la coupure doit tomber entre les deux bouts du mur';
  const ouvertures: Coupure['ouvertures'] = [];
  for (const o of Object.values(f.objects)) {
    if (o.type !== 'opening' || o.hostWallId !== id) continue;
    if (o.offset + o.width / 2 <= position + EPS_COINCIDENCE) continue;
    if (o.offset - o.width / 2 >= position - EPS_COINCIDENCE) ouvertures.push({ id: o.id, offset: o.offset - position });
    else return 'la coupure tombe dans une ouverture (' + nomBaie(o) + ') : coupez à côté';
  }
  const A: FinishZone[] = [], B: FinishZone[] = [];
  for (const z of w.finishZones ?? []) {
    if (z.to <= position + EPS_COINCIDENCE) A.push({ ...z });
    else if (z.from >= position - EPS_COINCIDENCE) B.push({ ...z, from: Math.max(0, z.from - position), to: z.to - position });
    else { A.push({ ...z, to: position }); B.push({ ...z, from: 0, to: z.to - position }) }
  }
  const cotes: Coupure['cotes'] = [];
  for (const o of Object.values(f.objects)) {
    if (o.type === 'constraint' && o.walls.includes(id) && o.kind === 'length') return 'le mur a une contrainte de longueur : retirez-la avant de le couper';
    if (o.type !== 'dimension' || !o.refs.some(r => r.objectId === id)) continue;
    if (o.refs.some(r => r.objectId === id && r.feature === 'center')) return 'une cote s’accroche au milieu de ce mur : retirez-la avant de le couper';
    if (o.refs.some(r => r.objectId === id && r.feature === 'end'))
      cotes.push({ id: o.id, refs: o.refs.map(r => (r.objectId === id && r.feature === 'end' ? { objectId: nouveau, feature: 'end' } : { ...r })) as [ObjectAnchor, ObjectAnchor] });
  }
  return { point: pointA(w, position), longueurs: [position, L - position], ouvertures, zones: [A, B], cotes };
}

export interface Fusion {
  /** l'axe du mur fusionné : dans le sens du premier mur, d'un bout lointain à l'autre */
  axe: { a: Point; b: Point };
  /** les ouvertures des deux murs, à leur position sur le mur fusionné (et leur sens, si le second était à rebours) */
  ouvertures: { id: string; offset: Mm; swing?: Opening['swing'] }[];
  zones: FinishZone[];
  /** les cotes accrochées aux deux murs, réaccrochées au mur fusionné */
  cotes: { id: string; refs: [ObjectAnchor, ObjectAnchor] }[];
  /** les contraintes du second mur reportées sur le premier ; celles qui n'ont plus d'objet (entre les deux, ou en double) */
  reportees: { id: string; walls: string[]; value?: number }[];
  retirees: string[];
}

const retourner = (j: Wall['justification']): Wall['justification'] => (j === 'left' ? 'right' : j === 'right' ? 'left' : j);
const cm = (x: Mm) => String(Math.round(x / 10)).replace('.', ',');

/** ce qui distingue deux murs qu'on voudrait d'un seul tenant ; null : rien */
function differences(A: MurDroit, B: MurDroit, retourne: boolean): string | null {
  if (A.role !== B.role) return 'les deux murs ne sont pas du même type';
  if (!egal(A.thickness, B.thickness, 0.5)) return 'les deux murs n’ont pas la même épaisseur (' + cm(A.thickness) + ' et ' + cm(B.thickness) + ' cm)';
  if ((A.compositionRef ?? '') !== (B.compositionRef ?? '')) return 'les deux murs n’ont pas la même composition';
  if (!egal(A.height, B.height, 0.5) || !egal(A.baseOffset, B.baseOffset, 0.5)) return 'les deux murs n’ont pas la même hauteur';
  if (A.justification !== (retourne ? retourner(B.justification) : B.justification)) return 'les deux murs ne sont pas tracés sur la même face (justification)';
  if ((A.finish ?? '') !== (B.finish ?? '')) return 'les deux murs n’ont pas le même parement';
  if (JSON.stringify(A.phase ?? null) !== JSON.stringify(B.phase ?? null)) return 'l’un des murs est existant (ou à démolir), l’autre non : ils restent distincts';
  if (JSON.stringify(A.loadBearing) !== JSON.stringify(B.loadBearing)) return 'les deux murs ne sont pas qualifiés de même (porteur)';
  return null;
}

/** fusionner le mur « idB » dans le mur « idA » (qui garde son identifiant) ; la raison d'un refus sinon */
export function planFusion(f: Floor, idA: string, idB: string): Fusion | string {
  if (idA === idB) return 'il faut deux murs différents';
  const A = murDroit(f, idA), B = murDroit(f, idB);
  if (typeof A === 'string') return A;
  if (typeof B === 'string') return B;
  /* le bout commun */
  const J = [A.axis.a, A.axis.b].flatMap(p => [B.axis.a, B.axis.b].filter(q => distance(p, q) <= EPS_COINCIDENCE).map(() => p))[0];
  if (!J) return 'les deux murs ne se touchent pas bout à bout';
  const aLoin = J === A.axis.a ? A.axis.b : A.axis.a, bLoin = distance(B.axis.a, J) <= EPS_COINCIDENCE ? B.axis.b : B.axis.a;
  const u = normaliser(soustraire(A.axis.b, A.axis.a));
  if (Math.abs(vectoriel(u, soustraire(bLoin, J))) > ALIGNEMENT_FUSION || scalaire(soustraire(bLoin, J), soustraire(J, aLoin)) <= 0)
    return 'les deux murs ne sont pas dans le prolongement l’un de l’autre';
  const retourne = scalaire(soustraire(B.axis.b, B.axis.a), u) < 0;
  const d = differences(A, B, retourne);
  if (d) return d;
  const axe = J === A.axis.b ? { a: { ...A.axis.a }, b: { ...bLoin } } : { a: { ...bLoin }, b: { ...A.axis.b } };
  const Lm = distance(axe.a, axe.b), pos = (p: Point) => scalaire(soustraire(p, axe.a), u);
  const sens = (w: MurDroit) => (w === B && retourne ? -1 : 1);
  /* les ouvertures : à leur place sur le mur fusionné ; une porte du mur retourné garde son battant (charnière et côté inversés) */
  const ouvertures: Fusion['ouvertures'] = [];
  for (const o of Object.values(f.objects)) {
    if (o.type !== 'opening' || (o.hostWallId !== idA && o.hostWallId !== idB)) continue;
    const w = o.hostWallId === idA ? A : B, s = pos(w.axis.a);
    ouvertures.push({ id: o.id, offset: s + sens(w) * o.offset,
      ...(o.swing ? { swing: sens(w) < 0 ? { side: o.swing.side === 'left' ? 'right' : 'left', inward: !o.swing.inward } : { ...o.swing } } : {}) });
  }
  /* les zones de parement, mises bout à bout ; deux moitiés d'une même zone (un mur coupé puis refait) se rejoignent */
  const Z = [A, B].flatMap(w => (w.finishZones ?? []).map(z => {
    const s = pos(w.axis.a), x = s + sens(w) * z.from, y = s + sens(w) * z.to;
    return { ...z, from: Math.min(x, y), to: Math.max(x, y) };
  })).sort((p, q) => p.from - q.from);
  const zones: FinishZone[] = [];
  for (const z of Z) {
    const der = zones[zones.length - 1];
    if (der && egal(der.to, z.from, 0.5) && der.finish === z.finish && (der.label ?? '') === (z.label ?? '')) der.to = z.to;
    else zones.push(z);
  }
  /* les cotes : un bout de mur reste un bout s'il est au bout du mur fusionné ; à la jonction, il disparaît */
  const cotes: Fusion['cotes'] = [];
  for (const o of Object.values(f.objects)) {
    if (o.type !== 'dimension' || !o.refs.some(r => r.objectId === idA || r.objectId === idB)) continue;
    const refs: ObjectAnchor[] = [];
    for (const r of o.refs) {
      if (r.objectId !== idA && r.objectId !== idB) { refs.push({ ...r }); continue }
      const w = r.objectId === idA ? A : B;
      if (r.feature === 'center') return 'une cote s’accroche au milieu d’un des murs : retirez-la avant de les fusionner';
      if (r.feature === 'start' || r.feature === 'end') {
        const x = pos(r.feature === 'start' ? w.axis.a : w.axis.b);
        if (egal(x, 0, ALIGNEMENT_FUSION)) refs.push({ objectId: idA, feature: 'start' });
        else if (egal(x, Lm, ALIGNEMENT_FUSION)) refs.push({ objectId: idA, feature: 'end' });
        else return 'une cote s’accroche à la jonction des deux murs : retirez-la avant de les fusionner';
      } else refs.push({ objectId: idA, feature: sens(w) < 0 && r.feature !== 'axis' ? (r.feature === 'face_left' ? 'face_right' : 'face_left') : r.feature });
    }
    if (refs[0]!.objectId === refs[1]!.objectId && refs[0]!.feature === refs[1]!.feature) return 'une cote relie les deux murs : retirez-la avant de les fusionner';
    if (o.refs.some((r, i) => r.objectId !== refs[i]!.objectId || r.feature !== refs[i]!.feature)) cotes.push({ id: o.id, refs: refs as [ObjectAnchor, ObjectAnchor] });
  }
  /* les contraintes : une longueur n'a plus d'objet (refus) ; celles du second mur passent au premier */
  const K = Object.values(f.objects).filter((o): o is Constraint => o.type === 'constraint');
  const reportees: Fusion['reportees'] = [], retirees: string[] = [];
  for (const k of K) {
    if (!k.walls.includes(idA) && !k.walls.includes(idB)) continue;
    if (k.kind === 'length') return 'un des murs a une contrainte de longueur : retirez-la avant de les fusionner';
    if (!k.walls.includes(idB)) continue;
    const walls = [...new Set(k.walls.map(w => (w === idB ? idA : w)))];
    const doublon = walls.length < k.walls.length
      || K.some(x => x !== k && !retirees.includes(x.id) && x.kind === k.kind && x.walls.length === walls.length && walls.every(w => x.walls.includes(w)));
    if (doublon) { retirees.push(k.id); continue }
    /* un angle se lit dans le sens du mur : à rebours, il tourne d'un demi-tour */
    const value = k.kind === 'angle' && k.value !== undefined && retourne ? angleDe({ x: -Math.cos(k.value), y: -Math.sin(k.value) }) : k.value;
    reportees.push({ id: k.id, walls, ...(value !== undefined ? { value } : {}) });
  }
  return { axe, ouvertures, zones, cotes, reportees, retirees };
}

/** les murs droits alignés bout à bout avec « id » qu'on peut lui fusionner (à son départ, puis à son arrivée) */
export function voisinsFusionnables(f: Floor, id: string): string[] {
  const w = f.objects[id];
  if (!w || w.type !== 'wall' || !('a' in w.axis)) return [];
  const { a, b } = w.axis;
  const pres = (o: MurDroit, p: Point) => distance(o.axis.a, p) <= EPS_COINCIDENCE || distance(o.axis.b, p) <= EPS_COINCIDENCE;
  const M = Object.values(f.objects).filter((o): o is MurDroit => o.type === 'wall' && o.id !== id && 'a' in o.axis);
  return [a, b].flatMap(p => M.filter(o => pres(o, p) && typeof planFusion(f, id, o.id) !== 'string').map(o => o.id));
}

/** les longueurs des deux parties, pour l'aide : « 3,20 m | 6,80 m » */
export const texteCoupure = (k: Pick<Coupure, 'longueurs'>): string => k.longueurs.map(x => (Math.round(x / 10) / 100).toFixed(2).replace('.', ',') + ' m').join(' | ');

