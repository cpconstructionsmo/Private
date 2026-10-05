/* Les outils de dessin : de purs automates. Ils reçoivent des gestes (en
   millimètres, déjà convertis depuis l'écran) et rendent des EFFETS : une
   commande à exécuter, un aperçu (commandes jouées pour voir, jamais
   enregistrées), une sélection, une question à poser. Ils ne touchent ni
   au DOM ni au modèle : l'application exécute les commandes (et peut donc
   les refuser), les tests rejouent des gestes sans navigateur. */
import type { Floor, Mm, ObjectAnchor, Opening, Point, Project, Wall } from '../model/types';
import type { Commande } from '../engine/commandes';
import { trouverNiveau } from '../model/projet';
import { accrochageDuNiveau, type Accroche } from '../building/accrochage';
import { mursDroits, type MurDroit } from '../building/murs';
import { planDuNiveau } from '../building/plan';
import { planVersImage } from '../building/fond';
import { positionDansAnneau } from '../geometry/predicats';
import { distancePointSegment, projeterSurDroite } from '../geometry/segment';
import { distance } from '../geometry/vecteur';
import { EPS_COINCIDENCE } from '../geometry/tolerance';
import { compositionMur, epaisseurComposition, roleDuGenre, type CompositionMur, type GenreMur } from '../catalogue/murs';
import { directionDEquerre, orientationDuPlan } from '../building/equerre';
import { dansCadre, viser } from './selection';
import { MODELES_OUVERTURES, modeleOuverture } from '../catalogue/ouvertures';
import { MODELES_MEUBLES, modeleMeuble } from '../catalogue/mobilier';
import { poserMeuble } from '../building/mobilier';
import { geometrieEscalier, hauteurAFranchir } from '../building/escalier';
import { GENRES_AMENAGEMENT, finitionAmenagement, finitionsDe, type GenreAmenagement } from '../catalogue/amenagements';

export type NomOutil = 'selection' | 'mur' | 'refend' | 'cloison' | 'fictive' | 'rectangle' | 'ouverture' | 'mobilier' | 'escalier' | 'coupe' | 'parcelle' | 'amenagement' | 'pointdevue' | 'fenetretoit' | 'altitude' | 'piece' | 'cote' | 'caler';

export interface Reglages {
  epaisseurMur: Mm;
  epaisseurCloison: Mm;
  /** le modèle de la bibliothèque posé par l'outil Ouverture */
  modeleOuverture: string;
  /** pas de la grille d'accrochage (0 : sans) */
  grille: Mm;
  /** l'outil Rectangle trace les faces extérieures (cotes hors tout) ou intérieures */
  rectangle: 'hors_tout' | 'interieur';
  /** le meuble posé par l'outil Mobilier, et son orientation quand il n'est pas contre un mur */
  modeleMeuble: string;
  rotationMeuble: number;
  /** l'escalier posé par l'outil Escalier : forme, largeur, sens de la montée */
  genreEscalier: 'straight' | 'quarter_left' | 'quarter_right';
  largeurEscalier: Mm;
  rotationEscalier: number;
  /** l'aménagement extérieur tracé par l'outil Aménagement, et son aspect */
  genreAmenagement: GenreAmenagement;
  finitionAmenagement: string;
  /** murs et cloisons aimantés à l'équerre pendant le tracé (Alt : libre) */
  equerre: boolean;
  /** la composition tracée pour chaque genre de mur (catalogue/murs.ts) ; '' : « sur mesure », à l'épaisseur réglée */
  compositions: Record<GenreMur, string>;
}

export const REGLAGES_DEFAUT: Reglages = { epaisseurMur: 200, epaisseurCloison: 70, modeleOuverture: 'pe-90x215', grille: 0, rectangle: 'hors_tout', modeleMeuble: 'canape-3p', rotationMeuble: 0, genreEscalier: 'straight', largeurEscalier: 900, rotationEscalier: 0, genreAmenagement: 'fence', finitionAmenagement: 'grillage-rigide-vert', equerre: true, compositions: { exterieur: '', interieur: '', cloison: '' } };

/** dimensions par défaut d'une ouverture neuve (largeur, hauteur, allège) — modifiables ensuite */
export const OUVERTURES: Record<Opening['kind'], { libelle: string; largeur: Mm; hauteur: Mm; allege: Mm }> = {
  door: { libelle: 'Porte', largeur: 900, hauteur: 2_150, allege: 0 },
  window: { libelle: 'Fenêtre', largeur: 1_200, hauteur: 1_250, allege: 900 },
  french_window: { libelle: 'Porte-fenêtre', largeur: 2_400, hauteur: 2_150, allege: 0 },
  garage_door: { libelle: 'Porte de garage', largeur: 2_400, hauteur: 2_000, allege: 0 },
  bay: { libelle: 'Baie', largeur: 2_400, hauteur: 2_150, allege: 0 },
  void: { libelle: 'Passage', largeur: 900, hauteur: 2_150, allege: 0 },
};

/** un geste, en coordonnées du monde */
export interface Geste {
  point: Point;
  /** rayon de capture (mm) : quelques pixels à l'écran */
  rayon: Mm;
  /** Alt : pas d'accrochage */
  alt?: boolean;
  /** Maj : direction bloquée à 45° près */
  maj?: boolean;
}

export type Demande =
  | { genre: 'nomPiece'; niveau: string; point: Point }
  | { genre: 'pointCote'; point: Point }
  | { genre: 'distanceFond'; id: string; image: [Point, Point] };

export interface Effet {
  commandes?: { titre: string; liste: Commande[] };
  apercu?: Commande[];
  selection?: string | null;
  accroche?: Accroche | null;
  demande?: Demande;
  /** un mot dans la barre d'état */
  aide?: string;
  /** l'outil a fini son geste (retour à la sélection, par exemple) */
  fini?: boolean;
  /** Maj + clic : ajouter cet objet au groupe choisi, ou l'en retirer */
  basculer?: string;
  /** les objets choisis ensemble (sélection par cadre) */
  groupe?: string[];
  /** le cadre de sélection en cours (null : plus de cadre) */
  cadre?: [Point, Point] | null;
}

interface Contexte { projet: Project; niveau: string; selection: string | null }

type Prise =
  | { genre: 'sommet'; de: Point; depart: Point }
  | { genre: 'mur'; mur: MurDroit; depart: Point }
  | { genre: 'ouverture'; id: string; mur: MurDroit; decalage: Mm }
  | { genre: 'meuble'; id: string; depart: Point; decalage: Point; largeur: Mm; profondeur: Mm; rotation: number }
  | { genre: 'cadre'; depart: Point }
  | { genre: 'escalier'; id: string; depart: Point; origine: Point }
  | { genre: 'coupe'; id: string; depart: Point; a: Point; b: Point }
  | { genre: 'pointdevue'; id: string; depart: Point; a: Point; b: Point }
  | { genre: 'fenetretoit'; id: string; depart: Point; centre: Point }
  | { genre: 'parcelle'; id: string; depart: Point; contour: Point[] }
  | { genre: 'amenagement'; id: string; depart: Point; points: Point[] };

const AIDES: Record<NomOutil, string> = {
  selection: 'Cliquer pour choisir ; tirer une extrémité, un mur ou une ouverture pour la déplacer',
  mur: 'Cliquer le départ puis chaque angle (aimanté à l’équerre ; Q : libre) — ou taper la longueur (4,50) puis Entrée ; 4,50<90 : longueur et angle ; Échap pour finir ; Maj : 45°',
  refend: 'Mur intérieur : cliquer le départ puis chaque angle — ou taper la longueur (4,50) puis Entrée ; Échap pour finir',
  cloison: 'Cloison : cliquer le départ puis l’arrivée — ou taper la longueur puis Entrée ; Échap pour finir',
  fictive: 'Cloison fictive (limite de pièce sans mur, une cuisine ouverte) : cliquer le départ puis l’arrivée, d’un mur à l’autre',
  rectangle: 'Rectangle de murs : cliquer deux angles opposés — ou, après le premier, taper 10x8 puis Entrée',
  ouverture: 'Choisir un modèle dans la bibliothèque (à droite), puis cliquer sur un mur — ou glisser le modèle sur le mur',
  mobilier: 'Choisir un meuble (à droite), puis cliquer pour le poser : près d’un mur il s’y plaque — T : tourner ; Alt : pose libre',
  escalier: 'Cliquer le départ de l’escalier (milieu de la première marche) — T : tourner le sens de la montée',
  coupe: 'Trait de coupe : cliquer le départ puis l’arrivée (Maj : 45°) ; la coupe regarde à gauche du trait — T pour l’inverser ensuite',
  parcelle: 'Limite de la parcelle : cliquer chaque sommet — ou taper la longueur du côté (12,50 ou 12,50<90) ; revenir au premier point ou Entrée pour fermer',
  amenagement: 'Aménagement (à droite : clôture, terrasse, allée…) : cliquer chaque point — ou taper la longueur ; Entrée pour finir une clôture, revenir au premier point pour fermer',
  pointdevue: 'Point de prise de vue d’une photographie du dossier : cliquer l’appareil, puis le point visé (Maj : 45°)',
  fenetretoit: 'Fenêtre de toit : cliquer sur un pan de la toiture (vue du niveau qui la porte) pour y poser un châssis de 78 × 98 cm',
  altitude: 'Point coté du terrain : cliquer où le géomètre a relevé une altitude, puis la saisir (NGF, en mètres)',
  piece: 'Cliquer dans un espace clos pour le nommer',
  cote: 'Cliquer deux murs (ou deux extrémités) à coter',
  caler: 'Cliquer deux points du fond dont vous connaissez la distance réelle',
};

/** bloquer une direction à 45° près, depuis un point */
function bloquer(depuis: Point, p: Point): Point {
  const dx = p.x - depuis.x, dy = p.y - depuis.y, L = Math.round(Math.hypot(dx, dy));
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: depuis.x + Math.round(L * Math.cos(a) * 1e6) / 1e6, y: depuis.y + Math.round(L * Math.sin(a) * 1e6) / 1e6 };
}

/** une longueur tapée : « 4,50 » (m), « 450cm », « 4500mm » ; null si illisible */
export function lireLongueur(t: string): Mm | null {
  const m = /^\s*(\d+(?:[.,]\d*)?|[.,]\d+)\s*(mm|cm|m)?\s*$/i.exec(t);
  if (!m) return null;
  const v = Number(m[1]!.replace(',', '.')), u = (m[2] ?? 'm').toLowerCase();
  const mm = Math.round(v * (u === 'mm' ? 1 : u === 'cm' ? 10 : 1_000) * 1e3) / 1e3;
  return mm > 0 ? mm : null;
}

/** ce qu'on peut taper pendant un tracé : une longueur, avec un angle (« 4,50<90 »), ou deux (« 10x8 ») */
export type Saisie = { genre: 'longueur'; longueur: Mm; angle?: number } | { genre: 'rectangle'; largeur: Mm; profondeur: Mm };
export function lireSaisie(t: string): Saisie | null {
  const r = /^(.+?)\s*[x×*]\s*(.+)$/i.exec(t.trim());
  if (r) {
    const a = lireLongueur(r[1]!), b = lireLongueur(r[2]!);
    return a && b ? { genre: 'rectangle', largeur: a, profondeur: b } : null;
  }
  const [l, an, ...reste] = t.split('<');
  if (reste.length) return null;
  const L = lireLongueur(l ?? '');
  if (!L) return null;
  if (an === undefined) return { genre: 'longueur', longueur: L };
  const deg = Number(an.trim().replace(',', '.'));
  return an.trim() && Number.isFinite(deg) ? { genre: 'longueur', longueur: L, angle: deg } : null;
}

const arrondi = (v: number) => Math.round(v * 1e6) / 1e6;

export class Outils {
  outil: NomOutil = 'selection';
  reglages: Reglages = { ...REGLAGES_DEFAUT };
  /** tracé de murs en cours */
  private depart: Point | null = null;
  private premier: Point | null = null;
  private prise: Prise | null = null;
  private bouge = false;
  /** la dernière position d'un glissement : c'est elle qu'on valide au relâcher */
  private dernier: Commande | null = null;
  private ancres: ObjectAnchor[] = [];
  private clicsFond: Point[] = [];
  /** le dernier point visé pendant un tracé : il donne la direction d'une longueur tapée */
  private vise: Point | null = null;
  /** les sommets de la limite de parcelle en cours de tracé */
  private sommetsTrace: Point[] = [];

  constructor(private readonly contexte: () => Contexte) {}

  private niveau(): Floor | null { const c = this.contexte(); return trouverNiveau(c.projet, c.niveau)?.floor ?? null }

  choisir(o: NomOutil): Effet {
    this.annulerGeste();
    this.outil = o;
    return { aide: AIDES[o], apercu: [] };
  }

  get aide(): string { return AIDES[this.outil] }
  /** un point accroché (le collage s'en sert pour poser un groupe sur un angle) */
  pointAccroche(g: Geste): Accroche { return this.accrocher(g) }

  get traceEnCours(): boolean { return this.depart !== null || this.prise !== null || this.ancres.length > 0 || this.clicsFond.length > 0 }

  private annulerGeste(): void { this.sommetsTrace = []; this.depart = null; this.premier = null; this.prise = null; this.bouge = false; this.dernier = null; this.ancres = []; this.clicsFond = []; this.vise = null }

  /** la limite en cours de tracé, jusqu'au dernier point visé (pour la dessiner) */
  get parcelleEnCours(): Point[] { return this.sommetsTrace.length ? [...this.sommetsTrace, ...(this.vise ? [this.vise] : [])] : [] }

  /** un sommet de plus pour la limite ; fermée (retour au premier point), elle devient la parcelle */
  private sommetTrace(p: Point, rayon: Mm): Effet {
    const S = this.sommetsTrace;
    if (S.length >= 3 && distance(p, S[0]!) <= Math.max(rayon, EPS_COINCIDENCE)) return this.outil === 'amenagement' ? this.finirAmenagement(true) : this.fermerParcelle();
    if (S.length && distance(p, S[S.length - 1]!) < 100) return {};
    S.push(p); this.depart = p; this.vise = null;
    return { aide: S.length < 3 ? 'Sommet suivant — ou tapez la longueur du côté' : 'Sommet suivant ; revenir au premier point ou Entrée pour fermer la limite' };
  }
  /** l'aspect posé (le premier du genre si l'identifiant ne lui va pas) */
  get finitionAmenagement() {
    const r = this.reglages, f = finitionAmenagement(r.finitionAmenagement);
    return f && f.genre === r.genreAmenagement ? f : finitionsDe(r.genreAmenagement)[0]!;
  }
  /** le niveau le plus bas (le terrain) : parcelle, aménagements et points de vue s'y posent */
  private niveauBas(c: { projet: Project; niveau: string }): string {
    return [...(c.projet.buildings[0]?.floors ?? [])].sort((a, b) => a.elevation - b.elevation)[0]?.id ?? c.niveau;
  }
  /** finir l'aménagement tracé : une clôture peut rester ouverte, une surface se ferme toujours */
  private finirAmenagement(ferme: boolean): Effet {
    const c = this.contexte(), S = this.sommetsTrace, g = this.reglages.genreAmenagement, fin = this.finitionAmenagement;
    const surface = !GENRES_AMENAGEMENT[g].ligne;
    if (S.length < (surface ? 3 : 2)) return { aide: surface ? 'Trois sommets au moins' : 'Deux points au moins' };
    const bas = [...(c.projet.buildings[0]?.floors ?? [])].sort((a, b) => a.elevation - b.elevation)[0];
    const cmd: Commande = { type: 'creerAmenagement', niveau: bas?.id ?? c.niveau, genre: g, points: S.map(q => ({ ...q })), ferme: surface || ferme, finition: fin.id, hauteur: fin.hauteur };
    this.annulerGeste();
    return { commandes: { titre: GENRES_AMENAGEMENT[g].libelle, liste: [cmd] }, apercu: [], aide: AIDES.amenagement };
  }
  private fermerParcelle(): Effet {
    const c = this.contexte(), S = this.sommetsTrace;
    if (S.length < 3) return { aide: 'Trois sommets au moins' };
    /* la parcelle se pose sur le niveau le plus bas (le terrain), quel que soit le niveau affiché */
    const bas = [...(c.projet.buildings[0]?.floors ?? [])].sort((a, b) => a.elevation - b.elevation)[0];
    const cmd: Commande = { type: 'creerParcelle', niveau: bas?.id ?? c.niveau, contour: S.map(q => ({ ...q })) };
    this.annulerGeste(); this.outil = 'selection';
    return { commandes: { titre: 'Parcelle', liste: [cmd] }, apercu: [], fini: true, aide: AIDES.selection };
  }

  /** le point de départ d'un tracé en cours (mur, cloison, rectangle) */
  get departTrace(): Point | null { return this.depart }

  /** le point accroché (ou le point brut avec Alt) ; equerre : le tracé d'un mur, aimanté à angle droit */
  private accrocher(g: Geste, depuis?: Point | null, equerre = false): Accroche {
    const f = this.niveau();
    let a: Accroche = f ? accrochageDuNiveau(f).chercher(g.point, { rayon: g.rayon, desactive: !!g.alt, grille: this.reglages.grille, ...(depuis ? { depuis } : {}) })
      : { point: g.point, genre: 'libre' };
    const q = equerre && f && depuis && this.reglages.equerre && !g.alt && !g.maj ? this.aEquerre(f, depuis, a, g) : null;
    if (q) a = q;
    else if (g.maj && depuis) a = { point: bloquer(depuis, a.point), genre: 'libre' };
    /* un point libre (sans accroche) vient d'un pixel : on le garde au millimètre */
    else if (a.genre === 'libre') a = { ...a, point: { x: Math.round(a.point.x), y: Math.round(a.point.y) } };
    /* sur une face ou un axe : la position le long du mur, au millimètre */
    else if (a.support && (a.genre === 'face' || a.genre === 'axe')) {
      const { a: A, b: B } = a.support, L = distance(A, B);
      if (L > 0) {
        const t = Math.min(L, Math.max(0, Math.round(projeterSurDroite(a.point, a.support).t * L))) / L;
        a = { ...a, point: { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) } };
      }
    }
    /* alignement : la coordonnée qui suit le curseur aussi (l'autre est celle du départ, exacte) */
    else if (a.genre === 'alignement' && depuis) a = { ...a, point: a.point.y === depuis.y ? { x: Math.round(a.point.x), y: a.point.y } : { x: a.point.x, y: Math.round(a.point.y) } };
    return a;
  }

  /** le point d'équerre : sur la direction d'équerre la plus proche du curseur (au millimètre, ou au pas de la grille),
      ou là où elle coupe la face visée ; une accroche exacte (extrémité, intersection, milieu, perpendiculaire)
      l'emporte, et un mur franchement biais reste libre (null) */
  private aEquerre(f: Floor, depuis: Point, a: Accroche, g: Geste): Accroche | null {
    if (a.genre === 'extremite' || a.genre === 'intersection' || a.genre === 'milieu' || a.genre === 'perpendiculaire') return null;
    const u = directionDEquerre(depuis, g.point, orientationDuPlan(f));
    if (!u) return null;
    if ((a.genre === 'face' || a.genre === 'axe') && a.support) {
      const { a: A, b: B } = a.support, v = { x: B.x - A.x, y: B.y - A.y }, w = { x: A.x - depuis.x, y: A.y - depuis.y };
      const det = u.x * v.y - u.y * v.x;
      if (Math.abs(det) <= EPS_COINCIDENCE) return null;
      const s = (w.x * v.y - w.y * v.x) / det, t = (w.x * u.y - w.y * u.x) / det;
      const p = { x: arrondi(depuis.x + s * u.x), y: arrondi(depuis.y + s * u.y) };
      return s > EPS_COINCIDENCE && t >= 0 && t <= 1 && distance(p, g.point) <= 3 * g.rayon ? { ...a, point: p, guide: { a: depuis, b: p } } : null;
    }
    const pas = this.reglages.grille > 0 ? this.reglages.grille : 1;
    const s = Math.round(((g.point.x - depuis.x) * u.x + (g.point.y - depuis.y) * u.y) / pas) * pas;
    if (!(s > 0)) return null;
    const p = { x: arrondi(depuis.x + s * u.x), y: arrondi(depuis.y + s * u.y) };
    return { point: p, genre: 'equerre', guide: { a: depuis, b: p } };
  }

  /** Q : l'équerre du tracé, oui ou non */
  basculerEquerre(oui = !this.reglages.equerre): Effet {
    this.reglages.equerre = oui;
    return { aide: oui ? 'Murs aimantés à l’équerre (Alt : libre le temps d’un clic)' : 'Équerre coupée : murs libres (Maj : 45°)' };
  }

  private murSous(g: Geste): MurDroit | null {
    const f = this.niveau();
    if (!f) return null;
    let meilleur: { w: MurDroit; d: number } | null = null;
    for (const w of mursDroits(f)) {
      const d = distancePointSegment(g.point, w.axis);
      if (d <= Math.max(w.thickness / 2, 0) + g.rayon && (!meilleur || d < meilleur.d)) meilleur = { w, d };
    }
    return meilleur?.w ?? null;
  }

  /** le meuble posé (le premier de la bibliothèque si l'identifiant est inconnu) */
  get meuble() { return modeleMeuble(this.reglages.modeleMeuble) ?? MODELES_MEUBLES[0]! }

  /** le meuble à poser en p : plaqué contre un mur proche (sauf Alt) */
  private meubleEn(g: Geste): Commande {
    const m = this.meuble;
    const pose = g.alt ? { position: g.point, rotation: this.reglages.rotationMeuble }
      : poserMeuble(this.niveau()!, g.point, m.largeur, m.profondeur, this.reglages.rotationMeuble, 300 + g.rayon);
    return { type: 'creerMeuble', niveau: this.contexte().niveau, modele: { id: m.id, label: m.libelle }, position: { x: Math.round(pose.position.x), y: Math.round(pose.position.y) },
      rotation: pose.rotation, largeur: m.largeur, profondeur: m.profondeur, hauteur: m.hauteur };
  }

  /** T : un quart de tour pour le meuble ou l'escalier à poser */
  tourner(): Effet {
    if (this.outil === 'escalier') {
      this.reglages.rotationEscalier = (this.reglages.rotationEscalier + Math.PI / 2) % (2 * Math.PI);
      return { aide: 'Escalier tourné d’un quart de tour' };
    }
    this.reglages.rotationMeuble = (this.reglages.rotationMeuble + Math.PI / 2) % (2 * Math.PI);
    return { aide: 'Meuble tourné d’un quart de tour (près d’un mur, il s’oriente seul)' };
  }

  /** l'escalier à poser, départ en p (accroché) */
  private escalierEn(g: Geste): Commande {
    const p = this.accrocher(g).point, r = this.reglages;
    return { type: 'creerEscalier', niveau: this.contexte().niveau, genre: r.genreEscalier, position: { x: Math.round(p.x), y: Math.round(p.y) }, rotation: r.rotationEscalier, largeur: r.largeurEscalier };
  }

  /** l'emprise des escaliers du niveau, pour les viser */
  private escaliers(): { id: string; emprise: Point[] }[] {
    const c = this.contexte(), f = this.niveau();
    if (!f) return [];
    const H = hauteurAFranchir(c.projet, f);
    return Object.values(f.objects).flatMap(o => (o.type === 'stair' ? [{ id: o.id, emprise: geometrieEscalier(o, H).emprise }] : []));
  }

  /** le modèle posé (le premier de la bibliothèque si l'identifiant est inconnu) */
  get modele() { return modeleOuverture(this.reglages.modeleOuverture) ?? MODELES_OUVERTURES[0]! }

  private ouvertureSur(w: MurDroit, p: Point): Commande | null {
    const L = distance(w.axis.a, w.axis.b), d = this.modele;
    if (d.largeur > L) return null;
    const t = projeterSurDroite(p, w.axis).t * L;
    const position = Math.round(Math.min(L - d.largeur / 2, Math.max(d.largeur / 2, t)));
    return { type: 'creerOuverture', mur: w.id, position, largeur: d.largeur, hauteur: d.hauteur, allege: d.allege, genre: d.genre,
      vantaux: d.vantaux, manoeuvre: d.manoeuvre, modele: { id: d.id, label: d.libelle } };
  }

  bouger(g: Geste): Effet {
    const c = this.contexte();
    switch (this.outil) {
      case 'selection': {
        if (!this.prise) return { accroche: null };
        const p = this.prise;
        if (p.genre === 'cadre') return { cadre: [p.depart, g.point] };
        if (p.genre === 'amenagement') {
          if (!this.bouge && distance(g.point, p.depart) < g.rayon / 3) return {};
          this.bouge = true;
          const dx = Math.round(g.point.x - p.depart.x), dy = Math.round(g.point.y - p.depart.y);
          this.dernier = { type: 'modifierAmenagement', id: p.id, points: p.points.map(q => ({ x: q.x + dx, y: q.y + dy })) };
          return { apercu: [this.dernier] };
        }
        if (p.genre === 'parcelle') {
          if (!this.bouge && distance(g.point, p.depart) < g.rayon / 3) return {};
          this.bouge = true;
          const dx = Math.round(g.point.x - p.depart.x), dy = Math.round(g.point.y - p.depart.y);
          this.dernier = { type: 'modifierParcelle', id: p.id, contour: p.contour.map(q => ({ x: q.x + dx, y: q.y + dy })) };
          return { apercu: [this.dernier] };
        }
        if (p.genre === 'fenetretoit') {
          if (!this.bouge && distance(g.point, p.depart) < g.rayon / 3) return {};
          this.bouge = true;
          this.dernier = { type: 'modifierFenetreToit', id: p.id, centre: { x: Math.round(p.centre.x + g.point.x - p.depart.x), y: Math.round(p.centre.y + g.point.y - p.depart.y) } };
          return { apercu: [this.dernier] };
        }
        if (p.genre === 'coupe' || p.genre === 'pointdevue') {
          if (!this.bouge && distance(g.point, p.depart) < g.rayon / 3) return {};
          this.bouge = true;
          const dx = Math.round(g.point.x - p.depart.x), dy = Math.round(g.point.y - p.depart.y);
          const a = { x: p.a.x + dx, y: p.a.y + dy }, b = { x: p.b.x + dx, y: p.b.y + dy };
          this.dernier = p.genre === 'coupe' ? { type: 'modifierCoupe', id: p.id, a, b } : { type: 'modifierPointDeVue', id: p.id, a, b };
          return { apercu: [this.dernier] };
        }
        if (p.genre === 'escalier') {
          if (!this.bouge && distance(g.point, p.depart) < g.rayon / 3) return {};
          this.bouge = true;
          this.dernier = { type: 'modifierEscalier', id: p.id, position: { x: Math.round(p.origine.x + g.point.x - p.depart.x), y: Math.round(p.origine.y + g.point.y - p.depart.y) } };
          return { apercu: [this.dernier] };
        }
        if (p.genre === 'meuble') {
          /* un clic n'est pas un déplacement : sans mouvement franc, le meuble reste où il est */
          if (!this.bouge && distance(g.point, p.depart) < g.rayon / 3) return {};
          const vise = { x: g.point.x - p.decalage.x, y: g.point.y - p.decalage.y };
          const pose = g.alt ? { position: vise, rotation: p.rotation } : poserMeuble(this.niveau()!, vise, p.largeur, p.profondeur, p.rotation, 300 + g.rayon);
          this.bouge = true;
          this.dernier = { type: 'modifierMeuble', id: p.id, position: { x: Math.round(pose.position.x), y: Math.round(pose.position.y) }, rotation: pose.rotation };
          return { apercu: [this.dernier] };
        }
        if (p.genre === 'ouverture') {
          const L = distance(p.mur.axis.a, p.mur.axis.b);
          const position = Math.round(projeterSurDroite(g.point, p.mur.axis).t * L - p.decalage);
          this.bouge = true;
          this.dernier = { type: 'modifierOuverture', id: p.id, position };
          return { apercu: [this.dernier] };
        }
        const a = this.accrocher(g, p.depart);
        if (distance(a.point, p.depart) > EPS_COINCIDENCE) this.bouge = true;
        if (!this.bouge) return { accroche: a };
        /* une translation de mur se fait au millimètre, sauf accroche exacte */
        const exact = a.genre !== 'libre' && a.genre !== 'grille';
        const dx = exact ? a.point.x - p.depart.x : Math.round(a.point.x - p.depart.x), dy = exact ? a.point.y - p.depart.y : Math.round(a.point.y - p.depart.y);
        this.dernier = p.genre === 'sommet' ? { type: 'deplacerSommet', niveau: c.niveau, de: p.de, vers: a.point }
          : { type: 'deplacerMur', id: p.mur.id, a: { x: p.mur.axis.a.x + dx, y: p.mur.axis.a.y + dy }, b: { x: p.mur.axis.b.x + dx, y: p.mur.axis.b.y + dy } };
        return { accroche: a, apercu: [this.dernier] };
      }
      case 'mur':
      case 'refend':
      case 'cloison':
      case 'fictive': {
        const a = this.accrocher(g, this.depart, true);
        if (!this.depart || distance(a.point, this.depart) <= EPS_COINCIDENCE) return { accroche: a, apercu: [] };
        this.vise = a.point;
        return { accroche: a, apercu: [this.murDe(this.depart, a.point)] };
      }
      case 'rectangle': {
        const a = this.accrocher(g);
        if (!this.depart) return { accroche: a, apercu: [] };
        this.vise = a.point;
        const r = this.rectangleDe(this.depart, a.point);
        return { accroche: a, apercu: typeof r === 'string' ? [] : r };
      }
      case 'ouverture': {
        const w = this.murSous(g);
        const cmd = w ? this.ouvertureSur(w, g.point) : null;
        return { accroche: null, apercu: cmd ? [cmd] : [] };
      }
      case 'mobilier':
        return { accroche: null, apercu: [this.meubleEn(g)] };
      case 'escalier':
        return { accroche: this.accrocher(g), apercu: [this.escalierEn(g)] };
      case 'parcelle':
      case 'amenagement': {
        const a = this.accrocher(g, this.depart);
        if (this.sommetsTrace.length) this.vise = a.point;
        return { accroche: a };
      }
      case 'coupe': {
        const a = this.accrocher(g, this.depart);
        if (!this.depart || distance(a.point, this.depart) < 500) return { accroche: a, apercu: [] };
        return { accroche: a, apercu: [{ type: 'creerCoupe', niveau: c.niveau, a: this.depart, b: a.point }] };
      }
      case 'altitude':
        return { accroche: null };
      case 'fenetretoit':
        return { accroche: null, apercu: [{ type: 'creerFenetreToit', niveau: c.niveau, centre: { x: Math.round(g.point.x), y: Math.round(g.point.y) } }] };
      case 'pointdevue': {
        const a = this.accrocher(g, this.depart);
        if (!this.depart || distance(a.point, this.depart) < 500) return { accroche: a, apercu: [] };
        return { accroche: a, apercu: [{ type: 'creerPointDeVue', niveau: this.niveauBas(c), a: this.depart, b: a.point }] };
      }
      case 'cote':
      case 'caler':
        return { accroche: this.accrocher(g) };
      case 'piece':
        return { accroche: null };
    }
  }

  /** quatre murs fermés, dans le sens trigonométrique (l'intérieur à gauche) ; leur
      tracé est la face extérieure (hors tout) ou la face intérieure, selon le réglage */
  private rectangleDe(p: Point, q: Point): Commande[] | string {
    const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x), y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y);
    const k = compositionMur(this.reglages.compositions.exterieur);
    const e = k ? epaisseurComposition(k) : this.reglages.epaisseurMur, horsTout = this.reglages.rectangle === 'hors_tout';
    if (x1 - x0 <= EPS_COINCIDENCE || y1 - y0 <= EPS_COINCIDENCE) return 'Tirez un rectangle';
    if (horsTout && Math.min(x1 - x0, y1 - y0) <= 2 * e) return 'Rectangle trop petit pour l’épaisseur des murs';
    const P = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
    const niveau = this.contexte().niveau;
    return P.map((a, i) => ({ type: 'creerMur', niveau, a, b: P[(i + 1) % 4]!, epaisseur: e, role: 'exterior', justification: horsTout ? 'right' : 'left', ...(k ? { composition: k.id } : {}) }) as Commande);
  }

  /** le genre de mur de l'outil, son rôle, et sa composition choisie (s'il en a une) */
  get murTrace(): { role: Wall['role']; genre: GenreMur | null; composition: CompositionMur | undefined; epaisseur: Mm } {
    const o = this.outil, r = this.reglages;
    const genre: GenreMur | null = o === 'refend' ? 'interieur' : o === 'cloison' ? 'cloison' : o === 'fictive' ? null : 'exterieur';
    const composition = genre ? compositionMur(r.compositions[genre]) : undefined;
    const role: Wall['role'] = genre ? roleDuGenre(genre) : 'virtual';
    return { role, genre, composition, epaisseur: composition ? epaisseurComposition(composition) : o === 'cloison' ? r.epaisseurCloison : r.epaisseurMur };
  }
  private murDe(a: Point, b: Point): Commande {
    const t = this.murTrace;
    return { type: 'creerMur', niveau: this.contexte().niveau, a, b, epaisseur: t.epaisseur, role: t.role, ...(t.composition ? { composition: t.composition.id } : {}) };
  }

  appuyer(g: Geste): Effet {
    const c = this.contexte(), f = this.niveau();
    if (!f) return {};
    switch (this.outil) {
      case 'selection': {
        const cible = viser(f, g.point, g.rayon, true, this.escaliers());
        this.bouge = false; this.dernier = null;
        /* dans le vide : un cadre de sélection commence */
        if (!cible) { this.prise = { genre: 'cadre', depart: g.point }; return { selection: null, groupe: [] } }
        /* Maj + clic : composer un groupe */
        if (g.maj) { this.prise = null; return cible.genre === 'objet' ? { basculer: cible.id } : cible.murs.length === 1 ? { basculer: cible.murs[0]! } : {} }
        if (cible.genre === 'sommet') {
          this.prise = { genre: 'sommet', de: cible.point, depart: cible.point };
          return cible.murs.length === 1 ? { selection: cible.murs[0]! } : {};
        }
        const o = f.objects[cible.id];
        if (o?.type === 'wall' && 'a' in o.axis) this.prise = { genre: 'mur', mur: o as MurDroit, depart: this.accrocher(g).point };
        else if (o?.type === 'stair') this.prise = { genre: 'escalier', id: o.id, depart: g.point, origine: { ...o.position } };
        else if (o?.type === 'section') this.prise = { genre: 'coupe', id: o.id, depart: g.point, a: { ...o.a }, b: { ...o.b } };
        else if (o?.type === 'viewpoint') this.prise = { genre: 'pointdevue', id: o.id, depart: g.point, a: { ...o.a }, b: { ...o.b } };
        else if (o?.type === 'roof_window') this.prise = { genre: 'fenetretoit', id: o.id, depart: g.point, centre: { ...o.center } };
        else if (o?.type === 'landscape') this.prise = { genre: 'amenagement', id: o.id, depart: g.point, points: o.points.map(q => ({ ...q })) };
        else if (o?.type === 'plot') this.prise = { genre: 'parcelle', id: o.id, depart: g.point, contour: o.contour.map(q => ({ ...q })) };
        else if (o?.type === 'furniture') this.prise = { genre: 'meuble', id: o.id, depart: g.point, decalage: { x: g.point.x - o.position.x, y: g.point.y - o.position.y }, largeur: o.width, profondeur: o.depth, rotation: o.rotation };
        else if (o?.type === 'opening') {
          const w = f.objects[o.hostWallId];
          if (w?.type === 'wall' && 'a' in w.axis) {
            const mur = w as MurDroit;
            this.prise = { genre: 'ouverture', id: o.id, mur, decalage: projeterSurDroite(g.point, mur.axis).t * distance(mur.axis.a, mur.axis.b) - o.offset };
          }
        } else this.prise = null;
        return { selection: cible.id };
      }
      case 'mur':
      case 'refend':
      case 'cloison':
      case 'fictive': {
        const a = this.accrocher(g, this.depart, true);
        if (!this.depart) { this.depart = a.point; this.premier = a.point; return { accroche: a } }
        return this.poserMur(a.point);
      }
      case 'rectangle': {
        const a = this.accrocher(g);
        if (!this.depart) { this.depart = a.point; return { accroche: a, aide: 'Second angle — ou tapez largeur x profondeur (10x8) puis Entrée' } }
        return this.poserRectangle(a.point);
      }
      case 'ouverture': {
        const w = this.murSous(g);
        if (!w) return { aide: 'Cliquez sur un mur' };
        const cmd = this.ouvertureSur(w, g.point);
        if (!cmd) return { aide: 'Mur trop court pour cette ouverture' };
        return { commandes: { titre: this.modele.libelle, liste: [cmd] }, apercu: [] };
      }
      case 'mobilier':
        return { commandes: { titre: this.meuble.libelle, liste: [this.meubleEn(g)] }, apercu: [] };
      case 'escalier':
        { const cmd = this.escalierEn(g); this.outil = 'selection'; return { commandes: { titre: 'Escalier', liste: [cmd] }, apercu: [], fini: true, aide: AIDES.selection } }
      case 'parcelle': {
        if (!this.sommetsTrace.length && c.projet.buildings.flatMap(b => b.floors).flatMap(x => Object.values(x.objects)).some(o => o.type === 'plot'))
          return { aide: 'Le projet a déjà une parcelle : choisissez-la pour la modifier, ou supprimez-la pour la retracer' };
        return this.sommetTrace(this.accrocher(g, this.depart).point, g.rayon);
      }
      case 'amenagement':
        return this.sommetTrace(this.accrocher(g, this.depart).point, g.rayon);
      case 'coupe': {
        const a = this.accrocher(g, this.depart);
        if (!this.depart) { this.depart = a.point; return { accroche: a, aide: 'Arrivée du trait de coupe (Maj : 45°) — Échap pour renoncer' } }
        if (distance(a.point, this.depart) < 500) return { aide: 'Trait trop court : 50 cm au moins' };
        const cmd: Commande = { type: 'creerCoupe', niveau: c.niveau, a: this.depart, b: a.point };
        this.depart = null; this.outil = 'selection';
        return { commandes: { titre: 'Trait de coupe', liste: [cmd] }, apercu: [], fini: true, aide: AIDES.selection };
      }
      case 'altitude':
        return { demande: { genre: 'pointCote', point: { ...g.point } }, aide: AIDES.altitude };
      case 'fenetretoit': {
        const cmd: Commande = { type: 'creerFenetreToit', niveau: c.niveau, centre: { x: Math.round(g.point.x), y: Math.round(g.point.y) } };
        return { commandes: { titre: 'Fenêtre de toit', liste: [cmd] }, apercu: [], aide: AIDES.fenetretoit };
      }
      case 'pointdevue': {
        const a = this.accrocher(g, this.depart);
        if (!this.depart) { this.depart = a.point; return { accroche: a, aide: 'Point visé : la direction de la photographie (Maj : 45°) — Échap pour renoncer' } }
        if (distance(a.point, this.depart) < 500) return { aide: 'Direction trop courte : 50 cm au moins' };
        const cmd: Commande = { type: 'creerPointDeVue', niveau: this.niveauBas(c), a: this.depart, b: a.point };
        this.depart = null; this.outil = 'selection';
        return { commandes: { titre: 'Point de prise de vue', liste: [cmd] }, apercu: [], fini: true, aide: AIDES.selection };
      }
      case 'piece': {
        const z = planDuNiveau(f).zones.find(z => positionDansAnneau(g.point, z.polygone.contour) === 'dedans');
        if (!z) return { aide: 'Cliquez à l’intérieur d’un espace fermé par des murs' };
        if (z.piece) return { selection: z.piece.id };
        return { demande: { genre: 'nomPiece', niveau: c.niveau, point: g.point } };
      }
      case 'cote': {
        const cible = viser(f, g.point, g.rayon);
        let ancre: ObjectAnchor | null = null;
        if (cible?.genre === 'sommet' && cible.murs[0]) {
          const w = f.objects[cible.murs[0]] as MurDroit;
          ancre = { objectId: w.id, feature: distance(w.axis.a, cible.point) <= EPS_COINCIDENCE ? 'start' : 'end' };
        } else if (cible?.genre === 'objet' && cible.type === 'wall') ancre = { objectId: cible.id, feature: 'axis' };
        if (!ancre) return { aide: 'Cliquez sur un mur ou sur une extrémité de mur' };
        this.ancres.push(ancre);
        if (this.ancres.length < 2) return { aide: 'Second mur (ou extrémité)' };
        const refs = this.ancres as [ObjectAnchor, ObjectAnchor];
        this.ancres = [];
        return { commandes: { titre: 'Cote', liste: [{ type: 'creerCote', niveau: c.niveau, refs }] } };
      }
      case 'caler': {
        const u = c.selection ? f.objects[c.selection] : undefined;
        if (!u || u.type !== 'underlay') return { aide: 'Choisissez d’abord le fond à caler (panneau Niveau)' };
        if (u.locked) return { aide: 'Fond verrouillé : déverrouillez-le pour le caler' };
        this.clicsFond.push(planVersImage(u.transform, this.accrocher(g).point));
        if (this.clicsFond.length < 2) return { aide: 'Second point du fond' };
        const image = this.clicsFond as [Point, Point];
        this.clicsFond = [];
        return { demande: { genre: 'distanceFond', id: u.id, image }, fini: true };
      }
    }
  }

  /** finir un trait de mur ou de cloison en p */
  private poserMur(p: Point): Effet {
    if (!this.depart || distance(p, this.depart) <= EPS_COINCIDENCE) return {};
    const cmd = this.murDe(this.depart, p);
    /* un tour fermé (retour au premier point) termine le tracé ; une
       cloison s'arrête à chaque trait */
    const ferme = this.premier !== null && distance(p, this.premier) <= EPS_COINCIDENCE;
    if (ferme || this.outil === 'cloison' || this.outil === 'fictive') { this.depart = null; this.premier = null } else this.depart = p;
    this.vise = null;
    return { commandes: { titre: this.outil === 'cloison' ? 'Cloison' : this.outil === 'fictive' ? 'Cloison fictive' : this.outil === 'refend' ? 'Mur intérieur' : 'Mur', liste: [cmd] }, apercu: [] };
  }

  private poserRectangle(q: Point): Effet {
    if (!this.depart) return {};
    const r = this.rectangleDe(this.depart, q);
    if (typeof r === 'string') return { aide: r };
    this.depart = null; this.vise = null;
    return { commandes: { titre: 'Rectangle de murs', liste: r }, apercu: [] };
  }

  /** une longueur tapée au clavier pendant un tracé (voir lireSaisie) : le mur
      part dans la direction visée (ou selon l'angle tapé, en degrés depuis
      l'axe des x, sens trigonométrique) ; le rectangle s'ouvre vers le curseur */
  saisir(texte: string): Effet {
    const s = lireSaisie(texte), d = this.depart;
    if (!s) return { aide: 'Saisie illisible : tapez une longueur en mètres (4,50), 4,50<90 pour un angle, ou 10x8 pour un rectangle' };
    if (!d) return { aide: 'Cliquez d’abord le point de départ' };
    if (this.outil === 'rectangle') {
      if (s.genre !== 'rectangle') return { aide: 'Rectangle : tapez largeur x profondeur (10x8)' };
      const v = this.vise ?? { x: d.x + 1, y: d.y + 1 };
      const sx = v.x < d.x ? -1 : 1, sy = v.y < d.y ? -1 : 1;
      return this.poserRectangle({ x: arrondi(d.x + sx * s.largeur), y: arrondi(d.y + sy * s.profondeur) });
    }
    if (!['mur', 'refend', 'cloison', 'fictive', 'parcelle', 'amenagement'].includes(this.outil)) return {};
    if (s.genre !== 'longueur') return { aide: 'Tapez une longueur (4,50), ou 4,50<90 pour un angle' };
    let u: Point;
    if (s.angle !== undefined) { const r = s.angle * Math.PI / 180; u = { x: Math.cos(r), y: Math.sin(r) } }
    else { const v = this.vise, L = v ? distance(v, d) : 0; u = v && L > EPS_COINCIDENCE ? { x: (v.x - d.x) / L, y: (v.y - d.y) / L } : { x: 1, y: 0 } }
    const fin = { x: arrondi(d.x + u.x * s.longueur), y: arrondi(d.y + u.y * s.longueur) };
    return this.outil === 'parcelle' || this.outil === 'amenagement' ? this.sommetTrace(fin, 1) : this.poserMur(fin);
  }

  relacher(g: Geste): Effet {
    if (this.outil !== 'selection' || !this.prise) return {};
    const p = this.prise, dernier = this.dernier;
    if (p.genre === 'cadre') {
      this.prise = null;
      const f = this.niveau();
      /* un clic dans le vide n'est pas un cadre */
      if (!f || distance(p.depart, g.point) < g.rayon / 2) return { cadre: null };
      return { cadre: null, groupe: dansCadre(f, p.depart, g.point) };
    }
    this.prise = null; this.bouge = false; this.dernier = null;
    if (!dernier) return { apercu: [] };
    const titre = p.genre === 'sommet' ? 'Déplacer une extrémité' : p.genre === 'mur' ? 'Déplacer un mur' : p.genre === 'meuble' ? 'Déplacer un meuble' : p.genre === 'escalier' ? 'Déplacer un escalier' : p.genre === 'coupe' ? 'Déplacer un trait de coupe' : p.genre === 'pointdevue' ? 'Déplacer un point de vue' : p.genre === 'fenetretoit' ? 'Déplacer une fenêtre de toit' : p.genre === 'parcelle' ? 'Déplacer la parcelle' : p.genre === 'amenagement' ? 'Déplacer un aménagement' : 'Déplacer une ouverture';
    return { apercu: [], commandes: { titre, liste: [dernier] } };
  }

  /** Échap : abandonner le geste ; Entrée : finir le tracé */
  touche(k: 'Escape' | 'Enter'): Effet {
    if (k === 'Enter' && this.outil === 'parcelle' && this.sommetsTrace.length >= 3) return this.fermerParcelle();
    if (k === 'Enter' && this.outil === 'amenagement' && this.sommetsTrace.length >= 2) return this.finirAmenagement(false);
    const enCours = this.traceEnCours;
    this.annulerGeste();
    if (k === 'Escape' && !enCours && this.outil !== 'selection') { this.outil = 'selection'; return { apercu: [], aide: AIDES.selection, fini: true } }
    return { apercu: [] };
  }
}
