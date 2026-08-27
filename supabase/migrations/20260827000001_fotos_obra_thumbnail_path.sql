-- ============================================================================
-- Migration: coluna thumbnail_path + índice para ordenação por data em fotos_obra
-- Data: 2026-08-27
--
-- CONTEXTO: aba Fotos do detalhe de obra estava lenta e só tende a piorar (fica
--   mais fotos ao longo da obra). Duas causas: (1) buscava todas as fotos da
--   obra de uma vez, sem paginação — corrigido no client, sem depender desta
--   migration; (2) grid pequeno e visualizador fullscreen usavam a MESMA
--   imagem (comprimida a 1200px no upload), desperdiçando banda/decode numa
--   miniatura que só precisa de ~250-400px.
--
-- thumbnail_path guarda o path (no bucket obras-images) de uma segunda cópia
--   menor (600px), gerada só em uploads NOVOS a partir desta mudança — sem
--   backfill das fotos já existentes (o EditFotoModal não tem opção de
--   re-upload de imagem hoje; se precisar cobrir fotos antigas, é um pedido
--   novo, à parte). Nullable e sem default: fotos sem thumbnail (antigas, ou
--   upload cujo thumbnail falhou) caem no fallback pra storage_path (a
--   imagem original) no código de leitura, sem quebrar a exibição.
--
-- idx_fotos_obra_obra_data: a galeria passa a ordenar por (data DESC,
--   created_at DESC) em vez de só created_at — created_at é quando o
--   registro foi criado no banco, não a data real da foto (campo `data`,
--   preenchido manualmente e obrigatório no upload). NULLS LAST casado com o
--   nullsFirst:false usado na query, pra cobrir o caso (não confirmado) de
--   alguma linha legada com `data` nula.
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
-- ============================================================================

alter table public.fotos_obra
  add column if not exists thumbnail_path text;

create index if not exists idx_fotos_obra_obra_data
  on public.fotos_obra (obra_id, data desc nulls last, created_at desc);

-- ============================================================================
-- Rollback:
--   drop index if exists public.idx_fotos_obra_obra_data;
--   alter table public.fotos_obra drop column if exists thumbnail_path;
-- ============================================================================
