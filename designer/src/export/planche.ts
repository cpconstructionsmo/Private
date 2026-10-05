/* La planche A3 d'un niveau : le plan coté à une échelle normalisée, un
   cartouche CP Constructions, le tableau des surfaces et une échelle
   graphique. Le plan est dessiné par le même code qu'à l'écran (ui/dessin.ts)
   sur une toile PDF : vectoriel, net à toutes les tailles d'impression.

   Repère de la mise en page : millimètres depuis le haut-gauche de la
   feuille (comme on la lit) ; la page PDF est en points depuis le bas. */
import type { Floor, Project, Roof } from '../model/types';
import type { Toiture } from '../building/toiture';
import { centroide } from '../geometry/polygon';
import { planDuNiveau, cotationExterieure, toitureDuNiveau, emprise, mursDroits, geometrieEscalier, hauteurAFranchir, tremiesDuNiveau, fenetresDeToit } from '../building';
import { dessiner, dessinerAmenagement, dessinerParcelle, dessinerPointDeVue, nord, type Scene } from '../ui/dessin';
import { GENRES_AMENAGEMENT, finitionAmenagement } from '../catalogue/amenagements';
import { parcelleDuProjet, empriseAuSol, aireEmprise, surfaceTerrain, reculs, maisonDansParcelle, bilanAmenagements, pointsDeVue, champDeVue, profilTerrain, altitudeTerrain } from '../building/terrain';
import { segmentsDans } from '../geometry/hachures';
import { surfacesReglementaires, REFERENCES, type Surfaces } from '../building/surfaces';
import { versEcran, type Camera } from '../ui/camera';
import { DocumentPdf, largeurTexte, type PagePdf } from './pdf';
import { notice, A_COMPLETER } from './notice';
import { maquette, COUVERTURES, type Matiere } from '../vue3d/maquette';
import { facade, FACADES, type CoteFacade, type Facade } from '../vue3d/facades';
import { coupe, lignesDeCoupe, traitsDeCoupe, type LigneDeCoupe } from '../vue3d/coupe';
import { ToilePdf } from './toile-pdf';
import { materiau } from '../catalogue/materiaux';

export const PT = 72 / 25.4;                       // points par millimètre
export const A3 = { l: 420, h: 297 } as const;      // à l'italienne, mm

/** la zone du dessin (mm, depuis le haut-gauche) ; à droite, la colonne surfaces + cartouche */
export const ZONE = { x: 15, y: 15, l: 300, h: 262 } as const;
const COLONNE = { x: 320, l: 90 } as const;
const CARTOUCHE_H = 62;

/** les échelles d'un plan de maison, de la plus grande à la plus petite (1/n) */
export const ECHELLES = [50, 75, 100, 125, 150, 200, 250, 500, 1_000] as const;
/** cotation imprimée : écart entre deux lignes de cote, et place laissée autour du plan (mm de papier) */
const ECART_COTES = 7, MARGE_COTES = 26, MARGE_SANS = 8;

export interface OptionsPlanche {
  niveaux: string[];
  cotation: boolean;
  mobilier: boolean;
  /** « A », « B »… */
  indice: string;
  /** la date affichée (jj/mm/aaaa) */
  date: string;
  /** imposer une échelle (1/n) ; sinon la plus grande qui tient */
  echelle?: number;
  /** ajouter une planche des quatre façades */
  facades?: boolean;
  /** pour le dossier de permis : les titres portent leur pièce (PCMI 2, 3, 5) */
  dossier?: boolean;
  /** ajouter le plan de toiture (avec les façades, PCMI 5), s'il y a une toiture */
  toiture?: boolean;
  /** ajouter le plan de masse (PCMI 2), s'il y a une parcelle */
  masse?: boolean;
  /** ajouter les coupes (les traits tracés, sinon une coupe A-A placée d'elle-même) et leurs traits sur les plans */
  coupe?: boolean;
  /** des plans de présentation (pour le client) : sols en couleur avec leur motif, la colonne dit le sol de chaque pièce */
  presentation?: boolean;
}

/** la boîte de ce qui se dessine sur un niveau (mm) : maçonnerie, meubles, débord de toit */
export function boiteDessin(f: Floor, mobilier = true): { xmin: number; ymin: number; xmax: number; ymax: number } | null {
  const P = planDuNiveau(f).maconnerie.flatMap(p => p.contour);
  for (const o of Object.values(f.objects)) if (mobilier && o.type === 'furniture') P.push(...emprise(o));
  const t = toitureDuNiveau(f);
  if (t?.ok) for (const x of t.toitures) P.push(...x.egout);
  if (!P.length) for (const w of mursDroits(f)) P.push(w.axis.a, w.axis.b);
  if (!P.length) return null;
  return { xmin: Math.min(...P.map(p => p.x)), ymin: Math.min(...P.map(p => p.y)), xmax: Math.max(...P.map(p => p.x)), ymax: Math.max(...P.map(p => p.y)) };
}

/** la plus grande échelle normalisée à laquelle un dessin de l × h mm tient dans la zone, cotes comprises */
export function echelleNormalisee(l: number, h: number, cotation = true): number {
  const m = 2 * (cotation ? MARGE_COTES : MARGE_SANS);
  return ECHELLES.find(e => l / e + m <= ZONE.l && h / e + m <= ZONE.h) ?? ECHELLES[ECHELLES.length - 1]!;
}

const m2 = (v: number) => (v / 1e6).toFixed(2).replace('.', ',') + ' m²';

function planche(doc: DocumentPdf, projet: Project, f: Floor, o: OptionsPlanche, traits: LigneDeCoupe[]): void {
  const page = doc.page(A3.l * PT, A3.h * PT);
  /* coordonnées de mise en page (mm, haut-gauche) → page PDF */
  const X = (x: number) => x * PT, Y = (y: number) => (A3.h - y) * PT;
  const niveau: Floor = o.mobilier ? f : { ...f, objects: Object.fromEntries(Object.entries(f.objects).filter(([, x]) => x.type !== 'furniture')) };
  const B = boiteDessin(niveau, o.mobilier);
  const ech = o.echelle ?? (B ? echelleNormalisee(B.xmax - B.xmin, B.ymax - B.ymin, o.cotation) : 100);

  /* le cadre de la feuille */
  page.cadre(X(10), Y(287), 400 * PT, 277 * PT, { ep: 0.8 });

  /* le plan, à l'échelle, centré dans sa zone */
  if (B) {
    const cam: Camera = { centre: { x: (B.xmin + B.xmax) / 2, y: (B.ymin + B.ymax) / 2 }, echelle: PT / ech, largeur: ZONE.l * PT, hauteur: ZONE.h * PT };
    const toile = new ToilePdf(page, ZONE.x * PT, ZONE.y * PT);
    const t = toitureDuNiveau(niveau);
    const scene: Scene = {
      niveau, dessous: null, selection: null, accroche: null, images: new Map(), sommets: false, impression: true,
      escaliers: Object.values(niveau.objects).flatMap(x => (x.type === 'stair' ? [{ id: x.id, geo: geometrieEscalier(x, hauteurAFranchir(projet, f)) }] : [])),
      tremies: tremiesDuNiveau(projet, f), coupes: traits, ...(o.presentation ? { presentation: true } : {}),
      ...(o.cotation ? { cotation: cotationExterieure(niveau, ECART_COTES * ech) } : {}), ...(t?.ok ? { toitures: t.toitures } : {}),
    };
    dessiner(toile as unknown as CanvasRenderingContext2D, cam, scene);
  } else page.texte('Niveau vide : aucun mur à dessiner.', X(ZONE.x + 10), Y(ZONE.y + 20), 11, { couleur: '#6E7B84' });

  echelleGraphique(page, ech);

  /* la colonne de droite : les surfaces, puis le cartouche */
  page.trait(X(COLONNE.x), Y(10), X(COLONNE.x), Y(287), 0.6);
  const zones = planDuNiveau(niveau).zones;
  let y = 20;
  page.texte(o.presentation ? 'SOLS ET SURFACES' : 'SURFACES', X(COLONNE.x + 5), Y(y), 9, { gras: true, couleur: '#2C4A5E' });
  page.texte('intérieures brutes, entre murs', X(COLONNE.x + 5), Y(y + 4.2), 6.5, { couleur: '#6E7B84' });
  y += 10;
  const lignes = zones.map(z => ({ nom: z.piece?.name ?? 'Espace à nommer', aire: z.aire, sol: z.piece ? materiau(z.piece.floorFinish) : undefined })).sort((a, b) => b.aire - a.aire);
  /* en présentation, chaque pièce dit aussi son sol (une pastille de sa couleur) : deux lignes par pièce */
  const pas = o.presentation ? 8.5 : 5;
  const max = Math.floor((287 - CARTOUCHE_H - 20 - y) / pas);
  for (const l of lignes.slice(0, max)) {
    page.texte(l.nom, X(COLONNE.x + 5), Y(y), 8);
    page.texte(m2(l.aire), X(COLONNE.x + COLONNE.l - 5), Y(y), 8, { aligne: 'droite' });
    if (o.presentation) {
      if (l.sol) page.cadre(X(COLONNE.x + 5), Y(y + 4.6), 2.6 * PT, 2.6 * PT, { ep: 0.2, fond: l.sol.couleur });
      page.texte(l.sol ? l.sol.libelle : 'sol à choisir', X(COLONNE.x + (l.sol ? 9 : 5)), Y(y + 4.2), 6.5, { couleur: '#6E7B84' });
    }
    page.trait(X(COLONNE.x + 5), Y(y + pas - 3.6), X(COLONNE.x + COLONNE.l - 5), Y(y + pas - 3.6), 0.2, '#DDD5C8');
    y += pas;
  }
  if (lignes.length > max) { page.texte('… ' + (lignes.length - max) + ' autre(s)', X(COLONNE.x + 5), Y(y), 7, { couleur: '#6E7B84' }); y += 5 }
  if (lignes.length) {
    page.texte('Total (' + lignes.length + ')', X(COLONNE.x + 5), Y(y + 1), 8, { gras: true });
    page.texte(m2(lignes.reduce((s, l) => s + l.aire, 0)), X(COLONNE.x + COLONNE.l - 5), Y(y + 1), 8, { gras: true, aligne: 'droite' });
    page.texte('Ni surface habitable ni surface de plancher.', X(COLONNE.x + 5), Y(y + 6), 6.5, { couleur: '#6E7B84' });
  } else page.texte('Aucun espace clos.', X(COLONNE.x + 5), Y(y), 8, { couleur: '#6E7B84' });

  cartouche(page, projet, (o.presentation ? 'Plan de présentation : ' : 'Plan : ') + f.name, ech, o);
}

/** l'échelle graphique, sous le dessin : 0 – 1 – 2 – 5 m (ou plus, à petite échelle) */
function echelleGraphique(page: PagePdf, ech: number): void {
  const X = (x: number) => x * PT, Y = (y: number) => (A3.h - y) * PT;
  const pas = ech <= 100 ? [0, 1, 2, 5] : ech <= 250 ? [0, 2, 5, 10] : [0, 10, 20, 50];
  const x0 = ZONE.x + 2, yb = 283;
  pas.forEach((v, i) => {
    if (i === 0) return;
    const a = x0 + pas[i - 1]! * 1000 / ech, b = x0 + v * 1000 / ech;
    page.cadre(X(a), Y(yb), (b - a) * PT, 1.6 * PT, { ep: 0.4, ...(i % 2 ? { fond: '#1A2B36' } : { fond: '#FFFFFF' }) });
  });
  pas.forEach(v => page.texte(String(v), X(x0 + v * 1000 / ech), Y(yb - 2.4), 6.5, { aligne: 'centre' }));
  page.texte('m', X(x0 + pas[pas.length - 1]! * 1000 / ech + 3), Y(yb - 2.4), 6.5);
}

/** le cartouche CP Constructions, en bas de la colonne de droite */
function cartouche(page: PagePdf, projet: Project, titre: string, ech: number, o: OptionsPlanche): void {
  const X = (x: number) => x * PT, Y = (y: number) => (A3.h - y) * PT;
  const yc = 287 - CARTOUCHE_H, cx = COLONNE.x + 5;
  page.trait(X(COLONNE.x), Y(yc), X(410), Y(yc), 0.6);
  page.texte('CP CONSTRUCTIONS', X(cx), Y(yc + 8), 13, { gras: true, couleur: '#C5563A' });
  page.texte('Maîtrise d’œuvre', X(cx), Y(yc + 12.5), 7.5, { couleur: '#6E7B84' });
  page.texte(projet.name || 'Projet', X(cx), Y(yc + 21), 10.5, { gras: true });
  page.texte(titre, X(cx), Y(yc + 27), 9);
  const rangs: [string, string][] = [['Échelle', ech ? '1/' + ech + ' (A3)' : 'sans objet'], ['Phase', projet.phase], ['Date', o.date], ['Indice', o.indice || 'A']];
  rangs.forEach(([k, v], i) => {
    const yy = yc + 34 + i * 5;
    page.texte(k, X(cx), Y(yy), 8, { couleur: '#6E7B84' });
    page.texte(v, X(cx + 22), Y(yy), 8, { gras: true });
  });
  page.texte('Document de travail : cotes à vérifier sur place avant exécution.', X(cx), Y(yc + 57), 6.2, { couleur: '#6E7B84' });
}

/* ---------- la planche des façades ---------- */

/** les teintes des façades : légères, pour un tirage lisible en noir et blanc */
const TEINTES: Partial<Record<Matiere, string>> = {
  mur: '#FFFFFF', plancher: '#FFFFFF', vitrage: '#D9E6EE', porte: '#EADFD3', garage: '#E6E8EA',
  tuile: '#ECCBC0', ardoise: '#BCC3CA', zinc: '#D4D8DC', bac_acier: '#C8CED4', vegetalise: '#D3E3C9', gravillons: '#E6E2DA',
};
const m = (v: number) => (v >= 0 ? '+' : '−') + (Math.abs(v) / 1000).toFixed(2).replace('.', ',');

/** les hauteurs repères du projet : sol fini, égout le plus bas, faîtage le plus haut (null : pas de toiture) */
function hauteurs(projet: Project): { egout: number | null; faitage: number | null; hautMurs: number } {
  let egout: number | null = null, faitage: number | null = null, hautMurs = 0;
  for (const b of projet.buildings) for (const f of b.floors) {
    const t = toitureDuNiveau(f);
    if (t?.ok) for (const x of t.toitures) { egout = egout === null ? x.egoutZ : Math.min(egout, x.egoutZ); faitage = faitage === null ? x.faitage : Math.max(faitage, x.faitage); hautMurs = Math.max(hautMurs, x.hautMurs) }
    for (const w of mursDroits(f)) hautMurs = Math.max(hautMurs, f.elevation + w.baseOffset + w.height);
  }
  return { egout, faitage, hautMurs };
}

/** les matériaux qui se voient en façade : parements des murs extérieurs, puis couverture */
function materiauxFacade(projet: Project): [string, string][] {
  const vus = new Map<string, string>();
  const murs = projet.buildings.flatMap(b => b.floors).flatMap(f => Object.values(f.objects)).filter(o => o.type === 'wall' && o.role === 'exterior');
  for (const w of murs) { const m = w.type === 'wall' ? materiau(w.finish) : undefined; if (m) vus.set(m.libelle, m.couleur) }
  if (murs.some(w => w.type === 'wall' && !materiau(w.finish))) vus.set('Façade sans parement choisi', '#FFFFFF');
  for (const f of projet.buildings.flatMap(b => b.floors)) for (const o of Object.values(f.objects)) if (o.type === 'roof') vus.set('Couverture : ' + COUVERTURES_FR[o.covering], TEINTES[COUVERTURES[o.covering]] ?? '#FFFFFF');
  return [...vus];
}
const COUVERTURES_FR: Record<string, string> = { tile: 'tuiles', slate: 'ardoises', zinc: 'zinc', steel: 'bac acier', green: 'toiture végétalisée', gravel: 'toit-terrasse gravillonné' };

function plancheFacades(doc: DocumentPdf, projet: Project, o: OptionsPlanche): void {
  const page = doc.page(A3.l * PT, A3.h * PT);
  const X = (x: number) => x * PT, Y = (y: number) => (A3.h - y) * PT;
  page.cadre(X(10), Y(287), 400 * PT, 277 * PT, { ep: 0.8 });
  const M = maquette(projet);
  const cotes: CoteFacade[] = ['sud', 'est', 'nord', 'ouest'];
  const F: Facade[] = cotes.map(c => facade(M, c));
  const larg = Math.max(...F.map(f => (f.boite ? f.boite.umax - f.boite.umin : 0))), haut = Math.max(...F.map(f => (f.boite ? f.boite.zmax - Math.min(0, f.boite.zmin) : 0)));
  /* quatre cases de 150 × 131 mm ; à gauche de chaque dessin, 22 mm pour les cotes de niveau */
  const CL = ZONE.l / 2, CH = ZONE.h / 2;
  const ech = o.echelle ?? (ECHELLES.find(e => larg / e + 34 <= CL && haut / e + 26 <= CH) ?? ECHELLES[ECHELLES.length - 1]!);
  const H = hauteurs(projet);
  F.forEach((f, k) => {
    const x0 = ZONE.x + (k % 2) * CL, y0 = ZONE.y + Math.floor(k / 2) * CH;
    page.texte(FACADES[f.cote], X(x0 + 4), Y(y0 + 6), 9, { gras: true, couleur: '#2C4A5E' });
    if (!f.boite) { page.texte('Rien à dessiner.', X(x0 + 4), Y(y0 + 14), 8, { couleur: '#6E7B84' }); return }
    /* la façade centrée dans sa case ; z = 0 (le sol) sur une ligne commune */
    const solY = y0 + 10 + (CH - 16 + haut / ech) / 2, uc = (f.boite.umin + f.boite.umax) / 2, xc = x0 + 22 + (CL - 26) / 2;     // centrée dans sa case
    const P = (u: number, z: number): [number, number] => [X(xc + (u - uc) / ech), Y(solY - z / ech)];
    for (const face of f.faces) page.polygone(face.points.map(q => P(q.u, q.z)), { fond: materiau(face.finition)?.couleur ?? TEINTES[face.matiere] ?? '#FFFFFF', trait: '#1A2B36', ep: 0.3 });
    /* le terrain */
    const [ga] = P(f.boite.umin - 1_500, 0), [gb] = P(f.boite.umax + 1_500, 0);
    page.trait(ga, Y(solY), gb, Y(solY), 1.1);
    /* les cotes de niveau, à gauche : ±0,00, égout (ou haut des murs), faîtage */
    const xr = x0 + 6, niv: [number, string][] = [[0, '±0,00 sol fini']];
    if (H.egout !== null) niv.push([H.egout, m(H.egout) + ' égout']); else niv.push([H.hautMurs, m(H.hautMurs) + ' haut des murs']);
    if (H.faitage !== null) niv.push([H.faitage, m(H.faitage) + ' faîtage']);
    for (const [z, t] of niv) {
      const y = solY - z / ech;
      page.trait(X(xr), Y(y), X(xc + (f.boite.umin - uc) / ech - 2), Y(y), 0.25, '#6E7B84');
      page.polygone([[X(xr), Y(y)], [X(xr + 1.6), Y(y - 2.2)], [X(xr - 1.6), Y(y - 2.2)]], { fond: '#1A2B36' });
      page.texte(t, X(xr + 2.5), Y(y - 1), 6.2);
    }
  });
  /* la colonne de droite : les hauteurs, puis le cartouche */
  page.trait(X(COLONNE.x), Y(10), X(COLONNE.x), Y(287), 0.6);
  let y = 20;
  page.texte('HAUTEURS', X(COLONNE.x + 5), Y(y), 9, { gras: true, couleur: '#2C4A5E' }); y += 8;
  const lignes: [string, string][] = [['Sol fini du rez-de-chaussée', '±0,00'], ['Haut des murs', m(H.hautMurs)]];
  if (H.egout !== null) lignes.push(['Égout (le plus bas)', m(H.egout)]);
  if (H.faitage !== null) lignes.push(['Faîtage (le plus haut)', m(H.faitage)]);
  for (const [k, v] of lignes) { page.texte(k, X(COLONNE.x + 5), Y(y), 8); page.texte(v, X(COLONNE.x + COLONNE.l - 5), Y(y), 8, { aligne: 'droite', gras: true }); y += 5 }
  /* les matériaux de façade et de couverture (PCMI 5), avec leur teinte */
  const mats = materiauxFacade(projet);
  if (mats.length) {
    y += 4;
    page.texte('MATÉRIAUX', X(COLONNE.x + 5), Y(y), 9, { gras: true, couleur: '#2C4A5E' }); y += 7;
    for (const [lib, coul] of mats) { page.cadre(X(COLONNE.x + 5), Y(y + 0.8), 4 * PT, 3 * PT, { ep: 0.3, fond: coul }); page.texte(lib, X(COLONNE.x + 11), Y(y), 7.5); y += 5 }
  }
  y += 3;
  for (const t of ['Hauteurs indicatives depuis le sol fini, au nu extérieur', 'du haut des murs : charpente, isolation et épaisseurs', 'réelles ne sont pas étudiées ici (à vérifier avant le PC).', '', 'Orientation supposée : le haut du plan est au nord', '(à confirmer sur le plan de masse).'])
    { page.texte(t, X(COLONNE.x + 5), Y(y), 6.5, { couleur: '#6E7B84' }); y += 3.6 }
  cartouche(page, projet, o.dossier ? 'PCMI 5 — Façades' : 'Façades', ech, o);
}

/* ---------- le plan de masse (PCMI 2) ---------- */

/** les échelles d'un plan de masse */
const ECHELLES_MASSE = [100, 200, 250, 500, 1_000, 2_000] as const;

function plancheMasse(doc: DocumentPdf, projet: Project, o: OptionsPlanche): void {
  const t = parcelleDuProjet(projet);
  if (!t) return;
  const page = doc.page(A3.l * PT, A3.h * PT);
  const X = (x: number) => x * PT, Y = (y: number) => (A3.h - y) * PT;
  page.cadre(X(10), Y(287), 400 * PT, 277 * PT, { ep: 0.8 });
  page.texte('Plan de masse', X(ZONE.x + 4), Y(ZONE.y + 6), 11, { gras: true, couleur: '#2C4A5E' });
  const plot = t.plot, E = empriseAuSol(projet), R = reculs(plot, E), S = surfaceTerrain(plot), em = aireEmprise(E);
  /* la boîte : la parcelle et les débords de toit ; 30 mm de papier autour pour les cotes */
  const P = [...plot.contour, ...E.flatMap(q => q.contour)];
  const toits = projet.buildings.flatMap(b => b.floors).flatMap(f => { const r = toitureDuNiveau(f); return r?.ok ? r.toitures.map(x => x.egout) : [] });
  for (const e of toits) P.push(...e);
  for (const f of projet.buildings.flatMap(b => b.floors)) for (const x of Object.values(f.objects)) if (x.type === 'landscape') P.push(...x.points);
  const PV = pointsDeVue(projet);
  for (const v of PV) { const c = champDeVue(v); P.push(v.a, v.b, c.gauche, c.droite) }
  for (const x of plot.spotHeights ?? []) P.push(x.point);
  const xmin = Math.min(...P.map(p => p.x)), xmax = Math.max(...P.map(p => p.x)), ymin = Math.min(...P.map(p => p.y)), ymax = Math.max(...P.map(p => p.y));
  const ech = o.echelle ?? (ECHELLES_MASSE.find(e => (xmax - xmin) / e + 60 <= ZONE.l && (ymax - ymin) / e + 50 <= ZONE.h) ?? ECHELLES_MASSE[ECHELLES_MASSE.length - 1]!);
  const cam: Camera = { centre: { x: (xmin + xmax) / 2, y: (ymin + ymax) / 2 }, echelle: PT / ech, largeur: ZONE.l * PT, hauteur: ZONE.h * PT };
  const toile = new ToilePdf(page, ZONE.x * PT, ZONE.y * PT) as unknown as CanvasRenderingContext2D;
  const E2 = (q: { x: number; y: number }) => versEcran(cam, q);
  /* les aménagements extérieurs, sous la maison */
  for (const f of projet.buildings.flatMap(b => b.floors)) for (const x of Object.values(f.objects)) if (x.type === 'landscape') dessinerAmenagement(toile, cam, x);
  /* la maison : son emprise pleine, le débord du toit en tirets */
  toile.fillStyle = '#C9D0D5'; toile.strokeStyle = '#1A2B36'; toile.lineWidth = 1.2;
  for (const q of E) { toile.beginPath(); q.contour.map(E2).forEach((e, i) => (i ? toile.lineTo(e.x, e.y) : toile.moveTo(e.x, e.y))); toile.closePath(); toile.fill(); toile.stroke() }
  toile.lineWidth = 0.7; toile.setLineDash([6, 3]);
  for (const e of toits) { toile.beginPath(); e.map(E2).forEach((p, i) => (i ? toile.lineTo(p.x, p.y) : toile.moveTo(p.x, p.y))); toile.closePath(); toile.stroke() }
  toile.setLineDash([]);
  dessinerParcelle(toile, cam, plot, R, { nord: false });
  /* les points de prise de vue des photographies du dossier (PCMI 6, 7, 8) */
  for (const v of PV) dessinerPointDeVue(toile, cam, v);
  /* l'altitude du ±0,00 au milieu de la maison */
  if (E.length) {
    const c = E2(E[0]!.contour.reduce((s, q) => ({ x: s.x + q.x / E[0]!.contour.length, y: s.y + q.y / E[0]!.contour.length }), { x: 0, y: 0 }));
    toile.fillStyle = '#1A2B36'; toile.font = '700 12px sans-serif'; toile.textAlign = 'center'; toile.textBaseline = 'middle';
    toile.fillText('±0,00' + (plot.groundFloorNgf !== undefined ? ' = ' + plot.groundFloorNgf.toFixed(2).replace('.', ',') + ' NGF' : ''), c.x, c.y);
  }
  /* le nord, en haut à droite du dessin */
  nord(toile, { x: (ZONE.l - 14) * PT, y: 16 * PT }, plot.north, 22);
  echelleGraphique(page, ech);

  /* la colonne : le terrain, les reculs, les notes, le cartouche */
  page.trait(X(COLONNE.x), Y(10), X(COLONNE.x), Y(287), 0.6);
  let y = 20;
  const ligne = (k: string, v: string, gras = true) => { page.texte(k, X(COLONNE.x + 5), Y(y), 8); page.texte(v, X(COLONNE.x + COLONNE.l - 5), Y(y), 8, { aligne: 'droite', gras }); y += 5 };
  page.texte('TERRAIN', X(COLONNE.x + 5), Y(y), 9, { gras: true, couleur: '#2C4A5E' }); y += 8;
  ligne('Référence cadastrale', plot.reference ?? '[à compléter]', !!plot.reference);
  ligne('Voie', plot.streetName ?? (plot.street.length ? '[nom à compléter]' : '[côté sur voie à indiquer]'), !!plot.streetName);
  ligne('Surface du terrain (tracée)', m2(S));
  ligne('Emprise au sol (maçonnerie)', m2(em));
  ligne('Part du terrain', S ? (em / S * 100).toFixed(1).replace('.', ',') + ' %' : '—');
  ligne('±0,00 (sol fini RDC)', plot.groundFloorNgf !== undefined ? plot.groundFloorNgf.toFixed(2).replace('.', ',') + ' NGF' : '[NGF à compléter]', plot.groundFloorNgf !== undefined);
  const Z = (plot.spotHeights ?? []).map(x => x.ngf), f2 = (v: number) => v.toFixed(2).replace('.', ',');
  ligne('Terrain naturel', Z.length ? (Z.length > 1 ? f2(Math.min(...Z)) + ' à ' + f2(Math.max(...Z)) : f2(Z[0]!)) + ' NGF (' + Z.length + ' pt' + (Z.length > 1 ? 's' : '') + ')' : '[non relevé]', Z.length > 0);
  /* l'altitude du terrain naturel au droit de la maison (son centre), comparée au ±0,00 */
  const E0 = E[0], tnMaison = E0 && Z.length ? altitudeTerrain(plot, centroide(E0.contour)) : null;
  if (tnMaison !== null && plot.groundFloorNgf !== undefined) ligne('±0,00 au-dessus du TN (centre)', ((plot.groundFloorNgf - tnMaison) >= 0 ? '+' : '') + f2(plot.groundFloorNgf - tnMaison) + ' m');
  y += 4;
  page.texte('RECULS (mesurés)', X(COLONNE.x + 5), Y(y), 9, { gras: true, couleur: '#2C4A5E' }); y += 8;
  if (E.length && !maisonDansParcelle(plot, E)) { page.texte('ATTENTION : la maison sort de la parcelle.', X(COLONNE.x + 5), Y(y), 8, { gras: true, couleur: '#C5563A' }); y += 6 }
  for (const r of R) ligne('Côté ' + (r.cote + 1) + ' (' + (r.longueur / 1000).toFixed(2).replace('.', ',') + ' m)' + (r.voie ? ' — voie' : ''), (r.distance / 1000).toFixed(2).replace('.', ',') + ' m');
  /* les aménagements : chacun avec sa surface ou sa longueur ; les espaces verts en part du terrain */
  const Am = bilanAmenagements(projet);
  if (Am.length) {
    y += 4;
    page.texte('AMÉNAGEMENTS', X(COLONNE.x + 5), Y(y), 9, { gras: true, couleur: '#2C4A5E' }); y += 8;
    for (const a of Am.slice(0, 10)) {
      const fin = finitionAmenagement(a.finition);
      ligne(GENRES_AMENAGEMENT[a.genre].libelle + (fin ? ' : ' + fin.libelle.toLowerCase() : ''), a.genre === 'fence' ? (a.mesure / 1000).toFixed(2).replace('.', ',') + ' m' : m2(a.mesure), false);
    }
    if (Am.length > 10) { page.texte('… ' + (Am.length - 10) + ' autre(s)', X(COLONNE.x + 5), Y(y), 7, { couleur: '#6E7B84' }); y += 5 }
    const vert = Am.filter(a => a.genre === 'green').reduce((t, a) => t + a.mesure, 0);
    if (vert) ligne('Espaces verts', m2(vert) + (S ? ' (' + (vert / S * 100).toFixed(1).replace('.', ',') + ' %)' : ''));
  }
  if (PV.length) {
    y += 4;
    page.texte('PRISES DE VUE', X(COLONNE.x + 5), Y(y), 9, { gras: true, couleur: '#2C4A5E' }); y += 8;
    const NOMS: Record<string, string> = { 'PCMI 6': 'insertion', 'PCMI 7': 'environnement proche', 'PCMI 8': 'environnement lointain' };
    for (const v of PV) ligne(v.piece + ' — ' + NOMS[v.piece], 'reportée', false);
  }
  y += 3;
  for (const l of ['Reculs : du nu extérieur de la maçonnerie au point', 'le plus proche de chaque limite. Emprise au sol :', 'débords de toit exclus. Limite tracée : à confirmer', 'sur le plan de bornage ; règles du PLU à vérifier.'])
    { page.texte(l, X(COLONNE.x + 5), Y(y), 6.5, { couleur: '#6E7B84' }); y += 3.6 }
  cartouche(page, projet, o.dossier ? 'PCMI 2 — Plan de masse' : 'Plan de masse (PCMI 2)', ech, o);
}

/* ---------- le plan de toiture (PCMI 5) ---------- */

const TOITURES_FR: Record<string, string> = { hip: 'à croupes', gable: 'à deux pans', shed: 'à un pan', flat: 'toit-terrasse' };

/** les toitures du projet, avec leur objet et le niveau qui les porte */
function toituresDuProjet(projet: Project): { f: Floor; roof: Roof; t: Toiture }[] {
  const out: { f: Floor; roof: Roof; t: Toiture }[] = [];
  for (const f of projet.buildings.flatMap(b => b.floors)) {
    const roof = Object.values(f.objects).find((x): x is Roof => x.type === 'roof'), r = toitureDuNiveau(f);
    if (roof && r?.ok) for (const t of r.toitures) out.push({ f, roof, t });
  }
  return out;
}

function plancheToiture(doc: DocumentPdf, projet: Project, o: OptionsPlanche): void {
  const T = toituresDuProjet(projet);
  if (!T.length) return;
  const page = doc.page(A3.l * PT, A3.h * PT);
  const X = (x: number) => x * PT, Y = (y: number) => (A3.h - y) * PT;
  page.cadre(X(10), Y(287), 400 * PT, 277 * PT, { ep: 0.8 });
  page.texte('Plan de toiture', X(ZONE.x + 4), Y(ZONE.y + 6), 11, { gras: true, couleur: '#2C4A5E' });
  const P = T.flatMap(x => x.t.egout);
  const xmin = Math.min(...P.map(p => p.x)), xmax = Math.max(...P.map(p => p.x)), ymin = Math.min(...P.map(p => p.y)), ymax = Math.max(...P.map(p => p.y));
  const ech = o.echelle ?? (ECHELLES.find(e => (xmax - xmin) / e + 50 <= ZONE.l && (ymax - ymin) / e + 40 <= ZONE.h) ?? ECHELLES[ECHELLES.length - 1]!);
  const cam: Camera = { centre: { x: (xmin + xmax) / 2, y: (ymin + ymax) / 2 }, echelle: PT / ech, largeur: ZONE.l * PT, hauteur: ZONE.h * PT };
  const E = (q: { x: number; y: number }): [number, number] => { const e = versEcran(cam, q); return [X(ZONE.x) + e.x, Y(ZONE.y) - e.y] };
  for (const { f, roof, t } of T) {
    /* les murs qui la portent, vus à travers la toiture : un trait fin gris, posé après les pans */
    const murs = () => { for (const m of planDuNiveau(f).maconnerie) for (const r of [m.contour, ...(m.trous ?? [])]) {
      const C = r.map(E);
      C.forEach((a, i) => { const b = C[(i + 1) % C.length]!; page.trait(a[0], a[1], b[0], b[1], 0.3, '#8A96A0') });
    } };
    const teinte = TEINTES[COUVERTURES[roof.covering]] ?? '#FFFFFF';
    if (t.terrasse) {
      page.polygone(t.terrasse.dalle.map(E), { fond: teinte, trait: '#1A2B36', ep: 0.8 });
      for (const a of t.terrasse.acrotere) page.polygone(a.contour.map(E), { fond: '#FFFFFF', trait: '#1A2B36', ep: 0.5 });
      const c = E(centroide(t.terrasse.dalle));
      page.texte('Toit-terrasse : pente d’évacuation à préciser', c[0], c[1], 7.5, { aligne: 'centre' });
      murs();
      continue;
    }
    for (const pan of t.pans) page.polygone(pan.contour.map(E), { fond: teinte, trait: '#1A2B36', ep: 0.7 });
    /* les fenêtres de toit : le châssis en plan (raccourci par la pente), vitré, ses diagonales ; avant les flèches de pente */
    for (const { geo } of fenetresDeToit(f)) {
      const C = geo.plan.map(E);
      page.polygone(C, { fond: '#C9DCE7', trait: '#1A2B36', ep: 0.6 });
      page.trait(C[0]![0], C[0]![1], C[2]![0], C[2]![1], 0.3); page.trait(C[1]![0], C[1]![1], C[3]![0], C[3]![1], 0.3);
    }
    for (const pan of t.pans) {
      /* la flèche de la pente, du haut vers le bas du pan, au milieu du pan */
      const g = Math.hypot(pan.plan.a, pan.plan.b);
      if (g < 1e-6) continue;
      const c = centroide(pan.contour), d = { x: -pan.plan.a / g, y: -pan.plan.b / g }, L = 9 * ech;      // 9 mm de papier
      const a0 = E({ x: c.x - d.x * L / 2, y: c.y - d.y * L / 2 }), a1 = E({ x: c.x + d.x * L / 2, y: c.y + d.y * L / 2 });
      page.trait(a0[0], a0[1], a1[0], a1[1], 0.6);
      const ux = (a1[0] - a0[0]) / Math.hypot(a1[0] - a0[0], a1[1] - a0[1]), uy = (a1[1] - a0[1]) / Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
      page.polygone([[a1[0], a1[1]], [a1[0] - ux * 5 - uy * 2.2, a1[1] - uy * 5 + ux * 2.2], [a1[0] - ux * 5 + uy * 2.2, a1[1] - uy * 5 - ux * 2.2]], { fond: '#1A2B36' });
      const deg = Math.atan(g) * 180 / Math.PI, mx = (a0[0] + a1[0]) / 2, my = (a0[1] + a1[1]) / 2;
      /* l'étiquette à côté de la flèche, jamais dessus */
      const lib = Math.round(deg) + '° · ' + Math.round(g * 100) + ' %';
      if (Math.abs(uy) > Math.abs(ux)) page.texte(lib, mx + 5, my - 2.5, 7, { gras: true });             // flèche plutôt verticale : à sa droite
      else page.texte(lib, mx, my + 5, 7, { aligne: 'centre', gras: true });                               // plutôt horizontale : au-dessus
    }
    murs();
    /* les pignons : le haut du mur, en trait fort */
    for (const pg of t.pignons) {
      const Q = pg.points.map(E);
      const xs = Q.map(q => q[0]), ys = Q.map(q => q[1]);
      const i0 = xs.indexOf(Math.min(...xs)), i1 = xs.indexOf(Math.max(...xs));
      const [p0, p1] = Math.max(...xs) - Math.min(...xs) > Math.max(...ys) - Math.min(...ys) ? [Q[i0]!, Q[i1]!] : [Q[ys.indexOf(Math.min(...ys))]!, Q[ys.indexOf(Math.max(...ys))]!];
      page.trait(p0[0], p0[1], p1[0], p1[1], 2.2);
    }
  }
  const t0 = T.flatMap(x => x.t), parcelle = parcelleDuProjet(projet);
  nord(new ToilePdf(page, ZONE.x * PT, ZONE.y * PT) as unknown as CanvasRenderingContext2D, { x: (ZONE.l - 14) * PT, y: 16 * PT }, parcelle?.plot.north ?? 0, 22);
  echelleGraphique(page, ech);

  /* la colonne : la toiture en chiffres, puis le cartouche */
  page.trait(X(COLONNE.x), Y(10), X(COLONNE.x), Y(287), 0.6);
  let y = 20;
  const ligne = (k: string, v: string) => { page.texte(k, X(COLONNE.x + 5), Y(y), 8); page.texte(v, X(COLONNE.x + COLONNE.l - 5), Y(y), 8, { aligne: 'droite', gras: true }); y += 5 };
  page.texte('TOITURE', X(COLONNE.x + 5), Y(y), 9, { gras: true, couleur: '#2C4A5E' }); y += 8;
  for (const { roof } of T.filter((x, i) => T.findIndex(z => z.roof.id === x.roof.id) === i)) {
    ligne('Type', TOITURES_FR[roof.kind] ?? roof.kind);
    if (roof.kind !== 'flat') ligne('Pente', roof.pitch + '° (' + Math.round(Math.tan(roof.pitch * Math.PI / 180) * 100) + ' %)');
    ligne('Couverture', COUVERTURES_FR[roof.covering] ?? roof.covering);
    ligne('Débord', (roof.overhang / 1000).toFixed(2).replace('.', ',') + ' m');
  }
  ligne('Égout (le plus bas)', m(Math.min(...t0.map(x => x.egoutZ))));
  ligne('Faîtage (le plus haut)', m(Math.max(...t0.map(x => x.faitage))));
  ligne('Surface de couverture', m2(t0.reduce((s, x) => s + x.surfaceCouverture, 0)));
  const FT = T.filter((x, i) => T.findIndex(z => z.f.id === x.f.id) === i).flatMap(x => fenetresDeToit(x.f));
  if (FT.length) ligne('Fenêtres de toit', FT.length + ' (' + [...new Set(FT.map(x => x.o.width / 10 + ' × ' + x.o.height / 10))].join(', ') + ' cm)');
  y += 3;
  for (const l of ['Flèches : sens de la pente, vers l’égout. Murs porteurs', 'en tirets fins ; pignons en trait fort. Charpente,', 'gouttières et descentes : à préciser au projet.'])
    { page.texte(l, X(COLONNE.x + 5), Y(y), 6.5, { couleur: '#6E7B84' }); y += 3.6 }
  cartouche(page, projet, o.dossier ? 'PCMI 5 — Plan de toiture' : 'Plan de toiture', ech, o);
}

/* ---------- la planche de la coupe ---------- */

/** ce que la coupe tranche, plein (poché) ; les remplissages des baies restent clairs */
const POCHES: Partial<Record<Matiere, string>> = { vitrage: '#9FBFD3', porte: '#B89A7C', garage: '#B7BEC5' };
const POCHE = '#3B4A55';

function plancheCoupe(doc: DocumentPdf, projet: Project, o: OptionsPlanche, ligne: LigneDeCoupe | null): void {
  const page = doc.page(A3.l * PT, A3.h * PT);
  const X = (x: number) => x * PT, Y = (y: number) => (A3.h - y) * PT;
  page.cadre(X(10), Y(287), 400 * PT, 277 * PT, { ep: 0.8 });
  const titre = 'Coupe ' + (ligne?.nom ?? 'A') + '-' + (ligne?.nom ?? 'A');
  page.texte(titre, X(ZONE.x + 4), Y(ZONE.y + 6), 11, { gras: true, couleur: '#2C4A5E' });
  const C = ligne ? coupe(maquette(projet), ligne) : null;
  const H = hauteurs(projet);
  /* le terrain naturel le long de la coupe, s'il est relevé (points cotés) et placé (altitude NGF du ±0,00) */
  const parc = parcelleDuProjet(projet)?.plot, ngf0 = parc?.groundFloorNgf;
  const ngf = (z: number) => (ngf0! + z / 1000).toFixed(2).replace('.', ',');
  const bornes = C?.boite ? { u0: C.boite.umin - 2_000, u1: C.boite.umax + 2_000 } : null;
  const enPlan = (u: number) => ({ x: ligne!.a.x + ligne!.regard.y * u, y: ligne!.a.y - ligne!.regard.x * u });       // u → point du plan (vueDeCoupe)
  const tn = ligne && bornes && parc ? profilTerrain(parc, enPlan(bornes.u0), enPlan(bornes.u1), 250)?.map(q => ({ u: bornes.u0 + q.s, z: q.z })) ?? null : null;
  /* la maison au droit de la coupe : là, le terrain fini rejoint la maison (pas de terrain dessiné sous elle) */
  const sousMaison = ligne && bornes ? empriseAuSol(projet).flatMap(q => segmentsDans(enPlan(bornes.u0), enPlan(bornes.u1), q))
    .map(([a, b]) => [Math.hypot(a.x - enPlan(bornes.u0).x, a.y - enPlan(bornes.u0).y) + bornes.u0, Math.hypot(b.x - enPlan(bornes.u0).x, b.y - enPlan(bornes.u0).y) + bornes.u0].sort((x, y) => x - y) as [number, number]) : [];
  /* les niveaux : chaque sol fini, puis l'égout (ou le haut des murs) et le faîtage */
  const sols = projet.buildings.flatMap(b => b.floors).sort((a, b) => a.elevation - b.elevation);
  const niv: [number, string][] = sols.map(f => [f.elevation, (f.elevation === 0 ? '±0,00' : m(f.elevation)) + ' sol ' + f.name + (f.elevation === 0 && ngf0 !== undefined ? ' (' + ngf(0) + ' NGF)' : '')]);
  if (H.egout !== null) niv.push([H.egout, m(H.egout) + ' égout']); else niv.push([H.hautMurs, m(H.hautMurs) + ' haut des murs']);
  if (H.faitage !== null) niv.push([H.faitage, m(H.faitage) + ' faîtage']);
  let ech = o.echelle ?? 100;
  if (C?.boite) {
    const B = C.boite, zt = tn?.map(q => q.z) ?? [0], larg = B.umax - B.umin + 4_000, haut = Math.max(B.zmax, ...zt, 0) - Math.min(B.zmin, ...zt, 0) + 1_000;
    /* à gauche, 40 mm pour les cotes de niveau ; à droite, 25 mm pour la chaîne des hauteurs */
    ech = o.echelle ?? (ECHELLES.find(e => larg / e + 65 <= ZONE.l && haut / e + 24 <= ZONE.h) ?? ECHELLES[ECHELLES.length - 1]!);
    const xc = ZONE.x + 40 + (ZONE.l - 65) / 2, uc = (B.umin + B.umax) / 2;
    const zh = Math.max(B.zmax, ...zt, 0), zb = Math.min(B.zmin, ...zt, 0), solY = ZONE.y + 12 + (ZONE.h - 12 + (zh - zb) / ech) / 2 - (-zb) / ech;
    const P = (u: number, z: number): [number, number] => [X(xc + (u - uc) / ech), Y(solY - z / ech)];
    const g0 = xc + (B.umin - 2_000 - uc) / ech, g1 = xc + (B.umax + 2_000 - uc) / ech;
    /* le terrain fini, hors de la maison : le terrain naturel s'il est relevé (supposé inchangé), sinon le ±0,00 ; hachuré dessous */
    const fini = tn ? tn.filter(q => !sousMaison.some(([a, b]) => q.u > a + 1 && q.u < b - 1)) : null;
    const morceaux: { u: number; z: number }[][] = [];
    if (fini) for (const q of fini) { const d = morceaux[morceaux.length - 1], prec = d?.[d.length - 1]; if (d && prec && q.u - prec.u < 300) d.push(q); else morceaux.push([q]) }
    else morceaux.push([{ u: B.umin - 2_000, z: 0 }, { u: B.umax + 2_000, z: 0 }]);
    for (const M of morceaux) for (let i = 0; i + 1 < M.length; i++) {
      const [a, b] = [P(M[i]!.u, M[i]!.z), P(M[i + 1]!.u, M[i + 1]!.z)], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 0; t < L; t += 3 * PT) { const x = a[0] + (b[0] - a[0]) * t / L, y = a[1] + (b[1] - a[1]) * t / L; page.trait(x, y, x + 2.2 * PT, y - 2.2 * PT, 0.25, '#6E7B84') }
    }
    for (const f of C.vues) page.polygone(f.points.map(q => P(q.u, q.z)), { fond: TEINTES[f.matiere] ?? '#FFFFFF', trait: '#1A2B36', ep: 0.25 });
    for (const c of C.coupees) page.polygone(c.points.map(q => P(q.u, q.z)), { fond: POCHES[c.matiere] ?? POCHE, trait: '#1A2B36', ep: 0.5 });
    for (const M of morceaux) for (let i = 0; i + 1 < M.length; i++) { const a = P(M[i]!.u, M[i]!.z), b = P(M[i + 1]!.u, M[i + 1]!.z); page.trait(a[0], a[1], b[0], b[1], 1.1) }
    if (!tn) page.trait(X(g0), Y(solY), X(g1), Y(solY), 1.1);
    /* le terrain naturel relevé : en tirets de part en part (sous la maison aussi), ses altitudes aux bouts et au droit des façades */
    if (tn) {
      for (let i = 0; i + 1 < tn.length; i++) if (i % 2 === 0) { const a = P(tn[i]!.u, tn[i]!.z), b = P(tn[i + 1]!.u, tn[i + 1]!.z); page.trait(a[0], a[1], b[0], b[1], 0.6, '#3F7A5A') }
      const zEn = (u: number) => { const k = tn.findIndex(q => q.u >= u); if (k <= 0) return tn[Math.max(0, k)]!.z; const a = tn[k - 1]!, b = tn[k]!; return a.z + (b.z - a.z) * (u - a.u) / ((b.u - a.u) || 1) };
      const repere = (u: number, t: string, gauche: boolean) => { const [x, y] = P(u, zEn(u)); page.texte(t, x + (gauche ? -1 : 1) * 1.5 * PT, y + 2.2 * PT, 6, { couleur: '#3F7A5A', ...(gauche ? { aligne: 'droite' as const } : {}) }) };
      repere(tn[0]!.u, 'TN ' + ngf(tn[0]!.z), false); repere(tn[tn.length - 1]!.u, 'TN ' + ngf(tn[tn.length - 1]!.z), true);
      for (const [a, b] of sousMaison) { repere(a, 'TN ' + ngf(zEn(a)), true); repere(b, 'TN ' + ngf(zEn(b)), false) }
    }
    /* les cotes de niveau, à gauche */
    /* à gauche du terrain dessiné (qui déborde de 2 m), pour ne pas chevaucher ses altitudes */
    const bord = g0 - 2, xr = Math.max(ZONE.x + 4, bord - 40);
    for (const [z, t] of niv) {
      const y = solY - z / ech;
      page.trait(X(xr), Y(y), X(bord), Y(y), 0.25, '#6E7B84');
      page.polygone([[X(xr), Y(y)], [X(xr + 1.6), Y(y - 2.2)], [X(xr - 1.6), Y(y - 2.2)]], { fond: '#1A2B36' });
      page.texte(t, X(xr + 2.5), Y(y - 1), 6.2);
    }
    /* la chaîne des hauteurs, à droite : d'un niveau au suivant */
    const Z = [...new Set(niv.map(([z]) => Math.round(z)))].sort((a, b) => a - b), xd = xc + (B.umax - uc) / ech + 8;
    if (Z.length > 1) {
      page.trait(X(xd), Y(solY - Z[0]! / ech), X(xd), Y(solY - Z[Z.length - 1]! / ech), 0.3);
      Z.forEach((z, i) => {
        const y = solY - z / ech;
        page.trait(X(xd - 1.5), Y(y + 1.5), X(xd + 1.5), Y(y - 1.5), 0.5);
        page.trait(X(xd - 3), Y(y), X(xd + 1.5), Y(y), 0.25, '#6E7B84');
        if (i) page.texte((Math.abs(z - Z[i - 1]!) / 1000).toFixed(2).replace('.', ','), X(xd + 2), Y((y + solY - Z[i - 1]! / ech) / 2 - 0.8), 6.5);
      });
    }
  } else page.texte('Rien à couper : aucun mur.', X(ZONE.x + 4), Y(ZONE.y + 16), 9, { couleur: '#6E7B84' });

  /* la colonne de droite : les hauteurs, le plan de repérage, puis le cartouche */
  page.trait(X(COLONNE.x), Y(10), X(COLONNE.x), Y(287), 0.6);
  let y = 20;
  page.texte('HAUTEURS', X(COLONNE.x + 5), Y(y), 9, { gras: true, couleur: '#2C4A5E' }); y += 8;
  for (const [z, t] of [...niv].sort((a, b) => a[0] - b[0])) {
    const [v, ...k] = t.split(' ');
    page.texte(k.join(' '), X(COLONNE.x + 5), Y(y), 8); page.texte(z === 0 ? '±0,00' : v!, X(COLONNE.x + COLONNE.l - 5), Y(y), 8, { aligne: 'droite', gras: true }); y += 5;
  }
  y += 6;
  if (ligne) { y = reperage(page, projet, ligne, y); y += 6 }
  const note = traitsDeCoupe(projet).length ? ['Trait de coupe tracé sur le plan ; le plan de coupe', 'le prolonge de part en part du bâtiment.']
    : ['Coupe placée d’elle-même : en travers de la maison,', 'par l’escalier s’il y en a un, jamais le long d’un mur.'];
  const terrain = tn ? ['Terrain naturel (tirets verts) : interpolé entre les ' + parc!.spotHeights!.length + ' points', 'cotés du relevé (altitudes NGF). Terrain fini supposé', 'égal au terrain naturel hors de la maison : déblais et', 'remblais [à compléter].']
    : parc?.spotHeights?.length ? ['Points cotés relevés, mais l’altitude NGF du ±0,00', 'n’est pas renseignée (parcelle) : terrain non placé.']
      : ['Terrain naturel non relevé : supposé au niveau du sol', 'fini (à reporter depuis le plan topographique, outil N).'];
  for (const t of [...note, ...terrain, 'Épaisseurs dessinées indicatives (planchers, couverture) :', 'charpente et isolation ne sont pas étudiées ici.'])
    { page.texte(t, X(COLONNE.x + 5), Y(y), 6.5, { couleur: '#6E7B84' }); y += 3.6 }
  cartouche(page, projet, o.dossier ? 'PCMI 3 — ' + titre : titre, ech, o);
}

/** le plan de repérage : la maçonnerie du niveau le plus bas, en petit, et le trait de coupe ; rend le y suivant */
function reperage(page: PagePdf, projet: Project, l: LigneDeCoupe, y0: number): number {
  const X = (x: number) => x * PT, Y = (y: number) => (A3.h - y) * PT;
  page.texte('PLAN DE REPÉRAGE', X(COLONNE.x + 5), Y(y0), 9, { gras: true, couleur: '#2C4A5E' });
  const f = [...projet.buildings.flatMap(b => b.floors)].sort((a, b) => a.elevation - b.elevation)[0];
  const M = f ? planDuNiveau(f).maconnerie : [];
  const Q = [...M.flatMap(p => p.contour), l.a, l.b];
  const xmin = Math.min(...Q.map(p => p.x)), xmax = Math.max(...Q.map(p => p.x)), ymin = Math.min(...Q.map(p => p.y)), ymax = Math.max(...Q.map(p => p.y));
  const L = COLONNE.l - 20, Hh = 55, k = Math.min(L / Math.max(1, xmax - xmin), Hh / Math.max(1, ymax - ymin));
  const ox = COLONNE.x + 10 + (L - (xmax - xmin) * k) / 2, oy = y0 + 6 + (Hh + (ymax - ymin) * k) / 2;        // le haut du plan en haut
  const P = (p: { x: number; y: number }): [number, number] => [X(ox + (p.x - xmin) * k), Y(oy - (p.y - ymin) * k)];
  for (const p of M) page.polygone(p.contour.map(P), { fond: '#3B4A55', trait: '#1A2B36', ep: 0.2 });
  const [ax, ay] = P(l.a), [bx, by] = P(l.b);
  page.trait(ax, ay, bx, by, 0.6, '#C5563A');
  for (const [x, y] of [[ax, ay], [bx, by]] as const) {
    const qx = x + l.regard.x * 4 * PT, qy = y + l.regard.y * 4 * PT;
    page.trait(x, y, qx, qy, 0.8, '#C5563A');
    page.texte(l.nom, qx + l.regard.x * 2.5 * PT, qy + l.regard.y * 2.5 * PT - 3, 8, { gras: true, couleur: '#C5563A', aligne: 'centre' });
  }
  return y0 + 6 + Hh + 6;
}

/** les planches A3 des niveaux demandés, en un PDF (une page par niveau) */
export function planchesPdf(projet: Project, o: OptionsPlanche): Uint8Array<ArrayBuffer> {
  const doc = new DocumentPdf();
  const F = projet.buildings.flatMap(b => b.floors).filter(f => o.niveaux.includes(f.id)).sort((a, b) => a.elevation - b.elevation);
  if (o.masse) plancheMasse(doc, projet, o);
  const lignes = o.coupe ? lignesDeCoupe(projet) : [];
  for (const f of F) planche(doc, projet, f, o, lignes);
  if (o.facades) plancheFacades(doc, projet, o);
  if (o.toiture) plancheToiture(doc, projet, o);
  if (o.coupe) { if (lignes.length) for (const l of lignes) plancheCoupe(doc, projet, o, l); else plancheCoupe(doc, projet, o, null) }
  if (!F.length && !o.facades && !o.coupe && !(o.masse && parcelleDuProjet(projet)) && !(o.toiture && toituresDuProjet(projet).length)) doc.page(A3.l * PT, A3.h * PT).texte('Aucun niveau choisi.', 40, 400, 12);
  return doc.octets((projet.name || 'Projet') + ' — plans');
}


/* ---------- la notice (PCMI 4), brouillon ---------- */

/** les lignes d'un paragraphe coupé à une largeur (points), en Helvetica de corps donné */
function couper(t: string, largeur: number, corps: number): string[] {
  const L: string[] = [];
  let l = '';
  for (const mot of t.split(' ')) {
    const essai = l ? l + ' ' + mot : mot;
    if (largeurTexte(essai) * corps / 1000 > largeur && l) { L.push(l); l = mot } else l = essai;
  }
  if (l) L.push(l);
  return L;
}

function pageNotice(doc: DocumentPdf, projet: Project, o: OptionsPlanche): void {
  const page = doc.page(A3.l * PT, A3.h * PT);
  const X = (x: number) => x * PT, Y = (y: number) => (A3.h - y) * PT;
  page.cadre(X(10), Y(287), 400 * PT, 277 * PT, { ep: 0.8 });
  page.texte('Notice descriptive', X(ZONE.x + 4), Y(ZONE.y + 6), 11, { gras: true, couleur: '#2C4A5E' });
  page.texte('Brouillon établi à partir du projet : à relire et compléter (« ' + A_COMPLETER + ' ») avant le dépôt.', X(ZONE.x + 4), Y(ZONE.y + 12), 8, { couleur: '#C5563A' });
  /* deux colonnes de texte dans la zone du dessin */
  const col = (ZONE.l - 12) / 2, corps = 9, pas = 4.8;
  let c = 0, y = ZONE.y + 24;
  for (const r of notice(projet)) {
    const lignes = r.paragraphes.map(p => couper(p, col * PT, corps));
    const h = 8 + lignes.reduce((s, L) => s + L.length * pas + 2, 0);
    if (y + h > ZONE.y + ZONE.h - 6 && c === 0) { c = 1; y = ZONE.y + 24 }
    const x = ZONE.x + 4 + c * (col + 8);
    page.texte(r.titre, X(x), Y(y), 10, { gras: true }); y += 7;
    for (const L of lignes) {
      for (const l of L) { page.texte(l, X(x), Y(y), corps, { couleur: l.includes(A_COMPLETER) ? '#8A3A26' : '#1A2B36' }); y += pas }
      y += 2;
    }
    y += 4;
  }
  page.trait(X(COLONNE.x), Y(10), X(COLONNE.x), Y(287), 0.6);
  for (const [i, l] of ['Rédigée par le Designer à partir de ce qui est', 'mesuré ou choisi dans le projet (reculs, emprise,', 'hauteurs, toiture, parements, menuiseries,', 'aménagements). Ce qu’il ne sait pas est écrit', '« ' + A_COMPLETER + ' ». La notice définitive se rédige', 'dans l’atelier.'].entries())
    page.texte(l, X(COLONNE.x + 5), Y(20 + i * 4), 7, { couleur: '#6E7B84' });
  cartouche(page, projet, o.dossier ? 'PCMI 4 — Notice (brouillon)' : 'Notice (brouillon)', 0, o);
}

/* ---------- les pages d'image : vue 3D, situation, insertion, photographies ---------- */

/** une image fournie au dossier (JPEG) : vue 3D gardée, extrait de carte, photomontage, photographie */
export interface ImageDossier { jpeg: Uint8Array; largeur: number; hauteur: number; /** ce qu'en dit l'utilisateur : source, échelle, point de vue… */ legende?: string }

/** une page A3 : l'image aussi grande que la zone le permet (sans la déformer), sa légende, et les notes à droite */
function pageImage(doc: DocumentPdf, projet: Project, o: OptionsPlanche, entete: string, titre: string, v: ImageDossier, notes: string[]): void {
  const page = doc.page(A3.l * PT, A3.h * PT), nom = doc.imageJpeg(v.jpeg, v.largeur, v.hauteur);
  const X = (x: number) => x * PT, Y = (y: number) => (A3.h - y) * PT;
  page.cadre(X(10), Y(287), 400 * PT, 277 * PT, { ep: 0.8 });
  page.texte(entete, X(ZONE.x + 4), Y(ZONE.y + 6), 11, { gras: true, couleur: '#2C4A5E' });
  const leg = v.legende?.trim();
  const L = ZONE.l - 8, H = ZONE.h - 16 - (leg ? 7 : 0), k = Math.min(L / v.largeur, H / v.hauteur), l = v.largeur * k, h = v.hauteur * k;
  const x0 = ZONE.x + 4 + (L - l) / 2, y0 = ZONE.y + 12 + (H - h) / 2;
  page.image(nom, X(x0), Y(y0 + h), l * PT, h * PT);
  page.cadre(X(x0), Y(y0 + h), l * PT, h * PT, { ep: 0.3, couleur: '#9AA5AD' });
  if (leg) page.texte(leg, X(x0), Y(y0 + h + 5), 8.5, { couleur: '#1A2B36' });
  page.trait(X(COLONNE.x), Y(10), X(COLONNE.x), Y(287), 0.6);
  let y = 20;
  /* « [à compléter] » en rouge, même coupé en fin de ligne */
  for (const n of notes) { for (const l2 of couper(n, (COLONNE.l - 10) * PT, 7)) { page.texte(l2, X(COLONNE.x + 5), Y(y), 7, { couleur: /\[à|compléter\]/.test(l2) ? '#C5563A' : '#6E7B84' }); y += 4 } y += 2 }
  cartouche(page, projet, titre, 0, o);
}

/* ---------- le dossier de permis de construire, en un PDF ---------- */

export interface OptionsDossier {
  indice: string; date: string; maitreOuvrage?: string; adresseTerrain?: string; echelle?: number;
  /** une vue 3D gardée dans le Designer, pour la page de perspective */
  perspective?: ImageDossier;
  /** PCMI 1 : l'extrait de carte fourni (Géoportail, cadastre…) ; sa légende dit la source et l'échelle */
  situation?: ImageDossier;
  /** PCMI 6 : le photomontage composé dans la 3D (maquette posée sur une photographie du terrain) */
  insertion?: ImageDossier;
  /** PCMI 7 et 8 : les photographies de l'environnement proche et lointain ; leur légende dit le point de vue */
  photoProche?: ImageDossier;
  photoLointaine?: ImageDossier;
}

/** les pièces du dossier, dans l'ordre du formulaire ; « page » : null quand le Designer ne la produit pas */
export interface PieceDossier { code: string; intitule: string; page: number | null; note?: string }

/**
 * Le dossier de permis (maison individuelle) en un seul PDF A3 : une page de garde avec le sommaire, puis
 * la situation (PCMI 1, si l'extrait de carte est fourni), le plan de masse (PCMI 2), les coupes (PCMI 3),
 * la notice (PCMI 4), les façades et la toiture (PCMI 5), l'insertion (PCMI 6, si le photomontage est
 * composé), les photographies (PCMI 7 et 8, si elles sont fournies) et les plans des niveaux ; chaque
 * planche numérotée « n / N ». Une pièce qui manque est listée « à joindre » : rien n'est inventé.
 */
export function dossierPc(projet: Project, d: OptionsDossier): { octets: Uint8Array<ArrayBuffer>; pieces: PieceDossier[] } {
  /* au-delà de 150 m² de surface de plancher, le dossier ne se produit pas au nom de CP Constructions (règle de l'atelier) */
  const S = surfacesReglementaires(projet);
  if (S.seuil.etat === 'bloquant') throw new Error(S.seuil.message);
  const doc = new DocumentPdf();
  const garde = doc.page(A3.l * PT, A3.h * PT);
  const niveaux = projet.buildings.flatMap(b => b.floors).sort((a, b) => a.elevation - b.elevation);
  const o: OptionsPlanche = { niveaux: niveaux.map(f => f.id), cotation: true, mobilier: false, indice: d.indice, date: d.date, dossier: true, coupe: true, ...(d.echelle ? { echelle: d.echelle } : {}) };
  const debut = () => doc.nombre + 1;
  const t = parcelleDuProjet(projet);
  const pSituation = d.situation ? debut() : null;
  if (d.situation) pageImage(doc, projet, o, 'Plan de situation du terrain', 'PCMI 1 — Plan de situation', d.situation, [
    'Extrait de carte fourni pour le dossier' + (d.situation.legende?.trim() ? ' : ' + d.situation.legende.trim() : ' (source et échelle : ' + A_COMPLETER + ')') + '.',
    'Le terrain doit y être repéré, avec l’échelle et la direction du nord : à vérifier sur l’extrait avant le dépôt.',
  ]);
  const pMasse = t ? debut() : null;
  if (t) plancheMasse(doc, projet, o);
  const lignes = lignesDeCoupe(projet), pCoupe = debut();
  if (lignes.length) for (const l of lignes) plancheCoupe(doc, projet, o, l); else plancheCoupe(doc, projet, o, null);
  const pNotice = debut();
  pageNotice(doc, projet, o);
  const pFacades = debut();
  plancheFacades(doc, projet, o);
  const aToit = toituresDuProjet(projet).length > 0, pToit = aToit ? debut() : null;
  if (aToit) plancheToiture(doc, projet, o);
  /* le point de prise de vue d'une photographie : reporté au plan de masse s'il y est tracé (outil I), sinon à reporter */
  const PV = pointsDeVue(projet);
  const priseDeVue = (code: string, v: ImageDossier) => PV.some(x => x.piece === code) && t
    ? 'Point et angle de prise de vue reportés sur le plan de masse (PCMI 2' + (pMasse ? ', page ' + pMasse : '') + ')' + (v.legende?.trim() ? ' : ' + v.legende.trim() : '') + '.'
    : 'Point et angle de prise de vue à reporter sur le plan de masse (PCMI 2)' + (v.legende?.trim() ? ' : ' + v.legende.trim() : ' : ' + A_COMPLETER) + '.';
  const pInsertion = d.insertion ? debut() : null;
  if (d.insertion) pageImage(doc, projet, o, 'Insertion du projet dans son environnement', 'PCMI 6 — Insertion', d.insertion, [
    'Photomontage : la maquette 3D du projet (calculée depuis le plan, avec ses matériaux et sa toiture) posée sur une photographie du terrain, cadrée à la main dans le Designer.',
    'La concordance du point de vue et de la focale avec la photographie est à vérifier à l’œil.',
    priseDeVue('PCMI 6', d.insertion),
  ]);
  const pVue = d.perspective ? debut() : null;
  if (d.perspective) pageImage(doc, projet, o, 'Vue 3D du projet', 'Vue 3D (complément au PCMI 6)', d.perspective, [
    'Vue 3D calculée depuis le plan (matériaux et toiture du projet).',
    pInsertion ? 'L’insertion dans le site (PCMI 6) est page ' + pInsertion + '.' : 'Pour le PCMI 6, le projet reste à insérer dans une photographie de son environnement (photomontage) : à joindre.',
  ]);
  const photo = (code: string, quoi: string, v: ImageDossier) => pageImage(doc, projet, o, 'Photographie de l’environnement ' + quoi, code + ' — Environnement ' + quoi, v, [
    'Photographie fournie pour le dossier.',
    priseDeVue(code, v),
  ]);
  const pProche = d.photoProche ? debut() : null;
  if (d.photoProche) photo('PCMI 7', 'proche', d.photoProche);
  const pLointaine = d.photoLointaine ? debut() : null;
  if (d.photoLointaine) photo('PCMI 8', 'lointain', d.photoLointaine);
  const pPlans = debut();
  for (const f of niveaux) planche(doc, projet, f, o, lignes);
  const noteVue = (code: string) => (PV.some(x => x.piece === code) && t ? 'point de vue reporté au PCMI 2' : 'point de vue à reporter au PCMI 2');
  const pieces: PieceDossier[] = [
    { code: 'PCMI 1', intitule: 'Plan de situation du terrain', page: pSituation, ...(pSituation ? { note: 'extrait de carte fourni : échelle et nord à vérifier' } : { note: 'à joindre (extrait de carte, échelle et nord)' }) },
    { code: 'PCMI 2', intitule: 'Plan de masse des constructions', page: pMasse, ...(t ? {} : { note: 'parcelle à tracer (outil L)' }) },
    { code: 'PCMI 3', intitule: 'Plan en coupe du terrain et de la construction', page: pCoupe },
    { code: 'PCMI 4', intitule: 'Notice décrivant le terrain et le projet', page: pNotice, note: 'brouillon à relire et compléter' },
    { code: 'PCMI 5', intitule: 'Plans des façades et des toitures', page: pFacades, ...(aToit ? { note: 'plan de toiture : page ' + pToit } : { note: 'toiture à définir (panneau 3D)' }) },
    { code: 'PCMI 6', intitule: 'Document graphique d’insertion', page: pInsertion,
      note: (pInsertion ? 'photomontage composé dans le Designer' : 'à joindre (photomontage)') + (pVue ? ' ; vue 3D du projet : page ' + pVue : '') },
    { code: 'PCMI 7', intitule: 'Photographie de l’environnement proche', page: pProche, note: pProche ? noteVue('PCMI 7') : 'à joindre' },
    { code: 'PCMI 8', intitule: 'Photographie de l’environnement lointain', page: pLointaine, note: pLointaine ? noteVue('PCMI 8') : 'à joindre' },
    { code: '—', intitule: 'Plans des niveaux (complément)', page: pPlans },
  ];
  pageDeGarde(garde, projet, d, pieces, t ? { terrain: surfaceTerrain(t.plot), emprise: aireEmprise(empriseAuSol(projet)), reference: t.plot.reference } : null, S);
  /* chaque page numérotée, en bas à droite de la feuille */
  const N = doc.nombre;
  for (let i = 0; i < N; i++) doc.pageNo(i).texte((i + 1) + ' / ' + N, (410 - 2) * PT, (A3.h - 291.5) * PT, 7.5, { aligne: 'droite', couleur: '#6E7B84' });
  return { octets: doc.octets((projet.name || 'Projet') + ' — dossier de permis de construire'), pieces };
}

function pageDeGarde(page: PagePdf, projet: Project, d: OptionsDossier, pieces: PieceDossier[], terrain: { terrain: number; emprise: number; reference?: string | undefined } | null, S: Surfaces): void {
  const X = (x: number) => x * PT, Y = (y: number) => (A3.h - y) * PT;
  page.cadre(X(10), Y(287), 400 * PT, 277 * PT, { ep: 0.8 });
  page.texte('CP CONSTRUCTIONS', X(30), Y(40), 16, { gras: true, couleur: '#C5563A' });
  page.texte('Maîtrise d’œuvre', X(30), Y(47), 9, { couleur: '#6E7B84' });
  page.texte('DEMANDE DE PERMIS DE CONSTRUIRE', X(30), Y(78), 22, { gras: true, couleur: '#2C4A5E' });
  page.texte('Maison individuelle et/ou ses annexes', X(30), Y(88), 12);
  page.texte(projet.name || 'Projet', X(30), Y(108), 16, { gras: true });
  const rangs: [string, string][] = [
    ['Maître d’ouvrage', d.maitreOuvrage?.trim() || '[à compléter]'],
    ['Adresse du terrain', d.adresseTerrain?.trim() || '[à compléter]'],
    ['Référence cadastrale', terrain?.reference || '[à compléter]'],
    ['Surface du terrain (tracée)', terrain ? m2(terrain.terrain) : '[parcelle à tracer]'],
    ['Emprise au sol (maçonnerie)', terrain ? m2(terrain.emprise) : '[à mesurer]'],
    ['Surface de plancher', m2(S.surfacePlancher)],
    ['Surface habitable', m2(S.habitable)],
    ['Phase · indice · date', projet.phase + ' · ' + (d.indice || 'A') + ' · ' + d.date],
  ];
  rangs.forEach(([k, v], i) => {
    const y = 124 + i * 8;
    page.texte(k, X(30), Y(y), 9.5, { couleur: '#6E7B84' });
    page.texte(v, X(95), Y(y), 9.5, { gras: !v.startsWith('['), couleur: v.startsWith('[') ? '#C5563A' : '#1A2B36' });
  });
  /* le sommaire, à droite */
  const x0 = 220;
  page.texte('PIÈCES DU DOSSIER', X(x0), Y(78), 11, { gras: true, couleur: '#2C4A5E' });
  page.trait(X(x0), Y(82), X(395), Y(82), 0.6);
  pieces.forEach((p, i) => {
    const y = 92 + i * 13;
    page.texte(p.code, X(x0), Y(y), 9.5, { gras: true });
    page.texte(p.intitule, X(x0 + 24), Y(y), 9.5);
    page.texte(p.page !== null ? 'page ' + p.page : '—', X(395), Y(y), 9.5, { aligne: 'droite', gras: p.page !== null });
    if (p.note) page.texte(p.note, X(x0 + 24), Y(y + 4.5), 7.5, { couleur: p.page === null ? '#C5563A' : '#6E7B84' });
    page.trait(X(x0), Y(y + 7.5), X(395), Y(y + 7.5), 0.2, '#DDD5C8');
  });
  /* les surfaces : leurs règles, et le seuil */
  const notes = ['Surface de plancher : ' + REFERENCES.surfacePlancher + ', au nu intérieur des façades, garage, trémies', 'et parties de moins de 1,80 m déduits. Surface habitable : ' + REFERENCES.surfaceHabitable + '.', S.seuil.message];
  notes.forEach((l, i) => page.texte(l, X(30), Y(190 + i * 4.5), 7, { couleur: S.seuil.etat === 'alerte' && i === 2 ? '#C5563A' : '#6E7B84' }));
  for (const [i, l] of ['Document de travail CP Constructions, établi par le Designer à partir du plan : cotes, altitudes NGF,', 'règles du PLU et pièces « à joindre » à vérifier et compléter avant le dépôt. Rien n’y est inventé : ce qui', 'n’est pas connu est écrit « [à compléter] ».'].entries())
    page.texte(l, X(30), Y(250 + i * 5), 8, { couleur: '#6E7B84' });
}
