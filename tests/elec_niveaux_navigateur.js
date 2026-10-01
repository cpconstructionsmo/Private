/* Vérification dans Chromium : un dossier fictif à étage (RDC + Étage, chacun
   avec son fond et ses pièces, l'escalier relié d'un niveau à l'autre) et un
   marché « Électricité ». Un clic génère les DEUX niveaux (quantitatif N / N
   pour toute la maison), l'escalier reçoit sa commande d'étage reliée au
   point lumineux du RDC ; Annuler défait les deux niveaux d'un coup ; la
   pièce se garde comme « modèle Chambre CP » ; le PDF sort une page par
   niveau plus la légende ; un niveau s'ajoute et se retire. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules', SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const P=(id,type,nom,x0,y0,x1,y1,portes,fenetres,extra)=>({id,type,nom,x0,y0,x1,y1,portes:portes||[],fenetres:fenetres||[],...(extra||{})});
const d=(id,cote,x,y,poignee)=>({id,cote,x,y,poignee});
const f=(id,cote,x,y)=>({id,cote,x,y,vr:true});
const RDC=[
  P('cel','Cellier / buanderie','Cellier',.20,.15,.32,.35,[d('d1','bas',.26,.35,'gauche')]),
  P('gar','Garage','Garage',.20,.35,.35,.70,[d('d2','droite',.35,.62,'droite')]),
  P('cui','Cuisine','Cuisine',.32,.15,.50,.35,[d('d4','droite',.50,.30,'gauche')],[f('f1','haut',.41,.15)]),
  P('sej','Séjour','Séjour',.50,.15,.80,.50,[d('d5','bas',.56,.50,'droite')],[f('f2','haut',.60,.15),f('f3','haut',.72,.15)]),
  P('ent','Entrée','Entrée',.35,.55,.45,.70,[d('d6','bas',.40,.70,'gauche'),d('d7','droite',.45,.60,'droite')]),
  P('deg','Dégagement','Dégagement',.45,.50,.62,.58,[d('d8','haut',.50,.50,'gauche')]),
  P('wc','WC','WC',.55,.58,.62,.66,[d('d11','haut',.585,.58,'gauche')]),
  P('esc0','Escalier','Escalier (RDC)',.62,.50,.70,.66,[d('d15','gauche',.62,.54,'droite')],[],{relie:{niveau:'n1',piece:'esc1'}})];
const ETAGE=[
  P('pal','Dégagement','Palier',.40,.40,.62,.48,[d('e1','droite',.62,.44,'gauche')]),
  P('ch1','Chambre','Chambre 1',.20,.15,.40,.40,[d('e2','bas',.30,.40,'gauche')],[f('f4','haut',.30,.15)]),
  P('ch2','Chambre','Chambre 2',.40,.15,.60,.40,[d('e3','bas',.50,.40,'droite')],[f('f5','haut',.50,.15)]),
  P('ch3','Chambre','Chambre 3',.20,.48,.40,.75,[d('e4','haut',.30,.48,'gauche')],[f('f6','bas',.30,.75)]),
  P('sdb','Salle de bains','Salle de bains',.40,.48,.55,.66,[d('e5','haut',.47,.48,'gauche')]),
  P('esc1','Escalier','Escalier (étage)',.62,.40,.70,.56,[])];
const T=l=>({type:'titre',libelle:l});let n=0;const A=(c,l,q,pu)=>({id:'l'+(n++),type:'article',code:c,libelle:l,unite:'U',qt:q,pu:pu||50});
const LIGNES=[T('151 ELECTRICITÉ'),A('B_TAB','Tableau et distribution',1,1200),A('B_COM','Tableau communication grade 3',1,400),
  T('EXTERIEUR:'),A('X_EXT_ASA','Applique accès entrée (SA à témoin)',1),
  T('ENTREE:'),A('X_ENT_CVV','Point lumineux (V et V)',1),A('X_ENT_P16','Prise 10/16 A + T',1),
  T('DEGAGEMENT:'),A('X_DEG_CVV','Point lumineux (V et V)',1),
  T('ESCALIER :'),A('X_ESC_CVV','Point lumineux (V et V)',1),
  T('PALIER :'),A('X_PAL_CVV','Point lumineux (V et V)',1),A('X_PAL_P16','Prise 10/16 A + T',1),
  T('CUISINE :'),A('X_CUI_CVV','Point lumineux (V et V)',1),A('X_CUI_P16','Prise 10/16 A + T',6),A('X_CUI_P20','Prise 16/20 A + T',2),A('X_CUI_P32','Alimentation 32 A + T',1),
  T('SALLE DE BAINS:'),A('X_SDB_CSA','Point lumineux (SA)',1),A('X_SDB_P16','Prise 10/16 A + T',2),
  T('WC:'),A('X_WC_CSA','Point lumineux (SA)',1),
  T('SEJOUR:'),A('X_SEJ_CVV','Point lumineux (V et V)',2),A('X_SEJ_P16','Prise 10/16 A + T',8),
  T('CHAMBRES 1, 2 ET 3:'),A('X_CH_CVV','Point lumineux (V et V)',3),A('X_CH_P16','Prise 10/16 A + T',9),A('X_CH_RJ','Prise communication (GR3)',3),
  T('CELLIER :'),A('X_CEL_CVV','Point lumineux (V et V)',1),A('X_CEL_P20','Prise 16/20 A + T',2),
  T('GARAGE :'),A('X_GAR_CVV','Point lumineux (V et V)',1),A('X_GAR_P16','Prise 10/16 A + T',1),
  T('AUTRES :'),A('X_PAC','Alimentation pompe à chaleur',1),A('X_VR','Alimentation volet roulant',6)];
const DATA={chantiers:[{id:'c1',nom:'Maison Fictive',statut:'chantier',client:'M. Fictif',adresse:'1 rue Fictive, 00000 Villefictive',
  docs:{plan_elec:{plan:{fond:'fond1',ratio:0.74,etage:'RDC',symboles:[],cables:[],pieces:RDC,calib:{x1:.2,y1:.15,x2:.8,y2:.15,metres:17.9,fond:'fond1',le:'2026-09-30'}},
    niveaux:[{id:'n1',plan:{fond:'fond2',ratio:0.74,etage:'Étage',symboles:[],cables:[],pieces:ETAGE}}]}}}],
  artisans:[{id:'a1',nom:'EI Fictive'}],marches:[{id:'m1',chantierId:'c1',lot:'Électricité',numero:7,artisanId:'a1',montantHT:9000,quantitatif:{lignes:LIGNES}}],prospects:[]};
const FAUX_SUPA=`window.supabase={createClient:()=>{const q={select:()=>q,eq:()=>q,single:()=>Promise.resolve({data:{data:${JSON.stringify(DATA)}},error:null}),
 upsert:()=>Promise.resolve({error:null})};return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},
 storage:{from:()=>({createSignedUrl:()=>Promise.resolve({data:{signedUrl:'http://app.local/tests/fixtures/paysage.jpg'},error:null}),
   upload:()=>Promise.resolve({error:null}),remove:()=>Promise.resolve({})})}}}};`;
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:1280,height:1000}});
  await ctx.route('**/*',r=>{const u=r.request().url();
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:FAUX_SUPA,contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^http:\/\/app\.local\/(.*?)(\?.*)?$/);
    if(m){const f2=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f2)&&fs.statSync(f2).isFile())return r.fulfill({path:f2});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('dialog',dl=>dl.accept(dl.defaultValue()));
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:60000});
  await p.mouse.move(4,450);await p.waitForTimeout(300);
  await p.locator('nav.bot >> text=CHANTIERS').first().click();await p.waitForTimeout(300);
  await p.click('text=Maison Fictive');await p.click('button.tab:has-text("PIÈCES")');
  await p.click('text=/Ouvrir le plan/');await p.waitForSelector('text=Préparer le plan');
  await p.waitForTimeout(500);
  const norm=s=>s.replace(/\s+/g,' ');
  const Q=async()=>norm(await p.textContent('.elec-quantitatif'));
  const symboles=()=>p.locator('.elec-zone svg g[transform^="translate"]').count();
  const niveau=nom=>p.locator('.elec-niveaux button',{hasText:nom}).first();
  chk(await niveau('RDC').count()===1&&await niveau('Étage').count()===1,'barre des niveaux : RDC et Étage');

  /* un clic : les deux niveaux */
  await p.click('button:has-text("✨ Générer automatiquement le plan électrique")');
  await p.waitForSelector('text=PLAN ÉLECTRIQUE GÉNÉRÉ',{timeout:20000});
  const tg=norm(await p.textContent('.elec-generation'));
  chk(/Niveaux.*RDC, Étage/.test(tg)&&/14 pièces/.test(tg)&&/1 liaison entre niveaux/.test(tg),'progression : 2 niveaux, 14 pièces, la liaison d’escalier entre niveaux');
  const q1=await Q();const m1=q1.match(/(\d+) \/ (\d+) conformes/);
  chk(m1&&m1[1]===m1[2]&&+m1[2]>=55&&/Chambre 2.*PC 2P\+T 16A3 \/ 3/.test(q1),'quantitatif de toute la maison : '+(m1?m1[0]:'?')+', chambres de l’étage comprises');
  const nR=await symboles();
  chk(nR>=40,'RDC : '+nR+' symboles dessinés');
  await niveau('Étage').click();await p.waitForTimeout(300);
  const nE=await symboles();
  chk(nE>=20&&nE!==nR,'Étage : '+nE+' symboles, sur son propre fond');
  chk(/↕ RDC/.test(await p.textContent('.elec-zone')),'escalier : la commande d’étage porte « ↕ RDC » (reliée au point lumineux du RDC)');

  /* Annuler : les deux niveaux d'un coup */
  await p.click('button[title="Annuler (Ctrl+Z)"]');await p.waitForTimeout(300);
  chk(await symboles()===0&&/Aucune base/.test(await Q()),'Annuler : étage vidé, programme retiré');
  await niveau('RDC').click();await p.waitForTimeout(200);
  chk(await symboles()===0,'… et le RDC aussi, du même geste');
  await p.click('button[title="Rétablir (Ctrl+Y)"]');await p.waitForTimeout(300);
  chk(await symboles()===nR&&/(\d+) \/ \1 conformes/.test(await Q()),'Rétablir : les deux niveaux reviennent');

  /* l'étage : escalier relié, modèle de disposition */
  await niveau('Étage').click();await p.waitForTimeout(200);
  await p.click('button:has-text("Préparer le plan")');
  chk(await p.locator('select[aria-label="Escalier relié"]').count()===1,'l’escalier de l’étage propose « Relié à l’escalier d’un autre niveau »');
  await p.locator('button:has-text("Enregistrer comme modèle Chambre CP")').first().click();await p.waitForTimeout(300);
  await p.click('button:has-text("Bibliothèque CP")');
  const tb=norm(await p.textContent('main'));
  chk(/MODÈLES DE DISPOSITION/.test(tb)&&await p.locator('.elec-disposition input[aria-label="Nom du modèle de disposition"]').inputValue()==='Chambre CP'
    &&await p.locator('.elec-disposition input[type=checkbox]').isChecked(),'« Enregistrer comme modèle Chambre CP » : rangé dans la bibliothèque, par défaut pour les chambres');
  await p.click('button:has-text("Préparer le plan")');
  chk(await p.locator('select[aria-label^="Modèle de disposition"]').count()===3,'chaque chambre propose le modèle de disposition');

  /* le PDF : une page par niveau, puis la légende */
  await p.click('button:has-text("Enregistrer le plan en PDF")');
  const lien=p.locator('a:has-text("Télécharger le PDF")');
  await lien.waitFor({timeout:60000});
  const href=await lien.getAttribute('href');
  const pdf=Buffer.from(href.split(',')[1],'base64').toString('latin1');
  const pages=(pdf.match(/\/Type \/Page /g)||[]).length;
  chk(pages===3,'PDF : '+pages+' pages (RDC, Étage, légende)');
  chk(/Plan-electrique-Maison-Fictive-indice-A/.test(await lien.getAttribute('download')),'PDF nommé avec l’indice');

  /* ajouter puis retirer un niveau */
  await p.click('button:has-text("+ Niveau")');await p.waitForTimeout(300);
  chk(await p.locator('.elec-niveaux button').count()>=4&&/Importez d’abord le plan d’implantation de ce niveau/.test(await p.textContent('main')),'+ Niveau : un troisième niveau, qui attend son plan de fond');
  await p.click('button:has-text("Retirer ce niveau")');await p.waitForTimeout(300);
  chk(await niveau('Étage 2').count()===0&&await niveau('Étage').count()===1,'retirer ce niveau : retour à RDC + Étage');
  await p.screenshot({path:SORTIE+'/elec_niveaux.png'});
  chk(!erreurs.length,'aucune erreur JavaScript'+(erreurs.length?' — '+erreurs.join(' | '):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
