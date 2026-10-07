/* Un PDF écrit à la main, sans bibliothèque (comme les PDF et .docx du
   suivi de chantiers) : des pages, des tracés vectoriels et du texte dans
   les polices standard des lecteurs PDF (rien à embarquer) : Helvetica,
   son gras et son italique, et le Times des titres des dossiers du cabinet.
   Le texte passe en WinAnsi : les accents du français y sont. */

/** les largeurs (millièmes de corps), de l'espace (32) au tilde (126) : Helvetica, Helvetica gras, Times, Times gras
    (relevées sur les Liberation, aux mêmes métriques) ; l'italique a celles du romain */
const LARGEURS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667,
  944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500,
  278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const LARGEURS_GRAS = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667,
  944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556,
  333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
const LARGEURS_TIMES = [250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500,
  278, 278, 564, 564, 564, 444, 921, 722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722, 556, 722, 667, 556, 611, 722, 722,
  944, 722, 722, 611, 333, 278, 333, 469, 500, 333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500, 500, 500, 333, 389,
  278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541];
const LARGEURS_TIMES_GRAS = [250, 333, 555, 500, 500, 1000, 833, 278, 333, 333, 500, 570, 250, 333, 250, 278, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500,
  333, 333, 570, 570, 570, 500, 930, 722, 667, 722, 722, 667, 611, 778, 778, 389, 500, 778, 667, 944, 722, 778, 611, 778, 722, 556, 667, 722, 722,
  1000, 722, 722, 667, 333, 278, 333, 581, 500, 333, 500, 556, 444, 556, 444, 333, 500, 556, 278, 333, 556, 278, 833, 556, 500, 556, 556, 444, 389,
  333, 556, 500, 722, 500, 500, 444, 394, 220, 394, 520];
const SPECIAUX: Record<string, number> = { '²': 333, '³': 333, '°': 400, '×': 584, '«': 556, '»': 556, '·': 278, 'Ø': 778, 'ø': 611, 'æ': 889, 'Æ': 1000,
  'œ': 944, 'Œ': 1000, 'ß': 611, '€': 556, '’': 222, '‘': 222, '“': 333, '”': 333, '…': 1000, '–': 556, '—': 1000, '\u00A0': 278 };
const SPECIAUX_TIMES: Record<string, number> = { '²': 300, '³': 300, '°': 400, '×': 564, '«': 500, '»': 500, '·': 250, 'Ø': 722, 'ø': 500, 'æ': 667, 'Æ': 889,
  'œ': 722, 'Œ': 889, 'ß': 500, '€': 500, '’': 333, '‘': 333, '“': 444, '”': 444, '…': 1000, '–': 500, '—': 1000, '\u00A0': 250 };
/* WinAnsi, de 0x80 à 0x9F (le reste des accents suit le Latin-1) */
const WINANSI: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, 'Œ': 0x8C, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, 'œ': 0x9C, 'Ÿ': 0x9F };

/** la famille d'un texte : Helvetica (les plans), Times (les titres de la colonne, comme les dossiers du cabinet) */
export type Police = 'sans' | 'serif';

/** un caractère en octet WinAnsi (null : absent de la police, il est omis) */
function octet(c: string): number | null {
  if (c === ' ' || c === ' ') return 0x20;                // espaces fines : une espace
  if (WINANSI[c] !== undefined) return WINANSI[c]!;
  /* le signe moins (−) n'est pas dans les polices standard : le trait d'union le remplace (« TN −0,26 » ne perd pas son signe) */
  if (c === '−') return 0x2D;
  const n = c.codePointAt(0)!;
  return n >= 0x20 && n <= 0x7E || n >= 0xA0 && n <= 0xFF ? n : null;
}

/** la largeur d'un texte, en millièmes de corps (Helvetica par défaut ; l'italique a la largeur du romain) */
export function largeurTexte(t: string, gras = false, police: Police = 'sans'): number {
  const L = police === 'serif' ? (gras ? LARGEURS_TIMES_GRAS : LARGEURS_TIMES) : gras ? LARGEURS_GRAS : LARGEURS;
  const S = police === 'serif' ? SPECIAUX_TIMES : SPECIAUX, defaut = police === 'serif' ? 500 : 556;
  let w = 0;
  for (const x of t) {
    if (octet(x) === null) continue;
    const c = x === '−' ? '-' : x, n = c.codePointAt(0)!;
    w += S[c] ?? (n >= 32 && n <= 126 ? L[n - 32]! : (() => { const b = c.normalize('NFD')[0]!.codePointAt(0)!; return b >= 32 && b <= 126 ? L[b - 32]! : defaut })());
  }
  return w;
}

/** la manière d'écrire un texte */
export interface StyleTexte {
  gras?: boolean; italique?: boolean; police?: Police; couleur?: string; aligne?: 'gauche' | 'centre' | 'droite';
  /** souligné (les intitulés de la colonne : « Numéro de feuille : ») */
  souligne?: boolean;
  /** l'espace ajouté entre les lettres (points) : « R É G L E M E N T A T I O N » */
  espacement?: number;
  /** un contour de cette épaisseur (points) autour des lettres : un gras plus appuyé (le sigle RE 2020) */
  epais?: number;
  /** tourné (degrés, sens trigonométrique) autour du point d'ancrage */
  angle?: number;
}

/** le nom de la police d'un style (F1 à F7, voir DocumentPdf.octets) */
function nomPolice(o: StyleTexte): string {
  if (o.police === 'serif') return o.gras ? 'F6' : o.italique ? 'F7' : 'F5';
  return o.gras ? (o.italique ? 'F4' : 'F2') : o.italique ? 'F3' : 'F1';
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
  /** la largeur d'un texte écrit dans ce style (points) */
  static largeur(t: string, corps: number, o: StyleTexte = {}): number {
    const k = [...t].filter(c => octet(c) !== null).length;
    return largeurTexte(t, o.gras, o.police) * corps / 1000 + (o.espacement ?? 0) * Math.max(0, k - 1);
  }
  texte(t: string, x: number, y: number, corps: number, o: StyleTexte = {}): this {
    const w = PagePdf.largeur(t, corps, o), dx = o.aligne === 'centre' ? -w / 2 : o.aligne === 'droite' ? -w : 0;
    const [r, g, b] = PagePdf.rvb(o.couleur ?? '#1A2B36');
    const tc = o.espacement ? `${n(o.espacement)} Tc ` : '', tr = o.epais ? `${n(r)} ${n(g)} ${n(b)} RG ${n(o.epais)} w 2 Tr ` : '';
    const fin = (o.espacement ? ' 0 Tc' : '') + (o.epais ? ' 0 Tr' : '');
    if (o.angle) {
      /* tourné : une matrice de texte (Tm) au point d'ancrage, le décalage d'alignement le long du texte */
      const a = o.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      this.op(`BT ${n(r)} ${n(g)} ${n(b)} rg ${tc}${tr}/${nomPolice(o)} 1 Tf ${n(c * corps)} ${n(s * corps)} ${n(-s * corps)} ${n(c * corps)} ${n(x + c * dx)} ${n(y + s * dx)} Tm ${chainePdf(t)} Tj${fin} ET`);
    } else this.op(`BT ${n(r)} ${n(g)} ${n(b)} rg ${tc}${tr}/${nomPolice(o)} ${n(corps)} Tf ${n(x + dx)} ${n(y)} Td ${chainePdf(t)} Tj${fin} ET`);
    if (o.souligne && !o.angle) this.trait(x + dx, y - corps * 0.12, x + dx + w, y - corps * 0.12, Math.max(0.3, corps * 0.05), o.couleur ?? '#1A2B36');
    return this;
  }
  /** un trait ; « tirets » : longueurs pleines et vides alternées (points) */
  trait(x0: number, y0: number, x1: number, y1: number, ep = 0.5, couleur = '#1A2B36', tirets: number[] = []): this {
    const [r, g, b] = PagePdf.rvb(couleur);
    return this.op(`${n(r)} ${n(g)} ${n(b)} RG ${n(ep)} w [${tirets.map(n).join(' ')}] 0 d ${n(x0)} ${n(y0)} m ${n(x1)} ${n(y1)} l S`);
  }
  /** une ligne brisée (ouverte), en points PDF */
  ligne(P: [number, number][], ep = 0.5, couleur = '#1A2B36', tirets: number[] = []): this {
    if (P.length < 2) return this;
    const [r, g, b] = PagePdf.rvb(couleur);
    return this.op(`${n(r)} ${n(g)} ${n(b)} RG ${n(ep)} w [${tirets.map(n).join(' ')}] 0 d 1 j ${P.map(([x, y], i) => `${n(x)} ${n(y)} ${i ? 'l' : 'm'}`).join(' ')} S`);
  }
  /** un polygone (points en points PDF), rempli puis tracé ; « trous » : percés (règle pair-impair) */
  polygone(P: [number, number][], o: { fond?: string; trait?: string; ep?: number; tirets?: number[]; trous?: [number, number][][] } = {}): this {
    if (P.length < 3) return this;
    const c = [P, ...(o.trous ?? [])].filter(a => a.length > 2).map(a => a.map(([x, y], i) => `${n(x)} ${n(y)} ${i ? 'l' : 'm'}`).join(' ') + ' h').join(' ');
    const f = o.fond ? PagePdf.rvb(o.fond) : null, t = o.trait ? PagePdf.rvb(o.trait) : null;
    const pi = o.trous?.length ? '*' : '';
    const op = f && t ? 'B' + pi : f ? 'f' + pi : 'S';
    return this.op(`${f ? `${n(f[0])} ${n(f[1])} ${n(f[2])} rg ` : ''}${t ? `${n(t[0])} ${n(t[1])} ${n(t[2])} RG ${n(o.ep ?? 0.35)} w [${(o.tirets ?? []).map(n).join(' ')}] 0 d 1 j ` : ''}${c} ${op}`);
  }
  /** découper ce qui suit à un polygone (jusqu'au restaurer() qui suit) */
  decouper(P: [number, number][], trous: [number, number][][] = []): this {
    const c = [P, ...trous].filter(a => a.length > 2).map(a => a.map(([x, y], i) => `${n(x)} ${n(y)} ${i ? 'l' : 'm'}`).join(' ') + ' h').join(' ');
    return this.op('q', `${c} W* n`);
  }
  restaurer(): this { return this.op('Q') }
  /** un cercle (centre, rayon, en points) */
  cercle(x: number, y: number, r: number, o: { fond?: string; trait?: string; ep?: number; tirets?: number[] } = {}): this {
    const P: [number, number][] = [];
    for (let i = 0; i < 48; i++) { const a = i / 48 * 2 * Math.PI; P.push([x + r * Math.cos(a), y + r * Math.sin(a)]) }
    return this.polygone(P, o);
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

  /** les octets du fichier : catalogue, pages, polices, informations ; table des renvois exacte */
  octets(titre: string): Uint8Array<ArrayBuffer> {
    const morceaux: string[] = [], offsets: number[] = [];
    let taille = 0;
    const pousser = (s: string) => { morceaux.push(s); taille += s.length };       // une chaîne d'octets (codes < 256)
    const obj = (i: number, corps: string) => { offsets[i] = taille; pousser(`${i} 0 obj\n${corps}\nendobj\n`) };
    /* 1 catalogue, 2 pages, 3 et 4 polices (Helvetica et son gras), 5 informations, deux objets par page, les images, puis les autres polices */
    const P = this.pages, page = (k: number) => 6 + 2 * k, flux = (k: number) => 7 + 2 * k, image = (k: number) => 6 + 2 * P.length + k;
    /* les polices au-delà des deux premières : après les images */
    const POLICES = ['Helvetica-Oblique', 'Helvetica-BoldOblique', 'Times-Roman', 'Times-Bold', 'Times-Italic'], police = (k: number) => 6 + 2 * P.length + this.images.length + k;
    const dernier = 5 + 2 * P.length + this.images.length + POLICES.length;
    const polices = '/F1 3 0 R /F2 4 0 R ' + POLICES.map((_, k) => `/F${k + 3} ${police(k)} 0 R`).join(' ');
    const xo = this.images.length ? ' /XObject << ' + this.images.map((_, k) => `/Im${k + 1} ${image(k)} 0 R`).join(' ') + ' >>' : '';
    pousser('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Kids [${P.map((_, k) => page(k) + ' 0 R').join(' ')}] /Count ${P.length} >>`);
    obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    obj(5, `<< /Title ${chainePdf(titre)} /Producer (CP Constructions - CP Designer) >>`);
    P.forEach((p, k) => {
      const contenu = p.ops.join('\n');
      obj(page(k), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(p.largeur)} ${n(p.hauteur)}] /Resources << /Font << ${polices} >>${xo} >> /Contents ${flux(k)} 0 R >>`);
      obj(flux(k), `<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`);
    });
    this.images.forEach((im, k) => {
      let b = ''; for (let i = 0; i < im.octets.length; i++) b += String.fromCharCode(im.octets[i]!);
      obj(image(k), `<< /Type /XObject /Subtype /Image /Width ${im.largeur} /Height ${im.hauteur} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.octets.length} >>\nstream\n${b}\nendstream`);
    });
    POLICES.forEach((nom, k) => obj(police(k), `<< /Type /Font /Subtype /Type1 /BaseFont /${nom} /Encoding /WinAnsiEncoding >>`));
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
