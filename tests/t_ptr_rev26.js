/* Révision 26 : menuiseries EMAPLAST en blanc, en propositions C — châssis
   PVC VEKA EMA-SOFT 70 à dormant de 140 mm, coulissant aluminium REYNAERS
   blanc, volets monobloc PVC blancs SOMFY io, porte Bel'M Abscisse Evo avec
   partie latérale vitrée. Les propositions par défaut ne changent pas. */
const {charger,verif}=require('./harness');
const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','ptrNouveauProgramme','ptrRapprochement','ptrAppliquerToutVente','venteLignes','EMPTY']);
const {chk,fin}=verif();
const r25=biblioRev('rev25');
const b=M.ptrBiblioInitiale();
const IDS=['chassis_fenetres_francaise','coulissant','volets_roulants','porte_entree'];
const pr=id=>b.prestations.find(p=>p.id==='pr_'+id);
const vc=id=>pr(id).variantes.find(v=>v.id==='var_'+id+'_c');
/* révision 28 : le volet à coffre monobloc (C) est devenu la proposition par défaut */
const defautC=id=>id==='volets_roulants';
chk(IDS.every(id=>{const p=pr(id);return p.variantes.length===3&&vc(id)&&vc(id).parDefaut===defautC(id)&&p.variantes[0].parDefaut===!defautC(id)}),
  'une proposition C par ligne ; A par défaut, sauf les volets (C depuis la révision 28)');
chk(/EMA-SOFT 70\*\*/.test(vc('chassis_fenetres_francaise').texte)&&/finition PVC blanc/.test(vc('chassis_fenetres_francaise').texte)&&/140 mm/.test(vc('chassis_fenetres_francaise').texte),
  'châssis : PVC VEKA EMA-SOFT 70 blanc, dormant 140 mm');
chk(/Patio-Mono\*\*/.test(vc('coulissant').texte)&&/blanc RAL 9016/.test(vc('coulissant').texte)&&/140 mm/.test(vc('coulissant').texte),'coulissant : REYNAERS Patio-Mono blanc, dormant 140 mm');
chk(/monobloc/.test(vc('volets_roulants').texte)&&/lames PVC de 44 mm, blanc/.test(vc('volets_roulants').texte)&&/SOMFY io/.test(vc('volets_roulants').texte),'volets : monobloc PVC blanc, SOMFY io');
chk(/ABSCISSE EVO\*\*/.test(vc('porte_entree').texte)&&/partie latérale fixe vitrée/.test(vc('porte_entree').texte)&&/7016 texturé à l’extérieur, blanc à l’intérieur/.test(vc('porte_entree').texte),
  'porte : Abscisse Evo avec partie latérale, gris 7016 / blanc');
chk(IDS.every(id=>/ou équivalent/.test(vc(id).texte)&&!/€|prix|1 400 x|1 600 x|ACCUEIL|accueil|bureau/i.test(vc(id).texte)),'ou équivalent ; ni prix, ni dimensions ni pièces d’un projet');
chk(/\[à préciser\]/.test(vc('chassis_fenetres_francaise').texte),'quantités du projet : [à préciser]');
chk(IDS.every(id=>vc(id).marque&&vc(id).reference),'marque et référence renseignées');
chk(IDS.every(id=>vc(id).photos.length>=1&&vc(id).photos.every(x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier))),'photos des fabricants présentes');
chk(vc('porte_entree').pieces.length===1&&fs.existsSync(RACINE+'/assets/ptr/'+vc('porte_entree').pieces[0].fichier),'porte : fiche Bel’M jointe');
const fautes=IDS.flatMap(id=>M.ptrAlertesPrestation(pr(id),b).filter(x=>/faute|accent|colle|dim:|espaces|unite/.test(x.cle)).map(x=>x.msg));
chk(!fautes.length,'sans faute signalée '+fautes.join(' | '));
/* migration depuis la révision 25 */
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r25))});
chk(m.seedRev===28&&IDS.every(id=>{const p=m.prestations.find(x=>x.id==='pr_'+id);return p.variantes.some(v=>v.id==='var_'+id+'_c'&&v.parDefaut===defautC(id))&&p.variantes[0].parDefaut===!defautC(id)}),
  'révision 25 : les quatre propositions C arrivent ; seule celle des volets devient par défaut (révision 28)');
chk(m.prestations.length===r25.prestations.length+7,'aucune autre prestation ajoutée ni retirée (+7 de la révision 27)');
/* une vente « menuiseries PVC blanc » trouve maintenant les propositions blanches */
const L=M.venteLignes('1. NOTICE TECHNIQUE • Menuiseries PVC RAL blanc (envisagé) • Volets roulants électriques monobloc PVC RAL blanc (envisagé) Coût prévisionnel : 1 €');
const prog={...M.ptrNouveauProgramme(b,{prospectId:'p'},'vente'),vente:{nom:'x',le:'2026-11-08',lignes:L}};
const R=M.ptrRapprochement(prog,b,L);
const g=R.ecarts.find(x=>x.ligne.prestationId==='pr_chassis_fenetres_francaise');
chk(g&&g.actions.some(a=>a.type==='variante'&&a.varianteId==='var_chassis_fenetres_francaise_c'),'rapprochement : les châssis blancs EMAPLAST sont proposés');
const r=M.ptrAppliquerToutVente(prog,b);
chk(r.prog.lignes.find(l=>l.prestationId==='pr_chassis_fenetres_francaise').varianteId==='var_chassis_fenetres_francaise_c','appliqué : la ligne prend la proposition blanche');
fin();
