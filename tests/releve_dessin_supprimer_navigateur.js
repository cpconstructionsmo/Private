/* Relevé de visite — supprimer une pièce du dessin rapide d'un bouton, sous le
   plan : le bouton « 🗑 Supprimer » apparaît dès qu'une pièce est sélectionnée,
   demande confirmation, retire la pièce et ses portes et fenêtres, se rattrape
   par « ↶ Annuler », et la touche Suppr fait de même sur PC (jamais dans un
   champ de saisie). Pièces FICTIVES, Chromium au format iPhone, faux Supabase. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const {fauxSupabase}=require('./releve_faux_supabase');
const R=path.resolve(__dirname,'..'), SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const PHOTO=path.join(__dirname,'fixtures','portrait.jpg');
const BIBLIO=`window.__etat=window.__etat||{};${fauxSupabase.toString()};window.supabase={createClient:()=>fauxSupabase(window.__etat)};`;
const attendre=async(p,f,ms=10000)=>{const t=Date.now();while(Date.now()-t<ms){if(await p.evaluate(f))return true;await p.waitForTimeout(100)}return false};

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
  const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));
  let dialogue='accepter';p.on('dialog',d=>dialogue==='refuser'?d.dismiss():d.accept());
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('.progres button[aria-label^="Étape 5 "]');
  await p.tap('#dessinRapide');
  await p.waitForSelector('#ajouterPieceDessin');
  const pieces=()=>p.locator('.apercuDessin [data-piece-dessin]').count();
  const serveur=n=>attendre(p,'(()=>{const L=Object.values(window.__etat.lignes||{});const d=L[0]&&L[0].donnees.valeurs.dessin;return !!(d&&d.pieces.length==='+n+')})()');

  /* deux pièces, la seconde avec une porte */
  chk(await p.locator('#supprimerPieceDessin').count()===0,'rien de sélectionné : pas de bouton « Supprimer »');
  await p.tap('#ajouterPieceDessin');await p.waitForFunction(()=>document.querySelectorAll('.apercuDessin [data-piece-dessin]').length===1);
  await p.tap('#ajouterPieceDessin');await p.waitForFunction(()=>document.querySelectorAll('.apercuDessin [data-piece-dessin]').length===2);
  await p.locator('.pieceDessin.sel [data-ajout-ouverture="porte"]').first().tap().catch(()=>{});
  chk(await p.locator('#supprimerPieceDessin').count()===1,'une pièce est sélectionnée : le bouton « 🗑 Supprimer » est sous le plan');
  // positions dans la page (indépendantes du défilement) : le bouton est dans la carte du plan, tout près de son bas
  const pos=await p.evaluate(()=>{const b=document.getElementById('supprimerPieceDessin').getBoundingClientRect(),c=document.getElementById('carteDessin').getBoundingClientRect();return {bouton:b.top+scrollY,carteHaut:c.top+scrollY,carteBas:c.bottom+scrollY}});
  chk(pos.bouton>pos.carteHaut&&pos.bouton<pos.carteBas+160,'il est juste sous le plan, sans descendre dans la liste des pièces');
  await p.screenshot({path:SORTIE+'/releve_dessin_supprimer.png',fullPage:false});
  chk(await serveur(2),'(2 pièces gardées avec la visite)');

  /* refuser la confirmation : rien ne change */
  dialogue='refuser';
  await p.tap('#supprimerPieceDessin');await p.waitForTimeout(500);
  chk(await pieces()===2,'confirmation refusée : la pièce reste');
  dialogue='accepter';

  /* supprimer la pièce sélectionnée */
  const nomSel=await p.getAttribute('#supprimerPieceDessin','aria-label');
  await p.tap('#supprimerPieceDessin');
  await p.waitForFunction(()=>document.querySelectorAll('.apercuDessin [data-piece-dessin]').length===1);
  chk(await pieces()===1&&!(await p.textContent('main')).includes(nomSel.replace('Supprimer ','')+' ·'),'confirmation acceptée : « '+nomSel.replace('Supprimer ','')+' » est retirée du plan et de la liste');
  chk(await p.locator('#supprimerPieceDessin').count()===0,'plus rien de sélectionné : le bouton disparaît');
  chk(await serveur(1),'la suppression part avec la visite');
  const ouvSans=await p.evaluate(()=>{const d=Object.values(window.__etat.lignes)[0].donnees.valeurs.dessin;return d.ouvertures.filter(o=>!d.pieces.some(z=>z.id===o.piece)).length});
  chk(ouvSans===0,'aucune porte ni fenêtre orpheline ne reste');

  /* ↶ rattrape */
  await p.tap('#annulerDessinBas');
  await p.waitForFunction(()=>document.querySelectorAll('.apercuDessin [data-piece-dessin]').length===2);
  chk(true,'« ↶ Annuler » (sous le plan) ramène la pièce supprimée');

  /* PC : touche Suppr */
  await p.locator('.pieceDessin').first().locator('.rang').first().tap().catch(()=>{});
  await p.waitForSelector('#supprimerPieceDessin');
  await p.focus('input[name="dessin-nom"]');await p.keyboard.press('Backspace');await p.waitForTimeout(400);
  chk(await pieces()===2,'Retour arrière dans le champ « Nom » : la pièce reste (on corrige le texte, on ne supprime rien)');
  await p.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await p.keyboard.press('Delete');
  await p.waitForFunction(()=>document.querySelectorAll('.apercuDessin [data-piece-dessin]').length===1);
  chk(true,'touche Suppr hors champ : la pièce sélectionnée est supprimée, après confirmation');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
