import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `base` must match the GitHub Pages sub-path (compforyou.github.io/merit-lab/),
// otherwise the deployed page loads blank because it looks for its files at the root.
export default defineConfig({
  base: '/merit-lab/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
