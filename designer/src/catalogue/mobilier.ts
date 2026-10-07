/* La bibliothèque de mobilier : des meubles et équipements courants, pour
   meubler un plan et le montrer en 3D. Dimensions habituelles (largeur ×
   profondeur × hauteur), ni marque ni prix ; un meuble posé se règle
   ensuite. Chaque modèle a une FORME (lit, canapé, évier…) qui dit comment
   le dessiner en plan et en 3D (building/mobilier.ts).

   Repère d'un meuble : origine au centre, x le long de sa largeur, y de sa
   profondeur ; le dos est du côté −y (contre le mur), le devant du côté +y. */
import type { Mm } from '../model/types';

export type Forme = 'boite' | 'lit' | 'canape' | 'fauteuil' | 'table' | 'table_ronde' | 'chaise' | 'armoire' | 'placard' | 'commode' | 'bureau'
  | 'meuble_tv' | 'meuble_bas' | 'evier' | 'plaque' | 'refrigerateur' | 'lave_vaisselle' | 'colonne' | 'ilot'
  | 'wc' | 'lavabo' | 'vasque_double' | 'douche' | 'baignoire' | 'lave_linge' | 'chauffe_eau' | 'aire_rotation';

export type FamilleMeuble = 'sejour' | 'chambre' | 'cuisine' | 'salle_de_bains' | 'wc_buanderie' | 'accessibilite';

export const FAMILLES_MEUBLES: Record<FamilleMeuble, string> = {
  sejour: 'Séjour, repas', chambre: 'Chambre, bureau', cuisine: 'Cuisine', salle_de_bains: 'Salle de bains',
  wc_buanderie: 'WC, buanderie, technique', accessibilite: 'Accessibilité',
};

export interface ModeleMeuble { id: string; famille: FamilleMeuble; libelle: string; forme: Forme; largeur: Mm; profondeur: Mm; hauteur: Mm }

const m = (id: string, famille: FamilleMeuble, libelle: string, forme: Forme, largeur: Mm, profondeur: Mm, hauteur: Mm): ModeleMeuble =>
  ({ id, famille, libelle, forme, largeur, profondeur, hauteur });

export const MODELES_MEUBLES: readonly ModeleMeuble[] = [
  m('canape-3p', 'sejour', 'Canapé 3 places', 'canape', 2_200, 950, 850),
  m('canape-2p', 'sejour', 'Canapé 2 places', 'canape', 1_700, 900, 850),
  m('fauteuil', 'sejour', 'Fauteuil', 'fauteuil', 850, 850, 800),
  m('table-basse', 'sejour', 'Table basse', 'table', 1_100, 600, 400),
  m('meuble-tv', 'sejour', 'Meuble TV', 'meuble_tv', 1_800, 450, 500),
  m('table-6', 'sejour', 'Table 6 personnes', 'table', 1_800, 900, 750),
  m('table-4', 'sejour', 'Table 4 personnes', 'table', 1_200, 800, 750),
  m('table-ronde', 'sejour', 'Table ronde Ø 110', 'table_ronde', 1_100, 1_100, 750),
  m('chaise', 'sejour', 'Chaise', 'chaise', 450, 500, 900),
  m('buffet', 'sejour', 'Buffet', 'commode', 1_800, 500, 850),
  m('lit-90', 'chambre', 'Lit 90 × 190', 'lit', 900, 1_900, 500),
  m('lit-140', 'chambre', 'Lit 140 × 190', 'lit', 1_400, 1_900, 500),
  m('lit-160', 'chambre', 'Lit 160 × 200', 'lit', 1_600, 2_000, 500),
  m('lit-180', 'chambre', 'Lit 180 × 200', 'lit', 1_800, 2_000, 500),
  m('chevet', 'chambre', 'Chevet', 'commode', 450, 400, 500),
  m('armoire-2p', 'chambre', 'Armoire 2 portes', 'armoire', 1_000, 600, 2_000),
  m('armoire-3p', 'chambre', 'Armoire 3 portes', 'armoire', 1_500, 600, 2_200),
  m('commode', 'chambre', 'Commode', 'commode', 1_000, 500, 850),
  /* les placards intégrés (« PL » des plans) : façades coulissantes, de sol à plafond */
  m('placard-100', 'chambre', 'Placard 100', 'placard', 1_000, 600, 2_500),
  m('placard-150', 'chambre', 'Placard 150', 'placard', 1_500, 600, 2_500),
  m('placard-200', 'chambre', 'Placard 200', 'placard', 2_000, 600, 2_500),
  m('bureau', 'chambre', 'Bureau', 'bureau', 1_200, 600, 750),
  m('meuble-bas-60', 'cuisine', 'Meuble bas 60', 'meuble_bas', 600, 600, 900),
  m('meuble-bas-120', 'cuisine', 'Meuble bas 120', 'meuble_bas', 1_200, 600, 900),
  m('evier', 'cuisine', 'Évier 2 bacs 120', 'evier', 1_200, 600, 900),
  m('plaque', 'cuisine', 'Plaque de cuisson 60', 'plaque', 600, 600, 900),
  m('lave-vaisselle', 'cuisine', 'Lave-vaisselle 60', 'lave_vaisselle', 600, 600, 850),
  m('refrigerateur', 'cuisine', 'Réfrigérateur 60', 'refrigerateur', 600, 650, 1_850),
  m('refrigerateur-us', 'cuisine', 'Réfrigérateur américain', 'refrigerateur', 900, 700, 1_800),
  m('colonne-four', 'cuisine', 'Colonne four 60', 'colonne', 600, 600, 2_200),
  m('ilot', 'cuisine', 'Îlot 180 × 90', 'ilot', 1_800, 900, 900),
  m('lavabo', 'salle_de_bains', 'Lavabo 60', 'lavabo', 600, 450, 850),
  m('vasque-double', 'salle_de_bains', 'Meuble double vasque 120', 'vasque_double', 1_200, 500, 850),
  m('douche-90', 'salle_de_bains', 'Douche 90 × 90', 'douche', 900, 900, 2_000),
  m('douche-120', 'salle_de_bains', 'Douche 120 × 90', 'douche', 1_200, 900, 2_000),
  m('baignoire-170', 'salle_de_bains', 'Baignoire 170 × 70', 'baignoire', 1_700, 700, 550),
  m('baignoire-180', 'salle_de_bains', 'Baignoire 180 × 80', 'baignoire', 1_800, 800, 550),
  m('wc-suspendu', 'salle_de_bains', 'WC suspendu', 'wc', 370, 540, 400),
  m('wc', 'wc_buanderie', 'WC à poser', 'wc', 370, 650, 800),
  m('lave-mains', 'wc_buanderie', 'Lave-mains', 'lavabo', 400, 250, 850),
  m('lave-linge', 'wc_buanderie', 'Lave-linge', 'lave_linge', 600, 600, 850),
  m('seche-linge', 'wc_buanderie', 'Sèche-linge', 'lave_linge', 600, 600, 850),
  m('chauffe-eau', 'wc_buanderie', 'Chauffe-eau 200 L', 'chauffe_eau', 600, 600, 1_500),
  m('aire-rotation', 'accessibilite', 'Aire de rotation Ø 150', 'aire_rotation', 1_500, 1_500, 0),
];

export const modeleMeuble = (id: string): ModeleMeuble | undefined => MODELES_MEUBLES.find(x => x.id === id);
