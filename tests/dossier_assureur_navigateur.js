/* Vérification dans Chromium : le dossier de fin de chantier pour
   l'assureur (PIÈCES › Achèvement) — ce qui part, ce qui manque, le message ;
   le n° de contrat qui part vers la base ; sur un téléphone, pas de
   défilement horizontal. Et la zone où glisser une facture (MARCHÉS), qui
   se colore au survol. Données fictives. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=require('path').resolve(__dirname,'..'), NM=__dirname+'/node_modules';
const L=id=>'https://drive.google.com/file/d/'+id+'/view';
const DATA={chantiers:[{id:'c1',nom:'Maison Fictive',client:'Client Fictif',adresse:'Commune fictive',statut:'travaux',map:{},
    budgetClientTTC:180000,tva:20,honorairesMontant:14000,docs:{contrat_moe:{fait:true,date:'2025-06-12'},
      pv:{fichiers:[{id:'p1',nom:'PV de réception — Gros œuvre.docx',lien:L('PV1')}]}},
    pvs:{m1:{decision:'sans',dateEffet:'2026-11-10',genere:{nom:'PV.docx',lien:L('PV1'),le:'2026-11-10'}}},
    honoFactures:[{id:'h1',montant:5000,numero:'H-1',date:'2026-06-01'}]}],
  commandes:[],prospects:[],
  artisans:[{id:'a1',nom:'SARL Maçonnerie Fictive'},{id:'a2',nom:'EI Électricité Fictive'}],
  marches:[{id:'m1',chantierId:'c1',lot:'Gros œuvre',artisanId:'a1',montantHT:100000,tva:20,statut:'signe',
      factures:[{id:'f1',montant:100000,numero:'F-1',date:'2026-10-01',lien:L('F1')}]},
    {id:'m2',chantierId:'c1',lot:'Électricité',artisanId:'a2',montantHT:8000,tva:20,statut:'signe',
      factures:[{id:'f2',montant:8000,numero:'E-1',date:'2026-10-05'}]}]};
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
    await p.waitForSelector('text=Dossier de fin de chantier pour l’assureur (dommages-ouvrage)');
    const t=await texte(p);
    chk(/Factures des entreprises — 1 fichier/.test(t)&&/PV de réception \(pièce « PV de réception »\) — 1 fichier/.test(t),nomVp+' : ce qui part dans le dossier');
    chk(/Facture E-1 — Électricité — EI Électricité Fictive du 05\/10\/2026 \(8 000,00 € HT\) : fichier non déposé/.test(t)
      &&/DAACT non déposée/.test(t),nomVp+' : ce qui manque, nommé');
    chk(/Préparer le dossier \(ZIP, 2 fichiers\)/.test(t)&&/Madame, Monsieur/.test(await p.locator('textarea[readonly]').inputValue()),nomVp+' : le bouton et le message');
    if(nomVp==='ordinateur'){
      await p.locator('label:has-text("N° de contrat dommages-ouvrage") input, div:has(> div:text-is("N° de contrat dommages-ouvrage")) input').first().fill('DO-77');
      await p.waitForFunction(()=>window.__ecrit&&window.__ecrit.chantiers[0].dossierAssureur&&window.__ecrit.chantiers[0].dossierAssureur.police==='DO-77',null,{timeout:15000});
      chk(true,'le n° de contrat part vers la base');
    }else{
      const deborde=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
      chk(!deborde,'téléphone : pas de défilement horizontal de la page');
    }
    if(process.env.CAPTURE_DOSSIER){
      await p.locator('text=Ce qui part dans le dossier').scrollIntoViewIfNeeded();
      await p.screenshot({path:process.env.CAPTURE_DOSSIER.replace('.png','-'+(nomVp==='ordinateur'?'pc':'tel')+'.png'),fullPage:false});
    }
    /* la facture sans fichier, dans MARCHÉS : la zone où la glisser */
    await p.click('button:text-is("MARCHÉS")');
    await p.waitForSelector('button[aria-label="Voir le justificatif"]');
    const plus=p.locator('button[aria-label="Voir le justificatif"]');
    await plus.nth(1).click();
    await p.waitForSelector('label[aria-label="Importer la facture"]');
    chk(/Glissez-la ici, ou cliquez pour la choisir/.test(await p.locator('label[aria-label="Importer la facture"]').innerText()),nomVp+' : la zone de dépôt de la facture');
    /* un fichier glissé au-dessus de la zone : elle se colore */
    const dt=await p.evaluateHandle(()=>{const d=new DataTransfer();d.items.add(new File(['%PDF'],'f.pdf',{type:'application/pdf'}));return d});
    await p.dispatchEvent('label[aria-label="Importer la facture"]','dragover',{dataTransfer:dt});
    const fond=await p.locator('label[aria-label="Importer la facture"]').evaluate(e=>getComputedStyle(e).backgroundColor);
    chk(fond!=='rgba(0, 0, 0, 0)',nomVp+' : au survol, la zone se colore');
    if(process.env.CAPTURE_DOSSIER)await p.screenshot({path:process.env.CAPTURE_DOSSIER.replace('.png','-zone-'+(nomVp==='ordinateur'?'pc':'tel')+'.png'),fullPage:false});
    chk(!erreurs.length,nomVp+' : aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | '):''));
    await ctx.close();
  }
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');
  process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
