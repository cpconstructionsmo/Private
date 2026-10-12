/* Vérification dans Chromium : à l'onglet Marchés, un lot soldé (entièrement
   facturé) est grisé — opacité réduite, pastille « ✓ soldé » — et revient en
   clair au survol ; un lot qui reste à facturer ne bouge pas. L'en-tête compte
   les lots soldés. Données fictives. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=require('path').resolve(__dirname,'..'), NM=__dirname+'/node_modules';
const DATA={chantiers:[{id:'c1',nom:'Maison Fictive',statut:'chantier',map:{}}],commandes:[],prospects:[],
  artisans:[{id:'a1',nom:'SARL Terre Fictive'},{id:'a2',nom:'SASU Maçonnerie Fictive'},{id:'a3',nom:'EURL Menuiserie Fictive'}],
  marches:[
    {id:'m1',chantierId:'c1',lot:'TERRASSEMENT',artisanId:'a1',montantHT:10254,tva:20,statut:'signe',dateSignature:'2025-09-01',
      factures:[{id:'f1',montant:4616.73,date:'2026-02-17'},{id:'f2',montant:5817,date:'2026-08-16',numero:'FA 3955'}]},
    {id:'m2',chantierId:'c1',lot:'MACONNERIE',artisanId:'a2',montantHT:6143,tva:20,statut:'signe',dateSignature:'2025-09-15',factures:[{id:'f3',montant:6143,date:'2026-05-15'}]},
    {id:'m3',chantierId:'c1',lot:'MENUISERIES',artisanId:'a3',montantHT:15133,tva:20,statut:'signe',dateSignature:'2025-09-01',factures:[{id:'f4',montant:10380,date:'2025-06-13'}]}]};
const FAUX_SUPA=`window.supabase={createClient:()=>{const q={select:()=>q,eq:()=>q,single:()=>Promise.resolve({data:{data:${JSON.stringify(DATA)}},error:null}),
 update:()=>q,upsert:()=>Promise.resolve({error:null})};return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}}}};`;
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:1440,height:900}});
  await ctx.route('**/*',r=>{const u=r.request().url();
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:FAUX_SUPA,contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^http:\/\/app\.local\/(.*?)(\?.*)?$/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  await p.mouse.move(4,450);await p.waitForTimeout(300);await p.click('nav.bot >> text=CHANTIERS');await p.waitForTimeout(300);
  await p.click('text=Maison Fictive');await p.click('button.tab:has-text("MARCHÉS")');
  await p.waitForSelector('text=SARL Terre Fictive');
  const opacite=nom=>p.evaluate(n=>{const tr=[...document.querySelectorAll('tr')].find(x=>x.textContent.includes(n));return tr?getComputedStyle(tr).opacity:null},nom);
  await p.mouse.move(4,450);await p.waitForTimeout(250);
  chk(await opacite('SARL Terre Fictive')==='0.5','le lot en dépassement (tout facturé) est grisé');
  chk(await opacite('SASU Maçonnerie Fictive')==='0.5','le lot soldé est grisé');
  chk(await opacite('EURL Menuiserie Fictive')==='1','le lot qui reste à facturer reste en clair');
  chk(await p.locator('tr.lot-solde >> text=✓ soldé').count()===2,'une pastille « ✓ soldé » sur chaque lot soldé');
  chk(/3 lots — facturé .* · 2 soldés/.test((await p.textContent('body')).replace(/[\u00a0\u202f]/g,' ')),'l’en-tête compte les lots soldés');
  if(process.env.CAPTURE_SOLDES){
    await p.mouse.move(1400,880);await p.evaluate(()=>{const t=[...document.querySelectorAll('th')].find(x=>x.textContent==='Entreprise');if(t)t.scrollIntoView({block:'start'})});
    await p.waitForTimeout(400);await p.screenshot({path:process.env.CAPTURE_SOLDES});
  }
  /* au survol, le lot grisé revient en clair pour être lu */
  await p.hover('text=SASU Maçonnerie Fictive');await p.waitForTimeout(250);
  chk(await opacite('SASU Maçonnerie Fictive')==='1','au survol, le lot soldé revient en clair');
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | '):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
  process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
