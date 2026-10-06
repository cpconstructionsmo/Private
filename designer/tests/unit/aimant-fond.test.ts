/* L'aimant du fond : les traits d'un PDF vectoriel (matrice courante, page
   retournée, courbes réduites à leurs bouts, découpes ignorées), les lignes
   d'une image (trait fin : son axe ; aplat épais : ses deux bords), puis
   l'accrochage sur leurs angles et leurs traits, après les murs ; et le mur
   tracé par sa face. Données fictives écrites ici. */
import { describe, expect, it } from 'vitest';
import { lignesDeLImage, traitsDuPdf, type CodesPdf } from '../../src/import/traits-fond';
import { Accrochage, AimantFond } from '../../src/building/accrochage';
import { creerProjet, generateurSequentiel } from '../../src/model';
import { Outils } from '../../src/ui/outils';

const OPS: CodesPdf = { save: 10, restore: 11, transform: 12, constructPath: 91, endPath: 28, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75 };
const STROKE = 20;

describe('traits d’un PDF vectoriel', () => {
  it('matrice courante et page retournée ; un tracé fermé donne ses côtés ; courbes et découpes ne donnent pas de trait', () => {
    const triangle = new Float32Array([0, 0, 0, 1, 10, 0, 1, 10, 10, 4]);
    const courbe = new Float32Array([0, 0, 0, 2, 1, 1, 2, 2, 3, 3]);
    const fn = [OPS.save, OPS.transform, OPS.constructPath, OPS.constructPath, OPS.constructPath, OPS.restore, OPS.constructPath];
    const args = [null, [2, 0, 0, 2, 5, 5], [STROKE, [triangle], null], [STROKE, [courbe], null], [OPS.endPath, [triangle], null], null, [STROKE, [new Float32Array([0, 0, 0, 1, 50, 0])], null]];
    /* la page : 100 points de haut, v vers le bas */
    const T = traitsDuPdf(fn, args, OPS, [1, 0, 0, -1, 0, 100]);
    expect(T).toEqual([
      [{ x: 5, y: 95 }, { x: 25, y: 95 }], [{ x: 25, y: 95 }, { x: 25, y: 75 }], [{ x: 25, y: 75 }, { x: 5, y: 95 }],
      [{ x: 0, y: 100 }, { x: 50, y: 100 }],                                    // après restore : la matrice d'avant
    ]);
  });
});

describe('lignes d’une image', () => {
  it('un trait fin donne son axe ; un mur poché (aplat épais) ses deux faces ; le bruit court est ignoré', () => {
    const l = 100, h = 100, g = new Uint8Array(l * h).fill(255);
    const noircir = (x0: number, x1: number, y0: number, y1: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y * l + x] = 0 };
    noircir(10, 89, 20, 21);          // trait horizontal de 2 pixels
    noircir(40, 49, 30, 89);          // aplat vertical de 10 pixels : un mur
    noircir(70, 74, 60, 62);          // une tache
    const T = lignesDeLImage(g, l, h, { longueurMin: 20 });
    expect(T).toContainEqual([{ x: 10, y: 21 }, { x: 90, y: 21 }]);
    expect(T).toContainEqual([{ x: 40, y: 30 }, { x: 40, y: 90 }]);
    expect(T).toContainEqual([{ x: 50, y: 30 }, { x: 50, y: 90 }]);
    expect(T).toHaveLength(3);
  });
});

describe('accrochage sur le fond', () => {
  const p = creerProjet({ nom: 'Fictif', id: generateurSequentiel('p') }), f = p.buildings[0]!.floors[0]!;
  const carre = [[0, 0, 5_000, 0], [5_000, 0, 5_000, 4_000], [5_000, 4_000, 0, 4_000], [0, 4_000, 0, 0], [2_000, 0, 2_000, 4_000]]
    .map(([ax, ay, bx, by]) => ({ a: { x: ax!, y: ay! }, b: { x: bx!, y: by! } }));
  const F = new AimantFond(carre), A = new Accrochage(f);
  it('les angles et croisements du fond, puis ses traits ; sans aimant, rien', () => {
    expect(F.nombre).toBe(5);
    expect(A.chercher({ x: 4_970, y: 30 }, { rayon: 100, fonds: [F] })).toMatchObject({ genre: 'coin_fond', point: { x: 5_000, y: 0 } });
    expect(A.chercher({ x: 2_030, y: 4_020 }, { rayon: 100, fonds: [F] })).toMatchObject({ genre: 'coin_fond', point: { x: 2_000, y: 4_000 } });   // un T du fond
    const t = A.chercher({ x: 3_500, y: 40 }, { rayon: 100, fonds: [F] });
    expect(t).toMatchObject({ genre: 'trait_fond', point: { x: 3_500, y: 0 } });
    expect(t.support).toEqual(carre[0]);
    expect(A.chercher({ x: 3_500, y: 40 }, { rayon: 100 }).genre).toBe('libre');
    expect(A.chercher({ x: 3_500, y: 40 }, { rayon: 100, fonds: [F], desactive: true }).genre).toBe('libre');
  });

  it('les outils : un mur tracé sur le fond, par sa face', () => {
    const o = new Outils(() => ({ projet: p, niveau: f.id, selection: null }));
    o.aimantsFond = [F];
    o.reglages.equerre = false;
    o.choisir('mur');
    o.reglages.justification = 'left';
    const g = (x: number, y: number) => ({ point: { x, y }, rayon: 100 });
    o.bouger(g(30, 20)); o.appuyer(g(30, 20));
    o.bouger(g(4_960, -30));
    const e = o.appuyer(g(4_960, -30));
    expect(e.commandes?.liste[0]).toMatchObject({ type: 'creerMur', a: { x: 0, y: 0 }, b: { x: 5_000, y: 0 }, justification: 'left' });
  });
});
