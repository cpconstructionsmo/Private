/* Programme technique › ligne : « Photos d'une proposition… » reprend les
   photos d'une proposition de la bibliothèque sans toucher au texte écrit
   pour le projet. Révision 26 : la vitrerie et la box TaHoma reçoivent une
   photo, ajoutée à la suite dans les bibliothèques déjà enregistrées.
   Projet fictif. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
let confirmes=[];
const M=charger(['ProgrammeTechnique','ptrBiblio','ptrBiblioInitiale','ptrNouveauProgramme','ptrProgrammePour','EMPTY'],{confirm:m=>{confirmes.push(m);return true}});
const {chk,fin}=verif();

/* 1. vitrerie et TaHoma : une photo dans le modèle, ajoutée par la migration */
const b=M.ptrBiblioInitiale();
const V=(bib,id)=>bib.prestations.find(p=>p.variantes.some(v=>v.id===id)).variantes.find(v=>v.id===id);
chk(V(b,'var_vitrerie_b').photos.length===1&&V(b,'var_domotique_b').photos[0].fichier==='somfy_tahoma_switch.jpeg','vitrerie et TaHoma ont leur photo');
const r25=biblioRev('rev25');
const vieille=JSON.parse(JSON.stringify(r25));
const dom=V(vieille,'var_domotique_b');dom.photos=[{id:'ph_perso',src:'drive',fichier:'',nom:'photo perso.jpg'}];
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:vieille});
chk(V(m,'var_vitrerie_b').photos.length===1&&V(m,'var_vitrerie_b').photos[0].fichier==='emaplast_double_vitrage_itr.jpeg','révision 25 : la photo de la vitrerie arrive');
chk(V(m,'var_domotique_b').photos.map(x=>x.id).join()==='ph_perso,'+V(b,'var_domotique_b').photos[0].id,'une photo déjà mise par l’utilisateur reste, la nouvelle s’ajoute à la suite');
const m2=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(m))});
chk(V(m2,'var_vitrerie_b').photos.length===1,'une seule fois : rien n’est ajouté deux fois');

/* 2. à l'écran : une ligne au texte écrit pour le projet garde son texte */
const pA={id:'pA',nom:'Local fictif',client:'Fictif',commune:'Ville fictive'};
let prog=M.ptrNouveauProgramme(b,{prospectId:'pA'},'modele');
prog={...prog,lignes:prog.lignes.map(l=>l.prestationId==='pr_chassis_fenetres_francaise'?{...l,texte:'Texte écrit pour le projet.',modifie:true}:l)};
let data={...M.EMPTY,prospects:[pA],programmes:[prog]};
let tr;const cible={prospectId:'pA',chantierId:null};
const monter=()=>React.createElement(M.ProgrammeTechnique,{data,save:d=>{data=d;TR.act(()=>{tr.update(monter())})},cible});
TR.act(()=>{tr=TR.create(monter())});
const tete=tr.root.findAll(n=>n.type==='div'&&n.props.onClick&&n.props.style&&n.props.style.background==='#F4F1EB'&&/MENUISERIES EXTÉRIEURES/.test(norm(texteInst(n))));
TR.act(()=>{tete[0].props.onClick()});
const sel=()=>tr.root.findAll(n=>n.type==='select'&&n.props['aria-label']==='Photos d’une proposition de la bibliothèque');
const carte=()=>tr.root.find(n=>n.props&&n.props.id==='ptr-l-'+prog.lignes.find(l=>l.prestationId==='pr_chassis_fenetres_francaise').id);
const selChassis=()=>carte().findAll(n=>n.type==='select'&&n.props['aria-label']==='Photos d’une proposition de la bibliothèque')[0];
chk(sel().length>0&&!!selChassis(),'chaque ligne propose « Photos d’une proposition… »');
chk(/Proposition C — EMAPLAST — PVC VEKA EMA-SOFT 70 blanc/.test(norm(texteInst(selChassis())))&&!/Proposition A/.test(norm(texteInst(selChassis()))),
  'la liste donne les propositions qui ont d’autres photos que celles de la ligne');
confirmes=[];
TR.act(()=>{selChassis().props.onChange({target:{value:'var_chassis_fenetres_francaise_c'}})});
const l=M.ptrProgrammePour(data,cible).lignes.find(x=>x.prestationId==='pr_chassis_fenetres_francaise');
chk(confirmes.length===1&&/Le texte de la ligne ne change pas/.test(confirmes[0]),'on demande avant de remplacer les photos');
chk(l.texte==='Texte écrit pour le projet.'&&l.photos.length===1&&l.photos[0].fichier==='emaplast_fenetre_pvc_blanche.jpeg','photos de la proposition C, texte du projet intact');
chk(l.varianteId==='var_chassis_fenetres_francaise_a','la ligne reste rattachée à sa proposition');
TR.act(()=>tr.unmount());
fin();
