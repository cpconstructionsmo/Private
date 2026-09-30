/* Vérification dans Chromium, sur un dossier fictif : le DQE du marché
   « Électricité » devient la jauge du plan — lecture, programme par pièce,
   quantitatif en temps réel (1 / 7 🔴 puis 7 / 7 ✅ après la proposition),
   prestations du logement « à placer », contrôle, export Excel, et la fiche
   d'un équipement qui donne son article. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules', SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const T=l=>({type:'titre',libelle:l});let n=0;
const A=(code,libelle,qt,pu)=>({id:'l'+(n++),type:'article',code,libelle,unite:'U',qt,pu});
const LIGNES=[T('CUISINE :'),A('D_17CUI_5P16','Prise 10/16 A + T',7,52.5),A('D_17CUI_5P20','Prise 16/20 A + T',2,94.5),A('D_17CUI_1CVV','Point lumineux (V et V)',1,94.5),
  T('SEJOUR:'),A('D_23SEJ_5P16','Prise 10/16 A + T',5,52.5),A('D_23SEJ_7PTT','Prise communication (GR3 - Cath6)',1,73.5),
  T('AUTRES :'),A('L_17VR','Alimentation volet roulant',3,52.5),A('Z_12_CONSU','Demande de consuel',1,157.5)];
const DATA={chantiers:[{id:'c1',nom:'Maison Fictive',statut:'chantier',client:'M. Fictif',
  docs:{plan_elec:{plan:{fond:'fond1',ratio:0.667,symboles:[{id:'s1',type:'pc',x:0.12,y:0.12,h:30}],cables:[],
    pieces:[{id:'pC',type:'Cuisine',nom:'Cuisine',x0:.05,y0:.05,x1:.45,y1:.45},{id:'pS',type:'Séjour',nom:'Séjour',x0:.5,y0:.05,x1:.95,y1:.6}],
    calib:{x1:.05,y1:.05,x2:.45,y2:.05,metres:6,fond:'fond1',le:'2026-09-30'}}}}}],
  artisans:[{id:'a1',nom:'EI Fictive'}],marches:[{id:'m1',chantierId:'c1',lot:'Électricité',numero:3,artisanId:'a1',montantHT:1500,quantitatif:{lignes:LIGNES}}],prospects:[]};
const FAUX_SUPA=`window.supabase={createClient:()=>{const q={select:()=>q,eq:()=>q,single:()=>Promise.resolve({data:{data:${JSON.stringify(DATA)}},error:null}),
 upsert:()=>Promise.resolve({error:null})};return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},
 storage:{from:()=>({createSignedUrl:()=>Promise.resolve({data:{signedUrl:'http://app.local/tests/fixtures/paysage.jpg'},error:null}),
   upload:()=>Promise.resolve({error:null}),remove:()=>Promise.resolve({})})}}}};`;
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:1280,height:1000},acceptDownloads:true});
  await ctx.route('**/*',r=>{const u=r.request().url();
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:FAUX_SUPA,contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^http:\/\/app\.local\/(.*?)(\?.*)?$/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('dialog',d=>d.accept());
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:60000});
  await p.mouse.move(4,450);await p.waitForTimeout(300);
  await p.locator('nav.bot >> text=CHANTIERS').first().click();await p.waitForTimeout(300);
  await p.click('text=Maison Fictive');await p.click('button.tab:has-text("PIÈCES")');
  await p.click('text=Ouvrir le plan (1 symboles)');
  await p.waitForSelector('text=Préparer le plan');
  const svg=p.locator('svg[viewBox^="0 0 1000"]').first();
  await p.waitForTimeout(600);
  const bb=await svg.boundingBox();
  const clic=async(x,y)=>{await svg.scrollIntoViewIfNeeded();const b2=await svg.boundingBox();await p.mouse.click(b2.x+b2.width*x,b2.y+b2.height*y)};
  const Q=()=>p.textContent('.elec-quantitatif');
  chk(/QUANTITATIF/.test(await Q())&&/Aucune base/.test(await Q()),'le quantitatif est à côté du plan ; sans base, il le dit');
  await p.click('button:has-text("Programme électrique (DQE)")');
  await p.selectOption('select:has(option[value="dqe"])','dqe');
  await p.click('button:has-text("Lire le DQE du marché n° 3")');
  await p.waitForSelector('text=PIÈCES DU DQE → PIÈCES DU PLAN');
  const t1=await p.textContent('main');
  chk(/Marché n° 3 — Électricité — EI Fictive/.test(t1)&&/7 lignes, 2 pièces/.test(t1),'DQE lu depuis le marché : 7 lignes, 2 pièces');
  chk(await p.locator('[data-dqe-ligne="Z_12_CONSU"] select').inputValue()==='@non','le consuel est une prestation, pas un symbole');
  await p.click('button:has-text("Créer le programme depuis ce DQE")');
  await p.waitForSelector('text=Programme créé depuis le DQE');
  const norm=s=>s.replace(/\s+/g,' ');
  const q1=norm(await Q());
  chk(/Cuisine.*PC 2P\+T 16A1 \/ 7 🔴/.test(q1),'quantitatif en temps réel : cuisine, 1 prise sur 7 🔴');
  chk(/Logement \(général\).*VR0 \/ 3 🔴/.test(q1),'les 3 volets du DQE comptés au logement : 0 / 3 🔴');
  await p.click('button:has-text("✨ Générer automatiquement le plan électrique")');
  await p.waitForSelector('text=PLAN ÉLECTRIQUE GÉNÉRÉ',{timeout:15000});
  const q2=norm(await Q());
  chk(/PC 2P\+T 16A7 \/ 7/.test(q2)&&/PC 20A four2 \/ 2/.test(q2)&&/(\d+) \/ \1 conformes/.test(q2),'après la génération : cuisine 7 / 7, 20 A 2 / 2, tout conforme');
  chk(/VR3 \/ 3 🟠/.test(q2)&&/à vérifier/.test(q2),'les volets sans fenêtre marquée : posés, en orange « à vérifier » (position non inventée comme sûre)');
  await p.click('.elec-quantitatif button:has-text("Contrôler le plan")');
  await p.waitForSelector('text=CONTRÔLE PLAN ÉLECTRIQUE');
  const tc=norm(await p.textContent('.elec-controle'));
  chk(/Prévus au DQE\s*\d+/.test(tc)&&/Manquants\s*0/.test(tc)&&/DQE \/ PLAN — par équipement/.test(tc)&&/vérification d’ensemble/.test(tc),'contrôle : rapport sans manquant, DQE / PLAN par équipement, vérification d’ensemble');
  const [dl]=await Promise.all([p.waitForEvent('download',{timeout:20000}),p.click('button:has-text("DQE contrôlé (Excel)")')]);
  chk(!!dl,'DQE contrôlé exporté en Excel');
  /* la fiche d'un équipement posé : son article du DQE */
  /* centré d'abord : la barre d'onglets fixe ne doit pas recouvrir le symbole */
  const g0=p.locator('.elec-zone svg g[style*="move"]').first();
  await g0.evaluate(e=>e.scrollIntoView({block:'center'}));
  await g0.click({force:true});
  await p.waitForTimeout(200);
  const tf=await p.textContent('main');
  chk(/Article D_17CUI_5P16 · DQE : 7, plan : 7/.test(tf),'fiche de l’équipement : article D_17CUI_5P16, DQE 7, plan 7');
  await p.screenshot({path:SORTIE+'/elec_dqe.png',fullPage:false});
  chk(!erreurs.length,'aucune erreur JavaScript'+(erreurs.length?' — '+erreurs.join(' | '):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
