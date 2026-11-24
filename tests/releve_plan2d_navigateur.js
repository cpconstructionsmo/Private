/* Plan 2D lu par l'IA (relevé de visite, étape Scan) — Chromium au format
   iPhone, faux Supabase, plan et réponses FICTIFS :
   - « 🖼 Plan 2D » : l'image part à la fonction (décrire, mode plan), elle
     est gardée avec la visite ; deux parties lues : on choisit laquelle ;
   - le dessin rapide se remplit (pièces posées l'une contre l'autre), le
     plan d'origine reste visible ; « Créer le plan » ouvre le moteur ;
   - une image glissée sur le plan est passée à la visite et lue ;
   - un dessin existant : ajouter ou remplacer, au choix ; plusieurs
     esquisses d'un coup (une par pièce) s'ajoutent ;
   - fonction du serveur pas à jour : message clair. */
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
  const dialogues=[];p.removeAllListeners('dialog');p.on('dialog',d=>{dialogues.push(d.message());d.accept()});
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('.progres button[aria-label^="Étape 5 "]');

  /* serveur pas encore redéployé : l'ancienne fonction répond comme pour une photo */
  await repondre({legende:'Plan',constats:[]});
  const [c0]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#importerPlan2D')]);await c0.setFiles(PHOTO);
  await p.waitForFunction(()=>/pas à jour/.test((document.querySelector('#infoPlan2D')||{}).textContent||''));
  chk(true,'fonction du serveur pas à jour : « redéployez-la », rien n’est cassé');

  /* deux parties lues : on choisit */
  await repondre({parties:[
    {nom:'RDC état actuel',pieces:[{nom:'Cuisine',longueur:4.6,largeur:3.65,x:0,y:0,hauteur:2.3,ouvertures:[{type:'fenetre',cote:'haut',largeur:1.2,hauteur:1.95}],equipements:[{type:'radiateur',cote:'haut'}],projet:'futur cuisine'},{nom:'Salon',longueur:4.3,largeur:5.49,x:4.8,y:0,ouvertures:[{type:'porte',cote:'bas',largeur:0.9,hauteur:2.15,position:0.5}],equipements:[{type:'tableau',cote:'gauche'}],notes:'Mur à refaire',forme:'autre'},{nom:'Dépendance',longueur:4.8,largeur:5.5,x:9.6,y:0}]},
    {nom:'RDC projet',pieces:[{nom:'Séjour',longueur:9.3,largeur:5.5,x:0,y:0}]}],restant:95});
  const [c2]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#importerPlan2D')]);await c2.setFiles(PHOTO);
  await p.waitForSelector('#partiesPlan');
  const appel=await p.evaluate(()=>window.__etat.appels.filter(a=>a.nom==='imaginer').slice(-1)[0]);
  chk(appel.body.action==='decrire'&&appel.body.mode==='plan'&&appel.body.mime==='image/jpeg'&&appel.body.image.length>1000,'« Plan 2D » : l’image part à la fonction (décrire, mode plan)');
  chk(/RDC état actuel — 3 pièces, 67 m²/.test(await p.textContent('#partiesPlan'))&&/RDC projet — 1 pièce/.test(await p.textContent('#partiesPlan')),'deux plans sur l’image : on choisit lequel dessiner (pièces et surface annoncées)');
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});return L[0]&&Object.values(L[0].donnees.photos).some(x=>x.role==='planPapier'&&x.chemin)}),'l’image du plan est gardée avec la visite (espace privé)');
  chk(/Tout importer \(2 plans\)/.test(await p.textContent('#partiesPlan')),'« ＋ Tout importer » proposé quand l’image porte plusieurs plans');
  await p.tap('[data-partie="RDC état actuel"]');
  await p.waitForSelector('#ajouterPieceDessin');
  chk(await p.locator('[data-dessin]').count()===3&&/3 pièces lues sur le plan/.test(await p.textContent('main')),'le dessin rapide se remplit des 3 pièces lues, avec l’invitation à vérifier');
  /* lecture enrichie : portes et fenêtres, équipements, hauteur, notes et projet en rouge */
  chk(/Lu aussi : 2 portes et fenêtres, 2 équipements, 1 hauteur sous plafond, 2 notes/.test(await p.textContent('main')),'lecture enrichie annoncée : 2 portes et fenêtres, 2 équipements, 1 hauteur, 2 notes');
  await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const d=L[0]&&L[0].donnees.valeurs.dessin;return !!(d&&d.pieces&&d.pieces.length===3)});
  const DE=await p.evaluate(()=>{const L=Object.values(window.__etat.lignes||{});return L[0]&&L[0].donnees.valeurs.dessin});
  const cu=DE.pieces.find(x=>x.nom==='Cuisine'),sa=DE.pieces.find(x=>x.nom==='Salon');
  chk(cu.hauteur===2.3&&/Projet : futur cuisine/.test(cu.note)&&/Mur à refaire/.test(sa.note)&&/Forme à vérifier/.test(sa.note),'cuisine : HSP 2,30 et projet en note ; salon : « Mur à refaire » et forme à vérifier');
  const fe=DE.ouvertures.find(o=>o.piece===cu.id),po=DE.ouvertures.find(o=>o.piece===sa.id);
  chk(fe&&fe.type==='fenetre'&&fe.cote==='haut'&&fe.largeur===1.2&&fe.hauteur===1.95&&Math.abs(fe.position-1.7)<0.01&&po&&po.type==='porte'&&po.cote==='bas'&&po.position===0.5,'fenêtre 120/195 centrée en haut de la cuisine, porte 90/215 en bas du salon à 0,50 m');
  const ra=DE.symboles.find(x=>x.type==='radiateur'),te=DE.symboles.find(x=>x.type==='tableau');
  chk(ra&&ra.rot===0&&Math.abs(ra.y-0.08)<0.01&&te&&te.rot===270,'radiateur contre le mur du haut de la cuisine, tableau contre le mur gauche du salon (dos au mur)');
  await p.locator('[data-dessin] >> nth=0').locator('.rang').first().click();
  chk(await p.inputValue('textarea[name="dessin-note"]').then(t=>t.length>0).catch(()=>false)||await p.locator('textarea[name="dessin-note"]').count()===1,'la note se relit et se retouche dans la fiche de la pièce');
  chk(/3 pièces · 66,75 m²/.test(await p.textContent('main')),'surface du dessin : 66,75 m² (la dépendance alignée sur le salon : 5,50 → 5,49)');
  await p.tap('#planOrigine summary');
  await p.waitForSelector('#planOrigine img.imagePlanOrigine[src^="blob:"]');
  chk(true,'le plan d’origine reste visible sous le dessin, pour comparer');
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const d=L[0]&&L[0].donnees.valeurs.dessin;return !!(d&&d.pieces.length===3&&d.source&&d.source.partie==='RDC état actuel')}),'le dessin (et la partie lue) part avec la visite');
  await p.screenshot({path:SORTIE+'/releve_plan2d.png',fullPage:true});

  /* le plan, puis une image glissée dessus */
  await p.tap('#creerPlanDessin');
  await p.waitForSelector('#cadrePlan');
  const frame=await (async()=>{for(let i=0;i<80;i++){const f=p.frames().find(x=>/moteur\/index\.html/.test(x.url()));if(f&&await f.evaluate(()=>!!(window.__releve&&window.__releve.donnees())).catch(()=>false))return f;await p.waitForTimeout(100)}return null})();
  chk(!!frame&&await frame.evaluate(()=>window.__releve.donnees().pieces.length)===3,'« Créer le plan » : le moteur ouvre les 3 pièces');
  await repondre({parties:[{nom:'Plan',pieces:[{nom:'Garage',longueur:6,largeur:3,x:0,y:0}]}]});
  await frame.evaluate(b64=>{const bin=atob(b64),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
    const dt=new DataTransfer();dt.items.add(new File([a],'plan-magicplan.jpg',{type:'image/jpeg'}));window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}))},fs.readFileSync(PHOTO).toString('base64'));
  await p.waitForSelector('#choixPlacement',{timeout:20000});
  chk(/Un dessin rapide existe déjà \(3 pièces\)/.test(await p.textContent('#choixPlacement')),'une image glissée sur le plan est passée à la visite et lue ; un dessin existe : ajouter ou remplacer, au choix');
  await p.tap('#ajouterAuDessin');
  await p.waitForFunction(()=>document.querySelectorAll('[data-dessin]').length===4&&/Garage/.test(document.querySelector('main').textContent));
  chk(/ajoutée au dessin/.test(await p.textContent('main')),'« Ajouter au dessin » : le garage rejoint les 3 pièces, rien n’est perdu');
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const d=L[0]&&L[0].donnees.valeurs.dessin;return !!(d&&d.pieces.length===4&&d.ouvertures.length===2&&d.symboles.length===2)}),'« Ajouter au dessin » garde les portes, fenêtres et équipements déjà là');

  /* plusieurs esquisses d'un coup (une par pièce) */
  await p.tap('text=‹ Visite');
  await p.waitForSelector('#importerPlan2D');
  const nbAppels=await p.evaluate(()=>window.__etat.appels.filter(a=>a.nom==='imaginer').length);
  await repondre({parties:[{nom:'Esquisse',pieces:[{nom:'Chambre',longueur:3.2,largeur:3.5,x:0,y:0}]}]});
  const [c3]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#importerPlan2D')]);await c3.setFiles([PHOTO,PHOTO]);
  await p.waitForSelector('#choixPlacement',{timeout:20000});
  await p.tap('#ajouterAuDessin');
  await p.waitForFunction(()=>document.querySelectorAll('[data-dessin]').length===6);
  chk(await p.evaluate(n=>window.__etat.appels.filter(a=>a.nom==='imaginer').length===n+2,nbAppels)&&/2 pièces lues sur 2 esquisses/.test(await p.textContent('main')),'deux esquisses choisies ensemble : chacune est lue, leurs pièces s’ajoutent (6 pièces)');
  chk(!/se chevauchent/.test(await p.textContent('main')),'les pièces ajoutées se posent à côté, sans chevauchement : on les place ensuite au doigt');
  await p.tap('#planOrigine summary');
  chk(await p.locator('#planOrigine img.imagePlanOrigine').count()>=3,'les esquisses d’origine restent visibles sous le dessin');

  /* une esquisse avec rez-de-chaussée et mezzanine : « Tout importer » met la mezzanine sur son propre étage ; les doutes de l'IA sont dits */
  await p.tap('text=‹ Visite');
  await p.waitForSelector('#importerPlan2D');
  await repondre({parties:[{nom:'Rez-de-chaussée',doutes:['Pièce haute : largeur raturée (3,93 ou 3,13 ?)'],pieces:[{nom:'Pièce haute',longueur:3.64,largeur:5.69,x:0,y:0},{nom:'B – Pièce de vie',longueur:3.03,largeur:5.1,x:4,y:0},{nom:'B – WC',longueur:0.93,largeur:1.15,x:6.1,y:0}]},{nom:'Mezzanine',pieces:[{nom:'Mezzanine',longueur:2.69,largeur:3.2,x:0,y:0}]}]});
  const [c4]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#importerPlan2D')]);await c4.setFiles(PHOTO);
  await p.waitForSelector('#toutesPartiesPlan');
  await p.tap('#toutesPartiesPlan');
  await p.waitForSelector('#remplacerDessin');
  await p.tap('#remplacerDessin');
  await p.waitForFunction(()=>/propre étage/.test(document.querySelector('main').textContent));
  chk(/« Mezzanine » est posé sur son propre étage/.test(await p.textContent('main'))&&/À vérifier : Pièce haute : largeur raturée/.test(await p.textContent('main')),'« Tout importer » : la mezzanine va sur son étage ; le doute de l’IA (cote raturée) est dit');
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const d=L[0]&&L[0].donnees.valeurs.dessin;const mz=d&&d.pieces.find(x=>x.nom==='Mezzanine');
    return !!(mz&&mz.etage===1&&d.etages&&d.etages[1]==='Mezzanine'&&d.pieces.filter(x=>(x.etage||0)===0).length===3)}),'mezzanine à l’étage « Mezzanine », les 3 pièces du rez-de-chaussée en bas');
  chk(!/se chevauchent/.test(await p.textContent('main')),'le WC posé dans la pièce de vie (contre son mur) ne bloque pas : la pièce de vie est découpée autour');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
