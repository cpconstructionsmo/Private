/* La planche de situation (PCMI 1), sur le modèle des dossiers du cabinet.

   - À gauche, les extraits de carte FOURNIS : le plan (Géoportail, IGN) et,
     s'il y en a une, la vue aérienne. Le Designer ne les invente pas ;
     sans extrait, la place le réclame (« à compléter »).
   - À droite, le PLAN CADASTRAL du terrain, dessiné depuis le cadastre
     importé au plan de masse (PCI, DGFiP / Etalab), le nord en haut : les
     parcelles du terrain en rouge, cerclées de tirets bleus, les parcelles
     voisines et leur numéro, le bâti existant ; l'échelle, le nord et la
     source. Ses limites ne sont pas garanties, et la planche le dit.
   La planche ne se compose que si l'on a un extrait ou un cadastre. */
import type { Point, Project } from '../model/types';
import type { DocumentPdf, PagePdf } from './pdf';
import { parcelleDuProjet, surfaceTerrain } from '../building/terrain';
import { PT, X, Y, GRIS_TEXTE, ROUGE_MANQUE, A_PRECISER, colonne, nouvelleFeuille, texte, titreDessin, nordFleche, echelleGraphique, couper,
  type ImageDossier, type Signature } from './feuille';
import { A_COMPLETER } from './notice';

/** le rouge de la parcelle, le bleu du cercle, le jaune du bâti : les couleurs des dossiers du cabinet */
const ROUGE_PARCELLE = '#C0392B', BLEU_CERCLE = '#2E5FA8', BATI = '#F4C542', BATI_TRAIT = '#B88A12';
/** les échelles possibles du plan cadastral, de la plus grande à la plus petite */
const ECHELLES_CADASTRE = [500, 1_000, 2_000, 2_500, 5_000] as const;

/** la planche PCMI 1 ; « carte » et « aerienne » : les extraits fournis (l'un, l'autre, ou aucun) */
export function plancheSituation(doc: DocumentPdf, projet: Project, o: Signature, carte?: ImageDossier, aerienne?: ImageDossier): void {
  const page = nouvelleFeuille(doc);
  const t = parcelleDuProjet(projet), fc = t?.plot.cadastre;
  const images = [carte && { v: carte, titre: 'Plan de situation', sous: 'Extrait de carte fourni' }, aerienne && { v: aerienne, titre: 'Vue aérienne', sous: 'Extrait fourni' }]
    .filter((x): x is { v: ImageDossier; titre: string; sous: string } => !!x);
  /* la colonne des extraits : la moitié gauche de la zone s'il y a un plan cadastral, toute la zone sinon */
  const gauche = { x: 10, y: 22, l: fc ? 182 : 345, h: 236 };
  if (images.length) {
    const n = images.length, ecart = 16, hBoite = fc ? (gauche.h - (n - 1) * ecart) / n : gauche.h, lBoite = fc ? gauche.l : (gauche.l - (n - 1) * 10) / n;
    images.forEach((im, i) => {
      const bx = fc ? gauche.x : gauche.x + i * (lBoite + 10), by = fc ? gauche.y + i * (hBoite + ecart) : gauche.y;
      const k = Math.min(lBoite / im.v.largeur, (hBoite - 8) / im.v.hauteur), l = im.v.largeur * k, h = im.v.hauteur * k;
      const x0 = bx, y0 = by + 6;
      titreDessin(page, im.titre.toUpperCase(), im.v.legende?.trim() || im.sous + ' (source et échelle : ' + A_COMPLETER + ')', bx, by - 4, 9);
      page.image(doc.imageJpeg(im.v.jpeg, im.v.largeur, im.v.hauteur), X(x0), Y(y0 + h), l * PT, h * PT);
      page.cadre(X(x0), Y(y0 + h), l * PT, h * PT, { ep: 0.5, couleur: '#222222' });
    });
  } else {
    /* sans extrait : la place le réclame, rien n'est inventé */
    page.cadre(X(gauche.x), Y(gauche.y + gauche.h), gauche.l * PT, gauche.h * PT, { ep: 0.4, couleur: '#9A9A9A' });
    texte(page, 'EXTRAIT DE CARTE À JOINDRE', gauche.x + gauche.l / 2, gauche.y + gauche.h / 2 - 6, 11, { gras: true, aligne: 'centre', couleur: ROUGE_MANQUE });
    for (const [i, l] of couper('Plan de situation du terrain dans la commune (Géoportail, carte IGN), à une échelle du 1/5 000 au 1/25 000, le terrain repéré, l’échelle et le nord indiqués : ' + A_COMPLETER + '. Le Designer ne l’invente pas : à joindre dans Dossier › Pièces fournies.', 150 * PT, 8).entries())
      texte(page, l, gauche.x + gauche.l / 2, gauche.y + gauche.h / 2 + 2 + i * 4, 8, { aligne: 'centre', couleur: ROUGE_MANQUE });
  }
  if (images.length) {
    const yN = gauche.y + gauche.h + 9;
    for (const [i, l] of couper('Le terrain doit être repéré sur chaque extrait, avec l’échelle et la direction du nord : à vérifier sur les extraits avant le dépôt.', gauche.l * PT, 7).entries())
      texte(page, l, gauche.x, yN + i * 3.6, 7, { couleur: GRIS_TEXTE });
  }
  if (fc && t) planCadastral(page, projet, { x: 204, y: 22, l: 152, h: 222 });
  colonne(page, projet, o, 'Plan de situation', 'dans le dossier', 'PCMI 1', 0);
}

/** le plan cadastral du terrain, le nord en haut, dans le cadre donné (mm de la feuille) */
function planCadastral(page: PagePdf, projet: Project, cadre: { x: number; y: number; l: number; h: number }): void {
  const t = parcelleDuProjet(projet)!, plot = t.plot, fc = plot.cadastre!;
  titreDessin(page, 'PLAN CADASTRAL', 'D’après le cadastre importé (PCI, DGFiP — Etalab)', cadre.x, cadre.y - 4, 9);
  const y0 = cadre.y + 6, h = cadre.h - 6;
  /* le terrain : ses parcelles du cadastre (ou, à défaut, la limite tracée) */
  const terrain = fc.parcelles.filter(p => p.terrain).map(p => p.contour);
  const T = terrain.length ? terrain : [plot.contour];
  const pts = T.flat();
  const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  /* le nord en haut : on tourne le plan de −nord autour du terrain */
  const a = -plot.north, ca = Math.cos(a), sa = Math.sin(a);
  const tourner = (p: Point): Point => ({ x: (p.x - c.x) * ca - (p.y - c.y) * sa, y: (p.x - c.x) * sa + (p.y - c.y) * ca });
  const rayon = Math.max(...pts.map(p => Math.hypot(p.x - c.x, p.y - c.y))) * 1.35 + 3_000;
  /* la plus grande échelle où le cercle tient dans le tiers central du cadre */
  const ech: number = ECHELLES_CADASTRE.find(e => rayon / e <= Math.min(cadre.l, h) * 0.34) ?? 5_000;
  const cx = cadre.x + cadre.l / 2, cy = y0 + h / 2;
  const P = (p: Point): [number, number] => { const q = tourner(p); return [X(cx + q.x / ech), Y(cy - q.y / ech)] };
  const Pf = (p: Point): { x: number; y: number } => { const q = tourner(p); return { x: cx + q.x / ech, y: cy - q.y / ech } };
  page.cadre(X(cadre.x), Y(y0 + h), cadre.l * PT, h * PT, { ep: 0.6, couleur: '#222222', fond: '#FFFFFF' });
  page.decouper([[X(cadre.x), Y(y0)], [X(cadre.x + cadre.l), Y(y0)], [X(cadre.x + cadre.l), Y(y0 + h)], [X(cadre.x), Y(y0 + h)]]);
  for (const b of fc.batiments) page.polygone(b.map(P), { fond: BATI, trait: BATI_TRAIT, ep: 0.3 });
  for (const p of fc.parcelles) if (!p.terrain) page.polygone(p.contour.map(P), { trait: '#4A4A4A', ep: 0.35 });
  for (const A of T) page.polygone(A.map(P), { trait: ROUGE_PARCELLE, ep: 1.1 });
  /* le numéro de chaque parcelle visible, au milieu de ce qu'on en voit (le terrain en gras) */
  const dedans = (q: { x: number; y: number }) => q.x > cadre.x + 5 && q.x < cadre.x + cadre.l - 5 && q.y > y0 + 5 && q.y < y0 + h - 5;
  const vus = new Set<string>();
  for (const p of fc.parcelles) {
    if (vus.has(p.reference)) continue;
    const V = p.contour.map(Pf), m = { x: V.reduce((s, q) => s + q.x, 0) / V.length, y: V.reduce((s, q) => s + q.y, 0) / V.length };
    const xs = V.map(q => q.x), ys = V.map(q => q.y);
    if (!dedans(m) || Math.max(...xs) - Math.min(...xs) < 8 || Math.max(...ys) - Math.min(...ys) < 5) continue;
    vus.add(p.reference);
    const num = /n°\s*(.+)$/.exec(p.reference)?.[1] ?? p.reference;
    texte(page, num, m.x, m.y + 1.5, p.terrain ? 9 : 7.5, { gras: !!p.terrain, aligne: 'centre', couleur: p.terrain ? ROUGE_PARCELLE : '#3A3A3A' });
  }
  /* le cercle de repérage, en tirets */
  page.cercle(X(cx), Y(cy), (rayon / ech) * PT, { trait: BLEU_CERCLE, ep: 1, tirets: [3.5, 2.2] });
  page.restaurer();
  nordFleche(page, cadre.x + cadre.l - 9, y0 + 10, 0, 5);
  /* sous le cadre : l'échelle, puis la source et la réserve */
  echelleGraphique(page, ech, cadre.x, y0 + h + 7);
  const section = [...new Set(fc.parcelles.filter(p => p.terrain).map(p => p.reference.replace(/\s*n°.*$/, '')))].join(', ');
  const surface = surfaceTerrain(plot);
  const lignes = [
    'Terrain : ' + (plot.reference?.trim() || A_PRECISER) + (section ? ' (section ' + section + ')' : '') + (surface ? ', ' + Math.round(surface / 1e6) + ' m² (limite tracée)' : '') + '.',
    'Source : ' + fc.source + ', du ' + fc.date + ' — plan cadastral (PCI) de la DGFiP, licence ouverte Etalab.',
    'Limites cadastrales indicatives, non garanties : seul le bornage du géomètre-expert fait foi.',
  ];
  let y = y0 + h + 18;
  for (const l of lignes) for (const s of couper(l, cadre.l * PT, 6.5)) { texte(page, s, cadre.x, y, 6.5, { couleur: GRIS_TEXTE }); y += 3.3 }
}
