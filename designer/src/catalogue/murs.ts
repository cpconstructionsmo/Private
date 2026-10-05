/* Les compositions de murs : ce dont un mur est fait, couche par couche,
   de sa face extérieure (ou de sa face gauche, pour un mur intérieur) à
   l'autre. L'épaisseur du mur est la somme des couches ; le plan dessine
   chaque couche à sa place, la 3D et les exports gardent l'épaisseur.

   Compositions courantes en maison individuelle, sans marque ni prix (le
   programme technique du suivi de chantiers reste la référence) : les
   épaisseurs d'isolant et de doublage sont des valeurs d'usage, à confirmer
   par l'étude thermique et le descriptif. « ou équivalent » partout. */
import type { Mm, Wall } from '../model/types';

export type MatiereCouche = 'enduit' | 'parpaing' | 'brique' | 'beton' | 'beton_cellulaire' | 'ossature_bois' | 'laine_verre' | 'laine_roche' | 'polystyrene' | 'platre' | 'carreau_platre' | 'vide';

/** comment dessiner une couche en plan : la teinte, et un motif (hachures de maçonnerie, ondulation d'isolant) */
export const MATIERES_COUCHES: Record<MatiereCouche, { libelle: string; couleur: string; motif: 'plein' | 'hachures' | 'isolant' | 'croix' }> = {
  enduit: { libelle: 'Enduit', couleur: '#E9E3D6', motif: 'plein' },
  parpaing: { libelle: 'Parpaing', couleur: '#B9B3A8', motif: 'hachures' },
  brique: { libelle: 'Brique', couleur: '#C98A6A', motif: 'hachures' },
  beton: { libelle: 'Béton', couleur: '#A7A49E', motif: 'croix' },
  beton_cellulaire: { libelle: 'Béton cellulaire', couleur: '#D9D6CF', motif: 'hachures' },
  ossature_bois: { libelle: 'Ossature bois', couleur: '#D2AF7E', motif: 'croix' },
  laine_verre: { libelle: 'Laine de verre', couleur: '#F2DE8C', motif: 'isolant' },
  laine_roche: { libelle: 'Laine de roche', couleur: '#D9C27A', motif: 'isolant' },
  polystyrene: { libelle: 'Polystyrène', couleur: '#E6EEF2', motif: 'isolant' },
  platre: { libelle: 'Plâtre', couleur: '#F7F5F0', motif: 'plein' },
  carreau_platre: { libelle: 'Carreau de plâtre', couleur: '#EFEBE3', motif: 'plein' },
  vide: { libelle: 'Vide (lame d’air)', couleur: '#FFFFFF', motif: 'plein' },
};

/** le genre de mur que l'on trace : il décide des compositions proposées */
export type GenreMur = 'exterieur' | 'interieur' | 'cloison';

export interface Couche { matiere: MatiereCouche; epaisseur: Mm }
export interface CompositionMur {
  id: string;
  libelle: string;
  genre: GenreMur;
  /** de la face extérieure à la face intérieure (mur de façade), ou d'une face à l'autre */
  couches: readonly Couche[];
}

const c = (matiere: MatiereCouche, epaisseur: Mm): Couche => ({ matiere, epaisseur });
const mur = (id: string, libelle: string, genre: GenreMur, ...couches: Couche[]): CompositionMur => ({ id, libelle, genre, couches });

export const COMPOSITIONS_MURS: readonly CompositionMur[] = [
  /* murs de façade : maçonnerie de 20 cm enduite, doublage isolant collé (laine + plâtre) */
  mur('ext-isole-40', 'Mur extérieur isolé 40', 'exterieur', c('enduit', 20), c('parpaing', 200), c('laine_verre', 167), c('platre', 13)),
  mur('ext-isole-38', 'Mur extérieur isolé 38', 'exterieur', c('enduit', 20), c('parpaing', 200), c('laine_verre', 147), c('platre', 13)),
  mur('ext-isole-36', 'Mur extérieur isolé 36', 'exterieur', c('enduit', 20), c('parpaing', 200), c('laine_verre', 127), c('platre', 13)),
  mur('ext-brique-isole-36', 'Mur extérieur brique isolé 36', 'exterieur', c('enduit', 20), c('brique', 200), c('laine_verre', 127), c('platre', 13)),
  mur('ext-cellulaire-35', 'Mur extérieur béton cellulaire 35', 'exterieur', c('enduit', 15), c('beton_cellulaire', 300), c('vide', 22), c('platre', 13)),
  mur('ext-ossature-bois-30', 'Mur extérieur ossature bois 30', 'exterieur', c('enduit', 15), c('polystyrene', 60), c('ossature_bois', 145), c('laine_verre', 45), c('platre', 35)),
  mur('ext-non-isole-22', 'Mur extérieur non isolé 22', 'exterieur', c('enduit', 20), c('parpaing', 200)),
  mur('ext-garage-20', 'Mur de garage brut 20', 'exterieur', c('parpaing', 200)),
  /* murs intérieurs (refends) : maçonnerie enduite au plâtre des deux côtés */
  mur('int-parpaing-22', 'Mur intérieur parpaing 22', 'interieur', c('platre', 10), c('parpaing', 200), c('platre', 10)),
  mur('int-parpaing-15', 'Mur intérieur parpaing 15', 'interieur', c('platre', 10), c('parpaing', 130), c('platre', 10)),
  mur('int-beton-20', 'Mur intérieur béton 20', 'interieur', c('beton', 200)),
  /* cloisons : plaques sur ossature (isolant phonique), ou carreaux de plâtre */
  mur('cloison-72', 'Cloison 72/48', 'cloison', c('platre', 13), c('laine_verre', 46), c('platre', 13)),
  mur('cloison-98', 'Cloison 98/48', 'cloison', c('platre', 25), c('laine_verre', 48), c('platre', 25)),
  mur('cloison-carreau-70', 'Cloison carreaux de plâtre 7', 'cloison', c('carreau_platre', 70)),
  mur('cloison-carreau-100', 'Cloison carreaux de plâtre 10', 'cloison', c('carreau_platre', 100)),
];

/** les compositions proposées par défaut, pour chaque genre */
export const COMPOSITION_PAR_DEFAUT: Record<GenreMur, string> = { exterieur: 'ext-isole-36', interieur: 'int-parpaing-22', cloison: 'cloison-72' };

export const compositionMur = (id: string | null | undefined): CompositionMur | undefined => (id ? COMPOSITIONS_MURS.find(x => x.id === id) : undefined);
export const epaisseurComposition = (k: CompositionMur): Mm => k.couches.reduce((s, x) => s + x.epaisseur, 0);
export const compositionsDu = (g: GenreMur): CompositionMur[] => COMPOSITIONS_MURS.filter(x => x.genre === g);

/** le genre de mur (pour ses compositions) d'un rôle de mur ; null : une cloison fictive n'a pas de matière */
export function genreDuRole(r: Wall['role']): GenreMur | null {
  return r === 'exterior' ? 'exterieur' : r === 'bearing_interior' ? 'interieur' : r === 'partition' ? 'cloison' : null;
}
/** le rôle d'un mur d'après le genre de sa composition */
export const roleDuGenre = (g: GenreMur): Wall['role'] => (g === 'exterieur' ? 'exterior' : g === 'interieur' ? 'bearing_interior' : 'partition');
