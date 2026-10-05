/* CP Designer — l'éditeur 2D.

   L'application ne fait que relier : gestes → outils → commandes →
   historique → enregistrement, et modèle → dessin. Aucune règle métier ici :
   une commande refusée l'est par le moteur, et la raison s'affiche telle
   quelle. Un aperçu (pendant un tracé ou un glissement) joue les commandes
   sur une copie, sans rien enregistrer. */
import type { BuildingObject, Floor, Mm, Opening, Point, Project, Roof, RoomUsage, Stair, Viewpoint, Wall } from '../model/types';
import { ulid, canonique } from '../model';
import { trouverNiveau } from '../model/projet';
import { annulerEnregistre, commandesColler, commandesSupprimer, copier, executer, nouvelHistorique, peutAnnuler, peutRetablir, resumePressePapiers, retablirEnregistre, type Acteur, type Commande, type Historique, type PressePapiers } from '../engine';
import { planDuNiveau, mursDroits, geometrieOuverture, cotationExterieure, placeOuverture, positionPour, toitureDuNiveau, geometrieEscalier, hauteurAFranchir, niveauDArrivee, tremiesDuNiveau, parcelleDuProjet, empriseAuSol, aireEmprise, surfaceTerrain, reculs, placerParcelle, orienterParcelle, maisonDansParcelle, bilanAmenagements, surfacesReglementaires, REFERENCES, pointsDeVue, type MurDroit } from '../building';
import { boite as boiteAnneau, mm2EnM2 } from '../geometry/polygon';
import { distance, normaliser, soustraire } from '../geometry/vecteur';
import { cadrer, glisser, pixelsEnMm, versEcran, versMonde, zoomer, type Camera } from './camera';
import { dessiner, NOMS_ACCROCHE, type Scene } from './dessin';
import { Outils, OUVERTURES, type Effet, type Geste, type NomOutil } from './outils';
import { dessinCote, texteCote } from './cotes';
import { ouvrirSession, type Enregistreur } from './session';
import { commandesImport, comparerSurfaces, lireModeleAtelier, traitsSource } from '../import/atelier';
import { imageDuFond, importerFichier, nombrePages, type ImageFond } from './fonds';
import type { Accroche } from '../building/accrochage';
import { maquette } from '../vue3d/maquette';
import { PAREMENTS, PEINTURES, SOLS } from '../catalogue/materiaux';
import { MODELES_MAISONS, modeleMaison } from '../catalogue/modeles-maisons';
import { geometrieFenetreToit, TAILLES_FENETRE_TOIT } from '../building/fenetres-toit';
import { GENRES_AMENAGEMENT, finitionAmenagement, finitionsDe, type GenreAmenagement } from '../catalogue/amenagements';
import { coupe, ligneDe, traitsDeCoupe, type LigneDeCoupe } from '../vue3d/coupe';
import type { Vue3D } from './vue3d';
import type { ImageDossier } from '../export/planche';
import { FAMILLES, MANOEUVRES, MODELES_OUVERTURES, manoeuvreDe, modeleOuverture, type ModeleOuverture } from '../catalogue/ouvertures';
import { FAMILLES_MEUBLES, MODELES_MEUBLES, type ModeleMeuble } from '../catalogue/mobilier';
import { traits } from '../building/mobilier';

const USAGES: Record<RoomUsage, string> = {
  living: 'Séjour', bedroom: 'Chambre', kitchen: 'Cuisine', bathroom: 'Salle d’eau / de bains', wc: 'WC', circulation: 'Circulation',
  storage: 'Rangement', garage: 'Garage', technical: 'Technique', other: 'Autre',
};
const ROLES: Record<Wall['role'], string> = { exterior: 'Mur extérieur', partition: 'Cloison', bearing_interior: 'Refend' };
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
.cpd{position:fixed;inset:0;display:grid;grid-template-columns:52px 1fr 300px;grid-template-rows:48px 1fr 28px;font:13px/1.4 system-ui,-apple-system,sans-serif;color:#1A2B36;background:#FBFAF7}
.cpd header{grid-column:1/4;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid #E4DED3;background:#fff}
.cpd header .marque{color:#C5563A;font-weight:700;letter-spacing:.05em;font-size:12px}
.cpd header input.nom{font:600 15px system-ui;border:1px solid transparent;border-radius:6px;padding:3px 6px;min-width:120px;color:#1A2B36;background:none}
.cpd header input.nom:hover,.cpd header input.nom:focus{border-color:#DDD5C8;background:#fff}
.cpd header .esp{flex:1}
.cpd .etat{font-size:12px;padding:3px 8px;border-radius:12px;background:#EEF3EF;color:#3F7A5A;white-space:nowrap;max-width:420px;overflow:hidden;text-overflow:ellipsis}
.cpd .etat.local,.cpd .etat.hors_ligne,.cpd .etat.en_attente{background:#FBF1DF;color:#8A5A12}
.cpd .etat.conflit{background:#FBE3DA;color:#A13A20}
.cpd button,.cpd select,.cpd input{font:inherit;color:inherit}
.cpd button{border:1px solid #DDD5C8;background:#fff;border-radius:6px;padding:4px 9px;cursor:pointer}
.cpd button:hover{border-color:#C5563A}
.cpd button:disabled{opacity:.4;cursor:default}
.cpd button.prim{background:#C5563A;border-color:#C5563A;color:#fff}
.cpd button.dang{color:#A13A20}
.cpd nav{grid-column:1;grid-row:2/3;display:flex;flex-direction:column;gap:4px;padding:6px;border-right:1px solid #E4DED3;background:#fff}
.cpd nav button{width:40px;height:40px;padding:0;font-size:17px;display:flex;align-items:center;justify-content:center;position:relative}
.cpd nav button.actif{background:#1A2B36;color:#fff;border-color:#1A2B36}
.cpd nav button small{position:absolute;right:2px;bottom:0;font-size:9px;opacity:.6}
.cpd main{grid-column:2;grid-row:2/3;position:relative;overflow:hidden;touch-action:none}
.cpd main canvas{position:absolute;inset:0;width:100%;height:100%;cursor:crosshair}
.cpd aside{grid-column:3;grid-row:2/3;overflow:auto;border-left:1px solid #E4DED3;background:#fff;padding:12px}
.cpd aside h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#6E7B84;margin:14px 0 6px}
.cpd aside h3:first-child{margin-top:0}
.cpd aside label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0}
.cpd aside label input:not([type=checkbox]):not([type=range]),.cpd aside label select{width:130px;border:1px solid #DDD5C8;border-radius:5px;padding:3px 6px;background:#fff}
.cpd aside .ligne{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.cpd aside .note{font-size:12px;color:#6E7B84}
.cpd aside .alerte{font-size:12px;padding:6px 8px;border-left:3px solid #C5563A;background:#FBF3EF;margin:4px 0}
.cpd aside .ok{font-size:12px;padding:6px 8px;border-left:3px solid #3F7A5A;background:#EEF3EF}
.cpd aside table{width:100%;border-collapse:collapse;font-size:12px}
.cpd aside td{padding:3px 0;border-bottom:1px solid #F0EBE3}
.cpd aside td:last-child{text-align:right;white-space:nowrap}
.cpd aside .niv{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer}
.cpd aside .niv.actif{background:#F5F1EA;font-weight:600}
.cpd aside .chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:2px 6px;border-radius:10px;background:#EEF3EF;color:#3F7A5A}
.cpd aside .chip button{border:none;padding:0 2px;background:none;color:inherit}
.cpd footer{grid-column:1/4;display:flex;gap:16px;align-items:center;padding:0 12px;border-top:1px solid #E4DED3;background:#fff;font-size:12px;color:#6E7B84}
.cpd footer .acc{color:#C5563A;font-weight:600}
.cpd .toast{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);background:#1A2B36;color:#fff;padding:8px 14px;border-radius:8px;max-width:70%;box-shadow:0 4px 16px rgba(0,0,0,.15)}
.cpd .toast.err{background:#A13A20}
.cpd .voile{position:fixed;inset:0;background:rgba(26,43,54,.35);display:flex;align-items:flex-start;justify-content:center;padding-top:min(12vh,80px);z-index:10}
.cpd .boite{background:#fff;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.2);width:min(440px,92vw);padding:16px;box-sizing:border-box;max-height:calc(100vh - min(12vh,80px) - 16px);overflow-y:auto}
.cpd .boite h2{font-size:16px;margin:0 0 10px}
.cpd .boite label{display:block;margin:8px 0}
.cpd .boite label input,.cpd .boite label select{display:block;width:100%;box-sizing:border-box;margin-top:3px;border:1px solid #DDD5C8;border-radius:6px;padding:6px 8px}
.cpd .boite .pied{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;position:sticky;bottom:-16px;background:#fff;padding:8px 0 16px;margin-bottom:-16px}
.cpd .palette input{width:100%;box-sizing:border-box;border:1px solid #DDD5C8;border-radius:6px;padding:8px 10px;font-size:15px}
.cpd .palette ul{list-style:none;margin:8px 0 0;padding:0;max-height:50vh;overflow:auto}
.cpd .palette li{padding:7px 10px;border-radius:6px;cursor:pointer;display:flex;justify-content:space-between}
.cpd .palette li.sel{background:#F5F1EA}
.cpd .palette li kbd{font-size:11px;color:#6E7B84}
.cpd .biblio details{margin:4px 0}
.cpd .biblio summary{cursor:pointer;font-weight:600;padding:4px 0}
.cpd .biblio .tuiles{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:4px 0 8px}
.cpd .biblio .tuile{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px;border:1px solid #DDD5C8;border-radius:8px;background:#fff;cursor:grab;font-size:11px;line-height:1.25;text-align:center;user-select:none}
.cpd .biblio .tuile:hover{border-color:#C5563A}
.cpd .biblio .tuile.choisi{border-color:#C5563A;background:#FBF3EF;box-shadow:0 0 0 1px #C5563A inset}
.cpd .biblio .tuile svg{width:72px;height:34px}
.cpd main .hote3d{position:absolute;inset:0;display:none}
.cpd main .hote3d canvas{cursor:grab}
.cpd.en3d main .hote3d{display:block}
.cpd.en3d main > canvas{visibility:hidden}
.cpd header button.b3d{font-weight:700}
.cpd header button.b3d.actif{background:#1A2B36;color:#fff;border-color:#1A2B36}
.cpd .saisie{position:absolute;z-index:5;width:150px;border:2px solid #C5563A;border-radius:6px;padding:4px 8px;font:600 14px system-ui;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.15)}
@media (max-width:820px){.cpd{grid-template-columns:48px 1fr;grid-template-rows:48px 1fr 40vh 28px}.cpd aside{grid-column:1/3;grid-row:3/4;border-left:none;border-top:1px solid #E4DED3}.cpd footer{grid-row:4/5}}
`;

interface Action { libelle: string; touche?: string; faire: () => void; visible?: () => boolean }

export async function demarrer(racine: HTMLElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  racine.innerHTML = `<style>${CSS}</style><div class="cpd"><header>
      <span class="marque">CP DESIGNER</span>
      <input class="nom" title="Nom du projet" spellcheck="false">
      <select class="niveaux" title="Niveau affiché"></select>
      <button class="annuler" title="Annuler (Ctrl+Z)">↶</button><button class="retablir" title="Rétablir (Ctrl+Maj+Z)">↷</button>
      <span class="esp"></span>
      <span class="etat" title="Enregistrement"></span>
      <button class="bpdf" title="Exporter les plans en PDF (A3, cotés, cartouche)">PDF</button>
      <button class="bdxf" title="Exporter les plans en DXF (bureaux d’études, autres logiciels)">DXF</button>
      <button class="b3d" title="Vue 3D (touche 3) — Échap pour revenir au plan">3D</button>
      <button class="cmdk" title="Toutes les actions">⌘K</button>
      <a href="../index.html" style="color:#2C4A5E;font-size:12px">Suivi de chantiers</a>
    </header>
    <nav></nav>
    <main><canvas></canvas><div class="hote3d"></div></main>
    <aside></aside>
    <footer><span class="aide"></span><span class="esp" style="flex:1"></span><span class="acc"></span><span class="coord"></span></footer></div>`;
  const $ = <T extends Element>(s: string) => racine.querySelector(s) as T;
  const canvas = $<HTMLCanvasElement>('canvas'), main = $<HTMLElement>('main'), aside = $<HTMLElement>('aside'), nav = $<HTMLElement>('nav');
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
  let solsCouleur = (() => { try { return localStorage.getItem('cpDesigner:sols') === 'oui' } catch { return false } })();
  /* la vue 3D : chargée à la première ouverture */
  let vue3d: Vue3D | null = null, en3D = false, coupe3D = false, niveaux3D: 'tous' | 'jusqua' = 'tous', toit3D = true;

  const outils = new Outils(() => ({ projet: h.projet, niveau: niveauId, selection }));
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
    if (en3D && vue3d) { vue3d.mettreAJour(maquetteAffichee()); appliquerCoupe() }
    panneaux(); dessinerBientot();
  }

  /* ---------- vue 3D ---------- */
  const maquetteAffichee = () => maquette(h.projet, niveaux3D === 'jusqua' ? niveauId : undefined, { toiture: toit3D });
  /* « vue maquette » : murs coupés à 1,20 m au-dessus du sol du niveau affiché, comme une maison de poupée */
  function appliquerCoupe() { vue3d?.couper(coupe3D ? niveau().elevation + 1_200 : null) }
  async function basculer3D(oui = !en3D) {
    if (oui === en3D) return;
    if (!oui) vue3d?.visite(false);
    en3D = oui;
    racine.querySelector('.cpd')!.classList.toggle('en3d', oui);
    $<HTMLButtonElement>('.b3d').classList.toggle('actif', oui);
    if (oui) {
      choixMur = null; effet(outils.choisir('selection')); selection = null; barreOutils(); panneaux();
      try {
        if (!vue3d) { const { creerVue3D } = await import('./vue3d'); vue3d = await creerVue3D($<HTMLElement>('.hote3d')); if (photoSite) vue3d.photo(photoSite) }
        vue3d.mettreAJour(maquetteAffichee()); appliquerCoupe();
      } catch (e) {
        toast('La vue 3D n’a pas pu s’ouvrir sur ce navigateur (' + String((e as Error)?.message ?? e) + ')', true);
        en3D = false; racine.querySelector('.cpd')!.classList.remove('en3d'); $<HTMLButtonElement>('.b3d').classList.remove('actif');
      }
    }
    panneaux(); dessinerBientot();
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
    const dpr = window.devicePixelRatio || 1, l = main.clientWidth, ht = main.clientHeight;
    if (canvas.width !== Math.round(l * dpr) || canvas.height !== Math.round(ht * dpr)) { canvas.width = Math.round(l * dpr); canvas.height = Math.round(ht * dpr) }
    cam = { ...cam, largeur: l, hauteur: ht };
    const p = projetAffiche(), f = niveau(p);
    const L = niveaux(), i = L.findIndex(x => x.id === niveauId);
    for (const o of Object.values(f.objects)) if (o.type === 'underlay') chargerFond(o.fileKey, o.page);
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
      parcelleEnCours: outils.parcelleEnCours,
      coupes: traitsDeCoupe(p).map(({ id, niveau: n, ...l }) => (n === f.id ? { ...l, id } : l)),
      ...(toit?.ok ? { toitures: toit.toitures } : {}),
      ...(cotation ? { cotation: cotationExterieure(f, pixelsEnMm(cam, 24)) } : {}), places }, dpr);
    $<HTMLElement>('.acc').textContent = accroche && accroche.genre !== 'libre' ? 'Accroché : ' + NOMS_ACCROCHE[accroche.genre] : '';
  }
  function chargerFond(cle: string, page?: number) {
    if (images.has(cle) || enChargement.has(cle)) return;
    enChargement.add(cle);
    imageDuFond(cle, page, undefined, enr.fonds).then(i => { if (i) { images.set(cle, i); dessinerBientot() } else toast('Le fichier d’un fond n’est ni sur cet appareil ni sur le serveur : réimportez-le pour le voir.', true) })
      .catch(e => toast('Fond illisible : ' + String((e as Error)?.message ?? e), true));
  }
  new ResizeObserver(() => dessinerBientot()).observe(main);

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
      choisirGroupe(Object.values(niveau().objects).filter(o => o.type !== 'underlay' && o.type !== 'roof' && o.type !== 'constraint').map(o => o.id));
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
    if ((e.key === 'Delete' || e.key === 'Backspace') && choisis().length) { e.preventDefault(); supprimerChoix(); return }
    /* un chiffre pendant un tracé : la longueur se tape (comme sur les logiciels de plans) */
    if (/^[0-9.,]$/.test(e.key) && outils.departTrace && ['mur', 'cloison', 'rectangle', 'parcelle', 'amenagement'].includes(outils.outil)) { e.preventDefault(); ouvrirSaisie(e.key); return }
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
  });
  window.addEventListener('keyup', e => { if (e.key === ' ') { espace = false; canvas.style.cursor = '' } });

  /** la petite case où l'on tape une longueur (4,50), un angle (4,50<90) ou un rectangle (10x8) */
  function ouvrirSaisie(premier: string) {
    main.querySelector('.saisie')?.remove();
    const i = document.createElement('input');
    i.className = 'saisie'; i.value = premier; i.autocomplete = 'off';
    i.placeholder = outils.outil === 'rectangle' ? '10x8' : outils.outil === 'parcelle' ? '25,30 ou 25,30<90' : '4,50 ou 4,50<90';
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
    { nom: 'selection', icone: '↖', libelle: 'Sélection', touche: 'V' }, { nom: 'mur', icone: '▬', libelle: 'Mur', touche: 'M' },
    { nom: 'cloison', icone: '▭', libelle: 'Cloison', touche: 'C' }, { nom: 'rectangle', icone: '⬚', libelle: 'Rectangle de murs', touche: 'R' },
    { nom: 'ouverture', icone: '◫', libelle: 'Ouverture', touche: 'O' }, { nom: 'mobilier', icone: '▣', libelle: 'Mobilier', touche: 'B' },
    { nom: 'escalier', icone: '▤', libelle: 'Escalier', touche: 'E' }, { nom: 'coupe', icone: '✂', libelle: 'Trait de coupe', touche: 'K' },
    { nom: 'parcelle', icone: '⛶', libelle: 'Parcelle (limite du terrain)', touche: 'L' },
    { nom: 'amenagement', icone: '❀', libelle: 'Aménagement extérieur (clôture, terrasse, allée…)', touche: 'A' },
    { nom: 'pointdevue', icone: '◉', libelle: 'Point de prise de vue (photographies du dossier)', touche: 'I' },
    { nom: 'fenetretoit', icone: '◇', libelle: 'Fenêtre de toit', touche: 'H' },
    { nom: 'piece', icone: '⌂', libelle: 'Pièce', touche: 'P' }, { nom: 'cote', icone: '↔', libelle: 'Cote', touche: 'D' },
  ];
  const TOUCHES: Record<string, NomOutil> = Object.fromEntries(OUTILS.map(o => [o.touche.toLowerCase(), o.nom]));
  function choisir(o: NomOutil) {
    if (en3D) void basculer3D(false);
    /* la parcelle se trace sur le niveau le plus bas (le terrain) */
    /* une fenêtre de toit se pose sur la toiture : on passe au niveau qui la porte */
    if (o === 'fenetretoit' && !Object.values(niveau().objects).some(x => x.type === 'roof')) {
      const t = niveaux().find(f => Object.values(f.objects).some(x => x.type === 'roof'));
      if (!t) { toast('Aucune toiture : posez-la d’abord (panneau du niveau ou de la 3D), puis ses fenêtres', true); return }
      niveauId = t.id; selection = null; apres();
    }
    if (o === 'parcelle' || o === 'amenagement' || o === 'pointdevue') { const bas = [...niveaux()].sort((a, b) => a.elevation - b.elevation)[0]; if (bas && bas.id !== niveauId) { niveauId = bas.id; selection = null; apres() } }
    choixMur = null; if (o === 'ouverture' || o === 'mobilier' || o === 'escalier' || o === 'coupe' || o === 'parcelle' || o === 'amenagement' || o === 'pointdevue' || o === 'fenetretoit') selection = null; effet(outils.choisir(o)); barreOutils(); panneaux() }
  function barreOutils() {
    nav.innerHTML = OUTILS.map(o => `<button data-o="${o.nom}" class="${outils.outil === o.nom ? 'actif' : ''}" title="${o.libelle} (${o.touche})">${o.icone}<small>${o.touche}</small></button>`).join('');
    nav.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.onclick = () => choisir(b.dataset['o'] as NomOutil));
    $<HTMLElement>('.aide').textContent = choixMur ? choixMur.libelle : outils.aide;
  }
  function basculerCotation(oui = !cotation) {
    cotation = oui;
    try { localStorage.setItem('cpDesigner:cotation', oui ? 'oui' : 'non') } catch { /* navigation privée : le choix vaut pour la séance */ }
    panneaux(); dessinerBientot();
  }
  function basculerGrille() { outils.reglages.grille = outils.reglages.grille ? 0 : 100; toast(outils.reglages.grille ? 'Grille d’accrochage : 10 cm' : 'Grille d’accrochage coupée'); panneaux() }
  function cadrerTout() {
    const pts: Point[] = [];
    for (const w of mursDroits(niveau())) pts.push(w.axis.a, w.axis.b);
    if (pts.length) cam = cadrer(cam, boiteAnneau(pts), cotation ? 110 : 60);        // la place des cotes autour
    dessinerBientot();
  }

  /* ---------- en-tête ---------- */
  const nom = $<HTMLInputElement>('input.nom');
  nom.onchange = () => { if (!faire('Renommer le projet', [{ type: 'renommerProjet', nom: nom.value }])) nom.value = h.projet.name };
  $<HTMLButtonElement>('.annuler').onclick = annuler;
  $<HTMLButtonElement>('.retablir').onclick = retablir;
  $<HTMLButtonElement>('.cmdk').onclick = () => palette();
  $<HTMLButtonElement>('.b3d').onclick = () => void basculer3D();
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
    if (en3D) panneau3D(); else if (groupe.length) panneauGroupe(f); else if (o) inspecteur(f, o); else if (outils.outil === 'ouverture') bibliotheque(); else if (outils.outil === 'mobilier') bibliothequeMobilier(); else if (outils.outil === 'escalier') panneauEscalier(f); else if (outils.outil === 'amenagement') panneauAmenagement(); else panneauNiveau(f);
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
        const w = o as MurDroit, L = distance(w.axis.a, w.axis.b);
        A.append(titre(ROLES[w.role]),
          champ('Longueur (m)', (L / 1000).toFixed(3), v => longueurMur(w, mm(v)), 'number'),
          champ('Épaisseur (cm)', w.thickness / 10, v => faire('Épaisseur', [{ type: 'modifierMur', id: w.id, epaisseur: ent(v) * 10 }]), 'number'),
          champ('Hauteur (m)', (w.height / 1000).toFixed(2), v => faire('Hauteur', [{ type: 'modifierMur', id: w.id, hauteur: mm(v) }]), 'number'),
          champ('Type', w.role, v => faire('Type de mur', [{ type: 'modifierMur', id: w.id, role: v as Wall['role'] }]), 'text', ROLES),
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
      case 'constraint':
        A.append(titre('Contrainte'), bloc(CONTRAINTES[o.kind] ?? o.kind), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
    }
  }

  /** la bibliothèque d'ouvertures : un clic choisit le modèle, on peut aussi le glisser sur un mur */
  function bibliotheque() {
    const A = aside, choisi = outils.modele.id;
    A.append(titre('Bibliothèque d’ouvertures'), bloc('Choisissez un modèle, puis cliquez sur un mur — ou glissez-le sur le mur. Dimensions de tableau courantes, à confirmer avec le menuisier ; tout se règle ensuite.'));
    const b = document.createElement('div'); b.className = 'biblio';
    for (const [fam, nomFam] of Object.entries(FAMILLES)) {
      const M = MODELES_OUVERTURES.filter(m => m.famille === fam);
      const d = document.createElement('details');
      d.open = M.some(m => m.id === choisi) || fam === 'fenetres';
      d.innerHTML = `<summary>${esc(nomFam)}</summary><div class="tuiles">${M.map(m => `<div class="tuile${m.id === choisi ? ' choisi' : ''}" draggable="true" data-m="${m.id}" title="${esc(m.libelle)} — ${esc(MANOEUVRES[m.manoeuvre])}">${symbole(m)}<span>${esc(m.libelle)}</span></div>`).join('')}</div>`;
      b.append(d);
    }
    b.querySelectorAll<HTMLElement>('.tuile').forEach(t => {
      t.onclick = () => { outils.reglages.modeleOuverture = t.dataset['m']!; panneaux(); $<HTMLElement>('.aide').textContent = 'Cliquez sur un mur pour poser : ' + outils.modele.libelle };
      t.ondragstart = e => { outils.reglages.modeleOuverture = t.dataset['m']!; e.dataTransfer?.setData('text/plain', 'cp-ouverture:' + t.dataset['m']); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy' };
    });
    A.append(b);
  }

  /** la visite à hauteur d'homme (vue 3D) : on y entre, on en sort */
  function visite(oui: boolean) {
    if (!vue3d) return;
    vue3d.visite(oui);
    $<HTMLElement>('.hote3d').focus?.();
    panneaux();
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
        ligne(bouton('Ajouter une toiture', () => faire('Toiture', [{ type: 'creerToiture', niveau: f.id, genre: 'hip', pente: 35, debord: 500, couverture: 'tile' }]), 'prim')));
      return;
    }
    const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierToiture' }>>) => faire(t, [{ type: 'modifierToiture', id: r.id, ...c }]);
    A.append(champ('Type', r.kind, v => mod('Type de toiture', { genre: v as Roof['kind'], ...(v === 'flat' ? { couverture: 'gravel' as const } : r.covering === 'gravel' ? { couverture: 'tile' as const } : {}) }), 'text', TOITURES));
    if (r.kind !== 'flat') A.append(champ('Pente (°)', r.pitch, v => mod('Pente', { pente: ent(v) }), 'number'));
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

  /** la bibliothèque de mobilier : un clic choisit le meuble ; on le pose d'un clic (ou en le glissant), il se plaque contre le mur proche */
  function bibliothequeMobilier() {
    const A = aside, choisi = outils.meuble.id;
    A.append(titre('Mobilier'), bloc('Choisissez un meuble, puis cliquez pour le poser — ou glissez-le sur le plan. Près d’un mur, il s’y plaque et se tourne vers la pièce ; près d’un angle, il s’y cale. T : tourner · Alt : pose libre. Dimensions courantes, réglables ensuite.'));
    const b = document.createElement('div'); b.className = 'biblio';
    for (const [fam, nomFam] of Object.entries(FAMILLES_MEUBLES)) {
      const M = MODELES_MEUBLES.filter(m => m.famille === fam);
      const d = document.createElement('details');
      d.open = M.some(m => m.id === choisi);
      d.innerHTML = `<summary>${esc(nomFam)}</summary><div class="tuiles">${M.map(m => `<div class="tuile${m.id === choisi ? ' choisi' : ''}" draggable="true" data-m="${m.id}" title="${esc(m.libelle)} — ${texteCote(m.largeur)} × ${texteCote(m.profondeur)} m">${symboleMeuble(m)}<span>${esc(m.libelle)}</span></div>`).join('')}</div>`;
      b.append(d);
    }
    b.querySelectorAll<HTMLElement>('.tuile').forEach(t => {
      t.onclick = () => { outils.reglages.modeleMeuble = t.dataset['m']!; panneaux(); $<HTMLElement>('.aide').textContent = 'Cliquez pour poser : ' + outils.meuble.libelle + ' (T : tourner)' };
      t.ondragstart = e => { outils.reglages.modeleMeuble = t.dataset['m']!; e.dataTransfer?.setData('text/plain', 'cp-meuble:' + t.dataset['m']); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy' };
    });
    A.append(b);
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

  function panneauNiveau(f: Floor) {
    const A = aside, plan = planDuNiveau(f);
    A.append(titre('Niveaux'));
    for (const n of niveaux()) {
      const e = document.createElement('div');
      e.className = 'niv' + (n.id === niveauId ? ' actif' : '');
      e.innerHTML = `<span style="flex:1">${esc(n.name)}</span><span class="note">${(n.elevation / 1000).toFixed(2).replace('.', ',')} m</span>`;
      e.onclick = () => { niveauId = n.id; selection = null; apres() };
      A.append(e);
    }
    A.append(champ('Nom', f.name, v => faire('Nom du niveau', [{ type: 'modifierNiveau', id: f.id, nom: v }])),
      champ('Altitude du sol (m)', (f.elevation / 1000).toFixed(2), v => faire('Altitude', [{ type: 'modifierNiveau', id: f.id, altitude: mm(v) }]), 'number'),
      champ('Hauteur sous plafond (m)', (f.height / 1000).toFixed(2), v => faire('Hauteur', [{ type: 'modifierNiveau', id: f.id, hauteur: mm(v) }]), 'number'),
      ligne(bouton('+ Niveau', ajouterNiveau), bouton('Supprimer ce niveau', () => {
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

    /* les pièces images du dossier de permis : ce que le Designer ne dessine pas, fourni par l'utilisateur */
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

    A.append(titre('Contrôle'));
    if (plan.alertes.length) for (const a of plan.alertes) A.append(bloc('⚠️ ' + esc(a.message), 'alerte'));
    else A.append(bloc(mursDroits(f).length ? '✓ Aucune alerte sur ce niveau' : 'Aucun mur : choisissez l’outil Mur (M) pour commencer.', 'ok'));

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

    A.append(titre('Réglages'),
      champ('Épaisseur des murs (cm)', outils.reglages.epaisseurMur / 10, v => { outils.reglages.epaisseurMur = ent(v) * 10 }, 'number'),
      champ('Épaisseur des cloisons (cm)', outils.reglages.epaisseurCloison / 10, v => { outils.reglages.epaisseurCloison = ent(v) * 10 }, 'number'),
      champ('Grille d’accrochage', String(outils.reglages.grille), v => { outils.reglages.grille = Number(v) }, 'text', { '0': 'Sans', '10': '1 cm', '50': '5 cm', '100': '10 cm', '500': '50 cm' }),
      champ('Rectangle de murs', outils.reglages.rectangle, v => { outils.reglages.rectangle = v as 'hors_tout' | 'interieur' }, 'text', { hors_tout: 'Cotes hors tout', interieur: 'Cotes intérieures' }),
      champ('Cotation automatique', cotation ? 1 : 0, v => basculerCotation(!!v), 'checkbox'),
      champ('Sols en couleur (présentation)', solsCouleur ? 1 : 0, v => {
        solsCouleur = !!v; try { localStorage.setItem('cpDesigner:sols', solsCouleur ? 'oui' : 'non') } catch { /* préférence non gardée */ }
        dessinerBientot();
      }, 'checkbox'),
      bloc('Pendant un tracé, tapez la longueur (4,50 puis Entrée ; 4,50<90 pour un angle ; 10x8 pour un rectangle) · Alt : sans accrochage · Maj : angles à 45° · Espace + glisser : déplacer la vue · F : tout voir · Ctrl+K : toutes les actions'));
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
  function dialogue(t: string, champs: { cle: string; libelle: string; valeur: string; options?: Record<string, string> }[]): Promise<Record<string, string> | null> {
    return new Promise(res => {
      const v = document.createElement('div'); v.className = 'voile';
      v.innerHTML = `<form class="boite"><h2>${esc(t)}</h2>${champs.map(c => `<label>${esc(c.libelle)}${c.options
        ? `<select name="${c.cle}">${Object.entries(c.options).map(([k, l]) => `<option value="${k}" ${k === c.valeur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
        : `<input name="${c.cle}" value="${esc(c.valeur)}" autocomplete="off">`}</label>`).join('')}
        <div class="pied"><button type="button" class="non">Annuler</button><button class="prim">Valider</button></div></form>`;
      const fin = (r: Record<string, string> | null) => { v.remove(); res(r) };
      v.querySelector('form')!.onsubmit = e => { e.preventDefault(); const d = new FormData(e.target as HTMLFormElement); fin(Object.fromEntries(champs.map(c => [c.cle, String(d.get(c.cle) ?? '')]))) };
      v.querySelector<HTMLButtonElement>('.non')!.onclick = () => fin(null);
      v.onkeydown = e => { if (e.key === 'Escape') fin(null) };
      racine.querySelector('.cpd')!.appendChild(v);
      v.querySelector<HTMLInputElement>('input,select')?.focus();
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
      const u = planchesPdf(h.projet, { niveaux: [], cotation: true, mobilier: false, coupe: true, indice: 'A', date: new Date().toLocaleDateString('fr-FR') });
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
      const { octets, pieces } = dossierPc(h.projet, { indice: (r['ind'] ?? 'A').trim() || 'A', date: new Date().toLocaleDateString('fr-FR'),
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
  async function exporterPdf() {
    const r = await dialogue('Exporter en PDF (A3)', [
      { cle: 'doc', libelle: 'Composer', valeur: 'planches', options: { planches: 'Les planches choisies ci-dessous', dossier: 'Le dossier de permis complet (garde et sommaire, PCMI 1 à 8 selon les pièces fournies, plans des niveaux)' } },
      { cle: 'pre', libelle: 'Plans', valeur: 'technique', options: { technique: 'Plans techniques (cotés)', presentation: 'Plans de présentation pour le client (sols en couleur, mobilier, sans cotes)' } },
      { cle: 'niv', libelle: 'Niveaux', valeur: 'courant', options: { courant: 'Ce niveau (' + niveau().name + ')', tous: 'Tous les niveaux (une page chacun)' } },
      { cle: 'ech', libelle: 'Échelle', valeur: 'auto', options: { auto: 'La plus grande qui tient', 50: '1/50', 75: '1/75', 100: '1/100', 200: '1/200' } },
      { cle: 'cot', libelle: 'Cotation', valeur: 'oui', options: { oui: 'Avec les chaînes de cotes', non: 'Sans' } },
      { cle: 'mob', libelle: 'Mobilier', valeur: 'oui', options: { oui: 'Avec le mobilier', non: 'Sans' } },
      ...(parcelleDuProjet(h.projet) ? [{ cle: 'mas', libelle: 'Plan de masse', valeur: 'oui', options: { oui: 'Ajouter le plan de masse (PCMI 2) : parcelle, reculs, emprise', non: 'Sans' } }] : []),
      ...(niveaux().some(f => Object.values(f.objects).some(x => x.type === 'roof')) ? [{ cle: 'toi', libelle: 'Plan de toiture', valeur: 'oui', options: { oui: 'Ajouter le plan de toiture (pans, pentes, faîtage)', non: 'Sans' } }] : []),
      { cle: 'fac', libelle: 'Façades', valeur: 'oui', options: { oui: 'Ajouter la planche des quatre façades', non: 'Sans' } },
      { cle: 'cou', libelle: 'Coupes', valeur: 'oui', options: { oui: traitsDeCoupe(h.projet).length ? 'Ajouter les coupes ' + traitsDeCoupe(h.projet).map(l => l.nom + '-' + l.nom).join(', ') + ' (et leurs traits sur les plans)' : 'Ajouter une coupe A-A placée d’elle-même (ou tracez-la : outil K)', non: 'Sans' } },
      { cle: 'ind', libelle: 'Indice', valeur: 'A' },
      { cle: 'mo', libelle: 'Maître d’ouvrage (dossier)', valeur: '' },
      { cle: 'adr', libelle: 'Adresse du terrain (dossier)', valeur: '' },
      ...(perspective ? [{ cle: 'per', libelle: 'Vue 3D (dossier)', valeur: 'oui', options: { oui: 'Ajouter la vue 3D gardée', non: 'Sans' } }] : [])]);
    if (!r) return;
    if (r['doc'] === 'dossier') { await exporterDossier(r); return }
    try {
      const { planchesPdf } = await import('../export/planche');
      const u = planchesPdf(h.projet, {
        niveaux: r['niv'] === 'tous' ? niveaux().map(f => f.id) : [niveauId], cotation: r['cot'] === 'oui' && r['pre'] !== 'presentation', mobilier: r['mob'] === 'oui' || r['pre'] === 'presentation',
        ...(r['pre'] === 'presentation' ? { presentation: true } : {}), facades: r['fac'] === 'oui', coupe: r['cou'] === 'oui', masse: r['mas'] === 'oui', toiture: r['toi'] === 'oui',
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
    { libelle: 'Cotation automatique oui / non', faire: () => basculerCotation() },
    { libelle: 'Copier la sélection', touche: 'Ctrl+C', faire: () => void copierChoix() }, { libelle: 'Coller', touche: 'Ctrl+V', faire: commencerCollage },
    { libelle: 'Dupliquer la sélection', touche: 'Ctrl+D', faire: dupliquerChoix }, { libelle: 'Tout choisir sur ce niveau', touche: 'Ctrl+A', faire: () => choisirGroupe(Object.values(niveau().objects).filter(o => o.type !== 'underlay' && o.type !== 'roof' && o.type !== 'constraint').map(o => o.id)) },
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
  barreOutils(); panneaux();
  requestAnimationFrame(() => {
    cam = { ...cam, largeur: main.clientWidth, hauteur: main.clientHeight };
    if (mursDroits(niveau()).length) cadrerTout(); else { cam = cadrer(cam, { xmin: 0, ymin: 0, xmax: 12_000, ymax: 10_000 }); dessinerBientot() }
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
