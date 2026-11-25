/* Relevé de visite — le chiffrage précis depuis le plan (releve/chiffrage.js) :
   pilotes lus dans le plan, gabarit le plus proche, quantités remises à
   l'échelle, prix avec ou sans marge arrière, bilan interne. Catalogue et
   prix FICTIFS (tests/fixtures/chiffrage_fictif.json) : le dépôt est public et
   ne contient aucun prix de CP. */
const {verif}=require('./harness');
const {chk,fin}=verif();
const fs=require('fs'),path=require('path');
const D=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','chiffrage_fictif.json'),'utf8'));
(async()=>{
  const C=await import('../releve/chiffrage.js');
  let n=0;const id=()=>'l'+(++n);

  /* les pilotes viennent du plan ; le garage n'est pas de l'habitable */
  const plan=[{id:'a',nom:'Séjour',sol:40},{id:'b',nom:'Chambre 1',sol:12.5},{id:'c',nom:'Garage',sol:25.2},{id:'d',nom:'Cuisine',sol:15}];
  const P=C.pilotesDepuisPlan(plan);
  chk(P.S===67.5&&P.Sg===25.2&&P.source==='plan','surface habitable 67,5 m² ; garage 25,2 m² à part');
  chk(P.P===C.perimetreEstime(67.5)&&C.perimetreEstime(100)===66.7,'périmètre estimé d\'après la surface (0,667 × S), jamais lu dans le plan');
  chk(C.pilotesDepuisPlan([])===null&&C.pilotesDepuisPlan(null)===null&&C.pilotesDepuisPlan([{nom:'X',sol:0}])===null,'sans plan ou sans surface : aucune grandeur inventée');

  /* le gabarit le plus proche, avec ou sans garage */
  chk(C.gabaritProche(D,{S:105,Sg:0}).id==='ga','100 m² sans garage → la petite maison');
  chk(C.gabaritProche(D,{S:140,Sg:25}).id==='gb','140 m² + garage → la grande maison avec garage');
  chk(C.gabaritProche(D,{S:120,Sg:0}).id==='ga','sans garage, un gabarit avec garage n\'est pas retenu même plus proche en surface');
  chk(C.gabaritProche({gabarits:[]},{S:100})===null,'aucun gabarit : null');
  chk(C.ecartGabarit(D.gabarits[0],{S:100,Sg:0})===0&&Math.round(C.ecartGabarit(D.gabarits[0],{S:150,Sg:0})*100)===50,'écart de taille : 0 % puis 50 %');

  /* quantités remises à l'échelle */
  const L=C.genererLignes(D,'ga',{S:120,Sg:0,P:80},id);
  const q=code=>(L.find(x=>x.code===code)||{}).qte;
  chk(q('T_PLAF')===120&&q('T_CLOISON')===84,'pilote S : plafond 100→120, cloison 70→84');
  chk(q('T_AGGLO')===133.33&&q('T_SEMELLE')===10.91,'pilote P : agglos et semelles suivent le périmètre (66→80 m : ×1,2121)');
  chk(q('T_FORFAIT')===1,'forfait : quantité inchangée');
  chk(L.every(x=>x.qte===x.qte0&&x.id),'chaque ligne garde sa quantité d\'origine (pour repérer les retouches) et un identifiant');
  const LG=C.genererLignes(D,'ga',{S:100,Sg:20,P:66},id);
  chk(!LG.some(x=>x.code==='T_GARAGE'),'gabarit sans garage : aucune ligne de garage inventée');
  const LB=C.genererLignes(D,'gb',{S:150,Sg:30,P:100},id);
  chk(LB.find(x=>x.code==='T_GARAGE').qte===30,'gabarit avec garage, même taille : quantités du dossier de référence');
  chk(C.genererLignes(D,'inconnu',{S:100},id).length===0,'gabarit inconnu : aucune ligne');
  {const D2=JSON.parse(JSON.stringify(D));delete D2.articles.T_CLOISON;
   chk(!C.genererLignes(D2,'ga',{S:100,Sg:0,P:66},id).some(x=>x.code==='T_CLOISON'),'article retiré du catalogue depuis : la ligne du gabarit est sautée sans erreur');}

  /* prix : catalogue, marge arrière, prix saisi */
  const l1={id:'x',code:'T_AGGLO',qte:10},l2={id:'y',code:'T_PLAF',qte:10},l3={id:'z',code:'T_AGGLO',qte:10,pu:55};
  chk(C.prixLigne(D,l1,false).pu===40&&C.prixLigne(D,l1,true).pu===48&&C.prixLigne(D,l1,true).retro===8,'maçonnerie : 40 € sans majoration, 48 € avec +20 % (marge arrière 8 €)');
  chk(C.prixLigne(D,l2,true).pu===20&&C.prixLigne(D,l2,true).retro===0,'plaquisterie : jamais majorée');
  chk(C.prixLigne(D,l3,true).pu===55&&C.prixLigne(D,l3,true).saisi,'un prix tapé l\'emporte et n\'a pas de marge arrière');
  chk(C.prixLigne(D,{code:'?',qte:1},true).inconnu===true,'article inconnu : signalé, pas d\'exception');

  /* bilan interne */
  const B=C.chiffrer(D,[l1,l2],{coef:1.1,tva:20,retro:true});
  chk(B.artisanHT===680,'artisan HT : 10×48 + 10×20 = 680 €');
  chk(B.venteHT===748&&B.venteTTC===897.6,'vente HT = 680 × 1,1 = 748 € ; TTC 897,60 €');
  chk(B.margeAnnoncee===Math.round((897.6-816)*100)/100,'marge annoncée = vente TTC − artisan TTC (81,60 €)');
  chk(B.retroTTC===96&&B.margeTotale===177.6,'marge arrière : 10 × 8 € = 80 € HT, 96 € TTC ; marge totale 81,60 + 96 = 177,60 €');
  chk(B.lots.length===2&&B.lots[0].lot==='031'&&B.lots[0].nom==='Maçonnerie'&&B.lots[0].total===480,'lots triés, nommés, avec leur total');
  const B0=C.chiffrer(D,[l1,l2],{coef:1.1,tva:20,retro:false});
  chk(B0.artisanHT===600&&B0.retroTTC===0,'sans majoration : 600 € et pas de marge arrière');
  const Bv=C.chiffrer(D,[],{});
  chk(Bv.artisanHT===0&&Bv.venteTTC===0&&Bv.pourcentMarge===0&&Bv.lots.length===0,'aucune ligne : zéros, pas de division par zéro');
  chk(C.chiffrer(D,[{id:'q',code:'?',qte:2,pu:10}],{}).artisanHT===20,'ligne inconnue mais au prix saisi : comptée');

  /* recalcul après un changement de surface : rien de retouché n'est écrasé */
  {let k=0;const nid=()=>'r'+(++k);
   const base=C.genererLignes(D,'ga',{S:100,Sg:0,P:66},nid);
   base.find(x=>x.code==='T_PLAF').qte=95;                       // quantité retapée
   base.find(x=>x.code==='T_CLOISON').pu=33;                     // prix saisi
   base.push(C.nouvelleLigne(D,'T_GARAGE',12,nid));              // article ajouté à la main
   const R=C.rebaser(D,base,'ga',{S:120,Sg:0,P:80},nid), r=c=>R.find(x=>x.code===c);
   chk(r('T_PLAF').qte===95&&r('T_CLOISON').pu===33&&r('T_GARAGE').qte===12,'quantité retapée, prix saisi et article ajouté : gardés');
   chk(r('T_CARREAU').qte===72&&r('T_CARREAU').qte0===72,'ligne non retouchée : suit la nouvelle surface (60 → 72 m²)');
   chk(R.length===base.length,'aucune ligne perdue ni dupliquée');
   const R2=C.rebaser(D,base,'gb',{S:150,Sg:30,P:100},nid);
   chk(R2.some(x=>x.code==='T_GARAGE'&&x.qte===12)&&R2.filter(x=>x.code==='T_GARAGE').length===1,'changement de gabarit : l\'article ajouté à la main reste, sans doublon');}

  /* ligne ajoutée à la main */
  chk(C.nouvelleLigne(D,'T_PLAF',12.345,id).qte===12.35&&C.nouvelleLigne(D,'T_PLAF','',id).qte===1&&C.nouvelleLigne(D,'ZZZ',1,id)===null,'ligne ajoutée : quantité arrondie, 1 par défaut, null si l\'article n\'existe pas');

  /* catalogue lu dans la table */
  /* les questions d'affinage */
  const sans={...D,questions:undefined};
  chk(C.questionsDe(D).length===2&&C.questionsDe(sans).length===0&&C.questionsDe({questions:[{id:'x',choix:[{id:'a'}]},null,{choix:[]}]}).length===0,'questions : lues si valides, ignorées si absentes ou mal formées (au moins 2 choix)');
  chk(C.nbReponses(D,{})===0&&C.nbReponses(D,{fond:'radier',cloisons:'zzz'})===1,'une réponse inconnue vaut « comme la référence »');
  let k=0;const idk=()=>'k'+(++k);
  const base=C.genererLignes(D,'ga',{S:100,Sg:0,P:66},idk), memes=C.genererLignes(D,'ga',{S:100,Sg:0,P:66},idk,{fond:'ref'});
  chk(JSON.stringify(base.map(l=>[l.code,l.qte]))===JSON.stringify(memes.map(l=>[l.code,l.qte])),'sans réponse (ou « référence ») : les lignes du gabarit, inchangées');
  const rad=C.genererLignes(D,'ga',{S:120,Sg:0,P:80},idk,{fond:'radier'});
  chk(!rad.some(l=>l.code==='T_SEMELLE')&&rad.find(l=>l.code==='T_RADIER').qte===120,'radier : les semelles partent, le radier suit la surface (120 m²)');
  chk(rad.find(l=>l.code==='T_AGGLO')&&rad.length===base.length,'les autres lignes ne bougent pas');
  const ep=C.genererLignes(D,'ga',{S:100,Sg:0,P:66},idk,{cloisons:'epaisses'});
  chk(!ep.some(l=>l.code==='T_CLOISON')&&ep.find(l=>l.code==='T_CLOISON_EPAISSE').qte===70,'cloisons épaisses : 0,7 × surface = 70 m²');
  const sp=C.genererLignes(D,'ga',{S:100,Sg:0,P:66},idk,{cloisons:'special'});
  chk(sp.find(l=>l.code==='T_INCONNU').qte===2,'article en unités : quantité entière (2)');
  const qR2=C.chiffrer(D,sp,{});
  chk(qR2.aChiffrer===1&&qR2.lots.flatMap(x=>x.lignes).find(l=>l.code==='T_INCONNU').pu===0,'article sans prix : compté à 0 € et signalé (1 ligne à chiffrer), jamais de prix inventé');
  const qR3=C.chiffrer(D,sp.map(l=>l.code==='T_INCONNU'?{...l,pu:100}:l),{});
  chk(qR3.aChiffrer===0&&Math.abs(qR3.artisanHT-qR2.artisanHT-200)<0.01,'prix saisi sur la ligne à chiffrer : plus de signalement, +200 € (2 × 100)');
  // changer de réponse après coup : rebaser garde les retouches
  const qa0=C.genererLignes(D,'ga',{S:100,Sg:0,P:66},idk);
  qa0.find(l=>l.code==='T_PLAF').qte=95;                       // retouchée à la main
  const qa1=C.rebaser(D,qa0,'ga',{S:100,Sg:0,P:66},idk,{fond:'radier',cloisons:'epaisses'});
  chk(qa1.find(l=>l.code==='T_PLAF').qte===95&&!qa1.some(l=>l.code==='T_SEMELLE'||l.code==='T_CLOISON')&&qa1.some(l=>l.code==='T_RADIER')&&qa1.some(l=>l.code==='T_CLOISON_EPAISSE'),'changement de réponses : lignes remplacées, quantité retapée gardée');
  const qa2=C.rebaser(D,qa1,'ga',{S:100,Sg:0,P:66},idk,{});
  chk(qa2.some(l=>l.code==='T_SEMELLE')&&!qa2.some(l=>l.code==='T_RADIER')&&qa2.find(l=>l.code==='T_PLAF').qte===95&&qa2.length===base.length,'retour à « référence » : les lignes d\'origine reviennent, sans doublon');

  chk(C.catalogueValide(D)&&!C.catalogueValide(null)&&!C.catalogueValide({})&&!C.catalogueValide({v:2,articles:{},gabarits:[1]}),'catalogue valide, absent, vide ou d\'une autre version : le bloc reste caché');
  fin();
})();
