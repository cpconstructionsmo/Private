/* Relevé de visite — « 🏛 Dossier permis » : le fichier cp-permis (client, adresse, plan en DXF) que l'Atelier lit.
   Chromium au format iPhone, faux Supabase, pièces FICTIVES. Le DXF est calculé par un moteur caché : la visite,
   son plan et son état d'envoi ne bougent pas. */
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
  /* à la fin de la visite : le bloc « Dossier permis », avec un plan */
  await p.tap('.progres button[aria-label^="Étape 7 "]');
  await p.waitForSelector('#herosFin');
  chk(await p.locator('#blocPermis').count()===1,'avec un plan : le bloc « Dossier permis » est proposé à la fin de la visite');
  await p.waitForTimeout(3500);   // la synchro enregistre d'abord le changement d'étape : on photographie après
  const instant=()=>p.evaluate(()=>{const L=Object.values(window.__etat.lignes||{});return {plan:JSON.stringify(L.map(l=>l.donnees.valeurs.plan)),version:L.map(l=>l.version).join(','),ecritures:window.__etat.ecritures||0}});
  const avant=await instant();
  await p.tap('#preparerPermis');
  await p.waitForSelector('#telechargerPermis',{timeout:40000});
  const fichier=await p.evaluate(async()=>{const a=document.querySelector('#telechargerPermis');const t=await (await fetch(a.href)).text();return {nom:a.download,texte:t}});
  const d=JSON.parse(fichier.texte);
  chk(d.format==='cp-permis'&&d.version===1&&/^dossier-permis-.*\.json$/.test(fichier.nom),'le fichier est au format cp-permis, nommé « dossier-permis-….json » ('+fichier.nom+')');
  const dxf=Buffer.from(d.plan.dxf_base64,'base64').toString('latin1');
  chk(/SECTION/.test(dxf)&&/\nMURS\r?\n/.test(dxf)&&/ENDSEC/.test(dxf),'le plan est joint en DXF (calque MURS), '+Math.round(dxf.length/1024)+' Ko');
  chk(/S[ée]jour|S\xe9jour/.test(dxf)||/Cuisine/.test(dxf),'les pièces du plan sont dans le DXF');
  chk(d.visite.id&&d.client.nom!==undefined&&d.projet&&Array.isArray(d.projet.parcelles),'visite, client et projet sont présents (rien d’inventé : vides si inconnus)');
  chk(!/notes|budget|marge/i.test(Object.keys(d).join(',')),'ni notes ni budget ni marge dans le fichier');
  await p.waitForTimeout(1200);
  const apres=await instant();
  chk(avant.plan===apres.plan,'le plan de la visite est strictement identique après la préparation');
  chk(avant.version===apres.version&&avant.ecritures===apres.ecritures,'rien n’est réécrit sur le serveur pendant la préparation (version '+avant.version+' → '+apres.version+', écritures '+avant.ecritures+' → '+apres.ecritures+')');
  chk(await p.locator('iframe[title*="caché"]').count()===0,'le moteur caché est retiré après usage');
  await p.tap('#bascPresentation');
  chk(await p.locator('#blocPermis').isHidden(),'en mode présentation : le bloc interne est masqué');
  require('fs').writeFileSync(SORTIE+'/dossier-permis-test.json',fichier.texte);
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
