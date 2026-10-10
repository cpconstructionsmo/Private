/* La planche des façades (PCMI 5), comme celles des dossiers du cabinet :
   les quatre façades à la même échelle (les deux plus longues l'une sous
   l'autre, les deux autres côte à côte dessous), en couleurs — couverture
   rayée de ses rangs, enduit à sa teinte, menuiseries gris anthracite et
   vitrages au reflet clair —, les niveaux à gauche (égout, sol fini, terrain
   naturel), les faîtages au-dessus, sous chaque baie « 0,90 × 1,35 » et
   « allège 0,80 », la longueur de la façade ; à droite, les encadrés
   « Matériaux & teintes » et « Niveaux et lecture des façades ».

   Les façades se déduisent de la maquette (vue3d/facades.ts) : rien n'est
   dessiné à la main. Ce que le projet ne dit pas (teinte des menuiseries,
   terrain fini) s'écrit « à préciser ». */
import type { Floor, Point, Project, Roof } from '../model/types';
import { toitureDuNiveau, baiesExterieures, lignesDeToiture, parcelleDuProjet, altitudeTerrain, mursDroits, ouvertureBatie, GOUTTIERES, MATIERES_GOUTTIERE, type Cote4 } from '../building';
import { maquette, COUVERTURES, type Matiere } from '../vue3d/maquette';
import { facade, type CoteFacade, type Facade, type FaceProjetee } from '../vue3d/facades';
import { materiau, type Materiau } from '../catalogue/materiaux';
import { choixOuvrage, teinteMenuiserie, type OuvrageMenuiserie } from '../catalogue/menuiseries';
import { PagePdf, type DocumentPdf } from './pdf';
import { PT, X, Y, ZONE_DESSIN, ENCRE, GRIS_TEXTE, colonne, nouvelleFeuille, texte, metres, niveauRelatif, echelleGraphique, encadre, orientation, couper, A_PRECISER, ROUGE_MANQUE, type Signature } from './feuille';
import { ECHELLES } from './planche-niveau';

export interface OptionsFacades extends Signature { echelle?: number | undefined; dossier?: boolean | undefined;
  /** une rénovation, une extension (ADR-0007) : les façades de l'état existant (le projet passé à projetExistant), ou du projet */
  etat?: 'existant' | 'projete' | undefined }

/* les teintes des façades des dossiers */
const TEINTES_COUVERTURE: Partial<Record<Matiere, { fond: string; rang: string }>> = {
  ardoise: { fond: '#3E444B', rang: '#5A6169' }, tuile: { fond: '#A65A3E', rang: '#8C4630' }, zinc: { fond: '#8E979E', rang: '#A7AFB5' },
  bac_acier: { fond: '#5B6168', rang: '#737A82' }, vegetalise: { fond: '#7D9B62', rang: '#6A8752' }, gravillons: { fond: '#B8B2A6', rang: '#A39C8F' },
};
const ANTHRACITE = '#3B3F44', VITRE = '#B9C9CE', REFLET = '#D6E1E4', ENDUIT_DEFAUT = '#F2EEE6', TN = '#7A3E2E', TF = '#3F7A3A';
const COUVERTURES_FR: Record<Roof['covering'], string> = { tile: 'tuiles', slate: 'ardoises', zinc: 'zinc', steel: 'bac acier', green: 'toiture végétalisée', gravel: 'toit-terrasse gravillonné' };

/** la normale qui sort de chaque façade, dans le plan */
const NORMALES: Record<CoteFacade, Point> = { sud: { x: 0, y: -1 }, nord: { x: 0, y: 1 }, est: { x: 1, y: 0 }, ouest: { x: -1, y: 0 } };
const COTE_DU_PLAN: Record<CoteFacade, Cote4> = { sud: 'bas', nord: 'haut', est: 'droite', ouest: 'gauche' };
/** l'abscisse vue de face d'un point du plan (comme vue3d/facades.ts) */
const U: Record<CoteFacade, (p: Point) => number> = { sud: p => p.x, nord: p => -p.x, est: p => p.y, ouest: p => -p.y };

interface Repere { u: number; z: number }
interface Baie { u: number; z: number; largeur: number; hauteur: number; allege: number; genre: string }

/** ce qu'il faut savoir d'une façade pour la dessiner : ses faces, ses faîtages, ses baies, son terrain */
interface FacadeVue { cote: CoteFacade; nom: string; sous: string; F: Facade; umin: number; umax: number; mur: [number, number]; zmin: number; zmax: number; faitages: Repere[]; baies: Baie[]; tn: Repere[] | null }

export function plancheFacades(doc: DocumentPdf, projet: Project, o: OptionsFacades): void {
  const page = nouvelleFeuille(doc);
  const M = maquette(projet), t = parcelleDuProjet(projet), nordPlan = t?.plot.north ?? 0;
  const niveaux = projet.buildings.flatMap(b => b.floors);
  const toits = niveaux.flatMap(f => { const r = toitureDuNiveau(f); return r?.ok ? r.toitures.map(x => ({ f, t: x })) : [] });
  const egout = toits.length ? Math.min(...toits.map(x => x.t.egoutZ)) : null;
  const ngf0 = t?.plot.groundFloorNgf, tf = t?.plot.finishedGround;
  /* les étages (un R+1, des combles aménagés) : leur sol fini se repère aux façades, comme le RDC */
  const etages = niveauxEtages(projet);
  /* la façade sur la voie (si la parcelle le dit) : celle dont la normale va vers le milieu du côté sur voie */
  const voie = t && t.plot.street.length ? (() => {
    const C = t.plot.contour, i = t.plot.street[0]!, a = C[i]!, b = C[(i + 1) % C.length]!;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  })() : null;
  const centre = (() => { const P = niveaux.flatMap(f => mursDroits(f).flatMap(w => [w.axis.a, w.axis.b])); return P.length ? { x: P.reduce((s, p) => s + p.x, 0) / P.length, y: P.reduce((s, p) => s + p.y, 0) / P.length } : { x: 0, y: 0 } })();
  const surRue = (c: CoteFacade) => { if (!voie) return false; const d = { x: voie.x - centre.x, y: voie.y - centre.y }, L = Math.hypot(d.x, d.y) || 1; return (NORMALES[c].x * d.x + NORMALES[c].y * d.y) / L > 0.7 };

  const vues: FacadeVue[] = (['sud', 'nord', 'est', 'ouest'] as const).map(c => {
    const F = facade(M, c), u = U[c];
    const murs = F.faces.filter(f => f.matiere === 'mur' || f.matiere === 'parement').flatMap(f => f.points.map(q => q.u));
    const B = F.boite ?? { umin: 0, umax: 0, zmin: 0, zmax: 0 };
    /* les faîtages vus de ce côté : chaque faîtage (son milieu), et le sommet d'un toit en pavillon */
    const faitages: Repere[] = [];
    for (const { t: x } of toits) {
      const L = lignesDeToiture(x).filter(l => l.genre === 'faitage');
      for (const l of L) faitages.push({ u: (u(l.a) + u(l.b)) / 2, z: Math.max(l.a.z, l.b.z) });
      if (!L.length && x.pans.length) { const s = x.pans.flatMap(p => p.contour.map(q => ({ q, z: p.plan.a * q.x + p.plan.b * q.y + p.plan.c }))).reduce((m, k) => (k.z > m.z ? k : m)); faitages.push({ u: u(s.q), z: s.z }) }
    }
    const reunis: Repere[] = [];
    for (const r of faitages.sort((a, b) => b.z - a.z)) if (!reunis.some(q => Math.abs(q.z - r.z) < 40 && Math.abs(q.u - r.u) < 2_500)) reunis.push(r);
    const baies: Baie[] = niveaux.flatMap(f => baiesExterieures(f).filter(b => b.cote === COTE_DU_PLAN[c]).map(b => ({
      u: c === 'sud' || c === 'est' ? (b.de + b.a) / 2 : -(b.de + b.a) / 2, z: f.elevation + b.ouverture.sill,
      largeur: b.ouverture.width, hauteur: b.ouverture.height, allege: b.ouverture.sill, genre: b.ouverture.kind })));
    /* le terrain naturel au pied de la façade, s'il est relevé et placé (altitudes relatives au ±0,00) */
    let tn: Repere[] | null = null;
    if (t && ngf0 !== undefined && t.plot.spotHeights?.length && murs.length) {
      const n = NORMALES[c], ext = niveaux.flatMap(f => mursDroits(f).flatMap(w => [w.axis.a, w.axis.b]));
      const avant = Math.max(...ext.map(p => p.x * n.x + p.y * n.y)) + 500;
      tn = [];
      /* jusqu'à 60 cm au-delà du débord, comme le terrain fini : la façade voisine sur la planche garde ses niveaux */
      for (let k = 0; k <= 40; k++) {
        const uu = B.umin - 600 + (B.umax - B.umin + 1_200) * k / 40;
        /* le point du plan vu en uu, au pied de la façade */
        const p = c === 'sud' ? { x: uu, y: -avant } : c === 'nord' ? { x: -uu, y: avant } : c === 'est' ? { x: avant, y: uu } : { x: -avant, y: -uu };
        const z = altitudeTerrain(t.plot, p);
        if (z !== null) tn.push({ u: uu, z: (z - ngf0) * 1000 });
      }
      if (tn.length < 2) tn = null;
    }
    const nom = 'FAÇADE ' + orientation(NORMALES[c], nordPlan).toUpperCase() + (o.etat === 'existant' ? ' – ÉTAT EXISTANT' : o.etat === 'projete' ? ' – ÉTAT PROJETÉ' : '');
    const sous = (surRue(c) ? 'sur rue' + (t?.plot.streetName ? ' ' + (/^(rue|avenue|chemin|route|impasse|allée|place|boulevard)\b/i.test(t.plot.streetName) ? 'de la ' : '') + t.plot.streetName : '') + ' – ' : '');
    const zt = tn?.map(q => q.z) ?? [];
    return { cote: c, nom, sous, F, umin: B.umin, umax: B.umax, mur: [murs.length ? Math.min(...murs) : B.umin, murs.length ? Math.max(...murs) : B.umax] as [number, number],
      zmin: Math.min(B.zmin, 0, ...zt), zmax: B.zmax, faitages: reunis, baies, tn };
  });
  /* l'ordre de la planche : les deux plus longues l'une sous l'autre (celle sur rue d'abord), les deux autres dessous */
  const larg = (v: FacadeVue) => v.umax - v.umin;
  const paires = [[vues[0]!, vues[1]!], [vues[2]!, vues[3]!]].sort((a, b) => Math.max(larg(b[0]!), larg(b[1]!)) - Math.max(larg(a[0]!), larg(a[1]!)));
  const [h1, h2] = paires[0]!.sort((a, b) => Number(surRue(b.cote)) - Number(surRue(a.cote)) || (a.cote === 'nord' ? -1 : 1));
  const [b1, b2] = paires[1]!;
  const Z = { x: ZONE_DESSIN.x + 4, y: ZONE_DESSIN.y + 3, l: ZONE_DESSIN.l - 8, h: ZONE_DESSIN.h - 6 };
  const PANNEAU = 106;
  const hauteur = (v: FacadeVue, e: number) => (v.zmax - Math.min(v.zmin, -200)) / e + HAUT + BAS + 6.5 * (rangsDeBaies(v, e) - 1);
  const largeur = (v: FacadeVue, e: number) => (v.umax - v.umin) / e + GAUCHE;
  const panneaux = contenuPanneaux(projet, toits.map(x => x.f), egout, vues);
  const hPanneaux = (e: number) => panneaux.reduce((s, p) => s + p.hauteur(e) + 6, 0);
  /* les encadrés à droite des deux premières façades ; s'ils descendent plus bas, la troisième rangée les évite par la gauche */
  /* la hauteur laissée libre se partage entre les trois rangées */
  const ecart = (e: number) => Math.max(0, (Z.h - hauteur(h1!, e) - hauteur(h2!, e) - Math.max(hauteur(b1!, e), hauteur(b2!, e))) / 3);
  const tient = (e: number) => {
    const r12 = hauteur(h1!, e) + hauteur(h2!, e) + 2 * ecart(e), r3 = Math.max(hauteur(b1!, e), hauteur(b2!, e));
    if (Math.max(largeur(h1!, e), largeur(h2!, e)) > Z.l - PANNEAU - 6 || hauteur(h1!, e) + hauteur(h2!, e) + r3 > Z.h) return false;
    const deborde = hPanneaux(e) > r12 + 2;
    return largeur(b1!, e) + largeur(b2!, e) + 6 <= Z.l - (deborde ? PANNEAU + 6 : 0) || (!deborde && largeur(b1!, e) + largeur(b2!, e) + 6 <= Z.l);
  };
  const ech = o.echelle ?? (ECHELLES.find(tient) ?? ECHELLES[ECHELLES.length - 1]!);

  /* les façades */
  let y = Z.y + ecart(ech) / 2;
  for (const v of [h1!, h2!]) { dessinerFacade(page, v, Z.x, y, ech, egout, ngf0, tf, etages); y += hauteur(v, ech) + ecart(ech) }
  const y3 = y;
  dessinerFacade(page, b1!, Z.x, y3, ech, egout, ngf0, tf, etages);
  const libre = hPanneaux(ech) > y3 - Z.y + 2 ? Z.l - PANNEAU - 6 : Z.l;
  /* la seconde au milieu de la place libre, mais à 14 mm au moins de la première (son terrain dépasse du débord) */
  dessinerFacade(page, b2!, Z.x + Math.max(largeur(b1!, ech) + 6, Math.min(Math.max((libre - 6) / 2 + 3, largeur(b1!, ech) + 14), libre - largeur(b2!, ech))), y3, ech, egout, ngf0, tf, etages);

  /* les encadrés, à droite des deux premières façades */
  const px = Z.x + Z.l - PANNEAU;
  let py = Z.y + 2;
  for (const p of panneaux) {
    const h = p.hauteur(ech);
    const yy = encadre(page, px, py, PANNEAU, h, p.titre);
    p.dessiner(page, px + 4, yy, ech);
    py += h + 6;
  }
  colonne(page, projet, o, 'Façades', o.etat === 'existant' ? 'état existant' : o.etat === 'projete' ? 'état projeté' : 'et toitures', o.dossier ? 'PCMI 5' : 'Façades', ech);
}

/** une façade dessinée : (x0, y0) le coin haut-gauche de sa case */
/** les niveaux au-dessus du RDC qui portent des murs, du plus bas au plus haut */
function niveauxEtages(projet: Project): Floor[] {
  return projet.buildings.flatMap(b => b.floors).filter(f => f.elevation > 0 && mursDroits(f).length).sort((a, b) => a.elevation - b.elevation);
}

function dessinerFacade(page: PagePdf, v: FacadeVue, x0: number, y0: number, e: number, egout: number | null, ngf0: number | undefined, tf?: number, etages: readonly Floor[] = []): void {
  const xl = x0 + GAUCHE, ySol = y0 + HAUT + v.zmax / e;
  const P = (u: number, z: number): [number, number] => [X(xl + (u - v.umin) / e), Y(ySol - z / e)];
  const Pm = (u: number, z: number): [number, number] => [xl + (u - v.umin) / e, ySol - z / e];
  if (!v.F.boite) { texte(page, 'Rien à dessiner.', x0 + 4, y0 + 12, 8, { couleur: GRIS_TEXTE }); return }
  /* la profondeur du nu de la façade : un mur en retrait se teinte un peu plus sombre */
  const murs = v.F.faces.filter(f => f.matiere === 'mur');
  const nu = murs.length ? Math.min(...murs.map(f => f.profondeur)) : 0;
  const pans = v.F.faces.filter(f => TEINTES_COUVERTURE[f.matiere]);
  for (const f of v.F.faces) peindre(page, f, P, e, nu);
  /* « pente 35° » sur le plus grand pan */
  const grand = pans.map(f => ({ f, a: Math.abs(f.points.reduce((s, q, i) => { const r = f.points[(i + 1) % f.points.length]!; return s + q.u * r.z - r.u * q.z }, 0)) })).sort((a, b) => b.a - a.a)[0];
  const pente = grand ? penteDe(v) : null;
  if (grand && pente) {
    const c = grand.f.points.reduce((s, q) => ({ u: s.u + q.u / grand.f.points.length, z: s.z + q.z / grand.f.points.length }), { u: 0, z: 0 });
    const [cx, cy] = P(c.u, c.z);
    page.texte('pente ' + pente + '°', cx, cy, 6.5, { gras: true, aligne: 'centre', couleur: '#FFFFFF' });
  }
  /* le terrain fini (vert) à son niveau aux abords (au ±0,00 s'il n'est pas saisi), le terrain naturel relevé en tirets */
  const [g0] = Pm(v.umin - 600, 0), [g1] = Pm(v.umax + 600, 0), yTf = ySol - (tf ?? 0) / e;
  /* sa valeur est à l'encadré « Niveaux » (comme aux dossiers du cabinet) : une étiquette ici gênerait la façade voisine */
  page.trait(X(g0), Y(yTf), X(g1), Y(yTf), 0.9, TF);
  if (v.tn) page.ligne(v.tn.map(q => P(q.u, q.z)), 0.5, TN, [2.2, 1.6]);
  /* les niveaux, à gauche : égout, sol fini, terrain naturel */
  const nv = (z: number, t: string, sous: string, plein: boolean, gras = true) => {
    const yy = ySol - z / e, xt = x0 + GAUCHE - 6;
    page.polygone([[X(xt), Y(yy - 0.3)], [X(xt + 1.7), Y(yy - 2.6)], [X(xt - 1.7), Y(yy - 2.6)]], plein ? { fond: ENCRE } : { fond: '#FFFFFF', trait: ENCRE, ep: 0.4 });
    texte(page, t, xt - 3, yy - 0.8, 7.5, { gras, aligne: 'droite', couleur: '#222222' });
    if (sous) texte(page, sous, xt - 3, yy + 2.4, 5.6, { italique: true, aligne: 'droite', couleur: GRIS_TEXTE });
    page.trait(X(xt + 1.8), Y(yy), X(xl + (v.mur[0] - v.umin) / e), Y(yy), 0.2, '#8A8A8A', [0.6, 0.8]);
  };
  if (egout !== null) nv(egout, niveauRelatif(egout), 'égout', true);
  nv(0, '±0,00', 'RDC fini' + (ngf0 !== undefined ? ' ' + ngf0.toFixed(2).replace('.', ',') : ''), true);
  /* le sol fini des étages, en creux ; trop près de l'égout, il ne se lit qu'à l'encadré « Niveaux » */
  for (const f of etages) if (egout === null || Math.abs(f.elevation - egout) / e > 6.5) nv(f.elevation, niveauRelatif(f.elevation), f.name + ' fini', false);
  if (v.tn) { const q = v.tn[0]!; texte(page, 'TN ' + niveauRelatif(q.z), x0 + GAUCHE - 8, ySol - q.z / e + 4.6, 6, { aligne: 'droite', couleur: TN }); const r = v.tn[v.tn.length - 1]!; const [rx, ry] = Pm(r.u, r.z); texte(page, niveauRelatif(r.z), rx, ry + 3.4, 6, { aligne: 'droite', couleur: TN }) }
  /* les faîtages, au-dessus : le plus haut plein, les autres creux */
  const zmax = Math.max(...v.faitages.map(f => f.z), -Infinity);
  /* seuls les faîtages vus (au bord de la silhouette du toit), le plus haut et trois autres au plus */
  const vus = v.faitages.filter(f => f.z >= silhouette(v, f.u) - 60).slice(0, 4);
  for (const f of vus) {
    const [fx, fy] = Pm(f.u, f.z), haut = Math.abs(f.z - zmax) < 5;
    page.polygone([[X(fx), Y(fy - 0.8)], [X(fx + 1.7), Y(fy - 3.1)], [X(fx - 1.7), Y(fy - 3.1)]], haut ? { fond: ENCRE } : { fond: '#FFFFFF', trait: ENCRE, ep: 0.4 });
    texte(page, niveauRelatif(f.z), fx, fy - 4.2, haut ? 7.5 : 6.5, { gras: haut, aligne: 'centre', couleur: haut ? '#222222' : GRIS_TEXTE });
  }
  /* sous chaque baie : sa largeur × hauteur, et l'allège ; un trait pointillé les relie */
  const zbas = Math.min(v.zmin, -200), yl = ySol - zbas / e + 4.5;
  const pris: [number, number][] = [];
  for (const b of [...v.baies].sort((a, c) => a.u - c.u)) {
    const [bx, by] = Pm(b.u, b.z);
    const t = metres(b.largeur) + ' × ' + metres(b.hauteur), lt = PagePdf.largeur(t, 6.5) / PT;
    let ly = yl;
    while (pris.some(([a, c]) => Math.abs(a - bx) < (lt + c) / 2 + 1.5 && Math.abs(ly - yl) < 1)) ly += 6.5;
    pris.push([bx, lt]);
    page.trait(X(bx), Y(by + 0.6), X(bx), Y(ly - 3), 0.2, '#6A6A6A', [0.5, 0.7]);
    texte(page, t, bx, ly, 6.5, { aligne: 'centre', couleur: '#222222' });
    if (b.allege > 0 && b.genre !== 'door' && b.genre !== 'garage_door') texte(page, 'allège ' + metres(b.allege), bx, ly + 2.8, 5.4, { italique: true, aligne: 'centre', couleur: GRIS_TEXTE });
  }
  /* la longueur de la façade (nu des murs) */
  const yc = yl + 7.5 + 6.5 * (rangsDeBaies(v, e) - 1), [a] = Pm(v.mur[0], 0), [b] = Pm(v.mur[1], 0);
  page.trait(X(a), Y(yc), X(b), Y(yc), 0.35, ENCRE);
  for (const x of [a, b]) { page.trait(X(x - 1), Y(yc + 1), X(x + 1), Y(yc - 1), 0.5, ENCRE); page.trait(X(x), Y(yc - 2.5), X(x), Y(yc + 1.2), 0.25, ENCRE) }
  texte(page, metres(v.mur[1] - v.mur[0]), (a + b) / 2, yc - 1.2, 7.5, { gras: true, aligne: 'centre', couleur: '#222222' });
  /* le titre de la façade */
  const yt = yc + 6;
  texte(page, v.nom, x0 + 1, yt, 11, { gras: true, couleur: '#222222' });
  texte(page, v.sous + 'échelle 1/' + e, x0 + 3 + PagePdf.largeur(v.nom, 11, { gras: true }) / PT, yt, 7, { couleur: GRIS_TEXTE });
}

/** la place à gauche de chaque façade (cotes de niveau), au-dessus (faîtages) et dessous (baies, longueur, titre) : mm */
const GAUCHE = 17, HAUT = 6, BAS = 20;

/** le haut du toit vu en u : la plus haute des faces de couverture qui passent par cette verticale */
function silhouette(v: FacadeVue, u: number): number {
  let z = -Infinity;
  for (const f of v.F.faces) {
    if (!TEINTES_COUVERTURE[f.matiere]) continue;
    const P = f.points;
    for (let i = 0; i < P.length; i++) {
      const a = P[i]!, b = P[(i + 1) % P.length]!;
      if ((a.u - u) * (b.u - u) > 0 || a.u === b.u) { if (Math.abs(a.u - u) < 1) z = Math.max(z, a.z); continue }
      z = Math.max(z, a.z + (b.z - a.z) * (u - a.u) / (b.u - a.u));
    }
  }
  return z;
}

/** le nombre de rangées d'étiquettes de baies (elles se décalent quand elles se chevauchent) */
function rangsDeBaies(v: FacadeVue, e: number): number {
  const pris: [number, number, number][] = [];
  let n = 1;
  for (const b of [...v.baies].sort((a, c) => a.u - c.u)) {
    const x = b.u / e, l = PagePdf.largeur(metres(b.largeur) + ' × ' + metres(b.hauteur), 6.5) / PT;
    let r = 0;
    while (pris.some(([a, c, k]) => k === r && Math.abs(a - x) < (l + c) / 2 + 1.5)) r++;
    pris.push([x, l, r]); n = Math.max(n, r + 1);
  }
  return n;
}

/** la pente de la toiture (degrés), si elle est la même partout */
function penteDe(v: FacadeVue): number | null { void v; return PENTE.valeur }
const PENTE: { valeur: number | null } = { valeur: null };

/** une face peinte : sa teinte, puis son motif (rangs de couverture, lames de porte de garage, reflet du vitrage) */
export function peindre(page: PagePdf, f: FaceProjetee, P: (u: number, z: number) => [number, number], e: number, nu: number): void {
  const Q = f.points.map(q => P(q.u, q.z));
  if (Q.length < 3) return;
  const cv = TEINTES_COUVERTURE[f.matiere];
  /* une gouttière, une descente (zinc des eaux pluviales) : une bande anthracite unie, sans joints */
  if (cv && f.matiere === 'zinc') {
    const zs = f.points.map(q => q.z), us = f.points.map(q => q.u);
    if (Math.max(...zs) - Math.min(...zs) < 250 || Math.max(...us) - Math.min(...us) < 250) { page.polygone(Q, { fond: ANTHRACITE }); return }
  }
  if (cv) {
    page.polygone(Q, { fond: cv.fond });
    /* les rangs de la couverture : un trait clair tous les 32 cm de hauteur (vus de face) */
    const zs = f.points.map(q => q.z), z0 = Math.min(...zs), z1 = Math.max(...zs), us = f.points.map(q => q.u);
    page.decouper(Q);
    for (let z = z0 + 160; z < z1; z += 320) { const a = P(Math.min(...us), z), b = P(Math.max(...us), z); page.trait(a[0], a[1], b[0], b[1], 0.25, cv.rang) }
    page.restaurer();
    page.polygone(Q, { trait: '#1E1E1E', ep: 0.45 });
    return;
  }
  switch (f.matiere) {
    case 'mur': case 'parement': case 'plancher': {
      const m = materiau(f.finition), base = m?.couleur ?? ENDUIT_DEFAUT, fond = f.profondeur > nu + 300 ? assombrir(base, 0.9) : base;
      page.polygone(Q, { fond });
      /* le motif du parement : pierres et briques en rangs décalés, lames de bardage */
      if (m?.pas && m.motif && m.motif !== 'uni') {
        const us = f.points.map(q => q.u), zs = f.points.map(q => q.z), u0 = Math.min(...us), u1 = Math.max(...us), z0 = Math.min(...zs), z1 = Math.max(...zs);
        const trait = assombrir(fond, 0.8);
        page.decouper(Q);
        if (m.motif === 'lames_v') for (let u = u0 + m.pas; u < u1; u += m.pas) { const a = P(u, z0), b = P(u, z1); page.trait(a[0], a[1], b[0], b[1], 0.2, trait) }
        else {
          const L = m.motif === 'pierres' ? m.pas * 2 : m.motif === 'briques' ? m.pas * 3 : 0;
          for (let z = z0, k = 0; z < z1; z += m.pas, k++) {
            const a = P(u0, z), b = P(u1, z); page.trait(a[0], a[1], b[0], b[1], 0.25, trait);
            if (L) for (let u = u0 + (k % 2 ? L / 2 : 0) + (k * 37 % 5) * L / 9; u < u1; u += L * (0.8 + (k * 13 % 5) / 10)) { const c = P(u, z), d = P(u, Math.min(z1, z + m.pas)); page.trait(c[0], c[1], d[0], d[1], 0.25, trait) }
          }
        }
        page.restaurer();
      }
      page.polygone(Q, { trait: '#2A2A2A', ep: 0.3 });
      return;
    }
    case 'vitrage': {
      page.polygone(Q, { fond: VITRE });
      /* le reflet : un triangle clair dans l'angle haut-gauche */
      const us = f.points.map(q => q.u), zs = f.points.map(q => q.z), u0 = Math.min(...us), u1 = Math.max(...us), z0 = Math.min(...zs), z1 = Math.max(...zs);
      page.decouper(Q);
      page.polygone([P(u0, z1), P(u0 + (u1 - u0) * 0.75, z1), P(u0, z1 - (z1 - z0) * 0.42)], { fond: REFLET });
      page.restaurer();
      page.polygone(Q, { trait: ANTHRACITE, ep: 0.35 });
      return;
    }
    case 'menuiserie': page.polygone(Q, { fond: teinte(f.finition), trait: '#202224', ep: 0.25 }); return;
    case 'appui': page.polygone(Q, { fond: '#E4E4E4', trait: '#6A6A6A', ep: 0.25 }); return;
    case 'porte': {
      page.polygone(Q, { fond: teinte(f.finition), trait: '#202224', ep: 0.35 });
      /* la poignée : un trait clair vertical près d'un bord */
      const us = f.points.map(q => q.u), zs = f.points.map(q => q.z), u1 = Math.max(...us), z0 = Math.min(...zs);
      const a = P(u1 - 110, z0 + 950), b = P(u1 - 110, z0 + 1_150);
      page.trait(a[0], a[1], b[0], b[1], 0.7, '#C9CDD1');
      return;
    }
    case 'garage': {
      page.polygone(Q, { fond: teinte(f.finition), trait: '#202224', ep: 0.35 });
      const us = f.points.map(q => q.u), zs = f.points.map(q => q.z), u0 = Math.min(...us), u1 = Math.max(...us);
      page.decouper(Q);
      for (let z = Math.min(...zs) + 250; z < Math.max(...zs); z += 250) { const a = P(u0, z), b = P(u1, z); page.trait(a[0], a[1], b[0], b[1], 0.25, '#5E646B') }
      page.restaurer();
      return;
    }
    default: page.polygone(Q, { fond: '#FFFFFF', trait: '#2A2A2A', ep: 0.25 }); void e;
  }
}

/** la teinte d'une menuiserie, d'une porte : celle choisie au dossier, sinon le gris anthracite des dossiers du cabinet */
const teinte = (id?: string) => teinteMenuiserie(id)?.couleur ?? ANTHRACITE;

function assombrir(c: string, k: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return c;
  const v = parseInt(m[1]!, 16), f = (x: number) => Math.round(x * k).toString(16).padStart(2, '0');
  return '#' + f(v >> 16 & 255) + f(v >> 8 & 255) + f(v & 255);
}

/** le motif d'un parement dans sa pastille (13 × 6,5 mm) : rangs de pierres ou de briques aux joints décalés, lames */
function motifPastille(m: Materiau): ((page: PagePdf, x: number, y: number) => void) | undefined {
  if (!m.pas || m.motif === 'uni') return undefined;
  const joint = assombrir(m.couleur, 0.72);
  return (page, x, y) => {
    if (m.motif === 'lames_v') { for (let k = 1; k < 6; k++) page.trait(X(x + k * 13 / 6), Y(y), X(x + k * 13 / 6), Y(y + 6.5), 0.25, joint); return }
    const rangs = m.motif === 'lames_h' ? 4 : 3, h = 6.5 / rangs;
    for (let k = 1; k < rangs; k++) page.trait(X(x), Y(y + k * h), X(x + 13), Y(y + k * h), 0.25, joint);
    if (m.motif === 'lames_h') return;
    const pas = m.motif === 'briques' ? 3.2 : 4.4;
    for (let k = 0; k < rangs; k++) for (let u = x + (k % 2 ? pas / 2 : pas); u < x + 13 - 0.5; u += pas) page.trait(X(u), Y(y + k * h), X(u), Y(y + (k + 1) * h), 0.25, joint);
  };
}

interface Panneau { titre: string; hauteur: (e: number) => number; dessiner: (page: PagePdf, x: number, y: number, e: number) => void }

/** les deux encadrés de la planche : matériaux et teintes ; niveaux et lecture */
function contenuPanneaux(projet: Project, niveauxToit: Floor[], egout: number | null, vues: FacadeVue[]): Panneau[] {
  const D = projet.dossier ?? {}, niveaux = projet.buildings.flatMap(b => b.floors);
  const roof = niveauxToit.flatMap(f => Object.values(f.objects)).find((x): x is Roof => x.type === 'roof');
  PENTE.valeur = roof && roof.kind !== 'flat' ? roof.pitch : null;
  /* les matériaux : couverture, parements des murs extérieurs (le plus étendu d'abord), menuiseries, portes, gouttières */
  type Ligne = { pastille: (page: PagePdf, x: number, y: number) => void; titre: string; texte: string; manque?: boolean };
  const L: Ligne[] = [];
  const sw = (fond: string, motif?: (page: PagePdf, x: number, y: number) => void) => (page: PagePdf, x: number, y: number) => {
    page.cadre(X(x), Y(y + 6.5), 13 * PT, 6.5 * PT, { ep: 0.3, couleur: '#6A6A6A', fond });
    if (motif) motif(page, x, y);
  };
  if (roof) {
    const cv = TEINTES_COUVERTURE[COUVERTURES[roof.covering]] ?? { fond: '#CCCCCC', rang: '#AAAAAA' };
    L.push({ pastille: sw(cv.fond, (page, x, y) => { for (let k = 1; k < 6; k++) page.trait(X(x), Y(y + k * 1.1), X(x + 13), Y(y + k * 1.1), 0.25, cv.rang) }),
      titre: 'Couverture', texte: (D.couverture?.trim() || COUVERTURES_FR[roof.covering]) + (roof.kind !== 'flat' ? ', pente ' + roof.pitch + '°' : '') });
    /* une extension (ADR-0007) : sa toiture à elle, quand ses réglages diffèrent */
    const x = roof.extension, aExtension = niveauxToit.some(f => { const t = toitureDuNiveau(f); return !!t?.ok && t.toitures.some(y => y.extension) });
    if (x && aExtension) {
      const cx = TEINTES_COUVERTURE[COUVERTURES[x.covering ?? roof.covering]] ?? cv;
      L.push({ pastille: sw(cx.fond, (page, px, py) => { for (let k = 1; k < 6; k++) page.trait(X(px), Y(py + k * 1.1), X(px + 13), Y(py + k * 1.1), 0.25, cx.rang) }),
        titre: 'Couverture de l’extension', texte: COUVERTURES_FR[x.covering ?? roof.covering] + (x.kind !== 'flat' ? ', pente ' + x.pitch + '°' : '') + (x.kind === 'shed' ? ', un pan' : x.kind === 'flat' ? ', toit-terrasse' : '') });
    }
  }
  const parements = new Map<string, { m: Materiau; longueur: number }>();
  /* les décors (un autre parement sur une partie d'une façade), à part : chacun sous son nom */
  const decors = new Map<string, { m: Materiau; titre: string }>();
  let sansParement = false;
  for (const f of niveaux) for (const w of mursDroits(f)) if (w.role === 'exterior') {
    const m = materiau(w.finish), l = Math.hypot(w.axis.b.x - w.axis.a.x, w.axis.b.y - w.axis.a.y);
    let pris = 0;
    for (const z of w.finishZones ?? []) {
      const mz = materiau(z.finish), lz = Math.max(0, Math.min(l, z.to) - Math.max(0, z.from));
      if (!mz || !lz) continue;
      pris += lz;
      const titre = z.label?.trim() || 'Façades (partie)';
      decors.set(titre + '|' + mz.id, { m: mz, titre });
    }
    if (l - pris <= 1) continue;
    if (m) { const k = parements.get(m.libelle) ?? { m, longueur: 0 }; k.longueur += l - pris; parements.set(m.libelle, k) } else sansParement = true;
  }
  const P = [...parements].sort((a, b) => b[1].longueur - a[1].longueur);
  P.forEach(([lib, k], i) => L.push({ pastille: sw(k.m.couleur, motifPastille(k.m)), titre: i === 0 ? 'Façades' : 'Façades (partie)', texte: lib }));
  if (sansParement) L.push({ pastille: sw(ENDUIT_DEFAUT), titre: P.length ? 'Autres façades' : 'Façades', texte: 'parement ' + A_PRECISER, manque: true });
  for (const { m, titre } of decors.values()) L.push({ pastille: sw(m.couleur, motifPastille(m)), titre, texte: m.libelle });
  /* les baies du projet : celles des murs bâtis, ni bouchées ni déposées */
  const ouv = niveaux.flatMap(f => { const M = new Set(mursDroits(f).map(w => w.id)); return Object.values(f.objects).filter(x => x.type === 'opening' && ouvertureBatie(x) && M.has(x.hostWallId)) });
  const volets = ouv.some(x => x.type === 'opening' && (x.shutter === 'roller_motorized' || x.shutter === 'roller_manual'));
  /* menuiseries, porte d'entrée, porte de garage : le matériau et la teinte choisis (informations du dossier), ou ce qui manque */
  const decrit = (q: OuvrageMenuiserie, genre: 'e' | 'es') => {
    const c = choixOuvrage(D, q), t = teinteMenuiserie(c.teinte);
    const texte = [c.materiau ?? 'matériau ' + A_PRECISER, t ? t.libelle : 'dessiné' + genre + ' gris anthracite – teinte ' + A_PRECISER].join(' – ');
    return { couleur: t?.couleur ?? ANTHRACITE, texte, manque: !c.materiau || !t };
  };
  if (ouv.some(x => x.type === 'opening' && (x.kind === 'window' || x.kind === 'french_window' || x.kind === 'bay'))) {
    const d = decrit('menuiseries', 'es');
    L.push({ pastille: sw(d.couleur, (page, x, y) => page.cadre(X(x + 2), Y(y + 4.8), 9 * PT, 3.2 * PT, { ep: 0, fond: VITRE })), titre: 'Menuiseries', texte: d.texte + (volets ? ' – volets roulants intégrés' : ''), manque: d.manque });
  }
  if (ouv.some(x => x.type === 'opening' && x.kind === 'door')) { const d = decrit('porteEntree', 'e'); L.push({ pastille: sw(d.couleur), titre: 'Porte d’entrée', texte: d.texte, manque: d.manque }) }
  if (ouv.some(x => x.type === 'opening' && x.kind === 'garage_door')) {
    const d = decrit('porteGarage', 'e');
    L.push({ pastille: sw(d.couleur, (page, x, y) => { for (let k = 1; k < 4; k++) page.trait(X(x), Y(y + k * 1.6), X(x + 13), Y(y + k * 1.6), 0.25, '#5E646B') }), titre: 'Porte de garage', texte: d.texte, manque: d.manque });
  }
  if (roof?.gutter && roof.gutter !== 'none')
    L.push({ pastille: (page, x, y) => { page.cadre(X(x), Y(y + 1.6), 13 * PT, 1.6 * PT, { ep: 0, fond: ANTHRACITE }); page.cadre(X(x + 9), Y(y + 6.5), 1.4 * PT, 4.9 * PT, { ep: 0, fond: ANTHRACITE }) },
      titre: 'Gouttières et descentes EP', texte: GOUTTIERES[roof.gutter] + (roof.gutterMaterial ? ' – ' + MATIERES_GOUTTIERE[roof.gutterMaterial] : '') });
  /* chaque matériau prend la hauteur de son texte (une ou deux lignes sous son nom) */
  const textes = L.map(l => couper(l.texte, 84 * PT, 6.8).slice(0, 2)), hl = textes.map(t => Math.max(9.5, 4 + t.length * 3 + 2.6));
  const materiaux: Panneau = {
    titre: 'MATÉRIAUX & TEINTES', hauteur: () => 14 + hl.reduce((s, h) => s + h, 0) + 6,
    dessiner: (page, x, y) => {
      let yy = y;
      L.forEach((l, i) => {
        l.pastille(page, x, yy);
        texte(page, l.titre, x + 17, yy + 2.6, 7.5, { gras: true, couleur: '#222222' });
        textes[i]!.forEach((t, k) => texte(page, t, x + 17, yy + 6 + k * 3, 6.8, { couleur: t.includes(A_PRECISER) ? ROUGE_MANQUE : GRIS_TEXTE }));
        yy += hl[i]!;
      });
      texte(page, 'Teintes indicatives à l’écran et à l’impression : se référer aux nuanciers des fabricants.', x, yy + 1.5, 5.8, { italique: true, couleur: GRIS_TEXTE });
    },
  };
  /* les niveaux */
  const ngf0 = parcelleDuProjet(projet)?.plot.groundFloorNgf, tf = parcelleDuProjet(projet)?.plot.finishedGround, ngf = (z: number) => (ngf0! + z / 1000).toFixed(2).replace('.', ',');
  const fait = [...new Set(vues.flatMap(v => v.faitages.map(f => Math.round(f.z / 10) * 10)))].sort((a, b) => b - a);
  const relevé = vues.some(v => v.tn);
  const lignes: { pastille: (page: PagePdf, x: number, y: number) => void; titre: string; texte: string }[] = [
    { pastille: (page, x, y) => page.trait(X(x + 1), Y(y + 3), X(x + 12), Y(y + 3), 0.5, TN, [2.2, 1.6]), titre: 'TN – terrain naturel',
      texte: relevé ? 'relevé du plan de masse (altitudes relatives' + (ngf0 !== undefined ? ', RDC fini = ' + ngf0.toFixed(2).replace('.', ',') : '') + ')' : 'non relevé : à reporter du plan topographique (outil N)' },
    { pastille: (page, x, y) => page.trait(X(x + 1), Y(y + 3), X(x + 12), Y(y + 3), 0.9, TF), titre: 'TF – terrain fini',
      texte: tf !== undefined ? 'abords de la construction : ' + niveauRelatif(tf) + (ngf0 !== undefined ? ' (' + ngf(tf) + ')' : '') : 'abords dessinés au niveau du sol fini – ' + A_PRECISER },
    { pastille: (page, x, y) => page.polygone([[X(x + 6.5), Y(y + 4.2)], [X(x + 8.3), Y(y + 1.8)], [X(x + 4.7), Y(y + 1.8)]], { fond: ENCRE }), titre: 'Niveaux réglementaires',
      texte: 'RDC fini ±0,00' + (ngf0 !== undefined ? ' = ' + ngf(0) : '') + niveauxEtages(projet).map(f => ' – ' + f.name + ' fini ' + niveauRelatif(f.elevation)).join('') + (egout !== null ? ' – égout ' + niveauRelatif(egout) : '') + (fait.length ? ' – faîtage ' + niveauRelatif(fait[0]!) : '') },
    ...(fait.length > 1 ? [{ pastille: (page: PagePdf, x: number, y: number) => page.polygone([[X(x + 6.5), Y(y + 4.2)], [X(x + 8.3), Y(y + 1.8)], [X(x + 4.7), Y(y + 1.8)]], { fond: '#FFFFFF', trait: ENCRE, ep: 0.4 }),
      titre: 'Autres faîtages', texte: fait.slice(1, 5).map(niveauRelatif).join(' – ') + (fait.length > 5 ? '…' : '') + ' (par rapport au RDC fini)' }] : []),
    { pastille: (page, x, y) => texte(page, 'Baies', x, y + 3.6, 7.5, { gras: true, couleur: '#222222' }), titre: '', texte: 'largeur × hauteur (m) ; allège = hauteur de l’appui par rapport au RDC fini' },
  ];
  const surfBaies = niveaux.flatMap(f => Object.values(f.objects)).reduce((s, x) => s + (x.type === 'opening' && ouvertureBatie(x) && x.kind !== 'garage_door' && mursDroits(niveaux.find(f => f.objects[x.hostWallId])!).some(w => w.id === x.hostWallId && w.role === 'exterior') ? x.width * x.height : 0), 0);
  const lecture: Panneau = {
    titre: 'NIVEAUX ET LECTURE DES FAÇADES', hauteur: () => 14 + lignes.length * 9.5 + 24,
    dessiner: (page, x, y, e) => {
      lignes.forEach((l, i) => {
        const yy = y + i * 9.5;
        l.pastille(page, x, yy);
        if (l.titre) texte(page, l.titre, x + 17, yy + 2.6, 7.5, { gras: true, couleur: '#222222' });
        couper(l.texte, 86 * PT, 6.8).slice(0, 2).forEach((t, k) => texte(page, t, x + 17, yy + (l.titre ? 6 : 2.6) + k * 3, 6.8, { couleur: t.includes(A_PRECISER) ? ROUGE_MANQUE : GRIS_TEXTE }));
      });
      const ye = y + lignes.length * 9.5 + 2;
      echelleGraphique(page, e, x, ye + 2);
      texte(page, 'Toutes les façades sont à l’échelle 1/' + e + ' (format A3).', x, ye + 14, 6.8, { gras: true, couleur: '#222222' });
      texte(page, 'Surface totale des baies (hors porte de garage) : ' + (surfBaies / 1e6).toFixed(2).replace('.', ',') + ' m².', x, ye + 17.6, 6.8, { couleur: GRIS_TEXTE });
    },
  };
  return [materiaux, lecture];
}
