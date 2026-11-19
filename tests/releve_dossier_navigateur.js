/* Relevé de visite — le dossier client (Phase 3), dans Chromium au format
   iPhone, faux Supabase, visite FICTIVE :
   - « 📄 Dossier client » depuis le récapitulatif ;
   - garde, projet, pièces avec photos, estimation ; jamais les notes de visite ;
   - les options retirent ou ajoutent des parties ;
   - « Imprimer / PDF » attend les photos puis imprime ; le PDF sort en A4. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const {fauxSupabase}=require('./releve_faux_supabase');
const R=path.resolve(__dirname,'..'), SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const PHOTO=path.join(__dirname,'fixtures','portrait.jpg');
const BIBLIO=`window.__etat=window.__etat||{};${fauxSupabase.toString()};window.supabase={createClient:()=>fauxSupabase(window.__etat)};`;
const plat=s=>s.replace(/\s+/g,' ');

let b;
(async()=>{
  b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await ctx.route('**/*',async r=>{const u=r.request().url();
    if(/supabase-js/.test(u))return r.fulfill({body:BIBLIO,contentType:'text/javascript'});
    if(/\/functions\/v1\/imaginer$/.test(u)){const b=JSON.parse(r.request().postData()||'{}');const rep=global.__partage&&global.__partage(b);
      return r.fulfill({status:rep?200:404,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(rep||{erreur:'lien_invalide'})});}
    const m=u.match(/^https:\/\/app\.local\/([^?#]*)/);
    if(m){let f=path.join(R,decodeURIComponent(m[1]));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
      if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f,contentType:/\.js$/.test(f)?'text/javascript':/\.html$/.test(f)?'text/html':undefined});
      return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();p.setDefaultTimeout(15000);const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('dialog',d=>d.accept());
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  await p.tap('#suivant');
  await p.tap('.puce >> text="Mme"');await p.fill('input[name="client.nom"]','FICTIF');await p.fill('input[name="client.prenom"]','Anne');
  await p.fill('input[name="client.adresse"]','1 rue Imaginaire');await p.fill('input[name="client.ville"]','Alençon');
  await p.tap('#suivant');
  await p.tap('.grille >> text=Cuisine');
  await p.fill('textarea[name="projet.situation"]','Cuisine fermée des années 80.');
  await p.fill('textarea[name="projet.souhaits"]','Cuisine ouverte sur le séjour.');
  await p.tap('#suivant');
  await p.tap('text=+ Cuisine');
  const [c2]=await Promise.all([p.waitForEvent('filechooser'),p.tap('[data-piece] >> text=🖼 Galerie')]);await c2.setFiles(PHOTO);
  await p.waitForSelector('.photoLegende img[src^="blob:"]');
  await p.fill('textarea[aria-label="Légende de la photo 1"]','Plan de travail abîmé');
  await p.tap('#suivant');await p.tap('#suivant');
  await p.tap('#estimerSuggeres');await p.waitForSelector('[data-ouvrage-choisi="cuisine"]');
  await p.tap('#suivant');
  await p.fill('textarea[name="notes"]','Client pressé : note interne.');

  await p.tap('#ouvrirDossier');
  await p.waitForSelector('.dossier .feuille');
  const texte=plat(await p.textContent('.dossier'));
  chk(/Votre projet de rénovation/.test(texte)&&/Mme Anne FICTIF/.test(texte)&&/1 rue Imaginaire, Alençon/.test(texte),'page de garde : titre, client, adresse des travaux');
  chk(await p.locator('.gardeDossier').count()===1,'la photo de garde est en couverture');
  chk(/Cuisine fermée des années 80/.test(texte)&&/Cuisine ouverte sur le séjour/.test(texte),'la situation et les souhaits du client');
  chk(/Plan de travail abîmé/.test(texte)&&await p.locator('.pieceDossier img').count()===1,'la pièce, sa photo et sa légende');
  chk(/Estimation budgétaire indicative/.test(texte)&&/de [\d  ]+ € à|€ à [\d  ]+ €/.test(texte)&&/ni un devis/.test(texte),'l’estimation indicative, avec sa mention « ni un devis »');
  chk(!/note interne|pressé/.test(texte)&&!/marge/i.test(texte),'jamais les notes de visite ni la marge');
  await p.screenshot({path:SORTIE+'/releve_dossier.png',fullPage:true});

  await p.locator('input[name="opt-estimation"]').uncheck();
  await p.waitForFunction(()=>!/Estimation budgétaire/.test(document.querySelector('.dossier').textContent));
  chk(true,'option décochée : l’estimation disparaît du dossier');
  await p.locator('input[name="opt-estimation"]').check();
  await p.waitForFunction(()=>/Estimation budgétaire/.test(document.querySelector('.dossier').textContent));

  /* imprimer : attend les photos, puis la fenêtre d'impression */
  await p.evaluate(()=>{window.__imprime=0;window.print=()=>{window.__imprime++}});
  await p.tap('#imprimerDossier');
  await p.waitForFunction(()=>window.__imprime===1);
  chk(true,'« Imprimer / PDF » ouvre l’impression');
  /* le PDF tel que l'imprimerait le navigateur : A4, sans les boutons */
  await p.emulateMedia({media:'print'});
  chk(!(await p.isVisible('#imprimerDossier'))&&!(await p.isVisible('header.haut')),'à l’impression : ni les boutons, ni la barre');
  const pdf=await p.pdf({format:'A4',printBackground:true});
  fs.writeFileSync(SORTIE+'/releve_dossier.pdf',pdf);
  const pages=(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length;
  chk(pages>=2&&pages<=4,'PDF A4 : '+pages+' pages (couverture seule, puis les parties enchaînées)');
  await p.emulateMedia({media:'screen'});

  /* envoyer le dossier au client : lien personnel, 30 jours */
  await p.tap('#creerLien');
  await p.waitForSelector('#lienDossier');
  const lien=await p.inputValue('#lienDossier');
  const jeton=(lien.match(/partage\.html#t=([A-Za-z0-9_-]+)$/)||[])[1];
  chk(jeton&&jeton.length>=40,'lien créé : partage.html#t=<jeton aléatoire>');
  const parts=await p.evaluate(()=>JSON.parse(JSON.stringify(window.__etat.partages||{})));
  const pa=Object.values(parts)[0];
  const crypto=require('crypto');
  chk(pa&&pa.jeton_hash===crypto.createHash('sha256').update(jeton).digest('hex')&&!JSON.stringify(pa).includes(jeton),'seule l’empreinte du jeton est en base, jamais le jeton');
  chk(pa&&pa.donnees.client==='Mme Anne FICTIF'&&!/note interne|pressé|marge/i.test(JSON.stringify(pa.donnees))&&new Date(pa.expire_le)-Date.now()>29*86400000,'le dossier gardé est celui de l’écran (sans notes internes), valable 30 jours');
  chk(await p.locator('.envoiClient a[href^="mailto:"]').count()===1,'envoi par e-mail préparé (et copier, partager)');
  /* la page du client : ce que rend la fonction pour ce jeton */
  global.__partage=b=>b.action==='partage'&&crypto.createHash('sha256').update(b.t||'').digest('hex')===pa.jeton_hash?{dossier:pa.donnees,urls:{},expire_le:pa.expire_le}:null;
  const cp=await ctx.newPage();
  await cp.goto(lien.replace(/^https:\/\/app\.local\//,'https://app.local/'));
  await cp.waitForSelector('.dossier .feuille');
  const tc=await cp.textContent('.dossier');
  chk(/Votre projet de rénovation/.test(tc)&&/Cuisine ouverte sur le séjour/.test(tc)&&/Estimation budgétaire indicative/.test(tc)&&/valable jusqu’au/.test(await cp.textContent('main')),'page du client : le dossier s’affiche, avec la date de validité du lien');
  await cp.goto('about:blank');await cp.goto('https://app.local/releve/partage.html#t='+'x'.repeat(43));
  await cp.waitForSelector('.message');
  chk(/plus valable/.test(await cp.textContent('.message')),'jeton inconnu : « ce lien n’est plus valable », rien d’autre');
  await cp.close();
  /* retirer le lien */
  await p.tap('#retirerLien');
  await p.waitForSelector('#creerLien');
  chk(await p.evaluate(()=>Object.values(window.__etat.partages)[0].revoque===true),'« Retirer le lien » : le lien est désactivé');

  /* la liste des visites : recherche dès 5 visites */
  await p.waitForFunction(()=>Object.values(window.__etat.lignes||{}).length>0,null,{timeout:15000}).catch(()=>{});
  const idVisite=await p.evaluate(()=>{const L=Object.values(window.__etat.lignes||{});return L[0]?L[0].id:null});
  await p.tap('header .lienRetour');await p.waitForSelector('.etapeNom');
  await p.tap('header .lienRetour');await p.waitForSelector('#nouvelleVisite');
  for(let i=0;i<4;i++){await p.tap('#nouvelleVisite');await p.waitForSelector('.etapeNom');await p.tap('header .lienRetour');await p.waitForSelector('#nouvelleVisite');}
  chk(await p.locator('[data-visite]').count()===5&&await p.isVisible('#chercherVisite'),'5 visites : le champ de recherche apparaît');
  await p.fill('#chercherVisite','fictif alencon');
  chk(await p.locator('[data-visite]:not([hidden])').count()===1,'« fictif alencon » (sans accent) : une seule visite trouvée');
  await p.fill('#chercherVisite','zzz');
  chk(await p.isVisible('#aucuneVisiteTrouvee'),'rien trouvé : « Aucune visite ne correspond »');

  /* depuis la fiche prospect du suivi : ?visite=…&vue=dossier ouvre le dossier */
  if(idVisite){await p.goto('https://app.local/releve/?visite='+idVisite+'&vue=dossier');await p.waitForSelector('.dossier .feuille');
    chk(/Mme Anne FICTIF/.test(await p.textContent('.dossier')),'lien du suivi (« 📄 Dossier ») : le dossier s’ouvre directement');}
  else chk(false,'la visite est sur le serveur');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
