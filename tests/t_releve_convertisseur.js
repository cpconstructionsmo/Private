/* Relevé de visite — convertisseur OpenPlan 3D (releve/moteur/convertisseur.js)
   sur un scan FICTIF au format Apple RoomPlan, construit ici : une pièce de
   4,00 × 3,97 m, hauteur scannée 2,10 m, et deux portes de part et d'autre
   du même coin (0,726 m et 0,625 m) — la configuration d'un cas réel où une
   seule porte avait été vue deux fois. Aucune donnée de client. */
const {verif}=require('./harness');
const {chk,fin}=verif();
const {convertirRoomPlan,estRoomPlan,doublonsPortesCoin}=require('../releve/moteur/convertisseur.js');

const {porte,scan,portesAuCoin}=require('./releve_scan_fictif');
const coin=portesAuCoin();

const rp=scan(coin);
chk(estRoomPlan(rp),'le scan fictif est reconnu comme un export RoomPlan');
const {donnees,rapport}=convertirRoomPlan(rp);
chk(donnees.pieces.length===1,'une pièce reconstituée');
const aire=rapport.pieces[0].aire;
/* surface intérieure : un peu moins que 4,00 × 3,97 = 15,88 m², l'épaisseur du trait des murs scannés est déduite */
chk(aire>15.4&&aire<15.88,'surface intérieure cohérente avec une pièce de 4,00 × 3,97 m : '+aire.toFixed(2)+' m²');
chk(Math.abs(donnees.hauteurSousPlafond-2.10)<0.01,'hauteur sous plafond reprise du scan (2,10 m), à mesurer ensuite');
chk(donnees.ouvertures.length===2&&donnees.ouvertures.every(o=>o.type==='porte'),'les deux portes sont placées');
const L=donnees.ouvertures.map(o=>o.largeur).sort();
chk(Math.abs(L[0]-0.625)<0.01&&Math.abs(L[1]-0.726)<0.01,'largeurs du scan gardées telles quelles (0,625 et 0,726)');
chk(donnees.ouvertures[0].mur!==donnees.ouvertures[1].mur,'sur deux murs différents');

/* la porte vue deux fois */
const dbl=doublonsPortesCoin(donnees);
chk(dbl.length===1,'une paire suspecte signalée au coin');
chk(dbl[0]&&dbl[0].distA<=0.3&&dbl[0].distB<=0.3,'les deux portes sont à moins de 30 cm du coin commun');
chk(dbl[0]&&[dbl[0].largeurA,dbl[0].largeurB].sort().join()==='0.625,0.726','la paire donne les deux largeurs à comparer');
chk(JSON.stringify(convertirRoomPlan(rp).donnees.ouvertures.length)==='2','rien n’est retiré d’office : la décision revient au métreur');

/* pas de fausse alerte */
const loin=[porte('P1','M1',1,0,1.0,0,0.83),porte('P2','M4',0,1,4,2.5,0.83)];
chk(doublonsPortesCoin(convertirRoomPlan(scan(loin)).donnees).length===0,'deux portes loin du coin : aucune alerte');
const face=[porte('P1','M1',1,0,3.5,0,0.73),porte('P2','M2',1,0,3.5,3.97,0.73)];
chk(doublonsPortesCoin(convertirRoomPlan(scan(face)).donnees).length===0,'deux portes sur des murs opposés : aucune alerte');
const fen={...scan([porte('P1','M1',1,0,4-0.05-0.363,0,0.726)]),windows:[porte('F1','M4',0,1,4,0.4,0.6,1.0)]};
chk(doublonsPortesCoin(convertirRoomPlan(fen).donnees).length===0,'une porte et une fenêtre au même coin : aucune alerte');
chk(doublonsPortesCoin({pieces:[],ouvertures:[]}).length===0&&doublonsPortesCoin(null).length===0,'relevé vide : pas d’erreur');
fin();
