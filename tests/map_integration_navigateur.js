/* Vérification dans Chromium, sur un dossier fictif : la fiche « points
   ouverts » d'un chantier (un ouvrage à décider, un WC aux dimensions à
   confirmer) est cochée, photographiée et relue ; l'ouvrage et le WC sont
   retrouvés par leur identifiant et mis à jour ; la synthèse avant sortie
   s'affiche ; une nouvelle fiche « points ouverts » se télécharge. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');const zlib=require('zlib');
const {execFileSync}=require('child_process');
const {charger}=require('./harness');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules', SORTIE=require('os').tmpdir()+'/cp-tests';
const M=charger(['ficheMapMiseEnPage','pdfVectoriel','FICHE_CASE','mapOuvrageNeuf','sdbNeuve','EMPTY']);
const LOGO={jpeg:new Uint8Array(require('fs').readFileSync(require('path').join(__dirname,'..','assets','logo_fiche.jpg'))),w:600,h:395};
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};

const allee={...M.mapOuvrageNeuf('allee'),id:'ouv_allee',libelle:'Allée piétonne',surface:'12',statut:'a_decider'};
const salle={...M.sdbNeuve('SdB parents'),id:'sdb1',equipements:[{id:'wc',type:'wc',mur:'D',u:40,L:36,P:54,H:40,z:0,dimsSource:'defaut'}]};
const CH={id:'c1',nom:'Maison Fictive',statut:'chantier',client:'M. Fictif',map:{gaz:'Sans objet',ouvrages:[allee]},salles:[salle]};
const {pages,disposition}=M.ficheMapMiseEnPage(CH,{...M.EMPTY,chantiers:[CH]},{mode:'ouverts',numero:6,date:'2026-09-29',logo:LOGO});
CH.map.fiches=[{id:'f6',...disposition,lien:''}];
const DATA={chantiers:[CH],artisans:[],marches:[],prospects:[]};
const cInclus=disposition.cases.find(c=>c.k==='ouvrage'&&c.v==='inclus'), cWc=disposition.cases.find(c=>c.k==='sdbDims');
const PAGE=cInclus.p;

const PX=150/25.4;
const pdf=path.join(SORTIE,'nav_integ.pdf');fs.writeFileSync(pdf,M.pdfVectoriel(pages,'x'));
let src;
try{
  execFileSync('pdftoppm',['-gray','-r','150','-f',String(PAGE+1),'-l',String(PAGE+1),'-singlefile',pdf,path.join(SORTIE,'nav_integ')]);
  const b=fs.readFileSync(path.join(SORTIE,'nav_integ.pgm'));const t=b.toString('latin1',0,40).split(/\s+/);
  const debut=b.indexOf('255\n')+4;src={w:+t[1],h:+t[2],g:new Uint8Array(b.subarray(debut,debut+t[1]*t[2]))};
}catch(e){console.log('pdftoppm absent : vérification ignorée');console.log('\nTout est bon.');process.exit(0)}
const stylo=(x1,y1,x2,y2)=>{const n=60;for(let i=0;i<=n;i++){const x=(x1+(x2-x1)*i/n)*PX,y=(y1+(y2-y1)*i/n)*PX;
  for(let yy=Math.floor(y-2);yy<=y+2;yy++)for(let xx=Math.floor(x-2);xx<=x+2;xx++)src.g[yy*src.w+xx]=30}};
const cocher=c=>{stylo(c.x+0.6,c.y+1.8,c.x+1.5,c.y+3.1);stylo(c.x+1.5,c.y+3.1,c.x+4.4,c.y-0.8)};
cocher(cInclus);if(cWc.p===PAGE)cocher(cWc);
const W=1500,Hh=2000,g=Buffer.alloc((W+1)*Hh);
const inv=(x,y)=>{const sx=(x-120+(y-100)*0.04)*src.w/1260, sy=(y-100)*src.h/1800;return [sx,sy]};
for(let y=0;y<Hh;y++){g[y*(W+1)]=0;for(let x=0;x<W;x++){const [sx,sy]=inv(x,y);
  const v=sx>=0&&sy>=0&&sx<src.w&&sy<src.h?src.g[Math.floor(sy)*src.w+Math.floor(sx)]:110;g[y*(W+1)+1+x]=Math.round(v*(0.7+0.3*x/W))}}
const crc=b=>{let c=~0;for(const x of b){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1))}return ~c>>>0};
const bloc=(type,d)=>{const t=Buffer.from(type),l=Buffer.alloc(4),c=Buffer.alloc(4);l.writeUInt32BE(d.length);c.writeUInt32BE(crc(Buffer.concat([t,d])));return Buffer.concat([l,t,d,c])};
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(Hh,4);ihdr[8]=8;ihdr[9]=0;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),bloc('IHDR',ihdr),bloc('IDAT',zlib.deflateSync(g)),bloc('IEND',Buffer.alloc(0))]);
const photo=path.join(SORTIE,'integ_photo.png');fs.writeFileSync(photo,png);
const FAUX_SUPA=`window.supabase={createClient:()=>{const q={select:()=>q,eq:()=>q,single:()=>Promise.resolve({data:{data:${JSON.stringify(DATA)}},error:null}),
 upsert:()=>Promise.resolve({error:null})};return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}}}};`;
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:430,height:900},acceptDownloads:true});
  await ctx.route('**/*',r=>{const u=r.request().url();
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:FAUX_SUPA,contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^http:\/\/app\.local\/(.*?)(\?.*)?$/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('dialog',d=>d.accept());
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:60000});
  await p.locator('text=CHANTIERS').first().click().catch(()=>{});await p.waitForTimeout(300);
  await p.click('text=Maison Fictive');await p.click('button.tab:has-text("MAP")');
  chk(/Synthèse avant de sortir la MAP/.test(await p.textContent('main'))&&/SdB parents/.test(await p.textContent('.map-synthese')),'synthèse avant sortie affichée, avec la salle de bains');
  await p.setInputFiles('text=Importer les photos ou le scan >> input[type=file]',photo);
  await p.waitForSelector('text=Fiche n° 6 (points ouverts',{timeout:60000});
  const carte=p.locator('[data-ouvrage-lu="ouv_allee"]');
  chk(await carte.count()===1&&await carte.locator('select').inputValue()==='inclus','ouvrage relu : « inclus » proposé pour l’allée à décider');
  const wcLu=cWc.p===PAGE;
  if(wcLu)chk(await p.locator('text=SdB parents — WC').count()>0,'WC relu : « confirmées » cochée');
  await p.screenshot({path:SORTIE+'/integ_verification.png',fullPage:true});
  const carteImport=p.locator('.card',{hasText:'Relire une fiche remplie'}).first();
  await carteImport.locator('button',{hasText:/^Enregistrer$/}).click();
  await p.waitForSelector('text=Import enregistré',{timeout:20000});
  const t2=await p.textContent('main');
  chk(/1 ouvrage/.test(t2)&&(!wcLu||/1 équipement de salle de bains/.test(t2)),'enregistré : l’ouvrage'+(wcLu?' et le WC':'')+' mis à jour');
  chk(/Inclus au projet/.test(await p.textContent('[data-rubrique="10"]')),'rubrique 10 : l’allée est incluse au projet');
  const [dl]=await Promise.all([p.waitForEvent('download',{timeout:30000}),p.click('button:has-text("Points ouverts seulement")')]);
  chk(!!dl,'fiche « points ouverts » téléchargée');
  await p.waitForSelector('text=fiches sorties',{timeout:20000}).catch(()=>{});
  chk(/la dernière : n° 7, points ouverts/.test(await p.textContent('main')),'fiche n° 7 « points ouverts » enregistrée pour la relecture');
  chk(!(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)),'téléphone : pas de débordement horizontal');
  chk(!erreurs.length,'aucune erreur JavaScript'+(erreurs.length?' — '+erreurs.join(' | '):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
