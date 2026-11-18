/* Chantier de rénovation : il se reconnaît d'un coup d'œil (badge, liseré),
   ses pièces sont celles de l'existant (relevé, repérages, déclaration
   préalable) sans RE2020 ni étude de sol, et son contrat de maîtrise
   d'œuvre est adapté (mission, conditions, article « Travaux sur
   existant », échéancier, TVA par poste, honoraires à 20 %). Le contrat se
   sort aussi d'un chantier créé sans prospect. Données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['typeTravaux','estReno','docsDuChantier','piecesManquantes','phaseLibelle','contratTypeOuvrage','contratTravaux',
  'genererContratMoeDocx','contratPourChantier','ContratMoeChantier','Chantiers','Fiche','zipEntree','EMPTY','HONO_ECHEANCIER_RENO']);
const {chk,fin}=verif();
const xmlDe=async o=>norm(new TextDecoder().decode(await M.zipEntree(o.buffer.slice(o.byteOffset,o.byteOffset+o.byteLength),'word/document.xml')).replace(/<[^>]+>/g,''));

const RENO={id:'c1',nom:'Rénovation Fictive — Commune',client:'Client Fictif',adresse:'1 impasse Fictive, 61000 Commune',
  typeTravaux:'renovation',statut:'etude',budget:39468.39,honorairesMontant:4736.2,tva:10,budgetClientTTC:50887.54,docs:{}};
const NEUF={id:'c2',nom:'Maison Fictive',client:'Autre client',adresse:'Lotissement fictif',statut:'etude',docs:{sol:{fait:true}}};
const P_RENO={id:'p1',nom:'Prospect réno',categorie:'renovation',client:'X'};
const DEPUIS={id:'c3',nom:'Issu du prospect',prospectId:'p1',statut:'pc',docs:{}};
const data={...M.EMPTY,chantiers:[RENO,NEUF,DEPUIS],prospects:[P_RENO],marches:[],commandes:[],photos:[]};

(async()=>{
  /* ---- 1) le type de travaux ---- */
  chk(M.typeTravaux(RENO,data)==='renovation'&&M.typeTravaux(NEUF,data)==='neuf','type saisi sur le chantier ; neuf par défaut');
  chk(M.estReno(DEPUIS,data),'sans type saisi : repris de la catégorie « Rénovation » du prospect d’origine');
  chk(!M.estReno({...DEPUIS,typeTravaux:'neuf'},data),'le type saisi sur le chantier l’emporte sur le prospect');
  chk(M.phaseLibelle(DEPUIS,data)==='Autorisation'&&M.phaseLibelle({...NEUF,statut:'pc'},data)==='Permis','phase « Permis » d’une rénovation : « Autorisation »');

  /* ---- 2) les pièces ---- */
  const ids=c=>M.docsDuChantier(c,data).map(x=>x.id);
  const r=ids(RENO), n=ids(NEUF);
  chk(['releve_existant','diag_avant_travaux','dp_depot','dp_arrete','dqe'].every(x=>r.includes(x)),'rénovation : relevé, repérages, déclaration préalable, DQE');
  chk(!['sol','thermique','attest_re_pc','plan_fermette','attest'].some(x=>r.includes(x)),'rénovation : ni étude de sol, ni RE2020, ni fermettes');
  chk(!['releve_existant','dp_depot','dqe'].some(x=>n.includes(x))&&n.includes('thermique'),'neuf : ses pièces, sans celles de la rénovation');
  chk(ids({...RENO,docs:{sol:{fait:true}}}).includes('sol'),'une pièce déjà cochée reste visible, quel que soit le type');
  chk(M.piecesManquantes(RENO,data).some(l=>/Relevé de l’existant/.test(l))&&!M.piecesManquantes(RENO,data).some(l=>/Étude de sol|RE2020/.test(l)),
    'tableau de bord : les pièces attendues d’une rénovation');
  chk(M.piecesManquantes(NEUF,data).some(l=>/RE2020/.test(l)),'tableau de bord : celles du neuf inchangées');

  /* ---- 3) le contrat de maîtrise d'œuvre ---- */
  const p={id:'px',nom:'Rénovation Fictive',civilite:'Mme',client:'Fictive A',civilite2:'M.',client2:'Fictif B',commune:'1 impasse Fictive',
    coutHT:39468.39,margeMontant:4736.2,tva:10,categorie:'renovation',contratTravauxTTC:45204.12,contratTravauxHT:39468.39,surfaceHabitable:39.93};
  chk(M.contratTypeOuvrage(p,data)==='renovation','prospect de rénovation : contrat « Rénovation » d’office');
  chk(M.contratTypeOuvrage({...p,typeOuvrage:'maison'},data)==='maison','le type choisi sur la carte l’emporte');
  const t=M.contratTravaux(p);
  chk(t.ht===39468.39&&t.ttc===45204.12&&t.tvaMixte,'travaux : HT et TTC saisis, TVA par poste');
  let x=await xmlDe(await M.genererContratMoeDocx(p,'renovation'));
  chk(/Rénovation d’un ouvrage existant à usage d’habitation/.test(x)&&/Maison individuelle existante — travaux de rénovation/.test(x),'lignes descriptives de la rénovation');
  chk(/REL — Relevé et diagnostic de l’existant/.test(x)&&/AUT — Autorisation d’urbanisme/.test(x)&&!/ESQ — Esquisse/.test(x),'mission : relevé, avant-projet, autorisation d’urbanisme');
  chk(/Article 4 ter — Travaux sur existant/.test(x)&&/Découvertes en cours de travaux/.test(x)&&/Site occupé/.test(x)
    &&/Existants et assurances/.test(x)&&/Travaux exclus de la mission/.test(x),'article « Travaux sur existant »');
  chk(!/Acquisition du terrain/.test(x)&&/Obtention de l’autorisation d’urbanisme requise/.test(x)&&/repérages réglementaires avant travaux/.test(x),
    'conditions suspensives : ni terrain, mais autorisation et repérages');
  chk(/39 468,39 € HT, soit 45 204,12 € TTC, TVA à taux variable selon la nature des prestations/.test(x)&&!/taux de TVA en vigueur de/.test(x),
    'article 6 : travaux HT et TTC, TVA variable, aucun taux unique');
  chk(/TVA \(20 %\)947,24 €/.test(x)&&/Honoraires TTC5 683,44 €/.test(x),'honoraires à 20 % même quand les travaux sont à 10 %');
  chk(/Direction de l’exécution des travaux60 %3 410,06 €/.test(x)&&!/maçonnerie courante/.test(x)&&!/mise hors d’eau/i.test(x),'échéancier de la rénovation');
  chk(M.HONO_ECHEANCIER_RENO.reduce((s,e)=>s+e.pct,0)===100,'échéancier : 100 %');
  chk(/Dépôt de l’autorisation d’urbanisme/.test(x)&&/descriptif technique par lot et l’estimation détaillée \(DQE\)/.test(x)&&!/programme technique de référence \(PTR\)/.test(x),
    'délais et pièces contractuelles de la rénovation');
  x=await xmlDe(await M.genererContratMoeDocx({...p,contratTravauxHT:'',tva:0},'renovation'));
  chk(/45 204,12 € TTC, TVA à taux variable selon la nature des prestations/.test(x)&&!/45 204,12 € HT/.test(x)&&!/0 %\./.test(x),
    'rénovation sans HT saisi : le TTC seul, TVA variable (ni HT déduit, ni taux à 0 %)');
  chk(!/Les travaux prévus ne comportent ni démolition/.test(x)&&!/estimé à environ/.test(x)
    &&/Lorsque les travaux entrent dans le champ de l’article L\.242-1/.test(x),'dommages-ouvrage : obligation selon la nature des travaux');
  x=await xmlDe(await M.genererContratMoeDocx({...p,contratDoCout:3000,contratDoSansStructure:true},'renovation'));
  chk(/ni démolition de mur porteur ni travaux de gros œuvre : selon la nature des ouvrages réalisés, l’assurance dommages-ouvrage peut ne pas être exigée/.test(x)
    &&/estimé à environ 3 000,00 € TTC/.test(x)&&/Je renonce expressément à cette assurance/.test(x),'dommages-ouvrage : coût estimé, sans travaux de structure, renonciation gardée');
  /* l'orthographe du modèle */
  chk(!/maitre|Maitre|tout décision|précédera|à l’articles|d’autres part|Code Civil|apparaitraient|A la réception|maîtrise d’Œuvre/.test(x),'orthographe du modèle corrigée');
  const brut=await (async()=>{const o=await M.genererContratMoeDocx(p,'renovation');return new TextDecoder().decode(await M.zipEntree(o.buffer.slice(o.byteOffset,o.byteOffset+o.byteLength),'word/document.xml'))})();
  const total=brut.slice(brut.indexOf('TOTAL HONORAIRES')-1500,brut.indexOf('TOTAL HONORAIRES')+3000);
  const cellule100=total.slice(total.lastIndexOf('<w:tc>',total.indexOf('>100 %<')),total.indexOf('>100 %<'));
  chk(/w:fill="/.test(cellule100)&&/<w:top w:val="single"/.test(cellule100),'échéancier : la case « 100 % » encadrée et teintée comme le reste du total');
  x=await xmlDe(await M.genererContratMoeDocx({...p,categorie:'neuf',typeOuvrage:'maison',contratTravauxHT:'',contratTravauxTTC:'',tva:20},'maison'));
  chk(/Acquisition du terrain/.test(x)&&!/Article 4 ter/.test(x)&&/ESQ — Esquisse/.test(x)&&/maçonnerie courante/.test(x)
    &&/sur la base d’un taux de TVA en vigueur de 20 %/.test(x),'maison neuve : le contrat du modèle, inchangé');

  /* ---- 4) le contrat depuis un chantier créé sans prospect ---- */
  const pc=M.contratPourChantier(RENO,data);
  chk(pc.coutHT===39468.39&&pc.margeMontant===4736.2&&pc.categorie==='renovation'&&pc.commune===RENO.adresse,'le contrat se remplit de la fiche du chantier');
  let d={...data};let tr;
  const monter=()=>React.createElement(M.ContratMoeChantier,{data:d,ch:d.chantiers[0],save:n=>{d=n;TR.act(()=>tr.update(monter()))}});
  TR.act(()=>{tr=TR.create(monter())});
  const sel=tr.root.findAll(n=>n.type==='select'&&n.props['aria-label']==='Ouvrage du contrat')[0];
  chk(sel&&sel.props.value==='renovation'&&!!tr.root.findAll(n=>n.type==='button'&&/Sortir le contrat/.test(texteInst(n)))[0],
    'chantier sans prospect : la carte du contrat, en « Rénovation »');
  const ht=tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Coût des travaux HT')[0];
  TR.act(()=>{ht.props.onChange({target:{value:'39468,39'}})});
  TR.act(()=>{tr.root.findAll(n=>n.type==='input'&&n.props['aria-label']==='Coût des travaux HT')[0].props.onBlur()});
  chk(d.chantiers[0].contratMoe&&d.chantiers[0].contratMoe.contratTravauxHT===39468.39,'les réglages du contrat se gardent sur le chantier');
  TR.act(()=>tr.unmount());

  /* ---- 5) l'écran : badge et pièces ---- */
  TR.act(()=>{tr=TR.create(React.createElement(M.Chantiers,{data,save(){},open(){}}))});
  let txt=norm(texteInst(tr.root));
  chk((txt.match(/RÉNOVATION/g)||[]).length===2,'liste des chantiers : badge « RÉNOVATION » sur les deux rénovations, pas sur la maison neuve');
  TR.act(()=>tr.unmount());
  TR.act(()=>{tr=TR.create(React.createElement(M.Fiche,{data,ch:RENO,save(){},back(){},ongletInitial:'docs'}))});
  txt=norm(texteInst(tr.root));
  chk(/RÉNOVATION/.test(txt)&&/AUTORISATION D’URBANISME/.test(txt)&&/EXISTANT/.test(txt)&&!/Étude de sol G2/.test(txt)
    &&/\(rénovation\)/.test(txt),'fiche : badge, pièces de l’existant, autorisation d’urbanisme');
  TR.act(()=>tr.unmount());
  fin();
})().catch(e=>{console.error(e);process.exit(1)});
