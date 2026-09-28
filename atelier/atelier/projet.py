"""Un projet sur le disque, selon l'arborescence convenue :

    projets/<AAAA>-<NOM>/
      00_entrees/         documents déposés (jamais modifiés)
      01_modele/          modèle JSON + versions/ + journal
      02_reglementation/  fiches de règles, sources, contrôles
      03_analyse/         note réglementaire, note des risques
      04_pieces/<indice>/ pièces PCMI (PDF, DXF)
      05_etage/           propositions d'étage (sur demande seulement)
      06_depot/           jeu final et bordereau

Chaque enregistrement valide le modèle, incrémente sa version, en garde
une copie datée dans 01_modele/versions/ et l'inscrit à l'historique.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import unicodedata
from datetime import date
from pathlib import Path

from .modele import Decision, Modification, POINTS_ARRET, PointArret, Projet, maintenant

SOUS_DOSSIERS = ["00_entrees", "01_modele", "02_reglementation", "03_analyse", "04_pieces", "05_etage", "06_depot"]


def racine_par_defaut() -> Path:
    """Dossier des projets : variable CP_ATELIER_PROJETS, sinon ~/CP Constructions/Atelier/projets.
    Le placer dans le dossier Google Drive du Mac en fait une copie sur le Drive."""
    return Path(os.environ.get("CP_ATELIER_PROJETS") or Path.home() / "CP Constructions" / "Atelier" / "projets")


def nom_de_dossier(nom: str, annee: int | None = None) -> str:
    s = unicodedata.normalize("NFD", nom).encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").upper() or "PROJET"
    return f"{annee or date.today().year}-{s}"


def creer_projet(racine: Path, nom: str, **infos) -> tuple[Path, Projet]:
    dossier = Path(racine) / nom_de_dossier(nom)
    if (dossier / "01_modele" / "modele.json").exists():
        raise FileExistsError(f"Le projet existe déjà : {dossier}")
    for s in SOUS_DOSSIERS:
        (dossier / s).mkdir(parents=True, exist_ok=True)
    (dossier / "01_modele" / "versions").mkdir(exist_ok=True)
    projet = Projet(id=dossier.name, nom=nom, **infos)
    projet.journal.append(Decision(sujet="Niveaux", choix="Plain-pied",
                                   motif="Réglage par défaut : un étage n'est étudié que sur demande (module B).",
                                   genre="defaut-prudent"))
    projet = enregistrer(dossier, projet, "Création du projet")
    return dossier, projet


def enregistrer(dossier: Path, projet: Projet, motif: str) -> Projet:
    """Valide puis écrit le modèle ; garde la version précédente (R7)."""
    projet = Projet.model_validate(projet.model_dump())   # validation à chaque écriture
    projet.version += 1
    projet.historique.append(Modification(indice=projet.indice, motif=motif, version=projet.version))
    modele = Path(dossier) / "01_modele"
    texte = projet.model_dump_json(indent=2)
    (modele / "modele.json").write_text(texte, encoding="utf-8")
    horodatage = maintenant().replace(":", "-")
    (modele / "versions" / f"modele_v{projet.version:04d}_{horodatage}.json").write_text(texte, encoding="utf-8")
    return projet


def charger(dossier: Path) -> Projet:
    return Projet.model_validate_json((Path(dossier) / "01_modele" / "modele.json").read_text(encoding="utf-8"))


def lister(racine: Path) -> list[dict]:
    out = []
    for d in sorted(Path(racine).glob("*/01_modele/modele.json")):
        try:
            p = Projet.model_validate_json(d.read_text(encoding="utf-8"))
            out.append({"dossier": d.parent.parent.name, "nom": p.nom, "indice": p.indice, "version": p.version,
                        "adresse": p.adresse, "points_arret": {k: v.valide for k, v in p.points_arret.items()}})
        except Exception as e:  # un modèle illisible est signalé, jamais ignoré en silence
            out.append({"dossier": d.parent.parent.name, "erreur": str(e)})
    return out


def deposer_document(dossier: Path, chemin_source: Path, nom: str | None = None) -> Path:
    """Copie un document dans 00_entrees/ sans jamais écraser un dépôt antérieur."""
    entrees = Path(dossier) / "00_entrees"
    nom = nom or Path(chemin_source).name
    cible = entrees / nom
    n = 2
    while cible.exists():
        cible = entrees / f"{Path(nom).stem}_{n}{Path(nom).suffix}"
        n += 1
    shutil.copy2(chemin_source, cible)
    return cible


def valider_point_arret(projet: Projet, cle: str, par: str, remarque: str = "") -> Projet:
    if cle not in POINTS_ARRET:
        raise KeyError(cle)
    projet.points_arret[cle] = PointArret(valide=True, le=maintenant(), par=par, remarque=remarque)
    projet.journal.append(Decision(sujet=POINTS_ARRET[cle], choix="Validé", motif=remarque, par=par, genre="point-arret"))
    return projet


# ce que chaque point d'arrêt couvre : une modification en amont l'invalide (R1)
DEPENDANCES = {"1_rdc": ["1_rdc", "2_implantation", "3_regles", "4_risques", "5_relecture"],
               "2_implantation": ["2_implantation", "4_risques", "5_relecture"],
               "3_regles": ["3_regles", "4_risques", "5_relecture"],
               "4_risques": ["4_risques", "5_relecture"],
               "5_relecture": ["5_relecture"]}


def invalider(projet: Projet, depuis: str, motif: str) -> Projet:
    for cle in DEPENDANCES[depuis]:
        if projet.points_arret[cle].valide:
            projet.points_arret[cle] = PointArret()
            projet.journal.append(Decision(sujet=POINTS_ARRET[cle], choix="Validation annulée", motif=motif,
                                           genre="point-arret"))
    return projet


def exporter_json(projet: Projet) -> str:
    return json.dumps(projet.model_dump(), ensure_ascii=False, indent=2)
