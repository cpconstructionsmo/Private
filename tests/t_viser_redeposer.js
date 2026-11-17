/* Facture visée : une attestation (ou un RIB) que le compte Google connecté
   ne relit pas — déposée depuis un autre compte, ou directement dans le
   Drive — se signale dès l'ouverture du message, avant « Envoyer », et se
   redépose sur place : le lien de la fiche de l'artisan est remplacé, la
   pièce repart avec la facture. Même chose si elle n'apparaît qu'à l'envoi.
   Drive et messagerie simulés ; données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const {chk,fin}=verif();
let fiche404=new Set(['A1']), media404=new Set(['A1']);const envois=[];
const M=charger(['ViserFacture','EMPTY'],{drive:{F1:Buffer.from('%PDF facture')},fetch:async(url,init,base)=>{
  const refus=id=>({ok:false,status:404,json:async()=>({error:{code:404,message:'File not found: '+id+'.',errors:[{reason:'notFound'}]}})});
  let m=url.match(/files\/([^/?]+)\?alt=media/);
  if(m&&media404.has(m[1]))return refus(m[1]);
  m=url.match(/files\/([^/?]+)\?fields=/);
  if(m&&fiche404.has(decodeURIComponent(m[1])))return refus(m[1]);
  if(m)return {ok:true,status:200,json:async()=>({id:m[1],name:'piece.pdf',trashed:false})};
  if(/gmail\/v1\/users\/me\/messages\/send/.test(url)){envois.push(JSON.parse(init.body).raw);return {ok:true,status:200,json:async()=>({id:'m1'})}}
  return base(url,init);
}});
const F={id:'f1',montant:1000,numero:'FA-1',date:'2026-10-15',lien:'https://drive.google.com/file/d/F1/view'};
const CH={id:'c1',nom:'Maison fictive',emailClient:'client@example.fr',tva:20};
const ART={id:'a1',nom:'SARL Fictive',lienRib:'',email:'artisan@example.fr',lienAttestation:'https://drive.google.com/file/d/A1/view'};
const texte=tr=>norm(texteInst(tr.toJSON()));
const bouton=(tr,re)=>tr.root.findAll(n=>n.type==='button'&&re.test(norm(texteInst(n))))[0];
const decode=raw=>decodeURIComponent(Buffer.from(raw.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'));
const attendre=async(tr,cond)=>{for(let i=0;i<150&&!cond();i++)await TR.act(()=>new Promise(r=>setTimeout(r,10)))};
const PDF=()=>new File([Buffer.from('%PDF attestation')],'attestation.pdf',{type:'application/pdf'});

(async()=>{
  /* ---- 1) signalée dès l'ouverture, redéposée avant d'envoyer ---- */
  let data={...M.EMPTY,artisans:[ART]};
  let tr;
  const monter=()=>React.createElement(M.ViserFacture,{f:F,ch:CH,art:data.artisans[0],data,lot:'Plomberie',save});
  function save(n){data=n;TR.act(()=>tr.update(monter()))}
  TR.act(()=>{tr=TR.create(monter())});
  TR.act(()=>bouton(tr,/Viser et envoyer au client/).props.onClick());
  await attendre(tr,()=>/ne se lit pas sur le Drive/.test(texte(tr)));
  let t=texte(tr);
  chk(/Cette pièce ne se lit pas sur le Drive/.test(t)&&/Attestation décennale — SARL Fictive/.test(t),'dès l’ouverture, avant « Envoyer » : l’attestation illisible est nommée');
  chk(/autre compte Google, ou directement dans le Drive/.test(t),'le pourquoi : déposée depuis un autre compte, ou directement dans le Drive');
  const champ=()=>tr.root.findAll(n=>n.type==='input'&&n.props.type==='file'&&/Redéposer Attestation décennale/.test(n.props['aria-label']||''))[0];
  chk(!!champ(),'« Redéposer ici », sur place');
  chk(!!tr.root.findAll(n=>n.type==='a'&&n.props.href===ART.lienAttestation)[0],'« Ouvrir » : la pièce, pour en enregistrer le PDF');
  await TR.act(async()=>{await champ().props.onChange({target:{files:[PDF()],value:''}})});
  await attendre(tr,()=>/redéposée sur la fiche/.test(texte(tr)));
  const lien=data.artisans[0].lienAttestation;
  chk(lien!==ART.lienAttestation&&/drive\.google\.com\/file\/d\//.test(lien),'le lien de la fiche de l’artisan est remplacé par la pièce redéposée');
  t=texte(tr);
  chk(/✓ Attestation décennale redéposée sur la fiche de SARL Fictive : elle partira avec la facture/.test(t)&&!/ne se lit pas sur le Drive/.test(t),
    'redéposée : dit, et l’alerte disparaît');
  await TR.act(async()=>{await bouton(tr,/^Envoyer$/).props.onClick()});
  await attendre(tr,()=>/Facture visée envoyée/.test(texte(tr)));
  chk(envois.length===1&&/Attestation décennale — SARL Fictive/.test(decode(envois[0])),'envoyé avec l’attestation redéposée');
  TR.act(()=>tr.unmount());

  /* ---- 2) illisible seulement à l'envoi : redéposée depuis l'écran d'erreur ---- */
  fiche404=new Set();media404=new Set(['A1']);envois.length=0;
  data={...M.EMPTY,artisans:[ART]};
  TR.act(()=>{tr=TR.create(monter())});
  TR.act(()=>bouton(tr,/Viser et envoyer au client/).props.onClick());
  await attendre(tr,()=>false);
  chk(!/ne se lit pas sur le Drive/.test(texte(tr)),'la fiche se lit : pas d’alerte à l’ouverture');
  await TR.act(async()=>{await bouton(tr,/^Envoyer$/).props.onClick()});
  t=texte(tr);
  chk(/Cette pièce ne se lit pas sur le Drive avec le compte Google connecté/.test(t)&&/Redéposez-la ici/.test(t)&&!envois.length,'à l’envoi : nommée, redépôt proposé, rien n’est parti');
  await TR.act(async()=>{await champ().props.onChange({target:{files:[PDF()],value:''}})});
  await attendre(tr,()=>/redéposée sur la fiche/.test(texte(tr)));
  t=texte(tr);
  chk(/Envoyer/.test(t)&&!/Envoyer sans cette pièce/.test(t)&&/attestation d’assurance décennale/.test(tr.root.findAll(n=>n.type==='textarea')[0].props.value),
    'redéposée : retour au message, qui annonce toujours l’attestation');
  await TR.act(async()=>{await bouton(tr,/^Envoyer$/).props.onClick()});
  await attendre(tr,()=>/Facture visée envoyée/.test(texte(tr)));
  chk(envois.length===1&&/Attestation décennale — SARL Fictive/.test(decode(envois[0])),'envoyé avec l’attestation');
  TR.act(()=>tr.unmount());

  /* ---- 3) écartée puis redéposée : le message l'annonce de nouveau ---- */
  fiche404=new Set(['A1']);media404=new Set(['A1']);envois.length=0;
  data={...M.EMPTY,artisans:[ART]};
  TR.act(()=>{tr=TR.create(monter())});
  TR.act(()=>bouton(tr,/Viser et envoyer au client/).props.onClick());
  await TR.act(async()=>{await bouton(tr,/^Envoyer$/).props.onClick()});
  TR.act(()=>bouton(tr,/Envoyer sans cette pièce/).props.onClick());
  chk(!/attestation/.test(tr.root.findAll(n=>n.type==='textarea')[0].props.value),'écartée : le message ne l’annonce plus');
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
