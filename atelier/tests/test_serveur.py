"""Le serveur local : création d'un projet, import du RDC, corrections,
point d'arrêt n° 1, journal, niveaux — et aucun chemin hors du dossier des projets."""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import cas_fictif as C
from atelier.serveur import creer_app


@pytest.fixture
def client(tmp_path):
    return TestClient(creer_app(tmp_path / "projets")), tmp_path


def test_parcours_complet(client):
    c, tmp = client
    assert c.get("/").status_code == 200 and "Atelier" in c.get("/").text
    r = c.post("/api/projets", json={"nom": "Maison fictive", "adresse": "1 rue d'Essai", "parcelles": ["AB 1", " "]})
    assert r.status_code == 200, r.text
    d = r.json()["dossier"]
    assert r.json()["projet"]["parcelles"] == ["AB 1"]
    assert c.post("/api/projets", json={"nom": "Maison fictive"}).status_code == 409
    assert [p["dossier"] for p in c.get("/api/projets").json()] == [d]

    # le RDC ne se valide pas avant d'être importé
    assert c.post(f"/api/projets/{d}/points/1_rdc", json={"par": "Essai"}).status_code == 400

    # PDF sans échelle : refusé, avec l'explication
    C.ecrire_pdf(str(tmp / "rdc.pdf"))
    r = c.post(f"/api/projets/{d}/rdc", files={"fichier": ("rdc.pdf", (tmp / "rdc.pdf").read_bytes())})
    assert r.status_code == 400 and "échelle" in r.json()["detail"]

    C.ecrire_dxf(str(tmp / "rdc.dxf"))
    r = c.post(f"/api/projets/{d}/rdc", files={"fichier": ("rdc.dxf", (tmp / "rdc.dxf").read_bytes())})
    assert r.status_code == 200, r.text
    e = r.json()
    assert abs(e["surfaces"]["surface_plancher"]["valeur"]["valeur"] - 71.34) < 0.05
    assert e["surfaces"]["surface_plancher"]["valeur"]["statut"] == "hypothese"
    assert e["surfaces"]["seuil_architecte"]["etat"] == "ok"
    assert e["projet"]["source_rdc"]["segments"] and e["projet"]["documents"][-1]["fichier"].startswith("00_entrees/")
    # le fichier déposé est conservé, un second dépôt ne l'écrase pas
    c.post(f"/api/projets/{d}/rdc", files={"fichier": ("rdc.dxf", (tmp / "rdc.dxf").read_bytes())})
    assert sorted(x.name for x in (tmp / "projets" / d / "00_entrees").iterdir()) == ["rdc.dxf", "rdc_2.dxf"]

    # point d'arrêt n° 1 : signé ; les surfaces deviennent confirmées
    assert c.post(f"/api/projets/{d}/points/1_rdc", json={"par": " "}).status_code == 400
    assert c.post(f"/api/projets/{d}/points/2_implantation", json={"par": "Essai"}).status_code == 400
    r = c.post(f"/api/projets/{d}/points/1_rdc", json={"par": "Claude PORTIER", "remarque": "écarts vérifiés"})
    assert r.status_code == 200
    e = r.json()
    assert e["projet"]["points_arret"]["1_rdc"]["valide"] and e["surfaces"]["surface_plancher"]["valeur"]["statut"] == "confirme"

    # une correction annule la validation et s'inscrit au journal
    piece = next(p for p in e["projet"]["batiment"]["niveaux"][0]["pieces"] if p["nom"] == "Chambre 2")
    r = c.post(f"/api/projets/{d}/pieces/{piece['id']}", json={"nom": "Bureau", "par": "Claude PORTIER"})
    e = r.json()
    assert not e["projet"]["points_arret"]["1_rdc"]["valide"]
    assert any(j["sujet"] == "Correction du RDC interprété" and "Bureau" in j["choix"] for j in e["projet"]["journal"])
    # exclure une pièce de la surface habitable
    r = c.post(f"/api/projets/{d}/pieces/{piece['id']}", json={"exclue_habitable": True})
    assert abs(r.json()["surfaces"]["surface_habitable"]["valeur"]["valeur"] - (68.98 - 10.14)) < 0.05
    # écarter une surface
    r = c.post(f"/api/projets/{d}/pieces/{piece['id']}", json={"ecarter": True})
    assert len(r.json()["projet"]["batiment"]["niveaux"][0]["pieces"]) == 4

    # niveaux : plain-pied par défaut, étage sur demande, au journal
    assert e["projet"]["batiment"]["type_niveaux"] == "plain-pied"
    r = c.post(f"/api/projets/{d}/niveaux", json={"type_niveaux": "etage", "par": "Claude PORTIER"})
    assert r.json()["projet"]["batiment"]["type_niveaux"] == "etage"
    assert c.post(f"/api/projets/{d}/niveaux", json={"type_niveaux": "duplex"}).status_code == 400

    r = c.post(f"/api/projets/{d}/journal", json={"sujet": "Toiture", "choix": "2 pans, tuiles", "motif": "demande client"})
    assert r.json()["projet"]["journal"][-1]["choix"] == "2 pans, tuiles"
    v = r.json()["projet"]["version"]
    assert len(list((tmp / "projets" / d / "01_modele" / "versions").glob("*.json"))) == v

    x = c.get(f"/api/projets/{d}/export.json")
    assert x.status_code == 200 and '"nom": "Maison fictive"' in x.text


def test_chemins_refuses(client):
    c, _ = client
    for nom in ["..", "..%2F..%2Fetc", ".cache", "a b"]:
        assert c.get(f"/api/projets/{nom}").status_code in (400, 404)
    assert c.get("/api/projets/2026-INCONNU").status_code == 404
