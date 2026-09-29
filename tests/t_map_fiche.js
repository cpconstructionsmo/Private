/* Fiche MAP papier : mêmes champs que l'onglet MAP, mise en page lisible
   par la suite (repères, code de page, cases et zones qui ne se chevauchent
   pas, dans la page), fiche préremplie, PDF, et le bouton de l'onglet. */
const fs=require('fs');const path=require('path');const React=require('react');const TR=require('react-test-renderer');
const {charger,verif,texteInst,norm,RACINE,SORTIE}=require('./harness');
const M=charger(['MAP_FICHE','ficheMapMiseEnPage','ficheCodeBits','ficheCodeLire','pdfVectoriel','pdfCouper','pdfLargeur',
  'FicheMapPapier','FICHE_X0','FICHE_X1','FICHE_Y0','FICHE_Y1','FICHE_CASE','EMPTY']);
const {chk,fin}=verif();
const LOGO={jpeg:new Uint8Array(require('fs').readFileSync(require('path').join(__dirname,'..','assets','logo_fiche.jpg'))),w:600,h:395};

/* --- l'onglet MAP et la fiche ont les mêmes champs --- */
const html=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
const src=html.slice(html.indexOf('function MAP({data,ch,up}){'),html.indexOf('/* ---------------- VISITE TECHNIQUE'));
const cles=new Set([...src.matchAll(/\bk="(\w+)"/g)].map(x=>x[1]).concat([...src.matchAll(/set\(\{(\w+):/g)].map(x=>x[1])));
/* ce qui n'est pas une saisie du rendez-vous : fichiers déposés, date de sortie */
['lienPlan','lienSignee','sortieLe','fiches','validations','receveurVariante'].forEach(k=>cles.delete(k));
const schema=new Set(M.MAP_FICHE.flatMap(s=>s.f.map(f=>f.k)));
const manquants=[...cles].filter(k=>!schema.has(k)), enTrop=[...schema].filter(k=>!cles.has(k));
chk(!manquants.length,'chaque champ de l’onglet MAP est sur la fiche'+(manquants.length?' — manquent : '+manquants.join(', '):''));
chk(!enTrop.length,'la fiche n’a pas de champ inconnu de l’onglet'+(enTrop.length?' — en trop : '+enTrop.join(', '):''));

/* --- code de page --- */
let codesOk=true;
for(let p=0;p<12;p++)for(const n of [1,7,63,64,100]){const r=M.ficheCodeLire(M.ficheCodeBits(p,n));if(!r||r.page!==p||r.numero!==n%64)codesOk=false}
chk(codesOk,'code de page : relu à l’identique');
chk(M.ficheCodeLire(M.ficheCodeBits(3,9).slice().reverse())===null,'code de page lu à l’envers : refusé');
const b=M.ficheCodeBits(2,5);b[4]^=1;
chk(M.ficheCodeLire(b)===null,'code de page abîmé : refusé');

/* --- mise en page --- */
const data={...M.EMPTY,
  produits:[{id:'pr1',nom:'Porte Renomatic',marque:'Hörmann',lot:'Menuiseries ext.'},{id:'pr2',nom:'Porte Thermo',marque:'Hörmann',lot:'Menuiseries ext.'},
    {id:'pr3',nom:'Porte Fuji',marque:'Olt',lot:'Menuiseries int.',finitions:['Chêne gris','Blanc']}],
  chantiers:[{id:'c1',nom:'Maison Exemple',client:'M. et Mme Exemple',adresse:'1 rue du Test, 61000 Alençon',
    map:{soubassement:'Vide sanitaire',travauxPrepa:['Débroussaillage','Démolition'],vsTrappe:true,porteEntreeProduit:'pr1',
      porteInterieureProduit:'pr3',enduitCouleur:'Ton pierre (à confirmer)',notes:'Prévoir un rendez-vous chez le carreleur'}}]};
const ch=data.chantiers[0];
const V=M.ficheMapMiseEnPage(ch,data,{mode:'vierge',numero:1,date:'2026-09-29',logo:LOGO});
const P=M.ficheMapMiseEnPage(ch,data,{mode:'preremplie',numero:2,date:'2026-09-29',logo:LOGO});
const D=V.disposition;
chk(V.pages.length>=4&&V.pages.length<=12&&D.nbPages===V.pages.length,'fiche vierge : '+V.pages.length+' pages');
const dans=(r,w,h)=>r.x>=M.FICHE_X0-0.01&&r.x+w<=M.FICHE_X1+0.01&&r.y>=M.FICHE_Y0-0.01&&r.y+h<=M.FICHE_Y1+0.01;
chk(D.cases.every(c=>dans(c,M.FICHE_CASE,M.FICHE_CASE))&&D.zones.every(z=>dans(z,z.w,z.h)),'cases et zones dans le cadre (hors repères et code)');
const rects=[...D.cases.map(c=>({p:c.p,x:c.x,y:c.y,w:M.FICHE_CASE,h:M.FICHE_CASE,n:c.k+'='+c.v})),...D.zones.map(z=>({p:z.p,x:z.x,y:z.y,w:z.w,h:z.h,n:z.k+(z.r||'')+(z.i||'')}))];
let chev=null;
for(let i=0;i<rects.length&&!chev;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],c=rects[j];
  if(a.p===c.p&&a.x<c.x+c.w-0.05&&c.x<a.x+a.w-0.05&&a.y<c.y+c.h-0.05&&c.y<a.y+a.h-0.05){chev=a.n+' / '+c.n;break}}
chk(!chev,'aucune case ni zone ne se chevauche'+(chev?' — '+chev:''));
const couverts=new Set([...D.cases.map(c=>c.k),...D.zones.map(z=>z.k)]);
const sans=[...new Set(M.MAP_FICHE.flatMap(s=>s.f.map(f=>f.k)))].filter(k=>!couverts.has(k));
chk(!sans.length,'chaque champ a au moins une case ou une zone'+(sans.length?' — sans : '+sans.join(', '):''));
chk(D.cases.filter(c=>c.k==='suivi').length===30&&D.zones.filter(z=>z.k==='suivi'&&z.r==='texte').length===10,'suivi : 10 lignes, chacune avec ses trois natures, son lot et son texte');
chk(D.cases.filter(c=>c.k==='vsTrappe').map(c=>c.v).join()==='true,false','oui/non : deux cases, pour qu’une case vide ne dise rien');
chk(D.cases.filter(c=>c.k==='porteEntreeProduit').map(c=>c.v).join()==='pr1,pr2'&&D.zones.some(z=>z.k==='porteEntreeProduit'&&z.r==='autre'),
  'produit : les modèles du lot dans le catalogue, et un cadre « Autre »');
const textes=pages=>pages.flat().filter(e=>e.t==='texte').map(e=>e.s).join('\n');
const tv=textes(V.pages), tp=textes(P.pages);
chk(!/Actuel :/.test(tv),'fiche vierge : aucune valeur actuelle');
chk(/Actuel : Vide sanitaire/.test(tp)&&/Actuel : Débroussaillage, Démolition/.test(tp)&&/Actuel : Oui/.test(tp)&&/Actuel : Porte Renomatic — Hörmann/.test(tp),
  'fiche préremplie : les valeurs actuelles en clair (choix, plusieurs choix, oui/non, produit)');
chk(P.disposition.cases.filter(c=>c.k==='porteInterieureFinition').map(c=>c.v).join()==='Chêne gris,Blanc','finitions : celles du produit retenu');
chk(/Maison Exemple/.test(tv)&&/M\. et Mme Exemple/.test(tv)&&/1 rue du Test/.test(tv)&&/FICHE N° 1/.test(tv)&&/Vierge · 29\/09\/2026/.test(tv),'en-tête : dossier, client, adresse, numéro de fiche');
chk(V.pages.every(pg=>pg.filter(e=>e.t==='rect'&&e.plein&&e.w===7&&e.h===7).length===4),'quatre repères sur chaque page');
chk(V.pages.every(pg=>pg.some(e=>e.t==='image'&&e.im===LOGO)),'le logo sur chaque page');
chk(/Signatures|SIGNATURES/.test(tv)&&/MODE D’EMPLOI/.test(tv),'mode d’emploi en première page, signatures à la fin');

/* --- texte : coupe et largeur --- */
chk(M.pdfCouper('Semelles filantes conformément à l’étude de sol',8,false,30).length>1,'un long texte passe à la ligne');
chk(Math.abs(M.pdfLargeur('MMMM',10,false)-4*833*10/1000*25.4/72)<0.01,'largeur d’un texte en mm');

/* --- PDF --- */
const octets=M.pdfVectoriel(P.pages,'Fiche MAP n° 2 — Maison Exemple');
fs.writeFileSync(path.join(SORTIE,'fiche_map.pdf'),octets);
const txt=Buffer.from(octets).toString('latin1');
chk(txt.startsWith('%PDF-1.4')&&/\/Count \d+/.test(txt)&&txt.trim().endsWith('%%EOF'),'PDF : en-tête, pages, fin');
chk(new RegExp('/Count '+P.pages.length).test(txt)&&/Helvetica-Bold/.test(txt)&&/WinAnsiEncoding/.test(txt),'PDF : autant de pages que la mise en page, polices de base');
chk(txt.indexOf('(Actuel : Vide sanitaire)')>0&&txt.indexOf('Hörmann'.replace('ö','\xf6'))>0,'PDF : le texte en WinAnsi (accents)');
/* le tableau des positions (xref) pointe bien sur chaque objet */
const xref=txt.slice(txt.lastIndexOf('\nxref'),txt.lastIndexOf('trailer'));
const offs=[...xref.matchAll(/(\d{10}) 00000 n/g)].map(x=>+x[1]);
chk(offs.length>6&&offs.every((o,i)=>txt.slice(o,o+12).startsWith((i+1)+' 0 obj')),'PDF : table des objets exacte');

/* --- le bouton de l'onglet MAP --- */
(async()=>{
  let enreg=null;
  let tr;
  TR.act(()=>{tr=TR.create(React.createElement(M.FicheMapPapier,{data,ch,m:ch.map,set:p=>{enreg=p}}))});
  const bouton=re=>tr.root.findAll(n=>n.type==='button').find(n=>re.test(norm(texteInst(n))));
  await TR.act(async()=>{await bouton(/Fiche préremplie/).props.onClick()});
  const f=enreg&&enreg.fiches&&enreg.fiches[0];
  chk(f&&f.numero===1&&f.mode==='preremplie'&&f.cases.length>100&&f.zones.length>50,'le bouton enregistre la fiche et sa disposition avec la MAP');
  chk(/Fiche MAP n°1 — Maison Exemple — préremplie\.pdf/.test(norm(texteInst(tr.root))),'le bouton annonce la fiche produite');
  fin();
})().catch(e=>{console.error(e);process.exitCode=1});
