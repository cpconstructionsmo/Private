/* La planche A3 d'un niveau : le plan coté à une échelle normalisée, un
   cartouche CP Constructions, le tableau des surfaces et une échelle
   graphique. Le plan est dessiné par le même code qu'à l'écran (ui/dessin.ts)
   sur une toile PDF : vectoriel, net à toutes les tailles d'impression.

   Repère de la mise en page : millimètres depuis le haut-gauche de la
   feuille (comme on la lit) ; la page PDF est en points depuis le bas. */
import type { Floor, Project } from '../model/types';
import { planDuNiveau, cotationExterieure, toitureDuNiveau, emprise, mursDroits, geometrieEscalier, hauteurAFranchir, tremiesDuNiveau } from '../building';
import { dessiner, dessinerAmenagement, dessinerParcelle, nord, type Scene } from '../ui/dessin';
import { GENRES_AMENAGEMENT, finitionAmenagement } from '../catalogue/amenagements';
import { parcelleDuProjet, empriseAuSol, aireEmprise, surfaceTerrain, reculs, maisonDansParcelle, bilanAmenagements } from '../building/terrain';
import { versEcran, type Camera } from '../ui/camera';
import { DocumentPdf, type PagePdf } from './pdf';
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
  /** ajouter le plan de masse (PCMI 2), s'il y a une parcelle */
  masse?: boolean;
  /** ajouter les coupes (les traits tracés, sinon une coupe A-A placée d'elle-même) et leurs traits sur les plans */
  coupe?: boolean;
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
      tremies: tremiesDuNiveau(projet, f), coupes: traits,
      ...(o.cotation ? { cotation: cotationExterieure(niveau, ECART_COTES * ech) } : {}), ...(t?.ok ? { toitures: t.toitures } : {}),
    };
    dessiner(toile as unknown as CanvasRenderingContext2D, cam, scene);
  } else page.texte('Niveau vide : aucun mur à dessiner.', X(ZONE.x + 10), Y(ZONE.y + 20), 11, { couleur: '#6E7B84' });

  echelleGraphique(page, ech);

  /* la colonne de droite : les surfaces, puis le cartouche */
  page.trait(X(COLONNE.x), Y(10), X(COLONNE.x), Y(287), 0.6);
  const zones = planDuNiveau(niveau).zones;
  let y = 20;
  page.texte('SURFACES', X(COLONNE.x + 5), Y(y), 9, { gras: true, couleur: '#2C4A5E' });
  page.texte('intérieures brutes, entre murs', X(COLONNE.x + 5), Y(y + 4.2), 6.5, { couleur: '#6E7B84' });
  y += 10;
  const lignes = zones.map(z => ({ nom: z.piece?.name ?? 'Espace à nommer', aire: z.aire })).sort((a, b) => b.aire - a.aire);
  const max = Math.floor((287 - CARTOUCHE_H - 20 - y) / 5);
  for (const l of lignes.slice(0, max)) {
    page.texte(l.nom, X(COLONNE.x + 5), Y(y), 8);
    page.texte(m2(l.aire), X(COLONNE.x + COLONNE.l - 5), Y(y), 8, { aligne: 'droite' });
    page.trait(X(COLONNE.x + 5), Y(y + 1.4), X(COLONNE.x + COLONNE.l - 5), Y(y + 1.4), 0.2, '#DDD5C8');
    y += 5;
  }
  if (lignes.length > max) { page.texte('… ' + (lignes.length - max) + ' autre(s)', X(COLONNE.x + 5), Y(y), 7, { couleur: '#6E7B84' }); y += 5 }
  if (lignes.length) {
    page.texte('Total (' + lignes.length + ')', X(COLONNE.x + 5), Y(y + 1), 8, { gras: true });
    page.texte(m2(lignes.reduce((s, l) => s + l.aire, 0)), X(COLONNE.x + COLONNE.l - 5), Y(y + 1), 8, { gras: true, aligne: 'droite' });
    page.texte('Ni surface habitable ni surface de plancher.', X(COLONNE.x + 5), Y(y + 6), 6.5, { couleur: '#6E7B84' });
  } else page.texte('Aucun espace clos.', X(COLONNE.x + 5), Y(y), 8, { couleur: '#6E7B84' });

  cartouche(page, projet, 'Plan : ' + f.name, ech, o);
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
  const rangs: [string, string][] = [['Échelle', '1/' + ech + ' (A3)'], ['Phase', projet.phase], ['Date', o.date], ['Indice', o.indice || 'A']];
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
  y += 3;
  for (const l of ['Reculs : du nu extérieur de la maçonnerie au point', 'le plus proche de chaque limite. Emprise au sol :', 'débords de toit exclus. Limite tracée : à confirmer', 'sur le plan de bornage ; règles du PLU à vérifier.'])
    { page.texte(l, X(COLONNE.x + 5), Y(y), 6.5, { couleur: '#6E7B84' }); y += 3.6 }
  cartouche(page, projet, o.dossier ? 'PCMI 2 — Plan de masse' : 'Plan de masse (PCMI 2)', ech, o);
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
  /* les niveaux : chaque sol fini, puis l'égout (ou le haut des murs) et le faîtage */
  const sols = projet.buildings.flatMap(b => b.floors).sort((a, b) => a.elevation - b.elevation);
  const niv: [number, string][] = sols.map(f => [f.elevation, (f.elevation === 0 ? '±0,00' : m(f.elevation)) + ' sol ' + f.name]);
  if (H.egout !== null) niv.push([H.egout, m(H.egout) + ' égout']); else niv.push([H.hautMurs, m(H.hautMurs) + ' haut des murs']);
  if (H.faitage !== null) niv.push([H.faitage, m(H.faitage) + ' faîtage']);
  let ech = o.echelle ?? 100;
  if (C?.boite) {
    const B = C.boite, larg = B.umax - B.umin + 4_000, haut = Math.max(B.zmax, 0) - Math.min(B.zmin, 0) + 1_000;
    /* à gauche, 40 mm pour les cotes de niveau ; à droite, 25 mm pour la chaîne des hauteurs */
    ech = o.echelle ?? (ECHELLES.find(e => larg / e + 65 <= ZONE.l && haut / e + 24 <= ZONE.h) ?? ECHELLES[ECHELLES.length - 1]!);
    const xc = ZONE.x + 40 + (ZONE.l - 65) / 2, uc = (B.umin + B.umax) / 2;
    const zh = Math.max(B.zmax, 0), zb = Math.min(B.zmin, 0), solY = ZONE.y + 12 + (ZONE.h - 12 + (zh - zb) / ech) / 2 - (-zb) / ech;
    const P = (u: number, z: number): [number, number] => [X(xc + (u - uc) / ech), Y(solY - z / ech)];
    /* le terrain : une ligne forte, hachurée dessous (le terrain naturel n'est pas relevé : supposé au sol fini) */
    const g0 = xc + (B.umin - 2_000 - uc) / ech, g1 = xc + (B.umax + 2_000 - uc) / ech;
    for (let x = g0; x < g1 - 2; x += 3) page.trait(X(x), Y(solY), X(x + 2.2), Y(solY + 2.2), 0.25, '#6E7B84');
    for (const f of C.vues) page.polygone(f.points.map(q => P(q.u, q.z)), { fond: TEINTES[f.matiere] ?? '#FFFFFF', trait: '#1A2B36', ep: 0.25 });
    for (const c of C.coupees) page.polygone(c.points.map(q => P(q.u, q.z)), { fond: POCHES[c.matiere] ?? POCHE, trait: '#1A2B36', ep: 0.5 });
    page.trait(X(g0), Y(solY), X(g1), Y(solY), 1.1);
    /* les cotes de niveau, à gauche */
    const bord = xc + (B.umin - uc) / ech - 2, xr = Math.max(ZONE.x + 4, bord - 40);
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
  for (const t of [...note, 'Terrain naturel non relevé : supposé au niveau du sol', 'fini (à reporter depuis le plan topographique).', 'Épaisseurs dessinées indicatives (planchers, couverture) :', 'charpente et isolation ne sont pas étudiées ici.'])
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
  if (o.coupe) { if (lignes.length) for (const l of lignes) plancheCoupe(doc, projet, o, l); else plancheCoupe(doc, projet, o, null) }
  if (!F.length && !o.facades && !o.coupe && !(o.masse && parcelleDuProjet(projet))) doc.page(A3.l * PT, A3.h * PT).texte('Aucun niveau choisi.', 40, 400, 12);
  return doc.octets((projet.name || 'Projet') + ' — plans');
}


/* ---------- le dossier de permis de construire, en un PDF ---------- */

export interface OptionsDossier { indice: string; date: string; maitreOuvrage?: string; adresseTerrain?: string; echelle?: number }

/** les pièces du dossier, dans l'ordre du formulaire ; « page » : null quand le Designer ne la produit pas */
export interface PieceDossier { code: string; intitule: string; page: number | null; note?: string }

/**
 * Le dossier de permis (maison individuelle) en un seul PDF A3 : une page de garde avec le sommaire, puis
 * le plan de masse (PCMI 2), les coupes (PCMI 3), les façades (PCMI 5) et les plans des niveaux ; chaque
 * planche numérotée « n / N ». Ce que le Designer ne produit pas (situation, notice, insertion, photos) est
 * listé « à joindre » : rien n'est inventé.
 */
export function dossierPc(projet: Project, d: OptionsDossier): { octets: Uint8Array<ArrayBuffer>; pieces: PieceDossier[] } {
  const doc = new DocumentPdf();
  const garde = doc.page(A3.l * PT, A3.h * PT);
  const niveaux = projet.buildings.flatMap(b => b.floors).sort((a, b) => a.elevation - b.elevation);
  const o: OptionsPlanche = { niveaux: niveaux.map(f => f.id), cotation: true, mobilier: false, indice: d.indice, date: d.date, dossier: true, coupe: true, ...(d.echelle ? { echelle: d.echelle } : {}) };
  const debut = () => doc.nombre + 1;
  const t = parcelleDuProjet(projet);
  const pMasse = t ? debut() : null;
  if (t) plancheMasse(doc, projet, o);
  const lignes = lignesDeCoupe(projet), pCoupe = debut();
  if (lignes.length) for (const l of lignes) plancheCoupe(doc, projet, o, l); else plancheCoupe(doc, projet, o, null);
  const pFacades = debut();
  plancheFacades(doc, projet, o);
  const pPlans = debut();
  for (const f of niveaux) planche(doc, projet, f, o, lignes);
  const pieces: PieceDossier[] = [
    { code: 'PCMI 1', intitule: 'Plan de situation du terrain', page: null, note: 'à joindre (extrait de carte, échelle et nord)' },
    { code: 'PCMI 2', intitule: 'Plan de masse des constructions', page: pMasse, ...(t ? {} : { note: 'parcelle à tracer (outil L)' }) },
    { code: 'PCMI 3', intitule: 'Plan en coupe du terrain et de la construction', page: pCoupe },
    { code: 'PCMI 4', intitule: 'Notice décrivant le terrain et le projet', page: null, note: 'à joindre (l’atelier la rédige)' },
    { code: 'PCMI 5', intitule: 'Plans des façades et des toitures', page: pFacades, note: 'plan de toiture à joindre' },
    { code: 'PCMI 6', intitule: 'Document graphique d’insertion', page: null, note: 'à joindre (photomontage)' },
    { code: 'PCMI 7-8', intitule: 'Photographies (environnement proche et lointain)', page: null, note: 'à joindre' },
    { code: '—', intitule: 'Plans des niveaux (complément)', page: pPlans },
  ];
  pageDeGarde(garde, projet, d, pieces, t ? { terrain: surfaceTerrain(t.plot), emprise: aireEmprise(empriseAuSol(projet)), reference: t.plot.reference } : null);
  /* chaque page numérotée, en bas à droite de la feuille */
  const N = doc.nombre;
  for (let i = 0; i < N; i++) doc.pageNo(i).texte((i + 1) + ' / ' + N, (410 - 2) * PT, (A3.h - 291.5) * PT, 7.5, { aligne: 'droite', couleur: '#6E7B84' });
  return { octets: doc.octets((projet.name || 'Projet') + ' — dossier de permis de construire'), pieces };
}

function pageDeGarde(page: PagePdf, projet: Project, d: OptionsDossier, pieces: PieceDossier[], terrain: { terrain: number; emprise: number; reference?: string | undefined } | null): void {
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
    ['Surface de plancher', '[à calculer]'],
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
  for (const [i, l] of ['Document de travail CP Constructions, établi par le Designer à partir du plan : cotes, altitudes NGF,', 'règles du PLU et pièces « à joindre » à vérifier et compléter avant le dépôt. Rien n’y est inventé : ce qui', 'n’est pas connu est écrit « [à compléter] ».'].entries())
    page.texte(l, X(30), Y(250 + i * 5), 8, { couleur: '#6E7B84' });
}
