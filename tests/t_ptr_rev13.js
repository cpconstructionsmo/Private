/* Révision 13 : bandes de joints avec les enduits PLACOJOINT PR 4 (à prise)
   et GDX (à séchage), photos des sacs et de la bande, fiches jointes. */
const {charger,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','EMPTY']);
const {chk,fin}=verif();
const r12=biblioRev('rev12');
const V=(bib,id)=>bib.prestations.flatMap(p=>p.variantes).find(v=>v.id===id);
const b=M.ptrBiblioInitiale();
const v=V(b,'var_bandes_joints_plaque_platre_a');
chk(/PLACOJOINT PR 4/.test(v.texte)&&/PLACOJOINT GDX/.test(v.texte)&&/EN 13963/.test(v.texte)&&/DTU 59\.1 « peinture »/.test(v.texte)&&/à la charge du lot peinture/.test(v.texte),'bandes : Placojoint PR 4 et GDX, DTU 59.1 et exclusions conservés');
chk(v.photos.length===4&&v.photos[0].fichier==='placojoint_pr4.jpeg'&&v.pieces.length===2,'3 photos produits + photo d’origine, 2 fiches');
chk([...v.photos,...v.pieces].every(x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier)),'fichiers présents');
const pr=b.prestations.find(p=>p.id==='pr_bandes_joints_plaque_platre');
chk(!M.ptrAlertesPrestation(pr,b).some(a=>/faute|accent|colle|dim:|espaces|unite/.test(a.cle)),'texte sans faute signalée');
chk(!fs.readdirSync(RACINE+'/assets/ptr/docs').some(f=>/stevia|sevevent|comptes|actes/i.test(f)),'aucun document sans rapport (comptes sociaux, actes) déposé dans l’application');
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r12))});
const vm=V(m,'var_bandes_joints_plaque_platre_a');
chk(m.seedRev===22&&vm.texte===v.texte&&vm.pieces.length===2&&vm.photos[0].fichier==='placojoint_pr4.jpeg','bibliothèque de révision 12 : texte, photos et fiches reçus');
fin();
