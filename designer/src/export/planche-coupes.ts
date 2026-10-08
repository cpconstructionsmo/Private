/* La planche des coupes (PCMI 3), comme celles des dossiers du cabinet :
   jusqu'à deux coupes l'une sous l'autre, à la même échelle, chacune sur
   son terrain — le terrain naturel relevé (altitudes NGF) et le sol en
   place dessous, en beige —, la maçonnerie coupée hachurée, la toiture vue
   au-delà dans sa couverture, le nom des pièces traversées, les niveaux à
   gauche et à droite (cote par rapport au RDC fini et altitude NGF), les
   limites de propriété en tirets bleus et les distances jusqu'à elles ;
   dessous, la légende, les notes et le repérage des coupes sur la parcelle.
   Tout se déduit de la maquette (vue3d/coupe.ts) et de la parcelle. */
import type { Floor, Foundation, Point, Project } from '../model/types';
import { compositionPlancher, MATIERES_PLANCHER } from '../catalogue/planchers';
import { planDuNiveau, toitureDuNiveau, parcelleDuProjet, profilTerrain, empriseAuSol, fondationsDuProjet, planFondations, corpsSurSemelles, SOUBASSEMENTS } from '../building';
import { maquette, EPAISSEUR_PLANCHER, type Matiere } from '../vue3d/maquette';
import { coupe, traitsDeCoupe, type Coupe, type LigneDeCoupe } from '../vue3d/coupe';
import { segmentsDans } from '../geometry/hachures';
import type { Polygone } from '../geometry/polygon';
import type { PagePdf, DocumentPdf } from './pdf';
import { PagePdf as Page } from './pdf';
import { PT, X, Y, ZONE_DESSIN, ENCRE, GRIS_TEXTE, BRIQUE, colonne, nouvelleFeuille, texte, metres, niveauRelatif, titreDessin, legende, tailleLegende, pastille, pastilleTrait,
  couper, nordFleche, orientation, A_PRECISER, type Signature, type LigneLegende } from './feuille';
import { ECHELLES } from './planche-niveau';
import { peindre } from './planche-facades';

export interface OptionsCoupes extends Signature { echelle?: number | undefined; dossier?: boolean | undefined }

const TERRE = '#EDE5D8', TERRE_POINTS = '#CDBFA9', TN = '#7A3E2E', TF = '#3F7A3A', LIMITE = '#2C5B8A';
const COUVERTURES: ReadonlySet<Matiere> = new Set(['tuile', 'ardoise', 'zinc', 'bac_acier', 'vegetalise', 'gravillons']);

/** ce qu'il faut d'une coupe pour la dessiner */
interface CoupeVue {
  l: LigneDeCoupe; C: Coupe;
  /** u et altitude (relative) du terrain naturel, s'il est relevé et placé */
  tn: { u: number; z: number }[] | null;
  /** les limites de propriété traversées (u) */
  limites: number[];
  /** la maison au droit de la coupe (u) */
  maison: [number, number][];
  /** l'étendue dessinée (u) et les altitudes */
  u0: number; u1: number; zmin: number; zmax: number;
  pieces: { nom: string; u: number; z: number; l: number }[];
  /** les fondations au droit de la coupe (u) : semelles, soubassements, et ce qui les place (mm, depuis le ±0,00) */
  fond: { genre: Foundation['kind']; semelles: [number, number][]; soubassements: [number, number][]; fondFouille: number; hauteurSemelle: number; vide: number } | null;
}

function preparer(projet: Project, l: LigneDeCoupe): CoupeVue | null {
  const C = coupe(maquette(projet), l);
  if (!C.boite) return null;
  const d = { x: l.regard.y, y: -l.regard.x }, uDe = (p: Point) => (p.x - l.a.x) * d.x + (p.y - l.a.y) * d.y;
  const enPlan = (u: number): Point => ({ x: l.a.x + d.x * u, y: l.a.y + d.y * u });
  const parc = parcelleDuProjet(projet)?.plot, ngf0 = parc?.groundFloorNgf;
  /* les limites de propriété traversées par la droite de coupe */
  const limites: number[] = [];
  if (parc) {
    const A = enPlan(C.boite.umin - 60_000), B = enPlan(C.boite.umax + 60_000);
    for (const [s, t] of segmentsDans(A, B, { contour: parc.contour })) limites.push(uDe(s), uDe(t));
  }
  limites.sort((a, b) => a - b);
  const lim = limites.length >= 2 ? [limites[0]!, limites[limites.length - 1]!] : [];
  const u0 = lim.length ? Math.min(lim[0]!, C.boite.umin - 1_000) : C.boite.umin - 2_000, u1 = lim.length ? Math.max(lim[1]!, C.boite.umax + 1_000) : C.boite.umax + 2_000;
  const tn = parc && ngf0 !== undefined && parc.spotHeights?.length ? profilTerrain(parc, enPlan(u0), enPlan(u1), 200)?.map(q => ({ u: u0 + q.s, z: q.z })) ?? null : null;
  const maison = empriseAuSol(projet).flatMap(q => segmentsDans(enPlan(u0), enPlan(u1), q)).map(([a, b]) => [uDe(a), uDe(b)].sort((x, y) => x - y) as [number, number]);
  /* les pièces traversées, au niveau de leur sol */
  const pieces: CoupeVue['pieces'] = [];
  for (const f of projet.buildings.flatMap(b => b.floors)) for (const z of planDuNiveau(f).zones) {
    if (!z.piece) continue;
    for (const [s, t] of segmentsDans(enPlan(u0), enPlan(u1), z.polygone)) {
      const a = uDe(s), b = uDe(t);
      if (Math.abs(b - a) > 900) pieces.push({ nom: z.piece.name, u: (a + b) / 2, z: f.elevation + 1_050, l: Math.abs(b - a) });
    }
  }
  /* les fondations (plan de fondations) : semelles et corps des murs porteurs coupés ; le fond de fouille à la profondeur
     d'assise sous le terrain fini aux abords (à défaut, le terrain naturel le plus bas sous la maison, ou le ±0,00) */
  const F = fondationsDuProjet(projet), PF = F ? planFondations(F.niveau) : null;
  const coupeU = (q: Polygone) => fusionner(segmentsDans(enPlan(u0), enPlan(u1), q).map(([a, b]) => [uDe(a), uDe(b)].sort((x, y) => x - y) as [number, number]));
  let fond: CoupeVue['fond'] = null;
  if (PF && maison.length) {
    const zt0 = tn ? Math.min(...tn.filter(q => maison.some(([a, b]) => q.u >= a - 500 && q.u <= b + 500)).map(q => q.z), 0) : 0;
    const zRef = parc?.finishedGround ?? (Number.isFinite(zt0) ? zt0 : 0);
    fond = { genre: PF.fondation.kind, semelles: fusionner([...PF.emprise, ...PF.isolees.map(q => ({ contour: q.contour }))].flatMap(coupeU)), soubassements: fusionner(corpsSurSemelles(F!.niveau).map(contour => coupeU({ contour })).flat()),
      fondFouille: Math.min(zRef, 0) - PF.assise, hauteurSemelle: PF.fondation.footingHeight, vide: PF.fondation.crawlHeight };
  }
  const zt = tn?.map(q => q.z) ?? [];
  return { l, C, tn, limites: lim, maison, u0, u1, zmin: fond?.semelles.length ? Math.min(Math.min(C.boite.zmin, 0, ...zt) - 600, fond.fondFouille - 300) : Math.min(C.boite.zmin, 0, ...zt) - 1_000, zmax: C.boite.zmax, pieces, fond };
}

export function plancheCoupes(doc: DocumentPdf, projet: Project, o: OptionsCoupes, lignes: LigneDeCoupe[]): void {
  const V = lignes.map(l => preparer(projet, l)).filter((x): x is CoupeVue => !!x);
  if (!V.length) {
    const page = nouvelleFeuille(doc);
    texte(page, 'Rien à couper : aucun mur.', 20, 30, 10, { couleur: GRIS_TEXTE });
    colonne(page, projet, o, 'Coupes', 'sur terrain', 'PCMI 3', 0);
    return;
  }
  /* deux coupes par feuille ; la même échelle pour toutes */
  const Z = { x: ZONE_DESSIN.x + 4, y: ZONE_DESSIN.y + 4, l: ZONE_DESSIN.l - 8, h: ZONE_DESSIN.h - 8 }, BAS = 62;
  const largeur = (v: CoupeVue, e: number) => { const m = marges(v, e); return (v.u1 - v.u0) / e + m.g + m.d };
  const hauteur = (v: CoupeVue, e: number) => (v.zmax - v.zmin) / e + 30;
  const parFeuille = (e: number) => (V.length > 1 && V.slice(0, 2).reduce((s, v) => s + hauteur(v, e), 0) <= Z.h - BAS ? 2 : 1);
  const tient = (e: number) => V.every(v => largeur(v, e) <= Z.l) && Math.max(...V.map(v => hauteur(v, e))) <= Z.h - BAS;
  /* deux coupes par feuille comme les dossiers du cabinet, si l'échelle n'y perd pas plus d'un cran et demi */
  const seule = ECHELLES.filter(e => e >= 75).find(tient) ?? ECHELLES[ECHELLES.length - 1]!;
  const deux = V.length > 1 ? ECHELLES.filter(e => e >= 75).find(e => tient(e) && parFeuille(e) === 2) : undefined;
  const ech = o.echelle ?? (deux && deux <= seule * 1.5 ? deux : seule);
  const n = parFeuille(ech);
  for (let i = 0; i < V.length; i += n) {
    const page = nouvelleFeuille(doc), lot = V.slice(i, i + n);
    const H = lot.reduce((s, v) => s + hauteur(v, ech), 0), ecart = (Z.h - BAS - H) / (lot.length + 1);
    let y = Z.y + ecart;
    for (const v of lot) { dessinerCoupe(page, projet, v, Z.x + (Z.l - largeur(v, ech)) / 2, y, ech, marges(v, ech)); y += hauteur(v, ech) + ecart }
    basDePage(page, projet, V, Z.x, Z.y + Z.h - BAS + 4, Z.l);
    colonne(page, projet, o, 'Coupes', 'sur terrain', 'PCMI 3', ech);
  }
}

/** une coupe : (x0, y0) le coin haut-gauche de sa place */
/* les repères de niveau (cote relative et NGF) : de part et d'autre de la coupe, ou, comme aux dossiers du cabinet,
   dans le terrain entre la limite et la maison quand il y a la place — la coupe y gagne une échelle */
const COTES = 32, REPERE_G = 38, REPERE_D = 46;
function marges(v: CoupeVue, e: number): { g: number; d: number; dedansG: boolean; dedansD: boolean } {
  const b = v.C.boite, dedansG = !!b && (b.umin - v.u0) / e >= REPERE_G, dedansD = !!b && (v.u1 - b.umax) / e >= REPERE_D;
  return { g: dedansG ? 4 : COTES, d: dedansD ? 4 : COTES, dedansG, dedansD };
}

function dessinerCoupe(page: PagePdf, projet: Project, v: CoupeVue, x0: number, y0: number, e: number, M: ReturnType<typeof marges>): void {
  const ySol = y0 + 4 + v.zmax / e;
  const Pm = (u: number, z: number): [number, number] => [x0 + M.g + (u - v.u0) / e, ySol - z / e];
  const P = (u: number, z: number): [number, number] => { const [a, b] = Pm(u, z); return [X(a), Y(b)] };
  const ngf0 = parcelleDuProjet(projet)?.plot.groundFloorNgf, ngf = (z: number) => (ngf0! + z / 1000).toFixed(2).replace('.', ',');
  /* le terrain : le sol en place sous le terrain naturel (ou le ±0,00), en beige pointillé */
  const sol = v.tn ?? [{ u: v.u0, z: 0 }, { u: v.u1, z: 0 }];
  const fond = [...sol.map(q => P(q.u, q.z)), P(v.u1, v.zmin), P(v.u0, v.zmin)];
  page.polygone(fond, { fond: TERRE });
  page.decouper(fond);
  for (let k = 0; k < 900; k++) { const u = v.u0 + ((k * 7919) % 1000) / 1000 * (v.u1 - v.u0), z = v.zmin + ((k * 104729) % 997) / 997 * (Math.max(...sol.map(q => q.z)) - v.zmin); const [px, py] = P(u, z); page.cadre(px, py, 0.5, 0.5, { ep: 0, fond: TERRE_POINTS }) }
  page.restaurer();
  /* les fondations coupées : le vide sanitaire en blanc sous le plancher, entre les soubassements ; les semelles au fond de
     fouille et les soubassements jusqu'au plancher, hachurés comme la maçonnerie */
  const hachurer = (Q: [number, number][], u0h: number, z0h: number, u1h: number, z1h: number) => {
    page.polygone(Q, { fond: '#DCDCDC' });
    page.decouper(Q);
    const [a0, b0] = Pm(u0h, z0h), [a1, b1] = Pm(u1h, z1h);
    for (let t = a0 - (b0 - b1); t < a1; t += 1.1) page.trait(X(t), Y(b0), X(t + (b0 - b1)), Y(b1), 0.25, '#4A4A4A');
    page.restaurer();
    page.polygone(Q, { trait: ENCRE, ep: 0.5 });
  };
  const F = v.fond, sousPlancher = -EPAISSEUR_PLANCHER;
  if (F) {
    const S = F.soubassements;
    if (F.genre === 'crawl_space') for (let i = 0; i + 1 < S.length; i++) {
      const a = S[i]![1], b = S[i + 1]![0];
      if (b - a < 300 || !v.maison.some(([m0, m1]) => a >= m0 - 1 && b <= m1 + 1)) continue;
      const z0 = sousPlancher - F.vide;
      page.polygone([P(a, z0), P(b, z0), P(b, sousPlancher), P(a, sousPlancher)], { fond: '#FFFFFF', trait: '#6A6A6A', ep: 0.3 });
      const [x, y] = Pm((a + b) / 2, (z0 + sousPlancher) / 2);
      if ((b - a) / e > 24) texte(page, 'Vide sanitaire', x, y + 1, 6, { gras: true, aligne: 'centre', couleur: '#3A3A3A' });
    }
    const zs = F.fondFouille, zh = zs + F.hauteurSemelle;
    for (const [a, b] of F.semelles) hachurer([P(a, zs), P(b, zs), P(b, zh), P(a, zh)], a, zs, b, zh);
    for (const [a, b] of S) hachurer([P(a, zh), P(b, zh), P(b, sousPlancher), P(a, sousPlancher)], a, zh, b, sousPlancher);
  }
  /* ce qu'on voit au-delà : la couverture dans sa teinte, le reste en blanc au trait */
  for (const f of v.C.vues) {
    if (COUVERTURES.has(f.matiere) || ['vitrage', 'menuiserie', 'appui', 'porte', 'garage'].includes(f.matiere)) peindre(page, f, P, e, 0);
    else page.polygone(f.points.map(q => P(q.u, q.z)), { fond: '#FFFFFF', trait: '#3A3A3A', ep: 0.25 });
  }
  /* le comble, comme aux dossiers du cabinet : blanc entre le plafond et les pans coupés (l'ardoise des pans d'au-delà ne
     se voit pas de l'intérieur), le plafond, et son isolant si la composition du plafond est choisie */
  dessinerComble(page, projet, v, P, Pm);
  /* ce que le plan tranche : hachuré (maçonnerie, planchers, charpente), vitrages clairs */
  for (const c of v.C.coupees) {
    const Q = c.points.map(q => P(q.u, q.z));
    if (c.matiere === 'vitrage') { page.polygone(Q, { fond: '#C9D7DC', trait: ENCRE, ep: 0.4 }); continue }
    if (c.matiere === 'porte' || c.matiere === 'garage' || c.matiere === 'menuiserie') { page.polygone(Q, { fond: '#3B3F44', trait: ENCRE, ep: 0.4 }); continue }
    page.polygone(Q, { fond: '#DCDCDC' });
    page.decouper(Q);
    const us = c.points.map(q => q.u), zs = c.points.map(q => q.z), [a0, b0] = Pm(Math.min(...us), Math.min(...zs)), [a1, b1] = Pm(Math.max(...us), Math.max(...zs));
    for (let t = a0 - (b0 - b1); t < a1; t += 1.1) page.trait(X(t), Y(b0), X(t + (b0 - b1)), Y(b1), 0.25, '#4A4A4A');
    page.restaurer();
    page.polygone(Q, { trait: ENCRE, ep: 0.5 });
  }
  /* le terrain naturel, son altitude aux bouts et au droit de la maison */
  if (v.tn) {
    page.ligne(v.tn.map(q => P(q.u, q.z)), 0.6, '#2A2A2A');
    const zEn = (u: number) => { const k = v.tn!.findIndex(q => q.u >= u); if (k <= 0) return v.tn![Math.max(0, k)]!.z; const a = v.tn![k - 1]!, b = v.tn![k]!; return a.z + (b.z - a.z) * (u - a.u) / ((b.u - a.u) || 1) };
    const etiquette = (u: number, droite: boolean) => { const [x, y] = Pm(u, zEn(u)); texte(page, 'TN ' + ngf(zEn(u)), x + (droite ? -1 : 1), y - 1.5, 5.8, { couleur: TN, ...(droite ? { aligne: 'droite' as const } : {}) }) };
    etiquette(v.u0 + 300, false); etiquette(v.u1 - 300, true);
    for (const [a, b] of v.maison) { const [xa, ya] = Pm(a, zEn(a)), [xb, yb] = Pm(b, zEn(b)); texte(page, 'TN ' + niveauRelatif(zEn(a)) + ' (' + ngf(zEn(a)) + ')', xa - 1.5, ya + 3.6, 5.8, { couleur: TN, aligne: 'droite' }); texte(page, 'TN ' + niveauRelatif(zEn(b)) + ' (' + ngf(zEn(b)) + ')', xb + 1.5, yb + 3.6, 5.8, { couleur: TN }) }
  } else page.trait(...P(v.u0, 0), ...P(v.u1, 0), 0.6, '#2A2A2A');
  /* le terrain fini aux abords (vert) : à son niveau sur deux mètres autour de la maison, puis rejoignant le terrain naturel */
  const tf = parcelleDuProjet(projet)?.plot.finishedGround;
  if (tf !== undefined && v.maison.length) {
    const a = Math.max(v.u0, Math.min(...v.maison.map(m => m[0])) - 2_000), b = Math.min(v.u1, Math.max(...v.maison.map(m => m[1])) + 2_000);
    const zTn = (u: number) => { if (!v.tn) return 0; const k = v.tn.findIndex(q => q.u >= u); if (k <= 0) return v.tn[Math.max(0, k)]!.z; const p = v.tn[k - 1]!, q = v.tn[k]!; return p.z + (q.z - p.z) * (u - p.u) / ((q.u - p.u) || 1) };
    const ga = Math.max(v.u0, a - 1_500), gb = Math.min(v.u1, b + 1_500);
    page.ligne([P(ga, zTn(ga)), P(a, tf), P(b, tf), P(gb, zTn(gb))], 0.8, TF);
  }
  /* le nom des pièces traversées ; « Comble perdu » sous une toiture en pente */
  /* sur un fond blanc : le nom reste lisible devant une baie vue au-delà */
  for (const p of v.pieces) {
    const [x, y] = Pm(p.u, p.z), c = p.l / e > 22 ? 7 : 5.8, l = Page.largeur(p.nom, c, { gras: true }) / PT + 1.6;
    page.cadre(X(x - l / 2), Y(y + 1), l * PT, c * 0.42 * PT, { ep: 0, fond: '#FFFFFF' });
    texte(page, p.nom, x, y, c, { gras: true, aligne: 'centre', couleur: '#222222' });
  }
  const toits = projet.buildings.flatMap(b => b.floors).flatMap(f => { const r = toitureDuNiveau(f); return r?.ok ? r.toitures : [] });
  if (toits.length && toits.some(t => !t.terrasse) && v.maison.length) {
    const a = Math.min(...v.maison.map(m => m[0])), b = Math.max(...v.maison.map(m => m[1])), t = toits[0]!;
    const [x, y] = Pm((a + b) / 2, t.hautMurs + (t.faitage - t.hautMurs) * 0.28);
    texte(page, 'Comble perdu', x, y, 6.5, { italique: true, aligne: 'centre', couleur: '#3A3A3A' });
  }
  /* les limites de propriété */
  for (const u of v.limites) {
    const [x] = Pm(u, 0), [, yh] = Pm(u, v.zmax), [, yb] = Pm(u, v.zmin);
    page.trait(X(x), Y(yh - 2), X(x), Y(yb), 0.6, LIMITE, [2.4, 1.6]);
    page.texte('Limite de propriété', X(x + 2.6), Y((yh + ySol) / 2), 6.5, { gras: true, angle: 90, aligne: 'centre', couleur: LIMITE });
  }
  /* les niveaux : faîtage le plus haut, égout, sol fini à gauche ; arase et autres faîtages à droite */
  const t = toits[0];
  const gauche: [number, string][] = [], droite: [number, string][] = [];
  if (t) { gauche.push([t.faitage, 'Faîtage']); gauche.push([t.egoutZ, 'Égout']); droite.push([t.hautMurs, 'Arase maçonnerie']) }
  gauche.push([0, 'Niveau fini RDC']);
  const autres = v.C.coupees.filter(c => COUVERTURES.has(c.matiere)).map(c => Math.max(...c.points.map(q => q.z)));
  if (autres.length && t && Math.max(...autres) < t.faitage - 100) droite.unshift([Math.max(...autres), 'Faîtage']);
  /* le terrain fini aux abords : un repère à droite, comme le sol du garage aux dossiers du cabinet */
  if (tf !== undefined && v.maison.length) droite.push([tf, 'TF abords']);
  const repere = (z: number, lib: string, cote: 'g' | 'd') => {
    const [, y] = Pm(0, z);
    const xa = cote === 'g' ? (M.dedansG ? Pm(v.C.boite!.umin, 0)[0] - 35 : x0 - 2) : (M.dedansD ? Pm(v.C.boite!.umax, 0)[0] + 2 : x0 + M.g + (v.u1 - v.u0) / e + 3), xt = xa + (cote === 'g' ? 28 : 2);
    page.trait(X(xa + (cote === 'g' ? 20 : 0)), Y(y), X(xa + (cote === 'g' ? 33 : 13)), Y(y), 0.4, ENCRE);
    const xm = cote === 'g' ? xa + 28 : xa + 5;
    page.polygone([[X(xm), Y(y)], [X(xm + 1.7), Y(y - 2.3)], [X(xm - 1.7), Y(y - 2.3)]], { fond: '#FFFFFF', trait: ENCRE, ep: 0.4 });
    const val = niveauRelatif(z) + (ngf0 !== undefined ? '  (' + ngf(z) + ' NGF)' : '');
    if (cote === 'g') { texte(page, lib, xt - 4, y - 4.6, 7, { gras: true, aligne: 'droite', couleur: '#222222' }); texte(page, val, xt - 4, y - 1.2, 6.5, { aligne: 'droite', couleur: '#222222' }) }
    else { texte(page, lib, xt + 8, y - 4.6, 7, { gras: true, couleur: '#222222' }); texte(page, val, xt + 8, y - 1.2, 6.5, { couleur: '#222222' }) }
  };
  for (const [z, l] of gauche) repere(z, l, 'g');
  for (const [z, l] of droite) repere(z, l, 'd');
  /* les distances : limite – maison – limite (ou la maison seule) */
  const R = [...(v.limites.length ? [v.limites[0]!] : []), ...(v.maison.length ? [Math.min(...v.maison.map(m => m[0])), Math.max(...v.maison.map(m => m[1]))] : []), ...(v.limites.length ? [v.limites[1]!] : [])].sort((a, b) => a - b);
  const [, yc] = Pm(0, v.zmin); const ycote = yc + 4;
  if (R.length > 1) {
    page.trait(X(Pm(R[0]!, 0)[0]), Y(ycote), X(Pm(R[R.length - 1]!, 0)[0]), Y(ycote), 0.35, ENCRE);
    R.forEach((u, i) => {
      const [x] = Pm(u, 0);
      page.trait(X(x - 1), Y(ycote + 1), X(x + 1), Y(ycote - 1), 0.5, ENCRE);
      if (i) { const [xp] = Pm(R[i - 1]!, 0); texte(page, metres(u - R[i - 1]!), (x + xp) / 2, ycote - 1, 7, { aligne: 'centre', couleur: '#222222' }) }
    });
  }
  /* le titre de la coupe */
  const sens = orientation(v.l.regard, parcelleDuProjet(projet)?.plot.north ?? 0);
  titreDessin(page, 'COUPE ' + v.l.nom + '–' + v.l.nom, 'Coupe sur terrain – regard vers le ' + sens + ' – échelle 1/' + e, x0 + Math.max(M.g - 8, 0), ycote + 9, 11);
}

/** des intervalles réunis (ceux qui se touchent ou se recouvrent n'en font qu'un), dans l'ordre */
function fusionner(I: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of [...I].sort((p, q) => p[0] - q[0])) { const d = out[out.length - 1]; if (d && a <= d[1] + 1) d[1] = Math.max(d[1], b); else out.push([a, b]) }
  return out;
}

/** le niveau qui porte la toiture en pente, et la hauteur de son plafond (relative au ±0,00) */
function niveauSousComble(projet: Project): { f: Floor; zPlafond: number } | null {
  for (const f of projet.buildings.flatMap(b => b.floors).sort((a, b) => b.elevation - a.elevation)) {
    const r = toitureDuNiveau(f);
    if (r?.ok && r.toitures.some(t => !t.terrasse)) return { f, zPlafond: f.elevation + f.height };
  }
  return null;
}

function dessinerComble(page: PagePdf, projet: Project, v: CoupeVue, P: (u: number, z: number) => [number, number], Pm: (u: number, z: number) => [number, number]): void {
  const N = niveauSousComble(projet);
  if (!N || !v.maison.length) return;
  const pans = v.C.coupees.filter(c => COUVERTURES.has(c.matiere));
  /* le dessous des pans coupés au droit de u : la plus basse traversée d'un pan au-dessus du plafond */
  const dessous = (u: number): number | null => {
    let z: number | null = null;
    for (const c of pans) c.points.forEach((a, i) => {
      const b = c.points[(i + 1) % c.points.length]!;
      if ((a.u - u) * (b.u - u) > 0 || Math.abs(b.u - a.u) < 1e-6) return;
      const zz = a.z + (b.z - a.z) * (u - a.u) / (b.u - a.u);
      if (zz > N.zPlafond && (z === null || zz < z)) z = zz;
    });
    return z;
  };
  const comp = compositionPlancher(N.f.ceilingRef);
  for (const [a, b] of v.maison) {
    const n = Math.max(8, Math.ceil((b - a) / 100)), haut: { u: number; z: number }[] = [];
    for (let k = 0; k <= n; k++) { const u = a + (b - a) * k / n, z = dessous(u); if (z !== null) haut.push({ u, z }) }
    if (haut.length < 2) continue;
    const ua = haut[0]!.u, ub = haut[haut.length - 1]!.u;
    const comble = [...haut.map(q => P(q.u, q.z)), P(ub, N.zPlafond), P(ua, N.zPlafond)];
    page.polygone(comble, { fond: '#FFFFFF' });
    /* l'isolant posé sur le plafond (les couches se lisent du haut vers le bas) */
    const isolant = comp?.couches.find(c => c.matiere === 'laine_soufflee' || c.matiere === 'laine_minerale');
    if (comp && comp.id !== 'plafond-rampant' && isolant) {
      const dessousIsolant = comp.couches.slice(comp.couches.indexOf(isolant) + 1).reduce((s, c) => s + c.epaisseur, 0);
      const z0 = N.zPlafond + dessousIsolant, z1 = z0 + isolant.epaisseur;
      page.decouper(comble);
      page.polygone([P(ua, z0), P(ub, z0), P(ub, z1), P(ua, z1)], { fond: MATIERES_PLANCHER[isolant.matiere].couleur });
      /* l'ondulation des isolants, comme au plan */
      const [x0, y0] = Pm(ua, z0), [x1] = Pm(ub, z0), [, y1] = Pm(ua, z1), h = y0 - y1, pas = Math.max(1.2, h * 0.9);
      const pts: [number, number][] = [];
      for (let x = x0, k = 0; x <= x1; x += pas / 2, k++) pts.push([X(x), Y(k % 2 ? y1 + h * 0.15 : y0 - h * 0.15)]);
      if (pts.length > 1) page.ligne(pts, 0.25, '#B89B55');
      page.restaurer();
    }
    /* le plafond : un trait */
    page.trait(...P(ua, N.zPlafond), ...P(ub, N.zPlafond), 0.5, ENCRE);
  }
}

/** le bas de la feuille : la légende, les notes, le repérage des coupes */
function basDePage(page: PagePdf, projet: Project, V: CoupeVue[], x: number, y: number, l: number): void {
  const parc = parcelleDuProjet(projet)?.plot, ngf0 = parc?.groundFloorNgf, releve = V.some(v => v.tn);
  const L: LigneLegende[] = [
    { pastille: pastilleTrait('#2A2A2A', 0.6), texte: 'Terrain naturel (TN)' + (releve ? ' – relevé du plan de masse, altitudes NGF' : ' – non relevé : ±0,00 supposé') },
    ...(parc?.finishedGround !== undefined ? [{ pastille: pastilleTrait(TF, 0.8), texte: 'Terrain fini (TF) aux abords – ' + niveauRelatif(parc.finishedGround) + (ngf0 !== undefined ? ' (' + (ngf0 + parc.finishedGround / 1000).toFixed(2).replace('.', ',') + ' NGF)' : '') }] : []),
    { pastille: pastille(TERRE, { trait: '#B9AE9C' }), texte: 'Sol en place' },
    { pastille: pastille('#DCDCDC', { hachures: '#4A4A4A' }), texte: 'Maçonnerie, planchers et charpente (coupés)' },
    ...(() => {
      const N = niveauSousComble(projet), comp = N ? compositionPlancher(N.f.ceilingRef) : null;
      const iso = comp?.id !== 'plafond-rampant' ? comp?.couches.find(c => c.matiere === 'laine_soufflee' || c.matiere === 'laine_minerale') : undefined;
      return iso ? [{ pastille: pastille(MATIERES_PLANCHER[iso.matiere].couleur, { trait: '#B89B55' }), texte: 'Isolant des combles : ' + MATIERES_PLANCHER[iso.matiere].libelle.toLowerCase() + ' ' + Math.round(iso.epaisseur / 10) + ' cm (' + comp!.libelle.toLowerCase() + ')' }] : [];
    })(),
    ...(V.some(v => v.limites.length) ? [{ pastille: pastilleTrait(LIMITE, 0.6, [2.4, 1.6]), texte: 'Limite de propriété' }] : []),
    { pastille: (pg: PagePdf, px: number, py: number) => { pg.trait(X(px), Y(py + 2.5), X(px + 7), Y(py + 2.5), 0.4, ENCRE); pg.polygone([[X(px + 3.5), Y(py + 2.5)], [X(px + 5.2), Y(py + 0.2)], [X(px + 1.8), Y(py + 0.2)]], { fond: '#FFFFFF', trait: ENCRE, ep: 0.4 }) }, texte: 'Repère de niveau (cote / RDC fini et altitude NGF)' },
  ];
  legende(page, x, y, 'LÉGENDE', L, 7, 4.1);
  const tl = tailleLegende('LÉGENDE', L, 1, 7, 4.1).l;
  /* les notes */
  const t = projet.buildings.flatMap(b => b.floors).flatMap(f => { const r = toitureDuNiveau(f); return r?.ok ? r.toitures : [] })[0];
  const fd = fondationsDuProjet(projet)?.fondation;
  const roof = projet.buildings.flatMap(b => b.floors).flatMap(f => Object.values(f.objects)).find(o => o.type === 'roof');
  const notes = [
    'Niveau fini du rez-de-chaussée ±0,00' + (ngf0 !== undefined ? ' = ' + ngf0.toFixed(2).replace('.', ',') + ' NGF' : ' (altitude NGF à préciser)') + '. Cotes de niveau exprimées par rapport au RDC fini' + (ngf0 !== undefined ? ', altitudes NGF entre parenthèses.' : '.'),
    releve ? 'Le terrain naturel est tracé à partir des ' + (parc?.spotHeights?.length ?? 0) + ' points cotés relevés reportés sur le plan de masse (PCMI 2), interpolés le long des plans de coupe. ' + (parc?.finishedGround !== undefined ? 'Terrain fini aux abords à ' + niveauRelatif(parc.finishedGround) + ', raccordé au terrain naturel au-delà' : 'Terrain fini supposé égal au terrain naturel hors de la maison') + ' : déblais et remblais ' + A_PRECISER + '.'
      : parc?.spotHeights?.length ? 'Points cotés relevés, mais l’altitude NGF du ±0,00 n’est pas renseignée (parcelle) : terrain non placé.'
        : 'Le terrain naturel n’est pas relevé : il est supposé au niveau du sol fini (à reporter du plan topographique, outil N).',
    (fd ? 'Plancher du RDC sur ' + SOUBASSEMENTS[fd.kind].toLowerCase() + ' ; ' : '') + (t && roof?.type === 'roof' ? 'égout de toiture à ' + niveauRelatif(t.egoutZ) + ' ; pente ' + roof.pitch + '°.' : ''),
    traitsDeCoupe(projet).length ? 'Traits de coupe tracés sur le plan ; le plan de coupe les prolonge de part en part du bâtiment.' : 'Coupes placées d’elles-mêmes : en travers et en long de la maison, par l’escalier s’il y en a un, jamais le long d’un mur.',
    'Épaisseurs dessinées indicatives : charpente et isolation à préciser au projet.',
  ].filter(Boolean);
  const xn = x + tl + 12, ln = Math.min(140, l - tl - 12 - 82);
  texte(page, 'NOTES', xn, y + 3, 8.5, { gras: true, couleur: '#222222' });
  let yy = y + 8;
  for (const n of notes) { for (const s of couper(n, ln * PT, 6.8)) { texte(page, s, xn, yy, 6.8, { couleur: GRIS_TEXTE }); yy += 3.3 } yy += 1.2 }
  /* le repérage : la parcelle (ou la maison), les traits de coupe et leurs lettres, le nord */
  const rx = x + l - 78, rw = 78, rh = 54;
  page.cadre(X(rx), Y(y + rh), rw * PT, rh * PT, { ep: 0.4, couleur: '#9A9A9A', fond: '#FFFFFF' });
  texte(page, 'Repérage des coupes', rx + 3, y + 4.5, 7.5, { gras: true, couleur: '#222222' });
  const E = empriseAuSol(projet), Q = [...(parc ? parc.contour : []), ...E.flatMap(q => q.contour)];
  if (!Q.length) return;
  const xmin = Math.min(...Q.map(p => p.x)), xmax = Math.max(...Q.map(p => p.x)), ymin = Math.min(...Q.map(p => p.y)), ymax = Math.max(...Q.map(p => p.y));
  const k = Math.min((rw - 22) / Math.max(1, xmax - xmin), (rh - 16) / Math.max(1, ymax - ymin));
  const ox = rx + 5 + (rw - 22 - (xmax - xmin) * k) / 2, oy = y + 8 + (rh - 16 + (ymax - ymin) * k) / 2;
  const M = (p: Point): [number, number] => [X(ox + (p.x - xmin) * k), Y(oy - (p.y - ymin) * k)];
  if (parc) page.polygone(parc.contour.map(M), { fond: '#E3EBD3', trait: ENCRE, ep: 0.5 });
  for (const q of E) page.polygone(q.contour.map(M), { fond: '#BFC4CA', trait: ENCRE, ep: 0.4 });
  for (const v of V) {
    const d = { x: v.l.regard.y, y: -v.l.regard.x }, a = { x: v.l.a.x + d.x * (v.u0 - 0), y: v.l.a.y + d.y * (v.u0 - 0) }, b = { x: v.l.a.x + d.x * v.u1, y: v.l.a.y + d.y * v.u1 };
    const A = M(a), B = M(b);
    page.trait(A[0], A[1], B[0], B[1], 0.5, BRIQUE, [3, 1, 0.6, 1]);
    page.texte(v.l.nom, A[0] - (B[0] - A[0]) * 0.04, A[1] - (B[1] - A[1]) * 0.04 - 2, 7, { gras: true, couleur: BRIQUE, aligne: 'centre' });
    page.texte(v.l.nom, B[0] + (B[0] - A[0]) * 0.04, B[1] + (B[1] - A[1]) * 0.04 - 2, 7, { gras: true, couleur: BRIQUE, aligne: 'centre' });
  }
  nordFleche(page, rx + rw - 8, y + 14, parc?.north ?? 0, 4);
  if (parc?.streetName) texte(page, parc.streetName, rx + rw / 2, y + rh - 2, 5.6, { italique: true, aligne: 'centre', couleur: GRIS_TEXTE });
  void Page;
}
