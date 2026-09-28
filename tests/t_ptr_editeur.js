/* Scénario métier complet du programme technique, piloté par l'interface :
   création depuis le modèle, choix de propositions, texte modifié pour un seul
   projet, nouvelle proposition enregistrée dans la bibliothèque et retrouvée
   sur un autre projet, validation (figée), nouvelle version, copie. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['ProgrammeTechnique','ptrBiblio','ptrProgrammePour','EMPTY']);
const {chk,fin}=verif();
const txt=tr=>norm(texteInst(tr.root));
const btn=(tr,re)=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));

const pA={id:'pA',nom:'Maison Dupont - Alençon',civilite:'M.',client:'Dupont',adresseClient:'1 rue A — 61000 Alençon',commune:'Alençon',
  postes:[{id:'x',libelle:'Gros œuvre',montant:100000}],margePct:15,tva:20};
const pB={id:'pB',nom:'Maison Martin - Sées',client:'Martin',adresseClient:'2 rue B',commune:'Sées'};
let data={...M.EMPTY,prospects:[pA,pB]};
let tr, cible={prospectId:'pA',chantierId:null};
const monter=()=>React.createElement(M.ProgrammeTechnique,{data,save,cible});
function save(d){data=d;TR.act(()=>{tr.update(monter())})}
TR.act(()=>{tr=TR.create(monter())});

/* 1) création depuis le modèle */
chk(/Créer le programme technique/.test(txt(tr)),'sans programme, l’écran propose de le créer');
TR.act(()=>{btn(tr,/^Créer le programme technique$/).props.onClick()});
let prog=M.ptrProgrammePour(data,cible);
chk(!!prog&&prog.lignes.length===61&&prog.lignes.filter(l=>l.incluse).length===59,'le modèle Maison neuve préremplit 61 prestations, dont les options enduit pierre et baignoire non incluses ('+(prog&&prog.lignes.length)+')');
chk(prog.categories.length===15,'15 catégories reprises du modèle papier');
chk(!data.ptrBiblio,'la bibliothèque initiale n’est pas encore écrite en base (aucune retouche)');
chk(/59 \/ 59 prestations configurées/.test(txt(tr))&&/\(2 non incluses\)/.test(txt(tr)),'l’indicateur annonce 59 / 59 prestations configurées (2 non incluses)');

/* 2) ouvrir la catégorie chauffage et choisir Aldes T.One */
const ouvrirCat=re=>{const tete=tr.root.findAll(n=>n.type==='div'&&n.props.onClick&&n.props.style&&n.props.style.background==='#F4F1EB'&&re.test(norm(texteInst(n))));
  TR.act(()=>{tete[0].props.onClick()})};
ouvrirCat(/PRODUCTION DE CHAUFFAGE/);
const selChauffage=()=>tr.root.findAll(n=>n.type==='select'&&n.props.children&&norm(texteInst(n)).indexOf('Aldes T.One')>=0)[0];
chk(!!selChauffage(),'la liste des propositions chauffage contient Aldes T.One');
chk(/Proposition A — Atlantic Alféa Extensa Duo/.test(norm(texteInst(selChauffage()))),'Proposition A = Atlantic Alféa Extensa Duo');
TR.act(()=>{selChauffage().props.onChange({target:{value:'var_pompe_a_chaleur_b'}})});
prog=M.ptrProgrammePour(data,cible);
let lpac=prog.lignes.find(l=>l.prestationId==='pr_pompe_a_chaleur');
chk(lpac.varianteId==='var_pompe_a_chaleur_b'&&/T\.One AquaAIR/.test(lpac.texte),'la ligne chauffage reprend le texte Aldes T.One');
chk(prog.statut==='en_cours','la première retouche passe le programme « en cours »');

/* 3) implantation → proposition B */
ouvrirCat(/PRÉPARATION DU TERRAIN/);
const selImpl=tr.root.findAll(n=>n.type==='select'&&norm(texteInst(n)).indexOf('Implantation par géomètre')>=0)[0];
TR.act(()=>{selImpl.props.onChange({target:{value:'var_implantation_b'}})});
prog=M.ptrProgrammePour(data,cible);
chk(/géomètre-expert/.test(prog.lignes.find(l=>l.prestationId==='pr_implantation').texte),'implantation : la proposition B (géomètre) est retenue');

/* 4) modifier un texte pour ce projet uniquement */
const zone=tr.root.findAll(n=>n.type==='textarea'&&/géomètre-expert/.test(n.props.value||''))[0];
TR.act(()=>{zone.props.onChange({target:{value:zone.props.value+'\nBornes à reposer par le géomètre.'}})});
TR.act(()=>{tr.root.findAll(n=>n.type==='textarea'&&/Bornes à reposer/.test(n.props.value||''))[0].props.onBlur()});
prog=M.ptrProgrammePour(data,cible);
const limpl=prog.lignes.find(l=>l.prestationId==='pr_implantation');
chk(limpl.modifie&&/Bornes à reposer/.test(limpl.texte),'le texte modifié est enregistré pour ce projet');
const vB=M.ptrBiblio(data).prestations.find(p=>p.id==='pr_implantation').variantes.find(v=>v.id==='var_implantation_b');
chk(!/Bornes à reposer/.test(vB.texte),'la bibliothèque n’est pas modifiée par la retouche du projet');
chk(/modifiée pour ce projet/.test(txt(tr)),'la ligne est signalée « modifiée pour ce projet »');

/* 5) nouvelle proposition enregistrée dans la bibliothèque (PAC Daikin) */
TR.act(()=>{btn(tr,/^\+ Nouvelle proposition$/)&&tr.root.findAll(n=>n.type==='button'&&norm(texteInst(n))==='+ Nouvelle proposition')
  .find(b=>{let x=b.parent;while(x&&!(x.props&&x.props.id&&/^ptr-l-/.test(x.props.id)))x=x.parent;return x&&x.props.id==='ptr-l-'+lpac.id}).props.onClick()});
chk(/Nouvelle proposition — POMPE À CHALEUR/.test(txt(tr)),'la fenêtre « nouvelle proposition » s’ouvre sur la pompe à chaleur');
const champ=ph=>tr.root.findAll(n=>n.type==='input'&&n.props.placeholder===ph)[0];
TR.act(()=>{champ('PAC Daikin Altherma 3').props.onChange({target:{value:'PAC Daikin Altherma 3'}})});
const zoneDesc=tr.root.findAll(n=>n.type==='textarea'&&n.props.rows==='8')[0];
TR.act(()=>{zoneDesc.props.onChange({target:{value:'Pompe à chaleur Daikin Altherma 3 H HT.\n- Chauffage et ECS\n- **COP 4,5**'}})});
TR.act(()=>{btn(tr,/Enregistrer dans la bibliothèque CP Constructions/).props.onClick()});
const bib=M.ptrBiblio(data);
const vD=bib.prestations.find(p=>p.id==='pr_pompe_a_chaleur').variantes.find(v=>v.nom==='PAC Daikin Altherma 3');
chk(!!data.ptrBiblio&&!!vD,'la proposition Daikin est enregistrée dans la bibliothèque');
prog=M.ptrProgrammePour(data,cible);
chk(prog.lignes.find(l=>l.prestationId==='pr_pompe_a_chaleur').varianteId===vD.id,'et appliquée à la ligne chauffage du projet');

/* 6) valider → figé ; nouvelle version */
TR.act(()=>{btn(tr,/Valider et figer la version 1/).props.onClick()});
prog=M.ptrProgrammePour(data,cible);
chk(prog.fige&&prog.statut==='valide'&&prog.versions.length===1,'la version 1 est validée et figée, avec son instantané');
chk(!btn(tr,/\+ Nouvelle proposition/),'une version figée n’offre plus aucune modification');
TR.act(()=>{btn(tr,/Créer la version 2 pour modifier/).props.onClick()});
prog=M.ptrProgrammePour(data,cible);
chk(!prog.fige&&prog.version===2&&prog.statut==='brouillon','la version 2 est créée, modifiable');
chk(prog.versions[0].lignes.find(l=>l.prestationId==='pr_implantation').texte.indexOf('Bornes à reposer')>=0,'l’instantané de la V1 est conservé tel quel');
TR.act(()=>{tr.unmount()});

/* 7) sur un autre projet : la Daikin est proposée, et la copie fonctionne */
cible={prospectId:'pB',chantierId:null};
TR.act(()=>{tr=TR.create(monter())});
TR.act(()=>{btn(tr,/^Créer le programme technique$/).props.onClick()});
let progB=M.ptrProgrammePour(data,cible);
chk(progB&&progB.id!==prog.id,'le projet Martin a son propre programme');
ouvrirCat(/PRODUCTION DE CHAUFFAGE/);
chk(tr.root.findAll(n=>n.type==='select'&&norm(texteInst(n)).indexOf('PAC Daikin Altherma 3')>=0).length>0,
  'la proposition Daikin créée sur Dupont est disponible sur Martin');
TR.act(()=>{tr.unmount()});

/* 8) copie d'un programme précédent pour un troisième projet */
data={...data,prospects:[...data.prospects,{id:'pC',nom:'Maison Leroy',client:'Leroy',commune:'Sées'}]};
cible={prospectId:'pC',chantierId:null};
TR.act(()=>{tr=TR.create(monter())});
TR.act(()=>{tr.root.findAll(n=>n.type==='input'&&n.props.type==='radio')[2].props.onChange()});
TR.act(()=>{tr.root.findAll(n=>n.type==='select')[0].props.onChange({target:{value:prog.id}})});
TR.act(()=>{btn(tr,/^Créer le programme technique$/).props.onClick()});
const progC=M.ptrProgrammePour(data,cible);
chk(progC&&progC.lignes.find(l=>l.prestationId==='pr_implantation').texte.indexOf('Bornes à reposer')>=0,'la copie reprend les textes du projet Dupont');
chk(progC.lignes.every(l=>!prog.lignes.some(o=>o.id===l.id)),'avec des lignes indépendantes (nouveaux identifiants)');
TR.act(()=>{tr.unmount()});
fin();
