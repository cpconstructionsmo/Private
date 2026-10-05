/* Parcours dans un vrai navigateur (Chromium, Playwright) : la page compilée
   (build/) s'ouvre, on dessine une maison à la souris et au clavier comme
   un utilisateur, puis on vérifie le modèle. Sans connexion : le Designer
   travaille en mode local (aucun appel au serveur de production).

   Lancement : npm run test:navigateur (compile d'abord). Chromium :
   /opt/pw-browsers/chromium, ou la variable CHROMIUM. */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { deflateSync } from 'node:zlib';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const racine = fileURLToPath(new URL('../../build/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.map': 'application/json' };
const serveur = createServer(async (req, res) => {
  const chemin = normalize(join(racine, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!chemin.startsWith(racine)) { res.writeHead(403); return res.end() }
  try { const d = await readFile(chemin.endsWith('/') ? join(chemin, 'index.html') : chemin); res.writeHead(200, { 'content-type': TYPES[extname(chemin)] ?? 'application/octet-stream' }); res.end(d) }
  catch { res.writeHead(404); res.end() }
}).listen(0);
const port = serveur.address().port;

/* une image PNG fictive (un plan au trait), fabriquée ici : aucun document réel */
function png(l, h) {
  const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } let x = 0xffffffff; for (const o of b) x = t[(x ^ o) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0 };
  const bloc = (type, d) => { const L = Buffer.alloc(4); L.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type), d]); const C = Buffer.alloc(4); C.writeUInt32BE(crc(td)); return Buffer.concat([L, td, C]) };
  const lignes = [];
  for (let y = 0; y < h; y++) { const r = Buffer.alloc(1 + l); for (let x = 0; x < l; x++) r[1 + x] = (x === 20 || x === l - 21 || y === 20 || y === h - 21) ? 0 : 255; lignes.push(r) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(l, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', deflateSync(Buffer.concat(lignes))), bloc('IEND', Buffer.alloc(0))]);
}
/* un PDF fictif d'une page (un rectangle) */
function pdf() {
  const flux = '2 w 50 50 500 300 re S';
  const objets = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Contents 4 0 R >>', `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`];
  let s = '%PDF-1.4\n'; const pos = [];
  objets.forEach((o, i) => { pos.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n` });
  const x = s.length;
  s += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n` + pos.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(s, 'latin1');
}

/* WebGL sans carte graphique (la vue 3D) : le rendu logiciel de Chromium */
const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
let echec = null;
try {
  const p = await navigateur.newPage({ viewport: { width: 1400, height: 860 } });
  const erreurs = [];
  p.on('pageerror', e => { erreurs.push(e.message); if (process.env.CAPTURE_ECHEC) console.log('ERREUR PAGE', e.message) });
  /* le parcours trace des murs « sur mesure » de 20 cm (ses surfaces attendues en dépendent) ; les compositions ont leur propre étape */
  console.log('ÉTAPE 55');
  await p.addInitScript(() => { if (!localStorage.getItem('cpDesigner:compositions')) localStorage.setItem('cpDesigner:compositions', JSON.stringify({ exterieur: '', interieur: '', cloison: '' })) });
  console.log('ÉTAPE 56');
  await p.goto(`http://localhost:${port}/index.html?chantier=essai-e2e`);
  console.log('ÉTAPE 57');
  await p.waitForSelector('.cpd canvas.plan2d');
  console.log('ÉTAPE 58');
  await p.waitForFunction(() => window.cpDesigner);
  const etat = await p.textContent('.etat');
  assert.match(etat, /Non connecté/, 'sans session : mode local annoncé');

  const ecran = (x, y) => p.evaluate(([x, y]) => {
    const c = window.cpDesigner.camera(), r = document.querySelector('.cpd canvas.plan2d').getBoundingClientRect();
    return { x: r.left + (x - c.centre.x) * c.echelle + c.largeur / 2, y: r.top + c.hauteur / 2 - (y - c.centre.y) * c.echelle };
  }, [x, y]);
  const clic = async (x, y) => { const e = await ecran(x, y); await p.mouse.move(e.x, e.y); await p.mouse.down(); await p.mouse.up() };
  /* un clic dans le vide du plan (coin haut gauche du dessin) : rien n'est plus choisi */
  const videClic = async () => { const r = await p.locator('.cpd canvas.plan2d').boundingBox(); await p.mouse.click(r.x + 30, r.y + 30) };
  const objets = () => p.evaluate(() => Object.values(window.cpDesigner.projet().buildings[0].floors[0].objects));

  /* une maison de 10 × 8 m, une cloison, une porte, deux pièces, une cote */
  console.log('ÉTAPE 72');
  await p.keyboard.press('m');
  for (const [x, y] of [[0, 0], [10000, 0], [10000, 8000], [0, 8000], [0, 0]]) await clic(x, y);
  console.log('ÉTAPE 74');
  await p.keyboard.press('c'); await clic(4000, 0); await clic(4000, 8000);
  console.log('ÉTAPE 75');
  await p.keyboard.press('o'); await clic(2000, 0);
  console.log('ÉTAPE 76');
  await p.keyboard.press('p'); await clic(2000, 4000);
  console.log('ÉTAPE 77');
  await p.fill('.voile input[name=nom]', 'Séjour'); await p.keyboard.press('Enter');
  console.log('ÉTAPE 78');
  await clic(7000, 4000);
  console.log('ÉTAPE 79');
  await p.fill('.voile input[name=nom]', 'Chambre'); await p.selectOption('.voile select', 'bedroom'); await p.keyboard.press('Enter');
  console.log('ÉTAPE 80');
  await p.keyboard.press('d'); await clic(0, 3000); await clic(4000, 3000);
  console.log('ÉTAPE 81');
  await p.keyboard.press('v');
  let O = await objets();
  assert.deepEqual(O.map(o => o.type).sort(), ['dimension', 'opening', 'room', 'room', 'wall', 'wall', 'wall', 'wall', 'wall']);
  assert.match(await p.textContent('aside'), /Séjour\s*30,15 m²/, 'surface du séjour au panneau');

  /* tirer la cloison d'un mètre : les pièces et la cote suivent */
  console.log('ÉTAPE 87');
  await p.keyboard.press('Escape');
  const a = await ecran(4000, 6000), b = await ecran(5000, 6000);
  console.log('ÉTAPE 89');
  await p.keyboard.down('Alt');
  console.log('ÉTAPE 90');
  await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(a.x + 10, a.y, { steps: 2 }); await p.mouse.move(b.x, b.y, { steps: 5 }); await p.mouse.up();
  console.log('ÉTAPE 91');
  await p.keyboard.up('Alt');
  console.log('ÉTAPE 92');
  O = await objets();
  const cloison = O.find(o => o.role === 'partition');
  assert.ok(Math.abs(cloison.axis.a.x - 5000) <= 1 && Math.abs(cloison.axis.b.x - 5000) <= 1, 'cloison déplacée à 5 m : ' + JSON.stringify(cloison.axis));
  /* annuler (Ctrl+Z) la remet à 4 m */
  console.log('ÉTAPE 96');
  await videClic();
  console.log('ÉTAPE 97');
  await p.keyboard.press('Control+z');
  console.log('ÉTAPE 98');
  O = await objets();
  assert.equal(O.find(o => o.role === 'partition').axis.a.x, 4000, 'annuler');

  /* l'équerre : un mur tracé de travers tombe à 90° ; Q la coupe ; « Mettre d'équerre » redresse après coup */
  console.log('ÉTAPE 102');
  await p.keyboard.press('m'); await clic(5000, 5000); await clic(9000, 5150); await p.keyboard.press('Escape');
  console.log('ÉTAPE 103');
  await p.keyboard.press('q');
  console.log('ÉTAPE 104');
  await clic(5000, 7000); await clic(9000, 7300); await p.keyboard.press('Escape');
  console.log('ÉTAPE 105');
  await p.keyboard.press('q');
  console.log('ÉTAPE 106');
  O = await objets();
  const deTravers = O.filter(o => o.type === 'wall' && o.axis.a.x === 5000);
  assert.deepEqual(deTravers.map(w => [w.axis.b.y, w.axis.a.y]), [[5000, 5000], [7300, 7000]], 'aimanté à l’équerre, puis libre (Q) : ' + JSON.stringify(deTravers.map(w => w.axis)));
  console.log('ÉTAPE 109');
  await p.keyboard.press('v'); await videClic();
  console.log('ÉTAPE 110');
  await p.click('aside button:has-text("les murs du niveau")');
  console.log('ÉTAPE 111');
  O = await objets();
  const redresse = O.find(o => o.id === deTravers[1].id);
  assert.equal(redresse.axis.a.y, redresse.axis.b.y, 'mis d’équerre : ' + JSON.stringify(redresse.axis));
  assert.match(await p.textContent('.toast'), /1 mur redressé/);
  for (let k = 0; k < 3; k++) await p.keyboard.press('Control+z');
  assert.equal((await objets()).filter(o => o.type === 'wall').length, 5, 'annulé : la maison d’origine');

  /* un fond image : import, calage par une distance de 10 m, verrouillage */
  console.log('ÉTAPE 119');
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('text=Importer un fond…')]);
  console.log('ÉTAPE 120');
  await fc.setFiles({ name: 'plan-fictif.png', mimeType: 'image/png', buffer: png(1040, 840) });
  console.log('ÉTAPE 121');
  await p.waitForFunction(() => Object.values(window.cpDesigner.projet().buildings[0].floors[0].objects).some(o => o.type === 'underlay'));
  console.log('ÉTAPE 122');
  await p.click('text=Caler par deux points…');
  console.log('ÉTAPE 123');
  await p.click('.bzoomm');                                 // un cran en arrière : les deux points sont loin des boutons du bas
  console.log('ÉTAPE 124');
  await p.keyboard.down('Alt');
  console.log('ÉTAPE 125');
  await clic(20, -820);
  console.log('ÉTAPE 126');
  await clic(1020, -820);
  console.log('ÉTAPE 127');
  await p.keyboard.up('Alt');
  console.log('ÉTAPE 128');
  await p.fill('.voile input[name=d]', '10'); await p.keyboard.press('Enter');
  console.log('ÉTAPE 129');
  await p.check('aside label:has-text("Verrouillé") input');
  console.log('ÉTAPE 130');
  O = await objets();
  const fond = O.find(o => o.type === 'underlay');
  assert.ok(Math.abs(fond.transform.scale - 10) < 1e-6 && fond.locked, 'fond calé (10 mm par pixel) et verrouillé : ' + JSON.stringify(fond));

  /* un fond PDF : rendu par pdf.js sans erreur */
  console.log('ÉTAPE 135');
  await videClic();
  console.log('ÉTAPE 136');
  const [fc2] = await Promise.all([p.waitForEvent('filechooser'), p.click('text=Importer un fond…')]);
  console.log('ÉTAPE 137');
  await fc2.setFiles({ name: 'plan-fictif.pdf', mimeType: 'application/pdf', buffer: pdf() });
  console.log('ÉTAPE 138');
  await p.waitForFunction(() => Object.values(window.cpDesigner.projet().buildings[0].floors[0].objects).filter(o => o.type === 'underlay').length === 2);
  console.log('ÉTAPE 139');
  await p.waitForTimeout(1500);
  assert.equal(await p.locator('.toast.err').count(), 0, 'aucun message d’erreur (PDF lisible)');

  /* rechargement : le travail est retrouvé (copie locale) */
  console.log('ÉTAPE 143');
  await p.reload();
  console.log('ÉTAPE 144');
  await p.waitForFunction(() => window.cpDesigner);
  console.log('ÉTAPE 145');
  O = await objets();
  assert.equal(O.filter(o => o.type === 'wall').length, 5, 'projet retrouvé après rechargement');

  /* palette Ctrl+K */
  console.log('ÉTAPE 149');
  await p.keyboard.press('Control+k');
  console.log('ÉTAPE 150');
  await p.keyboard.type('niveau');
  assert.match(await p.textContent('.palette ul'), /Ajouter un niveau/);
  console.log('ÉTAPE 152');
  await p.keyboard.press('Escape');

  /* tracé rapide : un rectangle hors tout tapé au clavier (10x8), un mur
     tapé (4,5 m), une fenêtre placée par sa distance au mur voisin */
  console.log('ÉTAPE 156');
  await p.goto(`http://localhost:${port}/index.html?chantier=essai-rapide`);
  console.log('ÉTAPE 157');
  await p.waitForFunction(() => window.cpDesigner);
  console.log('ÉTAPE 158');
  await p.keyboard.press('r'); await clic(0, 0);
  { const e = await ecran(3000, 2000); await p.mouse.move(e.x, e.y) }
  console.log('ÉTAPE 160');
  await p.keyboard.type('10x8'); await p.keyboard.press('Enter');
  console.log('ÉTAPE 161');
  O = await objets();
  assert.equal(O.filter(o => o.type === 'wall').length, 4, 'rectangle tapé : 4 murs');
  assert.match(await p.textContent('aside'), /72,96 m²/, 'pièce de 9,60 × 7,60 m à l’intérieur des murs de 20 cm');
  console.log('ÉTAPE 164');
  await p.keyboard.press('m'); await p.keyboard.down('Alt'); await clic(13000, 0);
  { const e = await ecran(15000, 0); await p.mouse.move(e.x, e.y) }
  console.log('ÉTAPE 166');
  await p.keyboard.up('Alt');
  console.log('ÉTAPE 167');
  await p.keyboard.type('4,5'); await p.keyboard.press('Enter'); await p.keyboard.press('Escape');
  console.log('ÉTAPE 168');
  O = await objets();
  const tape = O.find(o => o.type === 'wall' && o.axis.a.x === 13000);
  assert.deepEqual(tape?.axis, { a: { x: 13000, y: 0 }, b: { x: 17500, y: 0 } }, 'mur tapé : 4,50 m vers la droite');
  console.log('ÉTAPE 171');
  await p.keyboard.press('Escape');
  console.log('ÉTAPE 172');
  await p.keyboard.press('o'); await clic(3000, 100);
  console.log('ÉTAPE 173');
  await p.keyboard.press('v'); await clic(3000, 100);
  console.log('ÉTAPE 174');
  await p.fill('aside label:has-text("Distance à gauche") input', '1.5'); await p.keyboard.press('Tab');
  console.log('ÉTAPE 175');
  O = await objets();
  const porte = O.find(o => o.type === 'opening');
  assert.equal(porte.offset, 200 + 1500 + 450, 'porte à 1,50 m de l’angle intérieur : ' + porte.offset);
  /* bibliothèque d'ouvertures : une fenêtre 2 vantaux glissée sur le mur du haut, puis changée en baie coulissante */
  console.log('ÉTAPE 179');
  await p.keyboard.press('Escape'); await p.keyboard.press('o');
  /* le catalogue : ses catégories, comme on les cherche ; une catégorie ouvre son volet sur le plan */
  assert.ok(await p.locator('.catalogue .cat').count() >= 9, 'catégories d’ouvrants');
  console.log('ÉTAPE 182');
  await p.click('.catalogue .cat[data-cat=fenetre]');
  assert.ok(await p.locator('.volet .tuile').count() >= 6, 'volet des fenêtres');
  if (process.env.CAPTURE_BIBLIO) await p.screenshot({ path: process.env.CAPTURE_BIBLIO });
  {
    const cible = await ecran(6000, 7900), r = await p.locator('.cpd canvas.plan2d').boundingBox();
    await p.locator('.volet .tuile[data-m="fen-2v-120x125"]').dragTo(p.locator('.cpd canvas.plan2d'), { targetPosition: { x: cible.x - r.x, y: cible.y - r.y } });
  }
  console.log('ÉTAPE 189');
  O = await objets();
  const fen = O.find(o => o.type === 'opening' && o.kind === 'window');
  assert.ok(fen && fen.width === 1200 && fen.sill === 900 && fen.leaves === 2 && fen.catalogRef?.id === 'fen-2v-120x125', 'fenêtre glissée depuis la bibliothèque : ' + JSON.stringify(fen));
  console.log('ÉTAPE 192');
  await p.keyboard.press('v'); { const e = await ecran(6000, 7900); await p.mouse.click(e.x, e.y) }
  console.log('ÉTAPE 193');
  await p.selectOption('aside label:has-text("Modèle") select', 'baie-2v-240x215');
  console.log('ÉTAPE 194');
  O = await objets();
  assert.ok(O.some(o => o.type === 'opening' && o.kind === 'bay' && o.width === 2400 && o.operation === 'sliding'), 'modèle changé en baie coulissante');
  console.log('ÉTAPE 196');
  await p.keyboard.press('Escape');
  /* mobilier : un lit posé près du mur du bas s'y plaque ; un canapé glissé près du mur du haut s'y retourne */
  console.log('ÉTAPE 198');
  await p.keyboard.press('b');
  assert.match(await p.textContent('.catalogue'), /Chambre, bureau/);
  console.log('ÉTAPE 200');
  await p.click('.catalogue .cat[data-cat=meu-chambre]');
  console.log('ÉTAPE 201');
  await p.click('.volet .tuile[data-m="lit-160"]');
  assert.equal(await p.locator('.volet').count(), 0, 'le volet se range une fois le modèle choisi');
  console.log('ÉTAPE 203');
  await clic(5000, 900);
  console.log('ÉTAPE 204');
  O = await objets();
  const lit = O.find(o => o.type === 'furniture');
  assert.deepEqual([lit?.position, lit?.rotation], [{ x: 5000, y: 200 + 1000 }, 0], 'lit plaqué contre le mur du bas : ' + JSON.stringify(lit));
  console.log('ÉTAPE 207');
  await p.click('.catalogue .cat[data-cat=meu-sejour]');
  {
    const cible = await ecran(5000, 7300), r = await p.locator('.cpd canvas.plan2d').boundingBox();
    await p.locator('.volet .tuile[data-m="canape-3p"]').dragTo(p.locator('.cpd canvas.plan2d'), { targetPosition: { x: cible.x - r.x, y: cible.y - r.y } });
  }
  console.log('ÉTAPE 212');
  O = await objets();
  const canape = O.find(o => o.type === 'furniture' && o.catalogRef.id === 'canape-3p');
  assert.ok(canape && Math.abs(canape.position.y - (7800 - 475)) < 1 && Math.abs(Math.cos(canape.rotation) + 1) < 1e-9, 'canapé glissé, plaqué contre le mur du haut : ' + JSON.stringify(canape));
  console.log('ÉTAPE 215');
  await p.keyboard.press('Escape');
  /* copier-coller : tout le niveau (Ctrl+A), copié, recollé d'un clic à (3 ; 3) m ; un « annuler » le retire */
  console.log('ÉTAPE 217');
  await p.keyboard.press('v');
  const avantCollage = (await objets()).length;
  console.log('ÉTAPE 219');
  await p.keyboard.press('Control+a');
  assert.match(await p.textContent('aside'), /objets choisis/);
  console.log('ÉTAPE 221');
  await p.keyboard.press('Control+c');
  console.log('ÉTAPE 222');
  await p.keyboard.press('Control+v');
  {
    const e = await ecran(3000, 3000); await p.mouse.move(e.x, e.y); await p.keyboard.down('Alt'); await p.mouse.down(); await p.mouse.up(); await p.keyboard.up('Alt');
  }
  console.log('ÉTAPE 226');
  O = await objets();
  assert.equal(O.filter(o => o.type === 'wall').length, 10, 'murs recollés');
  assert.equal(O.filter(o => o.type === 'furniture').length, 4, 'meubles recollés');
  assert.ok(O.some(o => o.type === 'wall' && o.axis.a.x === 3000 && o.axis.a.y === 3000), 'le coin du groupe posé au clic');
  console.log('ÉTAPE 230');
  await p.keyboard.press('Control+z');
  assert.equal((await objets()).length, avantCollage, 'un « annuler » retire tout le collage');
  console.log('ÉTAPE 232');
  await p.keyboard.press('Escape');
  /* export PDF : une planche A3 vectorielle, téléchargée */
  console.log('ÉTAPE 234');
  await p.click('header button.bpdf');
  console.log('ÉTAPE 235');
  await p.waitForSelector('.voile h2:has-text("Exporter en PDF")');
  console.log('ÉTAPE 236');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.voile button.prim')]);
  const chemin = await dl.path();
  const fichierPdf = await readFile(chemin);
  assert.equal(fichierPdf.subarray(0, 8).toString('latin1'), '%PDF-1.4', 'un PDF');
  assert.ok(fichierPdf.toString('latin1').includes('(CP CONSTRUCTIONS)'), 'cartouche');
  assert.ok(fichierPdf.toString('latin1').includes('(Fa\xE7ade sud \\(bas du plan\\))') && fichierPdf.toString('latin1').includes('/Count 3'), 'planche des façades');
  assert.ok(fichierPdf.toString('latin1').includes('(Coupe A-A)') && fichierPdf.toString('latin1').includes('(PLAN DE REP\xC9RAGE)'), 'planche de la coupe');
  assert.match(dl.suggestedFilename(), /plans A3 - RDC\.pdf$/);
  if (process.env.PDF_SORTIE) await dl.saveAs(process.env.PDF_SORTIE);
  /* le DXF du niveau : un fichier R12 en mm */
  console.log('ÉTAPE 246');
  await p.click('header button.bdxf');
  console.log('ÉTAPE 247');
  await p.waitForSelector('.voile h2:has-text("Exporter en DXF")');
  console.log('ÉTAPE 248');
  const [dl3] = await Promise.all([p.waitForEvent('download'), p.click('.voile button.prim')]);
  const dxf = (await readFile(await dl3.path())).toString('latin1');
  assert.ok(dxf.includes('AC1009') && dxf.includes('\r\nMURS\r\n') && dxf.trimEnd().endsWith('EOF'), 'DXF du niveau');
  assert.match(dl3.suggestedFilename(), /RDC\.dxf$/);
  /* le dossier de permis complet, du même dialogue */
  console.log('ÉTAPE 253');
  await p.click('header button.bpdf');
  console.log('ÉTAPE 254');
  await p.waitForSelector('.voile h2:has-text("Exporter en PDF")');
  console.log('ÉTAPE 255');
  await p.selectOption('.voile label:has-text("Composer") select', 'dossier');
  console.log('ÉTAPE 256');
  await p.fill('.voile label:has-text("Maître d’ouvrage") input', 'M. et Mme Fictifs');
  console.log('ÉTAPE 257');
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('.voile button.prim')]);
  const dossier = (await readFile(await dl2.path())).toString('latin1');
  assert.ok(dossier.includes('(DEMANDE DE PERMIS DE CONSTRUIRE)') && dossier.includes('(M. et Mme Fictifs)') && dossier.includes('(PCMI 5 \x97 Fa\xE7ades)'), 'dossier de permis');
  assert.match(dl2.suggestedFilename(), /dossier PC\.pdf$/);
  /* escalier : posé d'un clic (droit, 0,90 m), choisi, son calcul affiché ; à l'étage ajouté, sa trémie */
  console.log('ÉTAPE 262');
  await p.keyboard.press('e');
  assert.match(await p.textContent('aside'), /Hauteur à franchir/);
  console.log('ÉTAPE 264');
  await clic(1500, 1000);
  console.log('ÉTAPE 265');
  O = await objets();
  const esc = O.find(o => o.type === 'stair');
  assert.deepEqual([esc?.position, esc?.width, esc?.kind], [{ x: 1500, y: 1000 }, 900, 'straight'], 'escalier posé : ' + JSON.stringify(esc));
  console.log('ÉTAPE 268');
  await clic(1500, 2000);
  assert.match(await p.textContent('aside'), /Escalier — Droit[\s\S]*15 hauteurs de 18,0 cm/);
  if (process.env.CAPTURE_ESCALIER) await p.screenshot({ path: process.env.CAPTURE_ESCALIER });
  /* trait de coupe : tracé (K, deux clics), choisi, son aperçu dans l'inspecteur, regard inversé (T) */
  console.log('ÉTAPE 272');
  await p.keyboard.press('k');
  console.log('ÉTAPE 273');
  await clic(-600, 6000); await clic(10600, 6000);                    // à l'écart du message « PDF enregistré », en bas
  console.log('ÉTAPE 274');
  O = await objets();
  const tc = O.find(o => o.type === 'section');
  assert.ok(tc && tc.name === 'A' && tc.look === 'left' && Math.abs(tc.a.y - tc.b.y) < 1, 'trait de coupe tracé, parcelle tracée et implantée, terrasse tracée : ' + JSON.stringify(tc));
  console.log('ÉTAPE 277');
  await clic(2500, tc.a.y);
  assert.match(await p.textContent('aside'), /Coupe A-A/);
  assert.ok(await p.locator('aside .apercu-coupe svg polygon').count() > 5, 'aperçu de la coupe');
  if (process.env.CAPTURE_COUPE) await p.screenshot({ path: process.env.CAPTURE_COUPE });
  console.log('ÉTAPE 281');
  await p.keyboard.press('t');
  assert.equal((await objets()).find(o => o.type === 'section').look, 'right', 'regard inversé');
  /* parcelle : tracée (L, sommets cliqués dans les coins, loin du message en bas), choisie, implantée à 5 m et 3 m */
  console.log('ÉTAPE 284');
  await p.keyboard.press('Escape');
  console.log('ÉTAPE 285');
  await p.keyboard.press('l');
  for (const [x, y] of [[-1000, -500], [12000, -500], [12000, 9000], [-1000, 9000], [-1000, -500]]) await clic(x, y);
  const parc = (await objets()).find(o => o.type === 'plot');
  assert.ok(parc && parc.contour.length === 4, 'parcelle tracée : ' + JSON.stringify(parc));
  console.log('ÉTAPE 289');
  await clic(-1000, 4000);
  assert.match(await p.textContent('aside'), /Terrain : [\d ,]+ m²[\s\S]*Emprise au sol/);
  console.log('ÉTAPE 291');
  await p.click('aside button:has-text("Placer")');
  assert.match(await p.textContent('aside'), /Côté 1 : [\d,]+ m — recul 5,00 m/, 'parcelle placée à 5 m du côté 1');
  if (process.env.CAPTURE_PARCELLE) await p.screenshot({ path: process.env.CAPTURE_PARCELLE });
  /* un point coté du terrain naturel (outil N) : un clic, son altitude NGF ; un « annuler » le retire */
  console.log('ÉTAPE 295');
  await p.keyboard.press('Escape');
  console.log('ÉTAPE 296');
  await p.keyboard.press('n');
  console.log('ÉTAPE 297');
  await clic(5000, 3000);
  console.log('ÉTAPE 298');
  await p.fill('.voile input[name=z]', '101,25'); await p.keyboard.press('Enter');
  console.log('ÉTAPE 299');
  await p.waitForFunction(() => Object.values(window.cpDesigner.projet().buildings[0].floors[0].objects).find(o => o.type === 'plot')?.spotHeights?.length === 1);
  const pc = (await objets()).find(o => o.type === 'plot').spotHeights[0];
  assert.deepEqual([pc.point, pc.ngf], [{ x: 5000, y: 3000 }, 101.25], 'point coté posé : ' + JSON.stringify(pc));
  console.log('ÉTAPE 302');
  await p.keyboard.press('Escape');
  console.log('ÉTAPE 303');
  await p.keyboard.press('Control+z');
  assert.ok(!(await objets()).find(o => o.type === 'plot').spotHeights, 'un « annuler » retire le point coté');
  /* aménagement : une terrasse en dalles tracée à l'outil A (quatre sommets, retour au premier) */
  console.log('ÉTAPE 306');
  await p.keyboard.press('Escape');
  console.log('ÉTAPE 307');
  await p.keyboard.press('a');
  console.log('ÉTAPE 308');
  await p.selectOption('aside label:has-text("Genre") select', 'terrace');
  console.log('ÉTAPE 309');
  await p.selectOption('aside label:has-text("Aspect") select', 'terrasse-dalles');
  for (const [x, y] of [[-1000, 5000], [-400, 5000], [-400, 7000], [-1000, 7000], [-1000, 5000]]) await clic(x, y);
  const ter = (await objets()).find(o => o.type === 'landscape');
  assert.ok(ter && ter.kind === 'terrace' && ter.finish === 'terrasse-dalles' && ter.points.length === 4, 'terrasse tracée : ' + JSON.stringify(ter));
  console.log('ÉTAPE 313');
  await p.keyboard.press('Escape');
  console.log('ÉTAPE 314');
  await p.keyboard.press('f');
  console.log('ÉTAPE 315');
  await p.waitForTimeout(300);
  if (process.env.CAPTURE_RAPIDE) await p.screenshot({ path: process.env.CAPTURE_RAPIDE });
  if (process.env.CAPTURE_MEUBLES_3D) {
    await p.keyboard.press('3');
    await p.waitForFunction(() => (window.cpDesigner.vue3d()?.maillages ?? 0) > 0, null, { timeout: 20_000 });
    await p.check('aside label:has-text("Vue maquette") input');
    await p.waitForTimeout(400);
    await p.screenshot({ path: process.env.CAPTURE_MEUBLES_3D });
    await p.keyboard.press('Escape');
  }

  /* Phase 1 bis : le RDC lu par l'atelier (plan fictif), sur un chantier neuf */
  console.log('ÉTAPE 327');
  await p.goto(`http://localhost:${port}/index.html?chantier=essai-import`);
  console.log('ÉTAPE 328');
  await p.waitForFunction(() => window.cpDesigner);
  console.log('ÉTAPE 329');
  const [fc3] = await Promise.all([p.waitForEvent('filechooser'), p.click('text=Importer le RDC lu par l’atelier…')]);
  console.log('ÉTAPE 330');
  await fc3.setFiles({ name: 'modele.json', mimeType: 'application/json', buffer: await readFile(new URL('../fixtures/atelier_fictif.json', import.meta.url)) });
  console.log('ÉTAPE 331');
  await p.waitForSelector('.voile h2:has-text("Plan importé")');
  const rapport = await p.textContent('.voile');
  assert.match(rapport, /8 murs, 11 ouvertures, 5 pièces/);
  assert.match(rapport, /Séjour - cuisine\s*37,00\s*37,00\s*0,00/);
  assert.match(rapport, /Rien à reprendre/);
  console.log('ÉTAPE 336');
  await p.click('.voile button');
  console.log('ÉTAPE 337');
  O = await objets();
  assert.equal(O.filter(o => o.type === 'wall').length, 8, 'murs importés');
  const trace = O.find(o => o.type === 'underlay');
  assert.ok(trace && trace.locked && Math.abs(trace.transform.scale - 5) < 1e-9, 'tracé source posé, calé et verrouillé');
  console.log('ÉTAPE 341');
  await p.waitForTimeout(500);
  console.log('ÉTAPE 342');
  await p.screenshot({ path: process.env.CAPTURE ?? '/dev/null' }).catch(() => {});
  /* la vue 3D du plan importé : maquette chargée à la demande, mise à jour à
     chaque modification, vue maquette, retour au plan */
  /* une toiture à croupes sur le plan importé (calculée depuis ses murs) */
  console.log('ÉTAPE 346');
  await p.click('aside button:has-text("Ajouter une toiture")');
  assert.match(await p.textContent('aside'), /faîtage à \d+,\d\d m/, 'faîtage annoncé');
  assert.equal((await objets()).filter(o => o.type === 'roof').length, 1);
  console.log('ÉTAPE 349');
  await p.keyboard.press('3');
  console.log('ÉTAPE 350');
  await p.waitForFunction(() => (window.cpDesigner.vue3d()?.maillages ?? 0) > 0, null, { timeout: 20_000 });
  const s3d = await p.evaluate(() => window.cpDesigner.vue3d());
  assert.ok(s3d.maillages > 40 && s3d.triangles > 400, 'maquette 3D construite : ' + JSON.stringify(s3d));
  console.log('ÉTAPE 353');
  await p.waitForTimeout(400);
  if (process.env.CAPTURE_3D) await p.screenshot({ path: process.env.CAPTURE_3D });
  /* matériaux : un bardage sur toutes les façades, d'un choix dans le panneau 3D ; la 3D suit */
  const avantMat = (await p.evaluate(() => window.cpDesigner.vue3d())).maillages;
  console.log('ÉTAPE 357');
  await p.selectOption('aside label:has-text("Façades (tous les murs extérieurs)") select', 'bardage-bois-naturel');
  const ext = (await objets()).filter(o => o.type === 'wall' && o.role === 'exterior');
  assert.ok(ext.length > 0 && ext.every(o => o.finish === 'bardage-bois-naturel'), 'parement sur toutes les façades');
  console.log('ÉTAPE 360');
  await p.waitForFunction(n => window.cpDesigner.vue3d().maillages > n, avantMat);
  console.log('ÉTAPE 361');
  await p.waitForTimeout(300);
  if (process.env.CAPTURE_MATERIAUX) await p.screenshot({ path: process.env.CAPTURE_MATERIAUX });
  /* garder cette vue pour le dossier de permis (un JPEG de la vue) */
  console.log('ÉTAPE 364');
  await p.click('aside button.bpersp');
  console.log('ÉTAPE 365');
  await p.waitForSelector('aside button.bpersp:has-text("Vue gardée")', { timeout: 10_000 });
  /* et une peinture dans toutes les pièces du niveau */
  console.log('ÉTAPE 367');
  await p.selectOption('aside label:has-text("Murs intérieurs") select', 'peinture-vert-sauge');
  const pieces = (await objets()).filter(o => o.type === 'room');
  assert.ok(pieces.length > 0 && pieces.every(o => o.wallFinish === 'peinture-vert-sauge'), 'peinture dans toutes les pièces');
  console.log('ÉTAPE 370');
  await p.check('aside label:has-text("Vue maquette") input');
  console.log('ÉTAPE 371');
  await p.waitForTimeout(300);
  if (process.env.CAPTURE_3D_COUPE) await p.screenshot({ path: process.env.CAPTURE_3D_COUPE });
  console.log('ÉTAPE 373');
  await p.keyboard.press('Control+z');                               // annuler le fond : la 3D suit sans erreur
  assert.ok((await p.evaluate(() => window.cpDesigner.vue3d()))?.maillages > 40);
  console.log('ÉTAPE 375');
  await p.keyboard.press('Control+Shift+z');
  /* la visite à hauteur d'homme : départ dans la plus grande pièce, on marche (Z / W tenue), on tourne (←) */
  console.log('ÉTAPE 377');
  await p.click('aside button.bvisite');
  console.log('ÉTAPE 378');
  await p.waitForFunction(() => window.cpDesigner.marcheur() !== null);
  const w0 = await p.evaluate(() => window.cpDesigner.marcheur());
  assert.ok(Math.abs(w0.pied - 5) < 1, 'les pieds sur le sol fini : ' + JSON.stringify(w0));
  assert.match(await p.textContent('aside'), /Visite à hauteur d’homme/);
  /* touches tenues jusqu'à ce que le mouvement se voie : le rendu logiciel de la CI peut ne faire que quelques images par seconde */
  console.log('ÉTAPE 383');
  await p.keyboard.down('KeyW');
  console.log('ÉTAPE 384');
  await p.waitForFunction(w => { const m = window.cpDesigner.marcheur(); return Math.hypot(m.x - w.x, m.y - w.y) > 150 }, w0, { timeout: 20_000 }).catch(() => {});
  console.log('ÉTAPE 385');
  await p.keyboard.up('KeyW');
  const wMarche = await p.evaluate(() => window.cpDesigner.marcheur());
  console.log('ÉTAPE 387');
  await p.keyboard.down('ArrowLeft');
  console.log('ÉTAPE 388');
  await p.waitForFunction(c => window.cpDesigner.marcheur().cap > c + 0.1, wMarche.cap, { timeout: 20_000 }).catch(() => {});
  console.log('ÉTAPE 389');
  await p.keyboard.up('ArrowLeft');
  const w1 = await p.evaluate(() => window.cpDesigner.marcheur());
  assert.ok(Math.hypot(w1.x - w0.x, w1.y - w0.y) > 150, 'le marcheur avance : ' + JSON.stringify([w0, w1]));
  assert.ok(w1.cap > wMarche.cap + 0.1, 'il tourne à gauche');
  assert.equal((await objets()).filter(o => o.type === 'roof').length, 1, 'les touches de la visite ne touchent pas au plan');
  if (process.env.CAPTURE_VISITE) await p.screenshot({ path: process.env.CAPTURE_VISITE });
  console.log('ÉTAPE 395');
  await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(() => window.cpDesigner.marcheur()), null, 'sortie de la visite');
  assert.ok((await p.evaluate(() => window.cpDesigner.vue3d()))?.maillages > 40, 'toujours en 3D');
  console.log('ÉTAPE 398');
  await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(() => window.cpDesigner.vue3d()), null, 'retour au plan');

  /* l'import s'annule d'un coup (la peinture, le parement des façades, la toiture, le fond, puis le plan) */
  console.log('ÉTAPE 402');
  await videClic();
  console.log('ÉTAPE 403');
  await p.keyboard.press('Control+z');
  assert.ok((await objets()).filter(o => o.type === 'room').every(o => !o.wallFinish), 'un « annuler » retire la peinture de toutes les pièces');
  console.log('ÉTAPE 405');
  await p.keyboard.press('Control+z');
  assert.ok((await objets()).filter(o => o.type === 'wall').every(o => !o.finish), 'un « annuler » retire le parement de toutes les façades');
  console.log('ÉTAPE 407');
  await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z');
  console.log('ÉTAPE 408');
  O = await objets();
  assert.equal(O.length, 0, 'cinq « annuler » (la peinture, le parement, la toiture, le fond, le plan) : niveau vide');

  assert.equal(await p.locator('#cpd-diagnostic').count(), 0, 'page qui démarre : aucun diagnostic affiché');
  assert.deepEqual(erreurs, [], 'aucune erreur JavaScript');

  /* un modèle de maison sur un chantier neuf : posé d'un clic, à étage, un seul « annuler » le retire */
  console.log('ÉTAPE 415');
  await p.goto(`http://localhost:${port}/index.html?chantier=essai-modele`);
  console.log('ÉTAPE 416');
  await p.waitForFunction(() => window.cpDesigner);
  console.log('ÉTAPE 417');
  await p.click('aside button:has-text("Maison à étage")');
  const etages = await p.evaluate(() => window.cpDesigner.projet().buildings[0].floors.map(f => [f.name, Object.values(f.objects).filter(o => o.type === 'wall').length]));
  assert.ok(etages.length === 2 && etages.every(([, n]) => n >= 6), 'modèle à étage posé : ' + JSON.stringify(etages));
  /* une fenêtre de toit (outil H) : le Designer passe au niveau qui porte la toiture (l'étage), un clic sur le pan sud la pose */
  console.log('ÉTAPE 421');
  await p.keyboard.press('h');
  assert.equal(await p.evaluate(() => document.querySelector('select.niveaux')?.selectedOptions[0]?.textContent), 'Étage', 'passé au niveau de la toiture');
  console.log('ÉTAPE 423');
  await clic(4500, 1800);
  const ft = await p.evaluate(() => window.cpDesigner.projet().buildings[0].floors.flatMap(f => Object.values(f.objects)).filter(o => o.type === 'roof_window'));
  assert.deepEqual(ft.map(o => [o.width, o.height]), [[780, 980]], 'fenêtre de toit posée : ' + JSON.stringify(ft));
  console.log('ÉTAPE 426');
  await p.keyboard.press('Escape');
  console.log('ÉTAPE 427');
  await p.selectOption('select.niveaux', { label: 'RDC' });
  /* les pièces images du dossier : une photographie (PCMI 7), puis l'insertion composée dans la 3D (PCMI 6) ;
     une capture de la page sert d'image fictive */
  const imageFictive = await p.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 640, height: 400 } });
  /* onglet Dossier → Dossier de permis : les pièces fournies */
  console.log('ÉTAPE 432');
  await p.click('nav.onglets button[data-o=dossier]'); await p.click('.sous button[data-s=permis]');
  console.log('ÉTAPE 433');
  const [fc7] = await Promise.all([p.waitForEvent('filechooser'), p.click('aside button.bpcmi7')]);
  console.log('ÉTAPE 434');
  await fc7.setFiles({ name: 'proche.png', mimeType: 'image/png', buffer: imageFictive });
  console.log('ÉTAPE 435');
  await p.fill('.voile input[name=leg]', 'depuis la rue, vers le nord');
  console.log('ÉTAPE 436');
  await p.click('.voile button.prim');
  console.log('ÉTAPE 437');
  await p.waitForFunction(() => /PCMI 7 Environnement proche : ✓ 640 × 400 px — depuis la rue/.test(document.querySelector('aside').textContent));
  console.log('ÉTAPE 438');
  await p.keyboard.press('3');
  console.log('ÉTAPE 439');
  await p.waitForFunction(() => (window.cpDesigner.vue3d()?.maillages ?? 0) > 0, null, { timeout: 20_000 });
  console.log('ÉTAPE 440');
  const [fcs] = await Promise.all([p.waitForEvent('filechooser'), p.click('aside button.bphoto')]);
  console.log('ÉTAPE 441');
  await fcs.setFiles({ name: 'terrain.png', mimeType: 'image/png', buffer: imageFictive });
  console.log('ÉTAPE 442');
  await p.waitForSelector('aside button.binsertion');
  console.log('ÉTAPE 443');
  await p.fill('aside label:has-text("Focale") input', '50'); await p.keyboard.press('Tab');
  console.log('ÉTAPE 444');
  await p.click('aside button.binsertion');
  console.log('ÉTAPE 445');
  await p.fill('.voile input[name=pv]', 'depuis la rue, face à l’entrée');
  console.log('ÉTAPE 446');
  await p.click('.voile button.prim');
  console.log('ÉTAPE 447');
  await p.waitForSelector('aside button.binsertion:has-text("Gardée pour le PCMI 6")', { timeout: 10_000 });
  if (process.env.CAPTURE_INSERTION) await p.screenshot({ path: process.env.CAPTURE_INSERTION });
  console.log('ÉTAPE 449');
  await p.keyboard.press('Escape');
  console.log('ÉTAPE 450');
  await p.click('header button.bpdf');
  console.log('ÉTAPE 451');
  await p.selectOption('.voile label:has-text("Composer") select', 'dossier');
  console.log('ÉTAPE 452');
  const [dl6] = await Promise.all([p.waitForEvent('download'), p.click('.voile button.prim')]);
  const dossier6 = (await readFile(await dl6.path())).toString('latin1');
  if (process.env.CAPTURE_DOSSIER) await writeFile(process.env.CAPTURE_DOSSIER, await readFile(await dl6.path()));
  for (const t of ['(PCMI 6 \x97 Insertion)', '(PCMI 7 \x97 Environnement proche)', '(depuis la rue, vers le nord)', '(depuis la rue, face \xE0 l\x92entr\xE9e)'])
    assert.ok(dossier6.includes(t), 'dossier : ' + t);
  assert.equal(dossier6.match(/\/Subtype \/Image /g)?.length, 2, 'deux images dans le dossier (insertion et photographie)');
  /* le plan de présentation : sols en couleur à l'écran (préférence de l'appareil), puis en PDF pour le client */
  /* onglet Indications → Couleurs de pièces */
  console.log('ÉTAPE 460');
  await p.click('nav.onglets button[data-o=indications]'); await p.click('.sous button[data-s=couleurs]');
  console.log('ÉTAPE 461');
  await p.click('.ruban .tuile-outil:has-text("Sols en couleur")');
  assert.equal(await p.evaluate(() => localStorage.getItem('cpDesigner:sols')), 'oui');
  assert.equal(await p.locator('.ruban .tuile-outil.actif:has-text("Sols en couleur")').count(), 1, 'la tuile dit l’état');
  if (process.env.CAPTURE_PRESENTATION) await p.screenshot({ path: process.env.CAPTURE_PRESENTATION });
  console.log('ÉTAPE 465');
  await p.click('header button.bpdf');
  console.log('ÉTAPE 466');
  await p.selectOption('.voile select[name=pre]', 'presentation');
  console.log('ÉTAPE 467');
  const [dl7] = await Promise.all([p.waitForEvent('download'), p.click('.voile button.prim')]);
  const pres = (await readFile(await dl7.path())).toString('latin1');
  assert.ok(pres.includes('(Plan de pr\xE9sentation : RDC)') && pres.includes('(SOLS ET SURFACES)'), 'plan de présentation');
  assert.match(dl7.suggestedFilename(), /plans de presentation/);
  console.log('ÉTAPE 471');
  await p.click('.ruban .tuile-outil:has-text("Sols en couleur")');
  assert.equal(await p.evaluate(() => localStorage.getItem('cpDesigner:sols')), 'non');
  console.log('ÉTAPE 473');
  await p.click('nav.onglets button[data-o=trace]');
  console.log('ÉTAPE 474');
  await videClic();
  console.log('ÉTAPE 475');
  await p.keyboard.press('Control+z');
  assert.equal(await p.evaluate(() => window.cpDesigner.projet().buildings[0].floors.flatMap(f => Object.values(f.objects)).filter(o => o.type === 'roof_window').length), 0, 'un « annuler » retire la fenêtre de toit');
  console.log('ÉTAPE 477');
  await p.keyboard.press('Control+z');
  assert.equal(await p.evaluate(() => window.cpDesigner.projet().buildings[0].floors.length), 1, 'un « annuler » retire le modèle et son étage');
  /* un point de prise de vue (outil I) : l'appareil, puis le point visé ; il prend la première pièce libre (PCMI 7) */
  console.log('ÉTAPE 480');
  await p.keyboard.press('i');
  console.log('ÉTAPE 481');
  await clic(2000, 1000); await clic(2000, 6000);
  const vues = (await objets()).filter(o => o.type === 'viewpoint');
  assert.deepEqual(vues.map(v => [v.piece, v.a, v.b]), [['PCMI 7', { x: 2000, y: 1000 }, { x: 2000, y: 6000 }]], 'point de vue posé : ' + JSON.stringify(vues));
  assert.match(await p.textContent('aside'), /Point de prise de vue — PCMI 7/);
  if (process.env.CAPTURE_POINT_DE_VUE) await p.screenshot({ path: process.env.CAPTURE_POINT_DE_VUE });
  console.log('ÉTAPE 486');
  await p.keyboard.press('Control+z');
  assert.equal((await objets()).filter(o => o.type === 'viewpoint').length, 0, 'un « annuler » retire le point de vue');

  /* l'interface à onglets : murs composés (la composition choisie est gardée), cloison fictive, types de pièces, toit, nuancier */
  console.log('ÉTAPE 490');
  await p.goto(`http://localhost:${port}/index.html?chantier=essai-onglets`);
  console.log('ÉTAPE 491');
  await p.waitForFunction(() => window.cpDesigner);
  console.log('ÉTAPE 492');
  await p.click('nav.onglets button[data-o=trace]'); await p.click('.sous button[data-s=murs]');
  console.log('ÉTAPE 493');
  await p.click('.ruban .o-rectangle');
  console.log('ÉTAPE 494');
  await p.click('.compo .carte');
  console.log('ÉTAPE 495');
  await p.click('.liste-compo .carte:has-text("Mur extérieur isolé 40")');
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('cpDesigner:compositions')).exterieur), 'ext-isole-40', 'composition gardée sur l’appareil');
  console.log('ÉTAPE 497');
  await clic(0, 0); await clic(10000, 8000);
  const M = (await objets()).filter(o => o.type === 'wall');
  assert.ok(M.length === 4 && M.every(w => w.thickness === 400 && w.compositionRef === 'ext-isole-40'), 'rectangle en murs isolés 40 : ' + JSON.stringify(M.map(w => [w.thickness, w.compositionRef])));
  if (process.env.CAPTURE_ONGLETS) await p.screenshot({ path: process.env.CAPTURE_ONGLETS });
  console.log('ÉTAPE 501');
  await p.click('.ruban .o-fictive'); await clic(4000, 400); await clic(4000, 7600);
  assert.equal((await objets()).filter(o => o.type === 'wall' && o.role === 'virtual').length, 1, 'cloison fictive tracée');
  console.log('ÉTAPE 503');
  await p.click('.sous button[data-s=pieces]');
  console.log('ÉTAPE 504');
  await p.click('.ruban .tuile-outil:has-text("Chambre")');
  console.log('ÉTAPE 505');
  await clic(2000, 4000); await clic(7000, 4000);
  assert.deepEqual((await objets()).filter(o => o.type === 'room').map(o => o.name + ' : ' + o.usage).sort(), ['Chambre 2 : bedroom', 'Chambre : bedroom'], 'deux chambres de part et d’autre de la cloison fictive');
  console.log('ÉTAPE 507');
  await p.click('nav.onglets button[data-o=toit]');
  console.log('ÉTAPE 508');
  await p.click('.ruban .toit-gable');
  assert.deepEqual((await objets()).filter(o => o.type === 'roof').map(o => o.kind), ['gable'], 'toit deux pans posé d’un clic');
  assert.match(await p.textContent('aside'), /Toiture — RDC/);
  console.log('ÉTAPE 511');
  await p.click('nav.onglets button[data-o=revetement]');
  console.log('ÉTAPE 512');
  await p.click('.catalogue .cat[data-cat=rev-enduit]');
  console.log('ÉTAPE 513');
  await p.click('.volet .tuile[data-m="enduit-ton-pierre"]');
  assert.ok((await objets()).filter(o => o.type === 'wall' && o.role === 'exterior').every(w => w.finish === 'enduit-ton-pierre'), 'parement posé sur toutes les façades');
  assert.deepEqual(erreurs, [], 'aucune erreur JavaScript (onglets)');

  /* le programme introuvable (ancienne page gardée en cache) : un rechargement
     sans cache, puis la raison affichée — jamais un écran muet */
  const p2 = await navigateur.newPage();
  console.log('ÉTAPE 520');
  await p2.route('**/assets/index-*.js', r => r.fulfill({ status: 404, body: '' }));
  console.log('ÉTAPE 521');
  await p2.goto(`http://localhost:${port}/index.html?chantier=essai-panne`);
  console.log('ÉTAPE 522');
  await p2.waitForSelector('#cpd-diagnostic', { timeout: 20_000 });
  assert.match(p2.url(), /[?&]_=\d+/, 'rechargé une fois sans cache');
  assert.match(await p2.textContent('#cpd-diagnostic'), /fichier introuvable : index-.*\.js[\s\S]*Navigateur :/);
  console.log('ÉTAPE 525');
  await p2.close();
  console.log('✓ parcours CP Designer dans Chromium : dessin, déplacement, annuler, équerre des murs, onglets (murs composés, cloison fictive, types de pièces, toit, nuancier), fond image et PDF, rechargement, palette, tracé rapide (rectangle et longueurs tapés, porte placée par sa distance), bibliothèque d’ouvertures (glisser-déposer, changement de modèle), mobilier (posé contre un mur, glissé), copier-coller, export PDF (plan, façades, coupe, dossier de permis), export DXF, escalier, trait de coupe tracé, import de l’atelier, toiture, vue 3D, matériaux (façades, peinture), visite à hauteur d’homme, modèle de maison, vue gardée pour le dossier, pièces du dossier (photographie, insertion sur photo), point de prise de vue, plan de présentation, fenêtre de toit, point coté du terrain, diagnostic au démarrage');
} catch (e) {
  echec = e;
  /* une capture de l'écran au moment de l'échec, pour comprendre (CAPTURE_ECHEC=chemin.png) */
  if (process.env.CAPTURE_ECHEC) for (const pg of navigateur.contexts().flatMap(c => c.pages())) { await pg.screenshot({ path: process.env.CAPTURE_ECHEC }).catch(() => {}); break }
}
await navigateur.close();
serveur.close();
if (echec) { console.error(echec); process.exit(1) }
