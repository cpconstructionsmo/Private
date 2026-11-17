/* Relevé de visite — synchronisation (releve/synchro.js, releve/stockage.js)
   avec un faux Supabase en mémoire : envoi, hors ligne sans perte, reprise
   sans doublon, deux appareils sans écrasement, saisie pendant l'envoi,
   photos dans l'espace de fichiers et jamais dans le JSON. */
const {verif}=require('./harness');
const {fauxSupabase}=require('./releve_faux_supabase');
const {chk,fin}=verif();
(async()=>{
  const M=await import('../releve/modele.js');
  const {creerStockage,magasinMemoire}=await import('../releve/stockage.js');
  const {creerSynchro,lireErreur,cheminPhoto}=await import('../releve/synchro.js');
  let h=0;const horloge=()=>'2026-11-17T10:'+String(Math.floor(h/60)).padStart(2,'0')+':'+String(h++%60).padStart(2,'0')+'.000Z';

  const serveur={};const supa=fauxSupabase(serveur);
  const appareil=()=>{const stock=creerStockage(magasinMemoire());const etats=[];let reseau=true;
    const sync=creerSynchro({supa,stock,enLigne:()=>reseau,surEtat:e=>etats.push(e),maintenant:horloge});
    return {stock,sync,etats,coupe:x=>{reseau=!x}}};

  /* iPhone, sans réseau */
  const iphone=appareil();iphone.coupe(true);
  const v=M.nouvelleVisite(horloge(),'vis-1');await iphone.stock.creer(v);
  await iphone.stock.modifier('vis-1',x=>M.modifier(x,'client.nom','Fictif',horloge()));
  await iphone.stock.garderPhoto('ph-g','vis-1',{size:1234});
  await iphone.stock.modifier('vis-1',x=>M.modifier(M.ajouterPhoto(x,{id:'ph-g',role:'garde'},horloge()),'photoGarde','ph-g',horloge()));
  await iphone.sync.synchroniser();
  chk(iphone.etats.at(-1).etat==='horsligne'&&iphone.etats.at(-1).enAttente===2,'hors ligne : rien n’est envoyé, la visite et la photo sont « en attente »');
  chk(!Object.keys(serveur.lignes).length,'hors ligne : le serveur n’a rien reçu');

  /* retour du réseau */
  iphone.coupe(false);await iphone.sync.synchroniser();
  chk(iphone.etats.at(-1).etat==='ok'&&iphone.etats.at(-1).enAttente===0,'retour du réseau : tout part, plus rien en attente');
  chk(serveur.lignes['vis-1']&&serveur.lignes['vis-1'].donnees.valeurs['client.nom']==='Fictif','la visite est sur le serveur');
  chk(serveur.fichiers['releves/'+cheminPhoto('vis-1','ph-g')]===1234,'la photo est dans l’espace « releves », rangée par visite');
  chk(serveur.lignes['vis-1'].donnees.photos['ph-g'].chemin==='vis-1/ph-g.jpg'&&!JSON.stringify(serveur.lignes['vis-1'].donnees).includes('base64'),'le JSON garde le chemin de la photo, jamais l’image');
  const ecr=serveur.ecritures;await iphone.sync.synchroniser();
  chk(serveur.ecritures===ecr&&Object.keys(serveur.lignes).length===1,'une nouvelle passe sans changement n’écrit rien et ne crée aucun doublon');

  /* le PC reprend la visite */
  const pc=appareil();await pc.sync.synchroniser();
  const surPc=await pc.stock.lire('vis-1');
  chk(surPc&&!surPc.enAttente&&M.valeur(surPc.visite,'client.nom')==='Fictif','le PC retrouve la visite saisie sur l’iPhone');

  /* deux appareils modifient en même temps */
  await pc.stock.modifier('vis-1',x=>M.modifier(x,'client.email','client@exemple.fr',horloge()));
  await iphone.stock.modifier('vis-1',x=>M.modifier(x,'client.telephone','06 00 00 00 00',horloge()));
  serveur.avantEcriture=()=>{}; // rien de spécial : chacun à son tour
  await pc.sync.synchroniser();await iphone.sync.synchroniser();await pc.sync.synchroniser();
  const d=serveur.lignes['vis-1'].donnees;
  chk(d.valeurs['client.email']==='client@exemple.fr'&&d.valeurs['client.telephone']==='06 00 00 00 00','deux appareils : les deux saisies sont sur le serveur, aucune écrasée');
  chk(M.valeur((await pc.stock.lire('vis-1')).visite,'client.telephone')==='06 00 00 00 00','le PC reçoit la saisie de l’iPhone');

  /* un autre appareil écrit pile entre la lecture et l'écriture */
  await iphone.stock.modifier('vis-1',x=>M.modifier(x,'projet.delai','Sous 3 mois',horloge()));
  serveur.avantEcriture=()=>{const l=serveur.lignes['vis-1'];
    l.donnees=M.modifier(l.donnees,'notes','écrit par le PC au même instant',horloge());l.version++};
  await iphone.sync.synchroniser();
  const d2=serveur.lignes['vis-1'].donnees;
  chk(d2.valeurs['notes']==='écrit par le PC au même instant'&&d2.valeurs['projet.delai']==='Sous 3 mois','écriture simultanée : la version du serveur a changé, la fusion est refaite, rien n’est perdu');

  /* saisie pendant l'envoi */
  const iph2=appareil();await iph2.sync.synchroniser();
  await iph2.stock.modifier('vis-1',x=>M.modifier(x,'client.ville','Alençon',horloge()));
  serveur.avantEcriture=async()=>{};
  const rec=await iph2.stock.lire('vis-1');
  const fus=M.fusionner(rec.visite,serveur.lignes['vis-1'].donnees);
  await iph2.stock.modifier('vis-1',x=>M.modifier(x,'client.codePostal','61000',horloge())); // tapé pendant l'envoi
  await iph2.stock.confirmer('vis-1',fus,rec.rev);
  const apres=await iph2.stock.lire('vis-1');
  chk(apres.enAttente&&M.valeur(apres.visite,'client.codePostal')==='61000'&&M.valeur(apres.visite,'client.ville')==='Alençon','une saisie faite pendant l’envoi est gardée et reste en attente');

  /* tables pas installées : message clair, rien de perdu */
  serveur.panne='tables';
  await iph2.sync.synchroniser();
  const e=iph2.etats.at(-1);
  chk(e.etat==='erreur'&&e.type==='installation'&&/installer/.test(e.message),'tables absentes : le message le dit, sans parler de perte');
  chk((await iph2.stock.lire('vis-1')).enAttente,'tables absentes : la visite reste en attente sur l’appareil');
  serveur.panne=null;await iph2.sync.synchroniser();
  chk(serveur.lignes['vis-1'].donnees.valeurs['client.codePostal']==='61000','une fois installées : la saisie part');
  serveur.panne='reseau';await iph2.sync.synchroniser();
  chk(iph2.etats.at(-1).etat==='horsligne','coupure en pleine passe : vue comme « hors ligne »');
  serveur.panne=null;

  chk(lireErreur({message:'JWT expired'}).type==='connexion','une session expirée demande de se reconnecter');
  chk(lireErreur({message:'TypeError: Load failed'}).type==='reseau','« Load failed » (Safari) est une coupure de réseau');
  fin();
})();
