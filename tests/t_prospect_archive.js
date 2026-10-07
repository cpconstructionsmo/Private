/* Un prospect parti à la concurrence s’archive d’une coche, sur sa fiche. */
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
  code+'\n;return {Prospects,prospectArchive,prospectLibelle,prospectArchiver,EMPTY};');
const M=mod(React,global.ReactDOM,global.supabase,global.window,global.location,global.history,global.sessionStorage,global.localStorage,global.indexedDB,global.document,global.fetch,global.crypto,global.TextEncoder,global.TextDecoder,global.alert,global.confirm);
const TestRenderer=require('react-test-renderer');
const texteInst=n=>typeof n==='string'?n:(!n||!n.children?'':n.children.map(texteInst).join(''));
const norm=s=>s.normalize('NFC').replace(/[   ]/g,' ');
let ko=0;const chk=(c,m)=>{if(!c){console.error('KO  '+m);ko++}else console.log('OK  '+m)};

/* ---------- 1. les fonctions ---------- */
const pr=(id,nom,statut,x)=>({id,nom,statut,demandeLe:'2026-09-01',postes:[],produits:[],...(x||{})});
chk(!M.prospectArchive(pr('a','A','chiffre'))&&M.prospectLibelle(pr('a','A','chiffre')).label==='Chiffré — remis au commercial','un prospect en cours n’est pas archivé');
const ch=M.prospectArchiver(pr('a','A','chiffre'),true,'2026-10-07');
chk(ch.statut==='perdu'&&ch.archive.motif==='concurrence'&&ch.archive.le==='2026-10-07'&&ch.archive.statutAvant==='chiffre','archiver : sans suite, daté, le statut d’avant gardé');
chk(M.prospectLibelle({...pr('a','A'),...ch}).label==='Parti à la concurrence','son libellé : « Parti à la concurrence »');
chk(M.prospectLibelle(pr('b','B','perdu')).label==='Sans suite','un ancien « sans suite » garde son libellé');
const de=M.prospectArchiver({...pr('a','A'),...ch},false);
chk(de.statut==='chiffre'&&de.archive===null,'désarchiver : le statut d’avant revient');
chk(M.prospectArchiver(pr('b','B','perdu'),false).statut==='attente','sans statut d’avant connu : « en attente du client »');

/* ---------- 2. l'écran : la coche sur la fiche, la liste, le filtre « Archivés » ---------- */
let data={...M.EMPTY,prospects:[pr('a','Maison André','chiffre',{notesDossier:[{id:'n1',texte:'Rappeler',rappel:'2026-01-01',creeLe:'2026-09-01T10:00:00Z'}]}),pr('b','Maison Bravo','demande'),pr('g','Maison Signée','gagne',{chantierId:'c1'})]};
let tr;
const rendre=cible=>React.createElement(M.Prospects,{data,save:d=>{data=d;TR.act(()=>{tr.update(rendre(cible))})},cible});
TR.act(()=>{tr=TestRenderer.create(rendre('a'))});
const t=()=>norm(texteInst(tr.root));
const coche=()=>tr.root.findAll(n=>n.type==='input'&&n.props.type==='checkbox'&&n.parent&&/Parti à la concurrence/.test(norm(texteInst(n.parent))))[0];
chk(!!coche()&&!coche().props.checked&&/Transformer en chantier/.test(t()),'fiche : la coche « Parti à la concurrence », décochée ; « Transformer en chantier » présent');
TR.act(()=>{coche().props.onChange({target:{checked:true}})});
let a=data.prospects.find(p=>p.id==='a');
chk(a.statut==='perdu'&&a.archive&&a.archive.statutAvant==='chiffre'&&a.notesDossier.length===1,'cochée : le prospect est archivé, son dossier intact');
chk(/Parti à la concurrence/.test(t())&&/Archivé le/.test(t())&&/CONCURRENT RETENU/.test(t())&&!/Transformer en chantier/.test(t()),'la fiche le dit, demande le concurrent, ne propose plus de le transformer');
const champ=tr.root.findAll(n=>n.type==='input'&&n.props.placeholder==='Constructeur, artisan…')[0];
TR.act(()=>{champ.props.onBlur({target:{value:' Maisons Concurrentes '}})});
chk(data.prospects.find(p=>p.id==='a').archive.concurrent==='Maisons Concurrentes','le concurrent retenu se garde');
/* la liste : hors des « En cours », sous « Archivés » */
TR.act(()=>{tr.root.findAll(n=>n.type==='button'&&/← Prospects/.test(texteInst(n)))[0].props.onClick()});
chk(!/Maison André/.test(t())&&/Maison Bravo/.test(t())&&/Archivés \(1\)/.test(t()),'liste « En cours » : le prospect archivé n’y est plus ; « Archivés (1) »');
TR.act(()=>{tr.root.findAll(n=>n.type==='button'&&/^Archivés/.test(norm(texteInst(n))))[0].props.onClick()});
chk(/Maison André/.test(t())&&/Parti à la concurrence/.test(t())&&/retenu : Maisons Concurrentes/.test(t())&&!/Maison Bravo/.test(t()),'« Archivés » : le prospect, son motif et le concurrent');
/* décocher le remet où il était */
TR.act(()=>{tr.root.findAll(n=>n.type==='button'&&/Maison André/.test(texteInst(n)))[0].props.onClick()});
TR.act(()=>{coche().props.onChange({target:{checked:false}})});
a=data.prospects.find(p=>p.id==='a');
chk(a.statut==='chiffre'&&!a.archive,'décochée : de nouveau « Chiffré », plus d’archive');
/* un prospect signé n'a pas de coche */
TR.act(()=>{tr.unmount()});TR.act(()=>{tr=TestRenderer.create(rendre('g'))});
chk(!coche(),'un prospect signé (chantier créé) n’a pas de coche');
console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
process.exitCode=ko?1:0;
