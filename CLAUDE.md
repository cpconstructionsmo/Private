# CP Constructions — guide pour les sessions Claude

Ce fichier est lu au démarrage de chaque session Claude Code sur ce dépôt.
Il résume les règles établies avec CP Constructions : respectez-les sans
qu'on ait à les redire.

## L'application

- **Suivi de chantiers de CP Constructions** (maîtrise d'œuvre) : prospects,
  chantiers, marchés, facturation, MAP, programme technique, etc.
- **Un seul fichier** : `index.html` (React 18 + Babel standalone, sans étape
  de compilation). Photos et fiches produits dans `assets/`.
- **Données** : Supabase, table `app_data`, ligne `main`, en jsonb, lue et
  écrite par `save(data)`. Les documents vont sur Google Drive.
- **Choix du client en ligne** : `client.html` (page du client, lien
  personnel `#t=<jeton>`) et la fonction `supabase/functions/configurateur`
  (tables séparées `config_espaces` / `config_paniers`, jamais `app_data`).
  Le calcul du panier est dans `calcul.js`, copié à l'identique dans
  `index.html` (`configCalculer`) : `t_configurateur.js` le vérifie.
  Installation : `supabase/functions/configurateur/README.md`.
- **Validation du plan électrique en ligne** : `plan.html` (lien
  `#t=<jeton>` : voir, commenter, valider l'indice ; jamais modifier) et la
  fonction `supabase/functions/plan-validation` (tables `plan_publications`,
  `plan_remarques`, `plan_validations`). Installation : son `README.md`.
- **Relevé de visite** : `releve/` (page à part, iPhone d'abord, PWA hors
  ligne ; mode d'emploi : `releve/README.md`). Visite = photo de garde,
  client, projet, pièces et photos, scan OpenPlan 3D ouvert dans le moteur
  de relevé (`releve/moteur/`, plan, mesures, avant/après, 3D, PDF, DXF ;
  plusieurs scans reliés pièce par pièce : `assemblage.js`, « ＋ Scan »,
  « 🔗 Relier », tests `t_releve_assemblage.js`). Tout
  s'écrit d'abord sur l'appareil (IndexedDB) puis dans la table
  `releve_visites` (version, fusion champ par champ : `releve/modele.js`) ;
  visite annulée depuis l'accueil (`statut` « annulee », récupérable, exclue
  des visites à rattacher) ; visionneuse plein écran (`releve/zoom.js`) ;
  nature du projet dès la 1re page (`projet.nature` : rénovation, construction
  neuve, agrandissement ; parcours `etapesDe`) ; étape Terrain
  (`releve/terrain.js` : géocodage Géoplateforme ou GPS, cadastre et
  urbanisme API Carto IGN, Géorisques ; points d'attention indicatifs, à
  vérifier ; tests `t_releve_terrain.js`, `releve_construction_navigateur.js`) ;
  budget construction / agrandissement (`ouvragesDe`, `ouvragesSuggeresNeuf`,
  prix « à confirmer ») ; le suivi crée un prospect « Maison neuve » prérempli
  (`visiteChampsNeuf`, `visiteLignesNeuf`) ; page « Le terrain » du dossier
  client (option `terrain`) ; plan du terrain coté lu par l'IA et analysé
  (`terrain.plan`, `analyserPlanTerrain`) ; « Imaginer la maison sur ce
  terrain » (mode `terrain`) ; étape « Plan » en construction ;
  règles de la zone lues dans le règlement PLU (action `reglement` : PDF de
  la Géoplateforme seulement, `terrain.reglement`, lecture à vérifier) ;
  client particulier (1 à 3 acheteurs, `acheteur2.*`, `acheteur3.*`,
  domicile de chacun) ou société (`societe.*`), usage du bien, ampleur
  (`projet.categories`), situation et souhaits dictés (🎤, Web Speech,
  repli sur le micro du clavier), légende par photo et note par pièce ;
  photos dans l'espace privé `releves`. Jamais dans `app_data`, et le relevé
  n'écrit jamais dans `app_data` (il la lit seulement pour « Nouvelle
  visite » d'une fiche prospect). Le suivi rattache les visites aux
  prospects sans doublon (PROSPECTS › « Visites à rattacher »,
  `prospectsCandidats`, `completerProspectDepuisVisite` : cases vides
  seulement) et ne garde que le lien `p.visites` ; « Sans suite » crée le
  prospect déjà archivé (`archive.motif:'sans_suite'`,
  `prospectSansSuiteDepuisVisite`), « 🗑 Supprimer » l'écarte
  (`data.visitesIgnorees`, remise d'un clic sous « Visites écartées »). Budget de premier
  rendez-vous (`releve/budget.js`, étape « Budget ») : travaux en tuiles,
  surface globale tirée du plan ou réglée par − / +, gamme éco / standard /
  haut de gamme, prix au m² mini / médian / maxi (`OUVRAGES`, repères
  publics 2026 à remplacer par les ratios de CP : « ⚙ Prix au m² », table
  `releve_reglages` ligne « ouvrages ») ; le poste par poste (fourchettes,
  ligne « fourchettes », livrée sans prix) reste sous « Approfondir ».
  « ✨ Imaginer » (photo de pièce → pièce rénovée) passe par la fonction
  `supabase/functions/imaginer` (Gemini, clé `GEMINI_API_KEY` dans les
  secrets Supabase, utilisateur connecté, limite par jour) ; sans réseau, la
  demande attend sur la photo (`imaginerEnAttente`, appareil d'origine seul)
  et part au retour du réseau ; styles en un toucher, « ✏️ Retoucher » une
  image imaginée (mode `retouche`), « ✨ Plan en couleur » (mode `planRendu`,
  photo `planRendu`, option du dossier client). « 🔍 Décrire » (action `decrire`) : légende si vide et
  constats internes (`description`) d'une photo ; « 📷 Lire une note
  manuscrite » ajoute la transcription à la dictée de l'assistant. « 🖼 Plan 2D » (mode
  `plan`, image ou PDF, aussi glissé sur le plan) : pièces lues → dessin
  rapide à vérifier (`dessinDepuisRectangles` ; lecture enrichie
  `dessinDepuisLecture` : ouvertures, équipements, hauteur, notes et projet
  en rouge par pièce, « ＋ Tout importer », mezzanine sur son étage, doutes
  « À vérifier », modèle « pro » `modelesPlan` ; petite pièce dans une grande
  contre son mur : découpe `contourDecoupe`, pas un chevauchement), plan d'origine gardé
  (photo `planPapier`), plusieurs esquisses d'un coup ajoutées au dessin.
  Plan annoté (travaux) : copie du plan annotée au doigt (`annotations.js`,
  champ `annotations`, photos `fondAnnote` et `planAnnote`), en option dans
  le dossier client (`planAnnote`, décochée d'office) ; écran avant / après
  (plan actuel à gauche, copie annotée à droite, onglets sur iPhone), ouvert
  aussi depuis le dessin rapide (`avantApresDessin`) et le plan coté
  (`avantApresPlan`, message `releve:image`). Dossier client
  (`releve/dossier.js`, « 📄 Dossier client », lien du suivi
  `releveLien({visite,vue:'dossier'})`) : imprimable en PDF A4, jamais les
  notes de visite ni la marge ; image du plan dessiné (`planImage`) et de
  la vue 3D (`plan3dImage`, option `vue3d` cochée d'office) ;
  envoyé au client par un lien de 30 jours (`partage.html#t=<jeton>`, table
  `releve_partages`, empreinte seule, action `partage` de la fonction
  `imaginer`, mise en page partagée `dossier-vue.js`). Assistant de visite
  (`releve/assistant.js`, action `structurer`) : dictée libre → fiche
  proposée, vérifiée champ par champ, jamais d'écrasement sans case
  cochée. Dessin rapide sans scan (`releve/dessin.js`, pièces rectangulaires
  posées au doigt → relevé du moteur, murs communs partagés ; glissées et
  aimantées `libre`, étages, ouvertures `ouverturesMoteur`, symboles et trémie
  `symbolesMoteur` — chauffage, sanitaire, cuisine, électricité et VMC,
  mobilier, par famille `FAMILLES_SYMBOLE` — dessinés par le moteur `dessinerSymboles`, en volumes
  dans la vue 3D, trémie percée et escalier en marches ; « ＋ Symbole » les
  pose aussi dans le plan coté, même scanné, `releve.symboles`, toiture). Prix au m² appris des prospects de rénovation
  (`ratiosDepuisProspects`). L'estimation part avec la visite
  et s'affiche sur la fiche prospect (`visiteResume().fourchette`). Chiffrage
  précis : dans le quantitatif d'un poste de la fiche prospect (seulement là,
  `Quantitatif` prop `plan`), une ligne prend sa quantité dans le plan de la
  visite (`l.regle` : grandeur et pièces, `qtePlan`, `planDuProspect` ; aussi
  plinthes, portes déduites, et plafond ; les équipements posés sur le plan, grandeur `eq:<type>`, `EQUIPEMENTS_PLAN`,
  comptés par le moteur `nomenclatureSymboles` → `resume.detail[].equip`) ;
  « Mettre à jour depuis le plan » ne touche que ces lignes ; une quantité
  tapée retire la règle. Chiffrage interne en Excel (carte « Chiffrage
  interne », `chiffrageInterneLignes`, `genererChiffrageInterneXlsx` :
  postes, lignes du quantitatif, TVA, rétrocession, marge — usage interne).
  Dossier de présentation : le coût prévisionnel des travaux est le coût
  TTC des entreprises, **sans la marge** (`prospectCoutTTC`) — les
  honoraires (la marge) sont annoncés à part au point 2 ; « Détailler le
  coût par corps d'état » (`p.dossierDetailPostes`, `detailPostesClient` :
  chaque poste à son coût TTC, somme = coût prévisionnel annoncé), non
  coché par défaut. Tests :
  `t_chiffrage_xlsx.js`. Installation :
  `supabase/releve/schema.sql`. Tests : `t_releve_*.js`,
  `releve*_navigateur.js` (scan fictif `tests/releve_scan_fictif.js`).
  Chiffrage précis par lots (Budget › « Chiffrage précis », interne, `releve/chiffrage.js`) : catalogue et prix dans la ligne `chiffrage` de `releve_reglages`, JAMAIS dans le dépôt public (fixtures fictives seulement) ; marge jamais dans le dossier client.
- **Plan électrique** : le DQE (quantitatif du marché « Électricité », ou un
  fichier) est la jauge du plan — `elecLireDQE`, `elecControle`. Aucune
  règle réglementaire n'est inscrite dans le code : elles se saisissent
  (norme, version, source, date de vérification) dans la bibliothèque CP.
  « ✨ Générer automatiquement » (`elecGenererPlan`) pose tout le programme
  sur les pièces tracées ; il ne retire jamais un équipement posé à la main,
  retouché (`userModified`) ou verrouillé. Tests : `t_elec_generateur.js`.
  Niveaux : `plan_elec.plan` est le niveau principal (RDC), les autres sont
  dans `plan_elec.niveaux` (chacun son fond et son repère, jamais mêlés) ;
  `elecPlanMaison` rassemble la maison pour le quantitatif et le contrôle.
  Modèles de disposition CP : `elecBiblio.dispositions`, repère « porte en
  bas ». Tests : `t_elec_niveaux.js`.
- **Budget et avenants** (fiche chantier, `BudgetAvenants`) : `budgetClientTTC`
  est le contrat initial, la référence ; il ne bouge plus. Les avenants
  client (`ch.avenantsClient`, AV-001…) l'actualisent une fois validés
  (`budgetActualise`, `bilanBudget`, calculs en centimes). Le total engagé
  ne suit que marchés, commandes et honoraires : une prestation n'y entre
  qu'une fois reportée dans son marché (`reporterAvenantMarches`). La
  ventilation du contrat se reprend des marchés, commandes et honoraires
  (`contratDepuisEngagements`, avenants reportés retirés), sauf saisie à
  la main (`contratInitial.mode==='manuel'`). L'avenant à faire signer au
  client est un Word (`avenantClientDonnees`, `genererAvenantClientDocx`),
  déposé dans le dossier « Avenants » du Drive. Honoraires d'un nouvel
  avenant : 10 % du HT des artisans, TVA 20 % (`AV_HONO_PCT`,
  `AV_HONO_TVA`). La maîtrise d'œuvre facture toujours à 20 % de TVA
  (`HONO_TVA_DEFAUT`), même quand les travaux sont à 10 % : sans taux saisi,
  honoraires, factures d'honoraires et avenants prennent 20 % ; un autre
  taux saisi est gardé mais signalé, avec un bouton pour repasser à 20 %. Un avenant, même validé, se supprime
  (`supprimerAvenantClient` défait ses reports ; son numéro ne resert
  pas). Le formulaire d'un lot resté ouvert pendant un report ne l'efface
  plus : « Enregistrer » ne réécrit que la saisie, ce qui a changé ailleurs
  suit (`lotRebaser`), un montant touché des deux côtés est signalé. Une
  ligne reportée que son marché ne porte plus (`avReportsPerdus`, jamais un
  avenant venu d'un lot) se signale « report à refaire » et se rétablit
  après aperçu (`retablirReportsAvenant`). Tests :
  `t_budget_avenants.js`, `budget_avenants_navigateur.js`,
  `t_avenant_report_perdu.js`.
- **Rénovation** (`typeTravaux` du chantier : `neuf` ou `renovation`,
  repris à défaut de la catégorie « Rénovation » du prospect — `estReno`) :
  badge « RÉNOVATION » et liseré violet (`BadgeReno`, `RENO_COULEUR`) dans
  la liste des chantiers, la fiche et CP Designer ; choix du type dans les
  formulaires du chantier ; un prospect de rénovation devient un chantier
  de rénovation. Pièces : une pièce `pour:'renovation'` ou `pour:'neuf'`
  ne se montre qu'à ce type (`docsDuChantier`, `docVisible`), toujours si
  elle est déjà cochée ou déposée — relevé de l'existant, repérages avant
  travaux, déclaration préalable, DQE pour la rénovation ; RE2020, étude de
  sol, fermettes pour le neuf ; pièces attendues par phase
  `DOCS_PHASE_RENO`. Tests : `t_renovation.js`, `renovation_navigateur.js`.
- **Contrat de maîtrise d'œuvre** (`SortirContratMoe`, `genererContratMoeDocx`) :
  texte juridique repris du modèle CP (orthographe corrigée à la demande de
  CP, novembre 2026, sans rien changer au sens) ; seuls les champs
  connus sont remplis (client, adresse, surfaces, budget, honoraires). Il
  se sort de la fiche prospect chiffrée, et aussi du chantier signé
  (PIÈCES › Contrat de maîtrise d'œuvre, `ContratMoeChantier`, rangé dans
  ses pièces). Type d'ouvrage choisi sur la carte, sinon repris du
  programme technique (`contratTypeOuvrage`) : pour un ERP, seules les
  lignes descriptives changent (« Bâtiment à usage de bureaux — ERP de 5e
  catégorie », `CONTRAT_ERP_DESIGNATION`), jamais les articles — le
  contrat est à faire relire. Coût des travaux de l'article 6 : un forfait
  TTC saisi sur la carte (`p.contratTravauxTTC`, `contratTravaux`)
  l'emporte sur le chiffrage par poste, HT déduit au taux du dossier ; les
  honoraires ne changent pas. Type « Rénovation » (`contratTypes`, d'office
  pour un prospect ou un chantier de rénovation) : là où le modèle suppose
  une construction neuve (terrain, permis, étude de sol, RE2020,
  maçonnerie, hors d'eau), les articles changent, un « Article 4 ter —
  Travaux sur existant » s'ajoute, l'échéancier suit `HONO_ECHEANCIER_RENO` ;
  le reste du modèle est repris tel quel, à faire relire. TVA mixte : le HT
  des travaux se saisit à côté du TTC (`p.contratTravauxHT`) ; en
  rénovation, l'article 6 ne cite jamais un taux unique (« TVA à taux
  variable selon la nature des prestations ») et n'écrit le HT que s'il a
  été saisi. Les honoraires du contrat sont toujours à 20 %
  (`HONO_TVA_DEFAUT`). Dommages-ouvrage : coût estimé saisi sur la carte
  (`p.contratDoCout`, à défaut `p.dommageOuvrage` du chiffrage) ; en
  rénovation, « aucune démolition de mur porteur ni gros œuvre »
  (`p.contratDoSansStructure`) fait dire au contrat qu'elle peut ne pas
  être exigée, la mention de renonciation restant au contrat. Aléas et
  imprévus compris dans le budget travaux : un pourcentage saisi sur la
  carte (`p.contratAleasPct`, `contratAleas` : part = budget × % / (100 + %))
  que l'article 6 détaille sans changer le budget (TTC seul si le HT d'une
  rénovation n'est pas saisi) ; tests : `t_contrat_aleas.js`. Un
  chantier créé sans prospect sort aussi son contrat
  (`contratPourChantier`, réglages gardés dans `ch.contratMoe`). Tests :
  `t_contrat_moe.js`, `t_contrat_moe_erp.js`, `t_renovation.js`.
- **TVA par poste** (chiffrage d'un prospect) : chaque poste ou option peut
  porter son taux (`x.tva` : 20, 10 ou 5,5 ; vide = celui du projet `p.tva`).
  Sans taux par poste, le prix est exactement celui d'avant. Sinon la marge
  se répartit au prorata du coût (`prospectVentilationTva`), le prix TTC est
  la somme par taux (`prospectPrixTTC`), le coût TTC aussi
  (`prospectCoutTTC`) ; `prospectTauxUnique` vaut null en TVA mixte, et le
  contrat (`contratTravaux().tvaMixte`), le chiffrage interne et le
  récapitulatif disent « TVA mixte » avec le détail, jamais un taux unique.
  Les honoraires de maîtrise d'œuvre restent à 20 %. Tests :
  `t_tva_poste.js`, `tva_poste_navigateur.js`.
- **Marché de travaux** (Marchés › lot › « Rédiger le marché ») : il sort
  en trois exemplaires Word (`MARCHE_EXEMPLAIRES` : client, entreprise,
  CP Constructions), marqués en tête de page. Celui du client annexe
  l'attestation décennale de l'entreprise, reprise du Drive
  (`attestationPourMarche` ; un PDF est rendu page à page par pdf.js, 4 pages
  au plus). Sans attestation lisible, les trois sortent quand même et
  l'écran dit pourquoi. Le lien du lot (`contratLien`) est l'exemplaire
  CP Constructions ; `exemplaires` garde les trois. Les trois sortent aussi
  en un seul fichier à imprimer d'un coup (`genererMarcheImpressionDocx`,
  PDF tiré par le Drive, à défaut le Word d'ensemble ;
  `exemplaires.impression`, « 🖨 Imprimer les 3 exemplaires ») ; un marché
  sorti avant se prépare d'un clic (`preparerImpression`). Sans
  attestation, la raison se garde (`exemplaires.attestationRaison`, sinon
  « Pourquoi ? ») et l'attestation se redépose sur place
  (`AttestationMarche` : vérifiée avant l'envoi, lien de la fiche
  remplacé), puis « Ressortir le marché ». Tests :
  `t_marche_exemplaires.js`, `t_marche_impression.js`. Le marché revenu signé se dépose dans la
  section « Marché signé par l'entreprise » de la fiche du lot (aussi
  depuis la liste des lots et le tableau de bord) : chaque fichier part
  sur le Drive › Marché travaux signé, renommé d'après le lot
  (`nomMarcheSigne`), et s'ajoute à `m.signes` (`ajouterMarcheSigne`) ;
  le lot passe « signé », `contratLien` devient le dernier signé et le
  contrat remplacé se garde (`contratRedige`). Tests : `t_marche_signe.js`.
  Il se renvoie à l'artisan par mail (« Envoyer le marché signé ») : les
  fichiers signés repris du Drive tels quels, avec les plans d'exécution
  cochés d'office (`PIECES_MAIL_SIGNE`) ; la date est gardée
  (`mailSigneLe`). Tests : `t_marche_signe_mail.js`.
- **Chiffrage perdu d'un lot** (fiche du lot › « CHIFFRAGE PERDU ? »,
  `LotVersionsSauvegardees`) : les états passés de ce lot, lus dans les
  versions de l'appareil (IndexedDB, 14 jours) puis, à la demande, dans les
  sauvegardes du Drive (`sauvegardesDrive`, 30 jours), sans doublon ni
  l'état actuel (`lotVersions`, `lotEmpreinte`). « Reprendre ce chiffrage »
  (`reprendreChiffrageLot`) ne ramène que le chiffrage
  (`LOT_CHAMPS_CHIFFRAGE`) et le marché rédigé si le lot n'en porte plus,
  dans le formulaire : rien n'est enregistré avant « Enregistrer » ; jamais
  « Restaurer » toutes les données pour un lot. « Retirer » le quantitatif
  demande confirmation dès qu'une quantité est saisie. Tests :
  `t_lot_versions.js`, `lot_versions_navigateur.js`.
- **PV de réception** (Marchés › lot › « PV DE RÉCEPTION », `PvReception`) :
  le modèle CP d'une page (`pvReceptionDocumentXml`,
  `genererPvReceptionDocx`), rempli d'office (`pvDonnees` : maître
  d'ouvrage avec civilité et second maître d'ouvrage du prospect, adresse
  du chantier, entreprise, date et TTC du marché, avenants signés ou
  rédigés), complété à la visite (achèvement, présence, décision,
  réserves, fait à / le). Rangé sur le chantier (`ch.pvs[marcheId]`,
  enregistré à chaque saisie, pas à l'Enregistrer du lot). Signatures
  (`pvSignataires`) : tracée à l'écran (stockage photos, empreinte), ou
  celle fournie par l'entreprise (`artisan.visa`, fiche artisan, aussi
  depuis le PV) seulement quand son accord pour ce PV est noté
  (`pv.accordEntreprise`) ; le cachet accompagne une signature distincte.
  Un fichier unique (cachet et signature ensemble, déposé dans « Cachet »,
  « Signature » vide) s'appose seul, en plus grand, et ne s'ajoute pas à
  une signature tracée à l'écran. Visa de CP Constructions (`data.cpVisa`, déposé depuis un PV) :
  apposé d'office dès que sa signature est enregistrée, décochable sur un
  PV (`pv.visaCp===false`). Après production, l'écran dit ce que porte
  le PV, colonne par colonne. Le Word part sur
  le Drive › PV de réception et s'ajoute à la pièce « PV de réception » du
  chantier (sans la cocher) ; une image illisible est nommée, le PV sort
  quand même. La levée des réserves se note sur le PV (`pv.leveeLe`,
  « Toutes les réserves levées le ») : reprise sur la ligne « Levée des
  réserves » du PV et par l'attestation de fin de mission. Une réserve
  notée par le client « pour information » (`r.info` : rien à lever, par
  exemple un défaut sous la cuisine posée) n'a pas de date de levée ; le
  PV le dit (« Levée des réserves : sans objet » si elles le sont toutes)
  et l'attestation ne l'attend pas. Le PV revenu signé se glisse sur le PV
  du lot (« Déposer le PV signé », `pv.signes`, `pvNomSigne`) : Drive › PV
  de réception, renommé d'après le lot, ajouté à la pièce « PV de
  réception » (donc au dossier de l'assureur), retirable. Tests :
  `t_pv_reception.js`, `t_pv_signe_reserves.js`.
- **Attestation de fin de mission** (PIÈCES › Achèvement, pièce
  `fin_mission`, `FinMissionChantier`) : la mission de maîtrise d'œuvre ne
  se réceptionne pas (la réception porte sur les travaux, lot par lot) ; le
  client signe en fin de mission une attestation au style du PV
  (`finMissionDonnees`, `genererFinMissionDocx`) : lots signés et leur PV
  (reçu le, décision, réserves et levée), documents remis cochés un par
  un (`FIN_MISSION_DOCS`, rien d'office, « autres » en texte libre ; DOE
  et notices d'entretien retirés à la demande de CP — `retire`, encore
  montrés s'ils étaient cochés), un PV produit ou déposé signé sans
  décision cochée y est « décision à noter »,
  honoraires facturés et solde (rien d'inventé s'ils manquent). Elle dit
  ce qui reste à faire avant signature sans bloquer, et qu'elle ne réduit
  aucune garantie (`FIN_MISSION_TEXTE`, à faire relire). Visa de CP
  d'office, client à l'écran ou à la main (`finMissionSignataires`) ;
  rangée sur le chantier (`ch.finMission`, à chaque saisie), Word dans
  Drive › Pièces, ajouté à la pièce sans la cocher. Tests :
  `t_fin_mission.js`, `fin_mission_navigateur.js`.
- **Factures d'achat de matériaux** (Marchés › Achats de matériaux) : une
  facture déposée se transmet au client depuis son volet (« Envoyer au
  client », `EnvoyerFactureAchat`) : aperçu à relire, facture reprise du
  Drive avec sa vraie extension ; la date se garde sur la facture
  (`envoyeeClientLe`). Les factures des marchés, elles, se visent
  (`ViserFacture`). Tests : `t_facture_achat_client.js`.
- **Devis d'un fournisseur repris dans une commande** (MATÉRIAUX ›
  commande › « Importer le devis ») : un devis PDF se lit
  (`analyseDevisFournisseur` : prix facturé = total ÷ quantité,
  éco-contribution comprise, `prixFactureDevis` ; repère « C.1 » ;
  désignation qui finit sur la ligne du dessous). Aperçu (`DevisCommande`) :
  les lignes, le total, le bordereau où enregistrer les produits (celui du
  quantitatif, sinon celui du fournisseur, sinon un nouveau :
  `devisBordereauPropose`), ce qui change. Au clic (`devisVersCommande`) :
  produits ajoutés au bordereau ou prix rafraîchi (même libellé), le
  quantitatif repart de ce bordereau aux quantités du devis (même libellé
  = même produit : `devisRegroupe`), les autres articles à zéro, le
  montant suit ; la commande reste à enregistrer. Tests :
  `t_devis_commande.js`, `t_devis_fournisseur.js`.
- **Facture répartie sur plusieurs lots** (une entreprise qui facture
  charpente et couverture ensemble) : rangée sur un lot pour son total,
  puis « Répartir sur plusieurs lots » depuis son volet
  (`RepartitionFacture`, `repartirFacture`, `defaireRepartition`). Une
  seule facture (même numéro, date, fichier), une part par lot, reconnue
  par `repartition.id` ; total HT et TTC lu gardés avec les parts. La
  visa et l'envoi au client disent le total et les lots
  (`repartitionPourMail`). La même facture saisie à part sur deux lots
  (même numéro, même date : `facturesJumelles`) se relie en un clic
  (`relierFactures`) ; le fichier déposé sur une part vaut pour toutes
  (`poserLienFacture`). Sans fichier, le volet dit que la visa l'attend.
  Tests : `t_facture_repartie.js`.
- **Avoir d'une entreprise** (remise commerciale, prestation non
  réalisée) : saisi en facture négative, il baisse le facturé, pas le
  marché. Sous « reste à facturer », un avoir non déduit le dit ; son
  volet (`AvoirMarche`) montre le marché avant et après, puis « Déduire
  l'avoir du marché » (`deduireAvoirMarche`, centimes) baisse le HT : le
  lot se solde, le total engagé suit. Trace `m.avoirsDeduits` (une fois
  par avoir), reprise si l'avoir est corrigé (`reprendreDeductionAvoir`),
  annulation possible même avoir supprimé (`annulerDeductionAvoir`). Le
  contrat initial (`contratDepuisEngagements`) et le PV de réception
  gardent le marché signé (`marcheAvoirsHT` rajouté). Une prestation
  retirée à la demande du client passe plutôt par un avenant client en
  moins-value. Tests : `t_avoir_solde.js`.
- **Glisser-déposer** (`ZoneDepot`) : une facture se glisse sur sa zone
  (volet de la facture : « Importer la facture », « Remplacer »), plusieurs
  sur « Lire des factures », et tout fichier sur la carte de sa pièce
  (PIÈCES). Un fichier lâché à côté d'une zone n'ouvre rien (le navigateur
  aurait remplacé l'application). Tests : `t_dossier_assureur.js`,
  `dossier_assureur_navigateur.js`.
- **Dossier de fin de chantier pour l'assureur** (PIÈCES › Achèvement,
  pièce `dossier_assureur`, `DossierAssureur`) : toutes les factures
  (entreprises, achats, maîtrise d'œuvre ; une facture répartie une seule
  fois), les fichiers des pièces « PV de réception » et « DAACT », par
  famille cochée (`dossierAssureurDonnees`). Ce qui manque est dit sans
  bloquer (facture sans fichier, lot sans PV, DAACT, lot non soldé). Le
  ZIP (`dossierAssureurZip` : noms UTF-8, vraie extension, bordereau des
  pièces, illisibles nommés) se télécharge d'un vrai lien, pour
  WeTransfer ; le message (`dossierAssureurMail` : pièces, réception, coût
  définitif facturé HT et TTC, lien collé) se copie ou s'ouvre dans la
  messagerie. En copie (`dossierAssureurCopies`) : soi-même (adresse
  d'envoi des réglages, sinon celle de CP, ou celle saisie), le(s)
  client(s) (e-mail du chantier, sinon du prospect), d'autres adresses ;
  jamais l'assureur ; reprises par « Ouvrir dans la messagerie » (`cc`) et
  « Copier les adresses » (WeTransfer). Objet et message se retouchent à
  l'écran (`objetSaisi`, `corpsSaisi`, `dossierAssureurTextes` ; « Reprendre
  le texte proposé » ; un lien WeTransfer collé après coup s'insère :
  `insererLienTransfert`) ; la signature des mails habituels (logo) s'ajoute
  à l'envoi (`mailSigne`, `dossierAssureurSigne` pour la copie). « Envoyer
  depuis l'application » : Gmail connecté, assureur en destinataire, copies
  en Cc, adresse d'envoi en copie cachée, le ZIP joint s'il tient
  (`ZIP_MAIL_MAX`) ; l'envoi se note (`envoyeLe`, `envoi`). Assureur,
  e-mail, n° de contrat, copies, textes, lien et date d'envoi :
  `ch.dossierAssureur`. Tests : `t_dossier_assureur.js`,
  `dossier_assureur_navigateur.js`.
- **Déploiement** : GitHub Pages, à chaque push sur `main`
  (`.github/workflows/pages.yml`, tout le dépôt est publié). Les tests du
  CRM, de l'atelier et du Designer tournent à chaque PR
  (`.github/workflows/tests.yml`).

## CP Designer (`designer/`, TypeScript)

- Module de **conception** (Building Model, Geometry Engine, éditeur 2D…),
  **séparé du CRM** : on n'ajoute rien de ce module dans `index.html`, et
  rien de ses données dans `app_data` (tables `designer_*`,
  `supabase/designer/schema.sql`). Le CRM ne fait que l'ouvrir, par des
  liens (`designerLien`, `designerLienProspect`) : onglet « CP DESIGNER » du
  menu (chantiers, prospects en cours, projet libre) et pièce « Plans
  d'exécution » de la fiche chantier. Un chantier issu d'un prospect passe
  aussi `prospect=` : le Designer rouvre l'avant-projet du prospect.
- Décisions d'architecture : `docs/designer/` (ADR). Toute demande qui
  contredit un ADR ou les 7 règles de la spécification se signale, au lieu
  d'être appliquée en silence.
- La spécification produit (*Master Product Specification V3*) et les
  rapports restent **hors dépôt** (dépôt public).
- Roadmap unique : Phase 0 faite (socle) ; Phase 1 faite = 2D Core
  (géométrie, murs, accrochage, contraintes, pièces, ouvertures, cotes,
  annulation, sauvegarde, éditeur) ; Phase 1 bis faite = import du RDC lu
  par l'atelier (`designer/src/import/atelier.ts`) ; ensuite, tracé rapide,
  cotation automatique, bibliothèque d'ouvertures et vue 3D dérivée
  (`designer/src/vue3d/`, ADR-0006). Moteurs et leurs tests
  d'abord, interface ensuite. Les essais sur de vrais plans de clients se
  font hors dépôt ; les tests n'utilisent que le plan fictif de l'atelier
  (`designer/tests/fixtures/atelier_fictif.json`).
- Unités réelles (mm) ; tolérances seulement dans
  `src/geometry/tolerance.ts`.
- Tests : `cd designer && npm install && npm test && npm run typecheck` ; parcours
  dans Chromium : `npm run test:navigateur`.

## Règles

- **Tout en français** : interface, commentaires, messages de commit,
  descriptions de PR et réponses à l'utilisateur. Les commentaires du code
  expliquent le *pourquoi*, dans le style de ceux qui existent.
- **Ne jamais casser une fonction existante.** Ne jamais écraser en silence
  ce que l'utilisateur a saisi ou retouché. Les anciennes saisies restent
  lisibles.
- **Ne jamais écrire dans la base de production.** Pour un contenu propre
  à un dossier (le dossier Moualid par exemple), donnez un texte prêt à
  coller.
- **Le dépôt est public.** Il ne doit contenir ni données client, ni secret,
  ni document confidentiel reçu en pièce jointe (comptes, actes, etc. : voir
  `.gitignore`). Les photos publiées ne montrent ni étiquette de prix ni
  élément personnel.
- **À chaque livraison du CRM**, mettez à jour
  `const VERSION='AAAA-MM-JJ · résumé'` en haut du script de `index.html`
  (une livraison qui ne touche que `designer/` ne le change pas).
- **Plusieurs personnes travaillent sur le dépôt.** Une session = une
  branche. On ne pousse jamais directement sur `main`.

## Google (Drive, Gmail, Agenda)

- Connexion OAuth « implicite » depuis le navigateur (`GOOGLE_CLIENT_ID`,
  jeton d'une heure, aucun secret dans le dépôt). Le paramètre `state`
  distingue le retour de Google Agenda (`state=agenda`) de celui de Drive.
- **Agenda** : Google Agenda est la référence. Réglages, compte connecté
  et copie locale des événements sont propres à chaque utilisateur, sur
  son appareil (`localStorage`, clés `cpAgenda:*:<e-mail>`). Seuls les
  liens avec les dossiers (`data.agendaLiens` : agenda, événement ou série,
  dossier) sont partagés — jamais le titre ni le contenu d'un événement.
  Toute écriture passe `sendUpdates=none` (aucune invitation) et `If-Match`
  (etag) ; les heures sont envoyées en `Europe/Paris`.
- Les anciens rendez-vous (`data.rendezvous`) restent lisibles ; un
  rendez-vous transféré porte `google:{calId,eventId}`.
- **Envoi sur le Drive** : `uploadToDrive` envoie en une requête jusqu'à
  5 Mo, au-delà par session reprenable ; tout refus de Google passe par
  `driveErreur` (reconnexion, Drive plein, accès non coché, dossier
  introuvable…). Relire un fichier (`driveFichierBytes`) : l'accès
  `drive.file` ne voit que les fichiers déposés par l'application avec ce
  compte ; une pièce illisible est nommée (facture visée : envoi possible
  sans elle). ARTISANS › « Vérifier les pièces sur le Drive »
  (`verifierPiecesArtisans`, `VerifPiecesDrive`) liste d'un coup les
  attestations et RIB illisibles, à redéposer sur place. La visa d'une
  facture les vérifie dès l'ouverture du message (fiche seulement) : une
  pièce illisible est signalée avant « Envoyer », avec le pourquoi (autre
  compte, ou déposée directement dans le Drive) et « Redéposer ici »
  (`redeposerPieceArtisan`, `remplacerPieceArtisan` : le lien de la fiche
  est remplacé, la pièce repart et le message l'annonce de nouveau) ; de
  même sur l'écran d'erreur à l'envoi. Tests : `t_drive_envoi.js`,
  `t_viser_illisible.js`, `t_viser_redeposer.js`, `t_verif_pieces.js`.

## Livrer une modification

1. Travailler sur la branche de la session.
2. Lancer les tests (voir plus bas). Tout doit passer.
3. Faire un commit avec un message clair en français.
4. Ouvrir une PR vers `main`, puis la fusionner en *squash*.
5. Vérifier que le déploiement GitHub Pages (« Deploy static app to GitHub
   Pages ») se termine en succès.
6. Dire à l'utilisateur de recharger la page.

## Tests

```
cd tests
npm install
npm test                  # tous les tests t_*.js
npm run test:navigateur   # + vérifications dans Chromium (*_navigateur.js)
```

- `harness.js` charge le script de `index.html` dans Node et sert les vrais
  fichiers `assets/`.
- Les tests `*_navigateur.js` ouvrent l'application dans Chromium avec un
  faux Supabase (Playwright ; Chromium est dans `/opt/pw-browsers/chromium`
  sur les sessions cloud).
- Pour une nouvelle fonction, ajoutez un `t_<sujet>.js` sur le modèle des
  autres (`verif()`, `chk(condition, 'message')`, `fin()`).

## Atelier de conception (`atelier/`, Python)

- Application **locale, sur le Mac** (FastAPI sur 127.0.0.1) qui produit
  le dossier PCMI (page de garde, PCMI 1 à 8, plan du RDC) à partir du plan
  du RDC et du plan du terrain (DXF ou PDF vectoriel). Mode d'emploi et
  règles R1–R10 : `atelier/README.md`.
- **Plain-pied par défaut** : un étage (module B) ne s'étudie que sur
  demande.
- Les projets (plans, données clients) restent dans
  `~/CP Constructions/Atelier/projets/`. **Jamais dans le dépôt.** Les
  tests n'utilisent que le plan fictif de `atelier/tests/cas_fictif.py`.
- Ne rien inventer (R2) : aucun document tiers fabriqué, statut ✅ / ⚠️ / ❓
  sur toute valeur discutable. Articles de loi « à vérifier » tant qu'ils
  n'ont pas été lus sur Légifrance. Seuil de 150 m² bloquant.
- Tests : `cd atelier && python3 -m venv .venv &&
  .venv/bin/pip install -r requirements.txt && .venv/bin/python -m pytest -q tests`.

## Programme technique (PTR) : la bibliothèque et ses révisions

- **La bibliothèque**
  - Modèle livré : `PTR_CATALOGUE`, lu par `ptrBiblioInitiale()`.
  - Chaque prestation (`pr_<id>`) a des propositions `var_<id>_a/b/c` ;
    la proposition A est la proposition par défaut.
  - Les lignes d'un programme sont des copies des propositions.
- **Les révisions**
  - Le modèle évolue par *révisions* numérotées : `PTR_SEED_REV`, avec une
    date `PTR_SEED_DATE_<n>` enregistrée dans `PTR_SEED_DATES[n]`.
  - `ptrMigrerBiblio()` apporte chaque révision aux bibliothèques déjà
    enregistrées :
    - un texte n'est remplacé que s'il n'a pas été retouché (empreintes
      `PTR_TEXTES_ANCIENS`) ;
    - les nouvelles propositions sont ajoutées sans devenir la proposition
      par défaut.
- **Où écrire quoi**
  - Compléter la proposition A (marque, fiche, photo) : `PTR_COMPLEMENTS_A`.
  - Réécrire un texte de A :
    - ajouter l'empreinte (`ptrEmpreinte`) de l'ancien texte dans
      `PTR_TEXTES_ANCIENS` ;
    - ajouter l'identifiant de la proposition dans `PTR_TEXTES_REVISIONS[n]`.
  - Ajouter une proposition B : `PTR_PROPOSITIONS_2` ; une proposition C :
    `PTR_PROPOSITIONS_3`. Dans les deux cas, ajouter l'identifiant dans
    `PTR_SEED_NOUVELLES[n]`.
  - Ajouter une prestation : `PTR_PRESTATIONS_AJOUTEES` (`apres`,
    `optionnelle`).
  - Changer la proposition par défaut d'une prestation :
    `PTR_DEFAUTS_REVISIONS[n]` (une bibliothèque enregistrée ne la prend
    que si son défaut est resté la A ; jamais une proposition archivée).
    Révision 28 : volets à coffre monobloc (C), vitrerie (B), TaHoma (B).
  - Ajouter des photos à une proposition déjà livrée :
    `PTR_PHOTOS_AJOUTEES[n]` (ajoutées à la suite, rien n'est retiré).
- **Règles de rédaction**
  - **Aucun prix** dans la bibliothèque. Dimensions « selon plans ».
    Surfaces et quantités propres à un projet : `[à préciser]` (une alerte
    le rappelle dans le programme).
  - Un nouveau produit devient une **proposition B (ou C)**, sauf demande
    explicite de remplacer le standard. On écrit « ou équivalent ».
  - Fiche produit (PDF) dans `assets/ptr/docs/`, photos dans `assets/ptr/`
    (recadrées). Les constantes qui les utilisent doivent être déclarées
    *après* `ptrPhotoAsset` et `ptrPieceAsset`.

- **Rapprochement avec la vente** (éditeur du programme › « Rapprocher avec
  la vente », `PtrVente`) : le chiffrage remis au client (PDF ou Word,
  `lireChiffrageVente`) est lu puce par puce dans sa notice
  (`venteLignes`, « (envisagé) » retiré) et gardé avec le programme
  (`prog.vente`). Chaque puce est rattachée à ses prestations par des mots
  (`PTR_VENTE_THEMES`, fragment par ouvrage : `venteFragments`) ;
  `ptrRapprochement` donne les écarts (mesures, teintes, marques, fiche
  jointe d'un autre fabricant : `venteEcarts`), les postes vendus absents,
  ceux que la vente ne cite pas (hors `PTR_VENTE_GENERIQUES`) et la mission
  du maître d'œuvre à part. Les actions (`ptrAppliquerVente` : autre
  proposition, inclure, ajouter avec le texte vendu, exclure) ne
  s'appliquent qu'au clic ; « Ignorer » se garde (`prog.venteIgnores`).
  « Appliquer toutes les propositions » (`ptrAppliquerToutVente`) les
  enchaîne après avoir dit ce qui change : jamais d'exclusion d'office, ni
  de texte retouché remplacé (il est nommé). Un programme se crée aussi
  « Depuis le chiffrage vendu » : le modèle, la vente gardée, le type
  d'ouvrage repris (ERP), le rapprochement ouvert aussitôt ; un document
  sans ouvrage reconnu ne crée rien. Tests : `t_ptr_vente.js`,
  `t_ptr_depuis_vente.js` (chiffrages fictifs).
- **Type d'ouvrage** (`prog.typeOuvrage` : `maison` ou `erp5`) : en ERP,
  page de garde et synthèse parlent de « bâtiment » (`ptrMentionsPour`,
  `ptrTexteSelonOuvrage`), les lignes qui parlent encore de garage, de
  chambres ou de maison sont signalées (`ptrAlertesUsage`, aussi dans le
  contrôle avant export), et les prestations ERP (`PTR_PRESTATIONS_ERP`,
  optionnelles) s'ajoutent d'un clic (`ptrInclurePrestations`) : alarme,
  éclairage de sécurité, grilles de transfert, dossier (révision 23) ;
  dispositions électriques, extincteurs et consignes, portes et repères
  accessibles, sanitaire accessible, réaction au feu, stationnement et
  cheminement accessibles, contrôles avant ouverture (révision 27). Aucun
  article ni seuil réglementaire chiffré : tout renvoie aux notices de
  sécurité et d'accessibilité et au contrôleur technique. Le nom du
  dossier (« Maison Philippe… ») ne change pas ; les documents d'un ERP
  portent « Bâtiment Philippe… » (`ptrIntituleDefaut`), ou l'intitulé
  saisi sur le programme (`prog.intitule`, « Intitulé sur les
  documents »). Tests : `t_ptr_rev23.js`, `t_ptr_rev27.js`,
  `t_ptr_intitule.js`.
- **Word du programme** : Word refuse ce que LibreOffice et Google Drive
  tolèrent ; l'ordre des éléments suit le schéma OOXML (marges et
  bordures de cellule : haut, gauche, bas, droite). Safari (et tout
  navigateur d'iPhone) refuse un téléchargement lancé à la fin d'une
  composition : il ouvre un onglet « WebKitBlobResource erreur 1 ». Sous
  Safari (`telechargementDifere`), l'export dit « prêt » et le fichier se
  télécharge d'un vrai lien `<a download>` (« ⬇ Télécharger le Word » ; un
  clic simulé ouvre l'onglet en erreur) ; ailleurs il part
  tout seul, avec « Télécharger à nouveau ». Tests :
  `t_ptr_export_safari.js`, `t_ptr_intitule.js`.
- **Version définitive retouchée** (éditeur du programme, `PtrDefinitifs`) :
  le Word généré, repris dans Word, se redépose (Word et/ou PDF). Il part
  sur le Drive › Programme technique, renommé `…_V<n>_definitif`
  (`ptrNomDefinitif`), rattaché à la version en cours
  (`prog.definitifs`, `ptrAjouterDefinitifs`) ; les textes du programme
  ne changent pas, c'est ce document qui fait foi. Dépôt possible sur une
  version figée ; l'historique des versions et la carte du programme le
  donnent ; un Word régénéré prévient qu'il ne reprend pas les retouches.
  Tests : `t_ptr_definitif.js`.
- **Importer un programme préparé** (création ou éditeur du programme,
  fichier `.json` au format `cp-ptr`, `ptrLireImport`,
  `ptrImporterProgramme`) : un programme complet préparé hors de
  l'application (par exemple d'après le chiffrage vendu) se charge d'un
  clic, rattaché au dossier ouvert (jamais à celui du fichier). Le contenu
  en place passe dans l'historique des versions ; un programme validé ne
  se remplace pas ; un fichier incomplet ne touche à rien. C'est ainsi
  qu'un programme se remplit pour un dossier sans écrire en base : le
  fichier, préparé hors dépôt, est remis à l'utilisateur. Tests :
  `t_ptr_import.js`.
- **Photos d'une proposition** (ligne du programme) : reprend les photos
  d'une proposition de la bibliothèque sans toucher au texte écrit pour le
  projet. Des photos ajoutées après coup à une proposition livrée
  (`PTR_PHOTOS_AJOUTEES`) arrivent à la suite, sans rien retirer. Tests :
  `t_ptr_photos_ligne.js`.

### Ajouter une révision N (N = révision actuelle + 1)

1. Vérifiez que `tests/fixtures/biblio_rev<N-1>.json.gz` existe. Sinon,
   **avant toute modification**, créez-le :
   ```
   cd tests && node -e "const {charger}=require('./harness');const M=charger(['ptrBiblioInitiale']);process.stdout.write(JSON.stringify(M.ptrBiblioInitiale()))" | gzip -9 > fixtures/biblio_rev<N-1>.json.gz
   ```
2. Passez `PTR_SEED_REV` à N et ajoutez `PTR_SEED_DATE_N` (heure
   postérieure à la précédente) dans `PTR_SEED_DATES`.
3. Faites la modification (voir plus haut), puis mettez à jour `VERSION`.
4. Dans les tests :
   - remplacez `seedRev===N-1` par `seedRev===N` et « 3 → N-1 » par
     « 3 → N » dans les `t_ptr_rev*.js` ;
   - ajoutez `t_ptr_revN.js`, qui migre `biblioRev('rev<N-1>')` et vérifie
     le résultat ;
   - ajustez les compteurs de `t_ptr_biblio.js` et `t_ptr_editeur.js` si le
     nombre de prestations change.
5. Si possible, générez le Word du programme et regardez la page
   concernée (LibreOffice et `pdftoppm`).
6. Après la fusion, créez `fixtures/biblio_revN.json.gz` (commande du
   point 1) pour la révision suivante.
