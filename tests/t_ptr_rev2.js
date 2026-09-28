/* Révision 2 du modèle : orthographe corrigée, propositions brique Biobric,
   tuile Edilians HP 20 et Aldes T.One AquaAIR (photos + fiches techniques).
   Une bibliothèque déjà enregistrée reçoit les corrections sans perdre les
   retouches ; un programme existant se met à jour sur demande seulement ;
   le passage au T.One signale le plancher chauffant devenu incohérent. */
const {charger,texteInst,norm,verif}=require('./harness');
const fs=require('fs');const React=require('react');const TR=require('react-test-renderer');
let confirmations=[];
const M=charger(['ProgrammeTechnique','ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','ptrNouveauProgramme','ptrProgrammePour',
  'ptrProjet','ptrControles','ptrSnapshotVariante','genererProgrammeDocx','zipEntree','EMPTY','PTR_SEED_DATE'],
  {confirm:m=>{confirmations.push(m);return true}});
const {chk,fin}=verif();
const txt=tr=>norm(texteInst(tr.root));
const btn=(tr,re)=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));

/* 1) le modèle livré */
const b=M.ptrBiblioInitiale();
const pr=id=>b.prestations.find(p=>p.id===id);
const fautes=b.prestations.flatMap(p=>M.ptrAlertesPrestation(p,b).filter(a=>/faute|accent|colle|dim:|espaces|unite/.test(a.cle)).map(a=>p.nom+' : '+a.msg));
chk(!fautes.length,'plus aucune faute ni titre sans accent dans le modèle'+(fautes.length?' — '+fautes.join(' | '):''));
chk(b.categories.some(c=>c.nom==='MAÇONNERIE')&&pr('pr_pompe_a_chaleur').nom==='POMPE À CHALEUR','catégories et titres accentués');
chk(!b.prestations.some(p=>p.variantes.some(v=>/0,20 cm/.test(v.texte))),'plus aucun « 0,20 cm » dans le modèle');
const vBrique=pr('pr_murs').variantes.find(v=>v.id==='var_murs_b');
chk(vBrique&&/bgv’thermo/.test(vBrique.texte)&&/R = 1,25 m²\.K\/W/.test(vBrique.texte)&&vBrique.photos.length===2&&vBrique.pieces[0].src==='asset','murs : proposition brique Biobric bgv’thermo, 2 photos, fiche produit');
const vTuile=pr('pr_couverture').variantes.find(v=>v.id==='var_couverture_b');
chk(vTuile&&/DOUBLE HP 20 Huguenot/.test(vTuile.texte)&&vTuile.photos.length===2&&vTuile.pieces.length===1,'couverture : proposition tuile Edilians Double HP 20 Huguenot');
const vTone=pr('pr_pompe_a_chaleur').variantes.find(v=>v.id==='var_pompe_a_chaleur_b');
chk(vTone&&vTone.nom==='Aldes T.One AquaAIR'&&/180 L/.test(vTone.texte)&&vTone.photos.length===2&&vTone.pieces.length===1,'chauffage : proposition Aldes T.One AquaAIR documentée');
chk(pr('pr_murs').variantes[0].parDefaut&&!vBrique.parDefaut,'les nouvelles propositions ne remplacent pas la proposition par défaut');
const tous=b.prestations.flatMap(p=>p.variantes).flatMap(v=>[...v.photos.map(x=>x.fichier),...v.pieces.map(x=>x.fichier)]);
const absents=tous.filter(f=>!fs.existsSync(RACINE+'/assets/ptr/'+f));
chk(!absents.length,'toutes les photos et fiches du modèle existent dans assets/ptr ('+tous.length+')'+(absents.length?' — manquent : '+absents.join(', '):''));

/* 2) une bibliothèque enregistrée avant la révision : on la vieillit */
const vieille=JSON.parse(JSON.stringify(b));
delete vieille.seedRev;
vieille.categories.find(c=>c.id==='cat_maconnerie').nom='MACONNERIE';
vieille.prestations.forEach(p=>{p.variantes=p.variantes.filter(v=>['var_murs_b','var_pointes_pignons_b','var_couverture_b','var_plancher_chauffant_b','var_revetements_sols_b'].indexOf(v.id)<0);
  p.variantes.forEach(v=>{v.version=1;v.modifieLe=M.PTR_SEED_DATE})});
const vMursA=vieille.prestations.find(p=>p.id==='pr_murs').variantes[0];
vMursA.texte='Maçonnerie en agglos creux de 0,20 cm d\'épaisseur ( R=0.20 m2.K/W)';
const pImpl=vieille.prestations.find(p=>p.id==='pr_implantation');
pImpl.variantes[0]={...pImpl.variantes[0],texte:'Implantation maison — texte CP retouché.',version:2,modifieLe:'2026-09-26T09:00:00.000Z'};
pImpl.variantes=pImpl.variantes.filter(v=>v.id!=='var_implantation_b');   /* supprimée par l'utilisateur */
const pPac=vieille.prestations.find(p=>p.id==='pr_pompe_a_chaleur');
pPac.variantes.find(v=>v.id==='var_pompe_a_chaleur_b').texte='Système de chauffage / traitement d’air ALDES T.One.';
const p={id:'p1',nom:'Maison Moualid - Valframbert',client:'Moualid',adresseClient:'1 rue',commune:'Valframbert'};
let data={...M.EMPTY,prospects:[p],ptrBiblio:vieille};
/* un programme créé avec l'ancienne bibliothèque, dont une ligne retouchée */
const prog=M.ptrNouveauProgramme(vieille,{prospectId:'p1'},'modele');
const lPoint=prog.lignes.find(l=>l.prestationId==='pr_pointes_pignons');
lPoint.texte=lPoint.texte.replace('20 cm','0,20 cm');   /* texte d'avant correction… */
lPoint.texte+='\nParticularité du projet.';lPoint.modifie=true;   /* …et retouché pour ce projet */
data={...data,programmes:[prog]};
const bm=M.ptrBiblio(data);
const prm=id=>bm.prestations.find(x=>x.id===id);
chk(bm.seedRev===22&&!/0,20 cm/.test(prm('pr_murs').variantes[0].texte)&&prm('pr_murs').variantes[0].version===3,'migration : la proposition jamais retouchée reçoit le texte corrigé (v3)');
chk(prm('pr_implantation').variantes[0].texte==='Implantation maison — texte CP retouché.','migration : une proposition retouchée par l’utilisateur n’est pas touchée');
chk(!prm('pr_implantation').variantes.some(v=>v.id==='var_implantation_b'),'migration : une proposition supprimée ne revient pas');
chk(prm('pr_murs').variantes.some(v=>v.id==='var_murs_b'&&!v.parDefaut)&&prm('pr_couverture').variantes.some(v=>v.id==='var_couverture_b'),'migration : brique et tuile HP 20 ajoutées à la bibliothèque existante');
chk(prm('pr_pompe_a_chaleur').variantes.find(v=>v.id==='var_pompe_a_chaleur_b').nom==='Aldes T.One AquaAIR','migration : la proposition T.One reçoit la documentation complète');
chk(bm.categories.find(c=>c.id==='cat_maconnerie').nom==='MAÇONNERIE','migration : « MACONNERIE » devient « MAÇONNERIE »');
chk(M.ptrBiblio(data)===bm,'la migration est calculée une seule fois (mémorisée)');

/* 3) le programme existant : mise à jour sur demande */
let tr;const cible={prospectId:'p1',chantierId:null};
const monter=()=>React.createElement(M.ProgrammeTechnique,{data,save:d=>{data=d;TR.act(()=>{tr.update(monter())})},cible});
TR.act(()=>{tr=TR.create(monter())});
chk(/La bibliothèque a évolué depuis la création de ce programme/.test(txt(tr)),'le programme signale que des textes corrigés sont disponibles');
const lMurs0=M.ptrProgrammePour(data,cible).lignes.find(l=>l.prestationId==='pr_murs');
chk(/0,20 cm/.test(lMurs0.texte),'rien n’est réécrit tant qu’on ne l’a pas demandé');
TR.act(()=>{btn(tr,/^Mettre à jour$/).props.onClick()});
let pg=M.ptrProgrammePour(data,cible);
chk(confirmations.length===1,'la mise à jour demande confirmation');
chk(!/0,20 cm/.test(pg.lignes.find(l=>l.prestationId==='pr_murs').texte),'après confirmation : texte des murs corrigé');
chk(/Particularité du projet/.test(pg.lignes.find(l=>l.prestationId==='pr_pointes_pignons').texte),'la ligne retouchée pour ce projet est conservée');
chk(pg.categories.find(c=>c.id==='cat_maconnerie').nom==='MAÇONNERIE','l’intitulé de catégorie du programme est corrigé');
chk(pg.lignes.find(l=>l.prestationId==='pr_implantation').texte==='Implantation maison — texte CP retouché.','l’implantation garde le texte de la bibliothèque de l’utilisateur');
chk(!/La bibliothèque a évolué/.test(txt(tr)),'le bandeau disparaît une fois la mise à jour faite');

/* 4) passage au T.One : cohérence plancher chauffant / chape */
const choisir=(prId,varId)=>{const l=M.ptrProgrammePour(data,cible).lignes.find(x=>x.prestationId===prId);
  const tete=tr.root.findAll(n=>n.type==='div'&&n.props.style&&n.props.style.background==='#F4F1EB'&&n.props.onClick)
    .find(n=>{let x=n.parent;return true});
  const carte=()=>tr.root.findAll(n=>n.type==='div'&&n.props.id==='ptr-l-'+l.id)[0];
  if(!carte())TR.act(()=>{btn(tr,/^Tout développer$/).props.onClick()});
  TR.act(()=>{carte().findAll(n=>n.type==='select')[0].props.onChange({target:{value:varId}})});
};
choisir('pr_pompe_a_chaleur','var_pompe_a_chaleur_b');
pg=M.ptrProgrammePour(data,cible);
let ctl=M.ptrControles(pg,M.ptrProjet(data,pg)).filter(c=>!c.ok).map(c=>c.cle);
chk(ctl.some(c=>/^tone-plancher:/.test(c))&&ctl.some(c=>/^tone-chape:/.test(c)),'T.One retenu : plancher chauffant et chape sur plancher chauffant signalés');
choisir('pr_plancher_chauffant','var_plancher_chauffant_b');
choisir('pr_revetements_sols','var_revetements_sols_b');
pg=M.ptrProgrammePour(data,cible);
ctl=M.ptrControles(pg,M.ptrProjet(data,pg)).filter(c=>!c.ok).map(c=>c.cle);
chk(!ctl.some(c=>/^tone-/.test(c)),'diffusion par air et chape sans plancher chauffant : plus d’alerte');
choisir('pr_murs','var_murs_b');choisir('pr_couverture','var_couverture_b');

(async()=>{
  pg=M.ptrProgrammePour(data,cible);
  const {octets,manquantes}=await M.genererProgrammeDocx(pg,M.ptrProjet(data,pg),M.ptrBiblio(data));
  fs.writeFileSync(SORTIE+'/rev2.docx',octets);
  chk(!manquantes.length,'photos brique, tuile et T.One embarquées dans le Word');
  const xml=new TextDecoder().decode(await M.zipEntree(octets.buffer.slice(octets.byteOffset,octets.byteOffset+octets.byteLength),'word/document.xml'));
  const brut=xml.replace(/<[^>]+>/g,'');
  chk(/bgv’thermo/.test(brut)&&/DOUBLE HP 20 Huguenot/.test(brut)&&/T\.One AquaAIR/.test(brut)&&/MAÇONNERIE/.test(brut),'le Word reprend les trois nouvelles prestations');
  /* ZIP : les trois fiches techniques en annexe */
  const blobs=[];global.URL.createObjectURL=x=>{blobs.push(x);return 'blob:x'};
  await TR.act(async()=>{btn(tr,/^Dossier ZIP$/).props.onClick();for(let i=0;i<60;i++)await new Promise(r=>setTimeout(r,5))});
  const z=blobs.find(x=>x.type==='application/zip');
  const noms=z?new TextDecoder('latin1').decode(new Uint8Array(await z.arrayBuffer())):'';
  chk(/Annexes\/Fiche_produit_Biobric_bgv_thermo_BGVT2031\.pdf/.test(noms)&&/Annexes\/Fiche_produit_Edilians_Double_HP_20_Huguenot\.pdf/.test(noms)&&/Annexes\/Documentation_Aldes_T_One_AIR_AquaAIR\.pdf/.test(noms),
    'le dossier ZIP contient les trois fiches techniques en annexe');
  chk(!/introuvable/.test(txt(tr)),'aucune pièce jointe introuvable');
  TR.act(()=>{tr.unmount()});
  fin();
})();
