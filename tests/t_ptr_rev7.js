/* Révision 7 : option « décoration en enduit imitation pierre » (surface et
   localisation à préciser) ; non incluse d'office ; ajoutée aux
   bibliothèques existantes ; bloque le contrôle tant qu'il reste des
   « [à préciser] ». */
const {charger,texteInst,norm,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['ProgrammeTechnique','ptrBiblio','ptrBiblioInitiale','ptrNouveauProgramme','ptrProgrammePour','ptrProjet','ptrControles','ptrAlertesLigne','EMPTY']);
const {chk,fin}=verif();
const r6=biblioRev('rev6');
const b=M.ptrBiblioInitiale();
const pr=b.prestations.find(p=>p.id==='pr_enduit_decoratif_pierre');
const maco=b.prestations.filter(p=>p.categorieId==='cat_maconnerie').sort((x,y)=>x.ordre-y.ordre).map(p=>p.id);
chk(!!pr&&pr.optionnelle&&maco[maco.indexOf('pr_revetements_exterieurs')+1]==='pr_enduit_decoratif_pierre','nouvelle prestation en MAÇONNERIE, juste après les revêtements extérieurs, marquée « option »');
const v=pr.variantes[0];
chk(/Surface : \[à préciser\] m²/.test(v.texte)&&/Localisation : \[à préciser\]/.test(v.texte)&&v.photos.length===2&&v.photos.every(ph=>fs.existsSync(RACINE+'/assets/ptr/'+ph.fichier)),'texte avec surface et localisation à préciser, deux photos');
chk(pr.montantDefaut.type==='suivant_devis'&&pr.defautMO,'Lot MO, montant « Suivant devis »');
/* bibliothèque enregistrée en révision 6, MAÇONNERIE réordonnée par l'utilisateur */
const vieille=JSON.parse(JSON.stringify(r6));
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:vieille});
const pm=m.prestations.find(p=>p.id==='pr_enduit_decoratif_pierre');
const maxOrdre=Math.max(...vieille.prestations.filter(p=>p.categorieId==='cat_maconnerie').map(p=>p.ordre));
const revExt=vieille.prestations.find(p=>p.id==='pr_revetements_exterieurs');
chk(m.seedRev===22&&!!pm&&pm.ordre===revExt.ordre+0.5,'bibliothèque de révision 6 : l’option est ajoutée juste après les revêtements extérieurs');
const supprimee=M.ptrBiblio({...M.EMPTY,ptrBiblio:{...JSON.parse(JSON.stringify(m)),seedRev:7,prestations:m.prestations.filter(p=>p.id!=='pr_enduit_decoratif_pierre')}});
chk(!supprimee.prestations.some(p=>p.id==='pr_enduit_decoratif_pierre'),'supprimée par l’utilisateur, elle ne revient pas');
/* nouveau programme : l'option est là, non incluse */
let data={...M.EMPTY,prospects:[{id:'p1',nom:'Maison Moualid',client:'Moualid',commune:'Valframbert'}]};
let tr;const cible={prospectId:'p1',chantierId:null};
const monter=()=>React.createElement(M.ProgrammeTechnique,{data,save:d=>{data=d;TR.act(()=>{tr.update(monter())})},cible});
TR.act(()=>{tr=TR.create(monter())});
TR.act(()=>{tr.root.findAll(n=>n.type==='button'&&norm(texteInst(n))==='Créer le programme technique')[0].props.onClick()});
let pg=M.ptrProgrammePour(data,cible);
let l=pg.lignes.find(x=>x.prestationId==='pr_enduit_decoratif_pierre');
chk(!!l&&!l.incluse,'nouveau programme : l’option figure, non incluse');
chk(!M.ptrControles(pg,M.ptrProjet(data,pg)).some(c=>/^apreciser:/.test(c.cle)),'non incluse, elle ne bloque pas le contrôle');
/* on l'inclut : contrôle et alerte tant que surface / localisation manquent */
TR.act(()=>{tr.root.findAll(n=>n.type==='button'&&norm(texteInst(n))==='Tout développer')[0].props.onClick()});
const carte=()=>tr.root.findAll(n=>n.type==='div'&&n.props.id==='ptr-l-'+l.id)[0];
TR.act(()=>{carte().findAll(n=>n.type==='input'&&n.props.type==='checkbox')[0].props.onChange({target:{checked:true}})});
pg=M.ptrProgrammePour(data,cible);l=pg.lignes.find(x=>x.id===l.id);
chk(l.incluse&&M.ptrControles(pg,M.ptrProjet(data,pg)).some(c=>/^apreciser:/.test(c.cle)&&!c.ok),'incluse : le contrôle avant export signale surface et localisation à préciser');
chk(M.ptrAlertesLigne(l).some(a=>a.cle==='apreciser'),'et la ligne affiche la vérification recommandée');
const zone=carte().findAll(n=>n.type==='textarea'&&/\[à préciser\]/.test(n.props.value||''))[0];
TR.act(()=>{zone.props.onChange({target:{value:zone.props.value.replace('Surface : [à préciser] m²','Surface : 18 m²').replace('Localisation : [à préciser]','Localisation : pignon est et soubassement de la façade avant')}})});
TR.act(()=>{carte().findAll(n=>n.type==='textarea'&&/Surface : 18 m²/.test(n.props.value||''))[0].props.onBlur()});
pg=M.ptrProgrammePour(data,cible);l=pg.lignes.find(x=>x.id===l.id);
chk(/Surface : 18 m²/.test(l.texte)&&!M.ptrControles(pg,M.ptrProjet(data,pg)).some(c=>/^apreciser:/.test(c.cle)),'complétée à la main pour le projet : plus d’alerte');
TR.act(()=>{tr.unmount()});
fin();
