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
