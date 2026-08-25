-- ============================================================================
-- Migration: FK de user_obras.obra_id -> obras.id, com limpeza de órfãos
-- Data: 2026-08-25
--
-- BUG reportado: tela Administração > Usuários mostra contagem errada em
--   "Obras Liberadas" (ex: usuária com só 1 obra marcada no formulário de
--   edição aparecia com "5 obras" na lista, num sistema com só 3 obras
--   cadastradas no total).
--
-- CAUSA RAIZ: user_obras.obra_id é TEXT NOT NULL, sem foreign key para
--   obras.id. Quando uma obra é excluída, as linhas de user_obras que
--   apontavam pra ela ficam órfãs (não são removidas em cascata). O badge da
--   lista (Usuarios.jsx, obrasLabel) contava essas linhas cruas; o formulário
--   de edição já cruzava contra a lista viva de obras, por isso mostrava o
--   número certo. Confirmado em consulta somente leitura: 4 das 6 linhas de
--   user_obras hoje são órfãs. Não é uma falha de controle de acesso (quem
--   decide quais obras um usuário vê é obrasPermitidas() + filtro contra a
--   lista viva de obras em App.jsx, que já ignora ids órfãos), é acúmulo de
--   lixo de dado.
--
-- FIX: apaga os vínculos órfãos existentes e adiciona a FK com ON DELETE
--   CASCADE, para que a limpeza aconteça sozinha a cada exclusão de obra daqui
--   pra frente (mesmo padrão já usado em
--   orcamento_cronograma_vinculos.obra_id). O fix de exibição (obrasLabel
--   cruzando contra a lista viva de obras) já foi aplicado no frontend
--   (src/modules/admin/Usuarios.jsx) e não depende desta migration para
--   funcionar — esta migration ataca a causa, não só o sintoma.
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras).
-- Idempotente (DELETE por condição + ADD CONSTRAINT IF NOT EXISTS via bloco).
-- ============================================================================

delete from public.user_obras uo
where not exists (
  select 1 from public.obras o where o.id = uo.obra_id
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_obras_obra_id_fkey'
  ) then
    alter table public.user_obras
      add constraint user_obras_obra_id_fkey
      foreign key (obra_id) references public.obras(id)
      on delete cascade;
  end if;
end $$;

-- ============================================================================
-- Rollback:
--   alter table public.user_obras drop constraint if exists user_obras_obra_id_fkey;
--   (a limpeza de órfãos não tem rollback — os vínculos removidos já eram
--   inválidos, apontavam pra obras que não existem mais)
-- ============================================================================
