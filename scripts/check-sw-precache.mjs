// check-sw-precache.mjs — roda depois do `vite build` e falha o build se o manifesto de
// precache do service worker (dist/sw.js) estiver num formato que quebra o modo offline.
//
// Por que existe: uma URL duplicada com cache keys diferentes faz o Workbox lançar
// 'add-to-cache-list-conflicting-entries' dentro de precacheAndRoute, antes de registrar
// os listeners de install/fetch. O erro acontece dentro do SW (invisível no console da
// página), o registro falha em silêncio e o app parece funcionar online — mas nada é
// cacheado e o reload offline cai na cópia estática do Chrome, sem JS. Foi assim por
// semanas sem ninguém perceber (ícones do manifest entrando via glob E via
// includeManifestIcons).
//
// Checa também:
// - index.html no precache: é o fallback de navegação; sem ele o reload offline falha.
// - revision:null só em arquivo com hash do Vite no nome: sem hash e sem revisão, o
//   arquivo nunca seria atualizado no aparelho depois de trocado (mesmo regex de
//   dontCacheBustURLsMatching em vite.config.js).
import { readFileSync } from 'node:fs';

const COM_HASH = /-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;

const sw = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8');
const entradas = [...sw.matchAll(/\{url:"([^"]+)",revision:(null|"[^"]*")\}/g)]
  .map((m) => ({ url: m[1], revision: m[2] === 'null' ? null : m[2] }));

const falhar = (msg) => {
  console.error(`[check-sw-precache] ${msg}`);
  process.exit(1);
};

if (entradas.length === 0) falhar('nenhuma entrada de precache encontrada em dist/sw.js — formato mudou?');

// Normaliza ("index.html", "/index.html" e "./index.html" são a mesma URL pro Workbox).
const caminho = (u) => new URL(u, 'https://x/').pathname;

const vistos = new Set();
const duplicadas = new Set();
for (const { url } of entradas) {
  const p = caminho(url);
  (vistos.has(p) ? duplicadas : vistos).add(p);
}
if (duplicadas.size) {
  falhar(`URL(s) duplicada(s) no precache — o service worker não vai funcionar offline:\n  ${[...duplicadas].join('\n  ')}`);
}

if (!vistos.has('/index.html')) falhar('index.html fora do precache — o reload offline não teria o que abrir');

const semRevisao = entradas.filter((e) => e.revision === null && !COM_HASH.test(e.url)).map((e) => e.url);
if (semRevisao.length) {
  falhar(`arquivo(s) sem hash no nome e sem revisão — nunca seriam atualizados no aparelho:\n  ${semRevisao.join('\n  ')}`);
}

console.log(`[check-sw-precache] ok: ${entradas.length} entradas, sem duplicadas, index.html presente`);
