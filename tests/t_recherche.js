/* Recherche globale : index et classement. */
const {charger,verif}=require('./harness');
const M=charger(['rechercheIndex','rechercher','EMPTY']);
const {chk,fin}=verif();
const data={...M.EMPTY,
  chantiers:[{id:'c1',nom:'Maison Leroux',statut:'travaux',client:'M. Leroux',adresse:'Magny-le-Désert',telClient:'06 11 22 33 44',
    taches:[{id:'t1',texte:'Appeler établissement Maillard',echeance:'2026-09-01'}],notesDossier:[{id:'n1',texte:'Portail côté rue à reprendre',creeLe:'2026-09-28T10:00:00Z'}]}],
  prospects:[{id:'p1',nom:'Maison Moualid',client:'Moualid',commune:'Valframbert',statut:'demande',emailClient:'moualid@exemple.fr'}],
  artisans:[{id:'a1',nom:'SARL Plomberie Élan',corps:'Plomberie',tel:'02 33 00 00 00'}],
  fournisseurs:[{id:'f1',nom:'Torchio',activite:'Carrelage'}],
  marches:[{id:'m1',chantierId:'c1',artisanId:'a1',lot:'Plomberie sanitaire'}],
  commandes:[{id:'k1',chantierId:'c1',designation:'Menuiseries alu — 8 ouvrants',fournisseur:'Emaplast'}],
  rendezvous:[{id:'r1',titre:'Réunion de chantier',date:'2026-10-02',client:'Leroux'}]};
const I=M.rechercheIndex(data);
const R=q=>M.rechercher(I,q);
chk(R('moua')[0]&&R('moua')[0].aller.type==='prospect'&&R('moua')[0].aller.id==='p1','« moua » : le prospect Moualid, ouvert directement');
chk(R('elan')[0]&&R('elan')[0].type==='artisan','accents ignorés : « elan » trouve « Élan »');
chk(R('magny desert').some(x=>x.type==='chantier'),'plusieurs mots, adresse accentuée : le chantier');
chk(R('06 11 22').some(x=>x.type==='chantier'),'par numéro de téléphone');
const cmd=R('menuiseries')[0];
chk(cmd&&cmd.type==='commande'&&cmd.aller.onglet==='cmd'&&cmd.aller.id==='c1','commande : ouvre le chantier sur l’onglet MATÉRIAUX');
const mar=R('plomberie').find(x=>x.type==='marche');
chk(mar&&mar.aller.onglet==='marches'&&/Plomberie sanitaire — SARL Plomberie Élan/.test(mar.titre),'marché : lot et artisan, ouvre l’onglet MARCHÉS');
chk(R('maillard')[0]&&R('maillard')[0].aller.onglet==='taches','tâche : ouvre l’onglet TÂCHES');
chk(R('portail')[0]&&R('portail')[0].type==='note'&&R('portail')[0].aller.id==='c1','note : ouvre son dossier');
chk(R('reunion')[0]&&R('reunion')[0].aller.type==='agenda'&&R('reunion')[0].aller.jour==='2026-10-02','rendez-vous : ouvre l’agenda sur sa journée');
chk(!R('').length&&!R('   ').length&&!R('introuvable xyz').length,'rien pour une recherche vide ou sans correspondance');
const tri=R('plomberie').map(x=>x.type);
chk(tri.indexOf('artisan')<tri.indexOf('marche'),'résultats groupés dans un ordre stable');
fin();
