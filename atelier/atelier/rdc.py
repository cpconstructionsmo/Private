"""Import d'un RDC dans un projet : lecture du plan, reconstitution, écarts,
surfaces, contrôle du seuil de 150 m². Un nouvel import annule la validation
du RDC et de tout ce qui en dépend (R1)."""
from __future__ import annotations

from pathlib import Path

from .geometrie import reconstituer
from .import_dxf import lire_dxf
from .import_pdf import lire_pdf, pages_du_pdf
from .modele import Decision, Projet
from .projet import invalider
from .surfaces import calculer, seuil_architecte


def page_du_plan(chemin: str) -> int:
    """La page qui porte le plan du RDC : parmi les pages dessinées, celle qui
    écrit le plus de surfaces de pièces (« SH : 12,91 m² »), puis qui parle
    du plan du rez-de-chaussée, puis qui porte une échelle."""
    pages = [p for p in pages_du_pdf(chemin) if p["traits"] > 0]
    if not pages:
        return 0
    return max(pages, key=lambda p: (p["surfaces"], p["plan_rdc"], bool(p["echelle"]), p["traits"]))["page"]


def importer_rdc(projet: Projet, chemin: str, echelle: float | None = None,
                 page: int | None = None) -> tuple[Projet, list[str]]:
    ext = Path(chemin).suffix.lower()
    if ext == ".dxf":
        brut, notes = lire_dxf(chemin)
    elif ext == ".pdf":
        if page is None:
            page = page_du_plan(chemin)
        brut, notes = lire_pdf(chemin, echelle, page=page)
        notes.insert(0, f"Plan lu en page {page + 1} du PDF.")
    elif ext == ".dwg":
        raise ValueError("Un DWG ne se lit pas directement : exportez-le en DXF depuis AutoCAD ou Archicad "
                         "(Fichier › Enregistrer sous › DXF), ou en PDF vectoriel.")
    else:
        raise ValueError("Formats acceptés pour le RDC : DXF ou PDF vectoriel.")
    res = reconstituer(brut)
    projet.batiment.niveaux = [res.niveau]
    projet.source_rdc = {"fichier": Path(chemin).name, "segments": [list(map(list, s)) for s in brut.segments],
                         "textes": [{"texte": t.texte, "x": t.x, "y": t.y} for t in brut.textes],
                         "fermetures": [list(map(list, s)) for s in res.fermetures], "notes": notes}
    projet.ecarts_rdc = res.ecarts
    projet.journal.append(Decision(sujet="Import du RDC", choix=Path(chemin).name,
                                   motif=f"{len(res.niveau.pieces)} pièces, {len(res.niveau.murs)} murs, "
                                         f"{len(res.niveau.ouvertures)} ouvertures ; {len(res.ecarts)} écart(s)"))
    invalider(projet, "1_rdc", "nouvel import du RDC")
    return projet, notes


def bilan_surfaces(projet: Projet) -> dict:
    if not projet.batiment.niveaux:
        return {}
    valide = projet.points_arret["1_rdc"].valide
    s = calculer(projet.batiment.niveaux[0], valide)
    total = sum(calculer(n, valide)["surface_plancher"]["valeur"].valeur for n in projet.batiment.niveaux)
    s["seuil_architecte"] = seuil_architecte(total)
    return s
