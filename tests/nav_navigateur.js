/* Vérification dans Chromium : rechargement au même endroit, bandeau de
   gauche escamotable à la souris, simulateur DPE retiré. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=require('path').resolve(__dirname,'..'), NM=__dirname+'/node_modules';
const DATA={chantiers:[{id:'c1',nom:'Maison Leroux',statut:'chantier',map:{}}],marches:[],
  prospects:[{id:'p1',nom:'Maison Moualid',client:'Moualid',commune:'Valframbert',statut:'demande',postes:[],produits:[]}]};
const FAUX_SUPA=`window.supabase={createClient:()=>{const q={select:()=>q,eq:()=>q,single:()=>Promise.resolve({data:{data:${JSON.stringify(DATA)}},error:null}),
 upsert:()=>Promise.resolve({error:null})};return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}}}};`;
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const route=async ctx=>ctx.route('**/*',r=>{const u=r.request().url();
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:FAUX_SUPA,contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^http:\/\/app\.local\/(.*?)(\?.*)?$/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  /* --- ordinateur, souris --- */
  const ctx=await b.newContext({viewport:{width:1440,height:900}});await route(ctx);
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  const txt=await p.textContent('body');
  chk(!/SIMULATEUR DPE/.test(txt)&&!/Besoin d’améliorer le DPE/.test(txt)&&!/Lancer une simulation/.test(txt),'plus de simulateur DPE (menu, bannière)');
  const navX=async()=>(await p.locator('nav.bot').boundingBox()).x;
  await p.mouse.move(700,450);await p.waitForTimeout(500);
  chk(await navX()<-200,'bandeau caché quand la souris est au milieu');
  await p.screenshot({path:require('os').tmpdir()+'/cp-tests/nav_cache.png'});
  await p.mouse.move(4,450);await p.waitForTimeout(400);
  chk(await navX()>=0,'bandeau sorti quand la souris touche le bord gauche');
  await p.screenshot({path:require('os').tmpdir()+'/cp-tests/nav_ouvert.png'});
  await p.mouse.move(120,300);await p.waitForTimeout(400);
  chk(await navX()>=0,'reste ouvert tant que la souris est dessus');
  await p.mouse.move(800,450);await p.waitForTimeout(600);
  chk(await navX()<-200,'se range quand la souris quitte le bandeau');
  await p.mouse.move(4,450);await p.waitForTimeout(400);
  await p.click('nav.bot >> text=PROSPECTS');await p.waitForTimeout(400);
  chk(await navX()<-200,'se range dès qu’on a choisi une rubrique');
  await p.click('text=Maison Moualid');await p.waitForSelector('text=← Prospects');
  await p.reload();await p.waitForSelector('text=← Prospects',{timeout:30000});
  chk(/Maison Moualid/.test(await p.textContent('main')),'rechargement : on reste sur la fiche du prospect Moualid');
  const bouton=p.locator('button',{hasText:/programme technique/i}).first();
  if(await bouton.count()){await bouton.click();await p.waitForTimeout(500);
    const avant=(await p.textContent('main')).slice(0,200);
    await p.reload();await p.waitForTimeout(2500);
    const apres=(await p.textContent('main')).slice(0,200);
    chk(!/← Prospects/.test(apres.slice(0,40))&&avant.slice(0,60)===apres.slice(0,60),'rechargement : le programme technique reste ouvert');}
  else chk(false,'bouton du programme technique introuvable');
  /* chantier, onglet MAP, défilement */
  await p.mouse.move(4,450);await p.waitForTimeout(300);await p.click('nav.bot >> text=CHANTIERS');
  await p.waitForTimeout(400);await p.click('text=Maison Leroux');await p.click('button.tab:has-text("MAP")');await p.waitForTimeout(300);
  await p.mouse.wheel(0,900);await p.waitForTimeout(400);const y0=await p.evaluate(()=>scrollY);
  await p.reload();await p.waitForSelector('button.tab.on',{timeout:30000});await p.waitForTimeout(900);
  chk((await p.textContent('button.tab.on')).trim()==='MAP'&&/Maison Leroux/.test(await p.textContent('main')),'rechargement : même chantier, onglet MAP');
  const y1=await p.evaluate(()=>scrollY);
  chk(y0>300&&Math.abs(y1-y0)<40,'rechargement : même position de défilement ('+y0+' → '+y1+')');
  /* un nouvel onglet repart de l'accueil */
  const p2=await ctx.newPage();await p2.goto('http://app.local/index.html');await p2.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  chk(true,'nouvel onglet : accueil');
  /* retour à la liste des prospects après un rechargement sur l'accueil */
  await p2.mouse.move(4,450);await p2.waitForTimeout(300);await p2.click('nav.bot >> text=PROSPECTS');await p2.waitForTimeout(300);
  chk(!(await p2.locator('text=← Prospects').count()),'aller aux prospects depuis l’accueil ouvre la liste, pas une fiche');
  chk(!erreurs.length,'aucune erreur JavaScript '+erreurs.join(' | '));
  await ctx.close();
  /* --- tablette tactile : pas de survol, bandeau toujours là --- */
  const tab=await b.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true});await route(tab);
  const t=await tab.newPage();await t.goto('http://app.local/index.html');await t.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  chk((await t.locator('nav.bot').boundingBox()).x>=0,'tablette : bandeau toujours affiché');
  await tab.close();
  /* --- téléphone : barre du bas inchangée --- */
  const tel=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await route(tel);
  const m=await tel.newPage();await m.goto('http://app.local/index.html');await m.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  const bb=await m.locator('nav.bot').boundingBox();
  chk(bb.x>=0&&bb.y>700,'téléphone : barre de navigation en bas');
  await m.click('nav.bot >> text=PLUS');await m.waitForTimeout(200);
  chk(!/DPE/.test(await m.textContent('nav.bot')),'téléphone : « PLUS » sans DPE');
  await m.screenshot({path:require('os').tmpdir()+'/cp-tests/nav_tel.png'});
  await tel.close();await b.close();
  console.log(ko?'\n'+ko+' echec(s)':'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
