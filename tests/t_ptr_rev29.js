/* Révision 29 : portes intérieures techniques CHAPUZET Plane PHONE EI 30 –
   29 dB (proposition B), pour les locaux tertiaires et les ERP. La
   proposition par défaut ne change pas. */
const {charger,verif}=require('./harness');
const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','EMPTY']);
const {chk,fin}=verif();
const r28=biblioRev('rev28');
const b=M.ptrBiblioInitiale();
const pr=b.prestations.find(p=>p.id==='pr_portes_interieures');
const vb=pr.variantes.find(v=>v.id==='var_portes_interieures_b');
chk(pr.variantes[0].parDefaut&&vb&&!vb.parDefaut,'proposition B ajoutée, la A reste par défaut');
chk(/CHAPUZET \*\*PLANE PHONE EI 30 – 29 dB\*\*/.test(vb.texte)&&/ou équivalent/.test(vb.texte)&&/EI 30/.test(vb.texte)&&/29 dB/.test(vb.texte),'Chapuzet Plane PHONE, EI 30, 29 dB, ou équivalent');
chk(/hêtre massif/.test(vb.texte)&&/ODICEFEU/.test(vb.texte)&&/serrure axe 50 spéciale feu/.test(vb.texte)&&/largeur de vantail selon plans/.test(vb.texte),'huisserie, joints, serrure ; largeur selon plans');
chk(vb.marque==='Chapuzet'&&/1732_plane/.test(vb.reference)&&/chapuzet\.com\/produit\/plane-2\/$/.test(vb.url),'marque, référence, lien du fabricant');
chk(vb.photos.length===1&&fs.existsSync(RACINE+'/assets/ptr/'+vb.photos[0].fichier),'photo du bloc-porte');
chk(!/€|prix/i.test(vb.texte),'aucun prix');
const al=M.ptrAlertesPrestation(pr,b).filter(x=>/faute|accent|colle|dim:|espaces|unite/.test(x.cle)).map(x=>x.msg);
chk(!al.length,'sans faute signalée '+al.join(' | '));
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r28))});
const pm=m.prestations.find(p=>p.id==='pr_portes_interieures');
chk(m.seedRev===29&&pm.variantes.some(v=>v.id==='var_portes_interieures_b'&&!v.parDefaut)&&pm.variantes[0].parDefaut,'révision 28 : la proposition B arrive, sans devenir par défaut');
chk(m.prestations.length===r28.prestations.length,'aucune prestation ajoutée ni retirée');

/* photos des blocs autonomes d'éclairage de sécurité (ERP) */
const va=b.prestations.find(p=>p.id==='pr_erp_eclairage_securite').variantes[0];
chk(va.photos.map(x=>x.fichier).join()==='baes_evacuation.jpeg,baes_ambiance_anti_panique.jpeg'&&va.photos.every(x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier)),
  'BAES : photos du bloc d’évacuation et du bloc d’ambiance');
const vr=r28.prestations.find(p=>p.id==='pr_erp_eclairage_securite').variantes[0];
chk(!vr.photos.length&&va.texte===vr.texte,'le texte de la prestation ne change pas');
const vm=pm&&m.prestations.find(p=>p.id==='pr_erp_eclairage_securite').variantes[0];
chk(vm.photos.length===2&&vm.texte===vr.texte,'révision 28 : les photos arrivent sur la bibliothèque enregistrée');
/* une bibliothèque où l'on a déjà mis sa propre photo : elle reste en tête */
const r28b=JSON.parse(JSON.stringify(r28));
const vp=r28b.prestations.find(p=>p.id==='pr_erp_eclairage_securite').variantes[0];
vp.texte+='\nRetouche.';vp.photos=[{id:'ph_maison',src:'asset',fichier:'x.jpeg',nom:'x'}];
const vm2=M.ptrBiblio({...M.EMPTY,ptrBiblio:r28b}).prestations.find(p=>p.id==='pr_erp_eclairage_securite').variantes[0];
chk(vm2.photos.map(x=>x.id).join()==='ph_maison,ph_baes_evacuation_jpeg,ph_baes_ambiance_anti_panique_jpeg'&&/Retouche\.$/.test(vm2.texte),
  'texte retouché gardé, sa photo en tête, les deux BAES à la suite');
fin();
