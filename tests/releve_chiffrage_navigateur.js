/* Chiffrage précis (Phase 2, mode B) — dans le suivi, sur la fiche d'un
   prospect, les quantités d'un poste viennent du plan de sa visite.
   Chromium, faux Supabase, prospect, bordereau, plan et prix FICTIFS :
   - le plan de la visite est annoncé au-dessus du quantitatif ;
   - une ligne prend sa quantité dans le plan (toute la maison, puis une pièce) ;
   - le montant du poste suit ; tout s'enregistre avec la règle ;
   - une quantité tapée à la main arrête de suivre le plan. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules', SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};

const BORD={id:'b1',nom:'211 PEINTURE (fictif)',corps:'Peinture',articles:[
  {id:'a1',code:'PEINT_MUR',libelle:'Peinture mur (fictif)',unite:'M²',pu:14.5},{id:'a2',code:'PLINTHE',libelle:'Plinthe (fictif)',unite:'ML',pu:8}]};
const DATA={chantiers:[],artisans:[],commandes:[],marches:[],bordereaux:[BORD],prospects:[
  {id:'pA',nom:'Maison Fictif - Alençon',categorie:'renovation',civilite:'Mme',client:'Anne Fictif',telClient:'06 12 34 56 78',
   statut:'demande',demandeLe:'2026-11-01',margePct:15,tva:10,decouverte:{},visites:[{id:'vis-1',le:'2026-11-18'}],
   postes:[{id:'po1',corps:'Peinture',libelle:'Peinture',montant:0,quantitatif:{bordereauId:'b1',nom:BORD.nom,
     lignes:BORD.articles.map((a,i)=>({id:'l'+(i+1),ref:a.id,code:a.code,libelle:a.libelle,unite:a.unite,pu:a.pu,qt:''}))}}]}]};
const VISITES=[{id:'vis-1',maj_le:'2026-11-18T09:00:00Z',version:1,donnees:{id:'vis-1',schema:1,creeLe:'2026-11-17T09:30:00.000Z',
  valeurs:{statut:'terminee','client.nom':'FICTIF',partageDossier:{id:'pa-1',expireLe:'2099-01-01T00:00:00Z',creeLe:'2026-11-19T10:00:00Z'},plan:{releve:{pieces:[]},resume:{pieces:2,surface:37.5,ouvertures:3,detail:[
    {id:'p1',nom:'Cuisine',sol:12.5,perimetre:14.2,murs:30.1,portes:1,fenetres:1},
    {id:'p2',nom:'Séjour',sol:25,perimetre:20,murs:42.4,portes:2,fenetres:3}]}}},maj:{},pieces:{},photos:{}}}];

const FAUX=`window.__ecrits=[];window.supabase={createClient:()=>{
 const repondre=st=>{const op=st.ops.find(o=>o[0]==='update'||o[0]==='upsert');
  if(st.table==='app_data'&&op){window.__ecrits.push(op[1][0].data);return {data:[{updated_at:op[1][0].updated_at}],error:null}}
  if(st.table==='app_data')return {data:{data:${JSON.stringify(DATA)},updated_at:'2026-11-18T08:00:00Z'},error:null};
  if(st.table==='releve_visites')return {data:${JSON.stringify(VISITES)},error:null};
  if(st.table==='releve_partages')return {data:{vues:2,vu_le:'2026-11-19T16:05:00Z',revoque:false,expire_le:'2099-01-01T00:00:00Z'},error:null};
  return {data:[],error:null}};
 const from=table=>{const st={table,ops:[]};const q={};
  ['select','eq','order','limit','insert','update','upsert','single','maybeSingle','in','gte','lte','neq'].forEach(k=>{q[k]=(...a)=>{st.ops.push([k,a]);return q}});
  q.then=(ok,ko)=>Promise.resolve(repondre(st)).then(ok,ko);return q};
 return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},
  from,channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},
  storage:{from:()=>({createSignedUrl:()=>Promise.resolve({data:null,error:{message:'absent'}})})},functions:{invoke:()=>Promise.resolve({error:null})}}}};`;

let b;
(async()=>{
  b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
  await ctx.route('**/*',r=>{const u=r.request().url();
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:FAUX,contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^https:\/\/app\.local\/([^?#]*)/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();p.setDefaultTimeout(15000);const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('dialog',d=>d.accept());
  await p.goto('https://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  await p.mouse.move(4,450);await p.waitForTimeout(300);await p.click('nav.bot >> text=PROSPECTS');
  await p.click('button:has-text("Rénovation (1)")');
  await p.click('text=Maison Fictif - Alençon');
  await p.waitForSelector('text=3. VOTRE CHIFFRAGE');
  await p.waitForSelector('.etat-partage');
  await p.waitForFunction(()=>/ouvert par le client 2 fois/.test(document.querySelector('.etat-partage').textContent));
  chk(true,'fiche prospect : « dossier envoyé · ouvert par le client 2 fois »');
  await p.locator('.card').filter({hasText:'3. VOTRE CHIFFRAGE'}).locator('button:has-text("Modifier")').first().click();
  await p.waitForSelector('.plan-visite');
  const bandeau=(await p.textContent('.plan-visite')).replace(/\s+/g,' ');
  chk(/Plan de la visite du 17\/11\/2026/.test(bandeau)&&/2 pièces, 37,5 m²/.test(bandeau),'le plan de la visite est annoncé au-dessus du quantitatif');
  await p.click('button:has-text("Saisir les quantités")');
  const qte=p.locator('input[aria-label="Quantité — Peinture mur (fictif)"]');
  await p.locator('tr').filter({hasText:'Peinture mur (fictif)'}).locator('[title="Modifier cette ligne"]').first().click();
  await p.waitForSelector('.quantite-plan');
  await p.selectOption('select[aria-label="Quantité depuis le plan — Peinture mur (fictif)"]','murs');
  chk(await qte.inputValue()==='72.5','murs de toute la maison : 72,5 m² (30,1 + 42,4)');
  chk(await p.locator('.regle-plan').count()===1,'la ligne porte le repère 📐 « d’après le plan »');
  await p.locator('.quantite-plan button:has-text("Cuisine")').click();
  chk(await qte.inputValue()==='30.1','pièce choisie (cuisine) : 30,1 m²');
  const entete=(await p.locator('label, .lbl, div').filter({hasText:/^QUANTITATIF — /}).first().textContent()).replace(/\s+/g,' ');
  chk(/436/.test(entete),'le montant du poste suit : 30,1 × 14,50 € = 436 € HT ('+entete.slice(0,40)+')');
  await p.screenshot({path:SORTIE+'/releve_chiffrage.png'});

  /* une quantité tapée à la main sur l'autre ligne ne suit pas le plan */
  await p.fill('input[aria-label="Quantité — Plinthe (fictif)"]','12');
  chk(await p.locator('.regle-plan').count()===1,'quantité tapée à la main : pas de repère plan sur cette ligne');

  await p.click('button:has-text("Enregistrer")');
  await p.waitForFunction(()=>window.__ecrits.length>0);
  const ecrit=await p.evaluate(()=>window.__ecrits.at(-1));
  const po=ecrit.prospects.find(x=>x.id==='pA').postes[0];
  const l1=po.quantitatif.lignes.find(l=>l.id==='l1'), l2=po.quantitatif.lignes.find(l=>l.id==='l2');
  chk(l1.qt===30.1&&l1.regle&&l1.regle.grandeur==='murs'&&l1.regle.pieces.join()==='p1','enregistré : quantité et règle du plan (murs de la cuisine)');
  chk(+l2.qt===12&&!l2.regle,'la quantité tapée à la main est gardée telle quelle, sans règle');
  chk(Math.abs(po.montant-(30.1*14.5+12*8))<0.01,'montant du poste enregistré : '+po.montant+' € HT');

  /* le chiffrage interne en Excel : téléchargé d'un clic, depuis la fiche */
  const bx=p.locator('button.chiffrage-xlsx');
  if(await bx.count()){
    const [dl]=await Promise.all([p.waitForEvent('download'),bx.first().click()]);
    const f=await dl.path();const taille=f?require('fs').statSync(f).size:0;
    chk(/^Chiffrage_interne_.*\.xlsx$/.test(dl.suggestedFilename())&&taille>1000,'« Exporter en Excel » : le classeur se télécharge ('+dl.suggestedFilename()+', '+taille+' octets)');
  } else chk(false,'le bouton « Exporter en Excel » est sur la fiche');

  /* puis on tape à la main sur la ligne réglée : elle cesse de suivre le plan */
  await p.click('text=Maison Fictif - Alençon').catch(()=>{});
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
