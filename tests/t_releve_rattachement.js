/* Relevé de visite — rattachement des visites aux prospects du suivi
   (index.html : visiteResume, prospectsCandidats, prospectDepuisVisite,
   completerProspectDepuisVisite, visitesARattacher, visitesDuProspect).
   Clients fictifs. */
const {charger,verif}=require('./harness');
const M=charger(['libellePartage','visiteResume','visiteIntitule','normTel','prospectsCandidats','prospectDepuisVisite',
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
chk(champs.join()==='civilité,e-mail,adresse,demande,adresse du projet','la liste de ce qui est complété est donnée avant de confirmer');
chk(prospect.visites.length===1&&M.completerProspectDepuisVisite(prospect,v1,'2026-11-19').prospect.visites.length===1,'rattacher deux fois ne crée pas deux liens');

/* à rattacher / déjà rattachées */
const v2=M.visiteResume(ligne('vis-2',{'client.nom':'Lancée','prospectId':'pC'}));
const v3=M.visiteResume(ligne('vis-3',{'client.nom':'Ignorée'}));
const R=M.visitesARattacher([v1,v2,v3],[prospect,...P.slice(1)],['vis-3']);
chk(R.length===0,'rien à rattacher : visite liée, visite lancée depuis une fiche, visite écartée');
chk(M.visitesARattacher([v1,v2,v3],P.slice(1),[]).map(r=>r.id).join()==='vis-1,vis-3','une visite lancée depuis un prospect supprimé redevient à rattacher');
chk(M.visitesDuProspect(prospect,[v1,v2,v3]).map(r=>r.id).join()==='vis-1','la fiche prospect retrouve sa visite rattachée');
chk(M.visitesDuProspect(P[2],[v1,v2,v3]).map(r=>r.id).join()==='vis-2','et celle lancée depuis sa fiche');

const vf=M.visiteResume(ligne('vis-f',{'client.nom':'Fourchette',budget:{lignes:[],ajust:{},estimation:{min:8600,max:12900,complet:true}}}));
/* retours du terrain : deux ou trois acheteurs, domicile, société, usage,
   ampleur, situation et souhaits (releve/modele.js) */
const vt=M.visiteResume(ligne('vis-2',{'client.civilite':'M.','client.nom':'FICTIF','client.prenom':'Marc','client.telephone':'06 11 11 11 11',
  'client.adresse':'2 rue Fictive','client.codePostal':'53100','client.ville':'Mayenne','client.domicileIdem':false,'client.domicile':'9 avenue Imaginaire 75000 Paris',
  'client.nbAcheteurs':3,'acheteur2.civilite':'Mme','acheteur2.nom':'FICTIVE','acheteur2.prenom':'Lise','acheteur2.email':'lise@exemple.fr',
  'acheteur2.domicileIdem':false,'acheteur2.domicile':'4 quai Fictif 72000 Le Mans',
  'acheteur3.nom':'TROIS','acheteur3.prenom':'Léo','acheteur3.telephone':'07 22 22 22 22',
  'bien.usage':'Locatif','projet.categories':['Rénovation importante','Rénovation énergétique'],
  'projet.types':['Chauffage','Autre'],'projet.typeAutre':'Véranda','projet.situation':'Chaudière fioul de 1990.','projet.souhaits':'Une pompe à chaleur.'}));
chk(vt.domicile==='9 avenue Imaginaire 75000 Paris'&&vt.acheteurs.length===2&&vt.acheteurs[0].prenom==='Lise'&&vt.acheteurs[1].telephone==='07 22 22 22 22','résumé : domicile, acheteurs 2 et 3');
chk(vt.usage==='Locatif'&&vt.categories.length===2&&vt.situation&&vt.souhaits&&vt.typeAutre==='Véranda','résumé : usage, ampleur, situation, souhaits');
const npt=M.prospectDepuisVisite(vt,{},'2026-11-18');
chk(npt.afficherClient2&&npt.civilite2==='Mme'&&npt.client2==='Lise FICTIVE'&&npt.emailClient2==='lise@exemple.fr'&&npt.adresseClient2==='4 quai Fictif 72000 Le Mans','l’acheteur 2 devient le 2e acheteur du prospect, avec son adresse');
chk(npt.adresseClient==='9 avenue Imaginaire 75000 Paris'&&npt.decouverte.adresseProjet==='2 rue Fictive 53100 Mayenne','domicile en adresse du client, adresse des travaux en adresse du projet');
chk(/3e acheteur : Léo TROIS · 07 22 22 22 22/.test(npt.demande),'le 3e acheteur est écrit dans la demande (le prospect n’a pas sa case)');
chk(/Ampleur : Rénovation importante, Rénovation énergétique/.test(npt.demande)&&/Travaux : Chauffage, Autre \(Véranda\)/.test(npt.demande)&&/Usage du bien : Locatif/.test(npt.demande)
  &&/Situation actuelle : Chaudière fioul/.test(npt.demande)&&/Souhaits : Une pompe à chaleur/.test(npt.demande),'la demande reprend ampleur, travaux, usage, situation et souhaits');
chk(M.prospectDepuisVisite({...vt,civilite:'M. et Mme'},{},'2026-11-18').client2==='Lise FICTIVE','un acheteur 2 saisi l’emporte sur « M. et Mme »');
/* rattacher : le 2e acheteur complète un prospect qui n'en a pas, jamais celui qui en a un */
const rt2=M.completerProspectDepuisVisite({id:'pX',client:'Marc Fictif',client2:'',decouverte:{}},vt,'2026-11-18');
chk(rt2.prospect.client2==='Lise FICTIVE'&&rt2.prospect.afficherClient2&&rt2.champs.includes('2e acheteur'),'rattacher : le 2e acheteur complète une case vide');
const rt3=M.completerProspectDepuisVisite({id:'pY',client:'Marc Fictif',client2:'Autre Personne',afficherClient2:true,decouverte:{adresseProjet:'ailleurs'}},vt,'2026-11-18');
chk(rt3.prospect.client2==='Autre Personne'&&rt3.prospect.decouverte.adresseProjet==='ailleurs','rattacher : un 2e acheteur ou une adresse du projet déjà saisis ne bougent pas');
/* une société */
const vs=M.visiteResume(ligne('vis-s',{'client.type':'societe','societe.raisonSociale':'FICTIVE IMMO','societe.forme':'SCI','societe.siret':'000 000 000 00000',
  'client.civilite':'M.','client.nom':'GÉRANT','client.prenom':'Paul','client.telephone':'06 33 33 33 33','client.adresse':'3 rue Fictive','client.ville':'Alençon',
  'client.nbAcheteurs':2,'acheteur2.nom':'IGNORÉ'}));
chk(M.visiteIntitule(vs)==='SCI FICTIVE IMMO'&&vs.acheteurs.length===0,'société : intitulé par la raison sociale, pas d’acheteur 2');
const nps=M.prospectDepuisVisite(vs,{},'2026-11-18');
chk(nps.civilite==='SCI'&&nps.client==='SCI FICTIVE IMMO'&&nps.nom==='Maison FICTIVE IMMO - Alençon'&&/représentée par M\. Paul GÉRANT/.test(nps.demande)&&/SIRET 000 000 000 00000/.test(nps.demande),'société : civilité SCI, raison sociale en client, représentant et SIRET dans la demande');
chk(M.prospectsCandidats(vs,[{id:'pS',nom:'Maison Fictive Immo',client:'SCI Fictive Immo'}]).length===1,'société : un prospect au nom de la raison sociale est proposé');

/* le dossier envoyé au client : ouvert ou non (releve_partages) */
const vp=M.visiteResume(ligne('vis-p',{'client.nom':'P',partageDossier:{id:'pa-1',lien:'https://x/partage.html#t=secret',expireLe:'2026-12-19T10:00:00Z',creeLe:'2026-11-19T10:00:00Z'}}));
chk(vp.partage&&vp.partage.id==='pa-1'&&!JSON.stringify(vp.partage).includes('secret'),'résumé : le dossier envoyé est connu (jamais le lien ni son jeton)');
chk(M.visiteResume(ligne('vis-q',{partageDossier:{lien:'x'}})).partage===null,'sans identifiant : pas de suivi d’ouverture');
const now=new Date('2026-11-20T10:00:00Z');
chk(/pas encore ouvert/.test(M.libellePartage(vp.partage,{vues:0,expire_le:'2026-12-19T10:00:00Z'},now).texte),'pas encore ouvert par le client');
chk(/ouvert par le client 2 fois/.test(M.libellePartage(vp.partage,{vues:2,vu_le:'2026-11-19T16:00:00Z',expire_le:'2026-12-19T10:00:00Z'},now).texte),'ouvert 2 fois, avec la date de la dernière ouverture');
chk(/lien expiré/.test(M.libellePartage(vp.partage,{vues:3,expire_le:'2026-11-01T10:00:00Z'},now).texte)&&/lien retiré/.test(M.libellePartage(vp.partage,{revoque:true},now).texte),'lien expiré ou retiré : dit tel quel');
chk(/Dossier envoyé le 19\/11\/2026/.test(M.libellePartage(vp.partage,null,now).texte),'sans réponse du serveur : seulement « dossier envoyé le … »');

chk(vf.fourchette&&vf.fourchette.min===8600&&vf.fourchette.max===12900,'la fourchette de la visite est lue');
chk(M.visiteResume(ligne('vis-g',{budget:{lignes:[],estimation:{min:0,max:0}}})).fourchette===null,'fourchette vide : rien d’affiché');
chk(/Fourchette annoncée à la visite \(indicative\) : de 8.600 € à 12.900 € TTC/.test(M.prospectDepuisVisite(vf,{},'2026-11-18').demande),'la demande du prospect créé reprend la fourchette annoncée');
chk(M.releveLien()==='releve/'&&M.releveLien({visite:'a b'})==='releve/?visite=a%20b'&&M.releveLien({prospect:'p1'})==='releve/?prospect=p1'&&M.releveLien({visite:'v1',vue:'dossier'})==='releve/?visite=v1&vue=dossier','liens vers le relevé de visite');
{/* une visite de construction neuve : prospect « Maison neuve » prérempli */
  const F=require('./fixtures/terrain_fictif');
  const valeurs={'client.nom':'NEUF','client.prenom':'Ana','client.ville':'Ailleurs','projet.nature':'construction','construction.surface':160,'construction.niveaux':['R+1','Combles aménagés'],
    'construction.chambres':'4','construction.garage':'Intégré','construction.prestation':'Clé en main','construction.chauffage':'Chaudière granulés','construction.terrainStatut':'Acquis','construction.prixTerrain':55000,
    'terrain.adresseIdem':false,'terrain.adresse':'Lieu-dit Fictif','terrain.codePostal':'61999','terrain.ville':'Villefictive','terrain.surface':812,'terrain.pente':'Légère pente','terrain.lotissement':'Oui',
    'terrain.position':{lon:0.1,lat:48.4,source:'adresse'},
    'terrain.infos':{parcelle:{section:'ZK',numero:'0123'},urbanisme:{document:{titre:'PLU DE VILLEFICTIVE'},zone:{libelle:'UB',libelong:'ZONE URBAINE PAVILLONNAIRE',reglement:'https://data.geopf.fr/annexes/gpu/documents/x/y/r.pdf'},servitudes:[{code:'ac1',libelle:'Abords d’un monument historique (avis de l’Architecte des Bâtiments de France)'}]},
      risques:{url:'https://www.georisques.gouv.fr/x',argile:{code:2,libelle:'Exposition moyenne'},seisme:{zone:2,libelle:'2 - FAIBLE'},naturels:[{cle:'inondation',libelle:'Inondation',statut:'Risque Existant'},{cle:'remonteeNappe',libelle:'Remontée de nappe',statut:'Risque non Connu'}],technologiques:[]}}};
  const r=M.visiteResume({id:'vc',donnees:{id:'vc',creeLe:'2026-11-20T09:00:00Z',valeurs,photos:{}}});
  chk(r.nature==='construction'&&r.construction.surface===160&&r.terrain.parcelle==='section ZK n° 0123'&&/zone UB/.test(r.terrain.urbanisme)&&r.terrain.risques.includes('Inondation')&&!r.terrain.risques.includes('Remontée de nappe'),
    'résumé d’une visite de construction : projet, parcelle, zone, risques avérés seulement');
  const q=M.prospectDepuisVisite(r,{},'2026-11-20');
  chk(q.categorie==='neuf'&&q.surfaceHabitable===160&&q.nbChambres===4&&q.niveaux==='R+1 combles aménagés'&&q.prestation==='Clé en main'&&q.terrainPrix===55000&&q.surfaceTerrain===812&&q.commune==='Villefictive',
    'prospect « Maison neuve » : surface, chambres, niveaux, prestation, terrain, commune du terrain');
  chk(!q.chauffage&&/Chaudière granulés/.test(q.demande),'un chauffage hors de la liste du suivi reste dans la demande (rien d’inventé)');
  chk(/Projet : construction neuve/.test(q.demande)&&/Urbanisme : PLU DE VILLEFICTIVE — zone UB/.test(q.demande)&&/Servitudes : Abords d’un monument historique/.test(q.demande)&&/Risques \(Géorisques\) : argiles : exposition moyenne, sismicité 2 - faible, Inondation/.test(q.demande)&&/Adresse du terrain : Lieu-dit Fictif 61999 Villefictive/.test(q.demande),
    'la demande reprend le terrain : adresse, urbanisme, servitudes, risques');
  const p0={id:'p',nom:'Maison X',client:'X',surfaceHabitable:140,nbChambres:'',niveaux:'',decouverte:{}};
  const {prospect:pc,champs}=M.completerProspectDepuisVisite(p0,r,'2026-11-20');
  chk(pc.surfaceHabitable===140&&pc.nbChambres===4&&pc.niveaux==='R+1 combles aménagés'&&champs.includes('chambres')&&!champs.includes('surface habitable'),'rattacher : seules les cases vides (chambres, niveaux…) se remplissent, la surface saisie (140 m²) reste');
  const ra=M.visiteResume({id:'va',donnees:{id:'va',valeurs:{'client.nom':'AGR','projet.nature':'agrandissement','agrandissement.types':['Surélévation'],'agrandissement.surface':30},photos:{}}});
  const qa=M.prospectDepuisVisite(ra,{},'2026-11-20');
  chk(qa.categorie==='renovation'&&qa.prestation==='Surélévation'&&/Agrandissement : Surélévation · 30 m²/.test(qa.demande),'agrandissement : prospect de rénovation, prestation « Surélévation »');
  chk(M.visiteResume({id:'vr',donnees:{id:'vr',valeurs:{'client.nom':'R'},photos:{}}}).nature==='renovation','une ancienne visite sans nature reste une rénovation');}
fin();
