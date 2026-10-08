"""Terrain, implantation, reculs mesurés, contrôle des règles, plan de masse."""
import math
import sys
from pathlib import Path

import pytest
from shapely import affinity
from shapely.geometry import Polygon, box

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import cas_fictif as C
from atelier.modele import Implantation, Regle, Statut, confirme
from atelier.pieces_graphiques import generer
from atelier.projet import creer_projet
from atelier.rdc import importer_rdc
from atelier.reglages import Reglages
from atelier.terrain import (controles, implanter_par_distances, lire_terrain_pdf, maison_sur_terrain, reculs,
                             superposer)


@pytest.fixture
def projet(tmp_path):
    d, p = creer_projet(tmp_path, "Maison fictive")
    f = tmp_path / "rdc.dxf"
    C.ecrire_dxf(str(f))                      # RDC de 12 × 9 m, sans porche
    p, _ = importer_rdc(p, str(f))
    return d, p


def origine(t):
    """Le terrain lu garde l'origine de la page : son coin (0 ; 0) du cas fictif."""
    return min(x for x, _ in t.limites), min(y for _, y in t.limites)


def test_lecture_du_terrain(tmp_path):
    f = tmp_path / "terrain.pdf"
    C.ecrire_terrain_pdf(str(f))
    t, extras, notes = lire_terrain_pdf(str(f))
    assert abs(t.surface.valeur - Polygon(C.TERRAIN).area) < 0.5
    assert all(c["ecrite"] is not None for c in t.cotes)          # 4 côtés confirmés par leur cote
    assert t.alignement == [next(i for i, c in enumerate(t.cotes) if abs(c["mesuree"] - 30) < 0.05)]
    assert t.nom_voie == "Rue d'Essai"
    assert sorted(p.z for p in t.tn) == [49.8, 49.95, 50.2, 50.4]
    assert t.altitude_rdc is not None and t.altitude_rdc.valeur == 50.10        # « ±0,00 = 50,10 » écrit sur le plan
    assert len(extras["emprises"]) == 1


def test_implantation_lue_sur_le_plan(tmp_path, projet):
    d, p = projet
    f = tmp_path / "terrain.pdf"
    C.ecrire_terrain_pdf(str(f))
    t, extras, _ = lire_terrain_pdf(str(f))
    ang, dx, dy, ecart = superposer(Polygon(p.batiment.niveaux[0].contour_exterieur).buffer(0), extras["emprises"])
    assert ecart < 0.01
    t.implantation = Implantation(angle=ang, dx=dx, dy=dy, statut=confirme(True))
    p.terrain = t
    ox, oy = origine(t)
    attendu = affinity.translate(affinity.rotate(box(0, 0, 12, 9), C.MAISON_ANGLE, origin=(0, 0)),
                                 C.MAISON_POS[0] + ox, C.MAISON_POS[1] + oy)
    assert maison_sur_terrain(p).hausdorff_distance(attendu) < 0.01
    # le recul sur rue : le coin le plus bas de la maison, au-dessus du côté sur rue
    rue = next(r for r in reculs(p) if r["alignement"])
    assert abs(rue["distance"] - (min(y for _, y in attendu.exterior.coords) - oy)) < 0.01


def test_implantation_par_distances_et_controles(tmp_path, projet):
    d, p = projet
    f = tmp_path / "terrain.pdf"
    C.ecrire_terrain_pdf(str(f), avec_maison=False)
    t, extras, _ = lire_terrain_pdf(str(f))
    assert not extras["emprises"]
    lim = Polygon(t.limites)
    rue = t.alignement[0]
    ox, oy = origine(t)
    cote = next(i for i in range(4) if t.limites[i][0] - ox < 5 and t.limites[i + 1][0] - ox < 5)   # le côté ouest
    maison = Polygon(p.batiment.niveaux[0].contour_exterieur).buffer(0)
    dx, dy = implanter_par_distances(maison, lim, 0.0, rue, 5.0, cote, 4.0)
    t.implantation = Implantation(angle=0.0, dx=dx, dy=dy, statut=confirme(True))
    p.terrain = t
    rc = {r["cote"]: r["distance"] for r in reculs(p)}
    assert abs(rc[rue] - 5.0) < 0.01 and abs(rc[cote] - 4.0) < 0.01
    p.regles = [Regle(cle="recul_alignement", valeur=5.0, article="art. 6"), Regle(cle="recul_limites", valeur=4.5, article="art. 7"),
                Regle(cle="emprise_max", valeur=30, article="art. 9"), Regle(cle="hauteur_egout_max", valeur=2.5)]
    c = {x["cle"]: x for x in controles(p)}
    assert c["recul_alignement"]["conforme"] and c["recul_alignement"]["juste"]      # au minimum exact
    assert c["recul_limites"]["conforme"] is False                                    # 4,00 < 4,50
    assert c["emprise_max"]["conforme"] and abs(c["emprise_max"]["mesure"] - 108 / lim.area * 100) < 0.1
    # sans altitude NGF du RDC, la hauteur est mesurée depuis le RDC, et dit
    assert c["hauteur_egout_max"]["conforme"] is False and "RDC" in c["hauteur_egout_max"]["reference"]
    # plan de masse
    doc = generer(p, Reglages(dessinateur="Prénom NOM"), ["plan_masse"])
    t_ = doc[0].get_text()
    assert "PLAN DE MASSE" in t_ and "Rue d'Essai" in t_ and "5,00" in t_ and "4,00" in t_ and "NON CONFORME" in t_
    assert "30,00" in t_                                                              # côté sur rue


def test_jeu_sans_terrain_saute_le_plan_de_masse(projet):
    d, p = projet
    assert len(generer(p, Reglages())) == 6
    with pytest.raises(ValueError, match="terrain"):
        generer(p, Reglages(), ["plan_masse"])


def test_cotes_paralleles_refuses():
    with pytest.raises(ValueError, match="parallèles"):
        implanter_par_distances(box(0, 0, 12, 9), box(0, 0, 30, 20), 0.0, 0, 5.0, 2, 4.0)
