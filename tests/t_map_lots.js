/* MAP par lot : reconnaissance des lots des marchés, choix et points de
   suivi de chaque lot, fiches Word, et suivi dans le compte-rendu de MAP. */
const React=require('react');const TR=require('react-test-renderer');
const {charger,verif,texteInst,norm,SORTIE}=require('./harness');
const M=charger(['mapGroupesLot','mapChampsDuLot','mapSuiviDuLot','genererFichesLots','genererMapDocx','zipEntree','lignesDocumentXml','SortiesMap','EMPTY']);
const {chk,fin}=verif();

chk(M.mapGroupesLot('Gros œuvre').includes('go')&&M.mapGroupesLot('Maçonnerie – GO').includes('go'),'« Gros œuvre », « Maçonnerie » : le gros œuvre');
chk(M.mapGroupesLot('Plomberie sanitaire').includes('sanit')&&M.mapGroupesLot('ÉLECTRICITÉ').includes('elec'),'accents et majuscules ignorés');
chk(!M.mapGroupesLot('Nettoyage de fin de chantier').length,'un lot sans mot-clé connu : non reconnu');
const elec=M.mapChampsDuLot('Électricité').map(f=>f.k);
chk(elec.includes('elecCoffret')&&elec.includes('electriciteGamme')&&elec.includes('vmcType')&&elec.includes('notes')&&!elec.includes('carrelageProduit')&&!elec.includes('soubassement'),
  'électricité : coffret, appareillage, VMC, observations — pas le carrelage ni le soubassement');
const go=M.mapChampsDuLot('Gros œuvre').map(f=>f.k);
chk(go.includes('soubassement')&&go.includes('enduitCouleur')&&go.includes('appuisFenetre')&&go.includes('modifGrosOeuvre')&&!go.includes('wcType'),'gros œuvre : substructure, enduit, appuis, modifications');

const suivi=[{id:'s1',type:'chiffrer',lot:'Plomberie',texte:'Robinet extérieur',statut:'ouvert'},
  {id:'s2',type:'decision',lot:'Gros œuvre',texte:'Seuil abaissé à la porte-fenêtre',statut:'fait',faitLe:'2026-09-20'},
  {id:'s3',type:'attente',lot:'',texte:'Réponse de la mairie',statut:'ouvert'}];
chk(M.mapSuiviDuLot({suivi},'Plomberie sanitaire').map(p=>p.id).join()==='s1'&&M.mapSuiviDuLot({suivi},'Maçonnerie').map(p=>p.id).join()==='s2',
  'suivi : le point va au lot écrit ou au même corps d’état ; un point sans lot n’est dans aucune fiche');

const data={...M.EMPTY,
  artisans:[{id:'a1',nom:'Maçonnerie Durand'},{id:'a2',nom:'Élec Martin'},{id:'a3',nom:'Net Pro'}],
  produits:[{id:'pr1',nom:'Appui Rexlan',marque:'Celtys',lot:'Gros œuvre'}],
  marches:[{id:'m1',chantierId:'c1',artisanId:'a1',lot:'Gros œuvre'},{id:'m2',chantierId:'c1',artisanId:'a2',lot:'Électricité'},
    {id:'m3',chantierId:'c1',artisanId:'a3',lot:'Nettoyage'},{id:'m4',chantierId:'c1',artisanId:'a3',lot:'Carrelage'}],
  chantiers:[{id:'c1',nom:'Maison Exemple',client:'M. Exemple',adresse:'1 rue du Test',
    map:{date:'2026-09-15',soubassement:'Vide sanitaire',vsTrappe:true,appuisFenetreProduit:'pr1',elecCoffret:'Posé',electriciteGamme:'Schneider Odace',
      electriciteOptions:['Alarme'],suivi}}]};
const ch=data.chantiers[0];
const texteDocx=async o=>norm(String(M.lignesDocumentXml(new TextDecoder().decode(await M.zipEntree(o.buffer.slice(o.byteOffset,o.byteOffset+o.byteLength),'word/document.xml')))));

(async()=>{
  const {fiches,ignores}=await M.genererFichesLots(ch,data);
  if(fiches[0])require('fs').writeFileSync(SORTIE+'/fiche_lot.docx',fiches[0].octets);
  chk(fiches.map(f=>f.lot).join()==='Gros œuvre,Électricité','une fiche pour le gros œuvre et l’électricité ; pas pour le carrelage (rien à dire)');
  chk(ignores.join()==='Nettoyage','le lot non reconnu est signalé');
  const tGO=await texteDocx(fiches[0].octets), tE=await texteDocx(fiches[1].octets);
  chk(/FICHE LOT/.test(tGO)&&/Maçonnerie Durand/.test(tGO)&&/du 15\/09\/2026/.test(tGO),'fiche gros œuvre : en-tête, entreprise, date de la MAP');
  chk(/Vide sanitaire/.test(tGO)&&/Appui Rexlan — Celtys/.test(tGO)&&/Trappe d’accès fonte 60×60/.test(tGO)&&!/Schneider/.test(tGO),'fiche gros œuvre : ses choix seulement');
  chk(/Seuil abaissé/.test(tGO)&&/Soldé le 20\/09\/2026/.test(tGO)&&!/Robinet/.test(tGO),'fiche gros œuvre : son point de suivi, avec son état');
  chk(/Schneider Odace/.test(tE)&&/Alarme/.test(tE)&&/Posé/.test(tE)&&!/Vide sanitaire/.test(tE),'fiche électricité : ses choix seulement');
  chk(fiches[0].nom==='Fiche lot — Gros œuvre — Maison Exemple.docx','nom du fichier');

  const tMap=await texteDocx(await M.genererMapDocx(ch,data));
  chk(/Décisions, modifications à chiffrer et points en attente/.test(tMap)&&/Robinet extérieur/.test(tMap)&&/Réponse de la mairie/.test(tMap)&&/À chiffrer/.test(tMap),
    'compte-rendu de MAP : tout le suivi, avec sa nature');

  let enreg=null,tr;
  TR.act(()=>{tr=TR.create(React.createElement(M.SortiesMap,{data,ch,m:ch.map,set:p=>{enreg=p}}))});
  const bouton=tr.root.findAll(n=>n.type==='button').find(n=>/Sortir les fiches par lot/.test(texteInst(n)));
  await TR.act(async()=>{await bouton.props.onClick()});
  const t=norm(texteInst(tr.root));
  chk(enreg&&enreg.fichesLotsLe&&/2 fiches/.test(t)&&/Gros œuvre — Maçonnerie Durand/.test(t)&&/Lots non reconnus \(aucune fiche\) : Nettoyage/.test(t),
    'le bouton produit les fiches et le dit');
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
