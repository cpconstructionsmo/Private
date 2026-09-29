"""Surfaces réglementaires d'un niveau, chacune selon sa définition, avec la
liste des déductions appliquées.

Les articles cités sont des pistes à vérifier au texte en vigueur sur
Légifrance (R5) : tant qu'ils ne l'ont pas été, ils sont affichés avec le
statut « à vérifier ». Les valeurs sont des hypothèses tant que le RDC
interprété n'a pas été validé (point d'arrêt n° 1), puis héritent de cette
validation.
"""
from __future__ import annotations

from shapely.geometry import Polygon
from shapely.ops import unary_union

from .modele import Niveau, Statut, Valeur, hypothese

REFERENCES = {
    # (article, intitulé) — vérification Légifrance : à faire (R5)
    "surface_plancher": ("R.111-22 du code de l'urbanisme", "surface de plancher"),
    "emprise_sol": ("R.420-1 du code de l'urbanisme", "emprise au sol"),
    "surface_habitable": ("R.156-1 du code de la construction et de l'habitation", "surface habitable"),
    "seuil_architecte": ("R.431-2 du code de l'urbanisme", "dispense de recours à l'architecte"),
}
REFERENCES_VERIFIEES: dict[str, str] = {}   # clé → date de vérification sur Légifrance

SEUIL_ARCHITECTE = 150.0
ALERTE_ARCHITECTE = 140.0


def ref(cle: str) -> str:
    art, _ = REFERENCES[cle]
    return f"art. {art}" + ("" if cle in REFERENCES_VERIFIEES else " (rédaction en vigueur à vérifier)")


def _poly(pts, trous=()) -> Polygon:
    return Polygon(pts, list(trous)).buffer(0)


def calculer(niveau: Niveau, rdc_valide: bool) -> dict:
    """Rend chaque surface avec sa valeur, son statut, sa source et ses déductions."""
    statut = Statut.CONFIRME if rdc_valide else Statut.HYPOTHESE
    cons = "" if rdc_valide else "le RDC interprété n'est pas encore validé (point d'arrêt n° 1)"
    contour = _poly(niveau.contour_exterieur)
    murs_facade = unary_union([_poly(m.polygone, m.trous) for m in niveau.murs if m.exterieur]) if niveau.murs else Polygon()
    interieur = contour.difference(murs_facade)
    garages = [p for p in niveau.pieces if p.usage == "garage"]
    hsp = niveau.hauteur_sous_plafond

    def v(val, source, deductions, notes=()):
        x = Valeur(valeur=round(val, 2), unite="m²", statut=statut, consequence=cons)
        x.source = hypothese(None, calcul=source).source
        return {"valeur": x, "deductions": deductions, "notes": list(notes)}

    # surface de plancher : au nu intérieur des murs de façade, moins le stationnement
    ded_sdp = [{"libelle": f"{g.nom} — surface aménagée pour le stationnement", "surface": round(g.surface_calculee, 2)} for g in garages]
    sdp = interieur.area - sum(d["surface"] for d in ded_sdp)
    notes_sdp = ["Mesurée au nu intérieur des murs de façade : leur épaisseur et les embrasures en sont exclues."]
    if hsp.statut != Statut.CONFIRME:
        notes_sdp.append(f"Hauteur sous plafond : {hsp.affiche()} — {hsp.consequence}.")
    if garages:
        notes_sdp.append("⚠️ Seule la surface intérieure du garage est déduite ; la cloison entre maison et garage "
                         "reste comptée. À confirmer selon la lecture du service instructeur.")

    # emprise au sol : projection verticale du volume, couverts sur poteaux compris
    couverts = [c for c in niveau.couverts if c.compte_emprise.valeur]
    emp = unary_union([contour] + [_poly(c.polygone) for c in couverts]).area
    ded_emp = [{"libelle": f"+ {c.nom} (couvert soutenu : compte dans l'emprise)", "surface": round(_poly(c.polygone).area, 2)}
               for c in couverts]
    notes_emp = ["Contour extérieur des murs, garage compris" + (", et les couverts soutenus par des poteaux." if couverts else "."),
                 "⚠️ Débords de toiture non comptés (sauf s'ils sont soutenus par des poteaux) ; auvents, "
                 "terrasses couvertes et débords sur poteaux restent à ajouter quand la toiture sera modélisée (jalon J4).",
                 "Si le lexique du PLU définit autrement l'emprise au sol, sa définition prévaut (jalon J3)."]

    # surface habitable : pièces, murs et cloisons déduits, locaux exclus
    exclues = [p for p in niveau.pieces if p.exclue_habitable]
    hab = sum(p.surface_calculee for p in niveau.pieces if not p.exclue_habitable)
    ded_hab = [{"libelle": "murs, cloisons, embrasures", "surface": round(contour.area - sum(p.surface_calculee for p in niveau.pieces), 2)}]
    ded_hab += [{"libelle": f"{p.nom} — {p.motif_exclusion or 'exclu'}", "surface": round(p.surface_calculee, 2)} for p in exclues]
    notes_hab = ["⚠️ Celliers, buanderies et dressings sont comptés comme surface habitable : à confirmer pièce par pièce."]

    # surface taxable (information) : comme la surface de plancher, sans déduire le garage
    tax = interieur.area
    return {
        "surface_plancher": {**v(sdp, f"calcul atelier — {ref('surface_plancher')}", ded_sdp, notes_sdp), "reference": ref("surface_plancher")},
        "emprise_sol": {**v(emp, f"calcul atelier — {ref('emprise_sol')}", ded_emp, notes_emp), "reference": ref("emprise_sol")},
        "surface_habitable": {**v(hab, f"calcul atelier — {ref('surface_habitable')}", ded_hab, notes_hab), "reference": ref("surface_habitable")},
        "surface_taxable": {**v(tax, "calcul atelier — pour information", [], ["Garage compris ; à titre indicatif."]),
                            "reference": "pour information"},
    }


def seuil_architecte(surface_plancher_totale: float) -> dict:
    """R8 : au-delà de 150 m² de surface de plancher, recours obligatoire à un
    architecte — production bloquée au nom de CP Constructions."""
    s = surface_plancher_totale
    f = lambda x: f"{x:.2f}".replace(".", ",")
    if s > SEUIL_ARCHITECTE:
        etat, message = "bloquant", (f"Surface de plancher {f(s)} m² : au-delà de {SEUIL_ARCHITECTE:.0f} m², le recours "
                                     f"à un architecte est obligatoire ({ref('seuil_architecte')}). La production du dossier "
                                     "au nom de CP Constructions est bloquée. Pistes : (a) optimiser pour rester sous le seuil, "
                                     "sans détourner les règles de calcul ; (b) préparer les éléments pour un architecte partenaire.")
    elif s >= ALERTE_ARCHITECTE:
        etat, message = "alerte", (f"Surface de plancher {f(s)} m² : à moins de {f(SEUIL_ARCHITECTE - s)} m² du seuil de "
                                   f"{SEUIL_ARCHITECTE:.0f} m² ({ref('seuil_architecte')}). Toute extension ou tout étage peut le faire franchir.")
    else:
        etat, message = "ok", f"Surface de plancher {f(s)} m², sous le seuil de {SEUIL_ARCHITECTE:.0f} m² ({ref('seuil_architecte')})."
    return {"etat": etat, "message": message, "surface_plancher": round(s, 2)}
