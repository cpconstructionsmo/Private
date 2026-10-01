/* Identifiants stables (ULID) : 26 caractères, triables par date de
   création, sans coordination entre appareils. Un objet garde le sien toute
   sa vie, même déplacé ou modifié : c'est lui que référencent les ouvertures
   (mur hôte), les cotes, les ChangeSets et, plus tard, les postes chiffrés. */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford, sans I, L, O, U

export type GenerateurId = () => string;

function aleatoire(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function ulid(maintenant: number = Date.now(), hasard: (n: number) => Uint8Array = aleatoire): string {
  let t = maintenant, temps = '';
  for (let i = 0; i < 10; i++) { temps = ALPHABET[t % 32]! + temps; t = Math.floor(t / 32) }
  const r = hasard(16);
  let alea = '';
  for (let i = 0; i < 16; i++) alea += ALPHABET[r[i]! % 32]!;
  return temps + alea;
}

/** un générateur déterministe, pour les tests : mêmes appels, mêmes ids */
export function generateurSequentiel(prefixe = 'id'): GenerateurId {
  let n = 0;
  return () => prefixe + String(++n).padStart(6, '0');
}
