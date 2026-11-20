/* Relevé de visite — un plan 2D lu par l'IA devient un dessin rapide
   (releve/dessin.js : dessinDepuisRectangles). Plan FICTIF : une maison de
   trois pièces en L et une dépendance séparée par un mur épais. */
const {verif}=require('./harness');
const {chk,fin}=verif();
(async()=>{
  const D=await import('../releve/dessin.js');
  const rects=[
    {nom:'Salon',longueur:4.30,largeur:5.49,x:5.2,y:0},
    {nom:'Cuisine',longueur:4.60,largeur:3.65,x:0,y:2.0},
    {nom:'Couloir',longueur:0.5,largeur:3,x:4.7,y:2.2},
    {nom:'Dépendance',longueur:4.80,largeur:5.50,x:10.0,y:0},     // mur de 50 cm entre le salon et elle
    {nom:'Abri',longueur:2,largeur:2,x:30,y:30},                    // ne touche personne
    {nom:'Faux',longueur:0.1,largeur:3,x:1,y:1}];                   // hors bornes : écartée
  const P=D.dessinDepuisRectangles(rects);
  chk(P.length===5&&!P.some(p=>p.nom==='Faux'),'dimension hors bornes écartée, les autres pièces gardées');
  chk(P[0].nom==='Cuisine'&&!P[0].contre,'la première pièce posée est la plus en haut à gauche');
  const par=n=>P.find(p=>p.nom===n);
  chk(par('Couloir').contre.cote==='droite'&&par('Couloir').contre.id===par('Cuisine').id&&par('Couloir').contre.decalage===0.2,'le couloir se pose à droite de la cuisine, décalé de 0,20 m');
  chk(par('Dépendance').contre.cote==='droite'&&par('Dépendance').contre.id===par('Salon').id&&par('Dépendance').contre.decalage===0,'un mur de 50 cm est enjambé : la dépendance est à droite du salon');
  chk(!!par('Abri').contre,'une pièce isolée se pose contre la plus proche');
  const {rect,erreurs}=D.placer(P);
  chk(!erreurs.length&&rect.size===5,'le dessin obtenu se place sans erreur');
  const s=rect.get(par('Salon').id), c=rect.get(par('Cuisine').id);
  chk(Math.abs((s.x1-s.x0)-4.30)<1e-9&&Math.abs((s.y1-s.y0)-5.49)<1e-9,'dimensions gardées : salon 4,30 × 5,49');
  chk(D.chevauchements(P,rect).length===0,'aucun chevauchement entre les pièces posées');
  chk(D.dessinDepuisRectangles([]).length===0&&D.dessinDepuisRectangles(null).length===0,'rien lu : aucun dessin');
  const R=D.releveDepuisDessin(P,{hauteur:2.5});
  chk(R.resume.pieces===5&&R.resume.surface>60,'le relevé du moteur et son résumé se calculent ('+R.resume.surface+' m²)');
  /* deux voisines de 5,49 et 5,50 m (arrondis du plan) : alignées, aucun mur nul pour le moteur */
  const P2=D.dessinDepuisRectangles([{nom:'Salon',longueur:4.3,largeur:5.49,x:0,y:0},{nom:'Dépendance',longueur:4.8,largeur:5.5,x:4.8,y:0.01}]);
  chk(P2[1].largeur===5.49&&P2[1].contre.decalage===0,'à 3 cm près, la voisine s’aligne (5,50 → 5,49, décalage 0,01 → 0)');
  const R2=D.releveDepuisDessin([{id:'a',nom:'A',longueur:4.3,largeur:5.49},{id:'b',nom:'B',longueur:4.8,largeur:5.5,contre:{id:'a',cote:'droite',decalage:0}}]);
  const court=R2.donnees.pieces.some(q=>q.points.some((pt,i,t)=>{const n=t[(i+1)%t.length];return Math.hypot(n[0]-pt[0],n[1]-pt[1])<0.03}));
  chk(!court,'dessin à la main, 5,49 et 5,50 côte à côte : pas de bout de mur de 1 cm (refusé par le moteur)');
  fin();
})();
