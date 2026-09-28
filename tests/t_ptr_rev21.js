/* Révision 21 : revêtements de sols — carrelage imitation bois 20 x 120,
   plinthes bois dans toutes les pièces sauf le garage (proposition C). */
const {charger,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','EMPTY']);
const {chk,fin}=verif();
const r20=biblioRev('rev20');
const b=M.ptrBiblioInitiale();
const pr=b.prestations.find(p=>p.id==='pr_revetements_sols');
const [a,vb,vc]=pr.variantes;
chk(pr.variantes.length===3&&a.parDefaut&&/SEVILLE AVARIO/.test(a.texte)&&/SEVILLE AVARIO/.test(vb.texte)&&/Plinthes assorties/.test(a.texte),'A et B inchangées, A reste par défaut');
chk(vc.id==='var_revetements_sols_c'&&!vc.parDefaut&&/imitation bois, format 20 x 120 cm/.test(vc.texte)&&/Plinthes en bois dans toutes les pièces sauf le garage/.test(vc.texte)&&/sauf les chambres, le dressing et le garage/.test(vc.texte),'C : carrelage imitation bois 20 x 120, plinthes bois sauf garage');
chk(vc.photos.length===1&&fs.existsSync(RACINE+'/assets/ptr/'+vc.photos[0].fichier),'photo de la gamme jointe');
chk(!/€|prix|37,30/i.test(vc.texte),'aucun prix dans la bibliothèque');
const al=M.ptrAlertesPrestation(pr,b).filter(x=>/faute|accent|colle|dim:|espaces|unite/.test(x.cle)).map(x=>x.msg);
chk(!al.length,'sans faute signalée '+al.join(' | '));
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r20))});
const pm=m.prestations.find(p=>p.id==='pr_revetements_sols');
chk(m.seedRev===22&&pm.variantes.map(v=>v.id).join()==='var_revetements_sols_a,var_revetements_sols_b,var_revetements_sols_c'&&pm.variantes[0].parDefaut,'révision 20 : C ajoutée sans toucher A et B');
fin();
