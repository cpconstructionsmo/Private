/* Relevé de visite — le terrain (releve/terrain.js) : lecture des réponses
   des services publics (cadastre, urbanisme, Géorisques ; réponses fictives
   au format réel) et points d'attention indicatifs. */
const {verif}=require('./harness');
const {chk,fin}=verif();
const F=require('./fixtures/terrain_fictif');
(async()=>{
  const T=await import('../releve/terrain.js');
  const u=T.urls(0.1234,48.4321);
  chk(/apicarto\.ign\.fr\/api\/cadastre\/parcelle\?geom=%7B%22type%22%3A%22Point%22/.test(u.parcelle)&&/georisques\.gouv\.fr\/api\/v1\/resultats_rapport_risque\?latlon=0\.123400,48\.432100/.test(u.rapport)&&/rga\?latlon=/.test(u.argile),
    'adresses des services : point GeoJSON pour l’IGN, « lon,lat » pour Géorisques');
  const g=T.lireGeocodage(F.geocodage);
  chk(g&&g.lon===0.1234&&g.lat===48.4321&&g.insee==='61999'&&/Villefictive/.test(g.label),'géocodage lu (coordonnées, commune)');
  chk(T.lireGeocodage({features:[]})===null&&T.lireGeocodage(null)===null,'adresse introuvable : rien');
  const p=T.lireParcelle(F.parcelle);
  chk(p&&p.section==='ZK'&&p.numero==='0123'&&p.contenance===812&&p.insee==='61999','parcelle lue (section, numéro, contenance)');
  const urb=T.lireUrbanisme(F);
  chk(urb.document.titre==='PLU DE VILLEFICTIVE'&&urb.document.type==='PLU'&&urb.rnu===false&&urb.zone.libelle==='UB'&&urb.zone.type==='U'&&urb.zone.typeLibelle==='zone urbaine','urbanisme : document, zone, type de zone');
  chk(urb.zone.reglement==='https://data.geopf.fr/annexes/gpu/documents/DU_61999/docfictif/61999_reglement_20260101.pdf#page=12','lien du règlement de la zone (avec sa page)');
  chk(urb.servitudes.length===2&&/Architecte des Bâtiments de France/.test(urb.servitudes[0].libelle)&&urb.servitudes[1].libelle==='Servitude ZZ9','servitudes : doublons retirés, code inconnu nommé tel quel');
  chk(urb.informations.length===1,'informations sans doublon');
  const r=T.lireRisques(F);
  chk(r.url&&r.naturels.length===5&&!r.naturels.some(x=>x.cle==='avalanche')&&r.argile.code===2&&r.seisme.zone===2,'risques : présents seulement, argiles et sismicité lues');
  chk(T.lireRisques({rapport:{url:'https://ailleurs.example/x'}}).url===null,'un lien de rapport qui n’est pas Géorisques est écarté');
  const infos={parcelle:p,urbanisme:urb,risques:r};
  const pts=T.pointsAttention(infos,{nature:'construction',surfaceProjet:160});
  const t=pts.map(x=>x.titre).join(' | ');
  chk(/Abords d’un monument historique/.test(t)&&/Argiles : exposition moyenne/.test(t)&&/Inondation/.test(t)&&/Plus de 150 m²/.test(t)&&/Radon/.test(t)&&/Pollution des sols/.test(t),'points d’attention : ABF, argiles, inondation, 150 m², radon, pollution');
  chk(!/Remontée de nappe/.test(t)&&!/ICPE|industrielles/.test(t),'un risque « non connu » ou « non concerné » à l’adresse n’est pas signalé');
  chk(pts[0].niveau==='important'&&pts[pts.length-1].niveau==='info','les plus importants d’abord');
  chk(pts.every(x=>/vérifier|Vérifier|rapport officiel|indisp|conseill|déconseill|instruction|Soigner|s’impose/.test(x.texte)),'chaque point dit quoi vérifier');
  const a=T.pointsAttention(infos,{nature:'agrandissement',surfaceProjet:35,surfaceExistante:120}).map(x=>x.titre+' '+x.texte).join(' | ');
  chk(/Déclaration préalable en principe/.test(a)&&/40 m² en zone urbaine/.test(a)&&/Plus de 150 m² après travaux/.test(a),'agrandissement : déclaration ou permis (seuil indicatif), 150 m² après travaux');
  const zA=T.pointsAttention({urbanisme:{zone:{libelle:'A',type:'A'}},risques:{}},{nature:'construction'});
  chk(zA[0].niveau==='bloquant'&&/Zone agricole/.test(zA[0].titre),'zone agricole : signalée en premier, bloquante');
  chk(T.pointsAttention({urbanisme:{rnu:true},risques:{}},{}).some(x=>/RNU/.test(x.titre)),'commune au RNU signalée');
  fin();
})();
