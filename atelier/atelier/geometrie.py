"""Reconstitution d'un plan de niveau à partir de ses traits.

Entrées communes aux imports DXF et PDF (déjà ramenées en mètres) :
segments, textes positionnés, ouvertures lues dans des blocs, cotes.

Méthode :
1. les interruptions de murs (portes, baies sans bloc fermant) sont refermées
   par des segments provisoires, pour que chaque pièce soit une face fermée —
   chaque paire de fermetures face à face devient une ouverture ;
2. les traits sont nœudés puis « polygonisés » en faces ;
3. une face mince et allongée est un mur ou une cloison ; une face qui
   contient le nom d'une pièce, ou assez grande, est une pièce ;
4. le contour extérieur est l'enveloppe des faces ; un mur qui le touche
   est un mur de façade.
Tout ce qui est déduit (porteur, usage, exclusion) est une hypothèse (R2, R4).
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from shapely.geometry import LineString, Point as SPoint, Polygon
from shapely.ops import polygonize, unary_union

from .modele import Mur, Niveau, Ouverture, Piece, confirme, hypothese, impossible

Seg = tuple[tuple[float, float], tuple[float, float]]


@dataclass
class Texte:
    texte: str
    x: float
    y: float


@dataclass
class BlocOuverture:
    nom: str
    x: float
    y: float
    largeur: float


@dataclass
class Cote:
    mesure: float           # longueur réelle mesurée entre les points d'attache (m)
    texte: str              # texte affiché s'il a été forcé, sinon ""
    p1: tuple[float, float]
    p2: tuple[float, float]
    horizontale: bool
    ligne: float            # position de la ligne de cote (y si horizontale, x sinon)


@dataclass
class PlanBrut:
    segments: list[Seg]
    textes: list[Texte] = field(default_factory=list)
    blocs: list[BlocOuverture] = field(default_factory=list)
    cotes: list[Cote] = field(default_factory=list)
    origine: str = ""


# ------------------------------------------------------------ vocabulaire

USAGES = [  # (motif, usage, humide, exclue de la surface habitable)
    (r"garage", "garage", False, True),
    (r"cellier|buanderie|lingerie", "rangement", True, False),
    (r"chaufferie|local\s*tech|technique", "technique", False, True),
    (r"\bs\.?\s*d\.?\s*[be]\b|salle\s*d.?(eau|bain)|douche", "eau", True, False),
    (r"\bw\.?\s*c\b|toilette", "eau", True, False),
    (r"cuisine|kitchen", "sejour", True, False),
    (r"s[ée]jour|salon|salle\s*[àa]\s*manger|pi[eè]ce\s*de\s*vie|living", "sejour", False, False),
    (r"chambre|\bch\.?\s*\d|suite", "chambre", False, False),
    (r"bureau", "chambre", False, False),
    (r"d[ée]gagement|couloir|circulation|hall|entr[ée]e|palier", "circulation", False, False),
    (r"dressing|placard|rangement", "rangement", False, False),
    (r"terrasse|auvent|porche|pergola", "exterieur", False, True),
]
RE_SURFACE = re.compile(r"(\d{1,3}(?:[.,]\d{1,2})?)\s*m\s*[²2]", re.I)


def usage_de(nom: str):
    n = nom.lower()
    for motif, usage, humide, exclue in USAGES:
        if re.search(motif, n):
            return usage, humide, exclue
    return "autre", False, False


# ------------------------------------------------------------ outils

def _dir(s: Seg):
    (x1, y1), (x2, y2) = s
    L = math.hypot(x2 - x1, y2 - y1)
    return ((x2 - x1) / L, (y2 - y1) / L) if L else (0.0, 0.0)


def largeur_min(poly: Polygon) -> tuple[float, float]:
    """Petit et grand côté du rectangle minimal orienté."""
    r = poly.minimum_rotated_rectangle
    c = list(r.exterior.coords)
    a = math.dist(c[0], c[1])
    b = math.dist(c[1], c[2])
    return min(a, b), max(a, b)


def fermer_interruptions(segments: list[Seg], mini=0.45, maxi=3.60, tol=0.015) -> tuple[list[Seg], list[tuple[Seg, float]]]:
    """Referme les interruptions de murs : deux extrémités de traits colinéaires
    (même droite), face à face, séparées de mini à maxi mètres, sans trait
    entre elles. Rend les fermetures et leur longueur (largeur de l'ouverture)."""
    bouts = []
    for i, s in enumerate(segments):
        d = _dir(s)
        if d == (0.0, 0.0):
            continue
        bouts.append((s[0], (-d[0], -d[1]), i))   # extrémité, direction vers l'extérieur du trait
        bouts.append((s[1], d, i))
    from shapely.strtree import STRtree
    lignes = [LineString(s) for s in segments]
    arbre_lignes = STRtree(lignes)
    points = [SPoint(p) for p, _, _ in bouts]
    arbre_points = STRtree(points)
    fermetures = []
    vus = set()
    for a, (pa, da, ia) in enumerate(bouts):
        for b in arbre_points.query(SPoint(pa).buffer(maxi)):
            b = int(b)
            if b <= a:
                continue
            pb, db, ib = bouts[b]
            if ia == ib:
                continue
            # les deux traits se font face sur la même droite
            if abs(da[0] + db[0]) > tol * 4 or abs(da[1] + db[1]) > tol * 4:
                continue
            vx, vy = pb[0] - pa[0], pb[1] - pa[1]
            L = math.hypot(vx, vy)
            if not (mini <= L <= maxi):
                continue
            if abs(vx * da[1] - vy * da[0]) > tol:        # hors de la droite
                continue
            if vx * da[0] + vy * da[1] <= 0:               # pas devant
                continue
            cle = (round(pa[0], 3), round(pa[1], 3), round(pb[0], 3), round(pb[1], 3))
            if cle in vus:
                continue
            # rien ne doit occuper ni traverser l'interruption (hors ses extrémités)
            ux, uy = vx / L, vy / L
            interieur = LineString([(pa[0] + ux * 0.01, pa[1] + uy * 0.01), (pb[0] - ux * 0.01, pb[1] - uy * 0.01)])
            if any(lignes[int(k)].intersects(interieur) for k in arbre_lignes.query(interieur)):
                continue
            vus.add(cle)
            fermetures.append(((pa, pb), L))
    # ne garder, pour une même extrémité, que la fermeture la plus courte
    fermetures.sort(key=lambda f: f[1])
    prises, retenues = set(), []
    for (pa, pb), L in fermetures:
        ka, kb = (round(pa[0], 3), round(pa[1], 3)), (round(pb[0], 3), round(pb[1], 3))
        if ka in prises or kb in prises:
            continue
        prises.update([ka, kb])
        retenues.append(((pa, pb), L))
    return [f[0] for f in retenues], retenues


@dataclass
class Resultat:
    niveau: Niveau
    ecarts: list[dict]
    faces_murs: list[Polygon]
    faces_pieces: list[Polygon]
    fermetures: list[Seg]


def finesse(poly: Polygon) -> float:
    """Épaisseur moyenne d'une face : 2 × surface / périmètre. Pour une bande
    (un mur, une cloison, même ramifiés), c'est à peu près son épaisseur ;
    pour une pièce, bien davantage."""
    return 2 * poly.area / poly.length if poly.length else 0.0


def bande_de_facade(contour: Polygon, pieces, mur_max=0.60, pas=0.25):
    """Les murs de façade : pour chaque côté du contour, l'épaisseur est la
    distance, mesurée vers l'intérieur, jusqu'à la première pièce (médiane des
    mesures le long du côté). Chaque façade a ainsi son épaisseur — un garage
    aux murs plus fins est traité comme tel."""
    from statistics import median
    from shapely.geometry import box
    from shapely import affinity
    pieces_u = unary_union(pieces)
    anneau = list(contour.exterior.coords)
    orient = 1 if contour.exterior.is_ccw else -1
    bandes, epaisseurs = [], []
    for (x1, y1), (x2, y2) in zip(anneau, anneau[1:]):
        L = math.hypot(x2 - x1, y2 - y1)
        if L < 1e-6:
            continue
        ux, uy = (x2 - x1) / L, (y2 - y1) / L
        nx, ny = -uy * orient, ux * orient          # normale vers l'intérieur
        mesures = []
        n = max(2, int(L / pas))
        for i in range(1, n):
            px, py = x1 + ux * L * i / n, y1 + uy * L * i / n
            rayon = LineString([(px + nx * 0.001, py + ny * 0.001), (px + nx * mur_max, py + ny * mur_max)])
            inter = rayon.intersection(pieces_u)
            if not inter.is_empty:
                d = SPoint(px, py).distance(inter)
                if d > 0.02:
                    mesures.append(d)
        if not mesures:
            continue
        e = median(mesures)
        epaisseurs.append(((x1, y1), (x2, y2), e))
        bandes.append(Polygon([(x1, y1), (x2, y2), (x2 + nx * e, y2 + ny * e), (x1 + nx * e, y1 + ny * e)]))
    return unary_union(bandes).intersection(contour) if bandes else Polygon(), epaisseurs


def reconstituer(plan: PlanBrut, mur_max=0.60) -> Resultat:
    segs = [s for s in plan.segments if math.dist(*s) > 0.005]
    fermetures, details = fermer_interruptions(segs)
    reseau = unary_union([LineString(s) for s in segs + fermetures])
    faces = [f for f in polygonize(reseau) if f.area > 0.01]
    if not faces:
        raise ValueError("Aucune surface fermée n'a pu être reconstituée à partir des traits du plan.")
    emprise = unary_union(faces)
    # le contour extérieur : la plus grande enveloppe, trous bouchés
    polys = [emprise] if emprise.geom_type == "Polygon" else sorted(emprise.geoms, key=lambda p: p.area, reverse=True)
    contour = Polygon(polys[0].exterior)
    textes_pieces = [t for t in plan.textes if usage_de(t.texte)[0] != "autre" or RE_SURFACE.search(t.texte)]

    faces_murs, faces_pieces = [], []
    for f in faces:
        contient_nom = any(f.contains(SPoint(t.x, t.y)) and usage_de(t.texte)[0] != "autre" for t in textes_pieces)
        if contient_nom or (finesse(f) > 0.35 and f.area >= 0.5):
            faces_pieces.append(f)
        else:
            faces_murs.append(f)

    # murs de façade (bande le long du contour) et murs intérieurs (le reste)
    bande, epaisseurs = bande_de_facade(contour, faces_pieces, mur_max)
    tous_murs = contour.difference(unary_union(faces_pieces))
    ext = tous_murs.intersection(bande)
    inte = tous_murs.difference(bande.buffer(0.001))
    def morceaux(g):
        if g.is_empty:
            return []
        return [x for x in (g.geoms if hasattr(g, "geoms") else [g]) if x.geom_type == "Polygon" and x.area > 0.005]
    def pts(anneau):
        return [(round(x, 4), round(y, 4)) for x, y in anneau.coords]
    murs = []
    for f in morceaux(ext):
        e = min(epaisseurs, key=lambda t: LineString([t[0], t[1]]).distance(f.representative_point()))[2] if epaisseurs else finesse(f)
        murs.append(Mur(id=f"M{len(murs) + 1}", polygone=pts(f.exterior), trous=[pts(t) for t in f.interiors],
                        epaisseur=round(e, 3), exterieur=True,
                        porteur=hypothese(True, consequence="s'il n'est pas porteur, rien ne change pour le permis",
                                          calcul="mur de façade supposé porteur")))
    for f in morceaux(inte):
        e = finesse(f)
        murs.append(Mur(id=f"M{len(murs) + 1}", polygone=pts(f.exterior), trous=[pts(t) for t in f.interiors],
                        epaisseur=round(e, 3), exterieur=False,
                        porteur=(hypothese(True, consequence="si ce refend n'est pas porteur, il pourra être déplacé",
                                           calcul=f"épaisseur moyenne {e:.2f} m : refend supposé porteur") if e >= 0.15 else
                                 hypothese(False, consequence="si cette cloison est porteuse, la supprimer ou la percer demande une étude",
                                           calcul=f"épaisseur moyenne {e:.2f} m : cloison supposée"))))

    pieces, ecarts = [], []
    for i, f in enumerate(faces_pieces):
        dedans = [t for t in plan.textes if f.contains(SPoint(t.x, t.y))]
        noms = [t.texte for t in dedans if usage_de(t.texte)[0] != "autre"]
        nom = re.sub(RE_SURFACE, "", noms[0]).strip(" :-–") if noms else f"Pièce {i + 1}"
        usage, humide, exclue = usage_de(nom)
        lue = None
        for t in dedans:
            m = RE_SURFACE.search(t.texte)
            if m:
                v = float(m.group(1).replace(",", "."))
                lue = confirme(v, "m²", document=plan.origine, calcul="texte lu sur le plan source")
                break
        calc = round(f.area, 2)
        motif = {"garage": "garage (surface de stationnement)", "technique": "local technique supposé",
                 "exterieur": "espace extérieur ou ouvert"}.get(usage, "")
        pieces.append(Piece(id=f"P{i + 1}", nom=nom, usage=usage, humide=humide, exclue_habitable=exclue,
                            motif_exclusion=motif, surface_calculee=calc, surface_lue=lue,
                            polygone=[(round(x, 4), round(y, 4)) for x, y in f.exterior.coords]))
        if lue is not None and abs(lue.valeur - calc) > 0.004:
            ecarts.append({"genre": "surface", "piece": nom, "lue": lue.valeur, "calculee": calc,
                           "ecart": round(calc - lue.valeur, 2),
                           "explication": "à vérifier : arrondi, mesure au nu des plinthes, placard déduit ou non, "
                                          "ou plan source non à jour"})
        if not noms:
            ecarts.append({"genre": "piece-sans-nom", "piece": nom, "calculee": calc,
                           "explication": "surface fermée sans nom de pièce lisible : à nommer ou à écarter"})

    # les ouvertures : blocs lus, puis interruptions refermées sans bloc
    ouvertures = []
    for j, b in enumerate(plan.blocs):
        typ = type_de_bloc(b.nom)
        ext = contour.exterior.distance(SPoint(b.x, b.y)) < mur_max
        ouvertures.append(Ouverture(id=f"O{j + 1}", type=typ, position=(round(b.x, 3), round(b.y, 3)),
                                    largeur=confirme(round(b.largeur, 3), "m", document=plan.origine, calcul=f"bloc « {b.nom} »"),
                                    hauteur=impossible("hauteur de l'ouverture (bloc, façade ou tableau des menuiseries)", "m"),
                                    allege=impossible("hauteur d'allège", "m"), exterieure=ext, origine=f"bloc {b.nom}"))
    deja = [SPoint(o.position) for o in ouvertures]
    for (pa, pb), L in details:
        m = ((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2)
        if any(SPoint(m).distance(d) < mur_max + 0.1 for d in deja):
            continue
        deja.append(SPoint(m))
        ext = contour.exterior.distance(SPoint(m)) < mur_max
        ouvertures.append(Ouverture(id=f"O{len(ouvertures) + 1}", type="porte" if not ext or L < 1.2 else "inconnu",
                                    position=(round(m[0], 3), round(m[1], 3)),
                                    largeur=hypothese(round(L, 3), "m", consequence="largeur prise entre les nus de l'interruption du mur",
                                                      calcul="interruption du trait de mur"),
                                    hauteur=impossible("hauteur de l'ouverture", "m"), allege=impossible("hauteur d'allège", "m"),
                                    exterieure=ext, origine="interruption de mur"))

    ecarts += controler_cotes(plan.cotes, contour)
    niveau = Niveau(contour_exterieur=[(round(x, 4), round(y, 4)) for x, y in contour.exterior.coords],
                    murs=murs, ouvertures=ouvertures, pieces=pieces)
    return Resultat(niveau=niveau, ecarts=ecarts, faces_murs=faces_murs, faces_pieces=faces_pieces, fermetures=fermetures)


def type_de_bloc(nom: str) -> str:
    n = nom.lower()
    if re.search(r"garage|sectionn|basculante", n):
        return "porte de garage"
    if re.search(r"porte.?fen|p\.?f\b|pf\d|coulissant|baie", n):
        return "porte-fenetre"
    if re.search(r"fen|window|chassis|oscillo", n):
        return "fenetre"
    if re.search(r"porte|door", n):
        return "porte"
    return "inconnu"


def _nombre(t: str):
    m = re.search(r"\d+(?:[.,]\d+)?", t or "")
    return float(m.group(0).replace(",", ".")) if m else None


def controler_cotes(cotes: list[Cote], contour: Polygon) -> list[dict]:
    """Deux contrôles : un texte de cote forcé qui ne correspond pas à la
    longueur dessinée ; une chaîne de cotes partielles dont la somme diffère
    de la cote totale qui couvre la même étendue."""
    ecarts = []
    for c in cotes:
        v = _nombre(c.texte)
        if v is None:
            continue
        # texte en centimètres (1240) ou en mètres (12,40)
        v_m = v / 100 if v > 60 else v
        if abs(v_m - c.mesure) > 0.005:
            ecarts.append({"genre": "cote-forcee", "texte": c.texte, "dessinee": round(c.mesure, 3),
                           "explication": "le texte de la cote ne correspond pas à la longueur dessinée"})
    for horiz in (True, False):
        L = [c for c in cotes if c.horizontale == horiz]
        k = (lambda p: p[0]) if horiz else (lambda p: p[1])
        lignes = {}
        for c in L:
            lignes.setdefault(round(c.ligne, 2), []).append(c)
        for chaine in lignes.values():
            if len(chaine) < 2:
                continue
            debut = min(min(k(c.p1), k(c.p2)) for c in chaine)
            fin = max(max(k(c.p1), k(c.p2)) for c in chaine)
            somme = sum((_nombre(c.texte) / (100 if (_nombre(c.texte) or 0) > 60 else 1)) if _nombre(c.texte) is not None else c.mesure for c in chaine)
            for t in L:
                if t in chaine:
                    continue
                if abs(min(k(t.p1), k(t.p2)) - debut) < 0.01 and abs(max(k(t.p1), k(t.p2)) - fin) < 0.01:
                    tv = _nombre(t.texte)
                    total = (tv / 100 if tv > 60 else tv) if tv is not None else t.mesure
                    if abs(total - somme) > 0.005:
                        ecarts.append({"genre": "chaine-de-cotes", "total": round(total, 3), "somme": round(somme, 3),
                                       "explication": "la cote totale n'est pas la somme des cotes partielles"})
    return ecarts
