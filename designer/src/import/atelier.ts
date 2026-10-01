/* Import d'un plan lu par l'atelier (ADR-0004, Phase 1 bis).

   L'atelier (atelier/, sur le Mac) lit un RDC en DXF ou en PDF vectoriel et
   l'enregistre dans son modèle (01_modele/modele.json). Il y décrit les murs
   comme ils sont DESSINÉS : des régions (tous les murs de façade d'un seul
   tenant, toutes les cloisons d'un autre), ouvertures refermées. Le
   Designer, lui, garde l'AXE de chaque mur et son épaisseur (ADR-0002). Ce
   module fait le passage, sans rien inventer :

   1. dans chaque région, deux faces parallèles qui se font face à une
      distance de mur (2 à 70 cm), matière entre elles, donnent un tronçon
      d'axe — au milieu, sur leur partie commune, de l'épaisseur mesurée ;
   2. les tronçons d'une même ligne et d'une même épaisseur, séparés par
      moins qu'une épaisseur (le passage d'une cloison qui s'y raccorde) ou
      par une ouverture lue, sont réunis ;
   3. chaque extrémité est prolongée jusqu'à l'axe du mur qu'elle rejoint
      (angle, T), à une demi-épaisseur près : les jonctions sont exactes ;
   4. les ouvertures se posent sur le mur dont l'axe passe par leur milieu ;
      les pièces gardent leur nom, leur usage, et leur point intérieur.

   Statuts (ADR-0004) : confirmé → confirmed ; hypothèse → to_check (la
   conséquence suit) ; impossible → to_check avec la donnée qui manque. Une
   cote manquante (hauteur d'une fenêtre…) prend la valeur courante CP,
   marquée « à vérifier » : jamais présentée comme lue. Ce qui ne se
   convertit pas (poteau, morceau trop court) est signalé dans le rapport. */
import type { Mm, Opening, Point, Qualified, RoomUsage, SourceRef, SourceStatus } from '../model/types';
import type { Commande, Origine } from '../engine/commandes';
import { positionDansAnneau } from '../geometry/predicats';
import { aireSignee, centroide, type Anneau } from '../geometry/polygon';
import { distancePointSegment, projeterSurDroite } from '../geometry/segment';
import { ajouter, distance, multiplier, normaleGauche, normaliser, scalaire, soustraire, vectoriel } from '../geometry/vecteur';

/* ---------------------------------------------------------------- le modèle de l'atelier (ce qu'on en lit) */

type PointM = [number, number];                 // mètres, comme l'atelier
export interface ValeurAtelier { valeur?: unknown; unite?: string; statut: 'confirme' | 'hypothese' | 'impossible'; source?: Record<string, string> | null; consequence?: string; manque?: string }
export interface MurAtelier { id: string; polygone: PointM[]; trous?: PointM[][]; epaisseur: number; exterieur: boolean; porteur?: ValeurAtelier }
export interface OuvertureAtelier { id: string; type: string; position: PointM; largeur: ValeurAtelier; hauteur: ValeurAtelier; allege: ValeurAtelier; exterieure?: boolean; origine?: string }
export interface PieceAtelier { id: string; nom: string; usage: string; polygone: PointM[]; surface_calculee: number; surface_lue?: ValeurAtelier | null; humide?: boolean; exclue_habitable?: boolean; motif_exclusion?: string }
export interface NiveauAtelier { nom?: string; murs: MurAtelier[]; ouvertures: OuvertureAtelier[]; pieces: PieceAtelier[] }
export interface ModeleAtelier { id?: string; nom?: string; schema_version?: number; batiment: { niveaux: NiveauAtelier[] }; source_rdc?: { fichier?: string; segments?: [PointM, PointM][] } }

/** vérifier qu'un JSON est bien un modèle de l'atelier (et pas autre chose) */
export function lireModeleAtelier(brut: unknown): ModeleAtelier {
  const m = brut as Partial<ModeleAtelier> | null;
  const n = m?.batiment?.niveaux;
  if (!m || typeof m !== 'object' || !Array.isArray(n)) throw new Error('ce fichier n’est pas un modèle de l’atelier (01_modele/modele.json)');
  if (m.schema_version !== undefined && m.schema_version > 1) throw new Error('modèle de l’atelier d’une version plus récente (schéma ' + m.schema_version + ') : mettez le Designer à jour');
  if (!n.length || !n[0]!.murs?.length) throw new Error('le modèle de l’atelier ne contient pas de RDC importé (aucun mur)');
  return m as ModeleAtelier;
}

/* ---------------------------------------------------------------- 1 à 3 : les axes des murs */

export interface AxeMur { a: Point; b: Point; epaisseur: Mm; exterieur: boolean; region: string }

const MM = 1000;
const enMm = (p: PointM): Point => ({ x: p[0] * MM, y: p[1] * MM });
/* seul le bruit de calcul est arrondi (au millionième de mm) : arrondir
   davantage sortirait de son mur l'extrémité d'une cloison en T sur un mur
   oblique, et la jonction ne se ferait plus (tolérance : 0,01 mm) */
const arrondi = (v: number) => Math.round(v * 1e6) / 1e6;
const pt = (p: Point): Point => ({ x: arrondi(p.x), y: arrondi(p.y) });

const E_MIN = 20, E_MAX = 700;          // un mur fait de 2 à 70 cm
const TOL_REDRESSE = 2;                 // un sommet à moins de 2 mm de l'alignement est supprimé
const TOL_PARALLELE = Math.sin(Math.PI / 180);   // 1°

interface Arete { a: Point; b: Point; u: Point; L: number }

/** les arêtes d'une région, matière à GAUCHE (contour dans le sens trigonométrique, trous dans l'autre),
    sommets en double et sommets alignés retirés */
function aretes(contour: Point[], trous: Point[][]): Arete[] {
  const net = (r: Point[], ccw: boolean): Point[] => {
    let L = r.filter((p, i) => distance(p, r[(i + 1) % r.length]!) > 0.01);
    if (L.length > 2 && distance(L[0]!, L[L.length - 1]!) <= 0.01) L = L.slice(0, -1);
    let change = true;
    while (change && L.length > 3) {
      change = false;
      for (let i = 0; i < L.length; i++) {
        const p = L[(i - 1 + L.length) % L.length]!, q = L[i]!, s = L[(i + 1) % L.length]!;
        if (distancePointSegment(q, { a: p, b: s }) <= TOL_REDRESSE) { L.splice(i, 1); change = true; break }
      }
    }
    return (aireSignee(L) > 0) === ccw ? L : [...L].reverse();
  };
  const out: Arete[] = [];
  for (const [r, ccw] of [[contour, true], ...trous.map(t => [t, false] as const)] as const) {
    const L = net(r, ccw);
    L.forEach((a, i) => { const b = L[(i + 1) % L.length]!; const d = soustraire(b, a), l = Math.hypot(d.x, d.y); if (l > 0) out.push({ a, b, u: { x: d.x / l, y: d.y / l }, L: l }) });
  }
  return out;
}

const dansRegion = (p: Point, contour: Anneau, trous: Anneau[]): boolean =>
  positionDansAnneau(p, contour) === 'dedans' && trous.every(t => positionDansAnneau(p, t) === 'dehors');

interface Troncon { a: Point; b: Point; e: Mm; exterieur: boolean; region: string }

/** 1. les tronçons d'axe d'une région */
function tronconsRegion(m: MurAtelier): Troncon[] {
  const contour = m.polygone.map(enMm), trous = (m.trous ?? []).map(t => t.map(enMm));
  const A = aretes(contour, trous);
  const out: Troncon[] = [];
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
    const e1 = A[i]!, e2 = A[j]!;
    if (scalaire(e1.u, e2.u) > -Math.cos(TOL_PARALLELE)) continue;          // faces opposées : sens contraires
    const n1 = normaleGauche(e1.u);
    const d = scalaire(n1, soustraire(e2.a, e1.a));
    if (d < E_MIN || d > E_MAX || Math.abs(scalaire(n1, soustraire(e2.b, e1.a)) - d) > 5) continue;
    const t0 = scalaire(soustraire(e2.a, e1.a), e1.u), t1 = scalaire(soustraire(e2.b, e1.a), e1.u);
    const o0 = Math.max(0, Math.min(t0, t1)), o1 = Math.min(e1.L, Math.max(t0, t1));
    /* une bande plus longue que large : un mur (un carré, c'est un poteau ou un raccord) */
    if (o1 - o0 < 1.2 * d) continue;
    const milieu = ajouter(ajouter(e1.a, multiplier(e1.u, (o0 + o1) / 2)), multiplier(n1, d / 2));
    if (!dansRegion(milieu, contour, trous)) continue;
    const base = ajouter(e1.a, multiplier(n1, d / 2));
    out.push({ a: ajouter(base, multiplier(e1.u, o0)), b: ajouter(base, multiplier(e1.u, o1)), e: d, exterieur: m.exterieur, region: m.id });
  }
  return out;
}

/** 2. réunir les tronçons d'une même ligne et d'une même épaisseur */
function reunir(T: Troncon[], ouvertures: Point[]): Troncon[] {
  const sens = (t: Troncon): Point => {
    const u = normaliser(soustraire(t.b, t.a));
    return u.x < -1e-9 || (Math.abs(u.x) <= 1e-9 && u.y < 0) ? multiplier(u, -1) : u;
  };
  const groupes: { u: Point; c: number; e: Mm; ext: boolean; region: string; iv: [number, number][] }[] = [];
  for (const t of T) {
    const u = sens(t), c = vectoriel(u, t.a);
    const g = groupes.find(g => g.region === t.region && Math.abs(vectoriel(g.u, u)) < TOL_PARALLELE && Math.abs(g.c - c) <= 3
      && Math.abs(g.e - t.e) <= Math.max(5, 0.1 * t.e));
    const s0 = scalaire(u, t.a), s1 = scalaire(u, t.b);
    const iv: [number, number] = [Math.min(s0, s1), Math.max(s0, s1)];
    if (g) g.iv.push(iv); else groupes.push({ u, c, e: t.e, ext: t.exterieur, region: t.region, iv: [iv] });
  }
  const out: Troncon[] = [];
  for (const g of groupes) {
    g.iv.sort((x, y) => x[0] - y[0]);
    const n = normaleGauche(g.u);
    const point = (s: number): Point => ajouter(multiplier(g.u, s), multiplier(n, g.c));      // c = n · P
    const fusion: [number, number][] = [];
    for (const iv of g.iv) {
      const der = fusion[fusion.length - 1];
      const ecart = der ? iv[0] - der[1] : Infinity;
      /* un passage de cloison (moins d'une épaisseur et demie), ou une ouverture lue dans l'écart */
      const ouvertureDansEcart = der && ecart > 0 && ouvertures.some(o => {
        const s = scalaire(g.u, o), off = Math.abs(vectoriel(g.u, o) - g.c);
        return off <= g.e && s > der[1] - 1 && s < iv[0] + 1;
      });
      if (der && (ecart <= Math.max(1.5 * g.e, 30) || ouvertureDansEcart)) der[1] = Math.max(der[1], iv[1]);
      else fusion.push([iv[0], iv[1]]);
    }
    for (const [s0, s1] of fusion) out.push({ a: point(s0), b: point(s1), e: g.e, exterieur: g.ext, region: g.region });
  }
  return out;
}

/** 3. prolonger chaque extrémité jusqu'à l'axe qu'elle rejoint (angle, T).
    Si le point de rencontre tombe un peu au-delà du bout de l'autre mur
    (cloison en baïonnette, décalée de quelques centimètres), l'autre mur
    est prolongé jusque-là : la matière est continue sur le plan source. */
function raccorder(T: Troncon[]): Troncon[] {
  interface Rencontre { d: number; H: Point; j: number; bout: 'a' | 'b' | null }
  const rencontre = (t: Troncon, bout: 'a' | 'b', i: number): Rencontre | null => {
    const P = t[bout], u = normaliser(bout === 'b' ? soustraire(t.b, t.a) : soustraire(t.a, t.b));
    let meilleur: Rencontre | null = null;
    T.forEach((q, j) => {
      if (j === i) return;
      const v = soustraire(q.b, q.a), den = vectoriel(u, v);
      if (Math.abs(den) < TOL_PARALLELE * Math.hypot(v.x, v.y)) return;
      const d = vectoriel(soustraire(q.a, P), v) / den;                  // distance le long du rayon
      if (d < -1 || d > 1.5 * (t.e / 2 + q.e / 2) + 5) return;
      const H = ajouter(P, multiplier(u, d));
      const L = Math.hypot(v.x, v.y), s = scalaire(soustraire(H, q.a), v) / L;
      const marge = Math.max(t.e, q.e) + 5;
      if (s < -marge || s > L + marge) return;
      /* au-delà du bout de q d'au moins une demi-épaisseur : q devra être prolongé */
      const bq: Rencontre['bout'] = s < -t.e / 2 ? 'a' : s > L + t.e / 2 ? 'b' : null;
      if (!meilleur || d < meilleur.d - 0.5) meilleur = { d, H, j, bout: bq };
    });
    return meilleur;
  };
  const R = T.map((t, i) => ({ a: rencontre(t, 'a', i), b: rencontre(t, 'b', i) }));
  const out = T.map((t, i) => ({ ...t, a: R[i]!.a?.H ?? t.a, b: R[i]!.b?.H ?? t.b }));
  /* les murs rejoints au-delà de leur bout sont prolongés jusqu'au point de rencontre */
  R.forEach(r => {
    for (const x of [r.a, r.b]) {
      if (!x || !x.bout) continue;
      const q = out[x.j]!, autre = x.bout === 'a' ? q.b : q.a;
      if (distance(x.H, autre) > distance(q[x.bout], autre)) q[x.bout] = x.H;
    }
  });
  return out.map(t => ({ ...t, a: pt(t.a), b: pt(t.b) }));
}

export function axesDesMurs(murs: MurAtelier[], ouvertures: OuvertureAtelier[] = []): { axes: AxeMur[]; avertissements: string[] } {
  const avertissements: string[] = [];
  const bruts: Troncon[] = [];
  for (const m of murs) {
    const t = tronconsRegion(m);
    if (!t.length) avertissements.push('Élément « ' + m.id + ' » (' + (m.epaisseur * 100).toFixed(0) + ' cm) non converti : ni long ni étroit comme un mur (poteau, raccord ?) — à redessiner si besoin');
    bruts.push(...t);
  }
  /* deux passes : la seconde voit les murs déjà prolongés par la première
     (une cloison en baïonnette rejoint un mur qui vient d'être allongé) */
  const axes = raccorder(raccorder(reunir(bruts, ouvertures.map(o => enMm(o.position)))))
    .filter(t => {
      const L = distance(t.a, t.b);
      if (L >= 50) return true;
      avertissements.push('Morceau de mur de ' + Math.round(L) + ' mm ignoré (trop court)');
      return false;
    })
    .map(t => ({ a: t.a, b: t.b, epaisseur: Math.round(t.e), exterieur: t.exterieur, region: t.region }));
  return { axes, avertissements };
}

/* ---------------------------------------------------------------- 4 : commandes d'import */

const STATUTS: Record<ValeurAtelier['statut'], SourceStatus> = { confirme: 'confirmed', hypothese: 'to_check', impossible: 'to_check' };
const pire = (...s: SourceStatus[]): SourceStatus => (s.every(x => x === 'confirmed') ? 'confirmed' : 'to_check');

const GENRES: Record<string, Opening['kind']> = {
  porte: 'door', fenetre: 'window', 'porte-fenetre': 'french_window', 'porte de garage': 'garage_door', baie: 'bay', inconnu: 'void',
};
/** les valeurs courantes CP quand le plan ne dit rien (toujours « à vérifier ») */
const DEFAUTS: Record<Opening['kind'], { hauteur: Mm; allege: Mm }> = {
  door: { hauteur: 2_150, allege: 0 }, window: { hauteur: 1_250, allege: 900 }, french_window: { hauteur: 2_150, allege: 0 },
  garage_door: { hauteur: 2_000, allege: 0 }, bay: { hauteur: 2_150, allege: 0 }, void: { hauteur: 2_150, allege: 0 },
};

function usageDe(p: PieceAtelier): RoomUsage {
  const nom = p.nom.toLowerCase();
  /* un « séjour - cuisine » reste un séjour ; une cuisine seule est une cuisine */
  if (/s[ée]jour|salon|pi[eè]ce\s*de\s*vie|living/.test(nom)) return 'living';
  if (/cuisine/.test(nom)) return 'kitchen';
  if (/\bw\.?\s*c\b|toilette/.test(nom)) return 'wc';
  switch (p.usage) {
    case 'sejour': return 'living';
    case 'chambre': return /bureau/.test(nom) ? 'other' : 'bedroom';
    case 'eau': return 'bathroom';
    case 'garage': return 'garage';
    case 'technique': return 'technical';
    case 'circulation': return 'circulation';
    case 'rangement': return 'storage';
    default: return 'other';
  }
}

/** un point bien à l'intérieur d'une pièce (le centre de gravité s'il y est, sinon le point le plus éloigné des bords sur une grille) */
export function pointInterieur(anneau: Anneau): Point {
  const c = centroide(anneau);
  const marge = (p: Point) => Math.min(...anneau.map((a, i) => distancePointSegment(p, { a, b: anneau[(i + 1) % anneau.length]! })));
  if (positionDansAnneau(c, anneau) === 'dedans' && marge(c) > 100) return pt(c);
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const p of anneau) { xmin = Math.min(xmin, p.x); ymin = Math.min(ymin, p.y); xmax = Math.max(xmax, p.x); ymax = Math.max(ymax, p.y) }
  let meilleur = c, m = -1;
  for (let i = 1; i < 24; i++) for (let j = 1; j < 24; j++) {
    const p = { x: xmin + (xmax - xmin) * i / 24, y: ymin + (ymax - ymin) * j / 24 };
    if (positionDansAnneau(p, anneau) !== 'dedans') continue;
    const d = marge(p);
    if (d > m) { m = d; meilleur = p }
  }
  return pt(meilleur);
}

const texteSource = (v: ValeurAtelier | undefined): string => (v?.source ? Object.values(v.source).filter(Boolean).join(' · ') : '');

/** la qualification « porteur » de l'atelier, dans le Building Model */
function porteurDe(m: MurAtelier, fichier: string): Qualified<boolean> | undefined {
  const v = m.porteur;
  if (!v) return undefined;
  const refs: SourceRef[] = [];
  if (v.source?.['document']) refs.push({ kind: 'document', label: v.source['document'] + (v.source['page'] ? ', p. ' + v.source['page'] : ''), at: new Date(0).toISOString() });
  else if (texteSource(v)) refs.push({ kind: 'import', label: 'atelier : ' + texteSource(v), documentId: fichier, at: new Date(0).toISOString() });
  return {
    value: !!v.valeur, status: STATUTS[v.statut], ...(refs.length ? { sourceRefs: refs } : {}),
    ...(v.consequence ? { consequence: v.consequence } : {}), missing: v.manque || 'note de calcul ou plan de structure',
  };
}

export interface RapportImport {
  fichier: string;
  murs: number; ouvertures: number; pieces: number;
  avertissements: string[];
  /** surfaces calculées par l'atelier, pour la comparaison après import */
  surfacesAtelier: { nom: string; m2: number }[];
}

/**
 * Les commandes qui posent le RDC lu par l'atelier sur un niveau (vide) du
 * Designer : une seule transaction, donc un seul « annuler ».
 */
export function commandesImport(modele: ModeleAtelier, niveau: string, id: () => string): { commandes: Commande[]; rapport: RapportImport } {
  const n = modele.batiment.niveaux[0]!;
  const fichier = modele.source_rdc?.fichier || 'plan du RDC';
  const label = 'Import atelier : ' + fichier;
  const { axes, avertissements } = axesDesMurs(n.murs, n.ouvertures);
  const commandes: Commande[] = [];
  const murs: { id: string; axe: AxeMur }[] = [];
  const parRegion = new Map(n.murs.map(m => [m.id, m]));
  for (const axe of axes) {
    const mid = id(), region = parRegion.get(axe.region)!;
    const porteur = porteurDe(region, fichier);
    commandes.push({
      type: 'creerMur', id: mid, niveau, a: axe.a, b: axe.b, epaisseur: axe.epaisseur, role: axe.exterieur ? 'exterior' : 'partition',
      origine: { label, document: fichier, statut: 'derived', meta: { atelier: { region: axe.region, epaisseurLue: region.epaisseur } } },
      ...(porteur ? { porteur } : {}),
    });
    murs.push({ id: mid, axe });
  }

  let nOuv = 0;
  for (const o of n.ouvertures) {
    const P = enMm(o.position);
    const hote = murs.map(m => ({ m, d: distancePointSegment(P, m.axe) })).filter(x => x.d <= x.m.axe.epaisseur / 2 + 50).sort((x, y) => x.d - y.d)[0];
    if (!hote) { avertissements.push('Ouverture ' + o.id + ' (' + o.type + ') : aucun mur à son emplacement — non posée'); continue }
    const genre = GENRES[o.type] ?? 'void';
    const L = distance(hote.m.axe.a, hote.m.axe.b);
    const position = arrondi(projeterSurDroite(P, hote.m.axe).t * L);
    const largeur = typeof o.largeur.valeur === 'number' ? Math.round(o.largeur.valeur * MM) : null;
    if (!largeur || largeur <= 0) { avertissements.push('Ouverture ' + o.id + ' : largeur inconnue — non posée (' + (o.largeur.manque || 'largeur') + ')'); continue }
    if (position - largeur / 2 < -1 || position + largeur / 2 > L + 1) { avertissements.push('Ouverture ' + o.id + ' (' + (largeur / 1000).toFixed(2) + ' m) : dépasse de son mur après conversion — non posée, à reprendre'); continue }
    /* hauteur et allège : lues, ou la valeur courante CP marquée à vérifier */
    const lu = (v: ValeurAtelier) => (typeof v.valeur === 'number' ? Math.round(v.valeur * MM) : null);
    const hauteur = lu(o.hauteur), allege = lu(o.allege);
    const aVerifier: string[] = [];
    if (hauteur === null) aVerifier.push('hauteur : valeur courante ' + (DEFAUTS[genre].hauteur / 1000).toFixed(2).replace('.', ',') + ' m — manque : ' + (o.hauteur.manque || 'hauteur'));
    if (allege === null) aVerifier.push('allège : valeur courante ' + (DEFAUTS[genre].allege / 1000).toFixed(2).replace('.', ',') + ' m — manque : ' + (o.allege.manque || 'allège'));
    if (o.type === 'inconnu') aVerifier.push('genre d’ouverture non reconnu sur le plan');
    if (o.largeur.statut !== 'confirme') aVerifier.push('largeur ' + (o.largeur.statut === 'hypothese' ? 'supposée' : 'non lue') + (o.largeur.consequence ? ' : ' + o.largeur.consequence : ''));
    const origine: Origine = {
      label, document: fichier,
      statut: pire(STATUTS[o.largeur.statut], hauteur === null ? 'to_check' : STATUTS[o.hauteur.statut], allege === null ? 'to_check' : STATUTS[o.allege.statut], o.type === 'inconnu' ? 'to_check' : 'confirmed'),
      meta: { atelier: { id: o.id, origine: o.origine ?? '' }, ...(aVerifier.length ? { aVerifier } : {}) },
    };
    commandes.push({ type: 'creerOuverture', mur: hote.m.id, position, largeur, hauteur: hauteur ?? DEFAUTS[genre].hauteur, allege: allege ?? DEFAUTS[genre].allege, genre, origine });
    nOuv++;
  }

  for (const p of n.pieces) {
    const anneau = p.polygone.map(enMm);
    const meta: Record<string, unknown> = { atelier: { id: p.id, usage: p.usage, surfaceCalculee: p.surface_calculee } };
    if (p.surface_lue && typeof p.surface_lue.valeur === 'number') meta['surfaceLue'] = p.surface_lue.valeur;
    if (p.exclue_habitable) meta['exclueHabitable'] = p.motif_exclusion || true;
    const usage = usageDe(p);
    commandes.push({
      type: 'creerPiece', niveau, point: pointInterieur(anneau), nom: p.nom, usage, humide: !!p.humide,
      origine: { label, document: fichier, statut: p.usage === 'autre' ? 'to_check' : 'confirmed', meta },
    });
  }
  return {
    commandes,
    rapport: { fichier, murs: murs.length, ouvertures: nOuv, pieces: n.pieces.length, avertissements, surfacesAtelier: n.pieces.map(p => ({ nom: p.nom, m2: p.surface_calculee })) },
  };
}

/* ---------------------------------------------------------------- après l'import : contrôle */

export interface EcartSurface { nom: string; atelier: number; designer: number | null; ecart: number | null }

/** comparer, pièce par pièce, la surface calculée par l'atelier et celle du Designer (m²) */
export function comparerSurfaces(rapport: RapportImport, zones: { nom: string | null; m2: number }[]): EcartSurface[] {
  return rapport.surfacesAtelier.map(s => {
    const z = zones.find(z => z.nom === s.nom);
    const designer = z ? Math.round(z.m2 * 100) / 100 : null;
    return { nom: s.nom, atelier: Math.round(s.m2 * 100) / 100, designer, ecart: designer === null ? null : Math.round((designer - s.m2) * 100) / 100 };
  });
}

/** les traits du plan source (mm), pour en faire un fond de contrôle */
export function traitsSource(modele: ModeleAtelier): { traits: [Point, Point][]; boite: { xmin: Mm; ymin: Mm; xmax: Mm; ymax: Mm } } | null {
  const S = modele.source_rdc?.segments;
  if (!S?.length) return null;
  const traits = S.map(([a, b]) => [enMm(a), enMm(b)] as [Point, Point]);
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const [a, b] of traits) for (const p of [a, b]) { xmin = Math.min(xmin, p.x); ymin = Math.min(ymin, p.y); xmax = Math.max(xmax, p.x); ymax = Math.max(ymax, p.y) }
  return { traits, boite: { xmin, ymin, xmax, ymax } };
}
