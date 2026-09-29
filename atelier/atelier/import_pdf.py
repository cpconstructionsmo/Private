"""Lecture d'un plan en PDF vectoriel (export AutoCAD, Archicad, Cedreo…) avec
PyMuPDF.

Un PDF n'a pas de calques. Deux façons de dessiner les murs s'y rencontrent :
- **en aplats** : maçonnerie, doublage et cloisons sont des surfaces remplies
  (gris, crème…) — c'est le cas le plus courant des plans de permis ;
- **en traits** : les murs sont des traits plus épais que ceux des cotes, du
  mobilier et des hachures.
L'import cherche d'abord les aplats qui forment des murs : les couleurs dont
les surfaces sont minces (épaisseur moyenne de mur) et qui se touchent entre
elles. À défaut, il retient les traits les plus épais. Le choix fait est
toujours indiqué, avec la façon de le corriger.

L'échelle (1/50, 1/75, 1/100…) est indiquée par l'utilisateur ou lue sur la
page (« Échelle 1/75 ») ; elle est contrôlée sur la plus grande cote écrite.
Un PDF scanné (sans traits) est refusé ici : il relève de la vectorisation
assistée, avec validation manuelle.
"""
from __future__ import annotations

import math
import re
from collections import Counter, defaultdict

import pymupdf
from shapely.geometry import Polygon
from shapely.ops import unary_union

from .geometrie import PlanBrut, Texte

PT_EN_M = 0.0254 / 72   # un point PDF sur le papier, en mètres
RE_ECHELLE = re.compile(r"[ÉE]chelle\s*:?\s*1\s*/\s*(\d{2,3})", re.I)
RE_COTE = re.compile(r"^\s*(\d{1,2}[.,]\d{2})\s*$")


def pages_du_pdf(chemin: str) -> list[dict]:
    """Résumé de chaque page, pour choisir celle qui porte le plan."""
    doc = pymupdf.open(chemin)
    out = []
    for i, pg in enumerate(doc):
        t = pg.get_text()
        m = RE_ECHELLE.search(t)
        titre = next((l.strip() for l in t.splitlines() if re.search(r"plan|rez|rdc|niveau", l, re.I)), "")
        plan_rdc = bool(re.search(r"plan\s+(du\s+|de\s+)?(rez|r\.?d\.?c)", t, re.I))
        out.append({"page": i, "traits": len(pg.get_drawings()), "images": len(pg.get_images()),
                    "echelle": int(m.group(1)) if m else None, "titre": titre[:80], "plan_rdc": plan_rdc,
                    "surfaces": len(re.findall(r"m\s*[²2]", t))})
    return out


def echelle_lue(chemin: str, page: int = 0) -> int | None:
    m = RE_ECHELLE.search(pymupdf.open(chemin)[page].get_text())
    return int(m.group(1)) if m else None


def _anneaux(items) -> list[list[tuple[float, float]]]:
    """Les contours fermés d'un tracé (suite de segments, rectangles, quadrilatères)."""
    anneaux, courant = [], []

    def clore():
        nonlocal courant
        if len(courant) >= 3:
            anneaux.append(courant)
        courant = []

    for it in items:
        if it[0] == "re":
            clore()
            r = it[1]
            anneaux.append([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)])
        elif it[0] == "qu":
            clore()
            q = it[1]
            anneaux.append([(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)])
        elif it[0] in ("l", "c"):
            a, b = it[1], it[-1]
            if courant and math.dist(courant[-1], (a.x, a.y)) > 0.05:
                clore()
            if not courant:
                courant.append((a.x, a.y))
            courant.append((b.x, b.y))
    clore()
    return anneaux


def _surface_du_trace(dr) -> Polygon:
    """Surface remplie d'un tracé, en tenant compte de la règle de remplissage
    (pair-impair, ou enroulement : un contour tourné en sens inverse dans un
    autre est un trou)."""
    polys = []
    for a in _anneaux(dr["items"]):
        p = Polygon(a)
        if p.area < 1e-6:
            continue
        signe = 1 if p.exterior.is_ccw else -1
        polys.append((p.buffer(0), signe))
    if not polys:
        return Polygon()
    if dr.get("even_odd"):
        g = Polygon()
        for p, _ in polys:
            g = g.symmetric_difference(p)
        return g
    polys.sort(key=lambda x: -x[0].area)
    g, sens = Polygon(), []
    for p, s in polys:
        conteneur = next((s0 for p0, s0 in sens if p0.contains(p.representative_point())), None)
        g = g.difference(p) if conteneur is not None and conteneur != s else g.union(p)
        sens.append((p, s))
    return g


def _murs_en_aplats(dessins, k: float, H: float):
    """Cherche les couleurs d'aplat qui dessinent des murs. Rend (surface des
    murs en mètres, couleurs retenues) ou (None, [])."""
    par_couleur = defaultdict(list)
    for dr in dessins:
        if dr["type"] not in ("f", "fs") or not dr.get("fill"):
            continue
        c = tuple(round(x, 3) for x in dr["fill"])
        if min(c) > 0.97 or max(c) < 0.05:      # blanc (vitrages, fonds) et noir (flèches, barres d'échelle)
            continue
        par_couleur[c].append(dr)

    def en_metres(g):
        from shapely import affinity
        g = affinity.scale(g, xfact=k, yfact=-k, origin=(0, 0))
        return affinity.translate(g, yoff=H * k)

    classes = {}
    for c, L in par_couleur.items():
        g = unary_union([_surface_du_trace(dr) for dr in L])
        g = en_metres(g)
        if g.is_empty or g.area < 0.5:
            continue
        morceaux = list(g.geoms) if hasattr(g, "geoms") else [g]
        fin = [2 * m.area / m.length for m in morceaux if m.length]
        epaisseur = sum(f * m.area for f, m in zip(fin, morceaux)) / g.area if g.area else 9
        if 0.02 <= epaisseur <= 0.60:
            classes[c] = g
    if not classes:
        return None, []
    # les murs : la couleur la plus étendue, puis celles dont la plupart des
    # morceaux touchent les murs déjà retenus (doublage, cloisons — une cloison
    # ne touche les murs qu'à ses extrémités). Un tableau ou une légende en
    # aplats, posés à côté du plan, ne touchent rien.
    ordre = sorted(classes, key=lambda c: -classes[c].area)
    retenues = [ordre[0]]
    murs = classes[ordre[0]]
    ajout = True
    while ajout:
        ajout = False
        for c in ordre:
            if c in retenues:
                continue
            morceaux = list(classes[c].geoms) if hasattr(classes[c], "geoms") else [classes[c]]
            proches = murs.buffer(0.03)
            if sum(1 for m in morceaux if m.intersects(proches)) >= 0.5 * len(morceaux):
                retenues.append(c)
                murs = murs.union(classes[c])
                ajout = True
    return murs.buffer(0.002).buffer(-0.002), retenues


def _segments_du_contour(g) -> list:
    segs = []
    for p in (g.geoms if hasattr(g, "geoms") else [g]):
        if p.geom_type != "Polygon":
            continue
        for anneau in [p.exterior, *p.interiors]:
            c = list(anneau.simplify(0.003).coords)
            segs += [(a, b) for a, b in zip(c, c[1:]) if math.dist(a, b) > 0.004]
    return segs


def lire_pdf(chemin: str, echelle: float | None = None, page: int = 0,
             epaisseur_min: float | None = None, mode: str = "auto") -> tuple[PlanBrut, list[str]]:
    doc = pymupdf.open(chemin)
    if page >= len(doc):
        raise ValueError(f"Le PDF n'a que {len(doc)} page(s).")
    pg = doc[page]
    lue = echelle_lue(chemin, page)
    notes = []
    if not echelle:
        if not lue:
            raise ValueError("Indiquez l'échelle du plan PDF (par exemple 100 pour 1/100) : elle n'est pas écrite sur la page.")
        echelle = lue
        notes.append(f"Échelle lue sur la page : 1/{lue}.")
    elif lue and lue != int(echelle):
        notes.append(f"⚠️ Échelle indiquée 1/{int(echelle)}, mais la page porte « 1/{lue} » : vérifiez.")
    k = PT_EN_M * echelle
    H = pg.rect.height
    dessins = pg.get_drawings()
    if not dessins:
        raise ValueError("Cette page ne contient aucun trait : c'est sans doute un scan. Il faut un PDF vectoriel "
                         "(export du logiciel de dessin), ou la vectorisation assistée d'une image.")

    def pt(p):
        return (p.x * k, (H - p.y) * k)   # le PDF compte les y vers le bas

    segments, murs = [], None
    if mode in ("auto", "aplats"):
        murs, couleurs = _murs_en_aplats(dessins, k, H)
        if murs is not None:
            segments = _segments_du_contour(murs)
            notes.append(f"Murs lus en aplats de couleur ({len(couleurs)} teinte(s) : maçonnerie, doublage, cloisons…).")
        elif mode == "aplats":
            raise ValueError("Aucun aplat de couleur ne dessine de murs sur cette page.")
    if not segments:
        # un même tracé peut regrouper tous les murs : on compte les traits, pas les tracés
        largeurs = Counter()
        for d in dessins:
            if d.get("width") and d["type"] in ("s", "fs"):
                largeurs[round(d["width"], 2)] += len(d["items"])
        if epaisseur_min is None:
            repetees = [w for w, n in largeurs.items() if n >= 4]
            epaisseur_min = max(repetees) if repetees else 0
            notes.append(f"⚠️ Murs lus en traits : épaisseur ≥ {epaisseur_min} pt retenue (la plus forte, répétée). "
                         "Si des murs sont dessinés plus fin, ils manqueront à l'interprétation.")
        for d in dessins:
            if d["type"] == "f" or (d.get("width") or 0) + 1e-6 < epaisseur_min:
                continue
            for it in d["items"]:
                if it[0] == "l":
                    segments.append((pt(it[1]), pt(it[2])))
                elif it[0] in ("re", "qu"):
                    q = it[1] if it[0] == "qu" else pymupdf.Quad(it[1])
                    c = [q.ul, q.ur, q.lr, q.ll]
                    for a, b in zip(c, c[1:] + c[:1]):
                        segments.append((pt(a), pt(b)))

    tirets = []
    for d in dessins:
        ds = d.get("dashes") or ""
        if d["type"] in ("s", "fs") and re.search(r"\d", ds.split("]")[0]):
            for it in d["items"]:
                if it[0] == "l":
                    tirets.append((pt(it[1]), pt(it[2])))
                elif it[0] == "re":
                    r = it[1]
                    c = [r.tl, r.tr, r.br, r.bl]
                    tirets += [(pt(a), pt(b)) for a, b in zip(c, c[1:] + c[:1])]

    textes = []
    for bloc in pg.get_text("dict")["blocks"]:
        for ligne in bloc.get("lines", []):
            t = " ".join(s["text"] for s in ligne["spans"]).strip()
            if not t:
                continue
            x0, y0, x1, y1 = ligne["bbox"]
            textes.append(Texte(texte=t, x=(x0 + x1) / 2 * k, y=(H - (y0 + y1) / 2) * k))

    # contrôle de l'échelle : la plus grande dimension des murs doit être une cote écrite
    if segments:
        xs = [p[0] for s in segments for p in s]
        ys = [p[1] for s in segments for p in s]
        dims = [max(xs) - min(xs), max(ys) - min(ys)]
        cotes = {float(m.group(1).replace(",", ".")) for t in textes for m in [RE_COTE.match(t.texte)] if m}
        trouvees = [c for c in cotes for d in dims if abs(c - d) <= 0.03]
        if trouvees:
            cote = f"{max(trouvees):.2f}".replace(".", ",")
            notes.append(f"✅ Échelle contrôlée : la cote {cote} m écrite sur le plan correspond au dessin.")
        elif cotes:
            notes.append(f"⚠️ Échelle à vérifier : le dessin mesure {dims[0]:.2f} × {dims[1]:.2f} m et aucune cote "
                         "écrite ne correspond à ces dimensions.")
        else:
            notes.append(f"⚠️ Échelle 1/{int(echelle)} : à vérifier sur une cote connue. Si elle est fausse, "
                         "toutes les dimensions et surfaces sont fausses.")
    return PlanBrut(segments=segments, textes=textes, origine=chemin.split("/")[-1], tirets=tirets), notes
