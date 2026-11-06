/* Une facture qui couvre deux lots d'une même entreprise (charpente et
   couverture) : rangée sur l'un pour son total, elle se répartit depuis son
   volet (« Répartir sur plusieurs lots »). Elle reste une seule facture —
   même numéro, même date, même fichier —, chaque lot n'en porte que sa part,
   et ses restes à facturer restent justes. La visa au client dit le total
   et les deux lots. La répartition se défait. Drive et messagerie simulés ;
   données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const {chk,fin}=verif();
const M=charger(['Marches','EMPTY','repartirFacture','defaireRepartition','partsRepartition','repartitionPourMail','corpsFactureVisee','facturesTotal','centimes']);
const lien=id=>'https://drive.google.com/file/d/'+id+'/view';
const CH={id:'c1',nom:'Maison Fictive',client:'M. Fictif',emailClient:'client@example.fr',tva:20};
const ART={id:'a1',nom:'EURL Charpente Fictive',email:'artisan@example.fr',lienRib:lien('RIB')};
const CHARP={id:'m1',chantierId:'c1',lot:'CHARPENTE',artisanId:'a1',montantHT:11139,tva:20,statut:'signe',
  factures:[{id:'f1',montant:24419,numero:'FA-77',date:'2026-11-03',lien:lien('F77'),montantTTC:29302.8}]};
const COUV={id:'m2',chantierId:'c1',lot:'COUVERTURE',artisanId:'a1',montantHT:13280,tva:20,statut:'signe',factures:[]};
const AUTRE={id:'m3',chantierId:'c1',lot:'RAVALEMENT',artisanId:'a2',montantHT:6609,tva:20,statut:'signe',factures:[]};
const base=()=>({...M.EMPTY,chantiers:[CH],artisans:[ART,{id:'a2',nom:'SAS Façade Fictive'}],marches:[CHARP,COUV,AUTRE],commandes:[]});
const src={type:'marche',id:'m1'};

/* 1. le moteur */
{
  const d=M.repartirFacture(base(),src,'f1',[{type:'marche',id:'m1',montant:11139},{type:'marche',id:'m2',montant:13280}]);
  const c1=d.marches.find(m=>m.id==='m1'), c2=d.marches.find(m=>m.id==='m2');
  const p1=c1.factures[0], p2=c2.factures[0];
  chk(p1.montant===11139&&p2.montant===13280&&c1.facture===11139&&c2.facture===13280,'chaque lot porte sa part (11 139 + 13 280)');
  chk(p2.numero==='FA-77'&&p2.date==='2026-11-03'&&p2.lien===lien('F77'),'même numéro, même date, même fichier');
  chk(p1.repartition.id===p2.repartition.id&&p1.repartition.totalHT===24419&&p1.repartition.totalTTC===29302.8&&!('montantTTC' in p1),
    'les parts se reconnaissent ; le total HT et le TTC lu sont gardés avec elles');
  chk(M.partsRepartition(d,p1.repartition.id).length===2,'les deux parts se retrouvent');
  const r=M.repartitionPourMail(d,p2,CH);
  chk(r&&r.ttc===29302.8&&r.lots.join('|')==='CHARPENTE|COUVERTURE','pour le mail : le TTC de toute la facture et ses deux lots');
  chk(/d’un montant de 29 302,80 € TTC pour les lots CHARPENTE et COUVERTURE\./.test(norm(M.corpsFactureVisee(p2,ART,c2,CH,'COUVERTURE',{rib:true,att:false},r))),
    'la visa dit le total et les deux lots');
  let err='';
  try{M.repartirFacture(base(),src,'f1',[{type:'marche',id:'m1',montant:11139},{type:'marche',id:'m2',montant:13000}])}catch(e){err=e.message}
  chk(/total de la facture/.test(err),'des parts qui ne font pas le total : refusé');
  err='';try{M.repartirFacture(d,src,'f1',[{type:'marche',id:'m1',montant:1},{type:'marche',id:'m3',montant:11138}])}catch(e){err=e.message}
  chk(/déjà répartie/.test(err),'une facture déjà répartie ne se répartit pas deux fois');
  const u=M.defaireRepartition(d,{type:'marche',id:'m2'},p2.id);
  const u1=u.marches.find(m=>m.id==='m1'), u2=u.marches.find(m=>m.id==='m2');
  chk(!u1.factures.length&&u2.factures.length===1&&u2.factures[0].montant===24419&&u2.factures[0].montantTTC===29302.8&&!u2.factures[0].repartition
    &&u2.facture===24419&&u1.facture===0,'défaire depuis la couverture : la facture y revient entière, l’autre part disparaît');
}

/* 2. à l'écran */
let data=base(), tr;
const props=()=>({data,ch:CH,save:d=>{data=d;TR.act(()=>{tr.update(React.createElement(M.Marches,props()))})},eng:0,fac:0,onFacturerCmd(){},onFacturerHono(){}});
TR.act(()=>{tr=TR.create(React.createElement(M.Marches,props()))});
const t=()=>norm(texteInst(tr.root));
const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n)))||re.test(n.props['aria-label']||''));
const ev={stopPropagation(){},preventDefault(){}};
const justif=i=>tr.root.findAll(n=>n.type==='button'&&n.props['aria-label']==='Voir le justificatif')[i];

TR.act(()=>{justif(0).props.onClick(ev)});
TR.act(()=>{btn(/^Répartir sur plusieurs lots$/).props.onClick()});
chk(/Répartir cette facture \(24 419 € HT\) sur plusieurs lots/.test(t()),'le formulaire s’ouvre, avec le total de la facture');
const options=tr.root.findAll(n=>n.type==='select'&&n.props['aria-label']==='Autre lot')[0].findAll(n=>n.type==='option').map(o=>norm(texteInst(o)));
chk(options[1]==='COUVERTURE — EURL Charpente Fictive'&&!options.some(o=>/^CHARPENTE/.test(o)),'les lots proposés : ceux de la même entreprise d’abord, sans le lot de départ');
TR.act(()=>{tr.root.findAll(n=>n.type==='select'&&n.props['aria-label']==='Autre lot')[0].props.onChange({target:{value:'marche:m2'}})});
TR.act(()=>{tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Part de l’autre lot')[0].props.onChange({target:{value:'13280'}})});
const ici=tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Part de ce lot')[0];
chk(ici.props.value==='11139.00'&&/Le total de la facture est réparti\./.test(t()),'la part de ce lot se déduit : 11 139 €, tout est réparti');
TR.act(()=>{tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Part de l’autre lot')[0].props.onChange({target:{value:'13000'}})});
chk(tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Part de ce lot')[0].props.value==='11419.00','l’autre part change : celle de ce lot suit (11 419 €)');
TR.act(()=>{tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Part de ce lot')[0].props.onChange({target:{value:'11139'}})});
chk(/Reste à répartir : 280,00 €/.test(t())&&btn(/^Répartir$/).props.disabled,'un écart se voit, et bloque');
TR.act(()=>{tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Part de l’autre lot')[0].props.onChange({target:{value:'13280'}})});
TR.act(()=>{btn(/^Répartir$/).props.onClick()});
const m1=data.marches.find(m=>m.id==='m1'), m2=data.marches.find(m=>m.id==='m2');
chk(m1.factures[0].montant===11139&&m2.factures.length===1&&m2.factures[0].montant===13280,'enregistré : 11 139 sur la charpente, 13 280 sur la couverture');
chk(/Facture répartie sur 2 lots — total 24 419 € HT/.test(t())&&/COUVERTURE — EURL Charpente Fictive : 13 280 € HT/.test(t()),'le volet le dit, part par part');
chk((t().match(/part · FA-77/g)||[]).length===2,'les deux lignes de facture portent la mention « part »');
chk(/11 139 € facturé/.test(t())&&/13 280 € facturé/.test(t()),'chaque lot : facturé à hauteur de sa part (soldé)');

/* la visa depuis la couverture : le total de la facture et les deux lots */
TR.act(()=>{justif(0).props.onClick(ev)});
TR.act(()=>{justif(1).props.onClick(ev)});
TR.act(()=>{btn(/Viser et envoyer au client/).props.onClick()});
const corps=tr.root.findAll(n=>n.type==='textarea')[0].props.value;
chk(/d’un montant de 29 302,80 € TTC pour les lots CHARPENTE et COUVERTURE\./.test(norm(corps)),'visa : le total TTC lu sur la facture, les deux lots');
TR.act(()=>{btn(/^Annuler$/).props.onClick()});

/* défaire, depuis la charpente */
TR.act(()=>{justif(1).props.onClick(ev)});
TR.act(()=>{justif(0).props.onClick(ev)});
TR.act(()=>{btn(/^Défaire la répartition$/).props.onClick()});
chk(data.marches.find(m=>m.id==='m1').factures[0].montant===24419&&!data.marches.find(m=>m.id==='m2').factures.length,
  'défait : la facture revient entière sur la charpente');
TR.act(()=>tr.unmount());

/* 3. un lot seul sur son chantier : rien à répartir */
data={...base(),marches:[CHARP]};
TR.act(()=>{tr=TR.create(React.createElement(M.Marches,props()))});
TR.act(()=>{justif(0).props.onClick(ev)});
chk(!btn(/^Répartir sur plusieurs lots$/),'un seul lot : pas de répartition proposée');
TR.act(()=>tr.unmount());
fin();
