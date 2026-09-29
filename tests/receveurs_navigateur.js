/* Vérification dans Chromium : ajouter une gamme de receveurs depuis le
   catalogue de référence, retrouver ses variantes dans la fiche produit,
   puis choisir une variante dans la MAP d'un chantier. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules', SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const DATA={chantiers:[{id:'c1',nom:'Maison Leroux',statut:'chantier',client:'M. Leroux',map:{}}],artisans:[],marches:[],prospects:[],produits:[]};
const FAUX_SUPA=`window.supabase={createClient:()=>{const q={select:()=>q,eq:()=>q,single:()=>Promise.resolve({data:{data:${JSON.stringify(DATA)}},error:null}),
 upsert:()=>Promise.resolve({error:null})};return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}}}};`;
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:1280,height:900}});
  await ctx.route('**/*',r=>{const u=r.request().url();
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:FAUX_SUPA,contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^http:\/\/app\.local\/(.*?)(\?.*)?$/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('dialog',d=>d.accept());
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:60000});
  await p.mouse.move(4,450);await p.waitForTimeout(300);
  await p.locator('nav.bot >> text=PRODUITS').first().click();
  await p.click('text=Catalogue de référence : receveurs');
  await p.locator('.card',{hasText:'Acquabella Compact — finition Granite'}).locator('button:has-text("Ajouter")').first().click();
  await p.waitForSelector('text=102 variantes ajoutées');
  chk(true,'la gamme Granite est ajoutée (102 variantes)');
  await p.locator('button:has-text("Receveur Acquabella Compact — finition Granite")').first().click();
  await p.fill('input[placeholder^="Filtrer"]','140 × 80 cm · h 28 mm · gris');
  const lignes=await p.locator('button:has-text("140 × 80 cm")').count();
  chk(lignes===1,'fiche produit : le filtre isole la variante 140 × 80 gris');
  const t=await p.textContent('main');
  chk(/Akron/.test(t)&&/Recoupe : Non documenté/.test(t),'fiche produit : caractéristiques documentées et recoupe non documentée');
  await p.screenshot({path:SORTIE+'/receveurs_produit.png'});
  chk(!erreurs.length,'aucune erreur JavaScript'+(erreurs.length?' — '+erreurs.join(' | '):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
