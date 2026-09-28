/* Révision 3 : plancher sur vide sanitaire en hourdis isolants (garage en
   hourdis plastique) ; lecture des photos robuste (JPEG/PNG gardés tels
   quels si le navigateur ne sait pas les redessiner, HEIC expliqué). */
const {charger,verif}=require('./harness');
const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrNormaliserImage','ptrDimensionsBrutes','ptrAlertesPrestation','EMPTY']);
const {chk,fin}=verif();
const b=M.ptrBiblioInitiale();
const pl=b.prestations.find(p=>p.id==='pr_planchers');
const vB=pl.variantes.find(v=>v.id==='var_planchers_b');
chk(vB&&/hourdis\) \*\*isolants\*\*/.test(vB.texte)&&/Garage \(volume non chauffé\) : poutrelles béton et hourdis plastique/.test(vB.texte),'planchers : proposition vide sanitaire en hourdis isolants, garage en hourdis plastique');
chk(vB.photos.length===2&&vB.photos.every(ph=>fs.existsSync(RACINE+'/assets/ptr/'+ph.fichier)),'avec les deux photos du chantier');
chk(!vB.parDefaut&&pl.variantes[0].parDefaut,'la proposition standard reste celle par défaut');
chk(!M.ptrAlertesPrestation(pl,b).some(a=>/faute|accent|colle|dim:/.test(a.cle)),'texte sans faute');

/* une bibliothèque enregistrée en révision 2, retouchée par l'utilisateur */
const r2=JSON.parse(JSON.stringify(b));r2.seedRev=2;
r2.prestations.find(p=>p.id==='pr_planchers').variantes=r2.prestations.find(p=>p.id==='pr_planchers').variantes.filter(v=>v.id!=='var_planchers_b');
const mA=r2.prestations.find(p=>p.id==='pr_murs').variantes[0];mA.texte='Murs — texte CP.';mA.version=3;mA.modifieLe='2026-09-26T13:00:00.000Z';
const bm=M.ptrBiblio({...M.EMPTY,ptrBiblio:r2});
chk(bm.seedRev===22&&bm.prestations.find(p=>p.id==='pr_planchers').variantes.some(v=>v.id==='var_planchers_b'&&!v.parDefaut),'révision 2 → 3 : la proposition hourdis isolants est ajoutée');
chk(bm.prestations.find(p=>p.id==='pr_murs').variantes[0].texte==='Murs — texte CP.','les retouches de l’utilisateur restent intactes');
chk(bm.prestations.find(p=>p.id==='pr_murs').variantes.filter(v=>v.id==='var_murs_b').length===1,'les propositions de la révision 2 ne sont pas dupliquées');

/* photos : le navigateur de test ne sait rien décoder (pas de canvas) —
   c'est le cas qui produisait « image illisible » */
(async()=>{
  const jpg=fs.readFileSync(RACINE+'/assets/ptr/plancher_hourdis_isolant.jpeg');
  const r=await M.ptrNormaliserImage(new File([jpg],'IMG_2041.jpeg',{type:''}));
  chk(r.w===1200&&r.h===1600&&r.ext==='jpeg'&&r.blob.size===jpg.length,'JPEG non redessinable : gardé tel quel, dimensions lues dans le fichier ('+r.w+'×'+r.h+')');
  const png=fs.readFileSync(RACINE+'/assets/ptr/image1.png');
  const rp=await M.ptrNormaliserImage(new File([png],'badge.png',{type:'image/png'}));
  chk(rp.ext==='png'&&rp.w>0&&rp.h>0,'PNG : idem ('+rp.w+'×'+rp.h+')');
  const heic=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypheic'),Buffer.alloc(64)]);
  let e1='';try{await M.ptrNormaliserImage(new File([heic],'IMG_2042.HEIC',{type:'image/heic'}))}catch(e){e1=e.message}
  chk(/HEIC/.test(e1)&&/Le plus compatible/.test(e1)&&/IMG_2042/.test(e1),'HEIC illisible : message qui explique quoi faire');
  let e2='';try{await M.ptrNormaliserImage(new File([Buffer.from('pas une image')],'note.txt'))}catch(e){e2=e.message}
  chk(/note\.txt » : image illisible — formats acceptés/.test(e2),'fichier qui n’est pas une image : message nominatif');
  const exif=fs.readFileSync(RACINE+'/tests/fixtures/photo_exif.jpg');
  const d=M.ptrDimensionsBrutes(new Uint8Array(exif));
  chk(d&&d.w===320&&d.h===240,'dimensions lues malgré un en-tête EXIF ('+(d&&d.w)+'×'+(d&&d.h)+')');
  fin();
})();
