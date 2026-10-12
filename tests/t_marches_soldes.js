/* Onglet Marchés : un lot soldé — son marché entièrement facturé, l'entreprise
   a fini et transmis sa dernière facture — se voit d'un coup d'œil : la ligne
   est grisée (elle revient en clair au survol), une pastille « ✓ soldé » suit
   le nom de l'entreprise et l'en-tête compte les lots soldés. Un dépassement
   est soldé aussi (tout est facturé) ; un lot sans facture ou avec un reste à
   facturer ne l'est pas. Les achats de matériaux suivent la même règle.
   Données fictives. */
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
  code+'\n;return {Marches,engagementSolde,marcheSolde};');
const M=mod(React,global.ReactDOM,global.supabase,global.window,global.location,global.history,global.sessionStorage,global.localStorage,global.indexedDB,global.document,global.fetch,global.crypto,global.TextEncoder,global.TextDecoder,global.alert,global.confirm);
const texteInst=n=>typeof n==='string'?n:(!n||!n.children?'':n.children.map(texteInst).join(''));
const norm=s=>s.normalize('NFC').replace(/[\u00a0\u202f\u2009]/g,' ');
let ko=0;const chk=(c,m)=>{if(!c){console.error('KO  '+m);ko++}else console.log('OK  '+m)};

/* la règle */
chk(M.engagementSolde(6143,[{montant:6143}]),'facturé = marché : soldé');
chk(M.engagementSolde(10254,[{montant:4616.73},{montant:5817}]),'dépassement (180 €) : soldé aussi, tout est facturé');
chk(!M.engagementSolde(15133,[{montant:10380}]),'un reste à facturer : pas soldé');
chk(!M.engagementSolde(2353,[]),'aucune facture : pas soldé');
chk(!M.engagementSolde(0,[{montant:100}]),'un lot sans montant n’est jamais soldé');
chk(M.engagementSolde('6143.04',[{montant:'6143.04'}]),'montants saisis en texte : lus comme des nombres');

/* l'onglet */
const ch={id:'ch1',nom:'Maison fictive',client:'M. Fictif',tva:20};
const art=(id,nom)=>({id,nom,corps:'',tel:'',email:''});
const data={artisans:[art('a1','SARL TERRE FICTIVE'),art('a2','SASU MACONNERIE FICTIVE'),art('a3','EURL MENUISERIE FICTIVE'),art('a4','EI PLAQUISTE FICTIF')],
  marches:[
    {id:'m1',chantierId:'ch1',lot:'TERRASSEMENT',artisanId:'a1',montantHT:10254,statut:'signe',factures:[{id:'f1',montant:4616.73,date:'2026-02-17'},{id:'f2',montant:5817,date:'2026-08-16'}]},
    {id:'m2',chantierId:'ch1',lot:'MACONNERIE',artisanId:'a2',montantHT:6143,statut:'signe',factures:[{id:'f3',montant:6143,date:'2026-05-15'}]},
    {id:'m3',chantierId:'ch1',lot:'MENUISERIES',artisanId:'a3',montantHT:15133,statut:'signe',factures:[{id:'f4',montant:10380,date:'2025-06-13'}]},
    {id:'m4',chantierId:'ch1',lot:'PLAQUISTERIE',artisanId:'a4',montantHT:2353,statut:'signe',factures:[]},
    {id:'m5',chantierId:'autre',lot:'AUTRE',artisanId:'a4',montantHT:100,statut:'signe',factures:[{id:'f9',montant:100}]}],
  commandes:[
    {id:'c1',chantierId:'ch1',fournisseur:'Négoce fictif',designation:'Parpaings',montant:800,factures:[{id:'fc1',montant:800}]},
    {id:'c2',chantierId:'ch1',fournisseur:'Bois fictif',designation:'Liteaux',montant:500,factures:[]}]};
let tr;
TR.act(()=>{tr=TR.create(React.createElement(M.Marches,{data,ch,save(){},eng:33883,fac:27336.73}))});
const lignes=tr.root.findAll(n=>n.type==='tr'&&n.props.className==='lot-solde');
const t=norm(texteInst(tr.root));
chk(lignes.length===3,'trois lignes grisées : deux lots soldés et un achat soldé (trouvé : '+lignes.length+')');
chk(lignes.some(l=>/SARL TERRE FICTIVE/.test(texteInst(l)))&&lignes.some(l=>/SASU MACONNERIE FICTIVE/.test(texteInst(l))),'le lot en dépassement et le lot soldé sont grisés');
chk(!lignes.some(l=>/MENUISERIE FICTIVE|PLAQUISTE FICTIF|Bois fictif/.test(texteInst(l))),'ni le lot avec un reste à facturer, ni le lot sans facture, ni l’achat non facturé');
chk(lignes.some(l=>/Négoce fictif/.test(texteInst(l))),'l’achat de matériaux entièrement facturé est grisé de même');
chk((t.match(/✓ soldé/g)||[]).length===3,'une pastille « ✓ soldé » par ligne soldée');
chk(/4 lots — facturé .* · 2 soldés/.test(t),'l’en-tête compte les lots soldés de ce chantier (pas ceux des autres)');
chk(/dépassement 180 €/.test(t),'la mention du dépassement reste affichée');
TR.act(()=>{tr.unmount()});

console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
process.exitCode=ko?1:0;
