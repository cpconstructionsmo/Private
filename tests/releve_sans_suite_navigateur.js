/* Visites à rattacher (suivi, PROSPECTS) : « Sans suite » et « Supprimer » —
   Chromium, faux Supabase, clients fictifs :
   - « Sans suite » : le contact devient un prospect archivé (motif
     sans suite), avec sa visite ; sa fiche le dit, sans « concurrent » ;
   - « 🗑 Supprimer » : retiré de la liste, aucun prospect créé ;
   - « Visites écartées » : une visite supprimée se remet d'un clic. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const {fauxSupabase}=require('./releve_faux_supabase');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules', SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};

const DATA={chantiers:[],artisans:[],commandes:[],marches:[],prospects:[
  {id:'pA',nom:'Maison Fictif - Alençon',categorie:'renovation',civilite:'Mme',client:'Anne Fictif',telClient:'06 12 34 56 78',
   emailClient:'',adresseClient:'',commune:'Alençon',statut:'demande',demandeLe:'2026-11-01',postes:[],decouverte:{}},
  {id:'pD',nom:'Maison Sans Rapport - Mayenne',categorie:'renovation',client:'Luc Rien',telClient:'07 00 00 00 00',statut:'demande',demandeLe:'2026-10-01',postes:[],decouverte:{}}]};
const visite=(id,valeurs)=>({id,maj_le:'2026-11-18T09:00:00Z',version:1,donnees:{id,schema:1,creeLe:'2026-11-17T09:30:00.000Z',
  valeurs:{statut:'terminee',etape:'fin',...valeurs},maj:{},pieces:{},photos:{'g':{id:'g',role:'garde',chemin:id+'/g.jpg'}}}});
const VISITES=[
  visite('vis-1',{'client.civilite':'Mme','client.nom':'FICTIF','client.prenom':'Anne','client.telephone':'+33 6 12 34 56 78',
    'client.email':'anne@exemple.fr','client.adresse':'1 rue Imaginaire','client.codePostal':'61000','client.ville':'Alençon',
    'projet.types':['Cuisine'],'projet.enveloppe':45000,photoGarde:'g'}),
  visite('vis-2',{'client.nom':'NOUVEAU','client.prenom':'Marc','client.telephone':'06 99 99 99 99','client.ville':'Mayenne',
    'projet.types':['Isolation','Toiture'],'projet.delai':'Sous 3 mois',photoGarde:'g'}),
  visite('vis-3',{'client.nom':'DOUBLON','client.prenom':'Paul','client.telephone':'06 55 55 55 55','client.ville':'Sées',photoGarde:'g'})];

/* le faux Supabase du suivi : app_data (lecture, écritures notées) et releve_visites */
const FAUX_SUIVI=`window.__ecrits=[];window.supabase={createClient:()=>{
 const repondre=st=>{const op=st.ops.find(o=>o[0]==='update'||o[0]==='upsert');
  if(st.table==='app_data'&&op){window.__ecrits.push(op[1][0].data);return {data:[{updated_at:op[1][0].updated_at}],error:null}}
  if(st.table==='app_data')return {data:{data:${JSON.stringify(DATA)},updated_at:'2026-11-18T08:00:00Z'},error:null};
  if(st.table==='releve_visites')return {data:${JSON.stringify(VISITES)},error:null};
  return {data:[],error:null}};
 const from=table=>{const st={table,ops:[]};const q={};
  ['select','eq','order','limit','insert','update','upsert','single','maybeSingle','in','gte','lte','neq'].forEach(k=>{q[k]=(...a)=>{st.ops.push([k,a]);return q}});
  q.then=(ok,ko)=>Promise.resolve(repondre(st)).then(ok,ko);return q};
 return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},
  from,channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},
  storage:{from:()=>({createSignedUrl:()=>Promise.resolve({data:{signedUrl:'https://stockage.local/garde.jpg'},error:null}),upload:()=>Promise.resolve({error:null})})},
  functions:{invoke:()=>Promise.resolve({error:null})}}}};`;
const BIBLIO_RELEVE=etat=>`window.__etat=window.__etat||${JSON.stringify(etat)};${fauxSupabase.toString()};window.supabase={createClient:()=>fauxSupabase(window.__etat)};`;

let b;
(async()=>{
  b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const erreurs=[];
  const contexte=async(biblio,opts)=>{const ctx=await b.newContext({serviceWorkers:'block',...opts});
    await ctx.route('**/*',r=>{const u=r.request().url();
      if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
      if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
      if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
      if(/supabase-js/.test(u))return r.fulfill({body:biblio,contentType:'text/javascript'});
      if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
      if(/stockage\.local/.test(u))return r.fulfill({path:path.join(__dirname,'fixtures','portrait.jpg'),contentType:'image/jpeg'});
      const m=u.match(/^https:\/\/app\.local\/([^?#]*)/);
      if(m){let f=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
        if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f,contentType:/\.js$/.test(f)?'text/javascript':/\.html$/.test(f)?'text/html':undefined});
        return r.fulfill({status:404,body:''})}
      return r.fulfill({status:204,body:''});});
    return ctx};

  const ctx=await contexte(FAUX_SUIVI,{viewport:{width:1440,height:900}});
  const p=await ctx.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>erreurs.push('suivi : '+e));
  const dialogues=[];p.on('dialog',d=>{dialogues.push(d.message());d.accept()});
  await p.goto('https://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  await p.mouse.move(4,450);await p.waitForTimeout(300);await p.click('nav.bot >> text=PROSPECTS');
  await p.waitForSelector('.visites-a-rattacher');
  chk((await p.textContent('.visites-a-rattacher')).includes('VISITES À RATTACHER (3)'),'PROSPECTS : trois visites à rattacher');
  const dernier=()=>p.evaluate(()=>window.__ecrits.at(-1));

  /* sans suite */
  const n0=await p.evaluate(()=>window.__ecrits.length);
  await p.locator('.visite-a-rattacher').filter({hasText:'Marc NOUVEAU'}).locator('.visite-sans-suite').click();
  await p.waitForFunction(n=>window.__ecrits.length>n,n0);
  let e=await dernier();
  const ss=e.prospects.find(x=>(x.visites||[]).some(v=>v.id==='vis-2'));
  chk(ss&&ss.statut==='perdu'&&ss.archive&&ss.archive.motif==='sans_suite'&&ss.archive.statutAvant==='demande'&&ss.client==='Marc NOUVEAU',
    '« Sans suite » : le contact devient un prospect archivé (sans suite), avec sa visite');
  chk(dialogues.some(m=>/Classer « Marc NOUVEAU » sans suite/.test(m)),'une confirmation dit ce qui se passe');
  await p.waitForFunction(()=>/VISITES À RATTACHER \(2\)/.test(document.querySelector('.visites-a-rattacher').textContent));

  /* supprimer, puis remettre */
  const n1=await p.evaluate(()=>window.__ecrits.length);
  await p.locator('.visite-a-rattacher').filter({hasText:'Paul DOUBLON'}).locator('.visite-supprimer').click();
  await p.waitForFunction(n=>window.__ecrits.length>n,n1);
  e=await dernier();
  chk((e.visitesIgnorees||[]).includes('vis-3')&&!e.prospects.some(x=>(x.visites||[]).some(v=>v.id==='vis-3')),'« Supprimer » : retirée de la liste, aucun prospect créé');
  await p.waitForFunction(()=>/VISITES À RATTACHER \(1\)/.test(document.querySelector('.visites-a-rattacher').textContent));
  await p.click('.visites-ecartees');
  await p.waitForSelector('.visite-ecartee >> text=Paul DOUBLON');
  const n2=await p.evaluate(()=>window.__ecrits.length);
  await p.click('.visite-ecartee button:has-text("Remettre dans la liste")');
  await p.waitForFunction(n=>window.__ecrits.length>n,n2);
  e=await dernier();
  chk(!(e.visitesIgnorees||[]).includes('vis-3'),'« Visites écartées » : une visite supprimée se remet d’un clic');
  await p.waitForFunction(()=>/VISITES À RATTACHER \(2\)/.test(document.querySelector('.visites-a-rattacher').textContent));
  await p.screenshot({path:SORTIE+'/visites_sans_suite.png'});

  /* la fiche du prospect sans suite */
  // le prospect est rangé dans l'onglet de catégorie ouvert (ici « Maison neuve ») : filtre « Archivés »
  chk(ss.categorie==='renovation','le prospect sans suite est rangé en « Rénovation » (une visite de relevé)');
  await p.locator('button',{hasText:/^Rénovation/}).first().click();
  await p.locator('button',{hasText:/^Archivés \(1\)$/}).first().click();
  await p.click('text=Maison NOUVEAU - Mayenne');
  await p.waitForSelector('.archive-prospect');
  const t=await p.textContent('.archive-prospect');
  chk(/Sans suite — archiver ce prospect/.test(t)&&!/CONCURRENT RETENU/.test(t)&&await p.isChecked('.archive-prospect input[type=checkbox]'),'sa fiche : « Sans suite » coché, sans « concurrent retenu » ; décocher le remet en cours');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
