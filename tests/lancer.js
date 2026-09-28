/* Lance tous les tests t_*.js (un processus chacun : le chargeur garde le
   code de l'application en mémoire) et fait le compte. Avec --navigateur,
   lance aussi les vérifications dans Chromium (*_navigateur.js). */
const {spawnSync}=require('child_process');const fs=require('fs');const path=require('path');
const avecNavigateur=process.argv.includes('--navigateur');
const fichiers=fs.readdirSync(__dirname).filter(f=>/^t_.*\.js$/.test(f)||(avecNavigateur&&/_navigateur\.js$/.test(f))).sort();
let ko=[];
for(const f of fichiers){
  const r=spawnSync(process.execPath,[path.join(__dirname,f)],{cwd:__dirname,encoding:'utf8',maxBuffer:1e8,timeout:300000});
  const sortie=(r.stdout||'')+(r.stderr||'');
  const bon=r.status===0&&/Tout est bon\./.test(sortie);
  console.log((bon?'OK  ':'KO  ')+f);
  if(!bon){ko.push(f);console.log(sortie.split('\n').filter(l=>/^KO|Error|echec/.test(l)).slice(0,8).map(l=>'      '+l).join('\n'))}
}
console.log('\n'+(fichiers.length-ko.length)+' / '+fichiers.length+' fichiers de test réussis'+(ko.length?' — échecs : '+ko.join(', '):''));
process.exitCode=ko.length?1:0;
