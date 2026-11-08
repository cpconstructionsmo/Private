/* Révision 27 : le reste de ce qu'il faut à un ERP de 5e catégorie —
   dispositions électriques, extincteurs et consignes, portes et repères
   accessibles, sanitaire accessible, réaction au feu, stationnement et
   cheminement accessibles, contrôles avant ouverture. Optionnelles : un
   programme de maison ne les inclut pas ; le type d'ouvrage « ERP » les
   propose avec les quatre de la révision 23. Aucune règle réglementaire
   chiffrée ni article inscrit : tout renvoie aux notices et au contrôleur. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['ProgrammeTechnique','ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','ptrNouveauProgramme','ptrInclurePrestations','ptrProgrammePour','EMPTY']);
const {chk,fin}=verif();
const r26=biblioRev('rev26');
const b=M.ptrBiblioInitiale();
const IDS=['erp_electricite','erp_extincteurs','erp_portes_accessibles','erp_sanitaire_accessible','erp_reaction_feu','erp_exterieurs_accessibles','erp_verifications'];
const P=IDS.map(id=>b.prestations.find(p=>p.id==='pr_'+id));
chk(P.every(p=>p&&p.optionnelle&&p.defautMO&&p.variantes.length===1&&p.variantes[0].parDefaut),'sept prestations ERP, optionnelles, une proposition chacune');
const ordre=cat=>b.prestations.filter(p=>p.categorieId===cat).sort((x,y)=>x.ordre-y.ordre).map(p=>p.id);
const apres=(id,avant)=>{const p=b.prestations.find(x=>x.id==='pr_'+id);const o=ordre(p.categorieId);return o[o.indexOf('pr_'+id)-1]==='pr_'+avant};
chk(apres('erp_electricite','erp_eclairage_securite')&&apres('erp_extincteurs','erp_electricite')&&apres('erp_portes_accessibles','portes_interieures_galandage')
  &&apres('erp_sanitaire_accessible','wc')&&apres('erp_reaction_feu','peintures')&&apres('erp_exterieurs_accessibles','eaux_pluviales')&&apres('erp_verifications','erp_dossier'),
  'chacune à sa place : électricité, plâtrerie, plomberie, revêtements, VRD, contrôles');
const T=Object.fromEntries(IDS.map((id,i)=>[id,P[i].variantes[0].texte]));
chk(/coupure générale d’urgence/.test(T.erp_electricite)&&/NF C 15-100/.test(T.erp_electricite),'électricité : coupure d’urgence, tableau protégé');
chk(/eau pulvérisée/.test(T.erp_extincteurs)&&/CO2/.test(T.erp_extincteurs)&&/plan d’évacuation/.test(T.erp_extincteurs),'extincteurs, CO2 près du tableau, plan et consignes');
chk(/largeur de passage/.test(T.erp_portes_accessibles)&&/parois vitrées/.test(T.erp_portes_accessibles),'portes accessibles, repérage des vitrages');
chk(/barre d’appui/.test(T.erp_sanitaire_accessible)&&/lave-mains accessible/.test(T.erp_sanitaire_accessible)&&/décondamnable/.test(T.erp_sanitaire_accessible),'sanitaire accessible');
chk(/réaction au feu/.test(T.erp_reaction_feu)&&/Procès-verbaux/.test(T.erp_reaction_feu),'réaction au feu, procès-verbaux remis');
chk(/stationnement adaptée/.test(T.erp_exterieurs_accessibles)&&/cheminement extérieur accessible/.test(T.erp_exterieurs_accessibles),'stationnement et cheminement accessibles');
chk(/vérification initiale des installations électriques/.test(T.erp_verifications)&&/attestation de prise en compte des règles d’accessibilité/.test(T.erp_verifications)
  &&/registre de sécurité/.test(T.erp_verifications),'contrôles avant ouverture : électricité, accessibilité, registres');
chk(IDS.every(id=>/notice|contrôleur|bureau de contrôle|\[à (préciser|confirmer)/.test(T[id])),'tout renvoie aux notices, au contrôleur ou reste à préciser');
chk(!IDS.some(id=>/€|prix|article|R\. ?\d|L\. ?\d|arrêté|\d+ ?(lux|N\b|cm|m²)/i.test(T[id])),'aucun prix, aucun article ni seuil réglementaire chiffré');
/* « chambre de tirage » n'est pas une chambre de logement */
const MU=charger(['ptrMotsLogement']);
chk(!MU.ptrMotsLogement({titre:'RACCORDEMENTS',texte:'Grillage avertisseur et chambre de tirage si nécessaire.'}).length
  &&MU.ptrMotsLogement({titre:'X',texte:'Une chambre de 12 m².'}).join()==='chambre','« chambre de tirage » n’est pas signalé, une chambre l’est');
const fautes=P.flatMap(pr=>M.ptrAlertesPrestation(pr,b).filter(x=>/faute|accent|colle|dim:|espaces|unite/.test(x.cle)).map(x=>x.msg));
chk(!fautes.length,'sans faute signalée '+fautes.join(' | '));
/* nouveau programme de maison : présentes, non incluses */
const prog=M.ptrNouveauProgramme(b,{prospectId:'pA'},'modele');
chk(IDS.every(id=>{const l=prog.lignes.find(x=>x.prestationId==='pr_'+id);return l&&!l.incluse}),'programme de maison : les lignes ERP sont là, non incluses');
/* migration depuis la révision 26 */
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r26))});
chk(m.seedRev===28&&IDS.every(id=>m.prestations.some(p=>p.id==='pr_'+id))&&m.prestations.length===r26.prestations.length+7,'révision 26 : les sept prestations arrivent, rien d’autre');
const mo=cat=>m.prestations.filter(p=>p.categorieId===cat).sort((x,y)=>x.ordre-y.ordre).map(p=>p.id);
const ms=mo('cat_plomberie');
chk(ms.indexOf('pr_erp_sanitaire_accessible')===ms.indexOf('pr_wc')+1,'migrée : le sanitaire accessible suit les WC');
/* à l'écran : en ERP, le programme propose d'un clic les onze équipements */
(async()=>{
  const pA={id:'pA',nom:'Local fictif',client:'Fictif',commune:'Ville fictive'};
  let data={...M.EMPTY,prospects:[pA],programmes:[{...prog,typeOuvrage:'erp5'}]};
  let tr;const cible={prospectId:'pA',chantierId:null};
  const monter=()=>React.createElement(M.ProgrammeTechnique,{data,save:d=>{data=d;TR.act(()=>{tr.update(monter())})},cible});
  TR.act(()=>{tr=TR.create(monter())});
  const t=()=>norm(texteInst(tr.root));
  chk(/Établissement recevant du public : ces équipements ne sont pas encore au programme/.test(t())&&/sanitaire accessible/.test(t())&&/contrôles et vérifications avant ouverture/.test(t()),
    'en ERP, le programme liste les équipements manquants, dont les nouveaux');
  const btn=tr.root.findAll(n=>n.type==='button').find(n=>/^Ajouter les 11 prestations ERP$/.test(norm(texteInst(n))));
  chk(!!btn,'un bouton pour les inclure : '+(btn?norm(texteInst(btn)):'absent'));
  if(btn)TR.act(()=>{btn.props.onClick()});
  const pg=M.ptrProgrammePour(data,cible);
  chk(IDS.every(id=>pg.lignes.find(l=>l.prestationId==='pr_'+id).incluse),'d’un clic, les sept nouvelles prestations sont incluses');
  TR.act(()=>tr.unmount());
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
