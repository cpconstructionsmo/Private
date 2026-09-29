"""Notice décrivant le terrain et présentant le projet (PCMI 4).

Tout ce qui se mesure vient du modèle (surfaces, emprise, reculs, hauteurs,
altitudes) ; ce qui se décrit (matériaux, réseaux, clôtures, plantations,
accès) est saisi par l'utilisateur. Ce qui manque est écrit en rouge,
« [à compléter : …] » : la notice ne dit jamais plus que ce que l'on sait (R2).
"""
from __future__ import annotations

import pymupdf
from shapely.geometry import Point

from .modele import Statut
from .planches import GRIS, MM, NOIR, ROUGE, Planche, nombre, signe
from .surfaces import calculer

# les paragraphes que l'utilisateur rédige, dans l'ordre de la notice
PARAGRAPHES = {
    "etat_initial": "État initial du terrain (occupation, végétation existante, desserte)",
    "abords": "Abords (constructions voisines, paysage)",
    "viabilisation": "Aménagements prévus et viabilisation (réseaux secs, eau potable, eaux usées, eaux pluviales)",
    "materiaux_facades": "Façades (matériau, finition, teinte)",
    "materiaux_menuiseries": "Menuiseries extérieures et occultations",
    "materiaux_fermetures": "Porte d'entrée, porte de garage",
    "materiaux_zinguerie": "Zinguerie, équipements techniques visibles",
    "clotures": "Clôtures et limites",
    "plantations": "Espaces libres et plantations",
    "acces": "Accès au terrain et stationnement",
}


def _texte_auto(projet) -> dict[str, list[tuple[str, bool]]]:
    """Les phrases tirées du modèle, par partie ; (texte, manquant)."""
    from .terrain import maison_sur_terrain, reculs
    from .pieces_graphiques import Geo
    p, n = projet, projet.batiment.niveaux[0]
    geo = Geo(p)
    v = p.batiment.volumetrie
    s = calculer(n, p.points_arret["1_rdc"].valide)
    out = {}
    # terrain
    terr = []
    parc = ", ".join(p.parcelles) or "[à compléter : parcelles]"
    st = p.terrain.surface.valeur or p.surface_terrain.valeur
    terr.append((f"Le projet se situe au {p.adresse or '[à compléter : adresse]'}"
                 f"{', sur la commune de ' + p.commune if p.commune else ''}, sur les parcelles cadastrées {parc}"
                 f"{', d’une superficie de ' + nombre(st) + ' m²' if st else ''}.", not (p.adresse and p.parcelles and st)))
    terr.append((f"Le terrain est classé en {p.zone_plu}." if p.zone_plu else "[à compléter : zone du document d'urbanisme]",
                 not p.zone_plu))
    tn = [x.z for x in p.terrain.tn]
    if tn:
        m = maison_sur_terrain(p)
        pres = [x.z for x in p.terrain.tn if m is not None and m.buffer(3).contains(Point(x.x, x.y))]
        phrase = f"L'altimétrie du terrain naturel varie de {nombre(min(tn))} à {nombre(max(tn))} sur l'ensemble de la parcelle"
        phrase += f", et de {nombre(min(pres))} à {nombre(max(pres))} au droit de la construction." if pres else "."
        terr.append((phrase, False))
    else:
        terr.append(("[à compléter : topographie du terrain (altitudes du terrain naturel)]", True))
    out["terrain"] = terr
    # projet
    proj = []
    niveaux = {"plain-pied": "de plain-pied", "etage": "avec un étage", "combles-amenages": "avec combles aménagés"}
    proj.append((f"Le projet consiste en l'édification d'une maison individuelle {niveaux.get(p.batiment.type_niveaux, '')} "
                 f"à usage d'habitation. Le plancher du rez-de-chaussée est posé sur vide sanitaire"
                 f"{'' if v.vide_sanitaire.statut == Statut.CONFIRME else ' [à confirmer]'}.",
                 v.vide_sanitaire.statut != Statut.CONFIRME))
    T = geo.toiture
    if T:
        confirme_toit = all(x.statut == Statut.CONFIRME for x in (v.pente_toiture, v.hauteur_egout))
        proj.append((f"Les toitures sont à croupes, avec une pente de {nombre(T.pente_deg, 0)}°. La hauteur est de "
                     f"{nombre(T.hauteur_egout)} m à l'égout et de {nombre(T.faitage_max)} m au faîtage le plus haut, "
                     f"par rapport au sol fini du rez-de-chaussée.", not confirme_toit))
    rc = reculs(p)
    if rc:
        al = [r["distance"] for r in rc if r["alignement"]]
        lat = [r["distance"] for r in rc if not r["alignement"]]
        morceaux = []
        if al:
            morceaux.append(f"à {nombre(min(al))} m au plus près de l'alignement"
                            f"{' de la ' + p.terrain.nom_voie if p.terrain.nom_voie else ''}")
        if lat:
            morceaux.append(f"à {nombre(min(lat))} m au plus près des limites séparatives")
        proj.append(("La construction est implantée " + " et ".join(morceaux) + ".", False))
    else:
        proj.append(("[à compléter : implantation (reculs par rapport à la voie et aux limites)]", True))
    emp = s["emprise_sol"]["valeur"].valeur
    sp = s["surface_plancher"]["valeur"].valeur
    pct = f", soit {round(emp / st * 100)} % du terrain" if st else ""
    proj.append((f"L'emprise au sol est de {nombre(emp)} m²{pct}. La surface de plancher est de {nombre(sp)} m².",
                 not p.points_arret["1_rdc"].valide))
    out["projet"] = proj
    # adaptation au terrain
    ad = []
    ngf = n.altitude_sol_fini.valeur
    if ngf is not None:
        tf = v.terrain_fini.valeur
        phrase = f"Le niveau du rez-de-chaussée fini est fixé à {nombre(ngf)} NGF (±0,00)"
        if tf is not None:
            phrase += f", et le terrain fini aux abords de la construction à {nombre(ngf + tf)} NGF ({signe(tf)})"
        phrase += "."
        ad.append((phrase, v.terrain_fini.statut != Statut.CONFIRME))
        m = maison_sur_terrain(p)
        pres = [x.z for x in p.terrain.tn if m is not None and m.buffer(3).contains(Point(x.x, x.y))]
        if pres and tf is not None:
            niveau_tf = ngf + tf
            remblai = niveau_tf - min(pres)
            deblai = max(pres) - niveau_tf
            ad.append((f"Ce calage limite les mouvements de terre aux abords de la construction : remblai d'environ "
                       f"{nombre(max(remblai, 0))} m au point le plus bas, déblai d'environ {nombre(max(deblai, 0))} m "
                       f"au point le plus haut.", False))
    else:
        ad.append(("[à compléter : niveau NGF du rez-de-chaussée et adaptation au terrain]", True))
    out["adaptation"] = ad
    # couverture
    out["couverture"] = [((f"Couverture : {v.couverture}." if v.couverture else "[à compléter : couverture (matériau, teinte)]"),
                          not v.couverture)]
    return out


def notice(doc, projet, reglages) -> list[Planche]:
    auto = _texte_auto(projet)
    u = projet.notice
    blocs = []   # (genre, texte, manquant) ; genre : titre, sous_titre, para, puce

    def para(cle, lib):
        t = (u.get(cle) or "").strip()
        if t:
            for ligne in t.split("\n"):
                if ligne.strip():
                    blocs.append(("puce" if ligne.strip().startswith(("-", "•")) else "para",
                                  ligne.strip().lstrip("-• "), False))
        else:
            blocs.append(("para", f"[à compléter : {lib.lower()}]", True))

    blocs.append(("titre", "Présentation de l'état initial du terrain et de ses abords", False))
    for t, m in auto["terrain"]:
        blocs.append(("para", t, m))
    para("etat_initial", PARAGRAPHES["etat_initial"])
    para("abords", PARAGRAPHES["abords"])
    blocs.append(("titre", "Présentation du projet", False))
    blocs.append(("sous_titre", "Implantation, organisation, composition et volume", False))
    for t, m in auto["projet"]:
        blocs.append(("para", t, m))
    blocs.append(("sous_titre", "Adaptation au terrain", False))
    for t, m in auto["adaptation"]:
        blocs.append(("para", t, m))
    blocs.append(("sous_titre", "Aménagements prévus pour le terrain et viabilisation", False))
    para("viabilisation", PARAGRAPHES["viabilisation"])
    blocs.append(("sous_titre", "Matériaux et couleurs", False))
    for t, m in auto["couverture"]:
        blocs.append(("puce", t, m))
    for cle in ("materiaux_facades", "materiaux_menuiseries", "materiaux_fermetures", "materiaux_zinguerie"):
        t = (u.get(cle) or "").strip()
        blocs.append(("puce", t if t else f"[à compléter : {PARAGRAPHES[cle].lower()}]", not t))
    blocs.append(("sous_titre", "Clôtures, végétation ou aménagements en limite", False))
    para("clotures", PARAGRAPHES["clotures"])
    blocs.append(("sous_titre", "Traitement des espaces libres et plantations", False))
    para("plantations", PARAGRAPHES["plantations"])
    blocs.append(("sous_titre", "Accès au terrain, stationnement", False))
    para("acces", PARAGRAPHES["acces"])

    pages = []

    def nouvelle():
        pl = Planche(doc, projet, reglages, "NOTICE", "descriptive", "PCMI 4", "sans objet")
        z = pl.zone
        y = z.y0 + 4
        titre = f"Projet de {projet.maitre_ouvrage}" if projet.maitre_ouvrage else "Projet"
        pl.texte((z.x0 + z.x1) / 2, y + 10, titre, 13, ancre="c")
        pl.texte((z.x0 + z.x1) / 2, y + 24, projet.adresse, 8.5, ancre="c")
        pl.texte((z.x0 + z.x1) / 2, y + 38, "CONSTRUCTION D'UNE MAISON INDIVIDUELLE", 10, gras=True, ancre="c")
        r = pymupdf.Rect(z.x0, y + 48, z.x0 + (z.width - 16) / 2, y + 66)
        pl.page.draw_rect(r, color=None, fill=(0.93, 0.80, 0.62))
        pl.texte((r.x0 + r.x1) / 2, r.y0 + 12, "Notice décrivant le terrain et présentant le projet", 9, gras=True, ancre="c")
        pl.texte((r.x0 + r.x1) / 2, r.y1 + 10, "(article R.431-8 du code de l'urbanisme)", 6.5, ancre="c", couleur=GRIS)
        pages.append(pl)
        return pl, y + 88

    pl, y0 = nouvelle()
    z = pl.zone
    larg = (z.width - 16) / 2
    col = 0
    y = y0
    for genre, texte, manque in blocs:
        taille = {"titre": 8, "sous_titre": 7.5, "para": 7, "puce": 7}[genre]
        gras = genre in ("titre", "sous_titre")
        retrait = 8 if genre == "puce" else 0
        lignes = pl.lignes_coupees(texte, larg - retrait, taille, gras)
        h = len(lignes) * (taille + 2.2) + (8 if genre == "titre" else 5 if genre == "sous_titre" else 3)
        if y + h > z.y1:
            col += 1
            y = y0 if col == 1 else z.y0 + 4
            if col > 1:
                pl, _ = nouvelle()
                col, y = 0, y0
        x = z.x0 + col * (larg + 16)
        if genre == "titre":
            y += 4
        for i, l in enumerate(lignes):
            if genre == "puce" and i == 0:
                pl.texte(x + 1, y + taille, "•", taille)
            pl.texte(x + retrait, y + taille, l, taille, gras=gras, couleur=ROUGE if manque else NOIR)
            y += taille + 2.2
        y += 5 if genre == "sous_titre" else 3
    return pages
