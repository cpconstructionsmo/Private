/* Chiffrage précis (Phase 2, mode B) — quantités des lignes d'un poste tirées
   du plan de la visite du prospect (index.html : qtePlan, planDuProspect,
   lignesPlanEnRetard, appliquerPlanLignes). Pièces et prix fictifs. */
const {charger,verif}=require('./harness');
const M=charger(['qtePlan','planDuProspect','lignesPlanEnRetard','appliquerPlanLignes','libellePiecesRegle','visiteResume','GRANDEURS_PLAN']);
const {chk,fin}=verif();

const pieces=[{id:'p1',nom:'Cuisine',sol:12.5,perimetre:14.2,murs:30.1,portes:1,fenetres:1},
              {id:'p2',nom:'Séjour',sol:25,perimetre:20,murs:42.4,portes:2,fenetres:3}];
chk(M.qtePlan({grandeur:'sol',pieces:[]},pieces)===37.5,'sol de toute la maison');
chk(M.qtePlan({grandeur:'murs',pieces:['p1']},pieces)===30.1,'murs de la cuisine seule');
chk(M.qtePlan({grandeur:'fenetres',pieces:[]},pieces)===4&&M.qtePlan({grandeur:'pieces',pieces:[]},pieces)===2,'fenêtres et pièces comptées');
chk(M.qtePlan(null,pieces)===null&&M.qtePlan({grandeur:'sol'},[])===null,'sans règle ou sans plan : aucune quantité inventée');
chk(M.GRANDEURS_PLAN.length===26&&M.GRANDEURS_PLAN.slice(0,6).map(g=>g[0]).join()==='sol,murs,perimetre,portes,fenetres,pieces','les six grandeurs d’avant, plinthes, plafond, puis 18 équipements du plan');
{const PP=[{id:'a',sol:12.5,plinthes:13.2},{id:'b',sol:8,plinthes:10.1}],ANC=[{id:'a',sol:12.5,perimetre:14}];
 chk(M.qtePlan({grandeur:'plafond',pieces:[]},PP)===20.5&&M.qtePlan({grandeur:'plinthes',pieces:['b']},PP)===10.1,'plafond = surface de sol (20,5 m²), plinthes d’une pièce (10,1 ml)');
 chk(M.qtePlan({grandeur:'plinthes',pieces:[]},ANC)===null,'ancien plan sans plinthes : aucune quantité inventée');}
{const PE=[{id:'a',nom:'Cuisine',equip:{prise:6,lumiere:2}},{id:'b',nom:'Séjour',equip:{prise:4,radiateur:2}},{id:'c',nom:'Cellier'}];
 chk(M.qtePlan({grandeur:'eq:prise',pieces:[]},PE)===10&&M.qtePlan({grandeur:'eq:prise',pieces:['a']},PE)===6,'nombre de prises : toute la maison (10) ou la cuisine seule (6)');
 chk(M.qtePlan({grandeur:'eq:vmc',pieces:[]},PE)===0&&M.qtePlan({grandeur:'eq:radiateur',pieces:['c']},PE)===0,'aucun équipement de ce type : 0, sans erreur (pièce sans équipement, ancien plan)');}

/* le plan le plus récent des visites du prospect */
const ligne=(id,maj,detail,extra={})=>({id,maj_le:maj,donnees:{id,creeLe:'2026-11-17T09:00:00Z',
  valeurs:{'client.nom':'FICTIF',plan:detail?{releve:{},resume:{pieces:detail.length,surface:37.5,detail}}:undefined,...extra},maj:{},pieces:{},photos:{}}});
const R=[M.visiteResume(ligne('v-ancienne','2026-11-10T10:00:00Z',[pieces[0]],{prospectId:'pA'})),
         M.visiteResume(ligne('v-recente','2026-11-18T10:00:00Z',pieces,{prospectId:'pA'})),
         M.visiteResume(ligne('v-sans-plan','2026-11-19T10:00:00Z',null,{prospectId:'pA'})),
         M.visiteResume(ligne('v-autre','2026-11-19T10:00:00Z',pieces,{prospectId:'pB'}))];
const plan=M.planDuProspect({id:'pA',visites:[]},R);
chk(plan&&plan.visiteId==='v-recente'&&plan.pieces.length===2,'le plan pris est celui de la visite la plus récente qui en a un');
chk(M.planDuProspect({id:'pZ'},R)===null,'prospect sans visite : pas de plan');

/* lignes réglées sur le plan */
const lignes=[
  {id:'a',libelle:'Peinture murs',unite:'M²',pu:20,qt:30.1,regle:{grandeur:'murs',pieces:['p1']}},
  {id:'b',libelle:'Carrelage',unite:'M²',pu:40,qt:-12.5,regle:{grandeur:'sol',pieces:['p1']}},
  {id:'c',libelle:'Plinthes',unite:'ML',pu:8,qt:55},
  {id:'t',type:'titre',libelle:'CUISINE'}];
chk(M.lignesPlanEnRetard(lignes,plan).length===0,'quantités à jour : rien à mettre à jour');
const plan2={...plan,pieces:[{...pieces[0],murs:32,sol:13},pieces[1]]};
const retard=M.lignesPlanEnRetard(lignes,plan2);
chk(retard.map(l=>l.id).join()==='a,b','le plan a changé : seules les lignes réglées sur le plan sont à mettre à jour');
const maj=M.appliquerPlanLignes(lignes,plan2);
chk(maj[0].qt===32&&maj[1].qt===-13,'mise à jour : nouvelles quantités, moins-value gardée en négatif');
chk(maj[2].qt===55&&maj[3].type==='titre','une quantité tapée à la main et un intertitre ne bougent pas');
chk(M.libellePiecesRegle({grandeur:'sol',pieces:['p2']},plan)==='Séjour'&&M.libellePiecesRegle({grandeur:'sol',pieces:[]},plan)==='toute la maison','on dit de quelles pièces vient la quantité');
fin();
