/* Les tolérances du Geometry Engine : nommées, centralisées, testées.
   Aucune comparaison de flottants ne s'écrit ailleurs avec un seuil « au
   jugé » : elle passe par ces constantes (voir ADR-0002). */

/** deux points plus proches que ceci sont le même point (0,01 mm) */
export const EPS_COINCIDENCE = 0.01;
/** en dessous, deux directions sont parallèles (radians) */
export const EPS_ANGLE = 1e-9;
/** facteur des opérations booléennes en entiers : 1 unité = 0,01 mm */
export const ECHELLE_ENTIERS = 100;

/** jeu de soudure de la maçonnerie (mm) : deux murs que sépare un jour plus
 *  fin que deux fois ce jeu sont un seul massif. Sur un mur oblique, une
 *  cloison en T touche sa face en des points que la grille des entiers
 *  (0,01 mm) peut écarter d'un centième : sans soudure, ce centième ferait
 *  communiquer deux pièces. Aucun vrai jour de mur ne mesure 0,1 mm. */
export const JEU_SOUDURE = 0.05;

export const egal = (a: number, b: number, eps: number = EPS_COINCIDENCE): boolean => Math.abs(a - b) <= eps;
