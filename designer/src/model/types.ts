/* CP Building Model — la source de vérité unique (règle 1).

   Tout est en unités réelles : longueurs en millimètres, angles en radians,
   altitudes en millimètres par rapport au ±0,00 du niveau. Les pixels ne
   servent qu'à l'affichage.

   Le modèle ne garde que ce qui se SAISIT (l'axe d'un mur, son épaisseur,
   la position d'une ouverture sur son mur, le point intérieur d'une pièce).
   Ce qui se CALCULE — contour d'un mur après ses jonctions, polygone et
   surface d'une pièce — est dérivé par le Geometry Engine, jamais stocké
   comme vérité : deux vues ne peuvent donc pas diverger en silence.

   Chaque objet porte son statut et sa provenance (règle 4) : on doit
   toujours pouvoir dire d'où vient une donnée, qui l'a modifiée, quand. */

export type Mm = number;
export type Radian = number;

export interface Point { x: Mm; y: Mm }

/** confirmed : source identifiée · derived : calculée depuis d'autres
 *  données · proposed : proposition (règle, modèle, IA) à valider ·
 *  to_check : à contrôler · be_validation : relève d'un bureau d'études
 *  (structure, sol, thermique) — jamais présentée comme validée (règle 5). */
export type SourceStatus = 'confirmed' | 'derived' | 'proposed' | 'to_check' | 'be_validation';

export interface SourceRef {
  kind: 'user' | 'document' | 'rule' | 'import' | 'calculation' | 'be' | 'supplier';
  /** ce qu'on lit dans l'interface : « Plan architecte ind. B, p. 2 » */
  label: string;
  documentId?: string;
  page?: string;
  rule?: string;
  version?: string;
  by?: string;
  /** date ISO 8601 */
  at: string;
}

/** une valeur discutable : sa valeur, son statut, d'où elle vient, et ce
 *  qui change si elle est fausse (repris de l'atelier : « hypothèse ⚠️ ») */
export interface Qualified<T> {
  value: T;
  status: SourceStatus;
  sourceRefs?: SourceRef[];
  consequence?: string;
  missing?: string;
}

export interface BaseObject {
  /** identifiant stable (ULID) : ne change jamais, même après déplacement */
  id: string;
  type: string;
  floorId?: string;
  status: SourceStatus;
  sourceRefs: SourceRef[];
  /** révision du projet à la dernière modification de l'objet */
  revision: number;
  meta?: Record<string, unknown>;
}

export interface Arc { center: Point; radius: Mm; start: Radian; end: Radian; ccw: boolean }

export interface Wall extends BaseObject {
  type: 'wall';
  axis: { a: Point; b: Point } | { arc: Arc };
  thickness: Mm;
  justification: 'center' | 'left' | 'right';
  height: Mm;
  baseOffset: Mm;
  role: 'exterior' | 'partition' | 'bearing_interior';
  /** jamais « confirmed » sans document : par défaut, à valider (règle 5) */
  loadBearing: Qualified<boolean>;
  compositionRef?: string;
}

export interface Opening extends BaseObject {
  type: 'opening';
  hostWallId: string;
  /** position le long de l'axe du mur, depuis son origine a */
  offset: Mm;
  width: Mm;
  height: Mm;
  sill: Mm;
  kind: 'door' | 'window' | 'french_window' | 'garage_door' | 'bay' | 'void';
  /** sens d'ouverture : la poignée sert au plan électrique (commandes) */
  swing?: { side: 'left' | 'right'; inward: boolean };
}

export type RoomUsage = 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'wc' | 'circulation'
  | 'storage' | 'garage' | 'technical' | 'other';

export interface Room extends BaseObject {
  type: 'room';
  /** un point intérieur stable : après une modification des murs, la pièce
   *  est retrouvée par la face qui le contient (nom et usage conservés) */
  seed: Point;
  name: string;
  usage: RoomUsage;
  wet: boolean;
  excludedFromHabitable?: { value: boolean; reason: string };
}

/** un point d'accroche sur un objet, pour une cote */
export interface ObjectAnchor { objectId: string; feature: 'axis' | 'face_left' | 'face_right' | 'start' | 'end' | 'center' }

export interface Dimension extends BaseObject {
  type: 'dimension';
  refs: [ObjectAnchor, ObjectAnchor];
  /** cote motrice : la modifier déplace réellement la géométrie */
  driving: boolean;
  offset: Mm;
}

/** un fond calé (PDF, image) : référence de dessin, jamais modifié */
export interface Underlay extends BaseObject {
  type: 'underlay';
  fileKey: string;
  page?: number;
  transform: { scale: number; rotation: Radian; tx: Mm; ty: Mm };
  locked: boolean;
  opacity: number;
}

export type BuildingObject = Wall | Opening | Room | Dimension | Underlay;

export interface Floor {
  id: string;
  name: string;
  /** altitude du sol fini, par rapport au ±0,00 du projet */
  elevation: Mm;
  height: Mm;
  order: number;
  objects: Record<string, BuildingObject>;
}

export interface Building { id: string; name: string; floors: Floor[] }

export interface Site { id: string; underlays: Underlay[] }

export type ProjectPhase = 'ESQ' | 'APS' | 'APD' | 'PC' | 'PCM' | 'EXE';

export interface Project {
  id: string;
  /** version du schéma : toute évolution passe par une migration testée */
  schemaVersion: number;
  /** le chantier du CRM auquel ce projet appartient (lien, pas copie) */
  crmChantierId?: string;
  crmProspectId?: string;
  name: string;
  phase: ProjectPhase;
  units: 'mm';
  revision: number;
  site: Site;
  buildings: Building[];
}

export const SCHEMA_VERSION = 1;
