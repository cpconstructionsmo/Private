/* Une « toile » qui reçoit les mêmes ordres que le canvas de l'écran
   (ui/dessin.ts) et les écrit dans une page PDF, en vectoriel : le plan
   imprimé est exactement le plan affiché, sans second dessin à tenir à jour.

   Unités : celles de la caméra, ici le point PDF ; origine en haut à gauche
   de la zone de dessin (comme un canvas), la page PDF ayant la sienne en
   bas à gauche. Traits, pointillés et textes sont réduits pour le papier :
   un trait d'un pixel à l'écran n'en fait pas un point (0,35 mm) sur un A3. */
import { largeurTexte, chainePdf, PagePdf } from './pdf';

type Matrice = [number, number, number, number, number, number];
interface Etat { m: Matrice; fill: string; stroke: string; lw: number; font: string; align: string; base: string; alpha: number; dash: number[] }

const n = (v: number) => (Math.round(v * 100) / 100).toString();
const mult = (a: Matrice, b: Matrice): Matrice => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];

export class ToilePdf {
  private e: Etat = { m: [1, 0, 0, 1, 0, 0], fill: '#000000', stroke: '#000000', lw: 1, font: '10px sans-serif', align: 'start', base: 'alphabetic', alpha: 1, dash: [] };
  private pile: Etat[] = [];
  private chemin: [number, number][][] = [];

  /** ox, oy : coin haut-gauche de la zone, en points depuis le haut-gauche de la page ; trait, texte : réductions pour le papier */
  constructor(private readonly page: PagePdf, private readonly ox: number, private readonly oy: number, private readonly trait = 0.6, private readonly corps = 0.72) {}

  /* --- l'état, comme un canvas --- */
  set fillStyle(v: string) { this.e.fill = String(v) } get fillStyle(): string { return this.e.fill }
  set strokeStyle(v: string) { this.e.stroke = String(v) } get strokeStyle(): string { return this.e.stroke }
  set lineWidth(v: number) { this.e.lw = v } get lineWidth(): number { return this.e.lw }
  set font(v: string) { this.e.font = v } get font(): string { return this.e.font }
  set textAlign(v: string) { this.e.align = v } get textAlign(): string { return this.e.align }
  set textBaseline(v: string) { this.e.base = v } get textBaseline(): string { return this.e.base }
  set globalAlpha(v: number) { this.e.alpha = v } get globalAlpha(): number { return this.e.alpha }
  setLineDash(d: number[]): void { this.e.dash = [...d] }
  save(): void { this.pile.push({ ...this.e, m: [...this.e.m], dash: [...this.e.dash] }) }
  restore(): void { const e = this.pile.pop(); if (e) this.e = e }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void { this.e.m = [a, b, c, d, e, f] }
  translate(x: number, y: number): void { this.e.m = mult(this.e.m, [1, 0, 0, 1, x, y]) }
  rotate(t: number): void { this.e.m = mult(this.e.m, [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]) }

  /** d'un point de la toile à la page PDF */
  private versPage(x: number, y: number): [number, number] {
    const m = this.e.m, X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5];
    return [this.ox + X, this.page.hauteur - (this.oy + Y)];
  }
  private couleur(c: string, op: 'rg' | 'RG'): string {
    const [r, g, b] = PagePdf.rvb(c), a = this.e.alpha;
    return `${n(r * a + 1 - a)} ${n(g * a + 1 - a)} ${n(b * a + 1 - a)} ${op}`;
  }

  /* --- les chemins --- */
  beginPath(): void { this.chemin = [] }
  moveTo(x: number, y: number): void { this.chemin.push([this.versPage(x, y)]) }
  lineTo(x: number, y: number): void { const s = this.chemin[this.chemin.length - 1]; if (s) s.push(this.versPage(x, y)); else this.moveTo(x, y) }
  closePath(): void { const s = this.chemin[this.chemin.length - 1]; if (s && s.length) s.push([...s[0]!] as [number, number]) }
  rect(x: number, y: number, l: number, h: number): void { this.moveTo(x, y); this.lineTo(x + l, y); this.lineTo(x + l, y + h); this.lineTo(x, y + h); this.closePath() }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw = false): void {
    /* en petits segments (5° au plus) : assez fin pour un débattement de porte */
    let d = a1 - a0;
    if (ccw) { while (d > 0) d -= 2 * Math.PI } else { while (d < 0) d += 2 * Math.PI }
    const k = Math.max(4, Math.ceil(Math.abs(d) / (Math.PI / 36)));
    for (let i = 0; i <= k; i++) { const a = a0 + d * i / k, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a); if (i === 0 && !this.chemin.length) this.moveTo(x, y); else this.lineTo(x, y) }
  }
  private trace(): string {
    return this.chemin.filter(s => s.length > 1).map(s => s.map(([x, y], i) => `${n(x)} ${n(y)} ${i ? 'l' : 'm'}`).join(' ')).join(' ');
  }
  fill(regle?: string): void {
    const t = this.trace();
    if (t) this.page.op(`${this.couleur(this.e.fill, 'rg')} ${t} ${regle === 'evenodd' ? 'f*' : 'f'}`);
  }
  stroke(): void {
    const t = this.trace();
    if (!t) return;
    const k = this.trait, d = this.e.dash.length ? `[${this.e.dash.map(v => n(v * k)).join(' ')}] 0 d` : '[] 0 d';
    this.page.op(`${this.couleur(this.e.stroke, 'RG')} ${n(Math.max(0.15, this.e.lw * k))} w 1 J 1 j ${d} ${t} S`);
  }
  fillRect(x: number, y: number, l: number, h: number): void { this.beginPath(); this.rect(x, y, l, h); this.fill() }
  strokeRect(x: number, y: number, l: number, h: number): void { this.beginPath(); this.rect(x, y, l, h); this.stroke() }
  drawImage(): void { /* les fonds calés ne s'impriment pas : le plan est le dessin */ }

  /* --- le texte --- */
  private police(): { corps: number; gras: boolean } {
    const px = Number(/(\d+(?:\.\d+)?)px/.exec(this.e.font)?.[1] ?? 10);
    return { corps: px * this.corps, gras: /\b(bold|[6-9]00)\b/.test(this.e.font) };
  }
  measureText(t: string): { width: number } { const p = this.police(); return { width: largeurTexte(t, p.gras) * p.corps / 1000 } }
  fillText(t: string, x: number, y: number): void {
    const p = this.police(), w = largeurTexte(t, p.gras) * p.corps / 1000;
    const dx = this.e.align === 'center' ? -w / 2 : this.e.align === 'right' || this.e.align === 'end' ? -w : 0;
    /* la ligne de base : « middle » à mi-hauteur des capitales, « bottom » au-dessus des jambages */
    const dy = this.e.base === 'middle' ? 0.35 * p.corps : this.e.base === 'top' || this.e.base === 'hanging' ? 0.8 * p.corps : this.e.base === 'bottom' ? -0.22 * p.corps : 0;
    const m = this.e.m, [X, Y] = this.versPage(x + dx, y + dy);
    /* la direction du texte (axe x de la toile) et sa verticale, retournées pour la page */
    const ux = m[0], uy = -m[1], lu = Math.hypot(ux, uy) || 1, vx = -m[2], vy = m[3], lv = Math.hypot(vx, vy) || 1;
    this.page.op(`BT ${this.couleur(this.e.fill, 'rg')} /${p.gras ? 'F2' : 'F1'} 1 Tf ${n(ux / lu * p.corps)} ${n(uy / lu * p.corps)} ${n(vx / lv * p.corps)} ${n(vy / lv * p.corps)} ${n(X)} ${n(Y)} Tm ${chainePdf(t)} Tj ET`);
  }
}
