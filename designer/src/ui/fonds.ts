/* Les fichiers des fonds calés : importés une fois, gardés dans la base
   locale (sous l'empreinte de leur contenu), puis transformés en image à
   dessiner. Un PDF est rendu par pdf.js, chargé seulement quand il sert.

   Repère de l'image : pour une image, ses pixels ; pour un PDF, les points
   de la page (1/72 de pouce), quelle que soit la finesse du rendu — le
   calage enregistré reste donc valable si l'on rend plus fin.

   Quand le projet est enregistré sur le serveur, le fichier y est aussi
   rangé (espace privé) : un collègue qui ouvre le projet le reçoit et le
   garde à son tour sur son appareil. */
import { FichiersIndexedDB, type FichierLocal } from '../persistence/copie-idb';
import type { StockFonds } from '../persistence/fonds-supabase';
import { lignesDeLImage, traitsDuPdf, type CodesPdf, type Trait } from '../import/traits-fond';

export interface ImageFond { image: CanvasImageSource; largeur: number; hauteur: number }

const RENDU_PDF = 3;           // pixels par point : assez fin pour zoomer sur un plan A3

/* pdf.js, version « legacy » : la version courante suppose des fonctions
   JavaScript toutes récentes (absentes de Safari sur iPad, par exemple) ;
   la legacy les apporte elle-même. Chargé seulement quand un PDF sert. */
async function chargerPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  return pdfjs;
}

export async function empreinteFichier(b: Blob): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', await b.arrayBuffer());
  return [...new Uint8Array(h)].slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join('');
}

export const estPdf = (type: string, nom: string): boolean => type === 'application/pdf' || /\.pdf$/i.test(nom);

/** ranger un fichier sur l'appareil, et sur le serveur s'il y en a un ;
    rend sa clé, et si le partage a échoué, pourquoi */
export async function importerFichier(f: File, stock = new FichiersIndexedDB(), distant?: StockFonds): Promise<{ cle: string; partage: 'serveur' | 'appareil'; erreur?: string }> {
  const cle = await empreinteFichier(f);
  const fichier: FichierLocal = { nom: f.name, type: f.type, donnees: f };
  await stock.ecrire(cle, fichier);
  if (!distant) return { cle, partage: 'appareil' };
  try { await distant.envoyer(cle, fichier); return { cle, partage: 'serveur' } }
  catch (e) { return { cle, partage: 'appareil', erreur: String((e as Error)?.message ?? e) } }
}

/** le fichier d'un fond : sur l'appareil, sinon reçu du serveur (et gardé) */
export async function fichierDuFond(cle: string, stock: FichiersIndexedDB, distant?: StockFonds): Promise<FichierLocal | null> {
  const local = await stock.lire(cle);
  if (local || !distant) return local;
  const recu = await distant.recevoir(cle);
  if (recu) await stock.ecrire(cle, recu);
  return recu;
}

/** l'image d'un fond, ou null si le fichier n'est ni sur cet appareil ni sur le serveur */
export async function imageDuFond(cle: string, page = 1, stock = new FichiersIndexedDB(), distant?: StockFonds): Promise<ImageFond | null> {
  const f = await fichierDuFond(cle, stock, distant);
  if (!f) return null;
  if (!estPdf(f.type, f.nom)) {
    const image = await createImageBitmap(f.donnees);
    return { image, largeur: image.width, hauteur: image.height };
  }
  const pdfjs = await chargerPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.donnees.arrayBuffer()) }).promise;
  const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
  const v1 = p.getViewport({ scale: 1 }), v = p.getViewport({ scale: RENDU_PDF });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(v.width); canvas.height = Math.ceil(v.height);
  await p.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: v }).promise;
  return { image: canvas, largeur: v1.width, hauteur: v1.height };
}

/** l'image d'un fichier choisi (image, ou une page d'un PDF rendue à « cote » pixels sur son grand côté),
    pour une pièce fournie du dossier — le plan de division du géomètre arrive souvent en PDF */
export async function imageDuFichier(f: File, page = 1, cote = 2_400): Promise<{ image: ImageBitmap | HTMLCanvasElement; largeur: number; hauteur: number }> {
  if (!estPdf(f.type, f.name)) { const image = await createImageBitmap(f); return { image, largeur: image.width, hauteur: image.height } }
  const pdfjs = await chargerPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
  const v1 = p.getViewport({ scale: 1 }), v = p.getViewport({ scale: Math.min(6, cote / Math.max(v1.width, v1.height)) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(v.width); canvas.height = Math.ceil(v.height);
  const ctx = canvas.getContext('2d')!;
  /* un PDF sans fond : du blanc dessous, sinon le JPEG le noircit */
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvas, canvasContext: ctx, viewport: v }).promise;
  return { image: canvas, largeur: canvas.width, hauteur: canvas.height };
}

/** le nombre de pages d'un PDF (1 pour une image) */
export async function nombrePages(f: File): Promise<number> {
  if (!estPdf(f.type, f.name)) return 1;
  const pdfjs = await chargerPdfjs();
  return (await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise).numPages;
}

/** au plus ce côté (pixels) pour chercher les lignes d'une image : assez fin pour un plan, assez court pour ne pas attendre */
const COTE_ANALYSE = 2_400;

/** les lignes d'une image (ou d'un rendu de PDF sans tracés), dans le repère donné (« k » : unités du repère par pixel) */
function lignesDuRendu(source: CanvasImageSource, l: number, h: number, k: number): Trait[] {
  const r = Math.min(1, COTE_ANALYSE / Math.max(l, h)), L = Math.max(1, Math.round(l * r)), H = Math.max(1, Math.round(h * r));
  const c = document.createElement('canvas'); c.width = L; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, L, H); x.drawImage(source, 0, 0, L, H);
  const d = x.getImageData(0, 0, L, H).data, g = new Uint8Array(L * H);
  for (let i = 0; i < L * H; i++) g[i] = (d[4 * i]! * 299 + d[4 * i + 1]! * 587 + d[4 * i + 2]! * 114) / 1000;
  const f = k / r;
  return lignesDeLImage(g, L, H).map(([a, b]) => [{ x: a.x * f, y: a.y * f }, { x: b.x * f, y: b.y * f }]);
}

/** les traits d'un fond, pour l'aimant, dans le repère de son image (points pour un PDF, pixels pour une image) ;
    un PDF vectoriel donne ses tracés, un scan ses lignes horizontales et verticales ; null si le fichier manque */
export async function traitsDuFond(cle: string, page = 1, stock = new FichiersIndexedDB(), distant?: StockFonds): Promise<{ traits: Trait[]; source: 'vecteurs' | 'image' } | null> {
  const f = await fichierDuFond(cle, stock, distant);
  if (!f) return null;
  if (!estPdf(f.type, f.nom)) {
    const im = await createImageBitmap(f.donnees);
    return { traits: lignesDuRendu(im, im.width, im.height, 1), source: 'image' };
  }
  const pdfjs = await chargerPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.donnees.arrayBuffer()) }).promise;
  const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
  const v1 = p.getViewport({ scale: 1 });
  const ops = await p.getOperatorList();
  const traits = traitsDuPdf(ops.fnArray, ops.argsArray, pdfjs.OPS as unknown as CodesPdf, v1.transform);
  if (traits.length >= 20) return { traits, source: 'vecteurs' };
  /* un PDF sans tracés (un scan enregistré en PDF) : ses lignes, sur un rendu de la page */
  const v = p.getViewport({ scale: 2 }), canvas = document.createElement('canvas');
  canvas.width = Math.ceil(v.width); canvas.height = Math.ceil(v.height);
  await p.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: v }).promise;
  return { traits: lignesDuRendu(canvas, canvas.width, canvas.height, 1 / 2), source: 'image' };
}
