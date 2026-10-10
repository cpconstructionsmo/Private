/* Les brouillons des formulaires : une saisie pas encore enregistrée (un lot,
   un prospect…) est copiée sur l'appareil à chaque changement ; après un
   rechargement de la page, l'écran propose de la reprendre ou de la jeter.
   « Enregistrer » ou « Annuler » efface la copie ; un formulaire seulement
   ouvert n'en laisse aucune. Le rechargement est simulé en démontant puis
   remontant l'écran, avec un stockage local en mémoire. Données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
let reponseConfirm=true;
const M=charger(['Marches','Prospects','saisiesEnCours','EMPTY'],{confirm:()=>reponseConfirm});
const {chk,fin}=verif();

/* le stockage de l'appareil, en mémoire (le banc n'en fournit qu'un factice) */
const mem={};
const LS=global.localStorage, lireJeton=LS.getItem;
LS.getItem=k=>k in mem?mem[k]:lireJeton(k);
LS.setItem=(k,v)=>{mem[k]=String(v)};
LS.removeItem=k=>{delete mem[k]};
LS.key=i=>Object.keys(mem)[i]??null;
Object.defineProperty(LS,'length',{get:()=>Object.keys(mem).length,configurable:true});
const brouillons=()=>Object.keys(mem).filter(k=>k.indexOf('cpBrouillon:')===0);

const CH={id:'c1',nom:'Maison Fictive',client:'M. Fictif',tva:20};
let data={...M.EMPTY,chantiers:[CH],artisans:[{id:'a1',nom:'SASU Fictive'}],commandes:[],
  marches:[{id:'m1',chantierId:'c1',lot:'GROS ŒUVRE',artisanId:'a1',montantHT:840,tva:20,statut:'devis',factures:[]}]};
function ecran(){
  let tr;
  const props=()=>({data,ch:CH,save:d=>{data=d;TR.act(()=>{tr.update(React.createElement(M.Marches,props()))})},eng:0,fac:0,onFacturerCmd(){},onFacturerHono(){}});
  TR.act(()=>{tr=TR.create(React.createElement(M.Marches,props()))});
  const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
  const champLot=v=>tr.root.findAll(n=>n.type==='input'&&n.props.value===v)[0];
  return {tr,btn,champLot,t:()=>norm(texteInst(tr.root)),fermer:()=>TR.act(()=>{tr.unmount()})};
}

{
  /* un formulaire seulement ouvert ne laisse aucune copie */
  const e=ecran();
  TR.act(()=>{e.btn(/Modifier le lot/).props.onClick()});
  chk(brouillons().length===0&&M.saisiesEnCours.size===0,'formulaire ouvert sans rien changer : aucune copie');
  /* une frappe : la copie est faite tout de suite */
  TR.act(()=>{e.champLot('GROS ŒUVRE').props.onChange({target:{value:'CARRELAGE GRENIER'}})});
  const k=brouillons();
  chk(k.length===1&&/^cpBrouillon:marches:c1:m1:/.test(k[0])&&JSON.parse(mem[k[0]]).f.lot==='CARRELAGE GRENIER'&&M.saisiesEnCours.size===1,
    'une frappe : la saisie est copiée sur l’appareil (écran des lots du chantier, lot m1)');
  /* la page se recharge sans « Enregistrer » */
  e.fermer();
  chk(data.marches[0].lot==='GROS ŒUVRE','rien n’est parti dans les données avant « Enregistrer »');
}
{
  const e=ecran();
  chk(/Saisie non enregistrée retrouvée/.test(e.t())&&/Lot CARRELAGE GRENIER/.test(e.t()),'après le rechargement : le bandeau propose la saisie retrouvée');
  TR.act(()=>{e.btn(/^Reprendre la saisie$/).props.onClick()});
  chk(!!e.champLot('CARRELAGE GRENIER')&&!/Saisie non enregistrée retrouvée/.test(e.t()),'« Reprendre la saisie » rouvre le formulaire avec ce qui avait été tapé');
  chk(brouillons().length===1,'la copie reste tant que ce n’est pas enregistré');
  TR.act(()=>{e.btn(/^Enregistrer$/).props.onClick()});
  chk(data.marches[0].lot==='CARRELAGE GRENIER'&&brouillons().length===0&&M.saisiesEnCours.size===0,'« Enregistrer » : le lot est enregistré, la copie effacée');
  e.fermer();
}
{
  /* « Annuler » efface la copie */
  const e=ecran();
  TR.act(()=>{e.btn(/Modifier le lot/).props.onClick()});
  TR.act(()=>{e.champLot('CARRELAGE GRENIER').props.onChange({target:{value:'CARRELAGE'}})});
  chk(brouillons().length===1,'nouvelle frappe, nouvelle copie');
  TR.act(()=>{e.btn(/^Annuler$/).props.onClick()});
  chk(brouillons().length===0&&data.marches[0].lot==='CARRELAGE GRENIER','« Annuler » : la copie est effacée, rien n’est enregistré');
  /* revenir à la valeur d'origine efface aussi la copie */
  TR.act(()=>{e.btn(/Modifier le lot/).props.onClick()});
  TR.act(()=>{e.champLot('CARRELAGE GRENIER').props.onChange({target:{value:'X'}})});
  TR.act(()=>{e.champLot('X').props.onChange({target:{value:'CARRELAGE GRENIER'}})});
  chk(brouillons().length===0,'revenu à la valeur d’origine : plus rien à garder');
  e.fermer();
}
{
  /* « Jeter » demande confirmation */
  const e=ecran();
  TR.act(()=>{e.btn(/\+ Lot/).props.onClick()});
  const nouveau=e.tr.root.findAll(n=>n.type==='input'&&n.props.value==='')[0];
  TR.act(()=>{nouveau.props.onChange({target:{value:'PEINTURE'}})});
  chk(brouillons().length===1&&/:nouveau:/.test(brouillons()[0]),'un lot neuf aussi a sa copie');
  e.fermer();
  const e2=ecran();
  reponseConfirm=false;
  TR.act(()=>{e2.btn(/^Jeter$/).props.onClick()});
  chk(brouillons().length===1&&/Lot PEINTURE/.test(e2.t()),'« Jeter » refusé à la confirmation : la copie reste');
  reponseConfirm=true;
  TR.act(()=>{e2.btn(/^Jeter$/).props.onClick()});
  chk(brouillons().length===0&&!/Saisie non enregistrée retrouvée/.test(e2.t()),'« Jeter » confirmé : la copie est effacée');
  e2.fermer();
}
{
  /* les prospects aussi */
  let d={...M.EMPTY,prospects:[]}, tr;
  const props=()=>({data:d,save:x=>{d=x;TR.act(()=>{tr.update(React.createElement(M.Prospects,props()))})}});
  TR.act(()=>{tr=TR.create(React.createElement(M.Prospects,props()))});
  const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
  TR.act(()=>{btn(/\+ Prospect/).props.onClick()});
  const nom=tr.root.findAll(n=>n.type==='input'&&n.props.value==='')[0];
  TR.act(()=>{nom.props.onChange({target:{value:'Famille Fictive'}})});
  TR.act(()=>{tr.unmount()});
  TR.act(()=>{tr=TR.create(React.createElement(M.Prospects,props()))});
  chk(/Saisie non enregistrée retrouvée/.test(norm(texteInst(tr.root)))&&/Prospect Famille Fictive/.test(norm(texteInst(tr.root))),'prospect : la saisie retrouvée est proposée après le rechargement');
  TR.act(()=>{btn(/^Reprendre la saisie$/).props.onClick()});
  chk(tr.root.findAll(n=>n.type==='input'&&n.props.value==='Famille Fictive').length===1,'prospect : la saisie est reprise');
  TR.act(()=>{tr.unmount()});
}
fin();
