/* Relevé de visite — dans le plan coté, on sait enfin quel mur est « A », « B »… : une ligne du
   tableau des murs (survol, focus, toucher) ou la fiche d'un mur allume ce mur sur le plan, avec
   sa pièce et sa lettre ; la pièce a sa pastille de couleur dans le tableau ; tout s'éteint ensuite.
   Chromium en 1920 × 1200, faux Supabase, pièces FICTIVES. */
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
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:1920,height:1200},deviceScaleFactor:1});
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
  p.removeAllListeners('dialog');p.on('dialog',d=>d.accept());
  const annot=()=>p.evaluate(()=>{const L=Object.values(window.__etat.lignes||{});return L[0]&&L[0].donnees.valeurs.annotations});
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.click('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.click('.progres button[aria-label^="Étape 5 "]');
  await p.click('#dessinRapide');
  await p.waitForSelector('#ajouterPieceDessin');
  for(let k=1;k<=3;k++){await p.click('#ajouterPieceDessin');await p.waitForFunction(n=>document.querySelectorAll('.apercuDessin [data-piece-dessin]').length===n,k)}
  await p.click('#creerPlanDessin');
  await p.waitForSelector('#cadrePlan');
  const fr=await (async()=>{for(let i=0;i<80;i++){const f=p.frames().find(x=>/moteur\/index\.html/.test(x.url()));if(f&&await f.evaluate(()=>!!(window.__releve&&window.__releve.donnees())).catch(()=>false))return f;await p.waitForTimeout(100)}return null})();
  chk(!!fr,'le plan coté s’ouvre avec 3 pièces de 3 × 3 m (donc 3 murs « A » : on ne sait pas lequel)');
  await fr.waitForSelector('#tabMurs tr');
  const etat=()=>fr.evaluate(()=>({m:window.__releve.murSurligne(),b:window.__releve.boites().filter(x=>x.type==='surbrillance')}));
  chk((await etat()).m===null,'au départ, aucun mur n’est allumé');

  /* la pastille de couleur de la pièce, dans le tableau, comme sur le plan */
  const sw=await fr.evaluate(()=>{const l=[...document.querySelectorAll('#tabMurs tr')].filter(r=>r.querySelector('.repV'));return {n:l.length,pastilles:l.filter(r=>r.querySelector('.swPiece')).length,couleurs:new Set(l.map(r=>r.querySelector('.swPiece').style.background)).size}});
  chk(sw.n===12&&sw.pastilles===12&&sw.couleurs===3,'12 lignes de murs, chacune avec la pastille de sa pièce (3 couleurs : '+sw.couleurs+')');

  /* survol d'une ligne : « Pièce 2 – mur C » s'allume */
  const ligne=(ri,ei)=>fr.locator('#tabMurs tr:has(.repV[data-i="'+ri+'"][data-e="'+ei+'"]) td').first();
  await ligne(1,2).scrollIntoViewIfNeeded();
  await ligne(1,2).hover();
  await fr.waitForFunction(()=>window.__releve.murSurligne());
  let e1=await etat();
  chk(e1.m.ri===1&&e1.m.ei===2&&e1.b.length===1&&e1.b[0].piece==='Pièce 2'&&e1.b[0].lettre==='C','survol de la ligne « Pièce 2 – mur C » : ce mur s’allume sur le plan, avec sa pièce et sa lettre ('+JSON.stringify(e1.b)+')');
  await p.screenshot({path:SORTIE+'/releve_mur_surbrillance.png',fullPage:false});
  /* le tableau est sous le plan : le plan n'est plus à l'écran, donc un petit plan flottant montre le mur allumé */
  const mini=await fr.evaluate(()=>window.__releve.miniPlan());
  const planVu=await fr.evaluate(()=>{const r=document.getElementById('plan').getBoundingClientRect();return r.bottom>0&&r.top<innerHeight});
  chk(!planVu&&mini&&mini.orange>20&&mini.w>=280&&mini.w<=310,'le plan est hors de l’écran : un petit plan flottant apparaît, avec le mur allumé en orange ('+(mini&&mini.orange)+' px)');
  /* une autre ligne : l'allumage suit */
  await ligne(2,0).hover();
  await fr.waitForFunction(()=>{const m=window.__releve.murSurligne();return m&&m.ri===2&&m.ei===0});
  e1=await etat();
  chk(e1.b.length===1&&e1.b[0].piece==='Pièce 3'&&e1.b[0].lettre==='A','une autre ligne : l’allumage suit (un seul mur à la fois : Pièce 3 – mur A)');
  /* on quitte le tableau : tout s'éteint, le petit plan aussi */
  await p.mouse.move(5,5);
  await fr.waitForFunction(()=>window.__releve.murSurligne()===null);
  chk((await etat()).b.length===0&&(await fr.evaluate(()=>window.__releve.miniPlan()))===null,'on quitte le tableau : plus aucun mur allumé, et le petit plan disparaît');

  /* au clavier : le champ « travaux / explicatif » du mur (focus) allume son mur ; en sortir l'éteint */
  const champ=fr.locator('#tabMurs tr:has(.repV[data-i="0"][data-e="3"]) .noteMur');
  chk(await champ.count()===1,'(le champ « Travaux / explicatif » existe pour chaque mur)');
  await champ.focus();
  await fr.waitForFunction(()=>{const m=window.__releve.murSurligne();return m&&m.ri===0&&m.ei===3});
  chk((await etat()).b[0].piece==='Séjour'&&(await etat()).b[0].lettre==='D','focus dans le champ du mur « Séjour – D » : ce mur s’allume');
  await champ.evaluate(el=>el.blur());
  await fr.waitForFunction(()=>window.__releve.murSurligne()===null);
  chk(true,'en sortir l’éteint');

  /* au toucher (iPhone) : un toucher sur la ligne l'allume, et reste allumé jusqu'à un toucher ailleurs */
  await fr.evaluate(()=>{const c=document.querySelector('#tabMurs tr:has(.repV[data-i="1"][data-e="1"]) td');c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}))});
  await fr.waitForFunction(()=>{const m=window.__releve.murSurligne();return m&&m.ri===1&&m.ei===1});
  chk(true,'un toucher sur une ligne (sans souris) allume son mur');
  await fr.evaluate(()=>document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'})));
  await fr.waitForFunction(()=>window.__releve.murSurligne()===null);
  chk(true,'un toucher ailleurs l’éteint');

  /* plan bien visible à l'écran : pas de petit plan (le mur s'allume directement sur le grand) */
  await fr.evaluate(()=>document.getElementById('plan').scrollIntoView({block:'center'}));await p.waitForTimeout(300);
  await fr.evaluate(()=>window.__releve.surligner(0,1));
  chk(await fr.evaluate(()=>window.__releve.miniPlan())===null&&(await etat()).b.length===1,'le plan est bien visible : pas de petit plan, le mur est allumé sur le grand plan');
  await fr.evaluate(()=>window.__releve.surligner(null));
  /* la fiche d'un mur (toucher sur sa cote) : le mur modifié est allumé tant que la fiche est ouverte */
  await fr.evaluate(()=>document.getElementById('plan').scrollIntoView({block:'center'}));await p.waitForTimeout(300);
  const zm=await fr.evaluate(()=>{const z=window.__releve.zones().find(z=>z.type==='mur'&&z.ri===1);const r=document.getElementById('plan').getBoundingClientRect();return {x:r.left+z.x,y:r.top+z.y,ri:z.ri,ei:z.ei}});
  const fb=await p.locator('#cadrePlan').boundingBox();
  await p.mouse.click(fb.x+zm.x,fb.y+zm.y);
  await fr.waitForSelector('#editeur:not([hidden])');
  const e2=await etat();
  chk(e2.m&&e2.m.ri===zm.ri&&e2.m.ei===zm.ei&&e2.b.length===1,'la fiche d’un mur est ouverte : ce mur est allumé sur le plan ('+JSON.stringify(e2.b)+')');
  /* un menu déroulant tout en haut de la fiche : fenêtre, porte, autre… posées d'un choix */
  chk(await fr.locator('#edAjMenu').count()===1&&(await fr.locator('#edAjMenu option').allTextContents()).join('|').includes('Fenêtre'),'la fiche d’un mur propose en tête un menu « Ajouter sur ce mur » : fenêtre, porte, baie, autre');
  const nbAvant=await fr.evaluate(()=>window.__releve.donnees().ouvertures.length);
  await fr.selectOption('#edAjMenu','fenetre');
  await fr.waitForFunction(n=>window.__releve.donnees().ouvertures.length===n+1,nbAvant);
  chk(await fr.evaluate(()=>{const o=window.__releve.donnees().ouvertures;return o[o.length-1].type==='fenetre'}),'choisir « Fenêtre » dans le menu pose une fenêtre sur ce mur');
  await fr.waitForFunction(()=>window.__releve.murSurligne()===null);
  chk(true,'fiche fermée : le mur s’éteint');

  /* rien d'écrit dans la visite par ces survols */
  chk(await fr.evaluate(()=>window.__releve.donnees().pieces.every(x=>!x.notesMurs&&!x.reperesMasques)),'survoler ne modifie rien dans la visite');

  await fr.evaluate(()=>document.getElementById('plan').scrollIntoView({block:'center'}));await p.waitForTimeout(300);await p.screenshot({path:SORTIE+'/mur_plan.png'});
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
