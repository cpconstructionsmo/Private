/* Vérification dans Chromium, sur un dossier fictif complet (maison de 11
   pièces tracées avec portes et fenêtres, marché « Électricité » chiffré,
   aucun programme lu) : UN clic sur « ✨ Générer automatiquement le plan
   électrique » lit le DQE du marché, pose réellement chaque équipement sur
   le plan (le quantitatif passe de « aucune base » à N / N conformes), trace
   les liaisons et affiche la progression puis le résumé. Puis : Annuler
   défait tout le geste (base comprise) ; les points à vérifier mènent à
   l'équipement ; une proposition CP au-delà du DQE s'ajoute en option ;
   « Valider la proposition » enregistre la version V1 ; le verrouillage
   empêche tout déplacement ; « ↻ Régénérer » une pièce garde tout posé ;
   les calques masquent les liaisons. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules', SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const P=(id,type,nom,x0,y0,x1,y1,portes,fenetres)=>({id,type,nom,x0,y0,x1,y1,portes:portes||[],fenetres:fenetres||[]});
const d=(id,cote,x,y,poignee)=>({id,cote,x,y,poignee});
const f=(id,cote,x,y)=>({id,cote,x,y,vr:true});
const PIECES=[
  P('cel','Cellier / buanderie','Cellier',.20,.15,.32,.35,[d('d1','bas',.26,.35,'gauche')]),
  P('gar','Garage','Garage',.20,.35,.35,.70,[d('d2','droite',.35,.62,'droite'),d('d3','bas',.27,.70,'')]),
  P('cui','Cuisine','Cuisine',.32,.15,.50,.35,[d('d4','droite',.50,.30,'gauche')],[f('f1','haut',.41,.15)]),
  P('sej','Séjour','Séjour',.50,.15,.80,.50,[d('d5','bas',.56,.50,'droite')],[f('f2','haut',.60,.15),f('f3','haut',.72,.15)]),
  P('ent','Entrée','Entrée',.35,.55,.45,.70,[d('d6','bas',.40,.70,'gauche'),d('d7','droite',.45,.60,'droite')]),
  P('deg','Dégagement','Dégagement',.45,.50,.62,.58,[d('d8','haut',.50,.50,'gauche'),d('d9','bas',.60,.58,'droite')]),
  P('sdb','Salle de bains','Salle de bains',.45,.58,.55,.70,[d('d10','haut',.50,.58,'gauche')]),
  P('wc','WC','WC',.55,.58,.62,.66,[d('d11','haut',.585,.58,'gauche')]),
  P('ch1','Chambre','Chambre 1',.35,.70,.50,.85,[d('d12','haut',.40,.70,'gauche')],[f('f4','bas',.42,.85)]),
  P('ch2','Chambre','Chambre 2',.50,.70,.65,.85,[d('d13','haut',.55,.70,'droite')],[f('f5','bas',.57,.85)]),
  P('ch3','Chambre','Chambre 3',.65,.50,.80,.85,[d('d14','gauche',.65,.55,'gauche')],[f('f6','droite',.80,.70)])];
const T=l=>({type:'titre',libelle:l});let n=0;const A=(c,l,q,pu)=>({id:'l'+(n++),type:'article',code:c,libelle:l,unite:'U',qt:q,pu:pu||50});
const LIGNES=[T('151 ELECTRICITÉ'),A('B_TAB','Tableau et distribution',1,1200),A('B_COM','Tableau communication grade 3',1,400),
  T('EXTERIEUR:'),A('X_EXT_ASA','Applique accès entrée (SA à témoin)',2),A('X_GAR_ASA','Applique accès garage (SA à témoin)',1),
  T('ENTREE:'),A('X_ENT_CVV','Point lumineux (V et V)',1),A('X_ENT_P16','Prise 10/16 A + T',1),
  T('DEGAGEMENT:'),A('X_DEG_CVV','Point lumineux (V et V)',1),A('X_DEG_P16','Prise 10/16 A + T',1),
  T('CUISINE :'),A('X_CUI_CVV','Point lumineux (V et V)',1),A('X_CUI_HOT','Prise hotte',1),A('X_CUI_P16','Prise 10/16 A + T',7),A('X_CUI_P20','Prise 16/20 A + T',3),A('X_CUI_P32','Alimentation 32 A + T',1),
  T('SALLE DE BAINS:'),A('X_SDB_CSA','Point lumineux (SA)',1),A('X_SDB_ASA','Applique (SA)',1),A('X_SDB_P16','Prise 10/16 A + T',2),
  T('WC:'),A('X_WC_CSA','Point lumineux (SA)',1),
  T('SEJOUR:'),A('X_SEJ_CVV','Point lumineux (V et V)',2),A('X_SEJ_P16','Prise 10/16 A + T',10),A('X_SEJ_RJ','Prise communication (GR3)',2),
  T('CHAMBRES 1, 2 ET 3:'),A('X_CH_CVV','Point lumineux (V et V)',3),A('X_CH_P16','Prise 10/16 A + T',9),A('X_CH_RJ','Prise communication (GR3)',3),
  T('CELLIER :'),A('X_CEL_CVV','Point lumineux (V et V)',1),A('X_CEL_P16','Prise 10/16 A + T',1),A('X_CEL_P20','Prise 16/20 A + T',2),
  T('GARAGE :'),A('X_GAR_CVV','Point lumineux (V et V)',1),A('X_GAR_P16','Prise 10/16 A + T',1),A('X_GAR_PG','Alimentation porte de garage',1),
  T('AUTRES :'),A('X_PAC','Alimentation pompe à chaleur',1),A('X_TH','Alimentation thermostat',1),A('X_VR','Alimentation volet roulant',6),
  A('X_LEQ','Liaison équipotentielle',1),A('X_TV','Prise TV',2),A('X_CONSU','Demande de consuel',1),
  T('153 VENTILATION'),A('X_VMC','V.M.C. hygroréglable 3 sanitaires + cuisine',1),A('X_EA','Entrée d’air frais hygro-acoustique',4)];
const DATA={chantiers:[{id:'c1',nom:'Maison Fictive',statut:'chantier',client:'M. Fictif',
  docs:{plan_elec:{plan:{fond:'fond1',ratio:0.74,symboles:[],cables:[],pieces:PIECES,
    calib:{x1:.2,y1:.15,x2:.8,y2:.15,metres:17.9,fond:'fond1',le:'2026-09-30'}}}}}],
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
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('dialog',dl=>dl.accept());
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:60000});
  await p.mouse.move(4,450);await p.waitForTimeout(300);
  await p.locator('nav.bot >> text=CHANTIERS').first().click();await p.waitForTimeout(300);
  await p.click('text=Maison Fictive');await p.click('button.tab:has-text("PIÈCES")');
  await p.click('text=/Ouvrir le plan/');await p.waitForSelector('text=Préparer le plan');
  await p.waitForTimeout(500);
  const norm=s=>s.replace(/\s+/g,' ');
  const Q=async()=>norm(await p.textContent('.elec-quantitatif'));
  const symboles=()=>p.locator('.elec-zone svg g[transform^="translate"]').count();
  const liaisons=()=>p.locator('.elec-zone svg path[stroke-linecap="round"]').count();
  chk(/Aucune base/.test(await Q())&&await symboles()===0,'au départ : aucun programme, aucun équipement (0 posé)');

  /* un clic */
  await p.click('button:has-text("✨ Générer automatiquement le plan électrique")');
  await p.waitForSelector('text=PLAN ÉLECTRIQUE GÉNÉRÉ',{timeout:20000});
  const tg=norm(await p.textContent('.elec-generation'));
  chk(/Analyse du plan/.test(tg)&&/11 pièces/.test(tg)&&/DQE lu : marché n° 7/.test(tg)&&/Commandes/.test(tg)&&/Liaisons/.test(tg),'progression : plan, 11 pièces, portes, DQE lu du marché n° 7, familles, liaisons');
  chk(/PROPOSITION AUTOMATIQUE CP/.test(tg)&&/✓ DQE respecté : (\d+) \/ \1 conformes/.test(tg),'résumé : proposition automatique CP, DQE respecté');
  const q1=await Q();
  const m1=q1.match(/(\d+) \/ (\d+) conformes/);
  chk(m1&&m1[1]===m1[2]&&+m1[2]>=75&&!/manquant/.test(q1),'quantitatif : '+(m1?m1[0]:'?')+' (plus rien à 0)');
  const ns=await symboles();
  chk(ns>=100,'les symboles sont réellement dessinés sur le plan ('+ns+')');
  chk(await liaisons()>=20,'liaisons commande → éclairage tracées ('+(await liaisons())+')');
  chk(/Chambre 1.*PC 2P\+T 16A3 \/ 3/.test(q1)&&/Cuisine.*PC 20A four3 \/ 3/.test(q1),'quantitatif par pièce : chambre 1 prises 3 / 3, cuisine 20 A 3 / 3');

  /* Annuler (la barre) : tout le geste, base comprise ; Rétablir */
  await p.click('button[title="Annuler (Ctrl+Z)"]');await p.waitForTimeout(300);
  chk(/Aucune base/.test(await Q())&&await symboles()===0,'Annuler : équipements ET programme lu retirés d’un coup');
  await p.click('button[title="Rétablir (Ctrl+Y)"]');await p.waitForTimeout(300);
  chk(/(\d+) \/ \1 conformes/.test(await Q())&&await symboles()===ns,'Rétablir : tout revient');

  /* les points à vérifier mènent à l'équipement */
  await p.click('.elec-generation button:has-text("points à vérifier")');
  const tp=norm(await p.textContent('.elec-generation'));
  chk(/tableau|Tableau/.test(tp)&&/salle d’eau/.test(tp),'points à vérifier : tableau à valider, salle d’eau à contrôler…');
  await p.locator('.elec-generation button:has-text("Voir")').first().click();
  await p.waitForTimeout(200);
  chk(/position proposée automatiquement, à valider/.test(await p.textContent('main')),'« Voir » : l’équipement est sélectionné, sa fiche s’ouvre');

  /* proposition CP au-delà du DQE : jamais silencieuse, ajoutée en option */
  const tpro=norm(await p.textContent('.elec-propositions'));
  chk(/propositions? CP au-delà du DQE/.test(tpro),'propositions CP au-delà du DQE annoncées');
  await p.click('.elec-propositions button');
  const tpro2=norm(await p.textContent('.elec-propositions'));
  chk(/⚠ DQE : \d+ \/ Proposition CP : \d+/.test(tpro2),'format « ⚠ DQE : x / Proposition CP : y »');
  const avantOpt=await symboles();
  await p.locator('.elec-propositions button:has-text("en option")').first().click();await p.waitForTimeout(300);
  chk(await symboles()>avantOpt&&/en option, hors DQE : posé/.test(await p.textContent('.elec-generateur'))&&/\(option\)/.test(await Q()),'« Ajouter en option » : posé sur le plan, ligne « option » au quantitatif');
  chk(/(\d+) \/ \1 conformes/.test(await Q()),'le DQE reste la référence : toujours N / N conformes');

  /* valider la proposition : version V1 */
  await p.click('button:has-text("Régénérer")');
  await p.waitForSelector('text=PLAN ÉLECTRIQUE GÉNÉRÉ',{timeout:20000});
  await p.click('button:has-text("Valider la proposition")');await p.waitForTimeout(300);
  const tv=norm(await p.textContent('.elec-generateur'));
  chk(/version V1 enregistrée/.test(tv)&&/Versions du plan \(1\)/.test(tv),'valider : version V1 enregistrée');

  /* verrouiller : rien ne bouge */
  await p.click('button:has-text("🔒 Verrouiller le plan")');await p.waitForTimeout(200);
  chk(await p.locator('button:has-text("✨ Générer automatiquement le plan électrique")').isDisabled(),'plan verrouillé : la génération est bloquée');
  const g0=p.locator('.elec-zone svg g[style*="move"]').first();
  await g0.evaluate(e=>e.scrollIntoView({block:'center'}));
  const t0=await g0.locator('g[transform]').getAttribute('transform');
  const bx=await g0.boundingBox();
  await p.mouse.move(bx.x+bx.width/2,bx.y+bx.height/2);await p.mouse.down();
  await p.mouse.move(bx.x+bx.width/2+80,bx.y+bx.height/2+60,{steps:5});await p.mouse.up();await p.waitForTimeout(200);
  chk(await p.locator('.elec-zone svg g[style*="move"]').first().locator('g[transform]').getAttribute('transform')===t0,'verrouillé : glisser un équipement ne le déplace pas');
  await p.click('button:has-text("🔓 Déverrouiller")');

  /* régénérer une pièce depuis « Préparer le plan » */
  await p.click('button:has-text("Préparer le plan")');
  chk(await p.locator('button:has-text("+ Fenêtre")').count()===11,'« + Fenêtre » sur chaque pièce');
  chk(/Fenêtre 1 \(mur bas\)/.test(await p.textContent('main')),'fenêtres listées avec leur mur (volet roulant cochable)');
  await p.locator('button:has-text("↻ Régénérer")').nth(8).click();await p.waitForTimeout(300);
  chk(/(\d+) \/ \1 conformes/.test(await Q()),'↻ Régénérer la chambre 1 : toujours tout posé');

  /* calques */
  await p.click('button:has-text("Calques")');
  const avantL=await liaisons();
  await p.locator('.elec-calques label:has-text("Commandes éclairage") input').uncheck();await p.waitForTimeout(200);
  chk(avantL>0&&await liaisons()===0,'calque « Commandes éclairage » masqué : les liaisons disparaissent de l’écran');
  await p.locator('.elec-calques label:has-text("Commandes éclairage") input').check();

  /* contrôle : DQE / PLAN par équipement */
  await p.click('.elec-quantitatif button:has-text("Contrôler le plan")');
  await p.waitForSelector('.elec-partype');
  const tc=norm(await p.textContent('.elec-partype'));
  chk(/PC 2P\+T 16A\s*\d+\s*\d+/.test(tc)&&/✅/.test(tc),'DQE / PLAN par équipement affiché');
  await p.screenshot({path:SORTIE+'/elec_generateur.png'});
  chk(!erreurs.length,'aucune erreur JavaScript'+(erreurs.length?' — '+erreurs.join(' | '):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
