/* Révision 8 : gouttières aluminium G300 DAL'ALU ou équivalent, photo et
   fiche produit ; reprises par une bibliothèque de révision 7 non
   retouchée. */
const {charger,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','EMPTY']);
const {chk,fin}=verif();
const r7=biblioRev('rev7b');
const V=(bib,id)=>bib.prestations.flatMap(p=>p.variantes).find(v=>v.id===id);
const b=M.ptrBiblioInitiale();
const g=V(b,'var_gouttieres_tuyaux_descente_a');
chk(/type G300 de DAL'ALU ou équivalent/.test(g.texte)&&/6\/10e/.test(g.texte)&&/90 cm²/.test(g.texte)&&/gris anthracite, sable ou cuivre/.test(g.texte),'gouttières : G300 DAL’ALU ou équivalent, 6/10e, 90 cm², teintes conservées');
chk(g.photos.length===1&&g.pieces.length===1&&[...g.photos,...g.pieces].every(x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier)),'photo et fiche produit jointes');
const pr=b.prestations.find(p=>p.id==='pr_gouttieres_tuyaux_descente');
chk(!M.ptrAlertesPrestation(pr,b).some(a=>/faute|accent|colle|dim:|espaces|unite/.test(a.cle)),'texte sans faute signalée');
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r7))});
const gm=V(m,'var_gouttieres_tuyaux_descente_a');
chk(m.seedRev===22&&gm.texte===g.texte&&gm.photos.length===1&&gm.pieces.length===1&&gm.marque==='DAL’ALU','bibliothèque de révision 7 : texte, photo, fiche et marque reçus');
fin();
