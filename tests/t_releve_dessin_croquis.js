/* Relevé de visite — les pièces tracées au doigt dans le modèle du dessin rapide (releve/dessin.js) :
   polygone, mur commun, chevauchement, portes et fenêtres posées sur un mur, passage au moteur. Pièces FICTIVES. */
const {verif}=require('./harness');
const {chk,fin}=verif();
(async()=>{
  const D=await import('../releve/dessin.js');
  const C=await import('../releve/croquis.js');
  const pts=a=>a.map(q=>q.join(',')).join(' ');
  /* un rectangle tracé = le même relevé qu'un rectangle saisi (rien ne change pour les anciennes pièces) */
  const saisi=D.releveDepuisDessin([{id:'a',nom:'Séjour',longueur:6,largeur:4}],{hauteur:2.5});
  const trace=D.releveDepuisDessin([{id:'a',nom:'Séjour',poly:[[0,0],[6,0],[6,4],[0,4]],longueur:6,largeur:4}],{hauteur:2.5});
  chk(JSON.stringify(saisi.donnees.pieces[0].points)===JSON.stringify(trace.donnees.pieces[0].points),'rectangle tracé = rectangle saisi : même contour pour le moteur');
  chk(trace.resume.surface===24&&!trace.erreurs.length,'surface 24 m², aucune erreur');
  /* tracé dans l'autre sens : le moteur reçoit toujours le sens des aiguilles d'une montre */
  const inverse=D.releveDepuisDessin([{id:'a',nom:'S',poly:[[0,4],[6,4],[6,0],[0,0]]}],{});
  chk(JSON.stringify(inverse.donnees.pieces[0].points)===JSON.stringify(saisi.donnees.pieces[0].points)||inverse.donnees.pieces[0].points.length===4&&C.aire(inverse.donnees.pieces[0].points)===24,'pièce tracée à l’envers : contour remis dans le sens du moteur');
  const sens=P=>P.reduce((t,q,i)=>{const n=P[(i+1)%P.length];return t+q[0]*n[1]-n[0]*q[1]},0)>0;
  chk(sens(inverse.donnees.pieces[0].points),'sens horaire à l’écran, comme les rectangles');
  /* forme en L : 6 murs, surface exacte */
  const L=D.releveDepuisDessin([{id:'l',nom:'Salon',poly:[[0,0],[6,0],[6,2.5],[3,2.5],[3,5],[0,5]]}],{});
  chk(L.donnees.pieces[0].points.length===6&&L.resume.surface===22.5,'forme en L : 6 murs, 22,5 m²');
  chk(L.resume.detail[0].perimetre===22&&L.resume.detail[0].murs===55,'périmètre 22 m et 55 m² de murs (hauteur 2,5 m)');
  /* deux pièces tracées côte à côte : mur commun, sommets de l'une posés sur le mur de l'autre */
  const AB=D.releveDepuisDessin([{id:'a',nom:'A',poly:[[0,0],[6,0],[6,4],[0,4]]},{id:'b',nom:'B',poly:[[6,1],[10,1],[10,3],[6,3]]}],{});
  const pa=AB.donnees.pieces.find(x=>x.id==='d-a').points;
  chk(pa.some(q=>q[0]===6&&q[1]===1)&&pa.some(q=>q[0]===6&&q[1]===3)&&pa.length===6,'le mur de A reçoit les deux coins de B (le moteur n’y voit qu’un mur) : '+pa.length+' sommets');
  chk(!AB.erreurs.length,'deux pièces qui se touchent : pas de chevauchement');
  const CH=D.releveDepuisDessin([{id:'a',nom:'A',poly:[[0,0],[6,0],[6,4],[0,4]]},{id:'b',nom:'B',poly:[[4,1],[9,1],[9,3],[4,3]]}],{});
  chk(CH.erreurs.some(e=>/chevauchent/.test(e)),'deux pièces qui se superposent : refusé avec un message');
  /* un rectangle saisi à côté d'une pièce tracée : les deux se mélangent */
  const MIX=D.releveDepuisDessin([{id:'a',nom:'A',poly:[[0,0],[6,0],[6,4],[0,4]]},{id:'r',nom:'R',longueur:3,largeur:2,libre:{x:6,y:1}}],{});
  const pr=MIX.donnees.pieces.find(x=>x.id==='d-a').points;
  chk(!MIX.erreurs.length&&pr.length===6,'pièce rectangulaire collée à une pièce tracée : mur commun, aucune erreur');
  /* dans l'angle d'un L : ni chevauchement ni mur commun parasite */
  const ANG=D.releveDepuisDessin([{id:'l',nom:'L',poly:[[0,0],[6,0],[6,2.5],[3,2.5],[3,5],[0,5]]},{id:'n',nom:'Coin',poly:[[3,2.5],[6,2.5],[6,5],[3,5]]}],{});
  chk(!ANG.erreurs.length,'pièce posée dans l’angle d’un L : pas de chevauchement');
  /* portes et fenêtres posées sur un mur par un point */
  const O=D.releveDepuisDessin([{id:'a',nom:'Séjour',poly:[[0,0],[6,0],[6,4],[0,4]]}],{ouvertures:[
    {id:'p',piece:'a',type:'porte',largeur:0.9,au:[2,0]},{id:'f',piece:'a',type:'fenetre',largeur:1.2,au:[6,2]},{id:'b',piece:'a',type:'portefenetre',largeur:1.6,au:[3,4]}]});
  chk(!O.erreurs.length&&O.donnees.ouvertures.length===3,'3 ouvertures posées par un point du mur : acceptées');
  const pm=O.donnees.pieces[0].points,porte=O.donnees.ouvertures.find(x=>x.dessin==='p');
  chk(porte.mur===0&&Math.abs(porte.position-(2-0.45))<0.001&&porte.largeur===0.9,'la porte est sur le mur du haut, centrée sur le point (position 1,55 m)');
  chk(O.donnees.ouvertures.find(x=>x.dessin==='f').mur===1&&O.donnees.ouvertures.find(x=>x.dessin==='b').mur===2,'la fenêtre est sur le mur de droite, la baie sur celui du bas');
  chk(O.resume.detail[0].portes===1&&O.resume.detail[0].fenetres===2,'comptes du résumé : 1 porte et 2 fenêtres (la baie vitrée est une fenêtre pour le moteur)');
  const ErrO=D.releveDepuisDessin([{id:'a',nom:'A',poly:[[0,0],[6,0],[6,4],[0,4]]}],{ouvertures:[{id:'x',piece:'a',type:'porte',largeur:0.9,au:[3,2]}]});
  chk(ErrO.erreurs.some(e=>/mur introuvable/.test(e)),'une ouverture loin de tout mur est signalée');
  const Trop=D.releveDepuisDessin([{id:'a',nom:'A',poly:[[0,0],[1,0],[1,4],[0,4]]}],{ouvertures:[{id:'x',piece:'a',type:'fenetre',largeur:2,au:[0.5,0]}]});
  chk(Trop.erreurs.some(e=>/plus large/.test(e)),'une ouverture plus large que son mur est signalée');
  /* dimensions hors bornes */
  chk(D.releveDepuisDessin([{id:'a',nom:'Minus',poly:[[0,0],[0.1,0],[0.1,0.1]]}],{}).erreurs.length===1,'une pièce minuscule est signalée');
  /* le moteur accepte le relevé (pièces, murs) : les points sont dans le format attendu */
  chk(AB.donnees.pieces.every(x=>x.pointsScan.length===x.points.length&&x.dessinRapide&&x.hauteur===2.5),'format du moteur : points du « scan », hauteur, marque « dessin rapide »');
  fin();
})();
