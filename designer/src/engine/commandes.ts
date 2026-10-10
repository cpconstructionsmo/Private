/* Les commandes : la seule porte d'entrée pour modifier le modèle
   (ADR-0005). Chacune VALIDE sa demande puis la traduit en opérations
   inversibles ; une commande refusée ne change rien et dit pourquoi.

   C'est la même interface qu'utilisera l'IA (Phase 4) : elle proposera des
   commandes, jamais des écritures directes.

   Provenance (règle 4) : chaque objet créé ou modifié porte la révision du
   projet et une source « utilisateur » datée. Un mur n'est jamais déclaré
   porteur « confirmé » sans document (règle 5) : par défaut, à contrôler.

   Déplacer un mur ou un sommet passe par le solveur (building/contraintes) :
   les murs qui s'y raccordent suivent, les contraintes et les cotes
   motrices restent vraies, ou la commande est refusée. */
import { cadastreInvalide, deplacerCadastre } from '../building/cadastre';
import { teinteOuvrageInvalide } from '../catalogue/menuiseries';
import { reglesPluInvalides } from '../building/plu';
import type { Canopy, Constraint, Dimension, Furniture, Mm, ObjectAnchor, Opening, Point, Project, Qualified, Landscape, Plot, Roof, SectionLine, Stair, Room, RoomUsage, SourceRef, SourceStatus, Underlay, Viewpoint, RoofWindow, Floor, Wall, Platform, Network, NetworkItem, Tree, Column, Beam, Foundation, Dormer, InfosDossier, TeinteOuvrage, ReglesPlu, FinishZone, PhaseOuvrage } from '../model/types';
import { trouverNiveau, trouverObjet } from '../model/projet';
import type { GenerateurId } from '../model/ids';
import { angleDe, distance, soustraire } from '../geometry/vecteur';
import { ANGLE_EQUERRE, EPAISSEUR_FICTIVE, EPS_COINCIDENCE } from '../geometry/tolerance';
import { compositionMur, epaisseurComposition, genreDuRole, roleDuGenre } from '../catalogue/murs';
import { compositionPlancher } from '../catalogue/planchers';
import { aireSignee } from '../geometry/polygon';
import { mesurerCote, resoudre, type Epingle } from '../building/contraintes';
import { calage, calageParDistance, TRANSFORMATION_NEUTRE } from '../building/fond';
import { geometrieFenetreToit } from '../building/fenetres-toit';
import { toitureDuNiveau } from '../building/toiture';
import { geometrieLucarne, LUCARNE_PAR_DEFAUT } from '../building/lucarnes';
import { distancePointSegment } from '../geometry/segment';
import { equerrer } from '../building/equerre';
import { mursDroits, mursFictifs } from '../building/murs';
import { appliquerTout, type Operation } from './operations';

export interface Contexte {
  /** qui agit (nom affiché, ou « IA » plus tard) */
  par: string;
  /** maintenant, en ISO 8601 */
  maintenant: () => string;
  id: GenerateurId;
  /** la révision que porteront les objets touchés */
  revision: number;
}

export type Resultat = { ok: true; operations: Operation[] } | { ok: false; erreurs: string[] };
const refus = (...erreurs: string[]): Resultat => ({ ok: false, erreurs });
const accepte = (operations: Operation[]): Resultat => ({ ok: true, operations });

const source = (c: Contexte, label: string): SourceRef => ({ kind: 'user', label, by: c.par, at: c.maintenant() });

/** provenance et statut d'un objet créé : saisie à la main, ou import (avec son document) */
function provenance(c: Contexte, o: Origine | undefined): { status: SourceStatus; sourceRefs: SourceRef[]; meta?: Record<string, unknown> } {
  if (!o) return { status: 'confirmed', sourceRefs: [source(c, 'Saisie')] };
  const ref: SourceRef = { kind: 'import', label: o.label, by: c.par, at: c.maintenant(), ...(o.document ? { documentId: o.document } : {}) };
  return { status: o.statut ?? 'to_check', sourceRefs: [ref], ...(o.meta ? { meta: structuredClone(o.meta) } : {}) };
}

/** « porteur » n'est jamais confirmé sans document (règle 5) */
function porteurQualifie(q: Qualified<boolean> | undefined, defaut: boolean): Qualified<boolean> {
  if (!q) return { value: defaut, status: 'to_check', missing: 'note de calcul ou plan de structure' };
  const document = (q.sourceRefs ?? []).some(r => r.kind === 'document' || r.kind === 'be');
  if (q.status === 'confirmed' && !document) return { ...structuredClone(q), status: 'to_check', missing: q.missing ?? 'note de calcul ou plan de structure' };
  return structuredClone(q);
}

/** d'où vient un objet créé autrement qu'à la main (import d'un plan) :
 *  sa source, son statut, et ce qui reste à vérifier (meta) — règle 4 */
export interface Origine { label: string; document?: string; statut?: SourceStatus; meta?: Record<string, unknown> }

export type Commande =
  /** composition : un mur du catalogue (catalogue/murs.ts) — son épaisseur est celle des couches, l'épaisseur donnée est ignorée ;
   *  rôle « virtual » : une cloison fictive, sans matière (épaisseur de calcul EPAISSEUR_FICTIVE) */
  | { type: 'creerMur'; niveau: string; a: Point; b: Point; epaisseur: Mm; hauteur?: Mm; role?: Wall['role']; justification?: Wall['justification']; id?: string; origine?: Origine; porteur?: Qualified<boolean>; composition?: string }
  | { type: 'deplacerMur'; id: string; a?: Point; b?: Point }
  /** composition : une autre composition (épaisseur et rôle suivent) ; null : « sur mesure ». Une épaisseur donnée seule rend le mur « sur mesure » */
  | { type: 'modifierMur'; id: string; epaisseur?: Mm; hauteur?: Mm; role?: Wall['role']; justification?: Wall['justification']; finition?: string | null; composition?: string | null;
      /** les parties de la façade habillées d'un autre parement (toutes, elles remplacent les précédentes) ; null ou [] : aucune */
      decors?: FinishZone[] | null;
      /** existant (conservé ou à démolir) ; null : à construire (ADR-0007) */
      phase?: PhaseOuvrage | null }
  | { type: 'creerOuverture'; mur: string; position: Mm; largeur: Mm; hauteur: Mm; allege?: Mm; genre: Opening['kind']; sens?: Opening['swing']; origine?: Origine; vantaux?: number; manoeuvre?: Opening['operation']; modele?: Opening['catalogRef'] }
  /** volet : null l'efface */
  | { type: 'modifierOuverture'; id: string; position?: Mm; largeur?: Mm; hauteur?: Mm; allege?: Mm; genre?: Opening['kind']; sens?: Opening['swing']; vantaux?: number; manoeuvre?: Opening['operation']; modele?: Opening['catalogRef']; volet?: Opening['shutter'] | null;
      /** existante (conservée, ou à boucher / déposer) ; null : percement ou baie du projet (ADR-0007) */
      phase?: PhaseOuvrage | null }
  | { type: 'creerPiece'; niveau: string; point: Point; nom: string; usage: RoomUsage; humide?: boolean; origine?: Origine }
  | { type: 'modifierPiece'; id: string; nom?: string; usage?: RoomUsage; humide?: boolean; point?: Point; sol?: string | null; murs?: string | null }
  | { type: 'supprimer'; id: string }
  | { type: 'ajouterNiveau'; batiment: string; nom: string; altitude: Mm; hauteur: Mm; id?: string }
  | { type: 'renommerProjet'; nom: string }
  /** les informations du dossier : les champs donnés remplacent les anciens ; '' ou null efface un champ */
  | { type: 'modifierDossier'; champs: { [K in keyof InfosDossier]?: InfosDossier[K] | null } }
  /** déplacer une extrémité de mur : tous les murs qui y aboutissent suivent */
  | { type: 'deplacerSommet'; niveau: string; de: Point; vers: Point }
  /** redresser à l'équerre les murs presque d'équerre (ceux qu'on cite, ou tout le niveau) — voir building/equerre.ts */
  | { type: 'equerrerMurs'; niveau: string; murs?: string[] }
  | { type: 'ajouterContrainte'; niveau: string; genre: Constraint['kind']; murs: string[]; valeur?: number }
  | { type: 'modifierContrainte'; id: string; valeur: number }
  | { type: 'creerCote'; niveau: string; refs: [ObjectAnchor, ObjectAnchor]; motrice?: boolean; decalage?: Mm }
  | { type: 'modifierCote'; id: string; valeur?: Mm; motrice?: boolean; decalage?: Mm }
  /** plafond, plancher : une composition de catalogue/planchers.ts ; null : non précisé */
  | { type: 'modifierNiveau'; id: string; nom?: string; altitude?: Mm; hauteur?: Mm; plafond?: string | null; plancher?: string | null }
  | { type: 'supprimerNiveau'; id: string }
  /** un fond ; un tracé produit par le logiciel (plan source d'un import) arrive déjà calé, et peut être verrouillé d'emblée */
  | { type: 'ajouterFond'; niveau: string; fichier: string; nom?: string; page?: number; calage?: Underlay['transform']; verrouille?: boolean; opacite?: number; origine?: Origine }
  /** caler : deux points de l'image et leur place sur le plan, ou leur distance réelle */
  | { type: 'calerFond'; id: string; image: [Point, Point]; plan?: [Point, Point]; distance?: Mm }
  | { type: 'modifierFond'; id: string; verrouille?: boolean; opacite?: number }
  /** la toiture d'un niveau (une seule) : ses choix ; la géométrie se calcule */
  | { type: 'creerToiture'; niveau: string; genre: Roof['kind']; pente: number; debord: Mm; couverture: Roof['covering']; faitage?: Roof['ridge']; inverse?: boolean; talon?: Mm }
  /** egout, gouttiere, matiereGouttiere : null efface le choix ; descentes : la liste entière (elle remplace la précédente) */
  | { type: 'modifierToiture'; id: string; genre?: Roof['kind']; pente?: number; debord?: Mm; couverture?: Roof['covering']; faitage?: Roof['ridge']; inverse?: boolean;
      /** le talon de la charpente (mm, de 0 à 80 cm) */
      talon?: Mm;
      egout?: Roof['eavesFinish'] | null; gouttiere?: Roof['gutter'] | null; matiereGouttiere?: Roof['gutterMaterial'] | null; descentes?: Point[] }
  /** un meuble ou un équipement de la bibliothèque, posé sur un niveau */
  | { type: 'creerMeuble'; niveau: string; modele: Furniture['catalogRef']; position: Point; rotation: number; largeur: Mm; profondeur: Mm; hauteur: Mm }
  | { type: 'modifierMeuble'; id: string; position?: Point; rotation?: number; largeur?: Mm; profondeur?: Mm; hauteur?: Mm }
  /** un escalier, posé sur le niveau d'où il part ; ses marches et sa trémie se calculent */
  | { type: 'creerEscalier'; niveau: string; genre: Stair['kind']; position: Point; rotation: number; largeur: Mm; giron?: Mm }
  | { type: 'modifierEscalier'; id: string; genre?: Stair['kind']; position?: Point; rotation?: number; largeur?: Mm; giron?: Mm | null }
  /** un trait de coupe (A-A…) ; sans nom, la première lettre libre du projet */
  | { type: 'creerCoupe'; niveau: string; a: Point; b: Point; regard?: SectionLine['look']; nom?: string }
  | { type: 'modifierCoupe'; id: string; a?: Point; b?: Point; regard?: SectionLine['look']; nom?: string }
  | { type: 'creerPointDeVue'; niveau: string; a: Point; b: Point; piece?: Viewpoint['piece'] }
  | { type: 'creerFenetreToit'; niveau: string; centre: Point; largeur?: Mm; hauteur?: Mm }
  | { type: 'modifierFenetreToit'; id: string; centre?: Point; largeur?: Mm; hauteur?: Mm }
  /** une lucarne sur la toiture du niveau ; sans valeurs : celles de LUCARNE_PAR_DEFAUT, la pente du toit (jacobine, capucine) */
  | { type: 'creerLucarne'; niveau: string; genre: Dormer['kind']; centre: Point; largeur?: Mm; hauteur?: Mm; pente?: number; fenetreLargeur?: Mm; fenetreHauteur?: Mm }
  | { type: 'modifierLucarne'; id: string; genre?: Dormer['kind']; centre?: Point; largeur?: Mm; hauteur?: Mm; pente?: number; fenetreLargeur?: Mm; fenetreHauteur?: Mm }
  | { type: 'modifierPointDeVue'; id: string; a?: Point; b?: Point; piece?: Viewpoint['piece'] }
  /** la parcelle (une par projet) ; « nomVoie », « reference » vides : effacés */
  | { type: 'creerParcelle'; niveau: string; contour: Point[]; voies?: number[]; nomVoie?: string; reference?: string; nord?: number; altitudeRdc?: number; origine?: Origine; plu?: ReglesPlu;
      /** le relevé, d'emblée (plan du géomètre) */
      altitudesTerrain?: { point: Point; ngf: number }[] }
  /** un aménagement extérieur (clôture, terrasse, allée, stationnement, espace vert) */
  /** le terrassement et les réseaux du terrain (building/terrassement.ts) : posés sur le niveau le plus bas */
  | { type: 'creerPlateforme'; niveau: string; contour: Point[]; niveauFini: Mm; talus: number; nom?: string }
  | { type: 'modifierPlateforme'; id: string; contour?: Point[]; niveauFini?: Mm; talus?: number; nom?: string | null }
  | { type: 'creerReseau'; niveau: string; genre: Network['kind']; points: Point[]; spec?: string }
  | { type: 'modifierReseau'; id: string; genre?: Network['kind']; points?: Point[]; spec?: string | null }
  | { type: 'creerEquipement'; niveau: string; genre: NetworkItem['kind']; position: Point; nom?: string }
  | { type: 'modifierEquipement'; id: string; genre?: NetworkItem['kind']; position?: Point; nom?: string | null }
  | { type: 'creerArbre'; niveau: string; position: Point; diametre: Mm; etat: Tree['state'] }
  /** un couvert (porche, auvent) accolé à la maison : la toiture le couvre ; soutenu, il compte dans l'emprise */
  | { type: 'creerCouvert'; niveau: string; contour: Point[]; nom?: string; soutenu?: boolean; origine?: Origine }
  | { type: 'modifierCouvert'; id: string; contour?: Point[]; nom?: string; soutenu?: boolean }
  | { type: 'creerPoteau'; niveau: string; position: Point; largeur: Mm; profondeur: Mm; rotation?: number; matiere: Column['material'] }
  | { type: 'modifierPoteau'; id: string; position?: Point; largeur?: Mm; profondeur?: Mm; rotation?: number; matiere?: Column['material'] }
  | { type: 'creerPoutre'; niveau: string; a: Point; b: Point; largeur: Mm; retombee: Mm; matiere: Beam['material'] }
  | { type: 'modifierPoutre'; id: string; a?: Point; b?: Point; largeur?: Mm; retombee?: Mm; matiere?: Beam['material'] }
  | { type: 'modifierArbre'; id: string; position?: Point; diametre?: Mm; etat?: Tree['state'] }
  /** les fondations du bâtiment (une seule, sur le niveau le plus bas) : ses choix ; les semelles se calculent.
   *  Une valeur absente prend celle de FONDATIONS_PAR_DEFAUT (à valider par l'étude de sol et le bureau d'études) */
  | { type: 'creerFondations'; niveau: string; genre: Foundation['kind']; largeur?: Mm; hauteur?: Mm; horsGel?: Mm; bonSol?: Mm; hauteurVide?: Mm; coteIsolee?: Mm; hauteurIsolee?: Mm }
  /** bonSol null : pas encore connu ; trappes : la liste entière (elle remplace la précédente) */
  | { type: 'modifierFondations'; id: string; genre?: Foundation['kind']; largeur?: Mm; hauteur?: Mm; horsGel?: Mm; bonSol?: Mm | null; hauteurVide?: Mm; coteIsolee?: Mm; hauteurIsolee?: Mm; trappes?: Point[] }
  | { type: 'creerAmenagement'; niveau: string; genre: Landscape['kind']; points: Point[]; ferme?: boolean; finition: string; hauteur: Mm }
  | { type: 'modifierAmenagement'; id: string; points?: Point[]; ferme?: boolean; finition?: string; hauteur?: Mm }
  | { type: 'modifierParcelle'; id: string; contour?: Point[]; voies?: number[]; nomVoie?: string; reference?: string; nord?: number; altitudeRdc?: number | null;
      /** les points cotés du terrain naturel, en entier (la liste remplace la précédente) */
      altitudesTerrain?: { point: Point; ngf: number }[];
      /** le fond cadastral calé (building/cadastre.ts) ; null le retire */
      cadastre?: Plot['cadastre'] | null;
      /** le terrain fini aux abords, par rapport au ±0,00 (mm, de −3 m à +0,5 m) ; null le retire */
      terrainFini?: Mm | null;
      /** les règles du PLU (building/plu.ts), en entier ; null les retire */
      plu?: ReglesPlu | null };

const fini = (...v: number[]): boolean => v.every(Number.isFinite);
const ptFini = (p: Point): boolean => fini(p.x, p.y);

const longueurMur = (w: Wall): Mm => ('a' in w.axis ? distance(w.axis.a, w.axis.b) : Math.abs(w.axis.arc.end - w.axis.arc.start) * w.axis.arc.radius);

/** les choix d'une toiture : pente de 5 à 75° (sans objet pour un toit-terrasse), débord de 0 à 2 m */
function toitureInvalide(genre: Roof['kind'], pente: number, debord: Mm): string | null {
  if (!fini(pente, debord)) return 'pente ou débord invalide';
  if (genre !== 'flat' && !(pente >= 5 && pente <= 75)) return 'pente de 5 à 75°';
  if (!(debord >= 0 && debord <= 2_000)) return 'débord de 0 à 2 m';
  return null;
}

/** les cotes d'un meuble : largeur et profondeur de 1 cm à 20 m, hauteur de 0 à 5 m */
function meubleInvalide(l: Mm, p: Mm, h: Mm): string | null {
  if (!fini(l, p, h)) return 'dimensions invalides';
  if (!(l >= 10 && l <= 20_000 && p >= 10 && p <= 20_000)) return 'largeur et profondeur de 1 cm à 20 m';
  if (!(h >= 0 && h <= 5_000)) return 'hauteur de 0 à 5 m';
  return null;
}

/** largeur d'un escalier de 60 cm à 2 m ; giron de 18 à 40 cm */
function escalierInvalide(largeur: Mm, giron?: Mm | null): string | null {
  if (!fini(largeur) || !(largeur >= 600 && largeur <= 2_000)) return 'largeur d’escalier de 60 cm à 2 m';
  if (giron !== undefined && giron !== null && !(fini(giron) && giron >= 180 && giron <= 400)) return 'giron de 18 à 40 cm';
  return null;
}

/** les noms des traits de coupe du projet (sauf celui-ci) */
const nomsDeCoupes = (p: Project, sauf?: string): Set<string> =>
  new Set(p.buildings.flatMap(b => b.floors).flatMap(f => Object.values(f.objects)).flatMap(o => (o.type === 'section' && o.id !== sauf ? [o.name] : [])));

/** un trait de coupe : assez long pour se lire, un nom court et libre */
function coupeInvalide(p: Project, a: Point, b: Point, nom: string, sauf?: string): string | null {
  if (!ptFini(a) || !ptFini(b)) return 'position invalide';
  if (distance(a, b) < 500) return 'trait de coupe trop court (50 cm au moins)';
  if (!/^[A-Za-z0-9]{1,3}$/.test(nom)) return 'nom de coupe : 1 à 3 lettres ou chiffres';
  if (nomsDeCoupes(p, sauf).has(nom)) return 'une coupe ' + nom + '-' + nom + ' existe déjà';
  return null;
}

/** une fenêtre de toit : une taille de châssis plausible, entière sur un pan de la toiture du niveau */
function fenetreToitInvalide(f: Floor, centre: Point, largeur: Mm, hauteur: Mm): string | null {
  if (!ptFini(centre) || !fini(largeur) || !fini(hauteur)) return 'position ou dimensions invalides';
  if (largeur < 400 || largeur > 2_000) return 'largeur de fenêtre de toit de 40 cm à 2 m';
  if (hauteur < 500 || hauteur > 2_000) return 'hauteur de fenêtre de toit (dans la pente) de 50 cm à 2 m';
  const g = geometrieFenetreToit(f, { center: centre, width: largeur, height: hauteur });
  return g.ok ? null : g.raison;
}

export const PIECES_POINT_DE_VUE: readonly Viewpoint['piece'][] = ['PCMI 7', 'PCMI 8', 'PCMI 6'];

/** un point de prise de vue : une direction lisible (50 cm au moins entre l'appareil et le point visé), une pièce connue */
function pointDeVueInvalide(a: Point, b: Point, piece: string): string | null {
  if (!ptFini(a) || !ptFini(b)) return 'position invalide';
  if (distance(a, b) < 500) return 'direction de prise de vue trop courte (50 cm au moins)';
  if (!PIECES_POINT_DE_VUE.includes(piece as Viewpoint['piece'])) return 'pièce du dossier inconnue : PCMI 6, 7 ou 8';
  return null;
}

/** un aménagement : une ligne de deux points au moins (clôture), une surface de trois et d'1 m² au moins */
function amenagementInvalide(genre: Landscape['kind'], points: Point[], ferme: boolean, finition: string, hauteur: Mm): string | null {
  if (!points.every(ptFini)) return 'position invalide';
  if (points.some((q, i) => i > 0 && distance(q, points[i - 1]!) < 50)) return 'deux points confondus';
  if (genre === 'fence' ? points.length < 2 : points.length < 3) return genre === 'fence' ? 'une clôture a deux points au moins' : 'une surface a trois sommets au moins';
  if (genre !== 'fence' || ferme) {
    let a = 0; points.forEach((q, i) => { const r = points[(i + 1) % points.length]!; a += q.x * r.y - r.x * q.y });
    if (genre !== 'fence' && Math.abs(a) / 2 < 1e6) return 'surface de moins d’1 m²';
  }
  if (!matiereValide(finition)) return 'aspect inconnu';
  if (!fini(hauteur) || hauteur < 0 || hauteur > 4_000) return 'hauteur de 0 à 4 m';
  return null;
}

/** une limite de parcelle : 3 sommets au moins, distincts, une surface d'au moins 10 m², des côtés sur voie qui existent */
function parcelleInvalide(contour: Point[], voies: number[], nord: number, altitude?: number | null): string | null {
  if (contour.length < 3 || !contour.every(ptFini)) return 'limite de parcelle : trois sommets au moins';
  if (contour.some((q, i) => distance(q, contour[(i + 1) % contour.length]!) < 100)) return 'limite de parcelle : côté de moins de 10 cm';
  let a = 0;
  contour.forEach((q, i) => { const r = contour[(i + 1) % contour.length]!; a += q.x * r.y - r.x * q.y });
  if (Math.abs(a) / 2 < 10e6) return 'parcelle de moins de 10 m²';
  if (!voies.every(i => Number.isInteger(i) && i >= 0 && i < contour.length)) return 'côté sur voie inconnu';
  if (!fini(nord)) return 'direction du nord invalide';
  if (altitude !== undefined && altitude !== null && !(fini(altitude) && altitude > -100 && altitude < 5_000)) return 'altitude NGF invalide';
  return null;
}

/** des points cotés du terrain naturel : positions et altitudes NGF plausibles, deux points jamais confondus */
function altitudesInvalides(A: { point: Point; ngf: number }[]): string | null {
  if (A.length > 300) return 'trop de points cotés (300 au plus)';
  for (const x of A) if (!ptFini(x.point) || !fini(x.ngf) || x.ngf <= -100 || x.ngf >= 5_000) return 'point coté invalide (altitude NGF en mètres)';
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) if (distance(A[i]!.point, A[j]!.point) < 100) return 'deux points cotés à moins de 10 cm l’un de l’autre';
  return null;
}

/** la limite déplacée d'un bloc (translation, rotation) : la transformation qui fait passer de l'une à l'autre, ou null si elle a changé de forme */
function deplacementRigide(avant: Point[], apres: Point[]): ((p: Point) => Point) | null {
  if (avant.length !== apres.length || avant.length < 2) return null;
  const a0 = avant[0]!, a1 = avant[1]!, b0 = apres[0]!, b1 = apres[1]!;
  const t = Math.atan2(b1.y - b0.y, b1.x - b0.x) - Math.atan2(a1.y - a0.y, a1.x - a0.x), c = Math.cos(t), s = Math.sin(t);
  const f = (p: Point): Point => { const x = p.x - a0.x, y = p.y - a0.y; return { x: b0.x + x * c - y * s, y: b0.y + x * s + y * c } };
  return avant.every((q, i) => distance(f(q), apres[i]!) < 1) ? f : null;
}

/** un identifiant de matériau : court, lisible (le catalogue peut grandir : un identifiant inconnu se dessine par défaut) */
const matiereValide = (id: string): boolean => /^[a-z0-9-]{1,60}$/.test(id);

const vantauxValides = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 4;
const PHASES = new Set<PhaseOuvrage>(['existing', 'demolished']);

/** au plus 8 décors par mur */
const DECORS_MAX = 8;
/** les décors d'un mur de longueur L : dans le mur, 10 cm au moins chacun, un parement connu, sans se chevaucher */
function decorsInvalides(Z: FinishZone[], L: Mm): string | null {
  if (Z.length > DECORS_MAX) return 'au plus ' + DECORS_MAX + ' décors par mur';
  for (const z of Z) {
    if (!fini(z.from, z.to)) return 'position du décor invalide';
    if (z.from < -1 || z.to > L + 1) return 'le décor sort du mur';
    if (z.to - z.from < 100) return 'un décor fait au moins 10 cm';
    if (typeof z.finish !== 'string' || !matiereValide(z.finish)) return 'parement du décor inconnu';
    if (z.label !== undefined && (typeof z.label !== 'string' || z.label.length > 80)) return 'nom du décor : 80 caractères au plus';
  }
  const T = [...Z].sort((a, b) => a.from - b.from);
  for (let i = 1; i < T.length; i++) if (T[i]!.from < T[i - 1]!.to - 1) return 'deux décors se chevauchent';
  return null;
}

/** une ouverture tient-elle dans son mur ? (position = milieu de l'ouverture, depuis l'origine du mur) */
function horsDuMur(position: Mm, largeur: Mm, longueur: Mm): string | null {
  if (largeur <= 0) return 'la largeur doit être positive';
  if (position - largeur / 2 < -EPS_COINCIDENCE || position + largeur / 2 > longueur + EPS_COINCIDENCE)
    return 'l’ouverture (' + largeur + ' mm centrée à ' + Math.round(position) + ' mm) dépasse du mur (' + Math.round(longueur) + ' mm)';
  return null;
}

/** les ouvertures portées par un mur */
function ouverturesDe(p: Project, murId: string): { o: Opening; niveau: string }[] {
  const out: { o: Opening; niveau: string }[] = [];
  for (const b of p.buildings) for (const f of b.floors) for (const o of Object.values(f.objects))
    if (o.type === 'opening' && o.hostWallId === murId) out.push({ o, niveau: f.id });
  return out;
}

/** appliquer des opérations, puis épingler des sommets et laisser le solveur
    ajuster les murs du niveau ; refusé si une contrainte, une cote motrice
    ou une ouverture ne peut plus être respectée */
function ajuster(p: Project, niveauId: string, avant: Operation[], epingles: Epingle[], c: Contexte, principaux: readonly string[] = []): Resultat {
  const p1 = appliquerTout(p, avant);
  const n = trouverNiveau(p1, niveauId);
  if (!n) return refus('niveau introuvable');
  const r = resoudre(n.floor, epingles);
  if (!r.ok) return refus(...r.erreurs);
  const ops = [...avant];
  for (const [id, axe] of Object.entries(r.axes)) {
    const w = n.floor.objects[id] as Wall;
    const L = distance(axe.a, axe.b);
    for (const { o } of ouverturesDe(p1, id)) {
      const e = horsDuMur(o.offset, o.width, L);
      if (e) return refus('le mur modifié ne porte plus son ouverture : ' + e);
    }
    ops.push({ type: 'objet.modifier', niveau: niveauId, id, avant: { axis: w.axis, revision: w.revision, sourceRefs: w.sourceRefs },
      apres: { axis: axe, revision: c.revision, sourceRefs: [...w.sourceRefs, source(c, principaux.includes(id) ? 'Modification' : 'Ajusté (raccords, contraintes)')] } });
  }
  /* les cloisons fictives ne sont pas dans le réseau : un bout posé sur un sommet qui bouge le suit */
  const deplaces: [Point, Point][] = Object.entries(r.axes).flatMap(([id, axe]) => {
    const w = n.floor.objects[id] as Wall;
    return 'a' in w.axis ? [[w.axis.a, axe.a], [w.axis.b, axe.b]] as [Point, Point][] : [];
  });
  for (const v of mursFictifs(n.floor)) {
    const suit = (q: Point) => deplaces.find(([de]) => distance(de, q) <= EPS_COINCIDENCE)?.[1] ?? q;
    const a = suit(v.axis.a), b = suit(v.axis.b);
    if (a === v.axis.a && b === v.axis.b) continue;
    if (distance(a, b) <= EPS_COINCIDENCE) return refus('une cloison fictive s’écraserait');
    ops.push({ type: 'objet.modifier', niveau: niveauId, id: v.id, avant: { axis: v.axis, revision: v.revision }, apres: { axis: { a: { ...a }, b: { ...b } }, revision: c.revision } });
  }
  return accepte(ops);
}

/** les sommets qu'un ancrage de cote tient fixes */
function sommetsDe(p: Project, x: ObjectAnchor): Point[] {
  const t = trouverObjet(p, x.objectId);
  if (!t || t.objet.type !== 'wall' || !('a' in t.objet.axis)) return [];
  const { a, b } = t.objet.axis;
  return x.feature === 'start' ? [a] : x.feature === 'end' ? [b] : [a, b];
}

/** une lucarne : des dimensions plausibles, entière sur un pan de la toiture du niveau */
function lucarneInvalide(f: Floor, o: Pick<Dormer, 'kind' | 'center' | 'width' | 'height' | 'pitch' | 'windowWidth' | 'windowHeight'>): string | null {
  if (!['gable', 'hip', 'shed'].includes(o.kind)) return 'lucarne inconnue';
  if (!ptFini(o.center) || !fini(o.width, o.height, o.pitch, o.windowWidth, o.windowHeight)) return 'position ou dimensions invalides';
  if (o.width < 800 || o.width > 4_000) return 'largeur de lucarne de 80 cm à 4 m';
  if (o.height < 800 || o.height > 3_000) return 'hauteur de façade de lucarne de 80 cm à 3 m';
  if (o.pitch < 5 || o.pitch > 70) return 'pente de lucarne de 5 à 70°';
  if (o.windowWidth < 300 || o.windowHeight < 300) return 'fenêtre de lucarne de 30 cm au moins';
  const g = geometrieLucarne(f, o);
  return g.ok ? null : g.raison;
}

/** l'arase d'un mur extérieur au-dessus de la hauteur sous plafond (plafond suspendu sous l'entrait des fermettes) :
 *  2,50 m sous plafond donnent 2,70 m de mur, comme aux dossiers du cabinet (à confirmer au projet). La charpente et la
 *  couverture posées dessus sont le talon de la toiture (building/toiture.ts) : l'égout se lit au-dessus */
export const REHAUSSE_ARASE: Mm = 200;

/** la hauteur d'un mur extérieur tracé sans hauteur : jusqu'à l'arase (hauteur sous plafond + REHAUSSE_ARASE),
 *  sans dépasser le plancher du niveau du dessus s'il y en a un (ses propres murs prennent la suite) */
export function hauteurMurExterieur(p: Project, f: Floor): Mm {
  const dessus = p.buildings.flatMap(b => b.floors).filter(x => x.elevation > f.elevation).map(x => x.elevation - f.elevation);
  return Math.min(f.height + REHAUSSE_ARASE, ...dessus);
}

/** les valeurs proposées d'emblée : des ordres de grandeur d'une maison individuelle, jamais une étude
 *  (l'objet reste « be_validation ») ; la profondeur hors gel se lit sur la carte du département */
export const FONDATIONS_PAR_DEFAUT = { largeur: 500, hauteur: 250, horsGel: 800, hauteurVide: 600, coteIsolee: 800, hauteurIsolee: 300 } as const;

/** des fondations plausibles : chaque valeur dans un ordre de grandeur de maison individuelle */
function fondationsInvalides(v: { largeur: Mm; hauteur: Mm; horsGel: Mm; bonSol?: Mm | null | undefined; hauteurVide: Mm; coteIsolee: Mm; hauteurIsolee: Mm; trappes: Point[] }): string | null {
  if (!fini(v.largeur, v.hauteur, v.horsGel, v.hauteurVide, v.coteIsolee, v.hauteurIsolee)) return 'valeur invalide';
  if (!(v.largeur >= 300 && v.largeur <= 2_000)) return 'largeur de semelle de 30 cm à 2 m';
  if (!(v.hauteur >= 150 && v.hauteur <= 1_500)) return 'hauteur de semelle de 15 cm à 1,50 m';
  if (!(v.horsGel >= 300 && v.horsGel <= 2_000)) return 'profondeur hors gel de 30 cm à 2 m';
  if (v.bonSol !== undefined && v.bonSol !== null && !(fini(v.bonSol) && v.bonSol >= 0 && v.bonSol <= 10_000)) return 'profondeur du bon sol de 0 à 10 m';
  if (!(v.hauteurVide >= 200 && v.hauteurVide <= 2_000)) return 'hauteur de vide sanitaire de 20 cm à 2 m';
  if (!(v.coteIsolee >= 300 && v.coteIsolee <= 4_000)) return 'semelle isolée de 30 cm à 4 m de côté';
  if (!(v.hauteurIsolee >= 150 && v.hauteurIsolee <= 1_500)) return 'hauteur de semelle isolée de 15 cm à 1,50 m';
  if (v.trappes.length > 20 || !v.trappes.every(ptFini)) return 'trappes de visite invalides';
  return null;
}

const VOLETS = new Set<string>(['roller_motorized', 'roller_manual', 'hinged']);
const CHAMPS_DOSSIER = new Set(['maitreOuvrage', 'adresseMaitreOuvrage', 'lieuConstruction', 'referencesCadastrales', 'surfaceTerrain', 'couverture', 'chauffage', 'divers', 'zoneSismique', 'modifications', 'menuiseries', 'porteEntree', 'porteGarage']);

const GENRES_UN_MUR: readonly Constraint['kind'][] = ['horizontal', 'vertical', 'length', 'angle'];
const GENRES_RESEAU: readonly Network['kind'][] = ['eu', 'ep', 'aep', 'elec', 'telecom', 'gaz'];
const GENRES_EQUIPEMENT: readonly NetworkItem['kind'][] = ['regard', 'branchement', 'compteur_eau', 'coffret_elec', 'chambre_telecom', 'coffret_gaz', 'infiltration', 'cuve_ep', 'assainissement'];

export function traduire(p: Project, cmd: Commande, c: Contexte): Resultat {
  switch (cmd.type) {
    case 'creerMur': {
      const n = trouverNiveau(p, cmd.niveau);
      if (!n) return refus('niveau introuvable');
      if (!ptFini(cmd.a) || !ptFini(cmd.b) || !fini(cmd.epaisseur)) return refus('coordonnées invalides');
      if (distance(cmd.a, cmd.b) <= EPS_COINCIDENCE) return refus('un mur doit avoir une longueur');
      if (!(cmd.epaisseur > 0)) return refus('l’épaisseur doit être positive');
      /* un identifiant fourni (import : les ouvertures s'y rattachent dans la même transaction) doit être neuf */
      if (cmd.id !== undefined && (!cmd.id.trim() || trouverObjet(p, cmd.id))) return refus('identifiant de mur déjà pris');
      const k = compositionMur(cmd.composition);
      if (cmd.composition !== undefined && !k) return refus('composition de mur inconnue');
      if (k && cmd.role === 'virtual') return refus('une cloison fictive n’a pas de composition');
      const role: Wall['role'] = cmd.role ?? (k ? roleDuGenre(k.genre) : 'partition');
      if (k && genreDuRole(role) !== k.genre) return refus('« ' + k.libelle + ' » ne convient pas à ce type de mur');
      const mur: Wall = {
        id: cmd.id ?? c.id(), type: 'wall', floorId: cmd.niveau, ...provenance(c, cmd.origine), revision: c.revision,
        axis: { a: { ...cmd.a }, b: { ...cmd.b } }, thickness: role === 'virtual' ? EPAISSEUR_FICTIVE : k ? epaisseurComposition(k) : cmd.epaisseur,
        justification: role === 'virtual' ? 'center' : cmd.justification ?? 'center',
        height: cmd.hauteur ?? (role === 'exterior' ? hauteurMurExterieur(p, n.floor) : n.floor.height), baseOffset: 0, role,
        loadBearing: porteurQualifie(cmd.porteur, role === 'exterior'),
        ...(k ? { compositionRef: k.id } : {}),
      };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: mur }]);
    }
    case 'deplacerMur':
    case 'modifierMur': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'wall') return refus('mur introuvable');
      const w = t.objet;
      const avant: Record<string, unknown> = { revision: w.revision, sourceRefs: w.sourceRefs };
      const apres: Record<string, unknown> = { revision: c.revision, sourceRefs: [...w.sourceRefs, source(c, 'Modification')] };
      if (cmd.type === 'deplacerMur') {
        if (!('a' in w.axis)) return refus('mur courbe : déplacement à venir');
        const a = cmd.a ?? w.axis.a, b = cmd.b ?? w.axis.b;
        if (!ptFini(a) || !ptFini(b)) return refus('coordonnées invalides');
        if (distance(a, b) <= EPS_COINCIDENCE) return refus('un mur doit avoir une longueur');
        /* une cloison fictive n'est pas dans le réseau des murs : elle se déplace seule */
        if (w.role === 'virtual') { avant['axis'] = w.axis; apres['axis'] = { a: { ...a }, b: { ...b } }; return accepte([{ type: 'objet.modifier', niveau: t.niveauId, id: w.id, avant, apres }]) }
        /* les deux extrémités sont épinglées ; les murs raccordés suivent */
        return ajuster(p, t.niveauId, [], [{ de: w.axis.a, vers: a }, { de: w.axis.b, vers: b }], c, [w.id]);
      } else {
        if (cmd.epaisseur !== undefined && !(cmd.epaisseur > 0)) return refus('l’épaisseur doit être positive');
        /* la composition décide de l'épaisseur (et du rôle) ; une épaisseur saisie à la main la quitte ; une cloison fictive n'en a pas */
        const role = cmd.role ?? w.role;
        let k = cmd.composition === undefined ? compositionMur(w.compositionRef) : compositionMur(cmd.composition);
        if (cmd.composition && !k) return refus('composition de mur inconnue');
        if (cmd.composition && role === 'virtual') return refus('une cloison fictive n’a pas de composition');
        if (cmd.composition === undefined && (cmd.epaisseur !== undefined || role === 'virtual' || (k && genreDuRole(role) !== k.genre))) k = undefined;
        const roleFinal: Wall['role'] = cmd.composition && k && cmd.role === undefined ? roleDuGenre(k.genre) : role;
        if (k && genreDuRole(roleFinal) !== k.genre) return refus('« ' + k.libelle + ' » ne convient pas à ce type de mur');
        const epaisseur = roleFinal === 'virtual' ? EPAISSEUR_FICTIVE : k ? epaisseurComposition(k) : cmd.epaisseur ?? (w.role === 'virtual' ? 70 : undefined);
        if ((w.compositionRef ?? null) !== (k?.id ?? null)) { avant['compositionRef'] = w.compositionRef ?? null; apres['compositionRef'] = k?.id ?? null }
        if (roleFinal !== w.role) { avant['role'] = w.role; apres['role'] = roleFinal }
        if (epaisseur !== undefined && epaisseur !== w.thickness) { avant['thickness'] = w.thickness; apres['thickness'] = epaisseur }
        if (roleFinal === 'virtual' && w.justification !== 'center') { avant['justification'] = w.justification; apres['justification'] = 'center' }
        if (roleFinal === 'virtual' && ouverturesDe(p, w.id).length) return refus('ce mur porte des ouvertures : une cloison fictive n’en reçoit pas');
        if (cmd.hauteur !== undefined && !(cmd.hauteur > 0)) return refus('la hauteur doit être positive');
        if (cmd.finition !== undefined && cmd.finition !== null && !matiereValide(cmd.finition)) return refus('parement inconnu');
        if (cmd.phase !== undefined && (cmd.phase ?? null) !== (w.phase ?? null)) {
          if (cmd.phase !== null && !PHASES.has(cmd.phase)) return refus('état inconnu');
          if (cmd.phase !== null && roleFinal === 'virtual') return refus('une cloison fictive n’a pas d’état : elle n’a pas de matière');
          /* une baie existante est dans un mur existant : le mur ne repasse pas au projet avant elles */
          if (cmd.phase === null && ouverturesDe(p, w.id).some(x => !!x.o.phase)) return refus('ce mur porte des baies existantes : repassez-les d’abord au projet');
          avant['phase'] = w.phase ?? null; apres['phase'] = cmd.phase;
        }
        if (cmd.decors !== undefined) {
          const Z = cmd.decors ?? [];
          if (Z.length && roleFinal !== 'exterior') return refus('un décor se pose sur un mur de façade');
          const e = decorsInvalides(Z, longueurMur(w));
          if (e) return refus(e);
          /* rangés le long du mur, au millimètre, ramenés dans le mur ; un nom vide n'est pas gardé */
          const L = longueurMur(w);
          const N = [...Z].sort((a, b) => a.from - b.from).map(z => ({ from: Math.max(0, Math.round(z.from)), to: Math.min(Math.round(L), Math.round(z.to)), finish: z.finish,
            ...(z.label?.trim() ? { label: z.label.trim() } : {}) }));
          avant['finishZones'] = w.finishZones ?? null; apres['finishZones'] = N.length ? N : null;
        }
        for (const k of ['hauteur', 'justification', 'finition'] as const) {
          if (cmd[k] === undefined || (k === 'justification' && roleFinal === 'virtual')) continue;
          const champ = ({ hauteur: 'height', justification: 'justification', finition: 'finish' } as const)[k];
          avant[champ] = w[champ] ?? null; apres[champ] = cmd[k];    // null (absent) : il le reste une fois passé par le JSON ; finition null : plus de parement
        }
      }
      return accepte([{ type: 'objet.modifier', niveau: t.niveauId, id: w.id, avant, apres }]);
    }
    case 'creerOuverture': {
      const t = trouverObjet(p, cmd.mur);
      if (!t || t.objet.type !== 'wall') return refus('mur hôte introuvable');
      if (t.objet.role === 'virtual') return refus('une cloison fictive ne reçoit pas d’ouverture : elle n’a pas de matière');
      if (t.objet.phase === 'demolished') return refus('ce mur est à démolir : il ne reçoit pas de nouvelle baie');
      if (!fini(cmd.position, cmd.largeur, cmd.hauteur)) return refus('dimensions invalides');
      const e = horsDuMur(cmd.position, cmd.largeur, longueurMur(t.objet));
      if (e) return refus(e);
      if (!(cmd.hauteur > 0)) return refus('la hauteur doit être positive');
      if (cmd.vantaux !== undefined && !vantauxValides(cmd.vantaux)) return refus('de 1 à 4 vantaux');
      const o: Opening = {
        id: c.id(), type: 'opening', floorId: t.niveauId, ...provenance(c, cmd.origine), revision: c.revision,
        hostWallId: cmd.mur, offset: cmd.position, width: cmd.largeur, height: cmd.hauteur, sill: cmd.allege ?? 0, kind: cmd.genre,
        ...(cmd.sens ? { swing: cmd.sens } : {}),
        ...(cmd.vantaux !== undefined ? { leaves: cmd.vantaux } : {}), ...(cmd.manoeuvre ? { operation: cmd.manoeuvre } : {}),
        ...(cmd.modele ? { catalogRef: { ...cmd.modele } } : {}),
      };
      return accepte([{ type: 'objet.ajouter', niveau: t.niveauId, objet: o }]);
    }
    case 'modifierOuverture': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'opening') return refus('ouverture introuvable');
      const o = t.objet, mur = trouverObjet(p, o.hostWallId);
      if (!mur || mur.objet.type !== 'wall') return refus('mur hôte introuvable');
      const position = cmd.position ?? o.offset, largeur = cmd.largeur ?? o.width;
      const e = horsDuMur(position, largeur, longueurMur(mur.objet));
      if (e) return refus(e);
      if (cmd.hauteur !== undefined && !(cmd.hauteur > 0)) return refus('la hauteur doit être positive');
      if (cmd.vantaux !== undefined && !vantauxValides(cmd.vantaux)) return refus('de 1 à 4 vantaux');
      const avant: Record<string, unknown> = { revision: o.revision, sourceRefs: o.sourceRefs };
      const apres: Record<string, unknown> = { revision: c.revision, sourceRefs: [...o.sourceRefs, source(c, 'Modification')] };
      if (cmd.volet !== undefined && cmd.volet !== null && !VOLETS.has(cmd.volet)) return refus('volet inconnu');
      if (cmd.phase !== undefined && (cmd.phase ?? null) !== (o.phase ?? null)) {
        if (cmd.phase !== null && !PHASES.has(cmd.phase)) return refus('état inconnu');
        if (cmd.phase !== null && !mur.objet.phase) return refus('une baie existante est dans un mur existant : passez d’abord le mur en existant');
        avant['phase'] = o.phase ?? null; apres['phase'] = cmd.phase;
      }
      const champs = { position: 'offset', largeur: 'width', hauteur: 'height', allege: 'sill', genre: 'kind', sens: 'swing', vantaux: 'leaves', manoeuvre: 'operation', modele: 'catalogRef', volet: 'shutter' } as const;
      for (const k of Object.keys(champs) as (keyof typeof champs)[]) {
        if (cmd[k] === undefined) continue;
        avant[champs[k]] = o[champs[k]] ?? null; apres[champs[k]] = cmd[k];
      }
      return accepte([{ type: 'objet.modifier', niveau: t.niveauId, id: o.id, avant, apres }]);
    }
    case 'creerPiece': {
      if (!trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      if (!ptFini(cmd.point)) return refus('point invalide');
      if (!cmd.nom.trim()) return refus('une pièce a un nom');
      const r: Room = {
        id: c.id(), type: 'room', floorId: cmd.niveau, ...provenance(c, cmd.origine), revision: c.revision,
        seed: { ...cmd.point }, name: cmd.nom.trim(), usage: cmd.usage, wet: cmd.humide ?? ['kitchen', 'bathroom', 'wc'].includes(cmd.usage),
      };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: r }]);
    }
    case 'modifierPiece': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'room') return refus('pièce introuvable');
      const r = t.objet;
      if (cmd.nom !== undefined && !cmd.nom.trim()) return refus('une pièce a un nom');
      if (cmd.point && !ptFini(cmd.point)) return refus('point invalide');
      const avant: Record<string, unknown> = { revision: r.revision, sourceRefs: r.sourceRefs };
      const apres: Record<string, unknown> = { revision: c.revision, sourceRefs: [...r.sourceRefs, source(c, 'Modification')] };
      if (cmd.nom !== undefined) { avant['name'] = r.name; apres['name'] = cmd.nom.trim() }
      if (cmd.usage !== undefined) { avant['usage'] = r.usage; apres['usage'] = cmd.usage }
      if (cmd.humide !== undefined) { avant['wet'] = r.wet; apres['wet'] = cmd.humide }
      if (cmd.point !== undefined) { avant['seed'] = r.seed; apres['seed'] = { ...cmd.point } }
      if (cmd.sol !== undefined) {
        if (cmd.sol !== null && !matiereValide(cmd.sol)) return refus('sol inconnu');
        avant['floorFinish'] = r.floorFinish ?? null; apres['floorFinish'] = cmd.sol;
      }
      if (cmd.murs !== undefined) {
        if (cmd.murs !== null && !matiereValide(cmd.murs)) return refus('peinture inconnue');
        avant['wallFinish'] = r.wallFinish ?? null; apres['wallFinish'] = cmd.murs;
      }
      return accepte([{ type: 'objet.modifier', niveau: t.niveauId, id: r.id, avant, apres }]);
    }
    case 'supprimer': {
      const t = trouverObjet(p, cmd.id);
      if (!t) return refus('objet introuvable');
      if (t.objet.type === 'underlay' && t.objet.locked) return refus('fond verrouillé : déverrouillez-le avant de le retirer');
      /* un mur emporte ses ouvertures (une fenêtre sans mur n'a pas de sens),
         ses contraintes et ses cotes */
      const ops: Operation[] = [];
      if (t.objet.type === 'wall') {
        const id = t.objet.id;
        ops.push(...ouverturesDe(p, id).map(({ o, niveau }) => ({ type: 'objet.retirer' as const, niveau, objet: o })));
        const n = trouverNiveau(p, t.niveauId)!;
        for (const o of Object.values(n.floor.objects))
          if ((o.type === 'constraint' && o.walls.includes(id)) || (o.type === 'dimension' && o.refs.some(r => r.objectId === id)))
            ops.push({ type: 'objet.retirer', niveau: t.niveauId, objet: o });
      }
      ops.push({ type: 'objet.retirer', niveau: t.niveauId, objet: t.objet });
      return accepte(ops);
    }
    case 'ajouterNiveau': {
      const b = p.buildings.find(x => x.id === cmd.batiment);
      if (!b) return refus('bâtiment introuvable');
      if (!cmd.nom.trim()) return refus('un niveau a un nom');
      if (!fini(cmd.altitude, cmd.hauteur) || !(cmd.hauteur > 0)) return refus('altitude ou hauteur invalide');
      /* un identifiant imposé (un modèle de maison pose l'étage et ses murs dans la même transaction) */
      if (cmd.id !== undefined && (!cmd.id.trim() || p.buildings.some(x => x.floors.some(f => f.id === cmd.id)))) return refus('identifiant de niveau déjà pris');
      const ordre = b.floors.reduce((m, f) => Math.max(m, f.order), -1) + 1;
      return accepte([{ type: 'niveau.ajouter', batiment: b.id, index: b.floors.length,
        niveau: { id: cmd.id ?? c.id(), name: cmd.nom.trim(), elevation: cmd.altitude, height: cmd.hauteur, order: ordre, objects: {} } }]);
    }
    case 'modifierDossier': {
      const avant = p.dossier ?? {}, apres: Record<string, unknown> = { ...avant };
      for (const [k, v] of Object.entries(cmd.champs)) {
        if (!CHAMPS_DOSSIER.has(k)) return refus('information de dossier inconnue : ' + k);
        if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) { delete apres[k]; continue }
        if (k === 'surfaceTerrain' && !(typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e7)) return refus('surface du terrain invalide');
        if (k === 'modifications') {
          const M = v as { date: string; objet: string }[];
          if (!Array.isArray(M) || M.length > 30 || M.some(x => typeof x?.date !== 'string' || typeof x?.objet !== 'string')) return refus('modifications invalides');
          const L = M.map(x => ({ date: x.date.trim(), objet: x.objet.trim() })).filter(x => x.date || x.objet);
          if (L.length) apres[k] = L; else delete apres[k];
          continue;
        }
        if (k === 'menuiseries' || k === 'porteEntree' || k === 'porteGarage') {
          const e = teinteOuvrageInvalide(v);
          if (e) return refus(e);
          const x = v as TeinteOuvrage, materiau = x.materiau?.trim();
          const t: TeinteOuvrage = { ...(materiau ? { materiau } : {}), ...(x.teinte ? { teinte: x.teinte } : {}) };
          if (Object.keys(t).length) apres[k] = t; else delete apres[k];
          continue;
        }
        if (typeof v === 'string' && v.length > 500) return refus('texte trop long (500 caractères au plus)');
        apres[k] = typeof v === 'string' ? v.trim() : v;
      }
      /* un champ absent s'écrit null : il le reste une fois le ChangeSet passé par le JSON */
      return accepte([{ type: 'projet.modifier', avant: { dossier: p.dossier ?? null }, apres: { dossier: Object.keys(apres).length ? apres : null } }]);
    }
    case 'renommerProjet': {
      if (!cmd.nom.trim()) return refus('un projet a un nom');
      return accepte([{ type: 'projet.modifier', avant: { name: p.name }, apres: { name: cmd.nom.trim() } }]);
    }
    case 'deplacerSommet': {
      if (!trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      if (!ptFini(cmd.de) || !ptFini(cmd.vers)) return refus('coordonnées invalides');
      const n = trouverNiveau(p, cmd.niveau)!;
      /* le bout d'une cloison fictive seule (aucun mur bâti n'y aboutit) : elle seule bouge */
      if (!mursDroits(n.floor).some(w => distance(w.axis.a, cmd.de) <= EPS_COINCIDENCE || distance(w.axis.b, cmd.de) <= EPS_COINCIDENCE)) {
        const V = mursFictifs(n.floor).filter(v => distance(v.axis.a, cmd.de) <= EPS_COINCIDENCE || distance(v.axis.b, cmd.de) <= EPS_COINCIDENCE);
        if (!V.length) return refus('aucune extrémité de mur à cet endroit');
        const ops: Operation[] = [];
        for (const v of V) {
          const a = distance(v.axis.a, cmd.de) <= EPS_COINCIDENCE ? cmd.vers : v.axis.a, b = distance(v.axis.b, cmd.de) <= EPS_COINCIDENCE ? cmd.vers : v.axis.b;
          if (distance(a, b) <= EPS_COINCIDENCE) return refus('un mur doit avoir une longueur');
          ops.push({ type: 'objet.modifier', niveau: cmd.niveau, id: v.id, avant: { axis: v.axis, revision: v.revision }, apres: { axis: { a: { ...a }, b: { ...b } }, revision: c.revision } });
        }
        return accepte(ops);
      }
      return ajuster(p, cmd.niveau, [], [{ de: cmd.de, vers: cmd.vers }], c, murDroitsAuSommet(p, cmd.niveau, cmd.de));
    }
    case 'equerrerMurs': {
      const n = trouverNiveau(p, cmd.niveau);
      if (!n) return refus('niveau introuvable');
      const e = equerrer(n.floor, cmd.murs);
      if (!e.equerres.length) return refus('aucun mur presque d’équerre (à moins de ' + Math.round(ANGLE_EQUERRE * 180 / Math.PI) + '°) : rien à redresser');
      if (!e.epingles.length) return refus('les murs sont déjà d’équerre');
      return ajuster(p, cmd.niveau, [], e.epingles, c, e.redresses);
    }
    case 'ajouterContrainte': {
      const n = trouverNiveau(p, cmd.niveau);
      if (!n) return refus('niveau introuvable');
      const un = GENRES_UN_MUR.includes(cmd.genre);
      if (cmd.murs.length !== (un ? 1 : 2)) return refus(un ? 'cette contrainte porte sur un mur' : 'cette contrainte porte sur deux murs');
      if (new Set(cmd.murs).size !== cmd.murs.length) return refus('il faut deux murs différents');
      const W: Wall[] = [];
      for (const id of cmd.murs) {
        const o = n.floor.objects[id];
        if (!o || o.type !== 'wall' || !('a' in o.axis)) return refus('mur droit introuvable sur ce niveau');
        W.push(o);
      }
      const deja = Object.values(n.floor.objects).some(o => o.type === 'constraint' && o.kind === cmd.genre
        && o.walls.length === cmd.murs.length && cmd.murs.every(id => o.walls.includes(id)));
      if (deja) return refus('cette contrainte existe déjà');
      let valeur = cmd.valeur;
      const axe = W[0]!.axis as { a: Point; b: Point };
      if (cmd.genre === 'length') valeur ??= distance(axe.a, axe.b);
      if (cmd.genre === 'angle') valeur ??= angleDe(soustraire(axe.b, axe.a));
      if ((cmd.genre === 'length' || cmd.genre === 'angle') && !(valeur !== undefined && Number.isFinite(valeur))) return refus('valeur invalide');
      if (cmd.genre === 'length' && !(valeur! > EPS_COINCIDENCE)) return refus('la longueur doit être positive');
      const k: Constraint = {
        id: c.id(), type: 'constraint', floorId: cmd.niveau, status: 'confirmed', sourceRefs: [source(c, 'Saisie')], revision: c.revision,
        kind: cmd.genre, walls: [...cmd.murs], ...(cmd.genre === 'length' || cmd.genre === 'angle' ? { value: valeur! } : {}),
      };
      /* une contrainte qui n'est pas encore vraie ajuste le plan (le plus petit déplacement), ou est refusée */
      return ajuster(p, cmd.niveau, [{ type: 'objet.ajouter', niveau: cmd.niveau, objet: k }], [], c, cmd.murs);
    }
    case 'modifierContrainte': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'constraint') return refus('contrainte introuvable');
      const k = t.objet;
      if (k.kind !== 'length' && k.kind !== 'angle') return refus('cette contrainte n’a pas de valeur');
      if (!Number.isFinite(cmd.valeur) || (k.kind === 'length' && !(cmd.valeur > EPS_COINCIDENCE))) return refus('valeur invalide');
      const w = trouverObjet(p, k.walls[0]!);
      if (!w || w.objet.type !== 'wall' || !('a' in w.objet.axis)) return refus('mur introuvable');
      /* l'origine du mur reste en place, son extrémité bouge */
      return ajuster(p, t.niveauId, [modifier(t.niveauId, k, { value: k.value }, { value: cmd.valeur }, c)], [{ de: w.objet.axis.a, vers: w.objet.axis.a }], c, k.walls);
    }
    case 'creerCote': {
      const n = trouverNiveau(p, cmd.niveau);
      if (!n) return refus('niveau introuvable');
      for (const r of cmd.refs) {
        const o = n.floor.objects[r.objectId];
        if (!o || o.type !== 'wall' || !('a' in o.axis)) return refus('une cote s’accroche à des murs droits du même niveau');
      }
      const ptRef = (r: ObjectAnchor) => r.feature === 'start' || r.feature === 'end';
      if (cmd.refs[0].objectId === cmd.refs[1].objectId && !(ptRef(cmd.refs[0]) && ptRef(cmd.refs[1]) && cmd.refs[0].feature !== cmd.refs[1].feature))
        return refus('sur un même mur, une cote va d’une extrémité à l’autre');
      const v = mesurerCote(n.floor, { refs: cmd.refs });
      if (v === null) return refus('cote impossible à mesurer (deux murs non parallèles ?)');
      if (cmd.motrice && !(v > EPS_COINCIDENCE)) return refus('une cote motrice nulle ne peut rien piloter');
      const d: Dimension = {
        id: c.id(), type: 'dimension', floorId: cmd.niveau, status: 'confirmed', sourceRefs: [source(c, 'Saisie')], revision: c.revision,
        refs: [{ ...cmd.refs[0] }, { ...cmd.refs[1] }], driving: !!cmd.motrice, offset: cmd.decalage ?? 500, ...(cmd.motrice ? { value: v } : {}),
      };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: d }]);
    }
    case 'modifierCote': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'dimension') return refus('cote introuvable');
      const d = t.objet, n = trouverNiveau(p, t.niveauId)!;
      const motrice = cmd.motrice ?? d.driving;
      if (cmd.valeur !== undefined && !motrice) return refus('cote non motrice : rendez-la motrice pour qu’elle déplace les murs');
      if (cmd.valeur !== undefined && !(Number.isFinite(cmd.valeur) && cmd.valeur > EPS_COINCIDENCE)) return refus('valeur invalide');
      if (cmd.decalage !== undefined && !Number.isFinite(cmd.decalage)) return refus('décalage invalide');
      const mesure = mesurerCote(n.floor, d);
      if (mesure === null) return refus('cote impossible à mesurer');
      const valeur = !motrice ? undefined : cmd.valeur ?? (d.driving ? d.value : mesure);
      const avant: Record<string, unknown> = { driving: d.driving, value: d.value, offset: d.offset };
      const apres: Record<string, unknown> = { driving: motrice, value: valeur, offset: cmd.decalage ?? d.offset };
      const op = modifier(t.niveauId, d, avant, apres, c);
      if (valeur === undefined || valeur === d.value && d.driving) return accepte([op]);
      /* le premier ancrage reste en place : c'est le second qui bouge */
      const fixes = sommetsDe(p, d.refs[0]);
      const murs = [...new Set(d.refs.map(r => r.objectId))];
      return ajuster(p, t.niveauId, [op], fixes.map(s => ({ de: s, vers: s })), c, murs);
    }
    case 'modifierNiveau': {
      const e = trouverNiveau(p, cmd.id);
      if (!e) return refus('niveau introuvable');
      const f = e.floor;
      if (cmd.nom !== undefined && !cmd.nom.trim()) return refus('un niveau a un nom');
      if (cmd.altitude !== undefined && !Number.isFinite(cmd.altitude)) return refus('altitude invalide');
      if (cmd.hauteur !== undefined && !(Number.isFinite(cmd.hauteur) && cmd.hauteur > 0)) return refus('la hauteur doit être positive');
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      if (cmd.nom !== undefined) { avant['name'] = f.name; apres['name'] = cmd.nom.trim() }
      if (cmd.altitude !== undefined) { avant['elevation'] = f.elevation; apres['elevation'] = cmd.altitude }
      if (cmd.hauteur !== undefined) { avant['height'] = f.height; apres['height'] = cmd.hauteur }
      for (const [cle, champ, genre] of [['plafond', 'ceilingRef', 'plafond'], ['plancher', 'floorRef', 'sol']] as const) {
        const v = cmd[cle];
        if (v === undefined) continue;
        if (v !== null && compositionPlancher(v)?.genre !== genre) return refus(cle === 'plafond' ? 'composition de plafond inconnue' : 'composition de plancher inconnue');
        avant[champ] = f[champ] ?? null; apres[champ] = v;
      }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([{ type: 'niveau.modifier', niveau: f.id, avant, apres }]);
    }
    case 'supprimerNiveau': {
      const e = trouverNiveau(p, cmd.id);
      if (!e) return refus('niveau introuvable');
      const b = p.buildings[e.batiment]!;
      if (b.floors.length < 2) return refus('un bâtiment garde au moins un niveau');
      /* le niveau part avec tout ce qu'il contient : annuler le rend intact */
      return accepte([{ type: 'niveau.retirer', batiment: b.id, index: e.niveau, niveau: e.floor }]);
    }
    case 'ajouterFond': {
      if (!trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      if (!cmd.fichier.trim()) return refus('fichier manquant');
      if (cmd.page !== undefined && !(Number.isInteger(cmd.page) && cmd.page >= 1)) return refus('numéro de page invalide');
      if (cmd.calage && !(Object.values(cmd.calage).every(Number.isFinite) && cmd.calage.scale > 0)) return refus('calage invalide');
      if (cmd.opacite !== undefined && !(cmd.opacite >= 0 && cmd.opacite <= 1)) return refus('opacité entre 0 et 1');
      const pr = cmd.origine ? provenance(c, cmd.origine) : { status: 'confirmed' as const, sourceRefs: [source(c, 'Import du fond')] };
      const u: Underlay = {
        id: c.id(), type: 'underlay', floorId: cmd.niveau, ...pr, revision: c.revision,
        fileKey: cmd.fichier, ...(cmd.nom ? { name: cmd.nom } : {}), ...(cmd.page ? { page: cmd.page } : {}),
        transform: { ...(cmd.calage ?? TRANSFORMATION_NEUTRE) }, locked: !!cmd.verrouille, opacity: cmd.opacite ?? 0.5,
      };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: u }]);
    }
    case 'calerFond': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'underlay') return refus('fond introuvable');
      const u = t.objet;
      if (u.locked) return refus('fond verrouillé : déverrouillez-le pour le recaler');
      if (!cmd.image.every(ptFini)) return refus('points de l’image invalides');
      const tr = cmd.plan ? (cmd.plan.every(ptFini) ? calage(cmd.image, cmd.plan) : 'points du plan invalides')
        : cmd.distance !== undefined ? calageParDistance(u.transform, cmd.image, cmd.distance) : 'indiquez la place des deux points sur le plan, ou leur distance réelle';
      if (typeof tr === 'string') return refus(tr);
      return accepte([modifier(t.niveauId, u, { transform: u.transform }, { transform: tr }, c, 'Calage')]);
    }
    case 'modifierFond': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'underlay') return refus('fond introuvable');
      const u = t.objet;
      if (cmd.opacite !== undefined && !(cmd.opacite >= 0 && cmd.opacite <= 1)) return refus('opacité entre 0 et 1');
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      if (cmd.verrouille !== undefined) { avant['locked'] = u.locked; apres['locked'] = cmd.verrouille }
      if (cmd.opacite !== undefined) { avant['opacity'] = u.opacity; apres['opacity'] = cmd.opacite }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t.niveauId, u, avant, apres, c)]);
    }
    case 'creerToiture': {
      const n = trouverNiveau(p, cmd.niveau);
      if (!n) return refus('niveau introuvable');
      if (Object.values(n.floor.objects).some(o => o.type === 'roof')) return refus('ce niveau a déjà une toiture : modifiez-la');
      const e = toitureInvalide(cmd.genre, cmd.pente, cmd.debord);
      if (e) return refus(e);
      if (cmd.talon !== undefined && !(Number.isFinite(cmd.talon) && cmd.talon >= 0 && cmd.talon <= 800)) return refus('talon de charpente : de 0 à 80 cm');
      const r: Roof = {
        id: c.id(), type: 'roof', floorId: cmd.niveau, ...provenance(c, undefined), revision: c.revision,
        kind: cmd.genre, pitch: cmd.pente, overhang: cmd.debord, covering: cmd.couverture,
        ...(cmd.faitage ? { ridge: cmd.faitage } : {}), ...(cmd.inverse ? { flip: true } : {}), ...(cmd.talon !== undefined ? { heel: cmd.talon } : {}),
      };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: r }]);
    }
    case 'creerMeuble': {
      if (!trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      if (!ptFini(cmd.position) || !fini(cmd.rotation)) return refus('position invalide');
      if (!cmd.modele.id.trim()) return refus('modèle manquant');
      const e = meubleInvalide(cmd.largeur, cmd.profondeur, cmd.hauteur);
      if (e) return refus(e);
      const o: Furniture = {
        id: c.id(), type: 'furniture', floorId: cmd.niveau, ...provenance(c, undefined), revision: c.revision,
        position: { ...cmd.position }, rotation: cmd.rotation, width: cmd.largeur, depth: cmd.profondeur, height: cmd.hauteur, catalogRef: { ...cmd.modele },
      };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: o }]);
    }
    case 'modifierMeuble': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'furniture') return refus('meuble introuvable');
      const o = t.objet;
      if ((cmd.position && !ptFini(cmd.position)) || (cmd.rotation !== undefined && !fini(cmd.rotation))) return refus('position invalide');
      const e = meubleInvalide(cmd.largeur ?? o.width, cmd.profondeur ?? o.depth, cmd.hauteur ?? o.height);
      if (e) return refus(e);
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      const champs = { position: 'position', rotation: 'rotation', largeur: 'width', profondeur: 'depth', hauteur: 'height' } as const;
      for (const k of Object.keys(champs) as (keyof typeof champs)[]) {
        if (cmd[k] === undefined) continue;
        avant[champs[k]] = o[champs[k]]; apres[champs[k]] = cmd[k];
      }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t.niveauId, o, avant, apres, c)]);
    }
    case 'creerEscalier': {
      if (!trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      if (!ptFini(cmd.position) || !fini(cmd.rotation)) return refus('position invalide');
      const e = escalierInvalide(cmd.largeur, cmd.giron);
      if (e) return refus(e);
      const s: Stair = {
        id: c.id(), type: 'stair', floorId: cmd.niveau, ...provenance(c, undefined), revision: c.revision,
        position: { ...cmd.position }, rotation: cmd.rotation, width: cmd.largeur, kind: cmd.genre, ...(cmd.giron ? { going: cmd.giron } : {}),
      };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: s }]);
    }
    case 'modifierEscalier': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'stair') return refus('escalier introuvable');
      const o = t.objet;
      if ((cmd.position && !ptFini(cmd.position)) || (cmd.rotation !== undefined && !fini(cmd.rotation))) return refus('position invalide');
      const e = escalierInvalide(cmd.largeur ?? o.width, cmd.giron);
      if (e) return refus(e);
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      const champs = { genre: 'kind', position: 'position', rotation: 'rotation', largeur: 'width', giron: 'going' } as const;
      for (const k of Object.keys(champs) as (keyof typeof champs)[]) {
        if (cmd[k] === undefined) continue;
        avant[champs[k]] = o[champs[k]]; apres[champs[k]] = cmd[k];          // giron null : revenir au giron calculé
      }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t.niveauId, o, avant, apres, c)]);
    }
    case 'creerCoupe': {
      if (!trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      const pris = nomsDeCoupes(p);
      const nom = (cmd.nom ?? [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(l => !pris.has(l)) ?? 'Z1').trim().toUpperCase();
      const e = coupeInvalide(p, cmd.a, cmd.b, nom);
      if (e) return refus(e);
      const s: SectionLine = {
        id: c.id(), type: 'section', floorId: cmd.niveau, ...provenance(c, undefined), revision: c.revision,
        a: { ...cmd.a }, b: { ...cmd.b }, look: cmd.regard ?? 'left', name: nom,
      };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: s }]);
    }
    case 'creerFenetreToit': {
      const f = trouverNiveau(p, cmd.niveau);
      if (!f) return refus('niveau introuvable');
      const largeur = cmd.largeur ?? 780, hauteur = cmd.hauteur ?? 980;
      const e = fenetreToitInvalide(f.floor, cmd.centre, largeur, hauteur);
      if (e) return refus(e);
      const w: RoofWindow = { id: c.id(), type: 'roof_window', floorId: cmd.niveau, ...provenance(c, undefined), revision: c.revision, center: { ...cmd.centre }, width: largeur, height: hauteur };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: w }]);
    }
    case 'modifierFenetreToit': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'roof_window') return refus('fenêtre de toit introuvable');
      const o = t.objet, f = trouverNiveau(p, t.niveauId)!;
      const e = fenetreToitInvalide(f.floor, cmd.centre ?? o.center, cmd.largeur ?? o.width, cmd.hauteur ?? o.height);
      if (e) return refus(e);
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      const champs = { centre: 'center', largeur: 'width', hauteur: 'height' } as const;
      for (const k of Object.keys(champs) as (keyof typeof champs)[]) { if (cmd[k] === undefined) continue; avant[champs[k]] = o[champs[k]]; apres[champs[k]] = cmd[k] }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t.niveauId, o, avant, apres, c)]);
    }
    case 'creerLucarne': {
      const n = trouverNiveau(p, cmd.niveau);
      if (!n) return refus('niveau introuvable');
      const D = LUCARNE_PAR_DEFAUT, roof = Object.values(n.floor.objects).find(o => o.type === 'roof');
      const v = { kind: cmd.genre, center: { ...cmd.centre }, width: cmd.largeur ?? D.largeur, height: cmd.hauteur ?? D.hauteur,
        pitch: cmd.pente ?? (cmd.genre === 'shed' ? D.penteRampante : roof?.type === 'roof' ? roof.pitch : 40), windowWidth: cmd.fenetreLargeur ?? D.fenetreLargeur, windowHeight: cmd.fenetreHauteur ?? D.fenetreHauteur };
      const e = lucarneInvalide(n.floor, v);
      if (e) return refus(e);
      const o: Dormer = { id: c.id(), type: 'dormer', floorId: cmd.niveau, ...provenance(c, undefined), revision: c.revision, ...v };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: o }]);
    }
    case 'modifierLucarne': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'dormer') return refus('lucarne introuvable');
      const o = t.objet, f = trouverNiveau(p, t.niveauId)!.floor;
      const champs = { genre: 'kind', centre: 'center', largeur: 'width', hauteur: 'height', pente: 'pitch', fenetreLargeur: 'windowWidth', fenetreHauteur: 'windowHeight' } as const;
      const v = { ...o };
      for (const k of Object.keys(champs) as (keyof typeof champs)[]) if (cmd[k] !== undefined) (v as Record<string, unknown>)[champs[k]] = cmd[k];
      const e = lucarneInvalide(f, v);
      if (e) return refus(e);
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      for (const k of Object.keys(champs) as (keyof typeof champs)[]) { if (cmd[k] === undefined) continue; avant[champs[k]] = o[champs[k]]; apres[champs[k]] = cmd[k] }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t.niveauId, o, avant, apres, c)]);
    }
    case 'creerPointDeVue': {
      if (!trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      /* par défaut, la première pièce qui n'a pas encore son point de vue (PCMI 7, puis 8, puis 6) */
      const pris = new Set(p.buildings.flatMap(b => b.floors).flatMap(f => Object.values(f.objects)).flatMap(o => (o.type === 'viewpoint' ? [o.piece] : [])));
      const piece = cmd.piece ?? PIECES_POINT_DE_VUE.find(x => !pris.has(x)) ?? 'PCMI 7';
      const e = pointDeVueInvalide(cmd.a, cmd.b, piece);
      if (e) return refus(e);
      const v: Viewpoint = { id: c.id(), type: 'viewpoint', floorId: cmd.niveau, ...provenance(c, undefined), revision: c.revision, a: { ...cmd.a }, b: { ...cmd.b }, piece };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: v }]);
    }
    case 'modifierPointDeVue': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'viewpoint') return refus('point de vue introuvable');
      const o = t.objet;
      const e = pointDeVueInvalide(cmd.a ?? o.a, cmd.b ?? o.b, cmd.piece ?? o.piece);
      if (e) return refus(e);
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      for (const k of ['a', 'b', 'piece'] as const) { if (cmd[k] === undefined) continue; avant[k] = o[k]; apres[k] = cmd[k] }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t.niveauId, o, avant, apres, c)]);
    }
    case 'modifierCoupe': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'section') return refus('trait de coupe introuvable');
      const o = t.objet, nom = cmd.nom === undefined ? undefined : cmd.nom.trim().toUpperCase();
      const e = coupeInvalide(p, cmd.a ?? o.a, cmd.b ?? o.b, nom ?? o.name, o.id);
      if (e) return refus(e);
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      const champs = { a: 'a', b: 'b', regard: 'look', nom: 'name' } as const;
      const v = { ...cmd, ...(nom !== undefined ? { nom } : {}) };
      for (const k of Object.keys(champs) as (keyof typeof champs)[]) {
        if (v[k] === undefined) continue;
        avant[champs[k]] = o[champs[k]]; apres[champs[k]] = v[k];
      }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t.niveauId, o, avant, apres, c)]);
    }
    case 'creerPlateforme': case 'modifierPlateforme': {
      const t = cmd.type === 'modifierPlateforme' ? trouverObjet(p, cmd.id) : null;
      if (cmd.type === 'modifierPlateforme' && (!t || t.objet.type !== 'platform')) return refus('plateforme introuvable');
      if (cmd.type === 'creerPlateforme' && !trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      const o = t?.objet as Platform | undefined;
      const contour = cmd.contour ?? o!.contour, niveauFini = cmd.niveauFini ?? o!.level, pente = cmd.talus ?? o!.slope;
      if (contour.length < 3 || !contour.every(ptFini) || !(Math.abs(aireSignee(contour)) > 1e4)) return refus('une plateforme est un polygone d’au moins trois sommets, de quelque surface');
      if (!Number.isFinite(niveauFini) || Math.abs(niveauFini) > 50_000) return refus('niveau de plateforme invalide');
      if (!(Number.isFinite(pente) && pente >= 0.2 && pente <= 10)) return refus('pente de talus entre 0,2 et 10 (horizontal pour 1 vertical)');
      if (cmd.type === 'creerPlateforme') {
        const n: Platform = { id: c.id(), type: 'platform', floorId: cmd.niveau, ...provenance(c, undefined), revision: c.revision,
          contour: contour.map(q => ({ ...q })), level: niveauFini, slope: pente, ...(cmd.nom?.trim() ? { label: cmd.nom.trim() } : {}) };
        return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: n }]);
      }
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      if (cmd.contour) { avant['contour'] = o!.contour; apres['contour'] = contour.map(q => ({ ...q })) }
      if (cmd.niveauFini !== undefined) { avant['level'] = o!.level; apres['level'] = niveauFini }
      if (cmd.talus !== undefined) { avant['slope'] = o!.slope; apres['slope'] = pente }
      if (cmd.nom !== undefined) { avant['label'] = o!.label ?? null; apres['label'] = cmd.nom?.trim() || null }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t!.niveauId, o!, avant, apres, c)]);
    }
    case 'creerReseau': case 'modifierReseau': {
      const t = cmd.type === 'modifierReseau' ? trouverObjet(p, cmd.id) : null;
      if (cmd.type === 'modifierReseau' && (!t || t.objet.type !== 'network')) return refus('réseau introuvable');
      if (cmd.type === 'creerReseau' && !trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      const o = t?.objet as Network | undefined;
      const points = cmd.points ?? o!.points, genre = cmd.genre ?? o!.kind;
      if (!GENRES_RESEAU.includes(genre)) return refus('réseau inconnu');
      if (points.length < 2 || !points.every(ptFini) || points.some((q, i) => i > 0 && distance(q, points[i - 1]!) <= EPS_COINCIDENCE)) return refus('un réseau va d’un point à un autre (deux points distincts au moins)');
      if (cmd.type === 'creerReseau') {
        const n: Network = { id: c.id(), type: 'network', floorId: cmd.niveau, ...provenance(c, undefined), revision: c.revision,
          kind: genre, points: points.map(q => ({ ...q })), ...(cmd.spec?.trim() ? { spec: cmd.spec.trim() } : {}) };
        return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: n }]);
      }
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      if (cmd.points) { avant['points'] = o!.points; apres['points'] = points.map(q => ({ ...q })) }
      if (cmd.genre !== undefined) { avant['kind'] = o!.kind; apres['kind'] = genre }
      if (cmd.spec !== undefined) { avant['spec'] = o!.spec ?? null; apres['spec'] = cmd.spec?.trim() || null }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t!.niveauId, o!, avant, apres, c)]);
    }
    case 'creerEquipement': case 'modifierEquipement': {
      const t = cmd.type === 'modifierEquipement' ? trouverObjet(p, cmd.id) : null;
      if (cmd.type === 'modifierEquipement' && (!t || t.objet.type !== 'network_item')) return refus('équipement introuvable');
      if (cmd.type === 'creerEquipement' && !trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      const o = t?.objet as NetworkItem | undefined;
      const position = cmd.position ?? o!.position, genre = cmd.genre ?? o!.kind;
      if (!GENRES_EQUIPEMENT.includes(genre)) return refus('équipement inconnu');
      if (!ptFini(position)) return refus('position invalide');
      if (cmd.type === 'creerEquipement') {
        const n: NetworkItem = { id: c.id(), type: 'network_item', floorId: cmd.niveau, ...provenance(c, undefined), revision: c.revision,
          kind: genre, position: { ...position }, ...(cmd.nom?.trim() ? { label: cmd.nom.trim() } : {}) };
        return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: n }]);
      }
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      if (cmd.position) { avant['position'] = o!.position; apres['position'] = { ...position } }
      if (cmd.genre !== undefined) { avant['kind'] = o!.kind; apres['kind'] = genre }
      if (cmd.nom !== undefined) { avant['label'] = o!.label ?? null; apres['label'] = cmd.nom?.trim() || null }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t!.niveauId, o!, avant, apres, c)]);
    }
    case 'creerArbre': case 'modifierArbre': {
      const t = cmd.type === 'modifierArbre' ? trouverObjet(p, cmd.id) : null;
      if (cmd.type === 'modifierArbre' && (!t || t.objet.type !== 'tree')) return refus('arbre introuvable');
      if (cmd.type === 'creerArbre' && !trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      const o = t?.objet as Tree | undefined;
      const position = cmd.position ?? o!.position, diametre = cmd.diametre ?? o!.diameter, etat = cmd.etat ?? o!.state;
      if (!ptFini(position)) return refus('position invalide');
      if (!(diametre >= 300 && diametre <= 30_000)) return refus('diamètre de couronne entre 0,30 et 30 m');
      if (!['existing', 'planted', 'felled'].includes(etat)) return refus('état inconnu');
      if (cmd.type === 'creerArbre') {
        const n: Tree = { id: c.id(), type: 'tree', floorId: cmd.niveau, ...provenance(c, undefined), revision: c.revision, position: { ...position }, diameter: diametre, state: etat };
        return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: n }]);
      }
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      if (cmd.position) { avant['position'] = o!.position; apres['position'] = { ...position } }
      if (cmd.diametre !== undefined) { avant['diameter'] = o!.diameter; apres['diameter'] = diametre }
      if (cmd.etat !== undefined) { avant['state'] = o!.state; apres['state'] = etat }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t!.niveauId, o!, avant, apres, c)]);
    }
    case 'creerCouvert': case 'modifierCouvert': {
      const t = cmd.type === 'modifierCouvert' ? trouverObjet(p, cmd.id) : null;
      if (cmd.type === 'modifierCouvert' && (!t || t.objet.type !== 'canopy')) return refus('couvert introuvable');
      if (cmd.type === 'creerCouvert' && !trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      const o = t?.objet as Canopy | undefined;
      const contour = cmd.contour ?? o!.contour, nom = (cmd.nom ?? o?.name ?? 'Porche couvert').trim(), soutenu = cmd.soutenu ?? o?.supported ?? true;
      if (contour.length < 3 || contour.length > 64 || !contour.every(ptFini)) return refus('contour du couvert invalide');
      if (Math.abs(aireSignee(contour)) < 250_000) return refus('couvert trop petit (moins de 0,25 m²)');
      if (!nom || nom.length > 60) return refus('nom du couvert : 1 à 60 caractères');
      if (cmd.type === 'creerCouvert') {
        const n: Canopy = { id: c.id(), type: 'canopy', floorId: cmd.niveau, ...provenance(c, cmd.origine), revision: c.revision, name: nom, contour: contour.map(q => ({ x: q.x, y: q.y })), supported: !!soutenu };
        return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: n }]);
      }
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      if (cmd.contour) { avant['contour'] = o!.contour; apres['contour'] = contour.map(q => ({ x: q.x, y: q.y })) }
      if (cmd.nom !== undefined && nom !== o!.name) { avant['name'] = o!.name; apres['name'] = nom }
      if (cmd.soutenu !== undefined && soutenu !== o!.supported) { avant['supported'] = o!.supported; apres['supported'] = soutenu }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t!.niveauId, o!, avant, apres, c)]);
    }
    case 'creerPoteau': case 'modifierPoteau': {
      const t = cmd.type === 'modifierPoteau' ? trouverObjet(p, cmd.id) : null;
      if (cmd.type === 'modifierPoteau' && (!t || t.objet.type !== 'column')) return refus('poteau introuvable');
      if (cmd.type === 'creerPoteau' && !trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      const o = t?.objet as Column | undefined;
      const position = cmd.position ?? o!.position, largeur = cmd.largeur ?? o!.width, profondeur = cmd.profondeur ?? o!.depth;
      const rotation = cmd.rotation ?? o?.rotation ?? 0, matiere = cmd.matiere ?? o!.material;
      if (!ptFini(position) || !fini(rotation)) return refus('position invalide');
      if (!(largeur >= 50 && largeur <= 2_000 && profondeur >= 50 && profondeur <= 2_000)) return refus('section de poteau entre 5 cm et 2 m');
      if (!['concrete', 'steel', 'wood'].includes(matiere)) return refus('matière inconnue');
      if (cmd.type === 'creerPoteau') {
        const n: Column = { id: c.id(), type: 'column', floorId: cmd.niveau, ...provenance(c, undefined), revision: c.revision, position: { ...position }, width: largeur, depth: profondeur, rotation, material: matiere };
        return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: n }]);
      }
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      if (cmd.position) { avant['position'] = o!.position; apres['position'] = { ...position } }
      if (cmd.largeur !== undefined) { avant['width'] = o!.width; apres['width'] = largeur }
      if (cmd.profondeur !== undefined) { avant['depth'] = o!.depth; apres['depth'] = profondeur }
      if (cmd.rotation !== undefined) { avant['rotation'] = o!.rotation; apres['rotation'] = rotation }
      if (cmd.matiere !== undefined) { avant['material'] = o!.material; apres['material'] = matiere }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t!.niveauId, o!, avant, apres, c)]);
    }
    case 'creerPoutre': case 'modifierPoutre': {
      const t = cmd.type === 'modifierPoutre' ? trouverObjet(p, cmd.id) : null;
      if (cmd.type === 'modifierPoutre' && (!t || t.objet.type !== 'beam')) return refus('poutre introuvable');
      if (cmd.type === 'creerPoutre' && !trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      const o = t?.objet as Beam | undefined;
      const a = cmd.a ?? o!.a, b = cmd.b ?? o!.b, largeur = cmd.largeur ?? o!.width, retombee = cmd.retombee ?? o!.depth, matiere = cmd.matiere ?? o!.material;
      if (!ptFini(a) || !ptFini(b)) return refus('position invalide');
      if (distance(a, b) < 300) return refus('une poutre fait 30 cm au moins');
      if (!(largeur >= 50 && largeur <= 1_000 && retombee >= 0 && retombee <= 2_000)) return refus('largeur de poutre entre 5 cm et 1 m, retombée entre 0 et 2 m');
      if (!['concrete', 'steel', 'wood'].includes(matiere)) return refus('matière inconnue');
      if (cmd.type === 'creerPoutre') {
        const n: Beam = { id: c.id(), type: 'beam', floorId: cmd.niveau, ...provenance(c, undefined), revision: c.revision, a: { ...a }, b: { ...b }, width: largeur, depth: retombee, material: matiere };
        return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: n }]);
      }
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      if (cmd.a) { avant['a'] = o!.a; apres['a'] = { ...a } }
      if (cmd.b) { avant['b'] = o!.b; apres['b'] = { ...b } }
      if (cmd.largeur !== undefined) { avant['width'] = o!.width; apres['width'] = largeur }
      if (cmd.retombee !== undefined) { avant['depth'] = o!.depth; apres['depth'] = retombee }
      if (cmd.matiere !== undefined) { avant['material'] = o!.material; apres['material'] = matiere }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t!.niveauId, o!, avant, apres, c)]);
    }
    case 'creerFondations': {
      if (!trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      if (p.buildings.flatMap(b => b.floors).some(f => Object.values(f.objects).some(o => o.type === 'foundation'))) return refus('le projet a déjà ses fondations : modifiez-les');
      if (!['crawl_space', 'slab_on_grade'].includes(cmd.genre)) return refus('soubassement inconnu');
      const D = FONDATIONS_PAR_DEFAUT;
      const v = { largeur: cmd.largeur ?? D.largeur, hauteur: cmd.hauteur ?? D.hauteur, horsGel: cmd.horsGel ?? D.horsGel, bonSol: cmd.bonSol,
        hauteurVide: cmd.hauteurVide ?? D.hauteurVide, coteIsolee: cmd.coteIsolee ?? D.coteIsolee, hauteurIsolee: cmd.hauteurIsolee ?? D.hauteurIsolee, trappes: [] };
      const e = fondationsInvalides(v);
      if (e) return refus(e);
      /* le dimensionnement relève de l'étude de sol et du bureau d'études : jamais « confirmé » ici (règle 5) */
      const o: Foundation = { id: c.id(), type: 'foundation', floorId: cmd.niveau, ...provenance(c, undefined), status: 'be_validation', revision: c.revision,
        kind: cmd.genre, footingWidth: v.largeur, footingHeight: v.hauteur, frostDepth: v.horsGel, ...(v.bonSol !== undefined ? { bearingDepth: v.bonSol } : {}),
        crawlHeight: v.hauteurVide, padSize: v.coteIsolee, padHeight: v.hauteurIsolee, hatches: [] };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: o }]);
    }
    case 'modifierFondations': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'foundation') return refus('fondations introuvables');
      const o = t.objet;
      if (cmd.genre !== undefined && !['crawl_space', 'slab_on_grade'].includes(cmd.genre)) return refus('soubassement inconnu');
      const e = fondationsInvalides({ largeur: cmd.largeur ?? o.footingWidth, hauteur: cmd.hauteur ?? o.footingHeight, horsGel: cmd.horsGel ?? o.frostDepth, bonSol: cmd.bonSol,
        hauteurVide: cmd.hauteurVide ?? o.crawlHeight, coteIsolee: cmd.coteIsolee ?? o.padSize, hauteurIsolee: cmd.hauteurIsolee ?? o.padHeight, trappes: cmd.trappes ?? o.hatches });
      if (e) return refus(e);
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      const champs = { genre: 'kind', largeur: 'footingWidth', hauteur: 'footingHeight', horsGel: 'frostDepth', bonSol: 'bearingDepth', hauteurVide: 'crawlHeight', coteIsolee: 'padSize', hauteurIsolee: 'padHeight' } as const;
      for (const k of Object.keys(champs) as (keyof typeof champs)[]) {
        if (cmd[k] === undefined) continue;
        avant[champs[k]] = o[champs[k]]; apres[champs[k]] = cmd[k];          // bonSol null : de nouveau inconnu
      }
      if (cmd.trappes) { avant['hatches'] = o.hatches; apres['hatches'] = cmd.trappes.map(q => ({ x: q.x, y: q.y })) }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t.niveauId, o, avant, apres, c)]);
    }
    case 'creerAmenagement': {
      if (!trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      const ferme = cmd.genre !== 'fence' || !!cmd.ferme;
      const e = amenagementInvalide(cmd.genre, cmd.points, ferme, cmd.finition, cmd.hauteur);
      if (e) return refus(e);
      const o: Landscape = {
        id: c.id(), type: 'landscape', floorId: cmd.niveau, ...provenance(c, undefined), revision: c.revision,
        kind: cmd.genre, points: cmd.points.map(q => ({ ...q })), closed: ferme, finish: cmd.finition, height: cmd.hauteur,
      };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: o }]);
    }
    case 'modifierAmenagement': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'landscape') return refus('aménagement introuvable');
      const o = t.objet, ferme = o.kind !== 'fence' || (cmd.ferme ?? o.closed);
      const e = amenagementInvalide(o.kind, cmd.points ?? o.points, ferme, cmd.finition ?? o.finish, cmd.hauteur ?? o.height);
      if (e) return refus(e);
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      if (cmd.points) { avant['points'] = o.points; apres['points'] = cmd.points.map(q => ({ ...q })) }
      if (cmd.ferme !== undefined && o.kind === 'fence') { avant['closed'] = o.closed; apres['closed'] = cmd.ferme }
      if (cmd.finition !== undefined) { avant['finish'] = o.finish; apres['finish'] = cmd.finition }
      if (cmd.hauteur !== undefined) { avant['height'] = o.height; apres['height'] = cmd.hauteur }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t.niveauId, o, avant, apres, c)]);
    }
    case 'creerParcelle': {
      if (!trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      if (p.buildings.flatMap(b => b.floors).some(f => Object.values(f.objects).some(o => o.type === 'plot'))) return refus('le projet a déjà une parcelle : modifiez-la');
      const e = parcelleInvalide(cmd.contour, cmd.voies ?? [], cmd.nord ?? 0, cmd.altitudeRdc) ?? (cmd.altitudesTerrain?.length ? altitudesInvalides(cmd.altitudesTerrain) : null)
        ?? (cmd.plu ? reglesPluInvalides(cmd.plu) : null);
      if (e) return refus(e);
      const t: Plot = {
        id: c.id(), type: 'plot', floorId: cmd.niveau, ...provenance(c, cmd.origine), revision: c.revision,
        contour: cmd.contour.map(q => ({ ...q })), street: [...(cmd.voies ?? [])], north: cmd.nord ?? 0,
        ...(cmd.nomVoie?.trim() ? { streetName: cmd.nomVoie.trim() } : {}), ...(cmd.reference?.trim() ? { reference: cmd.reference.trim() } : {}),
        ...(cmd.altitudeRdc !== undefined ? { groundFloorNgf: cmd.altitudeRdc } : {}),
        ...(cmd.altitudesTerrain?.length ? { spotHeights: cmd.altitudesTerrain.map(x => ({ point: { ...x.point }, ngf: x.ngf })) } : {}),
        ...(cmd.plu && Object.keys(cmd.plu).length ? { plu: { ...cmd.plu } } : {}),
      };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: t }]);
    }
    case 'modifierParcelle': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'plot') return refus('parcelle introuvable');
      const o = t.objet, contour = cmd.contour ?? o.contour;
      /* une nouvelle limite d'un autre nombre de côtés : les côtés sur voie ne veulent plus rien dire */
      const voies = cmd.voies ?? (contour.length === o.contour.length ? o.street : []);
      const e = parcelleInvalide(contour, voies, cmd.nord ?? o.north, cmd.altitudeRdc);
      if (e) return refus(e);
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      const poser = (k: keyof Plot, v: unknown) => { avant[k] = o[k]; apres[k] = v };
      if (cmd.contour) poser('contour', cmd.contour.map(q => ({ ...q })));
      if (cmd.voies || voies !== o.street) poser('street', [...voies]);
      if (cmd.nomVoie !== undefined) poser('streetName', cmd.nomVoie.trim() || undefined);
      if (cmd.reference !== undefined) poser('reference', cmd.reference.trim() || undefined);
      if (cmd.nord !== undefined) poser('north', cmd.nord);
      if (cmd.altitudeRdc !== undefined) poser('groundFloorNgf', cmd.altitudeRdc ?? undefined);
      if (cmd.terrainFini !== undefined) {
        if (cmd.terrainFini !== null && !(Number.isFinite(cmd.terrainFini) && cmd.terrainFini >= -3_000 && cmd.terrainFini <= 500)) return refus('terrain fini : entre 3 m sous le sol fini et 50 cm au-dessus');
        poser('finishedGround', cmd.terrainFini === null ? undefined : Math.round(cmd.terrainFini));
      }
      if (cmd.plu !== undefined) {
        if (cmd.plu !== null) { const ep = reglesPluInvalides(cmd.plu); if (ep) return refus(ep) }
        const R = cmd.plu ? Object.fromEntries(Object.entries(cmd.plu).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])) : {};
        poser('plu', Object.keys(R).length ? R : undefined);
      }
      if (cmd.cadastre !== undefined) {
        if (cmd.cadastre !== null) { const ec = cadastreInvalide(cmd.cadastre); if (ec) return refus(ec) }
        poser('cadastre', cmd.cadastre ?? undefined);
      } else if (cmd.contour && o.cadastre) {
        /* le fond cadastral suit la parcelle implantée, comme les points cotés */
        const f = deplacementRigide(o.contour, cmd.contour);
        if (f) poser('cadastre', deplacerCadastre(o.cadastre, f));
      }
      if (cmd.altitudesTerrain !== undefined) {
        const ea = altitudesInvalides(cmd.altitudesTerrain);
        if (ea) return refus(ea);
        poser('spotHeights', cmd.altitudesTerrain.length ? cmd.altitudesTerrain.map(x => ({ point: { ...x.point }, ngf: x.ngf })) : undefined);
      } else if (cmd.contour && o.spotHeights?.length) {
        /* les points cotés appartiennent au terrain : la parcelle implantée (déplacée, tournée) les emporte */
        const f = deplacementRigide(o.contour, cmd.contour);
        if (f) poser('spotHeights', o.spotHeights.map(x => ({ point: f(x.point), ngf: x.ngf })));
      }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t.niveauId, o, avant, apres, c)]);
    }
    case 'modifierToiture': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'roof') return refus('toiture introuvable');
      const r = t.objet;
      const e = toitureInvalide(cmd.genre ?? r.kind, cmd.pente ?? r.pitch, cmd.debord ?? r.overhang);
      if (e) return refus(e);
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      if (cmd.egout !== undefined && cmd.egout !== null && !['rafters', 'boxed', 'genoise_1', 'genoise_2', 'genoise_3'].includes(cmd.egout)) return refus('finition d’égout inconnue');
      if (cmd.gouttiere !== undefined && cmd.gouttiere !== null && !['half_round', 'ogee', 'box', 'none'].includes(cmd.gouttiere)) return refus('gouttière inconnue');
      if (cmd.matiereGouttiere !== undefined && cmd.matiereGouttiere !== null && !['zinc', 'pvc', 'aluminium', 'copper'].includes(cmd.matiereGouttiere)) return refus('matière de gouttière inconnue');
      if (cmd.talon !== undefined && !(Number.isFinite(cmd.talon) && cmd.talon >= 0 && cmd.talon <= 800)) return refus('talon de charpente : de 0 à 80 cm');
      if (cmd.descentes) {
        if (cmd.descentes.length > 30 || !cmd.descentes.every(ptFini)) return refus('descentes invalides');
        /* une descente part de l'égout : à 30 cm près de son contour */
        const toit = toitureDuNiveau(trouverNiveau(p, t.niveauId)!.floor);
        if (toit?.ok && cmd.descentes.some(q => !toit.toitures.some(x => x.egout.some((a, i) => distancePointSegment(q, { a, b: x.egout[(i + 1) % x.egout.length]! }) <= 300))))
          return refus('une descente se place sur l’égout de la toiture');
      }
      const champs = { genre: 'kind', pente: 'pitch', debord: 'overhang', couverture: 'covering', faitage: 'ridge', inverse: 'flip', talon: 'heel', egout: 'eavesFinish', gouttiere: 'gutter', matiereGouttiere: 'gutterMaterial' } as const;
      for (const k of Object.keys(champs) as (keyof typeof champs)[]) {
        if (cmd[k] === undefined) continue;
        avant[champs[k]] = r[champs[k]]; apres[champs[k]] = cmd[k];
      }
      if (cmd.descentes) { avant['downpipes'] = r.downpipes; apres['downpipes'] = cmd.descentes.length ? cmd.descentes.map(q => ({ x: q.x, y: q.y })) : undefined }
      else if (cmd.debord !== undefined && cmd.debord !== r.overhang && r.downpipes?.length) {
        /* le débord change : l'égout avance ou recule, les descentes le suivent (au point le plus proche du nouvel égout) */
        const f = trouverNiveau(p, t.niveauId)!.floor;
        const toit = toitureDuNiveau({ ...f, objects: { ...f.objects, [r.id]: { ...r, overhang: cmd.debord } } });
        if (toit?.ok) {
          const proche = (q: Point): Point => {
            let best = q, d = Infinity;
            for (const x of toit.toitures) x.egout.forEach((a, i) => {
              const b = x.egout[(i + 1) % x.egout.length]!, ab = soustraire(b, a), L2 = ab.x * ab.x + ab.y * ab.y || 1;
              const u = Math.max(0, Math.min(1, ((q.x - a.x) * ab.x + (q.y - a.y) * ab.y) / L2)), m = { x: Math.round(a.x + u * ab.x), y: Math.round(a.y + u * ab.y) };
              if (distance(m, q) < d) { d = distance(m, q); best = m }
            });
            return best;
          };
          avant['downpipes'] = r.downpipes; apres['downpipes'] = r.downpipes.map(proche);
        }
      }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t.niveauId, r, avant, apres, c)]);
    }
  }
}

/** une modification d'objet, avec révision et provenance */
function modifier(niveau: string, o: { id: string; revision: number; sourceRefs: SourceRef[] }, avant: Record<string, unknown>, apres: Record<string, unknown>, c: Contexte, label = 'Modification'): Operation {
  /* un champ absent s'écrit null : il le reste une fois le ChangeSet passé par le JSON */
  const nul = (x: Record<string, unknown>) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v === undefined ? null : v]));
  return { type: 'objet.modifier', niveau, id: o.id, avant: { ...nul(avant), revision: o.revision, sourceRefs: o.sourceRefs },
    apres: { ...nul(apres), revision: c.revision, sourceRefs: [...o.sourceRefs, source(c, label)] } };
}

/** les murs droits d'un niveau qui aboutissent à un point */
function murDroitsAuSommet(p: Project, niveau: string, s: Point): string[] {
  const n = trouverNiveau(p, niveau);
  if (!n) return [];
  return Object.values(n.floor.objects).filter(o => o.type === 'wall' && 'a' in o.axis
    && (distance(o.axis.a, s) <= EPS_COINCIDENCE || distance(o.axis.b, s) <= EPS_COINCIDENCE)).map(o => o.id);
}
