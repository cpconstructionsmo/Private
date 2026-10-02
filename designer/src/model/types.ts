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
  /* Champs facultatifs (bibliothèque d'ouvertures) : un projet qui ne les a
     pas reste valable tel quel — d'où l'absence de migration. Absents, le
     dessin prend les valeurs habituelles du genre (voir manoeuvreDe). */
  /** nombre de vantaux (1 à 4) */
  leaves?: number;
  /** la manœuvre : battant, coulissant, fixe, oscillo-battant, sectionnelle, basculante, enroulable */
  operation?: 'hinged' | 'sliding' | 'fixed' | 'tilt_turn' | 'sectional' | 'up_and_over' | 'roller';
  /** le modèle de la bibliothèque d'où vient l'ouverture (identifiant et libellé, pour mémoire) */
  catalogRef?: { id: string; label: string };
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
  /** la valeur imposée d'une cote motrice (mm) ; une cote non motrice se mesure */
  value?: Mm;
  offset: Mm;
}

/** une contrainte géométrique sur l'axe d'un ou deux murs droits : elle
 *  reste vraie après chaque déplacement (le solveur ajuste le reste, ou la
 *  modification est refusée — jamais violée en silence) */
export interface Constraint extends BaseObject {
  type: 'constraint';
  kind: 'horizontal' | 'vertical' | 'parallel' | 'perpendicular' | 'length' | 'angle';
  /** un mur (horizontal, vertical, longueur, angle) ou deux (parallèle, perpendiculaire) */
  walls: string[];
  /** longueur (mm) ou angle (radians, sens trigonométrique depuis l'axe des x) */
  value?: number;
}

/** un fond calé (PDF, image) : référence de dessin, jamais modifié.
 *  transform : du point de l'image (u vers la droite, v vers le BAS, en
 *  pixels ou points PDF) au plan (mm, y vers le haut) — voir building/fond.ts */
export interface Underlay extends BaseObject {
  type: 'underlay';
  fileKey: string;
  /** le nom du fichier, pour le reconnaître */
  name?: string;
  page?: number;
  transform: { scale: number; rotation: Radian; tx: Mm; ty: Mm };
  locked: boolean;
  opacity: number;
}

/** la toiture d'un niveau : seuls les CHOIX sont gardés (type, pente,
 *  débord, couverture) ; pans, faîtages et pignons se calculent depuis le
 *  contour des murs (building/toiture.ts), ils suivent donc chaque mur */
export interface Roof extends BaseObject {
  type: 'roof';
  /** à croupes (même pente sur tous les pans), deux pans à pignons, un pan, toit-terrasse */
  kind: 'hip' | 'gable' | 'shed' | 'flat';
  /** pente des pans, en degrés (sans objet pour un toit-terrasse) */
  pitch: number;
  /** débord au-delà du nu extérieur des murs */
  overhang: Mm;
  covering: 'tile' | 'slate' | 'zinc' | 'steel' | 'green' | 'gravel';
  /** deux pans : faîtage le long du grand côté (par défaut) ou du petit ; un pan : idem pour l'égout bas */
  ridge?: 'long' | 'short';
  /** un pan : l'égout bas passe de l'autre côté */
  flip?: boolean;
}

/** un meuble ou un équipement posé (lit, évier, WC…) : il meuble le plan et
 *  la 3D, il ne change ni les murs ni les surfaces */
export interface Furniture extends BaseObject {
  type: 'furniture';
  /** le centre, en plan */
  position: Point;
  /** l'orientation (sens trigonométrique) : à 0, le dos est vers −y, le devant vers +y */
  rotation: Radian;
  width: Mm;
  depth: Mm;
  height: Mm;
  /** le modèle de la bibliothèque (sa forme dit comment le dessiner) */
  catalogRef: { id: string; label: string };
}

/* Contraintes, valeur des cotes, toiture, mobilier s'ajoutent sans rien
   changer aux projets déjà enregistrés (un type de plus, un champ
   facultatif) : le schéma reste à la version 1, l'instantané figé des
   tests le vérifie. */
export type BuildingObject = Wall | Opening | Room | Dimension | Constraint | Underlay | Roof | Furniture;

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
