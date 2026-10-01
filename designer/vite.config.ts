import { defineConfig } from 'vitest/config';

/* La page est publiée sous /designer/ du site GitHub Pages, à côté du CRM :
   des chemins relatifs la rendent indépendante de l'adresse du site.
   La compilation sort dans build/ ; le déploiement la recopie sur designer/
   (voir .github/workflows/pages.yml). */
export default defineConfig({
  base: './',
  build: { outDir: 'build', emptyOutDir: true, sourcemap: true },
  test: { include: ['tests/**/*.test.ts'] },
});
