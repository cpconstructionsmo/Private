/* Révision 23 : établissement recevant du public de 5e catégorie — alarme
   incendie de type 4, éclairage de sécurité, grilles de transfert
   acoustiques et dossier ERP, en prestations optionnelles : un programme
   de maison ne les inclut pas. Aucune règle réglementaire inscrite : type,
   nombre et implantation restent à préciser. */
const {charger,verif}=require('./harness');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','ptrNouveauProgramme','EMPTY']);
const {chk,fin}=verif();
const r22=biblioRev('rev22');
const b=M.ptrBiblioInitiale();
const IDS=['pr_erp_alarme_incendie','pr_erp_eclairage_securite','pr_erp_grilles_transfert','pr_erp_dossier'];
const P=IDS.map(id=>b.prestations.find(p=>p.id===id));
const fautes=pr=>M.ptrAlertesPrestation(pr,b).filter(x=>/faute|accent|colle|dim:|espaces|unite/.test(x.cle)).map(x=>x.msg);
chk(P.every(p=>p&&p.optionnelle&&p.defautMO&&p.variantes.length===1&&p.variantes[0].parDefaut),'quatre prestations ERP, optionnelles, une proposition chacune');
const ordre=cat=>b.prestations.filter(p=>p.categorieId===cat).sort((x,y)=>x.ordre-y.ordre).map(p=>p.id);
const el=ordre('cat_electricite');
chk(el[el.indexOf('pr_options_electriques')+1]==='pr_erp_alarme_incendie'&&el[el.indexOf('pr_options_electriques')+2]==='pr_erp_eclairage_securite'
  &&el[el.indexOf('pr_ventilation_mecanique_controlee')+1]==='pr_erp_grilles_transfert','électricité : alarme et éclairage de sécurité après les options, grilles après la VMC');
chk(ordre(P[3].categorieId)[1]==='pr_erp_dossier','le dossier ERP suit les attestations de conformité');
const T=P.map(p=>p.variantes[0].texte);
chk(/\*\*type 4\*\*/.test(T[0])&&/déclencheur manuel/.test(T[0])&&/diffuseur sonore et lumineux/.test(T[0])&&/à confirmer/.test(T[0]),'alarme : type 4 à confirmer, déclencheur, diffuseurs, WC PMR');
chk(/BAES/.test(T[1])&&/notice de sécurité/.test(T[1]),'éclairage de sécurité : BAES, selon la notice de sécurité');
chk(/acoustique/.test(T[2])&&/étude de ventilation/.test(T[2]),'grilles de transfert acoustiques');
chk(/notice de sécurité incendie/.test(T[3])&&/notice d’accessibilité/.test(T[3]),'dossier ERP : notices de sécurité et d’accessibilité');
chk(T.every(t=>/\[à préciser\]/.test(t)),'ce qui est propre au projet reste [à préciser]');
chk(!T.some(t=>/€|prix|article|R\. ?\d|L\. ?\d/i.test(t)),'aucun prix, aucun article de loi inscrit');
chk(!P.some(p=>fautes(p).length),'sans faute signalée '+P.flatMap(fautes).join(' | '));
/* nouveau programme de maison : présentes, non incluses */
const prog=M.ptrNouveauProgramme(b,{prospectId:'p1'},'modele');
chk(IDS.every(id=>{const l=prog.lignes.find(x=>x.prestationId===id);return l&&!l.incluse}),'nouveau programme : les lignes ERP sont là, non incluses d’office');
/* migration depuis la révision 22 */
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r22))});
const mo=cat=>m.prestations.filter(p=>p.categorieId===cat).sort((x,y)=>x.ordre-y.ordre).map(p=>p.id);
const mel=mo('cat_electricite');
chk(m.seedRev===27&&IDS.every(id=>m.prestations.some(p=>p.id===id))&&mel.indexOf('pr_erp_alarme_incendie')===mel.indexOf('pr_options_electriques')+1
  &&mel.indexOf('pr_erp_grilles_transfert')===mel.indexOf('pr_ventilation_mecanique_controlee')+1,'révision 22 : les quatre prestations ERP arrivent à leur place');
chk(m.prestations.length===r22.prestations.length+4+7,'rien d’autre n’est ajouté ni retiré (+7 de la révision 27)');
fin();
