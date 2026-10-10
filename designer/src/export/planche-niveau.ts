/* La planche d'un niveau, comme les plans des dossiers du cabinet : le plan
   au style des dossiers (maçonnerie grise hachurée, doublage isolant ondulé,
   cloisons grises, « SH : 12,91 m² »), trois chaînes de cotes (baies avec
   « 0,90 × 1,35 » et « all. 0,80 », décrochés, hors tout), les traits de
   coupe en brique, « VR » devant les baies à volet roulant, puis, posés
   dans les vides du dessin, le tableau des surfaces, la légende, le nord et
   l'échelle graphique. Le plan est dessiné par le code de l'écran
   (ui/dessin.ts) sur une toile PDF : vectoriel. */
import type { BuildingObject, Floor, Point, Project } from '../model/types';
import { planDuNiveau, cotationExterieure, cotationFondations, cotesInterieures, baiesExterieures, mursDroits, mursDemolis, ouvertureBatie, emprise, geometrieEscalier, hauteurAFranchir, tremiesDuNiveau,
  planFondations, reservationsFondations, NOMS_RESEAUX, attentesSanitaires, besoinSanitaire, NOMS_RESEAUX_SANITAIRES, SOUBASSEMENTS, surfacesReglementaires, surfacesDesPieces, partiesBasses, parcelleDuProjet, type ChaineCotes, type Cote4, type PlanFondations, type Reservation, type AttenteSanitaire } from '../building';
import { dessiner, ETATS, type Scene } from '../ui/dessin';
import { ToilePdf } from './toile-pdf';
import { PagePdf, type DocumentPdf } from './pdf';
import type { Camera } from '../ui/camera';
import type { LigneDeCoupe } from '../vue3d/coupe';
import { compositionMur, MATIERES_COUCHES } from '../catalogue/murs';
import { formeDe } from '../building/mobilier';
import { materiau } from '../catalogue/materiaux';
import { segmentsDans } from '../geometry/hachures';
import type { Polygone } from '../geometry/polygon';
import { PT, X, Y, ZONE_DESSIN, ENCRE, GRIS_TEXTE, BRIQUE, Occupation, colonne, nouvelleFeuille, titrePlanche, tableau, hauteurTableau, legende, tailleLegende,
  pastille, pastilleTrait, nordFleche, echelleGraphique, largeurEchelle, texte, metres, enM2, couper, codePiece, type Signature, type LigneLegende, type Formalite } from './feuille';

/** les échelles d'un plan de maison, de la plus grande à la plus petite (1/n) */
export const ECHELLES = [50, 75, 100, 125, 150, 200, 250, 500, 1_000] as const;

export interface OptionsNiveau extends Signature {
  cotation: boolean;
  mobilier: boolean;
  echelle?: number | undefined;
  /** des plans de présentation (pour le client) : sols en couleur avec leur motif, le tableau dit le sol de chaque pièce */
  presentation?: boolean | undefined;
}

const SUR_LE_TERRAIN = new Set<BuildingObject['type']>(['platform', 'network', 'network_item', 'tree', 'viewpoint']);
/** la première chaîne de cotes, à cette distance du mur (mm de papier), puis une tous les ECART */
const PREMIERE = 10, ECART = 8;
/** le pas des lignes du tableau des surfaces (mm) : serré comme aux dossiers du cabinet, il tient dans le creux d'un plan en L */
const PAS_TABLEAU = 4.5;

/** le nom d'un niveau dans un titre : « rez-de-chaussée » pour le RDC */
export const nomDuNiveau = (f: Floor) => (/^rdc$/i.test(f.name.trim()) ? 'rez-de-chaussée' : f.name);
/** le titre de la planche d'un niveau : PLAN DU REZ-DE-CHAUSSÉE, PLAN DE L'ÉTAGE… */
const titreDuNiveau = (f: Floor) => (/^rdc$|rez/i.test(f.name.trim()) ? 'PLAN DU REZ-DE-CHAUSSÉE' : /^(é|e)tage$/i.test(f.name.trim()) ? 'PLAN DE L’ÉTAGE' : 'PLAN : ' + f.name.toUpperCase());

/** la boîte de ce qui se dessine sur un niveau (mm) : maçonnerie, meubles */
export function boiteDessin(f: Floor, mobilier = true): { xmin: number; ymin: number; xmax: number; ymax: number } | null {
  const P = planDuNiveau(f).maconnerie.flatMap(p => p.contour);
  for (const o of Object.values(f.objects)) {
    if (mobilier && o.type === 'furniture') P.push(...emprise(o));
    if (o.type === 'landscape' && o.kind === 'terrace') P.push(...o.points);
    if (o.type === 'canopy') P.push(...o.contour);
  }
  if (!P.length) for (const w of mursDroits(f)) P.push(w.axis.a, w.axis.b);
  if (!P.length) return null;
  return { xmin: Math.min(...P.map(p => p.x)), ymin: Math.min(...P.map(p => p.y)), xmax: Math.max(...P.map(p => p.x)), ymax: Math.max(...P.map(p => p.y)) };
}

/** les surfaces de chaque pièce, par niveau : habitable (S.H) ou annexe (S.A : garage, pièce exclue) ; mm² */
export function surfacesParPiece(projet: Project): { niveau: string; pieces: { nom: string; sh: number; sa: number }[] }[] {
  return projet.buildings.flatMap(b => b.floors).sort((a, b) => a.elevation - b.elevation).map(f => ({ niveau: f.name, pieces: piecesDuNiveau(projet, f) })).filter(x => x.pieces.length);
}
/** l'ordre des pièces d'un tableau de surfaces : séjour, cuisine, chambres, rangements, eau, circulations, annexes */
const ORDRE_USAGES = ['living', 'kitchen', 'bedroom', 'storage', 'bathroom', 'wc', 'circulation', 'technical', 'other', 'garage'];
/* la surface d'une pièce : celle que comptent les surfaces réglementaires (trémie et parties de moins de 1,80 m sous
   la toiture déduites), pour que le tableau d'un étage sous combles tombe juste avec la surface habitable */
function piecesDuNiveau(projet: Project, f: Floor): { nom: string; sh: number; sa: number }[] {
  const A = surfacesDesPieces(projet, f);
  return planDuNiveau(f).zones.filter(z => z.piece).map(z => {
    const r = z.piece!, annexe = r.usage === 'garage' || !!r.excludedFromHabitable?.value, a = A.get(r.id) ?? z.aire;
    return { nom: r.name, sh: annexe ? 0 : a, sa: annexe ? a : 0, rang: (annexe ? 100 : 0) + ORDRE_USAGES.indexOf(r.usage) };
  }).sort((a, b) => a.rang - b.rang || a.nom.localeCompare(b.nom, 'fr', { numeric: true })).map(({ nom, sh, sa }) => ({ nom, sh, sa }));
}

/** la surface vitrée : les fenêtres, portes-fenêtres et baies des murs extérieurs (tableau, mm²) ; d'un niveau, ou du projet */
export function surfaceVitree(projet: Project, f?: Floor): number {
  let s = 0;
  for (const n of f ? [f] : projet.buildings.flatMap(b => b.floors)) {
    const ext = new Set(mursDroits(n).filter(w => w.role === 'exterior').map(w => w.id));
    for (const o of Object.values(n.objects)) if (o.type === 'opening' && ouvertureBatie(o) && ext.has(o.hostWallId) && (o.kind === 'window' || o.kind === 'french_window' || o.kind === 'bay')) s += o.width * o.height;
  }
  return s;
}

const enCm = (mm: number) => (mm / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** la planche d'un niveau ; « fondations » : son plan de fondations (semelles, trappes ; ni mobilier, ni escalier) ;
    « attentes » : le plan du plombier (les appareils sanitaires seuls, leurs attentes d'eau et d'évacuation) */
export function plancheNiveau(doc: DocumentPdf, projet: Project, f: Floor, o: OptionsNiveau, traits: LigneDeCoupe[], fondations = false, attentes = false): void {
  const page = nouvelleFeuille(doc);
  /* le plan d'un niveau montre le bâtiment : le terrain et les abords vont au plan de masse ; seule la terrasse, accolée, reste */
  const garde = (x: BuildingObject) => (fondations
    /* au plan de fondations, ni baies (la semelle filante passe dessous) ni noms de pièces : les murs à fonder et les semelles */
    ? ['column', 'foundation', 'dimension'].includes(x.type) || (x.type === 'wall' && (x.role === 'exterior' || x.role === 'bearing_interior' || (x.role === 'partition' && x.loadBearing.value)))
    /* au plan du plombier, des meubles seuls les appareils sanitaires */
    : attentes ? (x.type !== 'furniture' || !!besoinSanitaire(x)) && !SUR_LE_TERRAIN.has(x.type) && x.type !== 'roof' && x.type !== 'dormer' && x.type !== 'roof_window' && x.type !== 'landscape'
    : (o.mobilier || x.type !== 'furniture') && !SUR_LE_TERRAIN.has(x.type) && x.type !== 'roof' && x.type !== 'dormer' && x.type !== 'roof_window' && !(x.type === 'landscape' && x.kind !== 'terrace'));
  const niveau: Floor = { ...f, objects: Object.fromEntries(Object.entries(f.objects).filter(([, x]) => garde(x))) };
  const plan = planDuNiveau(niveau), PF = fondations ? planFondations(f) : null;          // les semelles et les trappes, d'après le niveau entier (pièces comprises)
  let B = boiteDessin(niveau, (o.mobilier || attentes) && !fondations);
  /* les attentes sanitaires du niveau (building/plomberie.ts), au dos de chaque appareil */
  const AT = attentes ? attentesSanitaires(f) : [];
  if (B && PF) for (const q of [...PF.emprise.flatMap(x => x.contour), ...PF.isolees.flatMap(x => x.contour)])
    B = { xmin: Math.min(B.xmin, q.x), ymin: Math.min(B.ymin, q.y), xmax: Math.max(B.xmax, q.x), ymax: Math.max(B.ymax, q.y) };
  const titreSous = (ech: number) => {
    const ngf = parcelleDuProjet(projet)?.plot.groundFloorNgf;
    const n0 = 'Niveau fini ' + f.name + ' ' + (f.elevation ? (f.elevation > 0 ? '+' : '−') + metres(Math.abs(f.elevation)) : '±0,00') + (ngf !== undefined ? ' = ' + (ngf + f.elevation / 1000).toFixed(2).replace('.', ',') + ' NGF' : '');
    return fondations ? n0 + ' – semelles sous le niveau – échelle 1/' + ech
      : attentes ? n0 + ' – attentes d’eau et d’évacuation des appareils posés au plan – échelle 1/' + ech
      : o.presentation ? 'Plan de présentation : ' + f.name + ' – sols et surfaces des pièces – échelle 1/' + ech
        : n0 + ' – cotes en mètres – ouvertures : largeur × hauteur, all. = hauteur d’allège';
  };
  if (!B) {
    texte(page, 'Niveau vide : aucun mur à dessiner.', 20, 30, 11, { couleur: GRIS_TEXTE });
    titrePlanche(page, fondations ? 'PLAN DE FONDATIONS' : titreDuNiveau(f), '');
    colonne(page, projet, o, fondations ? 'Plan de fondations' : 'Plan du', nomDuNiveau(f), fondations ? 'Fondations' : 'Plan ' + f.name, 0);
    return;
  }
  const Bx = B;
  const cotes = o.cotation && !o.presentation;
  /* un plan de fondations se cote sur ses semelles (bords, largeurs, hors-tout), pas sur les baies */
  /* le plan de présentation garde les deux cotes d'encombrement (en bas et à gauche) : le client lit la taille de sa maison */
  const CH: ChaineCotes[] = PF ? (cotes ? cotationFondations(PF.emprise, 1) : [])
    : cotes ? cotationExterieure(niveau, 1)
      : o.presentation ? cotationExterieure(niveau, 1).filter(c => c.genre === 'hors_tout' && (c.cote === 'bas' || c.cote === 'gauche')).map(c => ({ ...c, rang: 0 })) : [];
  const nb = (c: Cote4) => CH.filter(x => x.cote === c).length;
  /* les repères de coupe se posent au-delà des cotes, dans le blanc de la feuille : ils ne comptent pas dans la place du plan */
  const marge = (c: Cote4) => (nb(c) ? PREMIERE + ECART * (nb(c) - 1) + 4 : 6);
  const zone = { x: ZONE_DESSIN.x + 3, y: ZONE_DESSIN.y + 3, l: ZONE_DESSIN.l - 6, h: ZONE_DESSIN.h - 6 };
  /* le titre, en bas à gauche : le plan et ses cotes l'évitent */
  const TITRE = { x0: ZONE_DESSIN.x, y0: ZONE_DESSIN.y + ZONE_DESSIN.h - 15, x1: ZONE_DESSIN.x + 125, y1: ZONE_DESSIN.y + ZONE_DESSIN.h };
  const Bw = Bx.xmax - Bx.xmin, Bh = Bx.ymax - Bx.ymin;
  const tient = (e: number) => Bw / e + marge('gauche') + marge('droite') <= zone.l && Bh / e + marge('haut') + marge('bas') <= zone.h;

  /* ce qui se pose dans les vides : le tableau des surfaces (ou des fondations), la légende, le nord, l'échelle */
  const pieces = piecesDuNiveau(projet, f);
  const S = surfacesReglementaires(projet), SN = S.niveaux.find(x => x.niveau === f.id);
  const bas = [...projet.buildings.flatMap(b => b.floors)].sort((a, b) => a.elevation - b.elevation)[0];
  const notes = fondations || attentes || o.presentation ? [] : [
    ...(SN ? ['Surface de plancher (S.P.) : ' + enM2(SN.surfacePlancher)] : []),
    ...(bas?.id === f.id && S.emprise ? ['Emprise au sol : ' + enM2(S.emprise)] : []),
    'Surface vitrée : ' + enM2(surfaceVitree(projet, f)),
  ];
  const colonnesTableau = o.presentation
    ? [{ titre: 'Pièce', largeur: 36 }, { titre: 'Sol', largeur: 34 }, { titre: 'Surface', largeur: 18, aligne: 'droite' as const }]
    : [{ titre: 'Pièce', largeur: 40 }, { titre: 'S. hab.', largeur: 17, aligne: 'droite' as const }, { titre: 'S. annexe', largeur: 19, aligne: 'droite' as const }];
  /* les réservations : là où un réseau tracé traverse une semelle (fourreau à prévoir au coulage) */
  const RS = PF ? reservationsFondations(projet, PF) : [];
  const lignesFondations = PF ? lignesDesFondations(PF, RS) : [];
  /* les notes « À valider » sous le tableau, coupées à sa largeur : leur place se compte ligne à ligne */
  const notesFondations = PF ? ['Dimensions proposées, à remplacer par celles de l’étude de sol (G2) et du bureau d’études.', ...PF.alertes.map(a => '• ' + a)].flatMap(t => couper(t, 76 * PT, 6.5)).slice(0, 9) : [];
  /* le tableau du plombier : chaque appareil, sa pièce, ses attentes et son évacuation ; les notes dessous */
  const lignesAttentes = AT.map(a => [a.repere, a.appareil + (a.piece ? ' (' + a.piece + ')' : ''), a.reseaux.join(' + '), a.evacuation]);
  const notesAttentes = attentes ? ['Positions d’après les appareils posés au plan (le dos de l’appareil, côté mur). Hauteurs d’attente et diamètres : usuels, à confirmer par le plombier selon les fiches des appareils.'].flatMap(t => couper(t, 104 * PT, 6.5)) : [];
  const tab = fondations
    ? { l: 76, h: hauteurTableau(lignesFondations.length, { titre: true }) + 5 + 3.6 + notesFondations.length * 3.4 }
    : attentes ? (AT.length ? { l: 104, h: hauteurTableau(lignesAttentes.length, { titre: true }) + 5 + notesAttentes.length * 3.4 } : null)
    : pieces.length ? { l: colonnesTableau.reduce((s, c) => s + c.largeur, 0), h: hauteurTableau(pieces.length, { total: true, titre: true, pas: PAS_TABLEAU }) + notes.length * 3.6 + (notes.length ? 2 : 0) } : null;
  const L = fondations ? legendeFondations(RS.length > 0) : attentes ? legendeAttentes(AT) : o.presentation ? [] : legendeDuPlan(niveau, traits.length > 0, o.formalite, partiesBasses(projet, f).length > 0);
  const legs = L.length ? [1, 2, 3].filter(k => k <= L.length).map(k => ({ ...tailleLegende('LÉGENDE', L, k), k })) : [];

  /* la plus grande échelle normalisée où le plan, ses cotes et ses encadrés tiennent */
  const candidates = o.echelle ? [o.echelle] : ECHELLES.filter(tient);
  if (!candidates.length) candidates.push(ECHELLES[ECHELLES.length - 1]!);
  type Place = { x: number; y: number } | null;
  type Places = { tab: Place; leg: Place; nord: Place; ech: Place };
  let choix: { ech: number; x0: number; y0: number; occ: Occupation; places: Places } | null = null;
  let leg: { l: number; h: number; k: number } | null = null;
  for (const ech of candidates) {
    const W = Bw / ech, H = Bh / ech;
    /* le bloc du plan et de ses cotes : centré ; sinon calé en haut (le blanc du bas reçoit légende et échelle, comme aux
       dossiers du cabinet), puis en haut à gauche ; ce n'est qu'ensuite qu'on passe à l'échelle de plan suivante */
    const xc = zone.x + marge('gauche') + (zone.l - W - marge('gauche') - marge('droite')) / 2;
    let yc = zone.y + marge('haut') + (zone.h - H - marge('haut') - marge('bas')) / 2;
    /* le bloc (plan et cotes) qui descendrait sur le titre remonte d'autant, s'il a la place */
    if (yc + H + marge('bas') > TITRE.y0 && xc - marge('gauche') < TITRE.x1) yc -= Math.min(yc + H + marge('bas') - TITRE.y0, yc - marge('haut') - zone.y);
    /* calé en haut, on garde au-dessus des cotes la place des repères de coupe */
    const haut = zone.y + marge('haut') + (traits.length && nb('haut') ? 9 : 0);
    const positions: [number, number][] = [[xc, yc], [xc, Math.min(yc, haut)], [zone.x + marge('gauche'), Math.min(yc, haut)]];
    for (const [x0, y0] of positions) {
      const P = (p: Point): [number, number] => [x0 + (p.x - Bx.xmin) / ech, y0 + (Bx.ymax - p.y) / ech];
      /* deux essais : l'échelle graphique seule dans un blanc, sinon accolée sous la légende (comme aux dossiers du cabinet) ;
         ce n'est qu'ensuite qu'on passe à l'échelle de plan suivante */
      for (const accole of [false, true]) {
        const occ = new Occupation({ x: ZONE_DESSIN.x + 3, y: ZONE_DESSIN.y + 3, l: ZONE_DESSIN.l - 6, h: ZONE_DESSIN.h - 6 });
        occ.rectangle(TITRE.x0, TITRE.y0, TITRE.x1, TITRE.y1);
        for (const m of plan.maconnerie) occ.polygone(m.contour.map(P), 3);
        for (const z of plan.zones) occ.polygone(z.polygone.contour.map(P), 1);
        for (const x of Object.values(niveau.objects)) if (x.type === 'landscape') occ.polygone(x.points.map(P), 2);
        for (const c of CH) {
          const k = c.rang, h = c.cote === 'haut' || c.cote === 'bas';
          const d = PREMIERE + ECART * k, a = c.reperes[0]!, b = c.reperes[c.reperes.length - 1]!;
          if (h) { const y = c.cote === 'haut' ? y0 - d : y0 + H + d; occ.rectangle(P({ x: a, y: 0 })[0], y - 4.5, P({ x: b, y: 0 })[0], y + 4) }
          else { const x = c.cote === 'gauche' ? x0 - d : x0 + W + d; occ.rectangle(x - 4.5, P({ x: 0, y: b })[1], x + 4, P({ x: 0, y: a })[1]) }
        }
        /* les cotes de chaque côté occupent la bande entre le mur et la dernière chaîne (les lignes d'attache la traversent) */
        for (const c of ['haut', 'bas', 'gauche', 'droite'] as const) if (nb(c)) {
          const d = PREMIERE + ECART * (nb(c) - 1) + 4;
          if (c === 'haut') occ.rectangle(x0, y0 - d, x0 + W, y0 - PREMIERE + 4.5);
          if (c === 'bas') occ.rectangle(x0, y0 + H + PREMIERE - 4.5, x0 + W, y0 + H + d);
        }
        /* les « VR » devant les baies */
        for (const b of baiesExterieures(niveau)) if (b.ouverture.shutter === 'roller_motorized' || b.ouverture.shutter === 'roller_manual') {
          const [cx, cy] = P(b.centre), d = b.epaisseur / 2 / ech + 4.2;
          occ.rectangle(cx + b.sortie.x * d - 3, cy - b.sortie.y * d - 2, cx + b.sortie.x * d + 3, cy - b.sortie.y * d + 2);
        }
        const RC = rectangleCoupes(x0, y0, W, H, marge, zone);
        for (const l of traits) { const E = extremitesCoupe(l, P, RC); if (E) { occ.segment(E[0], E[1], 2); occ.rectangle(E[0][0], E[0][1], E[0][0], E[0][1], 11); occ.rectangle(E[1][0], E[1][1], E[1][0], E[1][1], 11) } }
        const Z = occ.zone, bd = { x: Z.x + Z.l, y: Z.y + Z.h - 14 }, hg = { x: Z.x, y: Z.y };
        const places: Places = { tab: null, leg: null, nord: null, ech: null };
        leg = null;
        if (tab) { places.tab = occ.placer(tab.l, tab.h, [{ ...hg, coin: 'hg' }, { x: Z.x + Z.l, y: Z.y, coin: 'hd' }, { x: Z.x, y: bd.y, coin: 'bg' }, { ...bd, coin: 'bd' }]); if (places.tab) occ.rectangle(places.tab.x, places.tab.y, places.tab.x + tab.l, places.tab.y + tab.h, 3) }
        /* la légende : sur une colonne si elle tient, sinon sur deux ou trois (un blanc large et bas) */
        const le = largeurEchelle(ech) + 2, sous = accole ? 14 : 0;
        for (const lg of legs) {
          const lb = accole ? Math.max(lg.l, le) : lg.l;
          places.leg = occ.placer(lb, lg.h + sous, [{ x: Z.x + Z.l / 2, y: bd.y, coin: 'bg' }, { x: Z.x, y: bd.y, coin: 'bg' }, { ...bd, coin: 'bd' }, { x: Z.x + Z.l, y: Z.y, coin: 'hd' }, { x: Z.x + Z.l / 2, y: Z.y + Z.h, coin: 'bg' }]);
          if (places.leg) { leg = lg; occ.rectangle(places.leg.x, places.leg.y, places.leg.x + lb, places.leg.y + lg.h + sous, 3); break }
        }
        {
          const t = places.tab;
          places.nord = occ.placer(18, 18, [...(t && tab ? [{ x: t.x + tab.l, y: t.y + tab.h + 4, coin: 'hd' as const }] : []), { x: Z.x + Z.l, y: Z.y, coin: 'hd' as const }, { ...bd, coin: 'bd' as const }]);
          if (places.nord) occ.rectangle(places.nord.x, places.nord.y, places.nord.x + 18, places.nord.y + 18, 2);
        }
        places.ech = accole && places.leg && leg ? { x: places.leg.x, y: places.leg.y + leg.h + 2 } : occ.placer(le, 12, [{ x: places.leg ? places.leg.x + (leg?.l ?? 0) + 20 : Z.x + Z.l / 2, y: bd.y + 8, coin: 'bg' }, { ...bd, coin: 'bd' }, { x: Z.x, y: bd.y, coin: 'bg' }]);
        const complet = (!tab || places.tab) && (!legs.length || places.leg) && places.ech;
        choix = { ech, x0, y0, occ, places };
        if (complet) break;
      }
      if (choix && (!tab || choix.places.tab) && (!legs.length || choix.places.leg) && choix.places.ech) break;
    }
    if (choix && (!tab || choix.places.tab) && (!legs.length || choix.places.leg) && choix.places.ech) break;
  }
  const { ech, x0, y0, places } = choix!;
  const W = Bw / ech, H = Bh / ech;
  const P = (p: Point): [number, number] => [x0 + (p.x - Bx.xmin) / ech, y0 + (Bx.ymax - p.y) / ech];
  const Ppt = (p: Point): [number, number] => { const [x, y] = P(p); return [X(x), Y(y)] };

  /* le plan, par le code de l'écran : la caméra place le coin haut-gauche de la boîte en (x0, y0) */
  const ZD = ZONE_DESSIN;
  const cam: Camera = { centre: { x: Bx.xmin + (ZD.x + ZD.l / 2 - x0) * ech, y: Bx.ymax - (ZD.y + ZD.h / 2 - y0) * ech }, echelle: PT / ech, largeur: ZD.l * PT, hauteur: ZD.h * PT };
  const toile = new ToilePdf(page, ZD.x * PT, ZD.y * PT);
  const scene: Scene = {
    niveau, dessous: null, selection: null, accroche: null, images: new Map(), sommets: false, impression: true, dossier: !o.presentation,
    escaliers: Object.values(niveau.objects).flatMap(x => (x.type === 'stair' ? [{ id: x.id, geo: geometrieEscalier(x, hauteurAFranchir(projet, f)) }] : [])),
    tremies: fondations ? [] : tremiesDuNiveau(projet, f), coupes: [], ...(o.presentation ? { presentation: true } : {}),
    ...(cotes && !fondations ? { cotesInterieures: cotesInterieures(niveau, 5 * ech) } : {}),
    ...(PF ? { fondations: PF } : {}),
    /* sous les combles : les surfaces comptées des pièces, et les parties de moins de 1,80 m, hachurées */
    ...(fondations ? {} : { surfacesPieces: surfacesDesPieces(projet, f), basses: partiesBasses(projet, f) }),
  };
  toile.save(); toile.beginPath(); toile.rect(0, 0, ZD.l * PT, ZD.h * PT); toile.clip();
  dessiner(toile as unknown as CanvasRenderingContext2D, cam, scene);
  toile.restore();

  /* les réservations des fondations : un repère cerclé de brique au passage de chaque réseau */
  for (const r of RS) {
    const [cx, cy] = P(r.point);
    page.cercle(X(cx), Y(cy), 1.4 * PT, { fond: '#FFFFFF', trait: BRIQUE, ep: 0.6 });
    page.trait(X(cx - 1), Y(cy), X(cx + 1), Y(cy), 0.4, BRIQUE);
    texte(page, r.repere, cx + 2, cy - 1.8, 6.5, { gras: true, couleur: BRIQUE });
  }
  /* les attentes sanitaires : une pastille par réseau au dos de l'appareil (EF bleu, EC rouge, EU/EV brun), et son repère */
  for (const a of AT) {
    const [cx, cy] = P(a.point), n = a.reseaux.length;
    a.reseaux.forEach((r, i) => page.cercle(X(cx + (i - (n - 1) / 2) * 2.1), Y(cy), 0.85 * PT, { fond: NOMS_RESEAUX_SANITAIRES[r].couleur, trait: '#FFFFFF', ep: 0.3 }));
    texte(page, a.repere, cx, cy - 2, 6.2, { gras: true, aligne: 'centre', couleur: '#1F3F5F' });
  }
  /* « VR » devant chaque baie à volet roulant, dehors */
  if (!o.presentation && !fondations) for (const b of baiesExterieures(niveau)) if (b.ouverture.shutter === 'roller_motorized' || b.ouverture.shutter === 'roller_manual') {
    const [cx, cy] = P(b.centre), d = b.epaisseur / 2 / ech + 4.2;
    texte(page, 'VR', cx + b.sortie.x * d, cy - b.sortie.y * d + 1, 6.5, { aligne: 'centre', couleur: GRIS_TEXTE });
  }
  /* les chaînes de cotes */
  if (CH.length) chainesDeCotes(page, niveau, CH, P, { x0, y0, W, H });
  /* les traits de coupe : leurs bouts en brique (trait fort, flèche du regard, lettre), le trait mixte hors du bâtiment */
  if (!fondations) for (const l of traits) repereCoupe(page, l, P, Ppt, plan.maconnerie, rectangleCoupes(x0, y0, W, H, marge, zone));

  /* les encadrés */
  if (tab && places.tab) {
    const { x, y } = places.tab;
    if (attentes) {
      const h = tableau(page, x, y, [{ titre: 'Repère', largeur: 13 }, { titre: 'Appareil (pièce)', largeur: 47 }, { titre: 'Attentes', largeur: 22 }, { titre: 'Évacuation', largeur: 22 }], lignesAttentes, { titre: 'ATTENTES SANITAIRES – ' + nomDuNiveau(f).toUpperCase() });
      let yy = y + h + 5;
      for (const t of notesAttentes) { texte(page, t, x, yy, 6.5, { couleur: GRIS_TEXTE }); yy += 3.4 }
    } else if (fondations) {
      const h = tableau(page, x, y, [{ titre: 'Fondations', largeur: 44 }, { titre: SOUBASSEMENTS[PF!.fondation.kind], largeur: 32, aligne: 'droite' }], lignesFondations, { titre: 'FONDATIONS – ' + nomDuNiveau(f).toUpperCase() });
      let yy = y + h + 5;
      texte(page, 'À VALIDER', x, yy, 7.5, { gras: true, couleur: '#C5563A' }); yy += 3.6;
      for (const t of notesFondations) { texte(page, t, x, yy, 6.5, { couleur: GRIS_TEXTE }); yy += 3.4 }
    } else {
      const lignes = o.presentation
        ? planDuNiveau(niveau).zones.filter(z => z.piece).map(z => [z.piece!.name, materiau(z.piece!.floorFinish)?.libelle ?? 'à choisir', (z.aire / 1e6).toFixed(2).replace('.', ',')])
        : pieces.map(p => [p.nom, p.sh ? (p.sh / 1e6).toFixed(2).replace('.', ',') : '', p.sa ? (p.sa / 1e6).toFixed(2).replace('.', ',') : '']);
      const tsh = pieces.reduce((s, p) => s + p.sh, 0), tsa = pieces.reduce((s, p) => s + p.sa, 0);
      const total = o.presentation ? ['Total (m²)', '', ((tsh + tsa) / 1e6).toFixed(2).replace('.', ',')] : ['Total (m²)', (tsh / 1e6).toFixed(2).replace('.', ','), tsa ? (tsa / 1e6).toFixed(2).replace('.', ',') : ''];
      const h = tableau(page, x, y, colonnesTableau, lignes, { total, corps: 7.2, pas: PAS_TABLEAU, titre: (o.presentation ? 'SOLS ET SURFACES – ' : 'TABLEAU DES SURFACES – ') + f.name.toUpperCase() });
      notes.forEach((t, i) => texte(page, t, x, y + h + 4.5 + i * 3.6, 7, { couleur: GRIS_TEXTE }));
    }
  }
  if (leg && places.leg) legende(page, places.leg.x, places.leg.y, 'LÉGENDE', L, 7.5, 4.4, leg.k);
  if (places.nord) nordFleche(page, places.nord.x + 8, places.nord.y + 9, parcelleDuProjet(projet)?.plot.north ?? 0);
  if (places.ech) echelleGraphique(page, ech, places.ech.x, places.ech.y + 4);

  titrePlanche(page, fondations ? 'PLAN DE FONDATIONS' : attentes ? 'PLAN DES ATTENTES SANITAIRES – ' + nomDuNiveau(f).toUpperCase() : o.presentation ? 'PLAN DE PRÉSENTATION – ' + nomDuNiveau(f).toUpperCase() : titreDuNiveau(f), titreSous(ech));
  colonne(page, projet, o, fondations ? 'Plan de fondations' : attentes ? 'Attentes sanitaires' : o.presentation ? 'Plan de présentation' : 'Plan du', nomDuNiveau(f), fondations ? 'Fondations' : attentes ? 'Plomberie ' + f.name : 'Plan ' + f.name, ech);
}

/** les lignes du tableau des fondations */
function lignesDesFondations(P: PlanFondations, RS: readonly Reservation[] = []): string[][] {
  const fd = P.fondation, mm = (v: number) => metres(v) + ' m', cm = (v: number) => enCm(v) + ' cm';
  return [
    ['Semelles filantes', cm(fd.footingWidth) + ' × ' + cm(fd.footingHeight)], ['Longueur', mm(P.longueur)],
    ...(P.isolees.length ? [['Semelles isolées', P.isolees.length + ' × ' + enCm(fd.padSize) + ' × ' + enCm(fd.padSize) + ' cm']] : []),
    ['Hors gel', mm(fd.frostDepth)], ['Bon sol (étude G2)', fd.bearingDepth === undefined ? 'à préciser' : mm(fd.bearingDepth)], ['Assise sous le terrain', mm(P.assise)],
    ...(fd.kind === 'crawl_space' ? [['Vide sanitaire', cm(fd.crawlHeight)], ['Trappes de visite', String(P.trappes.length)]] : []),
    ...RS.map(r => [r.repere + ' – réservation ' + NOMS_RESEAUX[r.reseau].code, r.spec ?? 'Ø à préciser']),
  ];
}
/** la légende du plan du plombier : les réseaux présents */
function legendeAttentes(AT: readonly AttenteSanitaire[]): LigneLegende[] {
  const R = (['EF', 'EC', 'EU', 'EV'] as const).filter(r => AT.some(a => a.reseaux.includes(r)));
  return R.map(r => ({ pastille: (page: PagePdf, x: number, y: number) => page.cercle(X(x + 3.5), Y(y + 1.5), 1.1 * PT, { fond: NOMS_RESEAUX_SANITAIRES[r].couleur }), texte: r + ' : ' + NOMS_RESEAUX_SANITAIRES[r].libelle }));
}
function legendeFondations(reservations = false): LigneLegende[] {
  return [
    { pastille: pastille('#DCDCDC', { hachures: '#4A4A4A' }), texte: 'Maçonnerie (murs porteurs)' },
    { pastille: pastille('#C9D0D6'), texte: 'Semelle (sous le sol)' },
    { pastille: pastille('#FFFFFF'), texte: 'TV : trappe de visite' },
    ...(reservations ? [{ pastille: (page: PagePdf, x: number, y: number) => { page.cercle(X(x + 3.5), Y(y + 1.5), 1.4 * PT, { fond: '#FFFFFF', trait: BRIQUE, ep: 0.5 }); page.trait(X(x + 2.5), Y(y + 1.5), X(x + 4.5), Y(y + 1.5), 0.4, BRIQUE) },
      texte: 'R : réservation (fourreau dans la semelle, au passage d’un réseau)' }] : []),
  ];
}

/** la légende d'un plan de niveau : ce qui y est dessiné, rien de plus */
function legendeDuPlan(f: Floor, coupes: boolean, formalite?: Formalite, basses = false): LigneLegende[] {
  const W = mursDroits(f), L: LigneLegende[] = [];
  const ext = W.filter(w => w.role === 'exterior'), ep = [...new Set(ext.map(w => Math.round(w.thickness / 10)))].sort((a, b) => b - a);
  /* une rénovation, une extension (ADR-0007) : l'existant conservé, le démoli, les baies à boucher ; le reste est à construire */
  const existant = W.some(w => w.phase === 'existing'), demoli = mursDemolis(f).length > 0;
  const bouchees = Object.values(f.objects).some(o => o.type === 'opening' && !ouvertureBatie(o) && W.some(w => w.id === o.hostWallId));
  const neuf = W.filter(w => w.phase !== 'existing');
  if (neuf.some(w => w.role !== 'partition' || compositionMur(w.compositionRef)?.genre !== 'cloison'))
    L.push({ pastille: pastille('#DCDCDC', { hachures: '#4A4A4A' }), texte: 'Maçonnerie' + (existant || demoli ? ' à construire' : '') + (ep.length ? ' (murs extérieurs, ép. totale ' + ep.join(' ; ') + ' cm)' : '') });
  if (existant) L.push({ pastille: pastille(ETATS.existant, { trait: ETATS.existantTrait }), texte: 'Existant conservé' });
  if (demoli) L.push({ pastille: pastille(ETATS.demoli, { tirets: true }), texte: 'Existant à démolir' });
  if (bouchees) L.push({ pastille: pastille('#FFFFFF', { tirets: true }), texte: 'Baie existante à boucher' });
  const isolant = W.some(w => compositionMur(w.compositionRef)?.couches.some(c => MATIERES_COUCHES[c.matiere].motif === 'isolant') && compositionMur(w.compositionRef)?.genre !== 'cloison');
  if (isolant) L.push({ pastille: pastille('#F6ECD6', { zigzag: '#8B7B5B' }), texte: 'Doublage isolant' });
  if (W.some(w => w.role === 'partition')) L.push({ pastille: pastille('#A9A9A9'), texte: 'Cloison de distribution' });
  if (Object.values(f.objects).some(o => o.type === 'furniture' && formeDe(o) === 'placard')) L.push({ pastille: pastille('#FFFFFF', { tirets: true }), texte: 'Placard' });
  if (Object.values(f.objects).some(o => o.type === 'canopy')) L.push({ pastille: pastille('#FFFFFF', { tirets: true }), texte: 'Couvert (porche, auvent : sous la toiture)' });
  if (basses) L.push({ pastille: (page, x, y) => { pastille('#F3F3F3', { hachures: '#C4C4C4', trait: '#F3F3F3' })(page, x, y); page.trait(X(x), Y(y), X(x + 7), Y(y), 0.5, '#555555', [1.6, 0.9]) },
    texte: 'Hauteur inférieure à 1,80 m sous la toiture (non comptée) ; en tirets, la limite des 1,80 m' });
  if (coupes) L.push({ pastille: (page, x, y) => { page.trait(X(x), Y(y + 1.5), X(x + 7), Y(y + 1.5), 0.5, BRIQUE, [3, 1, 0.6, 1]); page.cadre(X(x), Y(y + 2.1), 2 * PT, 1.2 * PT, { ep: 0, fond: BRIQUE }) }, texte: 'Plan de coupe (voir ' + codePiece('PCMI 3', formalite) + ')' });
  const vr = Object.values(f.objects).filter(o => o.type === 'opening' && ouvertureBatie(o) && (o.shutter === 'roller_motorized' || o.shutter === 'roller_manual'));
  if (vr.length) L.push({ pastille: (page, x, y) => texte(page, 'VR', x + 1, y + 2.6, 6.5, { couleur: GRIS_TEXTE }), texte: 'VR : volet roulant' + (vr.every(o => o.type === 'opening' && o.shutter === 'roller_motorized') ? ' motorisé' : '') });
  return L;
}

/** les chaînes de cotes, au trait des dossiers : traits obliques, valeurs au-dessus, baies « 0,90 × 1,35 » et « all. 0,80 » */
export function chainesDeCotes(page: PagePdf, f: Floor, CH: ChaineCotes[], P: (p: Point) => [number, number], b: { x0: number; y0: number; W: number; H: number }): void {
  const baies = baiesExterieures(f);
  const corps = 7.2;
  for (const cote of ['haut', 'bas', 'gauche', 'droite'] as const) {
    const C = CH.filter(c => c.cote === cote).sort((a, b) => a.rang - b.rang);
    if (!C.length) continue;
    const h = cote === 'haut' || cote === 'bas';
    const pos = (rang: number) => {
      const d = PREMIERE + ECART * rang;
      return cote === 'haut' ? b.y0 - d : cote === 'bas' ? b.y0 + b.H + d : cote === 'gauche' ? b.x0 - d : b.x0 + b.W + d;
    };
    const papier = (v: number) => (h ? P({ x: v, y: 0 })[0] : P({ x: 0, y: v })[1]);
    /* les lignes d'attache aux deux bouts : de la première chaîne à la dernière */
    const tous = C.flatMap(c => c.reperes), lo = Math.min(...tous), hi = Math.max(...tous);
    const dehors = cote === 'haut' || cote === 'gauche' ? -1 : 1;
    for (const v of [lo, hi]) {
      const u = papier(v), a = pos(0) - dehors * 2, z = pos(C.length - 1) + dehors * 2;
      if (h) page.trait(X(u), Y(a), X(u), Y(z), 0.3, ENCRE); else page.trait(X(a), Y(u), X(z), Y(u), 0.3, ENCRE);
    }
    for (const c of C) {
      const l = pos(c.rang), R = c.reperes.map(papier);
      if (h) page.trait(X(Math.min(...R)), Y(l), X(Math.max(...R)), Y(l), 0.35, ENCRE); else page.trait(X(l), Y(Math.min(...R)), X(l), Y(Math.max(...R)), 0.35, ENCRE);
      for (const r of R) { const [px, py] = h ? [r, l] : [l, r]; page.trait(X(px - 1.1), Y(py + 1.1), X(px + 1.1), Y(py - 1.1), 0.5, ENCRE) }
      for (let i = 0; i + 1 < c.reperes.length; i++) {
        const a = c.reperes[i]!, z = c.reperes[i + 1]!, la = Math.abs(R[i + 1]! - R[i]!);
        const baie = c.genre === 'ouvertures' ? baies.find(x => x.cote === cote && Math.abs(x.de - a) < 30 && Math.abs(x.a - z) < 30) : undefined;
        let t = metres(z - a), sous = '';
        if (baie) {
          const o = baie.ouverture;
          t = metres(o.width) + ' × ' + metres(o.height);
          if (PagePdf.largeur(t, corps) / PT > la - 1) t = metres(o.width) + '×' + metres(o.height);
          if (o.sill > 0 && o.kind !== 'door' && o.kind !== 'garage_door') sous = 'all. ' + metres(o.sill);
        }
        const m = (R[i]! + R[i + 1]!) / 2, lt = PagePdf.largeur(t, corps) / PT;
        /* trop serré pour être lu sur la ligne : la valeur passe de l'autre côté, plus petite */
        const serre = lt > la + 3;
        const k = serre ? 6 : corps;
        if (h) {
          texte(page, t, m, serre ? l + 3.3 : l - 1, k, { aligne: 'centre', couleur: '#222222' });
          if (sous) texte(page, sous, m, l + 3, 5.6, { aligne: 'centre', couleur: '#222222' });
        } else {
          /* debout, lu de bas en haut, à gauche de la ligne */
          page.texte(t, X(serre ? l + 3.3 : l - 1), Y(m), k, { aligne: 'centre', angle: 90, couleur: '#222222' });
          if (sous) page.texte(sous, X(l + 3), Y(m), 5.6, { aligne: 'centre', angle: 90, couleur: '#222222' });
        }
      }
    }
  }
}

/** le rectangle où finissent les traits de coupe : 7 mm au-delà des cotes, sans sortir de la zone du dessin */
function rectangleCoupes(x0: number, y0: number, W: number, H: number, marge: (c: Cote4) => number, zone: { x: number; y: number; l: number; h: number }) {
  return { x0: Math.max(zone.x + 4, x0 - marge('gauche') - 7), y0: Math.max(zone.y + 4, y0 - marge('haut') - 7), x1: Math.min(zone.x + zone.l - 4, x0 + W + marge('droite') + 7), y1: Math.min(zone.y + zone.h - 4, y0 + H + marge('bas') + 7) };
}

/** les deux bouts d'un trait de coupe sur le papier : là où sa droite sort du rectangle des cotes */
function extremitesCoupe(l: LigneDeCoupe, P: (p: Point) => [number, number], R: { x0: number; y0: number; x1: number; y1: number }): [[number, number], [number, number]] | null {
  const a = P(l.a), b = P(l.b), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  if (L < 1e-6) return null;
  const ux = dx / L, uy = dy / L;
  let t0 = -Infinity, t1 = Infinity;
  for (const [p, d, lo, hi] of [[a[0], ux, R.x0, R.x1], [a[1], uy, R.y0, R.y1]] as const) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return null; continue }
    const s0 = (lo - p) / d, s1 = (hi - p) / d;
    t0 = Math.max(t0, Math.min(s0, s1)); t1 = Math.min(t1, Math.max(s0, s1));
  }
  if (!(t1 > t0)) return null;
  return [[a[0] + ux * t0, a[1] + uy * t0], [a[0] + ux * t1, a[1] + uy * t1]];
}

/** un trait de coupe au dossier : à chaque bout, un trait fort, la flèche du regard et la lettre (brique) ; le trait mixte
    seulement hors du bâtiment */
function repereCoupe(page: PagePdf, l: LigneDeCoupe, P: (p: Point) => [number, number], Ppt: (p: Point) => [number, number], maconnerie: readonly Polygone[], R: { x0: number; y0: number; x1: number; y1: number }): void {
  const E = extremitesCoupe(l, P, R);
  if (!E) return;
  const [e0, e1] = E, L = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]), ux = (e1[0] - e0[0]) / L, uy = (e1[1] - e0[1]) / L;
  /* l'entrée et la sortie du bâtiment, le long du trait (mm de papier depuis e0) */
  const a0 = P(l.a), dir = { x: ux, y: uy };
  const versModele = (q: [number, number]) => { const k = Math.hypot(P({ x: 1000, y: 0 })[0] - P({ x: 0, y: 0 })[0], 0) / 1000; return { x: l.a.x + (q[0] - a0[0]) / k, y: l.a.y - (q[1] - a0[1]) / k } };
  const m0 = versModele(e0), m1 = versModele(e1);
  let tin = Infinity, tout = -Infinity;
  for (const m of maconnerie) for (const [s, t] of segmentsDans(m0, m1, m)) {
    for (const q of [s, t]) { const pp = P(q), d = (pp[0] - e0[0]) * dir.x + (pp[1] - e0[1]) * dir.y; tin = Math.min(tin, d); tout = Math.max(tout, d) }
  }
  const barre = 6;
  const morceaux: [number, number][] = Number.isFinite(tin) ? [[barre, tin - 1], [tout + 1, L - barre]] : [[barre, L - barre]];
  for (const [s, t] of morceaux) if (t > s) page.trait(X(e0[0] + ux * s), Y(e0[1] + uy * s), X(e0[0] + ux * t), Y(e0[1] + uy * t), 0.45, BRIQUE, [7, 1.5, 1.2, 1.5]);
  const r = { x: l.regard.x, y: -l.regard.y }, rn = Math.hypot(r.x, r.y) || 1, rx = r.x / rn, ry = r.y / rn;
  for (const [e, s] of [[e0, 1], [e1, -1]] as const) {
    const b0: [number, number] = e, b1: [number, number] = [e[0] + ux * s * barre, e[1] + uy * s * barre];
    page.trait(X(b0[0]), Y(b0[1]), X(b1[0]), Y(b1[1]), 2.6, BRIQUE);
    const m: [number, number] = [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2], q: [number, number] = [m[0] + rx * 5.5, m[1] + ry * 5.5];
    page.trait(X(m[0]), Y(m[1]), X(q[0]), Y(q[1]), 0.7, BRIQUE);
    const n = { x: -ry, y: rx };
    page.polygone([[X(q[0] + rx * 2.6), Y(q[1] + ry * 2.6)], [X(q[0] + n.x * 1.4), Y(q[1] + n.y * 1.4)], [X(q[0] - n.x * 1.4), Y(q[1] - n.y * 1.4)]], { fond: BRIQUE });
    /* la lettre, au-delà du bout de la flèche, du côté opposé au bâtiment */
    const lx = q[0] + rx * 2 - ux * s * 4, ly = q[1] + ry * 2 - uy * s * 4;
    texte(page, l.nom, lx, ly + 1.6, 10, { gras: true, couleur: BRIQUE, aligne: 'centre' });
  }
  void Ppt;
}
