/* Les modèles de maisons de départ : des plans FICTIFS, typiques d'une
   maison individuelle (plain-pied, en L avec garage, à étage), pour ne pas
   partir d'une page blanche. Chaque modèle est une suite de commandes
   ordinaires (murs, baies, pièces, escalier, toiture), posée en une seule
   transaction : un « annuler » la retire, et tout se modifie ensuite comme
   un plan dessiné à la main. Aucune donnée de client. */
import type { Mm, Point } from '../model/types';
import type { Commande } from '../engine/commandes';

export interface ContexteModele { batiment: string; niveau: string; id: () => string }
export interface ModeleMaison { id: string; libelle: string; description: string; commandes: (c: ContexteModele) => Commande[] }

const P = (x: Mm, y: Mm): Point => ({ x, y });

/** un petit atelier de dessin : murs (dont on garde l'identifiant), baies, pièces */
function atelier(c: ContexteModele) {
  const cmds: Commande[] = [];
  return {
    cmds,
    /** sans hauteur : celle par défaut (un mur extérieur monte à l'arase, voir hauteurMurExterieur) */
    mur(niveau: string, a: Point, b: Point, role: 'exterior' | 'partition' | 'bearing_interior' = 'exterior', hauteur?: Mm): string {
      const id = c.id();
      cmds.push({ type: 'creerMur', id, niveau, a, b, epaisseur: role === 'partition' ? 70 : 200, role, ...(hauteur ? { hauteur } : {}) });
      return id;
    },
    /** un contour fermé de murs extérieurs ; rend leurs identifiants, dans l'ordre des côtés */
    contour(niveau: string, S: Point[], hauteur?: Mm): string[] { return S.map((a, i) => this.mur(niveau, a, S[(i + 1) % S.length]!, 'exterior', hauteur)) },
    porte(mur: string, position: Mm, largeur: Mm = 900) { cmds.push({ type: 'creerOuverture', mur, position, largeur, hauteur: 2_150, allege: 0, genre: 'door' }) },
    fenetre(mur: string, position: Mm, largeur: Mm = 1_200, hauteur: Mm = 1_250, allege: Mm = 900) { cmds.push({ type: 'creerOuverture', mur, position, largeur, hauteur, allege, genre: 'window' }) },
    baie(mur: string, position: Mm, largeur: Mm = 2_400) { cmds.push({ type: 'creerOuverture', mur, position, largeur, hauteur: 2_150, allege: 0, genre: 'french_window' }) },
    garage(mur: string, position: Mm) { cmds.push({ type: 'creerOuverture', mur, position, largeur: 2_400, hauteur: 2_000, allege: 0, genre: 'garage_door' }) },
    piece(niveau: string, p: Point, nom: string, usage: Extract<Commande, { type: 'creerPiece' }>['usage'], humide = false) { cmds.push({ type: 'creerPiece', niveau, point: p, nom, usage, humide }) },
  };
}

export const MODELES_MAISONS: readonly ModeleMaison[] = [
  {
    id: 'plain-pied-t4', libelle: 'Plain-pied, 3 chambres (13 × 9 m)',
    description: 'Séjour-cuisine traversant, dégagement, 3 chambres, salle de bains, WC ; toiture à croupes.',
    commandes(c) {
      const a = atelier(c), n = c.niveau;
      const [sud, , nord, ouest] = a.contour(n, [P(0, 0), P(13_000, 0), P(13_000, 9_000), P(0, 9_000)]) as [string, string, string, string];
      const c1 = a.mur(n, P(6_500, 0), P(6_500, 9_000), 'partition');
      const c2 = a.mur(n, P(6_500, 4_000), P(13_000, 4_000), 'partition');
      const c3 = a.mur(n, P(6_500, 5_000), P(13_000, 5_000), 'partition');
      a.mur(n, P(8_800, 0), P(8_800, 4_000), 'partition'); a.mur(n, P(9_800, 0), P(9_800, 4_000), 'partition'); a.mur(n, P(9_750, 5_000), P(9_750, 9_000), 'partition');
      a.porte(sud, 1_500); a.baie(sud, 4_200); a.fenetre(sud, 7_650, 600, 1_000, 1_150); a.fenetre(sud, 11_400);
      a.fenetre(nord, 13_000 - 11_375); a.fenetre(nord, 13_000 - 8_100); a.fenetre(nord, 13_000 - 4_200); a.fenetre(nord, 13_000 - 1_500, 1_000, 1_050, 1_100);
      a.fenetre(ouest, 4_500);
      a.porte(c1, 4_500, 800);
      a.porte(c2, 1_150, 800); a.porte(c2, 2_800, 700); a.porte(c2, 4_900);
      a.porte(c3, 1_600); a.porte(c3, 4_875);
      a.piece(n, P(3_250, 4_500), 'Séjour, cuisine', 'living'); a.piece(n, P(9_000, 4_500), 'Dégagement', 'circulation');
      a.piece(n, P(7_650, 2_000), 'Salle de bains', 'bathroom', true); a.piece(n, P(9_300, 2_000), 'WC', 'wc', true); a.piece(n, P(11_400, 2_000), 'Chambre 3', 'bedroom');
      a.piece(n, P(8_100, 7_000), 'Chambre 1', 'bedroom'); a.piece(n, P(11_375, 7_000), 'Chambre 2', 'bedroom');
      a.cmds.push({ type: 'creerToiture', niveau: n, genre: 'hip', pente: 35, debord: 200, couverture: 'tile' });
      return a.cmds;
    },
  },
  {
    id: 'plain-pied-l-garage', libelle: 'Plain-pied en L avec garage',
    description: 'Séjour-cuisine, 2 chambres, salle d’eau, garage accolé (5 × 6 m) desservi par le dégagement ; toiture à croupes.',
    commandes(c) {
      const a = atelier(c), n = c.niveau;
      /* le mur entre maison et garage continue la façade est de la maison : un seul mur, sur lequel la façade nord
         du garage vient en T */
      const sud = a.mur(n, P(0, 0), P(16_000, 0));
      a.mur(n, P(16_000, 0), P(16_000, 6_000)); a.mur(n, P(16_000, 6_000), P(11_000, 6_000));
      const g = a.mur(n, P(11_000, 10_000), P(11_000, 0));
      const nord = a.mur(n, P(11_000, 10_000), P(0, 10_000)), ouest = a.mur(n, P(0, 10_000), P(0, 0));
      const c1 = a.mur(n, P(6_000, 0), P(6_000, 10_000), 'partition');
      const c2 = a.mur(n, P(6_000, 4_500), P(11_000, 4_500), 'partition');
      const c3 = a.mur(n, P(6_000, 5_500), P(11_000, 5_500), 'partition');
      a.mur(n, P(8_200, 0), P(8_200, 4_500), 'partition');
      a.porte(sud, 1_200); a.baie(sud, 3_800); a.fenetre(sud, 7_100, 600, 1_000, 1_150); a.fenetre(sud, 9_600); a.garage(sud, 13_500);
      a.fenetre(nord, 11_000 - 1_500, 1_000, 1_050, 1_100); a.fenetre(nord, 11_000 - 8_500); a.fenetre(ouest, 5_000);
      a.porte(g, 10_000 - 5_000, 800); a.porte(c1, 5_000, 800);
      a.porte(c2, 1_100, 800); a.porte(c2, 3_600); a.porte(c3, 2_500);
      a.piece(n, P(3_000, 5_000), 'Séjour, cuisine', 'living'); a.piece(n, P(8_500, 5_000), 'Dégagement', 'circulation');
      a.piece(n, P(7_100, 2_200), 'Salle d’eau, WC', 'bathroom', true); a.piece(n, P(9_600, 2_200), 'Chambre 2', 'bedroom');
      a.piece(n, P(8_500, 7_700), 'Chambre 1', 'bedroom'); a.piece(n, P(13_500, 3_000), 'Garage', 'garage');
      a.cmds.push({ type: 'creerToiture', niveau: n, genre: 'hip', pente: 35, debord: 200, couverture: 'tile' });
      return a.cmds;
    },
  },
  {
    id: 'etage-r1', libelle: 'Maison à étage (9 × 8 m, R+1)',
    description: 'RDC : séjour-cuisine, entrée et escalier, WC, cellier. Étage : 2 chambres, salle de bains, palier ; toiture à deux pans.',
    commandes(c) {
      const a = atelier(c), n = c.niveau, e = c.id();
      /* les murs du RDC montent jusqu'au plancher de l'étage (posé ensuite, à 2,70 m) */
      const [sud, est, nord, ouest] = a.contour(n, [P(0, 0), P(9_000, 0), P(9_000, 8_000), P(0, 8_000)], 2_700) as [string, string, string, string];
      a.mur(n, P(6_000, 0), P(6_000, 2_000), 'partition');
      const r2 = a.mur(n, P(6_000, 2_000), P(9_000, 2_000), 'partition');
      a.mur(n, P(7_500, 0), P(7_500, 2_000), 'partition');
      a.baie(sud, 3_000); a.fenetre(sud, 6_750, 600, 1_000, 1_150); a.fenetre(nord, 9_000 - 3_000); a.fenetre(ouest, 2_000, 1_000, 1_050, 1_100);
      a.porte(est, 4_500); a.porte(r2, 750, 700); a.porte(r2, 2_250, 700);
      a.piece(n, P(3_000, 4_000), 'Séjour, cuisine, entrée', 'living'); a.piece(n, P(6_750, 1_000), 'WC', 'wc', true); a.piece(n, P(8_250, 1_000), 'Cellier', 'storage');
      a.cmds.push({ type: 'creerEscalier', niveau: n, genre: 'straight', position: P(8_250, 2_300), rotation: 0, largeur: 900 });
      /* l'étage, posé dans la même transaction */
      a.cmds.push({ type: 'ajouterNiveau', batiment: c.batiment, nom: 'Étage', altitude: 2_700, hauteur: 2_500, id: e });
      const [esud, , enord] = a.contour(e, [P(0, 0), P(9_000, 0), P(9_000, 8_000), P(0, 8_000)]) as [string, string, string, string];
      const x6 = a.mur(e, P(6_000, 0), P(6_000, 8_000), 'partition');
      a.mur(e, P(0, 4_000), P(6_000, 4_000), 'partition');
      const s2 = a.mur(e, P(6_000, 2_000), P(9_000, 2_000), 'partition');
      a.fenetre(esud, 3_000); a.fenetre(esud, 7_500, 600, 1_000, 1_150); a.fenetre(enord, 9_000 - 3_000);
      a.porte(x6, 3_000, 800); a.porte(x6, 6_500, 800); a.porte(s2, 1_000, 700);
      a.piece(e, P(3_000, 6_000), 'Chambre 1', 'bedroom'); a.piece(e, P(3_000, 2_000), 'Chambre 2', 'bedroom');
      a.piece(e, P(7_500, 1_000), 'Salle de bains', 'bathroom', true); a.piece(e, P(6_800, 7_000), 'Palier', 'circulation');
      a.cmds.push({ type: 'creerToiture', niveau: e, genre: 'gable', pente: 40, debord: 200, couverture: 'tile' });
      return a.cmds;
    },
  },
];

export const modeleMaison = (id: string): ModeleMaison | undefined => MODELES_MAISONS.find(m => m.id === id);
