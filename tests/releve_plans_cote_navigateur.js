/* Plusieurs plans côte à côte (relevé de visite, étape Scan) — Chromium au format
   iPhone, faux Supabase, plans FICTIFS :
   - « ＋ Ajouter un plan » : le RDC (image) se range à côté du plan existant, nommé,
     renommable, retirable ; un PDF est refusé avec son explication ;
   - chaque plan ajouté a sa propre copie annotée (annotationsPlus), sans toucher
     à la copie du plan principal (annotations) ;
   - dossier client : « Les plans côte à côte » et les copies annotées, en option
     (décochées d'office) ; les plans ajoutés partent avec la visite. */
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
  const repondre=(corps,statut)=>p.evaluate(([c,s])=>{window.__etat.fonctions={imaginer:s?{statut:s,corps:c}:{corps:c}}},[corps,statut||0]);
  p.removeAllListeners('dialog');p.on('dialog',d=>d.accept());
  const annot=()=>p.evaluate(()=>{const L=Object.values(window.__etat.lignes||{});return L[0]&&L[0].donnees.valeurs.annotations});
  const sv=()=>p.evaluate(()=>{const L=Object.values(window.__etat.lignes||{});return L[0]&&L[0].donnees});
  const surServeur=(cond)=>attendre(p,'(()=>{const L=Object.values(window.__etat.lignes||{});const d=L[0]&&L[0].donnees;const ph=Object.values((d&&d.photos)||{});const v=(d&&d.valeurs)||{};return !!('+cond+')})()');
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('.progres button[aria-label^="Étape 5 "]');
  await p.waitForSelector('#plansAjoutes');
  chk(await p.locator('#plansCote').count()===0&&/Ajoutez le plan d’un autre niveau/.test(await p.textContent('#plansAjoutes')),'sans plan ajouté : une invitation à ajouter le plan d’un autre niveau');
  /* un plan principal (importé) */
  await repondre({parties:[{nom:'RDC',pieces:[{nom:'Salon',longueur:4.3,largeur:5.49,x:0,y:0}]}]});
  const [c2]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#importerPlan2D')]);await c2.setFiles(PHOTO);
  await p.waitForSelector('#ajouterPieceDessin');
  await p.tap('text=‹ Visite');
  await p.waitForSelector('#blocAnnotations');

  /* ajouter le RDC à côté */
  const [c3]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#ajouterPlan')]);await c3.setFiles(PHOTO);
  await p.waitForSelector('[data-plan-ajoute]');
  chk(await p.inputValue('[data-plan-ajoute] input[name="nomPlan"]')==='Rez-de-chaussée','le premier plan ajouté s’appelle « Rez-de-chaussée » (modifiable)');
  const figs=await p.$$eval('#plansCote figure',els=>els.map(e=>e.textContent.trim()));
  chk(figs.length===2&&figs[0]==='Rez-de-chaussée'&&figs[1]==='Plan importé','côte à côte : le RDC à gauche, le plan importé à droite ('+figs.join(' | ')+')');
  const cotes=await p.evaluate(()=>{const f=[...document.querySelectorAll('#plansCote figure')].map(e=>e.getBoundingClientRect());return f.length===2&&f[0].top<f[1].bottom&&f[1].top<f[0].bottom&&f[0].left<f[1].left});
  chk(cotes,'les deux plans sont sur la même ligne, le RDC à gauche (même sur iPhone)');
  const id1=await p.getAttribute('[data-plan-ajoute]','data-plan-ajoute');
  chk(await surServeur('ph.some(x=>x.role==="planAjoute"&&x.legende==="Rez-de-chaussée"&&!x.supprime)'),'le plan ajouté part avec la visite (photo « planAjoute »)');

  /* le nommer, par un toucher puis à la main */
  await p.locator('[data-plan-ajoute] .puces button',{hasText:'1er étage'}).tap();
  await p.waitForFunction(()=>document.querySelector('[data-plan-ajoute] input[name="nomPlan"]').value==='1er étage');
  await p.fill('[data-plan-ajoute] input[name="nomPlan"]','RDC garage');await p.press('[data-plan-ajoute] input[name="nomPlan"]','Tab');
  await p.waitForFunction(()=>/RDC garage/.test(document.getElementById('plansCote').textContent));
  chk(await surServeur('ph.some(x=>x.id==="'+id1+'"&&x.legende==="RDC garage")'),'le nom du plan se change d’un toucher ou à la main, et il est gardé');

  /* un second plan : prend le nom suivant ; un PDF est refusé avec son explication */
  const [c4]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#ajouterPlan')]);await c4.setFiles(PHOTO);
  await p.waitForFunction(()=>document.querySelectorAll('[data-plan-ajoute]').length===2);
  chk((await p.$$eval('[data-plan-ajoute] input[name="nomPlan"]',e=>e.map(x=>x.value))).join('|')==='RDC garage|Rez-de-chaussée','le second plan prend le premier nom libre (« Rez-de-chaussée »)');
  const [c5]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#ajouterPlan')]);await c5.setFiles({name:'plan.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4')});
  await p.waitForSelector('.message.att');
  chk(/PDF/.test(await p.textContent('.message.att'))&&await p.locator('[data-plan-ajoute]').count()===2,'un PDF n’est pas ajouté : le message dit d’exporter une image');

  /* annoter la copie du premier plan ajouté, sans toucher à la copie du plan principal */
  await p.tap('[data-plan-ajoute="'+id1+'"] [data-annoter-plan]');
  await p.waitForFunction(()=>{const c=document.querySelector('#toileAnnot');return c&&c.width>0});
  const boite=await p.locator('#toileAnnot').boundingBox(), X=f=>boite.x+boite.width*f, Y=f=>boite.y+boite.height*f;
  await p.mouse.move(X(.2),Y(.2));await p.mouse.down();for(let i=1;i<=10;i++)await p.mouse.move(X(.2+i*.03),Y(.2+i*.02));await p.mouse.up();
  await p.waitForFunction(()=>/1 trait/.test(document.getElementById('compteAnnot').textContent));
  await p.tap('#terminerAnnot');
  await p.waitForSelector('[data-resume-annot="'+id1+'"]');
  await p.waitForFunction(id=>/Copie annotée · 1 trait/.test(document.querySelector('[data-resume-annot="'+id+'"]').textContent),id1);
  chk(await surServeur('v.annotationsPlus&&v.annotationsPlus["'+id1+'"]&&v.annotationsPlus["'+id1+'"].elements.length===1&&v.annotationsPlus["'+id1+'"].imageId'),'la copie annotée du plan ajouté est gardée sous son plan, avec son image');
  chk(await surServeur('!v.annotations||!v.annotations.fondId'),'la copie du plan principal n’a pas bougé (aucune annotation créée)');
  chk(await p.locator('#blocAnnotations [data-resume-annot]').count()===0,'et son écran ne montre pas cette copie');

  /* puis celle du plan principal : l'autre n'est pas touchée */
  await p.tap('[data-fond="planPapier"]');
  await p.waitForFunction(()=>{const c=document.querySelector('#toileAnnot');return c&&c.width>0});
  const b2=await p.locator('#toileAnnot').boundingBox();
  await p.tap('[data-outil="fleche"]');await p.mouse.move(b2.x+b2.width*.3,b2.y+b2.height*.5);await p.mouse.down();await p.mouse.move(b2.x+b2.width*.6,b2.y+b2.height*.6,{steps:5});await p.mouse.up();
  await p.waitForFunction(()=>/1 flèche/.test(document.getElementById('compteAnnot').textContent));
  await p.tap('#terminerAnnot');await p.waitForSelector('#resumeAnnot');
  chk(await surServeur('v.annotations&&v.annotations.elements.length===1&&v.annotations.elements[0].type==="fleche"&&v.annotationsPlus["'+id1+'"].elements.length===1&&v.annotationsPlus["'+id1+'"].elements[0].type==="trait"'),'chaque plan garde ses propres annotations (flèche sur le principal, trait sur le RDC)');
  /* continuer celle du plan ajouté : on retombe sur la sienne */
  await p.tap('[data-plan-ajoute="'+id1+'"] [data-annoter-plan]');
  await p.waitForFunction(()=>/1 trait/.test(document.getElementById('compteAnnot').textContent));
  chk(true,'« Continuer les annotations » d’un plan ajouté rouvre sa propre copie (1 trait)');
  await p.tap('#terminerAnnot');await p.waitForSelector('#plansAjoutes');

  /* dossier client */
  await p.tap('.progres button[aria-label^="Étape 7 "]');
  await p.tap('#ouvrirDossier');await p.waitForSelector('.dossier .feuille');
  chk(await p.locator('input[name="opt-plansCote"]').count()===1&&!(await p.isChecked('input[name="opt-plansCote"]'))&&await p.locator('.plansCoteDossier').count()===0,'dossier : « Les plans côte à côte » proposé, décoché d’office');
  await p.check('input[name="opt-plansCote"]');
  await p.waitForSelector('.plansCoteDossier');
  const cap=await p.$$eval('.plansCoteDossier figcaption',e=>e.map(x=>x.textContent));
  chk(cap.join('|')==='RDC garage|Rez-de-chaussée|Plan importé','dossier : les plans côte à côte avec leurs noms ('+cap.join(' | ')+')');
  await p.check('input[name="opt-planAnnote"]');
  await p.waitForFunction(()=>/Les travaux envisagés · RDC garage/.test(document.querySelector('.dossier').textContent));
  chk(!/Les travaux envisagés · Rez-de-chaussée/.test(await p.textContent('.dossier')),'dossier : la copie annotée du RDC garage a sa page ; l’autre plan, non annoté, n’en a pas');
  await p.uncheck('input[name="opt-plansCote"]');await p.uncheck('input[name="opt-planAnnote"]');
  await p.tap('text=‹ Visite');await p.tap('.progres button[aria-label^="Étape 5 "]');await p.waitForSelector('#plansAjoutes');

  /* retirer un plan : sa copie annotée part avec lui, l'autre reste */
  const idsCopie=(await sv()).valeurs.annotationsPlus[id1];const fondId=idsCopie.fondId,imageId=idsCopie.imageId;
  chk(!!fondId&&!!imageId,'(le plan à retirer a bien une copie annotée : fond et image)');
  await p.screenshot({path:require('os').tmpdir()+'/cp-tests/releve_plans_cote.png',fullPage:true});
  await p.tap('[data-plan-ajoute="'+id1+'"] button[aria-label^="Retirer le plan"]');
  await p.waitForFunction(()=>document.querySelectorAll('[data-plan-ajoute]').length===1);
  chk(await surServeur('ph.find(x=>x.id==="'+id1+'").supprime&&ph.find(x=>x.id==="'+fondId+'").supprime&&ph.find(x=>x.id==="'+imageId+'").supprime&&!(v.annotationsPlus||{})["'+id1+'"]'),'retirer le plan : lui, le fond et l’image de sa copie annotée sont notés supprimés, et sa copie disparaît des annotations');
  chk(await surServeur('v.annotations&&v.annotations.elements.length===1'),'la copie annotée du plan principal est intacte');
  chk(await p.locator('[data-plan-ajoute]').count()===1&&(await p.$$eval('#plansCote figure',e=>e.length))===2,'l’autre plan reste, côte à côte avec le principal');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
