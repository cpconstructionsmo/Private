/* Ajouter une fenêtre en un geste dans le dessin rapide — Chromium bureau (souris), faux Supabase :
   une pièce choisie propose, juste sous le plan, le mur (en orange), puis Fenêtre / Porte / Baie / Passage ;
   deux touchers posent l'ouverture, visible tout de suite sur le plan. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const {fauxSupabase}=require('./releve_faux_supabase');
const R=path.resolve(__dirname,'..'), SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const PHOTO=path.join(__dirname,'fixtures','portrait.jpg');
const {scan}=require('./releve_scan_fictif');
const BIBLIO=`window.__etat=window.__etat||{};${fauxSupabase.toString()};window.supabase={createClient:()=>fauxSupabase(window.__etat)};`;
const attendre=async(p,f,ms=10000)=>{const t=Date.now();while(Date.now()-t<ms){if(await p.evaluate(f))return true;await p.waitForTimeout(100)}return false};

let b;
(async()=>{
  b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:1600,height:1000},deviceScaleFactor:1});
  await ctx.route('**/*',async r=>{const u=r.request().url();
    if(/supabase-js/.test(u))return r.fulfill({body:BIBLIO,contentType:'text/javascript'});
    const m=u.match(/^https:\/\/app\.local\/([^?#]*)/);
    if(m){let f=path.join(R,decodeURIComponent(m[1]));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
      if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f,contentType:/\.js$/.test(f)?'text/javascript':/\.html$/.test(f)?'text/html':undefined});
      return r.fulfill({status:404,body:''})}
    if(/geo\.api\.gouv\.fr\/communes\?codePostal=61000/.test(u))return r.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify([{nom:'Alençon'}])});
    if(/geo\.api\.gouv\.fr\/communes\?codePostal=53100/.test(u))return r.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify([{nom:'Mayenne'},{nom:'Aron'},{nom:'Moulay'}])});
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();p.setDefaultTimeout(15000);const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));
  const dialogues=[];p.on('dialog',d=>{dialogues.push(d.message());d.accept()});
  await p.goto('https://app.local/releve/');await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.click('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.click('.progres button[aria-label^="Étape 5 "]');
  await p.click('#dessinRapide');await p.waitForSelector('#ajouterPieceDessin');
  await p.click('#ajouterPieceDessin');await p.waitForSelector('.apercuDessin [data-piece-dessin]');
  const box=async()=>p.locator('.apercuDessin [data-piece-dessin] rect').first().boundingBox();
  // la pièce choisie : la barre « Ajouter une fenêtre ou une porte » est juste sous le plan, avec le mur du bas proposé
  await p.waitForSelector('#barreMur');
  chk(/Ajouter une fenêtre ou une porte/.test(await p.textContent('#barreMur')),'une pièce choisie : « Ajouter une fenêtre ou une porte » apparaît juste sous le plan');
  chk(await p.locator('.apercuDessin line[stroke="#EA7A1A"]').count()===1&&await p.locator('#barreMur [data-mur-cote="bas"]').evaluate(e=>e.classList.contains('on')),'le mur du bas est proposé, en orange sur le plan');
  await p.click('#barreMur [data-mur-cote="haut"]');
  await p.waitForFunction(()=>document.querySelector('#barreMur [data-mur-cote="haut"]').classList.contains('on'));
  chk(await p.locator('.apercuDessin line[stroke="#EA7A1A"]').count()===1,'un autre mur : le trait orange le suit');
  chk(await p.locator('#barreMur [data-mur-ajout]').count()===4,'quatre choix : porte, fenêtre, porte-fenêtre, passage');
  const visible=await p.evaluate(()=>{const r=document.getElementById('barreMur').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight});
  chk(visible,'la barre est visible sans faire défiler l’écran');
  await p.screenshot({path:SORTIE+'/releve_fenetre_ici.png'});
  await p.click('#barreMur [data-mur-ajout="fenetre"]');
  await p.waitForFunction(()=>document.querySelectorAll('.ouvDessin').length===1);
  chk(await p.locator('.ouvDessin [data-cote="haut"]').first().evaluate(e=>e.classList.contains('on')),'la fenêtre est posée sur le mur choisi (haut)');
  chk(await p.locator('.apercuDessin').evaluate(s=>s.querySelectorAll('line,rect').length>0),'et se voit tout de suite sur le plan');
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
