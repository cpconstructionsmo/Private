/* Un chiffrage de lot perdu se retrouve dans les versions sauvegardées :
   les états passés du lot (sans doublon, ni celui d'aujourd'hui), lus sur
   l'appareil et dans les copies du Drive ; « Reprendre ce chiffrage » ne
   ramène que le chiffrage (et le marché rédigé, si le lot n'en porte plus)
   dans le formulaire ouvert, à enregistrer. « Retirer » le quantitatif
   demande confirmation dès qu'une quantité est saisie. Drive simulé ;
   données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const {chk,fin}=verif();
const lien=id=>'https://drive.google.com/file/d/'+id+'/view';
const L=(qts)=>qts.map((q,i)=>({id:'l'+i,ref:'a'+i,code:'C'+i,libelle:'Article '+i,unite:'M²',pu:100,qt:q}));
const ANCIEN={id:'m1',chantierId:'c1',lot:'CARRELAGE',artisanId:'a1',montantHT:1500,tva:20,statut:'consulter',
  quantitatif:{bordereauId:'b1',nom:'Bordereau fictif',lignes:L([5,5,5])},contratLien:lien('W1'),exemplaires:[{nom:'client',lien:lien('W0')}],numeroMarche:'7'};
const ACTUEL={id:'m1',chantierId:'c1',lot:'CARRELAGE',artisanId:'a1',montantHT:500,tva:20,statut:'consulter',
  quantitatif:{bordereauId:'b1',nom:'Bordereau fictif',lignes:L([5,'',''])},factures:[{id:'f1',montant:100}]};
const sauvegarde=m=>Buffer.from(JSON.stringify({chantiers:[{id:'c1'}],marches:[m]}));
let confirme=true, demandes=[];
const M=charger(['Marches','EMPTY','lotVersions','reprendreChiffrageLot','lotResume'],{
  confirm:m=>{demandes.push(m);return confirme},
  drive:{S1:sauvegarde(ANCIEN),S2:sauvegarde(ANCIEN),S3:sauvegarde(ACTUEL)},
  fetch:async(url,init,base)=>{
    if(/drive\/v3\/files\?orderBy=name/.test(url)&&/CP-sauvegarde-/.test(decodeURIComponent(url)))
      return {ok:true,status:200,json:async()=>({files:[
        {id:'S3',name:'CP-sauvegarde-2026-11-24.json',createdTime:'2026-11-24T08:00:00Z'},
        {id:'S2',name:'CP-sauvegarde-2026-11-21.json',createdTime:'2026-11-21T08:00:00Z'},
        {id:'S1',name:'CP-sauvegarde-2026-11-20.json',createdTime:'2026-11-20T08:00:00Z'}]})};
    return base(url,init);
  }});

(async()=>{
/* 1. le moteur */
{
  const sources=[{le:'2026-11-20T08:00:00Z',origine:'Drive',data:{marches:[ANCIEN]}},
    {le:'2026-11-21T08:00:00Z',origine:'Drive',data:{marches:[ANCIEN]}},
    {le:'2026-11-24T08:00:00Z',origine:'Drive',data:{marches:[ACTUEL]}},
    {le:'2026-11-22T08:00:00Z',origine:'cet appareil',data:{marches:[{id:'autre'}]}}];
  const V=M.lotVersions(sources,'m1',ACTUEL);
  chk(V.length===1&&V[0].le==='2026-11-21T08:00:00Z'&&V[0].resume.montant===1500&&V[0].resume.servis===3&&V[0].resume.contrat,
    'un seul état passé : le plus récent des deux identiques ; celui d’aujourd’hui écarté');
  const r=M.reprendreChiffrageLot({...ACTUEL,statut:'signe'},ANCIEN);
  chk(r.montantHT===1500&&r.quantitatif.lignes.filter(l=>+l.qt>0).length===3&&r.statut==='signe'&&r.factures.length===1,
    'repris : le chiffrage ; le reste du lot (statut, factures) ne change pas');
  chk(r.contratLien===lien('W1')&&r.exemplaires.length===1&&r.numeroMarche==='7','le marché rédigé revient, le lot n’en portant plus');
  const r2=M.reprendreChiffrageLot({...ACTUEL,contratLien:lien('W9')},ANCIEN);
  chk(r2.contratLien===lien('W9'),'un marché rédigé depuis reste celui du lot');
  r.quantitatif.lignes[0].qt=99;
  chk(ANCIEN.quantitatif.lignes[0].qt===5,'la version sauvegardée n’est pas modifiée par la reprise');
}
/* 2. à l'écran, dans la fiche du lot */
{
  let data={...M.EMPTY,chantiers:[{id:'c1',nom:'Maison Fictive',tva:20}],artisans:[{id:'a1',nom:'SARL Fictive'}],marches:[ACTUEL],
    bordereaux:[{id:'b1',nom:'Bordereau fictif',articles:[0,1,2].map(i=>({id:'a'+i,code:'C'+i,libelle:'Article '+i,unite:'M²',pu:100}))}]}, tr;
  const props=()=>({data,ch:data.chantiers[0],save:d=>{data=d;TR.act(()=>{tr.update(React.createElement(M.Marches,props()))})},eng:0,fac:0,onFacturerCmd(){},onFacturerHono(){}});
  TR.act(()=>{tr=TR.create(React.createElement(M.Marches,props()))});
  const t=()=>norm(texteInst(tr.root));
  const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
  TR.act(()=>btn(/Modifier le lot/).props.onClick());
  chk(/CHIFFRAGE PERDU \?/.test(t()),'la fiche du lot propose de retrouver un chiffrage précédent');
  await TR.act(async()=>{await btn(/Retrouver un chiffrage précédent de ce lot/).props.onClick()});
  for(let i=0;i<30&&!/Aucun autre état|Reprendre ce chiffrage/.test(t());i++)await TR.act(()=>new Promise(r=>setTimeout(r,10)));
  chk(/Ce navigateur ne garde pas de versions/.test(t())||/Aucun autre état de ce lot dans les versions de cet appareil/.test(t()),'sans version sur l’appareil : dit');
  await TR.act(async()=>{await btn(/Chercher aussi dans les sauvegardes du Drive/).props.onClick()});
  for(let i=0;i<60&&!/Reprendre ce chiffrage/.test(t());i++)await TR.act(()=>new Promise(r=>setTimeout(r,10)));
  chk(/1 500,00 € HT, 3 articles servis, marché rédigé/.test(t())&&(t().match(/Reprendre ce chiffrage/g)||[]).length===1,
    'les sauvegardes du Drive : l’état passé du lot, une seule fois');
  demandes=[];
  TR.act(()=>btn(/Reprendre ce chiffrage/).props.onClick());
  chk(/au lieu de 500,00 € HT, 1 article\(s\)/.test(norm(demandes[0]||''))&&/rien n’est enregistré avant « Enregistrer »/.test(demandes[0]||''),'avant : ce qui change est dit');
  chk(/✓ Chiffrage du .* repris dans le formulaire/.test(t())&&data.marches[0].montantHT===500,'repris dans le formulaire ; rien d’enregistré encore');
  TR.act(()=>btn(/^Enregistrer$/).props.onClick());
  const m=data.marches[0];
  chk(m.montantHT===1500&&m.quantitatif.lignes.filter(l=>+l.qt>0).length===3&&m.contratLien===lien('W1')&&m.factures.length===1,
    'enregistré : le chiffrage et le marché rédigé reviennent, les factures restent');
  /* « Retirer » demande confirmation */
  TR.act(()=>btn(/Modifier le lot/).props.onClick());
  demandes=[];confirme=false;
  TR.act(()=>btn(/^Retirer$/).props.onClick());
  chk(/Retirer tout le quantitatif \? Les 3 article\(s\) servi\(s\)/.test(norm(demandes[0]||''))&&/QUANTITATIF/.test(t()),'« Retirer » : la question est posée ; refusée, le quantitatif reste');
  confirme=true;
  TR.act(()=>tr.unmount());
}
fin();
})().catch(e=>{console.error(e);process.exitCode=1});
