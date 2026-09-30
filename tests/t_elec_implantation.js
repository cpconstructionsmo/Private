/* Implantation du plan électrique, sur un plan fictif : accrochage aux murs
   (orientation vers la pièce), commandes à l'entrée côté poignée (jamais
   derrière la porte ouverte), prises le long des murs hors débattement de
   porte, liaisons commande → éclairage, hauteurs de la bibliothèque CP,
   modèles, journal des modifications. */
const {charger,verif}=require('./harness');
const M=charger(['elecMurProche','elecAccrocher','elecPresPorte','elecPositionsMurales','elecGenerer','elecHauteurDefaut','elecModeleDepuisBase',
  'elecBaseModeleDe','elecJournalDiff','elecJournalAjouter','elecControle','ELEC_DEMI_PORTE']);
const {chk,fin}=verif();
const R=0.667;
const sej={id:'sej',type:'Séjour',nom:'Séjour',x0:.1,y0:.1,x1:.5,y1:.5,portes:[{id:'d1',x:.3,y:.5,cote:'bas',poignee:'gauche'}]};
const ch={id:'ch',type:'Chambre',nom:'Chambre',x0:.55,y0:.1,x1:.9,y1:.5};
const pieces=[sej,ch];
const cal={fond:'f',ratio:R,pieces,calib:{x1:.1,y1:.1,x2:.5,y2:.1,metres:6,fond:'f'}};

/* accrochage */
const a=M.elecAccrocher({id:'s',type:'pc',x:.3,y:.115},pieces,R);
chk(Math.abs(a.y-.1)<0.02&&a.y>.1&&a.rot===180&&a.mur==='haut','prise lâchée près du mur haut : accrochée contre le mur, tournée vers la pièce');
const g=M.elecAccrocher({id:'s',type:'applique',x:.105,y:.3},pieces,R);
chk(g.x>.1&&g.x<.12&&g.rot===90,'applique près du mur gauche : orientée vers la droite (l’intérieur)');
const loin={id:'s',type:'pc',x:.3,y:.3};
chk(M.elecAccrocher(loin,pieces,R)===loin,'loin des murs : rien ne bouge');
const plafond={id:'s',type:'pointc',x:.3,y:.105};
chk(M.elecAccrocher(plafond,pieces,R)===plafond,'un point de centre (plafond) ne s’accroche pas');

/* près de la porte, côté poignée */
const pg=M.elecPresPorte({x:.3,y:.5,cote:'bas',poignee:'gauche'},0,R), pd=M.elecPresPorte({x:.3,y:.5,cote:'bas',poignee:'droite'},0,R);
chk(pg.x>.3+M.ELEC_DEMI_PORTE&&pd.x<.3-M.ELEC_DEMI_PORTE&&pg.y<.5,'commande à côté de la porte, du côté de la poignée (gauche ou droite), hors de son débattement');
/* le long des murs, hors des portes */
const pos=M.elecPositionsMurales(sej,12,R);
chk(pos.length===12&&pos.every(p=>Math.hypot(p.x-.3,(p.y-.5)*R)>M.ELEC_DEMI_PORTE*1.5),'12 prises réparties le long des murs, aucune devant la porte');

/* génération */
const base={lignes:[{id:'1',piece:'sej',type:'pointc',qte:2,unite:'poste',nature:'prevu',article:'D_SEJ_1CVV'},
  {id:'2',piece:'sej',type:'vv',qte:4,unite:'poste',nature:'deduit',article:'D_SEJ_1CVV'},
  {id:'3',piece:'sej',type:'pc',qte:6,unite:'mecanisme',nature:'prevu',article:'D_SEJ_5P16'},
  {id:'4',piece:'ch',type:'pointc',qte:1,unite:'poste',nature:'prevu'},{id:'5',piece:'ch',type:'sa',qte:1,unite:'poste',nature:'deduit'}]};
const G=M.elecGenerer({...cal,symboles:[]},base,{biblio:{hauteurs:{pc:25}}});
const de=(p,t)=>G.ajouts.filter(s=>s.piece===p&&s.type===t);
chk(de('sej','vv').length===4&&de('sej','vv').every(s=>Math.hypot(s.x-.3,(s.y-.5)*R)<0.2),'séjour : 4 va-et-vient près de la porte');
chk(de('sej','vv').every(s=>s.x>.3),'… du côté de la poignée (à gauche vue de l’intérieur)');
chk(G.cables.length===5&&de('sej','vv').every(v=>G.cables.some(c=>c.de===v.id&&de('sej','pointc').some(p=>p.id===c.vers)))
  &&de('sej','pointc').every(p=>G.cables.filter(c=>c.vers===p.id).length===2),'liaisons : chaque point lumineux piloté par deux va-et-vient ; la chambre : SA → point');
chk(de('ch','sa')[0].note==='Porte non marquée : position à confirmer','pas de porte marquée : la commande est proposée, à confirmer');
chk(de('sej','pc').length===6&&de('sej','pc').every(s=>s.h===25&&s.categorie==='dqe'&&s.article==='D_SEJ_5P16'&&s.statut==='a_confirmer'),
  'prises : hauteur de la bibliothèque CP (25), origine DQE, article, « à valider »');
const surMur=s=>Math.min(Math.abs(s.x-.1),Math.abs(s.x-.5),Math.abs(s.y-.1)*R,Math.abs(s.y-.5)*R)<0.012;
chk(de('sej','pc').every(surMur),'prises posées contre les murs');
chk(M.elecGenerer({...cal,pieces:[{...sej}],calib:null,symboles:[]},base).ajouts.every(s=>s.aPlacer&&s.x===null),'sans échelle : aucune position inventée');
const ctl=M.elecControle({...cal,symboles:G.ajouts},base);
chk(ctl.rapport.manquants===0,'après génération : rien ne manque au contrôle');

/* bibliothèque et journal */
chk(M.elecHauteurDefaut('pc',{hauteurs:{pc:25}})===25&&M.elecHauteurDefaut('pc',{})===30&&M.elecHauteurDefaut('hotte',{})===null,'hauteur : bibliothèque CP, sinon référence, sinon à définir');
const mo=M.elecModeleDepuisBase(base,pieces,'Maison premium CP');
const b2=M.elecBaseModeleDe([{id:'x',type:'Séjour'}],mo);
chk(mo.nom==='Maison premium CP'&&b2.length===2&&b2.find(l=>l.type==='pc').qte===6&&b2.every(l=>l.origine==='cp'),'modèle enregistré depuis une base, réappliqué à un autre plan');
const av={symboles:[{id:'a',type:'pc',x:.1,y:.1},{id:'b',type:'sa',x:.2,y:.2}]}, ap={symboles:[{id:'a',type:'pc',x:.15,y:.1},{id:'c',type:'rj45',x:.3,y:.3},{id:'b',type:'vv',x:.2,y:.2}]};
const J=M.elecJournalDiff(av,ap,'Claude');
chk(J.length===3&&J.some(x=>x.action==='deplacement')&&J.some(x=>x.action==='ajout'&&/RJ/.test(x.detail))&&J.some(x=>x.action==='type'&&/SA → V&V/.test(x.detail))&&J.every(x=>x.par==='Claude'),
  'journal : déplacement, ajout, changement de type, avec l’auteur');
const J2=M.elecJournalAjouter(M.elecJournalAjouter([],[J[0]]),[{...J[0],le:new Date(Date.now()+1000).toISOString()}]);
chk(J2.length===1,'un déplacement continué ne s’empile pas');
fin();
