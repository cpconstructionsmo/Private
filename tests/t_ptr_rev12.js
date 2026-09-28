/* Révision 12 : cloison PLACO UP STIL entre volumes chauffés et non
   chauffés, cloisons PLACOSTYL de 100 mm pour les portes à galandage. */
const {charger,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','EMPTY']);
const {chk,fin}=verif();
const r11=biblioRev('rev11');
const V=(bib,id)=>bib.prestations.flatMap(p=>p.variantes).find(v=>v.id===id);
const b=M.ptrBiblioInitiale();
const u=V(b,'var_cloisons_separation_volumes_non_chauffes_a'), c=V(b,'var_cloisons_100mm_a'), g=V(b,'var_portes_interieures_galandage_a');
chk(/PLACO UP STIL ou équivalent/.test(u.texte)&&/9\/16-1037/.test(u.texte)&&/Placomarine/.test(u.texte)&&/0,25 à 0,17 W\/m²\.K/.test(u.texte),'volumes non chauffés : Placo Up Stil, Avis Technique, Placomarine côté garage, Up 0,25 à 0,17');
chk(u.photos[0].fichier==='placo_upstil_coupe.jpeg'&&u.pieces.length===1&&[...u.photos,...u.pieces].every(x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier)),'coupe, photo et fiche système jointes');
chk(/PLACOSTYL de 100 mm/.test(c.texte)&&/portes à galandage/.test(c.texte)&&c.marque==='Placo','cloisons de 100 mm : Placostyl, destinées aux portes à galandage');
chk(/cloison PLACOSTYL de 100 mm/.test(g.texte),'les portes à galandage renvoient à la cloison Placostyl de 100 mm');
chk(!['pr_cloisons_separation_volumes_non_chauffes','pr_cloisons_100mm','pr_portes_interieures_galandage'].some(id=>{const p=b.prestations.find(x=>x.id===id);return M.ptrAlertesPrestation(p,b).some(a=>/faute|accent|colle|dim:|espaces|unite/.test(a.cle))}),'textes sans faute signalée');
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r11))});
chk(m.seedRev===22&&V(m,'var_cloisons_separation_volumes_non_chauffes_a').texte===u.texte&&V(m,'var_cloisons_separation_volumes_non_chauffes_a').pieces.length===1&&V(m,'var_cloisons_100mm_a').texte===c.texte,'bibliothèque de révision 11 : textes, photos et fiche reçus');
fin();
