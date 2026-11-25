/* Marchés › lot › le marché de travaux, d'après le marché du terrassier
   (données fictives) :
   - les trois exemplaires sortent aussi en un seul fichier à imprimer d'un
     coup (PDF tiré par le Drive ; à défaut, le Word d'ensemble) : client
     avec son annexe, entreprise, CP Constructions, à la suite ;
   - un marché sorti avant se prépare à l'impression d'un clic ;
   - l'exemplaire client sorti sans l'attestation décennale garde la raison,
     la redit à la réouverture (ou la retrouve, « Pourquoi ? »), et
     l'attestation se redépose sur place, vérifiée avant l'envoi, avant de
     ressortir le marché.
   Drive, pdf.js et canvas simulés. */
const fs=require('fs');const path=require('path');
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const {chk,fin}=verif();
const JPG=fs.readFileSync(path.join(__dirname,'fixtures','portrait.jpg'));
const toile=()=>({width:0,height:0,getContext:()=>({fillRect(){}}),toBlob(cb){cb(new Blob([JPG]))}});
global.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:1,
  getPage:async()=>({getViewport:({scale})=>({width:595*scale,height:842*scale}),render:()=>({promise:Promise.resolve()})})})})};
const envois=[], conversions=[], stock={};
let illisibles=new Set(), conversionKO=false;
const M=charger(['Marches','EMPTY','genererMarcheImpressionDocx','genererMarcheDocx','attestationEnImages','zipEntree','lignesDocumentXml','MARCHE_EXEMPLAIRES'],{
  drive:{ATTJ:JPG},
  document:{getElementById:()=>({}),createElement:t=>t==='canvas'?toile():({click(){},remove(){}}),body:{appendChild(){}},head:{appendChild(){}}},
  fetch:async(url,init,base)=>{
    const m=url.match(/files\/([^/?]+)\?alt=media/);
    if(m&&illisibles.has(m[1]))return {ok:false,status:404,json:async()=>({error:{code:404,message:'File not found.',errors:[{reason:'notFound'}]}})};
    if(m&&stock[m[1]]){const b=stock[m[1]];return {ok:true,status:200,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}}
    if(/upload\/drive\/v3\/files\?uploadType=multipart&fields=id$/.test(url)){
      conversions.push(new Uint8Array(await init.body.get('file').arrayBuffer()));
      return {ok:true,status:200,json:async()=>({id:'conv'+conversions.length})};
    }
    if(/files\/conv\d+\/export\?mimeType=application\/pdf/.test(url))
      return conversionKO?{ok:false,status:500,json:async()=>({})}:{ok:true,status:200,arrayBuffer:async()=>new TextEncoder().encode('%PDF-1.7 trois exemplaires').buffer};
    if(/upload\/drive\/v3\/files\?uploadType=multipart/.test(url)){
      const file=init.body.get('file');
      const data=new Uint8Array(await file.arrayBuffer());
      envois.push({nom:file.name,data});
      const id='up'+envois.length; stock[id]=data;
      return {ok:true,status:200,json:async()=>({id,webViewLink:'https://drive.google.com/file/d/'+id+'/view'})};
    }
    return base(url,init);
  }});
const ab=u=>u.buffer.slice(u.byteOffset,u.byteOffset+u.byteLength);
const xmlDocx=async u=>new TextDecoder().decode(await M.zipEntree(ab(u),'word/document.xml'));
const texteDocx=async u=>norm(String(M.lignesDocumentXml(await xmlDocx(u))));
const media=async(u,nom)=>{try{return await M.zipEntree(ab(u),'word/media/'+nom)}catch(e){return null}};

const CH={id:'c1',nom:'Maison Fictive',client:'M. et Mme Fictif',adresse:'1 rue Fictive — 61000 Ville',adresseClient:'2 rue du Test — 61000 Ville',tva:20};
const ART={id:'a1',nom:'SARL Terrassement Fictive',corps:'Terrassement',adresse:'3 rue Artisan — 61000 Ville',siret:'000 000 000 00000',
  assureur:'Assurance Fictive',numPolice:'POL-0001',decennaleFin:'2099-12-31',lienAttestation:'https://drive.google.com/file/d/ATTJ/view',email:''};
const LOT={id:'m1',chantierId:'c1',lot:'TERRASSEMENT',artisanId:'a1',montantHT:1000,tva:20,statut:'devis',factures:[],dateSignature:'2026-11-25'};

(async()=>{
  /* 1. le document à imprimer : les trois exemplaires à la suite */
  {
    const D={lot:'TERRASSEMENT',lotDetail:'TERRASSEMENT',numero:'1',date:'25/11/2026',entreprise:ART.nom,adresse:ART.adresse,siret:ART.siret,
      decennale:'POL-0001',compagnie:'Assurance Fictive',decennaleFin:'31/12/2099',client:CH.client,clientAdresse:CH.adresseClient,clientTel:'',
      chantierAdresse:CH.adresse,chantierNom:CH.nom,mapsUrl:'',planExeUrl:'',ht:1000,brut:1000,remise:0,tva:20,tvaMontant:200,ttc:1200,lignes:[]};
    const pages=(await M.attestationEnImages(JPG)).pages;
    const doc=await M.genererMarcheImpressionDocx(D,pages);
    const t=await texteDocx(doc), x=await xmlDocx(doc);
    const i=s=>t.indexOf(s);
    chk(i('Exemplaire du maître de l’ouvrage')>=0&&i('Exemplaire du maître de l’ouvrage')<i('Annexe — Attestation d’assurance décennale')
      &&i('Annexe — Attestation d’assurance décennale')<i('Exemplaire de l’entreprise')&&i('Exemplaire de l’entreprise')<i('Exemplaire du maître d’œuvre'),
      'client (avec son annexe), entreprise, CP Constructions : à la suite, dans cet ordre');
    chk((t.match(/MARCHÉ DE TRAVAUX/g)||[]).length===6&&(t.match(/en trois exemplaires originaux/g)||[]).length===3,'chaque exemplaire est complet (en-têtes, clauses, signatures)');
    chk((x.match(/<w:body>/g)||[]).length===1&&(x.match(/<w:sectPr>/g)||[]).length===1&&/<\/w:sectPr><\/w:body><\/w:document>$/.test(x),'un seul document, bien fermé');
    const ids=[...x.matchAll(/<wp:docPr id="(\d+)"/g)].map(r=>+r[1]);
    chk(ids.some(n=>n<1000)&&ids.some(n=>n>=1000&&n<2000)&&ids.some(n=>n>=2000),'les dessins gardent un numéro propre à leur exemplaire');
    chk((x.match(/r:embed="rId20"/g)||[]).length===1&&!!(await media(doc,'attestation-1.jpeg')),'l’attestation n’est annexée qu’une fois, à l’exemplaire du client');
    fs.writeFileSync(path.join(global.SORTIE,'marche_3_exemplaires.docx'),doc);
    const seul=await M.genererMarcheDocx({...D,exemplaire:M.MARCHE_EXEMPLAIRES[1].titre});
    chk(/Exemplaire de l’entreprise/.test(await texteDocx(seul))&&!/Exemplaire du maître de l’ouvrage/.test(await texteDocx(seul)),'les exemplaires séparés restent ceux d’avant');
  }

  const ouvrir=(art,lot)=>{
    let data={...M.EMPTY,chantiers:[CH],artisans:[art],marches:[lot],commandes:[]}, tr;
    const props=()=>({data,ch:CH,save:d=>{data=d;TR.act(()=>{tr.update(React.createElement(M.Marches,props()))})},eng:0,fac:0,onFacturerCmd(){},onFacturerHono(){}});
    TR.act(()=>{tr=TR.create(React.createElement(M.Marches,props()))});
    const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
    const lien=re=>tr.root.findAll(n=>n.type==='a').find(n=>re.test(norm(texteInst(n))));
    TR.act(()=>{btn(/Modifier le lot/).props.onClick()});
    const attendre=async re=>{for(let k=0;k<80&&!re.test(norm(texteInst(tr.root)));k++)await TR.act(()=>new Promise(r=>setTimeout(r,5)))};
    const deposer=async file=>{const z=tr.root.findAll(n=>n.type==='label'&&n.props['aria-label']==='Déposer l’attestation décennale')[0];
      await TR.act(async()=>{await z.props.onDrop({preventDefault(){},stopPropagation(){},dataTransfer:{files:[file]}})})};
    return {tr,btn,lien,attendre,deposer,data:()=>data,t:()=>norm(texteInst(tr.root))};
  };

  /* 2. la sortie : les trois exemplaires, et le PDF à imprimer */
  {
    envois.length=0;conversions.length=0;
    const o=ouvrir(ART,LOT);
    await TR.act(async()=>{await o.btn(/Rédiger le marché \(3 exemplaires\)/).props.onClick()});
    const imp=envois[3];
    chk(envois.length===4&&imp.nom==='Marché 1 — TERRASSEMENT — SARL Terrassement Fictive — 3 exemplaires à imprimer.pdf'
      &&new TextDecoder().decode(imp.data)==='%PDF-1.7 trois exemplaires','le PDF à imprimer est déposé avec les exemplaires');
    const tc=await texteDocx(conversions[0]);
    chk(conversions.length===1&&/Exemplaire du maître de l’ouvrage/.test(tc)&&/Exemplaire de l’entreprise/.test(tc)&&/Exemplaire du maître d’œuvre/.test(tc)
      &&!!(await media(conversions[0],'attestation-1.jpeg')),'le PDF est tiré du Word des trois exemplaires, attestation comprise');
    const l=o.lien(/Imprimer les 3 exemplaires/);
    chk(l&&l.props.href==='https://drive.google.com/file/d/up4/view'&&l.props.target==='_blank'
      &&/un seul PDF : client \(avec l’attestation décennale\), entreprise et CP Constructions, à la suite/.test(o.t()),'l’écran : « 🖨 Imprimer les 3 exemplaires », un vrai lien');
    TR.act(()=>{o.btn(/^Enregistrer$/).props.onClick()});
    const m=o.data().marches[0];
    chk(m.exemplaires.impression&&m.exemplaires.impression.lien==='https://drive.google.com/file/d/up4/view'&&m.exemplaires.impression.pdf===true
      &&m.exemplaires.impression.attestation===true&&m.exemplaires.attestation===true&&!m.exemplaires.attestationRaison,'enregistré avec le lot');
    TR.act(()=>{o.btn(/Modifier le lot/).props.onClick()});
    chk(o.lien(/Imprimer les 3 exemplaires/)&&!o.btn(/Préparer les 3 exemplaires/),'à la réouverture : le lien pour imprimer');
    TR.act(()=>o.tr.unmount());
  }

  /* 3. le Drive ne tire pas le PDF : le Word d'ensemble, et c'est dit */
  {
    envois.length=0;conversionKO=true;
    const o=ouvrir(ART,LOT);
    await TR.act(async()=>{await o.btn(/Rédiger le marché \(3 exemplaires\)/).props.onClick()});
    chk(envois.length===4&&/— 3 exemplaires à imprimer\.docx$/.test(envois[3].nom)&&/Exemplaire de l’entreprise/.test(await texteDocx(envois[3].data)),
      'sans PDF : le Word des trois exemplaires');
    chk(/un seul fichier Word/.test(o.t())&&/Le PDF n’a pas pu être tiré .* ouvrez ce Word, puis Fichier › Imprimer/.test(o.t()),'l’écran le dit');
    conversionKO=false;
    TR.act(()=>o.tr.unmount());
  }

  /* 4. un marché sorti avant, sans attestation : la raison, l'impression, le redépôt */
  {
    envois.length=0;illisibles=new Set(['ATTJ']);
    const avant={...LOT,numeroMarche:'1',contratLien:'https://drive.google.com/file/d/W3/view',
      exemplaires:{le:'2026-11-25',client:'https://drive.google.com/file/d/W1/view',entreprise:'https://drive.google.com/file/d/W2/view',moe:'https://drive.google.com/file/d/W3/view',attestation:false}};
    const o=ouvrir(ART,avant);
    chk(/l’exemplaire client n’a pas l’attestation décennale/.test(o.t())&&/L’exemplaire client est sorti sans l’attestation décennale\./.test(o.t())&&!!o.btn(/^Pourquoi \?$/),
      'sorti avant : sans raison gardée, « Pourquoi ? »');
    await TR.act(async()=>{await o.btn(/^Pourquoi \?$/).props.onClick()});
    await o.attendre(/illisible avec ce compte Google/);
    chk(/sans l’attestation décennale : fichier introuvable sur le Drive, ou illisible avec ce compte Google/.test(o.t()),'« Pourquoi ? » : la raison retrouvée');
    /* l'impression d'un marché déjà sorti */
    await TR.act(async()=>{await o.btn(/Préparer les 3 exemplaires à imprimer/).props.onClick()});
    await o.attendre(/Imprimer les 3 exemplaires/);
    chk(envois.length===1&&/— 3 exemplaires à imprimer\.pdf$/.test(envois[0].nom)&&o.lien(/Imprimer les 3 exemplaires/)
      &&/lui aussi, sans l’attestation/.test(o.t())&&/Enregistrez le lot pour garder ce lien/.test(o.t()),'« Préparer » : le PDF d’un marché déjà sorti, d’un clic');
    /* une pièce qui ne s'annexe pas : rien n'est envoyé */
    await o.deposer(new File([Buffer.from('texte quelconque')],'attestation.txt',{type:'text/plain'}));
    chk(/« attestation\.txt » ne peut pas s’annexer au marché — format non pris en charge/.test(o.t())&&/Rien n’a été envoyé/.test(o.t())&&envois.length===1,
      'une pièce illisible n’est pas envoyée');
    /* la bonne pièce, redéposée sur place */
    await o.deposer(new File([JPG],'attestation decennale 2026.jpg',{type:'image/jpeg'}));
    await o.attendre(/Attestation redéposée/);
    const a=o.data().artisans[0];
    chk(envois.length===2&&envois[1].nom==='attestation decennale 2026.jpg'&&a.lienAttestation==='https://drive.google.com/file/d/up2/view'
      &&a.nom===ART.nom&&a.numPolice===ART.numPolice,'redéposée : le lien de la fiche de l’entreprise est remplacé, le reste ne bouge pas');
    chk(/✓ Attestation redéposée sur la fiche de SARL Terrassement Fictive \(attestation decennale 2026\.jpg\) — 1 page à annexer/.test(o.t()),'l’écran le dit');
    await TR.act(async()=>{await o.btn(/Ressortir le marché avec l’attestation/).props.onClick()});
    await o.attendre(/rédigé en 3 exemplaires/);
    chk(envois.length===6&&!!(await media(envois[2].data,'attestation-1.jpeg'))&&/avec l’attestation décennale \(1 page\)/.test(o.t())
      &&/\(avec l’attestation décennale\), entreprise/.test(o.t()),'ressorti : l’exemplaire client et le PDF à imprimer portent l’attestation');
    TR.act(()=>{o.btn(/^Enregistrer$/).props.onClick()});
    const m=o.data().marches[0];
    chk(m.exemplaires.attestation===true&&!m.exemplaires.attestationRaison&&m.exemplaires.impression.attestation===true
      &&m.contratLien==='https://drive.google.com/file/d/up5/view','enregistré : l’exemplaire client complet, le PDF à imprimer à jour');
    TR.act(()=>o.tr.unmount());
  }

  /* 5. la raison se garde : relue à la réouverture */
  {
    envois.length=0;illisibles=new Set(['ATTJ']);
    const o=ouvrir(ART,LOT);
    await TR.act(async()=>{await o.btn(/Rédiger le marché \(3 exemplaires\)/).props.onClick()});
    TR.act(()=>{o.btn(/^Enregistrer$/).props.onClick()});
    const m=o.data().marches[0];
    chk(m.exemplaires.attestation===false&&/illisible avec ce compte Google/.test(m.exemplaires.attestationRaison||''),'la raison est gardée avec les exemplaires');
    TR.act(()=>{o.btn(/Modifier le lot/).props.onClick()});
    chk(/L’exemplaire client est sorti sans l’attestation décennale : fichier introuvable sur le Drive, ou illisible avec ce compte Google/.test(o.t())
      &&!o.btn(/^Pourquoi \?$/)&&/Redéposer l’attestation décennale/.test(o.t()),'à la réouverture : la raison, et le redépôt');
    illisibles=new Set();
    TR.act(()=>o.tr.unmount());
  }
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
