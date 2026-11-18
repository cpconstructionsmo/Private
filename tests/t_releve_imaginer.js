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
  fin();
})();
