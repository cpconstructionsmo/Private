/* Fusion à trois voies des données (fusionnerDonnees) : deux appareils qui
   écrivent chacun leur copie ne s'effacent plus l'un l'autre. */
const {charger,verif}=require('./harness');
const M=charger(['fusionnerDonnees','EMPTY']);
const {chk,fin}=verif();
const F=M.fusionnerDonnees;
const c=o=>JSON.parse(JSON.stringify(o));
const base={chantiers:[{id:'c1',nom:'Leroux',statut:'travaux',notesDossier:[]},{id:'c2',nom:'Martin',statut:'etude'}],
  prospects:[{id:'p1',nom:'Moualid',statut:'demande'}],artisans:[],reglage:{mail:'a@x.fr',signature:'CP'}};

/* 1. chacun ajoute une fiche dans une liste différente */
let n=c(base);n.prospects.push({id:'p2',nom:'Durand'});
let e=c(base);e.artisans.push({id:'a1',nom:'Plombier'});
let r=F(base,n,e);
chk(r.prospects.map(x=>x.id).join()==='p1,p2'&&r.artisans.map(x=>x.id).join()==='a1','ajouts sur deux listes : les deux gardés');

/* 2. même liste, chacun ajoute une fiche */
n=c(base);n.chantiers.push({id:'c3',nom:'Neuf A'});
e=c(base);e.chantiers.push({id:'c4',nom:'Neuf B'});
r=F(base,n,e);
chk(r.chantiers.map(x=>x.id).join()==='c1,c2,c4,c3','même liste : les deux ajouts gardés');

/* 3. même fiche, champs différents */
n=c(base);n.chantiers[0].statut='reception';
e=c(base);e.chantiers[0].nom='Maison Leroux';
r=F(base,n,e);
chk(r.chantiers[0].statut==='reception'&&r.chantiers[0].nom==='Maison Leroux','même fiche, champs différents : les deux modifications gardées');

/* 4. notes ajoutées des deux côtés sur le même chantier */
n=c(base);n.chantiers[0].notesDossier.push({id:'n1',texte:'ordi'});
e=c(base);e.chantiers[0].notesDossier.push({id:'n2',texte:'téléphone'});
r=F(base,n,e);
chk(r.chantiers[0].notesDossier.map(x=>x.texte).sort().join()==='ordi,téléphone','notes des deux appareils sur le même dossier : gardées');

/* 5. suppression d'un côté, rien de l'autre */
n=c(base);n.chantiers=n.chantiers.filter(x=>x.id!=='c2');
e=c(base);e.prospects[0].statut='encours';
r=F(base,n,e);
chk(r.chantiers.map(x=>x.id).join()==='c1'&&r.prospects[0].statut==='encours','suppression chez nous, modification ailleurs : les deux appliquées');
r=F(base,e,n);
chk(r.chantiers.map(x=>x.id).join()==='c1'&&r.prospects[0].statut==='encours','et dans l’autre sens');

/* 6. suppression d'un côté, modification de la même fiche de l'autre : on garde */
n=c(base);n.chantiers=n.chantiers.filter(x=>x.id!=='c2');
e=c(base);e.chantiers[1].statut='pc';
r=F(base,n,e);
chk(r.chantiers.some(x=>x.id==='c2'&&x.statut==='pc'),'fiche supprimée ici mais modifiée ailleurs : conservée (pas de perte)');

/* 7. même valeur modifiée des deux côtés : la nôtre */
n=c(base);n.reglage.mail='nous@x.fr';
e=c(base);e.reglage.mail='eux@x.fr';e.reglage.signature='CP Constructions';
r=F(base,n,e);
chk(r.reglage.mail==='nous@x.fr'&&r.reglage.signature==='CP Constructions','conflit sur une même valeur : la plus récente de cet appareil ; le reste fusionné');

/* 8. réordonnancement chez nous, ajout chez eux */
n=c(base);n.chantiers.reverse();
e=c(base);e.chantiers.push({id:'c5',nom:'Autre'});
r=F(base,n,e);
chk(r.chantiers.map(x=>x.id).join()==='c2,c1,c5','ordre changé ici, ajout ailleurs : notre ordre, leur ajout');

/* 9. rien changé chez nous : on prend tout du serveur */
e=c(base);e.chantiers[0].nom='X';e.nouveau={a:1};
r=F(base,c(base),e);
chk(JSON.stringify(r)===JSON.stringify(e),'rien changé ici : version du serveur telle quelle');

/* 10. sans base connue : réunion des deux, la nôtre prime en cas d'écart */
r=F(null,c(base),e);
chk(r.chantiers[0].nom==='Leroux'&&r.nouveau&&r.nouveau.a===1&&r.chantiers.length===2,'sans base : rien n’est perdu, notre valeur prime');

/* 11. clés nouvelles et retirées */
n=c(base);delete n.reglage;
e=c(base);e.ptrBiblio={prestations:[{id:'pr1',variantes:[{id:'v1',texte:'a'}]}]};
r=F(base,n,e);
chk(!('reglage' in r)&&r.ptrBiblio&&r.ptrBiblio.prestations[0].variantes[0].texte==='a','clé retirée ici, clé ajoutée ailleurs');

/* 12. listes imbriquées (bibliothèque) : variantes modifiées des deux côtés */
const b2={ptrBiblio:{prestations:[{id:'pr1',variantes:[{id:'v1',texte:'a',marque:''},{id:'v2',texte:'b'}]}]}};
n=c(b2);n.ptrBiblio.prestations[0].variantes[0].texte='a modifié';
e=c(b2);e.ptrBiblio.prestations[0].variantes[0].marque='Placo';e.ptrBiblio.prestations[0].variantes.push({id:'v3',texte:'c'});
r=F(b2,n,e);
const v=r.ptrBiblio.prestations[0].variantes;
chk(v[0].texte==='a modifié'&&v[0].marque==='Placo'&&v.map(x=>x.id).join()==='v1,v2,v3','bibliothèque : fusion jusqu’au champ d’une proposition');
fin();
