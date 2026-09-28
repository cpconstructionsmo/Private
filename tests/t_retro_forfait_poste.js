/* La rétrocession d'un poste de chiffrage pouvait déjà se régler en
   pourcentage ; il manquait la possibilité de la fixer en un montant fixe
   quand le taux ne veut rien dire pour un corps d'état donné (2 000 €
   pour le charpentier-couvreur, par exemple, plutôt qu'un pourcentage du
   montant du lot). Le forfait, une fois saisi, remplace le calcul au
   pourcentage — exactement comme au niveau du prospect, où ce même
   remplacement existe déjà. */
const RACINE=require('path').resolve(__dirname,'..');
const fs=require('fs');const babel=require('@babel/standalone');const React=require('react');
const TR=require('react-test-renderer');
const html=fs.readFileSync(RACINE+'/index.html','utf8');
const src=html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1];
const {code}=babel.transform(src,{presets:[['react',{runtime:'classic'}]]});
global.fetch=async()=>({ok:true,json:async()=>({})});
global.window={navigator:{},matchMedia:()=>({matches:false}),location:{origin:'https://x',pathname:'/',hash:'',search:''},crypto:require('crypto').webcrypto,open(){}};
global.crypto=require('crypto').webcrypto;global.TextEncoder=require('util').TextEncoder;global.TextDecoder=require('util').TextDecoder;
global.Blob=require('buffer').Blob;global.File=require('buffer').File;
global.location=global.window.location;global.history={replaceState(){}};
global.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.localStorage={getItem:()=>null,setItem(){}};
global.indexedDB={open(){const r={};setTimeout(()=>r.onerror&&r.onerror(),0);return r}};
global.document={getElementById:()=>({}),createElement:()=>({})};
global.supabase={createClient:()=>({auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>({select:()=>({eq:()=>({single:()=>Promise.resolve({data:null})})}),upsert:()=>Promise.resolve({})}),channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}})};
global.ReactDOM={createRoot:()=>({render(){}})};
global.alert=()=>{};global.confirm=()=>true;
const mod=new Function('React','ReactDOM','supabase','window','location','history','sessionStorage','localStorage','indexedDB','document','fetch','crypto','TextEncoder','TextDecoder','alert','confirm',
  code+'\n;return {posteRetro,retroTauxAffiche,prospectPostesRetro,prospectRetro,PostesChiffrage,DetailProspect,'
  +'genererChiffrageInterneDocx,lireDocumentLignes,EMPTY};');
const M=mod(React,global.ReactDOM,global.supabase,global.window,global.location,global.history,global.sessionStorage,global.localStorage,global.indexedDB,global.document,global.fetch,global.crypto,global.TextEncoder,global.TextDecoder,global.alert,global.confirm);
const TestRenderer=require('react-test-renderer');
const texteInst=n=>typeof n==='string'?n:(!n||!n.children?'':n.children.map(texteInst).join(''));
const norm=s=>s.normalize('NFC').replace(/[   ]/g,' ');
let ko=0;const chk=(c,m)=>{if(!c){console.error('KO  '+m);ko++}else console.log('OK  '+m)};

/* ---------- 1. posteRetro et retroTauxAffiche : les fonctions pures ---------- */
{
  const parPct={id:'a',libelle:'Carrelage',montant:10000,retroPct:5};
  chk(M.posteRetro(parPct)===500,'sans forfait, la rétrocession reste calculée au pourcentage (500)');
  chk(M.retroTauxAffiche(parPct)==='5 %','et l’affichage reprend ce taux');

  const parForfait={id:'b',libelle:'Charpente / couverture',montant:27109.17,retroPct:5,retroMontant:2000};
  chk(M.posteRetro(parForfait)===2000,'un forfait saisi remplace entièrement le calcul au pourcentage (2 000 plutôt que 5 % de 27 109,17)');
  chk(M.retroTauxAffiche(parForfait)==='Forfait','l’affichage dit alors « Forfait », pas un taux');

  const forfaitZero={id:'c',libelle:'Test',montant:5000,retroPct:8,retroMontant:0};
  chk(M.posteRetro(forfaitZero)===0,'un forfait explicitement mis à 0 vaut zéro, et prime aussi sur le taux');
  chk(M.retroTauxAffiche(forfaitZero)==='Forfait','il reste bien reconnu comme un forfait, pas comme une case vide');

  const vide={id:'d',libelle:'Rien',montant:1000,retroPct:'',retroMontant:''};
  chk(M.posteRetro(vide)===0,'sans rien de saisi, la rétrocession est nulle');
  chk(M.retroTauxAffiche(vide)==='—','et l’affichage le dit clairement');

  chk(M.posteRetro(null)===0&&M.posteRetro(undefined)===0,'un poste absent ne casse rien');

  /* le total du prospect prend en compte les forfaits comme les taux */
  const p={postes:[parPct,parForfait],optionsChiffrage:[]};
  chk(M.prospectPostesRetro(p)===2500,'le total additionne un poste au taux et un poste au forfait (500+2 000)');
  chk(M.prospectRetro(p)===2500,'et c’est bien ce total qui l’emporte pour le prospect');
}

/* ---------- 2. PostesChiffrage : le champ € forfait, à côté du taux ---------- */
{
  let L=[{id:'x1',libelle:'CHARPENTE / COUVERTURE',montant:27109.17,retroPct:''}];
  let tr;
  const onChange=v=>{L=v;TR.act(()=>{tr.update(React.createElement(M.PostesChiffrage,{data:M.EMPTY,save(){},postes:L,onChange}))})};
  TR.act(()=>{tr=TestRenderer.create(React.createElement(M.PostesChiffrage,{data:M.EMPTY,save(){},postes:L,onChange}))});
  const t=()=>norm(texteInst(tr.root));
  chk(/forfait/.test(t()),'le champ forfait est proposé à côté du taux');
  const champForfait=tr.root.findAll(n=>n.type==='input'&&n.props.placeholder==='€ forfait')[0];
  chk(champForfait.props.value==='','le forfait est vide au départ');
  TR.act(()=>{champForfait.props.onChange({target:{value:'2000'}})});
  chk(String(L[0].retroMontant)==='2000','le montant saisi se retrouve sur le poste');
  chk(/soit 2 000 €/.test(t()),'et le montant qui en résulte s’affiche aussitôt, sans attendre un montant de poste recalculé ailleurs');
  TR.act(()=>{tr.unmount()});
}

/* ---------- 3. le chiffrage interne : « Forfait » plutôt qu’un taux ---------- */
(async()=>{
  const p={id:'p1',nom:'Maison Test',client:'M. Test',margePct:10,tva:20,
    postes:[{id:'a',libelle:'CHARPENTE / COUVERTURE',montant:27109.17,retroMontant:2000}],
    optionsChiffrage:[],navette:{},chiffrages:[],plans:[],pieces:[],pj:{}};
  const outInt=await M.genererChiffrageInterneDocx(p);
  const ab=outInt.buffer.slice(outInt.byteOffset,outInt.byteOffset+outInt.byteLength);
  const relu=await M.lireDocumentLignes({name:'ci.docx',type:'',arrayBuffer:async()=>ab});
  const t=norm(relu.txt);
  chk(/Forfait/.test(t),'le document interne indique « Forfait » plutôt qu’un pourcentage');
  chk(/2 000,00 €/.test(t),'et reprend le montant rétrocédé correspondant');

  /* ---------- 4. la fiche du prospect ---------- */
  let tr;
  TestRenderer.act(()=>{tr=TestRenderer.create(React.createElement(M.DetailProspect,{p,maj(){},data:M.EMPTY}))});
  const t2=norm(texteInst(tr.root));
  chk(/rétrocession forfait soit 2 000 €/.test(t2),'la fiche du prospect dit « forfait », avec le montant retenu');
  TestRenderer.act(()=>{tr.unmount()});

  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
  process.exitCode=ko?1:0;
})().catch(e=>{console.error('ERREUR NON CAPTURÉE',e);process.exitCode=1});
