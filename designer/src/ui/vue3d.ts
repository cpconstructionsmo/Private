/* La vue 3D : la maquette (vue3d/maquette.ts) montrée par three.js. Elle
   ne calcule rien de métier : des prismes, des matières, une caméra qui
   tourne autour. three.js n'est chargé qu'à la première ouverture de la 3D
   (le plan 2D reste léger). Unités : le mètre (la maquette est en mm) ;
   axes : x vers l'est, y vers le haut, z vers le sud (le y du plan, inversé). */
import type { Maquette, Matiere, Plaque, Prisme } from '../vue3d/maquette';
import { materiau, type Materiau } from '../catalogue/materiaux';
import { avancer, depart, preparerVisite, regard, solSous, type Marcheur, type Terrain } from '../vue3d/visite';

export interface Vue3D {
  mettreAJour(m: Maquette): void;
  /** cadrer toute la maquette */
  cadrer(): void;
  /** couper les murs à cette altitude (mm), ou montrer tout (null) : la « vue maquette » */
  couper(z: number | null): void;
  /** une image PNG de la vue */
  image(): Promise<Blob>;
  stats(): { maillages: number; triangles: number };
  /** la visite à hauteur d'homme : glisser pour regarder, Z Q S D (ou W A S D) et flèches pour marcher, Maj pour presser le pas */
  visite(oui: boolean): void;
  enVisite(): boolean;
  marcheur(): Marcheur | null;
  detruire(): void;
}

/** allures de la visite (m/s) et vitesse de rotation aux flèches (rad/s) */
const MARCHE = 1.4, COURSE = 3.5, ROTATION = 1.6;

const COULEURS: Record<Matiere, { couleur: string; opacite?: number; rugosite?: number }> = {
  mur: { couleur: '#EFEBE4' }, cloison: { couleur: '#F7F5F1' }, plancher: { couleur: '#B5AFA4' }, sol: { couleur: '#D8C6A6' },
  vitrage: { couleur: '#8DB7CF', opacite: 0.35, rugosite: 0.1 }, porte: { couleur: '#7A5A3E', rugosite: 0.7 }, garage: { couleur: '#C3C8CC', rugosite: 0.6 },
  tuile: { couleur: '#A9533D', rugosite: 0.85 }, ardoise: { couleur: '#4A5560', rugosite: 0.6 }, zinc: { couleur: '#8E979E', rugosite: 0.4 },
  bac_acier: { couleur: '#5B6670', rugosite: 0.5 }, vegetalise: { couleur: '#6F8F55' }, gravillons: { couleur: '#B9B2A3' },
  meuble: { couleur: '#C9A57E', rugosite: 0.7 }, tissu: { couleur: '#8693A1' }, linge: { couleur: '#EEF0F2' }, plan_travail: { couleur: '#5A5F66', rugosite: 0.5 },
  sanitaire: { couleur: '#F6F8F9', rugosite: 0.25 }, parement: { couleur: '#EFEBE4' }, peinture: { couleur: '#F7F6F2' }, escalier: { couleur: '#B58B5E', rugosite: 0.7 }, electromenager: { couleur: '#D9DCDF', rugosite: 0.4 }, inox: { couleur: '#AEB4B9', rugosite: 0.3 },
};

/** le motif d'un matériau, peint sur une toile de 1 m × 1 m (répétée) : lames, briques, carreaux… ; null : uni */
function motif(m: Materiau): HTMLCanvasElement | null {
  if (m.motif === 'uni' || !m.pas || typeof document === 'undefined') return null;
  const T = 512, k = T / 1000, c = document.createElement('canvas'); c.width = c.height = T;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = m.couleur; g.fillRect(0, 0, T, T);
  g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 2;
  const p = m.pas * k, n = Math.ceil(T / p);
  const ligne = (x0: number, y0: number, x1: number, y1: number) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke() };
  switch (m.motif) {
    case 'lames_h': for (let i = 0; i <= n; i++) ligne(0, i * p, T, i * p); break;
    case 'lames_v': for (let i = 0; i <= n; i++) ligne(i * p, 0, i * p, T); break;
    case 'carreaux': for (let i = 0; i <= n; i++) { ligne(0, i * p, T, i * p); ligne(i * p, 0, i * p, T) } break;
    case 'briques': case 'pierres': case 'parquet': {
      /* rangs décalés d'une demi-longueur : briques (3 hauteurs de long), pierres (2), lames de parquet (6) */
      const L = p * (m.motif === 'briques' ? 3 : m.motif === 'pierres' ? 2 : 6);
      for (let i = 0; i <= n; i++) {
        ligne(0, i * p, T, i * p);
        for (let x = (i % 2) * L / 2; x <= T; x += L) ligne(x, i * p, x, (i + 1) * p);
      }
    }
  }
  return c;
}

/** la géométrie d'une plaque (pan de toit, pignon) : dessus, dessous et chants, en mètres, axes de la vue */
function geometriePlaque(THREE: typeof import('three'), p: Plaque) {
  const V = (q: { x: number; y: number; z: number }) => new THREE.Vector3(q.x / 1000, q.z / 1000, -q.y / 1000);
  const H = p.dessus.map(V), d = V(p.decalage), B = H.map(v => v.clone().add(d));
  /* la normale (méthode de Newell), puis la projection qui écrase le moins le polygone, pour le trianguler */
  const n = new THREE.Vector3();
  H.forEach((a, i) => { const b = H[(i + 1) % H.length]!; n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y) });
  const ax = Math.abs(n.x) >= Math.abs(n.y) && Math.abs(n.x) >= Math.abs(n.z) ? 'x' : Math.abs(n.y) >= Math.abs(n.z) ? 'y' : 'z';
  const deux = H.map(v => (ax === 'x' ? new THREE.Vector2(v.y, v.z) : ax === 'y' ? new THREE.Vector2(v.x, v.z) : new THREE.Vector2(v.x, v.y)));
  const tris = THREE.ShapeUtils.triangulateShape(deux, []);
  const pos: number[] = [];
  const tri = (a: InstanceType<typeof THREE.Vector3>, b: InstanceType<typeof THREE.Vector3>, c: InstanceType<typeof THREE.Vector3>) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (const [i, j, k] of tris) { tri(H[i!]!, H[j!]!, H[k!]!); tri(B[k!]!, B[j!]!, B[i!]!) }
  H.forEach((a, i) => { const b = H[(i + 1) % H.length]!, a2 = B[i]!, b2 = B[(i + 1) % H.length]!; tri(a, a2, b2); tri(a, b2, b) });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export async function creerVue3D(conteneur: HTMLElement): Promise<Vue3D> {
  const THREE = await import('three');
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');

  const rendu = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  rendu.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  rendu.shadowMap.enabled = true;
  rendu.shadowMap.type = THREE.PCFSoftShadowMap;
  rendu.localClippingEnabled = true;
  rendu.domElement.className = 'vue3d';
  conteneur.appendChild(rendu.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#E6EDF1');
  scene.add(new THREE.HemisphereLight('#FFFFFF', '#B9B4A8', 0.8));
  const soleil = new THREE.DirectionalLight('#FFFFFF', 2.4);         // assez fort pour que deux pans se distinguent
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(2048, 2048);
  soleil.shadow.bias = -0.0005;
  scene.add(soleil, soleil.target);
  const sol = new THREE.Mesh(new THREE.CircleGeometry(400, 64), new THREE.MeshStandardMaterial({ color: '#DCE3D3', roughness: 1 }));
  sol.rotation.x = -Math.PI / 2; sol.position.y = -0.03; sol.receiveShadow = true;
  scene.add(sol);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2_000);
  const controles = new OrbitControls(camera, rendu.domElement);
  controles.maxPolarAngle = Math.PI / 2 - 0.02;        // jamais sous le terrain

  const coupe = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
  const matieres = Object.fromEntries(Object.entries(COULEURS).map(([k, c]) => [k, new THREE.MeshStandardMaterial({
    color: c.couleur, roughness: c.rugosite ?? 0.9, metalness: 0, transparent: c.opacite !== undefined, opacity: c.opacite ?? 1,
    depthWrite: c.opacite === undefined, side: THREE.DoubleSide, clippingPlanes: [coupe],
  })])) as Record<Matiere, InstanceType<typeof THREE.MeshStandardMaterial>>;
  /* les matières des matériaux du catalogue (parements, sols), créées à la demande */
  const finitions = new Map<string, InstanceType<typeof THREE.MeshStandardMaterial>>();
  const matiereDe = (p: Prisme) => {
    const m = materiau(p.finition);
    if (!m) return matieres[p.matiere];
    let x = finitions.get(m.id);
    if (!x) {
      const toile = motif(m);
      const map = toile ? new THREE.CanvasTexture(toile) : null;
      if (map) { map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace }
      x = new THREE.MeshStandardMaterial({ color: map ? '#FFFFFF' : m.couleur, ...(map ? { map } : {}), roughness: 0.9, metalness: 0, side: THREE.DoubleSide, clippingPlanes: [coupe] });
      finitions.set(m.id, x);
    }
    return x;
  };
  const aretes = new THREE.LineBasicMaterial({ color: '#2B3640', transparent: true, opacity: 0.35, clippingPlanes: [coupe] });

  const groupe = new THREE.Group();
  scene.add(groupe);
  let boite: Maquette['boite'] = null;
  /* la visite : le terrain (sols, obstacles) déduit de la maquette, le marcheur, les touches tenues */
  let terrain: Terrain | null = null, marcheur: Marcheur | null = null, enVisite = false, boucle = 0, avant = 0, coupeAvant = 1e6;
  let orbite: { position: InstanceType<typeof THREE.Vector3>; cible: InstanceType<typeof THREE.Vector3> } | null = null;
  const tenues = new Set<string>();
  /* à l'intérieur, le soleil ne passe pas le toit : une lumière d'ambiance, et des plafonds blancs au haut des murs */
  const ambiance = new THREE.AmbientLight('#FFFFFF', 0);
  scene.add(ambiance);
  const plafonds = new THREE.Group(), blanc = new THREE.MeshStandardMaterial({ color: '#FAF8F4', roughness: 1, side: THREE.DoubleSide });
  scene.add(plafonds);
  let derniere: Maquette | null = null;
  /** un plafond par pièce du dernier niveau (sous un étage, le plancher du dessus en tient lieu) */
  function poserPlafonds() {
    for (const o of [...plafonds.children]) { plafonds.remove(o); if (o instanceof THREE.Mesh) o.geometry.dispose() }
    if (!enVisite || !derniere) return;
    const P = derniere.prismes;
    for (const s of P) {
      if (s.matiere !== 'sol') continue;
      const z = Math.max(...P.filter(m => m.niveau === s.niveau && m.matiere === 'mur').map(m => m.z1));
      if (!Number.isFinite(z) || P.some(m => m.matiere === 'plancher' && Math.abs(m.z0 - z) < 300)) continue;
      const forme = new THREE.Shape(s.contour.map(q => new THREE.Vector2(q.x / 1000, q.y / 1000)));
      for (const t of s.trous ?? []) forme.holes.push(new THREE.Path(t.map(q => new THREE.Vector2(q.x / 1000, q.y / 1000))));
      const m = new THREE.Mesh(new THREE.ShapeGeometry(forme), blanc);
      m.rotation.x = -Math.PI / 2; m.position.y = z / 1000 - 0.002;
      plafonds.add(m);
    }
  }

  const peindre = () => rendu.render(scene, camera);
  controles.addEventListener('change', peindre);

  function maillage(p: Prisme) {
    const forme = new THREE.Shape(p.contour.map(q => new THREE.Vector2(q.x / 1000, q.y / 1000)));
    for (const t of p.trous ?? []) forme.holes.push(new THREE.Path(t.map(q => new THREE.Vector2(q.x / 1000, q.y / 1000))));
    const g = new THREE.ExtrudeGeometry(forme, { depth: (p.z1 - p.z0) / 1000, bevelEnabled: false });
    const m = new THREE.Mesh(g, matiereDe(p));
    /* le plan (x, y) se couche ; l'extrusion monte : (x, y, z) → (x, z, −y) */
    m.rotation.x = -Math.PI / 2; m.position.y = p.z0 / 1000;
    m.castShadow = p.matiere !== 'vitrage'; m.receiveShadow = true;
    if (p.objet) m.userData['objet'] = p.objet;
    groupe.add(m);
    if (p.matiere === 'mur' || p.matiere === 'cloison' || p.matiere === 'plancher' || p.matiere === 'parement') {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), aretes);
      l.rotation.copy(m.rotation); l.position.copy(m.position);
      groupe.add(l);
    }
  }

  function plaque(p: Plaque) {
    const g = geometriePlaque(THREE, p);
    const m = new THREE.Mesh(g, matieres[p.matiere]);
    m.castShadow = true; m.receiveShadow = true;
    if (p.objet) m.userData['objet'] = p.objet;
    groupe.add(m);
    groupe.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), aretes));
  }

  function placerCamera() {
    if (!marcheur) return;
    const r = regard(marcheur);
    camera.position.set(r.oeil.x / 1000, r.oeil.z / 1000, -r.oeil.y / 1000);
    camera.lookAt(r.vise.x / 1000, r.vise.z / 1000, -r.vise.y / 1000);
    peindre();
  }
  /* chaque image : avancer selon les touches tenues (au clavier physique : Z Q S D d'un AZERTY = W A S D) */
  function animer(t: number) {
    if (!enVisite) return;
    const dt = Math.min(0.1, avant ? (t - avant) / 1000 : 0); avant = t;
    if (marcheur && terrain && dt > 0) {
      const k = (c: string) => (tenues.has(c) ? 1 : 0);
      const devant = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown'), cote = k('KeyD') - k('KeyA');
      const tourne = k('ArrowLeft') - k('ArrowRight');
      if (tourne) marcheur = { ...marcheur, cap: marcheur.cap + tourne * ROTATION * dt };
      if (devant || cote) {
        const v = (tenues.has('ShiftLeft') || tenues.has('ShiftRight') ? COURSE : MARCHE) * 1000 * dt / Math.hypot(devant, cote);
        const c = Math.cos(marcheur.cap), sn = Math.sin(marcheur.cap);
        marcheur = avancer(terrain, marcheur, (devant * c + cote * sn) * v, (devant * sn - cote * c) * v);
      }
      if (tourne || devant || cote) placerCamera();
    }
    boucle = requestAnimationFrame(animer);
  }
  const TOUCHES_VISITE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
  const enfoncee = (e: KeyboardEvent) => {
    if (!enVisite || !TOUCHES_VISITE.has(e.code) || (e.target as HTMLElement | null)?.closest?.('input, select, textarea')) return;
    tenues.add(e.code); e.preventDefault();
  };
  const relachee = (e: KeyboardEvent) => { tenues.delete(e.code) };
  const perdue = () => tenues.clear();
  window.addEventListener('keydown', enfoncee); window.addEventListener('keyup', relachee); window.addEventListener('blur', perdue);
  /* regarder : glisser la souris (sans capture du pointeur : rien à autoriser) */
  let glisse: { x: number; y: number } | null = null;
  rendu.domElement.addEventListener('pointerdown', e => { if (enVisite) { glisse = { x: e.clientX, y: e.clientY }; rendu.domElement.setPointerCapture(e.pointerId) } });
  rendu.domElement.addEventListener('pointermove', e => {
    if (!enVisite || !glisse || !marcheur) return;
    const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y; glisse = { x: e.clientX, y: e.clientY };
    marcheur = { ...marcheur, cap: marcheur.cap - dx * 0.004, tangage: Math.max(-1.1, Math.min(1.1, marcheur.tangage - dy * 0.004)) };
    placerCamera();
  });
  rendu.domElement.addEventListener('pointerup', () => { glisse = null });

  function vider() {
    for (const o of [...groupe.children]) {
      groupe.remove(o);
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
    }
  }

  function taille() {
    const l = conteneur.clientWidth || 800, h = conteneur.clientHeight || 600;
    rendu.setSize(l, h, false);
    rendu.domElement.style.width = '100%'; rendu.domElement.style.height = '100%';
    camera.aspect = l / h; camera.updateProjectionMatrix();
    peindre();
  }
  const observateur = new ResizeObserver(taille);
  observateur.observe(conteneur);

  const vue: Vue3D = {
    mettreAJour(m) {
      vider();
      for (const p of m.prismes) maillage(p);
      for (const p of m.plaques) plaque(p);
      const premiere = !boite;
      boite = m.boite;
      terrain = preparerVisite(m); derniere = m; poserPlafonds();
      /* en visite, le marcheur reste où il est ; ses pieds suivent le sol s'il a changé */
      if (enVisite && marcheur) { marcheur = { ...marcheur, pied: solSous(terrain, marcheur, marcheur.pied) }; placerCamera() }
      if (boite) {
        /* le soleil au sud-ouest, haut : des ombres lisibles sur les façades sud */
        const c = new THREE.Vector3((boite.xmin + boite.xmax) / 2000, 0, -(boite.ymin + boite.ymax) / 2000);
        const R = Math.max(boite.xmax - boite.xmin, boite.ymax - boite.ymin, 5_000) / 1000;
        soleil.position.set(c.x - R, R * 1.6, c.z + R * 1.2); soleil.target.position.copy(c);
        const s = soleil.shadow.camera;
        s.left = -R * 1.5; s.right = R * 1.5; s.top = R * 1.5; s.bottom = -R * 1.5; s.near = 0.1; s.far = R * 6; s.updateProjectionMatrix();
      }
      if (enVisite) return;
      if (premiere) vue.cadrer(); else peindre();
    },
    cadrer() {
      if (enVisite) { if (terrain) marcheur = depart(terrain); placerCamera(); return }
      if (!boite) { camera.position.set(12, 10, 14); controles.target.set(0, 0, 0); controles.update(); peindre(); return }
      const c = new THREE.Vector3((boite.xmin + boite.xmax) / 2000, (boite.zmin + boite.zmax) / 2000, -(boite.ymin + boite.ymax) / 2000);
      const R = Math.max(boite.xmax - boite.xmin, boite.ymax - boite.ymin, boite.zmax - boite.zmin, 3_000) / 1000;
      camera.position.set(c.x - R * 0.9, c.y + R * 0.8, c.z + R * 1.1);
      controles.target.copy(c); controles.update(); peindre();
    },
    couper(z) { const c = z === null ? 1e6 : z / 1000; if (enVisite) coupeAvant = c; else { coupe.constant = c; peindre() } },
    visite(oui) {
      if (oui === enVisite) return;
      enVisite = oui; tenues.clear(); controles.enabled = !oui;
      if (oui) {
        /* l'orbite est gardée pour le retour ; la vue maquette (murs coupés) n'a pas de sens à hauteur d'homme */
        orbite = { position: camera.position.clone(), cible: controles.target.clone() };
        coupeAvant = coupe.constant; coupe.constant = 1e6;
        camera.fov = 65; camera.updateProjectionMatrix();
        ambiance.intensity = 1.1; matieres.porte.visible = false; poserPlafonds();            // portes ouvertes : on les passe
        if (!marcheur && terrain) marcheur = depart(terrain);
        placerCamera();
        avant = 0; boucle = requestAnimationFrame(animer);
      } else {
        cancelAnimationFrame(boucle);
        coupe.constant = coupeAvant;
        camera.fov = 45; camera.updateProjectionMatrix();
        ambiance.intensity = 0; matieres.porte.visible = true; poserPlafonds();
        if (orbite) { camera.position.copy(orbite.position); controles.target.copy(orbite.cible); controles.update() }
        peindre();
      }
    },
    enVisite: () => enVisite,
    marcheur: () => (enVisite ? marcheur : null),
    image() { peindre(); return new Promise((res, rej) => rendu.domElement.toBlob(b => (b ? res(b) : rej(new Error('image vide'))), 'image/png')) },
    stats() { let t = 0, n = 0; groupe.traverse(o => { if (o instanceof THREE.Mesh) { n++; t += (o.geometry.index?.count ?? o.geometry.attributes['position']!.count) / 3 } }); return { maillages: n, triangles: Math.round(t) } },
    detruire() { enVisite = false; cancelAnimationFrame(boucle); window.removeEventListener('keydown', enfoncee); window.removeEventListener('keyup', relachee); window.removeEventListener('blur', perdue); observateur.disconnect(); controles.dispose(); vider(); rendu.dispose(); rendu.domElement.remove() },
  };
  taille();
  return vue;
}
