/* Le plan annoté (relevé de visite, étape Scan) — Chromium au format iPhone,
   faux Supabase, plan FICTIF :
   - un plan 2D importé : « 🖍 Annoter une copie du plan importé » ;
   - stylo, flèche, texte au doigt ; « ↶ Annuler » ; tout part avec la visite ;
   - en quittant, l'image annotée est refaite et affichée à côté du plan ;
   - en option dans le dossier client (décochée d'office) ;
   - le plan change : « Repartir du plan à jour » garde les annotations. */
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
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('.progres button[aria-label^="Étape 5 "]');
  chk(await p.locator('[data-annoter-plan]').count()===0&&await p.locator('#plansCote').count()===0&&await p.locator('#ajouterPlan').count()===1,'sans plan : rien à annoter, mais « ＋ Ajouter un plan » est proposé');
  await repondre({parties:[{nom:'RDC',pieces:[{nom:'Salon',longueur:4.3,largeur:5.49,x:0,y:0}]}]});
  const [c2]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#importerPlan2D')]);await c2.setFiles(PHOTO);
  await p.waitForSelector('#ajouterPieceDessin');
  await p.tap('text=‹ Visite');
  await p.waitForSelector('#blocAnnotations');
  chk(/Annoter une copie du plan importé/.test(await p.textContent('#blocAnnotations')),'un plan importé : « 🖍 Annoter une copie du plan importé »');
  await p.tap('[data-fond="planPapier"]');
  await p.waitForFunction(()=>{const c=document.querySelector('#toileAnnot');return c&&c.width>0});
  const boite=await p.locator('#toileAnnot').boundingBox(), X=f=>boite.x+boite.width*f, Y=f=>boite.y+boite.height*f;
  /* stylo */
  await p.mouse.move(X(.2),Y(.2));await p.mouse.down();for(let i=1;i<=10;i++)await p.mouse.move(X(.2+i*.03),Y(.2+i*.02));await p.mouse.up();
  /* flèche */
  await p.tap('[data-outil="fleche"]');
  await p.mouse.move(X(.6),Y(.6));await p.mouse.down();await p.mouse.move(X(.75),Y(.7),{steps:5});await p.mouse.up();
  /* texte (couleur bleue) */
  await p.tap('[data-couleur="#1F6FEB"]');await p.tap('[data-outil="texte"]');
  await p.mouse.click(X(.3),Y(.8));
  await p.waitForSelector('#panneauTexte:not([hidden])');
  chk(/Nouveau texte/.test(await p.textContent('#panneauTexte'))&&await p.isVisible('#panneauTexte .micro'),'outil Texte : un panneau s’ouvre (texte tapé ou dicté 🎤)');
  await p.fill('textarea[name="texteAnnot"]','Démolir / mur 50 cm');
  await p.tap('[data-taille="l"]');await p.tap('[data-police="gras"]');
  await p.tap('#placerTexte');
  await p.waitForFunction(()=>/1 trait, 1 flèche, 1 texte/.test(document.querySelector('#compteAnnot').textContent)&&document.querySelector('#panneauTexte').hidden);
  chk(true,'stylo, flèche et texte posés au doigt (« 1 trait, 1 flèche, 1 texte »)');
  chk(await attendre(p,async()=>true)&&await (async()=>{for(let i=0;i<50;i++){const a=await annot();if(a&&a.elements&&a.elements.length===3)return a.elements[2].t==='Démolir / mur 50 cm'&&a.elements[2].c==='#1F6FEB'&&a.elements[2].taille==='l'&&a.elements[2].police==='gras'&&a.elements[0].type==='trait'&&a.elements[0].p.length>=5;await p.waitForTimeout(100)}return false})(),
    'les annotations partent avec la visite (vecteurs : trait, flèche, texte bleu, grand, gras)');
  /* toucher le texte le reprend : modifier, puis la taille et le style suivent */
  await p.mouse.click(X(.3)+6,Y(.8)+4);
  await p.waitForSelector('#panneauTexte:not([hidden])');
  chk(/Modifier le texte/.test(await p.textContent('#panneauTexte'))&&await p.inputValue('textarea[name="texteAnnot"]')==='Démolir / mur 50 cm'&&await p.getAttribute('[data-taille="l"]','class')==='puce on','toucher un texte le reprend (texte, taille, style)');
  await p.fill('textarea[name="texteAnnot"]','Démolir le mur porteur');await p.tap('[data-police="manuscrit"]');await p.tap('#placerTexte');
  chk(await (async()=>{for(let i=0;i<50;i++){const a=await annot();if(a&&a.elements[2]&&a.elements[2].t==='Démolir le mur porteur')return a.elements[2].police==='manuscrit'&&a.elements.length===3;await p.waitForTimeout(100)}return false})(),'texte modifié sur place (police manuscrite), pas de doublon');
  /* zoom de la toile */
  await p.tap('#zoomPlus');
  chk(await p.getAttribute('.cadreZoomAnnot','data-zoom')==='1.50','« 🔍 ＋ » zoome la toile (×1,5)');
  await p.tap('[data-outil="trait"]');
  const bz=await p.locator('#toileAnnot').boundingBox();
  await p.mouse.move(bz.x+bz.width*.5,bz.y+bz.height*.5);await p.mouse.down();await p.mouse.move(bz.x+bz.width*.55,bz.y+bz.height*.52,{steps:5});await p.mouse.up();
  chk(await (async()=>{for(let i=0;i<50;i++){const a=await annot();if(a&&a.elements.length===4)return Math.abs(a.elements[3].p[0][0]-0.5)<0.03&&Math.abs(a.elements[3].p[0][1]-0.5)<0.03;await p.waitForTimeout(100)}return false})(),'zoomé, le trait se pose au bon endroit du plan');
  await p.tap('#zoomRaz');
  chk(await p.getAttribute('.cadreZoomAnnot','data-zoom')==='1.00','« ⟲ 100 % » revient à la taille normale');
  await p.tap('#annulerAnnot');
  await p.screenshot({path:SORTIE+'/releve_annoter.png',fullPage:true});
  await p.tap('[data-outil="texte"]');
  await p.mouse.click(X(.3)+6,Y(.8)+4);await p.waitForSelector('#panneauTexte:not([hidden])');
  await p.tap('#supprimerTexte');
  await p.waitForFunction(()=>/1 trait, 1 flèche$/.test(document.querySelector('#compteAnnot').textContent));
  chk(true,'« 🗑 Supprimer » retire le texte touché');
  await p.tap('[data-outil="texte"]');await p.mouse.click(X(.3),Y(.8));await p.waitForSelector('#panneauTexte:not([hidden])');
  await p.fill('textarea[name="texteAnnot"]','Démolir / mur 50 cm');await p.tap('#placerTexte');
  await p.waitForFunction(()=>/1 trait, 1 flèche, 1 texte/.test(document.querySelector('#compteAnnot').textContent));
  await p.tap('#annulerAnnot');
  await p.waitForFunction(()=>/1 trait, 1 flèche$/.test(document.querySelector('#compteAnnot').textContent));
  chk(true,'« ↶ Annuler » retire la dernière annotation');
  /* en quittant : l'image annotée, à côté du plan */
  await p.tap('#terminerAnnot');
  await p.waitForSelector('#blocAnnotations');
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const d=L[0]&&L[0].donnees,a=d&&d.valeurs.annotations;return !!(a&&a.imageId&&d.photos[a.imageId]&&d.photos[a.imageId].role==='planAnnote'&&d.photos[a.imageId].chemin)},15000),
    'en quittant, l’image du plan annoté est refaite et part sur le serveur');
  await p.waitForFunction(()=>document.querySelectorAll('#blocAnnotations [data-plan-detail] img.vignettePlan').length===2);
  /* télécharger pour faire analyser : l'image annotée et la liste des textes */
  await p.waitForFunction(()=>{const a=document.querySelector('[data-dl="image"]');return a&&/^blob:/.test(a.getAttribute('href')||'')});
  const dl=await p.evaluate(async()=>{const t=document.querySelector('[data-dl="texte"]');return {texte:await (await fetch(t.href)).text(),nom:t.download,img:document.querySelector('[data-dl="image"]').download}});
  chk(/annotations_/.test(dl.nom)&&/\.txt$/.test(dl.nom)&&/\.jpg$/.test(dl.img)&&/1 trait, 1 flèche/.test(dl.texte),'« ⬇ Image annotée » et « ⬇ Liste des annotations » : liens réels, le texte résume les annotations');
  chk(/Copie annotée · 1 trait, 1 flèche/.test(await p.textContent('#blocAnnotations'))&&/Continuer les annotations/.test(await p.textContent('#blocAnnotations')),'le plan et sa copie annotée côte à côte, « Continuer les annotations »');
  /* dans le dossier client : en option, décochée d'office */
  await p.tap('.progres button[aria-label^="Étape 7 "]');
  await p.tap('#ouvrirDossier');await p.waitForSelector('.dossier .feuille');
  chk(!(await p.isChecked('input[name="opt-planAnnote"]'))&&!/travaux envisagés sur le plan/.test(await p.textContent('.dossier')),'dossier client : le plan annoté n’y est pas d’office');
  await p.check('input[name="opt-planAnnote"]');
  await p.waitForFunction(()=>/travaux envisagés sur le plan/.test(document.querySelector('.dossier').textContent));
  await p.waitForSelector('.dossier img.planDossier');
  chk(true,'option « Plan annoté (travaux) » cochée : une page « Les travaux envisagés sur le plan » avec l’image annotée');
  await p.tap('text=‹ Visite');
  await p.tap('.progres button[aria-label^="Étape 5 "]');
  await p.waitForSelector('#blocAnnotations');

  /* le plan change : repartir du plan à jour, annotations gardées */
  await repondre({parties:[{nom:'RDC',pieces:[{nom:'Salon',longueur:4.3,largeur:5.5,x:0,y:0}]}]});
  const [c3]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#importerPlan2D')]);await c3.setFiles(PHOTO);
  await p.waitForSelector('#choixPlacement');await p.tap('#choixPlacement >> text=Annuler');
  const fondAvant=(await annot()).fondId;
  await p.tap('#annoterPlan');
  await p.waitForSelector('#planChange');
  await p.tap('#planChange button');
  await p.waitForFunction(()=>document.querySelector('#toileAnnot')&&!document.querySelector('#planChange'));
  const a2=await (async()=>{for(let i=0;i<50;i++){const a=await annot();if(a&&a.fondId!==fondAvant)return a;await p.waitForTimeout(100)}return null})();
  chk(!!a2&&a2.elements.length===2,'le plan a changé : « Repartir du plan à jour » change le fond et garde les annotations');

  /* supprimer la copie annotée : confirmation, puis le plan reste et on peut en refaire une */
  await p.tap('#terminerAnnot');
  await p.waitForSelector('#supprimerCopieAnnotee');
  const avantSupp=await annot();
  p.removeAllListeners('dialog');p.on('dialog',d=>d.dismiss());
  await p.tap('#supprimerCopieAnnotee');await p.waitForTimeout(500);
  chk(await p.locator('#supprimerCopieAnnotee').count()===1&&(await annot()).elements.length===avantSupp.elements.length,'confirmation refusée : la copie annotée et ses annotations restent');
  p.removeAllListeners('dialog');p.on('dialog',d=>{if(!/Supprimer la copie annotée/.test(d.message()))console.log('  (boîte inattendue : '+d.message().slice(0,60)+')');d.accept()});
  await p.tap('#supprimerCopieAnnotee');
  await p.waitForFunction(()=>!document.getElementById('supprimerCopieAnnotee'));
  chk(!/Copie annotée/.test(await p.textContent('#blocAnnotations')),'confirmation acceptée : la copie annotée disparaît de l’écran');
  chk(await p.locator('#blocAnnotations [data-plan-detail] img.vignettePlan').count()===1,'le plan, lui, reste');
  chk(await p.locator('#blocAnnotations button[data-fond]').count()>=1&&/Annoter une copie/.test(await p.textContent('#blocAnnotations')),'« Annoter une copie… » revient pour en refaire une');
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const a=L[0]&&L[0].donnees.valeurs.annotations;return !!a&&!a.fondId&&!a.imageId&&(!a.elements||a.elements.length===0)}),'la suppression part avec la visite (plus d’annotations ni de fond)');
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const ph=Object.values(L[0].donnees.photos||{});return ph.filter(x=>x.role==='fondAnnote'||x.role==='planAnnote').every(x=>x.supprime)}),'les photos de la copie sont notées supprimées (jamais celles du plan)');
  await p.tap('.progres button[aria-label^="Étape 7 "]');await p.tap('#ouvrirDossier');await p.waitForSelector('.dossier .feuille');
  chk(/aucun plan annoté pour l’instant/.test(await p.textContent('.outilsDossier'))&&!/travaux envisagés sur le plan/.test(await p.textContent('.dossier')),'le dossier client n’a plus de page « Les travaux envisagés sur le plan »');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
