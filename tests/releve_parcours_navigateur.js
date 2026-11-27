/* Les quatre changements de parcours issus de l'audit iPhone — Chromium au format iPhone, faux Supabase :
   - accueil : les réglages de prix du patron sont repliés ;
   - client : un seul acheteur d'abord, « ＋ Un 2e acheteur » en bas ;
   - pièces : « Ajouter une pièce » avant la carte d'aide ;
   - scan : trois chemins d'égale importance, aucun bouton « principal ». */
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
  await p.goto('https://app.local/releve/');await p.waitForSelector('#nouvelleVisite');
  chk(await p.locator('#reglagesPatron').evaluate(d=>d.tagName==='DETAILS'&&!d.open),'accueil : « ⚙ Réglages des prix » est replié');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  /* client */
  await p.tap('.progres button[aria-label^="Étape 2 "]');
  chk(await p.locator('button[name="client.nbAcheteurs"]').count()===1&&!/NOMBRE D’ACHETEURS/.test(await p.textContent('main')),'client : pas de question « nombre d’acheteurs » au départ');
  const ordre=await p.evaluate(()=>{const t=document.querySelector('main').innerText;return [t.indexOf('NOM'),t.indexOf('2e acheteur')]});
  chk(ordre[0]>=0&&ordre[0]<ordre[1],'client : le nom vient avant « ＋ Un 2e acheteur »');
  await p.tap('button[name="client.nbAcheteurs"]');
  await p.waitForSelector('[data-acheteur="2"]');
  chk(await p.locator('button[name="client.nbAcheteurs"]').count()===3,'un 2e acheteur : la carte et les choix 1 / 2 / 3 apparaissent');
  await p.tap('button[name="client.nbAcheteurs"] >> text=1');
  await p.waitForFunction(()=>!document.querySelector('[data-acheteur="2"]'));
  chk(await p.locator('button[name="client.nbAcheteurs"]').count()===1,'retour à un seul acheteur : le bouton « ＋ Un 2e acheteur » revient');
  /* pièces */
  await p.tap('.progres button[aria-label^="Étape 4 "]');
  const pos=await p.evaluate(()=>{const a=[...document.querySelectorAll('main .champ')].find(e=>/AJOUTER UNE PIÈCE/.test(e.textContent)),b=document.getElementById('raccourcisIA');return a&&b?(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?1:-1):0});
  chk(pos===1,'pièces : « Ajouter une pièce » vient avant la carte « Gagner du temps »');
  /* scan */
  await p.tap('.progres button[aria-label^="Étape 5 "]');
  await p.waitForSelector('#troisChemins');
  const ch=await p.evaluate(()=>[...document.querySelectorAll('#troisChemins button')].map(b=>({id:b.id,t:b.textContent.trim(),sec:b.classList.contains('sec')})));
  chk(ch.length===3&&ch.every(b=>b.sec)&&ch.map(b=>b.id).join()==='dessinRapide,importerPlan2D,importerScan','scan : trois chemins, aucun bouton « principal » (tous de même poids)');
  chk(ch.map(b=>b.t).join('|')==='✏️ Dessiner les pièces|📷 Photo d’un plan|📐 Scan iPhone','les trois choix se lisent sans jargon');
  chk(await p.locator('#troisChemins details').evaluate(d=>!d.open)&&!/JSON/.test(await p.locator('#troisChemins .chemin').nth(2).locator('> p').textContent()),'le jargon (OpenPlan, JSON) est replié sous « Comment l’exporter ? »');
  chk(await p.evaluate(()=>{const a=document.getElementById('troisChemins'),b=document.getElementById('blocAnnotations');return !b||(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING)>0}),'« Plans et annotations » vient après les trois chemins');
  await p.screenshot({path:SORTIE+'/releve_parcours_scan.png',fullPage:true});
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
