/* Le dessin rapide complet (relevé de visite) — Chromium au format iPhone,
   faux Supabase : pièce glissée au doigt et aimantée au mur voisin, portes
   et fenêtres sur un côté, symboles (radiateur, trémie d'escalier), étage,
   toiture, zoom ; « Créer le plan » : le moteur reçoit étages, ouvertures,
   symboles et toiture, et les accepte. */
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
  const dessin=()=>p.evaluate(()=>{const L=Object.values(window.__etat.lignes||{});return L[0]&&L[0].donnees.valeurs.dessin});
  const attendreDessin=async f=>{for(let i=0;i<80;i++){const d=await dessin();if(d&&f(d))return d;await p.waitForTimeout(100)}return null};
  const ecran=(x,y)=>p.evaluate(([x,y])=>{const s=document.querySelector('svg.apercuDessin'),m=s.getScreenCTM(),q=s.createSVGPoint();q.x=x;q.y=y;const r=q.matrixTransform(m);return [r.x,r.y]},[x,y]);
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('.progres button[aria-label^="Étape 5 "]');
  await p.tap('#dessinRapide');
  await p.tap('#ajouterPieceDessin');
  await p.fill('input[name="dessin-longueur"]','5');await p.locator('input[name="dessin-longueur"]').press('Enter');
  await p.waitForFunction(()=>/5 × 3 m/.test(document.querySelector('[data-dessin]').textContent));
  await p.fill('input[name="dessin-largeur"]','4');await p.locator('input[name="dessin-largeur"]').press('Enter');
  await p.waitForFunction(()=>/5 × 4 m/.test(document.querySelector('[data-dessin]').textContent));
  /* une 2e pièce : posée à côté, puis glissée au doigt contre le séjour */
  await p.tap('#ajouterPieceDessin');
  let d=await attendreDessin(d=>d.pieces.length===2);
  chk(d.pieces[1].libre&&d.pieces[1].libre.x===5.5&&/Glissez « Pièce 2 » à sa place/.test(await p.textContent('main')),'« ＋ Ajouter une pièce » : posée à côté, invitation à la glisser');
  await p.evaluate(()=>window.scrollTo(0,0));await p.locator('svg.apercuDessin').scrollIntoViewIfNeeded();
  const [ax,ay]=await ecran(7,1.5), [bx,by]=await ecran(6.62,1.65);
  await p.mouse.move(ax,ay);await p.mouse.down();await p.mouse.move((ax+bx)/2,(ay+by)/2,{steps:3});await p.mouse.move(bx,by,{steps:3});await p.mouse.up();
  d=await attendreDessin(d=>d.pieces[1].libre&&d.pieces[1].libre.x!==5.5);
  chk(d&&d.pieces[1].libre.x===5&&d.pieces[1].libre.y===0,'glissée près du séjour : elle s’aimante contre son mur (x = 5) et s’aligne en haut (y = 0)');
  /* une fenêtre en haut du séjour, une porte à gauche de la pièce 2 (mur commun) */
  await p.tap('[data-dessin] >> nth=0');
  await p.tap('[data-ajout-ouverture="fenetre"]');
  await p.waitForSelector('[data-ouv]');
  await p.tap('[data-ouv] [data-cote="haut"]');
  await p.tap('[data-dessin] >> nth=1');
  await p.waitForSelector('[data-dessin]:nth-of-type(2).sel, .pieceDessin.sel');
  await p.locator('.pieceDessin.sel [data-ajout-ouverture="porte"]').tap();
  await p.locator('.pieceDessin.sel [data-ouv] [data-cote="gauche"]').tap();
  d=await attendreDessin(d=>d.ouvertures.length===2&&d.ouvertures[1].cote==='gauche');
  chk(d.ouvertures[0].type==='fenetre'&&d.ouvertures[0].cote==='haut'&&d.ouvertures[1].type==='porte','fenêtre en haut du séjour, porte à gauche de la pièce 2 ; elles se voient sur l’aperçu');
  chk(await p.locator('svg.apercuDessin [data-ouverture]').count()===2,'les ouvertures se dessinent sur l’aperçu');
  /* symboles */
  await p.tap('[data-dessin] >> nth=0');
  await p.tap('[data-ajout-symbole="radiateur"]');
  await p.waitForSelector('#tournerSymbole');
  await p.tap('#tournerSymbole');
  await p.tap('[data-ajout-symbole="escalier"]');
  await p.waitForSelector('input[name="symbole-l"]');
  await p.fill('input[name="symbole-l"]','3');await p.locator('input[name="symbole-l"]').press('Enter');
  d=await attendreDessin(d=>d.symboles.length===2&&d.symboles[1].l===3);
  chk(d.symboles[0].type==='radiateur'&&d.symboles[0].rot===90&&d.symboles[1].type==='escalier'&&d.symboles[1].w===0.9,'radiateur tourné d’un quart, trémie d’escalier de 3 × 0,90 m');
  chk(await p.locator('svg.apercuDessin [data-symbole]').count()===2,'les symboles se dessinent sur l’aperçu');
  /* un étage */
  await p.tap('#ajouterEtage');
  await p.waitForFunction(()=>document.querySelector('[data-etage="1"]')&&document.querySelector('[data-etage="1"]').classList.contains('on'));
  await p.tap('#ajouterPieceDessin');
  d=await attendreDessin(d=>d.pieces.length===3);
  chk(d.pieces[2].etage===1&&d.etages[1]==='Étage 1'&&await p.locator('[data-dessin]').count()===1,'« ＋ Étage » : la nouvelle pièce est à l’étage ; seules ses pièces se listent');
  /* toiture et zoom */
  await p.tap('[data-toiture="2pentes"]');
  d=await attendreDessin(d=>d.toiture&&d.toiture.type==='2pentes');
  chk(d.toiture.angle===35,'toiture 2 pentes (35° par défaut)');
  await p.tap('#zoomDessinPlus');
  chk(await p.getAttribute('.cadreZoomDessin','data-zoom')==='1.50','« 🔍 ＋ » zoome l’aperçu');
  await p.screenshot({path:SORTIE+'/releve_dessin_complet.png',fullPage:true});
  /* le plan : le moteur reçoit tout et l'accepte */
  await p.tap('#creerPlanDessin');
  await p.waitForSelector('#cadrePlan');
  const frame=await (async()=>{for(let i=0;i<80;i++){const f=p.frames().find(x=>/moteur\/index\.html/.test(x.url()));if(f&&await f.evaluate(()=>!!(window.__releve&&window.__releve.donnees())).catch(()=>false))return f;await p.waitForTimeout(100)}return null})();
  chk(!!frame,'« Créer le plan » ouvre le moteur sans erreur');
  const M=frame&&await frame.evaluate(()=>{const m=window.__releve.analyser(window.__releve.donnees());return {etages:m.etages.length,ouv:m.openings.length,sym:m.symboles.length,toits:m.toits.length,types:m.openings.map(o=>o.type).join()}});
  chk(M&&M.etages===2&&M.ouv===2&&M.sym===2&&M.toits===1&&M.types==='fenetre,porte','le moteur : 2 étages, 2 ouvertures (fenêtre, porte), 2 symboles, 1 toiture');
  if(frame){await frame.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Rez-de-chaussée|RDC/.test(x.textContent));if(b)b.click()}).catch(()=>{});await p.waitForTimeout(800);await frame.evaluate(()=>document.getElementById('plan').scrollIntoView());await p.waitForTimeout(500);await frame.locator('#plan').screenshot({timeout:30000,path:SORTIE+'/releve_moteur_symboles.png'});}
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
