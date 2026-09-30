/* Le DQE électrique comme jauge du plan, sur un dossier fictif (même
   structure qu'un marché « Électricité » de l'application) : pièces lues
   dans les intertitres, articles reconnus avec leur code, lignes inconnues
   laissées « à affecter », prestations du logement entier, répartition d'une
   ligne sur plusieurs pièces, commandes et bouches déduites ; puis le
   contrôle dans les deux sens, le rapport, la plus-value potentielle et les
   sorties (Excel, PDF), et la lecture d'un fichier (texte à plat, classeur). */
const {charger,verif,SORTIE}=require('./harness');
const fs=require('fs');const path=require('path');
const M=charger(['elecLireDQE','elecTitreDQE','elecTypeDQE','elecAffecterPieces','elecBaseDepuisDQE','elecControle','elecGenerer',
  'elecDqeDepuisTexte','elecDqeDepuisFeuilles','elecDqeXlsx','elecRapportPages','pdfVectoriel','elecMarchesElec','elecDqeDepuisMarche','zipEntree']);
const {chk,fin}=verif();

const T=l=>({type:'titre',libelle:l});
let n=0;const A=(code,libelle,qt,pu)=>({id:'l'+(n++),type:'article',code,libelle,unite:'U',qt,pu});
const Q=[T('151 ELECTRICITÉ'),A('B_1TYPE_5CEI','Tableau et distribution base type 6',1,1200),A('B_2TAB','Tableau communication essentiel grade 3',1,400),
  T('EXTERIEUR:'),A('D_11EXT_2ASA','Applique accès entrée (SA à témoin)',2,73.5),A('D_13EXT_5P16','Prise 10/16 A + T',1,63),
  T('ENTREE:'),A('D_13ENT_1CVV','Point lumineux (V et V)',1,94.5),A('D_13ENT_5P16','Prise 10/16 A + T',1,52.5),
  T('CUISINE :'),A('D_17CUI_1CVV','Point lumineux (V et V)',1,94.5),A('D_17CUI_5HOT','Prise hotte',1,52.5),A('D_17CUI_5P16','Prise 10/16 A + T',7,52.5),
  A('D_17CUI_5P20','Prise 16/20 A + T',3,94.5),A('D_17CUI_5P32','Alimentation 32 A + T',1,126),A('D_17CUI_9XX','Option non retenue',0,10),
  T('SALLE DE BAINS:'),A('D_19BA1_1CSA','Point lumineux (SA)',1,73.5),A('D_19BA1_5P16','Prise 10/16 A + T',2,52.5),
  T('SEJOUR:'),A('D_23SEJ_1CVV','Point lumineux (V et V)',2,94.5),A('D_23SEJ_5P16','Prise 10/16 A + T',10,52.5),A('D_23SEJ_7PTT','Prise communication (GR3 - Cath6)',2,73.5),
  T('CHAMBRES 1, 2 ET 3:'),A('D_25CH1_1CVV','Point lumineux (V et V)',3,94.5),A('D_25CH1_5P16','Prise 10/16 A + T',9,52.5),A('D_25CH1_7PTT','Prise communication (GR3 - Cath6)',3,73.5),
  T('MEZZANINE :'),A('D_40MEZ_5P16','Prise 10/16 A + T',2,52.5),
  T('GARAGE :'),A('F_17GAR_1CVV','Point lumineux (V et V)',1,94.5),A('L_19PORTE_GA','Alimentation porte de garage',1,52.5),
  T('AUTRES :'),A('L_14CHAUD_A','Alimentation pompe à chaleur',1,300),A('L_15CHAUD_A','Alimentation thermostat',1,50),A('L_17VR','Alimentation volet roulant',6,52.5),
  A('L_20LIASEQUI','Liaison équipotentielle',1,45),A('M_12_7TV','Prise TV',2,73.5),A('Z_12_CONSU','Demande de consuel',1,157.5),A('Z_99_XYZ','Prestation spéciale XYZ',1,99),
  T('153 VENTILATION MÉCANIQUE CONTRÔLÉE'),A('H_3SANIT','V.M.C. hygroréglable 3 sanitaires + cuisine',1,835),A('J_B_VENT_3H','Entrée d’air frais hygro-acoustique PVC',4,45)];
const D=M.elecLireDQE(Q,{nom:'Marché fictif'});
const P=k=>D.pieces.find(p=>p.nom===k);
const L=code=>D.lignes.find(l=>l.article===code);
chk(D.pieces.map(p=>p.type).join('|')==='Extérieur|Entrée|Cuisine|Salle de bains|Séjour|Chambre||Garage','pièces lues dans les intertitres (titres de lot et « AUTRES » exclus)');
chk(P('CHAMBRES 1, 2 ET 3').nombre===3&&P('MEZZANINE').type===null,'« Chambres 1, 2 et 3 » couvre trois pièces ; « Mezzanine » reste non identifiée');
chk(!L('D_17CUI_9XX'),'une ligne à quantité nulle n’est pas une prestation');
chk(L('D_17CUI_5P16').type==='pc'&&L('D_17CUI_5P20').type==='pc20'&&L('D_17CUI_5P32').type==='pc32'&&L('D_17CUI_5HOT').type==='hotte','prises 16 A, 20 A, 32 A et hotte reconnues');
chk(L('D_17CUI_1CVV').type==='pointc'&&L('D_17CUI_1CVV').commande==='vv'&&L('D_19BA1_1CSA').commande==='sa','points lumineux et leur commande (V et V, SA)');
chk(L('D_11EXT_2ASA').type==='appext'&&L('D_11EXT_2ASA').commande==='savoy','applique extérieure à témoin');
chk(L('D_23SEJ_7PTT').type==='rj45'&&L('M_12_7TV').type==='tv','RJ45 et TV');
chk(L('L_17VR').type==='vr'&&L('L_17VR').pieceCle===''&&L('L_14CHAUD_A').type==='pac'&&L('L_15CHAUD_A').type==='th','volets, PAC, thermostat : prestations du logement');
chk(L('L_20LIASEQUI').nonDessine&&L('Z_12_CONSU').nonDessine,'liaison équipotentielle, consuel : comptés, jamais dessinés');
chk(L('Z_99_XYZ').reconnu===false&&L('Z_99_XYZ').type===null,'une ligne inconnue reste « à affecter » : rien n’est deviné');
chk(L('H_3SANIT').type==='vmc'&&L('H_3SANIT').bouches===4&&L('J_B_VENT_3H').type==='entair','VMC (4 bouches : 3 sanitaires + cuisine) et entrées d’air, à part du réseau électrique');
chk(L('L_19PORTE_GA').type==='pgarage'&&L('B_1TYPE_5CEI').type==='tab'&&L('B_2TAB').type==='coffcom','porte de garage, tableau, coffret de communication');
chk(L('D_17CUI_5P16').pu===52.5&&L('D_17CUI_5P16').article==='D_17CUI_5P16','code article et prix unitaire conservés');

/* --- le plan fictif et le programme --- */
const pc=(id,type,nom,x0,y0,x1,y1)=>({id,type,nom,x0,y0,x1,y1});
const pieces=[pc('pS','Séjour','Séjour',0,0,.4,.4),pc('pC','Cuisine','Cuisine',.4,0,.6,.4),pc('pE','Entrée','Entrée',.6,0,.7,.2),
  pc('pB','Salle de bains','Salle de bains',.6,.2,.7,.4),pc('c1','Chambre','Chambre 1',0,.5,.3,.9),pc('c2','Chambre','Chambre 2',.3,.5,.6,.9),
  pc('c3','Chambre','Chambre 3',.6,.5,.9,.9),pc('pG','Garage','Garage',.7,0,1,.4)];
const aff=M.elecAffecterPieces(D,pieces);
chk(aff[P('CHAMBRES 1, 2 ET 3').cle].join()==='c1,c2,c3'&&aff[P('CUISINE').cle].join()==='pC'&&!aff[P('MEZZANINE').cle].length&&!aff[P('EXTERIEUR').cle].length,
  'pièces rattachées au plan : les trois chambres ; rien pour l’extérieur ni la mezzanine (non tracés)');
const base={source:'dqe',lignes:M.elecBaseDepuisDQE(D,aff)};
const B=(piece,type,nature)=>base.lignes.filter(l=>l.piece===piece&&l.type===type&&(l.nature||'prevu')===(nature||'prevu'));
chk(B('c1','pc').length===1&&B('c1','pc')[0].qte===3&&B('c2','pc')[0].qte===3&&B('c3','pc')[0].qte===3&&/Répartition proposée/.test(B('c1','pc')[0].repartition),
  '9 prises pour 3 chambres : 3 / 3 / 3, répartition proposée, à valider');
chk(B('pS','vv','deduit')[0].qte===4&&B('pS','vv','deduit')[0].pu===null,'séjour : 2 points en va-et-vient → 4 commandes déduites, sans prix');
chk(B('','vr')[0].qte===6&&B('','bouche','deduit')[0].qte===4,'6 volets roulants et 4 bouches VMC au logement');
chk(base.lignes.some(l=>l.nonAffecte&&l.article==='D_13EXT_5P16'),'une ligne d’une pièce non tracée est comptée au logement, signalée');

/* --- implantation et contrôle --- */
let sid=0;const S=(type,x,y,o)=>({id:'s'+(sid++),type,x,y,...(o||{})});
const sym=[
  ...Array.from({length:6},(_,i)=>S('pc',.42+i*.02,.1)),            /* cuisine : 6 prises sur 7 */
  ...Array.from({length:3},(_,i)=>S('pc20',.45+i*.03,.2)),S('pc32',.5,.3),S('hotte',.55,.05),S('pointc',.5,.2),
  ...Array.from({length:10},(_,i)=>S('pc',.02+i*.035,.35)),S('pointc',.1,.2),S('pointc',.3,.2),
  ...Array.from({length:3},(_,i)=>S('rj45',.05+i*.1,.05)),         /* séjour : 3 RJ45 pour 2 */
  ...Array.from({length:6},(_,i)=>S('vr',.05+i*.1,.45)),            /* volets posés dans les pièces : comptés au logement */
  S('irve',.9,.3),                                                   /* hors DQE */
];
const plan={pieces,symboles:sym};
const ctl=M.elecControle(plan,base);
const lig=(pieceNom,libre)=>ctl.lignes.find(l=>l.pieceNom===pieceNom&&new RegExp(libre).test(l.libelle));
chk(lig('Cuisine','PC 2P\\+T 16A').niveau==='erreur'&&lig('Cuisine','PC 2P\\+T 16A').implante===6&&lig('Cuisine','PC 2P\\+T 16A').prevu===7,'🔴 cuisine : 6 prises sur 7 prévues au DQE');
chk(lig('Cuisine','20A').niveau==='ok'&&lig('Cuisine','32A').niveau==='ok','✅ cuisine : 3 prises 20 A et 32 A conformes');
const rj=lig('Séjour','RJ');
chk(rj.niveau==='controle'&&/hors marché/.test(rj.msg)&&rj.article==='D_23SEJ_7PTT','🟠 séjour : 3 RJ45 pour 2 — 1 potentiellement hors marché, article conservé');
chk(lig('Logement (général)','^VR$').niveau==='ok','✅ 6 volets posés dans les pièces, comptés sur la ligne du logement');
chk(ctl.lignes.some(l=>l.type==='irve'&&l.prevu===0&&l.niveau==='controle'),'🟠 plan → DQE : une borne dessinée mais absente du DQE est signalée');
chk(ctl.plusValues.length===1&&ctl.plusValues[0].montantHT===73.5&&ctl.plusValueHT===73.5,'plus-value potentielle : 1 RJ45 au prix du DQE, 73,50 € HT (jamais facturée)');
const R=ctl.rapport;
chk(R.manquants>0&&R.horsDqe===2&&R.conformes+R.manquants===R.dqe,'rapport : conformes + manquants = prévus au DQE ; 2 hors DQE');
chk(ctl.anomalies[0].niveau==='erreur','anomalies : les erreurs d’abord');
/* la génération : ce qui est du logement va « à placer », sans position inventée */
const g=M.elecGenerer(plan,base);
chk(g.ajouts.some(s=>s.type==='pac'&&s.aPlacer&&s.x===null&&s.article==='L_14CHAUD_A'),'générer : l’alimentation PAC attend « à placer », avec son article');

/* --- les sorties --- */
(async()=>{
  const x=M.elecDqeXlsx(ctl,'Contrôle — Maison fictive');
  const feuille=new TextDecoder().decode(await M.zipEntree(x.buffer.slice(x.byteOffset,x.byteOffset+x.byteLength),'xl/worksheets/sheet1.xml'));
  chk(x[0]===0x50&&x[1]===0x4B&&/D_17CUI_5P16/.test(feuille)&&/Qté plan/.test(feuille),'Excel : pièce, article, désignation, quantités, écart');
  fs.writeFileSync(path.join(SORTIE,'controle_elec.xlsx'),x);
  const pdf=M.pdfVectoriel(M.elecRapportPages(ctl,{nom:'Maison fictive'},{source:'Marché fictif',indice:'B'},null),'x');
  const txt=Buffer.from(pdf).toString('latin1');
  fs.writeFileSync(path.join(SORTIE,'controle_elec.pdf'),pdf);
  chk(/CONTR\xd4LE PLAN \xc9LECTRIQUE/.test(txt)&&/ANOMALIES/.test(txt),'PDF : rapport de contrôle et anomalies');

  /* --- un fichier : texte à plat (PDF à texte) et classeur --- */
  const plat='MARCHÉ DE TRAVAUX 151 ELECTRICITÉ ARTICLE LIBELLÉ QT U PU PT B_1TYPE_5CEI Tableau et distribution 1,000 U 1200,00 1200,00 '
    +'CUISINE : ARTICLE LIBELLÉ QT U PU PT D_17CUI_1CVV Point lumineux (V et V) 1,000 U 94,50 94,50 D_17CUI_5P16 Prise 10/16 A + T 7,000 U 52,50 367,50 '
    +'CHAMBRES 1, 2 ET 3: ARTICLE LIBELLÉ QT U PU PT D_25CH1_5P16 Prise 10/16 A + T 9,000 U 52,50 472,50';
  const dt=M.elecDqeDepuisTexte(plat,'dqe.pdf');
  chk(dt.lignes.length===4&&dt.pieces.map(p=>p.type).join()==='Cuisine,Chambre'&&dt.lignes.find(l=>l.article==='D_17CUI_5P16').qte===7
    &&dt.lignes.find(l=>l.article==='D_25CH1_5P16').pieceCle===dt.pieces[1].cle,'texte à plat : articles, quantités et pièces retrouvés');
  const df=M.elecDqeDepuisFeuilles([{nom:'DQE',lignes:[['ARTICLE','LIBELLÉ','QT','U','PU','PT'],['CUISINE :'],['D_17CUI_5P20','Prise 16/20 A + T','3','U','94,50','283,50'],
    ['TOTAL','','','','','283,50']]}],'dqe.xlsx');
  chk(df.lignes.length===1&&df.lignes[0].type==='pc20'&&df.lignes[0].qte===3&&df.pieces[0].type==='Cuisine','classeur : en-têtes, pièce et article');
  /* depuis le marché du dossier */
  const data={marches:[{id:'m1',chantierId:'c1',lot:'Électricité',numero:9,artisanId:'a1',quantitatif:{lignes:Q}},{id:'m2',chantierId:'c1',lot:'Plomberie',quantitatif:{lignes:Q}}],
    artisans:[{id:'a1',nom:'EI Fictive'}]};
  const mm=M.elecMarchesElec({id:'c1'},data);
  const dm=M.elecDqeDepuisMarche(mm[0],data);
  chk(mm.length===1&&dm.source.type==='marche'&&/n° 9/.test(dm.source.nom)&&/EI Fictive/.test(dm.source.nom)&&dm.lignes.length===D.lignes.length,'le marché « Électricité » du dossier se lit directement');
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
