/* Terrasses et aménagements extérieurs : un ouvrage unique, compté une fois
   dans le budget quelle que soit la rubrique qui l'affiche ; statut et
   financement distincts ; l'inconnu n'est jamais zéro ; points à vérifier
   sans verdict de conformité ; Word, fiches par lot et écran. */
const React=require('react');const TR=require('react-test-renderer');
const {charger,verif,texteInst,norm}=require('./harness');
const M=charger(['mapOuvrageNeuf','mapOuvrages','mapBudgetOuvrages','mapAlertesOuvrage','mapEtatOuvrages','mapEtatRubrique','MAP_RUBRIQUES',
  'mapOuvragesDuLot','genererMapDocx','genererFichesLots','zipEntree','lignesDocumentXml','OuvragesMap','mapPointsATraiter','EMPTY']);
const {chk,fin}=verif();
const R=id=>M.MAP_RUBRIQUES.find(r=>r.id===id);

const T1={...M.mapOuvrageNeuf('terrasse'),id:'ouv_t1',repere:'T1',localisation:'Séjour, côté jardin',longueur:'5',largeur:'4',surface:'20',
  solution:'Dallage béton sur terre-plein',niveauRelatif:'−2 cm sous seuil',pente:'1,5 %',exutoire:'Puisard',statut:'inclus',financement:'supplement',montantTTC:'3 200',
  etudes:{fondations:'Selon étude G2',epaisseur:'12 cm',armatures:'ST25C',portees:'',liaisons:''}};
const A1={...M.mapOuvrageNeuf('allee'),id:'ouv_a1',localisation:'Portail → entrée',surface:'30',materiau:'Gravier',statut:'inclus',financement:'marche'};
const C1={...M.mapOuvrageNeuf('cloture'),id:'ouv_c1',quantite:'40',statut:'option',financement:'supplement',montantTTC:''};
const P1={...M.mapOuvrageNeuf('portail'),id:'ouv_p1',statut:'option',financement:'supplement',montantTTC:'1 450,50'};
const G1={...M.mapOuvrageNeuf('engazonnement'),id:'ouv_g1',statut:'moa'};
const N1={...M.mapOuvrageNeuf('irve'),id:'ouv_n1',statut:'non_retenu',montantTTC:'900'};
const m={terrasseBeton:'Oui',ouvrages:[T1,A1,C1,P1,G1,N1,{...T1}]};

chk(M.mapOuvrageNeuf('terrasse').id!==M.mapOuvrageNeuf('terrasse').id&&/^ouv_/.test(M.mapOuvrageNeuf('allee').id),'chaque ouvrage a son identifiant stable');
chk(M.mapOuvrages(m).length===6,'un identifiant en double n’est gardé qu’une fois');
const b=M.mapBudgetOuvrages(m);
chk(b.supplementsTTC===3200,'terrasse : supplément compté une seule fois (3 200 €), même présente deux fois');
chk(b.optionsTTC===1450.5&&b.options.length===1,'option chiffrée : 1 450,50 €');
chk(b.aChiffrer.map(o=>o.id).join()==='ouv_c1','option sans montant : à chiffrer, pas zéro');
chk(b.comprisMarche.map(o=>o.id).join()==='ouv_a1','allée comprise dans le marché : rien ne s’ajoute');
chk(b.moa.length===1&&b.nonRetenus.length===1,'réservé au MOA et non retenu : hors budget (même avec un montant saisi)');

const e3=M.mapEtatRubrique(R('3'),m,M.EMPTY), e10=M.mapEtatRubrique(R('10'),m,M.EMPTY);
e3.budgetTexte=norm(e3.budgetTexte);e10.budgetTexte=norm(e10.budgetTexte);
chk(/3 200,00 €/.test(e3.budgetTexte)&&!/1 450/.test(e3.budgetTexte),'rubrique 3 : le budget de ses terrasses seulement');
chk(/3 200,00 €/.test(e10.budgetTexte)&&/1 450,50 €/.test(e10.budgetTexte)&&/1 à chiffrer/.test(e10.budgetTexte),'rubrique 10 : tous les ouvrages, la terrasse comprise une fois');
chk(e10.renseignes===6,'rubrique 10 : les ouvrages comptent comme renseignés');
chk(!e3.alertes.some(a=>/Pente/.test(a.msg)),'terrasse complète : pas d’alerte d’écoulement');
const alC=M.mapAlertesOuvrage(C1);
chk(alC.some(a=>/autorisation d’urbanisme/.test(a))&&alC.includes('À chiffrer.'),'clôture : à vérifier au regard de l’autorisation, et à chiffrer');
chk(!alC.some(a=>/conforme/i.test(a)),'aucune alerte n’annonce une conformité');
const tNue=M.mapOuvrageNeuf('terrasse');
const alT=M.mapAlertesOuvrage({...tNue,solution:'Plancher béton porté sur vide sanitaire'});
chk(alT.some(a=>/Pente et destination des eaux à confirmer/.test(a))&&alT.some(a=>/selon les études/.test(a))&&alT.some(a=>/Niveau par rapport au sol intérieur/.test(a)),
  'terrasse incomplète : eaux, niveau, études signalés — rien n’est dimensionné');
chk(M.mapEtatOuvrages('3',{terrasseBeton:'Oui',ouvrages:[]}).alertes.some(a=>/décrire/.test(a.msg)),'« Oui » sans terrasse décrite : alerte');
chk(M.mapEtatOuvrages('3',{terrasseBeton:'Non',ouvrages:[T1]}).alertes.some(a=>/cohérence/.test(a.msg)),'« Non » avec une terrasse retenue : alerte de cohérence');
chk(M.mapPointsATraiter(m,M.EMPTY).some(p=>p.rubrique==='10'&&p.k==='ouvrage:ouv_c1'),'points à traiter : l’ouvrage en cause, pour y aller');

chk(M.mapOuvragesDuLot(m,'Gros œuvre').map(o=>o.id).join()==='ouv_t1','lot gros œuvre : la terrasse (une fois)');
chk(M.mapOuvragesDuLot(m,'VRD — terrassement').map(o=>o.id).sort().join()==='ouv_a1,ouv_c1,ouv_p1','lot VRD : allée, clôture, portail — pas le gazon réservé au MOA');

const data={...M.EMPTY,artisans:[{id:'a1',nom:'Maçonnerie Durand'}],marches:[{id:'m1',chantierId:'c1',artisanId:'a1',lot:'Gros œuvre'}],
  chantiers:[{id:'c1',nom:'Maison Exemple',client:'M. Exemple',adresse:'1 rue du Test',map:m}]};
const ch=data.chantiers[0];
const texteDocx=async o=>norm(String(M.lignesDocumentXml(new TextDecoder().decode(await M.zipEntree(o.buffer.slice(o.byteOffset,o.byteOffset+o.byteLength),'word/document.xml')))));
(async()=>{
  const t=await texteDocx(await M.genererMapDocx(ch,data));
  chk(/Terrasse béton à prévoir/.test(t)&&/Terrasse T1/.test(t)&&/Dallage béton sur terre-plein/.test(t)&&/pente : 1,5 % \(à confirmer\)/.test(t),'Word : la terrasse dans le gros-œuvre');
  chk(/10\. Aménagements extérieurs/.test(t)&&/Allée/.test(t)&&/compris dans le marché/.test(t)&&/12\. Validation d’exécution/.test(t),'Word : rubrique 10, validation renumérotée 12');
  chk((t.match(/T1 — Terrasse/g)||[]).length===1,'Word : la terrasse listée une seule fois dans les extérieurs');
  const {fiches}=await M.genererFichesLots(ch,data);
  const tGO=await texteDocx(fiches[0].octets);
  chk(/Terrasses et aménagements extérieurs/.test(tGO)&&/T1 — Terrasse/.test(tGO)&&!/Portail/.test(tGO),'fiche du gros œuvre : sa terrasse, pas le portail');

  let enreg=null,tr;
  const mm={terrasseBeton:'Oui',ouvrages:[]};
  TR.act(()=>{tr=TR.create(React.createElement(M.OuvragesMap,{data,ch,m:mm,set:p=>{enreg=p},filtre:o=>o.famille==='terrasse',titreAjout:'+ Terrasse'}))});
  const bouton=tr.root.findAll(n=>n.type==='button').find(n=>/\+ Terrasse/.test(texteInst(n)));
  TR.act(()=>{bouton.props.onClick()});
  chk(enreg&&enreg.ouvrages.length===1&&enreg.ouvrages[0].famille==='terrasse'&&enreg.ouvrages[0].statut==='a_decider'&&enreg.ouvrages[0].financement==='a_chiffrer',
    'écran : « + Terrasse » crée une terrasse à décider, à chiffrer');
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
