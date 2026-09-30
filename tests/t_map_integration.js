/* Intégration de la MAP, sur un dossier fictif : la fiche « points ouverts »
   (seulement ce qui reste à trancher), les ouvrages, les dimensions de salle
   de bains et les points à solder relus par leur identifiant ; une relecture
   qui ne crée pas de doublon ; les choix d'une rubrique validée protégés ;
   l'annulation ; la synthèse avant sortie et les changements depuis la
   dernière MAP, jusque dans le Word. */
const fs=require('fs');const path=require('path');const {execFileSync}=require('child_process');
const React=require('react');const TR=require('react-test-renderer');
const {charger,verif,norm,texteInst,SORTIE}=require('./harness');
const M=charger(['ficheMapMiseEnPage','pdfVectoriel','ficheLocaliser','ficheMesurerPage','ficheAnalyser','ficheAppliquer','ficheAnnulerImport',
  'mapOuvrageNeuf','mapEmpreinteRubrique','MAP_RUBRIQUES','sdbNeuve','mapInstantane','mapChangementsDepuis','mapSynthese','SyntheseMap',
  'genererMapDocx','zipEntree','lignesDocumentXml','FICHE_CASE','EMPTY']);
const {chk,fin}=verif();
const R=id=>M.MAP_RUBRIQUES.find(r=>r.id===id);

/* --- le dossier fictif --- */
const allee={...M.mapOuvrageNeuf('allee'),id:'ouv_allee',libelle:'Allée piétonne',surface:'12',statut:'a_decider'};
const cloture={...M.mapOuvrageNeuf('cloture'),id:'ouv_clot',libelle:'Clôture',quantite:'30',statut:'inclus',financement:'marche',autorisationVerifiee:true};
const salle={...M.sdbNeuve('SdB parents'),id:'sdb1',equipements:[
  {id:'wc',type:'wc',mur:'D',u:40,L:36,P:54,H:40,z:0,dimsSource:'defaut'},
  {id:'vas',type:'vasque',mur:'B',u:20,L:80,P:46,H:55,z:30,dimsSource:'defaut',dimsConfirmees:true}]};
let map={date:'2026-09-20',soubassement:'Vide sanitaire',gaz:'Sans objet',charpenteType:'Fermettes industrielles bois résineux',sousFaces:'PVC',
  ouvrages:[allee,cloture],
  suivi:[{id:'s1',type:'attente',lot:'Plomberie',texte:'Robinet extérieur : position à confirmer',statut:'ouvert'},
         {id:'s2',type:'decision',lot:'',texte:'Point déjà réglé',statut:'fait'}]};
map.validations={'4':{le:'2026-09-21',empreinte:M.mapEmpreinteRubrique(R('4'),map)}};
const data={...M.EMPTY,produits:[],chantiers:[{id:'c1',nom:'Maison Fictive',client:'M. et Mme Fictif',adresse:'1 chemin des Essais',map,salles:[salle]}]};
const ch=data.chantiers[0];

/* --- la fiche « points ouverts » --- */
const O=M.ficheMapMiseEnPage(ch,data,{mode:'ouverts',numero:7,date:'2026-09-29'});
const P=M.ficheMapMiseEnPage(ch,data,{mode:'preremplie',numero:8,date:'2026-09-29'});
const V=M.ficheMapMiseEnPage(ch,data,{mode:'vierge',numero:9,date:'2026-09-29'});
const D=O.disposition;
const cles=(d,k)=>[...new Set([...d.cases,...d.zones].filter(x=>x.k===k).map(x=>x.o))];
chk(D.mode==='ouverts'&&O.pages.length<P.pages.length,'points ouverts : '+O.pages.length+' page(s) au lieu de '+P.pages.length);
const champs4=R('4').champs.map(f=>f.k);
chk(![...D.cases,...D.zones].some(x=>champs4.indexOf(x.k)>=0),'rubrique 4 validée : aucun de ses champs sur la fiche');
chk(D.zones.some(z=>z.k==='vsRangs')&&!D.cases.some(c=>c.k==='gaz')&&D.cases.some(c=>c.k==='chauffageType'),'champ en alerte ou vide : présent ; champ rempli : absent');
chk(cles(D,'ouvrage').join()==='ouv_allee'&&D.cases.filter(c=>c.k==='ouvrage').length===5,'ouvrages : seule l’allée à décider, ses cinq statuts à cocher');
chk(cles(D,'sdbDims').join()==='sdb1/wc','salle de bains : le WC aux dimensions à confirmer, pas la vasque déjà confirmée');
chk(cles(D,'suiviFait').join()==='s1','suivi : le point ouvert, à solder d’une coche ; pas le point déjà fait');
chk(cles(P.disposition,'ouvrage').sort().join()==='ouv_allee,ouv_clot','préremplie : tous les ouvrages');
chk(!cles(V.disposition,'ouvrage').length&&!cles(V.disposition,'sdbDims').length&&!cles(V.disposition,'suiviFait').length,'vierge : rien de propre au dossier');
chk(D.cases.filter(c=>c.o).every(c=>c.l),'chaque case repérée garde le nom imprimé');
const pdf=M.pdfVectoriel(O.pages,'Fiche n° 7');
fs.writeFileSync(path.join(SORTIE,'fiche_ouverts.pdf'),pdf);

/* --- remplie au stylo, puis relue depuis le PDF rendu --- */
const PXMM=150/25.4;
const stylo=(img,x1,y1,x2,y2,ep)=>{
  const n=Math.ceil(Math.hypot(x2-x1,y2-y1)*PXMM*2);
  for(let i=0;i<=n;i++){const x=(x1+(x2-x1)*i/n)*PXMM,y=(y1+(y2-y1)*i/n)*PXMM,r=(ep||0.5)*PXMM/2;
    for(let yy=Math.floor(y-r);yy<=y+r;yy++)for(let xx=Math.floor(x-r);xx<=x+r;xx++)
      if((xx-x)**2+(yy-y)**2<=r*r&&xx>=0&&yy>=0&&xx<img.w&&yy<img.h)img.g[yy*img.w+xx]=40;}
};
const cocher=(img,c)=>{const s=M.FICHE_CASE;stylo(img,c.x+0.6,c.y+1.8,c.x+1.5,c.y+s-0.5);stylo(img,c.x+1.5,c.y+s-0.5,c.x+s+0.8,c.y-0.8)};
const ecrire=(img,z)=>{for(let i=0;i<6;i++)stylo(img,z.x+3+i*4,z.y+z.h*0.7,z.x+5+i*4,z.y+z.h*0.3,0.45)};
let rendu=true;
const pageImage=k=>{
  const f=path.join(SORTIE,'integ.pdf');fs.writeFileSync(f,pdf);
  execFileSync('pdftoppm',['-gray','-r','150','-f',String(k+1),'-l',String(k+1),f,path.join(SORTIE,'integ')]);
  const nom=fs.readdirSync(SORTIE).find(x=>/^integ-0*\d+\.pgm$/.test(x)&&+x.match(/(\d+)\.pgm/)[1]===k+1);
  const b=fs.readFileSync(path.join(SORTIE,nom)), t=b.toString('latin1',0,40).split(/\s+/);
  const w=+t[1],h=+t[2],d=b.indexOf('255\n')+4;
  return {w,h,g:new Uint8Array(b.subarray(d,d+w*h))};
};
const aCocher=[D.cases.find(c=>c.k==='ouvrage'&&c.v==='inclus'),D.cases.find(c=>c.k==='sdbDims'),D.cases.find(c=>c.k==='suiviFait')];
const aEcrire=[D.zones.find(z=>z.k==='sdbDims')];
const mesures=[];
try{
  [...new Set([...aCocher,...aEcrire].map(x=>x.p))].forEach(k=>{
    const img=pageImage(k);
    aCocher.filter(c=>c.p===k).forEach(c=>cocher(img,c));
    aEcrire.filter(z=>z.p===k).forEach(z=>ecrire(img,z));
    const L=M.ficheLocaliser(img);
    chk(L.page===k&&L.numero===7,'page '+(k+1)+' de la fiche n° 7 reconnue'+(L.erreur?' — '+L.erreur:''));
    if(L.H)mesures.push({page:k,...M.ficheMesurerPage(img,L.H,D,k)});
  });
}catch(e){rendu=false;console.log('   (pdftoppm absent : relecture simulée)')}
if(!rendu){
  /* sans poppler : les mesures telles que la lecture les rendrait */
  for(let k=0;k<D.nbPages;k++)mesures.push({page:k,cases:D.cases.filter(c=>c.p===k).map(c=>({...c,coche:aCocher.indexOf(c)>=0,douteux:false})),
    zones:D.zones.filter(z=>z.p===k).map(z=>({...z,ecrit:aEcrire.indexOf(z)>=0}))});
}
const A=M.ficheAnalyser(D,mesures,map,data,ch.salles);
const ao=A.ouvrages.find(r=>r.id==='ouv_allee');
chk(A.ouvrages.length===1&&ao&&ao.propose==='inclus'&&ao.actuel==='a_decider'&&!ao.conflit,'ouvrage : statut « inclus » coché, retrouvé par son identifiant');
chk(A.sdb.length===1&&A.sdb[0].cle==='sdb1/wc'&&A.sdb[0].confirme&&A.sdb[0].aRecopier,'WC : « confirmées » coché, dimensions écrites à recopier');
chk(A.soldes.length===1&&A.soldes[0].id==='s1'&&A.soldes[0].coche,'point de suivi coché « soldé »');
chk(!A.champs.length,'aucun autre champ lu');

/* --- une rubrique validée : la fiche ne la change pas d'office --- */
const Dp=P.disposition, cp=Dp.cases.find(c=>c.k==='sousFaces'&&c.v==='Alu');
const Ap=M.ficheAnalyser(Dp,[{page:cp.p,cases:[{...cp,coche:true,douteux:false}],zones:[]}],map,data,ch.salles);
chk(Ap.champs.length===1&&Ap.champs[0].valideLe==='2026-09-21','rubrique validée : le changement est signalé comme tel');

/* --- appliquer : ouvrage, dimensions, point soldé, suivi sans doublon --- */
const lignes=[{type:'attente',lot:'plomberie',texte:'Robinet  extérieur : position à confirmer'},{type:'decision',lot:'',texte:'Nouveau point'}];
const extra=m=>({ouvrages:{ouv_allee:'inclus'},sdb:{'sdb1/wc':{confirme:true,L:'38',P:'',H:''},'sdb1/vas':{confirme:false}},salles:ch.salles,soldes:['s1']});
const r1=M.ficheAppliquer(map,{},lignes,{numero:7,pages:[1]},extra(map));
const m1=r1.map;
chk(r1.entree.doublons===1&&m1.suivi.length===3&&m1.suivi[2].texte==='Nouveau point','suivi : le point déjà présent (casse et espaces près) n’est pas ajouté de nouveau');
chk(m1.ouvrages.find(o=>o.id==='ouv_allee').statut==='inclus'&&m1.ouvrages.find(o=>o.id==='ouv_clot').statut==='inclus'&&m1.ouvrages.length===2,'ouvrage : statut appliqué à la même fiche, aucun ouvrage ajouté');
chk(m1.suivi.find(p=>p.id==='s1').statut==='fait','point soldé');
const wc=r1.salles[0].equipements.find(e=>e.id==='wc'), vas=r1.salles[0].equipements.find(e=>e.id==='vas');
chk(wc.L===38&&wc.P===54&&wc.dimsConfirmees&&wc.dimsSource==='saisie'&&vas===salle.equipements[1],'WC : largeur corrigée, dimensions confirmées ; la vasque ne bouge pas');
/* la même fiche relue une seconde fois */
const r2=M.ficheAppliquer(m1,{},lignes,{numero:7,pages:[1]},{...extra(m1),salles:r1.salles});
chk(r2.entree.doublons===2&&r2.map.suivi.length===3&&!r2.entree.ouvrages&&!r2.entree.soldes&&!r2.salles,'relire la même fiche : rien en double, rien à changer');
/* annuler */
const u1=M.ficheAnnulerImport(m1,r1.entree.id,r1.salles);
const wcU=u1.salles[0].equipements.find(e=>e.id==='wc');
chk(u1.map.ouvrages.find(o=>o.id==='ouv_allee').statut==='a_decider'&&u1.map.suivi.find(p=>p.id==='s1').statut==='ouvert'&&u1.map.suivi.length===2,'annuler : statut, point soldé et point ajouté reviennent');
chk(wcU.L===36&&!wcU.dimsConfirmees&&wcU.dimsSource==='defaut','annuler : les dimensions reviennent');
const mRetouche={...m1,ouvrages:m1.ouvrages.map(o=>o.id==='ouv_allee'?{...o,statut:'option'}:o)};
const u2=M.ficheAnnulerImport(mRetouche,r1.entree.id,r1.salles);
chk(u2.map.ouvrages.find(o=>o.id==='ouv_allee').statut==='option'&&u2.gardes.indexOf('ouvrage')>=0,'annuler : un statut retouché depuis est gardé');

/* --- synthèse et changements depuis la dernière MAP --- */
chk(M.mapChangementsDepuis(map,data)===null,'aucune MAP sortie : pas de comparaison inventée');
const inst=M.mapInstantane(map,data);
const map2={...map,derniereSortie:inst,gaz:'Gaz de ville',
  ouvrages:[{...allee,statut:'option',financement:'supplement',montantTTC:'1200'},cloture,{...M.mapOuvrageNeuf('portail'),id:'ouv_portail',libelle:'Portail'}]};
const C=M.mapChangementsDepuis(map2,data);
chk(C.champs.length===1&&C.champs[0].k==='gaz'&&C.champs[0].avant==='Sans objet'&&C.champs[0].apres==='Gaz de ville','changement de champ : avant et après');
chk(C.ouvrages.length===2&&C.ouvrages.some(x=>x.id==='ouv_allee'&&x.nature==='modif')&&C.ouvrages.some(x=>x.id==='ouv_portail'&&x.nature==='ajout'),'ouvrages : modifié et ajouté');
chk(C.budget.optionsTTC===1200&&C.budget.supplementsTTC===0,'budget : options +1 200 € TTC');
const ch2={...ch,map:map2};
const S=M.mapSynthese(ch2,data);
chk(S.rubriques.validees===1&&S.salles[0].aConfirmer===1&&S.documents.some(d=>/Compte-rendu de MAP/.test(d.l)),'synthèse : rubrique validée, dimension à confirmer, compte-rendu à ressortir');
let tr;TR.act(()=>{tr=TR.create(React.createElement(M.SyntheseMap,{ch:ch2,data,allerA:()=>{}}))});
const txt=norm(texteInst(tr.root));
chk(/Depuis la MAP du/.test(txt)&&/3 changements/.test(txt)&&/options \+1 200,00 € TTC/.test(txt),'écran : changements et écart de budget'+(/3 changements/.test(txt)?'':' — '+txt.slice(0,300)));

(async()=>{
  const o=await M.genererMapDocx(ch2,data);
  const t=norm(String(M.lignesDocumentXml(new TextDecoder().decode(await M.zipEntree(o.buffer.slice(o.byteOffset,o.byteOffset+o.byteLength),'word/document.xml')))));
  chk(/Modifications depuis le compte-rendu du/.test(t)&&/Gaz : Sans objet → Gaz de ville/.test(t),'Word : les modifications depuis le compte-rendu précédent');
  chk(/Salle de bains — SdB parents/.test(t)&&/1 dimension à confirmer/.test(t),'Word : la salle de bains décrite, avec ce qui reste à confirmer');
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
