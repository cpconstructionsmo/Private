/* Le générateur automatique du plan électrique, sur une maison fictive de
   11 pièces et un DQE fictif de même structure qu'un marché « Électricité »
   de l'application : un clic pose TOUT le programme (plus rien « à 0 »),
   chaque symbole dans sa pièce, sans chevauchement, les commandes côté
   poignée, les va-et-vient aux deux accès, les prises hors des portes, le
   linéaire cuisine, la tête de lit, les volets aux fenêtres, l'extérieur
   dehors, le tableau au garage, les liaisons ; une deuxième génération ne
   double rien ; régénérer une pièce ne touche ni aux autres, ni à ce qui a
   été retouché ou verrouillé. */
const {charger,verif}=require('./harness');
const M=charger(['elecLireDQE','elecAffecterPieces','elecBaseDepuisDQE','elecGenererPlan','elecResumeGeneration','elecPropositionsCP','elecControle',
  'elecPieceDe','ELEC_ESPACE','ELEC_DEMI_PORTE','ELEC_COMMANDES','elecAppliquerGeneration','elecValiderProposition','elecVersionAjouter','ELEC_VERSIONS_MAX',
  'elecValiderPlan','elecParType','elecSurplusARetirer','elecStyleCable','elecCategorieCable']);
const {chk,fin}=verif();
const H=0.74;
const P=(id,type,nom,x0,y0,x1,y1,portes,fenetres)=>({id,type,nom,x0,y0,x1,y1,portes:portes||[],fenetres:fenetres||[]});
const d=(id,cote,x,y,poignee)=>({id,cote,x,y,poignee});
const f=(id,cote,x,y)=>({id,cote,x,y,vr:true});
const pieces=[
  P('cel','Cellier / buanderie','Cellier',.20,.15,.32,.35,[d('d1','bas',.26,.35,'gauche')]),
  P('gar','Garage','Garage',.20,.35,.35,.70,[d('d2','droite',.35,.62,'droite'),d('d3','bas',.27,.70,'')]),
  P('cui','Cuisine','Cuisine',.32,.15,.50,.35,[d('d4','droite',.50,.30,'gauche')],[f('f1','haut',.41,.15)]),
  P('sej','Séjour','Séjour',.50,.15,.80,.50,[d('d5','bas',.56,.50,'droite')],[f('f2','haut',.60,.15),f('f3','haut',.72,.15)]),
  P('ent','Entrée','Entrée',.35,.55,.45,.70,[d('d6','bas',.40,.70,'gauche'),d('d7','droite',.45,.60,'droite')]),
  P('deg','Dégagement','Dégagement',.45,.50,.62,.58,[d('d8','haut',.50,.50,'gauche'),d('d9','bas',.60,.58,'droite')]),
  P('sdb','Salle de bains','Salle de bains',.45,.58,.55,.70,[d('d10','haut',.50,.58,'gauche')]),
  P('wc','WC','WC',.55,.58,.62,.66,[d('d11','haut',.585,.58,'gauche')]),
  P('ch1','Chambre','Chambre 1',.35,.70,.50,.85,[d('d12','haut',.40,.70,'gauche')],[f('f4','bas',.42,.85)]),
  P('ch2','Chambre','Chambre 2',.50,.70,.65,.85,[d('d13','haut',.55,.70,'droite')],[f('f5','bas',.57,.85)]),
  P('ch3','Chambre','Chambre 3',.65,.50,.80,.85,[d('d14','gauche',.65,.55,'gauche')],[f('f6','droite',.80,.70)])];
const T=l=>({type:'titre',libelle:l});let n=0;const A=(c,l,q,pu)=>({id:'l'+(n++),type:'article',code:c,libelle:l,unite:'U',qt:q,pu:pu||50});
const DQE=M.elecLireDQE([T('151 ELECTRICITÉ'),A('B_TAB','Tableau et distribution',1,1200),A('B_COM','Tableau communication grade 3',1,400),
  T('EXTERIEUR:'),A('X_EXT_ASA','Applique accès entrée (SA à témoin)',2),A('X_GAR_ASA','Applique accès garage (SA à témoin)',1),
  T('ENTREE:'),A('X_ENT_CVV','Point lumineux (V et V)',1),A('X_ENT_P16','Prise 10/16 A + T',1),
  T('DEGAGEMENT:'),A('X_DEG_CVV','Point lumineux (V et V)',1),A('X_DEG_P16','Prise 10/16 A + T',1),
  T('CUISINE :'),A('X_CUI_CVV','Point lumineux (V et V)',1),A('X_CUI_HOT','Prise hotte',1),A('X_CUI_P16','Prise 10/16 A + T',7),A('X_CUI_P20','Prise 16/20 A + T',3),A('X_CUI_P32','Alimentation 32 A + T',1),
  T('SALLE DE BAINS:'),A('X_SDB_CSA','Point lumineux (SA)',1),A('X_SDB_ASA','Applique (SA)',1),A('X_SDB_P16','Prise 10/16 A + T',2),
  T('WC:'),A('X_WC_CSA','Point lumineux (SA)',1),
  T('SEJOUR:'),A('X_SEJ_CVV','Point lumineux (V et V)',2),A('X_SEJ_P16','Prise 10/16 A + T',10),A('X_SEJ_RJ','Prise communication (GR3)',2),
  T('CHAMBRES 1, 2 ET 3:'),A('X_CH_CVV','Point lumineux (V et V)',3),A('X_CH_P16','Prise 10/16 A + T',9),A('X_CH_RJ','Prise communication (GR3)',3),
  T('CELLIER :'),A('X_CEL_CVV','Point lumineux (V et V)',1),A('X_CEL_P16','Prise 10/16 A + T',1),A('X_CEL_P20','Prise 16/20 A + T',2),
  T('GARAGE :'),A('X_GAR_CVV','Point lumineux (V et V)',1),A('X_GAR_P16','Prise 10/16 A + T',1),A('X_GAR_PG','Alimentation porte de garage',1),
  T('AUTRES :'),A('X_PAC','Alimentation pompe à chaleur',1),A('X_TH','Alimentation thermostat',1),A('X_VR','Alimentation volet roulant',6),
  A('X_LEQ','Liaison équipotentielle',1),A('X_TV','Prise TV',2),A('X_CONSU','Demande de consuel',1),
  T('153 VENTILATION'),A('X_VMC','V.M.C. hygroréglable 3 sanitaires + cuisine',1),A('X_EA','Entrée d’air frais hygro-acoustique',4)],{nom:'DQE fictif'});
const aff=M.elecAffecterPieces(DQE,pieces);
const base={source:'dqe',dqe:{...DQE,affect:aff},lignes:M.elecBaseDepuisDQE(DQE,aff)};
const plan0={fond:'f',ratio:H,pieces,symboles:[],cables:[],calib:{x1:.2,y1:.15,x2:.8,y2:.15,metres:17.9,fond:'f'}};

const g=M.elecGenererPlan(plan0,base,{mode:'tout'});
const plan1={...plan0,symboles:g.ajouts,cables:g.cables};
const ctl=M.elecControle(plan1,base);
chk(ctl.rapport.dqe>=75&&ctl.rapport.manquants===0&&ctl.rapport.conformes===ctl.rapport.dqe,'un clic : '+ctl.rapport.conformes+' / '+ctl.rapport.dqe+' prévus au DQE posés (plus rien à 0)');
chk(!g.ajouts.some(s=>s.aPlacer||s.x==null),'aucun équipement laissé « à placer »');
const rect=p=>({x0:Math.min(p.x0,p.x1)-1e-6,x1:Math.max(p.x0,p.x1)+1e-6,y0:Math.min(p.y0,p.y1)-1e-6,y1:Math.max(p.y0,p.y1)+1e-6});
const dans=(s,p)=>{const r=rect(p);return s.x>=r.x0&&s.x<=r.x1&&s.y>=r.y0&&s.y<=r.y1};
const interieurs=g.ajouts.filter(s=>s.piece);
chk(interieurs.every(s=>dans(s,pieces.find(p=>p.id===s.piece))),'chaque symbole est dans sa pièce');
const dist=(a,b)=>Math.hypot(a.x-b.x,(a.y-b.y)*H);
let paires=0;for(let i=0;i<g.ajouts.length;i++)for(let j=i+1;j<g.ajouts.length;j++)if(dist(g.ajouts[i],g.ajouts[j])<M.ELEC_ESPACE*0.6)paires++;
chk(paires===0,'aucun symbole superposé à un autre ('+paires+')');
/* commandes */
const de=(pid,t)=>g.ajouts.filter(s=>s.piece===pid&&s.type===t);
const cmdCui=de('cui','vv');
chk(cmdCui.length===2&&cmdCui.some(c=>dist(c,{x:.50,y:.30})<0.09&&c.y<.30),'cuisine : va-et-vient à la porte, côté poignée (gauche vue de l’intérieur = vers le haut)');
const degVv=de('deg','vv');
chk(degVv.length===2&&dist(degVv[0],{x:.50,y:.50})<0.09&&dist(degVv[1],{x:.60,y:.58})<0.09,'dégagement : une commande à chaque accès');
const ch1=de('ch1','vv');
chk(ch1.length===2&&ch1.some(c=>/lit inconnue/.test(c.note||'')),'chambre : commande d’entrée + commande complémentaire signalée (lit inconnu)');
/* prises */
const prises=g.ajouts.filter(s=>['pc','pc20','pc32','rj45','tv','hotte'].includes(s.type)&&s.piece);
chk(prises.every(s=>!(pieces.find(p=>p.id===s.piece).portes||[]).some(dp=>dist(s,dp)<M.ELEC_DEMI_PORTE)),'aucune prise dans le débattement d’une porte');
const murs=new Set(de('sej','pc').map(s=>s.mur));
chk(murs.size>=3,'séjour : prises réparties sur '+murs.size+' murs');
const lin=[...de('cui','pc32'),...de('cui','pc20'),...de('cui','hotte')];
chk(new Set(lin.map(s=>s.mur)).size===1&&de('cui','pc').filter(s=>s.h===110).length===4,'cuisine : plaque, four, hotte sur le linéaire ; 4 prises de plan de travail à 110 cm');
const chev=de('ch2','pc').filter(s=>/chevet/.test(s.note||''));
chk(chev.length===2&&chev.every(s=>s.mur===chev[0].mur&&!['haut','bas'].includes(s.mur)),'chambre 2 : deux prises de chevet sur un même mur plein (ni la porte, ni la fenêtre)');
/* volets, extérieur, technique */
const vr=g.ajouts.filter(s=>s.type==='vr');
chk(vr.length===6&&vr.every(s=>pieces.some(p=>(p.fenetres||[]).some(fn=>dist(s,fn)<0.1))),'6 commandes VR, chacune près d’une fenêtre marquée');
const ext=g.ajouts.filter(s=>s.type==='appext');
chk(ext.length===3&&ext.every(s=>!pieces.some(p=>dans(s,p))),'3 appliques extérieures posées dehors, contre la façade');
chk(de('gar','tab').length===1&&de('gar','coffcom').length===1&&de('cel','pac').length===1&&de('sej','th').length===1,'tableau et coffret au garage, PAC au cellier, thermostat au séjour');
chk(g.ajouts.filter(s=>s.type==='bouche').length===4&&g.ajouts.filter(s=>s.type==='entair').length===4,'VMC : 4 bouches dans les pièces humides, 4 entrées d’air dans les pièces sèches');
/* liaisons, statut, confiance */
const cmds=g.ajouts.filter(s=>M.ELEC_COMMANDES.has(s.type));
chk(g.cables.length>=cmds.length-1&&cmds.filter(c=>!g.cables.some(x=>x.de===c.id)).length<=1,'liaisons : chaque commande pilote un éclairage ('+g.cables.length+')');
chk(g.ajouts.every(s=>s.statut==='a_confirmer'&&s.source==='genere'&&typeof s.confiance==='number'),'tout est une proposition, avec sa confiance');
chk(g.avertissements.some(a=>/salle d’eau/.test(a.msg))&&g.avertissements.some(a=>/tableau/.test(a.msg)),'les positions incertaines sont signalées, pas inventées comme sûres');
/* régénérations */
const g2=M.elecGenererPlan(plan1,base,{mode:'manquants'});
chk(g2.ajouts.length===0&&g2.retraits.length===0,'deuxième génération « compléter » : rien en double');
const bouge=g.ajouts.find(s=>s.piece==='ch1'&&s.type==='pc');
const verr=g.ajouts.find(s=>s.piece==='ch1'&&s.type==='rj45');
const plan2={...plan1,symboles:plan1.symboles.map(s=>s.id===bouge.id?{...s,x:s.x+0.01,userModified:true}:s.id===verr.id?{...s,verrou:true}:s)};
const g3=M.elecGenererPlan(plan2,base,{mode:'piece',pieceId:'ch1'});
chk(!g3.retraits.includes(bouge.id)&&!g3.retraits.includes(verr.id)&&g3.retraits.length>0&&g3.ajouts.every(s=>s.piece==='ch1'),'régénérer la chambre 1 : la prise déplacée et la RJ45 verrouillée restent, les autres pièces ne bougent pas');
const plan3={...plan2,symboles:[...plan2.symboles.filter(s=>!g3.retraits.includes(s.id)),...g3.ajouts]};
chk(M.elecControle(plan3,base).rapport.manquants===0,'après régénération de la pièce : toujours tout posé');
const g4=M.elecGenererPlan(plan2,base,{mode:'tout'});
chk(!g4.retraits.includes(bouge.id)&&!g4.retraits.includes(verr.id),'tout recalculer : vos retouches et le verrouillé sont gardés');
/* sans étalonnage : posé quand même, confiance réduite */
const g5=M.elecGenererPlan({...plan0,calib:null},base,{mode:'tout'});
chk(g5.ajouts.every(s=>s.x!=null)&&g5.ajouts[0].confiance<g.ajouts[0].confiance+1e-9,'sans étalonnage : posé quand même (coordonnées relatives au plan), confiance réduite');
const R=M.elecResumeGeneration(plan0,base,g);
chk(R.poses===g.ajouts.length&&R.familles.length>=6&&R.etapes.some(([e,v])=>e==='Contrôle'&&/conformes/.test(v)),'résumé : familles, étapes, contrôle');
const PCP=M.elecPropositionsCP(plan0,base);
chk(PCP.some(x=>x.pieceNom==='Cuisine'&&x.type==='lv'&&x.dqe===0&&x.cp===1),'proposition CP hors DQE affichée (lave-vaisselle en cuisine : DQE 0, CP 1)');
/* appliquer, valider, versions */
const pa=M.elecAppliquerGeneration(plan0,g);
chk(pa.symboles.length===g.ajouts.length&&pa.cables.length===g.cables.length&&pa.pieces===plan0.pieces,'appliquer : symboles et liaisons ajoutés, pièces (le plan d’architecte) intactes');
const pr=M.elecAppliquerGeneration(plan3,{ajouts:[],retraits:[g.cables[0].de],cables:[]});
chk(!pr.symboles.some(s=>s.id===g.cables[0].de)&&!pr.cables.some(c=>c.de===g.cables[0].de),'retirer un symbole emporte ses liaisons');
const pv=M.elecValiderProposition(plan2);
chk(pv.symboles.every(s=>s.statut==='valide')&&pv.symboles.find(s=>s.id===bouge.id).userModified===true,'valider la proposition : tout passe « validé », les retouches restent marquées');
chk(M.elecValiderProposition(plan1,[g.ajouts[0].id]).symboles.filter(s=>s.statut==='valide').length===1,'valider seulement une génération (ses identifiants)');
let V=[];for(let i=0;i<M.ELEC_VERSIONS_MAX+2;i++)V=M.elecVersionAjouter(V,plan1,'essai',"CP");
chk(V.length===M.ELEC_VERSIONS_MAX&&V[V.length-1].n===M.ELEC_VERSIONS_MAX+2&&V[0].symboles.length===plan1.symboles.length,'versions V1, V2… numérotées, les '+M.ELEC_VERSIONS_MAX+' dernières gardées');
/* contrôle d'ensemble */
const VP=M.elecValiderPlan(plan1,base);
chk(VP.faits.every(([,ok])=>ok)&&VP.rapport.manquants===0,'contrôle d’ensemble : équipements, pièces, familles ✓');
chk(VP.points.some(p=>p.faible)&&!VP.points.some(p=>/hors de toute pièce|superposés/.test(p.msg)),'contrôle d’ensemble : positions peu sûres signalées, rien hors pièce ni superposé');
const sansLien={...plan1,cables:[]};
chk(M.elecValiderPlan(sansLien,base).points.some(p=>/sans liaison/.test(p.msg)),'une commande sans liaison est signalée');
const pt=M.elecParType(plan1,base);
const pcT=pt.find(t=>t.type==='pc');
chk(pcT&&pcT.prevu===pcT.implante&&pcT.niveau==='ok'&&pt.every(t=>t.niveau==='ok'),'DQE / PLAN par équipement : PC '+(pcT&&pcT.implante)+' / '+(pcT&&pcT.prevu)+' ✓');
const plus={...plan1,symboles:[...plan1.symboles,{id:'x1',type:'pc',x:.6,y:.3,piece:'sej',source:'manuel'},{id:'x2',type:'pc',x:.62,y:.3,piece:'sej',source:'manuel',verrou:true}]};
chk(M.elecParType(plus,base).find(t=>t.type==='pc').msg==='+2 hors DQE','2 prises en plus : « +2 hors DQE »');
const retire=M.elecSurplusARetirer(plus,'pc',2);
chk(retire.length===2&&!retire.includes('x2')&&retire.every(id=>plan1.symboles.find(s=>s.id===id&&s.source==='genere')),'supprimer le surplus : les générés d’abord, jamais le verrouillé');
/* calques de liaisons */
const cab=g.cables[0];
chk(M.elecCategorieCable(cab)==='eclairage'&&M.elecStyleCable(plan1,cab).visible&&!M.elecStyleCable(plan1,cab).pointille,'liaison commande → éclairage : calque « Commandes éclairage », trait plein');
const cache={...plan1,liaisons:{eclairage:{visible:false,couleur:'#27823F'}}};
chk(!M.elecStyleCable(cache,cab).visible&&M.elecStyleCable(cache,cab).couleur==='#27823F'&&M.elecStyleCable(plan1,{id:'m',de:'a',vers:'b',couleur:'#C0392B'}).couleur==='#C0392B','calque masqué, couleur réglable ; la couleur donnée à un câble prime');
fin();
