/* Les outils de la copie annotée (relevé de visite) — Chromium bureau, souris, plan FICTIF :
   - un texte : couleur, taille au curseur et flèches de déplacement dans son panneau, aperçu en direct ;
   - le symbole « Fenêtre, porte… » posé d'un toucher, tourné, agrandi, déplacé, supprimé ;
   - l'outil ✋ Déplacer : une flèche se déplace d'un bloc. */
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
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:1000,height:1400},deviceScaleFactor:1,hasTouch:true});
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
  chk(await p.locator('[data-annoter-plan]').count()===0&&await p.locator('#plansCote').count()===0&&await p.locator('#ajouterPlan').count()===1,'sans plan : rien à annoter, mais « ＋ Ajouter un plan » est proposé');
  await repondre({parties:[{nom:'RDC',pieces:[{nom:'Salon',longueur:4.3,largeur:5.49,x:0,y:0}]}]});
  const [c2]=await Promise.all([p.waitForEvent('filechooser'),p.click('#importerPlan2D')]);await c2.setFiles(PHOTO);
  await p.waitForSelector('#ajouterPieceDessin');
  await p.click('text=‹ Visite');
  await p.waitForSelector('#blocAnnotations');
  chk(/Annoter une copie du plan importé/.test(await p.textContent('#blocAnnotations')),'un plan importé : « 🖍 Annoter une copie du plan importé »');
  await p.tap('[data-fond="planPapier"]');
  await p.waitForFunction(()=>{const c=document.querySelector('#toileAnnot');return c&&c.width>0});
  const boite=await p.locator('#toileAnnot').boundingBox(), X=f=>boite.x+boite.width*f, Y=f=>boite.y+boite.height*f;

  const mesurer=async()=>{Object.assign(boite,await p.locator('#toileAnnot').boundingBox())};
  const elems=()=>p.evaluate(()=>{const L=Object.values(window.__etat.lignes||{});const a=L[0]&&L[0].donnees.valeurs.annotations;return a&&a.elements||[]});
  const attendreEl=async f=>{for(let i=0;i<60;i++){const e=await elems();const r=f(e);if(r)return r;await p.waitForTimeout(100)}return null};
  const vide=await elems();

  /* ---- un texte : couleur, taille au curseur, flèches ---- */
  await p.click('[data-outil="texte"]');
  await p.mouse.click(X(.4),Y(.4));await p.waitForSelector('#panneauTexte:not([hidden])');
  chk(await p.locator('#panneauTexte [data-couleur-texte]').count()===4&&await p.locator('#tailleLibre').count()===1&&await p.locator('#bougerTexte button').count()===4,'le panneau du texte propose la couleur, la taille au curseur et des flèches de déplacement');
  await p.fill('textarea[name="texteAnnot"]','Isolation par l’extérieur');
  await p.click('#panneauTexte [data-couleur-texte="#2B9348"]');
  await p.evaluate(()=>{const c=document.getElementById('tailleLibre');c.value=6;c.dispatchEvent(new Event('input',{bubbles:true}))});
  await p.click('#bougerTexte [data-bouger="→"]');await p.click('#bougerTexte [data-bouger="↓"]');
  await p.click('#placerTexte');
  const t=await attendreEl(e=>e.find(x=>x.type==='texte'&&x.pt===6&&x.c==='#2B9348'));
  chk(!!t,'texte vert, taille 6 ‰ au curseur, enregistré');
  chk(t&&Math.abs(t.x-.41)<.005&&Math.abs(t.y-.41)<.005,'les flèches l’ont décalé de 1 % vers la droite et vers le bas');
  /* tirer le texte à la souris */
  const bx=X(.41)+10,by=Y(.41)+3;
  await p.mouse.move(bx,by);await p.mouse.down();await p.mouse.move(bx+boite.width*.2,by+boite.height*.1,{steps:6});await p.mouse.up();
  chk(!!await attendreEl(e=>{const q=e.find(x=>x.type==='texte');return q&&Math.abs(q.x-.61)<.03&&Math.abs(q.y-.51)<.03}),'tiré à la souris, le texte se déplace où on le lâche');

  /* ---- le symbole Fenêtre, porte… ---- */
  await p.click('[data-outil="symbole"]');
  chk(await p.locator('#paletteSymboles').isVisible()&&await p.locator('#paletteSymboles [data-symbole]').count()===5,'l’outil Symbole montre sa palette (fenêtre, porte, baie, ouverture, démolition)');
  await p.click('#paletteSymboles [data-symbole="porte"]');
  await mesurer();await p.mouse.click(X(.2),Y(.7));
  const sy=await attendreEl(e=>e.find(x=>x.type==='symbole'));
  chk(sy&&sy.s==='porte'&&Math.abs(sy.x-.2)<.01&&Math.abs(sy.y-.7)<.01&&await p.locator('#barreSel').isVisible(),'un toucher pose le symbole choisi, qui est aussitôt choisi (barre de réglage)');
  await p.click('#pivoterSel');
  chk(!!await attendreEl(e=>e.find(x=>x.type==='symbole'&&x.rot===90)),'« ⟳ Tourner d’un quart » le tourne');
  await p.click('#plusSel');
  chk(!!await attendreEl(e=>e.find(x=>x.type==='symbole'&&x.k>sy.k)),'« ＋ Plus grand » l’agrandit');
  await p.click('#barreSel [data-couleur-sel="#1F6FEB"]');
  chk(!!await attendreEl(e=>e.find(x=>x.type==='symbole'&&x.c==='#1F6FEB')),'et sa couleur se change');
  await mesurer();await p.mouse.move(X(.2),Y(.7));await p.mouse.down();await p.mouse.move(X(.3),Y(.6),{steps:6});await p.mouse.up();
  chk(!!await attendreEl(e=>e.find(x=>x.type==='symbole'&&Math.abs(x.x-.3)<.02&&Math.abs(x.y-.6)<.02)),'tiré, le symbole se déplace');
  await p.click('#paletteSymboles [data-symbole="fenetre"]');
  await mesurer();await p.mouse.click(X(.7),Y(.3));
  chk(!!await attendreEl(e=>e.filter(x=>x.type==='symbole').length===2),'une fenêtre se pose à côté (plusieurs symboles à la suite)');

  /* ---- ✋ Déplacer : une flèche d'un bloc ---- */
  await p.click('[data-outil="fleche"]');
  await mesurer();await p.mouse.move(X(.5),Y(.8));await p.mouse.down();await p.mouse.move(X(.6),Y(.85),{steps:5});await p.mouse.up();
  const f0=await attendreEl(e=>e.find(x=>x.type==='fleche'));
  await p.click('[data-outil="deplacer"]');
  await mesurer();await p.mouse.move(X(.55),Y(.825));await p.mouse.down();await p.mouse.move(X(.55)+boite.width*.1,Y(.825)-boite.height*.2,{steps:6});await p.mouse.up();
  chk(!!await attendreEl(e=>{const q=e.find(x=>x.type==='fleche');return q&&Math.abs(q.a[0]-f0.a[0]-.1)<.03&&Math.abs(q.a[1]-f0.a[1]+.2)<.03&&Math.abs((q.b[0]-q.a[0])-(f0.b[0]-f0.a[0]))<.01}),'l’outil ✋ Déplacer déplace une flèche d’un bloc (même longueur)');
  await p.click('#supprimerSel');
  chk(!!await attendreEl(e=>!e.some(x=>x.type==='fleche')),'« 🗑 Supprimer » retire l’élément choisi');
  await p.screenshot({path:SORTIE+'/releve_annotations_outils.png',fullPage:true});
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
