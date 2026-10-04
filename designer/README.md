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
est signalé, jamais inventé. Essai sur un vrai RDC (hors dépôt) : 6 pièces
sur 6 à l'identique, au centième de m².

**Tracé rapide et cotation automatique** (pour se rapprocher des logiciels
de plans de maisons) :
- pendant un tracé, la longueur se tape : `4,50` puis Entrée (dans la
  direction visée), `4,50<90` (avec un angle), `450cm` ;
- outil **Rectangle de murs** (R) : deux angles, ou `10x8` tapé ; cotes
  hors tout (les murs poussent vers l'intérieur) ou intérieures ;
- **cotation automatique** autour du plan (`src/building/cotation.ts`) :
  chaînes des ouvertures, des décrochés et hors tout, de chaque côté ;
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
modification (annuler compris) s'y voit aussitôt.

**Toiture** (`src/building/toiture.ts`, panneau du niveau ou de la 3D) : le
modèle ne garde que les choix (type, pente, débord, couverture) ; pans,
faîtages et pignons se calculent depuis le contour des murs et le suivent.
À croupes sur tout plan à angles droits (méthode de l'atelier, mêmes
surfaces sur les mêmes plans), deux pans à pignons (sur un rectangle ; sur
un plan en L, T, U, chaque bout d'aile devient un pignon et les noues se
forment dans les angles rentrants), un pan sur un plan rectangulaire,
toit-terrasse avec acrotère. Le toit passe par le haut des
murs au nu extérieur ; égout, faîtage et surface de couverture sont
annoncés (indicatifs : la charpente n'est pas étudiée). Un plan qui ne
convient pas est refusé avec sa raison. En plan : égout en tirets, lignes
des pans en pointillé.

**Mobilier** (outil B ; `src/catalogue/mobilier.ts`, `src/building/mobilier.ts`) :
une quarantaine de meubles et équipements courants (séjour, chambre,
cuisine, salle de bains, WC et buanderie, aire de rotation Ø 1,50 m), sans
marque ni prix. Approché d'un mur, un meuble s'y plaque dos contre la face
et se tourne vers la pièce ; près d'un angle, il glisse jusqu'au mur
voisin (Alt : pose libre ; T : quart de tour). On le tire pour le déplacer,
l'inspecteur règle ses cotes et son orientation, « Dupliquer » en pose un
autre. Même description pour le plan (symbole) et la 3D (volumes). Le
mobilier ne change ni les murs ni les surfaces.

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
débord de toit, mobilier au choix, tableau des surfaces, cartouche CP
Constructions (projet, plan, échelle, phase, date, indice), échelle
graphique. Le PDF est écrit sans bibliothèque et en vectoriel : le plan y
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
intégrée au PDF ; le PCMI 6 (insertion dans le site) reste à joindre. Le terrain
lu par l'atelier (limite, côtés sur voie, nom de la voie, implantation)
revient avec l'import du RDC.

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
Les murs intérieurs se peignent pièce par pièce (peintures, faïence) ou
pour tout le niveau : une peau de 3 mm contre les faces des murs de la
pièce, du sol au haut des murs, ouverte aux portes et fenêtres (allège et
linteau restent peints) ; elle se voit en 3D et pendant la visite, ni en
façade ni en coupe.

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
un seul PDF A3 numéroté « n / N » — page de garde (projet, maître
d'ouvrage, adresse, référence cadastrale, surface du terrain, emprise) et
sommaire des pièces, puis PCMI 2 (plan de masse), PCMI 3 (coupes), PCMI 4
(brouillon de notice), PCMI 5 (façades, plan de toiture) et les plans des
niveaux, chaque cartouche portant sa pièce. Ce que le Designer ne produit
pas (PCMI 1, 6, 7-8) est listé « à joindre » ; ce qui n'est pas connu
s'écrit « [à compléter] ».

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
