/* Relevé de visite — la lecture d'un plan (alerte « à vérifier » quand la surface écrite
   s'écarte des cotes lues) et le nom d'une pièce que l'on décale : flèches sous le plan,
   ou glissé sur le plan quand la pièce est déjà sélectionnée. Chromium au format iPhone,
   faux Supabase, plan FICTIF. */
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
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
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
  const dessin=()=>p.evaluate(()=>{const L=Object.values(window.__etat.lignes||{});return L[0]&&L[0].donnees.valeurs.dessin});
  const surDessin=(cond)=>attendre(p,'(()=>{const L=Object.values(window.__etat.lignes||{});const d=L[0]&&L[0].donnees.valeurs.dessin;return !!(d&&('+cond+'))})()');
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('.progres button[aria-label^="Étape 5 "]');

  /* la lecture : le couloir (1,9 × 8,66 = 16,45 m²) contre 15,28 m² écrits est signalé, la cuisine non */
  await repondre({parties:[{nom:'RDC',pieces:[
    {nom:'Dégagement',longueur:1.9,largeur:8.66,surface:15.28,x:0,y:0},
    {nom:'Cuisine',longueur:4.6,largeur:4.58,surface:21.04,x:2,y:0},
    {nom:'Salon',longueur:4.3,largeur:5.5,x:7,y:0}]}]});
  const [c2]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#importerPlan2D')]);await c2.setFiles(PHOTO);
  await p.waitForSelector('#ajouterPieceDessin');
  const msg=await p.textContent('main');
  chk(/À vérifier : Dégagement : cotes lues 1,9 × 8,66 = 16,45 m², surface écrite sur le plan 15,28 m² \(écart 8 %/.test(msg),'la lecture signale le couloir : cotes lues 16,45 m² contre 15,28 m² écrits');
  chk(!/À vérifier : [^.]*Cuisine/.test(msg)&&!/Salon : cotes lues/.test(msg),'ni la cuisine (0,1 %), ni le salon (sans surface écrite)');
  chk(await surDessin('d.pieces.length===3&&/Surface à vérifier : 16,45 m²/.test(d.pieces[0].note||"")&&d.pieces[0].largeur===8.66'),'la note de la pièce porte l’alerte, et la cote lue n’est pas corrigée d’office (8,66)');

  /* le nom : rien de sélectionné, pas de flèches ; on touche la pièce, elles apparaissent sous le plan */
  await p.evaluate(()=>{});
  // l'état gardé sur le serveur, une fois qu'il ne bouge plus (la synchro peut traîner sur une machine lente)
  const diag={};   // ce qui s'est passé, affiché si une vérification échoue (pour comprendre un échec sur une autre machine)
  const stable=async()=>{let prev=JSON.stringify(await dessin());for(let i=0;i<24;i++){await p.waitForTimeout(250);const cur=JSON.stringify(await dessin());if(cur===prev)return JSON.parse(cur);prev=cur}return JSON.parse(prev)};
  // glisse le nom : on mesure, on vérifie que le point visé est bien le nom (la mise en page a pu bouger), puis on glisse
  const glisserNom=async(dx,dy)=>{for(let essai=0;essai<5;essai++){
    const b=await vu(p.locator('.apercuDessin [data-piece-dessin] [data-edit="nom"]').first()), x=b.x+b.width/2, y=b.y+b.height/2;
    const ok=await p.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);return !!(e&&e.closest('[data-edit="nom"]'))},[x,y]);
    if(!ok){await p.waitForTimeout(400);continue}
    await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+dx/2,y+dy/2,{steps:4});await p.mouse.move(x+dx,y+dy,{steps:4});await p.mouse.up();diag.dernier={x:Math.round(x),y:Math.round(y),dx,dy,essai};return true}
    return false};
  const vu=async loc=>{await loc.evaluate(el=>el.scrollIntoView({block:'center'}));return loc.boundingBox()};   // au milieu de l'écran : la barre fixe du bas ne le recouvre pas
  const deselect=async()=>{if(await p.locator('#positionNom').count()){const b=await vu(p.locator('.apercuDessin [data-piece-dessin]').first());await p.mouse.click(b.x+b.width/2,b.y+b.height*0.7);await p.waitForTimeout(250)}};
  await deselect();
  chk(await p.locator('#positionNom').count()===0,'aucune pièce sélectionnée : pas de flèches pour le nom');
  const b0=await vu(p.locator('.apercuDessin [data-piece-dessin]').first());
  await p.mouse.click(b0.x+b0.width/2,b0.y+b0.height*0.7);
  await p.waitForSelector('#positionNom');
  const pos=await p.evaluate(()=>{const b=document.getElementById('positionNom').getBoundingClientRect(),c=document.getElementById('carteDessin').getBoundingClientRect();return {b:b.top+scrollY,h:c.top+scrollY,bas:c.bottom+scrollY}});
  chk(pos.b>pos.h&&pos.b<pos.bas+260,'pièce sélectionnée : les flèches du nom sont sous le plan, plus dans « Plus de réglages »');
  chk(await p.locator('.reglagesPiece [data-nom-vers]').count()===0,'et plus cachées dans la section repliée (pas de doublon)');
  const nom0=(await dessin()).pieces[0].nom;
  await p.tap('[data-nom-vers="droite"]');await p.tap('[data-nom-vers="droite"]');await p.tap('[data-nom-vers="bas"]');
  chk(await surDessin('d.pieces[0].etiquette&&d.pieces[0].etiquette.dx===0.5&&d.pieces[0].etiquette.dy===0.25'),'3 touchers sur les flèches : le nom de « '+nom0+' » est décalé de 50 cm à droite et 25 cm en bas, et gardé');
  await p.tap('[data-nom-vers="centre"]');
  chk(await surDessin('!d.pieces[0].etiquette'),'« Au centre » retire le décalage');

  /* sans le mode « ✋ Glisser le nom », glisser une pièce SÉLECTIONNÉE par son nom la déplace, comme avant */
  const av0=await stable(), sansEt=o=>{const c={...o};delete c.etiquette;return JSON.stringify(c)};
  chk(await glisserNom(25,0),'(le nom de la pièce sélectionnée est bien atteint)');
  const piecebouge=await (async()=>{for(let i=0;i<60;i++){const d=await dessin();if(sansEt(d.pieces[0])!==sansEt(av0.pieces[0]))return true;await p.waitForTimeout(100)}return false})();
  chk(piecebouge&&!(await dessin()).pieces[0].etiquette,'mode « Glisser le nom » éteint : glisser une pièce sélectionnée par son milieu la déplace, le nom reste au centre (comportement d’origine)');
  await p.evaluate(()=>{});
  if(!(await p.locator('#positionNom').count())){const b=await vu(p.locator('.apercuDessin [data-piece-dessin]').first());await p.mouse.click(b.x+b.width/2,b.y+b.height*0.7);await p.waitForSelector('#positionNom');}
  await p.tap('#glisserNom');
  chk(await p.getAttribute('#glisserNom','aria-pressed')==='true','« ✋ Glisser le nom » activé');
  /* glisser le nom d'une pièce sélectionnée, mode actif : le nom bouge, la pièce reste */
  await p.waitForSelector('#glisserNom');
  const avant=await stable(), sansEtiq=o=>{const c={...o};delete c.etiquette;return JSON.stringify(c)};
  const gn=p.locator('.apercuDessin [data-piece-dessin] [data-edit="nom"]').first();
  chk(await glisserNom(0,30),'(le nom est bien atteint, mode actif)');
  const nomOk=await surDessin('d.pieces[0].etiquette&&d.pieces[0].etiquette.dy>0.05&&Math.abs(d.pieces[0].etiquette.dx)<0.2');
  if(!nomOk)console.log('  [diagnostic] geste',JSON.stringify(diag.dernier),'| pièce 0 :',JSON.stringify((await dessin()).pieces[0]),'| mode actif :',await p.evaluate(()=>{const b=document.getElementById('glisserNom');return b&&b.getAttribute('aria-pressed')}),'| viewport',JSON.stringify(await p.evaluate(()=>[innerWidth,innerHeight,scrollY])));
  chk(nomOk,'nom glissé vers le bas : « etiquette » enregistrée (dy > 0)');
  const apres=await stable();
  chk(sansEtiq(apres.pieces[0])===sansEtiq(avant.pieces[0])&&JSON.stringify(apres.pieces.slice(1))===JSON.stringify(avant.pieces.slice(1)),'la pièce n’a pas bougé, les autres non plus : seul le nom a glissé');
  chk(await p.locator('#positionNom').count()===1,'la pièce reste sélectionnée après le glissement');

  /* un toucher sur le nom d'une pièce sélectionnée le renomme toujours (rien ne change pour le toucher) */
  const bn2=await vu(gn);
  await p.mouse.click(bn2.x+bn2.width/2,bn2.y+bn2.height/2);
  await p.waitForTimeout(400);
  chk((await dessin()).pieces[0].nom===nom0,'(un simple toucher n’a pas déplacé le nom ni changé la pièce)');

  await p.tap('#glisserNom');
  chk(await p.getAttribute('#glisserNom','aria-pressed')==='false','« ✋ Glisser le nom » éteint');
  /* glisser le nom d'une pièce NON sélectionnée : c'est la pièce qui glisse, comme avant */
  const b1=await vu(p.locator('.apercuDessin [data-piece-dessin]').first());
  await p.mouse.click(b1.x+b1.width/2,b1.y+b1.height*0.7);   // la désélectionne
  await p.waitForFunction(()=>!document.getElementById('positionNom'));
  const av2=await stable();
  const g2=p.locator('.apercuDessin [data-piece-dessin]').nth(2), bg=await vu(g2);
  await p.mouse.move(bg.x+bg.width/2,bg.y+bg.height/2);await p.mouse.down();await p.mouse.move(bg.x+bg.width/2+40,bg.y+bg.height/2+40,{steps:6});await p.mouse.up();
  const bouge=await (async()=>{for(let i=0;i<60;i++){const d=await dessin();if(JSON.stringify(d.pieces[2])!==JSON.stringify(av2.pieces[2]))return true;await p.waitForTimeout(100)}return false})();
  chk(bouge,'une pièce non sélectionnée glissée par son corps : c’est la pièce qui bouge (comportement inchangé)');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
