"""Produire le jeu de pièces graphiques en PDF et le ranger dans le projet.

Partagé par l'interface (« Générer le PDF ») et par le brouillon préparé depuis
le relevé de visite : un seul endroit écrit le fichier, sans jamais en écraser
un autre (chaque génération est un nouveau PDF dans 04_pieces/<indice>/)."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from . import reglages as R
from .modele import Decision, Projet
from .projet import enregistrer


def produire_pdf(racine: Path, dossier: Path, projet: Projet, quoi: list[str] | None, par: str = "",
                 motif: str = "") -> tuple[Projet, Path]:
    """Génère les pièces demandées (le jeu complet si `quoi` est vide) ; lève ValueError si une pièce demandée
    ne peut pas être produite (plan de masse sans terrain, seuil de 150 m²…)."""
    from .pieces_graphiques import ORDRE, generer
    quoi = [q for q in (quoi or []) if q in ORDRE] or None
    doc = generer(projet, R.lire(racine), quoi, dossier)
    cible_dossier = dossier / "04_pieces" / projet.indice
    cible_dossier.mkdir(parents=True, exist_ok=True)
    nomf = f"{datetime.now():%Y-%m-%d_%Hh%M}_{'jeu-complet' if not quoi else '-'.join(quoi)}.pdf"
    cible = cible_dossier / nomf
    n = 2
    while cible.exists():                  # jamais d'écrasement
        cible = cible_dossier / f"{Path(nomf).stem}_{n}.pdf"
        n += 1
    try:
        doc.subset_fonts()          # seuls les caractères utilisés : un PDF plus léger à déposer
    except Exception:
        pass
    doc.save(cible, garbage=4, deflate=True, deflate_fonts=True)   # police et logo une seule fois
    projet.journal.append(Decision(sujet="Pièces graphiques", choix=f"{cible.name} ({len(doc)} planche(s))",
                                   motif=motif, par=par))
    projet = enregistrer(dossier, projet, f"Pièces graphiques générées : {cible.name}")
    return projet, cible
