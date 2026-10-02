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

const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
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
  /* l'import s'annule d'un coup (le fond, puis le plan) */
  await p.mouse.click(1080, 820);
  await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z');
  O = await objets();
  assert.equal(O.length, 0, 'deux « annuler » : niveau vide');

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
  console.log('✓ parcours CP Designer dans Chromium : dessin, déplacement, annuler, fond image et PDF, rechargement, palette, import de l’atelier, diagnostic au démarrage');
} catch (e) { echec = e }
await navigateur.close();
serveur.close();
if (echec) { console.error(echec); process.exit(1) }
