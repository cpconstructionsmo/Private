/* Le lien vers CP Designer depuis la fiche chantier : il ne passe que
   l'identifiant du chantier (encodé), vers la page designer/ du même site ;
   rien du Designer n'entre dans les données du suivi de chantiers. */
const fs=require('fs');const path=require('path');
const {charger,verif}=require('./harness');
const M=charger(['designerLien','designerLienProspect']);
const {chk,fin}=verif();
chk(M.designerLien({id:'abc123',nom:'Maison fictive'})==='designer/?chantier=abc123','lien vers la page du Designer, avec l’identifiant du chantier');
chk(M.designerLien({id:'a b&c'})==='designer/?chantier=a%20b%26c','identifiant encodé dans l’adresse');
chk(M.designerLien(null)==='designer/?chantier=','sans chantier : pas d’erreur');
chk(M.designerLien({id:'c12',prospectId:'p7'})==='designer/?chantier=c12&prospect=p7','un chantier issu d’un prospect passe aussi le prospect (le Designer rouvre l’avant-projet)');
chk(M.designerLienProspect({id:'p7',nom:'Maison fictive'})==='designer/?prospect=p7','un prospect ouvre son avant-projet');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
chk(/title="Dessiner le plan dans CP Designer">Ouvrir dans CP Designer<\/a>/.test(html),'le lien figure sur la fiche (Plans d’exécution)');
chk(/\['designer','CP DESIGNER'\]/.test(html),'l’onglet CP DESIGNER est dans le menu');
chk(/view==='designer'\?<DesignerAccueil data=\{data\}\/>/.test(html)&&/href="designer\/" target="_blank"/.test(html),'l’onglet ouvre la page du Designer : un chantier ou un projet libre');
chk(!/designer_projects|designer_revisions|designer_changesets/.test(html),'le suivi de chantiers ne lit ni n’écrit les tables du Designer');
fin();
