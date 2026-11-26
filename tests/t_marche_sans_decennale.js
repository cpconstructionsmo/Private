/* Marchés › lot › « Rédiger quand même, sans décennale » : quand seule la
   décennale manque (pas de date de validité, ou expirée), CP Constructions
   peut sortir le marché quand même, après confirmation ; le contrat dit
   alors que l'attestation est à fournir avant le démarrage des travaux, au
   lieu de la dire annexée. Tout autre blocage (montant nul, client,
   adresse) reste bloquant. Drive simulé ; données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const {chk,fin}=verif();
const envois=[];let confirme=false, demandes=[];
const M=charger(['Marches','EMPTY','controlerMarche','marcheBloque','marcheForcable','decennaleAFournir','genererMarcheDocx','zipEntree','lignesDocumentXml'],{
  confirm:m=>{demandes.push(m);return confirme},
  fetch:async(url,init,base)=>{
    if(/upload\/drive\/v3\/files\?uploadType=multipart&fields=id$/.test(url))return {ok:true,status:200,json:async()=>({id:'conv'})};
    if(/files\/conv\/export\?mimeType=application\/pdf/.test(url))return {ok:true,status:200,arrayBuffer:async()=>new TextEncoder().encode('%PDF-1.7 fictif').buffer};
    if(/upload\/drive\/v3\/files\?uploadType=multipart/.test(url)){
      const file=init.body.get('file');
      envois.push({nom:file.name,data:new Uint8Array(await file.arrayBuffer())});
      return {ok:true,status:200,json:async()=>({id:'up'+envois.length,webViewLink:'https://drive.google.com/file/d/up'+envois.length+'/view'})};
    }
    return base(url,init);
  }});
const ab=u=>u.buffer.slice(u.byteOffset,u.byteOffset+u.byteLength);
const texteDocx=async u=>norm(String(M.lignesDocumentXml(new TextDecoder().decode(await M.zipEntree(ab(u),'word/document.xml')))));
const CH={id:'c1',nom:'Maison Fictive',client:'M. et Mme Fictif',adresse:'1 rue Fictive — 61000 Ville',adresseClient:'2 rue du Test — 61000 Ville',tva:20};
const SANS={id:'a1',nom:'SARL Plâtrerie Fictive',corps:'Plâtrerie',adresse:'3 rue Artisan',siret:'000',email:''};
const LOT={id:'m1',chantierId:'c1',lot:'BANDES PLACO',artisanId:'a1',montantHT:3020,tva:20,statut:'devis',factures:[],numeroMarche:'7',dateSignature:'2026-11-26'};

(async()=>{
  /* 1. le contrôle : seule la décennale manque → forçable ; sinon, non */
  {
    const P=M.controlerMarche(LOT,SANS,CH);
    chk(M.marcheBloque(P)&&M.marcheForcable(P),'pas de date de validité de décennale : bloqué, mais forçable');
    const exp=M.controlerMarche(LOT,{...SANS,decennaleFin:'2026-01-31'},CH);
    chk(M.marcheBloque(exp)&&M.marcheForcable(exp)&&exp.some(x=>/a expiré le 31\/01\/2026/.test(x.texte)),'décennale expirée : forçable aussi');
    chk(!M.marcheForcable(M.controlerMarche({...LOT,montantHT:0},SANS,CH)),'montant nul en plus : rien à forcer');
    chk(!M.marcheForcable(M.controlerMarche(LOT,SANS,{...CH,client:''})),'client manquant en plus : rien à forcer');
    const ok=M.controlerMarche(LOT,{...SANS,decennaleFin:'2099-12-31'},CH);
    chk(!M.marcheBloque(ok)&&!M.marcheForcable(ok),'décennale valable : rien de bloqué');
    chk(M.decennaleAFournir(SANS,'2026-11-26')&&M.decennaleAFournir({...SANS,decennaleFin:'2026-01-31'},'2026-11-26')
      &&!M.decennaleAFournir({...SANS,decennaleFin:'2099-12-31'},'2026-11-26'),'attestation à fournir : sans date, ou expirée à la signature');
  }
  /* 2. le contrat : « à fournir », jamais « annexée » */
  {
    const D={lot:'BANDES PLACO',lotDetail:'BANDES PLACO',numero:'7',date:'26/11/2026',entreprise:SANS.nom,adresse:SANS.adresse,siret:'000',
      decennale:'',compagnie:'',decennaleFin:'',client:CH.client,clientAdresse:CH.adresseClient,clientTel:'',
      chantierAdresse:CH.adresse,chantierNom:CH.nom,mapsUrl:'',planExeUrl:'',ht:3020,brut:3020,remise:0,tva:20,tvaMontant:604,ttc:3624,lignes:[]};
    const t=await texteDocx(await M.genererMarcheDocx({...D,decennaleAFournir:true}));
    chk(/Attestation en cours de validité : à fournir avant le démarrage des travaux/.test(t),'les parties : l’attestation est à fournir');
    chk(/L’attestation en cours de validité n’a pas été fournie à la date du présent marché : l’entreprise s’oblige à la remettre avant tout démarrage des travaux/.test(t)
      &&!/est annexée au marché/.test(t),'la clause : à remettre avant tout démarrage, jamais « annexée »');
    const t2=await texteDocx(await M.genererMarcheDocx({...D,compagnie:'Assurance Fictive',decennale:'POL-1',decennaleFin:'31/12/2099'}));
    chk(/Attestation valable jusqu’au : 31\/12\/2099/.test(t2)&&/L’attestation en cours de validité est annexée au marché \(police n° POL-1, Assurance Fictive\)/.test(t2)
      &&!/à fournir avant/.test(t2),'avec une décennale valable : le contrat reste celui d’avant');
  }
  /* 3. à l'écran */
  const ouvrir=(art,lot)=>{
    let data={...M.EMPTY,chantiers:[CH],artisans:[art],marches:[lot],commandes:[]}, tr;
    const props=()=>({data,ch:CH,save:d=>{data=d;TR.act(()=>{tr.update(React.createElement(M.Marches,props()))})},eng:0,fac:0,onFacturerCmd(){},onFacturerHono(){}});
    TR.act(()=>{tr=TR.create(React.createElement(M.Marches,props()))});
    const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
    TR.act(()=>{btn(/Modifier le lot/).props.onClick()});
    return {tr,btn,data:()=>data,t:()=>norm(texteInst(tr.root))};
  };
  {
    const o=ouvrir(SANS,LOT);
    chk(o.btn(/Rédiger le marché \(3 exemplaires\)/).props.disabled&&/Le marché ne peut pas être émis en l’état/.test(o.t()),'le bouton habituel reste bloqué');
    const forcer=o.btn(/Rédiger quand même, sans décennale/);
    chk(!!forcer&&/Le contrat dira que l’attestation est à fournir avant le démarrage des travaux/.test(o.t()),'« Rédiger quand même, sans décennale » est proposé');
    /* refusé : rien ne part */
    confirme=false;demandes=[];
    await TR.act(async()=>{forcer.props.onClick()});
    chk(/Rédiger le marché sans décennale valable \?/.test(demandes[0]||'')&&/n’a pas de date de validité de décennale/.test(demandes[0]||'')
      &&/à fournir par SARL Plâtrerie Fictive avant le démarrage des travaux/.test(demandes[0]||'')&&envois.length===0,'la question est posée ; refusée, rien ne part');
    /* accepté : les 3 exemplaires et le PDF à imprimer */
    confirme=true;
    await TR.act(async()=>{await o.btn(/Rédiger quand même, sans décennale/).props.onClick()});
    for(let k=0;k<60&&!/rédigé en 3 exemplaires/.test(o.t());k++)await TR.act(()=>new Promise(r=>setTimeout(r,5)));
    chk(envois.length===4&&/exemplaire client\.docx$/.test(envois[0].nom)&&/3 exemplaires à imprimer\.pdf$/.test(envois[3].nom),'les 3 exemplaires et le PDF à imprimer sont déposés');
    const tc=await texteDocx(envois[0].data);
    chk(/à fournir avant le démarrage des travaux/.test(tc)&&!/est annexée au marché/.test(tc),'l’exemplaire client dit l’attestation à fournir');
    chk(/Sorti sans décennale valable/.test(o.t())&&/Ne laissez pas commencer les travaux avant de l’avoir reçue/.test(o.t()),'l’écran le rappelle');
    TR.act(()=>{o.btn(/^Enregistrer$/).props.onClick()});
    const m=o.data().marches[0];
    chk(m.exemplaires&&m.exemplaires.sansDecennale===true&&m.contratLien==='https://drive.google.com/file/d/up3/view','enregistré : le lot garde que le marché est sorti sans décennale');
    TR.act(()=>{o.btn(/Modifier le lot/).props.onClick()});
    chk(/sorti sans décennale valable \(attestation à fournir avant le démarrage des travaux\)/.test(o.t()),'à la réouverture : dit');
    TR.act(()=>o.tr.unmount());
  }
  {
    const o=ouvrir(SANS,{...LOT,montantHT:0});
    chk(!o.btn(/Rédiger quand même, sans décennale/),'un autre blocage (montant nul) : pas de sortie forcée');
    TR.act(()=>o.tr.unmount());
  }
  {
    envois.length=0;
    const o=ouvrir({...SANS,decennaleFin:'2099-12-31',assureur:'Assurance Fictive',numPolice:'POL-1'},LOT);
    chk(!o.btn(/Rédiger quand même/)&&!o.btn(/Rédiger le marché \(3 exemplaires\)/).props.disabled,'décennale valable : le bouton habituel, rien à forcer');
    TR.act(()=>o.tr.unmount());
  }
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
