/* Le RIB de l'artisan n'a pas toujours besoin d'être rejoint : le client peut
   déjà le détenir. Jusqu'ici, son absence bloquait purement et simplement
   l'envoi de la facture visée — désormais elle n'est qu'un avertissement,
   et le mail part quand même, sans réclamer un RIB qu'il n'a pas à joindre. */
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
const jeton={getItem:k=>k==='driveToken'?'j':k==='driveTokenExpiry'?String(Date.now()+3600e3):null,setItem(){},removeItem(){}};
global.sessionStorage=jeton;global.localStorage=jeton;
global.indexedDB={open(){const r={};setTimeout(()=>r.onerror&&r.onerror(),0);return r}};
global.document={getElementById:()=>({}),createElement:()=>({})};
global.supabase={createClient:()=>({auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>({select:()=>({eq:()=>({single:()=>Promise.resolve({data:null})})}),upsert:()=>Promise.resolve({})}),channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}})};
global.ReactDOM={createRoot:()=>({render(){}})};
global.alert=()=>{};global.confirm=()=>true;
const mod=new Function('React','ReactDOM','supabase','window','location','history','sessionStorage','localStorage','indexedDB','document','fetch','crypto','TextEncoder','TextDecoder','alert','confirm',
  code+'\n;return {ViserFacture,EMPTY};');
const M=mod(React,global.ReactDOM,global.supabase,global.window,global.location,global.history,global.sessionStorage,global.localStorage,global.indexedDB,global.document,global.fetch,global.crypto,global.TextEncoder,global.TextDecoder,global.alert,global.confirm);
const texteInst=n=>typeof n==='string'?n:(!n||!n.children?'':n.children.map(texteInst).join(''));
const norm=s=>s.normalize('NFC').replace(/[   ]/g,' ');
let ko=0;const chk=(c,m)=>{if(!c){console.error('KO  '+m);ko++}else console.log('OK  '+m)};
const btn=(tr,re)=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));

const F={id:'f1',montant:2352.63,numero:'',date:'2026-09-16',lien:'https://drive/facture-kara'};
const CH={id:'c1',nom:'Maison Berdal',emailClient:'client@example.fr',adresse:'Résenlieu'};
/* l'artisan n'a pas de RIB déposé sur sa fiche */
const ART={id:'a1',nom:'EI SADETTIN KARA',lienRib:'',email:'kara@example.fr'};
const data={...M.EMPTY,expediteurMail:'claude.portier@cpconstructions.fr'};

let tr;
TR.act(()=>{tr=TR.create(React.createElement(M.ViserFacture,{f:F,ch:CH,art:ART,data,lot:'Bandes plaquisterie'}))});
let t=norm(texteInst(tr.root));
chk(/n.est pas déposé/.test(t),'un avertissement signale l’absence de RIB');
chk(/peut.*quand même partir|quand même partir/.test(t),'mais précise que l’envoi reste possible');

const boutonEnvoyer=btn(tr,/Viser et envoyer au client/);
chk(!!boutonEnvoyer,'le bouton d’envoi est bien présent malgré l’absence de RIB — ce n’est plus bloquant');
TR.act(()=>{boutonEnvoyer.props.onClick()});
t=norm(texteInst(tr.root));
const corps=tr.root.findAll(n=>n.type==='textarea')[0].props.value;

chk(corps.indexOf('le relevé d’identité bancaire de l’entreprise pour son règlement')<0,
  'le message ne prétend plus qu’un RIB est joint, puisqu’il ne l’est pas');
chk(corps.indexOf('déjà en votre possession')>=0,
  'il renvoie au RIB que le client détient déjà');
chk(/sans le RIB/.test(t),'le récapitulatif des pièces jointes dit explicitement qu’aucun RIB ne part cette fois');

TR.act(()=>{tr.unmount()});

console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
process.exitCode=ko?1:0;
