/* Construction neuve et agrandissement (relevé de visite) — Chromium au
   format iPhone, faux Supabase, services publics simulés (réponses FICTIVES
   au format réel : tests/fixtures/terrain_fictif.js) :
   - dès la 1re page : Rénovation / Construction neuve / Agrandissement, le
     parcours s'adapte (5 étapes en construction, 8 en agrandissement) ;
   - le projet de construction (surface, niveaux, chambres, terrain…) ;
   - l'étape Terrain : localisé par l'adresse ou le GPS, parcelle, zone et
     règlement, servitudes, risques, points d'attention, surface reprise du
     cadastre sans rien écraser, sans réseau un message clair ;
   - le récapitulatif ; l'agrandissement reprend l'adresse des travaux. */
const F=require('./fixtures/terrain_fictif');const appelsTerrain=[];
require('fs').mkdirSync(require('os').tmpdir()+'/cp-tests',{recursive:true});
const {chromium}=require('playwright-core');const fs=require('fs');const path=require('path');
const {fauxSupabase}=require('./releve_faux_supabase');
const R=path.resolve(__dirname,'..'), SORTIE=require('os').tmpdir()+'/cp-tests';
let ko=0;const chk=(c,m)=>{console.log((c?'OK  ':'KO  ')+m);if(!c)ko++};
const PHOTO=path.join(__dirname,'fixtures','portrait.jpg');
const {scan}=require('./releve_scan_fictif');
const BIBLIO=`window.__etat=window.__etat||{};${fauxSupabase.toString()};window.supabase={createClient:()=>fauxSupabase(window.__etat)};`;
const attendre=async(p,f,ms=10000)=>{const t=Date.now();while(Date.now()-t<ms){if(await p.evaluate(f))return true;await p.waitForTimeout(100)}return false};

let b;
(async()=>{
  b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const ctx=await b.newContext({geolocation:{longitude:0.2001,latitude:48.5002,accuracy:8},permissions:['geolocation'],serviceWorkers:'block',viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await ctx.route('**/*',async r=>{const u=r.request().url();
    if(/supabase-js/.test(u))return r.fulfill({body:BIBLIO,contentType:'text/javascript'});
    const m=u.match(/^https:\/\/app\.local\/([^?#]*)/);
    if(m){let f=path.join(R,decodeURIComponent(m[1]));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
      if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({path:f,contentType:/\.js$/.test(f)?'text/javascript':/\.html$/.test(f)?'text/html':undefined});
      return r.fulfill({status:404,body:''})}
    if(/geo\.api\.gouv\.fr\/communes\?codePostal=61000/.test(u))return r.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify([{nom:'Alençon'}])});
    if(/geo\.api\.gouv\.fr\/communes\?codePostal=53100/.test(u))return r.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify([{nom:'Mayenne'},{nom:'Aron'},{nom:'Moulay'}])});
    const json=o=>r.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(o)});
    if(/data\.geopf\.fr\/geocodage\/search/.test(u)){appelsTerrain.push(u);return json(F.geocodage)}
    if(/apicarto\.ign\.fr\/api\/cadastre\/parcelle/.test(u))return json(F.parcelle);
    const g=u.match(/apicarto\.ign\.fr\/api\/gpu\/([a-z-]+)/);
    if(g)return json({'zone-urba':F.zone,'document':F.document,'assiette-sup-s':F.servitudes,'info-surf':F.informations,'prescription-surf':F.prescriptions,'municipality':F.commune}[g[1]]||{features:[]});
    if(/georisques\.gouv\.fr\/api\/v1\/resultats_rapport_risque/.test(u))return json(F.rapport);
    if(/georisques\.gouv\.fr\/api\/v1\/rga/.test(u))return json(F.argile);
    if(/georisques\.gouv\.fr\/api\/v1\/zonage_sismique/.test(u))return json(F.seisme);
    return r.fulfill({status:204,body:''});});
  const p=await ctx.newPage();p.setDefaultTimeout(15000);const erreurs=[];p.on('pageerror',e=>erreurs.push(String(e)));p.on('dialog',d=>d.accept());
  const ligne=()=>p.evaluate(()=>{const L=Object.values(window.__etat.lignes||{});return L[0]&&L[0].donnees});
  await p.goto('https://app.local/releve/');
  await p.waitForSelector('#nouvelleVisite');
  const [c1]=await Promise.all([p.waitForEvent('filechooser'),p.tap('#nouvelleVisite')]);await c1.setFiles(PHOTO);
  await p.waitForSelector('img.garde[src^="blob:"]');
  chk(/sur 7/.test(await p.textContent('.etapeNom'))&&await p.locator('.natures .puce').count()===3,'1re page : Rénovation / Construction neuve / Agrandissement ; sans choix, le parcours rénovation (7 étapes)');
  await p.tap('.natures >> text=Construction neuve');
  await p.waitForFunction(()=>/Étape 1 sur 5/.test(document.querySelector('.etapeNom').textContent));
  chk(/Le terrain en photo/.test(await p.textContent('main')),'construction : 5 étapes (garde, client, projet, terrain, fin), la photo de garde est celle du terrain');
  /* client */
  await p.tap('#suivant');
  await p.fill('input[name="client.nom"]','FICTIF');await p.fill('input[name="client.telephone"]','06 11 22 33 44');
  await p.fill('input[name="client.adresse"]','12 rue Imaginaire');await p.fill('input[name="client.ville"]','Villefictive');
  /* projet de construction */
  await p.tap('#suivant');
  await p.waitForSelector('text=Le projet de construction');
  await p.tap('.puce >> text="Clé en main"');
  await p.fill('input[name="construction.surface"]','160');
  await p.tap('.puce >> text="R+1"');await p.tap('.puce >> text="4"');await p.tap('.puce >> text="Intégré"');
  await p.tap('.puce >> text="Acquis"');await p.waitForSelector('input[name="construction.prixTerrain"]');
  await p.fill('input[name="construction.prixTerrain"]','55000');
  chk(await p.locator('text=AMPLEUR DE LA RÉNOVATION').count()===0&&await p.isVisible('text=ENVELOPPE DE LA CONSTRUCTION (TTC, HORS TERRAIN)'),'projet de construction : prestation, surface, niveaux, chambres, garage, terrain, financement (pas de questions de rénovation)');
  /* terrain */
  await p.tap('#suivant');
  await p.waitForSelector('#localiserAdresse');
  chk(!(await p.isChecked('input[name="terrain.adresseIdem"]'))&&await p.isVisible('input[name="terrain.adresse"]'),'construction : l’adresse du terrain se saisit à part (case « même adresse » décochée d’office)');
  await p.check('input[name="terrain.adresseIdem"]');
  await p.waitForFunction(()=>!document.querySelector('input[name="terrain.adresse"]'));
  await p.tap('#localiserAdresse');
  await p.waitForSelector('#infosTerrain #parcelle');
  chk(appelsTerrain.some(x=>/q=12%20rue%20Imaginaire/.test(x)),'localiser par l’adresse : l’adresse des travaux part au géocodage');
  const it=await p.textContent('#infosTerrain');
  chk(/section ZK n° 0123/.test(it)&&/812 m² au cadastre/.test(it),'parcelle cadastrale et contenance');
  chk(/PLU DE VILLEFICTIVE — zone UB : zone urbaine pavillonnaire \(zone urbaine\)/.test(it)&&await p.getAttribute('#urbanisme a:has-text("Règlement")','href')==='https://data.geopf.fr/annexes/gpu/documents/DU_61999/docfictif/61999_reglement_20260101.pdf#page=12','urbanisme : document, zone, lien du règlement');
  chk(/Architecte des Bâtiments de France/.test(it)&&/argiles : exposition moyenne/.test(it)&&/sismicité 2 - faible/.test(it)&&/Rapport officiel Géorisques/.test(it),'servitude (ABF), argiles, sismicité, rapport officiel Géorisques');
  chk(await p.locator('.puce.risque.avere').count()>=4,'les risques avérés à l’adresse ressortent');
  const pa=await p.textContent('#pointsAttention');
  chk(/À retenir \(indicatif, à vérifier\)/.test(pa)&&/Plus de 150 m²/.test(pa)&&/Argiles : exposition moyenne/.test(pa)&&/Inondation/.test(pa),'points d’attention indicatifs (150 m², argiles, inondation…)');
  chk(await p.inputValue('input[name="terrain.surface"]')==='812','surface du terrain reprise du cadastre (case vide)');
  chk(await (async()=>{for(let i=0;i<60;i++){const d=await ligne();if(d&&d.valeurs['terrain.infos']&&d.valeurs['terrain.infos'].parcelle)return d.valeurs['terrain.position'].source==='adresse';await p.waitForTimeout(100)}return false})(),'le terrain et ce qu’en disent les services partent avec la visite (relus hors ligne)');
  await p.screenshot({path:SORTIE+'/releve_terrain.png',fullPage:true});
  /* une surface tapée n'est pas écrasée ; GPS sur place */
  await p.fill('input[name="terrain.surface"]','790');
  await p.tap('#localiserGps');
  await p.waitForFunction(()=>/Position GPS sur le terrain \(± 8 m\)/.test(document.querySelector('#infosTerrain').textContent));
  chk(await p.inputValue('input[name="terrain.surface"]')==='790','GPS sur le terrain : relocalisé, la surface tapée (790 m²) n’est pas remplacée');
  /* sur place */
  await p.tap('.puce >> text="Légère pente"');await p.tap('.puce >> text="Sud-Ouest"');
  await p.tap('.puce >> text="Oui" >> nth=0');
  await p.waitForSelector('text=Demander le règlement et le cahier des charges du lotissement');
  chk(true,'en lotissement : rappel du règlement et du cahier des charges');
  /* sans réseau */
  await ctx.setOffline(true);
  await p.tap('#localiserAdresse');
  await p.waitForFunction(()=>/Pas de réseau/.test((document.querySelector('#infoTerrain')||{}).textContent||''));
  chk(await p.isVisible('#infosTerrain #parcelle'),'sans réseau : message clair, les informations déjà lues restent affichées');
  await ctx.setOffline(false);
  /* récapitulatif */
  await p.tap('#suivant');
  await p.waitForFunction(()=>/Étape 5 sur 5/.test(document.querySelector('.etapeNom').textContent));
  const rc=await p.textContent('.recap');
  chk(/Construction neuve/.test(rc)&&/Clé en main · 160 m² habitables · R\+1 · 4 chambre\(s\) · garage intégré/.test(rc)&&/section ZK n° 0123 · 790 m² · zone UB/.test(rc)&&/Acquis · 55\s000\s€/.test(rc),'récapitulatif : projet, construction, terrain acheté, parcelle et zone');
  chk(!/type de travaux/.test(await p.textContent('main')),'construction : on ne réclame pas un « type de travaux » de rénovation');
  /* agrandissement */
  await p.tap('.progres button[aria-label^="Étape 1 "]');
  await p.tap('.natures >> text=Agrandissement');
  await p.waitForFunction(()=>/Étape 1 sur 8/.test(document.querySelector('.etapeNom').textContent));
  await p.tap('.progres button[aria-label^="Étape 3 "]');
  await p.waitForSelector('text=Le projet d’agrandissement');
  await p.tap('.puce >> text="Extension plain-pied"');
  await p.fill('input[name="agrandissement.surface"]','35');await p.fill('input[name="agrandissement.surfaceExistante"]','120');
  await p.tap('#suivant');
  await p.waitForSelector('#infosTerrain');
  const pa2=await p.textContent('#pointsAttention');
  chk(/Autorisation pour 35 m² d’extension/.test(pa2)&&/Plus de 150 m² après travaux/.test(pa2),'agrandissement : 8 étapes, rappels déclaration ou permis et 150 m² après travaux');
  chk(!erreurs.length,'aucune erreur dans la page'+(erreurs.length?' : '+erreurs.join(' | ').slice(0,400):''));
  await b.close();
  console.log(ko?('\n'+ko+' echec(s)'):'\nTout est bon.');process.exitCode=ko?1:0;
})().catch(async e=>{console.error('KO  '+e.stack);process.exitCode=1;if(b)await b.close().catch(()=>{})});
