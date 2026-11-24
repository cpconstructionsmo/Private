/* Le dessin rapide complet (relevé de visite) — Chromium au format iPhone,
   faux Supabase : pièce glissée au doigt et aimantée au mur voisin, portes
   et fenêtres sur un côté, symboles (radiateur, trémie d'escalier), étage,
   toiture, zoom ; « Créer le plan » : le moteur reçoit étages, ouvertures,
   symboles et toiture, et les accepte. */
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
  const p=await ctx.newPage();p.setDefaultTimeout(15000);const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));let reponse=null;p.on('dialog',d=>{const r=reponse;reponse=null;d.accept(r==null?undefined:r)});
  const dessin=()=>p.evaluate(()=>{const L=Object.values(window.__etat.lignes||{});return L[0]&&L[0].donnees.valeurs.dessin});
  const attendreDessin=async f=>{for(let i=0;i<80;i++){const d=await dessin();if(d&&f(d))return d;await p.waitForTimeout(100)}return null};
  const ecran=(x,y)=>p.evaluate(([x,y])=>{const s=document.querySelector('svg.apercuDessin'),m=s.getScreenCTM(),q=s.createSVGPoint();q.x=x;q.y=y;const r=q.matrixTransform(m);return [r.x,r.y]},[x,y]);
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('.progres button[aria-label^="Étape 5 "]');
  await p.tap('#dessinRapide');
  await p.tap('#ajouterPieceDessin');
  await p.fill('input[name="dessin-longueur"]','5');await p.locator('input[name="dessin-longueur"]').press('Enter');
  await p.waitForFunction(()=>/5 × 3 m/.test(document.querySelector('[data-dessin]').textContent));
  await p.fill('input[name="dessin-largeur"]','4');await p.locator('input[name="dessin-largeur"]').press('Enter');
  await p.waitForFunction(()=>/5 × 4 m/.test(document.querySelector('[data-dessin]').textContent));
  /* une 2e pièce : posée à côté, puis glissée au doigt contre le séjour */
  await p.tap('#ajouterPieceDessin');
  let d=await attendreDessin(d=>d.pieces.length===2);
  chk(d.pieces[1].libre&&d.pieces[1].libre.x===5.5&&/Glissez « Pièce 2 » à sa place/.test(await p.textContent('main')),'« ＋ Ajouter une pièce » : posée à côté, invitation à la glisser');
  await p.evaluate(()=>window.scrollTo(0,0));await p.locator('svg.apercuDessin').scrollIntoViewIfNeeded();
  const [ax,ay]=await ecran(7,1.5), [bx,by]=await ecran(6.62,1.65);
  await p.mouse.move(ax,ay);await p.mouse.down();await p.mouse.move((ax+bx)/2,(ay+by)/2,{steps:3});await p.mouse.move(bx,by,{steps:3});await p.mouse.up();
  d=await attendreDessin(d=>d.pieces[1].libre&&d.pieces[1].libre.x!==5.5);
  chk(d&&d.pieces[1].libre.x===5&&d.pieces[1].libre.y===0,'glissée près du séjour : elle s’aimante contre son mur (x = 5) et s’aligne en haut (y = 0)');
  /* aimant coupé : la pièce reste exactement où on la lâche (au pas de 5 cm), même tout près d'un mur */
  const glisser=async(x0,y0,x1,y1)=>{const [a1,a2]=await ecran(x0,y0),[b1,b2]=await ecran(x1,y1);await p.mouse.move(a1,a2);await p.mouse.down();await p.mouse.move((a1+b1)/2,(a2+b2)/2,{steps:3});await p.mouse.move(b1,b2,{steps:3});await p.mouse.up();};
  chk((await p.textContent('#aimantDessin')).includes('oui'),'« 🧲 Aimant : oui » d’office');
  await p.click('#aimantDessin');
  chk((await p.textContent('#aimantDessin')).includes('non')&&await p.evaluate(()=>localStorage.getItem('cp-releve-aimant'))==='non','un toucher coupe l’aimant (réglage gardé sur l’appareil)');
  await glisser(6.5,1.5,6.7,1.65);
  d=await attendreDessin(d=>d.pieces[1].libre.x!==5);
  chk(d&&Math.abs(d.pieces[1].libre.x-5.2)<0.051&&Math.abs(d.pieces[1].libre.y-0.15)<0.051,'sans aimant, lâchée à 20 cm du séjour : elle y reste ('+(d&&d.pieces[1].libre.x)+' ; '+(d&&d.pieces[1].libre.y)+')');
  await p.click('#aimantDessin');
  await glisser(6.7,1.65,6.5,1.5);
  d=await attendreDessin(d=>d.pieces[1].libre.x===5&&d.pieces[1].libre.y===0);
  chk(!!d,'aimant remis : elle revient se coller au séjour');
  /* une fenêtre en haut du séjour, une porte à gauche de la pièce 2 (mur commun) */
  await p.tap('[data-dessin] >> nth=0');
  await p.tap('[data-ajout-ouverture="fenetre"]');
  await p.waitForSelector('[data-ouv]');
  await p.tap('[data-ouv] [data-cote="haut"]');
  await p.tap('[data-dessin] >> nth=1');
  await p.waitForSelector('[data-dessin]:nth-of-type(2).sel, .pieceDessin.sel');
  await p.locator('.pieceDessin.sel [data-ajout-ouverture="porte"]').tap();
  await p.locator('.pieceDessin.sel [data-ouv] [data-cote="gauche"]').tap();
  d=await attendreDessin(d=>d.ouvertures.length===2&&d.ouvertures[1].cote==='gauche');
  chk(d.ouvertures[0].type==='fenetre'&&d.ouvertures[0].cote==='haut'&&d.ouvertures[1].type==='porte','fenêtre en haut du séjour, porte à gauche de la pièce 2 ; elles se voient sur l’aperçu');
  chk(await p.locator('svg.apercuDessin [data-ouverture]').count()===2,'les ouvertures se dessinent sur l’aperçu');
  /* symboles */
  await p.tap('[data-dessin] >> nth=0');
  await p.tap('[data-ajout-symbole="radiateur"]');
  await p.waitForSelector('#tournerSymbole');
  await p.tap('#tournerSymbole');
  await p.tap('[data-ajout-symbole="escalier"]');
  await p.waitForSelector('input[name="symbole-l"]');
  await p.fill('input[name="symbole-l"]','3');await p.locator('input[name="symbole-l"]').press('Enter');
  d=await attendreDessin(d=>d.symboles.length===2&&d.symboles[1].l===3);
  chk(d.symboles[0].type==='radiateur'&&d.symboles[0].rot===90&&d.symboles[1].type==='escalier'&&d.symboles[1].w===0.9,'radiateur tourné d’un quart, trémie d’escalier de 3 × 0,90 m');
  chk(await p.locator('svg.apercuDessin [data-symbole]').count()===2,'les symboles se dessinent sur l’aperçu');
  /* une pièce glissée emporte ses symboles (le radiateur suit le séjour), puis revient */
  const rx0=d.symboles[0].x;
  await p.locator('svg.apercuDessin').scrollIntoViewIfNeeded();
  await glisser(1,3.2,0,3.2);
  d=await attendreDessin(d=>d.pieces[0].libre&&d.pieces[0].libre.x===-1);
  chk(d&&Math.abs(d.symboles[0].x-(rx0-1))<0.011,'séjour glissé de 1 m : son radiateur le suit');
  await p.locator('svg.apercuDessin').scrollIntoViewIfNeeded();
  await glisser(0,3.2,1,3.2);
  d=await attendreDessin(d=>d.pieces[0].libre&&d.pieces[0].libre.x===0);
  chk(d&&Math.abs(d.symboles[0].x-rx0)<0.011,'remis en place (aimanté contre la pièce 2) : le radiateur aussi');
  /* sur le dessin même : toucher une cote ou le nom pour la changer, glisser le nom s'il cache une cote */
  chk(await p.locator('#creerPlanDessinHaut').count()===1&&/Créer le plan 2D coté et la 3D/.test(await p.textContent('#etapePlan')),'« ✓ Créer le plan 2D coté et la 3D » visible en haut du dessin');
  await p.locator('svg.apercuDessin').scrollIntoViewIfNeeded();
  reponse='3,5';
  await p.locator('[data-piece-dessin="'+d.pieces[1].id+'"] [data-edit="largeur"]').click();
  d=await attendreDessin(d=>d.pieces[1].largeur===3.5);
  chk(!!d,'un toucher sur la cote de la pièce 2 : saisie sur place (3,50 m)');
  reponse='3';
  await p.locator('[data-piece-dessin="'+d.pieces[1].id+'"] [data-edit="largeur"]').click();
  d=await attendreDessin(d=>d.pieces[1].largeur===3);
  if(!(await p.locator('[data-dessin="'+d.pieces[1].id+'"].sel').count()))await p.locator('[data-dessin="'+d.pieces[1].id+'"] .rang').first().click();
  await p.waitForSelector('[data-dessin="'+d.pieces[1].id+'"].sel');
  reponse='Salon';
  await p.locator('[data-piece-dessin="'+d.pieces[1].id+'"] [data-edit="nom"] text').first().click();
  d=await attendreDessin(d=>d.pieces[1].nom==='Salon');
  chk(!!d,'un toucher sur le nom : il se renomme sur place');
  const lib0=JSON.stringify(d.pieces[1].libre||null);
  for(let k=0;k<4;k++)await p.tap('[data-nom-vers="droite"]');
  await p.tap('[data-nom-vers="bas"]');
  d=await attendreDessin(d=>d.pieces[1].etiquette&&d.pieces[1].etiquette.dx===1&&d.pieces[1].etiquette.dy===0.25);
  chk(d&&JSON.stringify(d.pieces[1].libre||null)===lib0,'« Position du nom » : le nom décalé de 1 m à droite et 25 cm en bas, la pièce ne bouge pas');
  /* un étage */
  await p.tap('#ajouterEtage');
  await p.waitForFunction(()=>document.querySelector('[data-etage="1"]')&&document.querySelector('[data-etage="1"]').classList.contains('on'));
  await p.tap('#ajouterPieceDessin');
  d=await attendreDessin(d=>d.pieces.length===3);
  chk(d.pieces[2].etage===1&&d.etages[1]==='Étage 1'&&await p.locator('[data-dessin]').count()===1,'« ＋ Étage » : la nouvelle pièce est à l’étage ; seules ses pièces se listent');
  /* toiture et zoom */
  await p.tap('[data-toiture="2pentes"]');
  d=await attendreDessin(d=>d.toiture&&d.toiture.type==='2pentes');
  chk(d.toiture.angle===35,'toiture 2 pentes (35° par défaut)');
  await p.tap('#zoomDessinPlus');
  chk(await p.getAttribute('.cadreZoomDessin','data-zoom')==='1.50','« 🔍 ＋ » zoome l’aperçu');
  /* dézoomer au-delà de 100 % : plus de place autour des pièces, le dessin n'est pas rapetissé dans un coin */
  await p.tap('#zoomDessinRaz');
  const vb0=(await p.getAttribute('svg.apercuDessin','viewBox')).split(' ').map(Number);
  await p.tap('#zoomDessinMoins');await p.tap('#zoomDessinMoins');await p.tap('#zoomDessinMoins');
  const vb1=(await p.getAttribute('svg.apercuDessin','viewBox')).split(' ').map(Number);
  chk(await p.getAttribute('.cadreZoomDessin','data-zoom')==='0.30'&&Math.abs(vb1[2]/vb0[2]-3.375)<0.01&&(await p.textContent('#niveauZoomDessin'))==='30 %','« 🔍 − » sous 100 % : la zone de dessin s’agrandit autour des pièces (30 %, 3,4 fois plus de place)');
  await p.tap('[data-toiture="2pentes"]');await p.waitForTimeout(300);
  chk((await p.getAttribute('.cadreZoomDessin','data-zoom'))==='0.30'&&(await p.textContent('#niveauZoomDessin'))==='30 %','l’écran redessiné garde le dézoom (on continue de poser)');
  for(let i=0;i<8;i++)await p.tap('#zoomDessinMoins');
  chk((await p.textContent('#niveauZoomDessin'))==='13 %','dézoom borné (13 % : 8 fois la place)');
  await p.tap('#zoomDessinRaz');
  chk((await p.textContent('#niveauZoomDessin'))==='100 %','« ⟲ 100 % » revient au cadrage normal');
  await p.screenshot({path:SORTIE+'/releve_dessin_complet.png',fullPage:true});
  /* le plan : le moteur reçoit tout et l'accepte */
  await p.tap('#creerPlanDessin');
  await p.waitForSelector('#cadrePlan');
  const frame=await (async()=>{for(let i=0;i<80;i++){const f=p.frames().find(x=>/moteur\/index\.html/.test(x.url()));if(f&&await f.evaluate(()=>!!(window.__releve&&window.__releve.donnees())).catch(()=>false))return f;await p.waitForTimeout(100)}return null})();
  chk(!!frame,'« Créer le plan » ouvre le moteur sans erreur');
  const M=frame&&await frame.evaluate(()=>{const m=window.__releve.analyser(window.__releve.donnees());return {etages:m.etages.length,ouv:m.openings.length,sym:m.symboles.length,toits:m.toits.length,types:m.openings.map(o=>o.type).join()}});
  chk(M&&M.etages===2&&M.ouv===2&&M.sym===2&&M.toits===1&&M.types==='fenetre,porte','le moteur : 2 étages, 2 ouvertures (fenêtre, porte), 2 symboles, 1 toiture');
  chk(await frame.evaluate(()=>{const p=window.__releve.donnees().pieces.find(x=>x.nom==='Salon');return !!(p&&p.etiquette&&Math.abs(p.etiquette.dx-1)<0.06)}),'le nom déplacé dans le dessin le reste dans le plan coté');
  /* la 3D : l'escalier monte à l'étage, le plancher du dessus est percé, le radiateur est un volume */
  const V=frame&&await frame.evaluate(()=>{const v=window.__releve.v3d();if(!v.ok)return {ok:false};
    v.construire(window.__releve.analyser(window.__releve.donnees()));
    let marches=0,volumes=0,sols=0;v.group.traverse(o=>{if(o.isMesh&&o.material&&o.material.color){const h=o.material.color.getHex();if(h===0xc8a27a)marches++;if(h===0xf8fafc)volumes++;}});
    return {ok:true,marches,volumes}});
  if(V&&V.ok)chk(V.marches>=12&&V.volumes===1,'vue 3D : escalier en marches jusqu’à l’étage ('+V.marches+' marches), radiateur en volume');
  else chk(true,'vue 3D indisponible dans ce navigateur de test (WebGL) : vérification sautée');
  /* les 23 symboles d'un coup : dessinés en DXF (calque EQUIPEMENTS) et en 3D, sans erreur */
  const TOUS=frame&&await frame.evaluate(()=>{
    const types=['radiateur','chaudiere','cumulus','poele','wc','lavabo','douche','baignoire','evier','plaque','frigo','lave_vaisselle','lave_linge','plan_travail','tableau','prise','interrupteur','lumiere','vmc','lit','canape','table','escalier'];
    const d=JSON.parse(JSON.stringify(window.__releve.donnees()));d.symboles=types.map((t,i)=>({id:'t'+i,type:t,etage:0,x:1+(i%5),y:1+Math.floor(i/5),rot:(i%4)*90}));
    const M=window.__releve.analyser(d);return window.__releve.dxf(M).text().then(txt=>{
      const v=window.__releve.v3d();let n3=null;if(v.ok){v.construire(M);n3=0;v.group.traverse(o=>{if(o.isMesh)n3++})}
      const N=window.__releve.nomenclature(M);
      return {tot:N.totaux.reduce((a,x)=>a+x[1],0),ordre:N.totaux.map(x=>x[0]).slice(0,3).join(),n:M.symboles.length,eq:(txt.match(/\nEQUIPEMENTS\r?\n/g)||[]).length,n3}})});
  chk(TOUS&&TOUS.tot===23&&TOUS.ordre==='radiateur,chaudiere,cumulus','tableau des équipements : les 23 comptés, rangés par famille (chauffage d’abord)');
  chk(TOUS&&TOUS.n===23&&TOUS.eq>60,'les 23 symboles (électricité, cuisine, mobilier…) se dessinent dans le DXF ('+(TOUS&&TOUS.eq)+' éléments au calque EQUIPEMENTS)');
  if(TOUS&&TOUS.n3!=null)chk(TOUS.n3>40,'et se construisent en 3D ('+TOUS.n3+' volumes)');
  if(frame){await frame.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Rez-de-chaussée|RDC/.test(x.textContent));if(b)b.click()}).catch(()=>{});await p.waitForTimeout(800);await frame.evaluate(()=>document.getElementById('plan').scrollIntoView());await p.waitForTimeout(500);await frame.locator('#plan').screenshot({timeout:30000,path:SORTIE+'/releve_moteur_symboles.png'});}
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
