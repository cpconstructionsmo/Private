/* Révision 18 : meuble vasque AMBIANCE BAIN ELYPS 2 en proposition B. */
const {charger,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','EMPTY']);
const {chk,fin}=verif();
const r17=biblioRev('rev17');
const b=M.ptrBiblioInitiale();
const pr=b.prestations.find(p=>p.id==='pr_lavabo_meuble_vasque');
const a=pr.variantes[0], e=pr.variantes.find(v=>v.id==='var_lavabo_meuble_vasque_b');
chk(a.parDefaut&&/CONCERTO 2/.test(a.texte),'le meuble Concerto 2 reste la proposition par défaut');
chk(e&&!e.parDefaut&&/ELYPS 2\*\* ou équivalent/.test(e.texte)&&/céramique blanc brillant/.test(e.texte)&&/60, 70, 80, 90, 100 ou 120 cm/.test(e.texte)&&/amortisseur de fermeture/.test(e.texte),'proposition B : Ambiance Bain Elyps 2, plan céramique, largeurs 60 à 120 cm');
chk(e.photos.length===2&&e.pieces.length===1&&[...e.photos,...e.pieces].every(x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier)),'photos et fiche jointes');
chk(!M.ptrAlertesPrestation(pr,b).some(x=>/faute|accent|colle|dim:|espaces|unite/.test(x.cle)),'texte sans faute signalée');
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r17))});
const pm=m.prestations.find(p=>p.id==='pr_lavabo_meuble_vasque');
chk(m.seedRev===22&&pm.variantes.some(v=>v.id==='var_lavabo_meuble_vasque_b'&&!v.parDefaut)&&pm.variantes[0].parDefaut,'bibliothèque de révision 17 : Elyps 2 ajouté en B, Concerto reste par défaut');
fin();
