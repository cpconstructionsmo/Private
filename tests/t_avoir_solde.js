/* L'avoir d'une entreprise (remise commerciale, prestation non réalisée) :
   saisi comme une facture négative, il baisse le facturé mais pas le marché —
   le lot restait « à facturer » de son montant et ne se soldait jamais. Depuis
   le volet de l'avoir, « Déduire l'avoir du marché » baisse le marché (aperçu
   avant), le lot se solde, le total engagé suit ; la déduction se garde, ne
   se fait qu'une fois, se reprend si l'avoir est corrigé et s'annule. Le
   contrat initial et le PV de réception gardent le marché signé. Données
   fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const {chk,fin}=verif();
const M=charger(['Marches','EMPTY','deduireAvoirMarche','annulerDeductionAvoir','reprendreDeductionAvoir','avoirsNonDeduits',
  'marcheSolde','marcheAvoirsHT','deductionAvoirApercu','contratDepuisEngagements','coutOperation','pvDonnees','facturesTotal']);
const CH={id:'c1',nom:'Maison Fictive',client:'M. Fictif',tva:10,budgetClientTTC:20000};
const ART={id:'a1',nom:'SARL Plâtre Fictive'};
const LOT=()=>({id:'m1',chantierId:'c1',lot:'PLÂTRERIE',artisanId:'a1',montantHT:15133,tva:10,statut:'signe',dateSignature:'2026-06-01',
  factures:[{id:'f1',montant:10380,numero:'F-1',date:'2026-09-01'},{id:'f2',montant:4753,numero:'F-2',date:'2026-10-01'},
    {id:'f3',montant:-300,numero:'AV-7',date:'2026-11-02'}]});
const base=()=>({...M.EMPTY,chantiers:[CH],artisans:[ART],marches:[LOT()],commandes:[]});

/* 1. le moteur */
{
  const d0=base(), m0=d0.marches[0];
  chk(!M.marcheSolde(m0)&&M.avoirsNonDeduits(m0).map(f=>f.id).join()==='f3','avant : 300 € « à facturer », l’avoir n’est pas déduit');
  const ap=M.deductionAvoirApercu(m0,m0.factures[2]);
  chk(ap.avant===15133&&ap.apres===14833&&ap.ht===300&&ap.solde,'l’aperçu : 15 133 → 14 833 € HT, le lot sera soldé');
  const d=M.deduireAvoirMarche(d0,'m1','f3'), m=d.marches[0];
  chk(m.montantHT===14833&&M.marcheSolde(m),'déduit : le marché passe à 14 833 € HT et le lot est soldé');
  chk(m.avoirsDeduits.length===1&&m.avoirsDeduits[0].numero==='AV-7'&&m.avoirsDeduits[0].ht===300&&/^\d{4}-\d{2}-\d{2}$/.test(m.avoirsDeduits[0].le),
    'la trace dit quel avoir, combien et quand');
  chk(!M.avoirsNonDeduits(m).length&&M.marcheAvoirsHT(m)===300,'plus d’avoir à déduire ; 300 € retirés du marché');
  chk(M.deduireAvoirMarche(d,'m1','f3')===d,'le même avoir ne se déduit pas deux fois');
  chk(M.deduireAvoirMarche(d0,'m1','f1')===d0,'une facture positive ne se déduit pas');
  /* le total engagé suit ce qui sera payé ; le contrat initial ne bouge pas */
  const co0=M.coutOperation(CH,d0.marches,[]), co=M.coutOperation(CH,d.marches,[]);
  chk(Math.round((co0.travTTC-co.travTTC)*100)===33000,'le total engagé baisse de l’avoir TTC (330 €)');
  const E0=M.contratDepuisEngagements(CH,d0.marches,[]), E=M.contratDepuisEngagements(CH,d.marches,[]);
  chk(E.tot.ttc===E0.tot.ttc&&E.avoirsRajoutes&&!E.avenantsRetires,'la ventilation du contrat initial reste celle du marché signé');
  /* le PV de réception garde le marché signé */
  chk(/16 646,30 € TTC/.test(norm(M.pvDonnees(m,CH,d).marche)),'le PV donne le marché signé (15 133 € HT, 16 646,30 € TTC)');
  /* corrigé après déduction, puis annulé */
  const corr={...d,marches:d.marches.map(x=>({...x,factures:x.factures.map(f=>f.id==='f3'?{...f,montant:-250}:f)}))};
  const r=M.reprendreDeductionAvoir(corr,'m1','f3').marches[0];
  chk(r.montantHT===14883&&r.avoirsDeduits.length===1&&r.avoirsDeduits[0].ht===250,'avoir corrigé à 250 € : la déduction se reprend au nouveau montant');
  const u=M.annulerDeductionAvoir(d,'m1','f3').marches[0];
  chk(u.montantHT===15133&&!u.avoirsDeduits.length,'annulée : le marché revient à 15 133 € HT');
  /* l'avoir supprimé des factures : l'annulation se fait sur la trace */
  const sup={...d,marches:d.marches.map(x=>({...x,factures:x.factures.filter(f=>f.id!=='f3')}))};
  chk(M.annulerDeductionAvoir(sup,'m1','f3').marches[0].montantHT===15133,'avoir supprimé : la trace suffit à rendre les 300 €');
  /* au centime */
  const cts={...d0,marches:[{...LOT(),montantHT:1000.1,factures:[{id:'a',montant:1000},{id:'b',montant:-0.3}]}]};
  chk(M.deduireAvoirMarche(cts,'m1','b').marches[0].montantHT===999.8,'calcul au centime (1 000,10 − 0,30)');
}

/* 2. à l'écran, depuis la liste des lots */
let data=base(), tr;
const props=()=>({data,ch:CH,save:d=>{data=d;TR.act(()=>{tr.update(React.createElement(M.Marches,props()))})},eng:0,fac:0,onFacturerCmd(){},onFacturerHono(){}});
TR.act(()=>{tr=TR.create(React.createElement(M.Marches,props()))});
const t=()=>norm(texteInst(tr.root));
const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
chk(/reste à facturer 300 €/.test(t())&&/avoir de 300 € non déduit du marché — le déduire ›/.test(t()),'sous le reste à facturer : l’avoir non déduit, et le chemin');
TR.act(()=>{btn(/le déduire ›/).props.onClick()});
chk(/AVOIR DE L’ENTREPRISE/.test(t())&&/Marché : 15 133 € → 14 833 € HT · le lot sera soldé/.test(t()),'le volet de l’avoir s’ouvre : l’aperçu avant le clic');
chk(/avenant client en moins-value/.test(t()),'il rappelle qu’une prestation retirée par le client passe par un avenant');
TR.act(()=>{btn(/^Déduire l’avoir du marché/).props.onClick()});
const m=data.marches[0];
chk(m.montantHT===14833&&M.marcheSolde(m),'un clic : marché 14 833 € HT, lot soldé');
chk(/14 833 € HT/.test(t())&&/avoir AV-7 déduit : -300 €|avoir AV-7 déduit : −300 €/.test(t())&&!/reste à facturer/.test(t()),
  'la colonne du marché dit l’avoir déduit ; plus de reste à facturer');
chk(/✓ Avoir déduit du marché le .* : -300 € HT|✓ Avoir déduit du marché le .* : −300 € HT/.test(t())&&/marché 15 133 € → 14 833 € HT/.test(t()),'le volet le dit, avec le marché avant et après');
chk(!!tr.root.findAll(n=>n.props&&n.props.className==='lot-solde').length,'la ligne du lot passe grisée (soldé)');
TR.act(()=>{btn(/^Annuler la déduction$/).props.onClick()});
chk(data.marches[0].montantHT===15133&&!data.marches[0].avoirsDeduits.length&&/reste à facturer 300 €/.test(t()),'annulée : retour à 15 133 € et au reste de 300 €');
fin();
