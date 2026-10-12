/* Ajouter un niveau en reprenant les murs du niveau du dessous : une maison
   à étage monte le plus souvent ses murs de façade à l'aplomb de ceux du
   rez-de-chaussée. Plutôt que de les redessiner, on les reprend à la même
   place (même axe, épaisseur, composition, tracé, parement, qualification
   « porteur »), dans la même transaction que le niveau : un seul « annuler »
   retire le tout.

   Ce qui ne monte pas : les ouvertures, les pièces, les décors de façade
   (propres au rez-de-chaussée), l'état existant (un étage repris sur un
   existant est à construire), les murs à démolir et les murs courbes (ils
   sont comptés, pour le dire). La hauteur des murs repris est celle du
   nouveau niveau (règle des murs tracés à la main). */
import type { Floor, Mm, Project, Wall } from '../model/types';
import type { Commande } from './commandes';

export type MursRepris = 'aucun' | 'exterieurs' | 'tous';

export interface NiveauDessus {
  batiment: string;
  nom: string;
  altitude: Mm;
  hauteur: Mm;
  murs: MursRepris;
}

/** le niveau sur lequel le nouveau se pose : le plus haut sous son altitude */
export function niveauDessous(p: Project, altitude: Mm): Floor | null {
  const L = p.buildings.flatMap(b => b.floors).filter(f => f.elevation < altitude).sort((a, b) => b.elevation - a.elevation);
  return L[0] ?? null;
}

/** les murs du niveau du dessous qu'on reprendrait (« exterieurs » : les murs de façade ; « tous » : refends et cloisons aussi) */
export function mursAReprendre(f: Floor, quoi: MursRepris): { repris: (Wall & { axis: { a: { x: number; y: number }; b: { x: number; y: number } } })[]; courbes: number } {
  if (quoi === 'aucun') return { repris: [], courbes: 0 };
  const W = Object.values(f.objects).filter((o): o is Wall => o.type === 'wall' && o.phase !== 'demolished' && (quoi === 'tous' || o.role === 'exterior'));
  const repris = W.filter((w): w is Wall & { axis: { a: { x: number; y: number }; b: { x: number; y: number } } } => 'a' in w.axis);
  return { repris, courbes: W.length - repris.length };
}

/** les commandes : le niveau (à l'identifiant « idNiveau »), puis chaque mur repris et son parement */
export function commandesNiveauDessus(p: Project, n: NiveauDessus, idNiveau: string, id: () => string): { commandes: Commande[]; repris: number; courbes: number; dessous: Floor | null } {
  const commandes: Commande[] = [{ type: 'ajouterNiveau', batiment: n.batiment, nom: n.nom, altitude: n.altitude, hauteur: n.hauteur, id: idNiveau }];
  const dessous = niveauDessous(p, n.altitude);
  if (!dessous) return { commandes, repris: 0, courbes: 0, dessous };
  const { repris, courbes } = mursAReprendre(dessous, n.murs);
  for (const w of repris) {
    const nouveau = id();
    commandes.push({ type: 'creerMur', niveau: idNiveau, id: nouveau, a: { ...w.axis.a }, b: { ...w.axis.b }, epaisseur: w.thickness, role: w.role, justification: w.justification,
      porteur: structuredClone(w.loadBearing), ...(w.compositionRef ? { composition: w.compositionRef } : {}) });
    if (w.finish) commandes.push({ type: 'modifierMur', id: nouveau, finition: w.finish });
  }
  return { commandes, repris: repris.length, courbes, dessous };
}
