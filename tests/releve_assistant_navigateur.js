/* Relevé de visite — l'assistant de visite, dans Chromium au format iPhone,
   faux Supabase, dictée et fiche FICTIVES :
   - sans réseau : la dictée est gardée, rien ne part ;
   - « Remplir la fiche » : dictée et listes envoyées à la fonction (action
     « structurer ») ; les propositions se relisent et se cochent ;
   - un champ déjà saisi n'est proposé qu'en remplacement, décoché ;
   - « Ranger dans la fiche » : seuls les éléments cochés entrent, la visite part. */
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
  await p.tap('#suivant');
  await p.fill('input[name="client.nom"]','DEJA');
  await p.tap('#ouvrirAssistant');
  await p.waitForSelector('textarea[name="assistant.texte"]');
  chk(await p.locator('.champMicro:has(textarea[name="assistant.texte"]) .micro').count()===1,'l’écran de l’assistant a sa dictée avec 🎤');
  await p.fill('textarea[name="assistant.texte"]','Monsieur et Madame Fictif, 06 11 11 11 11, 3 rue Imaginaire à Alençon. Maison de 1975 chauffage fioul. Ils veulent ouvrir la cuisine, budget 40 000 euros, sous 6 mois.');

  /* hors ligne : la dictée reste, rien ne part */
  await ctx.setOffline(true);
  await p.tap('#remplirFiche');
  await p.waitForFunction(()=>/dictée est gardée/.test(document.getElementById('infoAssistant').textContent));
  chk(!(await p.evaluate(()=>(window.__etat.appels||[]).length)),'sans réseau : rien n’est envoyé, la dictée est gardée');
  await ctx.setOffline(false);

  await p.evaluate(()=>{window.__etat.fonctions={imaginer:{corps:{modele:'fictif',fiche:{client:{civilite:'M. et Mme',nom:'Fictif',prenom:null,telephone:'06 11 11 11 11',email:null,adresse:'3 rue Imaginaire',codePostal:null,ville:'Alençon'},
    projet:{categories:['Rénovation partielle'],types:['Cuisine'],situation:'Maison de 1975, chauffage fioul.',souhaits:'Ouvrir la cuisine.',delai:'Sous 6 mois',enveloppe:40000},
    pieces:[{nom:'Cuisine',note:'À ouvrir sur le séjour.'}],notes:'interne'}}}}});
  await p.tap('#remplirFiche');
  await p.waitForSelector('.propositions');
  const appel=await p.evaluate(()=>window.__etat.appels.at(-1));
  chk(appel.body.action==='structurer'&&/Maison de 1975/.test(appel.body.texte)&&appel.body.listes.types.includes('Cuisine'),'dictée et listes du relevé envoyées à la fonction (action « structurer »)');
  const nom=p.locator('.proposition[data-cle="client.nom"]');
  chk(/remplace « DEJA »/.test(await nom.textContent())&&!(await nom.locator('input').isChecked()),'nom déjà saisi : proposé en remplacement, décoché');
  chk(await p.locator('.proposition[data-cle="client.ville"] input').isChecked()&&await p.locator('.proposition[data-cle="projet.enveloppe"] input').isChecked(),'champs vides : cochés d’office');
  chk(await p.locator('.proposition[data-piece-proposee="Cuisine"]').count()===1&&await p.locator('.proposition[data-cle="notes"]').count()===0,'la pièce citée est proposée ; rien d’inconnu (notes internes) n’apparaît');
  await p.locator('.proposition[data-cle="projet.delai"] input').uncheck();
  await p.screenshot({path:SORTIE+'/releve_assistant.png',fullPage:true});
  await p.tap('#appliquerAssistant');
  await p.waitForSelector('text=Fiche complétée par l’assistant');
  const ok=await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const v=L[0]&&L[0].donnees;return v&&v.valeurs['client.ville']==='Alençon'&&v.valeurs['projet.enveloppe']===40000});
  chk(ok,'rangé dans la fiche et parti sur le serveur (ville, enveloppe)');
  const d=await p.evaluate(()=>Object.values(window.__etat.lignes)[0].donnees);
  chk(d.valeurs['client.nom']==='DEJA'&&!d.valeurs['projet.delai']&&Object.values(d.pieces).some(x=>x.nom==='Cuisine'&&x.note==='À ouvrir sur le séjour.'),'seul le coché entre : le nom saisi reste, le délai décoché n’entre pas, la pièce est créée avec sa note');
  await p.tap('.progres button[aria-label="Étape 3 : Projet"]');
  chk(await p.inputValue('textarea[name="projet.souhaits"]')==='Ouvrir la cuisine.','l’étape Projet montre les souhaits rangés');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
