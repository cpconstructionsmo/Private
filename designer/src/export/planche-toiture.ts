/* Le plan de toiture (PCMI 5), comme celui des dossiers du cabinet : les
   pans gris (plus ou moins clairs selon leur orientation), rayés de leurs
   rangs parallèles à l'égout ; faîtages en trait fort, arêtiers en trait
   fin, noues en tirets bleus, égout doublé de la gouttière, le nu extérieur
   des murs en tirets dessous ; une flèche « 35° » par pan, chaque faîtage
   coté (« Faîtage +6,25 », son altitude NGF) ; deux chaînes de cotes par
   côté (débords compris) ; le texte « Couverture », la légende, le nord et
   l'échelle posés dans les vides. Tout se déduit de la toiture calculée. */
import type { Floor, Point, Project, Roof } from '../model/types';
import { toitureDuNiveau, planDuNiveau, lignesDeToiture, eauxPluviales, fenetresDeToit, lucarnesDuNiveau, parcelleDuProjet, GOUTTIERES, MATIERES_GOUTTIERE, LUCARNES, NOMS_LIGNES, FINITIONS_EGOUT, type ChaineCotes, type Cote4, type Toiture, type GenreLigne } from '../building';
import { centroide } from '../geometry/polygon';
import type { PagePdf, DocumentPdf } from './pdf';
import { PT, X, Y, ZONE_DESSIN, ENCRE, GRIS_TEXTE, BRIQUE, Occupation, colonne, nouvelleFeuille, titrePlanche, texte, metres, niveauRelatif, nordFleche, echelleGraphique, largeurEchelle,
  legende, tailleLegende, pastilleTrait, couper, type Signature, type LigneLegende } from './feuille';
import { ECHELLES, chainesDeCotes } from './planche-niveau';
import { PagePdf as Page } from './pdf';

export interface OptionsToiture extends Signature { echelle?: number | undefined; dossier?: boolean | undefined }

const COUVERTURES_FR: Record<Roof['covering'], string> = { tile: 'Tuiles', slate: 'Ardoises', zinc: 'Zinc', steel: 'Bac acier', green: 'Toiture végétalisée', gravel: 'Toit-terrasse gravillonné' };
const TYPES_FR: Record<Roof['kind'], string> = { hip: 'Toiture à croupes', gable: 'Toiture à deux pans', shed: 'Toiture à un pan', flat: 'Toit-terrasse' };
const NOUE = '#2C5B8A', EP = '#2C5B8A';
const PREMIERE = 10, ECART = 8;

/** les toitures du projet, avec leur objet et le niveau qui les porte */
export function toituresDuProjet(projet: Project): { f: Floor; roof: Roof; t: Toiture }[] {
  const out: { f: Floor; roof: Roof; t: Toiture }[] = [];
  for (const f of projet.buildings.flatMap(b => b.floors)) {
    const roof = Object.values(f.objects).find((x): x is Roof => x.type === 'roof'), r = toitureDuNiveau(f);
    if (roof && r?.ok) for (const t of r.toitures) out.push({ f, roof, t });
  }
  return out;
}

/** une teinte de gris selon l'orientation du pan : éclairé du haut à gauche du plan */
export function grisDuPan(a: number, b: number): string {
  const g = Math.hypot(a, b);
  if (g < 1e-9) return '#D9DCE0';
  const d = { x: -a / g, y: -b / g }, l = { x: -Math.SQRT1_2, y: Math.SQRT1_2 }, k = (d.x * l.x + d.y * l.y + 1) / 2;       // 0 (dos à la lumière) à 1
  const v = Math.round(0xC0 + (0xE6 - 0xC0) * k), h = v.toString(16).padStart(2, '0'), h2 = Math.min(255, v + 3).toString(16).padStart(2, '0');
  return '#' + h + h + h2;
}

export function plancheToiture(doc: DocumentPdf, projet: Project, o: OptionsToiture): void {
  const T = toituresDuProjet(projet);
  if (!T.length) return;
  const page = nouvelleFeuille(doc);
  const P0 = T.flatMap(x => x.t.egout);
  const B = { xmin: Math.min(...P0.map(p => p.x)), xmax: Math.max(...P0.map(p => p.x)), ymin: Math.min(...P0.map(p => p.y)), ymax: Math.max(...P0.map(p => p.y)) };
  /* deux chaînes par côté : les décrochés de l'égout, le hors tout */
  const CH: ChaineCotes[] = [];
  const reunir = (v: number[]) => { const s = [...v].sort((a, b) => a - b), r: number[] = []; for (const x of s) if (!r.length || x - r[r.length - 1]! > 30) r.push(x); return r };
  for (const c of ['haut', 'bas', 'gauche', 'droite'] as const) {
    const h = c === 'haut' || c === 'bas', d = reunir(P0.map(p => (h ? p.x : p.y))), tout = h ? [B.xmin, B.xmax] : [B.ymin, B.ymax];
    let rang = 0;
    if (d.length > 2) CH.push({ cote: c, rang: rang++, genre: 'decroches', reperes: d, ligne: 0 });
    CH.push({ cote: c, rang, genre: 'hors_tout', reperes: tout, ligne: 0 });
  }
  const nb = (c: Cote4) => CH.filter(x => x.cote === c).length;
  const marge = (c: Cote4) => PREMIERE + ECART * (nb(c) - 1) + 4;
  const zone = { x: ZONE_DESSIN.x + 3, y: ZONE_DESSIN.y + 3, l: ZONE_DESSIN.l - 6, h: ZONE_DESSIN.h - 6 };
  const TITRE = { x0: ZONE_DESSIN.x, y0: ZONE_DESSIN.y + ZONE_DESSIN.h - 15, x1: ZONE_DESSIN.x + 175, y1: ZONE_DESSIN.y + ZONE_DESSIN.h };
  const Bw = B.xmax - B.xmin, Bh = B.ymax - B.ymin;
  const tient = (e: number) => Bw / e + marge('gauche') + marge('droite') <= zone.l && Bh / e + marge('haut') + marge('bas') <= zone.h - 6;

  /* le texte « Couverture » et la légende */
  const roof = T[0]!.roof, t0 = T.map(x => x.t), egoutZ = Math.min(...t0.map(x => x.egoutZ));
  const ngf0 = parcelleDuProjet(projet)?.plot.groundFloorNgf, ngf = (z: number) => (ngf0! + z / 1000).toFixed(2).replace('.', ',');
  const D = projet.dossier ?? {};
  const lignesCouv = [
    D.couverture?.trim() || COUVERTURES_FR[roof.covering],
    TYPES_FR[roof.kind] + (roof.kind !== 'flat' ? ', pente ' + roof.pitch + '° (' + Math.round(Math.tan(roof.pitch * Math.PI / 180) * 100) + ' %) sur tous les pans' : ''),
    'Égout à ' + niveauRelatif(egoutZ) + (ngf0 !== undefined ? ' (' + ngf(egoutZ) + ' NGF)' : '') + ' sur toutes les façades, débord ' + metres(roof.overhang),
    ...(roof.gutter ? [roof.gutter === 'none' ? 'Sans gouttière' : 'Gouttières ' + GOUTTIERES[roof.gutter].toLowerCase() + (roof.gutterMaterial ? ' et descentes EP ' + MATIERES_GOUTTIERE[roof.gutterMaterial] : '')] : ['Gouttières et descentes : à choisir']),
  ].flatMap(l => couper(l, 82 * PT, 7.2));
  const EPs = T.filter((x, i) => T.findIndex(z => z.f.id === x.f.id) === i).flatMap(x => { const e = eauxPluviales(x.f); return e ? [e] : [] });
  /* la toiture en chiffres : surface, lucarnes et fenêtres de toit, longueurs des lignes, finition d'égout, descentes */
  const niveauxToit = T.filter((x, i) => T.findIndex(z => z.f.id === x.f.id) === i).map(x => x.f);
  const LU = niveauxToit.flatMap(f => lucarnesDuNiveau(f)), FT = niveauxToit.flatMap(f => fenetresDeToit(f));
  const somme = (g: GenreLigne) => EPs.reduce((s2, e) => s2 + e.longueurs[g], 0);
  const chiffres: [string, string][] = [
    ['Surface de couverture', (t0.reduce((s2, x) => s2 + x.surfaceCouverture, 0) / 1e6).toFixed(2).replace('.', ',') + ' m²'],
    ...(LU.length ? [['Lucarnes', LU.length + ' (' + [...new Set(LU.map(x => LUCARNES[x.o.kind].replace(/ \(.*/, '').toLowerCase()))].join(', ') + ')'] as [string, string]] : []),
    ...(FT.length ? [['Fenêtres de toit', FT.length + ' (' + [...new Set(FT.map(x => x.o.width / 10 + ' × ' + x.o.height / 10))].join(', ') + ' cm)'] as [string, string]] : []),
    ...(['egout', 'faitage', 'aretier', 'noue', 'rive'] as const).filter(g => somme(g) > 0).map(g => [NOMS_LIGNES[g], metres(somme(g)) + ' m'] as [string, string]),
    ...(roof.eavesFinish ? [['Finition d’égout', FINITIONS_EGOUT[roof.eavesFinish]] as [string, string]] : []),
    ...(roof.gutter && roof.gutter !== 'none' ? [['Descentes (EP)', String(EPs.reduce((s2, e) => s2 + e.descentes.length, 0)) || 'à placer'] as [string, string]] : []),
  ];
  const aNoue = T.some(x => lignesDeToiture(x.t).some(l => l.genre === 'noue'));
  const L: LigneLegende[] = [
    { pastille: pastilleTrait(ENCRE, 1.1), texte: 'Faîtage' },
    { pastille: pastilleTrait(ENCRE, 0.5), texte: 'Arêtier' },
    ...(aNoue ? [{ pastille: pastilleTrait(NOUE, 0.5, [1.6, 1]), texte: 'Noue' }] : []),
    { pastille: (pg: PagePdf, x: number, y: number) => { pg.trait(X(x), Y(y + 1), X(x + 7), Y(y + 1), 1.2, ENCRE); pg.trait(X(x), Y(y + 2.3), X(x + 7), Y(y + 2.3), 0.35, ENCRE) }, texte: 'Égout et gouttière' },
    { pastille: pastilleTrait('#6A6A6A', 0.35, [1.6, 1]), texte: 'Nu extérieur des murs (sous toiture)' },
    { pastille: (pg: PagePdf, x: number, y: number) => fleche(pg, [x, y + 1.5], [x + 7, y + 1.5]), texte: 'Sens de la pente' },
    ...(EPs.some(e => e.descentes.length) ? [{ pastille: (pg: PagePdf, x: number, y: number) => pg.cercle(X(x + 2), Y(y + 1.5), 1.1 * PT, { trait: ENCRE, ep: 0.5, fond: '#FFFFFF' }), texte: 'Descente d’eaux pluviales' }] : []),
  ];
  const tl = tailleLegende('LÉGENDE', L), blocL = Math.max(84, tl.l), blocH = 6 + lignesCouv.length * 3.6 + 2 + chiffres.length * 3.6 + 4 + tl.h;

  const candidates = o.echelle ? [o.echelle] : ECHELLES.filter(tient);
  if (!candidates.length) candidates.push(ECHELLES[ECHELLES.length - 1]!);
  type Place = { x: number; y: number } | null;
  let choix: { ech: number; x0: number; y0: number; bloc: Place; nord: Place; echelle: Place } | null = null;
  for (const ech of candidates) {
    const W = Bw / ech, H = Bh / ech;
    const x0 = zone.x + marge('gauche') + (zone.l - W - marge('gauche') - marge('droite')) / 2;
    let y0 = zone.y + marge('haut') + (zone.h - H - marge('haut') - marge('bas')) / 2;
    const bas = y0 + H + marge('bas');
    if (bas > TITRE.y0 && x0 - marge('gauche') < TITRE.x1) y0 -= Math.min(bas - TITRE.y0, y0 - marge('haut') - zone.y);
    const P = (p: Point): [number, number] => [x0 + (p.x - B.xmin) / ech, y0 + (B.ymax - p.y) / ech];
    const occ = new Occupation(zone);
    occ.rectangle(TITRE.x0, TITRE.y0, TITRE.x1, TITRE.y1);
    for (const x of T) occ.polygone(x.t.egout.map(P), 3);
    for (const c of ['haut', 'bas', 'gauche', 'droite'] as const) {
      const d = PREMIERE + ECART * (nb(c) - 1) + 4;
      if (c === 'haut') occ.rectangle(x0, y0 - d, x0 + W, y0 - PREMIERE + 4.5);
      if (c === 'bas') occ.rectangle(x0, y0 + H + PREMIERE - 4.5, x0 + W, y0 + H + d);
      if (c === 'gauche') occ.rectangle(x0 - d, y0, x0 - PREMIERE + 4.5, y0 + H);
      if (c === 'droite') occ.rectangle(x0 + W + PREMIERE - 4.5, y0, x0 + W + d, y0 + H);
    }
    const Z = occ.zone;
    const bloc = occ.placer(blocL, blocH, [{ x: Z.x, y: Z.y, coin: 'hg' }, { x: Z.x + Z.l, y: Z.y, coin: 'hd' }, { x: Z.x, y: Z.y + Z.h, coin: 'bg' }, { x: Z.x + Z.l, y: Z.y + Z.h, coin: 'bd' }]);
    if (bloc) occ.rectangle(bloc.x, bloc.y, bloc.x + blocL, bloc.y + blocH, 3);
    const nord = occ.placer(18, 18, [...(bloc ? [{ x: bloc.x + blocL, y: bloc.y + blocH + 4, coin: 'hd' as const }] : []), { x: Z.x + Z.l, y: Z.y, coin: 'hd' as const }]);
    if (nord) occ.rectangle(nord.x, nord.y, nord.x + 18, nord.y + 18, 2);
    const echelle = occ.placer(largeurEchelle(ech) + 2, 12, [{ x: x0 + W / 2, y: y0 + H + marge('bas') + 2, coin: 'hg' }, { x: Z.x + Z.l, y: Z.y + Z.h, coin: 'bd' }]);
    choix = { ech, x0, y0, bloc, nord, echelle };
    if (bloc && echelle) break;
  }
  const { ech, x0, y0, bloc, nord, echelle } = choix!;
  const W = Bw / ech, H = Bh / ech;
  const Pm = (p: Point): [number, number] => [x0 + (p.x - B.xmin) / ech, y0 + (B.ymax - p.y) / ech];
  const E = (p: Point): [number, number] => { const [x, y] = Pm(p); return [X(x), Y(y)] };

  for (const { f, roof: r, t } of T) {
    if (t.terrasse) {
      page.polygone(t.terrasse.dalle.map(E), { fond: '#D9DCE0', trait: ENCRE, ep: 0.8 });
      for (const a of t.terrasse.acrotere) page.polygone(a.contour.map(E), { fond: '#FFFFFF', trait: ENCRE, ep: 0.5 });
      const c = E(centroide(t.terrasse.dalle));
      page.texte('Toit-terrasse : pente d’évacuation à préciser', c[0], c[1], 7.5, { aligne: 'centre' });
      continue;
    }
    /* les pans, leurs rangs parallèles à l'égout */
    for (const pan of t.pans) {
      const Q = pan.contour.map(E);
      page.polygone(Q, { fond: grisDuPan(pan.plan.a, pan.plan.b) });
      const g = Math.hypot(pan.plan.a, pan.plan.b);
      if (g > 1e-9) {
        const d = { x: pan.plan.a / g, y: pan.plan.b / g }, s = { x: -d.y, y: d.x };       // vers le haut de la pente, et le long de l'égout
        const proj = pan.contour.map(q => q.x * d.x + q.y * d.y), long = pan.contour.map(q => q.x * s.x + q.y * s.y);
        const v0 = Math.min(...proj), v1 = Math.max(...proj), w0 = Math.min(...long), w1 = Math.max(...long), pas = 1.9 * ech;
        page.decouper(Q);
        for (let v = v0 + pas; v < v1; v += pas) {
          const a = E({ x: d.x * v + s.x * w0, y: d.y * v + s.y * w0 }), b = E({ x: d.x * v + s.x * w1, y: d.y * v + s.y * w1 });
          page.trait(a[0], a[1], b[0], b[1], 0.25, '#8C939A');
        }
        page.restaurer();
      }
    }
    /* le nu extérieur des murs, sous la toiture */
    for (const m of planDuNiveau(f).maconnerie) page.polygone(m.contour.map(E), { trait: '#6A6A6A', ep: 0.35, tirets: [3, 2] });
    /* fenêtres de toit et lucarnes */
    for (const { geo } of fenetresDeToit(f)) { const C = geo.plan.map(E); page.polygone(C, { fond: '#C9DCE7', trait: ENCRE, ep: 0.6 }); page.trait(C[0]![0], C[0]![1], C[2]![0], C[2]![1], 0.3); page.trait(C[1]![0], C[1]![1], C[3]![0], C[3]![1], 0.3) }
    for (const { geo } of lucarnesDuNiveau(f)) { for (const Tt of geo.toits) page.polygone(Tt.map(E), { fond: '#CDD1D6', trait: ENCRE, ep: 0.5 }); const a = E(geo.plan[0]!), b = E(geo.plan[1]!); page.trait(a[0], a[1], b[0], b[1], 1.6) }
    /* les lignes : faîtages, arêtiers, noues ; l'égout doublé de la gouttière */
    const LT = lignesDeToiture(t);
    for (const l of LT) {
      const a = E(l.a), b = E(l.b);
      if (l.genre === 'faitage') page.trait(a[0], a[1], b[0], b[1], 1.1, ENCRE);
      else if (l.genre === 'aretier') page.trait(a[0], a[1], b[0], b[1], 0.55, ENCRE);
      else if (l.genre === 'noue') page.trait(a[0], a[1], b[0], b[1], 0.5, NOUE, [1.6, 1]);
      else if (l.genre === 'rive') page.trait(a[0], a[1], b[0], b[1], 0.9, ENCRE);
    }
    page.polygone(t.egout.map(E), { trait: ENCRE, ep: 1.2 });
    if (r.gutter && r.gutter !== 'none') page.polygone(decaler(t.egout, 0.9 * ech).map(E), { trait: ENCRE, ep: 0.35 });
    for (const pg of t.pignons) { const Q = pg.points.map(E); const xs = Q.map(q => q[0]), ys = Q.map(q => q[1]); const i0 = xs.indexOf(Math.min(...xs)), i1 = xs.indexOf(Math.max(...xs)); const [p0, p1] = Math.max(...xs) - Math.min(...xs) > Math.max(...ys) - Math.min(...ys) ? [Q[i0]!, Q[i1]!] : [Q[ys.indexOf(Math.min(...ys))]!, Q[ys.indexOf(Math.max(...ys))]!]; page.trait(p0[0], p0[1], p1[0], p1[1], 2) }
    /* une flèche « 35° » au milieu de chaque pan, vers l'égout */
    for (const pan of t.pans) {
      const g = Math.hypot(pan.plan.a, pan.plan.b);
      if (g < 1e-6) continue;
      const c = centroide(pan.contour), d = { x: -pan.plan.a / g, y: -pan.plan.b / g }, L2 = 4.5 * ech;
      const a = Pm({ x: c.x - d.x * L2, y: c.y - d.y * L2 }), b = Pm({ x: c.x + d.x * L2, y: c.y + d.y * L2 });
      fleche(page, a, b);
      const lib = Math.round(Math.atan(g) * 180 / Math.PI) + '°', lw = Page.largeur(lib, 6.8, { gras: true }) / PT;
      const vertical = Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]), lx = vertical ? (a[0] + b[0]) / 2 + 2.6 : (a[0] + b[0]) / 2 - lw / 2, ly = vertical ? (a[1] + b[1]) / 2 + 1.2 : Math.min(a[1], b[1]) - 2.2;
      page.cadre(X(lx - 0.8), Y(ly + 1), (lw + 1.6) * PT, 3.6 * PT, { ep: 0, fond: '#FFFFFF' });
      texte(page, lib, lx, ly, 6.8, { gras: true, couleur: '#222222' });
    }
    /* les faîtages cotés, en brique, le long de leur ligne */
    for (const l of faitagesReunis(LT)) {
      const a = Pm(l.a), b = Pm(l.b), z = Math.max(l.a.z, l.b.z);
      let ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180 / Math.PI;
      if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const m: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const t1 = 'Faîtage ' + niveauRelatif(z), t2 = ngf0 !== undefined ? ngf(z) + ' NGF' : '';
      const lw = Math.max(Page.largeur(t1, 6.8, { gras: true }), Page.largeur(t2, 5.6)) / PT + 2;
      const r2 = ang * Math.PI / 180, ux = Math.cos(r2), uy = -Math.sin(r2), nx = -uy, ny = ux;                  // le long du faîtage, et vers le bas du texte (mm)
      const C = (u: number, v: number): [number, number] => [X(m[0] + ux * u + nx * v), Y(m[1] + uy * u + ny * v)];
      page.polygone([C(-lw / 2, -4), C(lw / 2, -4), C(lw / 2, t2 ? 3.4 : 0.8), C(-lw / 2, t2 ? 3.4 : 0.8)], { fond: '#FFFFFF' });
      const [tx, ty] = C(0, -1.2), [sx, sy] = C(0, 2.2);
      page.texte(t1, tx, ty, 6.8, { gras: true, couleur: BRIQUE, aligne: 'centre', angle: ang });
      if (t2) page.texte(t2, sx, sy, 5.6, { couleur: BRIQUE, aligne: 'centre', angle: ang });
    }
  }
  /* les descentes d'eaux pluviales */
  for (const e of EPs) for (const d of e.descentes) {
    const [cx, cy] = Pm(d.point);
    page.cercle(X(cx), Y(cy), 1.1 * PT, { trait: d.ok ? ENCRE : '#C5563A', ep: 0.5, fond: '#FFFFFF' });
    texte(page, 'EP', cx + 1.6, cy + 3.6, 6, { gras: true, couleur: EP });
  }
  /* les cotes */
  chainesDeCotes(page, T[0]!.f, CH, Pm, { x0, y0, W, H });
  /* le texte, la légende, le nord, l'échelle */
  if (bloc) {
    texte(page, 'COUVERTURE', bloc.x, bloc.y + 3, 9, { gras: true, couleur: '#222222' });
    lignesCouv.forEach((l, i) => texte(page, l, bloc.x, bloc.y + 7.5 + i * 3.6, 7.2, { couleur: GRIS_TEXTE }));
    const yc = bloc.y + 7.5 + lignesCouv.length * 3.6 + 1;
    chiffres.forEach(([k, v], i) => { texte(page, k, bloc.x, yc + i * 3.6, 6.8, { couleur: GRIS_TEXTE }); texte(page, v, bloc.x + 82, yc + i * 3.6, 6.8, { gras: true, aligne: 'droite', couleur: '#222222' }) });
    legende(page, bloc.x, yc + chiffres.length * 3.6 + 1, 'LÉGENDE', L);
  }
  if (nord) nordFleche(page, nord.x + 8, nord.y + 9, parcelleDuProjet(projet)?.plot.north ?? 0);
  if (echelle) echelleGraphique(page, ech, echelle.x, echelle.y + 4);
  titrePlanche(page, 'PLAN DE TOITURE', 'Cotes des faîtages par rapport au niveau fini du RDC' + (ngf0 !== undefined ? ' (±0,00 = ' + ngf(0) + ' NGF)' : '') + ' – même orientation que le plan du rez-de-chaussée');
  colonne(page, projet, o, 'Plan de', 'toiture', o.dossier ? 'PCMI 5' : 'Toiture', ech);
}

/** les faîtages, un par ligne : les tronçons alignés à la même hauteur réunis (le calcul les découpe aux arêtiers) ;
    les tronçons de moins de 80 cm, sauf s'ils sont seuls à leur hauteur, ne sont pas cotés */
export function faitagesReunis(L: ReturnType<typeof lignesDeToiture>): { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } }[] {
  const G = new Map<string, { d: { x: number; y: number }; t0: number; t1: number; o: { x: number; y: number }; z: number }>();
  for (const l of L) {
    if (l.genre !== 'faitage') continue;
    const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, n = Math.hypot(dx, dy);
    if (n < 1) continue;
    let d = { x: dx / n, y: dy / n };
    if (d.x < -1e-9 || (Math.abs(d.x) < 1e-9 && d.y < 0)) d = { x: -d.x, y: -d.y };
    const off = l.a.x * -d.y + l.a.y * d.x, z = Math.round(Math.max(l.a.z, l.b.z) / 20);
    const k = z + '|' + Math.round(Math.atan2(d.y, d.x) * 180 / Math.PI) + '|' + Math.round(off / 50);
    const t0 = l.a.x * d.x + l.a.y * d.y, t1 = l.b.x * d.x + l.b.y * d.y;
    const g = G.get(k);
    if (g) { g.t0 = Math.min(g.t0, t0, t1); g.t1 = Math.max(g.t1, t0, t1) }
    else G.set(k, { d, t0: Math.min(t0, t1), t1: Math.max(t0, t1), o: { x: -d.y * off, y: d.x * off }, z: Math.max(l.a.z, l.b.z) });
  }
  const R = [...G.values()].map(g => ({ a: { x: g.o.x + g.d.x * g.t0, y: g.o.y + g.d.y * g.t0, z: g.z }, b: { x: g.o.x + g.d.x * g.t1, y: g.o.y + g.d.y * g.t1, z: g.z }, l: g.t1 - g.t0 }));
  return R.filter(r => r.l >= 800 || !R.some(q => q !== r && Math.abs(q.a.z - r.a.z) < 20 && q.l >= 800));
}

/** une flèche pleine, de a vers b (mm) */
function fleche(page: PagePdf, a: [number, number], b: [number, number]): void {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  page.trait(X(a[0]), Y(a[1]), X(b[0] - ux * 1.5), Y(b[1] - uy * 1.5), 0.5, ENCRE);
  page.polygone([[X(b[0]), Y(b[1])], [X(b[0] - ux * 2.4 - uy * 1), Y(b[1] - uy * 2.4 + ux * 1)], [X(b[0] - ux * 2.4 + uy * 1), Y(b[1] - uy * 2.4 - ux * 1)]], { fond: ENCRE });
}

/** un anneau décalé vers l'extérieur de « d » (mm du plan) : l'égout, puis la gouttière */
function decaler(A: readonly Point[], d: number): Point[] {
  let s = 0;
  A.forEach((p, i) => { const q = A[(i + 1) % A.length]!; s += p.x * q.y - q.x * p.y });
  const sens = s > 0 ? 1 : -1, n = A.length;
  return A.map((p, i) => {
    const a = A[(i + n - 1) % n]!, b = A[(i + 1) % n]!;
    const n1 = normale(a, p, sens), n2 = normale(p, b, sens), m = { x: n1.x + n2.x, y: n1.y + n2.y }, lm = Math.hypot(m.x, m.y) || 1, k = d / Math.max(0.3, (m.x / lm) * n1.x + (m.y / lm) * n1.y);
    return { x: p.x + m.x / lm * k, y: p.y + m.y / lm * k };
  });
}
function normale(a: Point, b: Point, sens: number): Point {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  return { x: sens * dy / L, y: -sens * dx / L };
}
