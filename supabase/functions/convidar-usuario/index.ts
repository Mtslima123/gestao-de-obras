import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { nome, email, telefone, perfil, status, modulos_ids, abas_ids, obra_ids } =
      await req.json();

    if (!nome || !email) {
      return new Response(JSON.stringify({ error: 'nome e email são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Envia convite por e-mail — cria conta em auth.users
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { nome, perfil: perfil ?? 'usuario' },
      });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authUserId = authData.user.id;

    // Cria perfil usando o mesmo ID do auth user (necessário para o RLS: auth.uid() = id)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .insert([{
        id: authUserId,
        nome,
        email,
        telefone: telefone || null,
        perfil: perfil ?? 'usuario',
        status: status ?? 'ativo',
        modulos_ids: modulos_ids ?? [],
        abas_ids: abas_ids ?? [],
      }])
      .select()
      .single();

    if (profileError) {
      // Reverte o auth user se o perfil falhar para não deixar estado inconsistente
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Vincula obras atomicamente junto com a criação
    if (obra_ids && obra_ids.length > 0) {
      await supabaseAdmin
        .from('user_obras')
        .insert(obra_ids.map((obra_id: string) => ({ user_id: authUserId, obra_id })));
    }

    return new Response(JSON.stringify({ data: profile }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
