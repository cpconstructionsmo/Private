/* Relevé de visite — l'aide à la vente du premier rendez-vous
   (releve/aide-vente.js) : mensualités, pistes pour rentrer dans le budget,
   calendrier indicatif, mémo du vendeur, message de suivi. Prix FICTIFS. */
const {verif}=require('./harness');
const {chk,fin}=verif();
(async()=>{
  const V=await import('../releve/aide-vente.js');
  const B=await import('../releve/budget.js');

  /* mensualités */
  chk(Math.abs(V.mensualite(10000,0,50)-200)<1e-9,'taux nul : le capital divisé par les mois');
  const m=V.mensualite(20000,5,60);
  chk(Math.abs(m-377.42)<0.05,'20 000 € à 5 % sur 60 mois : environ 377,42 €/mois (trouvé '+m.toFixed(2)+')');
  chk(V.mensualite(0,5,60)===0&&V.mensualite(-5,5,60)===0,'pas de capital : pas de mensualité');
  chk(V.simulerCredit({min:10000,max:20000},{actif:false})===null,'désactivée par défaut : aucune simulation');
  chk(V.simulerCredit({min:0,max:0},{actif:true})===null,'sans estimation : aucune simulation');
  const s=V.simulerCredit({min:10000,max:20000},{actif:true,apport:5000,taux:'4,5',duree:84});
  chk(s&&s.capital.min===5000&&s.capital.max===15000&&s.duree===84&&s.taux===4.5,'capital = total − apport, taux à virgule lu');
  chk(s.mensualite.min<s.mensualite.max&&s.mensualite.min>0,'la mensualité suit la fourchette');
  const s2=V.simulerCredit({min:1000,max:3000},{actif:true,apport:9000});
  chk(s2.capital.max===0&&s2.mensualite.max===0,'apport supérieur au total : rien à emprunter');
  const s3=V.simulerCredit({min:1000,max:3000},{actif:true,duree:99});
  chk(s3.duree===60&&s3.taux===V.TAUX_DEFAUT,'durée inconnue ou taux absent : les valeurs par défaut');

  /* pistes pour rentrer dans le budget (table fictive à prix posés) */
  const T=B.OUVRAGES.map(o=>({...o}));
  const choix=[{id:'c1',ouvrageId:'cuisine',surface:10,niveau:'haut'},{id:'c2',ouvrageId:'sdb',surface:5,niveau:'standard'},{id:'c3',ouvrageId:'peinture',surface:100,niveau:'standard'}];
  const pieces=[];const proj={};
  const base=B.calculerEstimation({ouvrages:choix},T,pieces,[],proj);
  chk(base.total.max>0,'estimation de départ calculée');
  chk(V.pistesBudget({ouvrages:choix},null,T,pieces,[],proj).length===0,'sans enveloppe : aucune piste');
  chk(V.pistesBudget({ouvrages:choix},base.total.max+1000,T,pieces,[],proj).length===0,'dans le budget : aucune piste');
  chk(V.pistesBudget({ouvrages:[]},20000,T,pieces,[],proj).length===0,'estimation vide : aucune piste');
  const env=Math.round(base.total.max*0.8/100)*100;
  const p=V.pistesBudget({ouvrages:choix},env,T,pieces,[],proj);
  chk(p.length>0&&p.length<=3,'budget dépassé : de 1 à 3 pistes ('+p.length+')');
  chk(p.every(x=>x.economie>=100&&x.texte&&x.action&&x.action.type),'chaque piste a un texte, une économie et une action');
  chk(p.every(x=>x.rentre===(x.nouveau.max<=env)),'« rentre dans le budget » = le nouveau maximum tient dans l’enveloppe');
  const fits=p.filter(x=>x.rentre),rest=p.filter(x=>!x.rentre);
  chk(p.slice(0,fits.length).every(x=>x.rentre)&&fits.every((x,i)=>i===0||fits[i-1].economie<=x.economie),'celles qui font rentrer d’abord, la moins sacrifiante en tête');
  chk(rest.every((x,i)=>i===0||rest[i-1].economie>=x.economie),'les autres, de la plus économe à la moins économe');
  // les choix de départ ne sont jamais modifiés par le calcul des pistes
  chk(choix[0].niveau==='haut'&&choix.length===3,'le budget de la visite n’est pas touché par le calcul');
  const eco=V.pistesBudget({ouvrages:choix.map(c=>({...c,niveau:'eco'}))},env,T,pieces,[],proj);
  chk(eco.every(x=>x.action.type==='retirer'),'tout en Éco : seule reste l’option de reporter un travail');

  /* calendrier */
  const sans=V.calendrier({aujourdhui:'2026-01-05',ouvrageIds:['peinture']});
  chk(sans.pre===SEM('ap')+SEM('dp')+SEM('consult')&&sans.debut===null&&sans.lignes.length===0,'sans date : seulement le délai minimal avant travaux');
  function SEM(k){return V.SEMAINES[k];}
  chk(sans.auPlusTot===V.ajouterJours('2026-01-05',sans.pre*7)&&!sans.fabrication,'début possible au plus tôt, sans fabrication pour de la peinture');
  const fab=V.calendrier({aujourdhui:'2026-01-05',ouvrageIds:['cuisine','peinture']});
  chk(fab.fabrication&&fab.pre===sans.pre+SEM('fab'),'une cuisine ajoute le délai de fabrication');
  const cal=V.calendrier({aujourdhui:'2026-01-05',debut:'2026-09-01',ouvrageIds:['fenetres'],urbanisme:true,abf:true});
  chk(cal.lignes.map(l=>l.cle).join()==='signature,ap,dp,consult,fab,travaux,reception','toutes les étapes, dans l’ordre');
  const dates=cal.lignes.map(l=>l.date);
  chk(dates.every((d,i)=>i===0||d>=dates[i-1]),'les dates se suivent');
  chk(cal.lignes.find(l=>l.cle==='travaux').date==='2026-09-01'&&cal.lignes.find(l=>l.cle==='reception').date===V.ajouterJours('2026-09-01',SEM('travaux')*7),'le chantier commence à la date voulue et dure son délai');
  chk(cal.lignes.find(l=>l.cle==='dp').semaines===SEM('dp')+SEM('abf'),'secteur protégé : le délai de l’ABF s’ajoute');
  chk(cal.court===false&&cal.signerAvant===cal.lignes[0].date,'assez de temps : pas d’alerte, date de signature au plus tard donnée');
  const court=V.calendrier({aujourdhui:'2026-01-05',debut:'2026-02-01',ouvrageIds:[]});
  chk(court.court===true,'date trop proche : « délai court »');
  const sansU=V.calendrier({aujourdhui:'2026-01-05',debut:'2026-09-01',ouvrageIds:[],urbanisme:false});
  chk(!sansU.lignes.some(l=>l.cle==='dp'),'sans dossier d’urbanisme : l’étape disparaît');
  chk(V.calendrier({aujourdhui:'2026-01-05',debut:'pas une date',ouvrageIds:[]}).debut===null,'une date illisible n’est pas inventée');
  chk(V.ajouterJours('2026-12-30',5)==='2027-01-04'&&V.dateLongue('2026-03-02')==='2 mars 2026'&&V.dateLongue('x')==='','calcul et affichage des dates, sans décalage de fuseau');

  /* mémos */
  const mm=V.memosPour(['cuisine','sdb','combles','iti','pac'],'');
  chk(mm.map(x=>x.cle).join()==='cuisine,sdb,isolation,chauffage','un mémo par sujet, sans doublon (combles et ITI : un seul mémo isolation)');
  chk(mm.every(x=>x.q.length===3&&x.up.length===3&&x.vig.length===3),'chaque mémo : 3 questions, 3 propositions, 3 points de vigilance');
  chk(V.memosPour(['cuisine'],'Il voudrait ouvrir le mur du séjour').map(x=>x.cle).join()==='cuisine,mur','des souhaits qui parlent d’ouvrir un mur ajoutent ce mémo');
  chk(V.memosPour(['toiture','reno-complete'],'').length===0,'des travaux sans mémo : aucun mémo inventé');
  chk(Object.values(V.MEMOS).every(x=>!/\d+\s?(€|%)/.test(JSON.stringify(x))),'aucun prix ni pourcentage dans les mémos');
  chk(Object.values(V.MEMO_DE_OUVRAGE).every(k=>V.MEMOS[k])&&Object.keys(V.MEMO_DE_OUVRAGE).every(id=>B.OUVRAGES.some(o=>o.id===id)),'les mémos renvoient à des travaux et des sujets qui existent');

  /* messages */
  const d={civilite:'Mme',nom:'Test',fourchette:{min:41000,max:52400},dateVisite:'2026-11-20',signature:'Jean\nCP Constructions',
    lignes:[{libelle:'Cuisine',min:9040,max:14960},{libelle:'Peinture',min:6000,max:6000},{libelle:'Sans prix',min:0,max:0}],debut:'2027-03-01',signerAvant:'2026-12-01'};
  const mail=V.messageSuivi('mail',d);
  chk(/^Bonjour Madame Test,/.test(mail)&&/du 20 novembre 2026/.test(mail),'e-mail : formule d’appel et date de la visite');
  chk(/• Cuisine : de 9 000 € à 15 000 € TTC/.test(mail)&&/• Peinture : environ 6 000 € TTC/.test(mail)&&!/Sans prix/.test(mail),'e-mail : une ligne par travaux chiffrés');
  chk(/entre 41 000 € et 52 400 € TTC/.test(mail)&&/indicative et non contractuelle/.test(mail),'e-mail : la fourchette, dite indicative et non contractuelle');
  chk(/le 1 mars 2027, la signature de la mission serait à prévoir avant le 1 décembre 2026/.test(mail)||/mars 2027, la signature de la mission serait à prévoir avant le 1.* décembre 2026/.test(mail),'e-mail : le calendrier quand une date est choisie');
  chk(/Bien cordialement,\nJean\nCP Constructions$/.test(mail),'e-mail : la signature saisie');
  const sms=V.messageSuivi('sms',d);
  chk(sms.length<500&&/entre 41 000 € et 52 400 € TTC/.test(sms)&&!/\n/.test(sms),'SMS : court, sur une ligne');
  const rel=V.messageSuivi('relance',d);
  chk(/Avez-vous pu y réfléchir/.test(rel)&&/estimation indicative se situe entre/.test(rel),'relance : reprend l’estimation');
  const nu=V.messageSuivi('mail',{});
  chk(/^Bonjour,/.test(nu)&&!/entre/.test(nu)&&/CP Constructions$/.test(nu)&&!/undefined|NaN/.test(nu),'sans rien de saisi : un texte propre, rien d’inventé');
  chk(!/[\u00a0\u202f]/.test(mail),'aucune espace insécable dans le texte (SMS et e-mails)');
  chk(V.civiliteLongue('M.')==='Monsieur'&&V.civiliteLongue('M. et Mme')==='Monsieur et Madame'&&V.civiliteLongue('Mme')==='Madame'&&V.civiliteLongue('')==='','civilités');
  fin();
})();
