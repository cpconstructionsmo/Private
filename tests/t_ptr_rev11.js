/* Révision 11 : cloisons 72 mm KNAUF METAL 72/48 et doublage ISOVER
   OPTIMA (ou équivalent), schémas et fiches joints ; reçus par une
   bibliothèque de révision 10 non retouchée. */
const {charger,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','EMPTY']);
const {chk,fin}=verif();
const r10=biblioRev('rev10');
const V=(bib,id)=>bib.prestations.flatMap(p=>p.variantes).find(v=>v.id===id);
const b=M.ptrBiblioInitiale();
const c=V(b,'var_cloisons_72mm_a'), d=V(b,'var_doublage_a');
chk(/KNAUF METAL 72\/48 ou équivalent/.test(c.texte)&&/RA = 39 dB/.test(c.texte)&&/EI 30/.test(c.texte)&&/PARPHONIC de 45 mm/.test(c.texte)&&/Épaisseur finie|épaisseur finie : 72 mm/.test(c.texte),'cloisons 72 mm : Knauf Metal 72/48 ou équivalent, 39 dB, EI 30, épaisseur 72 mm conservée');
chk(/ISOVER OPTIMA ou équivalent/.test(d.texte)&&/Optima2/.test(d.texte)&&/minimale de 140 mm/.test(d.texte),'doublage : système Isover Optima ou équivalent, 140 mm minimum conservé');
chk(c.photos[0].fichier==='knauf_cloison_72_48.jpeg'&&d.photos[0].fichier==='isover_optima_murs.jpeg'&&c.pieces.length===1&&d.pieces.length===1,'schémas en tête des photos, fiches jointes');
chk([...c.photos,...c.pieces,...d.photos,...d.pieces].every(x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier)),'fichiers présents');
chk(!['pr_cloisons_72mm','pr_doublage'].some(id=>{const p=b.prestations.find(x=>x.id===id);return M.ptrAlertesPrestation(p,b).some(a=>/faute|accent|colle|dim:|espaces|unite/.test(a.cle))}),'textes sans faute signalée');
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r10))});
chk(m.seedRev===22&&V(m,'var_cloisons_72mm_a').texte===c.texte&&V(m,'var_doublage_a').pieces.length===1&&V(m,'var_doublage_a').photos[0].fichier==='isover_optima_murs.jpeg','bibliothèque de révision 10 : textes, schémas et fiches reçus');
fin();
