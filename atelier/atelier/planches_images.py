"""Planches faites d'images fournies : plan de situation (PCMI 1), insertion
(PCMI 6), photographies de l'environnement proche et lointain (PCMI 7, 8).

L'atelier ne fabrique aucune image (R9) : il met en page celles que
l'utilisateur dépose (extrait cadastral, vue aérienne, photographies,
photomontage d'insertion réalisé par ailleurs), avec leur légende, et un
plan de repérage des prises de vue quand leur point est connu.
"""
from __future__ import annotations

import math
from pathlib import Path

import pymupdf
from shapely.geometry import Polygon

from .planches import GRIS, MM, NOIR, ROUGE, Planche, Vue, echelle_pour

TITRES = {
    "PCMI1": ("PLAN DE", "situation", "PCMI 1", "PLAN DE SITUATION"),
    "PCMI6": ("INSERTION", "dans l'environnement", "PCMI 6", "INSERTION DU PROJET DANS SON ENVIRONNEMENT"),
    "PCMI7": ("PHOTOGRAPHIE", "environnement proche", "PCMI 7", "ENVIRONNEMENT PROCHE"),
    "PCMI8": ("PHOTOGRAPHIE", "environnement lointain", "PCMI 8", "ENVIRONNEMENT LOINTAIN"),
}
FORMATS = (".jpg", ".jpeg", ".png")


def _orientation_exif(donnees: bytes) -> int:
    """L'orientation EXIF d'une photo JPEG (1 si absente)."""
    import struct
    if donnees[:2] != b"\xff\xd8":
        return 1
    i = 2
    while i + 4 < len(donnees):
        if donnees[i] != 0xFF:
            return 1
        marqueur, taille = donnees[i + 1], struct.unpack(">H", donnees[i + 2:i + 4])[0]
        if marqueur == 0xE1 and donnees[i + 4:i + 10] == b"Exif\x00\x00":
            t = donnees[i + 10:i + 2 + taille]
            ordre = "<" if t[:2] == b"II" else ">"
            ifd = struct.unpack(ordre + "I", t[4:8])[0]
            n = struct.unpack(ordre + "H", t[ifd:ifd + 2])[0]
            for k in range(n):
                e = t[ifd + 2 + 12 * k: ifd + 14 + 12 * k]
                if struct.unpack(ordre + "H", e[:2])[0] == 0x0112:
                    return struct.unpack(ordre + "H", e[8:10])[0]
            return 1
        if marqueur == 0xDA:          # début de l'image : plus d'en-têtes
            return 1
        i += 2 + taille
    return 1


def _rotation_exif(chemin: Path) -> int:
    """Angle à appliquer pour redresser une photo de téléphone (orientation EXIF)."""
    try:
        return {3: 180, 6: 270, 8: 90}.get(_orientation_exif(chemin.read_bytes()[:65536]), 0)
    except Exception:
        return 0


def _taille(chemin: Path, rot: int) -> tuple[float, float]:
    try:
        r = pymupdf.open(str(chemin))[0].rect
        w, h = r.width, r.height
    except Exception:
        w, h = 4, 3
    return (h, w) if rot in (90, 270) else (w, h)


def _grille(n: int, zone: pymupdf.Rect, ratios: list[float]) -> list[pymupdf.Rect]:
    """Cases pour n images : une seule en grand, deux côte à côte (ou l'une
    sur l'autre si elles sont très larges), trois ou quatre en 2 × 2."""
    g = 10
    if n == 1:
        return [zone]
    if n == 2:
        if all(r > 1.9 for r in ratios):
            h = (zone.height - g) / 2
            return [pymupdf.Rect(zone.x0, zone.y0, zone.x1, zone.y0 + h), pymupdf.Rect(zone.x0, zone.y0 + h + g, zone.x1, zone.y1)]
        w = (zone.width - g) / 2
        return [pymupdf.Rect(zone.x0, zone.y0, zone.x0 + w, zone.y1), pymupdf.Rect(zone.x0 + w + g, zone.y0, zone.x1, zone.y1)]
    w, h = (zone.width - g) / 2, (zone.height - g) / 2
    return [pymupdf.Rect(zone.x0 + (i % 2) * (w + g), zone.y0 + (i // 2) * (h + g),
                         zone.x0 + (i % 2) * (w + g) + w, zone.y0 + (i // 2) * (h + g) + h) for i in range(min(n, 4))]


def _reperage(pl: Planche, projet, images, r: pymupdf.Rect, numeros):
    """Le terrain, la maison et les prises de vue numérotées."""
    from .terrain import maison_sur_terrain
    t = projet.terrain
    if len(t.limites) < 4:
        return
    lim = Polygon(t.limites)
    x0, y0, x1, y1 = lim.bounds
    e = echelle_pour(x1 - x0 + 8, y1 - y0 + 8, r.width, r.height - 14, [200, 250, 300, 400, 500, 750, 1000, 1500, 2000])
    vue = Vue(e, ((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2 + 6), ((x0 + x1) / 2, (y0 + y1) / 2))
    pl.texte(r.x0, r.y0 + 8, "Repérage des prises de vue", 6.5, gras=True)
    pl.surface(lim, vue, remplir=(0.89, 0.92, 0.80), couleur=NOIR, ep=0.6)
    m = maison_sur_terrain(projet)
    if m is not None:
        pl.surface(m, vue, remplir=(0.55, 0.56, 0.6), couleur=NOIR, ep=0.3)
    for im, num in zip(images, numeros):
        if im.point is None:
            continue
        p = vue(*im.point)
        if im.direction is not None:
            a = math.radians(im.direction)
            for s in (-0.45, 0.45):
                pl.ligne(p, (p.x + 22 * math.cos(a + s), p.y - 22 * math.sin(a + s)), 0.6, ROUGE)
        pl.page.draw_circle(p, 4.5, color=ROUGE, fill=(1, 1, 1), width=0.6)
        pl.texte(p.x, p.y + 2.2, str(num), 6, gras=True, ancre="c", couleur=ROUGE)


def planches_images(doc, projet, reglages, dossier: Path, pieces=("PCMI1", "PCMI6", "PCMI7", "PCMI8")) -> list[Planche]:
    out = []
    # les prises de vue gardent le numéro donné par l'utilisateur ; les autres
    # sont numérotées à la suite, une fois pour tout le dossier
    numeros = {im.id: im.numero for im in projet.images if im.numero}
    suivant = max(numeros.values(), default=0)
    for im in projet.images:
        if im.piece in ("PCMI6", "PCMI7", "PCMI8") and im.id not in numeros:
            suivant += 1
            numeros[im.id] = suivant
    for piece in pieces:
        images = [im for im in projet.images if im.piece == piece and (dossier / im.fichier).exists()]
        if not images:
            continue
        titre, sous, feuille, titre_bas = TITRES[piece]
        pl = Planche(doc, projet, reglages, titre, sous, feuille, "sans objet", titre_bas)
        z = pl.zone
        avec_reperage = piece != "PCMI1" and any(im.point is not None for im in images) and len(projet.terrain.limites) >= 4
        zone = pymupdf.Rect(z.x0, z.y0, z.x1 - (190 if avec_reperage else 0), z.y1)
        rots = [_rotation_exif(dossier / im.fichier) for im in images]
        tailles = [_taille(dossier / im.fichier, r) for im, r in zip(images, rots)]
        cases = _grille(len(images), zone, [w / h for w, h in tailles])
        for im, case, rot, (w, h) in zip(images, cases, rots, tailles):
            # l'image garde ses proportions, calée en haut de sa case ; la légende juste dessous
            cadre = pymupdf.Rect(case.x0, case.y0, case.x1, case.y1 - 22)
            k = min(cadre.width / w, cadre.height / h)
            r = pymupdf.Rect(cadre.x0, cadre.y0, cadre.x0 + w * k, cadre.y0 + h * k)
            try:
                pl.page.insert_image(r, filename=str(dossier / im.fichier), keep_proportion=True, rotate=rot)
            except Exception:
                pl.texte(r.x0 + 4, r.y0 + 12, f"Image illisible : {im.fichier}", 7, couleur=ROUGE)
            num = numeros.get(im.id)
            lib = (f"Prise de vue n° {num} – " if num else "") + (im.legende or "")
            yy = r.y1 + 11
            for ligne in pl.lignes_coupees(lib or "[légende à compléter]", max(r.width, 200), 7.5, bool(num))[:2]:
                pl.texte(r.x0, yy, ligne, 7.5, gras=bool(num), couleur=NOIR if im.legende else ROUGE)
                yy += 9.5
        if avec_reperage:
            _reperage(pl, projet, images, pymupdf.Rect(z.x1 - 180, z.y0, z.x1, z.y0 + 200),
                      [numeros.get(im.id) for im in images])
        if piece == "PCMI6":
            pl.texte(z.x0, z.y1 + 14, "Insertion fournie par le maître d'œuvre ; la mise en page ne modifie pas l'image.",
                     6, couleur=GRIS)
        out.append(pl)
    return out
