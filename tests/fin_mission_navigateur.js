/* Vérification dans Chromium : la pièce « Attestation de fin de mission »
   de la fiche chantier (PIÈCES › Achèvement). L'état des lots repris des
   PV, un document coché qui part vers la base ; sur un téléphone, pas de
   défilement horizontal. Données fictives. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=require('path').resolve(__dirname,'..'), NM=__dirname+'/node_modules';
const DATA={chantiers:[{id:'c1',nom:'Maison Fictive',client:'Client Fictif',adresse:'Commune fictive',statut:'travaux',map:{},
    budgetClientTTC:180000,tva:20,honorairesMontant:14000,docs:{contrat_moe:{fait:true,date:'2025-06-12'}},
    pvs:{m1:{decision:'sans',dateEffet:'2026-11-10'},m2:{decision:'avec',dateEffet:'2026-11-10',reserves:[{id:'r',localisation:'Cuisine',description:'Prise'}]}}}],
  commandes:[],prospects:[],
  artisans:[{id:'a1',nom:'SARL Maçonnerie Fictive'},{id:'a2',nom:'EI Électricité Fictive'}],
  marches:[{id:'m1',chantierId:'c1',lot:'Gros œuvre',artisanId:'a1',montantHT:100000,tva:20,statut:'signe',factures:[]},
    {id:'m2',chantierId:'c1',lot:'Électricité',artisanId:'a2',montantHT:8000,tva:20,statut:'signe',factures:[]}]};
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
  await p.click('text=Maison Fictive');await p.waitForSelector('text=Budget et avenants');
  return {ctx,p,erreurs};
}
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  for(const [vp,nomVp] of [[{width:1280,height:900},'ordinateur'],[{width:390,height:844},'téléphone']]){
    let {ctx,p,erreurs}=await contexte(b,DATA,vp);
    await p.click('button:text-is("PIÈCES")');
    await p.waitForSelector('text=Attestation de fin de mission de maîtrise d’œuvre');
    const t=await texte(p);
    chk(/Réception des lots \(2\)/.test(t)&&/Sans réserve — reçu le 10\/11\/2026/.test(t)&&/Avec 1 réserve — non levée/.test(t),nomVp+' : l’état des lots repris des PV');
    chk(/Avant de la faire signer/.test(t),nomVp+' : ce qui reste à faire est affiché');
    if(nomVp==='ordinateur'){
      chk(!/Dossier des ouvrages exécutés/.test(t)&&!/Notices d’utilisation et d’entretien/.test(t),'le DOE et les notices ne sont plus proposés');
      await p.locator('label:has-text("Attestation de conformité de l’installation électrique") input').check();
      await p.waitForFunction(()=>window.__ecrit&&window.__ecrit.chantiers[0].finMission&&window.__ecrit.chantiers[0].finMission.documents.consuel===true,null,{timeout:15000});
      chk(true,'le Consuel coché part vers la base');
    }else{
      const deborde=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
      chk(!deborde,'téléphone : pas de défilement horizontal de la page');
    }
    if(process.env.CAPTURE_FIN){
      await p.locator('text=Réception des lots (2)').scrollIntoViewIfNeeded();
      await p.screenshot({path:process.env.CAPTURE_FIN.replace('.png','-'+(nomVp==='ordinateur'?'pc':'tel')+'.png'),fullPage:false});
    }
    chk(!erreurs.length,nomVp+' : aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | '):''));
    await ctx.close();
  }
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
  process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
