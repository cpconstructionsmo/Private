"""Réglages du cabinet, propres à ce Mac : ils ne sont jamais dans le dépôt.

Rangés à côté des projets (reglages_atelier.json) : nom de la société, nom
du dessinateur (« Dessiné par »), logos du cartouche. Le logo de CP
Constructions est fourni avec l'atelier ; tout autre logo (RE2020…) est un
fichier choisi par l'utilisateur, copié dans le dossier des projets.
"""
from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel

LOGO_CP = Path(__file__).parent / "modeles" / "logo_cp.png"
FICHIER = "reglages_atelier.json"


class Reglages(BaseModel):
    societe: str = "CP Constructions"
    adresse_societe: str = ""
    telephone: str = ""
    email: str = ""
    siren: str = ""
    tva: str = ""
    mention_propriete: str = ("Ces plans sont la propriété exclusive de la société. Il est interdit de les "
                              "communiquer ou d'en faire usage sans son autorisation.")
    dessinateur: str = ""
    logo: str = ""            # chemin d'un logo choisi ; vide = logo CP fourni
    logo_re2020: str = ""     # vide = case laissée vide dans le cartouche

    def chemin_logo(self) -> Path | None:
        p = Path(self.logo) if self.logo else LOGO_CP
        return p if p.exists() else None

    def chemin_logo_re2020(self) -> Path | None:
        p = Path(self.logo_re2020) if self.logo_re2020 else None
        return p if p and p.exists() else None


def lire(racine: Path) -> Reglages:
    f = Path(racine) / FICHIER
    if f.exists():
        try:
            return Reglages.model_validate_json(f.read_text(encoding="utf-8"))
        except Exception:
            pass
    return Reglages()


def ecrire(racine: Path, r: Reglages) -> Reglages:
    (Path(racine) / FICHIER).write_text(r.model_dump_json(indent=2), encoding="utf-8")
    return r
