/* La bibliothèque centrale : retoucher une proposition crée une nouvelle
   version sans réécrire les programmes existants ; une proposition utilisée
   s'archive au lieu de se supprimer ; un ancien programme se rouvre intact. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
let alertes=[];
const M=charger(['Donnees','ProgrammeTechnique','ptrBiblio','ptrNouveauProgramme','ptrProgrammePour','EMPTY'],{alert:m=>alertes.push(m)});
const {chk,fin}=verif();
const txt=tr=>norm(texteInst(tr.root));
const btn=(tr,re)=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));

const pA={id:'pA',nom:'Maison Dupont',client:'Dupont',adresseClient:'1 rue A',commune:'Alençon'};
let data={...M.EMPTY,prospects:[pA]};
const b0=M.ptrBiblio(data);
const prog=M.ptrNouveauProgramme(b0,{prospectId:'pA'},'modele');
data={...data,programmes:[prog]};
const texteAvant=prog.lignes.find(l=>l.prestationId==='pr_implantation').texte;

let tr;
const monter=()=>React.createElement(M.Donnees,{data,save,session:null});
function save(d){data=d;TR.act(()=>{tr.update(monter())})}
TR.act(()=>{tr=TR.create(monter())});
TR.act(()=>{btn(tr,/Ouvrir la bibliothèque/).props.onClick()});
chk(/BIBLIOTHÈQUE DES PRESTATIONS/.test(txt(tr)),'la bibliothèque s’ouvre depuis DONNÉES');
chk(/15 catégories · 61 prestations/.test(txt(tr)),'elle contient les 15 catégories et 61 prestations du modèle');
chk(/vérifications? recommandées?/.test(txt(tr)),'les vérifications recommandées issues de l’import sont annoncées');

/* recherche : « implantation » */
const recherche=tr.root.findAll(n=>n.type==='input'&&/Rechercher une prestation/.test(n.props.placeholder||''))[0];
TR.act(()=>{recherche.props.onChange({target:{value:'implantation'}})});
chk(/Implantation par géomètre/.test(txt(tr)),'la recherche fait apparaître la prestation et ses propositions');

/* modifier la proposition A de l'implantation */
const modifier=tr.root.findAll(n=>n.type==='button'&&norm(texteInst(n))==='Modifier')[0];
TR.act(()=>{modifier.props.onClick()});
const zone=tr.root.findAll(n=>n.type==='textarea'&&n.props.rows==='8')[0];
TR.act(()=>{zone.props.onChange({target:{value:zone.props.value+'\nMise à jour 2027.'}})});
TR.act(()=>{btn(tr,/^Enregistrer$/).props.onClick()});
const vA=M.ptrBiblio(data).prestations.find(p=>p.id==='pr_implantation').variantes.find(v=>v.id==='var_implantation_a');
chk(vA.version===4&&/Mise à jour 2027/.test(vA.texte),'la proposition A passe en version 4 dans la bibliothèque (3 = modèle révisé)');
chk(data.programmes[0].lignes.find(l=>l.prestationId==='pr_implantation').texte===texteAvant,
  'le programme existant garde son texte d’origine (aucune réécriture rétroactive)');

/* supprimer une proposition utilisée : refusé, archivage proposé */
alertes=[];
TR.act(()=>{tr.root.findAll(n=>n.type==='button'&&norm(texteInst(n))==='Supprimer')[0].props.onClick()});
chk(alertes.length===1&&/archivez-la plutôt/.test(alertes[0]),'une proposition utilisée ne peut pas être supprimée');
TR.act(()=>{tr.root.findAll(n=>n.type==='button'&&norm(texteInst(n))==='Archiver')[0].props.onClick()});
let pr=M.ptrBiblio(data).prestations.find(p=>p.id==='pr_implantation');
chk(pr.variantes.find(v=>v.id==='var_implantation_a').archivee,'elle peut en revanche être archivée');
chk(pr.variantes.find(v=>v.id==='var_implantation_b').parDefaut,'la proposition B devient alors la proposition par défaut');
/* la B, jamais utilisée, se supprime */
TR.act(()=>{tr.root.findAll(n=>n.type==='button'&&norm(texteInst(n))==='Supprimer')[1].props.onClick()});
pr=M.ptrBiblio(data).prestations.find(p=>p.id==='pr_implantation');
chk(!pr.variantes.some(v=>v.id==='var_implantation_b'),'une proposition jamais utilisée se supprime');
TR.act(()=>{tr.unmount()});

/* le programme rouvert : ligne intacte, et une nouvelle version signalée */
let tr2;const cible={prospectId:'pA',chantierId:null};
const monter2=()=>React.createElement(M.ProgrammeTechnique,{data,save:d=>{data=d;TR.act(()=>{tr2.update(monter2())})},cible});
TR.act(()=>{tr2=TR.create(monter2())});
const tete=tr2.root.findAll(n=>n.type==='div'&&n.props.onClick&&n.props.style&&n.props.style.background==='#F4F1EB'&&/PRÉPARATION DU TERRAIN/.test(norm(texteInst(n))))[0];
TR.act(()=>{tete.props.onClick()});
chk(/version plus récente de « Standard \(modèle CP\) » existe/.test(txt(tr2)),'le programme signale qu’une version plus récente existe dans la bibliothèque');
chk(tr2.root.findAll(n=>n.type==='textarea'&&n.props.value===texteAvant).length===1,'le texte d’origine reste affiché tant qu’on ne choisit pas de mettre à jour');
const idImpl=data.programmes[0].lignes.find(l=>l.prestationId==='pr_implantation').id;
const carte=tr2.root.findAll(n=>n.type==='div'&&n.props.id==='ptr-l-'+idImpl)[0];
const selImpl=carte.findAll(n=>n.type==='select')[0];
chk(!!selImpl&&/propre à ce projet/.test(norm(texteInst(selImpl))),'la proposition archivée reste lisible sur le projet, sans être reproposée');
TR.act(()=>{tr2.unmount()});
fin();
