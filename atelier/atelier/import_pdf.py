"""Lecture d'un plan en PDF vectoriel (export AutoCAD, Archicad, Cedreo) avec
PyMuPDF.

Un PDF n'a pas de calques : les murs se distinguent par l'épaisseur de leur
trait, plus forte que celle des cotes, du mobilier et des hachures. On
retient les traits d'épaisseur au moins égale au seuil choisi (par défaut,
l'épaisseur la plus forte présente sur la page de façon répétée).
L'échelle (1/50, 1/100…) est indiquée par l'utilisateur ; elle se vérifie
ensuite sur une cote connue. Un PDF scanné (sans traits) est refusé ici :
il relève de la vectorisation assistée, avec validation manuelle.
"""
from __future__ import annotations

from collections import Counter

import pymupdf

from .geometrie import PlanBrut, Texte
from .import_dxf import _regrouper

PT_EN_M = 0.0254 / 72   # un point PDF sur le papier, en mètres


def lire_pdf(chemin: str, echelle: float, page: int = 0, epaisseur_min: float | None = None) -> tuple[PlanBrut, list[str]]:
    doc = pymupdf.open(chemin)
    pg = doc[page]
    k = PT_EN_M * echelle
    H = pg.rect.height
    notes = [f"⚠️ Échelle du plan indiquée : 1/{int(echelle)}. À vérifier sur une cote connue : si elle est fausse, "
             "toutes les dimensions et surfaces sont fausses."]
    dessins = pg.get_drawings()
    if not dessins:
        raise ValueError("Ce PDF ne contient aucun trait : c'est sans doute un scan. Il faut un PDF vectoriel "
                         "(export du logiciel de dessin), ou la vectorisation assistée d'une image.")
    # un même tracé peut regrouper tous les murs : on compte les traits, pas les tracés
    largeurs = Counter()
    for d in dessins:
        if d.get("width"):
            largeurs[round(d["width"], 2)] += len(d["items"])
    if epaisseur_min is None:
        repetees = [w for w, n in largeurs.items() if n >= 4]
        epaisseur_min = max(repetees) if repetees else 0
        notes.append(f"⚠️ Traits des murs : épaisseur ≥ {epaisseur_min} pt retenue (la plus forte, répétée). "
                     "Si des murs sont dessinés plus fin, ils manqueront à l'interprétation.")
    segments = []

    def pt(p):
        return (p.x * k, (H - p.y) * k)   # le PDF compte les y vers le bas

    for d in dessins:
        if (d.get("width") or 0) + 1e-6 < epaisseur_min:
            continue
        for it in d["items"]:
            if it[0] == "l":
                segments.append((pt(it[1]), pt(it[2])))
            elif it[0] == "re":
                r = it[1]
                c = [r.tl, r.tr, r.br, r.bl]
                for a, b in zip(c, c[1:] + c[:1]):
                    segments.append((pt(a), pt(b)))
            elif it[0] == "qu":
                q = it[1]
                c = [q.ul, q.ur, q.lr, q.ll]
                for a, b in zip(c, c[1:] + c[:1]):
                    segments.append((pt(a), pt(b)))
    textes = []
    for bloc in pg.get_text("dict")["blocks"]:
        for ligne in bloc.get("lines", []):
            t = " ".join(s["text"] for s in ligne["spans"]).strip()
            if not t:
                continue
            x0, y0, x1, y1 = ligne["bbox"]
            textes.append(Texte(texte=t, x=(x0 + x1) / 2 * k, y=(H - (y0 + y1) / 2) * k))
    return PlanBrut(segments=segments, textes=_regrouper(textes), origine=chemin.split("/")[-1]), notes
