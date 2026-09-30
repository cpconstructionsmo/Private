/* Vérification dans Chromium, sur un plan fictif : une porte marquée d'un
   clic (poignée à gauche), la proposition place les commandes à l'entrée et
   les relie aux éclairages ; une prise posée près d'un mur s'y accroche ; en
   mode « modification client », l'ajout devient la modification n°1 ;
   l'historique la garde ; la bibliothèque CP fixe la hauteur des prises et
   reçoit une prestation. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules', SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const DATA={chantiers:[{id:'c1',nom:'Maison Fictive',statut:'chantier',client:'M. Fictif',
  docs:{plan_elec:{plan:{fond:'fond1',ratio:0.667,symboles:[],cables:[],
    pieces:[{id:'sej',type:'Séjour',nom:'Séjour',x0:.1,y0:.1,x1:.6,y1:.6}],
    calib:{x1:.1,y1:.1,x2:.6,y2:.1,metres:7,fond:'fond1',le:'2026-09-30'}}}}}],artisans:[],marches:[],prospects:[]};
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
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('dialog',d=>d.accept());
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:60000});
  await p.mouse.move(4,450);await p.waitForTimeout(300);
  await p.locator('nav.bot >> text=CHANTIERS').first().click();await p.waitForTimeout(300);
  await p.click('text=Maison Fictive');await p.click('button.tab:has-text("PIÈCES")');
  await p.click('text=/Ouvrir le plan/');
  await p.waitForSelector('text=Préparer le plan');
  const svg=p.locator('svg[viewBox^="0 0 1000"]').first();
  await p.waitForTimeout(600);
  const bb=await svg.boundingBox();
  const clic=async(x,y)=>{await svg.scrollIntoViewIfNeeded();const b2=await svg.boundingBox();await p.mouse.click(b2.x+b2.width*x,b2.y+b2.height*y)};
  const H=1000*0.667;
  const poses=()=>p.evaluate(()=>[...document.querySelectorAll('.elec-zone svg g[transform]')].map(g=>{const m=(g.getAttribute('transform')||'').match(/translate\(([-\d.]+),([-\d.]+)\) rotate\(([-\d.]+)\)/);return m?{x:+m[1],y:+m[2],r:+m[3]}:null}).filter(Boolean));
  /* la porte, sur le mur du bas */
  await p.click('button:has-text("Préparer le plan")');
  await p.click('button:has-text("+ Porte")');
  await clic(0.35,0.595);
  chk(/Porte 1 \(mur bas\)/.test(await p.textContent('main')),'porte marquée sur le mur du bas');
  await p.selectOption('select[aria-label="Côté de la poignée"]','gauche');
  /* base et proposition */
  await p.click('button:has-text("Générer la base")');
  await p.selectOption('select:has(option[value="modele_cp"])','modele_cp');
  await p.click('button:has-text("Remplir la base avec le modèle CP")');
  await p.click('button:has-text("Préparer la proposition d’implantation")');
  const tp=await p.textContent('main');
  chk(/liaisons? commande → éclairage/.test(tp)&&/à valider/.test(tp),'proposition : liaisons commande → éclairage, positions à valider');
  await p.click('button:has-text("Appliquer")');await p.waitForTimeout(300);
  const chemins=await p.locator('.elec-zone svg path[stroke-linecap="round"]').count();
  chk(chemins>=2,'les liaisons sont tracées ('+chemins+')');
  const P=await poses();
  /* les va-et-vient du modèle séjour : près de la porte (x ≈ 350, y ≈ 400), côté poignée (à droite de l'écran) */
  chk(P.some(q=>Math.abs(q.y-0.6*H)<15&&q.x>350+40&&q.x<350+120),'commandes à l’entrée, côté poignée');
  /* accrochage : une prise lâchée près du mur du haut */
  await p.click('button:has-text("Prises")');
  await p.click('button[title^="PC 2P+T 16A"]');
  const avant=(await poses()).length;
  await clic(0.45,0.12);
  const P2=await poses();
  const neuve=P2.find(q=>!P.some(o=>o.x===q.x&&o.y===q.y));
  chk(P2.length===avant+1&&neuve&&Math.abs(neuve.y-0.1*H)<10&&neuve.r===180,'prise posée près du mur du haut : accrochée au mur, tournée vers la pièce');
  /* mode modification client */
  await p.click('button:has-text("Modification client")');
  await p.click('button[title^="RJ 45"]').catch(async()=>{await p.click('button:has-text("Prises")');await p.click('button[title^="RJ 45"]')});
  await clic(0.3,0.3);
  const th=await p.textContent('.elec-historique');
  chk(/Modification n°1/.test(th)&&/Ajout RJ 45/.test(th)&&/Séjour/.test(th),'modification client n°1 : ajout RJ 45, Séjour, hors DQE initial');
  await p.click('.elec-historique button:has-text("HISTORIQUE")');
  chk(/Ajout : RJ 45/.test(await p.textContent('.elec-historique')),'historique : l’ajout est noté');
  /* bibliothèque CP : hauteur des prises */
  await p.click('button:has-text("Mode modification client : actif")');
  await p.click('button:has-text("Bibliothèque CP")');
  await p.locator('label:has-text("PC 2P+T 16A") input').fill('25');
  await p.waitForTimeout(300);
  await p.click('button[title^="PC 2P+T 16A"]');
  await clic(0.585,0.35);
  const P3=await poses();
  const n3=P3.find(q=>!P2.some(o=>o.x===q.x&&o.y===q.y)&&Math.abs(q.x-590)<30);
  chk(!!n3&&Math.abs(n3.x-0.6*1000)<12,'prise près du mur droit : accrochée');
  await p.click('button:has-text("Sélection")');
  const g=p.locator('.elec-zone svg g[style*="move"]').last();
  await g.evaluate(e=>e.scrollIntoView({block:'center'}));await g.click({force:true});
  chk(await p.locator('input[type=number]').first().inputValue()==='25','nouvelle prise : hauteur de la bibliothèque CP (25 cm)');
  await p.click('button:has-text("Ajouter à la bibliothèque CP")');
  await p.waitForTimeout(300);
  chk(await p.locator('button:has-text("Bibliothèque CP")').count()>=2,'prestation ajoutée : un groupe « Bibliothèque CP » dans la barre d’outils');
  await p.screenshot({path:SORTIE+'/elec_implantation.png'});
  chk(!erreurs.length,'aucune erreur JavaScript'+(erreurs.length?' — '+erreurs.join(' | '):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
