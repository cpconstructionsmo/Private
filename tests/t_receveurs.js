/* Receveurs : catalogue de référence (références sourcées, lien fabricant
   établi ou à confirmer, références divergentes signalées), ajout aux
   produits sans doublon ni écrasement, variante choisie dans la MAP et
   reprise dans les documents, codes Ébat Pro vérifiés ou non, import d'un
   export fournisseur, prix d'achat et prix public jamais confondus. */
const React=require('react');const TR=require('react-test-renderer');
const {charger,verif,texteInst,norm}=require('./harness');
const M=charger(['CATALOGUE_RECEVEURS','receveursVersProduits','varianteAlertes','varianteLibelle','varianteRefs','produitVariante',
  'importCsvLignes','importRapprocher','importAppliquer','ficheValeurActuelle','MAP_FICHE','genererMapDocx','zipEntree','lignesDocumentXml',
  'ChoixVariante','EMPTY']);
const {chk,fin}=verif();

const G=M.CATALOGUE_RECEVEURS;
const granite=G.find(g=>g.cle==='acquabella_compact_granite'), epur=G.find(g=>g.cle==='acquabella_compact_epur');
chk(granite.variantes.length===102&&epur.variantes.length===102,'Acquabella Compact : 102 variantes Granite, 102 Epur (fiche du dépôt)');
const toutes=G.flatMap(g=>g.variantes);
chk(new Set(toutes.map(v=>v.cle)).size===toutes.length,'une clé stable et unique par variante');
chk(toutes.filter(v=>v.refFabricant.lien==='etabli').length===194&&toutes.filter(v=>v.refFabricant.lien==='ordre').length===10,
  'lien avec la référence fabricant : 194 établis, 10 à confirmer');
const v1280=granite.variantes.find(v=>v.cle==='acq-granite-120x80-blanc');
chk(v1280&&v1280.refFabricant.ref==='53018931'&&v1280.refsPubliques.map(r=>r.ref).join()==='A10437761,A20670919','120 × 80 Granite blanc : réf. fabricant et deux références publiques relevées');
chk(v1280.refsPubliques[1].statut==='releve'&&/espace-aubade\.fr/.test(v1280.refsPubliques[1].source)&&v1280.refsPubliques[1].date==='2026-09-29','la référence du site garde sa source et sa date');
const fl=G.find(g=>g.cle==='jacob_delafon_flight').variantes[0], be=G.find(g=>g.cle==='bette_ultra_space').variantes[0];
chk(fl.refsPubliques[0].ref==='A03000542'&&fl.hauteur===40&&!fl.refFabricant.ref,'Flight : A03000542, 120 × 80 × 4 cm, pas de référence fabricant inventée');
chk(be.refsPubliques[0].ref==='A20762477'&&be.coloris==='Salvia'&&be.hauteur==='','BetteUltra Space : A20762477, Salvia, hauteur non inventée');
chk(!toutes.some(v=>v.codeEbat),'aucun code Ébat Pro dans le catalogue de référence');

/* ajout aux produits : idempotent, sans écraser une retouche */
let r=M.receveursVersProduits([],'acquabella_compact_granite');
const p=r.produits[0];
chk(r.ajoutees===102&&p.id==='prod_acquabella_compact_granite'&&p.lot==='Plomberie / sanitaire'&&p.variantes.every(v=>v.ebat.statut==='non_verifie'&&!v.codeEbat&&!Object.keys(v.prix).length),
  'ajout : 102 variantes, aucun code ni prix');
chk(p.caracteristiques.materiau.startsWith('Akron')&&/à vérifier/.test(p.caracteristiques.recoupable)&&p.fiches[0].lien.endsWith('.pdf'),'caractéristiques documentées, recoupe non documentée signalée, fiche jointe');
const retouche={...p,variantes:p.variantes.map((v,i)=>i===0?{...v,codeEbat:'EB123',note:'vu au devis'}:v).slice(0,100)};
r=M.receveursVersProduits([retouche],'acquabella_compact_granite');
chk(r.ajoutees===2&&r.produits.length===1&&r.produits[0].variantes.length===102&&r.produits[0].variantes[0].codeEbat==='EB123','compléter : ajoute les manquantes, garde les retouches');
chk(M.receveursVersProduits(r.produits,'acquabella_compact_granite').ajoutees===0,'une seconde fois : rien à ajouter');

/* alertes d'une variante */
const pr=r.produits[0], vv=pr.variantes.find(v=>v.cle==='acq-granite-120x80-blanc');
const A=M.varianteAlertes(vv,pr,{receveurDimensions:'90x120'});
chk(A.some(a=>/Ébat Pro non renseigné/.test(a))&&A.some(a=>/A10437761 \/ A20670919/.test(a))&&A.some(a=>/site public/.test(a))&&A.some(a=>/Dimensions saisies/.test(a)),
  'alertes : code manquant, références divergentes, relevé web, dimensions différentes');
chk(!M.varianteAlertes(vv,pr,{receveurDimensions:'120×80'}).some(a=>/Dimensions/.test(a)),'mêmes dimensions (dans l’autre ordre) : pas d’alerte');

/* import d'un export fournisseur */
const csv='Code article;Désignation;Réf. fabricant;Prix HT\n"EB-771";"Receveur Compact granite blanc 120x80 A10437761";53018931;"312,40 €"\nEB-900;Robinet inconnu;XYZ;12\n';
const lu=M.importCsvLignes(csv);
chk(lu.lignes.length===2&&lu.lignes[0].code==='EB-771'&&lu.lignes[0].prix===312.4,'CSV : colonnes reconnues, prix lu');
const rap=M.importRapprocher(pr,lu);
chk(rap.trouvees.length===1&&rap.trouvees[0].varId===vv.id&&rap.inconnues.length===1,'rapprochement par une référence commune ; l’inconnu est ignoré');
const pr2=M.importAppliquer(pr,rap.trouvees,'achatPro','Import export.csv');
const v2=pr2.variantes.find(v=>v.id===vv.id);
chk(v2.codeEbat==='EB-771'&&v2.ebat.statut==='verifie'&&v2.ebat.source==='Import export.csv'&&v2.prix.achatPro.montant===312.4&&!v2.prix.public,
  'appliqué : code vérifié par l’import, prix rangé comme prix d’achat pro — pas comme prix public');
const v3=M.importAppliquer(pr,rap.trouvees,'ignorer','x').variantes.find(v=>v.id===vv.id);
chk(v3.codeEbat==='EB-771'&&!Object.keys(v3.prix).length,'prix « à ignorer » : aucun prix enregistré');

/* MAP : la variante suit le produit, dans la fiche et le Word */
const data={...M.EMPTY,produits:[pr2],chantiers:[{id:'c1',nom:'Maison Exemple',client:'M. Exemple',
  map:{receveurProduit:pr2.id,receveurVariante:vv.id}}]};
const ch=data.chantiers[0];
const f=M.MAP_FICHE.flatMap(s=>s.f).find(x=>x.k==='receveurProduit');
chk(/Receveur Acquabella Compact — finition Granite — Acquabella — 120 × 80 cm · h 27 mm · blanc · Granite/.test(M.ficheValeurActuelle(f,ch.map,data)),'fiche préremplie : produit et variante');
(async()=>{
  const o=await M.genererMapDocx(ch,data);
  const t=norm(String(M.lignesDocumentXml(new TextDecoder().decode(await M.zipEntree(o.buffer.slice(o.byteOffset,o.byteOffset+o.byteLength),'word/document.xml')))));
  chk(/Receveur : .*120 × 80 cm.*réf\. fabricant 53018931.*Ébat Pro EB-771/.test(t),'Word : variante, références et code Ébat Pro');

  let enreg=null,tr;
  TR.act(()=>{tr=TR.create(React.createElement(M.ChoixVariante,{data,m:{...ch.map,receveurVariante:''},set:p=>{enreg=p},k:'receveurVariante',kProduit:'receveurProduit'}))});
  const sel=tr.root.findAll(n=>n.type==='select').find(n=>n.props.value===''&&!n.props['aria-label']);
  TR.act(()=>{sel.props.onChange({target:{value:vv.id}})});
  chk(enreg&&enreg.receveurVariante===vv.id,'écran : choisir une variante l’enregistre');
  TR.act(()=>{tr.update(React.createElement(M.ChoixVariante,{data,m:{...ch.map,receveurDimensions:'90×90'},set:p=>{enreg=p},k:'receveurVariante',kProduit:'receveurProduit'}))});
  const txt=norm(texteInst(tr.root));
  chk(/Dimensions saisies dans la MAP \(90×90\)/.test(txt)&&/Livré avec : Bonde/.test(txt),'écran : alerte de dimensions et accessoires livrés');
  const reprendre=tr.root.findAll(n=>n.type==='button').find(n=>/Reprendre dimensions/.test(texteInst(n)));
  TR.act(()=>{reprendre.props.onClick()});
  chk(enreg.receveurDimensions==='120×80'&&enreg.receveurColoris==='blanc','« Reprendre » : dimensions et coloris, sur demande seulement');
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
