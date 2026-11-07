/* Révision 24 : couverture en tuiles minérales MONIER Nobilée, teinte
   suivant plans (proposition C), avec les photos et la fiche produit du
   fabricant. La proposition standard reste celle par défaut. */
const {charger,verif}=require('./harness');
const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','ptrNouveauProgramme','ptrRapprochement','ptrAppliquerToutVente','venteLignes','EMPTY']);
const {chk,fin}=verif();
const r23=biblioRev('rev23');
const b=M.ptrBiblioInitiale();
const pr=b.prestations.find(p=>p.id==='pr_couverture');
const [a,vb,vc]=pr.variantes;
chk(pr.variantes.length===3&&a.parDefaut&&!vc.parDefaut&&vb.id==='var_couverture_b'&&vb.marque==='Edilians','A reste par défaut, B (Edilians) inchangée');
chk(vc.id==='var_couverture_c'&&vc.titre==='COUVERTURE'&&/MONIER \*\*NOBILÉE\*\*/.test(vc.texte)&&/ou équivalent/.test(vc.texte),'C : tuile minérale Monier Nobilée, ou équivalent');
chk(/33 x 42 cm/.test(vc.texte)&&/9,6 à 11,3 tuiles au m²/.test(vc.texte)&&/29,5 à 34,5 cm/.test(vc.texte)&&/NF EN 490/.test(vc.texte)&&/DTU 40\.241/.test(vc.texte)&&/40 %/.test(vc.texte),
  'caractéristiques de la fiche : format, nombre au m², pureau, normes, pente minimale');
chk(/Teinte suivant plans/.test(vc.texte),'teinte suivant plans');
chk(vc.marque==='Monier (BMI)'&&/Nobilée/.test(vc.reference)&&/^https:\/\/www\.bmigroup\.com\/fr\/.*nobilee\/$/.test(vc.url),'marque, référence et lien du fabricant');
chk(vc.photos.length===2&&vc.photos.every(x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier)),'photos de la toiture et de la tuile');
chk(vc.pieces.length===1&&fs.existsSync(RACINE+'/assets/ptr/'+vc.pieces[0].fichier)&&fs.statSync(RACINE+'/assets/ptr/'+vc.pieces[0].fichier).size<3e6,'fiche produit jointe (moins de 3 Mo)');
chk(!/€|prix/i.test(vc.texte),'aucun prix');
const al=M.ptrAlertesPrestation(pr,b).filter(x=>/faute|accent|colle|dim:|espaces|unite/.test(x.cle)).map(x=>x.msg);
chk(!al.length,'sans faute signalée '+al.join(' | '));
/* migration depuis la révision 23 */
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r23))});
const pm=m.prestations.find(p=>p.id==='pr_couverture');
chk(m.seedRev===25&&pm.variantes.map(v=>v.id).join()==='var_couverture_a,var_couverture_b,var_couverture_c'&&pm.variantes[0].parDefaut,'révision 23 : C ajoutée, A par défaut');
chk(m.prestations.length===r23.prestations.length,'aucune prestation ajoutée ni retirée');
/* une vente « tuiles minérales Monier Nobilée » trouve maintenant sa proposition */
const L=M.venteLignes('1. NOTICE TECHNIQUE • Charpente 35°, couverture en tuiles minérales Monier Nobilée teinte sombre (envisagé) Coût prévisionnel : 1 €');
const prog={...M.ptrNouveauProgramme(b,{prospectId:'p'},'vente'),vente:{nom:'x',le:'2026-11-07',lignes:L}};
const R=M.ptrRapprochement(prog,b,L);
const g=R.ecarts.find(x=>x.ligne.prestationId==='pr_couverture');
chk(g&&g.actions.some(x=>x.type==='variante'&&x.varianteId==='var_couverture_c'),'rapprochement : la proposition Monier Nobilée est proposée');
const r=M.ptrAppliquerToutVente(prog,b);
chk(r.prog.lignes.find(l=>l.prestationId==='pr_couverture').varianteId==='var_couverture_c'
  &&!M.ptrRapprochement(r.prog,b,L).ecarts.some(x=>x.ligne.prestationId==='pr_couverture'),'appliquée : la couverture est conforme à la vente');
fin();
