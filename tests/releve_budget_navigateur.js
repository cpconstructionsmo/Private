/* Relevé de visite — le budget de premier rendez-vous (R1), dans Chromium au
   format iPhone, faux Supabase, scan FICTIF :
   - travaux proposés d'après l'étape Projet, estimés d'un toucher ;
   - surface reprise du plan (surface habitable) ou valeur courante, réglée
     par − / + et ramenée au plan ; gamme éco / standard / haut de gamme ;
   - voyant face à l'enveloppe ; tuiles pour ajouter des travaux ;
   - « Approfondir » : ajustements et poste par poste, toujours là ;
   - « Prix au m² » : les prix de CP enregistrés pour toute l'équipe ;
   - l'estimation part avec la visite ; hors ligne, elle se calcule encore. */
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

  /* travaux proposés, estimés d'un toucher */
  chk(/\(2\)/.test(await p.textContent('#estimerSuggeres')),'deux travaux proposés d’après l’étape Projet (cuisine, peinture)');
  chk(await p.locator('.tuile.propose').count()===2,'les tuiles proposées sont marquées');
  await p.tap('#estimerSuggeres');
  await p.waitForSelector('[data-ouvrage-choisi="cuisine"]');
  const cuisine=p.locator('[data-ouvrage-choisi="cuisine"]'), peinture=p.locator('[data-ouvrage-choisi="peinture"]');
  chk(await p.locator('.carte.ouvrage').count()===2,'une carte par travaux, sans rien saisir');
  await p.waitForFunction(()=>/de [\d\s ]+ à [\d\s ]+ € TTC/.test(document.getElementById('montantBudget').textContent));
  const total0=plat(await p.textContent('#montantBudget'));
  chk(/de [\d  ]+ à [\d  ]+ € TTC/.test(total0),'la fourchette s’affiche aussitôt : '+total0);
  await p.waitForTimeout(700);   /* le total « roule » jusqu'à sa valeur */
  const nbr=t=>+t.replace(/[^\d]/g,'');
  const plages=await p.$$eval('.carte.ouvrage .plage',els=>els.map(e=>e.textContent));
  const somme=plages.reduce((t,x)=>{const m=x.match(/de (.+?) € à (.+?) €/);return {min:t.min+nbr(m[1]),max:t.max+nbr(m[2])}},{min:0,max:0});
  const fin0=plat(await p.textContent('#montantBudget')).match(/de (.+?) à (.+?) €/);
  chk(Math.abs(nbr(fin0[1])-somme.min)<=200&&Math.abs(nbr(fin0[2])-somme.max)<=200,'le total final est la somme des travaux ('+fin0[0]+')');
  chk(/D’après le plan : surface habitable/.test(plat(await peinture.textContent())),'peinture : surface habitable reprise du plan');
  chk(await cuisine.locator('input').inputValue()==='10'&&/Valeur courante/.test(await cuisine.textContent()),'cuisine absente du plan : valeur courante (10 m²), à régler');
  chk(/Dans le budget/.test(await p.textContent('#verdictBudget')),'15 000 € d’enveloppe : dans le budget');
  await p.screenshot({path:SORTIE+'/releve_budget.png',fullPage:true});

  /* − / + et gamme */
  await cuisine.locator('button[aria-label="Plus"]').tap();
  await p.waitForFunction(()=>document.querySelector('[data-ouvrage-choisi="cuisine"] input').value==='11');
  chk(/Réglé à la main/.test(await p.locator('[data-ouvrage-choisi="cuisine"]').textContent()),'« + » : 11 m², réglé à la main');
  await p.locator('[data-ouvrage-choisi="cuisine"] >> text=Haut de gamme').tap();
  await p.waitForFunction(()=>/À la limite|Hors budget/.test(document.getElementById('verdictBudget').textContent));
  chk(true,'cuisine haut de gamme : le voyant passe « à la limite » ou « hors budget »');
  await p.tap('[data-ouvrage="pac"]');
  await p.waitForSelector('[data-ouvrage-choisi="pac"]');
  await p.waitForFunction(()=>/Hors budget/.test(document.getElementById('verdictBudget').textContent));
  chk(/Prix posé, au forfait/.test(await p.textContent('[data-ouvrage-choisi="pac"]')),'tuile « pompe à chaleur » : ajoutée au forfait, hors budget');
  await p.locator('[data-ouvrage-choisi="cuisine"] >> text=revenir à').tap();
  await p.waitForFunction(()=>document.querySelector('[data-ouvrage-choisi="cuisine"] input').value==='10');
  chk(true,'« ↺ revenir » : la valeur automatique revient');

  /* approfondir : ajustements et poste par poste */
  await p.tap('summary:has-text("Approfondir")');
  await p.tap('text=Dégradé +20 %');
  await p.waitForSelector('text=ajustements compris : +20 %');
  chk(true,'« Approfondir » : ajustement « dégradé » +20 % appliqué au total');
  await p.selectOption('#ajouterPoste','peinture-murs');
  await p.waitForSelector('[data-ligne]');
  chk(/1 poste sans prix/.test(plat(await p.textContent('#totalBudget'))),'un poste détaillé sans prix est signalé, sans montant inventé');

  /* prix au m² de CP */
  await p.tap('#ouvrirPrixOuvrages');
  await p.waitForSelector('[data-prix-ouvrage="cuisine"]');
  chk(await p.locator('[data-prix-ouvrage]').count()>=15&&/Repère marché/.test(await p.textContent('[data-prix-ouvrage="cuisine"]')),'les prix de départ sont listés, marqués « repère marché »');
  /* vos prix appris des chantiers du suivi (prospects de rénovation fictifs, lus seulement) */
  await p.evaluate(()=>{window.__etat.appData={prospects:[
    {id:'a',nom:'Réno A (fictif)',categorie:'renovation',surfaceHabitable:100,tva:10,postes:[{libelle:'PEINTURE',montant:5000},{libelle:'ÉLECTRICITÉ',montant:8000}]},
    {id:'b',nom:'Réno B (fictif)',categorie:'renovation',surfaceHabitable:80,tva:10,postes:[{libelle:'Peinture',montant:6400}]},
    {id:'n',nom:'Neuf (fictif)',categorie:'neuf',surfaceHabitable:120,postes:[{libelle:'Peinture',montant:12000}]}]}});
  await p.tap('#calculerRatios');
  await p.waitForSelector('#ratiosCP [data-ratio="peinture"]');
  chk(/2 projets · 60 \/ 70 \/ 90 €\/m²/.test(plat(await p.textContent('#ratiosCP [data-ratio="peinture"]'))),'peinture apprise de 2 projets de rénovation (le neuf écarté) : 60 / 70 / 90 €/m²');
  await p.locator('#ratiosCP [data-ratio="peinture"] >> text=Reprendre').tap();
  chk(await p.inputValue('input[name="ouv-peinture-med"]')==='70'&&/Prix CP/.test(await p.textContent('[data-prix-ouvrage="peinture"]')),'« Reprendre » : le prix appris passe dans le brouillon, marqué « Prix CP »');
  chk(!(await p.evaluate(()=>!!window.__etat.ecritureAppData)),'les données du suivi sont seulement lues');
  await p.fill('input[name="ouv-cuisine-min"]','600');await p.fill('input[name="ouv-cuisine-med"]','1000');await p.fill('input[name="ouv-cuisine-max"]','1600');
  await p.tap('#enregistrerOuvrages');
  await p.waitForSelector('#totalBudget');
  chk(await p.isVisible('text=Prix au m² enregistrés pour toute l’équipe'),'prix enregistrés pour toute l’équipe');
  const reg=await p.evaluate(()=>window.__etat.reglages&&window.__etat.reglages.ouvrages);
  chk(reg&&reg.donnees.lignes.length===2&&reg.donnees.lignes.find(l=>l.id==='cuisine').prix.med===1000&&reg.donnees.lignes.find(l=>l.id==='peinture').prix.med===70,'seuls les prix retouchés ou repris partent sur le serveur (releve_reglages, « ouvrages »)');
  const plageCuisine=plat(await p.textContent('[data-ouvrage-choisi="cuisine"] .plage'));
  chk(plageCuisine==='de 10 000 € à 16 000 €','la cuisine suit le prix de CP : 10 m² × 1 000 à 1 600 € ('+plageCuisine+')');

  /* l'estimation part avec la visite */
  chk(await attendre(p,()=>{const v=Object.values(window.__etat.lignes)[0].donnees.valeurs.budget;return v&&v.estimation&&v.estimation.max>0&&v.ouvrages.length===3&&v.ajust.etat===0.2&&v.lignes.length===1}),
    'l’estimation, les travaux, les ajustements et le poste détaillé partent avec la visite');

  /* hors ligne : tout se calcule encore (rechargement compris) */
  await p.reload();await p.waitForSelector('.visite');
  await ctx.setOffline(true);
  await p.click('.visite');
  await p.waitForSelector('#totalBudget');
  chk(/de [\d  ]+ à [\d  ]+ € TTC/.test(plat(await p.textContent('#montantBudget')))&&plat(await p.textContent('[data-ouvrage-choisi="cuisine"] .plage'))==='de 10 000 € à 16 000 €','hors ligne, après rechargement : la fourchette et les prix de CP servent encore');
  await ctx.setOffline(false);

  /* récapitulatif */
  await p.tap('#suivant');
  chk(/Budget estimé.*de [\d  ]+ à [\d  ]+ € TTC \(indicatif\)/.test(plat(await p.textContent('.recap'))),'récapitulatif : budget estimé (indicatif)');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,500):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
