/* Relevé de visite — le modèle (releve/modele.js) : modifications datées
   champ par champ, fusion entre deux appareils sans perte, suppressions qui
   ne reviennent pas, contrôles de saisie. Aucune donnée réelle. */
const {verif}=require('./harness');
const {chk,fin}=verif();
(async()=>{
  const M=await import('../releve/modele.js');
  const t=n=>'2026-11-17T10:00:'+String(n).padStart(2,'0')+'.000Z';

  let v=M.nouvelleVisite(t(0),'v1');
  chk(v.valeurs.statut==='en_cours'&&v.valeurs.etape==='garde','une nouvelle visite commence à la photo de garde');
  v=M.modifier(v,'client.nom','Fictif',t(1));
  chk(M.valeur(v,'client.nom')==='Fictif'&&v.maj['client.nom']===t(1),'un champ modifié garde son heure');
  const v2=M.modifier(v,'client.nom','Fictif',t(9));
  chk(v2===v,'une valeur identique ne change rien, pas même l’heure (sinon elle écraserait l’autre appareil)');
  let refus=false;try{M.modifier(v,'client.nmo','x')}catch(e){refus=true}
  chk(refus,'un champ inconnu est refusé (faute de frappe visible au test)');
  chk(M.valeur(M.modifier(v,'projet.enveloppe','45 000',t(2)),'projet.enveloppe')===45000,'l’enveloppe tapée « 45 000 » devient 45000');
  chk(M.valeur(M.modifier(v,'projet.enveloppe','-5',t(2)),'projet.enveloppe')===null,'une enveloppe négative est ignorée');
  chk(M.valeur(M.modifier(v,'projet.types',['Cuisine','Cuisine','Peinture'],t(2)),'projet.types').length===2,'les types de travaux sont sans doublon');

  /* deux appareils, chacun de son côté */
  let iphone=M.modifier(M.modifier(v,'client.telephone','06 00 00 00 00',t(3)),'client.nom','Fictif-Dupont',t(5));
  let pc=M.modifier(M.modifier(v,'client.email','client@exemple.fr',t(4)),'client.nom','Fictif',t(2));
  const f=M.fusionner(iphone,pc);
  chk(M.valeur(f,'client.telephone')==='06 00 00 00 00'&&M.valeur(f,'client.email')==='client@exemple.fr','fusion : les champs saisis de chaque côté sont tous gardés');
  chk(M.valeur(f,'client.nom')==='Fictif-Dupont','fusion : sur le même champ, la saisie la plus récente l’emporte');
  chk(M.empreinte(M.fusionner(iphone,pc))===M.empreinte(M.fusionner(pc,iphone)),'la fusion donne le même résultat dans les deux sens');
  chk(M.empreinte(M.fusionner(f,f))===M.empreinte(f),'fusionner une visite avec elle-même ne change rien');
  const conflit1=M.modifier(v,'notes','A',t(7)),conflit2=M.modifier(v,'notes','B',t(7));
  chk(M.valeur(M.fusionner(conflit1,conflit2),'notes')===M.valeur(M.fusionner(conflit2,conflit1),'notes'),'même heure sur les deux appareils : résultat identique dans les deux sens');

  /* pièces et photos */
  let a=M.ajouterPiece(v,'Cuisine',t(3),'p1');
  a=M.ajouterPhoto(a,{id:'ph1',pieceId:'p1'},t(3));
  let b=M.majElement(a,'photos','ph1',{chemin:'v1/ph1.jpg'},t(4));
  a=M.majElement(a,'photos','ph1',{legende:'mur nord'},t(6));
  let g=M.fusionner(a,b);
  chk(g.photos.ph1.legende==='mur nord'&&g.photos.ph1.chemin==='v1/ph1.jpg','photo : la légende retouchée et le chemin d’envoi se rejoignent');
  const sup=M.supprimer(a,'photos','ph1',t(5));
  const retouche=M.majElement(a,'photos','ph1',{legende:'autre'},t(8));
  chk(M.fusionner(sup,retouche).photos.ph1.supprime===true,'une photo supprimée sur un appareil ne revient pas, même retouchée ailleurs');
  chk(M.actifs(M.fusionner(sup,retouche).photos).length===0,'la photo supprimée n’est plus listée');
  const pieceIphone=M.ajouterPiece(v,'Salle de bains',t(3),'p2');
  chk(Object.keys(M.fusionner(a,pieceIphone).pieces).length===2,'des pièces ajoutées sur deux appareils sont toutes gardées');

  /* contrôles */
  chk(M.telephoneValide('06 12 34 56 78')&&M.telephoneValide('+33 6 12 34 56 78')&&!M.telephoneValide('12 34'),'téléphone : formats français et international');
  chk(M.emailValide('a@b.fr')&&!M.emailValide('a@b')&&M.emailValide(''),'e-mail : vérifié seulement s’il est saisi');
  const m=M.manques(M.nouvelleVisite(t(0),'v9'));
  chk(m.includes('photo de garde')&&m.includes('nom du client')&&m.includes('adresse'),'le récapitulatif dit ce qui manque');
  chk(M.intitule(M.modifier(M.modifier(v,'client.civilite','Mme',t(1)),'client.prenom','Anne',t(1)))==='Mme Anne Fictif','intitulé : civilité, prénom, nom');
  chk(M.derniereMaj(f)===t(5),'heure de dernière modification');
  fin();
})();
