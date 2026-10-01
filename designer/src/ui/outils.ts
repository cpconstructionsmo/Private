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
import { viser } from './selection';

export type NomOutil = 'selection' | 'mur' | 'cloison' | 'ouverture' | 'piece' | 'cote' | 'caler';

export interface Reglages {
  epaisseurMur: Mm;
  epaisseurCloison: Mm;
  genreOuverture: Opening['kind'];
  /** pas de la grille d'accrochage (0 : sans) */
  grille: Mm;
}

export const REGLAGES_DEFAUT: Reglages = { epaisseurMur: 200, epaisseurCloison: 70, genreOuverture: 'door', grille: 0 };

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
}

interface Contexte { projet: Project; niveau: string; selection: string | null }

type Prise =
  | { genre: 'sommet'; de: Point; depart: Point }
  | { genre: 'mur'; mur: MurDroit; depart: Point }
  | { genre: 'ouverture'; id: string; mur: MurDroit; decalage: Mm };

const AIDES: Record<NomOutil, string> = {
  selection: 'Cliquer pour choisir ; tirer une extrémité, un mur ou une ouverture pour la déplacer',
  mur: 'Cliquer le départ puis chaque angle ; Échap pour finir ; Maj : angles à 45° ; Alt : sans accrochage',
  cloison: 'Cloison : cliquer le départ puis l’arrivée ; Échap pour finir',
  ouverture: 'Cliquer sur un mur pour y placer l’ouverture',
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

  constructor(private readonly contexte: () => Contexte) {}

  private niveau(): Floor | null { const c = this.contexte(); return trouverNiveau(c.projet, c.niveau)?.floor ?? null }

  choisir(o: NomOutil): Effet {
    this.annulerGeste();
    this.outil = o;
    return { aide: AIDES[o], apercu: [] };
  }

  get aide(): string { return AIDES[this.outil] }
  get traceEnCours(): boolean { return this.depart !== null || this.prise !== null || this.ancres.length > 0 || this.clicsFond.length > 0 }

  private annulerGeste(): void { this.depart = null; this.premier = null; this.prise = null; this.bouge = false; this.dernier = null; this.ancres = []; this.clicsFond = [] }

  /** le point accroché (ou le point brut avec Alt) */
  private accrocher(g: Geste, depuis?: Point | null): Accroche {
    const f = this.niveau();
    let a: Accroche = f ? accrochageDuNiveau(f).chercher(g.point, { rayon: g.rayon, desactive: !!g.alt, grille: this.reglages.grille, ...(depuis ? { depuis } : {}) })
      : { point: g.point, genre: 'libre' };
    if (g.maj && depuis) a = { point: bloquer(depuis, a.point), genre: 'libre' };
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

  private ouvertureSur(w: MurDroit, p: Point): Commande | null {
    const L = distance(w.axis.a, w.axis.b), d = OUVERTURES[this.reglages.genreOuverture];
    if (d.largeur > L) return null;
    const t = projeterSurDroite(p, w.axis).t * L;
    const position = Math.round(Math.min(L - d.largeur / 2, Math.max(d.largeur / 2, t)));
    return { type: 'creerOuverture', mur: w.id, position, largeur: d.largeur, hauteur: d.hauteur, allege: d.allege, genre: this.reglages.genreOuverture };
  }

  bouger(g: Geste): Effet {
    const c = this.contexte();
    switch (this.outil) {
      case 'selection': {
        if (!this.prise) return { accroche: null };
        const p = this.prise;
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
      case 'cloison': {
        const a = this.accrocher(g, this.depart);
        if (!this.depart || distance(a.point, this.depart) <= EPS_COINCIDENCE) return { accroche: a, apercu: [] };
        return { accroche: a, apercu: [this.murDe(this.depart, a.point)] };
      }
      case 'ouverture': {
        const w = this.murSous(g);
        const cmd = w ? this.ouvertureSur(w, g.point) : null;
        return { accroche: null, apercu: cmd ? [cmd] : [] };
      }
      case 'cote':
      case 'caler':
        return { accroche: this.accrocher(g) };
      case 'piece':
        return { accroche: null };
    }
  }

  private murDe(a: Point, b: Point): Commande {
    const cloison = this.outil === 'cloison';
    const role: Wall['role'] = cloison ? 'partition' : 'exterior';
    return { type: 'creerMur', niveau: this.contexte().niveau, a, b, epaisseur: cloison ? this.reglages.epaisseurCloison : this.reglages.epaisseurMur, role };
  }

  appuyer(g: Geste): Effet {
    const c = this.contexte(), f = this.niveau();
    if (!f) return {};
    switch (this.outil) {
      case 'selection': {
        const cible = viser(f, g.point, g.rayon);
        this.bouge = false; this.dernier = null;
        if (!cible) { this.prise = null; return { selection: null } }
        if (cible.genre === 'sommet') {
          this.prise = { genre: 'sommet', de: cible.point, depart: cible.point };
          return cible.murs.length === 1 ? { selection: cible.murs[0]! } : {};
        }
        const o = f.objects[cible.id];
        if (o?.type === 'wall' && 'a' in o.axis) this.prise = { genre: 'mur', mur: o as MurDroit, depart: this.accrocher(g).point };
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
      case 'cloison': {
        const a = this.accrocher(g, this.depart), p = a.point;
        if (!this.depart) { this.depart = p; this.premier = p; return { accroche: a } }
        if (distance(p, this.depart) <= EPS_COINCIDENCE) return {};
        const cmd = this.murDe(this.depart, p);
        /* un tour fermé (retour au premier point) termine le tracé ; une
           cloison s'arrête à chaque trait */
        const ferme = this.premier !== null && distance(p, this.premier) <= EPS_COINCIDENCE;
        if (ferme || this.outil === 'cloison') { this.depart = null; this.premier = null } else this.depart = p;
        return { commandes: { titre: this.outil === 'cloison' ? 'Cloison' : 'Mur', liste: [cmd] }, apercu: [] };
      }
      case 'ouverture': {
        const w = this.murSous(g);
        if (!w) return { aide: 'Cliquez sur un mur' };
        const cmd = this.ouvertureSur(w, g.point);
        if (!cmd) return { aide: 'Mur trop court pour cette ouverture' };
        return { commandes: { titre: OUVERTURES[this.reglages.genreOuverture].libelle, liste: [cmd] }, apercu: [] };
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

  relacher(_g: Geste): Effet {
    if (this.outil !== 'selection' || !this.prise) return {};
    const p = this.prise, dernier = this.dernier;
    this.prise = null; this.bouge = false; this.dernier = null;
    if (!dernier) return { apercu: [] };
    const titre = p.genre === 'sommet' ? 'Déplacer une extrémité' : p.genre === 'mur' ? 'Déplacer un mur' : 'Déplacer une ouverture';
    return { apercu: [], commandes: { titre, liste: [dernier] } };
  }

  /** Échap : abandonner le geste ; Entrée : finir le tracé */
  touche(k: 'Escape' | 'Enter'): Effet {
    const enCours = this.traceEnCours;
    this.annulerGeste();
    if (k === 'Escape' && !enCours && this.outil !== 'selection') { this.outil = 'selection'; return { apercu: [], aide: AIDES.selection, fini: true } }
    return { apercu: [] };
  }
}
