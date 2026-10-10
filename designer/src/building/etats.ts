/* Les états d'un projet de rénovation ou d'extension (ADR-0007).

   Un mur, une baie portent leur état (Wall.phase, Opening.phase) : existant
   conservé, existant à démolir (une baie : bouchée ou déposée), ou à
   construire (sans état : le projet). Le modèle EST l'état projeté — les
   murs à démolir n'y entrent dans aucun calcul (building/murs.ts : ils ne
   sont pas des mursDroits), les baies supprimées ne percent plus leur mur.

   L'état EXISTANT se dérive : le même niveau, réduit à ce qui existe avant
   les travaux — les murs et baies existants, conservés ou à démolir (ceux-ci
   redeviennent de simples existants), les pièces (leur nom se retrouve dans
   le vide qui contient leur point), la parcelle et ses abords. Le reste (le
   projet : murs neufs, meubles, escaliers, cotes…) n'y est pas. Rien n'est
   enregistré : l'état existant suit chaque modification, comme le plan.

   Un projet sans aucun état (une construction neuve) n'a pas d'état existant. */
import type { BuildingObject, Floor, Project } from '../model/types';

/** les objets qui restent dans l'état existant, en plus des murs et baies existants */
const GARDES_EXISTANT = new Set<BuildingObject['type']>(['room', 'plot', 'landscape', 'tree', 'underlay', 'viewpoint', 'section', 'roof']);

/** un projet de rénovation ou d'extension : au moins un mur ou une baie existants */
export function aDesExistants(p: Project): boolean {
  return p.buildings.some(b => b.floors.some(f => Object.values(f.objects).some(o => (o.type === 'wall' || o.type === 'opening') && !!o.phase)));
}

const niveaux = new WeakMap<Floor, Floor>();
/** le niveau tel qu'il est avant les travaux */
export function niveauExistant(f: Floor): Floor {
  const c = niveaux.get(f);
  if (c) return c;
  const objets: Floor['objects'] = {};
  const murs = new Set<string>();
  for (const o of Object.values(f.objects)) if (o.type === 'wall' && o.phase) { murs.add(o.id); objets[o.id] = { ...o, phase: 'existing' } }
  for (const o of Object.values(f.objects)) {
    if (o.type === 'opening') { if (o.phase && murs.has(o.hostWallId)) objets[o.id] = { ...o, phase: 'existing' } }
    else if (o.type !== 'wall' && GARDES_EXISTANT.has(o.type)) objets[o.id] = o;
  }
  const r: Floor = { ...f, objects: objets };
  niveaux.set(f, r);
  return r;
}

const projets = new WeakMap<Project, Project>();
/** le projet tel qu'il est avant les travaux (chaque niveau dans son état existant) */
export function projetExistant(p: Project): Project {
  const c = projets.get(p);
  if (c) return c;
  const r: Project = { ...p, buildings: p.buildings.map(b => ({ ...b, floors: b.floors.map(niveauExistant) })) };
  projets.set(p, r);
  return r;
}
