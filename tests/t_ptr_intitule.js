/* Intitulé du programme sur les documents : un ERP n'est pas une maison.
   Le dossier « Maison Philippe - … » garde son nom dans le CRM ; le
   programme d'un ERP parle de « Bâtiment Philippe - … », sauf intitulé
   saisi. Et le Word respecte l'ordre du schéma (marges des cellules), que
   Word exige quand LibreOffice et Google Drive le tolèrent. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['ProgrammeTechnique','ptrBiblio','ptrNouveauProgramme','ptrProjet','ptrNomFichier','ptrIntituleDefaut','ptrImporterProgramme',
  'ptrProgrammePour','genererProgrammeDocx','zipEntree','EMPTY']);
const {chk,fin}=verif();
const ch={id:'c1',nom:'Maison Fictive - Sainte-Cécile',client:'Fictif',adresse:'Sainte-Cécile'};
let data={...M.EMPTY,chantiers:[ch],programmes:[]};
const b=M.ptrBiblio(data);
const cible={prospectId:null,chantierId:'c1'};
const maison=M.ptrNouveauProgramme(b,cible,'modele');
const erp={...maison,typeOuvrage:'erp5'};

chk(M.ptrProjet(data,maison).nom==='Maison Fictive - Sainte-Cécile','une maison garde le nom du dossier');
const pe=M.ptrProjet(data,erp);
chk(pe.nom==='Bâtiment Fictive - Sainte-Cécile'&&pe.nomDossier==='Maison Fictive - Sainte-Cécile','ERP : « Bâtiment … » sur le programme, le dossier garde son nom');
chk(M.ptrIntituleDefaut('Villa Les Pins',erp)==='Bâtiment Les Pins'&&M.ptrIntituleDefaut('Bureaux Fictifs',erp)==='Bureaux Fictifs'
  &&M.ptrIntituleDefaut('Maisonnette',erp)==='Maisonnette','seul le mot « Maison » (ou « Villa ») en tête est remplacé');
chk(M.ptrProjet(data,{...erp,intitule:'Bureaux Fictifs - Sainte-Cécile'}).nom==='Bureaux Fictifs - Sainte-Cécile','un intitulé saisi l’emporte');
chk(M.ptrProjet(data,{...erp,intitule:'   '}).nom==='Bâtiment Fictive - Sainte-Cécile','un intitulé vide revient au nom par défaut');
chk(M.ptrNomFichier(pe,erp,'Programme_Technique','docx')===M.ptrNomFichier(M.ptrProjet(data,maison),maison,'Programme_Technique','docx'),
  'le nom du fichier ne change pas ('+M.ptrNomFichier(pe,erp,'Programme_Technique','docx')+')');
const imp=M.ptrImporterProgramme(null,{...erp,intitule:'Bureaux Fictifs'},b,cible,'f.json','2026-11-10T08:00:00.000Z');
chk(imp.intitule==='Bureaux Fictifs','l’import garde l’intitulé du fichier');

/* l'écran : le champ propose l'intitulé par défaut et enregistre la saisie */
data={...data,programmes:[{...erp,id:'pg1'}]};
let tr;
const monter=()=>React.createElement(M.ProgrammeTechnique,{data,save,cible});
function save(d){data=d;TR.act(()=>{tr.update(monter())})}
TR.act(()=>{tr=TR.create(monter())});
chk(/Bâtiment Fictive - Sainte-Cécile/.test(norm(texteInst(tr.root))),'l’en-tête du programme affiche « Bâtiment Fictive … »');
const champ=()=>tr.root.findAll(n=>n.type==='input'&&n.props.placeholder==='Bâtiment Fictive - Sainte-Cécile')[0];
chk(!!champ(),'champ « Intitulé sur les documents », avec l’intitulé par défaut en indication');
TR.act(()=>{champ().props.onChange({target:{value:'Bureaux Fictifs - Sainte-Cécile'}})});
TR.act(()=>{champ().props.onBlur()});
chk(M.ptrProgrammePour(data,cible).intitule==='Bureaux Fictifs - Sainte-Cécile','l’intitulé saisi est enregistré sur le programme');
chk(data.chantiers[0].nom==='Maison Fictive - Sainte-Cécile','le dossier n’est pas renommé');
TR.act(()=>{tr.unmount()});

(async()=>{
  const {octets}=await M.genererProgrammeDocx(erp,pe,b);
  const lire=async f=>new TextDecoder().decode(await M.zipEntree(octets.buffer.slice(octets.byteOffset,octets.byteOffset+octets.byteLength),f));
  const xml=await lire('word/document.xml'), entete=await lire('word/header1.xml');
  chk(/Bâtiment Fictive - Sainte-Cécile/.test(xml)&&!/Maison Fictive/.test(xml),'page de garde : « Bâtiment Fictive … », plus « Maison »');
  chk(/Bâtiment Fictive - Sainte-Cécile/.test(entete)&&!/Maison Fictive/.test(entete),'en-tête des pages : « Bâtiment Fictive … »');
  /* CT_TcMar : haut, gauche, bas, droite */
  const mars=xml.match(/<w:tcMar>.*?<\/w:tcMar>/g)||[];
  const ordre=m=>(m.match(/<w:(top|left|bottom|right)\b/g)||[]).map(x=>x.slice(3)).join(',');
  chk(mars.length>0&&mars.every(m=>ordre(m)==='top,left,bottom,right'),'marges des cellules dans l’ordre du schéma ('+mars.length+' cellules)');
  const bords=xml.match(/<w:tcBorders>.*?<\/w:tcBorders>/g)||[];
  chk(bords.every(m=>(m.match(/<w:(top|left|bottom|right)\b/g)||[]).map(x=>x.slice(3)).join(',')==='top,left,bottom,right'),'bordures des cellules dans l’ordre du schéma');
  fin();
})().catch(e=>{console.error(e);process.exit(1)});
