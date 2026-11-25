/* Vérification dans Chromium : un chiffrage de lot perdu se retrouve dans
   une version rangée sur l'appareil (IndexedDB « cp-versions ») et revient
   dans la fiche du lot, puis s'enregistre. Données fictives. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=require('path').resolve(__dirname,'..'), NM=__dirname+'/node_modules';
const L=qts=>qts.map((q,i)=>({id:'l'+i,ref:'a'+i,code:'C'+i,libelle:'Article fictif '+i,unite:'M²',pu:100,qt:q}));
const LOT=(qts,montant,extra)=>({id:'m1',chantierId:'c1',lot:'Carrelage',artisanId:'a1',montantHT:montant,tva:20,statut:'consulter',
  quantitatif:{bordereauId:'b1',nom:'Bordereau fictif',lignes:L(qts)},...(extra||{})});
const DATA={chantiers:[{id:'c1',nom:'Maison Fictive',client:'Client Fictif',adresse:'Commune fictive',statut:'travaux',map:{},
    budgetClientTTC:180000,tva:20,docs:{}}],commandes:[],prospects:[],
  artisans:[{id:'a1',nom:'SARL Carrelage Fictive'}],
  bordereaux:[{id:'b1',nom:'Bordereau fictif',articles:[0,1,2].map(i=>({id:'a'+i,code:'C'+i,libelle:'Article fictif '+i,unite:'M²',pu:100}))}],
  marches:[LOT([5,'',''],500)]};
/* l'état d'il y a quatre jours, rangé sur l'appareil comme le fait l'application */
const ANCIEN={...DATA,marches:[LOT([5,5,5],1500)]};
/* le faux Supabase garde ce que l'application écrit, pour le relire ensuite */
const fauxSupa=data=>`window.__ecrit=null;window.supabase={createClient:()=>{const q={select:()=>q,eq:()=>q,
 single:()=>Promise.resolve({data:{data:${JSON.stringify(data)}},error:null}),
 update:x=>{window.__ecrit=x.data;return {eq:()=>({eq:()=>({select:()=>Promise.resolve({data:[{updated_at:x.updated_at}],error:null})})})}},
 upsert:x=>{window.__ecrit=x.data;return {select:()=>Promise.resolve({data:[{updated_at:x.updated_at}],error:null})}}};
 return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}}}};`;
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
/* le texte affiché (textContent lirait aussi le script de l'application) */
const texte=async p=>(await p.innerText('body')).replace(/[  ]/g,' ');
async function contexte(b,data,viewport){
  const ctx=await b.newContext({viewport});
  await ctx.route('**/*',r=>{const u=r.request().url();
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:fauxSupa(data),contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^http:\/\/app\.local\/(.*?)(\?.*)?$/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  /* sur grand écran, le menu se montre quand la souris approche du bord gauche */
  await p.mouse.move(4,450);await p.waitForTimeout(300);await p.click('nav.bot >> text=CHANTIERS');await p.waitForTimeout(300);
  await p.click('text=Maison Fictive');await p.waitForSelector('text=Budget et avenants');
  return {ctx,p,erreurs};
}
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:1280,height:900}});
  await ctx.route('**/*',r=>{const u=r.request().url();
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:fauxSupa(DATA),contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^http:\/\/app\.local\/(.*?)(\?.*)?$/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));
  p.on('dialog',d=>d.accept());
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  /* une version d'il y a quatre jours, rangée dans le stockage de l'appareil */
  await p.evaluate(ancien=>new Promise(ok=>{const r=indexedDB.open('cp-versions',1);
    r.onupgradeneeded=()=>{r.result.createObjectStore('versions',{keyPath:'id'})};
    r.onsuccess=()=>{const tx=r.result.transaction('versions','readwrite');
      tx.objectStore('versions').put({id:'jour-2026-11-21',le:'2026-11-21T08:00:00.000Z',motif:'Version automatique du jour',
        resume:{chantiers:1,prospects:0,artisans:1,marches:1},data:ancien});tx.oncomplete=()=>ok()}}),ANCIEN);
  await p.mouse.move(4,450);await p.waitForTimeout(300);await p.click('nav.bot >> text=CHANTIERS');await p.waitForTimeout(300);
  await p.click('text=Maison Fictive');await p.waitForSelector('button:text-is("MARCHÉS")');
  await p.click('button:text-is("MARCHÉS")');
  await p.click('text=Modifier le lot ›');
  await p.click('button:has-text("Retrouver un chiffrage précédent de ce lot")');
  await p.waitForSelector('button:has-text("Reprendre ce chiffrage")',{timeout:10000});
  const t=(await p.innerText('body')).replace(/[\u00a0\u202f]/g,' ');
  chk(/21\/11\/2026.*\(cet appareil\) — 1 500,00 € HT, 3 articles servis/.test(t),'la version de l’appareil : le lot à 1 500 € HT, 3 articles servis');
  await p.click('button:has-text("Reprendre ce chiffrage")');
  await p.waitForSelector('text=repris dans le formulaire');
  if(process.env.CAPTURE_LOT)await p.screenshot({path:process.env.CAPTURE_LOT,fullPage:false});
  await p.click('.card:has(input[placeholder="Ex. Maçonnerie — Gros œuvre"]) >> button:text-is("Enregistrer")');
  await p.waitForFunction(()=>window.__ecrit&&window.__ecrit.marches[0].montantHT===1500,null,{timeout:15000});
  chk(true,'enregistré : le lot revient à 1 500 € HT');
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | '):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
  process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
