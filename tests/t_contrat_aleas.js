/* Contrat de maîtrise d'œuvre : la provision pour aléas et imprévus comprise
   dans le budget travaux (« 49 910 € TTC avec 5 % d'imprévus ») se saisit en
   pourcentage sur la carte du contrat ; l'article 6 la détaille sans changer
   le budget, en TTC seul quand le HT d'une rénovation n'est pas saisi. Sans
   saisie, le contrat ne change pas. Données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const {chk,fin}=verif();
const M=charger(['genererContratMoeDocx','contratAleas','contratTravaux','contratPourChantier','ContratMoeChantier','zipEntree','EMPTY']);
const xmlDe=async o=>norm(new TextDecoder().decode(await M.zipEntree(o.buffer.slice(o.byteOffset,o.byteOffset+o.byteLength),'word/document.xml')).replace(/<[^>]+>/g,''));
const P={id:'p1',nom:'Rénovation Fictive',client:'Mme Fictive',commune:'1 rue Fictive 61000 Commune',
  coutHT:40000,margeMontant:7000,tva:10,categorie:'renovation',contratTravauxTTC:49910,surfaceHabitable:40};

(async()=>{
  const a=M.contratAleas({...P,contratAleasPct:5},M.contratTravaux(P));
  chk(a&&a.pct===5&&a.ttc===2376.67,'5 % d’aléas compris dans 49 910 € TTC : 2 376,67 € TTC (49 910 × 5 / 105)');
  chk(!M.contratAleas(P,M.contratTravaux(P))&&!M.contratAleas({...P,contratAleasPct:'abc'},M.contratTravaux(P))
    &&!M.contratAleas({...P,contratAleasPct:150},M.contratTravaux(P)),'sans pourcentage valable : rien');
  let x=await xmlDe(await M.genererContratMoeDocx({...P,contratAleasPct:5},'renovation'));
  chk(/49 910,00 € TTC, TVA à taux variable selon la nature des prestations\./.test(x),'le budget travaux ne change pas');
  chk(/Ce budget comprend une provision pour aléas et imprévus de 5 %, soit 2 376,67 € TTC, destinée aux travaux imprévus révélés en cours de chantier\. Elle n’est engagée qu’avec l’accord du Maître de l’Ouvrage\./.test(x),
    'rénovation sans HT saisi : l’article 6 détaille les aléas en TTC seul');
  x=await xmlDe(await M.genererContratMoeDocx({...P,contratAleasPct:'5',contratTravauxHT:45372.73},'renovation'));
  chk(/provision pour aléas et imprévus de 5 %, soit 2 160,61 € HT, soit 2 376,67 € TTC/.test(x),'HT saisi : les aléas en HT et en TTC');
  x=await xmlDe(await M.genererContratMoeDocx({...P,categorie:'neuf',contratTravauxTTC:'',tva:20,contratAleasPct:3},'maison'));
  chk(/provision pour aléas et imprévus de 3 %, soit 1 165,05 € HT, soit 1 398,06 € TTC/.test(x),'construction neuve, budget calculé : HT et TTC');
  x=await xmlDe(await M.genererContratMoeDocx(P,'renovation'));
  chk(!/aléas et imprévus/.test(x),'sans saisie : aucune phrase ajoutée');

  /* la carte du contrat, sur un chantier sans prospect */
  let data={...M.EMPTY,chantiers:[{id:'c1',nom:'Maison Fictive',client:'Mme Fictive',adresse:'Commune',typeTravaux:'renovation',
    budget:40000,honorairesMontant:7000,tva:10,contratMoe:{contratTravauxTTC:49910}}]}, tr;
  const monter=()=>React.createElement(M.ContratMoeChantier,{data,ch:data.chantiers[0],save});
  function save(n){data=n;TR.act(()=>tr.update(monter()))}
  TR.act(()=>{tr=TR.create(monter())});
  const champ=()=>tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Aléas et imprévus compris dans le budget travaux')[0];
  chk(!!champ()&&/facultatif : la part du budget travaux réservée aux imprévus/.test(norm(texteInst(tr.root))),'la carte propose les aléas');
  TR.act(()=>champ().props.onChange({target:{value:'5'}}));
  TR.act(()=>champ().props.onBlur());
  chk(data.chantiers[0].contratMoe.contratAleasPct===5&&data.chantiers[0].contratMoe.contratTravauxTTC===49910,'5 % se garde sur le chantier ; le budget reste 49 910 €');
  chk(/soit 2 376,67 € TTC compris dans les 49 910,00 € TTC — l’article 6 le précise/.test(norm(texteInst(tr.root))),'la carte dit le montant');
  TR.act(()=>champ().props.onChange({target:{value:''}}));
  TR.act(()=>champ().props.onBlur());
  chk(data.chantiers[0].contratMoe.contratAleasPct==='','vidé : plus d’aléas détaillés');
  TR.act(()=>tr.unmount());
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
