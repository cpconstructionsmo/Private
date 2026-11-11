/* Contrat de maîtrise d'œuvre d'un ERP, et sortie depuis le chantier.
   - Pour un ERP, seules les lignes descriptives changent (« Bâtiment à
     usage de bureaux — ERP de 5e catégorie ») : les articles restent mot
     pour mot ceux du modèle.
   - Le type d'ouvrage se choisit sur la carte du contrat, et se reprend
     par défaut du programme technique du dossier.
   - Un dossier signé n'est plus dans les prospects en cours : le contrat se
     sort aussi depuis le chantier (PIÈCES › Contrat de maîtrise d'œuvre),
     avec le chiffrage du prospect, et se range dans ses pièces.
   Données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['genererContratMoeDocx','wordLignes','contratTypeOuvrage','SortirContratMoe','Docs','EMPTY']);
const {chk,fin}=verif();
const btn=(tr,re)=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
const P={id:'p1',nom:'Maison Fictive - Sainte-Cécile',civilite:'M.',client:'Fictif',adresseClient:'1 rue Fictive — 61000 Alençon',
  commune:'Sainte-Cécile',niveaux:'Plain-pied',surfaceTerrain:'900',surfaceHabitable:'120',prestation:'Clé en main',
  postes:[{id:'x1',libelle:'Gros œuvre',montant:100000}],margePct:15,tva:20,statut:'gagne',chantierId:'c1'};
const docx=async(p,t)=>{const b=await M.genererContratMoeDocx(p,t);
  return norm(await M.wordLignes(new File([b],'c.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})))};

(async()=>{
  /* ---- 1) le texte ---- */
  const maison=await docx(P,'maison'), erp=await docx(P,'erp5');
  chk(/Ouvrage à usage d’habitation/.test(maison)&&/Type de maison/.test(maison),'maison : le modèle inchangé');
  chk(/Mission de maîtrise d’œuvre — Bâtiment à usage de bureaux — ERP de 5e catégorie — Client privé/.test(erp),'ERP : sous-titre « Bâtiment à usage de bureaux — ERP de 5e catégorie »');
  chk(/Type d’ouvrage/.test(erp)&&/Bâtiment à usage de bureaux — ERP de 5e catégorie — Plain-pied/.test(erp)&&!/Type de maison|Ouvrage à usage d’habitation|habitation personnalisé/.test(erp),
    'ERP : « Type d’ouvrage », plus de « Type de maison » ni d’« habitation personnalisé »');
  const lignes=t=>t.split('\n').map(x=>x.trim()).filter(Boolean);
  const LM=lignes(maison), LE=lignes(erp);
  const seulM=LM.filter(x=>LE.indexOf(x)<0), seulE=LE.filter(x=>LM.indexOf(x)<0);
  chk(seulM.length<=3&&seulE.length<=3&&seulM.every(x=>/habitation|Type de maison/.test(x))&&seulE.every(x=>/ERP de 5e catégorie|Type d’ouvrage/.test(x)),
    'tout le reste — les articles — est identique mot pour mot ('+seulM.length+' / '+seulE.length+' lignes descriptives)');
  chk(/article L\.231-1|L\.231-1/.test(erp),'l’avertissement légal du modèle reste tel quel');

  /* ---- 2) le type d'ouvrage : la fiche, sinon le programme du dossier ---- */
  const data={...M.EMPTY,prospects:[P],chantiers:[{id:'c1',nom:'Maison Fictive - Sainte-Cécile',client:'Fictif',prospectId:'p1',docs:{}}],
    programmes:[{id:'pg1',prospectId:'p1',chantierId:'c1',typeOuvrage:'erp5',lignes:[],categories:[]}]};
  chk(M.contratTypeOuvrage(P,data)==='erp5','repris du programme technique du dossier (ERP)');
  chk(M.contratTypeOuvrage({...P,typeOuvrage:'maison'},data)==='maison','un choix fait sur la fiche l’emporte');
  chk(M.contratTypeOuvrage({id:'p9'},M.EMPTY)==='maison','sans programme : une maison');
  let tr, patchs=[];
  TR.act(()=>{tr=TR.create(React.createElement(M.SortirContratMoe,{data,p:P,maj:v=>patchs.push(v)}))});
  const sel=tr.root.findAll(n=>n.type==='select'&&n.props['aria-label']==='Ouvrage du contrat')[0];
  chk(sel&&sel.props.value==='erp5'&&/faites relire l’ensemble du contrat/.test(norm(texteInst(tr.root))),'la carte montre « ERP de 5e catégorie » et demande une relecture');
  TR.act(()=>{sel.props.onChange({target:{value:'maison'}})});
  chk(patchs.some(v=>v.typeOuvrage==='maison'),'le choix se garde sur la fiche');
  TR.act(()=>{tr.unmount()});

  /* ---- 3) depuis le chantier signé : PIÈCES › Contrat de maîtrise d'œuvre ---- */
  let d2=data;
  const monter=()=>React.createElement(M.Docs,{data:d2,ch:d2.chantiers[0],up(){},save});
  function save(n){d2=n;TR.act(()=>{tr.update(monter())})}
  TR.act(()=>{tr=TR.create(monter())});
  const b=btn(tr,/Sortir le contrat de maîtrise d’œuvre/);
  chk(!!b&&!b.props.disabled,'la pièce « Contrat de maîtrise d’œuvre » du chantier propose de sortir le contrat (prospect signé)');
  await TR.act(async()=>{b.props.onClick()});
  for(let i=0;i<100&&!/Déposé dans/.test(norm(texteInst(tr.root)));i++)await TR.act(()=>new Promise(r=>setTimeout(r,20)));
  chk(/Déposé dans Drive › Maison Fictive - Sainte-Cécile › Pièces — Contrat de maîtrise d’œuvre — Maison Fictive - Sainte-Cécile\.docx/.test(norm(texteInst(tr.root))),
    'le contrat est rangé dans les pièces du chantier');
  chk(!!d2.prospects[0].contratMoeLe,'la date de sortie se garde sur la fiche du prospect');
  chk(!(d2.chantiers[0].docs||{}).contrat_moe,'la pièce n’est pas cochée : c’est le contrat signé qu’on y dépose');
  TR.act(()=>{tr.unmount()});

  /* un chantier sans prospect : on dit où le sortir */
  d2={...M.EMPTY,chantiers:[{id:'c2',nom:'Chantier direct',docs:{}}]};
  TR.act(()=>{tr=TR.create(monter())});
  chk(!btn(tr,/Sortir le contrat/)&&/n’a pas été créé depuis un prospect/.test(norm(texteInst(tr.root))),'chantier sans prospect : il dit où sortir le contrat');
  TR.act(()=>{tr.unmount()});
  fin();
})().catch(e=>{console.error(e);process.exit(1)});
