/* Une fois le chiffrage validé par le client, le contrat de maîtrise d'œuvre
   et la notice précontractuelle doivent pouvoir se sortir en Word, remplis
   des informations déjà saisies sur la fiche prospect — client, adresse du
   chantier, surfaces, budget travaux, honoraires et leur échéancier — sans
   retaper le modèle papier. Ce test vérifie à la fois le contenu produit
   (via wordLignes, la même lecture que l'appli utilise pour relire un
   document Word) et le comportement des deux boutons qui les déclenchent. */
const RACINE=require('path').resolve(__dirname,'..');
const fs=require('fs');const babel=require('@babel/standalone');const React=require('react');
const TR=require('react-test-renderer');
const html=fs.readFileSync(RACINE+'/index.html','utf8');
const src=html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1];
const {code}=babel.transform(src,{presets:[['react',{runtime:'classic'}]]});
global.fetch=async()=>({ok:true,json:async()=>({webViewLink:'https://drive.google.com/file/d/dummy/view',id:'dummy',files:[]}),arrayBuffer:async()=>new ArrayBuffer(8)});
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
  code+'\n;return {genererContratMoeDocx,genererNoticePrecontractuelleDocx,SortirContratMoe,SortirNoticePrecontractuelle,wordLignes,EMPTY};');
const M=mod(React,global.ReactDOM,global.supabase,global.window,global.location,global.history,global.sessionStorage,global.localStorage,global.indexedDB,global.document,global.fetch,global.crypto,global.TextEncoder,global.TextDecoder,global.alert,global.confirm);
const texteInst=n=>typeof n==='string'?n:(!n||!n.children?'':n.children.map(texteInst).join(''));
const norm=s=>s.normalize('NFC').replace(/[   ]/g,' ');
let ko=0;const chk=(c,m)=>{if(!c){console.error('KO  '+m);ko++}else console.log('OK  '+m)};
const btn=(tr,re)=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));

const P_CHIFFRE={id:'p1',nom:'Maison Moualid - Valframbert',civilite:'M.',client:'Moualid',
  telClient:'06 12 34 56 78',emailClient:'moualid@example.fr',adresseClient:'12 rue des Lilas — 61000 Alençon',
  commune:'Valframbert',niveaux:'Plain-pied',surfaceTerrain:'850',surfaceHabitable:'110',surfaceAnnexes:'20',
  prestation:'Clé en main',decouverte:{typeSol:'Argile fort'},
  postes:[{id:'x1',libelle:'Gros œuvre',montant:120000},{id:'x2',libelle:'Charpente couverture',montant:45000}],
  margePct:15,tva:20};
const P_VIDE={id:'p2',nom:'Prospect sans chiffrage',client:'Untel'};

(async()=>{
  /* ---- 1) le contenu du contrat reprend les montants déjà connus ---- */
  const bufContrat=await M.genererContratMoeDocx(P_CHIFFRE);
  const fileContrat=new File([bufContrat],'contrat.docx',
    {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  const texteContrat=await M.wordLignes(fileContrat);

  chk(texteContrat.indexOf('M. Moualid')>=0,'le nom du client figure dans le contrat');
  chk(texteContrat.indexOf('12 rue des Lilas — 61000 Alençon')>=0,'son adresse aussi');
  chk(texteContrat.indexOf('Valframbert')>=0,'la commune de construction figure en adresse des travaux');
  chk(texteContrat.indexOf('165 000,00 € HT')>=0&&texteContrat.indexOf('198 000,00 € TTC')>=0,
    'le budget travaux (coût des postes, hors marge) est calculé en HT et en TTC');
  chk(texteContrat.indexOf('24 750,00 €')>=0,'les honoraires HT (15 % de marge sur 165 000 €) sont calculés');
  chk(texteContrat.indexOf('29 700,00 €')>=0,'les honoraires TTC apparaissent, y compris en tête de l’échéancier total');
  chk(texteContrat.indexOf('2 970,00 €')>=0,'chaque phase à 10 % de l’échéancier affiche son propre montant calculé');
  chk(texteContrat.indexOf('SASU CP Constructions')>=0,'l’identité du maître d’œuvre est bien reprise');
  chk(texteContrat.indexOf('ZURICH')>=0&&texteContrat.indexOf('7400042329-199800048')>=0,
    'la référence de l’assurance RC Pro figure au contrat');

  /* ---- 2) la notice, elle, reste presque entièrement fixe ---- */
  const bufNotice=await M.genererNoticePrecontractuelleDocx(P_CHIFFRE);
  const fileNotice=new File([bufNotice],'notice.docx',
    {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  const texteNotice=await M.wordLignes(fileNotice);
  chk(texteNotice.indexOf('M. Moualid')>=0,'le nom du client figure dans la notice');
  chk(texteNotice.indexOf('MEDIMMOCONSO')>=0,'le médiateur de la consommation est cité');
  chk(texteNotice.indexOf('14 jours')>=0||texteNotice.indexOf('14 jour')>=0,
    'le délai de rétractation légal est rappelé');

  /* ---- 3) le bouton du contrat exige un chiffrage, celui de la notice non ---- */
  let tr;
  TR.act(()=>{tr=TR.create(React.createElement(M.SortirContratMoe,{data:M.EMPTY,p:P_VIDE,maj(){}}))});
  chk(!!btn(tr,/Sortir le contrat/).props.disabled,
    'sans aucun chiffrage, le bouton du contrat est désactivé — rien à y indiquer comme budget travaux');
  TR.act(()=>{tr.unmount()});

  let maj_appels=[];
  const majFn=patch=>maj_appels.push(patch);
  TR.act(()=>{tr=TR.create(React.createElement(M.SortirContratMoe,{data:M.EMPTY,p:P_CHIFFRE,maj:majFn}))});
  chk(!btn(tr,/Sortir le contrat/).props.disabled,'le chiffrage étant fait, le bouton du contrat est actif');
  await TR.act(async()=>{btn(tr,/Sortir le contrat/).props.onClick();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve()});
  let t=norm(texteInst(tr.root));
  chk(/Déposé dans Drive/.test(t),'le contrat, une fois sorti, est annoncé comme déposé sur le Drive du prospect');
  chk(maj_appels.some(p=>p.contratMoeLe),'la date de sortie du contrat est enregistrée sur la fiche');
  TR.act(()=>{tr.unmount()});

  /* ---- 4) la notice ne dépend elle d’aucun chiffrage ---- */
  maj_appels=[];
  TR.act(()=>{tr=TR.create(React.createElement(M.SortirNoticePrecontractuelle,{data:M.EMPTY,p:P_VIDE,maj:majFn}))});
  chk(!btn(tr,/Sortir la notice/).props.disabled,
    'la notice précontractuelle ne dépend d’aucun chiffrage — elle reste disponible même pour un prospect vide');
  await TR.act(async()=>{btn(tr,/Sortir la notice/).props.onClick();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve()});
  t=norm(texteInst(tr.root));
  chk(/Déposé dans Drive/.test(t),'la notice, une fois sortie, est annoncée comme déposée sur le Drive du prospect');
  chk(maj_appels.some(p=>p.noticeLe),'la date de sortie de la notice est enregistrée sur la fiche');
  TR.act(()=>{tr.unmount()});

  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
  process.exitCode=ko?1:0;
})();
