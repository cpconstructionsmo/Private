/* L'export DXF d'un niveau, pour les bureaux d'études et les autres
   logiciels de dessin : un DXF R12 (ASCII, le plus largement lu), en
   millimètres, dans le repère du plan. Un calque par famille :

   MURS, CLOISONS      contours de la maçonnerie, ouverts au droit des baies
   OUVERTURES          le tableau de chaque baie, son vitrage ou son vantail,
                       et son repère (F 120×125, P 90×215…)
   PIECES              nom et surface de chaque pièce
   COTES               les chaînes de cotes extérieures (traits et valeurs)
   ESCALIERS, TREMIES  les marches, la trémie à l'étage
   MOBILIER            l'encombrement des meubles
   TOITURE             l'égout (débord) au-dessus du niveau
   PARCELLE, AMENAGEMENTS   sur le niveau qui les porte
   ATTENTES            les attentes sanitaires des appareils (S1 EF+EC+EU…)

   Le plan de fondations a son propre DXF (dxfFondations) : les murs à fonder,
   les semelles telles qu'on les coule, leurs cotes, les réservations et les
   trappes de visite.

   Le texte passe en Windows-1252 (accents du français), comme l'attend un
   DXF R12. Rien n'est recopié : tout se dérive du modèle, comme le plan. */
import type { Floor, Opening, Point, Project } from '../model/types';
import { planDuNiveau, geometrieOuverture } from '../building/plan';
import { mursDroits, ouvertureBatie } from '../building/murs';
import { cotationExterieure } from '../building/cotation';
import { geometrieEscalier, hauteurAFranchir, tremiesDuNiveau } from '../building/escalier';
import { emprise } from '../building/mobilier';
import { toitureDuNiveau } from '../building/toiture';
import { fenetresDeToit } from '../building/fenetres-toit';
import { planFondations, reservationsFondations, type PlanFondations } from '../building/fondations';
import { attentesSanitaires } from '../building/plomberie';
import { NOMS_RESEAUX } from '../building/terrassement';
import { cotationFondations, type ChaineCotes } from '../building/cotation';
import { difference } from '../geometry/booleen';
import { centroide, type Anneau } from '../geometry/polygon';

export const CALQUES: Record<string, number> = {
  MURS: 7, CLOISONS: 8, OUVERTURES: 4, PIECES: 3, COTES: 1, ESCALIERS: 6, TREMIES: 6, MOBILIER: 9, TOITURE: 5, PARCELLE: 3, AMENAGEMENTS: 2, ATTENTES: 5,
};
/** les calques du plan de fondations */
export const CALQUES_FONDATIONS: Record<string, number> = { MURS: 7, SEMELLES: 8, COTES: 1, RESERVATIONS: 1, TRAPPES: 4 };

const n = (v: number) => (Math.round(v * 1000) / 1000).toString();
const mm2 = (v: number) => (v / 1e6).toFixed(2).replace('.', ',') + ' m²';
const cm = (v: number) => Math.round(v / 10).toString();
const REPERES: Record<Opening['kind'], string> = { door: 'P', window: 'F', french_window: 'PF', garage_door: 'PG', bay: 'B', void: 'PASSAGE' };

class Ecrivain {
  readonly L: string[] = [];
  g(code: number, valeur: string | number): this { this.L.push(String(code), typeof valeur === 'number' ? n(valeur) : valeur); return this }
  polyligne(calque: string, P: readonly Point[], fermee = true): void {
    if (P.length < 2) return;
    this.g(0, 'POLYLINE').g(8, calque).g(66, 1).g(10, 0).g(20, 0).g(30, 0).g(70, fermee ? 1 : 0);
    for (const p of P) this.g(0, 'VERTEX').g(8, calque).g(10, p.x).g(20, p.y).g(30, 0);
    this.g(0, 'SEQEND').g(8, calque);
  }
  ligne(calque: string, a: Point, b: Point): void { this.g(0, 'LINE').g(8, calque).g(10, a.x).g(20, a.y).g(30, 0).g(11, b.x).g(21, b.y).g(31, 0) }
  texte(calque: string, p: Point, hauteur: number, t: string, centre = true, angle = 0): void {
    this.g(0, 'TEXT').g(8, calque).g(10, p.x).g(20, p.y).g(30, 0).g(40, hauteur).g(1, t.replace(/[\r\n]+/g, ' '));
    if (angle) this.g(50, angle);
    /* centré : le point d'insertion est alors le second (11, 21) */
    if (centre) this.g(72, 1).g(73, 2).g(11, p.x).g(21, p.y).g(31, 0);
  }
}

/** l'en-tête (R12, Windows-1252), la table des calques, et l'ouverture de la section des entités */
function entete(w: Ecrivain, calques: Record<string, number>): void {
  w.g(0, 'SECTION').g(2, 'HEADER').g(9, '$ACADVER').g(1, 'AC1009').g(9, '$DWGCODEPAGE').g(3, 'ANSI_1252').g(0, 'ENDSEC');
  w.g(0, 'SECTION').g(2, 'TABLES').g(0, 'TABLE').g(2, 'LAYER').g(70, Object.keys(calques).length);
  for (const [c, couleur] of Object.entries(calques)) w.g(0, 'LAYER').g(2, c).g(70, 0).g(62, couleur).g(6, 'CONTINUOUS');
  w.g(0, 'ENDTAB').g(0, 'ENDSEC');
  w.g(0, 'SECTION').g(2, 'ENTITIES');
}

/** des chaînes de cotes : la ligne, un trait à chaque repère, la valeur (m) de chaque intervalle */
function chaines(w: Ecrivain, CH: readonly ChaineCotes[]): void {
  for (const ch of CH) {
    const R = ch.reperes, h = ch.cote === 'bas' || ch.cote === 'haut';
    if (R.length < 2) continue;
    const P = (t: number, d = 0): Point => (h ? { x: t, y: ch.ligne + d } : { x: ch.ligne + d, y: t });
    w.ligne('COTES', P(R[0]!), P(R[R.length - 1]!));
    for (const t of R) w.ligne('COTES', P(t, -100), P(t, 100));
    for (let i = 1; i < R.length; i++) w.texte('COTES', P((R[i - 1]! + R[i]!) / 2, 130), 120, ((R[i]! - R[i - 1]!) / 1000).toFixed(2).replace('.', ','), true, h ? 0 : 90);
  }
}

/** un petit cercle (polyligne à 16 côtés), pour un repère */
const cercle = (c: Point, r: number): Point[] => Array.from({ length: 16 }, (_, i) => ({ x: c.x + r * Math.cos(i * Math.PI / 8), y: c.y + r * Math.sin(i * Math.PI / 8) }));

/** le DXF d'un niveau (texte ; voir dxfOctets pour l'enregistrer) */
export function dxfNiveau(projet: Project, f: Floor): string {
  const w = new Ecrivain(), plan = planDuNiveau(f), M = mursDroits(f), parId = new Map(M.map(m => [m.id, m]));
  const ouvertures = Object.values(f.objects).filter((o): o is Opening => o.type === 'opening' && ouvertureBatie(o) && parId.has(o.hostWallId));
  entete(w, CALQUES);

  /* les murs, ouverts au droit de leurs baies */
  for (const m of plan.murs) {
    const mur = parId.get(m.id);
    if (!mur) continue;
    const baies = ouvertures.filter(o => o.hostWallId === m.id).map(o => ({ contour: geometrieOuverture(mur, o).rectangle }));
    const calque = mur.role === 'partition' ? 'CLOISONS' : 'MURS';
    for (const p of baies.length ? difference([{ contour: m.contour }], baies) : [{ contour: m.contour }]) {
      w.polyligne(calque, p.contour);
      for (const t of p.trous ?? []) w.polyligne(calque, t);
    }
  }
  /* les baies : leur tableau, le vitrage ou le vantail au milieu du mur, leur repère */
  for (const o of ouvertures) {
    const mur = parId.get(o.hostWallId)!, g = geometrieOuverture(mur, o), R = g.rectangle;
    w.polyligne('OUVERTURES', R);
    const mil = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    if (o.kind !== 'void') w.ligne('OUVERTURES', mil(R[0]!, R[3]!), mil(R[1]!, R[2]!));
    const ang = Math.atan2(R[1]!.y - R[0]!.y, R[1]!.x - R[0]!.x) * 180 / Math.PI, lisible = ang > 90 || ang <= -90 ? ang + 180 : ang;
    w.texte('OUVERTURES', g.cotes[0], 100, REPERES[o.kind] + ' ' + cm(o.width) + '×' + cm(o.height) + (o.sill ? ' all. ' + cm(o.sill) : ''), true, lisible);
  }
  /* les pièces : nom et surface */
  for (const z of plan.zones) {
    const c = z.piece?.seed ?? centroide(z.polygone.contour);
    w.texte('PIECES', { x: c.x, y: c.y + 120 }, 200, z.piece?.name ?? 'À nommer');
    w.texte('PIECES', { x: c.x, y: c.y - 180 }, 150, mm2(z.aire));
  }
  /* les chaînes de cotes extérieures */
  chaines(w, cotationExterieure(f, 700));
  /* escaliers et trémies */
  for (const o of Object.values(f.objects)) {
    if (o.type === 'stair') for (const mk of geometrieEscalier(o, hauteurAFranchir(projet, f)).marches) w.polyligne('ESCALIERS', mk.contour);
    if (o.type === 'furniture') w.polyligne('MOBILIER', emprise(o));
    if (o.type === 'plot') w.polyligne('PARCELLE', o.contour);
    if (o.type === 'landscape') w.polyligne('AMENAGEMENTS', o.points, o.closed);
  }
  for (const t of tremiesDuNiveau(projet, f)) { w.polyligne('TREMIES', t.contour); if (t.contour.length === 4) { w.ligne('TREMIES', t.contour[0]!, t.contour[2]!); w.ligne('TREMIES', t.contour[1]!, t.contour[3]!) } }
  const toit = toitureDuNiveau(f);
  if (toit?.ok) for (const t of toit.toitures) w.polyligne('TOITURE', t.egout as Anneau);
  for (const { geo } of fenetresDeToit(f)) { w.polyligne('TOITURE', geo.plan); w.ligne('TOITURE', geo.plan[0]!, geo.plan[2]!); w.ligne('TOITURE', geo.plan[1]!, geo.plan[3]!) }
  /* les attentes sanitaires (building/plomberie.ts) : un repère cerclé au dos de chaque appareil, ses réseaux */
  for (const a of attentesSanitaires(f)) {
    w.polyligne('ATTENTES', cercle(a.point, 60));
    w.texte('ATTENTES', { x: a.point.x, y: a.point.y + 140 }, 100, a.repere + ' ' + a.reseaux.join('+') + ' ' + a.evacuation);
  }

  w.g(0, 'ENDSEC').g(0, 'EOF');
  return w.L.join('\r\n') + '\r\n';
}

/**
 * Le DXF du plan de fondations (null : pas de fondations sur ce niveau) — pour le bureau d'études et le maçon : les murs
 * à fonder, les semelles telles qu'on les coule (filantes réunies, isolées), leurs cotes (bords, largeurs, hors-tout),
 * les réservations au passage des réseaux (R1…) et les trappes de visite.
 */
export function dxfFondations(projet: Project, f: Floor, P: PlanFondations | null = planFondations(f)): string | null {
  if (!P) return null;
  const w = new Ecrivain(), plan = planDuNiveau(f);
  entete(w, CALQUES_FONDATIONS);
  const aFonder = new Set(mursDroits(f).filter(m => m.role === 'exterior' || m.role === 'bearing_interior' || (m.role === 'partition' && m.loadBearing.value)).map(m => m.id));
  for (const m of plan.murs) if (aFonder.has(m.id)) w.polyligne('MURS', m.contour);
  for (const q of P.emprise) { w.polyligne('SEMELLES', q.contour); for (const t of q.trous ?? []) w.polyligne('SEMELLES', t) }
  for (const q of P.isolees) w.polyligne('SEMELLES', q.contour);
  chaines(w, cotationFondations(P.emprise, 700));
  for (const r of reservationsFondations(projet, P)) {
    w.polyligne('RESERVATIONS', cercle(r.point, 80));
    w.texte('RESERVATIONS', { x: r.point.x + 260, y: r.point.y + 160 }, 110, r.repere + ' ' + NOMS_RESEAUX[r.reseau].code + ' ' + (r.spec ?? 'Ø à préciser'), false);
  }
  for (const t of P.trappes) { w.polyligne('TRAPPES', t.contour); w.texte('TRAPPES', t.centre, 120, 'TV') }

  w.g(0, 'ENDSEC').g(0, 'EOF');
  return w.L.join('\r\n') + '\r\n';
}

/* Windows-1252 : le Latin-1, plus les signes de 0x80 à 0x9F */
const CP1252: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, 'Œ': 0x8C, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, 'œ': 0x9C };

/** les octets du DXF, en Windows-1252 (un caractère hors de cette table devient « ? ») */
export function dxfOctets(t: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(t.length);
  let i = 0;
  for (const c of t) {
    const k = c.codePointAt(0)!;
    out[i++] = CP1252[c] ?? (k < 256 ? k : 0x3F);
  }
  return out.slice(0, i);
}
