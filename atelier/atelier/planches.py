"""Planches A3 paysage en PDF vectoriel, au format des pièces de CP
Constructions : zone de dessin à gauche, cartouche en colonne à droite
(logo, titre, numéro de feuille, construction de, adresse, zone sismique,
dessiné par, logo RE2020, format, échelle), titre de la planche en bas à
gauche.

Tout est dessiné en vectoriel (traits, aplats, textes) : les pièces
s'impriment nettes à toute taille et se relisent dans l'atelier. La police
FiraGO (libre, SIL OFL) est intégrée : tous les caractères français et les
symboles (m², ±, ×, ≤, –) s'affichent.
"""
from __future__ import annotations

import math
from datetime import date

import pymupdf

try:
    import pymupdf_fonts  # noqa: F401  (rend les polices FiraGO disponibles)
    POLICE, POLICE_GRAS = pymupdf.Font("figo"), pymupdf.Font("figbo")
except Exception:  # sans le paquet, repli sur Helvetica (sans « ≤ » ni tirets longs)
    POLICE = POLICE_GRAS = None

A3 = (1190.55, 841.89)
MM = 72 / 25.4
MARGE = 10 * MM
LARGEUR_CARTOUCHE = 50 * MM
PT_PAR_M = 72 / 0.0254          # points par mètre réel, à l'échelle 1/1
ECHELLES = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000]

NOIR = (0, 0, 0)
GRIS = (0.45, 0.45, 0.45)
GRIS_CLAIR = (0.85, 0.85, 0.85)
GRIS_TITRE = (0.84, 0.84, 0.84)
BLANC = (1, 1, 1)
ROUGE = (0.55, 0.18, 0.11)


def date_fr(d: date | None = None) -> str:
    return (d or date.today()).strftime("%d/%m/%Y")


def nombre(v: float, dec: int = 2) -> str:
    return f"{v:.{dec}f}".replace(".", ",").replace("-", "−")


def signe(v: float, dec: int = 2) -> str:
    return ("±" if abs(v) < 0.005 else ("+" if v > 0 else "")) + nombre(v, dec)


class Vue:
    """Passage des mètres du modèle aux points de la planche, à une échelle
    donnée ; y du modèle vers le haut, y de la page vers le bas."""

    def __init__(self, echelle: float, centre_page: tuple[float, float], centre_modele: tuple[float, float]):
        self.echelle = echelle
        self.k = PT_PAR_M / echelle
        self.cx, self.cy = centre_page
        self.mx, self.my = centre_modele

    def __call__(self, x: float, y: float) -> pymupdf.Point:
        return pymupdf.Point(self.cx + (x - self.mx) * self.k, self.cy - (y - self.my) * self.k)

    def longueur(self, m: float) -> float:
        return m * self.k


def echelle_pour(largeur_m: float, hauteur_m: float, largeur_pt: float, hauteur_pt: float,
                 echelles=ECHELLES) -> int:
    """La plus grande échelle usuelle (1/50, 1/75, 1/100…) à laquelle le dessin tient."""
    for e in echelles:
        k = PT_PAR_M / e
        if largeur_m * k <= largeur_pt and hauteur_m * k <= hauteur_pt:
            return e
    return echelles[-1]


class Planche:
    def __init__(self, doc: pymupdf.Document, projet, reglages, titre: str, sous_titre: str = "",
                 feuille: str = "", echelle: str = "", titre_bas: str = "", legende_bas: str = "",
                 cartouche: bool = True):
        self.doc = doc
        self.page = doc.new_page(width=A3[0], height=A3[1])
        self.projet, self.reglages = projet, reglages
        if POLICE:
            self.page.insert_font(fontname="fr", fontbuffer=POLICE.buffer)
            self.page.insert_font(fontname="frb", fontbuffer=POLICE_GRAS.buffer)
        W, H = A3
        self.cadre = pymupdf.Rect(MARGE, MARGE, W - MARGE, H - MARGE)
        self.x_cartouche = self.cadre.x1 - (LARGEUR_CARTOUCHE if cartouche else 0)
        # zone de dessin : tout le cadre sauf la colonne du cartouche et la bande du titre
        self.zone = pymupdf.Rect(self.cadre.x0 + 5 * MM, self.cadre.y0 + 6 * MM,
                                 self.x_cartouche - 5 * MM, self.cadre.y1 - 18 * MM)
        self.page.draw_rect(self.cadre, color=NOIR, width=0.8)
        if cartouche:
            self.cartouche(titre, sous_titre, feuille, echelle)
        if titre_bas:
            self.texte(self.cadre.x0 + 5 * MM, self.cadre.y1 - 9 * MM, titre_bas, 13, gras=True)
        if legende_bas:
            self.texte(self.cadre.x0 + 5 * MM, self.cadre.y1 - 4.5 * MM, legende_bas, 6.5, couleur=GRIS)

    # ------------------------------------------------------------ primitives

    def largeur_texte(self, t: str, taille: float, gras=False) -> float:
        f = (POLICE_GRAS if gras else POLICE) if POLICE else None
        return f.text_length(t, fontsize=taille) if f else pymupdf.get_text_length(t, fontsize=taille)

    def texte(self, x, y, t: str, taille=7.0, gras=False, couleur=NOIR, ancre="g", rot=0, italique=False):
        """Texte posé sur sa ligne de base en (x, y). ancre : g (gauche), c (centre), d (droite).
        rot : 0 ou 90 (texte montant, lu de bas en haut)."""
        if not t:
            return
        w = self.largeur_texte(t, taille, gras)
        dec = {"g": 0, "c": w / 2, "d": w}[ancre]
        police = ("frb" if gras else "fr") if POLICE else ("hebo" if gras else "helv")
        if rot == 90:
            self.page.insert_text((x, y + dec), t, fontsize=taille, fontname=police, color=couleur, rotate=90)
        else:
            self.page.insert_text((x - dec, y), t, fontsize=taille, fontname=police, color=couleur)

    def lignes_coupees(self, t: str, largeur: float, taille: float, gras=False) -> list[str]:
        mots, lignes, cour = t.split(), [], ""
        for m in mots:
            essai = (cour + " " + m).strip()
            if self.largeur_texte(essai, taille, gras) <= largeur or not cour:
                cour = essai
            else:
                lignes.append(cour)
                cour = m
        if cour:
            lignes.append(cour)
        return lignes

    def ligne(self, a, b, ep=0.5, couleur=NOIR, tirets=None):
        self.page.draw_line(a, b, color=couleur, width=ep, dashes=tirets)

    def poly(self, pts, remplir=None, couleur=NOIR, ep=0.5, fermer=True, tirets=None):
        pts = list(pts)
        if len(pts) < 2:
            return
        if fermer and pts[0] != pts[-1]:
            pts = pts + [pts[0]]
        self.page.draw_polyline(pts, color=couleur, fill=remplir, width=ep, dashes=tirets, closePath=fermer)

    def surface(self, geom, vue: Vue, remplir=None, couleur=NOIR, ep=0.5, tirets=None):
        """Dessine un polygone shapely (trous compris) dans une vue."""
        for p in (geom.geoms if hasattr(geom, "geoms") else [geom]):
            if p.geom_type != "Polygon" or p.is_empty:
                continue
            sh = self.page.new_shape()
            for anneau in [p.exterior, *p.interiors]:
                sh.draw_polyline([vue(*c) for c in anneau.coords])
            sh.finish(color=couleur, fill=remplir, width=ep if couleur else 0, even_odd=True, closePath=True,
                      dashes=tirets)
            sh.commit()

    def image(self, rect: pymupdf.Rect, chemin):
        try:
            self.page.insert_image(rect, filename=str(chemin), keep_proportion=True)
        except Exception:
            pass

    # ------------------------------------------------------------ éléments de dessin

    def cote(self, a, b, decal: float, texte: str | None = None, taille=6.0, ep=0.35, couleur=NOIR, sous: str = ""):
        """Cote entre deux points de la page, décalée de `decal` points
        perpendiculairement (du côté gauche en allant de a vers b)."""
        ax, ay, bx, by = a[0], a[1], b[0], b[1]
        L = math.hypot(bx - ax, by - ay)
        if L < 1e-6:
            return
        ux, uy = (bx - ax) / L, (by - ay) / L
        nx, ny = uy, -ux                               # normale (y de page vers le bas)
        pa = (ax + nx * decal, ay + ny * decal)
        pb = (bx + nx * decal, by + ny * decal)
        s = 1 if decal >= 0 else -1
        for p, q in ((a, pa), (b, pb)):                 # lignes d'attache
            self.ligne((p[0] + nx * 2 * s, p[1] + ny * 2 * s), (q[0] + nx * 2 * s, q[1] + ny * 2 * s), ep * 0.7, couleur)
        self.ligne(pa, pb, ep, couleur)
        for p in (pa, pb):                              # traits obliques d'architecte
            self.ligne((p[0] - (ux + nx) * 2.2, p[1] - (uy + ny) * 2.2), (p[0] + (ux + nx) * 2.2, p[1] + (uy + ny) * 2.2), ep * 1.6, couleur)
        if texte is None:
            return
        mx, my = (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2
        if abs(ux) >= abs(uy):
            self.texte(mx, my - 1.5, texte, taille, ancre="c", couleur=couleur)
            if sous:
                self.texte(mx, my + taille + 0.5, sous, taille * 0.8, ancre="c", couleur=GRIS)
        else:
            self.texte(mx - 1.5, my, texte, taille, ancre="c", rot=90, couleur=couleur)
            if sous:
                self.texte(mx + taille + 0.5, my, sous, taille * 0.8, ancre="c", rot=90, couleur=GRIS)

    def niveau(self, x, y, texte: str, sous: str = "", cote_droit=True, taille=6.5, couleur=NOIR):
        """Repère de niveau (triangle) avec sa valeur."""
        d = 4
        tri = [(x - d, y - d * 1.3), (x + d, y - d * 1.3), (x, y)]
        self.poly(tri, remplir=couleur, couleur=couleur, ep=0.3)
        self.ligne((x - 12, y), (x + 12, y), 0.4, couleur)
        tx = x + 8 if cote_droit else x - 8
        an = "g" if cote_droit else "d"
        self.texte(tx, y - 6, texte, taille, gras=True, ancre=an, couleur=couleur)
        if sous:
            self.texte(tx, y - 6 + taille + 1, sous, taille * 0.85, ancre=an, couleur=GRIS)

    def barre_echelle(self, x, y, echelle: float, longueur_m: float | None = None):
        if longueur_m is None:
            longueur_m = 5 if echelle <= 100 else (10 if echelle <= 250 else 50)
        k = PT_PAR_M / echelle
        pas = longueur_m / 5
        for i in range(5):
            r = pymupdf.Rect(x + i * pas * k, y, x + (i + 1) * pas * k, y + 3)
            self.page.draw_rect(r, color=NOIR, fill=NOIR if i % 2 == 0 else BLANC, width=0.4)
            self.texte(x + i * pas * k, y - 2, nombre(i * pas, 0), 5.5, ancre="c")
        self.texte(x + longueur_m * k, y - 2, nombre(longueur_m, 0) + " m", 5.5, ancre="c")
        self.texte(x, y + 10, f"Échelle 1/{int(echelle)}", 6.5, gras=True)

    def fleche_nord(self, x, y, angle_deg: float, r=14, hypothese=False):
        """Flèche du nord ; angle depuis l'axe x du modèle (90 = vers le haut)."""
        a = math.radians(angle_deg)
        ux, uy = math.cos(a), -math.sin(a)
        self.page.draw_circle((x, y), r, color=NOIR, width=0.6)
        pointe = (x + ux * r * 0.9, y + uy * r * 0.9)
        g = (x - uy * r * 0.35 - ux * r * 0.5, y + ux * r * 0.35 - uy * r * 0.5)
        d = (x + uy * r * 0.35 - ux * r * 0.5, y - ux * r * 0.35 - uy * r * 0.5)
        self.poly([pointe, g, (x, y), pointe], remplir=NOIR, couleur=NOIR, ep=0.4)
        self.poly([pointe, d, (x, y), pointe], remplir=BLANC, couleur=NOIR, ep=0.4)
        self.texte(x + ux * (r + 7), y + uy * (r + 7) + 3, "N", 9, gras=True, ancre="c")
        if hypothese:
            self.texte(x, y + r + 16, "nord supposé", 5.5, ancre="c", couleur=ROUGE)

    def avertissement(self, lignes: list[str], x=None, y=None):
        """Hypothèses non confirmées rappelées sur la planche (R4) : elles
        disparaissent quand les valeurs sont saisies ou confirmées. Sans place
        libre, elles vont dans la bande du titre, à droite du titre."""
        if not lignes:
            return
        if x is None or y is None:
            x = self.cadre.x0 + 330
            y = self.cadre.y1 - 8 - 7 * len(lignes)
            self.texte(x, y, "À CONFIRMER AVANT DÉPÔT", 6, gras=True, couleur=ROUGE)
            for i, l in enumerate(lignes):
                self.texte(x, y + 7 * (i + 1), "• " + l, 5.5, couleur=ROUGE)
            return
        self.texte(x, y, "À CONFIRMER AVANT DÉPÔT", 6.5, gras=True, couleur=ROUGE)
        for i, l in enumerate(lignes):
            self.texte(x, y + 8 * (i + 1), "• " + l, 6, couleur=ROUGE)

    # ------------------------------------------------------------ cartouche

    def cartouche(self, titre: str, sous_titre: str, feuille: str, echelle: str):
        p, r = self.projet, self.reglages
        x0, x1 = self.x_cartouche, self.cadre.x1
        y = self.cadre.y0
        hauteur = self.cadre.height
        cases = [("logo", 0.165), ("titre", 0.072), ("feuille", 0.072), ("construction", 0.077),
                 ("adresse", 0.225), ("sismique", 0.074), ("dessine", 0.072), ("re2020", 0.072),
                 ("format", 0.072), ("echelle", 0.069)]
        self.ligne((x0, self.cadre.y0), (x0, self.cadre.y1), 0.8)
        cx = (x0 + x1) / 2
        w = x1 - x0 - 8
        for cle, part in cases:
            h = hauteur * part
            rect = pymupdf.Rect(x0, y, x1, y + h)
            if cle == "logo":
                logo = r.chemin_logo()
                if logo:
                    self.image(pymupdf.Rect(x0 + 6, y + 6, x1 - 6, y + h - 6), logo)
                else:
                    self.texte(cx, y + h / 2, r.societe, 10, gras=True, ancre="c")
            elif cle == "titre":
                self.page.draw_rect(rect, color=None, fill=GRIS_TITRE)
                lignes = self.lignes_coupees(titre, w, 9.5, True)
                yy = y + h / 2 - (len(lignes) - 1) * 6 + (0 if sous_titre else 3)
                for l in lignes:
                    self.texte(cx, yy, l, 9.5, gras=True, ancre="c")
                    yy += 11
                if sous_titre:
                    self.texte(cx, yy, sous_titre, 6.5, gras=True, ancre="c")
            elif cle == "feuille":
                self._etiquette(cx, y + 11, "Numéro de feuille :")
                self.texte(cx, y + 27, feuille, 11, gras=True, ancre="c")
                self.texte(cx, y + 36, f"indice {p.indice} du {date_fr()}", 5.5, ancre="c", couleur=GRIS)
            elif cle == "construction":
                self._etiquette(cx, y + 11, "Construction de :")
                self._bloc(cx, y + 22, p.maitre_ouvrage or "[à préciser]", w, 7)
            elif cle == "adresse":
                self._etiquette(cx, y + 11, "Adresse du projet :")
                yy = self._bloc(cx, y + 26, p.adresse or "[à préciser]", w, 7.5)
                if p.parcelles:
                    yy = self._bloc(cx, yy + 10, ", ".join(p.parcelles), w, 7)
                st = p.surface_terrain
                if st.valeur:
                    self._bloc(cx, yy + 10, f"{nombre(st.valeur)} m²", w, 7)
            elif cle == "sismique":
                self._etiquette(cx, y + 11, "Zone sismique :")
                zs = p.zone_sismique.valeur
                self.texte(cx, y + 26, str(zs) if zs else "[à préciser]", 7.5, ancre="c",
                           couleur=NOIR if zs else ROUGE)
            elif cle == "dessine":
                self._etiquette(cx, y + 11, "Dessiné par :")
                self.texte(cx, y + 28, r.dessinateur or "[à préciser]", 9, gras=True, ancre="c",
                           couleur=NOIR if r.dessinateur else ROUGE)
            elif cle == "re2020":
                logo = r.chemin_logo_re2020()
                if logo:
                    self.image(pymupdf.Rect(x0 + 6, y + 5, x1 - 6, y + h - 5), logo)
            elif cle == "format":
                self.texte(cx, y + h / 2 + 3, "Format : A3", 8, gras=True, ancre="c")
            elif cle == "echelle":
                self.texte(cx, y + h / 2 + 3, f"Échelle : {echelle or 'sans objet'}", 8, gras=True, ancre="c")
            y += h
            if cle != "echelle":
                self.ligne((x0, y), (x1, y), 0.6)

    def _etiquette(self, cx, y, t):
        self.texte(cx, y, t, 6.5, ancre="c", couleur=GRIS)
        w = self.largeur_texte(t, 6.5)
        self.ligne((cx - w / 2, y + 1.2), (cx + w / 2, y + 1.2), 0.3, GRIS)

    def _bloc(self, cx, y, t, w, taille) -> float:
        for l in self.lignes_coupees(t, w, taille):
            self.texte(cx, y, l, taille, ancre="c")
            y += taille + 2.5
        return y - taille - 2.5
