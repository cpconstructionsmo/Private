/* Deux appareils sur les mêmes données (un faux serveur partagé) : un
   téléphone resté en veille, qui n'a pas reçu les modifications de
   l'ordinateur, enregistre à son tour — rien ne doit être perdu. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules';
let serveur={data:{chantiers:[{id:'c1',nom:'Maison Leroux',statut:'travaux',map:{}}],marches:[],
  prospects:[{id:'p1',nom:'Maison Moualid',client:'Moualid',commune:'Valframbert',statut:'demande',postes:[],produits:[]}]},
  updated_at:'2026-09-28T08:00:00.000Z'};
let ecritures=0;
const FAUX_SUPA=`(()=>{const srv=(op,st)=>fetch('http://app.local/__srv/'+op,{method:'POST',body:JSON.stringify(st||{})}).then(r=>r.json());
 const q=()=>{const st={op:'select',f:{}};const b={select(c){if(st.op==='select')st.cols=c;return b},update(p){st.op='update';st.payload=p;return b},
  upsert(p){st.op='upsert';st.payload=p;return b},eq(k,v){st.f[k]=v;return b},single(){st.single=true;return b},
  then(res,rej){return srv(st.op,st).then(res,rej)}};return b};
 const subs=[];let vu=null;
 setInterval(()=>{if(window.__horsLigne)return;srv('select',{single:true}).then(r=>{const row=r.data;if(!row)return;
   if(vu===null){vu=row.updated_at;return}if(row.updated_at!==vu){vu=row.updated_at;subs.forEach(cb=>cb({new:row}))}})},300);
 window.__reprendre=()=>srv('select',{single:true}).then(r=>{vu=r.data.updated_at;window.__horsLigne=false});
 window.supabase={createClient:()=>({auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
  onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q(),
  channel:()=>({on(ev,f,cb){subs.push(cb);return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}})};})();`;
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const noteDe=(L,id)=>((L.find(x=>x.id===id)||{}).notesDossier||[]).map(n=>n.texte);
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const route=async ctx=>ctx.route('**/*',async r=>{const u=r.request().url();
    const s=u.match(/__srv\/(\w+)/);
    if(s){const st=JSON.parse(r.request().postData()||'{}');let rep;
      if(s[1]==='select')rep={data:st.single?serveur:[serveur],error:null};
      else if(s[1]==='update'){if(st.f.updated_at!==serveur.updated_at)rep={data:[],error:null};
        else{serveur={data:st.payload.data,updated_at:st.payload.updated_at};ecritures++;rep={data:[{updated_at:serveur.updated_at}],error:null}}}
      else{serveur={data:st.payload.data,updated_at:st.payload.updated_at};ecritures++;rep={data:[{updated_at:serveur.updated_at}],error:null}}
      return r.fulfill({body:JSON.stringify(rep),contentType:'application/json'})}
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:FAUX_SUPA,contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^http:\/\/app\.local\/(.*?)(\?.*)?$/);
    if(m){const f=path.join(R,decodeURIComponent(m[1]||'index.html'));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const ouvrir=async(opts)=>{const ctx=await b.newContext(opts);await route(ctx);const p=await ctx.newPage();
    p.erreurs=[];p.on('pageerror',e=>p.erreurs.push(String(e)));
    await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});return p};
  const A=await ouvrir({viewport:{width:1440,height:900}});
  const B=await ouvrir({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const menuA=async t=>{await A.mouse.move(4,450);await A.waitForTimeout(250);await A.click('nav.bot >> text='+t);await A.waitForTimeout(250)};
  const menuB=async t=>{if(!(await B.locator('nav.bot >> text='+t).isVisible()))await B.click('nav.bot >> text=PLUS');await B.click('nav.bot >> text='+t);await B.waitForTimeout(250)};
  const noter=async(p,texte)=>{const bl=p.locator('.notes-dossier');await bl.locator('textarea').first().fill(texte);
    await bl.locator('button:has-text("Ajouter la note")').click();await p.waitForTimeout(1500)};
  await B.waitForTimeout(800);
  /* 1. le téléphone passe en veille ; l'ordinateur écrit */
  await B.evaluate(()=>{window.__horsLigne=true});
  await menuA('CHANTIERS');await A.click('text=Maison Leroux');await noter(A,'Note ordinateur');
  chk(noteDe(serveur.data.chantiers,'c1').includes('Note ordinateur'),'ordinateur : note enregistrée sur le serveur');
  /* 2. le téléphone, resté sur l'ancienne version, écrit ailleurs */
  await menuB('PROSPECTS');await B.click('text=Maison Moualid');await noter(B,'Note téléphone');
  chk(noteDe(serveur.data.prospects,'p1').includes('Note téléphone')&&noteDe(serveur.data.chantiers,'c1').includes('Note ordinateur'),
    'téléphone en retard : sa note est ajoutée SANS effacer celle de l’ordinateur');
  /* 3. le téléphone voit la note de l'ordinateur, l'ordinateur celle du téléphone */
  await menuB('CHANTIERS');await B.click('text=Maison Leroux');await B.waitForTimeout(300);
  chk(/Note ordinateur/.test(await B.locator('.notes-dossier').textContent()),'téléphone : la note de l’ordinateur apparaît après la fusion');
  await A.waitForTimeout(900);await menuA('PROSPECTS');await A.click('text=Maison Moualid');await A.waitForTimeout(300);
  chk(/Note téléphone/.test(await A.locator('.notes-dossier').textContent()),'ordinateur : la note du téléphone arrive en temps réel');
  /* 4. même dossier des deux côtés */
  await B.evaluate(()=>{window.__horsLigne=true});
  await menuA('CHANTIERS');await A.click('text=Maison Leroux');await noter(A,'Deuxième note ordinateur');
  await noter(B,'Deuxième note téléphone');
  const n1=noteDe(serveur.data.chantiers,'c1');
  chk(['Note ordinateur','Deuxième note ordinateur','Deuxième note téléphone'].every(t=>n1.includes(t)),'même dossier modifié des deux côtés : les trois notes sont là ('+n1.length+')');
  /* 5. retour au premier plan : le téléphone relit ce qu'il a manqué */
  await B.evaluate(()=>{window.__horsLigne=true});
  await noter(A,'Note pendant la veille');
  await B.evaluate(()=>window.__reprendre());
  chk(!/Note pendant la veille/.test(await B.locator('.notes-dossier').textContent()),'(en veille, le téléphone ne l’a pas encore)');
  await B.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await B.waitForTimeout(800);
  chk(/Note pendant la veille/.test(await B.locator('.notes-dossier').textContent()),'retour au premier plan : le téléphone relit le serveur');
  /* 6. pas d'emballement */
  const avant=ecritures;await A.waitForTimeout(2000);
  chk(ecritures===avant,'aucune écriture en boucle ('+ecritures+' écritures au total)');
  chk(!A.erreurs.length&&!B.erreurs.length,'aucune erreur JavaScript '+A.erreurs.concat(B.erreurs).join(' | '));
  await b.close();
  console.log(ko?'\n'+ko+' echec(s)':'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
