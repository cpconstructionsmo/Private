/* Les migrations du schéma : une fonction par passage de version (n → n+1),
   testée sur un instantané figé de la version n (tests/fixtures/). Comme
   pour la bibliothèque du PTR, rien n'est perdu : une donnée que la
   nouvelle version ne connaît plus est gardée dans meta.anciens. */
import { SCHEMA_VERSION, type Project } from './types';

type Brut = Record<string, unknown>;

/** MIGRATIONS[n] fait passer un projet de la version n à n + 1 */
export const MIGRATIONS: Record<number, (p: Brut) => Brut> = {
  /* aucune pour l'instant : le schéma est à sa version 1 */
};

export function migrer(p: Brut, cible: number = SCHEMA_VERSION, migrations: Record<number, (p: Brut) => Brut> = MIGRATIONS): Project {
  let courant = structuredClone(p);
  let v = courant['schemaVersion'] as number;
  while (v < cible) {
    const m = migrations[v];
    if (!m) throw new Error('migration du schéma ' + v + ' vers ' + (v + 1) + ' introuvable');
    courant = m(courant);
    v += 1;
    courant['schemaVersion'] = v;
  }
  return courant as unknown as Project;
}
