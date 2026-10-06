/* Les textures du rendu réaliste, peintes par le programme (aucune image
   dans le dépôt) : tuiles, ardoises, enduit, herbe, gravier, bois, béton,
   zinc. Chacune couvre 1 m × 1 m de la maquette (elle se répète) et rend
   aussi son relief (une carte de bosses en gris : clair = saillant).

   Le hasard est tiré d'une graine fixe : la même texture à chaque
   ouverture, la même image d'un export à l'autre. */

export type GenreTexture = 'tuile' | 'ardoise' | 'enduit' | 'herbe' | 'gravier' | 'bois' | 'beton' | 'zinc' | 'bac_acier' | 'feuillage';

export interface Texture { couleur: HTMLCanvasElement; relief: HTMLCanvasElement }

const T = 512;                                         // pixels pour 1 m

/** un tirage pseudo-aléatoire reproductible (mulberry32) */
function hasard(graine: number): () => number {
  let a = graine >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

const toile = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas'); c.width = c.height = T;
  return [c, c.getContext('2d')!];
};

/** une couleur « #RRGGBB » éclaircie (k > 0) ou assombrie (k < 0), de −1 à 1 */
function nuance(c: string, k: number): string {
  const v = parseInt(c.slice(1), 16), f = (x: number) => Math.round(Math.max(0, Math.min(255, k >= 0 ? x + (255 - x) * k : x * (1 + k))));
  return 'rgb(' + f(v >> 16) + ',' + f((v >> 8) & 255) + ',' + f(v & 255) + ')';
}

/** du grain : des points de nuance aléatoire, sur la couleur et sur le relief */
function grain(g: CanvasRenderingContext2D, r: CanvasRenderingContext2D | null, alea: () => number, n: number, taille: number, force: number, base: string): void {
  for (let i = 0; i < n; i++) {
    const x = alea() * T, y = alea() * T, k = (alea() - 0.5) * 2 * force, s = taille * (0.5 + alea());
    g.fillStyle = nuance(base, k); g.fillRect(x, y, s, s);
    if (r) { const v = Math.round(128 + k * 300); r.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; r.fillRect(x, y, s, s) }
  }
}

/** la texture d'un genre, teintée de « base » (la couleur de la matière) */
export function texture(genre: GenreTexture, base: string, graine = 7): Texture {
  const [c, g] = toile(), [rc, r] = toile(), alea = hasard(graine);
  g.fillStyle = base; g.fillRect(0, 0, T, T);
  r.fillStyle = '#808080'; r.fillRect(0, 0, T, T);
  switch (genre) {
    case 'tuile': {
      /* des tuiles de 20 cm de large en rangs de 25 cm ; chaque tuile bombée (ombre sur un bord), rangs décalés */
      const L = T / 5, H = T / 4;
      for (let j = 0; j < 4; j++) for (let i = -1; i < 6; i++) {
        const x = i * L + (j % 2) * L / 2, y = j * H, k = (alea() - 0.5) * 0.18;
        const d = g.createLinearGradient(x, 0, x + L, 0);
        d.addColorStop(0, nuance(base, k - 0.28)); d.addColorStop(0.45, nuance(base, k + 0.08)); d.addColorStop(1, nuance(base, k - 0.18));
        g.fillStyle = d; g.fillRect(x, y, L, H);
        const e = r.createLinearGradient(x, 0, x + L, 0);
        e.addColorStop(0, '#404040'); e.addColorStop(0.45, '#D0D0D0'); e.addColorStop(1, '#505050');
        r.fillStyle = e; r.fillRect(x, y, L, H);
        /* le recouvrement du rang du dessus : une ombre franche au bas de chaque rang */
        g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(x, y + H - 6, L, 6);
        r.fillStyle = '#202020'; r.fillRect(x, y + H - 6, L, 6);
      }
      grain(g, null, alea, 2500, 2, 0.08, base);
      break;
    }
    case 'ardoise': {
      const L = T / 4, H = T / 6;
      for (let j = 0; j < 6; j++) for (let i = -1; i < 5; i++) {
        const x = i * L + (j % 2) * L / 2, y = j * H, k = (alea() - 0.5) * 0.25;
        g.fillStyle = nuance(base, k); g.fillRect(x + 1, y + 1, L - 2, H - 2);
        g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, y + H - 3, L, 3); g.fillRect(x, y, 2, H);
        r.fillStyle = '#9A9A9A'; r.fillRect(x + 1, y + 1, L - 2, H - 2);
        r.fillStyle = '#303030'; r.fillRect(x, y + H - 3, L, 3);
      }
      grain(g, r, alea, 3000, 2, 0.06, base);
      break;
    }
    case 'enduit': grain(g, r, alea, 26_000, 2.2, 0.07, base); break;
    case 'beton': grain(g, r, alea, 18_000, 3, 0.09, base); for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(0,0,0,.06)'; g.beginPath(); g.arc(alea() * T, alea() * T, 1 + alea() * 2, 0, 7); g.fill() } break;
    case 'herbe': {
      /* des brins : de petits traits verticaux de verts variés, plus une marbrure large */
      for (let i = 0; i < 90; i++) { g.fillStyle = nuance(base, (alea() - 0.5) * 0.25).replace('rgb', 'rgba').replace(')', ',.35)'); g.beginPath(); g.arc(alea() * T, alea() * T, 20 + alea() * 60, 0, 7); g.fill() }
      for (let i = 0; i < 16_000; i++) {
        const x = alea() * T, y = alea() * T, k = (alea() - 0.45) * 0.5;
        g.strokeStyle = nuance(base, k); g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (alea() - 0.5) * 3, y - 3 - alea() * 5); g.stroke();
        const v = Math.round(128 + k * 200); r.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; r.fillRect(x, y - 3, 1, 3);
      }
      break;
    }
    case 'feuillage': {
      /* des feuilles : de petites taches claires et sombres serrées, des trous d'ombre */
      for (let i = 0; i < 14_000; i++) {
        const x = alea() * T, y = alea() * T, s = 2 + alea() * 5, k = (alea() - 0.55) * 0.7;
        g.fillStyle = nuance(base, k); g.beginPath(); g.ellipse(x, y, s, s * 0.6, alea() * 3, 0, 7); g.fill();
        const v = Math.round(128 + k * 160); r.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; r.beginPath(); r.ellipse(x, y, s, s * 0.6, 0, 0, 7); r.fill();
      }
      break;
    }
    case 'gravier': {
      for (let i = 0; i < 9_000; i++) {
        const x = alea() * T, y = alea() * T, s = 1.5 + alea() * 3.5, k = (alea() - 0.5) * 0.45;
        g.fillStyle = nuance(base, k); g.beginPath(); g.ellipse(x, y, s, s * 0.8, alea() * 3, 0, 7); g.fill();
        const v = Math.round(150 + k * 150); r.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; r.beginPath(); r.ellipse(x, y, s, s * 0.8, 0, 0, 7); r.fill();
      }
      break;
    }
    case 'bois': {
      /* des veines verticales ondulées */
      for (let i = 0; i < 140; i++) {
        const x0 = alea() * T, k = (alea() - 0.5) * 0.3;
        g.strokeStyle = nuance(base, k); g.lineWidth = 1 + alea() * 3; g.beginPath();
        for (let y = 0; y <= T; y += 16) { const x = x0 + Math.sin(y / 60 + i) * 4; if (y) g.lineTo(x, y); else g.moveTo(x, y) }
        g.stroke();
      }
      grain(g, r, alea, 4000, 1.5, 0.05, base);
      break;
    }
    case 'zinc': case 'bac_acier': {
      /* des joints debout (zinc) ou des nervures (bac acier) tous les 50 cm, de haut en bas de la pente */
      const p = genre === 'zinc' ? T / 2 : T / 4;
      for (let x = 0; x < T; x += p) {
        g.fillStyle = nuance(base, 0.25); g.fillRect(x, 0, 6, T); g.fillStyle = nuance(base, -0.3); g.fillRect(x + 6, 0, 4, T);
        r.fillStyle = '#F0F0F0'; r.fillRect(x, 0, 10, T);
      }
      grain(g, null, alea, 3000, 2, 0.03, base);
      break;
    }
  }
  return { couleur: c, relief: rc };
}
