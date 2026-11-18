/* Relevé de visite — la fourchette de prix pendant la visite
   (releve/budget.js) : quantités tirées du plan, prix de la table, gammes,
   ajustements, comparaison à l'enveloppe. Prix FICTIFS, posés par le test :
   la table livrée n'en contient aucun. */
const {verif}=require('./harness');
const {chk,fin}=verif();
(async()=>{
  const B=await import('../releve/budget.js');
  chk(B.FOURCHETTES_MODELE.length>=15&&B.FOURCHETTES_MODELE.every(f=>Object.keys(f.prix).length===0),'table livrée : les postes et leurs unités, aucun prix');
  chk(B.FOURCHETTES_MODELE.every(f=>B.UNITES[f.unite]),'chaque poste livré a une unité connue');
  chk(new Set(B.FOURCHETTES_MODELE.map(f=>f.id)).size===B.FOURCHETTES_MODELE.length,'identifiants des postes uniques');

  const pieces=[{id:'p1',nom:'Cuisine',sol:12.5,perimetre:14.2,murs:30.1,portes:1,fenetres:1},
                {id:'p2',nom:'Séjour',sol:25,perimetre:20,murs:42.4,portes:2,fenetres:3}];
  chk(B.quantitePlan('m2_sol',pieces,[])===37.5,'m² de sol : toute la maison si aucune pièce choisie');
  chk(B.quantitePlan('m2_murs',pieces,['p1'])===30.1,'m² de murs : seulement les pièces choisies');
  chk(B.quantitePlan('u_fenetre',pieces,[])===4&&B.quantitePlan('u_piece',pieces,[])===2,'fenêtres et pièces comptées');
  chk(B.quantitePlan('forfait',[],[])===1,'forfait : 1, même sans plan');
  chk(B.quantitePlan('m2_saisi',pieces,[])===null&&B.quantitePlan('m2_sol',[],[])===null,'à saisir, ou pas de plan : pas de quantité inventée');

  /* une table avec des prix fictifs */
  const F=B.FOURCHETTES_MODELE.map(f=>({...f}));
  const fix=(id,g,min,max)=>{const f=F.find(x=>x.id===id);f.prix={...f.prix,[g]:{min,max}}};
  fix('peinture-murs','standard',20,30);fix('peinture-murs','premium',30,45);fix('cuisine','standard',8000,12000);
  const budget={lignes:[
    {id:'l1',fourchetteId:'peinture-murs',gamme:'standard',pieces:['p1']},
    {id:'l2',fourchetteId:'cuisine',gamme:'standard'},
    {id:'l3',fourchetteId:'sol-carrelage',gamme:'standard'}],ajust:{}};
  let r=B.calculerBudget(budget,F,pieces);
  chk(r.lignes[0].quantite===30.1&&r.lignes[0].source==='plan'&&r.lignes[0].min===602&&Math.round(r.lignes[0].max)===903,'peinture de la cuisine : 30,1 m² × 20 à 30 €');
  chk(r.lignes[1].quantite===1&&r.lignes[1].source==='forfait'&&r.lignes[1].max===12000,'cuisine au forfait');
  chk(r.lignes[2].manque==='prix'&&r.lignes[2].min===0,'poste sans prix saisi : signalé, compté zéro, jamais inventé');
  chk(r.manques===1&&!r.complet,'le total dit qu’un poste manque de prix');
  chk(r.total.min===8600&&r.total.max===12900,'total arrondi à la centaine : de 8 600 à 12 900 €');

  budget.lignes[0].gamme='premium';
  chk(B.calculerBudget(budget,F,pieces).lignes[0].max>r.lignes[0].max,'la gamme premium change la fourchette');
  budget.lignes[0].quantite='35,5';
  chk(B.calculerBudget(budget,F,pieces).lignes[0].quantite===35.5&&B.calculerBudget(budget,F,pieces).lignes[0].source==='saisie','une quantité saisie l’emporte sur le plan (virgule acceptée)');

  budget.ajust={etat:0.10,acces:0.10,imprevus:0.5};
  r=B.calculerBudget(budget,F,pieces);
  chk(r.majoration===0.4,'ajustements additionnés ; imprévus plafonnés à 20 %');
  chk(B.calculerBudget({lignes:[]},F,pieces).total.max===0,'aucun poste : 0');

  chk(B.verdictEnveloppe({min:8000,max:12000},15000).niveau==='dans','sous l’enveloppe : dans le budget');
  chk(B.verdictEnveloppe({min:8000,max:12000},10000).niveau==='limite','enveloppe entre le mini et le maxi : à la limite');
  chk(B.verdictEnveloppe({min:8000,max:12000},5000).niveau==='hors','sous le mini : hors budget');
  chk(B.verdictEnveloppe({min:8000,max:12000},null)===null&&B.verdictEnveloppe({min:0,max:0},10000)===null,'sans enveloppe ou sans total : pas de voyant');

  const s=B.postesSuggeres(['Peinture','Cuisine'],F,[{fourchetteId:'cuisine'}]);
  chk(s.map(f=>f.id).join()==='cuisine-meubles,peinture-murs,peinture-plafonds','postes proposés d’après les travaux choisis, sans ceux déjà pris');
  chk(B.prixValide({min:'30',max:'20'})===null&&B.prixValide({min:'',max:'20'})===null&&B.prixValide({min:'10',max:'20'}).max===20,'un prix mini > maxi ou incomplet n’est pas utilisé');

  const a=[{id:'x',libelle:'A',maj:'2026-11-18T10:00'},{id:'y',libelle:'Y',maj:'2026-11-18T10:00'}];
  const b=[{id:'x',libelle:'A modifié',maj:'2026-11-18T11:00'},{id:'y',supprime:true,maj:'2026-11-18T09:00'},{id:'z',libelle:'Z',maj:'2026-11-18T11:00'}];
  const fz=B.fusionnerFourchettes(a,b);
  chk(fz.find(l=>l.id==='x').libelle==='A modifié'&&fz.find(l=>l.id==='y').supprime&&fz.some(l=>l.id==='z'),'table retouchée par deux personnes : le plus récent par ligne, suppression gardée, ajout gardé');
  chk(B.formatPlage({min:8600,max:12900}).replace(/\s/g,' ')==='de 8 600 à 12 900 € TTC','affichage « de X à Y € TTC »');

  /* ---------- l'estimation R1 par surfaces globales ---------- */
  chk(B.OUVRAGES.length>=15&&B.OUVRAGES.every(o=>B.prixNiveau(o.prix,'standard')),'ouvrages livrés avec des prix de départ cohérents (mini ≤ médian ≤ maxi)');
  chk(new Set(B.OUVRAGES.map(o=>o.id)).size===B.OUVRAGES.length,'identifiants des ouvrages uniques');
  const cu=B.OUVRAGES.find(o=>o.id==='cuisine');
  chk(JSON.stringify(B.prixNiveau({min:500,med:900,max:1500},'eco'))==='{"min":500,"max":900}'&&B.prixNiveau({min:500,med:900,max:1500},'haut').min===900,'gammes : éco du mini au médian, haut de gamme du médian au maxi');
  const st=B.prixNiveau({min:500,med:900,max:1500},'standard');chk(st.min===765&&st.max===1035,'standard : autour du médian (± 15 %)');
  chk(B.prixNiveau({min:900,med:500,max:1500},'standard')===null,'prix incohérent : pas utilisé');
  const plan=[{id:'p1',nom:'Cuisine',sol:12.5,fenetres:1},{id:'p2',nom:'Séjour',sol:25,fenetres:3},{id:'p3',nom:'Chambre',sol:11,etage:1,fenetres:1}];
  chk(B.surfaceAuto(cu,plan).valeur===12.5&&B.surfaceAuto(cu,plan).source==='plan','cuisine : la surface de la cuisine du plan');
  chk(B.surfaceAuto(cu,[]).valeur===10&&B.surfaceAuto(cu,[]).source==='defaut','sans plan : valeur courante (10 m²)');
  chk(B.surfaceAuto(B.OUVRAGES.find(o=>o.id==='electricite'),plan).valeur===48.5,'électricité : surface habitable du plan');
  chk(B.surfaceAuto(B.OUVRAGES.find(o=>o.id==='fenetres'),plan).valeur===5,'fenêtres : comptées sur le plan');
  chk(B.surfaceAuto(B.OUVRAGES.find(o=>o.id==='toiture'),plan).valeur===Math.round(37.5*1.3),'toiture : 1,3 × l’emprise du rez-de-chaussée');
  const r1=B.calculerOuvrage({id:'c',ouvrageId:'cuisine',surface:null,niveau:'haut'},B.OUVRAGES,plan);
  chk(r1.surface===12.5&&r1.min===900*12.5&&r1.max===1500*12.5,'cuisine haut de gamme : 12,5 m² × 900 à 1 500 €');
  chk(B.calculerOuvrage({id:'c',ouvrageId:'cuisine',surface:'14,5',niveau:'eco'},B.OUVRAGES,plan).surface===14.5,'surface réglée à la main (virgule acceptée) : elle l’emporte sur le plan');
  chk(B.calculerOuvrage({id:'p',ouvrageId:'pac',surface:50},B.OUVRAGES,plan).surface===1,'forfait : 1, quelle que soit la surface');
  /* la table de CP remplace les repères */
  const T=B.tableOuvrages([{id:'cuisine',prix:{min:600,med:1000,max:1600}},{id:'sdb',prix:{min:9,med:1,max:2}},{id:'sols',supprime:true,prix:{min:1,med:2,max:3}}]);
  chk(T.find(o=>o.id==='cuisine').prix.med===1000&&T.find(o=>o.id==='cuisine').repere==='cp','prix de CP : ils remplacent le repère du marché');
  chk(T.find(o=>o.id==='sdb').prix.med===1200&&T.find(o=>o.id==='sols').prix.med===80,'prix enregistré incohérent ou retiré : le repère reste');
  /* propositions */
  const sg=B.ouvragesSuggeres(['Cuisine','Peinture'],[],B.OUVRAGES,[]).map(o=>o.id);
  chk(sg.join()==='cuisine,peinture','cuisine et peinture cochées : ces deux travaux proposés');
  const sg2=B.ouvragesSuggeres(['Cuisine','Chauffage','Extension'],['Rénovation importante'],B.OUVRAGES,[]).map(o=>o.id);
  chk(sg2.includes('reno-complete')&&!sg2.includes('cuisine')&&sg2.includes('pac')&&sg2.includes('extension'),'rénovation importante : la rénovation complète remplace les postes intérieurs, pas la PAC ni l’extension');
  const sg3=B.ouvragesSuggeres([],['Rénovation énergétique'],B.OUVRAGES,[{ouvrageId:'pac'}]).map(o=>o.id);
  chk(sg3.join()==='combles,fenetres','rénovation énergétique : combles et fenêtres (PAC déjà prise ; l’ITE seulement si la façade est cochée)');
  /* le total : ouvrages + postes détaillés, mêmes ajustements, à la centaine */
  const est=B.calculerEstimation({ouvrages:[{id:'a',ouvrageId:'cuisine',niveau:'haut'}],lignes:[{id:'l',fourchetteId:'peinture-murs',gamme:'standard',pieces:['p1']}],ajust:{etat:0.1}},B.OUVRAGES,
    [{id:'p1',nom:'Cuisine',sol:12.5,murs:30.1}],F);
  chk(est.total.min===Math.round((11250+602)*1.1/100)*100&&est.total.max===Math.round((18750+903)*1.1/100)*100,'total : ouvrages + poste détaillé, ajustement +10 %, à la centaine');
  chk(B.calculerEstimation({},B.OUVRAGES,[],[]).vide===true,'rien de choisi : estimation vide');
  fin();
})();
