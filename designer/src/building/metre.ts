/* Le métré du projet, par lot : ce que la saisie permet de mesurer, sans
   un prix (les prix restent au chiffrage de CP Constructions).

   Chaque objet porte ses règles de métré :
   - un MUR : longueur à l'axe, surface brute (longueur × hauteur), baies
     déduites (surface nette), volume ; groupé par composition ;
   - une OUVERTURE : une menuiserie (comptée par modèle et dimensions), un
     linteau et, pour une fenêtre, un appui (dans un mur maçonné) ;
   - une PIÈCE : son sol, ses murs (périmètre × hauteur sous plafond, baies
     déduites), son plafond, ses plinthes (portes déduites) ; une pièce
     humide signale sa faïence et son étanchéité, à préciser ;
   - le NIVEAU : son plancher (surface de la maçonnerie) et son plafond,
     avec leurs compositions ;
   - la TOITURE : surface de couverture, longueur d'égout (gouttières) ;
   - POTEAUX et POUTRES : nombre, longueur, volume ;
   - le TERRAIN (building/terrassement.ts) : déblai, remblai, réseaux.

   Ce qui relève d'une hypothèse d'usage le dit (« à confirmer ») ; ce qui ne
   se mesure pas encore est « à préciser ». Rien n'est inventé. */
import type { Floor, Opening, Project } from '../model/types';
import { planDuNiveau } from './plan';
import { mursDroits } from './murs';
import { toitureDuNiveau } from './toiture';
import { fenetresDeToit } from './fenetres-toit';
import { metreTerrain, NOMS_RESEAUX } from './terrassement';
import { compositionMur } from '../catalogue/murs';
import { modeleMeuble, type FamilleMeuble } from '../catalogue/mobilier';
import { compositionPlancher } from '../catalogue/planchers';
import { materiau } from '../catalogue/materiaux';
import { aireSignee, perimetre } from '../geometry/polygon';
import { distance } from '../geometry/vecteur';

export type Unite = 'm²' | 'ml' | 'm³' | 'u';

export interface LigneMetre {
  lot: string;
  libelle: string;
  quantite: number;
  unite: Unite;
  /** d'où vient la quantité, ou ce qu'il reste à préciser */
  detail?: string;
  /** une quantité qui attend une donnée (hauteur de faïence, par exemple) */
  aPreciser?: boolean;
  /** le détail est un nom de pièce : une ligne cumulée les liste toutes */
  pieces?: boolean;
}

export const LOTS = ['Terrassement et VRD', 'Gros œuvre', 'Charpente et couverture', 'Menuiseries extérieures', 'Menuiseries intérieures',
  'Plâtrerie et isolation', 'Revêtements de sol', 'Faïence', 'Peinture', 'Équipements'] as const;

/** linteau : la baie plus un appui de 20 cm de chaque côté (usage courant, à confirmer selon l'étude) */
export const APPUI_LINTEAU = 200;

const ROLES: Record<string, string> = { exterior: 'Murs extérieurs', bearing_interior: 'Murs de refend', partition: 'Cloisons' };
const GENRES_BAIES: Record<Opening['kind'], string> = { door: 'Porte', window: 'Fenêtre', french_window: 'Porte-fenêtre', garage_door: 'Porte de garage', bay: 'Baie', void: 'Passage' };
const MATIERES: Record<string, string> = { concrete: 'béton', steel: 'acier', wood: 'bois' };
const COUVERTURES: Record<string, string> = { tile: 'tuiles', slate: 'ardoises', zinc: 'zinc', steel: 'bac acier', green: 'végétalisée', gravel: 'gravillons (toit-terrasse)' };
/** les familles du catalogue qui sont des équipements (le reste : mobilier de présentation) */
const FAMILLES_EQUIPEMENTS = new Set<FamilleMeuble>(['cuisine', 'salle_de_bains', 'wc_buanderie', 'accessibilite']);
/** les ouvertures qui coupent une plinthe (on passe par elles) */
const PASSAGES = new Set<Opening['kind']>(['door', 'french_window', 'garage_door', 'bay', 'void']);

const m2 = (mm2: number) => mm2 / 1e6, ml = (mm: number) => mm / 1_000;
const cm = (mm: number) => (mm / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** le métré du projet, ligne par ligne, rangé par lot */
export function metreProjet(p: Project): LigneMetre[] {
  const L: LigneMetre[] = [];
  /* cumuler les lignes de même lot, libellé et unité */
  const ajouter = (l: LigneMetre) => {
    const x = L.find(y => y.lot === l.lot && y.libelle === l.libelle && y.unite === l.unite);
    if (!x) { L.push({ ...l, ...(l.detail ? { detail: l.detail } : {}) }); return }
    x.quantite += l.quantite;
    if (l.aPreciser) x.aPreciser = true;
    /* une ligne cumulée de pièces (« Sol — carrelage ») dit toutes ses pièces, pas la première seulement */
    if (l.pieces && l.detail && !x.detail?.split(', ').includes(l.detail)) x.detail = (x.detail ? x.detail + ', ' : '') + l.detail;
  };
  const niveaux = p.buildings.flatMap(b => b.floors).sort((a, b) => a.elevation - b.elevation);

  /* ---------- terrain ---------- */
  const T = metreTerrain(p);
  if (T.deblai) ajouter({ lot: 'Terrassement et VRD', libelle: 'Déblais (plateformes et talus)', quantite: T.deblai, unite: 'm³', detail: 'en place, sans foisonnement : à confirmer' });
  if (T.remblai) ajouter({ lot: 'Terrassement et VRD', libelle: 'Remblais (plateformes et talus)', quantite: T.remblai, unite: 'm³', detail: 'en place : à confirmer' });
  for (const r of T.reseaux) ajouter({ lot: 'Terrassement et VRD', libelle: 'Réseau ' + NOMS_RESEAUX[r.genre].libelle.toLowerCase(), quantite: r.longueur, unite: 'ml' });

  for (const f of niveaux) metreNiveau(p, f, ajouter);
  return L.sort((a, b) => LOTS.indexOf(a.lot as typeof LOTS[number]) - LOTS.indexOf(b.lot as typeof LOTS[number]));
}

function metreNiveau(p: Project, f: Floor, ajouter: (l: LigneMetre) => void): void {
  const plan = planDuNiveau(f), M = mursDroits(f), objets = Object.values(f.objects), n = ' — ' + f.name;
  const hsp = f.height;

  /* ---------- murs, par composition ---------- */
  for (const w of M) {
    const lot = w.role === 'partition' ? 'Plâtrerie et isolation' : 'Gros œuvre';
    const k = compositionMur(w.compositionRef), L = distance(w.axis.a, w.axis.b);
    const baies = plan.baies.filter(b => b.mur === w.id).reduce((s, b) => s + b.surface, 0);
    const nom = (ROLES[w.role] ?? 'Murs') + ' — ' + (k ? k.libelle : 'sur mesure ' + cm(w.thickness) + ' cm');
    ajouter({ lot, libelle: nom + ' (longueur à l’axe)', quantite: ml(L), unite: 'ml' });
    ajouter({ lot, libelle: nom + ' (surface nette, baies déduites)', quantite: m2(L * w.height - baies), unite: 'm²' });
    if (w.role !== 'partition') ajouter({ lot, libelle: nom + ' (volume)', quantite: (L * w.height * w.thickness - baies * w.thickness) / 1e9, unite: 'm³', detail: 'à l’axe, baies déduites' });
    /* le doublage d'un mur extérieur : sa face intérieure, baies déduites */
    if (w.role === 'exterior') ajouter({ lot: 'Plâtrerie et isolation', libelle: 'Doublage des murs extérieurs (face intérieure)', quantite: m2(L * Math.min(w.height, hsp) - baies), unite: 'm²', detail: 'à l’axe des murs : à confirmer selon la composition' });
  }

  /* ---------- ouvertures : menuiseries, linteaux, appuis ---------- */
  const parId = new Map(M.map(w => [w.id, w]));
  for (const o of objets) {
    if (o.type !== 'opening') continue;
    const w = parId.get(o.hostWallId);
    if (!w) continue;
    const ext = w.role === 'exterior', lot = ext ? 'Menuiseries extérieures' : 'Menuiseries intérieures';
    /* le libellé du modèle porte déjà ses dimensions (« Fenêtre 2 vantaux 120 × 125 ») : on ne les répète pas, sauf si on les a changées */
    const dims = cm(o.width) + ' × ' + cm(o.height), lib = o.catalogRef?.label;
    if (o.kind !== 'void') ajouter({ lot, libelle: lib && lib.includes(dims) ? lib : (lib ?? GENRES_BAIES[o.kind]) + ' ' + dims + ' cm', quantite: 1, unite: 'u' });
    if (w.role !== 'partition') {
      ajouter({ lot: 'Gros œuvre', libelle: 'Linteaux', quantite: ml(o.width + 2 * APPUI_LINTEAU), unite: 'ml', detail: 'baie + 2 × 20 cm d’appui : à confirmer selon l’étude' });
      if (ext && o.kind === 'window') ajouter({ lot: 'Gros œuvre', libelle: 'Appuis de fenêtre', quantite: ml(o.width), unite: 'ml' });
    }
  }

  /* ---------- plancher et plafond du niveau ---------- */
  const emprise = plan.maconnerie.reduce((s, q) => s + Math.abs(aireSignee(q.contour)), 0);
  if (emprise > 0) {
    const kp = compositionPlancher(f.floorRef), kc = compositionPlancher(f.ceilingRef);
    ajouter({ lot: 'Gros œuvre', libelle: (f.elevation <= 0 ? 'Dallage / plancher bas' : 'Plancher') + ' — ' + (kp ? kp.libelle : 'composition à choisir') + n, quantite: m2(emprise), unite: 'm²', detail: 'au nu extérieur de la maçonnerie', ...(kp ? {} : { aPreciser: true }) });
    const interieur = plan.zones.reduce((s, z) => s + z.aire, 0);
    ajouter({ lot: 'Plâtrerie et isolation', libelle: 'Plafonds — ' + (kc ? kc.libelle : 'composition à choisir') + n, quantite: m2(interieur), unite: 'm²', ...(kc ? {} : { aPreciser: true }) });
  }

  /* ---------- pièces : sols, murs, plafonds, plinthes ---------- */
  for (const z of plan.zones) {
    const r = z.piece;
    if (!r) continue;
    const touche = plan.baies.filter(b => b.cotes.includes(r.name));
    const baies = touche.reduce((s, b) => s + b.surface, 0), passages = touche.filter(b => PASSAGES.has(b.genre)).reduce((s, b) => s + b.largeur, 0);
    const sol = materiau(r.floorFinish), mur = materiau(r.wallFinish), P = perimetre(z.polygone.contour);
    ajouter({ lot: 'Revêtements de sol', libelle: 'Sol — ' + (sol ? sol.libelle : 'à choisir'), quantite: m2(z.aire), unite: 'm²', detail: r.name, pieces: true, ...(sol ? {} : { aPreciser: true }) });
    ajouter({ lot: 'Revêtements de sol', libelle: 'Plinthes', quantite: ml(Math.max(0, P - passages)), unite: 'ml', detail: 'portes et passages déduits' });
    const murs = m2(Math.max(0, P * hsp - baies));
    if (r.wet) ajouter({ lot: 'Faïence', libelle: 'Faïence et étanchéité des pièces humides (' + r.name + ')', quantite: 0, unite: 'm²', aPreciser: true, detail: 'hauteur et emprise à préciser (douche, baignoire, crédence)' });
    /* une faïence murale toute hauteur est de la faïence, pas de la peinture */
    const faience = !!mur?.id.startsWith('faience');
    ajouter({ lot: faience ? 'Faïence' : 'Peinture', libelle: 'Murs — ' + (mur ? mur.libelle : 'finition à choisir'), quantite: murs, unite: 'm²', detail: r.name, pieces: true, ...(mur ? {} : { aPreciser: true }) });
    ajouter({ lot: 'Peinture', libelle: 'Plafonds', quantite: m2(z.aire), unite: 'm²' });
  }

  /* ---------- toiture ---------- */
  const t = toitureDuNiveau(f);
  if (t?.ok) {
    const R = objets.find(o => o.type === 'roof');
    for (const x of t.toitures) {
      ajouter({ lot: 'Charpente et couverture', libelle: 'Couverture — ' + (R?.type === 'roof' ? COUVERTURES[R.covering] : ''), quantite: m2(x.surfaceCouverture), unite: 'm²', detail: 'surface rampante' });
      if (x.genre !== 'flat') ajouter({ lot: 'Charpente et couverture', libelle: 'Gouttières (longueur d’égout)', quantite: ml(perimetre(x.egout)), unite: 'ml', detail: 'pignons compris : à ajuster selon le plan de toiture' });
      ajouter({ lot: 'Charpente et couverture', libelle: 'Descentes d’eaux pluviales', quantite: 0, unite: 'u', aPreciser: true, detail: 'nombre et position à préciser' });
    }
  }
  for (const { o } of fenetresDeToit(f)) ajouter({ lot: 'Charpente et couverture', libelle: 'Fenêtres de toit ' + cm(o.width) + ' × ' + cm(o.height) + ' cm', quantite: 1, unite: 'u' });

  /* ---------- poteaux, poutres, escaliers, équipements ---------- */
  for (const o of objets) {
    if (o.type === 'column') {
      ajouter({ lot: 'Gros œuvre', libelle: 'Poteaux ' + MATIERES[o.material] + ' ' + cm(o.width) + ' × ' + cm(o.depth) + ' cm', quantite: 1, unite: 'u', detail: 'hauteur ' + cm(hsp) + ' cm' });
      if (o.material === 'concrete') ajouter({ lot: 'Gros œuvre', libelle: 'Béton des poteaux', quantite: (o.width * o.depth * hsp) / 1e9, unite: 'm³' });
    } else if (o.type === 'beam') {
      const L = distance(o.a, o.b);
      ajouter({ lot: 'Gros œuvre', libelle: 'Poutres ' + MATIERES[o.material] + ' ' + cm(o.width) + ' × ' + cm(o.depth) + ' cm (retombée)', quantite: ml(L), unite: 'ml', detail: 'appuis non compris : à confirmer' });
      if (o.material === 'concrete') ajouter({ lot: 'Gros œuvre', libelle: 'Béton des poutres (retombée seule)', quantite: (o.width * o.depth * L) / 1e9, unite: 'm³' });
    } else if (o.type === 'stair') {
      ajouter({ lot: 'Menuiseries intérieures', libelle: 'Escalier ' + ({ straight: 'droit', quarter_left: 'quart tournant gauche', quarter_right: 'quart tournant droit' } as const)[o.kind], quantite: 1, unite: 'u' });
    } else if (o.type === 'furniture') {
      /* les équipements (cuisine, salle de bains, WC, buanderie) ; le mobilier de présentation n'est pas un ouvrage */
      const fam = modeleMeuble(o.catalogRef.id)?.famille;
      if (fam && FAMILLES_EQUIPEMENTS.has(fam)) ajouter({ lot: 'Équipements', libelle: o.catalogRef.label, quantite: 1, unite: 'u', detail: 'posé au plan' });
    }
  }
}

/** le métré en CSV (séparateur « ; », virgule décimale : il s'ouvre tel quel dans un tableur français) */
export function metreCsv(L: readonly LigneMetre[]): string {
  const q = (t: string) => '"' + t.replace(/"/g, '""') + '"';
  const nb = (x: number) => (Math.round(x * 100) / 100).toString().replace('.', ',');
  return ['Lot;Ouvrage;Quantité;Unité;Détail;À préciser', ...L.map(l => [q(l.lot), q(l.libelle), nb(l.quantite), l.unite, q(l.detail ?? ''), l.aPreciser ? 'oui' : ''].join(';'))].join('\r\n');
}
