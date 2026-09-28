/* Photos : jamais déformées (rapport largeur/hauteur conservé en mode
   « ajusté »), recadrées proprement en mode « rempli », mises en page 1 / 2 /
   3 / 4 ; exports Word, Excel et ZIP (avec annexes) produits et lisibles. */
const {charger,texteInst,norm,verif}=require('./harness');
const fs=require('fs');const React=require('react');const TR=require('react-test-renderer');
const lire=f=>new Uint8Array(fs.readFileSync(require('path').join(__dirname,'fixtures',f)));
const drive={pano:lire('pano.jpg'),haute:lire('haute.jpg'),paysage:lire('paysage.jpg'),portrait:lire('portrait.jpg'),
  tone:new TextEncoder().encode('%PDF-1.4 fiche technique T.One')};
const M=charger(['ProgrammeTechnique','ptrBiblio','ptrNouveauProgramme','ptrProjet','genererProgrammeDocx','genererProgrammeXlsx',
  'formatDocumentImage','zipEntree','ptrProgrammePour','EMPTY'],{drive});
const {chk,fin}=verif();
const ph=(id,w,h,mode)=>({id:'ph_'+id,src:'drive',fileId:id,lien:'https://drive.google.com/file/d/'+id+'/view',nom:id+'.jpg',w,h,ext:'jpeg',mode:mode||'contain',fx:.5,fy:.5});

/* 1) la fonction de placement seule */
const box={w:1600000,h:1200000};
const c1=M.formatDocumentImage({w:1600,h:400},box);
chk(Math.abs(c1.cx/c1.cy-4)<0.01&&c1.cx<=box.w&&c1.cy<=box.h,'panorama ajusté : ratio 4:1 conservé, dans la zone');
const c2=M.formatDocumentImage({w:400,h:1600},box);
chk(Math.abs(c2.cy/c2.cx-4)<0.01&&c2.cy===box.h,'photo très haute ajustée : ratio 1:4 conservé, hauteur de la zone');
const c3=M.formatDocumentImage({w:1600,h:400,mode:'cover'},box);
chk(c3.cx===box.w&&c3.cy===box.h&&c3.srcRect&&c3.srcRect.l===c3.srcRect.r&&c3.srcRect.t===0,'panorama rempli : zone pleine, rognage symétrique à gauche et à droite');
const c4=M.formatDocumentImage({w:1600,h:400,mode:'cover',fx:0},box);
chk(c4.srcRect.l===0&&c4.srcRect.r>0,'point d’intérêt à gauche : on garde le bord gauche');

/* 2) un programme réel avec des photos du Drive, en 1 / 2 / 3 / 4 */
const p={id:'p1',nom:'Maison Moualid - Valframbert',civilite:'M.',client:'Moualid',adresseClient:'12 rue des Lilas',commune:'Valframbert',
  postes:[{id:'x',libelle:'Gros œuvre',montant:120000}],margePct:15,tva:20};
let data={...M.EMPTY,prospects:[p]};
const b=M.ptrBiblio(data);
const prog=M.ptrNouveauProgramme(b,{prospectId:'p1'},'modele');
const L=id=>prog.lignes.find(l=>l.prestationId===id);
L('pr_preparation_terrain').photos=[ph('pano',1600,400)];
L('pr_implantation').photos=[ph('portrait',800,1200),ph('paysage',1200,800)];
L('pr_terres_excedentaires').photos=[ph('haute',400,1600),ph('pano',1600,400),ph('paysage',1200,800)];
L('pr_fondations').photos=[ph('paysage',1200,800),ph('portrait',800,1200),ph('pano',1600,400,'cover'),ph('haute',400,1600)];
L('pr_pompe_a_chaleur').pieces=[{id:'pj1',nom:'Aldes_T-One.pdf',lien:'https://drive.google.com/file/d/tone/view',fileId:'tone'}];
data={...data,programmes:[prog]};
const projet=M.ptrProjet(data,prog);

(async()=>{
  const {octets,manquantes}=await M.genererProgrammeDocx(prog,projet,b);
  fs.writeFileSync(SORTIE+'/photos.docx',octets);
  chk(!manquantes.length,'toutes les photos du Drive ont été chargées');
  const xml=new TextDecoder().decode(await M.zipEntree(octets.buffer.slice(octets.byteOffset,octets.byteOffset+octets.byteLength),'word/document.xml'));
  const rels=new TextDecoder().decode(await M.zipEntree(octets.buffer.slice(octets.byteOffset,octets.byteOffset+octets.byteLength),'word/_rels/document.xml.rels'));
  /* chaque image ajustée garde le rapport de son fichier */
  const ext=[...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>[\s\S]*?name="([^"]+)"[\s\S]*?<\/pic:blipFill>/g)];
  const ratios={'pano.jpg':4,'haute.jpg':.25,'paysage.jpg':1.5,'portrait.jpg':2/3};
  let ok=0,faux=[];
  ext.forEach(m=>{const r=ratios[m[3]];if(!r)return;
    const rogne=/srcRect/.test(m[0]);const obs=+m[1]/+m[2];
    if(rogne)return;
    if(Math.abs(obs-r)/r<0.01)ok++;else faux.push(m[3]+' '+obs.toFixed(3)+' au lieu de '+r)});
  chk(ok>=9&&!faux.length,'toutes les photos ajustées gardent leur proportion exacte ('+ok+' vérifiées)'+(faux.length?' — '+faux.join('; '):''));
  chk(/<a:srcRect l="\d+" t="0" r="\d+" b="0"\/>/.test(xml),'la photo en mode « rempli » est recadrée par rognage, pas étirée');
  chk((rels.match(/relationships\/image/g)||[]).length>=4,'les photos du Drive sont embarquées dans le .docx');
  chk(/rId50/.test(rels)&&/footer1\.xml/.test(rels),'en-tête et pied de page (numéros de page) sont déclarés');
  chk(/Documentation jointe : Aldes_T-One\.pdf/.test(xml.replace(/<[^>]+>/g,'')),'la documentation jointe est mentionnée dans le programme');

  /* 3) Excel */
  const xl=M.genererProgrammeXlsx(prog,projet);
  fs.writeFileSync(SORTIE+'/synthese.xlsx',xl);
  chk(xl.length>2000,'la synthèse Excel est produite');

  /* 4) ZIP via l'interface, avec annexes */
  const blobs=[];global.URL.createObjectURL=b=>{blobs.push(b);return 'blob:x'};
  let tr;const cible={prospectId:'p1',chantierId:null};
  const monter=()=>React.createElement(M.ProgrammeTechnique,{data,save:d=>{data=d;TR.act(()=>{tr.update(monter())})},cible});
  TR.act(()=>{tr=TR.create(monter())});
  const bz=tr.root.findAll(n=>n.type==='button'&&norm(texteInst(n))==='Dossier ZIP')[0];
  await TR.act(async()=>{bz.props.onClick();for(let i=0;i<40;i++)await new Promise(r=>setTimeout(r,5))});
  const t=norm(texteInst(tr.root));
  chk(/Dossier ZIP téléchargé — Programme_Technique_Moualid_Valframbert_V1\.zip/.test(t),'le dossier ZIP est produit, au bon nom');
  const zipBlob=blobs.find(x=>x.type==='application/zip');
  if(zipBlob){
    const buf=new Uint8Array(await zipBlob.arrayBuffer());
    fs.writeFileSync(SORTIE+'/dossier.zip',buf);
    const noms=new TextDecoder('latin1').decode(buf);
    chk(noms.indexOf('Programme_Technique_Moualid_Valframbert_V1/Programme_Technique_Moualid_Valframbert_V1.docx')>=0,'le ZIP contient le .docx');
    chk(noms.indexOf('Programme_Technique_Moualid_Valframbert_V1/Annexes/Aldes_T_One.pdf')>=0,'et la fiche technique en annexe');
  }else chk(false,'le ZIP a bien été proposé au téléchargement');
  const prog2=M.ptrProgrammePour(data,cible);
  chk((prog2.exports||[]).some(x=>x.type==='zip'),'l’export est noté dans l’historique du programme');
  TR.act(()=>{tr.unmount()});
  fin();
})();
