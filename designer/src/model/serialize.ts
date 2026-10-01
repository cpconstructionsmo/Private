/* Sérialisation canonique : clés triées, aucune valeur « undefined ».
   Deux modèles égaux donnent le même texte, octet pour octet — c'est ce que
   vérifie le test d'annulation (ADR-0005) et ce qui sert d'empreinte. */
import { SCHEMA_VERSION, type Project } from './types';
import { migrer } from './migrations';

export function canonique(v: unknown): string {
  return JSON.stringify(trier(v));
}

function trier(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(trier);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) o[k] = trier(x);
    }
    return o;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('nombre non fini dans le modèle');
  return v;
}

/** empreinte courte (FNV-1a 32 bits) : repérer un changement, pas sécuriser */
export function empreinte(v: unknown): string {
  const s = canonique(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0');
}

export const enregistrer = (p: Project): string => canonique(p);

/** relire un projet : migré à la version courante du schéma s'il est plus ancien */
export function relire(texte: string): Project {
  const brut = JSON.parse(texte) as { schemaVersion?: unknown };
  if (typeof brut !== 'object' || brut === null || typeof brut.schemaVersion !== 'number')
    throw new Error('ce fichier n’est pas un projet CP Designer (version de schéma absente)');
  if (brut.schemaVersion > SCHEMA_VERSION)
    throw new Error('projet enregistré par une version plus récente du Designer (schéma ' + brut.schemaVersion + ') : mettez la page à jour');
  return migrer(brut as unknown as Record<string, unknown>);
}
