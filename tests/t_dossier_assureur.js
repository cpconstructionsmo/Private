/* Le dossier de fin de chantier pour l'assureur dommages-ouvrage (PIÈCES ›
   Achèvement) : toutes les factures (entreprises, achats, maîtrise d'œuvre),
   les PV de réception et la DAACT, repris du chantier ; ce qui manque est
   dit sans bloquer ; une facture répartie sur deux lots n'y est qu'une fois ;
   le ZIP (noms en UTF-8, bonne extension, bordereau) se télécharge d'un vrai
   lien ; une pièce illisible sur le Drive est nommée ; le message est prêt à
   copier. Et le glisser-déposer d'une facture sur sa zone. Drive simulé ;
   données fictives. */
const fs=require('fs'), path=require('path');
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
const {chk,fin}=verif();
const PDF=t=>Buffer.from('%PDF-1.4 '+t);
const JPG=fs.readFileSync(path.join(__dirname,'..','assets','logo_signature.jpg'));
const M=charger(['DossierAssureur','Marches','EMPTY','dossierAssureurDe','dossierAssureurDonnees','dossierAssureurMail','dossierAssureurObjet',
  'dossierAssureurZip','dossierAssureurNomZip','zipEntrees','deduireAvoirMarche','dossierAssureurCopies'],{
  drive:{F1:PDF('f1'),AV:PDF('avoir'),R:PDF('repartie'),H1:PDF('hono'),PV1:Buffer.from('PK\x03\x04 word'),DA:PDF('daact'),ACH:JPG},
  fetch:async(url,init,base)=>/files\/F2\?alt=media/.test(url)
    ?{ok:false,status:404,json:async()=>({error:{code:404,message:'File not found: F2.',errors:[{reason:'notFound'}]}})}
    :base(url,init)});
const lien=id=>'https://drive.google.com/file/d/'+id+'/view';
const CH={id:'c1',nom:'Maison Fictive',adresse:'1 rue Fictive 61000 Alençon',client:'M. Fictif',tva:10,
  honoFactures:[{id:'h1',montant:1000,numero:'H-1',date:'2026-10-01',lien:lien('H1')},{id:'h2',montant:500,numero:'H-2',date:'2026-11-01'}],
  docs:{pv:{fichiers:[{id:'p1',nom:'PV de réception — PLÂTRERIE.docx',lien:lien('PV1')}]},daact:{fichiers:[{id:'d1',nom:'DAACT signée.pdf',lien:lien('DA')}]}},
  pvs:{m1:{genere:{nom:'PV.docx',lien:lien('PV1'),le:'2026-11-01'},dateEffet:'2026-11-01'}}};
const base=()=>({...M.EMPTY,chantiers:[CH],
  artisans:[{id:'a1',nom:'SARL Plâtre Fictive'},{id:'a2',nom:'EURL Bois Fictif'}],
  marches:[
    {id:'m1',chantierId:'c1',lot:'PLÂTRERIE',artisanId:'a1',montantHT:15133,tva:10,statut:'signe',factures:[
      {id:'f1',montant:10380,numero:'F-1',date:'2026-09-01',lien:lien('F1')},{id:'f2',montant:4753,numero:'F-2',date:'2026-10-01',lien:lien('F2')},
      {id:'f3',montant:-300,numero:'AV-7',date:'2026-11-02',lien:lien('AV')}]},
    {id:'m2',chantierId:'c1',lot:'CHARPENTE',artisanId:'a2',montantHT:1000,tva:10,statut:'signe',factures:[
      {id:'r1',montant:1000,numero:'FA-9',date:'2026-10-10',lien:lien('R'),repartition:{id:'rep1',totalHT:3000}}]},
    {id:'m3',chantierId:'c1',lot:'COUVERTURE',artisanId:'a2',montantHT:2000,tva:10,statut:'signe',factures:[
      {id:'r2',montant:2000,numero:'FA-9',date:'2026-10-10',lien:lien('R'),repartition:{id:'rep1',totalHT:3000}}]},
    {id:'mx',chantierId:'autre',lot:'AUTRE CHANTIER',artisanId:'a1',montantHT:9,statut:'signe',factures:[{id:'x',montant:9,lien:lien('X')}]}],
  commandes:[{id:'c1a',chantierId:'c1',fournisseur:'Négoce Fictif',factures:[{id:'a1f',montant:3591,numero:'N-5',date:'2026-09-15',lien:lien('ACH')}]}]});

(async()=>{
/* 1. ce que le dossier reprend */
{
  const data=base(), ch=data.chantiers[0], d=M.dossierAssureurDonnees(ch,data);
  const par=g=>d.fichiers.filter(x=>x.groupe===g).length;
  chk(par('marches')===4&&par('achats')===1&&par('honoraires')===1&&par('pv')===1&&par('daact')===1,
    'factures (4 entreprises, 1 achat, 1 maîtrise d’œuvre), le PV et la DAACT ; rien d’un autre chantier');
  chk(d.fichiers.filter(x=>/FA-9/.test(x.titre)).length===1&&/répartie sur CHARPENTE, COUVERTURE/.test(d.fichiers.find(x=>/FA-9/.test(x.titre)).titre),
    'la facture répartie sur deux lots n’y est qu’une fois, pour son total');
  const m=d.manquants.map(x=>norm(x.texte)).join(' | ');
  chk(/Facture H-2 — CP CONSTRUCTIONS du 01\/11\/2026 \(500,00 € HT\) : fichier non déposé/.test(m),'une facture sans fichier est nommée');
  chk(/PV de réception ni produit ni déposé signé pour : CHARPENTE, COUVERTURE/.test(m),'les lots signés sans PV sont nommés');
  const avecSigne={...ch,pvs:{...ch.pvs,m2:{signes:[{id:'s',nom:'PV signé.pdf',lien:lien('S'),le:'2026-11-12'}],dateEffet:'2026-11-12'}}};
  const dS=M.dossierAssureurDonnees(avecSigne,data);
  chk(/ni produit ni déposé signé pour : COUVERTURE \(/.test(dS.manquants.map(x=>x.texte).join(' | '))&&dS.recus.includes('2026-11-12'),
    'un PV déposé signé vaut PV : le lot n’est plus en manque, sa date de réception compte');
  chk(d.nonSoldes.length===1&&d.nonSoldes[0].reste===300,'le lot pas encore soldé (avoir non déduit) est signalé : le coût n’est pas définitif');
  chk(d.tot.marches.ht===1783300&&d.tot.achats.ht===359100&&d.tot.honoraires.ht===150000&&d.total.ht===2292400,
    'coût facturé : 17 833 + 3 591 + 1 500 = 22 924 € HT (avoir compris ; une facture sans fichier reste facturée)');
  chk(d.total.ttc===2536640,'TTC : travaux et achats à 10 %, maîtrise d’œuvre à 20 % (25 366,40 €)');
  const d2=M.dossierAssureurDonnees(ch,M.deduireAvoirMarche(data,'m1','f3'));
  chk(!d2.nonSoldes.length,'avoir déduit : plus de lot à solder');
}
/* 2. le message */
{
  const data=base(), ch={...data.chantiers[0],dossierAssureur:{police:'DO-123',assureur:'Assureur Fictif'}};
  const da=M.dossierAssureurDe(ch), d=M.dossierAssureurDonnees(ch,data,da), t=norm(M.dossierAssureurMail(d,da));
  chk(M.dossierAssureurObjet(d,da)==='Dossier de fin de travaux — Maison Fictive — contrat dommages-ouvrage n° DO-123','l’objet, avec le n° de contrat');
  chk(/sont achevés et réceptionnés le 01\/11\/2026\./.test(t)&&/maître d’ouvrage : M\. Fictif/.test(t),'la réception datée, le maître d’ouvrage');
  chk(/- la déclaration attestant l’achèvement et la conformité des travaux \(DAACT\) ;/.test(t)&&/- les procès-verbaux de réception \(1 fichier\) ;/.test(t)
    &&/- les factures des entreprises \(4\), des achats de matériaux \(1\) et de maîtrise d’œuvre \(1\)\./.test(t),'les pièces, famille par famille');
  chk(/Coût définitif de l’opération \(montants facturés\) : 22 924,00 € HT, soit 25 366,40 € TTC/.test(t),'le coût définitif');
  chk(/par WeTransfer/.test(t)&&/Cordialement,\nClaude PORTIER/.test(t),'WeTransfer, et la signature CP');
  const da2=M.dossierAssureurDe({...ch,dossierAssureur:{...ch.dossierAssureur,lienTransfert:'https://we.tl/t-fictif',groupes:{honoraires:false}}});
  const d3=M.dossierAssureurDonnees(ch,data,da2), t3=norm(M.dossierAssureurMail(d3,da2));
  chk(/à télécharger ici : https:\/\/we\.tl\/t-fictif/.test(t3),'le lien WeTransfer collé passe dans le message');
  chk(!d3.fichiers.some(x=>x.groupe==='honoraires')&&d3.total.ht===2142400&&!/maîtrise d’œuvre \(/.test(t3)&&!d3.manquants.some(x=>/H-2/.test(x.texte)),
    'honoraires décochés : ni fichiers, ni montant, ni manque');
}
/* 2 bis. en copie : soi-même, le(s) client(s), d'autres adresses ; jamais l'assureur */
{
  const data={...base(),expediteurMail:'moe@example.fr'};
  const ch={...data.chantiers[0],emailClient:'client@example.fr ; client2@example.fr',
    dossierAssureur:{email:'assureur@example.fr',copieAutres:'x@example.fr, Assureur@example.fr'}};
  const c=M.dossierAssureurCopies(ch,data);
  chk(c.liste.join()==='moe@example.fr,client@example.fr,client2@example.fr,x@example.fr','moi, les deux clients, l’autre adresse ; l’assureur jamais en copie');
  chk(M.dossierAssureurCopies(ch,base()).moi==='contact@cpconstructions.fr','sans adresse d’envoi réglée : celle de CP Constructions');
  chk(M.dossierAssureurCopies({...ch,dossierAssureur:{...ch.dossierAssureur,adresseMoi:'perso@example.fr'}},data).liste[0]==='perso@example.fr','mon adresse saisie l’emporte');
  chk(M.dossierAssureurCopies({...ch,dossierAssureur:{...ch.dossierAssureur,copieMoi:false,copieClient:false}},data).liste.join()==='x@example.fr','décochés : ni moi ni le client');
  const pr={...data,prospects:[{id:'p1',emailClient:'prospect@example.fr'}]};
  chk(M.dossierAssureurCopies({...ch,emailClient:'',prospectId:'p1'},pr).clients.join()==='prospect@example.fr','sans e-mail sur le chantier : celui du prospect');
  let tr, d2={...data,chantiers:[ch]};
  const monter=()=>React.createElement(M.DossierAssureur,{data:d2,ch:d2.chantiers[0],save:n=>{d2=n;TR.act(()=>tr.update(monter()))}});
  TR.act(()=>{tr=TR.create(monter())});
  const a=tr.root.findAll(n=>n.type==='a'&&/^mailto:/.test(n.props.href||''))[0];
  chk(a&&decodeURIComponent(a.props.href).includes('?cc=moe@example.fr,client@example.fr,client2@example.fr,x@example.fr&subject='),
    '« Ouvrir dans la messagerie » : les copies comprises');
  const t=norm(texteInst(tr.root));
  chk(/En copie : moe@example\.fr, client@example\.fr, client2@example\.fr, x@example\.fr\./.test(t)&&/Le client \(client@example\.fr, client2@example\.fr\)/.test(t)
    &&tr.root.findAll(n=>n.type==='button'&&/Copier les adresses/.test(norm(texteInst(n)))).length===1,'l’écran dit qui est en copie ; les adresses se copient (WeTransfer)');
  const caseClient=tr.root.findAll(n=>n.type==='input'&&n.props.type==='checkbox'&&/Le client/.test(norm(texteInst(n.parent))))[0];
  TR.act(()=>caseClient.props.onChange({target:{checked:false}}));
  chk(d2.chantiers[0].dossierAssureur.copieClient===false&&/En copie : moe@example\.fr, x@example\.fr\./.test(norm(texteInst(tr.root))),'décocher le client se garde');
  TR.act(()=>tr.unmount());
}
/* 3. le ZIP */
{
  const data=base(), ch=data.chantiers[0], d=M.dossierAssureurDonnees(ch,data);
  const r=await M.dossierAssureurZip(d,'j');
  const E=M.zipEntrees(r.octets.buffer.slice(r.octets.byteOffset,r.octets.byteOffset+r.octets.byteLength));
  const noms=E.map(e=>e.nom);
  chk(r.illisibles.length===1&&/F-2/.test(r.illisibles[0].titre)&&r.n===7,'la facture illisible sur le Drive est nommée, les 7 autres partent');
  chk(noms[0]==='0 - Bordereau des pièces.txt'&&E.every(e=>e.drapeaux&0x0800),'le bordereau en tête ; noms marqués UTF-8 (accents lisibles sur Mac)');
  chk(noms.includes('1 - Factures des entreprises/PLÂTRERIE — SARL Plâtre Fictive/2026-09-01 n° F-1 facture 10 380,00 € HT.pdf'),'facture : dossier du lot, date, numéro, montant');
  chk(noms.some(n=>/^1 - Factures des entreprises\/PLÂTRERIE — SARL Plâtre Fictive\/2026-11-02 n° AV-7 avoir -300,00 € HT\.pdf$/.test(n)),'l’avoir, nommé comme tel');
  chk(noms.some(n=>/^2 - Factures d’achats de matériaux\/Négoce Fictif\/.*\.jpg$/.test(n)),'une facture déposée en photo garde son extension (.jpg)');
  chk(noms.includes('4 - PV de réception/PV de réception — PLÂTRERIE.docx')&&noms.includes('5 - DAACT/DAACT signée.pdf'),'PV et DAACT sous leur nom');
  const bord=new TextDecoder().decode(E[0].data);
  chk(/Coût définitif \(montants facturés\)/.test(bord)&&/Pièces non jointes \(illisibles sur le Drive\)/.test(bord)&&/F-2/.test(bord),'le bordereau liste les pièces et dit ce qui manque');
  chk(M.dossierAssureurNomZip(d)==='Dossier de fin de travaux — Maison Fictive.zip','le nom du ZIP');
}
/* 4. à l'écran */
{
  let data=base(), tr;
  const monter=()=>React.createElement(M.DossierAssureur,{data,ch:data.chantiers[0],save});
  function save(n){data=n;TR.act(()=>tr.update(monter()))}
  TR.act(()=>{tr=TR.create(monter())});
  const t=()=>norm(texteInst(tr.root));
  const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
  chk(/Factures des entreprises — 4 fichiers/.test(t())&&/À compléter avant l’envoi \(rien ne bloque\)/.test(t()),'ce qui part, et ce qui manque');
  const champ=re=>tr.root.findAll(n=>n.type==='input'&&n.props.className==='in').find(n=>re.test(norm(texteInst(n.parent))));
  TR.act(()=>champ(/N° de contrat dommages-ouvrage/).props.onChange({target:{value:'DO-9'}}));
  chk(data.chantiers[0].dossierAssureur.police==='DO-9'&&/n° DO-9/.test(tr.root.findAll(n=>n.type==='input'&&n.props.readOnly)[0].props.value),'le n° de contrat se garde et passe dans l’objet');
  await TR.act(async()=>{await btn(/Préparer le dossier \(ZIP, 8 fichiers\)/).props.onClick()});
  for(let i=0;i<100&&!/Dossier prêt/.test(t());i++)await TR.act(()=>new Promise(r=>setTimeout(r,10)));
  chk(/✓ Dossier prêt : 7 fichiers et le bordereau des pièces/.test(t())&&/Non joints — illisibles sur le Drive/.test(t()),'prêt ; l’illisible est dit');
  const a=tr.root.findAll(n=>n.type==='a'&&n.props.download)[0];
  chk(a&&a.props.download==='Dossier de fin de travaux — Maison Fictive.zip','un vrai lien de téléchargement (Safari)');
  TR.act(()=>btn(/Noter l’envoi/).props.onClick());
  chk(/^\d{4}-\d{2}-\d{2}$/.test(data.chantiers[0].dossierAssureur.envoyeLe)&&/✓ Envoyé à l’assureur le/.test(t()),'l’envoi se note');
  TR.act(()=>tr.unmount());
}
/* 5. glisser une facture sur sa zone (MARCHÉS) */
{
  let data=base(), tr;
  data.marches[0].factures[1]={...data.marches[0].factures[1],lien:''};
  const ch=data.chantiers[0];
  const props=()=>({data,ch,save:d=>{data=d;TR.act(()=>{tr.update(React.createElement(M.Marches,props()))})},eng:0,fac:0,onFacturerCmd(){},onFacturerHono(){}});
  TR.act(()=>{tr=TR.create(React.createElement(M.Marches,props()))});
  const ev={stopPropagation(){},preventDefault(){}};
  const justifs=tr.root.findAll(n=>n.type==='button'&&n.props['aria-label']==='Voir le justificatif');
  TR.act(()=>justifs[1].props.onClick(ev));
  const zone=tr.root.findAll(n=>n.type==='label'&&n.props['aria-label']==='Importer la facture')[0];
  chk(!!zone&&/Glissez-la ici, ou cliquez pour la choisir/.test(norm(texteInst(zone))),'la facture sans fichier : une zone où la glisser');
  TR.act(()=>zone.props.onDragOver({...ev,dataTransfer:{types:['Files']}}));
  chk(/dashed/.test(tr.root.findAll(n=>n.type==='label'&&n.props['aria-label']==='Importer la facture')[0].props.style.border)
    &&tr.root.findAll(n=>n.type==='label'&&n.props['aria-label']==='Importer la facture')[0].props.style.background!=='transparent','au survol, la zone se colore');
  const f=new File([PDF('f2')],'facture F-2.pdf',{type:'application/pdf'});
  await TR.act(async()=>{await tr.root.findAll(n=>n.type==='label'&&n.props['aria-label']==='Importer la facture')[0].props.onDrop({...ev,dataTransfer:{files:[f]}})});
  for(let i=0;i<50&&!(data.marches[0].factures[1].lien);i++)await TR.act(()=>new Promise(r=>setTimeout(r,10)));
  chk(/drive\.google\.com\/file\/d\//.test(data.marches[0].factures[1].lien||''),'lâchée sur la zone : la facture part sur le Drive et se rattache');
  TR.act(()=>tr.unmount());
}
fin();
})().catch(e=>{console.error(e);process.exitCode=1});
