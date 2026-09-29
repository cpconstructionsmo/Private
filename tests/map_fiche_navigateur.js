/* Vérification dans Chromium : la photo d'une fiche MAP remplie est
   importée dans l'onglet MAP ; l'écran de vérification montre ce qui a été
   coché, laisse les champs déjà saisis tels quels tant qu'on ne choisit pas
   la fiche, et n'enregistre que ce qui a été retenu. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');const zlib=require('zlib');
const {execFileSync}=require('child_process');
const {charger}=require('./harness');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules', SORTIE=require('os').tmpdir()+'/cp-tests';
const M=charger(['ficheMapMiseEnPage','pdfVectoriel','FICHE_CASE','EMPTY']);
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};

const CH={id:'c1',nom:'Maison Leroux',statut:'chantier',client:'M. Leroux',map:{gaz:'Sans objet'}};
const {pages,disposition}=M.ficheMapMiseEnPage(CH,{...M.EMPTY,chantiers:[CH]},{mode:'preremplie',numero:5,date:'2026-09-29'});
CH.map.fiches=[{id:'f5',...disposition,lien:''}];
const DATA={chantiers:[CH],artisans:[],marches:[],prospects:[]};

/* la page 1 rendue, cochée, puis photographiée de biais et en PNG */
const PX=150/25.4;
const pdf=path.join(SORTIE,'nav_fiche.pdf');fs.writeFileSync(pdf,M.pdfVectoriel(pages,'x'));
let src;
try{
  execFileSync('pdftoppm',['-gray','-r','150','-f','1','-l','1','-singlefile',pdf,path.join(SORTIE,'nav_fiche')]);
  const b=fs.readFileSync(path.join(SORTIE,'nav_fiche.pgm'));const t=b.toString('latin1',0,40).split(/\s+/);
  const debut=b.indexOf('255\n')+4;src={w:+t[1],h:+t[2],g:new Uint8Array(b.subarray(debut,debut+t[1]*t[2]))};
}catch(e){console.log('pdftoppm absent : vérification ignorée');console.log('\nTout est bon.');process.exit(0)}
const stylo=(x1,y1,x2,y2)=>{const n=60;for(let i=0;i<=n;i++){const x=(x1+(x2-x1)*i/n)*PX,y=(y1+(y2-y1)*i/n)*PX;
  for(let yy=Math.floor(y-2);yy<=y+2;yy++)for(let xx=Math.floor(x-2);xx<=x+2;xx++)src.g[yy*src.w+xx]=30}};
const cocher=c=>{stylo(c.x+0.6,c.y+1.8,c.x+1.5,c.y+3.1);stylo(c.x+1.5,c.y+3.1,c.x+4.4,c.y-0.8)};
const C=disposition.cases.filter(c=>c.p===0);
cocher(C.find(c=>c.k==='bornageFait'&&c.v==='Non, à réaliser'));
cocher(C.find(c=>c.k==='gaz'&&c.v==='Gaz de ville'));
const W=1500,Hh=2000,g=Buffer.alloc((W+1)*Hh);
const inv=(x,y)=>{/* page posée de biais : un simple cisaillement et une échelle */
  const sx=(x-120+(y-100)*0.04)*src.w/1260, sy=(y-100)*src.h/1800;return [sx,sy]};
for(let y=0;y<Hh;y++){g[y*(W+1)]=0;for(let x=0;x<W;x++){const [sx,sy]=inv(x,y);
  const v=sx>=0&&sy>=0&&sx<src.w&&sy<src.h?src.g[Math.floor(sy)*src.w+Math.floor(sx)]:110;g[y*(W+1)+1+x]=Math.round(v*(0.7+0.3*x/W))}}
const crc=b=>{let c=~0;for(const x of b){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1))}return ~c>>>0};
const bloc=(type,d)=>{const t=Buffer.from(type),l=Buffer.alloc(4),c=Buffer.alloc(4);l.writeUInt32BE(d.length);c.writeUInt32BE(crc(Buffer.concat([t,d])));return Buffer.concat([l,t,d,c])};
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(Hh,4);ihdr[8]=8;ihdr[9]=0;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),bloc('IHDR',ihdr),bloc('IDAT',zlib.deflateSync(g)),bloc('IEND',Buffer.alloc(0))]);
const photo=path.join(SORTIE,'fiche_photo.png');fs.writeFileSync(photo,png);

const FAUX_SUPA=`window.supabase={createClient:()=>{const q={select:()=>q,eq:()=>q,single:()=>Promise.resolve({data:{data:${JSON.stringify(DATA)}},error:null}),
 upsert:()=>Promise.resolve({error:null})};return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}}}};`;
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:430,height:900}});
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
  await p.click('text=Maison Leroux');await p.click('button.tab:has-text("MAP")');
  await p.setInputFiles('text=Importer les photos ou le scan >> input[type=file]',photo);
  await p.waitForSelector('text=Fiche n° 5 (préremplie',{timeout:60000});
  const t=await p.textContent('main');
  chk(/page 1 lue sur \d+/.test(t)&&/Pages non fournies : 2/.test(t),'la page 1 de la fiche n° 5 est reconnue, les autres signalées manquantes');
  chk(/Bornage du terrain/.test(t)&&/Gaz/.test(t)&&/dont 1 à trancher/.test(t),'deux champs lus, dont le gaz déjà saisi, à trancher');
  const carteGaz=p.locator('.card',{hasText:'Actuel : Sans objet'}).last();
  await p.screenshot({path:SORTIE+'/map_verification.png',fullPage:true});
  await carteGaz.locator('button',{hasText:'Prendre la fiche'}).click();
  const carteImport=p.locator('.card',{hasText:'Relire une fiche remplie'}).first();
  await carteImport.locator('button',{hasText:/^Enregistrer$/}).click();
  await p.waitForSelector('text=Import enregistré',{timeout:20000});
  const t2=await p.textContent('main');
  chk(/2 champs mis à jour/.test(t2),'enregistré : 2 champs mis à jour');
  const vals=await p.$$eval('select',S=>S.map(s=>s.value));
  chk(vals.includes('Non, à réaliser')&&vals.includes('Gaz de ville'),'les deux valeurs sont dans la MAP');
  chk(/annuler cet import/.test(t2),'l’import peut être annulé');
  await p.click('text=annuler cet import');await p.waitForSelector('text=Import annulé');
  const vals2=await p.$$eval('select',S=>S.map(s=>s.value));
  chk(!vals2.includes('Non, à réaliser')&&vals2.includes('Sans objet'),'annulé : les valeurs d’avant reviennent');
  chk(!erreurs.length,'aucune erreur JavaScript'+(erreurs.length?' — '+erreurs.join(' | '):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
