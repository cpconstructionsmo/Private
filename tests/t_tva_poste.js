/* TVA par poste (index.html : posteTva, prospectVentilationTva,
   prospectTauxUnique, prospectPrixTTC, prospectCoutTTC, libelleTvaProspect,
   contratTravaux). Montants fictifs.
   La garantie d'abord : sans taux par poste, le prix est exactement celui
   d'avant (HT du projet × taux du projet). */
const {charger,verif}=require('./harness');
const M=charger(['prospectPrixTTC','prospectPrixHT','prospectCoutHT','prospectTva','prospectVentilationTva','prospectTauxUnique',
  'prospectTvaMixte','prospectCoutTTC','libelleTvaProspect','contratTravaux','posteTva']);
const {chk,fin}=verif();
const ancien=p=>Math.round(M.prospectPrixHT(p)*(1+M.prospectTva(p)/100)*100)/100;
const plat=s=>s.replace(/[  ]/g,' ');

/* 1. rien ne change sans taux par poste */
const cas=[
  {postes:[{id:'a',libelle:'MAÇONNERIE',montant:10000},{id:'b',libelle:'PEINTURE',montant:5000}],margePct:10,tva:10},
  {postes:[{id:'a',libelle:'X',montant:12345.67}],margePct:12.5,tva:20},
  {postes:[],coutHT:80000,margePct:15},
  {postes:[{id:'a',libelle:'X',montant:9999.99},{id:'b',libelle:'Y',montant:0.01}],margeMontant:1234.56,tva:5.5},
  {postes:[{id:'a',libelle:'X',montant:20000}],optionsChiffrage:[{id:'o',libelle:'OPTION',montant:3000,incluse:true}],margePct:8,tva:10},
];
cas.forEach((p,i)=>chk(M.prospectPrixTTC(p)===ancien(p),'cas '+(i+1)+' sans taux par poste : prix TTC identique à avant ('+M.prospectPrixTTC(p)+')'));
chk(M.prospectVentilationTva(cas[0]).length===1&&!M.prospectTvaMixte(cas[0]),'un seul taux : pas de TVA mixte');
chk(plat(M.libelleTvaProspect(cas[0]))==='TVA 10 %','libellé : « TVA 10 % »');

/* 2. TVA mixte */
const mixte={postes:[{id:'a',libelle:'MAÇONNERIE',montant:10000,tva:10},{id:'b',libelle:'MENUISERIES',montant:5000,tva:20}],margePct:10,tva:10};
const G=M.prospectVentilationTva(mixte);
chk(M.prospectTvaMixte(mixte)&&M.prospectTauxUnique(mixte)===null,'deux taux : TVA mixte');
chk(G.find(g=>g.taux===10).ht===11000&&G.find(g=>g.taux===20).ht===5500,'la marge se répartit au prorata du coût (11 000 et 5 500 € HT)');
chk(M.prospectPrixTTC(mixte)===18700,'prix TTC = 11 000 × 1,10 + 5 500 × 1,20 = 18 700 €');
chk(M.prospectCoutTTC(mixte)===17000,'coût des travaux TTC = 10 000 × 1,10 + 5 000 × 1,20 = 17 000 €');
chk(plat(M.libelleTvaProspect(mixte))==='TVA mixte : 20 % sur 5 500 € HT, 10 % sur 11 000 € HT','libellé : le détail par taux, jamais un taux unique');

/* 3. tous les postes au même taux, différent de celui du projet */
const reno={postes:[{id:'a',libelle:'ISOLATION',montant:8000,tva:5.5},{id:'b',libelle:'CHAUFFAGE',montant:4000,tva:5.5}],margePct:10,tva:20};
chk(M.prospectTauxUnique(reno)===5.5&&M.prospectPrixTTC(reno)===Math.round(13200*1.055*100)/100,'tous les postes à 5,5 % : le prix suit 5,5 %, pas le taux du projet');
chk(M.posteTva({tva:''},reno)===20&&M.posteTva({tva:10},reno)===10,'poste sans taux : celui du projet');

/* 4. arrondis : la somme des HT reste le prix HT */
const impair={postes:[{id:'a',libelle:'A',montant:333.33,tva:10},{id:'b',libelle:'B',montant:333.33,tva:20},{id:'c',libelle:'C',montant:333.34,tva:5.5}],margePct:7.3,tva:10};
const gi=M.prospectVentilationTva(impair);
chk(Math.abs(gi.reduce((t,g)=>t+g.ht,0)-M.prospectPrixHT(impair))<0.005,'arrondis : la somme des HT par taux égale le prix HT du projet');

/* 5. options incluses et moins-values */
const opt={postes:[{id:'a',libelle:'A',montant:10000,tva:10}],optionsChiffrage:[{id:'o',libelle:'POMPE À CHALEUR',montant:6000,tva:5.5,incluse:true},
  {id:'o2',libelle:'NON RETENUE',montant:9999,tva:20,incluse:false}],margePct:10,tva:10};
const go=M.prospectVentilationTva(opt);
chk(go.length===2&&!go.some(g=>g.taux===20),'une option incluse compte à son taux ; une option non retenue ne compte pas');

/* 6. contrat de maîtrise d'œuvre */
const c1=M.contratTravaux(mixte);
chk(c1.tvaMixte===true&&c1.ttc===17000&&c1.ht===15000,'contrat : TVA mixte signalée (« taux variable »), coût TTC par taux');
const c2=M.contratTravaux({...mixte,contratTravauxTTC:20000});
chk(c2.forfait&&c2.tvaMixte&&c2.ttc===20000&&Math.abs(c2.ht-20000*15000/17000)<0.01,'forfait TTC en TVA mixte : HT déduit au taux moyen du chiffrage');
const c3=M.contratTravaux(cas[0]);
chk(!c3.tvaMixte&&c3.tva===10&&c3.ttc===16500,'contrat sans taux par poste : inchangé');
fin();
