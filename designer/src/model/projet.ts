/* Créer un projet vide, et retrouver les choses dedans. */
import { SCHEMA_VERSION, type BuildingObject, type Floor, type Project } from './types';
import { ulid, type GenerateurId } from './ids';

export interface OptionsProjet {
  nom: string;
  crmChantierId?: string;
  id?: GenerateurId;
}

/** un projet : un bâtiment, un niveau RDC (±0,00, 2,50 m sous plafond) */
export function creerProjet(o: OptionsProjet): Project {
  const id = o.id ?? (() => ulid());
  return {
    id: id(), schemaVersion: SCHEMA_VERSION, name: o.nom, phase: 'ESQ', units: 'mm', revision: 0,
    ...(o.crmChantierId ? { crmChantierId: o.crmChantierId } : {}),
    site: { id: id(), underlays: [] },
    buildings: [{ id: id(), name: 'Maison', floors: [{ id: id(), name: 'RDC', elevation: 0, height: 2_500, order: 0, objects: {} }] }],
  };
}

export interface Emplacement { batiment: number; niveau: number }

/** le niveau d'un identifiant, où qu'il soit */
export function trouverNiveau(p: Project, niveauId: string): (Emplacement & { floor: Floor }) | null {
  for (let b = 0; b < p.buildings.length; b++) {
    const F = p.buildings[b]!.floors;
    for (let n = 0; n < F.length; n++) if (F[n]!.id === niveauId) return { batiment: b, niveau: n, floor: F[n]! };
  }
  return null;
}

/** un objet, où qu'il soit, avec son niveau */
export function trouverObjet(p: Project, id: string): { objet: BuildingObject; niveauId: string } | null {
  for (const b of p.buildings) for (const f of b.floors) {
    const o = f.objects[id];
    if (o) return { objet: o, niveauId: f.id };
  }
  return null;
}

export const objetsDu = (f: Floor): BuildingObject[] => Object.values(f.objects);
