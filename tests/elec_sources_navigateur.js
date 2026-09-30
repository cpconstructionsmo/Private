/* Vérification dans Chromium, sur un dossier fictif, avec un faux Supabase
   (aucune connexion réelle) :
   - le DQE du marché et un descriptif (Excel) se contredisent : la
     contradiction s'affiche, on retient le descriptif, la décision est notée
     et le quantitatif suit ;
   - une règle saisie (avec sa source) est contrôlée à part du DQE ;
   - « Envoyer pour validation » : sans tables, l'échec est dit ; installé,
     le lien plan.html#t=… est créé, sans rien d'interne ;
   - la page du client : le plan, un équipement cliqué, une remarque, la
     validation de l'indice ; puis le relevé dans l'application. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const {charger}=require('./harness');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules', SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const M=charger(['zipEcrire']);

/* un descriptif fictif en Excel : 8 prises en cuisine au lieu de 7 */
const xlsx=(()=>{
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const rangs=[['ARTICLE','LIBELLÉ','QT','U','PU'],['CUISINE :'],['X1','Prise 10/16 A + T','8','U','52,50'],['X2','Prise 16/20 A + T','3','U','94,50'],
    ['SEJOUR :'],['X3','Prise 10/16 A + T','10','U','52,50']];
  const feuille='<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
    +rangs.map((r,i)=>'<row r="'+(i+1)+'">'+r.map((v,c)=>'<c r="'+String.fromCharCode(65+c)+(i+1)+'" t="inlineStr"><is><t>'+esc(v)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData></worksheet>';
  const f=(nom,txt)=>({nom,data:new TextEncoder().encode(txt)});
  return Buffer.from(M.zipEcrire([
    f('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    f('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    f('xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Descriptif" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    f('xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    f('xl/worksheets/sheet1.xml',feuille)]));
})();

const T=l=>({type:'titre',libelle:l});let n=0;
const A=(code,libelle,qt,pu)=>({id:'l'+(n++),type:'article',code,libelle,unite:'U',qt,pu});
const LIGNES=[T('CUISINE :'),A('D_17CUI_5P16','Prise 10/16 A + T',7,52.5),A('D_17CUI_5P20','Prise 16/20 A + T',3,94.5),T('SEJOUR:'),A('D_23SEJ_5P16','Prise 10/16 A + T',10,52.5)];
const DATA={chantiers:[{id:'c1',nom:'Maison Fictive',statut:'chantier',client:'M. Fictif',
  docs:{plan_elec:{plan:{fond:'fond1',ratio:0.667,symboles:[{id:'s1',type:'pc',x:0.12,y:0.12,h:30}],cables:[],
    pieces:[{id:'pC',type:'Cuisine',nom:'Cuisine',x0:.05,y0:.05,x1:.45,y1:.45},{id:'pS',type:'Séjour',nom:'Séjour',x0:.5,y0:.05,x1:.95,y1:.6}],
    calib:{x1:.05,y1:.05,x2:.45,y2:.05,metres:6,fond:'fond1',le:'2026-09-30'}}}}}],
  artisans:[{id:'a1',nom:'EI Fictive'}],marches:[{id:'m1',chantierId:'c1',lot:'Électricité',numero:3,artisanId:'a1',montantHT:1500,quantitatif:{lignes:LIGNES}}],prospects:[]};
const FAUX_SUPA=`window.__installe=false;window.__requetes=[];window.__remarques=[];window.__validations=[];
window.supabase={createClient:()=>{
 const repondre=st=>{const has=k=>st.ops.some(o=>o[0]===k);window.__requetes.push(st);
  if(st.table==='app_data'&&has('upsert'))return {error:null};
  if(st.table==='app_data')return {data:{data:${JSON.stringify(DATA)}},error:null};
  if(/^plan_/.test(st.table)&&!window.__installe)return {data:null,error:{code:'42P01',message:'relation "public.'+st.table+'" does not exist'}};
  if(st.table==='plan_publications'&&has('insert'))return {data:{id:'pub1'},error:null};
  if(st.table==='plan_publications'&&has('update'))return {data:[{id:'pub1'}],error:null};
  if(st.table==='plan_remarques'&&has('update'))return {data:[{id:1}],error:null};
  if(st.table==='plan_remarques')return {data:window.__remarques,error:null};
  if(st.table==='plan_validations')return {data:window.__validations,error:null};
  return {data:[],error:null}};
 const from=table=>{const st={table,ops:[]};const q={};
  ['select','eq','order','limit','insert','update','upsert','single','maybeSingle','in','gte','lte','neq'].forEach(k=>{q[k]=(...a)=>{st.ops.push([k,a]);return q}});
  q.then=(ok,ko)=>Promise.resolve(repondre(st)).then(ok,ko);return q};
 return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},
 storage:{from:()=>({createSignedUrl:()=>Promise.resolve({data:{signedUrl:'https://app.local/tests/fixtures/paysage.jpg'},error:null}),
   upload:()=>Promise.resolve({error:null}),remove:()=>Promise.resolve({})})},functions:{invoke:()=>Promise.resolve({error:null})}}}};`;

/* le « serveur » de la page client, simulé ici */
let PUB=null,JETON='';const remarques=[],validations=[];
const fonction=c=>{
  if(c.t!==JETON||!PUB)return [404,{erreur:'lien_invalide'}];
  if(c.action==='lire')return [200,{publication:PUB,fond:'https://app.local/tests/fixtures/paysage.jpg',statut:'ouvert',remarques,validations}];
  if(c.action==='remarquer'){remarques.push({id:remarques.length+1,indice:PUB.indice,symbole_id:c.symboleId||null,x:c.x,y:c.y,texte:c.texte,auteur:c.auteur,cree_le:'2026-09-30T12:00:00Z'});return [200,{ok:true}]}
  if(c.action==='valider'){validations.push({indice:PUB.indice,nom:c.nom,cree_le:'2026-09-30T12:05:00Z'});return [200,{ok:true}]}
  return [400,{erreur:'action'}];
};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:1280,height:1000}});
  await ctx.route('**/*',async r=>{const u=r.request().url();
    if(/functions\/v1\/plan-validation/.test(u)){
      if(r.request().method()==='OPTIONS')return r.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},body:'ok'});
      const [st,corps]=fonction(JSON.parse(r.request().postData()||'{}'));
      return r.fulfill({status:st,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(corps)});
    }
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:FAUX_SUPA,contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^https:\/\/app\.local\/(.*?)(\?.*)?(#.*)?$/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));
      if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f,contentType:/\.js$/.test(f)?'text/javascript':undefined});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('dialog',d=>d.accept());
  await p.goto('https://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:60000});
  await p.mouse.move(4,450);await p.waitForTimeout(300);
  await p.locator('nav.bot >> text=CHANTIERS').first().click();await p.waitForTimeout(300);
  await p.click('text=Maison Fictive');await p.click('button.tab:has-text("PIÈCES")');
  await p.click('text=/Ouvrir le plan/');await p.waitForSelector('text=Préparer le plan');
  const norm=s=>s.replace(/\s+/g,' ');

  /* le DQE, puis le descriptif qui le contredit */
  await p.click('button:has-text("Programme électrique (DQE)")');
  await p.selectOption('select:has(option[value="dqe"])','dqe');
  await p.click('button:has-text("Lire le DQE du marché n° 3")');
  await p.click('button:has-text("Créer le programme depuis ce DQE")');
  await p.waitForSelector('text=Programme créé depuis le DQE');
  await p.setInputFiles('text=Comparer avec un autre document >> input[type=file]',{name:'descriptif.xlsx',
    mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:xlsx});
  await p.waitForSelector('text=CONTRADICTION ENTRE DOCUMENTS',{timeout:20000});
  const tc=norm(await p.textContent('.elec-contradictions'));
  chk(/CUISINE · PC 2P\+T 16A : DQE 7, « descriptif\.xlsx » 8/.test(tc)&&!/20A/.test(tc),'contradiction affichée : cuisine, DQE 7 prises, descriptif 8 (le reste concorde)');
  await p.click('button:has-text("Retenir l’autre document (8)")');
  await p.waitForTimeout(300);
  chk(/« descriptif\.xlsx » retenu/.test(await p.textContent('main')),'la décision est notée dans l’historique du dossier');
  chk(/PC 2P\+T 16A1 \/ 8 🔴/.test(norm(await p.textContent('.elec-quantitatif'))),'le quantitatif suit la quantité retenue : 1 / 8');

  /* une règle saisie, contrôlée à part */
  await p.click('button:has-text("Bibliothèque CP")');
  await p.click('button:has-text("+ Règle")');
  await p.waitForTimeout(300);
  const regle=p.locator('.card:has(input[placeholder^="Norme"])').last();
  await regle.locator('input[placeholder^="Norme"]').fill('Norme fictive');
  await regle.locator('select[aria-label="Pièce"]').selectOption('Cuisine');
  await regle.locator('select[aria-label="Équipement"]').selectOption('pc');
  await regle.locator('input[inputmode="numeric"]').fill('20');
  await regle.locator('input[placeholder^="Source"]').fill('Source fictive');
  await p.waitForTimeout(300);
  await p.locator('button:has-text("Contrôler le plan")').first().click();
  const tr=norm(await p.textContent('.elec-reglementaire'));
  chk(/Cuisine — .*Point à vérifier.*Norme fictive.*Source fictive.*vérification à dater/.test(tr),'contrôle réglementaire à part : point à vérifier, norme et source, vérification à dater');

  /* envoyer pour validation */
  await p.click('button:has-text("Envoyer pour validation")');
  await p.waitForSelector('text=Validation en ligne non installée',{timeout:20000});
  chk(!(await p.locator('input[aria-label="Lien de validation"]').count()),'tables absentes : l’échec est dit, aucun lien présenté');
  await p.evaluate(()=>{window.__installe=true});
  await p.click('button:has-text("Envoyer pour validation")');
  await p.waitForSelector('text=Plan publié, indice',{timeout:20000});
  const lien=await p.locator('input[aria-label="Lien de validation"]').inputValue();
  chk(/^https:\/\/app\.local\/plan\.html#t=[A-Za-z0-9_-]{43}$/.test(lien),'lien personnel : plan.html#t=<jeton>');
  const ins=await p.evaluate(()=>window.__requetes.filter(r=>r.table==='plan_publications'&&r.ops.some(o=>o[0]==='insert')).pop().ops.find(o=>o[0]==='insert')[1][0]);
  chk(/^[0-9a-f]{64}$/.test(ins.jeton_hash)&&!/article|D_17CUI|categorie|statut/.test(JSON.stringify(ins.publication))&&ins.publication.symboles.length>=1,'publié : l’empreinte du jeton, le plan, rien d’interne');
  PUB=ins.publication;JETON=lien.split('#t=')[1];

  /* la page du client */
  const c=await ctx.newPage();c.on('pageerror',e=>erreurs.push('client : '+String(e)));c.on('dialog',d=>d.accept());
  await c.setViewportSize({width:390,height:844});
  await c.goto(lien);await c.waitForSelector('text=POUR VALIDATION');
  await c.waitForSelector('[data-symbole]');
  chk(await c.locator('[data-symbole]').count()===PUB.symboles.length&&/Légende/.test(await c.textContent('main')),'le client voit le plan, ses symboles et la légende');
  await c.locator('[data-symbole]').first().dispatchEvent('click');
  await c.waitForSelector('text=Envoyer la remarque');
  await c.fill('textarea','Pouvez-vous déplacer cette prise près de la fenêtre ?');
  await c.click('button:has-text("Envoyer la remarque")');
  await c.waitForSelector('text=Pouvez-vous déplacer cette prise');
  chk(remarques.length===1&&remarques[0].symbole_id===PUB.symboles[0].id,'remarque enregistrée sur l’équipement cliqué');
  await c.fill('#nom','M. Fictif');
  await c.click('button:has-text("Je valide ce plan")');
  await c.waitForSelector('text=validé par M. Fictif');
  chk(validations.length===1&&validations[0].indice===PUB.indice,'validation de l’indice '+PUB.indice+' par le client');
  chk(!(await c.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)),'page client : pas de débordement horizontal');
  await c.screenshot({path:SORTIE+'/plan_client.png',fullPage:true});

  /* le relevé dans l'application */
  await p.evaluate(([R,V])=>{window.__remarques=R;window.__validations=V},[remarques,validations]);
  await p.click('button:has-text("Relever les remarques")');
  await p.waitForSelector('text=Pouvez-vous déplacer cette prise');
  const tv=await p.textContent('.elec-validation');
  chk(/Indice [A-Z] validé par M\. Fictif/.test(tv)&&/Marquer prise en compte/.test(tv),'l’application relève la remarque et la validation');
  await p.click('button:has-text("Reporter la validation de l’indice")');
  await p.waitForTimeout(300);
  chk(!(await p.locator('button:has-text("Reporter la validation de l’indice")').count()),'la validation client est reportée dans le dossier');
  chk(!erreurs.length,'aucune erreur JavaScript'+(erreurs.length?' — '+erreurs.join(' | '):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
