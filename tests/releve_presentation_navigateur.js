/* Mode « Présentation client » du relevé : masque les réglages internes,
   se souvient du choix — Chromium au format iPhone, faux Supabase. */
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
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
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
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  chk(!(await p.locator('#reglerOuvrages').isVisible())&&await p.locator('#reglagesPatron').isVisible(),'accueil normal : les réglages de prix sont repliés sous « ⚙ Réglages des prix »');
  await p.tap('#reglagesPatron > summary');
  chk(await p.locator('#reglerOuvrages').isVisible(),'un toucher les déplie');
  await p.tap('#bascPresentation');
  chk(!(await p.locator('#reglerOuvrages').isVisible()),'présentation : réglages internes masqués');
  chk(await p.evaluate(()=>document.body.classList.contains('presentation')),'présentation : classe posée');
  await p.reload();await p.waitForSelector('#nouvelleVisite');
  chk(!(await p.locator('#reglerOuvrages').isVisible()),'le choix est gardé après rechargement');
  await p.tap('#bascPresentation');
  chk(await p.locator('#reglagesPatron').isVisible(),'retour au mode normal');
  /* la démo guidée : 5 écrans fictifs, rien n'est écrit */
  await p.tap('#lancerDemo');await p.waitForSelector('#demoPage');
  chk(/Bienvenue/.test(await p.textContent('#demoPage')),'démo : premier écran');
  await p.tap('#demoSuivant');await p.waitForSelector('.cmpAvApres');
  await p.locator('.cmpRange').evaluate(e=>{e.value=20;e.dispatchEvent(new Event('input',{bubbles:true}))});
  chk(await p.evaluate(()=>document.querySelector('.cmpAvApres').style.getPropertyValue('--pos'))==='20%','démo : le curseur avant/après se règle');
  await p.tap('#demoSuivant');await p.tap('#demoSuivant');
  await p.waitForFunction(()=>/€/.test(document.getElementById('demoMontant').textContent)&&/164/.test(document.getElementById('demoMontant').textContent.replace(/\s/g,'')));
  chk(true,'démo : le budget roule jusqu’à sa valeur');
  await p.tap('#demoSuivant');await p.tap('#demoFin');await p.waitForSelector('#nouvelleVisite');
  chk(await p.evaluate(()=>!Object.keys((window.__etat||{}).lignes||{}).length),'la démo n’écrit rien en base');
  /* l'écran « Waouh » de fin de visite et l'avancement sur la carte */
  const [c]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('#suivant');await p.fill('input[name="client.nom"]','WAOUH');
  await p.tap('text=‹ Visites');await p.waitForSelector('[data-visite]');
  chk(/\d\/\d/.test(await p.textContent('[data-visite] .avancement')),'carte de visite : avancement n/total');
  await p.tap('[data-visite]');
  for(let k=0;k<6;k++){if(await p.locator('#herosFin').count())break;await p.tap('#suivant')}
  await p.waitForSelector('#herosFin');
  chk(/WAOUH/.test(await p.textContent('#herosFin')),'fin de visite : l’écran « Waouh » montre le client');
  chk(!erreurs.length,'aucune erreur dans la page');
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
