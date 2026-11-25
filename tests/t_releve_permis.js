/* Relevé de visite — « Dossier permis » (releve/permis.js) : le fichier que l'Atelier lit (format cp-permis, v1).
   Visite fictive : rien d'inventé, un champ inconnu reste vide, le plan est obligatoire. */
const {verif}=require('./harness');
const {chk,fin}=verif();
(async()=>{
  const M=await import('../releve/modele.js');
  const P=await import('../releve/permis.js');
  let h=0;const t=()=>'2026-11-25T10:00:'+String(h++).padStart(2,'0')+'.000Z';
  let v=M.nouvelleVisite(t(),'vis-p');
  const poser=(k,x)=>{v=M.modifier(v,k,x,t())};
  poser('client.civilite','M.');poser('client.nom','Fictif');poser('client.adresse','1 rue d’Essai');poser('client.codePostal','00000');poser('client.ville','Nulle-part');
  chk(!P.aUnPlan(v),'sans plan : le dossier permis n’est pas proposé');
  let refus=null;try{P.dossierPermis(v,'AAAA')}catch(e){refus=e.message}
  chk(/pas encore de plan/.test(refus||''),'sans plan : le fichier ne se prépare pas, la raison est dite');
  poser('plan',{releve:{pieces:[]},resume:null});
  chk(!P.aUnPlan(v),'un plan sans pièce ne compte pas');
  poser('plan',{releve:{pieces:[{nom:'Séjour',points:[[0,0],[5,0],[5,4],[0,4]]}]},resume:null});
  chk(P.aUnPlan(v),'avec un plan et au moins une pièce : proposé');
  let sansDxf=null;try{P.dossierPermis(v,'')}catch(e){sansDxf=e.message}
  chk(/DXF/.test(sansDxf||''),'sans DXF : refusé');
  let d=P.dossierPermis(v,'QUJD','2026-11-25T11:00:00.000Z');
  chk(d.format==='cp-permis'&&d.version===1&&d.cree_le==='2026-11-25T11:00:00.000Z','format et version');
  chk(d.visite.id==='vis-p'&&d.client.nom==='M. Fictif','visite et client repris tels quels');
  chk(d.projet.adresse==='1 rue d’Essai, 00000 Nulle-part','adresse des travaux : rue, code postal, ville');
  chk(JSON.stringify(d.projet.parcelles)==='[]'&&d.projet.surface_terrain===null,'terrain non localisé : parcelle et surface restent vides, rien d’inventé');
  chk(d.plan.dxf_base64==='QUJD','le plan DXF est joint');
  poser('terrain.infos',{parcelle:{section:'AB',numero:'123',commune:'Nulle-part'}});poser('terrain.surface','1 250,5');
  d=P.dossierPermis(v,'QUJD');
  chk(JSON.stringify(d.projet.parcelles)==='["AB 123"]'&&d.projet.surface_terrain===M.valeur(v,'terrain.surface'),'parcelle du cadastre et surface du terrain reprises telles que la visite les garde');
  chk(d.projet.surface_terrain>1000&&d.projet.surface_terrain<1300,'surface saisie à la française (« 1 250,5 ») lue comme un nombre');
  poser('terrain.surface','n’importe quoi');
  chk(P.dossierPermis(v,'QUJD').projet.surface_terrain===null,'une surface illisible n’est pas devinée');
  poser('client.domicileIdem',false);poser('client.domicile','9 chemin du Client, 11111 Ailleurs');
  chk(P.dossierPermis(v,'QUJD').client.adresse==='9 chemin du Client, 11111 Ailleurs','domicile du client distinct de l’adresse des travaux');
  /* sans nom de client : le maître d'ouvrage reste vide, jamais « Visite sans nom » (rien d'inventé) */
  const anonyme=M.nouvelleVisite(t(),'vis-a');const va=M.modifier(anonyme,'plan',{releve:{pieces:[{nom:'a',points:[[0,0],[1,0],[1,1]]}]},resume:null},t());
  const da=P.dossierPermis(va,'QUJD');
  chk(da.client.nom===''&&da.visite.intitule==='Visite sans nom','sans nom de client : le maître d’ouvrage reste vide (la visite garde son intitulé de repère)');
  chk(P.nomFichier(v)==='dossier-permis-m-fictif.json','nom de fichier sûr, sans accents ni espaces');
  chk(!JSON.stringify(d).includes('notes')&&!JSON.stringify(d).includes('budget'),'ni notes de visite ni budget dans le fichier');
  fin();
})();
