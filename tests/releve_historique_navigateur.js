/* Relevé de visite — le bouton « retour » du navigateur et du téléphone
   ramène à l'écran d'avant (dossier → visite → accueil, plan → visite) au
   lieu de quitter le relevé ; les boutons « ‹ » de l'écran gardent
   l'historique juste. Chromium au format iPhone, faux Supabase, visite
   FICTIVE, scan fictif. */
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
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('#suivant');await p.fill('input[name="client.nom"]','FICTIF');
  chk(await p.isVisible('#resumeDepart'),'la fiche client commence par « 🎙 Commencer par un résumé »');
  await p.fill('input[name="client.codePostal"]','61000');
  await p.waitForFunction(()=>document.querySelector('input[name="client.ville"]').value==='Alençon');
  chk(true,'code postal 61000 tapé : la commune (Alençon) se remplit toute seule');
  await p.fill('input[name="client.ville"]','');await p.fill('input[name="client.codePostal"]','53100');
  await p.waitForSelector('#communesProposees >> text=Moulay');
  await p.tap('#communesProposees >> text=Moulay');
  await p.waitForFunction(()=>document.querySelector('input[name="client.ville"]').value==='Moulay');
  chk(await p.locator('#communesProposees button').count()===0,'plusieurs communes : on choisit d’un toucher (Moulay), la liste disparaît');
  await p.tap('#resumeDepart');await p.waitForSelector('textarea[name="assistant.texte"]');
  chk(true,'« Commencer par un résumé » ouvre l’assistant (écrit ou dicté)');
  await p.goBack();await p.waitForSelector('#resumeDepart');
  await p.tap('.progres button[aria-label^="Étape 7 "]');
  await p.tap('#ouvrirDossier');await p.waitForSelector('.dossier .feuille');

  /* retour du navigateur : dossier → visite → accueil */
  await p.goBack();
  await p.waitForSelector('#ouvrirDossier');
  chk((await p.textContent('.etapeNom')).includes('Étape 7 sur 7'),'« retour » depuis le dossier : la visite, à l’étape où on était');
  await p.goBack();
  await p.waitForSelector('#nouvelleVisite');
  chk(await p.locator('[data-visite]').count()===1&&/app\.local\/releve\//.test(p.url()),'« retour » depuis la visite : l’accueil, sans quitter le relevé');
  await p.goForward();
  await p.waitForSelector('.etapeNom');
  chk(true,'« suivant » du navigateur : la visite revient');

  /* les boutons de l'écran gardent l'historique juste */
  await p.tap('#ouvrirDossier');await p.waitForSelector('.dossier .feuille');
  await p.tap('header .lienRetour');                    // « ‹ Visite » de l'écran
  await p.waitForSelector('#ouvrirDossier');
  await p.waitForTimeout(300);
  await p.goBack();
  await p.waitForSelector('#nouvelleVisite');
  chk(true,'« ‹ Visite » puis « retour » du navigateur : l’accueil (pas le dossier une seconde fois)');

  /* l'assistant et le plan : « retour » ferme l'écran ; le plan s'enregistre d'abord */
  await p.locator('[data-visite]').first().click();await p.waitForSelector('#ouvrirAssistant');
  await p.tap('#ouvrirAssistant');await p.waitForSelector('textarea[name="assistant.texte"]');
  await p.goBack();await p.waitForSelector('#ouvrirAssistant');
  chk(true,'« retour » depuis l’assistant : la visite');
  await p.tap('.progres button[aria-label^="Étape 5 "]');
  const [c2]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#importerScan')]);
  await c2.setFiles({name:'Plan',mimeType:'',buffer:Buffer.from(JSON.stringify(scan([])))});
  await p.waitForSelector('#cadrePlan');
  await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});return L[0]&&L[0].donnees.valeurs.plan});
  await p.goBack();
  await p.waitForSelector('#resumePlan');
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const d=L[0]&&L[0].donnees;return !!(d&&d.valeurs.planImage)}),'« retour » depuis le plan : la visite, et le plan s’est enregistré avant de se fermer (image comprise)');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
