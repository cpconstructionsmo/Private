/* Sauvegardes : version du jour sur l'appareil, copie du jour sur le Drive,
   version gardée avant une restauration, retour à une version. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules';
let serveur={data:{chantiers:[{id:'c1',nom:'Maison Leroux',statut:'travaux',map:{}},{id:'c2',nom:'Maison Martin',statut:'etude'}],marches:[],
  prospects:[{id:'p1',nom:'Maison Moualid',statut:'demande',postes:[],produits:[]}]},updated_at:'2026-09-28T08:00:00.000Z'};
const FAUX_SUPA=`(()=>{const srv=(op,st)=>fetch('http://app.local/__srv/'+op,{method:'POST',body:JSON.stringify(st||{})}).then(r=>r.json());
 const q=()=>{const st={op:'select',f:{}};const b={select(c){return b},update(p){st.op='update';st.payload=p;return b},
  upsert(p){st.op='upsert';st.payload=p;return b},eq(k,v){st.f[k]=v;return b},single(){st.single=true;return b},
  then(res,rej){return srv(st.op,st).then(res,rej)}};return b};
 window.supabase={createClient:()=>({auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
  onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q(),
  channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}})};})();`;
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
let envoisDrive=[];
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
  await ctx.addInitScript(()=>{if(!sessionStorage.getItem('__i')){sessionStorage.setItem('__i','1');
    localStorage.setItem('driveToken','ok');localStorage.setItem('driveTokenExpiry',String(Date.now()+1800e3));localStorage.setItem('driveCompte','cp@gmail.com')}});
  await ctx.route('**/*',async r=>{const u=r.request().url();
    const s=u.match(/__srv\/(\w+)/);
    if(s){const st=JSON.parse(r.request().postData()||'{}');let rep;
      if(s[1]==='select')rep={data:st.single?serveur:[serveur],error:null};
      else if(s[1]==='update'&&st.f.updated_at!==serveur.updated_at)rep={data:[],error:null};
      else{serveur={data:st.payload.data,updated_at:st.payload.updated_at};rep={data:[{updated_at:serveur.updated_at}],error:null}}
      return r.fulfill({body:JSON.stringify(rep),contentType:'application/json'})}
    if(/googleapis\.com\/upload\/drive/.test(u)){envoisDrive.push(r.request().postData()||'');return r.fulfill({body:JSON.stringify({id:'f1',webViewLink:'https://drive/f1'}),contentType:'application/json'})}
    if(/googleapis\.com\/drive\/v3\/files\?q=/.test(u))return r.fulfill({body:JSON.stringify({files:[{id:'dossier'}]}),contentType:'application/json'});
    if(/googleapis\.com\/drive\/v3\/files\?orderBy/.test(u))return r.fulfill({body:JSON.stringify({files:[]}),contentType:'application/json'});
    if(/googleapis\.com/.test(u))return r.fulfill({body:JSON.stringify({user:{emailAddress:'cp@gmail.com'},files:[]}),contentType:'application/json'});
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:FAUX_SUPA,contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^http:\/\/app\.local\/(.*?)(\?.*)?$/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  await p.waitForTimeout(4500);
  const versions=()=>p.evaluate(()=>new Promise(ok=>{const r=indexedDB.open('cp-versions',1);r.onsuccess=()=>{const q=r.result.transaction('versions').objectStore('versions').getAll();q.onsuccess=()=>ok(q.result.map(v=>({id:v.id,motif:v.motif,n:v.data.chantiers.length})))}}));
  let V=await versions();
  chk(V.length===1&&/^jour-/.test(V[0].id)&&V[0].n===2,'version du jour rangée sur l’appareil à l’ouverture');
  chk(envoisDrive.length===1&&/CP-sauvegarde-\d{4}-\d\d-\d\d\.json/.test(envoisDrive[0])&&/Maison Leroux/.test(envoisDrive[0]),'copie du jour envoyée sur le Drive');
  await p.reload();await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});await p.waitForTimeout(4500);
  V=await versions();
  chk(V.length===1&&envoisDrive.length===1,'une seule version et une seule copie Drive par jour');
  /* Données : écran des versions */
  await p.mouse.move(4,450);await p.waitForTimeout(300);await p.click('nav.bot >> text=DONNÉES');await p.waitForTimeout(500);
  const carte=p.locator('.versions-sauvegardees');
  chk(/Version automatique du jour/.test(await carte.textContent())&&/2 chantiers, 1 prospect/.test(await carte.textContent())&&/Dernière copie sur le Drive/.test(await carte.textContent()),'Données : la version du jour et la copie Drive sont affichées');
  /* supprimer un chantier (simulé), puis revenir à la version du jour */
  await p.evaluate(()=>{});
  serveur.data={...serveur.data,chantiers:serveur.data.chantiers.slice(0,1)};serveur.updated_at='2026-09-28T09:00:00.000Z';
  await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await p.waitForTimeout(800);
  p.on('dialog',d=>d.accept());
  await carte.locator('button:has-text("Restaurer")').first().click();await p.waitForTimeout(2000);
  chk(serveur.data.chantiers.length===2&&serveur.data.chantiers.some(c=>c.nom==='Maison Martin'),'retour à la version du jour : le chantier perdu est revenu sur le serveur');
  V=await versions();
  chk(V.some(v=>/^Avant restauration/.test(v.motif)&&v.n===1),'la version remplacée est gardée (« Avant restauration »)');
  chk(/Avant restauration/.test(await carte.textContent()),'et elle apparaît dans la liste');
  /* export d'une version */
  const [dl]=await Promise.all([p.waitForEvent('download'),carte.locator('button:has-text("Télécharger")').first().click()]);
  chk(/^CP-sauvegarde-\d{4}-\d\d-\d\d\.json$/.test(dl.suggestedFilename()),'une version se télécharge en fichier');
  await p.screenshot({path:require('os').tmpdir()+'/cp-tests/versions.png',fullPage:false});
  chk(!erreurs.length,'aucune erreur JavaScript '+erreurs.join(' | '));
  await b.close();
  console.log(ko?'\n'+ko+' echec(s)':'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
