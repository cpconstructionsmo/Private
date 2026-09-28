/* chargeur commun : transpile le script de l'appli et expose les noms demandés.
   fetch sert les vrais fichiers assets/ ; le reste (Drive) répond « ok ». */
const fs=require('fs');const path=require('path');const os=require('os');const zlib=require('zlib');const babel=require('@babel/standalone');
/* la racine du dépôt (ce dossier tests/ est juste dessous) et un dossier
   de sortie pour les documents que les tests fabriquent */
const RACINE=path.resolve(__dirname,'..');
const SORTIE=path.join(os.tmpdir(),'cp-tests');fs.mkdirSync(SORTIE,{recursive:true});
global.RACINE=RACINE;global.SORTIE=SORTIE;
/* la bibliothèque initiale livrée par une révision précédente du modèle,
   figée dans fixtures/ (voir CLAUDE.md pour en ajouter une) */
const biblioRev=nom=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,'fixtures','biblio_'+nom+'.json.gz'))).toString());
global.biblioRev=biblioRev;
const React=require('react');
let code=null;
function charger(noms,opts){
  opts=opts||{};
  if(!code){
    const html=fs.readFileSync(opts.fichier||path.join(RACINE,'index.html'),'utf8');
    const src=html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1];
    code=babel.transform(src,{presets:[['react',{runtime:'classic'}]]}).code;
  }
  const drive=opts.drive||{};
  global.__driveAppels=[];
  global.fetch=async(url,init)=>{
    const u=String(url);
    const m=u.match(/^assets\/(.+)$/);
    if(m){
      const p=path.join(RACINE,'assets',m[1]);
      if(fs.existsSync(p)){const b=fs.readFileSync(p);return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}}
      return {ok:false,status:404};
    }
    global.__driveAppels.push({url:u,init});
    const fm=u.match(/files\/([^/?]+)\?alt=media/);
    if(fm&&drive[fm[1]]){const b=drive[fm[1]];return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}}
    return {ok:true,status:200,json:async()=>({id:'fid'+global.__driveAppels.length,webViewLink:'https://drive.google.com/file/d/fid'+global.__driveAppels.length+'/view',files:[]}),
      arrayBuffer:async()=>new ArrayBuffer(8),text:async()=>''};
  };
  global.window={navigator:{},matchMedia:()=>({matches:false}),location:{origin:'https://x',pathname:'/',hash:'',search:''},crypto:require('crypto').webcrypto,open(){}};
  global.crypto=require('crypto').webcrypto;global.TextEncoder=require('util').TextEncoder;global.TextDecoder=require('util').TextDecoder;
  global.Blob=require('buffer').Blob;global.File=require('buffer').File;
  global.location=global.window.location;global.history={replaceState(){}};
  const jeton={getItem:k=>k==='driveToken'?'j':k==='driveTokenExpiry'?String(Date.now()+3600e3):null,setItem(){},removeItem(){}};
  global.sessionStorage=jeton;global.localStorage=jeton;
  global.indexedDB={open(){const r={};setTimeout(()=>r.onerror&&r.onerror(),0);return r}};
  global.document=opts.document||{getElementById:()=>({}),createElement:()=>({click(){},remove(){}}),body:{appendChild(){}},head:{appendChild(){}}};
  global.URL.createObjectURL=()=>'blob:x';global.URL.revokeObjectURL=()=>{};
  global.supabase={createClient:()=>({auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>({select:()=>({eq:()=>({single:()=>Promise.resolve({data:null})})}),upsert:()=>Promise.resolve({})}),channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}})};
  global.ReactDOM={createRoot:()=>({render(){}})};
  global.alert=opts.alert||(()=>{});global.confirm=opts.confirm||(()=>true);global.prompt=opts.prompt||(()=>null);
  const f=new Function('React','ReactDOM','supabase','window','location','history','sessionStorage','localStorage','indexedDB','document','fetch','crypto','TextEncoder','TextDecoder','alert','confirm','prompt',
    code+'\n;return {'+noms.join(',')+'};');
  return f(React,global.ReactDOM,global.supabase,global.window,global.location,global.history,global.sessionStorage,global.localStorage,global.indexedDB,global.document,global.fetch,global.crypto,global.TextEncoder,global.TextDecoder,global.alert,global.confirm,global.prompt);
}
const texteInst=n=>typeof n==='string'?n:(!n||!n.children?'':n.children.map(texteInst).join(''));
const norm=s=>s.normalize('NFC').replace(/[   ]/g,' ');
function verif(){let ko=0;const chk=(c,m)=>{if(!c){console.error('KO  '+m);ko++}else console.log('OK  '+m)};
  const fin=()=>{console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0};return {chk,fin}}
module.exports={charger,texteInst,norm,verif,biblioRev,RACINE,SORTIE};
