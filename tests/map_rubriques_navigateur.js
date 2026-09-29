/* Vérification dans Chromium : la MAP en rubriques repliables. Replier ne
   perd rien ; la recherche ouvre la rubrique et place le curseur ; le
   clavier suffit ; les panneaux ouverts sont retrouvés au rechargement ; la
   validation est distincte du renseigné ; rien ne déborde sur un téléphone. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules', SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const DATA={chantiers:[{id:'c1',nom:'Maison Leroux',statut:'chantier',client:'M. Leroux',map:{soubassement:'Vide sanitaire'}}],artisans:[],marches:[],prospects:[]};
const FAUX_SUPA=`window.supabase={createClient:()=>{const q={select:()=>q,eq:()=>q,single:()=>Promise.resolve({data:{data:${JSON.stringify(DATA)}},error:null}),
 upsert:()=>Promise.resolve({error:null})};return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}}}};`;
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:390,height:844}});
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
  await p.locator('text=CHANTIERS').first().click().catch(()=>{});await p.waitForTimeout(300);
  await p.click('text=Maison Leroux');await p.click('button.tab:has-text("MAP")');
  await p.waitForSelector('[data-rubrique="1"]');
  const ouvert=async id=>(await p.getAttribute('[data-rubrique="'+id+'"] .map-entete','aria-expanded'))==='true';
  const cache=async id=>await p.$eval('#map-rub-'+id,e=>e.hidden);
  chk(!(await ouvert('1'))&&await cache('1'),'identification repliée par défaut');
  const t1=await p.textContent('[data-rubrique="1"]');
  chk(/Maison Leroux/.test(t1)&&/M\. Leroux/.test(t1)&&/MAP non datée/.test(t1)&&/À compléter/.test(t1),'identification repliée : projet, client, date, ce qui manque');
  chk(await ouvert('3')&&!(await ouvert('2')),'la rubrique en alerte (vide sanitaire sans rangs) est ouverte d’office, pas les autres');
  chk(/Vide sanitaire : nombre de rangs/.test(await p.textContent('[data-rubrique="3"]')),'l’alerte est affichée');

  /* saisir, replier, rouvrir : rien de perdu */
  await p.click('[data-rubrique="2"] .map-entete');
  await p.fill('[data-champ="telecom"] input','3 fourreaux');
  await p.click('[data-rubrique="2"] .map-entete');
  chk(await cache('2'),'rubrique 2 repliée');
  chk(/3 fourreaux/.test(await p.textContent('[data-rubrique="2"] .map-entete')),'repliée : son résumé montre la saisie');
  await p.click('[data-rubrique="2"] .map-entete');
  chk(await p.inputValue('[data-champ="telecom"] input')==='3 fourreaux','rouverte : la saisie est intacte');

  /* clavier : Entrée sur l'en-tête */
  await p.focus('[data-rubrique="4"] .map-entete');await p.keyboard.press('Enter');
  chk(await ouvert('4'),'au clavier : Entrée ouvre la rubrique');
  await p.keyboard.press('Enter');
  chk(!(await ouvert('4')),'au clavier : Entrée la referme');

  /* recherche */
  await p.fill('input[aria-label="Chercher un champ de la MAP"]','couleur enduit');
  await p.click('button:has-text("Couleur enduit")');
  await p.waitForTimeout(400);
  chk(await ouvert('5'),'recherche : la rubrique 5 s’ouvre');
  chk(await p.evaluate(()=>!!document.activeElement.closest('[data-champ="enduitCouleur"]')),'recherche : le curseur est dans le champ');

  /* tout ouvrir / tout replier */
  await p.click('button:has-text("Tout ouvrir")');
  chk(!(await p.$$eval('.map-corps',E=>E.some(e=>e.hidden))),'tout ouvrir');
  await p.click('button:has-text("Tout replier")');
  chk(await p.$$eval('.map-corps',E=>E.every(e=>e.hidden)),'tout replier');

  /* points à traiter */
  await p.click('button:has-text("Points à traiter")');
  await p.click('button:has-text("nombre de rangs")');await p.waitForTimeout(300);
  chk(await ouvert('3')&&await p.evaluate(()=>!!document.activeElement.closest('[data-champ="vsRangs"]')),'points à traiter : ouvre la rubrique, curseur dans le champ en cause');

  /* validation distincte du renseigné */
  await p.click('[data-rubrique="2"] .map-entete');
  await p.click('[data-rubrique="2"] button:has-text("Valider la rubrique")');
  chk(/Validée le/.test(await p.textContent('[data-rubrique="2"] .map-entete')),'rubrique validée');
  await p.fill('[data-champ="telecom"] input','4 fourreaux');
  chk(/Modifiée depuis validation/.test(await p.textContent('[data-rubrique="2"] .map-entete')),'modifiée après validation : signalé');

  /* mémoire des panneaux */
  const avant=await p.$$eval('.map-rubrique',E=>E.map(e=>e.getAttribute('data-rubrique')+':'+!e.querySelector('.map-corps').hidden).join());
  await p.reload();await p.waitForSelector('[data-rubrique="1"]',{timeout:60000});
  const apres=await p.$$eval('.map-rubrique',E=>E.map(e=>e.getAttribute('data-rubrique')+':'+!e.querySelector('.map-corps').hidden).join());
  chk(avant===apres,'rechargement : mêmes panneaux ouverts');

  /* terrasse : saisie dans le gros-œuvre, retrouvée dans les extérieurs, une seule fois */
  if(!(await ouvert('3')))await p.click('[data-rubrique="3"] .map-entete');
  await p.selectOption('[data-champ="terrasseBeton"] select','Oui');
  await p.click('[data-rubrique="3"] button:has-text("+ Terrasse")');
  const carte=p.locator('[data-rubrique="3"] [data-ouvrage]').first();
  await carte.locator('input[placeholder="T1"]').fill('T1');
  await carte.locator('button:has-text("Option")').click();
  await carte.locator('select').first().selectOption('supplement');
  await carte.locator('input[placeholder="Laisser vide si inconnu"]').fill('2500');
  await p.click('[data-rubrique="10"] .map-entete');
  const n10=await p.locator('[data-rubrique="10"] [data-ouvrage]').count();
  chk(n10===1,'la terrasse apparaît dans les aménagements extérieurs (une fois)');
  const t10=await p.textContent('[data-rubrique="10"]');
  chk(/Options : 2\s500,00\s€ TTC/.test(t10.replace(/[\u202f\u00a0]/g,' '))||/2.500,00/.test(t10),'budget des extérieurs : l’option de 2 500 € une fois');
  await p.click('[data-rubrique="10"] .map-entete');
  chk(/options 2.500,00 € TTC/.test((await p.textContent('[data-rubrique="10"] .map-entete')).replace(/[\u202f\u00a0]/g,' ')),'repliée : l’incidence budgétaire dans l’en-tête');
  chk(!(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)),'téléphone : pas de débordement horizontal');
  await p.emulateMedia({media:'print'});
  chk(await p.$$eval('.map-corps',E=>E.every(e=>getComputedStyle(e).display!=='none')),'impression : toutes les rubriques dépliées');
  await p.emulateMedia({media:'screen'});
  await p.evaluate(()=>{const e=document.querySelector('.map-outils');window.scrollTo(0,e.getBoundingClientRect().top+window.scrollY-10)});
  await p.screenshot({path:SORTIE+'/map_rubriques.png',fullPage:false});
  chk(!erreurs.length,'aucune erreur JavaScript'+(erreurs.length?' — '+erreurs.join(' | '):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
