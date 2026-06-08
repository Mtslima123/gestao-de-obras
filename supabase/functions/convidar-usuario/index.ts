import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ok  = (body: unknown) => new Response(JSON.stringify(body),           { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const err = (msg: string)   => new Response(JSON.stringify({ error: msg }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json();
    const { modo, nome, email, telefone, perfil, status, modulos_ids, abas_ids, obra_ids, password } = body;

    if (!email) return err('email é obrigatório');
    if (!password || password.length < 6) return err('senha deve ter pelo menos 6 caracteres');

    // ── Modo: redefinir senha de usuário existente (pelo admin) ──
    if (modo === 'redefinir-senha') {
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const user = users?.find((u) => u.email === email);
      if (!user) return err('Usuário não encontrado');

      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password });
      if (updateErr) return err(`Erro ao redefinir senha: ${updateErr.message}`);

      await supabaseAdmin
        .from('user_profiles')
        .update({ deve_alterar_senha: true })
        .eq('email', email);

      return ok({ ok: true });
    }

    // ── Modo padrão: criar ou atualizar usuário completo ──
    if (!nome) return err('nome é obrigatório');

    const { data: { users: existentes } } = await supabaseAdmin.auth.admin.listUsers();
    const jaExiste = existentes?.find((u) => u.email === email);

    let authUserId: string;

    if (jaExiste) {
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(jaExiste.id, { password });
      if (updateErr) return err(`Erro ao atualizar senha: ${updateErr.message}`);
      authUserId = jaExiste.id;
    } else {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome, perfil: perfil ?? 'usuario' },
      });
      if (authError) return err(`Erro ao criar usuário: ${authError.message}`);
      authUserId = authData.user.id;
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .upsert([{
        id: authUserId,
        nome,
        email,
        telefone: telefone || null,
        perfil: perfil ?? 'usuario',
        status: status ?? 'ativo',
        modulos_ids: modulos_ids ?? [],
        abas_ids: abas_ids ?? [],
        deve_alterar_senha: true,
        updated_at: new Date().toISOString(),
      }], { onConflict: 'id' })
      .select()
      .single();

    if (profileError) return err(`Erro ao salvar perfil: ${profileError.message}`);

    if (obra_ids && obra_ids.length > 0) {
      await supabaseAdmin.from('user_obras').delete().eq('user_id', authUserId);
      await supabaseAdmin
        .from('user_obras')
        .insert(obra_ids.map((obra_id: string) => ({ user_id: authUserId, obra_id })));
    }

    return ok({ data: profile });
  } catch (e) {
    return err(e.message ?? 'Erro interno');
  }
});
