/* Vérification dans Chromium : une saisie de lot non enregistrée survit à un
   rechargement de la page. Le navigateur prévient en quittant la page ; au
   retour, le bandeau propose la saisie, « Reprendre la saisie » la rouvre,
   « Enregistrer » l'enregistre et efface la copie. Données fictives. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=require('path').resolve(__dirname,'..'), NM=__dirname+'/node_modules';
const DATA={chantiers:[{id:'c1',nom:'Maison Fictive',statut:'chantier',map:{}}],artisans:[{id:'a1',nom:'SASU Fictive'}],commandes:[],
  marches:[{id:'m1',chantierId:'c1',lot:'CARRELAGE',artisanId:'a1',montantHT:1200,tva:20,statut:'consulter',factures:[]}],prospects:[]};
const FAUX_SUPA=`window.supabase={createClient:()=>{const q={select:()=>q,eq:()=>q,single:()=>Promise.resolve({data:{data:${JSON.stringify(DATA)}},error:null}),
 update:()=>q,upsert:()=>Promise.resolve({error:null})};return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}}}};`;
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:1440,height:900}});
  await ctx.route('**/*',r=>{const u=r.request().url();
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:FAUX_SUPA,contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^http:\/\/app\.local\/(.*?)(\?.*)?$/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));
  /* l'avertissement du navigateur en quittant la page : noté, puis accepté (on recharge quand même) */
  const dialogues=[];p.on('dialog',d=>{dialogues.push(d.type());d.accept().catch(()=>{})});
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  await p.mouse.move(4,450);await p.waitForTimeout(300);await p.click('nav.bot >> text=CHANTIERS');await p.waitForTimeout(300);
  await p.click('text=Maison Fictive');await p.click('button.tab:has-text("MARCHÉS")');
  await p.click('button:has-text("Modifier le lot")');
  /* le champ du nom du lot : celui qui porte « CARRELAGE » */
  await p.waitForFunction(()=>[...document.querySelectorAll('input')].some(x=>x.value==='CARRELAGE'));
  await p.evaluate(()=>[...document.querySelectorAll('input')].find(x=>x.value==='CARRELAGE').setAttribute('data-essai','lot'));
  await p.click('input[data-essai=lot]');await p.fill('input[data-essai=lot]','CARRELAGE GRENIER');await p.press('input[data-essai=lot]','Tab');
  const copies=await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.indexOf('cpBrouillon:marches:c1:')===0).map(k=>JSON.parse(localStorage.getItem(k)).f.lot));
  chk(copies.length===1&&copies[0]==='CARRELAGE GRENIER','la saisie du lot est copiée sur l’appareil : '+JSON.stringify(copies));
  /* la page se recharge sans « Enregistrer » */
  await p.reload();await p.waitForSelector('button.tab.on',{timeout:30000});await p.waitForTimeout(800);
  chk(dialogues.includes('beforeunload'),'le navigateur prévient en quittant la page avec une saisie en cours');
  const t=await p.textContent('main');
  chk(/Saisie non enregistrée retrouvée/.test(t)&&/Lot CARRELAGE GRENIER/.test(t),'après le rechargement : le bandeau propose le lot tapé');
  await p.screenshot({path:require('os').tmpdir()+'/cp-tests/brouillon_bandeau.png'});
  await p.click('button:has-text("Reprendre la saisie")');
  chk(await p.evaluate(()=>[...document.querySelectorAll('input')].some(x=>x.value==='CARRELAGE GRENIER')),'« Reprendre la saisie » rouvre le lot avec ce qui avait été tapé');
  /* le bouton « Enregistrer » du formulaire du lot (la fiche en a d'autres) */
  await p.evaluate(()=>{const i=[...document.querySelectorAll('input')].find(x=>x.value==='CARRELAGE GRENIER');
    [...i.closest('.card').querySelectorAll('button')].find(b=>b.textContent.trim()==='Enregistrer').setAttribute('data-essai','enregistrer')});
  await p.click('button[data-essai=enregistrer]');await p.waitForTimeout(400);
  const reste=await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.indexOf('cpBrouillon:')===0).length);
  chk(reste===0&&/CARRELAGE GRENIER/.test(await p.textContent('main'))&&!/Saisie non enregistrée retrouvée/.test(await p.textContent('main')),'« Enregistrer » : le lot est enregistré, la copie effacée');
  /* plus de saisie en cours : recharger ne prévient plus */
  const avant=dialogues.length;
  await p.reload();await p.waitForSelector('button.tab.on',{timeout:30000});await p.waitForTimeout(500);
  chk(dialogues.length===avant,'sans saisie en cours, recharger se fait sans avertissement');
  chk(!erreurs.length,'aucune erreur JavaScript '+erreurs.join(' | '));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
