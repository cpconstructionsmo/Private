/* PV de réception, lot par lot (modèle CP Constructions, une page).
   - Rempli d'office : maître d'ouvrage (civilité, second maître d'ouvrage),
     adresse du chantier, entreprise, date et montant TTC du marché,
     avenants.
   - Signatures : tracée à l'écran, ou celle que l'entreprise (ou CP
     Constructions) a fournie, seulement quand son accord pour ce PV est
     noté ; le cachet accompagne la signature, jamais seul.
   - Le PV vit sur le chantier (ch.pvs[marcheId]) : chaque saisie
     s'enregistre aussitôt. Le Word part sur le Drive › PV de réception et
     s'ajoute à la pièce « PV de réception » du chantier.
   Données fictives. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');const fs=require('fs');
const M=charger(['pvDonnees','pvDe','pvSignataires','pvChargerImages','genererPvReceptionDocx','zipEntree','PvReception','EMPTY']);
const {chk,fin}=verif();
const IMG=new Uint8Array(fs.readFileSync(RACINE+'/assets/ptr/baes_evacuation.jpeg'));
const ch={id:'c1',nom:'Maison Fictive - Sainte-Cécile',client:'Fictif',adresse:'12 rue Fictive, 61000 Sainte-Cécile',prospectId:'p1',tva:20,docs:{}};
const art={id:'a1',nom:'SARL MAÇONNERIE FICTIVE'};
const m={id:'m1',numeroMarche:'2',lot:'MAÇONNERIE',artisanId:'a1',montantHT:28738,tva:20,dateSignature:'2026-03-15',
  avenants:[{id:'v1',numero:'1',dateSignature:'2026-05-01'},{id:'v2',numero:'2'}]};
let data={...M.EMPTY,chantiers:[ch],prospects:[{id:'p1',civilite:'M.',client:'Fictif',client2:'Fictive',civilite2:'Mme'}],artisans:[art],marches:[m]};

(async()=>{
  /* ---- 1) rempli d'office ---- */
  const d=M.pvDonnees(m,ch,data);
  chk(d.maitreOuvrage==='M. Fictif et Mme Fictive'&&d.adresse==='12 rue Fictive, 61000 Sainte-Cécile'&&d.entreprise==='SARL MAÇONNERIE FICTIVE',
    'maître d’ouvrage (civilité, second maître d’ouvrage), adresse du chantier, entreprise');
  chk(d.lotNumero==='2'&&d.intitule==='MAÇONNERIE'&&norm(d.marche)==='15/03/2026 — 34 485,60 € TTC','lot, intitulé, marché du 15/03/2026, montant TTC');
  chk(d.avenants==='1','avenants : seuls ceux signés ou rédigés (le n° 2, simple brouillon, n’y est pas)');
  chk(M.pvDonnees({...m,avenants:[]},ch,data).avenants==='aucun','sans avenant : « aucun »');
  chk(M.pvDonnees(m,{...ch,client:'Autre Client'},data).maitreOuvrage==='Autre Client','un client renommé sur le chantier l’emporte sur le prospect');

  /* ---- 2) qui signe, avec quelle image ---- */
  const pv0=M.pvDe(ch,'m1');
  let S=M.pvSignataires(pv0,art,data);
  chk(!S.moa&&!S.entreprise&&!S.cachetEntreprise&&!S.moe,'rien de signé : aucune image');
  const artV={...art,visa:{cachet:{id:'cach'},signature:{id:'sig'}}};
  S=M.pvSignataires(pv0,artV,data);
  chk(!S.entreprise&&!S.cachetEntreprise,'signature et cachet enregistrés : rien sans l’accord de l’entreprise pour ce PV');
  S=M.pvSignataires({...pv0,accordEntreprise:{le:'2026-11-12'}},artV,data);
  chk(S.entreprise&&S.entreprise.id==='sig'&&S.entreprise.source==='fournie'&&S.cachetEntreprise.id==='cach','accord noté : signature et cachet fournis');
  S=M.pvSignataires({...pv0,accordEntreprise:{le:'2026-11-12'},signatures:{entreprise:{id:'live',nom:'J. Maçon',qualite:'Entreprise',date:'2026-11-12T10:00:00Z'}}},artV,data);
  chk(S.entreprise.id==='live'&&S.entreprise.source==='ecran'&&S.cachetEntreprise.id==='cach','la signature tracée à l’écran prime, le cachet l’accompagne');
  const artUn={...art,visa:{cachet:{id:'ensemble'}}};
  chk(!M.pvSignataires(pv0,artUn,data).entreprise,'un fichier unique (cachet et signature ensemble) : rien sans l’accord');
  S=M.pvSignataires({...pv0,accordEntreprise:{le:'2026-11-12'}},artUn,data);
  chk(S.entreprise&&S.entreprise.id==='ensemble'&&S.entreprise.ensemble&&!S.cachetEntreprise,'avec l’accord : le fichier unique s’appose seul, en une image');
  S=M.pvSignataires({...pv0,signatures:{entreprise:{id:'live',nom:'J. Maçon',qualite:'Entreprise',date:'2026-11-12T10:00:00Z'}}},artUn,data);
  chk(S.entreprise.id==='live'&&!S.cachetEntreprise,'signée à l’écran : l’image « ensemble » (qui porte déjà une signature) ne s’y ajoute pas');
  const dCp={...data,cpVisa:{signature:{id:'cps'},cachet:{id:'cpc'}}};
  S=M.pvSignataires(pv0,art,dCp);
  chk(S.moe&&S.moe.id==='cps'&&S.cachetMoe.id==='cpc'&&S.moe.mention==='Visa apposé','visa de CP Constructions : apposé d’office dès que sa signature est enregistrée');
  chk(!M.pvSignataires({...pv0,visaCp:false},art,dCp).moe,'décoché sur un PV : pas de visa sur ce PV');
  S=M.pvSignataires(pv0,art,{...data,cpVisa:{cachet:{id:'cpc'}}});
  chk(S.moe&&S.moe.id==='cpc'&&S.moe.ensemble&&!S.cachetMoe,'visa CP en un seul fichier : apposé tel quel');

  /* ---- 3) le Word ---- */
  const pvPlein={...pv0,acheveLe:'2026-11-05',presence:'presente',decision:'avec',dateEffet:'2026-11-12',faitA:'Sainte-Cécile',faitLe:'2026-11-12',
    reserves:[{id:'r1',localisation:'Salle de pause',description:'Joint de carrelage à reprendre',avant:'2026-12-15'}]};
  const sigs=M.pvSignataires({...pvPlein,accordEntreprise:{le:'2026-11-12'},signatures:{moa:{id:'m',nom:'M. Fictif',qualite:'Client',date:'2026-11-12T10:00:00Z'}}},artV,data);
  const {images,manquantes}=await M.pvChargerImages(sigs,async id=>{if(id==='perdue')throw new Error('x');return IMG});
  chk(!manquantes.length&&images.moa.data&&images.entreprise.data&&images.cachetEntreprise.data,'images chargées : maître d’ouvrage, entreprise, cachet');
  const oct=await M.genererPvReceptionDocx(M.pvDonnees(m,ch,data,pvPlein),images);
  const lire=async f=>new TextDecoder().decode(await M.zipEntree(oct.buffer.slice(oct.byteOffset,oct.byteOffset+oct.byteLength),f));
  const xml=await lire('word/document.xml'), pied=await lire('word/footer1.xml');
  const texte=norm(xml.replace(/<[^>]+>/g,''));
  chk(['Procès-verbal de réception','M. Fictif et Mme Fictive','12 rue Fictive, 61000 Sainte-Cécile','SARL MAÇONNERIE FICTIVE',
    '15/03/2026 — 34 485,60 € TTC','05/11/2026','12/11/2026','Joint de carrelage à reprendre','15/12/2026','Fait à Sainte-Cécile, le 12/11/2026, en 2 exemplaires.']
    .every(x=>texte.indexOf(x)>=0),'le Word reprend tout : identités, marché, achèvement, date d’effet, réserve, fait à / le');
  chk(/☒<\/w:t><\/w:r><w:r>.{0,400}présente ou représentée/.test(xml)&&/☒<\/w:t>.{0,500}avec les réserves/.test(xml)&&/☐<\/w:t>.{0,500}sans réserve/.test(xml),
    'cases cochées : entreprise présente, réception avec réserves');
  chk((xml.match(/<w:drawing>/g)||[]).length===4,'quatre images : logo, signature du maître d’ouvrage, signature et cachet de l’entreprise');
  chk(/Signature fournie, accord donné le 12\/11\/2026/.test(texte)&&/M\. Fictif — Client/.test(texte),'chaque signature dit qui, en quelle qualité, et comment');
  chk(/Dossier : Maison Fictive - Sainte-Cécile/.test(pied)&&/PV de réception · Lot 2/.test(pied)&&/RCS Alençon 999 593 395/.test(pied),'pied de page : dossier, lot, mentions de CP Constructions');
  chk(/garanties de parfait achèvement \(1 an\)/.test(texte)&&/1792, 1792-3 et 1792-6/.test(texte),'le texte des garanties du modèle');
  const octE=await M.genererPvReceptionDocx(M.pvDonnees(m,ch,data,pvPlein),{entreprise:{data:IMG,nom:'SARL',qualite:'Entreprise',date:'2026-11-12',source:'fournie',ensemble:true}});
  const xE=new TextDecoder().decode(await M.zipEntree(octE.buffer.slice(octE.byteOffset,octE.byteOffset+octE.byteLength),'word/document.xml'));
  const ext=(xE.match(/name="Cachet et signature"[\s\S]*?<a:ext cx="(\d+)"/)||[])[1];
  chk(+ext>1250000,'l’image « cachet et signature » est apposée plus grande qu’une signature seule ('+ext+' EMU)');
  const vide=await M.genererPvReceptionDocx(M.pvDonnees({...m,avenants:[]},ch,data,pv0),{});
  const xv=new TextDecoder().decode(await M.zipEntree(vide.buffer.slice(vide.byteOffset,vide.byteOffset+vide.byteLength),'word/document.xml'));
  chk((xv.match(/<w:drawing>/g)||[]).length===1&&(xv.match(/☒/g)||[]).length===0&&/………… \/ ………… \/ ………………/.test(xv),'PV vierge : à remplir et signer à la main, rien de coché');

  /* ---- 4) l'écran : chaque saisie s'enregistre aussitôt sur le chantier ---- */
  let tr;
  const monter=()=>React.createElement(M.PvReception,{data,ch:data.chantiers[0],m,save});
  function save(n){data=n;TR.act(()=>{tr.update(monter())})}
  TR.act(()=>{tr=TR.create(monter())});
  const txt=()=>norm(texteInst(tr.root));
  chk(/M\. Fictif et Mme Fictive/.test(txt())&&/34 485,60 € TTC/.test(txt()),'l’écran annonce ce qui est rempli d’office');
  const pv=()=>data.chantiers[0].pvs.m1;
  const dates=tr.root.findAll(n=>n.type==='input'&&n.props.type==='date');
  TR.act(()=>{dates[0].props.onChange({target:{value:'2026-11-05'}})});
  chk(pv().acheveLe==='2026-11-05','« Achevé le » enregistré tout de suite');
  const bouton=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
  TR.act(()=>{bouton(/^\+ Réserve$/).props.onClick()});
  chk(pv().reserves.length===1&&pv().decision==='avec','une réserve ajoutée : la réception passe « avec réserves »');
  const accord=()=>tr.root.findAll(n=>n.type==='input'&&n.props.type==='checkbox'&&/accord pour ce PV/.test(norm(texteInst(n.parent))))[0];
  chk(accord()&&accord().props.disabled,'sans signature fournie, l’accord ne peut pas être coché');
  data={...data,artisans:[artV]};TR.act(()=>{tr.update(monter())});
  TR.act(()=>{accord().props.onChange({target:{checked:true}})});
  chk(pv().accordEntreprise&&pv().accordEntreprise.le,'accord de l’entreprise noté, avec sa date');
  await TR.act(async()=>{bouton(/Produire le PV de réception/).props.onClick()});
  for(let i=0;i<150&&!/PV déposé|Image illisible|impossible/.test(txt());i++)await TR.act(()=>new Promise(r=>setTimeout(r,20)));
  chk(pv().genere&&/drive\.google\.com/.test(pv().genere.lien)&&/^PV de réception — Lot 2 — MAÇONNERIE — Maison Fictive - Sainte-Cécile\.docx$/.test(pv().genere.nom),
    'le Word part sur le Drive, nommé d’après le lot');
  const docsPv=data.chantiers[0].docs.pv;
  chk(docsPv&&docsPv.fichiers.length===1&&docsPv.fichiers[0].nom===pv().genere.nom&&!docsPv.fait,'il s’ajoute à la pièce « PV de réception » du chantier (sans la cocher)');
  chk(/Image illisible, case laissée vide : signature de l’entreprise, cachet de l’entreprise/.test(txt()),'une image illisible est nommée : le PV sort quand même');
  for(let i=0;i<50&&!tr.root.findAll(n=>n.type==='a'&&n.props.download).length;i++)await TR.act(()=>new Promise(r=>setTimeout(r,10)));
  chk(/Dans ce PV — maître d’ouvrage : à signer à la main · entreprise : à signer à la main · CP Constructions : à signer à la main\./.test(txt()),
    'le message dit ce que porte le PV, colonne par colonne (images illisibles ici : rien d’apposé)');
  chk(!!tr.root.findAll(n=>n.type==='a'&&n.props.download)[0],'« ⬇ Télécharger le Word » : un vrai lien (Safari)');
  TR.act(()=>{tr.unmount()});
  fin();
})().catch(e=>{console.error(e);process.exit(1)});
