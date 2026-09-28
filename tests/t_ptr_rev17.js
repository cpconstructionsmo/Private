/* Révision 17 : fiche Odace sur les prises de courant, points de centre BLM
   No Air sur les points lumineux ; et, sur chaque ligne d'un programme, le
   choix « + Fiche de la bibliothèque… » pour joindre une fiche déjà connue
   (même sur une ligne retouchée pour le projet). */
const {charger,texteInst,norm,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['ProgrammeTechnique','ptrBiblio','ptrBiblioInitiale','ptrNouveauProgramme','ptrProgrammePour','ptrFichesBibliotheque','ptrAlertesPrestation','EMPTY']);
const {chk,fin}=verif();
const r16=biblioRev('rev16');
const V=(bib,id)=>bib.prestations.flatMap(p=>p.variantes).find(v=>v.id===id);
const b=M.ptrBiblioInitiale();
const pc=V(b,'var_prises_courant_a'), pl=V(b,'var_points_lumineux_a');
chk(/ODACE ou équivalent/.test(pc.texte)&&/S920052/.test(pc.texte)&&/Cuisine :/.test(pc.texte)&&pc.pieces.some(x=>/Odace/.test(x.nom))&&pc.photos[0].fichier==='schneider_odace_prise.jpeg','prises de courant : Odace, liste des prises conservée, fiche et photo jointes');
chk(/MULTIMAT NO AIR EASYFIX/.test(pl.texte)&&/670527/.test(pl.texte)&&/10 spots étanches/.test(pl.texte)&&pl.pieces.some(x=>/670527/.test(x.nom))&&pl.photos[0].fichier==='blm_no_air_easyfix.jpeg','points lumineux : points de centre BLM No Air, fiche et photo jointes');
chk([...pc.pieces,...pl.pieces,...pl.photos].every(x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier)),'fichiers présents');
chk(!['pr_prises_courant','pr_points_lumineux'].some(id=>{const p=b.prestations.find(x=>x.id===id);return M.ptrAlertesPrestation(p,b).some(a=>/faute|accent|colle|dim:|espaces|unite/.test(a.cle))}),'textes sans faute signalée');
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r16))});
chk(m.seedRev===22&&V(m,'var_prises_courant_a').pieces.length===1&&V(m,'var_points_lumineux_a').texte===pl.texte,'bibliothèque de révision 16 : fiches et textes reçus');
/* liste des fiches : celles de la prestation d'abord, sans doublon */
const f=M.ptrFichesBibliotheque(b,'pr_prises_courant',[]);
const cles=f.map(x=>x.fichier);
chk(/Odace/.test(f[0].nom)&&new Set(cles).size===cles.length&&cles.length>=20,'fiches de la bibliothèque : celle de la prestation en tête, sans doublon ('+cles.length+')');
/* programme Moualid ancien : ligne des prises retouchée pour le projet, sans fiche */
let data={...M.EMPTY,prospects:[{id:'p1',nom:'Maison Moualid',client:'Moualid',commune:'Valframbert'}],ptrBiblio:JSON.parse(JSON.stringify(r16))};
const prog=M.ptrNouveauProgramme(r16,{prospectId:'p1'},'modele');
const l=prog.lignes.find(x=>x.prestationId==='pr_prises_courant');l.texte+='\nPrise supplémentaire au garage.';l.modifie=true;
data={...data,programmes:[prog]};
let tr;const cible={prospectId:'p1',chantierId:null};
const monter=()=>React.createElement(M.ProgrammeTechnique,{data,save:d=>{data=d;TR.act(()=>{tr.update(monter())})},cible});
TR.act(()=>{tr=TR.create(monter())});
TR.act(()=>{tr.root.findAll(n=>n.type==='button'&&norm(texteInst(n))==='Tout développer')[0].props.onClick()});
const carte=tr.root.findAll(n=>n.type==='div'&&n.props.id==='ptr-l-'+l.id)[0];
const sel=carte.findAll(n=>n.type==='select'&&/Fiche de la bibliothèque/.test(norm(texteInst(n))))[0];
chk(!!sel,'la ligne propose « + Fiche de la bibliothèque… »');
const odace=M.ptrFichesBibliotheque(M.ptrBiblio(data),'pr_prises_courant',[])[0];
TR.act(()=>{sel.props.onChange({target:{value:odace.id}})});
const lx=M.ptrProgrammePour(data,cible).lignes.find(x=>x.id===l.id);
chk(lx.pieces.length===1&&/Odace/.test(lx.pieces[0].nom)&&/Prise supplémentaire au garage/.test(lx.texte),'la fiche Odace est jointe à la ligne retouchée, texte du projet conservé');
const carte2=tr.root.findAll(n=>n.type==='div'&&n.props.id==='ptr-l-'+l.id)[0];
const sel2=carte2.findAll(n=>n.type==='select'&&/Fiche de la bibliothèque/.test(norm(texteInst(n))))[0];
chk(!sel2||!norm(texteInst(sel2)).includes('Odace prise S920052'),'une fiche déjà jointe n’est plus proposée');
TR.act(()=>{tr.unmount()});
fin();
