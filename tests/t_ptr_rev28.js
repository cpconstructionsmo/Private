/* Révision 28 : nouvelles propositions standard — volets roulants à coffre
   monobloc PVC blanc (C, avec photos d'un coffre monobloc), vitrerie
   EMAPLAST à isolation renforcée (B), box SOMFY TaHoma Switch (B). Une
   bibliothèque enregistrée ne change de défaut que si le sien est resté
   celui du modèle : un défaut choisi par l'utilisateur est gardé. */
const {charger,verif}=require('./harness');
const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrNouveauProgramme','EMPTY']);
const {chk,fin}=verif();
const r27=biblioRev('rev27');
const b=M.ptrBiblioInitiale();
const DEF={volets_roulants:'var_volets_roulants_c',vitrerie:'var_vitrerie_b',domotique:'var_domotique_b'};
const pr=(bib,id)=>bib.prestations.find(p=>p.id==='pr_'+id);
const defaut=(bib,id)=>pr(bib,id).variantes.filter(v=>v.parDefaut).map(v=>v.id);
chk(Object.keys(DEF).every(id=>defaut(b,id).join()===DEF[id]),'nouvelle bibliothèque : volets C, vitrerie B, TaHoma B par défaut, une seule chacune');
chk(defaut(b,'chassis_fenetres_francaise').join()==='var_chassis_fenetres_francaise_a'&&defaut(b,'porte_entree').join()==='var_porte_entree_a','les autres lignes gardent la A');
const vc=pr(b,'volets_roulants').variantes.find(v=>v.id==='var_volets_roulants_c');
chk(vc.photos.map(p=>p.fichier).join()==='emaplast_volet_monobloc_blanc.jpeg,coffre_monobloc_fenetre.jpeg,coffre_monobloc_coupe.jpeg'
  &&vc.photos.every(p=>fs.existsSync(RACINE+'/assets/ptr/'+p.fichier)),'volets C : photo du volet, puis le coffre monobloc posé et en coupe');
/* un nouveau programme prend ces propositions */
const prog=M.ptrNouveauProgramme(b,{prospectId:'p'},'modele');
const l=id=>prog.lignes.find(x=>x.prestationId==='pr_'+id);
chk(l('volets_roulants').varianteId==='var_volets_roulants_c'&&/monobloc/.test(l('volets_roulants').texte)&&l('volets_roulants').photos.length===3
  &&l('vitrerie').varianteId==='var_vitrerie_b'&&l('domotique').varianteId==='var_domotique_b'&&/TAHOMA SWITCH/.test(l('domotique').texte),
  'nouveau programme : volets monobloc, vitrerie renforcée, TaHoma');
/* migration : le défaut resté celui du modèle change ; celui choisi par l'utilisateur reste */
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r27))});
chk(m.seedRev===29&&Object.keys(DEF).every(id=>defaut(m,id).join()===DEF[id]),'révision 27 : les trois nouveaux défauts arrivent');
const vm=pr(m,'volets_roulants').variantes.find(v=>v.id==='var_volets_roulants_c');
chk(vm.photos.length===3&&vm.photos[2].fichier==='coffre_monobloc_coupe.jpeg','révision 27 : les photos du coffre monobloc s’ajoutent à la suite');
const perso=JSON.parse(JSON.stringify(r27));
pr(perso,'vitrerie').variantes.forEach(v=>{v.parDefaut=v.id==='var_vitrerie_c'||(v.id==='var_vitrerie_a'&&!pr(perso,'vitrerie').variantes.some(x=>x.id==='var_vitrerie_c'))});
const choisi=defaut(perso,'vitrerie').join();
const m2=M.ptrBiblio({...M.EMPTY,ptrBiblio:perso});
chk(choisi!=='var_vitrerie_a'?defaut(m2,'vitrerie').join()===choisi:true,'un défaut choisi par l’utilisateur n’est pas remplacé');
/* un défaut choisi autrement : on force le cas avec la proposition B des volets */
const perso2=JSON.parse(JSON.stringify(r27));
pr(perso2,'volets_roulants').variantes.forEach(v=>{v.parDefaut=v.id==='var_volets_roulants_b'});
const m3=M.ptrBiblio({...M.EMPTY,ptrBiblio:perso2});
chk(defaut(m3,'volets_roulants').join()==='var_volets_roulants_b','volets : le défaut B choisi par l’utilisateur reste');
const perso3=JSON.parse(JSON.stringify(r27));
pr(perso3,'domotique').variantes.find(v=>v.id==='var_domotique_b').archivee=true;
const m4=M.ptrBiblio({...M.EMPTY,ptrBiblio:perso3});
chk(defaut(m4,'domotique').join()==='var_domotique_a','une proposition archivée ne devient pas celle par défaut');
fin();
