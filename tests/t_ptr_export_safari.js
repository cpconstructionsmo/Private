/* Export du programme technique sous Safari : un téléchargement lancé à la
   fin de la composition ouvre un onglet « Safari ne parvient pas à ouvrir
   la page » (WebKitBlobResource erreur 1). Sous Safari, le Word prêt se
   télécharge donc d'un bouton ; ailleurs, il part tout seul, avec
   « Télécharger à nouveau ». */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const clics=[];
const doc={getElementById:()=>({}),head:{appendChild(){}},body:{appendChild(){}},
  createElement:()=>({click(){clics.push(this.download)},remove(){}})};
const M=charger(['ProgrammeTechnique','ptrNouveauProgramme','ptrBiblio','telechargementDifere','EMPTY'],{document:doc});
const {chk,fin}=verif();
const SAFARI='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const IPHONE_CHROME='Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const CHROME='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const nav=global.window.navigator;
const avec=ua=>{nav.userAgent=ua;return M.telechargementDifere()};
chk(avec(SAFARI)&&avec(IPHONE_CHROME)&&!avec(CHROME)&&!avec('Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0'),
  'Safari et les navigateurs d’iPhone attendent un clic ; Chrome et Firefox téléchargent tout seuls');

const cible={prospectId:null,chantierId:'c1'};
let data={...M.EMPTY,chantiers:[{id:'c1',nom:'Maison Fictive',client:'Fictif',adresse:'Sainte-Cécile'}],programmes:[]};
data={...data,programmes:[{...M.ptrNouveauProgramme(M.ptrBiblio(data),cible,'modele'),id:'pg1'}]};
let tr;
const monter=()=>React.createElement(M.ProgrammeTechnique,{data,save,cible});
function save(d){data=d;TR.act(()=>{tr.update(monter())})}
const txt=()=>norm(texteInst(tr.root));
const bouton=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
const attendre=async re=>{for(let i=0;i<200&&!re.test(txt());i++)await TR.act(()=>new Promise(r=>setTimeout(r,25)))};

(async()=>{
  /* Safari : rien ne part tout seul, le bouton « Télécharger le Word » */
  nav.userAgent=SAFARI;
  TR.act(()=>{tr=TR.create(monter())});
  await TR.act(async()=>{bouton(/^Générer le programme \(Word\)$/).props.onClick()});
  if(bouton(/Exporter malgré tout/))await TR.act(async()=>{bouton(/Exporter malgré tout/).props.onClick()});
  await attendre(/Document Word (prêt|téléchargé)/);
  chk(/Document Word prêt/.test(txt())&&!clics.length,'Safari : « Document Word prêt », aucun téléchargement lancé tout seul');
  const b=bouton(/Télécharger le Word/);
  chk(!!b&&/acc/.test(b.props.className),'Safari : bouton « ⬇ Télécharger le Word », mis en avant');
  TR.act(()=>{b.props.onClick()});
  chk(clics.length===1&&/^Programme_Technique_Fictive_V1\.docx$/.test(clics[0]),'le clic télécharge le Word ('+clics.join()+')');
  TR.act(()=>{tr.unmount()});

  /* Chrome : le Word part tout seul, « Télécharger à nouveau » en secours */
  nav.userAgent=CHROME;clics.length=0;
  TR.act(()=>{tr=TR.create(monter())});
  await TR.act(async()=>{bouton(/^Générer le programme \(Word\)$/).props.onClick()});
  if(bouton(/Exporter malgré tout/))await TR.act(async()=>{bouton(/Exporter malgré tout/).props.onClick()});
  await attendre(/Document Word (prêt|téléchargé)/);
  chk(/Document Word téléchargé/.test(txt())&&clics.length===1,'Chrome : le Word est téléchargé aussitôt');
  chk(!!bouton(/^Télécharger à nouveau$/)&&!bouton(/Télécharger le Word/),'Chrome : « Télécharger à nouveau » en secours');
  TR.act(()=>{tr.unmount()});
  fin();
})().catch(e=>{console.error(e);process.exit(1)});
