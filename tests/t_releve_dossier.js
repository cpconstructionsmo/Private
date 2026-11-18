/* Relevé de visite — le dossier client (releve/dossier.js) : ce qu'il
   contient, ce qu'il ne contient jamais (notes de visite, marge), les
   options. Visite et prix FICTIFS. */
const {verif}=require('./harness');
const {chk,fin}=verif();
(async()=>{
  const M=await import('../releve/modele.js'), B=await import('../releve/budget.js'), D=await import('../releve/dossier.js');
  let v=M.nouvelleVisite();
  const poser=(k,x)=>{v=M.modifier(v,k,x)};
  poser('client.civilite','Mme');poser('client.nom','FICTIF');poser('client.prenom','Anne');poser('client.telephone','06 00 00 00 00');
  poser('client.adresse','1 rue Imaginaire');poser('client.codePostal','61000');poser('client.ville','Alençon');
  poser('client.nbAcheteurs',2);poser('acheteur2.civilite','M.');poser('acheteur2.nom','FICTIF');poser('acheteur2.prenom','Paul');
  poser('acheteur2.domicileIdem',false);poser('acheteur2.domicile','5 place Fictive 72000 Le Mans');
  poser('bien.usage','Locatif');poser('projet.categories',['Rénovation partielle']);poser('projet.types',['Cuisine','Autre']);poser('projet.typeAutre','Véranda');
  poser('projet.situation','Cuisine des années 80.');poser('projet.souhaits','Cuisine ouverte.');poser('projet.enveloppe',30000);
  poser('notes','Client pressé, négocier la marge.');
  v=M.ajouterPiece(v,'Cuisine',undefined,'pc');v=M.majElement(v,'pieces','pc',{note:'Garder le carrelage.'});
  v=M.ajouterPhoto(v,{id:'ph1',pieceId:'pc',role:'piece',legende:'Plan de travail abîmé'});
  v=M.majElement(M.ajouterPhoto(v,{id:'im1',pieceId:'pc',role:'imagine',legende:'blanc et bois'}),'photos','im1',{source:'ph1',consigne:'blanc et bois'});
  v=M.ajouterPhoto(v,{id:'g',role:'garde'});poser('photoGarde','g');
  v=M.ajouterPiece(v,'Vide',undefined,'pv');
  poser('plan',{releve:{},resume:{pieces:1,surface:12.5,detail:[{id:'p1',nom:'Cuisine',sol:12.5,hauteur:2.5,etage:0}]}});
  poser('budget',{ouvrages:[{id:'o1',ouvrageId:'cuisine',surface:null,niveau:'standard'}],lignes:[],ajust:{}});

  const d=D.dossierClient(v,{table:B.OUVRAGES});
  const tout=JSON.stringify(d);
  chk(d.client==='Mme Anne FICTIF'&&d.adresse==='1 rue Imaginaire, 61000 Alençon'&&d.garde&&d.garde.id==='g','page de garde : client, adresse des travaux, photo de garde');
  chk(d.personnes.length===2&&d.personnes[1].nom==='M. Paul FICTIF'&&/Le Mans/.test(d.personnes[1].detail),'les deux acheteurs, avec le domicile du second');
  chk(d.bien.usage==='Locatif'&&d.bien.surface===12.5&&d.projet.types.join()==='Cuisine,Véranda'&&d.projet.situation&&d.projet.souhaits,'le bien et le projet (« Autre » remplacé par sa précision)');
  chk(!/négocier|pressé/.test(tout)&&!/marge/i.test(tout),'jamais les notes de visite ni la marge');
  chk(d.pieces.length===1&&d.pieces[0].note===''&&d.pieces[0].photos.length===1&&d.pieces[0].photos[0].legende==='Plan de travail abîmé','pièces avec photos et légendes ; une pièce sans photo n’apparaît pas ; notes des pièces non cochées : absentes');
  chk(d.pieces[0].photos[0].imagines.length===1&&d.pieces[0].photos[0].imagines[0].consigne==='blanc et bois','l’image imaginée accompagne sa photo d’origine');
  chk(d.plan.length===1&&d.plan[0].surface===12.5,'le relevé : pièces et surfaces');
  chk(d.estimation&&d.estimation.lignes.length===1&&d.estimation.lignes[0].quantite==='12,5 m²'&&d.estimation.total.min===Math.round(765*12.5/100)*100,'l’estimation : cuisine 12,5 m² standard, à la centaine');
  chk(d.projet.enveloppe===null,'le budget envisagé par le client n’y est que si on le coche');

  const d2=D.dossierClient(v,{table:B.OUVRAGES,estimation:false,imagines:false,notesPieces:true,enveloppe:true});
  chk(d2.estimation===null&&d2.pieces[0].photos[0].imagines.length===0&&d2.pieces[0].note==='Garder le carrelage.'&&d2.projet.enveloppe===30000,'options : sans estimation, sans images imaginées, avec notes des pièces et budget envisagé');

  /* une société */
  let s=M.nouvelleVisite();s=M.modifier(s,'client.type','societe');s=M.modifier(s,'societe.raisonSociale','FICTIVE IMMO');s=M.modifier(s,'societe.forme','SCI');s=M.modifier(s,'client.nom','GÉRANT');
  const ds=D.dossierClient(s,{table:B.OUVRAGES});
  chk(ds.client==='SCI FICTIVE IMMO'&&ds.personnes[0].role==='Société'&&ds.personnes[1].nom==='GÉRANT','société : raison sociale et représentant');
  chk(ds.estimation===null&&ds.pieces.length===0&&ds.plan.length===0,'visite presque vide : pas de section vide, pas d’erreur');
  fin();
})();
