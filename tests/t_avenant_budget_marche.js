/* Un avenant signé n'ajoutait son montant qu'au budget client, jamais au
   montant du marché lui-même — sauf à ce que l'utilisateur pense à modifier
   le marché à la main, puis à cliquer Enregistrer, ce qui a été oublié deux
   fois de suite. Le bouton doit maintenant faire les deux à la fois, tout
   de suite, sans étape supplémentaire à retenir. */
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
  code+'\n;return {Marches,EMPTY};');
const M=mod(React,global.ReactDOM,global.supabase,global.window,global.location,global.history,global.sessionStorage,global.localStorage,global.indexedDB,global.document,global.fetch,global.crypto,global.TextEncoder,global.TextDecoder,global.alert,global.confirm);
const texteInst=n=>typeof n==='string'?n:(!n||!n.children?'':n.children.map(texteInst).join(''));
const norm=s=>s.normalize('NFC').replace(/[   ]/g,' ');
let ko=0;const chk=(c,m)=>{if(!c){console.error('KO  '+m);ko++}else console.log('OK  '+m)};
const btn=(tr,re)=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));

const CH={id:'c1',nom:'Maison Leroux',client:'Anthony Leroux',budgetClientTTC:183246,tva:20};
const ART={id:'a1',nom:'SARL 2JTP',corps:'Terrassement'};
const AV={id:'av1',numero:'1',date:'2026-09-01',contexte:'Réseaux supplémentaires demandés par le client',
  incidenceDelai:'',lignes:[{id:'l1',libelle:'Tranchée supplémentaire',qt:10,unite:'ml',pu:15,signe:1}],
  lien:'',dateSignature:'2026-09-05',budgetAppliqueLe:''};
const MARCHE={id:'m1',chantierId:'c1',lot:'Terrassement — VRD',artisanId:'a1',montantHT:10254,tva:20,
  statut:'signe',dateSignature:'2025-09-01',factures:[],avenants:[AV]};
let data={...M.EMPTY,chantiers:[CH],artisans:[ART],marches:[MARCHE],commandes:[]};

let tr;
const save=d=>{data=d;TR.act(()=>{tr.update(React.createElement(M.Marches,
  {data,ch:CH,save,eng:10254,fac:0,onFacturerCmd(){},onFacturerHono(){}}))})};
TR.act(()=>{tr=TR.create(React.createElement(M.Marches,
  {data,ch:CH,save,eng:10254,fac:0,onFacturerCmd(){},onFacturerHono(){}}))});

const modifier=btn(tr,/Modifier le lot/);
chk(!!modifier,'le lien « Modifier le lot » est présent');
TR.act(()=>{modifier.props.onClick()});

let t=norm(texteInst(tr.root));
chk(/AVENANTS/.test(t)&&/Avenant n. 1/.test(t),'la section avenants du lot montre l’avenant signé');

const impactTTC=Math.round(150*1.2*100)/100; // 10 ml × 15 € = 150 € HT, TVA 20 %
const boutonAppliquer=btn(tr,/au budget client et au marché/);
chk(!!boutonAppliquer,'le bouton propose désormais d’ajouter au budget ET au marché en une fois ('+impactTTC+' € TTC attendus)');
TR.act(()=>{boutonAppliquer.props.onClick()});

chk(data.chantiers[0].budgetClientTTC===183246+impactTTC,
  'le budget client a bien grandi de l’impact TTC de l’avenant ('+data.chantiers[0].budgetClientTTC+')');
chk(data.marches[0].montantHT===10254+150,
  'le montant du marché a grandi du même coup, de l’impact HT (150 €), sans étape séparée ('+data.marches[0].montantHT+')');
chk(!!data.marches[0].avenants[0].budgetAppliqueLe,
  'l’avenant est marqué intégré, directement dans data — pas seulement dans un brouillon à enregistrer');

t=norm(texteInst(tr.root));
chk(/Intégré au budget client et au montant du marché/.test(t),
  'l’écran confirme que les deux ont été mis à jour ensemble');
chk(/10 404/.test(t)||/10404/.test(t),
  'le formulaire du lot, resté ouvert, affiche déjà le nouveau montant sans qu’il faille le rouvrir');

TR.act(()=>{tr.unmount()});

console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
process.exitCode=ko?1:0;
