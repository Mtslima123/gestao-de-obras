-- ============================================================================
-- Migration: exclusão restrita a admin também no banco, não só na interface
-- Data: 2026-08-26
--
-- CONTEXTO: o commit "Fix: botão de excluir só aparece para administrador"
--   (mesma leva de correções desta sessão) escondeu o botão de excluir de
--   obra, foto, orçamento, item de orçamento, vínculo orçamento×cronograma e
--   anexo de tarefa para quem não é admin. Auditoria AppSec de acompanhamento
--   apontou que essa restrição, pra 4 dessas tabelas, era só de frontend: as
--   policies de banco já existentes liberavam a exclusão pra qualquer usuário
--   atribuído à obra (ou dono do registro), não só admin. Sem reforço aqui,
--   um usuário comum consegue excluir via API direta (DevTools/console),
--   ignorando o botão escondido — mesma classe de problema que
--   is_module_readonly (20260712_rls_readonly_enforcement.sql) já resolveu
--   pro caso de "módulo em modo consulta".
--
-- ESCOPO: as 4 tabelas com exclusão por linha (DELETE de verdade). Ficou de
--   fora, por ora, a exclusão de tarefa/coluna/pavimento no Cronograma —
--   ali a "exclusão" é um UPDATE do array `etapas` inteiro (upsert em
--   `cronogramas`), não um DELETE de linha, e não dá pra proteger com uma
--   policy RESTRICTIVE simples; precisa de um trigger comparando o array
--   antigo x novo, desenhado e testado à parte.
--
-- 1) orcamentos / orcamento_itens: a migration 20260825000002 (desta mesma
--    sessão, AINDA NÃO APLICADA em nenhum ambiente) criou
--    orcamentos_own_delete / orcamento_itens_own_delete permitindo que o
--    DONO (não só admin) excluísse. Como orcamentos_admin_delete e
--    orcamento_itens_admin_write (20260823000002, já em produção) já cobrem
--    o admin, e a intenção confirmada é "só admin exclui, sem exceção de
--    dono" (mesma regra do restante do Issue 3), essas duas policies de
--    dono são removidas aqui antes de nunca chegarem a ser aplicadas —
--    evita aplicar 20260825000002 e já ter que corrigir em seguida.
--
-- 2) obras / fotos_obra / orcamento_cronograma_vinculos / task_attachments:
--    novas policies RESTRICTIVE (somam por AND com as PERMISSIVE
--    existentes, sem precisar alterá-las) exigindo is_current_user_admin().
--    Pra `obras` especificamente: hoje só admin cria obra pela UI
--    (ObrasList.jsx, botão "Nova Obra" é isAdmin-gated), então nenhum fluxo
--    legítimo depende de um usuário comum ser "dono" de obra — admin-only
--    sem exceção de dono não quebra nada em uso normal.
--
-- Aplicar manualmente no SQL Editor do Supabase (projeto gestao-de-obras),
-- na mesma leva/ordem de 20260825000002 (antes ou junto, já que substitui
-- parte do que ela criaria).
-- Idempotente (DROP POLICY IF EXISTS antes de cada CREATE).
-- ============================================================================

drop policy if exists orcamentos_own_delete on public.orcamentos;
drop policy if exists orcamento_itens_own_delete on public.orcamento_itens;

drop policy if exists obras_admin_only_delete on public.obras;
create policy obras_admin_only_delete on public.obras
  as restrictive for delete to authenticated
  using (public.is_current_user_admin());

drop policy if exists fotos_obra_admin_only_delete on public.fotos_obra;
create policy fotos_obra_admin_only_delete on public.fotos_obra
  as restrictive for delete to authenticated
  using (public.is_current_user_admin());

drop policy if exists vinculos_admin_only_delete on public.orcamento_cronograma_vinculos;
create policy vinculos_admin_only_delete on public.orcamento_cronograma_vinculos
  as restrictive for delete to authenticated
  using (public.is_current_user_admin());

drop policy if exists task_attachments_admin_only_delete on public.task_attachments;
create policy task_attachments_admin_only_delete on public.task_attachments
  as restrictive for delete to authenticated
  using (public.is_current_user_admin());

-- ============================================================================
-- Rollback:
--   drop policy if exists obras_admin_only_delete on public.obras;
--   drop policy if exists fotos_obra_admin_only_delete on public.fotos_obra;
--   drop policy if exists vinculos_admin_only_delete on public.orcamento_cronograma_vinculos;
--   drop policy if exists task_attachments_admin_only_delete on public.task_attachments;
--   -- (orcamentos_own_delete / orcamento_itens_own_delete: recriar conforme
--   --  definidas em 20260825000002, se decidir reverter pra "dono também exclui")
-- ============================================================================
