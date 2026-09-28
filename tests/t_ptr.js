/* Le programme technique de référence (PTR) doit se composer en Word avec le
   texte standard du modèle CP Constructions, lot par lot, ses photos
   (déposées dans assets/ptr/), et une synthèse financière recalculée à
   partir des données déjà saisies — jamais recopiée d'un exemple. */
const RACINE=require('path').resolve(__dirname,'..');
const SORTIE=require('os').tmpdir()+'/cp-tests';require('fs').mkdirSync(SORTIE,{recursive:true});
const fs=require('fs');const path=require('path');const babel=require('@babel/standalone');
const html=fs.readFileSync(RACINE+'/index.html','utf8');
const src=html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)[1];
const {code}=babel.transform(src,{presets:[['react',{runtime:'classic'}]]});
/* sert les fichiers assets/ tels qu'ils sont réellement déployés (le vrai
   logo, les vraies photos du PTR), pour composer un document représentatif
   plutôt qu'un document sans aucune image */
global.fetch=async(url)=>{
  const m=String(url).match(/^assets\/(.+)$/);
  if(m){
    const p=path.join(RACINE+'/assets',m[1]);
    if(fs.existsSync(p)){
      const buf=fs.readFileSync(p);
      return {ok:true,arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)};
    }
    return {ok:false};
  }
  return {ok:true,json:async()=>({webViewLink:'https://drive.google.com/file/d/dummy/view',id:'dummy'}),arrayBuffer:async()=>new ArrayBuffer(8)};
};
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
const React=require('react');
const TR=require('react-test-renderer');
const mod=new Function('React','ReactDOM','supabase','window','location','history','sessionStorage','localStorage','indexedDB','document','fetch','crypto','TextEncoder','TextDecoder','alert','confirm',
  code+'\n;return {genererPtrDocx,wordLignes,PTR_CATALOGUE,SortirPtr,EMPTY};');
const M=mod(React,global.ReactDOM,global.supabase,global.window,global.location,global.history,global.sessionStorage,global.localStorage,global.indexedDB,global.document,global.fetch,global.crypto,global.TextEncoder,global.TextDecoder,global.alert,global.confirm);

let ko=0;const chk=(c,m)=>{if(!c){console.error('KO  '+m);ko++}else console.log('OK  '+m)};

const p={id:'p1',nom:'Maison Moualid - Valframbert',civilite:'M.',client:'Moualid',
  adresseClient:'12 rue des Lilas — 61000 Alençon',commune:'Valframbert',niveaux:'Plain-pied',
  postes:[{id:'x1',libelle:'Gros œuvre',montant:120000},{id:'x2',libelle:'Charpente couverture',montant:45000}],
  margePct:15,tva:20,
  travauxClient:[{id:'t1',libelle:'Peintures intérieures',montant:8000}],
  raccordements:[{id:'r1',libelle:'Raccordement Enedis',montant:1200}],
  terrainPrix:30000,fraisNotaire:2250,dommageOuvrage:2500,taxeAmenagement:4500};

(async()=>{
  const buf=await M.genererPtrDocx(p);
  fs.writeFileSync(SORTIE+'/ptr_test.docx',buf);
  chk(buf.length>200000,'le PTR produit un fichier volumineux, cohérent avec ~47 photos embarquées ('+buf.length+' octets)');

  const file=new File([buf],'ptr.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  const t=await M.wordLignes(file);

  chk(t.indexOf('PROGRAMME TECHNIQUE DE RÉFÉRENCE')>=0,'le titre du document est présent');
  chk(t.indexOf('M. Moualid')>=0,'le nom du client figure dans l’en-tête');
  chk(t.indexOf('Valframbert')>=0,'l’adresse de construction figure dans l’en-tête');
  /* quelques lots pris au hasard, en début, milieu et fin de catalogue */
  chk(t.indexOf('FONDATIONS')>=0,'le lot « fondations » figure au document');
  chk(t.indexOf('ÉLECTRICITÉ')>=0,'le lot électricité figure au document, accentué');
  chk(t.indexOf('GARANTIE')>=0,'le dernier lot du catalogue (garantie) figure au document');
  chk(t.indexOf('Lot MO')>=0&&t.indexOf('Hors coord.')>=0,'la légende MO / hors coord. est reprise');
  chk(t.indexOf('DÉSIGNATION DES OUVRAGES ET FOURNITURES')>=0,'les lots sont bien présentés sous forme de tableau, avec l’en-tête du modèle papier');
  chk(t.indexOf('Montant hors coordination')>=0,'la colonne montant hors coordination du modèle papier est reprise');
  chk(/☒/.test(t)&&/☐/.test(t),'des cases cochées et non cochées apparaissent bien, poste par poste');
  chk(t.indexOf('Suivant devis si nécessaire')>=0,'un montant hors coordination connu (préparation du terrain) est repris');
  chk(t.indexOf('460,00 € / unité')>=0,'un autre montant connu (sèche-serviette électrique) est repris');

  /* la synthèse financière recalculée, pas recopiée d’un exemple */
  chk(t.indexOf('SYNTHÈSE FINANCIÈRE')>=0,'la section de synthèse financière est présente');
  chk(t.indexOf('198 000,00 €')>=0,'le bloc A (travaux coordonnés) reprend le coût des postes en TTC, comme dans le contrat');
  chk(t.indexOf('Peintures intérieures')>=0&&t.indexOf('8 000,00 €')>=0,'le bloc B liste bien le poste de travaux réservé saisi sur la fiche, avec son montant');
  chk(t.indexOf('Raccordement Enedis')>=0,'le bloc B liste aussi le raccordement saisi');
  chk(/32 250,00 €|32 250,00€/.test(t)||t.indexOf('32 250,00 €')>=0,'le bloc C reprend le terrain et les frais de notaire additionnés');

  /* ---- le bouton du PTR, comme celui du contrat, exige un chiffrage ---- */
  const texteInst=n=>typeof n==='string'?n:(!n||!n.children?'':n.children.map(texteInst).join(''));
  const norm=s=>s.normalize('NFC').replace(/[   ]/g,' ');
  const btn=(tr,re)=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));

  let tr;
  TR.act(()=>{tr=TR.create(React.createElement(M.SortirPtr,{data:M.EMPTY,p:{id:'p2',nom:'Vide'},maj(){}}))});
  chk(!!btn(tr,/Sortir le PTR/).props.disabled,
    'sans aucun chiffrage, le bouton du PTR est désactivé — la synthèse financière resterait vide');
  TR.act(()=>{tr.unmount()});

  let maj_appels=[];
  TR.act(()=>{tr=TR.create(React.createElement(M.SortirPtr,{data:M.EMPTY,p,maj:patch=>maj_appels.push(patch)}))});
  chk(!btn(tr,/Sortir le PTR/).props.disabled,'le chiffrage étant fait, le bouton du PTR est actif');
  await TR.act(async()=>{btn(tr,/Sortir le PTR/).props.onClick();
    await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve()});
  let txt=norm(texteInst(tr.root));
  chk(/Déposé dans Drive/.test(txt),'le PTR, une fois sorti, est annoncé comme déposé sur le Drive du prospect');
  chk(maj_appels.some(x=>x.ptrLe),'la date de sortie du PTR est enregistrée sur la fiche');
  TR.act(()=>{tr.unmount()});

  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
  process.exitCode=ko?1:0;
})();
