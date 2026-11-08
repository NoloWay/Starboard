import { defineConfig } from 'vite'

// base: './' => le site fonctionne depuis n'importe quel sous-dossier (GitHub Pages inclus)
export default defineConfig({
  base: './',
  // Ouvre le site dans le navigateur par défaut (Brave) au lancement de `npm run dev`
  server: { open: true },
})
