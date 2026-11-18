/* Relevé de visite — plusieurs scans reliés pièce par pièce
   (releve/moteur/assemblage.js) : ajouter un scan à droite du plan, puis
   relier deux murs de deux scans pour que les pièces se touchent. Pièces
   fictives (rectangles en mètres) et scan fictif RoomPlan. */
const {verif}=require('./harness');
const {chk,fin}=verif();
const A=require('../releve/moteur/assemblage.js');
const {convertirRoomPlan}=require('../releve/moteur/convertisseur.js');
const {scan}=require('./releve_scan_fictif');

const rect=(id,nom,x,y,w,h)=>({id,nom,points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],hauteur:2.5});
/* scan 1 : un séjour de 5 × 4 ; scan 2 (son propre repère) : une cuisine de 3 × 4 et un cellier */
const d1={projet:'Scan 1',pieces:[rect('p1','Séjour',0,0,5,4)],ouvertures:[{type:'porte',piece:'p1',mur:1,position:1,largeur:0.9,hauteur:2.04,allege:0}]};
const d2={pieces:[rect('p1','Cuisine',10,10,3,4),rect('p2','Séjour',13,10,2,4)],ouvertures:[{type:'fenetre',piece:'p1',mur:0,position:1,largeur:1.2,hauteur:1.2,allege:1}]};

const r=A.ajouterScan(d1,d2,{nom:'Cuisine',etage:0});
const d=r.donnees;
chk(r.scan===2&&d.pieces.length===3&&d.scans.map(s=>s.nom).join()==='Scan 1,Cuisine','le scan ajouté porte le numéro 2 et son nom');
chk(d1.pieces.length===1&&!d1.scans,'le relevé d’origine n’est pas modifié (copie)');
const cuis=d.pieces.find(p=>p.nom==='Cuisine');
chk(cuis.id==='s2-p1'&&d.pieces.some(p=>p.nom==='Séjour 2'&&p.id==='s2-p2'),'identifiants préfixés, nom déjà pris numéroté (« Séjour 2 »)');
chk(d.ouvertures.length===2&&d.ouvertures[1].piece==='s2-p1'&&d.ouvertures[0].piece==='p1','les ouvertures suivent leur pièce');
chk(Math.min(...cuis.pointsScan.map(q=>q[0]))===6&&Math.min(...cuis.pointsScan.map(q=>q[1]))===0,'posé à droite du plan (1 m d’écart), aligné en haut');
chk(d.pieces.find(p=>p.id==='p1').scan===1&&cuis.scan===2,'chaque pièce sait de quel scan elle vient');
chk(A.scans(d).length===2&&A.scans(d)[1].pieces.length===2,'liste des scans et de leurs pièces');

/* relier : le mur droit du séjour (mur 1, x = 5) au mur gauche de la cuisine (mur 3, x = 6) */
const l=A.relierMurs(d,{piece:'p1',mur:1},{piece:'s2-p1',mur:3},0);
const c2=l.donnees.pieces.find(p=>p.id==='s2-p1'), s2=l.donnees.pieces.find(p=>p.id==='s2-p2');
const xs=p=>p.pointsScan.map(q=>q[0]);
chk(Math.min(...xs(c2))===5&&Math.max(...xs(c2))===8&&Math.max(...xs(s2))===10,'tout le scan 2 glisse : la cuisine touche le séjour, le cellier suit');
chk(l.rotationDeg===0&&l.recouvrement===4,'murs d’équerre : aucune rotation, recouvrement sur 4 m');
chk(c2.pointsScan.length===4&&l.donnees.pieces.find(p=>p.id==='p1').pointsScan.length===4,'mêmes longueurs : aucun mur coupé');
const cle=q=>q.join(',');
const mursSej=new Set([[5,0],[5,4]].map(cle));
chk(c2.pointsScan.filter(q=>mursSej.has(cle(q))).length===2,'les deux murs ont les mêmes coins : un seul mur commun');

/* décalage le long du mur : la cuisine descend de 1 m, les murs sont coupés aux bouts de l'autre */
const l2=A.relierMurs(d,{piece:'p1',mur:1},{piece:'s2-p1',mur:3},1);
const sej2=l2.donnees.pieces.find(p=>p.id==='p1'), c3=l2.donnees.pieces.find(p=>p.id==='s2-p1');
chk(Math.min(...c3.pointsScan.map(q=>q[1]))===1,'décalage de 1 m le long du mur');
chk(sej2.pointsScan.length===5&&sej2.pointsScan.some(q=>q[0]===5&&q[1]===1),'le mur du séjour est coupé là où commence la cuisine');
chk(c3.pointsScan.length===5&&c3.pointsScan.some(q=>q[0]===5&&q[1]===4),'le mur de la cuisine est coupé au bout du séjour');
const porte=l2.donnees.ouvertures.find(o=>o.piece==='p1');
chk(porte.mur===2&&porte.position===0,'la porte du séjour (à 1 m) passe sur le second morceau du mur coupé, sans bouger');
chk(l2.recouvrement===3&&!l2.avertissements.length,'recouvrement 3 m, rien à signaler');
chk(A.relierMurs(d,{piece:'p1',mur:1},{piece:'s2-p1',mur:3},6).avertissements.some(t=>/ne se recouvrent plus/.test(t)),'décalage trop grand : signalé');

/* un scan tourné d'un quart de tour : il est remis d'équerre */
const tourne={pieces:[{id:'p1',nom:'Chambre',points:[[0,0],[0,3],[-4,3],[-4,0]],hauteur:2.5}],ouvertures:[]};
const d3=A.ajouterScan(d1,tourne,{}).donnees;
const ch=d3.pieces.find(p=>p.nom==='Chambre');
/* son mur 1 (de (…,3) à (…,3), longueur 4) contre le mur 2 du séjour (bas, y = 4) */
const l3=A.relierMurs(d3,{piece:'p1',mur:2},{piece:ch.id,mur:1},0);
const ch2=l3.donnees.pieces.find(p=>p.nom==='Chambre');
const ys=ch2.pointsScan.map(q=>q[1]), xs2=ch2.pointsScan.map(q=>q[0]);
chk(l3.rotationDeg%90===0&&Math.min(...ys)===4&&Math.max(...ys)===7&&Math.min(...xs2)===0.5&&Math.max(...xs2)===4.5,'quart de tour : la chambre est posée sous le séjour, centrée sur son mur ('+l3.rotationDeg+'°)');
const aire=pts=>Math.abs(pts.reduce((s,p,i)=>{const q=pts[(i+1)%pts.length];return s+p[0]*q[1]-q[0]*p[1]},0)/2);
chk(Math.abs(aire(ch2.pointsScan)-12)<1e-6,'la surface ne change pas (12 m²)');

/* refus */
let err='';try{A.relierMurs(d,{piece:'s2-p1',mur:1},{piece:'s2-p2',mur:3},0)}catch(e){err=e.message}
chk(/même scan/.test(err),'deux murs du même scan : refusé, avec la raison');
err='';try{A.ajouterScan(d1,{pieces:[]})}catch(e){err=e.message}
chk(/aucune pièce/.test(err),'scan vide : refusé');

/* mesures : un déplacement ne change aucune longueur ; un mur coupé perd sa mesure (signalé) */
const dm=JSON.parse(JSON.stringify(d));dm.pieces.find(p=>p.id==='p1').mesuresMurs={1:4.02,0:5};
const lm=A.relierMurs(dm,{piece:'p1',mur:1},{piece:'s2-p1',mur:3},1);
const pm=lm.donnees.pieces.find(p=>p.id==='p1');
chk(pm.mesuresMurs[0]===5&&pm.mesuresMurs[1]===undefined&&lm.avertissements.some(t=>/mesure saisie/.test(t)),'mur coupé : sa mesure est retirée et signalée, les autres gardées');

/* deux vrais scans convertis (scan fictif RoomPlan) */
const conv1=convertirRoomPlan(scan([])).donnees, conv2=convertirRoomPlan(scan([])).donnees;
const dd=A.ajouterScan(conv1,conv2,{nom:'Pièce 2'}).donnees;
const pA=dd.pieces[0], pB=dd.pieces[1];
chk(pA.nom==='Pièce 1'&&pB.nom==='Pièce 2','nom par défaut déjà pris : « Pièce 2 », pas « Pièce 1 2 »');
const murDroit=pts=>pts.findIndex((q,i)=>{const r=pts[(i+1)%pts.length];return Math.abs(q[0]-r[0])<1e-6&&q[0]>=Math.max(...pts.map(p=>p[0]))-1e-6});
const murGauche=pts=>pts.findIndex((q,i)=>{const r=pts[(i+1)%pts.length];return Math.abs(q[0]-r[0])<1e-6&&q[0]<=Math.min(...pts.map(p=>p[0]))+1e-6});
const ld=A.relierMurs(dd,{piece:pA.id,mur:murDroit(pA.pointsScan)},{piece:pB.id,mur:murGauche(pB.pointsScan)},0);
const qA=ld.donnees.pieces[0].pointsScan, qB=ld.donnees.pieces[1].pointsScan;
chk(Math.abs(Math.max(...qA.map(q=>q[0]))-Math.min(...qB.map(q=>q[0])))<0.002,'deux scans RoomPlan convertis : les pièces se touchent par leur mur commun');
fin();
