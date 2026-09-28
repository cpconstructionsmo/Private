"""Lecture d'un plan DXF (export AutoCAD, Archicad, Cedreo) avec ezdxf.

Les traits des murs viennent des LINE, LWPOLYLINE et POLYLINE de l'espace
objet, hors calques de cotation, de texte, de hachures et de mobilier (liste
réglable). Les portes et fenêtres viennent des blocs (INSERT) dont le nom
les désigne ; les noms et surfaces de pièces, des TEXT et MTEXT ; les cotes,
des DIMENSION. Les unités sont lues dans l'en-tête ($INSUNITS) ; à défaut,
elles sont déduites de l'étendue du dessin — et signalées comme hypothèse.
"""
from __future__ import annotations

import math
import re

import ezdxf
from ezdxf import bbox

from .geometrie import BlocOuverture, Cote, PlanBrut, Texte

CALQUES_EXCLUS = r"cot|dim|text|txt|hach|hatch|mob|ameub|furn|sanit|equip|axe|grille|cadre|cartouche|vp\b|defpoint"
RE_BLOC_OUVERTURE = r"porte|door|fen|window|chassis|baie|coulissant|garage|sectionn|\bpf\b|pf\d|oscillo"
UNITES = {1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1.0, 14: 0.1}


def lire_dxf(chemin: str, calques_exclus: str = CALQUES_EXCLUS) -> tuple[PlanBrut, list[str]]:
    doc = ezdxf.readfile(chemin)
    msp = doc.modelspace()
    notes: list[str] = []
    ins = doc.header.get("$INSUNITS", 0)
    if ins in UNITES:
        k = UNITES[ins]
    else:
        ext = bbox.extents(msp, fast=True)
        taille = max(ext.size.x, ext.size.y) if ext.has_data else 0
        k = 0.001 if taille > 1000 else (0.01 if taille > 100 else 1.0)
        notes.append(f"⚠️ Unités absentes de l'en-tête du DXF : déduites de l'étendue du dessin (1 unité = {k} m). "
                     "À confirmer sur une cote connue : si c'est faux, toutes les surfaces sont fausses.")
    exclus = re.compile(calques_exclus, re.I)
    segments = []

    def ajoute(p, q):
        segments.append(((p[0] * k, p[1] * k), (q[0] * k, q[1] * k)))

    for e in msp:
        calque = e.dxf.get("layer", "0")
        t = e.dxftype()
        if t in ("LINE", "LWPOLYLINE", "POLYLINE") and exclus.search(calque):
            continue
        if t == "LINE":
            ajoute(e.dxf.start, e.dxf.end)
        elif t == "LWPOLYLINE":
            pts = [(p[0], p[1]) for p in e.get_points("xy")]
            for a, b in zip(pts, pts[1:] + ([pts[0]] if e.closed else [])):
                ajoute(a, b)
        elif t == "POLYLINE":
            pts = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]
            for a, b in zip(pts, pts[1:] + ([pts[0]] if e.is_closed else [])):
                ajoute(a, b)

    textes = []
    for e in msp.query("TEXT MTEXT"):
        if e.dxftype() == "TEXT":
            txt, p = e.dxf.text, e.dxf.insert
        else:
            txt, p = e.plain_text(), e.dxf.insert
        # le point d'insertion est un coin : on vise le milieu approximatif
        textes.append(Texte(texte=" ".join(txt.split()), x=p.x * k, y=p.y * k))
    # regrouper en une ligne les textes superposés d'une même pièce (nom + surface)
    textes = _regrouper(textes)

    blocs = []
    for e in msp.query("INSERT"):
        if not re.search(RE_BLOC_OUVERTURE, e.dxf.name, re.I):
            continue
        b = bbox.extents([e], fast=True)
        if not b.has_data:
            continue
        largeur = max(b.size.x, b.size.y) * k
        blocs.append(BlocOuverture(nom=e.dxf.name, x=b.center.x * k, y=b.center.y * k, largeur=largeur))

    cotes = []
    for d in msp.query("DIMENSION"):
        try:
            p1, p2 = d.dxf.defpoint2, d.dxf.defpoint3
            ligne_pt = d.dxf.defpoint
        except Exception:
            continue
        ang = math.radians(d.dxf.get("angle", 0.0) or 0.0)
        horiz = abs(math.cos(ang)) > 0.7
        mesure = abs((p2.x - p1.x) if horiz else (p2.y - p1.y)) * k
        texte = d.dxf.get("text", "") or ""
        texte = "" if texte in ("<>", " ") else texte
        cotes.append(Cote(mesure=mesure, texte=texte, p1=(p1.x * k, p1.y * k), p2=(p2.x * k, p2.y * k),
                          horizontale=horiz, ligne=(ligne_pt.y if horiz else ligne_pt.x) * k))
    return PlanBrut(segments=segments, textes=textes, blocs=blocs, cotes=cotes, origine=chemin.split("/")[-1]), notes


def _regrouper(textes: list[Texte], d=0.6) -> list[Texte]:
    out: list[Texte] = []
    for t in sorted(textes, key=lambda t: (-t.y, t.x)):
        for o in out:
            if abs(o.x - t.x) < 1.5 and 0 <= o.y - t.y < d:
                o.texte = f"{o.texte} {t.texte}"
                break
        else:
            out.append(Texte(texte=t.texte, x=t.x, y=t.y))
    return out
