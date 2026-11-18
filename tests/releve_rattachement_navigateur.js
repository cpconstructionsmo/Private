/* Relevé de visite, étape 3 — rattachement aux prospects, dans Chromium,
   faux Supabase, clients fictifs :
   - le suivi (PROSPECTS) liste les visites à rattacher, propose le bon
     prospect (même téléphone…), dit ce qui sera complété, rattache sans rien
     remplacer, ou crée le prospect depuis la visite ;
   - la fiche prospect montre ses visites et lance une nouvelle visite ;
   - le relevé, ouvert par « Nouvelle visite » d'une fiche, reprend la fiche
     client du suivi sans jamais y écrire, et un rechargement ne crée pas de
     seconde visite ; « Ouvrir » rouvre la bonne visite. */
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
    'projet.types':['Isolation','Toiture'],'projet.delai':'Sous 3 mois',photoGarde:'g'})];

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

  /* ---------- le suivi ---------- */
  const ctx=await contexte(FAUX_SUIVI,{viewport:{width:1440,height:900}});
  const p=await ctx.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>erreurs.push('suivi : '+e));p.on('dialog',d=>d.accept());
  await p.goto('https://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  await p.mouse.move(4,450);await p.waitForTimeout(300);await p.click('nav.bot >> text=PROSPECTS');
  await p.waitForSelector('.visites-a-rattacher');
  chk((await p.textContent('.visites-a-rattacher')).includes('VISITES À RATTACHER (2)'),'PROSPECTS : deux visites à rattacher');
  chk(await p.getAttribute('a[title="Ouvrir le relevé de visite (iPhone)"]','href')==='releve/','bouton « Nouvelle visite » vers le relevé');
  const carte1=p.locator('.visite-a-rattacher').filter({hasText:'Anne FICTIF'});
  const t1=(await carte1.textContent()).replace(/\s+/g,' ');
  chk(/Même client que « Maison Fictif - Alençon »/.test(t1)&&/même téléphone/.test(t1),'le bon prospect est proposé : même téléphone (+33 reconnu)');
  chk(!/Maison Sans Rapport/.test(t1),'un prospect sans rapport n’est pas proposé');
  await carte1.getByRole('button',{name:'Rattacher',exact:true}).click();
  await carte1.locator('button:has-text("Confirmer le rattachement")').waitFor();
  const apercu=(await carte1.textContent()).replace(/\s+/g,' ');
  chk(/complète : e-mail, adresse, demande, enveloppe, adresse du projet \(cases vides seulement\)/.test(apercu),'avant de confirmer : ce qui sera complété (cases vides seulement)');
  chk(!(await p.evaluate(()=>window.__ecrits.length)),'rien n’est enregistré avant la confirmation');
  await carte1.locator('button:has-text("Confirmer le rattachement")').click();
  await p.waitForFunction(()=>window.__ecrits.length>0);
  let ecrit=await p.evaluate(()=>window.__ecrits.at(-1));
  let pA=ecrit.prospects.find(x=>x.id==='pA');
  chk(pA.visites&&pA.visites.length===1&&pA.visites[0].id==='vis-1','rattachée : le prospect garde le lien vers la visite');
  chk(pA.telClient==='06 12 34 56 78'&&pA.client==='Anne Fictif'&&pA.emailClient==='anne@exemple.fr'&&pA.adresseClient==='1 rue Imaginaire 61000 Alençon'&&pA.decouverte.enveloppe==='45000',
    'téléphone et nom gardés tels quels, e-mail, adresse et enveloppe complétés');
  chk(ecrit.prospects.length===2,'aucun prospect en double');
  await p.waitForSelector('.visites-prospect');
  chk((await p.textContent('.visites-prospect')).includes('VISITES (1)')&&await p.getAttribute('.visites-prospect a:has-text("Ouvrir")','href')==='releve/?visite=vis-1',
    'la fiche du prospect s’ouvre et montre sa visite (lien « Ouvrir »)');
  chk(await p.getAttribute('.visites-prospect a:has-text("Nouvelle visite")','href')==='releve/?prospect=pA','« Nouvelle visite » depuis la fiche, rattachée au dossier');
  await p.screenshot({path:SORTIE+'/releve_fiche_prospect.png'});

  await p.click('button:has-text("← Prospects")');
  await p.waitForSelector('.visites-a-rattacher');
  chk((await p.textContent('.visites-a-rattacher')).includes('VISITES À RATTACHER (1)'),'il reste une visite à rattacher');
  const carte2=p.locator('.visite-a-rattacher').filter({hasText:'Marc NOUVEAU'});
  chk(await carte2.locator('button:has-text("Créer le prospect")').count()===1,'nouveau client : « Créer le prospect »');
  await carte2.locator('button:has-text("Créer le prospect")').click();
  await p.waitForFunction(()=>window.__ecrits.length>1);
  ecrit=await p.evaluate(()=>window.__ecrits.at(-1));
  const np=ecrit.prospects.find(x=>(x.visites||[]).some(v=>v.id==='vis-2'));
  chk(np&&np.nom==='Maison NOUVEAU - Mayenne'&&np.client==='Marc NOUVEAU'&&np.categorie==='renovation'&&np.id,'prospect créé depuis la visite, rien à ressaisir');
  chk(np&&/Travaux : Isolation, Toiture/.test(np.demande)&&/Sous 3 mois/.test(np.demande),'la demande reprend les travaux et le délai');
  chk(ecrit.prospects.find(x=>x.id==='pA').visites.length===1,'le rattachement précédent est gardé');
  await p.waitForSelector('.visites-prospect');
  chk((await p.textContent('.visites-prospect')).includes('VISITES (1)'),'la fiche du nouveau prospect montre sa visite');

  /* ---------- le relevé, ouvert depuis une fiche prospect ---------- */
  const ctxR=await contexte(BIBLIO_RELEVE({appData:DATA}),{viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const r=await ctxR.newPage();r.setDefaultTimeout(15000);r.on('pageerror',e=>erreurs.push('relevé : '+e));
  await r.goto('https://app.local/releve/?prospect=pA');
  await r.waitForSelector('text=fiche client reprise du suivi');
  chk((await r.textContent('header .titre')).includes('Mme Anne Fictif'),'« Nouvelle visite » d’une fiche : la visite porte le nom du client');
  chk(await r.evaluate(()=>location.search)==='','l’adresse est nettoyée (un rechargement ne recrée rien)');
  await r.tap('#suivant');
  chk(await r.inputValue('input[name="client.telephone"]')==='06 12 34 56 78','fiche client reprise du suivi (téléphone)');
  const lignes=await (async()=>{for(let i=0;i<60;i++){const L=await r.evaluate(()=>Object.values(window.__etat.lignes||{}));if(L.length)return L;await r.waitForTimeout(100)}return []})();
  chk(lignes.length===1&&lignes[0].donnees.valeurs.prospectId==='pA','la visite part sur le serveur, rattachée au dossier pA');
  chk(!(await r.evaluate(()=>!!window.__etat.ecritureAppData)),'le relevé n’écrit jamais dans les données du suivi');
  const serveur=await r.evaluate(()=>JSON.stringify(window.__etat));
  await r.reload();await r.waitForSelector('.visite, #nouvelleVisite');
  chk(await r.evaluate(()=>new Promise(ok=>{const q=indexedDB.open('cp-releve',1);q.onsuccess=()=>{const t=q.result.transaction('visites').objectStore('visites').getAll();t.onsuccess=()=>ok(t.result.length)}}))===1,
    'rechargement : toujours une seule visite');

  /* « Ouvrir » depuis le suivi, sur un autre appareil */
  const ctxO=await contexte(`window.__etat=${serveur};${fauxSupabase.toString()};window.supabase={createClient:()=>fauxSupabase(window.__etat)};`,{viewport:{width:1280,height:900}});
  const o=await ctxO.newPage();o.setDefaultTimeout(15000);o.on('pageerror',e=>erreurs.push('ouvrir : '+e));
  await o.goto('https://app.local/releve/?visite='+lignes[0].id);
  await o.waitForSelector('.etapeNom');
  chk((await o.textContent('header .titre')).includes('Anne Fictif'),'« Ouvrir » : la visite s’ouvre directement, même sur un autre appareil');

  /* une fiche à deux acheteurs, avec l'adresse du projet distincte du domicile */
  const DATA2={...DATA,prospects:[{id:'pE',nom:'Maison Deux - Mayenne',categorie:'renovation',civilite:'Mme',client:'Jeanne DEUX',telClient:'06 44 44 44 44',
    adresseClient:'8 rue du Domicile 75000 Paris',commune:'Mayenne',afficherClient2:true,civilite2:'M.',client2:'Paul AUTRE',telClient2:'06 55 55 55 55',
    statut:'demande',demandeLe:'2026-11-01',postes:[],decouverte:{adresseProjet:'1 chemin des Travaux'}}]};
  const ctxE=await contexte(BIBLIO_RELEVE({appData:DATA2}),{viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const e2=await ctxE.newPage();e2.setDefaultTimeout(15000);e2.on('pageerror',e=>erreurs.push('relevé 2 : '+e));
  await e2.goto('https://app.local/releve/?prospect=pE');
  await e2.waitForSelector('text=fiche client reprise du suivi');
  await e2.tap('#suivant');
  chk(await e2.inputValue('input[name="client.adresse"]')==='1 chemin des Travaux'&&await e2.inputValue('textarea[name="client.domicile"]')==='8 rue du Domicile 75000 Paris','reprise du suivi : adresse du projet en adresse des travaux, domicile à part');
  chk(await e2.inputValue('input[name="acheteur2.nom"]')==='Paul AUTRE'&&await e2.inputValue('input[name="acheteur2.telephone"]')==='06 55 55 55 55','reprise du suivi : le 2e acheteur a sa fiche');

  chk(!erreurs.length,'aucune erreur dans les pages'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,500):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
