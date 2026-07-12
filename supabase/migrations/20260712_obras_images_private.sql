-- ============================================================================
-- Migration: tornar o bucket `obras-images` privado (fotos de obra são de uso interno)
-- Data: 2026-07-12
--
-- Depende da função public.can_access_obra(text), criada na migration
-- 20260712_task_attachments_history.sql (já aplicada).
--
-- Convenção de path das imagens (definida no código):
--   obras/<obra_id>/capa.jpg
--   obras/<obra_id>/fotos/<timestamp>.jpg
-- Logo, o obra_id é o 2º segmento: (storage.foldername(name))[2].
--
-- ORDEM IMPORTANTE:
--   1) Publique primeiro o app com a exibição por URL assinada (já implementado no código).
--   2) Rode este bloco de POLICIES (pode rodar mesmo com o bucket ainda público; não quebra nada).
--   3) SÓ DEPOIS rode o passo final (marcado lá embaixo) que vira o bucket para privado.
-- ============================================================================

-- ── Policies de Storage (acesso por obra; admin cai no can_access_obra) ──────
drop policy if exists obras_img_select on storage.objects;
create policy obras_img_select on storage.objects
  for select to authenticated
  using (bucket_id = 'obras-images'
         and public.can_access_obra((storage.foldername(name))[2]));

drop policy if exists obras_img_insert on storage.objects;
create policy obras_img_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'obras-images'
              and public.can_access_obra((storage.foldername(name))[2]));

drop policy if exists obras_img_update on storage.objects;
create policy obras_img_update on storage.objects
  for update to authenticated
  using (bucket_id = 'obras-images'
         and public.can_access_obra((storage.foldername(name))[2]));

drop policy if exists obras_img_delete on storage.objects;
create policy obras_img_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'obras-images'
         and public.can_access_obra((storage.foldername(name))[2]));

-- ── PASSO FINAL — rode SÓ depois de o app com URL assinada estar em produção ──
-- (descomente e execute esta linha por último)
-- update storage.buckets set public = false where id = 'obras-images';

-- ============================================================================
-- Rollback:
--   update storage.buckets set public = true where id = 'obras-images';
--   drop policy if exists obras_img_select on storage.objects;
--   drop policy if exists obras_img_insert on storage.objects;
--   drop policy if exists obras_img_update on storage.objects;
--   drop policy if exists obras_img_delete on storage.objects;
-- ============================================================================
