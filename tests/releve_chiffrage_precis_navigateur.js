/* Relevé de visite — le chiffrage précis (étape Budget › « Chiffrage précis »),
   dans Chromium au format iPhone, faux Supabase, scan et catalogue FICTIFS :
   - sans la ligne « chiffrage » de la table, le bloc ne s'affiche pas ;
   - avec elle : surfaces lues dans le plan, gabarit proposé, génération,
     lots et lignes, bilan avec marge interne ;
   - une quantité ou un prix retapés se gardent et changent le bilan ;
   - « Recalculer » ne touche ni aux retouches ni aux ajouts ;
   - l'estimation du dossier client ne bouge pas et ne porte jamais la marge ;
   - hors ligne, le catalogue copié sur l'appareil sert encore. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const {fauxSupabase}=require('./releve_faux_supabase');
const {scan}=require('./releve_scan_fictif');
const R=path.resolve(__dirname,'..'), SORTIE=require('os').tmpdir()+'/cp-tests';
const CATALOGUE=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','chiffrage_fictif.json'),'utf8'));
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const PHOTO=path.join(__dirname,'fixtures','portrait.jpg');
const BIBLIO=`window.__etat=window.__etat||{};${fauxSupabase.toString()};window.supabase={createClient:()=>fauxSupabase(window.__etat)};`;
const attendre=async(p,f,ms=10000)=>{const t=Date.now();while(Date.now()-t<ms){if(await p.evaluate(f))return true;await p.waitForTimeout(100)}return false};
const plat=s=>s.replace(/\s+/g,' ');
const nb=t=>parseFloat(t.replace(/[^\d,.-]/g,'').replace(',','.'));

let b;
(async()=>{
  b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  async function ouvrir(avecCatalogue){
    const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
    if(avecCatalogue)await ctx.addInitScript(c=>{window.__etat=window.__etat||{};window.__etat.reglages={chiffrage:{id:'chiffrage',donnees:c,version:1}}},CATALOGUE);
    await ctx.route('**/*',async r=>{const u=r.request().url();
      if(/supabase-js/.test(u))return r.fulfill({body:BIBLIO,contentType:'text/javascript'});
      const m=u.match(/^https:\/\/app\.local\/([^?#]*)/);
      if(m){let f=path.join(R,decodeURIComponent(m[1]));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
        if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f,contentType:/\.js$/.test(f)?'text/javascript':/\.html$/.test(f)?'text/html':undefined});
        return r.fulfill({status:404,body:''})}
      return r.fulfill({status:204,body:''});});
    const p=await ctx.newPage();p.setDefaultTimeout(15000);
    p.erreurs=[];p.on('pageerror',e=>p.erreurs.push(String(e)));p.on('dialog',d=>d.accept());
    await p.goto('https://app.local/releve/');
    await p.waitForSelector('#nouvelleVisite');
    const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
    await p.waitForSelector('img.garde[src^="blob:"]');
    await p.tap('#suivant');await p.tap('#suivant');
    await p.tap('.grille >> text=Peinture');
    await p.tap('#suivant');await p.tap('#suivant');
    const [c2]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#importerScan')]);
    await c2.setFiles({name:'Plan',mimeType:'',buffer:Buffer.from(JSON.stringify(scan([])))});
    await p.waitForSelector('#cadrePlan');
    await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});return L[0]&&L[0].donnees.valeurs.plan});
    await p.tap('#fermerPlan');await p.waitForSelector('#resumePlan');
    await p.tap('#suivant');await p.waitForSelector('#totalBudget');
    return {ctx,p};
  }

  /* 1. sans catalogue installé : rien ne change */
  {const {ctx,p}=await ouvrir(false);
   await p.waitForTimeout(500);
   chk(await p.locator('#chiffragePrecis').count()===0,'sans la ligne « chiffrage » de la table, le bloc n’apparaît pas');
   chk(p.erreurs.length===0,'aucune erreur de page sans catalogue : '+p.erreurs.join(' | '));
   await ctx.close();}

  /* 2. avec le catalogue */
  const {ctx,p}=await ouvrir(true);
  await p.waitForSelector('#chiffragePrecis');
  chk(true,'avec le catalogue, le bloc « Chiffrage précis » s’affiche sous « Approfondir »');
  await p.tap('#chiffragePrecis > summary');
  chk(/interne/i.test(await p.textContent('#chiffragePrecis summary')),'il est marqué « interne »');
  const S0=nb(await p.inputValue('input[name="chiffrage-S"]')), Sg0=nb(await p.inputValue('input[name="chiffrage-Sg"]'));
  chk(S0>15&&S0<16.5&&Sg0===0,'surface habitable lue dans le plan (≈ 15,9 m², pas de garage) : '+S0);
  chk(/lues dans le plan/.test(await p.textContent('#chiffragePrecis')),'la source des surfaces est dite');
  chk(await p.inputValue('#gabaritChiffrage')==='ga','gabarit proposé : le plus proche, sans garage');
  chk(/plus de 25 %/.test(await p.textContent('#chiffragePrecis')),'écart de taille avec le gabarit signalé (16 m² contre 100 m²)');
  chk(await p.locator('#bilanChiffrage').count()===0,'rien n’est chiffré avant « Générer »');
  chk(await p.locator('#questionsChiffrage select').count()===2&&await p.inputValue('select[name="question-fond"]')==='ref','les questions d’affinage sont posées avant de générer (2 questions, « comme la référence »)');

  /* surface corrigée à la main, puis génération */
  await p.fill('input[name="chiffrage-S"]','100');await p.dispatchEvent('input[name="chiffrage-S"]','change');
  await p.waitForFunction(()=>document.querySelector('input[name="chiffrage-S"]').value==='100');
  await p.waitForSelector('#genererChiffrage:not([disabled])');
  chk(await p.inputValue('input[name="chiffrage-P"]')==='66,7','périmètre recalculé d’après la surface saisie (100 m² → 66,7 m)');
  await p.tap('#genererChiffrage');
  await p.waitForSelector('#bilanChiffrage');
  chk(await p.locator('details.lotChiffrage').count()===3,'trois lots : maçonnerie, plaquisterie, carrelage');
  const art=nb(await p.textContent('#artisanchiffrage'));
  // gabarit « ga » (périmètre 66 m) pour un projet de 100 m² (périmètre estimé 66,7 m) : agglos et semelles ×66,7/66, arrondis au centième,
  // prix majorés de 20 % (marge arrière) sur la maçonnerie ; plaquisterie et carrelage à l'échelle de S (100 → inchangés)
  const r2=x=>Math.round(x*100)/100, qA=r2(110*66.7/66), qS=r2(9*66.7/66);
  const attendu=r2(r2(qA*48)+r2(qS*360)+100*20+70*30+60*35+50);
  chk(Math.abs(art-attendu)<0.01,'prix artisan = '+attendu.toFixed(2)+' € (obtenu '+art+')');
  const vente=nb((await p.textContent('#ventechiffrage')).replace('TTC',''));
  chk(Math.abs(vente-Math.round(attendu*1.1*1.2*100)/100)<1,'prix de vente TTC = artisan × 1,10 × 1,20 (coefficient du catalogue) : '+vente);
  await p.screenshot({path:SORTIE+'/releve_chiffrage_precis.png',fullPage:true});

  /* enregistré dans la visite, sous budget.chiffrage */
  const gard=await attendre(p,()=>{const v=Object.values(window.__etat.lignes)[0].donnees.valeurs.budget;return v&&v.chiffrage&&v.chiffrage.lignes.length===6&&v.chiffrage.gabarit==='ga'});
  chk(gard,'le chiffrage est gardé avec la visite (budget.chiffrage : gabarit, surfaces, 6 lignes)');
  chk(await p.evaluate(()=>{const v=Object.values(window.__etat.lignes)[0].donnees.valeurs.budget;return !v.chiffrage.lignes.some(l=>'lib' in l||'libelle' in l||'pu' in l)}),'seuls le code et la quantité sont gardés (ni libellé ni prix du catalogue dans la visite)');

  /* une quantité retapée et un prix saisi */
  await p.locator('details.lotChiffrage[data-lot="135"] > summary').tap();
  const ligne=p.locator('details.lotChiffrage[data-lot="135"] [data-ligne]').first();
  const nom=await ligne.locator('input[name^="cq-"]').getAttribute('name');
  await p.fill(`input[name="${nom}"]`,'90');await p.dispatchEvent(`input[name="${nom}"]`,'change');
  await p.waitForFunction(()=>/retouchée/.test(document.getElementById('chiffragePrecis').textContent));
  chk(true,'quantité retapée : la ligne est marquée « retouchée »');
  const art2=nb(await p.textContent('#artisanchiffrage'));
  chk(art2!==art,'le bilan suit la quantité retapée : '+art+' → '+art2);

  /* marge arrière */
  const marge1=plat(await p.textContent('#margechiffrage'));
  await p.locator('#retroChiffrage').uncheck();
  await p.waitForFunction(a=>{const t=document.getElementById('artisanchiffrage').textContent;return t&&t!==a},await p.textContent('#artisanchiffrage'));
  const art3=nb(await p.textContent('#artisanchiffrage'));
  chk(art3<art2,'sans la majoration de 20 % sur la maçonnerie, le prix artisan baisse ('+art2+' → '+art3+')');
  await p.locator('#retroChiffrage').check();
  await attendre(p,()=>Object.values(window.__etat.lignes)[0].donnees.valeurs.budget.chiffrage.retro===true);
  await p.waitForFunction(a=>document.getElementById('artisanchiffrage').textContent!==a,await p.textContent('#artisanchiffrage')).catch(()=>{});
  await p.waitForTimeout(400);
  chk(nb(await p.textContent('#artisanchiffrage'))===art2,'majoration réactivée : on retrouve le prix artisan d’avant ('+art2+')');

  /* recalcul : la retouche reste, un article ajouté reste */
  await p.fill('#articleChiffrage','T_GARAGE');await p.fill('#articleQte','12');await p.tap('#ajouterArticle');
  await p.waitForFunction(()=>Object.values(window.__etat.lignes)[0].donnees.valeurs.budget.chiffrage.lignes.length===7);
  chk(true,'article du catalogue ajouté à la main (7 lignes)');
  await p.fill('input[name="chiffrage-S"]','120');await p.dispatchEvent('input[name="chiffrage-S"]','change');
  await p.waitForFunction(()=>Object.values(window.__etat.lignes)[0].donnees.valeurs.budget.chiffrage.pilotes.S===120);
  await p.tap('#recalculerChiffrage');
  await attendre(p,()=>{const l=Object.values(window.__etat.lignes)[0].donnees.valeurs.budget.chiffrage.lignes;const c=l.find(x=>x.code==='T_CARREAU');return c&&c.qte===72});
  const L=await p.evaluate(()=>Object.values(window.__etat.lignes)[0].donnees.valeurs.budget.chiffrage.lignes);
  chk(L.find(x=>x.code==='T_CARREAU').qte===72,'recalcul : une ligne non retouchée suit la nouvelle surface (60 → 72 m²)');
  chk(L.find(x=>x.code==='T_PLAF').qte===90,'recalcul : la quantité retapée (90) n’est pas écrasée');
  chk(L.find(x=>x.code==='T_GARAGE').qte===12&&L.length===7,'recalcul : l’article ajouté reste, aucune ligne dupliquée');

  /* les questions : changer une réponse remplace les lignes concernées */
  await p.selectOption('select[name="question-cloisons"]','special');
  await attendre(p,()=>{const l=Object.values(window.__etat.lignes)[0].donnees.valeurs.budget.chiffrage.lignes;return l.some(x=>x.code==='T_INCONNU')});
  let L2=await p.evaluate(()=>Object.values(window.__etat.lignes)[0].donnees.valeurs.budget.chiffrage);
  chk(L2.options.cloisons==='special'&&!L2.lignes.some(x=>x.code==='T_CLOISON')&&L2.lignes.find(x=>x.code==='T_INCONNU').qte===2,'réponse « équipement spécial » : la cloison part, l’article spécial arrive (2 unités)');
  chk(L2.lignes.find(x=>x.code==='T_PLAF').qte===90&&L2.lignes.find(x=>x.code==='T_GARAGE').qte===12,'la quantité retapée et l’article ajouté à la main sont gardés');
  await p.waitForSelector('#achiffrerChiffrage');
  chk(/1 ligne sans prix/.test(await p.textContent('#achiffrerChiffrage')),'la ligne sans prix au catalogue est signalée, comptée à 0 €');
  chk(/Précisions sur le projet · 1 réponse modifiée/.test(await p.textContent('#questionsChiffrage > summary')),'le titre compte les réponses modifiées');
  await p.evaluate(()=>document.querySelectorAll('details.lotChiffrage').forEach(d=>{d.open=true}));
  const ligneInc=p.locator('[data-ligne]',{hasText:'Équipement spécial'});
  const nomPu=await ligneInc.locator('input[name^="cp-"]').getAttribute('name');
  await p.fill(`input[name="${nomPu}"]`,'100');await p.dispatchEvent(`input[name="${nomPu}"]`,'change');
  await p.waitForFunction(()=>!document.getElementById('achiffrerChiffrage'));
  chk(true,'prix saisi sur la ligne : le signalement disparaît');
  await p.selectOption('select[name="question-cloisons"]','ref');
  await attendre(p,()=>{const l=Object.values(window.__etat.lignes)[0].donnees.valeurs.budget.chiffrage.lignes;return l.some(x=>x.code==='T_CLOISON')&&!l.some(x=>x.code==='T_INCONNU'&&x.pu==null)});
  L2=await p.evaluate(()=>Object.values(window.__etat.lignes)[0].donnees.valeurs.budget.chiffrage);
  chk(L2.lignes.some(x=>x.code==='T_CLOISON')&&L2.lignes.filter(x=>x.code==='T_CLOISON').length===1,'retour à « comme la référence » : la cloison revient, sans doublon');
  await p.selectOption('select[name="question-fond"]','radier');
  await attendre(p,()=>{const l=Object.values(window.__etat.lignes)[0].donnees.valeurs.budget.chiffrage.lignes;return l.some(x=>x.code==='T_RADIER')});
  L2=await p.evaluate(()=>Object.values(window.__etat.lignes)[0].donnees.valeurs.budget.chiffrage);
  chk(L2.lignes.find(x=>x.code==='T_RADIER').qte===120&&!L2.lignes.some(x=>x.code==='T_SEMELLE'),'réponse « radier » : le radier suit la surface (120 m²), les semelles partent');
  await p.screenshot({path:SORTIE+'/releve_chiffrage_questions.png',fullPage:true});

  /* l'estimation du client reste séparée de la marge */
  const bud=await p.evaluate(()=>Object.values(window.__etat.lignes)[0].donnees.valeurs.budget);
  chk(!JSON.stringify(bud.estimation||{}).includes('marge')&&!('chiffrage' in (bud.estimation||{})),'l’estimation du budget (celle du dossier client) ne porte ni chiffrage ni marge');
  await p.tap('#suivant');
  chk(true,'la visite se poursuit normalement après le chiffrage');

  /* hors ligne : le catalogue copié sur l'appareil sert encore */
  const copie=await p.evaluate(()=>{try{return JSON.parse(localStorage.getItem('cp-releve-chiffrage')).gabarits.length}catch(e){return -1}});
  chk(copie===2,'le catalogue est copié sur l’appareil (2 gabarits) pour servir sans réseau');

  chk(p.erreurs.length===0,'aucune erreur de page : '+p.erreurs.join(' | '));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error(e);try{await b.close()}catch(x){}process.exit(1)});
