/* Parcours dans un vrai navigateur (Chromium, Playwright) : la page compilée
   (build/) s'ouvre, on dessine une maison à la souris et au clavier comme
   un utilisateur, puis on vérifie le modèle. Sans connexion : le Designer
   travaille en mode local (aucun appel au serveur de production).

   Lancement : npm run test:navigateur (compile d'abord). Chromium :
   /opt/pw-browsers/chromium, ou la variable CHROMIUM. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(`http://localhost:${port}/index.html?chantier=essai-e2e`);
  await p.waitForSelector('.cpd canvas');
  await p.waitForFunction(() => window.cpDesigner);
  const etat = await p.textContent('.etat');
  assert.match(etat, /Non connecté/, 'sans session : mode local annoncé');

  const ecran = (x, y) => p.evaluate(([x, y]) => {
    const c = window.cpDesigner.camera(), r = document.querySelector('.cpd canvas').getBoundingClientRect();
    return { x: r.left + (x - c.centre.x) * c.echelle + c.largeur / 2, y: r.top + c.hauteur / 2 - (y - c.centre.y) * c.echelle };
  }, [x, y]);
  const clic = async (x, y) => { const e = await ecran(x, y); await p.mouse.move(e.x, e.y); await p.mouse.down(); await p.mouse.up() };
  const objets = () => p.evaluate(() => Object.values(window.cpDesigner.projet().buildings[0].floors[0].objects));

  /* une maison de 10 × 8 m, une cloison, une porte, deux pièces, une cote */
  await p.keyboard.press('m');
  for (const [x, y] of [[0, 0], [10000, 0], [10000, 8000], [0, 8000], [0, 0]]) await clic(x, y);
  await p.keyboard.press('c'); await clic(4000, 0); await clic(4000, 8000);
  await p.keyboard.press('o'); await clic(2000, 0);
  await p.keyboard.press('p'); await clic(2000, 4000);
  await p.fill('.voile input[name=nom]', 'Séjour'); await p.keyboard.press('Enter');
  await clic(7000, 4000);
  await p.fill('.voile input[name=nom]', 'Chambre'); await p.selectOption('.voile select', 'bedroom'); await p.keyboard.press('Enter');
  await p.keyboard.press('d'); await clic(0, 3000); await clic(4000, 3000);
  await p.keyboard.press('v');
  let O = await objets();
  assert.deepEqual(O.map(o => o.type).sort(), ['dimension', 'opening', 'room', 'room', 'wall', 'wall', 'wall', 'wall', 'wall']);
  assert.match(await p.textContent('aside'), /Séjour\s*30,15 m²/, 'surface du séjour au panneau');

  /* tirer la cloison d'un mètre : les pièces et la cote suivent */
  await p.keyboard.press('Escape');
  const a = await ecran(4000, 6000), b = await ecran(5000, 6000);
  await p.keyboard.down('Alt');
  await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(a.x + 10, a.y, { steps: 2 }); await p.mouse.move(b.x, b.y, { steps: 5 }); await p.mouse.up();
  await p.keyboard.up('Alt');
  O = await objets();
  const cloison = O.find(o => o.role === 'partition');
  assert.ok(Math.abs(cloison.axis.a.x - 5000) <= 1 && Math.abs(cloison.axis.b.x - 5000) <= 1, 'cloison déplacée à 5 m : ' + JSON.stringify(cloison.axis));
  /* annuler (Ctrl+Z) la remet à 4 m */
  await p.mouse.click(1080, 820);
  await p.keyboard.press('Control+z');
  O = await objets();
  assert.equal(O.find(o => o.role === 'partition').axis.a.x, 4000, 'annuler');

  /* un fond image : import, calage par une distance de 10 m, verrouillage */
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('text=Importer un fond…')]);
  await fc.setFiles({ name: 'plan-fictif.png', mimeType: 'image/png', buffer: png(1040, 840) });
  await p.waitForFunction(() => Object.values(window.cpDesigner.projet().buildings[0].floors[0].objects).some(o => o.type === 'underlay'));
  await p.click('text=Caler par deux points…');
  await p.keyboard.down('Alt');
  await clic(20, -820); await clic(1020, -820);
  await p.keyboard.up('Alt');
  await p.fill('.voile input[name=d]', '10'); await p.keyboard.press('Enter');
  await p.check('aside label:has-text("Verrouillé") input');
  O = await objets();
  const fond = O.find(o => o.type === 'underlay');
  assert.ok(Math.abs(fond.transform.scale - 10) < 1e-6 && fond.locked, 'fond calé (10 mm par pixel) et verrouillé : ' + JSON.stringify(fond));

  /* un fond PDF : rendu par pdf.js sans erreur */
  await p.mouse.click(1080, 820);
  const [fc2] = await Promise.all([p.waitForEvent('filechooser'), p.click('text=Importer un fond…')]);
  await fc2.setFiles({ name: 'plan-fictif.pdf', mimeType: 'application/pdf', buffer: pdf() });
  await p.waitForFunction(() => Object.values(window.cpDesigner.projet().buildings[0].floors[0].objects).filter(o => o.type === 'underlay').length === 2);
  await p.waitForTimeout(1500);
  assert.equal(await p.locator('.toast.err').count(), 0, 'aucun message d’erreur (PDF lisible)');

  /* rechargement : le travail est retrouvé (copie locale) */
  await p.reload();
  await p.waitForFunction(() => window.cpDesigner);
  O = await objets();
  assert.equal(O.filter(o => o.type === 'wall').length, 5, 'projet retrouvé après rechargement');

  /* palette Ctrl+K */
  await p.keyboard.press('Control+k');
  await p.keyboard.type('niveau');
  assert.match(await p.textContent('.palette ul'), /Ajouter un niveau/);
  await p.keyboard.press('Escape');

  /* tracé rapide : un rectangle hors tout tapé au clavier (10x8), un mur
     tapé (4,5 m), une fenêtre placée par sa distance au mur voisin */
  await p.goto(`http://localhost:${port}/index.html?chantier=essai-rapide`);
  await p.waitForFunction(() => window.cpDesigner);
  await p.keyboard.press('r'); await clic(0, 0);
  { const e = await ecran(3000, 2000); await p.mouse.move(e.x, e.y) }
  await p.keyboard.type('10x8'); await p.keyboard.press('Enter');
  O = await objets();
  assert.equal(O.filter(o => o.type === 'wall').length, 4, 'rectangle tapé : 4 murs');
  assert.match(await p.textContent('aside'), /72,96 m²/, 'pièce de 9,60 × 7,60 m à l’intérieur des murs de 20 cm');
  await p.keyboard.press('m'); await p.keyboard.down('Alt'); await clic(13000, 0);
  { const e = await ecran(15000, 0); await p.mouse.move(e.x, e.y) }
  await p.keyboard.up('Alt');
  await p.keyboard.type('4,5'); await p.keyboard.press('Enter'); await p.keyboard.press('Escape');
  O = await objets();
  const tape = O.find(o => o.type === 'wall' && o.axis.a.x === 13000);
  assert.deepEqual(tape?.axis, { a: { x: 13000, y: 0 }, b: { x: 17500, y: 0 } }, 'mur tapé : 4,50 m vers la droite');
  await p.keyboard.press('Escape');
  await p.keyboard.press('o'); await clic(3000, 100);
  await p.keyboard.press('v'); await clic(3000, 100);
  await p.fill('aside label:has-text("Distance à gauche") input', '1.5'); await p.keyboard.press('Tab');
  O = await objets();
  const porte = O.find(o => o.type === 'opening');
  assert.equal(porte.offset, 200 + 1500 + 450, 'porte à 1,50 m de l’angle intérieur : ' + porte.offset);
  /* bibliothèque d'ouvertures : une fenêtre 2 vantaux glissée sur le mur du haut, puis changée en baie coulissante */
  await p.keyboard.press('Escape'); await p.keyboard.press('o');
  assert.match(await p.textContent('aside'), /Bibliothèque d’ouvertures/);
  if (process.env.CAPTURE_BIBLIO) await p.screenshot({ path: process.env.CAPTURE_BIBLIO });
  {
    const cible = await ecran(6000, 7900), r = await p.locator('.cpd canvas').boundingBox();
    await p.locator('.tuile[data-m="fen-2v-120x125"]').dragTo(p.locator('.cpd canvas'), { targetPosition: { x: cible.x - r.x, y: cible.y - r.y } });
  }
  O = await objets();
  const fen = O.find(o => o.type === 'opening' && o.kind === 'window');
  assert.ok(fen && fen.width === 1200 && fen.sill === 900 && fen.leaves === 2 && fen.catalogRef?.id === 'fen-2v-120x125', 'fenêtre glissée depuis la bibliothèque : ' + JSON.stringify(fen));
  await p.keyboard.press('v'); { const e = await ecran(6000, 7900); await p.mouse.click(e.x, e.y) }
  await p.selectOption('aside label:has-text("Modèle") select', 'baie-2v-240x215');
  O = await objets();
  assert.ok(O.some(o => o.type === 'opening' && o.kind === 'bay' && o.width === 2400 && o.operation === 'sliding'), 'modèle changé en baie coulissante');
  await p.keyboard.press('Escape');
  /* mobilier : un lit posé près du mur du bas s'y plaque ; un canapé glissé près du mur du haut s'y retourne */
  await p.keyboard.press('b');
  assert.match(await p.textContent('aside'), /Mobilier/);
  await p.click('aside summary:has-text("Chambre")');
  await p.click('.tuile[data-m="lit-160"]');
  await clic(5000, 900);
  O = await objets();
  const lit = O.find(o => o.type === 'furniture');
  assert.deepEqual([lit?.position, lit?.rotation], [{ x: 5000, y: 200 + 1000 }, 0], 'lit plaqué contre le mur du bas : ' + JSON.stringify(lit));
  await p.click('aside summary:has-text("Séjour")');
  {
    const cible = await ecran(5000, 7300), r = await p.locator('.cpd canvas').boundingBox();
    await p.locator('.tuile[data-m="canape-3p"]').dragTo(p.locator('.cpd canvas'), { targetPosition: { x: cible.x - r.x, y: cible.y - r.y } });
  }
  O = await objets();
  const canape = O.find(o => o.type === 'furniture' && o.catalogRef.id === 'canape-3p');
  assert.ok(canape && Math.abs(canape.position.y - (7800 - 475)) < 1 && Math.abs(Math.cos(canape.rotation) + 1) < 1e-9, 'canapé glissé, plaqué contre le mur du haut : ' + JSON.stringify(canape));
  await p.keyboard.press('Escape');
  /* copier-coller : tout le niveau (Ctrl+A), copié, recollé d'un clic à (3 ; 3) m ; un « annuler » le retire */
  await p.keyboard.press('v');
  const avantCollage = (await objets()).length;
  await p.keyboard.press('Control+a');
  assert.match(await p.textContent('aside'), /objets choisis/);
  await p.keyboard.press('Control+c');
  await p.keyboard.press('Control+v');
  {
    const e = await ecran(3000, 3000); await p.mouse.move(e.x, e.y); await p.keyboard.down('Alt'); await p.mouse.down(); await p.mouse.up(); await p.keyboard.up('Alt');
  }
  O = await objets();
  assert.equal(O.filter(o => o.type === 'wall').length, 10, 'murs recollés');
  assert.equal(O.filter(o => o.type === 'furniture').length, 4, 'meubles recollés');
  assert.ok(O.some(o => o.type === 'wall' && o.axis.a.x === 3000 && o.axis.a.y === 3000), 'le coin du groupe posé au clic');
  await p.keyboard.press('Control+z');
  assert.equal((await objets()).length, avantCollage, 'un « annuler » retire tout le collage');
  await p.keyboard.press('Escape');
  /* export PDF : une planche A3 vectorielle, téléchargée */
  await p.click('header button.bpdf');
  await p.waitForSelector('.voile h2:has-text("Exporter en PDF")');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.voile button.prim')]);
  const chemin = await dl.path();
  const fichierPdf = await readFile(chemin);
  assert.equal(fichierPdf.subarray(0, 8).toString('latin1'), '%PDF-1.4', 'un PDF');
  assert.ok(fichierPdf.toString('latin1').includes('(CP CONSTRUCTIONS)'), 'cartouche');
  assert.ok(fichierPdf.toString('latin1').includes('(Fa\xE7ade sud \\(bas du plan\\))') && fichierPdf.toString('latin1').includes('/Count 3'), 'planche des façades');
  assert.ok(fichierPdf.toString('latin1').includes('(Coupe A-A)') && fichierPdf.toString('latin1').includes('(PLAN DE REP\xC9RAGE)'), 'planche de la coupe');
  assert.match(dl.suggestedFilename(), /plans A3 - RDC\.pdf$/);
  if (process.env.PDF_SORTIE) await dl.saveAs(process.env.PDF_SORTIE);
  /* le dossier de permis complet, du même dialogue */
  await p.click('header button.bpdf');
  await p.waitForSelector('.voile h2:has-text("Exporter en PDF")');
  await p.selectOption('.voile label:has-text("Composer") select', 'dossier');
  await p.fill('.voile label:has-text("Maître d’ouvrage") input', 'M. et Mme Fictifs');
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('.voile button.prim')]);
  const dossier = (await readFile(await dl2.path())).toString('latin1');
  assert.ok(dossier.includes('(DEMANDE DE PERMIS DE CONSTRUIRE)') && dossier.includes('(M. et Mme Fictifs)') && dossier.includes('(PCMI 5 \x97 Fa\xE7ades)'), 'dossier de permis');
  assert.match(dl2.suggestedFilename(), /dossier PC\.pdf$/);
  /* escalier : posé d'un clic (droit, 0,90 m), choisi, son calcul affiché ; à l'étage ajouté, sa trémie */
  await p.keyboard.press('e');
  assert.match(await p.textContent('aside'), /Hauteur à franchir/);
  await clic(1500, 1000);
  O = await objets();
  const esc = O.find(o => o.type === 'stair');
  assert.deepEqual([esc?.position, esc?.width, esc?.kind], [{ x: 1500, y: 1000 }, 900, 'straight'], 'escalier posé : ' + JSON.stringify(esc));
  await clic(1500, 2000);
  assert.match(await p.textContent('aside'), /Escalier — Droit[\s\S]*15 hauteurs de 18,0 cm/);
  if (process.env.CAPTURE_ESCALIER) await p.screenshot({ path: process.env.CAPTURE_ESCALIER });
  /* trait de coupe : tracé (K, deux clics), choisi, son aperçu dans l'inspecteur, regard inversé (T) */
  await p.keyboard.press('k');
  await clic(-600, 6000); await clic(10600, 6000);                    // à l'écart du message « PDF enregistré », en bas
  O = await objets();
  const tc = O.find(o => o.type === 'section');
  assert.ok(tc && tc.name === 'A' && tc.look === 'left' && Math.abs(tc.a.y - tc.b.y) < 1, 'trait de coupe tracé, parcelle tracée et implantée, terrasse tracée : ' + JSON.stringify(tc));
  await clic(2500, tc.a.y);
  assert.match(await p.textContent('aside'), /Coupe A-A/);
  assert.ok(await p.locator('aside .apercu-coupe svg polygon').count() > 5, 'aperçu de la coupe');
  if (process.env.CAPTURE_COUPE) await p.screenshot({ path: process.env.CAPTURE_COUPE });
  await p.keyboard.press('t');
  assert.equal((await objets()).find(o => o.type === 'section').look, 'right', 'regard inversé');
  /* parcelle : tracée (L, sommets cliqués dans les coins, loin du message en bas), choisie, implantée à 5 m et 3 m */
  await p.keyboard.press('Escape');
  await p.keyboard.press('l');
  for (const [x, y] of [[-1000, -500], [12000, -500], [12000, 9000], [-1000, 9000], [-1000, -500]]) await clic(x, y);
  const parc = (await objets()).find(o => o.type === 'plot');
  assert.ok(parc && parc.contour.length === 4, 'parcelle tracée : ' + JSON.stringify(parc));
  await clic(-1000, 4000);
  assert.match(await p.textContent('aside'), /Terrain : [\d ,]+ m²[\s\S]*Emprise au sol/);
  await p.click('aside button:has-text("Placer")');
  assert.match(await p.textContent('aside'), /Côté 1 : [\d,]+ m — recul 5,00 m/, 'parcelle placée à 5 m du côté 1');
  if (process.env.CAPTURE_PARCELLE) await p.screenshot({ path: process.env.CAPTURE_PARCELLE });
  /* aménagement : une terrasse en dalles tracée à l'outil A (quatre sommets, retour au premier) */
  await p.keyboard.press('Escape');
  await p.keyboard.press('a');
  await p.selectOption('aside label:has-text("Genre") select', 'terrace');
  await p.selectOption('aside label:has-text("Aspect") select', 'terrasse-dalles');
  for (const [x, y] of [[-1000, 5000], [-400, 5000], [-400, 7000], [-1000, 7000], [-1000, 5000]]) await clic(x, y);
  const ter = (await objets()).find(o => o.type === 'landscape');
  assert.ok(ter && ter.kind === 'terrace' && ter.finish === 'terrasse-dalles' && ter.points.length === 4, 'terrasse tracée : ' + JSON.stringify(ter));
  await p.keyboard.press('Escape');
  await p.keyboard.press('f');
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
  await p.goto(`http://localhost:${port}/index.html?chantier=essai-import`);
  await p.waitForFunction(() => window.cpDesigner);
  const [fc3] = await Promise.all([p.waitForEvent('filechooser'), p.click('text=Importer le RDC lu par l’atelier…')]);
  await fc3.setFiles({ name: 'modele.json', mimeType: 'application/json', buffer: await readFile(new URL('../fixtures/atelier_fictif.json', import.meta.url)) });
  await p.waitForSelector('.voile h2:has-text("Plan importé")');
  const rapport = await p.textContent('.voile');
  assert.match(rapport, /8 murs, 11 ouvertures, 5 pièces/);
  assert.match(rapport, /Séjour - cuisine\s*37,00\s*37,00\s*0,00/);
  assert.match(rapport, /Rien à reprendre/);
  await p.click('.voile button');
  O = await objets();
  assert.equal(O.filter(o => o.type === 'wall').length, 8, 'murs importés');
  const trace = O.find(o => o.type === 'underlay');
  assert.ok(trace && trace.locked && Math.abs(trace.transform.scale - 5) < 1e-9, 'tracé source posé, calé et verrouillé');
  await p.waitForTimeout(500);
  await p.screenshot({ path: process.env.CAPTURE ?? '/dev/null' }).catch(() => {});
  /* la vue 3D du plan importé : maquette chargée à la demande, mise à jour à
     chaque modification, vue maquette, retour au plan */
  /* une toiture à croupes sur le plan importé (calculée depuis ses murs) */
  await p.click('aside button:has-text("Ajouter une toiture")');
  assert.match(await p.textContent('aside'), /faîtage à \d+,\d\d m/, 'faîtage annoncé');
  assert.equal((await objets()).filter(o => o.type === 'roof').length, 1);
  await p.keyboard.press('3');
  await p.waitForFunction(() => (window.cpDesigner.vue3d()?.maillages ?? 0) > 0, null, { timeout: 20_000 });
  const s3d = await p.evaluate(() => window.cpDesigner.vue3d());
  assert.ok(s3d.maillages > 40 && s3d.triangles > 400, 'maquette 3D construite : ' + JSON.stringify(s3d));
  await p.waitForTimeout(400);
  if (process.env.CAPTURE_3D) await p.screenshot({ path: process.env.CAPTURE_3D });
  /* matériaux : un bardage sur toutes les façades, d'un choix dans le panneau 3D ; la 3D suit */
  const avantMat = (await p.evaluate(() => window.cpDesigner.vue3d())).maillages;
  await p.selectOption('aside label:has-text("Façades (tous les murs extérieurs)") select', 'bardage-bois-naturel');
  const ext = (await objets()).filter(o => o.type === 'wall' && o.role === 'exterior');
  assert.ok(ext.length > 0 && ext.every(o => o.finish === 'bardage-bois-naturel'), 'parement sur toutes les façades');
  await p.waitForFunction(n => window.cpDesigner.vue3d().maillages > n, avantMat);
  await p.waitForTimeout(300);
  if (process.env.CAPTURE_MATERIAUX) await p.screenshot({ path: process.env.CAPTURE_MATERIAUX });
  /* et une peinture dans toutes les pièces du niveau */
  await p.selectOption('aside label:has-text("Murs intérieurs") select', 'peinture-vert-sauge');
  const pieces = (await objets()).filter(o => o.type === 'room');
  assert.ok(pieces.length > 0 && pieces.every(o => o.wallFinish === 'peinture-vert-sauge'), 'peinture dans toutes les pièces');
  await p.check('aside label:has-text("Vue maquette") input');
  await p.waitForTimeout(300);
  if (process.env.CAPTURE_3D_COUPE) await p.screenshot({ path: process.env.CAPTURE_3D_COUPE });
  await p.keyboard.press('Control+z');                               // annuler le fond : la 3D suit sans erreur
  assert.ok((await p.evaluate(() => window.cpDesigner.vue3d()))?.maillages > 40);
  await p.keyboard.press('Control+Shift+z');
  /* la visite à hauteur d'homme : départ dans la plus grande pièce, on marche (Z / W tenue), on tourne (←) */
  await p.click('aside button.bvisite');
  await p.waitForFunction(() => window.cpDesigner.marcheur() !== null);
  const w0 = await p.evaluate(() => window.cpDesigner.marcheur());
  assert.ok(Math.abs(w0.pied - 5) < 1, 'les pieds sur le sol fini : ' + JSON.stringify(w0));
  assert.match(await p.textContent('aside'), /Visite à hauteur d’homme/);
  await p.keyboard.down('KeyW'); await p.waitForTimeout(700); await p.keyboard.up('KeyW');
  await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(300); await p.keyboard.up('ArrowLeft');
  const w1 = await p.evaluate(() => window.cpDesigner.marcheur());
  assert.ok(Math.hypot(w1.x - w0.x, w1.y - w0.y) > 150, 'le marcheur avance : ' + JSON.stringify([w0, w1]));
  assert.ok(w1.cap > w0.cap + 0.1, 'il tourne à gauche');
  assert.equal((await objets()).filter(o => o.type === 'roof').length, 1, 'les touches de la visite ne touchent pas au plan');
  if (process.env.CAPTURE_VISITE) await p.screenshot({ path: process.env.CAPTURE_VISITE });
  await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(() => window.cpDesigner.marcheur()), null, 'sortie de la visite');
  assert.ok((await p.evaluate(() => window.cpDesigner.vue3d()))?.maillages > 40, 'toujours en 3D');
  await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(() => window.cpDesigner.vue3d()), null, 'retour au plan');

  /* l'import s'annule d'un coup (la peinture, le parement des façades, la toiture, le fond, puis le plan) */
  await p.mouse.click(1080, 820);
  await p.keyboard.press('Control+z');
  assert.ok((await objets()).filter(o => o.type === 'room').every(o => !o.wallFinish), 'un « annuler » retire la peinture de toutes les pièces');
  await p.keyboard.press('Control+z');
  assert.ok((await objets()).filter(o => o.type === 'wall').every(o => !o.finish), 'un « annuler » retire le parement de toutes les façades');
  await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z');
  O = await objets();
  assert.equal(O.length, 0, 'cinq « annuler » (la peinture, le parement, la toiture, le fond, le plan) : niveau vide');

  assert.equal(await p.locator('#cpd-diagnostic').count(), 0, 'page qui démarre : aucun diagnostic affiché');
  assert.deepEqual(erreurs, [], 'aucune erreur JavaScript');

  /* le programme introuvable (ancienne page gardée en cache) : un rechargement
     sans cache, puis la raison affichée — jamais un écran muet */
  const p2 = await navigateur.newPage();
  await p2.route('**/assets/index-*.js', r => r.fulfill({ status: 404, body: '' }));
  await p2.goto(`http://localhost:${port}/index.html?chantier=essai-panne`);
  await p2.waitForSelector('#cpd-diagnostic', { timeout: 20_000 });
  assert.match(p2.url(), /[?&]_=\d+/, 'rechargé une fois sans cache');
  assert.match(await p2.textContent('#cpd-diagnostic'), /fichier introuvable : index-.*\.js[\s\S]*Navigateur :/);
  await p2.close();
  console.log('✓ parcours CP Designer dans Chromium : dessin, déplacement, annuler, fond image et PDF, rechargement, palette, tracé rapide (rectangle et longueurs tapés, porte placée par sa distance), bibliothèque d’ouvertures (glisser-déposer, changement de modèle), mobilier (posé contre un mur, glissé), copier-coller, export PDF (plan, façades, coupe, dossier de permis), escalier, trait de coupe tracé, import de l’atelier, toiture, vue 3D, matériaux (façades, peinture), visite à hauteur d’homme, diagnostic au démarrage');
} catch (e) { echec = e }
await navigateur.close();
serveur.close();
if (echec) { console.error(echec); process.exit(1) }
