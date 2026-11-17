/* Vérification dans Chromium : un chantier de rénovation se reconnaît dans
   la liste (badge « RÉNOVATION », liseré) et dans sa fiche ; ses pièces sont
   celles de l'existant. Ordinateur et téléphone. Données fictives. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=require('path').resolve(__dirname,'..'), NM=__dirname+'/node_modules';
const DATA={chantiers:[{id:'c1',nom:'Rénovation Fictive',client:'Client Fictif',adresse:'Commune fictive',statut:'etude',map:{},typeTravaux:'renovation',
    budgetClientTTC:50000,tva:10,honorairesMontant:4000,budget:40000,docs:{}},
  {id:'c2',nom:'Maison Fictive',client:'Autre Fictif',adresse:'Lotissement fictif',statut:'etude',map:{},budgetClientTTC:180000,tva:20,docs:{}}],
  commandes:[],prospects:[],artisans:[],marches:[]};
/* le faux Supabase garde ce que l'application écrit, pour le relire ensuite */
const fauxSupa=data=>`window.__ecrit=null;window.supabase={createClient:()=>{const q={select:()=>q,eq:()=>q,
 single:()=>Promise.resolve({data:{data:${JSON.stringify(data)}},error:null}),
 update:x=>{window.__ecrit=x.data;return {eq:()=>({eq:()=>({select:()=>Promise.resolve({data:[{updated_at:x.updated_at}],error:null})})})}},
 upsert:x=>{window.__ecrit=x.data;return {select:()=>Promise.resolve({data:[{updated_at:x.updated_at}],error:null})}}};
 return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}}}};`;
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
/* le texte affiché (textContent lirait aussi le script de l'application) */
const texte=async p=>(await p.innerText('body')).replace(/[  ]/g,' ');
async function contexte(b,data,viewport){
  const ctx=await b.newContext({viewport});
  await ctx.route('**/*',r=>{const u=r.request().url();
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:fauxSupa(data),contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^http:\/\/app\.local\/(.*?)(\?.*)?$/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  /* sur grand écran, le menu se montre quand la souris approche du bord gauche */
  await p.mouse.move(4,450);await p.waitForTimeout(300);await p.click('nav.bot >> text=CHANTIERS');await p.waitForTimeout(300);
  
  return {ctx,p,erreurs};
}
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  for(const [vp,nomVp] of [[{width:1280,height:900},'ordinateur'],[{width:390,height:844},'téléphone']]){
    let {ctx,p,erreurs}=await contexte(b,DATA,vp);
    await p.waitForSelector('text=Rénovation Fictive');
    const liste=await texte(p);
    chk((liste.match(/RÉNOVATION/g)||[]).length===1,nomVp+' : badge « RÉNOVATION » sur la rénovation seulement');
    if(process.env.CAPTURE_RENO)await p.screenshot({path:process.env.CAPTURE_RENO.replace('.png','-liste-'+(nomVp==='ordinateur'?'pc':'tel')+'.png')});
    await p.click('text=Rénovation Fictive');await p.waitForSelector('text=Budget et avenants');
    await p.click('button:text-is("PIÈCES")');
    await p.waitForSelector('text=Relevé de l’existant (plans, cotes, niveaux)');
    const t=await texte(p);
    chk(/AUTORISATION D’URBANISME/.test(t)&&/Déclaration préalable \(Cerfa 13703\)/.test(t)&&!/Étude de sol G2/.test(t),nomVp+' : pièces de l’existant et déclaration préalable');
    if(nomVp==='téléphone')chk(!(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)),'téléphone : pas de défilement horizontal');
    chk(!erreurs.length,nomVp+' : aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | '):''));
    await ctx.close();
  }
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
  process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
