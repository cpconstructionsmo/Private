/* Version définitive retouchée : le Word généré, repris dans Word, se
   redépose dans l'application (Word et/ou PDF). Il part sur le Drive,
   renommé d'après le programme, rattaché à la version en cours ; les
   textes du programme ne changent pas. Le dépôt reste possible sur une
   version figée ; le Word régénéré prévient qu'il ne reprend pas les
   retouches. Données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['ProgrammeTechnique','ptrNouveauProgramme','ptrBiblio','ptrProjet','ptrNomDefinitif','ptrAjouterDefinitifs',
  'ptrDefinitifsVersion','ptrTypeDefinitif','ptrProgrammePour','EMPTY']);
const {chk,fin}=verif();
const cible={prospectId:null,chantierId:'c1'};
let data={...M.EMPTY,chantiers:[{id:'c1',nom:'Maison Fictive - Sainte-Cécile',client:'Fictif',adresse:'Sainte-Cécile'}],programmes:[]};
const p0={...M.ptrNouveauProgramme(M.ptrBiblio(data),cible,'modele'),id:'pg1'};
data={...data,programmes:[p0]};

/* les règles */
const pj=M.ptrProjet(data,p0);
chk(M.ptrNomDefinitif(pj,p0,'docx')==='Programme_Technique_Fictive_Sainte_Cecile_V1_definitif.docx'
  &&M.ptrNomDefinitif(pj,p0,'pdf')==='Programme_Technique_Fictive_Sainte_Cecile_V1_definitif.pdf','nom du document définitif, d’après le programme et sa version');
chk(M.ptrTypeDefinitif('a.DOCX')==='docx'&&M.ptrTypeDefinitif('b.pdf')==='pdf'&&M.ptrTypeDefinitif('c.doc')==='docx'&&!M.ptrTypeDefinitif('d.txt'),'Word ou PDF seulement');
const a=M.ptrAjouterDefinitifs(p0,[{nom:'x.docx',lien:'L',type:'docx',nomOrigine:'mon.docx'}],'2026-11-11T10:00:00.000Z');
chk(a.definitifs.length===1&&a.definitifs[0].version===1&&a.definitifs[0].date==='2026-11-11T10:00:00.000Z'&&a.exports.slice(-1)[0].type==='definitif',
  'rattaché à la version en cours, noté dans les exports');
chk(a.lignes===p0.lignes,'les lignes du programme ne sont pas touchées');

/* l'écran */
let tr;
const monter=()=>React.createElement(M.ProgrammeTechnique,{data,save,cible});
function save(d){data=d;TR.act(()=>{tr.update(monter())})}
const txt=()=>norm(texteInst(tr.root));
const champ=()=>tr.root.findAll(n=>n.type==='input'&&n.props.type==='file'&&n.props.accept==='.docx,.doc,.pdf')[0];
const attendre=async re=>{for(let i=0;i<200&&!re.test(txt());i++)await TR.act(()=>new Promise(r=>setTimeout(r,20)))};
const prog=()=>M.ptrProgrammePour(data,cible);

(async()=>{
  TR.act(()=>{tr=TR.create(monter())});
  chk(/Version définitive retouchée/.test(txt())&&!!champ(),'zone « Version définitive retouchée », Word ou PDF');
  const lignesAvant=JSON.stringify(prog().lignes);
  await TR.act(async()=>{champ().props.onChange({target:{files:[new File(['w'],'Programme_Technique_Fictive_V1.docx'),new File(['p'],'Programme_Technique_Fictive_V1.pdf')],value:''}})});
  await attendre(/2 documents déposés/);
  const D=prog().definitifs||[];
  chk(D.length===2&&D.every(d=>d.version===1&&/^https:\/\/drive\.google\.com\//.test(d.lien))
    &&D.map(d=>d.nom).join()==='Programme_Technique_Fictive_Sainte_Cecile_V1_definitif.docx,Programme_Technique_Fictive_Sainte_Cecile_V1_definitif.pdf',
    'Word et PDF déposés sur le Drive, renommés, rattachés à la version 1');
  chk(D[0].nomOrigine==='Programme_Technique_Fictive_V1.docx','le nom du fichier déposé est gardé');
  chk(JSON.stringify(prog().lignes)===lignesAvant,'les textes du programme ne changent pas');
  chk(/2 documents déposés sur le Drive, rattachés à la version 1/.test(txt())&&/V1 · Word/.test(txt())&&/V1 · PDF/.test(txt()),'l’écran les liste, avec leur version');
  chk(/Valider et figer la version 1» — il y reste attaché|« Valider et figer la version 1 » — il y reste attaché/.test(txt()),'il propose ensuite de valider et figer la version');
  const appels=global.__driveAppels.length;
  await TR.act(async()=>{champ().props.onChange({target:{files:[new File(['t'],'notes.txt')],value:''}})});
  chk(/en Word \(\.docx\) ou en PDF/.test(txt())&&prog().definitifs.length===2&&global.__driveAppels.length===appels,'un autre fichier est refusé, sans rien envoyer');

  /* le Word régénéré prévient qu'il ne reprend pas les retouches */
  const bouton=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
  await TR.act(async()=>{bouton(/^Générer le programme \(Word\)$/).props.onClick()});
  if(bouton(/Exporter malgré tout/))await TR.act(async()=>{bouton(/Exporter malgré tout/).props.onClick()});
  await attendre(/Document Word (prêt|téléchargé)/);
  chk(/ne reprend pas les retouches de la version définitive déposée/.test(txt()),'le Word régénéré prévient qu’il ne reprend pas les retouches');

  /* retirer : le fichier reste sur le Drive */
  const croix=tr.root.findAll(n=>n.type==='button'&&/^Retirer .*definitif\.pdf$/.test(n.props['aria-label']||''))[0];
  TR.act(()=>{croix.props.onClick()});
  chk(prog().definitifs.length===1&&prog().definitifs[0].type==='docx','« ✕ » retire le PDF du programme (il reste sur le Drive)');
  TR.act(()=>{tr.unmount()});

  /* une version figée : le dépôt reste possible, et l'historique le montre */
  data={...data,programmes:[{...prog(),fige:true,statut:'valide',versions:[{numero:1,date:'2026-11-11',statut:'valide',
    categories:prog().categories,lignes:prog().lignes}]}]};
  TR.act(()=>{tr=TR.create(monter())});
  chk(!!champ()&&!/il y reste attaché/.test(txt()),'version figée : le dépôt reste possible (le document final revient souvent après)');
  TR.act(()=>{bouton(/^Versions/).props.onClick()});
  chk(/Version 1 — .*Validé.*définitif Word/i.test(txt()),'l’historique des versions donne le document définitif de la version 1');
  TR.act(()=>{tr.unmount()});
  fin();
})().catch(e=>{console.error(e);process.exit(1)});
