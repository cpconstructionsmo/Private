/* Relevé de visite — la visionneuse (releve/zoom.js) : zoom borné, point visé
   gardé sous le doigt, image jamais sortie du cadre. */
const {verif}=require('./harness');
const {chk,fin}=verif();
(async()=>{
  const Z=await import('../releve/zoom.js');
  chk(Z.borner(0.2)===1&&Z.borner(20)===8&&Z.borner(3)===3,'zoom borné entre 1 et 8');
  const e=Z.zoomer({s:1,x:0,y:0},2,100,50);
  chk(e.s===2&&e.x===-100&&e.y===-50,'zoomer ×2 sur un point : il reste sous le doigt');
  chk(JSON.stringify(Z.zoomer({s:2,x:-100,y:-50},0.4))===JSON.stringify({s:1,x:0,y:0}),'revenir à 1 : l’image se recentre');
  chk(JSON.stringify(Z.cadrer({s:2,x:-900,y:300},400,300))===JSON.stringify({s:2,x:-200,y:150}),'déplacement borné à ce qui dépasse du cadre');
  chk(JSON.stringify(Z.cadrer({s:1,x:50,y:-20},400,300))===JSON.stringify({s:1,x:0,y:0}),'sans zoom : pas de déplacement');
  fin();
})();
