/* Fiche chantier › encart « Budget et avenants ». Le contrat initial reste la
   référence ; seuls les avenants validés actualisent le budget ; le total
   engagé ne suit que les marchés, commandes et honoraires enregistrés, et une
   prestation reportée dans son marché n'y compte qu'une fois. Calculs en
   centimes, TVA ligne par ligne. Données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['Fiche','EMPTY','avCalc','avLigneCalc','avenantsSynthese','budgetActualise','bilanBudget','contratVentilation',
  'avenantNumeroClient','nouvelAvenantClient','avenantDupliquer','avenantCorrectif','avenantModifiable','avenantValidable',
  'avenantValider','avenantChangerStatut','reporterAvenantMarches','avLignesAReporter','honoAmount','coutOperation','centimes']);
const {chk,fin}=verif();
const rt=o=>JSON.parse(JSON.stringify(o));

const CH={id:'c1',nom:'Maison fictive',client:'Client fictif',adresse:'Commune fictive',budgetClientTTC:180000,tva:20,
  honorairesMontant:20000,statut:'travaux'};
const MS=[{id:'m1',chantierId:'c1',lot:'Gros œuvre',artisanId:'a1',montantHT:100000,tva:20,statut:'signe',factures:[]},
          {id:'m2',chantierId:'c1',lot:'Électricité',artisanId:'a2',montantHT:20000,tva:10,statut:'signe',factures:[]}];
const ART=[{id:'a1',nom:'Maçon fictif'},{id:'a2',nom:'Électricien fictif'}];
const ligne=(o)=>({id:o.id||'l'+Math.random().toString(36).slice(2,7),marcheId:'',lot:'',artisanId:'',designation:'',qte:1,unite:'',puHT:0,taux:20,sens:1,...o});
const valide=(a,date)=>M.avenantValider(a,{date:date||'2026-10-01',reference:'Avenant signé'});

/* 1. sans avenant : le budget est le contrat initial, le disponible l'écart à l'engagé */
let B=M.bilanBudget(CH,MS,[]);
chk(B.initial===18000000&&B.actualise===18000000,'sans avenant, budget actualisé = contrat initial (180 000,00 €)');
chk(B.engage===(120000+22000+24000)*100,'total engagé : marchés 120 000 + 22 000 TTC, honoraires 24 000 TTC');
chk(B.disponible===1400000,'budget disponible = budget actualisé − total engagé (14 000,00 €)');

/* 2. l'exemple : 2 000 € HT de travaux (400 € de TVA), 200 € HT d'honoraires (40 € de TVA) */
let a1=M.nouvelAvenantClient(CH,{objet:'Prise extérieure',lignes:[ligne({id:'x1',marcheId:'m1',qte:1,puHT:2000,taux:20})],
  hono:{mode:'forfait',forfaitHT:200,taux:20,sens:1,exclues:[]}});
let c=M.avCalc(a1,CH);
chk(c.trav.ht===200000&&c.trav.tva===40000&&c.hono.ht===20000&&c.hono.tva===4000&&c.total.ttc===264000,'avenant : 2 400 + 240 = 2 640,00 € TTC');
chk(a1.numero==='AV-001'&&a1.statut==='brouillon','premier avenant : AV-001, en brouillon');
let ch={...CH,avenantsClient:[a1]};
chk(M.budgetActualise(ch)===180000,'un brouillon ne touche pas le budget');
chk(M.avenantsSynthese(ch).attente.ttc===264000,'il compte dans le cumul en attente');
ch={...CH,avenantsClient:[valide(a1)]};
chk(M.budgetActualise(ch)===182640,'validé : budget actualisé 180 000 + 2 640 = 182 640,00 €');
chk(ch.avenantsClient[0].accord.date==='2026-10-01'&&!M.avenantModifiable(ch.avenantsClient[0]),'validé : accord daté, plus modifiable');
chk(M.budgetActualise(rt(ch))===182640,'rechargement (aller-retour JSON) : même budget');
chk(M.bilanBudget(ch,MS,[]).engage===B.engage,'la validation ne change pas le total engagé tant que rien n’est reporté');

/* 3. pourcentage : l'assiette se choisit, se recalcule, et ne compte jamais les honoraires */
let a2=M.nouvelAvenantClient(ch,{lignes:[ligne({id:'p1',qte:2,puHT:500,taux:20}),ligne({id:'p2',qte:1,puHT:300,taux:10})],
  hono:{mode:'pourcentage',pct:10,taux:20,exclues:['p2']}});
c=M.avCalc(a2,ch);
chk(a2.numero==='AV-002','numérotation : AV-002');
chk(c.hono.assiette===100000&&c.hono.nAssiette===1&&c.hono.ht===10000,'10 % d’une assiette de 1 000 € HT (la ligne exclue n’y est pas) = 100 € HT');
chk(c.trav.tva===20000+3000,'plusieurs taux dans le même avenant : TVA 20 % et 10 % ligne par ligne');
a2={...a2,lignes:a2.lignes.map(l=>l.id==='p1'?{...l,qte:3}:l)};
chk(M.avCalc(a2,ch).hono.ht===15000,'une prestation qui change recalcule l’assiette et les honoraires');

/* 4. moins-value : le sens se choisit ; un « − » tapé en plus ne retourne pas la ligne */
const mv=M.nouvelAvenantClient(ch,{lignes:[ligne({qte:-2,puHT:-250,taux:20,sens:-1})],hono:{mode:'aucun'}});
c=M.avCalc(mv,ch);
chk(c.total.ttc===-60000&&c.hono.ht===0,'moins-value de 2 × 250 € HT : − 600,00 € TTC, sans honoraires');
const chMv={...ch,avenantsClient:[...ch.avenantsClient,valide(mv)]};
chk(M.budgetActualise(chMv)===182040,'une moins-value validée diminue le budget (182 640 − 600)');

/* 5. statuts : refusé et en attente restent hors budget */
const ref=M.avenantChangerStatut(M.avenantChangerStatut(a2,'a_valider'),'refuse');
const chR={...ch,avenantsClient:[...ch.avenantsClient,ref]};
chk(M.budgetActualise(chR)===182640&&M.avenantsSynthese(chR).refuse.n===1,'un avenant refusé ne compte pas');
chk(ref.journal.length===3&&/Refusé/.test(ref.journal[2].quoi),'l’historique garde chaque changement de statut');
chk(!M.avenantValidable(M.nouvelAvenantClient(ch),ch),'un avenant vide ne se valide pas');

/* 6. dupliquer et corriger */
const du=M.avenantDupliquer(ch,a2);
chk(du.statut==='brouillon'&&du.lignes.length===2&&du.lignes.every(l=>!['p1','p2'].includes(l.id))&&du.hono.exclues.length===1
  &&du.hono.exclues[0]===du.lignes[1].id,'dupliquer : nouveau brouillon, nouvelles lignes, assiette reportée');
const co=M.avenantCorrectif(ch,ch.avenantsClient[0]);
chk(co.corrige===ch.avenantsClient[0].id&&/Correctif de AV-001/.test(co.objet),'avenant correctif lié à l’original');

/* 7. report au marché : une seule fois, et jamais par l'avenant lui-même */
let data={...M.EMPTY,chantiers:[ch],artisans:ART,marches:MS,commandes:[]};
chk(M.avLignesAReporter(ch.avenantsClient[0]).length===1,'la ligne validée rattachée au gros œuvre est à reporter');
let d2=M.reporterAvenantMarches(data,'c1',ch.avenantsClient[0].id);
let m1=d2.marches.find(m=>m.id==='m1');
chk(m1.montantHT===102000&&m1.avenantsClientReportes.length===1,'reportée : le marché passe à 102 000 € HT, avec la trace de la ligne');
let ch2=d2.chantiers[0];
chk(!!ch2.avenantsClient[0].lignes[0].reporteLe,'la ligne garde la date du report');
const d3=M.reporterAvenantMarches(d2,'c1',ch2.avenantsClient[0].id);
chk(d3.marches.find(m=>m.id==='m1').montantHT===102000,'un second report ne double rien');
const B2=M.bilanBudget(ch2,d2.marches.filter(m=>m.chantierId==='c1'),[]);
chk(B2.engage===B.engage+240000,'engagé : + 2 400,00 € TTC une seule fois');
chk(B2.actualise===18264000&&B2.disponible===B2.actualise-B2.engage,'budget disponible recalculé sans double comptage');

/* 8. honoraires : comptés dans les honoraires du chantier une fois ajoutés, pas avant */
chk(M.honoAmount(ch2)===20000,'honoraires de l’avenant pas encore ajoutés : honoraires du chantier inchangés');
const ch3={...ch2,avenantsClient:ch2.avenantsClient.map(a=>({...a,hono:{...a.hono,reporteLe:'2026-10-02'}}))};
chk(M.honoAmount(ch3)===20200,'ajoutés : 20 000 + 200 € HT, une fois');

/* 9. ventilation du contrat : à renseigner, cohérente, ou incohérente */
let V=M.contratVentilation(CH);
chk(V.etat==='vide'&&V.manque.length===2,'sans ventilation : « à renseigner », jamais tirée des engagements');
V=M.contratVentilation({...CH,contratInitial:{postes:[{id:'t',type:'travaux',ht:130000,taux:20},{id:'h',type:'honoraires',ht:20000,taux:20}]}});
chk(V.etat==='ok'&&V.tot.ht===15000000&&V.ecart===0,'ventilation 130 000 + 20 000 HT à 20 % = 180 000 TTC : cohérente');
V=M.contratVentilation({...CH,contratInitial:{postes:[{id:'t',type:'travaux',ht:130000,taux:20},{id:'h',type:'honoraires',ht:19000,taux:20}]}});
chk(V.etat==='incoherent'&&V.ecart===120000,'ventilation qui ne retombe pas sur le total : écart signalé (1 200,00 €)');
V=M.contratVentilation({...CH,contratInitial:{postes:[{id:'t',type:'travaux',ht:130000,taux:20}]}});
chk(V.etat==='incomplet'&&V.manque.length===1,'il manque les honoraires : incomplète');

/* 10. arrondis : au centime, symétriques */
chk(M.centimes(1.005)===101&&M.centimes(-1.005)===-101&&M.centimes(3*19.99)===5997,'arrondi au centime, symétrique');
const r=M.avLigneCalc(ligne({qte:3,puHT:19.99,taux:5.5}),CH);
chk(r.ht===5997&&r.tva===330&&r.ttc===6327,'3 × 19,99 € à 5,5 % : 59,97 + 3,30 = 63,27 €');

/* 11. l'encart : la synthèse, le tableau, « Budget disponible » et jamais « Marge » */
const rendre=(d,id)=>{let tr;const el=()=>React.createElement(M.Fiche,{data:d.v,ch:d.v.chantiers.find(x=>x.id===id),
  save:n=>{d.v=n;TR.act(()=>tr.update(el()))},back(){}});TR.act(()=>{tr=TR.create(el())});return tr};
const texte=tr=>norm(texteInst(tr.toJSON()));
let etat={v:{...M.EMPTY,chantiers:[CH],artisans:ART,marches:MS,commandes:[]}};
let tr=rendre(etat,'c1');
let t=texte(tr);
chk(/Contrat initial : 180 000,00 € TTC/.test(t)&&/Avenants validés : 0,00 € TTC/.test(t)&&/Budget actualisé : 180 000,00 € TTC/.test(t),'ligne de synthèse');
chk(/Total engagé : 166 000,00 € TTC/.test(t)&&/Budget disponible : 14 000,00 € TTC/.test(t),'engagé et budget disponible');
chk(!/Marge/.test(t),'le mot « Marge » a disparu');
chk(/Travaux artisansÀ renseigner/.test(t)&&/Total du contrat initialÀ renseignerÀ renseigner180 000,00 €/.test(t),'tableau : ventilation « À renseigner », total du contrat');

const bouton=re=>tr.root.findAll(n=>n.type==='button'&&re.test(norm(texteInst(n))))[0];
const champ=(pred)=>tr.root.findAll(n=>n.type==='input'&&pred(n.props))[0];
const choix=(label)=>tr.root.findAll(n=>n.type==='select'&&n.props['aria-label']===label)[0];

/* la ventilation du contrat se recopie du contrat, à la main */
TR.act(()=>bouton(/Renseigner la ventilation du contrat/).props.onClick());
let hts=tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Montant HT');
chk(hts.length===2,'ventilation : travaux et honoraires proposés, vides');
TR.act(()=>hts[0].props.onChange({target:{value:'130000'}}));
TR.act(()=>bouton(/Reprendre les honoraires de la fiche/).props.onClick());
TR.act(()=>bouton(/^Enregistrer$/).props.onClick());
t=texte(tr);
chk(etat.v.chantiers[0].contratInitial.postes.length===2,'ventilation enregistrée sur le chantier');
chk(/Travaux artisans \(TVA 20 %\)130 000,00 €26 000,00 €156 000,00 €/.test(t)&&/Total du contrat initial150 000,00 €30 000,00 €180 000,00 €/.test(t),
  'tableau : la ventilation retombe sur le contrat (150 000 HT + 30 000 TVA)');
chk(!/Ventilation du contrat à renseigner/.test(t),'plus d’alerte de ventilation');
TR.act(()=>tr.unmount());
etat={v:{...M.EMPTY,chantiers:[CH],artisans:ART,marches:MS,commandes:[]}};tr=rendre(etat,'c1');

/* + Ajouter un avenant, saisie, enregistrement, validation */
TR.act(()=>bouton(/\+ Ajouter un avenant/).props.onClick());
TR.act(()=>champ(p=>/Prise extérieure/.test(p.placeholder||'')).props.onChange({target:{value:'Plus-value fictive'}}));
TR.act(()=>choix('Lot').props.onChange({target:{value:'m2'}}));
TR.act(()=>champ(p=>p['aria-label']==='Désignation').props.onChange({target:{value:'Prises supplémentaires'}}));
TR.act(()=>champ(p=>p['aria-label']==='Quantité').props.onChange({target:{value:'4'}}));
TR.act(()=>champ(p=>p['aria-label']==='Prix unitaire HT').props.onChange({target:{value:'50'}}));
t=texte(tr);
chk(/TVA 10 %/.test(t),'le taux de TVA suit le marché choisi (10 %)');
chk(/Total de l'avenant TTC = prestations \+ 220,00 € \+ honoraires 0,00 €\+ 220,00 €/.test(t),'total de l’avenant en direct : 200 HT + 20 TVA, sans honoraires');
TR.act(()=>bouton(/^Enregistrer$/).props.onClick());
let av=etat.v.chantiers[0].avenantsClient;
chk(av.length===1&&av[0].numero==='AV-001'&&av[0].lignes[0].marcheId==='m2','enregistré dans les données du chantier (AV-001, rattaché à l’électricité)');
t=texte(tr);
chk(/AV-001/.test(t)&&/Plus-value fictive/.test(t)&&/Brouillon/.test(t),'une ligne par avenant : numéro, objet, statut');
chk(/Cumul en attente : \+ 220,00 € TTC/.test(t)&&/Budget actualisé : 180 000,00 € TTC/.test(t),'en attente : hors budget');
chk(/Simulation/.test(t)&&/budget 180 220,00 € TTC/.test(t),'la simulation est affichée à part');
TR.act(()=>bouton(/^Enregistrer la validation$/).props.onClick());
TR.act(()=>champ(p=>/Avenant signé, courriel/.test(p.placeholder||'')).props.onChange({target:{value:'Courriel du client'}}));
chk(/pas une signature électronique|n'est pas une signature électronique|Ce n'est pas une\s*signature électronique/.test(texte(tr)),'la validation ne se présente pas comme une signature électronique');
TR.act(()=>bouton(/^Valider AV-001/).props.onClick());
av=etat.v.chantiers[0].avenantsClient;
chk(av[0].statut==='valide'&&av[0].accord.reference==='Courriel du client','validation enregistrée avec sa référence');
t=texte(tr);
chk(/Avenants validés : \+ 220,00 € TTC/.test(t)&&/Budget actualisé : 180 220,00 € TTC/.test(t),'le budget actualisé suit la validation');
chk(/Budget disponible : 14 220,00 € TTC/.test(t),'le budget disponible aussi (rien n’est encore reporté au marché)');
chk(/pas encore reporté/.test(t),'l’avenant validé non reporté est signalé');
TR.act(()=>bouton(/^Reporter dans les marchés$/).props.onClick());
chk(etat.v.marches.find(m=>m.id==='m2').montantHT===20200,'report : le marché d’électricité passe à 20 200 € HT');
t=texte(tr);
chk(/Total engagé : 166 220,00 € TTC/.test(t)&&/Budget disponible : 14 000,00 € TTC/.test(t),'après report : engagé + 220 TTC, une fois');
chk(!bouton(/^Reporter dans les marchés$/),'plus de bouton de report une fois fait');
chk(!bouton(/^Supprimer$/)&&!!bouton(/^Avenant correctif$/),'validé : ni modification ni suppression, un correctif');

/* rechargement : les données relues donnent le même écran */
TR.act(()=>tr.unmount());
etat={v:rt(etat.v)};tr=rendre(etat,'c1');t=texte(tr);
chk(/AV-001/.test(t)&&/Budget actualisé : 180 220,00 € TTC/.test(t)&&/Validé/.test(t),'après rechargement, l’avenant et le budget sont retrouvés');
TR.act(()=>tr.unmount());

/* un avenant de lot ajouté au budget avant cette version : le montant saisi
   le contient ; à la demande, il en sort et devient un avenant validé */
const AVL={id:'avl',numero:'1',date:'2026-05-01',contexte:'',lignes:[{id:'q',libelle:'Tranchée fictive',qt:10,unite:'ml',pu:15,signe:1}],
  lien:'',dateSignature:'2026-05-02',budgetAppliqueLe:'2026-05-03'};
etat={v:{...M.EMPTY,chantiers:[{...CH,budgetClientTTC:180180}],artisans:ART,commandes:[],
  marches:[{...MS[0],montantHT:100150,avenants:[AVL]},MS[1]]}};
tr=rendre(etat,'c1');t=texte(tr);
chk(/1 avenant de lot \(180,00 € TTC\)/.test(t),'l’ancien avenant de lot compris dans le contrat est signalé');
TR.act(()=>bouton(/Les présenter comme avenants validés/).props.onClick());
const cv=etat.v.chantiers[0];
chk(cv.budgetClientTTC===180000&&cv.avenantsClient.length===1&&cv.avenantsClient[0].statut==='valide','contrat initial rétabli (180 000), avenant validé créé');
chk(M.budgetActualise(cv)===180180&&cv.avenantsClient[0].lignes[0].reporteLe==='2026-05-03','budget actualisé inchangé ; la ligne est déjà reportée (date d’origine)');
chk(etat.v.marches[0].montantHT===100150&&etat.v.marches[0].avenants[0].avenantClientId===cv.avenantsClient[0].id,'le marché n’est pas retouché ; le lien est gardé');
chk(!/avenant de lot \(/.test(texte(tr)),'plus de signalement ensuite');
TR.act(()=>tr.unmount());

/* dépassement de budget, en rouge */
etat={v:{...M.EMPTY,chantiers:[{...CH,budgetClientTTC:150000}],artisans:ART,marches:MS,commandes:[]}};
tr=rendre(etat,'c1');t=texte(tr);
chk(/Dépassement de budget : 16 000,00 € TTC/.test(t)&&!/Budget disponible :/.test(t),'budget dépassé : « Dépassement de budget »');
const dep=tr.root.findAll(n=>n.type==='span'&&/^Dépassement de budget/.test(norm(texteInst(n))))[0];
chk(dep&&dep.props.style&&dep.props.style.color==='#C5563A','… affiché en rouge (terracotta)');
TR.act(()=>tr.unmount());
fin();
