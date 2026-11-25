/* « Dossier permis » : le fichier que l'Atelier (sur le Mac) lit pour créer le projet et préparer un brouillon
   du dossier de permis de construire (atelier/atelier/depuis_releve.py : même format, `cp-permis`, version 1).

   Fonctions pures, sans navigateur : le DXF du plan est calculé par le moteur (app.js) et passé ici.
   Rien n'est inventé : un champ que la visite ne connaît pas reste vide. Rien n'est validé non plus : les
   valeurs d'ici ne deviennent « confirmées » que par une personne, dans l'Atelier. */
import { valeur, intitule, domicile } from './modele.js';

export const FORMAT = 'cp-permis';
export const VERSION = 1;

const texte = x => (x == null ? '' : String(x)).trim();
const nombre = x => { const n = typeof x === 'string' ? parseFloat(x.replace(/\s/g, '').replace(',', '.')) : x; return typeof n === 'number' && isFinite(n) && n > 0 ? n : null; };

/* la parcelle lue au cadastre (section + numéro), « AB 123 » ; vide si le terrain n'a pas été localisé */
export function parcellesDe(v) {
  const p = (valeur(v, 'terrain.infos') || {}).parcelle;
  return p && p.section ? [texte(p.section) + ' ' + texte(p.numero)] : [];
}

/* l'adresse des travaux, comme dans le récapitulatif de la visite */
export function adresseTravaux(v) {
  return [valeur(v, 'client.adresse'), [valeur(v, 'client.codePostal'), valeur(v, 'client.ville')].filter(Boolean).join(' ')]
    .map(texte).filter(Boolean).join(', ');
}

/* le plan de la visite permet-il d'aller plus loin ? (un relevé du moteur, avec au moins une pièce) */
export const aUnPlan = v => { const p = valeur(v, 'plan'); return !!(p && p.releve && Array.isArray(p.releve.pieces) && p.releve.pieces.length); };

/* le nom du maître d'ouvrage, seulement s'il est connu : jamais le « Visite sans nom » de remplacement,
   qui serait imprimé sur la page de garde (rien n'est inventé) */
export const SANS_NOM = 'Visite sans nom';
export const nomClient = v => { const n = intitule(v); return n === SANS_NOM ? '' : n; };

export function dossierPermis(v, dxfBase64, creeLe = new Date().toISOString()) {
  if (!aUnPlan(v)) throw new Error('La visite n’a pas encore de plan.');
  if (!dxfBase64) throw new Error('Le plan n’a pas pu être converti en DXF.');
  return {
    format: FORMAT, version: VERSION, cree_le: creeLe,
    visite: { id: v.id, intitule: intitule(v) },
    client: { nom: nomClient(v), adresse: nomClient(v) ? texte(domicile(v, 1)) : '' },
    projet: { adresse: adresseTravaux(v), parcelles: parcellesDe(v), surface_terrain: nombre(valeur(v, 'terrain.surface')) },
    plan: { dxf_base64: dxfBase64 },
  };
}

/* un nom de fichier sûr : « dossier-permis-dupont.json » */
export function nomFichier(v) {
  const s = intitule(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return 'dossier-permis-' + (s || 'visite') + '.json';
}
