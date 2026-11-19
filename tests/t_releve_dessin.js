/* Relevé de visite — le dessin rapide (releve/dessin.js) : des pièces
   rectangulaires posées les unes contre les autres deviennent un relevé
   pour le moteur, murs communs partagés, résumé calculé. Pièces fictives. */
const {verif}=require('./harness');
const {chk,fin}=verif();
(async()=>{
  const D=await import('../releve/dessin.js');
  const P=[{id:'a',nom:'Séjour',longueur:'5',largeur:'4'},
    {id:'b',nom:'Cuisine',longueur:3,largeur:'2,5',contre:{id:'a',cote:'droite',decalage:0}},
    {id:'c',nom:'Chambre',longueur:3,largeur:3,contre:{id:'a',cote:'bas',decalage:1}}];
  const {rect,erreurs}=D.placer(P);
  chk(!erreurs.length&&JSON.stringify(rect.get('b'))==='{"x0":5,"y0":0,"x1":8,"y1":2.5}'&&JSON.stringify(rect.get('c'))==='{"x0":1,"y0":4,"x1":4,"y1":7}','pièces posées à droite (en haut) et en dessous (décalée de 1 m), virgule acceptée');
  const R=D.releveDepuisDessin(P,{projet:'Maison fictive',hauteur:2.5});
  const sej=R.donnees.pieces.find(p=>p.nom==='Séjour'),cui=R.donnees.pieces.find(p=>p.nom==='Cuisine');
  const a=k=>k.join(',');
  chk(sej.points.map(a).includes('5,2.5')&&sej.points.map(a).includes('1,4')&&sej.points.map(a).includes('4,4'),'le séjour reçoit les coins de ses voisines sur ses murs (mur commun coupé à leurs bouts)');
  chk(cui.points.length===4&&cui.points.map(a).includes('5,0')&&cui.points.map(a).includes('5,2.5'),'la cuisine garde ses 4 coins, partagés avec le séjour');
  chk(R.resume.pieces===3&&R.resume.surface===36.5&&R.resume.detail.find(d=>d.nom==='Cuisine').murs===27.5,'résumé : 3 pièces, 36,5 m², murs de la cuisine 2 × (3 + 2,5) × 2,5 = 27,5 m²');
  chk(R.donnees.pieces.every(p=>p.hauteur===2.5&&p.pointsScan.length===p.points.length)&&R.donnees.ouvertures.length===0,'format du moteur : hauteur, points du « scan » = points dessinés');
  /* erreurs : dimensions, chevauchement */
  chk(D.releveDepuisDessin([{id:'x',nom:'Placard',longueur:0.1,largeur:2}]).erreurs[0].includes('0,30 et 50 m'),'dimension hors bornes : signalée');
  const ch=D.releveDepuisDessin([{id:'a',nom:'A',longueur:4,largeur:4},{id:'b',nom:'B',longueur:3,largeur:3,contre:{id:'a',cote:'droite',decalage:0}},{id:'c',nom:'C',longueur:2,largeur:2,contre:{id:'a',cote:'droite',decalage:1}}]);
  chk(ch.erreurs.some(e=>/« B » et « C » se chevauchent/.test(e)),'deux pièces au même endroit : chevauchement signalé');
  chk(D.releveDepuisDessin([{id:'a',nom:'A',longueur:3,largeur:3},{id:'z',nom:'Seule',longueur:2,largeur:2}]).rect.get('z').x0===4,'une pièce sans voisine se pose à part, à droite');
  chk(D.releveDepuisDessin([{id:'a',nom:'A',longueur:3,largeur:3},{id:'g',nom:'G',longueur:2,largeur:3,contre:{id:'a',cote:'gauche'}},{id:'h',nom:'H',longueur:3,largeur:1.5,contre:{id:'a',cote:'haut'}}]).erreurs.length===0,'à gauche et au-dessus : sans erreur');
  fin();
})();
