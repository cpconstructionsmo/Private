/* Programme technique › « Importer un programme préparé » : un programme
   complet, préparé hors de l'application (fichier .json), se charge d'un
   clic. Sans programme, il le crée, rattaché au dossier ouvert ; avec un
   programme, il en remplace le contenu après confirmation et la version en
   cours passe dans l'historique. Un fichier incomplet ne touche à rien ;
   un programme validé (figé) ne se remplace pas. Données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
let confirmes=[];let reponse=true;
const M=charger(['ProgrammeTechnique','ptrBiblioInitiale','ptrNouveauProgramme','ptrProgrammePour','ptrLireImport','ptrImporterProgramme','EMPTY'],
  {confirm:m=>{confirmes.push(m);return reponse}});
const {chk,fin}=verif();
const b=M.ptrBiblioInitiale();

/* le programme préparé : le modèle, un texte de projet, en ERP */
const prepare=M.ptrNouveauProgramme(b,{prospectId:'autre'},'modele');
prepare.typeOuvrage='erp5';
const lc=prepare.lignes.find(l=>l.prestationId==='pr_couverture');
lc.texte='Texte de couverture préparé pour le projet fictif.';lc.modifie=true;
const fichier=JSON.stringify({format:'cp-ptr',version:1,nom:'Projet fictif',programme:prepare});

/* 1. la lecture */
chk(M.ptrLireImport(fichier).programme.lignes.length===prepare.lignes.length,'un fichier cp-ptr se lit');
chk(M.ptrLireImport(JSON.stringify(prepare)).programme,'un programme seul se lit aussi');
chk(/JSON illisible/.test(M.ptrLireImport('pas du json').erreur),'texte illisible : refusé');
chk(/ni catégories ni lignes/.test(M.ptrLireImport('{"a":1}').erreur),'sans lignes : refusé');
const casse=JSON.parse(JSON.stringify(prepare));casse.lignes[0].categorieId='inconnue';
chk(/ligne incomplète/.test(M.ptrLireImport(JSON.stringify(casse)).erreur),'ligne sans catégorie connue : refusée, nommée');
const double=JSON.parse(JSON.stringify(prepare));double.lignes[1].id=double.lignes[0].id;
chk(/même identifiant/.test(M.ptrLireImport(JSON.stringify(double)).erreur),'identifiants en double : refusés');

/* 2. à l'écran, sur un chantier sans programme : il le crée */
(async()=>{
  const ch={id:'c1',nom:'Local fictif',client:'M. Fictif',adresse:'Ville fictive'};
  let data={...M.EMPTY,chantiers:[ch],programmes:[]};
  let tr;const cible={chantierId:'c1',prospectId:null};
  const monter=()=>React.createElement(M.ProgrammeTechnique,{data,save:d=>{data=d;TR.act(()=>{tr.update(monter())})},cible});
  TR.act(()=>{tr=TR.create(monter())});
  const t=()=>norm(texteInst(tr.root));
  const champ=()=>tr.root.findAll(n=>n.type==='input'&&n.props.type==='file'&&/json/.test(n.props.accept||''))[0];
  const deposer=async(txt,nom)=>{await TR.act(async()=>{await champ().props.onChange({target:{files:[{name:nom,text:async()=>txt}],value:''}})})};
  chk(/Importer un programme préparé/.test(t())&&!!champ(),'l’écran de création propose l’import');
  await deposer('{"a":1}','vide.json');
  chk(!(data.programmes||[]).length&&/Import impossible : ce fichier ne contient ni catégories ni lignes/.test(t()),'fichier vide : dit, rien n’est créé');
  await deposer(fichier,'programme fictif.json');
  let pg=M.ptrProgrammePour(data,cible);
  chk(pg&&pg.chantierId==='c1'&&pg.prospectId===null&&pg.id!==prepare.id,'programme créé, rattaché au chantier ouvert (pas à celui du fichier)');
  chk(pg.typeOuvrage==='erp5'&&pg.lignes.find(l=>l.prestationId==='pr_couverture').texte==='Texte de couverture préparé pour le projet fictif.'
    &&pg.source.type==='import'&&pg.source.fichier==='programme fictif.json','contenu, type d’ouvrage et origine repris');
  chk(/✓ Programme « programme fictif\.json » chargé/.test(t()),'confirmé à l’écran');

  /* 3. un second import remplace le contenu, la version 1 est gardée */
  const autre=JSON.parse(JSON.stringify(prepare));autre.lignes.find(l=>l.prestationId==='pr_couverture').texte='Seconde préparation.';
  confirmes=[];reponse=false;
  await deposer(JSON.stringify(autre),'v2.json');
  chk(confirmes.length===1&&/La version 1 actuelle est gardée/.test(confirmes[0])&&M.ptrProgrammePour(data,cible).version===1,'on demande avant ; refusé, rien ne change');
  reponse=true;
  await deposer(JSON.stringify(autre),'v2.json');
  pg=M.ptrProgrammePour(data,cible);
  chk(pg.version===2&&pg.statut==='brouillon'&&pg.lignes.find(l=>l.prestationId==='pr_couverture').texte==='Seconde préparation.','accepté : contenu remplacé, version 2');
  chk(pg.versions.length===1&&pg.versions[0].numero===1&&pg.versions[0].lignes.find(l=>l.prestationId==='pr_couverture').texte==='Texte de couverture préparé pour le projet fictif.',
    'la version 1 est gardée dans l’historique');
  TR.act(()=>tr.unmount());

  /* 4. un programme validé ne se remplace pas */
  data={...data,programmes:data.programmes.map(x=>({...x,fige:true,statut:'valide'}))};
  TR.act(()=>{tr=TR.create(monter())});
  chk(!tr.root.findAll(n=>n.type==='input'&&n.props.type==='file'&&/json/.test(n.props.accept||'')).length,'programme validé : pas d’import proposé');
  const pf=M.ptrProgrammePour(data,cible);
  chk(M.ptrImporterProgramme(pf,autre,b,cible,'x.json','t').versions.length>=1,'(la fonction garde toujours la version en cours)');
  TR.act(()=>tr.unmount());
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
