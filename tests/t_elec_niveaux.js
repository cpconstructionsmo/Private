/* Plusieurs niveaux, l'escalier qui les relie, et les modèles de disposition
   CP, sur une maison fictive à étage (RDC + étage, chacun dans son propre
   repère, coordonnées volontairement superposées d'un niveau à l'autre) et
   un DQE fictif : le programme du logement est réparti sur toute la maison
   (les volets de l'étage vont à l'étage), chaque niveau est posé dans son
   repère, l'escalier reçoit sa commande en bas ET en haut, reliées au point
   lumineux par une liaison entre niveaux ; régénérer un niveau ne touche
   pas l'autre ; un modèle « Chambre CP » s'applique à une chambre tournée
   autrement. */
const {charger,verif}=require('./harness');
const M=charger(['elecLireDQE','elecAffecterPieces','elecBaseDepuisDQE','elecGenererMaison','elecGenererPlan','elecGenerationUnique','elecResumeGeneration',
  'elecPlanMaison','elecNiveaux','elecEscaliers','elecControle','elecValiderPlan','elecPieceDe','elecCanon','elecDecanon','elecMurCanon','elecMurDecanon',
  'elecDispositionDepuisPiece','elecDispositionPour','ELEC_ESPACE','ELEC_COMMANDES','ELEC_ECLAIRAGES','elecTitreDQE','elecPublication','elecPlanPourIndice','elecIndicePourSortie']);
const {chk,fin}=verif();
const H=0.74;
const P=(id,type,nom,x0,y0,x1,y1,portes,fenetres,extra)=>({id,type,nom,x0,y0,x1,y1,portes:portes||[],fenetres:fenetres||[],...(extra||{})});
const d=(id,cote,x,y,poignee)=>({id,cote,x,y,poignee});
const f=(id,cote,x,y)=>({id,cote,x,y,vr:true});
const rdc=[
  P('cel','Cellier / buanderie','Cellier',.20,.15,.32,.35,[d('d1','bas',.26,.35,'gauche')]),
  P('gar','Garage','Garage',.20,.35,.35,.70,[d('d2','droite',.35,.62,'droite')]),
  P('cui','Cuisine','Cuisine',.32,.15,.50,.35,[d('d4','droite',.50,.30,'gauche')],[f('f1','haut',.41,.15)]),
  P('sej','Séjour','Séjour',.50,.15,.80,.50,[d('d5','bas',.56,.50,'droite')],[f('f2','haut',.60,.15),f('f3','haut',.72,.15)]),
  P('ent','Entrée','Entrée',.35,.55,.45,.70,[d('d6','bas',.40,.70,'gauche'),d('d7','droite',.45,.60,'droite')]),
  P('deg','Dégagement','Dégagement',.45,.50,.62,.58,[d('d8','haut',.50,.50,'gauche')]),
  P('wc','WC','WC',.55,.58,.62,.66,[d('d11','haut',.585,.58,'gauche')]),
  P('esc0','Escalier','Escalier (RDC)',.62,.50,.70,.66,[d('d15','gauche',.62,.54,'droite')],[],{relie:{niveau:'n1',piece:'esc1'}})];
const etage=[
  P('pal','Dégagement','Palier',.40,.40,.62,.48,[d('e1','droite',.62,.44,'gauche')]),
  P('ch1','Chambre','Chambre 1',.20,.15,.40,.40,[d('e2','bas',.30,.40,'gauche')],[f('f4','haut',.30,.15)]),
  P('ch2','Chambre','Chambre 2',.40,.15,.60,.40,[d('e3','bas',.50,.40,'droite')],[f('f5','haut',.50,.15)]),
  P('ch3','Chambre','Chambre 3',.20,.48,.40,.75,[d('e4','haut',.30,.48,'gauche')],[f('f6','bas',.30,.75)]),
  P('sdb','Salle de bains','Salle de bains',.40,.48,.55,.66,[d('e5','haut',.47,.48,'gauche')]),
  P('esc1','Escalier','Escalier (étage)',.62,.40,.70,.56,[])];
const T=l=>({type:'titre',libelle:l});let n=0;const A=(c,l,q,pu)=>({id:'l'+(n++),type:'article',code:c,libelle:l,unite:'U',qt:q,pu:pu||50});
const DQE=M.elecLireDQE([T('151 ELECTRICITÉ'),A('B_TAB','Tableau et distribution',1,1200),A('B_COM','Tableau communication grade 3',1,400),
  T('EXTERIEUR:'),A('X_EXT_ASA','Applique accès entrée (SA à témoin)',1),
  T('ENTREE:'),A('X_ENT_CVV','Point lumineux (V et V)',1),A('X_ENT_P16','Prise 10/16 A + T',1),
  T('DEGAGEMENT:'),A('X_DEG_CVV','Point lumineux (V et V)',1),
  T('ESCALIER :'),A('X_ESC_CVV','Point lumineux (V et V)',1),
  T('PALIER :'),A('X_PAL_CVV','Point lumineux (V et V)',1),A('X_PAL_P16','Prise 10/16 A + T',1),
  T('CUISINE :'),A('X_CUI_CVV','Point lumineux (V et V)',1),A('X_CUI_P16','Prise 10/16 A + T',6),A('X_CUI_P20','Prise 16/20 A + T',2),A('X_CUI_P32','Alimentation 32 A + T',1),
  T('SALLE DE BAINS:'),A('X_SDB_CSA','Point lumineux (SA)',1),A('X_SDB_P16','Prise 10/16 A + T',2),
  T('WC:'),A('X_WC_CSA','Point lumineux (SA)',1),
  T('SEJOUR:'),A('X_SEJ_CVV','Point lumineux (V et V)',2),A('X_SEJ_P16','Prise 10/16 A + T',8),
  T('CHAMBRES 1, 2 ET 3:'),A('X_CH_CVV','Point lumineux (V et V)',3),A('X_CH_P16','Prise 10/16 A + T',9),A('X_CH_RJ','Prise communication (GR3)',3),
  T('CELLIER :'),A('X_CEL_CVV','Point lumineux (V et V)',1),A('X_CEL_P20','Prise 16/20 A + T',2),
  T('GARAGE :'),A('X_GAR_CVV','Point lumineux (V et V)',1),A('X_GAR_P16','Prise 10/16 A + T',1),
  T('AUTRES :'),A('X_PAC','Alimentation pompe à chaleur',1),A('X_VR','Alimentation volet roulant',6),A('X_IRVE','Borne de recharge',1)],{nom:'DQE fictif'});
chk(M.elecTitreDQE('ESCALIER :').type==='Escalier','« ESCALIER : » : une pièce de type Escalier');
const toutes=[...rdc,...etage];
const aff=M.elecAffecterPieces(DQE,toutes);
const base={source:'dqe',dqe:{...DQE,affect:aff},lignes:M.elecBaseDepuisDQE(DQE,aff)};
const pe={plan:{fond:'f0',ratio:H,etage:'RDC',pieces:rdc,symboles:[],cables:[]},
  niveaux:[{id:'n1',plan:{fond:'f1',ratio:H,etage:'Étage',pieces:etage,symboles:[],cables:[]}}]};
const N=M.elecNiveaux(pe);
chk(N.length===2&&N[0].id===''&&N[0].nom==='RDC'&&N[1].nom==='Étage','deux niveaux : RDC (le plan du dossier) et Étage');
chk(M.elecEscaliers(N).length===1,'l’escalier du RDC est relié à celui de l’étage');

const gm=M.elecGenererMaison(N,base,{mode:'tout'});
const pe1={...pe,plan:gm.apres[0].plan,niveaux:[{...pe.niveaux[0],plan:gm.apres[1].plan}],liaisonsNiveaux:gm.liaisonsNiveaux};
const maison=M.elecPlanMaison(pe1);
const ctl=M.elecControle(maison,base);
chk(ctl.rapport.manquants===0&&ctl.rapport.conformes===ctl.rapport.dqe&&ctl.rapport.dqe>=55,'un clic, deux niveaux : '+ctl.rapport.conformes+' / '+ctl.rapport.dqe+' conformes');
const idsR=new Set(rdc.map(p=>p.id)), idsE=new Set(etage.map(p=>p.id));
chk(gm.apres[0].plan.symboles.every(s=>!s.piece||idsR.has(s.piece))&&gm.apres[1].plan.symboles.every(s=>!s.piece||idsE.has(s.piece)),'chaque niveau ne porte que les équipements de ses pièces (aucun mélange de coordonnées)');
const vrR=gm.apres[0].plan.symboles.filter(s=>s.type==='vr').length, vrE=gm.apres[1].plan.symboles.filter(s=>s.type==='vr').length;
chk(vrR===3&&vrE===3,'les 6 volets du logement : 3 aux fenêtres du RDC, 3 à celles de l’étage');
chk(gm.apres[1].plan.symboles.filter(s=>s.piece==='ch2'&&s.type==='pc').length===3,'chambre 2 (étage) : ses 3 prises');
const de=(niv,pid,t)=>gm.apres[niv].plan.symboles.filter(s=>s.piece===pid&&s.type===t);
chk(de(0,'esc0','pointc').length===1&&de(0,'esc0','vv').length===1&&de(1,'esc1','vv').length===1,'escalier : point lumineux et une commande en bas, une commande en haut');
const L=gm.liaisonsNiveaux;
chk(L.length===1&&L[0].de.niveau==='n1'&&L[0].de.id===de(1,'esc1','vv')[0].id&&L[0].vers.niveau===''&&L[0].vers.id===de(0,'esc0','pointc')[0].id,'liaison entre niveaux : la commande de l’étage pilote le point lumineux de l’escalier au RDC');
const V=M.elecValiderPlan(maison,base);
chk(!V.points.some(p=>/superposés/.test(p.msg)),'contrôle d’ensemble : deux niveaux aux coordonnées voisines ne sont pas « superposés »');
chk(!V.points.some(p=>/Commande va-et-vient|V&V/.test(p.msg)&&/sans liaison/.test(p.msg)&&/Escalier/.test(p.msg)),'la commande d’étage de l’escalier n’est pas « sans liaison »');
chk(V.faits.find(([t])=>/pièces traitées/.test(t))[1],'toutes les pièces des deux niveaux traitées');
const R=M.elecResumeGeneration(maison,base,M.elecGenerationUnique(gm));
chk(R.poses>0&&R.rapport.manquants===0,'résumé d’une génération sur deux niveaux');
/* régénérations */
const gm2=M.elecGenererMaison(M.elecNiveaux(pe1),base,{mode:'manquants',liaisonsNiveaux:L});
chk(Object.values(gm2.parNiveau).every(g=>!g.ajouts.length&&!g.retraits.length)&&gm2.liaisonsNiveaux.length===1,'compléter : rien en double sur aucun niveau, la liaison est gardée');
const gm3=M.elecGenererMaison(M.elecNiveaux(pe1),base,{mode:'niveau',niveau:'n1',liaisonsNiveaux:L});
chk(Object.keys(gm3.parNiveau).join()==='n1'&&gm3.apres[0].plan===pe1.plan,'recalculer l’étage : le RDC n’est pas touché');
const pe3={...pe1,niveaux:[{...pe1.niveaux[0],plan:gm3.apres[1].plan}],liaisonsNiveaux:gm3.liaisonsNiveaux};
chk(M.elecControle(M.elecPlanMaison(pe3),base).rapport.manquants===0&&gm3.liaisonsNiveaux.length===1,'après recalcul de l’étage : tout posé, liaison d’escalier refaite');
/* un seul niveau : rien ne change */
chk(M.elecPlanMaison({plan:pe.plan})===pe.plan,'un seul niveau : le plan du dossier, tel quel');

/* sorties : l'indice et la publication client couvrent tous les niveaux */
const pi=M.elecPlanPourIndice(pe1);
chk(pi.symboles.length===gm.apres[0].plan.symboles.length+gm.apres[1].plan.symboles.length&&pi.fond==='f0|f1','indice : calculé sur les deux niveaux');
const pe1b={...pe1,niveaux:[{...pe1.niveaux[0],plan:{...pe1.niveaux[0].plan,symboles:pe1.niveaux[0].plan.symboles.slice(1)}}]};
chk(M.elecIndicePourSortie({...M.elecPlanPourIndice(pe1b),indice:'A',exportEmpreinte:M.elecIndicePourSortie(pi).empreinte}).change,'un changement à l’étage seul fait changer l’indice');
const pub=M.elecPublication({nom:'Maison Fictive'},pe1.plan,'A',M.elecNiveaux(pe1).slice(1));
chk(pub.nom==='RDC'&&pub.niveaux.length===1&&pub.niveaux[0].nom==='Étage'&&pub.niveaux[0].fond==='f1'&&pub.niveaux[0].symboles.length===gm.apres[1].plan.symboles.length,'publication client : le RDC, puis l’étage avec son fond et ses symboles');
chk(pub.legende.reduce((t,x)=>t+x.n,0)===pi.symboles.length&&!/article|categorie|statut|confiance/.test(JSON.stringify(pub)),'légende publiée : toute la maison ; rien d’interne');
chk(!('niveaux' in M.elecPublication({nom:'X'},pe.plan,'A',[])),'un seul niveau : publication inchangée');

/* modèles de disposition : le repère « porte en bas » */
const tourne=c=>P('t','Chambre','T',.2,.2,.5,.6,[d('x',c,c==='haut'||c==='bas'?.35:c==='gauche'?.2:.5,c==='haut'?.2:c==='bas'?.6:.4,'gauche')]);
chk(['haut','bas','gauche','droite'].every(c=>{const p=tourne(c);const q=M.elecCanon(p,.31,.27);const z=M.elecDecanon(p,q.U,q.V);return Math.abs(z.x-.31)<1e-9&&Math.abs(z.y-.27)<1e-9}),'repère de la pièce : aller-retour exact, quel que soit le mur de la porte');
chk(['haut','bas','gauche','droite'].every(c=>{const p=tourne(c);return M.elecMurCanon(p,c)==='bas'&&['haut','bas','gauche','droite'].every(m=>M.elecMurDecanon(p,M.elecMurCanon(p,m))===m)}),'le mur de la porte devient « bas » ; les murs se retrouvent');
/* « Enregistrer comme modèle Chambre CP » depuis la chambre 1 retouchée */
const planE=gm.apres[1].plan;
const D=M.elecDispositionDepuisPiece(planE,'ch1','Chambre CP','CP');
chk(D&&D.pieceType==='Chambre'&&D.items.length===planE.symboles.filter(s=>M.elecPieceDe(s,etage)==='ch1').length&&D.items.some(it=>it.porte),'modèle « Chambre CP » : toute la disposition, la commande de porte marquée');
chk(M.elecDispositionPour({type:'Chambre'},{dispositions:[{...D,defaut:true}]})&&!M.elecDispositionPour({type:'Chambre',disposition:'@aucun'},{dispositions:[{...D,defaut:true}]})&&!M.elecDispositionPour({type:'Bureau'},{dispositions:[{...D,defaut:true}]}),'modèle par défaut pour son type ; « aucun » l’écarte');
/* appliqué à une chambre dont la porte est sur le mur de gauche */
const chG=P('chG','Chambre','Chambre G',.1,.1,.4,.5,[d('g1','gauche',.1,.3,'droite')]);
const planG={fond:'g',ratio:H,pieces:[chG],symboles:[],cables:[]};
const baseG={lignes:[{id:'b1',piece:'chG',type:'pc',qte:3,nature:'prevu'},{id:'b2',piece:'chG',type:'rj45',qte:1,nature:'prevu'},{id:'b3',piece:'chG',type:'pointc',qte:1,nature:'prevu'},{id:'b4',piece:'chG',type:'vv',qte:2,nature:'deduit'}]};
const gG=M.elecGenererPlan(planG,baseG,{mode:'tout',biblio:{dispositions:[{...D,defaut:true}]}});
const attendu=t=>D.items.filter(it=>it.type===t&&!it.porte).map(it=>M.elecDecanon(chG,it.U,it.V));
const pcs=gG.ajouts.filter(s=>s.type==='pc');
chk(pcs.length===3&&pcs.every(s=>attendu('pc').some(a=>Math.hypot(a.x-s.x,(a.y-s.y)*H)<0.04))&&pcs.every(s=>/Modèle « Chambre CP »/.test(s.note||'')),'modèle appliqué à une chambre tournée : les 3 prises à leur place relative');
const cmdPorte=gG.ajouts.filter(s=>s.type==='vv').sort((a,b)=>Math.hypot(a.x-.1,a.y-.3)-Math.hypot(b.x-.1,b.y-.3))[0];
chk(cmdPorte&&Math.hypot(cmdPorte.x-.1,(cmdPorte.y-.3)*H)<0.09,'la commande de porte suit la porte de la nouvelle pièce (pas le modèle)');
chk(M.elecControle({...planG,symboles:gG.ajouts,cables:gG.cables},baseG).rapport.manquants===0,'modèle + règles : tout le programme de la pièce posé');
fin();
