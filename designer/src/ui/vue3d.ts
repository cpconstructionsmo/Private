/* La vue 3D : la maquette (vue3d/maquette.ts) montrée par three.js. Elle
   ne calcule rien de métier : des prismes, des matières, une caméra qui
   tourne autour. three.js n'est chargé qu'à la première ouverture de la 3D
   (le plan 2D reste léger). Unités : le mètre (la maquette est en mm) ;
   axes : x vers l'est, y vers le haut, z vers le sud (le y du plan, inversé). */
import type { Maquette, Matiere, Plaque, Prisme } from '../vue3d/maquette';
import { materiau, type Materiau } from '../catalogue/materiaux';
import { teinteMenuiserie } from '../catalogue/menuiseries';
import { avancer, depart, preparerVisite, regard, solSous, type Marcheur, type Terrain } from '../vue3d/visite';
import { texture, type GenreTexture } from './textures';

export interface Vue3D {
  mettreAJour(m: Maquette): void;
  /** cadrer toute la maquette */
  cadrer(): void;
  /** couper les murs à cette altitude (mm), ou montrer tout (null) : la « vue maquette » */
  couper(z: number | null): void;
  /** une image PNG de la vue */
  image(): Promise<Blob>;
  /** la vue en JPEG, avec sa taille en pixels (pour le dossier PDF) */
  imageJpeg(): Promise<{ octets: Uint8Array; largeur: number; hauteur: number }>;
  /** une photographie du terrain derrière la maquette (insertion, PCMI 6), cadrée sans déformation ; null : la retirer.
      Le sol devient transparent : seules les ombres de la maison s'y posent */
  photo(image: ImageBitmap | HTMLImageElement | HTMLCanvasElement | null): void;
  /** le soleil venu de cette direction (repère du plan, vecteur vers le soleil : vue3d/soleil.ts) ; null : la position par
      défaut (au sud-est, assez bas). Sous l'horizon, il s'éteint : reste la lumière du ciel */
  soleil(direction: { x: number; y: number; z: number } | null): void;
  /** une image PNG plus grande que l'écran (pour le client) : la vue courante, recalculée à cette largeur (pixels) */
  imageHD(largeur: number): Promise<{ png: Blob; largeur: number; hauteur: number }>;
  /** le champ de vision vertical de la caméra (°), pour s'accorder à la focale de la photographie */
  focale(degres?: number): number;
  stats(): { maillages: number; triangles: number };
  /** le rendu : réaliste (textures, ciel, ombres d'angle) ou maquette (aplats et arêtes, plus léger) */
  rendu(mode?: 'realiste' | 'maquette'): 'realiste' | 'maquette';
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
  vitrage: { couleur: '#8DB7CF', opacite: 0.35, rugosite: 0.1 }, menuiserie: { couleur: '#F2F2EF', rugosite: 0.45 }, appui: { couleur: '#D8D2C5', rugosite: 0.8 }, porte: { couleur: '#7A5A3E', rugosite: 0.7 }, garage: { couleur: '#C3C8CC', rugosite: 0.6 },
  tuile: { couleur: '#A9533D', rugosite: 0.85 }, ardoise: { couleur: '#4A5560', rugosite: 0.6 }, zinc: { couleur: '#8E979E', rugosite: 0.4 },
  bac_acier: { couleur: '#5B6670', rugosite: 0.5 }, vegetalise: { couleur: '#6F8F55' }, gravillons: { couleur: '#B9B2A3' },
  meuble: { couleur: '#C9A57E', rugosite: 0.7 }, tissu: { couleur: '#8693A1' }, linge: { couleur: '#EEF0F2' }, plan_travail: { couleur: '#5A5F66', rugosite: 0.5 },
  sanitaire: { couleur: '#F6F8F9', rugosite: 0.25 }, parement: { couleur: '#EFEBE4' }, peinture: { couleur: '#F7F6F2' }, amenagement: { couleur: '#C9C3B6' }, cloture: { couleur: '#3E4247' }, tronc: { couleur: '#6B4E36', rugosite: 0.9 }, terrain: { couleur: '#6B8A47', rugosite: 1 }, feuillage: { couleur: '#5C8A4A', rugosite: 0.95 }, escalier: { couleur: '#B58B5E', rugosite: 0.7 }, electromenager: { couleur: '#D9DCDF', rugosite: 0.4 }, inox: { couleur: '#AEB4B9', rugosite: 0.3 },
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
  /* les coordonnées de texture, en mètres dans le plan de la plaque : u horizontal, v vers le haut de la pente
     (les rangs de tuiles courent le long de l'égout) ; une plaque horizontale prend x et z */
  const N = n.clone().normalize(), haut = new THREE.Vector3(0, 1, 0);
  const e1 = Math.abs(N.y) > 0.999 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3().crossVectors(haut, N).normalize();
  const e2 = new THREE.Vector3().crossVectors(N, e1).normalize();
  if (e2.y < 0) e2.negate();
  const pos: number[] = [], uv: number[] = [];
  const tri = (a: InstanceType<typeof THREE.Vector3>, b: InstanceType<typeof THREE.Vector3>, c: InstanceType<typeof THREE.Vector3>) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (const v of [a, b, c]) uv.push(v.dot(e1), v.dot(e2));
  };
  for (const [i, j, k] of tris) { tri(H[i!]!, H[j!]!, H[k!]!); tri(B[k!]!, B[j!]!, B[i!]!) }
  H.forEach((a, i) => { const b = H[(i + 1) % H.length]!, a2 = B[i]!, b2 = B[(i + 1) % H.length]!; tri(a, a2, b2); tri(a, b2, b) });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** les matières qui prennent une texture au rendu réaliste, et laquelle */
const TEXTURES: Partial<Record<Matiere, GenreTexture>> = {
  tuile: 'tuile', ardoise: 'ardoise', zinc: 'zinc', bac_acier: 'bac_acier', gravillons: 'gravier', mur: 'enduit', parement: 'enduit',
  plancher: 'beton', amenagement: 'beton', appui: 'beton', feuillage: 'feuillage', terrain: 'herbe', vegetalise: 'herbe', porte: 'bois', escalier: 'bois',
};

export async function creerVue3D(conteneur: HTMLElement): Promise<Vue3D> {
  const THREE = await import('three');
  const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');

  const { EffectComposer } = await import('three/examples/jsm/postprocessing/EffectComposer.js');
  const { RenderPass } = await import('three/examples/jsm/postprocessing/RenderPass.js');
  const { GTAOPass } = await import('three/examples/jsm/postprocessing/GTAOPass.js');
  const { OutputPass } = await import('three/examples/jsm/postprocessing/OutputPass.js');
  const { Sky } = await import('three/examples/jsm/objects/Sky.js');
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');

  const rendu = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  rendu.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  rendu.shadowMap.enabled = true;
  rendu.shadowMap.type = THREE.PCFSoftShadowMap;
  /* des tons de cinéma : les hautes lumières (ciel, enduit au soleil) ne « brûlent » pas */
  rendu.toneMapping = THREE.ACESFilmicToneMapping;
  rendu.toneMappingExposure = 0.82;
  rendu.localClippingEnabled = true;
  rendu.domElement.className = 'vue3d';
  conteneur.appendChild(rendu.domElement);

  const scene = new THREE.Scene();
  const FOND = '#E6EDF1';
  scene.background = new THREE.Color(FOND);
  const hemi = new THREE.HemisphereLight('#FFFFFF', '#B9B4A8', 0.8);
  scene.add(hemi);
  const soleil = new THREE.DirectionalLight('#FFFFFF', 2.4);         // assez fort pour que deux pans se distinguent
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(4096, 4096);
  soleil.shadow.bias = -0.0003; soleil.shadow.normalBias = 0.02; soleil.shadow.radius = 3;
  scene.add(soleil, soleil.target);
  /* le rendu réaliste : un environnement (reflets des vitrages, lumière d'ambiance), un ciel, une brume d'horizon */
  const pmrem = new THREE.PMREMGenerator(rendu);
  const environnement = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const ciel = new Sky();
  ciel.scale.setScalar(4_000);
  const u = ciel.material.uniforms as Record<string, { value: unknown }>;
  u['turbidity']!.value = 4; u['rayleigh']!.value = 1.2; u['mieCoefficient']!.value = 0.004; u['mieDirectionalG']!.value = 0.8;
  scene.add(ciel);
  const brume = new THREE.Fog('#DCE6EE', 120, 900);
  const solPlein = new THREE.MeshStandardMaterial({ color: '#DCE3D3', roughness: 1 }), solOmbre = new THREE.ShadowMaterial({ opacity: 0.28 });
  const sol = new THREE.Mesh<InstanceType<typeof THREE.CircleGeometry>, InstanceType<typeof THREE.Material>>(new THREE.CircleGeometry(400, 64), solPlein);
  sol.rotation.x = -Math.PI / 2; sol.position.y = -0.03; sol.receiveShadow = true;
  scene.add(sol);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 10_000);
  const controles = new OrbitControls(camera, rendu.domElement);
  controles.maxPolarAngle = Math.PI / 2 - 0.02;        // jamais sous le terrain

  const coupe = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
  const matieres = Object.fromEntries(Object.entries(COULEURS).map(([k, c]) => [k, new THREE.MeshStandardMaterial({
    color: c.couleur, roughness: c.rugosite ?? 0.9, metalness: 0, transparent: c.opacite !== undefined, opacity: c.opacite ?? 1,
    depthWrite: c.opacite === undefined, side: THREE.DoubleSide, clippingPlanes: [coupe],
  })])) as Record<Matiere, InstanceType<typeof THREE.MeshStandardMaterial>>;
  /* le rendu réaliste : les textures peintes (textures.ts), créées une fois, répétées au mètre */
  const anisotropie = rendu.capabilities.getMaxAnisotropy();
  const peinte = (genre: GenreTexture, base: string) => {
    const t = texture(genre, base);
    const carte = new THREE.CanvasTexture(t.couleur), relief = new THREE.CanvasTexture(t.relief);
    for (const x of [carte, relief]) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = anisotropie }
    carte.colorSpace = THREE.SRGBColorSpace;
    return { carte, relief };
  };
  const texturees = (Object.entries(TEXTURES) as [Matiere, GenreTexture][]).map(([k, genre]) => ({ m: matieres[k], couleur: COULEURS[k].couleur, ...peinte(genre, COULEURS[k].couleur) }));
  const herbe = peinte('herbe', '#5F7F3E');
  herbe.carte.repeat.set(400, 400); herbe.relief.repeat.set(400, 400);
  matieres.vitrage.metalness = 0.2; matieres.vitrage.roughness = 0.05; matieres.vitrage.opacity = 0.45;
  /** passer d'un rendu à l'autre : textures, ciel, brume, arêtes, lumières */
  function appliquerMode() {
    const R = mode === 'realiste';
    for (const t of texturees) { t.m.map = R ? t.carte : null; t.m.bumpMap = R ? t.relief : null; t.m.bumpScale = 1.5; t.m.color.set(R ? '#FFFFFF' : t.couleur); t.m.needsUpdate = true }
    solPlein.map = R ? herbe.carte : null; solPlein.bumpMap = R ? herbe.relief : null; solPlein.color.set(R ? '#FFFFFF' : '#DCE3D3'); solPlein.needsUpdate = true;
    scene.environment = R ? environnement : null; scene.environmentIntensity = 0.25;
    hemi.intensity = R ? 0.3 : 0.8; soleil.intensity = (R ? 3.4 : 2.4) * eclat;
    aretes.visible = !R;
    const photo = scene.background instanceof THREE.Texture;
    ciel.visible = R && !photo; scene.fog = R && !photo ? brume : null;
    if (!photo) scene.background = R ? null : new THREE.Color(FOND);
  }
  /* les matières des matériaux du catalogue (parements, sols), créées à la demande */
  const finitions = new Map<string, InstanceType<typeof THREE.MeshStandardMaterial>>();
  /* un grillage se voit au travers : une maille, pas un mur */
  const grillage = new THREE.MeshStandardMaterial({ color: '#3F6B4A', roughness: 0.8, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [coupe] });
  const matiereDe = (p: Prisme) => {
    if (p.matiere === 'cloture' && p.finition?.startsWith('grillage')) { grillage.color.set(materiau(p.finition)?.couleur ?? '#3F6B4A'); return grillage }
    /* une menuiserie, une porte à la teinte choisie au dossier (catalogue/menuiseries.ts) : une laque, sans motif */
    const tm = teinteMenuiserie(p.finition);
    if (tm) {
      let x = finitions.get(tm.id);
      if (!x) { x = new THREE.MeshStandardMaterial({ color: tm.couleur, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide, clippingPlanes: [coupe] }); finitions.set(tm.id, x) }
      return x;
    }
    const m = materiau(p.finition);
    if (!m) return matieres[p.matiere];
    let x = finitions.get(m.id);
    if (!x) {
      const toile = motif(m);
      const map = toile ? new THREE.CanvasTexture(toile) : null;
      if (map) { map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = anisotropie }
      /* un enduit uni prend du grain (et son relief) : il ne ressemble plus à du plastique */
      const grainEnduit = !map && m.motif === 'uni' ? peinte('enduit', m.couleur) : null;
      x = new THREE.MeshStandardMaterial({ color: map || grainEnduit ? '#FFFFFF' : m.couleur, ...(map ? { map } : grainEnduit ? { map: grainEnduit.carte, bumpMap: grainEnduit.relief, bumpScale: 1.5 } : {}),
        roughness: 0.9, metalness: 0, side: THREE.DoubleSide, clippingPlanes: [coupe] });
      finitions.set(m.id, x);
    }
    return x;
  };
  const aretes = new THREE.LineBasicMaterial({ color: '#2B3640', transparent: true, opacity: 0.35, clippingPlanes: [coupe] });

  const groupe = new THREE.Group();
  scene.add(groupe);
  let boite: Maquette['boite'] = null;
  /* la visite : le terrain (sols, obstacles) déduit de la maquette, le marcheur, les touches tenues */
  let terrain: Terrain | null = null, marcheur: Marcheur | null = null, enVisite = false, boucle = 0, avant = 0, coupeAvant = 1e6, fovOrbite = 45;
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

  /* le composeur : la scène, l'ombre des angles et des recoins (GTAO), puis les tons et l'espace de couleur */
  const cible = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composeur = new EffectComposer(rendu, cible);
  composeur.addPass(new RenderPass(scene, camera));
  const ombresAngles = new GTAOPass(scene, camera, 1, 1);
  ombresAngles.blendIntensity = 1;
  composeur.addPass(ombresAngles);
  composeur.addPass(new OutputPass());
  let mode: 'realiste' | 'maquette' = 'realiste';
  const peindre = () => {
    /* l'ombre des angles ne connaît pas la coupe de la vue maquette : elle se tait quand les murs sont coupés */
    ombresAngles.enabled = mode === 'realiste' && coupe.constant > 1e5;
    composeur.render();
  };
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
    const m = new THREE.Mesh(g, p.finition ? matiereDe({ contour: [], z0: 0, z1: 0, niveau: '', matiere: p.matiere, finition: p.finition }) : matieres[p.matiere]);
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

  /* la photographie du terrain (insertion) : en fond, « couvrante » (rognée, jamais étirée) */
  let fond: InstanceType<typeof THREE.Texture> | null = null, fondTaille = { l: 1, h: 1 };
  function cadrerFond() {
    if (!fond) return;
    const a = camera.aspect, b = fondTaille.l / fondTaille.h;
    if (b > a) { fond.repeat.set(a / b, 1); fond.offset.set((1 - a / b) / 2, 0) } else { fond.repeat.set(1, b / a); fond.offset.set(0, (1 - b / a) / 2) }
  }

  function taille() {
    const l = conteneur.clientWidth || 800, h = conteneur.clientHeight || 600;
    rendu.setSize(l, h, false);
    composeur.setSize(l, h); ombresAngles.setSize(l * rendu.getPixelRatio(), h * rendu.getPixelRatio());
    rendu.domElement.style.width = '100%'; rendu.domElement.style.height = '100%';
    camera.aspect = l / h; camera.updateProjectionMatrix();
    cadrerFond();
    peindre();
  }
  /* le soleil : par défaut au sud-est, assez bas — la vue de départ (depuis le sud-ouest) voit les façades sud éclairées
     et l'ombre portée de la maison s'allonger sur l'herbe, à gauche ; ou venu de la direction donnée (date, heure, nord) */
  let astre: { x: number; y: number; z: number } | null = null, eclat = 1;
  function placerSoleil() {
    if (!boite) return;
    const c = new THREE.Vector3((boite.xmin + boite.xmax) / 2000, 0, -(boite.ymin + boite.ymax) / 2000);
    const R = Math.max(boite.xmax - boite.xmin, boite.ymax - boite.ymin, 5_000) / 1000;
    /* repère de la scène : x à droite du plan, y vers le haut, z vers le bas du plan */
    const d = astre ? new THREE.Vector3(astre.x, Math.max(astre.z, 0.02), -astre.y).normalize().multiplyScalar(R * 1.9) : new THREE.Vector3(R * 1.1, R * 1.25, R * 0.9);
    soleil.position.copy(c).add(d); soleil.target.position.copy(c);
    (u['sunPosition']!.value as InstanceType<typeof THREE.Vector3>).copy(d.clone().normalize());
    const s = soleil.shadow.camera;
    s.left = -R * 2; s.right = R * 2; s.top = R * 2; s.bottom = -R * 2; s.near = 0.1; s.far = R * 8; s.updateProjectionMatrix();
    /* sous l'horizon, la nuit tombe : le soleil s'éteint ; au ras de l'horizon, il faiblit */
    eclat = astre ? Math.max(0, Math.min(1, astre.z / 0.12)) : 1;
    soleil.intensity = (mode === 'realiste' ? 3.4 : 2.4) * eclat;
    /* un soleil bas est plus chaud (matin, soir) : du blanc à midi vers l'orangé près de l'horizon */
    soleil.color.set('#FFFFFF');
    if (astre) soleil.color.lerp(new THREE.Color('#FFB46E'), Math.max(0, Math.min(1, 1 - astre.z / 0.45)) * 0.75);
  }
  const observateur = new ResizeObserver(taille);
  observateur.observe(conteneur);

  const vue: Vue3D = {
    mettreAJour(m) {
      vider();
      for (const p of m.prismes) maillage(p);
      for (const p of m.plaques) plaque(p);
      /* le relief du terrain : une nappe d'herbe ; le sol plat descend sous son point le plus bas */
      if (m.relief) {
        const T = m.relief.triangles, pos: number[] = [];
        const uv: number[] = [];
        for (let i = 0; i < T.length; i += 3) { pos.push(T[i]! / 1000, T[i + 2]! / 1000, -T[i + 1]! / 1000); uv.push(T[i]! / 1000, T[i + 1]! / 1000) }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));          // l'herbe, au mètre
        g.computeVertexNormals();
        const r = new THREE.Mesh(g, matieres.terrain);
        r.receiveShadow = true;
        groupe.add(r);
      }
      sol.position.y = m.relief ? Math.min(-0.03, m.relief.zmin / 1000 - 0.05) : -0.03;
      const premiere = !boite;
      boite = m.boite;
      terrain = preparerVisite(m); derniere = m; poserPlafonds();
      /* en visite, le marcheur reste où il est ; ses pieds suivent le sol s'il a changé */
      if (enVisite && marcheur) { marcheur = { ...marcheur, pied: solSous(terrain, marcheur, marcheur.pied) }; placerCamera() }
      placerSoleil();
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
        fovOrbite = camera.fov; camera.fov = 65; camera.updateProjectionMatrix();
        ambiance.intensity = 1.1; matieres.porte.visible = false; poserPlafonds();            // portes ouvertes : on les passe
        if (!marcheur && terrain) marcheur = depart(terrain);
        placerCamera();
        avant = 0; boucle = requestAnimationFrame(animer);
      } else {
        cancelAnimationFrame(boucle);
        coupe.constant = coupeAvant;
        camera.fov = fovOrbite; camera.updateProjectionMatrix();
        ambiance.intensity = 0; matieres.porte.visible = true; poserPlafonds();
        if (orbite) { camera.position.copy(orbite.position); controles.target.copy(orbite.cible); controles.update() }
        peindre();
      }
    },
    enVisite: () => enVisite,
    marcheur: () => (enVisite ? marcheur : null),
    image() { peindre(); return new Promise((res, rej) => rendu.domElement.toBlob(b => (b ? res(b) : rej(new Error('image vide'))), 'image/png')) },
    soleil(direction) {
      if (direction === astre || (direction && astre && direction.x === astre.x && direction.y === astre.y && direction.z === astre.z)) return;
      astre = direction; placerSoleil(); peindre();
    },
    async imageHD(largeur) {
      /* la vue recalculée plus grande, le même cadrage (même rapport), puis l'écran rendu à sa taille */
      const l0 = conteneur.clientWidth || 800, h0 = conteneur.clientHeight || 600, k = Math.max(1, Math.min(4_096, Math.round(largeur)) / l0);
      const ratio = rendu.getPixelRatio();
      rendu.setPixelRatio(1); rendu.setSize(Math.round(l0 * k), Math.round(h0 * k), false); composeur.setPixelRatio(1); composeur.setSize(Math.round(l0 * k), Math.round(h0 * k));
      ombresAngles.setSize(Math.round(l0 * k), Math.round(h0 * k));
      try {
        peindre();
        const c = rendu.domElement, png = await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('image vide'))), 'image/png'));
        return { png, largeur: c.width, hauteur: c.height };
      } finally { rendu.setPixelRatio(ratio); composeur.setPixelRatio(ratio); taille() }
    },
    imageJpeg() {
      peindre();
      const c = rendu.domElement;
      return new Promise((res, rej) => c.toBlob(b => { if (!b) { rej(new Error('image vide')); return } void b.arrayBuffer().then(a => res({ octets: new Uint8Array(a), largeur: c.width, hauteur: c.height })) }, 'image/jpeg', 0.92));
    },
    photo(image) {
      fond?.dispose(); fond = null;
      if (image) {
        /* recopiée sur une toile : WebGL ne retourne pas une ImageBitmap (flipY ignoré), la photo serait à l'envers */
        let toile = image as HTMLCanvasElement;
        if (!(image instanceof HTMLCanvasElement)) { toile = document.createElement('canvas'); toile.width = image.width; toile.height = image.height; toile.getContext('2d')?.drawImage(image, 0, 0) }
        fond = new THREE.CanvasTexture(toile);
        fond.colorSpace = THREE.SRGBColorSpace; fond.needsUpdate = true;
        fondTaille = { l: image.width, h: image.height };
        cadrerFond();
      }
      scene.background = fond ?? null;
      sol.material = fond ? solOmbre : solPlein;
      appliquerMode();
      peindre();
    },
    focale(degres) {
      if (degres !== undefined && Number.isFinite(degres) && !enVisite) { camera.fov = Math.min(90, Math.max(15, degres)); camera.updateProjectionMatrix(); peindre() }
      return camera.fov;
    },
    rendu(m) {
      if (m && m !== mode) { mode = m; appliquerMode(); peindre() }
      return mode;
    },
    stats() { let t = 0, n = 0; groupe.traverse(o => { if (o instanceof THREE.Mesh) { n++; t += (o.geometry.index?.count ?? o.geometry.attributes['position']!.count) / 3 } }); return { maillages: n, triangles: Math.round(t) } },
    detruire() { enVisite = false; cancelAnimationFrame(boucle); window.removeEventListener('keydown', enfoncee); window.removeEventListener('keyup', relachee); window.removeEventListener('blur', perdue); observateur.disconnect(); controles.dispose(); vider(); composeur.dispose(); cible.dispose(); pmrem.dispose(); environnement.dispose(); rendu.dispose(); rendu.domElement.remove() },
  };
  appliquerMode();
  taille();
  return vue;
}
