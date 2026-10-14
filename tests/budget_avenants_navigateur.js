/* Vérification dans Chromium : l'encart « Budget et avenants » de la fiche
   chantier. On ajoute un avenant, on enregistre sa validation, le budget
   actualisé suit ; l'écriture part vers la base ; relue après rechargement,
   elle redonne le même écran. Sur un téléphone, la ligne de synthèse passe
   à une valeur par ligne, sans défilement horizontal. Données fictives. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=require('path').resolve(__dirname,'..'), NM=__dirname+'/node_modules';
const DATA={chantiers:[{id:'c1',nom:'Maison Fictive',client:'Client Fictif',adresse:'Commune fictive',statut:'travaux',map:{},
    budgetClientTTC:180000,tva:20,honorairesMontant:20000}],commandes:[],prospects:[],
  artisans:[{id:'a1',nom:'SARL Maçonnerie Fictive'}],
  marches:[{id:'m1',chantierId:'c1',lot:'Gros œuvre',artisanId:'a1',montantHT:100000,tva:20,statut:'signe',factures:[]}]};
/* le faux Supabase garde ce que l'application écrit, pour le relire ensuite */
const fauxSupa=data=>`window.__ecrit=null;window.supabase={createClient:()=>{const q={select:()=>q,eq:()=>q,
 single:()=>Promise.resolve({data:{data:${JSON.stringify(data)}},error:null}),
 update:x=>{window.__ecrit=x.data;return {eq:()=>({eq:()=>({select:()=>Promise.resolve({data:[{updated_at:x.updated_at}],error:null})})})}},
 upsert:x=>{window.__ecrit=x.data;return {select:()=>Promise.resolve({data:[{updated_at:x.updated_at}],error:null})}}};
 return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}}}};`;
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const texte=async p=>(await p.textContent('body')).replace(/[  ]/g,' ');
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
  let {ctx,p,erreurs}=await contexte(b,DATA,{width:1280,height:900});
  let t=await texte(p);
  chk(/Contrat initial : 180 000,00 € TTC/.test(t)&&/Budget disponible : 36 000,00 € TTC/.test(t),'synthèse : contrat initial et budget disponible');
  await p.click('button:has-text("+ Ajouter un avenant")');
  await p.fill('input[placeholder^="Ex. Prise extérieure"]','Fenêtre supplémentaire fictive');
  await p.selectOption('select[aria-label="Lot"]','m1');
  await p.fill('input[aria-label="Désignation"]','Percement et linteau');
  await p.fill('input[aria-label="Quantité"]','2');
  await p.fill('input[aria-label="Prix unitaire HT"]','100');
  await p.selectOption('select[aria-label="Honoraires"]','forfait');
  await p.fill('input[aria-label="Forfait HT"]','50');
  t=await texte(p);
  chk(/Total de l'avenant TTC = prestations \+ 240,00 € \+ honoraires \+ 60,00 €/.test(t),'éditeur : 200 HT + 40 TVA, honoraires 50 HT + 10 TVA');
  await p.click('.card:has-text("PRESTATIONS ARTISANS") >> button:text-is("Enregistrer")');
  await p.click('button:has-text("Enregistrer la validation")');
  await p.fill('input[placeholder^="Avenant signé, courriel"]','Courriel fictif');
  await p.click('button:has-text("Valider AV-001")');
  t=await texte(p);
  chk(/Avenants validés : \+ 300,00 € TTC/.test(t)&&/Budget actualisé : 180 300,00 € TTC/.test(t),'validé : le budget actualisé suit (+ 300,00 €)');
  await p.waitForFunction(()=>window.__ecrit&&window.__ecrit.chantiers&&(window.__ecrit.chantiers[0].avenantsClient||[]).some(a=>a.statut==='valide'),null,{timeout:15000});
  const ecrit=await p.evaluate(()=>window.__ecrit);
  chk(ecrit.chantiers[0].avenantsClient[0].numero==='AV-001'&&ecrit.chantiers[0].budgetClientTTC===180000,'écrit dans la base : AV-001 validé, contrat initial intact');
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | '):''));
  await ctx.close();

  /* rechargement : on relit ce qui a été écrit, sur un téléphone */
  ({ctx,p,erreurs}=await contexte(b,ecrit,{width:390,height:844}));
  t=await texte(p);
  chk(/AV-001/.test(t)&&/Budget actualisé : 180 300,00 € TTC/.test(t),'après rechargement : l’avenant et le budget actualisé sont retrouvés');
  const mise=await p.evaluate(()=>{const b=document.querySelector('.bilan');const s=b&&b.querySelectorAll(':scope>span');
    return {display:b&&getComputedStyle(b).display,haut:s?[...s].map(x=>Math.round(x.getBoundingClientRect().top)):[],
      deborde:document.documentElement.scrollWidth>window.innerWidth+1}});
  chk(mise.display==='block'&&new Set(mise.haut).size===mise.haut.length,'téléphone : une valeur par ligne dans la synthèse');
  chk(!mise.deborde,'téléphone : pas de défilement horizontal de la page');
  if(process.env.CAPTURE_BUDGET){
    await p.evaluate(()=>{const x=[...document.querySelectorAll('span')].find(s=>s.textContent==='Budget et avenants');if(x)x.scrollIntoView({block:'start'})});
    await p.waitForTimeout(300);await p.screenshot({path:process.env.CAPTURE_BUDGET,fullPage:false});
  }
  chk(!erreurs.length,'aucune erreur dans la page relue'+(erreurs.length?' : '+erreurs.join(' | '):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
  process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
