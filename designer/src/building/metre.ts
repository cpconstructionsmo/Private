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
   - les LUCARNES : nombre par genre, couverture, façades et jouées, fenêtres ;
   - la TOITURE : surface de couverture, faîtage, arêtiers, noues, rives,
     génoise ou caisson, gouttières (longueur d'égout), descentes posées ;
   - POTEAUX et POUTRES : nombre, longueur, volume ;
   - les FONDATIONS (building/fondations.ts) : fouilles, semelles filantes et
     isolées, soubassement, trappes ; toutes à valider par l'étude de sol ;
   - le TERRAIN (building/terrassement.ts) : déblai, remblai, réseaux ;
   - une RÉNOVATION, une EXTENSION (ADR-0007) : seuls les travaux comptent —
     un mur, une baie existants ne se comptent pas ; un mur à démolir va au
     lot Démolition, une baie existante à boucher au Gros œuvre, une baie
     neuve dans un mur existant y compte un percement.

   Ce qui relève d'une hypothèse d'usage le dit (« à confirmer ») ; ce qui ne
   se mesure pas encore est « à préciser ». Rien n'est inventé. */
import type { Floor, Opening, Project } from '../model/types';
import { planDuNiveau } from './plan';
import { mursDemolis, mursDroits } from './murs';
import { toitureDuNiveau } from './toiture';
import { fenetresDeToit } from './fenetres-toit';
import { lucarnesDuNiveau, LUCARNES } from './lucarnes';
import { eauxPluviales, FINITIONS_EGOUT, GOUTTIERES, MATIERES_GOUTTIERE, NOMS_LIGNES } from './eaux-pluviales';
import { planFondations, SOUBASSEMENTS } from './fondations';
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

export const LOTS = ['Démolition', 'Terrassement et VRD', 'Gros œuvre', 'Charpente et couverture', 'Menuiseries extérieures', 'Menuiseries intérieures',
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
/** la surface d'un polygone plan dans l'espace (mm²) */
const aireEspace = (P: { x: number; y: number; z: number }[]): number => {
  let x = 0, y = 0, z = 0;
  P.forEach((a, i) => { const b = P[(i + 1) % P.length]!; x += a.y * b.z - a.z * b.y; y += a.z * b.x - a.x * b.z; z += a.x * b.y - a.y * b.x });
  return Math.hypot(x, y, z) / 2;
};
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

  /* ---------- démolitions : les murs existants à démolir ---------- */
  for (const w of mursDemolis(f)) {
    const L = distance(w.axis.a, w.axis.b), nom = (ROLES[w.role] ?? 'Murs') + ' existants à démolir';
    ajouter({ lot: 'Démolition', libelle: nom + ' (surface)', quantite: m2(L * w.height), unite: 'm²', detail: 'à l’axe, baies comprises' });
    ajouter({ lot: 'Démolition', libelle: nom + ' (longueur à l’axe)', quantite: ml(L), unite: 'ml' });
  }

  /* ---------- murs, par composition (les murs existants sont déjà là) ---------- */
  for (const w of M) {
    if (w.phase === 'existing') continue;
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
    /* une baie existante conservée n'est pas à fournir ; une baie existante supprimée se bouche */
    if (o.phase === 'existing') continue;
    if (o.phase === 'demolished') {
      if (w.role !== 'partition') ajouter({ lot: 'Gros œuvre', libelle: 'Bouchement de baies existantes', quantite: m2(o.width * o.height), unite: 'm²', detail: 'maçonnerie de remplissage : à confirmer' });
      else ajouter({ lot: 'Plâtrerie et isolation', libelle: 'Bouchement de baies existantes (cloisons)', quantite: m2(o.width * o.height), unite: 'm²' });
      continue;
    }
    /* une baie neuve dans un mur existant : un percement */
    if (w.phase === 'existing') ajouter({ lot: w.role === 'partition' ? 'Plâtrerie et isolation' : 'Gros œuvre', libelle: 'Percements de baies dans des murs existants', quantite: 1, unite: 'u',
      ...(w.role === 'partition' ? {} : { detail: 'reprise en sous-œuvre et linteau : à confirmer selon l’étude' }) });
    const ext = w.role === 'exterior', lot = ext ? 'Menuiseries extérieures' : 'Menuiseries intérieures';
    /* le libellé du modèle porte déjà ses dimensions (« Fenêtre 2 vantaux 120 × 125 ») : on ne les répète pas, sauf si on les a changées */
    const dims = cm(o.width) + ' × ' + cm(o.height), lib = o.catalogRef?.label;
    if (o.kind !== 'void') ajouter({ lot, libelle: lib && lib.includes(dims) ? lib : (lib ?? GENRES_BAIES[o.kind]) + ' ' + dims + ' cm', quantite: 1, unite: 'u' });
    if (w.role !== 'partition') {
      ajouter({ lot: 'Gros œuvre', libelle: 'Linteaux', quantite: ml(o.width + 2 * APPUI_LINTEAU), unite: 'ml', detail: 'baie + 2 × 20 cm d’appui : à confirmer selon l’étude' });
      if (ext && o.kind === 'window') ajouter({ lot: 'Gros œuvre', libelle: 'Appuis de fenêtre', quantite: ml(o.width), unite: 'ml' });
    }
  }

  /* ---------- fondations ---------- */
  const F = planFondations(f);
  if (F) {
    const fd = F.fondation, VS = fd.kind === 'crawl_space';
    const etude = 'à valider par l’étude de sol et le bureau d’études';
    const surface = F.emprise.reduce((s, q) => s + Math.abs(aireSignee(q.contour)) - (q.trous ?? []).reduce((t, h) => t + Math.abs(aireSignee(h)), 0), 0);
    if (surface > 0) {
      ajouter({ lot: 'Terrassement et VRD', libelle: 'Fouilles en rigole des semelles filantes', quantite: (surface * F.assise) / 1e9, unite: 'm³', detail: 'assise à ' + cm(F.assise) + ' cm sous le terrain : ' + etude, aPreciser: fd.bearingDepth === undefined });
      ajouter({ lot: 'Gros œuvre', libelle: 'Semelles filantes ' + cm(fd.footingWidth) + ' × ' + cm(fd.footingHeight) + ' cm', quantite: ml(F.longueur), unite: 'ml', detail: etude });
      ajouter({ lot: 'Gros œuvre', libelle: 'Béton des semelles filantes', quantite: (surface * fd.footingHeight) / 1e9, unite: 'm³', detail: 'armatures selon l’étude' });
      /* du dessus des semelles au plancher : jusqu'au terrain, plus la hauteur du vide sanitaire (terrain au fond du vide) */
      const h = F.assise - fd.footingHeight + (VS ? fd.crawlHeight : 0);
      ajouter({ lot: 'Gros œuvre', libelle: 'Murs de soubassement (' + SOUBASSEMENTS[fd.kind].toLowerCase() + ', hauteur ' + cm(h) + ' cm)', quantite: m2(F.longueur * h), unite: 'm²',
        detail: VS ? 'du dessus des semelles au plancher, fond du vide au niveau du terrain : à confirmer' : 'du dessus des semelles au terrain : arase à confirmer' });
    }
    const k = F.isolees.length;
    if (k) {
      ajouter({ lot: 'Gros œuvre', libelle: 'Semelles isolées ' + cm(fd.padSize) + ' × ' + cm(fd.padSize) + ' × ' + cm(fd.padHeight) + ' cm', quantite: k, unite: 'u', detail: 'sous poteaux : ' + etude });
      ajouter({ lot: 'Gros œuvre', libelle: 'Béton des semelles isolées', quantite: (k * fd.padSize * fd.padSize * fd.padHeight) / 1e9, unite: 'm³' });
      ajouter({ lot: 'Terrassement et VRD', libelle: 'Fouilles en puits des semelles isolées', quantite: (k * fd.padSize * fd.padSize * F.assise) / 1e9, unite: 'm³', detail: 'assise à ' + cm(F.assise) + ' cm sous le terrain' });
    }
    if (VS) {
      ajouter({ lot: 'Gros œuvre', libelle: 'Trappes de visite du vide sanitaire', quantite: F.trappes.length, unite: 'u', ...(F.trappes.length ? {} : { aPreciser: true, detail: 'aucune posée au plan' }) });
      ajouter({ lot: 'Gros œuvre', libelle: 'Ventilation du vide sanitaire (grilles)', quantite: 0, unite: 'u', aPreciser: true, detail: 'nombre et section selon le DTU et l’étude' });
    }
  }

  /* ---------- plancher et plafond du niveau ---------- */
  const emprise = plan.maconnerie.reduce((s, q) => s + Math.abs(aireSignee(q.contour)), 0);
  if (emprise > 0) {
    const kp = compositionPlancher(f.floorRef), kc = compositionPlancher(f.ceilingRef);
    /* sur fondations, le plancher bas dit son soubassement : porté sur vide sanitaire, ou dallage sur terre-plein */
    const bas = F ? (F.fondation.kind === 'crawl_space' ? 'Plancher bas sur vide sanitaire' : 'Dallage sur terre-plein') : f.elevation <= 0 ? 'Dallage / plancher bas' : 'Plancher';
    ajouter({ lot: 'Gros œuvre', libelle: bas + ' — ' + (kp ? kp.libelle : 'composition à choisir') + n, quantite: m2(emprise), unite: 'm²', detail: 'au nu extérieur de la maçonnerie', ...(kp ? {} : { aPreciser: true }) });
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

  /* ---------- toiture : couverture, lignes (égout, rives, faîtage, arêtiers, noues), eaux pluviales ---------- */
  const t = toitureDuNiveau(f);
  if (t?.ok) {
    const R = objets.find(o => o.type === 'roof');
    for (const x of t.toitures) ajouter({ lot: 'Charpente et couverture', libelle: 'Couverture — ' + (R?.type === 'roof' ? COUVERTURES[R.covering] : ''), quantite: m2(x.surfaceCouverture), unite: 'm²', detail: 'surface rampante' });
    const E = eauxPluviales(f);
    if (E) {
      const lot = 'Charpente et couverture', r = E.roof, eg = E.longueurs.egout;
      for (const g of ['faitage', 'aretier', 'noue', 'rive'] as const) if (E.longueurs[g] > 0) ajouter({ lot, libelle: NOMS_LIGNES[g], quantite: ml(E.longueurs[g]), unite: 'ml', detail: g === 'rive' ? 'en rampant (pignons, haut de pan)' : 'en vraie grandeur' });
      if (r.eavesFinish?.startsWith('genoise')) ajouter({ lot, libelle: FINITIONS_EGOUT[r.eavesFinish], quantite: ml(eg), unite: 'ml', detail: 'le long des égouts' });
      else if (r.eavesFinish === 'boxed') ajouter({ lot, libelle: 'Habillage de sous-face (caisson)', quantite: m2(eg * r.overhang), unite: 'm²', detail: 'longueur d’égout × débord : à confirmer aux angles' });
      if (r.gutter !== 'none') {
        const nom = r.gutter ? GOUTTIERES[r.gutter].toLowerCase() + (r.gutterMaterial ? ' ' + MATIERES_GOUTTIERE[r.gutterMaterial] : '') : 'modèle à choisir';
        ajouter({ lot, libelle: 'Gouttières — ' + nom, quantite: ml(eg), unite: 'ml', detail: 'longueur d’égout, pignons exclus', ...(r.gutter && r.gutterMaterial ? {} : { aPreciser: true }) });
        const n = E.descentes.length;
        ajouter({ lot, libelle: 'Descentes d’eaux pluviales', quantite: n, unite: 'u',
          detail: n ? '≈ ' + (E.surfacePlan / 1e6 / n).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' m² de toiture en plan par descente ; hauteur et diamètre selon le DTU 60.11' : 'nombre et position à préciser (DTU 60.11)',
          ...(n ? {} : { aPreciser: true }) });
      }
    }
  }
  /* les lucarnes : comptées par genre, leur couverture et leurs murs (façade et jouées, fenêtre déduite), leur fenêtre */
  for (const { o, geo } of lucarnesDuNiveau(f)) {
    const lot = 'Charpente et couverture';
    ajouter({ lot, libelle: 'Lucarnes — ' + LUCARNES[o.kind].toLowerCase(), quantite: 1, unite: 'u', detail: 'largeur ' + cm(o.width) + ' cm, façade ' + cm(o.height) + ' cm' });
    ajouter({ lot, libelle: 'Couverture des lucarnes', quantite: m2(geo.surfaceCouverture), unite: 'm²', detail: 'surface rampante' });
    const murs = [geo.facade, ...geo.joues].reduce((s, P) => s + aireEspace(P), 0) - o.windowWidth * o.windowHeight;
    ajouter({ lot, libelle: 'Façades et jouées des lucarnes', quantite: m2(murs), unite: 'm²', detail: 'fenêtres déduites ; ossature et habillage à préciser', aPreciser: true });
    ajouter({ lot: 'Menuiseries extérieures', libelle: 'Fenêtres de lucarne ' + cm(o.windowWidth) + ' × ' + cm(o.windowHeight) + ' cm', quantite: 1, unite: 'u' });
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
