/* Le brouillon de la notice (PCMI 4) : les rubriques du formulaire, écrites
   à partir de ce qui est MESURÉ ou CHOISI dans le projet (reculs, emprise,
   hauteurs, toiture, parements, menuiseries, aménagements). Ce que le
   Designer ne sait pas (état initial du terrain, réseaux, teintes des
   menuiseries…) s'écrit « [à compléter] » : rien n'est inventé. Le texte
   est à relire, et l'atelier reste l'outil de la notice définitive. */
import type { Opening, Project, Roof } from '../model/types';
import { parcelleDuProjet, reculs, empriseAuSol, aireEmprise, surfaceTerrain, bilanAmenagements } from '../building/terrain';
import { surfacesReglementaires } from '../building/surfaces';
import { toitureDuNiveau } from '../building/toiture';
import { materiau } from '../catalogue/materiaux';
import { GENRES_AMENAGEMENT, finitionAmenagement } from '../catalogue/amenagements';

export interface RubriqueNotice { titre: string; paragraphes: string[] }

export const A_COMPLETER = '[à compléter]';
const m = (v: number) => (v / 1000).toFixed(2).replace('.', ',') + ' m';
const m2 = (v: number) => (v / 1e6).toFixed(2).replace('.', ',') + ' m²';
const pc = (a: number, b: number) => (a / b * 100).toFixed(1).replace('.', ',') + ' %';
const TOITURES: Record<Roof['kind'], string> = { hip: 'à croupes', gable: 'à deux pans', shed: 'à un pan', flat: 'en toit-terrasse' };
const COUV: Record<Roof['covering'], string> = { tile: 'tuiles', slate: 'ardoises', zinc: 'zinc', steel: 'bac acier', green: 'végétalisée', gravel: 'gravillons' };
const OUV: Record<Opening['kind'], [string, string]> = {
  door: ['porte', 'portes'], window: ['fenêtre', 'fenêtres'], french_window: ['porte-fenêtre', 'portes-fenêtres'],
  garage_door: ['porte de garage', 'portes de garage'], bay: ['baie', 'baies'], void: ['passage', 'passages'],
};
const liste = (L: string[]) => (L.length <= 1 ? L.join('') : L.slice(0, -1).join(', ') + ' et ' + L[L.length - 1]);

export function notice(p: Project): RubriqueNotice[] {
  const t = parcelleDuProjet(p), E = empriseAuSol(p), S = surfacesReglementaires(p), A = bilanAmenagements(p);
  const niveaux = p.buildings.flatMap(b => b.floors).sort((a, b) => a.elevation - b.elevation);
  const objets = niveaux.flatMap(f => Object.values(f.objects));

  /* 1. le terrain */
  const terrain: string[] = [];
  if (t) {
    terrain.push('Le terrain' + (t.plot.reference ? ' (parcelle ' + t.plot.reference + ')' : '') + ' a une surface de ' + m2(surfaceTerrain(t.plot)) + ' (limite tracée, à confirmer sur le plan de bornage)'
      + (t.plot.streetName ? ' ; il est desservi par ' + t.plot.streetName + '.' : t.plot.street.length ? ' ; il est desservi par la voie ' + A_COMPLETER + '.' : '.'));
  } else terrain.push('Terrain : surface et limites ' + A_COMPLETER + ' (parcelle à tracer).');
  terrain.push('État initial (relief, végétation, constructions existantes, abords) : ' + A_COMPLETER + '.');

  /* 2. implantation, volume */
  const implantation: string[] = [];
  if (t && E.length) {
    const R = reculs(t.plot, E), voie = R.filter(r => r.voie), autres = R.filter(r => !r.voie);
    const v = voie.length ? Math.min(...voie.map(r => r.distance)) : null, l = autres.length ? Math.min(...autres.map(r => r.distance)) : null;
    implantation.push('La construction s’implante ' + [v !== null ? 'à ' + m(v) + ' de l’alignement' : '', l !== null ? 'à ' + m(l) + ' de la limite séparative la plus proche' : ''].filter(Boolean).join(' et ')
      + ' (distances mesurées au nu extérieur des murs).');
    implantation.push('Emprise au sol : ' + m2(aireEmprise(E)) + ', soit ' + pc(aireEmprise(E), surfaceTerrain(t.plot)) + ' du terrain.');
  } else implantation.push('Implantation sur le terrain : ' + A_COMPLETER + '.');
  implantation.push('La maison comprend ' + (niveaux.length === 1 ? 'un niveau (' + niveaux[0]!.name + ')' : niveaux.length + ' niveaux (' + liste(niveaux.map(f => f.name)) + ')')
    + ' ; surface de plancher ' + m2(S.surfacePlancher) + ', surface habitable ' + m2(S.habitable) + '.');
  const roofs = niveaux.flatMap(f => { const r = Object.values(f.objects).find((o): o is Roof => o.type === 'roof'), x = toitureDuNiveau(f); return r && x?.ok ? [{ r, x: x.toitures }] : [] });
  if (roofs.length) {
    const faitage = Math.max(...roofs.flatMap(z => z.x.map(y => y.faitage))), egout = Math.min(...roofs.flatMap(z => z.x.map(y => y.egoutZ)));
    const r = roofs[0]!.r;
    implantation.push('Toiture ' + TOITURES[r.kind] + (r.kind !== 'flat' ? ', pente ' + r.pitch + '°' : '') + ', couverture ' + COUV[r.covering] + ' ; égout à ' + m(egout) + ' et ' + (r.kind === 'flat' ? 'acrotère' : 'faîtage') + ' à ' + m(faitage)
      + ' au-dessus du sol fini (altitude du terrain naturel ' + A_COMPLETER + ').');
  } else implantation.push('Toiture : ' + A_COMPLETER + '.');

  /* 3. matériaux et couleurs */
  const materiaux: string[] = [];
  const parements = [...new Set(objets.flatMap(o => (o.type === 'wall' && o.role === 'exterior' ? [materiau(o.finish)?.libelle ?? ''] : [])))];
  materiaux.push('Façades : ' + (parements.filter(Boolean).length ? liste(parements.filter(Boolean).map(x => x.toLowerCase())) + (parements.includes('') ? ' ; autres murs : ' + A_COMPLETER : '') : A_COMPLETER) + '.');
  const ouv = new Map<Opening['kind'], number>();
  for (const o of objets) if (o.type === 'opening') ouv.set(o.kind, (ouv.get(o.kind) ?? 0) + 1);
  const ouvs = [...ouv].filter(([k]) => k !== 'void').map(([k, n]) => n + ' ' + OUV[k][n > 1 ? 1 : 0]);
  const ft = objets.filter(o => o.type === 'roof_window').length;
  if (ft) ouvs.push(ft + (ft > 1 ? ' fenêtres de toit' : ' fenêtre de toit'));
  materiaux.push('Menuiseries : ' + (ouvs.length ? liste(ouvs) : 'aucune posée') + ' ; matériau et teinte ' + A_COMPLETER + '.');
  if (roofs.length) materiaux.push('Couverture : ' + COUV[roofs[0]!.r.covering] + ', teinte ' + A_COMPLETER + '.');

  /* 4. abords : clôtures, espaces libres, accès et stationnement */
  const abords: string[] = [];
  const de = (g: string) => A.filter(a => a.genre === g).map(a => (finitionAmenagement(a.finition)?.libelle ?? GENRES_AMENAGEMENT[a.genre].libelle).toLowerCase() + ' (' + (g === 'fence' ? m(a.mesure) : m2(a.mesure)) + ')');
  const clo = de('fence'), ter = de('terrace'), all = de('path'), sta = de('parking'), ver = A.filter(a => a.genre === 'green');
  abords.push('Clôtures : ' + (clo.length ? liste(clo) : A_COMPLETER) + '.');
  if (ter.length) abords.push('Terrasses : ' + liste(ter) + '.');
  abords.push('Espaces verts et plantations : ' + (ver.length ? m2(ver.reduce((s, a) => s + a.mesure, 0)) + (t ? ', soit ' + pc(ver.reduce((s, a) => s + a.mesure, 0), surfaceTerrain(t.plot)) + ' du terrain' : '') + ' ; essences ' + A_COMPLETER : A_COMPLETER) + '.');
  abords.push('Accès et stationnement : ' + ([...all, ...sta].length ? liste([...all, ...sta]) : A_COMPLETER)
    + (objets.some(o => o.type === 'room' && o.usage === 'garage') ? ' ; un garage est prévu dans la construction' : '') + '.');
  abords.push('Raccordements aux réseaux (eau, électricité, assainissement, eaux pluviales) : ' + A_COMPLETER + '.');

  return [
    { titre: '1. Le terrain et ses abords', paragraphes: terrain },
    { titre: '2. Implantation, organisation et volume', paragraphes: implantation },
    { titre: '3. Matériaux et couleurs', paragraphes: materiaux },
    { titre: '4. Clôtures, espaces libres, accès et stationnement', paragraphes: abords },
  ];
}
