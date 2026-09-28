"""Le serveur local de l'atelier : il n'écoute que sur ce Mac (127.0.0.1) et
sert l'interface (atelier/statiques/) et son API.

Aucun plan ni aucune donnée ne part d'ici (R10) : les projets restent dans
le dossier des projets (voir projet.racine_par_defaut) ; s'il est placé dans
le dossier Google Drive du Mac, Drive en garde une copie.

Chaque modification passe par ``enregistrer`` : le modèle est validé, sa
version incrémentée et la version précédente conservée (R7). Toute
correction du RDC interprété annule la validation du point d'arrêt n° 1 et
de ce qui en dépend (R1, R6).
"""
from __future__ import annotations

import re
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import __version__
from .geometrie import usage_de
from .modele import Decision, Document, POINTS_ARRET, Projet
from .projet import (charger, creer_projet, deposer_document, enregistrer, exporter_json, invalider,
                     lister, racine_par_defaut, valider_point_arret)
from .rdc import bilan_surfaces, importer_rdc

STATIQUES = Path(__file__).parent / "statiques"
USAGES_POSSIBLES = ["sejour", "chambre", "eau", "circulation", "rangement", "garage", "technique", "exterieur", "autre"]
TYPES_NIVEAUX = {"plain-pied": "Plain-pied", "etage": "Avec étage", "combles-amenages": "Combles aménagés"}


# corps des requêtes
class NouveauProjet(BaseModel):
    nom: str
    maitre_ouvrage: str = ""
    adresse: str = ""
    parcelles: list[str] = []
    numero_dossier: str = ""


class Correction(BaseModel):
    nom: str | None = None
    usage: str | None = None
    exclue_habitable: bool | None = None
    motif_exclusion: str | None = None
    ecarter: bool = False
    par: str = ""


class Validation(BaseModel):
    par: str
    remarque: str = ""


class Niveaux(BaseModel):
    type_niveaux: str
    par: str = ""
    motif: str = ""


class NouvelleDecision(BaseModel):
    sujet: str
    choix: str
    motif: str = ""
    par: str = ""


def creer_app(racine: Path | None = None) -> FastAPI:
    racine = Path(racine or racine_par_defaut())
    racine.mkdir(parents=True, exist_ok=True)
    app = FastAPI(title="Atelier de conception — CP Constructions", version=__version__)

    def dossier_de(nom: str) -> Path:
        # seul un nom de dossier simple est accepté : jamais de chemin hors du dossier des projets
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", nom or ""):
            raise HTTPException(400, "Nom de dossier de projet invalide.")
        d = racine / nom
        if not (d / "01_modele" / "modele.json").exists():
            raise HTTPException(404, f"Projet introuvable : {nom}")
        return d

    def etat(d: Path, p: Projet) -> dict:
        return jsonable_encoder({"dossier": d.name, "chemin": str(d), "projet": p, "surfaces": bilan_surfaces(p),
                                 "points_arret_libelles": POINTS_ARRET, "usages": USAGES_POSSIBLES,
                                 "types_niveaux": TYPES_NIVEAUX})

    @app.get("/api/etat")
    def api_etat():
        return {"version": __version__, "racine": str(racine)}

    @app.get("/api/projets")
    def api_projets():
        return lister(racine)

    @app.post("/api/projets")
    def api_creer(n: NouveauProjet):
        if not n.nom.strip():
            raise HTTPException(400, "Donnez un nom au projet.")
        try:
            d, p = creer_projet(racine, n.nom.strip(), maitre_ouvrage=n.maitre_ouvrage, adresse=n.adresse,
                                parcelles=[x.strip() for x in n.parcelles if x.strip()], numero_dossier=n.numero_dossier)
        except FileExistsError as e:
            raise HTTPException(409, str(e))
        return etat(d, p)

    @app.get("/api/projets/{nom}")
    def api_projet(nom: str):
        d = dossier_de(nom)
        return etat(d, charger(d))

    @app.post("/api/projets/{nom}/rdc")
    async def api_rdc(nom: str, fichier: UploadFile = File(...), echelle: str = Form("")):
        d = dossier_de(nom)
        p = charger(d)
        ext = Path(fichier.filename or "").suffix.lower()
        if ext not in (".dxf", ".pdf", ".dwg"):
            raise HTTPException(400, "Formats acceptés pour le RDC : DXF ou PDF vectoriel.")
        try:
            ech = float(echelle.replace(",", ".").replace("1/", "")) if echelle.strip() else None
        except ValueError:
            raise HTTPException(400, "Échelle illisible : indiquez par exemple 100 pour 1/100.")
        if ext == ".pdf" and not ech:
            raise HTTPException(400, "Indiquez l'échelle du plan PDF (par exemple 100 pour 1/100).")
        # le fichier reçu est conservé tel quel dans 00_entrees (jamais écrasé) ;
        # s'il ne peut pas être lu, cette copie est retirée
        with tempfile.TemporaryDirectory() as tmp:
            t = Path(tmp) / Path(fichier.filename).name
            t.write_bytes(await fichier.read())
            depot = deposer_document(d, t)
        try:
            p, notes = importer_rdc(p, str(depot), echelle=ech)
        except Exception as e:
            depot.unlink(missing_ok=True)
            raise HTTPException(400, f"Le plan n'a pas pu être lu : {e}")
        p.documents.append(Document(fichier=f"00_entrees/{depot.name}", type="plan du rez-de-chaussée",
                                    source="déposé dans l'atelier"))
        p = enregistrer(d, p, f"Import du RDC ({depot.name})")
        return etat(d, p)

    @app.post("/api/projets/{nom}/pieces/{piece_id}")
    def api_piece(nom: str, piece_id: str, c: Correction):
        d = dossier_de(nom)
        p = charger(d)
        if not p.batiment.niveaux:
            raise HTTPException(400, "Aucun RDC importé.")
        n = p.batiment.niveaux[0]
        piece = next((x for x in n.pieces if x.id == piece_id), None)
        if not piece:
            raise HTTPException(404, "Pièce introuvable.")
        avant = piece.nom
        if c.ecarter:
            n.pieces = [x for x in n.pieces if x.id != piece_id]
            detail = f"« {avant} » écartée ({piece.surface_calculee:.2f} m²) : ce n'est pas une pièce"
        else:
            changes = []
            if c.nom is not None and c.nom.strip() and c.nom.strip() != piece.nom:
                piece.nom = c.nom.strip()
                changes.append(f"renommée « {piece.nom} »")
                if c.usage is None:   # le nouveau nom propose un usage, qui reste modifiable
                    u, h, e = usage_de(piece.nom)
                    if u != "autre":
                        piece.usage, piece.humide = u, h
                        piece.exclue_habitable = e
            if c.usage is not None and c.usage != piece.usage:
                if c.usage not in USAGES_POSSIBLES:
                    raise HTTPException(400, "Usage inconnu.")
                piece.usage = c.usage
                piece.humide = usage_de(piece.nom)[1] if c.usage != "eau" else True
                changes.append(f"usage « {c.usage} »")
            if c.exclue_habitable is not None and c.exclue_habitable != piece.exclue_habitable:
                piece.exclue_habitable = c.exclue_habitable
                changes.append("exclue de la surface habitable" if c.exclue_habitable else "comptée dans la surface habitable")
            if c.motif_exclusion is not None:
                piece.motif_exclusion = c.motif_exclusion
            if not changes:
                return etat(d, p)
            detail = f"« {avant} » : " + ", ".join(changes)
        # l'écart « pièce sans nom » est réglé dès que la pièce est nommée ou écartée
        p.ecarts_rdc = [e for e in p.ecarts_rdc
                        if not (e.get("genre") == "piece-sans-nom" and e.get("piece") == avant)]
        p.journal.append(Decision(sujet="Correction du RDC interprété", choix=detail, par=c.par))
        invalider(p, "1_rdc", "correction du RDC interprété")
        p = enregistrer(d, p, f"Correction du RDC : {detail}")
        return etat(d, p)

    @app.post("/api/projets/{nom}/points/{cle}")
    def api_point(nom: str, cle: str, v: Validation):
        d = dossier_de(nom)
        p = charger(d)
        if cle not in POINTS_ARRET:
            raise HTTPException(404, "Point d'arrêt inconnu.")
        if not v.par.strip():
            raise HTTPException(400, "Indiquez qui valide.")
        if cle == "1_rdc" and not p.batiment.niveaux:
            raise HTTPException(400, "Importez d'abord le plan du RDC.")
        cles = list(POINTS_ARRET)
        avant = [k for k in cles[:cles.index(cle)] if not p.points_arret[k].valide]
        if avant:
            raise HTTPException(400, "Validez d'abord : " + ", ".join(POINTS_ARRET[k] for k in avant) + ".")
        valider_point_arret(p, cle, par=v.par.strip(), remarque=v.remarque)
        p = enregistrer(d, p, f"Point d'arrêt : {POINTS_ARRET[cle]}")
        return etat(d, p)

    @app.post("/api/projets/{nom}/niveaux")
    def api_niveaux(nom: str, n: Niveaux):
        d = dossier_de(nom)
        p = charger(d)
        if n.type_niveaux not in TYPES_NIVEAUX:
            raise HTTPException(400, "Type de niveaux inconnu.")
        if n.type_niveaux == p.batiment.type_niveaux:
            return etat(d, p)
        p.batiment.type_niveaux = n.type_niveaux
        p.journal.append(Decision(sujet="Niveaux", choix=TYPES_NIVEAUX[n.type_niveaux], motif=n.motif, par=n.par))
        p = enregistrer(d, p, f"Niveaux : {TYPES_NIVEAUX[n.type_niveaux]}")
        return etat(d, p)

    @app.post("/api/projets/{nom}/journal")
    def api_journal(nom: str, x: NouvelleDecision):
        d = dossier_de(nom)
        p = charger(d)
        if not x.sujet.strip() or not x.choix.strip():
            raise HTTPException(400, "Indiquez le sujet et la décision.")
        p.journal.append(Decision(sujet=x.sujet.strip(), choix=x.choix.strip(), motif=x.motif, par=x.par))
        p = enregistrer(d, p, f"Journal : {x.sujet.strip()}")
        return etat(d, p)

    @app.get("/api/projets/{nom}/export.json")
    def api_export(nom: str):
        d = dossier_de(nom)
        return PlainTextResponse(exporter_json(charger(d)), media_type="application/json",
                                 headers={"Content-Disposition": f'attachment; filename="{d.name}-modele.json"'})

    @app.get("/")
    def accueil():
        return FileResponse(STATIQUES / "index.html")

    app.mount("/statiques", StaticFiles(directory=STATIQUES), name="statiques")
    return app


def main():
    import argparse
    import threading
    import webbrowser

    import uvicorn

    a = argparse.ArgumentParser(description="Atelier de conception CP Constructions (serveur local)")
    a.add_argument("--port", type=int, default=8765)
    a.add_argument("--projets", help="dossier des projets (sinon CP_ATELIER_PROJETS, sinon ~/CP Constructions/Atelier/projets)")
    a.add_argument("--sans-navigateur", action="store_true")
    o = a.parse_args()
    app = creer_app(Path(o.projets) if o.projets else None)
    url = f"http://127.0.0.1:{o.port}/"
    if not o.sans_navigateur:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    print(f"Atelier ouvert sur {url} — fermez cette fenêtre pour l'arrêter.")
    uvicorn.run(app, host="127.0.0.1", port=o.port, log_level="warning")


if __name__ == "__main__":
    main()
