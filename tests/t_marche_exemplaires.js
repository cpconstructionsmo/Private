/* Marchés › « Rédiger le marché (3 exemplaires) » : un même geste sort trois
   originaux sur le Drive — client, entreprise, CP Constructions —, chacun
   marqué à son destinataire en tête de page. Celui du client porte en annexe
   l'attestation décennale de l'entreprise, reprise du Drive (une photo telle
   quelle, un PDF rendu page à page). Sans attestation lisible, les trois
   sortent quand même et l'écran le dit, avec la raison. Drive, pdf.js et
   canvas simulés ; données fictives. */
const fs=require('fs');const path=require('path');
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const {chk,fin}=verif();
const JPG=fs.readFileSync(path.join(__dirname,'fixtures','portrait.jpg'));
const EXIF=fs.readFileSync(path.join(__dirname,'fixtures','photo_exif.jpg'));
const PNG=fs.readFileSync(path.join(__dirname,'..','assets','logo.png'));
const PDF=Buffer.from('%PDF-1.4 attestation fictive');

/* pdf.js et la toile : six pages A4, chacune rendue en JPEG */
const toile=()=>({width:0,height:0,getContext:()=>({fillRect(){}}),toBlob(cb){cb(new Blob([JPG]))}});
global.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:6,
  getPage:async()=>({getViewport:({scale})=>({width:595*scale,height:842*scale}),render:()=>({promise:Promise.resolve()})})})})};
const envois=[];let illisibles=new Set();
const M=charger(['Marches','EMPTY','dimensionsImage','attestationEnImages','genererMarcheDocx','zipEntree','lignesDocumentXml','controlerMarche'],{
  drive:{ATTJ:JPG,ATTP:PDF},
  document:{getElementById:()=>({}),createElement:t=>t==='canvas'?toile():({click(){},remove(){}}),body:{appendChild(){}},head:{appendChild(){}}},
  fetch:async(url,init,base)=>{
    const m=url.match(/files\/([^/?]+)\?alt=media/);
    if(m&&illisibles.has(m[1]))return {ok:false,status:404,json:async()=>({error:{code:404,message:'File not found: '+m[1]+'.',errors:[{reason:'notFound'}]}})};
    if(/upload\/drive\/v3\/files\?uploadType=multipart/.test(url)){
      const file=init.body.get('file');
      envois.push({nom:file.name,data:new Uint8Array(await file.arrayBuffer())});
      const n=envois.length;
      return {ok:true,status:200,json:async()=>({id:'up'+n,webViewLink:'https://drive.google.com/file/d/up'+n+'/view'})};
    }
    return base(url,init);
  }});
const ab=u=>u.buffer.slice(u.byteOffset,u.byteOffset+u.byteLength);
const texteDocx=async u=>norm(String(M.lignesDocumentXml(new TextDecoder().decode(await M.zipEntree(ab(u),'word/document.xml')))));
const media=async(u,nom)=>{try{return await M.zipEntree(ab(u),'word/media/'+nom)}catch(e){return null}};

const CH={id:'c1',nom:'Maison Fictive',client:'M. et Mme Fictif',adresse:'1 rue Fictive — 61000 Ville',adresseClient:'2 rue du Test — 61000 Ville',tva:20};
const ART={id:'a1',nom:'SARL Plomberie Fictive',corps:'Plomberie',adresse:'3 rue Artisan — 61000 Ville',siret:'000 000 000 00000',
  assureur:'Assurance Fictive',numPolice:'POL-0001',decennaleFin:'2099-12-31',lienAttestation:'https://drive.google.com/file/d/ATTJ/view',email:''};
const LOT={id:'m1',chantierId:'c1',lot:'Plomberie',artisanId:'a1',montantHT:1000,tva:20,statut:'devis',factures:[],dateSignature:'2026-10-26'};

(async()=>{
  /* 1. les images : dimensions lues dans l'en-tête */
  const dP=M.dimensionsImage(new Uint8Array(PNG)), dJ=M.dimensionsImage(new Uint8Array(JPG)), dE=M.dimensionsImage(new Uint8Array(EXIF));
  chk(dP&&dP.ext==='png'&&dP.w===767&&dP.h===505,'PNG : 767 × 505');
  chk(dJ&&dJ.ext==='jpeg'&&dJ.w===800&&dJ.h===1200,'JPEG : 800 × 1 200');
  chk(dE&&dE.w===320&&dE.h===240,'JPEG avec bloc EXIF avant les dimensions : 320 × 240');
  chk(M.dimensionsImage(new Uint8Array(PDF))===null,'un PDF n’est pas une image');

  /* 2. l'attestation en images : une photo passe telle quelle, un PDF page à page (4 au plus) */
  const rJ=await M.attestationEnImages(JPG);
  chk(rJ.pages.length===1&&rJ.pages[0].ext==='jpeg'&&rJ.pages[0].w===800,'photo : une page, telle quelle');
  const rP=await M.attestationEnImages(PDF);
  chk(rP.pages.length===4&&rP.total===6&&rP.pages[0].w===1654&&rP.pages[0].h===Math.round(842*1654/595),'PDF de 6 pages : les 4 premières, rendues à 1 654 px de large');
  let refus='';try{await M.attestationEnImages(Buffer.from('texte quelconque'))}catch(e){refus=e.message}
  chk(/format non pris en charge/.test(refus),'autre format : refusé, avec la raison');

  /* 3. le Word : la mention de l'exemplaire, l'annexe et son image */
  const D={lot:'Plomberie',lotDetail:'Plomberie',numero:'4',date:'26/10/2026',entreprise:ART.nom,adresse:ART.adresse,siret:ART.siret,
    decennale:'POL-0001',compagnie:'Assurance Fictive',decennaleFin:'31/12/2099',client:CH.client,clientAdresse:CH.adresseClient,clientTel:'',
    chantierAdresse:CH.adresse,chantierNom:CH.nom,mapsUrl:'',planExeUrl:'',ht:1000,brut:1000,remise:0,tva:20,tvaMontant:200,ttc:1200,lignes:[]};
  const cl=await M.genererMarcheDocx({...D,exemplaire:'Exemplaire du maître de l’ouvrage',attestation:rJ.pages});
  let t=await texteDocx(cl);
  chk(/MARCHÉ DE TRAVAUX/.test(t)&&/Exemplaire du maître de l’ouvrage/.test(t),'exemplaire client : marqué en tête');
  chk(/Annexe — Attestation d’assurance décennale/.test(t)&&/SARL Plomberie Fictive — Assurance Fictive — police POL-0001 — valable jusqu’au 31\/12\/2099/.test(t)
    &&/annexée au marché n° 4 — lot « Plomberie »/.test(t),'annexe : titre, entreprise, police, validité');
  const img=await media(cl,'attestation-1.jpeg');
  chk(!!img&&img.length===JPG.length,'l’attestation est dans le Word, à l’octet près');
  const rels=new TextDecoder().decode(await M.zipEntree(ab(cl),'word/_rels/document.xml.rels'));
  chk(/Id="rId20"[^>]*Target="media\/attestation-1\.jpeg"/.test(rels)&&/r:embed="rId20"/.test(new TextDecoder().decode(await M.zipEntree(ab(cl),'word/document.xml'))),
    'l’image est reliée au document (rId20)');
  const en=await M.genererMarcheDocx({...D,exemplaire:'Exemplaire de l’entreprise'});
  t=await texteDocx(en);
  chk(/Exemplaire de l’entreprise/.test(t)&&!/Annexe — Attestation/.test(t)&&!(await media(en,'attestation-1.jpeg')),'exemplaire entreprise : marqué, sans annexe');
  const sans=await M.genererMarcheDocx(D);
  t=await texteDocx(sans);
  chk(!/Exemplaire/.test(t)&&/en trois exemplaires originaux/.test(t),'sans exemplaire précisé : le marché reste celui d’avant');
  fs.writeFileSync(path.join(global.SORTIE,'marche_exemplaire_client.docx'),cl);

  /* 4. l'écran : un clic, trois exemplaires sur le Drive */
  const ouvrir=(art,lot)=>{
    let data={...M.EMPTY,chantiers:[CH],artisans:[art],marches:[lot],commandes:[]}, tr;
    const props=()=>({data,ch:CH,save:d=>{data=d;TR.act(()=>{tr.update(React.createElement(M.Marches,props()))})},eng:0,fac:0,onFacturerCmd(){},onFacturerHono(){}});
    TR.act(()=>{tr=TR.create(React.createElement(M.Marches,props()))});
    const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
    TR.act(()=>{btn(/Modifier le lot/).props.onClick()});
    return {tr,btn,data:()=>data,t:()=>norm(texteInst(tr.root))};
  };
  let o=ouvrir(ART,LOT);
  chk(/Il sort en trois exemplaires : client \(avec l'attestation décennale de l'entreprise en annexe\), entreprise et CP Constructions/.test(o.t()),'l’écran annonce les trois exemplaires');
  await TR.act(async()=>{await o.btn(/Rédiger le marché \(3 exemplaires\)/).props.onClick()});
  chk(envois.length===3&&/Marché 1 — Plomberie — SARL Plomberie Fictive — exemplaire client\.docx$/.test(envois[0].nom)
    &&/— exemplaire entreprise\.docx$/.test(envois[1].nom)&&/— exemplaire CP Constructions\.docx$/.test(envois[2].nom),
    'trois fichiers déposés : client, entreprise, CP Constructions');
  const [tC,tE,tM]=await Promise.all(envois.map(x=>texteDocx(x.data)));
  chk(/Exemplaire du maître de l’ouvrage/.test(tC)&&/Annexe — Attestation d’assurance décennale/.test(tC)&&!!(await media(envois[0].data,'attestation-1.jpeg')),
    'exemplaire client : marqué, avec l’attestation reprise du Drive');
  chk(/Exemplaire de l’entreprise/.test(tE)&&!/Annexe/.test(tE),'exemplaire entreprise : sans annexe');
  chk(/Exemplaire du maître d’œuvre/.test(tM)&&!/Annexe/.test(tM),'exemplaire CP Constructions : sans annexe');
  t=o.t();
  chk(/Marché n° 1 rédigé en 3 exemplaires et déposé sur le Drive/.test(t)&&/Exemplaire client — avec l’attestation décennale \(1 page\)/.test(t)
    &&/Exemplaire entreprise/.test(t)&&/Exemplaire CP Constructions/.test(t)&&!/sans l’attestation/.test(t),'l’écran donne les trois liens, l’attestation jointe');
  TR.act(()=>{o.btn(/^Enregistrer$/).props.onClick()});
  const m=o.data().marches[0];
  chk(m.contratLien==='https://drive.google.com/file/d/up3/view'&&m.exemplaires.client==='https://drive.google.com/file/d/up1/view'
    &&m.exemplaires.entreprise==='https://drive.google.com/file/d/up2/view'&&m.exemplaires.attestation===true&&m.numeroMarche==='1',
    'enregistré : le contrat du lot est l’exemplaire CP Constructions, les deux autres gardés à côté');
  TR.act(()=>{o.btn(/Modifier le lot/).props.onClick()});
  chk(/Exemplaires sortis le \d\d\/\d\d\/\d{4} : client · entreprise · CP Constructions/.test(o.t()),'à la réouverture : les trois exemplaires se retrouvent');
  TR.act(()=>o.tr.unmount());

  /* 5. attestation illisible sur le Drive : les trois sortent, l'écran le dit */
  envois.length=0;illisibles=new Set(['ATTJ']);
  o=ouvrir(ART,LOT);
  await TR.act(async()=>{await o.btn(/Rédiger le marché \(3 exemplaires\)/).props.onClick()});
  t=o.t();
  chk(envois.length===3&&!(await media(envois[0].data,'attestation-1.jpeg'))&&!/Annexe/.test(await texteDocx(envois[0].data)),'illisible : trois exemplaires quand même, sans annexe');
  chk(/L’exemplaire client est sorti sans l’attestation décennale : .*illisible avec ce compte Google/.test(t)&&/onglet ARTISANS/.test(t),'l’écran dit pourquoi, et quoi faire');
  TR.act(()=>o.tr.unmount());

  /* 6. une attestation en PDF de 6 pages : les 4 premières, et on le signale */
  envois.length=0;illisibles=new Set();
  o=ouvrir({...ART,lienAttestation:'https://drive.google.com/file/d/ATTP/view'},LOT);
  await TR.act(async()=>{await o.btn(/Rédiger le marché \(3 exemplaires\)/).props.onClick()});
  t=o.t();
  chk(!!(await media(envois[0].data,'attestation-4.jpeg'))&&!(await media(envois[0].data,'attestation-5.jpeg')),'PDF : quatre pages annexées');
  chk(/avec l’attestation décennale \(4 pages\)/.test(t)&&/compte 6 pages : seules les 4 premières sont annexées/.test(t),'l’écran signale la pièce trop longue');
  TR.act(()=>o.tr.unmount());

  /* 7. pas d'attestation déposée : alerte avant, raison après */
  envois.length=0;
  const sansAtt={...ART,lienAttestation:''};
  chk(M.controlerMarche(LOT,sansAtt,CH).some(p=>!p.bloquant&&/l’exemplaire du client sortirait sans elle/.test(p.texte)),'contrôle avant sortie : l’attestation manquante est signalée');
  o=ouvrir(sansAtt,LOT);
  await TR.act(async()=>{await o.btn(/Rédiger le marché \(3 exemplaires\)/).props.onClick()});
  chk(envois.length===3&&/sans l’attestation décennale : aucune attestation n’est déposée sur la fiche de l’entreprise/.test(o.t()),'aucune attestation : trois exemplaires, la raison est dite');
  TR.act(()=>o.tr.unmount());
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
