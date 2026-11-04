/* Marchés › fiche du lot › « Marché signé par l'entreprise » : le marché
   revenu signé se dépose (un ou plusieurs fichiers, choisis ou glissés) et
   part aussitôt sur le Drive › Marché travaux signé, renommé d'après le lot.
   Le lot passe « Marché signé », le contrat du lot devient le marché signé
   et celui qu'il remplace se garde. Le lot enregistré l'est tout de suite.
   Un fichier se retire de la liste (pas du Drive). La liste des lots et le
   tableau de bord rangent le fichier de la même façon. Drive simulé ;
   données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const {chk,fin}=verif();
const envois=[];let refus=false;
const M=charger(['Marches','RelanceMarche','EMPTY','ajouterMarcheSigne','retirerMarcheSigne','nomMarcheSigne','marcheSignes'],{
  fetch:async(url,init,base)=>{
    if(/upload\/drive\/v3\/files\?uploadType=multipart/.test(url)){
      if(refus)return {ok:false,status:403,json:async()=>({error:{code:403,message:'The user has exceeded their Drive storage quota',errors:[{reason:'storageQuotaExceeded'}]}})};
      const file=init.body.get('file');
      envois.push({nom:file.name,type:file.type,taille:(await file.arrayBuffer()).byteLength});
      const n=envois.length;
      return {ok:true,status:200,json:async()=>({id:'s'+n,webViewLink:'https://drive.google.com/file/d/s'+n+'/view'})};
    }
    return base(url,init);
  }});
const fichier=(nom,type)=>new File([Buffer.from('%PDF scan fictif')],nom,{type});

/* 1. le moteur */
{
  const m={id:'m1',lot:'GROS ŒUVRE',numeroMarche:'2',statut:'devis',contratLien:'L-redige'};
  const p1=M.ajouterMarcheSigne(m,{id:'d1',nom:'a',lien:'L1',le:'2026-11-04'});
  chk(p1.signes.length===1&&p1.contratLien==='L1'&&p1.contratRedige==='L-redige'&&p1.statut==='signe',
    'premier dépôt : dans la liste, contrat du lot = marché signé, contrat rédigé gardé, statut « signé »');
  const m2={...m,...p1};
  const p2=M.ajouterMarcheSigne(m2,{id:'d2',nom:'b',lien:'L2',le:'2026-11-04'});
  chk(p2.signes.length===2&&p2.contratLien==='L2'&&!('contratRedige' in p2)&&!('statut' in p2),'second dépôt : ajouté, le contrat rédigé n’est pas remplacé par le premier signé');
  chk(!('statut' in M.ajouterMarcheSigne({...m,statut:'encours'},{id:'x',lien:'L'})),'un lot déjà en cours ne recule pas à « signé »');
  const m3={...m2,...p2};
  const r1=M.retirerMarcheSigne(m3,'d2');
  chk(r1.signes.length===1&&r1.contratLien==='L1','retirer le dernier : le contrat du lot revient au précédent');
  const r2=M.retirerMarcheSigne({...m3,...r1},'d1');
  chk(!r2.signes.length&&r2.contratLien==='L-redige','plus aucun : le contrat rédigé revient');
  chk(M.nomMarcheSigne(m,'SAS Fictive','scan 0042.PDF',1)==='Marché 2 — GROS ŒUVRE — SAS Fictive — signé.pdf'
    &&M.nomMarcheSigne(m,'SAS Fictive','IMG_1.JPG',2)==='Marché 2 — GROS ŒUVRE — SAS Fictive — signé (2).jpg','nom rangé sur le Drive, avec son rang et son extension');
  chk(M.marcheSignes({}).length===0&&M.marcheSignes(null).length===0,'un lot ancien, sans liste : aucun marché signé');
}

/* 2. la fiche du lot */
const CH={id:'c1',nom:'Maison Fictive',client:'M. Fictif',adresse:'1 rue Fictive',tva:20};
const ART={id:'a1',nom:'SAS Fictive',corps:'Gros œuvre'};
const LOT={id:'m1',chantierId:'c1',lot:'GROS ŒUVRE',numeroMarche:'2',artisanId:'a1',montantHT:1000,tva:20,statut:'devis',factures:[],
  contratLien:'https://drive.google.com/file/d/redige/view',dateSignature:''};
let data={...M.EMPTY,chantiers:[CH],artisans:[ART],marches:[LOT],commandes:[]}, tr;
const props=()=>({data,ch:CH,save:d=>{data=d;TR.act(()=>{tr.update(React.createElement(M.Marches,props()))})},eng:0,fac:0,onFacturerCmd(){},onFacturerHono(){}});
TR.act(()=>{tr=TR.create(React.createElement(M.Marches,props()))});
const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n)))||re.test(n.props['aria-label']||''));
const t=()=>norm(texteInst(tr.root));
const zone=()=>tr.root.findAll(n=>n.type==='label'&&n.props['aria-label']==='Déposer le marché signé')[0];
const champ=()=>zone().findAll(n=>n.type==='input')[0];

(async()=>{
  TR.act(()=>{btn(/Modifier le lot/).props.onClick()});
  chk(/MARCHÉ SIGNÉ PAR L’ENTREPRISE/.test(t())&&/Glissez le fichier ici, ou cliquez pour le choisir/.test(t())&&champ().props.multiple,
    'la section est là, avec sa zone de dépôt (plusieurs fichiers)');
  await TR.act(async()=>{await champ().props.onChange({target:{files:[fichier('scan.pdf','application/pdf'),fichier('page2.jpg','image/jpeg')],value:''}})});
  chk(envois.length===2&&envois[0].nom==='Marché 2 — GROS ŒUVRE — SAS Fictive — signé.pdf'&&envois[1].nom==='Marché 2 — GROS ŒUVRE — SAS Fictive — signé (2).jpg'
    &&envois[1].type==='image/jpeg'&&envois[0].taille>0,'deux fichiers envoyés sur le Drive, renommés d’après le lot');
  chk(global.__driveAppels.some(x=>/Marché travaux signé/.test(decodeURIComponent(x.url))||/Marché travaux signé/.test(String(x.init&&x.init.body))),
    'rangés dans le dossier « Marché travaux signé » du chantier');
  let m=data.marches[0];
  chk(m.signes.length===2&&m.statut==='signe'&&m.contratLien==='https://drive.google.com/file/d/s2/view'&&m.contratRedige===LOT.contratLien,
    'enregistré aussitôt : liste, statut « signé », contrat du lot, contrat rédigé gardé');
  chk(/2 fichiers déposés sur le Drive — le lot passe « Marché signé »\./.test(t())&&/signé \(2\)\.jpg/.test(t())&&/déposé le \d\d\/\d\d\/\d{4}/.test(t()),
    'l’écran le confirme et liste les fichiers');
  chk(/La date de signature n’est pas renseignée/.test(t()),'la date de signature manquante est rappelée');
  chk(/Le contrat rédigé avant signature reste ici/.test(t()),'le contrat rédigé reste accessible');

  /* glisser-déposer */
  await TR.act(async()=>{await zone().props.onDrop({preventDefault(){},dataTransfer:{files:[fichier('retour.pdf','application/pdf')]}})});
  chk(envois.length===3&&/signé \(3\)\.pdf$/.test(envois[2].nom)&&data.marches[0].signes.length===3,'un fichier glissé sur la zone part de même');

  /* retirer un fichier déposé par erreur */
  TR.act(()=>{btn(/^Retirer Marché 2 — GROS ŒUVRE — SAS Fictive — signé \(3\)\.pdf$/).props.onClick()});
  m=data.marches[0];
  chk(m.signes.length===2&&m.contratLien==='https://drive.google.com/file/d/s2/view','retiré : la liste et le contrat du lot reviennent au précédent');

  /* le Drive refuse : rien n'est rattaché, on dit pourquoi */
  refus=true;
  await TR.act(async()=>{await champ().props.onChange({target:{files:[fichier('x.pdf','application/pdf')],value:''}})});
  chk(data.marches[0].signes.length===2&&/« x\.pdf » n’a pas pu partir sur le Drive/.test(t())&&/le Drive de ce compte Google est plein/.test(t()),'refus du Drive : rien d’ajouté, la raison est dite');
  refus=false;

  /* « Annuler » ne fait pas oublier ce qui est déjà sur le Drive */
  TR.act(()=>{btn(/^Annuler$/).props.onClick()});
  chk(data.marches[0].signes.length===2,'formulaire annulé : les marchés signés restent rattachés');

  /* 3. la liste des lots : le volet montre la liste et range un ajout de même */
  TR.act(()=>{btn(/^Voir le marché de travaux$/).props.onClick({stopPropagation(){},preventDefault(){}})});
  chk(/MARCHÉ DE TRAVAUX SIGNÉ/.test(t())&&/SAS Fictive — signé\.pdf/.test(t())&&/\+ Ajouter un fichier signé/.test(t()),'volet de la liste : les fichiers signés');
  const inp=tr.root.findAll(n=>n.type==='input'&&n.props.type==='file').find(n=>/Ajouter un fichier signé/.test(norm(texteInst(n.parent))));
  await TR.act(async()=>{await inp.props.onChange({target:{files:[fichier('scan3.pdf','application/pdf')],value:''}})});
  chk(data.marches[0].signes.length===3&&/signé \(3\)\.pdf$/.test(envois[envois.length-1].nom),'ajout depuis la liste : même dossier, même nom, même liste');
  TR.act(()=>tr.unmount());

  /* 4. le tableau de bord : un marché à relancer, déposé d'un geste */
  let patchRelance=null;
  const LR={id:'m9',chantierId:'c1',lot:'CHARPENTE',artisanId:'a1',montantHT:500,statut:'devis'};
  let tr2;TR.act(()=>{tr2=TR.create(React.createElement(M.RelanceMarche,{ch:CH,m:LR,a:ART,majMarche:(id,p)=>{patchRelance=p}}))});
  await TR.act(async()=>{await tr2.root.findAll(n=>n.type==='input')[0].props.onChange({target:{files:[fichier('c.pdf','application/pdf')],value:''}})});
  chk(patchRelance&&patchRelance.statut==='signe'&&patchRelance.signes.length===1&&/^Marché CHARPENTE — SAS Fictive — signé\.pdf$/.test(patchRelance.signes[0].nom),
    'tableau de bord : rangé dans la liste du lot, statut « signé »');
  TR.act(()=>tr2.unmount());
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
