import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

const pkg = createRequire(import.meta.url)('./package.json');

export default defineConfig({
  plugins: [react()],
  // Versão exibida nas telas vem do package.json (única fonte de verdade).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    // 🔒 SEGURANÇA [VULN-7]: Headers básicos de segurança no servidor de dev.
    // Em produção (Vercel/Netlify), configure também CSP e HSTS no painel do host.
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  },
});
