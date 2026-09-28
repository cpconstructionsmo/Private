/* Révision 20 : baignoire Jacob Delafon Corvette avec tablier à carreler
   (après la douche), colonne Ramon Soler Valmont 2 (B), mitigeur
   thermostatique et douchette (C). */
const {charger,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','ptrNouveauProgramme','EMPTY']);
const {chk,fin}=verif();
const r19=biblioRev('rev19');
const b=M.ptrBiblioInitiale();
const ex=x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier);
const fautes=pr=>M.ptrAlertesPrestation(pr,b).filter(x=>/faute|accent|colle|dim:|espaces|unite/.test(x.cle)).map(x=>x.msg);
/* baignoire */
const plo=b.prestations.filter(p=>p.categorieId===b.prestations.find(q=>q.id==='pr_douche').categorieId).sort((x,y)=>x.ordre-y.ordre).map(p=>p.id);
chk(plo[plo.indexOf('pr_douche')+1]==='pr_baignoire','la baignoire suit la douche');
const bg=b.prestations.find(p=>p.id==='pr_baignoire'), va=bg.variantes[0];
chk(bg.nom==='BAIGNOIRE'&&bg.optionnelle&&bg.defautMO,'prestation BAIGNOIRE, optionnelle');
chk(/JACOB DELAFON \*\*CORVETTE\*\*/.test(va.texte)&&/E60903/.test(va.texte)&&/Tablier à carreler/.test(va.texte)&&/trappe de visite/.test(va.texte)&&/selon plans/.test(va.texte),'Corvette en Minéracryl avec tablier à carreler');
chk(va.photos.length===1&&va.pieces.length===1&&[...va.photos,...va.pieces].every(ex),'photo et fiche de la baignoire');
chk(!fautes(bg).length,'baignoire sans faute signalée '+fautes(bg).join(' | '));
/* colonne de douche */
const cd=b.prestations.find(p=>p.id==='pr_colonne_douche');
const [a,vb,vc]=cd.variantes;
chk(cd.variantes.length===3&&a.parDefaut&&!vb.parDefaut&&!vc.parDefaut&&/Douche de tête ronde Ø 200 mm/.test(a.texte),'la colonne actuelle reste la proposition par défaut');
chk(vb.id==='var_colonne_douche_b'&&/RAMON SOLER \*\*VALMONT 2\*\*/.test(vb.texte)&&/Termostop/.test(vb.texte)&&/1 700 mm/.test(vb.texte)&&vb.photos.length===1&&vb.pieces.length===1&&[...vb.photos,...vb.pieces].every(ex),'B : Valmont 2 avec photo et fiche');
chk(vc.id==='var_colonne_douche_c'&&/mitigeur thermostatique mural/.test(vc.texte)&&/douchette/.test(vc.texte)&&/MITIGEUR THERMOSTATIQUE ET DOUCHETTE/.test(vc.titre)&&vc.photos.length===2&&vc.photos.every(ex),'C : mitigeur thermostatique et douchette avec les photos du chantier');
chk(!fautes(cd).length,'colonne sans faute signalée '+fautes(cd).join(' | '));
chk(![va,vb,vc].some(v=>/€|prix/i.test(v.texte)),'aucun prix');
/* nouveau programme : baignoire proposée mais non incluse */
const prog=M.ptrNouveauProgramme(b,{prospectId:'p1'},'modele');
const lb=prog.lignes.find(l=>l.prestationId==='pr_baignoire');
chk(lb&&!lb.incluse,'nouveau programme : ligne baignoire présente, non incluse d’office');
/* migration depuis la révision 19 */
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r19))});
const mb=m.prestations.find(p=>p.id==='pr_baignoire'), md=m.prestations.find(p=>p.id==='pr_douche'), mc=m.prestations.find(p=>p.id==='pr_colonne_douche');
chk(m.seedRev===22&&mb&&mb.ordre>md.ordre&&mb.ordre<mc.ordre,'révision 19 : baignoire ajoutée entre douche et colonne');
chk(mc.variantes.map(v=>v.id).join()==='var_colonne_douche_a,var_colonne_douche_b,var_colonne_douche_c'&&mc.variantes[0].parDefaut&&mc.variantes[0].texte===a.texte,'révision 19 : B et C ajoutées, A inchangée et par défaut');
fin();
