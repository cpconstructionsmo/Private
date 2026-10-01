/* Les tolérances du Geometry Engine : nommées, centralisées, testées.
   Aucune comparaison de flottants ne s'écrit ailleurs avec un seuil « au
   jugé » : elle passe par ces constantes (voir ADR-0002). */

/** deux points plus proches que ceci sont le même point (0,01 mm) */
export const EPS_COINCIDENCE = 0.01;
/** en dessous, deux directions sont parallèles (radians) */
export const EPS_ANGLE = 1e-9;
/** facteur des opérations booléennes en entiers : 1 unité = 0,01 mm */
export const ECHELLE_ENTIERS = 100;

export const egal = (a: number, b: number, eps: number = EPS_COINCIDENCE): boolean => Math.abs(a - b) <= eps;
