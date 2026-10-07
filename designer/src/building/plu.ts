/* Le contrôle des règles du PLU : les règles saisies sur la parcelle (zone,
   emprise, pleine terre, surfaces non imperméabilisées, coefficient de
   biotope, stationnement, hauteurs, reculs), confrontées aux mesures du
   projet. Rien n'est inventé : une règle absente n'est pas contrôlée, une
   mesure qui manque (places prévues, coefficient des revêtements
   perméables, terrain naturel) laisse la règle « à vérifier ». Le Designer
   mesure ; le règlement de la zone reste la référence.

   Surfaces : la pleine terre est le terrain moins l'emprise et les
   aménagements (allées, stationnement, terrasses), les espaces verts
   restant en pleine terre ; les revêtements perméables (gravillons, dalles
   engazonnées : catalogue/amenagements.ts) comptent « non
   imperméabilisés » ; tout autre revêtement compte imperméable. */
import type { Mm, Project, ReglesPlu } from '../model/types';
import { aireEmprise, altitudeTerrain, bilanAmenagements, empriseAuSol, parcelleDuProjet, reculs, surfaceTerrain } from './terrain';
import { toitureDuNiveau } from './toiture';
import { FINITIONS_PERMEABLES } from '../catalogue/amenagements';

export type EtatRegle = 'conforme' | 'non_conforme' | 'a_verifier';
export interface RegleControlee { cle: keyof ReglesPlu; libelle: string; valeur: string; limite: string; etat: EtatRegle }

/** les surfaces du terrain (mm²) */
export interface SurfacesTerrain { terrain: number; emprise: number; amenagees: number; permeables: number; pleineTerre: number; nonImpermeabilisees: number }

export function surfacesDuTerrain(projet: Project): SurfacesTerrain | null {
  const t = parcelleDuProjet(projet);
  if (!t) return null;
  const S = surfaceTerrain(t.plot), em = aireEmprise(empriseAuSol(projet));
  const A = bilanAmenagements(projet).filter(a => a.genre === 'path' || a.genre === 'parking' || a.genre === 'terrace');
  const amenagees = A.reduce((s, a) => s + a.mesure, 0), permeables = A.filter(a => FINITIONS_PERMEABLES.has(a.finition)).reduce((s, a) => s + a.mesure, 0);
  const pleineTerre = Math.max(0, S - em - amenagees);
  return { terrain: S, emprise: em, amenagees, permeables, pleineTerre, nonImpermeabilisees: pleineTerre + permeables };
}

const pc = (v: number) => Math.round(v) + ' %';
const m = (mm: Mm) => (mm / 1000).toFixed(2).replace('.', ',') + ' m';
const etat = (ok: boolean): EtatRegle => (ok ? 'conforme' : 'non_conforme');

/** les règles saisies, chacune avec la valeur du projet, sa limite et son état ; null sans parcelle */
export function controlePlu(projet: Project): { regles: RegleControlee[]; reference: 'tn' | 'rdc' } | null {
  const t = parcelleDuProjet(projet), Sf = surfacesDuTerrain(projet);
  if (!t || !Sf) return null;
  const R = t.plot.plu ?? {}, S = Sf.terrain || 1, out: RegleControlee[] = [];
  const pS = (v: number) => (v / S) * 100;
  if (R.empriseMax !== undefined) out.push({ cle: 'empriseMax', libelle: 'Emprise au sol', valeur: pc(pS(Sf.emprise)), limite: 'max. ' + pc(R.empriseMax), etat: etat(pS(Sf.emprise) <= R.empriseMax + 1e-9) });
  if (R.pleineTerreMin !== undefined) out.push({ cle: 'pleineTerreMin', libelle: 'Pleine terre', valeur: pc(pS(Sf.pleineTerre)), limite: 'min. ' + pc(R.pleineTerreMin), etat: etat(pS(Sf.pleineTerre) >= R.pleineTerreMin - 1e-9) });
  if (R.permeableMin !== undefined) out.push({ cle: 'permeableMin', libelle: 'Surfaces non imperméabilisées', valeur: pc(pS(Sf.nonImpermeabilisees)), limite: 'min. ' + pc(R.permeableMin), etat: etat(pS(Sf.nonImpermeabilisees) >= R.permeableMin - 1e-9) });
  if (R.biotopeMin !== undefined) {
    /* le coefficient de biotope : la pleine terre compte 1, les revêtements perméables le coefficient que donne le règlement */
    const cbs = R.biotopePermeable !== undefined ? (Sf.pleineTerre + R.biotopePermeable * Sf.permeables) / S : null;
    out.push({ cle: 'biotopeMin', libelle: 'Coefficient de biotope', valeur: cbs !== null ? cbs.toFixed(2).replace('.', ',') : '[coefficients à préciser]', limite: 'min. ' + R.biotopeMin.toFixed(2).replace('.', ','),
      etat: cbs === null ? 'a_verifier' : etat(cbs >= R.biotopeMin - 1e-9) });
  }
  if (R.stationnementMin !== undefined) out.push({ cle: 'stationnementMin', libelle: 'Stationnement', valeur: R.stationnementPrevu !== undefined ? R.stationnementPrevu + ' place' + (R.stationnementPrevu > 1 ? 's' : '') : '[places prévues à préciser]',
    limite: 'min. ' + R.stationnementMin, etat: R.stationnementPrevu === undefined ? 'a_verifier' : etat(R.stationnementPrevu >= R.stationnementMin) });
  /* les hauteurs : depuis le point le plus bas du terrain naturel sous la maison s'il est relevé, sinon depuis le RDC fini (à vérifier) */
  const toits = projet.buildings.flatMap(b => b.floors).flatMap(f => { const r = toitureDuNiveau(f); return r?.ok ? r.toitures : [] });
  const E = empriseAuSol(projet), ngf0 = t.plot.groundFloorNgf;
  const tn = ngf0 !== undefined && t.plot.spotHeights?.length ? E.flatMap(q => q.contour).map(p => altitudeTerrain(t.plot, p)).filter((z): z is number => z !== null) : [];
  const base = tn.length ? (Math.min(...tn) - ngf0!) * 1000 : 0, reference = tn.length ? 'tn' as const : 'rdc' as const;
  if (toits.length) {
    const egout = Math.min(...toits.map(x => x.egoutZ)) - base, faitage = Math.max(...toits.map(x => x.faitage)) - base;
    const h = (cle: 'egoutMax' | 'faitageMax', lib: string, v: number, max?: Mm) => { if (max !== undefined) out.push({ cle, libelle: lib, valeur: m(v), limite: 'max. ' + m(max), etat: v > max + 1 ? 'non_conforme' : reference === 'tn' ? 'conforme' : 'a_verifier' }) };
    h('egoutMax', 'Hauteur à l’égout', egout, R.egoutMax);
    h('faitageMax', 'Hauteur au faîtage', faitage, R.faitageMax);
  }
  /* les reculs : le plus petit côté voie, le plus petit sur les autres limites */
  const Rc = reculs(t.plot, E);
  const voie = Rc.filter(r => r.voie).map(r => r.distance), autres = Rc.filter(r => !r.voie).map(r => r.distance);
  if (R.reculVoieMin !== undefined && voie.length) out.push({ cle: 'reculVoieMin', libelle: 'Recul sur voie', valeur: m(Math.min(...voie)), limite: 'min. ' + m(R.reculVoieMin), etat: etat(Math.min(...voie) >= R.reculVoieMin - 1) });
  if (R.reculLimitesMin !== undefined && autres.length) out.push({ cle: 'reculLimitesMin', libelle: 'Recul sur limites séparatives', valeur: m(Math.min(...autres)), limite: 'min. ' + m(R.reculLimitesMin), etat: etat(Math.min(...autres) >= R.reculLimitesMin - 1) });
  return { regles: out, reference };
}

/** des règles bien formées (ce que la commande accepte) ; null si elles le sont, sinon la raison */
export function reglesPluInvalides(v: unknown): string | null {
  const R = v as ReglesPlu | null;
  if (!R || typeof R !== 'object' || Array.isArray(R)) return 'règles du PLU invalides';
  const texte = (k: 'zone' | 'source', max: number) => R[k] === undefined || (typeof R[k] === 'string' && R[k]!.length <= max);
  if (!texte('zone', 40) || !texte('source', 300)) return 'règles du PLU : texte trop long';
  const borne = (k: keyof ReglesPlu, min: number, max: number) => { const x = R[k]; return x === undefined || (typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max) };
  if (!borne('empriseMax', 0, 100) || !borne('pleineTerreMin', 0, 100) || !borne('permeableMin', 0, 100)) return 'règles du PLU : un pourcentage va de 0 à 100';
  if (!borne('biotopeMin', 0, 1) || !borne('biotopePermeable', 0, 1)) return 'règles du PLU : un coefficient de biotope va de 0 à 1';
  if (!borne('stationnementMin', 0, 50) || !borne('stationnementPrevu', 0, 50)) return 'règles du PLU : nombre de places invalide';
  if (!borne('egoutMax', 0, 60_000) || !borne('faitageMax', 0, 60_000) || !borne('reculVoieMin', 0, 100_000) || !borne('reculLimitesMin', 0, 100_000)) return 'règles du PLU : hauteur ou recul invalide';
  return null;
}
