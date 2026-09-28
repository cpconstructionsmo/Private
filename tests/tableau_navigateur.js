/* Vérification dans Chromium : rechargement au même endroit, bandeau de
   gauche escamotable à la souris, simulateur DPE retiré. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=require('path').resolve(__dirname,'..'), NM=__dirname+'/node_modules';
const J=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const DATA={chantiers:[
    {id:'c1',nom:'Maison Leroux',statut:'travaux',client:'M. Leroux',map:{},jalons:[]},
    {id:'c2',nom:'Maison Martin',statut:'pc',client:'Mme Martin',jalons:[{id:'j1',label:'Dépôt du permis de construire',reelle:J(-40)},{id:'j2',label:'Obtention du permis de construire',prevue:J(-3)}]},
    {id:'c3',nom:'Maison Petit',statut:'etude',jalons:[{id:'j3',label:'Dépôt du permis de construire',reelle:J(-10)},{id:'j4',label:'Obtention du permis de construire'}]},
    {id:'c4',nom:'Maison Close',statut:'clos',jalons:[]}],marches:[],
  prospects:[
    {id:'p1',nom:'Maison Moualid',statut:'chiffre',remisLe:J(-20),commercial:'Loïc',postes:[],produits:[]},
    {id:'p2',nom:'Maison Récente',statut:'chiffre',remisLe:J(-5),postes:[],produits:[]},
    {id:'p3',nom:'Maison Rappel',statut:'attente',remisLe:J(-40),notesDossier:[{id:'n',texte:'rappeler',rappel:J(10),fait:false}],postes:[],produits:[]},
    {id:'p4',nom:'Maison Signée',statut:'gagne',remisLe:J(-60),postes:[],produits:[]}],
  commandes:[
    {id:'k1',chantierId:'c1',designation:'Carrelage',statut:'litige',factures:[]},
    {id:'k2',chantierId:'c1',designation:'Menuiseries',statut:'commande',livrPrevue:J(-2),factures:[]},
    {id:'k3',chantierId:'c1',designation:'Plaques de plâtre',statut:'a_commander',livrPrevue:J(10),factures:[]},
    {id:'k4',chantierId:'c1',designation:'Sanitaires',statut:'a_commander',livrPrevue:J(60),factures:[]},
    {id:'k5',chantierId:'c1',designation:'Tuiles',statut:'livre',livrPrevue:J(-5),livrReelle:J(-5),factures:[]},
    {id:'k6',chantierId:'c4',designation:'Clos',statut:'litige',factures:[]}]};
const FAUX_SUPA=`window.supabase={createClient:()=>{const q={select:()=>q,eq:()=>q,single:()=>Promise.resolve({data:{data:${JSON.stringify(DATA)}},error:null}),
 upsert:()=>Promise.resolve({error:null})};return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}}}};`;
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const route=async ctx=>ctx.route('**/*',r=>{const u=r.request().url();
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:FAUX_SUPA,contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^http:\/\/app\.local\/(.*?)(\?.*)?$/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});

  const ctx=await b.newContext({viewport:{width:1440,height:1000}});await route(ctx);
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});await p.waitForTimeout(500);
  const bloc=t=>p.locator('.card',{hasText:t}).first();
  const tp=await bloc('PROSPECTS À RELANCER').textContent();
  chk(/Maison Moualid/.test(tp)&&/depuis 20 j/.test(tp)&&!/Récente|Rappel|Signée/.test(tp),'prospects à relancer : Moualid (20 j) ; ni le récent, ni celui avec un rappel, ni le signé');
  const tpc=await bloc('PERMIS EN COURS').textContent();
  chk(/Maison Martin/.test(tpc)&&/obtention attendue depuis 3 j/.test(tpc)&&/Maison Petit/.test(tpc)&&/déposé le/.test(tpc)&&!/Leroux|Close/.test(tpc),'permis en cours : dates du planning, sans délai inventé');
  const tk=await bloc('COMMANDES À SUIVRE').textContent();
  chk(/Carrelage/.test(tk)&&/litige/.test(tk)&&/Menuiseries/.test(tk)&&/livraison dépassée/.test(tk)&&/Plaques de plâtre/.test(tk)&&/à commander/.test(tk)
    &&!/Sanitaires|Tuiles|Clos/.test(tk),'commandes à suivre : litige, livraison dépassée, à commander bientôt ; ni lointaine, ni livrée, ni chantier clos');
  chk(tk.indexOf('Carrelage')<tk.indexOf('Plaques'),'les urgences d’abord');
  await p.screenshot({path:require('os').tmpdir()+'/cp-tests/tdb.png',fullPage:true});
  await bloc('COMMANDES À SUIVRE').locator('button:has-text("Menuiseries")').click();await p.waitForTimeout(400);
  chk(/Maison Leroux/.test(await p.textContent('main'))&&(await p.textContent('button.tab.on')).trim()==='MATÉRIAUX','clic sur une commande : chantier ouvert sur MATÉRIAUX');
  await p.mouse.move(4,450);await p.waitForTimeout(300);await p.click('nav.bot >> text=ACCUEIL');await p.waitForTimeout(300);
  await bloc('PERMIS EN COURS').locator('button:has-text("Maison Martin")').click();await p.waitForTimeout(400);
  chk(/Maison Martin/.test(await p.textContent('main'))&&(await p.textContent('button.tab.on')).trim()==='PLANNING','clic sur un permis : chantier ouvert sur PLANNING');
  await p.mouse.move(4,450);await p.waitForTimeout(300);await p.click('nav.bot >> text=ACCUEIL');await p.waitForTimeout(300);
  await bloc('PROSPECTS À RELANCER').locator('button:has-text("Maison Moualid")').click();await p.waitForTimeout(400);
  chk(/← Prospects/.test(await p.textContent('main'))&&/Maison Moualid/.test(await p.textContent('main')),'clic sur un prospect : sa fiche');
  chk(!erreurs.length,'aucune erreur JavaScript '+erreurs.join(' | '));
  await ctx.close();
  const tel=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await route(tel);
  const m=await tel.newPage();await m.goto('http://app.local/index.html');await m.waitForSelector('text=COMMANDES À SUIVRE',{timeout:30000});
  const bb=await m.locator('.card',{hasText:'COMMANDES À SUIVRE'}).first().boundingBox();
  chk(bb.x>=0&&bb.x+bb.width<=390,'téléphone : les blocs tiennent dans la largeur');
  await tel.close();await b.close();
  console.log(ko?'\n'+ko+' echec(s)':'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
