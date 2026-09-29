/* Plan électrique, autour du dessin : échelle étalonnée (et perdue si le
   fond change), comparatif prévu / implanté en postes et en mécanismes,
   suppléments (inconnu ≠ zéro, moins-value seulement si prévue, un
   déplacement ne coûte rien), génération (rien d'inventé sans échelle,
   verrouillés et poses manuelles conservés, pas de doublon), indice et
   confirmation client. */
const {charger,verif}=require('./harness');
const M=charger(['elecEchelle','elecBaseModele','elecComparatif','elecSupplements','elecGenerer','elecIndicePourSortie','elecConfirmationValable',
  'elecPieceDe','elecPrixTTC','ELEC_MODELE_CP','EMPTY']);
const {chk,fin}=verif();

const pieces=[{id:'sej',nom:'Séjour',type:'Séjour',x0:0.1,y0:0.1,x1:0.5,y1:0.5},{id:'ch1',nom:'Chambre 1',type:'Chambre',x0:0.6,y0:0.1,x1:0.9,y1:0.4}];
const plan={fond:'f1',ratio:0.707,pieces,symboles:[],cables:[]};
chk(!M.elecEchelle(plan).ok&&M.elecEchelle(plan).raison==='non étalonné','sans étalonnage : non à l’échelle');
const cal={...plan,calib:{x1:0.1,y1:0.1,x2:0.5,y2:0.1,metres:6,fond:'f1',le:'2026-09-29'}};
const e=M.elecEchelle(cal);
chk(e.ok&&Math.abs(e.mParUnite-6/400)<1e-9,'étalonné sur 6 m : 400 unités de plan = 6 m');
chk(!M.elecEchelle({...cal,fond:'f2'}).ok&&/fond a changé/.test(M.elecEchelle({...cal,fond:'f2'}).raison),'fond remplacé : l’échelle n’est plus valable (rien n’est recalé en silence)');

const base={source:'modele_cp',lignes:M.elecBaseModele(pieces)};
chk(base.lignes.length===M.ELEC_MODELE_CP['Séjour'].length+M.ELEC_MODELE_CP['Chambre'].length,'modèle CP : une ligne par équipement de chaque pièce');
chk(base.lignes.find(l=>l.piece==='sej'&&l.type==='pc').unite==='mecanisme'&&base.lignes.find(l=>l.piece==='sej'&&l.type==='pointc').unite==='poste','prises en mécanismes, le reste en postes');

/* implantation : une prise double compte deux mécanismes, une seule place */
const S=[{id:'a',type:'pc',x:0.2,y:0.2,mecanismes:2},{id:'b',type:'pc',x:0.3,y:0.2},{id:'c',type:'pc',x:0.7,y:0.2},{id:'d',type:'pointc',x:0.3,y:0.3},
  {id:'e',type:'pc',x:0.95,y:0.9}];
const comp=M.elecComparatif({...plan,symboles:S},base);
const l=(p,t)=>comp.find(x=>x.piece===p&&x.type===t);
chk(l('sej','pc').implante===3&&l('sej','pc').prevu===5&&l('sej','pc').ecart===-2,'séjour : 1 prise double + 1 simple = 3 mécanismes sur 5 prévus');
chk(l('ch1','pc').implante===1&&l('ch1','pc').prevu===3,'chambre : la prise est rattachée à la pièce qui la contient');
chk(l('','pc')&&l('','pc').pieceNom==='Hors pièce'&&l('','pc').implante===1,'une prise hors de toute pièce est comptée « hors pièce »');
chk(M.elecPieceDe({type:'pc',x:0.2,y:0.2,piece:'ch1'},pieces)==='ch1','une pièce donnée à la main l’emporte sur la position');

/* suppléments */
const b2={lignes:[{id:'1',piece:'sej',type:'pc',qte:2,unite:'mecanisme',nature:'prevu'},{id:'2',piece:'ch1',type:'pc',qte:2,unite:'mecanisme',nature:'prevu'},
  {id:'3',piece:'sej',type:'rj45',qte:2,unite:'poste',nature:'prevu'},{id:'4',piece:'ch1',type:'fumee',qte:1,unite:'poste',nature:'reglementaire',sourceNorme:'à préciser'}]};
const S2=[{id:'p1',type:'pc',x:0.2,y:0.2},{id:'p2',type:'pc',x:0.25,y:0.2},{id:'p3',type:'pc',x:0.3,y:0.2},{id:'p4',type:'pc',x:0.7,y:0.2},
  {id:'r1',type:'rj45',x:0.2,y:0.3}];
const c2=M.elecComparatif({...plan,symboles:S2},b2);
const data={...M.EMPTY,bordereaux:[{id:'bo',nom:'Électricité Martin',articles:[{code:'EL-PC',libelle:'Prise 2P+T',unite:'u',pu:50}]}]};
const s0=M.elecSupplements(c2,{},data);
const pc=s0.lignes.find(x=>x.type==='pc'),rj=s0.lignes.find(x=>x.type==='rj45');
chk(pc.ecart===0&&pc.incidence===0,'prise déplacée d’une pièce à l’autre (3+1 au lieu de 2+2) : aucun supplément');
chk(rj.ecart===-1&&rj.incidence===0&&/non prévue/.test(rj.etat),'RJ45 en moins : pas de moins-value si le marché ne la prévoit pas');
chk(s0.reglementaires.length===1&&s0.reglementaires[0].type==='fumee','exigence réglementaire non couverte : écart à résoudre, hors supplément');
const S3=[...S2,{id:'p5',type:'pc',x:0.4,y:0.4},{id:'t1',type:'tv',x:0.3,y:0.4}];
const s1=M.elecSupplements(M.elecComparatif({...plan,symboles:S3},b2),{pc:{bordereauId:'bo',code:'EL-PC',tva:20},rj45:{puHT:40,tva:20,moinsValue:true,source:'Marché lot électricité'}},data);
chk(s1.lignes.find(x=>x.type==='pc').incidence===60,'prise en plus : 1 × 50 € HT du bordereau × 1,20 = 60 € TTC');
chk(s1.lignes.find(x=>x.type==='rj45').incidence===-48,'moins-value prévue au marché : −1 × 48 € TTC');
chk(s1.lignes.find(x=>x.type==='tv').incidence===null&&s1.aChiffrer.some(x=>x.type==='tv'),'TV sans prix : à chiffrer, pas zéro');
chk(s1.totalTTC===12,'incidence connue : +60 − 48 = +12 € TTC');
chk(M.elecPrixTTC({bordereauId:'bo',code:'EL-PC',tva:5.5},data)===52.75,'prix lu à jour dans le bordereau, TVA du tarif');

/* génération */
const bG={lignes:[{id:'1',piece:'sej',type:'pc',qte:3,unite:'mecanisme',nature:'prevu'},{id:'2',piece:'sej',type:'pointc',qte:1,unite:'poste',nature:'prevu'}]};
const g0=M.elecGenerer({...plan,symboles:[]},bG);
chk(g0.ajouts.length===4&&g0.ajouts.every(s=>s.aPlacer&&s.x===null&&s.statut==='a_confirmer'),'non étalonné : 4 équipements « à placer », aucune position inventée');
const g1=M.elecGenerer({...cal,symboles:[]},bG);
chk(g1.ajouts.length===4&&g1.ajouts.every(s=>!s.aPlacer&&s.x>=0.1&&s.x<=0.5&&s.y>=0.1&&s.y<=0.5&&s.piece==='sej'),'étalonné : placés dans le séjour, statut à confirmer');
const pose=[...g1.ajouts];
chk(M.elecGenerer({...cal,symboles:pose},bG).ajouts.length===0,'deuxième génération : rien n’est ajouté en double');
const pts=M.elecGenerer({...cal,symboles:[]},{lignes:[{id:'1',piece:'sej',type:'pointc',qte:2,unite:'poste',nature:'prevu'}]}).ajouts;
chk(pts.length===2&&pts[0].x!==pts[1].x,'deux points de centre : jamais superposés');
const enTrop=[...pose,{id:'x1',type:'pc',x:0.2,y:0.4,source:'genere'},{id:'x2',type:'pc',x:0.2,y:0.45,source:'genere',verrou:true},{id:'x3',type:'pc',x:0.25,y:0.45}];
const g2=M.elecGenerer({...cal,symboles:enTrop},bG);
chk(g2.retraits.length>0&&!g2.retraits.includes('x2')&&!g2.retraits.includes('x3'),'en trop : seuls les générés non verrouillés sont proposés au retrait');
const g3=M.elecGenerer({...plan,symboles:g0.ajouts},bG);
chk(g3.ajouts.length===0,'les « à placer » en attente comptent : pas de nouvelle série');

/* indice et confirmation */
const i1=M.elecIndicePourSortie({symboles:[{id:'a',type:'pc',x:0.1,y:0.1}],cables:[],fond:'f1'});
chk(i1.indice==='A'&&i1.change,'première sortie : indice A');
const i2=M.elecIndicePourSortie({symboles:[{id:'a',type:'pc',x:0.1,y:0.1}],cables:[],fond:'f1',indice:'A',exportEmpreinte:i1.empreinte});
chk(i2.indice==='A'&&!i2.change,'rien n’a changé : même indice');
const i3=M.elecIndicePourSortie({symboles:[{id:'a',type:'pc',x:0.2,y:0.1}],cables:[],fond:'f1',indice:'A',exportEmpreinte:i1.empreinte});
chk(i3.indice==='B'&&i3.change,'un équipement déplacé : indice B');
chk(M.elecConfirmationValable({etudeConfirmeeLe:'2026-09-20',confirmeIndice:'A',plan:{indice:'A'}})
  &&!M.elecConfirmationValable({etudeConfirmeeLe:'2026-09-20',confirmeIndice:'A',plan:{indice:'B'}}),'une confirmation de l’indice A ne vaut pas pour l’indice B');
chk(M.elecConfirmationValable({etudeConfirmeeLe:'2026-09-20',plan:{}}),'anciennes confirmations (sans indice) : lisibles et valables');
fin();
