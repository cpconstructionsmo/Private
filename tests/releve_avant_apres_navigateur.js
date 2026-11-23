/* Avant / après (relevé de visite) — Chromium, faux Supabase :
   - depuis le dessin rapide : l'aperçu du dessin devient le plan « avant »,
     sa copie « après travaux » s'annote ; onglets Avant | Après sur iPhone ;
   - depuis le plan coté : le moteur rend l'image du plan, les annotations
     déjà faites sont gardées ; « ✓ Terminer » ramène d'où l'on vient ;
   - sur grand écran, les deux plans côte à côte. */
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
  const annot=()=>p.evaluate(()=>{const L=Object.values(window.__etat.lignes||{});return L[0]&&L[0].donnees.valeurs.annotations});
  const attendreA=async f=>{for(let i=0;i<80;i++){const a=await annot();if(a&&f(a))return a;await p.waitForTimeout(100)}return null};
  const visible=sel=>p.evaluate(s=>{const e=document.querySelector(s);return !!e&&e.offsetParent!==null},sel);
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('.progres button[aria-label^="Étape 5 "]');
  await p.tap('#dessinRapide');
  await p.tap('#ajouterPieceDessin');
  await p.fill('input[name="dessin-longueur"]','5');await p.locator('input[name="dessin-longueur"]').press('Enter');
  await p.waitForFunction(()=>/5 × 3 m/.test(document.querySelector('[data-dessin]').textContent));
  /* depuis le dessin rapide */
  await p.tap('#avantApresDessin');
  await p.waitForSelector('#duoAvantApres');
  await p.waitForSelector('#planAvant img[src^="blob:"]',{state:'attached'});
  chk(/Avant \/ après/.test(await p.textContent('header'))&&/‹ Dessin/.test(await p.textContent('header')),'« 🖍 Avant / après » depuis le dessin rapide : l’écran avant / après, retour vers le dessin');
  chk(await visible('#planApres')&&!(await visible('#planAvant'))&&await visible('.ongletsAvantApres'),'sur iPhone : onglets ; « Après travaux » d’abord (on annote)');
  await p.tap('[data-vue-annot="avant"]');
  chk(await visible('#planAvant')&&!(await visible('#planApres')),'onglet « Avant » : le plan actuel seul');
  await p.tap('[data-vue-annot="apres"]');
  await p.waitForFunction(()=>{const c=document.querySelector('#toileAnnot');return c&&c.width>0});
  const bz=await p.locator('#toileAnnot').boundingBox();
  await p.mouse.move(bz.x+bz.width*.3,bz.y+bz.height*.4);await p.mouse.down();await p.mouse.move(bz.x+bz.width*.6,bz.y+bz.height*.5,{steps:6});await p.mouse.up();
  const a1=await attendreA(a=>a.elements&&a.elements.length===1);
  chk(a1&&a1.source==='dessin','le trait s’enregistre sur la copie « après » (fond : le dessin rapide)');
  await p.tap('#terminerAnnot');
  await p.waitForSelector('#ajouterPieceDessin');
  chk(true,'« ✓ Terminer » ramène au dessin rapide');
  /* depuis le plan coté */
  await p.tap('#creerPlanDessin');
  await p.waitForSelector('#cadrePlan');
  await (async()=>{for(let i=0;i<80;i++){const f=p.frames().find(x=>/moteur\/index\.html/.test(x.url()));if(f&&await f.evaluate(()=>!!(window.__releve&&window.__releve.donnees())).catch(()=>false))return f;await p.waitForTimeout(100)}})();
  await p.tap('#avantApresPlan');
  await p.waitForSelector('#duoAvantApres',{timeout:20000});
  const a2=await attendreA(a=>a.source==='plan');
  chk(a2&&a2.elements.length===1&&/‹ Plan/.test(await p.textContent('header')),'« 🖍 Avant / après » depuis le plan : l’image fraîche du plan devient le fond, le trait déjà fait est gardé');
  chk(await p.evaluate(()=>{const L=Object.values(window.__etat.lignes||{});return !!(L[0]&&L[0].donnees.valeurs.plan)}),'le plan a été enregistré avant de passer à l’avant / après');
  /* grand écran : côte à côte */
  await p.setViewportSize({width:1280,height:900});
  await p.waitForTimeout(300);
  chk(await visible('#planAvant')&&await visible('#planApres')&&!(await visible('.ongletsAvantApres')),'sur grand écran : avant et après côte à côte, sans onglets');
  const ga=await p.locator('#planAvant').boundingBox(), dr=await p.locator('#planApres').boundingBox();
  chk(ga.x+ga.width<=dr.x+2,'le plan actuel à gauche, la copie annotée à droite');
  await p.screenshot({path:SORTIE+'/releve_avant_apres.png'});
  await p.tap('#terminerAnnot');
  await p.waitForSelector('#cadrePlan');
  chk(true,'« ✓ Terminer » ramène au plan coté');
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
