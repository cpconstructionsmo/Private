/* Révision 6 : appuis de fenêtre PBM (ABS) ou Celtys (Rexlan nez carré),
   fiches produits jointes ; reprises par une bibliothèque de révision 5
   non retouchée, et par une ligne de programme qui revient au texte de la
   bibliothèque. */
const {charger,texteInst,norm,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['ProgrammeTechnique','ptrBiblio','ptrBiblioInitiale','ptrNouveauProgramme','ptrProgrammePour','EMPTY']);
const {chk,fin}=verif();
const r5=biblioRev('rev5');
const V=(bib,id)=>bib.prestations.flatMap(p=>p.variantes).find(v=>v.id===id);
const b=M.ptrBiblioInitiale();
const s=V(b,'var_seuils_porte_appuis_fenetre_a');
chk(/appui de baie ABS de PBM/.test(s.texte)&&/appui Rexlan nez carré de Celtys/.test(s.texte)&&!/MSEA/.test(s.texte)&&/DTU 20\.1/.test(s.texte),'appuis : PBM ou Celtys (sans MSEA), pose DTU 20.1');
chk(s.pieces.length===2&&s.pieces.every(p=>fs.existsSync(RACINE+'/assets/ptr/'+p.fichier)),'les deux fiches produits sont jointes et présentes');
chk(s.photos.length===1&&s.version===4,'la photo d’origine reste, version 4');
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r5))});
const sm=V(m,'var_seuils_porte_appuis_fenetre_a');
chk(m.seedRev===22&&sm.texte===s.texte&&sm.pieces.length===2&&sm.marque==='PBM / Celtys','bibliothèque de révision 5 : texte, fiches et marque reçus');
/* le programme Moualid : ligne retouchée pour le projet (MSEA retiré à la main) */
let data={...M.EMPTY,prospects:[{id:'p1',nom:'Maison Moualid',client:'Moualid',commune:'Valframbert'}],ptrBiblio:JSON.parse(JSON.stringify(r5))};
const prog=M.ptrNouveauProgramme(r5,{prospectId:'p1'},'modele');
const l=prog.lignes.find(x=>x.prestationId==='pr_seuils_porte_appuis_fenetre');
l.texte=l.texte.replace('PBM, MSEA ou Celtys','PBM ou Celtys');l.modifie=true;
data={...data,programmes:[prog]};
let tr;const cible={prospectId:'p1',chantierId:null};
const monter=()=>React.createElement(M.ProgrammeTechnique,{data,save:d=>{data=d;TR.act(()=>{tr.update(monter())})},cible});
TR.act(()=>{tr=TR.create(monter())});
const bMaj=tr.root.findAll(n=>n.type==='button'&&norm(texteInst(n))==='Mettre à jour')[0];
if(bMaj)TR.act(()=>{bMaj.props.onClick()});
let lx=M.ptrProgrammePour(data,cible).lignes.find(x=>x.id===l.id);
chk(lx.texte===l.texte&&!(lx.pieces||[]).length,'la mise à jour groupée laisse la ligne retouchée pour le projet telle quelle');
TR.act(()=>{btnTout()});function btnTout(){tr.root.findAll(n=>n.type==='button'&&norm(texteInst(n))==='Tout développer')[0].props.onClick()}
const carte=tr.root.findAll(n=>n.type==='div'&&n.props.id==='ptr-l-'+l.id)[0];
TR.act(()=>{carte.findAll(n=>n.type==='button'&&norm(texteInst(n))==='Revenir au texte de la bibliothèque')[0].props.onClick()});
lx=M.ptrProgrammePour(data,cible).lignes.find(x=>x.id===l.id);
chk(lx.texte===s.texte&&lx.pieces.length===2&&!lx.modifie,'« Revenir au texte de la bibliothèque » : texte PBM / Celtys et les deux fiches sur la ligne');
TR.act(()=>{tr.unmount()});
fin();
