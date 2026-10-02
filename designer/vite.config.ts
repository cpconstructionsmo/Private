import { defineConfig } from 'vitest/config';

/* La page est publiée sous /designer/ du site GitHub Pages, à côté du CRM :
   des chemins relatifs la rendent indépendante de l'adresse du site.
   La compilation sort dans build/ ; le déploiement la recopie sur designer/
   (voir .github/workflows/pages.yml).

   Cible : des navigateurs de quelques années (Safari 14 sur un Mac ou un
   iPad pas tout à fait à jour) — la syntaxe récente est réécrite. */
export default defineConfig({
  base: './',
  build: { outDir: 'build', emptyOutDir: true, sourcemap: true, target: ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'] },
  test: { include: ['tests/**/*.test.ts'] },
});
