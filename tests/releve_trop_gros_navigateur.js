/* La pastille « Fichier trop gros » du relevé — Chromium au format iPhone, faux Supabase à limite de taille :
   elle nomme le fichier, un toucher ouvre une fenêtre claire (nom, taille, limite, choix), « Retirer » l'enlève de la visite. */
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
  await p.addInitScript(()=>{window.__etat=window.__etat||{};window.__etat.tailleMax=100});   // tout fichier de plus de 100 octets est refusé
  await p.goto('https://app.local/releve/');await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.waitForFunction(()=>/trop gros/.test(document.getElementById('etatSync').textContent),null,{timeout:20000});
  const pastille=await p.textContent('#etatSync');
  chk(/Photo de la maison/.test(pastille)&&/trop gros/.test(pastille),'la pastille nomme le fichier : '+pastille.trim());
  chk(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'la pastille ne fait pas déborder l’écran sur la largeur d’un iPhone');
  await p.tap('#etatSync');
  await p.waitForSelector('#fichiersTropGros');
  const t=await p.textContent('#fichiersTropGros');
  chk(/trop gros pour le serveur/.test(t)&&/Photo de la maison/.test(t)&&/Mo/.test(t)&&/50 Mo/.test(t)&&/dossier du client/.test(t),'un toucher ouvre une fenêtre : quel fichier, sa taille, la limite, ce que ça change');
  chk(await p.locator('#fichiersTropGros button').count()===3,'trois choix clairs : retirer ce fichier, fermer, réessayer');
  await p.screenshot({path:SORTIE+'/releve_trop_gros.png'});
  await p.tap('#fichiersTropGros [data-fichier-trop-gros] button');
  await p.waitForFunction(()=>!document.getElementById('fichiersTropGros')&&!/trop gros/.test(document.getElementById('etatSync').textContent),null,{timeout:20000});
  chk(!/trop gros/.test(await p.textContent('#etatSync')),'« Retirer » : le fichier quitte la visite et la pastille disparaît ('+(await p.textContent('#etatSync')).trim()+')');
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
