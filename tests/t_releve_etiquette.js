/* Relevé de visite — le nom d'une pièce tient dans sa pièce (releve/dessin.js, nomAjuste et
   tailleSurface) : il rapetisse, puis est raccourci, au lieu de déborder sur les voisines et de
   cacher leurs cotes. Pièces FICTIVES. */
const {verif}=require('./harness');
const {chk,fin}=verif();
(async()=>{
  const DR=await import('../releve/dessin.js');
  const t=0.4;
  let r=DR.nomAjuste('Salon',4.3,t);
  chk(r.texte==='Salon'&&r.taille===t&&!r.tronque,'une grande pièce : le nom garde la taille de base');
  r=DR.nomAjuste('Dégagement',1.9,t);
  chk(r.texte==='Dégagement'&&r.taille<t&&r.taille>=0.17&&!r.tronque,'un couloir de 1,9 m : « Dégagement » rapetisse (taille '+r.taille+') mais reste entier');
  chk(r.taille*0.6*'Dégagement'.length<=1.9,'et il tient dans la largeur de la pièce (pas de débordement sur les voisines)');
  r=DR.nomAjuste('Salle de bain',1.97,t);
  chk(r.texte==='Salle de bain'&&r.taille*0.6*13<=1.97,'« Salle de bain » dans 1,97 m : entier, ajusté');
  r=DR.nomAjuste('Salle de bain',0.8,t);
  chk(r.tronque&&/…$/.test(r.texte)&&r.texte.length<13&&r.taille===0.17,'une pièce de 0,8 m : le nom est raccourci par « … » à la taille minimale ('+r.texte+')');
  chk(DR.nomAjuste('',3,t).texte==='Pièce'&&DR.nomAjuste(null,3,t).texte==='Pièce','nom vide : « Pièce »');
  chk(DR.nomAjuste('Cuisine',0,t).texte.length>=3&&DR.nomAjuste('Cuisine',undefined,undefined).taille>0,'largeur ou taille inconnue : jamais d’erreur, une taille lisible');
  chk(DR.nomAjuste('A',0.2,t).texte==='A'&&!DR.nomAjuste('A',0.2,t).tronque,'un nom d’une lettre n’est jamais raccourci');
  const grand=DR.nomAjuste('Dégagement',1.9,t).taille, petit=DR.nomAjuste('Dégagement',1.2,t).taille;
  chk(petit<grand,'plus la pièce est étroite, plus le nom rapetisse');
  const ts=DR.tailleSurface('15,28 m²',1.9,0.3);
  chk(ts<=0.3*0.8&&ts*0.55*'15,28 m²'.length<=1.9,'la surface écrite sous le nom ne dépasse pas la pièce ('+ts.toFixed(3)+')');
  chk(DR.tailleSurface('15,28 m²',4,0.3)===0.3*0.8,'dans une grande pièce : 0,8 × la taille du nom');
  chk(DR.tailleSurface('15,28 m²',0.1,0.3)>=0.1,'une pièce minuscule : la surface garde une taille plancher');
  fin();
})();
