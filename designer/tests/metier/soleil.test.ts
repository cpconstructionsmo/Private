/* La course du soleil (vue3d/soleil.ts) : hauteurs de midi aux solstices et
   aux équinoxes, azimuts du matin et du soir, lever et coucher, et la
   direction dans le repère du plan selon le nord de la parcelle. */
import { describe, expect, it } from 'vitest';
import { positionSoleil, directionSoleil, leverCoucher, JOURS_REMARQUABLES as J, LATITUDE_PAR_DEFAUT } from '../../src/vue3d/soleil';

const deg = (r: number) => r * 180 / Math.PI;

describe('course du soleil', () => {
  it('à midi solaire, plein sud ; hauteur = 90° − latitude + déclinaison', () => {
    for (const [jour, decl] of [[J.juin, 23.44], [J.decembre, -23.44], [J.mars, 0]] as const) {
      const p = positionSoleil({ jour, heure: 12, latitude: 47 });
      expect(deg(p.azimut)).toBeCloseTo(180, 3);
      expect(deg(p.hauteur)).toBeCloseTo(90 - 47 + decl, 0);
    }
  });

  it('le matin à l’est, le soir à l’ouest, symétriques autour de midi', () => {
    const m = positionSoleil({ jour: J.juin, heure: 9, latitude: 47 }), s = positionSoleil({ jour: J.juin, heure: 15, latitude: 47 });
    expect(deg(m.azimut)).toBeGreaterThan(90);
    expect(deg(m.azimut)).toBeLessThan(135);
    expect(deg(m.azimut) + deg(s.azimut)).toBeCloseTo(360, 6);
    expect(m.hauteur).toBeCloseTo(s.hauteur, 9);
  });

  it('lever et coucher : de longs jours en juin, courts en décembre ; 12 h à l’équinoxe', () => {
    const ete = leverCoucher(J.juin, LATITUDE_PAR_DEFAUT)!, hiver = leverCoucher(J.decembre, LATITUDE_PAR_DEFAUT)!, eq = leverCoucher(J.mars, LATITUDE_PAR_DEFAUT)!;
    expect(ete.coucher - ete.lever).toBeGreaterThan(15.5);
    expect(hiver.coucher - hiver.lever).toBeLessThan(8.7);
    expect(eq.coucher - eq.lever).toBeCloseTo(12, 0);
    /* au lever, le soleil est à l'horizon */
    expect(deg(positionSoleil({ jour: J.juin, heure: ete.lever, latitude: LATITUDE_PAR_DEFAUT }).hauteur)).toBeCloseTo(0, 6);
    /* au-delà du cercle polaire, en juin, le soleil ne se couche pas */
    expect(leverCoucher(J.juin, 70)).toBeNull();
  });

  it('dans le repère du plan : le nord en haut, midi vient du bas (−y) ; le nord tourné, la direction tourne avec', () => {
    const midi = positionSoleil({ jour: J.mars, heure: 12, latitude: 47 });
    const d = directionSoleil(midi);
    expect(d.x).toBeCloseTo(0, 6);
    expect(d.y).toBeLessThan(0);
    expect(d.z).toBeCloseTo(Math.sin(midi.hauteur), 9);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9);
    /* le nord à 90° (vers la gauche du plan) : le sud est à droite, le soleil de midi vient de +x */
    const t = directionSoleil(midi, Math.PI / 2);
    expect(t.y).toBeCloseTo(0, 6);
    expect(t.x).toBeGreaterThan(0);
    /* le matin (soleil à l'est) : nord en haut, l'est est à droite */
    expect(directionSoleil(positionSoleil({ jour: J.mars, heure: 8, latitude: 47 })).x).toBeGreaterThan(0);
  });
});
