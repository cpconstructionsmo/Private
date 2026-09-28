/* Révision 15 : combles perdus — laine de verre soufflée SUPAFIL LOFT
   (standard complété) et laine de roche soufflée ROCKAIR 2 (proposition B). */
const {charger,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','EMPTY']);
const {chk,fin}=verif();
const r14=biblioRev('rev14');
const V=(bib,id)=>bib.prestations.flatMap(p=>p.variantes).find(v=>v.id===id);
const b=M.ptrBiblioInitiale();
const a=V(b,'var_isolation_thermique_plafond_a'), r=V(b,'var_isolation_thermique_plafond_b');
chk(/SUPAFIL LOFT ou équivalent/.test(a.texte)&&/λ = 0,045/.test(a.texte)&&/455 mm \(450 mm après tassement\)/.test(a.texte)&&/R = 10 m²\.K\/W/.test(a.texte)&&/DTU 45\.11/.test(a.texte),'A : laine de verre Supafil Loft, 455 mm pour R = 10, DTU 45.11');
chk(r&&!r.parDefaut&&/ROCKAIR 2\*\* ou équivalent/.test(r.texte)&&/λ = 0,044/.test(r.texte)&&/445 mm \(440 mm après tassement\)/.test(r.texte),'B : laine de roche Rockair 2, 445 mm pour R = 10, non par défaut');
chk(a.photos[0].fichier==='knauf_supafil_loft.jpeg'&&a.pieces.length===1&&r.photos[0].fichier==='rockwool_rockair2.jpeg'&&r.pieces.length===1,'photos des sacs et fiches jointes');
chk([...a.photos,...a.pieces,...r.photos,...r.pieces].every(x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier)),'fichiers présents');
const pr=b.prestations.find(p=>p.id==='pr_isolation_thermique_plafond');
chk(!M.ptrAlertesPrestation(pr,b).some(x=>/faute|accent|colle|dim:|espaces|unite/.test(x.cle)),'textes sans faute signalée');
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r14))});
chk(m.seedRev===22&&V(m,'var_isolation_thermique_plafond_a').texte===a.texte&&V(m,'var_isolation_thermique_plafond_a').pieces.length===1&&!!V(m,'var_isolation_thermique_plafond_b'),'bibliothèque de révision 14 : standard complété, proposition B ajoutée');
fin();
