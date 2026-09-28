/* Vérification dans Chromium : rechargement au même endroit, bandeau de
   gauche escamotable à la souris, simulateur DPE retiré. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=require('path').resolve(__dirname,'..'), NM=__dirname+'/node_modules';
const DATA={chantiers:[{id:'c1',nom:'Maison Leroux',statut:'chantier',map:{}}],marches:[],
  prospects:[{id:'p1',nom:'Maison Moualid',client:'Moualid',commune:'Valframbert',statut:'demande',postes:[],produits:[]}]};
const FAUX_SUPA=`window.supabase={createClient:()=>{const q={select:()=>q,eq:()=>q,single:()=>Promise.resolve({data:{data:JSON.parse(sessionStorage.getItem('__srv')||'null')||${JSON.stringify(DATA)}},error:null}),
 upsert:(x)=>{window.__ups=(window.__ups||[]);window.__ups.push(x);sessionStorage.setItem('__srv',JSON.stringify(x.data));return Promise.resolve({error:null})}};return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}}}};`;
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const jour=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
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

  const ctx=await b.newContext({viewport:{width:1440,height:900}});await route(ctx);
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  const menu=async t=>{await p.mouse.move(4,450);await p.waitForTimeout(300);await p.click('nav.bot >> text='+t);await p.waitForTimeout(300)};
  /* chantier : une note simple, une note avec rappel échu */
  await menu('CHANTIERS');await p.click('text=Maison Leroux');
  const bloc=p.locator('.notes-dossier');
  chk(await bloc.count()===1&&/NOTES ET RAPPELS/.test(await bloc.textContent()),'fiche chantier : bloc NOTES ET RAPPELS');
  chk(await bloc.locator('button:has-text("Ajouter la note")').isDisabled(),'bouton inactif tant que la note est vide');
  await bloc.locator('textarea').fill('Client absent le vendredi — appeler le matin');
  await bloc.locator('button:has-text("Ajouter la note")').click();
  await bloc.locator('textarea').first().fill('Relancer le plombier pour le devis');
  await bloc.locator('input[type=date]').first().fill(jour(-2));
  await bloc.locator('button:has-text("Ajouter la note")').click();await p.waitForTimeout(200);
  const tb=await bloc.textContent();
  chk(/Relancer le plombier/.test(tb)&&/Client absent le vendredi/.test(tb)&&tb.indexOf('Relancer le plombier')<tb.indexOf('Client absent'),'deux notes, le rappel en tête');
  chk(/rappel en retard/.test(tb)&&/1 rappel à traiter/.test(tb)&&/cp@x\.fr/.test(tb),'rappel échu signalé, note signée du compte connecté');
  await p.screenshot({path:require('os').tmpdir()+'/cp-tests/notes_chantier.png'});
  /* prospect : rappel aujourd'hui */
  await menu('PROSPECTS');await p.click('text=Maison Moualid');
  const bp=p.locator('.notes-dossier');
  await bp.locator('textarea').fill('Envoyer la variante carrelage imitation bois');
  await bp.locator('input[type=date]').fill(jour(0));
  await bp.locator('button:has-text("Ajouter la note")').click();await p.waitForTimeout(200);
  chk(/rappel aujourd’hui/.test(await bp.textContent()),'fiche prospect : note avec rappel du jour');
  /* tableau de bord */
  await menu('ACCUEIL');
  const r=p.locator('.card',{hasText:'RAPPELS'}).first();
  const tr=await r.textContent();
  chk(/Relancer le plombier/.test(tr)&&/Maison Leroux/.test(tr)&&/retard 2 j/.test(tr)&&/Envoyer la variante/.test(tr)&&/aujourd’hui/.test(tr)&&!/Client absent/.test(tr),'accueil : les deux rappels, pas la note simple');
  await p.screenshot({path:require('os').tmpdir()+'/cp-tests/notes_accueil.png'});
  await r.locator('button:has-text("Envoyer la variante")').click();await p.waitForTimeout(300);
  chk(/← Prospects/.test(await p.textContent('main'))&&/Maison Moualid/.test(await p.textContent('main')),'clic sur le rappel : ouvre la fiche du prospect');
  await p.locator('.notes-dossier input[type=checkbox]').first().check();await p.waitForTimeout(200);
  await menu('ACCUEIL');
  const tr2=await p.locator('.card',{hasText:'RAPPELS'}).first().textContent();
  chk(!/Envoyer la variante/.test(tr2)&&/Relancer le plombier/.test(tr2),'rappel coché fait : il sort de l’accueil');
  await p.locator('.card',{hasText:'RAPPELS'}).first().locator('button:has-text("Relancer le plombier")').click();await p.waitForTimeout(300);
  chk(/Maison Leroux/.test(await p.textContent('main'))&&await p.locator('.notes-dossier').count()===1,'clic sur le rappel : ouvre la fiche du chantier');
  /* modifier, supprimer */
  const bc=p.locator('.notes-dossier');
  await bc.locator('button:has-text("Modifier")').nth(1).click();
  await bc.locator('textarea').nth(1).fill('Client absent le vendredi et le lundi');
  await bc.locator('button:has-text("Enregistrer")').click();await p.waitForTimeout(200);
  chk(/vendredi et le lundi/.test(await bc.textContent()),'note modifiée');
  p.once('dialog',d=>d.accept());
  await bc.locator('button:has-text("Supprimer")').nth(1).click();await p.waitForTimeout(200);
  chk(!/vendredi et le lundi/.test(await bc.textContent()),'note supprimée après confirmation');
  await p.waitForTimeout(1200);
  const ups=await p.evaluate(()=>window.__ups||[]);
  const der=ups.length?ups[ups.length-1].data:null;
  const cn=der&&der.chantiers[0].notesDossier, pn=der&&der.prospects[0].notesDossier;
  chk(cn&&cn.length===1&&cn[0].texte==='Relancer le plombier pour le devis'&&cn[0].rappel===jour(-2)&&pn&&pn[0].fait===true,'enregistré en base : notes du chantier et du prospect');
  /* rechargement : les notes restent (cache local + base) */
  await p.reload();await p.waitForSelector('.notes-dossier',{timeout:30000});
  chk(/Relancer le plombier/.test(await p.locator('.notes-dossier').textContent()),'après rechargement, la note est toujours là');
  chk(!erreurs.length,'aucune erreur JavaScript '+erreurs.join(' | '));
  /* téléphone */
  const tel=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await route(tel);
  const m=await tel.newPage();await m.goto('http://app.local/index.html');await m.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  await m.click('nav.bot >> text=CHANTIERS');await m.click('text=Maison Leroux');await m.waitForSelector('.notes-dossier');
  const bb=await m.locator('.notes-dossier').boundingBox();
  chk(bb.width<=390,'téléphone : le bloc tient dans la largeur');
  await m.locator('.notes-dossier').screenshot({path:require('os').tmpdir()+'/cp-tests/notes_tel.png'});
  await tel.close();await b.close();
  console.log(ko?'\n'+ko+' echec(s)':'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
