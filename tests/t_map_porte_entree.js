/* MAP : option de la porte d'entrée (fixe en dormant, semi-fixe, imposte)
   et sa dimension (300, 400, 500 mm), juste après le modèle ; reprises
   dans le compte-rendu. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['MAP','mapLignes','EMPTY']);
const {chk,fin}=verif();
let ch={id:'c1',nom:'Maison Moualid',map:{porteEntreeMateriau:'Acier'}};
const data={...M.EMPTY,chantiers:[ch],produits:[{id:'pe',nom:'Porte d’entrée Bel’M Abscisse',marque:'Bel’m',lot:'Menuiseries ext.'}]};
let tr;
const monter=()=>React.createElement(M.MAP,{data,ch,up:p=>{ch={...ch,...p};TR.act(()=>{tr.update(monter())})}});
TR.act(()=>{tr=TR.create(monter())});
const txt=norm(texteInst(tr.root));
const iMod=txt.indexOf('PORTE D’ENTRÉE — MODÈLE'), iOpt=txt.indexOf('OPTION',iMod), iDim=txt.indexOf('DIMENSION',iMod), iMat=txt.indexOf('MATÉRIAU',iMod);
chk(iMod>=0&&iOpt>iMod&&iDim>iOpt&&iMat>iDim,'OPTION et DIMENSION juste après le modèle de porte d’entrée, avant le matériau');
const sel=v=>tr.root.findAll(n=>n.type==='select'&&n.findAll(o=>o.type==='option'&&o.props.value===v).length)[0];
const sOpt=sel('Semi-fixe'), sDim=sel('400 mm');
chk(!!sOpt&&['','Fixe en dormant','Semi-fixe','Imposte'].join()===sOpt.findAllByType('option').map(o=>o.props.value).join(),'option : fixe en dormant / semi-fixe / imposte');
chk(!!sDim&&['','300 mm','400 mm','500 mm'].join()===sDim.findAllByType('option').map(o=>o.props.value).join(),'dimension : 300 / 400 / 500 mm');
TR.act(()=>{sOpt.props.onChange({target:{value:'Semi-fixe'}})});
TR.act(()=>{sel('400 mm').props.onChange({target:{value:'400 mm'}})});
chk(ch.map.porteEntreeOption==='Semi-fixe'&&ch.map.porteEntreeOptionDim==='400 mm'&&ch.map.porteEntreeMateriau==='Acier','choix enregistrés sans perdre les autres champs');
const s5=M.mapLignes(ch,data).find(([t])=>/^5\./.test(t))[1];
const lab=s5.map(([l])=>l);
chk(lab.indexOf('Option porte d’entrée')===lab.indexOf('Matériau porte d’entrée')-2&&s5.some(([l,v])=>l==='Option porte d’entrée'&&v==='Semi-fixe')&&s5.some(([l,v])=>l==='Dimension de l’option'&&v==='400 mm'),'compte-rendu MAP : option et dimension reprises');
const vide=M.mapLignes({...ch,map:{porteEntreeMateriau:'Acier'}},data).find(([t])=>/^5\./.test(t))[1];
chk(!vide.some(([l])=>/Option porte|Dimension de l/.test(l)),'non renseignés : rien dans le compte-rendu');
TR.act(()=>{tr.unmount()});
fin();
