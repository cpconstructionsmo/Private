/* Révision 10 : menuiseries EMAPLAST (PVC VEKA EMA-SOFT 70, alu REYNAERS
   Patio-Mono), vitrerie à isolation renforcée, volets roulants électriques
   à coffre demi-linteau SOMFY io, box TaHoma io — en propositions B, sans
   prix ni dimensions du devis. */
const {charger,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','EMPTY']);
const {chk,fin}=verif();
const r9=biblioRev('rev9');
const b=M.ptrBiblioInitiale();
const ids=['chassis_fenetres_francaise','coulissant','vitrerie','volets_roulants','domotique'];
const V=(bib,pr,id)=>bib.prestations.find(p=>p.id==='pr_'+pr).variantes.find(v=>v.id===id);
const vs=ids.map(i=>V(b,i,'var_'+i+'_b'));
/* révision 28 : la vitrerie et la box TaHoma (B) sont devenues les propositions par défaut */
const DEFAUT28=['vitrerie','domotique'];
chk(vs.every((v,i)=>v&&v.version===1&&v.parDefaut===(DEFAUT28.indexOf(ids[i])>=0)),'5 nouvelles propositions B ; vitrerie et TaHoma par défaut depuis la révision 28');
chk(/EMA-SOFT 70/.test(vs[0].texte)&&/Uw = 1,3 à 1,4/.test(vs[0].texte)&&/A4, eau E7B, vent VA2/.test(vs[0].texte),'châssis PVC VEKA EMA-SOFT 70, Uw et classement NF-CSTBat');
chk(/Patio-Mono/.test(vs[1].texte)&&/4 points au-delà de 1,95 m/.test(vs[1].texte),'coulissants alu REYNAERS Patio-Mono');
chk(/coffre demi-linteau GEMAPLAST IRYS/.test(vs[3].texte)&&/SOMFY io/.test(vs[3].texte),'volets électriques à coffre demi-linteau, moteurs SOMFY io');
chk(/TAHOMA SWITCH/.test(vs[4].texte)&&/radio io/.test(vs[4].texte),'box domotique TaHoma pour volets io');
chk(!vs.some(v=>/€|\bLB7444\b|900 x 1350|chambre/.test(v.texte)),'ni prix, ni référence de devis, ni dimensions du chantier dans la bibliothèque');
chk(!ids.some(i=>{const p=b.prestations.find(x=>x.id==='pr_'+i);return M.ptrAlertesPrestation(p,b).some(a=>/faute|accent|colle|dim:|espaces|unite/.test(a.cle))}),'textes sans faute signalée');
chk(vs.flatMap(v=>v.photos).every(ph=>fs.existsSync(RACINE+'/assets/ptr/'+ph.fichier)),'photos présentes');
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r9))});
chk(m.seedRev===28&&ids.every(i=>{const v=V(m,i,'var_'+i+'_b');return v&&v.parDefaut===(DEFAUT28.indexOf(i)>=0)}),'bibliothèque de révision 9 : les 5 propositions sont ajoutées (vitrerie et TaHoma par défaut)');
fin();
