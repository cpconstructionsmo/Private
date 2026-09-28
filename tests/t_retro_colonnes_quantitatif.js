/* Une fois les prix unitaires relevés pour une rétrocession, il faut
   pouvoir lire d'un coup d'œil ce qui est facturé (avec rétrocession) et ce
   qui revient réellement à l'artisan (sans elle), article par article et
   pour le total du lot — sans avoir à recalculer de tête à chaque ligne. */
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
  code+'\n;return {Quantitatif,EMPTY};');
const M=mod(React,global.ReactDOM,global.supabase,global.window,global.location,global.history,global.sessionStorage,global.localStorage,global.indexedDB,global.document,global.fetch,global.crypto,global.TextEncoder,global.TextDecoder,global.alert,global.confirm);
const texteInst=n=>typeof n==='string'?n:(!n||!n.children?'':n.children.map(texteInst).join(''));
const norm=s=>s.normalize('NFC').replace(/[   ]/g,' ');
let ko=0;const chk=(c,m)=>{if(!c){console.error('KO  '+m);ko++}else console.log('OK  '+m)};
const btn=(tr,re)=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));

/* un poste déjà relevé de 5 % (189,47 = 180/0,95) : le prix de l'artisan
   attendu est donc bien 180 €, et le total du lot 840 € contre 884,21 € HT
   affiché avec rétrocession */
const f={id:'x1',libelle:'GROS ŒUVRE',montant:884.21,retroPct:'5',retroPctApplique:5,
  quantitatif:{bordereauId:'b1',nom:'031 MAÇONNERIE',lignes:[
    {id:'l1',type:'article',code:'B_1',libelle:'Béton industriel',unite:'U',pu:189.47,qt:3},
    {id:'l2',type:'article',code:'B_2',libelle:'Béton pour semelles',unite:'M³',pu:315.79,qt:1},
  ]}};
let tr;
TR.act(()=>{tr=TR.create(React.createElement(M.Quantitatif,{data:M.EMPTY,f,setF(){},champ:'montant'}))});
TR.act(()=>{btn(tr,/Saisir les quantités/).props.onClick()});
const t=norm(texteInst(tr.root));
chk(/189,47 € \/ U avec rétro/.test(t),'le prix avec rétrocession du premier article se lit toujours');
chk(/180,00 € \/ U artisan/.test(t),'et, juste à côté, le prix qui revient réellement à l’artisan (180 €)');
chk(/315,79 € \/ M³ avec rétro/.test(t),'de même pour le second article (315,79 €)');
chk(/300,00 € \/ M³ artisan/.test(t),'dont l’artisan touche bien 300 €');
chk(/TOTAL H\.T\. — avec rétro/.test(t),'le total du lot est clairement identifié comme « avec rétro »');
chk(/Total artisan — sans rétrocession/.test(t)&&/839,99 €/.test(t),
    'et un second total, sans rétrocession, rappelle ce qui revient en tout aux artisans (839,99 €, soit 884,20 € × 0,95)');
TR.act(()=>{tr.unmount()});

/* sans rétrocession appliquée, l'affichage reste inchangé — un seul prix par ligne */
{
  const f2={id:'x2',libelle:'TERRASSEMENT',montant:180,retroPct:'',
    quantitatif:{bordereauId:'b1',nom:'011 TERRASSEMENT',lignes:[
      {id:'l1',type:'article',code:'T_1',libelle:'Décaissement',unite:'M²',pu:60,qt:3}]}};
  let tr2;
  TR.act(()=>{tr2=TR.create(React.createElement(M.Quantitatif,{data:M.EMPTY,f:f2,setF(){},champ:'montant'}))});
  TR.act(()=>{btn(tr2,/Saisir les quantités/).props.onClick()});
  const t2=norm(texteInst(tr2.root));
  chk(!/avec rétro/.test(t2)&&!/Total artisan/.test(t2),
    'sans rétrocession appliquée sur ce poste, aucune double colonne ne s’affiche — un seul prix, comme avant');
  TR.act(()=>{tr2.unmount()});
}

console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
process.exitCode=ko?1:0;
