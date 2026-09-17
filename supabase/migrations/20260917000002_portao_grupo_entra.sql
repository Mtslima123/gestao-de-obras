-- Portão de entrada via grupo do Entra (item 1) — QUEM ENTRA é decidido aqui, não pelo
-- Microsoft Graph (sem credencial corporativa neste Supabase pessoal). O grupo já
-- precisa estar chegando no token (groups claim, "Groups assigned to the application")
-- ANTES desta migration ser aplicada — confira antes com:
--
--   select u.email, i.identity_data->'custom_claims'->'groups'
--   from auth.identities i join auth.users u on u.id = i.user_id;
--
-- Se o GUID f9e6ce01-e343-4b73-99f0-b238a6dbab9a não aparecer aí pra NENHUM usuário
-- ainda, NÃO aplique esta migration — has_app_access() sempre voltaria falso e
-- bloquearia todo mundo (mesma classe de incidente já vivida com o scope de login).

CREATE OR REPLACE FUNCTION public.has_app_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = auth.uid()
      AND (i.identity_data->'custom_claims'->'groups') ? 'f9e6ce01-e343-4b73-99f0-b238a6dbab9a'
  );
$$;

-- ─── Ponto único: patch nas 6 funções SECURITY DEFINER que a maioria das policies já
-- chama. Cobre cronogramas/obras/fotos/medições/orçamentos/pavimentos/notificações/
-- task_attachments/task_history por tabela ao mesmo tempo, sem precisar tocar em cada
-- policy que já usa uma dessas.
CREATE OR REPLACE FUNCTION public.can_access_obra(p_obra text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  select public.has_app_access() and exists (
    select 1
    from public.user_profiles p
    left join public.user_obras uo on uo.user_id = p.id
    where p.status = 'ativo'
      and p.email = (select email from auth.users where id = auth.uid())
      and (p.perfil = 'admin' or uo.obra_id = p_obra)
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_obra(p_obra_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  select public.has_app_access() and exists (
    select 1
    from user_obras uo
    join user_profiles up on up.id = uo.user_id
    where up.email = auth.email()
      and uo.obra_id = p_obra_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  SELECT public.has_app_access() AND EXISTS (
    SELECT 1 FROM user_profiles
    WHERE email = auth.email() AND perfil = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  select p.id from public.user_profiles p
  where public.has_app_access()
    and p.status = 'ativo'
    and p.email = (select email from auth.users where id = auth.uid())
  limit 1;
$$;

CREATE OR REPLACE FUNCTION public.is_module_readonly(p_module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  select public.has_app_access() and exists (
    select 1 from public.user_profiles up
    where up.email = auth.email()
      and up.perfil <> 'admin'
      and p_module = any (coalesce(up.modulos_readonly_ids, '{}'::text[]))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_aba_readonly(p_module text, p_aba text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  select public.is_module_readonly(p_module)
    or (public.has_app_access() and exists (
      select 1 from public.user_profiles up
      where up.email = auth.email()
        and up.perfil <> 'admin'
        and coalesce(up.abas_readonly_ids, '[]'::jsonb) ? (p_module || '.' || p_aba)
    ));
$$;

-- ─── Policies que NÃO passam por nenhuma das 6 funções acima — checagem direta de
-- posse (obras.user_id = auth.uid(), um modelo mais antigo de "dono único da obra") ou
-- outro caminho igualmente direto. Cada uma recebe "has_app_access() AND (...)" por
-- cima da condição original, sem mudar o resto da regra de negócio.

ALTER POLICY audit_criticos_visto_own ON public.audit_criticos_visto
  USING (public.has_app_access() AND (auth.uid() = user_id))
  WITH CHECK (public.has_app_access() AND (auth.uid() = user_id));

ALTER POLICY audit_logs_insert_own ON public.audit_logs
  WITH CHECK (public.has_app_access() AND (user_id = auth.uid()));

ALTER POLICY cronogramas_own ON public.cronogramas
  USING (public.has_app_access() AND (EXISTS (
    SELECT 1 FROM obras WHERE obras.id = cronogramas.obra_id AND obras.user_id = auth.uid()
  )))
  WITH CHECK (public.has_app_access() AND (EXISTS (
    SELECT 1 FROM obras WHERE obras.id = cronogramas.obra_id AND obras.user_id = auth.uid()
  )));

ALTER POLICY estimativas_base_select_authed ON public.estimativas_base
  USING (public.has_app_access() AND (auth.role() = 'authenticated'));

ALTER POLICY fluxo_layouts_delete_own ON public.fluxo_layouts
  USING (public.has_app_access() AND (auth.uid() = user_id));
ALTER POLICY fluxo_layouts_insert_own ON public.fluxo_layouts
  WITH CHECK (public.has_app_access() AND (auth.uid() = user_id));
ALTER POLICY fluxo_layouts_select_own ON public.fluxo_layouts
  USING (public.has_app_access() AND (auth.uid() = user_id));
ALTER POLICY fluxo_layouts_update_own ON public.fluxo_layouts
  USING (public.has_app_access() AND (auth.uid() = user_id));

ALTER POLICY fotos_obra_own ON public.fotos_obra
  USING (public.has_app_access() AND (EXISTS (
    SELECT 1 FROM obras WHERE obras.id = fotos_obra.obra_id AND obras.user_id = auth.uid()
  )))
  WITH CHECK (public.has_app_access() AND (EXISTS (
    SELECT 1 FROM obras WHERE obras.id = fotos_obra.obra_id AND obras.user_id = auth.uid()
  )));

ALTER POLICY ia_interacoes_own ON public.ia_interacoes
  USING (public.has_app_access() AND (auth.uid() = usuario_id));

ALTER POLICY medicoes_mensais_own ON public.medicoes_mensais
  USING (public.has_app_access() AND (EXISTS (
    SELECT 1 FROM obras WHERE obras.id = medicoes_mensais.obra_id AND obras.user_id = auth.uid()
  )))
  WITH CHECK (public.has_app_access() AND (EXISTS (
    SELECT 1 FROM obras WHERE obras.id = medicoes_mensais.obra_id AND obras.user_id = auth.uid()
  )));

ALTER POLICY obras_own ON public.obras
  USING (public.has_app_access() AND ((auth.uid() = user_id) OR is_current_user_admin()))
  WITH CHECK (public.has_app_access() AND ((auth.uid() = user_id) OR is_current_user_admin()));

ALTER POLICY orcamento_itens_own_insert ON public.orcamento_itens
  WITH CHECK (public.has_app_access() AND (EXISTS (
    SELECT 1 FROM orcamentos o WHERE o.id = orcamento_itens.orcamento_id AND o.user_id = auth.uid()
  )));
ALTER POLICY orcamento_itens_own_update ON public.orcamento_itens
  USING (public.has_app_access() AND (EXISTS (
    SELECT 1 FROM orcamentos o WHERE o.id = orcamento_itens.orcamento_id AND o.user_id = auth.uid() AND user_has_obra(o.obra_id)
  )))
  WITH CHECK (public.has_app_access() AND (EXISTS (
    SELECT 1 FROM orcamentos o WHERE o.id = orcamento_itens.orcamento_id AND o.user_id = auth.uid() AND user_has_obra(o.obra_id)
  )));

ALTER POLICY orcamentos_own_insert ON public.orcamentos
  WITH CHECK (public.has_app_access() AND (auth.uid() = user_id));
ALTER POLICY orcamentos_own_update ON public.orcamentos
  USING (public.has_app_access() AND ((auth.uid() = user_id) AND user_has_obra(obra_id)))
  WITH CHECK (public.has_app_access() AND ((auth.uid() = user_id) AND user_has_obra(obra_id)));

ALTER POLICY pavimentos_obra_own ON public.pavimentos_obra
  USING (public.has_app_access() AND (EXISTS (
    SELECT 1 FROM obras WHERE obras.id = pavimentos_obra.obra_id AND obras.user_id = auth.uid()
  )))
  WITH CHECK (public.has_app_access() AND (EXISTS (
    SELECT 1 FROM obras WHERE obras.id = pavimentos_obra.obra_id AND obras.user_id = auth.uid()
  )));

ALTER POLICY user_obras_self_read ON public.user_obras
  USING (public.has_app_access() AND ((EXISTS (
    SELECT 1 FROM user_profiles up WHERE up.id = user_obras.user_id AND up.email = auth.email()
  )) OR is_current_user_admin()));

ALTER POLICY "app_logs insert autenticado" ON public.app_logs
  WITH CHECK (public.has_app_access());

-- task_history_delete e task_history_select/insert já dependem de can_access_obra(...),
-- que acabou de ser patchada acima — não precisam de ALTER POLICY separado.
-- notif_select/update/delete já dependem de current_profile_id(), idem.
-- profiles_self_read/profiles_admin_write e as *_admin_only_delete/*_admin_select/
-- *_admin_update já dependem de is_current_user_admin(), idem.
-- cronogramas_write_access, fotos_obra_write_access, medicoes_mensais_write_access,
-- vinculos_access, pavimentos_obra_write_access já dependem de can_access_obra(...), idem.
-- orcamentos_assigned_select, orcamento_itens_assigned_select, cronogramas_assigned_select,
-- fotos_obra_assigned_select, medicoes_mensais_assigned_select, obras_assigned_select,
-- pavimentos_obra_assigned_select já dependem de user_has_obra(...)/EXISTS com
-- user_has_obra, idem. orcamento_itens_admin_write já depende de is_current_user_admin().
-- cron_ro_*, fotos_ro_*, fotos_aba_ro_*, orc_ro_*, orci_ro_*, pavimentos_obra_ro_*,
-- medicoes_mensais_ro_* já dependem de is_module_readonly()/is_aba_readonly(), idem.
