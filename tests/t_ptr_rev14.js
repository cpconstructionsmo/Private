/* Révision 14 : portes intérieures FUJI (Menuiseries d'Olt, mélaminé,
   huisserie KM1) et portes à galandage FUJI coulissant, fiche jointe. */
const {charger,verif}=require('./harness');
const {execFileSync}=require('child_process');const fs=require('fs');
const M=charger(['ptrBiblio','ptrBiblioInitiale','ptrAlertesPrestation','EMPTY']);
const {chk,fin}=verif();
const r13=biblioRev('rev13');
const V=(bib,id)=>bib.prestations.flatMap(p=>p.variantes).find(v=>v.id===id);
const b=M.ptrBiblioInitiale();
const p=V(b,'var_portes_interieures_a'), g=V(b,'var_portes_interieures_galandage_a');
chk(/modèle \*\*FUJI\*\*/.test(p.texte)&&/KM1/.test(p.texte)&&/72 à 100 mm/.test(p.texte)&&/Ud = 1,2 W\/m²\.K/.test(p.texte)&&!/prépeint blanc/.test(p.texte),'portes intérieures : Fuji mélaminé, huisserie KM1 72 à 100 mm, porte isotherme Ud 1,2');
chk(/FUJI\*\* coulissant/.test(g.texte)&&/galandage/.test(g.texte)&&/PLACOSTYL de 100 mm/.test(g.texte),'portes à galandage : Fuji coulissant dans la cloison Placostyl de 100 mm');
chk(p.photos.length===3&&p.photos[0].fichier==='fuji_frene_blanc.jpeg'&&p.pieces.length===1&&g.photos.length===1&&g.pieces.length===1,'photos et fiche jointes aux deux prestations');
chk([...p.photos,...p.pieces,...g.photos].every(x=>fs.existsSync(RACINE+'/assets/ptr/'+x.fichier)),'fichiers présents');
chk(!['pr_portes_interieures','pr_portes_interieures_galandage'].some(id=>{const x=b.prestations.find(q=>q.id===id);return M.ptrAlertesPrestation(x,b).some(a=>/faute|accent|colle|dim:|espaces|unite/.test(a.cle))}),'textes sans faute signalée');
const m=M.ptrBiblio({...M.EMPTY,ptrBiblio:JSON.parse(JSON.stringify(r13))});
chk(m.seedRev===22&&V(m,'var_portes_interieures_a').texte===p.texte&&V(m,'var_portes_interieures_galandage_a').texte===g.texte&&V(m,'var_portes_interieures_galandage_a').pieces.length===1,'bibliothèque de révision 13 : textes, photos et fiche reçus');
fin();
