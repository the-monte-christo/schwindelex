import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

const backend = process.env.BACKEND ?? 'http://localhost:3000';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [preact()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    host: true,
    proxy: {
      '/ws': { target: backend.replace(/^http/, 'ws'), ws: true },
      '/qr': backend,
    },
  },
});
