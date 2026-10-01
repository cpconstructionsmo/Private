/* Les fichiers des fonds calés : importés une fois, gardés dans la base
   locale (sous l'empreinte de leur contenu), puis transformés en image à
   dessiner. Un PDF est rendu par pdf.js, chargé seulement quand il sert.

   Repère de l'image : pour une image, ses pixels ; pour un PDF, les points
   de la page (1/72 de pouce), quelle que soit la finesse du rendu — le
   calage enregistré reste donc valable si l'on rend plus fin. */
import { FichiersIndexedDB } from '../persistence/copie-idb';

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

/** ranger un fichier ; rend sa clé */
export async function importerFichier(f: File, stock = new FichiersIndexedDB()): Promise<string> {
  const cle = await empreinteFichier(f);
  await stock.ecrire(cle, { nom: f.name, type: f.type, donnees: f });
  return cle;
}

/** l'image d'un fond, ou null si le fichier n'est pas sur cet appareil */
export async function imageDuFond(cle: string, page = 1, stock = new FichiersIndexedDB()): Promise<ImageFond | null> {
  const f = await stock.lire(cle);
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

/** le nombre de pages d'un PDF (1 pour une image) */
export async function nombrePages(f: File): Promise<number> {
  if (!estPdf(f.type, f.name)) return 1;
  const pdfjs = await chargerPdfjs();
  return (await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise).numPages;
}
