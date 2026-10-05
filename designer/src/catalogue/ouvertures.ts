/* La bibliothèque d'ouvertures de CP : des modèles courants, en dimensions
   de TABLEAU (le trou dans le mur), à poser d'un clic sur un mur. Ni marque
   ni prix : ce sont des gabarits de dessin. Une fois posée, une ouverture se
   règle librement (largeur, hauteur, allège, vantaux) ; elle garde le nom
   du modèle d'origine pour mémoire.

   Hauteurs : le haut des fenêtres est aligné sur celui des portes-fenêtres
   (2,15 m), d'où l'allège = 2,15 m − hauteur. Les dimensions sont des
   valeurs courantes de menuiserie, à confirmer avec le menuisier (statut
   « à vérifier » tant qu'aucun devis ne les fixe). */
import type { Mm, Opening } from '../model/types';

export interface ModeleOuverture {
  id: string;
  famille: Famille;
  libelle: string;
  genre: Opening['kind'];
  largeur: Mm; hauteur: Mm; allege: Mm;
  vantaux: number;
  manoeuvre: NonNullable<Opening['operation']>;
}

export type Famille = 'fenetres' | 'portes_fenetres' | 'portes_entree' | 'portes_interieures' | 'garage' | 'passages';

export const FAMILLES: Record<Famille, string> = {
  fenetres: 'Fenêtres', portes_fenetres: 'Portes-fenêtres et baies', portes_entree: 'Portes d’entrée et de service',
  portes_interieures: 'Portes intérieures', garage: 'Portes de garage', passages: 'Passages',
};

const HAUT = 2_150;
const f = (id: string, libelle: string, l: Mm, h: Mm, vantaux: number, manoeuvre: ModeleOuverture['manoeuvre'] = 'hinged'): ModeleOuverture =>
  ({ id, famille: 'fenetres', libelle, genre: 'window', largeur: l, hauteur: h, allege: HAUT - h, vantaux, manoeuvre });

export const MODELES_OUVERTURES: readonly ModeleOuverture[] = [
  f('fen-1v-60x75', 'Fenêtre 1 vantail 60 × 75', 600, 750, 1, 'tilt_turn'),
  f('fen-1v-60x95', 'Fenêtre 1 vantail 60 × 95', 600, 950, 1, 'tilt_turn'),
  f('fen-1v-80x125', 'Fenêtre 1 vantail 80 × 125', 800, 1_250, 1),
  f('fen-2v-100x125', 'Fenêtre 2 vantaux 100 × 125', 1_000, 1_250, 2),
  f('fen-2v-120x125', 'Fenêtre 2 vantaux 120 × 125', 1_200, 1_250, 2),
  f('fen-2v-140x135', 'Fenêtre 2 vantaux 140 × 135', 1_400, 1_350, 2),
  f('fen-coul-160x125', 'Fenêtre coulissante 160 × 125', 1_600, 1_250, 2, 'sliding'),
  f('fen-fixe-60x60', 'Châssis fixe 60 × 60', 600, 600, 1, 'fixed'),
  f('fen-fixe-100x125', 'Châssis fixe 100 × 125', 1_000, 1_250, 1, 'fixed'),
  f('fen-fixe-120x215', 'Châssis fixe toute hauteur 120 × 215', 1_200, HAUT, 1, 'fixed'),
  { id: 'pf-1v-80x215', famille: 'portes_fenetres', libelle: 'Porte-fenêtre 1 vantail 80 × 215', genre: 'french_window', largeur: 800, hauteur: HAUT, allege: 0, vantaux: 1, manoeuvre: 'hinged' },
  { id: 'pf-2v-120x215', famille: 'portes_fenetres', libelle: 'Porte-fenêtre 2 vantaux 120 × 215', genre: 'french_window', largeur: 1_200, hauteur: HAUT, allege: 0, vantaux: 2, manoeuvre: 'hinged' },
  { id: 'pf-2v-140x215', famille: 'portes_fenetres', libelle: 'Porte-fenêtre 2 vantaux 140 × 215', genre: 'french_window', largeur: 1_400, hauteur: HAUT, allege: 0, vantaux: 2, manoeuvre: 'hinged' },
  { id: 'baie-2v-180x215', famille: 'portes_fenetres', libelle: 'Baie coulissante 2 vantaux 180 × 215', genre: 'bay', largeur: 1_800, hauteur: HAUT, allege: 0, vantaux: 2, manoeuvre: 'sliding' },
  { id: 'baie-2v-240x215', famille: 'portes_fenetres', libelle: 'Baie coulissante 2 vantaux 240 × 215', genre: 'bay', largeur: 2_400, hauteur: HAUT, allege: 0, vantaux: 2, manoeuvre: 'sliding' },
  { id: 'baie-3v-300x215', famille: 'portes_fenetres', libelle: 'Baie coulissante 3 vantaux 300 × 215', genre: 'bay', largeur: 3_000, hauteur: HAUT, allege: 0, vantaux: 3, manoeuvre: 'sliding' },
  { id: 'baie-4v-360x215', famille: 'portes_fenetres', libelle: 'Baie coulissante 4 vantaux 360 × 215', genre: 'bay', largeur: 3_600, hauteur: HAUT, allege: 0, vantaux: 4, manoeuvre: 'sliding' },
  { id: 'baie-gal-240x215', famille: 'portes_fenetres', libelle: 'Baie à galandage 1 vantail 240 × 215', genre: 'bay', largeur: 2_400, hauteur: HAUT, allege: 0, vantaux: 1, manoeuvre: 'sliding' },
  { id: 'baie-gal-2v-300x215', famille: 'portes_fenetres', libelle: 'Baie à galandage 2 vantaux 300 × 215', genre: 'bay', largeur: 3_000, hauteur: HAUT, allege: 0, vantaux: 2, manoeuvre: 'sliding' },
  { id: 'pe-90x215', famille: 'portes_entree', libelle: 'Porte d’entrée 90 × 215', genre: 'door', largeur: 900, hauteur: HAUT, allege: 0, vantaux: 1, manoeuvre: 'hinged' },
  { id: 'pe-100x215', famille: 'portes_entree', libelle: 'Porte d’entrée 100 × 215', genre: 'door', largeur: 1_000, hauteur: HAUT, allege: 0, vantaux: 1, manoeuvre: 'hinged' },
  { id: 'pe-2v-140x215', famille: 'portes_entree', libelle: 'Porte d’entrée 2 vantaux 140 × 215', genre: 'door', largeur: 1_400, hauteur: HAUT, allege: 0, vantaux: 2, manoeuvre: 'hinged' },
  { id: 'ps-80x205', famille: 'portes_entree', libelle: 'Porte de service 80 × 205', genre: 'door', largeur: 800, hauteur: 2_050, allege: 0, vantaux: 1, manoeuvre: 'hinged' },
  { id: 'pi-63x204', famille: 'portes_interieures', libelle: 'Bloc-porte 63 × 204', genre: 'door', largeur: 630, hauteur: 2_040, allege: 0, vantaux: 1, manoeuvre: 'hinged' },
  { id: 'pi-73x204', famille: 'portes_interieures', libelle: 'Bloc-porte 73 × 204', genre: 'door', largeur: 730, hauteur: 2_040, allege: 0, vantaux: 1, manoeuvre: 'hinged' },
  { id: 'pi-83x204', famille: 'portes_interieures', libelle: 'Bloc-porte 83 × 204', genre: 'door', largeur: 830, hauteur: 2_040, allege: 0, vantaux: 1, manoeuvre: 'hinged' },
  { id: 'pi-93x204', famille: 'portes_interieures', libelle: 'Bloc-porte 93 × 204', genre: 'door', largeur: 930, hauteur: 2_040, allege: 0, vantaux: 1, manoeuvre: 'hinged' },
  { id: 'pi-gal-83x204', famille: 'portes_interieures', libelle: 'Porte à galandage 83 × 204', genre: 'door', largeur: 830, hauteur: 2_040, allege: 0, vantaux: 1, manoeuvre: 'sliding' },
  { id: 'pi-2v-146x204', famille: 'portes_interieures', libelle: 'Porte double 146 × 204', genre: 'door', largeur: 1_460, hauteur: 2_040, allege: 0, vantaux: 2, manoeuvre: 'hinged' },
  { id: 'pg-sec-240x200', famille: 'garage', libelle: 'Sectionnelle 240 × 200', genre: 'garage_door', largeur: 2_400, hauteur: 2_000, allege: 0, vantaux: 1, manoeuvre: 'sectional' },
  { id: 'pg-sec-300x200', famille: 'garage', libelle: 'Sectionnelle 300 × 200', genre: 'garage_door', largeur: 3_000, hauteur: 2_000, allege: 0, vantaux: 1, manoeuvre: 'sectional' },
  { id: 'pg-bas-240x200', famille: 'garage', libelle: 'Basculante 240 × 200', genre: 'garage_door', largeur: 2_400, hauteur: 2_000, allege: 0, vantaux: 1, manoeuvre: 'up_and_over' },
  { id: 'pg-enr-240x200', famille: 'garage', libelle: 'Enroulable 240 × 200', genre: 'garage_door', largeur: 2_400, hauteur: 2_000, allege: 0, vantaux: 1, manoeuvre: 'roller' },
  { id: 'pas-90x204', famille: 'passages', libelle: 'Passage 90 × 204', genre: 'void', largeur: 900, hauteur: 2_040, allege: 0, vantaux: 1, manoeuvre: 'fixed' },
  { id: 'pas-140x215', famille: 'passages', libelle: 'Passage 140 × 215', genre: 'void', largeur: 1_400, hauteur: HAUT, allege: 0, vantaux: 1, manoeuvre: 'fixed' },
];

export const modeleOuverture = (id: string): ModeleOuverture | undefined => MODELES_OUVERTURES.find(m => m.id === id);

/** la manœuvre et le nombre de vantaux d'une ouverture, valeurs habituelles du genre si elle ne les dit pas */
export function manoeuvreDe(o: Pick<Opening, 'kind' | 'leaves' | 'operation'>): { manoeuvre: NonNullable<Opening['operation']>; vantaux: number } {
  const defaut: Record<Opening['kind'], [NonNullable<Opening['operation']>, number]> = {
    door: ['hinged', 1], window: ['hinged', 2], french_window: ['hinged', 2], bay: ['sliding', 2], garage_door: ['sectional', 1], void: ['fixed', 1],
  };
  const [m, v] = defaut[o.kind];
  return { manoeuvre: o.operation ?? m, vantaux: o.leaves ?? v };
}

export const MANOEUVRES: Record<NonNullable<Opening['operation']>, string> = {
  hinged: 'Battant', sliding: 'Coulissant', fixed: 'Fixe', tilt_turn: 'Oscillo-battant', sectional: 'Sectionnelle', up_and_over: 'Basculante', roller: 'Enroulable',
};
