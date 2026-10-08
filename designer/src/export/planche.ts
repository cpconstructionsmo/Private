/* Les planches A3 du Designer et le dossier de permis de construire, sur le
   modèle des dossiers du cabinet : chaque planche a son module (plan d'un
   niveau, façades, toiture, coupes, plan de masse ; feuille.ts pour le cadre
   et la colonne CP) ; ici, leur assemblage, la notice, les pages d'images et
   la page de garde. Vectoriel, sans bibliothèque PDF.

   Repère de la mise en page : millimètres depuis le haut-gauche de la
   feuille (comme on la lit) ; la page PDF est en points depuis le bas. */
import type { Floor, Project, Roof } from '../model/types';
import { emprise, fondationsDuProjet } from '../building';
import { nord } from '../ui/dessin';
import { parcelleDuProjet, empriseAuSol, aireEmprise, surfaceTerrain, pointsDeVue, champDeVue } from '../building/terrain';
import { surfacesReglementaires, type Surfaces } from '../building/surfaces';
import { DocumentPdf, largeurTexte, type PagePdf } from './pdf';
import { notice, A_COMPLETER } from './notice';
import { lignesDeCoupe, type LigneDeCoupe } from '../vue3d/coupe';
import { avecLogo, colonne, lieuDuProjetDe, titreDessin, texte, GRIS_TEXTE, type Signature, sigleRE2020, couper as couperF, CABINET_PAR_DEFAUT, mentionCabinet, type Cabinet, type ImageDossier } from './feuille';
import { plancheFacades } from './planche-facades';
import { plancheMasse } from './planche-masse';
import { plancheCoupes } from './planche-coupes';
import { plancheToiture, toituresDuProjet } from './planche-toiture';
import { plancheNiveau, ECHELLES, surfacesParPiece, surfaceVitree } from './planche-niveau';

export type { Cabinet, ImageDossier } from './feuille';
export { CABINET_PAR_DEFAUT } from './feuille';
export { boiteDessin, surfacesParPiece, surfaceVitree } from './planche-niveau';

export const PT = 72 / 25.4;                       // points par millimètre
export const A3 = { l: 420, h: 297 } as const;      // à l'italienne, mm


export interface OptionsPlanche extends Signature {
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
  /** ajouter le plan de fondations, s'il y a des fondations */
  fondations?: boolean;
  /** le cabinet (colonne CP, page de garde) : réglages de l'appareil, jamais dans le dépôt */
  cabinet?: Cabinet;
  /** le logo du cabinet (JPEG), en tête de la colonne ; absent : le nom de la société */
  logo?: ImageDossier;
  /** le nom du logo une fois posé dans le document (interne) */
  logoNom?: string;
}

/** la plus grande échelle normalisée à laquelle un dessin de l × h mm tient dans la zone, cotes comprises */
export function echelleNormalisee(l: number, h: number, cotation = true): number {
  /* la zone du dessin (à gauche de la colonne CP), moins le titre ; trois chaînes de cotes de chaque côté */
  const m = 2 * (cotation ? 33 : 6), L = 351.5, H = 266;
  return ECHELLES.find(e => l / e + m <= L && h / e + m <= H) ?? ECHELLES[ECHELLES.length - 1]!;
}

const m2 = (v: number) => (v / 1e6).toFixed(2).replace('.', ',') + ' m²';

/** la planche d'un niveau (voir planche-niveau.ts) */
function planche(doc: DocumentPdf, projet: Project, f: Floor, o: OptionsPlanche, traits: LigneDeCoupe[], fondations = false): void {
  plancheNiveau(doc, projet, f, o, traits, fondations);
}


const GRIS_ETIQ = '#737373', ROUGE_CP = '#8C2E1C';
const COUVERTURES_FR: Record<string, string> = { tile: 'tuiles', slate: 'ardoises', zinc: 'zinc', steel: 'bac acier', green: 'toiture végétalisée', gravel: 'toit-terrasse gravillonné' };

const lieuDuProjet = (projet: Project) => { const t = parcelleDuProjet(projet); return lieuDuProjetDe(projet, t ? { reference: t.plot.reference, surface: surfaceTerrain(t.plot) / 1e6 } : null) };
const surfaceM2 = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' m²';


/* ---------- la planche des façades ---------- */

/** les planches A3 des niveaux demandés, en un PDF (une page par niveau) */
export function planchesPdf(projet: Project, o0: OptionsPlanche): Uint8Array<ArrayBuffer> {
  const doc = new DocumentPdf(), o = avecLogo(doc, o0);
  const F = projet.buildings.flatMap(b => b.floors).filter(f => o.niveaux.includes(f.id)).sort((a, b) => a.elevation - b.elevation);
  if (o.masse) plancheMasse(doc, projet, o);
  const lignes = o.coupe ? lignesDeCoupe(projet) : [];
  for (const f of F) planche(doc, projet, f, o, lignes);
  const FD = o.fondations ? fondationsDuProjet(projet) : null;
  if (FD) planche(doc, projet, FD.niveau, { ...o, mobilier: false }, [], true);
  if (o.facades) plancheFacades(doc, projet, o);
  if (o.toiture) plancheToiture(doc, projet, o);
  if (o.coupe) plancheCoupes(doc, projet, o, lignes);
  if (!F.length && !FD && !o.facades && !o.coupe && !(o.masse && parcelleDuProjet(projet)) && !(o.toiture && toituresDuProjet(projet).length)) doc.page(A3.l * PT, A3.h * PT).texte('Aucun niveau choisi.', 40, 400, 12);
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
  const D = projet.dossier ?? {}, mo = o.maitreOuvrage?.trim() || D.maitreOuvrage?.trim();
  /* l'en-tête : le projet, son adresse, sa nature */
  const x0 = 12, x1 = 357, cx = (x0 + x1) / 2;
  page.texte('Projet de ' + (mo || A_COMPLETER), X(cx), Y(16), 13, { aligne: 'centre', souligne: true, couleur: mo ? '#111111' : '#C5563A' });
  const adr = (D.lieuConstruction ?? '').split('\n').map(l => l.trim()).filter(Boolean);
  adr.forEach((l, k) => page.texte(l, X(cx), Y(21.5 + k * 4.2), 8.5, { aligne: 'centre', couleur: '#111111' }));
  const yN = 21.5 + adr.length * 4.2 + 1.5;
  page.texte('CONSTRUCTION D’UNE MAISON INDIVIDUELLE', X(cx), Y(yN), 10, { italique: true, aligne: 'centre', couleur: '#111111' });
  page.texte('Brouillon établi par le Designer à partir du projet : à relire et compléter (« ' + A_COMPLETER + ' ») avant le dépôt.', X(cx), Y(yN + 3.6), 6, { italique: true, aligne: 'centre', couleur: '#C5563A' });
  /* deux colonnes ; le titre dans un encadré orangé en tête de la première */
  const col = (x1 - x0 - 10) / 2, corps = 8, pas = 3.9;
  const yT = yN + 9;
  page.cadre(X(x0), Y(yT + 8), col * PT, 8 * PT, { ep: 0, fond: '#E8B98A' });
  page.texte('Notice décrivant le terrain et présentant le projet', X(x0 + col / 2), Y(yT + 5.4), 10, { gras: true, aligne: 'centre', couleur: '#111111' });
  page.texte('(article R.431-8 du code de l’urbanisme, à vérifier sur Légifrance)', X(x0 + col / 2), Y(yT + 11.5), 6.5, { aligne: 'centre', couleur: '#333333' });
  let c = 0, y = yT + 18;
  const bas = 287;
  for (const r of notice(projet)) {
    const L = r.paragraphes.map(p => couper(p, (col - 4) * PT, corps));
    const h = 7 + L.reduce((s, l) => s + l.length * pas + 1.6, 0);
    if (y + Math.min(h, 30) > bas && c === 0) { c = 1; y = yT }
    const x = x0 + c * (col + 10);
    page.texte(r.titre.replace(/^\d+\.\s*/, ''), X(x), Y(y), 8.5, { gras: true, couleur: '#111111' }); y += 5.5;
    for (const l of L) {
      l.forEach((t, k) => {
        if (y > bas) return;
        /* un paragraphe qui commence par « Le terrain : » met son intitulé en gras */
        const m = k === 0 ? /^([^:]{2,40} :)(.*)$/.exec(t) : null;
        if (m) { page.texte(m[1]!, X(x), Y(y), corps, { gras: true, couleur: '#111111' }); page.texte(m[2]!, X(x) + largeurTexte(m[1]!, true) * corps / 1000, Y(y), corps, { couleur: t.includes(A_COMPLETER) ? '#8A3A26' : '#222222' }) }
        else page.texte(t, X(x), Y(y), corps, { couleur: t.includes(A_COMPLETER) ? '#8A3A26' : '#222222' });
        y += pas;
      });
      y += 1.6;
    }
    y += 3;
  }
  colonne(page, projet, o, 'Notice', 'descriptive', 'PCMI 4', 0);
}

/* ---------- les pages d'image : vue 3D, situation, insertion, photographies ---------- */


/** une page A3 : l'image aussi grande que la zone le permet (sans la déformer), sa légende, et les notes à droite */
function pageImage(doc: DocumentPdf, projet: Project, o: OptionsPlanche, entete: string, titre: string, v: ImageDossier, notes: string[]): void {
  const page = doc.page(A3.l * PT, A3.h * PT), nom = doc.imageJpeg(v.jpeg, v.largeur, v.hauteur);
  const X = (x: number) => x * PT, Y = (y: number) => (A3.h - y) * PT;
  const m = /^(PCMI \d(?: \/ \d)?) — (.*)$/.exec(titre), code = m ? m[1]! : '', intitule = (m ? m[2]! : titre).replace(/\s*\(.*\)\s*$/, '');
  /* l'image aussi grande que possible au-dessus de la bande des notes (sans la déformer) */
  const BANDE = 58, L = 345, H = 287 - 12 - BANDE - 14, k = Math.min(L / v.largeur, H / v.hauteur), l = v.largeur * k, h = v.hauteur * k;
  const x0 = 10 + (L - l) / 2, y0 = 10;
  page.image(nom, X(x0), Y(y0 + h), l * PT, h * PT);
  page.cadre(X(x0), Y(y0 + h), l * PT, h * PT, { ep: 0.5, couleur: '#222222' });
  /* sa légende : la pièce et l'intitulé, puis ce qu'en dit l'utilisateur (point de vue, source) */
  titreDessin(page, ((code ? code + ' — ' : '') + entete).toUpperCase(), '', x0, y0 + h + 6, 9);
  const leg = v.legende?.trim();
  if (leg) texte(page, leg, x0 + 2.4, y0 + h + 10, 7, { couleur: GRIS_TEXTE });
  /* la bande du bas : les notes, puis le repérage des prises de vue sur la parcelle */
  const yb = 287 - BANDE + 2;
  texte(page, intitule.toUpperCase(), 14, yb, 8.5, { gras: true, couleur: '#222222' });
  let y = yb + 5;
  for (const n of notes) { for (const l2 of couperF(n, 230 * PT, 7)) { texte(page, l2, 14, y, 7, { couleur: /\[à|compléter\]/.test(l2) ? '#C5563A' : GRIS_TEXTE }); y += 3.6 } y += 1.6 }
  reperagePrisesDeVue(page, projet, code, 270, yb - 4, 86, BANDE - 6);
  colonne(page, projet, o, intitule, code ? 'dans le dossier' : undefined, code || intitule, 0);
}

/** le repérage des prises de vue : la parcelle, la maison, les cônes des photographies (celui de la pièce en brique) */
function reperagePrisesDeVue(page: PagePdf, projet: Project, code: string, x: number, y: number, l: number, h: number): void {
  const t = parcelleDuProjet(projet), PV = pointsDeVue(projet);
  if (!t) return;
  const X = (v: number) => v * PT, Y = (v: number) => (A3.h - v) * PT;
  page.cadre(X(x), Y(y + h), l * PT, h * PT, { ep: 0.4, couleur: '#9A9A9A', fond: '#FFFFFF' });
  texte(page, 'Repérage des prises de vue', x + 3, y + 4.5, 7, { gras: true, couleur: '#222222' });
  const E = empriseAuSol(projet), Q = [...t.plot.contour, ...PV.flatMap(v => [v.a, champDeVue(v).gauche, champDeVue(v).droite])];
  const xmin = Math.min(...Q.map(p => p.x)), xmax = Math.max(...Q.map(p => p.x)), ymin = Math.min(...Q.map(p => p.y)), ymax = Math.max(...Q.map(p => p.y));
  const k = Math.min((l - 8) / Math.max(1, xmax - xmin), (h - 10) / Math.max(1, ymax - ymin));
  const ox = x + 4 + (l - 8 - (xmax - xmin) * k) / 2, oy = y + 7 + (h - 10 + (ymax - ymin) * k) / 2;
  const M = (p: { x: number; y: number }): [number, number] => [X(ox + (p.x - xmin) * k), Y(oy - (p.y - ymin) * k)];
  page.polygone(t.plot.contour.map(M), { fond: '#E3EBD3', trait: '#222222', ep: 0.5 });
  for (const q of E) page.polygone(q.contour.map(M), { fond: '#9EA4AA', trait: '#222222', ep: 0.3 });
  for (const v of PV) {
    const c = champDeVue(v), lui = v.piece === code || (code === 'PCMI 7 / 8' && v.piece !== 'PCMI 6');
    page.polygone([M(v.a), M(c.gauche), M(c.droite)], { fond: lui ? '#D9A08E' : '#C7CCD0', trait: lui ? '#8C2E1C' : '#6A6A6A', ep: 0.4 });
    const [px, py] = M(v.a);
    page.texte(v.piece.replace('PCMI ', ''), px, py - 8, 6, { gras: true, aligne: 'centre', couleur: lui ? '#8C2E1C' : '#555555' });
  }
}

/* ---------- le dossier de permis de construire, en un PDF ---------- */

export interface OptionsDossier {
  indice: string; date: string; maitreOuvrage?: string; adresseTerrain?: string; echelle?: number;
  cabinet?: Cabinet; logo?: ImageDossier;
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
  const o: OptionsPlanche = avecLogo(doc, { niveaux: niveaux.map(f => f.id), cotation: true, mobilier: false, indice: d.indice, date: d.date, dossier: true, coupe: true, ...(d.echelle ? { echelle: d.echelle } : {}),
    ...(d.cabinet ? { cabinet: d.cabinet } : {}), ...(d.logo ? { logo: d.logo } : {}), ...(d.maitreOuvrage?.trim() ? { maitreOuvrage: d.maitreOuvrage } : {}) });
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
  plancheCoupes(doc, projet, o, lignes);
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
  pageDeGarde(garde, projet, d, pieces, t ? { terrain: surfaceTerrain(t.plot), emprise: aireEmprise(empriseAuSol(projet)), reference: t.plot.reference } : null, S, o.logoNom);
  /* chaque page numérotée, en bas à droite de la feuille */
  const N = doc.nombre;
  for (let i = 0; i < N; i++) doc.pageNo(i).texte((i + 1) + ' / ' + N, (410 - 2) * PT, (A3.h - 291.5) * PT, 7.5, { aligne: 'droite', couleur: '#6E7B84' });
  return { octets: doc.octets((projet.name || 'Projet') + ' — dossier de permis de construire'), pieces };
}

/** la page de garde, sur le modèle des dossiers du cabinet : à gauche la société, le maître d'ouvrage, le titre, les choix
    techniques, l'historique des modifications, le lieu ; à droite le tableau des surfaces, le résumé du projet, les pièces */
function pageDeGarde(page: PagePdf, projet: Project, d: OptionsDossier, pieces: PieceDossier[], terrain: { terrain: number; emprise: number; reference?: string | undefined } | null, S: Surfaces, logoNom?: string): void {
  const X = (x: number) => x * PT, Y = (y: number) => (A3.h - y) * PT;
  const C = d.cabinet ?? CABINET_PAR_DEFAUT, D = projet.dossier ?? {}, AC = '[à compléter]', ROUGE = '#C5563A';
  const boite = (x: number, y: number, l: number, h: number, fond?: string) => page.cadre(X(x), Y(y + h), l * PT, h * PT, { ep: 1, couleur: '#111111', ...(fond ? { fond } : {}) });
  const couperTimes = (t: string, l: number, corps: number) => couperF(t, l, corps, { police: 'serif' });
  const t = (txt: string, x: number, y: number, corps: number, o: { gras?: boolean; couleur?: string; aligne?: 'gauche' | 'centre' | 'droite' } = {}) => page.texte(txt, X(x), Y(y), corps, o);
  const lignes = (v: string | undefined) => (v ?? '').split('\n').map(l => l.trim()).filter(Boolean);
  /* ---------- à gauche ---------- */
  const L0 = 10, L1 = 208, cx = (L0 + L1) / 2;
  /* la société : logo, métiers (bandeau), coordonnées */
  boite(L0, 10, L1 - L0, 37);
  if (logoNom && d.logo) {
    const k = Math.min(52 / d.logo.largeur, 31 / d.logo.hauteur);
    page.image(logoNom, X(L0 + 3 + (52 - d.logo.largeur * k) / 2), Y(13 + 31 - (31 - d.logo.hauteur * k) / 2), d.logo.largeur * k * PT, d.logo.hauteur * k * PT);
  } else { t(C.societe.toUpperCase(), L0 + 30, 28, 11, { gras: true, couleur: ROUGE_CP, aligne: 'centre' }); t('Maîtrise d’œuvre', L0 + 30, 33, 7, { couleur: GRIS_ETIQ, aligne: 'centre' }) }
  page.cadre(X(L0 + 58), Y(47), 46 * PT, 37 * PT, { ep: 0, fond: ROUGE_CP });
  let yb = 17;
  for (const l of lignes(C.activites)) { t(l.toUpperCase(), L0 + 81, yb, 7.5, { couleur: '#FFFFFF', aligne: 'centre' }); yb += 4.5 }
  if (C.telephone) { t(C.telephone, L0 + 81, yb + 4, 11, { gras: true, couleur: '#FFFFFF', aligne: 'centre' }); yb += 8 }
  if (C.email) t(C.email, L0 + 81, yb + 2, 6.5, { couleur: '#FFFFFF', aligne: 'centre' });
  const cs = (L0 + 104 + L1) / 2;
  t('Société ' + C.societe.toUpperCase(), cs, 18, 10.5, { gras: true, aligne: 'centre' });
  let ys = 23.5;
  for (const l of [...lignes(C.adresse), [C.telephone, C.email].filter(Boolean).join('  '), C.siren ? 'SIREN : ' + C.siren : '', C.tva ? 'n° de TVA : ' + C.tva : ''].filter(Boolean)) { t(l, cs, ys, 7, { aligne: 'centre' }); ys += 4.4 }
  /* le maître d'ouvrage */
  boite(L0, 49, L1 - L0, 46);
  t('MAÎTRE DE L’OUVRAGE :', cx, 60, 11, { gras: true, aligne: 'centre' });
  const mo = d.maitreOuvrage?.trim() || D.maitreOuvrage?.trim();
  t(mo || AC, cx, 72, mo ? 14 : 11, { gras: !!mo, aligne: 'centre', ...(mo ? {} : { couleur: ROUGE }) });
  lignes(D.adresseMaitreOuvrage).forEach((l, i) => t(l, cx, 79 + i * 5.5, 10.5, { aligne: 'centre' }));
  /* le titre */
  boite(L0, 97, L1 - L0, 52, '#BDBDBD');
  /* en Times, comme les dossiers du cabinet */
  page.texte('PLAN DE PERMIS DE CONSTRUIRE', X(cx), Y(118), 19, { police: 'serif', gras: true, aligne: 'centre', souligne: true, couleur: '#111111' });
  page.texte('PLANS - COUPES - FAÇADES', X(cx), Y(129), 11, { police: 'serif', aligne: 'centre', couleur: '#111111' });
  couperTimes(mentionCabinet(C), 170 * PT, 7.5).forEach((l, i) => page.texte(l, X(cx), Y(136 + i * 3.8), 7.5, { police: 'serif', aligne: 'centre', couleur: '#111111' }));
  /* couverture, chauffage, divers */
  boite(L0, 151, L1 - L0, 40);
  page.trait(X(L0 + 42), Y(151), X(L0 + 42), Y(191), 0.6);
  sigleRE2020(page, L0 + 21, 174, 24);
  /* le logo du cabinet, à droite des choix techniques */
  if (logoNom && d.logo) { const k = Math.min(34 / d.logo.largeur, 24 / d.logo.hauteur); page.image(logoNom, X(L1 - 40 + (34 - d.logo.largeur * k) / 2), Y(171 + d.logo.hauteur * k / 2), d.logo.largeur * k * PT, d.logo.hauteur * k * PT) }
  const toitParDefaut = projet.buildings.flatMap(b => b.floors).flatMap(f => Object.values(f.objects)).find((x): x is Roof => x.type === 'roof');
  const couverture = D.couverture?.trim() || (toitParDefaut ? (COUVERTURES_FR[toitParDefaut.covering] ?? '') + (toitParDefaut.kind !== 'flat' ? ', pente ' + toitParDefaut.pitch + '°' : '') : '');
  ([['COUVERTURE : ', couverture], ['CHAUFFAGE : ', D.chauffage?.trim() ?? ''], ['DIVERS : ', D.divers?.trim() ?? '']] as const).forEach(([k, v], i) => {
    const y = 162 + i * 10;
    t(k, L0 + 46, y, 9, { gras: true });
    const lk = largeurTexte(k, true) * 9 / 1000 / PT;
    t(v || (i < 2 ? AC : ''), L0 + 46 + lk, y, 9, { gras: true, ...(v || i === 2 ? {} : { couleur: ROUGE }) });
  });
  /* dates et modifications */
  boite(L0, 193, L1 - L0, 56);
  const M = D.modifications?.length ? D.modifications : [{ date: d.date, objet: 'PERMIS DE CONSTRUIRE — indice ' + (d.indice || 'A') }];
  const ty = 197, th = 8.6, tl = L0 + 5, tr = L1 - 5, tm = tl + 52;
  page.cadre(X(tl), Y(ty + th * 6), (tr - tl) * PT, th * 6 * PT, { ep: 0.6 });
  page.trait(X(tm), Y(ty), X(tm), Y(ty + th * 6), 0.6);
  for (let i = 1; i < 6; i++) page.trait(X(tl), Y(ty + th * i), X(tr), Y(ty + th * i), 0.5);
  t('DATES', (tl + tm) / 2, ty + 6, 9.5, { gras: true, aligne: 'centre' }); t('MODIFICATIONS', (tm + tr) / 2, ty + 6, 9.5, { gras: true, aligne: 'centre' });
  M.slice(-5).forEach((x, i) => { t(x.date, (tl + tm) / 2, ty + th * (i + 1) + 6, 9.5, { aligne: 'centre' }); t(x.objet.toUpperCase(), (tm + tr) / 2, ty + th * (i + 1) + 6, 8.5, { gras: true, aligne: 'centre' }) });
  /* le lieu de construction, le cadastre, la surface du terrain */
  boite(L0, 251, L1 - L0, 36);
  page.trait(X(L0 + 120), Y(251), X(L0 + 120), Y(287), 0.6);
  t('LIEU DE CONSTRUCTION :', L0 + 4, 259, 9.5, { gras: true });
  const lieu = d.adresseTerrain?.trim() ? [d.adresseTerrain.trim()] : lignes(D.lieuConstruction);
  if (lieu.length) lieu.forEach((l, i) => t(l, L0 + 4, 268 + i * 5, 9.5, { gras: true })); else t(AC, L0 + 4, 268, 9.5, { couleur: ROUGE });
  const LP = lieuDuProjet(projet);
  t('Références cadastrales :', L0 + 123, 258, 8.5, { gras: true });
  t(LP.cadastre ?? terrain?.reference ?? AC, L0 + 123, 263.5, 9.5, LP.cadastre ?? terrain?.reference ? {} : { couleur: ROUGE });
  t('Surface du terrain :', L0 + 123, 270, 8.5, { gras: true });
  /* sans parcelle ni surface saisie : on dit ce qui manque (la parcelle donne aussi le plan de masse) */
  t(LP.surface ? surfaceM2(LP.surface) : terrain ? AC : '[parcelle à tracer]', L0 + 123, 275, 9.5, { gras: true, ...(LP.surface ? {} : { couleur: ROUGE }) });
  page.trait(X(L0 + 120), Y(278.5), X(L1), Y(278.5), 0.6);
  t('Dessiné le : ' + d.date, L0 + 123, 284, 8.5);
  /* ---------- à droite ---------- */
  const R0 = 212, R1 = 410;
  boite(R0, 10, R1 - R0, 277);
  t('- TABLEAU DES SURFACES -', R0 + 8, 24, 15);
  const G = surfacesParPiece(projet), x0 = R0 + 8, x1 = R1 - 8, cSH = x1 - 32, cSA = x1 - 3;
  const nb = G.reduce((s, g) => s + g.pieces.length + 3, 0) + 1, h = Math.max(5.2, Math.min(8, 118 / Math.max(1, nb)));
  let y = 30;
  const ligne = (a: string, sh: string, sa: string, gras = false, fond?: string) => {
    page.cadre(X(x0), Y(y + h), (x1 - x0) * PT, h * PT, { ep: 0.4, ...(fond ? { fond } : {}) });
    t(a, x0 + 2, y + h - 1.9, 8.5, { gras }); t(sh, cSH, y + h - 1.9, 8.5, { gras, aligne: 'droite' }); t(sa, cSA, y + h - 1.9, 8.5, { gras, aligne: 'droite' });
    y += h;
  };
  const v = (mm2: number) => (mm2 > 0 ? (mm2 / 1e6).toFixed(2).replace('.', ',') : '');
  let totSH = 0, totSA = 0;
  for (const g of G) {
    page.cadre(X(x0), Y(y + h), (x1 - x0) * PT, h * PT, { ep: 0.4 }); t(g.niveau.toUpperCase(), (x0 + x1) / 2, y + h - 1.9, 9, { gras: true, aligne: 'centre' }); y += h;
    ligne('PIÈCE', 'S.H', 'S.A', true);
    let sh = 0, sa = 0;
    for (const p of g.pieces) { ligne(p.nom, v(p.sh), v(p.sa)); sh += p.sh; sa += p.sa }
    ligne('TOTAL (m²)', v(sh) || '0,00', v(sa), true);
    totSH += sh; totSA += sa; y += 2;
  }
  if (!G.length) { t('Aucune pièce nommée.', x0, y + 5, 8.5, { couleur: GRIS_ETIQ }); y += 8 }
  ligne('TOTAL GLOBAL (m²)', v(totSH) || '0,00', v(totSA), true);
  y += 9;
  t('- RÉSUMÉ DU PROJET -', R0 + 8, y, 15); y += 5;
  const pct = (a: number, b: number) => (b > 0 ? '  (' + Math.round(100 * a / b) + ' %)' : '');
  const vit = surfaceVitree(projet), terrainM2 = (LP.surface ?? 0) * 1e6 || terrain?.terrain || 0;
  ligne('Type de surface', '', 'Surfaces', true);
  ligne('Emprise au sol (m²)', '', terrain ? v(terrain.emprise) + pct(terrain.emprise, terrainM2) : AC);
  ligne('Surface de plancher « S.P » (m²)', '', v(S.surfacePlancher) || '0,00');
  ligne('Surface habitable (m²)', '', v(S.habitable) || '0,00');
  ligne('Surface vitrée (m²)', '', (v(vit) || '0,00') + pct(vit, S.habitable));
  /* les pièces du dossier, en bas à droite */
  y += 8;
  t('PIÈCES DU DOSSIER', x0, y, 9.5, { gras: true, couleur: '#2C4A5E' }); y += 2;
  const pas = Math.min(6.2, (283 - y) / Math.max(1, pieces.length));
  for (const p of pieces) {
    y += pas;
    t(p.code, x0, y, 7.5, { gras: true }); t(p.intitule, x0 + 17, y, 7.5);
    t(p.page !== null ? 'page ' + p.page : (p.note?.startsWith('à joindre') ? 'à joindre' : '—'), x1, y, 7.5, { aligne: 'droite', gras: p.page !== null, ...(p.page === null ? { couleur: ROUGE } : {}) });
  }
  if (S.seuil.etat !== 'ok') t(S.seuil.message, x0, 285, 6.5, { couleur: ROUGE });
}
