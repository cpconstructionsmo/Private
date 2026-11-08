/* Programme technique › « Rapprocher avec la vente » : le chiffrage remis au
   client (PDF ou Word) est lu puce par puce, chaque puce est mise en face des
   prestations du programme ; les écarts (épaisseur, teinte, marque, fiche
   d'un autre fabricant), les postes vendus absents et ceux que la vente ne
   cite pas sont proposés à la correction, appliquée d'un clic. Le type
   d'ouvrage « ERP » ajoute ses équipements et signale ce qui parle encore
   d'un logement. Chiffrage et projet fictifs. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['ProgrammeTechnique','venteLignes','ptrRapprochement','ptrAppliquerVente','ptrBiblioInitiale','ptrNouveauProgramme',
  'ptrProgrammePour','ptrInclurePrestations','ptrAlertesUsage','ptrMentionsPour','ptrControles','ptrTexteSelonOuvrage','lireChiffrageVente',
  'fabriquerDocx','par','DOC_ENTETE_XML','EMPTY']);
const {chk,fin}=verif();

/* un chiffrage fictif, tel que pdf.js le met à plat : une seule ligne */
const NOTICE=['Isolation intérieure par doublage Optima en 120 mm (envisagé)',
  'Chauffage par pompe à chaleur air/air de type T-One AquaAIR de chez Aldes (envisagé)',
  'Porte d’entrée en acier laqué Abscisse EVO de chez Bel’m (envisagé)',
  'Menuiseries PVC RAL blanc (envisagé)',
  'Charpente 35°, couverture en tuiles minérales Monier teinte sombre (envisagé)',
  'Fourniture et pose d’un enrobé noir 0/10 pour une surface de 60 m² environ (envisagé)',
  'Equipement d’alarme (incendie) type 4 avec déclencheur manuel près de la sortie',
  'Diffuseur sonore et lumineux pour le WC PMR, raccordé à l’alarme',
  'Dossier ERP 5, établissement recevant du public',
  'Établissement du dossier de permis de construire (PC)'];
const PDF='Chiffrage au 01/01/2026 PROPOSITION DE MISSION 1. NOTICE de PRESENTATION TECHNIQUE DU PROJET ENVISAGÉ Les éléments techniques ci-dessous décrivent le projet. '
  +NOTICE.map(x=>'•​ '+x).join(' ')+' Coût prévisionnel des travaux (à titre indicatif) : 100 000 € TTC 2. MISSION DE MAÎTRISE D’ŒUVRE CONFIÉE • Suivi et coordination de chantier';

/* 1. les puces de la notice */
const L=M.venteLignes(PDF);
chk(L.length===10&&L[0]==='Isolation intérieure par doublage Optima en 120 mm'&&!L.some(x=>/envisag|Coût|Suivi et coordination|NOTICE|éléments techniques/.test(x)),
  'dix puces lues, « (envisagé) » retiré, ni titre ni coût ni mission : '+L.length);
const L2=M.venteLignes('1. NOTICE TECHNIQUE\nLes éléments techniques ci-dessous…\nMenuiseries PVC RAL blanc (envisagé)\nVolets roulants électriques\nCoût prévisionnel : 1 €');
chk(L2.join('|')==='Menuiseries PVC RAL blanc|Volets roulants électriques','sans puces (Word), une ligne par paragraphe');

/* 2. le rapprochement, sur le modèle Maison neuve */
const b=M.ptrBiblioInitiale();
let prog=M.ptrNouveauProgramme(b,{prospectId:'p1'},'modele');
let R=M.ptrRapprochement(prog,b,L);
const groupe=re=>R.ecarts.find(g=>re.test(g.ligne.titre||g.ligne.nom));
const dbl=groupe(/^DOUBLAGE/);
chk(dbl&&dbl.ecarts.some(e=>/Vendu : 120 mm/.test(e.msg)),'doublage : 120 mm vendus, le programme dit autre chose');
const pac=groupe(/POMPE/);
const vAldes=b.prestations.find(p=>p.id==='pr_pompe_a_chaleur').variantes.find(v=>/Aldes/.test(v.nom));
chk(pac&&pac.ecarts.some(e=>/Marque vendue : Aldes/.test(e.msg))&&pac.actions.some(a=>a.type==='variante'&&a.varianteId===vAldes.id),
  'pompe à chaleur : Aldes vendue, la proposition Aldes de la bibliothèque est proposée');
const pe=groupe(/PORTE D'ENTRÉE/);
chk(pe&&pe.actions.some(a=>a.type==='variante'&&/Abscisse/.test(a.libelle)),'porte d’entrée : la proposition Bel’M Abscisse est proposée');
const men=groupe(/CHÂSSIS/);
chk(men&&men.ecarts.some(e=>/Teinte vendue : blanc/.test(e.msg)),'menuiseries : RAL blanc vendu, le programme dit une autre teinte');
const cv=groupe(/^COUVERTURE/);
chk(cv&&cv.ecarts.some(e=>/Marque vendue : Monier/.test(e.msg))&&!R.ecarts.some(g=>/CHARPENTE/.test(g.ligne.titre)&&g.ecarts.some(e=>/Monier/.test(e.msg))),
  'couverture : Monier vendue ; la charpente (même puce) ne se compare pas à Monier');
const al=groupe(/ALARME/);
chk(al&&al.ventes.length===2&&al.actions.some(a=>a.type==='inclure'),'alarme : deux puces, une seule carte, « Inclure » proposé');
chk(R.absents.some(a=>/enrobé/.test(a.texte)&&a.categorieId==='cat_preparation_du_terrain'&&!a.prestationId),'enrobé : vendu, absent, proposé en préparation du terrain');
chk(R.mission.some(m=>/permis de construire/.test(m.texte))&&!R.absents.some(a=>/permis/.test(a.texte)),'le permis de construire relève de la mission, hors programme');
chk(R.nonVendues.some(x=>x.ligne.prestationId==='pr_porte_garage')&&!R.nonVendues.some(x=>x.ligne.prestationId==='pr_implantation'),
  'à confirmer : la porte de garage ; pas l’implantation, que toute construction comporte');
chk(R.erp===true,'la vente décrit un ERP');

/* une fiche jointe d'un autre fabricant que celui du texte */
const lc=prog.lignes.find(l=>l.prestationId==='pr_couverture');
const avecFiche={...prog,lignes:prog.lignes.map(l=>l.id===lc.id?{...l,texte:'Tuiles MONIER Nobilée, coloris noir.',
  pieces:[{id:'x',nom:'Fiche produit Edilians Double HP 20 Huguenot.pdf'}]}:l)};
const Rf=M.ptrRapprochement(avecFiche,b,L);
chk(Rf.ecarts.find(g=>g.ligne.id===lc.id).ecarts.some(e=>e.type==='fiche'&&/Edilians/.test(e.msg)),'fiche jointe Edilians sous un texte Monier : signalée');

/* 3. les actions, une à une */
prog=M.ptrAppliquerVente(prog,b,pac.actions.find(a=>a.type==='variante'),null);
chk(prog.lignes.find(l=>l.prestationId==='pr_pompe_a_chaleur').varianteId===vAldes.id,'proposition Aldes appliquée');
prog=M.ptrAppliquerVente(prog,b,al.actions.find(a=>a.type==='inclure'),null);
chk(prog.lignes.find(l=>l.prestationId==='pr_erp_alarme_incendie').incluse,'alarme incluse');
const enr=R.absents.find(a=>/enrobé/.test(a.texte));
prog=M.ptrAppliquerVente(prog,b,{type:'ajouter',categorieId:enr.categorieId},enr);
const le=prog.lignes.find(l=>/enrobé/.test(l.texte||''));
chk(le&&le.categorieId==='cat_preparation_du_terrain'&&le.incluse&&le.titre==='ENROBÉ ET REGARD'&&/^Fourniture et pose d’un enrobé noir/.test(le.texte),
  'enrobé ajouté en ligne personnalisée, avec le texte vendu');
prog=M.ptrAppliquerVente(prog,b,{type:'exclure',ligneId:prog.lignes.find(l=>l.prestationId==='pr_porte_garage').id},null);
R=M.ptrRapprochement(prog,b,L);
chk(!R.ecarts.some(g=>/POMPE/.test(g.ligne.titre))&&!R.absents.some(a=>/enrobé/.test(a.texte))
  &&!R.nonVendues.some(x=>x.ligne.prestationId==='pr_porte_garage'),'après les actions : PAC conforme, enrobé au programme, garage exclu');
chk(!R.ecarts.some(g=>/ALARME/.test(g.ligne.titre)),'alarme incluse : plus rien à revoir');

/* 4. le type d'ouvrage ERP */
let p2={...M.ptrNouveauProgramme(b,{prospectId:'p1'},'modele'),typeOuvrage:'erp5'};
chk(M.ptrAlertesUsage(p2).some(a=>a.mots.indexOf('garage')>=0),'ERP : les lignes qui parlent de garage sont signalées');
chk(M.ptrControles(p2,{client:'X',adresseChantier:'Y'}).some(c=>!c.ok&&/l’ouvrage est un ERP/.test(c.msg)),'… et le contrôle avant export le dit');
const Mn=M.ptrMentionsPour(b,p2);
chk(Mn.sousTitre==='Établissement recevant du public — 5e catégorie'&&/^Votre bâtiment a été conçu et sera construit/.test(Mn.re2020),'page de garde : « bâtiment », pas « maison »');
chk(M.ptrMentionsPour(b,{typeOuvrage:'maison'}).sousTitre==='Ouvrage à usage d’habitation','une maison garde ses mentions');
chk(M.ptrTexteSelonOuvrage('nécessaires à l’habitabilité complète du logement','erp5')==='nécessaires à l’usage complet du bâtiment','synthèse : plus de « logement »');
p2=M.ptrInclurePrestations(p2,b,['pr_erp_alarme_incendie','pr_erp_eclairage_securite','pr_erp_grilles_transfert','pr_erp_dossier']);
const el=p2.lignes.filter(l=>l.categorieId==='cat_electricite').map(l=>l.prestationId);
chk(['pr_erp_alarme_incendie','pr_erp_eclairage_securite','pr_erp_grilles_transfert','pr_erp_dossier'].every(id=>p2.lignes.find(l=>l.prestationId===id).incluse)
  &&el.indexOf('pr_erp_alarme_incendie')===el.indexOf('pr_options_electriques')+1,'prestations ERP incluses, à leur place');

/* 5. à l'écran */
(async()=>{
  const pA={id:'pA',nom:'Local fictif',civilite:'M.',client:'Fictif',adresseClient:'1 rue A',commune:'Ville fictive'};
  let data={...M.EMPTY,prospects:[pA],programmes:[{...M.ptrNouveauProgramme(b,{prospectId:'pA'},'modele')}]};
  let tr;const cible={prospectId:'pA',chantierId:null};
  const monter=()=>React.createElement(M.ProgrammeTechnique,{data,save:d=>{data=d;TR.act(()=>{tr.update(monter())})},cible});
  TR.act(()=>{tr=TR.create(monter())});
  const t=()=>norm(texteInst(tr.root));
  const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
  TR.act(()=>{btn(/^Rapprocher avec la vente/).props.onClick()});
  chk(/Déposer le chiffrage vendu \(PDF ou Word\)/.test(t()),'le rapprochement propose de déposer le chiffrage');
  /* un Word fictif : puces « • » comme le dossier de présentation de l'application */
  const xml=M.DOC_ENTETE_XML+'<w:body>'+M.par('1. NOTICE de PRESENTATION TECHNIQUE DU PROJET ENVISAGÉ')
    +NOTICE.map(x=>M.par('•  '+x)).join('')+M.par('Coût prévisionnel des travaux : 100 000 € TTC')+'</w:body></w:document>';
  const docx=await M.fabriquerDocx(xml,'Chiffrage fictif');
  const champ=tr.root.findAll(n=>n.type==='input'&&n.props.type==='file').find(n=>/Déposer le chiffrage/.test(norm(texteInst(n.parent))));
  await TR.act(async()=>{await champ.props.onChange({target:{files:[new File([docx],'chiffrage fictif.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})],value:''}})});
  let pg=M.ptrProgrammePour(data,cible);
  chk(pg.vente&&pg.vente.lignes.length===10&&pg.vente.nom==='chiffrage fictif.docx','Word déposé : ses dix puces gardées avec le programme');
  chk(/Chiffrage « chiffrage fictif\.docx » lu le/.test(t())&&/lignes? à revoir/.test(t())&&/Vendu, absent du programme/.test(t())&&/à confirmer/.test(t()),
    'l’écran : à revoir, absents, à confirmer');
  chk(/La vente décrit un établissement recevant du public/.test(t()),'la vente ERP est repérée sur un programme de maison');
  TR.act(()=>{btn(/Passer le type d’ouvrage en ERP/).props.onClick()});
  chk(M.ptrProgrammePour(data,cible).typeOuvrage==='erp5','un clic : le programme passe en ERP');
  TR.act(()=>{btn(/Passer à la proposition « Aldes/).props.onClick()});
  pg=M.ptrProgrammePour(data,cible);
  chk(pg.lignes.find(l=>l.prestationId==='pr_pompe_a_chaleur').varianteId===vAldes.id,'clic : la proposition Aldes remplace la PAC');
  const avant=(t().match(/Ignorer/g)||[]).length;
  TR.act(()=>{btn(/^Ignorer$/).props.onClick()});
  chk(M.ptrProgrammePour(data,cible).venteIgnores.length===1&&(t().match(/Ignorer/g)||[]).length===avant-1,'« Ignorer » retire la remarque, et s’en souvient');
  TR.act(()=>{btn(/^Fermer$/).props.onClick()});
  /* le type d'ouvrage, depuis l'éditeur */
  chk(/Établissement recevant du public : ces équipements ne sont pas encore au programme/.test(t())&&/parlent encore d’un logement/.test(t()),
    'ERP : équipements manquants et textes de logement signalés');
  TR.act(()=>{btn(/^Ajouter les \d+ prestations ERP$/).props.onClick()});
  pg=M.ptrProgrammePour(data,cible);
  chk(['pr_erp_alarme_incendie','pr_erp_eclairage_securite','pr_erp_grilles_transfert','pr_erp_dossier'].every(id=>pg.lignes.some(l=>l.prestationId===id&&l.incluse)),
    'un clic : les prestations ERP sont au programme');
  TR.act(()=>tr.unmount());
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
