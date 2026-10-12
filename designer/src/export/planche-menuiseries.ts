/* La planche du tableau des menuiseries (building/tableau-menuiseries.ts) :
   ce qu'on remet au menuisier, au format des planches du cabinet (A3, cadre
   et colonne CP). Les menuiseries extérieures, puis intérieures, un repère
   par type de baie avec sa quantité et ses emplacements ; la désignation et
   les emplacements se replient sur plusieurs lignes ; une page de plus si le
   tableau ne tient pas. Les notes rappellent ce qui reste à reprendre sur
   place (dimensions, sens) et à choisir (teintes). */
import type { Project } from '../model/types';
import type { DocumentPdf, PagePdf } from './pdf';
import { tableauMenuiseries, type LigneMenuiserie } from '../building/tableau-menuiseries';
import { colonne, couper, nouvelleFeuille, tableau, texte, titrePlanche, GRIS_TEXTE, PT, type Signature } from './feuille';

const COLONNES: { titre: string; largeur: number; aligne?: 'gauche' | 'droite' | 'centre' }[] = [
  { titre: 'Repère', largeur: 15, aligne: 'centre' }, { titre: 'Désignation', largeur: 62 }, { titre: 'Qté', largeur: 10, aligne: 'centre' },
  { titre: 'L × H (cm)', largeur: 21, aligne: 'centre' }, { titre: 'Allège', largeur: 13, aligne: 'centre' }, { titre: 'Manœuvre', largeur: 31 },
  { titre: 'Ouverture', largeur: 40 }, { titre: 'Volet', largeur: 33 }, { titre: 'Teinte', largeur: 44 }, { titre: 'Emplacements', largeur: 79 },
];
const CORPS = 7, PAS = 4.6;
/* le haut des tableaux, et la limite basse (au-dessus des notes et du titre de la planche) */
const HAUT = 12, BAS = 255;

const cm = (x: number) => String(Math.round(x / 10));
const m = (x: number) => (x / 1000).toFixed(2).replace('.', ',');

/** les rangées d'une ligne du tableau : la première porte tout, les suivantes la suite de la désignation et des emplacements */
function rangees(l: LigneMenuiserie): string[][] {
  const larg = (i: number) => (COLONNES[i]!.largeur - 3.2) * PT;
  const D = couper(l.designation, larg(1), CORPS), E = couper(l.emplacements.join(' ; '), larg(9), CORPS);
  const premiere = [l.repere, D[0] ?? '', String(l.quantite), cm(l.largeur) + ' × ' + cm(l.hauteur), l.allege > 0 ? m(l.allege) : '—',
    l.manoeuvre + (l.vantaux > 1 ? ' ' + l.vantaux + ' vantaux' : ''), l.ouverture, l.volet, l.teinte, E[0] ?? ''];
  const suite: string[][] = [];
  for (let i = 1; i < Math.max(D.length, E.length); i++) suite.push(['', D[i] ?? '', '', '', '', '', '', '', '', E[i] ?? '']);
  return [premiere, ...suite];
}

/** la planche (une page de plus si le tableau ne tient pas) ; rien si le projet n'a aucune menuiserie */
export function plancheMenuiseries(doc: DocumentPdf, projet: Project, s: Signature, niveaux?: readonly string[]): number {
  const L = tableauMenuiseries(projet, niveaux);
  if (!L.length) return 0;
  const sections = [
    { titre: 'MENUISERIES EXTÉRIEURES', lignes: L.filter(l => l.exterieure) },
    { titre: 'MENUISERIES INTÉRIEURES', lignes: L.filter(l => !l.exterieure) },
  ].filter(x => x.lignes.length);
  let page: PagePdf | null = null, y = HAUT, pages = 0;
  const feuille = () => {
    page = nouvelleFeuille(doc); pages++; y = HAUT;
    colonne(page, projet, s, 'TABLEAU DES MENUISERIES', pages > 1 ? 'suite' : undefined, 'Menuiseries', 0);
    titrePlanche(page, 'TABLEAU DES MENUISERIES' + (pages > 1 ? ' (suite)' : ''), 'Un repère par type de baie : sa quantité et ses emplacements (niveau, pièce, façade) — tout se déduit du plan du projet');
    notes(page);
  };
  feuille();
  for (const sec of sections) {
    const R = sec.lignes.map(rangees);
    const total = sec.lignes.reduce((n, l) => n + l.quantite, 0);
    let k = 0, premier = true;
    while (k < R.length) {
      /* ce qui tient sur la page : le titre, l'en-tête, des lignes entières, le total à la fin */
      const place = Math.floor((BAS - y - 6.5) / PAS) - 1;
      let n = 0, rangs = 0;
      while (k + n < R.length && rangs + R[k + n]!.length + (k + n === R.length - 1 ? 1 : 0) <= place) { rangs += R[k + n]!.length; n++ }
      /* une ligne plus haute qu'une page vide (impossible en pratique) passe quand même, plutôt que de boucler */
      if (!n) { if (y > HAUT) { feuille(); continue } n = 1 }
      const fin = k + n === R.length;
      y += tableau(page!, 10, y, COLONNES, R.slice(k, k + n).flat(), {
        corps: CORPS, pas: PAS, titre: sec.titre + (premier ? '' : ' (suite)'),
        ...(fin ? { total: ['', 'Total', String(total), '', '', '', '', '', '', ''] } : {}),
      }) + 8;
      premier = false; k += n;
      if (!fin) feuille();
    }
  }
  return pages;
}

/** les notes, au-dessus du titre de la planche */
function notes(page: PagePdf): void {
  const N = [
    'Dimensions : le tableau de la baie dans le mur (largeur × hauteur, cm) et l’allège (m), tels qu’au plan — à reprendre sur place par le menuisier avant fabrication.',
    'Ouverture : « poussant droit », les paumelles sont à droite quand on pousse la porte (sens à confirmer avec le menuisier). Teintes et matériaux : Informations du dossier ; [à préciser] tant qu’ils ne sont pas choisis.',
    'Repères : F fenêtre, PF porte-fenêtre, B baie, PE porte extérieure, PG porte de garage, P porte intérieure. Ni les baies existantes conservées ou bouchées, ni les passages sans menuiserie.',
  ];
  N.forEach((t, i) => texte(page, t, 10, 262 + i * 3.6, 6.5, { couleur: GRIS_TEXTE }));
}
