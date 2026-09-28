/* MAP : ouvrants à la française (PVC / ALU / MIXTE, option OB) et
   coulissants (PVC / ALU / MIXTE) en cases à cocher ; une MAP saisie avec
   l'ancienne liste reste lisible. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['MAP','mapLignes','EMPTY']);
const {chk,fin}=verif();
let ch={id:'c1',nom:'Maison Moualid',map:{menuiseriesOuvrant:['Ouvrant à la française / OB'],menuiseriesRal:'7012'}};
const data={...M.EMPTY,chantiers:[ch]};
let tr;
const monter=()=>React.createElement(M.MAP,{data,ch,up:p=>{ch={...ch,...p};TR.act(()=>{tr.update(monter())})}});
TR.act(()=>{tr=TR.create(monter())});
const txt=()=>norm(texteInst(tr.root));
const t0=txt();
chk(/OUVRANTS/.test(t0)&&/Ouvrants à la française/.test(t0)&&/Ouvrants coulissants/.test(t0)&&/Option : OB/.test(t0),'bloc OUVRANTS : à la française (avec option OB) et coulissants');
chk(!/Coulissant\(s\)/.test(t0.replace(/Saisie précédente[^—]*/,'')),'plus de bouton « Coulissant(s) »');
chk(/Saisie précédente : Ouvrant à la française \/ OB/.test(t0),'ancienne saisie rappelée tant que rien n’est coché');
const cases=()=>tr.root.findAll(n=>n.type==='input'&&n.props.type==='checkbox');
const lab=n=>{let p=n.parent;while(p&&p.type!=='label')p=p.parent;return p?norm(texteInst(p)):''};
const groupe=titre=>{const d=tr.root.findAll(n=>n.type==='div'&&n.children.length&&n.children[0].type==='div'&&norm(texteInst(n.children[0]))===titre)[0];
  return d.findAll(n=>n.type==='input'&&n.props.type==='checkbox')};
const fr=groupe('Ouvrants à la française'), co=groupe('Ouvrants coulissants');
chk(fr.map(lab).join('|')==='PVC|ALU|MIXTE|Option : OB (oscillo-battant)'&&co.map(lab).join('|')==='PVC|ALU|MIXTE','cases PVC / ALU / MIXTE (+ OB pour la française)');
TR.act(()=>{groupe('Ouvrants à la française')[0].props.onChange({target:{checked:true}})});
TR.act(()=>{groupe('Ouvrants à la française')[2].props.onChange({target:{checked:true}})});
TR.act(()=>{groupe('Ouvrants à la française')[3].props.onChange({target:{checked:true}})});
TR.act(()=>{groupe('Ouvrants coulissants')[1].props.onChange({target:{checked:true}})});
chk(ch.map.ouvrantsFrancaiseMat.join()==='PVC,MIXTE'&&ch.map.ouvrantsFrancaiseOB===true&&ch.map.ouvrantsCoulissantMat.join()==='ALU'&&ch.map.menuiseriesRal==='7012','cases enregistrées, autres champs conservés');
TR.act(()=>{groupe('Ouvrants à la française')[0].props.onChange({target:{checked:false}})});
chk(ch.map.ouvrantsFrancaiseMat.join()==='MIXTE','décocher retire le matériau');
chk(!/Saisie précédente/.test(txt()),'l’ancienne saisie disparaît une fois les cases cochées');
const s5=M.mapLignes(ch,data).find(([t])=>/^5\./.test(t))[1];
const v=l=>(s5.find(([x])=>x===l)||[])[1];
chk(v('Ouvrants à la française')==='MIXTE — option OB'&&v('Ouvrants coulissants')==='ALU'&&v('Ouvrants')===undefined,'compte-rendu : ouvrants par type, sans l’ancienne ligne');
const ancien=M.mapLignes({map:{menuiseriesOuvrant:['Coulissant(s)']}},data).find(([t])=>/^5\./.test(t))[1];
chk(ancien.some(([l,x])=>l==='Ouvrants'&&x==='Coulissant(s)'),'MAP ancienne : la saisie d’origine reste dans le compte-rendu');
TR.act(()=>{tr.unmount()});
fin();
