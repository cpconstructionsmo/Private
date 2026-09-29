"""Jalon J1 : le RDC fictif, lu en DXF et en PDF, redonne les surfaces
calculées à la main ; les pièges sont détectés ; le seuil de 150 m² est tenu."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import cas_fictif as C
from atelier.modele import Statut
from atelier.projet import charger, creer_projet, enregistrer, valider_point_arret
from atelier.rdc import bilan_surfaces, importer_rdc
from atelier.surfaces import seuil_architecte


@pytest.fixture
def projet(tmp_path):
    return creer_projet(tmp_path, "Maison fictive", adresse="1 rue d'Essai, 00000 Nulle-part")


@pytest.mark.parametrize("fmt", ["dxf", "pdf"])
def test_surfaces(tmp_path, projet, fmt):
    dossier, p = projet
    f = tmp_path / f"rdc.{fmt}"
    (C.ecrire_dxf if fmt == "dxf" else C.ecrire_pdf)(str(f))
    p, notes = importer_rdc(p, str(f), echelle=100 if fmt == "pdf" else None)
    n = p.batiment.niveaux[0]
    noms = {x.nom: x for x in n.pieces}
    for nom, s in C.ATTENDU["pieces"].items():
        assert nom in noms, f"pièce manquante : {nom} (lues : {list(noms)})"
        assert abs(noms[nom].surface_calculee - s) < 0.02, (nom, noms[nom].surface_calculee)
    assert len(n.pieces) == 5, [x.nom for x in n.pieces]
    b = bilan_surfaces(p)
    assert abs(b["surface_plancher"]["valeur"].valeur - C.ATTENDU["surface_plancher"]) < 0.05
    assert abs(b["surface_habitable"]["valeur"].valeur - C.ATTENDU["surface_habitable"]) < 0.05
    assert abs(b["emprise_sol"]["valeur"].valeur - C.ATTENDU["emprise_sol"]) < 0.02
    # tant que le RDC n'est pas validé, tout reste hypothèse (R4, R6)
    assert b["surface_plancher"]["valeur"].statut == Statut.HYPOTHESE
    assert b["seuil_architecte"]["etat"] == "ok"
    # l'écart de surface lue (8,60 contre 8,58) est relevé
    assert any(e["genre"] == "surface" and e["piece"] == "Salle d'eau" for e in p.ecarts_rdc)
    assert noms["Garage"].exclue_habitable and noms["Salle d'eau"].humide
    # les murs de façade et les cloisons sont distingués, épaisseurs mesurées
    ext = [m for m in n.murs if m.exterieur]
    assert ext and all(abs(m.epaisseur - 0.30) < 0.02 for m in ext)
    assert any(not m.exterieur and abs(m.epaisseur - 0.10) < 0.03 for m in n.murs)
    # porteur : jamais confirmé sans document (R2)
    assert all(m.porteur.statut == Statut.HYPOTHESE for m in n.murs)
    # la porte d'entrée (sans bloc) et les portes intérieures sont reconnues
    assert sum(1 for o in n.ouvertures if o.origine == "interruption de mur") >= 5
    p = enregistrer(dossier, p, "import")
    assert charger(dossier).batiment.niveaux[0].pieces


def test_dxf_blocs_et_cotes(tmp_path, projet):
    dossier, p = projet
    f = tmp_path / "rdc.dxf"
    C.ecrire_dxf(str(f))
    p, notes = importer_rdc(p, str(f))
    n = p.batiment.niveaux[0]
    types = [o.type for o in n.ouvertures if o.origine.startswith("bloc")]
    assert types.count("fenetre") == 5 and types.count("porte de garage") == 1
    garage = next(o for o in n.ouvertures if o.type == "porte de garage")
    assert abs(garage.largeur.valeur - 2.40) < 0.01 and garage.hauteur.statut == Statut.IMPOSSIBLE
    genres = [e["genre"] for e in p.ecarts_rdc]
    assert "cote-forcee" in genres and "chaine-de-cotes" in genres
    assert not notes   # unités lues dans l'en-tête


def test_point_arret_et_invalidation(tmp_path, projet):
    dossier, p = projet
    f = tmp_path / "rdc.dxf"
    C.ecrire_dxf(str(f))
    p, _ = importer_rdc(p, str(f))
    valider_point_arret(p, "1_rdc", par="Claude PORTIER")
    assert bilan_surfaces(p)["surface_plancher"]["valeur"].statut == Statut.CONFIRME
    p, _ = importer_rdc(p, str(f))          # un nouvel import annule la validation
    assert not p.points_arret["1_rdc"].valide
    assert any(d.choix == "Validation annulée" for d in p.journal)


def test_seuil_architecte():
    assert seuil_architecte(135.18)["etat"] == "ok"
    assert seuil_architecte(140.0)["etat"] == "alerte"
    assert seuil_architecte(150.0)["etat"] == "alerte"
    assert seuil_architecte(150.01)["etat"] == "bloquant"
    assert "à vérifier" in seuil_architecte(151)["message"]


def test_formats_refuses(tmp_path, projet):
    dossier, p = projet
    with pytest.raises(ValueError, match="DXF"):
        importer_rdc(p, str(tmp_path / "plan.dwg"))
    C.ecrire_pdf(str(tmp_path / "plan.pdf"))          # aucune échelle écrite sur la page
    with pytest.raises(ValueError, match="échelle"):
        importer_rdc(p, str(tmp_path / "plan.pdf"))


def test_projet_arborescence_et_versions(tmp_path):
    dossier, p = creer_projet(tmp_path, "Martin Essai")
    assert dossier.name.endswith("-MARTIN-ESSAI")
    for s in ["00_entrees", "01_modele", "02_reglementation", "03_analyse", "04_pieces", "05_etage", "06_depot"]:
        assert (dossier / s).is_dir()
    p = enregistrer(dossier, p, "essai")
    assert p.version == 2 and len(list((dossier / "01_modele" / "versions").glob("*.json"))) == 2
    assert p.batiment.type_niveaux == "plain-pied"
    assert any(d.genre == "defaut-prudent" and d.choix == "Plain-pied" for d in p.journal)


def test_pdf_murs_en_aplats(tmp_path, projet):
    """Murs dessinés en aplats, plan en page 2, échelle lue sur la page et
    contrôlée sur la cote 12,00 ; le tableau en aplats n'est pas pris pour des murs."""
    from atelier.import_pdf import lire_pdf, pages_du_pdf
    dossier, p = projet
    f = tmp_path / "jeu.pdf"
    C.ecrire_pdf_aplats(str(f))
    assert [x["echelle"] for x in pages_du_pdf(str(f))] == [None, 75]
    brut, notes = lire_pdf(str(f), page=1)
    assert any("1/75" in n for n in notes) and any("✅ Échelle contrôlée" in n for n in notes), notes
    assert any("aplats" in n for n in notes)
    p, notes = importer_rdc(p, str(f))          # page du plan choisie seule, échelle lue
    n = p.batiment.niveaux[0]
    noms = {x.nom: x for x in n.pieces}
    for nom, s in C.ATTENDU["pieces"].items():
        assert nom in noms, f"pièce manquante : {nom} (lues : {list(noms)})"
        assert abs(noms[nom].surface_calculee - s) < 0.02, (nom, noms[nom].surface_calculee)
    b = bilan_surfaces(p)
    assert abs(b["surface_plancher"]["valeur"].valeur - C.ATTENDU["surface_plancher"]) < 0.05
    # le porche couvert, sur poteau supposé, s'ajoute à l'emprise au sol
    assert [c.nom for c in n.couverts] == ["Porche couvert"]
    assert abs(b["emprise_sol"]["valeur"].valeur - (C.ATTENDU["emprise_sol"] + C.PORCHE)) < 0.03
    assert n.couverts[0].compte_emprise.statut == Statut.HYPOTHESE
    assert any("page 2" in x for x in notes), notes
    # tailles des baies lues le long des cotes
    lues = {(o.largeur.valeur, o.hauteur.valeur, o.allege.valeur) for o in n.ouvertures
            if o.exterieure and o.hauteur.statut == Statut.CONFIRME}
    assert {(1.8, 2.15, 0.0), (1.0, 1.25, 0.9), (0.6, 0.75, 1.4)} <= lues, lues


def test_separation_porte_d_angle():
    """Deux noms dans une même surface : la porte d'angle est refermée par la
    plus courte ligne qui laisse un nom de chaque côté."""
    from shapely.geometry import Point, box
    from atelier.geometrie import separer
    # un couloir de 1 m au-dessus d'une chambre, ouverts l'un sur l'autre sur 0,9 m
    f = box(0, 0, 3, 3).union(box(0, 3, 6, 4)).difference(box(0.9, 2.95, 3.0, 3.05))
    r = separer(f, [Point(1.5, 1.5), Point(4.5, 3.5)])
    assert r is not None
    ligne, parts = r
    assert len(parts) == 2 and abs(ligne.length - 0.9) < 0.01
