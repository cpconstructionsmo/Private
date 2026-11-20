/* Plan 2D lu par l'IA (relevé de visite, étape Scan) — Chromium au format
   iPhone, faux Supabase, plan et réponses FICTIFS :
   - « 🖼 Plan 2D » : l'image part à la fonction (décrire, mode plan), elle
     est gardée avec la visite ; deux parties lues : on choisit laquelle ;
   - le dessin rapide se remplit (pièces posées l'une contre l'autre), le
     plan d'origine reste visible ; « Créer le plan » ouvre le moteur ;
   - une image glissée sur le plan est passée à la visite et lue ;
   - un dessin existant n'est remplacé qu'après accord ;
   - fonction du serveur pas à jour : message clair. */
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
  const dialogues=[];p.removeAllListeners('dialog');p.on('dialog',d=>{dialogues.push(d.message());d.accept()});
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('.progres button[aria-label^="Étape 5 "]');

  /* serveur pas encore redéployé : l'ancienne fonction répond comme pour une photo */
  await repondre({legende:'Plan',constats:[]});
  const [c0]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#importerPlan2D')]);await c0.setFiles(PHOTO);
  await p.waitForFunction(()=>/pas à jour/.test((document.querySelector('#infoPlan2D')||{}).textContent||''));
  chk(true,'fonction du serveur pas à jour : « redéployez-la », rien n’est cassé');

  /* deux parties lues : on choisit */
  await repondre({parties:[
    {nom:'RDC état actuel',pieces:[{nom:'Cuisine',longueur:4.6,largeur:3.65,x:0,y:0},{nom:'Salon',longueur:4.3,largeur:5.49,x:4.8,y:0},{nom:'Dépendance',longueur:4.8,largeur:5.5,x:9.6,y:0}]},
    {nom:'RDC projet',pieces:[{nom:'Séjour',longueur:9.3,largeur:5.5,x:0,y:0}]}],restant:95});
  const [c2]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#importerPlan2D')]);await c2.setFiles(PHOTO);
  await p.waitForSelector('#partiesPlan');
  const appel=await p.evaluate(()=>window.__etat.appels.filter(a=>a.nom==='imaginer').slice(-1)[0]);
  chk(appel.body.action==='decrire'&&appel.body.mode==='plan'&&appel.body.mime==='image/jpeg'&&appel.body.image.length>1000,'« Plan 2D » : l’image part à la fonction (décrire, mode plan)');
  chk(/RDC état actuel — 3 pièces, 67 m²/.test(await p.textContent('#partiesPlan'))&&/RDC projet — 1 pièce/.test(await p.textContent('#partiesPlan')),'deux plans sur l’image : on choisit lequel dessiner (pièces et surface annoncées)');
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});return L[0]&&Object.values(L[0].donnees.photos).some(x=>x.role==='planPapier'&&x.chemin)}),'l’image du plan est gardée avec la visite (espace privé)');
  await p.tap('[data-partie="RDC état actuel"]');
  await p.waitForSelector('#ajouterPieceDessin');
  chk(await p.locator('[data-dessin]').count()===3&&/3 pièces lues sur le plan/.test(await p.textContent('main')),'le dessin rapide se remplit des 3 pièces lues, avec l’invitation à vérifier');
  chk(/3 pièces · 66,75 m²/.test(await p.textContent('main')),'surface du dessin : 66,75 m² (la dépendance alignée sur le salon : 5,50 → 5,49)');
  await p.tap('#planOrigine summary');
  await p.waitForSelector('#planOrigine img.imagePlanOrigine[src^="blob:"]');
  chk(true,'le plan d’origine reste visible sous le dessin, pour comparer');
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const d=L[0]&&L[0].donnees.valeurs.dessin;return !!(d&&d.pieces.length===3&&d.source&&d.source.partie==='RDC état actuel')}),'le dessin (et la partie lue) part avec la visite');
  await p.screenshot({path:SORTIE+'/releve_plan2d.png',fullPage:true});

  /* le plan, puis une image glissée dessus */
  await p.tap('#creerPlanDessin');
  await p.waitForSelector('#cadrePlan');
  const frame=await (async()=>{for(let i=0;i<80;i++){const f=p.frames().find(x=>/moteur\/index\.html/.test(x.url()));if(f&&await f.evaluate(()=>!!(window.__releve&&window.__releve.donnees())).catch(()=>false))return f;await p.waitForTimeout(100)}return null})();
  chk(!!frame&&await frame.evaluate(()=>window.__releve.donnees().pieces.length)===3,'« Créer le plan » : le moteur ouvre les 3 pièces');
  await repondre({parties:[{nom:'Plan',pieces:[{nom:'Garage',longueur:6,largeur:3,x:0,y:0}]}]});
  const nbAvant=dialogues.length;
  await frame.evaluate(b64=>{const bin=atob(b64),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
    const dt=new DataTransfer();dt.items.add(new File([a],'plan-magicplan.jpg',{type:'image/jpeg'}));window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}))},fs.readFileSync(PHOTO).toString('base64'));
  await p.waitForFunction(()=>document.querySelectorAll('[data-dessin]').length===1&&/Garage/.test(document.querySelector('main').textContent),null,{timeout:20000});
  chk(true,'une image glissée sur le plan est passée à la visite, lue, et donne le dessin');
  chk(dialogues.slice(nbAvant).some(m=>/Un dessin rapide existe déjà \(3 pièces\)/.test(m)),'le dessin existant n’est remplacé qu’après accord');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
