/* Les prospects en trois catégories : maison neuve, rénovation, apporteur d'affaires. */
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
  code+'\n;return {Prospects,prospectCategorie,PROSPECT_CATEGORIES,EMPTY};');
const M=mod(React,global.ReactDOM,global.supabase,global.window,global.location,global.history,global.sessionStorage,global.localStorage,global.indexedDB,global.document,global.fetch,global.crypto,global.TextEncoder,global.TextDecoder,global.alert,global.confirm);
const TestRenderer=require('react-test-renderer');
const texteInst=n=>typeof n==='string'?n:(!n||!n.children?'':n.children.map(texteInst).join(''));
const norm=s=>s.normalize('NFC').replace(/[   ]/g,' ');
let ko=0;const chk=(c,m)=>{if(!c){console.error('KO  '+m);ko++}else console.log('OK  '+m)};

/* Les prospects se rangent en trois catégories : maison neuve (tous ceux
   d'avant, qui n'en portent pas), rénovation, apporteur d'affaires. Un
   onglet par catégorie, « + Prospect » crée dans l'onglet ouvert, la
   catégorie se change dans le formulaire. */
const pr=(id,nom,categorie)=>({id,nom,statut:'demande',demandeLe:'2026-10-01',...(categorie?{categorie}:{})});
let data={...M.EMPTY,prospects:[pr('a','Maison Alpha'),pr('b','Maison Bravo'),pr('c','Rénovation Charlie','renovation'),pr('d','Projet Delta','apporteur')]};

/* ---------- 1. la catégorie d'un prospect ---------- */
chk(M.prospectCategorie(data.prospects[0])==='neuf','un prospect d’avant les catégories est une maison neuve');
chk(M.prospectCategorie({categorie:'inconnue'})==='neuf','une catégorie inconnue aussi');
chk(M.PROSPECT_CATEGORIES.map(c=>c.label).join(' / ')==='Maison neuve / Rénovation / Apporteur d’affaires','les trois catégories, dans l’ordre');

/* ---------- 2. l'écran ---------- */
let tr;
const rendre=()=>React.createElement(M.Prospects,{data,save:d=>{data=d;TR.act(()=>{tr.update(rendre())})},cible:null});
TR.act(()=>{tr=TestRenderer.create(rendre())});
const t=()=>norm(texteInst(tr.root));
const bouton=l=>tr.root.findAll(n=>n.type==='button'&&norm(texteInst(n)).startsWith(l))[0];
chk(/Maison neuve \(2\)/.test(t())&&/Rénovation \(1\)/.test(t())&&/Apporteur d’affaires \(1\)/.test(t()),'trois onglets, avec leur nombre');
chk(/Maison Alpha/.test(t())&&/Maison Bravo/.test(t())&&!/Rénovation Charlie/.test(t())&&!/Projet Delta/.test(t()),'par défaut : les maisons neuves seulement (tous les prospects d’avant)');
TR.act(()=>{bouton('Rénovation (').props.onClick()});
chk(/Rénovation Charlie/.test(t())&&!/Maison Alpha/.test(t()),'l’onglet Rénovation ne montre que la rénovation');
/* « + Prospect » dans l'onglet Rénovation : le nouveau prospect y est rangé */
TR.act(()=>{bouton('+ Prospect').props.onClick()});
chk(/ADRESSE DES TRAVAUX/.test(t()),'en rénovation, on parle d’adresse des travaux');
const champNom=tr.root.findAll(n=>n.type==='input'&&n.props.placeholder==='Maison Dupont — Ceaucé')[0];
TR.act(()=>{champNom.props.onChange({target:{value:'Salle de bains Echo'}})});
TR.act(()=>{tr.root.findAll(n=>n.type==='button'&&/Enregistrer/.test(texteInst(n)))[0].props.onClick()});
const e=data.prospects.find(p=>p.nom==='Salle de bains Echo');
chk(e&&e.categorie==='renovation','le prospect créé dans l’onglet Rénovation est une rénovation');
chk(/Rénovation \(2\)/.test(t()),'et l’onglet le compte');
/* l'apporteur d'affaires : les champs du commercial prennent son nom */
TR.act(()=>{bouton('Apporteur d’affaires (').props.onClick()});
TR.act(()=>{bouton('+ Prospect').props.onClick()});
chk(/L’APPORTEUR D’AFFAIRES/.test(t())&&/TÉL\. DE L’APPORTEUR/.test(t()),'en apporteur d’affaires, la demande vient de l’apporteur');
/* changer la catégorie dans le formulaire */
const sel=tr.root.findAll(n=>n.type==='select'&&(n.props.children||[]).some&&n.props.children.some(o=>o&&o.props&&o.props.value==='renovation'))[0];
TR.act(()=>{sel.props.onChange({target:{value:'neuf'}})});
chk(/LA DEMANDE DU COMMERCIAL/.test(t()),'la catégorie se change dans le formulaire');
TR.act(()=>{tr.unmount()});

console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
process.exitCode=ko?1:0;
