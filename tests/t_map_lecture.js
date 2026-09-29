/* Relecture d'une fiche MAP remplie : la page est rendue depuis le vrai PDF
   (pdftoppm) quand il est disponible, sinon dessinée ici ; on y coche des
   cases, on écrit dans des cadres, puis on la « photographie » de biais,
   tournée, mal éclairée et bruitée. La lecture doit retrouver la page, la
   fiche et les coches, et l'analyse proposer les bons changements sans
   toucher à ce qui n'a pas été coché. */
const fs=require('fs');const path=require('path');const {execFileSync}=require('child_process');
const {charger,verif,SORTIE}=require('./harness');
const M=charger(['ficheAppliquer','ficheAnnulerImport','ficheMapMiseEnPage','pdfVectoriel','ficheLocaliser','ficheMesurerPage','ficheAnalyser','ficheRedresser',
  'ficheHomographie','fichePoint','FICHE_CASE','EMPTY']);
const {chk,fin}=verif();
const LOGO={jpeg:new Uint8Array(require('fs').readFileSync(require('path').join(__dirname,'..','assets','logo_fiche.jpg'))),w:600,h:395};

const data={...M.EMPTY,produits:[{id:'pr1',nom:'Porte Renomatic',marque:'Hörmann',lot:'Menuiseries ext.'},{id:'pr2',nom:'Porte Thermo',marque:'Hörmann',lot:'Menuiseries ext.'}],
  chantiers:[{id:'c1',nom:'Maison Exemple',client:'M. Exemple',adresse:'1 rue du Test',
    map:{soubassement:'Dalle sur terre-plein',gaz:'Sans objet',travauxPrepa:['Débroussaillage'],vsTrappe:true}}]};
const ch=data.chantiers[0];
const {pages,disposition:D}=M.ficheMapMiseEnPage(ch,data,{mode:'preremplie',numero:5,date:'2026-09-29',logo:LOGO});
const PXMM=150/25.4;

/* --- la page, en niveaux de gris, à 150 points par pouce --- */
function pageImage(k){
  const fichier=path.join(SORTIE,'lecture.pdf');
  fs.writeFileSync(fichier,M.pdfVectoriel(pages,'x'));
  try{
    execFileSync('pdftoppm',['-gray','-r','150','-f',String(k+1),'-l',String(k+1),fichier,path.join(SORTIE,'lecture')]);
    const f=fs.readdirSync(SORTIE).find(x=>/^lecture-0*\d+\.pgm$/.test(x)&&+x.match(/(\d+)\.pgm/)[1]===k+1);
    const b=fs.readFileSync(path.join(SORTIE,f));
    const t=b.toString('latin1',0,40).split(/\s+/);
    const w=+t[1],h=+t[2],debut=b.indexOf('255\n')+4;
    return {w,h,g:new Uint8Array(b.subarray(debut,debut+w*h)),source:'pdftoppm'};
  }catch(e){
    /* sans poppler : les rectangles seulement (repères, code, cases, cadres) */
    const w=Math.round(210*PXMM),h=Math.round(297*PXMM),g=new Uint8Array(w*h).fill(255);
    pages[k].filter(e=>e.t==='rect').forEach(e=>{
      const x0=Math.round(e.x*PXMM),y0=Math.round(e.y*PXMM),x1=Math.round((e.x+e.w)*PXMM),y1=Math.round((e.y+e.h)*PXMM);
      const v=Math.round(255*(e.gris||0));
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
        const bord=x<x0+2||x>=x1-2||y<y0+2||y>=y1-2;
        if(e.plein||bord)g[y*w+x]=e.plein?v:Math.round(255*(e.traitGris!==undefined?e.traitGris:(e.gris||0)));
      }
    });
    return {w,h,g,source:'dessin'};
  }
}
/* un trait au stylo, entre deux points en mm */
const stylo=(img,x1,y1,x2,y2,ep)=>{
  const n=Math.ceil(Math.hypot(x2-x1,y2-y1)*PXMM*2);
  for(let i=0;i<=n;i++){const x=(x1+(x2-x1)*i/n)*PXMM,y=(y1+(y2-y1)*i/n)*PXMM,r=(ep||0.5)*PXMM/2;
    for(let yy=Math.floor(y-r);yy<=y+r;yy++)for(let xx=Math.floor(x-r);xx<=x+r;xx++)
      if((xx-x)**2+(yy-y)**2<=r*r&&xx>=0&&yy>=0&&xx<img.w&&yy<img.h)img.g[yy*img.w+xx]=40;}
};
const cocher=(img,c)=>{const s=M.FICHE_CASE;stylo(img,c.x+0.6,c.y+1.8,c.x+1.5,c.y+s-0.5);stylo(img,c.x+1.5,c.y+s-0.5,c.x+s+0.8,c.y-0.8)};
const ecrire=(img,z)=>{for(let i=0;i<6;i++)stylo(img,z.x+3+i*4,z.y+z.h*0.7,z.x+5+i*4,z.y+z.h*0.3,0.45)};
/* la photo : la page posée de biais sur une table, dans une image plus
   grande, tournée d'un quart de tour ou d'un demi-tour, éclairée d'un côté */
function photo(src,rotation,bruit){
  const W=1700,Hh=2300;
  const coins=[[180,140],[1560,230],[1480,2120],[90,2210]];
  const rot=coins;
  const H=M.ficheHomographie([[0,0],[src.w,0],[src.w,src.h],[0,src.h]],rot);
  const Hi=M.ficheHomographie(rot,[[0,0],[src.w,0],[src.w,src.h],[0,src.h]]);
  const g=new Uint8Array(W*Hh);
  let graine=7;const alea=()=>{graine=(graine*16807)%2147483647;return graine/2147483647};
  for(let y=0;y<Hh;y++)for(let x=0;x<W;x++){
    const [sx,sy]=M.fichePoint(Hi,x,y);
    let v=sx>=0&&sy>=0&&sx<src.w&&sy<src.h?src.g[Math.floor(sy)*src.w+Math.floor(sx)]:95;
    v=v*(0.62+0.38*x/W);
    if(bruit)v+=(alea()-0.5)*bruit;
    g[y*W+x]=Math.max(0,Math.min(255,Math.round(v)));
  }
  /* l'appareil tenu de travers : l'image entière tourne d'un quart de tour */
  let im={w:W,h:Hh,g};
  for(let k=0;k<rotation;k++){
    const t=new Uint8Array(im.w*im.h),nw=im.h,nh=im.w;
    for(let y=0;y<im.h;y++)for(let x=0;x<im.w;x++)t[x*nw+(nw-1-y)]=im.g[y*im.w+x];
    im={w:nw,h:nh,g:t};
  }
  return im;
}

/* page 1 (index 0) : bornage « Non, à réaliser », gaz « Gaz de ville »,
   un cadre écrit ; soubassement (page 2, non photographiée) reste tel quel */
const img0=pageImage(0);
console.log('   (page rendue par '+img0.source+')');
const C0=D.cases.filter(c=>c.p===0);
const cible=(k,v)=>C0.find(c=>c.k===k&&c.v===v);
cocher(img0,cible('bornageFait','Non, à réaliser'));
cocher(img0,cible('gaz','Gaz de ville'));
cocher(img0,cible('travauxPrepa','Débroussaillage'));cocher(img0,cible('travauxPrepa','Démolition'));
cocher(img0,cible('elecCoffret','Posé'));cocher(img0,cible('elecCoffret','Non posé'));
ecrire(img0,D.zones.find(z=>z.p===0&&z.k==='telecom'));

const essais=[[0,0],[1,18],[2,24],[3,12]];
const mesures=[];
essais.forEach(([rotation,bruit])=>{
  const ph=photo(img0,rotation,bruit);
  const L=M.ficheLocaliser(ph);
  chk(L.page===0&&L.numero===5,'photo tournée de '+(rotation*90)+'°, bruit '+bruit+' : page 1 de la fiche n° 5 reconnue'+(L.erreur?' — '+L.erreur:''));
  if(!L.H)return;
  const m=M.ficheMesurerPage(ph,L.H,D,0);
  const coches=m.cases.filter(c=>c.coche).map(c=>c.k+'='+c.v).sort();
  const attendu=['bornageFait=Non, à réaliser','elecCoffret=Non posé','elecCoffret=Posé','gaz=Gaz de ville','travauxPrepa=Débroussaillage','travauxPrepa=Démolition'].sort();
  chk(coches.join('|')===attendu.join('|'),'  les six coches, et rien d’autre'+(coches.join('|')===attendu.join('|')?'':' — lu : '+coches.join(', ')));
  const ecrits=m.zones.filter(z=>z.ecrit).map(z=>z.k);
  chk(ecrits.join()==='telecom','  un seul cadre écrit : télécom'+(ecrits.join()==='telecom'?'':' — lu : '+ecrits.join(', ')));
  if(rotation===1)mesures.push({page:0,...m});
});
chk(M.ficheLocaliser({w:800,h:1000,g:new Uint8Array(800*1000).fill(230)}).erreur,'une photo sans fiche : erreur expliquée');
/* une page vierge avec de grands cadres (lignes d'écriture pâles) : rien de lu */
const kZ=D.zones.find(z=>z.k==='modifTerrain').p;
const phZ=photo(pageImage(kZ),0,14), LZ=M.ficheLocaliser(phZ);
const mZ=LZ.H?M.ficheMesurerPage(phZ,LZ.H,D,kZ):{cases:[{coche:true}],zones:[]};
chk(LZ.page===kZ&&!mZ.cases.some(c=>c.coche)&&!mZ.zones.some(z=>z.ecrit),'page vierge aux grands cadres : aucune coche, aucun cadre écrit');

/* --- l'analyse --- */
const A=M.ficheAnalyser(D,mesures,ch.map,data);
const par=k=>A.champs.find(x=>x.k===k);
chk(par('bornageFait')&&par('bornageFait').propose==='Non, à réaliser'&&par('bornageFait').actuelVide,'champ vide : la valeur cochée est proposée');
chk(par('gaz')&&par('gaz').propose==='Gaz de ville'&&par('gaz').actuel==='Sans objet'&&!par('gaz').actuelVide,'champ déjà saisi : le changement est proposé, avec la valeur actuelle');
chk(par('travauxPrepa')&&par('travauxPrepa').propose.join()==='Débroussaillage,Démolition','plusieurs choix : la liste cochée');
chk(par('elecCoffret')&&par('elecCoffret').conflit&&par('elecCoffret').propose===undefined,'deux cases pour un choix unique : à trancher');
chk(par('telecom')&&par('telecom').aRecopier,'cadre écrit : à recopier');
chk(!par('soubassement')&&!par('vsTrappe'),'page non photographiée : rien n’est proposé');
chk(A.pagesManquantes.length===D.nbPages-1&&A.pagesManquantes[0]===2,'les pages manquantes sont signalées');

/* --- un cadre redressé pour être recopié --- */
const ph=photo(img0,1,10), L=M.ficheLocaliser(ph);
const z=D.zones.find(x=>x.p===0&&x.k==='telecom');
const r=M.ficheRedresser(ph,L.H,z.x,z.y,z.w,z.h,6);
let sombre=0;for(const v of r.g)if(v<90)sombre++;
chk(r.w===Math.round(z.w*6)&&r.h===Math.round(z.h*6)&&sombre>20,'le cadre écrit, redressé, montre l’écriture');

/* --- enregistrer, puis annuler --- */
const m0={...ch.map};
const {map:m1,entree}=M.ficheAppliquer(m0,{
  bornageFait:{action:'prendre',valeur:'Non, à réaliser'},
  gaz:{action:'garder',valeur:'Gaz de ville'},
  travauxPrepa:{action:'prendre',valeur:['Débroussaillage','Démolition']},
  telecom:{action:'prendre',valeur:'  '},
},[{type:'chiffrer',lot:'Plomberie',texte:'Ajouter un robinet extérieur'},{type:'decision',texte:''}],{numero:5,pages:[1]});
chk(m1.bornageFait==='Non, à réaliser'&&m1.travauxPrepa.join()==='Débroussaillage,Démolition','seuls les champs « Prendre la fiche » changent');
chk(m1.gaz==='Sans objet'&&m1.telecom===undefined,'« Garder l’actuel » et un texte vide ne changent rien');
chk(m1.suivi.length===1&&m1.suivi[0].type==='chiffrer'&&m1.suivi[0].source==='Fiche n° 5','le point de suivi recopié est ajouté, la ligne vide ne l’est pas');
chk(entree.avant.bornageFait===null&&entree.avant.travauxPrepa.join()==='Débroussaillage'&&m1.importsFiche.length===1,'l’import garde les valeurs d’avant');
const m2={...m1,travauxPrepa:['Busage du fossé']};
const {map:m3,gardes}=M.ficheAnnulerImport(m2,entree.id);
chk(m3.bornageFait===undefined&&m3.travauxPrepa.join()==='Busage du fossé'&&gardes.includes('travauxPrepa'),'annuler : retour en arrière, sauf ce qui a été retouché depuis');
chk(!m3.suivi.length&&m3.importsFiche[0].annuleLe,'annuler : le point ajouté part, l’import est noté annulé');
fin();
