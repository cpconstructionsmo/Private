/* Vérification dans Chromium : rechargement au même endroit, bandeau de
   gauche escamotable à la souris, simulateur DPE retiré. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=require('path').resolve(__dirname,'..'), NM=__dirname+'/node_modules';
const DATA={chantiers:[{id:'c1',nom:'Maison Leroux',statut:'chantier',map:{}}],marches:[],
  prospects:[{id:'p1',nom:'Maison Moualid',client:'Moualid',commune:'Valframbert',statut:'demande',postes:[],produits:[]}]};
const FAUX_SUPA=`window.supabase={createClient:()=>{const q={select:()=>q,eq:()=>q,single:()=>Promise.resolve({data:{data:${JSON.stringify(DATA)}},error:null}),
 upsert:()=>Promise.resolve({error:null})};return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}}}};`;
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
let google=[],sansJeton=false;
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const route=async ctx=>ctx.route('**/*',r=>{const u=r.request().url();
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:FAUX_SUPA,contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^http:\/\/app\.local\/(.*?)(\?.*)?$/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    if(/accounts\.google\.com/.test(u)){google.push(u);
      const retour=u.match(/redirect_uri=([^&]+)/);const dest=decodeURIComponent(retour[1]);
      return r.fulfill({status:302,headers:{location:dest+(sansJeton?'':'#access_token=jeton-neuf&expires_in=3600&token_type=Bearer')}});}
    if(/googleapis\.com\/drive\/v3\/about/.test(u))return r.fulfill({body:JSON.stringify({user:{emailAddress:'cp.drive@gmail.com'}}),contentType:'application/json'});
    return r.fulfill({status:204,body:''});});

  const ouvrir=async(stock)=>{const ctx=await b.newContext({viewport:{width:1440,height:900}});await route(ctx);
    await ctx.addInitScript(s=>{if(!sessionStorage.getItem('__init')){sessionStorage.setItem('__init','1');for(const k in s)localStorage.setItem(k,s[k])}},stock);
    const p=await ctx.newPage();return {ctx,p}};
  const perime=String(Date.now()-3600e3);
  /* 1. connexion expirée, compte connu : aller-retour automatique à l'ouverture */
  google=[];let {ctx,p}=await ouvrir({driveToken:'vieux',driveTokenExpiry:perime,driveCompte:'cp.drive@gmail.com'});
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});await p.waitForTimeout(800);
  chk(google.length===1,'expirée : un seul aller-retour chez Google à l’ouverture ('+google.length+')');
  const q=new URL(google[0]||'http://x/').searchParams;
  chk(q.get('login_hint')==='cp.drive@gmail.com'&&!q.get('prompt'),'compte désigné d’office, sans écran d’autorisation forcé');
  const jeton=await p.evaluate(()=>[localStorage.getItem('driveToken'),+localStorage.getItem('driveTokenExpiry')>Date.now()]);
  chk(jeton[0]==='jeton-neuf'&&jeton[1],'nouveau jeton enregistré, valable une heure');
  chk(!/access_token/.test(p.url()),'le jeton ne reste pas dans l’adresse');
  await ctx.close();
  /* 2. retour de Google sans jeton : pas de boucle */
  google=[];sansJeton=true;({ctx,p}=await ouvrir({driveToken:'vieux',driveTokenExpiry:perime,driveCompte:'cp.drive@gmail.com'}));
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});await p.waitForTimeout(800);
  await p.reload();await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});await p.waitForTimeout(800);
  chk(google.length===1,'retour sans jeton puis rechargement : pas de nouvel aller-retour ('+google.length+')');
  await ctx.close();sansJeton=false;
  /* 3. jamais connecté : rien d'automatique */
  google=[];({ctx,p}=await ouvrir({}));
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});await p.waitForTimeout(800);
  chk(google.length===0,'jamais connecté : aucune redirection');
  await ctx.close();
  /* 4. connexion encore valable : rien */
  google=[];({ctx,p}=await ouvrir({driveToken:'ok',driveTokenExpiry:String(Date.now()+1800e3),driveCompte:'cp.drive@gmail.com'}));
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});await p.waitForTimeout(800);
  chk(google.length===0,'connexion valable : aucune redirection');
  /* 5. la position est gardée pendant l'aller-retour */
  await ctx.close();
  google=[];({ctx,p}=await ouvrir({driveToken:'ok',driveTokenExpiry:String(Date.now()+1800e3),driveCompte:'cp.drive@gmail.com'}));
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  await p.mouse.move(4,450);await p.waitForTimeout(300);await p.click('nav.bot >> text=CHANTIERS');await p.waitForTimeout(300);
  await p.click('text=Maison Leroux');await p.click('button.tab:has-text("PHOTOS")');await p.waitForTimeout(300);
  await p.evaluate(()=>{localStorage.setItem('driveTokenExpiry',String(Date.now()-1000))});
  await p.reload();await p.waitForSelector('button.tab.on',{timeout:30000});await p.waitForTimeout(800);
  chk(google.length===1&&(await p.textContent('button.tab.on')).trim()==='PHOTOS'&&/Maison Leroux/.test(await p.textContent('main')),'après l’aller-retour : même chantier, même onglet');
  /* 6. se déconnecter oublie le compte */
  const btn=p.locator('button:has-text("Déconnecter")').first();
  if(await btn.count()){await btn.click();await p.waitForTimeout(200);
    chk(!(await p.evaluate(()=>localStorage.getItem('driveCompte'))),'« Déconnecter » oublie le compte désigné');}
  else chk(false,'bouton Déconnecter introuvable sur l’onglet PHOTOS');
  await ctx.close();await b.close();
  console.log(ko?'\n'+ko+' echec(s)':'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
