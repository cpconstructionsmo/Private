/* Le prix d'une option qui remplace une prestation déjà chiffrée : des
   portes « FUJI » au lieu des portes de base. On déduit la prestation
   initiale (un poste du chiffrage, ou un montant saisi) pour ne compter que
   l'écart. La rétrocession y entre comme dans le chiffrage par poste : les
   prix unitaires (ou le prix de base) de l'option relevés du taux, la
   prestation initiale retirée au prix où le chiffrage la compte. Les
   honoraires CP se règlent option par option (lot par lot), entrent dans
   le prix annoncé de l'option, et rejoignent la marge une fois l'option
   incluse. Une option sans ces réglages garde l'ancien calcul. Prospect
   fictif. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['optionDetail','optionMontant','optionRetro','optionHonoraires','optionPrix','prospectCoutHT','prospectMargeHT',
  'prospectPrixHT','prospectPostesRetro','prospectHonoOptionsHT','impactOption','PostesChiffrage','RecapChiffrage',
  'genererChiffrageInterneDocx','genererDossierDocx','lireDocumentLignes','EMPTY']);
const {chk,fin}=verif();

/* le chiffrage initial : les menuiseries intérieures à 2 300 € chez l'artisan, relevées de 10 % de rétrocession (2 555,56 €) */
const mi={id:'mi',libelle:'MENUISERIES INTÉRIEURES',prixBase:2300,retroPct:10,montant:2555.56};
const base={id:'p1',nom:'Maison Fictive',client:'M. Fictif',margePct:10,tva:20,navette:{},chiffrages:[],plans:[],pieces:[],pj:{},
  postes:[{id:'go',libelle:'GROS ŒUVRE',montant:100000},mi]};
/* l'option : les portes FUJI à 3 011 € chez l'artisan, relevées de même (3 345,56 €) */
const fuji={id:'o1',libelle:'MENUISERIES INTÉRIEURES',prixBase:3011,retroPct:10,montant:3345.56,initiale:{type:'poste',posteId:'mi'}};
const lignes=(a,b)=>({lignes:[{id:'l1',type:'article',libelle:'Bloc-porte',pu:a,qt:3},{id:'l2',type:'article',libelle:'Galandage',pu:b,qt:1}]});

/* ---------- 1. l'écart, rétrocession comprise comme au chiffrage par poste ---------- */
{
  const p={...base,optionsChiffrage:[fuji]};
  const d=M.optionDetail(fuji,undefined,p);
  chk(d.choisi===3345.56&&d.initiale.montant===2555.56,'prestation choisie 3 345,56 et prestation initiale 2 555,56 : rétrocession comprise des deux côtés, comme au chiffrage');
  chk(d.prix===790&&d.retro===79,'l’option vaut 790 (soit (3 011 − 2 300) / 0,90), dont 79 de rétrocession');
  chk(M.optionMontant(fuji,undefined,p)===790,'l’option vaut 790 € HT, pas 3 345,56');
  chk(M.prospectCoutHT(p)===102555.56,'non incluse, elle ne change pas le coût');
  const inc={...base,optionsChiffrage:[{...fuji,incluse:true}]};
  chk(M.prospectCoutHT(inc)===103345.56,'incluse, elle ajoute son écart : 102 555,56 + 790');
  chk(M.prospectPostesRetro(inc)===334.56,'et sa rétrocession à celle du poste : 255,56 + 79');
  /* un poste initial sans rétrocession : seule l'option porte la sienne, sur tout son prix de vente */
  const sansRetro={...base,postes:[base.postes[0],{id:'mi',libelle:'MENUISERIES INTÉRIEURES',montant:2300}]};
  chk(M.optionDetail(fuji,undefined,sansRetro).prix===1045.56,'poste initial à 2 300 sans rétrocession : 3 345,56 − 2 300 = 1 045,56');
  /* le poste suivi : s'il change, l'écart suit */
  const p2={...base,postes:[base.postes[0],{...mi,prixBase:2500,montant:2777.78}],optionsChiffrage:[fuji]};
  chk(M.optionDetail(fuji,undefined,p2).prix===567.78,'le poste de base passe à 2 500 (2 777,78) : l’option suit (567,78)');
  /* un montant saisi (une partie d'un poste) : un prix d'artisan, relevé de la rétrocession de l'option */
  const part={...fuji,initiale:{type:'montant',montant:'1800',libelle:'Portes de base'}};
  const dp=M.optionDetail(part,undefined,p);
  chk(dp.initiale.montant===2000&&dp.prix===1345.56&&dp.initiale.libelle==='Portes de base','un montant saisi de 1 800 se déduit relevé de 10 % (2 000) : 1 345,56');
  /* un forfait de rétrocession ne change pas le prix, comme pour un poste */
  const df=M.optionDetail({...fuji,prixBase:'',montant:3011,retroPct:'',retroMontant:100},undefined,p);
  chk(df.prix===455.44&&df.retro===100,'forfait de 100 € : il ne s’ajoute pas au prix (3 011 − 2 555,56 = 455,44), il est la rétrocession');
  /* la majoration du corps d'état s'applique aux deux prix */
  const dm=M.optionDetail(fuji,[{corps:'Menuiseries intérieures',pct:5}],p);
  chk(dm.choisi===3512.84&&dm.initiale.montant===2683.34&&dm.prix===829.5,'majoration de 5 % sur les deux : 3 512,84 − 2 683,34 = 829,50');
  /* les prix unitaires relevés ou pas encore (le taux saisi, le champ pas encore quitté) : le même prix */
  const q0={...fuji,prixBase:'',montant:840,retroPctApplique:0,initiale:{type:'montant',montant:500},quantitatif:lignes(180,300)};
  const q1={...q0,montant:933.33,retroPctApplique:10,quantitatif:lignes(200,333.33)};
  chk(M.optionDetail(q0,undefined,p).choisi===933.33&&M.optionDetail(q1,undefined,p).choisi===933.33,'quantitatif à 180 / 300 : 933,33 rétrocession comprise, relevé ou pas encore');
  chk(M.optionDetail(q1,undefined,p).prix===377.77,'moins 500 relevés de 10 % (555,56) : 377,77');
  /* moins cher que la prestation initiale : une moins-value */
  chk(M.optionMontant({...fuji,prixBase:2000,montant:2222.22},undefined,p)===-333.34,'moins chère que la prestation initiale : 2 222,22 − 2 555,56 = −333,34');
  /* le poste a disparu : rien n'est déduit, et on le sait */
  const perdu=M.optionDetail({...fuji,initiale:{type:'poste',posteId:'zz'}},undefined,p);
  chk(perdu.initiale.perdu===true&&perdu.prix===3345.56,'poste supprimé : rien n’est déduit, et le détail le signale');
  /* sans prestation initiale : l'ancien calcul, inchangé */
  const ancien={id:'o2',libelle:'CLÔTURE',montant:3000,retroPct:10};
  chk(M.optionMontant(ancien)===3000&&M.optionRetro(ancien)===300,'une option sans prestation initiale garde l’ancien calcul (3 000, rétrocession 300)');
}

/* ---------- 2. les honoraires CP, option par option ---------- */
{
  const o={...fuji,honoPct:8,incluse:true};
  const p={...base,optionsChiffrage:[o]};
  chk(M.optionHonoraires(o,undefined,p)===63.2,'8 % d’honoraires sur une option de 790 : 63,20');
  chk(M.optionPrix(o,undefined,p)===853.2&&M.optionMontant(o,undefined,p)===790,'le prix annoncé de l’option les comprend : 853,20 (dont 790 de travaux)');
  chk(M.optionPrix(fuji,undefined,p)===790,'sans honoraires propres, le prix annoncé reste le montant (790)');
  chk(M.prospectHonoOptionsHT(p)===63.2,'comptés dans les honoraires sur options incluses');
  chk(M.prospectMargeHT(p)===10318.76,'la marge : 10 % des postes (10 255,56) + 63,20 — l’option ne porte pas en plus le taux du projet');
  chk(M.prospectPrixHT(p)===113664.32,'le prix HT suit : 103 345,56 + 10 318,76');
  const im=M.impactOption({...p,optionsChiffrage:[{...o,incluse:false}]},o);
  chk(im.coutHT===790&&im.margeHT===63.2,'l’impact affiché de l’option : +790 de coût, +63,20 de marge');
  chk(M.prospectMargeHT({...p,optionsChiffrage:[{...o,honoPct:'',honoMontant:150}]})===10405.56,'un forfait d’honoraires (150 €) remplace le taux');
  chk(M.prospectMargeHT({...p,margeMontant:12000})===12063.2,'marge du projet fixée en € : les honoraires de l’option s’y ajoutent');
  chk(M.prospectMargeHT({...p,margeMontant:12000,optionsChiffrage:[{...fuji,incluse:true}]})===12000,'sans honoraires propres, une marge fixée ne bouge pas (ancienne règle)');
  chk(M.prospectMargeHT({...p,optionsChiffrage:[{...fuji,incluse:true}]})===10334.56,'sans honoraires propres, le taux du projet s’applique à l’option (ancienne règle)');
  chk(M.prospectMargeHT({...p,optionsChiffrage:[{...o,incluse:false}]})===10255.56,'non incluse, l’option n’ajoute aucun honoraire');
}

/* ---------- 3. l'éditeur ---------- */
{
  let L=[{id:'o1',libelle:'MENUISERIES INTÉRIEURES',montant:840,retroPct:'',quantitatif:lignes(180,300)}];
  let tr;
  const rendre=()=>React.createElement(M.PostesChiffrage,{data:M.EMPTY,save(){},p:{...base,optionsChiffrage:L},postes:L,
    onChange:v=>{L=v;TR.act(()=>{tr.update(rendre())})},options:true});
  TR.act(()=>{tr=TR.create(rendre())});
  const t=()=>norm(texteInst(tr.root));
  const choix=()=>tr.root.findAll(n=>n.type==='select'&&n.props['aria-label']==='Prestation initiale à déduire')[0];
  const pct=()=>tr.root.findAll(n=>n.type==='input'&&n.props.placeholder==='%'&&n.props.step==='0.1'&&!n.props['aria-label'])[0];
  chk(!!choix(),'chaque option propose « Prestation initiale à déduire »');
  chk(choix().findAll(n=>n.type==='option').some(n=>/MENUISERIES INTÉRIEURES — 2 556 € HT/i.test(norm(texteInst(n)))),'parmi les postes du chiffrage, au prix où il les compte');
  TR.act(()=>{choix().props.onChange({target:{value:'__montant'}})});
  chk(L[0].initiale&&L[0].initiale.type==='montant','« un montant saisi » ouvre la saisie');
  chk(L[0].quantitatif.lignes[0].pu===180&&L[0].montant===840,'choisir une prestation initiale ne touche pas aux prix unitaires');
  const champ=tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Montant de la prestation initiale')[0];
  TR.act(()=>{champ.props.onChange({target:{value:'500'}})});
  chk(/Prestation choisie \(sans rétrocession\)\s*840,00 €/.test(t())&&/Prix de l’option\s*340,00 € HT/.test(t()),'sans rétrocession : 840 − 500 = 340');
  /* le taux saisi : le prix de l'option le compte déjà, les prix unitaires se relèvent en quittant le champ */
  TR.act(()=>{pct().props.onChange({target:{value:'10'}})});
  chk(/Prestation choisie \(rétrocession 10 % comprise\)\s*933,33 €/.test(t())&&/− 555,56 €/.test(t()),'10 % : prestation choisie 933,33, prestation initiale 555,56');
  chk(/Montant de l’option \(dont rétrocession 37,78 €\)\s*377,77 €/.test(t())&&/Prix de l’option\s*377,77 € HT/.test(t()),'le prix de l’option : 377,77, dont 37,78 de rétrocession');
  chk(/Quittez ce champ pour relever automatiquement les prix unitaires du quantitatif à 10 %/.test(t()),'comme au chiffrage par poste : les prix unitaires se relèvent en quittant le champ');
  TR.act(()=>{pct().props.onBlur()});
  chk(L[0].quantitatif.lignes[0].pu===200&&L[0].quantitatif.lignes[1].pu===333.33&&String(L[0].retroPctApplique)==='10','les prix unitaires relevés de 10 % (180 → 200, 300 → 333,33), comme au chiffrage par poste');
  chk(/Prix unitaires du quantitatif relevés de 10 %/.test(t())&&/Prix de l’option\s*377,77 € HT/.test(t()),'relevés : le prix de l’option ne change pas');
  TR.act(()=>{choix().props.onChange({target:{value:'mi'}})});
  chk(L[0].initiale.type==='poste'&&L[0].initiale.posteId==='mi','on peut choisir à la place le poste MENUISERIES INTÉRIEURES');
  chk(/= Montant de l’option.*-1 622,23 €/.test(t())&&/moins-value/.test(t()),'moins chère que le poste entier (933,33 − 2 555,56) : signalée comme une moins-value');
  chk(/vide : le taux de marge du projet \(10 %\) s’applique/.test(t()),'sans honoraires propres, l’écran rappelle le taux du projet');
  TR.act(()=>{choix().props.onChange({target:{value:''}})});
  TR.act(()=>{tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Taux d’honoraires de l’option')[0].props.onChange({target:{value:'8'}})});
  chk(L[0].honoPct==='8','les honoraires de l’option se saisissent sur elle');
  chk(/soit 74,67 € HT, compris dans le prix de l’option/.test(t()),'8 % de 933,33 : 74,67, compris dans le prix');
  chk(/Montant de l’option\s*933,33 €\s*\+ Honoraires CP 8 %\s*74,67 €\s*Prix de l’option, honoraires compris\s*1 008,00 € HT/.test(t()),
    'le détail : montant 933,33 + honoraires 74,67 = prix de l’option 1 008,00');
  chk(/Total 1 008 € HT/.test(t())&&/honoraires CP compris : 75 € HT/.test(t()),'le total des options est honoraires compris, et le dit');
  TR.act(()=>{tr.unmount()});
}

/* ---------- 4. le récapitulatif et les documents ---------- */
(async()=>{
  const p={...base,optionsChiffrage:[{...fuji,honoPct:8,incluse:true},{id:'o2',libelle:'CLÔTURE',montant:3000}]};
  const rec=TR.create(React.createElement(M.RecapChiffrage,{p,interne:true}));
  chk(/dont 63 € d’honoraires CP sur les options incluses/.test(norm(texteInst(rec.root))),'le récapitulatif dit la part des honoraires sur options');
  const lire=async out=>{const ab=out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);
    return norm((await M.lireDocumentLignes({name:'d.docx',type:'',arrayBuffer:async()=>ab})).txt)};
  const interne=await lire(await M.genererChiffrageInterneDocx(p));
  chk(/prestation choisie \(rétrocession 10 % comprise\) 3 345,56 € − prestation initiale « MENUISERIES INTÉRIEURES » \(poste du chiffrage\) 2 555,56 € = 790,00 € \(dont rétrocession 79,00 €\)/.test(interne),
    'le chiffrage interne détaille le calcul de l’option');
  chk(/Honoraires CP/.test(interne)&&/63,20 € \(8 %\)/.test(interne)&&/taux du projet/.test(interne),'une colonne d’honoraires CP, option par option');
  chk(/honoraires CP 63,20 € ; prix de l’option 853,20 € HT/.test(interne)&&/Prix HT/.test(interne),'et le prix de l’option honoraires compris');
  chk(/dont honoraires CP sur les options incluses/.test(interne),'et leur part dans le bilan');
  const client=await lire(await M.genererDossierDocx(p,{}));
  const opts=client.split('Options proposées')[1]||'';
  chk(/plus-value sur la prestation prévue/.test(opts)&&/853,20 €/.test(opts),'le dossier client montre l’option à 853,20, honoraires compris, en plus-value sur la prestation prévue');
  chk(!/Honoraires HT/.test(opts)&&!/63,20/.test(opts)&&/comprend les honoraires de maîtrise d’œuvre/.test(opts),'un seul montant par option : les honoraires y sont compris, et la note le dit');
  chk(!/Rétro/.test(opts)&&!/2 555/.test(opts)&&!/3 345/.test(opts),'sans rien d’interne : ni rétrocession, ni prix de la prestation initiale');
  fin();
})().catch(e=>{console.error('ERREUR NON CAPTURÉE',e);process.exitCode=1});
