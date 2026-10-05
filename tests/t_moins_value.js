/* Les moins-values du chiffrage : retirer une prestation du marché. */
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
  code+'\n;return {optionMontant,prospectCoutHT,prospectPrixHT,prospectMargeHT,prospectPostesRetro,impactOption,PostesChiffrage,'
  +'genererChiffrageInterneDocx,genererDossierDocx,lireDocumentLignes,EMPTY};');
const M=mod(React,global.ReactDOM,global.supabase,global.window,global.location,global.history,global.sessionStorage,global.localStorage,global.indexedDB,global.document,global.fetch,global.crypto,global.TextEncoder,global.TextDecoder,global.alert,global.confirm);
const TestRenderer=require('react-test-renderer');
const texteInst=n=>typeof n==='string'?n:(!n||!n.children?'':n.children.map(texteInst).join(''));
const norm=s=>s.normalize('NFC').replace(/[   ]/g,' ');
let ko=0;const chk=(c,m)=>{if(!c){console.error('KO  '+m);ko++}else console.log('OK  '+m)};

/* Une moins-value retire une prestation du marché (« peinture faite par le
   client ») : son montant se saisit en positif et se compte en moins, une
   fois cochée « Déduire du marché » — sur le coût, la marge, le prix, la
   rétrocession, et dans les documents (client et interne). Une option
   ordinaire ne change pas. */
const base={id:'p1',nom:'Maison Test',client:'M. Test',margePct:10,tva:20,navette:{},chiffrages:[],plans:[],pieces:[],pj:{},
  postes:[{id:'a',libelle:'GROS ŒUVRE',montant:100000},{id:'b',libelle:'PEINTURE',montant:8000,retroPct:10}]};
const mv={id:'m',libelle:'PEINTURE',montant:8000,retroPct:10,moinsValue:true};
const opt={id:'o',libelle:'CLÔTURE',montant:3000};

/* ---------- 1. les calculs ---------- */
{
  chk(M.optionMontant(mv)===-8000&&M.optionMontant(opt)===3000,'une moins-value compte en négatif, une option en positif');
  const proposee={...base,optionsChiffrage:[mv,opt]};
  chk(M.prospectCoutHT(proposee)===108000,'non cochées, ni l’option ni la moins-value ne changent le coût (108 000)');
  const deduite={...base,optionsChiffrage:[{...mv,incluse:true},opt]};
  chk(M.prospectCoutHT(deduite)===100000,'cochée « Déduire du marché », la moins-value retire 8 000 € du coût');
  chk(M.prospectMargeHT(deduite)===10000&&M.prospectPrixHT(deduite)===110000,'la marge (10 %) et le prix suivent : 10 000 et 110 000');
  const les2={...base,optionsChiffrage:[{...mv,incluse:true},{...opt,incluse:true}]};
  chk(M.prospectCoutHT(les2)===103000,'option incluse et moins-value déduite se cumulent : 108 000 − 8 000 + 3 000');
  chk(M.prospectPostesRetro(deduite)===0,'la rétrocession de la peinture retirée s’en va avec elle (800 − 800)');
  const im=M.impactOption(proposee,mv);
  chk(im.coutHT===-8000&&im.margeHT===-800,'l’impact affiché d’une moins-value est négatif : −8 000 de coût, −800 de marge');
}

/* ---------- 2. l'éditeur des options : « + Moins-value », « Déduire du marché » ---------- */
{
  let L=[opt];
  let tr;
  const rendre=()=>React.createElement(M.PostesChiffrage,{data:M.EMPTY,save(){},p:{...base,optionsChiffrage:L},postes:L,onChange:v=>{L=v;TR.act(()=>{tr.update(rendre())})},options:true});
  TR.act(()=>{tr=TestRenderer.create(rendre())});
  const t=()=>norm(texteInst(tr.root));
  const bouton=tr.root.findAll(n=>n.type==='button'&&texteInst(n)==='+ Moins-value');
  chk(bouton.length===1,'un bouton « + Moins-value » à côté de « + Option »');
  TR.act(()=>{bouton[0].props.onClick()});
  chk(L.length===2&&L[1].moinsValue===true,'il ajoute une ligne marquée moins-value');
  chk(/− MOINS-VALUE/.test(t())&&/Déduire du marché/.test(t()),'la ligne se signale, et sa case dit « Déduire du marché »');
  const champ=tr.root.findAll(n=>n.type==='input'&&n.props.placeholder==='€ HT retiré')[0];
  TR.act(()=>{champ.props.onChange({target:{value:'8000'}})});
  chk(/Total -5 000 € HT/.test(t()),'le total des options tient compte du signe : 3 000 − 8 000');
  chk(/moins-values : -8 000 € HT/.test(t()),'et rappelle le montant des moins-values');
  TR.act(()=>{tr.unmount()});
}

/* ---------- 3. les documents ---------- */
(async()=>{
  const p={...base,optionsChiffrage:[{...mv,incluse:true},opt]};
  const lire=async out=>{const ab=out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);
    return norm((await M.lireDocumentLignes({name:'d.docx',type:'',arrayBuffer:async()=>ab})).txt)};
  const interne=await lire(await M.genererChiffrageInterneDocx(p));
  chk(/PEINTURE \(moins-value\)/i.test(interne)&&/-8 000,00 €/.test(interne)&&/Déduite/.test(interne),'le chiffrage interne : la moins-value, son montant en moins, « Déduite »');
  chk(/-800,00 €/.test(interne),'et sa rétrocession en moins');
  const client=await lire(await M.genererDossierDocx(p,{}));
  chk(/Options et moins-values proposées/.test(client),'le dossier client titre « Options et moins-values proposées »');
  chk(/-8 000,00 €/.test(client)&&/Déduite/.test(client)&&/En option/.test(client),'avec le montant en moins et les statuts « Déduite » / « En option »');
  chk(!/Rétro/.test(client.split('Options et moins-values')[1]||''),'sans rien d’interne (rétrocession) dans ce tableau');

  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
  process.exitCode=ko?1:0;
})().catch(e=>{console.error('ERREUR NON CAPTURÉE',e);process.exitCode=1});
