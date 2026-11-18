/* Relevé de visite — rattachement des visites aux prospects du suivi
   (index.html : visiteResume, prospectsCandidats, prospectDepuisVisite,
   completerProspectDepuisVisite, visitesARattacher, visitesDuProspect).
   Clients fictifs. */
const {charger,verif}=require('./harness');
const M=charger(['visiteResume','visiteIntitule','normTel','prospectsCandidats','prospectDepuisVisite',
  'completerProspectDepuisVisite','visitesARattacher','visitesDuProspect','releveLien']);
const {chk,fin}=verif();

/* une visite telle que la table releve_visites la rend (releve/modele.js) */
const ligne=(id,valeurs,extra={})=>({id,maj_le:'2026-11-18T10:00:00Z',donnees:{id,schema:1,creeLe:'2026-11-17T09:30:00.000Z',
  valeurs:{statut:'terminee',etape:'fin',...valeurs},maj:{},pieces:extra.pieces||{},photos:extra.photos||{}}});
const v1=M.visiteResume(ligne('vis-1',{'client.civilite':'Mme','client.nom':'FICTIF','client.prenom':'Anne',
  'client.telephone':'06 12 34 56 78','client.email':'Anne.Fictif@Exemple.fr','client.adresse':'1 rue Imaginaire',
  'client.codePostal':'61000','client.ville':'Alençon','projet.types':['Cuisine','Peinture'],'projet.delai':'Sous 6 mois',
  'projet.explicatif':'Ouvrir la cuisine sur le séjour.','projet.enveloppe':45000,photoGarde:'ph-g',
  plan:{releve:{pieces:[]},resume:{pieces:1,surface:15.68,ouvertures:1}}},
  {pieces:{p1:{id:'p1',nom:'Cuisine'},p2:{id:'p2',nom:'Ancienne',supprime:true}},
   photos:{'ph-g':{id:'ph-g',role:'garde',chemin:'vis-1/ph-g.jpg'},a:{id:'a',role:'piece',pieceId:'p1'},b:{id:'b',role:'piece',pieceId:'p1',supprime:true}}}));

chk(v1.id==='vis-1'&&v1.nom==='FICTIF'&&v1.ville==='Alençon'&&v1.enveloppe===45000,'résumé : client, ville, enveloppe');
chk(v1.nbPieces===1&&v1.nbPhotos===1,'résumé : les pièces et photos supprimées ne comptent pas');
chk(v1.gardeChemin==='vis-1/ph-g.jpg'&&v1.plan&&v1.plan.surface===15.68,'résumé : photo de garde et plan');
chk(M.visiteIntitule(v1)==='Mme Anne FICTIF','intitulé de la visite');
chk(M.visiteResume({id:'x',donnees:{}}).nom===''&&M.visiteIntitule(M.visiteResume({id:'x',donnees:{}}))==='Visite sans nom','visite vide : pas d’erreur');

chk(M.normTel('06 12 34 56 78')==='0612345678'&&M.normTel('+33 6 12 34 56 78')==='0612345678'&&M.normTel('0033612345678')==='0612345678','téléphone comparé chiffres seuls, +33 ramené à 0');
chk(M.normTel('12')==='','numéro trop court : ignoré');

/* doublons */
const P=[
  {id:'pA',nom:'Maison Fictif - Alençon',client:'Anne Fictif',telClient:'0612345678',emailClient:'',commune:'Alençon'},
  {id:'pB',nom:'Maison Autre - Ceaucé',client:'Paul Autre',emailClient:'anne.fictif@exemple.fr',telClient:''},
  {id:'pC',nom:'Maison Fictif - Domfront',client:'Jean Fictif',telClient:'',commune:'Domfront'},
  {id:'pD',nom:'Maison Sans Rapport',client:'Luc Rien',telClient:'0700000000',commune:'Mayenne'},
];
const C=M.prospectsCandidats(v1,P);
chk(C.length===3&&!C.some(c=>c.p.id==='pD'),'trois prospects ressemblent, le quatrième non');
chk(C[0].p.id==='pA'&&C[0].raisons.includes('même téléphone')&&C[0].raisons.includes('même nom, même commune')&&C[0].sur,'le plus sûr d’abord : même téléphone et même nom dans la même commune');
chk(C.find(c=>c.p.id==='pB').raisons.join()==='même e-mail','e-mail comparé sans tenir compte des majuscules');
const cC=C.find(c=>c.p.id==='pC');
chk(cC.raisons.join()==='même nom'&&!cC.sur,'même nom dans une autre commune : seulement « peut-être »');
chk(M.prospectsCandidats(M.visiteResume(ligne('vis-0',{})),P).length===0,'visite sans coordonnées : aucune proposition');

/* nouveau prospect depuis la visite */
const base={statut:'demande',decouverte:{logementActuel:'x'},postes:[],produits:[]};
const np=M.prospectDepuisVisite(v1,base,'2026-11-18');
chk(np.nom==='Maison FICTIF - Alençon'&&np.client==='Anne FICTIF'&&np.civilite==='Mme','nouveau prospect : nom du dossier, client, civilité');
chk(np.telClient==='06 12 34 56 78'&&np.emailClient==='Anne.Fictif@Exemple.fr'&&np.adresseClient==='1 rue Imaginaire 61000 Alençon'&&np.commune==='Alençon','coordonnées reprises telles que saisies');
chk(np.categorie==='renovation'&&np.statut==='demande'&&np.demandeLe==='2026-11-17','rénovation, demande datée du jour de la visite');
chk(/Travaux : Cuisine, Peinture/.test(np.demande)&&/Délai souhaité : Sous 6 mois/.test(np.demande)&&/Ouvrir la cuisine/.test(np.demande),'la demande reprend travaux, délai et explicatif');
chk(np.decouverte.enveloppe==='45000'&&np.decouverte.logementActuel==='x','enveloppe dans la découverte, comme la saisie du suivi (texte)');
chk(Array.isArray(np.postes)&&np.visites.length===1&&np.visites[0].id==='vis-1','modèle vide gardé, visite rattachée');
const couple=M.prospectDepuisVisite({...v1,civilite:'M. et Mme'},base,'2026-11-18');
chk(couple.civilite==='M.'&&couple.civilite2==='Mme'&&couple.client2==='FICTIF'&&couple.afficherClient2,'« M. et Mme » : deux acquéreurs');

/* rattacher à un prospect existant : rien n'est remplacé */
const pExist={id:'pA',nom:'Maison Fictif - Alençon',client:'Anne Fictif',telClient:'02 33 00 00 00',emailClient:'',adresseClient:'',commune:'Alençon',decouverte:{enveloppe:'60000'}};
const {prospect,champs}=M.completerProspectDepuisVisite(pExist,v1,'2026-11-18');
chk(prospect.telClient==='02 33 00 00 00'&&prospect.client==='Anne Fictif'&&prospect.decouverte.enveloppe==='60000','rattacher ne remplace aucune case déjà remplie');
chk(prospect.emailClient==='Anne.Fictif@Exemple.fr'&&prospect.adresseClient==='1 rue Imaginaire 61000 Alençon','les cases vides sont complétées');
chk(champs.join()==='civilité,e-mail,adresse','la liste de ce qui est complété est donnée avant de confirmer');
chk(prospect.visites.length===1&&M.completerProspectDepuisVisite(prospect,v1,'2026-11-19').prospect.visites.length===1,'rattacher deux fois ne crée pas deux liens');

/* à rattacher / déjà rattachées */
const v2=M.visiteResume(ligne('vis-2',{'client.nom':'Lancée','prospectId':'pC'}));
const v3=M.visiteResume(ligne('vis-3',{'client.nom':'Ignorée'}));
const R=M.visitesARattacher([v1,v2,v3],[prospect,...P.slice(1)],['vis-3']);
chk(R.length===0,'rien à rattacher : visite liée, visite lancée depuis une fiche, visite écartée');
chk(M.visitesARattacher([v1,v2,v3],P.slice(1),[]).map(r=>r.id).join()==='vis-1,vis-3','une visite lancée depuis un prospect supprimé redevient à rattacher');
chk(M.visitesDuProspect(prospect,[v1,v2,v3]).map(r=>r.id).join()==='vis-1','la fiche prospect retrouve sa visite rattachée');
chk(M.visitesDuProspect(P[2],[v1,v2,v3]).map(r=>r.id).join()==='vis-2','et celle lancée depuis sa fiche');

chk(M.releveLien()==='releve/'&&M.releveLien({visite:'a b'})==='releve/?visite=a%20b'&&M.releveLien({prospect:'p1'})==='releve/?prospect=p1','liens vers le relevé de visite');
fin();
