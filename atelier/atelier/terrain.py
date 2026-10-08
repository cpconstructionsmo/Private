"""Le terrain et l'implantation de la maison.

Le terrain vient d'un plan existant, en PDF vectoriel ou en DXF : plan de
division du géomètre, extrait cadastral exporté, ancien plan de masse.
- La **limite de propriété** est le contour fermé dont les côtés
  correspondent aux longueurs écrites sur le plan ; chaque côté retrouvé
  est confirmé par sa cote, les autres restent à vérifier.
- L'**alignement** (côté sur voie) est le côté le plus proche d'un nom de
  voie écrit (« rue », « chemin », « route »…).
- Les **altitudes du terrain naturel** sont les textes « TN 49,32 ».
- Si le plan porte déjà l'**emprise de la maison**, la maison du modèle y
  est superposée (rotation et translation) : l'implantation est alors lue,
  pas supposée.

L'implantation peut aussi être saisie : angle, et distances à deux
limites. Les reculs sont ensuite mesurés, jamais recopiés.
"""
from __future__ import annotations

import math
import re

import pymupdf
from shapely import affinity
from shapely.geometry import LineString, Point, Polygon

from .import_pdf import PT_EN_M, _anneaux, echelle_lue
from .modele import PointTN, Terrain, confirme, hypothese

RE_LONGUEUR = re.compile(r"(?<![\d,.])(\d{1,3}[,.]\d{2})(?![\d,.])")
RE_TN = re.compile(r"\bTN\s*:?\s*(\d{1,4}[,.]\d{1,3})", re.I)
RE_RDC = re.compile(r"±\s*0[,.]00\s*=\s*(\d{1,4}[,.]\d{1,3})")
RE_VOIE = re.compile(r"\b(rue|avenue|boulevard|chemin|route|impasse|all[ée]e|place|voie|alignement|RD\s?\d+|RN\s?\d+)\b", re.I)


def _cotes(texte: str) -> list[float]:
    return [float(t.replace(",", ".")) for t in RE_LONGUEUR.findall(texte)]


def _cotes_de_cotes(poly: Polygon, cotes: list[float], tol=0.05):
    c = list(poly.exterior.coords)
    out = []
    for i, (a, b) in enumerate(zip(c, c[1:])):
        L = math.dist(a, b)
        ecrite = min(cotes, key=lambda x: abs(x - L), default=None)
        out.append({"cote": i, "mesuree": round(L, 3),
                    "ecrite": ecrite if ecrite is not None and abs(ecrite - L) <= tol else None})
    return out


def lire_terrain_pdf(chemin: str, page: int | None = None, echelle: float | None = None) -> tuple[Terrain, dict, list[str]]:
    """Rend (terrain, extras, notes). extras : {"emprises": [Polygon], "textes": [...]}."""
    doc = pymupdf.open(chemin)
    if page is None:
        # la page qui porte le plus d'altitudes « TN », puis qui parle de plan de masse, de division
        # ou de cadastre, puis la plus dessinée
        scores = []
        for i, pg in enumerate(doc):
            t = pg.get_text()
            s = (len(RE_TN.findall(t)), bool(re.search(r"plan\s+de\s+masse|plan\s+de\s+division|cadastr", t, re.I)),
                 bool(RE_ECH.search(t)), len(pg.get_drawings()))
            scores.append((s, i))
        page = max(scores)[1]
    pg = doc[page]
    notes = [f"Terrain lu en page {page + 1} du PDF."]
    lue = echelle_lue(chemin, page)
    if not echelle:
        if not lue:
            raise ValueError("Indiquez l'échelle du plan du terrain (par exemple 200 pour 1/200).")
        echelle = lue
        notes.append(f"Échelle lue sur la page : 1/{lue}.")
    k = PT_EN_M * echelle
    H = pg.rect.height
    polys = []
    for dr in pg.get_drawings():
        for a in _anneaux(dr["items"]):
            if len(a) >= 3:
                polys.append(Polygon([(x * k, (H - y) * k) for x, y in a]).buffer(0))
    textes = []
    for bloc in pg.get_text("dict")["blocks"]:
        for ligne in bloc.get("lines", []):
            t = " ".join(s_["text"] for s_ in ligne["spans"]).strip()
            if t:
                x0, y0, x1, y1 = ligne["bbox"]
                textes.append((t, ((x0 + x1) / 2 * k, (H - (y0 + y1) / 2) * k)))
    return _analyser(polys, textes, f"{chemin.split('/')[-1]}, page {page + 1}, 1/{int(echelle)}", notes)


def _analyser(polys, textes, source: str, notes: list[str]):
    """Limite, alignement, TN, nom de voie et emprises dessinées, à partir des
    contours fermés et des textes d'un plan (en mètres)."""
    cotes = _cotes(" ".join(t for t, _ in textes))
    candidats = []
    for poly in polys:
        if poly.geom_type != "Polygon" or poly.area < 30:
            continue
        s_ = poly.simplify(0.05)
        cc = _cotes_de_cotes(s_, cotes)
        n = sum(1 for x in cc if x["ecrite"] is not None)
        candidats.append((n, poly.area, s_, cc))
    if not candidats:
        raise ValueError("Aucun contour fermé de terrain trouvé sur ce plan.")
    # la limite : au moins trois côtés confirmés par une cote écrite, la plus grande part de côtés
    # confirmés, puis la plus grande surface
    n, aire, limite, cc = max(candidats, key=lambda c: (c[0] >= 3, c[0] / max(1, len(c[3])), c[1]))
    if n == 0:
        notes.append("⚠️ Aucun côté du terrain ne correspond à une cote écrite : limite à vérifier.")
    else:
        notes.append(f"✅ {n} côté(s) sur {len(cc)} confirmé(s) par les cotes écrites.")
    # altitudes du terrain naturel
    tn = []
    for t, (x, y) in textes:
        m = RE_TN.search(t)
        if m and limite.buffer(3).contains(Point(x, y)):
            tn.append(PointTN(x=round(x, 3), y=round(y, 3), z=float(m.group(1).replace(",", ".")),
                              source=f"« {t} » lu sur le plan"))
    # alignement : le côté le plus proche d'un nom de voie écrit hors du terrain
    alignement = []
    voies = [(t, Point(x, y)) for t, (x, y) in textes if RE_VOIE.search(t) and not limite.contains(Point(x, y))]
    c = list(limite.exterior.coords)
    cotes_limite = [LineString([a, b]) for a, b in zip(c, c[1:])]
    if voies:
        t, p = min(voies, key=lambda v: min(s.distance(v[1]) for s in cotes_limite))
        i = min(range(len(cotes_limite)), key=lambda j: cotes_limite[j].distance(p))
        alignement = [i]
        notes.append(f"Alignement : côté {i + 1} ({nombre_fr(cotes_limite[i].length)} m), le long de « {t} ».")
    else:
        notes.append("⚠️ Aucun nom de voie trouvé : indiquez le côté sur rue (alignement).")
    # l'emprise de la maison, si le plan la porte déjà
    emprises = [c_[2] for c_ in candidats if c_[2] is not limite and limite.buffer(0.1).contains(c_[2])
                and 40 < c_[2].area < 0.8 * limite.area]
    # nom de la voie : un texte de rue, d'avenue… (pas une légende d'alignement)
    rues = [(t, p) for t, p in voies if re.search(r"\b(rue|avenue|boulevard|chemin|route|impasse|all[ée]e|place)\b", t, re.I)
            and not re.search(r"bordure|alignement|art\.", t, re.I)]
    nom_voie = ""
    if rues:
        t_, _ = min(rues, key=lambda v: limite.distance(v[1]))
        nom_voie = re.sub(r"^[\s—–-]+|[\s—–-]+$", "", t_)
    # l'altitude du RDC fini, si le plan l'écrit (« Niveau RDC fini ±0,00 = 50,30 ») : lue, jamais supposée
    altitude_rdc = None
    lues = sorted({float(m.group(1).replace(",", ".")) for t, _ in textes for m in [RE_RDC.search(t)] if m})
    if len(lues) == 1:
        altitude_rdc = confirme(lues[0], "m NGF", document=source, calcul="« ±0,00 = … » lu sur le plan")
        notes.append(f"Altitude du RDC fini lue sur le plan : ±0,00 = {nombre_fr(lues[0])} NGF.")
    elif len(lues) > 1:
        notes.append("⚠️ Plusieurs altitudes « ±0,00 = … » sur le plan (" + ", ".join(nombre_fr(v) for v in lues) + ") : à saisir.")
    terrain = Terrain(limites=[(round(x, 3), round(y, 3)) for x, y in limite.exterior.coords],
                      source=source, cotes=cc, alignement=alignement, tn=tn, nom_voie=nom_voie, altitude_rdc=altitude_rdc,
                      surface=confirme(round(limite.area, 2), "m²", document=source,
                                       calcul="surface du contour de la limite de propriété"))
    return terrain, {"emprises": emprises, "textes": textes}, notes


RE_ECH = re.compile(r"[ÉE]chelle\s*:?\s*1\s*/\s*\d{2,4}", re.I)


def lire_terrain_dxf(chemin: str) -> tuple[Terrain, dict, list[str]]:
    """Même lecture sur un DXF (plan de division, export cadastral) : contours
    fermés, textes (longueurs, TN, noms de voie)."""
    import ezdxf
    from shapely.ops import polygonize, unary_union
    from .import_dxf import UNITES
    doc = ezdxf.readfile(chemin)
    msp = doc.modelspace()
    ins = doc.header.get("$INSUNITS", 0)
    notes = []
    if ins in UNITES:
        k = UNITES[ins]
    else:
        k = 1.0
        notes.append("⚠️ Unités absentes du DXF : mètres supposés. À vérifier sur une longueur connue.")
    polys, lignes = [], []
    for e in msp:
        t = e.dxftype()
        if t == "LWPOLYLINE":
            pts = [(p[0] * k, p[1] * k) for p in e.get_points("xy")]
        elif t == "POLYLINE":
            pts = [(v.dxf.location.x * k, v.dxf.location.y * k) for v in e.vertices]
        elif t == "LINE":
            lignes.append(LineString([(e.dxf.start.x * k, e.dxf.start.y * k), (e.dxf.end.x * k, e.dxf.end.y * k)]))
            continue
        else:
            continue
        if len(pts) >= 3 and (getattr(e, "closed", False) or getattr(e, "is_closed", False) or math.dist(pts[0], pts[-1]) < 1e-6):
            polys.append(Polygon(pts).buffer(0))
        else:
            lignes += [LineString([a, b]) for a, b in zip(pts, pts[1:])]
    if lignes:
        polys += [f for f in polygonize(unary_union(lignes))]
    textes = []
    for e in msp.query("TEXT MTEXT"):
        txt = e.dxf.text if e.dxftype() == "TEXT" else e.plain_text()
        textes.append((" ".join(txt.split()), (e.dxf.insert.x * k, e.dxf.insert.y * k)))
    return _analyser(polys, textes, chemin.split("/")[-1], notes)


def nombre_fr(v: float) -> str:
    return f"{v:.2f}".replace(".", ",")


def superposer(contour: Polygon, emprises: list[Polygon], tol=0.10):
    """Cherche, parmi les emprises dessinées, celle qui est la maison du
    modèle ; rend (angle, dx, dy, écart max) ou None. On essaie chaque
    alignement d'un grand côté du modèle sur un grand côté dessiné."""
    def cotes(p):
        c = list(p.exterior.coords)
        return sorted(((math.dist(a, b), math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))) for a, b in zip(c, c[1:])),
                      reverse=True)
    meilleur = None
    # sans les sommets alignés (bords des baies) : les grands côtés sont entiers
    contour = contour.simplify(0.01)
    for e in (x.simplify(0.01) for x in emprises):
        if abs(e.area - contour.area) > 0.03 * contour.area:
            continue
        L1, a1 = cotes(contour)[0]
        for L2, a2 in cotes(e)[:6]:
            if abs(L1 - L2) > tol:
                continue
            for dt in (0, 180):
                ang = a2 - a1 + dt
                r = affinity.rotate(contour, ang, origin=(0, 0))
                dx = e.centroid.x - r.centroid.x
                dy = e.centroid.y - r.centroid.y
                t = affinity.translate(r, dx, dy)
                ecart = t.hausdorff_distance(e)
                if ecart <= tol and (meilleur is None or ecart < meilleur[3]):
                    meilleur = (ang, dx, dy, ecart)
    return meilleur


def implanter_par_distances(contour: Polygon, limites: Polygon, angle: float, cote_a: int, dist_a: float,
                            cote_b: int, dist_b: float):
    """Place la maison (tournée de `angle` degrés) à dist_a du côté cote_a et
    à dist_b du côté cote_b de la limite (distances mesurées perpendiculairement
    au côté, depuis le point de la maison le plus proche). Rend (dx, dy)."""
    r = affinity.rotate(contour, angle, origin=(0, 0))
    c = list(limites.exterior.coords)
    ccw = limites.exterior.is_ccw

    def droite(i):
        (x1, y1), (x2, y2) = c[i], c[i + 1]
        L = math.dist((x1, y1), (x2, y2))
        ux, uy = (x2 - x1) / L, (y2 - y1) / L
        n = (-uy, ux) if ccw else (uy, -ux)          # normale vers l'intérieur du terrain
        return n, n[0] * x1 + n[1] * y1

    (na, ca), (nb, cb) = droite(cote_a), droite(cote_b)
    # distance d'un point au côté = n·p − c ; la maison est à dist du côté si min(n·p) − c = dist
    ma = min(na[0] * x + na[1] * y for x, y in r.exterior.coords)
    mb = min(nb[0] * x + nb[1] * y for x, y in r.exterior.coords)
    # n·(p + t) = n·p + n·t  →  n·t = dist + c − min(n·p)
    det = na[0] * nb[1] - na[1] * nb[0]
    if abs(det) < 1e-6:
        raise ValueError("Les deux côtés choisis sont parallèles : prenez un côté sur rue et un côté latéral.")
    ra, rb = dist_a + ca - ma, dist_b + cb - mb
    dx = (ra * nb[1] - rb * na[1]) / det
    dy = (na[0] * rb - nb[0] * ra) / det
    return dx, dy


def maison_sur_terrain(projet):
    """La maison (murs et couverts) dans le repère du terrain, ou None."""
    from shapely.ops import unary_union
    t = projet.terrain
    if not projet.batiment.niveaux or t.implantation is None:
        return None
    n = projet.batiment.niveaux[0]
    g = unary_union([Polygon(n.contour_exterieur).buffer(0)] + [Polygon(c.polygone).buffer(0) for c in n.couverts])
    imp = t.implantation
    return affinity.translate(affinity.rotate(g, imp.angle, origin=(0, 0)), imp.dx, imp.dy)


def placer(projet, g):
    """Une géométrie du repère du modèle, placée dans le repère du terrain."""
    imp = projet.terrain.implantation
    return affinity.translate(affinity.rotate(g, imp.angle, origin=(0, 0)), imp.dx, imp.dy)


def reculs(projet) -> list[dict]:
    """Distance de la maison à chaque côté du terrain (mesurée, pas recopiée)."""
    t = projet.terrain
    m = maison_sur_terrain(projet)
    if m is None or len(t.limites) < 4:
        return []
    c = t.limites
    out = []
    for i, (a, b) in enumerate(zip(c, c[1:])):
        s = LineString([a, b])
        d = m.distance(s)
        p = min(m.exterior.coords, key=lambda q: s.distance(Point(q)))
        out.append({"cote": i, "longueur": round(s.length, 2), "distance": round(d, 2), "point": p,
                    "alignement": i in t.alignement})
    return out


# ------------------------------------------------------------ règles du PLU

REGLES = {
    # clé : (libellé, unité, sens)  — sens « min » : la mesure doit être au moins la valeur
    "recul_alignement": ("Recul par rapport à l'alignement", "m", "min"),
    "recul_limites": ("Recul par rapport aux limites séparatives", "m", "min"),
    "emprise_max": ("Emprise au sol", "%", "max"),
    "hauteur_egout_max": ("Hauteur à l'égout", "m", "max"),
    "hauteur_faitage_max": ("Hauteur au faîtage", "m", "max"),
}


def _hauteurs_depuis_tn(projet, h):
    """Une hauteur mesurée depuis le sol fini du RDC, ramenée au terrain
    naturel le plus bas au pied de la maison quand l'altitude NGF du RDC et
    des points TN proches sont connus. Rend (hauteur, référence)."""
    n = projet.batiment.niveaux[0]
    ngf = n.altitude_sol_fini.valeur
    m = maison_sur_terrain(projet)
    proches = [p.z for p in projet.terrain.tn if m is not None and m.buffer(3).contains(Point(p.x, p.y))]
    if ngf is not None and proches:
        return h + (ngf - min(proches)), f"depuis le TN le plus bas au pied de la maison ({nombre_fr(min(proches))} NGF)"
    return h, "depuis le sol fini du RDC (TN au pied de la maison inconnu)"


def controles(projet, surfaces=None, toiture=None) -> list[dict]:
    """Chaque règle saisie, mesurée sur le modèle : conforme, non conforme, ou
    contrôle impossible (donnée manquante)."""
    from .surfaces import calculer
    out = []
    rc = reculs(projet)
    n = projet.batiment.niveaux[0] if projet.batiment.niveaux else None
    for r in projet.regles:
        if r.cle not in REGLES:
            continue
        lib, unite, sens = REGLES[r.cle]
        mesure, ref, manque = None, "", ""
        if r.cle == "recul_alignement":
            d = [x["distance"] for x in rc if x["alignement"]]
            mesure = min(d) if d else None
            manque = "" if d else ("implantation" if not rc else "côté sur rue (alignement)")
        elif r.cle == "recul_limites":
            d = [x["distance"] for x in rc if not x["alignement"]]
            mesure = min(d) if d else None
            manque = "" if d else "implantation"
        elif r.cle == "emprise_max":
            st = projet.terrain.surface.valeur or projet.surface_terrain.valeur
            if n and st:
                emp = (surfaces or calculer(n, False))["emprise_sol"]["valeur"].valeur
                mesure = round(emp / st * 100, 1)
                ref = f"{nombre_fr(emp)} m² sur {nombre_fr(st)} m²"
            else:
                manque = "surface du terrain"
        elif r.cle in ("hauteur_egout_max", "hauteur_faitage_max") and n:
            v = projet.batiment.volumetrie
            h = v.hauteur_egout.valeur if r.cle == "hauteur_egout_max" else (
                max(toiture.faitages) if toiture and toiture.faitages else None)
            if h is None:
                manque = "toiture"
            else:
                mesure, ref = _hauteurs_depuis_tn(projet, h)
                mesure = round(mesure, 2)
        ok = None if mesure is None else (mesure >= r.valeur - 1e-9 if sens == "min" else mesure <= r.valeur + 1e-9)
        out.append({"cle": r.cle, "libelle": lib, "unite": unite, "sens": sens, "regle": r.valeur,
                    "article": r.article, "mesure": mesure, "reference": ref, "conforme": ok, "manque": manque,
                    "juste": ok and mesure is not None and abs(mesure - r.valeur) < 0.05})
    return out
