/* Vérification dans Chromium : le plan électrique garde son dessin, et
   gagne l'assistant — tracer une pièce, étalonner, remplir la base avec le
   modèle CP, proposer l'implantation, vérifier les écarts ; Annuler rétablit
   l'état d'avant ; un équipement verrouillé ne bouge pas. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules', SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const DATA={chantiers:[{id:'c1',nom:'Maison Leroux',statut:'chantier',client:'M. Leroux',
  docs:{plan_elec:{plan:{fond:'fond1',ratio:0.667,symboles:[{id:'s1',type:'pc',x:0.12,y:0.12,h:30}],cables:[]}}}}],artisans:[],marches:[],prospects:[]};
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
  await p.click('text=Maison Leroux');await p.click('button.tab:has-text("PIÈCES")');
  await p.click('text=Ouvrir le plan (1 symboles)');
  await p.waitForSelector('text=Préparer le plan');
  const svg=p.locator('svg[viewBox^="0 0 1000"]').first();
  await p.waitForTimeout(600);
  const bb=await svg.boundingBox();
  const clic=async(x,y)=>{await svg.scrollIntoViewIfNeeded();const b2=await svg.boundingBox();await p.mouse.click(b2.x+b2.width*x,b2.y+b2.height*y)};
  chk(/Non à l’échelle : non étalonné/.test(await p.textContent('main')),'au départ : non à l’échelle');

  /* une pièce, puis l'étalonnage */
  await p.click('button:has-text("Préparer le plan")');
  await p.click('button:has-text("Tracer une pièce")');
  await clic(0.05,0.05);await clic(0.45,0.45);
  chk(await p.evaluate(()=>[...document.querySelectorAll('input')].some(i=>i.value==='Séjour')),'pièce tracée : « Séjour »');
  await p.click('button:has-text("Étalonner sur une cote connue")');
  await clic(0.05,0.05);await clic(0.45,0.05);
  await p.fill('input[placeholder="Longueur (m)"]','6');
  await p.click('button:has-text("Enregistrer l’échelle")');
  chk(/Échelle vérifiée/.test(await p.textContent('main')),'étalonné : « Échelle vérifiée »');

  /* base et proposition */
  await p.click('button:has-text("Générer la base")');
  await p.selectOption('select:has(option[value="modele_cp"])','modele_cp');
  await p.click('button:has-text("Remplir la base avec le modèle CP")');
  await p.click('button:has-text("Préparer la proposition d’implantation")');
  const txt=await p.textContent('main');
  chk(/à ajouter — le long des murs, statut « à confirmer »/.test(txt),'proposition : placée le long des murs, à confirmer');
  const avant=await p.locator('g[style*="cursor"] >> nth=0').count();
  await p.click('button:has-text("Appliquer")');
  await p.waitForTimeout(300);
  const nb=await p.textContent('text=/\\d+ symboles? posés?/');
  chk(/1[0-9] symboles posés/.test(nb),'appliqué : '+nb);
  /* l'étape de contrôle (renommée « Contrôler le plan ») : le rapport prévu / implanté */
  await p.locator('button:has-text("Contrôler le plan")').first().click();
  chk(/CONTRÔLE PLAN ÉLECTRIQUE/.test(await p.textContent('.elec-controle'))&&/PC 2P\+T/.test(await p.textContent('.elec-quantitatif')),'contrôle prévu / implanté affiché');

  /* annuler */
  await p.click('button:has-text("Annuler")');await p.waitForTimeout(300);
  chk(/1 symbole posé/.test(await p.textContent('main')),'Annuler : l’implantation proposée est retirée d’un coup');
  await p.click('button:has-text("Rétablir")');await p.waitForTimeout(300);
  chk(/1[0-9] symboles posés/.test(await p.textContent('main')),'Rétablir : elle revient');

  /* verrou : l'équipement d'origine ne se déplace plus */
  const s=await p.evaluate(()=>{const g=[...document.querySelectorAll('svg g')].find(x=>x.getAttribute('transform')&&/translate\(120,/.test(x.getAttribute('transform')));return !!g});
  chk(s,'le symbole d’origine est dessiné à sa place (dessin inchangé)');
  await clic(0.12,0.12);
  await p.click('text=Verrouillé (conservé par toute nouvelle génération)');
  const b3=await svg.boundingBox();
  await p.mouse.move(b3.x+b3.width*0.12,b3.y+b3.height*0.12);await p.mouse.down();
  await p.mouse.move(b3.x+b3.width*0.3,b3.y+b3.height*0.3,{steps:5});await p.mouse.up();
  const toujours=await p.evaluate(()=>[...document.querySelectorAll('svg g')].some(x=>/translate\(120,/.test(x.getAttribute('transform')||'')));
  chk(toujours,'verrouillé : il ne se déplace pas');
  await p.screenshot({path:SORTIE+'/elec_assistant.png'});
  chk(!erreurs.length,'aucune erreur JavaScript'+(erreurs.length?' — '+erreurs.join(' | '):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
