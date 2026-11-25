/* « Décrire » et « Lire une note » (relevé de visite) — Chromium au format
   iPhone, faux Supabase, photo et réponses FICTIVES :
   - assistant de visite : « 📷 Lire une note manuscrite » recopie la note À LA
     SUITE de la dictée (jamais à sa place) ;
   - « 🔍 Décrire » sous une photo : légende posée si elle est vide, constats
     gardés sur la photo, ajoutés aux notes de la pièce d'un geste ;
   - une légende tapée n'est jamais remplacée sans le demander ;
   - fonction du serveur pas à jour : message clair ; rien dans le dossier client. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const {fauxSupabase}=require('./releve_faux_supabase');
const R=path.resolve(__dirname,'..'), SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const PHOTO=path.join(__dirname,'fixtures','portrait.jpg');
const BIBLIO=`window.__etat=window.__etat||{};${fauxSupabase.toString()};window.supabase={createClient:()=>fauxSupabase(window.__etat)};`;
const attendre=async(p,f,ms=10000)=>{const t=Date.now();while(Date.now()-t<ms){if(await p.evaluate(f))return true;await p.waitForTimeout(100)}return false};
const repondre=(p,corps,statut)=>p.evaluate(([c,s])=>{window.__etat.fonctions={imaginer:s?{statut:s,corps:c}:{corps:c}}},[corps,statut||0]);
const dernierAppel=p=>p.evaluate(()=>window.__etat.appels.filter(a=>a.nom==='imaginer').slice(-1)[0]);

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
  await p.tap('#suivant');

  /* assistant : une note manuscrite lue, ajoutée à la dictée */
  await p.tap('#ouvrirAssistant');
  await p.fill('textarea[name="assistant.texte"]','Madame Fictive, maison de 1975.');
  await repondre(p,{texte:'Cuisine 3,20 x 2,80\nprise à déplacer',restant:98});
  const [c2]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#lireNote')]);await c2.setFiles(PHOTO);
  await p.waitForFunction(()=>/Note recopiée/.test(document.querySelector('#infoAssistant').textContent));
  const a1=await dernierAppel(p);
  chk(a1.body.action==='decrire'&&a1.body.mode==='note'&&a1.body.image.length>1000,'« Lire une note » : la photo part à la fonction (action décrire, mode note)');
  chk(await p.inputValue('textarea[name="assistant.texte"]')==='Madame Fictive, maison de 1975.\n\nCuisine 3,20 x 2,80\nprise à déplacer','la note est recopiée À LA SUITE de la dictée, rien n’est effacé');
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});return L[0]&&/prise à déplacer/.test(JSON.stringify(L[0].donnees))}),'la dictée complétée part avec la visite');
  await p.tap('text=‹ Visite');

  /* une pièce, une photo */
  await p.tap('#suivant');await p.tap('#suivant');
  await p.tap('text=+ Cuisine');
  const [c3]=await Promise.all([p.waitForEvent('filechooser'),p.tap('[data-piece] >> text=🖼 Galerie')]);await c3.setFiles(PHOTO);
  await p.waitForSelector('.photoLegende img[src^="blob:"]');
  /* raccourcis de l'étape Pièces : une note lue d'ici va dans l'assistant ; « Plan ou esquisse » mène à l'étape Scan et lit le plan */
  await repondre(p,{texte:'Salle de bains 2,10 x 1,80',restant:97});
  const [cR]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#raccourciNote')]);await cR.setFiles(PHOTO);
  await p.waitForFunction(()=>/Note recopiée dans l’assistant/.test(document.querySelector('#raccourcisIA [role=status]').textContent));
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});return L[0]&&/Cuisine 3,20 x 2,80[\s\S]*Salle de bains 2,10 x 1,80/.test(L[0].donnees.valeurs['assistant.texte']||JSON.stringify(L[0].donnees))}),'« 📷 Lire une note » depuis l’étape Pièces : la note s’ajoute à la dictée de l’assistant');
  await repondre(p,{parties:[{nom:'Esquisse',pieces:[{nom:'Bureau',longueur:3,largeur:3,x:0,y:0}]}]});
  const [cP]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#raccourciPlan')]);await cP.setFiles(PHOTO);
  await p.waitForFunction(()=>/1 pièce lue/.test(document.querySelector('main').textContent)&&document.querySelector('#ajouterPieceDessin'),null,{timeout:20000});
  chk(true,'« 🖼 Plan ou esquisse » depuis l’étape Pièces : l’esquisse est lue et le dessin rapide s’ouvre');
  await p.tap('text=‹ Visite');await p.tap('.progres button[aria-label^="Étape 4 "]');
  await p.waitForSelector('.photoLegende img[src^="blob:"]');

  /* serveur pas encore redéployé : l'ancienne fonction réclame une consigne */
  await repondre(p,{erreur:'consigne_absente'},400);
  await p.tap('button.decrire');
  await p.waitForFunction(()=>/pas à jour/.test(document.querySelector('.infoDecrire').textContent));
  chk(true,'fonction du serveur pas à jour : « redéployez-la », rien n’est cassé');

  /* décrire : légende vide → remplie, constats proposés */
  await repondre(p,{legende:'Tableau électrique ancien',constats:['Fusibles porcelaine','Pas de différentiel 30 mA'],restant:97});
  await p.tap('button.decrire');
  await p.waitForSelector('.descriptionIA');
  const a2=await dernierAppel(p);
  chk(a2.body.action==='decrire'&&a2.body.mode==='photo'&&a2.body.piece==='Cuisine'&&a2.body.image.length>1000,'« Décrire » : la photo et le nom de la pièce partent à la fonction');
  chk(await p.inputValue('.photoLegende textarea')==='Tableau électrique ancien','légende vide : elle est remplie par ce qui est vu');
  chk(/Fusibles porcelaine/.test(await p.textContent('.descriptionIA'))&&/différentiel/.test(await p.textContent('.descriptionIA')),'les constats s’affichent sous la photo');
  await p.screenshot({path:SORTIE+'/releve_decrire.png',fullPage:true});
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const ph=L[0]&&Object.values(L[0].donnees.photos).find(x=>x.role==='piece');
    return ph&&ph.description&&ph.description.constats.length===2}),'la description est gardée sur la photo, et part avec la visite');
  await p.tap('.descriptionIA >> text=+ Ajouter aux notes');
  await p.waitForFunction(()=>!document.querySelector('.descriptionIA'));
  chk(await p.inputValue('textarea[aria-label^="Notes sur la pièce"]')==='• Fusibles porcelaine\n• Pas de différentiel 30 mA','« + Ajouter aux notes » : les constats vont dans les notes');

  /* une légende tapée n'est pas remplacée sans le demander */
  await p.fill('.photoLegende textarea','Mon tableau');
  await repondre(p,{legende:'Coffret électrique',constats:[]});
  await p.tap('button.decrire');
  await p.waitForSelector('.descriptionIA');
  chk(await p.inputValue('.photoLegende textarea')==='Mon tableau'&&/Légende proposée : « Coffret électrique »/.test(await p.textContent('.descriptionIA')),'légende déjà tapée : gardée, la nouvelle n’est que proposée');
  await p.tap('.descriptionIA >> text=Utiliser');
  await p.waitForFunction(()=>document.querySelector('.photoLegende textarea').value==='Coffret électrique');
  chk(true,'« Utiliser » remplace la légende, à la demande');
  await p.tap('.descriptionIA button[aria-label^="Masquer"]');
  await p.waitForFunction(()=>!document.querySelector('.descriptionIA')&&document.querySelector('button.decrire'));
  chk(true,'✕ masque ce qui a été vu ; « Décrire » revient');

  /* limite du jour */
  await repondre(p,{erreur:'quota',limite:100},429);
  await p.tap('button.decrire');
  await p.waitForFunction(()=>/Limite du jour atteinte \(100/.test(document.querySelector('.infoDecrire').textContent));
  chk(await p.isEnabled('button.decrire'),'limite du jour : message clair, le bouton reste utilisable');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
