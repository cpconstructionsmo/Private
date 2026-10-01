/* Les commandes : la seule porte d'entrée pour modifier le modèle
   (ADR-0005). Chacune VALIDE sa demande puis la traduit en opérations
   inversibles ; une commande refusée ne change rien et dit pourquoi.

   C'est la même interface qu'utilisera l'IA (Phase 4) : elle proposera des
   commandes, jamais des écritures directes.

   Provenance (règle 4) : chaque objet créé ou modifié porte la révision du
   projet et une source « utilisateur » datée. Un mur n'est jamais déclaré
   porteur « confirmé » sans document (règle 5) : par défaut, à contrôler. */
import type { Mm, Opening, Point, Project, Room, RoomUsage, SourceRef, Wall } from '../model/types';
import { trouverNiveau, trouverObjet } from '../model/projet';
import type { GenerateurId } from '../model/ids';
import { distance } from '../geometry/vecteur';
import { EPS_COINCIDENCE } from '../geometry/tolerance';
import type { Operation } from './operations';

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

export type Commande =
  | { type: 'creerMur'; niveau: string; a: Point; b: Point; epaisseur: Mm; hauteur?: Mm; role?: Wall['role']; justification?: Wall['justification'] }
  | { type: 'deplacerMur'; id: string; a?: Point; b?: Point }
  | { type: 'modifierMur'; id: string; epaisseur?: Mm; hauteur?: Mm; role?: Wall['role']; justification?: Wall['justification'] }
  | { type: 'creerOuverture'; mur: string; position: Mm; largeur: Mm; hauteur: Mm; allege?: Mm; genre: Opening['kind']; sens?: Opening['swing'] }
  | { type: 'modifierOuverture'; id: string; position?: Mm; largeur?: Mm; hauteur?: Mm; allege?: Mm; genre?: Opening['kind']; sens?: Opening['swing'] }
  | { type: 'creerPiece'; niveau: string; point: Point; nom: string; usage: RoomUsage; humide?: boolean }
  | { type: 'modifierPiece'; id: string; nom?: string; usage?: RoomUsage; humide?: boolean; point?: Point }
  | { type: 'supprimer'; id: string }
  | { type: 'ajouterNiveau'; batiment: string; nom: string; altitude: Mm; hauteur: Mm }
  | { type: 'renommerProjet'; nom: string };

const fini = (...v: number[]): boolean => v.every(Number.isFinite);
const ptFini = (p: Point): boolean => fini(p.x, p.y);

const longueurMur = (w: Wall): Mm => ('a' in w.axis ? distance(w.axis.a, w.axis.b) : Math.abs(w.axis.arc.end - w.axis.arc.start) * w.axis.arc.radius);

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

export function traduire(p: Project, cmd: Commande, c: Contexte): Resultat {
  switch (cmd.type) {
    case 'creerMur': {
      const n = trouverNiveau(p, cmd.niveau);
      if (!n) return refus('niveau introuvable');
      if (!ptFini(cmd.a) || !ptFini(cmd.b) || !fini(cmd.epaisseur)) return refus('coordonnées invalides');
      if (distance(cmd.a, cmd.b) <= EPS_COINCIDENCE) return refus('un mur doit avoir une longueur');
      if (!(cmd.epaisseur > 0)) return refus('l’épaisseur doit être positive');
      const mur: Wall = {
        id: c.id(), type: 'wall', floorId: cmd.niveau, status: 'confirmed', sourceRefs: [source(c, 'Saisie')], revision: c.revision,
        axis: { a: { ...cmd.a }, b: { ...cmd.b } }, thickness: cmd.epaisseur, justification: cmd.justification ?? 'center',
        height: cmd.hauteur ?? n.floor.height, baseOffset: 0, role: cmd.role ?? 'partition',
        loadBearing: { value: cmd.role === 'exterior', status: 'to_check', missing: 'note de calcul ou plan de structure' },
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
        const L = distance(a, b);
        for (const { o } of ouverturesDe(p, w.id)) {
          const e = horsDuMur(o.offset, o.width, L);
          if (e) return refus('le mur raccourci ne porte plus son ouverture : ' + e);
        }
        avant['axis'] = w.axis; apres['axis'] = { a: { ...a }, b: { ...b } };
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
      const o: Opening = {
        id: c.id(), type: 'opening', floorId: t.niveauId, status: 'confirmed', sourceRefs: [source(c, 'Saisie')], revision: c.revision,
        hostWallId: cmd.mur, offset: cmd.position, width: cmd.largeur, height: cmd.hauteur, sill: cmd.allege ?? 0, kind: cmd.genre,
        ...(cmd.sens ? { swing: cmd.sens } : {}),
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
      const avant: Record<string, unknown> = { revision: o.revision, sourceRefs: o.sourceRefs };
      const apres: Record<string, unknown> = { revision: c.revision, sourceRefs: [...o.sourceRefs, source(c, 'Modification')] };
      const champs = { position: 'offset', largeur: 'width', hauteur: 'height', allege: 'sill', genre: 'kind', sens: 'swing' } as const;
      for (const k of Object.keys(champs) as (keyof typeof champs)[]) {
        if (cmd[k] === undefined) continue;
        avant[champs[k]] = o[champs[k]]; apres[champs[k]] = cmd[k];
      }
      return accepte([{ type: 'objet.modifier', niveau: t.niveauId, id: o.id, avant, apres }]);
    }
    case 'creerPiece': {
      if (!trouverNiveau(p, cmd.niveau)) return refus('niveau introuvable');
      if (!ptFini(cmd.point)) return refus('point invalide');
      if (!cmd.nom.trim()) return refus('une pièce a un nom');
      const r: Room = {
        id: c.id(), type: 'room', floorId: cmd.niveau, status: 'confirmed', sourceRefs: [source(c, 'Saisie')], revision: c.revision,
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
      /* un mur emporte ses ouvertures : une fenêtre sans mur n'a pas de sens */
      const ops: Operation[] = t.objet.type === 'wall'
        ? ouverturesDe(p, t.objet.id).map(({ o, niveau }) => ({ type: 'objet.retirer' as const, niveau, objet: o })) : [];
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
  }
}
