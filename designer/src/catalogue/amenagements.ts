/* Les aménagements extérieurs du plan de masse : clôtures, terrasses,
   allées, stationnement, espaces verts. Des aspects courants, ni marque ni
   prix ; hauteurs habituelles, réglables ensuite (le PLU fixe souvent la
   hauteur des clôtures : à vérifier). */
import type { Mm } from '../model/types';

export type GenreAmenagement = 'fence' | 'terrace' | 'path' | 'parking' | 'green';

export const GENRES_AMENAGEMENT: Record<GenreAmenagement, { libelle: string; ligne: boolean }> = {
  fence: { libelle: 'Clôture', ligne: true },
  terrace: { libelle: 'Terrasse', ligne: false },
  path: { libelle: 'Allée, accès', ligne: false },
  parking: { libelle: 'Stationnement', ligne: false },
  green: { libelle: 'Espace vert', ligne: false },
};

export interface FinitionAmenagement {
  id: string; genre: GenreAmenagement; libelle: string; couleur: string;
  /** clôture : hauteur et épaisseur habituelles (mm) ; terrasse : niveau fini sous le ±0,00 */
  hauteur: Mm; epaisseur?: Mm;
}

const f = (id: string, genre: GenreAmenagement, libelle: string, couleur: string, hauteur: Mm, epaisseur?: Mm): FinitionAmenagement =>
  ({ id, genre, libelle, couleur, hauteur, ...(epaisseur ? { epaisseur } : {}) });

export const FINITIONS_AMENAGEMENT: readonly FinitionAmenagement[] = [
  f('grillage-rigide-vert', 'fence', 'Grillage rigide vert', '#3F6B4A', 1_500, 40),
  f('grillage-rigide-anthracite', 'fence', 'Grillage rigide anthracite', '#3E4247', 1_500, 40),
  f('palissade-bois', 'fence', 'Palissade bois', '#9C7552', 1_800, 60),
  f('mur-bahut-grille', 'fence', 'Mur bahut et grille', '#D9D3C7', 1_500, 200),
  f('mur-cloture-enduit', 'fence', 'Mur de clôture enduit', '#E2D2B4', 1_800, 200),
  f('haie-vive', 'fence', 'Haie vive', '#5E8A4E', 1_600, 600),
  f('terrasse-bois', 'terrace', 'Terrasse en lames bois', '#B98A5C', 20),
  f('terrasse-dalles', 'terrace', 'Terrasse en dalles grès cérame', '#C9C3B6', 20),
  f('terrasse-beton', 'terrace', 'Terrasse béton désactivé', '#BDB4A3', 20),
  f('allee-enrobe', 'path', 'Enrobé', '#595D61', 0),
  f('allee-gravillons', 'path', 'Gravillons', '#D4CCBC', 0),
  f('allee-paves', 'path', 'Pavés', '#A79C8C', 0),
  f('allee-beton', 'path', 'Béton désactivé', '#BDB4A3', 0),
  f('stationnement-evergreen', 'parking', 'Dalles engazonnées', '#8DAA74', 0),
  f('stationnement-enrobe', 'parking', 'Stationnement en enrobé', '#595D61', 0),
  f('pelouse', 'green', 'Pelouse', '#A8C686', 0),
  f('massif-plante', 'green', 'Massif planté', '#7FA05E', 0),
];

export const finitionAmenagement = (id: string): FinitionAmenagement | undefined => FINITIONS_AMENAGEMENT.find(x => x.id === id);
export const finitionsDe = (g: GenreAmenagement): FinitionAmenagement[] => FINITIONS_AMENAGEMENT.filter(x => x.genre === g);
