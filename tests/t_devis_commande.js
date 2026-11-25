/* MATÉRIAUX › commande › « Importer le devis » : le devis PDF d'un
   fournisseur se lit, ses produits rejoignent un bordereau du fournisseur
   (ajoutés, ou prix rafraîchi) et la commande prend ses quantités et son
   montant — après un aperçu, d'un clic. La baie « C » et sa répétition
   « C.1 » sont un même produit. Lecteur PDF et Drive simulés ; devis et
   données fictifs. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const {chk,fin}=verif();
/* le devis fictif, tel que le lecteur PDF le rend : une ligne par rangée */
const DEVIS=[
  'DEVIS  FICTIF-1',
  'Repère  Désignation               Dimensions tableaux (ou passage) : Largeur   Hauteur   Qté    Prix unitaire   Totat HT (+EcoTaxe) TVA',
  'A    Fenêtre 1 Vantail oscillo-battante              600   1050   1     300,00 €     303,50 €   20',
  'Profilé : PVC         VEKA            Vitrage : 4FE-16Ar-4',
  'Finition : Blanc 9016 Int/Ext',
  'C    Fenêtre 1 Vantail oscillo-battante              900   1350   1     700,00 €     703,90 €   20',
  'Profilé : PVC         VEKA            Vitrage : 4FE-16Ar-4',
  'Finition : Blanc 9016 Int/Ext',
  'C.1  Fenêtre 1 Vantail oscillo-battante              900   1350   2     700,00 €   1 407,80 €   20',
  'Profilé : PVC         VEKA            Vitrage : 4FE-16Ar-4',
  'Finition : Blanc 9016 Int/Ext',
  'H    BOX domotique                                    0      0     1     200,00 €     200,00 €   20',
  '20 %           2 615,20 €          523,04 €             3 138,24 €',
];
global.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:1,
  getPage:async()=>({getTextContent:async()=>({items:DEVIS.map((str,i)=>({str,transform:[1,0,0,10,40,800-i*20],width:str.length*5}))})})})})};
const M=charger(['Commandes','EMPTY','devisVersCommande','devisRegroupe','devisBordereauPropose','analyseDevisFournisseur','quantitatifNet']);
const LIB_A='Fenêtre 1 Vantail oscillo-battante 600x1050 — PVC VEKA, finition Blanc 9016 Int/Ext, vitrage 4FE-16Ar-4';
const BORD={id:'b1',nom:'Menuiseries — Fournisseur Fictif',fournisseurIds:['fo1'],artisanIds:[],aleasPct:'',
  articles:[{id:'x1',code:'',libelle:LIB_A,unite:'U',pu:290},{id:'x2',code:'M-1',libelle:'Seuil alu',unite:'ml',pu:40}]};
const CH={id:'c1',nom:'Maison Fictive',tva:20};
const CMD=()=>({id:'k1',chantierId:'c1',designation:'Devis FICTIF-1',fournisseur:'Fournisseur Fictif',montant:80,tva:20,statut:'a_commander',
  devis:[],factures:[],quantitatif:{bordereauId:'b1',nom:BORD.nom,lignes:[
    {id:'q1',ref:'x1',code:'',libelle:LIB_A,unite:'U',pu:290,qt:''},{id:'q2',ref:'x2',code:'M-1',libelle:'Seuil alu',unite:'ml',pu:40,qt:2}]}});
const base=()=>({...M.EMPTY,chantiers:[CH],fournisseurs:[{id:'fo1',nom:'FOURNISSEUR FICTIF'}],bordereaux:[BORD],commandes:[CMD()]});

(async()=>{
/* 1. le moteur */
{
  const X=M.analyseDevisFournisseur(DEVIS);
  const G=M.devisRegroupe(X);
  chk(X.length===4&&G.length===3&&G[1].qte===3&&G[1].pu===703.9,'C et C.1, même produit : 3 fenêtres à 703,90 € (prix facturé)');
  const data=base(), f=data.commandes[0];
  chk(M.devisBordereauPropose(data,f)==='b1','bordereau proposé : celui du quantitatif de la commande');
  chk(M.devisBordereauPropose(data,{...f,quantitatif:null})==='b1','sans quantitatif : celui du fournisseur (même nom)');
  chk(M.devisBordereauPropose(data,{...f,quantitatif:null,fournisseur:'Autre'})==='','fournisseur inconnu : un nouveau bordereau');
  const r=M.devisVersCommande(data,f,X,'b1');
  const b=r.data.bordereaux.find(x=>x.id==='b1');
  chk(r.ajout===2&&r.maj===1&&b.articles.length===4&&b.articles.find(a=>a.id==='x1').pu===303.5&&b.articles.find(a=>a.id==='x2').pu===40,
    'bordereau : 2 produits ajoutés, le prix de la fenêtre A rafraîchi, l’article sans rapport inchangé');
  const Lq=r.f.quantitatif.lignes, q=id=>Lq.find(l=>l.ref===id)||Lq.find(l=>l.libelle===id);
  chk(q('x1').qt===1&&q('x1').pu===303.5&&q('x2').qt===''&&q('BOX domotique').qt===1&&Lq.filter(l=>/900x1350/.test(l.libelle))[0].qt===3,
    'commande : quantités du devis, les autres articles à zéro');
  chk(r.f.montant===2615.2&&r.total===2615.2&&r.f.quantitatif.bordereauId==='b1','montant de la commande = total du devis (2 615,20 € HT)');
  chk(r.remplaces===1,'la quantité déjà saisie (seuil) est signalée comme remplacée');
  const r2=M.devisVersCommande(data,{...f,quantitatif:null,remisePct:10},X,'');
  const nb=r2.data.bordereaux[1];
  chk(r2.neuf&&nb.nom==='Produits Fournisseur Fictif'&&nb.fournisseurIds.join()==='fo1'&&nb.articles.length===3&&r2.f.montant===2353.68,
    'nouveau bordereau rattaché au fournisseur ; la remise de la commande s’applique');
}
/* 2. à l'écran : le devis déposé sur la commande */
{
  let data=base(), tr;
  const monter=()=>React.createElement(M.Commandes,{data,ch:CH,save,ouvrir:'k1',onOuvert(){}});
  function save(n){data=n;TR.act(()=>tr.update(monter()))}
  TR.act(()=>{tr=TR.create(monter())});
  const t=()=>norm(texteInst(tr.root));
  const champFichier=tr.root.findAll(n=>n.type==='input'&&n.props.type==='file'&&/Importer le devis/.test(norm(texteInst(n.parent))))[0];
  chk(!!champFichier&&/Un devis PDF se lit/.test(t()),'le champ du devis le dit : un devis PDF se lit');
  const file=new File([Buffer.from('%PDF fictif')],'devis-fictif.pdf',{type:'application/pdf'});
  await TR.act(async()=>{await champFichier.props.onChange({target:{files:[file],value:''}})});
  for(let i=0;i<60&&!/Devis lu/.test(t());i++)await TR.act(()=>new Promise(r=>setTimeout(r,10)));
  chk(/Devis lu — devis-fictif\.pdf : 4 lignes, 2 615,20 € HT/.test(t())&&/3 ×/.test(t()),'aperçu : les lignes, les quantités, le total');
  chk(/2 produits ajoutés, 1 prix mis à jour ; la commande passe à 2 615,20 € HT/.test(t())&&/Les quantités déjà saisies \(1 article\) sont remplacées/.test(t()),
    'avant le clic : ce qui change, dit');
  const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
  TR.act(()=>btn(/Reprendre le devis dans la commande/).props.onClick());
  chk(data.bordereaux[0].articles.length===4,'les produits sont enregistrés dans le bordereau du fournisseur');
  chk(/✓ Devis repris : 3 produits, la commande passe à 2 615,20 € HT/.test(t())&&/Pensez à Enregistrer/.test(t()),'après : dit, et la commande est à enregistrer');
  chk(/2 615/.test(tr.root.findAll(n=>n.type==='input'&&n.props.type==='number'&&n.props.disabled)[0].props.value+'')||
    tr.root.findAll(n=>n.type==='input'&&n.props.type==='number'&&n.props.disabled)[0].props.value===2615.2,'le montant HT de la commande suit');
  TR.act(()=>btn(/^Enregistrer$/).props.onClick());
  const k=data.commandes.find(c=>c.id==='k1');
  chk(k.montant===2615.2&&k.quantitatif.lignes.filter(l=>+l.qt>0).length===3&&(k.devis||[]).length===1,'enregistrée : montant, quantités, et le devis joint');
  TR.act(()=>tr.unmount());
}
fin();
})().catch(e=>{console.error(e);process.exitCode=1});
