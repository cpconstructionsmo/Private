/* Relevé de visite — parcours dans Chromium au format iPhone, faux Supabase
   (aucune connexion réelle, client fictif) :
   - « Nouvelle visite » ouvre l'appareil photo dans le même geste ;
   - fiche client, projet, pièces et photos, scan sans extension, récapitulatif ;
   - tout part sur le « serveur » : visite, photos réduites, fichier du scan ;
   - hors ligne : saisie gardée, envoyée au retour du réseau ;
   - rechargement : rien de perdu ; le PC (autre navigateur) retrouve la visite ;
   - connexion : refus puis accès ; rien de ce qui est tapé n'est lu comme du HTML. */
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const {fauxSupabase}=require('./releve_faux_supabase');
const R=path.resolve(__dirname,'..'), SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const PHOTO=path.join(__dirname,'fixtures','portrait.jpg');
const BIBLIO=`window.__etat=window.__etat||{};${fauxSupabase.toString()};window.supabase={createClient:()=>fauxSupabase(window.__etat)};`;

async function contexte(b,opts={}){
  const ctx=await b.newContext({serviceWorkers:'block',...opts});
  await ctx.route('**/*',async r=>{const u=r.request().url();
    if(/supabase-js/.test(u))return r.fulfill({body:BIBLIO,contentType:'text/javascript'});
    const m=u.match(/^https:\/\/app\.local\/([^?#]*)/);
    if(m){let f=path.join(R,decodeURIComponent(m[1]));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
      if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f,contentType:/\.js$/.test(f)?'text/javascript':/\.html$/.test(f)?'text/html':undefined});
      return r.fulfill({status:404,body:''})}
    return r.fulfill({status:204,body:''});});
  return ctx;
}
const attendre=async(p,f,ms=8000)=>{const t=Date.now();while(Date.now()-t<ms){if(await p.evaluate(f))return true;await p.waitForTimeout(100)}return false};

let b;
(async()=>{
  b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await contexte(b,{viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  const p=await ctx.newPage();p.setDefaultTimeout(10000);const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('dialog',d=>d.accept('Bureau'));
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite',{timeout:20000});
  chk(await p.isVisible('text=Aucune visite pour l’instant'),'accueil : liste vide et bouton « Nouvelle visite » en bas');

  /* 1 tap : l'appareil photo s'ouvre tout de suite */
  const [choix]=await Promise.all([p.waitForEvent('filechooser',{timeout:5000}),p.tap('#nouvelleVisite')]);
  chk(!!choix&&await choix.element().getAttribute('capture')==='environment','« Nouvelle visite » ouvre directement l’appareil photo (capture arrière)');
  await choix.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]',{timeout:8000});
  chk(true,'la photo de garde s’affiche depuis l’appareil');
  chk((await p.textContent('.etapeNom')).includes('Étape 1 sur 7'),'barre de progression : étape 1 sur 7');
  await p.tap('.progres button[aria-label="Étape 3 : Projet"]');
  chk((await p.textContent('.etapeNom')).includes('Étape 3 sur 7'),'toucher la barre de progression : on va directement à l’étape 3');
  await p.tap('.progres button[aria-label^="Étape 1 "]');
  await p.screenshot({path:SORTIE+'/releve_garde.png'});

  /* fiche client */
  await p.tap('#suivant');
  await p.tap('text=Mme');
  await p.fill('input[name="client.nom"]','FICTIF');
  await p.fill('input[name="client.prenom"]','<img src=x onerror=alert(1)>Anne');
  await p.fill('input[name="client.telephone"]','12 34');await p.locator('input[name="client.email"]').focus();
  chk(await p.isVisible('text=Numéro à vérifier'),'téléphone douteux signalé à la sortie du champ');
  await p.fill('input[name="client.telephone"]','06 12 34 56 78');
  await p.fill('input[name="client.email"]','client@exemple.fr');
  await p.fill('input[name="client.adresse"]','1 rue Imaginaire');
  await p.fill('input[name="client.codePostal"]','61000');await p.fill('input[name="client.ville"]','Alençon');
  chk(await p.locator('header img[src="x"]').count()===0&&(await p.textContent('header .titre')).includes('<img'),'un nom tapé avec du HTML reste du texte');
  /* deuxième acheteur, à une autre adresse ; usage du bien */
  await p.tap('button[name="client.nbAcheteurs"] >> text=2');
  await p.waitForSelector('[data-acheteur="2"]');
  chk(await p.locator('[data-acheteur]').count()===1,'deux acheteurs : une carte « Acheteur 2 » apparaît');
  await p.fill('input[name="acheteur2.nom"]','FICTIF');await p.fill('input[name="acheteur2.prenom"]','Paul');
  chk(await p.locator('input[name="client.nom"]').inputValue()==='FICTIF','la saisie de l’acheteur 1 est gardée quand la carte de l’acheteur 2 s’ouvre');
  chk(await p.locator('textarea[name="acheteur2.domicile"]').count()===0,'domicile de l’acheteur 2 : même adresse par défaut, aucun champ');
  await p.locator('[data-acheteur="2"] input[name="acheteur2.domicileIdem"]').uncheck();
  await p.fill('textarea[name="acheteur2.domicile"]','5 place Fictive 72000 Le Mans');
  await p.tap('text=Locatif');
  await p.screenshot({path:SORTIE+'/releve_client.png',fullPage:true});
  /* une société : raison sociale et représentant ; puis retour au particulier */
  await p.tap('button[name="client.type"] >> text=Société');
  await p.fill('input[name="societe.raisonSociale"]','SCI FICTIVE');
  chk(await p.locator('h2:has-text("Représentée par")').count()===1&&await p.locator('input[name="client.nom"]').inputValue()==='FICTIF','société : raison sociale et représentant (les champs du client gardés)');
  await p.tap('button[name="client.type"] >> text=Particulier');
  chk(await p.locator('input[name="acheteur2.prenom"]').inputValue()==='Paul','retour au particulier : l’acheteur 2 est toujours là');

  /* projet */
  await p.tap('#suivant');
  await p.tap('.grille >> text=Cuisine');await p.tap('.grille >> text=Peinture');
  chk(await p.locator('.grille >> text=Rénovation complète').count()===0&&await p.locator('.grille >> text=Chauffage').count()===1,'types : « Rénovation complète » retiré, Chauffage, Extérieur et Autre ajoutés');
  await p.tap('text=Rénovation importante');await p.tap('text=Rénovation énergétique');
  await p.tap('.grille >> text=Autre');
  await p.fill('input[name="projet.typeAutre"]','Véranda');
  chk(await p.locator('textarea[name="projet.explicatif"]').count()===0,'l’ancien champ « en quelques mots » n’apparaît que s’il a été rempli');
  chk(await p.locator('.champMicro:has(textarea[name="projet.situation"]) .micro').count()===1&&await p.locator('.champMicro:has(textarea[name="projet.souhaits"]) .micro').count()===1,'situation actuelle et souhaits ont chacun leur bouton 🎤');
  await p.fill('textarea[name="projet.situation"]','Chauffage fioul, simple vitrage.');
  await p.fill('textarea[name="projet.souhaits"]','Ouvrir la cuisine sur le séjour.');
  await p.tap('text=Sous 6 mois');
  await p.fill('input[name="projet.enveloppe"]','45000');
  chk((await p.textContent('#montantEnveloppe')).replace(/\s/g,' ').includes('45 000 €'),'enveloppe : 45 000 € affiché');
  chk(await p.locator('.grille .puce.on').count()===3,'trois types de travaux choisis (dont Autre)');
  await p.screenshot({path:SORTIE+'/releve_projet.png'});

  /* pièces et photos */
  await p.tap('#suivant');
  await p.tap('text=+ Cuisine');
  await p.waitForSelector('[data-piece]');
  const [choix2]=await Promise.all([p.waitForEvent('filechooser'),p.tap('[data-piece] >> text=🖼 Galerie')]);
  await choix2.setFiles([PHOTO,PHOTO]);
  await p.waitForFunction(()=>document.querySelectorAll('.photoLegende img[src^="blob:"]').length===2,null,{timeout:8000});
  chk((await p.textContent('main')).includes('1 pièce · 2 photos'),'compteur : 1 pièce · 2 photos');
  chk(await p.locator('text=Imaginer (bientôt)').count()===0&&await p.locator('[data-piece] button.imaginer').count()===2,'« Imaginer (bientôt) » inactif remplacé par « ✨ Imaginer » sous chaque photo');
  chk(await p.locator('[data-piece] >> text=📷 Photo suivante').count()===1,'après une photo : « Photo suivante »');
  await p.fill('textarea[aria-label="Légende de la photo 1"]','Fissure au-dessus de la fenêtre');
  await p.fill('textarea[aria-label="Notes sur la pièce Cuisine"]','Garder le carrelage.');
  await p.screenshot({path:SORTIE+'/releve_pieces.png',fullPage:true});
  await p.tap('text=+ Autre…');
  await p.waitForFunction(()=>document.querySelectorAll('[data-piece]').length===2,null,{timeout:5000}).catch(()=>{});
  chk(await p.locator('[data-piece]').count()===2,'pièce « Autre… » ajoutée avec le nom tapé');

  /* scan : fichier sans extension (cas iPhone) */
  await p.tap('#suivant');
  const [choix3]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#importerScan')]);
  chk(!(await choix3.element().getAttribute('accept')),'le sélecteur du scan n’a aucun filtre : un export sans extension n’est pas grisé');
  await choix3.setFiles({name:'Plan maison',mimeType:'',buffer:Buffer.from('{"rooms":[]}')});
  /* le plan s'ouvre aussitôt (étape 2, voir releve_plan_navigateur.js) ; on revient à la visite */
  await p.waitForSelector('#cadrePlan');
  await p.tap('#fermerPlan');
  await p.waitForSelector('text=📄 Plan maison');

  /* budget (voir releve_budget_navigateur.js), puis récapitulatif et fin */
  await p.tap('#suivant');
  await p.waitForSelector('#totalBudget');
  await p.tap('#suivant');
  const recap=(await p.textContent('.recap')).replace(/\s/g,' ');
  chk(recap.includes('Cuisine, Peinture, Autre (Véranda)')&&recap.includes('45 000 €'),'récapitulatif : travaux et enveloppe');
  chk(recap.includes('Acheteur 2')&&recap.includes('Paul FICTIF')&&recap.includes('5 place Fictive')&&recap.includes('Locatif')&&recap.includes('Rénovation importante, Rénovation énergétique')&&recap.includes('simple vitrage'),'récapitulatif : acheteur 2 et son domicile, usage, ampleur, situation');
  await p.fill('textarea[name="notes"]','Accès par le portail latéral.');
  await p.tap('#terminer');
  await p.waitForSelector('text=Visite terminée et enregistrée');
  await p.screenshot({path:SORTIE+'/releve_fin.png'});

  /* tout part sur le serveur */
  const parti=await attendre(p,()=>{const L=Object.values(window.__etat.lignes||{});return L.length===1&&L[0].donnees.valeurs.statut==='terminee'&&Object.keys(window.__etat.fichiers).length>=4});
  const etat=await p.evaluate(()=>JSON.parse(JSON.stringify({lignes:window.__etat.lignes,fichiers:window.__etat.fichiers})));
  const ligne=Object.values(etat.lignes)[0], d=ligne&&ligne.donnees;
  chk(parti,'la visite terminée et ses fichiers sont sur le serveur');
  chk(d&&d.valeurs['client.nom']==='FICTIF'&&d.valeurs['projet.enveloppe']===45000&&d.valeurs['projet.delai']==='Sous 6 mois','le serveur a la fiche client et le projet');
  chk(d&&d.valeurs['acheteur2.prenom']==='Paul'&&d.valeurs['acheteur2.domicileIdem']===false&&d.valeurs['bien.usage']==='Locatif'&&d.valeurs['projet.souhaits']==='Ouvrir la cuisine sur le séjour.'&&d.valeurs['client.type']==='particulier','le serveur a l’acheteur 2, l’usage et les souhaits');
  chk(d&&Object.values(d.photos).some(x=>x.legende==='Fissure au-dessus de la fenêtre')&&Object.values(d.pieces).some(x=>x.note==='Garder le carrelage.'),'légende de photo et note de pièce enregistrées');
  const fich=Object.keys(etat.fichiers);
  chk(fich.filter(f=>/^releves\/[0-9a-f-]+\/[0-9a-f-]+\.jpg$/.test(f)).length===3,'3 photos dans l’espace « releves » (garde + 2), rangées par visite');
  chk(fich.some(f=>/\/scan-[0-9a-f-]+\.json$/.test(f)),'le scan sans extension est rangé en .json');
  chk(Object.values(etat.fichiers).filter(n=>typeof n==='number').every(n=>n<600000),'photos réduites avant envoi');
  chk(!JSON.stringify(d).includes('data:image'),'aucune image dans le JSON de la visite');
  await attendre(p,()=>/Synchronisé/.test(document.getElementById('etatSync').textContent));
  chk((await p.textContent('#etatSync')).includes('Synchronisé'),'état affiché : « ✓ Synchronisé »');

  /* hors ligne */
  await ctx.setOffline(true);
  await p.fill('textarea[name="notes"]','Accès par le portail latéral. Chien dans le jardin.');
  await attendre(p,()=>/appareil/.test(document.getElementById('etatSync').textContent),4000);
  chk((await p.textContent('#etatSync')).includes('Sur l’appareil'),'hors ligne : « Sur l’appareil », rien n’est perdu');
  chk(!(await p.evaluate(()=>Object.values(window.__etat.lignes)[0].donnees.valeurs.notes)).includes('Chien'),'hors ligne : rien n’est parti');
  await ctx.setOffline(false);
  chk(await attendre(p,()=>(Object.values(window.__etat.lignes)[0].donnees.valeurs.notes||'').includes('Chien')),'retour du réseau : la note part toute seule');

  /* le « serveur » vit dans la page : on le garde pour le PC avant de recharger */
  const serveur=await p.evaluate(()=>JSON.stringify({lignes:window.__etat.lignes,fichiers:window.__etat.fichiers}));
  /* rechargement : tout est là */
  await p.reload();await p.waitForSelector('.visite',{timeout:10000});
  chk((await p.textContent('.visite')).includes('FICTIF')&&(await p.textContent('.visite')).includes('Terminée'),'après rechargement, la visite est dans la liste');
  chk(await p.locator('.visite img.vignette').count()===1,'la vignette de la photo de garde s’affiche dans la liste');

  /* le PC : un autre navigateur, même serveur */
  const ctxPc=await contexte(b,{viewport:{width:1280,height:900}});
  await ctxPc.addInitScript(s=>{window.__etat=JSON.parse(s)},serveur);
  const pc=await ctxPc.newPage();pc.on('pageerror',e=>erreurs.push('PC : '+e));
  await pc.goto('https://app.local/releve/');
  await pc.waitForSelector('.visite',{timeout:10000});
  chk((await pc.textContent('.visite')).includes('FICTIF'),'le PC retrouve la visite faite sur l’iPhone');
  await pc.click('.visite');await pc.click('text=Fin de visite').catch(()=>{});
  await pc.screenshot({path:SORTIE+'/releve_pc.png'});

  /* connexion */
  const ctxC=await contexte(b,{viewport:{width:390,height:844}});
  await ctxC.addInitScript(()=>{window.__etat={session:null}});
  const pcx=await ctxC.newPage();pcx.on('pageerror',e=>erreurs.push('connexion : '+e));
  await pcx.goto('https://app.local/releve/');
  await pcx.waitForSelector('text=Connexion',{timeout:10000});
  await pcx.fill('input[type=email]','metreur@exemple.fr');await pcx.fill('input[type=password]','faux');
  await pcx.click('button[type=submit]');
  await pcx.waitForSelector('text=Adresse ou mot de passe incorrect');
  chk(true,'mauvais mot de passe : refusé, avec un message clair');
  await pcx.fill('input[type=password]','bon');await pcx.click('button[type=submit]');
  await pcx.waitForSelector('#nouvelleVisite',{timeout:5000});
  chk(true,'bon mot de passe : accès aux visites');

  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
