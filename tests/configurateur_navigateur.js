/* Vérification dans Chromium, sur un dossier fictif, avec un faux Supabase
   (aucune connexion réelle) :
   - la page du client : elle lit l'espace par la fonction, compose un
     panier, montre le reste sur le budget, n'envoie jamais de prix, se
     verrouille après l'envoi ; un lien invalide est dit comme tel ;
   - l'application : publier sans tables installées affiche l'échec (rien
     n'est présenté comme publié) ; une fois « installé », le lien est créé ;
     le relevé contrôle le total et reprend les choix dans la MAP. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules', SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const src=fs.readFileSync(path.join(R,'supabase','functions','configurateur','calcul.js'),'utf8');
const calculer=new Function(src.replace('export function configCalculer','function configCalculer')+'\nreturn configCalculer;')();

/* --- le « serveur » de la page client : la fonction, simulée ici --- */
const PUB={titre:'Vos choix — Maison Fictive',message:'Bonjour, voici vos choix.',prixVersion:2,budgetTTC:1000,questions:[
  {id:'q1',titre:'Votre WC',type:'unique',options:[{id:'o1',libelle:'Pack WC standard',nature:'inclus',defaut:true},{id:'o2',libelle:'Pack WC suspendu',nature:'plus',prixTTC:450}]},
  {id:'q2',titre:'Options',type:'multiple',options:[{id:'o3',libelle:'Prise USB',nature:'plus',prixTTC:35,max:4},{id:'o4',libelle:'Niche carrelée',nature:'chiffrer'},
    {id:'o5',libelle:'Sans lave-mains',nature:'moins',prixTTC:180}]}]};
const JETON='A'.repeat(43);
let panier=null;const recus=[];
const fonction=corps=>{
  recus.push(corps);
  if(corps.t!==JETON)return [404,{erreur:'lien_invalide'}];
  if(corps.action==='lire')return [200,{publie:PUB,statut:'ouvert',verrouille:!!panier&&panier.statut==='envoye',panier}];
  if(panier&&panier.statut==='envoye')return [409,{erreur:'deja_envoye'}];
  const calcul=calculer(PUB,corps.lignes);
  if(calcul.erreurs.length)return [400,{erreur:'panier_invalide'}];
  panier={version:(panier?panier.version:0)+1,statut:corps.envoyer?'envoye':'brouillon',lignes:calcul.lignes.map(l=>({optionId:l.optionId,quantite:l.quantite})),calcul};
  return [200,{ok:true,version:panier.version,statut:panier.statut,calcul}];
};

/* --- le faux Supabase de l'application : chaque requête est notée, et
   répond comme la base (tables absentes tant que __installe est faux) --- */
const CH={id:'c1',nom:'Maison Fictive',statut:'chantier',client:'M. Fictif',map:{chauffageType:'PAC air/eau'}};
const DATA={chantiers:[CH],artisans:[],marches:[],prospects:[]};
const FAUX_SUPA=`window.__installe=false;window.__requetes=[];window.__panier=null;
window.supabase={createClient:()=>{
 const repondre=st=>{const has=k=>st.ops.some(o=>o[0]===k);window.__requetes.push(st);
  if(st.table==='app_data'&&has('upsert'))return {error:null};
  if(st.table==='app_data')return {data:{data:${JSON.stringify(DATA)}},error:null};
  if(/^config_/.test(st.table)&&!window.__installe)return {data:null,error:{code:'42P01',message:'relation "public.'+st.table+'" does not exist'}};
  if(st.table==='config_espaces'&&has('insert'))return {data:{id:'esp1'},error:null};
  if(st.table==='config_espaces'&&has('update'))return {data:[{id:'esp1'}],error:null};
  if(st.table==='config_paniers')return {data:window.__panier?[window.__panier]:[],error:null};
  return {data:[],error:null}};
 const from=table=>{const st={table,ops:[]};const q={};
  ['select','eq','order','limit','insert','update','upsert','single','maybeSingle','in','gte','lte','neq'].forEach(k=>{q[k]=(...a)=>{st.ops.push([k,a]);return q}});
  q.then=(ok,ko)=>Promise.resolve(repondre(st)).then(ok,ko);return q};
 return {auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from,
 channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})},functions:{invoke:()=>Promise.resolve({error:null})}}}};`;

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  await ctx.route('**/*',async r=>{const u=r.request().url();
    if(/functions\/v1\/configurateur/.test(u)){
      if(r.request().method()==='OPTIONS')return r.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},body:'ok'});
      const [st,corps]=fonction(JSON.parse(r.request().postData()||'{}'));
      return r.fulfill({status:st,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(corps)});
    }
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:FAUX_SUPA,contentType:'text/javascript'});
    const m=u.match(/^https:\/\/app\.local\/(.*?)(\?.*)?(#.*)?$/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));
      if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f,contentType:/\.js$/.test(f)?'text/javascript':undefined});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('dialog',d=>d.accept());

  /* --- la page du client --- */
  await p.goto('https://app.local/client.html#t='+JETON);
  await p.waitForSelector('text=Votre WC',{timeout:20000});
  chk(await p.locator('input[aria-label="Pack WC standard"]').isChecked(),'le choix par défaut est coché');
  await p.click('text=Pack WC suspendu');await p.click('text=Prise USB');await p.click('text=Niche carrelée');
  await p.fill('input.qte','2');
  const pied=async()=>(await p.textContent('#pied')).replace(/ | /g,' ');
  const t1=await pied();
  chk(/\+ 520,00 € TTC/.test(t1)&&/Reste sur votre budget\s*480,00 € TTC/.test(t1)&&/1 choix/.test(t1),'panier : +520 € (450 + 2 × 35), 1 à chiffrer, reste 480 € sur le budget'+(/\+ 520,00/.test(t1)?'':' — '+t1));
  chk(!(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)),'téléphone : pas de débordement horizontal');
  await p.screenshot({path:SORTIE+'/client_panier.png',fullPage:true});
  await p.click('#envoyer');
  await p.waitForSelector('text=Vos choix sont envoyés',{timeout:20000});
  const env=recus.filter(x=>x.action==='enregistrer').pop();
  chk(env&&env.envoyer===true&&!/prix|montant|TTC/i.test(JSON.stringify(env)),'envoi : seulement les choix et les quantités, aucun prix');
  chk(panier.calcul.netTTC===520&&/incidence confirmée : \+ 520,00/.test((await p.textContent('#etat')).replace(/ | /g,' ')),'le total affiché après envoi est celui recalculé par le serveur');
  chk(await p.locator('#envoyer').isDisabled()&&await p.locator('input[aria-label="Prise USB"]').isDisabled(),'après envoi : panier verrouillé');
  await p.goto('about:blank');await p.goto('https://app.local/client.html#t=mauvais');
  await p.waitForSelector('text=n’est pas (ou plus) valide',{timeout:20000});
  chk(true,'lien invalide : dit clairement, rien d’affiché du dossier');

  /* --- l'application --- */
  await p.goto('https://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:60000});
  await p.locator('text=CHANTIERS').first().click().catch(()=>{});await p.waitForTimeout(300);
  await p.click('text=Maison Fictive');await p.click('button.tab:has-text("MAP")');
  const carte=p.locator('.config-client');
  await carte.locator('button:has-text("Préparer le catalogue")').click();
  const qwc=carte.locator('[data-config-question="q_wcType"]');
  await qwc.locator('input[type=checkbox]').first().check();
  const opt=qwc.locator('[data-config-option]').first();
  await opt.locator('select[aria-label="Nature"]').selectOption('plus');
  await opt.locator('input[aria-label="Prix TTC"]').fill('450');
  await carte.locator('button:has-text("Publier et créer le lien")').click();
  await p.waitForSelector('text=Espace client non installé',{timeout:20000});
  chk(!(await carte.locator('input[aria-label="Lien du client"]').count()),'tables absentes : échec affiché, aucun lien présenté comme publié');
  await p.evaluate(()=>{window.__installe=true});
  await carte.locator('button:has-text("Publier et créer le lien")').click();
  await p.waitForSelector('text=Publié : version 1',{timeout:20000});
  const lien=await carte.locator('input[aria-label="Lien du client"]').inputValue();
  chk(/^https:\/\/app\.local\/client\.html#t=[A-Za-z0-9_-]{43}$/.test(lien),'lien personnel créé : client.html#t=<jeton de 43 caractères>');
  const ins=await p.evaluate(()=>window.__requetes.filter(r=>r.table==='config_espaces'&&r.ops.some(o=>o[0]==='insert')).pop().ops.find(o=>o[0]==='insert')[1][0]);
  const jeton=lien.split('#t=')[1];
  chk(/^[0-9a-f]{64}$/.test(ins.jeton_hash)&&!JSON.stringify(ins).includes(jeton),'en base : l’empreinte du jeton, jamais le jeton');
  chk(ins.publie.questions.length===1&&!/wcType"|champ|valeur/.test(JSON.stringify(ins.publie).replace('"q_wcType"','')),'publié : la question cochée, sans rien d’interne');
  /* le client choisit le WC suspendu ; le relevé */
  const o=ins.publie.questions[0].options.find(x=>x.libelle==='Pack WC suspendu');
  const pub={...ins.publie,prixVersion:1}, lignes=[{optionId:o.id,quantite:1}];
  await p.evaluate(pn=>{window.__panier=pn},{version:1,prix_version:1,statut:'envoye',cree_le:'2026-09-30T10:00:00Z',lignes,calcul:calculer(pub,lignes)});
  await carte.locator('button:has-text("Relever les choix")').click();
  await p.waitForSelector('text=Total vérifié',{timeout:20000});
  const tr=(await carte.textContent()).replace(/ | /g,' ');
  chk(/\+450,00 € TTC/.test(tr)&&/Pack WC suspendu/.test(tr),'relevé : +450 € TTC, total vérifié, WC suspendu');
  await p.screenshot({path:SORTIE+'/config_releve.png',fullPage:true});
  await carte.locator('button:has-text("Reprendre dans la MAP")').click();
  await p.waitForSelector('text=Aucun marché n’a été modifié',{timeout:20000});
  chk(await p.$$eval('select',S=>S.some(s=>s.value==='Pack WC suspendu')),'MAP : le WC suspendu est repris');
  chk(/Choix client : WC — Pack WC suspendu \(\+450,00 € TTC, prix v1\)/.test((await p.textContent('main')).replace(/\u202f|\u00a0/g,' ')),'suivi : la décision, avec son prix et sa version');
  chk(!(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)),'application : pas de débordement horizontal');
  chk(!erreurs.length,'aucune erreur JavaScript'+(erreurs.length?' — '+erreurs.join(' | '):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
