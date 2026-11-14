/* Vérification dans Chromium : un avenant reporté pendant qu'un lot est
   ouvert ne ressort plus du marché quand on enregistre le lot ; un report
   déjà perdu se signale et se rétablit. Données fictives. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=require('path').resolve(__dirname,'..'), NM=__dirname+'/node_modules';
const AV={id:'av1',numero:'AV-001',date:'2026-11-14',objet:'Moins-value électrique',description:'',motif:'',statut:'valide',
  valideLe:'2026-11-14',accord:{date:'2026-11-14',reference:'Accord fictif'},pieces:[],journal:[],
  lignes:[{id:'x1',marcheId:'m2',lot:'Électricité',artisanId:'a2',designation:'Moins-value',qte:1,unite:'U',puHT:106,taux:20,sens:-1}],
  hono:{mode:'aucun',taux:20,pct:10,forfaitHT:'',sens:1,exclues:[]}};
const M2={id:'m2',chantierId:'c1',lot:'Électricité',artisanId:'a2',montantHT:8090,tva:20,statut:'signe',
  factures:[{id:'f1',montant:5400,date:'2026-08-24',lien:''},{id:'f2',montant:2584,date:'2026-10-10',lien:''}]};
const DATA={chantiers:[{id:'c1',nom:'Maison Fictive',client:'Client Fictif',adresse:'Commune fictive',statut:'travaux',map:{},
    budgetClientTTC:180000,tva:20,honorairesMontant:20000,avenantsClient:[AV]}],commandes:[],prospects:[],
  artisans:[{id:'a1',nom:'SARL Maçonnerie Fictive'},{id:'a2',nom:'EI Électricité Fictive'}],
  marches:[{id:'m1',chantierId:'c1',lot:'Gros œuvre',artisanId:'a1',montantHT:100000,tva:20,statut:'signe',factures:[]},M2]};
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
  let {ctx,p,erreurs}=await contexte(b,DATA,{width:1280,height:900});
  p.on('dialog',d=>d.accept());
  await p.click('nav.tabs >> text=MARCHÉS').catch(()=>{});
  await p.locator('button:text-is("Modifier le lot ›")').nth(1).click();
  await p.fill('input[placeholder="Ex. Maçonnerie — Gros œuvre"]','Électricité — VMC');
  await p.click('button:text-is("Consulter")');
  await p.click('button:text-is("Reporter dans les marchés")');
  await p.waitForFunction(()=>window.__ecrit&&window.__ecrit.marches.find(m=>m.id==='m2').montantHT===7984,null,{timeout:15000});
  const v=await p.inputValue('input[type=number][value]:near(:text("MONTANT MARCHÉ HT"))').catch(()=>'');
  chk(+v===7984,'le lot resté ouvert suit le report : 7 984 € HT ('+v+')');
  await p.click('.card:has(input[placeholder="Ex. Maçonnerie — Gros œuvre"]) >> button:text-is("Enregistrer")');
  await p.waitForFunction(()=>window.__ecrit.marches.find(m=>m.id==='m2').lot==='Électricité — VMC',null,{timeout:15000});
  let ecrit=await p.evaluate(()=>window.__ecrit);
  let m=ecrit.marches.find(x=>x.id==='m2');
  chk(m.montantHT===7984&&(m.avenantsClientReportes||[]).length===1,'lot enregistré : l’avenant reste dans le marché (7 984 € HT, trace gardée)');
  chk(/soldé/.test(await texte(p)),'le lot entièrement facturé passe « soldé »');
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | '):''));
  await ctx.close();

  /* données déjà abîmées : marquée reportée, absente du marché */
  const abime=JSON.parse(JSON.stringify(DATA));
  abime.chantiers[0].avenantsClient[0].lignes[0]={...abime.chantiers[0].avenantsClient[0].lignes[0],reporteLe:'2026-11-14',reporteSur:'m2'};
  ({ctx,p,erreurs}=await contexte(b,abime,{width:1280,height:900}));
  p.on('dialog',d=>d.accept());
  chk(/report à refaire/.test(await texte(p)),'liste des avenants : « report à refaire »');
  await p.click('button:text-is("Consulter")');
  chk(/mais le marché ne le porte plus/.test(await texte(p)),'détail : la ligne marquée reportée que le marché ne porte plus');
  if(process.env.CAPTURE_REPORT){await p.locator('text=Reporter à nouveau dans le marché').scrollIntoViewIfNeeded();
    await p.screenshot({path:process.env.CAPTURE_REPORT});}
  await p.click('button:text-is("Reporter à nouveau dans le marché")');
  await p.waitForFunction(()=>window.__ecrit&&window.__ecrit.marches.find(m=>m.id==='m2').montantHT===7984,null,{timeout:15000});
  chk(!/report à refaire/.test(await texte(p)),'rétabli : 7 984 € HT, plus d’alerte');
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | '):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
  process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
