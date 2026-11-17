/* Réduction d'une photo sur l'appareil, avant tout stockage : JPEG, 1600 px
   au plus sur le grand côté. Une photo d'iPhone (3 à 5 Mo) tombe vers
   300 Ko : elle se garde sans remplir l'appareil et part vite, même en 4G
   faible. Le navigateur applique déjà l'orientation de l'appareil photo
   (EXIF) quand il décode l'image : le portrait reste en portrait. */
export const COTE_MAX = 1600;
export const QUALITE = 0.82;

export function dimensions(l, h, max = COTE_MAX) {
  if (!l || !h) return { l: 0, h: 0 };
  const k = Math.min(1, max / Math.max(l, h));
  return { l: Math.round(l * k), h: Math.round(h * k) };
}

async function decoder(fichier) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(fichier, { imageOrientation: 'from-image' }); } catch (e) { /* repli ci-dessous */ }
  }
  const url = URL.createObjectURL(fichier);
  try {
    const img = new Image(); img.decoding = 'async'; img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

export async function reduirePhoto(fichier, max = COTE_MAX) {
  const img = await decoder(fichier);
  const { l, h } = dimensions(img.width, img.height, max);
  const toile = document.createElement('canvas');
  toile.width = l; toile.height = h;
  const ctx = toile.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, l, h); // une image transparente (capture d'écran) ne devient pas noire
  ctx.drawImage(img, 0, 0, l, h);
  if (img.close) img.close();
  const blob = await new Promise(ok => toile.toBlob(ok, 'image/jpeg', QUALITE));
  if (!blob) throw new Error('Photo illisible');
  return blob;
}
