/* Marchés › Achats de matériaux : la facture d'un achat, une fois déposée,
   se transmet au client depuis son volet (« Envoyer au client »). Aperçu à
   relire (objet, message : fournisseur, numéro, montant TTC, objet de
   l'achat), facture reprise du Drive avec sa vraie extension, date d'envoi
   gardée sur la facture. Une facture illisible le dit ; sans e-mail du
   client, rien ne s'ouvre. Drive et messagerie simulés ; données fictives. */
const fs=require('fs');const path=require('path');
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const {chk,fin}=verif();
const JPG=fs.readFileSync(path.join(__dirname,'fixtures','photo_exif.jpg'));
const envois=[];let illisibles=new Set();
const M=charger(['Marches','EMPTY'],{
  drive:{F1:Buffer.from('%PDF facture fictive'),F2:JPG},
  fetch:async(url,init,base)=>{
    const m=url.match(/files\/([^/?]+)\?alt=media/);
    if(m&&illisibles.has(m[1]))return {ok:false,status:404,json:async()=>({error:{code:404,message:'File not found: '+m[1]+'.',errors:[{reason:'notFound'}]}})};
    if(/gmail\/v1\/users\/me\/messages\/send/.test(url)){envois.push(JSON.parse(init.body).raw);return {ok:true,status:200,json:async()=>({id:'m1'})}}
    return base(url,init);
  }});
const decode=raw=>Buffer.from(raw.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8');
const lien=id=>'https://drive.google.com/file/d/'+id+'/view';
const CH={id:'c1',nom:'Maison Fictive',client:'M. Fictif',emailClient:'client@example.fr',tva:20};
const CMD={id:'k1',chantierId:'c1',fournisseur:'SAS Matériaux Fictifs',designation:'Menuiseries fictives',montant:3000,tva:20,statut:'commande',
  factures:[{id:'f1',montant:1000,numero:'FA-9',date:'2026-10-26',lien:lien('F1')},{id:'f2',montant:500,numero:'FA-10',date:'2026-10-27',lien:lien('F2')}]};
const MARCHE={id:'m1',chantierId:'c1',lot:'PLOMBERIE',artisanId:'a1',montantHT:2000,tva:20,statut:'signe',
  factures:[{id:'g1',montant:800,numero:'FM-1',date:'2026-10-20',lien:lien('F1')}]};

function ouvrir(ch,cmd){
  let data={...M.EMPTY,chantiers:[ch],artisans:[{id:'a1',nom:'SARL Plomberie Fictive'}],marches:[MARCHE],commandes:[cmd]}, tr;
  const props=()=>({data,ch,save:d=>{data=d;TR.act(()=>{tr.update(React.createElement(M.Marches,props()))})},eng:0,fac:0,onFacturerCmd(){},onFacturerHono(){}});
  TR.act(()=>{tr=TR.create(React.createElement(M.Marches,props()))});
  const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n)))||re.test(n.props['aria-label']||''));
  const btns=re=>tr.root.findAll(n=>n.type==='button').filter(n=>re.test(n.props['aria-label']||''));
  return {tr,btn,btns,data:()=>data,t:()=>norm(texteInst(tr.root))};
}
const ev={stopPropagation(){},preventDefault(){}};

(async()=>{
  /* 1. le volet de la première facture d'achat : « Envoyer au client » */
  let o=ouvrir(CH,CMD);
  /* les justificatifs, dans l'ordre : facture du marché, puis les deux de l'achat */
  TR.act(()=>{o.btns(/^Voir le justificatif$/)[1].props.onClick(ev)});
  chk(!!o.btn(/^Envoyer au client$/)&&!o.btn(/Viser et envoyer au client/),'facture d’achat : « Envoyer au client » (pas de visa d’artisan)');
  TR.act(()=>{o.btn(/^Envoyer au client$/).props.onClick()});
  const sujet=o.tr.root.findAll(n=>n.type==='input'&&n.props.value&&/^Facture/.test(n.props.value))[0];
  const corps=o.tr.root.findAll(n=>n.type==='textarea')[0].props.value;
  chk(sujet&&sujet.props.value==='Facture n° FA-9 — SAS Matériaux Fictifs','objet : numéro et fournisseur');
  chk(/la facture n° FA-9 de SAS Matériaux Fictifs, d’un montant de 1 200,00 € TTC, pour l’achat « Menuiseries fictives »\./.test(norm(corps)),
    'message : fournisseur, numéro, montant TTC, objet de l’achat');
  chk(/DESTINATAIRE/.test(o.t())&&/client@example\.fr/.test(o.t()),'destinataire : le client');

  /* 2. l'envoi */
  await TR.act(async()=>{await o.btn(/^Envoyer$/).props.onClick()});
  const mail=envois[0]?decode(envois[0]):'';
  chk(envois.length===1&&/To: client@example\.fr/i.test(mail),'un mail part au client');
  chk(/filename="Facture FA-9 - SAS Materiaux Fictifs\.pdf"/.test(mail)&&/application\/pdf/.test(mail)
    &&mail.includes(Buffer.from('%PDF facture fictive').toString('base64')),'la facture jointe, telle qu’elle est sur le Drive');
  const today=new Date().toISOString().slice(0,10);
  chk(o.data().commandes[0].factures[0].envoyeeClientLe===today&&!o.data().commandes[0].factures[1].envoyeeClientLe,'la date d’envoi est gardée sur cette facture seulement');
  chk(/✓ Facture envoyée à client@example\.fr/.test(o.t()),'confirmé à l’écran');
  TR.act(()=>{o.btn(/^Fermer$/).props.onClick()});
  chk(!!o.btn(/^Renvoyer au client$/)&&/✓ envoyée au client le \d\d\/\d\d\/\d{4}/.test(o.t())&&/envoyée au client · FA-9/.test(o.t()),
    'ensuite : « Renvoyer au client », et la ligne de la facture le dit');
  TR.act(()=>o.tr.unmount());

  /* 3. une facture déposée en photo part en photo */
  envois.length=0;
  o=ouvrir(CH,CMD);
  TR.act(()=>{o.btns(/^Voir le justificatif$/)[2].props.onClick(ev)});
  TR.act(()=>{o.btn(/^Envoyer au client$/).props.onClick()});
  await TR.act(async()=>{await o.btn(/^Envoyer$/).props.onClick()});
  const mail2=envois[0]?decode(envois[0]):'';
  chk(/filename="Facture FA-10 - SAS Materiaux Fictifs\.jpg"/.test(mail2)&&/Content-Type: image\/jpeg/.test(mail2),'photo : jointe en .jpg, image/jpeg');
  TR.act(()=>o.tr.unmount());

  /* 4. illisible sur le Drive : dit, rien ne part, rien n'est noté */
  envois.length=0;illisibles=new Set(['F1']);
  o=ouvrir(CH,CMD);
  TR.act(()=>{o.btns(/^Voir le justificatif$/)[1].props.onClick(ev)});
  TR.act(()=>{o.btn(/^Envoyer au client$/).props.onClick()});
  await TR.act(async()=>{await o.btn(/^Envoyer$/).props.onClick()});
  chk(!envois.length&&/la facture ne se lit pas sur le Drive/.test(o.t())&&/Remplacez-la/.test(o.t())
    &&!o.data().commandes[0].factures[0].envoyeeClientLe,'illisible : dit, avec quoi faire ; rien ne part');
  illisibles=new Set();
  TR.act(()=>o.tr.unmount());

  /* 5. sans e-mail du client */
  o=ouvrir({...CH,emailClient:''},CMD);
  TR.act(()=>{o.btns(/^Voir le justificatif$/)[1].props.onClick(ev)});
  chk(!o.btn(/^Envoyer au client$/)&&/Aucun e-mail enregistré pour M\. Fictif/.test(o.t()),'sans e-mail du client : on dit où l’ajouter');
  TR.act(()=>o.tr.unmount());

  /* 6. une facture d'achat sans fichier : rien à envoyer */
  o=ouvrir(CH,{...CMD,factures:[{id:'f3',montant:200,numero:'FA-11',date:'2026-10-28',lien:''}]});
  TR.act(()=>{o.btns(/^Voir le justificatif$/)[1].props.onClick(ev)});
  chk(!o.btn(/^Envoyer au client$/)&&/Importer la facture/.test(o.t()),'facture sans fichier : à importer d’abord');
  TR.act(()=>o.tr.unmount());

  /* 7. les factures des marchés gardent leur visa */
  o=ouvrir(CH,CMD);
  TR.act(()=>{o.btns(/^Voir le justificatif$/)[0].props.onClick(ev)});
  chk(!o.btn(/^Envoyer au client$/),'facture de marché : pas de ce bouton (elle se vise)');
  TR.act(()=>o.tr.unmount());
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
