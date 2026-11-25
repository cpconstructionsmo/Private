/* Relevé de visite — le croquis au doigt (releve/croquis.js) : un tracé à main levée devient une pièce aux murs
   droits. Tracés FICTIFS, bruités (une main, pas une règle) ; le bruit est déterministe. */
const {verif}=require('./harness');
const {chk,fin}=verif();
(async()=>{
  const C=await import('../releve/croquis.js');
  /* un « tracé du doigt » : le contour parcouru à pas de 4 cm, avec un tremblement de ±amp m, qui s'arrête un peu avant le départ */
  let g=12345;const alea=()=>{g=(g*1103515245+12345)&0x7fffffff;return g/0x7fffffff-0.5};
  const trace=(P,{amp=0.07,ecart=0.18,depart=0.0}={})=>{
    const pts=[];const n=P.length;let dec=depart;
    for(let i=0;i<n;i++){const a=P[i],b=P[(i+1)%n],L=Math.hypot(b[0]-a[0],b[1]-a[1]);
      for(let s=0;s<L;s+=0.04){const t=s/L;pts.push([a[0]+(b[0]-a[0])*t+alea()*2*amp,a[1]+(b[1]-a[1])*t+alea()*2*amp])}}
    // part d'un point quelconque du contour (le doigt ne démarre pas sur un coin) et revient près du départ sans le toucher
    const k=Math.floor(pts.length*dec);const o=pts.slice(k).concat(pts.slice(0,k));
    o.push([o[0][0]+ecart*0.7,o[0][1]+ecart*0.7]);return o};
  const VUE=14;
  const H=m=>m.classe==='H',V=m=>m.classe==='V';
  const dims=poly=>{const b=C.boite(poly);return [b.x1-b.x0,b.y1-b.y0]};
  const proche=(x,y,e=0.35)=>Math.abs(x-y)<=e;

  /* 1. un rectangle à main levée devient une pièce droite fermée */
  const R=C.pieceDepuisTrace(trace([[0,0],[6,0],[6,4],[0,4]],{depart:0.37}),{vue:VUE});
  chk(!R.erreur&&R.poly.length===4,'rectangle à main levée : une pièce à 4 murs ('+(R.poly&&R.poly.length)+')');
  const mr=C.murs(R.poly,1);
  chk(mr.every(m=>m.classe==='H'||m.classe==='V')&&mr.filter(H).length===2&&mr.filter(V).length===2,'tous les murs sont droits : 2 horizontaux, 2 verticaux');
  const [lr,hr]=dims(R.poly);
  chk(proche(lr,6)&&proche(hr,4),'dimensions proches du tracé (6 × 4 m) : '+lr.toFixed(2)+' × '+hr.toFixed(2));
  chk(C.murs(R.poly,0.001).every(m=>m.classe!=='O'),'angles exactement droits (aucun mur de travers, même à 0,001°)');

  /* 2. une forme en L devient une pièce à 6 murs */
  const L=C.pieceDepuisTrace(trace([[0,0],[6,0],[6,2.5],[3,2.5],[3,5],[0,5]],{depart:0.61}),{vue:VUE});
  chk(!L.erreur&&L.poly.length===6,'forme en L : une pièce à 6 murs ('+(L.poly&&L.poly.length)+')');
  chk(C.murs(L.poly,0.001).every(m=>m.classe!=='O'),'en L : tous les angles sont droits');
  chk(proche(C.aire(L.poly),6*2.5+3*2.5,1.6),'en L : surface proche de 22,5 m² ('+C.aire(L.poly).toFixed(1)+')');
  chk(C.estSimple(L.poly),'en L : les murs ne se croisent pas');

  /* 3. deux pièces tracées côte à côte se collent */
  const A=R.poly;
  const B=C.pieceDepuisTrace(trace([[6.2,0.12],[10,-0.1],[10,4.14],[6.2,3.9]].map(p=>[p[0],p[1]]),{depart:0.2}),{vue:VUE,autres:[A]});
  chk(!B.erreur,'2e pièce tracée près de la 1re : acceptée ('+(B.erreur||'')+')');
  const xA=Math.max(...A.map(p=>p[0]));
  chk(B.poly&&B.poly.some(p=>p[0]===xA)&&Math.min(...B.poly.map(p=>p[0]))===xA,'2e pièce : son mur gauche se colle exactement au mur droit de la 1re (x = '+xA+')');
  const yA0=Math.min(...A.map(p=>p[1])),yA1=Math.max(...A.map(p=>p[1]));
  chk(B.poly&&Math.min(...B.poly.map(p=>p[1]))===yA0&&Math.max(...B.poly.map(p=>p[1]))===yA1,'2e pièce : ses murs haut et bas s’alignent sur ceux de la 1re');
  chk(!C.chevauche(A,B.poly),'les deux pièces se touchent sans se chevaucher');
  const lointaine=C.pieceDepuisTrace(trace([[9,8],[12,8],[12,10.5],[9,10.5]]),{vue:VUE,autres:[A]});
  chk(!lointaine.erreur&&Math.min(...lointaine.poly.map(p=>p[0]))!==xA,'une pièce loin des autres ne s’aimante pas');

  /* chevauchement : refusé */
  const sur=C.pieceDepuisTrace(trace([[3,1],[8,1],[8,3.5],[3,3.5]]),{vue:VUE,autres:[A]});
  chk(sur.erreur&&sur.raison==='chevauche','une pièce tracée sur une autre est refusée ('+sur.raison+')');
  const dansL=C.pieceDepuisTrace(trace([[3.2,2.7],[5.8,2.7],[5.8,4.8],[3.2,4.8]]),{vue:VUE,autres:[L.poly]});
  chk(!dansL.erreur,'une pièce dans l’angle d’un L (sans toucher ses murs) n’est pas un chevauchement');

  /* formes refusées ou particulières */
  chk(C.pieceDepuisTrace([[0,0],[1,0],[2,0.1]],{vue:VUE}).erreur,'tracé trop court : refusé');
  const ouvert=[];for(let i=0;i<=100;i++)ouvert.push([i*0.06,0.02*alea()]);
  chk(C.pieceDepuisTrace(ouvert,{vue:VUE}).raison==='ouvert','un trait qui ne se referme pas : « forme non fermée »');
  const huit=[];for(let i=0;i<=80;i++){const t=i/80*2*Math.PI;huit.push([3*Math.sin(t),2*Math.sin(2*t)])}
  chk(C.pieceDepuisTrace(huit.concat([[0.1,0.05]]),{vue:VUE}).erreur,'un « 8 » (murs qui se croisent) n’est pas une pièce');
  const tri=C.pieceDepuisTrace(trace([[0,0],[5,0],[2.5,4]],{depart:0.1}),{vue:VUE});
  chk(!tri.erreur&&tri.poly.length===3&&C.murs(tri.poly,15).filter(m=>m.classe==='O').length===2,'un triangle garde ses deux murs obliques, la base est redressée');
  const trap=C.pieceDepuisTrace(trace([[0,0],[6,0],[4.2,3],[0,3]],{depart:0.5}),{vue:VUE});
  chk(!trap.erreur&&trap.poly.length===4&&C.murs(trap.poly,15).filter(m=>m.classe==='O').length===1,'un mur nettement diagonal reste diagonal (trapèze : 3 droits, 1 oblique)');

  /* 4. la mise à l'échelle recalcule les surfaces */
  const a0=C.aire(R.poly);
  const f=5/C.murs(R.poly)[0].longueur;
  const R2=C.mettreAEchelle(R.poly,f);
  chk(proche(C.murs(R2)[0].longueur,5,0.002),'mise à l’échelle : le mur choisi mesure bien 5 m');
  chk(Math.abs(C.aire(R2)-a0*f*f)<0.05,'mise à l’échelle : la surface suit le carré du facteur ('+a0.toFixed(1)+' → '+C.aire(R2).toFixed(1)+' m²)');
  chk(C.murs(R2,0.001).every(m=>m.classe!=='O'),'mise à l’échelle : les angles restent droits');

  /* cotes d'un mur et sommets glissés */
  const rect=[[0,0],[6,0],[6,4],[0,4]];
  const r7=C.changerLongueurMur(rect,0,7);
  chk(r7&&C.aire(r7)===28,'mur du haut porté à 7 m : le rectangle devient 7 × 4 (28 m²)');
  const l2=C.changerLongueurMur([[0,0],[6,0],[6,2.5],[3,2.5],[3,5],[0,5]],0,8);
  chk(l2&&l2.length===6&&C.murs(l2,0.001).every(m=>m.classe!=='O')&&C.aire(l2)===8*2.5+3*2.5,'en L : allonger le mur du haut garde 6 murs et les angles droits');
  chk(C.changerLongueurMur(rect,0,0.1)===null,'une cote sous 30 cm est refusée');
  const sm=C.deplacerSommet(rect,2,[7,5]);
  chk(sm&&C.aire(sm)===35&&C.murs(sm,0.001).every(m=>m.classe!=='O'),'sommet glissé : le rectangle devient 7 × 5, angles droits gardés');
  const Lf=[[0,0],[6,0],[6,2.5],[3,2.5],[3,5],[0,5]];
  chk(C.deplacerSommet(Lf,3,[3,-1])===null,'un sommet glissé de façon que les murs se croisent (forme en L) est refusé');
  chk(C.deplacerSommet(rect,2,[0.05,4])===null,'un mur réduit à presque rien est refusé');
  const sma=C.deplacerSommet(rect,2,[9.9,4.08],{autres:[[[10,0],[14,0],[14,4],[10,4]]],seuil:0.3});
  chk(sma&&Math.max(...sma.map(p=>p[0]))===10,'sommet glissé près du mur d’une autre pièce : il s’y aimante');

  /* 6. un trait court sur un mur : une ouverture */
  const pieces=[{id:'a',poly:rect}];
  const tol=C.tolerances(VUE);
  const tr=[[2,0.05],[2.4,-0.04],[2.9,0.03],[3.3,0]];
  const ov=C.ouvertureSurTrait(tr,pieces,{tol:tol.ouverture,longueurMax:tol.ouvertureMax});
  chk(ov&&ov.piece==='a'&&ov.i===0&&Math.abs(ov.au[0]-2.65)<0.2&&ov.au[1]===0,'un trait court le long du mur du haut : ouverture posée au milieu du trait ('+(ov&&ov.au)+')');
  chk(C.ouvertureSurTrait([[1,1.5],[2.5,1.6]],pieces,{tol:tol.ouverture,longueurMax:tol.ouvertureMax})===null,'un trait au milieu de la pièce n’est pas une ouverture');
  chk(C.ouvertureSurTrait([[0.2,0],[5.8,0]],pieces,{tol:tol.ouverture,longueurMax:tol.ouvertureMax})===null,'un trait aussi long que le mur n’est pas une ouverture');
  chk(C.ouvertureSurTrait([[5.9,0.1],[6.05,1.9],[0.2,0.1]],pieces,{tol:tol.ouverture,longueurMax:tol.ouvertureMax})===null,'un trait qui change de mur n’est pas une ouverture');

  /* 7. la gomme */
  const ouvs=[{id:'o1',piece:'a',type:'porte',largeur:0.9,au:[3,0]}];
  chk(JSON.stringify(C.gommer([3.1,0.03],pieces,ouvs,0.25))==='{"type":"ouverture","id":"o1"}','la gomme sur une porte efface la porte');
  chk(JSON.stringify(C.gommer([5,4.02],pieces,ouvs,0.25))==='{"type":"piece","id":"a"}','la gomme sur un mur efface la pièce');
  chk(C.gommer([3,2],pieces,ouvs,0.25)===null,'la gomme au milieu d’une pièce n’efface rien');
  chk(C.recalerOuvertures(ouvs,[{id:'a',poly:[[0,0],[6,0],[6,4],[0,4.0]]}],0.3).length===1&&C.recalerOuvertures(ouvs,[{id:'a',poly:[[0,2],[6,2],[6,4],[0,4]]}],0.3).length===0,'une ouverture suit son mur ; si le mur a disparu, elle disparaît');
  /* le nom d'une pièce se pose au point le plus dégagé */
  const pi=C.pointInterieur(Lf);
  chk(C.dedans(pi,Lf)&&pi[0]<3.2&&pi[1]>0,'pièce en L : le nom se pose franchement dans la pièce, dans son bras le plus large ('+pi.map(v=>v.toFixed(1))+')');
  const pr=C.pointInterieur(rect);
  chk(Math.abs(pr[0]-3)<0.3&&Math.abs(pr[1]-2)<0.3,'rectangle : le nom se pose au centre ('+pr.map(v=>v.toFixed(1))+')');
  fin();
})();
