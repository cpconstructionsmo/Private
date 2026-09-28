/* Une facture lue automatiquement (Lire des factures) peut mal reprendre un
   montant, une date ou un numéro depuis le PDF — jusqu'ici, une fois la
   facture enregistrée, il n'y avait aucun moyen de la corriger : il aurait
   fallu la supprimer et la relire. Un bouton « Corriger » sur la facture
   déjà déposée permet maintenant d'ajuster ces trois champs à la main. */
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
  code+'\n;return {ColFactures,facturesTotal};');
const M=mod(React,global.ReactDOM,global.supabase,global.window,global.location,global.history,global.sessionStorage,global.localStorage,global.indexedDB,global.document,global.fetch,global.crypto,global.TextEncoder,global.TextDecoder,global.alert,global.confirm);
const texteInst=n=>typeof n==='string'?n:(!n||!n.children?'':n.children.map(texteInst).join(''));
const norm=s=>s.normalize('NFC').replace(/[   ]/g,' ');
let ko=0;const chk=(c,m)=>{if(!c){console.error('KO  '+m);ko++}else console.log('OK  '+m)};
const btn=(tr,re)=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));

let liste=[{id:'f1',montant:5637,date:'2026-08-16',numero:'FA 3955',lien:'https://drive/facture-2jtp'}];
let corrections=[];
let ouv='', tr;
const render=()=>{TR.act(()=>{tr.update(React.createElement(M.ColFactures,
  {liste,engage:10254,ouv,setOuv,cle:'m-fac:2jtp',onLien(){},onCorriger}))})};
const setOuv=v=>{ouv=v;render()};
const onCorriger=(fid,patch)=>{corrections.push({fid,patch});liste=liste.map(x=>x.id===fid?{...x,...patch}:x)};
TR.act(()=>{tr=TR.create(React.createElement(M.ColFactures,
  {liste,engage:10254,ouv,setOuv,cle:'m-fac:2jtp',onLien(){},onCorriger}))});

chk(!/Corriger le montant/.test(norm(texteInst(tr.root))),'le bouton de correction n’apparaît qu’une fois la facture ouverte');

/* on ouvre le justificatif de la facture, comme sur la fiche du chantier */
TR.act(()=>{tr.root.findAll(n=>n.type==='button'&&/Voir le justificatif/.test(n.props.title||'')).find(Boolean).props.onClick({stopPropagation(){}})});
let t=norm(texteInst(tr.root));
chk(/Corriger le montant, la date ou le numéro/.test(t),'un bouton propose de corriger la facture une fois ouverte');

TR.act(()=>{btn(tr,/Corriger le montant/).props.onClick()});
t=norm(texteInst(tr.root));
chk(/MONTANT HT/.test(t)&&/N° FACTURE/.test(t),'le formulaire de correction expose le montant, la date et le numéro');

const champMontant=tr.root.findAll(n=>n.type==='input'&&n.props.type==='number')[0];
chk(champMontant.props.value===5637,'le montant actuel est repris tel quel, pas remis à zéro');
TR.act(()=>{champMontant.props.onChange({target:{value:'4616.73'}})});
TR.act(()=>{btn(tr,/^Enregistrer$/).props.onClick()});
render();

chk(corrections.length===1&&corrections[0].fid==='f1'&&corrections[0].patch.montant===4616.73,
  'la correction est bien transmise avec le nouveau montant, pour le bon identifiant de facture');
chk(!/MONTANT HT/.test(norm(texteInst(tr.root))),'le formulaire se referme une fois la correction enregistrée');
t=norm(texteInst(tr.root));
chk(t.indexOf('4 617 €')===0,'le montant affiché en tête de ligne reflète désormais la correction (4 616,73 €, arrondi à 4 617 €)');

TR.act(()=>{tr.unmount()});

console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
process.exitCode=ko?1:0;
