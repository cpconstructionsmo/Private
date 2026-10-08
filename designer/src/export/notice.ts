/* Le brouillon de la notice (PCMI 4) : les rubriques du formulaire, écrites
   à partir de ce qui est MESURÉ ou CHOISI dans le projet (reculs, emprise,
   hauteurs, niveaux NGF, fondations, règles du PLU saisies, toiture,
   parements, menuiseries, aménagements, arbres, réseaux tracés au plan de
   masse). Ce que le Designer ne sait pas (état initial du terrain,
   essences, accord des concessionnaires…) s'écrit « [à compléter] » : rien
   n'est inventé. Le texte est à relire, et l'atelier reste l'outil de la
   notice définitive. */
import type { Opening, Project, Roof } from '../model/types';
import { parcelleDuProjet, reculs, empriseAuSol, aireEmprise, surfaceTerrain, bilanAmenagements, altitudeTerrain } from '../building/terrain';
import { controlePlu, surfacesDuTerrain } from '../building/plu';
import { fondationsDuProjet, SOUBASSEMENTS } from '../building/fondations';
import { metreTerrain, NOMS_RESEAUX } from '../building/terrassement';
import { GOUTTIERES, MATIERES_GOUTTIERE } from '../building/eaux-pluviales';
import { distance } from '../geometry/vecteur';
import { surfacesReglementaires } from '../building/surfaces';
import { toitureDuNiveau } from '../building/toiture';
import { materiau } from '../catalogue/materiaux';
import { choixOuvrage, teinteMenuiserie, type OuvrageMenuiserie } from '../catalogue/menuiseries';
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
const relatif = (v: number) => (Math.abs(v) < 0.5 ? '±0,00' : (v > 0 ? '+' : '-') + (Math.abs(v) / 1000).toFixed(2).replace('.', ','));
/** les équipements des réseaux, au singulier (ceux du plan de masse) */
const EQUIPEMENTS: Record<string, string> = { regard: 'regard', branchement: 'boîte de branchement', compteur_eau: 'compteur d’eau', coffret_elec: 'coffret électrique', chambre_telecom: 'chambre télécom',
  coffret_gaz: 'coffret gaz', infiltration: 'puits d’infiltration', cuve_ep: 'cuve de récupération des eaux pluviales', assainissement: 'assainissement autonome' };

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
  /* le relief : relevé (points cotés) ou à compléter ; le reste de l'état initial ne se mesure pas ici */
  const Z = (t?.plot.spotHeights ?? []).map(x => x.ngf), f2 = (v: number) => v.toFixed(2).replace('.', ',');
  if (Z.length > 1) terrain.push('Relief : le terrain naturel va de ' + f2(Math.min(...Z)) + ' à ' + f2(Math.max(...Z)) + ' NGF (' + Z.length + ' points cotés relevés, soit ' + f2(Math.max(...Z) - Math.min(...Z)) + ' m de dénivelé).');
  else if (Z.length === 1) terrain.push('Relief : un point coté relevé à ' + f2(Z[0]!) + ' NGF ; ' + A_COMPLETER + '.');
  terrain.push('État initial (' + (Z.length > 1 ? '' : 'relief, ') + 'végétation, constructions existantes, abords) : ' + A_COMPLETER + '.');

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
  /* le terrain naturel sous la maison (points cotés interpolés aux angles de l'emprise), s'il est relevé et placé */
  const ngf0 = t?.plot.groundFloorNgf, tf = t?.plot.finishedGround;
  const tnSous = t && ngf0 !== undefined && Z.length ? E.flatMap(q => q.contour).map(q => altitudeTerrain(t.plot, q)).filter((z): z is number => z !== null) : [];
  const roofs = niveaux.flatMap(f => { const r = Object.values(f.objects).find((o): o is Roof => o.type === 'roof'), x = toitureDuNiveau(f); return r && x?.ok ? [{ r, x: x.toitures }] : [] });
  if (roofs.length) {
    const faitage = Math.max(...roofs.flatMap(z => z.x.map(y => y.faitage))), egout = Math.min(...roofs.flatMap(z => z.x.map(y => y.egoutZ)));
    const r = roofs[0]!.r, base = tnSous.length ? (Math.min(...tnSous) - ngf0!) * 1000 : null;
    implantation.push('Toiture ' + TOITURES[r.kind] + (r.kind !== 'flat' ? ', pente ' + r.pitch + '°' : '') + ', couverture ' + COUV[r.covering] + ' ; égout à ' + m(egout) + ' et ' + (r.kind === 'flat' ? 'acrotère' : 'faîtage') + ' à ' + m(faitage)
      + ' au-dessus du sol fini' + (base !== null ? ', soit ' + m(egout - base) + ' et ' + m(faitage - base) + ' au-dessus du terrain naturel le plus bas sous la maison.' : ' (altitude du terrain naturel ' + A_COMPLETER + ').'));
  } else implantation.push('Toiture : ' + A_COMPLETER + '.');
  /* les règles du PLU saisies sur la parcelle, en regard du projet (building/plu.ts) */
  const CP = controlePlu(p);
  if (CP?.regles.length) {
    const z = t!.plot.plu?.zone?.trim(), src = t!.plot.plu?.source?.trim();
    implantation.push('Règles ' + (z ? 'de la zone ' + z : 'du document d’urbanisme') + (src ? ' (' + src + ')' : '') + ' : '
      + CP.regles.map(r => r.libelle.toLowerCase() + ' ' + r.valeur + ' (' + r.limite + ')' + (r.etat === 'non_conforme' ? ', non tenu' : r.etat === 'a_verifier' ? ', à vérifier' : '')).join(' ; ') + '.');
  }

  /* 2 bis. l'adaptation au terrain : le ±0,00, le terrain fini, le terrain naturel sous la maison, le soubassement */
  const adaptation: string[] = [];
  if (ngf0 !== undefined) adaptation.push('Le niveau du rez-de-chaussée fini est fixé à ' + f2(ngf0) + ' NGF (±0,00)'
    + (tf !== undefined ? ' et le terrain fini aux abords de la construction à ' + f2(ngf0 + tf / 1000) + ' NGF (' + relatif(tf) + ')' : '')
    + (tnSous.length ? ' ; le terrain naturel sous la maison va de ' + f2(Math.min(...tnSous)) + ' à ' + f2(Math.max(...tnSous)) + ' NGF' : '') + '.');
  else adaptation.push('Niveau du rez-de-chaussée fini (altitude NGF) : ' + A_COMPLETER + '.');
  const fd = fondationsDuProjet(p);
  adaptation.push(fd ? 'Plancher du rez-de-chaussée sur ' + SOUBASSEMENTS[fd.fondation.kind].toLowerCase() + ', fondations par semelles filantes (dimensions et assise à confirmer par l’étude de sol).'
    : 'Fondations et soubassement : ' + A_COMPLETER + '.');
  adaptation.push('Mouvements de terre (déblais, remblais) : ' + A_COMPLETER + '.');

  /* 3. matériaux et couleurs */
  const materiaux: string[] = [];
  const parements = [...new Set(objets.flatMap(o => (o.type === 'wall' && o.role === 'exterior' ? [materiau(o.finish)?.libelle ?? ''] : [])))];
  materiaux.push('Façades : ' + (parements.filter(Boolean).length ? liste(parements.filter(Boolean).map(x => x.toLowerCase())) + (parements.includes('') ? ' ; autres murs : ' + A_COMPLETER : '') : A_COMPLETER) + '.');
  /* les menuiseries extérieures : les ouvertures des murs de façade (les portes intérieures n'ont rien à faire au permis) */
  const ouv = new Map<Opening['kind'], number>(), facade = new Set(objets.flatMap(o => (o.type === 'wall' && o.role === 'exterior' ? [o.id] : [])));
  for (const o of objets) if (o.type === 'opening' && facade.has(o.hostWallId)) ouv.set(o.kind, (ouv.get(o.kind) ?? 0) + 1);
  const ouvs = [...ouv].filter(([k]) => k !== 'void').map(([k, n]) => n + ' ' + OUV[k][n > 1 ? 1 : 0]);
  const ft = objets.filter(o => o.type === 'roof_window').length;
  if (ft) ouvs.push(ft + (ft > 1 ? ' fenêtres de toit' : ' fenêtre de toit'));
  /* le matériau et la teinte choisis aux informations du dossier ; la porte d'entrée et celle du garage si elles diffèrent */
  const dit = (q: OuvrageMenuiserie) => { const c = choixOuvrage(p.dossier, q); return (c.materiau ?? 'matériau ' + A_COMPLETER) + ', ' + (teinteMenuiserie(c.teinte)?.libelle ?? 'teinte ' + A_COMPLETER) };
  const portes = (['porteEntree', 'porteGarage'] as const).filter(q => (q === 'porteEntree' ? ouv.has('door') : ouv.has('garage_door')) && dit(q) !== dit('menuiseries'))
    .map(q => (q === 'porteEntree' ? 'porte d’entrée : ' : 'porte de garage : ') + dit(q));
  materiaux.push('Menuiseries extérieures : ' + (ouvs.length ? liste(ouvs) : 'aucune posée') + ' ; ' + dit('menuiseries') + (portes.length ? ' ; ' + portes.join(' ; ') : '') + '.');
  /* la couverture décrite aux informations du dossier (page de garde), sinon celle de la toiture dessinée */
  const couv = p.dossier?.couverture?.trim();
  if (couv) materiaux.push('Couverture : ' + couv.charAt(0).toLowerCase() + couv.slice(1) + (roofs.length && roofs[0]!.r.kind !== 'flat' ? ', pente ' + roofs[0]!.r.pitch + '°' : '') + '.');
  else if (roofs.length) materiaux.push('Couverture : ' + COUV[roofs[0]!.r.covering] + ', teinte ' + A_COMPLETER + '.');
  if (roofs.length && roofs[0]!.r.kind !== 'flat') {
    const r = roofs[0]!.r;
    materiaux.push('Zinguerie : ' + (r.gutter === 'none' ? 'pas de gouttière' : r.gutter ? 'gouttières ' + GOUTTIERES[r.gutter].toLowerCase() + (r.gutterMaterial ? ' en ' + MATIERES_GOUTTIERE[r.gutterMaterial] : '') + ' et descentes d’eaux pluviales' : A_COMPLETER) + '.');
  }
  if (p.dossier?.chauffage?.trim()) materiaux.push('Chauffage : ' + p.dossier.chauffage.trim() + (/pompe à chaleur|pac\b/i.test(p.dossier.chauffage) ? ' (emplacement de l’unité extérieure ' + A_COMPLETER + ')' : '') + '.');

  /* 4. abords : clôtures, espaces libres, accès et stationnement */
  const abords: string[] = [];
  const de = (g: string) => A.filter(a => a.genre === g).map(a => (finitionAmenagement(a.finition)?.libelle ?? GENRES_AMENAGEMENT[a.genre].libelle).toLowerCase() + ' (' + (g === 'fence' ? m(a.mesure) : m2(a.mesure)) + ')');
  const clo = de('fence'), ter = de('terrace'), all = de('path'), sta = de('parking'), ver = A.filter(a => a.genre === 'green');
  abords.push('Clôtures : ' + (clo.length ? liste(clo) : A_COMPLETER) + '.');
  if (ter.length) abords.push('Terrasses : ' + liste(ter) + '.');
  /* les espaces libres : la pleine terre (ce qui reste du terrain), les espaces verts tracés, les arbres posés au plan de masse */
  const SF = surfacesDuTerrain(p), Mt = metreTerrain(p), ar = Mt.arbres;
  const arbres = [ar.aPlanter ? ar.aPlanter + (ar.aPlanter > 1 ? ' arbres de haute tige à planter' : ' arbre de haute tige à planter') : '', ar.existants ? ar.existants + (ar.existants > 1 ? ' arbres existants conservés' : ' arbre existant conservé') : '',
    ar.aAbattre ? ar.aAbattre + (ar.aAbattre > 1 ? ' arbres à abattre' : ' arbre à abattre') : ''].filter(Boolean);
  const vert = ver.reduce((s, a) => s + a.mesure, 0);
  abords.push('Espaces libres et plantations : ' + [SF ? 'pleine terre ' + m2(SF.pleineTerre) + ', soit ' + pc(SF.pleineTerre, SF.terrain) + ' du terrain' : '', vert ? 'espaces verts tracés ' + m2(vert) : '', ...arbres].filter(Boolean).join(' ; ')
    + (SF || arbres.length ? ' ; essences ' + A_COMPLETER : A_COMPLETER) + '.');
  const places = t?.plot.plu?.stationnementPrevu;
  abords.push('Accès et stationnement : ' + ([...all, ...sta].length ? liste([...all, ...sta]) : A_COMPLETER)
    + (places !== undefined ? ' ; ' + places + (places > 1 ? ' places de stationnement prévues' : ' place de stationnement prévue') : '')
    + (objets.some(o => o.type === 'room' && o.usage === 'garage') ? ' ; un garage est prévu dans la construction' : '') + '.');
  /* les réseaux tracés au plan de masse : leur longueur, et l'équipement posé à un de leurs bouts (puisard, regard, coffret) */
  const reseaux = objets.flatMap(o => (o.type === 'network' ? [o] : [])), equip = objets.flatMap(o => (o.type === 'network_item' ? [o] : []));
  abords.push('Raccordements aux réseaux : ' + (reseaux.length
    ? reseaux.map(r => {
      const L = r.points.slice(1).reduce((s, q, i) => s + distance(r.points[i]!, q), 0), bouts = [r.points[0]!, r.points[r.points.length - 1]!];
      const e = equip.find(x => bouts.some(b => distance(b, x.position) < 1_500));
      return NOMS_RESEAUX[r.kind].libelle.toLowerCase() + ' (' + NOMS_RESEAUX[r.kind].code + ', ' + m(L) + (e ? ', ' + (e.label?.trim() || EQUIPEMENTS[e.kind] || e.kind).replace(/^./, c => c.toLowerCase()) : '') + ')';
    }).join(' ; ') + ' ; tracés au plan de masse, à confirmer par les concessionnaires'
    : '(eau, électricité, assainissement, eaux pluviales) ' + A_COMPLETER) + '.');

  return [
    { titre: '1. Le terrain et ses abords', paragraphes: terrain },
    { titre: '2. Implantation, organisation et volume', paragraphes: implantation },
    { titre: '3. Adaptation au terrain', paragraphes: adaptation },
    { titre: '4. Matériaux et couleurs', paragraphes: materiaux },
    { titre: '5. Clôtures, espaces libres, accès, stationnement et réseaux', paragraphes: abords },
  ];
}
