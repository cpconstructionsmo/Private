/* L'accueil du relevé : annuler une visite et la rétablir ; la visionneuse
   (toucher une image : en grand, zoom, ✕) — Chromium au format iPhone, faux
   Supabase, photos FICTIVES. */
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
  for(const nom of ['ALPHA','BETA']){
    await p.waitForSelector('#nouvelleVisite');
    const [c]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c.setFiles(PHOTO);
    await p.waitForSelector('img.garde[src^="blob:"]');
    await p.tap('#suivant');await p.fill('input[name="client.nom"]',nom);
    await p.tap('text=‹ Visites');
  }
  await p.waitForFunction(()=>document.querySelectorAll('[data-visite]').length===2);
  chk(await p.locator('#voirAnnulees').count()===0,'sans visite annulée : pas de filtre');
  /* la visionneuse : depuis la visite, la photo de garde */
  await p.tap('[data-visite] >> text=BETA');
  await p.tap('.progres button[aria-label^="Étape 1 "]');
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('img.garde');
  await p.waitForSelector('.visionneuse img');
  chk(await p.getAttribute('.visionneuse img','src')===await p.getAttribute('main img.garde','src'),'toucher une photo l’ouvre en grand');
  await p.tap('.barreVisionneuse button[aria-label="Zoomer"]');
  chk(await p.getAttribute('.visionneuse','data-zoom')==='1.50','« ＋ » zoome (×1,5)');
  await p.tap('.fermerVisionneuse');
  await p.waitForFunction(()=>!document.querySelector('.visionneuse'));
  chk(true,'✕ ferme la visionneuse');
  await p.tap('text=‹ Visites');
  /* annuler */
  await p.waitForFunction(()=>document.querySelectorAll('[data-visite]').length===2);
  await p.locator('[data-visite]',{hasText:'ALPHA'}).locator('.actionVisite').tap();
  await p.waitForFunction(()=>document.querySelectorAll('[data-visite]').length===1&&!!document.querySelector('#voirAnnulees'));
  chk(dialogues.some(m=>/Annuler la visite « ALPHA »/.test(m)&&/récupérable/.test(m)),'« ✕ » sur une carte : confirmation, la visite reste récupérable');
  chk(/Visites \(1\)/.test(await p.textContent('#voirEnCours'))&&/Annulées \(1\)/.test(await p.textContent('#voirAnnulees'))&&!/ALPHA/.test(await p.textContent('#listeVisites')),'la visite annulée quitte la liste ; filtre « Annulées (1) »');
  chk(await attendre(p,()=>Object.values(window.__etat.lignes||{}).some(l=>l.donnees.valeurs['client.nom']==='ALPHA'&&l.donnees.valeurs.statut==='annulee'&&l.donnees.valeurs.annulation.statutAvant==='en_cours')),'l’annulation part avec la visite (statut d’avant gardé)');
  await p.tap('#voirAnnulees');
  await p.waitForSelector('[data-visite] >> text=ALPHA');
  chk(/Annulée le/.test(await p.textContent('#listeVisites')),'dans « Annulées » : la date d’annulation');
  await p.locator('[data-visite]',{hasText:'ALPHA'}).locator('.actionVisite').tap();
  await p.waitForFunction(()=>document.querySelectorAll('[data-visite]').length===2&&!document.querySelector('#voirAnnulees'));
  chk(await attendre(p,()=>Object.values(window.__etat.lignes||{}).some(l=>l.donnees.valeurs['client.nom']==='ALPHA'&&l.donnees.valeurs.statut==='en_cours')),'« ↺ Rétablir » : la visite revient, avec son statut d’avant');
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
