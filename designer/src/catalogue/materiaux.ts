/* La bibliothèque des matériaux : les parements de façade et les sols, pour
   la 3D, la visite et les façades du permis. Teintes et aspects courants,
   ni marque ni prix : un choix d'aspect, à préciser au descriptif (le
   programme technique du suivi de chantiers reste la référence).

   Le MOTIF dit comment dessiner le matériau (lames, briques, carreaux…) ;
   « pas » est sa période en mm (largeur d'une lame, d'un carreau). */
import type { Mm } from '../model/types';
import type { MotifPlan } from '../geometry/hachures';
import { FINITIONS_AMENAGEMENT } from './amenagements';

export type FamilleMateriau = 'enduit' | 'bardage' | 'pierre' | 'brique' | 'sol' | 'peinture' | 'amenagement';
export type Motif = 'uni' | 'lames_h' | 'lames_v' | 'briques' | 'pierres' | 'carreaux' | 'parquet';

export interface Materiau { id: string; famille: FamilleMateriau; libelle: string; couleur: string; motif: Motif; pas: Mm }

const x = (id: string, famille: FamilleMateriau, libelle: string, couleur: string, motif: Motif = 'uni', pas: Mm = 0): Materiau => ({ id, famille, libelle, couleur, motif, pas });

/** les parements extérieurs (la face extérieure des murs de façade) */
export const PAREMENTS: readonly Materiau[] = [
  x('enduit-blanc-casse', 'enduit', 'Enduit blanc cassé', '#F1ECE2'),
  x('enduit-ton-pierre', 'enduit', 'Enduit ton pierre', '#E2D2B4'),
  x('enduit-sable', 'enduit', 'Enduit sable', '#D8C29A'),
  x('enduit-gris-clair', 'enduit', 'Enduit gris clair', '#CFCCC6'),
  x('enduit-gris-anthracite', 'enduit', 'Enduit gris anthracite', '#4C5157'),
  x('bardage-bois-naturel', 'bardage', 'Bardage bois naturel (lames horizontales)', '#B98A5C', 'lames_h', 140),
  x('bardage-bois-grise', 'bardage', 'Bardage bois grisé (lames verticales)', '#8F8C85', 'lames_v', 140),
  x('bardage-composite-anthracite', 'bardage', 'Bardage composite anthracite', '#3F4348', 'lames_h', 140),
  x('pierre-parement', 'pierre', 'Parement pierre', '#C9B99D', 'pierres', 300),
  /* l'enduit sculpté en pierres des décors d'entrée : des pierres plus petites, plus grises que le parement */
  x('enduit-imitation-pierre', 'enduit', 'Enduit imitation pierre', '#CFC7B6', 'pierres', 200),
  x('brique-rouge', 'brique', 'Brique rouge', '#A65B3F', 'briques', 75),
];

/** les sols finis des pièces */
export const SOLS: readonly Materiau[] = [
  x('carrelage-clair', 'sol', 'Carrelage clair 60 × 60', '#E7E2D8', 'carreaux', 600),
  x('carrelage-gris', 'sol', 'Carrelage gris 60 × 60', '#ABA9A4', 'carreaux', 600),
  x('carrelage-bois', 'sol', 'Carrelage imitation bois', '#B58C64', 'parquet', 200),
  x('parquet-chene', 'sol', 'Parquet chêne', '#C69C6E', 'parquet', 180),
  x('beton-cire', 'sol', 'Béton ciré', '#9D9B96'),
  x('sol-souple', 'sol', 'Sol souple', '#C8C3B8'),
  x('moquette', 'sol', 'Moquette', '#8B909A'),
];

/** les peintures des murs intérieurs (teintes courantes, mates) */
export const PEINTURES: readonly Materiau[] = [
  x('peinture-blanc', 'peinture', 'Peinture blanche', '#F7F6F2'),
  x('peinture-blanc-casse', 'peinture', 'Peinture blanc cassé', '#EFE9DD'),
  x('peinture-lin', 'peinture', 'Peinture lin', '#E3D7C2'),
  x('peinture-gris-perle', 'peinture', 'Peinture gris perle', '#D6D5D0'),
  x('peinture-gris-orage', 'peinture', 'Peinture gris orage', '#8D9095'),
  x('peinture-vert-sauge', 'peinture', 'Peinture vert sauge', '#B5BFA6'),
  x('peinture-bleu-gris', 'peinture', 'Peinture bleu gris', '#9FAEB8'),
  x('peinture-terracotta', 'peinture', 'Peinture terracotta', '#C47E62'),
  x('faience-blanche', 'peinture', 'Faïence blanche 30 × 60', '#F2F2EE', 'carreaux', 300),
];

/* les aménagements extérieurs (catalogue/amenagements.ts), vus comme des matériaux pour la 3D */
const MOTIFS_EXT: Record<string, [Motif, Mm]> = { 'terrasse-bois': ['lames_h', 140], 'terrasse-dalles': ['carreaux', 600], 'allee-paves': ['briques', 100], 'palissade-bois': ['lames_v', 140] };
const AMENAGEMENTS: Materiau[] = FINITIONS_AMENAGEMENT.map(a => x(a.id, 'amenagement', a.libelle, a.couleur, ...(MOTIFS_EXT[a.id] ?? ['uni', 0] as [Motif, Mm])));

const PAR_ID = new Map([...PAREMENTS, ...SOLS, ...PEINTURES, ...AMENAGEMENTS].map(m => [m.id, m]));
/** un matériau par son identifiant (undefined : inconnu — on dessine alors la matière par défaut) */
export const materiau = (id: string | undefined): Materiau | undefined => (id ? PAR_ID.get(id) : undefined);

/** le motif d'un matériau vu de dessus (plan de présentation), aux proportions de la 3D : carreaux en grille,
 *  lames de parquet (6 largeurs de long), briques (3), pierres (2) en rangs aux joints décalés ; null : uni */
export function motifEnPlan(m: Materiau): MotifPlan | null {
  if (!m.pas) return null;
  switch (m.motif) {
    case 'carreaux': return { genre: 'grille', pas: m.pas };
    case 'parquet': return { genre: 'rangs', pas: m.pas, longueur: m.pas * 6 };
    case 'briques': return { genre: 'rangs', pas: m.pas, longueur: m.pas * 3 };
    case 'pierres': return { genre: 'rangs', pas: m.pas, longueur: m.pas * 2 };
    case 'lames_h': return { genre: 'rangs', pas: m.pas };
    case 'lames_v': return { genre: 'colonnes', pas: m.pas };
    default: return null;
  }
}
