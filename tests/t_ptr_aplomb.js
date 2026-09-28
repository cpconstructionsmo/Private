/* Photos du modèle d'aplomb : les dimensions déclarées correspondent aux
   fichiers (9 images étaient tournées par Word dans le document d'origine,
   pas dans le fichier), et une photo copiée avant la correction, avec
   l'ancienne largeur / hauteur, sort quand même dans les bonnes
   proportions. */
const {charger,verif}=require('./harness');const fs=require('fs');
const M=charger(['ptrBiblioInitiale','ptrDimensionsBrutes','ptrNouveauProgramme','ptrProjet','genererProgrammeDocx','zipEntree','ptrBiblio','EMPTY']);
const {chk,fin}=verif();
const b=M.ptrBiblioInitiale();
const photos=b.prestations.flatMap(p=>p.variantes).flatMap(v=>v.photos);
const faux=photos.filter(ph=>{const d=M.ptrDimensionsBrutes(new Uint8Array(fs.readFileSync(RACINE+'/assets/ptr/'+ph.fichier)));return !d||d.w!==ph.w||d.h!==ph.h})
  .map(ph=>ph.fichier+' déclaré '+ph.w+'×'+ph.h);
chk(!faux.length,'les '+photos.length+' photos du modèle ont les dimensions de leur fichier'+(faux.length?' — '+faux.join(', '):''));
chk(photos.find(p=>p.fichier==='image20.jpeg').h>photos.find(p=>p.fichier==='image20.jpeg').w,'l’écran de sous-toiture (image20) est bien en portrait');
/* un programme ancien : photo image20 copiée avec 520 × 390 */
const data={...M.EMPTY,prospects:[{id:'p1',nom:'Maison Test',client:'Test',commune:'X'}]};
const prog=M.ptrNouveauProgramme(M.ptrBiblio(data),{prospectId:'p1'},'modele');
prog.lignes.forEach(l=>{l.photos=(l.photos||[]).filter(ph=>ph.fichier==='image20.jpeg').map(ph=>({...ph,w:520,h:390}))});
(async()=>{
  const {octets}=await M.genererProgrammeDocx(prog,M.ptrProjet({...data,programmes:[prog]},prog),M.ptrBiblio(data));
  const xml=new TextDecoder().decode(await M.zipEntree(octets.buffer.slice(octets.byteOffset,octets.byteOffset+octets.byteLength),'word/document.xml'));
  const ext=xml.split('<w:drawing>').slice(1).filter(x=>/name="image20\.jpeg"/.test(x)).map(x=>{const m=x.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/);return +m[1]/+m[2]});
  chk(ext.length>0&&ext.every(r=>Math.abs(r-390/520)<0.01),'photo copiée avec les anciennes dimensions : rendue en portrait, sans déformation ('+ext.map(r=>r.toFixed(3)).join(', ')+')');
  fin();
})();
