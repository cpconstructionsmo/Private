/* La planche A3 d'un niveau : le plan coté à une échelle normalisée, un
   cartouche CP Constructions, le tableau des surfaces et une échelle
   graphique. Le plan est dessiné par le même code qu'à l'écran (ui/dessin.ts)
   sur une toile PDF : vectoriel, net à toutes les tailles d'impression.

   Repère de la mise en page : millimètres depuis le haut-gauche de la
   feuille (comme on la lit) ; la page PDF est en points depuis le bas. */
import type { Floor, Project } from '../model/types';
import { planDuNiveau, cotationExterieure, toitureDuNiveau, emprise, mursDroits } from '../building';
import { dessiner, type Scene } from '../ui/dessin';
import type { Camera } from '../ui/camera';
import { DocumentPdf } from './pdf';
import { ToilePdf } from './toile-pdf';

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

function planche(doc: DocumentPdf, projet: Project, f: Floor, o: OptionsPlanche): void {
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
      ...(o.cotation ? { cotation: cotationExterieure(niveau, ECART_COTES * ech) } : {}), ...(t?.ok ? { toitures: t.toitures } : {}),
    };
    dessiner(toile as unknown as CanvasRenderingContext2D, cam, scene);
  } else page.texte('Niveau vide : aucun mur à dessiner.', X(ZONE.x + 10), Y(ZONE.y + 20), 11, { couleur: '#6E7B84' });

  /* l'échelle graphique, sous le dessin : 0 – 1 – 2 – 5 m (ou plus, à petite échelle) */
  const pas = ech <= 100 ? [0, 1, 2, 5] : ech <= 250 ? [0, 2, 5, 10] : [0, 10, 20, 50];
  const x0 = ZONE.x + 2, yb = 283;
  pas.forEach((v, i) => {
    if (i === 0) return;
    const a = x0 + pas[i - 1]! * 1000 / ech, b = x0 + v * 1000 / ech;
    page.cadre(X(a), Y(yb), (b - a) * PT, 1.6 * PT, { ep: 0.4, ...(i % 2 ? { fond: '#1A2B36' } : { fond: '#FFFFFF' }) });
  });
  pas.forEach(v => page.texte(String(v), X(x0 + v * 1000 / ech), Y(yb - 2.4), 6.5, { aligne: 'centre' }));
  page.texte('m', X(x0 + pas[pas.length - 1]! * 1000 / ech + 3), Y(yb - 2.4), 6.5);

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

  /* le cartouche */
  const yc = 287 - CARTOUCHE_H, cx = COLONNE.x + 5;
  page.trait(X(COLONNE.x), Y(yc), X(410), Y(yc), 0.6);
  page.texte('CP CONSTRUCTIONS', X(cx), Y(yc + 8), 13, { gras: true, couleur: '#C5563A' });
  page.texte('Maîtrise d’œuvre', X(cx), Y(yc + 12.5), 7.5, { couleur: '#6E7B84' });
  page.texte(projet.name || 'Projet', X(cx), Y(yc + 21), 10.5, { gras: true });
  page.texte('Plan : ' + f.name, X(cx), Y(yc + 27), 9);
  const rangs: [string, string][] = [['Échelle', '1/' + ech + ' (A3)'], ['Phase', projet.phase], ['Date', o.date], ['Indice', o.indice || 'A']];
  rangs.forEach(([k, v], i) => {
    const yy = yc + 34 + i * 5;
    page.texte(k, X(cx), Y(yy), 8, { couleur: '#6E7B84' });
    page.texte(v, X(cx + 22), Y(yy), 8, { gras: true });
  });
  page.texte('Document de travail : cotes à vérifier sur place avant exécution.', X(cx), Y(yc + 57), 6.2, { couleur: '#6E7B84' });
}

/** les planches A3 des niveaux demandés, en un PDF (une page par niveau) */
export function planchesPdf(projet: Project, o: OptionsPlanche): Uint8Array<ArrayBuffer> {
  const doc = new DocumentPdf();
  const F = projet.buildings.flatMap(b => b.floors).filter(f => o.niveaux.includes(f.id)).sort((a, b) => a.elevation - b.elevation);
  for (const f of F) planche(doc, projet, f, o);
  if (!F.length) doc.page(A3.l * PT, A3.h * PT).texte('Aucun niveau choisi.', 40, 400, 12);
  return doc.octets((projet.name || 'Projet') + ' — plans');
}

