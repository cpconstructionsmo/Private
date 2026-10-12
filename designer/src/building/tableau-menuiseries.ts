/* Le tableau des menuiseries : ce qu'on remet au menuisier pour son devis
   et sa commande. Chaque baie du projet (fenêtres, portes-fenêtres, baies,
   portes, porte de garage), regroupée avec ses semblables — même modèle,
   mêmes dimensions, même allège, même manœuvre, même sens, même volet, même
   teinte — sous un repère (F1, PF1, B1, PE1, PG1 ; P1 pour les portes
   intérieures), avec sa quantité et ses emplacements (niveau, pièce,
   façade).

   Tout se déduit du plan : déplacer, retourner ou changer une baie change le
   tableau. Les dimensions sont celles du tableau de la baie dans le mur, à
   reprendre sur place par le menuisier avant fabrication ; une teinte non
   choisie s'écrit « [à préciser] » (R2). Les baies existantes conservées,
   bouchées ou déposées ne s'y trouvent pas (rien à fournir), ni les simples
   passages. */
import type { Opening, Project } from '../model/types';
import { planDuNiveau, type BaieMetree } from './plan';
import { mursDroits, type MurDroit } from './murs';
import { parcelleDuProjet } from './terrain';
import { MANOEUVRES, manoeuvreDe, modeleOuverture } from '../catalogue/ouvertures';
import { choixOuvrage, teinteMenuiserie, type OuvrageMenuiserie } from '../catalogue/menuiseries';
import { normaleGauche, normaliser, scalaire, soustraire } from '../geometry/vecteur';

export const A_PRECISER_TEINTE = '[à préciser]';

export interface LigneMenuiserie {
  /** « F1 », « PF2 », « P3 »… */
  repere: string;
  exterieure: boolean;
  designation: string;
  largeur: number;
  hauteur: number;
  allege: number;
  vantaux: number;
  /** « Battant », « Coulissant »… */
  manoeuvre: string;
  /** « Poussant droit », « Tirant gauche », « vers l'intérieur »… ; « — » sans objet */
  ouverture: string;
  /** « Volet roulant motorisé »… ; « — » sans volet */
  volet: string;
  /** « PVC · RAL 7016 gris anthracite » ; « [à préciser] » si rien n'est choisi ; « — » à l'intérieur */
  teinte: string;
  quantite: number;
  /** « RDC — Séjour, façade sud »… (une par baie) */
  emplacements: string[];
  /** les baies du plan qui portent ce repère */
  ids: string[];
}

const NOMS: Record<Opening['kind'], string> = { window: 'Fenêtre', french_window: 'Porte-fenêtre', bay: 'Baie', door: 'Porte', garage_door: 'Porte de garage', void: 'Passage' };
const VOLETS: Record<NonNullable<Opening['shutter']>, string> = { roller_motorized: 'Volet roulant motorisé', roller_manual: 'Volet roulant manuel', hinged: 'Volets battants' };
/** l'ordre des familles au tableau, et leur préfixe de repère */
const FAMILLES: { cle: string; prefixe: string; libelle: string }[] = [
  { cle: 'ext:window', prefixe: 'F', libelle: 'Fenêtres' }, { cle: 'ext:french_window', prefixe: 'PF', libelle: 'Portes-fenêtres' },
  { cle: 'ext:bay', prefixe: 'B', libelle: 'Baies' }, { cle: 'ext:door', prefixe: 'PE', libelle: 'Portes extérieures' },
  { cle: 'ext:garage_door', prefixe: 'PG', libelle: 'Portes de garage' },
  { cle: 'int:door', prefixe: 'P', libelle: 'Portes intérieures' }, { cle: 'int:french_window', prefixe: 'PI', libelle: 'Portes vitrées intérieures' },
  { cle: 'int:bay', prefixe: 'BI', libelle: 'Baies intérieures' }, { cle: 'int:window', prefixe: 'FI', libelle: 'Châssis intérieurs' },
  { cle: 'int:garage_door', prefixe: 'PGI', libelle: 'Portes de garage intérieures' },
];

/** l'ouvrage dont une baie extérieure prend la teinte (Informations du dossier) */
function ouvrageDe(o: Opening): OuvrageMenuiserie {
  if (o.kind === 'garage_door') return 'porteGarage';
  if (o.kind === 'door') return 'porteEntree';
  return 'menuiseries';
}

/** le sens d'une porte ou d'une fenêtre à un vantail battant : « poussant droit » quand, en la poussant, les paumelles sont
    à droite ; pour une baie extérieure on dit aussi de quel côté elle s'ouvre. Sans sens dessiné, celui du plan : côté pièce */
function sensOuverture(w: MurDroit, o: Opening, b: BaieMetree | undefined, exterieure: boolean): string {
  const { manoeuvre, vantaux } = manoeuvreDe(o);
  if (manoeuvre !== 'hinged' && manoeuvre !== 'tilt_turn') return '—';
  const gaucheInterieur = b ? b.cotes[0] !== 'extérieur' : true;
  const sw = o.swing ?? { side: 'left' as const, inward: gaucheInterieur };
  const vers = exterieure ? (sw.inward === gaucheInterieur ? 'vers l’intérieur' : 'vers l’extérieur') : '';
  if (vantaux !== 1) return vers || '—';
  const u = normaliser(soustraire(w.axis.b, w.axis.a)), n = normaleGauche(u);
  /* celui qui pousse regarde dans le sens où la porte s'ouvre ; sa droite est ce sens tourné d'un quart de tour horaire */
  const d = sw.inward ? n : { x: -n.x, y: -n.y }, droite = { x: d.y, y: -d.x };
  const charniere = sw.side === 'left' ? { x: -u.x, y: -u.y } : u;
  const main = scalaire(charniere, droite) > 0 ? 'droit' : 'gauche';
  return 'Poussant ' + main + (vers ? ', ' + vers : '');
}

/** la façade d'une baie extérieure : la direction vers laquelle regarde son côté extérieur (le nord du plan : « nord ») */
function facade(w: MurDroit, b: BaieMetree, nord: number): string {
  const u = normaliser(soustraire(w.axis.b, w.axis.a)), n = normaleGauche(u), e = b.cotes[0] === 'extérieur' ? n : { x: -n.x, y: -n.y };
  const N = { x: -Math.sin(nord), y: Math.cos(nord) }, E = { x: N.y, y: -N.x };
  const az = (Math.atan2(e.x * E.x + e.y * E.y, e.x * N.x + e.y * N.y) * 180 / Math.PI + 360) % 360;
  return ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'][Math.round(az / 45) % 8]!;
}

const cm = (x: number) => Math.round(x / 10);

/** le tableau des menuiseries du projet, famille par famille ; « niveaux » : se limiter à ceux-là */
export function tableauMenuiseries(projet: Project, niveaux?: readonly string[]): LigneMenuiserie[] {
  const F = projet.buildings.flatMap(b => b.floors).filter(f => !niveaux || niveaux.includes(f.id)).sort((a, b) => a.elevation - b.elevation);
  const nord = parcelleDuProjet(projet)?.plot.north ?? 0, D = projet.dossier;
  const groupes = new Map<string, Omit<LigneMenuiserie, 'repere'> & { famille: string; rang: number }>();
  let rang = 0;
  for (const f of F) {
    const plan = planDuNiveau(f), murs = new Map(mursDroits(f).map(w => [w.id, w]));
    const baies = Object.values(f.objects).filter((o): o is Opening => o.type === 'opening' && o.kind !== 'void' && !o.phase)
      .map(o => ({ o, w: murs.get(o.hostWallId), b: plan.baies.find(x => x.id === o.id) }))
      .filter((x): x is { o: Opening; w: MurDroit; b: BaieMetree | undefined } => !!x.w && x.w.role !== 'virtual')
      /* l'ordre de lecture du plan : de haut en bas, puis de gauche à droite */
      .sort((p, q) => (q.b?.centre.y ?? 0) - (p.b?.centre.y ?? 0) || (p.b?.centre.x ?? 0) - (q.b?.centre.x ?? 0));
    for (const { o, w, b } of baies) {
      const exterieure = b ? b.exterieure : w.role === 'exterior';
      const { manoeuvre, vantaux } = manoeuvreDe(o);
      const modele = o.catalogRef && modeleOuverture(o.catalogRef.id);
      const dims = cm(o.width) + ' × ' + cm(o.height);
      const designation = o.catalogRef ? (o.catalogRef.label.includes(dims) || !modele ? o.catalogRef.label : o.catalogRef.label + ' (sur mesure)') : NOMS[o.kind];
      const choix = exterieure ? choixOuvrage(D, ouvrageDe(o)) : {};
      const teinte = exterieure ? [choix.materiau, teinteMenuiserie(choix.teinte)?.libelle].filter(Boolean).join(' · ') || A_PRECISER_TEINTE : '—';
      const ligne = {
        exterieure, designation, largeur: o.width, hauteur: o.height, allege: o.sill, vantaux, manoeuvre: MANOEUVRES[manoeuvre],
        ouverture: sensOuverture(w, o, b, exterieure), volet: exterieure && o.shutter ? VOLETS[o.shutter] : '—', teinte,
      };
      const famille = (exterieure ? 'ext:' : 'int:') + o.kind, cle = famille + '|' + JSON.stringify(ligne);
      const piece = b ? b.cotes.filter(c => c !== 'extérieur').join(' / ') : '';
      const ou = f.name + (piece ? ' — ' + piece : '') + (exterieure && b ? ', façade ' + facade(w, b, nord) : '');
      const g = groupes.get(cle);
      if (g) { g.quantite++; g.emplacements.push(ou); g.ids.push(o.id) }
      else groupes.set(cle, { ...ligne, famille, rang: rang++, quantite: 1, emplacements: [ou], ids: [o.id] });
    }
  }
  /* les repères, famille par famille, dans l'ordre de première rencontre */
  const out: LigneMenuiserie[] = [];
  for (const fam of FAMILLES) {
    [...groupes.values()].filter(g => g.famille === fam.cle).sort((a, b) => a.rang - b.rang)
      .forEach(({ famille: _f, rang: _r, ...g }, i) => out.push({ repere: fam.prefixe + (i + 1), ...g }));
  }
  return out;
}

/** le libellé d'une famille de repères (pour les intertitres) */
export const familleDuRepere = (r: string): string => FAMILLES.find(f => r.replace(/\d+$/, '') === f.prefixe)?.libelle ?? '';

/** le tableau en CSV (séparateur « ; », pour un tableur à la française) */
export function menuiseriesCsv(L: readonly LigneMenuiserie[]): string {
  const q = (s: string | number) => '"' + String(s).replace(/"/g, '""') + '"';
  const t = ['Repère', 'Extérieure', 'Désignation', 'Quantité', 'Largeur (cm)', 'Hauteur (cm)', 'Allège (cm)', 'Vantaux', 'Manœuvre', 'Ouverture', 'Volet', 'Teinte', 'Emplacements'];
  return [t.map(q).join(';'), ...L.map(l => [l.repere, l.exterieure ? 'oui' : 'non', l.designation, l.quantite, cm(l.largeur), cm(l.hauteur), cm(l.allege), l.vantaux, l.manoeuvre, l.ouverture, l.volet, l.teinte, l.emplacements.join(' ; ')].map(q).join(';'))].join('\r\n') + '\r\n';
}
