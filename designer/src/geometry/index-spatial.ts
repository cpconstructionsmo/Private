/* Index spatial : un R-tree construit d'un coup (méthode STR, « sort-tile-
   recursive »). Il répond à « quels objets touchent cette boîte ? » sans
   parcourir tout le plan : c'est ce qui garde l'accrochage et la sélection
   instantanés sur un grand plan (critère : moins de 5 ms pour 2 000 objets).

   Le modèle étant immuable, l'index se reconstruit quand le niveau change ;
   il ne se met pas à jour sur place. */
import type { Mm } from '../model/types';

export interface Boite { xmin: Mm; ymin: Mm; xmax: Mm; ymax: Mm }

export const boiteAutour = (x: Mm, y: Mm, r: Mm): Boite => ({ xmin: x - r, ymin: y - r, xmax: x + r, ymax: y + r });
const touche = (a: Boite, b: Boite): boolean => a.xmin <= b.xmax && b.xmin <= a.xmax && a.ymin <= b.ymax && b.ymin <= a.ymax;
function englober(L: readonly { boite: Boite }[]): Boite {
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const { boite: b } of L) { xmin = Math.min(xmin, b.xmin); ymin = Math.min(ymin, b.ymin); xmax = Math.max(xmax, b.xmax); ymax = Math.max(ymax, b.ymax) }
  return { xmin, ymin, xmax, ymax };
}

interface Noeud<T> { boite: Boite; enfants?: Noeud<T>[]; valeur?: T }

export class IndexSpatial<T> {
  private readonly racine: Noeud<T> | null;
  readonly taille: number;

  constructor(elements: readonly { boite: Boite; valeur: T }[], private readonly capacite = 16) {
    this.taille = elements.length;
    let niveau: Noeud<T>[] = elements.map(e => ({ boite: e.boite, valeur: e.valeur }));
    if (!niveau.length) { this.racine = null; return }
    while (niveau.length > 1) niveau = this.regrouper(niveau);
    this.racine = niveau[0]!;
  }

  /* STR : trier par x, couper en bandes verticales, trier chaque bande par
     y, grouper par paquets de « capacité » */
  private regrouper(L: Noeud<T>[]): Noeud<T>[] {
    const M = this.capacite, cx = (n: Noeud<T>) => n.boite.xmin + n.boite.xmax, cy = (n: Noeud<T>) => n.boite.ymin + n.boite.ymax;
    const parents = Math.ceil(L.length / M), bandes = Math.ceil(Math.sqrt(parents)), parBande = bandes * M;
    const tries = [...L].sort((a, b) => cx(a) - cx(b));
    const out: Noeud<T>[] = [];
    for (let i = 0; i < tries.length; i += parBande) {
      const bande = tries.slice(i, i + parBande).sort((a, b) => cy(a) - cy(b));
      for (let j = 0; j < bande.length; j += M) {
        const enfants = bande.slice(j, j + M);
        out.push({ boite: englober(enfants), enfants });
      }
    }
    return out;
  }

  /** les valeurs dont la boîte touche b */
  chercher(b: Boite): T[] {
    const out: T[] = [];
    if (!this.racine) return out;
    const pile: Noeud<T>[] = [this.racine];
    while (pile.length) {
      const n = pile.pop()!;
      if (!touche(n.boite, b)) continue;
      if (n.enfants) pile.push(...n.enfants);
      else out.push(n.valeur as T);
    }
    return out;
  }
}
