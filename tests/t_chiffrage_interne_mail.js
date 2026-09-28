/* Le chiffrage interne (marge, rétrocession, coefficient de vente — jamais
   remis au client) ne pouvait jusqu'ici que se déposer sur le Drive : il
   fallait ensuite le transmettre au commercial par un autre moyen. Un bouton
   « Envoyer par mail » doit désormais l'y joindre directement, dès qu'un
   exemplaire existe (fraîchement sorti, ou déjà déposé lors d'une session
   précédente — retenu sur la fiche via chiffrageInterneLien). */
const RACINE=require('path').resolve(__dirname,'..');
const fs=require('fs');const babel=require('@babel/standalone');const React=require('react');
const TR=require('react-test-renderer');
const html=fs.readFileSync(RACINE+'/index.html','utf8');
const src=html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1];
const {code}=babel.transform(src,{presets:[['react',{runtime:'classic'}]]});
global.fetch=async()=>({ok:true,json:async()=>({}),arrayBuffer:async()=>new ArrayBuffer(8),blob:async()=>new (require('buffer').Blob)([])});
global.window={navigator:{},matchMedia:()=>({matches:false}),location:{origin:'https://x',pathname:'/',hash:'',search:''},crypto:require('crypto').webcrypto,open(){}};
global.crypto=require('crypto').webcrypto;global.TextEncoder=require('util').TextEncoder;global.TextDecoder=require('util').TextDecoder;
global.Blob=require('buffer').Blob;global.File=require('buffer').File;
global.location=global.window.location;global.history={replaceState(){}};
const jeton={getItem:k=>k==='driveToken'?'j':k==='driveTokenExpiry'?String(Date.now()+3600e3):null,setItem(){},removeItem(){}};
global.sessionStorage=jeton;global.localStorage=jeton;
global.indexedDB={open(){const r={};setTimeout(()=>r.onerror&&r.onerror(),0);return r}};
global.document={getElementById:()=>({}),createElement:()=>({})};
global.supabase={createClient:()=>({auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>({select:()=>({eq:()=>({single:()=>Promise.resolve({data:null})})}),upsert:()=>Promise.resolve({})}),channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}})};
global.ReactDOM={createRoot:()=>({render(){}})};
global.alert=()=>{};global.confirm=()=>true;
const mod=new Function('React','ReactDOM','supabase','window','location','history','sessionStorage','localStorage','indexedDB','document','fetch','crypto','TextEncoder','TextDecoder','alert','confirm',
  code+'\n;return {SortirChiffrageInterne,EMPTY};');
const M=mod(React,global.ReactDOM,global.supabase,global.window,global.location,global.history,global.sessionStorage,global.localStorage,global.indexedDB,global.document,global.fetch,global.crypto,global.TextEncoder,global.TextDecoder,global.alert,global.confirm);
const texteInst=n=>typeof n==='string'?n:(!n||!n.children?'':n.children.map(texteInst).join(''));
const norm=s=>s.normalize('NFC').replace(/[   ]/g,' ');
let ko=0;const chk=(c,m)=>{if(!c){console.error('KO  '+m);ko++}else console.log('OK  '+m)};
const btn=(tr,re)=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));

/* un chiffrage interne déjà sorti lors d'une session précédente : le lien est
   retenu sur la fiche, sans quoi rien n'existerait à joindre aujourd'hui */
let p={id:'p1',nom:'Maison André — Saint Cyr en Pail',commercial:'Julien Marsollier',
  commercialEmail:'julien@cpconstructions.fr',
  chiffrageInterneLe:'2026-09-23',chiffrageInterneLien:'https://drive.google.com/file/d/abc123/view',
  chiffrageInterneNom:'Chiffrage interne — Maison André.docx',
  chiffrage:{},postes:[{id:'x',libelle:'Gros œuvre',prixHT:100000}]};
const data={...M.EMPTY,expediteurMail:'claude.portier@cpconstructions.fr'};
let maj_calls=[];
const maj=patch=>{maj_calls.push(patch);p={...p,...patch}};

let tr;
TR.act(()=>{tr=TR.create(React.createElement(M.SortirChiffrageInterne,{data,p,maj}))});
let t=norm(texteInst(tr.root));
chk(/Envoyer par mail à Julien Marsollier/.test(t),
  'le bouton d’envoi apparaît d’emblée, le chiffrage interne ayant déjà été sorti par le passé');

TR.act(()=>{btn(tr,/Envoyer par mail à Julien Marsollier/).props.onClick()});
t=norm(texteInst(tr.root));
chk(t.indexOf('julien@cpconstructions.fr')>=0,'le commercial est bien le destinataire');
const corps=tr.root.findAll(n=>n.type==='textarea')[0].props.value;
chk(/usage interne/i.test(corps),'le message rappelle qu’il s’agit d’un document réservé à l’usage interne');
chk(/Chiffrage interne — Maison André\.docx/.test(t),'la pièce jointe annoncée est bien le fichier retenu sur la fiche');

(async()=>{
  await TR.act(async()=>{btn(tr,/^Envoyer$/).props.onClick();await Promise.resolve();await Promise.resolve();await Promise.resolve()});
  t=norm(texteInst(tr.root));
  chk(/envoyé à julien@cpconstructions\.fr/.test(t),'l’écran confirme l’envoi au commercial');

  TR.act(()=>{tr.unmount()});

  /* --- sans commercialEmail, on ne peut pas envoyer --- */
  let p2={...p,commercialEmail:'',chiffrageInterneLien:'https://drive.google.com/file/d/xyz/view'};
  let tr2;
  TR.act(()=>{tr2=TR.create(React.createElement(M.SortirChiffrageInterne,{data,p:p2,maj:()=>{}}))});
  let t2=norm(texteInst(tr2.root));
  chk(/Aucun e-mail enregistré/.test(t2),'sans e-mail du commercial, un message l’indique au lieu du bouton d’envoi');
  chk(!/^Envoyer par mail/.test(t2.replace(/^[\s\S]*?(Envoyer par mail)/,'$1')||''),
    'et le bouton d’envoi n’apparaît logiquement pas');
  TR.act(()=>{tr2.unmount()});

  /* --- sans chiffrage interne jamais sorti, aucun envoi n'est proposé --- */
  let p3={id:'p3',nom:'Projet neuf',commercial:'Julien',commercialEmail:'julien@cpconstructions.fr',
    chiffrage:{},postes:[]};
  let tr3;
  TR.act(()=>{tr3=TR.create(React.createElement(M.SortirChiffrageInterne,{data,p:p3,maj:()=>{}}))});
  let t3=norm(texteInst(tr3.root));
  chk(!/Envoyer par mail/.test(t3),'sans chiffrage interne jamais sorti, rien ne propose de l’envoyer');
  TR.act(()=>{tr3.unmount()});

  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
  process.exitCode=ko?1:0;
})();
