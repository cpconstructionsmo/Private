/* Relevé de visite, Phase 2 mode A — la fourchette de prix pendant la
   visite, dans Chromium au format iPhone, faux Supabase, scan FICTIF et prix
   FICTIFS saisis par le test (la table livrée n'en contient aucun) :
   - sans prix : les postes sont signalés « prix à saisir », rien d'inventé ;
   - la table des fourchettes se remplit et s'enregistre pour l'équipe ;
   - postes proposés d'après les travaux, quantités tirées du plan, gamme,
     pièces choisies, ajustements, voyant face à l'enveloppe du client ;
   - l'estimation part avec la visite ; hors ligne, la table sert encore. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const {fauxSupabase}=require('./releve_faux_supabase');
const {scan}=require('./releve_scan_fictif');
const R=path.resolve(__dirname,'..'), SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const PHOTO=path.join(__dirname,'fixtures','portrait.jpg');
const BIBLIO=`window.__etat=window.__etat||{};${fauxSupabase.toString()};window.supabase={createClient:()=>fauxSupabase(window.__etat)};`;
const attendre=async(p,f,ms=10000)=>{const t=Date.now();while(Date.now()-t<ms){if(await p.evaluate(f))return true;await p.waitForTimeout(100)}return false};
const plat=s=>s.replace(/\s+/g,' ');

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
  const p=await ctx.newPage();p.setDefaultTimeout(15000);
  const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('dialog',d=>d.accept());
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('#suivant');await p.tap('#suivant');
  await p.tap('.grille >> text=Peinture');await p.tap('.grille >> text=Cuisine');
  await p.fill('input[name="projet.enveloppe"]','15000');
  await p.tap('#suivant');await p.tap('#suivant');
  /* le plan, pour les quantités */
  const [c2]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#importerScan')]);
  await c2.setFiles({name:'Plan',mimeType:'',buffer:Buffer.from(JSON.stringify(scan([])))});
  await p.waitForSelector('#cadrePlan');
  await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});return L[0]&&L[0].donnees.valeurs.plan});
  await p.tap('#fermerPlan');await p.waitForSelector('#resumePlan');
  await p.tap('#suivant');
  await p.waitForSelector('#totalBudget');
  chk((await p.textContent('.etapeNom')).includes('Étape 6 sur 7 · Budget'),'étape Budget, après le plan');

  /* postes proposés, sans prix encore */
  chk((await p.textContent('#ajouterSuggeres')).includes('(4)'),'quatre postes proposés d’après les travaux (cuisine, mobilier de cuisine, peinture des murs et des plafonds)');
  await p.tap('#ajouterSuggeres');
  await p.waitForSelector('[data-ligne]');
  chk(await p.locator('[data-ligne]').count()===4,'les quatre postes sont ajoutés');
  chk(plat(await p.textContent('#totalBudget')).includes('4 postes sans prix'),'sans prix saisis : signalé, aucun montant inventé');
  chk(plat(await p.textContent('[data-ligne]:first-child, .carte[data-ligne]')).includes('Prix à saisir'),'chaque poste dit « prix à saisir »');

  /* la table des fourchettes : prix fictifs */
  await p.tap('#ouvrirFourchettes');
  await p.waitForSelector('[data-fourchette="peinture-murs"]');
  chk(await p.locator('[data-fourchette]').count()>=15,'la table livrée liste les postes courants');
  await p.fill('input[name="prix-peinture-murs-standard-min"]','20');await p.fill('input[name="prix-peinture-murs-standard-max"]','30');
  await p.fill('input[name="prix-peinture-plafonds-standard-min"]','15');await p.fill('input[name="prix-peinture-plafonds-standard-max"]','25');
  await p.fill('input[name="prix-cuisine-standard-min"]','8000');await p.fill('input[name="prix-cuisine-standard-max"]','12000');
  await p.fill('input[name="prix-cuisine-premium-min"]','14000');await p.fill('input[name="prix-cuisine-premium-max"]','20000');
  await p.screenshot({path:SORTIE+'/releve_fourchettes.png'});
  await p.tap('#enregistrerFourchettes');
  await p.waitForSelector('#totalBudget');
  chk(await p.isVisible('text=Fourchettes de prix enregistrées pour toute l’équipe'),'table enregistrée pour toute l’équipe');
  const reg=await p.evaluate(()=>window.__etat.reglages&&window.__etat.reglages.fourchettes);
  chk(reg&&reg.donnees.lignes.find(l=>l.id==='cuisine').prix.standard.max===12000,'les prix sont sur le serveur (releve_reglages)');

  /* le calcul */
  const total=plat(await p.textContent('#totalBudget'));
  chk(/de \d[\d ]* à \d[\d ]* € TTC/.test(total)&&/1 poste sans prix/.test(total),'la fourchette s’affiche ('+(total.match(/de [\d ]+ à [\d ]+ € TTC/)||[''])[0]+'), le mobilier de cuisine reste signalé sans prix');
  const lignes=await p.evaluate(()=>Object.values(window.__etat.lignes)[0]);
  const qMurs=await p.locator('[data-ligne]').filter({hasText:'Peinture des murs'}).locator('input[name^="quantite-"]').inputValue();
  chk(qMurs!=='','quantité des murs reprise du plan : '+qMurs+' m²');
  chk(plat(await p.textContent('#verdictBudget')).includes('Enveloppe du client : 15 000 €'),'enveloppe du client rappelée');
  const verdict1=plat(await p.textContent('#verdictBudget'));
  /* gamme premium pour la cuisine : la fourchette monte */
  const carteCuisine=p.locator('[data-ligne]').filter({hasText:'rénovation complète (hors mobilier)'});
  await carteCuisine.locator('text=Premium').tap();
  await p.waitForFunction(()=>/Hors budget|À la limite/.test(document.getElementById('verdictBudget').textContent));
  chk(/Dans le budget/.test(verdict1)&&/Hors budget|À la limite/.test(plat(await p.textContent('#verdictBudget'))),'cuisine en premium : le voyant passe de « dans le budget » à « hors / à la limite »');
  /* ajustements */
  await p.tap('text=Dégradé +20 %');
  await p.waitForSelector('text=Ajustements compris : +20 %');
  chk(true,'ajustement « dégradé » : +20 % affiché');
  /* pièces choisies */
  const carteMurs=p.locator('[data-ligne]').filter({hasText:'Peinture des murs'});
  chk(await carteMurs.locator('text=Toute la maison').count()===1,'quantité : toute la maison, ou les pièces choisies');

  /* l'estimation part avec la visite */
  chk(await attendre(p,()=>{const v=Object.values(window.__etat.lignes)[0].donnees.valeurs.budget;return v&&v.estimation&&v.estimation.max>0&&v.lignes.length===4&&v.ajust.etat===0.2}),
    'l’estimation, les postes et les ajustements partent avec la visite');
  await p.screenshot({path:SORTIE+'/releve_budget.png'});

  /* hors ligne : la table sert encore (rechargement compris) */
  await p.reload();await p.waitForSelector('.visite');
  await ctx.setOffline(true);
  await p.click('.visite');
  await p.waitForSelector('#totalBudget');
  chk(/de \d[\d ]* à \d[\d ]* € TTC/.test(plat(await p.textContent('#totalBudget'))),'hors ligne, après rechargement : la fourchette se calcule encore');
  await ctx.setOffline(false);

  /* récapitulatif */
  await p.tap('#suivant');
  chk(/Budget estimé.*de [\d ]+ à [\d ]+ € TTC \(indicatif\)/.test(plat(await p.textContent('.recap'))),'récapitulatif : budget estimé (indicatif)');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,500):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
