/* Révision 25 : la couverture standard (proposition A) décrit l'ardoise
   fibres-ciment CEDRAL Kergoat, avec photos et documentation du fabricant.
   Une bibliothèque dont le texte n'a pas été retouché reçoit le nouveau ;
   un texte retouché reste intact. */
const {charger,verif}=require('./harness');
const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','ptrNouveauProgramme','ptrRapprochement','venteLignes','EMPTY']);
const {chk,fin}=verif();
const r24=biblioRev('rev24');
const b=M.ptrBiblioInitiale();
const pr=b.prestations.find(p=>p.id==='pr_couverture');
const a=pr.variantes[0];
chk(a.id==='var_couverture_a'&&a.parDefaut&&pr.variantes.length===3,'A reste la proposition par défaut, B et C toujours là');
chk(/CEDRAL \*\*KERGOAT\*\*/.test(a.texte)&&/ou équivalent/.test(a.texte)&&!/Orléane/.test(a.texte),'A : ardoise Cedral Kergoat, ou équivalent, plus « type Orléane »');
chk(/NF EN 492/.test(a.texte)&&/40 x 24 cm/.test(a.texte)&&/3,8 mm/.test(a.texte)&&/DTU 40\.13/.test(a.texte)&&/A2-s1, d0/.test(a.texte)&&/15 ans/.test(a.texte),
  'caractéristiques du fabricant : norme, format, épaisseur, DTU, feu, garantie');
chk(/recouvrement adaptés à la pente/.test(a.texte)&&/contre-lattage/.test(a.texte),'pose : recouvrement selon la pente, lame d’air sous écran');
chk(a.marque==='Cedral (Etex)'&&/Kergoat 40 x 24/.test(a.reference)&&/cedral\.world\/fr-fr\/.*kergoat\/$/.test(a.url),'marque, référence, lien du fabricant');
chk(a.photos.length===3&&a.photos[0].fichier==='kergoat_ardoise.jpeg'&&a.photos[2].fichier==='image22.jpeg'
  &&a.photos.every(x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier)),'photos Kergoat, puis la photo du modèle CP');
chk(a.pieces.length===1&&fs.existsSync(RACINE+'/assets/ptr/'+a.pieces[0].fichier),'documentation Cedral jointe');
chk(!/€|prix/i.test(a.texte),'aucun prix');
const al=M.ptrAlertesPrestation(pr,b).filter(x=>/faute|accent|colle|dim:|espaces|unite/.test(x.cle)).map(x=>x.msg);
chk(!al.length,'sans faute signalée '+al.join(' | '));
/* migration depuis la révision 24 */
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r24))});
const am=m.prestations.find(p=>p.id==='pr_couverture').variantes[0];
chk(m.seedRev===27&&am.texte===a.texte&&am.marque==='Cedral (Etex)'&&am.photos[0].fichier==='kergoat_ardoise.jpeg'
  &&am.photos.some(x=>x.fichier==='image22.jpeg')&&am.pieces.length===1,'révision 24 : texte remplacé, photos et documentation ajoutées');
/* un texte retouché par l'utilisateur n'est pas remplacé */
const r=JSON.parse(JSON.stringify(r24));
r.prestations.find(p=>p.id==='pr_couverture').variantes[0].texte='Couverture en ardoises, texte propre à CP.';
const m2=M.ptrBiblio({...M.EMPTY,ptrBiblio:r});
chk(m2.prestations.find(p=>p.id==='pr_couverture').variantes[0].texte==='Couverture en ardoises, texte propre à CP.','texte retouché : intact');
/* une vente « ardoises Kergoat » correspond au standard */
const L=M.venteLignes('1. NOTICE TECHNIQUE • Couverture en ardoises fibres-ciment Kergoat de Cedral (envisagé) Coût prévisionnel : 1 €');
const prog=M.ptrNouveauProgramme(b,{prospectId:'p'},'modele');
const R=M.ptrRapprochement(prog,b,L);
chk(R.conformes.some(g=>g.ligne.prestationId==='pr_couverture')&&!R.ecarts.some(g=>g.ligne.prestationId==='pr_couverture'),'rapprochement : une couverture Kergoat vendue est conforme au standard');
fin();
