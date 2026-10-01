/* CP Designer — l'éditeur 2D.

   L'application ne fait que relier : gestes → outils → commandes →
   historique → enregistrement, et modèle → dessin. Aucune règle métier ici :
   une commande refusée l'est par le moteur, et la raison s'affiche telle
   quelle. Un aperçu (pendant un tracé ou un glissement) joue les commandes
   sur une copie, sans rien enregistrer. */
import type { BuildingObject, Floor, Mm, Opening, Point, Project, RoomUsage, Wall } from '../model/types';
import { ulid, canonique } from '../model';
import { trouverNiveau } from '../model/projet';
import { annulerEnregistre, executer, nouvelHistorique, peutAnnuler, peutRetablir, retablirEnregistre, type Acteur, type Commande, type Historique } from '../engine';
import { planDuNiveau, mursDroits, geometrieOuverture, type MurDroit } from '../building';
import { boite as boiteAnneau, mm2EnM2 } from '../geometry/polygon';
import { distance, normaliser, soustraire } from '../geometry/vecteur';
import { cadrer, glisser, pixelsEnMm, versMonde, zoomer, type Camera } from './camera';
import { dessiner, NOMS_ACCROCHE, type Scene } from './dessin';
import { Outils, OUVERTURES, type Effet, type Geste, type NomOutil } from './outils';
import { dessinCote } from './cotes';
import { ouvrirSession, type Enregistreur } from './session';
import { imageDuFond, importerFichier, nombrePages, type ImageFond } from './fonds';
import type { Accroche } from '../building/accrochage';

const USAGES: Record<RoomUsage, string> = {
  living: 'Séjour', bedroom: 'Chambre', kitchen: 'Cuisine', bathroom: 'Salle d’eau / de bains', wc: 'WC', circulation: 'Circulation',
  storage: 'Rangement', garage: 'Garage', technical: 'Technique', other: 'Autre',
};
const ROLES: Record<Wall['role'], string> = { exterior: 'Mur extérieur', partition: 'Cloison', bearing_interior: 'Refend' };
const JUSTIFS: Record<Wall['justification'], string> = { center: 'À l’axe', left: 'Par la face gauche', right: 'Par la face droite' };
const CONTRAINTES: Record<string, string> = { horizontal: 'Horizontal', vertical: 'Vertical', parallel: 'Parallèle', perpendicular: 'Perpendiculaire', length: 'Longueur fixe', angle: 'Angle fixe' };

const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',') + ' m';
const m2 = (v: number) => mm2EnM2(v).toFixed(2).replace('.', ',') + ' m²';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const date = (iso: string) => { try { return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) } catch { return iso } };

const CSS = `
.cpd{position:fixed;inset:0;display:grid;grid-template-columns:52px 1fr 300px;grid-template-rows:48px 1fr 28px;font:13px/1.4 system-ui,-apple-system,sans-serif;color:#1A2B36;background:#FBFAF7}
.cpd header{grid-column:1/4;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid #E4DED3;background:#fff}
.cpd header .marque{color:#C5563A;font-weight:700;letter-spacing:.05em;font-size:12px}
.cpd header input.nom{font:600 15px system-ui;border:1px solid transparent;border-radius:6px;padding:3px 6px;min-width:120px;color:#1A2B36;background:none}
.cpd header input.nom:hover,.cpd header input.nom:focus{border-color:#DDD5C8;background:#fff}
.cpd header .esp{flex:1}
.cpd .etat{font-size:12px;padding:3px 8px;border-radius:12px;background:#EEF3EF;color:#3F7A5A;white-space:nowrap;max-width:420px;overflow:hidden;text-overflow:ellipsis}
.cpd .etat.local,.cpd .etat.hors_ligne,.cpd .etat.en_attente{background:#FBF1DF;color:#8A5A12}
.cpd .etat.conflit{background:#FBE3DA;color:#A13A20}
.cpd button,.cpd select,.cpd input{font:inherit;color:inherit}
.cpd button{border:1px solid #DDD5C8;background:#fff;border-radius:6px;padding:4px 9px;cursor:pointer}
.cpd button:hover{border-color:#C5563A}
.cpd button:disabled{opacity:.4;cursor:default}
.cpd button.prim{background:#C5563A;border-color:#C5563A;color:#fff}
.cpd button.dang{color:#A13A20}
.cpd nav{grid-column:1;grid-row:2/3;display:flex;flex-direction:column;gap:4px;padding:6px;border-right:1px solid #E4DED3;background:#fff}
.cpd nav button{width:40px;height:40px;padding:0;font-size:17px;display:flex;align-items:center;justify-content:center;position:relative}
.cpd nav button.actif{background:#1A2B36;color:#fff;border-color:#1A2B36}
.cpd nav button small{position:absolute;right:2px;bottom:0;font-size:9px;opacity:.6}
.cpd main{grid-column:2;grid-row:2/3;position:relative;overflow:hidden;touch-action:none}
.cpd main canvas{position:absolute;inset:0;width:100%;height:100%;cursor:crosshair}
.cpd aside{grid-column:3;grid-row:2/3;overflow:auto;border-left:1px solid #E4DED3;background:#fff;padding:12px}
.cpd aside h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#6E7B84;margin:14px 0 6px}
.cpd aside h3:first-child{margin-top:0}
.cpd aside label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0}
.cpd aside label input:not([type=checkbox]):not([type=range]),.cpd aside label select{width:130px;border:1px solid #DDD5C8;border-radius:5px;padding:3px 6px;background:#fff}
.cpd aside .ligne{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.cpd aside .note{font-size:12px;color:#6E7B84}
.cpd aside .alerte{font-size:12px;padding:6px 8px;border-left:3px solid #C5563A;background:#FBF3EF;margin:4px 0}
.cpd aside .ok{font-size:12px;padding:6px 8px;border-left:3px solid #3F7A5A;background:#EEF3EF}
.cpd aside table{width:100%;border-collapse:collapse;font-size:12px}
.cpd aside td{padding:3px 0;border-bottom:1px solid #F0EBE3}
.cpd aside td:last-child{text-align:right;white-space:nowrap}
.cpd aside .niv{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer}
.cpd aside .niv.actif{background:#F5F1EA;font-weight:600}
.cpd aside .chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:2px 6px;border-radius:10px;background:#EEF3EF;color:#3F7A5A}
.cpd aside .chip button{border:none;padding:0 2px;background:none;color:inherit}
.cpd footer{grid-column:1/4;display:flex;gap:16px;align-items:center;padding:0 12px;border-top:1px solid #E4DED3;background:#fff;font-size:12px;color:#6E7B84}
.cpd footer .acc{color:#C5563A;font-weight:600}
.cpd .toast{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);background:#1A2B36;color:#fff;padding:8px 14px;border-radius:8px;max-width:70%;box-shadow:0 4px 16px rgba(0,0,0,.15)}
.cpd .toast.err{background:#A13A20}
.cpd .voile{position:fixed;inset:0;background:rgba(26,43,54,.35);display:flex;align-items:flex-start;justify-content:center;padding-top:12vh;z-index:10}
.cpd .boite{background:#fff;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.2);width:min(440px,92vw);padding:16px}
.cpd .boite h2{font-size:16px;margin:0 0 10px}
.cpd .boite label{display:block;margin:8px 0}
.cpd .boite label input,.cpd .boite label select{display:block;width:100%;box-sizing:border-box;margin-top:3px;border:1px solid #DDD5C8;border-radius:6px;padding:6px 8px}
.cpd .boite .pied{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.cpd .palette input{width:100%;box-sizing:border-box;border:1px solid #DDD5C8;border-radius:6px;padding:8px 10px;font-size:15px}
.cpd .palette ul{list-style:none;margin:8px 0 0;padding:0;max-height:50vh;overflow:auto}
.cpd .palette li{padding:7px 10px;border-radius:6px;cursor:pointer;display:flex;justify-content:space-between}
.cpd .palette li.sel{background:#F5F1EA}
.cpd .palette li kbd{font-size:11px;color:#6E7B84}
@media (max-width:820px){.cpd{grid-template-columns:48px 1fr;grid-template-rows:48px 1fr 40vh 28px}.cpd aside{grid-column:1/3;grid-row:3/4;border-left:none;border-top:1px solid #E4DED3}.cpd footer{grid-row:4/5}}
`;

interface Action { libelle: string; touche?: string; faire: () => void; visible?: () => boolean }

export async function demarrer(racine: HTMLElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  racine.innerHTML = `<style>${CSS}</style><div class="cpd"><header>
      <span class="marque">CP DESIGNER</span>
      <input class="nom" title="Nom du projet" spellcheck="false">
      <select class="niveaux" title="Niveau affiché"></select>
      <button class="annuler" title="Annuler (Ctrl+Z)">↶</button><button class="retablir" title="Rétablir (Ctrl+Maj+Z)">↷</button>
      <span class="esp"></span>
      <span class="etat" title="Enregistrement"></span>
      <button class="cmdk" title="Toutes les actions">⌘K</button>
      <a href="../index.html" style="color:#2C4A5E;font-size:12px">Suivi de chantiers</a>
    </header>
    <nav></nav>
    <main><canvas></canvas></main>
    <aside></aside>
    <footer><span class="aide"></span><span class="esp" style="flex:1"></span><span class="acc"></span><span class="coord"></span></footer></div>`;
  const $ = <T extends Element>(s: string) => racine.querySelector(s) as T;
  const canvas = $<HTMLCanvasElement>('canvas'), main = $<HTMLElement>('main'), aside = $<HTMLElement>('aside'), nav = $<HTMLElement>('nav');
  const ctx = canvas.getContext('2d')!;
  const etat = $<HTMLElement>('.etat');

  const signaler = (e: string, msg: string) => { etat.className = 'etat ' + e; etat.textContent = msg; etat.title = msg };
  etat.textContent = 'Ouverture…';
  const { connexion, utilisateur } = await import('../persistence/connexion');
  const { DepotSupabase } = await import('../persistence/depot-supabase');
  const { FondsSupabase } = await import('../persistence/fonds-supabase');
  const ouv = await ouvrirSession(params, { utilisateur, depot: () => new DepotSupabase(connexion()), fonds: () => new FondsSupabase(connexion()), signaler });
  const enr: Enregistreur = ouv.enregistreur;
  signaler(enr.mode === 'local' ? 'local' : 'a_jour', enr.raison);

  let h: Historique = nouvelHistorique(ouv.projet);
  const acteur: Acteur = { par: enr.par, maintenant: () => new Date().toISOString(), id: () => ulid() };
  const acteurApercu: Acteur = { par: enr.par, maintenant: () => new Date().toISOString(), id: (() => { let n = 0; return () => 'apercu-' + (++n) })() };
  let niveauId = [...ouv.projet.buildings[0]!.floors].sort((a, b) => a.elevation - b.elevation)[0]!.id;
  let selection: string | null = null;
  let apercu: Commande[] = [];
  let accroche: Accroche | null = null;
  let refusApercu = '';
  let curseur: Point | null = null;
  /** une action qui attend qu'on clique un mur (parallèle à…, perpendiculaire à…) */
  let choixMur: { libelle: string; faire: (id: string) => void } | null = null;
  const images = new Map<string, ImageFond>();
  const enChargement = new Set<string>();
  let cam: Camera = { centre: { x: 5_000, y: 4_000 }, echelle: 0.06, largeur: 800, hauteur: 600 };

  const outils = new Outils(() => ({ projet: h.projet, niveau: niveauId, selection }));
  const niveau = (p: Project = h.projet): Floor => trouverNiveau(p, niveauId)?.floor ?? p.buildings[0]!.floors[0]!;
  const niveaux = () => [...h.projet.buildings[0]!.floors].sort((a, b) => a.elevation - b.elevation);

  /* ---------- exécuter, annuler, enregistrer ---------- */
  function faire(titre: string, cmds: Commande[]): boolean {
    const r = executer(h, titre, cmds, acteur);
    if (!r.ok) { if (r.erreurs[0] !== 'rien à faire') toast(r.erreurs.join(' ; '), true); return false }
    h = r.historique;
    void enr.ajouter(r.changeSet, h.projet);
    apres();
    return true;
  }
  function annuler() { const r = annulerEnregistre(h, acteur); if (r.ok) { h = r.historique; void enr.ajouter(r.changeSet, h.projet); toast(r.changeSet.titre); apres() } }
  function retablir() { const r = retablirEnregistre(h, acteur); if (r.ok) { h = r.historique; void enr.ajouter(r.changeSet, h.projet); toast(r.changeSet.titre); apres() } }
  function apres() {
    if (!trouverNiveau(h.projet, niveauId)) niveauId = niveaux()[0]!.id;
    if (selection && !niveau().objects[selection]) selection = null;
    panneaux(); dessinerBientot();
  }

  /* ---------- dessin ---------- */
  let demande = 0;
  function dessinerBientot() { if (!demande) demande = requestAnimationFrame(() => { demande = 0; peindre() }) }
  function projetAffiche(): Project {
    refusApercu = '';
    if (!apercu.length) return h.projet;
    const r = executer(h, 'aperçu', apercu, acteurApercu);
    if (r.ok) return r.historique.projet;
    refusApercu = r.erreurs.join(' ; ');
    return h.projet;
  }
  function peindre() {
    const dpr = window.devicePixelRatio || 1, l = main.clientWidth, ht = main.clientHeight;
    if (canvas.width !== Math.round(l * dpr) || canvas.height !== Math.round(ht * dpr)) { canvas.width = Math.round(l * dpr); canvas.height = Math.round(ht * dpr) }
    cam = { ...cam, largeur: l, hauteur: ht };
    const p = projetAffiche(), f = niveau(p);
    const L = niveaux(), i = L.findIndex(x => x.id === niveauId);
    for (const o of Object.values(f.objects)) if (o.type === 'underlay') chargerFond(o.fileKey, o.page);
    let etiquette: Scene['etiquette'] = null;
    const nouveau = apercu.find(c => c.type === 'creerMur');
    if (nouveau && nouveau.type === 'creerMur' && curseur) etiquette = { point: curseur, texte: m(distance(nouveau.a, nouveau.b)) };
    if (refusApercu && curseur) etiquette = { point: curseur, texte: '⛔ ' + refusApercu };
    dessiner(ctx, cam, { niveau: f, dessous: i > 0 ? L[i - 1]! : null, selection, accroche, images, sommets: outils.outil === 'selection', etiquette }, dpr);
    $<HTMLElement>('.acc').textContent = accroche && accroche.genre !== 'libre' ? 'Accroché : ' + NOMS_ACCROCHE[accroche.genre] : '';
  }
  function chargerFond(cle: string, page?: number) {
    if (images.has(cle) || enChargement.has(cle)) return;
    enChargement.add(cle);
    imageDuFond(cle, page, undefined, enr.fonds).then(i => { if (i) { images.set(cle, i); dessinerBientot() } else toast('Le fichier d’un fond n’est ni sur cet appareil ni sur le serveur : réimportez-le pour le voir.', true) })
      .catch(e => toast('Fond illisible : ' + String((e as Error)?.message ?? e), true));
  }
  new ResizeObserver(() => dessinerBientot()).observe(main);

  /* ---------- gestes ---------- */
  const geste = (e: PointerEvent | MouseEvent): Geste => {
    const r = canvas.getBoundingClientRect();
    return { point: versMonde(cam, { x: e.clientX - r.left, y: e.clientY - r.top }), rayon: pixelsEnMm(cam, 10), alt: e.altKey, maj: e.shiftKey };
  };
  function effet(e: Effet) {
    if (e.accroche !== undefined) accroche = e.accroche;
    if (e.apercu !== undefined) apercu = e.apercu;
    if (e.selection !== undefined) { selection = e.selection; panneaux() }
    if (e.aide) $<HTMLElement>('.aide').textContent = e.aide;
    if (e.commandes) faire(e.commandes.titre, e.commandes.liste);
    if (e.demande?.genre === 'nomPiece') nommerPiece(e.demande.niveau, e.demande.point);
    if (e.demande?.genre === 'distanceFond') calerParDistance(e.demande.id, e.demande.image);
    if (e.fini) barreOutils();
    dessinerBientot();
  }
  let glisse: { x: number; y: number } | null = null, espace = false;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || espace) { glisse = { x: e.clientX, y: e.clientY }; e.preventDefault(); return }
    if (e.button !== 0) return;
    const g = geste(e);
    if (choixMur) {
      const w = mursDroits(niveau()).find(w => distance(w.axis.a, w.axis.b) > 0 && distSeg(g.point, w) <= w.thickness / 2 + g.rayon);
      if (w) { const c = choixMur; choixMur = null; c.faire(w.id) } else toast('Cliquez sur un mur', true);
      return;
    }
    effet(outils.appuyer(g));
  });
  canvas.addEventListener('pointermove', e => {
    if (glisse) { cam = glisser(cam, e.clientX - glisse.x, e.clientY - glisse.y); glisse = { x: e.clientX, y: e.clientY }; dessinerBientot(); return }
    const g = geste(e);
    curseur = g.point;
    $<HTMLElement>('.coord').textContent = 'x ' + m(g.point.x) + '   y ' + m(g.point.y);
    effet(outils.bouger(g));
  });
  canvas.addEventListener('pointerup', e => { if (glisse) { glisse = null; return } effet(outils.relacher(geste(e))) });
  canvas.addEventListener('dblclick', () => effet(outils.touche('Enter')));
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect(), p = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (e.ctrlKey || !e.shiftKey && Math.abs(e.deltaX) < 1) cam = zoomer(cam, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p);
    else cam = glisser(cam, -e.deltaX, -e.deltaY);
    dessinerBientot();
  }, { passive: false });
  canvas.addEventListener('pointerleave', () => { curseur = null; accroche = null; dessinerBientot() });

  const saisie = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;
  window.addEventListener('keydown', e => {
    if (e.key === ' ' && !saisie(e.target)) { espace = true; canvas.style.cursor = 'grab'; e.preventDefault(); return }
    const cmd = e.ctrlKey || e.metaKey;
    if (cmd && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); return }
    if (saisie(e.target) || racine.querySelector('.voile')) return;
    if (cmd && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? retablir() : annuler(); return }
    if (cmd && e.key.toLowerCase() === 'y') { e.preventDefault(); retablir(); return }
    if (cmd) return;
    if (e.key === 'Escape') { choixMur = null; effet(outils.touche('Escape')); barreOutils(); return }
    if (e.key === 'Enter') { effet(outils.touche('Enter')); return }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection) { e.preventDefault(); supprimer(selection); return }
    const t = TOUCHES[e.key.toLowerCase()];
    if (t) { choisir(t); return }
    if (e.key.toLowerCase() === 'f') { cadrerTout(); return }
    if (e.key.toLowerCase() === 'g') { basculerGrille(); return }
  });
  window.addEventListener('keyup', e => { if (e.key === ' ') { espace = false; canvas.style.cursor = '' } });

  /* ---------- outils ---------- */
  const OUTILS: { nom: NomOutil; icone: string; libelle: string; touche: string }[] = [
    { nom: 'selection', icone: '↖', libelle: 'Sélection', touche: 'V' }, { nom: 'mur', icone: '▬', libelle: 'Mur', touche: 'M' },
    { nom: 'cloison', icone: '▭', libelle: 'Cloison', touche: 'C' }, { nom: 'ouverture', icone: '◫', libelle: 'Ouverture', touche: 'O' },
    { nom: 'piece', icone: '⌂', libelle: 'Pièce', touche: 'P' }, { nom: 'cote', icone: '↔', libelle: 'Cote', touche: 'D' },
  ];
  const TOUCHES: Record<string, NomOutil> = Object.fromEntries(OUTILS.map(o => [o.touche.toLowerCase(), o.nom]));
  function choisir(o: NomOutil) { choixMur = null; effet(outils.choisir(o)); barreOutils(); panneaux() }
  function barreOutils() {
    nav.innerHTML = OUTILS.map(o => `<button data-o="${o.nom}" class="${outils.outil === o.nom ? 'actif' : ''}" title="${o.libelle} (${o.touche})">${o.icone}<small>${o.touche}</small></button>`).join('');
    nav.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.onclick = () => choisir(b.dataset['o'] as NomOutil));
    $<HTMLElement>('.aide').textContent = choixMur ? choixMur.libelle : outils.aide;
  }
  function basculerGrille() { outils.reglages.grille = outils.reglages.grille ? 0 : 100; toast(outils.reglages.grille ? 'Grille d’accrochage : 10 cm' : 'Grille d’accrochage coupée'); panneaux() }
  function cadrerTout() {
    const pts: Point[] = [];
    for (const w of mursDroits(niveau())) pts.push(w.axis.a, w.axis.b);
    if (pts.length) cam = cadrer(cam, boiteAnneau(pts));
    dessinerBientot();
  }

  /* ---------- en-tête ---------- */
  const nom = $<HTMLInputElement>('input.nom');
  nom.onchange = () => { if (!faire('Renommer le projet', [{ type: 'renommerProjet', nom: nom.value }])) nom.value = h.projet.name };
  $<HTMLButtonElement>('.annuler').onclick = annuler;
  $<HTMLButtonElement>('.retablir').onclick = retablir;
  $<HTMLButtonElement>('.cmdk').onclick = () => palette();
  const selNiv = $<HTMLSelectElement>('select.niveaux');
  selNiv.onchange = () => { niveauId = selNiv.value; selection = null; apres() };

  /* ---------- panneaux ---------- */
  function panneaux() {
    if (document.activeElement !== nom) nom.value = h.projet.name;
    selNiv.innerHTML = niveaux().map(f => `<option value="${f.id}" ${f.id === niveauId ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
    $<HTMLButtonElement>('.annuler').disabled = !peutAnnuler(h);
    $<HTMLButtonElement>('.retablir').disabled = !peutRetablir(h);
    const f = niveau(), o = selection ? f.objects[selection] : undefined;
    aside.innerHTML = '';
    if (o) inspecteur(f, o); else panneauNiveau(f);
  }

  /** un champ de l'inspecteur */
  function champ(libelle: string, valeur: string | number, change: (v: string) => void, type = 'text', options?: Record<string, string>): HTMLElement {
    const l = document.createElement('label');
    l.innerHTML = `<span>${esc(libelle)}</span>`;
    let x: HTMLInputElement | HTMLSelectElement;
    if (options) {
      x = document.createElement('select');
      x.innerHTML = Object.entries(options).map(([k, v]) => `<option value="${k}" ${k === String(valeur) ? 'selected' : ''}>${esc(v)}</option>`).join('');
    } else { x = document.createElement('input'); x.type = type; x.value = String(valeur); if (type === 'number') x.step = 'any' }
    if (x instanceof HTMLInputElement && type === 'checkbox') { x.checked = !!valeur; x.onchange = () => change(x.checked ? '1' : '') }
    else x.onchange = () => change(x.value);
    l.appendChild(x);
    return l;
  }
  const titre = (t: string) => { const e = document.createElement('h3'); e.textContent = t; return e };
  const bloc = (html: string, cls = 'note') => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; return e };
  const bouton = (t: string, f: () => void, cls = '') => { const b = document.createElement('button'); b.textContent = t; b.className = cls; b.onclick = f; return b };
  const ligne = (...b: HTMLElement[]) => { const e = document.createElement('div'); e.className = 'ligne'; e.append(...b); return e };
  const mm = (v: string) => Math.round(Number(String(v).replace(',', '.')) * 1000);       // saisie en mètres → mm
  const ent = (v: string) => Number(String(v).replace(',', '.'));

  function provenance(o: BuildingObject): HTMLElement {
    const S = o.sourceRefs.slice(-3).reverse();
    return bloc('<b>Provenance</b><br>' + S.map(s => esc(s.label) + ' — ' + esc(s.by ?? '') + ' — ' + date(s.at)).join('<br>') + (o.sourceRefs.length > 3 ? '<br>…' : ''));
  }

  function inspecteur(f: Floor, o: BuildingObject) {
    const A = aside;
    const plan = planDuNiveau(f);
    switch (o.type) {
      case 'wall': {
        const w = o as MurDroit, L = distance(w.axis.a, w.axis.b);
        A.append(titre(ROLES[w.role]),
          champ('Longueur (m)', (L / 1000).toFixed(3), v => longueurMur(w, mm(v)), 'number'),
          champ('Épaisseur (cm)', w.thickness / 10, v => faire('Épaisseur', [{ type: 'modifierMur', id: w.id, epaisseur: ent(v) * 10 }]), 'number'),
          champ('Hauteur (m)', (w.height / 1000).toFixed(2), v => faire('Hauteur', [{ type: 'modifierMur', id: w.id, hauteur: mm(v) }]), 'number'),
          champ('Type', w.role, v => faire('Type de mur', [{ type: 'modifierMur', id: w.id, role: v as Wall['role'] }]), 'text', ROLES),
          champ('Tracé', w.justification, v => faire('Justification', [{ type: 'modifierMur', id: w.id, justification: v as Wall['justification'] }]), 'text', JUSTIFS));
        /* règle 5 : jamais « porteur » confirmé sans document */
        A.append(bloc('⚠️ Porteur : <b>' + (w.loadBearing.value ? 'oui' : 'non') + '</b> — à contrôler' + (w.loadBearing.missing ? ' (manque : ' + esc(w.loadBearing.missing) + ')' : ''), 'alerte'));
        A.append(titre('Contraintes'));
        const K = Object.values(f.objects).filter(x => x.type === 'constraint' && x.walls.includes(w.id));
        if (K.length) A.append(ligne(...K.map(k => {
          const c = document.createElement('span'); c.className = 'chip';
          c.textContent = CONTRAINTES[k.type === 'constraint' ? k.kind : ''] ?? '';
          c.appendChild(bouton('✕', () => faire('Retirer une contrainte', [{ type: 'supprimer', id: k.id }])));
          return c;
        })));
        const ct = (g: 'horizontal' | 'vertical' | 'length' | 'angle') => bouton(CONTRAINTES[g]!, () => faire('Contrainte : ' + CONTRAINTES[g], [{ type: 'ajouterContrainte', niveau: niveauId, genre: g, murs: [w.id] }]));
        const deux = (g: 'parallel' | 'perpendicular') => bouton(CONTRAINTES[g]! + ' à…', () => {
          choixMur = { libelle: 'Cliquez le mur auquel « ' + CONTRAINTES[g] + ' » se rapporte (Échap pour renoncer)', faire: id => faire('Contrainte : ' + CONTRAINTES[g], [{ type: 'ajouterContrainte', niveau: niveauId, genre: g, murs: [id, w.id] }]) };
          barreOutils();
        });
        A.append(ligne(ct('horizontal'), ct('vertical'), ct('length'), ct('angle'), deux('parallel'), deux('perpendicular')));
        A.append(titre('Objet'), provenance(w), ligne(bouton('Supprimer', () => supprimer(w.id), 'dang')));
        break;
      }
      case 'opening': {
        const op = o as Opening, b = plan.baies.find(x => x.id === op.id);
        const genres = Object.fromEntries(Object.entries(OUVERTURES).map(([k, v]) => [k, v.libelle]));
        const mod = (t: string, c: Partial<Extract<Commande, { type: 'modifierOuverture' }>>) => faire(t, [{ type: 'modifierOuverture', id: op.id, ...c }]);
        A.append(titre(OUVERTURES[op.kind].libelle),
          champ('Genre', op.kind, v => mod('Genre', { genre: v as Opening['kind'] }), 'text', genres),
          champ('Largeur (m)', (op.width / 1000).toFixed(3), v => mod('Largeur', { largeur: mm(v) }), 'number'),
          champ('Hauteur (m)', (op.height / 1000).toFixed(3), v => mod('Hauteur', { hauteur: mm(v) }), 'number'),
          champ('Allège (m)', (op.sill / 1000).toFixed(3), v => mod('Allège', { allege: mm(v) }), 'number'),
          champ('Axe depuis l’origine du mur (m)', (op.offset / 1000).toFixed(3), v => mod('Position', { position: mm(v) }), 'number'));
        if (op.kind === 'door' || op.kind === 'french_window') {
          const s = op.swing ?? { side: 'left', inward: true };
          A.append(ligne(bouton('Charnière ⇄', () => mod('Sens', { sens: { ...s, side: s.side === 'left' ? 'right' : 'left' } })), bouton('Tirant / poussant ⇅', () => mod('Sens', { sens: { ...s, inward: !s.inward } }))));
        }
        if (b) A.append(bloc('Tableau : ' + m2(b.surface) + '<br>Entre : ' + esc(b.cotes[0]) + ' / ' + esc(b.cotes[1]) + (b.exterieure ? '<br><b>Baie extérieure</b>' : '')));
        A.append(titre('Objet'), provenance(op), ligne(bouton('Supprimer', () => supprimer(op.id), 'dang')));
        break;
      }
      case 'room': {
        const z = plan.zones.find(z => z.piece?.id === o.id);
        A.append(titre('Pièce'),
          champ('Nom', o.name, v => faire('Nom de pièce', [{ type: 'modifierPiece', id: o.id, nom: v }])),
          champ('Usage', o.usage, v => faire('Usage', [{ type: 'modifierPiece', id: o.id, usage: v as RoomUsage }]), 'text', USAGES),
          champ('Pièce humide', o.wet ? 1 : 0, v => faire('Pièce humide', [{ type: 'modifierPiece', id: o.id, humide: !!v }]), 'checkbox'),
          bloc(z ? 'Surface entre murs : <b>' + m2(z.aire) + '</b><br>Périmètre : ' + m(z.perimetre) + '<br><span class="note">Surface intérieure brute — pas encore une surface réglementaire (Phase 7).</span>' : 'Pièce non fermée : son point n’est dans aucun espace clos.', z ? 'note' : 'alerte'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'dimension': {
        const d = dessinCote(f, o);
        A.append(titre(o.driving ? 'Cote motrice' : 'Cote'),
          champ('Valeur (m)', d ? (d.valeur / 1000).toFixed(3) : '', v => faire('Cote', [{ type: 'modifierCote', id: o.id, valeur: mm(v), motrice: true }]), 'number'),
          champ('Motrice (pilote les murs)', o.driving ? 1 : 0, v => faire(v ? 'Cote motrice' : 'Cote libre', [{ type: 'modifierCote', id: o.id, motrice: !!v }]), 'checkbox'),
          champ('Décalage (m)', (o.offset / 1000).toFixed(2), v => faire('Décalage de cote', [{ type: 'modifierCote', id: o.id, decalage: mm(v) }]), 'number'),
          bloc(o.driving ? 'Modifier la valeur déplace le second mur coté ; la cote reste vraie ensuite.' : 'Saisir une valeur rend la cote motrice.'),
          titre('Objet'), provenance(o), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'underlay': {
        A.append(titre('Fond calé'), bloc(esc(o.name ?? 'Fond') + (o.page ? ' — page ' + o.page : '') + '<br>Échelle : ' + o.transform.scale.toPrecision(4) + ' mm par unité'),
          champ('Opacité', Math.round(o.opacity * 100), v => faire('Opacité du fond', [{ type: 'modifierFond', id: o.id, opacite: ent(v) / 100 }]), 'range'),
          champ('Verrouillé', o.locked ? 1 : 0, v => faire(v ? 'Verrouiller le fond' : 'Déverrouiller le fond', [{ type: 'modifierFond', id: o.id, verrouille: !!v }]), 'checkbox'),
          ligne(bouton('Caler par deux points…', () => { if (o.locked) toast('Déverrouillez le fond pour le caler', true); else { effet(outils.choisir('caler')); barreOutils() } })),
          bloc('Cliquez deux points du fond dont vous connaissez la distance (une cote du plan), puis saisissez-la.'),
          titre('Objet'), provenance(o), ligne(bouton('Retirer le fond', () => supprimer(o.id), 'dang')));
        break;
      }
      case 'constraint':
        A.append(titre('Contrainte'), bloc(CONTRAINTES[o.kind] ?? o.kind), ligne(bouton('Supprimer', () => supprimer(o.id), 'dang')));
        break;
    }
  }

  function panneauNiveau(f: Floor) {
    const A = aside, plan = planDuNiveau(f);
    A.append(titre('Niveaux'));
    for (const n of niveaux()) {
      const e = document.createElement('div');
      e.className = 'niv' + (n.id === niveauId ? ' actif' : '');
      e.innerHTML = `<span style="flex:1">${esc(n.name)}</span><span class="note">${(n.elevation / 1000).toFixed(2).replace('.', ',')} m</span>`;
      e.onclick = () => { niveauId = n.id; selection = null; apres() };
      A.append(e);
    }
    A.append(champ('Nom', f.name, v => faire('Nom du niveau', [{ type: 'modifierNiveau', id: f.id, nom: v }])),
      champ('Altitude du sol (m)', (f.elevation / 1000).toFixed(2), v => faire('Altitude', [{ type: 'modifierNiveau', id: f.id, altitude: mm(v) }]), 'number'),
      champ('Hauteur sous plafond (m)', (f.height / 1000).toFixed(2), v => faire('Hauteur', [{ type: 'modifierNiveau', id: f.id, hauteur: mm(v) }]), 'number'),
      ligne(bouton('+ Niveau', ajouterNiveau), bouton('Supprimer ce niveau', () => {
        if (confirm('Supprimer le niveau « ' + f.name + ' » et tout ce qu’il contient ? (Annuler le rétablit.)')) faire('Supprimer un niveau', [{ type: 'supprimerNiveau', id: f.id }]);
      }, 'dang')));

    A.append(titre('Fonds (plan PDF, image)'));
    for (const u of Object.values(f.objects)) if (u.type === 'underlay') {
      const e = document.createElement('div'); e.className = 'niv';
      e.innerHTML = `<span style="flex:1">${esc(u.name ?? 'Fond')}</span><span class="note">${u.locked ? '🔒' : 'à caler'}</span>`;
      e.onclick = () => { selection = u.id; panneaux(); dessinerBientot() };
      A.append(e);
    }
    A.append(ligne(bouton('Importer un fond…', importerFond)));

    A.append(titre('Contrôle'));
    if (plan.alertes.length) for (const a of plan.alertes) A.append(bloc('⚠️ ' + esc(a.message), 'alerte'));
    else A.append(bloc(mursDroits(f).length ? '✓ Aucune alerte sur ce niveau' : 'Aucun mur : choisissez l’outil Mur (M) pour commencer.', 'ok'));

    const pieces = plan.zones.filter(z => z.piece);
    A.append(titre('Surfaces (entre murs)'));
    if (plan.zones.length) {
      const t = document.createElement('table');
      t.innerHTML = plan.zones.map(z => `<tr><td>${esc(z.piece ? z.piece.name : 'À nommer')}</td><td>${m2(z.aire)}</td></tr>`).join('')
        + `<tr><td><b>Total</b> (${pieces.length} pièce${pieces.length > 1 ? 's' : ''})</td><td><b>${m2(plan.zones.reduce((s, z) => s + z.aire, 0))}</b></td></tr>`;
      A.append(t, bloc('Surfaces intérieures brutes, mesurées entre les faces des murs : ni surface habitable ni surface de plancher (Phase 7).'));
    } else A.append(bloc('Aucun espace clos.'));
    if (plan.baies.length) A.append(titre('Baies'), bloc(plan.baies.length + ' ouverture(s), dont ' + plan.baies.filter(b => b.exterieure).length + ' extérieure(s) — ' + m2(plan.baies.filter(b => b.exterieure).reduce((s, b) => s + b.surface, 0)) + ' de baies extérieures'));

    A.append(titre('Réglages'),
      champ('Épaisseur des murs (cm)', outils.reglages.epaisseurMur / 10, v => { outils.reglages.epaisseurMur = ent(v) * 10 }, 'number'),
      champ('Épaisseur des cloisons (cm)', outils.reglages.epaisseurCloison / 10, v => { outils.reglages.epaisseurCloison = ent(v) * 10 }, 'number'),
      champ('Ouverture posée', outils.reglages.genreOuverture, v => { outils.reglages.genreOuverture = v as Opening['kind'] }, 'text', Object.fromEntries(Object.entries(OUVERTURES).map(([k, v]) => [k, v.libelle]))),
      champ('Grille d’accrochage', String(outils.reglages.grille), v => { outils.reglages.grille = Number(v) }, 'text', { '0': 'Sans', '10': '1 cm', '50': '5 cm', '100': '10 cm', '500': '50 cm' }),
      bloc('Alt : sans accrochage · Maj : angles à 45° · Espace + glisser : déplacer la vue · F : tout voir · Ctrl+K : toutes les actions'));
    A.append(titre('Enregistrement'), bloc(esc(enr.raison) + (enr.mode === 'serveur' ? '' : '<br>Le travail reste dans ce navigateur, sur cet appareil.')));
  }

  /* ---------- actions ---------- */
  function supprimer(id: string) { if (faire('Supprimer', [{ type: 'supprimer', id }])) selection = null; panneaux() }
  function longueurMur(w: MurDroit, L: Mm) {
    if (!(L > 0)) return toast('Longueur invalide', true);
    const k = Object.values(niveau().objects).find(x => x.type === 'constraint' && x.kind === 'length' && x.walls[0] === w.id);
    if (k) { faire('Longueur', [{ type: 'modifierContrainte', id: k.id, valeur: L }]); return }
    const u = normaliser(soustraire(w.axis.b, w.axis.a));
    faire('Longueur', [{ type: 'deplacerSommet', niveau: niveauId, de: w.axis.b, vers: { x: w.axis.a.x + u.x * L, y: w.axis.a.y + u.y * L } }]);
  }
  async function ajouterNiveau() {
    const L = niveaux(), haut = L[L.length - 1]!;
    const r = await dialogue('Ajouter un niveau', [
      { cle: 'nom', libelle: 'Nom', valeur: L.length === 1 ? 'Étage' : 'Niveau ' + (L.length) },
      { cle: 'alt', libelle: 'Altitude du sol fini (m)', valeur: ((haut.elevation + haut.height + 250) / 1000).toFixed(2) },
      { cle: 'h', libelle: 'Hauteur sous plafond (m)', valeur: '2,50' }]);
    if (!r) return;
    const avant = new Set(h.projet.buildings[0]!.floors.map(f => f.id));
    if (faire('Ajouter un niveau', [{ type: 'ajouterNiveau', batiment: h.projet.buildings[0]!.id, nom: r['nom']!, altitude: mm(r['alt']!), hauteur: mm(r['h']!) }])) {
      niveauId = h.projet.buildings[0]!.floors.find(f => !avant.has(f.id))!.id; selection = null; apres();
    }
  }
  function importerFond() {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/pdf,image/*';
    i.onchange = async () => {
      const f = i.files?.[0];
      if (!f) return;
      try {
        const pages = await nombrePages(f);
        let page = 1;
        if (pages > 1) {
          const r = await dialogue('Page du PDF', [{ cle: 'p', libelle: 'Page à utiliser (1 à ' + pages + ')', valeur: '1' }]);
          if (!r) return;
          page = Math.min(pages, Math.max(1, Math.round(ent(r['p']!)) || 1));
        }
        const { cle, partage, erreur } = await importerFichier(f, undefined, enr.fonds);
        const avant = new Set(Object.keys(niveau().objects));
        if (faire('Importer un fond', [{ type: 'ajouterFond', niveau: niveauId, fichier: cle, nom: f.name, page }])) {
          selection = Object.keys(niveau().objects).find(k => !avant.has(k)) ?? null;
          panneaux();
          toast(partage === 'serveur' ? 'Fond importé et partagé : calez-le par deux points de distance connue (bouton « Caler »), puis verrouillez-le.'
            : 'Fond importé, gardé sur cet appareil seulement' + (erreur ? ' (partage impossible : ' + erreur + ' — l’espace « designer-fonds » est créé par supabase/designer/schema.sql)' : '') + '. Calez-le par deux points, puis verrouillez-le.', !!erreur);
        }
      } catch (e) { toast('Import impossible : ' + String((e as Error)?.message ?? e), true) }
    };
    i.click();
  }
  async function nommerPiece(niv: string, point: Point) {
    const r = await dialogue('Nommer la pièce', [{ cle: 'nom', libelle: 'Nom', valeur: '' }, { cle: 'usage', libelle: 'Usage', valeur: 'living', options: USAGES }]);
    if (r && r['nom']!.trim()) faire('Pièce ' + r['nom'], [{ type: 'creerPiece', niveau: niv, point, nom: r['nom']!, usage: r['usage'] as RoomUsage }]);
  }
  async function calerParDistance(id: string, image: [Point, Point]) {
    const r = await dialogue('Caler le fond', [{ cle: 'd', libelle: 'Distance réelle entre les deux points (m)', valeur: '' }]);
    choisir('selection'); selection = id;
    if (!r) return;
    if (faire('Caler le fond', [{ type: 'calerFond', id, image, distance: mm(r['d']!) }])) toast('Fond calé. Vérifiez une autre cote du plan, puis verrouillez-le.');
  }

  /* ---------- dialogues, palette, messages ---------- */
  function dialogue(t: string, champs: { cle: string; libelle: string; valeur: string; options?: Record<string, string> }[]): Promise<Record<string, string> | null> {
    return new Promise(res => {
      const v = document.createElement('div'); v.className = 'voile';
      v.innerHTML = `<form class="boite"><h2>${esc(t)}</h2>${champs.map(c => `<label>${esc(c.libelle)}${c.options
        ? `<select name="${c.cle}">${Object.entries(c.options).map(([k, l]) => `<option value="${k}" ${k === c.valeur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
        : `<input name="${c.cle}" value="${esc(c.valeur)}" autocomplete="off">`}</label>`).join('')}
        <div class="pied"><button type="button" class="non">Annuler</button><button class="prim">Valider</button></div></form>`;
      const fin = (r: Record<string, string> | null) => { v.remove(); res(r) };
      v.querySelector('form')!.onsubmit = e => { e.preventDefault(); const d = new FormData(e.target as HTMLFormElement); fin(Object.fromEntries(champs.map(c => [c.cle, String(d.get(c.cle) ?? '')]))) };
      v.querySelector<HTMLButtonElement>('.non')!.onclick = () => fin(null);
      v.onkeydown = e => { if (e.key === 'Escape') fin(null) };
      racine.querySelector('.cpd')!.appendChild(v);
      v.querySelector<HTMLInputElement>('input,select')?.focus();
    });
  }
  let minuterie = 0;
  function toast(t: string, erreur = false) {
    racine.querySelector('.toast')?.remove();
    const e = document.createElement('div'); e.className = 'toast' + (erreur ? ' err' : ''); e.textContent = t;
    main.appendChild(e);
    clearTimeout(minuterie); minuterie = window.setTimeout(() => e.remove(), erreur ? 6000 : 3000);
  }
  function exporter() {
    const b = new Blob([canonique(h.projet)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = (h.projet.name || 'projet') + '.cpdesigner.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const ACTIONS: Action[] = [
    ...OUTILS.map(o => ({ libelle: 'Outil : ' + o.libelle, touche: o.touche, faire: () => choisir(o.nom) })),
    { libelle: 'Annuler', touche: 'Ctrl+Z', faire: annuler }, { libelle: 'Rétablir', touche: 'Ctrl+Maj+Z', faire: retablir },
    { libelle: 'Tout voir', touche: 'F', faire: cadrerTout }, { libelle: 'Grille d’accrochage oui / non', touche: 'G', faire: basculerGrille },
    { libelle: 'Ajouter un niveau', faire: () => void ajouterNiveau() }, { libelle: 'Importer un fond (PDF, image)', faire: importerFond },
    ...(['door', 'window', 'french_window', 'garage_door'] as const).map(k => ({ libelle: 'Poser : ' + OUVERTURES[k].libelle, faire: () => { outils.reglages.genreOuverture = k; choisir('ouverture') } })),
    { libelle: 'Marquer un jalon (APS V1, PC…)', visible: () => !!enr.marquerJalon, faire: async () => { const r = await dialogue('Jalon', [{ cle: 'n', libelle: 'Nom du jalon', valeur: 'APS V1' }]); if (r && enr.marquerJalon) { await enr.marquerJalon(r['n']!); toast('Jalon « ' + r['n'] + ' » : il partira avec le prochain enregistrement') } } },
    { libelle: 'Exporter le projet (JSON)', faire: exporter },
    { libelle: 'Retour au suivi de chantiers', faire: () => { location.href = '../index.html' } },
  ];
  function palette() {
    if (racine.querySelector('.voile')) return;
    const v = document.createElement('div'); v.className = 'voile';
    v.innerHTML = `<div class="boite palette"><input placeholder="Que voulez-vous faire ?"><ul></ul></div>`;
    const inp = v.querySelector('input')!, ul = v.querySelector('ul')!;
    let k = 0, L: Action[] = [];
    const maj = () => {
      const q = inp.value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      L = ACTIONS.filter(a => (!a.visible || a.visible()) && a.libelle.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').includes(q));
      k = Math.min(k, Math.max(0, L.length - 1));
      ul.innerHTML = L.map((a, i) => `<li class="${i === k ? 'sel' : ''}" data-i="${i}"><span>${esc(a.libelle)}</span><kbd>${esc(a.touche ?? '')}</kbd></li>`).join('');
      ul.querySelectorAll('li').forEach(li => li.onclick = () => lancer(Number((li as HTMLElement).dataset['i'])));
    };
    const lancer = (i: number) => { const a = L[i]; v.remove(); a?.faire() };
    inp.oninput = () => { k = 0; maj() };
    inp.onkeydown = e => {
      if (e.key === 'ArrowDown') { k = Math.min(L.length - 1, k + 1); maj(); e.preventDefault() }
      else if (e.key === 'ArrowUp') { k = Math.max(0, k - 1); maj(); e.preventDefault() }
      else if (e.key === 'Enter') lancer(k);
      else if (e.key === 'Escape') v.remove();
    };
    v.onclick = e => { if (e.target === v) v.remove() };
    racine.querySelector('.cpd')!.appendChild(v);
    maj(); inp.focus();
  }

  /* ---------- départ ---------- */
  barreOutils(); panneaux();
  requestAnimationFrame(() => { cam = { ...cam, largeur: main.clientWidth, hauteur: main.clientHeight }; if (mursDroits(niveau()).length) cadrerTout(); else { cam = cadrer(cam, { xmin: 0, ymin: 0, xmax: 12_000, ymax: 10_000 }); dessinerBientot() } });
  /* pour les vérifications automatiques (tests dans Chromium) */
  (window as unknown as Record<string, unknown>)['cpDesigner'] = { projet: () => h.projet, niveau: () => niveauId, camera: () => cam, geometrieOuverture };
}

function distSeg(p: Point, w: MurDroit): number {
  const dx = w.axis.b.x - w.axis.a.x, dy = w.axis.b.y - w.axis.a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - w.axis.a.x) * dx + (p.y - w.axis.a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - w.axis.a.x - t * dx, p.y - w.axis.a.y - t * dy);
}
