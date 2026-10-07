/* CP Designer — l'éditeur 2D.

   L'application ne fait que relier : gestes → outils → commandes →
   historique → enregistrement, et modèle → dessin. Aucune règle métier ici :
   une commande refusée l'est par le moteur, et la raison s'affiche telle
   quelle. Un aperçu (pendant un tracé ou un glissement) joue les commandes
   sur une copie, sans rien enregistrer. */
import type { Beam, BuildingObject, Column, Dormer, Floor, Foundation, Underlay, Mm, Network, NetworkItem, Opening, Plot, Point, Project, Roof, RoomUsage, Stair, Tree, Viewpoint, Wall } from '../model/types';
import { ulid, canonique } from '../model';
import { trouverNiveau } from '../model/projet';
import { annulerEnregistre, commandesColler, commandesSupprimer, copier, executer, nouvelHistorique, peutAnnuler, peutRetablir, resumePressePapiers, retablirEnregistre, type Acteur, type Commande, type Historique, type PressePapiers } from '../engine';
import { planDuNiveau, mursDroits, geometrieOuverture, cotationExterieure, cotesInterieures, placeOuverture, positionPour, toitureDuNiveau, geometrieEscalier, hauteurAFranchir, niveauDArrivee, tremiesDuNiveau, parcelleDuProjet, empriseAuSol, aireEmprise, surfaceTerrain, reculs, placerParcelle, orienterParcelle, maisonDansParcelle, bilanAmenagements, surfacesReglementaires, REFERENCES, pointsDeVue, metreTerrain, cubature, longueurReseau, altitudePlateforme, NOMS_RESEAUX, profilEnLong, plateformesDuProjet, metreProjet, metreCsv, MATIERES_STRUCTURE, planFondations, fondationsDuProjet, SOUBASSEMENTS, eauxPluviales, NOMS_LIGNES, FINITIONS_EGOUT, GOUTTIERES, MATIERES_GOUTTIERE, lireCadastreGeoJSON, parcellesDeReference, fondCadastral, type CadastreLu, type MurDroit } from '../building';
import { boite as boiteAnneau, mm2EnM2 } from '../geometry/polygon';
import { distance, normaliser, soustraire } from '../geometry/vecteur';
import { cadrer, glisser, pixelsEnMm, versEcran, versMonde, zoomer, type Camera } from './camera';
import { dessiner, NOMS_ACCROCHE, type Scene } from './dessin';
import { Outils, OUVERTURES, type Effet, type Geste, type NomOutil } from './outils';
import { dessinCote, texteCote } from './cotes';
import { ouvrirSession, type Enregistreur } from './session';
import { commandesImport, comparerSurfaces, lireModeleAtelier, traitsSource } from '../import/atelier';
import { imageDuFond, importerFichier, nombrePages, traitsDuFond, type ImageFond } from './fonds';
import { AimantFond } from '../building/accrochage';
import { imageVersPlan } from '../building/fond';
import type { Trait } from '../import/traits-fond';
import type { Accroche } from '../building/accrochage';
import { equerrer } from '../building/equerre';
import { ANGLE_EQUERRE } from '../geometry/tolerance';
import { maquette } from '../vue3d/maquette';
import { PAREMENTS, PEINTURES, SOLS } from '../catalogue/materiaux';
import { MATERIAUX_MENUISERIES, TEINTES_MENUISERIES } from '../catalogue/menuiseries';
import { MODELES_MAISONS, modeleMaison } from '../catalogue/modeles-maisons';
import { geometrieFenetreToit, TAILLES_FENETRE_TOIT } from '../building/fenetres-toit';
import { geometrieLucarne, LUCARNES } from '../building/lucarnes';
import { GENRES_AMENAGEMENT, finitionAmenagement, finitionsDe, type GenreAmenagement } from '../catalogue/amenagements';
import { coupe, ligneDe, traitsDeCoupe, type LigneDeCoupe } from '../vue3d/coupe';
import type { Vue3D } from './vue3d';
import type { Cabinet, ImageDossier } from '../export/planche';
import type { InfosDossier } from '../model/types';
import { FAMILLES, MANOEUVRES, MODELES_OUVERTURES, manoeuvreDe, modeleOuverture, type ModeleOuverture } from '../catalogue/ouvertures';
import { FAMILLES_MEUBLES, MODELES_MEUBLES, type ModeleMeuble } from '../catalogue/mobilier';
import { traits } from '../building/mobilier';
import { icone } from './icones';
import { lirePlanGeometre, lirePointsTexte } from '../import/geometre';
import { NOMS_EQUIPEMENTS, ETATS_ARBRES } from './dessin-terrain';
import { MATIERES_PLANCHER, compositionPlancher, compositionsPlancher, epaisseurPlancher, type CompositionPlancher } from '../catalogue/planchers';
import { COMPOSITION_PAR_DEFAUT, MATIERES_COUCHES, compositionMur, compositionsDu, epaisseurComposition, genreDuRole, type CompositionMur } from '../catalogue/murs';

const USAGES: Record<RoomUsage, string> = {
  living: 'Séjour', bedroom: 'Chambre', kitchen: 'Cuisine', bathroom: 'Salle d’eau / de bains', wc: 'WC', circulation: 'Circulation',
  storage: 'Rangement', garage: 'Garage', technical: 'Technique', other: 'Autre',
};
const ROLES: Record<Wall['role'], string> = { exterior: 'Mur extérieur', bearing_interior: 'Mur intérieur (refend)', partition: 'Cloison', virtual: 'Cloison fictive' };
const JUSTIFS: Record<Wall['justification'], string> = { center: 'À l’axe', left: 'Par la face gauche', right: 'Par la face droite' };
const ESCALIERS: Record<Stair['kind'], string> = { straight: 'Droit', quarter_left: 'Quart tournant à gauche', quarter_right: 'Quart tournant à droite' };
const TOITURES: Record<Roof['kind'], string> = { hip: 'À croupes', gable: 'Deux pans (pignons)', shed: 'Un pan', flat: 'Toit-terrasse' };
const COUVERTURES: Record<Roof['covering'], string> = { tile: 'Tuiles terre cuite', slate: 'Ardoises', zinc: 'Zinc', steel: 'Bac acier', green: 'Végétalisée', gravel: 'Gravillons (terrasse)' };
const CONTRAINTES: Record<string, string> = { horizontal: 'Horizontal', vertical: 'Vertical', parallel: 'Parallèle', perpendicular: 'Perpendiculaire', length: 'Longueur fixe', angle: 'Angle fixe' };

const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',') + ' m';
const OPTIONS_PAREMENTS: Record<string, string> = { '': 'Sans (maçonnerie)', ...Object.fromEntries(PAREMENTS.map(m => [m.id, m.libelle])) };
const OPTIONS_SOLS: Record<string, string> = { '': 'Non précisé', ...Object.fromEntries(SOLS.map(m => [m.id, m.libelle])) };
const OPTIONS_PEINTURES: Record<string, string> = { '': 'Non précisé', ...Object.fromEntries(PEINTURES.map(m => [m.id, m.libelle])) };
const m2 = (v: number) => mm2EnM2(v).toFixed(2).replace('.', ',') + ' m²';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const date = (iso: string) => { try { return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) } catch { return iso } };

const CSS = `
.cpd{--ent:#2B2B2B;--sous:#3A3A3A;--ruban:#4D4D4D;--pan:#3B3B3B;--carte:#2F2F2F;--trait:#565656;--txt:#EFEFEF;--txt2:#BDBDBD;--acc:#1FA89A;--acc2:#17867B;--orange:#E8743B;
  position:fixed;inset:0;display:grid;grid-template-columns:auto 1fr 380px;grid-template-rows:52px 36px 92px 1fr;font:13px/1.4 "Segoe UI",system-ui,-apple-system,sans-serif;color:var(--txt);background:var(--pan)}
.cpd header{grid-column:1/4;grid-row:1;display:flex;align-items:stretch;padding:0 0 0 10px;background:var(--ent);color:var(--txt)}
.cpd header .marque{display:flex;flex-direction:column;justify-content:center;padding-right:10px;color:#fff;font-weight:700;letter-spacing:.06em;font-size:10px;line-height:1.1}
.cpd header .marque b{color:var(--acc);font-size:17px;letter-spacing:.02em}
.cpd header input.nom{align-self:center;font:600 14px "Segoe UI",system-ui;border:1px solid transparent;border-radius:4px;padding:4px 6px;width:190px;color:#fff;background:none;text-transform:uppercase;letter-spacing:.02em;text-overflow:ellipsis}
.cpd header input.nom:hover,.cpd header input.nom:focus{border-color:var(--trait);background:var(--sous)}
.cpd header nav.onglets{display:flex;margin-left:10px;border-left:1px solid #444}
.cpd header nav.onglets button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:92px;padding:4px 8px 2px;border:none;border-right:1px solid #444;border-bottom:3px solid transparent;border-radius:0;background:none;color:var(--txt);font:600 13px "Segoe UI",system-ui;cursor:pointer}
.cpd header nav.onglets button:hover{background:#353535}
.cpd header nav.onglets button.actif{background:#3A3A3A;border-bottom-color:var(--acc);color:#fff}
.cpd header .esp{flex:1}
.cpd header .droite-entete{display:flex;align-items:center;gap:2px;padding:0 8px}
.cpd header .droite-entete button,.cpd header .droite-entete a{display:flex;align-items:center;justify-content:center;width:38px;height:38px;padding:0;border:none;border-radius:4px;background:none;color:var(--txt);text-decoration:none}
.cpd header .droite-entete button:hover,.cpd header .droite-entete a:hover{background:#3A3A3A}
.cpd header .droite-entete button.texte{width:auto;padding:0 8px;font:600 12px "Segoe UI",system-ui}
.cpd .etat{font-size:11px;padding:2px 8px;border-radius:10px;background:#24443F;color:#A9E2D9;white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis;margin-right:6px}
.cpd .etat.local,.cpd .etat.hors_ligne,.cpd .etat.en_attente{background:#4A3B1E;color:#F3D9A4}
.cpd .etat.conflit{background:#5A2A1E;color:#F6C3B3}
.cpd .sous{grid-column:1/3;grid-row:2;display:flex;align-items:stretch;background:var(--sous);color:var(--txt);overflow-x:auto;scrollbar-width:thin}
.cpd .sous button{display:flex;align-items:center;gap:8px;padding:0 16px;border:none;border-right:1px solid #4A4A4A;border-bottom:3px solid transparent;border-radius:0;background:none;color:var(--txt);font:600 12.5px "Segoe UI",system-ui;white-space:nowrap;cursor:pointer}
.cpd .sous button:hover{background:#444}
.cpd .sous button.actif{border-bottom-color:var(--acc);background:#444;color:#fff}
.cpd .ruban{grid-column:1/3;grid-row:3;display:flex;align-items:stretch;background:var(--ruban);color:var(--txt);overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}
.cpd .ruban .tuile-outil{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;width:112px;min-width:112px;padding:6px 4px 4px;border:none;border-right:1px solid #5E5E5E;border-bottom:3px solid transparent;border-radius:0;background:none;color:var(--txt);font:500 12px/1.15 "Segoe UI",system-ui;text-align:center;cursor:pointer}
.cpd .ruban .tuile-outil:hover{background:#595959}
.cpd .ruban .tuile-outil.actif{background:#606060;border-bottom-color:var(--acc);color:#fff}
.cpd .ruban .tuile-outil svg{width:38px;height:38px}
.cpd .ruban .tuile-outil kbd{display:none}
.cpd .ruban .options{display:flex;align-items:center;gap:12px;padding:6px 14px;font-size:12px;color:var(--txt)}
.cpd .ruban .options label{display:flex;align-items:center;gap:6px;white-space:nowrap}
.cpd .ruban .options.pile{flex-direction:column;align-items:flex-start;justify-content:center;gap:3px;padding:4px 12px}
.cpd .ruban .options select,.cpd .ruban .options input[type=number]{background:var(--carte);color:#fff;border:1px solid var(--trait);border-radius:4px;padding:3px 6px}
.cpd .compo{position:relative;align-self:stretch;display:flex;align-items:center;margin:0 10px;min-width:250px;max-width:330px}
.cpd .compo .carte,.cpd .liste-compo .carte,.cpd aside .carte{display:flex;flex-direction:column;gap:5px;padding:8px 10px;border-radius:4px;background:var(--carte);border:1px solid #444;cursor:pointer;color:#fff;width:100%;box-sizing:border-box}
.cpd .compo .carte:hover,.cpd .liste-compo .carte:hover,.cpd aside .carte:hover{border-color:var(--acc)}
.cpd .tete{display:flex;justify-content:space-between;gap:10px;font-weight:600;font-size:12.5px}
.cpd .couches{display:flex;flex-wrap:wrap;gap:3px}
.cpd .couches span{font-size:10.5px;padding:1px 5px;border-radius:2px;border:1px solid var(--orange);color:#F6C9B0}
.cpd .couches span.b{border-color:var(--acc);color:#A9E2D9}
.cpd .apercu-couches{display:flex;height:9px;border-radius:2px;overflow:hidden;border:1px solid #111}
.cpd .liste-compo{position:fixed;z-index:25;max-height:60vh;overflow:auto;background:var(--sous);border:1px solid var(--trait);border-radius:4px;box-shadow:0 10px 30px rgba(0,0,0,.45);padding:6px;box-sizing:border-box}
.cpd .liste-compo .carte{margin:3px 0}
.cpd .liste-compo .carte.choisi,.cpd aside .carte.choisi{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc) inset}
.cpd .catalogue{grid-column:1;grid-row:4;width:236px;overflow:auto;background:var(--pan);border-right:1px solid #2A2A2A;padding:10px 8px;box-sizing:border-box;color:var(--txt)}
.cpd .catalogue:empty{display:none}
.cpd .catalogue.ferme{width:44px;padding:8px 4px}
.cpd .catalogue input.chercher{width:100%;box-sizing:border-box;border:none;border-radius:14px;padding:6px 10px 6px 30px;margin:0 0 8px;background:#D6D6D6 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='M20 20l-4-4'/%3E%3C/svg%3E") 9px 50% no-repeat;color:#222}
.cpd .catalogue button.fermer-cat{display:flex;align-items:center;gap:8px;width:100%;margin:0 0 10px;padding:6px 10px;border:none;border-radius:3px;background:var(--acc);color:#fff;font:600 12px "Segoe UI",system-ui;cursor:pointer}
.cpd .catalogue.ferme button.fermer-cat{width:36px;padding:6px;justify-content:center}
.cpd .catalogue .cat{display:flex;align-items:center;gap:10px;width:100%;padding:9px 6px;border:none;border-bottom:1px solid #4A4A4A;border-radius:0;background:none;color:var(--txt);font:600 12px "Segoe UI",system-ui;text-transform:uppercase;letter-spacing:.02em;text-align:left;cursor:pointer}
.cpd .catalogue .cat:hover{background:#444}
.cpd .catalogue .cat.actif{background:#4A4A4A;color:#fff;box-shadow:3px 0 0 var(--acc) inset}
.cpd .catalogue .cat svg{flex:none}
.cpd .catalogue .note,.cpd .volet .note{font-size:11.5px;color:var(--txt2)}
.cpd .volet{position:absolute;left:0;top:0;z-index:7;max-height:calc(100% - 20px);overflow:auto;background:rgba(66,66,66,.96);color:var(--txt);box-shadow:4px 4px 18px rgba(0,0,0,.35);padding:12px 16px 16px;min-width:300px;max-width:min(760px,calc(100% - 40px));box-sizing:border-box}
.cpd .volet h4{margin:4px 0 10px;font:700 13px "Segoe UI",system-ui;text-transform:uppercase;letter-spacing:.04em;display:flex;align-items:center;gap:8px}
.cpd .volet .tuiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px}
.cpd .volet .tuile{display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 4px 7px;border:1px solid transparent;border-radius:3px;background:#4F4F4F;cursor:grab;font-size:11.5px;line-height:1.2;text-align:center;user-select:none;color:#fff}
.cpd .volet .tuile:hover{border-color:var(--acc)}
.cpd .volet .tuile.choisi{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc) inset}
.cpd .volet .tuile svg{width:96px;height:44px;background:#fff;border-radius:2px}
.cpd .volet .tuile .pastille{width:100%;height:34px;border-radius:2px;border:1px solid #333}
.cpd button,.cpd select,.cpd input{font:inherit;color:inherit}
.cpd button{border:1px solid var(--trait);background:#4A4A4A;color:var(--txt);border-radius:3px;padding:5px 10px;cursor:pointer}
.cpd button:hover{border-color:var(--acc)}
.cpd button:disabled{opacity:.4;cursor:default}
.cpd button.prim{background:var(--acc);border-color:var(--acc);color:#fff}
.cpd button.prim:hover{background:var(--acc2)}
.cpd button.dang{color:#FF9B85}
.cpd main{grid-column:2;grid-row:4;position:relative;overflow:hidden;touch-action:none;background:#fff}
.cpd main canvas.plan2d{position:absolute;inset:0;width:100%;height:100%;cursor:crosshair}
.cpd .flottant{position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:5;display:flex;gap:8px;align-items:center}
.cpd .flottant .groupe,.cpd .bas .groupe{display:flex;align-items:center;gap:1px;background:#3A3A3A;border-radius:4px;padding:2px;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.cpd .flottant button,.cpd .flottant select,.cpd .bas button{background:none;border:none;color:#fff;border-radius:3px;padding:5px 9px;font-size:13px}
.cpd .flottant select{background:#3A3A3A;min-width:150px;font-weight:600}
.cpd .flottant button:hover,.cpd .bas button:hover{background:#505050}
.cpd .flottant button.actif,.cpd .bas button.actif{background:var(--acc)}
.cpd .affichages{position:absolute;top:calc(100% + 6px);right:0;background:#3A3A3A;color:var(--txt);border-radius:4px;box-shadow:0 10px 30px rgba(0,0,0,.3);padding:8px 12px;min-width:250px;z-index:20}
.cpd .affichages label{display:flex;align-items:center;gap:8px;margin:6px 0;white-space:nowrap}
.cpd .bas{position:absolute;left:10px;right:10px;bottom:8px;z-index:5;display:flex;align-items:flex-end;gap:8px;pointer-events:none}
.cpd .bas > *{pointer-events:auto}
.cpd .bas .esp{flex:1;pointer-events:none}
.cpd .bas .aide{pointer-events:none;align-self:center;font-size:11.5px;color:#666;background:rgba(255,255,255,.85);padding:2px 8px;border-radius:10px;max-width:46%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cpd .bas .acc{color:var(--orange);font-weight:600;pointer-events:none}
.cpd .bas .coord{font-size:11px;color:#777;background:rgba(255,255,255,.85);padding:2px 6px;border-radius:8px;pointer-events:none}
.cpd .tableau-surfaces{position:absolute;left:10px;bottom:46px;z-index:6;background:#3A3A3A;color:var(--txt);border-radius:4px;box-shadow:0 10px 30px rgba(0,0,0,.3);padding:10px 14px;min-width:300px;max-height:60%;overflow:auto;font-size:12.5px}
.cpd .tableau-surfaces table{width:100%;border-collapse:collapse}
.cpd .tableau-surfaces td{padding:3px 4px;border-bottom:1px solid #4A4A4A}
.cpd .tableau-surfaces td:last-child{text-align:right;white-space:nowrap}
.cpd .boussole{position:absolute;left:18px;top:50%;z-index:4;width:64px;height:84px;margin-top:-42px;pointer-events:none}
.cpd .droite{grid-column:3;grid-row:2/5;display:flex;flex-direction:column;min-height:0;background:var(--pan)}
.cpd .apercu{position:relative;height:250px;flex:none;background:#53704B;overflow:hidden}
.cpd .apercu .attrape{position:absolute;inset:0;z-index:3;cursor:zoom-in}
.cpd .apercu .legende-apercu{position:absolute;left:8px;bottom:6px;z-index:4;font-size:11px;color:#fff;background:rgba(0,0,0,.45);padding:1px 8px;border-radius:8px;pointer-events:none}
.cpd .apercu .vide-apercu{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#E8EFE6;font-size:12px;padding:12px;text-align:center}
.cpd .apercu canvas{position:absolute;inset:0;width:100%;height:100%}
.cpd aside{flex:1;overflow:auto;padding:0 18px 18px;min-height:0;background:var(--pan);color:var(--txt)}
.cpd aside .entete-panneau{display:flex;align-items:center;gap:8px;margin:0 -18px 14px;padding:9px 18px;background:var(--sous);border-bottom:3px solid var(--acc);font-weight:600;font-size:13px}
.cpd aside .titre-panneau{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px;font-size:20px;font-weight:600;color:#fff}
.cpd aside .titre-panneau .vignette{width:80px;height:80px;border:1px solid #666;display:flex;align-items:center;justify-content:center;color:#ddd;flex:none}
.cpd aside h3{font-size:16px;font-weight:600;color:#fff;margin:18px 0 8px;padding-top:12px;border-top:1px solid #4E4E4E}
.cpd aside h3:first-child{margin-top:4px;border-top:none;padding-top:0}
.cpd aside .sous-titre{font-size:11.5px;color:var(--txt2);margin:2px 0 6px}
.cpd aside label{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:7px 0;color:var(--txt2);font-size:12.5px}
.cpd aside label input:not([type=checkbox]):not([type=range]),.cpd aside label select{width:150px;border:none;border-bottom:1px solid #8A8A8A;border-radius:0;padding:3px 2px;background:transparent;color:#fff}
.cpd aside label select option{background:#3B3B3B}
.cpd aside label input:focus,.cpd aside label select:focus{outline:none;border-bottom-color:var(--acc)}
.cpd aside .ligne,.cpd .catalogue .ligne{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.cpd aside .note{font-size:12px;color:var(--txt2)}
.cpd aside .alerte{font-size:12px;padding:6px 8px;border-left:3px solid var(--orange);background:#4A3E37;margin:4px 0;color:#F5DCCD}
.cpd aside .ok{font-size:12px;padding:6px 8px;border-left:3px solid var(--acc);background:#33473F;color:#CDEBE4}
.cpd aside table{width:100%;border-collapse:collapse;font-size:12px}
.cpd aside td{padding:4px 0;border-bottom:1px solid #4A4A4A}
.cpd aside td:last-child{text-align:right;white-space:nowrap}
.cpd aside .niv{display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:3px;cursor:pointer}
.cpd aside .niv:hover{background:#444}
.cpd aside .niv.actif{background:#4A4A4A;font-weight:600;box-shadow:3px 0 0 var(--acc) inset}
.cpd aside .chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:2px 7px;border-radius:10px;background:#33473F;color:#A9E2D9}
.cpd aside .chip button{border:none;padding:0 2px;background:none;color:inherit}
.cpd aside .couches-mur{display:flex;flex-direction:column;gap:3px;margin:6px 0}
.cpd aside .couches-mur div{display:flex;align-items:center;gap:8px;font-size:12px}
.cpd aside .couches-mur i{display:inline-block;width:16px;height:12px;border:1px solid #111}
.cpd aside .apercu-coupe svg{background:#fff;border-radius:3px}
.cpd aside .schema-hauteur{display:flex;gap:14px;align-items:flex-start}
.cpd footer{display:none}
.cpd .toast{pointer-events:none;position:absolute;left:50%;bottom:52px;transform:translateX(-50%);background:#2B2B2B;color:#fff;padding:9px 16px;border-radius:4px;max-width:70%;box-shadow:0 4px 16px rgba(0,0,0,.3);z-index:8;border-left:4px solid var(--acc)}
.cpd .toast.err{border-left-color:#E5533D;background:#4A2A24}
.cpd .voile{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;padding-top:min(12vh,80px);z-index:30}
.cpd .boite{background:#3B3B3B;color:var(--txt);border-radius:4px;box-shadow:0 10px 40px rgba(0,0,0,.4);width:min(440px,92vw);padding:16px 18px;box-sizing:border-box;max-height:calc(100vh - min(12vh,80px) - 16px);overflow-y:auto;border-top:3px solid var(--acc)}
.cpd .boite h2{font-size:16px;margin:0 0 12px;color:#fff}
.cpd .boite label{display:block;margin:10px 0;color:var(--txt2);font-size:12.5px}
.cpd .boite label textarea{display:block;width:100%;box-sizing:border-box;margin-top:3px;border:1px solid #8A8A8A;border-radius:2px;padding:5px 6px;background:transparent;color:#fff;font:inherit;resize:vertical}
.cpd .boite label input,.cpd .boite label select{display:block;width:100%;box-sizing:border-box;margin-top:3px;border:none;border-bottom:1px solid #8A8A8A;border-radius:0;padding:6px 2px;background:transparent;color:#fff}
.cpd .boite label select option{background:#3B3B3B}
.cpd .boite .pied{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;position:sticky;bottom:-16px;background:#3B3B3B;padding:8px 0 16px;margin-bottom:-16px}
.cpd .boite table td,.cpd .boite table th{padding:3px 4px;border-bottom:1px solid #4A4A4A}
.cpd .palette input{width:100%;box-sizing:border-box;border:none;border-bottom:1px solid #8A8A8A;padding:8px 4px;font-size:15px;background:transparent;color:#fff}
.cpd .palette ul{list-style:none;margin:8px 0 0;padding:0;max-height:50vh;overflow:auto}
.cpd .palette li{padding:7px 10px;border-radius:3px;cursor:pointer;display:flex;justify-content:space-between}
.cpd .palette li.sel{background:#4A4A4A;box-shadow:3px 0 0 var(--acc) inset}
.cpd .palette li kbd{font-size:11px;color:var(--txt2)}
.cpd main .hote3d{position:absolute;inset:0;display:none}
.cpd main .hote3d canvas{cursor:grab}
.cpd.en3d main .hote3d{display:block}
.cpd .apercu .hote3d{position:absolute;inset:0;display:block}
.cpd .saisie{position:absolute;z-index:5;width:150px;border:2px solid var(--acc);border-radius:4px;padding:4px 8px;font:600 14px system-ui;background:#fff;color:#222;box-shadow:0 4px 14px rgba(0,0,0,.15)}
@media (max-width:1600px){.cpd header nav.onglets button{min-width:78px}.cpd header input.nom{width:150px}.cpd .etat{max-width:90px}.cpd .compo{min-width:240px}}
@media (max-width:1400px){.cpd{grid-template-columns:auto 1fr 330px}.cpd header nav.onglets button{min-width:68px;font-size:12px}.cpd header input.nom{width:120px}}
@media (max-width:1180px){.cpd header nav.onglets button{min-width:60px;font-size:11px;padding:4px 4px 2px}.cpd header input.nom{display:none}.cpd .etat{display:none}}
@media (max-width:900px){.cpd{grid-template-columns:1fr;grid-template-rows:52px 36px 92px 1fr 40vh}.cpd .catalogue{display:none}.cpd main{grid-column:1}.cpd .droite{grid-column:1;grid-row:5}.cpd .sous,.cpd .ruban{grid-column:1}}
`;

interface Action { libelle: string; touche?: string; faire: () => void; visible?: () => boolean }

export async function demarrer(racine: HTMLElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  racine.innerHTML = `<style>${CSS}</style><div class="cpd"><header>
      <span class="marque"><b>CP</b>DESIGNER</span>
      <input class="nom" title="Nom du projet" spellcheck="false">
      <nav class="onglets"></nav>
      <span class="esp"></span>
      <span class="droite-entete">
        <span class="etat" title="Enregistrement"></span>
        <button class="baide" title="Aide : raccourcis et manière de faire">${icone('aide', 22)}</button>
        <button class="bpdf texte" title="Exporter les plans en PDF (A3, cotés, cartouche)">PDF</button>
        <button class="bdxf texte" title="Exporter les plans en DXF (bureaux d’études, autres logiciels)">DXF</button>
        <button class="cmdk" title="Toutes les actions (Ctrl+K)">${icone('chercher', 22)}</button>
        <button class="bplein" title="Plein écran">${icone('plein_ecran', 22)}</button>
        <a href="../index.html" title="Retour au suivi de chantiers">${icone('sortir', 22)}</a>
      </span>
    </header>
    <div class="sous"></div>
    <div class="ruban"></div>
    <div class="catalogue"></div>
    <main><canvas class="plan2d"></canvas><div class="hote3d"></div>
      <div class="flottant">
        <span class="groupe"><select class="niveaux" title="Niveau affiché"></select></span>
        <span class="groupe"><button class="annuler" title="Annuler (Ctrl+Z)">↶</button><button class="retablir" title="Rétablir (Ctrl+Maj+Z)">↷</button></span>
        <span class="groupe"><button class="b3d" title="Permuter le plan et la vue 3D (touche 3)">⇄ 3D</button></span>
        <span class="groupe" style="position:relative"><button class="baff" title="Ce que montre le plan">${icone('oeil', 18)} Affichages ▾</button></span>
      </div>
      <svg class="boussole" viewBox="0 0 64 84" aria-hidden="true"></svg>
      <div class="bas">
        <span class="groupe" style="position:relative"><button class="bsurf" title="Les surfaces des pièces du niveau">${icone('tableau', 18)} Tableaux de surfaces ▴</button></span>
        <span class="aide"></span><span class="esp"></span><span class="acc"></span><span class="coord"></span>
        <span class="groupe"><button class="bzoomp" title="Zoom avant">${icone('zoom_plus', 18)}</button><button class="bzoomm" title="Zoom arrière">${icone('zoom_moins', 18)}</button></span>
        <span class="groupe"><button class="bcadrer" title="Tout voir (F)">${icone('cadrer', 18)} Tout voir</button></span>
      </div>
    </main>
    <div class="droite"><div class="apercu"><div class="vide-apercu">Aperçu 3D…</div><div class="attrape" title="Agrandir (touche 3)"></div><span class="legende-apercu">3D</span></div><aside></aside></div>
    </div>`;
  const $ = <T extends Element>(s: string) => racine.querySelector(s) as T;
  const canvas = $<HTMLCanvasElement>('canvas.plan2d'), main = $<HTMLElement>('main'), aside = $<HTMLElement>('aside');
  const ongletsNav = $<HTMLElement>('nav.onglets'), sousNav = $<HTMLElement>('.sous'), ruban = $<HTMLElement>('.ruban'), catalogue = $<HTMLElement>('.catalogue');
  const apercuBoite = $<HTMLElement>('.apercu'), hote3d = $<HTMLElement>('.hote3d');
  const ctx = canvas.getContext('2d')!;
  const etat = $<HTMLElement>('.etat');

  const signaler = (e: string, msg: string) => { etat.className = 'etat ' + e; etat.textContent = msg; etat.title = msg };
  etat.textContent = 'Ouverture…';
  const { connexion, utilisateur } = await import('../persistence/connexion');
  const { DepotSupabase } = await import('../persistence/depot-supabase');
  const { FondsSupabase } = await import('../persistence/fonds-supabase');
  const ouv = await ouvrirSession(params, { utilisateur, depot: () => new DepotSupabase(connexion()), fonds: () => new FondsSupabase(connexion()), signaler });
  const enr: Enregistreur = ouv.enregistreur;
  signaler(enr.mode === 'local' ? 'local' : 'a_jour', enr.raison);

  let h: Historique = nouvelHistorique(ouv.projet);
  const acteur: Acteur = { par: enr.par, maintenant: () => new Date().toISOString(), id: () => ulid() };
  const acteurApercu: Acteur = { par: enr.par, maintenant: () => new Date().toISOString(), id: (() => { let n = 0; return () => 'apercu-' + (++n) })() };
  let niveauId = [...ouv.projet.buildings[0]!.floors].sort((a, b) => a.elevation - b.elevation)[0]!.id;
  let selection: string | null = null;
  /** plusieurs objets choisis ensemble (Maj + clic, cadre) ; vide : la sélection simple vaut */
  let groupe: string[] = [];
  let cadre: [Point, Point] | null = null;
  /** le presse-papiers (gardé aussi sur l'appareil : on colle d'un projet à l'autre) */
  let pressePapiers: PressePapiers | null = (() => { try { return JSON.parse(localStorage.getItem('cpDesigner:pressePapiers') ?? 'null') } catch { return null } })();
  /** un collage en cours : le groupe suit le curseur ; T tourne, X et Y retournent, un clic pose */
  let collage: { pp: PressePapiers; quarts: number; miroirX: boolean; miroirY: boolean } | null = null;
  let apercu: Commande[] = [];
  let accroche: Accroche | null = null;
  let refusApercu = '';
  let curseur: Point | null = null;
  /** une action qui attend qu'on clique un mur (parallèle à…, perpendiculaire à…) */
  let choixMur: { libelle: string; faire: (id: string) => void } | null = null;
  const images = new Map<string, ImageFond>();
  const enChargement = new Set<string>();
  let cam: Camera = { centre: { x: 5_000, y: 4_000 }, echelle: 0.06, largeur: 800, hauteur: 600 };
  /* la cotation automatique : un choix d'affichage, propre à cet appareil */
  let cotation = (() => { try { return localStorage.getItem('cpDesigner:cotation') !== 'non' } catch { return true } })();
  /** les sols en couleur à l'écran (plan de présentation), une préférence de cet appareil */
  /** l'intervalle des courbes de niveau (m) ; 0 : masquées (préférence de cet appareil) */
  let courbes = (() => { try { const v = Number(localStorage.getItem('cpDesigner:courbes') ?? '0.5'); return Number.isFinite(v) && v >= 0 ? v : 0.5 } catch { return 0.5 } })();
  /** le trait du profil en long (outil S) : une mesure du moment, pas enregistrée */
  let profilTrait: [Point, Point] | null = null;
  let solsCouleur = (() => { try { return localStorage.getItem('cpDesigner:sols') === 'oui' } catch { return false } })();
  /** l'équerre du tracé des murs (aimantés à 90°), une préférence de cet appareil */
  const equerreTrace = (() => { try { return localStorage.getItem('cpDesigner:equerre') !== 'non' } catch { return true } })();
  /* la vue 3D : chargée à la première ouverture */
  let vue3d: Vue3D | null = null, en3D = false, coupe3D = false, niveaux3D: 'tous' | 'jusqua' = 'tous', toit3D = true;

  const outils = new Outils(() => ({ projet: h.projet, niveau: niveauId, selection }));
  outils.reglages.equerre = equerreTrace;
  const niveau = (p: Project = h.projet): Floor => trouverNiveau(p, niveauId)?.floor ?? p.buildings[0]!.floors[0]!;
  const niveaux = () => [...h.projet.buildings[0]!.floors].sort((a, b) => a.elevation - b.elevation);

  /* ---------- exécuter, annuler, enregistrer ---------- */
  function faire(titre: string, cmds: Commande[]): boolean {
    const r = executer(h, titre, cmds, acteur);
    if (!r.ok) { if (r.erreurs[0] !== 'rien à faire') toast(r.erreurs.join(' ; '), true); return false }
    h = r.historique;
    void enr.ajouter(r.changeSet, h.projet);
    apres();
    return true;
  }
  function annuler() { const r = annulerEnregistre(h, acteur); if (r.ok) { h = r.historique; void enr.ajouter(r.changeSet, h.projet); toast(r.changeSet.titre); apres() } }
  function retablir() { const r = retablirEnregistre(h, acteur); if (r.ok) { h = r.historique; void enr.ajouter(r.changeSet, h.projet); toast(r.changeSet.titre); apres() } }
  function apres() {
    if (!trouverNiveau(h.projet, niveauId)) niveauId = niveaux()[0]!.id;
    if (selection && !niveau().objects[selection]) selection = null;
    groupe = groupe.filter(id => niveau().objects[id]);
    if (groupe.length < 2) groupe = [];
    if (en3D && vue3d) { vue3d.mettreAJour(maquetteAffichee()); appliquerCoupe() } else apercu3DBientot();
    barreOutils(); panneaux(); dessinerBientot(); majTableauSurfaces(); boussole();
  }

  /* ---------- vue 3D ---------- */
  const maquetteAffichee = () => maquette(h.projet, niveaux3D === 'jusqua' ? niveauId : undefined, { toiture: toit3D });
  /* « vue maquette » : murs coupés à 1,20 m au-dessus du sol du niveau affiché, comme une maison de poupée */
  function appliquerCoupe() { vue3d?.couper(coupe3D ? niveau().elevation + 1_200 : null) }
  /* le plan et la 3D se partagent l'écran : l'un au centre, l'autre en aperçu (à droite) ; ⇄ ou la touche 3 les permutent */
  let camPlan: Camera | null = null;
  /** la taille du plan à l'écran, relue aussitôt qu'un onglet ouvre ou ferme le catalogue (un clic qui suit tombe juste) */
  function ajusterCamera() {
    const hote = canvas.parentElement ?? main;
    if (hote.clientWidth && hote.clientHeight) cam = { ...cam, largeur: hote.clientWidth, hauteur: hote.clientHeight };
  }
  function placerVues() {
    const attrape = apercuBoite.querySelector('.attrape')!;
    if (en3D) { main.prepend(hote3d); apercuBoite.insertBefore(canvas, attrape) }
    else { main.prepend(canvas); apercuBoite.insertBefore(hote3d, attrape) }
    apercuBoite.querySelector('.legende-apercu')!.textContent = en3D ? 'Plan 2D' : '3D';
    apercuBoite.querySelector<HTMLElement>('.vide-apercu')!.style.display = en3D || vue3d ? 'none' : '';
    ajusterCamera();
  }
  /** la 3D (three.js) : chargée une fois, dans son hôte, où qu'il soit */
  let vue3dEnCours: Promise<Vue3D | null> | null = null;
  function preparer3D(): Promise<Vue3D | null> {
    if (vue3d) return Promise.resolve(vue3d);
    vue3dEnCours ??= (async () => {
      try {
        const { creerVue3D } = await import('./vue3d');
        vue3d = await creerVue3D(hote3d); vue3d.rendu(renduPrefere()); if (photoSite) vue3d.photo(photoSite);
        vue3d.mettreAJour(maquetteAffichee()); appliquerCoupe(); placerVues();
        return vue3d;
      } catch (e) {
        apercuBoite.querySelector<HTMLElement>('.vide-apercu')!.textContent = 'Aperçu 3D indisponible sur ce navigateur';
        throw e;
      }
    })();
    return vue3dEnCours;
  }
  async function basculer3D(oui = !en3D) {
    if (oui === en3D) return;
    if (!oui) vue3d?.visite(false);
    en3D = oui;
    racine.querySelector('.cpd')!.classList.toggle('en3d', oui);
    $<HTMLButtonElement>('.b3d').classList.toggle('actif', oui);
    /* la caméra du plan se garde : l'aperçu montre tout le niveau, le retour retrouve la vue */
    if (oui) camPlan = cam; else if (camPlan) { cam = { ...camPlan }; camPlan = null }
    placerVues();
    if (oui) {
      choixMur = null; effet(outils.choisir('selection')); selection = null; barreOutils(); panneaux();
      try {
        await preparer3D();
        vue3d!.mettreAJour(maquetteAffichee()); appliquerCoupe(); vue3d!.cadrer();
      } catch (e) {
        toast('La vue 3D n’a pas pu s’ouvrir sur ce navigateur (' + String((e as Error)?.message ?? e) + ')', true);
        en3D = false; racine.querySelector('.cpd')!.classList.remove('en3d'); $<HTMLButtonElement>('.b3d').classList.remove('actif'); placerVues();
      }
    } else vue3d?.cadrer();
    requestAnimationFrame(() => { if (en3D) cadrerTout(); dessinerBientot() });
    panneaux(); dessinerBientot();
  }
  /* l'aperçu suit le plan, sans le ralentir : mis à jour un instant après la dernière modification */
  let minuterie3D = 0;
  function apercu3DBientot() {
    if (!vue3d || en3D) return;
    clearTimeout(minuterie3D);
    minuterie3D = window.setTimeout(() => { if (vue3d && !en3D) { vue3d.mettreAJour(maquetteAffichee()); appliquerCoupe() } }, 400);
  }
  /* la vue 3D gardée pour le dossier de permis (le temps de la séance : une image, pas une donnée du projet) */
  let perspective: ImageDossier | null = null;
  /* les autres pièces images du dossier (PCMI 1, 6, 7, 8), gardées de même le temps de la séance : photos du
     terrain et extraits de carte ne sont ni enregistrés dans le projet, ni partagés */
  const piecesDossier: { situation?: ImageDossier; insertion?: ImageDossier; photoProche?: ImageDossier; photoLointaine?: ImageDossier } = {};
  /** la photographie du terrain posée derrière la maquette 3D, pour composer l'insertion (PCMI 6) */
  let photoSite: ImageBitmap | null = null;
  /** une image choisie par l'utilisateur (JPEG, PNG…), décodée par le navigateur ; rien si le choix est abandonné */
  function choisirImage(): Promise<{ image: ImageBitmap; nom: string } | null> {
    return new Promise(res => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
      i.onchange = async () => {
        const f = i.files?.[0];
        if (!f) { res(null); return }
        try { res({ image: await createImageBitmap(f), nom: f.name }) } catch { toast('Image illisible : ' + f.name, true); res(null) }
      };
      i.click();
    });
  }
  /** l'image en JPEG pour le PDF, ramenée à 2 400 px de côté au plus (un A3 à 200 dpi environ) */
  async function enJpeg(image: ImageBitmap, legende?: string): Promise<ImageDossier> {
    const k = Math.min(1, 2_400 / Math.max(image.width, image.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(image.width * k)); c.height = Math.max(1, Math.round(image.height * k));
    c.getContext('2d')!.drawImage(image, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.9));
    if (!b) throw new Error('image vide');
    return { jpeg: new Uint8Array(await b.arrayBuffer()), largeur: c.width, hauteur: c.height, ...(legende?.trim() ? { legende: legende.trim() } : {}) };
  }
  /** une pièce image du dossier (PCMI 1, 7, 8) : l'image, puis ce qu'on en dit (source et échelle, point de vue) */
  async function importerPiece(cle: 'situation' | 'photoProche' | 'photoLointaine', titreDialogue: string, invite: string) {
    const c = await choisirImage();
    if (!c) return;
    const r = await dialogue(titreDialogue, [{ cle: 'leg', libelle: invite, valeur: piecesDossier[cle]?.legende ?? '' }]);
    if (!r) return;
    try { piecesDossier[cle] = await enJpeg(c.image, r['leg']); toast(c.nom + ' : gardée pour le dossier de permis'); panneaux() }
    catch (e) { toast('Image impossible à garder : ' + String((e as Error)?.message ?? e), true) }
  }
  /* le cabinet qui signe les planches (colonne CP, page de garde) : réglé sur cet appareil, comme les
     réglages de l'atelier — ni dans le projet, ni dans le dépôt */
  function reglagesCabinet(): Partial<Cabinet> {
    try { const c = JSON.parse(localStorage.getItem('cpDesigner:cabinet') ?? 'null'); if (c && typeof c === 'object') return c } catch { /* rien de réglé */ }
    return {};
  }
  async function reglerCabinet() {
    const C = reglagesCabinet();
    const r = await dialogue('Cabinet (réglé sur cet appareil)', [
      { cle: 'societe', libelle: 'Société', valeur: C.societe ?? 'CP Constructions' },
      { cle: 'adresse', libelle: 'Adresse (une ligne par ligne)', valeur: C.adresse ?? '', lignes: 2 },
      { cle: 'telephone', libelle: 'Téléphone', valeur: C.telephone ?? '' },
      { cle: 'email', libelle: 'E-mail', valeur: C.email ?? '' },
      { cle: 'siren', libelle: 'SIREN', valeur: C.siren ?? '' },
      { cle: 'tva', libelle: 'N° de TVA', valeur: C.tva ?? '' },
      { cle: 'dessinateur', libelle: 'Dessiné par', valeur: C.dessinateur ?? '' }]);
    if (!r) return;
    const c: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) if (v.trim()) c[k] = v.trim();
    try { localStorage.setItem('cpDesigner:cabinet', JSON.stringify(c)); toast('Cabinet réglé sur cet appareil') } catch { toast('Réglages impossibles à garder sur cet appareil (navigation privée ?)', true) }
    panneaux();
  }
  /** le logo CP du site (assets/logo.png, à côté du CRM), en JPEG sur fond blanc ; rien s'il ne se charge pas */
  let logoCabinet: Promise<ImageDossier | null> | null = null;
  function chargerLogo(): Promise<ImageDossier | null> {
    logoCabinet ??= (async () => {
      try {
        const rep = await fetch(new URL('../assets/logo.png', document.baseURI).href);
        if (!rep.ok) return null;
        const im = await createImageBitmap(await rep.blob());
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const g = c.getContext('2d')!; g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0);
        const b = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.92));
        return b ? { jpeg: new Uint8Array(await b.arrayBuffer()), largeur: c.width, hauteur: c.height } : null;
      } catch { return null }
    })();
    return logoCabinet;
  }
  /** ce que les exports reçoivent du cabinet : ses réglages (sur le modèle par défaut) et le logo */
  async function signature(): Promise<{ cabinet: Cabinet; logo?: ImageDossier }> {
    const { CABINET_PAR_DEFAUT } = await import('../export/planche');
    const logo = await chargerLogo();
    return { cabinet: { ...CABINET_PAR_DEFAUT, ...reglagesCabinet() }, ...(logo ? { logo } : {}) };
  }
  /** une modification par ligne : « 28/09/2026 — objet » (la date d'abord), ou l'objet seul */
  const lireModifications = (t: string) => t.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[—–:\-]?\s*(.*)$/.exec(l);
    return m ? { date: m[1]!, objet: m[2]!.trim() } : { date: '', objet: l };
  });
  /** les informations du dossier (page de garde, colonne des planches) : enregistrées dans le projet */
  async function informationsDossier() {
    const D: InfosDossier = h.projet.dossier ?? {};
    const r = await dialogue('Informations du dossier', [
      { cle: 'maitreOuvrage', libelle: 'Maître d’ouvrage (ex. : M. et Mme Dupont)', valeur: D.maitreOuvrage ?? '' },
      { cle: 'adresseMaitreOuvrage', libelle: 'Adresse du maître d’ouvrage', valeur: D.adresseMaitreOuvrage ?? '', lignes: 2 },
      { cle: 'lieuConstruction', libelle: 'Lieu de construction (adresse du terrain)', valeur: D.lieuConstruction ?? '', lignes: 2 },
      { cle: 'referencesCadastrales', libelle: 'Références cadastrales (vide : celle de la parcelle)', valeur: D.referencesCadastrales ?? '' },
      { cle: 'surfaceTerrain', libelle: 'Surface du terrain, m² (vide : celle de la parcelle)', valeur: D.surfaceTerrain ? String(D.surfaceTerrain).replace('.', ',') : '' },
      { cle: 'zoneSismique', libelle: 'Zone sismique (ex. : 2 (faible))', valeur: D.zoneSismique ?? '' },
      { cle: 'couverture', libelle: 'Couverture (vide : celle du toit dessiné)', valeur: D.couverture ?? '' },
      { cle: 'chauffage', libelle: 'Chauffage', valeur: D.chauffage ?? '' },
      { cle: 'divers', libelle: 'Divers (ventilation, eau chaude…)', valeur: D.divers ?? '' },
      /* les menuiseries : matériau et teinte ; les portes prennent ceux des menuiseries tant qu'on ne choisit rien */
      ...(['menuiseries', 'porteEntree', 'porteGarage'] as const).flatMap(q => {
        const nom = q === 'menuiseries' ? 'Menuiseries (fenêtres, baies)' : q === 'porteEntree' ? 'Porte d’entrée' : 'Porte de garage', vide = q === 'menuiseries' ? '— à préciser' : '— comme les menuiseries';
        return [
          { cle: q + ':m', libelle: nom + ' : matériau', valeur: D[q]?.materiau ?? '', options: { '': vide, ...Object.fromEntries(MATERIAUX_MENUISERIES.map(x => [x, x])) } },
          { cle: q + ':t', libelle: nom + ' : teinte', valeur: D[q]?.teinte ?? '', options: { '': vide, ...Object.fromEntries(TEINTES_MENUISERIES.map(x => [x.id, x.libelle])) } }];
      }),
      { cle: 'modifications', libelle: 'Modifications : une par ligne, « jj/mm/aaaa — objet »', valeur: (D.modifications ?? []).map(m => (m.date ? m.date + ' — ' : '') + m.objet).join('\n'), lignes: 3 }]);
    if (!r) return;
    const st = r['surfaceTerrain']!.trim(), n = Number(st.replace(/\s/g, '').replace(',', '.'));
    if (st && !(Number.isFinite(n) && n > 0)) { toast('Surface du terrain illisible : un nombre de m², par exemple 812', true); return }
    const champs: Extract<Commande, { type: 'modifierDossier' }>['champs'] = {
      maitreOuvrage: r['maitreOuvrage']!, adresseMaitreOuvrage: r['adresseMaitreOuvrage']!, lieuConstruction: r['lieuConstruction']!,
      referencesCadastrales: r['referencesCadastrales']!, zoneSismique: r['zoneSismique']!, couverture: r['couverture']!, chauffage: r['chauffage']!, divers: r['divers']!,
      surfaceTerrain: st ? n : null, modifications: lireModifications(r['modifications']!),
      ...Object.fromEntries((['menuiseries', 'porteEntree', 'porteGarage'] as const).map(q => {
        const m = r[q + ':m'] ?? '', t = r[q + ':t'] ?? '';
        return [q, m || t ? { ...(m ? { materiau: m } : {}), ...(t ? { teinte: t } : {}) } : null];
      })) };
    if (faire('Informations du dossier', [{ type: 'modifierDossier', champs }])) toast('Informations du dossier enregistrées');
  }
  async function poserPhotoSite() {
    const c = await choisirImage();
    if (!c || !vue3d) return;
    photoSite = c.image; vue3d.photo(photoSite); panneaux();
    toast('Photo posée derrière la maquette : tournez la vue jusqu’à ce que la maison s’y pose');
  }
  async function garderInsertion() {
    if (!vue3d) return;
    const r = await dialogue('Garder pour le PCMI 6', [{ cle: 'pv', libelle: 'Point de prise de vue (à reporter au plan de masse), ex. : depuis la rue, face à l’entrée', valeur: piecesDossier.insertion?.legende ?? '' }]);
    if (!r) return;
    try {
      const i = await vue3d.imageJpeg();
      piecesDossier.insertion = { jpeg: i.octets, largeur: i.largeur, hauteur: i.hauteur, ...(r['pv']?.trim() ? { legende: r['pv'].trim() } : {}) };
      toast('Insertion gardée : elle ira au PCMI 6 du dossier de permis'); panneaux();
    } catch (e) { toast('Insertion impossible à garder : ' + String((e as Error)?.message ?? e), true) }
  }
  async function garderPerspective() {
    if (!vue3d) return;
    try { const i = await vue3d.imageJpeg(); perspective = { jpeg: i.octets, largeur: i.largeur, hauteur: i.hauteur }; toast('Vue gardée : elle ira dans le dossier de permis (PDF → Composer)'); panneaux() }
    catch (e) { toast('Vue impossible à garder : ' + String((e as Error)?.message ?? e), true) }
  }
  async function imagePNG() {
    if (!vue3d) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(await vue3d.image()); a.download = (h.projet.name || 'projet') + ' - 3D.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- dessin ---------- */
  let demande = 0;
  function dessinerBientot() { if (!demande) demande = requestAnimationFrame(() => { demande = 0; peindre() }) }
  function projetAffiche(): Project {
    refusApercu = '';
    if (!apercu.length) return h.projet;
    const r = executer(h, 'aperçu', apercu, acteurApercu);
    if (r.ok) return r.historique.projet;
    refusApercu = r.erreurs.join(' ; ');
    return h.projet;
  }
  function peindre() {
    const hote = canvas.parentElement ?? main, dpr = window.devicePixelRatio || 1, l = hote.clientWidth, ht = hote.clientHeight;
    if (canvas.width !== Math.round(l * dpr) || canvas.height !== Math.round(ht * dpr)) { canvas.width = Math.round(l * dpr); canvas.height = Math.round(ht * dpr) }
    cam = { ...cam, largeur: l, hauteur: ht };
    const p = projetAffiche(), f = niveau(p);
    const L = niveaux(), i = L.findIndex(x => x.id === niveauId);
    for (const o of Object.values(f.objects)) if (o.type === 'underlay') chargerFond(o.fileKey, o.page);
    outils.aimantsFond = aimantFond ? aimantsDuNiveau(f) : [];
    let etiquette: Scene['etiquette'] = null;
    const nouveaux = apercu.filter((c): c is Extract<Commande, { type: 'creerMur' }> => c.type === 'creerMur');
    if (curseur && nouveaux.length === 4 && outils.outil === 'rectangle') {
      const X = nouveaux.map(c => c.a.x), Y = nouveaux.map(c => c.a.y);
      etiquette = { point: curseur, texte: texteCote(Math.max(...X) - Math.min(...X)) + ' × ' + texteCote(Math.max(...Y) - Math.min(...Y)) + ' m ' + (outils.reglages.rectangle === 'hors_tout' ? 'hors tout' : 'intérieur') + ' — ou tapez 10x8' };
    } else if (curseur && nouveaux[0]) {
      const c = nouveaux[0], deg = Math.round(Math.atan2(c.b.y - c.a.y, c.b.x - c.a.x) * 180 / Math.PI * 10) / 10;
      etiquette = { point: curseur, texte: m(distance(c.a, c.b)) + ' · ' + String((deg + 360) % 360).replace('.', ',') + '° — ou tapez la longueur' };
    }
    if (refusApercu && curseur) etiquette = { point: curseur, texte: '⛔ ' + refusApercu };
    /* la place de l'ouverture choisie, ou de celle qu'on pose */
    const places = [selection, Object.keys(f.objects).find(k => k.startsWith('apercu-') && f.objects[k]!.type === 'opening')]
      .flatMap(id => (id ? [placeOuverture(f, id)] : [])).filter(x => x !== null);
    const toit = toitureDuNiveau(f);
    if (collage && curseur) etiquette = { point: curseur, texte: 'Coller : clic pour poser · T tourner · X / Y retourner · Échap' };
    dessiner(ctx, cam, { niveau: f, dessous: i > 0 ? L[i - 1]! : null, selection, accroche, images, sommets: outils.outil === 'selection', etiquette,
      groupe: new Set(groupe), cadre, presentation: solsCouleur,
      escaliers: Object.values(f.objects).flatMap(o => (o.type === 'stair' ? [{ id: o.id, geo: geometrieEscalier(o, hauteurAFranchir(p, f)) }] : [])),
      tremies: tremiesDuNiveau(p, f),
      /* les traits de coupe de tout le projet ; on ne choisit que ceux tracés sur ce niveau */
      parcelle: (() => { const t = parcelleDuProjet(p); return t && t.niveau.id === f.id ? { plot: t.plot, reculs: reculs(t.plot, empriseAuSol(p)) } : null })(),
      parcelleEnCours: outils.parcelleEnCours, courbes: courbes || null, profil: onglet === 'exterieur' ? profilTrait : null,
      coupes: traitsDeCoupe(p).map(({ id, niveau: n, ...l }) => (n === f.id ? { ...l, id } : l)),
      ...(toit?.ok ? { toitures: toit.toitures } : {}),
      /* le plan de fondations se montre dans son sous-onglet */
      fondations: onglet === 'trace' && sousOnglets['trace'] === 'fondations' ? planFondations(f) : null,
      eaux: eauxPluviales(f), gouttieres: onglet === 'toit' && sousOnglets['toit'] === 'eaux',
      ...(cotation && !en3D ? { cotation: cotationExterieure(f, pixelsEnMm(cam, 24)), cotesInterieures: cotesInterieures(f, pixelsEnMm(cam, 22)) } : {}), places }, dpr);
    $<HTMLElement>('.acc').textContent = accroche && accroche.genre !== 'libre' ? 'Accroché : ' + NOMS_ACCROCHE[accroche.genre] : '';
  }
  /* ---------- l'aimant du fond : les traits du plan qu'on reprend ---------- */
  let aimantFond = (() => { try { return localStorage.getItem('cpDesigner:aimantFond') !== 'non' } catch { return true } })();
  /** les traits de chaque fichier de fond (repère de son image) ; null : illisible ou absent */
  const traitsFonds = new Map<string, Trait[] | null>(), traitsEnCours = new Set<string>();
  /** l'aimant de chaque fond, pour son calage du moment (un nouveau calage, un nouvel aimant) */
  const aimants = new Map<string, AimantFond>();
  function aimantsDuNiveau(f: Floor): AimantFond[] {
    const out: AimantFond[] = [];
    for (const o of Object.values(f.objects)) {
      if (o.type !== 'underlay' || o.opacity <= 0) continue;
      const k = o.fileKey + '#' + (o.page ?? 1);
      if (!traitsFonds.has(k)) { chargerTraits(o, k); continue }
      const T = traitsFonds.get(k);
      if (!T?.length) continue;
      const c = k + '@' + [o.transform.scale, o.transform.rotation, o.transform.tx, o.transform.ty].join(',');
      let a = aimants.get(c);
      if (!a) {
        if (aimants.size > 8) aimants.clear();
        a = new AimantFond(T.map(([p, q]) => ({ a: imageVersPlan(o.transform, p), b: imageVersPlan(o.transform, q) })));
        aimants.set(c, a);
      }
      out.push(a);
    }
    return out;
  }
  function chargerTraits(o: Underlay, k: string) {
    if (traitsEnCours.has(k)) return;
    traitsEnCours.add(k);
    traitsDuFond(o.fileKey, o.page, undefined, enr.fonds).then(r => {
      traitsFonds.set(k, r?.traits ?? null);
      if (r?.traits.length) toast('Aimant du fond : ' + r.traits.length.toLocaleString('fr-FR') + (r.source === 'vecteurs' ? ' traits lus dans le PDF' : ' lignes trouvées sur l’image (horizontales et verticales)') + ' — Alt : tracé libre');
      dessinerBientot();
    }).catch(() => { traitsFonds.set(k, null) }).finally(() => traitsEnCours.delete(k));
  }
  function basculerAimant(oui = !aimantFond) {
    aimantFond = oui;
    try { localStorage.setItem('cpDesigner:aimantFond', oui ? 'oui' : 'non') } catch { /* le choix vaut pour la séance */ }
    toast(oui ? 'Aimant sur le fond : les tracés s’accrochent aux traits du plan' : 'Aimant sur le fond coupé');
    barreOutils(); dessinerBientot();
  }
  const JUSTIFS_TRACE: Record<Wall['justification'], string> = { center: 'l’axe', left: 'la face gauche', right: 'la face droite' };
  function basculerJustification() {
    const r = outils.reglages, ordre: Wall['justification'][] = ['center', 'left', 'right'];
    r.justification = ordre[(ordre.indexOf(r.justification) + 1) % 3]!;
    toast('Le mur se trace par ' + JUSTIFS_TRACE[r.justification] + ' (Tab pour changer)');
    barreOutils();
    if (curseur) effet(outils.bouger({ point: curseur, rayon: pixelsEnMm(cam, 10) }));
    dessinerBientot();
  }
  function chargerFond(cle: string, page?: number) {
    if (images.has(cle) || enChargement.has(cle)) return;
    enChargement.add(cle);
    imageDuFond(cle, page, undefined, enr.fonds).then(i => { if (i) { images.set(cle, i); dessinerBientot() } else toast('Le fichier d’un fond n’est ni sur cet appareil ni sur le serveur : réimportez-le pour le voir.', true) })
      .catch(e => toast('Fond illisible : ' + String((e as Error)?.message ?? e), true));
  }
  const redimension = new ResizeObserver(() => dessinerBientot());
  redimension.observe(main); redimension.observe(apercuBoite);

  /* ---------- gestes ---------- */
  const geste = (e: PointerEvent | MouseEvent): Geste => {
    const r = canvas.getBoundingClientRect();
    return { point: versMonde(cam, { x: e.clientX - r.left, y: e.clientY - r.top }), rayon: pixelsEnMm(cam, 10), alt: e.altKey, maj: e.shiftKey };
  };
  function effet(e: Effet) {
    if (e.accroche !== undefined) accroche = e.accroche;
    if (e.apercu !== undefined) apercu = e.apercu;
    if (e.selection !== undefined) { selection = e.selection; if (e.groupe === undefined) groupe = []; panneaux() }
    if (e.cadre !== undefined) cadre = e.cadre;
    if (e.profil !== undefined) { profilTrait = e.profil; if (e.profil) panneaux() }
    if (e.groupe !== undefined) choisirGroupe(e.groupe);
    if (e.basculer) {
      const g = new Set(groupe.length ? groupe : selection ? [selection] : []);
      if (g.has(e.basculer)) g.delete(e.basculer); else g.add(e.basculer);
      choisirGroupe([...g]);
    }
    if (e.aide) $<HTMLElement>('.aide').textContent = e.aide;
    if (e.commandes) {
      const avant = new Set(Object.keys(niveau().objects));
      /* un point de vue tout juste posé est choisi : on lui donne aussitôt sa pièce (PCMI 6, 7, 8) */
      if (faire(e.commandes.titre, e.commandes.liste) && e.commandes.liste.length === 1 && e.commandes.liste[0]!.type === 'creerPointDeVue') {
        const nouveau = Object.keys(niveau().objects).find(k => !avant.has(k));
        if (nouveau) { selection = nouveau; groupe = []; panneaux() }
      }
    }
    if (e.demande?.genre === 'nomPiece') nommerPiece(e.demande.niveau, e.demande.point);
    if (e.demande?.genre === 'pointCote') void poserPointCote(e.demande.point);
    if (e.demande?.genre === 'distanceFond') calerParDistance(e.demande.id, e.demande.image);
    if (e.fini) barreOutils();
    dessinerBientot();
  }
  function choisirGroupe(ids: string[]) {
    if (ids.length === 1) { selection = ids[0]!; groupe = [] } else { selection = null; groupe = ids }
    panneaux(); dessinerBientot();
  }

  /* ---------- copier, couper, coller ---------- */
  const choisis = (): string[] => (groupe.length ? groupe : selection ? [selection] : []);
  function copierChoix(): boolean {
    const pp = copier(niveau(), choisis());
    if (!pp) { toast('Rien à copier : choisissez des murs, des ouvertures, des pièces ou des meubles (Maj + clic, ou un cadre)', true); return false }
    pressePapiers = pp;
    try { localStorage.setItem('cpDesigner:pressePapiers', JSON.stringify(pp)) } catch { /* trop gros ou navigation privée : il reste en mémoire */ }
    toast('Copié : ' + resumePressePapiers(pp));
    return true;
  }
  function supprimerChoix() {
    const ids = choisis();
    if (!ids.length) return;
    if (ids.length === 1) { supprimer(ids[0]!); return }
    if (faire('Supprimer ' + ids.length + ' objets', commandesSupprimer(niveau(), ids))) { selection = null; groupe = []; panneaux() }
  }
  function commencerCollage() {
    if (!pressePapiers) { toast('Le presse-papiers est vide : copiez d’abord (Ctrl+C)', true); return }
    if (en3D) void basculer3D(false);
    effet(outils.choisir('selection')); barreOutils();
    collage = { pp: pressePapiers, quarts: 0, miroirX: false, miroirY: false };
    $<HTMLElement>('.aide').textContent = 'Coller : le groupe suit le curseur — clic pour le poser · T : quart de tour · X / Y : miroir · Échap : renoncer';
    if (curseur) apercuCollage(curseur);
  }
  /** l'origine du collage : le coin du groupe, accroché (un angle de mur, la grille) sauf Alt */
  function placementCollage(p: Point, alt = false) {
    const a = alt ? { point: p } : outils.pointAccroche({ point: p, rayon: pixelsEnMm(cam, 10) });
    return { origine: { x: Math.round(a.point.x), y: Math.round(a.point.y) }, quarts: collage!.quarts, miroirX: collage!.miroirX, miroirY: collage!.miroirY };
  }
  function apercuCollage(p: Point, alt = false) {
    if (!collage) return;
    let n = 0;
    apercu = commandesColler(collage.pp, niveauId, placementCollage(p, alt), () => 'apercu-colle-' + (++n));
    dessinerBientot();
  }
  function poserCollage(p: Point, alt = false) {
    if (!collage) return;
    const avant = new Set(Object.keys(niveau().objects));
    const cmds = commandesColler(collage.pp, niveauId, placementCollage(p, alt), () => ulid()), quoi = resumePressePapiers(collage.pp);
    collage = null; apercu = [];
    if (faire('Coller : ' + quoi, cmds))
      choisirGroupe(Object.keys(niveau().objects).filter(k => !avant.has(k)));
    barreOutils();
  }
  function dupliquerChoix() {
    if (!copierChoix() || !pressePapiers) return;
    const avant = new Set(Object.keys(niveau().objects));
    const pp = pressePapiers;
    if (faire('Dupliquer', commandesColler(pp, niveauId, { origine: { x: pp.ancre.x + 500, y: pp.ancre.y - 500 } }, () => ulid())))
      choisirGroupe(Object.keys(niveau().objects).filter(k => !avant.has(k)));
  }

  let glisse: { x: number; y: number } | null = null, espace = false;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || espace) { glisse = { x: e.clientX, y: e.clientY }; e.preventDefault(); return }
    if (e.button !== 0) return;
    const g = geste(e);
    if (collage) { poserCollage(g.point, g.alt); return }
    if (choixMur) {
      const w = mursDroits(niveau()).find(w => distance(w.axis.a, w.axis.b) > 0 && distSeg(g.point, w) <= w.thickness / 2 + g.rayon);
      if (w) { const c = choixMur; choixMur = null; c.faire(w.id) } else toast('Cliquez sur un mur', true);
      return;
    }
    effet(outils.appuyer(g));
  });
  canvas.addEventListener('pointermove', e => {
    if (glisse) { cam = glisser(cam, e.clientX - glisse.x, e.clientY - glisse.y); glisse = { x: e.clientX, y: e.clientY }; dessinerBientot(); return }
    const g = geste(e);
    curseur = g.point;
    $<HTMLElement>('.coord').textContent = 'x ' + m(g.point.x) + '   y ' + m(g.point.y);
    if (collage) { apercuCollage(g.point, g.alt); return }
    effet(outils.bouger(g));
  });
  canvas.addEventListener('pointerup', e => { if (glisse) { glisse = null; return } effet(outils.relacher(geste(e))) });
  canvas.addEventListener('dblclick', () => effet(outils.touche('Enter')));
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  /* un modèle glissé depuis la bibliothèque : aperçu sur le mur survolé, posé au lâcher */
  canvas.addEventListener('dragover', e => {
    if (outils.outil !== 'ouverture' && outils.outil !== 'mobilier') return;
    e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    curseur = geste(e).point; effet(outils.bouger(geste(e)));
  });
  canvas.addEventListener('drop', e => {
    const d = e.dataTransfer?.getData('text/plain') ?? '';
    if (outils.outil === 'ouverture' && d.startsWith('cp-ouverture:')) outils.reglages.modeleOuverture = d.slice('cp-ouverture:'.length);
    else if (outils.outil === 'mobilier' && d.startsWith('cp-meuble:')) outils.reglages.modeleMeuble = d.slice('cp-meuble:'.length);
    else return;
    e.preventDefault();
    const r = outils.appuyer(geste(e));
    effet(r);
    if (r.aide && !r.commandes) toast(r.aide, true);
  });
  canvas.addEventListener('dragleave', () => { apercu = []; dessinerBientot() });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect(), p = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (e.ctrlKey || !e.shiftKey && Math.abs(e.deltaX) < 1) cam = zoomer(cam, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p);
    else cam = glisser(cam, -e.deltaX, -e.deltaY);
    dessinerBientot();
  }, { passive: false });
  canvas.addEventListener('pointerleave', () => { curseur = null; accroche = null; dessinerBientot() });

  /* une case où l'on écrit garde ses touches ; une case à cocher ou un curseur, non (Échap, Ctrl+Z restent des raccourcis) */
  const saisie = (t: EventTarget | null) => (t instanceof HTMLInputElement && !['checkbox', 'range', 'button'].includes(t.type)) || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;
  window.addEventListener('keydown', e => {
    if (e.key === ' ' && !saisie(e.target)) { espace = true; canvas.style.cursor = 'grab'; e.preventDefault(); return }
    const cmd = e.ctrlKey || e.metaKey;
    if (cmd && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); return }
    if (saisie(e.target) || racine.querySelector('.voile')) return;
    if (cmd && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? retablir() : annuler(); return }
    if (cmd && e.key.toLowerCase() === 'y') { e.preventDefault(); retablir(); return }
    if (cmd && e.key.toLowerCase() === 'c') { e.preventDefault(); copierChoix(); return }
    if (cmd && e.key.toLowerCase() === 'x') { e.preventDefault(); if (copierChoix()) supprimerChoix(); return }
    if (cmd && e.key.toLowerCase() === 'v') { e.preventDefault(); commencerCollage(); return }
    if (cmd && e.key.toLowerCase() === 'd') { e.preventDefault(); dupliquerChoix(); return }
    if (cmd && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      choisirGroupe(Object.values(niveau().objects).filter(o => o.type !== 'underlay' && o.type !== 'roof' && o.type !== 'foundation' && o.type !== 'constraint').map(o => o.id));
      return;
    }
    /* pendant un collage : tourner, retourner, renoncer */
    if (collage && !cmd) {
      const k = e.key.toLowerCase();
      if (k === 'escape') { collage = null; apercu = []; barreOutils(); dessinerBientot(); return }
      if (k === 't') collage.quarts = (collage.quarts + 1) % 4;
      else if (k === 'x') collage.miroirX = !collage.miroirX;
      else if (k === 'y') collage.miroirY = !collage.miroirY;
      if (curseur) apercuCollage(curseur);
      return;
    }
    if (cmd) return;
    /* en visite, le clavier sert à marcher (la vue 3D le lit) ; Échap ou V en sortent */
    if (en3D && vue3d?.enVisite()) { if (e.key === 'Escape' || e.key.toLowerCase() === 'v') visite(false); else if (e.key.toLowerCase() === 'f') vue3d.cadrer(); return }
    if (en3D && e.key === 'Escape') { void basculer3D(false); return }
    if (en3D && e.key.toLowerCase() === 'f') { vue3d?.cadrer(); return }
    if (en3D && e.key.toLowerCase() === 'v') { visite(true); return }
    if (e.key === 'Escape') { choixMur = null; effet(outils.touche('Escape')); barreOutils(); return }
    if (e.key === 'Enter') { effet(outils.touche('Enter')); return }
    if (e.key === 'Tab' && ['mur', 'refend', 'cloison'].includes(outils.outil)) { e.preventDefault(); basculerJustification(); return }
    if ((e.key === 'Delete' || e.key === 'Backspace') && choisis().length) { e.preventDefault(); supprimerChoix(); return }
    /* un chiffre pendant un tracé : la longueur se tape (comme sur les logiciels de plans) */
    if (/^[0-9.,]$/.test(e.key) && outils.departTrace && ['mur', 'refend', 'cloison', 'rectangle', 'parcelle', 'amenagement', 'plateforme', 'reseau'].includes(outils.outil)) { e.preventDefault(); ouvrirSaisie(e.key); return }
    if (e.key === '3') { void basculer3D(); return }
    if (e.key.toLowerCase() === 't') {
      const o = selection ? niveau().objects[selection] : undefined;
      if (o?.type === 'furniture') faire('Tourner', [{ type: 'modifierMeuble', id: o.id, rotation: o.rotation + Math.PI / 2 }]);
      else if (o?.type === 'stair') faire('Tourner l’escalier', [{ type: 'modifierEscalier', id: o.id, rotation: o.rotation + Math.PI / 2 }]);
      else if (o?.type === 'section') faire('Inverser le regard de la coupe', [{ type: 'modifierCoupe', id: o.id, regard: o.look === 'left' ? 'right' : 'left' }]);
      else if (outils.outil === 'mobilier' || outils.outil === 'escalier') { effet(outils.tourner()); if (curseur) effet(outils.bouger({ point: curseur, rayon: pixelsEnMm(cam, 10) })) }
      return;
    }
    const t = TOUCHES[e.key.toLowerCase()];
    if (t) { choisir(t); return }
    if (e.key.toLowerCase() === 'f') { cadrerTout(); return }
    if (e.key.toLowerCase() === 'g') { basculerGrille(); return }
    if (e.key.toLowerCase() === 'q') { basculerEquerre(); return }
  });
  window.addEventListener('keyup', e => { if (e.key === ' ') { espace = false; canvas.style.cursor = '' } });

  /** la petite case où l'on tape une longueur (4,50), un angle (4,50<90) ou un rectangle (10x8) */
  function ouvrirSaisie(premier: string) {
    main.querySelector('.saisie')?.remove();
    const i = document.createElement('input');
    i.className = 'saisie'; i.value = premier; i.autocomplete = 'off';
    i.placeholder = outils.outil === 'rectangle' ? '10x8' : ['parcelle', 'plateforme', 'reseau'].includes(outils.outil) ? '25,30 ou 25,30<90' : '4,50 ou 4,50<90';
    const e = curseur ? versEcran(cam, curseur) : { x: cam.largeur / 2, y: cam.hauteur / 2 };
    i.style.left = Math.min(cam.largeur - 160, e.x + 16) + 'px'; i.style.top = Math.min(cam.hauteur - 40, e.y + 34) + 'px';
    /* retirer la case fait perdre le focus : le blur ne doit pas la retirer une seconde fois */
    const fermer = () => { i.onblur = null; i.remove() };          // le focus revient à la page : les raccourcis marchent
    i.onkeydown = k => {
      if (k.key === 'Enter') { k.preventDefault(); const v = i.value; fermer(); const r = outils.saisir(v); effet(r); if (r.aide && !r.commandes) toast(r.aide, true) }
      else if (k.key === 'Escape') { k.preventDefault(); fermer() }
      k.stopPropagation();
    };
    i.onblur = () => { i.onblur = null; i.remove() };
    main.appendChild(i);
    i.focus(); i.setSelectionRange(i.value.length, i.value.length);
  }

  /* ---------- outils ---------- */
  const OUTILS: { nom: NomOutil; icone: string; libelle: string; touche: string }[] = [
    { nom: 'selection', icone: 'selection', libelle: 'Sélection', touche: 'V' }, { nom: 'mur', icone: 'mur_exterieur', libelle: 'Mur extérieur', touche: 'M' },
    { nom: 'refend', icone: 'mur_interieur', libelle: 'Mur intérieur', touche: 'J' },
    { nom: 'cloison', icone: 'cloison', libelle: 'Cloison', touche: 'C' }, { nom: 'fictive', icone: 'cloison_fictive', libelle: 'Cloison fictive', touche: 'U' },
    { nom: 'rectangle', icone: 'rectangle', libelle: 'Rectangle de murs', touche: 'R' },
    { nom: 'ouverture', icone: 'ouverture_mur', libelle: 'Ouverture', touche: 'O' }, { nom: 'mobilier', icone: 'produit', libelle: 'Mobilier', touche: 'B' },
    { nom: 'escalier', icone: 'escalier', libelle: 'Escalier', touche: 'E' }, { nom: 'coupe', icone: 'coupe', libelle: 'Trait de coupe', touche: 'K' },
    { nom: 'parcelle', icone: 'parcelle', libelle: 'Parcelle (limite du terrain)', touche: 'L' },
    { nom: 'amenagement', icone: 'exterieur', libelle: 'Aménagement extérieur (clôture, terrasse, allée…)', touche: 'A' },
    { nom: 'pointdevue', icone: 'point_de_vue', libelle: 'Point de prise de vue (photographies du dossier)', touche: 'I' },
    { nom: 'fenetretoit', icone: 'fenetre_toit', libelle: 'Fenêtre de toit', touche: 'H' },
    { nom: 'altitude', icone: 'altitude', libelle: 'Point coté du terrain (altitude NGF)', touche: 'N' },
    { nom: 'plateforme', icone: 'plateforme', libelle: 'Plateforme de terrassement (et son talus)', touche: 'W' },
    { nom: 'reseau', icone: 'reseau', libelle: 'Réseau (VRD)', touche: 'X' },
    { nom: 'equipement', icone: 'regard', libelle: 'Équipement de réseau (regard, compteur…)', touche: 'Y' },
    { nom: 'arbre', icone: 'arbre', libelle: 'Arbre', touche: 'Z' },
    { nom: 'profil', icone: 'profil', libelle: 'Profil en long du terrain', touche: 'S' },
    { nom: 'poteau', icone: 'poteau', libelle: 'Poteau', touche: '' }, { nom: 'poutre', icone: 'poutre', libelle: 'Poutre', touche: '' },
    { nom: 'trappe', icone: 'trappe', libelle: 'Trappe de visite', touche: '' }, { nom: 'descente', icone: 'descente', libelle: 'Descente d’eaux pluviales', touche: '' },
    { nom: 'lucarne', icone: 'lucarne_gable', libelle: 'Lucarne', touche: '' },
    { nom: 'piece', icone: 'piece', libelle: 'Pièce', touche: 'P' }, { nom: 'cote', icone: 'cote', libelle: 'Cote', touche: 'D' },
  ];
  const TOUCHES: Record<string, NomOutil> = Object.fromEntries(OUTILS.filter(o => o.touche).map(o => [o.touche.toLowerCase(), o.nom]));
  /** l'onglet et le sous-onglet où vit chaque outil : choisir l'outil (au clavier) y mène */
  const PLACE_OUTIL: Partial<Record<NomOutil, [string, string]>> = {
    mur: ['trace', 'murs'], refend: ['trace', 'murs'], cloison: ['trace', 'murs'], fictive: ['trace', 'murs'], rectangle: ['trace', 'murs'],
    piece: ['trace', 'pieces'], parcelle: ['trace', 'terrain'], altitude: ['trace', 'terrain'], escalier: ['trace', 'niveaux'],
    ouverture: ['ouvrant', 'ouvrant'], fenetretoit: ['toit', 'fenetres'], amenagement: ['exterieur', 'amenagements'], pointdevue: ['exterieur', 'vues'],
    plateforme: ['exterieur', 'terrassement'], reseau: ['exterieur', 'reseaux'], equipement: ['exterieur', 'equipements'], arbre: ['exterieur', 'vegetation'], profil: ['exterieur', 'terrain'], poteau: ['trace', 'structure'], poutre: ['trace', 'structure'], trappe: ['trace', 'fondations'], descente: ['toit', 'eaux'], lucarne: ['toit', 'lucarnes'],
    mobilier: ['produit', 'mobilier'], cote: ['indications', 'cotes'], coupe: ['indications', 'coupes'],
  };
  function choisir(o: NomOutil) {
    if (en3D) void basculer3D(false);
    /* la parcelle se trace sur le niveau le plus bas (le terrain) */
    /* une fenêtre de toit, une descente se posent sur la toiture : on passe au niveau qui la porte */
    if ((o === 'fenetretoit' || o === 'descente' || o === 'lucarne') && !Object.values(niveau().objects).some(x => x.type === 'roof')) {
      const t = niveaux().find(f => Object.values(f.objects).some(x => x.type === 'roof'));
      if (!t) { toast('Aucune toiture : posez-la d’abord (onglet Toit), puis ses fenêtres', true); return }
      niveauId = t.id; selection = null; apres();
    }
    if (['parcelle', 'amenagement', 'pointdevue', 'altitude', 'plateforme', 'reseau', 'equipement', 'arbre', 'profil'].includes(o)) { const bas = [...niveaux()].sort((a, b) => a.elevation - b.elevation)[0]; if (bas && bas.id !== niveauId) { niveauId = bas.id; selection = null; apres() } }
    /* l'outil mène à sa place, sauf s'il est déjà offert ici (la parcelle est au Tracé et à l'Extérieur) */
    const place = PLACE_OUTIL[o];
    if (place && !offertIci(o)) { onglet = place[0]; sousOnglets[place[0]] = place[1] }
    if (o !== 'piece') typePiece = null;
    choixMur = null; if (o === 'ouverture' || o === 'mobilier' || o === 'escalier' || o === 'coupe' || o === 'parcelle' || o === 'amenagement' || o === 'pointdevue' || o === 'fenetretoit' || o === 'plateforme' || o === 'reseau' || o === 'equipement' || o === 'arbre' || o === 'poteau' || o === 'poutre' || o === 'trappe' || o === 'descente' || o === 'lucarne') selection = null; effet(outils.choisir(o)); barreOutils(); panneaux() }
  /** l'outil est-il une tuile du sous-onglet ouvert ? */
  const offertIci = (o: NomOutil) => !!sousCourant().tuiles?.().some(t => !!t.classe?.split(' ').includes('o-' + o));

  /* ---------- onglets, sous-onglets, ruban ---------- */
  interface Tuile { libelle: string; icone: string; faire: () => void; actif?: () => boolean; titre?: string; touche?: string; classe?: string; couleur?: string }
  interface SousOnglet { id: string; libelle: string; icone: string; tuiles?: () => Tuile[]; options?: () => HTMLElement[]; catalogue?: () => void; entrer?: () => void; panneau?: (f: Floor) => void }
  interface Onglet { id: string; libelle: string; icone: string; sous: SousOnglet[] }
  const outil = (n: NomOutil, libelle?: string, icone?: string): Tuile => {
    const o = OUTILS.find(x => x.nom === n)!;
    return { libelle: libelle ?? o.libelle, icone: icone ?? o.icone, faire: () => choisir(n), actif: () => outils.outil === n, touche: o.touche, classe: 'o-' + n };
  };
  const action = (libelle: string, icone: string, faire: () => void, titre?: string, classe?: string): Tuile => ({ libelle, icone, faire, ...(titre ? { titre } : {}), ...(classe ? { classe } : {}) });
  /** le niveau qui porte la toiture : celui qui en a une, sinon le plus haut qui a des murs */
  const niveauToit = (): Floor => niveaux().find(f => Object.values(f.objects).some(o => o.type === 'roof'))
    ?? [...niveaux()].reverse().find(f => mursDroits(f).some(w => w.role === 'exterior')) ?? niveau();
  function poserToit(genre: Roof['kind']) {
    const f = niveauToit(), r = Object.values(f.objects).find((o): o is Roof => o.type === 'roof');
    if (niveauId !== f.id) { niveauId = f.id; selection = null }
    if (r) faire('Toiture : ' + TOITURES[genre], [{ type: 'modifierToiture', id: r.id, genre, ...(genre === 'flat' ? { couverture: 'gravel' as const } : r.covering === 'gravel' ? { couverture: 'tile' as const } : {}) }]);
    else faire('Toiture : ' + TOITURES[genre], [{ type: 'creerToiture', niveau: f.id, genre, pente: genre === 'flat' ? 0 : 35, debord: 200, couverture: genre === 'flat' ? 'gravel' : 'tile' }]);
    apres();
  }
  const ONGLETS: Onglet[] = [
    { id: 'trace', libelle: 'Tracé', icone: 'trace', sous: [
      { id: 'terrain', libelle: 'Terrain naturel', icone: 'terrain', tuiles: () => [...tuilesTerrain(),
        action('Importer un fond', 'fond', importerFond, 'Un plan PDF ou une image (plan du géomètre, plan à reprendre), à caler'),
        action('Caler le fond', 'caler', () => {
          const u = Object.values(niveau().objects).find(o => o.type === 'underlay');
          if (!u) { toast('Aucun fond sur ce niveau : importez-le d’abord', true); return }
          if (u.locked) { selection = u.id; panneaux(); toast('Déverrouillez le fond pour le caler', true); return }
          selection = u.id; effet(outils.choisir('caler')); barreOutils();
        }, 'Deux points du fond dont vous connaissez la distance'),
        action('Plan de l’atelier', 'atelier', importerAtelier, 'Le RDC lu par l’atelier (modele.json)')], panneau: f => panneauTerrain(f) },
      { id: 'murs', libelle: 'Murs', icone: 'murs', tuiles: () => [outil('mur', 'Mur extérieur'), outil('refend', 'Mur intérieur'), outil('cloison'), outil('fictive'),
        outil('rectangle', 'Rectangle de murs'), action('Mettre d’équerre', 'equerre', () => mettreDEquerre(), 'Redresser à 90° les murs presque d’équerre du niveau')],
        options: () => optionsMurs() },
      { id: 'pieces', libelle: 'Types de pièces', icone: 'pieces', tuiles: () => [
        ...TYPES_PIECES.map(t => ({ libelle: t.libelle, icone: t.icone, faire: () => choisirTypePiece(t.libelle), actif: () => outils.outil === 'piece' && typePiece === t.libelle, titre: 'Cliquez dans un espace clos pour en faire : ' + t.libelle })),
        { ...outil('piece', 'Autre nom…'), faire: () => { typePiece = null; choisir('piece') }, actif: () => outils.outil === 'piece' && !typePiece }] },
      { id: 'structure', libelle: 'Poteaux et poutres', icone: 'poteau', tuiles: () => [outil('poteau', 'Poteau'), outil('poutre', 'Poutre')], options: () => optionsStructure() },
      { id: 'fondations', libelle: 'Fondations', icone: 'fondations', entrer: () => allerAuxFondations(), tuiles: () => [
        ...(['crawl_space', 'slab_on_grade'] as const).map(g => ({ libelle: SOUBASSEMENTS[g], icone: g === 'crawl_space' ? 'vide_sanitaire' : 'terre_plein', classe: 'fond-' + g,
          titre: g === 'crawl_space' ? 'Plancher porté sur un vide sanitaire, semelles filantes sous les murs porteurs' : 'Dallage sur terre-plein, semelles filantes sous les murs porteurs',
          faire: () => poserFondations(g), actif: () => fondationsDuProjet(h.projet)?.fondation.kind === g })),
        outil('trappe', 'Trappe de visite')], panneau: () => panneauFondations() },
      { id: 'niveaux', libelle: 'Niveaux', icone: 'niveaux', tuiles: () => [action('Ajouter un niveau', 'niveau_plus', () => void ajouterNiveau()), outil('escalier')] },
      { id: 'transformations', libelle: 'Transformations', icone: 'transformations', tuiles: () => [outil('selection'),
        action('Tout choisir', 'tout', () => choisirGroupe(Object.values(niveau().objects).filter(o => o.type !== 'underlay' && o.type !== 'roof' && o.type !== 'foundation' && o.type !== 'constraint').map(o => o.id)), 'Ctrl+A'),
        action('Copier', 'copier', () => void copierChoix(), 'Ctrl+C'), action('Coller', 'coller', commencerCollage, 'Ctrl+V — T : quart de tour, X / Y : miroir'),
        action('Dupliquer', 'dupliquer', dupliquerChoix, 'Ctrl+D'), action('Mettre d’équerre', 'equerre', () => mettreDEquerre(choisis().filter(id => niveau().objects[id]?.type === 'wall').length ? choisis().filter(id => niveau().objects[id]?.type === 'wall') : undefined))] },
      { id: 'implantation', libelle: 'Implantation', icone: 'implantation', tuiles: () => [
        action('Implanter la maison', 'implantation', () => {
          const t = parcelleDuProjet(h.projet);
          if (!t) { toast('Tracez d’abord la parcelle (Terrain naturel → Parcelle)', true); return }
          niveauId = t.niveau.id; selection = t.plot.id; apres();
        }, 'La parcelle se place autour de la maison : distances aux limites, orientation'),
        outil('parcelle', 'Tracer la parcelle')] },
    ] },
    { id: 'ouvrant', libelle: 'Ouvrant', icone: 'ouvrant', sous: [
      { id: 'ouvrant', libelle: 'Ouvrant', icone: 'ouvrant', catalogue: () => bibliotheque(), entrer: () => { if (outils.outil !== 'ouverture') choisir('ouverture') } },
      { id: 'tremie', libelle: 'Trémie et escalier', icone: 'escalier', tuiles: () => [outil('escalier')] },
    ] },
    { id: 'toit', libelle: 'Toit', icone: 'toit', sous: [
      { id: 'toit', libelle: 'Toit', icone: 'toit', tuiles: () => (['hip', 'gable', 'shed', 'flat'] as const).map(g => ({
        libelle: ({ hip: 'Toit multi-pans', gable: 'Toit deux pans', shed: 'Toit une pente', flat: 'Toit plat' } as const)[g], icone: ({ hip: 'toit_croupes', gable: 'toit_deux_pans', shed: 'toit_un_pan', flat: 'toit_plat' } as const)[g],
        faire: () => poserToit(g), actif: () => Object.values(niveauToit().objects).some(o => o.type === 'roof' && o.kind === g), classe: 'toit-' + g })),
        panneau: () => sectionToiture(niveauToit()) },
      { id: 'fenetres', libelle: 'Fenêtres de toit', icone: 'fenetre_toit', tuiles: () => [outil('fenetretoit')], panneau: () => sectionToiture(niveauToit()) },
      { id: 'lucarnes', libelle: 'Lucarnes', icone: 'lucarne_gable', tuiles: () => (['gable', 'hip', 'shed'] as const).map(g => ({
        libelle: LUCARNES[g].replace(/ \(.*/, ''), icone: 'lucarne_' + g, classe: 'o-lucarne luc-' + g, titre: LUCARNES[g] + ' : cliquez sur un pan, au pied de sa façade',
        faire: () => { outils.reglages.genreLucarne = g; choisir('lucarne') }, actif: () => outils.outil === 'lucarne' && outils.reglages.genreLucarne === g })),
        panneau: () => sectionToiture(niveauToit()) },
      { id: 'eaux', libelle: 'Égout et gouttières', icone: 'descente', entrer: () => { const f = niveauToit(); if (f.id !== niveauId) { niveauId = f.id; selection = null; apres() } },
        tuiles: () => [outil('descente', 'Descente EP'),
          ...(['genoise_1', 'genoise_2', 'genoise_3'] as const).map(g => ({ libelle: FINITIONS_EGOUT[g], icone: 'genoise', classe: 'egout-' + g, titre: 'Égout en génoise (tuiles canal en encorbellement)',
            faire: () => finitionEgout(g), actif: () => toitDuNiveau()?.eavesFinish === g }))],
        panneau: () => panneauEaux() },
    ] },
    { id: 'exterieur', libelle: 'Extérieur', icone: 'exterieur', sous: [
      { id: 'terrain', libelle: 'Terrain', icone: 'terrain', tuiles: () => tuilesTerrain(), panneau: f => panneauTerrain(f) },
      { id: 'terrassement', libelle: 'Terrassement', icone: 'plateforme', tuiles: () => [outil('plateforme', 'Plateforme'),
        action('Plateforme de la maison', 'cubature', plateformeMaison, 'Une plateforme autour de la maison (1 m de débord), au niveau réglé ci-contre'),
        { libelle: 'Courbes de niveau', icone: 'courbes', faire: () => basculerCourbes(), actif: () => courbes > 0 }],
        options: () => optionsTerrassement(), panneau: f => panneauMetre(f) },
      { id: 'reseaux', libelle: 'Réseaux', icone: 'reseau', tuiles: () => (Object.keys(NOMS_RESEAUX) as Network['kind'][]).map(g => ({
        libelle: NOMS_RESEAUX[g].libelle, icone: 'reseau', couleur: NOMS_RESEAUX[g].couleur, classe: 'o-reseau res-' + g,
        faire: () => { outils.reglages.genreReseau = g; choisir('reseau') }, actif: () => outils.outil === 'reseau' && outils.reglages.genreReseau === g })),
        panneau: f => panneauMetre(f) },
      { id: 'equipements', libelle: 'Équipements', icone: 'regard', tuiles: () => (Object.keys(NOMS_EQUIPEMENTS) as NetworkItem['kind'][]).map(g => ({
        libelle: NOMS_EQUIPEMENTS[g].libelle, icone: ICONES_EQUIPEMENTS[g], classe: 'o-equipement eq-' + g,
        faire: () => { outils.reglages.genreEquipement = g; choisir('equipement') }, actif: () => outils.outil === 'equipement' && outils.reglages.genreEquipement === g })),
        panneau: f => panneauMetre(f) },
      { id: 'vegetation', libelle: 'Végétation', icone: 'arbre', tuiles: () => (['planted', 'existing', 'felled'] as Tree['state'][]).map(e => ({
        libelle: ({ planted: 'Arbre à planter', existing: 'Arbre existant', felled: 'Arbre à abattre' } as const)[e], icone: e === 'felled' ? 'arbre_abattre' : 'arbre', classe: 'o-arbre arbre-' + e,
        couleur: e === 'felled' ? '#E07A6E' : e === 'planted' ? '#8FD18A' : '#C6E3B5',
        faire: () => { outils.reglages.etatArbre = e; choisir('arbre') }, actif: () => outils.outil === 'arbre' && outils.reglages.etatArbre === e })),
        options: () => optionsVegetation(), panneau: f => panneauMetre(f) },
      { id: 'amenagements', libelle: 'Aménagements', icone: 'exterieur', tuiles: () => (Object.keys(GENRES_AMENAGEMENT) as GenreAmenagement[]).map(g => ({
        libelle: GENRES_AMENAGEMENT[g].libelle, icone: ({ fence: 'cloture', terrace: 'terrasse', path: 'allee', parking: 'allee', green: 'pelouse' } as const)[g],
        faire: () => { outils.reglages.genreAmenagement = g; outils.reglages.finitionAmenagement = finitionsDe(g)[0]!.id; choisir('amenagement') },
        actif: () => outils.outil === 'amenagement' && outils.reglages.genreAmenagement === g })) },
      { id: 'vues', libelle: 'Prises de vue', icone: 'point_de_vue', tuiles: () => [outil('pointdevue', 'Point de prise de vue')] },
    ] },
    { id: 'produit', libelle: 'Produit', icone: 'produit', sous: [
      { id: 'mobilier', libelle: 'Produit', icone: 'produit', catalogue: () => bibliothequeMobilier(), entrer: () => { if (outils.outil !== 'mobilier') choisir('mobilier') } },
      { id: 'escalier', libelle: 'Escalier', icone: 'escalier', tuiles: () => [outil('escalier')] },
    ] },
    { id: 'revetement', libelle: 'Revêtement', icone: 'revetement', sous: [
      { id: 'facades', libelle: 'Façades', icone: 'facade', catalogue: () => nuancier('facades'), panneau: f => sectionMateriaux(f) },
      { id: 'sols', libelle: 'Sols', icone: 'sol', catalogue: () => nuancier('sols'), panneau: f => sectionMateriaux(f) },
      { id: 'murs', libelle: 'Murs intérieurs', icone: 'peinture', catalogue: () => nuancier('murs'), panneau: f => sectionMateriaux(f) },
    ] },
    { id: 'studio', libelle: 'Studio', icone: 'studio', sous: [
      { id: 'vue3d', libelle: 'Vue 3D', icone: 'vue3d', entrer: () => void basculer3D(true), tuiles: () => [
        action('Recadrer', 'vue3d', () => vue3d?.cadrer()), action('Visite', 'visite', () => { void basculer3D(true).then(() => visite(true)) }, 'À hauteur d’homme (V)'),
        action('Image PNG', 'image', () => void imagePNG()), action('Garder pour le dossier', 'permis', () => void garderPerspective(), 'La vue ira au dossier de permis')] },
      { id: 'insertion', libelle: 'Insertion (PCMI 6)', icone: 'photo', entrer: () => void basculer3D(true), tuiles: () => [
        action('Photo du terrain', 'photo', () => { void basculer3D(true).then(() => poserPhotoSite()) }), action('Garder pour le PCMI 6', 'permis', () => void garderInsertion())] },
    ] },
    { id: 'indications', libelle: 'Indications', icone: 'indications', sous: [
      { id: 'cotes', libelle: 'Cotes', icone: 'cote', tuiles: () => [outil('cote'), { libelle: 'Cotation automatique', icone: 'cote', faire: () => basculerCotation(), actif: () => cotation }] },
      { id: 'coupes', libelle: 'Coupes', icone: 'coupe', tuiles: () => [outil('coupe'), action('PDF des coupes', 'pdf', () => void exporterCoupes())] },
      { id: 'couleurs', libelle: 'Couleurs de pièces', icone: 'couleurs', tuiles: () => [{ libelle: 'Sols en couleur', icone: 'couleurs', faire: () => basculerSols(), actif: () => solsCouleur }, outil('piece', 'Nommer une pièce')] },
      { id: 'surfaces', libelle: 'Tableaux de surfaces', icone: 'tableau', panneau: f => panneauSurfaces(f) },
    ] },
    { id: 'dossier', libelle: 'Dossier', icone: 'dossier', sous: [
      { id: 'plans', libelle: 'Plans', icone: 'pdf', tuiles: () => [action('Plans en PDF', 'pdf', () => void exporterPdf()), action('Plans en DXF', 'dxf', () => void exporterDxf()), action('Projet (JSON)', 'json', exporter)] },
      { id: 'metre', libelle: 'Métré', icone: 'metre', tuiles: () => [action('Métré (CSV)', 'tableau', exporterMetre, 'Le métré par lot, à ouvrir dans un tableur', 'b-metre')], panneau: () => panneauMetreProjet() },
      { id: 'permis', libelle: 'Dossier de permis', icone: 'permis', tuiles: () => [action('Dossier PC complet', 'permis', () => void exporterPdf('dossier')),
        action('Informations', 'notice', () => void informationsDossier(), 'Maître d’ouvrage, lieu, cadastre, chauffage, modifications…'),
        action('Cabinet', 'atelier', () => void reglerCabinet(), 'Société, coordonnées et dessinateur (réglés sur cet appareil)'),
        action('PCMI 1 situation', 'image', () => void importerPiece('situation', 'PCMI 1 — Plan de situation', 'Source et échelle de l’extrait (ex. : Géoportail, 1/5 000)')),
        action('PCMI 7 proche', 'photo', () => void importerPiece('photoProche', 'PCMI 7 — Environnement proche', 'Point et angle de prise de vue (ex. : depuis la rue, vers le nord)')),
        action('PCMI 8 lointain', 'photo', () => void importerPiece('photoLointaine', 'PCMI 8 — Environnement lointain', 'Point et angle de prise de vue'))],
        panneau: () => sectionPieces() },
    ] },
  ];
  let onglet = 'trace';
  const sousOnglets: Record<string, string> = Object.fromEntries(ONGLETS.map(o => [o.id, o.sous[0]!.id]));
  sousOnglets['trace'] = 'murs';
  const ongletCourant = () => ONGLETS.find(o => o.id === onglet) ?? ONGLETS[0]!;
  const sousCourant = () => { const O = ongletCourant(); return O.sous.find(x => x.id === sousOnglets[O.id]) ?? O.sous[0]! };
  function ouvrirOnglet(id: string, sous?: string) {
    const quitteStudio = onglet === 'studio' && id !== 'studio';
    if (id !== onglet || (sous && sous !== sousOnglets[id])) { categorieOuverte = null; recherche = '' }
    onglet = id;
    if (sous) sousOnglets[id] = sous;
    if (quitteStudio && en3D) void basculer3D(false);
    /* un outil qui n'a rien à faire dans le nouvel onglet laisse la place à la sélection */
    const place = PLACE_OUTIL[outils.outil];
    if (place && (place[0] !== id || (sous && place[1] !== sous)) && !offertIci(outils.outil)) { choixMur = null; effet(outils.choisir('selection')) }
    sousCourant().entrer?.();
    barreOutils(); panneaux(); dessinerBientot();
  }
  function barreOutils() {
    const O = ongletCourant(), S = sousCourant();
    ongletsNav.innerHTML = ONGLETS.map(o => `<button data-o="${o.id}" class="${o.id === O.id ? 'actif' : ''}" title="${esc(o.libelle)}">${icone(o.icone, 22)}<span>${esc(o.libelle)}</span></button>`).join('');
    ongletsNav.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.onclick = () => ouvrirOnglet(b.dataset['o']!));
    sousNav.innerHTML = O.sous.map(x => `<button data-s="${x.id}" class="${x.id === S.id ? 'actif' : ''}">${icone(x.icone, 18)}<span>${esc(x.libelle)}</span></button>`).join('');
    sousNav.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.onclick = () => ouvrirOnglet(O.id, b.dataset['s']!));
    ruban.innerHTML = '';
    racine.querySelector('.liste-compo')?.remove();
    for (const t of S.tuiles?.() ?? []) {
      const b = document.createElement('button');
      b.className = 'tuile-outil' + (t.actif?.() ? ' actif' : '') + (t.classe ? ' ' + t.classe : '');
      b.title = (t.titre ?? t.libelle) + (t.touche ? ' (' + t.touche + ')' : '');
      b.innerHTML = icone(t.icone, 30) + '<span>' + esc(t.libelle) + '</span>' + (t.touche ? '<kbd>' + esc(t.touche) + '</kbd>' : '');
      if (t.couleur) b.querySelector('svg')?.setAttribute('style', 'color:' + t.couleur);
      b.onclick = () => { t.faire(); barreOutils() };
      ruban.appendChild(b);
    }
    for (const e of S.options?.() ?? []) ruban.appendChild(e);
    const defile = catalogue.scrollTop;
    catalogue.innerHTML = ''; catalogue.className = 'catalogue';
    main.querySelector('.volet')?.remove();
    S.catalogue?.();
    catalogue.scrollTop = defile;
    ajusterCamera();
    $<HTMLElement>('.aide').textContent = choixMur ? choixMur.libelle : outils.outil === 'piece' && typePiece ? 'Cliquez dans un espace clos : il devient « ' + typePiece + ' » (Échap pour finir)' : outils.aide;
  }

  /* ---------- murs : la composition tracée ---------- */
  /** les compositions choisies, gardées sur cet appareil ; '' : « sur mesure » (épaisseur réglée) */
  outils.reglages.compositions = (() => {
    try { const c = JSON.parse(localStorage.getItem('cpDesigner:compositions') ?? 'null'); if (c && typeof c === 'object') return { ...COMPOSITION_PAR_DEFAUT, ...c } } catch { /* rien de gardé */ }
    return { ...COMPOSITION_PAR_DEFAUT };
  })();
  let listeCompositions = false;
  /** la carte d'une composition : son nom, son épaisseur, ses couches */
  function carteComposition(k: CompositionMur | undefined, epaisseurSurMesure: Mm): HTMLElement {
    const c = document.createElement('div'); c.className = 'carte';
    c.innerHTML = k
      ? `<div class="tete"><span>${esc(k.libelle)}</span><span>${Math.round(epaisseurComposition(k) / 10)} cm</span></div>
         <div class="apercu-couches">${k.couches.map(x => `<i style="flex:${x.epaisseur};background:${MATIERES_COUCHES[x.matiere].couleur}" title="${esc(MATIERES_COUCHES[x.matiere].libelle)} ${x.epaisseur / 10} cm"></i>`).join('')}</div>
         <div class="couches">${k.couches.map(x => `<span>${esc(MATIERES_COUCHES[x.matiere].libelle)}</span>`).join('')}</div>`
      : `<div class="tete"><span>Sur mesure</span><span>${(epaisseurSurMesure / 10).toLocaleString('fr-FR')} cm</span></div><div class="couches"><span>épaisseur réglée, sans couches</span></div>`;
    return c;
  }
  function optionsMurs(): HTMLElement[] {
    const t = outils.murTrace, out: HTMLElement[] = [];
    const genre = outils.outil === 'rectangle' ? 'exterieur' : t.genre;
    if (genre && ['mur', 'refend', 'cloison', 'rectangle'].includes(outils.outil)) {
      const r = outils.reglages, k = compositionMur(r.compositions[genre]);
      const boite = document.createElement('div'); boite.className = 'compo';
      const carte = carteComposition(k, genre === 'cloison' ? r.epaisseurCloison : r.epaisseurMur);
      carte.title = 'Choisir la composition';
      carte.onclick = () => { listeCompositions = !listeCompositions; barreOutils() };
      boite.appendChild(carte);
      if (listeCompositions) {
        /* la liste flotte au-dessus du plan, sous la carte (le ruban garde sa hauteur : le plan ne bouge pas) */
        const L = document.createElement('div'); L.className = 'liste-compo';
        for (const x of [...compositionsDu(genre), undefined]) {
          const c = carteComposition(x, genre === 'cloison' ? r.epaisseurCloison : r.epaisseurMur);
          if ((x?.id ?? '') === r.compositions[genre]) c.classList.add('choisi');
          c.onclick = () => {
            r.compositions[genre] = x?.id ?? ''; listeCompositions = false;
            try { localStorage.setItem('cpDesigner:compositions', JSON.stringify(r.compositions)) } catch { /* gardé pour la séance */ }
            barreOutils();
          };
          L.appendChild(c);
        }
        racine.querySelector('.cpd')!.appendChild(L);
        requestAnimationFrame(() => { const r = carte.getBoundingClientRect(); L.style.left = r.left + 'px'; L.style.top = r.bottom + 4 + 'px'; L.style.width = r.width + 'px' });
      }
      out.push(boite);
    }
    /* les options en pile (équerre, aimant, tracé par) : le ruban garde sa largeur */
    const o = document.createElement('div'); o.className = 'options pile';
    const eq = document.createElement('label'); eq.innerHTML = '<input type="checkbox"' + (outils.reglages.equerre ? ' checked' : '') + '> Équerre (Q)';
    eq.querySelector('input')!.onchange = e => basculerEquerre((e.target as HTMLInputElement).checked);
    o.appendChild(eq);
    const am = document.createElement('label'); am.className = 'b-aimant'; am.title = 'Les tracés s’accrochent aux traits du fond importé (angles et lignes du plan) ; Alt : libre';
    am.innerHTML = '<input type="checkbox"' + (aimantFond ? ' checked' : '') + '> Aimant (fond)';
    am.querySelector('input')!.onchange = e => basculerAimant((e.target as HTMLInputElement).checked);
    o.appendChild(am);
    if (['mur', 'refend', 'cloison'].includes(outils.outil)) {
      const j = document.createElement('label'); j.title = 'Pour suivre un trait du plan : la face du mur se pose sur la ligne (Tab pendant le tracé)';
      j.innerHTML = 'Par <select class="justif">' + Object.entries(JUSTIFS_TRACE).map(([k, v]) => `<option value="${k}">${esc(v.replace('l’', '').replace('la ', ''))}</option>`).join('') + '</select>';
      const sel = j.querySelector('select')!; sel.value = outils.reglages.justification;
      sel.onchange = () => { outils.reglages.justification = sel.value as Wall['justification'] };
      o.appendChild(j);
    }
    if (outils.outil === 'rectangle') {
      const l = document.createElement('label'); l.innerHTML = 'Cotes <select><option value="hors_tout">hors tout</option><option value="interieur">intérieures</option></select>';
      const sel = l.querySelector('select')!; sel.value = outils.reglages.rectangle; sel.onchange = () => { outils.reglages.rectangle = sel.value as 'hors_tout' | 'interieur' };
      o.appendChild(l);
    }
    out.push(o);
    return out;
  }

  /* ---------- types de pièces ---------- */
  const TYPES_PIECES: { libelle: string; usage: RoomUsage; humide?: boolean; icone: string }[] = [
    { libelle: 'Cuisine', usage: 'kitchen', humide: true, icone: 'cuisine' }, { libelle: 'Séjour', usage: 'living', icone: 'canape' }, { libelle: 'Salon', usage: 'living', icone: 'tv' },
    { libelle: 'Salle à manger', usage: 'living', icone: 'table' }, { libelle: 'Pièce de vie', usage: 'living', icone: 'fauteuil' }, { libelle: 'Entrée', usage: 'circulation', icone: 'cle' },
    { libelle: 'Salle d’eau', usage: 'bathroom', humide: true, icone: 'douche' }, { libelle: 'Salle de bain', usage: 'bathroom', humide: true, icone: 'bain' }, { libelle: 'WC', usage: 'wc', humide: true, icone: 'wc' },
    { libelle: 'Chambre', usage: 'bedroom', icone: 'lit' }, { libelle: 'Placard', usage: 'storage', icone: 'placard' }, { libelle: 'Dressing', usage: 'storage', icone: 'cintre' },
    { libelle: 'Cellier', usage: 'storage', icone: 'cellier' }, { libelle: 'Buanderie', usage: 'technical', humide: true, icone: 'lave_linge' }, { libelle: 'Bureau', usage: 'other', icone: 'bureau' },
    { libelle: 'Dégagement', usage: 'circulation', icone: 'degagement' }, { libelle: 'Sous escalier', usage: 'storage', icone: 'escalier' }, { libelle: 'Garage', usage: 'garage', icone: 'garage' },
  ];
  /** le type de pièce posé d'un clic (null : on demande le nom) */
  let typePiece: string | null = null;
  function choisirTypePiece(libelle: string) {
    const t = TYPES_PIECES.find(x => x.libelle === libelle)!;
    /* une pièce choisie prend ce type tout de suite */
    const o = selection ? niveau().objects[selection] : undefined;
    if (o?.type === 'room') { faire('Pièce : ' + libelle, [{ type: 'modifierPiece', id: o.id, nom: nomLibre(libelle, o.id), usage: t.usage, humide: !!t.humide }]); return }
    typePiece = libelle; choisir('piece');
  }
  /** « Chambre », puis « Chambre 2 », « Chambre 3 »… sur le niveau */
  function nomLibre(libelle: string, sauf?: string): string {
    const pris = new Set(Object.values(niveau().objects).flatMap(o => (o.type === 'room' && o.id !== sauf ? [o.name] : [])));
    if (!pris.has(libelle)) return libelle;
    for (let i = 2; ; i++) if (!pris.has(libelle + ' ' + i)) return libelle + ' ' + i;
  }
  function basculerCotation(oui = !cotation) {
    cotation = oui;
    try { localStorage.setItem('cpDesigner:cotation', oui ? 'oui' : 'non') } catch { /* navigation privée : le choix vaut pour la séance */ }
    barreOutils(); panneaux(); dessinerBientot();
  }
  function basculerEquerre(oui = !outils.reglages.equerre) {
    const e = outils.basculerEquerre(oui);
    try { localStorage.setItem('cpDesigner:equerre', oui ? 'oui' : 'non') } catch { /* le choix vaut pour la séance */ }
    if (e.aide) toast(e.aide);
    panneaux();
  }
  /** redresser à l'équerre les murs presque d'équerre : ceux qu'on cite, ou tout le niveau */
  function mettreDEquerre(murs?: string[]) {
    const e = equerrer(niveau(), murs);
    const n = e.redresses.length;
    if (faire('Mettre d’équerre', [{ type: 'equerrerMurs', niveau: niveauId, ...(murs ? { murs } : {}) }]))
      toast(n + ' mur' + (n > 1 ? 's redressés' : ' redressé') + ' à l’équerre' + (e.orientation ? ' (repère tourné de ' + (e.orientation * 180 / Math.PI).toFixed(1).replace('.', ',') + '°)' : '') + ' — Ctrl+Z pour revenir');
  }
  function basculerGrille() { outils.reglages.grille = outils.reglages.grille ? 0 : 100; toast(outils.reglages.grille ? 'Grille d’accrochage : 10 cm' : 'Grille d’accrochage coupée'); panneaux() }
  function cadrerTout() {
    const pts: Point[] = [];
    for (const w of mursDroits(niveau())) pts.push(w.axis.a, w.axis.b);
    if (pts.length) cam = cadrer(cam, boiteAnneau(pts), en3D ? 14 : cotation ? 110 : 60);        // la place des cotes autour (l'aperçu n'en a pas)
    dessinerBientot();
  }

  /* ---------- en-tête ---------- */
  const nom = $<HTMLInputElement>('input.nom');
  nom.onchange = () => { if (!faire('Renommer le projet', [{ type: 'renommerProjet', nom: nom.value }])) nom.value = h.projet.name };
  $<HTMLButtonElement>('.annuler').onclick = annuler;
  $<HTMLButtonElement>('.retablir').onclick = retablir;
  $<HTMLButtonElement>('.cmdk').onclick = () => palette();
  $<HTMLButtonElement>('.b3d').onclick = () => void basculer3D();
  apercuBoite.querySelector<HTMLElement>('.attrape')!.onclick = () => { if (!en3D && onglet === 'studio') ouvrirOnglet('trace'); void basculer3D() };
  /* barre du bas : tableau des surfaces, zoom, tout voir ; en-tête : aide, plein écran */
  const zoomCentre = (k: number) => { cam = zoomer(cam, k, { x: cam.largeur / 2, y: cam.hauteur / 2 }); dessinerBientot() };
  $<HTMLButtonElement>('.bzoomp').onclick = () => zoomCentre(1.25);
  $<HTMLButtonElement>('.bzoomm').onclick = () => zoomCentre(0.8);
  $<HTMLButtonElement>('.bcadrer').onclick = () => cadrerTout();
  $<HTMLButtonElement>('.bplein').onclick = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => toast('Plein écran refusé par le navigateur', true)) };
  $<HTMLButtonElement>('.baide').onclick = () => afficherRapport('Aide',
    `<p><b>Tracer</b> : onglet Tracé → Murs, choisissez le type de mur et sa composition, puis cliquez chaque angle (les murs s’aimantent à l’équerre ; Q : libre). Tapez une longueur au clavier (4,50 puis Entrée ; 4,50<90 pour un angle ; 10x8 pour un rectangle).</p>
     <p><b>Poser</b> : onglets Ouvrant et Produit, une catégorie du catalogue (à gauche), un modèle, puis un clic sur le plan — ou glissez-le.</p>
     <p><b>Modifier</b> : cliquez un objet ; son panneau est à droite. Tirez une extrémité, un mur, une ouverture pour la déplacer.</p>
     <p><b>Raccourcis</b> : V sélection · M mur extérieur · J mur intérieur · C cloison · U cloison fictive · R rectangle · O ouvrant · B mobilier · E escalier · P pièce · D cote · K coupe · 3 permuter plan / 3D · F tout voir · G grille · Ctrl+Z / Ctrl+Maj+Z · Ctrl+C / V / D · Ctrl+K toutes les actions · Espace + glisser : déplacer la vue.</p>`);
  let tableauSurfaces = false;
  $<HTMLButtonElement>('.bsurf').onclick = () => { tableauSurfaces = !tableauSurfaces; majTableauSurfaces() };
  /** le tableau des surfaces du niveau, au-dessus du plan (comme on l'ouvre en bas à gauche) */
  function majTableauSurfaces() {
    main.querySelector('.tableau-surfaces')?.remove();
    $<HTMLButtonElement>('.bsurf').classList.toggle('actif', tableauSurfaces);
    if (!tableauSurfaces) return;
    const f = niveau(), plan = planDuNiveau(f), Z = plan.zones;
    const d = document.createElement('div'); d.className = 'tableau-surfaces';
    const S = surfacesReglementaires(h.projet);
    d.innerHTML = `<b>${esc(f.name)} — surfaces entre murs</b><table>${Z.map(z => `<tr><td>${esc(z.piece ? z.piece.name : 'À nommer')}</td><td>${m2(z.aire)}</td></tr>`).join('')}
      <tr><td><b>Total</b></td><td><b>${m2(Z.reduce((t, z) => t + z.aire, 0))}</b></td></tr></table>
      <div style="margin-top:8px;font-size:12px;color:#BDBDBD">Projet : surface de plancher <b style="color:#fff">${m2(S.surfacePlancher)}</b> · habitable <b style="color:#fff">${m2(S.habitable)}</b> · emprise ${m2(S.emprise)}</div>`;
    main.appendChild(d);
  }
  /** la boussole du plan : le nord de la parcelle (sinon le haut du plan) */
  function boussole() {
    const t = parcelleDuProjet(h.projet), a = t ? -t.plot.north * 180 / Math.PI : 0;
    $<SVGSVGElement>('svg.boussole').innerHTML = `<g transform="rotate(${a.toFixed(1)} 32 44)" font-family="Segoe UI,system-ui" font-size="11" font-weight="700" fill="#222" text-anchor="middle">
      <circle cx="32" cy="44" r="19" fill="rgba(255,255,255,.85)" stroke="#222" stroke-width="1.5"/>
      <path d="M32 27 L37 44 L32 61 L27 44 Z" fill="#fff" stroke="#222" stroke-width="1.2"/><path d="M32 27 L37 44 L27 44 Z" fill="#222"/>
      <text x="32" y="20">N</text><text x="32" y="78">S</text><text x="58" y="48">E</text><text x="6" y="48">O</text></g>`;
  }
  /* Affichages : ce que montre le plan (préférences de cet appareil) */
  $<HTMLButtonElement>('.baff').onclick = e => {
    const hote = (e.currentTarget as HTMLElement).parentElement!;
    const deja = hote.querySelector('.affichages');
    if (deja) { deja.remove(); return }
    const m = document.createElement('div'); m.className = 'affichages';
    const c = (libelle: string, val: boolean, f: (v: boolean) => void) => {
      const l = document.createElement('label'); l.innerHTML = '<input type="checkbox"' + (val ? ' checked' : '') + '> ' + esc(libelle);
      l.querySelector('input')!.onchange = ev => f((ev.target as HTMLInputElement).checked); m.appendChild(l);
    };
    c('Cotation automatique', cotation, v => basculerCotation(v));
    c('Sols en couleur (présentation)', solsCouleur, v => basculerSols(v));
    c('Grille d’accrochage (10 cm)', outils.reglages.grille > 0, v => { outils.reglages.grille = v ? 100 : 0; panneaux() });
    c('Murs d’équerre au tracé (Q)', outils.reglages.equerre, v => basculerEquerre(v));
    c('Aimant sur le fond (traits du plan importé)', aimantFond, v => basculerAimant(v));
    hote.appendChild(m);
    const fermer = (ev: MouseEvent) => { if (!hote.contains(ev.target as Node)) { m.remove(); window.removeEventListener('pointerdown', fermer) } };
    setTimeout(() => window.addEventListener('pointerdown', fermer));
  };
  $<HTMLButtonElement>('.bpdf').onclick = () => void exporterPdf();
  $<HTMLButtonElement>('.bdxf').onclick = () => void exporterDxf();
  const selNiv = $<HTMLSelectElement>('select.niveaux');
  selNiv.onchange = () => { niveauId = selNiv.value; selection = null; apres() };

  /* ---------- panneaux ---------- */
  function panneaux() {
    if (document.activeElement !== nom) nom.value = h.projet.name;
    selNiv.innerHTML = niveaux().map(f => `<option value="${f.id}" ${f.id === niveauId ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
    $<HTMLButtonElement>('.annuler').disabled = !peutAnnuler(h);
    $<HTMLButtonElement>('.retablir').disabled = !peutRetablir(h);
    const f = niveau(), o = selection ? f.objects[selection] : undefined;
    aside.innerHTML = '';
    const S = sousCourant();
    /* le bandeau du panneau : ce qu'il montre */
    const TYPES: Record<string, [string, string]> = { wall: ['murs', 'Mur'], opening: ['ouvrant', 'Ouvrant'], room: ['piece', 'Pièce'], dimension: ['cote', 'Cote'], underlay: ['fond', 'Fond'],
      furniture: ['produit', 'Produit'], stair: ['escalier', 'Escalier'], section: ['coupe', 'Coupe'], roof_window: ['fenetre_toit', 'Fenêtre de toit'], dormer: ['lucarne_gable', 'Lucarne'], viewpoint: ['point_de_vue', 'Point de vue'],
      landscape: ['exterieur', 'Aménagement'], plot: ['parcelle', 'Terrain'], constraint: ['equerre', 'Contrainte'], roof: ['toit', 'Toit'],
      platform: ['plateforme', 'Plateforme'], network: ['reseau', 'Réseau'], network_item: ['regard', 'Équipement'], tree: ['arbre', 'Arbre'], column: ['poteau', 'Poteau'], beam: ['poutre', 'Poutre'] };
    const [ic, lib] = en3D ? ['vue3d', 'Vue 3D'] : groupe.length ? ['tout', 'Sélection'] : o ? TYPES[o.type] ?? ['trace', 'Objet']
      : outils.outil === 'ouverture' ? ['ouvrant', 'Ouvrant'] : outils.outil === 'mobilier' ? ['produit', 'Produit'] : outils.outil === 'escalier' ? ['escalier', 'Escalier']
      : outils.outil === 'amenagement' ? ['exterieur', 'Extérieur'] : S.panneau ? [S.icone, S.libelle] : ['niveaux', 'Niveau'];
    aside.insertAdjacentHTML('beforeend', `<div class="entete-panneau">${icone(ic, 18)}<span>${esc(lib)}</span></div>`);
    if (en3D) panneau3D(); else if (groupe.length) panneauGroupe(f); else if (o) inspecteur(f, o);
    else if (outils.outil === 'ouverture') panneauOuverture(); else if (outils.outil === 'mobilier') panneauMobilier();
    else if (outils.outil === 'escalier') panneauEscalier(f); else if (outils.outil === 'amenagement') panneauAmenagement();
    else if (S.panneau) S.panneau(f); else panneauNiveau(f);
  }

  /** un champ de l'inspecteur */
  function champ(libelle: string, valeur: string | number, change: (v: string) => void, type = 'text', options?: Record<string, string>): HTMLElement {
    const l = document.createElement('label');
    l.innerHTML = `<span>${esc(libelle)}</span>`;
    let x: HTMLInputElement | HTMLSelectElement;
    if (options) {
      x = document.createElement('select');
      x.innerHTML = Object.entries(options).map(([k, v]) => `<option value="${k}" ${k === String(valeur) ? 'selected' : ''}>${esc(v)}</option>`).join('');
    } else { x = document.createElement('input'); x.type = type; x.value = String(valeur); if (type === 'number') x.step = 'any' }
    if (x instanceof HTMLInputElement && type === 'checkbox') { x.checked = !!valeur; x.onchange = () => change(x.checked ? '1' : '') }
    else x.onchange = () => change(x.value);
    l.appendChild(x);
    return l;
  }
  const titre = (t: string) => { const e = document.createElement('h3'); e.textContent = t; return e };
  const bloc = (html: string, cls = 'note') => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; return e };
  const bouton = (t: string, f: () => void, cls = '') => { const b = document.createElement('button'); b.textContent = t; b.className = cls; b.onclick = f; return b };
  const ligne = (...b: HTMLElement[]) => { const e = document.createElement('div'); e.className = 'ligne'; e.append(...b); return e };
  const mm = (v: string) => Math.round(Number(String(v).replace(',', '.')) * 1000);       // saisie en mètres → mm
  const ent = (v: string) => Number(String(v).replace(',', '.'));

  function provenance(o: BuildingObject): HTMLElement {
    const S = o.sourceRefs.slice(-3).reverse();
    const e = bloc('<b>Provenance</b><br>' + S.map(s => esc(s.label) + ' — ' + esc(s.by ?? '') + ' — ' + date(s.at)).join('<br>') + (o.sourceRefs.length > 3 ? '<br>…' : ''));
    /* un objet importé dit ce qui reste à vérifier, et ce que le plan source écrivait (règle 4) */
    const m = (o.meta ?? {}) as { aVerifier?: string[]; surfaceLue?: number };
    if (o.status === 'to_check' || m.aVerifier?.length) e.insertAdjacentHTML('beforeend', '<div class="alerte" style="margin-top:6px">⚠️ À vérifier' + (m.aVerifier?.length ? ' :<br>' + m.aVerifier.map(esc).join('<br>') : '') + '</div>');
    if (typeof m.surfaceLue === 'number') e.insertAdjacentHTML('beforeend', '<div class="note">Surface écrite sur le plan source : ' + m.surfaceLue.toFixed(2).replace('.', ',') + ' m²</div>');
    return e;
  }

  function inspecteur(f: Floor, o: BuildingObject) {
    const A = aside;
    const plan = planDuNiveau(f);
    switch (o.type) {
      case 'wall': {
        const w = o as MurDroit, L = distance(w.axis.a, w.axis.b), g = genreDuRole(w.role), k = compositionMur(w.compositionRef);
        A.append(titre(ROLES[w.role]),
          champ('Longueur (m)', (L / 1000).toFixed(3), v => longueurMur(w, mm(v)), 'number'),
          champ('Type', w.role, v => faire('Type de mur', [{ type: 'modifierMur', id: w.id, role: v as Wall['role'] }]), 'text', ROLES));
        if (w.role === 'virtual') {
          A.append(bloc('Une limite de pièce sans mur (cuisine ouverte sur le séjour, par exemple) : elle sépare les surfaces au plan, sans matière — ni 3D, ni ouverture, ni cote.'),
            titre('Objet'), provenance(w), ligne(bouton('Supprimer', () => supprimer(w.id), 'dang')));
          break;
        }
        A.append(champ('Composition', w.compositionRef ?? '', v => faire('Composition', [{ type: 'modifierMur', id: w.id, composition: v || null }]), 'text',
          { '': 'Sur mesure', ...Object.fromEntries((g ? compositionsDu(g) : []).map(x => [x.id, x.libelle + ' (' + epaisseurComposition(x) / 10 + ' cm)'])) }));
        if (k) {
          const c = document.createElement('div'); c.className = 'couches-mur';
          c.innerHTML = k.couches.map(x => `<div><i style="background:${MATIERES_COUCHES[x.matiere].couleur}"></i><span style="flex:1">${esc(MATIERES_COUCHES[x.matiere].libelle)}</span><span class="note">${(x.epaisseur / 10).toLocaleString('fr-FR')} cm</span></div>`).join('');
          A.append(c, bloc(w.role === 'exterior' ? 'De l’extérieur (en haut) vers l’intérieur. Épaisseurs d’usage, à confirmer par l’étude thermique et le descriptif.' : 'D’une face à l’autre. Épaisseurs d’usage, à confirmer au descriptif.'));
        }
        A.append(champ('Épaisseur (cm)', w.thickness / 10, v => faire('Épaisseur', [{ type: 'modifierMur', id: w.id, epaisseur: ent(v) * 10 }]), 'number'),
          champ('Hauteur (m)', (w.height / 1000).toFixed(2), v => faire('Hauteur', [{ type: 'modifierMur', id: w.id, hauteur: mm(v) }]), 'number'),
          champ('Tracé', w.justification, v => faire('Justification', [{ type: 'modifierMur', id: w.id, justification: v as Wall['justification'] }]), 'text', JUSTIFS));
        if (w.role === 'exterior') A.append(
          champ('Parement extérieur', w.finish ?? '', v => faire('Parement', [{ type: 'modifierMur', id: w.id, finition: v || null }]), 'text', OPTIONS_PAREMENTS),
          ligne(bouton('Ce parement sur toutes les façades', () => parementPartout(w.finish ?? null))));
        /* règle 5 : jamais « porteur » confirmé sans document */
        A.append(bloc('⚠️ Porteur : <b>' + (w.loadBearing.value ? 'oui' : 'non') + '</b> — à contrôler' + (w.loadBearing.missing ? ' (manque : ' + esc(w.loadBearing.missing) + ')' : ''), 'alerte'));
        A.append(titre('Contraintes'));
        const K = Object.values(f.objects).filter(x => x.type === 'constraint' && x.walls.includes(w.id));
        if (K.length) A.append(ligne(...K.map(k => {
          const c = document.createElement('span'); c.className = 'chip';
          c.textContent = CONTRAINTES[k.type === 'constraint' ? k.kind : ''] ?? '';
          c.appendChild(bouton('✕', () => faire('Retirer une contrainte', [{ type: 'supprimer', id: k.id }])));
          return c;
        })));
        const ct = (g: 'horizontal' | 'vertical' | 'length' | 'angle') => bouton(CONTRAINTES[g]!, () => faire('Contrainte : ' + CONTRAINTES[g], [{ type: 'ajouterContrainte', niveau: niveauId, genre: g, murs: [w.id] }]));
        const deux = (g: 'parallel' | 'perpendicular') => bouton(CONTRAINTES[g]! + ' à…', () => {
          choixMur = { libelle: 'Cliquez le mur auquel « ' + CONTRAINTES[g] + ' » se rapporte (Échap pour renoncer)', faire: id => faire('Contrainte : ' + CONTRAINTES[g], [{ type: 'ajouterContrainte', niveau: niveauId, genre: g, murs: [id, w.id] }]) };
          barreOutils();
        });
        A.append(ligne(ct('horizontal'), ct('vertical'), ct('length'), ct('angle'), deux('parallel'), deux('perpendicular')));
        A.append(titre('Équerre'), ligne(bouton('Mettre ce mur d’équerre', () => mettreDEquerre([w.id])), bouton('Tout le niveau', () => mettreDEquerre())),
          bloc('Redresse à 90° les murs qui en sont à moins de ' + Math.round(ANGLE_EQUERRE * 180 / Math.PI) + '° ; les angles restent fermés, les cloisons suivent.', 'note'));
        A.append(titre('Objet'), provenance(w), ligne(bouton('Supprimer', () => supprimer(w.id), 'dang')));
        break;
      }
      case 'opening': {
        const op = o as Opening, b = plan.baies.find(x => x.id === op.id);
        const genres = Object.fromEntries(Object.entries(OUVERTURES).map(([k, v]) => [k, v.libelle]));
        const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierOuverture' }>>) => faire(t, [{ type: 'modifierOuverture', id: op.id, ...c }]);
        const mo = manoeuvreDe(op);
        const modeles = { '': '— sur mesure —', ...Object.fromEntries(MODELES_OUVERTURES.map(m => [m.id, m.libelle])) };
        A.append(titre(op.catalogRef?.label ?? OUVERTURES[op.kind].libelle),
          champ('Modèle', op.catalogRef && modeleOuverture(op.catalogRef.id) && memesCotes(op, modeleOuverture(op.catalogRef.id)!) ? op.catalogRef.id : '', v => {
            const m = modeleOuverture(v);
            if (m) mod('Modèle : ' + m.libelle, { genre: m.genre, largeur: m.largeur, hauteur: m.hauteur, allege: m.allege, vantaux: m.vantaux, manoeuvre: m.manoeuvre, modele: { id: m.id, label: m.libelle } });
          }, 'text', modeles),
          champ('Genre', op.kind, v => mod('Genre', { genre: v as Opening['kind'] }), 'text', genres),
          champ('Vantaux', mo.vantaux, v => mod('Vantaux', { vantaux: Number(v) }), 'text', { 1: '1', 2: '2', 3: '3', 4: '4' }),
          champ('Manœuvre', mo.manoeuvre, v => mod('Manœuvre', { manoeuvre: v as NonNullable<Opening['operation']> }), 'text', MANOEUVRES),
          /* le volet : « VR » devant la baie sur le plan, et dans la légende */
          ...(op.kind === 'window' || op.kind === 'french_window' || op.kind === 'bay'
            ? [champ('Volet', op.shutter ?? '', v => mod('Volet', { volet: (v || null) as Opening['shutter'] | null }), 'text', { '': '— aucun —', roller_motorized: 'Volet roulant motorisé', roller_manual: 'Volet roulant manuel', hinged: 'Volets battants' })] : []),
          champ('Largeur (m)', (op.width / 1000).toFixed(3), v => mod('Largeur', { largeur: mm(v) }), 'number'),
          champ('Hauteur (m)', (op.height / 1000).toFixed(3), v => mod('Hauteur', { hauteur: mm(v) }), 'number'),
          champ('Allège (m)', (op.sill / 1000).toFixed(3), v => mod('Allège', { allege: mm(v) }), 'number'),
          champ('Axe depuis l’origine du mur (m)', (op.offset / 1000).toFixed(3), v => mod('Position', { position: mm(v) }), 'number'));
        /* placer par les distances aux murs voisins, comme on les lit sur le plan (en rouge) */
        const pl = placeOuverture(f, op.id);
        if (pl) {
          const D = (['avant', 'apres'] as const).map((c, i) => champ('Distance ' + pl.libelles[i] + ' (m)', ((c === 'avant' ? pl.avant : pl.apres) / 1000).toFixed(3),
            v => mod('Position', { position: Math.round(positionPour(pl, c, mm(v))) }), 'number'));
          /* toujours la gauche (ou le bas) en premier, quel que soit le sens du mur */
          A.append(...(pl.libelles[0] === 'à droite' || pl.libelles[0] === 'en haut' ? D.reverse() : D));
        }
        if (op.kind === 'door' || op.kind === 'french_window') {
          const s = op.swing ?? { side: 'left', inward: true };
          A.append(ligne(bouton('Charnière ⇄', () => mod('Sens', { sens: { ...s, side: s.side === 'left' ? 'right' : 'left' } })), bouton('Tirant / poussant ⇅', () => mod('Sens', { sens: { ...s, inward: !s.inward } }))));
        }
        if (b) A.append(bloc('Tableau : ' + m2(b.surface) + '<br>Entre : ' + esc(b.cotes[0]) + ' / ' + esc(b.cotes[1]) + (b.exterieure ? '<br><b>Baie extérieure</b>' : '')));
        A.append(titre('Objet'), provenance(op), ligne(bouton('Supprimer', () => supprimer(op.id), 'dang')));
        break;
      }
      case 'room': {
        const z = plan.zones.find(z => z.piece?.id === o.id);
        A.append(titre('Pièce'),
          champ('Nom', o.name, v => faire('Nom de pièce', [{ type: 'modifierPiece', id: o.id, nom: v }])),
          champ('Usage', o.usage, v => faire('Usage', [{ type: 'modifierPiece', id: o.id, usage: v as RoomUsage }]), 'text', USAGES),
          champ('Pièce humide', o.wet ? 1 : 0, v => faire('Pièce humide', [{ type: 'modifierPiece', id: o.id, humide: !!v }]), 'checkbox'),
          champ('Sol', o.floorFinish ?? '', v => faire('Sol', [{ type: 'modifierPiece', id: o.id, sol: v || null }]), 'text', OPTIONS_SOLS),
          ligne(bouton('Ce sol dans toutes les pièces du niveau', () => solPartout(o.floorFinish ?? null, f))),
          champ('Murs (peinture, faïence)', o.wallFinish ?? '', v => faire('Peinture', [{ type: 'modifierPiece', id: o.id, murs: v || null }]), 'text', OPTIONS_PEINTURES),
          ligne(bouton('Cette peinture dans toutes les pièces du niveau', () => peinturePartout(o.wallFinish ?? null, f))),
          bloc(z ? 'Surface entre murs : <b>' + m2(z.aire) + '</b><br>Périmètre : ' + m(z.perimetre) + '<br><span class="note">Surface intérieure brute ; les surfaces réglementaires sont au panneau du niveau.</span>' : 'Pièce non fermée : son point n’est dans aucun espace clos.', z ? 'note' : 'alerte'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'dimension': {
        const d = dessinCote(f, o);
        A.append(titre(o.driving ? 'Cote motrice' : 'Cote'),
          champ('Valeur (m)', d ? (d.valeur / 1000).toFixed(3) : '', v => faire('Cote', [{ type: 'modifierCote', id: o.id, valeur: mm(v), motrice: true }]), 'number'),
          champ('Motrice (pilote les murs)', o.driving ? 1 : 0, v => faire(v ? 'Cote motrice' : 'Cote libre', [{ type: 'modifierCote', id: o.id, motrice: !!v }]), 'checkbox'),
          champ('Décalage (m)', (o.offset / 1000).toFixed(2), v => faire('Décalage de cote', [{ type: 'modifierCote', id: o.id, decalage: mm(v) }]), 'number'),
          bloc(o.driving ? 'Modifier la valeur déplace le second mur coté ; la cote reste vraie ensuite.' : 'Saisir une valeur rend la cote motrice.'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'underlay': {
        A.append(titre('Fond calé'), bloc(esc(o.name ?? 'Fond') + (o.page ? ' — page ' + o.page : '') + '<br>Échelle : ' + o.transform.scale.toPrecision(4) + ' mm par unité'),
          champ('Opacité', Math.round(o.opacity * 100), v => faire('Opacité du fond', [{ type: 'modifierFond', id: o.id, opacite: ent(v) / 100 }]), 'range'),
          champ('Verrouillé', o.locked ? 1 : 0, v => faire(v ? 'Verrouiller le fond' : 'Déverrouiller le fond', [{ type: 'modifierFond', id: o.id, verrouille: !!v }]), 'checkbox'),
          ligne(bouton('Caler par deux points…', () => { if (o.locked) toast('Déverrouillez le fond pour le caler', true); else { effet(outils.choisir('caler')); barreOutils() } })),
          bloc('Cliquez deux points du fond dont vous connaissez la distance (une cote du plan), puis saisissez-la.'),
          titre('Objet'), provenance(o), ligne(bouton('Retirer le fond', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'furniture': {
        const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierMeuble' }>>) => faire(t, [{ type: 'modifierMeuble', id: o.id, ...c }]);
        const deg = Math.round(((o.rotation * 180 / Math.PI) % 360 + 360) % 360 * 10) / 10;
        A.append(titre(o.catalogRef.label),
          champ('Largeur (m)', (o.width / 1000).toFixed(3), v => mod('Largeur', { largeur: mm(v) }), 'number'),
          champ('Profondeur (m)', (o.depth / 1000).toFixed(3), v => mod('Profondeur', { profondeur: mm(v) }), 'number'),
          champ('Hauteur (m)', (o.height / 1000).toFixed(3), v => mod('Hauteur', { hauteur: mm(v) }), 'number'),
          champ('Orientation (°)', deg, v => mod('Orientation', { rotation: ent(v) * Math.PI / 180 }), 'number'),
          ligne(bouton('Tourner de 90° (T)', () => mod('Tourner', { rotation: o.rotation + Math.PI / 2 })),
            bouton('Dupliquer', () => {
              const avant = new Set(Object.keys(niveau().objects));
              if (faire('Dupliquer : ' + o.catalogRef.label, [{ type: 'creerMeuble', niveau: niveauId, modele: o.catalogRef, position: { x: o.position.x + 300, y: o.position.y - 300 }, rotation: o.rotation, largeur: o.width, profondeur: o.depth, hauteur: o.height }])) {
                selection = Object.keys(niveau().objects).find(k => !avant.has(k)) ?? null; panneaux();
              }
            })),
          bloc('Tirez le meuble pour le déplacer : près d’un mur, il s’y plaque (Alt : librement).'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'stair': {
        const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierEscalier' }>>) => faire(t, [{ type: 'modifierEscalier', id: o.id, ...c }]);
        const g = geometrieEscalier(o, hauteurAFranchir(h.projet, f));
        const deg = Math.round(((o.rotation * 180 / Math.PI) % 360 + 360) % 360 * 10) / 10;
        const dims = (P: Point[]) => { const xs = P.map(p => p.x), ys = P.map(p => p.y); return m(Math.max(...xs) - Math.min(...xs)) + ' × ' + m(Math.max(...ys) - Math.min(...ys)) };
        A.append(titre('Escalier — ' + ESCALIERS[o.kind]),
          champ('Forme', o.kind, v => mod('Forme de l’escalier', { genre: v as Stair['kind'] }), 'text', ESCALIERS),
          champ('Largeur (m)', (o.width / 1000).toFixed(2), v => mod('Largeur de l’escalier', { largeur: mm(v) }), 'number'),
          champ('Giron (cm, vide : calculé)', o.going ? o.going / 10 : '', v => mod('Giron', { giron: String(v).trim() ? Math.round(ent(v) * 10) : null }), 'number'),
          champ('Sens de la montée (°)', deg, v => mod('Orientation', { rotation: ent(v) * Math.PI / 180 }), 'number'),
          ligne(bouton('Tourner de 90° (T)', () => mod('Tourner l’escalier', { rotation: o.rotation + Math.PI / 2 }))),
          bloc(resumeEscalier(f, g) + '<br>Emprise : ' + dims(g.emprise) + (g.tremie ? '<br>Trémie à l’étage : ' + dims(g.tremie) + ' (échappée de 2,00 m, plancher de 20 cm pris par défaut)' : '')));
        for (const a of g.alertes) A.append(bloc('⚠️ ' + esc(a), 'alerte'));
        A.append(bloc('Tirez l’escalier pour le déplacer. Repères d’usage (Blondel, échappée) : à confirmer avec le fabricant et selon le projet.'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'section': {
        const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierCoupe' }>>) => faire(t, [{ type: 'modifierCoupe', id: o.id, ...c }]);
        A.append(titre('Coupe ' + o.name + '-' + o.name),
          champ('Nom', o.name, v => mod('Nom de la coupe', { nom: v })),
          bloc('Trait de ' + m(distance(o.a, o.b)) + ' · regard ' + (o.look === 'left' ? 'à gauche' : 'à droite') + ' du trait (en allant du départ à l’arrivée)'),
          ligne(bouton('Inverser le regard (T)', () => mod('Inverser le regard de la coupe', { regard: o.look === 'left' ? 'right' : 'left' })), bouton('PDF des coupes', () => void exporterCoupes(), 'prim')));
        A.append(bloc(apercuCoupe(ligneDe(o)), 'apercu-coupe'),
          bloc('Les flèches montrent ce que la coupe regarde. Le plan de coupe prolonge le trait de part en part du bâtiment. Tirez le trait pour le déplacer. Le trait se voit sur tous les niveaux et dans le PDF ; il se choisit sur le niveau où il a été tracé.'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'roof_window': {
        const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierFenetreToit' }>>) => faire(t, [{ type: 'modifierFenetreToit', id: o.id, ...c }]);
        const g = geometrieFenetreToit(niveau(), o), taille = o.width + 'x' + o.height;
        const tailles = Object.fromEntries(TAILLES_FENETRE_TOIT.map(([l, hh]) => [l + 'x' + hh, (l / 10) + ' × ' + (hh / 10) + ' cm']));
        A.append(titre('Fenêtre de toit'),
          champ('Taille courante', tailles[taille] ? taille : '', v => { const [l, hh] = v.split('x').map(Number); if (l && hh) mod('Taille de la fenêtre de toit', { largeur: l, hauteur: hh }) }, 'text',
            { '': 'Autre (ci-dessous)', ...tailles }),
          champ('Largeur (cm)', o.width / 10, v => mod('Largeur de la fenêtre de toit', { largeur: Math.round(Number(v.replace(',', '.')) * 10) }), 'number'),
          champ('Hauteur dans la pente (cm)', o.height / 10, v => mod('Hauteur de la fenêtre de toit', { hauteur: Math.round(Number(v.replace(',', '.')) * 10) }), 'number'),
          bloc(g.ok ? 'Sur un pan de ' + g.geo.pente.toFixed(0) + '° ; en plan, ' + m(o.width) + ' × ' + m(o.height * Math.cos(g.geo.pente * Math.PI / 180)) + ' (la hauteur se raccourcit avec la pente).'
            : '⚠️ ' + esc(g.raison), g.ok ? 'note' : 'alerte'),
          bloc('Tirez-la pour la déplacer sur le pan. Dimensions de châssis courantes, sans marque : « ou équivalent » au descriptif.'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'dormer': {
        const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierLucarne' }>>) => faire(t, [{ type: 'modifierLucarne', id: o.id, ...c }]);
        const g = geometrieLucarne(niveau(), o), cmEnMm = (v: string) => Math.round(Number(v.replace(',', '.')) * 10);
        A.append(titre('Lucarne'),
          champ('Genre', o.kind, v => mod('Genre de lucarne', { genre: v as Dormer['kind'] }), 'text', LUCARNES),
          champ('Largeur (cm)', o.width / 10, v => mod('Largeur de la lucarne', { largeur: cmEnMm(v) }), 'number'),
          champ('Hauteur de façade (cm)', o.height / 10, v => mod('Hauteur de la lucarne', { hauteur: cmEnMm(v) }), 'number'),
          champ('Pente de sa toiture (°)', o.pitch, v => mod('Pente de la lucarne', { pente: Number(v.replace(',', '.')) }), 'number'),
          champ('Fenêtre : largeur (cm)', o.windowWidth / 10, v => mod('Fenêtre de la lucarne', { fenetreLargeur: cmEnMm(v) }), 'number'),
          champ('Fenêtre : hauteur (cm)', o.windowHeight / 10, v => mod('Fenêtre de la lucarne', { fenetreHauteur: cmEnMm(v) }), 'number'),
          bloc(g.ok ? 'Façade de ' + m(g.geo.z0) + ' (pied, sur le toit) à ' + m(g.geo.zf) + ' (égout)' + (o.kind !== 'shed' ? ', faîtage à ' + m(g.geo.zr) : ', haut à ' + m(g.geo.zr)) + ' depuis le ±0,00 ; couverture ' + m2(g.geo.surfaceCouverture) + '.'
            : '⚠️ ' + esc(g.raison), g.ok ? 'note' : 'alerte'),
          bloc('Tirez-la pour la déplacer sur le pan. Ossature, habillage des jouées et fenêtre : à préciser au projet.'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'viewpoint': {
        const deg = Math.round(((90 - Math.atan2(o.b.y - o.a.y, o.b.x - o.a.x) * 180 / Math.PI) % 360 + 360) % 360);
        A.append(titre('Point de prise de vue — ' + o.piece),
          champ('Photographie du dossier', o.piece, v => faire('Pièce du point de vue', [{ type: 'modifierPointDeVue', id: o.id, piece: v as Viewpoint['piece'] }]), 'text',
            { 'PCMI 6': 'PCMI 6 — insertion (photomontage)', 'PCMI 7': 'PCMI 7 — environnement proche', 'PCMI 8': 'PCMI 8 — environnement lointain' }),
          bloc('Direction : ' + deg + '° depuis le haut du plan (sens horaire)' + (parcelleDuProjet(h.projet) ? '' : ' · le nord se règle sur la parcelle')),
          bloc('Le formulaire du permis demande de reporter au plan de masse (PCMI 2) d’où chaque photographie a été prise, et vers où. Le point de vue y figure, avec sa pièce ; tirez-le pour le déplacer.'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'landscape': {
        const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierAmenagement' }>>) => faire(t, [{ type: 'modifierAmenagement', id: o.id, ...c }]);
        const fin = finitionAmenagement(o.finish), b = bilanAmenagements(h.projet).find(x => x.id === o.id);
        A.append(titre(GENRES_AMENAGEMENT[o.kind].libelle + (fin ? ' — ' + fin.libelle : '')),
          champ('Aspect', o.finish, v => mod('Aspect', { finition: v }), 'text', Object.fromEntries(finitionsDe(o.kind).map(x => [x.id, x.libelle]))));
        if (o.kind === 'fence') A.append(champ('Hauteur (m)', (o.height / 1000).toFixed(2), v => mod('Hauteur de clôture', { hauteur: mm(v) }), 'number'),
          champ('Fermée (revient au premier point)', o.closed ? 1 : 0, v => mod('Clôture fermée', { ferme: !!v }), 'checkbox'));
        if (o.kind === 'terrace') A.append(champ('Niveau fini sous le ±0,00 (cm)', o.height / 10, v => mod('Niveau de terrasse', { hauteur: Math.round(ent(v) * 10) }), 'number'));
        A.append(bloc(b ? (o.kind === 'fence' ? 'Longueur : <b>' + m(b.mesure) + '</b>' : 'Surface : <b>' + m2(b.mesure) + '</b>') : ''),
          bloc('Tirez-le pour le déplacer. Il figure au plan de masse (PCMI 2) et en 3D.'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'plot': {
        const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierParcelle' }>>) => faire(t, [{ type: 'modifierParcelle', id: o.id, ...c }]);
        const E = empriseAuSol(h.projet), R = reculs(o, E), S = surfaceTerrain(o), em = aireEmprise(E);
        const cotes = Object.fromEntries(o.contour.map((_, i) => [String(i), 'Côté ' + (i + 1) + ' (' + m(R[i]?.longueur ?? distance(o.contour[i]!, o.contour[(i + 1) % o.contour.length]!)) + ')']));
        A.append(titre('Parcelle' + (o.reference ? ' ' + o.reference : '')),
          ...(E.length && !maisonDansParcelle(o, E) ? [bloc('⛔ La maison sort de la parcelle : les reculs ne valent rien tant qu’elle n’est pas implantée dedans.', 'alerte')] : []),
          bloc('Terrain : <b>' + m2(S) + '</b><br>Emprise au sol (maçonnerie, débords de toit exclus) : <b>' + m2(em) + '</b>' + (S ? ' · ' + (em / S * 100).toFixed(1).replace('.', ',') + ' % du terrain' : '')),
          champ('Référence cadastrale', o.reference ?? '', v => mod('Référence cadastrale', { reference: v })),
          champ('Nom de la voie', o.streetName ?? '', v => mod('Nom de la voie', { nomVoie: v })),
          champ('Nord (° depuis le haut du plan, sens inverse des aiguilles)', Math.round(o.north * 1800 / Math.PI) / 10, v => mod('Direction du nord', { nord: ent(v) * Math.PI / 180 }), 'number'),
          champ('Altitude NGF du ±0,00 (m)', o.groundFloorNgf ?? '', v => mod('Altitude du RDC', { altitudeRdc: String(v).trim() ? ent(v) : null }), 'number'),
          champ('Terrain fini aux abords (cm par rapport au ±0,00, ex. : −15)', o.finishedGround !== undefined ? o.finishedGround / 10 : '', v => mod('Terrain fini', { terrainFini: String(v).trim() ? Math.round(ent(v) * 10) : null }), 'number'),
          ...pointsCotes(o),
          ...fondCadastralPanneau(o),
          titre('Côtés et reculs (mesurés)'));
        o.contour.forEach((_, i) => {
          const r = R[i];
          A.append(champ('Côté ' + (i + 1) + ' : ' + m(r?.longueur ?? 0) + (r ? ' — recul ' + m(r.distance) : '') + ' · sur voie', o.street.includes(i) ? 1 : 0,
            v => mod('Côté sur voie', { voies: v ? [...o.street, i].sort((x, y) => x - y) : o.street.filter(k => k !== i) }), 'checkbox'));
        });
        /* implanter : la parcelle se place autour de la maison, qui ne bouge pas */
        const imp = { a: String(o.street[0] ?? 0), da: '5', b: String(((o.street[0] ?? 0) + 1) % o.contour.length), db: '3', p: String(o.street[0] ?? 0) };
        A.append(titre('Implanter la maison'),
          champ('Distance au côté', imp.a, v => { imp.a = v }, 'text', cotes), champ('… de (m)', imp.da, v => { imp.da = v }, 'number'),
          champ('et au côté', imp.b, v => { imp.b = v }, 'text', cotes), champ('… de (m)', imp.db, v => { imp.db = v }, 'number'),
          ligne(bouton('Placer', () => {
            const c = placerParcelle(o, E, Number(imp.a), mm(imp.da), Number(imp.b), mm(imp.db));
            if (!c) toast(E.length ? 'Ces deux côtés sont parallèles : prenez un côté sur rue et un côté latéral' : 'Aucun mur : rien à implanter', true);
            else mod('Implanter la maison', { contour: c });
          }, 'prim')),
          champ('Rendre la maison parallèle au côté', imp.p, v => { imp.p = v }, 'text', cotes),
          ligne(bouton('Tourner la parcelle', () => { const r = orienterParcelle(o, Number(imp.p), E); mod('Orienter la parcelle', { contour: r.contour, nord: r.nord }) })),
          bloc('La maison ne bouge pas : c’est la parcelle qui se place autour d’elle (elle tourne avec son nord). Tirez la limite pour la déplacer à la main. Les reculs se mesurent depuis la maçonnerie ; les règles du PLU (reculs, emprise, hauteurs) restent à vérifier.'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'platform': {
        const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierPlateforme' }>>) => faire(t, [{ type: 'modifierPlateforme', id: o.id, ...c }]);
        const t = parcelleDuProjet(h.projet)?.plot ?? null, ngf = t ? altitudePlateforme(t, o) : null, c = t ? cubature(t, o) : null;
        A.append(titre(o.label ?? 'Plateforme'),
          champ('Nom', o.label ?? '', v => mod('Nom de la plateforme', { nom: v.trim() || null })),
          champ('Niveau fini par rapport au ±0,00 (m)', (o.level / 1000).toFixed(2), v => mod('Niveau de la plateforme', { niveauFini: mm(v) }), 'number'),
          champ('Talus : horizontal pour 1 vertical', o.slope, v => mod('Pente du talus', { talus: ent(v) }), 'number', TALUS),
          bloc(ngf !== null ? 'Soit <b>' + ngf.toFixed(2).replace('.', ',') + ' NGF</b>' : 'Altitude NGF : <span class="note">renseignez l’altitude du ±0,00 sur la parcelle</span>'));
        A.append(...blocCubature(c, t));
        A.append(bloc('Tirez-la pour la déplacer. Le talus part de son bord et rejoint le terrain naturel (pente choisie) ; peignes au plan de masse.'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'network': {
        const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierReseau' }>>) => faire(t, [{ type: 'modifierReseau', id: o.id, ...c }]);
        A.append(titre('Réseau — ' + NOMS_RESEAUX[o.kind].libelle),
          champ('Réseau', o.kind, v => mod('Genre du réseau', { genre: v as Network['kind'] }), 'text', Object.fromEntries(Object.entries(NOMS_RESEAUX).map(([k, x]) => [k, x.libelle + ' (' + x.code + ')']))),
          champ('Canalisation (ex. : PVC Ø 100, gaine TPC Ø 63)', o.spec ?? '', v => mod('Canalisation', { spec: v.trim() || null })),
          bloc('Longueur : <b>' + m(longueurReseau(o)) + '</b> · ' + o.points.length + ' points'),
          bloc('Le tracé se fait du branchement (en limite) au bâtiment. Profondeurs, pentes et diamètres : à confirmer par le concessionnaire et l’étude de sol.'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'network_item': {
        const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierEquipement' }>>) => faire(t, [{ type: 'modifierEquipement', id: o.id, ...c }]);
        A.append(titre(NOMS_EQUIPEMENTS[o.kind].libelle),
          champ('Équipement', o.kind, v => mod('Genre de l’équipement', { genre: v as NetworkItem['kind'] }), 'text', Object.fromEntries(Object.entries(NOMS_EQUIPEMENTS).map(([k, x]) => [k, x.libelle]))),
          champ('Repère au plan (sinon ' + NOMS_EQUIPEMENTS[o.kind].code + ')', o.label ?? '', v => mod('Repère', { nom: v.trim() || null })),
          bloc('Tirez-le pour le déplacer. Il figure au plan de masse avec son repère.'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'tree': {
        const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierArbre' }>>) => faire(t, [{ type: 'modifierArbre', id: o.id, ...c }]);
        A.append(titre(ETATS_ARBRES[o.state]),
          champ('État', o.state, v => mod('État de l’arbre', { etat: v as Tree['state'] }), 'text', ETATS_ARBRES),
          champ('Diamètre de la couronne (m)', (o.diameter / 1000).toFixed(1), v => mod('Couronne', { diametre: mm(v) }), 'number'),
          bloc('Tirez-le pour le déplacer. Le formulaire du permis demande de montrer au plan de masse les plantations conservées, supprimées ou créées.'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'column': {
        const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierPoteau' }>>) => faire(t, [{ type: 'modifierPoteau', id: o.id, ...c }]);
        A.append(titre('Poteau ' + MATIERES_STRUCTURE[o.material].toLowerCase()),
          champ('Matière', o.material, v => mod('Matière du poteau', { matiere: v as Column['material'] }), 'text', MATIERES_STRUCTURE),
          champ('Largeur (cm)', o.width / 10, v => mod('Section du poteau', { largeur: Math.round(ent(v) * 10) }), 'number'),
          champ('Profondeur (cm)', o.depth / 10, v => mod('Section du poteau', { profondeur: Math.round(ent(v) * 10) }), 'number'),
          champ('Rotation (°)', Math.round(o.rotation * 1800 / Math.PI) / 10, v => mod('Rotation du poteau', { rotation: ent(v) * Math.PI / 180 }), 'number'),
          bloc('Du sol au plafond du niveau (' + m(f.height) + '). Section à confirmer par l’étude de structure.'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'beam': {
        const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierPoutre' }>>) => faire(t, [{ type: 'modifierPoutre', id: o.id, ...c }]);
        A.append(titre('Poutre ' + MATIERES_STRUCTURE[o.material].toLowerCase()),
          champ('Matière', o.material, v => mod('Matière de la poutre', { matiere: v as Beam['material'] }), 'text', MATIERES_STRUCTURE),
          champ('Largeur (cm)', o.width / 10, v => mod('Largeur de la poutre', { largeur: Math.round(ent(v) * 10) }), 'number'),
          champ('Retombée sous plafond (cm)', o.depth / 10, v => mod('Retombée de la poutre', { retombee: Math.round(ent(v) * 10) }), 'number'),
          bloc('Portée : <b>' + m(distance(o.a, o.b)) + '</b> · hauteur libre dessous : ' + m(f.height - o.depth) + '. Section et appuis à confirmer par l’étude de structure.'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'constraint':
        A.append(titre('Contrainte'), bloc(CONTRAINTES[o.kind] ?? o.kind), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
    }
  }

  /** la bibliothèque d'ouvertures : un clic choisit le modèle, on peut aussi le glisser sur un mur */
  /* ---------- le catalogue (à gauche) : des catégories ; une catégorie ouvre son volet de modèles sur le plan ---------- */
  interface TuileCatalogue { id: string; libelle: string; dessin: string; titre?: string; choisi?: boolean; choisir: () => void; glisser?: string }
  interface Categorie { cle: string; libelle: string; icone: string; tuiles?: () => TuileCatalogue[]; action?: () => void }
  let categorieOuverte: string | null = null, catalogueFerme = false, recherche = '';
  let categoriesCourantes: Categorie[] = [];
  const sansAccents = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  function rendreCatalogue(cats: Categorie[]) {
    categoriesCourantes = cats;
    catalogue.className = 'catalogue' + (catalogueFerme ? ' ferme' : '');
    const f = document.createElement('button'); f.className = 'fermer-cat';
    f.innerHTML = catalogueFerme ? '›' : '‹ Fermer catalogue'; f.title = catalogueFerme ? 'Ouvrir le catalogue' : 'Fermer le catalogue';
    f.onclick = () => { catalogueFerme = !catalogueFerme; categorieOuverte = null; barreOutils() };
    if (catalogueFerme) { catalogue.append(f); rendreVolet(); return }
    const q = document.createElement('input'); q.className = 'chercher'; q.placeholder = 'rechercher…'; q.value = recherche;
    q.oninput = () => { recherche = q.value; rendreVolet() };
    catalogue.append(q, f);
    for (const c of cats) {
      const b = document.createElement('button'); b.className = 'cat' + (c.cle === categorieOuverte ? ' actif' : ''); b.dataset['cat'] = c.cle;
      b.innerHTML = icone(c.icone, 20) + '<span>' + esc(c.libelle) + '</span>';
      b.onclick = () => { if (c.action) { categorieOuverte = null; c.action(); return } categorieOuverte = categorieOuverte === c.cle ? null : c.cle; recherche = ''; barreOutils() };
      catalogue.append(b);
    }
    rendreVolet();
  }
  /** le volet de la catégorie ouverte (ou des résultats d'une recherche), posé sur le plan */
  function rendreVolet() {
    main.querySelector('.volet')?.remove();
    const q = sansAccents(recherche.trim());
    const c = categoriesCourantes.find(x => x.cle === categorieOuverte);
    if (!q && !c?.tuiles) return;
    const T = q ? categoriesCourantes.flatMap(x => x.tuiles?.() ?? []).filter(t => sansAccents(t.libelle).includes(q)) : c!.tuiles!();
    const v = document.createElement('div'); v.className = 'volet';
    v.innerHTML = `<h4>${q ? icone('chercher', 18) + ' ' + T.length + ' résultat' + (T.length > 1 ? 's' : '') : icone(c!.icone, 18) + ' ' + esc(c!.libelle)}</h4>`;
    const g = document.createElement('div'); g.className = 'tuiles';
    for (const t of T) {
      const e = document.createElement('div'); e.className = 'tuile' + (t.choisi ? ' choisi' : ''); e.dataset['m'] = t.id; e.title = t.titre ?? t.libelle;
      e.innerHTML = t.dessin + '<span>' + esc(t.libelle) + '</span>';
      /* un modèle choisi : le volet se range, le plan est libre pour la pose */
      e.onclick = () => { t.choisir(); categorieOuverte = null; recherche = ''; barreOutils(); panneaux() };
      if (t.glisser) {
        e.draggable = true;
        /* pendant le glisser, le volet s'efface (après le départ du glisser : le modifier au départ l'interromprait) */
        e.ondragstart = ev => { t.choisir(); ev.dataTransfer?.setData('text/plain', t.glisser!); if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy'; setTimeout(() => { v.style.visibility = 'hidden' }) };
        e.ondragend = () => { categorieOuverte = null; barreOutils() };
      }
      g.appendChild(e);
    }
    if (!T.length) g.innerHTML = '<div class="note">Aucun modèle ne correspond.</div>';
    v.appendChild(g);
    main.appendChild(v);
  }
  /** les catégories d'ouvrants : un découpage par usage, comme on les cherche */
  const CATEGORIES_OUVRANTS: { cle: string; libelle: string; icone: string; dans: (m: ModeleOuverture) => boolean }[] = [
    { cle: 'fixe', libelle: 'Fixe', icone: 'fixe', dans: m => m.genre === 'window' && m.manoeuvre === 'fixed' },
    { cle: 'baie', libelle: 'Baie vitrée', icone: 'baie', dans: m => m.genre === 'bay' },
    { cle: 'porte-fenetre', libelle: 'Porte-fenêtre', icone: 'porte_fenetre', dans: m => m.genre === 'french_window' },
    { cle: 'fenetre', libelle: 'Fenêtre', icone: 'fenetre', dans: m => m.genre === 'window' && m.manoeuvre !== 'fixed' },
    { cle: 'porte-ext', libelle: 'Porte extérieure', icone: 'porte_ext', dans: m => m.famille === 'portes_entree' },
    { cle: 'porte-int', libelle: 'Porte intérieure', icone: 'porte_int', dans: m => m.famille === 'portes_interieures' },
    { cle: 'garage', libelle: 'Porte de garage', icone: 'garage', dans: m => m.famille === 'garage' },
    { cle: 'ouverture', libelle: 'Ouverture', icone: 'passage', dans: m => m.famille === 'passages' },
  ];
  function bibliotheque() {
    const choisi = outils.modele.id;
    rendreCatalogue([
      ...CATEGORIES_OUVRANTS.map(c => ({ cle: c.cle, libelle: c.libelle, icone: c.icone, tuiles: () => MODELES_OUVERTURES.filter(c.dans).map(m => ({
        id: m.id, libelle: m.libelle, dessin: symbole(m), titre: m.libelle + ' — ' + MANOEUVRES[m.manoeuvre], choisi: m.id === choisi, glisser: 'cp-ouverture:' + m.id,
        choisir: () => { outils.reglages.modeleOuverture = m.id; if (outils.outil !== 'ouverture') choisir('ouverture'); $<HTMLElement>('.aide').textContent = 'Cliquez sur un mur pour poser : ' + m.libelle },
      })) })),
      { cle: 'fenetre-toit', libelle: 'Fenêtre de toit', icone: 'fenetre_toit', action: () => choisir('fenetretoit') },
    ]);
  }
  /** la visite à hauteur d'homme (vue 3D) : on y entre, on en sort */
  function visite(oui: boolean) {
    if (!vue3d) return;
    vue3d.visite(oui);
    $<HTMLElement>('.hote3d').focus?.();
    panneaux();
  }
  /** le rendu préféré de la 3D, gardé sur cet appareil : réaliste par défaut ; « maquette » sur un ordinateur lent */
  function renduPrefere(): 'realiste' | 'maquette' {
    try { return localStorage.getItem('cpDesigner:rendu3d') === 'maquette' ? 'maquette' : 'realiste' } catch { return 'realiste' }
  }
  function panneau3D() {
    if (vue3d?.enVisite()) {
      aside.append(titre('Visite à hauteur d’homme'),
        bloc('<b>Z Q S D</b> (ou W A S D) et <b>↑ ↓</b> : marcher · <b>← →</b> : tourner · glisser la souris : regarder · <b>Maj</b> : presser le pas · <b>F</b> : revenir au départ · <b>Échap</b> : quitter la visite'),
        bloc('Les yeux à 1,60 m du sol. On monte l’escalier en marchant ; murs, cloisons, vitrages et meubles arrêtent, les portes laissent passer (supposées ouvertes).'),
        ligne(bouton('Revenir au départ', () => vue3d?.cadrer()), bouton('Image PNG', () => void imagePNG()), bouton('Quitter la visite', () => visite(false), 'prim')));
      return;
    }
    aside.append(titre('Vue 3D'),
      bloc('Glisser : tourner autour · clic droit (ou Maj + glisser) : déplacer · molette : zoom · F : recadrer · Échap : retour au plan'),
      champ('Rendu', vue3d?.rendu() ?? renduPrefere(), v => {
        const r = v === 'maquette' ? 'maquette' : 'realiste';
        try { localStorage.setItem('cpDesigner:rendu3d', r) } catch { /* gardé pour la séance */ }
        vue3d?.rendu(r);
      }, 'text', { realiste: 'Réaliste (textures, ciel, ombres)', maquette: 'Maquette (aplats et arêtes, plus léger)' }),
      champ('Vue maquette (murs coupés à 1,20 m)', coupe3D ? 1 : 0, v => { coupe3D = !!v; appliquerCoupe() }, 'checkbox'),
      champ('Niveaux montrés', niveaux3D, v => { niveaux3D = v as 'tous' | 'jusqua'; apres() }, 'text', { tous: 'Tous', jusqua: 'Jusqu’au niveau affiché' }),
      champ('Montrer la toiture', toit3D ? 1 : 0, v => { toit3D = !!v; apres() }, 'checkbox'),
      ligne(bouton('🚶 Visite à hauteur d’homme (V)', () => visite(true), 'prim bvisite')),
      ligne(bouton('Recadrer', () => vue3d?.cadrer()), bouton('Image PNG', () => void imagePNG()), bouton('Retour au plan', () => void basculer3D(false), 'prim')),
      ligne(bouton(perspective ? '✓ Vue gardée pour le dossier (la remplacer)' : 'Garder cette vue pour le dossier', () => void garderPerspective(), 'bpersp')),
      bloc('La 3D se calcule à partir du plan : chaque modification s’y voit aussitôt. Hauteurs des murs, appuis et hauteurs des ouvertures : ceux de l’inspecteur.'));
    /* l'insertion dans le site (PCMI 6) : la maquette sur une photographie du terrain, accordée à la main */
    aside.append(titre('Insertion dans le site (PCMI 6)'));
    if (!photoSite) aside.append(ligne(bouton('Photo du terrain…', () => void poserPhotoSite(), 'bphoto')),
      bloc('Une photographie du terrain prise d’où la maison sera vue (de la rue, le plus souvent). Elle se met derrière la maquette ; tournez la vue jusqu’à ce que la maison s’y pose, puis gardez-la pour le dossier. La photo reste sur cet appareil, le temps de la séance.'));
    else aside.append(
      champ('Focale : champ de vision vertical (°)', Math.round(vue3d?.focale() ?? 45), v => { vue3d?.focale(Number(v.replace(',', '.'))) }, 'number'),
      bloc('Tournez (glisser), déplacez (clic droit) et zoomez (molette) jusqu’à ce que la maison se pose au bon endroit, vue d’où la photo a été prise. Un téléphone tenu en largeur voit environ 45 à 55° en hauteur.'),
      ligne(bouton(piecesDossier.insertion ? '✓ Gardée pour le PCMI 6 (la remplacer)' : 'Garder pour le PCMI 6', () => void garderInsertion(), 'prim binsertion'),
        bouton('Retirer la photo', () => { photoSite = null; vue3d?.photo(null); panneaux() })));
    sectionMateriaux(niveau());
    sectionToiture(niveau());
  }

  /** l'outil Aménagement : le genre (clôture, terrasse…) et l'aspect de ce qu'on trace */
  function panneauAmenagement() {
    const r = outils.reglages, fin = outils.finitionAmenagement;
    aside.append(titre('Aménagement extérieur'),
      champ('Genre', r.genreAmenagement, v => { r.genreAmenagement = v as GenreAmenagement; r.finitionAmenagement = finitionsDe(r.genreAmenagement)[0]!.id; panneaux() }, 'text',
        Object.fromEntries(Object.entries(GENRES_AMENAGEMENT).map(([k, g]) => [k, g.libelle]))),
      champ('Aspect', fin.id, v => { r.finitionAmenagement = v; panneaux() }, 'text', Object.fromEntries(finitionsDe(r.genreAmenagement).map(x => [x.id, x.libelle]))),
      bloc(GENRES_AMENAGEMENT[r.genreAmenagement].ligne
        ? 'Cliquez chaque point de la clôture (ou tapez la longueur : 12,50<90) ; Entrée pour finir, retour au premier point pour la fermer. Hauteur ' + m(fin.hauteur) + ', réglable ensuite (le PLU la limite souvent : à vérifier).'
        : 'Cliquez chaque sommet de la surface (ou tapez les longueurs) ; revenez au premier point ou appuyez sur Entrée pour la fermer.'),
      bloc('Les aménagements se tracent sur le niveau le plus bas ; ils figurent au plan de masse (surfaces et longueurs) et en 3D.'));
  }

  /** un parement sur tous les murs extérieurs du projet, en une fois (un seul « annuler ») */
  function parementPartout(id: string | null) {
    const murs = h.projet.buildings.flatMap(b => b.floors).flatMap(x => Object.values(x.objects)).filter(o => o.type === 'wall' && o.role === 'exterior' && (o.finish ?? null) !== id);
    if (murs.length) faire('Parement des façades', murs.map(o => ({ type: 'modifierMur', id: o.id, finition: id }) as Commande));
  }
  function solPartout(id: string | null, f: Floor) {
    const P = Object.values(f.objects).filter(o => o.type === 'room' && (o.floorFinish ?? null) !== id);
    if (P.length) faire('Sols du niveau', P.map(o => ({ type: 'modifierPiece', id: o.id, sol: id }) as Commande));
  }
  function peinturePartout(id: string | null, f: Floor) {
    const P = Object.values(f.objects).filter(o => o.type === 'room' && (o.wallFinish ?? null) !== id);
    if (P.length) faire('Peinture du niveau', P.map(o => ({ type: 'modifierPiece', id: o.id, murs: id }) as Commande));
  }
  /** les matériaux, dans le panneau 3D : façades et sols d'un coup */
  function sectionMateriaux(f: Floor) {
    const ext = h.projet.buildings.flatMap(b => b.floors).flatMap(x => Object.values(x.objects)).filter((o): o is Wall => o.type === 'wall' && o.role === 'exterior');
    const P = [...new Set(ext.map(w => w.finish ?? ''))], S = [...new Set(Object.values(f.objects).flatMap(o => (o.type === 'room' ? [o.floorFinish ?? ''] : [])))];
    const Pe = [...new Set(Object.values(f.objects).flatMap(o => (o.type === 'room' ? [o.wallFinish ?? ''] : [])))];
    aside.append(titre('Matériaux'),
      /* « * » : des choix différents d'un mur (d'une pièce) à l'autre ; le garder ne change rien */
      champ('Façades (tous les murs extérieurs)', P.length > 1 ? '*' : P[0] ?? '', v => { if (v !== '*') parementPartout(v || null) }, 'text', P.length > 1 ? { '*': 'Plusieurs parements…', ...OPTIONS_PAREMENTS } : OPTIONS_PAREMENTS),
      champ('Sols (toutes les pièces de ' + f.name + ')', S.length > 1 ? '*' : S[0] ?? '', v => { if (v !== '*') solPartout(v || null, f) }, 'text', S.length > 1 ? { '*': 'Plusieurs sols…', ...OPTIONS_SOLS } : OPTIONS_SOLS),
      champ('Murs intérieurs (pièces de ' + f.name + ')', Pe.length > 1 ? '*' : Pe[0] ?? '', v => { if (v !== '*') peinturePartout(v || null, f) }, 'text', Pe.length > 1 ? { '*': 'Plusieurs peintures…', ...OPTIONS_PEINTURES } : OPTIONS_PEINTURES),
      bloc('Un aspect, pas un descriptif : la référence du produit reste au programme technique. Mur par mur, pièce par pièce : dans leur inspecteur.'));
  }

  /** la toiture du niveau : ses choix (type, pente, débord, couverture) ; pans, faîtage et pignons se calculent */
  function sectionToiture(f: Floor) {
    const A = aside, r = Object.values(f.objects).find((o): o is Roof => o.type === 'roof');
    A.append(titre('Toiture — ' + f.name));
    if (!r) {
      A.append(bloc('Aucune toiture sur ce niveau. Elle se pose sur le haut des murs extérieurs et suit leur contour.'),
        ligne(bouton('Ajouter une toiture', () => faire('Toiture', [{ type: 'creerToiture', niveau: f.id, genre: 'hip', pente: 35, debord: 200, couverture: 'tile' }]), 'prim')));
      return;
    }
    const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierToiture' }>>) => faire(t, [{ type: 'modifierToiture', id: r.id, ...c }]);
    A.append(champ('Type', r.kind, v => mod('Type de toiture', { genre: v as Roof['kind'], ...(v === 'flat' ? { couverture: 'gravel' as const } : r.covering === 'gravel' ? { couverture: 'tile' as const } : {}) }), 'text', TOITURES));
    if (r.kind !== 'flat') A.append(champ('Pente (°)', r.pitch, v => mod('Pente', { pente: ent(v) }), 'number'));
    /* la toiture se pose sur le haut des murs extérieurs : leur hauteur se règle ici, tous ensemble (un seul « annuler ») */
    const ext = mursDroits(f).filter(w => w.role === 'exterior');
    if (ext.length) {
      const hm = Math.max(...ext.map(w => w.height));
      A.append(champ('Hauteur des murs extérieurs (m)' + (ext.some(w => w.height !== hm) ? ' — inégales' : ''), (hm / 1000).toFixed(2), v => {
        const x = mm(v);
        if (!(x >= 1_000 && x <= 15_000)) { toast('Hauteur de mur de 1 à 15 m', true); return }
        faire('Hauteur des murs extérieurs', ext.map(w => ({ type: 'modifierMur' as const, id: w.id, hauteur: x })));
      }, 'number'));
    }
    A.append(champ('Débord (m)', (r.overhang / 1000).toFixed(2), v => mod('Débord', { debord: mm(v) }), 'number'),
      champ('Couverture', r.covering, v => mod('Couverture', { couverture: v as Roof['covering'] }), 'text', COUVERTURES));
    if (r.kind === 'gable' || r.kind === 'shed') A.append(champ(r.kind === 'gable' ? 'Faîtage' : 'Égout bas et haut', r.ridge ?? 'long', v => mod('Sens de la toiture', { faitage: v as 'long' | 'short' }), 'text', { long: 'Le long du grand côté', short: 'Le long du petit côté' }));
    if (r.kind === 'shed') A.append(champ('Inverser (bas de l’autre côté)', r.flip ? 1 : 0, v => mod('Inverser la pente', { inverse: !!v }), 'checkbox'));
    const t = toitureDuNiveau(f);
    if (t && !t.ok) A.append(bloc('⚠️ ' + esc(t.raison), 'alerte'));
    else if (t?.ok) {
      const egout = Math.min(...t.toitures.map(x => x.egoutZ)), faitage = Math.max(...t.toitures.map(x => x.faitage)), surf = t.toitures.reduce((s, x) => s + x.surfaceCouverture, 0);
      A.append(bloc((r.kind === 'flat' ? 'Dalle à ' + m(egout) + ' · acrotère à ' + m(faitage) : 'Égout à ' + m(egout) + ' · faîtage à <b>' + m(faitage) + '</b>') + ' (depuis le ±0,00)<br>Couverture : ' + m2(surf)
        + '<br><span class="note">Hauteurs indicatives, au nu extérieur du haut des murs : charpente, isolation et épaisseurs réelles ne sont pas étudiées ici (à vérifier avant le PC).</span>'));
    }
    A.append(ligne(bouton('Retirer la toiture', () => supprimer(r.id), 'dang')));
  }

  /** le mobilier : une catégorie par pièce ; un meuble choisi se pose d'un clic (ou glissé), contre le mur proche */
  function bibliothequeMobilier() {
    const choisi = outils.meuble.id;
    const ICONES: Record<string, string> = { sejour: 'produit', chambre: 'lit', cuisine: 'cuisine', salle_de_bains: 'bain', wc_buanderie: 'wc', accessibilite: 'pmr' };
    rendreCatalogue([
      ...Object.entries(FAMILLES_MEUBLES).map(([fam, nom]) => ({ cle: 'meu-' + fam, libelle: nom, icone: ICONES[fam] ?? 'produit', tuiles: () => MODELES_MEUBLES.filter(m => m.famille === fam).map(m => ({
        id: m.id, libelle: m.libelle, dessin: symboleMeuble(m), titre: m.libelle + ' — ' + texteCote(m.largeur) + ' × ' + texteCote(m.profondeur) + ' m', choisi: m.id === choisi, glisser: 'cp-meuble:' + m.id,
        choisir: () => { outils.reglages.modeleMeuble = m.id; if (outils.outil !== 'mobilier') choisir('mobilier'); $<HTMLElement>('.aide').textContent = 'Cliquez pour poser : ' + m.libelle + ' (T : tourner)' },
      })) })),
      { cle: 'escalier', libelle: 'Escalier', icone: 'escalier', action: () => choisir('escalier') },
    ]);
  }
  /** l'outil Ouverture : le modèle choisi (le catalogue est à gauche) */
  function panneauOuverture() {
    const m = outils.modele;
    aside.append(titre('Ouvrant'), bloc('<b>' + esc(m.libelle) + '</b><br>' + m2(m.largeur * m.hauteur) + ' de tableau · ' + texteCote(m.largeur) + ' × ' + texteCote(m.hauteur) + ' m' + (m.allege ? ' · allège ' + texteCote(m.allege) + ' m' : '') + '<br>' + esc(MANOEUVRES[m.manoeuvre])),
      bloc('Cliquez sur un mur pour la poser — ou glissez le modèle du catalogue (à gauche) sur le mur. Elle se place ensuite par ses distances aux murs voisins (inspecteur). Dimensions de tableau courantes, à confirmer avec le menuisier.'));
  }
  /** l'outil Mobilier : le meuble choisi (le catalogue est à gauche) */
  function panneauMobilier() {
    const m = outils.meuble;
    aside.append(titre('Produit'), bloc('<b>' + esc(m.libelle) + '</b><br>' + texteCote(m.largeur) + ' × ' + texteCote(m.profondeur) + ' m, hauteur ' + texteCote(m.hauteur) + ' m'),
      bloc('Cliquez pour le poser — ou glissez-le du catalogue sur le plan. Près d’un mur, il s’y plaque et se tourne vers la pièce ; près d’un angle, il s’y cale. T : tourner · Alt : pose libre. Dimensions courantes, réglables ensuite.'));
  }
  /** le nuancier de l'onglet Revêtement : un clic pose la teinte sur ce qui est choisi (un mur, une pièce), sinon partout */
  function nuancier(quoi: 'facades' | 'sols' | 'murs') {
    const L = quoi === 'facades' ? PAREMENTS : quoi === 'sols' ? SOLS : PEINTURES;
    const familles = [...new Set(L.map(x => x.famille))];
    const NOMS: Record<string, string> = { enduit: 'Enduits', bardage: 'Bardages', pierre: 'Pierre', brique: 'Brique', sol: 'Sols', peinture: 'Peintures et faïences' };
    const poser = (x: (typeof L)[number]) => {
      const o = selection ? niveau().objects[selection] : undefined;
      if (quoi === 'facades') { if (o?.type === 'wall' && o.role === 'exterior') faire('Parement', [{ type: 'modifierMur', id: o.id, finition: x.id }]); else parementPartout(x.id) }
      else if (o?.type === 'room') faire(quoi === 'sols' ? 'Sol' : 'Peinture', [{ type: 'modifierPiece', id: o.id, ...(quoi === 'sols' ? { sol: x.id } : { murs: x.id }) }]);
      else if (quoi === 'sols') solPartout(x.id, niveau()); else peinturePartout(x.id, niveau());
      toast(x.libelle + ' : posé' + (o && (o.type === 'room' || o.type === 'wall') ? '' : ' partout'));
    };
    const tuiles = (fam: string) => L.filter(x => x.famille === fam).map(x => ({ id: x.id, libelle: x.libelle, dessin: `<div class="pastille" style="background:${x.couleur}"></div>`, choisir: () => poser(x) }));
    /* une seule famille : son volet s'ouvre d'emblée */
    if (familles.length === 1 && categorieOuverte === null && !catalogueFerme) categorieOuverte = 'rev-' + familles[0];
    rendreCatalogue(familles.map(fam => ({ cle: 'rev-' + fam, libelle: NOMS[fam] ?? fam, icone: quoi === 'facades' ? 'facade' : quoi === 'sols' ? 'sol' : 'peinture', tuiles: () => tuiles(fam) })));
  }
  function basculerSols(oui = !solsCouleur) {
    solsCouleur = oui; try { localStorage.setItem('cpDesigner:sols', oui ? 'oui' : 'non') } catch { /* préférence non gardée */ }
    barreOutils(); panneaux(); dessinerBientot();
  }

  /** plusieurs objets choisis : ce qu'ils sont, et ce qu'on peut en faire ensemble */
  function panneauGroupe(f: Floor) {
    const types: Record<string, string> = { wall: 'mur', opening: 'ouverture', room: 'pièce', furniture: 'meuble', dimension: 'cote' };
    const n = new Map<string, number>();
    for (const id of groupe) { const t = f.objects[id]?.type ?? ''; n.set(t, (n.get(t) ?? 0) + 1) }
    aside.append(titre(groupe.length + ' objets choisis'),
      bloc([...n].map(([t, k]) => k + ' ' + (types[t] ?? t) + (k > 1 ? 's' : '')).join(', ')),
      ligne(bouton('Copier (Ctrl+C)', () => copierChoix()), bouton('Dupliquer (Ctrl+D)', dupliquerChoix), bouton('Couper (Ctrl+X)', () => { if (copierChoix()) supprimerChoix() })),
      ligne(bouton('Coller (Ctrl+V)', commencerCollage)),
      ...(n.get('wall') ? [ligne(bouton('Mettre d’équerre les ' + n.get('wall') + ' murs', () => mettreDEquerre(groupe.filter(id => f.objects[id]?.type === 'wall'))))] : []),
      bloc('Maj + clic : ajouter ou retirer un objet · un cadre tiré dans le vide choisit ce qu’il contient · Ctrl+A : tout le niveau. Au collage : T tourne d’un quart de tour, X et Y retournent en miroir, un clic pose (sur un angle de mur, sauf Alt).'),
      ligne(bouton('Supprimer les ' + groupe.length + ' objets', supprimerChoix, 'dang')));
  }

  /** ce que l'escalier franchira depuis ce niveau, en clair */
  function resumeEscalier(f: Floor, g: ReturnType<typeof geometrieEscalier>): string {
    const arr = niveauDArrivee(h.projet, f);
    return 'Hauteur à franchir : <b>' + m(g.hauteur) + '</b> (' + (arr ? 'jusqu’au sol de « ' + esc(arr.name) + ' »' : 'pas de niveau au-dessus : hauteur du niveau + 20 cm de plancher') + ')<br>'
      + g.contremarches + ' hauteurs de ' + (g.hauteurMarche / 10).toFixed(1).replace('.', ',') + ' cm · giron ' + (g.giron / 10).toFixed(1).replace('.', ',') + ' cm · Blondel ' + (g.blondel / 10).toFixed(1).replace('.', ',') + ' cm';
  }
  function panneauEscalier(f: Floor) {
    const r = outils.reglages;
    const g = geometrieEscalier({ id: '', type: 'stair', status: 'proposed', sourceRefs: [], revision: 0, position: { x: 0, y: 0 }, rotation: 0, width: r.largeurEscalier, kind: r.genreEscalier }, hauteurAFranchir(h.projet, f));
    aside.append(titre('Escalier'),
      bloc('Cliquez le départ (le milieu de la première marche). T : tourner le sens de la montée. Marches et trémie se calculent depuis la hauteur à franchir, et suivent si elle change.'),
      champ('Forme', r.genreEscalier, v => { r.genreEscalier = v as Stair['kind']; panneaux() }, 'text', ESCALIERS),
      champ('Largeur (m)', (r.largeurEscalier / 1000).toFixed(2), v => { r.largeurEscalier = mm(v); panneaux() }, 'number'),
      bloc(resumeEscalier(f, g)));
    for (const a of g.alertes) aside.append(bloc('⚠️ ' + esc(a), 'alerte'));
  }

  /* ---------- la structure : poteaux et poutres ---------- */
  function optionsStructure(): HTMLElement[] {
    const r = outils.reglages, o = document.createElement('div'); o.className = 'options';
    const nb = (lib: string, val: Mm, f: (v: Mm) => void) => {
      const l = document.createElement('label'); l.innerHTML = esc(lib) + ' <input type="number" step="1" style="width:56px">';
      const i = l.querySelector('input')!; i.value = String(val / 10); i.onchange = () => { const v = Math.round(ent(i.value) * 10); if (v > 0) f(v) };
      return l;
    };
    const mat = (val: string, f: (v: Column['material']) => void) => {
      const l = document.createElement('label'); l.innerHTML = 'Matière <select>' + Object.entries(MATIERES_STRUCTURE).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('') + '</select>';
      const x = l.querySelector('select')!; x.value = val; x.onchange = () => f(x.value as Column['material']);
      return l;
    };
    if (outils.outil === 'poutre') o.append(nb('Largeur (cm)', r.largeurPoutre, v => { r.largeurPoutre = v }), nb('Retombée (cm)', r.retombeePoutre, v => { r.retombeePoutre = v }), mat(r.matierePoutre, v => { r.matierePoutre = v }));
    else o.append(nb('Section (cm)', r.largeurPoteau, v => { r.largeurPoteau = v }), nb('×', r.profondeurPoteau, v => { r.profondeurPoteau = v }), mat(r.matierePoteau, v => { r.matierePoteau = v }));
    return [o];
  }

  /* ---------- l'égout et les eaux pluviales ---------- */
  const toitDuNiveau = (): Roof | undefined => Object.values(niveauToit().objects).find((o): o is Roof => o.type === 'roof');
  function finitionEgout(g: NonNullable<Roof['eavesFinish']>) {
    const r = toitDuNiveau();
    if (!r) { toast('Aucune toiture : posez-la d’abord (Toit)', true); return }
    faire('Égout : ' + FINITIONS_EGOUT[g], [{ type: 'modifierToiture', id: r.id, egout: r.eavesFinish === g ? null : g }]);
    apres();
  }
  function panneauEaux() {
    const A = aside, f = niveauToit(), r = toitDuNiveau();
    A.append(titre('Égout et gouttières'));
    if (!r) { A.append(bloc('Aucune toiture : posez-la d’abord (sous-onglet Toit).')); return }
    const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierToiture' }>>) => faire(t, [{ type: 'modifierToiture', id: r.id, ...c }]);
    const E = eauxPluviales(f);
    if (!E) { A.append(bloc(r.kind === 'flat' ? 'Toit-terrasse : évacuation par naissances et trop-pleins, à préciser au projet.' : '⚠️ Toiture non calculable sur ce plan.', 'alerte')); return }
    A.append(champ('Finition de l’égout', r.eavesFinish ?? '', v => mod('Finition de l’égout', { egout: (v || null) as Roof['eavesFinish'] | null }), 'text', { '': 'À choisir', ...FINITIONS_EGOUT }),
      champ('Gouttière', r.gutter ?? '', v => mod('Gouttière', { gouttiere: (v || null) as Roof['gutter'] | null }), 'text', { '': 'À choisir', ...GOUTTIERES }));
    if (r.gutter !== 'none') A.append(champ('Matière', r.gutterMaterial ?? '', v => mod('Matière des gouttières', { matiereGouttiere: (v || null) as Roof['gutterMaterial'] | null }), 'text', { '': 'À choisir', ...MATIERES_GOUTTIERE }));
    const L = E.longueurs, ml = (v: number) => (v / 1000).toFixed(2).replace('.', ',') + ' m';
    A.append(bloc((['egout', 'faitage', 'aretier', 'noue', 'rive'] as const).filter(g => L[g] > 0).map(g => NOMS_LIGNES[g] + ' : <b>' + ml(L[g]) + '</b>').join('<br>')
      + '<br><span class="note">Égout en plan ; rives, arêtiers et noues en vraie grandeur. Détail au métré (Dossier › Métré).</span>'));
    if (r.gutter !== 'none') {
      const n = E.descentes.length;
      A.append(bloc('Descentes posées : <b>' + n + '</b>' + (n ? ' — ≈ ' + (E.surfacePlan / 1e6 / n).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' m² de toiture en plan par descente' : '')
        + '<br><span class="note">Outil « Descente EP » : un clic sur l’égout la pose, un clic sur elle la retire. Nombre et diamètre selon le DTU 60.11 (surface desservie, région).</span>'));
      if (n) A.append(ligne(bouton('Retirer les descentes', () => mod('Retirer les descentes', { descentes: [] }))));
    }
    for (const a of E.alertes) A.append(bloc('⚠️ ' + esc(a), 'alerte'));
  }

  /* ---------- les fondations ---------- */
  /** les fondations se posent sur le niveau le plus bas : on y va */
  function allerAuxFondations() {
    const F = fondationsDuProjet(h.projet), bas = F?.niveau ?? [...niveaux()].sort((a, b) => a.elevation - b.elevation)[0];
    if (bas && bas.id !== niveauId) { niveauId = bas.id; selection = null; apres() }
  }
  function poserFondations(genre: Foundation['kind']) {
    allerAuxFondations();
    const F = fondationsDuProjet(h.projet);
    if (F) { if (F.fondation.kind !== genre) faire('Soubassement : ' + SOUBASSEMENTS[genre], [{ type: 'modifierFondations', id: F.fondation.id, genre }]) }
    else faire('Fondations : ' + SOUBASSEMENTS[genre].toLowerCase(), [{ type: 'creerFondations', niveau: niveauId, genre }]);
    apres();
  }
  function panneauFondations() {
    const A = aside, F = fondationsDuProjet(h.projet);
    A.append(titre('Fondations'));
    if (!F) {
      A.append(bloc('Choisissez le soubassement au ruban : <b>vide sanitaire</b> (plancher porté) ou <b>terre-plein</b> (dallage). Les semelles filantes se placent d’elles-mêmes sous les murs extérieurs et les murs intérieurs porteurs, une semelle isolée sous chaque poteau ; elles suivent les murs.'),
        bloc('Les dimensions proposées sont des ordres de grandeur, à remplacer par celles de l’étude de sol (G2) et du bureau d’études.', 'alerte'));
      return;
    }
    const fd = F.fondation, P = planFondations(F.niveau)!;
    const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierFondations' }>>) => faire(t, [{ type: 'modifierFondations', id: fd.id, ...c }]);
    const cmEnMm = (v: string) => Math.round(ent(v) * 10);
    A.append(bloc('<b>À valider par l’étude de sol et le bureau d’études</b> : rien ici n’est un dimensionnement.', 'alerte'),
      champ('Soubassement', fd.kind, v => mod('Soubassement', { genre: v as Foundation['kind'] }), 'text', SOUBASSEMENTS),
      champ('Semelles filantes : largeur (cm)', fd.footingWidth / 10, v => mod('Largeur des semelles', { largeur: cmEnMm(v) }), 'number'),
      champ('Semelles filantes : hauteur (cm)', fd.footingHeight / 10, v => mod('Hauteur des semelles', { hauteur: cmEnMm(v) }), 'number'),
      champ('Hors gel : profondeur (cm)', fd.frostDepth / 10, v => mod('Profondeur hors gel', { horsGel: cmEnMm(v) }), 'number'),
      champ('Bon sol : profondeur (cm, étude G2 ; vide : inconnue)', fd.bearingDepth === undefined ? '' : fd.bearingDepth / 10, v => mod('Profondeur du bon sol', { bonSol: String(v).trim() ? cmEnMm(v) : null }), 'number'));
    if (fd.kind === 'crawl_space') A.append(champ('Vide sanitaire : hauteur (cm)', fd.crawlHeight / 10, v => mod('Hauteur du vide sanitaire', { hauteurVide: cmEnMm(v) }), 'number'));
    A.append(champ('Semelles isolées : côté (cm)', fd.padSize / 10, v => mod('Semelles isolées', { coteIsolee: cmEnMm(v) }), 'number'),
      champ('Semelles isolées : hauteur (cm)', fd.padHeight / 10, v => mod('Semelles isolées', { hauteurIsolee: cmEnMm(v) }), 'number'));
    A.append(bloc('Semelles filantes : <b>' + m(P.longueur) + '</b> (' + P.filantes.length + ' mur' + (P.filantes.length > 1 ? 's' : '') + ' porteur' + (P.filantes.length > 1 ? 's' : '') + ')'
      + (P.isolees.length ? '<br>Semelles isolées : <b>' + P.isolees.length + '</b>' : '')
      + '<br>Assise à <b>' + m(P.assise) + '</b> sous le terrain : ' + esc(P.raisonAssise)
      + (fd.kind === 'crawl_space' ? '<br>Trappes de visite : <b>' + P.trappes.length + '</b>' : '')
      + '<br><span class="note">Une cloison ne reçoit pas de semelle ; un mur intérieur, oui (porteur à confirmer). Le détail est au métré (Dossier › Métré).</span>'));
    for (const a of P.alertes) A.append(bloc('⚠️ ' + esc(a), 'alerte'));
    if (fd.kind === 'crawl_space' && fd.hatches.length) A.append(ligne(bouton('Retirer les trappes', () => mod('Retirer les trappes', { trappes: [] }))));
    A.append(ligne(bouton('Retirer les fondations', () => supprimer(fd.id), 'dang')));
  }

  /* ---------- le métré du projet (par lot, sans prix) ---------- */
  function panneauMetreProjet() {
    const A = aside, L = metreProjet(h.projet);
    A.append(titre('Métré du projet'));
    if (!L.length) { A.append(bloc('Rien à métrer : tracez la maison.')); return }
    const q = (x: number, u: string) => (u === 'u' ? String(Math.round(x)) : x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ' ' + u;
    const n = L.filter(l => l.aPreciser).length;
    A.append(bloc('Quantités tirées du plan, sans prix (le chiffrage se fait à part). ' + (n ? '<b>' + n + ' ligne' + (n > 1 ? 's' : '') + ' à préciser</b> (⚠️).' : ''), n ? 'alerte' : 'note'),
      ligne(bouton('Exporter le métré (CSV)', exporterMetre, 'prim')));
    for (const lot of [...new Set(L.map(l => l.lot))]) {
      const t = document.createElement('table');
      t.innerHTML = L.filter(l => l.lot === lot).map(l => `<tr title="${esc(l.detail ?? '')}"><td>${l.aPreciser ? '⚠️ ' : ''}${esc(l.libelle)}${l.detail ? '<br><span class="note">' + esc(l.detail) + '</span>' : ''}</td><td style="white-space:nowrap;text-align:right">${l.aPreciser && !l.quantite ? '—' : q(l.quantite, l.unite)}</td></tr>`).join('');
      A.append(titre(lot), t);
    }
    A.append(bloc('Murs à l’axe ; pièces entre les faces des murs, sur la hauteur sous plafond ; linteaux avec 20 cm d’appui de chaque côté (à confirmer) ; volumes en place. À relire avant tout devis.'));
  }
  function exporterMetre() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + metreCsv(metreProjet(h.projet))], { type: 'text/csv;charset=utf-8' }));
    a.download = (h.projet.name || 'projet') + ' - metre.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Métré exporté : il s’ouvre dans un tableur (séparateur « ; »)');
  }

  /* ---------- le terrain (façon logiciel de terrain : relevé, terrassement, VRD, végétation) ---------- */
  const TALUS: Record<string, string> = { '1': '1/1 (45°)', '1.5': '3/2 (34°, usuel en remblai)', '2': '2/1 (27°)', '3': '3/1 (18°, tondable)' };
  const ICONES_EQUIPEMENTS: Record<NetworkItem['kind'], string> = { regard: 'regard', branchement: 'regard', compteur_eau: 'compteur', coffret_elec: 'compteur',
    chambre_telecom: 'regard', coffret_gaz: 'compteur', infiltration: 'cubature', cuve_ep: 'cubature', assainissement: 'cubature' };
  /** les tuiles du relevé : limite, points cotés, plan du géomètre, courbes */
  const tuilesTerrain = (): Tuile[] => [outil('parcelle', 'Parcelle'), outil('altitude', 'Point coté'),
    action('Plan du géomètre (DXF, CSV)', 'geometre', importerGeometre, 'La limite et les points cotés d’un plan de géomètre (DXF), ou ses points en texte (CSV, TXT : X Y Z)', 'b-geometre'),
    { libelle: 'Courbes de niveau', icone: 'courbes', faire: () => basculerCourbes(), actif: () => courbes > 0, titre: 'Tirées des points cotés (triangulation du relevé)', classe: 'b-courbes' },
    outil('profil', 'Profil en long')];
  function basculerCourbes(v = courbes > 0 ? 0 : 0.5) {
    courbes = v; try { localStorage.setItem('cpDesigner:courbes', String(v)) } catch { /* préférence de la séance */ }
    barreOutils(); panneaux(); dessinerBientot();
  }
  function optionsTerrassement(): HTMLElement[] {
    const r = outils.reglages, o = document.createElement('div'); o.className = 'options';
    const n = document.createElement('label'); n.innerHTML = 'Niveau fini (m / ±0,00) <input type="number" step="0.05" style="width:70px">';
    const i = n.querySelector('input')!; i.value = (r.niveauPlateforme / 1000).toFixed(2); i.onchange = () => { r.niveauPlateforme = mm(i.value) };
    const t = document.createElement('label'); t.innerHTML = 'Talus <select>' + Object.entries(TALUS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('') + '</select>';
    const s = t.querySelector('select')!; s.value = String(r.talusPlateforme); s.onchange = () => { r.talusPlateforme = Number(s.value) };
    o.append(n, t);
    return [o];
  }
  function optionsVegetation(): HTMLElement[] {
    const r = outils.reglages, o = document.createElement('div'); o.className = 'options';
    const d = document.createElement('label'); d.innerHTML = 'Couronne (m) <input type="number" step="0.5" min="0.3" style="width:60px">';
    const i = d.querySelector('input')!; i.value = String(r.diametreArbre / 1000); i.onchange = () => { r.diametreArbre = Math.max(300, mm(i.value)) };
    o.append(d);
    return [o];
  }
  /** une plateforme autour de la maison : le rectangle de son emprise, 1 m plus large de chaque côté */
  function plateformeMaison() {
    const E = empriseAuSol(h.projet).flatMap(q => q.contour);
    if (!E.length) { toast('Aucun mur extérieur : tracez d’abord la maison', true); return }
    const b = boiteAnneau(E), d = 1_000, bas = [...niveaux()].sort((a, c) => a.elevation - c.elevation)[0]!;
    const contour = [{ x: b.xmin - d, y: b.ymin - d }, { x: b.xmax + d, y: b.ymin - d }, { x: b.xmax + d, y: b.ymax + d }, { x: b.xmin - d, y: b.ymax + d }].map(q => ({ x: Math.round(q.x), y: Math.round(q.y) }));
    const avant = new Set(Object.keys(bas.objects));
    if (faire('Plateforme de la maison', [{ type: 'creerPlateforme', niveau: bas.id, contour, niveauFini: outils.reglages.niveauPlateforme, talus: outils.reglages.talusPlateforme, nom: 'Plateforme de la maison' }])) {
      niveauId = bas.id; selection = Object.keys(niveau().objects).find(k => !avant.has(k)) ?? null; apres();
    }
  }
  /** les cubatures d'une plateforme, en clair */
  function blocCubature(c: ReturnType<typeof cubature>, t: Plot | null): HTMLElement[] {
    if (!c) return [bloc(!t ? 'Tracez la parcelle pour situer le terrain.' : t.groundFloorNgf === undefined ? 'Renseignez l’altitude NGF du ±0,00 (parcelle) : sans elle, rien ne se cube.' : 'Cotez le terrain naturel (trois points au moins, outil N ou plan du géomètre) pour calculer les cubatures.', 'alerte')];
    const v = (x: number) => x.toFixed(1).replace('.', ',') + ' m³';
    return [bloc('Surface : <b>' + c.surface.toFixed(1).replace('.', ',') + ' m²</b> · terrain naturel dessous : ' + c.tnMin.toFixed(2).replace('.', ',') + ' à ' + c.tnMax.toFixed(2).replace('.', ',') + ' NGF'
      + '<br>Déblai : <b>' + v(c.deblai) + '</b> (+ talus ' + v(c.talusDeblai) + ')<br>Remblai : <b>' + v(c.remblai) + '</b> (+ talus ' + v(c.talusRemblai) + ')'),
      bloc('Volumes en place, estimés sur le relevé (triangulé) par mailles de 25 cm, sans foisonnement ni décapage de la terre végétale : à confirmer par le terrassier.')];
  }
  /** le panneau du terrain : relevé, courbes, ce qui est posé */
  function panneauTerrain(f: Floor) {
    const A = aside, t = parcelleDuProjet(h.projet)?.plot ?? null, P = t?.spotHeights ?? [];
    A.append(titre('Terrain naturel'));
    if (!t) { A.append(bloc('Tracez la limite (outil L) ou importez le plan du géomètre (DXF) : la limite et les points cotés y sont lus.'), ligne(bouton('Plan du géomètre (DXF)…', importerGeometre, 'prim'))); return }
    if (profilTrait) A.append(...sectionProfil(t, profilTrait));
    const Z = P.map(x => x.ngf);
    A.append(bloc('Parcelle : <b>' + m2(surfaceTerrain(t)) + '</b>' + (t.reference ? ' · ' + esc(t.reference) : '')
      + '<br>Points cotés : <b>' + P.length + '</b>' + (Z.length ? ' · de ' + Math.min(...Z).toFixed(2).replace('.', ',') + ' à ' + Math.max(...Z).toFixed(2).replace('.', ',') + ' NGF (dénivelé ' + (Math.max(...Z) - Math.min(...Z)).toFixed(2).replace('.', ',') + ' m)' : '')
      + '<br>±0,00 : ' + (t.groundFloorNgf !== undefined ? '<b>' + t.groundFloorNgf.toFixed(2).replace('.', ',') + ' NGF</b>' : '<span class="note">à renseigner (parcelle)</span>')),
      champ('Courbes de niveau', String(courbes), v => basculerCourbes(Number(v)), 'text', { '0': 'Masquées', '0.1': 'Tous les 10 cm', '0.25': 'Tous les 25 cm', '0.5': 'Tous les 50 cm', '1': 'Tous les 1 m', '2': 'Tous les 2 m' }),
      bloc('Une courbe maîtresse (trait plus fort, cotée) toutes les cinq. Elles sont tirées des points cotés, triangulés entre eux : là où il n’y a pas de point, le terrain est supposé plan.'),
      ligne(bouton('Plan du géomètre (DXF)…', importerGeometre), bouton('La parcelle', () => { niveauId = parcelleDuProjet(h.projet)!.niveau.id; selection = t.id; apres() })));
    if (P.length < 3) A.append(bloc('Trois points cotés au moins pour les courbes, les talus et les cubatures.', 'alerte'));
    panneauMetre(f, false);
  }
  /** le profil en long : terrain naturel (tirets) et terrain fini (plateformes, talus), le long du trait A → B */
  function sectionProfil(t: Plot, [a, b]: [Point, Point]): HTMLElement[] {
    const P = profilEnLong(t, plateformesDuProjet(h.projet), a, b, Math.max(100, distance(a, b) / 300));
    const out: HTMLElement[] = [titre('Profil en long A → B (' + m(distance(a, b)) + ')')];
    if (!P.length) return [...out, bloc('Cotez le terrain (points cotés ou plan du géomètre) pour tracer le profil.', 'alerte')];
    const Z = P.flatMap(q => [q.tn, q.fini]), z0 = Math.min(...Z), z1 = Math.max(...Z), dz = Math.max(z1 - z0, 0.5), L = P[P.length - 1]!.d;
    const W = 300, H = 150, g = 36, X = (d: number) => g + (d / L) * (W - g - 6), Y = (z: number) => 8 + (H - 30) * (1 - (z - (z0 - dz * 0.1)) / (dz * 1.2));
    const ligneSvg = (k: 'tn' | 'fini') => P.map((q, i) => (i ? 'L' : 'M') + X(q.d).toFixed(1) + ' ' + Y(q[k]).toFixed(1)).join('');
    /* l'exagération des hauteurs : l'échelle verticale rapportée à l'horizontale */
    const ex = ((H - 30) / (dz * 1.2) / 1000) / ((W - g - 6) / L);
    const pas = dz > 4 ? 1 : dz > 1.5 ? 0.5 : 0.25, lignes: string[] = [];
    for (let z = Math.ceil((z0 - dz * 0.1) / pas) * pas; z <= z1 + dz * 0.1; z += pas) lignes.push(`<line x1="${g}" x2="${W - 6}" y1="${Y(z).toFixed(1)}" y2="${Y(z).toFixed(1)}" stroke="#555" stroke-width=".5"/><text x="${g - 3}" y="${(Y(z) + 3).toFixed(1)}" font-size="8" text-anchor="end" fill="#BDBDBD">${z.toFixed(2).replace('.', ',')}</text>`);
    const svg = bloc(`<svg viewBox="0 0 ${W} ${H}" width="100%" style="background:#2E2E2E;border-radius:4px">${lignes.join('')}
      <path d="${ligneSvg('fini')}L${X(L).toFixed(1)} ${H - 22}L${X(0).toFixed(1)} ${H - 22}Z" fill="rgba(143,209,138,.18)"/>
      <path d="${ligneSvg('tn')}" fill="none" stroke="#C9A27C" stroke-width="1.4" stroke-dasharray="4 3"/>
      <path d="${ligneSvg('fini')}" fill="none" stroke="#8FD18A" stroke-width="1.8"/>
      <text x="${g}" y="${H - 8}" font-size="10" font-weight="700" fill="#C9A4E8">A</text><text x="${W - 6}" y="${H - 8}" font-size="10" font-weight="700" fill="#C9A4E8" text-anchor="end">B</text>
      <text x="${(W + g) / 2}" y="${H - 8}" font-size="8" fill="#BDBDBD" text-anchor="middle">${esc(m(L))} · hauteurs ×${ex.toFixed(1).replace('.', ',')}</text></svg>`, 'profil');
    const f = (z: number) => z.toFixed(2).replace('.', ',');
    out.push(svg, bloc('<span style="color:#C9A27C">- - -</span> terrain naturel · <span style="color:#8FD18A">———</span> terrain fini (plateformes et talus)<br>'
      + 'En A : TN ' + f(P[0]!.tn) + ' / fini ' + f(P[0]!.fini) + ' · en B : TN ' + f(P[P.length - 1]!.tn) + ' / fini ' + f(P[P.length - 1]!.fini) + ' NGF<br>'
      + 'Pente moyenne du TN : ' + ((P[P.length - 1]!.tn - P[0]!.tn) / (L / 1000) * 100).toFixed(1).replace('.', ',') + ' %'),
      ligne(bouton('Effacer le profil', () => { profilTrait = null; panneaux(); dessinerBientot() }), bouton('Nouveau trait (S)', () => choisir('profil'))));
    return out;
  }
  /** le métré du terrain : cubatures, réseaux, équipements, arbres */
  function panneauMetre(_f: Floor, avecTitre = true) {
    const A = aside, M = metreTerrain(h.projet), v = (x: number) => x.toFixed(1).replace('.', ',') + ' m³';
    if (avecTitre) A.append(titre('Métré du terrain')); else A.append(titre('Métré'));
    const t = parcelleDuProjet(h.projet)?.plot ?? null;
    const nPf = niveaux().flatMap(f => Object.values(f.objects)).filter(o => o.type === 'platform').length;
    if (nPf && !M.plateformes.length) A.append(...blocCubature(null, t));
    if (M.plateformes.length) {
      const tb = document.createElement('table');
      tb.innerHTML = '<tr><td><b>Plateforme</b></td><td><b>Déblai</b></td><td><b>Remblai</b></td></tr>' + M.plateformes.map(c => `<tr><td>${esc(c.nom)} (${c.niveau.toFixed(2).replace('.', ',')})</td><td>${v(c.deblai + c.talusDeblai)}</td><td>${v(c.remblai + c.talusRemblai)}</td></tr>`).join('')
        + `<tr><td><b>Total</b></td><td><b>${v(M.deblai)}</b></td><td><b>${v(M.remblai)}</b></td></tr>`;
      A.append(tb, bloc('Talus compris. ' + (M.deblai > M.remblai ? 'Excédent de ' + v(M.deblai - M.remblai) + ' à évacuer (ou à régaler).' : M.remblai > M.deblai ? 'Apport de ' + v(M.remblai - M.deblai) + ' nécessaire.' : 'Déblai et remblai équilibrés.') + ' Estimation sans foisonnement : à confirmer par le terrassier.'));
    }
    if (M.reseaux.length || M.equipements.length) {
      const tb = document.createElement('table');
      tb.innerHTML = M.reseaux.map(r => `<tr><td><i style="display:inline-block;width:14px;height:3px;background:${NOMS_RESEAUX[r.genre].couleur};vertical-align:middle;margin-right:6px"></i>${esc(NOMS_RESEAUX[r.genre].libelle)}</td><td>${r.longueur.toFixed(1).replace('.', ',')} m</td></tr>`).join('')
        + M.equipements.map(e => `<tr><td>${esc(NOMS_EQUIPEMENTS[e.genre as NetworkItem['kind']]?.libelle ?? e.genre)}</td><td>${e.nombre} u</td></tr>`).join('');
      A.append(titre('Réseaux et équipements'), tb);
    }
    const B = M.arbres;
    if (B.existants + B.aPlanter + B.aAbattre) A.append(titre('Végétation'), bloc('Arbres existants conservés : <b>' + B.existants + '</b><br>À planter : <b>' + B.aPlanter + '</b><br>À abattre : <b>' + B.aAbattre + '</b>'));
    if (!nPf && !M.reseaux.length && !M.equipements.length && !(B.existants + B.aPlanter + B.aAbattre)) A.append(bloc('Rien de posé : plateformes (Terrassement), réseaux, équipements et arbres se métrent ici, et vont au plan de masse (PCMI 2).'));
  }
  /** le plan du géomètre (DXF) : sa limite et ses points cotés deviennent la parcelle et son relevé ; un « annuler » le retire */
  function importerGeometre() {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.dxf,.csv,.txt,application/dxf,image/vnd.dxf,text/csv,text/plain';
    i.onchange = async () => {
      const fichier = i.files?.[0];
      if (!fichier) return;
      let G;
      const texte = /\.(csv|txt)$/i.test(fichier.name);
      try { G = texte ? lirePointsTexte(await fichier.text()) : lirePlanGeometre(await fichier.text()) } catch (e) { toast('Fichier illisible : ' + String((e as Error)?.message ?? e), true); return }
      const T = parcelleDuProjet(h.projet);
      if (texte && !T) { toast('Le relevé en texte n’a que des points : tracez ou importez d’abord la limite de la parcelle (DXF)', true); return }
      if (!G.limites.length && !G.points.length) { toast(texte ? 'Aucune ligne « X Y Z » lisible dans ce fichier' : 'Ni limite fermée ni point coté dans ce DXF (calques : ' + (G.calques.join(', ') || 'aucun') + ')', true); return }
      const SOURCES = { points: 'points 3D', polylignes3d: 'sommets des polylignes 3D', textes: 'textes d’altitude', aucune: '—' };
      const r = await dialogue('Plan du géomètre — ' + fichier.name, [
        { cle: 'l', libelle: 'Limite de propriété', valeur: G.limites.length ? '0' : '', options: { ...(T ? { '': 'Garder la limite actuelle' } : { '': 'Aucune' }), ...Object.fromEntries(G.limites.slice(0, 30).map((l, k) => [String(k), 'Calque « ' + l.calque + ' » — ' + l.surface.toFixed(0) + ' m² (' + l.points.length + ' sommets)'])) } },
        { cle: 'p', libelle: 'Points cotés (' + G.points.length + (texte ? ', lus dans le fichier texte' : ', lus sur les ' + SOURCES[G.sourceAltitudes]) + ')', valeur: G.points.length ? 'remplacer' : 'aucun', options: { remplacer: 'Remplacer le relevé', ajouter: 'Ajouter au relevé', aucun: 'Ne pas les reprendre' } },
        { cle: 'z', libelle: 'Altitude NGF du ±0,00 (m) — à fixer avec le géomètre', valeur: T?.plot.groundFloorNgf !== undefined ? String(T.plot.groundFloorNgf) : '' },
      ]);
      if (!r) return;
      const lim = r['l'] ? G.limites[Number(r['l'])] : undefined, z = String(r['z'] ?? '').trim(), zr = z ? ent(z) : undefined;
      if (zr !== undefined && !Number.isFinite(zr)) { toast('Altitude du ±0,00 illisible', true); return }
      /* le relevé se pose au centre de la maison : la limite s'y place, on l'implante ensuite (Implanter la maison) ;
         des points sans limite (fichier texte) se posent au centre de la parcelle : un calage à vérifier sur un point connu */
      const E = texte ? T!.plot.contour : empriseAuSol(h.projet).flatMap(q => q.contour), b = E.length ? boiteAnneau(E) : null;
      const c = b ? { x: Math.round((b.xmin + b.xmax) / 2), y: Math.round((b.ymin + b.ymax) / 2) } : { x: 0, y: 0 };
      const mv = (q: Point): Point => ({ x: q.x + c.x, y: q.y + c.y });
      const pts = r['p'] === 'aucun' ? undefined : [...(r['p'] === 'ajouter' && T ? T.plot.spotHeights ?? [] : []), ...G.points.map(x => ({ point: mv(x.point), ngf: x.ngf }))];
      const bas = [...niveaux()].sort((a, k) => a.elevation - k.elevation)[0]!;
      if (!T && !lim) { toast('Choisissez une limite : les points cotés appartiennent à la parcelle', true); return }
      let ok: boolean;
      if (T) ok = faire('Plan du géomètre', [{ type: 'modifierParcelle', id: T.plot.id, ...(lim ? { contour: lim.points.map(mv) } : {}), ...(pts ? { altitudesTerrain: pts } : {}), ...(zr !== undefined ? { altitudeRdc: zr } : {}) }]);
      else ok = faire('Plan du géomètre', [{ type: 'creerParcelle', niveau: bas.id, contour: lim!.points.map(mv), voies: [0], ...(zr !== undefined ? { altitudeRdc: zr } : {}), ...(pts?.length ? { altitudesTerrain: pts } : {}) }]);
      if (!ok) return;
      const N = parcelleDuProjet(h.projet);
      if (N) { niveauId = N.niveau.id; selection = N.plot.id }
      if (courbes === 0 && pts?.length) courbes = 0.5;
      apres();
      if (texte) { toast('Relevé repris : ' + G.points.length + ' points cotés, centrés sur la parcelle. Vérifiez le calage sur un point connu (le DXF du géomètre garde limite et points dans le même repère).' + (zr === undefined ? ' Altitude du ±0,00 à renseigner.' : ''), true); return }
      toast('Plan du géomètre repris : ' + (lim ? 'limite ' + lim.surface.toFixed(0) + ' m²' : 'limite inchangée') + (pts ? ', ' + G.points.length + ' points cotés' : '') + ' (coordonnées ramenées de ' + (G.decalage.x / 1000).toFixed(0) + ' ; ' + (G.decalage.y / 1000).toFixed(0) + ' m). Vérifiez le côté sur voie, le nord et l’implantation.' + (zr === undefined ? ' Altitude du ±0,00 à renseigner.' : ''), zr === undefined);
    };
    i.click();
  }

  /** les points cotés du terrain naturel, dans l'inspecteur de la parcelle : chacun se corrige ou se retire */
  function pointsCotes(o: Plot): HTMLElement[] {
    const A = o.spotHeights ?? [];
    const remplacer = (titreAction: string, L: { point: Point; ngf: number }[]) => faire(titreAction, [{ type: 'modifierParcelle', id: o.id, altitudesTerrain: L }]);
    const out: HTMLElement[] = [titre('Terrain naturel (' + A.length + ' point' + (A.length > 1 ? 's' : '') + ' coté' + (A.length > 1 ? 's' : '') + ')')];
    A.forEach((x, i) => out.push(ligne(
      champ('Point ' + (i + 1) + ' (NGF, m)', x.ngf, v => { const z = Number(String(v).replace(',', '.')); if (Number.isFinite(z)) remplacer('Altitude d’un point coté', A.map((y, k) => (k === i ? { ...y, ngf: z } : y))) }, 'number'),
      bouton('✕', () => remplacer('Retirer un point coté', A.filter((_, k) => k !== i))))));
    out.push(ligne(bouton('Coter le terrain (outil N)', () => choisir('altitude'))),
      bloc('Les altitudes du terrain naturel relevées par le géomètre : la coupe (PCMI 3) en tire le profil du terrain, le plan de masse les reporte. Elles suivent la parcelle quand on l’implante.'));
    return out;
  }
  /** le fond cadastral, dans l'inspecteur de la parcelle : son état, l'import d'un GeoJSON, le téléchargement, le retrait */
  function fondCadastralPanneau(o: Plot): HTMLElement[] {
    const c = o.cadastre;
    const out: HTMLElement[] = [titre('Fond cadastral')];
    if (c) out.push(bloc(c.parcelles.length + ' parcelle' + (c.parcelles.length > 1 ? 's' : '') + ', ' + c.batiments.length + ' bâtiment' + (c.batiments.length > 1 ? 's' : '') + ' · ' + esc(c.source) + ' (' + esc(c.date) + ')'
      + (c.ecart !== undefined ? '<br>Calé sur la limite : écart moyen <b>' + m(c.ecart) + '</b>' : '')));
    out.push(ligne(bouton('Importer (GeoJSON)…', () => importerCadastre(o)), bouton('Télécharger…', () => telechargerCadastre(o))));
    if (c) out.push(ligne(bouton('Retirer le fond cadastral', () => faire('Retirer le fond cadastral', [{ type: 'modifierParcelle', id: o.id, cadastre: null }]), 'dang')));
    out.push(bloc('Les parcelles voisines et le bâti existant du plan cadastral (cadastre.data.gouv.fr), calés sur la limite d’après la référence cadastrale. Ils vont au plan de masse (PCMI 2) et suivent la parcelle quand on l’implante. Le cadastre n’est pas un plan de géomètre : ses limites ne sont pas garanties.'));
    return out;
  }
  /** caler un cadastre lu sur la parcelle, et le garder (avec le nord qu'il donne, si on le veut) */
  async function poserCadastre(o: Plot, lu: CadastreLu, source: string) {
    if (!o.reference?.trim()) { toast('Renseignez d’abord la référence cadastrale de la parcelle (ex. : ZB n° 237) : c’est elle qui cale le fond', true); return }
    const T = parcellesDeReference(o.reference, lu.parcelles);
    if (!T.length) { toast('La parcelle « ' + o.reference + ' » n’est pas dans ce cadastre (' + lu.parcelles.length + ' parcelles lues) : vérifiez la référence ou la commune', true); return }
    const d = new Date(), date = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    let f;
    try { f = fondCadastral(o.contour, lu, T, source, date) } catch (e) { toast(String((e as Error)?.message ?? e), true); return }
    const deg = Math.round(f.rotation * 1800 / Math.PI) / 10;
    const r = await dialogue('Fond cadastral — ' + T.map(p => p.reference).join(', '), [
      { cle: 'n', libelle: 'Nord du plan', valeur: 'cadastre', options: { cadastre: 'Prendre le nord du cadastre (' + String(deg).replace('.', ',') + '°)', garder: 'Garder le nord actuel (' + String(Math.round(o.north * 1800 / Math.PI) / 10).replace('.', ',') + '°)' } },
    ]);
    if (!r) return;
    if (!faire('Fond cadastral', [{ type: 'modifierParcelle', id: o.id, cadastre: f.cadastre, ...(r['n'] === 'cadastre' ? { nord: f.rotation } : {}) }])) return;
    const e = f.cadastre.ecart ?? 0;
    toast('Fond cadastral calé : ' + f.cadastre.parcelles.length + ' parcelles, ' + f.cadastre.batiments.length + ' bâtiments ; écart moyen ' + m(e) + ' avec la limite tracée.'
      + (e > 1_000 ? ' C’est beaucoup : vérifiez la limite (plan du géomètre) et la référence cadastrale.' : ''), e > 1_000);
  }
  /** le texte d'un fichier, décompressé s'il est en .gz (les fichiers de cadastre.data.gouv.fr) */
  async function texteFichier(f: Blob, nom: string): Promise<string> {
    if (!/\.gz$/i.test(nom)) return f.text();
    return new Response(f.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  /** un ou deux GeoJSON du cadastre (parcelles, et bâtiments) choisis sur l'appareil */
  function importerCadastre(o: Plot) {
    const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = '.json,.geojson,.gz,application/json,application/geo+json,application/gzip';
    i.onchange = async () => {
      const F = [...(i.files ?? [])];
      if (!F.length) return;
      const lu: CadastreLu = { parcelles: [], batiments: [], lambert: true };
      try {
        for (const f of F) {
          const genre = /b[aâ]timent/i.test(f.name) ? 'batiments' as const : /parcelle/i.test(f.name) ? 'parcelles' as const : undefined;
          const x = lireCadastreGeoJSON(JSON.parse(await texteFichier(f, f.name)), genre);
          lu.parcelles.push(...x.parcelles); lu.batiments.push(...x.batiments);
        }
      } catch (e) { toast('Fichier illisible : ' + String((e as Error)?.message ?? e), true); return }
      await poserCadastre(o, lu, 'cadastre (' + F.map(f => f.name).join(', ') + ')');
    };
    i.click();
  }
  /** le cadastre d'une commune, téléchargé sur cadastre.data.gouv.fr (données Etalab, mises à jour chaque trimestre) */
  async function telechargerCadastre(o: Plot) {
    const r = await dialogue('Télécharger le cadastre de la commune', [{ cle: 'c', libelle: 'Code INSEE de la commune (5 caractères, ex. : 85194 ; ce n’est pas le code postal)', valeur: '' }]);
    if (!r) return;
    const insee = String(r['c'] ?? '').trim().toUpperCase();
    if (!/^(\d{5}|2[AB]\d{3})$/.test(insee)) { toast('Code INSEE illisible : 5 caractères, par exemple 85194', true); return }
    const base = 'https://cadastre.data.gouv.fr/bundler/cadastre-etalab/communes/' + insee + '/geojson/';
    toast('Téléchargement du cadastre de la commune ' + insee + '…');
    const lu: CadastreLu = { parcelles: [], batiments: [], lambert: true };
    try {
      for (const genre of ['parcelles', 'batiments'] as const) {
        const rep = await fetch(base + genre);
        if (!rep.ok) throw new Error('réponse ' + rep.status + ' pour les ' + genre);
        const x = lireCadastreGeoJSON(await rep.json(), genre);
        lu.parcelles.push(...x.parcelles); lu.batiments.push(...x.batiments);
      }
    } catch (e) {
      toast('Téléchargement impossible (' + String((e as Error)?.message ?? e) + '). Récupérez les fichiers « parcelles » et « batiments » de la commune sur cadastre.data.gouv.fr (rubrique Données), puis « Importer (GeoJSON)… ».', true);
      return;
    }
    await poserCadastre(o, lu, 'cadastre.data.gouv.fr, commune ' + insee);
  }
  /** un point coté posé d'un clic (outil N) : son altitude se demande aussitôt */
  async function poserPointCote(point: Point) {
    const t = parcelleDuProjet(h.projet);
    if (!t) { toast('Tracez d’abord la parcelle (outil L) : les points cotés lui appartiennent', true); return }
    const r = await dialogue('Point coté du terrain naturel', [{ cle: 'z', libelle: 'Altitude NGF (m), lue sur le plan du géomètre', valeur: '' }]);
    if (!r) return;
    const z = Number(String(r['z']).replace(',', '.'));
    if (!String(r['z']).trim() || !Number.isFinite(z)) { toast('Altitude illisible : un nombre en mètres, par exemple 102,35', true); return }
    faire('Point coté du terrain', [{ type: 'modifierParcelle', id: t.plot.id, altitudesTerrain: [...(t.plot.spotHeights ?? []), { point: { x: Math.round(point.x), y: Math.round(point.y) }, ngf: z }] }]);
  }

  /** les pièces images du dossier de permis : ce que le Designer ne dessine pas, fourni par l'utilisateur */
  function sectionPieces() {
    const A = aside;
    const D = h.projet.dossier ?? {}, C = reglagesCabinet();
    A.append(titre('Informations du dossier'),
      bloc('Maître d’ouvrage : ' + (D.maitreOuvrage ? esc(D.maitreOuvrage) : '<span class="note">à compléter</span>') + '<br>Lieu : ' + (D.lieuConstruction ? esc(D.lieuConstruction.replace(/\n/g, ', ')) : '<span class="note">à compléter</span>')
        + '<br>Cabinet : ' + esc(C.societe ?? 'CP Constructions') + (C.dessinateur ? ' — dessiné par ' + esc(C.dessinateur) : '')),
      ligne(bouton('Compléter…', () => void informationsDossier(), 'prim binfos'), bouton('Cabinet…', () => void reglerCabinet(), 'bcabinet')),
      bloc('Les informations vont à la page de garde et à la colonne de chaque planche (ce qui manque s’écrit « [à préciser] ») ; elles sont enregistrées avec le projet. Le cabinet (société, SIREN, dessinateur…) est réglé sur cet appareil.'));
    A.append(titre('Dossier de permis : pièces fournies'));
    const etat = (code: string, nom: string, v: ImageDossier | null | undefined, sinon: string) =>
      bloc('<b>' + code + '</b> ' + nom + ' : ' + (v ? '✓ ' + v.largeur + ' × ' + v.hauteur + ' px' + (v.legende ? ' — ' + esc(v.legende) : '') : '<span class="note">' + sinon + '</span>'));
    const piece = (cle: 'situation' | 'photoProche' | 'photoLointaine', code: string, nom: string, invite: string, classe: string) => {
      A.append(etat(code, nom, piecesDossier[cle], 'à joindre'),
        ligne(bouton(piecesDossier[cle] ? 'Remplacer…' : 'Importer…', () => void importerPiece(cle, code + ' — ' + nom, invite), classe),
          ...(piecesDossier[cle] ? [bouton('Retirer', () => { delete piecesDossier[cle]; panneaux() })] : [])));
    };
    piece('situation', 'PCMI 1', 'Plan de situation', 'Source et échelle de l’extrait (ex. : Géoportail, 1/5 000)', 'bpcmi1');
    A.append(etat('PCMI 6', 'Insertion', piecesDossier.insertion, 'à composer dans la vue 3D (photo du terrain)'));
    piece('photoProche', 'PCMI 7', 'Environnement proche', 'Point et angle de prise de vue (ex. : depuis la rue, vers le nord)', 'bpcmi7');
    piece('photoLointaine', 'PCMI 8', 'Environnement lointain', 'Point et angle de prise de vue', 'bpcmi8');
    const PV = pointsDeVue(h.projet);
    A.append(bloc('Points de prise de vue au plan de masse (outil I) : ' + (PV.length ? PV.map(v => v.piece).join(', ') : '<span class="note">aucun</span>')));
    A.append(bloc('Extrait de carte (Géoportail, cadastre) et photographies : à fournir, le Designer ne les invente pas. Gardés sur cet appareil le temps de la séance (ni enregistrés dans le projet, ni partagés), ils vont au dossier de permis (PDF → Composer).'));

  }
  /** les surfaces du niveau (entre murs), puis réglementaires (projet) */
  function panneauSurfaces(f: Floor) {
    const A = aside, plan = planDuNiveau(f);
    const pieces = plan.zones.filter(z => z.piece);
    A.append(titre('Surfaces (entre murs)'));
    if (plan.zones.length) {
      const t = document.createElement('table');
      t.innerHTML = plan.zones.map(z => `<tr><td>${esc(z.piece ? z.piece.name : 'À nommer')}</td><td>${m2(z.aire)}</td></tr>`).join('')
        + `<tr><td><b>Total</b> (${pieces.length} pièce${pieces.length > 1 ? 's' : ''})</td><td><b>${m2(plan.zones.reduce((s, z) => s + z.aire, 0))}</b></td></tr>`;
      A.append(t, bloc('Surfaces intérieures brutes, mesurées entre les faces des murs. Les surfaces réglementaires suivent.'));
      /* les surfaces réglementaires du projet (tous les niveaux), et le seuil de 150 m² */
      const S = surfacesReglementaires(h.projet), N = S.niveaux.find(x => x.niveau === f.id);
      A.append(titre('Surfaces réglementaires (projet)'),
        bloc('Surface de plancher : <b>' + m2(S.surfacePlancher) + '</b>' + (N && S.niveaux.length > 1 ? ' (dont ' + esc(f.name) + ' : ' + m2(N.surfacePlancher) + ')' : '')
          + '<br>Surface habitable : <b>' + m2(S.habitable) + '</b><br>Emprise au sol : ' + m2(S.emprise)
          + (N && (N.garages.length || N.tremies || N.basses) ? '<br><span class="note">Déduit sur ce niveau : ' + [N.garages.length ? 'garage ' + m2(N.garages.reduce((s, g) => s + g.aire, 0)) : '', N.tremies ? 'trémie ' + m2(N.tremies) : '', N.basses ? 'moins de 1,80 m ' + m2(N.basses) : ''].filter(Boolean).join(', ') + '</span>' : '')
          + '<br><span class="note">Au nu intérieur des façades ; ' + esc(REFERENCES.surfacePlancher) + '.</span>'),
        bloc((S.seuil.etat === 'ok' ? '' : '⚠️ ') + esc(S.seuil.message), S.seuil.etat === 'ok' ? 'note' : 'alerte'));
    } else A.append(bloc('Aucun espace clos.'));
    if (plan.baies.length) A.append(titre('Baies'), bloc(plan.baies.length + ' ouverture(s), dont ' + plan.baies.filter(b => b.exterieure).length + ' extérieure(s) — ' + m2(plan.baies.filter(b => b.exterieure).reduce((s, b) => s + b.surface, 0)) + ' de baies extérieures'));

  }
  /** la carte d'une composition de plafond ou de sol ; un clic ouvre le choix */
  let choixPlancher: 'plafond' | 'sol' | null = null;
  function cartePlancher(f: Floor, genre: 'plafond' | 'sol'): HTMLElement[] {
    const id = genre === 'plafond' ? f.ceilingRef : f.floorRef, k = compositionPlancher(id);
    const carte = (x: CompositionPlancher | undefined, choisi = false) => {
      const c = document.createElement('div'); c.className = 'carte' + (choisi ? ' choisi' : '');
      c.innerHTML = x ? `<div class="tete"><span>${esc(x.libelle)}</span><span>${Math.round(epaisseurPlancher(x) / 10)} cm</span></div>
        <div class="apercu-couches">${x.couches.map(y => `<i style="flex:${y.epaisseur};background:${MATIERES_PLANCHER[y.matiere].couleur}"></i>`).join('')}</div>
        <div class="couches">${x.couches.map((y, i) => `<span class="${i % 2 ? 'b' : ''}">${esc(MATIERES_PLANCHER[y.matiere].libelle)}</span>`).join('')}</div>`
        : `<div class="tete"><span>Non précisé</span><span>—</span></div><div class="couches"><span class="b">choisir une composition</span></div>`;
      return c;
    };
    const c0 = carte(k); c0.title = 'Changer la composition'; c0.dataset['plancher'] = genre;
    c0.onclick = () => { choixPlancher = choixPlancher === genre ? null : genre; panneaux() };
    const out: HTMLElement[] = [c0];
    if (choixPlancher === genre) for (const x of [...compositionsPlancher(genre), undefined]) {
      const c = carte(x, (x?.id ?? null) === (id ?? null)); c.style.marginTop = '4px';
      c.onclick = () => { choixPlancher = null; faire(genre === 'plafond' ? 'Plafond' : 'Plancher', [{ type: 'modifierNiveau', id: f.id, [genre === 'plafond' ? 'plafond' : 'plancher']: x?.id ?? null }]) };
      out.push(c);
    }
    return out;
  }
  function panneauNiveau(f: Floor) {
    const A = aside, plan = planDuNiveau(f);
    const t = document.createElement('div'); t.className = 'titre-panneau';
    t.innerHTML = `<span>Éditer ${esc(f.name)}</span><span class="vignette">${icone('niveaux', 40)}</span>`;
    A.append(t);
    A.append(titre('Informations'), champ('Nom', f.name, v => faire('Nom du niveau', [{ type: 'modifierNiveau', id: f.id, nom: v }])),
      champ('Altitude du sol fini (m)', (f.elevation / 1000).toFixed(2), v => faire('Altitude', [{ type: 'modifierNiveau', id: f.id, altitude: mm(v) }]), 'number'));
    A.append(titre('Plafond'), bloc('Composition du plafond', 'sous-titre'), ...cartePlancher(f, 'plafond'));
    A.append(titre('Sol'), bloc('Composition du plancher', 'sous-titre'), ...cartePlancher(f, 'sol'));
    /* la hauteur : sous plafond, et ce qu'elle fait avec le plafond — confrontée au sol du niveau du dessus */
    const kp = compositionPlancher(f.ceilingRef), L = niveaux(), i = L.findIndex(x => x.id === f.id), dessus = L[i + 1];
    const hn = f.height + (kp ? epaisseurPlancher(kp) : 0);
    A.append(titre('Hauteur'),
      champ('Hauteur sous plafond (cm)', Math.round(f.height / 10), v => faire('Hauteur', [{ type: 'modifierNiveau', id: f.id, hauteur: Math.round(ent(v) * 10) }]), 'number'),
      bloc('Hauteur du niveau : <b>' + Math.round(hn / 10) + ' cm</b>' + (kp ? ' (sous plafond + ' + Math.round(epaisseurPlancher(kp) / 10) + ' cm de plafond)' : ' (plafond non précisé)'), 'note'));
    if (dessus && kp) {
      const ecart = dessus.elevation - f.elevation - hn;
      A.append(bloc('Sol de « ' + esc(dessus.name) + ' » à ' + m(dessus.elevation) + ' : ' + (Math.abs(ecart) < 10 ? '✓ cohérent' : 'écart de ' + Math.round(ecart / 10) + ' cm avec la hauteur du niveau (épaisseur du plancher à revoir ?)'), Math.abs(ecart) < 10 ? 'ok' : 'alerte'));
    }
    A.append(titre('Niveaux'));
    for (const n of niveaux()) {
      const e = document.createElement('div');
      e.className = 'niv' + (n.id === niveauId ? ' actif' : '');
      e.innerHTML = `<span style="flex:1">${esc(n.name)}</span><span class="note">${(n.elevation / 1000).toFixed(2).replace('.', ',')} m</span>`;
      e.onclick = () => { niveauId = n.id; selection = null; apres() };
      A.append(e);
    }
    A.append(ligne(bouton('+ Niveau', ajouterNiveau), bouton('Supprimer ce niveau', () => {
        if (confirm('Supprimer le niveau « ' + f.name + ' » et tout ce qu’il contient ? (Annuler le rétablit.)')) faire('Supprimer un niveau', [{ type: 'supprimerNiveau', id: f.id }]);
      }, 'dang')));

    /* un projet vide : partir d'un modèle de maison plutôt que d'une page blanche */
    if (!niveaux().some(x => Object.values(x.objects).some(o => o.type === 'wall'))) {
      A.append(titre('Démarrer d’un modèle'));
      for (const md of MODELES_MAISONS) A.append(ligne(bouton(md.libelle, () => poserModele(md.id), 'prim')), bloc(esc(md.description)));
      A.append(bloc('Des plans fictifs, à adapter : tout se modifie ensuite comme un plan dessiné, et « annuler » les retire d’un coup.'));
    }

    sectionToiture(f);

    A.append(titre('Fonds (plan PDF, image)'));
    for (const u of Object.values(f.objects)) if (u.type === 'underlay') {
      const e = document.createElement('div'); e.className = 'niv';
      e.innerHTML = `<span style="flex:1">${esc(u.name ?? 'Fond')}</span><span class="note">${u.locked ? '🔒' : 'à caler'}</span>`;
      e.onclick = () => { selection = u.id; panneaux(); dessinerBientot() };
      A.append(e);
    }
    A.append(ligne(bouton('Importer un fond…', importerFond)));

    A.append(titre('Plan de l’atelier'), ligne(bouton('Importer le RDC lu par l’atelier…', importerAtelier)),
      bloc('Le fichier 01_modele/modele.json du projet de l’atelier (plan DXF ou PDF déjà lu). Murs, ouvertures et pièces arrivent sur ce niveau, vide.'));

    sectionPieces();

    A.append(titre('Contrôle'));
    if (plan.alertes.length) for (const a of plan.alertes) A.append(bloc('⚠️ ' + esc(a.message), 'alerte'));
    else A.append(bloc(mursDroits(f).length ? '✓ Aucune alerte sur ce niveau' : 'Aucun mur : choisissez l’outil Mur (M) pour commencer.', 'ok'));

    panneauSurfaces(f);

    if (mursDroits(f).length) A.append(titre('Murs'), ligne(bouton('Mettre d’équerre les murs du niveau', () => mettreDEquerre())),
      bloc('Pour un plan repris à la souris ou sur un fond : redresse à 90° les murs qui en sont à moins de ' + Math.round(ANGLE_EQUERRE * 180 / Math.PI) + '°, angles fermés, cloisons comprises (Ctrl+Z pour revenir).', 'note'));
    A.append(titre('Réglages'),
      champ('Épaisseur des murs (cm)', outils.reglages.epaisseurMur / 10, v => { outils.reglages.epaisseurMur = ent(v) * 10 }, 'number'),
      champ('Épaisseur des cloisons (cm)', outils.reglages.epaisseurCloison / 10, v => { outils.reglages.epaisseurCloison = ent(v) * 10 }, 'number'),
      champ('Grille d’accrochage', String(outils.reglages.grille), v => { outils.reglages.grille = Number(v) }, 'text', { '0': 'Sans', '10': '1 cm', '50': '5 cm', '100': '10 cm', '500': '50 cm' }),
      champ('Murs d’équerre au tracé (Q)', outils.reglages.equerre ? 1 : 0, v => basculerEquerre(!!v), 'checkbox'),
      champ('Rectangle de murs', outils.reglages.rectangle, v => { outils.reglages.rectangle = v as 'hors_tout' | 'interieur' }, 'text', { hors_tout: 'Cotes hors tout', interieur: 'Cotes intérieures' }),
      champ('Cotation automatique', cotation ? 1 : 0, v => basculerCotation(!!v), 'checkbox'),
      champ('Sols en couleur (présentation)', solsCouleur ? 1 : 0, v => basculerSols(!!v), 'checkbox'),
      bloc('Pendant un tracé, tapez la longueur (4,50 puis Entrée ; 4,50<90 pour un angle ; 10x8 pour un rectangle) · Alt : sans accrochage · Q : murs d’équerre oui / non · Maj : angles à 45° · Espace + glisser : déplacer la vue · F : tout voir · Ctrl+K : toutes les actions'));
    A.append(titre('Enregistrement'), bloc(esc(enr.raison) + (enr.mode === 'serveur' ? '' : '<br>Le travail reste dans ce navigateur, sur cet appareil.')));
  }

  /* ---------- actions ---------- */
  function supprimer(id: string) { if (faire('Supprimer', [{ type: 'supprimer', id }])) selection = null; panneaux() }
  function longueurMur(w: MurDroit, L: Mm) {
    if (!(L > 0)) return toast('Longueur invalide', true);
    const k = Object.values(niveau().objects).find(x => x.type === 'constraint' && x.kind === 'length' && x.walls[0] === w.id);
    if (k) { faire('Longueur', [{ type: 'modifierContrainte', id: k.id, valeur: L }]); return }
    const u = normaliser(soustraire(w.axis.b, w.axis.a));
    faire('Longueur', [{ type: 'deplacerSommet', niveau: niveauId, de: w.axis.b, vers: { x: w.axis.a.x + u.x * L, y: w.axis.a.y + u.y * L } }]);
  }
  async function ajouterNiveau() {
    const L = niveaux(), haut = L[L.length - 1]!;
    const r = await dialogue('Ajouter un niveau', [
      { cle: 'nom', libelle: 'Nom', valeur: L.length === 1 ? 'Étage' : 'Niveau ' + (L.length) },
      { cle: 'alt', libelle: 'Altitude du sol fini (m)', valeur: ((haut.elevation + haut.height + 250) / 1000).toFixed(2) },
      { cle: 'h', libelle: 'Hauteur sous plafond (m)', valeur: '2,50' }]);
    if (!r) return;
    const avant = new Set(h.projet.buildings[0]!.floors.map(f => f.id));
    if (faire('Ajouter un niveau', [{ type: 'ajouterNiveau', batiment: h.projet.buildings[0]!.id, nom: r['nom']!, altitude: mm(r['alt']!), hauteur: mm(r['h']!) }])) {
      niveauId = h.projet.buildings[0]!.floors.find(f => !avant.has(f.id))!.id; selection = null; apres();
    }
  }
  function importerFond() {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/pdf,image/*';
    i.onchange = async () => {
      const f = i.files?.[0];
      if (!f) return;
      try {
        const pages = await nombrePages(f);
        let page = 1;
        if (pages > 1) {
          const r = await dialogue('Page du PDF', [{ cle: 'p', libelle: 'Page à utiliser (1 à ' + pages + ')', valeur: '1' }]);
          if (!r) return;
          page = Math.min(pages, Math.max(1, Math.round(ent(r['p']!)) || 1));
        }
        const { cle, partage, erreur } = await importerFichier(f, undefined, enr.fonds);
        const avant = new Set(Object.keys(niveau().objects));
        if (faire('Importer un fond', [{ type: 'ajouterFond', niveau: niveauId, fichier: cle, nom: f.name, page }])) {
          selection = Object.keys(niveau().objects).find(k => !avant.has(k)) ?? null;
          panneaux();
          toast(partage === 'serveur' ? 'Fond importé et partagé : calez-le par deux points de distance connue (bouton « Caler »), puis verrouillez-le.'
            : 'Fond importé, gardé sur cet appareil seulement' + (erreur ? ' (partage impossible : ' + erreur + ' — l’espace « designer-fonds » est créé par supabase/designer/schema.sql)' : '') + '. Calez-le par deux points, puis verrouillez-le.', !!erreur);
        }
      } catch (e) { toast('Import impossible : ' + String((e as Error)?.message ?? e), true) }
    };
    i.click();
  }
  /* Phase 1 bis : le RDC lu par l'atelier (ADR-0004) ; un seul « annuler » le retire */
  function importerAtelier() {
    const f = niveau();
    if (Object.values(f.objects).some(o => o.type === 'wall')) {
      toast('Le niveau « ' + f.name + ' » a déjà des murs : ajoutez un niveau (+ Niveau) pour y importer le plan.', true);
      return;
    }
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json';
    i.onchange = async () => {
      const fichier = i.files?.[0];
      if (!fichier) return;
      let modele;
      try { modele = lireModeleAtelier(JSON.parse(await fichier.text())) }
      catch (e) { toast('Import impossible : ' + String((e as Error)?.message ?? e), true); return }
      const { commandes, rapport } = commandesImport(modele, niveauId, () => ulid());
      if (!faire('Import du RDC (atelier : ' + rapport.fichier + ')', commandes)) return;
      /* le tracé du plan source, en fond calé et verrouillé : on voit d'un coup d'œil si les murs collent */
      const traits = traitsSource(modele);
      if (traits) {
        try {
          const { image, calage } = await traceEnImage(traits);
          const { cle, erreur } = await importerFichier(new File([image], 'trace-' + rapport.fichier + '.png', { type: 'image/png' }), undefined, enr.fonds);
          faire('Fond : tracé du plan source', [{ type: 'ajouterFond', niveau: niveauId, fichier: cle, nom: 'Tracé source : ' + rapport.fichier, calage, verrouille: true, opacite: 0.45,
            origine: { label: 'Import atelier : ' + rapport.fichier, document: rapport.fichier, statut: 'derived' } }]);
          if (erreur) toast('Tracé source gardé sur cet appareil seulement (' + erreur + ')', true);
        } catch (e) { toast('Tracé source non affiché : ' + String((e as Error)?.message ?? e), true) }
      }
      cadrerTout();
      const zones = planDuNiveau(niveau()).zones.map(z => ({ nom: z.piece?.name ?? null, m2: z.aire / 1e6 }));
      const E = comparerSurfaces(rapport, zones);
      const fmt = (v: number | null) => (v === null ? '—' : v.toFixed(2).replace('.', ','));
      afficherRapport('Plan importé : ' + rapport.fichier,
        `<p>${rapport.murs} murs, ${rapport.ouvertures} ouvertures, ${rapport.pieces} pièces. Tout est marqué « importé » ; hauteurs et allèges non lues sont à vérifier (inspecteur).</p>
         <table style="width:100%;border-collapse:collapse;font-size:13px"><tr><th style="text-align:left">Pièce</th><th>Atelier</th><th>Designer</th><th>Écart</th></tr>
         ${E.map(e => `<tr><td>${esc(e.nom)}</td><td style="text-align:right">${fmt(e.atelier)}</td><td style="text-align:right">${fmt(e.designer)}</td><td style="text-align:right;color:${e.ecart === 0 ? '#3F7A5A' : '#A13A20'}">${e.ecart === null ? 'non fermée' : fmt(e.ecart)}</td></tr>`).join('')}</table>
         ${rapport.avertissements.length ? '<p><b>À reprendre</b></p><ul>' + rapport.avertissements.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul>' : '<p style="color:#3F7A5A">Rien à reprendre.</p>'}`);
    };
    i.click();
  }

  /** dessiner les traits du plan source dans une image PNG, et son calage exact sur le plan */
  async function traceEnImage(t: NonNullable<ReturnType<typeof traitsSource>>): Promise<{ image: Blob; calage: { scale: number; rotation: number; tx: number; ty: number } }> {
    const { xmin, ymin, xmax, ymax } = t.boite;
    const s = Math.max((xmax - xmin) / 4_000, (ymax - ymin) / 4_000, 5);        // mm par pixel
    const marge = 10;
    const c = document.createElement('canvas');
    c.width = Math.ceil((xmax - xmin) / s) + 2 * marge; c.height = Math.ceil((ymax - ymin) / s) + 2 * marge;
    const g = c.getContext('2d')!;
    g.strokeStyle = '#7A4A3A'; g.lineWidth = 1.5; g.beginPath();
    for (const [a, b] of t.traits) { g.moveTo((a.x - xmin) / s + marge, (ymax - a.y) / s + marge); g.lineTo((b.x - xmin) / s + marge, (ymax - b.y) / s + marge) }
    g.stroke();
    const image = await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('image vide'))), 'image/png'));
    /* pixel (u, v) → plan : x = tx + s·u, y = ty − s·v (voir building/fond.ts) */
    return { image, calage: { scale: s, rotation: 0, tx: xmin - marge * s, ty: ymax + marge * s } };
  }

  function afficherRapport(t: string, html: string) {
    const v = document.createElement('div'); v.className = 'voile';
    v.innerHTML = `<div class="boite" style="width:min(560px,94vw)"><h2>${esc(t)}</h2>${html}<div class="pied"><button class="prim">OK</button></div></div>`;
    v.querySelector<HTMLButtonElement>('button')!.onclick = () => v.remove();
    v.onkeydown = e => { if (e.key === 'Escape' || e.key === 'Enter') v.remove() };
    racine.querySelector('.cpd')!.appendChild(v);
    v.querySelector<HTMLButtonElement>('button')!.focus();
  }

  async function nommerPiece(niv: string, point: Point) {
    const t = typePiece ? TYPES_PIECES.find(x => x.libelle === typePiece) : undefined;
    if (t) { faire('Pièce ' + t.libelle, [{ type: 'creerPiece', niveau: niv, point, nom: nomLibre(t.libelle), usage: t.usage, humide: !!t.humide }]); return }
    const r = await dialogue('Nommer la pièce', [{ cle: 'nom', libelle: 'Nom', valeur: '' }, { cle: 'usage', libelle: 'Usage', valeur: 'living', options: USAGES }]);
    if (r && r['nom']!.trim()) faire('Pièce ' + r['nom'], [{ type: 'creerPiece', niveau: niv, point, nom: r['nom']!, usage: r['usage'] as RoomUsage }]);
  }
  async function calerParDistance(id: string, image: [Point, Point]) {
    const r = await dialogue('Caler le fond', [{ cle: 'd', libelle: 'Distance réelle entre les deux points (m)', valeur: '' }]);
    choisir('selection'); selection = id;
    if (!r) return;
    if (faire('Caler le fond', [{ type: 'calerFond', id, image, distance: mm(r['d']!) }])) toast('Fond calé. Vérifiez une autre cote du plan, puis verrouillez-le.');
  }

  /* ---------- dialogues, palette, messages ---------- */
  /** une boîte de saisie ; « lignes » : un texte sur plusieurs lignes (une adresse, une liste) */
  function dialogue(t: string, champs: { cle: string; libelle: string; valeur: string; options?: Record<string, string>; lignes?: number }[]): Promise<Record<string, string> | null> {
    return new Promise(res => {
      const v = document.createElement('div'); v.className = 'voile';
      v.innerHTML = `<form class="boite"><h2>${esc(t)}</h2>${champs.map(c => `<label>${esc(c.libelle)}${c.options
        ? `<select name="${c.cle}">${Object.entries(c.options).map(([k, l]) => `<option value="${k}" ${k === c.valeur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
        : c.lignes ? `<textarea name="${c.cle}" rows="${c.lignes}">${esc(c.valeur)}</textarea>`
        : `<input name="${c.cle}" value="${esc(c.valeur)}" autocomplete="off">`}</label>`).join('')}
        <div class="pied"><button type="button" class="non">Annuler</button><button class="prim">Valider</button></div></form>`;
      const fin = (r: Record<string, string> | null) => { v.remove(); res(r) };
      v.querySelector('form')!.onsubmit = e => { e.preventDefault(); const d = new FormData(e.target as HTMLFormElement); fin(Object.fromEntries(champs.map(c => [c.cle, String(d.get(c.cle) ?? '')]))) };
      v.querySelector<HTMLButtonElement>('.non')!.onclick = () => fin(null);
      v.onkeydown = e => { if (e.key === 'Escape') fin(null) };
      racine.querySelector('.cpd')!.appendChild(v);
      v.querySelector<HTMLInputElement>('input,select,textarea')?.focus();
    });
  }
  let minuterie = 0;
  function toast(t: string, erreur = false) {
    racine.querySelector('.toast')?.remove();
    const e = document.createElement('div'); e.className = 'toast' + (erreur ? ' err' : ''); e.textContent = t;
    main.appendChild(e);
    clearTimeout(minuterie); minuterie = window.setTimeout(() => e.remove(), erreur ? 6000 : 3000);
  }
  /** l'aperçu d'une coupe dans l'inspecteur : un petit dessin SVG (élévation au-delà, parties coupées pleines, terrain) */
  function apercuCoupe(l: LigneDeCoupe): string {
    const C = coupe(maquette(h.projet), l), B = C.boite;
    if (!B) return '<div class="note">Rien à couper ici.</div>';
    /* la hauteur de l'aperçu suit celle de la coupe (entre 60 et 200 px), sans vide au-dessus */
    const L = 280, dz = Math.max(1, Math.max(B.zmax, 0) - Math.min(B.zmin, 0)), k = Math.min((L - 20) / Math.max(1, B.umax - B.umin), 180 / dz), H = Math.max(60, Math.round(dz * k + 20));
    const X = (u: number) => (10 + (u - B.umin) * k).toFixed(1), Y = (z: number) => (H - 10 - (z - Math.min(B.zmin, 0)) * k).toFixed(1);
    const poly = (P: { u: number; z: number }[], fond: string, ep: number) => `<polygon points="${P.map(q => X(q.u) + ',' + Y(q.z)).join(' ')}" fill="${fond}" stroke="#1A2B36" stroke-width="${ep}"/>`;
    const vues = C.vues.map(f => poly(f.points, f.matiere === 'vitrage' ? '#D9E6EE' : ['tuile', 'ardoise', 'zinc', 'bac_acier'].includes(f.matiere) ? '#E8D5CC' : '#FFFFFF', 0.3)).join('');
    const coupees = C.coupees.map(c => poly(c.points, c.matiere === 'vitrage' ? '#9FBFD3' : c.matiere === 'porte' ? '#B89A7C' : '#3B4A55', 0.4)).join('');
    return `<svg viewBox="0 0 ${L} ${H}" width="100%" role="img" aria-label="Aperçu de la coupe ${esc(l.nom)}-${esc(l.nom)}">${vues}${coupees}<line x1="0" x2="${L}" y1="${Y(0)}" y2="${Y(0)}" stroke="#1A2B36" stroke-width="1.2"/></svg>`;
  }
  /** le PDF des seules coupes (sans les plans) */
  async function exporterCoupes() {
    try {
      const { planchesPdf } = await import('../export/planche');
      const u = planchesPdf(h.projet, { ...await signature(), niveaux: [], cotation: true, mobilier: false, coupe: true, indice: 'A', date: new Date().toLocaleDateString('fr-FR') });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([u], { type: 'application/pdf' }));
      a.download = (h.projet.name || 'projet') + ' - coupes A3.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('PDF enregistré : ' + a.download);
    } catch (e) { toast('Export impossible : ' + String((e as Error)?.message ?? e), true) }
  }
  /** poser un modèle de maison sur le projet vide (une transaction : un seul « annuler ») */
  function poserModele(id: string) {
    const md = modeleMaison(id), b = h.projet.buildings[0];
    if (!md || !b) return;
    if (niveaux().some(x => Object.values(x.objects).some(o => o.type === 'wall'))) { toast('Le projet a déjà des murs : un modèle se pose sur un projet vide', true); return }
    const bas = [...b.floors].sort((x, y) => x.elevation - y.elevation)[0]!;
    if (faire('Modèle : ' + md.libelle, md.commandes({ batiment: b.id, niveau: bas.id, id: () => ulid() }))) { niveauId = bas.id; cadrerTout(); toast('Modèle posé : ' + md.libelle + ' — à adapter') }
  }
  /** les plans en DXF : un fichier par niveau (R12, mm, un calque par famille) */
  async function exporterDxf() {
    const r = await dialogue('Exporter en DXF', [
      { cle: 'niv', libelle: 'Niveaux', valeur: 'courant', options: { courant: 'Ce niveau (' + niveau().name + ')', tous: 'Tous les niveaux (un fichier chacun)' } }]);
    if (!r) return;
    try {
      const { dxfNiveau, dxfOctets } = await import('../export/dxf');
      const F = r['niv'] === 'tous' ? niveaux() : [niveau()];
      for (const f of F) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([dxfOctets(dxfNiveau(h.projet, f))], { type: 'application/dxf' }));
        a.download = (h.projet.name || 'projet') + ' - ' + f.name + '.dxf';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
      toast(F.length > 1 ? F.length + ' fichiers DXF enregistrés' : 'DXF enregistré : ' + (h.projet.name || 'projet') + ' - ' + F[0]!.name + '.dxf');
    } catch (e) { toast('Export impossible : ' + String((e as Error)?.message ?? e), true) }
  }
  /** le dossier de permis complet, en un PDF numéroté (export/planche.ts, dossierPc) */
  async function exporterDossier(r: Record<string, string>) {
    try {
      const { dossierPc } = await import('../export/planche');
      const sig = await signature();
      const { octets, pieces } = dossierPc(h.projet, { ...sig, indice: (r['ind'] ?? 'A').trim() || 'A', date: new Date().toLocaleDateString('fr-FR'),
        ...(r['mo']?.trim() ? { maitreOuvrage: r['mo'] } : {}), ...(perspective && r['per'] !== 'non' ? { perspective } : {}), ...piecesDossier, ...(r['adr']?.trim() ? { adresseTerrain: r['adr'] } : {}), ...(r['ech'] && r['ech'] !== 'auto' ? { echelle: Number(r['ech']) } : {}) });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([octets], { type: 'application/pdf' }));
      a.download = (h.projet.name || 'projet') + ' - dossier PC.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      const manque = pieces.filter(p => p.page === null).map(p => p.code);
      toast('Dossier enregistré : ' + a.download + (manque.length ? ' — à joindre : ' + manque.join(', ') : ''));
    } catch (e) { toast('Export impossible : ' + String((e as Error)?.message ?? e), true) }
  }
  /** les plans en PDF (A3, à l'échelle, cotés, cartouche) : chargé à la demande */
  async function exporterPdf(doc: 'planches' | 'dossier' = 'planches') {
    const r = await dialogue('Exporter en PDF (A3)', [
      { cle: 'doc', libelle: 'Composer', valeur: doc, options: { planches: 'Les planches choisies ci-dessous', dossier: 'Le dossier de permis complet (garde et sommaire, PCMI 1 à 8 selon les pièces fournies, plans des niveaux)' } },
      { cle: 'pre', libelle: 'Plans', valeur: 'technique', options: { technique: 'Plans techniques (cotés)', presentation: 'Plans de présentation pour le client (sols en couleur, mobilier, sans cotes)' } },
      { cle: 'niv', libelle: 'Niveaux', valeur: 'courant', options: { courant: 'Ce niveau (' + niveau().name + ')', tous: 'Tous les niveaux (une page chacun)' } },
      { cle: 'ech', libelle: 'Échelle', valeur: 'auto', options: { auto: 'La plus grande qui tient', 50: '1/50', 75: '1/75', 100: '1/100', 200: '1/200' } },
      { cle: 'cot', libelle: 'Cotation', valeur: 'oui', options: { oui: 'Avec les chaînes de cotes', non: 'Sans' } },
      { cle: 'mob', libelle: 'Mobilier', valeur: 'oui', options: { oui: 'Avec le mobilier', non: 'Sans' } },
      ...(parcelleDuProjet(h.projet) ? [{ cle: 'mas', libelle: 'Plan de masse', valeur: 'oui', options: { oui: 'Ajouter le plan de masse (PCMI 2) : parcelle, reculs, emprise', non: 'Sans' } }] : []),
      ...(niveaux().some(f => Object.values(f.objects).some(x => x.type === 'roof')) ? [{ cle: 'toi', libelle: 'Plan de toiture', valeur: 'oui', options: { oui: 'Ajouter le plan de toiture (pans, pentes, faîtage)', non: 'Sans' } }] : []),
      ...(fondationsDuProjet(h.projet) ? [{ cle: 'fon', libelle: 'Plan de fondations', valeur: 'oui', options: { oui: 'Ajouter le plan de fondations (semelles, assise, trappes)', non: 'Sans' } }] : []),
      { cle: 'fac', libelle: 'Façades', valeur: 'oui', options: { oui: 'Ajouter la planche des quatre façades', non: 'Sans' } },
      { cle: 'cou', libelle: 'Coupes', valeur: 'oui', options: { oui: traitsDeCoupe(h.projet).length ? 'Ajouter les coupes ' + traitsDeCoupe(h.projet).map(l => l.nom + '-' + l.nom).join(', ') + ' (et leurs traits sur les plans)' : 'Ajouter une coupe A-A placée d’elle-même (ou tracez-la : outil K)', non: 'Sans' } },
      { cle: 'ind', libelle: 'Indice', valeur: 'A' },
      { cle: 'mo', libelle: 'Maître d’ouvrage (dossier)', valeur: h.projet.dossier?.maitreOuvrage ?? '' },
      { cle: 'adr', libelle: 'Adresse du terrain (dossier)', valeur: '' },
      ...(perspective ? [{ cle: 'per', libelle: 'Vue 3D (dossier)', valeur: 'oui', options: { oui: 'Ajouter la vue 3D gardée', non: 'Sans' } }] : [])]);
    if (!r) return;
    if (r['doc'] === 'dossier') { await exporterDossier(r); return }
    try {
      const { planchesPdf } = await import('../export/planche');
      const sig = await signature();
      const u = planchesPdf(h.projet, { ...sig,
        niveaux: r['niv'] === 'tous' ? niveaux().map(f => f.id) : [niveauId], cotation: r['cot'] === 'oui' && r['pre'] !== 'presentation', mobilier: r['mob'] === 'oui' || r['pre'] === 'presentation',
        ...(r['pre'] === 'presentation' ? { presentation: true } : {}), facades: r['fac'] === 'oui', coupe: r['cou'] === 'oui', masse: r['mas'] === 'oui', toiture: r['toi'] === 'oui', fondations: r['fon'] === 'oui',
        indice: (r['ind'] ?? 'A').trim() || 'A', date: new Date().toLocaleDateString('fr-FR'), ...(r['ech'] !== 'auto' ? { echelle: Number(r['ech']) } : {}),
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([u], { type: 'application/pdf' }));
      a.download = (h.projet.name || 'projet') + (r['pre'] === 'presentation' ? ' - plans de presentation' : ' - plans A3') + (r['niv'] === 'tous' ? '' : ' - ' + niveau().name) + '.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('PDF enregistré : ' + a.download);
    } catch (e) { toast('Export impossible : ' + String((e as Error)?.message ?? e), true) }
  }
  function exporter() {
    const b = new Blob([canonique(h.projet)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = (h.projet.name || 'projet') + '.cpdesigner.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const ACTIONS: Action[] = [
    ...OUTILS.map(o => ({ libelle: 'Outil : ' + o.libelle, touche: o.touche, faire: () => choisir(o.nom) })),
    { libelle: 'Annuler', touche: 'Ctrl+Z', faire: annuler }, { libelle: 'Rétablir', touche: 'Ctrl+Maj+Z', faire: retablir },
    { libelle: 'Tout voir', touche: 'F', faire: cadrerTout }, { libelle: 'Grille d’accrochage oui / non', touche: 'G', faire: basculerGrille },
    { libelle: 'Équerre du tracé des murs oui / non', touche: 'Q', faire: () => basculerEquerre() },
    { libelle: 'Mettre d’équerre les murs du niveau', faire: () => mettreDEquerre() },
    { libelle: 'Cotation automatique oui / non', faire: () => basculerCotation() },
    { libelle: 'Copier la sélection', touche: 'Ctrl+C', faire: () => void copierChoix() }, { libelle: 'Coller', touche: 'Ctrl+V', faire: commencerCollage },
    { libelle: 'Dupliquer la sélection', touche: 'Ctrl+D', faire: dupliquerChoix }, { libelle: 'Tout choisir sur ce niveau', touche: 'Ctrl+A', faire: () => choisirGroupe(Object.values(niveau().objects).filter(o => o.type !== 'underlay' && o.type !== 'roof' && o.type !== 'foundation' && o.type !== 'constraint').map(o => o.id)) },
    { libelle: 'Vue 3D / plan 2D', touche: '3', faire: () => void basculer3D() },
    { libelle: 'Poser un escalier', touche: 'E', faire: () => choisir('escalier') },
    { libelle: 'Ajouter un niveau', faire: () => void ajouterNiveau() }, { libelle: 'Importer un fond (PDF, image)', faire: importerFond },
    { libelle: 'Importer le RDC lu par l’atelier (modele.json)', faire: importerAtelier },
    ...MODELES_OUVERTURES.map(m => ({ libelle: 'Poser : ' + m.libelle, faire: () => { outils.reglages.modeleOuverture = m.id; choisir('ouverture') } })),
    ...MODELES_MEUBLES.map(m => ({ libelle: 'Meubler : ' + m.libelle, faire: () => { outils.reglages.modeleMeuble = m.id; choisir('mobilier') } })),
    { libelle: 'Marquer un jalon (APS V1, PC…)', visible: () => !!enr.marquerJalon, faire: async () => { const r = await dialogue('Jalon', [{ cle: 'n', libelle: 'Nom du jalon', valeur: 'APS V1' }]); if (r && enr.marquerJalon) { await enr.marquerJalon(r['n']!); toast('Jalon « ' + r['n'] + ' » : il partira avec le prochain enregistrement') } } },
    { libelle: 'Exporter les plans en PDF (A3)', faire: () => void exporterPdf() },
    { libelle: 'Exporter les plans en DXF (un fichier par niveau)', faire: () => void exporterDxf() },
    ...MODELES_MAISONS.map(md => ({ libelle: 'Démarrer d’un modèle : ' + md.libelle, faire: () => poserModele(md.id) })),
    { libelle: 'Exporter le projet (JSON)', faire: exporter },
    { libelle: 'Retour au suivi de chantiers', faire: () => { location.href = '../index.html' } },
  ];
  function palette() {
    if (racine.querySelector('.voile')) return;
    const v = document.createElement('div'); v.className = 'voile';
    v.innerHTML = `<div class="boite palette"><input placeholder="Que voulez-vous faire ?"><ul></ul></div>`;
    const inp = v.querySelector('input')!, ul = v.querySelector('ul')!;
    let k = 0, L: Action[] = [];
    const maj = () => {
      const q = inp.value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      L = ACTIONS.filter(a => (!a.visible || a.visible()) && a.libelle.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').includes(q));
      k = Math.min(k, Math.max(0, L.length - 1));
      ul.innerHTML = L.map((a, i) => `<li class="${i === k ? 'sel' : ''}" data-i="${i}"><span>${esc(a.libelle)}</span><kbd>${esc(a.touche ?? '')}</kbd></li>`).join('');
      ul.querySelectorAll('li').forEach(li => li.onclick = () => lancer(Number((li as HTMLElement).dataset['i'])));
    };
    const lancer = (i: number) => { const a = L[i]; v.remove(); a?.faire() };
    inp.oninput = () => { k = 0; maj() };
    inp.onkeydown = e => {
      if (e.key === 'ArrowDown') { k = Math.min(L.length - 1, k + 1); maj(); e.preventDefault() }
      else if (e.key === 'ArrowUp') { k = Math.max(0, k - 1); maj(); e.preventDefault() }
      else if (e.key === 'Enter') lancer(k);
      else if (e.key === 'Escape') v.remove();
    };
    v.onclick = e => { if (e.target === v) v.remove() };
    racine.querySelector('.cpd')!.appendChild(v);
    maj(); inp.focus();
  }

  /* ---------- départ ---------- */
  placerVues(); barreOutils(); panneaux(); boussole();
  /* l'aperçu 3D se charge une fois le plan affiché : il ne retarde pas l'ouverture */
  setTimeout(() => { void preparer3D().catch(() => { /* l'aperçu le dit ; le plan reste utilisable */ }) }, 600);
  requestAnimationFrame(() => {
    cam = { ...cam, largeur: main.clientWidth, hauteur: main.clientHeight };
    if (mursDroits(niveau()).length) cadrerTout(); else { cam = cadrer(cam, { xmin: 0, ymin: 0, xmax: 12_000, ymax: 10_000 }, 100); dessinerBientot() }        // la marge laisse libres les boutons posés sur le plan
    /* pour les vérifications automatiques (tests dans Chromium) : publié une fois la vue cadrée,
       sinon un premier clic calculé avant le cadrage tomberait ailleurs */
    (window as unknown as Record<string, unknown>)['cpDesigner'] = { projet: () => h.projet, niveau: () => niveauId, camera: () => cam, geometrieOuverture, vue3d: () => (en3D && vue3d ? vue3d.stats() : null), marcheur: () => (en3D && vue3d ? vue3d.marcheur() : null) };
  });
}

/** une ouverture a-t-elle encore les cotes de son modèle ? (sinon : « sur mesure ») */
const memesCotes = (o: Opening, m: ModeleOuverture): boolean => o.width === m.largeur && o.height === m.hauteur && o.kind === m.genre;

/** le symbole en plan d'un modèle, pour la bibliothèque (mur en gris, ouverture en trait) */
function symbole(m: ModeleOuverture): string {
  const W = 72, x0 = 14, x1 = 58, y = 20, e = 8;            // mur de y−e/2 à y+e/2, baie de x0 à x1
  const mur = `<rect x="0" y="${y - e / 2}" width="${x0}" height="${e}" fill="#26394A"/><rect x="${x1}" y="${y - e / 2}" width="${W - x1}" height="${e}" fill="#26394A"/>`;
  const tr = 'stroke="#1A2B36" stroke-width="1.2" fill="none"';
  let o = '';
  const n = m.vantaux, l = (x1 - x0) / n;
  if (m.genre === 'void') o = `<line x1="${x0}" y1="${y - e / 2}" x2="${x1}" y2="${y - e / 2}" ${tr} stroke-dasharray="3 2"/><line x1="${x0}" y1="${y + e / 2}" x2="${x1}" y2="${y + e / 2}" ${tr} stroke-dasharray="3 2"/>`;
  else if (m.manoeuvre === 'sliding') o = Array.from({ length: n }, (_, i) => `<line x1="${x0 + i * l - (i ? 3 : 0)}" y1="${y + (i % 2 ? 1.5 : -1.5)}" x2="${x0 + (i + 1) * l + (i < n - 1 ? 3 : 0)}" y2="${y + (i % 2 ? 1.5 : -1.5)}" ${tr}/>`).join('') + `<path d="M${x0 + 4} ${y - 7} l6 0 m-2 -2 l2 2 l-2 2" ${tr}/>`;
  else if (m.manoeuvre === 'fixed') o = `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" ${tr}/>`;
  else if (m.genre === 'garage_door') o = `<line x1="${x0}" y1="${y - e / 2}" x2="${x1}" y2="${y + e / 2}" ${tr} stroke-dasharray="3 2"/><line x1="${x0}" y1="${y + e / 2}" x2="${x1}" y2="${y - e / 2}" ${tr} stroke-dasharray="3 2"/>`;
  else {
    /* battants : un arc par vantail, côté intérieur (vers le bas) */
    const r = Math.min(l, 14);
    o = (m.genre === 'window' ? `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" ${tr}/>` : '') + Array.from({ length: n }, (_, i) => {
      const gauche = n === 1 || i % 2 === 0, px = gauche ? x0 + i * l : x0 + (i + 1) * l, s = gauche ? 1 : -1;
      return `<line x1="${px}" y1="${y + e / 2}" x2="${px}" y2="${y + e / 2 + r}" ${tr}/><path d="M${px} ${y + e / 2 + r} A${r} ${r} 0 0 ${gauche ? 0 : 1} ${px + s * r} ${y + e / 2}" ${tr} stroke-dasharray="2 2"/>`;
    }).join('');
  }
  return `<svg viewBox="0 0 ${W} 36" aria-hidden="true">${mur}${o}</svg>`;
}

/** le symbole en plan d'un meuble, pour la bibliothèque (le même dessin que sur le plan) */
function symboleMeuble(m: ModeleMeuble): string {
  const W = 72, H = 40, k = Math.min((W - 8) / m.largeur, (H - 6) / m.profondeur);
  const X = (x: number) => (W / 2 + x * k).toFixed(1), Y = (y: number) => (H / 2 - y * k).toFixed(1);
  const tr = 'stroke="#1A2B36" stroke-width="1"';
  const T = traits(m.forme, m.largeur, m.profondeur).map((t, i) => {
    /* (un attribut en double ne compte qu'une fois : le remplissage s'écrit une seule fois) */
    const plein = i === 0 && t.genre !== 'ligne' && !t.tirets ? 'fill="#fff"' : 'fill="none"';
    const pt = t.tirets ? ' stroke-dasharray="3 2"' : '';
    if (t.genre === 'rect') return `<rect x="${X(Math.min(t.x0, t.x1))}" y="${Y(Math.max(t.y0, t.y1))}" width="${(Math.abs(t.x1 - t.x0) * k).toFixed(1)}" height="${(Math.abs(t.y1 - t.y0) * k).toFixed(1)}" ${tr}${pt} ${plein}/>`;
    if (t.genre === 'ellipse') return `<ellipse cx="${X(t.cx)}" cy="${Y(t.cy)}" rx="${(t.rx * k).toFixed(1)}" ry="${(t.ry * k).toFixed(1)}" ${tr}${pt} ${plein}/>`;
    return `<line x1="${X(t.x0)}" y1="${Y(t.y0)}" x2="${X(t.x1)}" y2="${Y(t.y1)}" ${tr}${pt}/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${T.join('')}</svg>`;
}

function distSeg(p: Point, w: MurDroit): number {
  const dx = w.axis.b.x - w.axis.a.x, dy = w.axis.b.y - w.axis.a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - w.axis.a.x) * dx + (p.y - w.axis.a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - w.axis.a.x - t * dx, p.y - w.axis.a.y - t * dy);
}
