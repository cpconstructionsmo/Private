/* « Imaginer » (relevé de visite, étape Pièces et photos) — Chromium au
   format iPhone, faux Supabase, photo et image FICTIVES :
   - sans la fonction du serveur : le bouton dit qu'Imaginer n'est pas installé ;
   - « ✨ Imaginer » sous une photo : consigne (reprise des souhaits possible),
     photo et consigne envoyées, l'image revient sous la photo, marquée ;
   - elle part avec la visite (espace privé), liée à sa photo d'origine ;
   - sans réseau : la demande attend sur la photo (annulable) et part
     toute seule au retour du réseau ;
   - limite du jour atteinte : message clair, la consigne reste ;
   - supprimer la photo supprime aussi ses images imaginées. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const {fauxSupabase}=require('./releve_faux_supabase');
const R=path.resolve(__dirname,'..'), SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const PHOTO=path.join(__dirname,'fixtures','portrait.jpg');
const IMAGE=fs.readFileSync(PHOTO).toString('base64');          /* l'« image imaginée » renvoyée par le faux serveur */
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
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();p.setDefaultTimeout(15000);const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('dialog',d=>d.accept());
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('#suivant');await p.tap('#suivant');
  await p.fill('textarea[name="projet.souhaits"]','Cuisine blanche, plan de travail bois.');
  await p.tap('#suivant');
  await p.tap('text=+ Cuisine');
  const [c2]=await Promise.all([p.waitForEvent('filechooser'),p.tap('[data-piece] >> text=🖼 Galerie')]);await c2.setFiles(PHOTO);
  await p.waitForSelector('.photoLegende img[src^="blob:"]');

  /* fonction pas encore déployée */
  await p.tap('button.imaginer');
  await p.waitForSelector('.panneauImaginer');
  await p.tap('text=Reprendre les souhaits du client');
  chk(await p.inputValue('.panneauImaginer textarea')==='Cuisine blanche, plan de travail bois.','« Reprendre les souhaits du client » remplit la consigne');
  await p.tap('.panneauImaginer >> text=✨ Créer l’image');
  await p.waitForFunction(()=>/pas encore installé/.test(document.querySelector('.panneauImaginer [role=status]').textContent));
  chk(true,'fonction absente : « Imaginer n’est pas encore installé », rien n’est cassé');

  /* fonction déployée mais secret absent : l'écran nomme le réglage qui manque */
  await p.evaluate(()=>{window.__etat.fonctions={imaginer:{statut:500,corps:{erreur:'non_configure',manque:['GEMINI_API_KEY']}}}});
  await p.tap('.panneauImaginer >> text=✨ Créer l’image');
  await p.waitForFunction(()=>/secrets Supabase : GEMINI_API_KEY/.test(document.querySelector('.panneauImaginer [role=status]').textContent));
  chk(true,'secret absent : le message nomme GEMINI_API_KEY');

  /* la fonction répond */
  await p.evaluate(img=>{window.__etat.fonctions={imaginer:{corps:{image:img,mime:'image/jpeg',modele:'modele-fictif',restant:29}}}},IMAGE);
  await p.fill('.panneauImaginer textarea','Cuisine ouverte');
  await p.tap('[data-style="Scandinave"]');
  chk(/^Cuisine ouverte, style scandinave, bois clair/.test(await p.inputValue('.panneauImaginer textarea')),'un style en un toucher : sa description s’ajoute à la consigne, qui reste modifiable');
  await p.fill('.panneauImaginer textarea','Murs blancs, parquet chêne clair');
  await p.tap('.panneauImaginer >> text=✨ Créer l’image');
  await p.waitForSelector('.imagine img[src^="blob:"]');
  const appel=await p.evaluate(()=>window.__etat.appels.at(-1));
  chk(appel.nom==='imaginer'&&appel.body.consigne==='Murs blancs, parquet chêne clair'&&appel.body.piece==='Cuisine'&&appel.body.image.length>1000&&!/^data:/.test(appel.body.image),'photo (base64) et consigne envoyées à la fonction « imaginer », avec le nom de la pièce');
  chk(await p.isVisible('.badgeImagine')&&/Murs blancs, parquet chêne clair/.test(await p.textContent('.imagine')),'l’image apparaît sous la photo, marquée « ✨ Imaginé », avec sa consigne');
  chk(await p.locator('.panneauImaginer').count()===0&&/encore 29 aujourd’hui/.test(await p.textContent('main')),'le panneau se ferme ; il reste 29 images aujourd’hui');
  chk((await p.textContent('main')).includes('1 pièce · 1 photo'),'le compteur ne compte que les vraies photos');
  /* retoucher l'image imaginée : seule la modification change, la nouvelle image reste sous la même photo */
  await p.evaluate(img=>{window.__etat.fonctions={imaginer:{corps:{image:img,mime:'image/jpeg',modele:'modele-fictif',restant:28}}}},IMAGE);
  await p.tap('[data-retoucher]');
  chk(/Retoucher l’image imaginée/.test(await p.textContent('.panneauImaginer'))&&await p.locator('.panneauImaginer [data-style]').count()===0,'« ✏️ Retoucher » : panneau de retouche (sans styles : seule la modification est décrite)');
  await p.fill('.panneauImaginer textarea','Carrelage plus foncé');
  await p.tap('.panneauImaginer button.gros:not(.sec)');
  await p.waitForFunction(()=>document.querySelectorAll('.imagine img[src^="blob:"]').length===2);
  const ret=await p.evaluate(()=>window.__etat.appels.at(-1));
  chk(ret.body.mode==='retouche'&&ret.body.consigne==='Carrelage plus foncé','la retouche part de l’image imaginée (mode « retouche ») avec la seule modification');
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const v=L[0]&&L[0].donnees;return !!v&&Object.values(v.photos).some(x=>x.role==='imagine'&&x.depuis&&x.source&&v.photos[x.depuis]&&v.photos[x.depuis].role==='imagine')}),'la retouche est rangée sous la photo d’origine, avec l’image dont elle part');
  chk((await p.textContent('main')).includes('1 pièce · 1 photo'),'les images imaginées et retouchées ne comptent pas comme photos');
  await p.screenshot({path:SORTIE+'/releve_imaginer.png',fullPage:true});

  /* elle part avec la visite, liée à sa photo */
  const ok=await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const ph=L[0]&&Object.values(L[0].donnees.photos);
    return ph&&ph.some(x=>x.role==='imagine'&&x.chemin&&ph.some(y=>y.id===x.source&&y.role==='piece'))});
  chk(ok,'l’image imaginée part sur le serveur (espace privé), liée à sa photo d’origine');

  /* sans réseau : la demande attend sur la photo, puis part toute seule */
  const nbAppels=await p.evaluate(()=>window.__etat.appels.length);
  await ctx.setOffline(true);
  await p.tap('button.imaginer');await p.fill('.panneauImaginer textarea','Version annulée');
  await p.tap('.panneauImaginer >> text=✨ Créer l’image');
  await p.waitForSelector('.enAttenteImaginer');
  chk(/Version annulée/.test(await p.textContent('.enAttenteImaginer'))&&/Pas de réseau/.test(await p.textContent('main')),'sans réseau : « ⏳ Imaginer en attente du réseau » sous la photo, rien n’est perdu');
  await p.tap('.enAttenteImaginer >> text=✕ annuler');
  await p.waitForFunction(()=>!document.querySelector('.enAttenteImaginer'));
  await p.tap('button.imaginer');await p.fill('.panneauImaginer textarea','Version scandinave');
  await p.tap('.panneauImaginer >> text=✨ Créer l’image');
  await p.waitForSelector('.enAttenteImaginer');
  chk(await p.evaluate(n=>window.__etat.appels.length===n,nbAppels),'sans réseau, aucun appel n’est tenté ; une demande peut être annulée');
  await p.evaluate(img=>{window.__etat.fonctions={imaginer:{corps:{image:img,mime:'image/jpeg',modele:'modele-fictif',restant:28}}}},IMAGE);
  await ctx.setOffline(false);
  // 3 images : la première, sa retouche, puis celle créée au retour du réseau
  await p.waitForFunction(()=>document.querySelectorAll('.imagine img[src^="blob:"]').length===3&&!document.querySelector('.enAttenteImaginer'),null,{timeout:15000});
  const app2=await p.evaluate(()=>window.__etat.appels.filter(a=>a.nom==='imaginer').slice(-1)[0]);
  chk(app2.body.consigne==='Version scandinave'&&/au retour du réseau/.test(await p.textContent('main')),'au retour du réseau, l’image est créée toute seule (une seule fois, la demande annulée n’est pas partie)');
  chk(await p.evaluate(()=>window.__etat.appels.filter(a=>a.nom==='imaginer'&&a.body.consigne==='Version scandinave').length)===1,'un seul appel pour la demande en attente');

  /* limite du jour */
  await p.evaluate(()=>{window.__etat.fonctions={imaginer:{statut:429,corps:{erreur:'quota',limite:30}}}});
  await p.tap('button.imaginer');await p.fill('.panneauImaginer textarea','Version sombre');
  await p.tap('.panneauImaginer >> text=✨ Créer l’image');
  await p.waitForFunction(()=>/Limite du jour atteinte \(30/.test(document.querySelector('.panneauImaginer [role=status]').textContent));
  chk(await p.inputValue('.panneauImaginer textarea')==='Version sombre','limite du jour : message clair, la consigne reste');

  /* supprimer la photo supprime ses images imaginées */
  await p.tap('.photoLegende .x');
  await p.waitForFunction(()=>!document.querySelector('.imagine')&&!document.querySelector('.photoLegende'));
  chk(true,'photo supprimée avec son image imaginée');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
