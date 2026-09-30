/* Choix du client en ligne, sur un dossier fictif : le calcul de
   l'application est celui du serveur (calcul.js) ; il refuse ce qui n'est
   pas au catalogue, un double choix unique, une quantité hors limites ; un
   prix absent n'est jamais zéro. Le catalogue proposé reprend les points
   ouverts (pas une rubrique validée), les variantes, les ouvrages ; ce qui
   est publié ne dit rien de la MAP ni de la source des prix. Au relevé, le
   total est contrôlé, une rubrique validée n'est pas prise d'office, et
   reprendre deux fois ne crée pas de doublon. */
const fs=require('fs');const path=require('path');
const React=require('react');const TR=require('react-test-renderer');
const {charger,verif,norm,texteInst}=require('./harness');
const M=charger(['configCalculer','configProposer','configFusionner','configPublie','configAnalyserPanier','configAppliquer','ChoixClientEnLigne',
  'mapOuvrageNeuf','mapEmpreinteRubrique','MAP_RUBRIQUES','receveursVersProduits','EMPTY']);
const {chk,fin}=verif();

/* --- la même règle des deux côtés --- */
const src=fs.readFileSync(path.join(__dirname,'..','supabase','functions','configurateur','calcul.js'),'utf8');
const serveur=new Function(src.replace('export function configCalculer','function configCalculer')+'\nreturn configCalculer;')();
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const corps=s=>s.slice(s.indexOf('function configCalculer'),s.indexOf('\n}\n',s.indexOf('function configCalculer'))+2);
chk(corps(html)===corps(src.replace('export function configCalculer','function configCalculer')),'index.html porte une copie exacte de calcul.js');
const pub={prixVersion:3,budgetTTC:2000,questions:[
  {id:'q1',titre:'WC',type:'unique',options:[{id:'a',libelle:'Standard',nature:'inclus'},{id:'b',libelle:'Suspendu',nature:'plus',prixTTC:450}]},
  {id:'q2',titre:'Options',type:'multiple',options:[{id:'c',libelle:'Prise USB',nature:'plus',prixTTC:35.5,max:4},{id:'d',libelle:'Sans lave-mains',nature:'moins',prixTTC:180},
    {id:'e',libelle:'Niche',nature:'plus',prixTTC:''},{id:'f',libelle:'Non',nature:'sans'},{id:'g',libelle:'Douchette',nature:'chiffrer',prixTTC:999}]}]};
const essais=[
  [[{optionId:'b'},{optionId:'c',quantite:3},{optionId:'d'},{optionId:'e'},{optionId:'f'},{optionId:'g'}],'panier complet'],
  [[{optionId:'a'},{optionId:'b'}],'deux choix pour une question unique'],
  [[{optionId:'zz'}],'option inconnue'],
  [[{optionId:'c',quantite:5}],'quantité au-delà du maximum'],
  [[{optionId:'c',quantite:0}],'quantité nulle'],
  [[{optionId:'b'},{optionId:'b'}],'option en double'],
  ['n’importe quoi','panier illisible'],
];
chk(essais.every(([l])=>JSON.stringify(M.configCalculer(pub,l))===JSON.stringify(serveur(pub,l))),'application et serveur : mêmes résultats sur '+essais.length+' paniers');
const c=M.configCalculer(pub,essais[0][0]);
chk(c.plusTTC===556.5&&c.moinsTTC===-180&&c.netTTC===376.5,'plus-values 450 + 3 × 35,50 ; moins-value 180 ; net +376,50 € TTC');
chk(c.aChiffrer===2&&c.lignes.find(l=>l.optionId==='e').montantTTC===null&&c.lignes.find(l=>l.optionId==='g').prixTTC===null,'plus-value sans prix et « à chiffrer » : inconnus, jamais zéro (le prix 999 d’une ligne à chiffrer est ignoré)');
chk(c.resteBudgetTTC===1623.5&&c.prixVersion===3,'reste sur le budget, version des prix');
chk(M.configCalculer(pub,essais[1][0]).erreurs.some(e=>/choix_unique/.test(e))&&M.configCalculer(pub,essais[2][0]).erreurs.length&&M.configCalculer(pub,essais[3][0]).erreurs.length,'refusés : double choix unique, option inconnue, quantité');

/* --- le dossier fictif --- */
const prods=M.receveursVersProduits([],'acquabella_compact_granite').produits;
const allee={...M.mapOuvrageNeuf('allee'),id:'ouv_allee',libelle:'Allée',statut:'option',financement:'supplement',montantTTC:'1200'};
let map={chauffageType:'PAC air/eau',receveurProduit:prods[0].id,ouvrages:[allee],suivi:[],
  menuiseriesCouleur:'Monochrome'};
map.validations={'5':{le:'2026-09-21',empreinte:M.mapEmpreinteRubrique(M.MAP_RUBRIQUES.find(r=>r.id==='5'),map)}};
const data={...M.EMPTY,produits:prods};
const ch={id:'c1',nom:'Maison Fictive',map};
const Q=M.configProposer(ch,data);
const q=id=>Q.find(x=>x.id===id);
chk(q('q_wcType')&&q('q_wcType').options.length===2&&q('q_douche')&&q('q_douche').type==='multiple','points ouverts de la rubrique 7 proposés (WC, douche à choix multiples)');
chk(!Q.some(x=>x.rubrique==='5'),'rubrique 5 validée : rien n’en est proposé');
chk(!q('q_chauffageType'),'champ déjà renseigné : pas proposé');
chk(q('q_receveurVariante')&&q('q_receveurVariante').options.length>5,'receveur retenu, variante à choisir : ses variantes proposées');
const qo=q('q_ouv_ouv_allee');
chk(qo&&qo.options[0].nature==='plus'&&qo.options[0].prixTTC===1200&&qo.options[1].nature==='sans','ouvrage en option : « je le retiens » +1 200 €, « non » sans incidence');
chk(Q.every(x=>!x.actif),'rien n’est proposé au client sans le cocher');
const Q2=M.configProposer(ch,data);
chk(JSON.stringify(Q2.map(x=>x.options.map(o=>o.id)))===JSON.stringify(Q.map(x=>x.options.map(o=>o.id))),'identifiants stables d’une préparation à l’autre');
const retouche=Q.map(x=>x.id==='q_wcType'?{...x,titre:'Votre WC',actif:true,options:x.options.map((o,i)=>i===0?{...o,nature:'plus',prixTTC:'450',source:{type:'bordereau',puHT:375}}:{...o,defaut:true})}:x);
const F=M.configFusionner(retouche,Q2);
chk(F.length===Q.length&&F.find(x=>x.id==='q_wcType').titre==='Votre WC','préparer de nouveau : la question retouchée est gardée telle quelle');

/* --- ce qui est publié --- */
const cfg={questions:F.map(x=>x.id==='q_ouv_ouv_allee'?{...x,actif:true}:x),budgetTTC:'3000',message:'Bonjour'};
const P={...M.configPublie(ch,cfg),prixVersion:1};
const txtP=JSON.stringify(P);
chk(P.questions.length===2&&!/champ|valeur|source|puHT|wcType"|validations|suivi/.test(txtP.replace(/"id":"q_wcType"/,'')),'publié : les deux questions cochées, sans champ de la MAP, valeur interne ni source du prix');
chk(P.questions[0].options[0].prixTTC===450&&P.budgetTTC===3000,'prix TTC et budget en nombres');

/* --- relevé et reprise --- */
const wcSusp=P.questions.find(x=>x.id==='q_wcType').options[0], oui=P.questions.find(x=>x.id==='q_ouv_ouv_allee').options[0];
const lignes=[{optionId:wcSusp.id,quantite:1},{optionId:oui.id,quantite:1}];
const panier={version:2,prix_version:1,statut:'envoye',cree_le:'2026-09-30T10:00:00Z',lignes,calcul:serveur(P,lignes)};
const cfgP={...cfg,publications:[{prixVersion:1,le:'2026-09-30',publie:P}]};
const A=M.configAnalyserPanier(cfgP,panier,map);
chk(A.controle==='ok'&&panier.calcul.netTTC===1650,'total contrôlé : +1 650 € TTC, identique au calcul sur la version publiée');
chk(M.configAnalyserPanier(cfgP,{...panier,calcul:{...panier.calcul,netTTC:10}},map).controle==='ecart','un total altéré est signalé');
chk(M.configAnalyserPanier({...cfg},panier,map).controle==='inconnu','version de prix inconnue : non vérifié, et dit comme tel');
chk(A.champs.length===1&&A.champs[0].k==='wcType'&&A.champs[0].propose==='Pack WC suspendu'&&A.champs[0].actuelVide,'WC : « Pack WC suspendu » proposé pour un champ vide');
chk(A.ouvrages.length===1&&A.ouvrages[0].propose==='inclus'&&A.ouvrages[0].montantTTC===1200,'ouvrage : retenu, +1 200 €');
chk(A.suivi.length===2&&A.suivi.every(s=>s.type==='decision'&&/prix v1/.test(s.texte)),'deux décisions au suivi, avec la version des prix');
const r1=M.configAppliquer(map,A,{wcType:true,'ouvrage:ouv_allee':true},{version:2,prixVersion:1,netTTC:1650});
const al=r1.map.ouvrages.find(o=>o.id==='ouv_allee');
chk(r1.map.wcType==='Pack WC suspendu'&&al.statut==='inclus'&&al.financement==='supplement'&&al.montantTTC==='1200'&&r1.map.suivi.length===2,'repris : WC, ouvrage inclus en supplément de 1 200 €, suivi');
chk(!('marches' in r1.map)&&r1.releve.avant.wcType===null,'aucun marché touché ; l’état d’avant est gardé');
const r2=M.configAppliquer(r1.map,M.configAnalyserPanier(cfgP,panier,r1.map),{},{version:2,prixVersion:1,netTTC:1650});
chk(r2.map.suivi.length===2&&r2.releve.suivi.length===0,'relever deux fois le même panier : aucun doublon au suivi');
const r3=M.configAppliquer(map,A,{},{version:2,prixVersion:1,netTTC:1650});
chk(r3.map.wcType===undefined&&r3.map.ouvrages.find(o=>o.id==='ouv_allee').statut==='option','rien de coché : la MAP ne change pas (seul le suivi est complété)');
/* rubrique validée */
const mapV={...map,validations:{...map.validations,'7':{le:'2026-09-22',empreinte:M.mapEmpreinteRubrique(M.MAP_RUBRIQUES.find(r=>r.id==='7'),map)}}};
const AV=M.configAnalyserPanier(cfgP,panier,mapV);
chk(AV.champs[0].valideLe==='2026-09-22','rubrique 7 validée depuis : le choix est signalé comme tel');

/* --- à l'écran --- */
let tr;TR.act(()=>{tr=TR.create(React.createElement(M.ChoixClientEnLigne,{data,ch,up:()=>{}}))});
const t=norm(texteInst(tr.root));
chk(/Choix du client en ligne/.test(t)&&/Aucun espace publié/.test(t)&&!/Relever/.test(t),'écran : pas de lien tant que rien n’est publié');
fin();
