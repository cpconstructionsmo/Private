/* Les opérations élémentaires sur le modèle : chacune est INVERSIBLE et
   porte ce qu'il faut pour se défaire (l'objet retiré entier, les valeurs
   d'avant d'une modification). Une suite d'opérations forme un ChangeSet
   (ADR-0005) : c'est elle qu'on enregistre, qu'on annule, et que l'IA
   proposera plus tard sans jamais écrire directement dans le modèle.

   Le modèle n'est jamais modifié sur place : appliquer rend un nouveau
   projet (seuls les niveaux touchés sont recopiés). */
import type { BuildingObject, Floor, Project } from '../model/types';
import { trouverNiveau } from '../model/projet';

type Champs = Record<string, unknown>;

export type Operation =
  | { type: 'objet.ajouter'; niveau: string; objet: BuildingObject }
  | { type: 'objet.retirer'; niveau: string; objet: BuildingObject }
  | { type: 'objet.modifier'; niveau: string; id: string; avant: Champs; apres: Champs }
  | { type: 'niveau.ajouter'; batiment: string; index: number; niveau: Floor }
  | { type: 'niveau.retirer'; batiment: string; index: number; niveau: Floor }
  | { type: 'niveau.modifier'; niveau: string; avant: Champs; apres: Champs }
  | { type: 'projet.modifier'; avant: Champs; apres: Champs };

export function inverse(op: Operation): Operation {
  switch (op.type) {
    case 'objet.ajouter': return { type: 'objet.retirer', niveau: op.niveau, objet: op.objet };
    case 'objet.retirer': return { type: 'objet.ajouter', niveau: op.niveau, objet: op.objet };
    case 'objet.modifier': return { ...op, avant: op.apres, apres: op.avant };
    case 'niveau.ajouter': return { ...op, type: 'niveau.retirer' };
    case 'niveau.retirer': return { ...op, type: 'niveau.ajouter' };
    case 'niveau.modifier': return { ...op, avant: op.apres, apres: op.avant };
    case 'projet.modifier': return { ...op, avant: op.apres, apres: op.avant };
  }
}

/** les opérations inverses, dans l'ordre inverse */
export const inverser = (ops: readonly Operation[]): Operation[] => [...ops].reverse().map(inverse);

/* une valeur « undefined » efface le champ : l'état d'avant revient exactement */
function fusionner<T extends object>(o: T, champs: Champs): T {
  const r: Champs = { ...(o as Champs) };
  for (const [k, v] of Object.entries(champs)) { if (v === undefined) delete r[k]; else r[k] = v }
  return r as T;
}

function avecNiveau(p: Project, niveauId: string, f: (n: Floor) => Floor): Project {
  const e = trouverNiveau(p, niveauId);
  if (!e) throw new Error('niveau introuvable : ' + niveauId);
  return {
    ...p,
    buildings: p.buildings.map((b, i) => i !== e.batiment ? b : { ...b, floors: b.floors.map((n, j) => (j === e.niveau ? f(n) : n)) }),
  };
}

export function appliquer(p: Project, op: Operation): Project {
  switch (op.type) {
    case 'objet.ajouter':
      return avecNiveau(p, op.niveau, n => {
        if (n.objects[op.objet.id]) throw new Error('objet déjà présent : ' + op.objet.id);
        return { ...n, objects: { ...n.objects, [op.objet.id]: op.objet } };
      });
    case 'objet.retirer':
      return avecNiveau(p, op.niveau, n => {
        if (!n.objects[op.objet.id]) throw new Error('objet introuvable : ' + op.objet.id);
        const { [op.objet.id]: _retire, ...reste } = n.objects;
        return { ...n, objects: reste };
      });
    case 'objet.modifier':
      return avecNiveau(p, op.niveau, n => {
        const o = n.objects[op.id];
        if (!o) throw new Error('objet introuvable : ' + op.id);
        return { ...n, objects: { ...n.objects, [op.id]: fusionner(o, op.apres) } };
      });
    case 'niveau.ajouter':
      return { ...p, buildings: p.buildings.map(b => b.id !== op.batiment ? b : { ...b, floors: [...b.floors.slice(0, op.index), op.niveau, ...b.floors.slice(op.index)] }) };
    case 'niveau.retirer':
      return { ...p, buildings: p.buildings.map(b => b.id !== op.batiment ? b : { ...b, floors: b.floors.filter(f => f.id !== op.niveau.id) }) };
    case 'niveau.modifier':
      return avecNiveau(p, op.niveau, n => fusionner(n, op.apres));
    case 'projet.modifier':
      return fusionner(p, op.apres);
  }
}

export const appliquerTout = (p: Project, ops: readonly Operation[]): Project => ops.reduce(appliquer, p);
