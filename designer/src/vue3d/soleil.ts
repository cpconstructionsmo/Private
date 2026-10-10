/* La course du soleil, pour l'ensoleillement de la vue 3D et des images du
   client : sa hauteur et son azimut à une date et une heure solaire, à une
   latitude, puis sa direction dans le repère du plan, d'après le nord de la
   parcelle. Formules usuelles (déclinaison de Cooper, angle horaire) : assez
   justes pour des ombres (à un degré près), pas pour une étude
   réglementaire. L'heure est l'heure solaire (midi : le soleil au sud), non
   l'heure légale. */
import type { Point } from '../model/types';

/** la latitude prise sans autre indication : le milieu de la France métropolitaine (à préciser au projet) */
export const LATITUDE_PAR_DEFAUT = 47;

export interface Ensoleillement {
  /** le jour de l'année (1 : 1er janvier ; 172 : 21 juin) */
  jour: number;
  /** l'heure solaire (12 : midi, le soleil au sud) */
  heure: number;
  /** la latitude (°, nord positive) */
  latitude: number;
}

/** les jours remarquables : équinoxe de printemps, solstices, équinoxe d'automne */
export const JOURS_REMARQUABLES = { mars: 80, juin: 172, septembre: 266, decembre: 355 } as const;

const RAD = Math.PI / 180;

/** la position du soleil : hauteur au-dessus de l'horizon et azimut compté depuis le nord, vers l'est (radians) */
export function positionSoleil(e: Ensoleillement): { hauteur: number; azimut: number } {
  const decl = 23.44 * RAD * Math.sin(2 * Math.PI * (284 + e.jour) / 365);
  const H = 15 * RAD * (e.heure - 12), phi = e.latitude * RAD;
  const hauteur = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H));
  /* depuis le sud, positif vers l'ouest ; puis depuis le nord, vers l'est */
  const sud = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi));
  const azimut = (sud + Math.PI + 2 * Math.PI) % (2 * Math.PI);
  return { hauteur, azimut };
}

/**
 * La direction du soleil dans le repère du plan (x, y du plan, z vers le haut), vecteur unitaire vers le soleil.
 * « nord » : l'angle du nord de la parcelle, depuis le haut du plan, sens inverse des aiguilles (Plot.north).
 */
export function directionSoleil(p: { hauteur: number; azimut: number }, nord = 0): { x: number; y: number; z: number } {
  const N: Point = { x: -Math.sin(nord), y: Math.cos(nord) }, E: Point = { x: Math.cos(nord), y: Math.sin(nord) };
  const c = Math.cos(p.hauteur);
  return { x: (N.x * Math.cos(p.azimut) + E.x * Math.sin(p.azimut)) * c, y: (N.y * Math.cos(p.azimut) + E.y * Math.sin(p.azimut)) * c, z: Math.sin(p.hauteur) };
}

/** le lever et le coucher (heures solaires) : le soleil à l'horizon ; null si le jour ou la nuit dure (hautes latitudes) */
export function leverCoucher(jour: number, latitude: number): { lever: number; coucher: number } | null {
  const decl = 23.44 * RAD * Math.sin(2 * Math.PI * (284 + jour) / 365), c = -Math.tan(latitude * RAD) * Math.tan(decl);
  if (c <= -1 || c >= 1) return null;
  const h = Math.acos(c) / RAD / 15;
  return { lever: 12 - h, coucher: 12 + h };
}
