/* Réponses FICTIVES des services publics du terrain (format réel des
   services, relevé le 20/11/2026 ; valeurs inventées : commune « Villefictive »). */
const P=props=>({type:'FeatureCollection',features:[{type:'Feature',geometry:null,properties:props}]});
module.exports={
  geocodage:{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[0.1234,48.4321]},properties:{label:'12 Rue Imaginaire 61999 Villefictive',score:0.91,citycode:'61999',postcode:'61999',city:'Villefictive'}}]},
  parcelle:P({numero:'0123',feuille:1,section:'ZK',code_dep:'61',nom_com:'Villefictive',idu:'61999000ZK0123',contenance:812,code_insee:'61999'}),
  zone:P({gpu_doc_id:'docfictif',partition:'DU_61999',libelle:'UB',libelong:'ZONE URBAINE PAVILLONNAIRE',typezone:'U',nomfic:'61999_reglement_20260101.pdf#page=12',urlfic:''}),
  document:P({grid_title:'PLU DE VILLEFICTIVE',du_type:'PLU',partition:'DU_61999'}),
  commune:P({insee:'61999',name:'VILLEFICTIVE',is_rnu:false}),
  servitudes:{type:'FeatureCollection',features:[
    {properties:{suptype:'ac1',idgen:'AC1-1',typeass:'Périmètre des abords'}},
    {properties:{suptype:'ac1',idgen:'AC1-1',typeass:'Périmètre des abords'}},
    {properties:{suptype:'zz9',idgen:'ZZ9-1',nomass:'Servitude locale'}}]},
  informations:{type:'FeatureCollection',features:[{properties:{libelle:'Zone exposée au radon catégorie 3'}},{properties:{libelle:'Zone exposée au radon catégorie 3'}}]},
  prescriptions:{type:'FeatureCollection',features:[]},
  rapport:{adresse:{libelle:'12 Rue Imaginaire, 61999 Villefictive'},commune:{libelle:'Villefictive',codeInsee:'61999'},
    url:'https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2?typeForm=adresse&codeInsee=61999&lon=0.1234&lat=48.4321',
    risquesNaturels:{inondation:{present:true,libelle:'Inondation',libelleStatutCommune:'Risque Existant',libelleStatutAdresse:'Risque Existant'},
      remonteeNappe:{present:true,libelle:'Remontée de nappe',libelleStatutCommune:'Risque Existant',libelleStatutAdresse:'Risque non Connu'},
      seisme:{present:true,libelle:'Séisme',libelleStatutAdresse:'Risque Existant - faible'},
      retraitGonflementArgile:{present:true,libelle:'Retrait gonflement des argiles',libelleStatutAdresse:'Risque Existant - modéré'},
      radon:{present:true,libelle:'Radon',libelleStatutAdresse:'Risque Existant - important'},
      avalanche:{present:false,libelle:'Avalanche',libelleStatutAdresse:null}},
    risquesTechnologiques:{icpe:{present:true,libelle:'Installations industrielles classées (ICPE)',libelleStatutAdresse:'Risque non Concerne'},
      pollutionSols:{present:true,libelle:'Pollution des sols',libelleStatutAdresse:'Risque Concerne'}}},
  argile:{codeExposition:'2',exposition:'Exposition moyenne'},
  seisme:{results:1,data:[{code_insee:'61999',libelle_commune:'VILLEFICTIVE',code_zone:'2',zone_sismicite:'2 - FAIBLE'}]},
};
