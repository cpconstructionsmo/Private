/* Facture visée : chaque pièce jointe se relit sur le Drive. Une pièce qui
   ne se lit pas avec le compte connecté (déposée depuis un autre compte
   Google) est nommée, au lieu de « Téléchargement depuis le Drive
   impossible » ; on peut envoyer sans elle, et le message ne l'annonce
   plus. Si c'est la facture elle-même, on le dit et rien ne part. Drive
   et messagerie simulés ; données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const {chk,fin}=verif();
let illisibles=new Set(['A1']);const envois=[];
const M=charger(['ViserFacture','EMPTY'],{drive:{F1:Buffer.from('%PDF facture')},fetch:async(url,init,base)=>{
  const m=url.match(/files\/([^/?]+)\?alt=media/);
  if(m&&illisibles.has(m[1]))return {ok:false,status:404,json:async()=>({error:{code:404,message:'File not found: '+m[1]+'.',errors:[{reason:'notFound'}]}})};
  if(/gmail\/v1\/users\/me\/messages\/send/.test(url)){envois.push(JSON.parse(init.body).raw);return {ok:true,status:200,json:async()=>({id:'m1'})}}
  return base(url,init);
}});
const F={id:'f1',montant:1000,numero:'FA-1',date:'2026-10-15',lien:'https://drive.google.com/file/d/F1/view'};
const CH={id:'c1',nom:'Maison fictive',emailClient:'client@example.fr',tva:20};
const ART={id:'a1',nom:'SARL Fictive',lienRib:'',email:'artisan@example.fr',lienAttestation:'https://drive.google.com/file/d/A1/view'};
const texte=tr=>norm(texteInst(tr.toJSON()));
const bouton=(tr,re)=>tr.root.findAll(n=>n.type==='button'&&re.test(norm(texteInst(n))))[0];
const decode=raw=>Buffer.from(raw.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8');

(async()=>{
  let tr;TR.act(()=>{tr=TR.create(React.createElement(M.ViserFacture,{f:F,ch:CH,art:ART,data:{...M.EMPTY},lot:'Plomberie'}))});
  TR.act(()=>bouton(tr,/Viser et envoyer au client/).props.onClick());
  const corps0=tr.root.findAll(n=>n.type==='textarea')[0].props.value;
  chk(/attestation d’assurance décennale/.test(corps0),'le message annonce l’attestation décennale déposée');
  await TR.act(async()=>{await bouton(tr,/^Envoyer$/).props.onClick()});
  let t=texte(tr);
  chk(/Cette pièce ne se lit pas sur le Drive/.test(t)&&/Attestation décennale — SARL Fictive\.pdf/.test(t)
    &&/illisible avec ce compte Google/.test(t),'l’attestation illisible est nommée, avec la raison');
  chk(!envois.length,'rien n’est parti');
  TR.act(()=>bouton(tr,/Envoyer sans cette pièce/).props.onClick());
  t=texte(tr);
  const corps1=tr.root.findAll(n=>n.type==='textarea')[0].props.value;
  chk(!/attestation/.test(corps1)&&/sans son attestation décennale, illisible sur le Drive/.test(t),'le message ne l’annonce plus, le récapitulatif le dit');
  await TR.act(async()=>{await bouton(tr,/^Envoyer$/).props.onClick()});
  t=texte(tr);
  const mail=envois[0]?decode(envois[0]):'';
  chk(/Facture visée envoyée/.test(t)&&/Facture FA-1/.test(decodeURIComponent(mail))&&!/Attestation/.test(decodeURIComponent(mail)),
    'envoyé avec la facture, sans l’attestation');
  TR.act(()=>tr.unmount());

  /* la facture elle-même illisible : on le dit, rien ne part */
  illisibles=new Set(['F1']);envois.length=0;
  TR.act(()=>{tr=TR.create(React.createElement(M.ViserFacture,{f:F,ch:CH,art:{...ART,lienAttestation:''},data:{...M.EMPTY},lot:'Plomberie'}))});
  TR.act(()=>bouton(tr,/Viser et envoyer au client/).props.onClick());
  await TR.act(async()=>{await bouton(tr,/^Envoyer$/).props.onClick()});
  t=texte(tr);
  chk(/la facture elle-même ne se lit pas sur le Drive/.test(t)&&/Remplacez-la/.test(t)&&!envois.length,'facture illisible : dit, avec quoi faire ; rien ne part');
  TR.act(()=>tr.unmount());
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
