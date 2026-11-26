/* Relevé de visite — la surface écrite sur le plan comparée aux cotes lues (releve/dessin.js,
   ecartsSurface) : une cote mal lue (la cote totale du bâtiment prise pour celle d'un couloir)
   fait un écart de surface, signalé « à vérifier » sans rien corriger. Pièces FICTIVES,
   chiffres d'un cas réel simplifié. */
const {verif}=require('./harness');
const {chk,fin}=verif();
(async()=>{
  const DR=await import('../releve/dessin.js');
  const lues=[
    {nom:'Cuisine',longueur:4.6,largeur:4.58,surface:21.04,x:0,y:3.3},
    {nom:'Dégagement',longueur:1.9,largeur:8.66,surface:15.28,x:5.3,y:0},
    {nom:'WC',longueur:2.52,largeur:1.45,surface:3.65,x:2.1,y:0},
    {nom:'Salon',longueur:4.3,largeur:5.5,surface:23.65,x:7.3,y:2.4},
    {nom:'Séjour sans surface',longueur:3,largeur:4,x:0,y:9},
  ];
  const e=DR.ecartsSurface(lues);
  chk(e.length===1&&e[0].nom==='Dégagement','seul le couloir est signalé : 1,9 × 8,66 = 16,45 m² contre 15,28 écrits ('+e.map(x=>x.nom).join(',')+')');
  chk(e[0].lue===16.45&&e[0].ecrite===15.28&&e[0].pct===8,'chiffres : lue 16,45 m², écrite 15,28 m², écart 8 %');
  chk(/Dégagement : cotes lues 1,9 × 8,66 = 16,45 m², surface écrite sur le plan 15,28 m² \(écart 8 %, une cote est peut-être mal lue\)/.test(e[0].texte),'le texte dit les cotes, les deux surfaces et l’écart, en français');
  chk(DR.ecartsSurface([{nom:'Cuisine',longueur:4.6,largeur:4.58,surface:21.04}]).length===0,'cuisine : 21,07 contre 21,04 m² (0,1 %) : pas d’alerte');
  chk(DR.ecartsSurface([{nom:'A',longueur:3,largeur:4}]).length===0&&DR.ecartsSurface([{nom:'A',longueur:3,largeur:4,surface:null}]).length===0&&DR.ecartsSurface([{nom:'A',longueur:3,largeur:4,surface:0}]).length===0&&DR.ecartsSurface([{nom:'A',longueur:3,largeur:4,surface:'abc'}]).length===0,'sans surface écrite (absente, nulle, illisible) : aucune alerte, rien d’inventé');
  chk(DR.ecartsSurface([{nom:'A',longueur:3,largeur:4,surface:12.3}]).length===0,'3 % ou moins : pas d’alerte (12 m² contre 12,3)');
  chk(DR.ecartsSurface([{nom:'A',longueur:3,largeur:4,surface:11.5}]).length===1,'plus de 3 % : alerte (12 m² contre 11,5)');
  chk(DR.ecartsSurface([{nom:'Placard',longueur:1,largeur:1.1,surface:1.0}]).length===0,'moins de 0,3 m² d’écart : pas d’alerte même au-delà de 3 % (placard de 1,1 m² contre 1)');
  chk(DR.ecartsSurface([{nom:'A',longueur:'3,0',largeur:'4,0',surface:'11,5'}]).length===1,'les nombres écrits à la française (« 3,0 », « 11,5 ») sont lus');
  const m=DR.ecartsSurface([{nom:'Petit',longueur:2,largeur:2,surface:3},{nom:'Grand',longueur:5,largeur:5,surface:20},{nom:'Moyen',longueur:4,largeur:4,surface:13}]);
  chk(m.map(x=>x.nom).join()==='Petit,Grand,Moyen'||m.map(x=>x.nom).join()==='Grand,Petit,Moyen','plusieurs écarts : du plus gros au plus petit ('+m.map(x=>x.nom+' '+x.pct+' %').join(', ')+')');
  chk(m[0].pct>=m[1].pct&&m[1].pct>=m[2].pct,'l’ordre suit bien les pourcentages');
  const autre=DR.ecartsSurface([{nom:'L',longueur:4,largeur:4,surface:12,forme:'autre'}]);
  chk(autre.length===1&&autre[0].autre&&/pièce non rectangulaire/.test(autre[0].texte)&&!/mal lue/.test(autre[0].texte),'une pièce non rectangulaire (lue comme son rectangle) dépasse forcément : l’alerte le dit, sans accuser la lecture');
  chk(DR.ecartsSurface(null).length===0&&DR.ecartsSurface([null,undefined,{}]).length===0,'entrée vide ou absente : aucune alerte, aucune erreur');

  /* dans la lecture : la liste des écarts accompagne les pièces, et la note de la pièce le dit */
  const l=DR.dessinDepuisLecture(lues,i=>'p'+(i+1));
  chk(l.ecarts.length===1&&l.ecarts[0].nom==='Dégagement','dessinDepuisLecture rend les écarts avec les pièces');
  const deg=l.pieces.find(p=>p.nom==='Dégagement'), cu=l.pieces.find(p=>p.nom==='Cuisine');
  chk(/Surface à vérifier : 16,45 m² d’après les cotes lues, 15,28 m² écrits sur le plan/.test(deg.note||''),'la note de la pièce porte l’alerte (elle reste dans le plan et le PDF)');
  chk(!cu.note,'une pièce sans écart n’a aucune note ajoutée');
  chk(deg.longueur===1.9&&deg.largeur===8.66,'les cotes lues ne sont PAS corrigées d’office : c’est à l’utilisateur de décider');
  chk(DR.dessinDepuisLecture([{nom:'Salon',longueur:4.3,largeur:5.5}],i=>'p'+(i+1)).ecarts.length===0,'une lecture sans surface (ancienne fonction) : aucun écart, rien ne change');
  fin();
})();
