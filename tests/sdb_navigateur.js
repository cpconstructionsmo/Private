/* Vérification dans Chromium : l'outil salle de bains, ouvert depuis la MAP,
   sur un téléphone — créer la pièce, une fenêtre, la faïence, la 3D.
   (Réglages repris du test des rubriques de la MAP.)
   Ancien en-tête : Replier ne
   perd rien ; la recherche ouvre la rubrique et place le curseur ; le
   clavier suffit ; les panneaux ouverts sont retrouvés au rechargement ; la
   validation est distincte du renseigné ; rien ne déborde sur un téléphone. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules', SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const DATA={chantiers:[{id:'c1',nom:'Maison Leroux',statut:'chantier',client:'M. Leroux',map:{soubassement:'Vide sanitaire'}}],artisans:[],marches:[],prospects:[]};
const FAUX_SUPA=`window.supabase={createClient:()=>{const q={select:()=>q,eq:()=>q,single:()=>Promise.resolve({data:{data:${JSON.stringify(DATA)}},error:null}),
 upsert:()=>Promise.resolve({error:null})};return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}}}};`;
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:390,height:844}});
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
  await p.locator('text=CHANTIERS').first().click().catch(()=>{});await p.waitForTimeout(300);
  await p.click('text=Maison Leroux');await p.click('button.tab:has-text("MAP")');
  await p.waitForSelector('[data-rubrique="7"]');
  await p.click('[data-rubrique="7"] .map-entete');
  await p.click('[data-rubrique="7"] button:has-text("Ouvrir l’outil")');
  await p.click('button:has-text("+ Salle de bains")');
  await p.waitForSelector('text=Plan coté');
  chk(true,'outil ouvert depuis la rubrique 7, pièce créée');
  await p.click('button:has-text("+ Fenêtre")');
  await p.click('button:has-text("Faïence")');
  await p.click('button:has-text("Toute hauteur, 4 murs")');
  await p.click('button:has-text("Quantités")');
  const tq=await p.textContent('main');
  chk(/Pose \(facturée\)/.test(tq)&&/Mur A/.test(tq)&&/Fenêtre 60 × 75/.test(tq),'quantités : mur A, fenêtre déduite, pose facturée');
  await p.click('button:text-is("3D")');
  await p.waitForTimeout(200);
  const n3d=await p.locator('main svg path').count();
  chk(n3d>=4&&/Volumes simplifiés/.test(await p.textContent('main')),'vue 3D dessinée ('+n3d+' faces)');
  await p.click('button:has-text("Élévation A")');
  chk(await p.locator('svg line').count()>10,'élévation A avec le calepinage');
  chk(!(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)),'téléphone : pas de débordement horizontal');
  await p.screenshot({path:SORTIE+'/sdb_ecran.png',fullPage:false});
  await p.click('button:has-text("Fermer")');
  chk(/Salle de bains : plan, élévations, 3D, calepinage/.test(await p.textContent('main'))&&/1 pièce décrite/.test(await p.textContent('main')),'retour à la MAP : la pièce est résumée');
  chk(!erreurs.length,'aucune erreur JavaScript'+(erreurs.length?' — '+erreurs.join(' | '):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
