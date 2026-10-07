/* La feuille A3 des dossiers du cabinet, commune à toutes les planches :
   le cadre, la colonne CP Constructions à droite (relevée au millimètre sur
   les dossiers de permis du cabinet : logo, titre sur fond gris, numéro de
   feuille, construction de, adresse du projet, zone sismique, dessiné par,
   RE 2020, format, échelle), le titre de la planche en bas à gauche,
   l'échelle graphique, le nord, les tableaux et les légendes encadrés.

   Repère : millimètres depuis le haut-gauche de la feuille (comme on la
   lit) ; la page PDF compte en points depuis le bas. */
import type { Project } from '../model/types';
import { PagePdf, type DocumentPdf, type StyleTexte } from './pdf';
import { parcelleDuProjet, surfaceTerrain } from '../building/terrain';

export const PT = 72 / 25.4;                       // points par millimètre
export const A3 = { l: 420, h: 297 } as const;      // à l'italienne, mm

/** le cadre de la feuille, et la colonne CP à sa droite */
export const CADRE = { x0: 5, y0: 5, x1: 415, y1: 292 } as const;
export const COLONNE_CP = { x0: 364.5, x1: 415 } as const;
/** la zone du dessin : tout le cadre à gauche de la colonne */
export const ZONE_DESSIN = { x: CADRE.x0, y: CADRE.y0, l: COLONNE_CP.x0 - CADRE.x0, h: CADRE.y1 - CADRE.y0 } as const;

export const X = (x: number) => x * PT;
export const Y = (y: number) => (A3.h - y) * PT;

/* les teintes des dossiers du cabinet */
export const ENCRE = '#1A1A1A', GRIS_TEXTE = '#5A5A5A', GRIS_ETIQUETTE = '#7F7F7F', GRIS_TITRE = '#C8C8C8', BRIQUE = '#8C2E1C', ROUGE_MANQUE = '#C5563A';
export const A_PRECISER = '[à préciser]';

/** le cabinet qui signe les planches */
export interface Cabinet {
  societe: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  siren?: string;
  tva?: string;
  /** « Dessiné par » */
  dessinateur?: string;
  /** les métiers, une ligne chacun (page de garde) */
  activites?: string;
  /** la mention de propriété des plans (page de garde) */
  mention?: string;
}
export const CABINET_PAR_DEFAUT: Cabinet = { societe: 'CP Constructions', activites: 'Construction\nRénovation\nExtension',
  mention: 'Ces plans sont la propriété exclusive de la société. Il est interdit de les communiquer ou d’en faire usage sans son autorisation (loi du 11/03/1992).' };

/** les lignes d'un texte coupé à une largeur (points) */
export function couper(t: string, largeur: number, corps: number, o: StyleTexte = {}): string[] {
  const L: string[] = [];
  for (const para of t.split('\n')) {
    let l = '';
    for (const mot of para.split(' ')) {
      const essai = l ? l + ' ' + mot : mot;
      if (PagePdf.largeur(essai, corps, o) > largeur && l) { L.push(l); l = mot } else l = essai;
    }
    if (l) L.push(l);
  }
  return L;
}

/** un texte posé en millimètres */
export function texte(page: PagePdf, t: string, x: number, y: number, corps: number, o: StyleTexte = {}): void {
  page.texte(t, X(x), Y(y), corps, o);
}

/** les informations de l'adresse du projet : l'adresse saisie, le cadastre (saisi, sinon la parcelle), la surface du terrain (m²) */
export interface LieuProjet { adresse: string[]; cadastre?: string; surface?: number }

/** ce que la colonne dit de la planche */
export interface InfosColonne {
  /** le titre, en capitales sur fond gris (« PLAN DU »), et sa seconde ligne (« rez-de-chaussée ») */
  titre: string;
  sous?: string;
  /** le numéro de feuille (« PCMI 2 », « Plan RDC ») */
  feuille: string;
  indice: string;
  date: string;
  /** l'échelle (1/n) ; 0 : sans objet */
  echelle: number;
  maitreOuvrage?: string | undefined;
  lieu: LieuProjet;
  zoneSismique?: string | undefined;
  cabinet: Cabinet;
  /** le logo posé dans le document (nom PDF) et ses proportions */
  logo?: { nom: string; largeur: number; hauteur: number } | undefined;
}

const surfaceM2 = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' m²';

/** les cases de la colonne, de haut en bas (mm), relevées sur les dossiers du cabinet */
const CASES = { logo: [5, 54], titre: [54, 74.5], feuille: [74.5, 95], construction: [95, 116], adresse: [116, 186], sismique: [186, 208],
  dessine: [208, 229], re2020: [229, 250.5], format: [250.5, 271], echelle: [271, 292] } as const;

/** le sigle RE 2020, écrit (aucun logo officiel reproduit) : « RE » orange, « 2020 » vert, la mention dessous */
export function sigleRE2020(page: PagePdf, cx: number, yBase: number, corps: number): void {
  const st: StyleTexte = { gras: true, epais: corps * 0.035 }, l1 = PagePdf.largeur('RE', corps, st), e = corps * 0.22, l2 = PagePdf.largeur('2020', corps, st);
  const x0 = X(cx) - (l1 + e + l2) / 2;
  page.texte('RE', x0, Y(yBase), corps, { ...st, couleur: '#EB6E1F' });
  page.texte('2020', x0 + l1 + e, Y(yBase), corps, { ...st, couleur: '#2E9A47' });
  page.texte('RÉGLEMENTATION ENVIRONNEMENTALE', X(cx), Y(yBase + corps * 0.13), corps * 0.17, { aligne: 'centre', espacement: corps * 0.03, couleur: '#3A3A3A' });
}

/** le cadre de la feuille et la colonne CP Constructions */
export function cadreEtColonne(page: PagePdf, c: InfosColonne): void {
  page.cadre(X(CADRE.x0), Y(CADRE.y1), (CADRE.x1 - CADRE.x0) * PT, (CADRE.y1 - CADRE.y0) * PT, { ep: 1, couleur: ENCRE });
  const x0 = COLONNE_CP.x0, x1 = COLONNE_CP.x1, cx = (x0 + x1) / 2, w = (x1 - x0 - 4) * PT;
  page.trait(X(x0), Y(CADRE.y0), X(x0), Y(CADRE.y1), 1, ENCRE);
  for (const [, [, b]] of Object.entries(CASES)) if (b < CADRE.y1) page.trait(X(x0), Y(b), X(x1), Y(b), 1, ENCRE);
  const centre = (t: string, y: number, corps: number, o: StyleTexte = {}) => page.texte(t, X(cx), Y(y), corps, { couleur: ENCRE, ...o, aligne: 'centre' });
  const etiquette = (t: string, y: number) => centre(t, y, 8.5, { italique: true, souligne: true, couleur: GRIS_ETIQUETTE });
  /* un texte centré, coupé à la largeur de la case ; rend l'ordonnée de la ligne suivante */
  const bloc = (t: string, y: number, corps: number, o: StyleTexte = {}, pas = corps * 0.42 + 1.4) => {
    for (const l of couper(t, w, corps, o)) { centre(l, y, corps, o); y += pas }
    return y;
  };
  const manque = { couleur: ROUGE_MANQUE };
  /* le logo */
  {
    const [a, b] = CASES.logo;
    if (c.logo) {
      const k = Math.min((x1 - x0 - 6) / c.logo.largeur, (b - a - 8) / c.logo.hauteur), l = c.logo.largeur * k, h = c.logo.hauteur * k;
      page.image(c.logo.nom, X(cx - l / 2), Y((a + b) / 2 + h / 2), l * PT, h * PT);
    } else {
      centre(c.cabinet.societe.toUpperCase(), (a + b) / 2, 11, { gras: true, couleur: BRIQUE });
      centre('MAÎTRISE D’ŒUVRE', (a + b) / 2 + 5, 6, { couleur: '#D59A3F', espacement: 1.2 });
    }
  }
  /* le titre, en Times gras sur fond gris */
  {
    const [a, b] = CASES.titre;
    page.cadre(X(x0), Y(b), (x1 - x0) * PT, (b - a) * PT, { ep: 0, fond: GRIS_TITRE });
    page.trait(X(x0), Y(a), X(x1), Y(a), 1, ENCRE); page.trait(X(x0), Y(b), X(x1), Y(b), 1, ENCRE);
    const L = couper(c.titre.toUpperCase(), w, 12, { police: 'serif', gras: true });
    const h = L.length * 5 + (c.sous ? 5.5 : 0);
    let y = (a + b) / 2 - h / 2 + 4.2;
    for (const l of L) { centre(l, y, 12, { police: 'serif', gras: true }); y += 5 }
    if (c.sous) centre(c.sous, y + 1.2, 8, { police: 'serif', gras: true });
  }
  {
    const [a] = CASES.feuille;
    etiquette('Numéro de feuille :', a + 7.2);
    centre(c.feuille, a + 14, 13, { police: 'serif', gras: true });
    centre('indice ' + (c.indice || 'A') + ' du ' + c.date, a + 17.8, 6, { italique: true, couleur: GRIS_ETIQUETTE });
  }
  {
    const [a] = CASES.construction;
    etiquette('Construction de :', a + 7.5);
    bloc(c.maitreOuvrage?.trim() || A_PRECISER, a + 13, 9, c.maitreOuvrage?.trim() ? {} : manque);
  }
  {
    const [a] = CASES.adresse;
    etiquette('Adresse du projet :', a + 7.6);
    let y = a + 19.5;
    if (c.lieu.adresse.length) for (const l of c.lieu.adresse) y = bloc(l, y, 9, {}, 5.1); else y = bloc(A_PRECISER, y, 9, manque);
    y += 9.5;
    y = bloc(c.lieu.cadastre ?? A_PRECISER, y, 9, c.lieu.cadastre ? {} : manque);
    y += 5.2;
    bloc(c.lieu.surface ? surfaceM2(c.lieu.surface) : A_PRECISER, y, 9, c.lieu.surface ? {} : manque);
  }
  {
    const [a] = CASES.sismique;
    etiquette('Zone sismique :', a + 8);
    centre(c.zoneSismique?.trim() || A_PRECISER, a + 15.5, 9, c.zoneSismique?.trim() ? {} : manque);
  }
  {
    const [a] = CASES.dessine;
    etiquette('Dessiné par :', a + 7.5);
    centre(c.cabinet.dessinateur?.trim() || A_PRECISER, a + 17, 11.5, { police: 'serif', gras: true, ...(c.cabinet.dessinateur?.trim() ? {} : manque) });
  }
  sigleRE2020(page, cx, CASES.re2020[0] + 14.3, 31);
  /* « Format : A3 », « Échelle : 1/75 » : l'intitulé souligné, en Times gras */
  const champ = (k: string, v: string, y: number) => {
    const st: StyleTexte = { police: 'serif', gras: true, couleur: ENCRE }, lk = PagePdf.largeur(k + ' ', 10.5, st), lv = PagePdf.largeur(v, 10.5, st), x = X(cx) - (lk + lv) / 2;
    page.texte(k, x, Y(y), 10.5, { ...st, souligne: true });
    page.texte(v, x + lk, Y(y), 10.5, st);
  };
  champ('Format :', 'A3', CASES.format[0] + 11.6);
  champ('Échelle :', c.echelle ? '1/' + c.echelle : 'sans objet', CASES.echelle[0] + 12.2);
}

/** le titre d'une planche (« PLAN DU REZ-DE-CHAUSSÉE ») et sa ligne de lecture dessous */
export function titrePlanche(page: PagePdf, titre: string, sous: string, x = 10, y = 282, corps = 13): void {
  texte(page, titre, x, y, corps, { gras: true, couleur: '#222222' });
  if (sous) texte(page, sous, x, y + 4.3, 7, { couleur: GRIS_TEXTE });
}

/** le titre d'un dessin, un liseré brique à sa gauche (« COUPE A–A », « FAÇADE NORD ») */
export function titreDessin(page: PagePdf, titre: string, sous: string, x: number, y: number, corps = 10): void {
  page.cadre(X(x), Y(y + (sous ? 3.6 : 0.9)), 0.9 * PT, (corps * 0.42 + (sous ? 4.5 : 0.8)) * PT, { ep: 0, fond: BRIQUE });
  texte(page, titre, x + 2.4, y, corps, { gras: true, couleur: '#222222' });
  if (sous) texte(page, sous, x + 2.4, y + 3.6, 6.5, { couleur: GRIS_TEXTE });
}

/** l'échelle graphique : 0 à 5 m (ou plus, à petite échelle) en cases noires et blanches, « Échelle 1/n » dessous ; rend sa largeur (mm) */
export function echelleGraphique(page: PagePdf, ech: number, x0: number, y: number): number {
  const fin = ech <= 100 ? 5 : ech <= 250 ? 10 : ech <= 500 ? 25 : 50, pas = fin / 5;
  const l = fin * 1000 / ech;
  for (let i = 0; i < 5; i++) page.cadre(X(x0 + i * l / 5), Y(y + 1.4), (l / 5) * PT, 1.4 * PT, { ep: 0.35, couleur: ENCRE, fond: i % 2 ? '#FFFFFF' : ENCRE });
  for (let i = 0; i <= 5; i++) texte(page, String(Math.round(i * pas * 10) / 10), x0 + i * l / 5, y - 1, 6.5, { aligne: 'centre', couleur: ENCRE });
  texte(page, 'm', x0 + l + 3, y + 1.4, 6.5, { couleur: ENCRE });
  texte(page, 'Échelle 1/' + ech, x0, y + 6, 8, { gras: true, couleur: ENCRE });
  return l + 6;
}
export const largeurEchelle = (ech: number) => (ech <= 100 ? 5 : ech <= 250 ? 10 : ech <= 500 ? 25 : 50) * 1000 / ech + 6;

/** le nord : un cercle, une flèche pleine, « N » ; « angle » : la direction du nord sur le plan (radians, sens trigonométrique
    depuis le haut du plan, comme Plot.north) */
export function nordFleche(page: PagePdf, cx: number, cy: number, angle: number, r = 6): void {
  page.cercle(X(cx), Y(cy), r * PT, { trait: ENCRE, ep: 0.6, fond: '#FFFFFF' });
  const ux = -Math.sin(angle), uy = -Math.cos(angle), vx = -uy, vy = ux;      // vers le nord sur le papier (y vers le bas), et à sa droite
  const P = (u: number, v: number): [number, number] => [X(cx + ux * u + vx * v), Y(cy + uy * u + vy * v)];
  page.polygone([P(r * 0.85, 0), P(-r * 0.55, r * 0.42), P(-r * 0.2, 0)], { fond: ENCRE });
  page.polygone([P(r * 0.85, 0), P(-r * 0.55, -r * 0.42), P(-r * 0.2, 0)], { fond: '#FFFFFF', trait: ENCRE, ep: 0.4 });
  const [nx, ny] = P(r + 3, 0);
  page.texte('N', nx, ny - 3, 9, { gras: true, aligne: 'centre', couleur: ENCRE });
}

/** la direction (nord, nord-est, est…) vers laquelle regarde une normale du plan, le nord du plan étant « angle » */
export function orientation(n: { x: number; y: number }, angle: number): string {
  const N = { x: -Math.sin(angle), y: Math.cos(angle) }, E = { x: N.y, y: -N.x };
  const az = (Math.atan2(n.x * E.x + n.y * E.y, n.x * N.x + n.y * N.y) * 180 / Math.PI + 360) % 360;
  return ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'][Math.round(az / 45) % 8]!;
}

/** un encadré des dossiers : un liseré brique en haut, son titre ; rend l'ordonnée du contenu */
export function encadre(page: PagePdf, x: number, y: number, l: number, h: number, titre: string): number {
  page.cadre(X(x), Y(y + h), l * PT, h * PT, { ep: 0.4, couleur: '#9A9A9A', fond: '#FFFFFF' });
  page.cadre(X(x), Y(y + 1.2), l * PT, 1.2 * PT, { ep: 0, fond: BRIQUE });
  texte(page, titre, x + 4, y + 8.5, 10, { gras: true, couleur: '#222222' });
  return y + 14;
}

/** un tableau encadré : une ligne d'en-tête grisée, des lignes fines, une ligne de total grisée en gras ; rend sa hauteur (mm) */
export function tableau(page: PagePdf, x: number, y: number, colonnes: { titre: string; largeur: number; aligne?: 'gauche' | 'droite' | 'centre' }[], lignes: string[][],
  o: { total?: string[]; corps?: number; pas?: number; titre?: string; couleurs?: (string | undefined)[] } = {}): number {
  const corps = o.corps ?? 8, pas = o.pas ?? 5.2, L = colonnes.reduce((s, c) => s + c.largeur, 0);
  let yy = y;
  if (o.titre) { texte(page, o.titre, x, yy + 3.2, corps + 2, { gras: true, couleur: '#222222' }); yy += 6.5 }
  const debut = yy;
  const rang = (cells: string[], fond: string | null, gras: boolean, couleur = '#222222') => {
    if (fond) page.cadre(X(x), Y(yy + pas), L * PT, pas * PT, { ep: 0, fond });
    let cx = x;
    cells.forEach((t, i) => {
      const c = colonnes[i]!, al = c.aligne ?? 'gauche';
      const tx = al === 'droite' ? cx + c.largeur - 1.6 : al === 'centre' ? cx + c.largeur / 2 : cx + 1.6;
      texte(page, t, tx, yy + pas / 2 + corps * 0.13, corps, { gras, aligne: al, couleur });
      cx += c.largeur;
    });
    yy += pas;
  };
  rang(colonnes.map(c => c.titre), '#EDEDED', true);
  lignes.forEach((l, i) => { page.trait(X(x), Y(yy), X(x + L), Y(yy), 0.2, '#C8C8C8'); rang(l, null, false, o.couleurs?.[i]) });
  if (o.total) { page.trait(X(x), Y(yy), X(x + L), Y(yy), 0.4, ENCRE); rang(o.total, '#EDEDED', true) }
  page.cadre(X(x), Y(yy), L * PT, (yy - debut) * PT, { ep: 0.6, couleur: ENCRE });
  return yy - y;
}
export const hauteurTableau = (n: number, o: { total?: boolean; pas?: number; titre?: boolean } = {}) => (o.titre ? 6.5 : 0) + (n + 1 + (o.total ? 1 : 0)) * (o.pas ?? 5.2);

/** une légende : un titre, puis une pastille dessinée et son texte par ligne ; rend sa hauteur (mm) */
export interface LigneLegende { pastille: (page: PagePdf, x: number, y: number) => void; texte: string; sous?: string }
export function legende(page: PagePdf, x: number, y: number, titre: string, L: LigneLegende[], corps = 7.5, pas = 4.4, colonnes = 1): number {
  texte(page, titre, x, y + 3, corps + 1.5, { gras: true, couleur: '#222222' });
  const parCol = Math.ceil(L.length / colonnes), C = Array.from({ length: colonnes }, (_, k) => L.slice(k * parCol, (k + 1) * parCol));
  let xx = x, hmax = 0;
  for (const c of C) {
    let yy = y + 8;
    for (const l of c) {
      l.pastille(page, xx, yy - 2.6);
      texte(page, l.texte, xx + 9.5, yy, corps, { couleur: '#222222' });
      if (l.sous) { texte(page, l.sous, xx + 9.5, yy + 3.2, corps - 1.5, { couleur: GRIS_TEXTE }); yy += 3.2 }
      yy += pas;
    }
    hmax = Math.max(hmax, yy - y - pas + 2);
    xx += largeurLegende('', c, corps) + 6;
  }
  return hmax;
}
/** la place d'une légende (mm) sur « colonnes » colonnes */
export function tailleLegende(titre: string, L: LigneLegende[], colonnes = 1, corps = 7.5, pas = 4.4): { l: number; h: number } {
  const parCol = Math.ceil(L.length / colonnes), C = Array.from({ length: colonnes }, (_, k) => L.slice(k * parCol, (k + 1) * parCol)).filter(c => c.length);
  const l = Math.max(PagePdf.largeur(titre, corps + 1.5, { gras: true }) / PT, C.reduce((s, c) => s + largeurLegende('', c, corps), 0) + 6 * (C.length - 1));
  return { l, h: Math.max(...C.map(c => hauteurLegende(c, pas))) };
}
export const hauteurLegende = (L: LigneLegende[], pas = 4.4) => 8 + L.length * pas + L.filter(l => l.sous).length * 3.2 - pas + 2;
export const largeurLegende = (titre: string, L: LigneLegende[], corps = 7.5) =>
  Math.max(titre ? PagePdf.largeur(titre, corps + 1.5, { gras: true }) / PT : 0, ...L.map(l => 9.5 + Math.max(PagePdf.largeur(l.texte, corps) / PT, l.sous ? PagePdf.largeur(l.sous, corps - 1.5) / PT : 0)));

/** une pastille de légende : un rectangle de 7 × 3 mm, rempli (et hachuré si l'on veut) */
export function pastille(fond: string, o: { trait?: string; hachures?: string; tirets?: boolean; zigzag?: string } = {}) {
  return (page: PagePdf, x: number, y: number) => {
    const P: [number, number][] = [[X(x), Y(y)], [X(x + 7), Y(y)], [X(x + 7), Y(y + 3)], [X(x), Y(y + 3)]];
    page.polygone(P, { fond, ...(o.tirets ? {} : { trait: o.trait ?? ENCRE, ep: 0.35 }) });
    if (o.hachures) { page.decouper(P); for (let t = -3; t < 7; t += 0.9) page.trait(X(x + t), Y(y + 3), X(x + t + 3), Y(y), 0.25, o.hachures); page.restaurer() }
    if (o.zigzag) { const Z: [number, number][] = []; for (let t = 0, k = 0; t <= 7.01; t += 0.7, k++) Z.push([X(x + t), Y(y + (k % 2 ? 0.4 : 2.6))]); page.ligne(Z, 0.25, o.zigzag) }
    if (o.tirets) { page.polygone(P, { trait: GRIS_TEXTE, ep: 0.3, tirets: [1.5, 1] }); page.trait(X(x), Y(y), X(x + 7), Y(y + 3), 0.25, GRIS_TEXTE, [1.5, 1]); page.trait(X(x), Y(y + 3), X(x + 7), Y(y), 0.25, GRIS_TEXTE, [1.5, 1]) }
  };
}
/** une pastille de trait : un trait horizontal de 7 mm */
export function pastilleTrait(couleur: string, ep = 0.6, tirets: number[] = []) {
  return (page: PagePdf, x: number, y: number) => page.trait(X(x), Y(y + 1.5), X(x + 7), Y(y + 1.5), ep, couleur, tirets);
}

/* ---------- la place des encadrés ---------- */

/** ce qui est déjà dessiné dans la zone, sur une grille de 2 mm : on y cherche une place libre pour un tableau, une légende, le nord */
export class Occupation {
  private readonly pas = 2;
  private readonly n: number; private readonly m: number;
  private readonly cases: Uint8Array;
  constructor(readonly zone: { x: number; y: number; l: number; h: number }) {
    this.n = Math.ceil(zone.l / this.pas); this.m = Math.ceil(zone.h / this.pas);
    this.cases = new Uint8Array(this.n * this.m);
  }
  /** un rectangle (mm), élargi de « marge » */
  rectangle(x0: number, y0: number, x1: number, y1: number, marge = 0): void {
    const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - marge - this.zone.x) / this.pas)), i1 = Math.min(this.n - 1, Math.floor((Math.max(x0, x1) + marge - this.zone.x) / this.pas));
    const j0 = Math.max(0, Math.floor((Math.min(y0, y1) - marge - this.zone.y) / this.pas)), j1 = Math.min(this.m - 1, Math.floor((Math.max(y0, y1) + marge - this.zone.y) / this.pas));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.cases[j * this.n + i] = 1;
  }
  /** un polygone (mm), élargi de « marge » (les cases dont le centre est dedans, ou à moins de « marge » d'un bord) */
  polygone(P: [number, number][], marge = 0): void {
    if (P.length < 3) return;
    const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - marge - this.zone.x) / this.pas)), i1 = Math.min(this.n - 1, Math.ceil((Math.max(...xs) + marge - this.zone.x) / this.pas));
    const j0 = Math.max(0, Math.floor((Math.min(...ys) - marge - this.zone.y) / this.pas)), j1 = Math.min(this.m - 1, Math.ceil((Math.max(...ys) + marge - this.zone.y) / this.pas));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = this.zone.x + (i + 0.5) * this.pas, py = this.zone.y + (j + 0.5) * this.pas;
      if (dedans(px, py, P) || (marge > 0 && distanceAuBord(px, py, P) <= marge)) this.cases[j * this.n + i] = 1;
    }
  }
  /** un segment épais (mm) */
  segment(a: [number, number], b: [number, number], demi: number): void {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / this.pas));
    for (let s = 0; s <= k; s++) { const x = a[0] + (b[0] - a[0]) * s / k, y = a[1] + (b[1] - a[1]) * s / k; this.rectangle(x, y, x, y, demi) }
  }
  /** le rectangle (x, y, l, h) est-il libre ? */
  libre(x: number, y: number, l: number, h: number): boolean {
    if (x < this.zone.x || y < this.zone.y || x + l > this.zone.x + this.zone.l || y + h > this.zone.y + this.zone.h) return false;
    const i0 = Math.floor((x - this.zone.x) / this.pas), i1 = Math.ceil((x + l - this.zone.x) / this.pas) - 1;
    const j0 = Math.floor((y - this.zone.y) / this.pas), j1 = Math.ceil((y + h - this.zone.y) / this.pas) - 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (this.cases[j * this.n + i]) return false;
    return true;
  }
  /** la place libre (coin haut-gauche) la plus proche d'un des points d'ancrage, dans l'ordre de préférence
      (un ancrage est le point où l'on aimerait le coin donné : « hg » haut-gauche, « bd » bas-droit…) ; null : nulle part */
  placer(l: number, h: number, ancrages: { x: number; y: number; coin: 'hg' | 'hd' | 'bg' | 'bd' }[], rayon = Infinity): { x: number; y: number } | null {
    for (const a of ancrages) {
      let best: { x: number; y: number } | null = null, d = rayon;
      for (let y = this.zone.y; y + h <= this.zone.y + this.zone.h; y += this.pas) for (let x = this.zone.x; x + l <= this.zone.x + this.zone.l; x += this.pas) {
        const cx = a.coin === 'hg' || a.coin === 'bg' ? x : x + l, cy = a.coin === 'hg' || a.coin === 'hd' ? y : y + h;
        const e = Math.hypot(cx - a.x, cy - a.y);
        if (e < d && this.libre(x, y, l, h)) { d = e; best = { x, y } }
      }
      if (best) return best;
    }
    return null;
  }
}

function dedans(x: number, y: number, P: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i]!, [xj, yj] = P[j]!;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distanceAuBord(x: number, y: number, P: [number, number][]): number {
  let d = Infinity;
  for (let i = 0; i < P.length; i++) {
    const [ax, ay] = P[i]!, [bx, by] = P[(i + 1) % P.length]!, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
    d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return d;
}

/** la colonne d'un projet : les informations communes à toutes ses planches */
export function lieuDuProjetDe(projet: Project, parcelle: { reference?: string | undefined; surface?: number | undefined } | null): LieuProjet {
  const D = projet.dossier ?? {};
  const cadastre = D.referencesCadastrales?.trim() || parcelle?.reference?.trim();
  const surface = D.surfaceTerrain ?? parcelle?.surface;
  return { adresse: (D.lieuConstruction ?? '').split('\n').map(l => l.trim()).filter(Boolean), ...(cadastre ? { cadastre } : {}), ...(surface ? { surface } : {}) };
}

/** une image fournie au dossier (JPEG) : vue 3D gardée, extrait de carte, photomontage, photographie, logo */
export interface ImageDossier { jpeg: Uint8Array; largeur: number; hauteur: number; /** ce qu'en dit l'utilisateur : source, échelle, point de vue… */ legende?: string }

/** ce qui signe une planche : l'indice, la date, le cabinet et son logo */
export interface Signature {
  indice: string; date: string;
  cabinet?: Cabinet | undefined;
  logo?: ImageDossier | undefined;
  /** le nom du logo une fois posé dans le document (interne) */
  logoNom?: string | undefined;
  /** le maître d'ouvrage dit à l'export (sinon celui des informations du dossier) */
  maitreOuvrage?: string | undefined;
}

/** le logo du cabinet, posé une fois dans le document */
export function avecLogo<T extends Signature>(doc: DocumentPdf, o: T): T {
  return o.logo && !o.logoNom ? { ...o, logoNom: doc.imageJpeg(o.logo.jpeg, o.logo.largeur, o.logo.hauteur) } : o;
}

/** le cadre et la colonne CP d'une planche du projet */
export function colonne(page: PagePdf, projet: Project, s: Signature, titre: string, sous: string | undefined, feuille: string, echelle: number): void {
  const t = parcelleDuProjet(projet), D = projet.dossier ?? {};
  cadreEtColonne(page, {
    titre, ...(sous ? { sous } : {}), feuille, indice: s.indice, date: s.date, echelle,
    maitreOuvrage: s.maitreOuvrage?.trim() || D.maitreOuvrage, zoneSismique: D.zoneSismique,
    lieu: lieuDuProjetDe(projet, t ? { reference: t.plot.reference, surface: surfaceTerrain(t.plot) / 1e6 } : null),
    cabinet: s.cabinet ?? CABINET_PAR_DEFAUT,
    logo: s.logoNom && s.logo ? { nom: s.logoNom, largeur: s.logo.largeur, hauteur: s.logo.hauteur } : undefined,
  });
}

/** une nouvelle feuille A3 */
export const nouvelleFeuille = (doc: DocumentPdf) => doc.page(A3.l * PT, A3.h * PT);

/** un nombre en mètres, à la française : 2,15 */
export const metres = (mm: number, d = 2) => (mm / 1000).toFixed(d).replace('.', ',');
/** une altitude relative : +2,82, −0,20, ±0,00 */
export const niveauRelatif = (mm: number) => (Math.abs(mm) < 5 ? '±0,00' : (mm > 0 ? '+' : '−') + metres(Math.abs(mm)));
/** une surface en m² : 12,91 m² */
export const enM2 = (mm2: number) => (mm2 / 1e6).toFixed(2).replace('.', ',') + ' m²';
