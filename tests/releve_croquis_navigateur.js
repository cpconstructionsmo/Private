/* Relevé de visite — le mode « ✏️ Croquis » du dessin rapide : on trace au doigt, le tracé devient une pièce aux murs droits.
   Par défaut : Chromium au format iPhone, VRAIS événements tactiles (CDP : touchStart / touchMove / touchEnd, donc Pointer Events de
   type « touch »). Avec SOURIS=1 : Chromium de bureau, vraie souris (clic gauche pour tracer ; clic droit, molette, Ctrl+Z).
   Faux Supabase, pièces FICTIVES. */
const SOURIS=!!process.env.SOURIS;
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
  const ctx=await b.newContext(SOURIS?{serviceWorkers:'block',viewport:{width:1280,height:900},deviceScaleFactor:1}:{serviceWorkers:'block',viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  await ctx.route('**/*',async r=>{const u=r.request().url();
    if(/supabase-js/.test(u))return r.fulfill({body:BIBLIO,contentType:'text/javascript'});
    const m=u.match(/^https:\/\/app\.local\/([^?#]*)/);
    if(m){let f=path.join(R,decodeURIComponent(m[1]));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
      if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f,contentType:/\.js$/.test(f)?'text/javascript':/\.html$/.test(f)?'text/html':undefined});
      return r.fulfill({status:404,body:''})}
    if(/geo\.api\.gouv\.fr\/communes\?codePostal=61000/.test(u))return r.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify([{nom:'Alençon'}])});
    if(/geo\.api\.gouv\.fr\/communes\?codePostal=53100/.test(u))return r.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify([{nom:'Mayenne'},{nom:'Aron'},{nom:'Moulay'}])});
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();if(SOURIS)p.tap=(s,o)=>p.click(s,o);p.setDefaultTimeout(15000);const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('dialog',d=>d.accept());
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const cdp=await ctx.newCDPSession(p);
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('.progres button[aria-label^="Étape 5 "]');
  await p.tap('#dessinRapide');
  await p.waitForSelector('#croquisDessin');

  /* --- outillage : un tracé du doigt, en mètres du plan, converti en pixels de l'écran à l'instant du tracé --- */
  let g=4242;const alea=()=>{g=(g*1103515245+12345)&0x7fffffff;return g/0x7fffffff-0.5};
  const versEcran=async pts=>p.evaluate(pts=>{document.querySelector('.cadreZoomDessin').scrollIntoView({block:'center'});const svg=document.querySelector('svg.apercuDessin'),m=svg.getScreenCTM();return pts.map(([x,y])=>{const q=svg.createSVGPoint();q.x=x;q.y=y;const r=q.matrixTransform(m);return [r.x,r.y]})},pts);
  const toucher=SOURIS?async(type,pts)=>{const [x,y]=pts[0]||[0,0];if(type==='touchStart'){await p.mouse.move(x,y);await p.mouse.down()}else if(type==='touchMove')await p.mouse.move(x,y);else await p.mouse.up()}
    :async(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y],i)=>({x,y,id:i+1,radiusX:2,radiusY:2,force:0.5}))});
  const tracer=async(contour,{bruit=0.03,ferme=true,pas=0.06}={})=>{   // contour en mètres : parcouru à pas de 6 cm, tremblant
    const P=ferme?contour.concat([contour[0]]):contour,mes=[];
    for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let s=0;s<L;s+=pas){const t=s/L;mes.push([a[0]+(b[0]-a[0])*t+alea()*2*bruit,a[1]+(b[1]-a[1])*t+alea()*2*bruit])}}
    if(ferme)mes.push([P[0][0]+0.12,P[0][1]+0.1]);else mes.push(P[P.length-1]);
    const E=await versEcran(mes);
    await toucher('touchStart',[E[0]]);for(let i=1;i<E.length;i++)await toucher('touchMove',[E[i]]);await toucher('touchEnd',[]);
    await p.waitForTimeout(250);};
  const etat=()=>p.evaluate(()=>{const L=Object.values(window.__etat.lignes||{});return L[0]?L[0].donnees.valeurs.dessin:null});
  const attendreDessin=async f=>attendre(p,f,8000);
  const aire=poly=>Math.abs(poly.reduce((t,q,i)=>{const n=poly[(i+1)%poly.length];return t+q[0]*n[1]-n[0]*q[1]},0))/2;

  await p.tap('#croquisDessin');
  await p.waitForSelector('.cadreZoomDessin.modeCroquis');
  if(process.env.TEST_SANS_TOUCH_ACTION)await p.addStyleTag({content:'*,*::before,*::after{touch-action:auto!important}'});   // contre-épreuve : sans la protection, le test doit échouer
  chk(await p.locator('#barreCroquis').count()===1&&await p.getAttribute('#croquisDessin','aria-pressed')==='true','« ✏️ Croquis » : le mode est actif, la barre d’outils apparaît');
  chk(await p.evaluate(()=>getComputedStyle(document.querySelector('.cadreZoomDessin')).touchAction)==='none','pendant le dessin : touch-action: none sur le cadre (pas de défilement ni de zoom du navigateur)');

  /* 1. un rectangle à main levée */
  await tracer([[1,1],[7,1],[7,5],[1,5]]);
  await p.waitForSelector('[data-piece-forme]');
  const nPts=await p.evaluate(()=>document.querySelector('[data-piece-forme]').getAttribute('points').trim().split(/\s+/).length);
  chk(nPts===4,'un rectangle tracé à main levée devient une pièce à 4 murs ('+nPts+')');
  /* l'état de la visite côté serveur (la synchro part ~1,5 s après la saisie) */
  const dessinSync=async cond=>{let d=null;await attendre(p,()=>true);for(let i=0;i<60;i++){d=await etat();if(d&&cond(d))return d;await p.waitForTimeout(150)}return d};
  let d1=await dessinSync(d=>d.pieces.length===1);
  chk(d1&&d1.pieces.length===1&&d1.pieces[0].poly.length===4&&d1.pieces[0].croquis===true,'la pièce est gardée avec la visite : 4 sommets, marquée « croquis »');
  const murs=poly=>poly.map((a,i)=>{const b=poly[(i+1)%poly.length];return [Math.abs(b[0]-a[0])<1e-9,Math.abs(b[1]-a[1])<1e-9]});
  chk(murs(d1.pieces[0].poly).every(([v,h])=>v||h),'tous les murs sont exactement horizontaux ou verticaux');

  /* 2. la mise à l'échelle : « Quelle est la longueur de ce mur ? » */
  chk(await p.locator('#echelleMur').count()===1&&await p.locator('[data-mur-echelle]').count()===1,'après le 1er croquis : « Quelle est la longueur de ce mur ? », le mur est surligné en rouge');
  const A0=aire(d1.pieces[0].poly),mx=Math.max(...[0,1,2,3].map(i=>{const a=d1.pieces[0].poly[i],b=d1.pieces[0].poly[(i+1)%4];return Math.hypot(b[0]-a[0],b[1]-a[1])}));
  await p.fill('input[name="echelle-mur"]','5');await p.locator('input[name="echelle-mur"]').press('Enter');
  await p.waitForFunction(()=>/^5(,0+)?$/.test(document.querySelector('input[name="echelle-mur"]').value.trim()));
  await p.tap('#echelleValider');
  await p.waitForFunction(()=>!document.querySelector('#echelleMur'));
  const d2=await dessinSync(d=>d.croquisEchelle===true);
  const f=5/mx;
  chk(d2&&d2.croquisEchelle===true&&Math.abs(aire(d2.pieces[0].poly)-A0*f*f)<0.1,'mise à l’échelle : le mur de '+mx.toFixed(2)+' m passe à 5 m, la surface suit ('+A0.toFixed(1)+' → '+(d2?aire(d2.pieces[0].poly).toFixed(1):'?')+' m²)');
  chk(/m² · 4 murs/.test(await p.textContent('.pieceDessin')),'la fiche de la pièce annonce sa surface et ses 4 murs');
  const bb=poly=>({x0:Math.min(...poly.map(q=>q[0])),y0:Math.min(...poly.map(q=>q[1])),x1:Math.max(...poly.map(q=>q[0])),y1:Math.max(...poly.map(q=>q[1]))});
  const A=bb(d2.pieces[0].poly);

  /* 3. deux pièces côte à côte se collent */
  await tracer([[A.x1+0.18,A.y0+0.1],[A.x1+3.4,A.y0-0.06],[A.x1+3.4,A.y1+0.08],[A.x1+0.18,A.y1-0.1]]);
  const d3=await dessinSync(d=>d.pieces.length===2);
  const B=d3&&d3.pieces[1]&&bb(d3.pieces[1].poly);
  chk(d3&&d3.pieces.length===2&&B.x0===A.x1&&B.y0===A.y0&&B.y1===A.y1,'2e pièce tracée à 18 cm de la 1re : son mur gauche se colle au mur droit de la 1re (x = '+A.x1+'), haut et bas alignés');
  chk(await p.locator('#erreursDessin').count()===0,'aucune erreur de chevauchement entre les deux pièces');

  /* 4. une forme en L devient une pièce à 6 murs */
  const ox=A.x0,oy=A.y1+1.2;
  await tracer([[ox,oy],[ox+5,oy],[ox+5,oy+2],[ox+2.6,oy+2],[ox+2.6,oy+4.2],[ox,oy+4.2]]);
  const d4=await dessinSync(d=>d.pieces.length===3);
  chk(d4&&d4.pieces.length===3&&d4.pieces[2].poly.length===6,'une forme en L tracée au doigt devient une pièce à 6 murs ('+(d4&&d4.pieces[2]&&d4.pieces[2].poly.length)+')');
  chk(d4&&murs(d4.pieces[2].poly).every(([v,h])=>v||h),'la pièce en L a tous ses murs droits');
  chk(/m² · 6 murs/.test(await p.textContent('main')),'la fiche annonce « 6 murs » avec sa surface');

  /* 5. trait court sur un mur : porte, avec le menu Porte / Fenêtre / Baie */
  await p.tap('.progres button[aria-label^="Étape 5 "]').catch(()=>{});
  const Lw=d4.pieces[2].poly;   // le mur du haut du L : de (ox,oy) à (ox+5,oy)
  const wy=Math.min(...Lw.map(q=>q[1])),wx0=Math.min(...Lw.map(q=>q[0]));
  await tracer([[wx0+1.0,wy+0.02],[wx0+1.9,wy-0.02]],{ferme:false,bruit:0.01,pas:0.1});
  await p.waitForSelector('#menuOuverture');
  chk(await p.locator('[data-type-ouverture]').count()===3,'un trait court le long d’un mur : le menu propose Porte / Fenêtre / Baie');
  await p.tap('[data-type-ouverture="porte"]');
  await p.waitForSelector('#ouvEdition');
  chk(/Porte/.test(await p.textContent('#ouvEdition'))&&await p.locator('input[name="ouv-largeur-croquis"]').count()===1,'la porte est posée, sa largeur est modifiable');
  await p.fill('input[name="ouv-largeur-croquis"]','1');await p.locator('input[name="ouv-largeur-croquis"]').press('Enter');
  await p.tap('#ouvOk');
  const d5=await dessinSync(d=>d.ouvertures.length===1&&d.ouvertures[0].largeur===1);
  chk(d5&&d5.ouvertures.length===1&&d5.ouvertures[0].piece===d5.pieces[2].id&&Array.isArray(d5.ouvertures[0].au)&&d5.ouvertures[0].largeur===1,'ouverture gardée : sur la pièce en L, largeur 1 m, posée par un point du mur');

  /* 6. annuler / rétablir */
  chk(await p.locator('#annulerDessin').isEnabled(),'↶ Annuler est actif');
  await p.tap('#annulerDessin');
  let d6=await dessinSync(d=>d.ouvertures.length===0||d.ouvertures[0].largeur!==1);
  chk(d6&&(d6.ouvertures.length===0||d6.ouvertures[0].largeur!==1),'↶ annule la dernière modification');
  await p.tap('#retablirDessin');
  d6=await dessinSync(d=>d.ouvertures.length===1&&d.ouvertures[0].largeur===1);
  chk(d6&&d6.ouvertures.length===1&&d6.ouvertures[0].largeur===1,'↷ la rétablit');

  /* 7. la gomme : glisser sur un mur efface la pièce, ↶ la ramène */
  await p.tap('#outilCroquis-gomme');
  const Bm=bb(d4.pieces[1].poly);
  const eff=await versEcran([[ (Bm.x0+Bm.x1)/2-0.6,Bm.y1+0.0],[(Bm.x0+Bm.x1)/2+0.6,Bm.y1+0.0]]);
  await toucher('touchStart',[eff[0]]);await toucher('touchMove',[eff[1]]);await toucher('touchEnd',[]);
  const d7=await dessinSync(d=>d.pieces.length===2);
  chk(d7&&d7.pieces.length===2&&!d7.pieces.some(q=>q.id===d4.pieces[1].id),'la gomme glissée sur un mur efface la pièce');
  chk(/Pièce effacée/.test(await p.textContent('#infoCroquis')),'un message dit ce qui a été effacé et que ↶ peut l’annuler');
  await p.tap('#annulerDessin');
  const d7b=await dessinSync(d=>d.pieces.length===3);
  chk(d7b&&d7b.pieces.length===3,'↶ ramène la pièce effacée');
  // la gomme sur la porte : seule la porte part
  const Pt=await versEcran([[wx0+1.0,wy],[wx0+1.9,wy]]);
  await toucher('touchStart',[Pt[0]]);await toucher('touchMove',[Pt[1]]);await toucher('touchEnd',[]);
  const d7c=await dessinSync(d=>d.ouvertures.length===0);
  chk(d7c&&d7c.ouvertures.length===0&&d7c.pieces.length===3,'la gomme glissée sur une porte n’efface que la porte');
  await p.tap('#annulerDessin');
  await p.tap('#outilCroquis-tracer');

  /* 8. un sommet glissé : la pièce garde ses angles droits */
  const sel=d7b.pieces[0].id;   // la 1re pièce (rectangle 5 m de large)
  const R1=bb(d7b.pieces[0].poly);
  chk(await p.locator('[data-sommet]').count()===0,'en « Tracer », aucune poignée ne gêne le tracé (même pièce sélectionnée)');
  await p.tap('#outilCroquis-modifier');
  await tracer([[ (R1.x0+R1.x1)/2,(R1.y0+R1.y1)/2],[ (R1.x0+R1.x1)/2+0.02,(R1.y0+R1.y1)/2]],{ferme:false,bruit:0,pas:0.05});   // un toucher dedans : la sélectionne
  await p.waitForSelector('[data-sommet]');
  chk(await p.locator('[data-sommet]').count()===4,'outil « Modifier » : toucher une pièce fait apparaître ses 4 poignées');
  const dessous=d7b.pieces[0].poly;const sBas=dessous.findIndex(q=>q[0]===R1.x0&&q[1]===R1.y1);
  const [dep,arr]=await versEcran([[R1.x0,R1.y1],[R1.x0-0.8,R1.y1+0.9]]);
  await toucher('touchStart',[dep]);for(let i=1;i<=8;i++)await toucher('touchMove',[[dep[0]+(arr[0]-dep[0])*i/8,dep[1]+(arr[1]-dep[1])*i/8]]);await toucher('touchEnd',[]);
  const d8=await dessinSync(d=>aire(d.pieces[0].poly)>aire(d7b.pieces[0].poly)+0.5);
  const R2=bb(d8.pieces[0].poly);
  chk(d8&&d8.pieces[0].poly.length===4&&murs(d8.pieces[0].poly).every(([v,h])=>v||h),'sommet glissé : la pièce reste un rectangle aux angles droits');
  chk(Math.abs(R2.x0-(R1.x0-0.8))<0.45&&Math.abs(R2.y1-(R1.y1+0.9))<0.45,'le coin a suivi le doigt (aimant compris)');

  await p.tap('#outilCroquis-tracer');
  if(!SOURIS){
  /* 9. rien ne défile, rien ne zoome, pendant le tracé ; un 2e doigt abandonne le tracé */
  const vert=await versEcran([[ox+10.5,oy-4],[ox+10.5,oy+3.5]]);   // un long trait vertical dans le cadre : le navigateur défilerait la page
  const y0=await p.evaluate(()=>window.scrollY),vv0=await p.evaluate(()=>window.visualViewport.scale);   // relevés une fois le dessin à l'écran
  const nbAvant=(await etat()).pieces.length;
  await toucher('touchStart',[vert[0]]);for(let i=1;i<=20;i++)await toucher('touchMove',[[vert[0][0],vert[0][1]+(vert[1][1]-vert[0][1])*i/20]]);await toucher('touchEnd',[]);
  await p.waitForTimeout(300);
  chk(await p.evaluate(()=>window.scrollY)===y0,'un long trait vertical dans le cadre ne fait pas défiler la page');
  const deux=await versEcran([[ox+9,oy],[ox+9.5,oy+0.5],[ox+11,oy+1]]);
  await toucher('touchStart',[deux[0]]);await toucher('touchMove',[deux[1]]);
  await toucher('touchStart',[deux[1],deux[2]]);   // un 2e doigt arrive : le pincement prend la main
  await toucher('touchMove',[[deux[1][0]-10,deux[1][1]],[deux[2][0]+10,deux[2][1]]]);await toucher('touchEnd',[]);
  await p.waitForTimeout(400);
  chk(await p.locator('#traitCroquis').getAttribute('points')===''||(await p.locator('#traitCroquis').getAttribute('points'))==='','un 2e doigt abandonne le tracé en cours (pas de trait résiduel)');
  const dd=Date.now();const [t1]=await versEcran([[ox+9,oy+6]]);
  await toucher('touchStart',[t1]);await toucher('touchEnd',[]);await p.waitForTimeout(60);await toucher('touchStart',[t1]);await toucher('touchEnd',[]);   // double toucher
  await p.waitForTimeout(500);
  chk(await p.evaluate(()=>window.visualViewport.scale)===vv0&&vv0===1,'un double toucher ne zoome pas la page (échelle '+vv0+')');
  chk((await etat()).pieces.length===nbAvant,'aucune pièce parasite créée par ces gestes ('+nbAvant+')');

  }else{
  /* 9 (souris). le clic droit et la molette ne tracent pas ; Ctrl+Z / Ctrl+Maj+Z annulent et rétablissent */
  const nbAvant=(await etat()).pieces.length;
  const [m0,m1]=await versEcran([[ox+9,oy],[ox+10.5,oy+1.5]]);
  const vb0=await p.evaluate(()=>document.querySelector('svg.apercuDessin').getAttribute('viewBox'));
  await p.mouse.move(m0[0],m0[1]);await p.mouse.down({button:'right'});await p.mouse.move((m0[0]+m1[0])/2,(m0[1]+m1[1])/2);await p.mouse.move(m1[0],m1[1]);await p.mouse.up({button:'right'});
  await p.waitForTimeout(300);
  chk(await p.locator('#traitCroquis').getAttribute('points')==='','le clic droit ne trace rien');
  chk((await etat()).pieces.length===nbAvant,'le clic droit ne crée aucune pièce');
  chk(await p.evaluate(()=>document.querySelector('svg.apercuDessin').getAttribute('viewBox'))!==vb0,'le clic droit glissé déplace le plan');
  const zoom0=await p.textContent('#niveauZoomDessin');
  await p.mouse.move(m0[0],m0[1]);await p.mouse.wheel(0,-300);await p.waitForTimeout(300);
  chk(await p.textContent('#niveauZoomDessin')!==zoom0&&(await etat()).pieces.length===nbAvant,'la molette zoome le dessin sans rien tracer ('+zoom0+' → '+await p.textContent('#niveauZoomDessin')+')');
  await p.click('#zoomDessinRaz');
  const avantZ=aire((await etat()).pieces[0].poly);
  await p.keyboard.press('Control+z');
  const dZ=await dessinSync(d=>aire(d.pieces[0].poly)<avantZ-0.3);
  chk(dZ&&aire(dZ.pieces[0].poly)<avantZ-0.3,'Ctrl+Z annule la dernière modification (le sommet glissé)');
  await p.keyboard.press('Control+Shift+z');
  const dY=await dessinSync(d=>Math.abs(aire(d.pieces[0].poly)-avantZ)<0.05);
  chk(dY&&Math.abs(aire(dY.pieces[0].poly)-avantZ)<0.05,'Ctrl+Maj+Z la rétablit');
  await p.fill('input[name="dessin-nom"]','Salon');await p.keyboard.press('Tab');   // la pièce est renommée
  await dessinSync(d=>d.pieces.some(q=>q.nom==='Salon'));
  await p.focus('input[name="dessin-nom"]');await p.keyboard.press('Control+z');   // dans un champ de saisie, Ctrl+Z reste celui du champ
  await p.waitForTimeout(600);
  chk((await etat()).pieces.some(q=>q.nom==='Salon'),'Ctrl+Z dans un champ de texte n’annule pas le dessin (le nom « Salon » reste)');
  }

  /* 10. « Créer le plan 2D coté et la 3D » depuis un croquis */
  await p.tap('#creerPlanDessin');
  await p.waitForSelector('#cadrePlan',{timeout:20000});
  const frame=await (async()=>{for(let i=0;i<100;i++){const fr=p.frames().find(x=>/moteur\/index\.html/.test(x.url()));if(fr&&await fr.evaluate(()=>!!(window.__releve&&window.__releve.donnees())).catch(()=>false))return fr;await p.waitForTimeout(150)}return null})();
  chk(!!frame,'« Créer le plan » à partir d’un croquis ouvre le moteur de relevé');
  const moteur=frame&&await frame.evaluate(()=>{const M=window.__releve.analyser(window.__releve.donnees());return {pieces:M.rooms.length,pointsL:window.__releve.donnees().pieces.map(x=>x.points.length),surface:Math.round(M.totalAire*100)/100}});
  const dFin=await etat();
  chk(moteur&&moteur.pieces===3&&moteur.pointsL.includes(6),'le moteur reçoit les 3 pièces du croquis, dont celle en L à 6 murs ('+JSON.stringify(moteur&&moteur.pointsL)+')');
  const attendue=Math.round(dFin.pieces.reduce((t,q)=>t+aire(q.poly),0)*100)/100;
  chk(moteur&&Math.abs(moteur.surface-attendue)<0.1,'la surface du plan 2D = celle du croquis ('+(moteur&&moteur.surface)+' m²)');
  const v3=frame&&await frame.evaluate(()=>{const v=window.__releve.v3d();if(!v.ok)return {ok:false};v.construire(window.__releve.analyser(window.__releve.donnees()));let m=0;v.group.traverse(o=>{if(o.isMesh)m++});return {ok:true,m}});
  if(v3&&v3.ok)chk(v3.m>5,'la vue 3D se construit à partir du croquis ('+v3.m+' volumes)');else chk(true,'vue 3D indisponible dans ce navigateur de test (WebGL) : vérification sautée');
  await p.tap('#fermerPlan');
  await p.waitForSelector('#resumePlan');
  chk(/3 pièces/.test(await p.textContent('#resumePlan')),'retour à la visite : le résumé du plan annonce 3 pièces');
  chk(await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});const pl=L[0]&&L[0].donnees.valeurs.plan;return !!(pl&&pl.releve&&pl.releve.pieces.length===3)}),'le plan part avec la visite (badge de synchro : voir ci-dessous)');
  chk(/Synchronisé/.test(await p.textContent('#etatSync')),'le badge « Synchronisé » s’affiche');
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await p.screenshot({path:SORTIE+'/releve_croquis.png',fullPage:false});
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
