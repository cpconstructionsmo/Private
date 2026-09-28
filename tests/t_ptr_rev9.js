/* Révision 9 : porte d'entrée Bel'M Abscisse Evo (proposition B) et porte
   de garage sectionnelle Hörmann RenoMatic (nouvelle prestation, après la
   porte d'entrée), avec photos et documentation. */
const {charger,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','ptrNouveauProgramme','ptrPrestationsDe','EMPTY']);
const {chk,fin}=verif();
const r8=biblioRev('rev8');
const b=M.ptrBiblioInitiale();
const pe=b.prestations.find(p=>p.id==='pr_porte_entree'), pg=b.prestations.find(p=>p.id==='pr_porte_garage');
const vB=pe.variantes.find(v=>v.id==='var_porte_entree_b');
chk(vB&&/ABSCISSE EVO/.test(vB.texte)&&/Ud = 1,4 W\/m²\.K/.test(vB.texte)&&!vB.parDefaut&&pe.variantes[0].parDefaut,'porte d’entrée : proposition B Bel’M Abscisse Evo, la A reste par défaut');
chk(pg&&/RENOMATIC/.test(pg.variantes[0].texte)&&/42 mm/.test(pg.variantes[0].texte)&&!pg.optionnelle&&pg.defautMO,'porte de garage : nouvelle prestation Hörmann RenoMatic, incluse, lot MO');
const ordre=M.ptrPrestationsDe(b,'cat_menuiseries_exterieures').map(p=>p.id);
chk(ordre[ordre.indexOf('pr_porte_entree')+1]==='pr_porte_garage','placée juste après la porte d’entrée');
const fich=[...vB.photos,...vB.pieces,...pg.variantes[0].photos,...pg.variantes[0].pieces];
chk(fich.length===6&&fich.every(x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier)),'photos et documentations présentes (6 fichiers)');
chk(![pe,pg].some(p=>M.ptrAlertesPrestation(p,b).some(a=>/faute|accent|colle|dim:|espaces|unite/.test(a.cle))),'textes sans faute signalée');
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r8))});
const om=M.ptrPrestationsDe(m,'cat_menuiseries_exterieures').map(p=>p.id);
chk(m.seedRev===22&&om[om.indexOf('pr_porte_entree')+1]==='pr_porte_garage'&&m.prestations.find(p=>p.id==='pr_porte_entree').variantes.some(v=>v.id==='var_porte_entree_b'&&!v.parDefaut),'bibliothèque de révision 8 : porte de garage ajoutée après la porte d’entrée, Bel’M en proposition B');
const prog=M.ptrNouveauProgramme(b,{prospectId:'p'},'modele');
chk(prog.lignes.some(l=>l.prestationId==='pr_porte_garage'&&l.incluse),'un nouveau programme comprend la porte de garage');
fin();
