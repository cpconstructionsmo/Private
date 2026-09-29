"""Toiture à croupes calculée à partir du contour de la maison.

Toiture à croupes, même pente sur tous les pans : chaque point de la toiture
est à la hauteur de l'égout, augmentée de la pente multipliée par sa
distance à l'égout le plus proche. Pour un plan orthogonal (murs à angle
droit, le cas de presque toutes les maisons), cette distance se mesure « en
carré » (distance de Tchebychev aux bords du débord de toiture) : on en
tire exactement les pans, les faîtages, les arêtiers et les noues, et la
hauteur de chaque faîtage.

Méthode : on trace toutes les lignes où un pan peut en rencontrer un autre
(médianes entre bords parallèles, diagonales à 45° passant par les sommets
de la grille des bords) ; dans chaque case ainsi formée, un seul pan
l'emporte. Les cases d'un même pan sont réunies.

Un plan non orthogonal est refusé avec une explication : la toiture se
dessine alors à la main (et se déclare dans le modèle).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from shapely import affinity
from shapely.geometry import LineString, MultiLineString, Point, Polygon, box
from shapely.ops import linemerge, polygonize, unary_union


@dataclass
class Pan:
    bord: int                      # indice du bord d'égout qui porte ce pan
    polygone: Polygon              # en plan
    normale: tuple[float, float]   # direction de la pente, vers le bas (en plan)
    # plan z = a x + b y + c
    a: float = 0.0
    b: float = 0.0
    c: float = 0.0

    def z(self, x: float, y: float) -> float:
        return self.a * x + self.b * y + self.c


@dataclass
class LigneToit:
    genre: str                     # faitage, arretier, noue
    ligne: LineString
    z0: float
    z1: float


@dataclass
class Toiture:
    egout: Polygon                 # contour de l'égout (murs + débord)
    pans: list[Pan]
    lignes: list[LigneToit]
    hauteur_egout: float
    pente_deg: float
    debord: float
    faitages: list[float] = field(default_factory=list)   # hauteurs distinctes, de la plus haute à la plus basse

    @property
    def faitage_max(self) -> float:
        return max(self.faitages) if self.faitages else self.hauteur_egout

    def z(self, x: float, y: float) -> float:
        """Hauteur de la couverture au point (x, y), None hors de la toiture."""
        p = Point(x, y)
        if not self.egout.buffer(1e-6).contains(p):
            return None
        return max((pan.z(x, y) for pan in self.pans if pan.polygone.buffer(1e-6).contains(p)),
                   default=self.hauteur_egout)


def _angle_principal(poly: Polygon) -> float:
    c = list(poly.exterior.coords)
    a, b = max(zip(c, c[1:]), key=lambda s: math.dist(*s))
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))


def est_orthogonal(poly: Polygon, tol_deg=1.0, tol_m=0.02) -> bool:
    """Murs à angle droit, à 1° près — ou à 2 cm près pour un bord court,
    où un défaut de dessin de quelques millimètres fausse l'angle."""
    ang = _angle_principal(poly)
    r = affinity.rotate(poly, -ang, origin=(0, 0))
    c = list(r.exterior.coords)
    for a, b in zip(c, c[1:]):
        dx, dy = abs(b[0] - a[0]), abs(b[1] - a[1])
        t = math.degrees(math.atan2(dy, dx))
        if min(t, 90 - t) > tol_deg and min(dx, dy) > tol_m:
            return False
    return True


def _grouper(valeurs, tol):
    """Regroupe des coordonnées voisines (à tol près) sur leur moyenne."""
    groupes = []
    for v in sorted(valeurs):
        if groupes and v - groupes[-1][-1] <= tol:
            groupes[-1].append(v)
        else:
            groupes.append([v])
    return {v: sum(g) / len(g) for g in groupes for v in g}


def _redresser(poly: Polygon, tol=0.02) -> Polygon:
    """Aligne exactement les bords presque horizontaux ou verticaux,
    regroupe les coordonnées distantes de moins de 2 cm (défauts de dessin)
    et retire les sommets alignés : la grille des lignes reste propre."""
    c = list(poly.exterior.coords)[:-1]
    n = len(c)
    pts = [list(p) for p in c]
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        if abs(a[1] - b[1]) < abs(a[0] - b[0]):
            y = (a[1] + b[1]) / 2
            a[1] = b[1] = y
        else:
            x = (a[0] + b[0]) / 2
            a[0] = b[0] = x
    gx = _grouper([p[0] for p in pts], tol)
    gy = _grouper([p[1] for p in pts], tol)
    pts = [(gx[p[0]], gy[p[1]]) for p in pts]
    propres = []
    for p in pts:
        if not propres or math.dist(p, propres[-1]) > 1e-9:
            propres.append(p)
    if math.dist(propres[0], propres[-1]) < 1e-9:
        propres.pop()
    # retirer les sommets alignés (et les allers-retours)
    change = True
    while change and len(propres) > 4:
        change = False
        for i in range(len(propres)):
            a, b, c_ = propres[i - 1], propres[i], propres[(i + 1) % len(propres)]
            if abs((b[0] - a[0]) * (c_[1] - b[1]) - (b[1] - a[1]) * (c_[0] - b[0])) < 1e-9:
                propres.pop(i)
                change = True
                break
    p = Polygon(propres).buffer(0)
    if p.geom_type != "Polygon":
        p = max(p.geoms, key=lambda g: g.area)
    return p if p.exterior.is_ccw else Polygon(list(p.exterior.coords)[::-1])


def calculer_toiture(contour, hauteur_egout: float, pente_deg: float, debord: float) -> Toiture:
    """contour : points du nu extérieur des murs (en mètres). Rend la toiture
    à croupes, pente identique sur tous les pans."""
    murs = Polygon(contour).buffer(0)
    if not est_orthogonal(murs):
        raise ValueError("Toiture automatique : le plan n'est pas orthogonal (murs non à angle droit). "
                         "Dessinez la toiture à la main pour ce projet.")
    ang = _angle_principal(murs)
    m = _redresser(affinity.rotate(murs, -ang, origin=(0, 0)))
    egout = _redresser(m.buffer(debord, join_style=2)) if debord > 0 else m
    t = math.tan(math.radians(pente_deg))

    c = list(egout.exterior.coords)[:-1]
    bords = []
    for i in range(len(c)):
        a, b = c[i], c[(i + 1) % len(c)]
        horiz = abs(a[1] - b[1]) < 1e-9
        # contour tourné dans le sens trigonométrique : l'intérieur est à gauche
        if horiz:
            vers_interieur = (0.0, 1.0 if b[0] > a[0] else -1.0)
        else:
            vers_interieur = (-1.0 if b[1] > a[1] else 1.0, 0.0)
        bords.append((a, b, horiz, vers_interieur))

    def dist(p, bord):
        (x1, y1), (x2, y2), horiz, n = bord
        if horiz:
            plan = (p[1] - y1) * n[1]
            lo, hi = min(x1, x2), max(x1, x2)
            hors = max(lo - p[0], 0.0, p[0] - hi)
        else:
            plan = (p[0] - x1) * n[0]
            lo, hi = min(y1, y2), max(y1, y2)
            hors = max(lo - p[1], 0.0, p[1] - hi)
        return max(abs(plan), hors), plan

    # les lignes où deux pans peuvent se rencontrer
    xs = sorted({round(p[0], 6) for p in c})
    ys = sorted({round(p[1], 6) for p in c})
    x0, y0, x1, y1 = egout.bounds
    L = max(x1 - x0, y1 - y0) + 2
    lignes = []
    for i, a in enumerate(xs):
        for b in xs[i:]:
            xm = (a + b) / 2
            lignes.append(LineString([(xm, y0 - 1), (xm, y1 + 1)]))
    for i, a in enumerate(ys):
        for b in ys[i:]:
            ym = (a + b) / 2
            lignes.append(LineString([(x0 - 1, ym), (x1 + 1, ym)]))
    diag = set()
    for x in xs:
        for y in ys:
            diag.add(("m", round(y - x, 6)))
            diag.add(("p", round(y + x, 6)))
    for genre, k in diag:
        if genre == "m":   # y = x + k
            lignes.append(LineString([(x0 - L, x0 - L + k), (x1 + L, x1 + L + k)]))
        else:              # y = -x + k
            lignes.append(LineString([(x0 - L, -(x0 - L) + k), (x1 + L, -(x1 + L) + k)]))
    reseau = unary_union([l.intersection(egout.buffer(1e-9)) for l in lignes] + [egout.boundary])
    cases = [f for f in polygonize(reseau) if f.area > 1e-8 and egout.buffer(1e-7).contains(f)]

    # dans chaque case, le pan qui l'emporte
    par_bord: dict[int, list[Polygon]] = {}
    for f in cases:
        p = f.representative_point()
        p = (p.x, p.y)
        ds = [dist(p, b) for b in bords]
        d = min(x[0] for x in ds)
        cand = [i for i, (di, pl) in enumerate(ds) if abs(di - d) < 1e-7 and abs(abs(pl) - d) < 1e-7]
        if not cand:
            cand = [min(range(len(ds)), key=lambda i: ds[i][0])]
        par_bord.setdefault(cand[0], []).append(f)

    pans = []
    for i, fs in par_bord.items():
        g = unary_union(fs).buffer(1e-9).buffer(-1e-9)
        (xa, ya), (xb, yb), horiz, n = bords[i]
        # z = egout + t * distance au bord (côté intérieur)
        if horiz:
            a_, b_, c_ = 0.0, t * n[1], hauteur_egout - t * n[1] * ya
        else:
            a_, b_, c_ = t * n[0], 0.0, hauteur_egout - t * n[0] * xa
        for piece in (g.geoms if hasattr(g, "geoms") else [g]):
            if piece.area > 1e-6:
                pans.append(Pan(bord=i, polygone=piece, normale=(-n[0], -n[1]), a=a_, b=b_, c=c_))

    # les lignes entre pans : faîtage (horizontal), arêtier (saillant), noue (rentrant)
    lignes_toit = []
    for i, p in enumerate(pans):
        for q in pans[i + 1:]:
            if p.polygone.distance(q.polygone) > 1e-6:
                continue
            # le bord commun, à un millionième près (les pans sont des réunions de cases)
            commun = p.polygone.boundary.intersection(q.polygone.buffer(1e-6))
            if commun.is_empty:
                continue
            morceaux = [g for g in (commun.geoms if hasattr(commun, "geoms") else [commun])
                        if g.geom_type == "LineString" and g.length > 1e-4]
            if not morceaux:
                continue
            fusion = linemerge(MultiLineString(morceaux)) if len(morceaux) > 1 else morceaux[0]
            for seg in (fusion.geoms if hasattr(fusion, "geoms") else [fusion]):
                seg = seg.simplify(1e-5)
                if seg.length < 1e-3:
                    continue
                (xa, ya), (xb, yb) = seg.coords[0], seg.coords[-1]
                za, zb = p.z(xa, ya), p.z(xb, yb)
                mx, my = (xa + xb) / 2, (ya + yb) / 2
                # un point juste à côté de la ligne, du côté du pan q : le pan p prolongé y passe-t-il au-dessus ?
                qp = q.polygone.representative_point()
                vx, vy = qp.x - mx, qp.y - my
                nv = math.hypot(vx, vy) or 1
                e = 0.01
                sx, sy = mx + vx / nv * e, my + vy / nv * e
                saillant = p.z(sx, sy) >= q.z(sx, sy) - 1e-9
                if abs(za - zb) < 1e-4 and saillant:
                    genre = "faitage"
                else:
                    genre = "arretier" if saillant else "noue"
                lignes_toit.append(LigneToit(genre=genre, ligne=seg, z0=za, z1=zb))

    # retour au repère du plan
    def rot(g):
        return affinity.rotate(g, ang, origin=(0, 0))

    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    out_pans = []
    for p in pans:
        # le plan z = a x' + b y' + c, avec x' = x ca + y sa, y' = -x sa + y ca
        a2 = p.a * ca - p.b * sa
        b2 = p.a * sa + p.b * ca
        nx, ny = p.normale
        out_pans.append(Pan(bord=p.bord, polygone=rot(p.polygone), normale=(nx * ca - ny * sa, nx * sa + ny * ca),
                            a=a2, b=b2, c=p.c))
    out_lignes = [LigneToit(genre=l.genre, ligne=rot(l.ligne), z0=l.z0, z1=l.z1) for l in lignes_toit]
    faitages = sorted({round(l.z0, 2) for l in out_lignes if l.genre == "faitage"}, reverse=True)
    # une croupe pure (pyramide) n'a pas de faîtage horizontal : son sommet en tient lieu
    if not faitages and out_lignes:
        faitages = [round(max(max(l.z0, l.z1) for l in out_lignes), 2)]
    return Toiture(egout=rot(egout), pans=out_pans, lignes=out_lignes, hauteur_egout=hauteur_egout,
                   pente_deg=pente_deg, debord=debord, faitages=faitages)
