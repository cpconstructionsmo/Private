/* Révision 16 : VMC ATLANTIC Hygrocosy BC Flex et appareillage SCHNEIDER
   Odace, photos et fiches ; reçus par une bibliothèque de révision 15. */
const {charger,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','EMPTY']);
const {chk,fin}=verif();
const r15=biblioRev('rev15');
const V=(bib,id)=>bib.prestations.flatMap(p=>p.variantes).find(v=>v.id===id);
const b=M.ptrBiblioInitiale();
const v=V(b,'var_ventilation_mecanique_controlee_a'), e=V(b,'var_electricite_a');
chk(/HYGROCOSY BC FLEX ou équivalent/.test(v.texte)&&/14\.5\/17-2279/.test(v.texte)&&/moteur EC/.test(v.texte)&&/Entrées d'air hygroréglables/.test(v.texte),'VMC : Atlantic Hygrocosy BC Flex, Avis Technique, entrées d’air conservées');
chk(/ODACE ou équivalent/.test(e.texte)&&/S920052/.test(e.texte)&&/230 volts/.test(e.texte)&&/grade 2TV/.test(e.texte)&&!/Céliane/.test(e.texte),'électricité : appareillage Schneider Odace, 230 V et grade 2TV conservés');
chk(v.photos[0].fichier==='atlantic_hygrocosy_bc_flex.jpeg'&&v.pieces.length===1&&e.photos[0].fichier==='schneider_odace_prise.jpeg'&&e.pieces.length===1,'photos et fiches jointes');
chk([...v.photos,...v.pieces,...e.photos,...e.pieces].every(x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier)),'fichiers présents');
chk(!['pr_ventilation_mecanique_controlee','pr_electricite'].some(id=>{const p=b.prestations.find(x=>x.id===id);return M.ptrAlertesPrestation(p,b).some(a=>/faute|accent|colle|dim:|espaces|unite/.test(a.cle))}),'textes sans faute signalée');
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r15))});
chk(m.seedRev===22&&V(m,'var_ventilation_mecanique_controlee_a').texte===v.texte&&V(m,'var_electricite_a').texte===e.texte&&V(m,'var_electricite_a').pieces.length===1,'bibliothèque de révision 15 : textes, photos et fiches reçus');
fin();
