"""Pièces graphiques tirées du modèle : page de garde, coupes, façades,
plan de toiture, plan du RDC. On relit le PDF produit."""
import sys
from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import cas_fictif as C
from atelier.modele import confirme
from atelier.pieces_graphiques import generer
from atelier.projet import creer_projet
from atelier.rdc import importer_rdc
from atelier.reglages import Reglages
from atelier.serveur import creer_app


@pytest.fixture
def projet(tmp_path):
    d, p = creer_projet(tmp_path, "Maison fictive", maitre_ouvrage="M. et Mme EXEMPLE",
                        adresse="1 rue d'Essai 00000 Nulle-part", parcelles=["AB 1"])
    f = tmp_path / "jeu.pdf"
    C.ecrire_pdf_aplats(str(f))
    p, _ = importer_rdc(p, str(f))
    return d, p


def textes(doc):
    return [pg.get_text() for pg in doc]


def test_jeu_complet(projet):
    d, p = projet
    doc = generer(p, Reglages(dessinateur="Prénom NOM"))
    t = textes(doc)
    assert len(doc) == 5
    assert "PLAN DE PERMIS DE CONSTRUIRE" in t[0] and "TABLEAU DES SURFACES" in t[0] and "RÉSUMÉ DU PROJET" in t[0]
    assert "68,98" in t[0]                                   # surface habitable du cas fictif
    assert "COUPE A–A" in t[1] and "COUPE B–B" in t[1] and "Vide sanitaire" in t[1]
    assert "FAÇADE" in t[2] and "1,80 × 2,15" in t[2]
    assert "PLAN DE TOITURE" in t[3] and "Faîtage +" in t[3]
    assert "PLAN DU REZ-DE-CHAUSSÉE" in t[4] and "12,00" in t[4] and "Séjour - cuisine" in t[4]
    # cartouche : sur chaque planche sauf la page de garde
    for x in t[1:]:
        assert "Construction de" in x and "M. et Mme EXEMPLE" in x and "Prénom NOM" in x and "Format : A3" in x
    # tant que les valeurs sont supposées, elles sont rappelées en rouge
    assert all("À CONFIRMER AVANT DÉPÔT" in x for x in t[1:])
    assert "pente de toiture" in t[3]


def test_hypotheses_levees(projet):
    d, p = projet
    v = p.batiment.volumetrie
    src = dict(document="saisie (essai)")
    for cle, val, u in (("hauteur_egout", 2.8, "m"), ("hauteur_arase", 2.7, "m"), ("pente_toiture", 35.0, "°"),
                        ("debord_toiture", 0.3, "m"), ("vide_sanitaire", 0.6, "m"), ("terrain_fini", -0.15, "m"),
                        ("nord", 90.0, "°")):
        setattr(v, cle, confirme(val, u, **src))
    v.couverture = "Tuiles terre cuite"
    t = textes(generer(p, Reglages(dessinateur="Prénom NOM"), ["plan_toiture", "facades"]))
    assert "valeur supposée" not in t[0] and "valeur supposée" not in t[1]


def test_generation_par_l_api(tmp_path):
    c = TestClient(creer_app(tmp_path / "projets"))
    d = c.post("/api/projets", json={"nom": "Maison fictive"}).json()["dossier"]
    C.ecrire_pdf_aplats(str(tmp_path / "jeu.pdf"))
    r = c.post(f"/api/projets/{d}/rdc", files={"fichier": ("jeu.pdf", (tmp_path / "jeu.pdf").read_bytes())})
    assert r.status_code == 200, r.text
    # volumétrie saisie : valeurs confirmées, inscrites au journal
    r = c.post(f"/api/projets/{d}/volumetrie", json={"valeurs": {"hauteur_egout": "2,82", "couverture": "Ardoise"},
                                                    "par": "Essai"})
    e = r.json()
    assert e["projet"]["batiment"]["volumetrie"]["hauteur_egout"]["statut"] == "confirme"
    assert e["projet"]["batiment"]["volumetrie"]["hauteur_egout"]["valeur"] == 2.82
    assert e["toiture"]["faitages"]
    assert c.post(f"/api/projets/{d}/volumetrie", json={"valeurs": {"inconnu": 1}}).status_code == 400
    # cartouche
    r = c.post(f"/api/projets/{d}/infos", json={"surface_terrain": 812.5, "zone_sismique": "1",
                                               "modifications": [{"date": "01/10/2026", "objet": "Dépôt initial"}]})
    assert r.json()["projet"]["surface_terrain"]["valeur"] == 812.5
    # baie saisie à la main
    baie = next(o for o in r.json()["projet"]["batiment"]["niveaux"][0]["ouvertures"] if o["exterieure"])
    r = c.post(f"/api/projets/{d}/ouvertures/{baie['id']}", json={"hauteur": 1.35, "allege": 0.9, "menuiserie": "pleine"})
    o = next(o for o in r.json()["projet"]["batiment"]["niveaux"][0]["ouvertures"] if o["id"] == baie["id"])
    assert o["hauteur"]["statut"] == "confirme" and o["menuiserie"] == "pleine"
    # génération : un nouveau fichier à chaque fois, jamais écrasé
    r1 = c.post(f"/api/projets/{d}/pieces-graphiques", json={"pieces": ["plan_rdc"]}).json()
    r2 = c.post(f"/api/projets/{d}/pieces-graphiques", json={"pieces": ["plan_rdc"]}).json()
    assert r1["fichier"] != r2["fichier"] and r1["fichier"].startswith("04_pieces/A/")
    pdf = c.get(f"/api/projets/{d}/fichiers/{r1['fichier']}")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    assert "Page de garde" not in pymupdf.open(stream=pdf.content).load_page(0).get_text()
    assert c.get(f"/api/projets/{d}/fichiers/../../../etc/passwd").status_code == 404
    assert c.get(f"/api/projets/{d}/fichiers/01_modele%2F..%2F..%2Fx").status_code == 404
    # réglages du cabinet
    r = c.post("/api/reglages", json={"dessinateur": "Prénom NOM", "logo": "/etc/passwd"}).json()
    assert r["dessinateur"] == "Prénom NOM" and r["logo"] == ""
