/* Le prix d'une option qui remplace une prestation déjà chiffrée : des
   portes « FUJI » au lieu des portes de base. On déduit la prestation
   initiale (un poste du chiffrage, ou un montant saisi) pour ne compter que
   l'écart ; la rétrocession se pose dans le prix de cet écart, sans se
   compter deux fois ; les honoraires CP se règlent option par option (lot
   par lot), à part du prix, et rejoignent la marge une fois l'option
   incluse. Une option sans ces réglages garde l'ancien calcul. Prospect
   fictif. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['optionDetail','optionMontant','optionRetro','optionHonoraires','prospectCoutHT','prospectMargeHT',
  'prospectPrixHT','prospectPostesRetro','prospectHonoOptionsHT','impactOption','PostesChiffrage','RecapChiffrage',
  'genererChiffrageInterneDocx','genererDossierDocx','lireDocumentLignes','EMPTY']);
const {chk,fin}=verif();

const base={id:'p1',nom:'Maison Fictive',client:'M. Fictif',margePct:10,tva:20,navette:{},chiffrages:[],plans:[],pieces:[],pj:{},
  postes:[{id:'go',libelle:'GROS ŒUVRE',montant:100000},{id:'mi',libelle:'MENUISERIES INTÉRIEURES',montant:2300}]};
const fuji={id:'o1',libelle:'MENUISERIES INTÉRIEURES',montant:3011,retroPct:10,initiale:{type:'poste',posteId:'mi'}};

/* ---------- 1. l'écart, la rétrocession dans son prix ---------- */
{
  const p={...base,optionsChiffrage:[fuji]};
  const d=M.optionDetail(fuji,undefined,p);
  chk(d.choisi===3011&&d.initiale.montant===2300&&d.ecart===711,'prestation choisie 3 011 − prestation initiale (poste) 2 300 = écart 711');
  chk(d.prix===790&&d.retro===79,'10 % de rétrocession dans le prix de l’écart : 711 / 0,90 = 790, dont 79 rétrocédés');
  chk(M.optionMontant(fuji,undefined,p)===790,'l’option vaut 790 € HT, pas 3 011');
  chk(M.prospectCoutHT(p)===102300,'non incluse, elle ne change pas le coût (102 300)');
  const inc={...base,optionsChiffrage:[{...fuji,incluse:true}]};
  chk(M.prospectCoutHT(inc)===103090,'incluse, elle ajoute son écart : 102 300 + 790');
  chk(M.prospectPostesRetro(inc)===79,'et sa rétrocession : 79');
  /* le poste suivi : s'il change, l'écart suit */
  const p2={...base,postes:[base.postes[0],{...base.postes[1],montant:2500}],optionsChiffrage:[fuji]};
  chk(M.optionDetail(fuji,undefined,p2).ecart===511,'le poste de base passe à 2 500 : l’écart suit (511)');
  /* un poste relevé de sa propre rétrocession compte au prix de l'artisan */
  const p3={...base,postes:[base.postes[0],{...base.postes[1],prixBase:2300,retroPct:10,montant:2555.56}],optionsChiffrage:[fuji]};
  chk(M.optionDetail(fuji,undefined,p3).initiale.montant===2300,'un poste de base tiré d’un prix de base (2 300 → 2 555,56) se déduit au prix de l’artisan');
  /* un montant saisi, pour une partie d'un poste */
  const part={...fuji,initiale:{type:'montant',montant:'1800',libelle:'Portes de base'}};
  const dp=M.optionDetail(part,undefined,p);
  chk(dp.ecart===1211&&dp.initiale.libelle==='Portes de base','un montant saisi se déduit de même (3 011 − 1 800)');
  /* un forfait de rétrocession s'ajoute à l'écart */
  chk(M.optionDetail({...fuji,retroPct:'',retroMontant:100},undefined,p).prix===811,'un forfait de rétrocession (100 €) s’ajoute à l’écart : 811');
  /* la majoration du corps d'état s'applique aux deux prix */
  const maj=[{corps:'Menuiseries intérieures',pct:5}];
  const dm=M.optionDetail(fuji,maj,p);
  chk(dm.choisi===3161.55&&dm.initiale.montant===2415&&dm.ecart===746.55&&dm.prix===829.5,'majoration de 5 % sur les deux : écart 746,55, prix 829,50');
  /* un quantitatif déjà relevé de sa rétrocession repart des prix de l'artisan */
  const q={...fuji,montant:933.33,retroPctApplique:10,initiale:{type:'montant',montant:500},quantitatif:{lignes:[
    {id:'l1',type:'article',libelle:'Bloc-porte',pu:200,qt:3},{id:'l2',type:'article',libelle:'Galandage',pu:333.33,qt:1}]}};
  const dq=M.optionDetail(q,undefined,p);
  chk(dq.choisi===840&&dq.ecart===340&&dq.prix===377.78,'quantitatif relevé de 10 % : repart de 840 (prix de l’artisan), écart 340, prix 377,78 — pas de double rétrocession');
  /* moins cher que la prestation initiale : une moins-value */
  chk(M.optionMontant({...fuji,montant:2000},undefined,p)===-333.33,'moins chère que la prestation initiale : −300 / 0,90 = −333,33');
  /* le poste a disparu : rien n'est déduit, et on le sait */
  const perdu=M.optionDetail({...fuji,initiale:{type:'poste',posteId:'zz'}},undefined,p);
  chk(perdu.initiale.perdu===true&&perdu.ecart===3011,'poste supprimé : rien n’est déduit, et le détail le signale');
  /* sans prestation initiale : l'ancien calcul, inchangé */
  const ancien={id:'o2',libelle:'CLÔTURE',montant:3000,retroPct:10};
  chk(M.optionMontant(ancien)===3000&&M.optionRetro(ancien)===300,'une option sans prestation initiale garde l’ancien calcul (3 000, rétrocession 300)');
}

/* ---------- 2. les honoraires CP, option par option ---------- */
{
  const o={...fuji,honoPct:8,incluse:true};
  const p={...base,optionsChiffrage:[o]};
  chk(M.optionHonoraires(o,undefined,p)===63.2,'8 % d’honoraires sur une option de 790 : 63,20');
  chk(M.prospectHonoOptionsHT(p)===63.2,'comptés dans les honoraires sur options incluses');
  chk(M.prospectMargeHT(p)===10293.2,'la marge : 10 % des postes (10 230) + 63,20 — l’option ne porte pas en plus le taux du projet');
  chk(M.prospectPrixHT(p)===113383.2,'le prix HT suit : 103 090 + 10 293,20');
  const im=M.impactOption({...p,optionsChiffrage:[{...o,incluse:false}]},o);
  chk(im.coutHT===790&&im.margeHT===63.2,'l’impact affiché de l’option : +790 de coût, +63,20 de marge');
  chk(M.prospectMargeHT({...p,optionsChiffrage:[{...o,honoPct:'',honoMontant:150}]})===10380,'un forfait d’honoraires (150 €) remplace le taux');
  chk(M.prospectMargeHT({...p,margeMontant:12000})===12063.2,'marge du projet fixée en € : les honoraires de l’option s’y ajoutent');
  chk(M.prospectMargeHT({...p,margeMontant:12000,optionsChiffrage:[{...fuji,incluse:true}]})===12000,'sans honoraires propres, une marge fixée ne bouge pas (ancienne règle)');
  chk(M.prospectMargeHT({...p,optionsChiffrage:[{...fuji,incluse:true}]})===10309,'sans honoraires propres, le taux du projet s’applique à l’option (ancienne règle)');
  chk(M.prospectMargeHT({...p,optionsChiffrage:[{...o,incluse:false}]})===10230,'non incluse, l’option n’ajoute aucun honoraire');
}

/* ---------- 3. l'éditeur ---------- */
{
  let L=[{id:'o1',libelle:'MENUISERIES INTÉRIEURES',montant:933.33,retroPct:10,retroPctApplique:10,quantitatif:{lignes:[
    {id:'l1',type:'article',libelle:'Bloc-porte',pu:200,qt:3},{id:'l2',type:'article',libelle:'Galandage',pu:333.33,qt:1}]}}];
  let tr;
  const rendre=()=>React.createElement(M.PostesChiffrage,{data:M.EMPTY,save(){},p:{...base,optionsChiffrage:L},postes:L,
    onChange:v=>{L=v;TR.act(()=>{tr.update(rendre())})},options:true});
  TR.act(()=>{tr=TR.create(rendre())});
  const t=()=>norm(texteInst(tr.root));
  const choix=()=>tr.root.findAll(n=>n.type==='select'&&n.props['aria-label']==='Prestation initiale à déduire')[0];
  chk(!!choix(),'chaque option propose « Prestation initiale à déduire »');
  chk(choix().findAll(n=>n.type==='option').some(n=>/MENUISERIES INTÉRIEURES — 2 300 € HT/i.test(norm(texteInst(n)))),'parmi les postes du chiffrage, avec leur prix');
  TR.act(()=>{choix().props.onChange({target:{value:'__montant'}})});
  chk(L[0].initiale&&L[0].initiale.type==='montant','« un montant saisi » ouvre la saisie');
  chk(L[0].quantitatif.lignes[0].pu===180&&L[0].quantitatif.lignes[1].pu===300&&L[0].montant===840&&!+L[0].retroPctApplique,
    'les prix unitaires reviennent au prix de l’artisan (180, 300) : la rétrocession passera sur l’écart');
  const champ=tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Montant de la prestation initiale')[0];
  TR.act(()=>{champ.props.onChange({target:{value:'500'}})});
  chk(/Prix de l’option\s*377,78 € HT/.test(t()),'le détail affiche le prix de l’option : (840 − 500) / 0,90 = 377,78');
  chk(/Rétrocession 10 % comprise dans le prix\s*37,78 €/.test(t()),'et la rétrocession comprise dans le prix (37,78)');
  const pct=tr.root.findAll(n=>n.type==='input'&&n.props.placeholder==='%'&&n.props.step==='0.1'&&!n.props['aria-label'])[0];
  TR.act(()=>{pct.props.onBlur()});
  chk(L[0].quantitatif.lignes[0].pu===180,'quitter le champ du taux ne relève plus les prix unitaires (la rétrocession est dans l’écart)');
  TR.act(()=>{choix().props.onChange({target:{value:'mi'}})});
  chk(L[0].initiale.type==='poste'&&L[0].initiale.posteId==='mi','on peut choisir à la place le poste MENUISERIES INTÉRIEURES');
  chk(/= Écart\s*-1 460,00 €/.test(t())&&/moins-value/.test(t()),'moins chère que le poste entier : écart négatif, signalé comme une moins-value');
  const hono=tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Taux d’honoraires de l’option')[0];
  chk(/vide : le taux de marge du projet \(10 %\) s’applique/.test(t()),'sans honoraires propres, l’écran rappelle le taux du projet');
  TR.act(()=>{choix().props.onChange({target:{value:''}})});
  TR.act(()=>{tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Taux d’honoraires de l’option')[0].props.onChange({target:{value:'8'}})});
  chk(L[0].honoPct==='8','les honoraires de l’option se saisissent sur elle');
  chk(/soit 67,20 € HT, à part du prix de l’option/.test(t()),'8 % de 840 : 67,20, à part du prix');
  chk(/honoraires CP sur options : 67 € HT, à part/.test(t()),'le total des options les rappelle');
  chk(!!hono,'champ d’honoraires présent');
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
  chk(/prestation choisie 3 011,00 € − prestation initiale « MENUISERIES INTÉRIEURES » \(poste du chiffrage\) 2 300,00 € = écart 711,00 €/.test(interne),
    'le chiffrage interne détaille le calcul de l’option');
  chk(/rétrocession comprise dans le prix 79,00 € ; prix de l’option 790,00 € HT/.test(interne),'avec la rétrocession et le prix');
  chk(/Honoraires CP/.test(interne)&&/63,20 € \(8 %\)/.test(interne)&&/taux du projet/.test(interne),'une colonne d’honoraires CP, option par option');
  chk(/dont honoraires CP sur les options incluses/.test(interne),'et leur part dans le bilan');
  const client=await lire(await M.genererDossierDocx(p,{}));
  const opts=client.split('Options proposées')[1]||'';
  chk(/plus-value sur la prestation prévue/.test(opts)&&/790,00 €/.test(opts),'le dossier client montre l’écart (790), présenté en plus-value sur la prestation prévue');
  chk(/Honoraires HT/.test(opts)&&/63,20 €/.test(opts),'avec les honoraires de l’option à part');
  chk(!/Rétro/.test(opts)&&!/2 300/.test(opts),'sans rien d’interne : ni rétrocession, ni prix de la prestation initiale');
  fin();
})().catch(e=>{console.error('ERREUR NON CAPTURÉE',e);process.exitCode=1});
