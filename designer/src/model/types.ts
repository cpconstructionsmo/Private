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
  /** virtual : une cloison fictive — une limite de pièce sans matière (une cuisine ouverte sur le séjour) :
   *  elle sépare les espaces au plan et aux surfaces, rien d'autre (ni 3D, ni exports, ni ouvertures) */
  role: 'exterior' | 'partition' | 'bearing_interior' | 'virtual';
  /** jamais « confirmed » sans document : par défaut, à valider (règle 5) */
  loadBearing: Qualified<boolean>;
  /** sa composition (catalogue/murs.ts) : les couches, dont la somme fait l'épaisseur ; absente : mur « sur mesure » */
  compositionRef?: string;
  /** le parement de sa face extérieure (catalogue/materiaux.ts), pour un mur de façade */
  finish?: string;
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
  /** le sol fini (catalogue/materiaux.ts) */
  floorFinish?: string;
  /** la peinture (ou la faïence) de ses murs, du sol au haut des murs */
  wallFinish?: string;
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
  /* L'égout et les eaux pluviales (facultatifs : un projet qui ne les a pas reste valable) */
  /** la finition de l'égout : chevrons apparents, caisson (sous-face habillée), génoise d'un à trois rangs */
  eavesFinish?: 'rafters' | 'boxed' | 'genoise_1' | 'genoise_2' | 'genoise_3';
  /** la gouttière : pendante demi-ronde, moulurée (havraise), chéneau ; « none » : sans gouttière */
  gutter?: 'half_round' | 'ogee' | 'box' | 'none';
  gutterMaterial?: 'zinc' | 'pvc' | 'aluminium' | 'copper';
  /** les descentes d'eaux pluviales : leur point sur l'égout, en plan */
  downpipes?: Point[];
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

/** un escalier, posé sur le niveau d'où il part : seuls ses CHOIX sont gardés
 *  (départ, sens, largeur, forme) ; marches, hauteurs et trémie se calculent
 *  depuis la hauteur à franchir jusqu'au niveau du dessus (building/escalier.ts) */
export interface Stair extends BaseObject {
  type: 'stair';
  /** le milieu du nez de la première marche */
  position: Point;
  /** le sens de la montée (sens trigonométrique) : à 0, on monte vers +y */
  rotation: Radian;
  /** l'emmarchement (largeur de passage) */
  width: Mm;
  /** droit, ou quart tournant avec palier (vers la gauche ou la droite en montant) */
  kind: 'straight' | 'quarter_left' | 'quarter_right';
  /** un giron imposé (sinon celui que donne la formule de Blondel) */
  going?: Mm;
}

/** un trait de coupe tracé à la main (A-A, B-B…) : seuls le trait, le sens du
 *  regard et le nom sont gardés ; la coupe se calcule (vue3d/coupe.ts). Posé
 *  sur un niveau, il tranche tout le bâtiment et se voit sur tous les plans. */
export interface SectionLine extends BaseObject {
  type: 'section';
  a: Point;
  b: Point;
  /** ce que montre la coupe : le côté gauche du trait (de a vers b) ou le droit */
  look: 'left' | 'right';
  /** « A », « B »… (la coupe s'appelle « A-A ») */
  name: string;
}

/** la parcelle (plan de masse, PCMI 2), dessinée dans le repère du plan : la
 *  maison ne bouge pas, c'est la parcelle qu'on place autour d'elle. Une seule
 *  par projet, posée sur le niveau le plus bas. Reculs, emprise et surface se
 *  calculent (building/terrain.ts) : rien n'est recopié. */
export interface Plot extends BaseObject {
  type: 'plot';
  /** la limite de propriété (polygone fermé, sans répéter le premier point) */
  contour: Point[];
  /** les côtés sur voie (alignement) : côté i = du sommet i au sommet i+1 */
  street: number[];
  streetName?: string;
  /** la référence cadastrale (« AB 123 ») */
  reference?: string;
  /** la direction du nord sur le plan (sens trigonométrique depuis le haut du plan) */
  north: Radian;
  /** l'altitude NGF du ±0,00 (sol fini du RDC), en mètres, si elle est connue */
  groundFloorNgf?: number;
  /** les points cotés du terrain naturel (plan du géomètre) : altitudes NGF en mètres, posées dans le repère du plan ;
   *  ils suivent la parcelle quand on l'implante (translation, rotation) */
  spotHeights?: { point: Point; ngf: number }[];
}

/** un aménagement extérieur du plan de masse, posé sur le niveau le plus bas : une clôture (ligne
 *  ouverte ou fermée) ou une surface (terrasse, allée, stationnement, espace vert) */
export interface Landscape extends BaseObject {
  type: 'landscape';
  kind: 'fence' | 'terrace' | 'path' | 'parking' | 'green';
  points: Point[];
  /** la ligne revient-elle à son premier point (toujours vrai pour une surface) */
  closed: boolean;
  /** l'aspect (catalogue/amenagements.ts) */
  finish: string;
  /** clôture : sa hauteur ; terrasse : son niveau fini sous le ±0,00 (mm, positif = plus bas) */
  height: Mm;
}

/** un point de prise de vue (plan de masse, PCMI 2) : d'où a été prise une photographie du dossier (insertion,
 *  environnement proche ou lointain) et vers où. Le formulaire du permis demande de les reporter au plan de
 *  masse. La photographie elle-même n'est pas dans le projet */
export interface Viewpoint extends BaseObject {
  type: 'viewpoint';
  /** l'appareil */
  a: Point;
  /** un point visé : la direction de la prise de vue */
  b: Point;
  /** la pièce du dossier que la photographie illustre */
  piece: 'PCMI 6' | 'PCMI 7' | 'PCMI 8';
}

/** une fenêtre de toit (châssis posé dans la pente), sur le niveau qui porte la toiture : son centre en plan,
 *  sa largeur (le long de l'égout) et sa hauteur (mesurée dans la pente). Le pan qui la porte est celui qui
 *  contient son centre : il se déduit, il n'est pas gardé (la toiture se recalcule avec les murs) */
export interface RoofWindow extends BaseObject {
  type: 'roof_window';
  center: Point;
  width: Mm;
  height: Mm;
}

/** une lucarne, sur le niveau qui porte la toiture : seuls ses CHOIX sont gardés — le milieu de sa façade en plan,
 *  sa largeur, la hauteur de sa façade au-dessus du toit, la pente de sa petite toiture, sa fenêtre. Le pan qui la
 *  porte, ses jouées, ses noues et sa couverture se déduisent (building/lucarnes.ts) : elle suit la toiture */
export interface Dormer extends BaseObject {
  type: 'dormer';
  /** jacobine (deux pans, fronton), capucine (trois pans, croupe en façade), rampante (un pan, moins pentu que le toit) */
  kind: 'gable' | 'hip' | 'shed';
  /** le milieu du bas de la façade, en plan (sur le pan) */
  center: Point;
  width: Mm;
  /** la hauteur de la façade, du toit à l'égout de la lucarne */
  height: Mm;
  /** la pente de sa toiture, en degrés */
  pitch: number;
  /** la fenêtre de la façade : largeur et hauteur */
  windowWidth: Mm;
  windowHeight: Mm;
}

/* Contraintes, valeur des cotes, toiture, mobilier, escaliers, coupes, parcelle, aménagements s'ajoutent sans rien
   changer aux projets déjà enregistrés (un type de plus, un champ
   facultatif) : le schéma reste à la version 1, l'instantané figé des
   tests le vérifie. */
/** une plateforme de terrassement : une surface mise à niveau (l'assise de la maison, une terrasse, un accès…),
 *  raccordée au terrain naturel par un talus ; posée sur le niveau le plus bas */
export interface Platform extends BaseObject {
  type: 'platform';
  contour: Point[];
  /** son niveau fini, par rapport au ±0,00 du projet (mm) */
  level: Mm;
  /** la pente du talus : horizontal pour 1 vertical (1,5 : talus « 3 pour 2 ») */
  slope: number;
  label?: string;
}

/** un réseau extérieur (VRD) : une canalisation ou une gaine, tracée point à point */
export interface Network extends BaseObject {
  type: 'network';
  kind: 'eu' | 'ep' | 'aep' | 'elec' | 'telecom' | 'gaz';
  points: Point[];
  /** matériau et diamètre, en clair (« PVC Ø 100 ») */
  spec?: string;
}

/** un équipement de réseau, ponctuel (regard, boîte de branchement, compteur, coffret, puisard…) */
export interface NetworkItem extends BaseObject {
  type: 'network_item';
  kind: 'regard' | 'branchement' | 'compteur_eau' | 'coffret_elec' | 'chambre_telecom' | 'coffret_gaz' | 'infiltration' | 'cuve_ep' | 'assainissement';
  position: Point;
  label?: string;
}

/** un arbre ou un arbuste du plan de masse : existant, à planter, ou à abattre */
export interface Tree extends BaseObject {
  type: 'tree';
  position: Point;
  /** le diamètre de la couronne (mm) */
  diameter: Mm;
  state: 'existing' | 'planted' | 'felled';
}

/** un poteau : une section (largeur × profondeur) posée sur le sol du niveau, de la hauteur du niveau */
export interface Column extends BaseObject {
  type: 'column';
  position: Point;
  width: Mm;
  depth: Mm;
  rotation: Radian;
  material: 'concrete' | 'steel' | 'wood';
}

/** une poutre : de a à b, sous le plafond du niveau ; « depth » est sa retombée sous le plafond */
export interface Beam extends BaseObject {
  type: 'beam';
  a: Point;
  b: Point;
  width: Mm;
  depth: Mm;
  material: 'concrete' | 'steel' | 'wood';
}

/** les fondations du bâtiment, posées sur le niveau le plus bas : seuls les CHOIX sont gardés (soubassement,
 *  sections, profondeurs) ; les semelles se calculent sous les murs porteurs et les poteaux (building/fondations.ts),
 *  elles suivent donc chaque mur. Leur dimensionnement relève de l'étude de sol et du bureau d'études : l'objet
 *  est toujours « be_validation », jamais présenté comme validé (règle 5) */
export interface Foundation extends BaseObject {
  type: 'foundation';
  /** vide sanitaire (plancher porté) ou terre-plein (dallage sur le sol) */
  kind: 'crawl_space' | 'slab_on_grade';
  /** la section des semelles filantes */
  footingWidth: Mm;
  footingHeight: Mm;
  /** la profondeur hors gel sous le terrain fini (elle dépend du département et de l'altitude) */
  frostDepth: Mm;
  /** la profondeur du bon sol, lue dans l'étude de sol (G2) ; absente : pas encore connue */
  bearingDepth?: Mm;
  /** la hauteur du vide sanitaire, du terrain au-dessous du plancher */
  crawlHeight: Mm;
  /** les semelles isolées sous les poteaux : côté et hauteur */
  padSize: Mm;
  padHeight: Mm;
  /** les trappes de visite du vide sanitaire (leur centre) */
  hatches: Point[];
}

export type BuildingObject = Wall | Opening | Room | Dimension | Constraint | Underlay | Roof | Furniture | Stair | SectionLine | Plot | Landscape | Viewpoint | RoofWindow | Platform | Network | NetworkItem | Tree | Column | Beam | Foundation | Dormer;

export interface Floor {
  id: string;
  name: string;
  /** altitude du sol fini, par rapport au ±0,00 du projet */
  elevation: Mm;
  height: Mm;
  order: number;
  objects: Record<string, BuildingObject>;
  /** ce qui le couvre et ce qui le porte (catalogue/planchers.ts) ; absents : non précisés */
  ceilingRef?: string;
  floorRef?: string;
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
