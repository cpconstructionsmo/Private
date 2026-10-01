/* Le dessin d'une cote : où sont ses deux extrémités, sa ligne (décalée),
   et sa valeur. La valeur vient du solveur (mesurerCote) : l'affichage ne
   calcule rien d'autre que des positions. */
import type { Dimension, Floor, ObjectAnchor, Point } from '../model/types';
import { decalagesFaces, mursDroits, type MurDroit } from '../building/murs';
import { mesurerCote } from '../building/contraintes';
import { projeterSurDroite } from '../geometry/segment';
import { ajouter, milieu, multiplier, normaleGauche, normaliser, soustraire } from '../geometry/vecteur';

export interface DessinCote { de: Point; vers: Point; ligne: [Point, Point]; texte: Point; valeur: number; angle: number }

function ligneDe(w: MurDroit, f: ObjectAnchor['feature']): { a: Point; b: Point } | null {
  const d = decalagesFaces(w), o = f === 'axis' ? 0 : f === 'face_left' ? d.gauche : f === 'face_right' ? d.droite : null;
  if (o === null) return null;
  const n = normaleGauche(normaliser(soustraire(w.axis.b, w.axis.a)));
  return { a: ajouter(w.axis.a, multiplier(n, o)), b: ajouter(w.axis.b, multiplier(n, o)) };
}

function pointDe(w: MurDroit, f: ObjectAnchor['feature']): Point | null {
  return f === 'start' ? w.axis.a : f === 'end' ? w.axis.b : f === 'center' ? milieu(w.axis.a, w.axis.b) : null;
}

export function dessinCote(f: Floor, d: Dimension): DessinCote | null {
  const valeur = mesurerCote(f, d);
  if (valeur === null) return null;
  const M = new Map(mursDroits(f).map(w => [w.id, w]));
  const w1 = M.get(d.refs[0].objectId), w2 = M.get(d.refs[1].objectId);
  if (!w1 || !w2) return null;
  const p1 = pointDe(w1, d.refs[0].feature), p2 = pointDe(w2, d.refs[1].feature);
  const l1 = ligneDe(w1, d.refs[0].feature), l2 = ligneDe(w2, d.refs[1].feature);
  let de: Point, vers: Point;
  if (p1 && p2) { de = p1; vers = p2 }
  else if (l1 && p2) { de = projeterSurDroite(p2, l1).point; vers = p2 }
  else if (p1 && l2) { de = p1; vers = projeterSurDroite(p1, l2).point }
  else if (l1 && l2) { vers = milieu(l2.a, l2.b); de = projeterSurDroite(vers, l1).point }
  else return null;
  const u = normaliser(soustraire(vers, de));
  /* la ligne de cote est décalée sur le côté (perpendiculaire à la mesure) */
  const n = normaleGauche(u.x === 0 && u.y === 0 ? { x: 1, y: 0 } : u);
  const ligne: [Point, Point] = [ajouter(de, multiplier(n, d.offset)), ajouter(vers, multiplier(n, d.offset))];
  let angle = Math.atan2(u.y, u.x);
  if (angle > Math.PI / 2 || angle <= -Math.PI / 2) angle += Math.PI;        // texte jamais à l'envers
  return { de, vers, ligne, texte: milieu(ligne[0], ligne[1]), valeur, angle };
}

/** « 4,50 » : les cotes en mètres, au centimètre */
export const texteCote = (mm: number): string => (Math.round(mm / 10) / 100).toFixed(2).replace('.', ',');
