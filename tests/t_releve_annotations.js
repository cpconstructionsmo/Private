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
  /* symboles, taille libre, déplacement */
  const n=A.nettoyer({elements:[{type:'symbole',c:'#1F6FEB',s:'fenetre',x:0.3,y:0.4,rot:100,k:500},{type:'symbole',s:'inconnu',x:0.3,y:0.4},
    {type:'symbole',s:'porte',x:2,y:-1,rot:-90},{type:'texte',t:'Petit',x:0.1,y:0.1,pt:0.2},{type:'texte',t:'Libre',x:0.1,y:0.1,pt:12.34}]}).elements;
  chk(n.length===4&&n[0].rot===90&&n[0].k===160&&n[1].x===1&&n[1].y===0&&n[1].rot===270&&n[1].k===34,'symboles relus : inconnu écarté, quart de tour, taille et position bornées');
  chk(n[2].pt===3&&n[3].pt===12.3,'taille libre du texte bornée (3 à 120 ‰), arrondie au dixième');
  chk(A.SYMBOLES.length===5&&A.OUTILS.some(([k])=>k==='deplacer')&&A.OUTILS.some(([k])=>k==='symbole'),'cinq symboles et les outils Symbole et Déplacer');
  const d=A.decaler({type:'fleche',a:[0.1,0.1],b:[0.2,0.3]},0.1,0.2),t2=A.decaler({type:'trait',p:[[0,0],[0.5,0.5]]},0.1,0);
  chk(Math.abs(d.a[0]-0.2)<1e-9&&Math.abs(d.b[1]-0.5)<1e-9&&t2.p[1][0]===0.6,'déplacer une flèche ou un trait d’un bloc');
  const cx={font:'',textBaseline:'',measureText:t=>({width:t.length*10})};
  chk(A.elementSous(cx,1000,800,[{type:'fleche',a:[0.1,0.1],b:[0.5,0.1]},{type:'symbole',s:'porte',x:0.8,y:0.8,k:34}],300,82)===0&&A.elementSous(cx,1000,800,[{type:'symbole',s:'porte',x:0.8,y:0.8,k:34}],800,640)===0&&A.elementSous(cx,1000,800,[{type:'fleche',a:[0.1,0.1],b:[0.5,0.1]}],300,400)===-1,'élément sous le doigt : flèche (sa ligne), symbole (son disque), rien ailleurs');
  chk(A.resume([{type:'symbole'},{type:'texte'}])==='1 texte, 1 symbole','résumé : textes et symboles');
  fin();
})();
