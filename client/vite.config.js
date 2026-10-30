import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const DEV_SERVER_PORT = 5173;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The project-wide /assets folder is served as static files, so /icons/logo.svg resolves
  // to assets/icons/logo.svg.
  publicDir: '../assets',
  server: { port: DEV_SERVER_PORT },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup_tests.js'],
  },
});
