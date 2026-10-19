/* ARTISANS › « Vérifier les pièces sur le Drive » : chaque attestation et
   chaque RIB du carnet est interrogé sur le Drive (sa fiche seulement, pas
   le fichier). Ceux qui ne se lisent pas avec le compte connecté sont
   listés avec la raison, et se redéposent sur place : le lien de la fiche
   est remplacé. Drive simulé ; données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const {chk,fin}=verif();
const appels=[];
const M=charger(['Artisans','verifierPiecesArtisans','EMPTY'],{fetch:async(url,init,base)=>{
  appels.push(url);
  const m=url.match(/drive\/v3\/files\/([^/?]+)\?fields=id,name,trashed/);
  if(m){
    if(m[1]==='A1')return {ok:false,status:404,json:async()=>({error:{code:404,message:'File not found: A1.',errors:[{reason:'notFound'}]}})};
    if(m[1]==='A2')return {ok:true,status:200,json:async()=>({id:'A2',name:'att.pdf',trashed:true})};
    return {ok:true,status:200,json:async()=>({id:m[1],name:m[1]+'.pdf',trashed:false})};
  }
  if(/drive\/v3\/about/.test(url))return {ok:true,status:200,json:async()=>({user:{emailAddress:'compte.fictif@example.fr'}})};
  return base(url,init);
}});
const lien=id=>'https://drive.google.com/file/d/'+id+'/view';
const ARTS=[
  {id:'a1',nom:'SARL Isolation Fictive',corps:'Isolation',lienAttestation:lien('A1'),lienRib:lien('R1')},
  {id:'a2',nom:'EI Plomberie Fictive',corps:'Plomberie',lienAttestation:lien('A2'),lienRib:''},
  {id:'a3',nom:'SAS Électricité Fictive',corps:'Électricité',lienAttestation:'https://exemple.fr/attestation.pdf',lienRib:lien('R3')},
];
const texte=tr=>norm(texteInst(tr.toJSON()));
const bouton=(tr,re)=>tr.root.findAll(n=>n.type==='button'&&re.test(norm(texteInst(n))))[0];

(async()=>{
  /* le moteur */
  const L=await M.verifierPiecesArtisans(ARTS,'j');
  const etat=(id,cle)=>(L.find(x=>x.artisanId===id&&x.cle===cle)||{}).etat;
  chk(L.length===5,'cinq pièces déposées à vérifier (le RIB vide n’en est pas une)');
  chk(etat('a1','att')==='illisible'&&/illisible avec ce compte Google/.test(L.find(x=>x.artisanId==='a1'&&x.cle==='att').raison),'attestation déposée depuis un autre compte : illisible, raison donnée');
  chk(etat('a2','att')==='illisible'&&/corbeille/.test(L.find(x=>x.artisanId==='a2').raison),'attestation à la corbeille : illisible');
  chk(etat('a1','rib')==='ok'&&etat('a3','rib')==='ok','RIB déposés avec ce compte : lisibles');
  chk(etat('a3','att')==='hors_drive','lien vers un autre site : hors Drive, non vérifié');
  chk(!appels.some(u=>/alt=media/.test(u)),'rien n’est téléchargé : seule la fiche de chaque pièce est demandée');

  /* l'écran */
  let data={...M.EMPTY,artisans:ARTS,marches:[]};
  let tr;const el=()=>React.createElement(M.Artisans,{data,save:d=>{data=d;TR.act(()=>tr.update(el()))}});
  TR.act(()=>{tr=TR.create(el())});
  await TR.act(async()=>{await bouton(tr,/Vérifier les pièces sur le Drive/).props.onClick()});
  let t=texte(tr);
  chk(/5 pièces vérifiées avec le compte compte\.fictif@example\.fr : 2 lisibles, 2 illisibles, 1 hors Drive/.test(t),'bilan : lisibles, illisibles, hors Drive, et le compte utilisé');
  chk(/SARL Isolation Fictive — Attestation décennale/.test(t)&&/EI Plomberie Fictive — Attestation décennale/.test(t)&&!/SAS Électricité Fictive — RIB/.test(t),
    'seules les pièces illisibles sont listées');
  const champ=tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Redéposer Attestation décennale SARL Isolation Fictive')[0];
  await TR.act(async()=>{await champ.props.onChange({target:{files:[new File([Buffer.from('%PDF')],'attestation.pdf',{type:'application/pdf'})],value:''}})});
  const a1=data.artisans.find(a=>a.id==='a1');
  chk(/drive\.google\.com/.test(a1.lienAttestation)&&a1.lienAttestation!==lien('A1')&&a1.lienRib===lien('R1'),'redéposée : le lien de l’attestation est remplacé, le RIB intact');
  t=texte(tr);
  chk(/SARL Isolation Fictive — Attestation décennale · ✓ redéposé/.test(t),'la ligne le confirme');
  TR.act(()=>tr.unmount());
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
