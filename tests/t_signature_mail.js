/* Un document contractuel (marché, avenant) se signe de la raison sociale,
   CP.nom — mais un e-mail part d'une personne : il doit être signé du nom
   de son expéditeur (Claude Portier), en formule de politesse comme dans le
   nom affiché de l'expéditeur, pas de la seule raison sociale. */
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
  code+'\n;return {ViserFacture,CP,SIGNATAIRE_MAIL,EMPTY};');
const M=mod(React,global.ReactDOM,global.supabase,global.window,global.location,global.history,global.sessionStorage,global.localStorage,global.indexedDB,global.document,global.fetch,global.crypto,global.TextEncoder,global.TextDecoder,global.alert,global.confirm);
const texteInst=n=>typeof n==='string'?n:(!n||!n.children?'':n.children.map(texteInst).join(''));
const norm=s=>s.normalize('NFC').replace(/[   ]/g,' ');
let ko=0;const chk=(c,m)=>{if(!c){console.error('KO  '+m);ko++}else console.log('OK  '+m)};
const btn=(tr,re)=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));

chk(M.SIGNATAIRE_MAIL==='Claude Portier','le nom du signataire des mails est bien Claude Portier');
chk(M.CP.nom==='CP CONSTRUCTIONS','la raison sociale, elle, reste inchangée pour les documents');

const F={id:'f1',montant:2352.63,numero:'',date:'2026-09-16',lien:'https://drive/facture-kara'};
const CH={id:'c1',nom:'Maison Berdal',emailClient:'client@example.fr',adresse:'Résenlieu'};
const ART={id:'a1',nom:'EI SADETTIN KARA',lienRib:'https://drive/rib-kara',email:'kara@example.fr',
  lienAttestation:'https://drive/attestation-kara'};
const data={...M.EMPTY,expediteurMail:'claude.portier@cpconstructions.fr'};

let tr;
TR.act(()=>{tr=TR.create(React.createElement(M.ViserFacture,{f:F,ch:CH,art:ART,data,lot:'Bandes plaquisterie'}))});
TR.act(()=>{btn(tr,/Viser et envoyer au client/).props.onClick()});
let t=norm(texteInst(tr.root));

chk(/claude\.portier@cpconstructions\.fr/.test(t),'l’aperçu montre bien l’adresse d’expédition réglée dans RÉGLAGES');
chk(t.indexOf(CH.emailClient)>=0,'le client est bien le destinataire');
chk(t.indexOf(ART.email)>=0,'l’artisan est bien mis en copie');
/* l'objet et le message vivent dans la valeur d'un input/textarea, pas dans
   du texte d'enfant — il faut lire directement leur props.value */
const corps=tr.root.findAll(n=>n.type==='textarea')[0].props.value;
chk(/Cordialement/.test(corps)&&corps.indexOf('Cordialement')<corps.indexOf('Claude Portier'),
  'le message se termine par une formule de politesse suivie du prénom et nom du signataire');
chk(corps.indexOf('CP CONSTRUCTIONS')<0,
  'la raison sociale seule ne figure plus comme signature du mail');
TR.act(()=>{tr.unmount()});

console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
process.exitCode=ko?1:0;
