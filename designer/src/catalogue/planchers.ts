/* Les compositions de plafond et de plancher d'un niveau, couche par couche
   (du haut vers le bas). Valeurs d'usage en maison individuelle, sans marque
   ni prix : l'épaisseur d'isolant dépend de l'étude thermique, celle du
   plancher de l'étude de structure — à confirmer au descriptif.

   Le plafond d'un niveau est ce qui le couvre (combles perdus, ou plancher
   de l'étage) ; son sol est ce qui le porte (dalle sur terre-plein ou vide
   sanitaire, plancher d'étage). */
import type { Mm } from '../model/types';

export type MatierePlancher = 'vide' | 'laine_minerale' | 'laine_soufflee' | 'platre' | 'hourdis' | 'dalle_beton' | 'polyurethane' | 'chape' | 'revetement' | 'solives_bois' | 'osb' | 'herisson';

export const MATIERES_PLANCHER: Record<MatierePlancher, { libelle: string; couleur: string }> = {
  vide: { libelle: 'Vide', couleur: '#FFFFFF' },
  laine_minerale: { libelle: 'Laine minérale', couleur: '#F2DE8C' },
  laine_soufflee: { libelle: 'Laine soufflée', couleur: '#EED79A' },
  platre: { libelle: 'Plâtre', couleur: '#F7F5F0' },
  hourdis: { libelle: 'Poutrelles hourdis', couleur: '#B9B3A8' },
  dalle_beton: { libelle: 'Dalle béton', couleur: '#A7A49E' },
  polyurethane: { libelle: 'Isolant sous chape', couleur: '#E6EEF2' },
  chape: { libelle: 'Chape', couleur: '#CFCAC0' },
  revetement: { libelle: 'Revêtement', couleur: '#D9C4A5' },
  solives_bois: { libelle: 'Solives bois', couleur: '#D2AF7E' },
  osb: { libelle: 'Panneau OSB', couleur: '#C9A877' },
  herisson: { libelle: 'Hérisson', couleur: '#9C9488' },
};

export interface CouchePlancher { matiere: MatierePlancher; epaisseur: Mm }
export interface CompositionPlancher { id: string; libelle: string; genre: 'plafond' | 'sol'; couches: readonly CouchePlancher[] }

const c = (matiere: MatierePlancher, epaisseur: Mm): CouchePlancher => ({ matiere, epaisseur });
const k = (id: string, libelle: string, genre: CompositionPlancher['genre'], ...couches: CouchePlancher[]): CompositionPlancher => ({ id, libelle, genre, couches });

export const COMPOSITIONS_PLANCHERS: readonly CompositionPlancher[] = [
  /* plafonds : ce qui couvre le niveau */
  k('plafond-combles-47', 'Plafond sous combles perdus', 'plafond', c('laine_minerale', 400), c('vide', 57), c('platre', 13)),
  k('plafond-combles-soufflee', 'Plafond sous combles, laine soufflée', 'plafond', c('laine_soufflee', 320), c('vide', 37), c('platre', 13)),
  k('plafond-plancher-etage', 'Plafond sous plancher d’étage', 'plafond', c('hourdis', 200), c('vide', 50), c('platre', 13)),
  k('plafond-rampant', 'Plafond en rampant (combles aménagés)', 'plafond', c('laine_minerale', 300), c('vide', 37), c('platre', 13)),
  /* sols : ce qui porte le niveau */
  k('sol-beton-isole-30', 'Béton isolé (vide sanitaire)', 'sol', c('revetement', 10), c('chape', 60), c('polyurethane', 80), c('hourdis', 150)),
  k('sol-terre-plein', 'Dallage sur terre-plein', 'sol', c('revetement', 10), c('chape', 50), c('polyurethane', 100), c('dalle_beton', 120), c('herisson', 200)),
  k('sol-plancher-etage', 'Plancher d’étage béton', 'sol', c('revetement', 10), c('chape', 50), c('hourdis', 200)),
  k('sol-plancher-bois', 'Plancher d’étage bois', 'sol', c('revetement', 10), c('osb', 22), c('solives_bois', 220)),
];

export const compositionPlancher = (id: string | null | undefined): CompositionPlancher | undefined => (id ? COMPOSITIONS_PLANCHERS.find(x => x.id === id) : undefined);
export const epaisseurPlancher = (k: CompositionPlancher): Mm => k.couches.reduce((s, x) => s + x.epaisseur, 0);
export const compositionsPlancher = (g: CompositionPlancher['genre']): CompositionPlancher[] => COMPOSITIONS_PLANCHERS.filter(x => x.genre === g);
