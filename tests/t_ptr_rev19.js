/* Révision 19 : receveur de douche ACQUABELLA Compact en proposition B. */
const {charger,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','EMPTY']);
const {chk,fin}=verif();
const r18=biblioRev('rev18');
const b=M.ptrBiblioInitiale();
const pr=b.prestations.find(p=>p.id==='pr_douche');
const a=pr.variantes[0], e=pr.variantes.find(v=>v.id==='var_douche_b');
chk(a.parDefaut&&/Flight de Jacob Delafon/.test(a.texte),'le receveur Flight reste la proposition par défaut');
chk(e&&!e.parDefaut&&/ACQUABELLA \*\*COMPACT\*\* ou équivalent/.test(e.texte)&&/PN24/.test(e.texte)&&/EN 14527/.test(e.texte)&&/GRANITE/.test(e.texte)&&/EPUR/.test(e.texte)&&/selon plans/.test(e.texte),'proposition B : Acquabella Compact, Granite ou Epur, PN24, EN 14527');
chk(e.photos.length===2&&e.pieces.length===1&&[...e.photos,...e.pieces].every(x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier)),'photos et fiche jointes');
chk(!/€|prix/i.test(e.texte),'aucun prix dans le texte');
const al=M.ptrAlertesPrestation(pr,b).filter(x=>/faute|accent|colle|dim:|espaces|unite/.test(x.cle));
chk(!al.length,'texte sans faute signalée'+(al.length?' — '+al.map(x=>x.msg).join(' | '):''));
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r18))});
const pm=m.prestations.find(p=>p.id==='pr_douche');
chk(m.seedRev===22&&pm.variantes.some(v=>v.id==='var_douche_b'&&!v.parDefaut)&&pm.variantes[0].parDefaut&&pm.variantes[0].texte===a.texte,'bibliothèque de révision 18 : Compact ajouté en B, Flight reste par défaut et inchangé');
fin();
