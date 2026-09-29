/* Comptes rendus de chantier : préparation d'une réunion à partir de la
   précédente (présents, points non soldés reportés), reprise des
   non-conformités du contrôle, Word produit avec ses photos, recherche et
   fusion entre deux appareils. */
const fs=require('fs');const path=require('path');const React=require('react');const TR=require('react-test-renderer');
const {charger,verif,texteInst,norm,RACINE,SORTIE}=require('./harness');
const M=charger(['crNouveau','crIntervenants','crNonConformites','crGroupes','crOuvert','crEtat','crNomFichier','crLotsChantier',
  'genererCrDocx','zipEntree','lignesDocumentXml','rechercheIndex','rechercher','fusionnerDonnees','ComptesRendus','EMPTY']);
const {chk,fin}=verif();

const data={...M.EMPTY,
  artisans:[{id:'a1',nom:'Maçonnerie Durand',corps:'Gros œuvre'},{id:'a2',nom:'Élec Martin',corps:'Électricité'}],
  marches:[{id:'m1',chantierId:'c1',artisanId:'a1',lot:'Gros œuvre'},{id:'m2',chantierId:'c1',artisanId:'a2',lot:'Électricité'},
    {id:'m3',chantierId:'c1',artisanId:'a1',lot:'Enduits'},{id:'m4',chantierId:'autre',artisanId:'a2',lot:'Plomberie'}],
  chantiers:[{id:'c1',nom:'Maison Exemple',client:'M. et Mme Exemple',adresse:'1 rue du Test, 61000 Alençon',
    controles:{'terrassement.fouilles':{statut:'non_conforme',note:'eau en fond de fouille',photos:['ph9']},
      'terrassement.implant':{statut:'conforme'}}}]};
const ch=data.chantiers[0];

/* --- premier compte rendu --- */
const cr1=M.crNouveau(ch,data);
chk(cr1.numero===1&&!cr1.points.length,'premier compte rendu : n° 1, sans point');
const noms=cr1.presents.map(p=>p.nom+' / '+p.qualite);
chk(noms.length===4&&/Exemple \/ Maître d’ouvrage/.test(noms[0])&&/Maître d’œuvre/.test(noms[1]),'présents : le client, puis le maître d’œuvre');
chk(noms.some(n=>n==='Maçonnerie Durand / Lot Gros œuvre, Enduits')&&noms.some(n=>n==='Élec Martin / Lot Électricité'),
  'une ligne par entreprise, avec tous ses lots ; rien d’un autre chantier');
chk(cr1.presents.every(p=>p.presence===''),'la présence reste à cocher');

/* --- la réunion a lieu : points consignés --- */
cr1.date='2026-09-01';cr1.prochaine={date:'2026-09-15',heure:'09:30'};
cr1.presents[0].presence='P';
cr1.points=[
  {id:'o1',type:'observation',lot:'Gros œuvre',texte:'Élévation des murs terminée'},
  {id:'d1',type:'decision',lot:'',texte:'Enduit teinte ton pierre retenu'},
  {id:'x1',type:'action',lot:'Électricité',texte:'Fournir le plan des réservations',resp:'Élec Martin',echeance:'2026-09-10',fait:false,photos:['ph1']},
  {id:'x2',type:'action',lot:'Gros œuvre',texte:'Nettoyer les abords',resp:'Maçonnerie Durand',fait:true,faitLe:'2026-09-01'},
  {id:'r1',type:'reserve',lot:'Gros œuvre',texte:'Fissure sur l’appui de la fenêtre du séjour',resp:'Maçonnerie Durand',fait:false},
];
ch.comptesRendus=[cr1];
const avant=JSON.stringify(cr1);

/* --- le suivant --- */
const cr2=M.crNouveau(ch,data);
chk(cr2.numero===2,'deuxième compte rendu : n° 2');
chk(cr2.date==='2026-09-15'&&cr2.heure==='09:30','date et heure : celles annoncées au compte rendu précédent');
chk(cr2.presents.length===4&&cr2.presents.every(p=>p.presence==='')&&cr2.presents[0].nom==='M. et Mme Exemple','mêmes personnes, présence à recocher');
chk(cr2.points.length===2&&cr2.points.every(p=>p.depuis===1),'seuls l’action non soldée et la réserve sont reportées, depuis le n° 1');
chk(cr2.points.map(p=>p.suivi).join()==='x1,r1'&&cr2.points.every(p=>p.id!=='x1'&&p.id!=='r1'),'chaque point reporté garde le lien avec son origine, sous un nouvel identifiant');
chk(cr2.points.every(p=>!(p.photos||[]).length),'les photos restent dans le compte rendu où elles ont été prises');
chk(JSON.stringify(cr1)===avant,'le compte rendu précédent n’est pas modifié');
chk(M.crEtat(cr2.points[0],cr2)==='En retard'&&M.crEtat(cr1.points[3],cr1)==='Soldé le 01/09/2026'&&M.crEtat(cr1.points[0],cr1)==='',
  'état : en retard après l’échéance, soldé avec sa date, rien pour une observation');

cr2.points[0].fait=true;
cr2.points.push({id:'x3',type:'action',lot:'Enduits',texte:'Échantillon d’enduit',resp:'Maçonnerie Durand',fait:false});
ch.comptesRendus=[cr1,cr2];
const cr3=M.crNouveau(ch,data);
chk(cr3.numero===3&&cr3.points.length===2&&cr3.points.find(p=>p.suivi==='r1').depuis===1&&cr3.points.find(p=>p.suivi==='x3').depuis===2,
  'au n° 3 : la réserve garde son numéro d’origine, le point soldé n’est plus reporté');

/* --- non-conformités du contrôle --- */
const nc=M.crNonConformites(ch,cr2);
chk(nc.length===1&&nc[0].type==='reserve'&&nc[0].lot==='Terrassement'&&/eau en fond de fouille/.test(nc[0].texte)&&nc[0].photos[0]==='ph9',
  'la non-conformité du contrôle devient une réserve, avec sa note et sa photo');
chk(!M.crNonConformites(ch,{...cr2,points:[...cr2.points,...nc]}).length,'déjà reprise : elle n’est pas ajoutée deux fois');

/* --- ordre des rubriques --- */
const ordre=M.crLotsChantier(ch,data);
chk(ordre.join()==='Gros œuvre,Électricité,Enduits','les lots du chantier, dans l’ordre des marchés');
const g=M.crGroupes([...cr1.points,{id:'z',lot:'Abords',texte:'x'},...nc],ordre).map(x=>x[0]);
chk(g.join()==='Généralités,Gros œuvre,Électricité,Abords,Terrassement','généralités, puis les lots des marchés, puis les autres par ordre alphabétique');

/* --- le Word --- */
const jpeg=fs.readFileSync(path.join(__dirname,'fixtures','paysage.jpg'));
(async()=>{
  const lire=async pid=>{if(pid==='ph1')return new Uint8Array(jpeg);throw new Error('absente')};
  const cr1b={...cr1,points:[...cr1.points,{id:'r9',type:'reserve',lot:'Gros œuvre',texte:'Photo perdue',photos:['perdue']}]};
  const octets=await M.genererCrDocx(ch,cr1b,ordre,lire);
  fs.writeFileSync(path.join(SORTIE,'compte_rendu.docx'),octets);
  const ab=octets.buffer.slice(octets.byteOffset,octets.byteOffset+octets.byteLength);
  const xml=new TextDecoder().decode(await M.zipEntree(ab,'word/document.xml'));
  const rels=new TextDecoder().decode(await M.zipEntree(ab,'word/_rels/document.xml.rels'));
  const texte=norm(String(M.lignesDocumentXml(xml)));
  chk(/COMPTE RENDU DE CHANTIER/.test(texte)&&/N° 1 — réunion du 01\/09\/2026/.test(texte),'Word : titre, numéro et date');
  chk(/M\. et Mme Exemple/.test(texte)&&/1 rue du Test/.test(texte)&&/15\/09\/2026 à 09:30/.test(texte),'Word : client, adresse, prochaine réunion');
  chk(/Présent/.test(texte)&&/Maçonnerie Durand/.test(texte),'Word : tableau des présents');
  const i0=texte.indexOf('Observations, décisions'),iG=texte.indexOf('Généralités',i0),iGO=texte.indexOf('Gros œuvre',i0),iE=texte.indexOf('Électricité',i0);
  chk(i0>0&&iG>i0&&iG<iGO&&iGO<iE,'Word : points par lot, dans l’ordre');
  chk(/RÉSERVE — Fissure sur l’appui/.test(texte)&&/DÉCISION — Enduit teinte/.test(texte),'Word : la nature de chaque point en tête');
  chk(/Soldé le 01\/09\/2026/.test(texte)&&/À faire/.test(texte),'Word : l’état des actions');
  chk(/Photo 1 — Électricité : Fournir le plan/.test(texte)&&/Photo 1\b/.test(texte),'Word : la photo, légendée et appelée depuis son point');
  chk(/rId301/.test(rels)&&/cr_photo_1\.jpeg/.test(rels)&&!/cr_photo_2/.test(rels),'Word : une seule image jointe (la photo introuvable est ignorée)');
  chk(/huit jours/.test(texte),'Word : la mention de fin');
  chk(M.crNomFichier(ch,cr2)==='CR n°02 — Maison Exemple — 2026-09-15.docx','nom du fichier');

  /* --- recherche --- */
  const R=M.rechercher(M.rechercheIndex({...data,chantiers:[ch]}),'fissure appui');
  chk(R[0]&&R[0].type==='cr'&&R[0].aller.onglet==='cr'&&R[0].aller.id==='c1','recherche : un mot d’un point ouvre l’onglet COMPTES RENDUS');

  /* --- deux appareils complètent le même compte rendu --- */
  const base={...data,chantiers:[{...ch,comptesRendus:[cr2]}]};
  const avecPoint=(d,pt)=>({...d,chantiers:d.chantiers.map(c=>({...c,comptesRendus:c.comptesRendus.map(r=>({...r,points:[...r.points,pt]}))}))});
  const nous=avecPoint(base,{id:'n1',type:'observation',texte:'Vu au bureau'});
  const eux=avecPoint(base,{id:'e1',type:'observation',texte:'Vu sur le chantier'});
  const f=M.fusionnerDonnees(base,nous,eux);
  const ids=f.chantiers[0].comptesRendus[0].points.map(p=>p.id);
  chk(ids.includes('n1')&&ids.includes('e1')&&ids.length===cr2.points.length+2,'fusion : les points ajoutés sur deux appareils sont tous gardés');

  /* --- l'écran --- */
  let enreg=null;
  const ch0={...data.chantiers[0],comptesRendus:[]};
  const d0={...data,chantiers:[ch0]};
  let tr;
  TR.act(()=>{tr=TR.create(React.createElement(M.ComptesRendus,{data:d0,ch:ch0,save:d=>{enreg=d}}))});
  const bouton=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
  chk(/Aucun compte rendu/.test(norm(texteInst(tr.root))),'écran : aucun compte rendu au départ');
  TR.act(()=>{bouton(/\+ Compte rendu/).props.onClick()});
  const cree=enreg&&enreg.chantiers[0].comptesRendus;
  chk(cree&&cree.length===1&&cree[0].numero===1&&cree[0].presents.length===4,'écran : « + Compte rendu » enregistre le n° 1 avec ses présents');
  const ch1={...ch0,comptesRendus:cree};
  TR.act(()=>{tr.update(React.createElement(M.ComptesRendus,{data:{...d0,chantiers:[ch1]},ch:ch1,save:d=>{enreg=d}}))});
  const t1=norm(texteInst(tr.root));
  chk(/COMPTE RENDU N° 1/.test(t1)&&/PRÉSENTS ET CONVOQUÉS/.test(t1)&&/Non-conformités du contrôle \(1\)/.test(t1),'écran : le compte rendu ouvert, et la reprise du contrôle proposée');
  TR.act(()=>{bouton(/Non-conformités du contrôle/).props.onClick()});
  const pts=enreg.chantiers[0].comptesRendus[0].points;
  chk(pts.length===1&&pts[0].type==='reserve','écran : la non-conformité ajoutée en réserve');
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
