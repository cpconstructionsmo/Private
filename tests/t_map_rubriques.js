/* MAP en rubriques : ce qui est renseigné (seulement les champs qui
   s'appliquent), ce qui est validé (et modifié depuis), les alertes, les
   points de suivi rattachés, la recherche d'un champ. */
const {charger,verif}=require('./harness');
const M=charger(['MAP_RUBRIQUES','mapEtatRubrique','mapEmpreinteRubrique','mapRechercheChamps','mapPointsATraiter','EMPTY']);
const {chk,fin}=verif();
const R=id=>M.MAP_RUBRIQUES.find(r=>r.id===id);

chk(M.MAP_RUBRIQUES.map(r=>r.id).join()==='1,2,3,4,5,6,7,8,9,11','les rubriques de la MAP, par numéro');
const vide=M.mapEtatRubrique(R('3'),{},M.EMPTY);
chk(vide.renseignes===0&&vide.total>0&&!vide.alertes.length&&!vide.valide,'rubrique vide : rien de renseigné, rien de validé, pas d’alerte');
chk(!vide.manquants.some(x=>x.k==='vsRangs'||x.k==='fondationsAutre'),'un champ qui ne s’applique pas ne manque pas');

const m={fondations:'Autre',soubassement:'Vide sanitaire',hourdis:'Béton non isolant',vsTrappe:true};
const e3=M.mapEtatRubrique(R('3'),m,M.EMPTY);
chk(e3.renseignes===3&&e3.manquants.some(x=>x.k==='vsRangs')&&e3.manquants.some(x=>x.k==='fondationsAutre'),'une réponse fait apparaître le champ qui en dépend');
chk(e3.alertes.map(a=>a.k).sort().join()==='fondationsAutre,vsRangs','alertes : fondations « Autre » sans précision, vide sanitaire sans rangs');
chk(e3.resume.includes('Vide sanitaire')&&e3.resume.includes('Trappe d’accès fonte 60×60'),'résumé : les choix, et un oui/non coché par son libellé');

const val={...m,validations:{'3':{le:'2026-09-20',empreinte:M.mapEmpreinteRubrique(R('3'),m)}}};
const ev=M.mapEtatRubrique(R('3'),val,M.EMPTY);
chk(ev.valide&&!ev.modifieDepuis,'validée : la validation vaut pour ces réponses');
const ev2=M.mapEtatRubrique(R('3'),{...val,hourdis:'Isolant PSE avec rupteurs de ponts thermiques'},M.EMPTY);
chk(ev2.valide&&ev2.modifieDepuis,'une réponse changée après validation : « modifiée depuis validation »');
chk(!M.mapEtatRubrique(R('4'),{...val,charpenteType:'Charpente traditionnelle'},M.EMPTY).valide,'la validation d’une rubrique ne s’étend pas aux autres');

const suivi=[{id:'a',type:'chiffrer',lot:'Maçonnerie',texte:'Seuil',statut:'ouvert'},{id:'b',type:'decision',lot:'Gros œuvre',texte:'x',statut:'fait'},
  {id:'c',type:'attente',rubrique:'7',texte:'Choix VMC',statut:'ouvert'},{id:'d',type:'attente',lot:'',texte:'Mairie',statut:'ouvert'}];
chk(M.mapEtatRubrique(R('3'),{suivi},M.EMPTY).pointsOuverts===1&&M.mapEtatRubrique(R('3'),{suivi},M.EMPTY).decisions===1,'rubrique 3 : un point ouvert (lot maçonnerie), une décision');
chk(M.mapEtatRubrique(R('7'),{suivi},M.EMPTY).pointsOuverts===1,'un point peut désigner sa rubrique directement');

const P=M.mapPointsATraiter({...val,hourdis:'Béton isolant',suivi},M.EMPTY);
chk(P.some(p=>p.nature==='alerte'&&p.k==='vsRangs')&&P.some(p=>p.nature==='validation'&&p.rubrique==='3')&&P.some(p=>p.nature==='suivi'&&p.rubrique==='7'),
  'points à traiter : alertes, rubriques à revalider, points de suivi ouverts');

const r1=M.mapRechercheChamps('enduit');
chk(r1.length>=3&&r1.every(x=>x.rubrique==='5')&&r1.some(x=>x.k==='enduitCouleur'),'recherche « enduit » : les champs de la rubrique 5');
chk(M.mapRechercheChamps('RECEVEUR').some(x=>x.k==='receveurProduit'),'recherche sans majuscules ni accents');
chk(!M.mapRechercheChamps('  ').length,'recherche vide : rien');
fin();
