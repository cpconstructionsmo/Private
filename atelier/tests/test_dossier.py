"""Le dossier complet par l'API : terrain et implantation lue sur le plan,
règles contrôlées, notice, images et planches photographiques."""
import struct
import sys
from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import cas_fictif as C
from atelier.planches_images import _orientation_exif
from atelier.serveur import creer_app


def image_png(w=400, h=300, couleur=(0.4, 0.6, 0.3)) -> bytes:
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, w, h), False)
    pix.set_rect(pix.irect, tuple(int(c * 255) for c in couleur))
    return pix.tobytes("png")


def test_orientation_exif():
    # en-tête JPEG minimal avec un bloc EXIF « orientation = 6 » (photo prise en portrait)
    tiff = b"MM" + struct.pack(">HI", 42, 8) + struct.pack(">H", 1) + struct.pack(">HHIHH", 0x0112, 3, 1, 6, 0) + b"\0\0\0\0"
    app1 = b"Exif\0\0" + tiff
    jpeg = b"\xff\xd8" + b"\xff\xe1" + struct.pack(">H", len(app1) + 2) + app1 + b"\xff\xda\0\2"
    assert _orientation_exif(jpeg) == 6
    assert _orientation_exif(b"\xff\xd8\xff\xda\0\2") == 1


@pytest.fixture
def client(tmp_path):
    c = TestClient(creer_app(tmp_path / "projets"))
    d = c.post("/api/projets", json={"nom": "Maison fictive", "maitre_ouvrage": "M. et Mme EXEMPLE"}).json()["dossier"]
    C.ecrire_dxf(str(tmp_path / "rdc.dxf"))
    assert c.post(f"/api/projets/{d}/rdc", files={"fichier": ("rdc.dxf", (tmp_path / "rdc.dxf").read_bytes())}).status_code == 200
    return c, d, tmp_path


def test_terrain_regles_notice_images(client):
    c, d, tmp = client
    C.ecrire_terrain_pdf(str(tmp / "terrain.pdf"))
    r = c.post(f"/api/projets/{d}/terrain", files={"fichier": ("terrain.pdf", (tmp / "terrain.pdf").read_bytes())})
    assert r.status_code == 200, r.text
    e = r.json()
    # la maison dessinée sur le plan : implantation lue, confirmée
    assert e["projet"]["terrain"]["implantation"]["statut"]["statut"] == "confirme"
    assert any("Implantation lue" in n for n in e["notes"])
    assert len(e["terrain"]["reculs"]) == 4 and e["terrain"]["maison"]
    # la surface du terrain passe dans le cartouche
    assert abs(e["projet"]["surface_terrain"]["valeur"] - 700.0) < 1
    # règles : valeurs et articles saisis, contrôles mesurés
    r = c.post(f"/api/projets/{d}/regles", json={"regles": [
        {"cle": "recul_alignement", "valeur": "5", "article": "art. 6"}, {"cle": "emprise_max", "valeur": "40", "article": ""},
        {"cle": "inconnue", "valeur": "1"}]})
    ctrl = {x["cle"]: x for x in r.json()["terrain"]["controles"]}
    assert set(ctrl) == {"recul_alignement", "emprise_max"}
    assert ctrl["emprise_max"]["conforme"] is True
    # implantation saisie : parallèle au côté sur rue, à 5 m de la rue et 4 m d'un côté
    rue = r.json()["projet"]["terrain"]["alignement"][0]
    autre = (rue + 1) % 4
    r = c.post(f"/api/projets/{d}/implantation", json={"parallele_a": rue, "cote_a": rue, "dist_a": 5.0, "cote_b": autre,
                                                      "dist_b": 4.0, "par": "Essai"})
    rc = {x["cote"]: x["distance"] for x in r.json()["terrain"]["reculs"]}
    assert abs(rc[rue] - 5.0) < 0.01 and abs(rc[autre] - 4.0) < 0.01
    # notice
    r = c.post(f"/api/projets/{d}/notice", json={"paragraphes": {"etat_initial": "Terrain en herbe, sans arbre."},
                                                "commune": "Nulle-part", "zone_plu": "zone UB du PLU"})
    assert r.json()["projet"]["notice"]["etat_initial"] == "Terrain en herbe, sans arbre."
    # images : dépôt, numéro, point de vue ; refus d'un format non image
    r = c.post(f"/api/projets/{d}/images", files={"fichier": ("vue.png", image_png())}, data={"piece": "PCMI7", "legende": "depuis la rue"})
    im = r.json()["projet"]["images"][0]
    lim = r.json()["projet"]["terrain"]["limites"]
    r = c.post(f"/api/projets/{d}/images/{im['id']}", json={"numero": 3, "x": lim[0][0] + 5, "y": lim[0][1] - 2, "direction": 90})
    assert r.json()["projet"]["images"][0]["numero"] == 3
    assert c.post(f"/api/projets/{d}/images", files={"fichier": ("x.heic", b"....")}, data={"piece": "PCMI7"}).status_code == 400
    c.post(f"/api/projets/{d}/images", files={"fichier": ("insertion.png", image_png(800, 400))}, data={"piece": "PCMI6"})
    # le jeu complet : garde, masse, coupes, notice, façades, toiture, insertion, photos, RDC
    r = c.post(f"/api/projets/{d}/pieces-graphiques", json={"pieces": []}).json()
    doc = pymupdf.open(stream=c.get(f"/api/projets/{d}/fichiers/{r['fichier']}").content)
    t = [pg.get_text() for pg in doc]
    assert len(doc) == 9
    assert "PLAN DE MASSE" in t[1] and "conforme" in t[1]
    assert "Terrain en herbe, sans arbre." in t[3] and "zone UB du PLU" in t[3]
    assert "INSERTION" in t[6]
    assert "Prise de vue n° 3 – depuis la rue" in t[7] and "Repérage des prises de vue" in t[7]
    # retirer une image : le fichier reste dans le dossier du projet
    r = c.post(f"/api/projets/{d}/images/{im['id']}", json={"supprimer": True})
    assert all(i["id"] != im["id"] for i in r.json()["projet"]["images"])
    assert (tmp / "projets" / d / im["fichier"]).exists()
