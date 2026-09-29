/* Conversion du code de l'application, une fois, au moment de la publication.

   index.html reste le seul fichier source, édité tel quel (JSX dans un
   <script type="text/babel">). Sans cette étape, chaque ouverture de la page
   télécharge Babel (environ 3 Mo) puis convertit les quelque 18 000 lignes
   dans le navigateur : plusieurs secondes sur un téléphone.

   Ici, dans le déploiement GitHub Pages, on fait cette conversion une fois,
   avec les mêmes réglages que le navigateur (JSX de React, syntaxe moderne
   gardée pour les navigateurs récents), et on publie une page qui n'a plus
   besoin de Babel. Si la conversion échoue, index.html n'est pas modifié :
   la page est publiée comme avant, rien ne casse.

   Usage : node outils/compiler_publication.js [entrée] [sortie]
   (par défaut, index.html est converti sur place : à ne lancer que dans le
   déploiement ou sur une copie, jamais avant un commit). */
const fs = require('fs'), path = require('path'), vm = require('vm');

const racine = path.resolve(__dirname, '..');
const entree = process.argv[2] || path.join(racine, 'index.html');
const sortie = process.argv[3] || entree;
const babel = require(process.env.BABEL_STANDALONE || path.join(racine, 'tests/node_modules/@babel/standalone'));

const html = fs.readFileSync(entree, 'utf8');
const blocs = [...html.matchAll(/<script type="text\/babel">([\s\S]*?)<\/script>/g)];
if (blocs.length !== 1) throw new Error(`un seul <script type="text/babel"> attendu, ${blocs.length} trouvé(s)`);

const t0 = Date.now();
const code = babel.transform(blocs[0][1], {
  presets: [['react', { runtime: 'classic' }],
            ['env', { modules: false, targets: { safari: '14', ios: '14', chrome: '90', edge: '90', firefox: '90' } }]],
  compact: false, comments: false, sourceType: 'script',
}).code;
// le code converti doit être du JavaScript valide avant d'être publié
new vm.Script(code, { filename: 'application.js' });

let page = html.replace(blocs[0][0], () =>
  '<script>\n/* Code converti à la publication (outils/compiler_publication.js) : le source est dans index.html du dépôt. */\n'
  + code + '\n</script>');
// Babel n'est plus nécessaire dans la page publiée
const avant = page.length;
page = page.replace(/<script src="[^"]*@babel\/standalone[^"]*"[^>]*><\/script>\s*/g, '');
if (page.length === avant) throw new Error('balise de chargement de Babel introuvable');
fs.writeFileSync(sortie, page);
console.log(`Converti en ${Date.now() - t0} ms : ${Math.round(blocs[0][1].length / 1024)} Ko de source → ${Math.round(code.length / 1024)} Ko ; Babel retiré de la page.`);
