"""Un dossier préparé par le relevé de visite devient un projet de l'atelier et un PDF *brouillon*.

Le relevé (page web, iPhone ou PC) prépare un fichier « cp-permis » : client, adresse, parcelle, et le plan
dessiné ou scanné en DXF. L'atelier en fait un projet et génère le jeu de pièces.

Règles tenues (voir README) :
- R6 : aucun point d'arrêt n'est validé ni signé. Seule une personne les signe, à son nom ;
- R3, R4 : ce qui vient du relevé reste une hypothèse (⚠️), avec sa source ; rien n'est « confirmé » ;
- R2 : rien n'est inventé. Ce qui manque (volumétrie, terrain, règles du PLU, notice, images) reste « à préciser »
  et les pièces qui en dépendent ne sont pas produites (le plan de masse demande le terrain) ;
- R8 : le seuil de 150 m² reste bloquant, comme pour tout projet ;
- le fichier du relevé n'est jamais modifié, et le plan reçu est gardé tel quel dans 00_entrees."""
from __future__ import annotations

import base64
import binascii
import json
import shutil
import tempfile
from pathlib import Path

from .modele import Decision, Document, hypothese, maintenant
from .production import produire_pdf
from .projet import creer_projet, deposer_document, enregistrer
from .rdc import importer_rdc

FORMAT = "cp-permis"
VERSION = 1
DXF_MAX = 25_000_000          # octets : un plan de maison fait quelques centaines de Ko


class DossierReleveInvalide(ValueError):
    """Le fichier n'est pas un dossier du relevé, ou il est incomplet : rien n'est créé."""


def lire(contenu: str | bytes) -> dict:
    try:
        d = json.loads(contenu)
    except (ValueError, TypeError):
        raise DossierReleveInvalide("Ce fichier n'est pas un dossier préparé par le relevé de visite.")
    if not isinstance(d, dict) or d.get("format") != FORMAT:
        raise DossierReleveInvalide("Ce fichier n'est pas un dossier préparé par le relevé de visite.")
    v = d.get("version")
    if not isinstance(v, int) or v > VERSION:
        raise DossierReleveInvalide("Ce dossier vient d'une version plus récente du relevé : mettez l'atelier à jour.")
    plan = d.get("plan") if isinstance(d.get("plan"), dict) else {}
    try:
        dxf = base64.b64decode(plan.get("dxf_base64") or "", validate=True)
    except (binascii.Error, ValueError):
        dxf = b""
    if not dxf:
        raise DossierReleveInvalide("Le dossier du relevé ne contient pas de plan : dessinez ou scannez les pièces, "
                                    "puis préparez-le de nouveau.")
    if len(dxf) > DXF_MAX:
        raise DossierReleveInvalide("Le plan du relevé est trop volumineux pour être lu.")
    client = d.get("client") if isinstance(d.get("client"), dict) else {}
    projet = d.get("projet") if isinstance(d.get("projet"), dict) else {}
    visite = d.get("visite") if isinstance(d.get("visite"), dict) else {}
    texte = lambda x: str(x).strip() if x is not None else ""
    nom = texte(client.get("nom")) or texte(visite.get("intitule"))
    if not nom:
        raise DossierReleveInvalide("Le dossier du relevé n'indique pas le nom du client.")
    surf = projet.get("surface_terrain")
    return {
        "nom": nom, "maitre_ouvrage": texte(client.get("nom")), "adresse_maitre_ouvrage": texte(client.get("adresse")),
        "adresse": texte(projet.get("adresse")),
        "parcelles": [texte(x) for x in (projet.get("parcelles") or []) if texte(x)],
        "surface_terrain": float(surf) if isinstance(surf, (int, float)) and surf > 0 else None,
        "visite_id": texte(visite.get("id")), "visite_intitule": texte(visite.get("intitule")),
        "dxf": dxf,
    }


def creer(racine: Path, dossier_releve: dict, par: str = "") -> dict:
    """Crée le projet et le brouillon. Retourne {dossier, projet, fichier, avertissement}.
    `fichier` est None si le PDF n'a pas pu être produit (le projet reste créé, avec la raison)."""
    racine = Path(racine)
    d = dossier_releve
    for k in range(1, 50):                                       # une visite reprise deux fois ne remplace jamais le projet
        nom = d["nom"] if k == 1 else f"{d['nom']} {k}"
        try:
            dossier, p = creer_projet(racine, nom, maitre_ouvrage=d["maitre_ouvrage"],
                                      adresse_maitre_ouvrage=d["adresse_maitre_ouvrage"], adresse=d["adresse"],
                                      parcelles=d["parcelles"])
            break
        except FileExistsError:
            continue
    else:
        raise DossierReleveInvalide("Trop de projets portent déjà ce nom : renommez-en un.")
    source = dict(document=f"relevé de visite {d['visite_id'] or ''}".strip(), date=maintenant()[:10])
    try:
        with tempfile.TemporaryDirectory() as tmp:
            t = Path(tmp) / "plan-releve.dxf"
            t.write_bytes(d["dxf"])
            depot = deposer_document(dossier, t)
        p, notes = importer_rdc(p, str(depot))
    except Exception as e:
        shutil.rmtree(dossier, ignore_errors=True)               # pas de projet vide laissé derrière
        raise DossierReleveInvalide(f"Le plan du relevé n'a pas pu être lu : {e}")
    p.documents.append(Document(fichier=f"00_entrees/{depot.name}", type="plan du rez-de-chaussée",
                                source="dossier préparé par le relevé de visite"))
    if d["surface_terrain"]:
        p.surface_terrain = hypothese(d["surface_terrain"], "m²",
                                      "Surface venue du relevé (cadastre ou saisie) : à confirmer sur l'acte ou le plan de division.",
                                      **source)
    p.journal.append(Decision(
        sujet="Dossier préparé depuis le relevé de visite",
        choix=f"visite {d['visite_id'] or '?'} ({d['visite_intitule'] or d['nom']})",
        motif="Brouillon : aucun point d'arrêt validé ; les valeurs du relevé restent des hypothèses à confirmer.",
        par=par or "relevé (automatique)", genre="defaut-prudent"))
    p = enregistrer(dossier, p, "Dossier préparé depuis le relevé de visite")
    try:
        p, cible = produire_pdf(racine, dossier, p, None, par or "relevé (automatique)",
                                motif="Brouillon généré depuis le relevé : à relire, rien n'est validé.")
        return {"dossier": dossier, "projet": p, "fichier": cible, "avertissement": "", "notes": notes}
    except ValueError as e:                                      # ex. seuil de 150 m² : production bloquée (R8)
        return {"dossier": dossier, "projet": p, "fichier": None, "avertissement": str(e), "notes": notes}
