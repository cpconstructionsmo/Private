"""Toiture à croupes calculée : hauteurs de faîtage vérifiées à la main."""
import math
import sys
from pathlib import Path

import pytest
from shapely import affinity
from shapely.geometry import box

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from atelier.toiture import calculer_toiture

T35 = math.tan(math.radians(35))


def genres(T):
    from collections import Counter
    return Counter(l.genre for l in T.lignes)


def test_rectangle():
    # 10 × 8 m, débord 0,30 : égout de 10,60 × 8,60, faîtage à 2,80 + 4,30 × tan 35°
    T = calculer_toiture(list(box(0, 0, 10, 8).exterior.coords), 2.80, 35, 0.30)
    assert len(T.pans) == 4
    assert T.faitages == [round(2.80 + 4.30 * T35, 2)]
    g = genres(T)
    assert g["faitage"] == 1 and g["arretier"] == 4 and g["noue"] == 0
    faitage = next(l for l in T.lignes if l.genre == "faitage")
    assert abs(faitage.ligne.length - 2.0) < 1e-4          # 10,60 − 8,60
    assert abs(T.egout.area - 10.6 * 8.6) < 1e-6
    # à l'égout, la couverture est à la hauteur de l'égout ; la toiture couvre tout l'égout
    assert abs(T.z(-0.29, 4.0) - (2.80 + 0.01 * T35)) < 1e-6
    assert abs(sum(p.polygone.area for p in T.pans) - T.egout.area) < 1e-6


def test_carre_en_pyramide():
    T = calculer_toiture(list(box(0, 0, 8, 8).exterior.coords), 2.50, 40, 0.0)
    assert genres(T)["arretier"] == 4 and genres(T)["faitage"] == 0
    assert T.faitages == [round(2.50 + 4.0 * math.tan(math.radians(40)), 2)]


def test_maison_en_L():
    # deux ailes de 6 m de large : même faîtage, une noue à l'angle rentrant
    L = box(0, 0, 10, 6).union(box(0, 6, 6, 12))
    T = calculer_toiture(list(L.exterior.coords), 2.80, 35, 0.0)
    assert T.faitages == [round(2.80 + 3.0 * T35, 2)]
    assert genres(T)["noue"] == 1
    assert abs(sum(p.polygone.area for p in T.pans) - L.area) < 1e-6


def test_ailes_de_largeurs_differentes():
    # aile de 9 m et aile de 6 m : deux hauteurs de faîtage
    g = box(0, 0, 12, 9).union(box(12, 0, 20, 6))
    T = calculer_toiture(list(g.exterior.coords), 2.82, 35, 0.21)
    assert T.faitages == sorted([round(2.82 + (4.5 + 0.21) * T35, 2), round(2.82 + (3.0 + 0.21) * T35, 2)], reverse=True)


def test_plan_tourne():
    g = affinity.rotate(box(0, 0, 10, 8), 30, origin=(0, 0))
    T = calculer_toiture(list(g.exterior.coords), 2.80, 35, 0.30)
    assert T.faitages == [round(2.80 + 4.30 * T35, 2)]


def test_plan_non_orthogonal_refuse():
    with pytest.raises(ValueError, match="orthogonal"):
        calculer_toiture([(0, 0), (10, 0), (5, 7), (0, 0)], 2.8, 35, 0.3)
