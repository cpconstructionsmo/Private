/* Copier, couper, coller : un groupe d'objets d'un niveau, recollé ailleurs
   (le même niveau, un autre, un autre projet), déplacé, tourné d'un quart
   de tour ou retourné en miroir.

   Le presse-papiers garde des COPIES des objets (jamais des références au
   modèle) ; coller les traduit en commandes ordinaires (ADR-0005) : un seul
   « annuler » retire tout le collage, et chaque objet collé est validé comme
   s'il était dessiné à la main.

   Ce qui se copie : les objets choisis ; avec un mur, ses ouvertures ; les
   cotes et contraintes dont tous les murs sont copiés. Une ouverture sans
   son mur, un fond ou une toiture ne se copient pas (ils n'ont de sens
   qu'en place). */
import type { BuildingObject, Constraint, Floor, Furniture, ObjectAnchor, Opening, Point, Room, Wall } from '../model/types';
import type { Commande } from './commandes';

export interface PressePapiers {
  objets: BuildingObject[];
  /** le coin bas-gauche du groupe : c'est lui qui suit le curseur au collage */
  ancre: Point;
}

/** où et comment coller : l'ancre va en « origine », après miroir puis quarts de tour */
export interface Placement { origine: Point; quarts?: number; miroirX?: boolean; miroirY?: boolean }

const copiable = (o: BuildingObject): boolean => o.type === 'wall' || o.type === 'opening' || o.type === 'room' || o.type === 'furniture' || o.type === 'dimension' || o.type === 'constraint';

/** copier des objets d'un niveau (null : rien de copiable) */
export function copier(f: Floor, ids: readonly string[]): PressePapiers | null {
  const choisis = new Set(ids.filter(id => f.objects[id] && copiable(f.objects[id]!)));
  const murs = new Set([...choisis].filter(id => f.objects[id]!.type === 'wall' && 'a' in (f.objects[id] as Wall).axis));
  for (const o of Object.values(f.objects)) {
    if (o.type === 'opening' && murs.has(o.hostWallId)) choisis.add(o.id);
    if (o.type === 'dimension' && o.refs.every(r => murs.has(r.objectId))) choisis.add(o.id);
    if (o.type === 'constraint' && o.walls.every(w => murs.has(w))) choisis.add(o.id);
  }
  /* une ouverture, une cote, une contrainte qui ont perdu leurs murs ne se copient pas */
  for (const id of [...choisis]) {
    const o = f.objects[id]!;
    if ((o.type === 'opening' && !murs.has(o.hostWallId)) || (o.type === 'dimension' && !o.refs.every(r => murs.has(r.objectId)))
      || (o.type === 'constraint' && !o.walls.every(w => murs.has(w))) || (o.type === 'wall' && !murs.has(o.id))) choisis.delete(id);
  }
  if (!choisis.size) return null;
  const objets = [...choisis].map(id => structuredClone(f.objects[id]!));
  const pts: Point[] = [];
  for (const o of objets) {
    if (o.type === 'wall' && 'a' in o.axis) pts.push(o.axis.a, o.axis.b);
    else if (o.type === 'room') pts.push(o.seed);
    else if (o.type === 'furniture') pts.push(o.position);
  }
  if (!pts.length) return null;
  return { objets, ancre: { x: Math.min(...pts.map(p => p.x)), y: Math.min(...pts.map(p => p.y)) } };
}

/** les commandes qui collent le presse-papiers sur un niveau ; « id » nomme les murs collés */
export function commandesColler(pp: PressePapiers, niveau: string, pl: Placement, id: () => string): Commande[] {
  const q = (((pl.quarts ?? 0) % 4) + 4) % 4, mx = !!pl.miroirX, my = !!pl.miroirY;
  /* un nombre impair de miroirs retourne le sens : gauche et droite s'échangent */
  const retourne = mx !== my;
  const T = (p: Point): Point => {
    let x = p.x - pp.ancre.x, y = p.y - pp.ancre.y;
    if (mx) x = -x;
    if (my) y = -y;
    for (let i = 0; i < q; i++) [x, y] = [-y, x];
    return { x: Math.round((pl.origine.x + x) * 1e6) / 1e6, y: Math.round((pl.origine.y + y) * 1e6) / 1e6 };
  };
  /* un angle (direction) : même transformation que les points */
  const angle = (a: number): number => {
    let x = Math.cos(a), y = Math.sin(a);
    if (mx) x = -x;
    if (my) y = -y;
    return Math.atan2(y, x) + q * Math.PI / 2;
  };
  const nouveaux = new Map<string, string>();
  const cmds: Commande[] = [];
  const O = pp.objets;
  for (const w of O) {
    if (w.type !== 'wall' || !('a' in w.axis)) continue;
    const n = id();
    nouveaux.set(w.id, n);
    const just: Wall['justification'] = retourne && w.justification !== 'center' ? (w.justification === 'left' ? 'right' : 'left') : w.justification;
    cmds.push({ type: 'creerMur', niveau, id: n, a: T(w.axis.a), b: T(w.axis.b), epaisseur: w.thickness, hauteur: w.height, role: w.role, justification: just, porteur: structuredClone(w.loadBearing), ...(w.compositionRef ? { composition: w.compositionRef } : {}) });
  }
  for (const o of O) {
    if (o.type === 'opening') {
      const op = o as Opening, mur = nouveaux.get(op.hostWallId);
      if (!mur) continue;
      cmds.push({ type: 'creerOuverture', mur, position: op.offset, largeur: op.width, hauteur: op.height, allege: op.sill, genre: op.kind,
        ...(op.swing ? { sens: { side: retourne ? (op.swing.side === 'left' ? 'right' : 'left') : op.swing.side, inward: op.swing.inward } } : {}),
        ...(op.leaves !== undefined ? { vantaux: op.leaves } : {}), ...(op.operation ? { manoeuvre: op.operation } : {}), ...(op.catalogRef ? { modele: { ...op.catalogRef } } : {}) });
    } else if (o.type === 'room') {
      const r = o as Room;
      cmds.push({ type: 'creerPiece', niveau, point: T(r.seed), nom: r.name, usage: r.usage, humide: r.wet });
    } else if (o.type === 'furniture') {
      const m = o as Furniture;
      /* l'orientation d'un meuble est celle de son devant (+y du meuble) */
      const devant = angle(m.rotation + Math.PI / 2);
      cmds.push({ type: 'creerMeuble', niveau, modele: { ...m.catalogRef }, position: T(m.position), rotation: devant - Math.PI / 2, largeur: m.width, profondeur: m.depth, hauteur: m.height });
    } else if (o.type === 'dimension') {
      const refs = o.refs.map(r => ({ objectId: nouveaux.get(r.objectId)!, feature: retourne && (r.feature === 'face_left' || r.feature === 'face_right') ? (r.feature === 'face_left' ? 'face_right' : 'face_left') : r.feature })) as [ObjectAnchor, ObjectAnchor];
      if (refs.some(r => !r.objectId)) continue;
      cmds.push({ type: 'creerCote', niveau, refs, motrice: o.driving, decalage: o.offset });
    } else if (o.type === 'constraint') {
      const k = o as Constraint, murs = k.walls.map(w => nouveaux.get(w)!);
      if (murs.some(w => !w)) continue;
      const genre = q % 2 && (k.kind === 'horizontal' || k.kind === 'vertical') ? (k.kind === 'horizontal' ? 'vertical' : 'horizontal') : k.kind;
      cmds.push({ type: 'ajouterContrainte', niveau, genre, murs, ...(k.value !== undefined ? { valeur: k.kind === 'angle' ? angle(k.value) : k.value } : {}) });
    }
  }
  return cmds;
}

/** les commandes qui suppriment un groupe sans se gêner : ce qu'un mur supprimé emporte déjà (ses ouvertures, ses cotes) n'est pas supprimé deux fois */
export function commandesSupprimer(f: Floor, ids: readonly string[]): Commande[] {
  const set = new Set(ids.filter(id => f.objects[id] && f.objects[id]!.type !== 'roof'));
  const murs = new Set([...set].filter(id => f.objects[id]!.type === 'wall'));
  const emportes = (o: BuildingObject) => (o.type === 'opening' && murs.has(o.hostWallId))
    || (o.type === 'dimension' && o.refs.some(r => murs.has(r.objectId))) || (o.type === 'constraint' && o.walls.some(w => murs.has(w)));
  return [...set].filter(id => !emportes(f.objects[id]!)).map(id => ({ type: 'supprimer', id }) as Commande);
}

/** la taille d'un groupe copié (pour le dire) */
export const resumePressePapiers = (pp: PressePapiers): string => {
  const n = (t: BuildingObject['type']) => pp.objets.filter(o => o.type === t).length;
  const parts: [number, string][] = [[n('wall'), 'mur'], [n('opening'), 'ouverture'], [n('room'), 'pièce'], [n('furniture'), 'meuble']];
  return parts.filter(([k]) => k).map(([k, s]) => k + ' ' + s + (k > 1 ? 's' : '')).join(', ') || pp.objets.length + ' objet(s)';
};


