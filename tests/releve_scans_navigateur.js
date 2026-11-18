/* Relevé de visite — plusieurs scans reliés pièce par pièce, dans le moteur
   de relevé (Chromium, format iPhone, scans FICTIFS au format RoomPlan) :
   - « ＋ Scan » pose le second scan à droite du plan et lance la liaison ;
   - on touche le mur droit de la première pièce, puis le mur gauche de la
     seconde : elle vient s'y coller ; le décalage se règle en direct ;
   - « Relier » valide, « ↶ » défait, « ↷ » refait ; « Annuler » ne change rien. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const {mat,mur,scan}=require('./releve_scan_fictif');
const R=path.resolve(__dirname,'..'), SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};

/* le second scan : une pièce de 3,00 × 2,50 m, dans son propre repère */
const scan2={walls:[mur('N1',1,0,21.5,20,3),mur('N2',1,0,21.5,22.5,3),mur('N3',0,1,20,21.25,2.5),mur('N4',0,1,23,21.25,2.5)],
  doors:[],windows:[],openings:[],floors:[{identifier:'S2',transform:mat(1,0,21.5,0,21.25),dimensions:[3,2.5,0]}]};

let b;
(async()=>{
  b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:900,height:900},deviceScaleFactor:1,hasTouch:true});
  await ctx.route('**/*',r=>{const u=r.request().url();const m=u.match(/^https:\/\/app\.local\/([^?#]*)/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();p.setDefaultTimeout(15000);const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));
  await p.goto('https://app.local/releve/moteur/index.html');
  await p.setInputFiles('#fichier',{name:'piece1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(scan([])))});
  await p.waitForFunction(()=>window.__releve.donnees()&&window.__releve.donnees().pieces.length===1);

  /* sans second scan, « Relier » explique quoi faire */
  await p.click('#btnRelier');
  chk(/Ajoutez d'abord le scan d'une autre pièce/.test(await p.textContent('#msg')),'un seul scan : « Relier » dit d’ajouter d’abord un scan');

  await p.setInputFiles('#fichierScan',{name:'piece2.json',mimeType:'',buffer:Buffer.from(JSON.stringify(scan2))});
  await p.waitForFunction(()=>window.__releve.donnees().pieces.length===2);
  const D=()=>p.evaluate(()=>JSON.parse(JSON.stringify(window.__releve.donnees())));
  let d=await D();
  const bx=pc=>({x0:Math.min(...pc.pointsScan.map(q=>q[0])),x1:Math.max(...pc.pointsScan.map(q=>q[0])),y0:Math.min(...pc.pointsScan.map(q=>q[1])),y1:Math.max(...pc.pointsScan.map(q=>q[1]))});
  chk(d.pieces[1].scan===2&&bx(d.pieces[1]).x0-bx(d.pieces[0]).x1>0.9,'le second scan est posé à droite, à part ('+d.scans.map(s=>s.nom).join(', ')+')');
  chk(await p.isVisible('#barreLiaison')&&/Touchez un mur/.test(await p.textContent('#texteLiaison')),'la liaison démarre d’elle-même : « Touchez un mur… »');

  /* toucher le milieu d'un mur (coordonnées du plan → écran) */
  const toucher=async(ip,cote)=>{const pt=await p.evaluate(([ip,cote])=>{const pc=window.__releve.donnees().pieces[ip],P=pc.points,xs=P.map(q=>q[0]);
      const x=cote==='droit'?Math.max(...xs):Math.min(...xs);const ys=P.filter(q=>Math.abs(q[0]-x)<1e-6).map(q=>q[1]);
      const s=window.__releve.planVersPx([x,(Math.min(...ys)+Math.max(...ys))/2]),r=document.getElementById('plan').getBoundingClientRect();return [r.left+s[0],r.top+s[1]]},[ip,cote]);
    await p.mouse.click(pt[0],pt[1]);};
  await toucher(0,'droit');
  chk(/l’autre scan/.test(await p.textContent('#texteLiaison')),'premier mur choisi : « Touchez maintenant le mur de l’autre scan »');
  await toucher(0,'gauche');
  chk(/même scan/.test(await p.textContent('#msg'))&&await p.isVisible('#barreLiaison'),'un mur du même scan : refusé, on peut toucher le bon');
  await toucher(1,'gauche');
  await p.waitForSelector('#modal:not([hidden]) #lzDec');
  d=await D();
  const A=bx(d.pieces[0]),B=bx(d.pieces[1]);
  chk(Math.abs(B.x0-A.x1)<0.002&&Math.abs((B.y0+B.y1)/2-(A.y0+A.y1)/2)<0.002,'aperçu en direct : la seconde pièce est collée au mur, centrée');
  chk(/Murs : 3,9\d m et 2,4\d m · en commun : 2,4\d m/.test(await p.textContent('#lzInfo')),'la fenêtre dit les longueurs des deux murs et du mur commun (intérieur : 2,48 m)');
  await p.click('[data-lz="debut"]');
  d=await D();
  chk(Math.abs(bx(d.pieces[1]).y0-bx(d.pieces[0]).y0)<0.002,'« Aligner les débuts » : les deux pièces alignées en haut');
  await p.screenshot({path:SORTIE+'/releve_scans_liaison.png'});
  await p.click('#modalOk');
  await p.waitForSelector('#modal[hidden]',{state:'attached'});
  d=await D();
  chk(/Scans reliés/.test(await p.textContent('#msg'))&&Math.abs(bx(d.pieces[1]).x0-bx(d.pieces[0]).x1)<0.002,'« Relier » : les deux pièces se touchent');
  const sansCoupe=d.pieces[1].pointsScan.length===4, coupe=d.pieces[0].pointsScan.length===5;
  chk(sansCoupe&&coupe,'le mur de la grande pièce est coupé au bout de la petite : un seul mur commun');
  const nbMursCommuns=await p.evaluate(()=>window.__releve.analyser(window.__releve.donnees()).walls.filter(w=>w.rooms.length===2).length);
  chk(nbMursCommuns===1,'le moteur voit un mur commun aux deux pièces');

  /* annuler, refaire */
  await p.click('#btnAnnuler');
  d=await D();chk(bx(d.pieces[1]).x0-bx(d.pieces[0]).x1>0.9,'« ↶ » : la liaison est défaite');
  await p.click('#btnRefaire');
  d=await D();chk(Math.abs(bx(d.pieces[1]).x0-bx(d.pieces[0]).x1)<0.002,'« ↷ » : elle est refaite');

  /* « Annuler » dans la fenêtre : rien ne change */
  const avant=JSON.stringify((await D()).pieces);
  await p.click('#btnRelier');await toucher(0,'droit');await toucher(1,'droit');
  await p.waitForSelector('#modal:not([hidden]) #lzDec');
  await p.click('#modalAnnuler');
  chk(JSON.stringify((await D()).pieces)===avant,'« Annuler » dans la fenêtre : le plan reste tel quel');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
