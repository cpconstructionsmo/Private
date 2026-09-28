/* Vérification dans Chromium : rechargement au même endroit, bandeau de
   gauche escamotable à la souris, simulateur DPE retiré. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=require('path').resolve(__dirname,'..'), NM=__dirname+'/node_modules';
const DATA={chantiers:[{id:'c1',nom:'Maison Leroux',statut:'chantier',map:{}}],marches:[],
  prospects:[{id:'p1',nom:'Maison Moualid',client:'Moualid',commune:'Valframbert',statut:'demande',postes:[],produits:[]}],
  artisans:[{id:'a1',nom:'SARL Plomberie Élan',corps:'Plomberie',tel:'02 33 00 00 00'}],
  commandes:[{id:'k1',chantierId:'c1',designation:'Menuiseries alu — 8 ouvrants',fournisseur:'Emaplast',statut:'a_commander',factures:[]}]};
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

  const ctx=await b.newContext({viewport:{width:1440,height:900}});await route(ctx);
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  chk(await p.locator('.barre-recherche').isVisible(),'barre de recherche en haut de l’écran');
  /* Ctrl K, prospect */
  await p.keyboard.press('Control+k');
  const champ=p.locator('.recherche-boite input');
  chk(await champ.isVisible()&&await champ.evaluate(e=>e===document.activeElement),'Ctrl K ouvre la recherche, curseur dans le champ');
  await champ.type('moua');await p.waitForTimeout(150);
  chk(/PROSPECTS/.test(await p.textContent('.recherche-res'))&&/Maison Moualid/.test(await p.textContent('.recherche-res')),'résultat groupé : Prospects › Maison Moualid');
  await p.screenshot({path:require('os').tmpdir()+'/cp-tests/recherche.png'});
  await p.keyboard.press('Enter');await p.waitForTimeout(300);
  chk(!(await p.locator('.recherche-boite').count())&&/← Prospects/.test(await p.textContent('main'))&&/Maison Moualid/.test(await p.textContent('main')),'Entrée : fiche du prospect ouverte');
  /* barre, commande -> onglet MATÉRIAUX */
  await p.click('.barre-recherche');await p.locator('.recherche-boite input').type('menuiseries alu');await p.waitForTimeout(150);
  await p.click('.recherche-ligne >> text=Menuiseries alu');await p.waitForTimeout(400);
  chk(/Maison Leroux/.test(await p.textContent('main'))&&(await p.textContent('button.tab.on')).trim()==='MATÉRIAUX','commande : chantier ouvert sur l’onglet MATÉRIAUX');
  /* même chantier, autre onglet */
  await p.keyboard.press('Control+k');await p.locator('.recherche-boite input').type('leroux');await p.waitForTimeout(150);
  await p.keyboard.press('Enter');await p.waitForTimeout(300);
  chk(/Maison Leroux/.test(await p.textContent('main')),'chantier : ouvert');
  /* artisan : sa fiche s'ouvre */
  await p.keyboard.press('Control+k');await p.locator('.recherche-boite input').type('elan');await p.waitForTimeout(150);
  await p.keyboard.press('Enter');await p.waitForTimeout(300);
  chk(await p.locator('input[value="SARL Plomberie Élan"]').count()===1,'artisan (sans accent tapé) : sa fiche est ouverte');
  /* Échap, clic à côté */
  await p.keyboard.press('Control+k');await p.keyboard.press('Escape');await p.waitForTimeout(100);
  chk(!(await p.locator('.recherche-boite').count()),'Échap ferme');
  await p.click('.barre-recherche');await p.mouse.click(20,880);await p.waitForTimeout(100);
  chk(!(await p.locator('.recherche-boite').count()),'un clic à côté ferme');
  /* « / » ne se déclenche pas dans un champ */
  await p.mouse.move(4,450);await p.waitForTimeout(300);await p.click('nav.bot >> text=CHANTIERS');await p.waitForTimeout(200);
  await p.click('text=Maison Leroux');await p.waitForSelector('.notes-dossier');
  await p.locator('.notes-dossier textarea').type('a/b');
  chk(!(await p.locator('.recherche-boite').count())&&(await p.locator('.notes-dossier textarea').inputValue())==='a/b','« / » tapé dans un champ reste du texte');
  chk(!erreurs.length,'aucune erreur JavaScript '+erreurs.join(' | '));
  await ctx.close();
  /* téléphone */
  const tel=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await route(tel);
  const m=await tel.newPage();await m.goto('http://app.local/index.html');await m.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  await m.click('.barre-recherche');await m.locator('.recherche-boite input').type('moualid');await m.waitForTimeout(150);
  const bb=await m.locator('.recherche-boite').boundingBox();
  chk(bb.x>=0&&bb.x+bb.width<=390,'téléphone : la recherche tient dans l’écran');
  await m.screenshot({path:require('os').tmpdir()+'/cp-tests/recherche_tel.png'});
  await m.click('.recherche-ligne >> text=Maison Moualid');await m.waitForTimeout(300);
  chk(/Maison Moualid/.test(await m.textContent('main')),'téléphone : le résultat ouvre la fiche');
  await tel.close();await b.close();
  console.log(ko?'\n'+ko+' echec(s)':'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
