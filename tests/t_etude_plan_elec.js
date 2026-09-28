/* Le plan électrique, une fois importé dans les PIÈCES d'un chantier, doit
   pouvoir partir par mail chez le client pour étude — avec, dans le message,
   un mot sur la cuisine (on suit les plans que le client a lui-même transmis)
   — et rester visible comme « en attente de retour » tant qu'on n'a pas noté
   sa confirmation, sur le tableau de bord comme sur la fiche du chantier. */
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
  code+'\n;return {Docs,TableauBord,EMPTY,joursDepuis};');
const M=mod(React,global.ReactDOM,global.supabase,global.window,global.location,global.history,global.sessionStorage,global.localStorage,global.indexedDB,global.document,global.fetch,global.crypto,global.TextEncoder,global.TextDecoder,global.alert,global.confirm);
const texteInst=n=>typeof n==='string'?n:(!n||!n.children?'':n.children.map(texteInst).join(''));
const norm=s=>s.normalize('NFC').replace(/[   ]/g,' ');
let ko=0;const chk=(c,m)=>{if(!c){console.error('KO  '+m);ko++}else console.log('OK  '+m)};
const btn=(tr,re)=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));

const CH={id:'c1',nom:'Maison Barbé',client:'M. Barbé',emailClient:'barbe@example.fr',statut:'travaux',
  docs:{plan_elec:{fait:true,date:'2026-09-10',fichiers:[{id:'f1',nom:'Plan électrique.pdf',lien:'https://drive/plan-elec'}]}}};
let data={...M.EMPTY,chantiers:[CH]};

/* ---- 1) depuis la fiche du chantier (Docs) : transmission au client ---- */
let tr;
const save=d=>{data=d};
const up=patch=>{data={...data,chantiers:data.chantiers.map(c=>c.id===CH.id?{...c,...patch}:c)};
  CH.docs=data.chantiers[0].docs;
  TR.act(()=>{tr.update(React.createElement(M.Docs,{data,ch:data.chantiers[0],up:upLive,save}))})};
const upLive=patch=>up(patch);
TR.act(()=>{tr=TR.create(React.createElement(M.Docs,{data,ch:CH,up:upLive,save}))});

let t=norm(texteInst(tr.root));
chk(/Transmettre au client pour étude/.test(t),'le bouton de transmission apparaît sur la pièce plan électrique, un fichier étant déjà importé');

TR.act(()=>{btn(tr,/Transmettre au client pour étude/).props.onClick()});
t=norm(texteInst(tr.root));
chk(t.indexOf('barbe@example.fr')>=0,'le client est bien le destinataire');
const corps=tr.root.findAll(n=>n.type==='textarea')[0].props.value;
chk(corps.indexOf('concernant la cuisine, nous suivrons les plans de cuisine que vous nous avez transmis'.replace('concernant la','C'))>=0
  ||/concernant la cuisine, nous suivrons les plans de cuisine que vous nous avez transmis/i.test(corps),
  'le message reprend bien la note sur la cuisine demandée par l’utilisateur');
chk(/pour étude/.test(corps),'le message précise que le plan est transmis pour étude');

function today_(){return new Date().toISOString().slice(0,10)}

(async()=>{
  await TR.act(async()=>{btn(tr,/^Envoyer$/).props.onClick();await Promise.resolve();await Promise.resolve();await Promise.resolve()});
  t=norm(texteInst(tr.root));
  chk(/transmis à barbe@example\.fr/.test(t),'l’écran confirme l’envoi au client');
  chk(data.chantiers[0].docs.plan_elec.etudeLe===today_(),'la date de transmission est enregistrée sur la pièce, directement dans data');

  TR.act(()=>{btn(tr,/Fermer/).props.onClick()});
  t=norm(texteInst(tr.root));
  chk(/en attente du retour du client/.test(t),'une fois fermé, le statut affiche l’attente du retour du client');
  chk(!data.chantiers[0].docs.plan_elec.etudeConfirmeeLe,'aucune confirmation n’est encore enregistrée');

  /* ---- 2) le tableau de bord réclame ce dossier tant qu’il n’est pas confirmé ---- */
  let tr2;
  TR.act(()=>{tr2=TR.create(React.createElement(M.TableauBord,{data,save,open(){},allerA(){}}))});
  let t2=norm(texteInst(tr2.root));
  chk(/Plan électrique en attente de confirmation/.test(t2),'le tableau de bord signale le plan électrique en attente');
  chk(/Maison Barbé/.test(t2),'le chantier concerné est bien nommé');
  TR.act(()=>{tr2.unmount()});

  /* ---- 3) confirmer le retour du client éteint la réclamation ---- */
  TR.act(()=>{btn(tr,/Confirmer le retour du client/).props.onClick()});
  chk(!!data.chantiers[0].docs.plan_elec.etudeConfirmeeLe,'la confirmation est bien enregistrée, directement dans data');
  t=norm(texteInst(tr.root));
  chk(/Confirmé par le client le/.test(t),'la fiche affiche désormais la confirmation');

  let tr3;
  TR.act(()=>{tr3=TR.create(React.createElement(M.TableauBord,{data,save,open(){},allerA(){}}))});
  let t3=norm(texteInst(tr3.root));
  chk(!/Plan électrique en attente de confirmation/.test(t3),'une fois confirmé, le tableau de bord ne le réclame plus');
  TR.act(()=>{tr3.unmount()});

  TR.act(()=>{tr.unmount()});

  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
  process.exitCode=ko?1:0;
})();
