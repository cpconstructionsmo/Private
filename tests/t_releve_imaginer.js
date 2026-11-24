/* « Imaginer » (relevé de visite) — les règles de la fonction du serveur
   (supabase/functions/imaginer/regles.js) : demande vérifiée, consigne
   encadrée, requête Gemini, lecture de la réponse, limite du jour. Aucune
   clé, aucun appel réseau. */
const {verif}=require('./harness');
const {chk,fin}=verif();
(async()=>{
  const R=await import('../supabase/functions/imaginer/regles.js');
  const img='/9j/'+'A'.repeat(200);
  chk(R.lireDemande({}).erreur==='image_absente'&&R.lireDemande({image:'pas<de>base64',consigne:'murs blancs'}).erreur==='image_absente','sans photo lisible : refusé');
  chk(R.lireDemande({image:img,consigne:' '}).erreur==='consigne_absente','sans consigne : refusé');
  chk(R.lireDemande({image:'A'.repeat(R.IMAGE_MAX+4),consigne:'murs blancs'}).erreur==='image_trop_lourde','photo trop lourde : refusée');
  const d=R.lireDemande({image:'data:image/jpeg;base64,'+img,consigne:'  murs   blancs\u0000, parquet  ',piece:'Séjour',mime:'image/gif'});
  chk(d.image===img&&d.consigne==='murs blancs , parquet'&&d.mime==='image/jpeg'&&d.piece==='Séjour','demande nettoyée : préfixe retiré, espaces et caractères de contrôle, type d’image sûr');
  chk(R.lireDemande({image:img,consigne:'x'.repeat(5000)}).consigne.length===R.CONSIGNE_MAX,'consigne bornée à '+R.CONSIGNE_MAX+' caractères');

  const t=R.invite(d);
  chk(/même point de vue/.test(t)&&/photoréaliste/.test(t)&&/ni personne/.test(t)&&/« murs blancs , parquet »/.test(t)&&/Séjour/.test(t),'la consigne est encadrée : même pièce, même point de vue, réaliste, ni texte ni personne');
  const q=R.requeteGemini(d);
  chk(q.contents[0].parts[1].inline_data.data===img&&q.contents[0].parts[1].inline_data.mime_type==='image/jpeg'&&q.generationConfig.responseModalities.includes('IMAGE'),'requête Gemini : la photo en pièce jointe, réponse en image');

  chk(R.imageReponse({candidates:[{content:{parts:[{text:'Voici'},{inlineData:{mimeType:'image/png',data:'iVBOR'}}]}}]}).image==='iVBOR','image lue dans la réponse (inlineData)');
  chk(R.imageReponse({candidates:[{content:{parts:[{inline_data:{mime_type:'image/jpeg',data:'/9j'}}]}}]}).mime==='image/jpeg','… ou inline_data');
  const r=R.imageReponse({candidates:[{finishReason:'SAFETY',content:{parts:[{text:'Je ne peux pas'}]}}]});
  chk(r.erreur==='aucune_image'&&r.raison==='SAFETY'&&/ne peux pas/.test(r.texte),'pas d’image : erreur nommée, avec la raison');
  chk(R.imageReponse({}).erreur==='aucune_image','réponse vide : pas d’erreur de lecture');

  chk(R.modeles('')[0]===R.MODELES[0]&&R.modeles('mon-modele')[0]==='mon-modele'&&R.modeles(R.MODELES[1]).length===R.MODELES.length,'modèle imposé en tête, sans doublon ; sinon la liste');
  chk(R.limiteJour(undefined)===30&&R.limiteJour('12')===12&&R.limiteJour('-3')===30&&R.limiteJour('abc')===30,'limite du jour : 30 par défaut, réglable');

  /* « décrire » : légende et constats d'une photo, ou note manuscrite lue */
  chk(R.lireDescription({}).erreur==='image_absente'&&R.lireDescription({image:'A'.repeat(R.IMAGE_MAX+4)}).erreur==='image_trop_lourde','décrire : photo absente ou trop lourde refusée');
  const dd=R.lireDescription({image:'data:image/png;base64,'+img,mime:'image/png',mode:'autre',piece:'Cuisine'});
  chk(dd.image===img&&dd.mime==='image/png'&&dd.mode==='photo'&&dd.piece==='Cuisine'&&R.lireDescription({image:img,mode:'note'}).mode==='note','décrire : mode « photo » par défaut, « note » sur demande');
  const ip=R.inviteDescription(dd), inn=R.inviteDescription({mode:'note'});
  chk(/sans rien inventer/.test(ip)&&/Pas de prix/.test(ip)&&/Cuisine/.test(ip)&&/Recopie fidèlement/.test(inn)&&/\[…\]/.test(inn),'décrire : consignes (rien d’inventé, pas de prix ; note recopiée telle quelle)');
  const qd=R.requeteDescription(dd);
  chk(qd.contents[0].parts[1].inline_data.data===img&&qd.generationConfig.responseMimeType==='application/json','décrire : la photo jointe, réponse en JSON');
  const rep=t=>({candidates:[{content:{parts:[{text:t}]}}]});
  const rd=R.descriptionReponse(rep(JSON.stringify({legende:'  Tableau   électrique ancien ',constats:['Fusibles porcelaine',3,'', ...Array(10).fill('x'.repeat(500))]})),'photo');
  chk(rd.legende==='Tableau électrique ancien'&&rd.constats.length===R.CONSTATS_MAX&&rd.constats[0]==='Fusibles porcelaine'&&rd.constats[1].length===R.CONSTAT_MAX,'décrire : légende nettoyée, constats texte seulement et bornés');
  chk(R.descriptionReponse(rep('{"texte":"Cuisine 3,20 x 2,80\\nprise à déplacer"}'),'note').texte==='Cuisine 3,20 x 2,80\nprise à déplacer'&&R.descriptionReponse(rep('{"texte":""}'),'note').erreur==='rien_lu'&&R.descriptionReponse(rep('{"legende":"","constats":[]}'),'photo').erreur==='rien_lu','décrire : note transcrite gardée ligne par ligne ; rien de lu : erreur nommée');

  /* « décrire » un plan 2D : ses pièces, partie par partie */
  const dp=R.lireDescription({image:img,mode:'plan',mime:'application/pdf'});
  chk(dp.mode==='plan'&&dp.mime==='application/pdf'&&R.lireDescription({image:img,mode:'photo',mime:'application/pdf'}).mime==='image/jpeg','plan : le PDF est accepté, seulement pour un plan');
  const ipl=R.inviteDescription({mode:'plan'});
  chk(/HORIZONTALE/.test(ipl)&&/N’invente aucune pièce/.test(ipl)&&/"parties"/.test(ipl),'plan : consigne (dimension horizontale, rien d’inventé, JSON par partie)');
  const rp=R.descriptionReponse(rep(JSON.stringify({parties:[{nom:' RDC  état actuel ',pieces:[{nom:'Salon',longueur:'4,30',largeur:5.49,x:5.2,y:0},{nom:'Placard',longueur:0.1,largeur:2},{nom:'',longueur:3,largeur:3}]},{nom:'Vide',pieces:[]}]})),'plan');
  chk(rp.parties.length===1&&rp.parties[0].nom==='RDC état actuel'&&rp.parties[0].pieces.length===2&&rp.parties[0].pieces[0].longueur===4.3&&rp.parties[0].pieces[1].nom==='Pièce'&&rp.parties[0].pieces[1].x===0,'plan : nombres lus (virgule), dimension hors bornes écartée, partie vide retirée');
  chk(R.descriptionReponse(rep('{"parties":[]}'),'plan').erreur==='rien_lu','plan : aucune pièce lue : erreur nommée');
  {const re=R.descriptionReponse(rep(JSON.stringify({parties:[{nom:'Plan',pieces:[{nom:'Séjour',longueur:4.15,largeur:6.57,hauteur:'2,25',forme:'autre',notes:'  Mur   à refaire ',projet:'futur SDE',
    ouvertures:[{type:'porte',cote:'bas',largeur:0.9,hauteur:2.15},{type:'fenetre',cote:'nord',largeur:1.2},{type:'porte',cote:'haut',largeur:40},{type:'<script>',cote:'bas',largeur:1}],
    equipements:[{type:'radiateur',cote:'droite',position:1},{type:'piscine'},{type:'wc'}]}]}]})),'plan');
   const q=re.parties[0].pieces[0];
   chk(q.hauteur===2.25&&q.forme==='autre'&&q.notes==='Mur à refaire'&&q.projet==='futur SDE','lecture enrichie : hauteur, forme, notes et projet nettoyés');
   chk(q.ouvertures.length===1&&q.ouvertures[0].hauteur===2.15&&q.equipements.length===2&&q.equipements[0].cote==='droite'&&!q.equipements[1].cote,'ouvertures et équipements : seulement les types, côtés et tailles valables');
   const vide=R.descriptionReponse(rep(JSON.stringify({parties:[{nom:'P',pieces:[{nom:'X',longueur:3,largeur:3}]}]})),'plan').parties[0].pieces[0];
   chk(!('ouvertures' in vide)&&!('notes' in vide)&&!('hauteur' in vide),'rien d’écrit sur le plan : aucun champ ajouté (rien d’inventé)');}

  /* imaginer sur un terrain ou une façade ; lire un plan de terrain */
  const dt=R.lireDemande({image:img,consigne:'maison plain-pied enduit blanc',mode:'terrain'});
  chk(dt.mode==='terrain'&&/terrain à bâtir/.test(R.invite(dt))&&/maison neuve/.test(R.invite(dt))&&/même point de vue/.test(R.invite(dt))&&R.lireDemande({image:img,consigne:'xx yy',mode:'bidon'}).mode==='piece',
    'imaginer sur la photo d’un terrain : la maison neuve, même point de vue ; mode inconnu : pièce');
  chk(/agrandissement réalisé/.test(R.invite(R.lireDemande({image:img,consigne:'extension bois',mode:'facade'}))),'imaginer sur une façade : l’agrandissement');
  const dtp=R.lireDescription({image:img,mode:'terrain',mime:'application/pdf'});
  chk(dtp.mode==='terrain'&&dtp.mime==='application/pdf'&&/esquisse/.test(R.inviteDescription(dtp))&&/ne la calcule pas/.test(R.inviteDescription(dtp)),'plan de terrain : PDF accepté, consigne (esquisse ou échelle, surface écrite seulement)');
  const rt=R.descriptionReponse(rep(JSON.stringify({esquisse:true,surface:'812',facade:18.5,forme:'Rectangulaire',cotes:[{cote:'rue',longueur:'18,5'},{cote:'voisin',longueur:44},{cote:'x',longueur:-3}],nord:'en haut',remarques:['Servitude de passage',''],bidon:1})),'terrain');
  chk(rt.esquisse===true&&rt.surface===812&&rt.facade===18.5&&rt.cotes.length===2&&rt.cotes[0].longueur===18.5&&rt.forme==='Rectangulaire'&&rt.remarques.length===1&&!('bidon' in rt),'plan de terrain lu : esquisse, surface, façade, cotes valides, remarques');
  chk(R.descriptionReponse(rep('{"esquisse":true,"cotes":[]}'),'terrain').erreur==='rien_lu','plan de terrain sans cote ni surface : rien lu');

  /* le règlement PLU de la zone */
  const okU='https://data.geopf.fr/annexes/gpu/documents/DU_61999/doc/reglement.pdf#page=12';
  chk(R.lireReglement({url:okU,zone:'UB'}).url==='https://data.geopf.fr/annexes/gpu/documents/DU_61999/doc/reglement.pdf'&&R.lireReglement({url:okU,zone:'UB'}).zone==='UB','règlement : lien de la Géoplateforme accepté (ancre de page retirée)');
  chk(R.lireReglement({url:'https://ailleurs.example/r.pdf',zone:'UB'}).erreur==='lien_reglement'&&R.lireReglement({url:'https://data.geopf.fr/annexes/gpu/documents/../x.pdf',zone:'UB'}).erreur==='lien_reglement'&&R.lireReglement({url:okU}).erreur==='zone_absente',
    'règlement : toute autre adresse refusée (la fonction ne télécharge que la Géoplateforme), zone obligatoire');
  const ir=R.inviteReglement({zone:'UB',libelle:'zone pavillonnaire'});
  chk(/zone « UB »/.test(ir)&&/N’invente rien/.test(ir)&&/"hauteur":null/.test(ir)&&/dispositions communes/.test(ir),'règlement : consigne (zone, règles citées, rien d’inventé)');
  chk(R.requeteReglement({zone:'UB'},'JVBER').contents[0].parts[1].inline_data.mime_type==='application/pdf','règlement : le PDF joint à la requête');
  const rr=R.reglementReponse(rep(JSON.stringify({zoneTrouvee:true,pages:'12 à 18',hauteur:'7 m à l’égout du toit',emprise:'40 % de l’unité foncière',clotures:null,inconnu:'x',autres:['Bande de 20 m',3]})));
  chk(rr.regles.hauteur==='7 m à l’égout du toit'&&rr.regles.emprise&&!('clotures' in rr.regles)&&!('inconnu' in rr.regles)&&rr.autres.length===1&&rr.pages==='12 à 18','règlement lu : rubriques connues seulement, vides retirées');
  chk(R.reglementReponse(rep('{"zoneTrouvee":false}')).erreur==='zone_introuvable'&&R.reglementReponse(rep('{"zoneTrouvee":true}')).erreur==='rien_lu','zone absente du règlement, ou rien lu : erreur nommée');
  chk(R.enBase64(new Uint8Array([37,80,68,70]))==='JVBERg==','PDF converti en base64 par morceaux');

  /* l'assistant de visite (action « structurer ») */
  chk(R.lireStructuration({texte:'court'}).erreur==='texte_absent','dictée trop courte : refusée');
  const ds=R.lireStructuration({texte:'Madame FICTIF, maison de 1975, chauffage fioul, elle veut ouvrir la cuisine.'+'x'.repeat(9000),
    listes:{civilites:['M.','Mme'],types:Array.from({length:80},(_,i)=>'T'+i),inconnue:['x']}});
  chk(ds.texte.length===R.TEXTE_MAX&&ds.listes.types.length===40&&!('inconnue' in ds.listes)&&ds.listes.delais.length===0,'dictée bornée, listes bornées, liste inconnue ignorée');
  const iv=R.inviteStructuration(ds);
  chk(/N’invente rien/.test(iv)&&/« Mme »/.test(iv)&&/MAJUSCULES/.test(iv)&&/Dictée :/.test(iv),'la consigne interdit d’inventer et donne les choix permis');
  const qs=R.requeteStructuration(ds);
  chk(qs.generationConfig.responseMimeType==='application/json'&&qs.generationConfig.temperature<=0.2,'réponse demandée en JSON, sans fantaisie');
  chk(R.jsonReponse({candidates:[{content:{parts:[{text:'```json\n{"client":{"nom":"FICTIF"}}\n```'}]}}]}).fiche.client.nom==='FICTIF','JSON lu, même entouré de ```json');
  chk(R.jsonReponse({candidates:[{content:{parts:[{text:'pas du json'}]}}]}).erreur==='illisible'&&R.jsonReponse({candidates:[{content:{parts:[{text:'[1,2]'}]}}]}).erreur==='illisible','réponse illisible ou pas un objet : erreur nommée');
  chk(R.modelesTexte('')[0]==='gemini-flash-latest'&&R.limiteTexte(undefined)===100&&R.limiteTexte('250')===250,'modèle texte et limite par défaut (100 dictées par jour)');

  /* le dossier partagé (action « partage ») */
  chk(!R.jetonValide('court')&&!R.jetonValide('a'.repeat(43)+'/')&&R.jetonValide('Abc-_'.repeat(9)),'jeton du lien : 40 à 64 caractères base64url');
  const e1=await R.empreinte('jeton-fictif'), e2=await R.empreinte('jeton-fictif');
  chk(e1===e2&&/^[0-9a-f]{64}$/.test(e1)&&e1!==await R.empreinte('autre'),'empreinte SHA-256 stable (seule elle est en base)');
  const ch=R.cheminsDossier({garde:{chemin:'v1/g.jpg'},planImage:{chemin:'v1/plan.jpg'},vue3d:{chemin:'v1/v3d.jpg'},planRendu:{chemin:'v1/rendu.jpg'},planAnnote:{chemin:'v1/annote.jpg'},pieces:[{photos:[{chemin:'v1/a.jpg',imagines:[{chemin:'v1/b.jpg'},{chemin:'../secret'}]},{chemin:null}]}]});
  chk(ch.join()==='v1/g.jpg,v1/plan.jpg,v1/v3d.jpg,v1/rendu.jpg,v1/annote.jpg,v1/a.jpg,v1/b.jpg','chemins des photos du dossier (vue 3D comprise) pour leurs liens temporaires (chemin douteux écarté)');
  /* IA améliorée : retouche, plan en couleur, rendu plus soigné, lecture de plan par le modèle « pro », doutes */
  {const img='A'.repeat(2000);
   chk(R.lireDemande({image:img,consigne:'Carrelage plus foncé',mode:'retouche'}).mode==='retouche'&&R.lireDemande({image:img,consigne:'plan',mode:'planRendu'}).mode==='planRendu'&&R.lireDemande({image:img,consigne:'xxx',mode:'<x>'}).mode==='piece','modes d’image : retouche et plan en couleur reconnus, inconnu → pièce');
   const it=R.invite({consigne:'Carrelage plus foncé',piece:'Cuisine',mode:'retouche'});
   chk(/SEULEMENT cette modification/.test(it)&&/Tout le reste doit rester identique/.test(it),'retouche : seule la modification change');
   const ip=R.invite({consigne:'plan',mode:'planRendu'});
   chk(/EXACTEMENT la même géométrie/.test(ip)&&/n’invente aucun nouveau texte/.test(ip)&&!/Précision du métreur/.test(ip),'plan en couleur : même géométrie, aucun texte inventé');
   const ipi=R.invite({consigne:'Cuisine blanche',piece:'Cuisine',mode:'piece'});
   chk(/verticales droites/.test(ipi)&&/aucune déformation des murs/.test(ipi)&&/même hauteur sous plafond/.test(ipi)&&/Cuisine blanche/.test(ipi),'imaginer : rendu de photo d’intérieur professionnelle, géométrie gardée');
   const mp=R.modelesPlan('',''),mpi=R.modelesPlan('mon-modele','');
   chk(mp[0]==='gemini-2.5-pro'&&mp.includes('gemini-flash-latest')&&mpi[0]==='mon-modele','lecture de plan : modèle « pro » d’abord (IMAGINER_MODELE_PLAN prioritaire), puis les modèles habituels');
   const dd=R.descriptionReponse(rep(JSON.stringify({parties:[{nom:'RDC',doutes:['Cuisine : largeur raturée',' ','x'.repeat(400)],pieces:[{nom:'A',longueur:3,largeur:3}]}]})),'plan');
   chk(dd.parties[0].doutes.length===2&&dd.parties[0].doutes[1].length===160,'doutes de la lecture : gardés, nettoyés, bornés');
   chk(/doutes/.test(R.inviteDescription?R.inviteDescription({mode:'plan'}):JSON.stringify(R.requeteDescription({mode:'plan',image:'x',mime:'image/jpeg'}))),'la consigne de lecture demande les doutes (cotes raturées, contradictoires)');}
  fin();
})();
