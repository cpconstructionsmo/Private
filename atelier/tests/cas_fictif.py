"""Un RDC fictif (aucune donnée client) pour les tests : maison de 12,00 × 9,00 m,
murs de façade de 30 cm, cloisons de 10 cm, garage intégré.

Surfaces attendues (calcul à la main) :
  intérieur (nu intérieur des façades) : 11,40 × 8,40 = 95,76 m²
  Séjour-cuisine 7,40 × 5,00 = 37,00   Garage 7,40 × 3,30 = 24,42
  Chambre 1 3,90 × 3,40 = 13,26        Salle d'eau 3,90 × 2,20 = 8,58
  Chambre 2 3,90 × 2,60 = 10,14
  surface de plancher = 95,76 − 24,42 (garage) = 71,34
  surface habitable = 37,00 + 13,26 + 8,58 + 10,14 = 68,98
  emprise au sol = 12,00 × 9,00 = 108,00
Pièges volontaires : « Salle d'eau 8,60 m² » écrit (8,58 réels) ; une cote
partielle forcée à 7,61 (7,60 dessinés), dont la chaîne ne tombe plus sur
la cote totale de 12,00 ; un meuble sur un calque MOBILIER.
"""
from __future__ import annotations

import ezdxf
import pymupdf
from shapely.geometry import box
from shapely.ops import unary_union

# porche de 1,70 × 1,40 = 2,38 m² sur le plan en aplats (compte dans l'emprise au sol)
PORCHE = 2.38
ATTENDU = {"interieur": 95.76, "surface_plancher": 71.34, "surface_habitable": 68.98, "emprise_sol": 108.00,
           "pieces": {"Séjour - cuisine": 37.00, "Garage": 24.42, "Chambre 1": 13.26, "Salle d'eau": 8.58, "Chambre 2": 10.14}}

PIECES = [("Séjour - cuisine", "37,00 m²", 4.0, 6.2), ("Garage", "24,42 m²", 4.0, 2.0),
          ("Chambre 1", "13,26 m²", 9.75, 7.0), ("Salle d'eau", "8,60 m²", 9.75, 4.1), ("Chambre 2", "10,14 m²", 9.75, 1.6)]
# ouvertures (x0, y0, x1, y1) découpées dans les murs, et bloc éventuel
OUVERTURES = [
    ((2.0, 0.0, 4.4, 0.3), "PORTE_GARAGE_240"),     # porte de garage, façade sud
    ((3.0, 8.7, 3.9, 9.0), None),                   # porte d'entrée, façade nord (interruption seule)
    ((5.0, 8.7, 6.8, 9.0), "FENETRE_180"),          # baie séjour
    ((0.0, 5.5, 0.3, 6.7), "FENETRE_120"),          # fenêtre séjour ouest
    ((11.7, 6.4, 12.0, 7.4), "FENETRE_100"),        # chambre 1
    ((11.7, 3.8, 12.0, 4.4), "FENETRE_60"),         # salle d'eau
    ((11.7, 1.0, 12.0, 2.0), "FENETRE_100"),        # chambre 2
    ((7.7, 6.0, 7.8, 6.9), None),                   # porte séjour → chambre 1
    ((7.7, 3.9, 7.8, 4.7), None),                   # porte séjour → salle d'eau
    ((1.0, 3.6, 1.9, 3.7), None),                   # porte séjour → garage
    ((8.5, 2.9, 9.3, 3.0), None),                   # porte salle d'eau → chambre 2
]


def murs():
    facades = box(0, 0, 12, 9).difference(box(0.3, 0.3, 11.7, 8.7))
    cloisons = [box(7.7, 0.3, 7.8, 8.7), box(0.3, 3.6, 7.7, 3.7), box(7.8, 5.2, 11.7, 5.3), box(7.8, 2.9, 11.7, 3.0)]
    m = unary_union([facades] + cloisons)
    for (x0, y0, x1, y1), _ in OUVERTURES:
        m = m.difference(box(x0, y0, x1, y1))
    return m


def segments():
    m = murs()
    out = []
    for g in (m.geoms if hasattr(m, "geoms") else [m]):
        for anneau in [g.exterior, *g.interiors]:
            c = list(anneau.coords)
            out += list(zip(c, c[1:]))
    return out


def ecrire_dxf(chemin: str):
    doc = ezdxf.new("R2018")
    doc.header["$INSUNITS"] = 4   # millimètres
    msp = doc.modelspace()
    mm = lambda p: (p[0] * 1000, p[1] * 1000)
    for a, b in segments():
        msp.add_line(mm(a), mm(b), dxfattribs={"layer": "MURS"})
    msp.add_lwpolyline([mm(p) for p in [(1, 5), (3, 5), (3, 6), (1, 6)]], close=True, dxfattribs={"layer": "MOBILIER"})
    for nom, surf, x, y in PIECES:
        msp.add_text(nom, height=200, dxfattribs={"layer": "TEXTES"}).set_placement(mm((x, y)))
        msp.add_text(surf, height=150, dxfattribs={"layer": "TEXTES"}).set_placement(mm((x, y - 0.35)))
    for (x0, y0, x1, y1), bloc in OUVERTURES:
        if not bloc:
            continue
        if bloc not in doc.blocks:
            blk = doc.blocks.new(bloc)
            w, h = x1 - x0, y1 - y0
            blk.add_line((0, 0), (w * 1000, h * 1000))
            blk.add_line((0, h * 1000), (w * 1000, 0))
        msp.add_blockref(bloc, mm((x0, y0)), dxfattribs={"layer": "MENUISERIES"})
    cot = {"layer": "COTATION"}
    msp.add_linear_dim(base=(0, -1500), p1=(0, 0), p2=(12000, 0), dxfattribs=cot).render()
    msp.add_linear_dim(base=(0, -1000), p1=(0, 0), p2=(2000, 0), dxfattribs=cot).render()
    msp.add_linear_dim(base=(0, -1000), p1=(2000, 0), p2=(4400, 0), dxfattribs=cot).render()
    msp.add_linear_dim(base=(0, -1000), p1=(4400, 0), p2=(12000, 0), text="7,61", dxfattribs=cot).render()
    msp.add_linear_dim(base=(-1500, 0), p1=(0, 0), p2=(0, 9000), angle=90, dxfattribs=cot).render()
    doc.saveas(chemin)


def ecrire_pdf(chemin: str, echelle=100):
    doc = pymupdf.open()
    page = doc.new_page(width=1190.55, height=841.89)   # A3 paysage
    k = 1000 / 25.4 * 72 / echelle   # points par mètre réel
    ox, oy = 150, 700
    P = lambda p: pymupdf.Point(ox + p[0] * k, oy - p[1] * k)
    sh = page.new_shape()
    for a, b in segments():
        sh.draw_line(P(a), P(b))
    sh.finish(width=0.6, color=(0, 0, 0))
    sh.draw_rect(pymupdf.Rect(P((1, 6)), P((3, 5))))       # mobilier, trait fin
    sh.draw_line(P((0, -1.5)), P((12, -1.5)))              # ligne de cote, trait fin
    sh.finish(width=0.2, color=(0.3, 0.3, 0.3))
    sh.commit()
    for nom, surf, x, y in PIECES:
        page.insert_text(P((x - 1.0, y)), nom, fontsize=7)
        page.insert_text(P((x - 1.0, y - 0.35)), surf, fontsize=6)
    doc.save(chemin)


def ecrire_pdf_aplats(chemin: str, echelle=75):
    """Le même RDC dessiné comme la plupart des plans de permis : page 1 de
    garde (sans dessin), page 2 le plan, murs en aplats gris (maçonnerie) et
    gris foncé (cloisons), vitrages en blanc, un tableau en aplats posé à côté
    (piège : il ne doit pas être pris pour des murs), échelle écrite."""
    doc = pymupdf.open()
    garde = doc.new_page(width=1190.55, height=841.89)
    garde.insert_text((80, 80), "PLAN DE PERMIS DE CONSTRUIRE — maison fictive", fontsize=16)
    page = doc.new_page(width=1190.55, height=841.89)
    k = 1000 / 25.4 * 72 / echelle
    ox, oy = 250, 720
    P = lambda p: (ox + p[0] * k, oy - p[1] * k)
    facades = box(0, 0, 12, 9).difference(box(0.3, 0.3, 11.7, 8.7))
    cloisons = unary_union([box(7.7, 0.3, 7.8, 8.7), box(0.3, 3.6, 7.7, 3.7), box(7.8, 5.2, 11.7, 5.3), box(7.8, 2.9, 11.7, 3.0)])
    for (x0, y0, x1, y1), _ in OUVERTURES:
        facades = facades.difference(box(x0, y0, x1, y1))
        cloisons = cloisons.difference(box(x0, y0, x1, y1))

    def aplat(g, couleur):
        sh = page.new_shape()
        for p in (g.geoms if hasattr(g, "geoms") else [g]):
            for anneau in [p.exterior, *p.interiors]:
                sh.draw_polyline([P(c) for c in anneau.coords])
        sh.finish(fill=couleur, color=None, even_odd=True, closePath=True)
        sh.commit()

    aplat(facades, (0.85, 0.85, 0.85))
    aplat(cloisons, (0.64, 0.64, 0.64))
    for (x0, y0, x1, y1), _ in OUVERTURES[1:7]:          # vitrages des baies extérieures
        aplat(box(x0, y0, x1, y1), (1, 1, 1))
    # tableau des surfaces en aplats, à gauche du plan
    for i in range(3):
        page.draw_rect(pymupdf.Rect(40, 120 + i * 30, 200, 130 + i * 30), fill=(0.93, 0.93, 0.93), color=None)
    for nom, surf, x, y in PIECES:
        page.insert_text(P((x - 1.0, y)), nom, fontsize=7)
        page.insert_text(P((x - 1.0, y - 0.35)), "SH : " + surf, fontsize=6)
    page.insert_text(P((5.6, -0.8)), "12,00", fontsize=7)
    # tailles des baies écrites le long des cotes, comme sur un plan de permis
    for texte, x, y in (("1,80 x 2,15", 5.9, 9.8), ("1,00 x 1,25", 12.8, 6.9), ("all. 0,90", 12.8, 6.6),
                        ("0,60 x 0,75", 12.8, 4.1), ("all. 1,40", 12.8, 3.8)):
        page.insert_text(P((x - 0.5, y)), texte, fontsize=6)
    # un porche couvert devant l'entrée (contour en tirets), sur poteau
    sh = page.new_shape()
    sh.draw_polyline([P((2.6, 9.0)), P((2.6, 10.4)), P((4.3, 10.4)), P((4.3, 9.0))])
    sh.finish(color=(0, 0, 0), width=0.4, dashes="[3 2] 0")
    sh.commit()
    page.insert_text(P((2.7, 9.7)), "Porche couvert", fontsize=5)
    page.insert_text((80, 800), f"Echelle 1/{echelle}", fontsize=9)
    doc.save(chemin)


# un terrain fictif : trapèze sur rue, cotes écrites, altitudes TN, et la maison
# de 12 × 9 m dessinée, tournée de 10°, son angle sud-ouest en (8 ; 6)
TERRAIN = [(0, 0), (30, 0), (28, 26), (2, 24)]
MAISON_ANGLE, MAISON_POS = 10.0, (8.0, 6.0)
# la rose du nord dessinée à côté du terrain : un cercle, une flèche, la lettre « N » ; le nord à 60° de l'axe x
NORD_ANGLE, NORD_CENTRE = 60.0, (36.0, 20.0)


def ecrire_terrain_pdf(chemin: str, echelle=200, avec_maison=True):
    from shapely import affinity
    import math as _m
    doc = pymupdf.open()
    page = doc.new_page(width=1190.55, height=841.89)
    k = 1000 / 25.4 * 72 / echelle
    ox, oy = 300, 650
    P = lambda p: pymupdf.Point(ox + p[0] * k, oy - p[1] * k)
    sh = page.new_shape()
    sh.draw_polyline([P(p) for p in TERRAIN + [TERRAIN[0]]])
    sh.finish(color=(0, 0, 0), width=1.6, closePath=True)
    sh.commit()
    for a, b in zip(TERRAIN, TERRAIN[1:] + TERRAIN[:1]):
        L = _m.dist(a, b)
        page.insert_text(P(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)), f"{L:.2f}".replace(".", ","), fontsize=7)
    for (x, y), z in (((1, 1), "49,80"), ((29, 1), "49,95"), ((27, 25), "50,40"), ((3, 23), "50,20")):
        page.insert_text(P((x, y)), f"TN {z}", fontsize=6)
    page.insert_text(P((12, -3)), "Rue d'Essai", fontsize=8)
    page.insert_text(P((14, 10)), "±0,00 = 50,10", fontsize=6)
    a, (cx, cy) = _m.radians(NORD_ANGLE), NORD_CENTRE
    u = (_m.cos(a), _m.sin(a)); v = (-u[1], u[0])
    sh = page.new_shape()
    sh.draw_circle(P((cx, cy)), 2 * k)
    sh.finish(color=(0, 0, 0), width=0.6, fill=(1, 1, 1))
    sh.draw_polyline([P((cx + u[0] * 1.8, cy + u[1] * 1.8)), P((cx - u[0] * 1.1 + v[0] * 0.8, cy - u[1] * 1.1 + v[1] * 0.8)),
                      P((cx - u[0] * 1.1 - v[0] * 0.8, cy - u[1] * 1.1 - v[1] * 0.8))])
    sh.finish(color=(0, 0, 0), width=0.4, fill=(0, 0, 0), closePath=True)
    sh.commit()
    page.insert_text(P((cx + u[0] * 3.2 - 0.3, cy + u[1] * 3.2 - 0.4)), "N", fontsize=8)
    page.insert_text((80, 800), f"PLAN DE MASSE  Echelle 1/{echelle}", fontsize=9)
    if avec_maison:
        m = affinity.translate(affinity.rotate(box(0, 0, 12, 9), MAISON_ANGLE, origin=(0, 0)), *MAISON_POS)
        sh = page.new_shape()
        sh.draw_polyline([P(c) for c in m.exterior.coords])
        sh.finish(color=(0, 0, 0), width=0.7, dashes="[3 1.5] 0", closePath=True)
        sh.commit()
    doc.save(chemin)


def ecrire_dxf_cedreo(chemin: str):
    """Le même RDC exporté comme le fait Cedreo : en centimètres ; murs en
    morceaux fermés (certains en double), continus au droit des baies ;
    baies sur leur propre calque (un rectangle dans le mur, un autre pour le
    débattement) ; mobilier et escalier sur SYMBOLS ; noms de pièces sans
    surface (dont un nom par défaut, « Pièce 1 ») ; tailles des baies en
    notation Cedreo (« 180/2.15 », « 100/1.25 » et l'allège « 0.90 » à part)."""
    doc = ezdxf.new("R2018")
    doc.header["$INSUNITS"] = 5   # centimètres
    for c in ("WALLS", "WALL_OPENINGS", "SYMBOLS", "ROOMS", "QUOTATIONS"):
        doc.layers.add(c)
    msp = doc.modelspace()
    cm = lambda p: (p[0] * 100, p[1] * 100)

    def rect(g, calque):
        msp.add_lwpolyline([cm(p) for p in list(g.exterior.coords)[:-1]], close=True, dxfattribs={"layer": calque})

    morceaux = [box(0, 0, 12, 0.3), box(0, 8.7, 12, 9), box(0, 0.3, 0.3, 8.7), box(11.7, 0.3, 12, 8.7),
                box(7.7, 0.3, 7.8, 8.7), box(0.3, 3.6, 7.7, 3.7), box(7.8, 5.2, 11.7, 5.3), box(7.8, 2.9, 11.7, 3.0)]
    for i, g in enumerate(morceaux):
        rect(g, "WALLS")
        if i % 2 == 0:
            rect(g, "WALLS")          # Cedreo exporte certains morceaux en double
    for (x0, y0, x1, y1), _ in OUVERTURES:
        rect(box(x0, y0, x1, y1), "WALL_OPENINGS")
        # le débattement, côté intérieur
        if y1 - y0 < x1 - x0:
            rect(box(x0, y1, x1, y1 + 0.6) if y0 < 1 else box(x0, y0 - 0.6, x1, y0), "WALL_OPENINGS")
        else:
            rect(box(x1, y0, x1 + 0.6, y1) if x0 < 1 else box(x0 - 0.6, y0, x0, y1), "WALL_OPENINGS")
    rect(box(2, 5, 4, 6), "SYMBOLS")                  # table
    for k in range(8):                                # marches d'escalier
        msp.add_line(cm((5 + k * 0.25, 4)), cm((5 + k * 0.25, 5)), dxfattribs={"layer": "SYMBOLS"})
    for nom, _, x, y in PIECES:
        msp.add_text("Pièce 1" if nom == "Chambre 2" else nom, height=20,
                     dxfattribs={"layer": "ROOMS"}).set_placement(cm((x, y)))
    for texte, x, y in (("180/2.15", 5.9, 9.6), ("100/1.25", 12.6, 6.9), ("0.90", 12.6, 6.9),
                        ("60/75", 12.6, 4.1), ("1.40", 12.6, 4.1)):
        msp.add_text(texte, height=15, dxfattribs={"layer": "QUOTATIONS"}).set_placement(cm((x, y)))
    doc.saveas(chemin)
