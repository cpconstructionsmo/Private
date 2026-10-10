/* Les surfaces réglementaires, chacune selon sa définition et avec ses
   déductions — les mêmes règles que l'atelier (atelier/surfaces.py) :

   - surface de plancher : au nu intérieur des murs de façade (leur épaisseur
     et les embrasures en sont exclues), moins le stationnement (garages),
     les trémies d'escalier et les parties de moins de 1,80 m sous la
     toiture ;
   - surface habitable : les pièces, murs et cloisons déduits, garages et
     pièces exclues retirés, trémies et parties basses aussi ;
   - au-delà de 150 m² de surface de plancher, recours obligatoire à un
     architecte : le dossier ne se produit pas au nom de CP Constructions.

   Une rénovation, une extension (ADR-0007) : la surface de plancher et
   l'emprise de l'existant (avant travaux), celles du projet, et la
   différence — ce que les travaux créent ; elle donne la formalité
   indicative : déclaration préalable jusqu'à 20 m² créés (40 m² en zone
   urbaine du PLU, sauf si le total dépasse alors 150 m²), permis au-delà.

   Les articles cités sont à vérifier au texte en vigueur sur Légifrance
   (règle de l'atelier) : ils s'affichent « à vérifier ». */
import type { Floor, Project } from '../model/types';
import { planDuNiveau } from './plan';
import { tremiesDuNiveau } from './escalier';
import { toitureDuNiveau } from './toiture';
import { empriseAuSol, aireEmprise, parcelleDuProjet } from './terrain';
import { aDesExistants, projetExistant } from './etats';
import { difference, intersection, union } from '../geometry/booleen';
import { aireSignee, type Anneau, type Polygone } from '../geometry/polygon';

export const REFERENCES = {
  surfacePlancher: 'art. R.111-22 du code de l’urbanisme (rédaction en vigueur à vérifier)',
  surfaceHabitable: 'art. R.156-1 du code de la construction et de l’habitation (rédaction en vigueur à vérifier)',
  seuilArchitecte: 'art. R.431-2 du code de l’urbanisme (rédaction en vigueur à vérifier)',
  formaliteExtension: 'art. R.421-14 et R.421-17 du code de l’urbanisme (rédaction en vigueur à vérifier)',
} as const;

/** les seuils de surface créée d'une extension (m²) : déclaration préalable jusqu'à 20 m², 40 m² en zone urbaine du PLU */
export const SEUIL_DP = 20, SEUIL_DP_ZONE_U = 40;

export const SEUIL_ARCHITECTE = 150;
export const ALERTE_ARCHITECTE = 140;
/** hauteur sous laquelle une surface ne compte pas (mm) */
export const HAUTEUR_MINI = 1_800;
/** épaisseur de couverture prise sous le dessus d'un pan (mm), comme la 3D */
const EPAISSEUR_SOUS_PAN = 200;

export interface SurfacesNiveau {
  niveau: string; nom: string;
  /** au nu intérieur des murs de façade (mm²) */
  interieur: number;
  garages: { nom: string; aire: number }[];
  tremies: number;
  /** sous 1,80 m de hauteur (sous la toiture) */
  basses: number;
  surfacePlancher: number;
  habitable: number;
  exclues: { nom: string; aire: number }[];
}

export interface Surfaces {
  niveaux: SurfacesNiveau[];
  surfacePlancher: number; habitable: number; emprise: number;
  seuil: { etat: 'ok' | 'alerte' | 'bloquant'; message: string };
  /** une rénovation ou une extension : l'existant, ce que les travaux créent, la formalité indicative */
  travaux?: Travaux;
}

export interface Travaux {
  existant: { surfacePlancher: number; emprise: number };
  /** projet − existant (mm²), jamais négatif ; une démolition nette se lit dans « existant » */
  creee: { surfacePlancher: number; emprise: number };
  formalite: { genre: 'DP' | 'PC' | 'aucune'; message: string };
}

const aire = (P: Polygone[]): number => P.reduce((s, q) => s + Math.abs(aireSignee(q.contour)) - (q.trous ?? []).reduce((t, r) => t + Math.abs(aireSignee(r)), 0), 0);
const m2 = (v: number) => (v / 1e6).toFixed(2).replace('.', ',');

/** la partie d'un polygone où une fonction linéaire est au moins z (Sutherland–Hodgman sur une droite) */
function auDessus(A: Anneau, f: (x: number, y: number) => number, z: number): Anneau {
  const R: { x: number; y: number }[] = [];
  A.forEach((a, i) => {
    const b = A[(i + 1) % A.length]!, fa = f(a.x, a.y) - z, fb = f(b.x, b.y) - z;
    if (fa >= 0) R.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); R.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }) }
  });
  return R;
}

/** sous la toiture portée par ce niveau, la région où la hauteur dépasse 1,80 m (null : pas de toiture en pente ici) */
function regionHaute(f: Floor): Polygone[] | null {
  const r = toitureDuNiveau(f);
  if (!r?.ok) return null;
  const pans = r.toitures.flatMap(t => t.pans);
  if (!pans.length) return null;
  const z = f.elevation + HAUTEUR_MINI + EPAISSEUR_SOUS_PAN;
  return union(pans.map(p => auDessus(p.contour, (x, y) => p.plan.a * x + p.plan.b * y + p.plan.c, z)).filter(A => A.length >= 3).map(contour => ({ contour })));
}

export function surfacesNiveau(projet: Project, f: Floor): SurfacesNiveau {
  const plan = planDuNiveau(f);
  const dehors = plan.maconnerie.map(m => ({ contour: m.contour }));
  const facades = plan.murs.filter(m => { const w = f.objects[m.id]; return w?.type === 'wall' && w.role === 'exterior' }).map(m => ({ contour: m.contour }));
  const interieur: Polygone[] = dehors.length ? (facades.length ? difference(union(dehors), union(facades)) : union(dehors)) : [];
  const T = tremiesDuNiveau(projet, f).map(t => ({ contour: t.contour }));
  const tremies = T.length && interieur.length ? aire(intersection(interieur, T)) : 0;
  const haute = regionHaute(f);
  const sansTremies = T.length ? difference(interieur, T) : interieur;
  const basses = haute ? aire(difference(sansTremies, haute)) : 0;
  const compte = (P: Polygone[]) => { const Q = T.length ? difference(P, T) : P; return aire(haute ? intersection(Q, haute) : Q) };
  const garages: { nom: string; aire: number }[] = [], exclues: { nom: string; aire: number }[] = [];
  let habitable = 0;
  for (const z of plan.zones) {
    const a = compte([z.polygone]);
    if (z.piece?.usage === 'garage') { garages.push({ nom: z.piece.name, aire: a }); exclues.push({ nom: z.piece.name + ' (garage)', aire: a }); continue }
    if (z.piece?.excludedFromHabitable?.value) { exclues.push({ nom: z.piece.name + ' (' + (z.piece.excludedFromHabitable.reason || 'exclue') + ')', aire: a }); continue }
    habitable += a;
  }
  const surfacePlancher = Math.max(0, aire(interieur) - tremies - basses - garages.reduce((s, g) => s + g.aire, 0));
  return { niveau: f.id, nom: f.name, interieur: aire(interieur), garages, tremies, basses, surfacePlancher, habitable, exclues };
}

/** les surfaces du projet, niveau par niveau, et le contrôle du seuil de 150 m² */
export function surfacesReglementaires(projet: Project): Surfaces {
  const niveaux = projet.buildings.flatMap(b => b.floors).sort((a, b) => a.elevation - b.elevation).map(f => surfacesNiveau(projet, f));
  const sdp = niveaux.reduce((s, n) => s + n.surfacePlancher, 0), s = sdp / 1e6;
  const seuil: Surfaces['seuil'] = s > SEUIL_ARCHITECTE
    ? { etat: 'bloquant', message: 'Surface de plancher ' + m2(sdp) + ' m² : au-delà de ' + SEUIL_ARCHITECTE + ' m², le recours à un architecte est obligatoire (' + REFERENCES.seuilArchitecte + '). Le dossier ne se produit pas au nom de CP Constructions : optimiser pour rester sous le seuil (sans détourner les règles de calcul), ou préparer les éléments pour un architecte partenaire.' }
    : s >= ALERTE_ARCHITECTE
      ? { etat: 'alerte', message: 'Surface de plancher ' + m2(sdp) + ' m² : à moins de ' + (SEUIL_ARCHITECTE - s).toFixed(2).replace('.', ',') + ' m² du seuil de ' + SEUIL_ARCHITECTE + ' m² (' + REFERENCES.seuilArchitecte + ').' }
      : { etat: 'ok', message: 'Surface de plancher ' + m2(sdp) + ' m², sous le seuil de ' + SEUIL_ARCHITECTE + ' m².' };
  const emprise = aireEmprise(empriseAuSol(projet));
  return { niveaux, surfacePlancher: sdp, habitable: niveaux.reduce((t, n) => t + n.habitable, 0), emprise, seuil,
    ...(aDesExistants(projet) ? { travaux: travauxDuProjet(projet, sdp, emprise) } : {}) };
}

/** l'existant avant travaux, ce que les travaux créent, et la formalité qui s'en déduit (indicative, à vérifier) */
function travauxDuProjet(projet: Project, sdp: number, emprise: number): Travaux {
  const E = projetExistant(projet);
  const sdpE = E.buildings.flatMap(b => b.floors).reduce((s, f) => s + surfacesNiveau(E, f).surfacePlancher, 0);
  const empE = aireEmprise(empriseAuSol(E));
  const creee = { surfacePlancher: Math.max(0, sdp - sdpE), emprise: Math.max(0, emprise - empE) };
  const c = Math.max(creee.surfacePlancher, creee.emprise) / 1e6, total = sdp / 1e6;
  const zone = parcelleDuProjet(projet)?.plot.plu?.zone?.trim();
  const urbaine = zone ? /^U/i.test(zone) : null;
  /* en zone urbaine, 40 m² ; mais au-delà de 20 m², si le total dépasse 150 m², le permis s'impose (recours à l'architecte) */
  const seuil = urbaine ? (total > SEUIL_ARCHITECTE ? SEUIL_DP : SEUIL_DP_ZONE_U) : SEUIL_DP;
  const zoneDite = zone ? 'zone ' + zone + (urbaine ? ' (urbaine)' : '') : 'zone du PLU à préciser (en zone urbaine, le seuil est de ' + SEUIL_DP_ZONE_U + ' m²)';
  const cree = 'Surface créée ' + m2(Math.max(creee.surfacePlancher, creee.emprise)) + ' m² (surface de plancher ' + m2(creee.surfacePlancher) + ' m², emprise au sol ' + m2(creee.emprise) + ' m²)';
  const formalite: Travaux['formalite'] = c <= 5
    ? { genre: 'aucune', message: cree + ' : pas de formalité pour la surface ; une modification de l’aspect extérieur (baies, façades) relève de la déclaration préalable — ' + REFERENCES.formaliteExtension + '.' }
    : c <= seuil
      ? { genre: 'DP', message: cree + ' : déclaration préalable (jusqu’à ' + seuil + ' m², ' + zoneDite + ') — ' + REFERENCES.formaliteExtension + '.' }
      : { genre: 'PC', message: cree + ' : permis de construire (au-delà de ' + seuil + ' m², ' + zoneDite + (urbaine && total > SEUIL_ARCHITECTE ? ', total après travaux au-delà de ' + SEUIL_ARCHITECTE + ' m²' : '') + ') — ' + REFERENCES.formaliteExtension + '.' };
  return { existant: { surfacePlancher: sdpE, emprise: empE }, creee, formalite };
}
