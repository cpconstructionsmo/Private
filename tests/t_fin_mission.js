/* Attestation de fin de mission de maîtrise d'œuvre (pièce « Achèvement »
   de la fiche chantier).
   - La mission ne se « réceptionne » pas : l'attestation reprend les PV des
     lots signés (reçu le, décision, réserves et leur levée), les documents
     remis cochés un par un, les honoraires facturés et le solde.
   - Elle dit ce qui reste à faire avant de la faire signer, sans bloquer.
   - Visa de CP Constructions d'office, signature du client à l'écran ou à
     la main ; le Word part dans Drive › Pièces et s'ajoute à la pièce.
   - La levée des réserves se note sur le PV du lot (pv.leveeLe), repris par
     le PV lui-même et par l'attestation.
   Données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');const fs=require('fs');
const M=charger(['finMissionDonnees','finMissionDe','finMissionSignataires','genererFinMissionDocx','finMissionNomFichier',
  'FIN_MISSION_DOCS','FIN_MISSION_TEXTE','FinMissionChantier','PvReception','pvDonnees','genererPvReceptionDocx','zipEntree','EMPTY','DOCS']);
const {chk,fin}=verif();
const IMG=new Uint8Array(fs.readFileSync(RACINE+'/assets/ptr/baes_evacuation.jpeg'));
const xmlDe=async o=>new TextDecoder().decode(await M.zipEntree(o.buffer.slice(o.byteOffset,o.byteOffset+o.byteLength),'word/document.xml'));

const CH={id:'c1',nom:'Maison Fictive',client:'Fictif',adresse:'1 rue Fictive, 61000 Commune',prospectId:'p1',tva:20,
  honorairesMontant:14333.33,docs:{contrat_moe:{fait:true,date:'2025-06-12'}},
  honoFactures:[{id:'h1',montant:12000,date:'2026-05-01'}],
  pvs:{m1:{decision:'sans',dateEffet:'2026-11-10'},
       m2:{decision:'avec',dateEffet:'2026-11-10',reserves:[{id:'r1',localisation:'Cuisine',description:'Prise'}],leveeLe:'2026-11-20'},
       m3:{decision:'avec',dateEffet:'2026-11-12',reserves:[{id:'r2',localisation:'SdB',description:'Joint'},{id:'r3',localisation:'Ch. 1',description:'Plinthe'}]},
       m6:{decision:'refus',motif:'Travaux inachevés'}}};
const ART=[{id:'a1',nom:'Maçon Fictif'},{id:'a2',nom:'Électricien Fictif'},{id:'a3',nom:'Plombier Fictif'},{id:'a4',nom:'Peintre Fictif'},{id:'a6',nom:'Carreleur Fictif'}];
const MS=[{id:'m1',chantierId:'c1',lot:'Gros œuvre',numeroMarche:'1',artisanId:'a1',statut:'signe',montantHT:50000},
  {id:'m2',chantierId:'c1',lot:'Électricité',numeroMarche:'8',artisanId:'a2',statut:'signe',montantHT:8000},
  {id:'m3',chantierId:'c1',lot:'Plomberie',numeroMarche:'9',artisanId:'a3',statut:'encours',montantHT:9000},
  {id:'m4',chantierId:'c1',lot:'Peinture',numeroMarche:'10',artisanId:'a4',statut:'receptionne',montantHT:4000},
  {id:'m5',chantierId:'c1',lot:'Cuisine',artisanId:'',statut:'devis',montantHT:4000},
  {id:'m6',chantierId:'c1',lot:'Carrelage',numeroMarche:'12',artisanId:'a6',statut:'signe',montantHT:3000},
  {id:'mx',chantierId:'autre',lot:'Autre chantier',statut:'signe',montantHT:1}];
let data={...M.EMPTY,chantiers:[CH],prospects:[{id:'p1',civilite:'M.',client:'Fictif',client2:'Fictive',civilite2:'Mme'}],artisans:ART,marches:MS};

(async()=>{
  /* ---- 1) ce que l'attestation reprend ---- */
  chk(M.DOCS.some(x=>x.id==='fin_mission'),'une pièce « Attestation de fin de mission » dans la fiche chantier');
  let d=M.finMissionDonnees(CH,data);
  chk(d.maitreOuvrage==='M. Fictif et Mme Fictive'&&d.adresse==='1 rue Fictive, 61000 Commune'&&d.contratDate==='12/06/2025',
    'maître(s) d’ouvrage comme sur les PV, adresse, date du contrat de maîtrise d’œuvre');
  chk(d.lots.map(x=>x.id).join()==='m1,m2,m3,m4,m6','les lots signés de ce chantier seulement (ni devis, ni autre chantier)');
  const L=id=>d.lots.find(x=>x.id===id);
  chk(L('m1').texte==='Sans réserve'&&L('m1').recuLe==='10/11/2026','reçu sans réserve le 10/11/2026');
  chk(L('m2').etat==='levees'&&L('m2').texte==='Avec réserves — levées le 20/11/2026','réserves levées : avec la date notée sur le PV');
  chk(L('m3').etat==='reserves'&&L('m3').texte==='Avec 2 réserves — non levées','réserves pas encore levées : comptées');
  chk(L('m4').etat==='aucun'&&L('m4').texte==='PV de réception non établi'&&!L('m4').recuLe,'lot sans PV : dit tel quel, sans date');
  chk(L('m6').etat==='refus'&&!L('m6').recuLe,'réception non prononcée : sans date');
  chk(!d.documents.length,'aucun document coché d’office');
  chk(d.hono&&d.hono.total===17200&&d.hono.facture===14400&&d.hono.reste===2800,'honoraires : 17 200 € TTC, 14 400 facturés, 2 800 restants');
  const a=d.alertes.join(' | ');
  chk(/PV de réception à établir : Peinture/.test(a)&&/Réception non prononcée : Carrelage/.test(a)&&/Réserves non levées : Plomberie/.test(a)
    &&!/DOE/.test(a)&&/2 800,00 € TTC/.test(norm(a))&&/Date de signature/.test(a),'ce qui reste à faire avant signature, nommé lot par lot (le DOE n’est plus demandé)');
  const fm={...M.finMissionDe(CH),documents:{doe:true,consuel:true},autres:'Carnet d’entretien de la PAC\n\n',faitA:'Valframbert',faitLe:'2026-11-25'};
  d=M.finMissionDonnees(CH,data,fm);
  chk(d.documents.length===3&&/DOE/.test(d.documents[0])&&/Consuel/.test(d.documents[1])&&d.documents[2]==='Carnet d’entretien de la PAC',
    'documents remis : les cochés, dans l’ordre de la liste, puis les autres (lignes vides ignorées) ; un DOE coché avant reste repris');
  chk(!/DOE/.test(d.alertes.join())&&!/Date de signature/.test(d.alertes.join())&&d.faitLe==='25/11/2026','DOE coché et date saisie : plus d’alerte pour eux');
  const sans=M.finMissionDonnees({...CH,honorairesMontant:0,honoFactures:[]},data,fm);
  chk(sans.hono===null&&/Honoraires non renseignés/.test(sans.alertes.join()),'honoraires inconnus : rien d’inventé, signalé');

  /* ---- 2) signatures ---- */
  let s=M.finMissionSignataires(fm,{cpVisa:{signature:{id:'s'},cachet:{id:'c'}}});
  chk(s.moe&&s.moe.id==='s'&&s.cachetMoe&&s.cachetMoe.id==='c'&&s.moe.mention==='Visa apposé'&&!s.moa,'visa de CP Constructions d’office (signature et cachet)');
  s=M.finMissionSignataires(fm,{cpVisa:{cachet:{id:'c'}}});
  chk(s.moe&&s.moe.ensemble&&!s.cachetMoe,'un fichier unique (cachet et signature ensemble) s’appose seul');
  chk(!M.finMissionSignataires({...fm,visaCp:false},{cpVisa:{signature:{id:'s'}}}).moe,'décoché sur l’attestation : pas de visa');
  s=M.finMissionSignataires({...fm,signatures:{moa:{id:'m',nom:'Fictif',date:'2026-11-25T10:00:00Z'}}},{});
  chk(s.moa&&s.moa.source==='ecran'&&!s.moe,'signature du client à l’écran ; sans visa enregistré, CP signe à la main');

  /* ---- 3) le Word ---- */
  let o=await M.genererFinMissionDocx(d,{moe:{nom:'CP Constructions',qualite:'Maître d’œuvre',source:'fournie',mention:'Visa apposé',date:'2026-11-25',data:IMG},
    cachetMoe:{data:IMG}});
  let x=await xmlDe(o);
  const texte=norm(x.replace(/<[^>]+>/g,''));
  chk(/Attestation de fin de mission/.test(texte)&&/Contrat de maîtrise d’œuvre du 12\/06\/2025/.test(texte)&&/M\. Fictif et Mme Fictive/.test(texte),'titre, contrat du 12/06/2025, maîtres d’ouvrage');
  chk(/n° 8 — Électricité/.test(texte)&&/Avec réserves — levées le 20\/11\/2026/.test(texte)&&/PV de réception non établi/.test(texte)&&/Réception non prononcée/.test(texte),
    'tableau des lots : chacun avec son état');
  chk((x.match(/☒/g)||[]).length===3&&/Carnet d’entretien de la PAC/.test(texte),'documents remis cochés (3)');
  chk(/17 200,00 €/.test(texte)&&/14 400,00 €/.test(texte)&&/Le solde des honoraires, soit 2 800,00 € TTC/.test(texte),'honoraires et solde');
  chk(texte.includes(M.FIN_MISSION_TEXTE)&&/1792 et suivants/.test(texte),'la mention : aucune garantie légale réduite');
  chk(/Fait à Valframbert, le 25\/11\/2026, en 2 exemplaires\./.test(texte),'fait à, le, en 2 exemplaires');
  chk((x.match(/<w:drawing>/g)||[]).length===3&&/Visa apposé le 25\/11\/2026/.test(texte),'logo, visa et cachet de CP apposés');
  const pied=new TextDecoder().decode(await M.zipEntree(o.buffer.slice(o.byteOffset,o.byteOffset+o.byteLength),'word/footer1.xml'));
  chk(/Attestation de fin de mission/.test(pied)&&/Maison Fictive/.test(pied),'pied de page : dossier et document');
  o=await M.genererFinMissionDocx(M.finMissionDonnees({...CH,honorairesMontant:0,honoFactures:[]},data,M.finMissionDe(CH)),{});
  x=norm((await xmlDe(o)).replace(/<[^>]+>/g,''));
  chk(/☐ …………/.test(x)&&/Fait à ……/.test(x)&&!/Le solde des honoraires/.test(x),'vierge : à remplir à la main, rien de coché ni d’inventé');
  chk(M.finMissionNomFichier(d)==='Attestation de fin de mission — Maison Fictive.docx','nom du fichier');

  /* ---- 4) le PV : la levée des réserves notée, reprise dans le Word ---- */
  const pvD=M.pvDonnees(MS[1],CH,data);
  chk(pvD.leveeLe==='20/11/2026','PV : la date de levée des réserves est reprise');
  x=norm((await xmlDe(await M.genererPvReceptionDocx(pvD,{}))).replace(/<[^>]+>/g,''));
  chk(/Levée des réserves\s+☒ toutes\s+☐ n° ……………\s+le 20\/11\/2026/.test(x),'PV : « Levée des réserves » cochée, avec sa date');

  /* ---- 5) l'écran ---- */
  let tr;
  const monter=()=>React.createElement(M.FinMissionChantier,{data,ch:data.chantiers[0],save});
  function save(n){data=n;TR.act(()=>{tr.update(monter())})}
  TR.act(()=>{tr=TR.create(monter())});
  const txt=()=>norm(texteInst(tr.root));
  chk(/Réception des lots \(5\)/.test(txt())&&/Avec 2 réserves — non levées — reçu le 12\/11\/2026/.test(txt()),'l’écran reprend l’état de chaque lot');
  chk(/Avant de la faire signer/.test(txt())&&/PV de réception à établir : Peinture/.test(txt()),'ce qui reste à faire est affiché');
  const fmS=()=>data.chantiers[0].finMission||{};
  const caseDoc=id=>tr.root.findAll(n=>n.type==='input'&&n.props.type==='checkbox'
    &&norm(texteInst(n.parent)).includes(M.FIN_MISSION_DOCS.find(y=>y.id===id).l))[0];
  chk(!caseDoc('doe')&&!caseDoc('entretien'),'le DOE et les notices d’entretien ne sont plus proposés');
  TR.act(()=>{caseDoc('consuel').props.onChange({target:{checked:true}})});
  chk(fmS().documents&&fmS().documents.consuel===true,'cocher le Consuel l’enregistre aussitôt sur le chantier');
  const date=tr.root.findAll(n=>n.type==='input'&&n.props.type==='date')[0];
  TR.act(()=>{date.props.onChange({target:{value:'2026-11-25'}})});
  chk(fmS().faitLe==='2026-11-25','« Le » enregistré');
  const bouton=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
  await TR.act(async()=>{bouton(/Produire l’attestation de fin de mission/).props.onClick()});
  for(let i=0;i<150&&!/Attestation déposée|impossible/.test(txt());i++)await TR.act(()=>new Promise(r=>setTimeout(r,20)));
  chk(fmS().genere&&/drive\.google\.com/.test(fmS().genere.lien)&&fmS().genere.nom==='Attestation de fin de mission — Maison Fictive.docx',
    'le Word part sur le Drive, nommé d’après le dossier');
  const piece=data.chantiers[0].docs.fin_mission;
  chk(piece&&piece.fichiers.length===1&&piece.fichiers[0].nom===fmS().genere.nom&&!piece.fait,'il s’ajoute à la pièce (sans la cocher : c’est l’exemplaire signé qui compte)');
  chk(/Dans l’attestation — maître d’ouvrage : à signer à la main · CP Constructions : à signer à la main\./.test(txt()),'le message dit ce que porte l’attestation');
  for(let i=0;i<50&&!tr.root.findAll(n=>n.type==='a'&&n.props.download).length;i++)await TR.act(()=>new Promise(r=>setTimeout(r,10)));
  chk(!!tr.root.findAll(n=>n.type==='a'&&n.props.download)[0],'« ⬇ Télécharger le Word » : un vrai lien (Safari)');
  TR.act(()=>{tr.unmount()});

  /* le PV du lot : la date de levée se saisit quand la réception est avec réserves */
  const monterPv=()=>React.createElement(M.PvReception,{data,ch:data.chantiers[0],m:MS[2],save:savePv});
  function savePv(n){data=n;TR.act(()=>{tr.update(monterPv())})}
  TR.act(()=>{tr=TR.create(monterPv())});
  const champLevee=()=>tr.root.findAll(n=>n.type==='input'&&n.props.type==='date'&&/réserves levées le/.test(norm(texteInst(n.parent))))[0];
  chk(!!champLevee(),'PV avec réserves : « Toutes les réserves levées le » proposé');
  TR.act(()=>{champLevee().props.onChange({target:{value:'2026-12-01'}})});
  chk(data.chantiers[0].pvs.m3.leveeLe==='2026-12-01','la date de levée s’enregistre sur le PV');
  chk(M.finMissionDonnees(data.chantiers[0],data).lots.find(y=>y.id==='m3').texte==='Avec réserves — levées le 01/12/2026','l’attestation la reprend');
  TR.act(()=>{tr.unmount()});
  fin();
})().catch(e=>{console.error(e);process.exit(1)});
