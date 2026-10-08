"""Le modèle unique du projet (R1) : une seule vérité, dont toutes les pièces
seront tirées. Schéma versionné (SCHEMA_VERSION) et validé à chaque écriture
par pydantic.

Toute grandeur qui peut être discutée est une ``Valeur`` : elle porte son
statut (R4) — confirmée (source identifiée), hypothèse (avec la conséquence
si elle est fausse) ou contrôle impossible (avec la donnée qui manque) — et
sa source (R3). Une valeur calculée par l'atelier cite le calcul et ses
entrées ; elle hérite du statut le plus faible de ses entrées.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

SCHEMA_VERSION = 1

Point = tuple[float, float]


def maintenant() -> str:
    return datetime.now().isoformat(timespec="seconds")


class Statut(str, Enum):
    CONFIRME = "confirme"      # ✅ source identifiée
    HYPOTHESE = "hypothese"    # ⚠️ à confirmer, avec la conséquence si elle est fausse
    IMPOSSIBLE = "impossible"  # ❓ donnée manquante : laquelle


SYMBOLE = {Statut.CONFIRME: "✅", Statut.HYPOTHESE: "⚠️", Statut.IMPOSSIBLE: "❓"}
ORDRE_STATUT = {Statut.CONFIRME: 0, Statut.HYPOTHESE: 1, Statut.IMPOSSIBLE: 2}


def statut_le_plus_faible(*statuts: Statut) -> Statut:
    return max(statuts, key=lambda s: ORDRE_STATUT[s]) if statuts else Statut.CONFIRME


class Source(BaseModel):
    """D'où vient une valeur : document (et page, article, indice, date), ou
    source en ligne (URL et date de consultation), ou calcul de l'atelier."""
    document: str = ""
    page: str = ""
    article: str = ""
    indice: str = ""
    date: str = ""
    url: str = ""
    consulte_le: str = ""
    calcul: str = ""

    def texte(self) -> str:
        morceaux = [self.document, self.article and "art. " + self.article, self.page and "p. " + self.page,
                    self.indice and "ind. " + self.indice, self.date, self.url,
                    self.consulte_le and "consulté le " + self.consulte_le, self.calcul]
        return " · ".join(m for m in morceaux if m)


class Valeur(BaseModel):
    valeur: Any = None
    unite: str = ""
    statut: Statut
    source: Optional[Source] = None
    consequence: str = ""   # si hypothèse : ce qui change si elle est fausse
    manque: str = ""        # si contrôle impossible : la donnée qui manque

    def affiche(self) -> str:
        v = self.valeur
        if isinstance(v, float):
            v = f"{v:.2f}".replace(".", ",")
        return f"{SYMBOLE[self.statut]} {v if v is not None else '—'}{(' ' + self.unite) if self.unite else ''}"


def confirme(valeur, unite="", **source) -> Valeur:
    return Valeur(valeur=valeur, unite=unite, statut=Statut.CONFIRME, source=Source(**source))


def hypothese(valeur, unite="", consequence="", **source) -> Valeur:
    return Valeur(valeur=valeur, unite=unite, statut=Statut.HYPOTHESE, consequence=consequence, source=Source(**source))


def impossible(manque: str, unite="") -> Valeur:
    return Valeur(valeur=None, unite=unite, statut=Statut.IMPOSSIBLE, manque=manque)


# ---------------------------------------------------------------- bâtiment

class Mur(BaseModel):
    id: str
    polygone: list[Point]           # le mur tel qu'il est dessiné (face en plan)
    trous: list[list[Point]] = []   # un mur de façade continu fait le tour : son contour intérieur est un trou
    epaisseur: float                 # m
    exterieur: bool
    porteur: Valeur                  # jamais « confirmé » sans document (R2)


class Ouverture(BaseModel):
    id: str
    type: str                        # porte, fenetre, porte-fenetre, porte de garage, baie, inconnu
    position: Point                  # milieu de l'ouverture
    largeur: Valeur
    hauteur: Valeur
    allege: Valeur
    exterieure: bool
    origine: str = ""                # bloc DXF, interruption de mur…
    polygone: list[Point] = []       # l'ouverture dans l'épaisseur du mur (pour la dessiner)
    menuiserie: str = ""             # vitree, pleine, garage ; vide : vitrée (porte de garage : garage)


class Piece(BaseModel):
    id: str
    nom: str
    usage: str                       # sejour, chambre, eau, garage, technique, circulation, rangement, autre
    polygone: list[Point]
    surface_calculee: float          # m², à l'intérieur des murs et cloisons
    surface_lue: Optional[Valeur] = None   # surface écrite sur le plan source
    humide: bool = False
    exclue_habitable: bool = False
    motif_exclusion: str = ""


class Couvert(BaseModel):
    """Porche, auvent, préau, abri : couvert mais hors des murs."""
    nom: str
    polygone: list[Point]
    compte_emprise: Valeur           # soutenu par des poteaux : compte dans l'emprise au sol


class Niveau(BaseModel):
    nom: str = "Rez-de-chaussée"
    altitude_sol_fini: Valeur = Field(default_factory=lambda: impossible("altitude du RDC fini (plan de masse, relevé)", "m"))
    hauteur_sous_plafond: Valeur = Field(default_factory=lambda: hypothese(
        2.50, "m", consequence="si une partie est sous 1,80 m, elle sort de la surface de plancher et de la surface habitable",
        calcul="valeur courante, non lue sur le plan"))
    epaisseur_plancher: Valeur = Field(default_factory=lambda: impossible("système de plancher (dalle, poutrelles-hourdis, bois)", "m"))
    contour_exterieur: list[Point] = []
    murs: list[Mur] = []
    ouvertures: list[Ouverture] = []
    pieces: list[Piece] = []
    couverts: list[Couvert] = []


def _hyp(v, unite, consequence, calcul="valeur courante, à confirmer"):
    return Field(default_factory=lambda: hypothese(v, unite, consequence=consequence, calcul=calcul))


class Volumetrie(BaseModel):
    """Ce que les façades, coupes et la toiture demandent en plus du plan.
    Hauteurs par rapport au sol fini du RDC (±0,00). Tant qu'une valeur n'est
    pas saisie, elle reste une hypothèse courante, signalée sur les pièces."""
    hauteur_egout: Valeur = _hyp(2.80, "m", "toutes les hauteurs de façade et de faîtage en dépendent")
    hauteur_arase: Valeur = _hyp(2.70, "m", "hauteur des murs sous toiture sur les coupes")
    pente_toiture: Valeur = _hyp(35.0, "°", "hauteurs de faîtage et règles du PLU sur les pentes")
    debord_toiture: Valeur = _hyp(0.30, "m", "emprise des débords, hauteurs de faîtage")
    type_toiture: str = "croupes"
    couverture: str = ""
    vide_sanitaire: Valeur = _hyp(0.60, "m", "coupes seulement (hauteur du vide sanitaire sous la dalle)")
    terrain_fini: Valeur = _hyp(-0.15, "m", "niveau du terrain aux abords sur les façades et coupes")
    # direction du nord, en degrés depuis l'axe x du plan (90 = vers le haut du plan)
    nord: Valeur = _hyp(90.0, "°", "noms des façades (nord, sud…) et flèche du nord",
                        calcul="nord supposé vers le haut du plan")


class Batiment(BaseModel):
    # plain-pied par défaut : l'étage n'est étudié que sur demande (module B)
    type_niveaux: str = "plain-pied"     # plain-pied, etage, combles-amenages
    niveaux: list[Niveau] = []
    charpente: Valeur = Field(default_factory=lambda: impossible("type de charpente (fermettes, traditionnelle…)"))
    volumetrie: Volumetrie = Field(default_factory=Volumetrie)


# ---------------------------------------------------------------- projet

class Decision(BaseModel):
    le: str = Field(default_factory=maintenant)
    par: str = ""
    sujet: str
    choix: str
    motif: str = ""
    genre: str = "decision"           # decision, defaut-prudent, point-arret


class Modification(BaseModel):
    le: str = Field(default_factory=maintenant)
    indice: str
    motif: str
    version: int


class PointArret(BaseModel):
    valide: bool = False
    le: str = ""
    par: str = ""
    remarque: str = ""


POINTS_ARRET = {
    "1_rdc": "Validation du RDC interprété",
    "2_implantation": "Validation de l'implantation",
    "3_regles": "Validation des règles extraites du PLU et du lotissement",
    "4_risques": "Validation de l'analyse des risques",
    "5_relecture": "Relecture finale avant export du jeu de dépôt",
}


class Document(BaseModel):
    fichier: str                      # chemin relatif dans 00_entrees/
    type: str = "à classer"
    date: str = ""
    indice: str = ""
    source: str = ""
    depose_le: str = Field(default_factory=maintenant)


class PointTN(BaseModel):
    """Altitude du terrain naturel en un point (repère du terrain, m ; z en NGF)."""
    x: float
    y: float
    z: float
    source: str = ""


class Implantation(BaseModel):
    """Passage du repère du RDC au repère du terrain : rotation (degrés,
    autour de l'origine) puis translation."""
    angle: float = 0.0
    dx: float = 0.0
    dy: float = 0.0
    statut: Valeur = Field(default_factory=lambda: impossible("implantation de la maison sur le terrain"))


class Terrain(BaseModel):
    limites: list[Point] = []          # limite de propriété (polygone fermé), repère du terrain
    source: str = ""
    cotes: list[dict] = []             # par côté : longueur mesurée, longueur écrite sur le plan (si retrouvée)
    alignement: list[int] = []         # côtés sur voie
    tn: list[PointTN] = []
    surface: Valeur = Field(default_factory=lambda: impossible("surface du terrain", "m²"))
    implantation: Optional[Implantation] = None
    nom_voie: str = ""
    altitude_rdc: Optional[Valeur] = None   # altitude NGF du ±0,00 (RDC fini), si le plan l'écrit (« ±0,00 = 50,30 »)


class Regle(BaseModel):
    """Une règle du PLU saisie avec son article (R3) : l'atelier la contrôle."""
    cle: str                           # recul_alignement, recul_limites, emprise_max, hauteur_egout_max…
    valeur: float
    article: str = ""                  # ex. « UG 4.2 du PLUi »
    note: str = ""


class Image(BaseModel):
    """Une image fournie pour une planche : extrait cadastral, vue aérienne,
    photographie, insertion (photomontage réalisé par ailleurs)."""
    id: str
    fichier: str                       # chemin relatif dans 00_entrees/
    piece: str                         # PCMI1, PCMI6, PCMI7, PCMI8
    legende: str = ""
    point: Optional[Point] = None      # prise de vue, repère du terrain
    direction: Optional[float] = None  # degrés, sens trigonométrique
    numero: Optional[int] = None       # numéro de la prise de vue (sinon : numérotation automatique)


class Modificatif(BaseModel):
    """Une ligne du tableau « Dates / Modifications » de la page de garde."""
    date: str
    objet: str


class Projet(BaseModel):
    schema_version: int = SCHEMA_VERSION
    id: str
    nom: str
    maitre_ouvrage: str = ""
    adresse_maitre_ouvrage: str = ""     # adresse actuelle du maître d'ouvrage (page de garde)
    adresse: str = ""
    parcelles: list[str] = []
    numero_dossier: str = ""
    indice: str = "A"
    version: int = 0
    cree_le: str = Field(default_factory=maintenant)
    historique: list[Modification] = []
    journal: list[Decision] = []
    points_arret: dict[str, PointArret] = Field(default_factory=lambda: {k: PointArret() for k in POINTS_ARRET})
    documents: list[Document] = []
    terrain: Terrain = Field(default_factory=Terrain)
    regles: list[Regle] = []
    surface_terrain: Valeur = Field(default_factory=lambda: impossible("surface du terrain (plan de division, acte)", "m²"))
    zone_sismique: Valeur = Field(default_factory=lambda: impossible("zone sismique (Géorisques)"))
    chauffage: str = ""
    divers: str = ""
    modifications: list[Modificatif] = []
    zone_plu: str = ""                 # ex. « secteur UGc du PLUi de la Communauté urbaine d'Alençon »
    commune: str = ""
    notice: dict[str, str] = {}        # paragraphes de la notice saisis par l'utilisateur
    images: list[Image] = []
    batiment: Batiment = Field(default_factory=Batiment)
    # le plan source du RDC tel qu'il a été lu (pour l'affichage côte à côte)
    source_rdc: dict = {}
    ecarts_rdc: list[dict] = []
