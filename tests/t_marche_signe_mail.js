/* Marchés › fiche du lot : envoyer à l'artisan, par mail, le marché revenu
   signé — chaque fichier déposé, repris du Drive tel quel — avec d'office
   les plans d'exécution du chantier (le permis reste à cocher). Le marché
   à signer peut toujours être renvoyé comme avant. Un fichier signé
   illisible est nommé ; un chantier sans plan d'exécution le dit. Drive et
   messagerie simulés ; données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const {chk,fin}=verif();
const envois=[];let illisibles=new Set();
const M=charger(['Marches','EMPTY'],{
  drive:{S1:Buffer.from('%PDF marché signé'),S2:Buffer.from('JPEG page 2'),PE1:Buffer.from('%PDF plan exe'),PC1:Buffer.from('%PDF plan pc')},
  fetch:async(url,init,base)=>{
    const m=url.match(/files\/([^/?]+)\?alt=media/);
    if(m&&illisibles.has(m[1]))return {ok:false,status:404,json:async()=>({error:{code:404,message:'File not found: '+m[1]+'.',errors:[{reason:'notFound'}]}})};
    if(/gmail\/v1\/users\/me\/messages\/send/.test(url)){envois.push(JSON.parse(init.body).raw);return {ok:true,status:200,json:async()=>({id:'m1'})}}
    return base(url,init);
  }});
const decode=raw=>decodeURIComponent(escape(Buffer.from(raw.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('binary')));
const lien=id=>'https://drive.google.com/file/d/'+id+'/view';
const docs={plans_pc:{fichiers:[{id:'p1',nom:'Plan de masse PC.pdf',lien:lien('PC1')}]},
  plans_exe:{fichiers:[{id:'e1',nom:'Plans exe terrassement.pdf',lien:lien('PE1')}]}};
const CH={id:'c1',nom:'Maison Fictive',client:'M. Fictif',adresse:'1 rue Fictive',tva:20,docs};
const ART={id:'a1',nom:'SAS Terrassement Fictive',email:'artisan@example.fr'};
const SIGNES=[{id:'d1',nom:'Marché 1 — TERRASSEMENT — SAS Terrassement Fictive — signé.pdf',lien:lien('S1'),le:'2026-11-05'},
  {id:'d2',nom:'Marché 1 — TERRASSEMENT — SAS Terrassement Fictive — signé (2).jpg',lien:lien('S2'),le:'2026-11-05'}];
const LOT={id:'m1',chantierId:'c1',lot:'TERRASSEMENT',numeroMarche:'1',artisanId:'a1',montantHT:1000,tva:20,statut:'signe',factures:[],
  contratLien:lien('S2'),signes:SIGNES};

function ouvrir(ch,lot){
  let data={...M.EMPTY,chantiers:[ch],artisans:[ART],marches:[lot],commandes:[]}, tr;
  const props=()=>({data,ch,save:d=>{data=d;TR.act(()=>{tr.update(React.createElement(M.Marches,props()))})},eng:0,fac:0,onFacturerCmd(){},onFacturerHono(){}});
  TR.act(()=>{tr=TR.create(React.createElement(M.Marches,props()))});
  const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
  TR.act(()=>{btn(/Modifier le lot/).props.onClick()});
  return {tr,btn,data:()=>data,t:()=>norm(texteInst(tr.root)),
    case:nom=>tr.root.findAll(n=>n.type==='input'&&n.props.type==='checkbox').find(n=>norm(texteInst(n.parent)).includes(nom))};
}

(async()=>{
  /* 1. depuis la section du marché signé : l'aperçu, les pièces cochées d'office */
  let o=ouvrir(CH,LOT);
  chk(!!o.btn(/^Envoyer le marché signé$/)&&!!o.btn(/^Renvoyer le marché à signer$/),
    'section du mail : « Envoyer le marché signé » et « Renvoyer le marché à signer »');
  TR.act(()=>{o.btn(/Envoyer le marché signé à l’artisan \(avec le plan d’exécution\)/).props.onClick()});
  const sujet=o.tr.root.findAll(n=>n.type==='input'&&n.props.value&&/^Marché signé/.test(n.props.value))[0];
  const corps=o.tr.root.findAll(n=>n.type==='textarea')[0].props.value;
  chk(sujet&&sujet.props.value==='Marché signé n° 1 — TERRASSEMENT — Maison Fictive','objet : marché signé, numéro, lot, chantier');
  chk(/votre marché de travaux signé ainsi que les plans d'exécution pour le chantier Maison Fictive/.test(corps)&&!/Merci de me retourner le marché signé/.test(corps),
    'message : le marché signé et les plans d’exécution, sans réclamer de signature');
  let t=o.t();
  chk(/PIÈCES JOINTES \(3\)/.test(t)&&!/toujours joint, en PDF/.test(t),'trois pièces : les deux fichiers signés et le plan d’exécution');
  chk(o.case('signé.pdf').props.checked&&o.case('signé (2).jpg').props.checked&&o.case('Plans exe terrassement.pdf').props.checked
    &&!o.case('Plan de masse PC.pdf').props.checked,'cochés d’office : marché signé et plans d’exécution ; le permis reste à cocher');

  /* 2. l'envoi : les fichiers déposés, tels quels, sans conversion */
  await TR.act(async()=>{await o.btn(/^Envoyer$/).props.onClick()});
  const mail=envois[0]?decode(envois[0]):'';
  chk(envois.length===1&&/artisan@example\.fr/.test(mail),'un mail part à l’artisan');
  chk(/filename="Marche 1 - TERRASSEMENT - SAS Terrassement Fictive - signe\.pdf"/.test(mail)&&/- signe \(2\)\.jpg"/.test(mail)&&/Plans exe terrassement\.pdf/.test(mail)&&!/Plan de masse PC/.test(mail),
    'pièces jointes : les deux fichiers signés et le plan d’exécution');
  chk(mail.includes(Buffer.from('%PDF marché signé').toString('base64'))&&mail.includes(Buffer.from('%PDF plan exe').toString('base64')),
    'les fichiers partent tels qu’ils sont sur le Drive');
  chk(!global.__driveAppels.some(x=>/export|convert|uploadType=multipart/.test(x.url)),'aucun marché rédigé ni converti : c’est le signé qui part');
  t=o.t();
  chk(/Mail envoyé à artisan@example\.fr/.test(t)&&o.data().marches[0].mailSigneLe===new Date().toISOString().slice(0,10),
    'confirmé à l’écran, et la date d’envoi est gardée sur le lot');
  TR.act(()=>{o.btn(/^Fermer$/).props.onClick()});
  chk(/Marché signé envoyé à l’artisan le \d\d\/\d\d\/\d{4}/.test(o.t()),'la date d’envoi se relit');

  /* 3. un seul des fichiers signés */
  envois.length=0;
  TR.act(()=>{o.btn(/^Envoyer le marché signé$/).props.onClick()});
  TR.act(()=>{o.case('signé (2).jpg').props.onChange()});
  chk(/PIÈCES JOINTES \(2\)/.test(o.t()),'décoché : deux pièces');
  await TR.act(async()=>{await o.btn(/^Envoyer$/).props.onClick()});
  const mail2=decode(envois[0]);
  chk(/- signe\.pdf"/.test(mail2)&&!/- signe \(2\)\.jpg"/.test(mail2),'seul le fichier coché part');
  TR.act(()=>{o.btn(/^Fermer$/).props.onClick()});

  /* 4. un fichier signé illisible sur le Drive : nommé, rien ne part */
  envois.length=0;illisibles=new Set(['S2']);
  TR.act(()=>{o.btn(/^Envoyer le marché signé$/).props.onClick()});
  await TR.act(async()=>{await o.btn(/^Envoyer$/).props.onClick()});
  t=o.t();
  chk(!envois.length&&/« Marché 1 — TERRASSEMENT — SAS Terrassement Fictive — signé \(2\)\.jpg » ne se lit pas sur le Drive/.test(t)
    &&/Redéposez-le dans la section « Marché signé par l’entreprise »/.test(t),'illisible : nommé, avec quoi faire ; rien ne part');
  illisibles=new Set();
  TR.act(()=>o.tr.unmount());

  /* 5. le marché à signer se renvoie comme avant */
  o=ouvrir(CH,LOT);
  TR.act(()=>{o.btn(/^Renvoyer le marché à signer$/).props.onClick()});
  t=o.t();
  const corps2=o.tr.root.findAll(n=>n.type==='textarea')[0].props.value;
  chk(/toujours joint, en PDF/.test(t)&&/Merci de me retourner le marché signé/.test(corps2)&&o.case('Plan de masse PC.pdf').props.checked,
    'marché à signer : le PDF rédigé, permis et plans d’exécution cochés, comme avant');
  TR.act(()=>o.tr.unmount());

  /* 6. un chantier sans plan d'exécution déposé : on le dit */
  o=ouvrir({...CH,docs:{plans_pc:docs.plans_pc}},LOT);
  TR.act(()=>{o.btn(/^Envoyer le marché signé$/).props.onClick()});
  chk(/Aucun plan d’exécution n’est déposé dans l’onglet PIÈCES du chantier/.test(o.t())&&/PIÈCES JOINTES \(2\)/.test(o.t()),
    'sans plan d’exécution : signalé, le marché signé part seul');
  TR.act(()=>o.tr.unmount());

  /* 7. un lot sans marché signé : l'envoi d'avant, inchangé */
  o=ouvrir(CH,{...LOT,signes:[],contratLien:lien('X')});
  chk(!!o.btn(/^Préparer l’envoi$/)&&!o.btn(/^Envoyer le marché signé$/)&&!/Envoyer le marché signé à l’artisan/.test(o.t()),
    'sans marché signé : seulement « Préparer l’envoi », comme avant');
  TR.act(()=>o.tr.unmount());

  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
