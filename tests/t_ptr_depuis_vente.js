/* Programme technique › créer « Depuis le chiffrage vendu » : le chiffrage
   remis au client (PDF ou Word) se dépose dès la création ; le programme part
   du modèle, prend le type d'ouvrage vendu (ERP), garde la vente et ouvre
   aussitôt le rapprochement. « Appliquer toutes les propositions » fait d'un
   clic ce qui se proposait ligne à ligne, sans exclure les lignes à
   confirmer ni remplacer un texte retouché. Chiffrage et chantier fictifs. */
const {charger,texteInst,norm,verif}=require('./harness');
const React=require('react');const TR=require('react-test-renderer');
let confirmes=[];
const M=charger(['ProgrammeTechnique','ptrRapprochement','ptrAppliquerToutVente','ptrBiblioInitiale','ptrNouveauProgramme',
  'ptrProgrammePour','venteLignes','fabriquerDocx','par','DOC_ENTETE_XML','EMPTY'],{confirm:m=>{confirmes.push(m);return true}});
const {chk,fin}=verif();

const NOTICE=['Isolation intérieure par doublage Optima en 120 mm (envisagé)',
  'Chauffage par pompe à chaleur air/air de type T-One AquaAIR de chez Aldes (envisagé)',
  'Porte d’entrée en acier laqué Abscisse EVO de chez Bel’m (envisagé)',
  'Fourniture et pose d’un enrobé noir 0/10 pour une surface de 60 m² environ (envisagé)',
  'Equipement d’alarme (incendie) type 4 avec déclencheur manuel près de la sortie',
  'Bloc autonome d’éclairage de sécurité d’évacuation, dans chaque bureau ainsi que l’entrée',
  'Dossier ERP 5, établissement recevant du public',
  'Établissement du dossier de permis de construire (PC)'];
const WORD='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const docx=async paras=>M.fabriquerDocx(M.DOC_ENTETE_XML+'<w:body>'+paras.map(p=>M.par(p)).join('')+'</w:body></w:document>','Chiffrage fictif');
const b=M.ptrBiblioInitiale();

/* 1. la fonction : tout ce qui se propose, sauf exclure et réécrire un texte retouché */
const L=M.venteLignes('1. NOTICE de PRESENTATION TECHNIQUE '+NOTICE.map(x=>'• '+x).join(' ')+' Coût prévisionnel des travaux : 1 €');
let p0={...M.ptrNouveauProgramme(b,{chantierId:'c1'},'vente'),vente:{nom:'x',le:'2026-11-07',lignes:L},venteIgnores:[]};
const R0=M.ptrRapprochement(p0,b,L);
const r=M.ptrAppliquerToutVente(p0,b);
const R1=M.ptrRapprochement(r.prog,b,L);
const ligne=(p,id)=>p.lignes.find(l=>l.prestationId===id);
chk(r.n>0&&r.compte.variante>=2&&r.compte.inclure>=2&&r.compte.ajouter===1,'propositions appliquées : '+JSON.stringify(r.compte));
chk(/Aldes/i.test(ligne(r.prog,'pr_pompe_a_chaleur').texte||'')&&ligne(r.prog,'pr_erp_alarme_incendie').incluse&&ligne(r.prog,'pr_erp_eclairage_securite').incluse,
  'PAC Aldes, alarme et éclairage de sécurité inclus');
chk(R0.groupes.some(g=>g.ligne.prestationId==='pr_erp_eclairage_securite')&&!R0.groupes.some(g=>g.ligne.prestationId==='pr_murs'),
  '« bloc autonome d’éclairage de sécurité » : l’éclairage de sécurité, pas la maçonnerie');
chk(r.prog.lignes.some(l=>/enrobé/.test(l.texte||'')&&l.incluse),'l’enrobé vendu est ajouté');
chk(R1.nonVendues.length===R0.nonVendues.length&&ligne(r.prog,'pr_porte_garage').incluse,'les lignes à confirmer ne sont pas exclues (garage toujours inclus)');
chk(!R1.absents.length&&R1.ecarts.length<R0.ecarts.length,'après : plus d’absent, moins de lignes à revoir');
/* une ligne retouchée pour le projet garde son texte, et elle est nommée */
const pac=ligne(p0,'pr_pompe_a_chaleur');
const p1={...p0,lignes:p0.lignes.map(l=>l.id===pac.id?{...l,modifie:true,texte:'PAC retouchée pour le projet.'}:l)};
const r2=M.ptrAppliquerToutVente(p1,b);
chk(ligne(r2.prog,'pr_pompe_a_chaleur').texte==='PAC retouchée pour le projet.'&&r2.gardees.some(t=>/POMPE/.test(t)),'texte retouché : gardé, et nommé');
chk(M.ptrAppliquerToutVente(r.prog,b).n===0,'une seconde fois : plus rien à appliquer');

/* 2. à l'écran, depuis l'onglet du chantier */
(async()=>{
  const ch={id:'c1',nom:'Local fictif',client:'M. Fictif',adresse:'Ville fictive'};
  let data={...M.EMPTY,chantiers:[ch],programmes:[]};
  let tr;const cible={chantierId:'c1',prospectId:null};
  const monter=()=>React.createElement(M.ProgrammeTechnique,{data,save:d=>{data=d;TR.act(()=>{tr.update(monter())})},cible});
  TR.act(()=>{tr=TR.create(monter())});
  const t=()=>norm(texteInst(tr.root));
  const btn=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
  const radio=re=>tr.root.findAll(n=>n.type==='input'&&n.props.type==='radio').find(n=>re.test(norm(texteInst(n.parent))));
  const fichier=()=>tr.root.findAll(n=>n.type==='input'&&n.props.type==='file')[0];
  chk(/Depuis le chiffrage vendu/.test(t()),'création : l’option « Depuis le chiffrage vendu »');
  TR.act(()=>{radio(/Depuis le chiffrage vendu/).props.onChange()});
  chk(/Déposer le chiffrage vendu \(PDF ou Word\)/.test(t())&&!btn(/^Créer le programme technique$/),'choisie : on dépose le chiffrage au lieu de cliquer « Créer »');

  /* un Word sans notice : dit, rien n'est créé */
  const vide=await docx(['Proposition de mission','Coût prévisionnel des travaux : 1 €']);
  await TR.act(async()=>{await fichier().props.onChange({target:{files:[new File([vide],'sans notice.docx',{type:WORD})],value:''}})});
  chk(!(data.programmes||[]).length&&/Aucun ouvrage reconnu dans « sans notice\.docx »/.test(t()),'sans notice : dit, aucun programme créé');

  /* le chiffrage vendu */
  const plein=await docx(['1. NOTICE de PRESENTATION TECHNIQUE DU PROJET',...NOTICE.map(x=>'•  '+x),'Coût prévisionnel des travaux : 100 000 € TTC']);
  await TR.act(async()=>{await fichier().props.onChange({target:{files:[new File([plein],'chiffrage vendu.docx',{type:WORD})],value:''}})});
  const pg=M.ptrProgrammePour(data,cible);
  chk(pg&&pg.chantierId==='c1'&&pg.source.type==='vente'&&pg.source.fichier==='chiffrage vendu.docx'&&pg.vente.lignes.length===NOTICE.length,
    'programme créé sur le chantier, la vente gardée avec lui');
  chk(pg.typeOuvrage==='erp5','la vente dit ERP : le programme est un ERP');
  chk(pg.lignes.length===p0.lignes.length,'il part du modèle CP Constructions');
  chk(/Rapprochement avec la vente/.test(t())&&/lignes? à revoir/.test(t())&&/Chiffrage « chiffrage vendu\.docx » lu le/.test(t()),'le rapprochement s’ouvre aussitôt');

  /* tout d'un clic */
  confirmes=[];
  TR.act(()=>{btn(/^Appliquer toutes les propositions$/).props.onClick()});
  chk(confirmes.length===1&&/incluses?/.test(confirmes[0])&&/proposition/.test(confirmes[0])&&/ne sont pas exclues/.test(confirmes[0]),'ce qui va changer est dit avant');
  const pg2=M.ptrProgrammePour(data,cible);
  chk(/Aldes/i.test(ligne(pg2,'pr_pompe_a_chaleur').texte||'')&&ligne(pg2,'pr_erp_alarme_incendie').incluse&&pg2.lignes.some(l=>/enrobé/.test(l.texte||'')),
    'appliqué : PAC Aldes, alarme incluse, enrobé ajouté');
  chk(/✓ .*vendues? incluses?/.test(t())&&/postes? vendus? ajoutés?/.test(t()),'le bilan s’affiche');
  chk(!btn(/^Appliquer toutes les propositions$/),'plus rien à appliquer d’office : le bouton disparaît');
  chk(ligne(pg2,'pr_porte_garage').incluse&&/à confirmer/.test(t()),'les lignes à confirmer restent à trancher');
  TR.act(()=>tr.unmount());
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
