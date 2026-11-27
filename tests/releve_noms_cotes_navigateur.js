/* Relevé de visite — dans le plan coté, le nom et la surface d'une pièce ne touchent plus les cotes
   des murs (cas d'une capture réelle : 8 pièces de 3 × 3 m côte à côte, noms collés aux « 3,00 »).
   Un nom que l'utilisateur a placé lui-même reste où il l'a mis. Chromium en 1920 × 1200 (l'écran de la capture),
   faux Supabase, pièces FICTIVES. */
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
  const NB=8;   // comme la capture : 8 pièces de 3 × 3 m côte à côte
  for(let k=1;k<=NB;k++){await p.click('#ajouterPieceDessin');await p.waitForFunction(n=>document.querySelectorAll('.apercuDessin [data-piece-dessin]').length===n,k)}
  // le nom de la 1re pièce est placé à la main (flèches sous le plan) : il doit rester exactement là, même s'il touche une cote
  {const b=await p.locator('.apercuDessin [data-piece-dessin]').first().boundingBox();await p.mouse.click(b.x+b.width*0.2,b.y+b.height*0.85)}
  await p.waitForSelector('#positionNom');
  await p.click('[data-nom-vers="haut"]');await p.click('[data-nom-vers="haut"]');
  await p.click('#creerPlanDessin');
  await p.waitForSelector('#cadrePlan');
  const frame=await (async()=>{for(let i=0;i<80;i++){const f=p.frames().find(x=>/moteur\/index\.html/.test(x.url()));if(f&&await f.evaluate(()=>!!(window.__releve&&window.__releve.donnees())).catch(()=>false))return f;await p.waitForTimeout(100)}return null})();
  chk(!!frame,'le plan coté s’ouvre avec 8 pièces de 3 × 3 m côte à côte');
  await frame.waitForFunction(()=>window.__releve.boites().some(b=>b.type==='nom'));
  const analyse=()=>frame.evaluate(()=>{const B=window.__releve.boites(),noms=B.filter(b=>b.type==='nom'),cotes=B.filter(b=>b.type==='cote');
    const touche=(a,b)=>a.x0<b.x1&&a.x1>b.x0&&a.y0<b.y1&&a.y1>b.y0;
    const col=noms.filter(n=>cotes.some(c=>c.ri===n.ri&&touche(n,c))).map(n=>n.ri);
    return {noms:noms.length,cotes:cotes.length,collisions:col,perso:noms.filter(n=>n.perso).length};});
  const a0=await analyse();
  chk(a0.noms===NB&&a0.cotes>=4*NB,'8 noms et leurs cotes sont dessinés ('+a0.noms+' noms, '+a0.cotes+' cotes)');
  chk(a0.collisions.every(ri=>ri===0)&&a0.perso===1,'aucun nom ni surface ne touche une cote de sa pièce, sauf peut-être le nom placé à la main (collisions : '+JSON.stringify(a0.collisions)+', placés à la main : '+a0.perso+')');
  await p.screenshot({path:SORTIE+'/releve_noms_cotes.png',fullPage:false});
  const perso=await frame.evaluate(()=>{const B=window.__releve.boites(),p0=B.find(b=>b.type==='nom'&&b.ri===0),c0=B.filter(b=>b.type==='cote'&&b.ri===0);
    const milieuPiece=(Math.min(...c0.map(c=>c.y0))+Math.max(...c0.map(c=>c.y1)))/2;return {perso:p0.perso,dy:(p0.y0+p0.y1)/2-milieuPiece}});
  chk(perso.perso===true&&perso.dy<-8,'le nom placé à la main (2 touchers vers le haut) est resté où on l’a mis : au-dessus du milieu de sa pièce, sans être recalé (écart '+Math.round(perso.dy)+' px)');
  chk(await frame.evaluate(()=>window.__releve.donnees().pieces.filter(x=>x.etiquette).length)===1,'et son décalage est bien gardé dans la visite (une seule pièce a un nom décalé)');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
