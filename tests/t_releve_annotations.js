/* Relevé de visite — le plan annoté (releve/annotations.js) : annotations
   relues sans rien inventer, traits allégés, résumé. */
const {verif}=require('./harness');
const {chk,fin}=verif();
(async()=>{
  const A=await import('../releve/annotations.js');
  const a=A.nettoyer({fondId:'f1',source:'planPapier',empreinte:'e',imageId:'i',elements:[
    {type:'trait',c:'#D62828',p:[[0.1,0.1],[0.2,0.25],['x',1]]},
    {type:'trait',c:'#D62828',p:[[0.1,0.1]]},                       // un seul point : écarté
    {type:'fleche',c:'#ABCDEF',a:[0.1,0.1],b:[1.5,0.5]},            // couleur inconnue → rouge ; hors cadre → borné
    {type:'fleche',c:'#1F6FEB',a:[0.3,0.3],b:[0.3,0.3]},            // longueur nulle : écartée
    {type:'texte',c:'#111111',x:0.5,y:0.5,t:'  Démolir\u0007 mur  '},
    {type:'texte',c:'#111111',x:0.5,y:0.5,t:'   '},                 // vide : écarté
    {type:'inconnu'},null]});
  chk(a.fondId==='f1'&&a.source==='planPapier'&&a.imageId==='i'&&a.elements.length===3,'annotations relues : fond gardé, éléments mal formés écartés');
  chk(a.elements[0].p.length===2&&a.elements[1].c==='#D62828'&&a.elements[1].b[0]===1&&a.elements[2].t==='Démolir  mur','points invalides retirés, couleur inconnue ramenée au rouge, coordonnées bornées, texte nettoyé');
  chk(A.nettoyer(null).elements.length===0&&A.nettoyer({source:'x'}).source==='plan','rien d’enregistré : aucune annotation, fond « plan » par défaut');
  const pts=[];for(let i=0;i<=100;i++)pts.push([i/1000,0]);
  const s=A.simplifier(pts);
  chk(s.length<=52&&s[0]===pts[0]&&s[s.length-1]===pts[100],'un trait au doigt est allégé (101 → '+s.length+' points), début et fin gardés');
  chk(A.resume(a.elements)==='1 trait, 1 flèche, 1 texte'&&A.resume([])==='aucune annotation','résumé : « 1 trait, 1 flèche, 1 texte »');
  const ops=[];const ctx=new Proxy({measureText:t=>({width:t.length*5})},{get:(o,k)=>k in o?o[k]:(...x)=>ops.push(k),set:(o,k,v)=>{o[k]=v;return true}});
  A.rendre(ctx,1000,800,a.elements);
  chk(ops.includes('stroke')&&ops.includes('fill')&&ops.includes('fillText'),'rendu : traits, pointe de flèche et texte dessinés');
  /* le texte : taille, style, toucher pour le reprendre */
  const tx=A.nettoyer({elements:[{type:'texte',c:'#111111',x:0.5,y:0.5,t:'A',taille:'xl',police:'manuscrit'},{type:'texte',c:'#111111',x:0.1,y:0.1,t:'B',taille:'géant',police:'gothique'}]}).elements;
  chk(tx[0].taille==='xl'&&tx[0].police==='manuscrit'&&tx[1].taille==='m'&&tx[1].police==='normal','texte : taille et style gardés ; inconnus → moyen, normal');
  const ctx2={font:'',textBaseline:'',measureText:t=>({width:t.length*10})};
  const bx=A.boiteTexte(ctx2,1000,800,{x:0.5,y:0.5,t:'Démolir / mur',taille:'l',police:'capitales'});
  chk(bx.lignes.join('|')==='DÉMOLIR|MUR'&&bx.fs===50&&/700 50px/.test(ctx2.font),'boîte du texte : lignes (« / »), capitales, taille grand (50 px pour 1000 px)');
  chk(A.texteSous(ctx2,1000,800,[{type:'trait',p:[[0,0],[1,1]]},{type:'texte',x:0.5,y:0.5,t:'Texte',taille:'m',police:'normal'}],505,402)===1&&A.texteSous(ctx2,1000,800,[{type:'texte',x:0.5,y:0.5,t:'X',taille:'m',police:'normal'}],50,50)===-1,'toucher un texte le retrouve ; ailleurs, rien');
  fin();
})();
