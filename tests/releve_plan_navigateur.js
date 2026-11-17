/* Relevé de visite, étape 2 — le plan, dans Chromium au format iPhone, faux
   Supabase, scan FICTIF (releve_scan_fictif.js) :
   - le scan importé (sans extension) s'ouvre aussitôt dans le moteur de relevé ;
   - la porte vue deux fois au coin est signalée et rien n'est retiré sans accord ;
   - le choix et les retouches sont enregistrés dans la visite, puis sur le serveur ;
   - export PDF sans la plateforme Claude (téléchargement ici, partage sur iPhone) ;
   - fermer puis rouvrir : le plan revient tel qu'il a été laissé, sans redemander. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const {fauxSupabase}=require('./releve_faux_supabase');
const {scan,portesAuCoin}=require('./releve_scan_fictif');
const R=path.resolve(__dirname,'..'), SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const PHOTO=path.join(__dirname,'fixtures','portrait.jpg');
const BIBLIO=`window.__etat=window.__etat||{};${fauxSupabase.toString()};window.supabase={createClient:()=>fauxSupabase(window.__etat)};`;
const attendre=async(p,f,ms=10000)=>{const t=Date.now();while(Date.now()-t<ms){if(await p.evaluate(f))return true;await p.waitForTimeout(100)}return false};

let b;
(async()=>{
  b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true,acceptDownloads:true});
  await ctx.route('**/*',async r=>{const u=r.request().url();
    if(/supabase-js/.test(u))return r.fulfill({body:BIBLIO,contentType:'text/javascript'});
    const m=u.match(/^https:\/\/app\.local\/([^?#]*)/);
    if(m){let f=path.join(R,decodeURIComponent(m[1]));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
      if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f,contentType:/\.js$/.test(f)?'text/javascript':/\.html$/.test(f)?'text/html':undefined});
      return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();p.setDefaultTimeout(15000);
  const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('console',m=>{if(m.type()==='error'&&!/Service Worker/.test(m.text()))erreurs.push('console : '+m.text())});
  p.on('dialog',d=>d.accept());
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  for(let i=0;i<4;i++)await p.tap('#suivant');
  chk((await p.textContent('.etapeNom')).includes('Scan'),'étape 5 : le scan');

  /* import du scan, sans extension : le plan s'ouvre aussitôt */
  const [c2]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#importerScan')]);
  await c2.setFiles({name:'Plan maison',mimeType:'',buffer:Buffer.from(JSON.stringify(scan(portesAuCoin())))});
  await p.waitForSelector('#cadrePlan');
  const cadre=p.frameLocator('#cadrePlan');
  await cadre.locator('#modal:not([hidden])').waitFor();
  chk(true,'le scan importé s’ouvre directement dans le moteur de relevé');
  const texteModal=(await cadre.locator('#modal').textContent()).replace(/\s+/g,' ');
  chk(/Une porte vue deux fois/.test(texteModal)&&/0,73 m/.test(texteModal)&&/0,63 m/.test(texteModal),'la porte vue deux fois est signalée, avec ses deux largeurs (0,73 et 0,63 m)');
  chk(await cadre.locator('input[name=dbl][value="2"]').count()===1,'on peut répondre « ce sont bien deux portes »');
  const frame=p.frames().find(f=>/moteur\/index\.html/.test(f.url()));
  chk(await frame.evaluate(()=>window.__releve.donnees().ouvertures.length)===2,'avant la réponse, rien n’est retiré');
  await p.screenshot({path:SORTIE+'/releve_plan_doublon.png'});
  await cadre.locator('#modalOk').click();
  chk(await frame.evaluate(()=>window.__releve.donnees().ouvertures.length)===1,'« une seule porte » : la porte en double est retirée');
  chk(await frame.evaluate(()=>window.claude===undefined),'le moteur tourne sans la plateforme Claude');

  /* enregistré dans la visite, puis sur le serveur */
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const pl=L[0]&&L[0].donnees.valeurs.plan;return !!pl&&pl.releve.ouvertures.length===1&&pl.resume.pieces===1}),
    'le plan (1 pièce, 1 porte) est enregistré dans la visite et parti sur le serveur');
  const resume=await p.evaluate(()=>Object.values(window.__etat.lignes)[0].donnees.valeurs.plan.resume);
  chk(resume&&resume.surface>15&&resume.surface<16,'résumé du plan : surface cohérente ('+(resume&&resume.surface)+' m²)');

  /* une retouche dans le plan : hauteur mesurée */
  await cadre.locator('#hGlobal').fill('2,47');await cadre.locator('#btnHGlobal').click();
  chk(await attendre(p,()=>JSON.stringify(Object.values(window.__etat.lignes)[0].donnees.valeurs.plan.releve).includes('2.47')),'la hauteur mesurée (2,47 m) part dans la visite');

  /* export PDF sans la plateforme Claude */
  const [dl]=await Promise.all([p.waitForEvent('download',{timeout:15000}),cadre.locator('#btnPdf').click()]);
  const chemin=await dl.path();
  chk(/\.pdf$/.test(dl.suggestedFilename())&&fs.readFileSync(chemin).slice(0,5).toString()==='%PDF-','export PDF : un vrai fichier PDF ('+dl.suggestedFilename()+')');

  /* fermer puis rouvrir : rien n'est perdu, rien n'est redemandé */
  await p.tap('#fermerPlan');
  await p.waitForSelector('#resumePlan');
  chk((await p.textContent('#resumePlan')).includes('1 pièce'),'retour à la visite : le résumé du plan s’affiche');
  await p.tap('#ouvrirPlan');
  await p.waitForSelector('#cadrePlan');
  const frame2=await (async()=>{for(let i=0;i<50;i++){const f=p.frames().find(x=>/moteur\/index\.html/.test(x.url()));if(f&&await f.evaluate(()=>!!(window.__releve&&window.__releve.donnees()))) return f;await p.waitForTimeout(100)}return null})();
  chk(!!frame2,'le plan se rouvre');
  chk(frame2&&await frame2.evaluate(()=>window.__releve.donnees().ouvertures.length)===1,'le plan rouvert a gardé le choix (une seule porte)');
  chk(frame2&&JSON.stringify(await frame2.evaluate(()=>window.__releve.donnees())).includes('2.47'),'le plan rouvert a gardé la hauteur mesurée');
  chk(await p.frameLocator('#cadrePlan').locator('#modal').isHidden(),'la question de la porte n’est pas reposée');
  await p.screenshot({path:SORTIE+'/releve_plan.png'});

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,500):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
