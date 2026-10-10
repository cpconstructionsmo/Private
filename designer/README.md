# CP Designer

Module de conception de CP Constructions, **séparé du suivi de chantiers**
(`index.html`) : voir les décisions d'architecture dans
[`docs/designer/`](../docs/designer/README.md).

État : **Phase 1, étape 1 faite — Geometry Engine** (`src/geometry/`) :
vecteurs, prédicats tolérants, segments (projection, distance,
intersection : croisement, contact, chevauchement), décalage de polylignes
(faces d'un mur, onglet et biseau), opérations booléennes en entiers
(Clipper2), faces d'un graphe planaire (pièces lues dans un tracé, îles,
murs pendants ignorés), aire, périmètre, centre de gravité. Tests exacts et
tests de propriétés (1 000 cas par propriété).

**Étape 2 faite — modèle et commandes** (`src/model/`, `src/engine/`) :
identifiants stables (ULID), création d'un projet, sérialisation canonique
(clés triées : annuler se vérifie octet pour octet), migrations de schéma
testées sur un instantané figé (`tests/fixtures/projet_v1.json`),
opérations inversibles, commandes validées (murs, ouvertures, pièces,
niveaux, suppression en cascade), historique annuler / rétablir et
transactions (une action composée = un seul « annuler »), ChangeSets
datés et signés.

**Étape 3 faite — murs, pièces, ouvertures** (`src/building/`) : contours
des murs dérivés avec jonctions en onglet (L, T, Y, croix, justification
axe / face), maçonnerie (union), pièces = vides fermés rattachés à leur nom
par leur point intérieur (alertes : à nommer, non fermée, doublon),
ouvertures placées dans leur mur et découpées pour le dessin, métré des
baies (dimensions, surface, pièces de part et d'autre, extérieure ou non),
plan d'un niveau en cache.

**Étape 4 faite — enregistrement** (`src/persistence/`) : dépôt Supabase
(tables `designer_*`, fonction `designer_enregistrer`, jamais `app_data`)
et dépôt en mémoire avec la même règle de concurrence ; chargement =
dernier instantané + ChangeSets rejoués ; synchronisation dans l'ordre,
hors ligne sans perte, reprise après fermeture de la page (copie locale
IndexedDB), conflit entre deux personnes arrêté sans rien écraser,
instantané tous les 50 changements et à chaque jalon (APS V1, PC…) ;
connexion partagée avec le suivi de chantiers (même session). Avant de
s'en servir : exécuter une fois `supabase/designer/schema.sql`.

**Étape 5 faite — moteurs d'édition** (`src/geometry/index-spatial.ts`,
`src/building/accrochage.ts`, `contraintes.ts`, `fond.ts`) : index spatial
(R-tree) ; accrochage (extrémité, intersection, milieu, perpendiculaire,
face, axe, alignement, grille ; Alt le coupe) — 2 000 murs : 9 µs en
moyenne par recherche ; solveur de contraintes (horizontal, vertical,
parallèle, perpendiculaire, longueur, angle) et de cotes motrices : un
sommet déplacé entraîne les murs qui s'y raccordent, une cloison en T suit
son mur, les murs voisins s'ajustent avant le reste du plan, et ce qui ne
peut pas être respecté est refusé avec la raison ; niveaux (modifier,
supprimer — jamais le dernier) ; fond PDF ou image calé par deux points ou
par une distance, verrouillable.

**Étape 6 faite — l'éditeur** (`src/ui/`) : page `designer/?chantier=<id>`
(un projet par chantier). Outils Sélection (V), Mur (M), Cloison (C),
Ouverture (O), Pièce (P), Cote (D) ; accrochage visible (Alt le coupe, Maj
bloque à 45°) ; tirer une extrémité, un mur ou une ouverture ; inspecteur
(dimensions, type, contraintes, provenance, « porteur » toujours à
contrôler) ; niveaux (altitude, hauteur, niveau du dessous en fantôme) ;
fonds PDF ou image importés, calés par deux points et une distance,
verrouillables (fichier rangé sur l'appareil et, en mode serveur, dans
l'espace privé « designer-fonds » : les collègues le reçoivent) ; surfaces
et alertes du niveau ; annuler / rétablir (Ctrl+Z, Ctrl+Maj+Z) ; palette de
toutes les actions (Ctrl+K) ; export JSON.

Enregistrement : connecté au suivi de chantiers (même session) et tables
installées, chaque modification part sur le serveur (annuler y est une
modification de plus) ; sinon le Designer le dit et travaille **en local**
(navigateur de l'appareil). Pour l'enregistrement partagé : exécuter une
fois `supabase/designer/schema.sql` dans Supabase.

Lien « Ouvrir dans CP Designer (préversion) » sur la fiche chantier
(rubrique « Plans d'exécution »).

**Phase 1 bis faite — import du RDC lu par l'atelier** (`src/import/`,
ADR-0004) : le `modele.json` de l'atelier (plan DXF ou PDF déjà lu) devient
des murs à l'axe (faces parallèles appariées, épaisseur mesurée, angles et
T raccordés, cloisons en baïonnette comprises), des ouvertures posées sur
leur mur et des pièces nommées ; statuts repris (✅ → confirmé, ⚠️ / ❓ → à
vérifier, hauteurs non lues signalées), tracé du plan source en fond
verrouillé, rapport des surfaces atelier / Designer pièce par pièce, un
seul « annuler ». Ce qui ne se convertit pas (poteau, baie qui dépasse)
est signalé, jamais inventé. Les pièces lues par l'atelier restent fermées :
un bord de pièce qu'aucun mur ne longe devient, avec une porte lue dedans,
la suite de la cloison de la même ligne (porte au bout d'une cloison, contre
le mur qui la croise), sinon une cloison fictive (passage ouvert, « à
vérifier ») ; un éclat de dessin logé dans l'épaisseur d'un mur plus épais
est écarté. Essais sur de vrais RDC (hors dépôt) : 6 pièces sur 6, puis 12
sur 12 (au lieu de 8), aux surfaces de l'atelier à quelques centièmes.

**Tracé rapide et cotation automatique** (pour se rapprocher des logiciels
de plans de maisons) :
- pendant un tracé, la longueur se tape : `4,50` puis Entrée (dans la
  direction visée), `4,50<90` (avec un angle), `450cm` ;
- outil **Rectangle de murs** (R) : deux angles, ou `10x8` tapé ; cotes
  hors tout (les murs poussent vers l'intérieur) ou intérieures ;
- **cotation automatique** autour du plan (`src/building/cotation.ts`) :
  chaînes des ouvertures, des décrochés et hors tout, de chaque côté ;
  cotes intérieures de chaque pièce (entre faces, en retrait d'un mur ; une
  pièce en L est cotée sur sa plus grande portée, en long et en travers) ;
  dimensions des pièces rectangulaires sous leur surface. Tout est dérivé
  (ADR-0002) : rien n'est enregistré, la cotation suit chaque modification.
  Elle se coupe dans les réglages (choix propre à l'appareil) ;
- une ouverture choisie (ou en cours de pose) montre ses distances aux murs
  ou ouvertures voisins, côté pièce, en rouge ; l'inspecteur les règle
  (« Distance à gauche : 1,50 m »).

**Bibliothèque d'ouvertures** (`src/catalogue/ouvertures.ts`) : outil
Ouverture (O), le panneau de droite montre les modèles courants par famille
(fenêtres, portes-fenêtres et baies coulissantes, portes d'entrée, blocs-portes,
portes de garage, passages), avec leur symbole en plan ; un clic choisit le
modèle, on le pose d'un clic sur un mur ou en le glissant dessus. Dimensions
de tableau courantes (ni marque ni prix), à confirmer avec le menuisier.
Une ouverture garde le nom de son modèle ; l'inspecteur change le modèle,
les vantaux et la manœuvre (battant, coulissant, fixe, oscillo-battant,
sectionnelle, basculante, enroulable). Ces champs sont facultatifs : les
projets d'avant restent lisibles sans migration.

**Vue 3D** (bouton « 3D » ou touche 3 ; ADR-0006) : la maquette se calcule
à partir du plan (`src/vue3d/maquette.ts` : murs découpés autour des
ouvertures, allèges et linteaux, vitrages, portes, planchers, sols, niveaux
à leur altitude) et s'affiche avec three.js, chargé seulement à la première
ouverture. On tourne autour, on zoome, « vue maquette » coupe les murs à
1,20 m pour voir l'intérieur, une image PNG s'enregistre ; chaque
modification (annuler compris) s'y voit aussitôt. Deux rendus, au choix
(gardé sur l'appareil) : **réaliste** par défaut — textures peintes par le
programme (`src/ui/textures.ts` : tuiles, ardoises, zinc, enduit, béton,
bois, gravier, herbe, avec leur relief ; aucune image dans le dépôt), ciel,
brume d'horizon, reflets d'environnement sur les vitrages, ombre des angles
(GTAO), tons de cinéma — ou **maquette** (aplats et arêtes, plus léger).
Les fenêtres ont leur menuiserie (dormant, un ouvrant par vantail, montant
central) et, en façade, leur appui ; portes et portes de garage, leur
dormant. Pignons et lucarnes prennent le parement des façades ; les arbres
ont une couronne arrondie et feuillue.
**Ensoleillement et images** (panneau de la 3D ; `src/vue3d/soleil.ts`) : la
lumière d'atelier (soleil au sud-est, façades sud éclairées) ou le soleil
d'une date (21 mars, 21 juin, 23 septembre, 21 décembre) à une heure
solaire, à la latitude du terrain (47° par défaut, le milieu de la France,
à préciser), orienté par le nord de la parcelle : hauteur et azimut dits au
panneau, avec le lever et le coucher ; un soleil bas est plus chaud, sous
l'horizon il s'éteint. Des ombres d'illustration (formules usuelles, à un
degré près), pas une étude réglementaire ; réglé le temps de la séance.
« Image HD » recalcule la vue courante en grand (3 000 px par défaut,
jusqu'à 4 096) pour les images du client.

**Toiture** (`src/building/toiture.ts`, panneau du niveau ou de la 3D) : le
modèle ne garde que les choix (type, pente, débord, couverture) ; pans,
faîtages et pignons se calculent depuis le contour des murs et le suivent.
À croupes sur tout plan à angles droits (méthode de l'atelier, mêmes
surfaces sur les mêmes plans), deux pans à pignons (sur un rectangle ; sur
un plan en L, T, U, chaque bout d'aile devient un pignon et les noues se
forment dans les angles rentrants), un pan sur un plan rectangulaire,
toit-terrasse avec acrotère. Un mur extérieur tracé sans hauteur monte à
l'arase, hauteur sous plafond + 20 cm (2,70 m pour 2,50 m, comme aux
dossiers du cabinet ; sous un étage, jusqu'à son plancher), et la hauteur
des murs extérieurs se règle d'un coup au panneau de la toiture. Le dessus
du toit passe au talon de la charpente au-dessus de l'arase, au nu
extérieur des murs : 25 cm par défaut (charpente, liteaux, couverture),
réglable par toiture de 0 à 80 cm ; pour 2,70 m d'arase, 20 cm de débord à
35°, l'égout est à 2,81 m. Les pignons montent jusqu'au dessous du toit.
Débord proposé : 20 cm. Égout, faîtage et surface de couverture sont
annoncés (indicatifs : la charpente n'est pas étudiée, le talon est à
confirmer par le charpentier). Un plan qui ne
convient pas est refusé avec sa raison. En plan : égout en tirets, lignes
des pans en pointillé.

**Mobilier** (outil B ; `src/catalogue/mobilier.ts`, `src/building/mobilier.ts`) :
une quarantaine de meubles et équipements courants (séjour, chambre,
cuisine, salle de bains, WC et buanderie, place de stationnement au
garage, aire de rotation Ø 1,50 m), sans
marque ni prix. Approché d'un mur, un meuble s'y plaque dos contre la face
et se tourne vers la pièce ; près d'un angle, il glisse jusqu'au mur
voisin (Alt : pose libre ; T : quart de tour). On le tire pour le déplacer,
l'inspecteur règle ses cotes et son orientation, « Dupliquer » en pose un
autre. Même description pour le plan (symbole) et la 3D (volumes). Le
mobilier ne change ni les murs ni les surfaces. En 3D, des blocs assez
détaillés pour qu'un meuble se reconnaisse : sommier sur pieds, matelas,
couette et un oreiller par place d'un lit ; assises et dossiers d'un
canapé, coussin par coussin ; portes, tiroirs et poignées séparés d'un
joint ; baignoire creuse, robinetterie, colonne de douche, hublot du
lave-linge, four vitré de la colonne.

**Meubler les pièces** (Produit › « Meubler les pièces », ou la palette ;
`src/building/ameublement.ts`) : d'un clic, chaque pièce vide du niveau
reçoit le mobilier de son usage, comme aux plans des dossiers du cabinet.
- Chambre : un lit double (160, sinon 140, sinon un lit de 90), tête contre
  un mur plein et loin de la porte, avec ses chevets ; une armoire s'il n'y
  a pas de placard.
- Pièce de vie (et cuisine) : une cuisine en ligne (évier sous la fenêtre si
  possible, réfrigérateur en bout), l'îlot dans une grande pièce, le canapé
  face au meuble TV avec sa table basse, la table et ses chaises.
- Salle de bains : baignoire ; salle d'eau : douche (et le WC à partir de
  4,5 m²) ; la vasque.
- WC : la cuvette au fond, un lave-mains s'il reste un mur.
- Cellier ou buanderie : lave-linge et sèche-linge côte à côte.
- Garage : la place de stationnement (2,50 × 5,00 m, en tirets), dans l'axe
  de la porte de garage.

Règles de pose :
- tout reste dans la pièce, sans chevauchement ;
- le passage devant chaque porte reste libre : la largeur du battant s'il
  ouvre dans la pièce, 70 cm sinon ;
- rien de plus haut que l'allège devant une fenêtre ;
- chaque meuble garde son dégagement d'usage.

Une pièce qui a déjà un meuble (hors placard) n'est pas touchée. Ce qui ne
tient pas est signalé, jamais forcé. Le tout est une seule action (Ctrl+Z
retire tout), et chaque meuble se règle ensuite à la main.

Au dossier de permis, le choix « Avec le mobilier » de l'export s'applique
aussi aux plans des niveaux.

**Copier, coller** (`src/engine/presse-papiers.ts`) : plusieurs objets se
choisissent ensemble (Maj + clic, cadre tiré dans le vide, Ctrl+A) ;
Ctrl+C copie (un mur emporte ses ouvertures ; cotes et contraintes suivent
si tous leurs murs viennent), Ctrl+X coupe, Ctrl+D duplique ; Ctrl+V fait
suivre le groupe au curseur — T quart de tour, X / Y miroir, un clic le
pose sur un angle de mur (Alt : librement). Le presse-papiers est gardé sur
l'appareil : on colle d'un niveau ou d'un projet à l'autre. Un collage est
fait de commandes ordinaires : un seul « annuler ».

**Export PDF** (bouton « PDF » ; `src/export/`) : une planche A3 par niveau,
à la plus grande échelle normalisée qui tient (1/50, 1/75, 1/100…), cotes,
débord de toit, mobilier au choix, tableau des surfaces, échelle
graphique. Toutes les planches suivent le modèle des dossiers de permis du
cabinet (`src/export/feuille.ts` et un module par planche) :
- la feuille : un cadre, la colonne CP Constructions sur toute la hauteur
  (logo, titre en Times sur fond gris, numéro de feuille et indice,
  construction de, adresse du projet, zone sismique, dessiné par, RE 2020,
  format, échelle ; intitulés en italique soulignés), le titre de la
  planche en bas à gauche ; ce qui n'est pas saisi s'écrit « [à préciser] » ;
- le plan d'un niveau (`planche-niveau.ts`) : pièces blanches, maçonnerie
  grise hachurée, doublage isolant crème ondulé, cloisons grises,
  « SH : 12,91 m² » (SA pour un garage), placards « PL », trois chaînes de
  cotes (baies « 0,90 × 1,35 » et « all. 0,80 », décrochés, hors tout),
  « VR » devant les baies à volet roulant (volet choisi dans l'inspecteur
  de la baie), repères de coupe en brique, cotes intérieures des pièces,
  noms couchés ou debout selon la place ; le tableau des surfaces, la
  légende, le nord et l'échelle se posent dans les vides du dessin. On
  garde la plus grande échelle où tout tient : le plan centré, sinon calé
  en haut (le blanc du bas reçoit légende et échelle), l'échelle graphique
  seule ou accolée sous la légende ;
- les façades (`planche-facades.ts`) : couverture rayée de ses rangs,
  parements à leur teinte et à leur motif, menuiseries, porte d'entrée et
  porte de garage au matériau et à la teinte choisis aux informations du
  dossier (`catalogue/menuiseries.ts`, teintes RAL ; gris anthracite et
  « [à préciser] » sinon ; la 3D les suit), terrain fini (TF) à son niveau,
  niveaux à gauche (égout, RDC fini, terrain naturel), faîtages vus
  au-dessus, dimensions sous les baies, encadrés « Matériaux & teintes » et
  « Niveaux et lecture des façades » ; nommées par leur orientation ;
- le plan de toiture (`planche-toiture.ts`) : pans gris rayés, faîtages,
  arêtiers, noues, égout et gouttière, flèches de pente, faîtages cotés
  (et en NGF), le nu des murs en tirets, la couverture en chiffres ;
- les coupes (`planche-coupes.ts`) : deux par feuille, sur leur terrain
  (terrain naturel relevé, sol en place), maçonnerie coupée hachurée,
  toiture vue au-delà, pièces traversées, niveaux et altitudes NGF,
  limites de propriété, terrain fini aux abords (vert), comble blanc avec
  le plafond et son isolant (composition du plafond du niveau) et
  « Comble perdu », fondations du projet (semelles et soubassements
  coupés, vide sanitaire blanc sous le plancher) ; repères de niveau dans
  le terrain entre la limite et la maison quand ils y tiennent (la coupe
  y gagne une échelle) ; légende, notes, repérage. Sans trait tracé, deux
  coupes se placent d'elles-mêmes : en travers (A) et en long (B) ;
- le plan de masse (`planche-masse.ts`) : la feuille tournée pour que la
  voie soit en bas (le modèle ne bouge pas, le nord tourne avec), parcelle
  verte aux côtés cotés, sa référence et sa surface dans sa partie libre,
  bornes, voie, toiture vue de dessus, emprise en tirets, aménagements,
  arbres, réseaux, prises de vue (un cône de 9 mm vers ce qu'on
  photographie), terrain fini « TF » au pied des façades, reculs en
  rouge, bordure d'alignement en tirets, accès coté là où l'allée ou le
  stationnement arrivent sur la voie (mesuré, sans rien supposer de son
  statut) ; légende, « Surfaces et
  règles », notes, puis les listes (terrain, reculs, aménagements,
  terrassement, réseaux, plantations, prises de vue). Le PDF est écrit sans bibliothèque et en vectoriel : le plan y
est dessiné par le même code qu'à l'écran, sur une « toile PDF ».

**Façades** (`src/vue3d/facades.ts`, option de l'export PDF) : les quatre
façades déduites de la maquette 3D, en projection de face (faces peintes de
la plus lointaine à la plus proche), à une même échelle, avec terrain, baies,
toiture, cotes de niveau (±0,00, égout, faîtage) et le tableau des
hauteurs. Orientation supposée : le haut du plan au nord (à confirmer sur
le plan de masse). Hauteurs indicatives (charpente non étudiée).

**Coupes** (outil K ; `src/vue3d/coupe.ts`, option de l'export PDF) : la
maquette tranchée par un plan vertical (PCMI 3). On trace le trait de coupe
de deux clics (Maj : 45°) ; il prend la première lettre libre (A-A, B-B…),
regarde à gauche du trait (T ou l'inspecteur l'inversent), se tire pour se
déplacer et montre un aperçu de la coupe dans l'inspecteur. Le plan de coupe
prolonge le trait de part en part du bâtiment ; le trait se voit sur tous
les niveaux. Sans trait tracé, une coupe A-A se place d'elle-même : en
travers de la plus petite dimension de la maison (la pente du toit se lit),
par l'escalier s'il y en a un, sinon par le milieu, et jamais le long d'un
mur. Ce qui est tranché (murs, allèges et linteaux, planchers
et trémies, marches, couverture) est plein ; ce qui est au-delà se voit en
élévation (même projection que les façades) ; le mobilier n'y figure pas.
La planche porte le terrain (supposé au sol fini), les cotes de niveau
(sols, égout, faîtage), la chaîne des hauteurs et un plan de repérage.
Une planche par coupe ; les traits, fléchés, s'ajoutent sur les plans du
même PDF.

**Visite à hauteur d'homme** (vue 3D, bouton « Visite » ou touche V ;
`src/vue3d/visite.ts`) : les yeux à 1,60 m, départ au milieu de la plus
grande pièce. Z Q S D (W A S D) et flèches pour marcher et tourner, la souris
glissée pour regarder, Maj pour presser le pas, F pour revenir au départ,
Échap pour sortir. Le marcheur se pose sur la surface la plus haute qu'il
atteint d'un pas (il monte et descend l'escalier) ; murs, cloisons, vitrages
et meubles l'arrêtent, il glisse le long ; les portes, supposées ouvertes,
le laissent passer. Plafonds blancs au haut des murs du dernier niveau,
lumière d'ambiance : rien de tout cela n'est enregistré.

**Plan de masse** (outil L ; `src/building/terrain.ts`, option de l'export
PDF) : la parcelle se trace sur le niveau le plus bas, sommet par sommet,
ou côté par côté en tapant les longueurs du relevé (25,30 ou 25,30<90) ;
elle se ferme au premier point ou par Entrée. La maison ne bouge pas : on
place la PARCELLE autour d'elle (à une distance donnée de deux côtés), on la
tourne pour qu'un côté soit parallèle à la maison (son nord tourne avec
elle), ou on la tire. Tout se mesure : surface du terrain, emprise au sol
(maçonnerie de tous les niveaux, débords de toit exclus), reculs de la
maçonnerie à chaque côté ; une maison qui sort de la limite est signalée.
L'inspecteur garde la référence cadastrale, la voie et ses côtés, le nord et
l'altitude NGF du ±0,00. La planche « Plan de masse (PCMI 2) » porte la
limite cotée, la voie, les reculs, l'emprise et le débord du toit, le nord,
le tableau du terrain ; ce qui manque s'écrit « [à compléter] ». Une vue 3D gardée (panneau 3D :
« Garder cette vue pour le dossier ») y entre en page « Vue 3D », image JPEG
intégrée au PDF ; l'insertion dans le site (PCMI 6) se compose aussi dans la
3D (voir « Dossier de permis »). Le terrain
lu par l'atelier (limite, côtés sur voie, nom de la voie, implantation,
points du terrain naturel, altitude du ±0,00 écrite au plan, nord lu sur
la flèche du plan (à vérifier), références
cadastrales, règles du PLU de la zone) revient avec l'import du RDC, ainsi
que les informations du dossier (maître de l'ouvrage, adresses, zone
sismique, chauffage…) dans les cases encore vides seulement ; un projet
qui a déjà sa parcelle la garde (un avertissement le dit).

**Terrain fini et règles du PLU** (panneau de la parcelle) : le terrain
fini aux abords (cm par rapport au ±0,00) va aux façades, aux coupes et
au plan de masse. Les règles du PLU lues au règlement de la zone (zone,
source, emprise maximale, pleine terre et surfaces non imperméabilisées
minimales, coefficient de biotope, stationnement, hauteurs à l'égout et
au faîtage, reculs sur voie et sur limites) sont confrontées au projet
(`src/building/plu.ts`) : ✅ / ⛔ / ❓ au panneau, « 24 % (max. 35 %) » au
tableau « Surfaces et règles » du plan de masse, en rouge si elles ne
sont pas tenues. Seuls les gravillons et les dalles engazonnées comptent
« non imperméabilisés » à côté de la pleine terre ; une allée tracée tout
autour de la maison ne compte que sa bande (ce que la maison couvre n'est
pas compté deux fois) ; une mesure qui manque
(places prévues, coefficient des revêtements perméables, terrain naturel
pour les hauteurs) laisse la règle « à vérifier ».

**Fond cadastral** (`src/building/cadastre.ts`, panneau de la parcelle) :
les parcelles voisines et le bâti existant du plan cadastral (GeoJSON
d'Etalab : fichiers « parcelles » et « batiments » d'une commune, .json ou
.json.gz, importés depuis l'appareil ; ou téléchargés sur
cadastre.data.gouv.fr par le code INSEE). Les coordonnées en degrés sont
projetées en Lambert 93. Le terrain est retrouvé par la référence
cadastrale de la parcelle (« ZB n° 237 et 238 ») et calé sur la limite
tracée : rotation cherchée, translation des centres, échelle inchangée ;
l'écart moyen restant est affiché, et la rotation peut donner le nord du
plan. Seul ce qui est à moins de 150 m du terrain est gardé ; le fond suit
la parcelle quand on l'implante. Au plan de masse : limites voisines au
trait gris avec leur référence, bâti existant hachuré, légende, et la note
« limites cadastrales hors terrain d'assiette non garanties ». Sans fond,
la note le dit « [à préciser] ». La maison y est cotée en longueur et en
largeur (nu extérieur des murs), hors de la toiture.

**Aménagements extérieurs** (outil A ; `src/catalogue/amenagements.ts`) :
clôtures (grillage rigide, palissade, mur bahut et grille, mur enduit,
haie), terrasses, allées et accès, stationnement, espaces verts. On choisit
le genre et l'aspect, puis on clique les points (ou on tape les longueurs) :
Entrée finit une clôture, le retour au premier point ferme une surface. Ils
se tracent sur le niveau le plus bas, se choisissent, se tirent ; la hauteur
d'une clôture et le niveau d'une terrasse se règlent. Le plan de masse les
dessine et les mesure (surface ou longueur, part d'espaces verts) ; la 3D
les montre (une clôture arrête la visite) ; ni façade ni coupe.

**Matériaux** (`src/catalogue/materiaux.ts`) : parements de façade (enduits,
bardages, pierre, brique) et sols (carrelages, parquet, béton ciré…), des
aspects courants, sans marque ni prix (le produit reste au programme
technique). Le parement se choisit mur par mur (inspecteur d'un mur
extérieur) ou pour toutes les façades d'un coup (panneau 3D) ; le sol, pièce
par pièce ou pour tout le niveau. En 3D, le parement est une peau de 2 cm
prise dans l'épaisseur du mur, sur la face qui donne dehors (l'intérieur
garde sa teinte), avec son motif (lames, briques, carreaux, parquet) ; les
façades du PDF prennent ses teintes et listent les matériaux (parements et
couverture) ; la coupe tranche la peau avec le mur.
Un **décor** habille une partie d'une façade d'un autre parement, sur toute
la hauteur du mur : l'enduit imitation pierre autour de l'entrée des
dossiers du cabinet (`src/building/decors.ts`, `Wall.finishZones`). Dans
l'inspecteur d'un mur extérieur, « + Décor sur une partie du mur » le
propose autour de la porte d'entrée (1 m de part et d'autre, nommé
« Décoration de l'entrée »), sinon au tiers du milieu, toujours dans une
partie libre ; son nom, son parement et ses bornes (en mètres depuis le
début du mur) se règlent, « Retirer ce décor » l'enlève. Huit décors au plus
par mur, 10 cm au moins chacun, sans se chevaucher ; une cloison n'en reçoit
pas. Le plan le teinte (hors dossier) ; la 3D l'habille ; les façades du
permis le dessinent avec son motif et le nomment dans la légende des
matériaux (« Décoration de l'entrée — Enduit imitation pierre »), après le
parement des façades ; la notice le cite (« Décors : … »).
Les murs intérieurs se peignent pièce par pièce (peintures, faïence) ou
pour tout le niveau : une peau de 3 mm contre les faces des murs de la
pièce, du sol au haut des murs, ouverte aux portes et fenêtres (allège et
linteau restent peints) ; elle se voit en 3D et pendant la visite, ni en
façade ni en coupe.

**Rénovation et extension** (ADR-0007 ; `src/building/etats.ts`) : un mur,
une baie portent leur état — existant conservé, existant à démolir (une
baie : à boucher ou déposer), ou à construire (le projet, sans état). Dans
le panneau du niveau, « Tout le niveau existant » passe d'un coup une maison
relevée ou importée en existant ; ensuite, dans l'inspecteur (« État »),
chaque mur ou baie à démolir ; ce qu'on trace après est le projet (une baie
neuve dans un mur existant est un percement). Le plan dessine l'existant
en gris plein, le démoli en tirets sur fond jaune pâle, une baie à boucher
barrée de tirets ; la légende des planches le dit. Le projet ignore le
démoli (pièces, 3D, façades, coupes, toiture) ; l'état existant se dérive
(les murs et baies d'avant les travaux). Surfaces : existantes, créées
(projet − existant), et la formalité indicative — déclaration préalable
jusqu'à 20 m² créés, 40 m² en zone urbaine du PLU (zone saisie à la
parcelle) sauf si le total dépasse alors 150 m², permis au-delà ; articles
« à vérifier ». Page de garde (S.P et emprise existantes / créées) et
notice le disent. Le métré ne compte que les travaux : lot Démolition (murs
à démolir), bouchements de baies, percements dans les murs existants ; ni
les murs ni les baies existants. Les fondations ne vont que sous les murs
neufs. Une baie existante est dans un mur existant ; un mur ne repasse pas
au projet avec des baies existantes ; un mur à démolir ne reçoit pas de
nouvelle baie.
Toiture : quand des murs existants ferment la maison et que d'autres sont
neufs, l'existant garde sa toiture et l'extension (le contour extérieur moins
celui de la maison) a la sienne — « Toiture de l'extension » dans le panneau
de la toiture : type (un pan contre la maison, terrasse…), pente, couverture,
côté de l'égout bas ; sans réglage, les mêmes que l'existant. Le dossier de
permis compose alors deux planches PCMI 5 : les façades de l'état existant
(la maison d'avant, ses baies, sa toiture), puis celles de l'état projeté ;
de même au PCMI 3, les coupes de l'état existant, aux mêmes traits que celles
du projet ;
la légende des matériaux dit la couverture de l'extension, le sommaire
renvoie aux deux pages. Au plan de masse, la maison existante (plus claire)
se distingue de l'extension, chacune à sa légende.
**Dossier de déclaration préalable** (onglet Dossier, « Déclaration
préalable », ou PDF → Composer ; `dossierDp`) : les mêmes planches que le
permis, numérotées d'après le bordereau de la déclaration (maison
individuelle) — situation DP1, plan de masse DP2, coupe DP3 (demandée si le
profil du terrain change), façades et toitures DP4 (existantes puis
projetées), aspect extérieur DP5 (la vue 3D gardée), insertion DP6,
photographies DP7 et DP8 ; la notice et les plans des niveaux suivent en
complément. Les colonnes, légendes et renvois disent les codes DP
(`codePiece`). Page de garde « Plan de déclaration préalable » ; si la
surface créée appelle un permis (formalité indicative), elle le signale en
rouge. Le bordereau du formulaire en vigueur reste à vérifier au dépôt.

**Modèles de maisons** (projet vide : panneau du niveau ou palette ;
`src/catalogue/modeles-maisons.ts`) : plain-pied 3 chambres (13 × 9 m),
plain-pied en L avec garage, maison à étage (9 × 8 m, R+1, escalier). Des
plans fictifs posés en une transaction (murs, baies, pièces nommées,
escalier, toiture) : tout se modifie ensuite, un « annuler » les retire.

**Export DXF** (bouton « DXF » ; `src/export/dxf.ts`) : un fichier par niveau,
DXF R12 en millimètres (le plus largement lu), dans le repère du plan, un
calque par famille : MURS et CLOISONS (ouverts au droit des baies),
OUVERTURES (tableau, vitrage ou vantail, repère « F 120×125 all. 90 »),
PIECES (nom, surface), COTES (chaînes extérieures), ESCALIERS, TREMIES,
MOBILIER, TOITURE (égout), PARCELLE, AMENAGEMENTS ; texte en Windows-1252.
Relu sans erreur par ezdxf (la bibliothèque DXF de l'atelier).

**Dossier de permis** (PDF → « Composer : le dossier de permis complet ») :
un seul PDF A3 numéroté « n / N » — page de garde sur le modèle des
dossiers du cabinet (société, maître de l'ouvrage, « Demande de permis de
construire », RE 2020 avec couverture, chauffage et divers, tableau des
dates et modifications, lieu de construction, cadastre, surface du
terrain ; à droite le tableau des surfaces pièce par pièce, S.H et S.A,
le résumé du projet — emprise, surface de plancher, surface habitable,
surface vitrée — et le sommaire des pièces), puis PCMI 2 (plan de masse), PCMI 3 (coupes), PCMI 4
(brouillon de notice, en deux colonnes équilibrées, au plus grand corps
qui tient : terrain, implantation et règles du PLU saisies,
adaptation au terrain — ±0,00, terrain fini, terrain naturel sous la
maison, soubassement —, matériaux, couverture et zinguerie, espaces
libres et arbres, accès et stationnement, réseaux tracés au plan de masse ; le
reste « [à compléter] »), PCMI 5 (façades, plan de toiture) et les plans des
niveaux, chaque cartouche portant sa pièce. Les pièces images sont fournies
par l'utilisateur, jamais inventées :
- PCMI 1 (extrait de carte : Géoportail…, et une vue aérienne facultative)
  et PCMI 7 et 8 (photographies de l'environnement proche et lointain)
  s'importent dans le panneau du niveau (« Dossier de permis : pièces
  fournies »), avec ce qu'on en dit (source et échelle, point de vue) ;
- le PCMI 1 suit la planche du cabinet (`src/export/planche-situation.ts`) :
  - à gauche, les extraits fournis ;
  - à droite, le plan cadastral du terrain, dessiné d'après le cadastre
    importé au plan de masse : nord en haut, parcelles du terrain en rouge
    cerclées de tirets bleus, parcelles voisines et leur numéro, bâti
    existant en jaune, échelle (1/500 à 1/5 000), source et réserve
    « limites non garanties » ;
  - avec le cadastre et sans extrait, la planche se compose et réclame
    l'extrait de carte en rouge ;
  - avec l'extrait seul, la page d'image d'avant ;
- le plan de division (ou parcellaire) du géomètre-expert, facultatif, s'importe
  en image ou en PDF (la page choisie) : il suit la situation, reproduit tel
  quel sur toute la feuille avec la colonne CP « Plan parcellaire — PCMI 1 »,
  une ligne dessous dit d'où il vient (cabinet, n° de dossier, date ; à
  défaut « [à compléter] ») ; rien n'y est redessiné ;
- des vues complémentaires du terrain (quatre au plus, chacune avec son point
  de vue) font une planche « Photographies — planche complémentaire »
  (PCMI 7 / 8) après les photographies : les vues en grille, titrées « VUE
  COMPLÉMENTAIRE », et dans la dernière case le repérage des prises de vue
  sur la parcelle ; le sommaire de la page de garde la cite ;
- PCMI 6 (insertion) se compose dans la 3D : « Photo du terrain… » pose la
  photographie derrière la maquette (cadrée sans déformation, sol
  transparent qui garde les ombres), la focale se règle, on tourne la vue
  jusqu'à ce que la maison s'y pose, puis « Garder pour le PCMI 6 ».
Ces images restent sur l'appareil le temps de la séance (ni enregistrées
dans le projet, ni partagées). Les **points de prise de vue** (outil I :
l'appareil, puis le point visé), eux, sont des objets du projet : chacun
porte sa pièce (PCMI 6, 7 ou 8 ; la première libre par défaut) et figure au
plan de masse seulement (cône de 50°, pièce, liste « Prises de vue ») comme
le demande le formulaire ; la page de la photographie le dit alors
« reporté ». Une pièce non fournie est listée « à
joindre » ; ce qui n'est pas connu (point de vue, échelle) s'écrit
« [à compléter] ».

Les **informations du dossier** (Dossier › Dossier de permis ›
« Informations » : maître d'ouvrage et son adresse, lieu de construction,
références cadastrales et surface du terrain — à défaut celles de la
parcelle tracée —, zone sismique, couverture, chauffage, divers,
modifications « jj/mm/aaaa — objet ») sont enregistrées avec le projet
(commande `modifierDossier`, annulable). Le **cabinet** (« Cabinet » :
société, adresse, téléphone, e-mail, SIREN, TVA, dessinateur, mention de
propriété de la page de garde, où « {société} » devient le nom de la
société ; la mention livrée ne cite aucun texte de loi) est réglé
sur l'appareil (`localStorage`, clé `cpDesigner:cabinet`), comme les
réglages de l'atelier : ces coordonnées ne vont ni dans le projet ni dans
le dépôt. Le logo est celui du site (`assets/logo.png`), mis en JPEG au
moment de l'export ; s'il ne se charge pas, le nom de la société le
remplace.

**Plan de présentation** (PDF → « Plans : plans de présentation pour le
client » ; à l'écran, « Sols en couleur » dans les réglages du niveau) :
chaque pièce à la couleur de son sol, avec son motif vu de dessus
(carreaux en grille, lames de parquet aux joints décalés, calés sur
l'origine du plan pour se suivre d'une pièce à l'autre), le mobilier, sans
chaînes de cotes ; la colonne « Sols et surfaces » dit le sol de chaque
pièce (ou « sol à choisir »). Les traits du motif sont coupés au contour
de la pièce par un calcul pur (`src/geometry/hachures.ts`).

**Interface à onglets** (`src/ui/app.ts`, icônes `src/ui/icones.ts`) : en haut,
les onglets Tracé, Ouvrant, Toit, Extérieur, Produit, Revêtement, Studio,
Indications et Dossier ; sous eux, leurs sous-onglets (Tracé : Terrain
naturel, Murs, Types de pièces, Niveaux, Transformations, Implantation…) et
un ruban de hauteur fixe avec leurs outils en tuiles. À gauche, le catalogue
de l'onglet (ouvertures, mobilier, nuancier des revêtements) ; à droite,
l'aperçu (la 3D quand on dessine, le plan quand on est en 3D : un clic ou ⇄
les permute) et le panneau de ce qui est choisi. Les raccourcis restent :
choisir un outil au clavier ouvre son onglet. Barre flottante sur le plan :
niveau, annuler / rétablir, ⇄ 3D, Affichages (cotation, sols en couleur,
grille, équerre).

**Habillage** : thème anthracite et turquoise, catalogue à gauche en
catégories (recherche, « Fermer catalogue ») dont chacune ouvre son volet
de modèles sur le plan — Ouvrant : fixe, baie vitrée (coulissante, à
galandage), porte-fenêtre, fenêtre, portes extérieure, intérieure, de
garage, ouverture, fenêtre de toit ; Produit : une catégorie par pièce ;
Revêtement : enduits, bardages, pierre, brique, sols, peintures. Le
panneau de droite porte un bandeau (ce qu'il montre) ; sans sélection,
« Éditer RDC » : informations, **plafond et sol** du niveau
(`src/catalogue/planchers.ts` : combles perdus, laine soufflée, plancher
d'étage, rampant ; béton isolé sur vide sanitaire, dallage sur
terre-plein, plancher béton ou bois — couches et épaisseurs d'usage, à
confirmer), hauteur sous plafond, hauteur du niveau, et l'écart avec le sol
du niveau du dessus. Sur le plan : murs hachurés, pièces saumon
(« S : … m² »), boussole (nord de la parcelle), en bas « Tableaux de
surfaces », zoom et « Tout voir » ; en haut à droite : aide, PDF, DXF,
recherche d'actions, plein écran, retour au suivi.

**Murs composés** (`src/catalogue/murs.ts`, `src/building/couches.ts`) : mur
extérieur, mur intérieur (J), cloison et cloison fictive (U) se tracent
chacun avec sa composition, choisie sur la carte du ruban (Mur extérieur
isolé 40 / 38 / 36, brique, béton cellulaire, ossature bois, non isolé ;
murs intérieurs parpaing ou béton ; cloisons 72/48, 98/48, carreaux de
plâtre ; ou « sur mesure »), gardée sur l'appareil. L'épaisseur du mur est
la somme de ses couches ; le plan dessine chaque couche (enduit, parpaing
hachuré, isolant ondulé, plâtre), l'enduit toujours côté extérieur, les
couches en onglet aux angles. L'inspecteur change la composition ; une
épaisseur saisie à la main rend le mur « sur mesure ». La **cloison
fictive** sépare deux pièces sans matière (une cuisine ouverte) : elle
coupe la surface au plan, mais n'existe ni en 3D, ni dans les exports, ni
pour les ouvertures ; son trait de calcul (0,5 mm) retire moins d'un
centième de m² aux surfaces. **Types de pièces** : une tuile (Cuisine,
Séjour, Chambre…) puis un clic dans un espace clos le nomme (Chambre 2,
Chambre 3… si le nom est pris) ; une pièce choisie prend le type aussitôt.

**Équerre des murs** (`src/building/equerre.ts`) : au tracé (Mur,
Cloison), la direction s'aimante à 90° dès qu'elle en est à moins de 8°
(repère des axes du plan, ou du fond calé, ou de la maison si elle est
tournée) ; une extrémité, une intersection ou un milieu visés l'emportent,
une face visée arrête le mur d'équerre dessus ; Alt : libre le temps d'un
clic, Q : équerre oui / non (réglage gardé sur l'appareil). Après coup,
« Mettre d'équerre » (panneau du niveau, d'un mur, d'un groupe, Ctrl+K)
redresse les murs presque d'équerre d'un plan repris à la main : chaque
mur presque horizontal impose une même ordonnée à ses bouts, chaque mur
presque vertical une même abscisse ; chaque coordonnée prend la moyenne
(au mm), les angles restent fermés, une cloison en T reste sur sa face,
un pan coupé reste biais, les contraintes et cotes motrices sont tenues
(ou la commande est refusée avec la raison) ; Ctrl+Z revient.

**Aimant sur le fond** (`src/import/traits-fond.ts`, `AimantFond` dans
`src/building/accrochage.ts`) : pour refaire un plan importé, les tracés
s'accrochent aux traits du fond calé — à ses angles et croisements
(losange), puis le long de ses traits (le trait attrapé est surligné).
Un PDF vectoriel donne ses vrais tracés (lus par pdf.js, matrice courante
comprise ; courbes réduites à leurs bouts, découpes ignorées) ; une image
ou un PDF scanné donne ses lignes horizontales et verticales (un trait fin :
son axe ; un mur poché : ses deux faces). Les murs déjà tracés passent
avant le fond ; avec l'équerre, un mur s'arrête d'équerre sur un trait du
fond ; Alt : tracé libre. Pour poser la face d'un mur sur la ligne du plan,
« Par : axe / face gauche / face droite » au ruban (Tab pendant le tracé).
Interrupteur au ruban Murs et dans Affichages (gardé sur l'appareil).

**Terrain en pente** (outil N ; `src/building/terrain.ts`,
`src/geometry/triangulation.ts`) : les points cotés du terrain naturel,
lus sur le plan du géomètre (un clic, l'altitude NGF), appartiennent à la
parcelle et la suivent quand on l'implante. Le terrain s'en déduit partout
par une triangulation de Delaunay (linéaire dans chaque triangle, pente du
triangle le plus proche prolongée au-dehors ; un point : plat ; des points
alignés : le long de leur ligne). Avec l'altitude NGF du ±0,00, la coupe
(PCMI 3) dessine le terrain naturel en tirets et ses altitudes (aux bouts,
au droit des façades) ; le terrain fini est supposé égal au terrain
naturel hors de la maison, et c'est écrit (déblais, remblais « [à
compléter] »). Le plan de masse reporte les points et l'étendue du terrain
naturel, le ±0,00 par rapport à lui ; la notice, le relief. Sans altitude
du ±0,00, rien n'est placé, et la coupe le dit.

**Module terrain** (onglet Extérieur : Terrain, Terrassement, Réseaux,
Équipements, Végétation ; `src/building/terrassement.ts`,
`src/import/geometre.ts`, `src/ui/dessin-terrain.ts`) — les fonctions d'un
logiciel de terrain :
- **Plan du géomètre (DXF)** : les polylignes fermées sont proposées comme
  limite (un calque « LIMITE », « PARCELLE »… d'abord, avec leur surface),
  les points cotés lus sur les points et blocs 3D, sinon sur les sommets des
  polylignes 3D, sinon sur les textes d'altitude (« 81.37 ») ; unités de
  `$INSUNITS` (mètres par défaut) ; coordonnées Lambert ramenées près de la
  maison (le décalage est dit) ; 300 points au plus. Rien n'est deviné : sans
  limite trouvée, rien n'est inventé ; l'altitude du ±0,00 se demande.
- **Relevé en texte** (CSV, TXT : « matricule ; X ; Y ; Z ; code », points-
  virgules, virgules, tabulations ou espaces, virgule décimale admise) : les
  points seuls, centrés sur la parcelle déjà tracée — calage à vérifier sur
  un point connu (le DXF garde limite et points dans le même repère).
- **Courbes de niveau** tirées du relevé triangulé, tous les 10 cm à 2 m
  (une maîtresse cotée toutes les cinq), au plan et au plan de masse.
- **Plateformes** (outil W, ou « Plateforme de la maison » : 1 m autour de
  l'emprise) : un contour, un niveau fini par rapport au ±0,00, une pente de
  talus (1/1, 3/2, 2/1, 3/1). Le talus part de chaque point du bord, vers
  l'extérieur, jusqu'à rencontrer le terrain naturel (au plus 40 m) ; il est
  dessiné en peignes (déblai brun, remblai vert) avec son pied en tirets.
- **Cubatures** : sous la plateforme, maille de 25 cm (déblai et remblai,
  terrain naturel le plus bas et le plus haut) ; talus en prismes entre
  rayons voisins. Volumes en place, sans foisonnement ni décapage : à
  confirmer par le terrassier. Le métré dit l'excédent ou l'apport.
- **Réseaux (VRD)** (outil X) : eaux usées, eaux pluviales, eau potable,
  électricité, télécom, gaz, chacun à sa couleur et son trait, avec son
  code et sa canalisation (« PVC Ø 100 ») ; longueurs au métré.
  **Équipements** (outil Y) : regard, boîte de branchement, compteur d'eau,
  coffrets, chambre télécom, puits d'infiltration, cuve EP, assainissement
  autonome.
- **Végétation** (outil Z) : arbres existants conservés, à planter, à
  abattre (barrés), avec leur couronne ; en 3D, tronc et couronne (pas
  l'arbre à abattre), cachés des façades et coupes.
- **Terrain fini** : le terrain naturel, sauf sur les plateformes (leur
  niveau) et leurs talus. **Profil en long** (outil S) : un trait A → B, et
  au panneau le profil du terrain naturel (tirets) et du terrain fini, avec
  les altitudes aux bouts, la pente moyenne et l'exagération des hauteurs
  (le trait n'est pas enregistré). **Relief en 3D** : une nappe du terrain
  fini sur la parcelle (grille d'au plus 120 mailles de côté), le sol plat
  passant sous son point le plus bas.
- **Plan de masse (PCMI 2)** : courbes, plateformes et talus, réseaux,
  équipements, arbres, et dans la colonne : terrassement (estimé), réseaux
  (légende des couleurs), plantations.

**Métré du projet** (Dossier › Métré ; `src/building/metre.ts`) — chaque
objet porte ses règles de métré, comme dans un logiciel de saisie de projet
de constructeur ; quantités seulement, **sans prix** :
- **murs** par composition : longueur à l'axe, surface nette (baies
  déduites), volume ; doublage des murs extérieurs ; cloisons en m² ;
- **ouvertures** : menuiseries par modèle et dimensions (extérieures,
  intérieures), linteaux (baie + 2 × 20 cm d'appui, à confirmer), appuis ;
- **niveau** : plancher bas ou dallage (surface de la maçonnerie) et
  plafonds, avec leur composition (« à choisir » sinon) ;
- **pièces** : sol (avec son revêtement), plinthes (portes déduites), murs
  à peindre (périmètre × hauteur sous plafond, baies déduites), plafonds ;
  une pièce humide signale sa faïence et son étanchéité « à préciser » ;
- **toiture** : couverture (surface rampante), faîtage, arêtiers, noues,
  rives (en vraie grandeur), génoise ou caisson, gouttières (longueur
  d'égout, pignons exclus), descentes posées (surface en plan desservie),
  fenêtres de toit ;
- **fondations** : fouilles, semelles filantes (ml, béton), semelles
  isolées, murs de soubassement, trappes et ventilation du vide sanitaire ;
- **poteaux et poutres**, escaliers, équipements (cuisine, salle de bains,
  WC) ; **terrain** : déblais, remblais, réseaux.
Export CSV (« ; », virgule décimale) pour le tableur ou le chiffrage.

**Poteaux et poutres** (Tracé › Poteaux et poutres ; `src/building/structure.ts`) :
un poteau (section, rotation, béton, acier ou bois) du sol au plafond du
niveau, en section pleine au plan ; une poutre (largeur, retombée sous le
plafond) en tirets au plan ; tous deux en 3D, déplaçables, métrés.
Sections à confirmer par l'étude de structure.

**Lucarnes** (Toit › Lucarnes ; `src/building/lucarnes.ts`) : jacobine
(deux pans et fronton), capucine (trois pans, croupe en façade) ou rampante
(un pan moins pentu que le toit), posée d'un clic sur un pan, au pied de sa
façade ; elle monte dans la pente jusqu'à ce que le toit rejoigne son
faîtage. Seuls les choix sont gardés (genre, point de façade, largeur,
hauteur de façade, pente, fenêtre) : jouées, noues et couverture se
déduisent du pan, la lucarne suit la toiture. Refusée hors du pan, débordant
du pan, rampante trop pentue, fenêtre trop grande. Tirée pour la déplacer,
réglée à l'inspecteur ; au plan (emprise en tirets, façade, faîtage), au
plan de toiture, en 3D, aux façades et au métré (nombre par genre,
couverture, façades et jouées, fenêtres). Le pan n'est pas percé sous la
lucarne : charpente et chevêtre restent à étudier.

**Porche et auvent** (Toit › Porche et auvent ; objet « canopy ») : un
couvert accolé à la maison (porche, auvent, préau) se trace sommet par
sommet contre les murs (ou côté par côté en tapant les longueurs). La
toiture du niveau le couvre comme les murs (contours réunis, aux façades,
aux coupes, en 3D et au plan de toiture) ; soutenu (poteaux, consoles :
réglé à l'inspecteur), il compte dans l'emprise au sol, sinon non. Au
plan : contour en tirets et nom, ligne de légende. L'atelier lit les
couverts écrits sur le plan du RDC (« Porche couvert » dans un contour en
tirets) : ils reviennent à l'import, leur soutien « à vérifier ». Les
poteaux se posent avec l'outil Poteau.

**Égout et gouttières** (Toit › Égout et gouttières ;
`src/building/eaux-pluviales.ts`) : les lignes du toit se déduisent des pans
calculés — égout (à l'altitude de l'égout), rive (pignon, haut d'un pan),
faîtage, arêtier ou noue (selon que les pans s'écartent ou se rejoignent).
On choisit la finition de l'égout (chevrons, caisson, génoise de 1 à 3
rangs), la gouttière (demi-ronde, moulurée, chéneau, ou sans) et sa matière ;
les descentes se posent d'un clic sur l'égout (accrochées ; un clic sur une
descente la retire ; refusées loin de l'égout, signalées sur une rive). Le
panneau donne les longueurs et la surface de toiture en plan par descente :
nombre et diamètre restent à dimensionner selon le DTU 60.11. Gouttières en
bleu et descentes « EP » au plan et au plan de toiture ; en 3D, gouttière
(une fois choisie : un projet qui n'en dit rien garde sa vue), descentes
(coude, chute le long du mur) et génoise en gradins.

**Fondations** (Tracé › Fondations ; `src/building/fondations.ts`) : on
choisit le soubassement — **vide sanitaire** (plancher porté) ou
**terre-plein** (dallage) — et les semelles se calculent : une semelle
filante sous chaque mur extérieur et chaque mur intérieur porteur (pas sous
les cloisons), centrée sous le corps du mur et continue sous les seuils ; une
semelle isolée sous chaque poteau. L'assise est la plus profonde du hors gel
et du bon sol (étude G2, « à préciser » tant qu'elle n'est pas lue). Les
trappes de visite du vide sanitaire se posent d'un clic (un clic sur une
trappe la retire) ; une trappe hors des pièces ou sur une semelle se
signale. Seuls les choix sont gardés (un objet `foundation`, toujours
« be_validation ») : les semelles suivent les murs. Plan de fondations à
l'écran (dans le sous-onglet) et en planche PDF A3 (Dossier › Plans) ;
quantités au métré. Les valeurs proposées (semelles 50 × 25 cm, hors gel
0,80 m, vide sanitaire 0,60 m, semelles isolées 80 × 80 × 30 cm) sont des
ordres de grandeur, à remplacer par ceux de l'étude de sol et du bureau
d'études.
**Plans d'exécution** (PDF → Composer « Les plans d'exécution du gros
œuvre ») : le plan de fondations, tous les niveaux cotés sans mobilier, la
toiture et les coupes, en un PDF. Le plan de fondations s'y lit comme un
plan de maçon : les murs à fonder seuls (ni cloisons, ni baies — la semelle
passe sous les seuils —, ni noms de pièces), coté sur les semelles
(`cotationFondations` : bords extérieurs et intérieurs, d'où largeurs et
vides, puis hors-tout) ; les **réservations** (`reservationsFondations`) y
sont repérées R1, R2… là où un réseau tracé au terrain traverse une semelle
(fourreau à prévoir au coulage), et listées au tableau avec le diamètre
saisi au réseau, sinon « Ø à préciser ».
**Plan du plombier** (PDF : « Plan du plombier », ou dans les plans
d'exécution ; `src/building/plomberie.ts`) : les attentes sanitaires se
déduisent des appareils posés au plan — WC, lavabo, vasque, douche,
baignoire, évier, lave-vaisselle, lave-linge, chauffe-eau (un sèche-linge
n'en a pas) : au dos de chaque appareil, ses réseaux (EF, EC, EU, EV) en
pastilles de couleur et son repère S1, S2… ; le tableau dit l'appareil, sa
pièce, ses attentes et le diamètre usuel de l'évacuation (Ø 100 au WC,
Ø 40 ailleurs, Ø 32 à 40 au lavabo), à confirmer par le plombier avec les
hauteurs d'attente. Déplacer un appareil déplace son attente.

**Fenêtres de toit** (outil H ; `src/building/fenetres-toit.ts`) : un
châssis posé sur un pan de la toiture du niveau qui la porte (le Designer
y passe de lui-même), d'un clic ; tailles courantes sans marque (78 × 98,
114 × 118… « ou équivalent ») ou libres. Tout se déduit du pan qui contient
le centre : pente, sens de la montée, coins dans l'espace, emprise en plan
(raccourcie par la pente) ; une fenêtre hors toiture, hors pan ou à cheval
sur un bord est refusée. En 3D (dormant et vitrage sur la couverture), en
tirets sur le plan du niveau, au plan de toiture (PCMI 5) et dans sa
colonne, sur les façades (dessinées juste après leur pan), dans la notice
(menuiseries) et au DXF (calque TOITURE).

**Plan de toiture** (option de l'export PDF, et PCMI 5 du dossier) : les
pans à leur couleur de couverture, faîtage, arêtiers et noues, une flèche
de pente par pan (degrés et %), les pignons en trait fort, les murs vus à
travers ; le tableau de la toiture (type, pente, couverture, débord, égout,
faîtage, surface de couverture).

**Surfaces réglementaires** (`src/building/surfaces.ts`, panneau du niveau
et page de garde du dossier) : les règles de l'atelier — surface de
plancher au nu intérieur des façades, moins garage, trémies et parties de
moins de 1,80 m sous la toiture ; surface habitable ; articles cités « à
vérifier ». Au-delà de 150 m² de surface de plancher, le recours à un
architecte est obligatoire : le dossier ne se produit pas (alerte dès
140 m²).
Combles aménagés, étage sous la toiture : chaque pièce ne compte que ce qui
a au moins 1,80 m (`surfacesDesPieces`, trémie déduite) — son étiquette, le
tableau de la planche et celui de la page de garde tombent ainsi juste avec
la surface habitable. Le plan du niveau (éditeur et planche) hache les
parties plus basses (`partiesBasses`), cernées de la limite des 1,80 m en
tirets ; la coupe marque la hauteur de 1,80 m sur ces parties, et
« Comble perdu » ne s'écrit qu'au-dessus du plafond ; une coupe le long du
faîtage montre le pan d'au-delà par-dessous, sans ses tuiles. Les façades
repèrent le sol fini de chaque étage (« Combles fini +2,70 »).

**Notice (brouillon PCMI 4)** (`src/export/notice.ts`) : les rubriques de la
notice écrites à partir de ce qui est mesuré ou choisi (terrain, reculs,
emprise, surfaces, toiture et hauteurs, parements, menuiseries, clôtures,
espaces verts, accès) ; le reste « [à compléter] ». À relire ; la notice
définitive se rédige dans l'atelier.

**Escaliers** (outil E ; `src/building/escalier.ts`) : droit ou quart
tournant avec palier ; on pose le départ, T tourne le sens de la montée.
Le modèle ne garde que départ, sens, largeur et forme (et un giron imposé,
au besoin) : marches et trémie se calculent depuis la hauteur à franchir
jusqu'au sol du niveau du dessus (hauteurs de 19 cm au plus, giron par
Blondel, alerte hors de 60–65 cm ; trémie au-dessus des marches sans 2 m
d'échappée). En plan : marches coupées à 1,10 m (au-dessus, en tirets),
ligne de foulée fléchée ; à l'étage, la trémie barrée et les marches qu'on
y voit ; en 3D, les marches et la trémie ouverte dans le plancher.

**Ouverture depuis le suivi de chantiers** (`src/ui/session.ts`) : onglet
« CP DESIGNER » du menu, ou pièce « Plans d'exécution » d'un chantier.
`?chantier=…` ouvre le projet du chantier ; `?prospect=…` l'avant-projet
d'un prospect. Un prospect signé devient un chantier d'un autre identifiant :
le suivi passe alors les deux (`?chantier=…&prospect=…`), et tant que le
chantier n'a pas de projet, celui du prospect s'ouvre (sur le serveur comme
sur la copie de l'appareil) — sans doublon. Sans paramètre : projet libre.

## Travailler

```
cd designer
npm install
npm test            # tests Vitest (tests/**/*.test.ts)
npm run typecheck   # TypeScript strict
npm run dev         # page locale (Vite)
npm run build       # compilation dans build/ (faite aussi au déploiement)
npm run test:navigateur   # compile, puis parcours dans Chromium (tests/e2e)
```

## Organisation

| Dossier | Rôle |
|---|---|
| `src/model/` | CP Building Model : types, identifiants, schéma, migrations, sérialisation |
| `src/geometry/` | Geometry Engine : tolérances, primitives, prédicats, booléens, aires, accrochage, contraintes |
| `src/building/` | Murs (jonctions), pièces (détection), ouvertures, cotes, niveaux — Phase 1 |
| `src/engine/` | Commandes, historique, ChangeSets, dépendances — Phase 1 |
| `src/persistence/` | Supabase (tables dédiées), copie locale, export — Phase 1 |
| `src/ui/` | Canvas, outils, inspecteur — Phase 1 |
| `tests/` | `unit/`, `property/`, `metier/` (Vitest), `e2e/` (Chromium) |

## Ce que la Phase 1 doit prouver (tests automatisés)

| # | Critère | État | Où c'est vérifié |
|---|---|---|---|
| 1 | Rectangle 10 × 8 m → 80,00 m² ; murs de 20 cm à l'axe → pièce de 76,44 m² | ✅ | `unit/polygon`, `metier/plan` |
| 2 | Une cloison coupe une pièce en deux (± 0,01 m²) ; la déplacer recalcule les deux pièces, nom et usage conservés | ✅ | `metier/plan` (30,03 + 45,63 → 37,83 + 37,83 m²) |
| 3 | Une ouverture suit son mur et ne peut pas le dépasser ; 2,40 → 3,50 m mis à jour dans le plan et le métré | ✅ | `metier/plan`, `unit/modele-commandes`, `unit/interface` |
| 4 | Une cote motrice modifiée déplace réellement le mur | ✅ | `metier/edition` (10 → 12 m, 92,04 m²) |
| 5 | Accrochage (extrémité, milieu, intersection, axe, face, perpendiculaire, grille ; Alt le coupe) en moins de 5 ms pour 2 000 objets | ✅ | `metier/edition` (≈ 9 µs par recherche) |
| 6 | Contraintes (horizontal, vertical, parallèle, perpendiculaire, longueur, angle) respectées après déplacement | ✅ | `metier/edition`, `property/contraintes` (300 suites) |
| 7 | Plusieurs niveaux (altitude, hauteur) ; fond PDF ou image calé, verrouillé | ✅ | `metier/edition`, `e2e/parcours` (Chromium) |
| 8 | Annuler / rétablir sur 100 pas, octet pour octet ; une action composée s'annule en une fois | ✅ | `unit/modele-commandes`, `property/commandes` |
| 9 | Enregistrer puis recharger : identique ; écriture concurrente refusée, jamais écrasée ; reprise après plantage ; migration de schéma | ✅ en test — ⚠️ à confirmer sur le serveur réel une fois `schema.sql` exécuté | `unit/persistance`, `unit/interface`, `fixtures/projet_v1.json` |
| 10 | Statut et provenance sur chaque objet ; « porteur » jamais confirmé sans document | ✅ | `unit/modele-commandes`, inspecteur |
| 11 | Non-régression : les suites du CRM passent ; le CRM fonctionne sans le Designer ; rien du Designer dans `app_data` | ✅ | CI `tests.yml`, `tests/t_designer_lien.js` |

Un vrai RDC (dossier client, gardé hors dépôt) a été importé et contrôlé :
14 murs, 11 ouvertures, 6 pièces aux surfaces de l'atelier au centième ;
un poteau et une baie qui dépassait de sa cloison signalés « à reprendre ».
Reste pour clore la Phase 1 : la prise en main par l'équipe sur ce plan, et
l'enregistrement partagé vérifié sur le serveur après exécution de
`supabase/designer/schema.sql` (tables, et espace privé « designer-fonds »
pour les fonds de plan). Le script se relance sans risque : la première
version rangeait les identifiants des projets en `uuid`, alors que le
Designer crée des ULID ; relancé, il passe ces colonnes en texte sans rien
effacer.
