/* La rétrocession d'un lot de chantier, ajoutée au prix de l'artisan : un
   taux de 20 % relève les prix unitaires du quantitatif (prix / 0,80), si
   bien que l'entreprise, qui reverse la rétrocession, garde son prix. Le
   marché remis au client ne montre que les prix relevés, sans aucune ligne
   de rétrocession. Changer de taux repart du prix de l'artisan ; un champ
   seulement traversé ne change rien ; un marché signé n'est jamais touché.
   Chantier et entreprise fictifs. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['Marches','releverMarche','marcheSigne','retroMontant','genererMarcheDocx','lireDocumentLignes','EMPTY']);
const {chk,fin}=verif();

const lignes=(a,b)=>({bordereauId:'b1',nom:'031 MAÇONNERIE - B.A.',lignes:[
  {id:'l1',type:'article',code:'B_1',libelle:'Béton pour semelles',unite:'M³',pu:a,qt:3},
  {id:'l2',type:'article',code:'B_2',libelle:'Agglos de 20',unite:'M²',pu:b,qt:1},
  {id:'l3',type:'titre',libelle:'Fondations'}]});

/* ---------- 1. le calcul ---------- */
{
  const m={id:'m1',lot:'GROS ŒUVRE',montantHT:840,quantitatif:lignes(180,300),statut:'devis'};
  const p20=M.releverMarche(m,20);
  chk(p20.quantitatif.lignes[0].pu===225&&p20.quantitatif.lignes[1].pu===375&&p20.montantHT===1050&&p20.retroPctApplique===20,
    '20 % : 180 → 225, 300 → 375 ; le lot passe de 840 à 1 050 € HT');
  chk(p20.quantitatif.lignes[2].libelle==='Fondations','un intertitre n’est pas touché');
  chk(M.retroMontant({montantHT:1050,retroPct:20})===210&&1050-210===840,'l’entreprise reverse 210 € et garde ses 840 €');
  const m20={...m,...p20,retroPct:20};
  const p10=M.releverMarche(m20,10);
  chk(p10.quantitatif.lignes[0].pu===200&&p10.montantHT===933.33,'passer à 10 % repart du prix de l’artisan (180 → 200), sans cumuler');
  const p0=M.releverMarche({...m20,...p10},0);
  chk(p0.quantitatif.lignes[0].pu===180&&p0.quantitatif.lignes[1].pu===300&&p0.montantHT===840,'revenir à 0 % rend exactement les prix de l’artisan');
  chk(Object.keys(M.releverMarche(m20,20)).length===0,'même taux : rien ne change');
  /* un lot sans quantitatif : son prix de base, gardé à part */
  const s=M.releverMarche({id:'m2',lot:'Charpente',montantHT:750,statut:'devis'},20);
  chk(s.prixBase===750&&s.montantHT===937.5&&s.retroPctApplique===20,'sans quantitatif : 750 € de base, 937,50 € au marché');
  chk(M.releverMarche({montantHT:937.5,prixBase:750,retroPctApplique:20},10).montantHT===833.33,'puis 10 % : 833,33, toujours depuis 750');
  chk(M.marcheSigne({statut:'signe'})&&M.marcheSigne({statut:'encours'})&&!M.marcheSigne({statut:'devis'}),'un marché signé (ou en cours) est reconnu');
}

/* ---------- 2. le formulaire du lot ---------- */
const CH={id:'c1',nom:'Maison Fictive',client:'M. Fictif',tva:20};
const ART={id:'a1',nom:'SASU Fictive',corps:'Gros œuvre'};
function ouvrir(marche,plus){
  let data={...M.EMPTY,chantiers:[CH],artisans:[ART],marches:[marche],commandes:[],...(plus||{})}, tr;
  const props=()=>({data,ch:CH,save:d=>{data=d;TR.act(()=>{tr.update(React.createElement(M.Marches,props()))})},eng:0,fac:0,onFacturerCmd(){},onFacturerHono(){}});
  TR.act(()=>{tr=TR.create(React.createElement(M.Marches,props()))});
  const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
  TR.act(()=>{btn(/Modifier le lot/).props.onClick()});
  const champ=()=>tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Taux de rétrocession du lot')[0];
  const taper=v=>{TR.act(()=>{champ().props.onFocus()});TR.act(()=>{champ().props.onChange({target:{value:v}})});TR.act(()=>{champ().props.onBlur()})};
  return {tr,btn,champ,taper,data:()=>data,t:()=>norm(texteInst(tr.root))};
}
{
  const o=ouvrir({id:'m1',chantierId:'c1',lot:'GROS ŒUVRE',artisanId:'a1',montantHT:840,tva:20,statut:'devis',factures:[],quantitatif:lignes(180,300)});
  chk(!!o.champ()&&/RÉTROCESSION — INTERNE, LE CLIENT NE LA VOIT PAS/.test(o.t()),'le lot a son champ de rétrocession, dit interne');
  o.taper('20');
  TR.act(()=>{o.btn(/^Saisir les quantités$/).props.onClick()});
  chk(/225,00 € \/ M³ avec rétro/.test(o.t())&&/180,00 € \/ M³ artisan/.test(o.t()),'les prix unitaires sont relevés ; le prix de l’artisan se lit à côté, dans l’application');
  chk(/Prix unitaires relevés de 20 % : l’entreprise garde son prix \(840,00 € HT\) et reverse 210,00 € HT de rétrocession/.test(o.t()),'l’écran dit ce que garde l’entreprise et ce qu’elle reverse');
  TR.act(()=>{o.btn(/^Enregistrer$/).props.onClick()});
  const m=o.data().marches[0];
  chk(m.montantHT===1050&&m.retroPct===20&&m.retroPctApplique===20&&m.quantitatif.lignes[0].pu===225,'enregistré : 1 050 € HT, taux 20 %, prix relevés');
  TR.act(()=>{o.tr.unmount()});
}
{
  /* un taux d'apport d'affaires déjà posé ailleurs : traverser le champ ne relève rien */
  const o=ouvrir({id:'m1',chantierId:'c1',lot:'GROS ŒUVRE',artisanId:'a1',montantHT:840,tva:20,retroPct:5,statut:'devis',factures:[],quantitatif:lignes(180,300)});
  TR.act(()=>{o.champ().props.onFocus()});TR.act(()=>{o.champ().props.onBlur()});
  TR.act(()=>{o.btn(/^Saisir les quantités$/).props.onClick()});
  chk(/180,00 € \/ M³/.test(o.t())&&!/avec rétro/.test(o.t()),'un champ seulement traversé ne change aucun prix');
  chk(/Ajouter au prix de l’artisan/.test(o.t())&&/le taux se prend sur le prix du marché/.test(o.t()),'l’écran propose de l’ajouter au prix de l’artisan, sans l’imposer');
  TR.act(()=>{o.tr.unmount()});
}
{
  /* un marché signé : ses prix ne changent plus */
  const o=ouvrir({id:'m1',chantierId:'c1',lot:'GROS ŒUVRE',artisanId:'a1',montantHT:840,tva:20,statut:'signe',dateSignature:'2026-09-01',factures:[],quantitatif:lignes(180,300)});
  o.taper('20');
  TR.act(()=>{o.btn(/^Saisir les quantités$/).props.onClick()});
  chk(!/avec rétro/.test(o.t())&&/Marché signé : ses prix ne changent plus/.test(o.t()),'marché signé : les prix ne bougent pas, l’écran le dit');
  TR.act(()=>{o.tr.unmount()});
}
{
  /* un lot sans quantitatif, comme le maçon à 750 € : 20 % → 937,50 € au marché */
  const o=ouvrir({id:'m1',chantierId:'c1',lot:'GROS ŒUVRE',artisanId:'a1',montantHT:750,tva:20,statut:'devis',factures:[]});
  o.taper('20');
  const montant=()=>o.tr.root.findAll(n=>n.type==='input'&&n.props.type==='number'&&!n.props['aria-label']&&n.props.disabled===false)[0];
  chk(+montant().props.value===937.5&&/l’entreprise garde son prix \(750,00 € HT\) et reverse 187,50 € HT/.test(o.t()),'750 € de l’artisan + 20 % : 937,50 € au marché, 187,50 € reversés');
  /* le montant retouché à la main : le prix de base de l'artisan s'en déduit */
  TR.act(()=>{montant().props.onChange({target:{value:'1000'}})});
  TR.act(()=>{o.btn(/^Enregistrer$/).props.onClick()});
  const m=o.data().marches[0];
  chk(m.montantHT===1000&&m.prixBase===800&&m.retroPctApplique===20,'montant retouché à 1 000 € : prix de base de l’artisan 800 €, rien d’écrasé');
  TR.act(()=>{o.tr.unmount()});
}
{
  /* un bordereau posé sur un lot déjà relevé : ses prix (ceux de l'artisan) sont relevés en arrivant */
  const BORD={id:'b1',nom:'031 MAÇONNERIE - B.A.',articles:[{id:'x1',code:'B_1',libelle:'Béton pour semelles',unite:'M³',pu:180}]};
  const o=ouvrir({id:'m1',chantierId:'c1',lot:'GROS ŒUVRE',artisanId:'a1',montantHT:937.5,prixBase:750,retroPct:20,retroPctApplique:20,tva:20,statut:'devis',factures:[]},{bordereaux:[BORD]});
  const sel=o.tr.root.findAll(n=>n.type==='select'&&n.findAll(c=>c.type==='option'&&c.props.value==='b1').length)[0];
  TR.act(()=>{sel.props.onChange({target:{value:'b1'}})});
  TR.act(()=>{o.btn(/^Chiffrer$/).props.onClick()});
  chk(/225,00 € \/ M³ avec rétro/.test(o.t())&&/180,00 € \/ M³ artisan/.test(o.t()),'les articles du bordereau arrivent relevés du taux déjà appliqué');
  TR.act(()=>{o.btn(/^Enregistrer$/).props.onClick()});
  chk(o.data().marches[0].quantitatif.lignes[0].pu===225,'enregistré relevé : 225 €');
  TR.act(()=>{o.tr.unmount()});
}

/* ---------- 3. le marché remis au client : les prix relevés, aucune rétrocession ---------- */
(async()=>{
  const L=M.releverMarche({montantHT:840,quantitatif:lignes(180,300)},20).quantitatif.lignes;
  const out=await M.genererMarcheDocx({lot:'GROS ŒUVRE',lotDetail:'031 MAÇONNERIE - B.A.',numero:'1',date:'09/10/2026',entreprise:'SASU Fictive',adresse:'',siret:'',
    decennale:'',compagnie:'',decennaleFin:'',client:'M. Fictif',clientAdresse:'',clientTel:'',chantierAdresse:'1 rue Fictive',chantierNom:'Maison Fictive',mapsUrl:'',planExeUrl:'',
    ht:1050,brut:1050,remise:0,tva:20,tvaMontant:210,ttc:1260,lignes:L});
  const ab=out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);
  const txt=norm((await M.lireDocumentLignes({name:'m.docx',type:'',arrayBuffer:async()=>ab})).txt);
  chk(/225,00/.test(txt)&&/375,00/.test(txt)&&/1 050,00/.test(txt),'le marché porte les prix relevés et le total de 1 050 €');
  chk(!/r[ée]tro/i.test(txt)&&!/180,00/.test(txt),'aucune rétrocession ni prix de l’artisan sur le marché');
  fin();
})().catch(e=>{console.error('ERREUR NON CAPTURÉE',e);process.exitCode=1});
