/* PRIX › bordereau › « Importer un devis » : lecture des lignes d'un devis
   PDF de menuiseries sur mesure. Le repère de la baie (A, B…) ne devient
   pas un code — il est propre à ce devis-là ; le libellé emporte ce qui fait
   le prix (profilé, gamme, finition ou teinte, vitrage, volet, moteur), sans
   la teinte du tablier ni le côté du moteur ; une dimension « 0 0 » ne se
   recopie pas. Deux gabarits : repère et dimensions sur la rangée, ou
   dimensions et puces sur les lignes du dessous. Données fictives. */
const {charger,verif}=require('./harness');
const M=charger(['analyseDevisFournisseur','rangeeDevis','caracteristiquesDevis']);
const {chk,fin}=verif();

/* gabarit 1 : repère, désignation, largeur, hauteur, qté, PU, total, TVA */
const devis1=[
  'Repère  Désignation               Dimensions tableaux (ou passage) : Largeur   Hauteur   Qté    Prix unitaire   Totat HT (+EcoTaxe) TVA',
  'A    Fenêtre 1 Vantail oscillo-battante              800   1200   1     500,00 €     505,00 €   20',
  'Vue intérieure - Dessin non contractuel',
  '205    Hauteur châssis en mm Situation : chambre fictive',
  'Profilé : PVC         VEKA            Vitrage : 4FE-16Ar-4',
  'Gamme : GAMME-TEST 70                 Ug : 1,1  W/m2.°K    Sg : 0,63',
  '1200    Dormant : Dormant large 160 mm       Vitrage Isolation Renforcée Argon',
  'Finition : Blanc 9016 Int/Ext           Intercal. : Espaceur Warm Edge',
  'Volet : Moteur SOMFY Radio IO D.           Coffre : Coffre test',
  'Tablier : Lames alu 43 mm',
  'Couleur : Gris 7016                        Seuil : Dormant large PVC',
  'Accessoires inclus :',
  '1  Usinage mortaise 350 x 12 pour grille d\'aération',
  'Repère  Désignation               Dimensions tableaux (ou passage) : Largeur   Hauteur   Qté    Prix unitaire   Totat HT (+EcoTaxe) TVA',
  'B    Fenêtre 1 Vantail oscillo-battante              800   1200   2     500,00 €    1 010,00 €   20',
  'Profilé : PVC         VEKA            Vitrage : 4FE-16Ar-4',
  'Gamme : GAMME-TEST 70                 Ug : 1,1  W/m2.°K    Sg : 0,63',
  'Finition : Blanc 9016 Int/Ext           Intercal. : Espaceur Warm Edge',
  'Volet : Moteur SOMFY Radio IO G.           Coffre : Coffre test',
  'Tablier : Lames alu 43 mm',
  'Couleur : Gris 7016                        Seuil : Dormant large PVC',
  '1  Usinage mortaise 350 x 12 pour grille d\'aération',
  'Repère  Désignation               Dimensions tableaux (ou passage) : Largeur   Hauteur   Qté    Prix unitaire   Totat HT (+EcoTaxe) TVA',
  'C    Coulissant 2 vantaux 2 rails                  2400   2150   1    1 900,00 €    1 905,00 €   20',
  'Profilé : Alu rupture th  REYNAERS      Vitrage : 4FE-16Ar-4',
  'Gamme : CP 68 GT                      Ug : 1,1  W/m2.°K',
  'Finition : Noir 9005 Fine Structure        Intercal. : Espaceur Warm Edge',
  'Repère  Désignation               Dimensions tableaux (ou passage) : Largeur   Hauteur   Qté    Prix unitaire   Totat HT (+EcoTaxe) TVA',
  'D    Box domotique                              0      0     1     200,00 €     200,00 €   20',
  'Profilé :                                Vitrage :',
  'Gamme :                               Ug : 0    W/m2.°K',
  '0    Dormant :',
  'Finition :                               Intercal. : Alu naturel',
  'Accessoires inclus :',
  '1  Box ( Sans abonnement )',
  'Les prix sont établis sur la base des',
  '20 %           3 620,00 €          724,00 €             4 344,00 €'
];
const A=M.analyseDevisFournisseur(devis1);
chk(A.length===4,'quatre rangées lues (le total du devis n\'en est pas une) : '+A.length);
chk(A.every(a=>a.code===''),'le repère A, B… ne sert pas de code');
chk(A[0].pu===500&&A[2].pu===1900&&A[3].pu===200,'prix unitaires lus (y compris le séparateur de milliers)');
chk(A[0].libelle==='Fenêtre 1 Vantail oscillo-battante 800x1200 — PVC VEKA, gamme GAMME-TEST 70, finition Blanc 9016 Int/Ext, vitrage 4FE-16Ar-4, volet : Moteur SOMFY Radio IO, usinage pour grille d’aération',
  'libellé enrichi de ce qui fait le prix : '+A[0].libelle);
chk(!/7016/.test(A[0].libelle),'la teinte du tablier (après le volet) ne passe pas pour celle de la menuiserie');
chk(A[0].libelle===A[1].libelle,'côté du moteur (D. / G.) ignoré : A et B, identiques, n\'ont qu\'un libellé');
chk(A[2].libelle==='Coulissant 2 vantaux 2 rails 2400x2150 — Alu rupture th REYNAERS, gamme CP 68 GT, finition Noir 9005 Fine Structure, vitrage 4FE-16Ar-4',
  'coulissant aluminium : '+A[2].libelle);
chk(A[3].libelle==='Box domotique','dimensions « 0 0 » et champs vides ignorés : '+A[3].libelle);

/* gabarit 2 : désignation, qté, PU, total, TVA ; dimensions et puces dessous */
const devis2=[
  'Désignation                         Qté     Pu HT     Total HT   TVA',
  'Porte d\'entrée ACIER fictive',
  'Entrée : MODELE : Porte d\'entrée ACIER avec châssis latéral            1      2 ௗ 100,00      2 ௗ 100,00     1',
  'Haut 2150 mm x Larg 1800 mm',
  '. Porte 1 vantail + 1 partie latérale',
  '. Gamme Acier 48mm, Dormant ALU',
  '. Couleur extérieure : Gris 7016 texturé',
  '. Couleur intérieure idem extérieur',
  '. Vitrage de la porte : Double vitrage',
  'Dont éco-contribution REP PMCB : 3,00€ HT',
  'Désignation                         Qté     Pu HT     Total HT   TVA',
  'Garage : Porte de garage sectionnelle fictive            1      1 500,00      1 500,00     1',
  'Haut 2000 mm x Larg 2400 mm',
  '. Finition Planar (Lisse mat)',
  '. Couleur : intérieur RAL 9002, extérieur RAL 7016',
  '. Moteur MoteurTest P (avec 1 émetteur)',
  '. Eclairage LED',
  'Dont éco-contribution REP PMCB : 4,00€ HT',
  'Acompte demandé : 0,00 €                                                                Total HT :                   3 600,00 €'
];
const B=M.analyseDevisFournisseur(devis2);
chk(B.length===2,'deux articles lus : '+B.length);
chk(B[0].pu===2100&&B[1].pu===1500,'prix unitaires (glyphe de milliers mal sous-titré compris)');
chk(B[0].libelle==='Entrée : MODELE : Porte d\'entrée ACIER avec châssis latéral — Haut 2150 mm x Larg 1800 mm — gamme Acier 48mm, Dormant ALU, teinte Gris 7016 texturé',
  'porte d\'entrée : '+B[0].libelle);
chk(B[1].libelle==='Garage : Porte de garage sectionnelle fictive — Haut 2000 mm x Larg 2400 mm — finition Planar (Lisse mat), teinte intérieur RAL 9002, extérieur RAL 7016, moteur MoteurTest P',
  'porte de garage : '+B[1].libelle);

/* un devis ordinaire (sans repère ni caractéristiques) se lit comme avant */
const C=M.analyseDevisFournisseur(['Plaque de plâtre BA13          12    8,50 €    102,00 €   20']);
chk(C.length===1&&C[0].code===''&&C[0].libelle==='Plaque de plâtre BA13'&&C[0].pu===8.5,'devis ordinaire inchangé : '+JSON.stringify(C));
chk(M.rangeeDevis('Total HT :   3 600,00 €')===null,'une ligne de total n\'est pas une rangée');
fin();
