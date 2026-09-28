/* Google Agenda de bout en bout, contre un faux Google (agendas, événements,
   séries, etag/412, pannes) : connexion, lecture, création, modification,
   conflit, séries, suppression, lecture seule, sens Google → application,
   lien avec un dossier, reprise des anciens rendez-vous, déconnexion. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const R=path.resolve(__dirname,'..'), NM=__dirname+'/node_modules', SORTIE=require('os').tmpdir()+'/cp-tests';
const J=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const decalage=d=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Paris',timeZoneName:'shortOffset'}).formatToParts(new Date(d+'T12:00:00Z')).find(x=>x.type==='timeZoneName').value;
  const m=p.match(/GMT([+-]\d+)/);const h=m?+m[1]:0;return (h>=0?'+':'-')+String(Math.abs(h)).padStart(2,'0')+':00'};
const paris=(d,h)=>d+'T'+h+':00'+decalage(d);
/* ---- le faux Google ---- */
let n=0;const etag=()=>'"'+(++n)+'"';
const G={cals:[{id:'pro@cp.fr',summary:'pro@cp.fr',backgroundColor:'#039be5',accessRole:'owner',primary:true},
  {id:'perso-cal',summary:'Perso',backgroundColor:'#e67c73',accessRole:'owner'},
  {id:'feries-cal',summary:'Jours fériés',backgroundColor:'#33b679',accessRole:'reader'}],ev:{'pro@cp.fr':{},'perso-cal':{},'feries-cal':{}},masters:{}};
const pose=(cal,e)=>{G.ev[cal][e.id]={status:'confirmed',htmlLink:'https://calendar.google.com/event?eid='+e.id,...e,etag:etag()};return G.ev[cal][e.id]};
pose('pro@cp.fr',{id:'g1',summary:'Visite chantier Leroux',start:{dateTime:paris(J(2),'10:00')},end:{dateTime:paris(J(2),'11:00')}});
pose('feries-cal',{id:'f1',summary:'Jour férié test',start:{date:J(4)},end:{date:J(5)}});
G.masters['pro@cp.fr|rec1']={id:'rec1',summary:'Point hebdo',start:{dateTime:paris(J(1),'08:00')},end:{dateTime:paris(J(1),'08:30')},etag:etag()};
[1,8,15].forEach(k=>pose('pro@cp.fr',{id:'rec1_'+k,recurringEventId:'rec1',summary:'Point hebdo',start:{dateTime:paris(J(k),'08:00')},end:{dateTime:paris(J(k),'08:30')}}));
let panne=false;const requetes=[];
const norm=t=>t&&t.dateTime&&!/[+-]\d\d:\d\d$|Z$/.test(t.dateTime)?{dateTime:paris(t.dateTime.slice(0,10),t.dateTime.slice(11,16))}:t;
const json=(r,o,s)=>r.fulfill({status:s||200,body:o===null?'':JSON.stringify(o),contentType:'application/json'});
async function google(r,u){
  const url=new URL(u),m=r.request().method(),corps=JSON.parse(r.request().postData()||'null');
  requetes.push(m+' '+url.pathname+url.search);
  if(url.hostname==='oauth2.googleapis.com')return json(r,{});
  const p=decodeURIComponent(url.pathname).replace('/calendar/v3','');
  if(p==='/users/me/calendarList')return json(r,{items:G.cals});
  const mm=p.match(/^\/calendars\/(.+?)\/events(?:\/(.+))?$/);if(!mm)return json(r,{error:{message:'?'}},404);
  const cal=mm[1],id=mm[2],E=G.ev[cal];
  if(!E)return json(r,{error:{message:'agenda'}},404);
  const ecrit=m!=='GET';
  if(ecrit&&G.cals.find(c=>c.id===cal).accessRole==='reader')return json(r,{error:{message:'Forbidden'}},403);
  if(ecrit&&panne){panne=false;return json(r,{error:{message:'Backend Error'}},500)}
  const ifm=r.request().headers()['if-match'];
  if(!id){
    if(m==='GET')return json(r,{items:Object.values(E)});
    const nouvel={...corps,start:norm(corps.start),end:norm(corps.end),id:'n'+(++n)};
    if(corps.recurrence){G.masters[cal+'|'+nouvel.id]={...nouvel,etag:etag()};[0,7,14].forEach(k=>{const d=J(0);
      pose(cal,{...nouvel,id:nouvel.id+'_'+k,recurringEventId:nouvel.id,recurrence:undefined})});return json(r,{...G.masters[cal+'|'+nouvel.id],htmlLink:'https://g/'+nouvel.id})}
    return json(r,pose(cal,nouvel));
  }
  const master=G.masters[cal+'|'+id];
  if(master){
    if(m==='GET')return json(r,master);
    if(ifm&&ifm!==master.etag)return json(r,{error:{message:'Precondition'}},412);
    if(m==='DELETE'){Object.values(E).filter(e=>e.recurringEventId===id).forEach(e=>delete E[e.id]);delete G.masters[cal+'|'+id];return r.fulfill({status:204,body:''})}
    Object.assign(master,{...corps,start:norm(corps.start)||master.start,end:norm(corps.end)||master.end},{etag:etag()});
    Object.values(E).filter(e=>e.recurringEventId===id).forEach(e=>{e.summary=master.summary;e.location=master.location;e.description=master.description;
      if(corps.start){e.start={dateTime:e.start.dateTime.slice(0,11)+master.start.dateTime.slice(11)};e.end={dateTime:e.end.dateTime.slice(0,11)+master.end.dateTime.slice(11)}}e.etag=etag()});
    return json(r,master);
  }
  const e=E[id];if(!e)return json(r,{error:{message:'Not Found'}},404);
  if(m==='GET')return json(r,e);
  if(ifm&&ifm!==e.etag)return json(r,{error:{message:'Precondition Failed'}},412);
  if(m==='DELETE'){delete E[id];return r.fulfill({status:204,body:''})}
  Object.assign(e,{...corps,start:norm(corps.start)||e.start,end:norm(corps.end)||e.end},{etag:etag()});
  return json(r,e);
}
/* ---- le faux Supabase ---- */
let serveur={data:{chantiers:[{id:'c1',nom:'Maison Leroux',statut:'travaux',adresse:'12 rue des Lilas, Magny-le-Désert',map:{},jalons:[]}],marches:[],
  prospects:[{id:'p1',nom:'Maison Moualid',statut:'demande',commune:'Valframbert',postes:[],produits:[]}],
  rendezvous:[{id:'r1',titre:'Réunion notaire',date:J(3),heure:'10:00',heureFin:'11:00',client:'Moualid',lieu:'Alençon',type:'pro',notes:''},
    {id:'r2',titre:'Dentiste',date:J(5),heure:'17:00',heureFin:'',type:'perso',client:'',lieu:'',notes:''},
    {id:'r3',titre:'Visite chantier Leroux',date:J(2),heure:'10:00',heureFin:'',type:'pro',client:'',lieu:'',notes:''}]},updated_at:'2026-09-28T08:00:00.000Z'};
const FAUX_SUPA=`(()=>{const srv=(op,st)=>fetch('http://app.local/__srv/'+op,{method:'POST',body:JSON.stringify(st||{})}).then(r=>r.json());
 const q=()=>{const st={op:'select',f:{}};const b={select(){return b},update(p){st.op='update';st.payload=p;return b},
  upsert(p){st.op='upsert';st.payload=p;return b},eq(k,v){st.f[k]=v;return b},single(){st.single=true;return b},
  then(res,rej){return srv(st.op,st).then(res,rej)}};return b};
 window.supabase={createClient:()=>({auth:{getSession:()=>Promise.resolve({data:{session:{user:{email:'cp@x.fr'}}}}),
  onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:()=>Promise.resolve({})},from:()=>q(),
  channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},storage:{from:()=>({})}})};})();`;
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const tous=()=>Object.values(G.ev).flatMap(E=>Object.values(E));
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const route=async ctx=>ctx.route('**/*',async r=>{const u=r.request().url();
    const s=u.match(/__srv\/(\w+)/);
    if(s){const st=JSON.parse(r.request().postData()||'{}');let rep;
      if(s[1]==='select')rep={data:st.single?serveur:[serveur],error:null};
      else if(s[1]==='update'&&st.f.updated_at!==serveur.updated_at)rep={data:[],error:null};
      else{serveur={data:st.payload.data,updated_at:st.payload.updated_at};rep={data:[{updated_at:serveur.updated_at}],error:null}}
      return r.fulfill({body:JSON.stringify(rep),contentType:'application/json'})}
    if(/accounts\.google\.com/.test(u)){const q=new URL(u).searchParams;requetes.push('AUTH '+q.get('state')+' '+(q.get('prompt')||'')+' '+(q.get('login_hint')||'')+' '+q.get('scope'));
      return r.fulfill({status:302,headers:{location:q.get('redirect_uri')+'#access_token=jeton-agenda&expires_in=3600&token_type=Bearer&state='+q.get('state')}})}
    if(/googleapis\.com/.test(u))return google(r,u);
    if(/react\.production/.test(u))return r.fulfill({path:NM+'/react/umd/react.production.min.js',contentType:'text/javascript'});
    if(/react-dom\.production/.test(u))return r.fulfill({path:NM+'/react-dom/umd/react-dom.production.min.js',contentType:'text/javascript'});
    if(/babel\.min\.js/.test(u))return r.fulfill({path:NM+'/@babel/standalone/babel.min.js',contentType:'text/javascript'});
    if(/supabase-js/.test(u))return r.fulfill({body:FAUX_SUPA,contentType:'text/javascript'});
    if(/pdf\.min\.js/.test(u))return r.fulfill({body:'',contentType:'text/javascript'});
    const m=u.match(/^http:\/\/app\.local\/(.*?)(\?.*)?$/);
    if(m){const f=path.join(R,decodeURIComponent((m[1]||'index.html').split('#')[0]));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f});return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const ctx=await b.newContext({viewport:{width:1440,height:1000},timezoneId:'America/New_York'});await route(ctx);
  const p=await ctx.newPage();const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));
  p.on('dialog',d=>d.accept());
  await p.goto('http://app.local/index.html');await p.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  const menu=async t=>{await p.mouse.move(700,500);await p.mouse.move(4,450);await p.waitForTimeout(300);await p.click('nav.bot >> text='+t);await p.mouse.move(700,500);await p.waitForTimeout(400)};
  await menu('AGENDA');
  chk(await p.locator('button:has-text("Connecter mon Google Agenda")').count()===1&&/Réunion notaire/.test(await p.textContent('main')),'non connecté : l’agenda de l’application reste, avec « Connecter mon Google Agenda »');
  /* 1. connexion */
  await p.click('button:has-text("Connecter mon Google Agenda")');
  await p.waitForSelector('text=✓ Google Agenda',{timeout:30000});await p.waitForTimeout(600);
  const auth=requetes.find(x=>x.startsWith('AUTH'));
  chk(/^AUTH agenda select_account/.test(auth)&&/calendar\.calendarlist\.readonly/.test(auth)&&/calendar\.events/.test(auth)&&!/drive|gmail/.test(auth),'connexion OAuth : choix du compte, deux autorisations seulement (liste des agendas, événements)');
  chk(/pro@cp\.fr/.test(await p.textContent('.agenda-etat'))&&!/access_token/.test(p.url()),'compte connecté affiché, jeton retiré de l’adresse');
  chk(/Visite chantier Leroux/.test(await p.textContent('main'))&&/Point hebdo/.test(await p.textContent('main')),'événements Google affichés (agenda principal)');
  /* 2. réglages */
  await p.click('button:has-text("Réglages")');
  const reg=p.locator('.reglages-agenda');
  chk(/Jours fériés/.test(await reg.textContent())&&/lecture seule/.test(await reg.textContent()),'réglages : agendas accessibles, lecture seule signalée');
  const ligne=t=>reg.locator('.agenda-ligne').filter({has:p.locator('span.b',{hasText:new RegExp('^'+t.replace(/[.@]/g,'\\$&')+'$')})});
  await ligne('Perso').locator('input[type=checkbox]').check();
  await ligne('Perso').locator('select').selectOption('perso');
  await ligne('pro@cp.fr').locator('select').selectOption('pro');
  await ligne('Jours fériés').locator('input[type=checkbox]').check();
  chk(await ligne('Jours fériés').locator('input[type=radio]').count()===0,'un agenda en lecture seule ne peut pas être « par défaut »');
  await p.click('.agenda-etat button:has-text("Actualiser")');await p.waitForTimeout(800);
  chk(/Jour férié test/.test(await p.textContent('main')),'agenda coché : ses événements apparaissent');
  await p.click('button:has-text("Fermer les réglages")');
  /* 3. création avec dossier et adresse du chantier */
  await p.click('button:has-text("+ Rendez-vous")');
  const form=p.locator('.agenda-form');
  await form.locator('input[placeholder^="Visite chantier"]').fill('Réception des menuiseries');
  await form.locator('input[type=date]').first().fill(J(1));
  await form.locator('input[type=time]').nth(0).fill('09:00');await form.locator('input[type=time]').nth(1).fill('10:30');
  await form.locator('select').nth(1).selectOption('chantier:c1');
  await form.locator('button:has-text("Utiliser l’adresse du dossier")').click();
  await form.locator('button:has-text("Enregistrer")').click();
  await p.waitForSelector('text=✓ Enregistré dans Google Agenda.',{timeout:15000});await p.waitForTimeout(1500);
  const cree=tous().find(e=>e.summary==='Réception des menuiseries');
  chk(cree&&cree.location==='12 rue des Lilas, Magny-le-Désert'&&cree.start.dateTime===paris(J(1),'09:00')&&cree.end.dateTime===paris(J(1),'10:30'),'créé dans Google : heures de Paris (appareil réglé sur New York), adresse du chantier');
  chk(requetes.some(x=>/^POST .*events\?sendUpdates=none/.test(x)),'aucune invitation envoyée (sendUpdates=none)');
  const lien=(serveur.data.agendaLiens||[]).find(l=>l.eventId===cree.id);
  chk(lien&&lien.dossierId==='c1'&&lien.calId==='pro@cp.fr'&&!JSON.stringify(lien).includes('menuiseries'),'lien avec le dossier partagé : identifiants seulement, sans titre ni détail');
  /* 4. panne : rien n'est annoncé comme enregistré */
  await p.click('button:has-text("+ Rendez-vous")');
  await form.locator('input[placeholder^="Visite chantier"]').fill('Rendez-vous en panne');
  await form.locator('input[type=time]').nth(0).fill('14:00');
  panne=true;await form.locator('button:has-text("Enregistrer")').click();await p.waitForTimeout(800);
  chk(/n’a pas pu enregistrer/.test(await form.textContent())&&!tous().some(e=>e.summary==='Rendez-vous en panne')&&await form.count()===1,'panne Google : message d’échec, formulaire gardé, rien de créé');
  await form.locator('button:has-text("Enregistrer")').click();
  await p.waitForSelector('text=✓ Enregistré dans Google Agenda.',{timeout:15000});await p.waitForTimeout(1000);
  chk(tous().filter(e=>e.summary==='Rendez-vous en panne').length===1,'nouvel essai : créé une seule fois');
  /* 5. modification concurrente */
  await p.click('button:has-text("Liste")');await p.waitForTimeout(300);
  await p.locator('.agenda-evt',{hasText:'Réception des menuiseries'}).first().click();
  cree.summary='Réception menuiseries (modifié sur le téléphone)';cree.etag=etag();
  await form.locator('input[placeholder^="Visite chantier"]').fill('Réception menuiseries — ordinateur');
  await form.locator('button:has-text("Enregistrer")').click();await p.waitForTimeout(1000);
  chk(/modifié ailleurs entre-temps/.test(await form.textContent())&&cree.summary==='Réception menuiseries (modifié sur le téléphone)'
    &&(await form.locator('input[placeholder^="Visite chantier"]').inputValue())==='Réception menuiseries (modifié sur le téléphone)','modification concurrente : rien d’écrasé, version à jour rechargée');
  await form.locator('input[placeholder^="Visite chantier"]').fill('Réception menuiseries — validée');
  await form.locator('button:has-text("Enregistrer")').click();await p.waitForSelector('text=✓ Enregistré dans Google Agenda.',{timeout:15000});
  chk(cree.summary==='Réception menuiseries — validée','puis modification acceptée');
  /* 6. séries */
  await p.waitForTimeout(800);
  await p.locator('.agenda-evt',{hasText:'Point hebdo'}).nth(1).click();
  await form.locator('text=Cette occurrence seulement').click();
  await form.locator('input[placeholder^="Visite chantier"]').fill('Point hebdo (déplacé)');
  await form.locator('button:has-text("Enregistrer")').click();await p.waitForSelector('text=✓ Enregistré dans Google Agenda.',{timeout:15000});await p.waitForTimeout(800);
  const serie=tous().filter(e=>e.recurringEventId==='rec1');
  chk(serie.filter(e=>e.summary==='Point hebdo (déplacé)').length===1&&serie.filter(e=>e.summary==='Point hebdo').length===2,'série : « cette occurrence » ne change qu’une occurrence');
  await p.locator('.agenda-evt',{hasText:'Point hebdo'}).first().click();
  await form.locator('text=Toute la série').click();
  await form.locator('input[placeholder^="Visite chantier"]').fill('Point hebdomadaire');
  await form.locator('button:has-text("Enregistrer")').click();await p.waitForSelector('text=✓ Enregistré dans Google Agenda.',{timeout:15000});await p.waitForTimeout(800);
  chk(tous().filter(e=>e.recurringEventId==='rec1').every(e=>e.summary==='Point hebdomadaire')&&G.masters['pro@cp.fr|rec1'].start.dateTime===paris(J(1),'08:00'),'« toute la série » : toutes les occurrences, date de départ conservée');
  /* 7. lecture seule */
  await p.locator('.agenda-evt',{hasText:'Jour férié test'}).first().click();
  chk(/lecture seule/.test(await form.textContent())&&!(await form.locator('button:has-text("Enregistrer")').count())&&!(await form.locator('button:has-text("Supprimer")').count()),'agenda en lecture seule : ni enregistrement, ni suppression');
  await form.locator('button:has-text("Fermer")').click();
  /* 8. journée entière */
  await p.click('button:has-text("+ Rendez-vous")');
  await form.locator('input[placeholder^="Visite chantier"]').fill('Congés chantier');
  await form.locator('text=Toute la journée').click();
  await form.locator('input[type=date]').nth(0).fill(J(6));await form.locator('input[type=date]').nth(1).fill(J(8));
  await form.locator('button:has-text("Enregistrer")').click();await p.waitForSelector('text=✓ Enregistré dans Google Agenda.',{timeout:15000});
  const conges=tous().find(e=>e.summary==='Congés chantier');
  chk(conges&&conges.start.date===J(6)&&conges.end.date===J(9),'journée entière sur trois jours : fin exclusive envoyée à Google');
  /* 9. suppression */
  await p.waitForTimeout(800);
  await p.locator('.agenda-evt',{hasText:'Congés chantier'}).first().click();
  await form.locator('button:has-text("Supprimer")').click();await p.waitForSelector('text=✓ Supprimé de Google Agenda.',{timeout:15000});
  chk(!tous().some(e=>e.summary==='Congés chantier'),'suppression confirmée : retirée de Google');
  /* 10. Google → application */
  pose('pro@cp.fr',{id:'tel1',summary:'Ajouté sur le téléphone',start:{dateTime:paris(J(3),'15:00')},end:{dateTime:paris(J(3),'16:00')}});
  delete G.ev['pro@cp.fr'].g1;
  await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await p.waitForTimeout(1200);
  const tx=await p.textContent('main');
  const cartesG1=await p.locator('.agenda-evt',{hasText:'Visite chantier Leroux'}).evaluateAll(L=>L.filter(e=>!/pas encore dans Google Agenda/.test(e.textContent)).length);
  chk(/Ajouté sur le téléphone/.test(tx)&&cartesG1===0,'retour dans l’application : ajout et suppression faits dans Google retrouvés');
  /* 11. ouvrir le dossier */
  await p.locator('.agenda-evt',{hasText:'Réception menuiseries'}).first().click();
  await form.locator('button:has-text("Ouvrir le dossier")').click();await p.waitForTimeout(500);
  chk(/Maison Leroux/.test(await p.textContent('main'))&&await p.locator('.notes-dossier').count()===1,'« Ouvrir le dossier » : fiche du chantier');
  /* 12. reprise des anciens rendez-vous */
  await menu('AGENDA');await p.waitForTimeout(800);
  pose('pro@cp.fr',{id:'g1b',summary:'Visite chantier Leroux',start:{dateTime:paris(J(2),'10:00')},end:{dateTime:paris(J(2),'11:00')}});
  await p.click('.agenda-etat button:has-text("Actualiser")');await p.waitForTimeout(800);
  await p.click('button:has-text("Reprendre les rendez-vous de l’application")');
  const rep=p.locator('.reprise-agenda');
  const t12=await rep.textContent();
  chk(/Réunion notaire/.test(t12)&&/Dentiste/.test(t12)&&/doublon possible/.test(t12),'aperçu de la reprise, doublon signalé');
  const lr=t=>rep.locator('.row',{hasText:t});
  chk(!(await lr('Visite chantier Leroux').locator('input[type=checkbox]').isChecked())&&await lr('Dentiste').locator('select').inputValue()==='perso-cal','doublon décoché ; rendez-vous perso dirigé vers l’agenda Perso');
  await rep.locator('button:has-text("Transférer 2 rendez-vous")').click();
  await p.waitForSelector('text=2 transférés sur 2',{timeout:20000});await p.waitForTimeout(1500);
  const transf=tous().filter(e=>e.extendedProperties&&e.extendedProperties.private&&e.extendedProperties.private.cpRdvId);
  chk(transf.length===2&&transf.some(e=>e.summary==='Dentiste'&&G.ev['perso-cal'][e.id])&&transf.some(e=>e.summary==='Réunion notaire'&&e.start.dateTime===paris(J(3),'10:00')&&/Client : Moualid/.test(e.description)),'transfert : bons agendas, heures de Paris, client repris dans la description');
  const rv=serveur.data.rendezvous;
  chk(rv.length===3&&rv.find(x=>x.id==='r1').google&&rv.find(x=>x.id==='r2').google&&!rv.find(x=>x.id==='r3').google,'correspondance enregistrée ; anciens rendez-vous conservés');
  const avant=tous().length;
  await rep.locator('button:has-text("Transférer")').click().catch(()=>{});await p.waitForTimeout(800);
  chk(tous().length===avant,'nouvelle tentative : aucun doublon créé');
  const V=await p.evaluate(()=>new Promise(ok=>{const r=indexedDB.open('cp-versions',1);r.onsuccess=()=>{const q=r.result.transaction('versions').objectStore('versions').getAll();q.onsuccess=()=>ok(q.result.map(v=>v.motif))}}));
  chk(V.some(m=>/Avant transfert vers Google Agenda/.test(m)),'sauvegarde faite avant le transfert');
  /* 12 bis. retrait des anciens rendez-vous : doublon compris */
  chk(await rep.locator('button:has-text("Retirer les 2 rendez-vous déjà transférés")').count()===1&&await rep.locator('button:has-text("Retirer tous les anciens rendez-vous (3)")').count()===1,'retrait possible même avec un doublon non transféré');
  await rep.locator('button:has-text("Retirer tous les anciens rendez-vous")').click();await p.waitForTimeout(1500);
  chk(!(serveur.data.rendezvous||[]).length,'tous les anciens rendez-vous retirés des données de l’application');
  const V2=await p.evaluate(()=>new Promise(ok=>{const r=indexedDB.open('cp-versions',1);r.onsuccess=()=>{const q=r.result.transaction('versions').objectStore('versions').getAll();q.onsuccess=()=>ok(q.result.filter(v=>/Avant retrait de tous/.test(v.motif)).map(v=>v.data.rendezvous.length))}}));
  chk(V2.length===1&&V2[0]===3,'version gardée avant le retrait, avec les 3 anciens rendez-vous');
  chk(!/pas encore dans Google Agenda/.test(await p.textContent('main')),'plus de rendez-vous en pointillés');
  /* 13. tableau de bord */
  await menu('ACCUEIL');
  const tb=await p.locator('.card',{hasText:'AGENDA — 7 PROCHAINS JOURS'}).first().textContent();
  chk(/Ajouté sur le téléphone/.test(tb)&&(tb.match(/Réunion notaire/g)||[]).length===1,'tableau de bord : rendez-vous de Google, sans doublon avec les transférés');
  await p.screenshot({path:SORTIE+'/agenda_tdb.png'});
  await menu('AGENDA');await p.waitForTimeout(800);await p.click('button:has-text("Mois")');await p.waitForTimeout(200);
  await p.screenshot({path:SORTIE+'/agenda_mois.png',fullPage:true});
  /* 14. déconnexion */
  await p.click('button:has-text("Réglages")');
  await p.locator('.reglages-agenda button:has-text("Déconnecter")').click();await p.waitForTimeout(500);
  const reste=await p.evaluate(()=>Object.keys(localStorage).filter(k=>/cpAgenda|agToken/.test(k)));
  chk(!reste.length&&requetes.some(x=>/\/revoke/.test(x)),'déconnexion : jeton révoqué, réglages et copie locale effacés');
  chk(!erreurs.length,'aucune erreur JavaScript '+erreurs.join(' | '));
  await ctx.close();
  /* 15. téléphone */
  const tel=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await route(tel);
  const m=await tel.newPage();await m.goto('http://app.local/index.html');await m.waitForSelector('text=TABLEAU DE BORD',{timeout:30000});
  await m.click('nav.bot >> text=PLUS');await m.click('nav.bot >> text=AGENDA');await m.click('button:has-text("Connecter mon Google Agenda")');
  await m.waitForSelector('text=✓ Google Agenda',{timeout:30000});await m.waitForTimeout(600);
  await m.click('button:has-text("Semaine")');await m.waitForTimeout(300);
  const bb=await m.locator('.agenda-semaine').boundingBox();
  chk(bb&&bb.x>=0&&bb.x+bb.width<=390,'téléphone : vue semaine dans la largeur de l’écran');
  await m.screenshot({path:SORTIE+'/agenda_tel.png'});
  await tel.close();await b.close();
  console.log(ko?'\n'+ko+' echec(s)':'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
