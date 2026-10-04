/* Un PDF écrit à la main, sans bibliothèque (comme les PDF et .docx du
   suivi de chantiers) : des pages, des tracés vectoriels et du texte en
   Helvetica (polices standard des lecteurs PDF, rien à embarquer). Le
   texte passe en WinAnsi : les accents du français y sont. */

/** les largeurs Helvetica (millièmes de corps), de l'espace (32) au tilde (126) */
const LARGEURS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667,
  944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500,
  278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const SPECIAUX: Record<string, number> = { '²': 333, '³': 333, '°': 400, '×': 584, '«': 556, '»': 556, '·': 278, 'Ø': 778, 'ø': 611, 'æ': 889, 'Æ': 1000,
  'œ': 944, 'Œ': 1000, 'ß': 611, '€': 556, '’': 222, '‘': 222, '“': 333, '”': 333, '…': 1000, '–': 556, '—': 1000, ' ': 278 };
/* WinAnsi, de 0x80 à 0x9F (le reste des accents suit le Latin-1) */
const WINANSI: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, 'Œ': 0x8C, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, 'œ': 0x9C, 'Ÿ': 0x9F };

/** un caractère en octet WinAnsi (null : absent de la police, il est omis) */
function octet(c: string): number | null {
  if (c === ' ' || c === ' ') return 0x20;                // espaces fines : une espace
  if (WINANSI[c] !== undefined) return WINANSI[c]!;
  const n = c.codePointAt(0)!;
  return n >= 0x20 && n <= 0x7E || n >= 0xA0 && n <= 0xFF ? n : null;
}

/** la largeur d'un texte en Helvetica, en millièmes de corps (le gras, un peu plus large) */
export function largeurTexte(t: string, gras = false): number {
  let w = 0;
  for (const c of t) {
    if (octet(c) === null) continue;
    const n = c.codePointAt(0)!;
    w += SPECIAUX[c] ?? (n >= 32 && n <= 126 ? LARGEURS[n - 32]! : (() => { const b = c.normalize('NFD')[0]!.codePointAt(0)!; return b >= 32 && b <= 126 ? LARGEURS[b - 32]! : 556 })());
  }
  return gras ? w * 1.06 : w;
}

/** une chaîne PDF littérale : (texte), en octets WinAnsi, échappée */
export function chainePdf(t: string): string {
  let s = '';
  for (const c of t) {
    const o = octet(c);
    if (o === null) continue;
    const ch = String.fromCharCode(o);
    s += ch === '\\' || ch === '(' || ch === ')' ? '\\' + ch : ch;
  }
  return '(' + s + ')';
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();

/** une page : son flux de contenu (opérateurs PDF), en points, origine en bas à gauche */
export class PagePdf {
  readonly ops: string[] = [];
  constructor(readonly largeur: number, readonly hauteur: number) {}
  op(...o: string[]): this { this.ops.push(...o); return this }
  /** couleur « #RRGGBB » en composantes 0–1 */
  static rvb(c: string): [number, number, number] {
    const m = /^#([0-9a-f]{6})$/i.exec(c.trim());
    if (m) { const v = parseInt(m[1]!, 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255] }
    const r = /rgba?\(([^)]+)\)/i.exec(c);
    if (r) {
      const [x, y, z, a] = r[1]!.split(',').map(s => Number(s.trim()));
      /* une couleur transparente se pose sur du papier blanc */
      const al = a === undefined || Number.isNaN(a) ? 1 : a, mix = (v: number) => (v / 255) * al + (1 - al);
      return [mix(x!), mix(y!), mix(z!)];
    }
    return [0, 0, 0];
  }
  texte(t: string, x: number, y: number, corps: number, o: { gras?: boolean; couleur?: string; aligne?: 'gauche' | 'centre' | 'droite' } = {}): this {
    const w = largeurTexte(t, o.gras) * corps / 1000, dx = o.aligne === 'centre' ? -w / 2 : o.aligne === 'droite' ? -w : 0;
    const [r, g, b] = PagePdf.rvb(o.couleur ?? '#1A2B36');
    return this.op(`BT ${n(r)} ${n(g)} ${n(b)} rg /${o.gras ? 'F2' : 'F1'} ${n(corps)} Tf ${n(x + dx)} ${n(y)} Td ${chainePdf(t)} Tj ET`);
  }
  trait(x0: number, y0: number, x1: number, y1: number, ep = 0.5, couleur = '#1A2B36'): this {
    const [r, g, b] = PagePdf.rvb(couleur);
    return this.op(`${n(r)} ${n(g)} ${n(b)} RG ${n(ep)} w [] 0 d ${n(x0)} ${n(y0)} m ${n(x1)} ${n(y1)} l S`);
  }
  /** un polygone (points en points PDF), rempli puis tracé */
  polygone(P: [number, number][], o: { fond?: string; trait?: string; ep?: number } = {}): this {
    if (P.length < 3) return this;
    const c = P.map(([x, y], i) => `${n(x)} ${n(y)} ${i ? 'l' : 'm'}`).join(' ') + ' h';
    const f = o.fond ? PagePdf.rvb(o.fond) : null, t = o.trait ? PagePdf.rvb(o.trait) : null;
    const op = f && t ? 'B' : f ? 'f' : 'S';
    return this.op(`${f ? `${n(f[0])} ${n(f[1])} ${n(f[2])} rg ` : ''}${t ? `${n(t[0])} ${n(t[1])} ${n(t[2])} RG ${n(o.ep ?? 0.35)} w [] 0 d 1 j ` : ''}${c} ${op}`);
  }
  /** une image du document (DocumentPdf.imageJpeg), posée dans le rectangle (x, y, l, h) en points */
  image(nom: string, x: number, y: number, l: number, h: number): this { return this.op(`q ${n(l)} 0 0 ${n(h)} ${n(x)} ${n(y)} cm /${nom} Do Q`) }
  cadre(x: number, y: number, l: number, h: number, o: { ep?: number; couleur?: string; fond?: string } = {}): this {
    const [r, g, b] = PagePdf.rvb(o.couleur ?? '#1A2B36');
    if (o.fond) { const [a, c, d] = PagePdf.rvb(o.fond); this.op(`${n(a)} ${n(c)} ${n(d)} rg ${n(x)} ${n(y)} ${n(l)} ${n(h)} re f`) }
    return o.ep === 0 ? this : this.op(`${n(r)} ${n(g)} ${n(b)} RG ${n(o.ep ?? 0.5)} w [] 0 d ${n(x)} ${n(y)} ${n(l)} ${n(h)} re S`);
  }
}

export class DocumentPdf {
  private readonly pages: PagePdf[] = [];
  private readonly images: { octets: Uint8Array; largeur: number; hauteur: number }[] = [];
  /** une image JPEG, gardée telle quelle (le PDF la lit directement) ; rend son nom pour PagePdf.image */
  imageJpeg(octets: Uint8Array, largeur: number, hauteur: number): string {
    if (octets[0] !== 0xFF || octets[1] !== 0xD8) throw new Error('image : un JPEG est attendu');
    this.images.push({ octets, largeur, hauteur });
    return 'Im' + this.images.length;
  }
  page(largeur: number, hauteur: number): PagePdf { const p = new PagePdf(largeur, hauteur); this.pages.push(p); return p }
  /** le nombre de pages, et la page i (pour numéroter après coup) */
  get nombre(): number { return this.pages.length }
  pageNo(i: number): PagePdf { return this.pages[i]! }

  /** les octets du fichier : catalogue, pages, deux polices, informations ; table des renvois exacte */
  octets(titre: string): Uint8Array<ArrayBuffer> {
    const morceaux: string[] = [], offsets: number[] = [];
    let taille = 0;
    const pousser = (s: string) => { morceaux.push(s); taille += s.length };       // une chaîne d'octets (codes < 256)
    const obj = (i: number, corps: string) => { offsets[i] = taille; pousser(`${i} 0 obj\n${corps}\nendobj\n`) };
    /* 1 catalogue, 2 pages, 3 et 4 polices, 5 informations, deux objets par page, puis les images */
    const P = this.pages, page = (k: number) => 6 + 2 * k, flux = (k: number) => 7 + 2 * k, image = (k: number) => 6 + 2 * P.length + k;
    const dernier = 5 + 2 * P.length + this.images.length;
    const xo = this.images.length ? ' /XObject << ' + this.images.map((_, k) => `/Im${k + 1} ${image(k)} 0 R`).join(' ') + ' >>' : '';
    pousser('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Kids [${P.map((_, k) => page(k) + ' 0 R').join(' ')}] /Count ${P.length} >>`);
    obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    obj(5, `<< /Title ${chainePdf(titre)} /Producer (CP Constructions - CP Designer) >>`);
    P.forEach((p, k) => {
      const contenu = p.ops.join('\n');
      obj(page(k), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(p.largeur)} ${n(p.hauteur)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo} >> /Contents ${flux(k)} 0 R >>`);
      obj(flux(k), `<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`);
    });
    this.images.forEach((im, k) => {
      let b = ''; for (let i = 0; i < im.octets.length; i++) b += String.fromCharCode(im.octets[i]!);
      obj(image(k), `<< /Type /XObject /Subtype /Image /Width ${im.largeur} /Height ${im.hauteur} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.octets.length} >>\nstream\n${b}\nendstream`);
    });
    const xref = taille;
    let t = `xref\n0 ${dernier + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= dernier; i++) t += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    pousser(t + `trailer\n<< /Size ${dernier + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(taille);
    let p = 0;
    for (const s of morceaux) for (let i = 0; i < s.length; i++) out[p++] = s.charCodeAt(i) & 0xff;
    return out;
  }
}
