/* Plan électrique, sources et contrôles, sur des données fictives : les
   noms de pièces lus dans le texte d'un PDF d'architecte (avec leur
   surface), jamais inventés sur un scan ; deux documents qui se
   contredisent (la décision est tracée, la quantité retenue appliquée) ;
   des règles réglementaires saisies avec leur source, contrôlées à part du
   DQE ; la publication pour validation client, sans rien d'interne. */
const {charger,verif}=require('./harness');
const M=charger(['elecEtiquettesPlan','elecControleReglementaire','elecComparerDqe','elecRetenirQuantite','elecLireDQE','elecAffecterPieces',
  'elecBaseDepuisDQE','elecPublication','elecAbrege']);
const {chk,fin}=verif();

/* les noms de pièces d'un PDF vectoriel */
const E=M.elecEtiquettesPlan([{s:'Espace jour',x:.3,y:.4},{s:'27,83 m²',x:.3,y:.43},{s:'Chambre 1',x:.7,y:.3},{s:'10,52 m²',x:.7,y:.33},
  {s:'WC',x:.5,y:.5},{s:'Carrelage',x:.3,y:.46},{s:'410',x:.2,y:.2},{s:'RDC : Plan Implantation',x:.1,y:.9},{s:'Cellier',x:.55,y:.2}]);
chk(E.length===4&&E.map(e=>e.type).join()==='Séjour,Chambre,WC,Cellier / buanderie','quatre pièces reconnues, cotes et matériaux ignorés');
chk(E[0].surface===27.83&&E[1].surface===10.52&&E[2].surface===undefined,'surface lue à côté du nom quand elle y est');
chk(!M.elecEtiquettesPlan([]).length,'un scan (sans texte) : aucune pièce inventée');

/* deux documents */
const T=l=>({type:'titre',libelle:l});let n=0;const A=(c,l,q)=>({id:'l'+(n++),type:'article',code:c,libelle:l,unite:'U',qt:q,pu:50});
const dqe=M.elecLireDQE([T('CUISINE :'),A('C1','Prise 10/16 A + T',7),A('C2','Prise 16/20 A + T',3),T('SEJOUR :'),A('S1','Prise 10/16 A + T',10)],{nom:'Marché'});
const desc=M.elecLireDQE([T('Cuisine :'),A('X1','Prise 10/16 A + T',8),A('X2','Prise 16/20 A + T',3),T('Séjour :'),A('X3','Prise 10/16 A + T',10)],{nom:'Descriptif'});
const D=M.elecComparerDqe(dqe,desc);
chk(D.length===1&&D[0].piece==='CUISINE'&&D[0].a===7&&D[0].b===8,'une seule contradiction : cuisine, DQE 7 prises, descriptif 8');
const pieces=[{id:'pC',type:'Cuisine',nom:'Cuisine',x0:0,y0:0,x1:.4,y1:.4},{id:'pS',type:'Séjour',nom:'Séjour',x0:.5,y0:0,x1:1,y1:.5}];
const base={source:'dqe',dqe:{...dqe,affect:M.elecAffecterPieces(dqe,pieces)},lignes:M.elecBaseDepuisDQE(dqe,M.elecAffecterPieces(dqe,pieces))};
const b2=M.elecRetenirQuantite(base,D[0],8);
const q=b2.lignes.filter(l=>l.piece==='pC'&&l.type==='pc');
chk(q.length===1&&q[0].qte===8&&q[0].origine==='decision'&&b2.lignes.find(l=>l.piece==='pS'&&l.type==='pc').qte===10,'retenir le descriptif : la cuisine passe à 8, le reste ne bouge pas');

/* règles réglementaires : saisies, versionnées, contrôlées à part */
const S=[{id:'1',type:'pc',x:.1,y:.1},{id:'2',type:'pc',x:.2,y:.1,mecanismes:2},{id:'3',type:'fumee',x:.6,y:.2},{id:'4',type:'pc',x:.95,y:.65}];
const plan={pieces:[...pieces,{id:'pB',type:'Salle de bains',nom:'Salle de bains',x0:.9,y0:.6,x1:1,y1:.7}],symboles:S};
const regles=[{id:'r1',norme:'Norme fictive',version:'v1',dateApplication:'2025-01-01',typeLogement:'Maison',pieceType:'Cuisine',type:'pc',min:6,regle:'Au moins 6 prises en cuisine (exemple)',source:'Source fictive',verifieeLe:'2026-09-01'},
  {id:'r2',norme:'Norme fictive',pieceType:'Séjour',type:'pc',min:1,source:'X'},{id:'r3',type:'pc',min:99,active:false}];
const R=M.elecControleReglementaire(plan,regles);
const rc=R.find(r=>r.regle&&r.regle.id==='r1');
chk(rc&&rc.compte===3&&/Point à vérifier/.test(rc.msg)&&/Norme fictive, v1, Source fictive, vérifiée le/.test(rc.msg),'cuisine : 3 prises (une double) pour 6 — point à vérifier, avec norme, version, source, date');
chk(R.some(r=>r.regle&&r.regle.id==='r2'&&r.pieceNom==='Séjour'),'séjour sans prise : signalé');
chk(!R.some(r=>r.regle&&r.regle.id==='r3'),'une règle désactivée ne s’applique pas');
chk(R.some(r=>!r.regle&&/Contrôle technique requis/.test(r.msg)&&r.pieceNom==='Salle de bains'),'prise en salle de bains : ⚠️ contrôle technique requis');
chk(!M.elecControleReglementaire(plan,[]).some(r=>r.regle),'sans règle saisie : aucune exigence inventée');

/* la publication pour le client */
const P=M.elecPublication({nom:'Maison Fictive'},{fond:'fond1',ratio:.7,indice:'B',pieces,symboles:[...S,{id:'z',type:'vr',aPlacer:true,x:null,y:null}],
  cables:[{id:'c',de:'1',vers:'2'}]},'C');
chk(P.indice==='C'&&P.symboles.length===4&&P.symboles[0].ab==='PC'&&P.symboles[0].piece==='Cuisine'&&P.cables.length===1&&P.legende.length===2,
  'publication : indice, symboles posés (pas les « à placer »), pièce, liaisons, légende');
chk(!/article|categorie|note|statut|verrou|base|dqe/i.test(JSON.stringify(P)),'rien d’interne (articles, statuts, DQE) dans ce que voit le client');
fin();
