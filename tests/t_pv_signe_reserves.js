/* Fin de chantier, d'après le chantier Leroux (données fictives) :
   - le PV revenu signé par le client se glisse sur le PV du lot : il part sur
     le Drive › PV de réception, renommé d'après le lot, et rejoint la pièce
     « PV de réception » (donc le dossier de l'assureur) ; il se retire ;
   - une réserve notée par le client « pour information » (on ne la
     reprendrait qu'en déposant la cuisine) ne se lève pas : le PV le dit,
     l'attestation de fin de mission ne l'attend pas ;
   - un PV produit ou déposé signé sans décision cochée : « décision à noter »,
     et non plus « PV non établi » ;
   - le DOE et les notices d'entretien ne sont plus demandés.
   Drive simulé. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const {chk,fin}=verif();
const M=charger(['PvReception','EMPTY','pvDe','pvDonnees','genererPvReceptionDocx','zipEntree','finMissionDonnees','finMissionLot','FIN_MISSION_DOCS']);
const lien=id=>'https://drive.google.com/file/d/'+id+'/view';
const CH={id:'c1',nom:'Maison Fictive',adresse:'1 rue Fictive 61000 Commune',client:'M. Fictif',tva:10,
  pvs:{
    m1:{decision:'avec',dateEffet:'2026-11-14',reserves:[{id:'r1',localisation:'Cuisine',description:'Carreau fêlé sous le meuble',info:true}]},
    m2:{decision:'avec',dateEffet:'2026-11-14',reserves:[{id:'r2',localisation:'Salle d’eau',description:'Joint',avant:'2026-12-01'},
      {id:'r3',localisation:'Cuisine',description:'Plinthe',info:true}]},
    m3:{genere:{nom:'PV.docx',lien:lien('PV3'),le:'2026-11-14'},dateEffet:'2026-11-14'},
    m4:{signes:[{id:'s4',nom:'PV signé.pdf',lien:lien('S4'),le:'2026-11-15'}]}}};
const lot=(id,l)=>({id,chantierId:'c1',lot:l,artisanId:'a1',montantHT:1000,tva:10,statut:'signe',factures:[]});
const base=()=>({...M.EMPTY,chantiers:[CH],artisans:[{id:'a1',nom:'SARL Fictive'}],
  marches:[lot('m1','CHAPE – CARRELAGE'),lot('m2','PLOMBERIE'),lot('m3','TERRASSEMENT'),lot('m4','ISOLATION'),lot('m5','PEINTURE')],commandes:[]});

(async()=>{
/* 1. l'attestation de fin de mission */
{
  const data=base(), d=M.finMissionDonnees(CH,data), L=id=>d.lots.find(x=>x.id===id);
  chk(L('m1').etat==='info'&&L('m1').texte==='Avec réserve notée pour information — aucune levée attendue'&&L('m1').recuLe==='14/11/2026',
    'réserve pour information : dite telle quelle, rien à lever');
  chk(L('m2').etat==='reserves'&&L('m2').texte==='Avec 1 réserve — non levée (et 1 pour information)','une vraie réserve reste à lever ; l’autre est pour information');
  chk(L('m3').etat==='decision'&&L('m3').texte==='PV établi — décision à noter','PV produit sans décision cochée : « décision à noter »');
  chk(L('m4').etat==='decision'&&L('m4').texte==='PV signé déposé — décision à noter','PV signé déposé sans décision : de même');
  chk(L('m5').etat==='aucun','sans PV : non établi');
  const a=d.alertes.join(' | ');
  chk(!/CHAPE/.test(a.split('Réserves non levées')[1]||'')&&/Réserves non levées : PLOMBERIE/.test(a),'seule la vraie réserve fait attendre l’attestation');
  chk(/Décision de réception à noter sur le PV \(sans réserve, avec réserves…\) : TERRASSEMENT, ISOLATION\./.test(a),'les PV sans décision sont nommés');
  chk(/PV de réception à établir : PEINTURE\./.test(a)&&!/DOE/.test(a),'le PV manquant est nommé ; le DOE n’est plus demandé');
  chk(M.FIN_MISSION_DOCS.filter(x=>x.retire).map(x=>x.id).join()==='doe,entretien','DOE et notices d’entretien retirés de la liste proposée');
}
/* 2. le Word du PV */
{
  const data=base();
  const lire=async o=>new TextDecoder().decode(await M.zipEntree(o.buffer.slice(o.byteOffset,o.byteOffset+o.byteLength),'word/document.xml'));
  const x1=norm(await lire(await M.genererPvReceptionDocx(M.pvDonnees(data.marches[0],CH,data),{})));
  chk(/Pour information — aucune levée attendue/.test(x1)&&/sans objet — réserve\(s\) notée\(s\) pour information, aucune levée attendue/.test(x1),
    'le PV : la réserve « pour information », et la levée « sans objet »');
  const x2=norm(await lire(await M.genererPvReceptionDocx(M.pvDonnees(data.marches[1],CH,data),{})));
  chk(/01\/12\/2026/.test(x2)&&/Pour information — aucune levée attendue/.test(x2)&&!/sans objet/.test(x2),'une vraie réserve garde sa date et la ligne de levée');
}
/* 3. à l'écran : la réserve pour information, le PV signé déposé */
{
  let data=base(), tr;
  const m=data.marches[4];
  const monter=()=>React.createElement(M.PvReception,{data,ch:data.chantiers[0],m,save});
  function save(n){data=n;TR.act(()=>tr.update(monter()))}
  TR.act(()=>{tr=TR.create(monter())});
  const t=()=>norm(texteInst(tr.root));
  const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
  TR.act(()=>btn(/^\+ Réserve$/).props.onClick());
  const pv=()=>M.pvDe(data.chantiers[0],m.id);
  const caseInfo=()=>tr.root.findAll(n=>n.type==='input'&&n.props.type==='checkbox'&&/pour information/.test(norm(texteInst(n.parent))))[0];
  TR.act(()=>caseInfo().props.onChange({target:{checked:true}}));
  chk(pv().reserves[0].info===true&&pv().decision==='avec','la réserve se coche « pour information »');
  chk(!tr.root.findAll(n=>n.type==='input'&&n.props.title==='À lever avant le').length,'une réserve pour information n’a pas de date de levée');
  TR.act(()=>tr.root.findAll(n=>n.type==='input'&&n.props.placeholder==='Description précise')[0].props.onChange({target:{value:'Carreau fêlé sous la cuisine'}}));
  chk(/notée pour information : aucune levée attendue/.test(t())&&!/Toutes les réserves levées le/.test(t()),'pas de date de levée à attendre : c’est dit');
  const zone=()=>tr.root.findAll(n=>n.type==='label'&&n.props['aria-label']==='Déposer le PV signé')[0];
  chk(!!zone()&&/Une fois la réception faite et le PV signé par le client : glissez le scan ici/.test(norm(texteInst(zone()))),'la zone où glisser le PV signé');
  const f=new File([Buffer.from('%PDF signé')],'scan 2026-11-14.pdf',{type:'application/pdf'});
  const ev={preventDefault(){},stopPropagation(){}};
  await TR.act(async()=>{await zone().props.onDrop({...ev,dataTransfer:{files:[f]}})});
  for(let i=0;i<50&&!(pv().signes||[]).length;i++)await TR.act(()=>new Promise(r=>setTimeout(r,10)));
  const s=(pv().signes||[])[0];
  chk(s&&s.nom==='PV de réception signé — PEINTURE — Maison Fictive.pdf'&&/drive\.google\.com\/file\/d\//.test(s.lien),'déposé : renommé d’après le lot, sur le Drive');
  chk(pv().reserves[0].info===true&&/Carreau fêlé/.test(pv().reserves[0].description),'la saisie du PV n’est pas touchée par le dépôt');
  const docsPv=((data.chantiers[0].docs||{}).pv||{}).fichiers||[];
  chk(docsPv.some(x=>x.lien===s.lien&&x.nom===s.nom),'ajouté à la pièce « PV de réception » du chantier (dossier de l’assureur)');
  chk(/Déposé dans Drive › Maison Fictive › PV de réception/.test(t())&&/✓ PV de réception signé — PEINTURE/.test(t()),'l’écran le dit');
  TR.act(()=>tr.root.findAll(n=>n.type==='button'&&/^Retirer PV de réception signé/.test(n.props['aria-label']||''))[0].props.onClick());
  chk(!(pv().signes||[]).length&&!(((data.chantiers[0].docs||{}).pv||{}).fichiers||[]).some(x=>x.lien===s.lien),'retiré du PV et de la pièce (le fichier reste sur le Drive)');
  TR.act(()=>tr.unmount());
}
fin();
})().catch(e=>{console.error(e);process.exitCode=1});
