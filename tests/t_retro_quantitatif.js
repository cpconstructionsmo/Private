/* Le bouton « Appliquer aux prix unitaires » n'était pas trouvé / pas
   compris : la demande, redite deux fois, est que relever les prix
   unitaires d'un poste pour tenir compte d'une rétrocession se fasse
   automatiquement, sans bouton à chercher. On déclenche donc le calcul dès
   qu'on quitte le champ du taux (ou du prix de base) — et, pour un
   quantitatif, on retient le taux déjà appliqué aux prix (retroPctApplique)
   afin de toujours repartir du vrai prix de base de l'artisan, même en
   changeant le taux plusieurs fois de suite, sans jamais accumuler les
   relèvements. */
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
  code+'\n;return {prixAvecRetro,posteRetro,PostesChiffrage,EMPTY};');
const M=mod(React,global.ReactDOM,global.supabase,global.window,global.location,global.history,global.sessionStorage,global.localStorage,global.indexedDB,global.document,global.fetch,global.crypto,global.TextEncoder,global.TextDecoder,global.alert,global.confirm);
const texteInst=n=>typeof n==='string'?n:(!n||!n.children?'':n.children.map(texteInst).join(''));
const norm=s=>s.normalize('NFC').replace(/[   ]/g,' ');
let ko=0;const chk=(c,m)=>{if(!c){console.error('KO  '+m);ko++}else console.log('OK  '+m)};

/* ---------- 1. un poste avec quantitatif : automatique dès qu'on quitte le champ ---------- */
{
  let L=[{id:'x1',libelle:'GROS ŒUVRE',montant:840,retroPct:'',
    quantitatif:{bordereauId:'b1',nom:'031 MAÇONNERIE - B.A.',lignes:[
      {id:'l1',type:'article',code:'B_1FF_BINDPERT',libelle:'Béton industriel',unite:'U',pu:180,qt:3},
      {id:'l2',type:'article',code:'B_1FF_5SEMEL',libelle:'Béton pour semelles',unite:'M³',pu:300,qt:1},
      {id:'l3',type:'titre',libelle:'Sous-sol'},
    ]}}];
  let tr;
  const onChange=v=>{L=v;TR.act(()=>{tr.update(React.createElement(M.PostesChiffrage,{data:M.EMPTY,save(){},postes:L,onChange}))})};
  TR.act(()=>{tr=TR.create(React.createElement(M.PostesChiffrage,{data:M.EMPTY,save(){},postes:L,onChange}))});
  const t=()=>norm(texteInst(tr.root));
  const champPct=()=>tr.root.findAll(n=>n.type==='input'&&n.props.placeholder==='%'&&n.props.step==='0.1')[0];

  chk(!/prix unitaires du quantitatif/.test(t()),'sans taux de rétrocession, rien n’est proposé');

  TR.act(()=>{champPct().props.onChange({target:{value:'5'}})});
  chk(/Quittez ce champ pour relever automatiquement/.test(t()),
    'tant que le champ n’a pas été quitté, l’écran dit qu’il reste à confirmer, sans bouton à chercher');
  chk(L[0].quantitatif.lignes[0].pu===180,'les prix unitaires n’ont pas encore bougé à ce stade');

  /* quitter le champ (onBlur) déclenche le calcul, sans rien cliquer */
  TR.act(()=>{champPct().props.onBlur()});
  chk(L[0].quantitatif.lignes[0].pu===189.47,'le premier prix unitaire est relevé automatiquement (180 → 189,47)');
  chk(L[0].quantitatif.lignes[1].pu===315.79,'ainsi que le second (300 → 315,79)');
  chk(L[0].quantitatif.lignes[2].libelle==='Sous-sol','l’intertitre n’est pas touché');
  chk(String(L[0].retroPctApplique)==='5','le taux désormais appliqué aux prix est mémorisé');
  chk(/relevés de 5 %/.test(t()),'l’écran confirme que c’est fait, sans qu’on ait eu à cliquer quoi que ce soit');

  /* changer le taux ensuite repart du vrai prix de base, sans jamais s’accumuler */
  TR.act(()=>{champPct().props.onChange({target:{value:'10'}})});
  TR.act(()=>{champPct().props.onBlur()});
  chk(L[0].quantitatif.lignes[0].pu===200,
    'passer de 5 % à 10 % repart du prix de base (180) plutôt que de relever 189,47 une seconde fois (obtenu : '+L[0].quantitatif.lignes[0].pu+')');
  chk(L[0].quantitatif.lignes[1].pu===333.33,'de même pour le second article (obtenu : '+L[0].quantitatif.lignes[1].pu+')');

  /* revenir à 0 % restitue le prix de base exact */
  TR.act(()=>{champPct().props.onChange({target:{value:''}})});
  TR.act(()=>{champPct().props.onBlur()});
  chk(L[0].quantitatif.lignes[0].pu===180&&L[0].quantitatif.lignes[1].pu===300,
    'vider le taux restitue exactement le prix de base initial, sans résidu d’arrondi');

  TR.act(()=>{tr.unmount()});
}

/* ---------- 2. un poste sans quantitatif : même principe, automatique aussi ---------- */
{
  let L=[{id:'x2',libelle:'TERRASSEMENT',montant:'',retroPct:''}];
  let tr;
  const onChange=v=>{L=v;TR.act(()=>{tr.update(React.createElement(M.PostesChiffrage,{data:M.EMPTY,save(){},postes:L,onChange}))})};
  TR.act(()=>{tr=TR.create(React.createElement(M.PostesChiffrage,{data:M.EMPTY,save(){},postes:L,onChange}))});
  const t=()=>norm(texteInst(tr.root));
  chk(!/Prix de base de l.artisan/.test(t()),'sans taux, pas de champ prix de base proposé');

  const champPct=tr.root.findAll(n=>n.type==='input'&&n.props.placeholder==='%'&&n.props.step==='0.1')[0];
  TR.act(()=>{champPct.props.onChange({target:{value:'10'}})});
  chk(/Prix de base de l.artisan/.test(t()),'le champ prix de base apparaît dès qu’un taux est saisi');
  chk(!/prix unitaires du quantitatif/.test(t()),'jamais le message réservé aux quantitatifs, faute de quantitatif ici');

  const champBase=()=>tr.root.findAll(n=>n.type==='span'&&texteInst(n)==='Prix de base de l’artisan')[0].parent
    .findAll(n=>n.type==='input')[0];
  TR.act(()=>{champBase().props.onChange({target:{value:'300'}})});
  chk(L[0].montant==='','le montant du poste ne bouge pas tant que le champ n’a pas été quitté');
  TR.act(()=>{champBase().props.onBlur()});
  chk(L[0].montant===333.33,'quitter le champ prix de base pose automatiquement le montant du poste (333,33 €)');
  chk(L[0].prixBase==='300','le prix de base reste affiché — il sert de référence si le taux change ensuite');

  TR.act(()=>{tr.unmount()});
}

console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
process.exitCode=ko?1:0;
