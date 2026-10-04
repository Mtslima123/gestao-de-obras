// pwa-assets.config.js — gera os ícones do PWA (manifest) a partir do isotipo da marca.
// Fonte: public/assets/soter-mark-white.png (729×682, mark branco já usado hoje na
// sidebar, src/Chrome.jsx) — é o único arquivo de marca que não é o logotipo completo
// com texto. Como ele é branco sobre fundo transparente, cada categoria recebe um fundo
// sólido na cor oficial (#1C4584, Pantone 281 C) pra não sumir num launcher claro.
//
// `maskable` ganha padding maior (0.3) porque o SO pode recortar esse ícone num círculo
// ou "squircle" — precisa de margem de segurança pro mark não ser cortado.
//
// Rodar com: npx pwa-assets-generator (gera os PNGs dentro de public/assets/, ao lado
// da fonte). Resultado fica versionado, igual ao favicon.ico/favicon.png hoje — não é
// regenerado a cada build.
//
// ATENÇÃO: na categoria `transparent` (pwa-64/192/512) o gerador IGNORA o background e
// sai o S branco sobre fundo transparente — no atalho da área de trabalho do Windows o
// ícone aparecia sem o quadrado azul. Esses 3 PNGs foram refeitos à mão: fundo #1C4584
// com cantos arredondados (raio 20%) e o mark ocupando 70%. Rodar o gerador de novo
// sobrescreve com a versão transparente; se precisar, refaça os pwa-*.png do mesmo jeito.
import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: {
    ...preset,
    transparent: {
      ...preset.transparent,
      padding: 0.15,
      resizeOptions: { background: '#1C4584' },
    },
    maskable: {
      ...preset.maskable,
      padding: 0.3,
      resizeOptions: { background: '#1C4584' },
    },
    apple: {
      ...preset.apple,
      padding: 0.15,
      resizeOptions: { background: '#1C4584' },
    },
  },
  images: ['public/assets/soter-mark-white.png'],
});
