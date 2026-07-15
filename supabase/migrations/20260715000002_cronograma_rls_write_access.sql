-- ============================================================================
-- Migration: libera ESCRITA de cronogramas para admin e usuários atribuídos
-- Data: 2026-07-15
--
-- BUG (falso "Este cronograma foi alterado por outra pessoa"):
--   A leitura de `cronogramas` é ampla — a policy `cronogramas_assigned_select`
--   usa user_has_obra(obra_id) (atribuição por e-mail). Mas a ÚNICA policy
--   permissiva que cobre UPDATE/INSERT/DELETE é `cronogramas_own`, cujo
--   predicado é `obras.user_id = auth.uid()` (dono por user_id).
--
--   Por causa do descasamento conhecido entre user_profiles.id, obras.user_id e
--   auth.uid() (mesmo problema já corrigido em can_access_obra —
--   20260713000001), esse `user_id = auth.uid()` quase nunca bate — nem para
--   admin. Resultado: o usuário LÊ o cronograma, mas todo UPDATE é filtrado pela
--   RLS e afeta 0 linhas SEM erro. O cliente (salvarCronograma em
--   Cronograma.jsx) interpreta "0 linhas + linha ainda existe" como conflito de
--   concorrência e mostra o banner amarelo, mesmo sem ninguém editando junto.
--   Evidência: obras compartilhadas ficam com `cronogramas.updated_at` congelado
--   (nenhum save do usuário chega a gravar).
--
-- FIX: adicionar uma policy PERMISSIVA de escrita que espelha o modelo de acesso
--   já usado no resto do sistema — public.can_access_obra(obra_id), que libera
--   admin OU usuário atribuído à obra (casando por e-mail, status = 'ativo').
--   Policies permissivas se combinam por OR, então esta é ADITIVA: não remove
--   nenhum acesso existente. As policies RESTRICTIVE de somente-leitura
--   (cron_ro_ins/upd/del, de 20260712_rls_readonly_enforcement) continuam
--   valendo por AND — um usuário marcado como somente-leitura segue sem gravar.
--
-- COMO RODAR: revisar e executar no SQL Editor do Supabase (projeto
--   gestao-de-obras). Idempotente (pode rodar mais de uma vez).
-- ============================================================================

drop policy if exists cronogramas_write_access on public.cronogramas;
create policy cronogramas_write_access on public.cronogramas
  as permissive for all to authenticated
  using (public.can_access_obra(obra_id))
  with check (public.can_access_obra(obra_id));

-- ============================================================================
-- Rollback:
--   drop policy if exists cronogramas_write_access on public.cronogramas;
-- ============================================================================
