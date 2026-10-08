/* Le plan de masse (PCMI 2), comme celui des dossiers du cabinet : la
   parcelle en vert, ses côtés cotés en rouge, ses bornes et les altitudes du
   terrain naturel ; la voie en gris le long de l'alignement ; la maison vue
   de dessus (sa toiture, ses faîtages cotés, l'emprise au nu des murs en
   tirets, le niveau du RDC encadré) ; les aménagements (pelouse, allées et
   stationnement gravillonnés, terrasse, clôtures), les arbres, les réseaux
   en tirets de couleur et leurs équipements, les prises de vue
   photographiques, les reculs en rouge ; à droite, la légende, le tableau
   « Surfaces et règles » et les notes sur le fond de plan.
   Tout se déduit de la parcelle et du projet : ce qui manque est écrit. */
import type { Point, Project, Landscape, ReglesPlu } from '../model/types';
import { controlePlu, surfacesDuTerrain, parcelleDuProjet, empriseAuSol, aireEmprise, surfaceTerrain, reculs, maisonDansParcelle, pointsDeVue, DEMI_CHAMP, placeEtiquette, surfacesReglementaires, toitureDuNiveau, lignesDeToiture, NOMS_RESEAUX, bilanAmenagements, metreTerrain, altitudeTerrain } from '../building';
import { GENRES_AMENAGEMENT } from '../catalogue/amenagements';
import { finitionAmenagement } from '../catalogue/amenagements';
import { NOMS_EQUIPEMENTS } from '../ui/dessin-terrain';
import { centroide } from '../geometry/polygon';
import { positionDansAnneau } from '../geometry/predicats';
import type { PagePdf, DocumentPdf } from './pdf';
import { PagePdf as Page } from './pdf';
import { PT, X, Y, ZONE_DESSIN, ENCRE, GRIS_TEXTE, colonne, nouvelleFeuille, texte, metres, niveauRelatif, nordFleche, echelleGraphique, largeurEchelle, legende, tailleLegende, pastille, pastilleTrait,
  tableau, couper, enM2, A_PRECISER, ROUGE_MANQUE, type Signature, type LigneLegende } from './feuille';
import { grisDuPan, faitagesReunis } from './planche-toiture';

export interface OptionsMasse extends Signature { echelle?: number | undefined; dossier?: boolean | undefined;
  /** « voie » (par défaut) : la feuille tournée pour que la voie soit en bas, comme sur les plans de masse du cabinet ;
   *  « maison » : le repère du plan (murs d'équerre avec la feuille) */
  orientation?: 'voie' | 'maison' | undefined }

const ECHELLES_MASSE = [100, 200, 250, 500, 1_000, 2_000] as const;
const BRUN_TF = '#8B4A2B', ROUGE = '#C0392B', PELOUSE = '#E3EBD3', VOIE = '#E1E1E1', GRAVIER = '#EFECE0', VERT = '#3F7A3A';

export function plancheMasse(doc: DocumentPdf, projet: Project, o: OptionsMasse): void {
  const t = parcelleDuProjet(projet);
  if (!t) return;
  const page = nouvelleFeuille(doc);
  const plot = t.plot, E = empriseAuSol(projet), R = reculs(plot, E), S = surfaceTerrain(plot), em = aireEmprise(E);
  const niveaux = projet.buildings.flatMap(b => b.floors);
  const amenagements = niveaux.flatMap(f => Object.values(f.objects)).filter((x): x is Landscape => x.type === 'landscape');
  const terrain = Object.values(t.niveau.objects);
  const toits = niveaux.flatMap(f => { const r = toitureDuNiveau(f); return r?.ok ? r.toitures : [] });
  const voies = plot.street.map(i => { const a = plot.contour[i]!, b = plot.contour[(i + 1) % plot.contour.length]!, L = Math.hypot(b.x - a.x, b.y - a.y) || 1, n = dehors(plot.contour, a, b); return { a, b, n, L } });
  /* la feuille tournée pour que la plus longue des voies soit en bas, sa limite horizontale (le nord tourne avec) :
     c'est ainsi qu'on lit un plan de masse, la rue devant soi ; le modèle, lui, ne bouge pas */
  const vp = [...voies].sort((p, q) => q.L - p.L)[0];
  let rot = vp && (o.orientation ?? 'voie') === 'voie' ? -Math.PI / 2 - Math.atan2(vp.n.y, vp.n.x) : 0;
  rot = Math.atan2(Math.sin(rot), Math.cos(rot));
  const centre = centroide(plot.contour), cr = Math.cos(rot), sr = Math.sin(rot);
  const vue = (p: Point): Point => ({ x: centre.x + (p.x - centre.x) * cr - (p.y - centre.y) * sr, y: centre.y + (p.x - centre.x) * sr + (p.y - centre.y) * cr });
  const rendre = (q: Point): Point => ({ x: centre.x + (q.x - centre.x) * cr + (q.y - centre.y) * sr, y: centre.y - (q.x - centre.x) * sr + (q.y - centre.y) * cr });
  /* la boîte : la parcelle, la voie (6 m devant l'alignement), les débords, les prises de vue */
  const P0: Point[] = [...plot.contour, ...toits.flatMap(x => x.egout)];
  const PV = pointsDeVue(projet);
  for (const v of voies) P0.push({ x: v.a.x + v.n.x * 6_000, y: v.a.y + v.n.y * 6_000 }, { x: v.b.x + v.n.x * 6_000, y: v.b.y + v.n.y * 6_000 });
  const Bv = (Q: Point[]) => { const V = Q.map(vue); return { xmin: Math.min(...V.map(p => p.x)), xmax: Math.max(...V.map(p => p.x)), ymin: Math.min(...V.map(p => p.y)), ymax: Math.max(...V.map(p => p.y)) } };
  const PANNEAU = 112, zone = { x: ZONE_DESSIN.x + 6, y: ZONE_DESSIN.y + 6, l: ZONE_DESSIN.l - PANNEAU - 16, h: ZONE_DESSIN.h - 26 };
  /* l'échelle d'abord (les symboles des prises de vue ont une taille fixe sur la feuille), puis la boîte qui les compte */
  const B0 = Bv(P0);
  const ech = o.echelle ?? (ECHELLES_MASSE.find(e => (B0.xmax - B0.xmin) / e + 24 <= zone.l && (B0.ymax - B0.ymin) / e + 24 <= zone.h) ?? ECHELLES_MASSE[ECHELLES_MASSE.length - 1]!);
  const cones = PV.map(v => ({ v, ...symboleVue(v, 9 * ech) }));
  for (const c of cones) P0.push(c.v.a, c.gauche, c.droite);
  const B = Bv(P0);
  const x0 = zone.x + (zone.l - (B.xmax - B.xmin) / ech) / 2, y0 = zone.y + (zone.h - (B.ymax - B.ymin) / ech) / 2;
  const Pm = (p: Point): [number, number] => { const q = vue(p); return [x0 + (q.x - B.xmin) / ech, y0 + (B.ymax - q.y) / ech] };
  const Pp = (p: Point): [number, number] => { const [a, b] = Pm(p); return [X(a), Y(b)] };
  /** un point de la feuille (mm) dans le repère tourné de la vue */
  const versVue = (px: number, py: number): Point => ({ x: (px - x0) * ech + B.xmin, y: B.ymax - (py - y0) * ech });
  /** l'angle (degrés, lisible : jamais la tête en bas) d'un texte posé le long de a → b sur la feuille */
  const angleFeuille = (a: Point, b: Point) => { const [ax, ay] = Pm(a), [bx, by] = Pm(b); let g = Math.atan2(-(by - ay), bx - ax) * 180 / Math.PI; if (g > 90.5) g -= 180; if (g < -89.5) g += 180; return Math.round(g * 10) / 10 || 0 };

  /* le fond cadastral, dans la zone du dessin seulement : les parcelles voisines au trait gris et leur référence,
     le bâti existant hachuré ; le terrain du projet n'y est pas redessiné (sa limite tracée le remplace) */
  const fc = plot.cadastre;
  if (fc) {
    const R: [number, number][] = [[X(ZONE_DESSIN.x + 1), Y(ZONE_DESSIN.y + 1)], [X(zone.x + zone.l + 6), Y(ZONE_DESSIN.y + 1)], [X(zone.x + zone.l + 6), Y(ZONE_DESSIN.y + ZONE_DESSIN.h - 14)], [X(ZONE_DESSIN.x + 1), Y(ZONE_DESSIN.y + ZONE_DESSIN.h - 14)]];
    page.decouper(R);
    for (const b of fc.batiments) {
      const Q = b.map(Pp);
      page.polygone(Q, { fond: '#E4E4E4' });
      page.decouper(Q);
      const xs = Q.map(q => q[0]), ys = Q.map(q => q[1]), h = Math.max(...ys) - Math.min(...ys);
      for (let x = Math.min(...xs) - h; x < Math.max(...xs); x += 2.2) page.trait(x, Math.min(...ys), x + h, Math.max(...ys), 0.25, '#9A9A9A');
      page.restaurer();
      page.polygone(Q, { trait: '#7A7A7A', ep: 0.35 });
    }
    for (const c of fc.parcelles) if (!c.terrain) page.polygone(c.contour.map(Pp), { trait: '#8F8F8F', ep: 0.35 });
    /* la référence au milieu de la partie visible de chaque parcelle voisine, si elle est assez grande
       (une voisine coupée par le cadre garde sa référence dans ce qu'on en voit) */
    const vus = new Set<string>(), cadre = { x0: ZONE_DESSIN.x + 4, x1: zone.x + zone.l, y0: ZONE_DESSIN.y + 4, y1: ZONE_DESSIN.y + ZONE_DESSIN.h - 18 };
    for (const c of fc.parcelles) {
      if (c.terrain || vus.has(c.reference)) continue;
      const V = dansRectangle(c.contour.map(q => { const [x, y] = Pm(q); return { x, y } }), cadre);
      if (V.length < 3) continue;
      const xs = V.map(q => q.x), ys = V.map(q => q.y);
      if (Math.max(...xs) - Math.min(...xs) < 14 || Math.max(...ys) - Math.min(...ys) < 6) continue;
      const { x: cx, y: cy } = centroide(V);
      vus.add(c.reference);
      texte(page, c.reference, cx, cy, 6.5, { italique: true, aligne: 'centre', couleur: '#8A8A8A' });
    }
    page.restaurer();
  }
  /* la voie, le long de l'alignement */
  for (const v of voies) {
    page.polygone([Pp(v.a), Pp(v.b), Pp({ x: v.b.x + v.n.x * 6_000, y: v.b.y + v.n.y * 6_000 }), Pp({ x: v.a.x + v.n.x * 6_000, y: v.a.y + v.n.y * 6_000 })], { fond: VOIE });
    if (plot.streetName) {
      const m = { x: (v.a.x + v.b.x) / 2 + v.n.x * 3_200, y: (v.a.y + v.b.y) / 2 + v.n.y * 3_200 }, [mx, my] = Pp(m);
      page.texte('— ' + plot.streetName + ' —', mx, my, 8, { gras: true, italique: true, aligne: 'centre', angle: angleFeuille(v.a, v.b), couleur: '#555555' });
    }
  }
  /* la parcelle */
  page.polygone(plot.contour.map(Pp), { fond: PELOUSE });
  /* les aménagements : surfaces teintées (gravillons pointillés), clôtures */
  for (const a of amenagements) {
    const f = finitionAmenagement(a.finish), Q = a.points.map(Pp);
    if (a.kind === 'fence') { page.ligne(a.closed ? [...Q, Q[0]!] : Q, 0.8, '#2F5A2A'); continue }
    const gravier = /gravier|gravillon|stabilis/i.test(f?.libelle ?? '') || a.kind === 'path' || a.kind === 'parking';
    page.polygone(Q, { fond: a.kind === 'green' ? '#D8E6C4' : a.kind === 'terrace' ? (f?.couleur ?? '#D9C3A0') : gravier ? GRAVIER : (f?.couleur ?? GRAVIER), trait: '#8A8A8A', ep: 0.3 });
    if (gravier && a.kind !== 'terrace') pointille(page, Q);
    const lib = a.kind === 'green' ? 'Pelouse' : a.kind === 'parking' ? 'Stationnement' : a.kind === 'path' ? 'Allée' + (f ? ' (' + f.libelle.toLowerCase() + ')' : '') : a.kind === 'terrace' ? 'Terrasse' : '';
    /* le nom dans la partie visible de l'aménagement : une allée tout autour de la maison a son centre sous le toit */
    const demi = { l: (Page.largeur(lib, 6.5, { italique: true }) / PT / 2 + 0.6) * ech, h: 1.8 * ech };
    const [cx, cy] = Pm(rendre(placeEtiquette(a.points.map(vue), [...E.map(q => q.contour.map(vue)), ...toits.map(tt => tt.egout.map(vue))], vue(centroide(a.points)), demi)));
    if (lib) texte(page, lib, cx, cy + 0.8, 6.5, { italique: true, aligne: 'centre', couleur: a.kind === 'green' ? VERT : GRIS_TEXTE });
  }
  /* les réseaux et leurs équipements */
  for (const x of terrain) {
    if (x.type === 'network') { const N = NOMS_RESEAUX[x.kind]; page.ligne(x.points.map(Pp), 0.6, N.couleur, [2, 1.2]); const m = x.points[Math.floor(x.points.length / 2)]!, [mx, my] = Pm(m); texte(page, N.code + (x.spec?.trim() ? ' ' + x.spec.trim() : ''), mx + 1.5, my - 1, 6, { gras: true, couleur: N.couleur }) }
    if (x.type === 'network_item') { const [px, py] = Pm(x.position), N = NOMS_EQUIPEMENTS[x.kind]; if (x.kind === 'infiltration') { page.cercle(X(px), Y(py), 1.8 * PT, { trait: '#2E7DBA', ep: 0.6, fond: '#FFFFFF' }); page.cercle(X(px), Y(py), 0.9 * PT, { trait: '#2E7DBA', ep: 0.5 }) } else page.cadre(X(px - 1), Y(py + 1), 2 * PT, 2 * PT, { ep: 0.4, couleur: ENCRE, fond: '#FFFFFF' }); texte(page, x.label?.trim() || N.libelle, px + 2.5, py - 1.5, 5.8, { couleur: GRIS_TEXTE }) }
  }
  /* les arbres */
  for (const x of terrain) if (x.type === 'tree') {
    const [px, py] = Pm(x.position), r = x.diameter / 2 / ech;
    page.cercle(X(px), Y(py), r * PT, { fond: x.state === 'felled' ? '#FFFFFF' : '#C9DDB0', trait: VERT, ep: 0.5, ...(x.state === 'planted' ? { tirets: [1.2, 0.8] } : {}) });
    page.cercle(X(px), Y(py), 0.35 * PT, { fond: VERT });
    if (x.state === 'felled') { page.trait(X(px - r * 0.7), Y(py - r * 0.7), X(px + r * 0.7), Y(py + r * 0.7), 0.6, ROUGE); page.trait(X(px - r * 0.7), Y(py + r * 0.7), X(px + r * 0.7), Y(py - r * 0.7), 0.6, ROUGE) }
    texte(page, x.state === 'existing' ? 'Arbre existant' : x.state === 'planted' ? 'Arbre de haute tige' : 'Arbre à abattre', px, py + r + 3, 5.6, { italique: true, aligne: 'centre', couleur: VERT });
  }
  /* la maison vue de dessus : sa toiture (ou son emprise), ses faîtages, l'emprise au nu des murs en tirets */
  const cotesFaitage: Point[][] = [];
  if (toits.length) for (const tt of toits) {
    for (const pan of tt.pans) page.polygone(pan.contour.map(Pp), { fond: assombrir(grisDuPan(pan.plan.a, pan.plan.b), 0.78), trait: '#2A2A2A', ep: 0.3 });
    if (tt.terrasse) page.polygone(tt.terrasse.dalle.map(Pp), { fond: '#B9BEC3', trait: ENCRE, ep: 0.6 });
    const LT = lignesDeToiture(tt);
    for (const l of LT) if (l.genre === 'faitage' || l.genre === 'aretier') page.trait(...Pp(l.a), ...Pp(l.b), l.genre === 'faitage' ? 0.8 : 0.4, '#1E1E1E');
    page.polygone(tt.egout.map(Pp), { trait: ENCRE, ep: 1 });
    for (const l of faitagesReunis(LT)) {
      const a = Pm(l.a), b = Pm(l.b), m: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 6) continue;
      let ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const r = ang * Math.PI / 180;
      const tx = m[0] + Math.sin(r) * 2.2, ty = m[1] + Math.cos(r) * 2.2, txt = 'Faîtage ' + niveauRelatif(l.a.z), dl = Page.largeur(txt, 5.8) / PT / 2;
      page.texte(txt, X(tx), Y(ty), 5.8, { aligne: 'centre', angle: ang, couleur: '#1E1E1E' });
      cotesFaitage.push([[-dl, -2.2], [dl, -2.2], [dl, 0.8], [-dl, 0.8]].map(([u, w]) => versVue(tx + u! * Math.cos(r) + w! * Math.sin(r), ty - u! * Math.sin(r) + w! * Math.cos(r))));
    }
  } else for (const q of E) page.polygone(q.contour.map(Pp), { fond: '#A9AEB4', trait: ENCRE, ep: 0.8 });
  for (const q of E) page.polygone(q.contour.map(Pp), { trait: ENCRE, ep: 0.6, tirets: [1.6, 1] });
  /* l'encombrement de la maison (nu extérieur des murs), en longueur et en largeur, coté hors de la toiture,
     du côté du terrain où il y a le plus de place : deux cotes lisibles plutôt que chaque redent sous le toit */
  if (E.length) {
    const A = E.flatMap(q => q.contour), C0 = E[0]!.contour;
    let u = { x: 1, y: 0 }, Lmax = 0;
    C0.forEach((a, i) => { const b = C0[(i + 1) % C0.length]!, L = Math.hypot(b.x - a.x, b.y - a.y); if (L > Lmax) { Lmax = L; u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L } } });
    const v = { x: -u.y, y: u.x }, pu = (q: Point) => q.x * u.x + q.y * u.y, pv = (q: Point) => q.x * v.x + q.y * v.y;
    const ext = (P: readonly Point[], f: (q: Point) => number) => [Math.min(...P.map(f)), Math.max(...P.map(f))] as const;
    const toit = [...A, ...toits.flatMap(tt => tt.egout)];
    for (const [axe, autre, fa, fo] of [[u, v, pu, pv], [v, u, pv, pu]] as const) {
      const [a0, a1] = ext(A, fa), [t0, t1] = ext(toit, fo), [l0, l1] = ext(plot.contour, fo);
      if (a1 - a0 < 2_000) continue;
      /* le côté le plus dégagé jusqu'à la limite */
      const haut = l1 - t1 >= t0 - l0, o = haut ? t1 + 4 * ech : t0 - 4 * ech, depart = (k: number) => { const P = A.filter(q => Math.abs(fa(q) - k) < 1); return haut ? Math.max(...P.map(fo)) : Math.min(...P.map(fo)) };
      const pt = (ka: number, ko: number): Point => ({ x: axe.x * ka + autre.x * ko, y: axe.y * ka + autre.y * ko });
      const [ax, ay] = Pm(pt(a0, o)), [bx, by] = Pm(pt(a1, o));
      page.trait(X(ax), Y(ay), X(bx), Y(by), 0.3, '#333333');
      for (const [k, x, y] of [[a0, ax, ay], [a1, bx, by]] as const) {
        const [dx, dy] = Pm(pt(k, depart(k) + (haut ? 1.2 : -1.2) * ech)), [fx, fy] = Pm(pt(k, o + (haut ? 1.2 : -1.2) * ech));
        page.trait(X(dx), Y(dy), X(fx), Y(fy), 0.2, '#555555');
        page.trait(X(x - 0.7), Y(y + 0.7), X(x + 0.7), Y(y - 0.7), 0.45, '#333333');
      }
      let ang = Math.atan2(-(by - ay), bx - ax) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const r = ang * Math.PI / 180;
      page.texte(metres(a1 - a0), X((ax + bx) / 2 - Math.sin(r) * 0.9), Y((ay + by) / 2 - Math.cos(r) * 0.9), 6.5, { gras: true, aligne: 'centre', angle: ang, couleur: '#222222' });
    }
  }
  /* la limite, ses côtés cotés en rouge, ses bornes */
  page.polygone(plot.contour.map(Pp), { trait: ENCRE, ep: 1.4 });
  plot.contour.forEach((a, i) => {
    const b = plot.contour[(i + 1) % plot.contour.length]!, n = dehors(plot.contour, a, b), m = { x: (a.x + b.x) / 2 + n.x * 3.6 * ech, y: (a.y + b.y) / 2 + n.y * 3.6 * ech };
    const [mx, my] = Pp(m);
    page.texte(metres(Math.hypot(b.x - a.x, b.y - a.y)), mx, my - 2.5, 8, { gras: true, aligne: 'centre', angle: angleFeuille(a, b), couleur: ROUGE });
    const [bx, by] = Pm(a);
    page.cercle(X(bx), Y(by), 1.3 * PT, { trait: ROUGE, ep: 0.5, fond: '#FFFFFF' });
    page.trait(X(bx - 0.8), Y(by - 0.8), X(bx + 0.8), Y(by + 0.8), 0.4, ROUGE); page.trait(X(bx - 0.8), Y(by + 0.8), X(bx + 0.8), Y(by - 0.8), 0.4, ROUGE);
  });
  /* les altitudes du terrain naturel */
  for (const s of plot.spotHeights ?? []) {
    const [px, py] = Pm(s.point);
    page.trait(X(px - 0.9), Y(py - 0.9), X(px + 0.9), Y(py + 0.9), 0.5, ENCRE); page.trait(X(px - 0.9), Y(py + 0.9), X(px + 0.9), Y(py - 0.9), 0.5, ENCRE);
    texte(page, 'TN ' + s.ngf.toFixed(2).replace('.', ','), px + 1.6, py - 1.4, 6, { couleur: '#222222' });
  }
  /* le niveau du RDC, encadré au milieu de la maison, par-dessus les points cotés du terrain qu'elle recouvre ;
     à côté des cotes de faîtage plutôt que dessus */
  if (E.length) {
    const t1 = 'Niveau RDC fini', t2 = '±0,00' + (plot.groundFloorNgf !== undefined ? ' = ' + plot.groundFloorNgf.toFixed(2).replace('.', ',') : ' (NGF ' + A_PRECISER + ')');
    const l = Math.max(Page.largeur(t1, 7, { gras: true }), Page.largeur(t2, 7)) / PT + 4;
    const [cx, cy] = Pm(rendre(placeEtiquette(E[0]!.contour.map(vue), cotesFaitage, vue(centroide(E[0]!.contour)), { l: (l / 2 + 0.5) * ech, h: 5 * ech })));
    page.cadre(X(cx - l / 2), Y(cy + 4.5), l * PT, 9 * PT, { ep: 0.4, couleur: ENCRE, fond: '#FFFFFF' });
    texte(page, t1, cx, cy - 0.6, 7, { gras: true, aligne: 'centre', couleur: '#111111' });
    texte(page, t2, cx, cy + 3, 7, { aligne: 'centre', couleur: plot.groundFloorNgf !== undefined ? '#111111' : ROUGE_MANQUE });
  }
  /* le terrain fini (TF) au pied des trois plus longues façades, juste hors du toit, en brun comme sur les dossiers du cabinet */
  if (plot.finishedGround !== undefined && E.length) {
    const C = E[0]!.contour, tf = 'TF ' + (plot.groundFloorNgf !== undefined ? (plot.groundFloorNgf + plot.finishedGround / 1000).toFixed(2).replace('.', ',') : niveauRelatif(plot.finishedGround));
    const cotes = C.map((a, i) => ({ a, b: C[(i + 1) % C.length]! })).sort((p, q) => Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y) - Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y)).slice(0, 3);
    for (const { a, b } of cotes) {
      const n = dehors(C, a, b), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let d = 0;
      while (d < 3_000 && toits.some(tt => positionDansAnneau({ x: m.x + n.x * d, y: m.y + n.y * d }, tt.egout) !== 'dehors')) d += 100;
      const q = { x: m.x + n.x * (d + 2.2 * ech), y: m.y + n.y * (d + 2.2 * ech) };
      if (positionDansAnneau(q, plot.contour) !== 'dedans') continue;
      const [qx, qy] = Pp(q);
      page.texte(tf, qx, qy - 2, 6.5, { gras: true, aligne: 'centre', angle: angleFeuille(a, b), couleur: BRUN_TF });
    }
  }
  /* la parcelle nommée dans sa partie libre (référence et surface, en vert), et la pelouse : là où rien d'autre n'est dessiné */
  {
    const obst: Point[][] = [...toits.map(tt => tt.egout.map(vue)), ...E.map(q => q.contour.map(vue)), ...amenagements.filter(a => a.kind !== 'fence').map(a => a.points.map(vue)),
      ...terrain.flatMap(x => x.type === 'tree' ? [[{ x: x.position.x - x.diameter / 2, y: x.position.y - x.diameter / 2 - 4 * ech }, { x: x.position.x + x.diameter / 2, y: x.position.y + x.diameter / 2 }].map(vue)] : []),
      ...(plot.spotHeights ?? []).map(z => [vue(z.point), vue({ x: z.point.x + 12 * ech, y: z.point.y - 3 * ech })])];
    const Cv = plot.contour.map(vue), c0 = centroide(Cv), Bc = { y1: Math.max(...Cv.map(q => q.y)) };
    const t1 = plot.reference?.trim() ?? '', t2 = enM2(S);
    if (t1) {
      const l = Math.max(Page.largeur(t1, 7.5, { gras: true }), Page.largeur(t2, 7.5)) / PT;
      const pl = placeEtiquette(Cv, obst, { x: c0.x, y: (c0.y + Bc.y1) / 2 }, { l: (l / 2 + 1.5) * ech, h: 4 * ech });
      const [x, y] = Pm(rendre(pl));
      texte(page, t1, x, y - 0.6, 7.5, { gras: true, aligne: 'centre', couleur: VERT });
      texte(page, t2, x, y + 3.2, 7.5, { aligne: 'centre', couleur: VERT });
      obst.push([{ x: pl.x - (l / 2 + 2) * ech, y: pl.y - 5 * ech }, { x: pl.x + (l / 2 + 2) * ech, y: pl.y + 5 * ech }]);
    }
    const lp = Page.largeur('Pelouse', 7, { italique: true }) / PT;
    const pp = placeEtiquette(Cv, obst, { x: c0.x, y: (c0.y + Bc.y1) / 2 }, { l: (lp / 2 + 3) * ech, h: 3 * ech });
    if (positionDansAnneau(pp, Cv) === 'dedans') { const [x, y] = Pm(rendre(pp)); texte(page, 'Pelouse', x, y + 1, 7, { italique: true, aligne: 'centre', couleur: VERT }) }
  }
  /* les reculs, en rouge : de la maison au point le plus proche de chaque limite */
  for (const r of R) {
    const a = Pm(r.de), b = Pm(r.vers), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 2) continue;
    page.trait(X(a[0]), Y(a[1]), X(b[0]), Y(b[1]), 0.5, ROUGE);
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    for (const [x, y] of [a, b]) page.trait(X(x - uy * 1.1 - ux * 1.1), Y(y + ux * 1.1 - uy * 1.1), X(x + uy * 1.1 + ux * 1.1), Y(y - ux * 1.1 + uy * 1.1), 0.5, ROUGE);
    let ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    const r2 = ang * Math.PI / 180;
    page.texte(metres(r.distance), X((a[0] + b[0]) / 2 - Math.sin(r2) * 1.2), Y((a[1] + b[1]) / 2 - Math.cos(r2) * 1.2), 7.5, { gras: true, aligne: 'centre', angle: ang, couleur: ROUGE });
  }
  /* les prises de vue photographiques : un cône de 9 mm sur la feuille, tourné vers ce qu'on photographie (comme sur
     les dossiers du cabinet ; le champ entier couvrirait la maison), et son nom derrière l'appareil */
  for (const { v, gauche, droite } of cones) {
    page.polygone([Pp(v.a), Pp(gauche), Pp(droite)], { fond: '#B9BEC2', trait: '#555555', ep: 0.4 });
    const [px, py] = Pm(v.a), [qx, qy] = Pm(v.b), L = Math.hypot(qx - px, qy - py) || 1;
    page.cercle(X(px), Y(py), 0.7 * PT, { fond: '#333333' });
    const nom = 'Ph ' + v.piece, l = Page.largeur(nom, 6.5, { gras: true }) / PT;
    const ex = px - (qx - px) / L * (2.5 + l / 2), ey = py - (qy - py) / L * 3.2;
    texte(page, nom, ex, ey + 1, 6.5, { gras: true, aligne: 'centre', couleur: '#333333' });
  }
  /* le nord, l'échelle */
  nordFleche(page, zone.x + zone.l - 8, zone.y + 9, plot.north + rot);
  echelleGraphique(page, ech, zone.x + zone.l - largeurEchelle(ech) - 4, zone.y + zone.h + 6);

  /* ---------- à droite : la légende, les surfaces et règles, les notes ---------- */
  const px = ZONE_DESSIN.x + ZONE_DESSIN.l - PANNEAU - 4;
  let py = ZONE_DESSIN.y + 6;
  const L: LigneLegende[] = [
    { pastille: pastilleTrait(ENCRE, 1.4), texte: 'Limite de propriété' },
    { pastille: (pg, x, y) => { pg.cercle(X(x + 3.5), Y(y + 1.5), 1.3 * PT, { trait: ROUGE, ep: 0.5, fond: '#FFFFFF' }) }, texte: 'Borne' },
    ...(plot.cadastre ? [{ pastille: pastilleTrait('#8F8F8F', 0.35), texte: 'Limite cadastrale (non garantie)' },
      ...(plot.cadastre.batiments.length ? [{ pastille: pastille('#E4E4E4', { hachures: '#9A9A9A', trait: '#7A7A7A' }), texte: 'Bâti existant (cadastre)' }] : [])] : []),
    ...(toits.length ? [{ pastille: pastille('#9EA4AA'), texte: 'Toiture projetée' + (toits[0] && niveaux.flatMap(f => Object.values(f.objects)).find(x => x.type === 'roof') ? '' : '') }] : []),
    { pastille: pastille('#FFFFFF', { tirets: false, trait: ENCRE }), texte: 'Emprise au sol (nu extérieur des murs, en tirets)' },
    { pastille: pastille(PELOUSE), texte: 'Terrain (pelouse en pleine terre)' },
    ...(amenagements.some(a => a.kind === 'path' || a.kind === 'parking') ? [{ pastille: (pg: PagePdf, x: number, y: number) => { pastille(GRAVIER)(pg, x, y); pointille(pg, [[X(x), Y(y)], [X(x + 7), Y(y)], [X(x + 7), Y(y + 3)], [X(x), Y(y + 3)]]) }, texte: 'Allée / stationnement gravillonnés' }] : []),
    ...(terrain.some(x => x.type === 'tree') ? [{ pastille: (pg: PagePdf, x: number, y: number) => pg.cercle(X(x + 3.5), Y(y + 1.5), 1.6 * PT, { fond: '#C9DDB0', trait: VERT, ep: 0.5 }), texte: 'Arbre' }] : []),
    ...[...new Set(terrain.filter(x => x.type === 'network').map(x => x.type === 'network' ? x.kind : 'eu'))].map(k => ({ pastille: pastilleTrait(NOMS_RESEAUX[k].couleur, 0.6, [2, 1.2]), texte: NOMS_RESEAUX[k].code + ' – ' + NOMS_RESEAUX[k].libelle })),
    ...((plot.spotHeights?.length ?? 0) ? [{ pastille: (pg: PagePdf, x: number, y: number) => { pg.trait(X(x + 2.6), Y(y + 0.6), X(x + 4.4), Y(y + 2.4), 0.5, ENCRE); pg.trait(X(x + 2.6), Y(y + 2.4), X(x + 4.4), Y(y + 0.6), 0.5, ENCRE) }, texte: 'Altitude du terrain naturel (TN, NGF)' }] : []),
    ...(PV.length ? [{ pastille: (pg: PagePdf, x: number, y: number) => pg.polygone([[X(x), Y(y + 1.5)], [X(x + 7), Y(y)], [X(x + 7), Y(y + 3)]], { fond: '#B9BEC2', trait: '#555555', ep: 0.4 }), texte: 'Prise de vue photographique (PCMI 6, 7, 8)' }] : []),
    { pastille: pastilleTrait(ROUGE, 0.5), texte: 'Recul mesuré (maison – limite)' },
  ];
  const tl = tailleLegende('LÉGENDE', L), hl = tl.h + 6;
  page.cadre(X(px), Y(py + hl), PANNEAU * PT, hl * PT, { ep: 0.5, couleur: ENCRE, fond: '#FFFFFF' });
  legende(page, px + 4, py + 3, 'LÉGENDE', L);
  py += hl + 5;
  /* surfaces et règles */
  const SR = surfacesReglementaires(projet), H = toits.length ? { egout: Math.min(...toits.map(x => x.egoutZ)), faitage: Math.max(...toits.map(x => x.faitage)) } : null;
  const pc = (v: number) => (S ? Math.round(v / S * 100) + ' %' : '');
  /* les surfaces du bilan du terrain (building) : ce que la maison couvre n'y compte qu'une fois */
  const Am = bilanAmenagements(projet), mesure = (k: Landscape['kind']) => Am.filter(a => a.genre === k).reduce((s, a) => s + a.mesure, 0);
  const SF = surfacesDuTerrain(projet);
  const graves = mesure('path') + mesure('parking'), terrasse = mesure('terrace');
  const pleine = SF?.pleineTerre ?? Math.max(0, S - em - graves - terrasse);
  /* les règles du PLU saisies sur la parcelle, en regard des mesures (building/plu.ts) : « 24 % (max. 35 %) », en rouge si elles ne
     sont pas tenues ; sans règles, la note le dit */
  const CP = controlePlu(projet), regle = (k: keyof ReglesPlu) => CP?.regles.find(r => r.cle === k);
  const lim = (k: keyof ReglesPlu) => { const r = regle(k); return r ? ' (' + r.limite + ')' : '' };
  const lignes: { l: string[]; k?: (keyof ReglesPlu)[] }[] = [
    { l: ['Terrain' + (plot.reference ? ' (' + plot.reference + ')' : ''), enM2(S), ''] },
    { l: ['Emprise au sol', enM2(em), pc(em) + lim('empriseMax')], k: ['empriseMax'] },
    { l: ['Surface de plancher', enM2(SR.surfacePlancher), ''] },
    ...(graves ? [{ l: ['Allées et stationnement', enM2(graves), pc(graves)] }] : []),
    ...(terrasse ? [{ l: ['Terrasse', enM2(terrasse), pc(terrasse)] }] : []),
    { l: ['Pleine terre (le reste)', enM2(pleine), pc(pleine) + lim('pleineTerreMin')], k: ['pleineTerreMin'] },
    ...(SF && (regle('permeableMin') || SF.permeables) ? [{ l: ['Surfaces non imperméabilisées', enM2(SF.nonImpermeabilisees), pc(SF.nonImpermeabilisees) + lim('permeableMin')], k: ['permeableMin' as const] }] : []),
    ...(regle('biotopeMin') ? [{ l: ['Coefficient de biotope', regle('biotopeMin')!.valeur, '(' + regle('biotopeMin')!.limite + ')'], k: ['biotopeMin' as const] }] : []),
    ...(regle('stationnementMin') ? [{ l: ['Stationnement', regle('stationnementMin')!.valeur, '(' + regle('stationnementMin')!.limite + ')'], k: ['stationnementMin' as const] }] : []),
    ...(H ? [{ l: ['Hauteurs égout / faîtage', (regle('egoutMax')?.valeur.replace(' m', '') ?? metres(H.egout)) + ' / ' + (regle('faitageMax')?.valeur.replace(' m', '') ?? metres(H.faitage)) + ' m',
      regle('egoutMax') || regle('faitageMax') ? '(max. ' + (plot.plu?.egoutMax !== undefined ? metres(plot.plu.egoutMax) : '–') + ' / ' + (plot.plu?.faitageMax !== undefined ? metres(plot.plu.faitageMax) : '–') + ' m)' : ''], k: ['egoutMax' as const, 'faitageMax' as const] }] : []),
    ...(regle('reculVoieMin') ? [{ l: ['Recul sur voie (le plus petit)', regle('reculVoieMin')!.valeur, '(' + regle('reculVoieMin')!.limite + ')'], k: ['reculVoieMin' as const] }] : []),
    ...(regle('reculLimitesMin') ? [{ l: ['Recul sur limites séparatives', regle('reculLimitesMin')!.valeur, '(' + regle('reculLimitesMin')!.limite + ')'], k: ['reculLimitesMin' as const] }] : []),
  ];
  const couleurs = lignes.map(x => (x.k?.some(k => regle(k)?.etat === 'non_conforme') ? ROUGE : undefined));
  const zonePlu = plot.plu?.zone?.trim();
  const ht = tableau(page, px, py, [{ titre: 'SURFACES ET RÈGLES' + (zonePlu ? ' (zone ' + zonePlu + ')' : ''), largeur: 50 }, { titre: '', largeur: 28, aligne: 'droite' }, { titre: '', largeur: 34, aligne: 'droite' }], lignes.map(x => x.l), { corps: 7.2, pas: 4.8, couleurs });
  py += ht + 1.5;
  const RG = CP?.regles ?? [], non = RG.filter(r => r.etat === 'non_conforme'), verifier = RG.filter(r => r.etat === 'a_verifier');
  const note = !RG.length ? [{ t: 'Règles du PLU (emprise, hauteurs, reculs, stationnement, pleine terre) : ' + A_PRECISER + ' – à saisir dans le panneau de la parcelle, d’après le règlement de la zone.', c: ROUGE_MANQUE }]
    : [{ t: 'Règles : ' + (plot.plu?.source?.trim() || 'règlement de la zone ' + A_PRECISER) + '. Mesures du projet ; hauteurs depuis ' + (CP!.reference === 'tn' ? 'le terrain naturel le plus bas sous la maison' : 'le RDC fini (terrain naturel non relevé)') + '.', c: GRIS_TEXTE },
      ...(non.length ? [{ t: 'Non tenu : ' + non.map(r => r.libelle.toLowerCase() + ' ' + r.valeur + ' (' + r.limite + ')').join(' ; ') + '.', c: ROUGE }] : []),
      ...(verifier.length ? [{ t: 'À vérifier : ' + verifier.map(r => r.libelle.toLowerCase()).join(', ') + '.', c: ROUGE_MANQUE }] : [])];
  for (const n of note) for (const t of couper(n.t, PANNEAU * PT, 6)) { texte(page, t, px, py + 2.5, 6, { couleur: n.c }); py += 3 }
  if (E.length && !maisonDansParcelle(plot, E)) { texte(page, 'ATTENTION : la maison sort de la parcelle.', px, py + 3, 7.5, { gras: true, couleur: ROUGE }); py += 4.5 }
  py += 5;
  /* les notes */
  const notes = [
    plot.cadastre
      ? ['Fond de plan : ', 'plan cadastral (' + plot.cadastre.source + ', ' + plot.cadastre.date + '), calé sur la limite de propriété' + (plot.cadastre.ecart !== undefined ? ' (écart moyen ' + metres(plot.cadastre.ecart) + ' m)' : '') + '. Limites cadastrales hors terrain d’assiette non garanties ; limite de propriété à confirmer sur le plan de bornage du géomètre-expert.']
      : ['Fond de plan : ', 'limite de propriété tracée dans le Designer' + (plot.reference ? ' (' + plot.reference + ')' : '') + ', à confirmer sur le plan de bornage du géomètre-expert ; fond cadastral ' + A_PRECISER + ' (à importer dans le panneau de la parcelle).'],
    ['Altitudes : ', (plot.spotHeights?.length ? 'points cotés relevés' : 'terrain non relevé') + (plot.groundFloorNgf !== undefined ? ' ; RDC fini ±0,00 = ' + plot.groundFloorNgf.toFixed(2).replace('.', ',') + ' NGF' : ' ; altitude NGF du RDC ' + A_PRECISER)
      + (plot.finishedGround !== undefined ? ' ; TF : terrain fini aux abords à ' + niveauRelatif(plot.finishedGround) + (plot.groundFloorNgf !== undefined ? ' (' + (plot.groundFloorNgf + plot.finishedGround / 1000).toFixed(2).replace('.', ',') + ')' : '') + '.' : '.')],
    ['Cotes d’implantation : ', 'prises au nu extérieur des murs, au point le plus proche de chaque limite.'],
  ];
  const lignesNotes = notes.flatMap(n => couper(n.join(''), (PANNEAU - 6) * PT, 6.4));
  const hn = lignesNotes.length * 3.2 + 6;
  page.cadre(X(px), Y(py + hn), PANNEAU * PT, hn * PT, { ep: 0.5, couleur: ENCRE, fond: '#FFFFFF' });
  lignesNotes.forEach((l, i) => texte(page, l, px + 3, py + 4.5 + i * 3.2, 6.4, { couleur: l.includes(A_PRECISER) ? ROUGE_MANQUE : '#222222' }));
  /* sous les notes, ce que le plan dit en chiffres : terrain, reculs, aménagements, terrassement, réseaux, plantations, prises de vue */
  listesMasse(page, projet, px, py + hn + 5, PANNEAU, 288);
  colonne(page, projet, o, 'Plan de masse', 'sur fond cadastral', 'PCMI 2', ech);
}

/** les listes du plan de masse, rubrique par rubrique, tant qu'il reste de la place (jusqu'à « bas ») */
function listesMasse(page: PagePdf, projet: Project, x: number, y0: number, l: number, bas: number): void {
  const t = parcelleDuProjet(projet);
  if (!t) return;
  const plot = t.plot, E = empriseAuSol(projet), R = reculs(plot, E), S = surfaceTerrain(plot);
  const Am = bilanAmenagements(projet), Mt = metreTerrain(projet), PV = pointsDeVue(projet);
  const f1 = (v: number) => v.toFixed(1).replace('.', ','), f2 = (v: number) => v.toFixed(2).replace('.', ',');
  const Z = (plot.spotHeights ?? []).map(z => z.ngf);
  const E0 = E[0], tnMaison = E0 && Z.length ? altitudeTerrain(plot, centroide(E0.contour)) : null;
  const rubriques: [string, [string, string, boolean?][]][] = [
    ['TERRAIN', [
      ['Référence cadastrale', plot.reference ?? '[à compléter]', !plot.reference],
      ['Voie', plot.streetName ?? (plot.street.length ? '[nom à compléter]' : '[côté sur voie à indiquer]'), !plot.streetName],
      ['±0,00 (sol fini RDC)', plot.groundFloorNgf !== undefined ? f2(plot.groundFloorNgf) + ' NGF' : '[NGF à compléter]', plot.groundFloorNgf === undefined],
      ['Terrain fini (abords)', plot.finishedGround !== undefined ? niveauRelatif(plot.finishedGround) + (plot.groundFloorNgf !== undefined ? ' (' + f2(plot.groundFloorNgf + plot.finishedGround / 1000) + ' NGF)' : '') : '[à préciser]', plot.finishedGround === undefined],
      ['Terrain naturel', Z.length ? (Z.length > 1 ? f2(Math.min(...Z)) + ' à ' + f2(Math.max(...Z)) : f2(Z[0]!)) + ' NGF (' + Z.length + ' pt' + (Z.length > 1 ? 's' : '') + ')' : '[non relevé]', !Z.length],
      ...(tnMaison !== null && plot.groundFloorNgf !== undefined ? [['±0,00 au-dessus du TN (centre)', ((plot.groundFloorNgf - tnMaison) >= 0 ? '+' : '') + f2(plot.groundFloorNgf - tnMaison) + ' m'] as [string, string]] : []),
    ]],
    ['RECULS (mesurés)', R.map(r => ['Côté ' + (r.cote + 1) + ' (' + metres(r.longueur) + ' m)' + (r.voie ? ' — voie' : ''), metres(r.distance) + ' m'] as [string, string])],
    ...(Am.length ? [['AMÉNAGEMENTS', [
      ...Am.slice(0, 8).map(a => { const fin = finitionAmenagement(a.finition); return [GENRES_AMENAGEMENT[a.genre].libelle + (fin ? ' : ' + fin.libelle.toLowerCase() : ''), a.genre === 'fence' ? metres(a.mesure) + ' m' : enM2(a.mesure)] as [string, string] }),
      ...(() => { const vert = Am.filter(a => a.genre === 'green').reduce((s2, a) => s2 + a.mesure, 0); return vert ? [['Espaces verts', enM2(vert) + (S ? ' (' + (vert / S * 100).toFixed(1).replace('.', ',') + ' %)' : '')] as [string, string]] : [] })(),
    ]] as [string, [string, string][]]] : []),
    ...(Mt.plateformes.length ? [['TERRASSEMENT (estimé)', [
      ...Mt.plateformes.slice(0, 4).map(c => [c.nom + ' à ' + f2(c.niveau) + ' NGF', enM2(c.surface * 1e6)] as [string, string]),
      ['Déblais (plateformes et talus)', f1(Mt.deblai) + ' m³'], ['Remblais (plateformes et talus)', f1(Mt.remblai) + ' m³'],
    ]] as [string, [string, string][]]] : []),
    ...(Mt.reseaux.length || Mt.equipements.length ? [['RÉSEAUX', [
      ...Mt.reseaux.map(r => [NOMS_RESEAUX[r.genre].code + ' — ' + NOMS_RESEAUX[r.genre].libelle, f1(r.longueur) + ' m'] as [string, string]),
      ...Mt.equipements.map(e => [NOMS_EQUIPEMENTS[e.genre as keyof typeof NOMS_EQUIPEMENTS]?.libelle ?? e.genre, String(e.nombre)] as [string, string]),
    ]] as [string, [string, string][]]] : []),
    ...(Mt.arbres.existants + Mt.arbres.aPlanter + Mt.arbres.aAbattre ? [['PLANTATIONS', [
      ...(Mt.arbres.existants ? [['Arbres existants conservés', String(Mt.arbres.existants)] as [string, string]] : []),
      ...(Mt.arbres.aPlanter ? [['Arbres à planter', String(Mt.arbres.aPlanter)] as [string, string]] : []),
      ...(Mt.arbres.aAbattre ? [['Arbres à abattre', String(Mt.arbres.aAbattre)] as [string, string]] : []),
    ]] as [string, [string, string][]]] : []),
    ...(PV.length ? [['PRISES DE VUE', PV.map(v => [v.piece + ' — ' + ({ 'PCMI 6': 'insertion', 'PCMI 7': 'environnement proche', 'PCMI 8': 'environnement lointain' } as Record<string, string>)[v.piece]!, 'reportée'] as [string, string])]] as [string, [string, string][]][] : []),
  ];
  let y = y0;
  for (const [titre, lignes] of rubriques) {
    if (!lignes.length || y + 8 > bas) continue;
    texte(page, titre, x, y + 2.5, 7.2, { gras: true, couleur: '#222222' }); y += 5.2;
    for (const [k, v, manque] of lignes) {
      if (y + 3.6 > bas) { texte(page, '…', x, y + 2.4, 6.5, { couleur: GRIS_TEXTE }); y = bas; break }
      texte(page, k, x, y + 2.4, 6.5, { couleur: '#333333' });
      texte(page, v, x + l, y + 2.4, 6.5, { aligne: 'droite', gras: !manque, couleur: manque ? ROUGE_MANQUE : '#222222' });
      page.trait(X(x), Y(y + 3.4), X(x + l), Y(y + 3.4), 0.15, '#D0D0D0');
      y += 3.8;
    }
    y += 2.2;
  }
}

/** la normale qui sort de la parcelle sur le côté a → b */
function dehors(C: readonly Point[], a: Point, b: Point): Point {
  let s = 0;
  C.forEach((p, i) => { const q = C[(i + 1) % C.length]!; s += p.x * q.y - q.x * p.y });
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, k = s > 0 ? 1 : -1;
  return { x: k * dy / L, y: -k * dx / L };
}

/** des points de gravier, réguliers, dans un polygone (points PDF) */
function pointille(page: PagePdf, Q: [number, number][]): void {
  const xs = Q.map(q => q[0]), ys = Q.map(q => q[1]);
  page.decouper(Q);
  for (let x = Math.min(...xs), k = 0; x < Math.max(...xs); x += 4.2, k++) for (let y = Math.min(...ys) + (k % 2) * 2.1; y < Math.max(...ys); y += 4.2) page.cadre(x, y, 0.6, 0.6, { ep: 0, fond: '#9A9481' });
  page.restaurer();
}

/** le symbole d'une prise de vue : un cône de longueur L (mm) depuis l'appareil, ouvert du champ de l'appareil */
function symboleVue(v: { a: Point; b: Point }, L: number): { gauche: Point; droite: Point } {
  const t = Math.atan2(v.b.y - v.a.y, v.b.x - v.a.x), k = L / Math.cos(DEMI_CHAMP);
  const bord = (s: number) => ({ x: v.a.x + k * Math.cos(t + s * DEMI_CHAMP), y: v.a.y + k * Math.sin(t + s * DEMI_CHAMP) });
  return { gauche: bord(1), droite: bord(-1) };
}

function assombrir(c: string, k: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return c;
  const v = parseInt(m[1]!, 16), f = (x: number) => Math.round(x * k).toString(16).padStart(2, '0');
  return '#' + f(v >> 16 & 255) + f(v >> 8 & 255) + f(v & 255);
}

/** un polygone découpé à un rectangle (Sutherland-Hodgman) : la partie qu'on en voit sur la feuille */
function dansRectangle(P: Point[], r: { x0: number; x1: number; y0: number; y1: number }): Point[] {
  const bords: [(p: Point) => boolean, (a: Point, b: Point) => Point][] = [
    [p => p.x >= r.x0, (a, b) => ({ x: r.x0, y: a.y + (b.y - a.y) * (r.x0 - a.x) / (b.x - a.x) })],
    [p => p.x <= r.x1, (a, b) => ({ x: r.x1, y: a.y + (b.y - a.y) * (r.x1 - a.x) / (b.x - a.x) })],
    [p => p.y >= r.y0, (a, b) => ({ x: a.x + (b.x - a.x) * (r.y0 - a.y) / (b.y - a.y), y: r.y0 })],
    [p => p.y <= r.y1, (a, b) => ({ x: a.x + (b.x - a.x) * (r.y1 - a.y) / (b.y - a.y), y: r.y1 })],
  ];
  let Q = P;
  for (const [dedans, coupe] of bords) {
    const out: Point[] = [];
    Q.forEach((b, i) => {
      const a = Q[(i + Q.length - 1) % Q.length]!;
      if (dedans(b)) { if (!dedans(a)) out.push(coupe(a, b)); out.push(b) } else if (dedans(a)) out.push(coupe(a, b));
    });
    Q = out;
    if (!Q.length) break;
  }
  return Q;
}
