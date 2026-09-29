"""Les pièces graphiques tirées du modèle (R1) : plan du rez-de-chaussée,
plan de toiture, façades, coupes, page de garde.

Rien n'y est inventé (R2) : ce que le modèle ne sait pas (hauteur d'une
baie non lue, pente supposée…) n'est pas dessiné comme certain. Chaque
planche rappelle en rouge, sous « À CONFIRMER AVANT DÉPÔT », les
hypothèses dont elle dépend ; le rappel disparaît quand la valeur est
saisie ou confirmée.
"""
from __future__ import annotations

import math
import re

import pymupdf
from shapely import affinity
from shapely.geometry import LineString, MultiPoint, Point, Polygon, box
from shapely.ops import polylabel, unary_union

from .modele import Statut
from .planches import (BLANC, GRIS, GRIS_CLAIR, MM, NOIR, PT_PAR_M, ROUGE, Planche, Vue, date_fr, echelle_pour,
                       nombre, signe)
from .surfaces import calculer
from .toiture import calculer_toiture

GRIS_MUR = (0.80, 0.80, 0.80)
GRIS_CLOISON = (0.50, 0.50, 0.50)
VITRAGE = (0.80, 0.86, 0.88)
ENDUIT = (0.93, 0.86, 0.72)
TUILE = (0.30, 0.31, 0.34)
TOIT_CLAIR = (0.80, 0.81, 0.84)
TOIT_MOYEN = (0.70, 0.71, 0.75)
TOIT_FONCE = (0.60, 0.61, 0.66)


# ------------------------------------------------------------ le modèle, en géométrie

class Geo:
    """La géométrie du RDC, redressée pour le dessin : le plus grand mur de
    façade devient horizontal (angle `rot` appliqué à tout le modèle)."""

    def __init__(self, projet):
        self.projet = projet
        n = projet.batiment.niveaux[0]
        self.n = n
        self.vol = projet.batiment.volumetrie
        brut = Polygon(n.contour_exterieur).buffer(0)
        c = list(brut.exterior.coords)
        a, b = max(zip(c, c[1:]), key=lambda s: math.dist(*s))
        ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
        while ang > 45:
            ang -= 90
        while ang <= -45:
            ang += 90
        self.rot = -ang
        self.origine = (0, 0)
        R = lambda g: affinity.rotate(g, self.rot, origin=self.origine)
        self.R = R
        # sans les sommets alignés (les bords des baies) : les cotes des volumes restent justes
        self.contour = R(brut).simplify(0.002)
        self.murs_ext = unary_union([R(Polygon(m.polygone, m.trous).buffer(0)) for m in n.murs if m.exterieur]) if n.murs else Polygon()
        self.murs_int = unary_union([R(Polygon(m.polygone, m.trous).buffer(0)) for m in n.murs if not m.exterieur]) if n.murs else Polygon()
        self.pieces = [(p, R(Polygon(p.polygone).buffer(0))) for p in n.pieces]
        self.couverts = [(c, R(Polygon(c.polygone).buffer(0))) for c in n.couverts]
        # ce que la toiture couvre : les murs et les couverts accolés (porche, auvent)
        self.couvert_total = unary_union([self.contour] + [g for _, g in self.couverts]).simplify(0.002)
        if self.couvert_total.geom_type != "Polygon":
            self.couvert_total = self.contour
        self.ouvertures = [(o, R(Polygon(o.polygone).buffer(0)) if len(o.polygone) >= 3 else None) for o in n.ouvertures]
        self.nord = (self.vol.nord.valeur or 90.0) + self.rot
        self.nord_suppose = self.vol.nord.statut != Statut.CONFIRME
        self._toit = None
        self.erreur_toit = ""

    @property
    def toiture(self):
        if self._toit is None and not self.erreur_toit:
            v = self.vol
            try:
                self._toit = calculer_toiture(list(self.couvert_total.exterior.coords), v.hauteur_egout.valeur,
                                              v.pente_toiture.valeur, v.debord_toiture.valeur)
            except ValueError as e:
                self.erreur_toit = str(e)
        return self._toit

    def hypotheses(self, *cles) -> list[str]:
        """Les valeurs de volumétrie encore supposées, parmi celles demandées."""
        v = self.vol
        noms = {"hauteur_egout": "hauteur à l'égout", "hauteur_arase": "arase des murs",
                "pente_toiture": "pente de toiture", "debord_toiture": "débord de toiture",
                "vide_sanitaire": "hauteur du vide sanitaire", "terrain_fini": "niveau du terrain fini",
                "nord": "orientation (nord)"}
        out = []
        for c in cles:
            x = getattr(v, c)
            if x.statut != Statut.CONFIRME:
                val = f"{signe(x.valeur) if c in ('hauteur_egout', 'hauteur_arase', 'terrain_fini') else nombre(x.valeur, 0 if x.unite == '°' else 2)} {x.unite}".strip()
                out.append(f"{noms[c]} : {val} (valeur supposée)")
        return out

    def ngf(self) -> str:
        a = self.n.altitude_sol_fini
        return f" = {nombre(a.valeur)} NGF" if a.valeur is not None else ""


def _anneau_pts(g):
    return list(g.exterior.coords)


def _cote_texte_baie(o) -> tuple[str, str]:
    L, H, A = o.largeur, o.hauteur, o.allege
    t = nombre(L.valeur) if L.valeur else "?"
    if H.valeur:
        t += " × " + nombre(H.valeur)
    sous = ""
    if A.valeur and A.valeur > 0.01:
        sous = "all. " + nombre(A.valeur)
    return t, sous


def _bords(contour: Polygon):
    """Les bords du contour avec leur normale extérieure (contour dans le sens trigonométrique)."""
    p = contour if contour.exterior.is_ccw else Polygon(list(contour.exterior.coords)[::-1])
    c = list(p.exterior.coords)
    out = []
    for a, b in zip(c, c[1:]):
        L = math.dist(a, b)
        if L < 1e-6:
            continue
        ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        out.append((a, b, (uy, -ux)))
    return out


def faces_visibles(contour: Polygon, normale, pas=0.05):
    """Les morceaux des façades tournées vers `normale` qu'on voit vraiment de
    ce côté : un mur caché derrière un autre volume n'est ni coté ni dessiné."""
    bords = [(a, b) for a, b, n in _bords(contour) if n[0] * normale[0] + n[1] * normale[1] > 0.9998]
    interieur = contour.buffer(-0.005)
    x0, y0, x1, y1 = contour.bounds
    loin = (x1 - x0) + (y1 - y0) + 10
    out = []
    for a, b in bords:
        L = math.dist(a, b)
        n = max(2, int(L / pas))
        vus = []
        for i in range(n + 1):
            t = i / n
            p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            rayon = LineString([(p[0] + normale[0] * 0.02, p[1] + normale[1] * 0.02),
                                (p[0] + normale[0] * loin, p[1] + normale[1] * loin)])
            vus.append(not rayon.intersects(interieur))
        # regrouper les points vus en morceaux continus
        debut = None
        for i, v in enumerate(vus + [False]):
            if v and debut is None:
                debut = i
            elif not v and debut is not None:
                t0, t1 = debut / n, (i - 1) / n
                if (t1 - t0) * L > 0.02:
                    out.append(((a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0),
                                (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)))
                debut = None
    # les extrémités d'un morceau coupé tombent au pas près : on les recale sur les sommets voisins
    xs = sorted({c[0] for c in contour.exterior.coords})
    ys = sorted({c[1] for c in contour.exterior.coords})
    def recale(p):
        x = min(xs, key=lambda v: abs(v - p[0]))
        y = min(ys, key=lambda v: abs(v - p[1]))
        return (x if abs(x - p[0]) < pas * 1.01 else p[0], y if abs(y - p[1]) < pas * 1.01 else p[1])
    return [(recale(a), recale(b)) for a, b in out]


class Placement:
    """Évite que tableau, légende, flèche du nord et barre d'échelle tombent
    sur le dessin ou ses cotes : on tient la liste des zones occupées."""

    def __init__(self, zone: pymupdf.Rect, occupe):
        self.zone = zone
        self.occupe = occupe

    def poser(self, w, h, preferences=("hg", "hd", "bg", "bd")) -> pymupdf.Rect | None:
        z = self.zone
        coins = {"hg": (z.x0, z.y0), "hd": (z.x1 - w, z.y0), "bg": (z.x0, z.y1 - h), "bd": (z.x1 - w, z.y1 - h)}
        essais = [coins[p] for p in preferences]
        # puis une grille sur toute la zone
        pas = 12
        for yy in range(int(z.y0), int(z.y1 - h), pas):
            for xx in range(int(z.x0), int(z.x1 - w), pas):
                essais.append((xx, yy))
        for x, y in essais:
            r = box(x, y, x + w, y + h)
            if not r.intersects(self.occupe):
                self.occupe = self.occupe.union(r.buffer(4))
                return pymupdf.Rect(x, y, x + w, y + h)
        return None


# ------------------------------------------------------------ cotes extérieures

PREMIER, PAS = 20.0, 14.0


def marge_cotes(n_chaines=3) -> float:
    return PREMIER + (n_chaines - 1) * PAS + 12


def _chaines(pl: Planche, geo: Geo, vue: Vue, cotes_baies=True, pas=PAS, premier=PREMIER):
    """Trois chaînes de cotes par côté : baies (largeur × hauteur, allège),
    volumes (redents de la façade), longueur totale."""
    minx, miny, maxx, maxy = geo.contour.bounds
    bords = _bords(geo.contour)
    ouv = [(o, g) for o, g in geo.ouvertures if o.exterieure and g is not None]
    for cote_, normale in (("bas", (0, -1)), ("haut", (0, 1)), ("gauche", (-1, 0)), ("droite", (1, 0))):
        horiz = normale[1] != 0
        axe = (lambda p: p[0]) if horiz else (lambda p: p[1])
        # à 1° près : un défaut de dessin de quelques millimètres ne doit pas faire perdre une façade
        faces = faces_visibles(geo.contour, normale)
        if not faces:
            continue
        # les baies de ces façades
        baies = []
        for o, g in ouv:
            for a, b in faces:
                if LineString([a, b]).distance(g) < 0.02:
                    lo, hi = (g.bounds[0], g.bounds[2]) if horiz else (g.bounds[1], g.bounds[3])
                    baies.append((lo, hi, o))
                    break
        vol = sorted({round(axe(p), 3) for a, b in faces for p in (a, b)})
        points_baies = sorted(set(vol) | {round(x, 3) for lo, hi, _ in baies for x in (lo, hi)})
        # position des chaînes, à l'extérieur du dessin
        if cote_ == "bas":
            base = vue(0, miny).y
            place = lambda x, i: (vue(x, miny).x, base + premier + i * pas)
        elif cote_ == "haut":
            base = vue(0, maxy).y
            place = lambda x, i: (vue(x, maxy).x, base - premier - i * pas)
        elif cote_ == "gauche":
            base = vue(minx, 0).x
            place = lambda y, i: (base - premier - i * pas, vue(minx, y).y)
        else:
            base = vue(maxx, 0).x
            place = lambda y, i: (base + premier + i * pas, vue(maxx, y).y)

        def chaine(points, i, etiquettes=None):
            for u0, u1 in zip(points, points[1:]):
                if u1 - u0 < 0.005:
                    continue
                a, b = place(u0, i), place(u1, i)
                # la cote se lit du bas vers le haut, de gauche à droite
                if not horiz:
                    a, b = (a, b) if a[1] > b[1] else (b, a)
                else:
                    a, b = (a, b) if a[0] < b[0] else (b, a)
                t, sous = (etiquettes or {}).get((round(u0, 3), round(u1, 3)), (nombre(u1 - u0), ""))
                pl.cote(a, b, 0, t, taille=5.5, sous=sous)
        rang = 0
        if cotes_baies and baies:
            etiq = {(round(lo, 3), round(hi, 3)): _cote_texte_baie(o) for lo, hi, o in baies}
            chaine(points_baies, rang, etiq)
            rang += 1
        if len(vol) > 2:
            chaine(vol, rang)
            rang += 1
        tot = [minx, maxx] if horiz else [miny, maxy]
        chaine(tot, rang)


def _occupation_plan(geo: Geo, vue: Vue, marge_cotes: float):
    marge_cotes += 18   # repères de coupe au-delà des cotes
    """Zone occupée par le dessin et ses cotes, en coordonnées de page."""
    minx, miny, maxx, maxy = geo.contour.bounds
    a, b = vue(minx, maxy), vue(maxx, miny)
    cadre = box(a.x, a.y, b.x, b.y)
    bande = cadre.buffer(marge_cotes, join_style=2).difference(cadre)
    dessin = Polygon([(vue(x, y).x, vue(x, y).y) for x, y in geo.contour.exterior.coords]).buffer(14)
    return bande.union(dessin)


# ------------------------------------------------------------ plan du RDC

def _tableau_surfaces(pl: Planche, r: pymupdf.Rect, projet, surfaces):
    n = projet.batiment.niveaux[0]
    x0, y = r.x0, r.y0 + 10
    pl.texte(x0, y, "TABLEAU DES SURFACES – RDC", 7.5, gras=True)
    y += 8
    c1, c2, c3 = x0 + 4, r.x1 - 50, r.x1 - 6
    h = 9.5
    pl.page.draw_rect(pymupdf.Rect(x0, y, r.x1, y + h), color=None, fill=(0.93, 0.93, 0.93))
    pl.texte(c1, y + 7, "Pièce", 6, gras=True)
    pl.texte(c2, y + 7, "S. hab.", 6, gras=True, ancre="d")
    pl.texte(c3, y + 7, "S. annexe", 6, gras=True, ancre="d")
    y += h
    sh = sa = 0.0
    for p in sorted(n.pieces, key=lambda p: (p.exclue_habitable, -p.surface_calculee)):
        pl.texte(c1, y + 7, p.nom, 6)
        if p.exclue_habitable:
            pl.texte(c3, y + 7, nombre(p.surface_calculee), 6, ancre="d")
            sa += p.surface_calculee
        else:
            pl.texte(c2, y + 7, nombre(p.surface_calculee), 6, ancre="d")
            sh += p.surface_calculee
        pl.ligne((x0, y + h), (r.x1, y + h), 0.2, GRIS_CLAIR)
        y += h
    pl.page.draw_rect(pymupdf.Rect(x0, y, r.x1, y + h), color=None, fill=(0.93, 0.93, 0.93))
    pl.texte(c1, y + 7, "Total (m²)", 6, gras=True)
    pl.texte(c2, y + 7, nombre(sh), 6, gras=True, ancre="d")
    pl.texte(c3, y + 7, nombre(sa), 6, gras=True, ancre="d")
    pl.page.draw_rect(pymupdf.Rect(x0, r.y0 + 18, r.x1, y + h), color=GRIS, width=0.4)
    y += h + 11
    for lib, cle in (("Surface de plancher (S.P.)", "surface_plancher"), ("Emprise au sol", "emprise_sol")):
        v = surfaces[cle]["valeur"]
        pl.texte(x0, y, f"{lib} : {nombre(v.valeur)} m²", 6)
        y += 8.5
    baies = sum((o.largeur.valeur or 0) * (o.hauteur.valeur or 0) for o in n.ouvertures
                if o.exterieure and o.type != "porte de garage" and o.hauteur.valeur)
    pl.texte(x0, y, f"Surface des baies (hors porte de garage) : {nombre(baies)} m²", 6)


def hauteur_tableau(projet) -> float:
    return 18 + 9.5 * (len(projet.batiment.niveaux[0].pieces) + 2) + 36


def plan_rdc(doc, projet, reglages) -> Planche:
    geo = Geo(projet)
    minx, miny, maxx, maxy = geo.contour.bounds
    marge = marge_cotes(3)
    tmp = pymupdf.open()
    essai = Planche(tmp, projet, reglages, "", "", "", "")
    z = essai.zone
    e = echelle_pour(maxx - minx, maxy - miny, z.width - 2 * marge, z.height - 2 * marge, [50, 75, 100, 125, 150, 200])
    pl = Planche(doc, projet, reglages, "PLAN DU", "rez-de-chaussée", "Plan RDC", f"1/{e}",
                 "PLAN DU REZ-DE-CHAUSSÉE",
                 f"Niveau fini RDC ±0,00{geo.ngf()} – cotes en mètres – baies : largeur × hauteur, all. = hauteur d'allège")
    z = pl.zone
    vue = Vue(e, ((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2), ((minx + maxx) / 2, (miny + maxy) / 2))
    trous = unary_union([g for _, g in geo.ouvertures if g is not None]) if geo.ouvertures else Polygon()
    # murs : maçonnerie de façade, cloisons ; les baies sont découpées dans les murs
    pl.surface(geo.murs_int.difference(trous), vue, remplir=GRIS_CLOISON, couleur=NOIR, ep=0.3)
    pl.surface(geo.murs_ext.difference(trous), vue, remplir=GRIS_MUR, couleur=NOIR, ep=0.6)
    for o, g in geo.ouvertures:
        if g is None or not o.exterieure:
            continue
        # la baie : deux traits parallèles au mur (dormant), dans l'épaisseur du mur
        rr = g.minimum_rotated_rectangle
        c = list(rr.exterior.coords)[:4]
        cotes_ = sorted([(math.dist(c[i], c[(i + 1) % 4]), i) for i in range(4)])
        i = cotes_[-1][1]                         # un grand côté
        a, b = c[i], c[(i + 1) % 4]
        d, cc = c[(i + 3) % 4], c[(i + 2) % 4]    # le grand côté opposé
        for t in ((0.4, 0.6) if o.type != "porte de garage" else (0.5,)):
            p1 = (a[0] + (d[0] - a[0]) * t, a[1] + (d[1] - a[1]) * t)
            p2 = (b[0] + (cc[0] - b[0]) * t, b[1] + (cc[1] - b[1]) * t)
            pl.ligne(vue(*p1), vue(*p2), 0.35, NOIR, tirets="[2 1.5] 0" if o.type == "porte de garage" else None)
        pl.ligne(vue(*a), vue(*b), 0.3)
        pl.ligne(vue(*d), vue(*cc), 0.3)
    # couverts (porche, auvent) : contour en tirets et nom
    for c, g in geo.couverts:
        pl.surface(g, vue, remplir=None, couleur=NOIR, ep=0.4, tirets="[4 2] 0")
        m = g.representative_point()
        pt = vue(m.x, m.y)
        pl.texte(pt.x, pt.y + 2, c.nom, 6, ancre="c", couleur=GRIS)
    # pièces : nom et surface
    for p, g in geo.pieces:
        try:
            c = polylabel(g, 0.02)
        except Exception:
            c = g.representative_point()
        x0, y0, x1, y1 = g.bounds
        vertical = (x1 - x0) < 1.6 and (y1 - y0) > 1.4 * (x1 - x0)
        pt = vue(c.x, c.y)
        sous = ("SA : " if p.exclue_habitable else "SH : ") + nombre(p.surface_calculee) + " m²"
        taille = 7 if min(x1 - x0, y1 - y0) > 1.8 else 6
        if vertical:
            pl.texte(pt.x - 1, pt.y, p.nom, taille, gras=True, ancre="c", rot=90)
            pl.texte(pt.x + taille, pt.y, sous, taille - 1.5, ancre="c", rot=90, couleur=GRIS)
        else:
            pl.texte(pt.x, pt.y - 1, p.nom, taille, gras=True, ancre="c")
            pl.texte(pt.x, pt.y + taille, sous, taille - 1.5, ancre="c", couleur=GRIS)
    _chaines(pl, geo, vue)
    _reperes_coupes(pl, geo, vue, marge)
    # tableau, légende, nord, échelle : dans les places libres
    place = Placement(z, _occupation_plan(geo, vue, marge))
    surfaces = calculer(projet.batiment.niveaux[0], projet.points_arret["1_rdc"].valide)
    r = place.poser(170, hauteur_tableau(projet))
    if r:
        _tableau_surfaces(pl, r, projet, surfaces)
    r = place.poser(160, 52, ("bd", "bg", "hd", "hg"))
    if r:
        ep = max((m.epaisseur for m in projet.batiment.niveaux[0].murs if m.exterieur), default=0)
        pl.texte(r.x0, r.y0 + 8, "LÉGENDE", 7, gras=True)
        for i, (fill, lib) in enumerate(((GRIS_MUR, f"Maçonnerie des façades (ép. {nombre(ep * 100, 0)} cm)"),
                                         (GRIS_CLOISON, "Cloisons et murs intérieurs"),
                                         (BLANC, "Baie (menuiserie)"))):
            yy = r.y0 + 14 + i * 11
            pl.page.draw_rect(pymupdf.Rect(r.x0, yy, r.x0 + 14, yy + 6), color=NOIR, fill=fill, width=0.4)
            if fill == BLANC:
                pl.ligne((r.x0, yy + 2.4), (r.x0 + 14, yy + 2.4), 0.3)
                pl.ligne((r.x0, yy + 3.6), (r.x0 + 14, yy + 3.6), 0.3)
            pl.texte(r.x0 + 20, yy + 5.5, lib, 6.5)
    r = place.poser(150, 34, ("bd", "bg", "hd", "hg"))
    if r:
        pl.barre_echelle(r.x0, r.y0 + 12, e)
    r = place.poser(50, 50, ("hd", "hg", "bd", "bg"))
    if r:
        pl.fleche_nord(r.x0 + 25, r.y0 + 25, geo.nord, hypothese=geo.nord_suppose)
    avert = []
    if not projet.points_arret["1_rdc"].valide:
        avert.append("RDC interprété non validé (point d'arrêt n° 1) : surfaces à confirmer")
    manq = [o.id for o in projet.batiment.niveaux[0].ouvertures if o.exterieure and not o.hauteur.valeur]
    if manq:
        avert.append(f"baies sans hauteur lue sur le plan : {', '.join(manq)}")
    avert += geo.hypotheses("nord")
    r = place.poser(260, 12 + 8 * len(avert), ("bg", "bd", "hg", "hd")) if avert else None
    pl.avertissement(avert, *((r.x0, r.y0 + 8) if r else (None, None)))
    return pl


def _reperes_coupes(pl: Planche, geo: Geo, vue: Vue, marge: float):
    """Les coupes A-A et B-B repérées au bord du plan, avec le sens du regard."""
    minx, miny, maxx, maxy = geo.contour.bounds
    for nom, ligne, regard in lignes_de_coupe(geo):
        (x0, y0), (x1, y1) = ligne.coords[0], ligne.coords[-1]
        horiz = abs(y1 - y0) < 1e-9
        for bout in (0, 1):
            if horiz:
                x = minx if bout == 0 else maxx
                p = vue(x, y0)
                p = pymupdf.Point(p.x + (-1 if bout == 0 else 1) * (marge + 6), p.y)
            else:
                y = miny if bout == 0 else maxy
                p = vue(x0, y)
                p = pymupdf.Point(p.x, p.y + (1 if bout == 0 else -1) * (marge + 6))
            # trait mixte de coupe, flèche dans le sens du regard, lettre
            dx, dy = regard[0], -regard[1]
            if horiz:
                pl.ligne((p.x - 7, p.y), (p.x + 7, p.y), 1.2, ROUGE)
            else:
                pl.ligne((p.x, p.y - 7), (p.x, p.y + 7), 1.2, ROUGE)
            pointe = (p.x + dx * 9, p.y + dy * 9)
            base1 = (p.x + dx * 3 + dy * 4, p.y + dy * 3 - dx * 4)
            base2 = (p.x + dx * 3 - dy * 4, p.y + dy * 3 + dx * 4)
            pl.poly([pointe, base1, base2], remplir=ROUGE, couleur=ROUGE, ep=0.3)
            pl.texte(p.x - dx * 6 + (0 if horiz else 8), p.y - dy * 6 + (3 if horiz else 3), nom, 8, gras=True,
                     ancre="c", couleur=ROUGE)


# ------------------------------------------------------------ plan de toiture

def _teinte_pan(normale) -> tuple:
    # éclairage venant du haut-gauche du plan
    l = (-0.6, 0.8)
    v = normale[0] * l[0] + normale[1] * l[1]
    return TOIT_CLAIR if v > 0.3 else (TOIT_FONCE if v < -0.3 else TOIT_MOYEN)


def plan_toiture(doc, projet, reglages) -> Planche:
    geo = Geo(projet)
    T = geo.toiture
    minx, miny, maxx, maxy = (T.egout.bounds if T else geo.contour.bounds)
    marge = marge_cotes(2)
    tmp = pymupdf.open()
    z = Planche(tmp, projet, reglages, "", "", "", "").zone
    e = echelle_pour(maxx - minx, maxy - miny, z.width - 2 * marge, z.height - 2 * marge, [50, 75, 100, 125, 150, 200])
    v = geo.vol
    pl = Planche(doc, projet, reglages, "PLAN DE", "toiture", "PCMI 5", f"1/{e}", "PLAN DE TOITURE",
                 f"Hauteurs des faîtages par rapport au sol fini du RDC (±0,00{geo.ngf()}) – même orientation que le plan du RDC")
    z = pl.zone
    vue = Vue(e, ((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2), ((minx + maxx) / 2, (miny + maxy) / 2))
    if not T:
        pl.texte(z.x0, z.y0 + 20, geo.erreur_toit, 9, couleur=ROUGE)
        return pl
    for pan in T.pans:
        pl.surface(pan.polygone, vue, remplir=_teinte_pan(pan.normale), couleur=None)
    # hachures de couverture : traits dans le sens de la pente
    for pan in T.pans:
        nx, ny = pan.normale
        g = pan.polygone
        x0, y0, x1, y1 = g.bounds
        L = max(x1 - x0, y1 - y0) * 2
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        pas = 0.45
        k = -L
        while k <= L:
            ox, oy = cx + (-ny) * k, cy + nx * k
            trait = LineString([(ox - nx * L, oy - ny * L), (ox + nx * L, oy + ny * L)]).intersection(g.buffer(-0.05))
            for s in (trait.geoms if hasattr(trait, "geoms") else [trait]):
                if s.geom_type == "LineString" and s.length > 0.1:
                    pl.ligne(vue(*s.coords[0]), vue(*s.coords[-1]), 0.15, (0.55, 0.56, 0.6))
            k += pas
    pl.surface(T.egout, vue, remplir=None, couleur=NOIR, ep=0.9)
    pl.poly([vue(x, y) for x, y in geo.contour.exterior.coords], couleur=NOIR, ep=0.35, tirets="[3 2] 0")
    for l in T.lignes:
        a, b = l.ligne.coords[0], l.ligne.coords[-1]
        if l.genre == "faitage":
            pl.ligne(vue(*a), vue(*b), 1.3)
        elif l.genre == "arretier":
            pl.ligne(vue(*a), vue(*b), 0.7)
        else:
            pl.ligne(vue(*a), vue(*b), 0.7, (0.15, 0.3, 0.6), tirets="[3 1.5] 0")
    # étiquettes des faîtages
    for l in T.lignes:
        if l.genre != "faitage":
            continue
        a, b = l.ligne.coords[0], l.ligne.coords[-1]
        m = vue((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        t = f"Faîtage {signe(l.z0)}"
        vertical = abs(b[1] - a[1]) > abs(b[0] - a[0])
        w = pl.largeur_texte(t, 6, True) + 6
        if vertical:
            pl.page.draw_rect(pymupdf.Rect(m.x - 5, m.y - w / 2, m.x + 5, m.y + w / 2), color=None, fill=BLANC)
            pl.texte(m.x + 2.5, m.y, t, 6, gras=True, ancre="c", rot=90, couleur=ROUGE)
        else:
            pl.page.draw_rect(pymupdf.Rect(m.x - w / 2, m.y - 9, m.x + w / 2, m.y + 1), color=None, fill=BLANC)
            pl.texte(m.x, m.y - 1.5, t, 6, gras=True, ancre="c", couleur=ROUGE)
    # flèches de pente sur chaque pan
    for pan in T.pans:
        g = pan.polygone
        if g.area < 1.0:
            continue
        try:
            c = polylabel(g, 0.05)
        except Exception:
            c = g.representative_point()
        nx, ny = pan.normale
        p0 = vue(c.x - nx * 0.35, c.y - ny * 0.35)
        p1 = vue(c.x + nx * 0.35, c.y + ny * 0.35)
        pl.ligne(p0, p1, 0.6)
        ang = math.atan2(p1.y - p0.y, p1.x - p0.x)
        for s in (1, -1):
            pl.ligne(p1, (p1.x - 4 * math.cos(ang + s * 0.45), p1.y - 4 * math.sin(ang + s * 0.45)), 0.6)
        pl.texte(p0.x + (p0.x - p1.x) * 0.6, p0.y + (p0.y - p1.y) * 0.6 + 2, f"{nombre(T.pente_deg, 0)}°", 6,
                 gras=True, ancre="c")
    # cotes de l'égout
    geo_egout = Geo.__new__(Geo)
    geo_egout.contour = T.egout
    geo_egout.ouvertures = []
    _chaines(pl, geo_egout, vue, cotes_baies=False)
    place = Placement(z, _occupation_plan(geo_egout, vue, marge))
    r = place.poser(165, 112)
    if r:
        y = r.y0 + 8
        pl.texte(r.x0, y, "COUVERTURE", 7, gras=True)
        lignes = [v.couverture or "[couverture à préciser]",
                  f"Toiture à croupes, pente {nombre(T.pente_deg, 0)}° sur tous les pans",
                  f"Égout à {signe(T.hauteur_egout)} ; débord {nombre(T.debord)} m",
                  "Faîtages : " + " ; ".join(signe(f) for f in T.faitages)]
        for i, l in enumerate(lignes):
            pl.texte(r.x0, y + 10 + i * 9, l, 6.5, couleur=ROUGE if l.startswith("[") else NOIR)
        y += 10 + len(lignes) * 9 + 8
        pl.texte(r.x0, y, "LÉGENDE", 7, gras=True)
        for i, (lib, ep, coul, tir) in enumerate((("Faîtage", 1.3, NOIR, None), ("Arêtier", 0.7, NOIR, None),
                                                  ("Noue", 0.7, (0.15, 0.3, 0.6), "[3 1.5] 0"),
                                                  ("Égout (bord du débord)", 0.9, NOIR, None),
                                                  ("Nu extérieur des murs (sous toiture)", 0.35, NOIR, "[3 2] 0"))):
            yy = y + 8 + i * 9
            pl.ligne((r.x0, yy - 2), (r.x0 + 18, yy - 2), ep, coul, tirets=tir)
            pl.texte(r.x0 + 24, yy, lib, 6.5)
    r = place.poser(150, 34, ("bd", "bg", "hd", "hg"))
    if r:
        pl.barre_echelle(r.x0, r.y0 + 12, e)
    r = place.poser(50, 50, ("hd", "hg", "bd", "bg"))
    if r:
        pl.fleche_nord(r.x0 + 25, r.y0 + 25, geo.nord, hypothese=geo.nord_suppose)
    avert = geo.hypotheses("hauteur_egout", "pente_toiture", "debord_toiture", "nord")
    r = place.poser(260, 12 + 8 * len(avert), ("bg", "bd", "hg", "hd")) if avert else None
    pl.avertissement(avert, *((r.x0, r.y0 + 8) if r else (None, None)))
    return pl


# ------------------------------------------------------------ façades

def _couleur_toit(couverture: str):
    c = (couverture or "").lower()
    if "tuile" in c and not re.search(r"ardoise|anthracite|noir|gris", c):
        return (0.66, 0.36, 0.26)
    if re.search(r"ardoise|anthracite|zinc|bac acier|noir|gris", c):
        return TUILE
    return (0.45, 0.45, 0.47)


def nom_facade(d, nord_deg: float) -> str:
    """Nord, sud, est ou ouest selon la normale extérieure de la façade."""
    a = math.radians(nord_deg)
    N = (math.cos(a), math.sin(a))
    E = (math.sin(a), -math.cos(a))
    pn, pe = d[0] * N[0] + d[1] * N[1], d[0] * E[0] + d[1] * E[1]
    if abs(pn) >= abs(pe):
        return "NORD" if pn > 0 else "SUD"
    return "EST" if pe > 0 else "OUEST"


class Elevation:
    """Une façade vue de face : murs, baies et pans de toiture projetés, le
    plus proche recouvrant le plus lointain."""

    def __init__(self, geo: Geo, d):
        self.geo, self.d = geo, d
        self.U = (-d[1], d[0])                     # la droite de l'observateur
        v = geo.vol
        self.tf = v.terrain_fini.valeur if v.terrain_fini.valeur is not None else -0.15
        self.egout = v.hauteur_egout.valeur
        self.elements = []                         # (profondeur, ordre, genre, polygone (u, z), objet)
        self.baies = []
        faces = faces_visibles(geo.contour, d)
        # tous les murs tournés vers l'observateur (même ceux en partie cachés : la toiture
        # ou le volume le plus proche les recouvrent au dessin)
        tous = [(a, b) for a, b, n in _bords(geo.contour) if n[0] * d[0] + n[1] * d[1] > 0.9998]
        for a, b in tous:
            u0, u1 = sorted((self.u(a), self.u(b)))
            prof = self.w(a)
            self.elements.append((prof, 0, "mur", box(u0, self.tf, u1, self.egout), None))
            for o, g in geo.ouvertures:
                if g is None or not o.exterieure or LineString([a, b]).distance(g) > 0.02:
                    continue
                if not o.hauteur.valeur:
                    continue
                us = [self.u(c) for c in g.exterior.coords]
                al = o.allege.valeur or 0.0
                r = box(min(us), al, max(us), al + o.hauteur.valeur)
                self.elements.append((prof + 1e-3, 1, "baie", r, o))
                self.baies.append((r, o, prof))
        T = geo.toiture
        self.T = T
        if T:
            for pan in T.pans:
                pts = [(self.u(c), pan.z(*c)) for c in pan.polygone.exterior.coords]
                g = Polygon(pts).buffer(0)
                if g.is_empty or g.area < 1e-4:
                    continue
                prof = sum(self.w(c) for c in pan.polygone.exterior.coords) / len(pan.polygone.exterior.coords)
                self.elements.append((prof, 2, "pan", g, pan))
        self.elements.sort(key=lambda e: (e[0], e[1]))
        us = [self.u(c) for c in geo.contour.exterior.coords]
        self.umin, self.umax = min(us), max(us)
        self.largeur_murs = self.umax - self.umin
        toit = unary_union([e[3] for e in self.elements if e[2] == "pan"]) if T else Polygon()
        self.silhouette = toit
        self.zmax = max(self.egout, toit.bounds[3] if not toit.is_empty else self.egout)
        if T:
            ue = [self.u(c) for c in T.egout.exterior.coords]
            self.umin_t, self.umax_t = min(ue), max(ue)
        else:
            self.umin_t, self.umax_t = self.umin, self.umax
        faces_u = sorted((min(self.u(a), self.u(b)), max(self.u(a), self.u(b))) for a, b in faces)
        self.faces_u = faces_u

    def u(self, p):
        return p[0] * self.U[0] + p[1] * self.U[1]

    def w(self, p):
        return p[0] * self.d[0] + p[1] * self.d[1]

    # marges en points : niveaux à gauche, repères des faîtages au-dessus, cotes et titre dessous
    GAUCHE, DROITE, DESSUS, DESSOUS = 46.0, 6.0, 12.0, 40.0

    def taille(self, k):
        """Encombrement sur la planche, en points, à k points par mètre."""
        return ((self.umax_t - self.umin_t) * k + self.GAUCHE + self.DROITE,
                (self.zmax - self.tf) * k + self.DESSUS + self.DESSOUS)

    def dessiner(self, pl: Planche, vue: Vue, titre: str, sous_titre: str):
        couleur_toit = _couleur_toit(self.geo.vol.couverture)
        couvert = Polygon()
        # du plus proche au plus lointain : chaque élément n'est dessiné que là où rien ne le cache
        for prof, ordre, genre, g, obj in reversed(self.elements):
            vis = g.difference(couvert) if not couvert.is_empty else g
            couvert = couvert.union(g) if not couvert.is_empty else g
            if vis.is_empty:
                continue
            if genre == "mur":
                pl.surface(vis, vue, remplir=ENDUIT, couleur=NOIR, ep=0.5)
            elif genre == "baie":
                self._baie(pl, vue, g, obj, vis)
            else:
                nx, ny = obj.normale
                face = nx * self.d[0] + ny * self.d[1]
                teinte = tuple(min(1, c * (1.15 if face > 0.3 else (0.9 if face < -0.3 else 1.0))) for c in couleur_toit)
                pl.surface(vis, vue, remplir=teinte, couleur=NOIR, ep=0.45)
        # terrain
        a, b = vue(self.umin_t, self.tf), vue(self.umax_t, self.tf)
        pl.ligne((a.x - 30, a.y), (b.x + 4, b.y), 1.2)
        # niveaux à gauche
        xg = vue(self.umin_t, 0).x - 12
        ngf = self.geo.n.altitude_sol_fini.valeur
        pl.niveau(xg, vue(0, 0).y, "±0,00", f"RDC fini {nombre(ngf)}" if ngf is not None else "RDC fini", cote_droit=False)
        pl.niveau(xg, vue(0, self.egout).y, signe(self.egout), "égout", cote_droit=False)
        pl.texte(xg - 8, vue(0, self.tf).y + 8, f"TF {signe(self.tf)}", 5.5, ancre="d", couleur=GRIS)
        # faîtages : au-dessus de chaque faîtage vu
        if self.T:
            vus = []
            for l in self.T.lignes:
                if l.genre != "faitage":
                    continue
                us = [self.u(c) for c in l.ligne.coords]
                um = (min(us) + max(us)) / 2
                z = l.z0
                if any(abs(z - z2) < 0.02 and abs(um - u2) < 1.5 for z2, u2 in vus):
                    continue
                # vu si rien n'est au-dessus de lui à cet endroit
                if self.silhouette.buffer(1e-3).contains(Point(um, z + 0.08)):
                    continue
                vus.append((z, um))
                p = vue(um, z)
                pl.niveau(p.x, p.y - 6, signe(z), cote_droit=True, taille=6)
        # baies : dimensions sous la façade
        for r, o, prof in self.baies:
            um = (r.bounds[0] + r.bounds[2]) / 2
            p = vue(um, self.tf)
            t, sous = _cote_texte_baie(o)
            pl.texte(p.x, p.y + 8, t, 5.5, ancre="c")
            if sous:
                pl.texte(p.x, p.y + 14, sous.replace("all.", "allège"), 5, ancre="c", couleur=GRIS)
        # longueur de la façade
        y = vue(0, self.tf).y + 22
        pl.cote((vue(self.umin, 0).x, y), (vue(self.umax, 0).x, y), 0, nombre(self.umax - self.umin), taille=6)
        xt = vue(self.umin_t, 0).x - 30
        pl.texte(xt, y + 17, titre, 10, gras=True)
        pl.texte(xt + pl.largeur_texte(titre, 10, True) + 8, y + 17, sous_titre, 6.5, couleur=GRIS)

    def _baie(self, pl, vue, g, o, vis):
        x0, z0, x1, z1 = g.bounds
        if o.type == "porte de garage" or o.menuiserie == "garage":
            pl.surface(vis, vue, remplir=(0.30, 0.31, 0.33), couleur=NOIR, ep=0.5)
            n = max(4, int((z1 - z0) / 0.5))
            for i in range(1, n):
                z = z0 + (z1 - z0) * i / n
                pl.ligne(vue(x0, z), vue(x1, z), 0.25, (0.55, 0.55, 0.55))
            return
        porte_pleine = o.menuiserie == "pleine"
        pl.surface(vis, vue, remplir=(0.30, 0.31, 0.33) if porte_pleine else VITRAGE, couleur=NOIR, ep=0.5)
        # dormant et montants
        e = 0.06
        pl.poly([vue(x0 + e, z0 + e), vue(x1 - e, z0 + e), vue(x1 - e, z1 - e), vue(x0 + e, z1 - e)],
                couleur=(0.3, 0.3, 0.32), ep=0.4)
        if not porte_pleine:
            n = 1 if (x1 - x0) < 1.0 else (2 if (x1 - x0) < 2.4 else 3)
            for i in range(1, n):
                x = x0 + (x1 - x0) * i / n
                pl.ligne(vue(x, z0 + e), vue(x, z1 - e), 0.4, (0.3, 0.3, 0.32))


def facades(doc, projet, reglages) -> list[Planche]:
    geo = Geo(projet)
    dirs = [(0, -1), (0, 1), (1, 0), (-1, 0)]
    elev = [(Elevation(geo, d), d) for d in dirs]
    tmp = pymupdf.open()
    zone = Planche(tmp, projet, reglages, "", "", "", "").zone
    for e in (100, 125, 150, 200):
        k = PT_PAR_M / e
        # rangées : les plus larges d'abord ; deux façades côte à côte quand elles tiennent
        tailles = sorted(((ev.taille(k), ev, d) for ev, d in elev), key=lambda t: -t[0][0])
        rangees, cour, lcour = [], [], 0
        for (w, h), ev, d in tailles:
            if cour and lcour + w <= zone.width:
                cour.append(((w, h), ev, d))
                lcour += w
            else:
                if cour:
                    rangees.append(cour)
                cour, lcour = [((w, h), ev, d)], w
        rangees.append(cour)
        if sum(max(h for (w, h), _, _ in r) for r in rangees) <= zone.height:
            break
    pages = []
    lib = f"1/{e}"
    pl = Planche(doc, projet, reglages, "FAÇADES", "et toitures", "PCMI 5", lib, "",
                 f"Hauteurs par rapport au sol fini du RDC (±0,00{geo.ngf()}) – baies : largeur × hauteur")
    pages.append(pl)
    y = pl.zone.y0
    for rangee in rangees:
        hmax = max(h for (w, h), _, _ in rangee)
        if y + hmax > pl.zone.y1 + 1:
            pl = Planche(doc, projet, reglages, "FAÇADES", "et toitures", "PCMI 5", lib, "")
            pages.append(pl)
            y = pl.zone.y0
        x = pl.zone.x0
        for (w, h), ev, d in rangee:
            # niveaux à gauche, le terrain fini au-dessus des cotes et du titre
            cx = x + Elevation.GAUCHE + (ev.umax_t - ev.umin_t) / 2 * k
            vue = Vue(e, (cx, y + hmax - Elevation.DESSOUS), ((ev.umin_t + ev.umax_t) / 2, ev.tf))
            ev.dessiner(pl, vue, f"FAÇADE {nom_facade(d, geo.nord)}", f"échelle {lib}")
            x += w
        y += hmax
    avert = geo.hypotheses("hauteur_egout", "pente_toiture", "debord_toiture", "terrain_fini", "nord")
    manq = [o.id for o in geo.n.ouvertures if o.exterieure and not o.hauteur.valeur]
    if manq:
        avert.append(f"baies non dessinées (hauteur inconnue) : {', '.join(manq)}")
    if not geo.vol.couverture:
        avert.append("couverture (matériau, teinte) non précisée")
    if geo.erreur_toit:
        avert.append(geo.erreur_toit)
    if avert:
        pages[-1].avertissement(avert, pages[-1].zone.x1 - 250, pages[-1].zone.y0 + 8)
    return pages


# ------------------------------------------------------------ coupes

def lignes_de_coupe(geo: Geo):
    """A-A dans la longueur, B-B en travers, chacune passant par le milieu de
    pièces (jamais le long d'un mur) et traversant le plus de maison possible.
    Rend [(nom, ligne, sens_du_regard)] dans le repère du dessin."""
    minx, miny, maxx, maxy = geo.contour.bounds
    long_x = (maxx - minx) >= (maxy - miny)
    out = []
    for nom, horizontale in (("A", long_x), ("B", not long_x)):
        cands = []
        for p, g in geo.pieces:
            try:
                c = polylabel(g, 0.05)
            except Exception:
                c = g.representative_point()
            v = c.y if horizontale else c.x
            L = (LineString([(minx - 1, v), (maxx + 1, v)]) if horizontale
                 else LineString([(v, miny - 1), (v, maxy + 1)])).intersection(geo.contour).length
            # ne pas longer un mur intérieur
            murs = geo.murs_int.buffer(0.05)
            ligne = LineString([(minx, v), (maxx, v)]) if horizontale else LineString([(v, miny), (v, maxy)])
            longe = ligne.intersection(murs).length
            cands.append((L - 3 * longe, v))
        if not cands:
            continue
        _, v = max(cands)
        if horizontale:
            ligne = LineString([(minx - 1.5, v), (maxx + 1.5, v)])
            regard = (0, 1)      # vers le haut du plan
        else:
            ligne = LineString([(v, miny - 1.5), (v, maxy + 1.5)])
            regard = (-1, 0)     # vers la gauche du plan
        out.append((nom, ligne, regard))
    return out


class Coupe:
    """Une coupe verticale : ce qui est coupé (dalle, murs, toiture) en
    aplats, ce qui est au-delà (pans de toiture, murs) en élévation."""

    EP_DALLE = 0.20
    EP_ISOLANT = 0.30
    EP_TOIT = 0.22

    def __init__(self, geo: Geo, nom: str, ligne: LineString, regard):
        self.geo, self.nom, self.ligne = geo, nom, ligne
        self.regard = regard
        d = (-regard[0], -regard[1])                  # l'observateur est de l'autre côté
        self.d = d
        self.U = (-d[1], d[0])
        v = geo.vol
        self.tf = v.terrain_fini.valeur if v.terrain_fini.valeur is not None else -0.15
        self.vs = v.vide_sanitaire.valeur or 0.6
        self.arase = v.hauteur_arase.valeur
        self.egout = v.hauteur_egout.valeur
        self.hsp = geo.n.hauteur_sous_plafond.valeur or 2.5
        (x0, y0), (x1, y1) = ligne.coords[0], ligne.coords[-1]
        self.p0 = (x0, y0)
        self.w_coupe = self.w(self.p0)
        T = geo.toiture
        self.T = T
        us = [self.u(c) for c in (T.egout.exterior.coords if T else geo.contour.exterior.coords)]
        self.umin, self.umax = min(us), max(us)
        self.zmax = max([self.egout] + ([max(T.faitages)] if T and T.faitages else []))

    def u(self, p):
        return p[0] * self.U[0] + p[1] * self.U[1]

    def w(self, p):
        return p[0] * self.d[0] + p[1] * self.d[1]

    def intervalles(self, g) -> list[tuple[float, float]]:
        inter = self.ligne.intersection(g)
        out = []
        for s in (inter.geoms if hasattr(inter, "geoms") else [inter]):
            if s.geom_type == "LineString" and s.length > 1e-3:
                a, b = sorted((self.u(s.coords[0]), self.u(s.coords[-1])))
                out.append((a, b))
        return sorted(out)

    GAUCHE, DROITE, DESSUS, DESSOUS = 70.0, 70.0, 14.0, 34.0

    def taille(self, k):
        return ((self.umax - self.umin) * k + self.GAUCHE + self.DROITE,
                (self.zmax - (self.tf - self.vs - 0.6)) * k + self.DESSUS + self.DESSOUS)

    def dessiner(self, pl: Planche, vue: Vue, titre: str, sous: str):
        geo, T = self.geo, self.T
        couleur_toit = _couleur_toit(geo.vol.couverture)
        bas_vs = -self.EP_DALLE - self.vs
        # 1. au-delà de la coupe : pans de toiture et murs tournés vers l'observateur
        demi = self._demi_plan()
        elements = []
        if T:
            for pan in T.pans:
                g = pan.polygone.intersection(demi)
                for part in (g.geoms if hasattr(g, "geoms") else [g]):
                    if part.geom_type != "Polygon" or part.area < 1e-3:
                        continue
                    pts = [(self.u(c), pan.z(*c)) for c in part.exterior.coords]
                    pg = Polygon(pts).buffer(0)
                    if pg.is_empty or pg.area < 1e-4:
                        continue
                    prof = sum(self.w(c) for c in part.exterior.coords) / len(part.exterior.coords)
                    elements.append((prof, "pan", pg, pan))
        for a, b, n in _bords(geo.contour):
            if n[0] * self.d[0] + n[1] * self.d[1] < 0.9998:
                continue
            seg = LineString([a, b]).intersection(demi)
            if seg.is_empty or seg.length < 0.05:
                continue
            u0, u1 = sorted((self.u(seg.coords[0]), self.u(seg.coords[-1])))
            elements.append((self.w(a), "mur", box(u0, self.tf, u1, self.egout), None))
        elements.sort(key=lambda e: e[0])
        # la maison coupée (du sol à la couverture) cache ce qui est au-delà
        profil = self._profil_toit()
        maison = self.intervalles(geo.contour)
        coupe_pleine = Polygon()
        if profil:
            coupe_pleine = Polygon(profil + [(profil[-1][0], bas_vs - 0.6), (profil[0][0], bas_vs - 0.6)]).buffer(0)
        for a, b in maison:
            coupe_pleine = coupe_pleine.union(box(a, bas_vs - 0.6, b, self.arase))
        couvert = coupe_pleine
        clair = tuple(min(1, c * 1.45 + 0.1) for c in couleur_toit)
        for prof, genre, g, obj in reversed(elements):
            vis = g.difference(couvert) if not couvert.is_empty else g
            couvert = couvert.union(g) if not couvert.is_empty else g
            if vis.is_empty:
                continue
            if genre == "pan":
                pl.surface(vis, vue, remplir=clair, couleur=GRIS, ep=0.35)
            else:
                pl.surface(vis, vue, remplir=ENDUIT, couleur=GRIS, ep=0.35)
        # 2. le sol : terrain fini et terre sous le terrain
        ga, gb = self.umin - 1.5, self.umax + 1.5
        pl.surface(box(ga, bas_vs - 0.6, gb, self.tf), vue, remplir=(0.93, 0.90, 0.84), couleur=None)
        if not coupe_pleine.is_empty:
            pl.surface(coupe_pleine.intersection(box(ga, self.tf, gb, 99)), vue, remplir=BLANC, couleur=None)
        # 3. ce qui est coupé : vide sanitaire, dalle, murs, isolant, toiture
        for a, b in maison:
            pl.surface(box(a, bas_vs, b, -self.EP_DALLE), vue, remplir=BLANC, couleur=NOIR, ep=0.4)
            pl.surface(box(a, -self.EP_DALLE, b, 0), vue, remplir=(0.62, 0.62, 0.62), couleur=NOIR, ep=0.5)
            pl.surface(box(a, self.hsp, b, self.hsp + 0.03), vue, remplir=(0.6, 0.6, 0.6), couleur=None)
            pl.surface(box(a, self.hsp + 0.03, b, min(self.hsp + 0.03 + self.EP_ISOLANT, self.arase + 0.2)), vue,
                       remplir=(0.98, 0.93, 0.78), couleur=None)
            m = vue((a + b) / 2, bas_vs + self.vs / 2)
            if b - a > 2.0:
                pl.texte(m.x, m.y + 2, "Vide sanitaire", 5.5, ancre="c", couleur=GRIS)
        for a, b in self.intervalles(geo.murs_ext):
            pl.surface(box(a, bas_vs - 0.25, b, self.arase), vue, remplir=(0.35, 0.35, 0.35), couleur=NOIR, ep=0.5)
        for a, b in self.intervalles(geo.murs_int):
            pl.surface(box(a, 0, b, self.hsp), vue, remplir=(0.55, 0.55, 0.55), couleur=NOIR, ep=0.3)
        # baies coupées
        for o, g in geo.ouvertures:
            if g is None or not o.exterieure or not o.hauteur.valeur:
                continue
            for a, b in self.intervalles(g):
                al = o.allege.valeur or 0
                pl.surface(box(a, al, b, al + o.hauteur.valeur), vue, remplir=VITRAGE, couleur=NOIR, ep=0.4)
        # toiture coupée
        if T:
            pts = profil
            if len(pts) > 2:
                haut = pts
                bas = [(uu, z - self.EP_TOIT) for uu, z in reversed(pts)]
                pl.poly([vue(*c) for c in haut + bas], remplir=couleur_toit, couleur=NOIR, ep=0.5)
                for a, b in maison:
                    m = vue((a + b) / 2, self.hsp + 0.6)
                    if b - a > 3 and T.z(*self._point((a + b) / 2)) and T.z(*self._point((a + b) / 2)) > self.hsp + 1.0:
                        pl.texte(m.x, m.y, "Comble perdu", 5.5, ancre="c", couleur=GRIS)
        # 4. terrain fini
        pl.ligne(vue(ga, self.tf), vue(gb, self.tf), 1.2)
        # 5. pièces coupées
        for p, g in geo.pieces:
            for a, b in self.intervalles(g):
                if b - a > 0.9:
                    m = vue((a + b) / 2, 0.35)
                    pl.texte(m.x, m.y, p.nom, 5.5 if b - a < 2 else 6.5, gras=True, ancre="c")
        # 6. niveaux
        xg = vue(self.umin, 0).x - 16
        ngf = geo.n.altitude_sol_fini.valeur
        pl.niveau(xg, vue(0, 0).y, "±0,00", f"RDC fini {nombre(ngf)}" if ngf is not None else "RDC fini", cote_droit=False)
        pl.niveau(xg, vue(0, self.egout).y, signe(self.egout), "égout", cote_droit=False)
        xd = vue(self.umax, 0).x + 16
        pl.niveau(xd, vue(0, self.arase).y, signe(self.arase), "arase maçonnerie")
        if maison:
            a, b = max(maison, key=lambda x: x[1] - x[0])
            pl.niveau(vue(b - 0.9, 0).x, vue(0, self.hsp).y, signe(self.hsp), "plafond", cote_droit=False, taille=5.5)
        pl.texte(xd + 8, vue(0, self.tf).y + 8, f"TF {signe(self.tf)}", 5.5, couleur=GRIS)
        if T:
            vus = set()
            for l in T.lignes:
                if l.genre != "faitage":
                    continue
                us = [self.u(c) for c in l.ligne.coords]
                z = round(l.z0, 2)
                if z in vus:
                    continue
                vus.add(z)
                p = vue((min(us) + max(us)) / 2, z)
                pl.niveau(p.x, p.y - 6, signe(z), taille=6)
        # 7. longueur coupée et titre
        y = vue(0, bas_vs - 0.6).y + 12
        if maison:
            pl.cote((vue(maison[0][0], 0).x, y), (vue(maison[-1][1], 0).x, y), 0,
                    nombre(maison[-1][1] - maison[0][0]), taille=6)
        xt = vue(self.umin, 0).x - 60
        pl.texte(xt, y + 20, titre, 10, gras=True)
        pl.texte(xt + pl.largeur_texte(titre, 10, True) + 8, y + 20, sous, 6.5, couleur=GRIS)

    def _profil_toit(self, n=240):
        """Le dessus de la couverture le long de la ligne de coupe."""
        if not self.T:
            return []
        pts = []
        for i in range(n + 1):
            uu = self.umin + (self.umax - self.umin) * i / n
            z = self.T.z(*self._point(uu))
            if z is not None:
                pts.append((uu, z))
        return pts

    def _point(self, uu):
        """Le point de la ligne de coupe d'abscisse uu."""
        (x0, y0), (x1, y1) = self.ligne.coords[0], self.ligne.coords[-1]
        u0, u1 = self.u((x0, y0)), self.u((x1, y1))
        t = (uu - u0) / (u1 - u0) if u1 != u0 else 0
        return (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)

    def _demi_plan(self):
        """Ce qui est au-delà de la ligne de coupe, dans le sens du regard."""
        x0, y0, x1, y1 = self.geo.contour.bounds
        L = (x1 - x0) + (y1 - y0) + 20
        (a, b), (c, d_) = self.ligne.coords[0], self.ligne.coords[-1]
        rx, ry = self.regard
        return Polygon([(a - (c - a) * L, b - (d_ - b) * L), (c + (c - a) * L, d_ + (d_ - b) * L),
                        (c + (c - a) * L + rx * L, d_ + (d_ - b) * L + ry * L),
                        (a - (c - a) * L + rx * L, b - (d_ - b) * L + ry * L)])


def _reperage(pl: Planche, geo: Geo, coupes, r: pymupdf.Rect):
    """Petit plan de repérage des coupes."""
    x0, y0, x1, y1 = geo.contour.bounds
    e = echelle_pour(x1 - x0 + 3, y1 - y0 + 3, r.width, r.height - 12, [200, 250, 300, 400, 500, 750, 1000])
    vue = Vue(e, ((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2 + 6), ((x0 + x1) / 2, (y0 + y1) / 2))
    pl.texte(r.x0, r.y0 + 6, "Repérage des coupes", 6.5, gras=True)
    pl.surface(geo.contour, vue, remplir=(0.75, 0.75, 0.78), couleur=NOIR, ep=0.4)
    for nom, ligne, regard in coupes:
        a, b = ligne.coords[0], ligne.coords[-1]
        pl.ligne(vue(*a), vue(*b), 0.6, ROUGE, tirets="[4 1.5 1 1.5] 0")
        for p in (a, b):
            q = vue(*p)
            pl.texte(q.x + regard[0] * 6, q.y - regard[1] * 6 + 2, nom, 7, gras=True, ancre="c", couleur=ROUGE)


def coupes(doc, projet, reglages) -> list[Planche]:
    geo = Geo(projet)
    lignes = lignes_de_coupe(geo)
    cps = [Coupe(geo, nom, l, r) for nom, l, r in lignes]
    tmp = pymupdf.open()
    zone = Planche(tmp, projet, reglages, "", "", "", "").zone
    for e in (100, 125, 150, 200):
        k = PT_PAR_M / e
        if sum(c.taille(k)[1] for c in cps) <= zone.height - 10 and all(c.taille(k)[0] <= zone.width for c in cps):
            break
    k = PT_PAR_M / e
    lib = f"1/{e}"
    pl = Planche(doc, projet, reglages, "COUPES", "sur terrain", "PCMI 3", lib, "",
                 f"Niveaux par rapport au sol fini du RDC (±0,00{geo.ngf()}) – plancher sur vide sanitaire")
    y = pl.zone.y0
    for c, (nom, l, r) in zip(cps, lignes):
        w, h = c.taille(k)
        x = pl.zone.x0
        cx = x + Coupe.GAUCHE + (c.umax - c.umin) / 2 * k
        base = y + Coupe.DESSUS + (c.zmax - (c.tf - c.vs - 0.6)) * k
        vue = Vue(e, (cx, base), ((c.umin + c.umax) / 2, c.tf - c.vs - 0.6))
        sens = {(0, 1): "vers le haut du plan", (-1, 0): "vers la gauche du plan",
                (0, -1): "vers le bas du plan", (1, 0): "vers la droite du plan"}[r]
        c.dessiner(pl, vue, f"COUPE {nom}–{nom}", f"regard {sens} – échelle {lib}")
        y += h
    # repérage des coupes
    place = Placement(pl.zone, box(pl.zone.x0, pl.zone.y0, pl.zone.x1, y))
    r = place.poser(150, 120, ("bd", "hd", "bg", "hg"))
    if r:
        _reperage(pl, geo, lignes, r)
    avert = geo.hypotheses("hauteur_egout", "hauteur_arase", "pente_toiture", "vide_sanitaire", "terrain_fini")
    if geo.n.hauteur_sous_plafond.statut != Statut.CONFIRME:
        avert.append(f"hauteur sous plafond : {nombre(geo.n.hauteur_sous_plafond.valeur)} m (valeur supposée)")
    avert.append("terrain naturel (TN) non relevé : profil du terrain à reporter depuis le plan de masse")
    r = place.poser(290, 14 + 8 * len(avert), ("bg", "bd", "hg", "hd"))
    pl.avertissement(avert, *((r.x0, r.y0 + 8) if r else (None, None)))
    return [pl]


# ------------------------------------------------------------ page de garde

def page_de_garde(doc, projet, reglages) -> Planche:
    """Au modèle de la page de garde de CP Constructions : société, maître
    d'ouvrage, titre du dossier, couverture et chauffage, modifications,
    lieu de construction ; tableau des surfaces et résumé du projet."""
    pl = Planche(doc, projet, reglages, "", cartouche=False)
    c = pl.cadre
    g = pymupdf.Rect(c.x0 + 5 * MM, c.y0 + 5 * MM, c.x0 + c.width * 0.49, c.y1 - 5 * MM)
    d = pymupdf.Rect(c.x0 + c.width * 0.51, c.y0 + 5 * MM, c.x1 - 5 * MM, c.y1 - 5 * MM)
    r = reglages
    cadre = lambda rect, fond=None: pl.page.draw_rect(rect, color=NOIR, fill=fond, width=0.6)

    # société
    h = 92
    b1 = pymupdf.Rect(g.x0, g.y0, g.x0 + g.width * 0.45, g.y0 + h)
    b2 = pymupdf.Rect(b1.x1, g.y0, g.x1, g.y0 + h)
    cadre(b1), cadre(b2)
    if r.chemin_logo():
        pl.image(pymupdf.Rect(b1.x0 + 6, b1.y0 + 6, b1.x1 - 6, b1.y1 - 6), r.chemin_logo())
    cx = (b2.x0 + b2.x1) / 2
    y = b2.y0 + 16
    pl.texte(cx, y, f"Société {r.societe}", 10, gras=True, ancre="c")
    for ligne in [l for l in (r.adresse_societe.replace("\n", " – "),
                              " – ".join(x for x in (r.telephone, r.email) if x),
                              f"SIREN : {r.siren}" if r.siren else "", f"n° de TVA : {r.tva}" if r.tva else "") if l]:
        y += 13
        pl.texte(cx, y, ligne, 7, ancre="c")
    # maître d'ouvrage
    y0 = g.y0 + h + 6
    b = pymupdf.Rect(g.x0, y0, g.x1, y0 + 92)
    cadre(b)
    pl.texte((b.x0 + b.x1) / 2, b.y0 + 20, "MAÎTRE DE L'OUVRAGE :", 9, gras=True, ancre="c")
    pl.texte((b.x0 + b.x1) / 2, b.y0 + 44, projet.maitre_ouvrage or "[à préciser]", 12, gras=True, ancre="c",
             couleur=NOIR if projet.maitre_ouvrage else ROUGE)
    yy = b.y0 + 58
    for l in pl.lignes_coupees(projet.adresse_maitre_ouvrage, b.width - 20, 9):
        pl.texte((b.x0 + b.x1) / 2, yy, l, 9, ancre="c")
        yy += 11
    # titre du dossier
    y0 = b.y1 + 6
    b = pymupdf.Rect(g.x0, y0, g.x1, y0 + 110)
    cadre(b, (0.84, 0.84, 0.84))
    cx = (b.x0 + b.x1) / 2
    t = "PLAN DE PERMIS DE CONSTRUIRE"
    pl.texte(cx, b.y0 + 32, t, 17, gras=True, ancre="c")
    w = pl.largeur_texte(t, 17, True)
    pl.ligne((cx - w / 2, b.y0 + 35), (cx + w / 2, b.y0 + 35), 0.8)
    pl.texte(cx, b.y0 + 60, "PLANS – COUPES – FAÇADES", 9, ancre="c")
    yy = b.y0 + 78
    for l in pl.lignes_coupees(r.mention_propriete, b.width - 30, 6):
        pl.texte(cx, yy, l, 6, ancre="c")
        yy += 8
    # couverture, chauffage
    y0 = b.y1 + 6
    b = pymupdf.Rect(g.x0, y0, g.x1, y0 + 86)
    cadre(b)
    lg = pymupdf.Rect(b.x0, b.y0, b.x0 + b.width * 0.26, b.y1)
    pl.ligne((lg.x1, b.y0), (lg.x1, b.y1), 0.6)
    if r.chemin_logo_re2020():
        pl.image(pymupdf.Rect(lg.x0 + 6, lg.y0 + 10, lg.x1 - 6, lg.y1 - 10), r.chemin_logo_re2020())
    xx = lg.x1 + 8
    for i, (lib, val) in enumerate((("COUVERTURE", projet.batiment.volumetrie.couverture),
                                   ("CHAUFFAGE", projet.chauffage), ("DIVERS", projet.divers))):
        yy = b.y0 + 20 + i * 24
        pl.texte(xx, yy, f"{lib} :", 7.5, gras=True)
        pl.texte(xx + pl.largeur_texte(f"{lib} : ", 7.5, True), yy, val or ("" if lib == "DIVERS" else "[à préciser]"),
                 7.5, gras=True, couleur=NOIR if val or lib == "DIVERS" else ROUGE)
    # dates / modifications
    y0 = b.y1 + 6
    lignes = [(m.date, m.objet) for m in projet.modifications] or [("", "")]
    lignes += [("", "")] * max(0, 4 - len(lignes))
    b = pymupdf.Rect(g.x0, y0, g.x1, y0 + 20 + 17 * len(lignes) + 8)
    cadre(b)
    t0 = pymupdf.Rect(b.x0 + 12, b.y0 + 8, b.x1 - 12, b.y0 + 24)
    c1 = t0.x0 + t0.width * 0.3
    pl.page.draw_rect(t0, color=NOIR, width=0.5)
    pl.ligne((c1, t0.y0), (c1, t0.y1 + 17 * len(lignes)), 0.5)
    pl.texte((t0.x0 + c1) / 2, t0.y0 + 11, "DATES", 8, gras=True, ancre="c")
    pl.texte((c1 + t0.x1) / 2, t0.y0 + 11, "MODIFICATIONS", 8, gras=True, ancre="c")
    for i, (dt, obj) in enumerate(lignes):
        yy = t0.y1 + i * 17
        pl.page.draw_rect(pymupdf.Rect(t0.x0, yy, t0.x1, yy + 17), color=NOIR, width=0.5)
        pl.texte((t0.x0 + c1) / 2, yy + 12, dt, 8, ancre="c")
        pl.texte((c1 + t0.x1) / 2, yy + 12, obj.upper(), 7.5, gras=True, ancre="c")
    # lieu de construction
    y0 = b.y1 + 6
    b = pymupdf.Rect(g.x0, y0, g.x1, g.y1)
    cadre(b)
    mid = b.x0 + b.width * 0.62
    pl.ligne((mid, b.y0), (mid, b.y1), 0.6)
    pl.texte(b.x0 + 8, b.y0 + 16, "LIEU DE CONSTRUCTION :", 8.5, gras=True)
    yy = b.y0 + 38
    for l in pl.lignes_coupees(projet.adresse or "[à préciser]", mid - b.x0 - 16, 9, True):
        pl.texte(b.x0 + 8, yy, l, 9, gras=True)
        yy += 12
    pl.texte(mid + 8, b.y0 + 16, "Références cadastrales :", 7.5, gras=True)
    pl.texte(mid + 8, b.y0 + 28, ", ".join(projet.parcelles) or "[à préciser]", 8)
    pl.texte(mid + 8, b.y0 + 46, "Surface du terrain :", 7.5, gras=True)
    st = projet.surface_terrain.valeur
    pl.texte(mid + 8, b.y0 + 58, f"{nombre(st)} m²" if st else "[à préciser]", 8, couleur=NOIR if st else ROUGE)
    pl.ligne((mid, b.y1 - 16), (b.x1, b.y1 - 16), 0.5)
    pl.texte(mid + 8, b.y1 - 5, f"Dessiné le : {date_fr()}", 7)

    # tableau des surfaces
    pl.texte(d.x0 + 20, d.y0 + 26, "- TABLEAU DES SURFACES -", 15, ancre="g")
    n = projet.batiment.niveaux[0] if projet.batiment.niveaux else None
    pieces = sorted(n.pieces, key=lambda p: (p.exclue_habitable, p.nom)) if n else []
    t = pymupdf.Rect(d.x0 + 20, d.y0 + 44, d.x1 - 20, d.y0 + 44)
    hl = 20
    colsh, colsa = t.x1 - 70, t.x1 - 8
    def ligne_tab(y, a, b_, c_, gras=False, fond=None):
        rr = pymupdf.Rect(t.x0, y, t.x1, y + hl)
        pl.page.draw_rect(rr, color=NOIR, fill=fond, width=0.5)
        pl.texte(t.x0 + 8, y + 13.5, a, 7, gras=gras)
        pl.texte(colsh, y + 13.5, b_, 7, gras=gras, ancre="d")
        pl.texte(colsa, y + 13.5, c_, 7, gras=gras, ancre="d")
    y = t.y0
    pl.page.draw_rect(pymupdf.Rect(t.x0, y, t.x1, y + hl), color=NOIR, width=0.5)
    pl.texte((t.x0 + t.x1) / 2, y + 13.5, "RDC", 8, gras=True, ancre="c")
    y += hl
    ligne_tab(y, "PIÈCE", "S.H", "S.A", gras=True)
    y += hl
    sh = sa = 0.0
    for p in pieces:
        if p.exclue_habitable:
            ligne_tab(y, p.nom, "", nombre(p.surface_calculee))
            sa += p.surface_calculee
        else:
            ligne_tab(y, p.nom, nombre(p.surface_calculee), "")
            sh += p.surface_calculee
        y += hl
    ligne_tab(y, "TOTAL (m²)", nombre(sh), nombre(sa), gras=True)
    y += hl + 12
    ligne_tab(y, "TOTAL GLOBAL (m²)", nombre(sh), nombre(sa), gras=True)
    y += hl + 34
    # résumé du projet
    pl.texte(d.x0 + 20, y, "- RÉSUMÉ DU PROJET -", 15)
    y += 18
    if n:
        surf = calculer(n, projet.points_arret["1_rdc"].valide)
        emp = surf["emprise_sol"]["valeur"].valeur
        sp = surf["surface_plancher"]["valeur"].valeur
        baies = sum((o.largeur.valeur or 0) * (o.hauteur.valeur or 0) for o in n.ouvertures
                    if o.exterieure and o.type != "porte de garage" and o.hauteur.valeur)
        terrain = projet.surface_terrain.valeur
        lignes = [("Type de surface", "Surfaces", True),
                  ("Emprise au sol (m²)", nombre(emp) + (f" ({round(emp / terrain * 100)} %)" if terrain else ""), False),
                  ('Surface de plancher « S.P. » (m²)', nombre(sp), False),
                  ("Surface des baies, hors porte de garage (m²)",
                   nombre(baies) + (f" ({round(baies / sh * 100)} %)" if sh else ""), False)]
        for a, b_, gr in lignes:
            rr = pymupdf.Rect(t.x0, y, t.x1, y + hl)
            pl.page.draw_rect(rr, color=NOIR, width=0.5)
            pl.texte(t.x0 + 8, y + 13.5, a, 7, gras=gr)
            pl.texte(t.x1 - 8, y + 13.5, b_, 7, gras=gr, ancre="d")
            y += hl
        if not projet.points_arret["1_rdc"].valide:
            pl.avertissement(["RDC interprété non validé (point d'arrêt n° 1) : surfaces à confirmer"], t.x0, y + 20)
    return pl


# ------------------------------------------------------------ le jeu complet

PIECES = {
    "page_de_garde": ("Page de garde", page_de_garde),
    "coupes": ("PCMI 3 – Coupes sur terrain", coupes),
    "facades": ("PCMI 5 – Façades", facades),
    "plan_toiture": ("PCMI 5 – Plan de toiture", plan_toiture),
    "plan_rdc": ("Plan du rez-de-chaussée", plan_rdc),
}
ORDRE = ["page_de_garde", "coupes", "facades", "plan_toiture", "plan_rdc"]


def generer(projet, reglages, quoi: list[str] | None = None) -> pymupdf.Document:
    """Les pièces demandées (toutes par défaut), dans l'ordre du dossier."""
    if not projet.batiment.niveaux:
        raise ValueError("Importez d'abord le plan du rez-de-chaussée.")
    doc = pymupdf.open()
    for cle in ORDRE:
        if quoi and cle not in quoi:
            continue
        PIECES[cle][1](doc, projet, reglages)
    doc.set_metadata({"title": f"Permis de construire – {projet.nom}", "author": reglages.societe,
                      "creator": "Atelier de conception CP Constructions"})
    return doc
