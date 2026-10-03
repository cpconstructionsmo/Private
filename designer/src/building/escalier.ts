/* L'escalier : ses marches, sa trémie et ses contrôles, calculés depuis la
   hauteur à franchir jusqu'au niveau du dessus — le modèle ne garde que le
   départ, le sens, la largeur et la forme (ADR-0002 : ce qui se calcule
   n'est jamais stocké). Changer la hauteur d'un niveau redessine donc
   l'escalier.

   - Hauteur de marche : la hauteur à franchir partagée en marches de
     190 mm au plus ; giron par la formule de Blondel (2 h + g ≈ 630 mm),
     ou celui imposé. Hors fourchette (600–650), une alerte le dit.
   - Forme : droit, ou quart tournant avec un palier carré au milieu.
   - Trémie : le vide à ouvrir dans le plancher du dessus, au-dessus des
     marches qui n'auraient pas 2 m d'échappée sous ce plancher.

   Repère de l'escalier : origine au milieu du nez de la première marche,
   y dans le sens de la montée, x vers la droite en montant. */
import type { Floor, Mm, Point, Project, Stair } from '../model/types';
import { BLONDEL, ECHAPPEE, MARCHE_MAX } from '../geometry/tolerance';

/** épaisseur de plancher prise pour l'échappée et un dernier niveau (mm) — la même que la maquette */
export const EPAISSEUR_PLANCHER_ESCALIER = 200;

export interface Marche {
  /** le contour en plan */
  contour: Point[];
  /** le dessus de la marche, au-dessus du sol du départ */
  z: Mm;
  /** le palier d'un quart tournant */
  palier?: boolean;
}

export interface GeometrieEscalier {
  hauteur: Mm;
  /** nombre de hauteurs de marche (contremarches) ; la dernière arrive sur le plancher du dessus */
  contremarches: number;
  hauteurMarche: Mm;
  giron: Mm;
  marches: Marche[];
  /** l'emprise au sol, et la trémie à ouvrir au-dessus (null : aucune) */
  emprise: Point[];
  tremie: Point[] | null;
  /** la ligne de foulée, du départ à l'arrivée */
  foulee: Point[];
  blondel: Mm;
  alertes: string[];
}

/** la hauteur à franchir depuis un niveau : jusqu'au sol du niveau du dessus, sinon sa hauteur et un plancher */
export function hauteurAFranchir(p: Project, f: Floor): Mm {
  const b = p.buildings.find(x => x.floors.some(y => y.id === f.id));
  const dessus = b?.floors.filter(x => x.elevation > f.elevation).sort((a, c) => a.elevation - c.elevation)[0];
  return dessus ? dessus.elevation - f.elevation : f.height + EPAISSEUR_PLANCHER_ESCALIER;
}

/** le niveau où arrive un escalier (null : il n'y en a pas au-dessus) */
export function niveauDArrivee(p: Project, f: Floor): Floor | null {
  const b = p.buildings.find(x => x.floors.some(y => y.id === f.id));
  return b?.floors.filter(x => x.elevation > f.elevation).sort((a, c) => a.elevation - c.elevation)[0] ?? null;
}

const versPlan = (s: Pick<Stair, 'position' | 'rotation'>, p: Point): Point => {
  const c = Math.cos(s.rotation), n = Math.sin(s.rotation);
  return { x: s.position.x + p.x * c - p.y * n, y: s.position.y + p.x * n + p.y * c };
};
const rect = (x0: Mm, y0: Mm, x1: Mm, y1: Mm): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

export function geometrieEscalier(s: Stair, hauteur: Mm): GeometrieEscalier {
  const n = Math.max(2, Math.ceil(hauteur / MARCHE_MAX - 1e-9)), h = hauteur / n;
  const g = s.going ?? Math.round(Math.min(320, Math.max(220, BLONDEL.cible - 2 * h)));
  const w = s.width, demi = w / 2, alertes: string[] = [];
  const bl = Math.round(2 * h + g);
  if (bl < BLONDEL.min || bl > BLONDEL.max) alertes.push('Blondel : 2 h + g = ' + bl + ' mm, hors de 600 à 650 mm (marches peu confortables)');
  if (w < 800) alertes.push('Emmarchement de ' + w + ' mm : moins de 80 cm, étroit pour un escalier principal');
  /* dans le repère de l'escalier : les girons (n − 1), la dernière contremarche arrive au plancher du dessus */
  const local: { contour: Point[]; palier?: boolean }[] = [];
  const nb = n - 1;
  if (s.kind === 'straight') {
    for (let i = 0; i < nb; i++) local.push({ contour: rect(-demi, i * g, demi, (i + 1) * g) });
  } else {
    /* quart tournant : une première volée, un palier carré, une seconde volée tournée d'un quart */
    const a = Math.floor((nb - 1) / 2), sens = s.kind === 'quarter_left' ? -1 : 1;
    for (let i = 0; i < a; i++) local.push({ contour: rect(-demi, i * g, demi, (i + 1) * g) });
    local.push({ contour: rect(-demi, a * g, demi, a * g + w), palier: true });
    for (let j = 0; j < nb - 1 - a; j++) {
      const x0 = sens * (demi + j * g), x1 = sens * (demi + (j + 1) * g);
      local.push({ contour: rect(Math.min(x0, x1), a * g, Math.max(x0, x1), a * g + w) });
    }
  }
  const marches: Marche[] = local.map((m, i) => ({ contour: m.contour.map(p => versPlan(s, p)), z: (i + 1) * h, ...(m.palier ? { palier: true } : {}) }));
  /* l'emprise : le contour de toutes les marches (une ou deux volées et le palier) */
  const xs = local.flatMap(m => m.contour.map(p => p.x));
  const emprise = s.kind === 'straight' ? rect(-demi, 0, demi, nb * g).map(p => versPlan(s, p))
    : (() => {
      const a = Math.floor((nb - 1) / 2), Y = a * g, X = s.kind === 'quarter_left' ? Math.min(...xs) : Math.max(...xs), sens = s.kind === 'quarter_left' ? -1 : 1;
      const P = sens < 0 ? [{ x: -demi, y: 0 }, { x: demi, y: 0 }, { x: demi, y: Y + w }, { x: X, y: Y + w }, { x: X, y: Y }, { x: -demi, y: Y }]
        : [{ x: -demi, y: 0 }, { x: demi, y: 0 }, { x: demi, y: Y }, { x: X, y: Y }, { x: X, y: Y + w }, { x: -demi, y: Y + w }];
      return P.map(p => versPlan(s, p));
    })();
  /* la trémie : au-dessus des marches dont le dessus, plus l'échappée, passerait au-dessus du dessous du plancher */
  const sousPlancher = hauteur - EPAISSEUR_PLANCHER_ESCALIER;
  const sous = local.map((m, i) => ({ m, z: (i + 1) * h })).filter(x => x.z + ECHAPPEE > sousPlancher);
  let tremie: Point[] | null = null;
  if (sous.length) {
    const X = sous.flatMap(x => x.m.contour.map(p => p.x)), Y = sous.flatMap(x => x.m.contour.map(p => p.y));
    /* une trémie rectangulaire qui englobe ces marches (et le palier qu'elles touchent), jusqu'à l'arrivée */
    tremie = rect(Math.min(...X), Math.min(...Y), Math.max(...X), Math.max(...Y)).map(p => versPlan(s, p));
  }
  const centre = (c: Point[]) => ({ x: c.reduce((t, p) => t + p.x, 0) / c.length, y: c.reduce((t, p) => t + p.y, 0) / c.length });
  const foulee = [versPlan(s, { x: 0, y: 0 }), ...marches.map(m => centre(m.contour))];
  return { hauteur, contremarches: n, hauteurMarche: h, giron: g, marches, emprise, tremie, foulee, blondel: bl, alertes };
}

/** les escaliers qui arrivent sur un niveau (posés sur le niveau du dessous) : la trémie à ouvrir dans
    son plancher, et les marches qu'on voit dedans depuis cet étage */
export function tremiesDuNiveau(p: Project, f: Floor): { contour: Point[]; marches: Marche[] }[] {
  const out: { contour: Point[]; marches: Marche[] }[] = [];
  for (const b of p.buildings) for (const g of b.floors) {
    if (niveauDArrivee(p, g)?.id !== f.id) continue;
    for (const o of Object.values(g.objects)) {
      if (o.type !== 'stair') continue;
      const G = geometrieEscalier(o, hauteurAFranchir(p, g));
      if (G.tremie) out.push({ contour: G.tremie, marches: G.marches.filter(m => m.z + ECHAPPEE > G.hauteur - EPAISSEUR_PLANCHER_ESCALIER) });
    }
  }
  return out;
}
