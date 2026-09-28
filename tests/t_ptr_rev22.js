/* Révision 22 : revêtements muraux — faïence 60 x 60 beige et décorative
   verte 29,5 x 59,5, baguettes d'angle, SPEC (proposition B). */
const {charger,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','ptrAlertesLigne','ptrNouveauProgramme','ptrSnapshotVariante','EMPTY']);
const {chk,fin}=verif();
const r21=biblioRev('rev21');
const b=M.ptrBiblioInitiale();
const pr=b.prestations.find(p=>p.id==='pr_revetements_muraux');
const [a,vb]=pr.variantes;
chk(pr.variantes.length===2&&a.parDefaut&&/17,00 m²/.test(a.texte),'la proposition standard reste par défaut et inchangée');
chk(vb.id==='var_revetements_muraux_b'&&!vb.parDefaut&&/60 x 60 cm, coloris beige/.test(vb.texte)&&/verte 29,5 x 59,5 cm/.test(vb.texte)&&/baguettes de finition/.test(vb.texte)&&/SPEC/.test(vb.texte)&&/DTU 52\.2/.test(vb.texte),'B : faïence 60 x 60 et verte 29,5 x 59,5, baguettes, SPEC');
chk((vb.texte.match(/\[à préciser\] m²/g)||[]).length===2,'surfaces à préciser pour chaque projet');
chk(!/€|prix|44\.00|29\.90|23,25|5,25/i.test(vb.texte),'ni prix ni surfaces d’un projet dans la bibliothèque');
chk(vb.photos.length===2&&vb.photos.every(x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier)),'photos des deux faïences');
const al=M.ptrAlertesPrestation(pr,b).filter(x=>/faute|accent|colle|dim:|espaces|unite/.test(x.cle)).map(x=>x.msg);
chk(!al.length,'sans faute signalée '+al.join(' | '));
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r21))});
const pm=m.prestations.find(p=>p.id==='pr_revetements_muraux');
chk(m.seedRev===22&&pm.variantes.map(v=>v.id).join()==='var_revetements_muraux_a,var_revetements_muraux_b'&&pm.variantes[0].parDefaut,'révision 21 : B ajoutée, A par défaut');
fin();
