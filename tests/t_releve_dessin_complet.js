/* Relevé de visite — le dessin rapide complet (releve/dessin.js) : pièces
   posées au doigt et aimantées, étages, portes et fenêtres converties en
   ouvertures du moteur (sur le bon mur), symboles, toiture. */
const {verif}=require('./harness');
const {chk,fin}=verif();
(async()=>{
  const D=await import('../releve/dessin.js');
  /* posée où l'on veut */
  const {rect}=D.placer([{id:'a',nom:'A',longueur:4,largeur:3},{id:'b',nom:'B',longueur:2,largeur:2,libre:{x:10,y:-2},contre:{id:'a',cote:'droite'}}]);
  chk(rect.get('b').x0===10&&rect.get('b').y0===-2,'une pièce posée au doigt garde sa position (elle l’emporte sur « contre »)');
  /* aimantée */
  const m=D.aimanter({x0:4.2,y0:0.15,x1:6.2,y1:2.15},[{x0:0,y0:0,x1:4,y1:3}]);
  chk(m.x===4&&m.y===0,'glissée près d’une pièce : elle colle à son mur (x) et s’aligne (y)');
  chk(JSON.stringify(D.aimanter({x0:5,y0:5,x1:6,y1:6},[{x0:0,y0:0,x1:4,y1:3}]))==='{"x":5,"y":5}','loin de tout : rien ne bouge');
  /* étages */
  chk(D.chevauchements([{id:'a',etage:0},{id:'b',etage:1}],new Map([['a',{x0:0,y0:0,x1:4,y1:4}],['b',{x0:1,y0:1,x1:3,y1:3}]])).length===0,'deux étages superposés ne se chevauchent pas');
  chk(D.nomsEtages(['RDC'],[{etage:2}]).join('|')==='RDC|Étage 1|Étage 2'&&D.nomsEtages(null,[]).join()==='Rez-de-chaussée','noms d’étages : saisis, sinon « Étage n »');
  /* ouvertures */
  const P=[{id:'a',nom:'Séjour',longueur:4,largeur:3},{id:'b',nom:'Cuisine',longueur:3,largeur:5,contre:{id:'a',cote:'droite',decalage:0}}];
  const R=D.releveDepuisDessin(P,{ouvertures:[
    {id:'o1',piece:'a',type:'fenetre',cote:'haut',position:1,largeur:1.2},
    {id:'o2',piece:'b',type:'porte',cote:'gauche',position:1,largeur:0.9},
    {id:'o3',piece:'b',type:'portefenetre',cote:'gauche',position:2.5,largeur:0.9},
    {id:'o4',piece:'a',type:'porte',cote:'bas',position:3.5,largeur:0.9},
    {id:'o5',piece:'b',type:'passage',cote:'droite',position:0.5,largeur:1}]});
  const O=R.donnees.ouvertures, par=id=>O.find(o=>o.dessin===id);
  chk(par('o1').type==='fenetre'&&par('o1').mur===0&&par('o1').position===1&&par('o1').largeur===1.2,'fenêtre en haut du séjour : mur 0, à 1 m');
  const pb=R.donnees.pieces.find(p=>p.id==='d-b').points, e2=par('o2');
  chk(e2.piece==='d-b'&&pb[e2.mur][0]===4&&pb[e2.mur][1]===3&&e2.position===1.1,'porte à gauche de la cuisine : sur le bon morceau du mur coupé par le séjour (1,10 m depuis son début)');
  chk(par('o3').type==='fenetre'&&par('o3').hauteur===2.15&&par('o3').allege===0&&par('o3').position===0,'porte-fenêtre à cheval sur le coin du séjour : ramenée dans le mur, hauteur 2,15 m sans allège');
  chk(!par('o4')&&R.erreurs.some(e=>/Porte de « Séjour » : dépasse du mur/.test(e)),'une ouverture qui dépasse du mur est refusée, et dite');
  chk(par('o5').type==='passage'&&R.resume.ouvertures===4,'passage : ouvert sans menuiserie ; 4 ouvertures au résumé');
  chk(R.resume.detail.find(d=>d.id==='d-b').portes===2&&R.resume.detail.find(d=>d.id==='d-a').fenetres===1,'le résumé compte portes et fenêtres par pièce (pour le budget)');
  /* étages et toiture */
  const R2=D.releveDepuisDessin([{id:'a',nom:'Séjour',longueur:5,largeur:4},{id:'c',nom:'Chambre',longueur:5,largeur:4,etage:1,libre:{x:0,y:0}}],
    {etages:['RDC','Étage'],toiture:{type:'2pentes',angle:35},symboles:[{id:'s1',type:'escalier',etage:0,x:1,y:1,rot:90},{id:'s2',type:'inconnu',x:0,y:0},{id:'s3',type:'wc',etage:5,x:2,y:2,rot:45}]});
  chk(!R2.erreurs.length&&R2.donnees.etages.map(e=>e.nom).join()==='RDC,Étage'&&R2.donnees.pieces.find(p=>p.id==='d-c').etage===1,'deux étages : la chambre au-dessus du séjour, sans chevauchement');
  chk(R2.donnees.pieces.find(p=>p.id==='d-a').points.length===4,'les coins d’un autre étage ne coupent pas les murs');
  const T=R2.donnees.toitures[0];
  chk(T.type==='2pentes'&&T.angle===35&&T.pieces.join()==='d-c','toiture 2 pentes sur l’étage le plus haut');
  const S=R2.donnees.symboles;
  chk(S.length===2&&S[0].type==='escalier'&&S[0].rot===90&&S[0].l===2.6&&S[1].etage===1&&S[1].rot===0,'symboles : type connu seulement, étage borné, quart de tour, taille par défaut (trémie 2,60 × 0,90)');
  chk(D.toituresMoteur({type:'aucune'},[{id:'x',etage:0}]).length===0&&D.toituresMoteur(null,[]).length===0,'pas de toiture : rien');
  fin();
})();
