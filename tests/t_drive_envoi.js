/* Envoi d'un fichier sur le Drive : au-delà de 5 Mo (un scan de facture pris
   au téléphone), l'envoi passe par une session « reprenable » ; un refus de
   Google dit sa raison et quoi faire, au lieu de « upload Drive échoué ».
   Le Drive est simulé ; aucun fichier réel. */
const {charger,verif}=require('./harness');
const {chk,fin}=verif();
let repondre=null;const appels=[];
const M=charger(['uploadToDrive','driveFindOrCreateSubfolder','driveFolder','driveErreur'],{fetch:async(url,init,base)=>{
  appels.push({url,init});
  const r=repondre&&repondre(url,init);
  return r||base(url,init);
}});
const rep=(status,corps,entetes)=>({ok:status>=200&&status<300,status,json:async()=>corps||{},
  headers:{get:k=>(entetes||{})[k]||null}});
const erreur=(status,reason,message)=>rep(status,{error:{code:status,message:message||'',errors:[{reason}]}});
const fichier=(n,nom)=>new File([new Uint8Array(n)],nom||'facture.pdf',{type:'application/pdf'});
const essai=async f=>{try{await f();return null}catch(e){return e}};

(async()=>{
  /* 1. petit fichier : une seule requête, comme avant */
  appels.length=0;repondre=null;
  let r=await M.uploadToDrive(fichier(1000),'dossier1');
  chk(/uploadType=multipart/.test(appels[0].url)&&!!r.webViewLink,'fichier de 1 ko : envoi en une requête');

  /* 2. scan de 6 Mo : session reprenable, puis le fichier */
  appels.length=0;
  repondre=(url,init)=>/uploadType=resumable/.test(url)?rep(200,{},{Location:'https://upload.example/session/abc'})
    :/session\/abc/.test(url)?rep(200,{id:'f6',webViewLink:'https://drive.google.com/file/d/f6/view'}):null;
  r=await M.uploadToDrive(fichier(6*1024*1024,'scan.pdf'),'dossier1');
  const ouv=appels[0], put=appels[1];
  chk(/uploadType=resumable/.test(ouv.url)&&ouv.init.headers['X-Upload-Content-Length']===String(6*1024*1024)
    &&JSON.parse(ouv.init.body).parents[0]==='dossier1','fichier de 6 Mo : la session s’ouvre, avec la taille et le dossier');
  chk(put.init.method==='PUT'&&put.init.body.size===6*1024*1024&&r.id==='f6','… puis le fichier part dans la session, et le lien revient');

  /* 3. les refus de Google, dits clairement */
  const cas=[
    [erreur(401,'authError','Invalid Credentials'),e=>e&&e.error==='auth_required','jeton refusé (401) : reconnexion demandée'],
    [erreur(403,'storageQuotaExceeded','The user’s Drive storage quota has been exceeded.'),e=>/Drive de ce compte Google est plein/.test(e.message),'Drive plein : on le dit'],
    [erreur(403,'insufficientPermissions','Request had insufficient authentication scopes.'),e=>/cochez l’accès à Google Drive/.test(e.message),'accès au Drive non accordé : on dit de le cocher'],
    [erreur(403,'userRateLimitExceeded','Rate limit'),e=>/réessayez dans une minute/.test(e.message),'trop d’envois d’un coup : réessayer dans une minute'],
    [erreur(404,'notFound','File not found: dossier1.'),e=>/dossier du chantier est introuvable/.test(e.message),'dossier introuvable : il sera retrouvé ou recréé'],
    [erreur(500,'backendError','Backend Error'),e=>/code 500 : Backend Error/.test(e.message),'autre refus : le code et le message de Google'],
  ];
  for(const [reponse,ok,m] of cas){
    repondre=url=>/upload\/drive/.test(url)?reponse:null;
    const e=await essai(()=>M.uploadToDrive(fichier(1000),'dossier1'));
    chk(ok(e),m+' — '+((e&&(e.message||e.error))||'aucune erreur'));
  }

  /* 4. une recherche de dossier refusée ne crée plus de dossier en double */
  appels.length=0;
  repondre=url=>/drive\/v3\/files\?q=/.test(url)?erreur(401,'authError','Invalid Credentials'):null;
  const e=await essai(()=>M.driveFindOrCreateSubfolder('j','racine','Factures'));
  chk(e&&e.error==='auth_required'&&!appels.some(a=>a.init&&a.init.method==='POST'),'recherche refusée : erreur, et aucun dossier créé à l’aveugle');
  /* 5. la création refusée est dite aussi */
  repondre=(url,init)=>/drive\/v3\/files\?q=/.test(url)?rep(200,{files:[]})
    :(init&&init.method==='POST'&&/drive\/v3\/files$/.test(url))?erreur(403,'storageQuotaExceeded',''):null;
  const e2=await essai(()=>M.driveFindOrCreateSubfolder('j','racine','Factures'));
  chk(e2&&/plein/.test(e2.message),'création de dossier refusée : la raison est dite');
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
