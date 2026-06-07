import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
