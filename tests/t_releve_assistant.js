/* Relevé de visite — l'assistant de visite (releve/assistant.js) : la fiche
   rendue par l'IA n'entre dans la visite que vérifiée, champ par champ, et
   rien de déjà saisi n'est remplacé sans être choisi. Données FICTIVES. */
const {verif}=require('./harness');
const {chk,fin}=verif();
(async()=>{
  const M=await import('../releve/modele.js'), A=await import('../releve/assistant.js');
  let v=M.nouvelleVisite();
  v=M.modifier(v,'client.nom','FICTIF');v=M.modifier(v,'client.telephone','06 00 00 00 00');v=M.modifier(v,'projet.types',['Peinture']);
  v=M.modifier(v,'projet.souhaits','Garder la cheminée.');
  v=M.ajouterPiece(v,'Cuisine',undefined,'pc');
  const fiche={client:{civilite:'Monsieur et Madame',nom:'Autre',prenom:'jean',telephone:'0611111111',email:'pas-un-mail',adresse:'3 rue Imaginaire',codePostal:'61000',ville:'Alençon'},
    societe:{raisonSociale:null,forme:null},acheteur2:{civilite:'Mme',nom:'fictive',prenom:'Lise',telephone:null,email:'lise@exemple.fr'},
    bien:{usage:'résidence principale'},projet:{categories:['Rénovation énergétique','Rénovation totale'],types:['Cuisine','Peinture','Piscine'],typeAutre:'Véranda',
    situation:'Chaudière fioul de 1985.',souhaits:'Ouvrir la cuisine.',delai:'Sous 3 mois',enveloppe:'45 000 €'},
    pieces:[{nom:'cuisine',note:'Mur porteur à vérifier.'},{nom:'Salle de bains',note:'Douche à l’italienne.'},{nom:'',note:'sans nom'}],
    injection:{'client.nom':'X'},notes:'ne doit jamais passer'};
  const P=A.propositions(fiche,v), par=k=>P.champs.find(c=>c.cle===k);
  chk(!par('notes')&&!P.champs.some(c=>!A.libelleChamp(c.cle)||/injection/.test(c.cle)),'seuls les champs connus passent (les notes de visite et l’inconnu sont écartés)');
  chk(par('client.nom').mode==='remplace'&&par('client.nom').coche===false&&par('client.nom').valeur==='AUTRE','un nom déjà saisi n’est proposé qu’en remplacement, décoché');
  chk(!par('client.telephone')||par('client.telephone').coche===false,'le téléphone déjà saisi n’est pas remplacé d’office');
  chk(par('client.prenom').coche&&par('client.ville').valeur==='Alençon'&&par('client.codePostal').valeur==='61000','les champs vides se remplissent, cochés d’office');
  chk(!par('client.email')&&!par('client.civilite'),'un e-mail invalide ou une civilité hors liste est écarté');
  chk(par('client.nbAcheteurs').valeur===2&&par('acheteur2.nom').valeur==='FICTIVE'&&par('acheteur2.email').valeur==='lise@exemple.fr','un 2e acheteur cité ouvre sa fiche (nom en majuscules)');
  chk(par('bien.usage').valeur==='Résidence principale','un choix est ramené à la valeur exacte de la liste (majuscules)');
  chk(par('projet.categories').valeur.join()==='Rénovation énergétique','ampleur : la valeur hors liste (« totale ») est écartée');
  chk(par('projet.types').valeur.join()==='Peinture,Cuisine,Autre'&&par('projet.types').mode==='complete','travaux : la liste se complète (Piscine écartée, Autre ajouté pour la précision)');
  chk(par('projet.souhaits').valeur==='Garder la cheminée.\nOuvrir la cuisine.'&&par('projet.souhaits').mode==='complete','souhaits : le texte se complète, sans effacer');
  chk(par('projet.enveloppe').valeur===45000&&par('projet.delai').valeur==='Sous 3 mois','enveloppe lue en nombre, délai de la liste');
  chk(P.pieces.length===2&&P.pieces[0].pieceId==='pc'&&P.pieces[1].nom==='Salle de bains'&&!P.pieces[1].pieceId,'pièce du même nom : la note la complète ; nouvelle pièce : ajoutée ; pièce sans nom : écartée');
  const w=A.appliquer(v,P);
  chk(M.valeur(w,'client.nom')==='FICTIF'&&M.valeur(w,'client.prenom')==='jean'&&M.valeur(w,'acheteur2.nom')==='FICTIVE'&&M.nbAcheteurs(w)===2,'appliquer : seulement ce qui est coché (le nom saisi reste)');
  chk(w.pieces.pc.note==='Mur porteur à vérifier.'&&M.actifs(w.pieces).some(p=>p.nom==='Salle de bains'&&p.note==='Douche à l’italienne.'),'pièces : note ajoutée, nouvelle pièce créée avec sa note');
  par('client.nom').coche=true;
  chk(M.valeur(A.appliquer(v,P),'client.nom')==='AUTRE','cochée par le métreur, une valeur remplace bien l’ancienne');
  const Ps=A.propositions({societe:{raisonSociale:'FICTIVE IMMO',forme:'sci'}},M.nouvelleVisite());
  chk(Ps.champs.find(c=>c.cle==='client.type').valeur==='societe'&&Ps.champs.find(c=>c.cle==='societe.forme').valeur==='SCI','une société citée bascule le client en société');
  chk(A.propositions(null,v).champs.length===0&&A.propositions({pieces:'x'},v).pieces.length===0,'réponse vide ou mal formée : aucune proposition, pas d’erreur');
  chk(A.listesPourIA().types.includes('Chauffage')&&A.listesPourIA().civilites.includes('M. et Mme'),'les listes envoyées à l’IA sont celles du relevé');
  fin();
})();
