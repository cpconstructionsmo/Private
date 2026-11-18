/* Chiffrage interne en Excel (index.html : chiffrageInterneLignes,
   genererChiffrageInterneXlsx) : postes et lignes du quantitatif en vrais
   nombres, TVA par poste, rétrocession, options, récapitulation. Montants
   et libellés fictifs. */
const {charger,verif}=require('./harness');
const M=charger(['chiffrageInterneLignes','genererChiffrageInterneXlsx','prospectPrixTTC','prospectPrixHT','prospectMargeHT','prospectCoutHT']);
const {chk,fin}=verif();

const p={nom:'Maison Fictif',margePct:10,tva:10,postes:[
  {id:'a',libelle:'Peinture',montant:1000,tva:10,retroPct:5,quantitatif:{lignes:[
    {id:'t',type:'titre',libelle:'cuisine'},
    {id:'l1',libelle:'Peinture murs (fictif)',unite:'M²',qt:40,pu:20,regle:{grandeur:'murs',pieces:['p1']}},
    {id:'l2',libelle:'Plinthes (fictif)',unite:'ML',qt:25,pu:8},
    {id:'n',type:'note',libelle:'précision'}]}},
  {id:'b',libelle:'Menuiseries',montant:5000,tva:5.5}],
  optionsChiffrage:[{id:'o',libelle:'Volets (fictif)',montant:800,incluse:true,tva:20},{id:'x',libelle:'Non retenue',montant:999}]};
const L=M.chiffrageInterneLignes(p);
const ligne=t=>L.find(r=>r[0]===t||r[1]===t);
chk(L[0].join('|')==='Poste / ligne|Détail|Unité|Quantité|PU HT|Montant HT|TVA %|Montant TTC|Rétrocession|D’après le plan','en-tête : poste, détail, unité, quantité, PU, HT, TVA, TTC, rétrocession, plan');
const pe=ligne('PEINTURE');
chk(pe[5]===1000&&pe[6]===10&&pe[7]===1100&&pe[8]===50,'poste : montant HT, TVA 10 %, TTC 1 100, rétrocession 5 % = 50 (nombres)');
const l1=ligne('Peinture murs (fictif)');
chk(l1[2]==='M²'&&l1[3]===40&&l1[4]===20&&l1[5]===800&&l1[9]==='murs (pièces choisies)','ligne du quantitatif : unité, quantité, PU, montant, quantité tirée du plan');
chk(ligne('CUISINE')&&!L.some(r=>r[1]==='précision'),'intertitre gardé, précision (note) laissée de côté');
chk(ligne('MENUISERIES')[6]===5.5&&ligne('MENUISERIES')[7]===5275,'TVA 5,5 % sur les menuiseries');
chk(ligne('Option : Volets (fictif)')[5]===800&&!L.some(r=>/Non retenue/.test(r[0])),'seules les options incluses');
chk(ligne('Coût des travaux HT')[5]===M.prospectCoutHT(p)&&ligne('Marge maîtrise d’œuvre HT')[5]===M.prospectMargeHT(p)&&ligne('Prix HT')[5]===M.prospectPrixHT(p),'récapitulation : coût, marge, prix HT');
const tvas=L.filter(r=>/^TVA /.test(r[0]));
chk(tvas.length===3&&ligne('Prix TTC')[7]===M.prospectPrixTTC(p),'TVA par taux (3 taux), puis le prix TTC du projet');
chk(ligne('Rétrocession totale')[8]===50,'rétrocession totale');
const o=M.genererChiffrageInterneXlsx(p);
chk(o&&o.length>500&&o[0]===0x50&&o[1]===0x4B,'classeur .xlsx produit (archive zip)');
const txt=Buffer.from(o).toString('latin1');
chk(/<c r="F3" s="2"><v>1000<\/v><\/c>/.test(txt)||/<v>1000<\/v>/.test(txt),'les montants sont des nombres dans la feuille');
chk(M.chiffrageInterneLignes({postes:[],coutHT:50000,margePct:10}).some(r=>r[0]==='Prix HT'&&r[5]===55000),'projet sans poste (coût saisi) : la récapitulation suffit');
fin();
