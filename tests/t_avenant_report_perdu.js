/* Un avenant reporté dans son marché ne doit pas en ressortir en silence.
   Le formulaire d'un lot garde une copie du marché faite à son ouverture :
   ouvert pendant qu'on reportait un avenant depuis l'encart « Budget et
   avenants », puis enregistré, il remettait l'ancien montant — l'avenant
   restait marqué « reporté » sans plus compter dans le marché. Désormais
   « Enregistrer » ne réécrit que la saisie, et un report perdu se signale et
   se rétablit d'un clic. Données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
let reponse=true;const questions=[];
const M=charger(['Fiche','EMPTY','reporterAvenantMarches','avReportsPerdus','retablirReportsAvenant','retablirReportsApercu',
  'lotRebaser','avenantValider','nouvelAvenantClient','avenantDepuisLot','bilanBudget'],
  {confirm:m=>{questions.push(m);return reponse}});
const {chk,fin}=verif();
const rt=o=>JSON.parse(JSON.stringify(o));

const CH={id:'c1',nom:'Maison fictive',client:'Client fictif',adresse:'Commune fictive',budgetClientTTC:180000,tva:20,
  honorairesMontant:20000,statut:'travaux'};
const MS=[{id:'m1',chantierId:'c1',lot:'Gros œuvre',artisanId:'a1',montantHT:100000,tva:20,statut:'signe',factures:[]},
          {id:'m2',chantierId:'c1',lot:'Électricité',artisanId:'a2',montantHT:8090,tva:20,statut:'signe',
           factures:[{id:'f1',montant:5400,date:'2026-08-24',lien:''},{id:'f2',montant:2584,date:'2026-10-10',lien:''}]}];
const ART=[{id:'a1',nom:'Maçon fictif'},{id:'a2',nom:'Électricien fictif'}];
/* la moins-value du cas réel : 106 € HT de moins sur l'électricité, validée */
const AV=M.avenantValider(M.nouvelAvenantClient(CH,{objet:'Moins-value électrique',
  lignes:[{id:'x1',marcheId:'m2',lot:'Électricité',artisanId:'a2',designation:'Moins-value',qte:1,unite:'U',puHT:106,taux:20,sens:-1}],
  hono:{mode:'aucun',taux:20,pct:10,forfaitHT:'',sens:1,exclues:[]}}),{date:'2026-11-14',reference:'Accord fictif'});
const DATA={...M.EMPTY,chantiers:[{...CH,avenantsClient:[AV]}],artisans:ART,marches:MS,commandes:[]};
const m2=d=>d.marches.find(m=>m.id==='m2');

/* 1. report puis marché réécrit : le report perdu se voit */
let d=M.reporterAvenantMarches(DATA,'c1',AV.id);
chk(m2(d).montantHT===7984&&m2(d).avenantsClientReportes.length===1,'report : 8 090 − 106 = 7 984 € HT, avec sa trace');
let a=d.chantiers[0].avenantsClient[0];
chk(!M.avReportsPerdus(a,d.marches).length,'juste après le report, rien n’est perdu');
const ecrase={...d,marches:d.marches.map(m=>m.id==='m2'?MS[1]:m)};
chk(M.avReportsPerdus(a,ecrase.marches).length===1,'marché réécrit avec l’ancienne copie : le report perdu est reconnu');
const ap=M.retablirReportsApercu(ecrase,ecrase.chantiers[0],a);
chk(ap.length===1&&ap[0].avant===809000&&ap[0].apres===798400&&ap[0].ht===-10600,'aperçu : 8 090,00 → 7 984,00 € HT (− 106,00)');
let r=M.retablirReportsAvenant(ecrase,'c1',AV.id);
chk(m2(r).montantHT===7984&&m2(r).avenantsClientReportes.length===1&&m2(r).avenantsClientReportes[0].retabli,'rétabli : 7 984 € HT, trace reposée');
let ar=r.chantiers[0].avenantsClient[0];
chk(!!ar.lignes[0].retabliLe&&ar.lignes[0].reporteLe===a.lignes[0].reporteLe&&/Report rétabli/.test(ar.journal[ar.journal.length-1].quoi),
  'la ligne garde sa date de report, note le rétablissement ; l’historique le dit');
chk(M.retablirReportsAvenant(r,'c1',AV.id)===r,'une seule fois : rien à rétablir ensuite');
chk(M.bilanBudget(r.chantiers[0],r.marches.filter(m=>m.chantierId==='c1'),[]).engage
  ===M.bilanBudget(d.chantiers[0],d.marches.filter(m=>m.chantierId==='c1'),[]).engage,'le total engagé redevient celui d’après le report');
/* un avenant venu d'un avenant de lot : son montant était déjà dans le marché, sans trace */
const doLot=M.avenantDepuisLot(CH,MS[1],{id:'al1',numero:'1',lignes:[{libelle:'Prises',qt:2,pu:50,signe:1}],dateSignature:'2026-09-01'},'2026-09-01');
chk(!M.avReportsPerdus(doLot,MS).length,'avenant venu d’un lot : jamais signalé (pas de double comptage)');
chk(!M.avReportsPerdus({...AV,statut:'brouillon',lignes:[{...AV.lignes[0],reporteLe:'2026-11-14'}]},MS).length,'un brouillon n’est jamais signalé');

/* 2. lotRebaser : ce qui a changé ailleurs suit, la saisie reste */
const ouvert={id:'m2',lot:'Électricité',montantHT:8090,notes:'',factures:[{id:'f1',montant:5400}]};
let rb=M.lotRebaser({...ouvert,lot:'Électricité — VMC'},ouvert,ouvert,
  {...ouvert,montantHT:7984,avenantsClientReportes:[{ligneId:'x1',ht:-106}]});
chk(rb.saisie.montantHT===7984&&rb.saisie.avenantsClientReportes.length===1&&rb.saisie.lot==='Électricité — VMC'&&!rb.conflits.length,
  'montant et trace repris du marché, intitulé retouché gardé, aucun conflit');
rb=M.lotRebaser({...ouvert,montantHT:'8500'},ouvert,ouvert,{...ouvert,montantHT:7984});
chk(rb.saisie.montantHT==='8500'&&rb.conflits.join()==='montantHT','montant changé des deux côtés : la saisie reste, le conflit est nommé');
rb=M.lotRebaser({...ouvert,montantHT:7984},ouvert,ouvert,{...ouvert,montantHT:7984});
chk(!rb.conflits.length,'même valeur des deux côtés : pas de conflit');
rb=M.lotRebaser({...ouvert,factures:[...ouvert.factures,{id:'f2',montant:2584}]},ouvert,ouvert,
  {...ouvert,factures:[{id:'f1',montant:5400,lien:'https://drive/f1'}]});
chk(rb.saisie.factures.length===2&&rb.saisie.factures[0].lien==='https://drive/f1'&&!rb.conflits.length,
  'factures : celle ajoutée au formulaire et le fichier posé depuis la liste, fusionnés');
rb=M.lotRebaser(ouvert,ouvert,{...ouvert,ancien:1},{...ouvert});
chk(!('ancien' in rb.saisie),'un champ retiré ailleurs disparaît de la saisie');

/* 3. dans l'écran : lot ouvert, avenant reporté au-dessus, lot enregistré */
const rendre=(e,id)=>{let tr;const el=()=>React.createElement(M.Fiche,{data:e.v,ch:e.v.chantiers.find(x=>x.id===id),
  save:n=>{e.v=n;TR.act(()=>tr.update(el()))},back(){}});TR.act(()=>{tr=TR.create(el())});return tr};
const texte=tr=>norm(texteInst(tr.toJSON()));
let etat={v:rt(DATA)};
let tr=rendre(etat,'c1');
const boutons=re=>tr.root.findAll(n=>n.type==='button'&&re.test(norm(texteInst(n))));
const bouton=re=>boutons(re)[0];
/* le « Enregistrer » du formulaire du lot (la fiche en a un autre, pour la localisation) */
const enregLot=()=>boutons(/^Enregistrer$/).find(b=>{for(let p=b.parent;p;p=p.parent)if(p.type&&p.type.name==='Acts')return true;return false});
const montant=()=>tr.root.findAll(n=>n.type==='input'&&n.props.type==='number'&&n.props.disabled===false)[0];
const corps=()=>tr.root.findAll(n=>n.type==='input'&&/Gros œuvre/.test(n.props.placeholder||''))[0];
TR.act(()=>boutons(/^Modifier le lot ›$/)[1].props.onClick());
chk(montant()&&+montant().props.value===8090,'lot d’électricité ouvert : 8 090 € HT');
TR.act(()=>corps().props.onChange({target:{value:'Électricité — VMC'}}));
TR.act(()=>bouton(/^Consulter$/).props.onClick());
TR.act(()=>bouton(/^Reporter dans les marchés$/).props.onClick());
chk(m2(etat.v).montantHT===7984,'report fait depuis l’encart : le marché passe à 7 984 € HT');
chk(+montant().props.value===7984,'le formulaire du lot, resté ouvert, suit : 7 984 € HT');
TR.act(()=>enregLot().props.onClick());
chk(m2(etat.v).montantHT===7984&&(m2(etat.v).avenantsClientReportes||[]).length===1,'lot enregistré : l’avenant reste dans le marché (7 984 € HT, trace gardée)');
chk(m2(etat.v).lot==='Électricité — VMC','la retouche faite dans le lot est enregistrée');
chk(!/report à refaire/.test(texte(tr))&&/soldé/.test(texte(tr)),'rien à refaire ; le lot facturé 7 984 € est soldé');
TR.act(()=>tr.unmount());

/* 4. montant retouché dans le lot pendant le report : signalé, rien d'écrasé sans accord */
etat={v:rt(DATA)};tr=rendre(etat,'c1');
TR.act(()=>boutons(/^Modifier le lot ›$/)[1].props.onClick());
TR.act(()=>montant().props.onChange({target:{value:'8500'}}));
TR.act(()=>bouton(/^Consulter$/).props.onClick());
TR.act(()=>bouton(/^Reporter dans les marchés$/).props.onClick());
let t=texte(tr);
chk(/a changé pendant que le lot était ouvert : il est enregistré à 7 984,00 € HT/.test(t),'conflit sur le montant : signalé dans le lot');
reponse=false;questions.length=0;
TR.act(()=>enregLot().props.onClick());
chk(questions.length===1&&/7 984,00 € HT/.test(norm(questions[0]))&&m2(etat.v).montantHT===7984&&!!montant(),
  'Enregistrer demande d’abord ; refusé : rien n’est écrit, le lot reste ouvert');
reponse=true;
TR.act(()=>bouton(/^Reprendre 7 984,00 €$/).props.onClick());
chk(+montant().props.value===7984,'« Reprendre » remet le montant enregistré dans la saisie');
TR.act(()=>enregLot().props.onClick());
chk(m2(etat.v).montantHT===7984&&m2(etat.v).avenantsClientReportes.length===1,'enregistré : 7 984 € HT, trace gardée');
TR.act(()=>tr.unmount());

/* 5. les données déjà abîmées : le report perdu se voit et se rétablit */
etat={v:rt(ecrase)};tr=rendre(etat,'c1');
t=texte(tr);
chk(/report à refaire/.test(t),'liste des avenants : « report à refaire » sur AV-001');
TR.act(()=>bouton(/^Consulter$/).props.onClick());
t=texte(tr);
chk(/reporté le 14\/11\/2026, mais le marché ne le porte plus/.test(t.replace(/\d{2}\/\d{2}\/\d{4}/,'14/11/2026'))
  &&/le montant du marché a été réécrit depuis le report/.test(t),'détail : la ligne et l’explication');
questions.length=0;
TR.act(()=>bouton(/^Reporter à nouveau dans le marché$/).props.onClick());
chk(questions.length===1&&/8 090,00 € → 7 984,00 € HT/.test(norm(questions[0]))&&/compté deux fois/.test(questions[0]),
  'le montant avant/après est montré avant de rétablir');
chk(m2(etat.v).montantHT===7984&&m2(etat.v).avenantsClientReportes.length===1,'rétabli : 7 984 € HT');
t=texte(tr);
chk(!/report à refaire/.test(t)&&!bouton(/^Reporter à nouveau/)&&/rétabli le/.test(t),'plus d’alerte ; la ligne dit « rétabli le »');
TR.act(()=>tr.unmount());
fin();
