// Cache compartilhado de URLs assinadas da capa das obras (bucket privado obras-images).
// Usado tanto pela lista de Obras (miniatura) quanto pela página da obra (capa grande) —
// sem isso, cada tela gera sua PRÓPRIA URL assinada pro mesmo arquivo (createSignedUrl
// nunca devolve a mesma URL duas vezes), então clicar num card pra abrir a obra sempre
// disparava um novo round-trip de rede E perdia o cache HTTP do navegador (a imagem já
// baixada pra miniatura não podia ser reaproveitada, por a URL ser diferente) — daí o
// atraso perceptível ao abrir. Guardando a URL assinada por obra aqui, quem chegar
// primeiro (lista ou página da obra) resolve pra todo mundo.
const cache = new Map(); // obraId -> { url, expiresAt }
const MARGEM_MS = 60_000; // renova um pouco antes do vencimento real (createSignedUrls usa 3600s)

export const capaCache = {
  get(obraId) {
    const hit = cache.get(obraId);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) { cache.delete(obraId); return null; }
    return hit.url;
  },
  set(obraId, url, ttlMs = 3600 * 1000) {
    cache.set(obraId, { url, expiresAt: Date.now() + ttlMs - MARGEM_MS });
  },
  clear(obraId) {
    cache.delete(obraId);
  },
};
