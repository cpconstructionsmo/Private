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
  const ch=R.cheminsDossier({garde:{chemin:'v1/g.jpg'},planImage:{chemin:'v1/plan.jpg'},planAnnote:{chemin:'v1/annote.jpg'},pieces:[{photos:[{chemin:'v1/a.jpg',imagines:[{chemin:'v1/b.jpg'},{chemin:'../secret'}]},{chemin:null}]}]});
  chk(ch.join()==='v1/g.jpg,v1/plan.jpg,v1/annote.jpg,v1/a.jpg,v1/b.jpg','chemins des photos du dossier pour leurs liens temporaires (chemin douteux écarté)');
  fin();
})();
