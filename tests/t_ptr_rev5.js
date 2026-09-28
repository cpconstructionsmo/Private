/* Révision 5 : 230 V, DTU 59.1 et grade 2TV, validés par CP. Une
   bibliothèque de révision 4 non retouchée reçoit ces corrections ; un
   texte réécrit par l'utilisateur reste tel quel. */
const {charger,verif}=require('./harness');
const {execFileSync}=require('child_process');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrMajDisponible','ptrNouveauProgramme','EMPTY']);
const {chk,fin}=verif();
const r4=biblioRev('rev4');
const V=(bib,id)=>bib.prestations.flatMap(p=>p.variantes).find(v=>v.id===id);
const b=M.ptrBiblioInitiale();
const el=V(b,'var_electricite_a'), bj=V(b,'var_bandes_joints_plaque_platre_a');
chk(/monophasée 230 volts/.test(el.texte)&&/grade 2TV\./.test(el.texte)&&!/220|TV1/.test(el.texte),'électricité : 230 volts et câblage grade 2TV');
chk(/DTU 59\.1 « peinture »/.test(bj.texte)&&!/59\.10/.test(bj.texte),'bandes : DTU 59.1');
chk(el.version>=4&&bj.version>=4,'les deux propositions montent de version (v4 ou plus)');
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r4))});
chk(m.seedRev===22&&V(m,'var_electricite_a').texte===el.texte&&V(m,'var_bandes_joints_plaque_platre_a').texte===bj.texte,'bibliothèque de révision 4 non retouchée : corrections reçues');
const perso=JSON.parse(JSON.stringify(r4));const pe=V(perso,'var_electricite_a');pe.texte='Électricité — texte CP.';pe.version=4;pe.modifieLe='x';
chk(V(M.ptrBiblio({...M.EMPTY,ptrBiblio:perso}),'var_electricite_a').texte==='Électricité — texte CP.','texte réécrit par l’utilisateur : inchangé');
const prog=M.ptrNouveauProgramme(r4,{prospectId:'p'},'modele');
const l=prog.lignes.find(x=>x.prestationId==='pr_electricite');
chk(!!M.ptrMajDisponible(l,m),'un programme de révision 4 se voit proposer la mise à jour de l’électricité');
fin();
