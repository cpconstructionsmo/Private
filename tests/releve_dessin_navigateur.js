/* Relevé de visite — le dessin rapide (sans scan), dans Chromium au format
   iPhone, faux Supabase, pièces FICTIVES :
   - « ✏️ Dessin rapide » depuis l'étape Scan ; pièces posées au doigt (− / +,
     à droite, en dessous), aperçu qui suit ;
   - « Créer le plan » ouvre le moteur : un seul mur commun entre deux pièces ;
   - le dessin et le plan partent avec la visite ; le résumé suit. */
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
  const p=await ctx.newPage();p.setDefaultTimeout(15000);const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('dialog',d=>d.accept());
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('.progres button[aria-label^="Étape 5 "]');
  await p.tap('#dessinRapide');
  await p.waitForSelector('#ajouterPieceDessin');
  await p.tap('#ajouterPieceDessin');
  await p.waitForSelector('input[name="dessin-longueur"]');
  await p.fill('input[name="dessin-longueur"]','5');await p.locator('input[name="dessin-longueur"]').press('Enter');
  await p.waitForFunction(()=>/5 × 3 m/.test(document.querySelector('[data-dessin]').textContent));
  await p.tap('button[aria-label="LARGEUR (haut ↕ bas) plus"]');
  await p.waitForFunction(()=>/5 × 3,1 m/.test(document.querySelector('[data-dessin]').textContent));
  chk(true,'1re pièce (Séjour) : longueur tapée 5 m, largeur + 10 cm au bouton « + »');
  await p.tap('#ajouterPieceDessin');
  await p.waitForFunction(()=>document.querySelectorAll('[data-dessin]').length===2);
  await p.tap('[data-dessin]:nth-of-type(2) >> text=Cuisine').catch(async()=>{await p.locator('.pieceDessin.sel .puces button',{hasText:'Cuisine'}).first().tap()});
  await p.waitForFunction(()=>/Cuisine/.test(document.querySelector('.pieceDessin.sel').textContent));
  // la pose précise est repliée sous « Plus de réglages » (le doigt suffit le plus souvent)
  if(!(await p.locator('.pieceDessin.sel .reglagesPiece[open]').count()))await p.click('.pieceDessin.sel .reglagesPiece summary');
  await p.locator('.pieceDessin.sel .puces button',{hasText:'en dessous de'}).tap();
  await p.waitForFunction(()=>document.querySelectorAll('.apercuDessin [data-piece-dessin]').length===2);
  chk(/2 pièces · 24,5 m²/.test(await p.textContent('main')),'2e pièce « Cuisine » posée en dessous : l’aperçu montre 2 pièces, 24,5 m² (15,5 + 9)');
  await p.screenshot({path:SORTIE+'/releve_dessin.png',fullPage:true});
  const enreg=await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const d=L[0]&&L[0].donnees.valeurs.dessin;return !!(d&&d.pieces.length===2)});
  chk(enreg,'le dessin est gardé avec la visite (et part sur le serveur)');

  await p.tap('#creerPlanDessin');
  await p.waitForSelector('#cadrePlan');
  const frame=await (async()=>{for(let i=0;i<80;i++){const f=p.frames().find(x=>/moteur\/index\.html/.test(x.url()));if(f&&await f.evaluate(()=>!!(window.__releve&&window.__releve.donnees())).catch(()=>false))return f;await p.waitForTimeout(100)}return null})();
  chk(!!frame,'« Créer le plan » ouvre le moteur de relevé');
  const communs=frame&&await frame.evaluate(()=>window.__releve.analyser(window.__releve.donnees()).walls.filter(w=>w.rooms.length===2).length);
  chk(communs===1,'le moteur voit un seul mur commun entre le séjour et la cuisine');
  await p.tap('#fermerPlan');
  await p.waitForSelector('#resumePlan');
  chk(/2 pièces · 24,5 m²/.test(await p.textContent('#resumePlan')),'retour à la visite : le résumé du plan (2 pièces, 24,5 m²)');
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const pl=L[0]&&L[0].donnees.valeurs.plan;return !!(pl&&pl.releve&&pl.releve.pieces.length===2&&pl.resume.detail.length===2)}),'le plan part avec la visite (relevé et détail des pièces pour la fourchette de prix)');
  chk(/Reprendre le dessin/.test(await p.textContent('#dessinRapide')),'le dessin se reprend plus tard');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
