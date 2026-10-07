/* Les teintes et matériaux des menuiseries extérieures (fenêtres, portes-
   fenêtres, baies), de la porte d'entrée et de la porte de garage : ce que
   le permis demande d'annoncer aux façades (PCMI 5) et à la notice. Teintes
   RAL courantes, sans marque ni prix ; le descriptif (programme technique
   du suivi de chantiers) reste la référence.

   Un choix absent s'écrit « [à préciser] » ; le dessin garde alors le gris
   anthracite des dossiers du cabinet (RAL 7016), en le disant. */
import type { InfosDossier, TeinteOuvrage } from '../model/types';

export interface TeinteMenuiserie { id: string; libelle: string; couleur: string }

export const TEINTES_MENUISERIES: readonly TeinteMenuiserie[] = [
  { id: 'ral-7016', libelle: 'RAL 7016 gris anthracite', couleur: '#383E42' },
  { id: 'ral-9016', libelle: 'RAL 9016 blanc', couleur: '#F1F0EA' },
  { id: 'ral-9010', libelle: 'RAL 9010 blanc pur', couleur: '#F1ECE1' },
  { id: 'ral-7035', libelle: 'RAL 7035 gris clair', couleur: '#C5C7C4' },
  { id: 'ral-7039', libelle: 'RAL 7039 gris quartz', couleur: '#6B665E' },
  { id: 'ral-7022', libelle: 'RAL 7022 gris terre d’ombre', couleur: '#4B4D46' },
  { id: 'ral-9005', libelle: 'RAL 9005 noir foncé', couleur: '#141416' },
  { id: 'ral-1015', libelle: 'RAL 1015 ivoire clair', couleur: '#E6D2B5' },
  { id: 'ral-8019', libelle: 'RAL 8019 brun gris', couleur: '#3D3635' },
  { id: 'ral-5003', libelle: 'RAL 5003 bleu saphir', couleur: '#1F3855' },
  { id: 'ral-6005', libelle: 'RAL 6005 vert mousse', couleur: '#114232' },
  { id: 'chene-dore', libelle: 'Plaxé chêne doré', couleur: '#B07A3E' },
];

export const MATERIAUX_MENUISERIES: readonly string[] = ['PVC', 'Aluminium', 'PVC / aluminium', 'Mixte bois / aluminium', 'Bois', 'Acier'];

/** la teinte dessinée quand rien n'est choisi : le gris anthracite des dossiers du cabinet */
export const TEINTE_PAR_DEFAUT = 'ral-7016';

export const teinteMenuiserie = (id?: string | null): TeinteMenuiserie | null => TEINTES_MENUISERIES.find(t => t.id === id) ?? null;

/** les trois ouvrages qu'on décrit : chacun prend la teinte des menuiseries s'il n'en a pas de propre */
export type OuvrageMenuiserie = 'menuiseries' | 'porteEntree' | 'porteGarage';

/** le choix retenu pour un ouvrage : le sien, sinon (portes) celui des menuiseries, champ par champ */
export function choixOuvrage(d: InfosDossier | undefined, quoi: OuvrageMenuiserie): TeinteOuvrage {
  const propre = d?.[quoi] ?? {}, base = quoi === 'menuiseries' ? {} : d?.menuiseries ?? {};
  return { ...(propre.materiau ?? base.materiau ? { materiau: propre.materiau ?? base.materiau } : {}), ...(propre.teinte ?? base.teinte ? { teinte: propre.teinte ?? base.teinte } : {}) };
}

/** la couleur à dessiner pour un ouvrage */
export const couleurOuvrage = (d: InfosDossier | undefined, quoi: OuvrageMenuiserie): string =>
  (teinteMenuiserie(choixOuvrage(d, quoi).teinte) ?? teinteMenuiserie(TEINTE_PAR_DEFAUT)!).couleur;

/** un choix bien formé (ce que la commande accepte) ; null s'il l'est, sinon la raison */
export function teinteOuvrageInvalide(v: unknown): string | null {
  const x = v as TeinteOuvrage | null;
  if (!x || typeof x !== 'object' || Array.isArray(x)) return 'teinte de menuiserie invalide';
  if (x.materiau !== undefined && (typeof x.materiau !== 'string' || x.materiau.length > 80)) return 'matériau de menuiserie invalide';
  if (x.teinte !== undefined && !teinteMenuiserie(x.teinte)) return 'teinte de menuiserie inconnue : ' + String(x.teinte);
  return null;
}
