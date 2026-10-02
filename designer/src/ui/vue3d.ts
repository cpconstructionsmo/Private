/* La vue 3D : la maquette (vue3d/maquette.ts) montrée par three.js. Elle
   ne calcule rien de métier : des prismes, des matières, une caméra qui
   tourne autour. three.js n'est chargé qu'à la première ouverture de la 3D
   (le plan 2D reste léger). Unités : le mètre (la maquette est en mm) ;
   axes : x vers l'est, y vers le haut, z vers le sud (le y du plan, inversé). */
import type { Maquette, Matiere, Plaque, Prisme } from '../vue3d/maquette';

export interface Vue3D {
  mettreAJour(m: Maquette): void;
  /** cadrer toute la maquette */
  cadrer(): void;
  /** couper les murs à cette altitude (mm), ou montrer tout (null) : la « vue maquette » */
  couper(z: number | null): void;
  /** une image PNG de la vue */
  image(): Promise<Blob>;
  stats(): { maillages: number; triangles: number };
  detruire(): void;
}

const COULEURS: Record<Matiere, { couleur: string; opacite?: number; rugosite?: number }> = {
  mur: { couleur: '#EFEBE4' }, cloison: { couleur: '#F7F5F1' }, plancher: { couleur: '#B5AFA4' }, sol: { couleur: '#D8C6A6' },
  vitrage: { couleur: '#8DB7CF', opacite: 0.35, rugosite: 0.1 }, porte: { couleur: '#7A5A3E', rugosite: 0.7 }, garage: { couleur: '#C3C8CC', rugosite: 0.6 },
  tuile: { couleur: '#A9533D', rugosite: 0.85 }, ardoise: { couleur: '#4A5560', rugosite: 0.6 }, zinc: { couleur: '#8E979E', rugosite: 0.4 },
  bac_acier: { couleur: '#5B6670', rugosite: 0.5 }, vegetalise: { couleur: '#6F8F55' }, gravillons: { couleur: '#B9B2A3' },
  meuble: { couleur: '#C9A57E', rugosite: 0.7 }, tissu: { couleur: '#8693A1' }, linge: { couleur: '#EEF0F2' }, plan_travail: { couleur: '#5A5F66', rugosite: 0.5 },
  sanitaire: { couleur: '#F6F8F9', rugosite: 0.25 }, electromenager: { couleur: '#D9DCDF', rugosite: 0.4 }, inox: { couleur: '#AEB4B9', rugosite: 0.3 },
};

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
  const aretes = new THREE.LineBasicMaterial({ color: '#2B3640', transparent: true, opacity: 0.35, clippingPlanes: [coupe] });

  const groupe = new THREE.Group();
  scene.add(groupe);
  let boite: Maquette['boite'] = null;

  const peindre = () => rendu.render(scene, camera);
  controles.addEventListener('change', peindre);

  function maillage(p: Prisme) {
    const forme = new THREE.Shape(p.contour.map(q => new THREE.Vector2(q.x / 1000, q.y / 1000)));
    for (const t of p.trous ?? []) forme.holes.push(new THREE.Path(t.map(q => new THREE.Vector2(q.x / 1000, q.y / 1000))));
    const g = new THREE.ExtrudeGeometry(forme, { depth: (p.z1 - p.z0) / 1000, bevelEnabled: false });
    const m = new THREE.Mesh(g, matieres[p.matiere]);
    /* le plan (x, y) se couche ; l'extrusion monte : (x, y, z) → (x, z, −y) */
    m.rotation.x = -Math.PI / 2; m.position.y = p.z0 / 1000;
    m.castShadow = p.matiere !== 'vitrage'; m.receiveShadow = true;
    if (p.objet) m.userData['objet'] = p.objet;
    groupe.add(m);
    if (p.matiere === 'mur' || p.matiere === 'cloison' || p.matiere === 'plancher') {
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
      if (boite) {
        /* le soleil au sud-ouest, haut : des ombres lisibles sur les façades sud */
        const c = new THREE.Vector3((boite.xmin + boite.xmax) / 2000, 0, -(boite.ymin + boite.ymax) / 2000);
        const R = Math.max(boite.xmax - boite.xmin, boite.ymax - boite.ymin, 5_000) / 1000;
        soleil.position.set(c.x - R, R * 1.6, c.z + R * 1.2); soleil.target.position.copy(c);
        const s = soleil.shadow.camera;
        s.left = -R * 1.5; s.right = R * 1.5; s.top = R * 1.5; s.bottom = -R * 1.5; s.near = 0.1; s.far = R * 6; s.updateProjectionMatrix();
      }
      if (premiere) vue.cadrer(); else peindre();
    },
    cadrer() {
      if (!boite) { camera.position.set(12, 10, 14); controles.target.set(0, 0, 0); controles.update(); peindre(); return }
      const c = new THREE.Vector3((boite.xmin + boite.xmax) / 2000, (boite.zmin + boite.zmax) / 2000, -(boite.ymin + boite.ymax) / 2000);
      const R = Math.max(boite.xmax - boite.xmin, boite.ymax - boite.ymin, boite.zmax - boite.zmin, 3_000) / 1000;
      camera.position.set(c.x - R * 0.9, c.y + R * 0.8, c.z + R * 1.1);
      controles.target.copy(c); controles.update(); peindre();
    },
    couper(z) { coupe.constant = z === null ? 1e6 : z / 1000; peindre() },
    image() { peindre(); return new Promise((res, rej) => rendu.domElement.toBlob(b => (b ? res(b) : rej(new Error('image vide'))), 'image/png')) },
    stats() { let t = 0, n = 0; groupe.traverse(o => { if (o instanceof THREE.Mesh) { n++; t += (o.geometry.index?.count ?? o.geometry.attributes['position']!.count) / 3 } }); return { maillages: n, triangles: Math.round(t) } },
    detruire() { observateur.disconnect(); controles.dispose(); vider(); rendu.dispose(); rendu.domElement.remove() },
  };
  taille();
  return vue;
}
