/* Relevé de visite — l'aide à la vente du premier rendez-vous (reprise de
   l'ancienne « App rénovation »), dans Chromium au format iPhone, faux
   Supabase : pistes pour rentrer dans le budget, calendrier indicatif,
   mensualités (désactivées d'office), mémo du vendeur (masqué en mode
   présentation), message de suivi, calendrier du dossier client. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const {fauxSupabase}=require('./releve_faux_supabase');
const R=path.resolve(__dirname,'..'), SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const PHOTO=path.join(__dirname,'fixtures','portrait.jpg');
const BIBLIO=`window.__etat=window.__etat||{};${fauxSupabase.toString()};window.supabase={createClient:()=>fauxSupabase(window.__etat)};`;
const attendre=async(p,f,ms=10000)=>{const t=Date.now();while(Date.now()-t<ms){if(await p.evaluate(f))return true;await p.waitForTimeout(100)}return false};
const plat=s=>s.replace(/\s+/g,' ');
const nbr=t=>+String(t).replace(/[^\d]/g,'');
const SERV="(()=>{const L=Object.values(window.__etat.lignes||{})[0];return (L&&L.donnees.valeurs.budget)||{}})()";
const surServeur=(p,cond)=>attendre(p,'(()=>{const b='+SERV+';return !!('+cond+')})()');

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
  await p.tap('#suivant');
  await p.fill('input[name="client.nom"]','Test');await p.fill('input[name="client.email"]','madame.test@example.org');
  await p.locator('.puces >> text=Mme').first().tap();
  await p.tap('#suivant');
  await p.tap('.grille >> text=Cuisine');await p.tap('.grille >> text=Peinture');await p.tap('.grille >> text=Isolation');
  // l'appui sur une tuile redessine l'écran un instant plus tard : on laisse l'écran se stabiliser avant de saisir (un humain ne tape pas dans la milliseconde)
  await p.waitForFunction(()=>[...document.querySelectorAll('.grille .tuile.on, .grille [aria-pressed="true"]')].length>=3);
  await p.waitForTimeout(400);
  await p.fill('input[name="projet.souhaits"],textarea[name="projet.souhaits"]','Ouvrir le mur entre la cuisine et le séjour');
  await p.fill('input[name="projet.enveloppe"]','8000');
  await p.tap('#suivant');await p.tap('#suivant');await p.tap('#suivant');
  await p.waitForSelector('#totalBudget');
  await p.waitForFunction(()=>/8\s*000/.test((document.getElementById('verdictBudget')||{}).textContent||''));
  chk(/8\s*000/.test(plat(await p.textContent('#verdictBudget'))),'l’enveloppe saisie (8 000 €) est bien reprise à l’étape Budget');
  await p.tap('#estimerSuggeres');
  await p.waitForSelector('[data-ouvrage-choisi="cuisine"]');
  await p.waitForTimeout(700);

  /* 1. pour rentrer dans le budget */
  await p.waitForSelector('#pistesBudget');
  const pistes=await p.$$eval('#pistesBudget .piste',els=>els.map(e=>({type:e.dataset.piste,texte:e.textContent})));
  chk(pistes.length>=1&&pistes.length<=3,'budget dépassé : de 1 à 3 pistes ('+pistes.length+')');
  chk(pistes.every(x=>/− [\d ]+ €/.test(x.texte)),'chaque piste dit ce qu’elle économise');
  const avant=nbr((plat(await p.textContent('#montantBudget')).match(/à (.+?) €/)||[])[1]);
  const choisie=p.locator('#pistesBudget .piste').first();
  const typeChoisi=await choisie.getAttribute('data-piste');
  await choisie.locator('button').tap();
  await p.waitForTimeout(900);
  const apres=nbr((plat(await p.textContent('#montantBudget')).match(/à (.+?) €/)||[])[1]);
  chk(apres<avant,'« Appliquer » ('+typeChoisi+') : le total baisse ('+avant+' → '+apres+')');
  chk(await surServeur(p,'b.estimation&&b.estimation.max>0&&Math.abs(b.estimation.max-'+apres+')<=100'),'l’estimation gardée avec la visite suit le total affiché');
  /* tout en éco, si elle est encore proposée */
  if(await p.locator('#pistesBudget [data-piste="tousEco"]').count()){
    await p.locator('#pistesBudget [data-piste="tousEco"] button').tap();await p.waitForTimeout(700);
    chk(await p.locator('.niveaux .puce.on').evaluateAll(els=>els.every(e=>/Éco/.test(e.textContent))),'« tous en Éco » : chaque travaux passe en gamme Éco');
  }else chk(true,'(« tous en Éco » déjà appliquée par la première piste)');

  /* 2. calendrier indicatif */
  await p.tap('#calendrierBudget summary');
  chk(/au moins \d+ semaines/.test(plat(await p.textContent('#calendrierSans'))),'sans date : le délai minimal en semaines, rien d’inventé');
  await p.fill('input[name="cal-debut"]','2099-09-01');
  await p.waitForSelector('[data-cal="travaux"]');
  const cles=await p.$$eval('[data-cal]',els=>els.map(e=>e.dataset.cal));
  chk(cles.join()==='signature,ap,dp,consult,fab,travaux,reception','toutes les étapes, avec la fabrication (cuisine) : '+cles.join());
  chk(/1 septembre 2099|1er septembre 2099/.test(plat(await p.textContent('[data-cal="travaux"]'))),'le chantier commence à la date voulue');
  chk(!(await p.locator('#calendrierCourt').count()),'date lointaine : pas d’alerte');
  await p.locator('input[name="cal-urbanisme"]').uncheck();
  await p.waitForFunction(()=>!document.querySelector('[data-cal="dp"]'));
  chk(true,'sans dossier d’urbanisme : l’étape disparaît');
  const demain=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
  await p.fill('input[name="cal-debut"]',demain);
  await p.waitForSelector('#calendrierCourt');
  chk(/Délai court/.test(await p.textContent('#calendrierCourt')),'date trop proche : « Délai court pour cette date »');
  await p.fill('input[name="cal-debut"]','2099-09-01');
  await p.waitForFunction(()=>!document.querySelector('#calendrierCourt'));
  chk(await surServeur(p,'b.calendrier&&b.calendrier.debut==="2099-09-01"&&b.calendrier.urbanisme===false'),'le calendrier est gardé avec la visite');

  /* 3. mensualités : désactivées d'office */
  chk(await p.locator('#mensualitesBudget input[name="fin-apport"]').count()===0,'mensualités : rien d’affiché tant qu’on ne les a pas activées');
  chk(await p.locator('#mensualitesBudget.interne').count()===1,'et le bloc est masqué en mode présentation');
  await p.tap('#mensualitesBudget summary');
  chk(/règles applicables à la présentation d’un crédit/.test(await p.textContent('#mensualitesBudget')),'la mise en garde est lue avant d’activer');
  await p.locator('input[name="fin-actif"]').check();
  await p.waitForSelector('#resultatMensualites');
  const r60=plat(await p.textContent('#resultatMensualites'));
  chk(/par mois/.test(r60)&&/Sur 60 mois à 5 %/.test(r60),'activées : « de X à Y € par mois » sur 60 mois à 5 % ('+r60.slice(0,60)+')');
  await p.locator('[data-duree="120"]').tap();
  await p.waitForFunction(()=>/Sur 120 mois/.test(document.getElementById('resultatMensualites').textContent));
  const m120=nbr((plat(await p.textContent('#resultatMensualites')).match(/de (.+?) à/)||[])[1]);
  chk(m120<nbr((r60.match(/de (.+?) à/)||[])[1]),'plus long : la mensualité baisse');
  await p.fill('input[name="fin-apport"]','100000');await p.press('input[name="fin-apport"]','Tab');
  await p.waitForFunction(()=>/0 € par mois|de 0 € à 0 €/.test(document.getElementById('resultatMensualites').textContent));
  chk(true,'apport supérieur au total : rien à emprunter');
  chk(await surServeur(p,'b.financement&&b.financement.actif===true&&b.financement.duree===120'),'le réglage est gardé avec la visite');

  /* 4. mémo du vendeur */
  await p.tap('#memoVendeur summary');
  const memos=await p.$$eval('[data-memo]',els=>els.map(e=>e.dataset.memo));
  // la première piste a pu retirer un des travaux : les mémos suivent ce qui reste choisi
  const restants=await p.$$eval('[data-ouvrage-choisi]',els=>els.map(e=>e.dataset.ouvrageChoisi));
  chk(memos.includes('mur')&&restants.includes('cuisine')===memos.includes('cuisine')&&restants.some(x=>['combles','iti','ite'].includes(x))===memos.includes('isolation'),'mémos des travaux qui restent choisis, et « mur » car les souhaits parlent d’ouvrir un mur : '+memos+' / '+restants);
  chk(await p.locator('[data-memo="cuisine"] li').count()===9&&/QUESTIONS À POSER/.test(await p.textContent('[data-memo="cuisine"]')),'3 questions, 3 propositions, 3 points de vigilance par mémo');
  await p.screenshot({path:SORTIE+'/releve_aide_vente.png',fullPage:true});
  /* masqué en présentation */
  await p.tap('#bascPresentation');
  await p.waitForTimeout(300);
  chk(!(await p.isVisible('#memoVendeur')),'mode présentation : le mémo n’apparaît pas');
  chk(await p.isVisible('#calendrierBudget')&&await p.isVisible('#pistesBudget')||await p.isVisible('#calendrierBudget'),'mode présentation : le calendrier reste visible pour le client');
  await p.tap('#bascPresentation');await p.waitForTimeout(300);

  /* 5. message de suivi */
  await p.tap('#suivant');
  await p.waitForSelector('#messageSuivi');
  let txt=await p.inputValue('#texteMessage');
  chk(/^Bonjour Madame Test,/.test(txt)&&/entre [\d ]+ € et [\d ]+ € TTC/.test(txt)&&/indicative et non contractuelle/.test(txt),'e-mail proposé : formule d’appel, fourchette, mention non contractuelle');
  chk(/Cuisine : /.test(txt)&&/septembre 2099/.test(txt),'e-mail : lignes de travaux et calendrier choisi');
  chk(/href="mailto:madame\.test@example\.org\?subject=/.test(await p.evaluate(()=>document.getElementById('ouvrirMail').outerHTML)),'« Ouvrir dans la messagerie » vers l’adresse du client');
  await p.fill('#texteMessage',txt+'\nPS : je suis joignable le soir.');
  await p.locator('[data-message="sms"]').tap();
  await p.waitForFunction(()=>/c’est CP Constructions/.test(document.getElementById('texteMessage').value));
  chk(!(await p.locator('#ouvrirSms').count()),'SMS : pas de téléphone saisi, pas de bouton « messages » (on copie)');
  await p.locator('[data-message="mail"]').tap();
  await p.waitForFunction(()=>/PS : je suis joignable/.test(document.getElementById('texteMessage').value));
  chk(true,'mon texte modifié est gardé quand on change d’onglet et qu’on revient');
  await p.tap('#reprendreMessage');
  await p.waitForFunction(()=>!/PS : je suis joignable/.test(document.getElementById('texteMessage').value));
  chk(true,'« Reprendre le texte proposé » : seulement sur demande');
  await p.locator('[data-message="relance"]').tap();
  await p.waitForFunction(()=>/Avez-vous pu y réfléchir/.test(document.getElementById('texteMessage').value));
  chk(true,'onglet « Relance »');
  chk(await p.evaluate(()=>{const e=document.getElementById('messageSuivi');return e.classList.contains('interne')}),'le message de suivi est interne (masqué en présentation)');

  /* 6. dossier client : calendrier en option, jamais les mensualités */
  await p.tap('#ouvrirDossier');
  await p.waitForSelector('.dossier');
  chk(!/Calendrier indicatif/.test(await p.textContent('.dossier')),'dossier : calendrier absent tant qu’on ne le coche pas');
  await p.locator('input[name="opt-calendrier"]').check();
  await p.waitForSelector('.calendrierDossier,.feuille.calendrierDossier');
  const cal=plat(await p.textContent('.feuille.calendrierDossier'));
  chk(/Calendrier indicatif/.test(cal)&&/1 septembre 2099|1er septembre 2099/.test(cal)&&/sera confirmé à la signature/.test(cal),'dossier : le calendrier daté, dit indicatif');
  chk(!/mensualit|crédit|par mois/i.test(await p.textContent('.dossier')),'dossier : jamais de mensualités');
  await p.locator('input[name="opt-calendrier"]').uncheck();
  await p.waitForFunction(()=>!document.querySelector('.feuille.calendrierDossier'));
  chk(true,'décoché : le calendrier disparaît');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,500):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
