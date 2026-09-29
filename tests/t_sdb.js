/* Salle de bains : un modèle, toutes les vues. Surfaces (union des zones,
   ouvertures déduites, retours ajoutés), quantités (pose facturée sur le
   net, fourniture avec chute arrondie à la boîte), calepinage, contrôles
   (collisions, porte, espace devant, dimensions à confirmer, variante),
   vues et PDF issus des mêmes dimensions, documents à actualiser. */
const fs=require('fs');const path=require('path');const React=require('react');const TR=require('react-test-renderer');
const {charger,verif,texteInst,norm,SORTIE}=require('./harness');
const M=charger(['sdbNeuve','sdbBoite','sdbSurfacesMur','sdbQuantites','sdbCalepinage','sdbControles','sdbLierVariante','sdbPlan','sdbElevation','sdb3d',
  'sdbPagesPdf','pdfVectoriel','sdbEmpreinte','sdbDocumentsAActualiser','sdbBudget','sdbAireUnion','SalleDeBains','receveursVersProduits','EMPTY']);
const {chk,fin}=verif();

chk(M.sdbAireUnion([{u0:0,u1:100,z0:0,z1:100},{u0:50,u1:150,z0:0,z1:100}])===15000,'deux zones qui se chevauchent : comptées une fois');

const s={...M.sdbNeuve('SdB'),L:250,P:200,H:250,
  ouvertures:[{id:'f',type:'fenetre',mur:'A',u:100,largeur:60,hauteur:75,allege:120,retours:15},{id:'p',type:'porte',mur:'C',u:20,largeur:73,hauteur:204,ouvre:'interieur',charniere:'gauche'}],
  equipements:[{id:'n1',type:'niche',mur:'B',u:40,L:30,P:10,H:30,z:120},{id:'wc',type:'wc',mur:'D',u:40,L:36,P:54,H:40,z:0,dimsSource:'defaut'}]};
s.faience={...s.faience,carreau:{L:30,H:60,ep:8,orientation:'portrait',joint:2,departU:'centre',departZ:'sol'},chute:10,m2ParBoite:1.44,
  zones:[{id:'z1',mur:'A',u0:0,u1:250,z0:0,z1:210},{id:'z2',mur:'A',u0:0,u1:100,z0:100,z1:210},{id:'z3',mur:'B',u0:0,u1:200,z0:0,z1:200}]};
const A=M.sdbSurfacesMur(s,'A');
chk(A.brute===5.25,'mur A : 250 × 210 = 5,25 m² (la zone incluse ne compte pas deux fois)');
chk(A.deductions.length===1&&A.deductions[0].m2===0.45,'fenêtre 60 × 75 déduite : 0,45 m²');
chk(A.retours.length===1&&A.retours[0].m2===0.32,'retours du tableau (2 × 75 + 60) × 15 cm = 0,315 m² (0,32 arrondi), ajoutés explicitement');
const B=M.sdbSurfacesMur(s,'B');
chk(B.brute===4&&B.retours.length===1&&B.retours[0].m2===0.12&&B.nette===4.12,'mur B : 4 m² + retours de niche 2 × (30 + 30) × 10 = 0,12 m²');
chk(B.profilsMl===2,'profils : le haut de la zone sous plafond (2 m)');
const q=M.sdbQuantites(s);
chk(q.poseM2===Math.round((A.nette+B.nette)*100)/100,'pose facturée : la surface nette');
chk(q.commandeM2===Math.round(q.poseM2*1.1*100)/100&&q.boites===Math.ceil(q.commandeM2/1.44)&&q.fournitureM2===q.boites*1.44,'fourniture : chute 10 %, arrondie à la boîte de 1,44 m²');
chk(q.reserveM2>0&&q.poseM2<q.fournitureM2,'la réserve de carreaux n’augmente pas la surface de pose');
chk(M.sdbQuantites({...s,faience:{...s.faience,m2ParBoite:''}}).boites===null,'sans conditionnement : pas de nombre de boîtes inventé');

const cp=M.sdbCalepinage(s,{u0:0,u1:100,z0:0,z1:100});
chk(cp.w===30&&cp.h===60&&cp.joint===0.2,'carreau 30 × 60 posé vertical, joint 2 mm');
chk(cp.colonnes.length===5&&cp.petites.length===2&&cp.entiers===3,'zone de 100 cm, départ centré : 5 colonnes, deux coupes de moins de 5 cm signalées');

/* contrôles */
const c0=M.sdbControles(s,M.EMPTY);
chk(c0.some(a=>a.niveau==='info'&&/WC : dimensions à confirmer/.test(a.msg)),'WC sans variante : dimensions à confirmer');
const s2={...s,equipements:[...s.equipements,{id:'r',type:'receveur',x:0,y:120,L:120,P:80,H:3,z:0},{id:'b',type:'rangement',mur:'C',u:10,L:60,P:40,H:180,z:0}]};
const c2=M.sdbControles(s2,M.EMPTY);
chk(c2.some(a=>/se chevauchent/.test(a.msg)),'rangement posé sur le receveur : chevauchement signalé');
chk(c2.some(a=>/gêne l’ouverture de la porte/.test(a.msg)),'rangement dans le débattement de la porte : signalé');
const s3={...s,equipements:[{id:'wc',type:'wc',mur:'D',u:40,L:36,P:54,H:40,z:0},{id:'v',type:'vasque',mur:'B',u:0,L:200,P:200,H:55,z:30}]};
chk(M.sdbControles(s3,M.EMPTY).some(a=>/dépasse|empiète|libres/.test(a.msg)),'vasque démesurée : dépassement ou espace devant le WC signalé');
chk(!M.sdbControles(s,M.EMPTY).some(a=>/conforme/i.test(a.msg)),'aucun contrôle n’annonce une conformité');

/* variante du catalogue : ses dimensions */
const pr=M.receveursVersProduits([],'acquabella_compact_granite').produits[0];
const data={...M.EMPTY,produits:[pr]};
const v=pr.variantes.find(x=>x.cle==='acq-granite-140x90-blanc')||pr.variantes[0];
const e=M.sdbLierVariante({id:'r',type:'receveur',L:120,P:80,H:3},data,pr.id,v.id);
chk(e.L===v.longueur&&e.P===v.largeur&&e.H===v.hauteur/10&&e.dimsSource==='variante','lier une variante : ses dimensions s’appliquent ('+e.L+' × '+e.P+' × '+e.H+')');
chk(M.sdbControles({...s,equipements:[{...e,L:100}]},data).some(a=>/différentes de la variante/.test(a.msg)),'dimensions modifiées à la main : écart avec la variante signalé');

/* vues : mêmes dimensions */
const s4={...s,equipements:[...s.equipements,e]};
const b=M.sdbBoite(s4,e);
const plan=M.sdbPlan(s4,{x:0,y:0,w:180,h:140});
const r=plan.els.find(x=>x.t==='rect'&&x.c&&Math.abs(x.w-(b.x1-b.x0)*plan.k)<0.01&&Math.abs(x.h-(b.y1-b.y0)*plan.k)<0.01);
chk(!!r,'plan : le receveur dessiné à ses dimensions');
const el=M.sdbElevation(s4,'A',{x:0,y:0,w:180,h:130});
chk(el.els.filter(x=>x.t==='trait').length>10&&el.els.some(x=>x.t==='texte'&&/Fenêtre 60 × 75/.test(x.s)),'élévation A : joints du calepinage et fenêtre');
const d3=M.sdb3d(s4,{x:0,y:0,w:180,h:120},{az:35,el:28});
chk(d3.els.filter(x=>x.t==='poly').length>=8&&d3.els.some(x=>x.t==='texte'&&/Volumes simplifiés/.test(x.s)),'3D : faces dessinées, limite indiquée');

/* PDF et documents à actualiser */
(async()=>{
  const logo={jpeg:new Uint8Array(fs.readFileSync(path.join(__dirname,'..','assets','logo_fiche.jpg'))),w:600,h:395};
  const pages=M.sdbPagesPdf({nom:'Maison Exemple'},s4,data,logo);
  const o=M.pdfVectoriel(pages,'x');
  fs.writeFileSync(path.join(SORTIE,'sdb.pdf'),o);
  const txt=Buffer.from(o).toString('latin1');
  chk(pages.length===4&&txt.startsWith('%PDF')&&/ h (B|f)\n/.test(txt)&&txt.indexOf('(SALLE DE BAINS \x97 PLAN COT\xc9)')>0,'PDF : 4 pages, polygones, titres');
  const doc={le:'2026-09-29',empreinte:M.sdbEmpreinte(s4)};
  chk(!M.sdbDocumentsAActualiser({...s4,documents:[doc]}).length,'document produit sur ce modèle : à jour');
  chk(M.sdbDocumentsAActualiser({...s4,L:260,documents:[doc]}).length===1,'une cote changée : le document est à actualiser');
  const bA=M.sdbBudget({equipements:[{type:'receveur',montantTTC:450},{type:'vasque',montantTTC:''},{type:'prise'}]});
  chk(bA.totalTTC===450&&bA.aChiffrer===1,'budget : 450 € connus, 1 équipement à chiffrer (les réseaux ne comptent pas)');

  let enreg=null,tr;
  const ch={id:'c1',nom:'Maison Exemple',salles:[s4]};
  TR.act(()=>{tr=TR.create(React.createElement(M.SalleDeBains,{data,ch,up:p=>{enreg=p},onFermer:()=>{}}))});
  const bouton=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
  chk(/Plan coté/.test(norm(texteInst(tr.root))),'écran : l’outil s’affiche');
  TR.act(()=>{bouton(/Dupliquer en variante/).props.onClick()});
  chk(enreg&&enreg.salles.length===2&&enreg.salles[1].groupe===s4.id&&/variante B/.test(enreg.salles[1].nom)&&enreg.salles[1].id!==s4.id,'dupliquer en variante : même groupe, nouvel identifiant');
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
