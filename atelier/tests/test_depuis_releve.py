"""Le brouillon préparé depuis le relevé de visite : un fichier « cp-permis » (client, adresse, parcelle, plan DXF)
devient un projet et un PDF. Rien n'est validé (R6), ce qui vient du relevé reste une hypothèse (R3, R4),
rien n'est inventé (R2). Plan fictif : tests/maison_releve_fictive.dxf (5 pièces, 90 m², dessiné par le moteur du relevé)."""
import base64
import json
import sys
from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from atelier import depuis_releve as DR
from atelier.modele import Statut
from atelier.projet import charger, lister
from atelier.serveur import creer_app

DXF = (Path(__file__).resolve().parent / "maison_releve_fictive.dxf").read_bytes()


def dossier(**x):
    d = {"format": "cp-permis", "version": 1, "visite": {"id": "vis-1", "intitule": "M. Fictif"},
         "client": {"nom": "M. Fictif", "adresse": "2 rue du Test, 00000 Nulle-part"},
         "projet": {"adresse": "1 rue d'Essai, 00000 Nulle-part", "parcelles": ["AB 123"], "surface_terrain": 812},
         "plan": {"dxf_base64": base64.b64encode(DXF).decode()}}
    d.update(x)
    return json.dumps(d)


def test_lire_un_dossier_complet():
    d = DR.lire(dossier())
    assert d["nom"] == "M. Fictif" and d["parcelles"] == ["AB 123"] and d["surface_terrain"] == 812.0
    assert d["adresse"].startswith("1 rue d'Essai") and d["adresse_maitre_ouvrage"].startswith("2 rue du Test")
    assert d["dxf"] == DXF


@pytest.mark.parametrize("contenu, mot", [
    ("pas du json", "pas un dossier"),
    (json.dumps({"format": "autre"}), "pas un dossier"),
    (dossier(version=99), "plus récente"),
    (dossier(plan={}), "pas de plan"),
    (dossier(plan={"dxf_base64": "@@@"}), "pas de plan"),
    (dossier(client={}, visite={}), "nom du client"),
])
def test_dossier_incomplet_refuse(contenu, mot):
    with pytest.raises(DR.DossierReleveInvalide, match=mot):
        DR.lire(contenu)


def test_brouillon_complet(tmp_path):
    r = DR.creer(tmp_path, DR.lire(dossier()), par="")
    d, p = r["dossier"], charger(r["dossier"])
    noms = {x.nom for x in p.batiment.niveaux[0].pieces}
    assert noms == {"Séjour", "Cuisine", "Chambre 1", "Chambre 2", "Salle de bains"}   # accents conservés (cp1252)
    assert p.maitre_ouvrage == "M. Fictif" and p.parcelles == ["AB 123"]
    # R6 : aucun point d'arrêt validé, ni signé à la place d'une personne
    assert not any(v.valide for v in p.points_arret.values())
    # R3, R4 : la surface du terrain venue du relevé est une hypothèse sourcée, jamais « confirmée »
    assert p.surface_terrain.statut == Statut.HYPOTHESE and p.surface_terrain.valeur == 812.0
    assert "relevé de visite vis-1" in p.surface_terrain.source.document and p.surface_terrain.consequence
    # le plan reçu est gardé tel quel, la décision est au journal
    assert (d / "00_entrees" / "plan-releve.dxf").read_bytes() == DXF
    assert any(j.sujet.startswith("Dossier préparé depuis le relevé") and j.par == "relevé (automatique)" for j in p.journal)
    # le PDF existe et rappelle ce qui reste à confirmer
    assert r["fichier"] and r["fichier"].exists() and r["avertissement"] == ""
    doc = pymupdf.open(r["fichier"])
    # garde, coupes, notice, façades, plan de toiture, plan du RDC : sans terrain, ni plan de masse ni situation
    assert len(doc) == 6 and any("À CONFIRMER" in pg.get_text().upper() for pg in doc)
    texte = " ".join(pg.get_text() for pg in doc)
    assert "[à préciser]" in texte                      # R2 : ce qui manque n'est pas inventé


def test_pas_de_projet_vide_si_le_plan_est_illisible(tmp_path):
    mauvais = json.loads(dossier())
    mauvais["plan"]["dxf_base64"] = base64.b64encode(b"ceci n'est pas un dxf").decode()
    with pytest.raises(DR.DossierReleveInvalide, match="n'a pas pu être lu"):
        DR.creer(tmp_path, DR.lire(json.dumps(mauvais)))
    assert lister(tmp_path) == [] and not any(tmp_path.iterdir())


def test_une_visite_reprise_ne_remplace_jamais_le_projet(tmp_path):
    a = DR.creer(tmp_path, DR.lire(dossier()))
    b = DR.creer(tmp_path, DR.lire(dossier()))
    assert a["dossier"] != b["dossier"] and a["dossier"].exists() and b["dossier"].exists()
    assert charger(b["dossier"]).nom == "M. Fictif 2"


def test_production_bloquee_garde_le_projet(tmp_path, monkeypatch):
    def refus(*a, **k):
        raise ValueError("Surface de plancher au-dessus de 150 m² : un architecte est obligatoire.")
    monkeypatch.setattr(DR, "produire_pdf", refus)
    r = DR.creer(tmp_path, DR.lire(dossier()))
    assert r["fichier"] is None and "150 m²" in r["avertissement"] and r["dossier"].exists()


def test_api(tmp_path):
    c = TestClient(creer_app(tmp_path / "projets"))
    r = c.post("/api/depuis-releve", files={"fichier": ("dossier-permis.json", dossier().encode())}, data={"par": "Loïc"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["fichier"].endswith("jeu-complet.pdf") and j["avertissement"] == ""
    assert not any(v["valide"] for v in j["projet"]["points_arret"].values())
    assert c.get(f"/api/projets/{j['dossier']}/fichiers/{j['fichier']}").status_code == 200
    mauvais = c.post("/api/depuis-releve", files={"fichier": ("x.json", b"{}")})
    assert mauvais.status_code == 400 and "pas un dossier" in mauvais.json()["detail"]
