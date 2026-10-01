/* Phase 1, étape 6 — l'interface, sans navigateur : la caméra, les outils
   (gestes → commandes), l'ouverture de session (serveur ou local), et
   annuler / rétablir enregistrés (la révision avance, le plan revient). */
import { describe, expect, it } from 'vitest';
import { canonique, creerProjet, generateurSequentiel, type Project, type Wall } from '../../src/model';
import { annuler, annulerEnregistre, executer, nouvelHistorique, retablirEnregistre, type Acteur, type Commande, type Historique } from '../../src/engine';
import { CopieMemoire, DepotMemoire, type Depot } from '../../src/persistence';
import { cadrer, versEcran, versMonde, zoomer, type Camera } from '../../src/ui/camera';
import { Outils, type Effet } from '../../src/ui/outils';
import { ouvrirSession } from '../../src/ui/session';
import { dessinCote, texteCote } from '../../src/ui/cotes';

const acteur = (): Acteur => { let t = 0; return { par: 'CP', maintenant: () => new Date(Date.UTC(2026, 9, 1) + (t += 1000)).toISOString(), id: generateurSequentiel('o') } };

describe('caméra', () => {
  const c: Camera = { centre: { x: 5_000, y: 4_000 }, echelle: 0.05, largeur: 800, hauteur: 600 };
  it('monde → écran → monde ; y vers le haut dans le monde, vers le bas à l’écran', () => {
    const p = { x: 1_234, y: 5_678 };
    const q = versMonde(c, versEcran(c, p));
    expect(q.x).toBeCloseTo(p.x, 9); expect(q.y).toBeCloseTo(p.y, 9);
    expect(versEcran(c, { x: 5_000, y: 5_000 }).y).toBeLessThan(300);
  });
  it('zoomer garde fixe le point sous le curseur ; cadrer montre toute la boîte', () => {
    const e = { x: 123, y: 456 }, avant = versMonde(c, e), apres = versMonde(zoomer(c, 2.5, e), e);
    expect(apres.x).toBeCloseTo(avant.x, 6); expect(apres.y).toBeCloseTo(avant.y, 6);
    const k = cadrer(c, { xmin: 0, ymin: 0, xmax: 20_000, ymax: 10_000 });
    for (const p of [{ x: 0, y: 0 }, { x: 20_000, y: 10_000 }]) {
      const s = versEcran(k, p);
      expect(s.x).toBeGreaterThanOrEqual(0); expect(s.x).toBeLessThanOrEqual(800);
      expect(s.y).toBeGreaterThanOrEqual(0); expect(s.y).toBeLessThanOrEqual(600);
    }
  });
});

/** un petit banc : un historique, des outils, et les effets appliqués comme le fait l'application */
function banc() {
  const a = acteur(), p = creerProjet({ nom: 'Maison fictive', id: generateurSequentiel('p') });
  let h: Historique = nouvelHistorique(p);
  const niveau = p.buildings[0]!.floors[0]!.id;
  let selection: string | null = null;
  const refus: string[] = [];
  const demandes: Effet['demande'][] = [];
  const outils = new Outils(() => ({ projet: h.projet, niveau, selection }));
  const appliquer = (e: Effet) => {
    if (e.selection !== undefined) selection = e.selection;
    if (e.demande) demandes.push(e.demande);
    if (e.commandes) { const r = executer(h, e.commandes.titre, e.commandes.liste, a); if (r.ok) h = r.historique; else refus.push(...r.erreurs) }
    return e;
  };
  const g = (x: number, y: number, o: { alt?: boolean; maj?: boolean } = {}) => ({ point: { x, y }, rayon: 150, ...o });
  return {
    outils, niveau, refus, demandes, get h() { return h }, set selection(s: string | null) { selection = s }, get selection() { return selection },
    clic: (x: number, y: number, o?: { alt?: boolean; maj?: boolean }) => { appliquer(outils.bouger(g(x, y, o))); return appliquer(outils.appuyer(g(x, y, o))) },
    tirer: (de: [number, number], vers: [number, number], o?: { alt?: boolean }) => {
      appliquer(outils.appuyer(g(...de, o)));
      appliquer(outils.bouger(g(de[0] + 1, de[1], o)));
      const ap = appliquer(outils.bouger(g(...vers, o)));
      appliquer(outils.relacher(g(...vers, o)));
      return ap;
    },
    touche: (k: 'Escape' | 'Enter') => appliquer(outils.touche(k)),
    murs: () => Object.values(h.projet.buildings[0]!.floors[0]!.objects).filter((o): o is Wall & { axis: { a: { x: number; y: number }; b: { x: number; y: number } } } => o.type === 'wall'),
    objets: (t: string) => Object.values(h.projet.buildings[0]!.floors[0]!.objects).filter(o => o.type === t),
  };
}

describe('outils', () => {
  it('Mur : quatre clics et retour au départ → quatre murs fermés, le tracé s’arrête', () => {
    const b = banc();
    b.outils.choisir('mur');
    for (const [x, y] of [[0, 0], [10_000, 0], [10_000, 8_000], [0, 8_000], [30, -20]] as const) b.clic(x, y);      // le dernier s'accroche au départ
    expect(b.murs().map(w => [w.axis.a, w.axis.b])).toEqual([
      [{ x: 0, y: 0 }, { x: 10_000, y: 0 }], [{ x: 10_000, y: 0 }, { x: 10_000, y: 8_000 }],
      [{ x: 10_000, y: 8_000 }, { x: 0, y: 8_000 }], [{ x: 0, y: 8_000 }, { x: 0, y: 0 }]]);
    expect(b.murs().every(w => w.role === 'exterior' && w.thickness === 200)).toBe(true);
    expect(b.outils.traceEnCours).toBe(false);
  });

  it('Mur : Maj bloque à 45° ; Alt coupe l’accrochage ; un point libre est gardé au millimètre', () => {
    const b = banc();
    b.outils.choisir('mur');
    b.clic(0, 0); b.clic(3_000, 2_900.4, { maj: true });
    const b0 = b.murs()[0]!.axis.b;
    expect(b0.x).toBeCloseTo(b0.y, 5);                        // à 45° : x = y
    expect(Math.hypot(b0.x, b0.y)).toBeCloseTo(4_173, 5);      // longueur gardée au millimètre
    b.touche('Escape');
    b.clic(5_000.4, 5_000.6); b.clic(7_000.2, 5_000.3);
    /* départ libre arrondi ; arrivée alignée sur l'horizontale du départ, x arrondi */
    expect(b.murs()[1]!.axis).toEqual({ a: { x: 5_000, y: 5_001 }, b: { x: 7_000, y: 5_001 } });
    b.touche('Escape');
    b.clic(7_040, 5_030, { alt: true }); b.clic(9_000, 5_000, { alt: true });
    expect(b.murs()[2]!.axis.a).toEqual({ x: 7_040, y: 5_030 });                     // sans Alt, il se serait accroché à (7 000, 5 001)
  });

  it('Cloison, Ouverture, Pièce, Cote : chacun donne sa commande', () => {
    const b = banc();
    b.outils.choisir('mur');
    for (const [x, y] of [[0, 0], [10_000, 0], [10_000, 8_000], [0, 8_000], [0, 0]] as const) b.clic(x, y);
    b.outils.choisir('cloison');
    b.clic(4_000, 0); b.clic(4_000, 8_000);
    expect(b.murs()[4]).toMatchObject({ role: 'partition', thickness: 70 });
    expect(b.outils.traceEnCours).toBe(false);                // une cloison s'arrête à chaque trait
    b.outils.reglages.genreOuverture = 'window';
    b.outils.choisir('ouverture');
    b.clic(9_800, 30);                                        // trop près du bout : l'ouverture est ramenée dans le mur
    expect(b.objets('opening')[0]).toMatchObject({ kind: 'window', width: 1_200, sill: 900, offset: 9_400 });
    b.outils.choisir('piece');
    b.clic(2_000, 4_000);
    expect(b.demandes).toEqual([{ genre: 'nomPiece', niveau: b.niveau, point: { x: 2_000, y: 4_000 } }]);
    b.clic(-2_000, 4_000);                                    // dehors : rien n'est demandé
    expect(b.demandes).toHaveLength(1);
    b.outils.choisir('cote');
    b.clic(0, 3_000); b.clic(4_000, 3_000);
    const cote = b.objets('dimension')[0]!;
    expect(cote).toMatchObject({ refs: [{ feature: 'axis' }, { feature: 'axis' }], driving: false });
    const d = dessinCote(b.h.projet.buildings[0]!.floors[0]!, cote as never)!;
    expect(texteCote(d.valeur)).toBe('4,00');
    expect(b.refus).toEqual([]);
  });

  it('Sélection : tirer une extrémité, tirer un mur, tirer une ouverture le long de son mur', () => {
    const b = banc();
    b.outils.choisir('mur');
    for (const [x, y] of [[0, 0], [10_000, 0], [10_000, 8_000], [0, 8_000], [0, 0]] as const) b.clic(x, y);
    b.outils.choisir('cloison');
    b.clic(4_000, 0); b.clic(4_000, 8_000);
    b.outils.choisir('ouverture'); b.clic(2_000, 0);
    b.outils.choisir('selection');
    /* la cloison tirée par son milieu, d'un mètre */
    b.tirer([4_000, 4_000], [5_000.3, 4_000.4], { alt: true });
    expect(b.murs()[4]!.axis).toEqual({ a: { x: 5_000, y: 0 }, b: { x: 5_000, y: 8_000 } });
    /* la porte glissée le long du mur sud */
    b.tirer([2_000, 0], [3_000, 300]);
    expect(b.objets('opening')[0]).toMatchObject({ offset: 3_000 });
    /* l'angle (10, 8) tiré en (12, 9) : les deux murs qui y aboutissent suivent,
       et la cloison reste accrochée au mur nord devenu oblique */
    const ap = b.tirer([10_000, 8_000], [12_000, 9_000], { alt: true });
    expect(ap.apercu?.[0]).toMatchObject({ type: 'deplacerSommet', de: { x: 10_000, y: 8_000 }, vers: { x: 12_000, y: 9_000 } });
    expect(b.murs()[1]!.axis.b).toEqual({ x: 12_000, y: 9_000 });
    expect(b.murs()[2]!.axis.a).toEqual({ x: 12_000, y: 9_000 });
    const haut = b.murs()[4]!.axis.b;
    expect(Math.abs((haut.y - 8_000) - (haut.x / 12_000) * 1_000) * 12_000 / Math.hypot(12_000, 1_000)).toBeLessThan(0.01);
    expect(b.refus).toEqual([]);
    /* un clic sans bouger sélectionne seulement */
    const n = b.h.passe.length;
    b.tirer([7_000, 0], [7_000, 0]);
    expect(b.h.passe.length).toBe(n);
    expect(b.selection).toBe(b.murs()[0]!.id);
  });

  it('Échap abandonne le tracé, puis revient à la sélection', () => {
    const b = banc();
    b.outils.choisir('mur');
    b.clic(0, 0);
    expect(b.outils.traceEnCours).toBe(true);
    b.touche('Escape');
    expect(b.outils.traceEnCours).toBe(false);
    expect(b.outils.outil).toBe('mur');
    expect(b.touche('Escape').fini).toBe(true);
    expect(b.outils.outil).toBe('selection');
  });
});

describe('annuler / rétablir enregistrés', () => {
  it('la révision avance, le plan revient à l’identique ; le serveur rechargé est d’accord', async () => {
    const a = acteur(), p = creerProjet({ nom: 'P', id: generateurSequentiel('p') });
    const d = new DepotMemoire(); await d.creer(p, 'CP');
    const n = p.buildings[0]!.floors[0]!.id;
    const M = (x: number): Commande => ({ type: 'creerMur', niveau: n, a: { x, y: 0 }, b: { x, y: 3_000 }, epaisseur: 200 });
    let h = nouvelHistorique(p);
    for (const x of [0, 1_000, 2_000]) { const r = executer(h, 'Mur', [M(x)], a); if (!r.ok) throw new Error(); h = r.historique; await d.envoyer(p.id, r.changeSet) }
    const plan = (q: Project) => canonique(q.buildings);
    const avant = plan(annuler(h).projet);
    const u = annulerEnregistre(h, a);
    if (!u.ok) throw new Error();
    expect(u.changeSet.revisionAvant).toBe(3);
    expect(u.historique.projet.revision).toBe(4);
    expect(plan(u.historique.projet)).toBe(avant);
    expect((await d.envoyer(p.id, u.changeSet)).ok).toBe(true);
    const r = retablirEnregistre(u.historique, a);
    if (!r.ok) throw new Error();
    expect(plan(r.historique.projet)).toBe(plan(h.projet));
    expect((await d.envoyer(p.id, r.changeSet)).ok).toBe(true);
    expect(canonique(await d.charger(p.id))).toBe(canonique(r.historique.projet));
    expect(annulerEnregistre(nouvelHistorique(p), a).ok).toBe(false);
  });
});

describe('ouverture de session', () => {
  const signaler = () => {};
  it('non connecté : mode local, dit clairement', async () => {
    const o = await ouvrirSession(new URLSearchParams('chantier=c1'), { utilisateur: async () => null, depot: () => new DepotMemoire(), copie: new CopieMemoire(), signaler });
    expect(o.enregistreur.mode).toBe('local');
    expect(o.enregistreur.raison).toMatch(/Non connecté/);
    expect(o.projet.crmChantierId).toBe('c1');
  });

  it('tables du Designer absentes sur le serveur : mode local, avec la marche à suivre', async () => {
    const enPanne: Depot = { ...new DepotMemoire(), lister: async () => { throw new Error('relation "public.designer_projects" does not exist') } } as unknown as Depot;
    const o = await ouvrirSession(new URLSearchParams(''), { utilisateur: async () => 'cp@exemple.fr', depot: () => enPanne, copie: new CopieMemoire(), signaler });
    expect(o.enregistreur.mode).toBe('local');
    expect(o.enregistreur.raison).toMatch(/schema\.sql/);
  });

  it('connecté : le projet du chantier est créé une fois, puis rechargé ; chaque modification part au serveur', async () => {
    const d = new DepotMemoire(), copie = new CopieMemoire();
    const deps = { utilisateur: async () => 'cp@exemple.fr', depot: () => d, copie, signaler };
    const o = await ouvrirSession(new URLSearchParams('chantier=c9'), deps);
    expect(o.enregistreur.mode).toBe('serveur');
    expect(await d.lister('c9')).toHaveLength(1);
    const r = executer(nouvelHistorique(o.projet), 'Mur', [{ type: 'creerMur', niveau: o.projet.buildings[0]!.floors[0]!.id, a: { x: 0, y: 0 }, b: { x: 5_000, y: 0 }, epaisseur: 200 }], acteur());
    if (!r.ok) throw new Error();
    await o.enregistreur.ajouter(r.changeSet, r.historique.projet);
    const o2 = await ouvrirSession(new URLSearchParams('chantier=c9'), deps);
    expect(await d.lister('c9')).toHaveLength(1);
    expect(canonique(o2.projet)).toBe(canonique(r.historique.projet));
  });
});
