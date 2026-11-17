/* Un scan FICTIF au format Apple RoomPlan (celui qu'exporte OpenPlan 3D) :
   une pièce de 4,00 × 3,97 m, hauteur scannée 2,10 m. `portesAuCoin()` y met
   deux portes de part et d'autre du même coin (0,726 m et 0,625 m) : la
   configuration d'un cas réel où une seule porte avait été vue deux fois.
   Aucune donnée de client. Partagé par t_releve_convertisseur.js et
   releve_plan_navigateur.js. */
const mat=(ux,uz,x,y,z)=>[ux,0,uz,0, 0,1,0,0, -uz,0,ux,0, x,y,z,1];
const mur=(id,ux,uz,x,z,L,h=2.10)=>({identifier:id,transform:mat(ux,uz,x,h/2,z),dimensions:[L,h,0.1]});
const porte=(id,parent,ux,uz,x,z,w,h=2.0)=>({identifier:id,parentIdentifier:parent,transform:mat(ux,uz,x,h/2,z),dimensions:[w,h,0.05]});
function scan(portes,fenetres=[]){
  return {
    walls:[mur('M1',1,0,2,0,4.00),mur('M2',1,0,2,3.97,4.00),mur('M3',0,1,0,1.985,3.97),mur('M4',0,1,4,1.985,3.97)],
    doors:portes, windows:fenetres, openings:[],
    floors:[{identifier:'S',transform:mat(1,0,2,0,1.985),dimensions:[4,3.97,0]}],
  };
}
const portesAuCoin=()=>[porte('P1','M1',1,0,4-0.05-0.363,0,0.726),porte('P2','M4',0,1,4,0.05+0.3125,0.625)];
module.exports={mat,mur,porte,scan,portesAuCoin};
