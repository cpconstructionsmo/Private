/* Révision 4 : textes réécrits (syntaxe), murs standard en blocs béton
   rectifiés B60 type ELIBLOC avec fiche et photo. Une bibliothèque déjà
   enregistrée reçoit les nouveaux textes là où le texte est resté celui
   d'origine (même si photos ou réglages ont été retouchés), jamais là où
   l'utilisateur a réécrit le texte. */
const {charger,texteInst,norm,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const React=require('react');const TR=require('react-test-renderer');
const M=charger(['ProgrammeTechnique','ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','ptrNouveauProgramme','ptrProgrammePour','EMPTY']);
const {chk,fin}=verif();
/* la bibliothèque initiale telle que livrée par une version précédente */
const seedDe=f=>biblioRev(f.replace('.html',''));
const r1=seedDe('rev1.html'), r3=seedDe('rev3.html');
const b=M.ptrBiblioInitiale();
const V=(bib,id)=>bib.prestations.flatMap(p=>p.variantes).find(v=>v.id===id);

/* 1) le modèle révisé */
const mA=V(b,'var_murs_a');
chk(/blocs béton creux \*\*rectifiés\*\*, classe \*\*B60\*\*/.test(mA.texte)&&/ELIBLOC d’Alkern ou équivalent|ELIBLOC d'Alkern ou équivalent/.test(mA.texte)&&/DTU 20\.1/.test(mA.texte),'murs standard : blocs béton rectifiés B60, type ELIBLOC ou équivalent');
chk(mA.photos.length===3&&mA.photos[0].fichier==='bloc_elibloc.jpeg'&&mA.pieces.length===1&&/ELIBLOC/.test(mA.pieces[0].nom),'avec la photo du bloc et la fiche produit Alkern');
chk(fs.existsSync(RACINE+'/assets/ptr/bloc_elibloc.jpeg')&&fs.existsSync(RACINE+'/assets/ptr/'+mA.pieces[0].fichier),'fichiers présents dans assets/ptr');
chk(mA.version===3,'la proposition standard des murs passe en version 3');
const alertes=b.prestations.flatMap(p=>M.ptrAlertesPrestation(p,b).filter(a=>/faute|accent|colle|dim:|espaces|unite/.test(a.cle)).map(a=>p.nom+' : '+a.msg));
chk(!alertes.length,'aucune faute signalée dans tout le modèle'+(alertes.length?' — '+alertes.join(' | '):''));
chk(/^Restent à la charge du Maître de l'Ouvrage/.test(V(b,'var_preparation_terrain_a').texte),'préparation du terrain : phrase reconstruite');
const minuscules=b.prestations.flatMap(p=>p.variantes).filter(v=>/\b(le|du|au) maître d'(œuvre|ouvrage)/.test(v.texte)).map(v=>v.id);
chk(!minuscules.length,'« Maître d’Œuvre » et « Maître de l’Ouvrage » écrits de façon homogène'+(minuscules.length?' — '+minuscules.join(', '):''));

/* 2) une bibliothèque enregistrée en révision 3, jamais retouchée */
const bib3=JSON.parse(JSON.stringify(r3));
const m3=M.ptrBiblio({...M.EMPTY,ptrBiblio:bib3});
const diff=b.prestations.flatMap(p=>p.variantes).filter(v=>{const w=V(m3,v.id);return w&&w.texte!==v.texte}).map(v=>v.id);
chk(m3.seedRev===22&&!diff.length,'révision 3 → 22 : tous les textes non retouchés reçoivent la nouvelle rédaction'+(diff.length?' — restent : '+diff.join(', '):''));

/* 3) révision 3 retouchée : photos des murs changées (texte intact),
      implantation réécrite par l'utilisateur */
const bib3b=JSON.parse(JSON.stringify(r3));
const mur3=V(bib3b,'var_murs_a');
mur3.photos=[mur3.photos[0],{id:'ph_perso',src:'drive',fileId:'abc',nom:'chantier.jpg',w:1600,h:1200,ext:'jpeg',mode:'contain',fx:.5,fy:.5}];
mur3.version=3;mur3.modifieLe='2026-09-26T16:00:00.000Z';
const imp3=V(bib3b,'var_implantation_a');imp3.texte='Implantation — texte réécrit par CP.';imp3.version=3;imp3.modifieLe='2026-09-26T16:00:00.000Z';
const m3b=M.ptrBiblio({...M.EMPTY,ptrBiblio:bib3b});
const mm=V(m3b,'var_murs_a');
chk(/\*\*B60\*\*/.test(mm.texte)&&mm.version===4,'murs aux photos retouchées : le texte passe aux blocs B60 (v4)');
chk(mm.photos[0].fichier==='bloc_elibloc.jpeg'&&mm.photos.some(p=>p.id==='ph_perso')&&mm.photos.length===3,'la photo du bloc s’ajoute, les photos de l’utilisateur restent');
chk(mm.pieces.some(p=>/ELIBLOC/.test(p.nom))&&mm.marque==='Alkern','la fiche produit et la marque sont ajoutées');
chk(V(m3b,'var_implantation_a').texte==='Implantation — texte réécrit par CP.','un texte réécrit par l’utilisateur n’est jamais remplacé');

/* 4) bibliothèque de révision 1 dont seules les photos ont changé */
const bib1=JSON.parse(JSON.stringify(r1));delete bib1.seedRev;
const f1=V(bib1,'var_fondations_a');f1.photos=[];f1.version=2;f1.modifieLe='2026-09-26T09:30:00.000Z';
const m1=M.ptrBiblio({...M.EMPTY,ptrBiblio:bib1});
chk(V(m1,'var_fondations_a').texte===V(b,'var_fondations_a').texte&&V(m1,'var_fondations_a').photos.length===0,'révision 1, photos retirées : le texte est mis à jour, les photos restent retirées');

/* 5) un programme créé en révision 3 : mise à jour proposée */
let data={...M.EMPTY,prospects:[{id:'p1',nom:'Maison Moualid',client:'Moualid',commune:'Valframbert'}],ptrBiblio:JSON.parse(JSON.stringify(r3))};
const prog=M.ptrNouveauProgramme(r3,{prospectId:'p1'},'modele');
data={...data,programmes:[prog]};
let tr;const cible={prospectId:'p1',chantierId:null};
const monter=()=>React.createElement(M.ProgrammeTechnique,{data,save:d=>{data=d;TR.act(()=>{tr.update(monter())})},cible});
TR.act(()=>{tr=TR.create(monter())});
chk(/La bibliothèque a évolué/.test(norm(texteInst(tr.root))),'le programme propose de reprendre la nouvelle rédaction');
TR.act(()=>{tr.root.findAll(n=>n.type==='button'&&norm(texteInst(n))==='Mettre à jour')[0].props.onClick()});
const lm=M.ptrProgrammePour(data,cible).lignes.find(l=>l.prestationId==='pr_murs');
chk(/\*\*B60\*\*/.test(lm.texte)&&(lm.pieces||[]).some(p=>/ELIBLOC/.test(p.nom))&&lm.photos.length===3,'après mise à jour : murs en blocs B60 avec fiche et photo dans le programme');
TR.act(()=>{tr.unmount()});
fin();
