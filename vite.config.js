import { defineConfig } from 'vite';

// base: './' — сборка работает из любой папки: Vercel, Netlify, GitHub Pages, просто открыть на флешке через сервер
export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
