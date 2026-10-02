/* Les commandes : la seule porte d'entrée pour modifier le modèle
   (ADR-0005). Chacune VALIDE sa demande puis la traduit en opérations
   inversibles ; une commande refusée ne change rien et dit pourquoi.

   C'est la même interface qu'utilisera l'IA (Phase 4) : elle proposera des
   commandes, jamais des écritures directes.

   Provenance (règle 4) : chaque objet créé ou modifié porte la révision du
   projet et une source « utilisateur » datée. Un mur n'est jamais déclaré
   porteur « confirmé » sans document (règle 5) : par défaut, à contrôler.

   Déplacer un mur ou un sommet passe par le solveur (building/contraintes) :
   les murs qui s'y raccordent suivent, les contraintes et les cotes
   motrices restent vraies, ou la commande est refusée. */
import type { Constraint, Dimension, Furniture, Mm, ObjectAnchor, Opening, Point, Project, Qualified, Roof, Room, RoomUsage, SourceRef, SourceStatus, Underlay, Wall } from '../model/types';
import { trouverNiveau, trouverObjet } from '../model/projet';
import type { GenerateurId } from '../model/ids';
import { angleDe, distance, soustraire } from '../geometry/vecteur';
import { EPS_COINCIDENCE } from '../geometry/tolerance';
import { mesurerCote, resoudre, type Epingle } from '../building/contraintes';
import { calage, calageParDistance, TRANSFORMATION_NEUTRE } from '../building/fond';
import { appliquerTout, type Operation } from './operations';

export interface Contexte {
  /** qui agit (nom affiché, ou « IA » plus tard) */
  par: string;
  /** maintenant, en ISO 8601 */
  maintenant: () => string;
  id: GenerateurId;
  /** la révision que porteront les objets touchés */
  revision: number;
}

export type Resultat = { ok: true; operations: Operation[] } | { ok: false; erreurs: string[] };
const refus = (...erreurs: string[]): Resultat => ({ ok: false, erreurs });
const accepte = (operations: Operation[]): Resultat => ({ ok: true, operations });

const source = (c: Contexte, label: string): SourceRef => ({ kind: 'user', label, by: c.par, at: c.maintenant() });

/** provenance et statut d'un objet créé : saisie à la main, ou import (avec son document) */
function provenance(c: Contexte, o: Origine | undefined): { status: SourceStatus; sourceRefs: SourceRef[]; meta?: Record<string, unknown> } {
  if (!o) return { status: 'confirmed', sourceRefs: [source(c, 'Saisie')] };
  const ref: SourceRef = { kind: 'import', label: o.label, by: c.par, at: c.maintenant(), ...(o.document ? { documentId: o.document } : {}) };
  return { status: o.statut ?? 'to_check', sourceRefs: [ref], ...(o.meta ? { meta: structuredClone(o.meta) } : {}) };
}

/** « porteur » n'est jamais confirmé sans document (règle 5) */
function porteurQualifie(q: Qualified<boolean> | undefined, defaut: boolean): Qualified<boolean> {
  if (!q) return { value: defaut, status: 'to_check', missing: 'note de calcul ou plan de structure' };
  const document = (q.sourceRefs ?? []).some(r => r.kind === 'document' || r.kind === 'be');
  if (q.status === 'confirmed' && !document) return { ...structuredClone(q), status: 'to_check', missing: q.missing ?? 'note de calcul ou plan de structure' };
  return structuredClone(q);
}

/** d'où vient un objet créé autrement qu'à la main (import d'un plan) :
 *  sa source, son statut, et ce qui reste à vérifier (meta) — règle 4 */
export interface Origine { label: string; document?: string; statut?: SourceStatus; meta?: Record<string, unknown> }

export type Commande =
  | { type: 'creerMur'; niveau: string; a: Point; b: Point; epaisseur: Mm; hauteur?: Mm; role?: Wall['role']; justification?: Wall['justification']; id?: string; origine?: Origine; porteur?: Qualified<boolean> }
  | { type: 'deplacerMur'; id: string; a?: Point; b?: Point }
  | { type: 'modifierMur'; id: string; epaisseur?: Mm; hauteur?: Mm; role?: Wall['role']; justification?: Wall['justification'] }
  | { type: 'creerOuverture'; mur: string; position: Mm; largeur: Mm; hauteur: Mm; allege?: Mm; genre: Opening['kind']; sens?: Opening['swing']; origine?: Origine; vantaux?: number; manoeuvre?: Opening['operation']; modele?: Opening['catalogRef'] }
  | { type: 'modifierOuverture'; id: string; position?: Mm; largeur?: Mm; hauteur?: Mm; allege?: Mm; genre?: Opening['kind']; sens?: Opening['swing']; vantaux?: number; manoeuvre?: Opening['operation']; modele?: Opening['catalogRef'] }
  | { type: 'creerPiece'; niveau: string; point: Point; nom: string; usage: RoomUsage; humide?: boolean; origine?: Origine }
  | { type: 'modifierPiece'; id: string; nom?: string; usage?: RoomUsage; humide?: boolean; point?: Point }
  | { type: 'supprimer'; id: string }
  | { type: 'ajouterNiveau'; batiment: string; nom: string; altitude: Mm; hauteur: Mm }
  | { type: 'renommerProjet'; nom: string }
  /** déplacer une extrémité de mur : tous les murs qui y aboutissent suivent */
  | { type: 'deplacerSommet'; niveau: string; de: Point; vers: Point }
  | { type: 'ajouterContrainte'; niveau: string; genre: Constraint['kind']; murs: string[]; valeur?: number }
  | { type: 'modifierContrainte'; id: string; valeur: number }
  | { type: 'creerCote'; niveau: string; refs: [ObjectAnchor, ObjectAnchor]; motrice?: boolean; decalage?: Mm }
  | { type: 'modifierCote'; id: string; valeur?: Mm; motrice?: boolean; decalage?: Mm }
  | { type: 'modifierNiveau'; id: string; nom?: string; altitude?: Mm; hauteur?: Mm }
  | { type: 'supprimerNiveau'; id: string }
  /** un fond ; un tracé produit par le logiciel (plan source d'un import) arrive déjà calé, et peut être verrouillé d'emblée */
  | { type: 'ajouterFond'; niveau: string; fichier: string; nom?: string; page?: number; calage?: Underlay['transform']; verrouille?: boolean; opacite?: number; origine?: Origine }
  /** caler : deux points de l'image et leur place sur le plan, ou leur distance réelle */
  | { type: 'calerFond'; id: string; image: [Point, Point]; plan?: [Point, Point]; distance?: Mm }
  | { type: 'modifierFond'; id: string; verrouille?: boolean; opacite?: number }
  /** la toiture d'un niveau (une seule) : ses choix ; la géométrie se calcule */
  | { type: 'creerToiture'; niveau: string; genre: Roof['kind']; pente: number; debord: Mm; couverture: Roof['covering']; faitage?: Roof['ridge']; inverse?: boolean }
  | { type: 'modifierToiture'; id: string; genre?: Roof['kind']; pente?: number; debord?: Mm; couverture?: Roof['covering']; faitage?: Roof['ridge']; inverse?: boolean }
  /** un meuble ou un équipement de la bibliothèque, posé sur un niveau */
  | { type: 'creerMeuble'; niveau: string; modele: Furniture['catalogRef']; position: Point; rotation: number; largeur: Mm; profondeur: Mm; hauteur: Mm }
  | { type: 'modifierMeuble'; id: string; position?: Point; rotation?: number; largeur?: Mm; profondeur?: Mm; hauteur?: Mm };

const fini = (...v: number[]): boolean => v.every(Number.isFinite);
const ptFini = (p: Point): boolean => fini(p.x, p.y);

const longueurMur = (w: Wall): Mm => ('a' in w.axis ? distance(w.axis.a, w.axis.b) : Math.abs(w.axis.arc.end - w.axis.arc.start) * w.axis.arc.radius);

/** les choix d'une toiture : pente de 5 à 75° (sans objet pour un toit-terrasse), débord de 0 à 2 m */
function toitureInvalide(genre: Roof['kind'], pente: number, debord: Mm): string | null {
  if (!fini(pente, debord)) return 'pente ou débord invalide';
  if (genre !== 'flat' && !(pente >= 5 && pente <= 75)) return 'pente de 5 à 75°';
  if (!(debord >= 0 && debord <= 2_000)) return 'débord de 0 à 2 m';
  return null;
}

/** les cotes d'un meuble : largeur et profondeur de 1 cm à 20 m, hauteur de 0 à 5 m */
function meubleInvalide(l: Mm, p: Mm, h: Mm): string | null {
  if (!fini(l, p, h)) return 'dimensions invalides';
  if (!(l >= 10 && l <= 20_000 && p >= 10 && p <= 20_000)) return 'largeur et profondeur de 1 cm à 20 m';
  if (!(h >= 0 && h <= 5_000)) return 'hauteur de 0 à 5 m';
  return null;
}

const vantauxValides = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 4;

/** une ouverture tient-elle dans son mur ? (position = milieu de l'ouverture, depuis l'origine du mur) */
function horsDuMur(position: Mm, largeur: Mm, longueur: Mm): string | null {
  if (largeur <= 0) return 'la largeur doit être positive';
  if (position - largeur / 2 < -EPS_COINCIDENCE || position + largeur / 2 > longueur + EPS_COINCIDENCE)
    return 'l’ouverture (' + largeur + ' mm centrée à ' + Math.round(position) + ' mm) dépasse du mur (' + Math.round(longueur) + ' mm)';
  return null;
}

/** les ouvertures portées par un mur */
function ouverturesDe(p: Project, murId: string): { o: Opening; niveau: string }[] {
  const out: { o: Opening; niveau: string }[] = [];
  for (const b of p.buildings) for (const f of b.floors) for (const o of Object.values(f.objects))
    if (o.type === 'opening' && o.hostWallId === murId) out.push({ o, niveau: f.id });
  return out;
}

/** appliquer des opérations, puis épingler des sommets et laisser le solveur
    ajuster les murs du niveau ; refusé si une contrainte, une cote motrice
    ou une ouverture ne peut plus être respectée */
function ajuster(p: Project, niveauId: string, avant: Operation[], epingles: Epingle[], c: Contexte, principaux: readonly string[] = []): Resultat {
  const p1 = appliquerTout(p, avant);
  const n = trouverNiveau(p1, niveauId);
  if (!n) return refus('niveau introuvable');
  const r = resoudre(n.floor, epingles);
  if (!r.ok) return refus(...r.erreurs);
  const ops = [...avant];
  for (const [id, axe] of Object.entries(r.axes)) {
    const w = n.floor.objects[id] as Wall;
    const L = distance(axe.a, axe.b);
    for (const { o } of ouverturesDe(p1, id)) {
      const e = horsDuMur(o.offset, o.width, L);
      if (e) return refus('le mur modifié ne porte plus son ouverture : ' + e);
    }
    ops.push({ type: 'objet.modifier', niveau: niveauId, id, avant: { axis: w.axis, revision: w.revision, sourceRefs: w.sourceRefs },
      apres: { axis: axe, revision: c.revision, sourceRefs: [...w.sourceRefs, source(c, principaux.includes(id) ? 'Modification' : 'Ajusté (raccords, contraintes)')] } });
  }
  return accepte(ops);
}

/** les sommets qu'un ancrage de cote tient fixes */
function sommetsDe(p: Project, x: ObjectAnchor): Point[] {
  const t = trouverObjet(p, x.objectId);
  if (!t || t.objet.type !== 'wall' || !('a' in t.objet.axis)) return [];
  const { a, b } = t.objet.axis;
  return x.feature === 'start' ? [a] : x.feature === 'end' ? [b] : [a, b];
}

const GENRES_UN_MUR: readonly Constraint['kind'][] = ['horizontal', 'vertical', 'length', 'angle'];

export function traduire(p: Project, cmd: Commande, c: Contexte): Resultat {
  switch (cmd.type) {
    case 'creerMur': {
      const n = trouverNiveau(p, cmd.niveau);
      if (!n) return refus('niveau introuvable');
      if (!ptFini(cmd.a) || !ptFini(cmd.b) || !fini(cmd.epaisseur)) return refus('coordonnées invalides');
      if (distance(cmd.a, cmd.b) <= EPS_COINCIDENCE) return refus('un mur doit avoir une longueur');
      if (!(cmd.epaisseur > 0)) return refus('l’épaisseur doit être positive');
      /* un identifiant fourni (import : les ouvertures s'y rattachent dans la même transaction) doit être neuf */
      if (cmd.id !== undefined && (!cmd.id.trim() || trouverObjet(p, cmd.id))) return refus('identifiant de mur déjà pris');
      const mur: Wall = {
        id: cmd.id ?? c.id(), type: 'wall', floorId: cmd.niveau, ...provenance(c, cmd.origine), revision: c.revision,
        axis: { a: { ...cmd.a }, b: { ...cmd.b } }, thickness: cmd.epaisseur, justification: cmd.justification ?? 'center',
        height: cmd.hauteur ?? n.floor.height, baseOffset: 0, role: cmd.role ?? 'partition',
        loadBearing: porteurQualifie(cmd.porteur, cmd.role === 'exterior'),
      };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: mur }]);
    }
    case 'deplacerMur':
    case 'modifierMur': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'wall') return refus('mur introuvable');
      const w = t.objet;
      const avant: Record<string, unknown> = { revision: w.revision, sourceRefs: w.sourceRefs };
      const apres: Record<string, unknown> = { revision: c.revision, sourceRefs: [...w.sourceRefs, source(c, 'Modification')] };
      if (cmd.type === 'deplacerMur') {
        if (!('a' in w.axis)) return refus('mur courbe : déplacement à venir');
        const a = cmd.a ?? w.axis.a, b = cmd.b ?? w.axis.b;
        if (!ptFini(a) || !ptFini(b)) return refus('coordonnées invalides');
        if (distance(a, b) <= EPS_COINCIDENCE) return refus('un mur doit avoir une longueur');
        /* les deux extrémités sont épinglées ; les murs raccordés suivent */
        return ajuster(p, t.niveauId, [], [{ de: w.axis.a, vers: a }, { de: w.axis.b, vers: b }], c, [w.id]);
      } else {
        if (cmd.epaisseur !== undefined && !(cmd.epaisseur > 0)) return refus('l’épaisseur doit être positive');
        if (cmd.hauteur !== undefined && !(cmd.hauteur > 0)) return refus('la hauteur doit être positive');
        for (const k of ['epaisseur', 'hauteur', 'role', 'justification'] as const) {
          if (cmd[k] === undefined) continue;
          const champ = ({ epaisseur: 'thickness', hauteur: 'height', role: 'role', justification: 'justification' } as const)[k];
          avant[champ] = w[champ]; apres[champ] = cmd[k];
        }
      }
      return accepte([{ type: 'objet.modifier', niveau: t.niveauId, id: w.id, avant, apres }]);
    }
    case 'creerOuverture': {
      const t = trouverObjet(p, cmd.mur);
      if (!t || t.objet.type !== 'wall') return refus('mur hôte introuvable');
      if (!fini(cmd.position, cmd.largeur, cmd.hauteur)) return refus('dimensions invalides');
      const e = horsDuMur(cmd.position, cmd.largeur, longueurMur(t.objet));
      if (e) return refus(e);
      if (!(cmd.hauteur > 0)) return refus('la hauteur doit être positive');
      if (cmd.vantaux !== undefined && !vantauxValides(cmd.vantaux)) return refus('de 1 à 4 vantaux');
      const o: Opening = {
        id: c.id(), type: 'opening', floorId: t.niveauId, ...provenance(c, cmd.origine), revision: c.revision,
        hostWallId: cmd.mur, offset: cmd.position, width: cmd.largeur, height: cmd.hauteur, sill: cmd.allege ?? 0, kind: cmd.genre,
        ...(cmd.sens ? { swing: cmd.sens } : {}),
        ...(cmd.vantaux !== undefined ? { leaves: cmd.vantaux } : {}), ...(cmd.manoeuvre ? { operation: cmd.manoeuvre } : {}),
        ...(cmd.modele ? { catalogRef: { ...cmd.modele } } : {}),
      };
      return accepte([{ type: 'objet.ajouter', niveau: t.niveauId, objet: o }]);
    }
    case 'modifierOuverture': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'opening') return refus('ouverture introuvable');
      const o = t.objet, mur = trouverObjet(p, o.hostWallId);
      if (!mur || mur.objet.type !== 'wall') return refus('mur hôte introuvable');
      const position = cmd.position ?? o.offset, largeur = cmd.largeur ?? o.width;
      const e = horsDuMur(position, largeur, longueurMur(mur.objet));
      if (e) return refus(e);
      if (cmd.hauteur !== undefined && !(cmd.hauteur > 0)) return refus('la hauteur doit être positive');
      if (cmd.vantaux !== undefined && !vantauxValides(cmd.vantaux)) return refus('de 1 à 4 vantaux');
      const avant: Record<string, unknown> = { revision: o.revision, sourceRefs: o.sourceRefs };
      const apres: Record<string, unknown> = { revision: c.revision, sourceRefs: [...o.sourceRefs, source(c, 'Modification')] };
      const champs = { position: 'offset', largeur: 'width', hauteur: 'height', allege: 'sill', genre: 'kind', sens: 'swing', vantaux: 'leaves', manoeuvre: 'operation', modele: 'catalogRef' } as const;
      for (const k of Object.keys(champs) as (keyof typeof champs)[]) {
        if (cmd[k] === undefined) continue;
        avant[champs[k]] = o[champs[k]] ?? null; apres[champs[k]] = cmd[k];
      }
      return accepte([{ type: 'objet.modifier', niveau: t.niveauId, id: o.id, avant, apres }]);
    }
    case 'creerPiece': {
      if (!trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      if (!ptFini(cmd.point)) return refus('point invalide');
      if (!cmd.nom.trim()) return refus('une pièce a un nom');
      const r: Room = {
        id: c.id(), type: 'room', floorId: cmd.niveau, ...provenance(c, cmd.origine), revision: c.revision,
        seed: { ...cmd.point }, name: cmd.nom.trim(), usage: cmd.usage, wet: cmd.humide ?? ['kitchen', 'bathroom', 'wc'].includes(cmd.usage),
      };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: r }]);
    }
    case 'modifierPiece': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'room') return refus('pièce introuvable');
      const r = t.objet;
      if (cmd.nom !== undefined && !cmd.nom.trim()) return refus('une pièce a un nom');
      if (cmd.point && !ptFini(cmd.point)) return refus('point invalide');
      const avant: Record<string, unknown> = { revision: r.revision, sourceRefs: r.sourceRefs };
      const apres: Record<string, unknown> = { revision: c.revision, sourceRefs: [...r.sourceRefs, source(c, 'Modification')] };
      if (cmd.nom !== undefined) { avant['name'] = r.name; apres['name'] = cmd.nom.trim() }
      if (cmd.usage !== undefined) { avant['usage'] = r.usage; apres['usage'] = cmd.usage }
      if (cmd.humide !== undefined) { avant['wet'] = r.wet; apres['wet'] = cmd.humide }
      if (cmd.point !== undefined) { avant['seed'] = r.seed; apres['seed'] = { ...cmd.point } }
      return accepte([{ type: 'objet.modifier', niveau: t.niveauId, id: r.id, avant, apres }]);
    }
    case 'supprimer': {
      const t = trouverObjet(p, cmd.id);
      if (!t) return refus('objet introuvable');
      if (t.objet.type === 'underlay' && t.objet.locked) return refus('fond verrouillé : déverrouillez-le avant de le retirer');
      /* un mur emporte ses ouvertures (une fenêtre sans mur n'a pas de sens),
         ses contraintes et ses cotes */
      const ops: Operation[] = [];
      if (t.objet.type === 'wall') {
        const id = t.objet.id;
        ops.push(...ouverturesDe(p, id).map(({ o, niveau }) => ({ type: 'objet.retirer' as const, niveau, objet: o })));
        const n = trouverNiveau(p, t.niveauId)!;
        for (const o of Object.values(n.floor.objects))
          if ((o.type === 'constraint' && o.walls.includes(id)) || (o.type === 'dimension' && o.refs.some(r => r.objectId === id)))
            ops.push({ type: 'objet.retirer', niveau: t.niveauId, objet: o });
      }
      ops.push({ type: 'objet.retirer', niveau: t.niveauId, objet: t.objet });
      return accepte(ops);
    }
    case 'ajouterNiveau': {
      const b = p.buildings.find(x => x.id === cmd.batiment);
      if (!b) return refus('bâtiment introuvable');
      if (!cmd.nom.trim()) return refus('un niveau a un nom');
      if (!fini(cmd.altitude, cmd.hauteur) || !(cmd.hauteur > 0)) return refus('altitude ou hauteur invalide');
      const ordre = b.floors.reduce((m, f) => Math.max(m, f.order), -1) + 1;
      return accepte([{ type: 'niveau.ajouter', batiment: b.id, index: b.floors.length,
        niveau: { id: c.id(), name: cmd.nom.trim(), elevation: cmd.altitude, height: cmd.hauteur, order: ordre, objects: {} } }]);
    }
    case 'renommerProjet': {
      if (!cmd.nom.trim()) return refus('un projet a un nom');
      return accepte([{ type: 'projet.modifier', avant: { name: p.name }, apres: { name: cmd.nom.trim() } }]);
    }
    case 'deplacerSommet': {
      if (!trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      if (!ptFini(cmd.de) || !ptFini(cmd.vers)) return refus('coordonnées invalides');
      return ajuster(p, cmd.niveau, [], [{ de: cmd.de, vers: cmd.vers }], c, murDroitsAuSommet(p, cmd.niveau, cmd.de));
    }
    case 'ajouterContrainte': {
      const n = trouverNiveau(p, cmd.niveau);
      if (!n) return refus('niveau introuvable');
      const un = GENRES_UN_MUR.includes(cmd.genre);
      if (cmd.murs.length !== (un ? 1 : 2)) return refus(un ? 'cette contrainte porte sur un mur' : 'cette contrainte porte sur deux murs');
      if (new Set(cmd.murs).size !== cmd.murs.length) return refus('il faut deux murs différents');
      const W: Wall[] = [];
      for (const id of cmd.murs) {
        const o = n.floor.objects[id];
        if (!o || o.type !== 'wall' || !('a' in o.axis)) return refus('mur droit introuvable sur ce niveau');
        W.push(o);
      }
      const deja = Object.values(n.floor.objects).some(o => o.type === 'constraint' && o.kind === cmd.genre
        && o.walls.length === cmd.murs.length && cmd.murs.every(id => o.walls.includes(id)));
      if (deja) return refus('cette contrainte existe déjà');
      let valeur = cmd.valeur;
      const axe = W[0]!.axis as { a: Point; b: Point };
      if (cmd.genre === 'length') valeur ??= distance(axe.a, axe.b);
      if (cmd.genre === 'angle') valeur ??= angleDe(soustraire(axe.b, axe.a));
      if ((cmd.genre === 'length' || cmd.genre === 'angle') && !(valeur !== undefined && Number.isFinite(valeur))) return refus('valeur invalide');
      if (cmd.genre === 'length' && !(valeur! > EPS_COINCIDENCE)) return refus('la longueur doit être positive');
      const k: Constraint = {
        id: c.id(), type: 'constraint', floorId: cmd.niveau, status: 'confirmed', sourceRefs: [source(c, 'Saisie')], revision: c.revision,
        kind: cmd.genre, walls: [...cmd.murs], ...(cmd.genre === 'length' || cmd.genre === 'angle' ? { value: valeur! } : {}),
      };
      /* une contrainte qui n'est pas encore vraie ajuste le plan (le plus petit déplacement), ou est refusée */
      return ajuster(p, cmd.niveau, [{ type: 'objet.ajouter', niveau: cmd.niveau, objet: k }], [], c, cmd.murs);
    }
    case 'modifierContrainte': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'constraint') return refus('contrainte introuvable');
      const k = t.objet;
      if (k.kind !== 'length' && k.kind !== 'angle') return refus('cette contrainte n’a pas de valeur');
      if (!Number.isFinite(cmd.valeur) || (k.kind === 'length' && !(cmd.valeur > EPS_COINCIDENCE))) return refus('valeur invalide');
      const w = trouverObjet(p, k.walls[0]!);
      if (!w || w.objet.type !== 'wall' || !('a' in w.objet.axis)) return refus('mur introuvable');
      /* l'origine du mur reste en place, son extrémité bouge */
      return ajuster(p, t.niveauId, [modifier(t.niveauId, k, { value: k.value }, { value: cmd.valeur }, c)], [{ de: w.objet.axis.a, vers: w.objet.axis.a }], c, k.walls);
    }
    case 'creerCote': {
      const n = trouverNiveau(p, cmd.niveau);
      if (!n) return refus('niveau introuvable');
      for (const r of cmd.refs) {
        const o = n.floor.objects[r.objectId];
        if (!o || o.type !== 'wall' || !('a' in o.axis)) return refus('une cote s’accroche à des murs droits du même niveau');
      }
      const ptRef = (r: ObjectAnchor) => r.feature === 'start' || r.feature === 'end';
      if (cmd.refs[0].objectId === cmd.refs[1].objectId && !(ptRef(cmd.refs[0]) && ptRef(cmd.refs[1]) && cmd.refs[0].feature !== cmd.refs[1].feature))
        return refus('sur un même mur, une cote va d’une extrémité à l’autre');
      const v = mesurerCote(n.floor, { refs: cmd.refs });
      if (v === null) return refus('cote impossible à mesurer (deux murs non parallèles ?)');
      if (cmd.motrice && !(v > EPS_COINCIDENCE)) return refus('une cote motrice nulle ne peut rien piloter');
      const d: Dimension = {
        id: c.id(), type: 'dimension', floorId: cmd.niveau, status: 'confirmed', sourceRefs: [source(c, 'Saisie')], revision: c.revision,
        refs: [{ ...cmd.refs[0] }, { ...cmd.refs[1] }], driving: !!cmd.motrice, offset: cmd.decalage ?? 500, ...(cmd.motrice ? { value: v } : {}),
      };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: d }]);
    }
    case 'modifierCote': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'dimension') return refus('cote introuvable');
      const d = t.objet, n = trouverNiveau(p, t.niveauId)!;
      const motrice = cmd.motrice ?? d.driving;
      if (cmd.valeur !== undefined && !motrice) return refus('cote non motrice : rendez-la motrice pour qu’elle déplace les murs');
      if (cmd.valeur !== undefined && !(Number.isFinite(cmd.valeur) && cmd.valeur > EPS_COINCIDENCE)) return refus('valeur invalide');
      if (cmd.decalage !== undefined && !Number.isFinite(cmd.decalage)) return refus('décalage invalide');
      const mesure = mesurerCote(n.floor, d);
      if (mesure === null) return refus('cote impossible à mesurer');
      const valeur = !motrice ? undefined : cmd.valeur ?? (d.driving ? d.value : mesure);
      const avant: Record<string, unknown> = { driving: d.driving, value: d.value, offset: d.offset };
      const apres: Record<string, unknown> = { driving: motrice, value: valeur, offset: cmd.decalage ?? d.offset };
      const op = modifier(t.niveauId, d, avant, apres, c);
      if (valeur === undefined || valeur === d.value && d.driving) return accepte([op]);
      /* le premier ancrage reste en place : c'est le second qui bouge */
      const fixes = sommetsDe(p, d.refs[0]);
      const murs = [...new Set(d.refs.map(r => r.objectId))];
      return ajuster(p, t.niveauId, [op], fixes.map(s => ({ de: s, vers: s })), c, murs);
    }
    case 'modifierNiveau': {
      const e = trouverNiveau(p, cmd.id);
      if (!e) return refus('niveau introuvable');
      const f = e.floor;
      if (cmd.nom !== undefined && !cmd.nom.trim()) return refus('un niveau a un nom');
      if (cmd.altitude !== undefined && !Number.isFinite(cmd.altitude)) return refus('altitude invalide');
      if (cmd.hauteur !== undefined && !(Number.isFinite(cmd.hauteur) && cmd.hauteur > 0)) return refus('la hauteur doit être positive');
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      if (cmd.nom !== undefined) { avant['name'] = f.name; apres['name'] = cmd.nom.trim() }
      if (cmd.altitude !== undefined) { avant['elevation'] = f.elevation; apres['elevation'] = cmd.altitude }
      if (cmd.hauteur !== undefined) { avant['height'] = f.height; apres['height'] = cmd.hauteur }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([{ type: 'niveau.modifier', niveau: f.id, avant, apres }]);
    }
    case 'supprimerNiveau': {
      const e = trouverNiveau(p, cmd.id);
      if (!e) return refus('niveau introuvable');
      const b = p.buildings[e.batiment]!;
      if (b.floors.length < 2) return refus('un bâtiment garde au moins un niveau');
      /* le niveau part avec tout ce qu'il contient : annuler le rend intact */
      return accepte([{ type: 'niveau.retirer', batiment: b.id, index: e.niveau, niveau: e.floor }]);
    }
    case 'ajouterFond': {
      if (!trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      if (!cmd.fichier.trim()) return refus('fichier manquant');
      if (cmd.page !== undefined && !(Number.isInteger(cmd.page) && cmd.page >= 1)) return refus('numéro de page invalide');
      if (cmd.calage && !(Object.values(cmd.calage).every(Number.isFinite) && cmd.calage.scale > 0)) return refus('calage invalide');
      if (cmd.opacite !== undefined && !(cmd.opacite >= 0 && cmd.opacite <= 1)) return refus('opacité entre 0 et 1');
      const pr = cmd.origine ? provenance(c, cmd.origine) : { status: 'confirmed' as const, sourceRefs: [source(c, 'Import du fond')] };
      const u: Underlay = {
        id: c.id(), type: 'underlay', floorId: cmd.niveau, ...pr, revision: c.revision,
        fileKey: cmd.fichier, ...(cmd.nom ? { name: cmd.nom } : {}), ...(cmd.page ? { page: cmd.page } : {}),
        transform: { ...(cmd.calage ?? TRANSFORMATION_NEUTRE) }, locked: !!cmd.verrouille, opacity: cmd.opacite ?? 0.5,
      };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: u }]);
    }
    case 'calerFond': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'underlay') return refus('fond introuvable');
      const u = t.objet;
      if (u.locked) return refus('fond verrouillé : déverrouillez-le pour le recaler');
      if (!cmd.image.every(ptFini)) return refus('points de l’image invalides');
      const tr = cmd.plan ? (cmd.plan.every(ptFini) ? calage(cmd.image, cmd.plan) : 'points du plan invalides')
        : cmd.distance !== undefined ? calageParDistance(u.transform, cmd.image, cmd.distance) : 'indiquez la place des deux points sur le plan, ou leur distance réelle';
      if (typeof tr === 'string') return refus(tr);
      return accepte([modifier(t.niveauId, u, { transform: u.transform }, { transform: tr }, c, 'Calage')]);
    }
    case 'modifierFond': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'underlay') return refus('fond introuvable');
      const u = t.objet;
      if (cmd.opacite !== undefined && !(cmd.opacite >= 0 && cmd.opacite <= 1)) return refus('opacité entre 0 et 1');
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      if (cmd.verrouille !== undefined) { avant['locked'] = u.locked; apres['locked'] = cmd.verrouille }
      if (cmd.opacite !== undefined) { avant['opacity'] = u.opacity; apres['opacity'] = cmd.opacite }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t.niveauId, u, avant, apres, c)]);
    }
    case 'creerToiture': {
      const n = trouverNiveau(p, cmd.niveau);
      if (!n) return refus('niveau introuvable');
      if (Object.values(n.floor.objects).some(o => o.type === 'roof')) return refus('ce niveau a déjà une toiture : modifiez-la');
      const e = toitureInvalide(cmd.genre, cmd.pente, cmd.debord);
      if (e) return refus(e);
      const r: Roof = {
        id: c.id(), type: 'roof', floorId: cmd.niveau, ...provenance(c, undefined), revision: c.revision,
        kind: cmd.genre, pitch: cmd.pente, overhang: cmd.debord, covering: cmd.couverture,
        ...(cmd.faitage ? { ridge: cmd.faitage } : {}), ...(cmd.inverse ? { flip: true } : {}),
      };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: r }]);
    }
    case 'creerMeuble': {
      if (!trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      if (!ptFini(cmd.position) || !fini(cmd.rotation)) return refus('position invalide');
      if (!cmd.modele.id.trim()) return refus('modèle manquant');
      const e = meubleInvalide(cmd.largeur, cmd.profondeur, cmd.hauteur);
      if (e) return refus(e);
      const o: Furniture = {
        id: c.id(), type: 'furniture', floorId: cmd.niveau, ...provenance(c, undefined), revision: c.revision,
        position: { ...cmd.position }, rotation: cmd.rotation, width: cmd.largeur, depth: cmd.profondeur, height: cmd.hauteur, catalogRef: { ...cmd.modele },
      };
      return accepte([{ type: 'objet.ajouter', niveau: cmd.niveau, objet: o }]);
    }
    case 'modifierMeuble': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'furniture') return refus('meuble introuvable');
      const o = t.objet;
      if ((cmd.position && !ptFini(cmd.position)) || (cmd.rotation !== undefined && !fini(cmd.rotation))) return refus('position invalide');
      const e = meubleInvalide(cmd.largeur ?? o.width, cmd.profondeur ?? o.depth, cmd.hauteur ?? o.height);
      if (e) return refus(e);
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      const champs = { position: 'position', rotation: 'rotation', largeur: 'width', profondeur: 'depth', hauteur: 'height' } as const;
      for (const k of Object.keys(champs) as (keyof typeof champs)[]) {
        if (cmd[k] === undefined) continue;
        avant[champs[k]] = o[champs[k]]; apres[champs[k]] = cmd[k];
      }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t.niveauId, o, avant, apres, c)]);
    }
    case 'modifierToiture': {
      const t = trouverObjet(p, cmd.id);
      if (!t || t.objet.type !== 'roof') return refus('toiture introuvable');
      const r = t.objet;
      const e = toitureInvalide(cmd.genre ?? r.kind, cmd.pente ?? r.pitch, cmd.debord ?? r.overhang);
      if (e) return refus(e);
      const avant: Record<string, unknown> = {}, apres: Record<string, unknown> = {};
      const champs = { genre: 'kind', pente: 'pitch', debord: 'overhang', couverture: 'covering', faitage: 'ridge', inverse: 'flip' } as const;
      for (const k of Object.keys(champs) as (keyof typeof champs)[]) {
        if (cmd[k] === undefined) continue;
        avant[champs[k]] = r[champs[k]]; apres[champs[k]] = cmd[k];
      }
      if (!Object.keys(apres).length) return accepte([]);
      return accepte([modifier(t.niveauId, r, avant, apres, c)]);
    }
  }
}

/** une modification d'objet, avec révision et provenance */
function modifier(niveau: string, o: { id: string; revision: number; sourceRefs: SourceRef[] }, avant: Record<string, unknown>, apres: Record<string, unknown>, c: Contexte, label = 'Modification'): Operation {
  /* un champ absent s'écrit null : il le reste une fois le ChangeSet passé par le JSON */
  const nul = (x: Record<string, unknown>) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v === undefined ? null : v]));
  return { type: 'objet.modifier', niveau, id: o.id, avant: { ...nul(avant), revision: o.revision, sourceRefs: o.sourceRefs },
    apres: { ...nul(apres), revision: c.revision, sourceRefs: [...o.sourceRefs, source(c, label)] } };
}

/** les murs droits d'un niveau qui aboutissent à un point */
function murDroitsAuSommet(p: Project, niveau: string, s: Point): string[] {
  const n = trouverNiveau(p, niveau);
  if (!n) return [];
  return Object.values(n.floor.objects).filter(o => o.type === 'wall' && 'a' in o.axis
    && (distance(o.axis.a, s) <= EPS_COINCIDENCE || distance(o.axis.b, s) <= EPS_COINCIDENCE)).map(o => o.id);
}
