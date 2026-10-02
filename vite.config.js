import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createRequire } from 'node:module';

const pkg = createRequire(import.meta.url)('./package.json');

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt', não 'autoUpdate': o app já tem o padrão "Nova versão disponível" pro
      // erro de chunk antigo pós-deploy (ver ErrorBoundary em App.jsx), que nunca troca
      // o app sozinho debaixo do usuário. Mesmo cuidado aqui: um autoUpdate silencioso
      // podia trocar o app shell no meio de um formulário longo (RDO, medição etc.).
      registerType: 'prompt',
      // Sem includeAssets e com includeManifestIcons:false: favicon.ico/png e os ícones
      // do manifest (public/assets/*.png) já entram pelo globPatterns abaixo. Declarados
      // de novo, a mesma URL aparecia 2x no precache com cache keys diferentes, o Workbox
      // abortava em precacheAndRoute ('add-to-cache-list-conflicting-entries') ANTES de
      // registrar install/fetch — o SW ativava sem cachear nada e o reload offline caía
      // na cópia estática que o Chrome guarda (sem JS). scripts/check-sw-precache.mjs
      // roda no build e falha se uma duplicata voltar.
      includeManifestIcons: false,
      manifest: {
        name: 'Soter | Gestão de Obras',
        short_name: 'Soter Obras',
        description: 'Gestão de obras de construção civil — Soter Engenharia',
        lang: 'pt-BR',
        theme_color: '#1C4584',
        background_color: '#1C4584',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/assets/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: '/assets/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/assets/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/assets/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Só o app shell do build (JS/CSS/HTML/ícones/fontes). Sem runtimeCaching:
        // nenhuma chamada ao Supabase é interceptada pelo service worker — toda
        // requisição de API vai direto pra rede e falha normalmente quando offline
        // (nada de dado obsoleto aparecendo silenciosamente; ver src/utils/connectivity.js
        // e o fallback "sem conexão" nas telas, que tratam essa falha).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf}'],
        // Padrão do plugin é /^assets\// (pula a revisão de tudo em assets/). Só que
        // public/assets/ também tem arquivos SEM hash no nome (logos, ícones PWA): sem
        // revisão, o Workbox nunca os baixaria de novo num deploy e um logo trocado ficaria
        // velho pra sempre em quem já tem o SW. Agora só pula o que tem hash do Vite.
        dontCacheBustURLsMatching: /-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/,
      },
      devOptions: {
        enabled: false, // SW real só roda em `npm run build && npm run preview`
      },
    }),
  ],
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
  // Testes unitários (vitest). O teste de integração de segurança (Supabase real +
  // credenciais TEST_USER_*) é excluído do run padrão e roda via `npm run test:security`.
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    exclude: ['**/node_modules/**', 'src/__tests__/security.test.js'],
  },
});
